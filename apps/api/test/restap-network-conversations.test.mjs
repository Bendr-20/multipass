import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import {
  createRestapNetworkConversations,
  normalizeRestapNetworkReply,
} from '../src/restap-network/conversations.js';

const START = Date.UTC(2026, 9, 2, 12);
const HALF_HOUR = 30 * 60_000;
const KEY = Buffer.from('task-11-test-fingerprint-key-32-bytes-minimum');

async function fixture({ filename: existingFilename, now: initialNow = START, pairChurnLimit } = {}) {
  const directory = existingFilename ? null : await mkdtemp(join(tmpdir(), 'restap-network-conversations-'));
  const filename = existingFilename ?? join(directory, 'network.sqlite');
  let now = initialNow;
  let id = 0;
  const store = createRestapNetworkDatabase({ filename });
  const conversations = createRestapNetworkConversations({
    store,
    fingerprintKey: KEY,
    now: () => now,
    createId: (kind) => kind + '-' + String(++id).padStart(6, '0'),
    ...(pairChurnLimit === undefined ? {} : { pairChurnLimit }),
  });
  return {
    directory, filename, store, conversations,
    setNow(value) { now = value; },
    async close({ keep = false } = {}) {
      conversations.close();
      store.close();
      if (directory && !keep) await rm(directory, { recursive: true, force: true });
    },
  };
}

function opening(overrides = {}) {
  return {
    senderTokenId: '3802',
    recipientTokenId: '2431',
    topic: 'general',
    opening: 'What collection story stands out to you?',
    ...overrides,
  };
}

function reply(f, conversationId, speaker, output) {
  const delivery = f.conversations.beginDelivery({ conversationId, speaker });
  return f.conversations.commitDelivery({ conversationId, deliveryId: delivery.deliveryId, output });
}

test('opening plus exactly three replies alternate speakers and stop deterministically', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  assert.equal(opened.turnCount, 1);
  assert.equal(opened.nextSpeaker, 'recipient');
  reply(f, opened.conversationId, 'recipient', 'The portal scenes are unusually memorable.');
  reply(f, opened.conversationId, 'sender', 'The color shifts make those scenes feel alive.');
  const final = reply(f, opened.conversationId, 'recipient', 'Agreed, especially the violet transitions.');
  assert.equal(final.status, 'completed');
  assert.equal(final.terminalClass, 'reply_round_limit');
  assert.equal(final.turnCount, 4);
  assert.equal(final.messages.length, 4);
  assert.throws(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'sender' }), /terminal|completed/i);
});

test('strict alternation rejects a speaker before any delivery is created', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  assert.throws(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'sender' }), /alternation|recipient/i);
  assert.equal(f.conversations.get({ conversationId: opened.conversationId }).turnCount, 1);
});

test('a signed relay initializes its pre-reserved conversation ID instead of creating a second row', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const conversationId = 'conversation-reserved-000001';
  f.store.transaction('reserve_conversation_fixture', (tx) => tx.run(
    'INSERT INTO restap_network_conversations (conversation_id, sender_token_digest, recipient_token_digest, topic, turn_count, next_speaker, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [conversationId, 'a'.repeat(64), 'b'.repeat(64), 'general', 0, 'sender', 'active', START, START, START + HALF_HOUR],
  ));
  const opened = f.conversations.open(opening({ conversationId }));
  assert.equal(opened.conversationId, conversationId);
  assert.equal(opened.turnCount, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_conversations').count, 1);
});

test('message text is non-empty well-formed Unicode and capped at 2,000 UTF-8 bytes', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.throws(() => f.conversations.open(opening({ opening: 'x'.repeat(2_001) })), /2,000|2000|bytes/i);
  assert.throws(() => f.conversations.open(opening({ opening: '🙂'.repeat(501) })), /2,000|2000|bytes/i);
  assert.throws(() => f.conversations.open(opening({ opening: '\ud800' })), /Unicode|well-formed/i);
  const opened = f.conversations.open(opening({ opening: '🙂'.repeat(500) }));
  assert.equal(Buffer.byteLength(opened.messages[0].text), 2_000);
});

test('the immutable hard bounds enforce a 12-message storage ceiling independently of the reply budget', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.deepEqual(f.conversations.limits, Object.freeze({ replyRounds: 3, storedMessages: 12, messageBytes: 2_000, ttlMs: HALF_HOUR, activeDeliveries: 1 }));
  assert.equal(Object.isFrozen(f.conversations.limits), true);
  const opened = f.conversations.open(opening());
  f.store.transaction('test_message_cap', (tx) => tx.run('UPDATE restap_network_conversations SET turn_count = 12 WHERE conversation_id = ?', [opened.conversationId]));
  const stopped = f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' });
  assert.equal(stopped.status, 'completed');
  assert.equal(stopped.terminalClass, 'message_limit');
  assert.equal(stopped.turnCount, 12);
});

test('TTL is exactly 30 minutes and expiry removes all in-memory text', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  f.setNow(START + HALF_HOUR - 1);
  assert.equal(f.conversations.get({ conversationId: opened.conversationId }).messages.length, 1);
  f.setNow(START + HALF_HOUR);
  const expired = f.conversations.get({ conversationId: opened.conversationId });
  assert.equal(expired.status, 'expired');
  assert.equal(expired.terminalClass, 'ttl_expired');
  assert.deepEqual(expired.messages, []);
  assert.throws(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' }), /expired|terminal/i);
});

test('completed and repeated-message conversations purge memory at the absolute TTL', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const completed = f.conversations.open(opening({ opening: 'Completed TTL opening.' }));
  reply(f, completed.conversationId, 'recipient', 'First bounded reply.');
  reply(f, completed.conversationId, 'sender', 'Second bounded reply.');
  reply(f, completed.conversationId, 'recipient', 'Third bounded reply.');
  assert.equal(f.conversations.get({ conversationId: completed.conversationId }).messages.length, 4);
  f.setNow(START + HALF_HOUR);
  const afterTtl = f.conversations.get({ conversationId: completed.conversationId });
  assert.equal(afterTtl.status, 'completed');
  assert.deepEqual(afterTtl.messages, []);

  const g = await fixture({ now: START }); t.after(() => g.close());
  const repeated = g.conversations.open(opening({ opening: 'Repeat at TTL.' }));
  const delivery = g.conversations.beginDelivery({ conversationId: repeated.conversationId, speaker: 'recipient' });
  g.setNow(START + HALF_HOUR);
  assert.throws(() => g.conversations.commitDelivery({ conversationId: repeated.conversationId, deliveryId: delivery.deliveryId, output: ' repeat AT ttl. ' }), /expired/i);
  const expired = g.conversations.get({ conversationId: repeated.conversationId });
  assert.equal(expired.status, 'expired');
  assert.deepEqual(expired.messages, []);
});

test('only one active delivery exists and abort releases it without recording content', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  const active = f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' });
  assert.throws(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' }), /active delivery/i);
  f.conversations.abortDelivery({ conversationId: opened.conversationId, deliveryId: active.deliveryId });
  assert.equal(f.conversations.get({ conversationId: opened.conversationId }).turnCount, 1);
  assert.doesNotThrow(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' }));
});

test('self-conversations and non-canonical or unknown opening fields fail closed', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.throws(() => f.conversations.open(opening({ recipientTokenId: '3802' })), /self/i);
  assert.throws(() => f.conversations.open(opening({ recipientTokenId: '02431' })), /canonical/i);
  assert.throws(() => f.conversations.open(opening({ recipientTokenId: (1n << 256n).toString() })), /uint256|canonical/i);
  assert.throws(() => f.conversations.open({ ...opening(), callback: 'https://private.invalid' }), /unknown|exact/i);
  assert.throws(() => f.conversations.open(Object.assign(Object.create({ inherited: true }), opening())), /plain object/i);
  assert.throws(() => f.conversations.open({ ...opening(), [Symbol('hidden')]: 'private' }), /unknown|exact|symbol/i);
  let getterCalls = 0;
  const accessor = opening();
  Object.defineProperty(accessor, 'opening', { enumerable: true, get() { getterCalls += 1; return 'private'; } });
  assert.throws(() => f.conversations.open(accessor), /accessor|data propert/i);
  assert.equal(getterCalls, 0);
});

test('repeated and cyclic normalized message fingerprints stop without storing the repeated text', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening({ opening: 'A distinct opening thought.' }));
  reply(f, opened.conversationId, 'recipient', 'A different response.');
  const delivery = f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'sender' });
  const stopped = f.conversations.commitDelivery({ conversationId: opened.conversationId, deliveryId: delivery.deliveryId, output: '  A   DISTINCT opening thought. ' });
  assert.equal(stopped.status, 'completed');
  assert.equal(stopped.terminalClass, 'repeated_message');
  assert.equal(stopped.turnCount, 2);
  assert.equal(stopped.messages.length, 2);
});

test('two consecutive low-information acknowledgments stop the loop', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  reply(f, opened.conversationId, 'recipient', 'Okay');
  const stopped = reply(f, opened.conversationId, 'sender', ' thanks! ');
  assert.equal(stopped.status, 'completed');
  assert.equal(stopped.terminalClass, 'low_information_acknowledgments');
  assert.equal(stopped.turnCount, 3);
});

test('rapid ordered-pair conversation churn is bounded by durable keyed pair metadata', async (t) => {
  const f = await fixture({ pairChurnLimit: 3 }); t.after(() => f.close());
  for (let index = 0; index < 3; index += 1) {
    const opened = f.conversations.open(opening({ opening: 'Opening number ' + index }));
    f.conversations.cancel({ conversationId: opened.conversationId, reasonClass: 'blocked' });
  }
  assert.throws(() => f.conversations.open(opening({ opening: 'Fourth rapid opening' })), /pair churn/i);
  f.setNow(START + HALF_HOUR + 1);
  assert.doesNotThrow(() => f.conversations.open(opening({ opening: 'After the churn window' })));
});

test('mute, block, opt-out, and transfer cancel before another delivery and erase text', async (t) => {
  for (const reasonClass of ['muted', 'blocked', 'opted_out', 'transferred']) {
    const f = await fixture(); t.after(() => f.close());
    const opened = f.conversations.open(opening());
    const cancelled = f.conversations.cancel({ conversationId: opened.conversationId, reasonClass });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.terminalClass, reasonClass);
    assert.deepEqual(cancelled.messages, []);
    assert.throws(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' }), /terminal|cancelled/i);
  }
});

test('participant and pair cancellation helpers terminate only matching active conversations', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = f.conversations.open(opening({ senderTokenId: '1', recipientTokenId: '2', opening: 'one-two' }));
  const second = f.conversations.open(opening({ senderTokenId: '3', recipientTokenId: '4', opening: 'three-four' }));
  assert.equal(f.conversations.cancelPair({ senderTokenId: '1', recipientTokenId: '2', reasonClass: 'blocked' }), 1);
  assert.equal(f.conversations.cancelForParticipant({ tokenId: '4', reasonClass: 'transferred' }), 1);
  assert.equal(f.conversations.get({ conversationId: first.conversationId }).terminalClass, 'blocked');
  assert.equal(f.conversations.get({ conversationId: second.conversationId }).terminalClass, 'transferred');
});

test('service restart terminates durable active rows and cannot recover transcript text', async (t) => {
  const f = await fixture();
  const opened = f.conversations.open(opening({ opening: 'RESTART-PRIVATE-TEXT-SENTINEL' }));
  const filename = f.filename;
  f.conversations.close();
  f.store.close();

  const restarted = await fixture({ filename });
  t.after(async () => {
    await restarted.close();
    await rm(f.directory, { recursive: true, force: true });
  });
  const recovered = restarted.conversations.get({ conversationId: opened.conversationId });
  assert.equal(recovered.status, 'terminated_restart');
  assert.equal(recovered.terminalClass, 'restart');
  assert.deepEqual(recovered.messages, []);
});

test('model output is text-only and cannot create intents, schedules, tools, or callbacks', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.equal(normalizeRestapNetworkReply('  useful text\r\n'), 'useful text');
  for (const output of [
    { text: 'hello' },
    { text: 'hello', intent: { cadence: 'daily' } },
    { schedule: 'daily' },
    { tool: 'wallet' },
    { callback: 'https://private.invalid' },
    ['hello'],
  ]) assert.throws(() => normalizeRestapNetworkReply(output), /text-only|string/i);

  const opened = f.conversations.open(opening());
  const delivery = f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' });
  assert.throws(() => f.conversations.commitDelivery({ conversationId: opened.conversationId, deliveryId: delivery.deliveryId, output: { text: 'hello', tool: 'intent.create' } }), /text-only|string/i);
  assert.equal(f.conversations.get({ conversationId: opened.conversationId }).turnCount, 1);
  assert.doesNotThrow(() => f.conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' }));
});

test('all returned content is deeply frozen and mutation cannot alter memory', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const opened = f.conversations.open(opening());
  assert.equal(Object.isFrozen(opened), true);
  assert.equal(Object.isFrozen(opened.messages), true);
  assert.equal(Object.isFrozen(opened.messages[0]), true);
  assert.throws(() => { opened.messages[0].text = 'changed'; }, TypeError);
  assert.equal(f.conversations.get({ conversationId: opened.conversationId }).messages[0].text, opening().opening);
});

test('SQLite and WAL contain only keyed fingerprints and never transcript privacy sentinels', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const sentinel = 'SQLITE-WAL-TRANSCRIPT-PRIVATE-SENTINEL';
  const senderTokenId = '776655443322110099887766';
  const recipientTokenId = '665544332211009988776655';
  const opened = f.conversations.open(opening({ senderTokenId, recipientTokenId, opening: sentinel }));
  reply(f, opened.conversationId, 'recipient', 'SECOND-PRIVATE-REPLY-SENTINEL');
  const bytes = Buffer.concat([await readFile(f.filename), await readFile(f.filename + '-wal').catch(() => Buffer.alloc(0))]);
  for (const privateValue of [sentinel, 'SECOND-PRIVATE-REPLY-SENTINEL', senderTokenId, recipientTokenId]) assert.equal(bytes.includes(Buffer.from(privateValue)), false, privateValue);
  assert.equal(bytes.includes(KEY), false, 'raw fingerprint key');
  const rawHash = createHash('sha256').update(sentinel.toLocaleLowerCase('en-US')).digest('hex');
  assert.equal(bytes.includes(Buffer.from(rawHash)), false, 'canonical unkeyed low-entropy hash');
  const keyedFingerprint = createHmac('sha256', KEY).update('message|' + sentinel.toLocaleLowerCase('en-US')).digest('hex');
  assert.equal(bytes.includes(Buffer.from(keyedFingerprint)), true, 'keyed message fingerprint');
  const row = f.store.readOne('SELECT sender_token_digest, recipient_token_digest, turn_count FROM restap_network_conversations WHERE conversation_id = ?', [opened.conversationId]);
  assert.equal(row.sender_token_digest, createHmac('sha256', KEY).update('participant|' + senderTokenId).digest('hex'));
  assert.equal(row.recipient_token_digest, createHmac('sha256', KEY).update('participant|' + recipientTokenId).digest('hex'));
  assert.equal(Number(row.turn_count), 2);
});

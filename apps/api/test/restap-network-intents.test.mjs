import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkIntentStore } from '../src/restap-network/intents.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 2, 12);
const COLLECTION = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0x2222222222222222222222222222222222222222';
const OWNER = '0x3333333333333333333333333333333333333333';
const CONTROLLER = '0x4444444444444444444444444444444444444444';
const BLOCK = 'a'.repeat(64);
const LEASE = '1'.repeat(32);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-intents-'));
  const filename = join(directory, 'network.sqlite');
  let now = NOW;
  let sequence = 0;
  const authCalls = [];
  const store = createRestapNetworkDatabase({ filename });
  seed(store);
  const intents = createRestapNetworkIntentStore({
    store,
    now: () => now,
    createId: () => 'intent-' + String(++sequence).padStart(12, '0'),
    authenticateConsoleOwner(projection) { authCalls.push(projection); return projection.ownerSession === 'AUTHENTICATED-OWNER-SESSION'; },
  });
  return {
    directory, filename, store, intents, authCalls,
    setNow(value) { now = value; },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

function seed(store) {
  store.transaction('seed_intents', (tx) => {
    tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 7, ACCOUNT, OWNER, CONTROLLER, 100, BLOCK, 100, 0, 'ready', NOW]);
    tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [LEASE, 8453, COLLECTION, '1', 7, ACCOUNT, OWNER, CONTROLLER, NOW - 1, NOW - 1, NOW + 10 * DAY, 'active']);
    tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 7, 3, 1, 1, 1, 10, 30, 5, 63, null, NOW, NOW]);
    for (const peer of ['2', '3', '4']) tx.run('INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 7, 3, peer, 'allow']);
    tx.run('INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 7, 3, '5', 'block']);
  });
}

function authority(overrides = {}) {
  return { chainId: 8453, collection: COLLECTION, tokenId: '1', custodyGeneration: 7, activationLeaseId: LEASE, policyVersion: 3, ...overrides };
}

function createInput(overrides = {}) {
  const runAt = overrides.runAt ?? NOW + 1_000;
  return {
    source: overrides.source ?? 'console_owner',
    ownerSession: overrides.ownerSession ?? 'AUTHENTICATED-OWNER-SESSION',
    authority: overrides.authority ?? authority(),
    intent: {
      peer_token_ids: overrides.peers ?? ['4', '2', '3'],
      topic: overrides.topic ?? 'general',
      cadence: overrides.cadence ?? 'once',
      run_at: new Date(runAt).toISOString(),
      idempotency_key: String(overrides.idempotencyKey ?? 'intent-idempotency-1').padEnd(32, 'x'),
    },
    expiresAt: overrides.expiresAt ?? runAt + DAY,
    attemptLimit: overrides.attemptLimit ?? 3,
  };
}

function acquireInput(intentId, overrides = {}) {
  return {
    intentId,
    authority: overrides.authority ?? authority(),
    peerTokenIds: overrides.peerTokenIds ?? ['2', '3', '4'],
    candidates: overrides.candidates ?? [
      { tokenId: '4', eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['general', 'project-updates'] },
      { tokenId: '2', eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['general'] },
      { tokenId: '3', eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['general'] },
    ],
  };
}

test('creation accepts only freshly authenticated Console owner one-shot or daily intents', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  for (const source of ['model', 'event', 'webhook', 'inbound', 'peer']) assert.throws(() => f.intents.create(createInput({ source, idempotencyKey: source })), /console owner/i);
  assert.throws(() => f.intents.create(createInput({ ownerSession: 'UNAUTHENTICATED' })), /authenticated console owner/i);
  for (const cadence of ['cron', 'hourly', 'PT1H']) assert.throws(() => f.intents.create(createInput({ cadence })), /cadence|intent/i);
  const once = f.intents.create(createInput());
  const daily = f.intents.create(createInput({ cadence: 'daily', idempotencyKey: 'daily-idem' }));
  assert.equal(once.source, 'one_shot');
  assert.equal(daily.source, 'daily');
  assert.equal(f.authCalls.length, 6);
});

test('creation rejects expired schedules, unknown fields, prototypes, unapproved peers and topics', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.throws(() => f.intents.create(createInput({ runAt: NOW - 1 })), /run.at|expired|past/i);
  assert.throws(() => f.intents.create({ ...createInput(), modelPrompt: 'PRIVATE' }), /unknown|exact/i);
  const prototyped = Object.assign(Object.create({ injected: true }), createInput());
  assert.throws(() => f.intents.create(prototyped), /plain|prototype/i);
  assert.throws(() => f.intents.create(createInput({ peers: ['2', '5'], idempotencyKey: 'blocked' })), /approved peer/i);
  assert.throws(() => f.intents.create(createInput({ topic: 'not-approved', idempotencyKey: 'topic' })), /topic/i);
});

test('exact idempotency joins while changed schedule conflicts without duplicate rows', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = f.intents.create(createInput());
  const joined = f.intents.create(createInput());
  assert.equal(joined.intentId, first.intentId);
  assert.equal(joined.joined, true);
  assert.throws(() => f.intents.create(createInput({ peers: ['2'], idempotencyKey: 'intent-idempotency-1' })), /idempotency conflict/i);
  assert.throws(() => f.intents.create(createInput({ cadence: 'daily', idempotencyKey: 'intent-idempotency-1' })), /idempotency conflict/i);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_intents').count, 1);
});

test('explicit peer choices are durably normalized for restart-safe production acquisition', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const intent = f.intents.create(createInput({ peers: ['4', '2', '3'] }));
  assert.deepEqual(
    f.store.readAll('SELECT peer_token_id FROM restap_network_intent_peers WHERE intent_id = ? ORDER BY peer_token_id', [intent.intentId]).map((row) => row.peer_token_id),
    ['2', '3', '4'],
  );
});

test('deterministic sorted round-robin excludes ineligible, blocked, exhausted and active peers', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const intent = f.intents.create(createInput({ cadence: 'daily', expiresAt: NOW + 3 * DAY }));
  f.setNow(NOW + 1_000);
  const candidates = [
    { tokenId: '4', eligible: true, blocked: false, pairExhausted: true, alreadyActive: false, topics: ['general'] },
    { tokenId: '2', eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['general'] },
    { tokenId: '3', eligible: true, blocked: false, pairExhausted: false, alreadyActive: true, topics: ['general'] },
  ];
  const first = f.intents.acquire(acquireInput(intent.intentId, { candidates }));
  assert.deepEqual({ peer: first.peerTokenId, topic: first.topic, cursor: first.selectionCursor }, { peer: '2', topic: 'general', cursor: 1 });
  f.intents.settle({ intentId: intent.intentId, authority: authority(), outcome: 'succeeded' });
  f.setNow(first.nextEligibleAt);
  const second = f.intents.acquire(acquireInput(intent.intentId));
  assert.equal(second.peerTokenId, '3');
  assert.equal(second.selectionCursor, 2);
});

test('peer-set and topic intersections are exact and model output cannot choose work', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const intent = f.intents.create(createInput());
  f.setNow(NOW + 1_000);
  assert.throws(() => f.intents.acquire(acquireInput(intent.intentId, { peerTokenIds: ['2'] })), /peer set/i);
  const noTopic = acquireInput(intent.intentId, { candidates: [{ tokenId: '2', eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['collection-lore'] }] });
  assert.deepEqual(f.intents.acquire(noTopic), { status: 'unavailable' });
  assert.throws(() => f.intents.acquire({ ...acquireInput(intent.intentId), modelChoice: '4' }), /unknown|exact/i);
});

test('changed custody epoch, policy, or lease cancels before acquisition', async (t) => {
  for (const changed of [authority({ custodyGeneration: 8 }), authority({ policyVersion: 4 }), authority({ activationLeaseId: '2'.repeat(32) })]) {
    const f = await fixture(); t.after(() => f.close());
    const intent = f.intents.create(createInput({ idempotencyKey: 'stale-' + changed.activationLeaseId + changed.policyVersion + changed.custodyGeneration }));
    f.setNow(NOW + 1_000);
    const result = f.intents.acquire(acquireInput(intent.intentId, { authority: changed }));
    assert.equal(result.status, 'cancelled');
    assert.equal(f.store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', [intent.intentId]).status, 'cancelled');
  }
});

test('database-side transfer, policy change, or lease revocation makes the intent terminal', async (t) => {
  for (const mutation of ['transfer', 'policy', 'lease']) {
    const f = await fixture(); t.after(() => f.close());
    const intent = f.intents.create(createInput({ idempotencyKey: 'database-stale-' + mutation }));
    f.store.transaction('mutate_' + mutation, (tx) => {
      if (mutation === 'lease') tx.run("UPDATE restap_network_activation_leases SET status = 'revoked', deactivated_at = ? WHERE lease_id = ?", [NOW, LEASE]);
      if (mutation === 'policy') tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 7, 4, 1, 1, 1, 10, 30, 5, 0, null, NOW, NOW]);
      if (mutation === 'transfer') tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, '1', 8, ACCOUNT, OWNER, CONTROLLER, 101, 'b'.repeat(64), 101, 0, 'ready', NOW]);
    });
    f.setNow(NOW + 1_000);
    assert.equal(f.intents.acquire(acquireInput(intent.intentId)).status, 'cancelled');
    assert.throws(() => f.intents.create(createInput({ idempotencyKey: 'database-stale-' + mutation })), /stale|closed/i);
  }
});

test('parallel acquisition yields one occurrence and daily cadence skips missed periods without backfill', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const intent = f.intents.create(createInput({ cadence: 'daily', expiresAt: NOW + 20 * DAY }));
  f.setNow(NOW + 5 * DAY + 1_000);
  const settled = await Promise.allSettled(Array.from({ length: 20 }, () => Promise.resolve().then(() => f.intents.acquire(acquireInput(intent.intentId)))));
  assert.equal(settled.filter((entry) => entry.status === 'fulfilled' && entry.value.status === 'acquired').length, 1);
  const acquired = settled.find((entry) => entry.status === 'fulfilled' && entry.value.status === 'acquired').value;
  assert.equal(acquired.nextEligibleAt, NOW + 6 * DAY + 1_000);
  assert.equal(f.store.readOne('SELECT attempt_count FROM restap_network_intents WHERE intent_id = ?', [intent.intentId]).attempt_count, 1);
});

test('attempt limits exhaust and one-shot success completes terminally', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const one = f.intents.create(createInput({ attemptLimit: 1 }));
  f.setNow(NOW + 1_000);
  f.intents.acquire(acquireInput(one.intentId));
  const exhausted = f.intents.settle({ intentId: one.intentId, authority: authority(), outcome: 'failed' });
  assert.equal(exhausted.status, 'exhausted');

  const two = f.intents.create(createInput({ idempotencyKey: 'second-once' }));
  f.intents.acquire(acquireInput(two.intentId));
  const completed = f.intents.settle({ intentId: two.intentId, authority: authority(), outcome: 'succeeded' });
  assert.equal(completed.status, 'completed');
  assert.throws(() => f.intents.acquire(acquireInput(two.intentId)), /terminal|pending/i);
});

test('SQLite and WAL contain no auth session or private content and restart preserves only durable counters', async (t) => {
  const f = await fixture();
  const intent = f.intents.create(createInput({ ownerSession: 'AUTHENTICATED-OWNER-SESSION' }));
  f.setNow(NOW + 1_000);
  f.intents.acquire(acquireInput(intent.intentId));
  f.store.checkpoint();
  const bytes = await readFile(f.filename);
  for (const sentinel of ['AUTHENTICATED-OWNER-SESSION', 'PRIVATE-PROMPT', 'PRIVATE-REPLY', 'PRIVATE-BODY']) assert.equal(bytes.includes(Buffer.from(sentinel)), false, sentinel);
  f.store.close();
  const reopened = createRestapNetworkDatabase({ filename: f.filename });
  assert.equal(reopened.readOne('SELECT attempt_count FROM restap_network_intents WHERE intent_id = ?', [intent.intentId]).attempt_count, 1);
  reopened.close();
  await rm(f.directory, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createRestapPublicSessionStore } from '../src/restap-public-sessions.js';

function sequenceRng() {
  let value = 0;
  return (size) => {
    assert.equal(size, 32);
    value += 1;
    return Buffer.alloc(size, value);
  };
}

function assertFrozenHistory(session) {
  assert.equal(Object.isFrozen(session), true);
  assert.equal(Object.isFrozen(session.history), true);
  for (const turn of session.history) assert.equal(Object.isFrozen(turn), true);
}

test('mints 256-bit base64url continuity IDs and resolves only known sessions', () => {
  const store = createRestapPublicSessionStore({ now: () => 1_000, randomBytesImpl: sequenceRng() });
  const created = store.create();
  assert.match(created.sessionId, /^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(created.history, []);
  assert.deepEqual(store.resolve(created.sessionId), created);
  assertFrozenHistory(created);
  for (const invalid of ['', 'not-minted', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(43)]) {
    assert.throws(() => store.resolve(invalid), /invalid_session_id/u);
  }
  assert.equal(JSON.stringify(store).includes(created.sessionId), false);
});

test('uses a 30-minute sliding TTL and never creates a caller-chosen namespace', () => {
  let now = 10_000;
  const store = createRestapPublicSessionStore({ now: () => now, randomBytesImpl: sequenceRng() });
  assert.throws(() => store.create({ tokenId: '3801' }), /argument|namespace|metadata/i);
  const session = store.create();
  now += (30 * 60 * 1_000) - 1;
  assert.doesNotThrow(() => store.resolve(session.sessionId));
  now += (30 * 60 * 1_000) - 1;
  assert.doesNotThrow(() => store.resolve(session.sessionId));
  now += (30 * 60 * 1_000) + 1;
  assert.throws(() => store.resolve(session.sessionId), /invalid_session_id/u);
});

test('stores at most 12 bounded turns and returns detached frozen histories', () => {
  const store = createRestapPublicSessionStore({ now: () => 1, randomBytesImpl: sequenceRng() });
  const { sessionId } = store.create();
  for (let index = 0; index < 12; index += 1) {
    const view = store.appendTurn(sessionId, { user: `user-${index}`, assistant: `assistant-${index}` });
    assert.equal(view.history.length, index + 1);
    assertFrozenHistory(view);
  }
  assert.throws(() => store.appendTurn(sessionId, { user: 'overflow', assistant: 'overflow' }), /12|turn/i);
  const bounds = store.create().sessionId;
  assert.throws(() => store.appendTurn(bounds, { user: 'x'.repeat(2_001), assistant: 'ok' }), /2000|2,000|byte/i);
  assert.throws(() => store.appendTurn(bounds, { user: 'ok', assistant: 'x'.repeat(4_097) }), /4096|4,096|byte/i);
  assert.throws(() => store.appendTurn(bounds, { user: 'ok', assistant: 'ok', wallet: '0xabc' }), /unknown|metadata/i);
  const one = store.resolve(sessionId);
  assert.notStrictEqual(one.history, store.resolve(sessionId).history);
  assert.throws(() => { one.history.push({ user: 'bad', assistant: 'bad' }); }, TypeError);
});

test('isolates sessions, evicts oldest expiry, sweeps expired entries, and restarts empty', () => {
  let now = 1_000;
  const store = createRestapPublicSessionStore({ now: () => now, randomBytesImpl: sequenceRng(), maxSessions: 2 });
  const first = store.create();
  now += 10;
  const second = store.create();
  store.appendTurn(first.sessionId, { user: 'first', assistant: 'only first' });
  assert.deepEqual(store.resolve(second.sessionId).history, []);
  now += 10;
  const third = store.create();
  assert.throws(() => store.resolve(first.sessionId), /invalid_session_id/u);
  assert.doesNotThrow(() => store.resolve(second.sessionId));
  assert.doesNotThrow(() => store.resolve(third.sessionId));

  now += (30 * 60 * 1_000) + 1;
  const fourth = store.create();
  assert.throws(() => store.resolve(second.sessionId), /invalid_session_id/u);
  assert.doesNotThrow(() => store.resolve(fourth.sessionId));

  const restarted = createRestapPublicSessionStore({ now: () => now, randomBytesImpl: sequenceRng() });
  assert.throws(() => restarted.resolve(fourth.sessionId), /invalid_session_id/u);
});

test('preserves bounded multiline assistant text for deterministic Codex replies', () => {
  const store = createRestapPublicSessionStore({ now: () => 1, randomBytesImpl: sequenceRng() });
  const { sessionId } = store.create();
  const view = store.appendTurn(sessionId, { user: 'summary', assistant: 'Line one.\n\nLine two.' });
  assert.equal(view.history[0].assistant, 'Line one.\n\nLine two.');
});

test('close clears turns and permanently closes the public store', () => {
  const store = createRestapPublicSessionStore({ now: () => 1, randomBytesImpl: sequenceRng() });
  const { sessionId } = store.create();
  store.appendTurn(sessionId, { user: 'hello', assistant: 'hi' });
  assert.equal(store.close(), undefined);
  assert.equal(store.close(), undefined);
  assert.throws(() => store.resolve(sessionId), /closed/i);
  assert.throws(() => store.create(), /closed/i);
});

test('hostile session and turn values cannot select namespaces or retain prototypes', () => {
  const store = createRestapPublicSessionStore({ now: () => 1, randomBytesImpl: sequenceRng() });
  const { sessionId } = store.create();
  for (const hostile of ['../' + sessionId, '%2F' + sessionId, sessionId + '\u0000', 'Ａ'.repeat(43)]) {
    assert.throws(() => store.resolve(hostile), /invalid_session_id/u);
  }
  const nullTurn = Object.assign(Object.create(null), { user: 'hello', assistant: 'safe' });
  const view = store.appendTurn(sessionId, nullTurn);
  assert.equal(Object.getPrototypeOf(view.history[0]), Object.prototype);
  for (const key of ['wallet', 'cookie', 'owner', 'xmtp', 'namespace']) {
    assert.throws(() => store.appendTurn(sessionId, { user: 'x', assistant: 'y', [key]: 'private' }), /unknown|metadata/i);
  }
});

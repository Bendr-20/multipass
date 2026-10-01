import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { RestapNewsReplayError, createRestapNewsStore } from '../src/restap-news-store.js';

async function withDatabase(run) { const dir = await mkdtemp(join(tmpdir(), 'restap-news-')); const path = join(dir, 'db.sqlite'); try { await run(path); } finally { await rm(dir, { recursive: true, force: true }); } }
function item(index = 1, overrides = {}) { const received = new Date(Date.UTC(2026, 9, 1, 19, index)).toISOString(); return { senderId: 'agent.one', verifiedSigner: '0x1111111111111111111111111111111111111111', canonicalBody: JSON.stringify({ type: 'update', message: 'item-' + index }), bodyHash: String(index).padStart(64, 'a').slice(-64), receivedAt: received, correlationId: null, nonceHash: String(index).padStart(64, 'b').slice(-64), replayExpiresAt: new Date(Date.parse(received) + 300_000).toISOString(), ...overrides }; }

test('adds strict RESTAP tables without changing existing Multipass data', async () => withDatabase(async (path) => {
  const db = new DatabaseSync(path); db.exec("CREATE TABLE existing_data (id INTEGER PRIMARY KEY, value TEXT) STRICT; INSERT INTO existing_data VALUES (1, 'keep');"); db.close();
  const store = createRestapNewsStore({ databasePath: path }); store.close();
  const check = new DatabaseSync(path); assert.deepEqual(check.prepare('SELECT * FROM existing_data').all().map((row) => ({ ...row })), [{ id: 1, value: 'keep' }]);
  const tables = check.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'restap_news_%' ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ['restap_news_items', 'restap_news_nonces']);
  assert.ok(tables.every((row) => /STRICT/u.test(row.sql))); check.close();
}));

test('persists canonical evidence and never stores raw nonce, signature, or secret', async () => withDatabase(async (path) => {
  const store = createRestapNewsStore({ databasePath: path, now: () => Date.parse('2026-10-01T20:00:00.000Z') });
  const accepted = store.accept(item(1)); assert.equal(accepted.itemId, '1'); store.close();
  const db = new DatabaseSync(path); const row = db.prepare('SELECT * FROM restap_news_items').get();
  assert.equal(row.token_id, 3802); assert.equal(row.sender_id, 'agent.one'); assert.equal(row.canonical_body_json, item(1).canonicalBody); assert.equal(row.nonce_hash, item(1).nonceHash);
  const dump = JSON.stringify(row); for (const forbidden of ['raw-nonce', 'signature', 'secret']) assert.equal(dump.includes(forbidden), false); db.close();
}));

test('duplicate sender and nonce is one deterministic replay error across handles', async () => withDatabase(async (path) => {
  const left = createRestapNewsStore({ databasePath: path }); const right = createRestapNewsStore({ databasePath: path });
  left.accept(item(1)); assert.throws(() => right.accept(item(1)), RestapNewsReplayError); left.close(); right.close();
}));

test('rolls back nonce reservation and item on injected failure so retry succeeds', async () => withDatabase(async (path) => {
  let fail = true; const broken = createRestapNewsStore({ databasePath: path, afterNonceReserved() { if (fail) { fail = false; throw new Error('injected'); } } });
  assert.throws(() => broken.accept(item(2)), /unavailable|store/i); broken.close();
  const retry = createRestapNewsStore({ databasePath: path }); assert.equal(retry.accept(item(2)).itemId, '1'); retry.close();
}));

test('lists newest first with opaque cursors, default/max limits, and survives reopen', async () => withDatabase(async (path) => {
  const store = createRestapNewsStore({ databasePath: path }); for (let i = 1; i <= 55; i += 1) store.accept(item(i));
  const first = store.list({ limit: 20 }); assert.equal(first.items.length, 20); assert.equal(first.items[0].canonicalBody.message, 'item-55'); assert.match(first.nextCursor, /^[A-Za-z0-9_-]+$/u);
  const second = store.list({ cursor: first.nextCursor, limit: 50 }); assert.equal(second.items.length, 35); assert.equal(second.items[0].canonicalBody.message, 'item-35');
  assert.throws(() => store.list({ limit: 51 }), /50|limit/i); assert.throws(() => store.list({ cursor: 'bad!', limit: 1 }), /cursor/i); store.close();
  const reopened = createRestapNewsStore({ databasePath: path }); assert.equal(reopened.list({ limit: 1 }).items[0].canonicalBody.message, 'item-55'); reopened.close();
}));

test('rejects token selection, malformed input, and malformed legacy RESTAP schema', async () => withDatabase(async (path) => {
  const store = createRestapNewsStore({ databasePath: path }); assert.throws(() => store.accept({ ...item(1), tokenId: 1 }), /unknown|token/i); store.close();
  const db = new DatabaseSync(path); db.exec('DROP TABLE restap_news_items; CREATE TABLE restap_news_items (bad TEXT);'); db.close();
  assert.throws(() => createRestapNewsStore({ databasePath: path }), /schema/i);
}));

test('retention caps items while keeping unexpired replay records and close is idempotent', async () => withDatabase(async (path) => {
  const now = Date.parse('2026-11-15T00:00:00.000Z'); const store = createRestapNewsStore({ databasePath: path, now: () => now, maxItems: 3, retentionMs: 30 * 24 * 60 * 60 * 1000 });
  for (let i = 1; i <= 4; i += 1) store.accept(item(i, { replayExpiresAt: new Date(now + 300_000).toISOString(), receivedAt: new Date(now - i * 1000).toISOString() }));
  assert.equal(store.list({ limit: 50 }).items.length, 3); assert.throws(() => store.accept(item(1, { replayExpiresAt: new Date(now + 300_000).toISOString() })), RestapNewsReplayError);
  assert.equal(store.close(), undefined); assert.equal(store.close(), undefined);
}));

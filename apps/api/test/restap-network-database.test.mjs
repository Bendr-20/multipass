import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createRestapNetworkDatabase, RESTAP_NETWORK_TABLES } from '../src/restap-network/database.js';

const EXPECTED_TABLES = [
  'restap_network_activation_leases', 'restap_network_audit_events', 'restap_network_circuit_breakers',
  'restap_network_concurrency_leases', 'restap_network_conversations', 'restap_network_custody_epochs',
  'restap_network_deliveries', 'restap_network_idempotency_keys', 'restap_network_intents',
  'restap_network_key_registry', 'restap_network_operation_events', 'restap_network_operations',
  'restap_network_owner_policies', 'restap_network_policy_peers', 'restap_network_quota_buckets',
  'restap_network_replay_nonces', 'restap_network_worker_lease',
];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-db-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename, busyTimeoutMs: 250 });
  return { directory, filename, store, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

function seedCustody(tx, { tokenId = '1', generation = 1 } = {}) {
  tx.run(
    'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [8453, '0x' + '1'.repeat(40), tokenId, generation, '0x' + '2'.repeat(40), '0x' + '3'.repeat(40), '0x' + '4'.repeat(40), 100, 'a'.repeat(64), 99, 0, 'ready', 1_000],
  );
}

function seedOperation(tx, operationId = 'operation-one') {
  tx.run(
    'INSERT INTO restap_network_operations (operation_id, operation_kind, status, sender_token_id, recipient_token_id, sender_custody_generation, recipient_custody_generation, sender_lease_id, recipient_lease_id, sender_policy_version, recipient_policy_version, gate_generation, safe_block_number, safe_block_hash, body_digest, reserved_conversations, reserved_messages, reserved_cost_units, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [operationId, 'opening', 'reserved', '1', '2', 1, 1, 'lease-sender', 'lease-recipient', 1, 1, 1, 100, 'a'.repeat(64), 'b'.repeat(64), 1, 1, 10, 1, 1],
  );
}

test('creates the exact additive STRICT schema with foreign keys and WAL', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.deepEqual(RESTAP_NETWORK_TABLES, EXPECTED_TABLES);
  const schema = f.store.readAll("SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'restap_network_%' ORDER BY name");
  assert.deepEqual(schema.map((row) => row.name), EXPECTED_TABLES);
  for (const row of schema) assert.match(row.sql.trim(), /\bSTRICT$/iu, row.name);
  assert.equal(f.store.readOne('PRAGMA foreign_keys').foreign_keys, 1);
  assert.equal(f.store.readOne('PRAGMA busy_timeout').timeout, 250);
  assert.equal(f.store.readOne('PRAGMA journal_mode').journal_mode, 'wal');
});

test('rejects pre-existing schema drift and rolls back newly created network tables', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-db-drift-'));
  const filename = join(directory, 'network.sqlite');
  const raw = new DatabaseSync(filename);
  raw.exec('CREATE TABLE restap_network_custody_epochs (unexpected TEXT) STRICT');
  raw.close();
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.throws(() => createRestapNetworkDatabase({ filename }), /schema drift/i);
  const inspect = new DatabaseSync(filename, { readOnly: true });
  const tables = inspect.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'restap_network_%' ORDER BY name").all();
  inspect.close();
  assert.deepEqual(tables.map((row) => row.name), ['restap_network_custody_epochs']);
});

test('schema contains no transcript, prompt, generated text, grant, signature, raw IP, or body JSON columns', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const banned = /(^message(?:_|$)|message_text|prompt|generated_text|reply_text|transcript|grant_bytes|signature|cookie|ip_address|body_json|canonical_body|private_key)/iu;
  for (const table of RESTAP_NETWORK_TABLES) {
    const columns = f.store.readAll('PRAGMA table_info(' + table + ')');
    for (const column of columns) assert.doesNotMatch(column.name, banned, table + '.' + column.name);
  }
});

test('one synchronous transaction owns writes and nested or async work is rejected', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  f.store.transaction('seed', (tx) => seedCustody(tx));
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 1);
  assert.throws(() => f.store.transaction('outer', () => f.store.transaction('inner', () => {})), /nested/i);
  let resume; let pending; let lateError;
  const gate = new Promise((resolve) => { resume = resolve; });
  assert.throws(() => f.store.transaction('async', (tx) => {
    pending = (async () => {
      await gate;
      try { tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES ('late', 'test', 'ok', 1)"); }
      catch (error) { lateError = error; }
    })();
    return pending;
  }), /synchronous/i);
  resume(); await pending;
  assert.match(lateError?.message ?? '', /inactive/i);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_audit_events').count, 0);
  assert.throws(() => f.store.readOne('INSERT INTO restap_network_audit_events DEFAULT VALUES'), /read-only/i);
  assert.throws(() => f.store.readOne('PRAGMA foreign_keys = OFF'), /read-only/i);
  assert.equal(f.store.readOne('PRAGMA foreign_keys').foreign_keys, 1);
});

test('a failed BEGIN does not poison the connection transaction state', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-db-lock-'));
  const filename = join(directory, 'network.sqlite');
  const first = createRestapNetworkDatabase({ filename, busyTimeoutMs: 0 });
  const second = createRestapNetworkDatabase({ filename, busyTimeoutMs: 0 });
  t.after(async () => { first.close(); second.close(); await rm(directory, { recursive: true, force: true }); });
  first.transaction('hold', (tx) => {
    seedCustody(tx);
    assert.throws(() => second.transaction('contended', () => {}), /locked|busy/iu);
  });
  second.transaction('retry', (tx) => {
    tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES (?, ?, ?, ?)", ['retry', 'test', 'ok', 1]);
  });
  assert.equal(second.readOne('SELECT count(*) AS count FROM restap_network_audit_events').count, 1);
});

test('injected failures roll back every write and a retry commits once', async (t) => {
  let writeStep = 0;
  let failAt = 2;
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-db-fault-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({
    filename,
    faultInjector(event) {
      if (event.phase === 'transaction_write') {
        writeStep += 1;
        if (writeStep === failAt) throw new Error('injected write failure');
      }
    },
  });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  assert.throws(() => store.transaction('fault', (tx) => {
    seedCustody(tx);
    tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES (?, ?, ?, ?)", ['event-one', 'test', 'ok', 1_000]);
  }), /injected write failure/);
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 0);
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_audit_events').count, 0);
  failAt = -1; writeStep = 0;
  store.transaction('retry', (tx) => {
    seedCustody(tx);
    tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES (?, ?, ?, ?)", ['event-one', 'test', 'ok', 1_000]);
  });
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 1);
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_audit_events').count, 1);
});

test('foreign-key failures and callback errors leave no partial state', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.throws(() => f.store.transaction('foreign-key', (tx) => {
    tx.run("INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['lease-one', 8453, '0x' + '1'.repeat(40), '1', 9, '0x' + '2'.repeat(40), '0x' + '3'.repeat(40), '0x' + '4'.repeat(40), 1, 1, 2, 'candidate']);
  }), /foreign key/i);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_activation_leases').count, 0);
  assert.throws(() => f.store.transaction('callback', (tx) => { seedCustody(tx); throw new Error('callback failed'); }), /callback failed/);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 0);
});

test('integrity, bounded counts, WAL size, checkpoint, expiry pruning, and close are safe', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  f.store.transaction('expiring', (tx) => {
    seedCustody(tx);
    seedOperation(tx);
    tx.run("INSERT INTO restap_network_replay_nonces (nonce_digest, operation_id, expires_at, created_at) VALUES (?, ?, ?, ?)", ['a'.repeat(64), 'operation-one', 999, 1]);
    tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at, expires_at) VALUES (?, ?, ?, ?, ?)", ['event-one', 'test', 'ok', 1, 999]);
  });
  const before = f.store.inspect();
  assert.equal(before.integrity, 'ok');
  assert.equal(before.journalMode, 'wal');
  assert.equal(before.counts.restap_network_custody_epochs, 1);
  assert.ok(Number.isSafeInteger(before.walBytes) && before.walBytes >= 0);
  const pruned = f.store.pruneExpired({ now: 1_000 });
  assert.deepEqual(pruned, { replayNonces: 1, idempotencyKeys: 0, concurrencyLeases: 0, activationLeases: 0, intents: 0, conversations: 0, auditEvents: 1 });
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_custody_epochs').count, 1);
  assert.deepEqual(f.store.checkpoint(), { busy: 0, log: 0, checkpointed: 0 });
  f.store.close();
  f.store.close();
  assert.throws(() => f.store.inspect(), /closed/i);
});

import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const RESTAP_NETWORK_TABLES = Object.freeze([
  'restap_network_activation_leases',
  'restap_network_audit_events',
  'restap_network_circuit_breakers',
  'restap_network_concurrency_leases',
  'restap_network_conversations',
  'restap_network_custody_epochs',
  'restap_network_deliveries',
  'restap_network_idempotency_keys',
  'restap_network_intents',
  'restap_network_key_registry',
  'restap_network_operation_events',
  'restap_network_operations',
  'restap_network_owner_policies',
  'restap_network_policy_peers',
  'restap_network_quota_buckets',
  'restap_network_replay_nonces',
  'restap_network_worker_lease',
]);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS restap_network_custody_epochs (
    chain_id INTEGER NOT NULL CHECK (chain_id > 0),
    collection TEXT NOT NULL CHECK (length(collection) = 42),
    token_id TEXT NOT NULL CHECK (length(token_id) BETWEEN 1 AND 78),
    generation INTEGER NOT NULL CHECK (generation >= 0),
    canonical_account TEXT NOT NULL CHECK (length(canonical_account) = 42),
    owner_address TEXT NOT NULL CHECK (length(owner_address) = 42),
    controller_address TEXT NOT NULL CHECK (length(controller_address) = 42),
    safe_block_number INTEGER NOT NULL CHECK (safe_block_number >= 0),
    safe_block_hash TEXT NOT NULL CHECK (length(safe_block_hash) = 64),
    event_block_number INTEGER NOT NULL CHECK (event_block_number >= 0),
    event_log_index INTEGER NOT NULL CHECK (event_log_index >= 0),
    status TEXT NOT NULL CHECK (status IN ('ready','disputed','rebuilding','revoked')),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (chain_id, collection, token_id, generation)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_activation_leases (
    lease_id TEXT PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    collection TEXT NOT NULL,
    token_id TEXT NOT NULL,
    custody_generation INTEGER NOT NULL,
    canonical_account TEXT NOT NULL CHECK (length(canonical_account) = 42),
    owner_address TEXT NOT NULL CHECK (length(owner_address) = 42),
    controller_address TEXT NOT NULL CHECK (length(controller_address) = 42),
    issued_at INTEGER NOT NULL CHECK (issued_at >= 0),
    last_renewed_at INTEGER NOT NULL CHECK (last_renewed_at >= issued_at),
    expires_at INTEGER NOT NULL CHECK (expires_at > last_renewed_at),
    status TEXT NOT NULL CHECK (status IN ('candidate','active','deactivated','expired','revoked','disputed')),
    deactivated_at INTEGER,
    FOREIGN KEY (chain_id, collection, token_id, custody_generation)
      REFERENCES restap_network_custody_epochs (chain_id, collection, token_id, generation) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_owner_policies (
    chain_id INTEGER NOT NULL,
    collection TEXT NOT NULL,
    token_id TEXT NOT NULL,
    custody_generation INTEGER NOT NULL,
    policy_version INTEGER NOT NULL CHECK (policy_version >= 0),
    network_enabled INTEGER NOT NULL CHECK (network_enabled IN (0,1)),
    inbound_enabled INTEGER NOT NULL CHECK (inbound_enabled IN (0,1)),
    autonomous_enabled INTEGER NOT NULL CHECK (autonomous_enabled IN (0,1)),
    initiated_daily_limit INTEGER NOT NULL CHECK (initiated_daily_limit BETWEEN 0 AND 10),
    generated_daily_limit INTEGER NOT NULL CHECK (generated_daily_limit BETWEEN 0 AND 30),
    peer_daily_limit INTEGER NOT NULL CHECK (peer_daily_limit BETWEEN 0 AND 5),
    topic_mask INTEGER NOT NULL CHECK (topic_mask BETWEEN 0 AND 63),
    mute_until INTEGER,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    PRIMARY KEY (chain_id, collection, token_id, custody_generation, policy_version),
    FOREIGN KEY (chain_id, collection, token_id, custody_generation)
      REFERENCES restap_network_custody_epochs (chain_id, collection, token_id, generation) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_policy_peers (
    chain_id INTEGER NOT NULL,
    collection TEXT NOT NULL,
    token_id TEXT NOT NULL,
    custody_generation INTEGER NOT NULL,
    policy_version INTEGER NOT NULL,
    peer_token_id TEXT NOT NULL,
    relation TEXT NOT NULL CHECK (relation IN ('allow','block')),
    PRIMARY KEY (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation),
    FOREIGN KEY (chain_id, collection, token_id, custody_generation, policy_version)
      REFERENCES restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_intents (
    intent_id TEXT PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    collection TEXT NOT NULL,
    token_id TEXT NOT NULL,
    custody_generation INTEGER NOT NULL,
    activation_lease_id TEXT NOT NULL,
    policy_version INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('one_shot','daily')),
    topic TEXT NOT NULL,
    peer_set_digest TEXT NOT NULL CHECK (length(peer_set_digest) = 64),
    selection_cursor INTEGER NOT NULL DEFAULT 0 CHECK (selection_cursor >= 0),
    idempotency_key TEXT NOT NULL,
    earliest_at INTEGER NOT NULL CHECK (earliest_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at > earliest_at),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    attempt_limit INTEGER NOT NULL CHECK (attempt_limit > 0),
    next_eligible_at INTEGER NOT NULL CHECK (next_eligible_at >= earliest_at),
    status TEXT NOT NULL CHECK (status IN ('pending','leased','completed','cancelled','expired','exhausted')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (chain_id, collection, token_id, custody_generation, idempotency_key),
    FOREIGN KEY (activation_lease_id) REFERENCES restap_network_activation_leases (lease_id) ON DELETE RESTRICT,
    FOREIGN KEY (chain_id, collection, token_id, custody_generation, policy_version)
      REFERENCES restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_worker_lease (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    holder_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL CHECK (acquired_at >= 0),
    renewed_at INTEGER NOT NULL CHECK (renewed_at >= acquired_at),
    expires_at INTEGER NOT NULL CHECK (expires_at > renewed_at),
    generation INTEGER NOT NULL CHECK (generation >= 0)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_operations (
    operation_id TEXT PRIMARY KEY,
    intent_id TEXT,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('discovery','opening','reply','finalize')),
    status TEXT NOT NULL CHECK (status IN ('reserved','provider_dispatched','committed','released','charged_unknown','cancelled_charged','failed_charged')),
    sender_token_id TEXT NOT NULL,
    recipient_token_id TEXT NOT NULL CHECK (recipient_token_id <> sender_token_id),
    sender_custody_generation INTEGER NOT NULL CHECK (sender_custody_generation >= 0),
    recipient_custody_generation INTEGER NOT NULL CHECK (recipient_custody_generation >= 0),
    sender_lease_id TEXT NOT NULL,
    recipient_lease_id TEXT NOT NULL,
    sender_policy_version INTEGER NOT NULL CHECK (sender_policy_version >= 0),
    recipient_policy_version INTEGER NOT NULL CHECK (recipient_policy_version >= 0),
    gate_generation INTEGER NOT NULL CHECK (gate_generation >= 0),
    safe_block_number INTEGER NOT NULL CHECK (safe_block_number >= 0),
    safe_block_hash TEXT NOT NULL CHECK (length(safe_block_hash) = 64),
    body_digest TEXT NOT NULL CHECK (length(body_digest) = 64),
    reserved_conversations INTEGER NOT NULL CHECK (reserved_conversations BETWEEN 0 AND 1),
    reserved_messages INTEGER NOT NULL CHECK (reserved_messages BETWEEN 0 AND 1),
    reserved_cost_units INTEGER NOT NULL CHECK (reserved_cost_units >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    provider_dispatched_at INTEGER,
    terminal_at INTEGER,
    FOREIGN KEY (intent_id) REFERENCES restap_network_intents (intent_id) ON DELETE SET NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_operation_events (
    event_id INTEGER PRIMARY KEY,
    operation_id TEXT NOT NULL,
    transition TEXT NOT NULL,
    status_class TEXT NOT NULL,
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
    FOREIGN KEY (operation_id) REFERENCES restap_network_operations (operation_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_quota_buckets (
    bucket_id TEXT PRIMARY KEY,
    scope_class TEXT NOT NULL CHECK (scope_class IN ('token','ordered_pair','global','provider')),
    scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
    bucket_start INTEGER NOT NULL CHECK (bucket_start >= 0),
    bucket_end INTEGER NOT NULL CHECK (bucket_end > bucket_start),
    used_units INTEGER NOT NULL DEFAULT 0 CHECK (used_units >= 0),
    reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
    limit_units INTEGER NOT NULL CHECK (limit_units >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    UNIQUE (scope_class, scope_digest, bucket_start, bucket_end)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_concurrency_leases (
    lease_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
    acquired_at INTEGER NOT NULL CHECK (acquired_at >= 0),
    renewed_at INTEGER NOT NULL CHECK (renewed_at >= acquired_at),
    expires_at INTEGER NOT NULL CHECK (expires_at > renewed_at),
    FOREIGN KEY (operation_id) REFERENCES restap_network_operations (operation_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_replay_nonces (
    nonce_digest TEXT PRIMARY KEY CHECK (length(nonce_digest) = 64),
    operation_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    FOREIGN KEY (operation_id) REFERENCES restap_network_operations (operation_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_idempotency_keys (
    scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
    idempotency_digest TEXT NOT NULL CHECK (length(idempotency_digest) = 64),
    body_digest TEXT NOT NULL CHECK (length(body_digest) = 64),
    operation_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (scope_digest, idempotency_digest),
    FOREIGN KEY (operation_id) REFERENCES restap_network_operations (operation_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_conversations (
    conversation_id TEXT PRIMARY KEY,
    sender_token_digest TEXT NOT NULL CHECK (length(sender_token_digest) = 64),
    recipient_token_digest TEXT NOT NULL CHECK (length(recipient_token_digest) = 64),
    topic TEXT NOT NULL,
    turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count BETWEEN 0 AND 12),
    next_speaker TEXT NOT NULL CHECK (next_speaker IN ('sender','recipient')),
    status TEXT NOT NULL CHECK (status IN ('active','completed','cancelled','expired','terminated_restart')),
    terminal_class TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_deliveries (
    conversation_id TEXT NOT NULL,
    delivery_sequence INTEGER NOT NULL CHECK (delivery_sequence >= 0),
    operation_id TEXT NOT NULL UNIQUE,
    speaker_class TEXT NOT NULL CHECK (speaker_class IN ('sender','recipient')),
    content_digest TEXT NOT NULL CHECK (length(content_digest) = 64),
    committed_at INTEGER NOT NULL CHECK (committed_at >= 0),
    delivered_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('committed','delivered','suppressed')),
    PRIMARY KEY (conversation_id, delivery_sequence),
    FOREIGN KEY (conversation_id) REFERENCES restap_network_conversations (conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES restap_network_operations (operation_id) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_key_registry (
    key_id TEXT PRIMARY KEY,
    algorithm TEXT NOT NULL CHECK (algorithm = 'Ed25519'),
    public_key BLOB NOT NULL,
    activates_at INTEGER NOT NULL CHECK (activates_at >= 0),
    not_before INTEGER NOT NULL CHECK (not_before >= activates_at),
    not_after INTEGER NOT NULL CHECK (not_after > not_before),
    status TEXT NOT NULL CHECK (status IN ('signing','overlap','retired','compromised')),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_circuit_breakers (
    breaker_id TEXT PRIMARY KEY,
    scope_class TEXT NOT NULL CHECK (scope_class IN ('global','collection','token','ordered_pair','provider')),
    scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
    state TEXT NOT NULL CHECK (state IN ('closed','open','half_open')),
    generation INTEGER NOT NULL CHECK (generation >= 0),
    reason_class TEXT,
    opened_at INTEGER,
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    UNIQUE (scope_class, scope_digest)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS restap_network_audit_events (
    event_id TEXT PRIMARY KEY,
    event_class TEXT NOT NULL,
    status_class TEXT NOT NULL,
    subject_digest TEXT CHECK (subject_digest IS NULL OR length(subject_digest) = 64),
    topic_class TEXT,
    duration_bucket TEXT,
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
    expires_at INTEGER
  ) STRICT`,
];

const EXPECTED_SCHEMA = new Map(SCHEMA.map((statement) => {
  const table = statement.match(/^CREATE TABLE IF NOT EXISTS (restap_network_[a-z0-9_]+)/iu)?.[1];
  if (!table) throw new Error('Invalid RESTAP network schema statement.');
  return [table, normalizeSchemaSql(statement)];
}));

const READ_STATEMENT = /^\s*SELECT\b/iu;
const READ_PRAGMA = /^\s*PRAGMA\s+(?:(?:foreign_keys|busy_timeout|journal_mode|integrity_check)\s*;?|table_info\(restap_network_[a-z0-9_]+\)\s*;?)\s*$/iu;
const WRITE_STATEMENT = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/iu;

export function createRestapNetworkDatabase({ filename, busyTimeoutMs = 2_000, faultInjector = null } = {}) {
  if (typeof filename !== 'string' || !filename) throw new TypeError('RESTAP network database filename is required.');
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 10_000) throw new TypeError('busyTimeoutMs must be a bounded integer.');
  if (faultInjector !== null && typeof faultInjector !== 'function') throw new TypeError('faultInjector must be a function.');
  const db = new DatabaseSync(filename);
  let closed = false;
  let inTransaction = false;
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA trusted_schema = OFF');
    db.exec('PRAGMA defensive = ON');
    db.exec('PRAGMA busy_timeout = ' + busyTimeoutMs);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of SCHEMA) db.exec(statement);
      assertExactSchema(db);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    db.close();
    throw error;
  }

  function assertOpen() {
    if (closed) throw new Error('RESTAP network database is closed.');
  }

  function prepareRead(sql) {
    assertOpen();
    if (typeof sql !== 'string' || (!READ_STATEMENT.test(sql) && !READ_PRAGMA.test(sql))) throw new TypeError('RESTAP network read API accepts read-only SQL.');
    return db.prepare(sql);
  }

  function call(statement, method, params = []) {
    if (!Array.isArray(params)) throw new TypeError('SQL parameters must be an array.');
    return statement[method](...params);
  }

  const store = {
    transaction(label, work) {
      assertOpen();
      if (typeof label !== 'string' || !/^[a-z0-9_-]{1,64}$/u.test(label)) throw new TypeError('transaction label is invalid.');
      if (typeof work !== 'function') throw new TypeError('transaction work must be a function.');
      if (inTransaction) throw new Error('Nested RESTAP network transaction is forbidden.');
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      let txActive = true;
      let writeStep = 0;
      function assertTransactionActive() {
        if (!txActive || !inTransaction) throw new Error('RESTAP network transaction handle is inactive.');
      }
      const tx = Object.freeze({
        run(sql, params = []) {
          assertTransactionActive();
          if (typeof sql !== 'string' || !WRITE_STATEMENT.test(sql)) throw new TypeError('Transaction run accepts one write statement.');
          writeStep += 1;
          faultInjector?.({ phase: 'transaction_write', label, writeStep, statementClass: sql.trim().split(/\s+/u, 1)[0].toUpperCase() });
          return call(db.prepare(sql), 'run', params);
        },
        get(sql, params = []) { assertTransactionActive(); return call(prepareRead(sql), 'get', params); },
        all(sql, params = []) { assertTransactionActive(); return call(prepareRead(sql), 'all', params); },
      });
      try {
        const result = work(tx);
        if (result && typeof result.then === 'function') throw new TypeError('RESTAP network transaction callback must be synchronous.');
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        txActive = false;
        inTransaction = false;
      }
    },

    readOne(sql, params = []) { return call(prepareRead(sql), 'get', params); },
    readAll(sql, params = []) { return call(prepareRead(sql), 'all', params); },

    inspect() {
      assertOpen();
      const integrityRows = db.prepare('PRAGMA integrity_check').all();
      const integrity = integrityRows.map((row) => row.integrity_check).join(',');
      const counts = {};
      for (const table of RESTAP_NETWORK_TABLES) counts[table] = Number(db.prepare('SELECT count(*) AS count FROM ' + table).get().count);
      let walBytes = 0;
      if (filename !== ':memory:') {
        try { walBytes = statSync(filename + '-wal').size; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
      return Object.freeze({ integrity, journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode, walBytes, counts: Object.freeze(counts) });
    },

    pruneExpired({ now } = {}) {
      assertOpen();
      if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('prune time must be a non-negative integer.');
      return store.transaction('prune_expired', (tx) => ({
        replayNonces: Number(tx.run('DELETE FROM restap_network_replay_nonces WHERE expires_at <= ?', [now]).changes),
        idempotencyKeys: Number(tx.run('DELETE FROM restap_network_idempotency_keys WHERE expires_at <= ?', [now]).changes),
        concurrencyLeases: Number(tx.run('DELETE FROM restap_network_concurrency_leases WHERE expires_at <= ?', [now]).changes),
        activationLeases: Number(tx.run("DELETE FROM restap_network_activation_leases AS lease WHERE expires_at <= ? AND status <> 'active' AND NOT EXISTS (SELECT 1 FROM restap_network_intents AS intent WHERE intent.activation_lease_id = lease.lease_id)", [now]).changes),
        intents: Number(tx.run("DELETE FROM restap_network_intents WHERE expires_at <= ? AND status IN ('completed','cancelled','expired','exhausted')", [now]).changes),
        conversations: Number(tx.run("DELETE FROM restap_network_conversations WHERE expires_at <= ? AND status <> 'active'", [now]).changes),
        auditEvents: Number(tx.run('DELETE FROM restap_network_audit_events WHERE expires_at IS NOT NULL AND expires_at <= ?', [now]).changes),
      }));
    },

    checkpoint() {
      assertOpen();
      const row = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      return Object.freeze({ busy: Number(row.busy), log: Number(row.log), checkpointed: Number(row.checkpointed) });
    },

    close() {
      if (closed) return;
      if (inTransaction) throw new Error('Cannot close RESTAP network database during a transaction.');
      db.close();
      closed = true;
    },
  };

  return Object.freeze(store);
}

function normalizeSchemaSql(sql) {
  return sql
    .replace(/^CREATE TABLE IF NOT EXISTS/iu, 'CREATE TABLE')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function assertExactSchema(db) {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'restap_network_%' ORDER BY name").all();
  if (rows.length !== EXPECTED_SCHEMA.size) throw new Error('RESTAP network schema drift: unexpected table set.');
  for (const row of rows) {
    const expected = EXPECTED_SCHEMA.get(row.name);
    if (!expected || normalizeSchemaSql(row.sql) !== expected) throw new Error('RESTAP network schema drift: ' + row.name + '.');
  }
}

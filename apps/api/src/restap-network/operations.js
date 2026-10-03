import { createHash, createHmac } from 'node:crypto';

const BREAKER_SCOPES = Object.freeze(['global', 'collection', 'token', 'ordered_pair', 'provider']);
const BREAKER_STATES = Object.freeze(['closed', 'half_open', 'open']);
const BREAKER_REASONS = Object.freeze([
  'none', 'cap_overrun', 'database_integrity', 'duplicate_delivery', 'emergency_stop', 'policy_revoked',
  'provider_failure', 'split_brain', 'unknown_charge', 'unknown_key',
]);
const GATES = Object.freeze(['foundation', 'policy', 'discovery', 'initiation', 'replies', 'transcripts', 'pilot', 'ga']);
const OPERATION_KINDS = Object.freeze(['discovery', 'opening', 'reply', 'finalize']);
const OPERATION_STATES = Object.freeze(['reserved', 'provider_dispatched', 'committed', 'released', 'charged_unknown', 'cancelled_charged', 'failed_charged']);
const TRANSITIONS = Object.freeze([
  'reserved', 'reserved->provider_dispatched', 'reserved->released', 'provider_dispatched->charged_unknown',
  'provider_dispatched->cancelled_charged', 'provider_dispatched->failed_charged', 'provider_dispatched->committed',
]);
const GRANT_FAILURES = Object.freeze(['algorithm', 'audience', 'body', 'expired', 'operation', 'path', 'replay', 'signature', 'unknown_key']);

function labels(definition) {
  return Object.freeze(Object.fromEntries(Object.entries(definition).map(([key, values]) => [key, Object.freeze(values)])));
}

export const RESTAP_NETWORK_METRIC_LABELS = Object.freeze({
  restap_queue_age_seconds: labels({ queue: ['intent', 'operation'], status: ['ready', 'stale'] }),
  restap_queue_depth: labels({ queue: ['intent', 'operation'], status: ['pending', 'leased', 'reserved', 'provider_dispatched'] }),
  restap_worker_lease: labels({ state: ['missing', 'held', 'expired'] }),
  restap_operations_total: labels({ kind: OPERATION_KINDS, status: OPERATION_STATES }),
  restap_operation_transitions_total: labels({ transition: TRANSITIONS, status: OPERATION_STATES }),
  restap_reservations: labels({ scope: ['token', 'ordered_pair', 'global', 'provider'], state: ['reserved', 'used'] }),
  restap_reconciliation_lag_seconds: labels({ status: ['ready', 'stale'] }),
  restap_provider_cost_units: labels({ provider: ['primary', 'secondary', 'unknown'], outcome: ['charged', 'unknown'] }),
  restap_provider_timeouts_total: labels({ provider: ['primary', 'secondary', 'unknown'], outcome: ['timeout'] }),
  restap_grant_failures_total: labels({ reason: GRANT_FAILURES }),
  restap_policy_events_total: labels({ event: ['race', 'revocation'] }),
  restap_duplicate_suppression_total: labels({ kind: ['idempotency', 'replay', 'duplicate_delivery'] }),
  restap_breakers: labels({ scope: BREAKER_SCOPES, state: BREAKER_STATES, reason: BREAKER_REASONS }),
  restap_sqlite_health: labels({ signal: ['contention', 'integrity', 'wal', 'backup'], status: ['ok', 'warning', 'failed', 'verified'] }),
  restap_release_gate: labels({ gate: GATES, state: ['off', 'on'] }),
});

export const RESTAP_NETWORK_ALERT_CLASSES = Object.freeze([
  'split_brain', 'post_revocation_delivery', 'duplicate_delivery', 'cap_overrun', 'unknown_key',
  'plaintext_sentinel', 'private_dependency', 'queue_age', 'pilot_unknown_charge', 'budget_80',
  'budget_100', 'database_integrity', 'unexplained_restart',
]);

export function validateRestapNetworkMetric(metric) {
  exactObject(metric, ['labels', 'name', 'value'], 'RESTAP network metric');
  const definition = RESTAP_NETWORK_METRIC_LABELS[metric.name];
  if (!definition) throw new TypeError('RESTAP network metric name is not allowlisted.');
  exactObject(metric.labels, Object.keys(definition), 'RESTAP network metric labels');
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) throw new TypeError('RESTAP network metric value is invalid.');
  const projected = {};
  for (const key of Object.keys(definition).sort()) {
    const value = metric.labels[key];
    if (!definition[key].includes(value)) throw new TypeError('RESTAP network metric label value is not allowlisted.');
    projected[key] = value;
  }
  return deepFreeze({ name: metric.name, labels: projected, value: metric.value });
}

export function createRestapNetworkOperations({ store, now = Date.now, auditKey, auditKeyId } = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readAll !== 'function' || typeof store.inspect !== 'function') throw new TypeError('RESTAP network store is required.');
  if (typeof now !== 'function') throw new TypeError('RESTAP network operations clock must be a function.');
  if (!Buffer.isBuffer(auditKey) || auditKey.length !== 32) throw new TypeError('RESTAP network operations audit key must be 32 bytes.');
  if (typeof auditKeyId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(auditKeyId)) throw new TypeError('RESTAP network operations audit key ID is invalid.');

  function transitionBreaker(input) {
    exactObject(input, ['reason', 'scope', 'state', 'subject'], 'RESTAP network breaker transition');
    if (!BREAKER_SCOPES.includes(input.scope)) throw new TypeError('RESTAP network breaker scope is invalid.');
    if (!BREAKER_STATES.includes(input.state)) throw new TypeError('RESTAP network breaker state is invalid.');
    if (!BREAKER_REASONS.includes(input.reason) || input.reason === 'none') throw new TypeError('RESTAP network breaker reason is invalid.');
    const normalizedSubject = normalizeSubject(input.scope, input.subject);
    const scopeDigest = keyedDigest(auditKey, 'breaker|' + auditKeyId + '|' + input.scope + '|' + normalizedSubject.canonical);
    const timestamp = readTime(now);
    return store.transaction('operations_breaker', (tx) => {
      const previous = tx.get('SELECT generation FROM restap_network_circuit_breakers WHERE scope_class = ? AND scope_digest = ?', [input.scope, scopeDigest]);
      const generation = Number(previous?.generation ?? 0) + 1;
      const released = input.state === 'open' ? releaseMatchingReservations(tx, input.scope, normalizedSubject, timestamp) : 0;
      tx.run(
        'INSERT INTO restap_network_circuit_breakers (breaker_id, scope_class, scope_digest, state, generation, reason_class, opened_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope_class, scope_digest) DO UPDATE SET state = excluded.state, generation = excluded.generation, reason_class = excluded.reason_class, opened_at = excluded.opened_at, updated_at = excluded.updated_at',
        [auditKeyId + ':' + scopeDigest, input.scope, scopeDigest, input.state, generation, input.reason, input.state === 'open' ? timestamp : null, timestamp],
      );
      const eventDigest = keyedDigest(auditKey, 'breaker-event|' + auditKeyId + '|' + scopeDigest + '|' + generation);
      tx.run(
        'INSERT INTO restap_network_audit_events (event_id, event_class, status_class, subject_digest, topic_class, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
        [auditKeyId + ':' + eventDigest, 'breaker_transition', input.state, scopeDigest, input.reason, timestamp],
      );
      return deepFreeze({ scope: input.scope, state: input.state, generation, reason: input.reason, releasedCount: released });
    });
  }

  function readBreakers() {
    return deepFreeze(store.readAll('SELECT scope_class, state, generation, reason_class, updated_at FROM restap_network_circuit_breakers ORDER BY scope_class, scope_digest').map((row) => ({
      scope: row.scope_class, state: row.state, generation: Number(row.generation), reason: row.reason_class ?? 'none', updatedAt: Number(row.updated_at),
    })));
  }

  function createSnapshot(input) {
    exactObject(input, ['duplicateSuppressions', 'grantFailures', 'policyEvents', 'providerCostUnits', 'providerTimeouts', 'queueOldestAt', 'reconciliationUpdatedAt', 'release', 'sqlite'], 'RESTAP network operations snapshot');
    assertNonNegativeInteger(input.queueOldestAt, 'queueOldestAt');
    assertNonNegativeInteger(input.reconciliationUpdatedAt, 'reconciliationUpdatedAt');
    assertNonNegativeInteger(input.providerCostUnits, 'providerCostUnits');
    assertNonNegativeInteger(input.providerTimeouts, 'providerTimeouts');
    exactCounterObject(input.grantFailures, GRANT_FAILURES, 'grantFailures');
    exactCounterObject(input.policyEvents, ['race', 'revocation'], 'policyEvents');
    exactCounterObject(input.duplicateSuppressions, ['idempotency', 'replay', 'duplicate_delivery'], 'duplicateSuppressions');
    exactObject(input.sqlite, ['backup', 'contention'], 'sqlite evidence');
    if (typeof input.sqlite.contention !== 'boolean' || !['verified', 'failed'].includes(input.sqlite.backup)) throw new TypeError('SQLite evidence is invalid.');
    const database = store.inspect();
    const release = normalizeRelease(input.release, database);
    const timestamp = readTime(now);
    const queueAgeSeconds = Math.max(0, Math.floor((timestamp - input.queueOldestAt) / 1_000));
    const reconciliationLagSeconds = Math.max(0, Math.floor((timestamp - input.reconciliationUpdatedAt) / 1_000));
    const metrics = [];
    const add = (name, metricLabels, value) => metrics.push(validateRestapNetworkMetric({ name, labels: metricLabels, value }));

    const intentRows = store.readAll('SELECT status, count(*) AS count FROM restap_network_intents GROUP BY status ORDER BY status');
    const operationRows = store.readAll('SELECT operation_kind, status, count(*) AS count FROM restap_network_operations GROUP BY operation_kind, status ORDER BY operation_kind, status');
    const eventRows = store.readAll('SELECT transition, status_class, count(*) AS count FROM restap_network_operation_events GROUP BY transition, status_class ORDER BY transition, status_class');
    const quotaRows = store.readAll('SELECT scope_class, sum(used_units) AS used, sum(reserved_units) AS reserved FROM restap_network_quota_buckets GROUP BY scope_class ORDER BY scope_class');
    const worker = store.readAll('SELECT expires_at FROM restap_network_worker_lease WHERE singleton = 1')[0];

    add('restap_queue_age_seconds', { queue: 'intent', status: queueAgeSeconds > 600 ? 'stale' : 'ready' }, queueAgeSeconds);
    if (intentRows.length === 0) add('restap_queue_depth', { queue: 'intent', status: 'pending' }, 0);
    for (const row of intentRows.filter((row) => ['pending', 'leased'].includes(row.status))) add('restap_queue_depth', { queue: 'intent', status: row.status }, Number(row.count));
    if (operationRows.length === 0) add('restap_queue_depth', { queue: 'operation', status: 'reserved' }, 0);
    for (const row of operationRows.filter((row) => ['reserved', 'provider_dispatched'].includes(row.status))) add('restap_queue_depth', { queue: 'operation', status: row.status }, Number(row.count));
    add('restap_worker_lease', { state: !worker ? 'missing' : Number(worker.expires_at) <= timestamp ? 'expired' : 'held' }, 1);
    if (operationRows.length === 0) add('restap_operations_total', { kind: 'opening', status: 'reserved' }, 0);
    for (const row of operationRows) add('restap_operations_total', { kind: row.operation_kind, status: row.status }, Number(row.count));
    if (eventRows.length === 0) add('restap_operation_transitions_total', { transition: 'reserved', status: 'reserved' }, 0);
    for (const row of eventRows) add('restap_operation_transitions_total', { transition: row.transition, status: row.status_class }, Number(row.count));
    if (quotaRows.length === 0) add('restap_reservations', { scope: 'global', state: 'reserved' }, 0);
    for (const row of quotaRows) { add('restap_reservations', { scope: row.scope_class, state: 'reserved' }, Number(row.reserved ?? 0)); add('restap_reservations', { scope: row.scope_class, state: 'used' }, Number(row.used ?? 0)); }
    add('restap_reconciliation_lag_seconds', { status: reconciliationLagSeconds > 600 ? 'stale' : 'ready' }, reconciliationLagSeconds);
    add('restap_provider_cost_units', { provider: 'primary', outcome: 'charged' }, input.providerCostUnits);
    add('restap_provider_timeouts_total', { provider: 'primary', outcome: 'timeout' }, input.providerTimeouts);
    for (const reason of GRANT_FAILURES) add('restap_grant_failures_total', { reason }, Number(input.grantFailures[reason] ?? 0));
    for (const event of ['race', 'revocation']) add('restap_policy_events_total', { event }, Number(input.policyEvents[event] ?? 0));
    for (const kind of ['idempotency', 'replay', 'duplicate_delivery']) add('restap_duplicate_suppression_total', { kind }, Number(input.duplicateSuppressions[kind] ?? 0));
    const breakerRows = readBreakers();
    if (breakerRows.length === 0) add('restap_breakers', { scope: 'global', state: 'closed', reason: 'none' }, 0);
    for (const row of breakerRows) add('restap_breakers', { scope: row.scope, state: row.state, reason: BREAKER_REASONS.includes(row.reason) ? row.reason : 'provider_failure' }, 1);
    add('restap_sqlite_health', { signal: 'contention', status: input.sqlite.contention ? 'warning' : 'ok' }, input.sqlite.contention ? 1 : 0);
    add('restap_sqlite_health', { signal: 'integrity', status: database.integrity === 'ok' ? 'ok' : 'failed' }, database.integrity === 'ok' ? 1 : 0);
    add('restap_sqlite_health', { signal: 'wal', status: database.walBytes > 0 ? 'warning' : 'ok' }, Number(database.walBytes));
    add('restap_sqlite_health', { signal: 'backup', status: input.sqlite.backup }, input.sqlite.backup === 'verified' ? 1 : 0);
    for (const gate of GATES) add('restap_release_gate', { gate, state: input.release.gates[gate] ? 'on' : 'off' }, input.release.gates[gate] ? 1 : 0);
    return deepFreeze({ generatedAt: timestamp, metrics, release });
  }

  function evaluateAlerts(input) {
    const keys = ['budgetLimitUnits', 'budgetUsedUnits', 'capOverruns', 'databaseIntegrity', 'duplicateDeliveries', 'expectedRestartCount', 'pilotUnknownChargeUnits', 'plaintextSentinelHits', 'postRevocationDeliveries', 'privateDependencyCalls', 'queueOldestAgeMs', 'restartCount', 'unknownKeyFailures', 'workerHolders'];
    exactObject(input, keys, 'RESTAP network alert evidence');
    for (const key of keys.filter((key) => key !== 'databaseIntegrity')) assertNonNegativeInteger(input[key], key);
    if (!['ok', 'corrupt'].includes(input.databaseIntegrity)) throw new TypeError('databaseIntegrity is invalid.');
    const alerts = [];
    const add = (alert, severity, observed, threshold) => alerts.push(deepFreeze({ alert, labels: { severity, status: 'firing' }, observed, threshold }));
    if (input.workerHolders > 1) add('split_brain', 'critical', input.workerHolders, 1);
    if (input.postRevocationDeliveries > 0) add('post_revocation_delivery', 'critical', input.postRevocationDeliveries, 0);
    if (input.duplicateDeliveries > 0) add('duplicate_delivery', 'critical', input.duplicateDeliveries, 0);
    if (input.capOverruns > 0) add('cap_overrun', 'critical', input.capOverruns, 0);
    if (input.unknownKeyFailures > 0) add('unknown_key', 'critical', input.unknownKeyFailures, 0);
    if (input.plaintextSentinelHits > 0) add('plaintext_sentinel', 'critical', input.plaintextSentinelHits, 0);
    if (input.privateDependencyCalls > 0) add('private_dependency', 'critical', input.privateDependencyCalls, 0);
    if (input.queueOldestAgeMs > 600_000) add('queue_age', 'warning', input.queueOldestAgeMs, 600_000);
    if (input.pilotUnknownChargeUnits > 0) add('pilot_unknown_charge', 'critical', input.pilotUnknownChargeUnits, 0);
    if (input.budgetLimitUnits > 0 && input.budgetUsedUnits * 100 >= input.budgetLimitUnits * 80) add('budget_80', 'warning', input.budgetUsedUnits, Math.ceil(input.budgetLimitUnits * 0.8));
    if (input.budgetLimitUnits > 0 && input.budgetUsedUnits >= input.budgetLimitUnits) add('budget_100', 'critical', input.budgetUsedUnits, input.budgetLimitUnits);
    if (input.databaseIntegrity !== 'ok') add('database_integrity', 'critical', 1, 0);
    if (input.restartCount !== input.expectedRestartCount) add('unexplained_restart', 'critical', input.restartCount, input.expectedRestartCount);
    return deepFreeze(alerts);
  }

  return Object.freeze({ transitionBreaker, readBreakers, createSnapshot, evaluateAlerts });
}

function normalizeSubject(scope, subject) {
  const schemas = {
    global: [], collection: ['collection'], token: ['tokenId'], ordered_pair: ['recipientTokenId', 'senderTokenId'], provider: ['providerClass'],
  };
  exactObject(subject, schemas[scope], 'RESTAP network breaker subject');
  if (scope === 'global') return { canonical: 'global' };
  if (scope === 'collection') { if (typeof subject.collection !== 'string' || !/^0x[0-9a-f]{40}$/u.test(subject.collection)) throw new TypeError('collection is invalid.'); return { canonical: subject.collection }; }
  if (scope === 'token') { assertTokenId(subject.tokenId); return { canonical: subject.tokenId, tokenId: subject.tokenId }; }
  if (scope === 'ordered_pair') { assertTokenId(subject.senderTokenId); assertTokenId(subject.recipientTokenId); if (subject.senderTokenId === subject.recipientTokenId) throw new TypeError('ordered pair must contain distinct tokens.'); return { canonical: subject.senderTokenId + '|' + subject.recipientTokenId, ...subject }; }
  if (!['primary', 'secondary', 'unknown'].includes(subject.providerClass)) throw new TypeError('providerClass is invalid.');
  return { canonical: subject.providerClass };
}

function releaseMatchingReservations(tx, scope, subject, timestamp) {
  let sql = "SELECT * FROM restap_network_operations WHERE status = 'reserved'";
  const params = [];
  if (scope === 'token') { sql += ' AND (sender_token_id = ? OR recipient_token_id = ?)'; params.push(subject.tokenId, subject.tokenId); }
  if (scope === 'ordered_pair') { sql += ' AND sender_token_id = ? AND recipient_token_id = ?'; params.push(subject.senderTokenId, subject.recipientTokenId); }
  sql += ' ORDER BY operation_id';
  const rows = tx.all(sql, params);
  for (const row of rows) releaseReservation(tx, row, timestamp);
  return rows.length;
}

function releaseReservation(tx, row, timestamp) {
  const start = Math.floor(Number(row.created_at) / 86_400_000) * 86_400_000;
  const quotaItems = [
    ['token', 'generated|' + row.recipient_token_id, 1],
    ['global', 'cost', Number(row.reserved_cost_units)],
  ];
  if (row.operation_kind === 'opening') quotaItems.unshift(['token', 'initiated|' + row.sender_token_id, 1], ['ordered_pair', 'initiated|' + row.sender_token_id + '|' + row.recipient_token_id, 1]);
  for (const [scope, label, units] of quotaItems) {
    const scopeDigest = digest(scope + '|' + label);
    const quota = tx.get('SELECT bucket_id, reserved_units FROM restap_network_quota_buckets WHERE scope_class = ? AND scope_digest = ? AND bucket_start = ?', [scope, scopeDigest, start]);
    if (!quota || Number(quota.reserved_units) < units) throw new Error('RESTAP network reservation accounting conflict.');
    tx.run('UPDATE restap_network_quota_buckets SET reserved_units = reserved_units - ?, updated_at = ? WHERE bucket_id = ?', [units, timestamp, quota.bucket_id]);
  }
  tx.run('DELETE FROM restap_network_concurrency_leases WHERE operation_id = ?', [row.operation_id]);
  tx.run("UPDATE restap_network_operations SET status = 'released', updated_at = ?, terminal_at = ? WHERE operation_id = ? AND status = 'reserved'", [timestamp, timestamp, row.operation_id]);
  tx.run("INSERT INTO restap_network_operation_events (operation_id, transition, status_class, occurred_at) VALUES (?, 'reserved->released', 'released', ?)", [row.operation_id, timestamp]);
}

function normalizeRelease(value, database) {
  exactObject(value, ['gates', 'pid', 'restarts', 'rosterHash', 'sha'], 'release evidence');
  if (typeof value.sha !== 'string' || !/^[0-9a-f]{40}$/u.test(value.sha)) throw new TypeError('release SHA is invalid.');
  assertNonNegativeInteger(value.pid, 'release.pid');
  assertNonNegativeInteger(value.restarts, 'release.restarts');
  if (value.pid === 0) throw new TypeError('release.pid must be positive.');
  if (typeof value.rosterHash !== 'string' || !/^[0-9a-f]{64}$/u.test(value.rosterHash)) throw new TypeError('rosterHash is invalid.');
  exactObject(value.gates, GATES, 'release gates');
  for (const gate of GATES) if (typeof value.gates[gate] !== 'boolean') throw new TypeError('release gate is invalid.');
  return deepFreeze({
    releaseSha: value.sha,
    pid: value.pid,
    restarts: value.restarts,
    gateTuple: GATES.map((gate) => value.gates[gate] ? '1' : '0').join(','),
    rosterHash: value.rosterHash,
    database: { integrity: database.integrity, journalMode: database.journalMode, tableCounts: database.counts, walBytes: Number(database.walBytes) },
  });
}

function exactCounterObject(value, keys, label) {
  if (!isPlainObject(value)) throw new TypeError(label + ' must be a plain object.');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError(label + ' contains unknown fields.');
    assertNonNegativeInteger(value[key], label + '.' + key);
  }
}
function exactObject(value, keys, label) {
  if (!isPlainObject(value)) throw new TypeError(label + ' must be a plain object.');
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(label + ' contains unknown or missing fields.');
}
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function assertTokenId(value) { if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value)) throw new TypeError('tokenId is invalid.'); }
function assertNonNegativeInteger(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' must be a non-negative integer.'); }
function readTime(now) { const value = now(); assertNonNegativeInteger(value, 'operations time'); return value; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function keyedDigest(key, value) { return createHmac('sha256', key).update(value).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }

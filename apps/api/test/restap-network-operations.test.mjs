import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkCoordinator } from '../src/restap-network/coordinator.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import {
  RESTAP_NETWORK_ALERT_CLASSES,
  RESTAP_NETWORK_METRIC_LABELS,
  createRestapNetworkOperations,
  validateRestapNetworkMetric,
} from '../src/restap-network/operations.js';

const HASH = 'a'.repeat(64);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'restap-operations-'));
  const fault = { armed: false };
  const store = createRestapNetworkDatabase({
    filename: join(directory, 'network.sqlite'),
    faultInjector: ({ label, writeStep }) => { if (fault.armed && label === 'operations_breaker' && writeStep === 2) throw new Error('forced breaker crash'); },
  });
  let currentTime = 1_000;
  const coordinator = createRestapNetworkCoordinator({
    store,
    now: () => currentTime,
    createId: (() => { let id = 0; return () => 'opaque-' + String(++id).padStart(16, '0'); })(),
    globalDailyCostLimit: 100,
  });
  const operations = createRestapNetworkOperations({ store, now: () => currentTime, auditKey: Buffer.alloc(32, 9), auditKeyId: 'ops-2026-10' });
  return {
    store, coordinator, operations, fault,
    set now(value) { currentTime = value; },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

function reservation(patch = {}) {
  return {
    conversationId: 'conversation-0000000001',
    costUnits: 4,
    idempotencyKey: 'idempotency-000000001',
    nonce: 'nonce-000000000000001',
    operationKind: 'opening',
    topic: 'general',
    snapshot: {
      bodyHash: HASH,
      gateGeneration: 1,
      recipientCustodyGeneration: 1,
      recipientLeaseId: 'lease-recipient-0001',
      recipientPolicyVersion: 1,
      recipientTokenId: '2',
      safeBlockHash: HASH,
      safeBlockNumber: 100,
      senderCustodyGeneration: 1,
      senderLeaseId: 'lease-sender-000001',
      senderPolicyVersion: 1,
      senderTokenId: '1',
    },
    ...patch,
  };
}

test('metric registry is complete fixed-label and rejects identifiers arbitrary errors and unknown values', () => {
  const required = [
    'restap_queue_age_seconds', 'restap_queue_depth', 'restap_worker_lease', 'restap_operations_total',
    'restap_operation_transitions_total', 'restap_reservations', 'restap_reconciliation_lag_seconds',
    'restap_provider_cost_units', 'restap_provider_timeouts_total', 'restap_grant_failures_total',
    'restap_policy_events_total', 'restap_duplicate_suppression_total', 'restap_breakers',
    'restap_sqlite_health', 'restap_release_gate',
  ];
  assert.deepEqual(Object.keys(RESTAP_NETWORK_METRIC_LABELS).sort(), required.sort());
  assert.deepEqual(validateRestapNetworkMetric({ name: 'restap_breakers', labels: { scope: 'token', state: 'open', reason: 'cap_overrun' }, value: 1 }), {
    name: 'restap_breakers', labels: { reason: 'cap_overrun', scope: 'token', state: 'open' }, value: 1,
  });
  for (const unsafe of [
    { name: 'restap_breakers', labels: { scope: 'token', state: 'open', reason: 'wallet_0x123' }, value: 1 },
    { name: 'restap_breakers', labels: { scope: '617', state: 'open', reason: 'cap_overrun' }, value: 1 },
    { name: 'restap_unknown', labels: {}, value: 1 },
    { name: 'restap_breakers', labels: { scope: 'token', state: 'open', reason: 'cap_overrun', token_id: '617' }, value: 1 },
  ]) assert.throws(() => validateRestapNetworkMetric(unsafe), /metric|label/i);
  assert.doesNotMatch(JSON.stringify(RESTAP_NETWORK_METRIC_LABELS), /token_id|wallet|conversation_id|operation_id|intent_id|message_hash|grant_id|nonce_id|ip_address|policy_json|error_message/iu);
});

test('global collection token pair and provider breakers persist generation and release only matching pre-dispatch work', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = f.coordinator.reserve(reservation());
  const second = f.coordinator.reserve(reservation({
    conversationId: 'conversation-0000000002', idempotencyKey: 'idempotency-000000002', nonce: 'nonce-000000000000002',
    snapshot: { ...reservation().snapshot, senderTokenId: '3', recipientTokenId: '4' },
  }));
  const opened = f.operations.transitionBreaker({ scope: 'token', subject: { tokenId: '1' }, state: 'open', reason: 'cap_overrun' });
  assert.equal(opened.generation, 1);
  assert.equal(opened.releasedCount, 1);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [first.operationId]).status, 'released');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [second.operationId]).status, 'reserved');
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 2, 'emergency disablement retains operation rows');
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_concurrency_leases WHERE operation_id = ?', [first.operationId]).count, 0);
  assert.equal(f.store.readOne('SELECT sum(reserved_units) AS total FROM restap_network_quota_buckets').total, 7);
  const reopened = f.operations.transitionBreaker({ scope: 'token', subject: { tokenId: '1' }, state: 'open', reason: 'policy_revoked' });
  assert.equal(reopened.generation, 2);
  assert.equal(reopened.releasedCount, 0);
  assert.deepEqual(f.operations.readBreakers().map(({ scope, state, generation, reason }) => ({ scope, state, generation, reason })), [
    { scope: 'token', state: 'open', generation: 2, reason: 'policy_revoked' },
  ]);
});

test('collection and provider breakers use keyed subjects and conservatively release network-wide pre-dispatch work', async (t) => {
  for (const breaker of [
    { scope: 'collection', subject: { collection: '0x' + '1'.repeat(40) } },
    { scope: 'provider', subject: { providerClass: 'primary' } },
  ]) {
    const f = await fixture(); t.after(() => f.close());
    f.coordinator.reserve(reservation());
    const result = f.operations.transitionBreaker({ ...breaker, state: 'open', reason: 'provider_failure' });
    assert.equal(result.releasedCount, 1);
    const persisted = f.store.readOne('SELECT breaker_id, scope_digest, scope_class FROM restap_network_circuit_breakers');
    assert.equal(persisted.scope_class, breaker.scope);
    assert.match(persisted.scope_digest, /^[0-9a-f]{64}$/u);
    assert.doesNotMatch(JSON.stringify(persisted), /0x111111|primary/iu);
  }
});

test('breaker transition and reservation release roll back atomically on a forced write failure', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const operation = f.coordinator.reserve(reservation());
  const beforeReserved = f.store.readOne('SELECT sum(reserved_units) AS total FROM restap_network_quota_buckets').total;
  f.fault.armed = true;
  assert.throws(() => f.operations.transitionBreaker({ scope: 'global', subject: {}, state: 'open', reason: 'emergency_stop' }), /forced breaker crash/iu);
  f.fault.armed = false;
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [operation.operationId]).status, 'reserved');
  assert.equal(f.store.readOne('SELECT sum(reserved_units) AS total FROM restap_network_quota_buckets').total, beforeReserved);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_circuit_breakers').count, 0);
});

test('pair breaker does not cancel reversed or unrelated pair while global breaker conservatively releases all remaining reservations', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const a = f.coordinator.reserve(reservation());
  const b = f.coordinator.reserve(reservation({ conversationId: 'conversation-0000000002', idempotencyKey: 'idempotency-000000002', nonce: 'nonce-000000000000002', snapshot: { ...reservation().snapshot, senderTokenId: '2', recipientTokenId: '1' } }));
  const pair = f.operations.transitionBreaker({ scope: 'ordered_pair', subject: { senderTokenId: '1', recipientTokenId: '2' }, state: 'open', reason: 'duplicate_delivery' });
  assert.equal(pair.releasedCount, 1);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [b.operationId]).status, 'reserved');
  const global = f.operations.transitionBreaker({ scope: 'global', subject: {}, state: 'open', reason: 'emergency_stop' });
  assert.equal(global.releasedCount, 1);
});

test('operational snapshot covers required metrics with safe labels and a hash/count-only release snapshot', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  f.coordinator.reserve(reservation());
  const snapshot = f.operations.createSnapshot({
    queueOldestAt: 900, reconciliationUpdatedAt: 950, providerCostUnits: 4, providerTimeouts: 1,
    grantFailures: { unknown_key: 2 }, policyEvents: { race: 1, revocation: 2 },
    duplicateSuppressions: { idempotency: 1, replay: 1, duplicate_delivery: 0 },
    sqlite: { contention: false, backup: 'verified' },
    release: { sha: 'b'.repeat(40), pid: 4242, restarts: 0, gates: { foundation: false, policy: false, discovery: false, initiation: false, replies: false, transcripts: false, pilot: false, ga: false }, rosterHash: HASH },
  });
  const names = new Set(snapshot.metrics.map((entry) => entry.name));
  for (const required of Object.keys(RESTAP_NETWORK_METRIC_LABELS)) assert.equal(names.has(required), true, required);
  for (const metric of snapshot.metrics) assert.deepEqual(validateRestapNetworkMetric(metric), metric);
  assert.deepEqual(snapshot.release, {
    releaseSha: 'b'.repeat(40), pid: 4242, restarts: 0, gateTuple: '0,0,0,0,0,0,0,0', rosterHash: HASH,
    database: { integrity: 'ok', journalMode: 'wal', tableCounts: f.store.inspect().counts, walBytes: f.store.inspect().walBytes },
  });
  assert.equal(Object.isFrozen(snapshot), true);
});

test('alert evidence covers every required safety path at exact thresholds with bounded labels', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const alerts = f.operations.evaluateAlerts({
    workerHolders: 2, postRevocationDeliveries: 1, duplicateDeliveries: 1, capOverruns: 1,
    unknownKeyFailures: 1, plaintextSentinelHits: 1, privateDependencyCalls: 1, queueOldestAgeMs: 600_001,
    pilotUnknownChargeUnits: 1, budgetUsedUnits: 100, budgetLimitUnits: 100, databaseIntegrity: 'corrupt',
    restartCount: 1, expectedRestartCount: 0,
  });
  assert.deepEqual(new Set(alerts.map((entry) => entry.alert)), new Set(RESTAP_NETWORK_ALERT_CLASSES));
  assert.equal(alerts.find((entry) => entry.alert === 'pilot_unknown_charge').threshold, 0);
  assert.equal(alerts.some((entry) => entry.alert === 'budget_80'), true);
  assert.equal(alerts.some((entry) => entry.alert === 'budget_100'), true);
  assert.equal(alerts.every((entry) => Object.keys(entry.labels).every((key) => ['severity', 'status'].includes(key))), true);
  assert.doesNotMatch(JSON.stringify(alerts), /0x[0-9a-f]{40}|conversation-|operation-|intent-|nonce-|PRIVATE_SENTINEL_HIGH_ENTROPY/iu);
});

test('normal evidence remains quiet and exact input schemas reject unknown or secret-bearing fields', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const input = {
    workerHolders: 1, postRevocationDeliveries: 0, duplicateDeliveries: 0, capOverruns: 0,
    unknownKeyFailures: 0, plaintextSentinelHits: 0, privateDependencyCalls: 0, queueOldestAgeMs: 600_000,
    pilotUnknownChargeUnits: 0, budgetUsedUnits: 79, budgetLimitUnits: 100, databaseIntegrity: 'ok',
    restartCount: 0, expectedRestartCount: 0,
  };
  assert.deepEqual(f.operations.evaluateAlerts(input), []);
  assert.throws(() => f.operations.evaluateAlerts({ ...input, tokenId: '617' }), /unknown|fields/i);
  assert.throws(() => f.operations.createSnapshot({ queueOldestAt: 0, reconciliationUpdatedAt: 0, providerCostUnits: 0, providerTimeouts: 0, grantFailures: {}, policyEvents: {}, duplicateSuppressions: {}, sqlite: { contention: false, backup: 'verified' }, release: { sha: 'b'.repeat(40), pid: 1, restarts: 0, gates: {}, rosterHash: HASH }, privateKey: 'secret' }), /unknown|fields/i);
});

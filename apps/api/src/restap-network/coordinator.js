import { createHash, randomUUID } from 'node:crypto';

import { RESTAP_NETWORK_LIMITS, RESTAP_NETWORK_TOPICS } from './constants.js';

const DAY_MS = 86_400_000;
const OPERATION_KINDS = Object.freeze(['discovery', 'opening', 'reply', 'finalize']);
const TERMINAL_STATES = new Set(['committed', 'released', 'charged_unknown', 'cancelled_charged', 'failed_charged']);
const RESERVATION_KEYS = Object.freeze(['conversationId', 'costUnits', 'idempotencyKey', 'nonce', 'operationKind', 'snapshot', 'topic']);
const SNAPSHOT_KEYS = Object.freeze([
  'bodyHash', 'gateGeneration', 'recipientCustodyGeneration', 'recipientLeaseId', 'recipientPolicyVersion',
  'recipientTokenId', 'safeBlockHash', 'safeBlockNumber', 'senderCustodyGeneration', 'senderLeaseId',
  'senderPolicyVersion', 'senderTokenId',
]);

export const RESTAP_NETWORK_OPERATION_TRANSITIONS = Object.freeze({
  reserved: Object.freeze(['provider_dispatched', 'released']),
  provider_dispatched: Object.freeze(['charged_unknown', 'cancelled_charged', 'failed_charged', 'committed']),
  committed: Object.freeze([]),
  released: Object.freeze([]),
  charged_unknown: Object.freeze([]),
  cancelled_charged: Object.freeze([]),
  failed_charged: Object.freeze([]),
});

export function createRestapNetworkCoordinator({
  store,
  now = Date.now,
  createId = () => randomUUID(),
  globalDailyCostLimit,
  reservationTtlMs = 2 * 60_000,
  faultInjector = null,
  quotaLimitResolver = null,
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function') throw new TypeError('RESTAP network store is required.');
  if (typeof now !== 'function' || typeof createId !== 'function') throw new TypeError('Coordinator clocks and IDs must be functions.');
  assertPositiveInteger(globalDailyCostLimit, 'globalDailyCostLimit');
  assertPositiveInteger(reservationTtlMs, 'reservationTtlMs');
  if (faultInjector !== null && typeof faultInjector !== 'function') throw new TypeError('faultInjector must be a function.');
  if (quotaLimitResolver !== null && typeof quotaLimitResolver !== 'function') throw new TypeError('quotaLimitResolver must be a function.');

  function reserve(input) {
    const normalized = validateReservation(input);
    const timestamp = readNow(now);
    const { start, end } = utcDay(timestamp);
    const idempotencyScope = digest('idempotency|' + normalized.operationKind + '|' + normalized.snapshot.senderTokenId);
    const idempotencyDigest = digest('key|' + normalized.idempotencyKey);
    const nonceDigest = digest('nonce|' + normalized.nonce);
    const existing = store.readOne(
      'SELECT body_digest, operation_id, expires_at FROM restap_network_idempotency_keys WHERE scope_digest = ? AND idempotency_digest = ?',
      [idempotencyScope, idempotencyDigest],
    );
    if (existing && Number(existing.expires_at) > timestamp) return joinExisting(existing, normalized.snapshot.bodyHash);

    return store.transaction('coordinator_reserve', (tx) => {
      const raced = tx.get(
        'SELECT body_digest, operation_id, expires_at FROM restap_network_idempotency_keys WHERE scope_digest = ? AND idempotency_digest = ?',
        [idempotencyScope, idempotencyDigest],
      );
      if (raced && Number(raced.expires_at) > timestamp) return joinExisting(raced, normalized.snapshot.bodyHash);
      if (raced) tx.run('DELETE FROM restap_network_idempotency_keys WHERE scope_digest = ? AND idempotency_digest = ?', [idempotencyScope, idempotencyDigest]);
      if (tx.get('SELECT operation_id FROM restap_network_replay_nonces WHERE nonce_digest = ? AND expires_at > ?', [nonceDigest, timestamp])) throw new Error('RESTAP network replay nonce conflict.');

      const activeDelivery = tx.get(
        "SELECT d.operation_id FROM restap_network_deliveries AS d WHERE d.conversation_id = ? AND d.status = 'committed' LIMIT 1",
        [normalized.conversationId],
      );
      if (activeDelivery) throw new Error('RESTAP network active delivery limit reached.');

      const operationId = createOpaqueId(createId, 'operation');
      const ownerLimits = quotaLimitResolver === null ? null : normalizeQuotaLimits(quotaLimitResolver(Object.freeze({
        tx: Object.freeze({ get: tx.get }),
        operationKind: normalized.operationKind,
        snapshot: normalized.snapshot,
      })));
      const quotaReservations = quotaPlan(normalized, start, end, globalDailyCostLimit, ownerLimits);
      for (const quota of quotaReservations) reserveQuota(tx, quota, timestamp);

      const senderScope = digest('concurrency|token|' + normalized.snapshot.senderTokenId);
      const recipientScope = digest('concurrency|token|' + normalized.snapshot.recipientTokenId);
      const conversationScope = digest('concurrency|conversation|' + normalized.conversationId);
      for (const scopeDigest of [senderScope, recipientScope]) {
        const row = tx.get('SELECT count(*) AS count FROM restap_network_concurrency_leases WHERE scope_digest = ? AND expires_at > ?', [scopeDigest, timestamp]);
        if (Number(row.count) >= RESTAP_NETWORK_LIMITS.concurrentPerToken) throw new Error('RESTAP network token concurrency quota exceeded.');
      }
      const activeConversation = tx.get('SELECT count(*) AS count FROM restap_network_concurrency_leases WHERE scope_digest = ? AND expires_at > ?', [conversationScope, timestamp]);
      if (Number(activeConversation.count) >= RESTAP_NETWORK_LIMITS.activeDeliveriesPerConversation) throw new Error('RESTAP network active delivery concurrency exceeded.');

      tx.run(
        'INSERT INTO restap_network_operations (operation_id, operation_kind, status, sender_token_id, recipient_token_id, sender_custody_generation, recipient_custody_generation, sender_lease_id, recipient_lease_id, sender_policy_version, recipient_policy_version, gate_generation, safe_block_number, safe_block_hash, body_digest, reserved_conversations, reserved_messages, reserved_cost_units, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [operationId, normalized.operationKind, 'reserved', normalized.snapshot.senderTokenId, normalized.snapshot.recipientTokenId,
          normalized.snapshot.senderCustodyGeneration, normalized.snapshot.recipientCustodyGeneration,
          normalized.snapshot.senderLeaseId, normalized.snapshot.recipientLeaseId,
          normalized.snapshot.senderPolicyVersion, normalized.snapshot.recipientPolicyVersion,
          normalized.snapshot.gateGeneration, normalized.snapshot.safeBlockNumber, normalized.snapshot.safeBlockHash,
          normalized.snapshot.bodyHash, normalized.operationKind === 'opening' ? 1 : 0, 1, normalized.costUnits, timestamp, timestamp],
      );

      const leaseExpiry = timestamp + reservationTtlMs;
      for (const scopeDigest of [senderScope, recipientScope, conversationScope]) tx.run(
        'INSERT INTO restap_network_concurrency_leases (lease_id, operation_id, scope_digest, acquired_at, renewed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [createOpaqueId(createId, 'concurrency'), operationId, scopeDigest, timestamp, timestamp, leaseExpiry],
      );
      tx.run('INSERT INTO restap_network_replay_nonces (nonce_digest, operation_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [nonceDigest, operationId, timestamp + RESTAP_NETWORK_LIMITS.replayRetentionMs, timestamp]);
      tx.run('INSERT INTO restap_network_idempotency_keys (scope_digest, idempotency_digest, body_digest, operation_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [idempotencyScope, idempotencyDigest, normalized.snapshot.bodyHash, operationId, timestamp + RESTAP_NETWORK_LIMITS.replayRetentionMs, timestamp]);

      const existingConversation = tx.get('SELECT conversation_id FROM restap_network_conversations WHERE conversation_id = ?', [normalized.conversationId]);
      if (!existingConversation) tx.run(
        'INSERT INTO restap_network_conversations (conversation_id, sender_token_digest, recipient_token_digest, topic, turn_count, next_speaker, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [normalized.conversationId, digest('token|' + normalized.snapshot.senderTokenId), digest('token|' + normalized.snapshot.recipientTokenId), normalized.topic, 0, 'sender', 'active', timestamp, timestamp, timestamp + RESTAP_NETWORK_LIMITS.conversationTtlMs],
      );
      tx.run('INSERT INTO restap_network_operation_events (operation_id, transition, status_class, occurred_at) VALUES (?, ?, ?, ?)', [operationId, 'reserved', 'reserved', timestamp]);
      return operationProjection({
        operation_id: operationId, operation_kind: normalized.operationKind, status: 'reserved',
        sender_token_id: normalized.snapshot.senderTokenId, recipient_token_id: normalized.snapshot.recipientTokenId,
        sender_custody_generation: normalized.snapshot.senderCustodyGeneration, recipient_custody_generation: normalized.snapshot.recipientCustodyGeneration,
        sender_lease_id: normalized.snapshot.senderLeaseId, recipient_lease_id: normalized.snapshot.recipientLeaseId,
        sender_policy_version: normalized.snapshot.senderPolicyVersion, recipient_policy_version: normalized.snapshot.recipientPolicyVersion,
        gate_generation: normalized.snapshot.gateGeneration, safe_block_number: normalized.snapshot.safeBlockNumber,
        safe_block_hash: normalized.snapshot.safeBlockHash, body_digest: normalized.snapshot.bodyHash,
        reserved_cost_units: normalized.costUnits, created_at: timestamp,
      }, false);
    });
  }

  function getOperation(operationId) {
    assertOpaqueString(operationId, 'operationId');
    const row = store.readOne('SELECT * FROM restap_network_operations WHERE operation_id = ?', [operationId]);
    if (!row) throw new Error('RESTAP network operation not found.');
    return operationProjection(row, false);
  }

  function markProviderDispatched({ operationId, freshSnapshot } = {}) {
    assertOpaqueString(operationId, 'operationId');
    const fresh = validateSnapshot(freshSnapshot);
    return store.transaction('coordinator_dispatch', (tx) => {
      const row = requireOperation(tx, operationId);
      assertTransition(row.status, 'provider_dispatched');
      if (!snapshotMatches(row, fresh)) return transitionAccounting(tx, row, 'released', readNow(now));
      const timestamp = readNow(now);
      tx.run("UPDATE restap_network_operations SET status = 'provider_dispatched', updated_at = ?, provider_dispatched_at = ? WHERE operation_id = ? AND status = 'reserved'", [timestamp, timestamp, operationId]);
      addEvent(tx, operationId, 'reserved->provider_dispatched', 'provider_dispatched', timestamp);
      return operationProjection({ ...row, status: 'provider_dispatched', updated_at: timestamp, provider_dispatched_at: timestamp }, false);
    });
  }

  async function dispatchProvider({ operationId, freshSnapshot, callProvider } = {}) {
    if (typeof callProvider !== 'function') throw new TypeError('callProvider must be a function.');
    const current = getOperation(operationId);
    if (current.status !== 'reserved') return Object.freeze({ status: current.status === 'committed' ? 'already_committed' : 'already_dispatched', operationId });
    const marked = markProviderDispatched({ operationId, freshSnapshot });
    if (marked.status !== 'provider_dispatched') return marked;
    faultInjector?.({ phase: 'after_dispatch_marker', operationId });
    let result;
    try {
      result = await callProvider();
    } catch (error) {
      markChargedUnknown({ operationId });
      throw error;
    }
    faultInjector?.({ phase: 'after_provider_return', operationId });
    return result;
  }

  function release({ operationId } = {}) {
    return terminalTransition(operationId, 'released');
  }

  function markChargedUnknown({ operationId } = {}) {
    return terminalTransition(operationId, 'charged_unknown');
  }

  function markCancelledCharged({ operationId } = {}) {
    return terminalTransition(operationId, 'cancelled_charged');
  }

  function markFailedCharged({ operationId } = {}) {
    return terminalTransition(operationId, 'failed_charged');
  }

  function terminalTransition(operationId, target) {
    assertOpaqueString(operationId, 'operationId');
    return store.transaction('coordinator_' + target, (tx) => {
      const row = requireOperation(tx, operationId);
      assertTransition(row.status, target);
      return transitionAccounting(tx, row, target, readNow(now));
    });
  }

  function commitAfterRecheck({ operationId, freshSnapshot, contentHash, speakerClass } = {}) {
    assertOpaqueString(operationId, 'operationId');
    const fresh = validateSnapshot(freshSnapshot);
    assertDigest(contentHash, 'contentHash');
    if (!['sender', 'recipient'].includes(speakerClass)) throw new TypeError('speakerClass is invalid.');
    return store.transaction('coordinator_commit', (tx) => {
      const row = requireOperation(tx, operationId);
      if (row.status === 'committed') {
        const delivery = tx.get('SELECT delivery_sequence, content_digest, speaker_class FROM restap_network_deliveries WHERE operation_id = ?', [operationId]);
        if (!delivery || delivery.content_digest !== contentHash || delivery.speaker_class !== speakerClass) throw new Error('RESTAP network committed delivery conflict.');
        return Object.freeze({ status: 'committed', operationId, deliverySequence: Number(delivery.delivery_sequence) });
      }
      assertTransition(row.status, 'committed');
      if (!snapshotMatches(row, fresh)) {
        transitionAccounting(tx, row, 'cancelled_charged', readNow(now));
        return Object.freeze({ status: 'cancelled_charged', operationId });
      }
      const timestamp = readNow(now);
      const conversationId = findConversationId(tx, operationId);
      const active = tx.get("SELECT operation_id FROM restap_network_deliveries WHERE conversation_id = ? AND status = 'committed' LIMIT 1", [conversationId]);
      if (active) throw new Error('RESTAP network active delivery limit reached.');
      const sequenceRow = tx.get('SELECT COALESCE(MAX(delivery_sequence), -1) + 1 AS sequence FROM restap_network_deliveries WHERE conversation_id = ?', [conversationId]);
      const deliverySequence = Number(sequenceRow.sequence);
      tx.run('INSERT INTO restap_network_deliveries (conversation_id, delivery_sequence, operation_id, speaker_class, content_digest, committed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [conversationId, deliverySequence, operationId, speakerClass, contentHash, timestamp, 'committed']);
      tx.run('UPDATE restap_network_conversations SET turn_count = turn_count + 1, next_speaker = ?, updated_at = ? WHERE conversation_id = ?', [speakerClass === 'sender' ? 'recipient' : 'sender', timestamp, conversationId]);
      transitionAccounting(tx, row, 'committed', timestamp);
      return Object.freeze({ status: 'committed', operationId, deliverySequence });
    });
  }

  function markDeliveryDelivered({ operationId } = {}) {
    assertOpaqueString(operationId, 'operationId');
    return store.transaction('coordinator_delivery', (tx) => {
      const row = tx.get('SELECT status FROM restap_network_deliveries WHERE operation_id = ?', [operationId]);
      if (!row) throw new Error('RESTAP network delivery not found.');
      if (row.status === 'delivered') return Object.freeze({ status: 'delivered', operationId });
      if (row.status !== 'committed') throw new Error('RESTAP network delivery transition forbidden.');
      const timestamp = readNow(now);
      tx.run("UPDATE restap_network_deliveries SET status = 'delivered', delivered_at = ? WHERE operation_id = ? AND status = 'committed'", [timestamp, operationId]);
      return Object.freeze({ status: 'delivered', operationId });
    });
  }

  function recoverStaleOperations() {
    const timestamp = readNow(now);
    const stale = store.readAll(
      "SELECT DISTINCT o.operation_id, o.status FROM restap_network_operations AS o JOIN restap_network_concurrency_leases AS lease ON lease.operation_id = o.operation_id WHERE o.status IN ('reserved','provider_dispatched') AND lease.expires_at <= ? ORDER BY o.operation_id",
      [timestamp],
    );
    let released = 0;
    let chargedUnknown = 0;
    for (const row of stale) {
      if (row.status === 'reserved') { release({ operationId: row.operation_id }); released += 1; }
      else { markChargedUnknown({ operationId: row.operation_id }); chargedUnknown += 1; }
    }
    return Object.freeze({ released, chargedUnknown });
  }

  function joinExisting(row, bodyHash) {
    if (row.body_digest !== bodyHash) throw new Error('RESTAP network idempotency conflict: body hash changed.');
    const operation = getOperation(row.operation_id);
    return Object.freeze({ ...operation, joined: true });
  }

  return Object.freeze({
    reserve,
    getOperation,
    markProviderDispatched,
    dispatchProvider,
    release,
    markChargedUnknown,
    markCancelledCharged,
    markFailedCharged,
    commitAfterRecheck,
    markDeliveryDelivered,
    recoverStaleOperations,
  });
}

function validateReservation(input) {
  assertExactObject(input, RESERVATION_KEYS, 'reservation');
  if (!OPERATION_KINDS.includes(input.operationKind)) throw new TypeError('operationKind is invalid.');
  const snapshot = validateSnapshot(input.snapshot);
  assertOpaqueString(input.idempotencyKey, 'idempotencyKey');
  assertOpaqueString(input.nonce, 'nonce');
  assertPositiveInteger(input.costUnits, 'costUnits');
  assertOpaqueString(input.conversationId, 'conversationId');
  if (!RESTAP_NETWORK_TOPICS.includes(input.topic)) throw new TypeError('topic is invalid.');
  return Object.freeze({
    operationKind: input.operationKind,
    snapshot,
    idempotencyKey: input.idempotencyKey,
    nonce: input.nonce,
    costUnits: input.costUnits,
    conversationId: input.conversationId,
    topic: input.topic,
  });
}

function validateSnapshot(value) {
  assertExactObject(value, SNAPSHOT_KEYS, 'snapshot');
  assertTokenId(value.senderTokenId, 'senderTokenId');
  assertTokenId(value.recipientTokenId, 'recipientTokenId');
  if (value.senderTokenId === value.recipientTokenId) throw new TypeError('Snapshot tokens must differ.');
  for (const key of ['senderCustodyGeneration', 'recipientCustodyGeneration', 'senderPolicyVersion', 'recipientPolicyVersion', 'gateGeneration', 'safeBlockNumber']) assertNonNegativeInteger(value[key], key);
  assertOpaqueString(value.senderLeaseId, 'senderLeaseId');
  assertOpaqueString(value.recipientLeaseId, 'recipientLeaseId');
  assertDigest(value.safeBlockHash, 'safeBlockHash');
  assertDigest(value.bodyHash, 'bodyHash');
  return Object.freeze(Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, value[key]])));
}

function quotaPlan(input, start, end, globalDailyCostLimit, ownerLimits = null) {
  const generatedLimit = Math.min(RESTAP_NETWORK_LIMITS.generatedPerTokenDay, ownerLimits?.generatedDailyLimit ?? RESTAP_NETWORK_LIMITS.generatedPerTokenDay);
  const rows = [
    quota('token', 'generated|' + input.snapshot.recipientTokenId, start, end, 1, generatedLimit, 'generated message quota'),
    quota('global', 'cost', start, end, input.costUnits, globalDailyCostLimit, 'cost budget'),
  ];
  if (input.operationKind === 'opening') {
    const initiatedLimit = Math.min(RESTAP_NETWORK_LIMITS.initiatedPerTokenDay, ownerLimits?.initiatedDailyLimit ?? RESTAP_NETWORK_LIMITS.initiatedPerTokenDay);
    const pairLimit = Math.min(RESTAP_NETWORK_LIMITS.initiatedPerOrderedPairDay, ownerLimits?.peerDailyLimit ?? RESTAP_NETWORK_LIMITS.initiatedPerOrderedPairDay);
    rows.unshift(quota('token', 'initiated|' + input.snapshot.senderTokenId, start, end, 1, initiatedLimit, 'initiation quota'));
    rows.splice(1, 0, quota('ordered_pair', 'initiated|' + input.snapshot.senderTokenId + '|' + input.snapshot.recipientTokenId, start, end, 1, pairLimit, 'ordered pair quota'));
  }
  return rows;
}

function normalizeQuotaLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Owner quota limits are invalid.');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'generatedDailyLimit,initiatedDailyLimit,peerDailyLimit') throw new TypeError('Owner quota limits are invalid.');
  for (const key of keys) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new TypeError('Owner quota limits are invalid.');
  return Object.freeze({ initiatedDailyLimit: value.initiatedDailyLimit, generatedDailyLimit: value.generatedDailyLimit, peerDailyLimit: value.peerDailyLimit });
}

function quota(scopeClass, scopeLabel, start, end, units, limit, errorLabel) {
  const scopeDigest = digest(scopeClass + '|' + scopeLabel);
  return Object.freeze({ bucketId: digest('bucket|' + scopeClass + '|' + scopeDigest + '|' + start), scopeClass, scopeDigest, start, end, units, limit, errorLabel });
}

function reserveQuota(tx, item, timestamp) {
  tx.run('INSERT OR IGNORE INTO restap_network_quota_buckets (bucket_id, scope_class, scope_digest, bucket_start, bucket_end, used_units, reserved_units, limit_units, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)', [item.bucketId, item.scopeClass, item.scopeDigest, item.start, item.end, item.limit, timestamp]);
  const row = tx.get('SELECT used_units, reserved_units, limit_units FROM restap_network_quota_buckets WHERE bucket_id = ?', [item.bucketId]);
  if (Number(row.limit_units) !== item.limit) throw new Error('RESTAP network quota configuration conflict.');
  if (Number(row.used_units) + Number(row.reserved_units) + item.units > item.limit) throw new Error('RESTAP network ' + item.errorLabel + ' exceeded.');
  tx.run('UPDATE restap_network_quota_buckets SET reserved_units = reserved_units + ?, updated_at = ? WHERE bucket_id = ?', [item.units, timestamp, item.bucketId]);
}

function transitionAccounting(tx, row, target, timestamp) {
  assertTransition(row.status, target);
  const start = utcDay(Number(row.created_at)).start;
  const end = start + DAY_MS;
  const normalized = {
    operationKind: row.operation_kind,
    costUnits: Number(row.reserved_cost_units),
    snapshot: { senderTokenId: row.sender_token_id, recipientTokenId: row.recipient_token_id },
  };
  const quotas = quotaPlan(normalized, start, end, findGlobalLimit(tx, start));
  const charge = target !== 'released';
  for (const item of quotas) {
    const quotaRow = tx.get('SELECT reserved_units FROM restap_network_quota_buckets WHERE bucket_id = ?', [item.bucketId]);
    if (!quotaRow || Number(quotaRow.reserved_units) < item.units) throw new Error('RESTAP network reservation accounting conflict.');
    tx.run('UPDATE restap_network_quota_buckets SET reserved_units = reserved_units - ?, used_units = used_units + ?, updated_at = ? WHERE bucket_id = ?', [item.units, charge ? item.units : 0, timestamp, item.bucketId]);
  }
  tx.run('DELETE FROM restap_network_concurrency_leases WHERE operation_id = ?', [row.operation_id]);
  tx.run('UPDATE restap_network_operations SET status = ?, updated_at = ?, terminal_at = ? WHERE operation_id = ? AND status = ?', [target, timestamp, timestamp, row.operation_id, row.status]);
  addEvent(tx, row.operation_id, row.status + '->' + target, target, timestamp);
  return Object.freeze({ status: target, operationId: row.operation_id });
}

function findGlobalLimit(tx, start) {
  const scopeDigest = digest('global|cost');
  const row = tx.get("SELECT limit_units FROM restap_network_quota_buckets WHERE scope_class = 'global' AND scope_digest = ? AND bucket_start = ?", [scopeDigest, start]);
  if (!row) throw new Error('RESTAP network global quota missing.');
  return Number(row.limit_units);
}

function findConversationId(tx, operationId) {
  const leaseRows = tx.all('SELECT scope_digest FROM restap_network_concurrency_leases WHERE operation_id = ?', [operationId]);
  const leaseScopes = new Set(leaseRows.map((row) => row.scope_digest));
  for (const row of tx.all('SELECT conversation_id FROM restap_network_conversations')) {
    if (leaseScopes.has(digest('concurrency|conversation|' + row.conversation_id))) return row.conversation_id;
  }
  throw new Error('RESTAP network conversation reservation missing.');
}

function requireOperation(tx, operationId) {
  const row = tx.get('SELECT * FROM restap_network_operations WHERE operation_id = ?', [operationId]);
  if (!row) throw new Error('RESTAP network operation not found.');
  return row;
}

function operationProjection(row, joined) {
  const snapshot = Object.freeze({
    senderTokenId: row.sender_token_id,
    recipientTokenId: row.recipient_token_id,
    senderCustodyGeneration: Number(row.sender_custody_generation),
    recipientCustodyGeneration: Number(row.recipient_custody_generation),
    senderLeaseId: row.sender_lease_id,
    recipientLeaseId: row.recipient_lease_id,
    senderPolicyVersion: Number(row.sender_policy_version),
    recipientPolicyVersion: Number(row.recipient_policy_version),
    gateGeneration: Number(row.gate_generation),
    safeBlockNumber: Number(row.safe_block_number),
    safeBlockHash: row.safe_block_hash,
    bodyHash: row.body_digest,
  });
  const result = {
    operationId: row.operation_id,
    operationKind: row.operation_kind,
    status: row.status,
    snapshot,
    costUnits: Number(row.reserved_cost_units),
    createdAt: Number(row.created_at),
  };
  if (joined) result.joined = true;
  return Object.freeze(result);
}

function snapshotMatches(row, snapshot) {
  return row.sender_token_id === snapshot.senderTokenId
    && row.recipient_token_id === snapshot.recipientTokenId
    && Number(row.sender_custody_generation) === snapshot.senderCustodyGeneration
    && Number(row.recipient_custody_generation) === snapshot.recipientCustodyGeneration
    && row.sender_lease_id === snapshot.senderLeaseId
    && row.recipient_lease_id === snapshot.recipientLeaseId
    && Number(row.sender_policy_version) === snapshot.senderPolicyVersion
    && Number(row.recipient_policy_version) === snapshot.recipientPolicyVersion
    && Number(row.gate_generation) === snapshot.gateGeneration
    && Number(row.safe_block_number) === snapshot.safeBlockNumber
    && row.safe_block_hash === snapshot.safeBlockHash
    && row.body_digest === snapshot.bodyHash;
}

function assertTransition(from, to) {
  if (TERMINAL_STATES.has(from)) throw new Error('RESTAP network terminal operation is immutable.');
  if (!RESTAP_NETWORK_OPERATION_TRANSITIONS[from]?.includes(to)) throw new Error('RESTAP network operation transition forbidden: ' + from + ' -> ' + to + '.');
}

function addEvent(tx, operationId, transition, statusClass, timestamp) {
  tx.run('INSERT INTO restap_network_operation_events (operation_id, transition, status_class, occurred_at) VALUES (?, ?, ?, ?)', [operationId, transition, statusClass, timestamp]);
}

function assertExactObject(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain object.');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(label + ' contains unknown or missing fields.');
}

function assertTokenId(value, label) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value)) throw new TypeError(label + ' is invalid.');
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) throw new TypeError(label + ' must be a SHA-256 hex digest.');
}

function assertOpaqueString(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(label + ' must be a bounded opaque string.');
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' must be a non-negative integer.');
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(label + ' must be a positive integer.');
}

function readNow(now) {
  const value = now();
  assertNonNegativeInteger(value, 'clock');
  return value;
}

function utcDay(timestamp) {
  const date = new Date(timestamp);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Object.freeze({ start, end: start + DAY_MS });
}

function createOpaqueId(createId, kind) {
  const value = createId(kind);
  assertOpaqueString(value, kind + ' ID');
  return value;
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

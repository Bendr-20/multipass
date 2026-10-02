import { RESTAP_NETWORK_LIMITS } from './constants.js';

const DEPENDENCY_KEYS = Object.freeze([
  'acquireIntent', 'coordinator', 'createDueOperation', 'holderId', 'leaseTtlMs', 'listDueIntents',
  'maxAttempts', 'maxQueueAgeMs', 'maxQueueDepth', 'now', 'openProviderBreaker', 'pollCadenceMs',
  'readIntentState', 'readProviderTotals', 'settleIntent',
]);
const INTENT_KEYS = Object.freeze([
  'attemptCount', 'attemptLimit', 'createdAt', 'custodyGeneration', 'expectedPolicyVersion',
  'expiresAt', 'intentId',
]);
const STATE_KEYS = Object.freeze(['custodyGeneration', 'globalBreakerClosed', 'initiationEnabled', 'policyVersion']);
const TOTAL_KEYS = Object.freeze(['durableChargedUnits', 'providerChargedUnits', 'unknownChargeUnits']);
const IDENTIFIER = /^[A-Za-z0-9_-]{8,256}$/u;
const DEFAULT_LEASE_TTL_MS = 2 * RESTAP_NETWORK_LIMITS.minimumWorkerCadenceMs;
const DEFAULT_QUEUE_DEPTH = 100;
const DEFAULT_QUEUE_AGE_MS = 10 * 60_000;
const DEFAULT_ATTEMPTS = 3;

export function createRestapNetworkWorker(options = {}) {
  exactObject(options, DEPENDENCY_KEYS, 'worker dependencies', { optional: new Set(['leaseTtlMs', 'maxAttempts', 'maxQueueAgeMs', 'maxQueueDepth', 'pollCadenceMs']) });
  const state = normalizeDependencies(options);
  let lease = null;
  let lastPollAt = null;

  async function poll() {
    const timestamp = clock(state.now());
    if (lastPollAt !== null && timestamp - lastPollAt < state.pollCadenceMs) return freeze({ status: 'cadence_wait', nextPollAt: lastPollAt + state.pollCadenceMs });
    lastPollAt = timestamp;

    lease = lease
      ? normalizeLease(await state.coordinator.renewWorkerLease({ holderId: state.holderId, generation: lease.generation, leaseTtlMs: state.leaseTtlMs }))
      : normalizeLease(await state.coordinator.acquireWorkerLease({ holderId: state.holderId, leaseTtlMs: state.leaseTtlMs }));
    if (lease.status === 'unavailable') { lease = null; return freeze({ status: 'lease_unavailable' }); }

    const recovered = normalizeRecovery(await state.coordinator.recoverStaleOperations({ holderId: state.holderId, leaseGeneration: lease.generation }));
    if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed: 0, exhausted: 0, expired: 0, unavailable: 0 }); }
    const totals = normalizeTotals(await state.readProviderTotals());
    if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed: 0, exhausted: 0, expired: 0, unavailable: 0 }); }
    const unknown = recovered.chargedUnknown + totals.unknownChargeUnits + Math.abs(totals.providerChargedUnits - totals.durableChargedUnits);
    if (unknown > RESTAP_NETWORK_LIMITS.pilotUnknownChargeBudget) {
      if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed: 0, exhausted: 0, expired: 0, unavailable: 0 }); }
      await state.openProviderBreaker(freeze({ reasonClass: 'unknown_charge', unknownChargeUnits: unknown, holderId: state.holderId, leaseGeneration: lease.generation }));
      return freeze({ status: 'provider_breaker_opened', released: recovered.released, chargedUnknown: recovered.chargedUnknown });
    }

    const listTimestamp = clock(state.now());
    const queue = normalizeQueue(await state.listDueIntents(freeze({ limit: state.maxQueueDepth + 1, now: listTimestamp })));
    if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed: 0, exhausted: 0, expired: 0, unavailable: 0 }); }
    if (queue.length > state.maxQueueDepth) return freeze({ status: 'queue_overflow', depth: queue.length });
    const boundsTimestamp = clock(state.now());
    if (queue.length && boundsTimestamp - queue[0].createdAt > state.maxQueueAgeMs) return freeze({ status: 'queue_stale', oldestAgeMs: boundsTimestamp - queue[0].createdAt });

    let processed = 0;
    let exhausted = 0;
    let expired = 0;
    let unavailable = 0;
    for (const intent of queue) {
      if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed, exhausted, expired, unavailable }); }
      const existingOperation = normalizeExistingOperation(await state.coordinator.readIntentOperation({ intentId: intent.intentId }));
      if (existingOperation) continue;
      if (intent.expiresAt <= clock(state.now())) { await settle(state, lease, intent.intentId, 'expired'); expired += 1; continue; }
      if (intent.attemptCount >= intent.attemptLimit || intent.attemptCount >= state.maxAttempts) { await settle(state, lease, intent.intentId, 'exhausted'); exhausted += 1; continue; }

      const before = normalizeIntentState(await state.readIntentState(freeze({ intentId: intent.intentId })));
      if (!allows(before, intent)) return freeze({ status: stopClass(before, intent), processed, exhausted, expired, unavailable });
      const acquired = normalizeAcquire(await state.acquireIntent(freeze({
        intentId: intent.intentId,
        expectedPolicyVersion: intent.expectedPolicyVersion,
        custodyGeneration: intent.custodyGeneration,
        holderId: state.holderId,
        leaseGeneration: lease.generation,
      })));
      if (acquired.status !== 'acquired') { unavailable += 1; continue; }
      const after = normalizeIntentState(await state.readIntentState(freeze({ intentId: intent.intentId })));
      if (!await stillHoldsLease(state, lease)) { lease = null; return freeze({ status: 'lease_lost', processed, exhausted, expired, unavailable }); }
      if (!sameState(before, after) || !allows(after, intent)) {
        await settle(state, lease, intent.intentId, 'cancelled');
        return freeze({ status: stopClass(after, intent), processed, exhausted, expired, unavailable });
      }
      if (intent.expiresAt <= clock(state.now())) { await settle(state, lease, intent.intentId, 'expired'); expired += 1; continue; }

      let operation = null;
      let successfullyClaimed = false;
      try {
        operation = normalizeOperation(await state.createDueOperation(freeze({ intentId: intent.intentId, expectedPolicyVersion: intent.expectedPolicyVersion })));
        if (!await stillHoldsLease(state, lease)) {
          await state.coordinator.release({ operationId: operation.operationId });
          operation = null;
          lease = null;
          return freeze({ status: 'lease_lost', processed, exhausted, expired, unavailable });
        }
        const postCreate = normalizeIntentState(await state.readIntentState(freeze({ intentId: intent.intentId })));
        if (!sameState(after, postCreate) || !allows(postCreate, intent)) {
          await state.coordinator.release({ operationId: operation.operationId });
          operation = null;
          await settle(state, lease, intent.intentId, 'cancelled');
          return freeze({ status: stopClass(postCreate, intent), processed, exhausted, expired, unavailable });
        }
        if (intent.expiresAt <= clock(state.now())) {
          await state.coordinator.release({ operationId: operation.operationId });
          operation = null;
          await settle(state, lease, intent.intentId, 'expired');
          expired += 1;
          continue;
        }
        const claimed = normalizeClaim(await state.coordinator.claimIntentOperation({
          holderId: state.holderId,
          generation: lease.generation,
          intentId: intent.intentId,
          operationId: operation.operationId,
        }));
        if (claimed.operationId !== operation.operationId) throw new Error('RESTAP network intent already owns a different operation.');
        successfullyClaimed = true;
        if (!await stillHoldsLease(state, lease)) {
          operation = null;
          lease = null;
          return freeze({ status: 'lease_lost', processed, exhausted, expired, unavailable });
        }
        const postClaim = normalizeIntentState(await state.readIntentState(freeze({ intentId: intent.intentId })));
        if (!await stillHoldsLease(state, lease)) {
          operation = null;
          lease = null;
          return freeze({ status: 'lease_lost', processed, exhausted, expired, unavailable });
        }
        if (!sameState(postCreate, postClaim) || !allows(postClaim, intent)) {
          await state.coordinator.release({ operationId: operation.operationId });
          operation = null;
          await settle(state, lease, intent.intentId, 'cancelled');
          return freeze({ status: stopClass(postClaim, intent), processed, exhausted, expired, unavailable });
        }
        processed += claimed.joined ? 0 : 1;
        operation = null;
      } catch (error) {
        if (operation && !successfullyClaimed) await state.coordinator.release({ operationId: operation.operationId });
        throw error;
      }
    }
    return freeze({ status: 'polled', processed, exhausted, expired, unavailable, depth: queue.length, leaseGeneration: lease.generation });
  }

  return Object.freeze({ poll, status: () => freeze({ holderId: state.holderId, leaseGeneration: lease?.generation ?? null, lastPollAt }) });
}

export function createSqliteRestapNetworkWorkerCoordinator({ store, now = Date.now } = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function' || typeof now !== 'function') throw new TypeError('Worker coordinator dependencies are invalid.');

  function acquireWorkerLease(input) {
    exactObject(input, ['holderId', 'leaseTtlMs'], 'worker lease acquisition');
    const holderId = identifier(input.holderId, 'holderId');
    const leaseTtlMs = positive(input.leaseTtlMs, 'leaseTtlMs');
    return store.transaction('worker_lease_acquire', (tx) => {
      const timestamp = clock(now());
      const row = tx.get('SELECT * FROM restap_network_worker_lease WHERE singleton = 1');
      if (!row) {
        tx.run('INSERT INTO restap_network_worker_lease (singleton, holder_id, acquired_at, renewed_at, expires_at, generation) VALUES (1, ?, ?, ?, ?, 1)', [holderId, timestamp, timestamp, timestamp + leaseTtlMs]);
        return freeze({ status: 'acquired', holderId, generation: 1, expiresAt: timestamp + leaseTtlMs });
      }
      if (Number(row.expires_at) > timestamp) return freeze({ status: 'unavailable' });
      const generation = Number(row.generation) + 1;
      tx.run('UPDATE restap_network_worker_lease SET holder_id = ?, acquired_at = ?, renewed_at = ?, expires_at = ?, generation = ? WHERE singleton = 1 AND generation = ?', [holderId, timestamp, timestamp, timestamp + leaseTtlMs, generation, Number(row.generation)]);
      return freeze({ status: 'acquired', holderId, generation, expiresAt: timestamp + leaseTtlMs });
    });
  }

  function renewWorkerLease(input) {
    exactObject(input, ['generation', 'holderId', 'leaseTtlMs'], 'worker lease renewal');
    const holderId = identifier(input.holderId, 'holderId');
    const generation = positive(input.generation, 'generation');
    const leaseTtlMs = positive(input.leaseTtlMs, 'leaseTtlMs');
    return store.transaction('worker_lease_renew', (tx) => {
      const timestamp = clock(now());
      const row = tx.get('SELECT * FROM restap_network_worker_lease WHERE singleton = 1');
      if (!row || row.holder_id !== holderId || Number(row.generation) !== generation || Number(row.expires_at) <= timestamp) return freeze({ status: 'unavailable' });
      tx.run('UPDATE restap_network_worker_lease SET renewed_at = ?, expires_at = ? WHERE singleton = 1 AND holder_id = ? AND generation = ?', [timestamp, timestamp + leaseTtlMs, holderId, generation]);
      return freeze({ status: 'renewed', holderId, generation, expiresAt: timestamp + leaseTtlMs });
    });
  }

  function assertWorkerLease(input) {
    exactObject(input, ['generation', 'holderId'], 'worker lease assertion');
    const row = store.readOne('SELECT holder_id, generation, expires_at FROM restap_network_worker_lease WHERE singleton = 1');
    return Boolean(row && row.holder_id === input.holderId && Number(row.generation) === input.generation && Number(row.expires_at) > clock(now()));
  }

  function readIntentOperation(input) {
    exactObject(input, ['intentId'], 'intent operation lookup');
    const row = store.readOne('SELECT operation_id FROM restap_network_operations WHERE intent_id = ? ORDER BY created_at, operation_id LIMIT 1', [identifier(input.intentId, 'intentId')]);
    return row ? freeze({ operationId: row.operation_id }) : null;
  }

  function claimIntentOperation(input) {
    exactObject(input, ['generation', 'holderId', 'intentId', 'operationId'], 'intent operation claim');
    const holderId = identifier(input.holderId, 'holderId');
    const generation = positive(input.generation, 'generation');
    const intentId = identifier(input.intentId, 'intentId');
    const operationId = identifier(input.operationId, 'operationId');
    return store.transaction('worker_operation_claim', (tx) => {
      const timestamp = clock(now());
      const lease = tx.get('SELECT holder_id, generation, expires_at FROM restap_network_worker_lease WHERE singleton = 1');
      if (!lease || lease.holder_id !== holderId || Number(lease.generation) !== generation || Number(lease.expires_at) <= timestamp) throw new Error('RESTAP network worker lease is stale.');
      const intent = tx.get('SELECT status, expires_at FROM restap_network_intents WHERE intent_id = ?', [intentId]);
      if (!intent || intent.status !== 'leased' || Number(intent.expires_at) <= timestamp) throw new Error('RESTAP network intent operation claim is invalid.');
      const existing = tx.get('SELECT operation_id, status FROM restap_network_operations WHERE intent_id = ? ORDER BY created_at, operation_id LIMIT 1', [intentId]);
      if (existing) {
        if (existing.status !== 'reserved') throw new Error('RESTAP network existing intent operation is not reservable.');
        return freeze({ operationId: existing.operation_id, joined: true });
      }
      const operation = tx.get('SELECT intent_id, status FROM restap_network_operations WHERE operation_id = ?', [operationId]);
      if (!operation || operation.status !== 'reserved' || operation.intent_id !== null) throw new Error('RESTAP network intent operation claim is invalid.');
      tx.run('UPDATE restap_network_operations SET intent_id = ?, updated_at = ? WHERE operation_id = ? AND intent_id IS NULL AND status = ?', [intentId, timestamp, operationId, 'reserved']);
      return freeze({ operationId, joined: false });
    });
  }

  return Object.freeze({ acquireWorkerLease, renewWorkerLease, assertWorkerLease, readIntentOperation, claimIntentOperation });
}

function normalizeDependencies(options) {
  for (const name of ['now', 'listDueIntents', 'acquireIntent', 'settleIntent', 'createDueOperation', 'readIntentState', 'readProviderTotals', 'openProviderBreaker']) if (typeof options[name] !== 'function') throw new TypeError('RESTAP network worker ' + name + ' is invalid.');
  const coordinatorMethods = ['acquireWorkerLease', 'renewWorkerLease', 'assertWorkerLease', 'recoverStaleOperations', 'readIntentOperation', 'claimIntentOperation', 'release'];
  if (!options.coordinator || coordinatorMethods.some((name) => typeof options.coordinator[name] !== 'function')) throw new TypeError('RESTAP network worker coordinator is invalid.');
  const pollCadenceMs = options.pollCadenceMs ?? RESTAP_NETWORK_LIMITS.minimumWorkerCadenceMs;
  if (!Number.isSafeInteger(pollCadenceMs) || pollCadenceMs < RESTAP_NETWORK_LIMITS.minimumWorkerCadenceMs) throw new TypeError('Worker cadence must be at least 60 seconds.');
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < pollCadenceMs * 2) throw new TypeError('Worker lease TTL must cover at least two cadences.');
  const maxQueueDepth = bounded(options.maxQueueDepth ?? DEFAULT_QUEUE_DEPTH, 'maxQueueDepth', 1, 1_000);
  const maxQueueAgeMs = bounded(options.maxQueueAgeMs ?? DEFAULT_QUEUE_AGE_MS, 'maxQueueAgeMs', pollCadenceMs, 24 * 60 * 60_000);
  const maxAttempts = bounded(options.maxAttempts ?? DEFAULT_ATTEMPTS, 'maxAttempts', 1, 100);
  return { ...options, holderId: identifier(options.holderId, 'holderId'), pollCadenceMs, leaseTtlMs, maxQueueDepth, maxQueueAgeMs, maxAttempts };
}

function normalizeQueue(value) {
  if (!Array.isArray(value)) throw new TypeError('Due-intent queue must be an array.');
  const seen = new Set();
  const queue = value.map((item) => {
    exactObject(item, INTENT_KEYS, 'due-intent worker payload');
    const normalized = freeze({
      intentId: identifier(item.intentId, 'intentId'),
      expectedPolicyVersion: nonNegative(item.expectedPolicyVersion, 'expectedPolicyVersion'),
      custodyGeneration: nonNegative(item.custodyGeneration, 'custodyGeneration'),
      attemptCount: nonNegative(item.attemptCount, 'attemptCount'),
      attemptLimit: positive(item.attemptLimit, 'attemptLimit'),
      createdAt: nonNegative(item.createdAt, 'createdAt'),
      expiresAt: positive(item.expiresAt, 'expiresAt'),
    });
    if (normalized.expiresAt <= normalized.createdAt || seen.has(normalized.intentId)) throw new TypeError('Due-intent worker payload is invalid.');
    seen.add(normalized.intentId);
    return normalized;
  });
  queue.sort((left, right) => left.createdAt - right.createdAt || left.intentId.localeCompare(right.intentId));
  return Object.freeze(queue);
}

function normalizeLease(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Worker lease is invalid.');
  if (value.status === 'unavailable') { exactObject(value, ['status'], 'worker lease'); return freeze({ status: 'unavailable' }); }
  exactObject(value, ['expiresAt', 'generation', 'holderId', 'status'], 'worker lease');
  if (!['acquired', 'renewed'].includes(value.status)) throw new TypeError('Worker lease status is invalid.');
  return freeze({ status: value.status, holderId: identifier(value.holderId, 'holderId'), generation: positive(value.generation, 'generation'), expiresAt: positive(value.expiresAt, 'expiresAt') });
}

function normalizeRecovery(value) {
  exactObject(value, ['chargedUnknown', 'released'], 'stale operation recovery');
  return freeze({ released: nonNegative(value.released, 'released'), chargedUnknown: nonNegative(value.chargedUnknown, 'chargedUnknown') });
}

function normalizeTotals(value) {
  exactObject(value, TOTAL_KEYS, 'provider totals');
  return freeze({ providerChargedUnits: nonNegative(value.providerChargedUnits, 'providerChargedUnits'), durableChargedUnits: nonNegative(value.durableChargedUnits, 'durableChargedUnits'), unknownChargeUnits: nonNegative(value.unknownChargeUnits, 'unknownChargeUnits') });
}

function normalizeIntentState(value) {
  exactObject(value, STATE_KEYS, 'worker intent state');
  if (typeof value.initiationEnabled !== 'boolean' || typeof value.globalBreakerClosed !== 'boolean') throw new TypeError('Worker intent state flags are invalid.');
  return freeze({ initiationEnabled: value.initiationEnabled, globalBreakerClosed: value.globalBreakerClosed, policyVersion: nonNegative(value.policyVersion, 'policyVersion'), custodyGeneration: nonNegative(value.custodyGeneration, 'custodyGeneration') });
}

function normalizeAcquire(value) {
  exactObject(value, ['status'], 'intent acquisition result');
  if (!['acquired', 'unavailable'].includes(value.status)) throw new TypeError('Intent acquisition result is invalid.');
  return freeze({ status: value.status });
}

function normalizeOperation(value) {
  if (!value || typeof value !== 'object' || typeof value.operationId !== 'string') throw new TypeError('Created operation is invalid.');
  return freeze({ operationId: identifier(value.operationId, 'operationId') });
}

function normalizeExistingOperation(value) {
  if (value === null) return null;
  exactObject(value, ['operationId'], 'existing intent operation');
  return freeze({ operationId: identifier(value.operationId, 'operationId') });
}

function normalizeClaim(value) {
  exactObject(value, ['joined', 'operationId'], 'intent operation claim');
  if (typeof value.joined !== 'boolean') throw new TypeError('Intent operation claim is invalid.');
  return freeze({ joined: value.joined, operationId: identifier(value.operationId, 'operationId') });
}

async function stillHoldsLease(state, lease) {
  return await state.coordinator.assertWorkerLease({ holderId: state.holderId, generation: lease.generation }) === true;
}
async function settle(state, lease, intentId, outcome) {
  await state.settleIntent(freeze({ intentId, outcome, holderId: state.holderId, leaseGeneration: lease.generation }));
}
function allows(state, intent) { return state.initiationEnabled && state.globalBreakerClosed && state.policyVersion === intent.expectedPolicyVersion && state.custodyGeneration === intent.custodyGeneration; }
function sameState(left, right) { return left.initiationEnabled === right.initiationEnabled && left.globalBreakerClosed === right.globalBreakerClosed && left.policyVersion === right.policyVersion && left.custodyGeneration === right.custodyGeneration; }
function stopClass(state, intent) { if (!state.globalBreakerClosed) return 'global_breaker_open'; if (!state.initiationEnabled) return 'initiation_disabled'; if (state.custodyGeneration !== intent.custodyGeneration) return 'custody_changed'; return 'policy_changed'; }
function clock(value) { return nonNegative(value, 'worker clock'); }
function bounded(value, label, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(label + ' is invalid.'); return value; }
function positive(value, label) { return bounded(value, label, 1, Number.MAX_SAFE_INTEGER); }
function nonNegative(value, label) { return bounded(value, label, 0, Number.MAX_SAFE_INTEGER); }
function identifier(value, label) { if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new TypeError(label + ' is invalid.'); return value; }

function exactObject(value, keys, label, { optional = new Set() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain exact object.');
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) throw new TypeError(label + ' contains an unknown key.');
  const allowed = new Set(keys);
  for (const key of own) {
    if (!allowed.has(key)) throw new TypeError(label + ' contains an unknown key.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' fields must be enumerable data properties.');
  }
  for (const key of keys) if (!optional.has(key) && !Object.hasOwn(value, key)) throw new TypeError(label + ' is missing a key.');
}

function freeze(value) { return Object.freeze(value); }

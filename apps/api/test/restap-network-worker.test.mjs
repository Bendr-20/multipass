import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkWorker, createSqliteRestapNetworkWorkerCoordinator } from '../src/restap-network/worker.js';

const START = Date.UTC(2026, 9, 2, 12);
const INTENT = 'intent-worker-00000000000000000000001';

function due(patch = {}) {
  return { intentId: INTENT, expectedPolicyVersion: 3, custodyGeneration: 7, attemptCount: 0, attemptLimit: 3, createdAt: START, expiresAt: START + 60 * 60_000, ...patch };
}

async function fixture(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-worker-'));
  const store = createRestapNetworkDatabase({ filename: join(directory, 'network.sqlite') });
  let now = START;
  const events = [];
  const queue = overrides.queue ?? [due()];
  const intentState = overrides.intentState ?? { initiationEnabled: true, globalBreakerClosed: true, policyVersion: 3, custodyGeneration: 7 };
  const totals = overrides.totals ?? { providerChargedUnits: 0, durableChargedUnits: 0, unknownChargeUnits: 0 };
  const claims = new Map();
  let operationSequence = 0;
  const settled = [];
  const leaseCoordinator = createSqliteRestapNetworkWorkerCoordinator({ store, now: () => now });
  const coordinator = {
    ...leaseCoordinator,
    async recoverStaleOperations(input) { events.push('reconcile'); assert.deepEqual(Object.keys(input), ['holderId', 'leaseGeneration']); assert.equal(leaseCoordinator.assertWorkerLease({ holderId: input.holderId, generation: input.leaseGeneration }), true); overrides.onRecover?.(() => { now += 120_001; }); return overrides.recovery ?? { released: 0, chargedUnknown: 0 }; },
    release({ operationId }) { events.push('release:' + operationId); return { status: 'released', operationId }; },
    async readIntentOperation({ intentId }) { const operationId = claims.get(intentId); return operationId ? { operationId } : null; },
    async claimIntentOperation({ holderId, generation, intentId, operationId }) {
      events.push('claim');
      if (overrides.claimThrows) throw new Error('injected claim failure');
      assert.equal(leaseCoordinator.assertWorkerLease({ holderId, generation }), true);
      const existing = claims.get(intentId);
      if (existing) return { operationId: existing, joined: true };
      claims.set(intentId, operationId);
      return { operationId, joined: false };
    },
  };
  function worker(holderId, extra = {}) {
    return createRestapNetworkWorker({
      coordinator,
      holderId,
      now: () => now,
      listDueIntents: async (input) => { events.push('list'); assert.deepEqual(Object.keys(input), ['limit', 'now']); overrides.onList?.((ms) => { now += ms; }); return queue; },
      acquireIntent: async (input) => { events.push('acquire'); assert.deepEqual(Object.keys(input), ['intentId', 'expectedPolicyVersion', 'custodyGeneration', 'holderId', 'leaseGeneration']); assert.equal(leaseCoordinator.assertWorkerLease({ holderId: input.holderId, generation: input.leaseGeneration }), true); overrides.onAcquire?.(intentState, (ms) => { now += ms; }); return { status: 'acquired' }; },
      settleIntent: async (input) => { events.push('settle:' + input.outcome); assert.equal(leaseCoordinator.assertWorkerLease({ holderId: input.holderId, generation: input.leaseGeneration }), true); settled.push(input); },
      createDueOperation: async (input) => { events.push('create'); assert.deepEqual(Object.keys(input), ['intentId', 'expectedPolicyVersion']); operationSequence += 1; return { operationId: 'operation-worker-' + String(operationSequence).padStart(24, '0') }; },
      readIntentState: async () => { events.push('state'); return { ...intentState }; },
      readProviderTotals: async () => { events.push('totals'); return totals; },
      openProviderBreaker: async (input) => { events.push('breaker:' + input.reasonClass); assert.deepEqual(Object.keys(input), ['reasonClass', 'unknownChargeUnits', 'holderId', 'leaseGeneration']); assert.equal(leaseCoordinator.assertWorkerLease({ holderId: input.holderId, generation: input.leaseGeneration }), true); },
      ...extra,
    });
  }
  return { store, coordinator, worker, queue, intentState, totals, claims, settled, events, setNow: (value) => { now = value; }, advance: (ms) => { now += ms; }, get now() { return now; }, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('two workers have exactly one renewable holder and reject split brain', async (t) => {
  const f = await fixture({ queue: [] }); t.after(() => f.close());
  const left = f.worker('worker-left-00000001');
  const right = f.worker('worker-right-0000001');
  assert.equal((await left.poll()).status, 'polled');
  assert.equal((await right.poll()).status, 'lease_unavailable');
  f.advance(60_000);
  assert.equal((await left.poll()).leaseGeneration, 1);
  assert.equal((await right.poll()).status, 'lease_unavailable');
  const row = f.store.readOne('SELECT holder_id, generation FROM restap_network_worker_lease WHERE singleton = 1');
  assert.deepEqual({ ...row }, { holder_id: 'worker-left-00000001', generation: 1 });
});

test('a second worker instance cannot reuse the same holder ID and fencing token', async (t) => {
  const f = await fixture({ queue: [] }); t.after(() => f.close());
  const first = f.worker('worker-shared-00000001');
  const duplicate = f.worker('worker-shared-00000001');
  assert.equal((await first.poll()).status, 'polled');
  assert.equal((await duplicate.poll()).status, 'lease_unavailable');
});

test('expired lease takeover increments generation and fences the old worker', async (t) => {
  const f = await fixture({ queue: [] }); t.after(() => f.close());
  const left = f.worker('worker-left-00000001');
  const right = f.worker('worker-right-0000001');
  await left.poll();
  f.advance(120_001);
  const taken = await right.poll();
  assert.equal(taken.leaseGeneration, 2);
  f.advance(60_000);
  assert.equal((await left.poll()).status, 'lease_unavailable');
  assert.equal(f.coordinator.assertWorkerLease({ holderId: 'worker-left-00000001', generation: 1 }), false);
});

test('minimum cadence is 60 seconds and polling uses deterministic time without sleeps', async (t) => {
  const f = await fixture({ queue: [] }); t.after(() => f.close());
  assert.throws(() => f.worker('worker-cadence-0000001', { pollCadenceMs: 59_999 }), /60 seconds/i);
  const worker = f.worker('worker-cadence-0000001');
  await worker.poll();
  f.advance(59_999);
  assert.equal((await worker.poll()).status, 'cadence_wait');
  f.advance(1);
  assert.equal((await worker.poll()).status, 'polled');
});

test('bounded queue creates at most one durable operation per intent and carries opaque fields only', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const worker = f.worker('worker-process-0000001');
  const first = await worker.poll();
  assert.deepEqual(first, { status: 'polled', processed: 1, exhausted: 0, expired: 0, unavailable: 0, depth: 1, leaseGeneration: 1 });
  f.advance(60_000);
  const second = await worker.poll();
  assert.equal(second.processed, 0);
  assert.equal(f.claims.size, 1);
  assert.equal(new Set(f.claims.values()).size, 1);
});

test('queue age uses fresh time after an asynchronous listing', async (t) => {
  const f = await fixture({ queue: [due({ createdAt: START, expiresAt: START + 60 * 60_000 })], onList(advance) { advance(60_001); } }); t.after(() => f.close());
  const result = await f.worker('worker-listtime-0000001', { maxQueueAgeMs: 60_000 }).poll();
  assert.equal(result.status, 'queue_stale');
  assert.equal(f.events.includes('acquire'), false);
});

test('queue depth and oldest age bounds stop work before acquisition', async (t) => {
  const overflow = await fixture({ queue: [due({ intentId: 'intent-overflow-00000000000000000001' }), due({ intentId: 'intent-overflow-00000000000000000002' })] });
  t.after(() => overflow.close());
  const overflowResult = await overflow.worker('worker-overflow-0000001', { maxQueueDepth: 1 }).poll();
  assert.equal(overflowResult.status, 'queue_overflow');
  assert.equal(overflow.events.includes('acquire'), false);

  const stale = await fixture({ queue: [due({ createdAt: START - 600_001, expiresAt: START + 1_000 })] });
  t.after(() => stale.close());
  const staleResult = await stale.worker('worker-stale-000000001').poll();
  assert.equal(staleResult.status, 'queue_stale');
  assert.equal(stale.events.includes('acquire'), false);
});

test('intent expiring during acquisition is settled before operation reservation', async (t) => {
  const f = await fixture({ queue: [due({ expiresAt: START + 1 })], onAcquire(_state, advance) { advance(2); } }); t.after(() => f.close());
  const result = await f.worker('worker-expiryrace-00001').poll();
  assert.equal(result.expired, 1);
  assert.equal(f.events.includes('create'), false);
  assert.equal(f.settled.at(-1).outcome, 'expired');
});

test('existing durable operation prevents independent intent expiry or exhaustion', async (t) => {
  const f = await fixture({ queue: [due({ createdAt: START - 1, expiresAt: START, attemptCount: 3 })] }); t.after(() => f.close());
  f.claims.set(INTENT, 'operation-existing-000000000000001');
  const result = await f.worker('worker-existing-0000001').poll();
  assert.equal(result.expired, 0);
  assert.equal(result.exhausted, 0);
  assert.equal(f.settled.length, 0);
});

test('attempt and expiry caps settle intents without creating operations', async (t) => {
  const f = await fixture({ queue: [due({ intentId: 'intent-exhausted-000000000000001', attemptCount: 3 }), due({ intentId: 'intent-expired-00000000000000001', createdAt: START - 1_000, expiresAt: START })] });
  t.after(() => f.close());
  const result = await f.worker('worker-limits-000000001').poll();
  assert.equal(result.exhausted, 1);
  assert.equal(result.expired, 1);
  assert.deepEqual(f.settled.map((value) => value.outcome).sort(), ['exhausted', 'expired']);
  assert.equal(f.settled.every((value) => Object.keys(value).sort().join(',') === 'holderId,intentId,leaseGeneration,outcome'), true);
  assert.equal(f.events.includes('create'), false);
});

for (const [name, mutation, expected] of [
  ['initiation', (state) => { state.initiationEnabled = false; }, 'initiation_disabled'],
  ['policy', (state) => { state.policyVersion += 1; }, 'policy_changed'],
  ['epoch', (state) => { state.custodyGeneration += 1; }, 'custody_changed'],
  ['global breaker', (state) => { state.globalBreakerClosed = false; }, 'global_breaker_open'],
]) {
  test('worker stops immediately on ' + name + ' change', async (t) => {
    let changed = false;
    const f = await fixture({ onAcquire(state) { if (!changed) { changed = true; mutation(state); } } });
    t.after(() => f.close());
    const result = await f.worker('worker-stop-0000000001').poll();
    assert.equal(result.status, expected);
    assert.equal(f.events.includes('create'), false);
    assert.equal(f.settled.at(-1).outcome, 'cancelled');
  });
}

test('lease loss during reconciliation stops before provider totals or queue work', async (t) => {
  const f = await fixture({ onRecover(expireLease) { expireLease(); } }); t.after(() => f.close());
  assert.equal((await f.worker('worker-recoverfence-001').poll()).status, 'lease_lost');
  assert.equal(f.events.includes('totals'), false);
  assert.equal(f.events.includes('list'), false);
});

test('stale reconciliation runs before queue acquisition and unknown charges open the zero-budget breaker', async (t) => {
  const f = await fixture({ recovery: { released: 2, chargedUnknown: 1 } }); t.after(() => f.close());
  const result = await f.worker('worker-reconcile-000001').poll();
  assert.equal(result.status, 'provider_breaker_opened');
  assert.deepEqual(f.events.slice(0, 3), ['reconcile', 'totals', 'breaker:unknown_charge']);
  assert.equal(f.events.includes('list'), false);
  assert.equal(f.events.includes('create'), false);
});

test('provider total mismatch in either direction is unknown and prevents new work', async (t) => {
  for (const totals of [
    { providerChargedUnits: 2, durableChargedUnits: 1, unknownChargeUnits: 0 },
    { providerChargedUnits: 1, durableChargedUnits: 2, unknownChargeUnits: 0 },
  ]) {
    const f = await fixture({ totals }); t.after(() => f.close());
    assert.equal((await f.worker('worker-provider-0000001').poll()).status, 'provider_breaker_opened');
    assert.equal(f.events.includes('list'), false);
  }
});

test('lease loss while reading provider totals prevents stale breaker mutation', async (t) => {
  const f = await fixture({ recovery: { released: 0, chargedUnknown: 1 } }); t.after(() => f.close());
  const worker = f.worker('worker-breakerfence-001', {
    readProviderTotals: async () => { f.events.push('totals'); f.advance(120_001); return { providerChargedUnits: 0, durableChargedUnits: 0, unknownChargeUnits: 0 }; },
  });
  assert.equal((await worker.poll()).status, 'lease_lost');
  assert.equal(f.events.some((value) => value.startsWith('breaker:')), false);
});

test('intent expiring during post-reservation validation is released before claim', async (t) => {
  const f = await fixture({ queue: [due({ expiresAt: START + 1 })] }); t.after(() => f.close());
  let reads = 0;
  const worker = f.worker('worker-postexpiry-00001', {
    readIntentState: async () => { reads += 1; if (reads === 3) f.advance(2); return { ...f.intentState }; },
  });
  const result = await worker.poll();
  assert.equal(result.expired, 1);
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-')), true);
  assert.equal(f.events.includes('claim'), false);
});

test('lease loss after claim stops without stale-generation release', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  let reads = 0;
  const worker = f.worker('worker-postclaimlease-01', {
    readIntentState: async () => { reads += 1; if (reads === 4) f.advance(120_001); return { ...f.intentState }; },
  });
  assert.equal((await worker.poll()).status, 'lease_lost');
  assert.equal(f.events.includes('claim'), true);
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-')), false);
});

test('state change after atomic claim releases operation before any dispatch', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  let reads = 0;
  const worker = f.worker('worker-postclaim-000001', {
    readIntentState: async () => { reads += 1; if (reads === 4) f.intentState.globalBreakerClosed = false; return { ...f.intentState }; },
  });
  const result = await worker.poll();
  assert.equal(result.status, 'global_breaker_open');
  assert.equal(f.events.includes('claim'), true);
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-')), true);
  assert.equal(f.settled.at(-1).outcome, 'cancelled');
});

test('state change after reservation releases pre-dispatch operation immediately', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const worker = f.worker('worker-postcreate-00001', {
    createDueOperation: async () => { f.events.push('create'); f.intentState.policyVersion += 1; return { operationId: 'operation-worker-postcreate-00001' }; },
  });
  const result = await worker.poll();
  assert.equal(result.status, 'policy_changed');
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-postcreate')), true);
  assert.equal(f.settled.at(-1).outcome, 'cancelled');
});

test('claim failure releases the newly reserved pre-dispatch operation', async (t) => {
  const f = await fixture({ claimThrows: true }); t.after(() => f.close());
  await assert.rejects(() => f.worker('worker-claimfail-000001').poll(), /injected claim failure/);
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-')), true);
});

test('lease loss during reservation releases the operation and fences the worker', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const worker = f.worker('worker-leaselost-000001', {
    createDueOperation: async () => { f.events.push('create'); f.advance(120_001); return { operationId: 'operation-worker-leaselost-0001' }; },
  });
  assert.equal((await worker.poll()).status, 'lease_lost');
  assert.equal(f.events.some((value) => value.startsWith('release:operation-worker-leaselost')), true);
});

test('worker payload rejects private fields and accessors without reading them', async (t) => {
  let touched = false;
  const item = due();
  Object.defineProperty(item, 'wallet', { enumerable: true, get() { touched = true; throw new Error('PRIVATE'); } });
  const f = await fixture({ queue: [item] }); t.after(() => f.close());
  await assert.rejects(() => f.worker('worker-private-00000001').poll(), /unknown|exact/i);
  assert.equal(touched, false);
});

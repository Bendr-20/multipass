import assert from 'node:assert/strict';
import test from 'node:test';
import { loadActivationUnits } from './activate-looper-3802-fixture.mjs';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), values }; }
async function unit() { return loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','05-attempt-store.js','06-cross-tab-coordinator.js']); }
function preflight(ns) { return { blockNumber: 1, blockHash: `0x${'ab'.repeat(32)}`, estimatedGas: '0x1782a', gasPrice: '0x1', accountCode: '0x', accountBalance: '0x0', loopersImplementationSlot: ns.PINSET.identities.loopers.implementationSlot, adapterImplementationSlot: ns.PINSET.identities.adapter.implementationSlot, identityImplementationSlot: ns.PINSET.identities.identityRegistry.implementationSlot, sponsorDesignator: ns.PINSET.sponsorDesignator, sponsorImplementationSlot: ns.PINSET.identities.sponsor.implementationSlot, adapterIdentityRegistryResult: ns.CALLS.adapterIdentityRegistry.result, adapterBindingResult: ns.CALLS.adapterBinding.result, adapterControllerResult: ns.CALLS.adapterController.result, identityOwnerResult: ns.CALLS.identityOwner.result, identityTokenURIResult: ns.CALLS.identityTokenUri.result, sponsorImplementationResult: ns.CALLS.sponsorImplementation.result, sponsorEntryPointResult: ns.CALLS.sponsorEntryPoint.result, simulationResult: `0x${ns.addressWord(ns.PINSET.account)}` }; }
function attempt(ns, overrides = {}) { const at = 1000; return { id: UUID_C, retryOrdinal: 0, state: 'prepared', createdAtMs: at, updatedAtMs: at, waitUntilMs: at + 600000, acknowledgedAtMs: null, walletGeneration: 0, supersedesId: null, supersededById: null, txHash: null, receipt: null, observation: null, pinset: ns.expectedAttemptPinset(), transaction: ns.expectedAttemptTransaction(), preflight: preflight(ns), history: [{ from: null, to: 'prepared', atMs: at, reason: 'activate' }], ...overrides }; }
function lease(ns, overrides = {}) { return { lockName: ns.PINSET.lockName, ownerTabId: UUID_A, leaseId: UUID_B, purpose: 'activate', acquiredAtMs: 1000, heartbeatAtMs: 1000, expiresAtMs: 31000, ...overrides }; }
function storeValue(ns, overrides = {}) { const a = attempt(ns); return { schema: 'loopers.walletActivation', version: 1, revision: 1, chainId: 8453, tokenId: '3802', activeAttemptId: a.id, lease: lease(ns), attempts: [a], ...overrides }; }

test('StoreV1 accepts exact schema and rejects unknown/corrupt records', async () => {
  const ns = await unit(); const valid = storeValue(ns); assert.equal(ns.validateStoreV1(valid).activeAttemptId, UUID_C);
  assert.throws(() => ns.validateStoreV1({ ...valid, extra: true }), /unknown|missing/i);
  assert.throws(() => ns.validateStoreV1({ ...valid, revision: 0 }), /revision/i);
  assert.throws(() => ns.validateStoreV1({ ...valid, attempts: [{ ...valid.attempts[0], transaction: { ...valid.attempts[0].transaction, gas: '0x1' } }] }), /unknown|missing|transaction/i);
  const storage = memoryStorage(); storage.setItem(ns.PINSET.storageKey, '{'); const store = ns.createAttemptStore(storage); assert.throws(() => store.read(), /corrupt/i); assert.equal(storage.getItem(ns.PINSET.storageKey), '{');
});

test('revisioned whole-record writes synchronously verify read-back', async () => {
  const ns = await unit(); const storage = memoryStorage(); const store = ns.createAttemptStore(storage); const initial = { schema: 'loopers.walletActivation', version: 1, revision: 1, chainId: 8453, tokenId: '3802', activeAttemptId: null, lease: lease(ns), attempts: [] };
  const first = store.mutate((latest) => { assert.equal(latest, null); return initial; }); assert.equal(first.revision, 1);
  const prepared = attempt(ns); const second = store.mutate((latest) => ({ ...latest, revision: 2, activeAttemptId: prepared.id, attempts: [prepared] })); assert.equal(second.revision, 2);
  assert.throws(() => store.mutate((latest) => ({ ...latest, revision: 4 })), /increment/i);
});

test('Web Lock request is exact no-queue exclusive and failed action leaves no fresh record', async () => {
  const ns = await unit(); const storage = memoryStorage(); const store = ns.createAttemptStore(storage); const requests = [];
  const locks = { request: async (name, options, callback) => { requests.push({ name, options }); return callback({ name }); } }; let uuidIndex = 0; const uuids = [UUID_A, UUID_B];
  const coordinator = ns.createCrossTabCoordinator({ locks, store, crypto: { randomUUID: () => uuids[uuidIndex++] }, now: () => 1000, setInterval: () => 1, clearInterval: () => {} });
  await assert.rejects(coordinator.run('activate', async () => { throw new Error('stop'); }), /stop/);
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ name: ns.PINSET.lockName, options: { mode: 'exclusive', ifAvailable: true } }]); assert.equal(store.read(), null);
});

test('Web Locks unavailable and null lock fail closed with no mutation', async () => {
  const ns = await unit(); const storage = memoryStorage(); const store = ns.createAttemptStore(storage);
  const absent = ns.createCrossTabCoordinator({ locks: null, store, crypto: { randomUUID: () => UUID_A }, now: () => 0, setInterval, clearInterval }); assert.equal(absent.available, false); await assert.rejects(absent.run('activate', async () => {}), /read-only/i);
  const nullLock = ns.createCrossTabCoordinator({ locks: { request: async (_n,_o,cb) => cb(null) }, store, crypto: { randomUUID: () => UUID_A }, now: () => 0, setInterval: () => 1, clearInterval: () => {} }); await assert.rejects(nullLock.run('activate', async () => {}), /busy|queued/i); assert.equal(store.read(), null);
});

test('unexpired foreign lease blocks takeover even while Web Lock is held', async () => {
  const ns = await unit(); const storage = memoryStorage(); const store = ns.createAttemptStore(storage); storage.setItem(ns.PINSET.storageKey, JSON.stringify(storeValue(ns)));
  const coordinator = ns.createCrossTabCoordinator({ locks: { request: async (_n,_o,cb) => cb({}) }, store, crypto: { randomUUID: () => UUID_C }, now: () => 2000, setInterval: () => 1, clearInterval: () => {} });
  await assert.rejects(coordinator.run('resume', async () => {}), /foreign|another tab|lease/i); assert.equal(store.read().revision, 1);
});

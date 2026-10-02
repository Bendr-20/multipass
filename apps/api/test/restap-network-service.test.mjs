import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRestapNetworkServiceConfig, startRestapNetworkService } from '../src/restap-network/service.js';

function config(gates = {}, patch = {}) {
  return {
    gates: { foundation: false, policy: false, discovery: false, initiation: false, replies: false, transcripts: false, pilot: false, ga: false, ...gates },
    databasePath: null,
    operationalHashSalt: null,
    dailyCostLimit: null,
    providerTimeoutMs: 15_000,
    topics: ['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general'],
    cadences: ['once', 'daily'],
    pilotRoster: [],
    gaApproved: false,
    gaRosterRemovalApproved: false,
    ...patch,
  };
}

function dependencies(events = []) {
  return {
    databaseFactory: async () => ({ checkpoint: async () => { events.push('db:checkpoint'); }, close: async () => { events.push('db:close'); } }),
    approvedProviders: [{ approved: true, id: 'provider-a' }],
    codexRuntime: { available: true },
    accountIntegrity: { configured: true },
    custodyReconciler: { async reconcile({ candidates }) { events.push('custody:' + candidates.length); } },
    activationLeases: { async loadInactiveCandidates() { events.push('leases:load'); return ['candidate']; }, async reauthorizeCandidates() { events.push('leases:reauthorize'); } },
    policy: { get() {} },
    eligibility: { resolvePeerForRelay() {} },
    signer: { sign() {} },
    keyRegistry: { get() {} },
    coordinator: { reserve() {} },
    worker: { async start() { events.push('worker:start'); }, async stopAcquisition() { events.push('worker:stop'); }, async awaitCurrent() { events.push('worker:await'); } },
    providerBudget: { read() {} },
    conversations: { async close() { events.push('conversations:close'); } },
    runtime: { generate() {} },
  };
}

function enabledConfig(gates = {}, patch = {}) {
  return config({ foundation: true, ...gates }, { databasePath: '/tmp/restap-network.sqlite', operationalHashSalt: 's'.repeat(32), ...patch });
}

test('all eight network gates default false and configuration is deeply frozen', () => {
  const parsed = parseRestapNetworkServiceConfig({});
  assert.deepEqual(parsed.gates, { foundation: false, policy: false, discovery: false, initiation: false, replies: false, transcripts: false, pilot: false, ga: false });
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.gates), true);
});

test('strict booleans, budgets, topics, cadences, and roster fail closed', () => {
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'yes' }), /exact boolean/i);
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT: '0' }), /positive bounded/i);
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_PROVIDER_TIMEOUT_MS: '30001' }), /positive bounded/i);
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_TOPICS: 'general,secrets' }), /unknown|duplicate/i);
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_CADENCES: 'cron' }), /unknown|duplicate/i);
  assert.throws(() => parseRestapNetworkServiceConfig({ MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '01' }), /canonical/i);
  const parsed = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: '1',
    MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: '/srv/restap.sqlite',
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 'x'.repeat(32),
    MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT: '100',
    MULTIPASS_RESTAP_NETWORK_TOPICS: 'general,collection-lore',
    MULTIPASS_RESTAP_NETWORK_CADENCES: 'once,daily',
    MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '3802,1',
  });
  assert.deepEqual(parsed.topics, ['collection-lore', 'general']);
  assert.deepEqual(parsed.cadences, ['daily', 'once']);
  assert.deepEqual(parsed.pilotRoster, ['1', '3802']);
});

test('disabled foundation never touches dependency sentinels', async () => {
  const sentinels = {};
  for (const name of ['databaseFactory', 'approvedProviders', 'codexRuntime', 'accountIntegrity', 'custodyReconciler', 'activationLeases', 'signer', 'worker']) Object.defineProperty(sentinels, name, { enumerable: true, get() { throw new Error('TOUCHED ' + name); } });
  const service = await startRestapNetworkService({ config: config(), dependencies: sentinels });
  assert.equal(service.status.enabled, false);
  await service.close();
  await service.close();
});

test('later gates reject without their exact predecessor even when foundation is off', async () => {
  for (const [gate, pattern] of [['policy', /foundation/i], ['discovery', /policy/i], ['initiation', /discovery/i], ['replies', /initiation/i], ['pilot', /foundation/i], ['ga', /approval|pilot/i]]) {
    await assert.rejects(() => startRestapNetworkService({ config: config({ [gate]: true }), dependencies: {} }), pattern, gate);
  }
  await assert.rejects(() => startRestapNetworkService({ config: config({ transcripts: true }), dependencies: {} }), /unavailable/i);
});

test('foundation dependency matrix rejects each unavailable prerequisite', async () => {
  const base = enabledConfig();
  const cases = [
    [enabledConfig({}, { databasePath: null }), dependencies(), /database path/i],
    [base, { ...dependencies(), approvedProviders: [] }, /approved providers/i],
    [base, { ...dependencies(), codexRuntime: { available: false } }, /Codex/i],
    [base, { ...dependencies(), accountIntegrity: { configured: false } }, /account-integrity/i],
    [enabledConfig({}, { operationalHashSalt: 'short' }), dependencies(), /hash salt/i],
    [base, { ...dependencies(), custodyReconciler: null }, /custody reconciler/i],
  ];
  for (const [value, deps, pattern] of cases) await assert.rejects(() => startRestapNetworkService({ config: value, dependencies: deps }), pattern);
});

test('policy, discovery, initiation and replies require their dedicated dependencies', async () => {
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ policy: true }), dependencies: { ...dependencies(), activationLeases: null } }), /activation leases/i);
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ policy: true }), dependencies: { ...dependencies(), policy: null } }), /policy service/i);
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ policy: true, discovery: true }), dependencies: { ...dependencies(), eligibility: null } }), /eligibility/i);
  const initiation = enabledConfig({ policy: true, discovery: true, initiation: true }, { dailyCostLimit: 10 });
  for (const [name, pattern] of [['signer', /signer/i], ['keyRegistry', /key registry/i], ['coordinator', /coordinator/i], ['worker', /worker/i], ['providerBudget', /provider budget/i]]) await assert.rejects(() => startRestapNetworkService({ config: initiation, dependencies: { ...dependencies(), [name]: null } }), pattern);
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ policy: true, discovery: true, initiation: true }, { dailyCostLimit: null }), dependencies: dependencies() }), /cost limit/i);
  const replies = enabledConfig({ policy: true, discovery: true, initiation: true, replies: true }, { dailyCostLimit: 10 });
  await assert.rejects(() => startRestapNetworkService({ config: replies, dependencies: { ...dependencies(), conversations: null } }), /conversations/i);
  await assert.rejects(() => startRestapNetworkService({ config: replies, dependencies: { ...dependencies(), runtime: null } }), /runtime/i);
});

test('pilot and GA require protected roster and separate approvals', async () => {
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ pilot: true }), dependencies: dependencies() }), /protected roster/i);
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ pilot: true, ga: true }, { pilotRoster: ['1'], gaApproved: false }), dependencies: dependencies() }), /explicit approval/i);
  const service = await startRestapNetworkService({ config: enabledConfig({ pilot: true, ga: true }, { pilotRoster: [], gaApproved: true, gaRosterRemovalApproved: true }), dependencies: dependencies() });
  assert.equal(service.status.enabled, true);
  await service.close();
});

test('startup and shutdown lifecycle is ordered, bounded, and idempotent', async () => {
  const events = [];
  const service = await startRestapNetworkService({
    config: enabledConfig({ policy: true, discovery: true, initiation: true, replies: true }, { dailyCostLimit: 10 }),
    dependencies: dependencies(events),
  });
  assert.deepEqual(events, ['leases:load', 'custody:1', 'leases:reauthorize', 'worker:start']);
  const first = service.close();
  const second = service.close();
  assert.equal(first, second);
  await first;
  assert.deepEqual(events.slice(4), ['worker:stop', 'worker:await', 'conversations:close', 'db:checkpoint', 'db:close']);
});

test('worker start fault still stops acquisition and awaits bounded current work', async () => {
  const events = [];
  const deps = dependencies(events);
  deps.worker.start = async () => { events.push('worker:start:fault'); throw new Error('worker start failed'); };
  const value = enabledConfig({ policy: true, discovery: true, initiation: true }, { dailyCostLimit: 10 });
  await assert.rejects(() => startRestapNetworkService({ config: value, dependencies: deps }), /worker start failed/);
  assert.deepEqual(events.slice(-5), ['worker:start:fault', 'worker:stop', 'worker:await', 'db:checkpoint', 'db:close']);
});

test('startup and cleanup failures are both surfaced', async () => {
  const deps = dependencies();
  deps.worker.start = async () => { throw new Error('start fault'); };
  deps.worker.stopAcquisition = async () => { throw new Error('stop fault'); };
  const value = enabledConfig({ policy: true, discovery: true, initiation: true }, { dailyCostLimit: 10 });
  await assert.rejects(() => startRestapNetworkService({ config: value, dependencies: deps }), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors.some((item) => item.message === 'start fault'), true);
    assert.equal(error.errors.some((item) => item instanceof AggregateError && item.errors.some((nested) => nested.message === 'stop fault')), true);
    return true;
  });
});

test('startup fault closes already-open resources without starting traffic', async () => {
  const events = [];
  const deps = dependencies(events);
  deps.custodyReconciler = { async reconcile() { events.push('custody:fault'); throw new Error('reconcile failed'); } };
  await assert.rejects(() => startRestapNetworkService({ config: enabledConfig({ policy: true }), dependencies: deps }), /reconcile failed/);
  assert.deepEqual(events, ['leases:load', 'custody:fault', 'db:checkpoint', 'db:close']);
  assert.equal(events.includes('worker:start'), false);
});

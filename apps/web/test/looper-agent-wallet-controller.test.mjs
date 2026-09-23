import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddress, keccak256, sha256 } from 'viem';

import {
  ACCOUNT_SALT,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  LOOPERS_COLLECTION,
  buildLooperAccountRuntimeCode,
  buildPolicyModuleTransaction,
  buildEthSendTransaction,
  createOperationScope,
  deriveLooperAccount,
} from '../src/looper-agent-wallet.js';
import {
  createLooperAgentWalletController,
  createReadOnlyLooperWalletContext,
} from '../src/looper-agent-wallet-controller.js';

const IMPLEMENTATION = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const NEXT_OWNER = '0x3333333333333333333333333333333333333333';
const RECIPIENT = '0x4444444444444444444444444444444444444444';
const IMPLEMENTATION_CODE = '0x6001';
const RUNTIME_HASH = sha256(IMPLEMENTATION_CODE);
const MODULE_REGISTRY = '0x6666666666666666666666666666666666666666';
const REGISTRY_CODE = '0x6002';
const REGISTRY_HASH = sha256(REGISTRY_CODE);
const POLICY_MODULE = '0x7777777777777777777777777777777777777777';
const MODULE_CODE = '0x6003';
const MODULE_SHA256 = sha256(MODULE_CODE);
const MODULE_CODEHASH = keccak256(MODULE_CODE);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_HASH = `0x${'00'.repeat(32)}`;
const TOKEN_ID = '617';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function immediateLocks() {
  const held = new Set();
  return {
    async request(name, options, callback) {
      assert.equal(options.ifAvailable, true);
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

function snapshot(overrides = {}) {
  const implementation = overrides.implementation ?? IMPLEMENTATION;
  const account = deriveLooperAccount({ implementation, tokenId: TOKEN_ID });
  return {
    chainId: 8453,
    blockNumber: '100',
    blockHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    owner: OWNER,
    registry: ERC6551_REGISTRY,
    implementation,
    salt: ACCOUNT_SALT,
    collectionRegistry: ERC6551_REGISTRY,
    collectionImplementation: LEGACY_ACCOUNT_IMPLEMENTATION,
    collectionSalt: ACCOUNT_SALT,
    legacyAccount: deriveLooperAccount({ implementation: LEGACY_ACCOUNT_IMPLEMENTATION, tokenId: TOKEN_ID }),
    legacyRegistryAccount: deriveLooperAccount({ implementation: LEGACY_ACCOUNT_IMPLEMENTATION, tokenId: TOKEN_ID }),
    account,
    collectionAccount: account,
    registryAccount: account,
    operatorCode: '0x',
    accountCode: '0x',
    accountRuntimeSha256: null,
    implementationCode: IMPLEMENTATION_CODE,
    implementationRuntimeSha256: RUNTIME_HASH,
    moduleRegistry: MODULE_REGISTRY,
    moduleRegistryCode: REGISTRY_CODE,
    moduleRegistryRuntimeSha256: REGISTRY_HASH,
    registryPaused: false,
    policyModule: ZERO_ADDRESS,
    policyModuleOwner: ZERO_ADDRESS,
    policyEpoch: '0',
    policyModuleCode: '0x',
    policyModuleRuntimeSha256: null,
    policyModuleCodehash: null,
    approvedModuleCodehash: ZERO_HASH,
    policyModuleApproved: false,
    policyModuleCodehashMatches: false,
    policyEvidenceRead: true,
    accountOwner: OWNER,
    accountTokenChainId: 8453,
    accountTokenContract: LOOPERS_COLLECTION,
    accountTokenId: TOKEN_ID,
    state: '0',
    nativeWei: '1000',
    tokens: [{ contract: '0x5555555555555555555555555555555555555555', symbol: 'CRED', decimals: 18, balanceBaseUnits: '25' }],
    refreshedAt: '2026-09-21T23:59:00.000Z',
    ...overrides,
  };
}

function deployedSnapshot(overrides = {}) {
  const implementation = overrides.implementation ?? IMPLEMENTATION;
  const accountCode = buildLooperAccountRuntimeCode({ implementation, tokenId: TOKEN_ID });
  return snapshot({ accountCode, accountRuntimeSha256: sha256(accountCode), accountCodeMatches: true, ...overrides });
}

function controllerFixture({
  snapshots = [],
  submit,
  receipt,
  storage = memoryStorage(),
  locks = immediateLocks(),
  getWalletChainId = async () => '0x2105',
  generateAttemptId,
} = {}) {
  const phases = [];
  const requests = [];
  let index = 0;
  const fallback = snapshots.at(-1) ?? snapshot();
  const controller = createLooperAgentWalletController({
    releaseConfig: {
      implementation: IMPLEMENTATION,
      runtimeSha256: RUNTIME_HASH,
      moduleRegistry: MODULE_REGISTRY,
      moduleRegistryRuntimeSha256: REGISTRY_HASH,
    },
    storage,
    locks,
    getWalletChainId,
    generateAttemptId,
    async readSnapshot(request) {
      phases.push(request.phase);
      requests.push(structuredClone(request));
      const next = snapshots[index++] ?? fallback;
      if (next instanceof Error) throw next;
      return structuredClone(next);
    },
    submitTransaction: submit ?? (async () => '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
    readReceipt: receipt ?? (async ({ transaction }) => ({
      status: 'success',
      transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      transaction,
      logs: [],
    })),
  });
  return { controller, phases, requests, storage };
}

test('inactive activation passes EOA gates at readiness, pre-sign and receipt before attribution', async () => {
  const active = deployedSnapshot();
  const f = controllerFixture({
    snapshots: [snapshot(), snapshot(), snapshot(), active],
    receipt: async ({ transaction }) => ({
      status: 'success',
      transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      transaction,
      logs: [{ eventName: 'AccountCreated', account: snapshot().collectionAccount }],
    }),
  });

  assert.equal((await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER })).mode, 'inactive');
  const prepared = await f.controller.prepareActivation();
  assert.equal(prepared.kind, 'activation');
  assert.equal(prepared.requiresExplicitConfirmation, true);
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: false }), /confirmation/i);
  const confirmed = await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.equal(confirmed.activation.state, 'confirmed_attributed');
  assert.deepEqual(f.phases, ['readiness', 'pre_sign', 'pre_sign', 'receipt']);
});

test('inactive activation requires exact reviewed module registry address, code and runtime hash', async () => {
  assert.equal((await controllerFixture({ snapshots: [snapshot()] }).controller.select({ tokenId: TOKEN_ID, owner: OWNER })).canTransact, true);
  for (const evidence of [
    snapshot({ moduleRegistry: null, moduleRegistryCode: null, moduleRegistryRuntimeSha256: null }),
    snapshot({ moduleRegistry: NEXT_OWNER }),
    snapshot({ moduleRegistryCode: '0x', moduleRegistryRuntimeSha256: null }),
    snapshot({ moduleRegistryRuntimeSha256: RUNTIME_HASH }),
  ]) {
    const f = controllerFixture({ snapshots: [evidence] });
    const result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    assert.equal(result.mode, 'read_only');
    assert.equal(result.reason, 'registry_mismatch');
    assert.equal(result.canTransact, false);
    assert.equal(result.policyStatus, 'read-only');
    assert.equal(result.policyRecoveryAllowed, false);
  }
});

test('EOA gate rejects contract or delegated operator at readiness and again before signing', async () => {
  let f = controllerFixture({ snapshots: [snapshot({ operatorCode: '0xef0100abcd' })] });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(selected.mode, 'read_only');
  assert.equal(f.controller.getSnapshot().mode, 'read_only');
  assert.equal(f.controller.getSnapshot().reason, 'unsupported_wallet');

  let submissions = 0;
  f = controllerFixture({
    snapshots: [snapshot(), snapshot(), snapshot({ operatorCode: '0x6001' })],
    submit: async () => { submissions += 1; return '0x1'; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareActivation();
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /EOA|wallet/i);
  assert.equal(submissions, 0);
  assert.equal(f.controller.getSnapshot().activation.state, 'invalidated');
  assert.equal(f.controller.getSnapshot().activation.preparedId, null);
});

test('active ETH send requires exact direct receipt attribution and state increment', async () => {
  const active = deployedSnapshot({ state: '7' });
  const post = deployedSnapshot({ state: '8', nativeWei: '900' });
  const f = controllerFixture({
    snapshots: [active, active, active, post],
    receipt: async ({ transaction }) => ({
      status: 'success',
      transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '8' }],
    }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '100' });
  assert.deepEqual(prepared.transaction, buildEthSendTransaction({
    owner: OWNER,
    account: active.collectionAccount,
    recipient: RECIPIENT,
    amountWei: '100',
  }));
  const result = await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.equal(result.send.state, 'confirmed_attributed');
  assert.equal(result.accountState, '8');
});

test('receipt mismatch fails closed instead of inferring success from balances', async () => {
  const active = deployedSnapshot({ state: '2' });
  const f = controllerFixture({
    snapshots: [active, active, active, { ...active, state: '3', nativeWei: '1' }],
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction: { ...transaction, to: RECIPIENT },
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '3' }],
    }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /attribution|binding/i);
  assert.equal(f.controller.getSnapshot().send.state, 'uncertain_hashed');
  assert.equal((await f.controller.acknowledgeUnknown('send')).send.state, 'acknowledged_unknown');
  const next = await f.controller.select({ tokenId: '618', owner: OWNER });
  assert.equal(next.tokenId, '618');
});

test('reverted receipts require exact transaction-by-hash binding before becoming terminal', async () => {
  const active = deployedSnapshot({ state: '2' });
  const expected = buildEthSendTransaction({
    owner: OWNER,
    account: active.collectionAccount,
    recipient: RECIPIENT,
    amountWei: '1',
  });
  const mismatches = [
    { label: 'missing transaction-by-hash', transaction: undefined },
    { label: 'from mismatch', transaction: { ...expected, from: NEXT_OWNER } },
    { label: 'to mismatch', transaction: { ...expected, to: RECIPIENT } },
    { label: 'input mismatch', transaction: { ...expected, data: '0x' } },
    { label: 'value mismatch', transaction: { ...expected, value: '0x1' } },
  ];
  for (const { label, transaction } of mismatches) {
    const f = controllerFixture({
      snapshots: [active, active, active],
      receipt: async () => ({ status: 'reverted', transaction, logs: [] }),
    });
    await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
    await assert.rejects(
      f.controller.submitPrepared(prepared.id, { confirmed: true }),
      /reverted receipt transaction binding.*(?:missing|mismatch)/i,
      label,
    );
    assert.equal(f.controller.getSnapshot().send.state, 'uncertain_hashed', label);
  }

  const f = controllerFixture({
    snapshots: [active, active, active],
    receipt: async ({ transaction }) => ({ status: 'reverted', transaction, logs: [] }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /reverted on Base/i);
  assert.equal(f.controller.getSnapshot().send.state, 'reverted');
  assert.equal((await f.controller.select({ tokenId: '618', owner: OWNER })).tokenId, '618');
});

test('unreadable receipts remain acknowledgeable unknown outcomes', async () => {
  const active = deployedSnapshot({ state: '2' });
  const f = controllerFixture({
    snapshots: [active, active, active],
    receipt: async () => { throw new Error('receipt temporarily unavailable'); },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /temporarily unavailable/i);
  assert.equal(f.controller.getSnapshot().send.state, 'uncertain_hashed');
  assert.equal((await f.controller.acknowledgeUnknown('send')).send.state, 'acknowledged_unknown');
  await assert.rejects(async () => f.controller.acknowledgeUnknown('send'), /No uncertain/i);
});

test('acknowledging an unknown send restores the latest fresh writable readiness immediately', async () => {
  const active = deployedSnapshot({ state: '2' });
  const post = deployedSnapshot({ state: '3', nativeWei: '999' });
  const storage = memoryStorage();
  const f = controllerFixture({
    snapshots: [active, active, active, post],
    storage,
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: RECIPIENT, state: '3' }],
    }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /attribution/i);
  assert.equal(f.controller.getSnapshot().mode, 'blocked');
  assert.equal(f.controller.getSnapshot().canTransact, false);
  assert.equal(f.controller.getSnapshot().send.state, 'uncertain_hashed');

  const acknowledged = await f.controller.acknowledgeUnknown('send');
  assert.equal(acknowledged.mode, 'active');
  assert.equal(acknowledged.canTransact, true);
  assert.equal(acknowledged.accountState, '3');
  assert.equal(acknowledged.nativeWei, '999');
  assert.equal(acknowledged.send.state, 'acknowledged_unknown');
  const [, storedValue] = [...storage.values.entries()].find(([key]) => key.includes('.send.'));
  assert.equal(JSON.parse(storedValue).state, 'acknowledged_unknown');
});

test('review finding 7: a later send preserves permanent acknowledged-unknown history without retry', async () => {
  const active = deployedSnapshot({ state: '2' });
  const storage = memoryStorage();
  let id = 0;
  const f = controllerFixture({
    snapshots: [active, active, active, active],
    storage,
    generateAttemptId: () => `attempt-${String(++id).padStart(8, '0')}`,
    receipt: async () => { throw new Error('receipt unavailable'); },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const first = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(first.id, { confirmed: true }), /receipt unavailable/i);
  const acknowledged = await f.controller.acknowledgeUnknown('send');
  assert.equal(acknowledged.send.state, 'acknowledged_unknown');
  assert.equal(acknowledged.send.permanentHistory.length, 1);
  assert.equal(acknowledged.send.permanentHistory[0].id, first.id);
  assert.equal(acknowledged.send.permanentHistory[0].state, 'acknowledged_unknown');
  assert.equal(acknowledged.send.permanentHistory[0].retryEligible, false);

  const later = await f.controller.prepareEthSend({ recipient: NEXT_OWNER, amountWei: '2' });
  assert.notEqual(later.id, first.id);
  const snapshotAfterLaterSend = f.controller.getSnapshot();
  assert.equal(snapshotAfterLaterSend.send.state, 'prepared');
  assert.equal(snapshotAfterLaterSend.send.permanentHistory.length, 1);
  assert.equal(snapshotAfterLaterSend.send.permanentHistory[0].id, first.id);
  assert.equal(snapshotAfterLaterSend.send.permanentHistory[0].state, 'acknowledged_unknown');
  assert.equal(snapshotAfterLaterSend.send.permanentHistory[0].retryEligible, false);
  assert.equal([...storage.values.keys()].some((key) => key.endsWith('.acknowledgedUnknownHistory')), true);
});


test('review finding: acknowledged unknown send archives before mutation and preserves newer cross-tab work', async () => {
  const active = deployedSnapshot({ state: '2' });
  const storage = memoryStorage();
  const failing = controllerFixture({
    snapshots: [active, active, active, active], storage,
    generateAttemptId: () => 'ack-storage-failure',
    receipt: async () => { throw new Error('receipt unavailable'); },
  });
  await failing.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const failed = await failing.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(failing.controller.submitPrepared(failed.id, { confirmed: true }), /receipt unavailable/i);
  const beforeFailedAcknowledgment = failing.controller.getSnapshot();
  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.endsWith('.acknowledgedUnknownHistory')) throw new Error('history persistence failed');
    return originalSetItem(key, value);
  };
  await assert.rejects(failing.controller.acknowledgeUnknown('send'), /history persistence failed/i);
  assert.equal(failing.controller.getSnapshot().send.state, 'uncertain_hashed');
  assert.equal(failing.controller.getSnapshot().mode, beforeFailedAcknowledgment.mode);
  assert.equal(failing.controller.getSnapshot().canTransact, beforeFailedAcknowledgment.canTransact);
  storage.setItem = originalSetItem;

  const shared = memoryStorage();
  let id = 0;
  const first = controllerFixture({
    snapshots: [active, active, active, active], storage: shared,
    generateAttemptId: () => `first-${String(++id).padStart(8, '0')}`,
    receipt: async () => { throw new Error('receipt unavailable'); },
  });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const firstPrepared = await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(first.controller.submitPrepared(firstPrepared.id, { confirmed: true }), /receipt unavailable/i);
  const second = controllerFixture({ snapshots: [active, active], storage: shared, generateAttemptId: () => 'second-00000001' });
  await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await second.controller.acknowledgeUnknown('send');
  const later = await second.controller.prepareEthSend({ recipient: NEXT_OWNER, amountWei: '2' });
  await assert.rejects(first.controller.acknowledgeUnknown('send'), /changed|latest|stale/i);
  const scope = createOperationScope({ tokenId: TOKEN_ID, account: active.account, owner: OWNER, kind: 'send' });
  assert.equal(JSON.parse(shared.getItem(scope.storageKey)).id, later.id);
});

test('attempt state reloads by owner scope and a second tab cannot resubmit terminal work', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot({ state: '0' });
  const post = { ...active, state: '1' };
  const first = controllerFixture({
    snapshots: [active, active, active, post],
    storage,
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
    }),
  });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await first.controller.submitPrepared(prepared.id, { confirmed: true });

  const second = controllerFixture({
    snapshots: [post],
    storage,
    receipt: async ({ transaction }) => ({
      status: 'success',
      transactionHash: `0x${'cc'.repeat(32)}`,
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
    }),
  });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(restored.send.state, 'confirmed_attributed');
  await assert.rejects(second.controller.submitPrepared(prepared.id, { confirmed: true }), /prepared attempt/i);
});

test('wallet chain is re-read under the operation lock immediately before every submission', async () => {
  const cases = [
    {
      evidence: snapshot(),
      prepare: (controller) => controller.prepareActivation(),
      attempt: 'activation',
    },
    {
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' }),
      attempt: 'send',
    },
    {
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.preparePolicyModule({ module: ZERO_ADDRESS }),
      attempt: 'policy',
    },
  ];
  for (const entry of cases) {
    const events = [];
    const f = controllerFixture({
      snapshots: [entry.evidence, entry.evidence, entry.evidence],
      getWalletChainId: async () => { events.push('chain'); return '0x1'; },
      submit: async () => { events.push('submit'); return `0x${'cc'.repeat(32)}`; },
    });
    await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    const prepared = await entry.prepare(f.controller);
    await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /Base|chain/i);
    assert.deepEqual(events, ['chain']);
    assert.equal(f.controller.getSnapshot()[entry.attempt].state, 'invalidated');
    assert.equal(f.controller.getSnapshot()[entry.attempt].preparedId, null);
  }
});

test('wallet chain check is the final awaited guard before the EIP-1193 submission boundary', async () => {
  const active = deployedSnapshot({ state: '0' });
  const post = deployedSnapshot({ state: '1' });
  const events = [];
  const f = controllerFixture({
    snapshots: [active, active, active, post],
    getWalletChainId: async () => { events.push('chain'); return '0x2105'; },
    submit: async () => { events.push('submit'); return `0x${'cc'.repeat(32)}`; },
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
    }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.deepEqual(events, ['chain', 'submit']);
});

test('persisted preview drift during the final chain read is rejected before wallet submission', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot();
  let releaseChainRead;
  let chainReadStarted;
  const chainStarted = new Promise((resolve) => { chainReadStarted = resolve; });
  const chainGate = new Promise((resolve) => { releaseChainRead = resolve; });
  let submissions = 0;
  const f = controllerFixture({
    snapshots: [active, active, active],
    storage,
    getWalletChainId: async () => {
      chainReadStarted();
      await chainGate;
      return '0x2105';
    },
    submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  const submitting = f.controller.submitPrepared(prepared.id, { confirmed: true });
  await chainStarted;
  const [key, raw] = [...storage.values.entries()].find(([entry]) => entry.includes('.send.'));
  const record = JSON.parse(raw);
  storage.values.set(key, JSON.stringify({ ...record, transaction: { ...record.transaction, data: '0x' } }));
  releaseChainRead();
  await assert.rejects(submitting, /persisted|changed|preview/i);
  assert.equal(submissions, 0);
  assert.equal(f.controller.getSnapshot().send.state, 'invalidated');
});

test('cross-tab invalidation during the final wallet chain check blocks submission', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot({ state: '0' });
  const post = deployedSnapshot({ state: '1' });
  let submissions = 0;
  const f = controllerFixture({
    snapshots: [active, active, active, post],
    storage,
    getWalletChainId: async () => {
      const [key, raw] = [...storage.values.entries()].find(([entry]) => entry.includes('.send.'));
      const record = JSON.parse(raw);
      storage.values.set(key, JSON.stringify({
        ...record,
        state: 'invalidated',
        history: [...record.history, { state: 'invalidated', at: Date.now() }],
      }));
      return '0x2105';
    },
    submit: async () => {
      submissions += 1;
      return `0x${'cc'.repeat(32)}`;
    },
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
    }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /persisted|changed|exact/i);
  assert.equal(submissions, 0);
  assert.equal(f.controller.getSnapshot().send.state, 'invalidated');
});

test('restored prepared attempts are invalidated and malformed persisted attempts are discarded', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot();
  const first = controllerFixture({ snapshots: [active, active], storage, generateAttemptId: () => 'attempt-a' });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });

  const second = controllerFixture({ snapshots: [active], storage });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(restored.send.state, 'invalidated');
  assert.equal(restored.send.preparedId, null);
  await assert.rejects(second.controller.submitPrepared(prepared.id, { confirmed: true }), /prepared attempt/i);

  const scope = createOperationScope({ tokenId: TOKEN_ID, account: active.collectionAccount, owner: OWNER, kind: 'send' });
  const malformed = JSON.parse(storage.getItem(scope.storageKey));
  storage.setItem(scope.storageKey, JSON.stringify({ ...malformed, unexpected: true }));
  const third = controllerFixture({ snapshots: [active], storage });
  const discarded = await third.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(discarded.send.state, 'idle');
  assert.equal(storage.getItem(scope.storageKey), null);
});

test('restored submitted attempts become explicitly acknowledgeable instead of blocking forever', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot();
  const first = controllerFixture({ snapshots: [active, active], storage, generateAttemptId: () => 'attempt-submitted' });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  const scope = createOperationScope({ tokenId: TOKEN_ID, account: active.collectionAccount, owner: OWNER, kind: 'send' });
  const prepared = JSON.parse(storage.getItem(scope.storageKey));
  storage.setItem(scope.storageKey, JSON.stringify({
    ...prepared,
    state: 'submitted',
    txHash: `0x${'cc'.repeat(32)}`,
    history: [...prepared.history, { state: 'submitted', at: prepared.history[0].at + 1 }],
  }));

  const second = controllerFixture({ snapshots: [active], storage });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(restored.send.state, 'uncertain_hashed');
  assert.equal((await second.controller.acknowledgeUnknown('send')).send.state, 'acknowledged_unknown');
  assert.equal((await second.controller.select({ tokenId: '618', owner: OWNER })).tokenId, '618');
});

test('persisted confirmed attribution is restored only after fresh receipt and post-state verification', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot({ state: '0' });
  const first = controllerFixture({ snapshots: [active, active], storage, generateAttemptId: () => 'attempt-forged' });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  const scope = createOperationScope({ tokenId: TOKEN_ID, account: active.collectionAccount, owner: OWNER, kind: 'send' });
  const prepared = JSON.parse(storage.getItem(scope.storageKey));
  const forged = {
    ...prepared,
    state: 'confirmed_attributed',
    attributable: true,
    txHash: `0x${'cc'.repeat(32)}`,
    history: [
      ...prepared.history,
      { state: 'submitted', at: prepared.history[0].at + 1 },
      { state: 'confirmed_attributed', at: prepared.history[0].at + 2 },
    ],
  };
  storage.setItem(scope.storageKey, JSON.stringify(forged));
  let receiptReads = 0;
  const second = controllerFixture({
    snapshots: [active],
    storage,
    receipt: async () => { receiptReads += 1; throw new Error('No canonical receipt.'); },
  });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(receiptReads, 1);
  assert.equal(restored.send.state, 'idle');
  assert.equal(storage.getItem(scope.storageKey), null);
});

test('every operation kind rejects malformed persisted schemas before restore', async () => {
  const cases = [
    {
      kind: 'activation',
      evidence: snapshot(),
      prepare: (controller) => controller.prepareActivation(),
      mutate: (record) => ({ ...record, account: '0x1234' }),
    },
    {
      kind: 'send',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' }),
      mutate: (record) => ({ ...record, history: [{ state: 'prepared', at: '0' }] }),
    },
    {
      kind: 'policy',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.preparePolicyModule({ module: ZERO_ADDRESS }),
      mutate: (record) => ({ ...record, targetPolicyModule: '0x1234' }),
    },
  ];
  for (const [index, entry] of cases.entries()) {
    const storage = memoryStorage();
    const first = controllerFixture({
      snapshots: [entry.evidence, entry.evidence],
      storage,
      generateAttemptId: () => `schema-case-${index}`,
    });
    await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    await entry.prepare(first.controller);
    const [key, raw] = [...storage.values.entries()].find(([value]) => value.includes(`.${entry.kind}.`));
    storage.values.set(key, JSON.stringify(entry.mutate(JSON.parse(raw))));

    const second = controllerFixture({ snapshots: [entry.evidence], storage });
    const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    assert.equal(restored[entry.kind].state, 'idle');
    assert.equal(storage.getItem(key), null);
  }
});

test('attempt ids use the injected collision-resistant generator and persisted transaction drift blocks signing', async () => {
  const storage = memoryStorage();
  let submissions = 0;
  const active = deployedSnapshot();
  const f = controllerFixture({
    snapshots: [active, active, active],
    storage,
    generateAttemptId: () => '550e8400-e29b-41d4-a716-446655440000',
    submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  assert.equal(prepared.id, 'send:550e8400-e29b-41d4-a716-446655440000');
  const [key, raw] = [...storage.values.entries()].find(([entry]) => entry.includes('.send.'));
  const stored = JSON.parse(raw);
  storage.values.set(key, JSON.stringify({
    ...stored,
    transaction: { ...stored.transaction, to: RECIPIENT },
  }));
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /exact|persisted|transaction/i);
  assert.equal(submissions, 0);
  assert.equal(f.controller.getSnapshot().send.state, 'invalidated');
});

test('activation, send and policy attempts all reject persisted transaction drift before the wallet boundary', async () => {
  const cases = [
    {
      kind: 'activation',
      evidence: snapshot(),
      prepare: (controller) => controller.prepareActivation(),
    },
    {
      kind: 'send',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' }),
    },
    {
      kind: 'policy',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.preparePolicyModule({ module: ZERO_ADDRESS }),
    },
  ];
  for (const [index, entry] of cases.entries()) {
    const storage = memoryStorage();
    let submissions = 0;
    const f = controllerFixture({
      snapshots: [entry.evidence, entry.evidence, entry.evidence],
      storage,
      generateAttemptId: () => `attempt-drift-${index}`,
      submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
    });
    await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    const prepared = await entry.prepare(f.controller);
    const [key, raw] = [...storage.values.entries()].find(([value]) => value.includes(`.${entry.kind}.`));
    const record = JSON.parse(raw);
    storage.values.set(key, JSON.stringify({
      ...record,
      transaction: { ...record.transaction, data: '0x' },
    }));
    await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /exact|persisted|transaction/i);
    assert.equal(submissions, 0);
    assert.equal(f.controller.getSnapshot()[entry.kind].state, 'invalidated');
  }
});

test('malformed submitted attempts never restore into receipt-trackable state', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot();
  const first = controllerFixture({ snapshots: [active, active], storage, generateAttemptId: () => 'attempt-b' });
  await first.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await first.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  const [key, raw] = [...storage.values.entries()].find(([entry]) => entry.includes('.send.'));
  const record = JSON.parse(raw);
  storage.values.set(key, JSON.stringify({ ...record, state: 'submitted', txHash: '0x1234' }));

  const second = controllerFixture({ snapshots: [active], storage });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(restored.send.state, 'idle');
  assert.equal(storage.getItem(key), null);
});

test('selection changes cannot carry nonterminal or terminal attempts across agent scopes', async () => {
  const storage = memoryStorage();
  const active = deployedSnapshot();
  const f = controllerFixture({ snapshots: [active, active, active], storage });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.select({ tokenId: '618', owner: OWNER }), /pending|nonterminal|operation/i);
  assert.equal(f.controller.getSnapshot().tokenId, TOKEN_ID);
  assert.equal(f.controller.getSnapshot().send.state, 'invalidated');

  const otherAccount = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: '618' });
  const otherCode = buildLooperAccountRuntimeCode({ implementation: IMPLEMENTATION, tokenId: '618' });
  const other = deployedSnapshot({
    collectionAccount: otherAccount,
    registryAccount: otherAccount,
    accountCode: otherCode,
    accountRuntimeSha256: sha256(otherCode),
  });
  const terminal = controllerFixture({
    snapshots: [active, active, active, { ...active, state: '1' }, other],
    storage: memoryStorage(),
    receipt: async ({ transaction }) => ({
      status: 'success',
      transaction,
      logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
    }),
  });
  await terminal.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await terminal.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await terminal.controller.submitPrepared(prepared.id, { confirmed: true });
  const selectedOther = await terminal.controller.select({ tokenId: '618', owner: OWNER });
  assert.equal(selectedOther.tokenId, '618');
  assert.equal(selectedOther.send.state, 'idle');
});

test('submitted work blocks agent changes and receipt revalidation stays bound to its original token and account', async () => {
  const active = deployedSnapshot({ state: '0' });
  const post = deployedSnapshot({ state: '1' });
  let releaseReceipt;
  let receiptStarted;
  const started = new Promise((resolve) => { receiptStarted = resolve; });
  const receiptGate = new Promise((resolve) => { releaseReceipt = resolve; });
  const f = controllerFixture({
    snapshots: [active, active, active, post],
    receipt: async ({ transaction }) => {
      receiptStarted();
      await receiptGate;
      return {
        status: 'success',
        transaction,
        logs: [{ eventName: 'StateUpdated', address: active.collectionAccount, state: '1' }],
      };
    },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  const submitting = f.controller.submitPrepared(prepared.id, { confirmed: true });
  await started;
  assert.equal(f.controller.getSnapshot().send.state, 'submitted');
  await assert.rejects(f.controller.select({ tokenId: '618', owner: OWNER }), /nonterminal|operation/i);
  assert.equal(f.controller.getSnapshot().tokenId, TOKEN_ID);
  releaseReceipt();
  await submitting;
  const receiptRequest = f.requests.find((request) => request.phase === 'receipt');
  assert.deepEqual(receiptRequest.selection, { tokenId: TOKEN_ID, owner: getAddress(OWNER) });
  assert.equal(receiptRequest.expectedAccount, active.collectionAccount);
});

test('select and refresh RPC errors replace stale capabilities and prepared work with fail-closed state', async () => {
  const active = deployedSnapshot();
  let f = controllerFixture({ snapshots: [active, new Error('Base wallet snapshots disagree.')] });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await assert.rejects(f.controller.select({ tokenId: TOKEN_ID, owner: OWNER }), /disagree/i);
  let failed = f.controller.getSnapshot();
  assert.equal(failed.mode, 'read_only');
  assert.equal(failed.reason, 'rpc_disagreement');
  assert.equal(failed.canTransact, false);
  assert.equal(failed.policyStatus, 'read-only');
  assert.equal(failed.policyRecoveryAllowed, false);

  f = controllerFixture({ snapshots: [active, active, new Error('policy read reverted'), active, active] });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const first = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  await assert.rejects(f.controller.refresh(), /reverted/i);
  failed = f.controller.getSnapshot();
  assert.equal(failed.mode, 'read_only');
  assert.equal(failed.canTransact, false);
  assert.equal(failed.policyStatus, 'read-only');
  assert.equal(failed.policyRecoveryAllowed, false);
  assert.equal(failed.send.state, 'invalidated');
  assert.equal(failed.send.preparedId, null);
  await f.controller.refresh();
  const replacement = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '2' });
  assert.notEqual(replacement.id, first.id);
});

test('every activation, send and policy pre-sign read error invalidates the attempt and permits a fresh preview', async () => {
  const cases = [
    {
      kind: 'activation',
      evidence: snapshot(),
      prepare: (controller) => controller.prepareActivation(),
      attempt: 'activation',
    },
    {
      kind: 'send',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' }),
      attempt: 'send',
    },
    {
      kind: 'policy',
      evidence: deployedSnapshot(),
      prepare: (controller) => controller.preparePolicyModule({ module: ZERO_ADDRESS }),
      attempt: 'policy',
    },
  ];
  for (const entry of cases) {
    const f = controllerFixture({
      snapshots: [entry.evidence, entry.evidence, new Error(`${entry.kind} pre-sign read failed`), entry.evidence, entry.evidence],
    });
    await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    const first = await entry.prepare(f.controller);
    await assert.rejects(f.controller.submitPrepared(first.id, { confirmed: true }), /pre-sign read failed/);
    const invalidated = f.controller.getSnapshot()[entry.attempt];
    assert.equal(invalidated.state, 'invalidated');
    assert.equal(invalidated.preparedId, null);
    await f.controller.refresh();
    const replacement = await entry.prepare(f.controller);
    assert.notEqual(replacement.id, first.id);
  }
});

test('ownership transfer and config drift clear write capability while retaining read-only evidence', async () => {
  const active = deployedSnapshot();
  const f = controllerFixture({ snapshots: [active, { ...active, owner: NEXT_OWNER }] });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const moved = await f.controller.refresh();
  assert.equal(moved.mode, 'blocked');
  assert.equal(moved.reason, 'owner_changed');
  assert.equal(moved.account, active.collectionAccount);

  const drift = controllerFixture({ snapshots: [snapshot({ implementation: '0x6666666666666666666666666666666666666666' })] });
  const drifted = await drift.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(drifted.mode, 'read_only');
  assert.equal(drifted.reason, 'config_drift');

  const configDrift = controllerFixture({ snapshots: [snapshot({ registry: ZERO_ADDRESS })] });
  assert.equal((await configDrift.controller.select({ tokenId: TOKEN_ID, owner: OWNER })).reason, 'config_drift');
});

test('a transfer changes direct reviewed account authority without changing its NFT binding', async () => {
  const before = deployedSnapshot();
  const after = deployedSnapshot({ owner: NEXT_OWNER, accountOwner: NEXT_OWNER });
  const f = controllerFixture({ snapshots: [before, after, after] });
  assert.equal((await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER })).mode, 'active');
  const moved = await f.controller.refresh();
  assert.equal(moved.reason, 'owner_changed');
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: NEXT_OWNER });
  assert.equal(selected.mode, 'active');
  assert.equal(selected.account, before.account);
  const prepared = await f.controller.prepareEthSend({ recipient: RECIPIENT, amountWei: '1' });
  assert.equal(prepared.transaction.from, getAddress(NEXT_OWNER));
  assert.equal(prepared.transaction.to, before.account);
});

test('legacy configured account stays visible while the distinct reviewed account remains writable', async () => {
  const direct = deployedSnapshot();
  const f = controllerFixture({ snapshots: [direct] });
  const result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.mode, 'active');
  assert.equal(result.account, direct.account);
  assert.equal(result.legacyAccount, direct.legacyAccount);
  assert.notEqual(result.account, result.legacyAccount);
});

test('read-only agent context is owner scoped and excludes attempts, calldata and capabilities', async () => {
  const active = deployedSnapshot();
  const f = controllerFixture({ snapshots: [active] });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const context = createReadOnlyLooperWalletContext(selected);
  assert.equal(context.scope.owner, OWNER);
  assert.equal(context.scope.tokenId, TOKEN_ID);
  assert.deepEqual(context.capabilities, { read: true, sign: false, submit: false, approve: false });
  assert.equal(context.native.balanceWei, '1000');
  assert.equal(context.tokens[0].balanceBaseUnits, '25');
  assert.equal(JSON.stringify(context).includes('transaction'), false);
  assert.equal(JSON.stringify(context).includes('prepared'), false);
  assert.equal(Object.isFrozen(context), true);
});

test('policy status is fail-closed across owner-only, paused, blocked, ownership mismatch and active policy', async () => {
  const base = deployedSnapshot();
  let f = controllerFixture({ snapshots: [base] });
  let result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.policyStatus, 'owner-only');
  assert.equal(result.canTransact, true);

  const configured = {
    ...base,
    policyModule: POLICY_MODULE,
    policyModuleOwner: OWNER,
    policyEpoch: '3',
    policyModuleCode: MODULE_CODE,
    policyModuleRuntimeSha256: MODULE_SHA256,
    policyModuleCodehash: MODULE_CODEHASH,
    approvedModuleCodehash: MODULE_CODEHASH,
    policyModuleApproved: true,
    policyModuleCodehashMatches: true,
  };
  f = controllerFixture({ snapshots: [snapshot({ ...configured, registryPaused: true })] });
  result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.policyStatus, 'permission-hook-paused');
  assert.equal(result.canTransact, true);

  f = controllerFixture({ snapshots: [snapshot({
    ...configured,
    approvedModuleCodehash: ZERO_HASH,
    policyModuleApproved: false,
    policyModuleCodehashMatches: false,
  })] });
  result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.policyStatus, 'module-blocked');
  assert.equal(result.mode, 'read_only');
  assert.equal(result.canTransact, false);
  assert.equal(result.policyRecoveryAllowed, true);

  f = controllerFixture({ snapshots: [snapshot({ ...configured, policyModuleOwner: NEXT_OWNER })] });
  result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.policyStatus, 'ownership-mismatch');
  assert.equal(result.canTransact, false);

  f = controllerFixture({ snapshots: [snapshot(configured)] });
  result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.policyStatus, 'active-policy');
  assert.equal(result.canTransact, true);
  assert.equal(result.implementationRuntimeSha256, RUNTIME_HASH);
  assert.equal(result.accountRuntimeSha256, sha256(base.accountCode));
  assert.equal(result.moduleRegistryRuntimeSha256, REGISTRY_HASH);
  assert.equal(result.policyModuleRuntimeSha256, MODULE_SHA256);
  assert.equal(result.policyModuleCodehash, MODULE_CODEHASH);
  assert.equal(result.approvedModuleCodehash, MODULE_CODEHASH);
  assert.equal(result.policyModuleApproved, true);
  assert.equal(result.policyModuleOwnerMatches, true);
});

test('malformed or contradictory runtime and policy evidence never enables owner writes', async () => {
  const active = deployedSnapshot();
  const cases = [
    { ...active, implementationRuntimeSha256: REGISTRY_HASH },
    { ...active, accountRuntimeSha256: RUNTIME_HASH },
    { ...active, moduleRegistryRuntimeSha256: RUNTIME_HASH },
    { ...active, collectionImplementation: IMPLEMENTATION },
    { ...active, legacyAccount: active.account },
    { ...active, registryAccount: active.legacyAccount },
    { ...active, accountOwner: NEXT_OWNER },
    { ...active, accountTokenChainId: 1 },
    { ...active, policyModuleOwner: OWNER },
    {
      ...active,
      policyModule: POLICY_MODULE,
      policyModuleOwner: OWNER,
      policyEpoch: '01',
      policyModuleCode: MODULE_CODE,
      policyModuleRuntimeSha256: MODULE_SHA256,
      policyModuleCodehash: MODULE_CODEHASH,
      approvedModuleCodehash: MODULE_CODEHASH,
      policyModuleApproved: true,
      policyModuleCodehashMatches: true,
    },
    {
      ...active,
      policyModule: POLICY_MODULE,
      policyModuleOwner: OWNER,
      policyEpoch: '1',
      policyModuleCode: MODULE_CODE,
      policyModuleRuntimeSha256: MODULE_SHA256,
      policyModuleCodehash: MODULE_CODEHASH,
      approvedModuleCodehash: ZERO_HASH,
      policyModuleApproved: true,
      policyModuleCodehashMatches: true,
    },
  ];
  for (const evidence of cases) {
    const f = controllerFixture({ snapshots: [evidence] });
    const result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
    assert.equal(result.canTransact, false);
    assert.notEqual(result.mode, 'active');
  }
});

test('unknown policy release constants block trust without substituting proxy runtime hash', async () => {
  const evidence = deployedSnapshot();
  const controller = createLooperAgentWalletController({
    releaseConfig: { implementation: IMPLEMENTATION, runtimeSha256: null, moduleRegistry: null, moduleRegistryRuntimeSha256: null },
    readSnapshot: async () => evidence,
    getWalletChainId: async () => '0x2105',
    submitTransaction: async () => { throw new Error('must not submit'); },
    readReceipt: async () => { throw new Error('must not read receipt'); },
  });
  const result = await controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.mode, 'read_only');
  assert.equal(result.reason, 'release_unset');
  assert.equal(result.canTransact, false);
});

test('policy recovery permits an exact clear while the registry is paused', async () => {
  const paused = deployedSnapshot({
    policyModule: POLICY_MODULE,
    policyModuleOwner: OWNER,
    policyEpoch: '4',
    registryPaused: true,
    policyModuleCode: MODULE_CODE,
    policyModuleRuntimeSha256: MODULE_SHA256,
    policyModuleCodehash: MODULE_CODEHASH,
    approvedModuleCodehash: MODULE_CODEHASH,
    policyModuleApproved: true,
    policyModuleCodehashMatches: true,
  });
  const post = deployedSnapshot({ policyEpoch: '5' });
  const f = controllerFixture({
    snapshots: [paused, paused, paused, post],
    receipt: async ({ transaction }) => ({ status: 'success', transaction, logs: [] }),
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.preparePolicyModule({ module: ZERO_ADDRESS });
  assert.deepEqual(prepared.transaction, buildPolicyModuleTransaction({ owner: OWNER, account: paused.collectionAccount, module: ZERO_ADDRESS }));
  assert.equal(prepared.requiresExplicitConfirmation, true);
  await assert.rejects(f.controller.submitPrepared(prepared.id), /confirmation/i);
  const result = await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.equal(result.policyStatus, 'owner-only');
  assert.deepEqual(f.phases, ['readiness', 'policy_preview', 'pre_sign', 'receipt']);
});

test('policy recovery permits an exact clear after the configured module is removed', async () => {
  const removed = deployedSnapshot({
    policyModule: POLICY_MODULE,
    policyModuleOwner: OWNER,
    policyEpoch: '4',
    policyModuleCode: '0x',
    policyModuleRuntimeSha256: null,
    policyModuleCodehash: null,
    approvedModuleCodehash: ZERO_HASH,
    policyModuleApproved: false,
    policyModuleCodehashMatches: false,
  });
  const post = deployedSnapshot({ policyEpoch: '5' });
  const submitted = [];
  const f = controllerFixture({
    snapshots: [removed, removed, removed, post],
    submit: async (transaction) => {
      submitted.push(transaction);
      return `0x${'cc'.repeat(32)}`;
    },
    receipt: async ({ transaction }) => ({ status: 'success', transaction, logs: [] }),
  });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(selected.policyStatus, 'module-blocked');
  const prepared = await f.controller.preparePolicyModule({ module: ZERO_ADDRESS });
  const expectedTransaction = buildPolicyModuleTransaction({ owner: OWNER, account: removed.collectionAccount, module: ZERO_ADDRESS });
  assert.deepEqual(prepared.transaction, expectedTransaction);
  assert.equal(prepared.requiresExplicitConfirmation, true);
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: false }), /confirmation/i);
  const result = await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.deepEqual(submitted, [expectedTransaction]);
  assert.deepEqual(f.phases, ['readiness', 'policy_preview', 'pre_sign', 'receipt']);
  assert.equal(result.policy.state, 'confirmed_attributed');
  assert.equal(result.policyStatus, 'owner-only');
  assert.equal(result.policyModule, ZERO_ADDRESS);
  const [, storedValue] = [...f.storage.values.entries()].find(([key]) => key.includes('.policy.'));
  const stored = JSON.parse(storedValue);
  assert.equal(stored.state, 'confirmed_attributed');
  assert.equal(stored.history.at(-1).state, 'confirmed_attributed');
});

test('policy recovery permits an exact clear for unpaused deployed module with nonzero approved codehash mismatch', async () => {
  const mismatchedApproval = `0x${'aa'.repeat(32)}`;
  const mismatched = deployedSnapshot({
    policyModule: POLICY_MODULE,
    policyModuleOwner: OWNER,
    policyEpoch: '4',
    registryPaused: false,
    policyModuleCode: MODULE_CODE,
    policyModuleRuntimeSha256: MODULE_SHA256,
    policyModuleCodehash: MODULE_CODEHASH,
    approvedModuleCodehash: mismatchedApproval,
    policyModuleApproved: true,
    policyModuleCodehashMatches: false,
  });
  const post = deployedSnapshot({ policyEpoch: '5' });
  const submitted = [];
  const f = controllerFixture({
    snapshots: [mismatched, mismatched, mismatched, post],
    submit: async (transaction) => {
      submitted.push(transaction);
      return `0x${'cc'.repeat(32)}`;
    },
    receipt: async ({ transaction }) => ({ status: 'success', transaction, logs: [] }),
  });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(selected.policyStatus, 'module-blocked');
  const prepared = await f.controller.preparePolicyModule({ module: ZERO_ADDRESS });
  const expectedTransaction = buildPolicyModuleTransaction({ owner: OWNER, account: mismatched.collectionAccount, module: ZERO_ADDRESS });
  assert.deepEqual(prepared.transaction, expectedTransaction);
  assert.equal(prepared.requiresExplicitConfirmation, true);
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: false }), /confirmation/i);
  const result = await f.controller.submitPrepared(prepared.id, { confirmed: true });
  assert.deepEqual(submitted, [expectedTransaction]);
  assert.deepEqual(f.phases, ['readiness', 'policy_preview', 'pre_sign', 'receipt']);
  assert.equal(result.policy.state, 'confirmed_attributed');
  assert.equal(result.policyStatus, 'owner-only');
  assert.equal(result.policyModule, ZERO_ADDRESS);
  const [, storedValue] = [...f.storage.values.entries()].find(([key]) => key.includes('.policy.'));
  const stored = JSON.parse(storedValue);
  assert.equal(stored.state, 'confirmed_attributed');
  assert.equal(stored.history.at(-1).state, 'confirmed_attributed');
});

test('nonzero policy change requires exact fresh module approval and rejects policy drift before submit', async () => {
  const healthyTarget = deployedSnapshot({
    candidatePolicyModule: POLICY_MODULE,
    candidatePolicyModuleCode: MODULE_CODE,
    candidatePolicyModuleRuntimeSha256: MODULE_SHA256,
    candidatePolicyModuleCodehash: MODULE_CODEHASH,
    candidateApprovedModuleCodehash: MODULE_CODEHASH,
    candidatePolicyModuleApproved: true,
    candidatePolicyModuleCodehashMatches: true,
  });
  let f = controllerFixture({ snapshots: [deployedSnapshot(), healthyTarget] });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const prepared = await f.controller.preparePolicyModule({ module: POLICY_MODULE });
  assert.deepEqual(prepared.transaction, buildPolicyModuleTransaction({ owner: OWNER, account: healthyTarget.collectionAccount, module: POLICY_MODULE }));

  let submissions = 0;
  f = controllerFixture({
    snapshots: [deployedSnapshot(), healthyTarget, healthyTarget],
    submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const tampered = await f.controller.preparePolicyModule({ module: POLICY_MODULE });
  const [policyKey, storedValue] = [...f.storage.values.entries()].find(([key]) => key.includes('.policy.'));
  const stored = JSON.parse(storedValue);
  f.storage.values.set(policyKey, JSON.stringify({ ...stored, transaction: { ...stored.transaction, data: '0x' } }));
  await assert.rejects(f.controller.submitPrepared(tampered.id, { confirmed: true }), /not exact/i);
  assert.equal(submissions, 0);

  f = controllerFixture({
    snapshots: [deployedSnapshot(), healthyTarget, { ...healthyTarget, policyEpoch: '1' }],
    submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const drifted = await f.controller.preparePolicyModule({ module: POLICY_MODULE });
  await assert.rejects(f.controller.submitPrepared(drifted.id, { confirmed: true }), /drift/i);
  assert.equal(submissions, 0);
  assert.equal(f.controller.getSnapshot().policyStatus, 'read-only');
  assert.equal(f.controller.getSnapshot().canTransact, false);
  assert.equal(f.controller.getSnapshot().policy.state, 'invalidated');
  assert.equal(f.controller.getSnapshot().policy.preparedId, null);
  await f.controller.refresh();
  const replacement = await f.controller.preparePolicyModule({ module: POLICY_MODULE });
  assert.notEqual(replacement.id, drifted.id);

  f = controllerFixture({
    snapshots: [deployedSnapshot(), healthyTarget, {
      ...healthyTarget,
      candidateApprovedModuleCodehash: ZERO_HASH,
      candidatePolicyModuleApproved: false,
      candidatePolicyModuleCodehashMatches: false,
    }],
    submit: async () => { submissions += 1; return `0x${'cc'.repeat(32)}`; },
  });
  await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  const approvalDrift = await f.controller.preparePolicyModule({ module: POLICY_MODULE });
  await assert.rejects(f.controller.submitPrepared(approvalDrift.id, { confirmed: true }), /approved|drift/i);
  assert.equal(submissions, 0);

  const blocked = controllerFixture({ snapshots: [deployedSnapshot(), { ...healthyTarget, registryPaused: true }] });
  await blocked.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  await assert.rejects(blocked.controller.preparePolicyModule({ module: POLICY_MODULE }), /paused|approved|module/i);
});

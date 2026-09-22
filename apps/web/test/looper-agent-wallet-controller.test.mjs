import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, sha256 } from 'viem';

import {
  ACCOUNT_SALT,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  buildLooperAccountRuntimeCode,
  buildPolicyModuleTransaction,
  buildEthSendTransaction,
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

function controllerFixture({ snapshots = [], submit, receipt, storage = memoryStorage(), locks = immediateLocks() } = {}) {
  const phases = [];
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
    async readSnapshot(request) {
      phases.push(request.phase);
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
  return { controller, phases, storage };
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
  await assert.rejects(f.controller.submitPrepared(prepared.id, { confirmed: true }), /attribution/i);
  assert.equal(f.controller.getSnapshot().send.state, 'uncertain_hashed');
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

  const second = controllerFixture({ snapshots: [post], storage });
  const restored = await second.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(restored.send.state, 'confirmed_attributed');
  await assert.rejects(second.controller.submitPrepared(prepared.id, { confirmed: true }), /prepared attempt/i);
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
  assert.equal(drifted.reason, 'implementation_mismatch');

  const configDrift = controllerFixture({ snapshots: [snapshot({ registry: ZERO_ADDRESS })] });
  assert.equal((await configDrift.controller.select({ tokenId: TOKEN_ID, owner: OWNER })).reason, 'config_drift');
});

test('legacy configured account is surfaced read-only and never offered activation', async () => {
  const legacy = deployedSnapshot({
    implementation: LEGACY_ACCOUNT_IMPLEMENTATION,
  });
  const f = controllerFixture({ snapshots: [legacy] });
  const result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.mode, 'legacy_read_only');
  assert.equal(result.legacyAccount, legacy.collectionAccount);
  await assert.rejects(f.controller.prepareActivation(), /legacy|inactive/i);
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
  const f = controllerFixture({ snapshots: [removed, removed] });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(selected.policyStatus, 'module-blocked');
  const prepared = await f.controller.preparePolicyModule({ module: ZERO_ADDRESS });
  assert.deepEqual(prepared.transaction, buildPolicyModuleTransaction({ owner: OWNER, account: removed.collectionAccount, module: ZERO_ADDRESS }));
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
  const f = controllerFixture({ snapshots: [mismatched, mismatched] });
  const selected = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(selected.policyStatus, 'module-blocked');
  const prepared = await f.controller.preparePolicyModule({ module: ZERO_ADDRESS });
  assert.deepEqual(prepared.transaction, buildPolicyModuleTransaction({ owner: OWNER, account: mismatched.collectionAccount, module: ZERO_ADDRESS }));
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

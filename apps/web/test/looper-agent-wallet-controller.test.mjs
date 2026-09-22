import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_SALT,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
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
const RUNTIME_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
    state: '0',
    nativeWei: '1000',
    tokens: [{ contract: '0x5555555555555555555555555555555555555555', symbol: 'CRED', decimals: 18, balanceBaseUnits: '25' }],
    refreshedAt: '2026-09-21T23:59:00.000Z',
    ...overrides,
  };
}

function controllerFixture({ snapshots = [], submit, receipt, storage = memoryStorage(), locks = immediateLocks() } = {}) {
  const phases = [];
  let index = 0;
  const fallback = snapshots.at(-1) ?? snapshot();
  const controller = createLooperAgentWalletController({
    releaseConfig: { implementation: IMPLEMENTATION, runtimeSha256: RUNTIME_HASH },
    storage,
    locks,
    async readSnapshot(request) {
      phases.push(request.phase);
      return structuredClone(snapshots[index++] ?? fallback);
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
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH });
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
});

test('active ETH send requires exact direct receipt attribution and state increment', async () => {
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH, state: '7' });
  const post = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH, state: '8', nativeWei: '900' });
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
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH, state: '2' });
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
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH, state: '0' });
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

test('ownership transfer and config drift clear write capability while retaining read-only evidence', async () => {
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH });
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
});

test('legacy configured account is surfaced read-only and never offered activation', async () => {
  const legacy = snapshot({
    implementation: LEGACY_ACCOUNT_IMPLEMENTATION,
    accountCode: '0x1234',
    accountRuntimeSha256: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  });
  const f = controllerFixture({ snapshots: [legacy] });
  const result = await f.controller.select({ tokenId: TOKEN_ID, owner: OWNER });
  assert.equal(result.mode, 'legacy_read_only');
  assert.equal(result.legacyAccount, legacy.collectionAccount);
  await assert.rejects(f.controller.prepareActivation(), /legacy|inactive/i);
});

test('read-only agent context is owner scoped and excludes attempts, calldata and capabilities', async () => {
  const active = snapshot({ accountCode: '0x1234', accountRuntimeSha256: RUNTIME_HASH });
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

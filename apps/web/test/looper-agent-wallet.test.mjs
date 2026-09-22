import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, getAddress, sha256 } from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_POLICY_ABI,
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  RELEASED_ACCOUNT_IMPLEMENTATION,
  RELEASED_ACCOUNT_RUNTIME_SHA256,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  REGISTRY_ABI,
  MODULE_REGISTRY_ABI,
  REVIEWED_POLICY_ACCOUNT_IMPLEMENTATION,
  REVIEWED_POLICY_ACCOUNT_RUNTIME_SHA256,
  REVIEWED_POLICY_MODULE_REGISTRY,
  REVIEWED_POLICY_MODULE_REGISTRY_RUNTIME_SHA256,
  buildActivationTransaction,
  buildErc20SendTransaction,
  buildEthSendTransaction,
  buildLooperAccountRuntimeCode,
  buildPolicyModuleTransaction,
  createOperationScope,
  deriveLooperAccount,
  normalizeTokenId,
} from '../src/looper-agent-wallet.js';

const IMPLEMENTATION = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const RECIPIENT = '0x3333333333333333333333333333333333333333';
const TOKEN = '0x4444444444444444444444444444444444444444';

test('generic Looper account derivation and owner-scoped operation keys are deterministic', () => {
  assert.equal(normalizeTokenId('1'), 1n);
  assert.throws(() => normalizeTokenId('01'));
  assert.throws(() => normalizeTokenId(' 1'));
  assert.throws(() => normalizeTokenId('0'));
  assert.throws(() => normalizeTokenId('-1'));

  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: '617' });
  assert.match(account, /^0x[0-9A-Fa-f]{40}$/);
  assert.equal(account, deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: 617n }));
  assert.notEqual(account, deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: 618n }));

  const activation = createOperationScope({ tokenId: '617', account, owner: OWNER, kind: 'activation' });
  const send = createOperationScope({ tokenId: '617', account, owner: OWNER, kind: 'send' });
  assert.notEqual(activation.storageKey, send.storageKey);
  assert.notEqual(activation.lockName, send.lockName);
  assert.match(activation.storageKey, /8453:0x1649cd37.*:617:.*:0x2222/i);
  assert.notEqual(
    activation.storageKey,
    createOperationScope({ tokenId: '617', account, owner: RECIPIENT, kind: 'activation' }).storageKey,
  );
});

test('activation payload is exact canonical ERC-6551 registry creation', () => {
  const transaction = buildActivationTransaction({ owner: OWNER, implementation: IMPLEMENTATION, tokenId: '617' });
  assert.deepEqual(Object.keys(transaction).sort(), ['chainId', 'data', 'from', 'to', 'value']);
  assert.deepEqual(transaction, {
    chainId: '0x2105',
    from: getAddress(OWNER),
    to: ERC6551_REGISTRY,
    value: '0x0',
    data: transaction.data,
  });
  const decoded = decodeFunctionData({ abi: REGISTRY_ABI, data: transaction.data });
  assert.equal(decoded.functionName, 'createAccount');
  assert.deepEqual(decoded.args, [
    getAddress(IMPLEMENTATION),
    ACCOUNT_SALT,
    BigInt(BASE_CHAIN_ID),
    LOOPERS_COLLECTION,
    617n,
  ]);
});

test('ETH and ERC-20 payloads wrap only CALL operation zero through account execute', () => {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: '617' });
  const eth = buildEthSendTransaction({ owner: OWNER, account, recipient: RECIPIENT, amountWei: '123' });
  assert.equal(eth.to, account);
  assert.equal(eth.value, '0x0');
  let decoded = decodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, data: eth.data });
  assert.equal(decoded.functionName, 'execute');
  assert.deepEqual(decoded.args, [getAddress(RECIPIENT), 123n, '0x', 0]);

  const erc20 = buildErc20SendTransaction({
    owner: OWNER,
    account,
    token: TOKEN,
    recipient: RECIPIENT,
    amountBaseUnits: '456',
  });
  decoded = decodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, data: erc20.data });
  assert.equal(decoded.args[0], getAddress(TOKEN));
  assert.equal(decoded.args[1], 0n);
  assert.equal(decoded.args[3], 0);
  const transfer = decodeFunctionData({ abi: ERC20_ABI, data: decoded.args[2] });
  assert.equal(transfer.functionName, 'transfer');
  assert.deepEqual(transfer.args, [getAddress(RECIPIENT), 456n]);

  for (const invalid of ['0', '-1', '1.2', '01']) {
    assert.throws(() => buildEthSendTransaction({ owner: OWNER, account, recipient: RECIPIENT, amountWei: invalid }));
  }
  assert.throws(() => buildEthSendTransaction({ owner: OWNER, account, recipient: account, amountWei: '1' }));
});

test('wallet constants preserve current legacy account as read-only evidence only', () => {
  assert.equal(BASE_CHAIN_ID, 8453);
  assert.equal(ERC6551_REGISTRY, '0x000000006551c19487814612e58FE06813775758');
  assert.equal(ACCOUNT_SALT, '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee');
  assert.equal(LEGACY_ACCOUNT_IMPLEMENTATION, '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF');
  assert.equal(RELEASED_ACCOUNT_IMPLEMENTATION, '0xc998EFE23D48d5a2B26CEeec5E62158B2E79966C');
  assert.equal(RELEASED_ACCOUNT_RUNTIME_SHA256, '0x2eaf357d9163ada271718f6c46bc1831f008ddb7bbd968f9ab224af9d50560d2');
  assert.ok(LOOPERS_ABI.some((entry) => entry.name === 'setERC6551Config'));
});

test('policy ABIs expose only exact account recovery and registry reads', () => {
  assert.deepEqual(ACCOUNT_POLICY_ABI.map((entry) => entry.name), [
    'moduleRegistry',
    'policyModule',
    'policyModuleOwner',
    'policyEpoch',
    'setPolicyModule',
  ]);
  assert.deepEqual(MODULE_REGISTRY_ABI.map((entry) => entry.name), [
    'globallyPaused',
    'approvedModuleCodehash',
  ]);
  assert.equal(ACCOUNT_POLICY_ABI.find((entry) => entry.name === 'setPolicyModule')?.inputs?.[0]?.type, 'address');
  assert.equal(MODULE_REGISTRY_ABI.find((entry) => entry.name === 'approvedModuleCodehash')?.outputs?.[0]?.type, 'bytes32');
  assert.equal(REVIEWED_POLICY_ACCOUNT_IMPLEMENTATION, null);
  assert.equal(REVIEWED_POLICY_ACCOUNT_RUNTIME_SHA256, null);
  assert.equal(REVIEWED_POLICY_MODULE_REGISTRY, null);
  assert.equal(REVIEWED_POLICY_MODULE_REGISTRY_RUNTIME_SHA256, null);
  assert.doesNotMatch(JSON.stringify({ ACCOUNT_POLICY_ABI, MODULE_REGISTRY_ABI }), /executeWithPolicy|grant|session/i);
});

test('policy recovery transaction is exact setPolicyModule calldata to the canonical account', () => {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: '617' });
  const clear = buildPolicyModuleTransaction({ owner: OWNER, account, module: '0x0000000000000000000000000000000000000000' });
  assert.deepEqual(clear, {
    chainId: '0x2105',
    from: getAddress(OWNER),
    to: account,
    value: '0x0',
    data: clear.data,
  });
  let decoded = decodeFunctionData({ abi: ACCOUNT_POLICY_ABI, data: clear.data });
  assert.equal(decoded.functionName, 'setPolicyModule');
  assert.deepEqual(decoded.args, ['0x0000000000000000000000000000000000000000']);

  const change = buildPolicyModuleTransaction({ owner: OWNER, account, module: TOKEN });
  decoded = decodeFunctionData({ abi: ACCOUNT_POLICY_ABI, data: change.data });
  assert.deepEqual(decoded.args, [getAddress(TOKEN)]);
});

test('canonical account proxy runtime remains distinct from implementation runtime evidence', () => {
  const runtime = buildLooperAccountRuntimeCode({ implementation: IMPLEMENTATION, tokenId: '617' });
  assert.equal((runtime.length - 2) / 2, 173);
  assert.match(runtime, /^0x363d3d373d3d3d363d73/i);
  assert.match(runtime, new RegExp(IMPLEMENTATION.slice(2), 'i'));
  assert.match(runtime, new RegExp(ACCOUNT_SALT.slice(2), 'i'));
  assert.match(sha256(runtime), /^0x[0-9a-f]{64}$/);
  assert.notEqual(sha256(runtime), RELEASED_ACCOUNT_RUNTIME_SHA256);
});

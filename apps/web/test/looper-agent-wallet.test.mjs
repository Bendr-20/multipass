import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, getAddress } from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  REGISTRY_ABI,
  buildActivationTransaction,
  buildErc20SendTransaction,
  buildEthSendTransaction,
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
  assert.ok(LOOPERS_ABI.some((entry) => entry.name === 'setERC6551Config'));
});

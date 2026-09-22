import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, encodeFunctionData, getAddress, sha256 } from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_SALT,
  CONFIGURED_TOKENS,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  REGISTRY_ABI,
  deriveLooperAccount,
} from '../src/looper-agent-wallet.js';
import { BASE_RPC_ORIGINS, createLooperWalletRpcClient } from '../src/looper-agent-wallet-rpc.js';

const IMPLEMENTATION = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const TOKEN_ID = '617';
const BLOCK_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function output(type, value) {
  return encodeAbiParameters([{ type }], [value]);
}

function requester({ disagreeOwner = false } = {}) {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const selectors = {
    ownerOf: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'ownerOf', args: [617n] }).slice(0, 10),
    registry: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Registry' }).slice(0, 10),
    implementation: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Implementation' }).slice(0, 10),
    salt: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Salt' }).slice(0, 10),
    tokenBound: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'tokenBoundAccount', args: [617n] }).slice(0, 10),
    registryAccount: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'account',
      args: [IMPLEMENTATION, ACCOUNT_SALT, 8453n, LOOPERS_COLLECTION, 617n],
    }).slice(0, 10),
    state: encodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, functionName: 'state' }).slice(0, 10),
    balanceOf: encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }).slice(0, 10),
  };
  return async ({ origin, method, params }) => {
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getBlockByNumber') return { number: '0x64', hash: BLOCK_HASH };
    if (method === 'eth_getCode') return params[0].toLowerCase() === OWNER.toLowerCase() ? '0x' : '0x1234';
    if (method === 'eth_getBalance') return '0x3e8';
    if (method !== 'eth_call') throw new Error(`Unexpected ${method}`);
    const call = params[0];
    const selector = call.data.slice(0, 10);
    if (selector === selectors.ownerOf) {
      const owner = disagreeOwner && origin === BASE_RPC_ORIGINS[1]
        ? '0x3333333333333333333333333333333333333333'
        : OWNER;
      return output('address', owner);
    }
    if (selector === selectors.registry) return output('address', ERC6551_REGISTRY);
    if (selector === selectors.implementation) return output('address', IMPLEMENTATION);
    if (selector === selectors.salt) return output('bytes32', ACCOUNT_SALT);
    if (selector === selectors.tokenBound || selector === selectors.registryAccount) return output('address', account);
    if (selector === selectors.state) return output('uint256', 7n);
    if (selector === selectors.balanceOf) return output('uint256', 25n);
    throw new Error(`Unexpected selector ${selector}`);
  };
}

test('anchored Base reader verifies configuration, ownership, account runtime and balances across origins', async () => {
  const reader = createLooperWalletRpcClient({ request: requester() });
  const result = await reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  });
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  assert.equal(result.chainId, 8453);
  assert.equal(result.blockNumber, '100');
  assert.equal(result.blockHash, BLOCK_HASH);
  assert.equal(result.owner, getAddress(OWNER));
  assert.equal(result.collectionAccount, account);
  assert.equal(result.registryAccount, account);
  assert.equal(result.operatorCode, '0x');
  assert.equal(result.accountCode, '0x1234');
  assert.equal(result.accountRuntimeSha256, sha256('0x1234'));
  assert.equal(result.state, '7');
  assert.equal(result.nativeWei, '1000');
  assert.deepEqual(result.tokens, [{ ...CONFIGURED_TOKENS[0], balanceBaseUnits: '25' }]);
});

test('anchored Base reader rejects stale ownership disagreement', async () => {
  const reader = createLooperWalletRpcClient({ request: requester({ disagreeOwner: true }) });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /disagree/i);
});

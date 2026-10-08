import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult } from 'viem';

import { createLooperWalletRpcClient } from '../src/looper-agent-wallet-rpc.js';
import {
  CRED_ADDRESS,
  ERC20_STAKING_ABI,
  PANTHEON_STAKING_VAULT,
  PANTHEON_VIEW_ABI,
} from '../src/looper-cred-pantheon.js';

const ACCOUNT = '0x2222222222222222222222222222222222222222';
const GAS_PAYER = '0x1111111111111111111111111111111111111111';
const HASH = '0x' + 'ab'.repeat(32);

function request({ method, params }) {
  if (method === 'eth_chainId') return Promise.resolve('0x2105');
  if (method === 'eth_blockNumber') return Promise.resolve('0x64');
  if (method === 'eth_getBlockByNumber') return Promise.resolve({ number: '0x64', hash: HASH });
  if (method === 'eth_getBalance') return Promise.resolve('0x100');
  if (method !== 'eth_call') throw new Error('unexpected ' + method);
  const call = params[0];
  if (call.to.toLowerCase() === CRED_ADDRESS.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: ERC20_STAKING_ABI, data: call.data });
    if (decoded.functionName === 'balanceOf') return Promise.resolve(encodeFunctionResult({ abi: ERC20_STAKING_ABI, functionName: 'balanceOf', result: [500n] }));
    if (decoded.functionName === 'allowance') return Promise.resolve(encodeFunctionResult({ abi: ERC20_STAKING_ABI, functionName: 'allowance', result: [125n] }));
  }
  if (call.to.toLowerCase() === PANTHEON_STAKING_VAULT.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: PANTHEON_VIEW_ABI, data: call.data });
    if (decoded.functionName === 'pools') return Promise.resolve(encodeFunctionResult({ abi: PANTHEON_VIEW_ABI, functionName: 'pools', result: [true, 0, 1000n] }));
    if (decoded.functionName === 'stakes') return Promise.resolve(encodeFunctionResult({ abi: PANTHEON_VIEW_ABI, functionName: 'stakes', result: [75n, false, 6, 0, 0, 0, 0, 681, false] }));
  }
  throw new Error('unexpected call');
}

test('reads CRED balance allowance pool and position against one dual-RPC Base anchor', async () => {
  const client = createLooperWalletRpcClient({ request, releaseConfig: {} });
  const state = await client.readPantheonCredState({ account: ACCOUNT, gasPayer: GAS_PAYER });
  assert.deepEqual(state, {
    account: ACCOUNT,
    allowanceBaseUnits: '125',
    blockHash: HASH,
    blockNumber: '100',
    credBalanceBaseUnits: '500',
    gasPayerNativeWei: '256',
    poolActive: true,
    stakeAmountBaseUnits: '75',
    stakeMonthIndex: '681',
    totalStakedBaseUnits: '1000',
  });
});

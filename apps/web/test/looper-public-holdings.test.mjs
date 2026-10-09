import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionData, encodeFunctionResult } from 'viem';

import { CONFIGURED_TOKENS, LOOPERS_ABI } from '../src/looper-agent-wallet.js';
import { ERC20_ABI } from '../src/looper-agent-wallet.js';
import { loadLooperPublicHoldings } from '../src/looper-public-holdings.js';

const BLOCK = { number: '0x64', hash: '0x' + 'ab'.repeat(32), timestamp: '0x68e86f00' };
const HOLDER = '0x1111111111111111111111111111111111111111';
const OWNER_CALL = encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'ownerOf', args: [143n] });
const CRED_CALL = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: ['0x0000000000000000000000000000000000000001'] });
const selector = (data) => data.slice(0, 10);

function rpcResponse(result) {
  const bytes = new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  let sent = false;
  return { ok: true, headers: new Headers(), body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; }, async cancel() {} }; } } };
}

function fetchRpc({ disagree = false } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === 'eth_getBlockByNumber') return rpcResponse(BLOCK);
    if (body.method === 'eth_getCode') return rpcResponse('0x6001600055');
    if (body.method === 'eth_getBalance') return rpcResponse(disagree && String(url).includes('drpc') ? '0x2' : '0xde0b6b3a7640000');
    if (body.method === 'eth_call') {
      if (selector(body.params[0].data) === selector(OWNER_CALL)) {
        return rpcResponse(encodeFunctionResult({ abi: LOOPERS_ABI, functionName: 'ownerOf', result: HOLDER }));
      }
      if (selector(body.params[0].data) === selector(CRED_CALL)) {
        return rpcResponse(encodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', result: 4_000_000n * 10n ** 18n }));
      }
    }
    throw new Error('unexpected RPC request ' + body.method);
  };
}

test('loads one canonical public Looper wallet holdings view from two pinned Base providers', async () => {
  const result = await loadLooperPublicHoldings({ tokenId: '143', fetchImpl: fetchRpc() });
  assert.equal(result.status, 'available');
  assert.match(result.account, /^0x[0-9A-Fa-f]{40}$/u);
  assert.equal(result.holder, HOLDER);
  assert.equal(result.native.symbol, 'ETH');
  assert.equal(result.native.balanceBaseUnits, '1000000000000000000');
  assert.deepEqual(result.tokens, [{ ...CONFIGURED_TOKENS[0], balanceBaseUnits: '4000000000000000000000000' }]);
  assert.equal(result.observedBlock, 100);
  assert.equal(result.observedBlockHash, BLOCK.hash);
  assert.ok(result.accountExplorerUrl.startsWith('https://basescan.org/address/0x')); 
});

test('public holdings fail closed when Base providers disagree', async () => {
  await assert.rejects(loadLooperPublicHoldings({ tokenId: '143', fetchImpl: fetchRpc({ disagree: true }) }), /providers disagree/iu);
});

test('public holdings rejects duplicate or unpinned RPC providers before fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not fetch'); };
  await assert.rejects(loadLooperPublicHoldings({ tokenId: '143', fetchImpl, providers: ['https://base-rpc.publicnode.com', 'https://base-rpc.publicnode.com'] }), /distinct pinned/iu);
  await assert.rejects(loadLooperPublicHoldings({ tokenId: '143', fetchImpl, providers: ['https://base-rpc.publicnode.com', 'https://example.com'] }), /distinct pinned/iu);
  assert.equal(calls, 0);
});

test('public holdings rejects an undeployed deterministic account', async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === 'eth_getCode') return rpcResponse('0x');
    return fetchRpc()(url, init);
  };
  await assert.rejects(loadLooperPublicHoldings({ tokenId: '143', fetchImpl }), /not deployed/iu);
});

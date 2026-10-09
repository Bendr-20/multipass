import { decodeFunctionResult, encodeFunctionData, getAddress } from 'viem';

import { readBoundedResponseBody } from './bounded-response-body.js';
import {
  CONFIGURED_TOKENS,
  ERC20_ABI,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  RELEASED_ACCOUNT_IMPLEMENTATION,
  deriveLooperAccount,
  normalizeTokenId,
} from './looper-agent-wallet.js';

export const PUBLIC_HOLDINGS_RPC_ORIGINS = Object.freeze([
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
]);

const MAX_RPC_RESPONSE_BYTES = 65_536;
const RPC_TIMEOUT_MS = 10_000;
const HASH = /^0x[0-9a-f]{64}$/u;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;
const DEPLOYED_CODE = /^0x(?:[0-9a-f]{2})+$/u;

export async function loadLooperPublicHoldings({ tokenId, fetchImpl = globalThis.fetch, providers = PUBLIC_HOLDINGS_RPC_ORIGINS, signal } = {}) {
  const normalizedTokenId = normalizeTokenId(tokenId).toString();
  if (typeof fetchImpl !== 'function' || !hasPinnedProviders(providers)) throw new Error('Two distinct pinned public Base RPC providers are required.');
  const account = deriveLooperAccount({ implementation: RELEASED_ACCOUNT_IMPLEMENTATION, tokenId: normalizedTokenId });
  const heads = await Promise.all(providers.map((provider) => rpc(fetchImpl, provider, 'eth_getBlockByNumber', ['latest', false], signal)));
  const blockNumber = heads.reduce((minimum, head) => {
    const number = parseQuantity(head?.number, 'Base head');
    return minimum === null || number < minimum ? number : minimum;
  }, null);
  const blockTag = '0x' + blockNumber.toString(16);
  const anchors = await Promise.all(providers.map((provider) => rpc(fetchImpl, provider, 'eth_getBlockByNumber', [blockTag, false], signal)));
  const anchor = normalizeAnchor(anchors[0], blockNumber);
  if (anchors.some((value) => {
    const candidate = normalizeAnchor(value, blockNumber);
    return candidate.hash !== anchor.hash || candidate.timestamp !== anchor.timestamp;
  })) throw new Error('Base RPC providers disagree on the holdings block.');

  const ownerCall = encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'ownerOf', args: [BigInt(normalizedTokenId)] });
  const tokenCalls = CONFIGURED_TOKENS.map((token) => ({
    token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
  }));
  const reads = await Promise.all(providers.map(async (provider) => {
    const [code, native, holderData, tokenData] = await Promise.all([
      rpc(fetchImpl, provider, 'eth_getCode', [account, blockTag], signal),
      rpc(fetchImpl, provider, 'eth_getBalance', [account, blockTag], signal),
      rpc(fetchImpl, provider, 'eth_call', [{ to: LOOPERS_COLLECTION, data: ownerCall }, blockTag], signal),
      Promise.all(tokenCalls.map(({ token, data }) => rpc(fetchImpl, provider, 'eth_call', [{ to: token.address, data }, blockTag], signal))),
    ]);
    const confirmed = normalizeAnchor(await rpc(fetchImpl, provider, 'eth_getBlockByNumber', [blockTag, false], signal), blockNumber);
    if (confirmed.hash !== anchor.hash) throw new Error('Pinned Base holdings block changed during the read.');
    return {
      code: normalizeDeployedCode(code),
      native: parseQuantity(native, 'native balance').toString(),
      holder: getAddress(decodeFunctionResult({ abi: LOOPERS_ABI, functionName: 'ownerOf', data: holderData })),
      tokens: tokenData.map((data, index) => ({
        ...tokenCalls[index].token,
        balanceBaseUnits: BigInt(decodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', data })).toString(),
      })),
    };
  }));
  const canonical = JSON.stringify(reads[0]);
  if (reads.some((value) => JSON.stringify(value) !== canonical)) throw new Error('Base RPC providers disagree on public wallet holdings.');

  return Object.freeze({
    status: 'available',
    chainId: 8453,
    tokenId: normalizedTokenId,
    account,
    holder: reads[0].holder,
    native: Object.freeze({ symbol: 'ETH', decimals: 18, balanceBaseUnits: reads[0].native }),
    tokens: Object.freeze(reads[0].tokens.map((token) => Object.freeze(token))),
    observedBlock: Number(blockNumber),
    observedAt: new Date(Number(anchor.timestamp) * 1000).toISOString(),
    observedBlockHash: anchor.hash,
    accountExplorerUrl: 'https://basescan.org/address/' + account,
    holderExplorerUrl: 'https://basescan.org/address/' + reads[0].holder,
  });
}

function hasPinnedProviders(providers) {
  return Array.isArray(providers)
    && providers.length === PUBLIC_HOLDINGS_RPC_ORIGINS.length
    && new Set(providers).size === providers.length
    && PUBLIC_HOLDINGS_RPC_ORIGINS.every((provider) => providers.includes(provider));
}

function normalizeDeployedCode(value) {
  const code = String(value ?? '').toLowerCase();
  if (!DEPLOYED_CODE.test(code)) throw new Error('Activated Looper account is not deployed at the holdings block.');
  return code;
}

function normalizeAnchor(value, expectedNumber) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Base holdings block is malformed.');
  const number = parseQuantity(value.number, 'Base block number');
  const timestamp = parseQuantity(value.timestamp, 'Base block timestamp');
  const hash = String(value.hash ?? '').toLowerCase();
  if (number !== expectedNumber || !HASH.test(hash)) throw new Error('Base holdings block is malformed.');
  return { number, timestamp, hash };
}

function parseQuantity(value, label) {
  const normalized = String(value ?? '').toLowerCase();
  if (!QUANTITY.test(normalized)) throw new Error(label + ' is malformed.');
  return BigInt(normalized);
}

async function rpc(fetchImpl, provider, method, params, signal) {
  const timeout = AbortSignal.timeout(RPC_TIMEOUT_MS);
  const requestSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
  const response = await fetchImpl(provider, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: requestSignal,
  });
  if (!response?.ok) throw new Error('Base RPC request failed.');
  let text;
  try { text = await readBoundedResponseBody(response, { maxBytes: MAX_RPC_RESPONSE_BYTES, signal: requestSignal }); }
  catch { throw new Error('Base RPC response is unavailable.'); }
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Base RPC response is malformed.'); }
  if (!value || value.jsonrpc !== '2.0' || value.id !== 1 || value.error || !Object.hasOwn(value, 'result')) throw new Error('Base RPC response is malformed.');
  return value.result;
}

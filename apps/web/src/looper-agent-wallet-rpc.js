import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  sha256,
} from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  CONFIGURED_TOKENS,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  REGISTRY_ABI,
} from './looper-agent-wallet.js';

export const BASE_RPC_ORIGINS = Object.freeze([
  'https://mainnet.base.org',
  'https://base.drpc.org',
]);

const ACCOUNT_CREATED_ABI = [{
  type: 'event',
  name: 'AccountCreated',
  inputs: [
    { name: 'account', type: 'address', indexed: false },
    { name: 'implementation', type: 'address', indexed: true },
    { name: 'salt', type: 'bytes32', indexed: false },
    { name: 'chainId', type: 'uint256', indexed: false },
    { name: 'tokenContract', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
  ],
}];
const STATE_UPDATED_ABI = [{
  type: 'event',
  name: 'StateUpdated',
  inputs: [{ name: 'state', type: 'uint256', indexed: true }],
}];

export function createLooperWalletRpcClient({
  fetchImpl,
  request,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const activeRequest = request ?? createFixedRequester(fetchImpl ?? globalThis.fetch);
  async function readSnapshot({ selection, phase, receipt } = {}) {
    const tokenId = BigInt(String(selection?.tokenId ?? ''));
    const expectedOwner = getAddress(selection?.owner);
    const anchor = phase === 'receipt'
      ? await canonicalReceiptAnchor(activeRequest, receipt)
      : await canonicalAnchor(activeRequest);
    const snapshots = await Promise.all(BASE_RPC_ORIGINS.map((origin) => readOriginSnapshot({
      request: activeRequest,
      origin,
      anchor,
      tokenId,
      expectedOwner,
      phase,
    })));
    requireAgreement(snapshots, 'Base wallet snapshots disagree.');
    return { ...snapshots[0], refreshedAt: new Date().toISOString() };
  }

  async function readReceipt({ hash }) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const evidence = await Promise.all(BASE_RPC_ORIGINS.map(async (origin) => {
        const [receipt, transaction] = await Promise.all([
          activeRequest({ origin, method: 'eth_getTransactionReceipt', params: [hash] }),
          activeRequest({ origin, method: 'eth_getTransactionByHash', params: [hash] }),
        ]);
        if (!receipt || !transaction) return null;
        return normalizeReceipt(receipt, transaction);
      }));
      if (evidence.every(Boolean)) {
        requireAgreement(evidence, 'Base transaction receipts disagree.');
        return evidence[0];
      }
      await wait(2000);
    }
    throw new Error('Timed out waiting for canonical Base receipt evidence.');
  }

  return { readSnapshot, readReceipt };
}

async function canonicalReceiptAnchor(request, receipt) {
  const numberText = String(receipt?.blockNumber ?? '');
  const expectedHash = String(receipt?.blockHash ?? '').toLowerCase();
  if (!/^(0|[1-9]\d*)$/.test(numberText) || !/^0x[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error('Canonical receipt block evidence is required.');
  }
  const chainIds = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_chainId', params: [] })));
  if (chainIds.some((chainId) => chainId !== '0x2105')) throw new Error('Base RPC chain IDs disagree.');
  const number = BigInt(numberText);
  const tag = `0x${number.toString(16)}`;
  const blocks = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({
    origin,
    method: 'eth_getBlockByNumber',
    params: [tag, false],
  })));
  if (blocks.some((block) => !block || BigInt(block.number) !== number || String(block.hash).toLowerCase() !== expectedHash)) {
    throw new Error('Base receipt block hashes disagree.');
  }
  return { tag, number: number.toString(), hash: expectedHash };
}

async function canonicalAnchor(request) {
  const chainIds = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_chainId', params: [] })));
  if (chainIds.some((chainId) => chainId !== '0x2105')) throw new Error('Base RPC chain IDs disagree.');
  const heads = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_blockNumber', params: [] })));
  const number = heads.map((head) => BigInt(head)).reduce((lowest, head) => head < lowest ? head : lowest);
  const tag = `0x${number.toString(16)}`;
  const blocks = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({
    origin,
    method: 'eth_getBlockByNumber',
    params: [tag, false],
  })));
  if (blocks.some((block) => !block || BigInt(block.number) !== number)) throw new Error('Base RPC anchor is incomplete.');
  requireAgreement(blocks.map((block) => ({ number: block.number, hash: block.hash })), 'Base RPC block hashes disagree.');
  return { tag, number: number.toString(), hash: blocks[0].hash };
}

async function readOriginSnapshot({ request, origin, anchor, tokenId, expectedOwner }) {
  const call = (address, abi, functionName, args = []) => callContract({
    request,
    origin,
    tag: anchor.tag,
    address,
    abi,
    functionName,
    args,
  });
  const [owner, registry, implementation, salt, collectionAccount, operatorCode] = await Promise.all([
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'ownerOf', [tokenId]),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Registry'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Implementation'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Salt'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'tokenBoundAccount', [tokenId]),
    request({ origin, method: 'eth_getCode', params: [expectedOwner, anchor.tag] }),
  ]);
  const registryAccount = await call(ERC6551_REGISTRY, REGISTRY_ABI, 'account', [
    implementation,
    ACCOUNT_SALT,
    BigInt(BASE_CHAIN_ID),
    LOOPERS_COLLECTION,
    tokenId,
  ]);
  const [accountCode, nativeBalance] = await Promise.all([
    request({ origin, method: 'eth_getCode', params: [collectionAccount, anchor.tag] }),
    request({ origin, method: 'eth_getBalance', params: [collectionAccount, anchor.tag] }),
  ]);
  let state = 0n;
  if (accountCode !== '0x') {
    try {
      state = await call(collectionAccount, ACCOUNT_EXECUTE_ABI, 'state');
    } catch {
      state = 0n;
    }
  }
  const tokens = [];
  for (const token of CONFIGURED_TOKENS) {
    const balance = await call(token.address, ERC20_ABI, 'balanceOf', [collectionAccount]);
    tokens.push({ ...token, balanceBaseUnits: BigInt(balance).toString() });
  }
  return {
    chainId: BASE_CHAIN_ID,
    blockNumber: anchor.number,
    blockHash: anchor.hash,
    owner: getAddress(owner),
    registry: getAddress(registry),
    implementation: getAddress(implementation),
    salt,
    collectionAccount: getAddress(collectionAccount),
    registryAccount: getAddress(registryAccount),
    operatorCode: String(operatorCode).toLowerCase(),
    accountCode: String(accountCode).toLowerCase(),
    accountRuntimeSha256: accountCode === '0x' ? null : sha256(accountCode),
    state: BigInt(state).toString(),
    nativeWei: BigInt(nativeBalance).toString(),
    tokens,
  };
}

async function callContract({ request, origin, tag, address, abi, functionName, args = [] }) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await request({
    origin,
    method: 'eth_call',
    params: [{ to: address, data }, tag],
  });
  return decodeFunctionResult({ abi, functionName, data: result });
}

function normalizeReceipt(receipt, transaction) {
  const normalizedTransaction = {
    chainId: transaction.chainId,
    from: getAddress(transaction.from),
    to: getAddress(transaction.to),
    value: normalizeHexQuantity(transaction.value),
    data: String(transaction.input ?? '0x').toLowerCase(),
  };
  const logs = [];
  for (const log of receipt.logs ?? []) {
    try {
      const decoded = decodeEventLog({ abi: ACCOUNT_CREATED_ABI, topics: log.topics, data: log.data, strict: true });
      logs.push({ eventName: 'AccountCreated', account: getAddress(decoded.args.account) });
      continue;
    } catch {
      // Try the account event below.
    }
    try {
      const decoded = decodeEventLog({ abi: STATE_UPDATED_ABI, topics: log.topics, data: log.data, strict: true });
      logs.push({ eventName: 'StateUpdated', address: getAddress(log.address), state: decoded.args.state.toString() });
    } catch {
      // Unrelated logs are not attribution evidence.
    }
  }
  return {
    status: receipt.status === '0x1' ? 'success' : 'reverted',
    transactionHash: receipt.transactionHash,
    blockNumber: BigInt(receipt.blockNumber).toString(),
    blockHash: receipt.blockHash,
    transaction: normalizedTransaction,
    logs,
  };
}

function normalizeHexQuantity(value) {
  return `0x${BigInt(value ?? 0).toString(16)}`;
}

function requireAgreement(values, message) {
  const canonical = stableJson(values[0]);
  if (values.some((value) => stableJson(value) !== canonical)) throw new Error(message);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function createFixedRequester(fetchImpl) {
  let nextId = 1;
  return async ({ origin, method, params }) => {
    if (typeof fetchImpl !== 'function') throw new Error('Base RPC fetch is unavailable.');
    if (!BASE_RPC_ORIGINS.includes(origin)) throw new Error('Unapproved Base RPC origin.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchImpl(origin, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId += 1, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Base RPC failed with ${response.status}.`);
      const body = await response.json();
      if (body?.error || !Object.hasOwn(body ?? {}, 'result')) throw new Error('Base RPC returned an invalid envelope.');
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  };
}

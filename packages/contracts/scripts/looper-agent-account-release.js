import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

export const RELEASE_RPC_ORIGINS = Object.freeze([
  'https://mainnet.base.org',
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
]);
export const RELEASE_BLOCKSCOUT_ORIGIN = 'https://base.blockscout.com';
export const BOUND_PREVIEW_SHA256 = '85f3fef7a95c2efad44230dfccc073d2bf0e9c795bd97a13a7f51b6dc4623f63';
export const REGISTRY_DEPLOYMENT_HASH = '0x7ca7c491fad55b131a3ce5833d329e57a221d1070323d8a384fa3731a686d42b';
export const ACCOUNT_DEPLOYMENT_HASH = '0x6a61d1869a3ed89913c0ac79bd74f549afd0489a66288c9d0a07d712be37ce5f';
export const VERIFIED_RELEASE_OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../deployments/looper-agent-account-base.json',
);

const CHAIN_ID = 8453;
const CHAIN_ID_HEX = '0x2105';
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const CANONICAL_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
const DEPLOYER = '0x339559A2d1CD15059365FC7bD36b3047BbA480E0';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';
const OLD_IMPLEMENTATION = '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF';
const NEW_REGISTRY = '0x4e4df0DEa80e389802f819D95AAEe4CB004D3E1a';
const NEW_ACCOUNT = '0xf192f350427c8F58bC28e78b1e6Af164279F486e';
const EXPECTED_DEPLOYER_POST_NONCE = 7613n;
const EXPECTED_OLD_TOKEN_IDS = Object.freeze(['1', '645', '646', '3802']);
const ACCOUNT_CREATED_ABI = Object.freeze([
  'event ERC6551AccountCreated(address account,address indexed implementation,bytes32 salt,uint256 chainId,address indexed tokenContract,uint256 indexed tokenId)',
]);
const COLLECTION_ABI = Object.freeze([
  'function owner() view returns (address)',
  'function erc6551Registry() view returns (address)',
  'function erc6551Implementation() view returns (address)',
  'function erc6551Salt() view returns (bytes32)',
  'function EXPECTED_IDENTITY_REGISTRY() view returns (address)',
  'function erc8004AgentBaseURI() view returns (string)',
  'function erc8004BoundByLooper(uint256 tokenId) view returns (bool)',
  'function erc8004AgentIdByLooper(uint256 tokenId) view returns (uint256)',
  'function erc8004AgentURI(uint256 tokenId) view returns (string)',
  'function metadata(uint256 tokenId,string key) view returns (bytes)',
  'function paused() view returns (bool)',
  'function setERC6551Config(address registry,address implementation,bytes32 salt)',
  'event ERC6551ConfigUpdated(address indexed registry,address indexed implementation,bytes32 salt)',
]);
const MODULE_REGISTRY_ABI = Object.freeze([
  'function collection() view returns (address)',
  'function globallyPaused() view returns (bool)',
]);
const ACCOUNT_ABI = Object.freeze([
  'function moduleRegistry() view returns (address)',
  'function owner() view returns (address)',
]);
const ERC20_ABI = Object.freeze(['function balanceOf(address) view returns (uint256)']);
const ERC721_ABI = Object.freeze(['function ownerOf(uint256) view returns (address)']);
const ERC1155_ABI = Object.freeze(['function balanceOf(address,uint256) view returns (uint256)']);
const CONFIG_INTERFACE = new ethers.Interface(COLLECTION_ABI);
const ACCOUNT_CREATED_INTERFACE = new ethers.Interface(ACCOUNT_CREATED_ABI);
const MODULE_REGISTRY_INTERFACE = new ethers.Interface(MODULE_REGISTRY_ABI);
const ACCOUNT_INTERFACE = new ethers.Interface(ACCOUNT_ABI);
const ACCOUNT_CREATED_TOPIC = ACCOUNT_CREATED_INTERFACE.getEvent('ERC6551AccountCreated').topicHash;
const BLOCKSCOUT_TOKEN_KEYS = Object.freeze([
  'address_hash', 'circulating_market_cap', 'decimals', 'exchange_rate', 'holders_count',
  'icon_url', 'name', 'symbol', 'total_supply', 'type', 'volume_24h',
]);
const RPC_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt',
  'eth_call', 'eth_getBalance', 'eth_getTransactionCount', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_estimateGas', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
]);

export function validateBoundReleasePreview(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== BOUND_PREVIEW_SHA256) throw new Error('Bound preview SHA-256 mismatch.');
  let document;
  try { document = JSON.parse(raw.toString('utf8')); } catch { throw new Error('Bound preview JSON is invalid.'); }
  requirePlainObject(document, 'bound preview');
  if (document.schemaVersion !== '2.0.0' || document.chainId !== CHAIN_ID) throw new Error('Bound preview schema or chain mismatch.');
  assertAddress(document.collection, COLLECTION, 'preview collection');
  assertAddress(document.canonicalRegistry, CANONICAL_REGISTRY, 'preview canonical registry');
  assertAddress(document.registryDeployment?.expectedAddress, '0x4e4df0DEa80e389802f819D95AAEe4CB004D3E1a', 'preview registry deployment');
  assertAddress(document.accountDeployment?.expectedAddress, '0xf192f350427c8F58bC28e78b1e6Af164279F486e', 'preview account deployment');
  if (document.registryDeployment.expectedRuntimeBytes !== 1234
    || document.registryDeployment.expectedRuntimeSha256 !== '0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb') {
    throw new Error('Bound preview registry runtime mismatch.');
  }
  if (document.accountDeployment.expectedRuntimeBytes !== 6096
    || document.accountDeployment.expectedRuntimeSha256 !== '0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c') {
    throw new Error('Bound preview account runtime mismatch.');
  }
  return { sha256, document };
}

export function planLogRanges(fromBlock, toBlock, { rangeSize = 2000, maxRanges = 5000 } = {}) {
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0 || !Number.isSafeInteger(toBlock) || toBlock < fromBlock) {
    throw new Error('Invalid log block interval.');
  }
  if (!Number.isSafeInteger(rangeSize) || rangeSize < 1 || rangeSize > 2000) throw new Error('Log range size must not exceed 2000 blocks.');
  if (!Number.isSafeInteger(maxRanges) || maxRanges < 1) throw new Error('Invalid log range cap.');
  const count = Math.ceil((toBlock - fromBlock + 1) / rangeSize);
  if (count > maxRanges) throw new Error('Log range cap exceeded.');
  const ranges = [];
  for (let start = fromBlock; start <= toBlock; start += rangeSize) {
    ranges.push({ fromBlock: start, toBlock: Math.min(toBlock, start + rangeSize - 1) });
  }
  return ranges;
}

export function decodeCanonicalAccountCreatedLogs(logs, options) {
  if (!Array.isArray(logs) || logs.length > options.cap) throw new Error('AccountCreated log cap exceeded.');
  const seen = new Set();
  const decoded = logs.map((log) => {
    requireExactKeys(log, ['address', 'blockHash', 'blockNumber', 'blockTimestamp', 'transactionHash', 'transactionIndex', 'logIndex', 'removed', 'data', 'topics'], 'raw AccountCreated log');
    assertAddress(log.address, options.canonicalRegistry, 'AccountCreated emitter');
    if (log.removed !== false || !Array.isArray(log.topics) || log.topics.length !== 4 || log.topics[0] !== ACCOUNT_CREATED_TOPIC) {
      throw new Error(`AccountCreated raw coordinates are invalid (removed=${String(log.removed)}, topics=${Array.isArray(log.topics) ? log.topics.length : 'not-array'}, topic0=${Array.isArray(log.topics) ? log.topics[0] : 'none'}).`);
    }
    const parsed = ACCOUNT_CREATED_INTERFACE.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) throw new Error('AccountCreated log could not be decoded.');
    assertAddress(parsed.args.implementation, options.implementation, 'AccountCreated implementation');
    assertAddress(parsed.args.tokenContract, options.collection, 'AccountCreated collection');
    if (parsed.args.salt.toLowerCase() !== options.salt.toLowerCase() || parsed.args.chainId !== BigInt(options.chainId)) {
      throw new Error('AccountCreated salt or chain mismatch.');
    }
    const key = `${log.transactionHash.toLowerCase()}:${canonicalQuantity(log.logIndex)}`;
    if (seen.has(key)) throw new Error('Duplicate AccountCreated log.');
    seen.add(key);
    return {
      tokenId: parsed.args.tokenId.toString(),
      account: ethers.getAddress(parsed.args.account),
      transactionHash: normalizeHash(log.transactionHash, 'AccountCreated transaction hash'),
      blockNumber: Number(parseQuantity(log.blockNumber, 'AccountCreated block number')),
      blockHash: normalizeHash(log.blockHash, 'AccountCreated block hash'),
      transactionIndex: Number(parseQuantity(log.transactionIndex, 'AccountCreated transaction index')),
      logIndex: Number(parseQuantity(log.logIndex, 'AccountCreated log index')),
    };
  });
  decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex);
  return decoded;
}

export function validateBlockscoutTokenPage(value, { type }) {
  requireExactKeys(value, ['items', 'next_page_params'], 'Blockscout token page');
  if (!['ERC-20', 'ERC-721', 'ERC-1155'].includes(type)) throw new Error('Unknown Blockscout token type.');
  if (!Array.isArray(value.items)) throw new Error('Blockscout items must be an array.');
  if (value.items.length > 10000) throw new Error('Blockscout item cap of 10000 exceeded.');
  for (let index = 0; index < value.items.length; index += 1) {
    if (!Object.hasOwn(value.items, index)) throw new Error('Sparse Blockscout items are forbidden.');
    const item = value.items[index];
    requireExactKeys(item, ['token', 'token_id', 'token_instance', 'value'], 'Blockscout token item');
    if (!/^(0|[1-9]\d*)$/.test(item.value)) throw new Error('Blockscout token value is malformed.');
    if (BigInt(item.value) !== 0n) throw new Error('Blockscout reports a nonzero token holding.');
    requireExactKeys(item.token, BLOCKSCOUT_TOKEN_KEYS, 'Blockscout token metadata');
    if (item.token.type !== type) throw new Error('Blockscout token type mismatch.');
    ethers.getAddress(item.token.address_hash);
  }
  if (value.next_page_params !== null) throw new Error('Blockscout pagination must be exhausted with null next_page_params.');
  return { items: value.items, nextPageParams: null };
}

export function assertNoSigningEnvironment(environment = process.env) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error('environment must be an object.');
  }
  const forbidden = /(?:^|_)(?:PRIVATE_?KEY|MNEMONIC|SEED_?PHRASE|SIGNER_?KEY|WALLET_?KEY)(?:$|_)/i;
  const names = Object.keys(environment).filter((name) => forbidden.test(name));
  if (names.length) throw new Error(`Signing/key environment is forbidden for release inspection: ${names.sort().join(', ')}.`);
}

export function requireCanonicalLogRangeAgreement(primaryRanges, peerRanges, { cap = 100000 } = {}) {
  if (!Array.isArray(primaryRanges) || !Array.isArray(peerRanges) || primaryRanges.length !== peerRanges.length) {
    throw new Error('Canonical log origin range sets disagree.');
  }
  if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('Canonical log cap is invalid.');
  const flattened = [];
  for (let index = 0; index < primaryRanges.length; index += 1) {
    if (!Array.isArray(primaryRanges[index]) || !Array.isArray(peerRanges[index])) {
      throw new Error(`Canonical log range ${index} is invalid.`);
    }
    const primary = primaryRanges[index].map(canonicalRawEventLog);
    const peer = peerRanges[index].map(canonicalRawEventLog);
    if (stableJson(primary) !== stableJson(peer)) throw new Error(`Canonical log origins disagree for range ${index}.`);
    flattened.push(...primary);
    if (flattened.length > cap) throw new Error('Canonical log cap exceeded.');
  }
  return flattened;
}

export async function collectCanonicalLogsFromTwoOrigins({ transport, filters, cap = 100000 }) {
  if (!transport || typeof transport.rpc !== 'function' || typeof transport.getLogsBatch !== 'function' || !Array.isArray(filters)) {
    throw new Error('Canonical log transport and filters are required.');
  }
  const primaryRanges = [];
  for (let index = 0; index < filters.length; index += 3) {
    primaryRanges.push(...await transport.getLogsBatch(RELEASE_RPC_ORIGINS[0], filters.slice(index, index + 3)));
  }
  const primary = primaryRanges.flat();
  if (primary.length > cap) throw new Error('Canonical log cap exceeded.');
  const peer = [];
  const eventBlocks = [...new Set(primary.map((log) => canonicalQuantity(log.blockNumber)))].sort(
    (left, right) => Number(BigInt(left) - BigInt(right)),
  );
  for (const block of eventBlocks) {
    peer.push(...await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getLogs', [{
      ...filters[0], fromBlock: block, toBlock: block,
    }]));
  }
  const canonicalPrimary = primary.map(canonicalRawEventLog);
  const canonicalPeer = peer.map(canonicalRawEventLog);
  if (stableJson(canonicalPrimary) !== stableJson(canonicalPeer)) {
    throw new Error('Two origins disagree on canonical AccountCreated logs.');
  }
  return canonicalPrimary;
}

function splitLogFilter(filter, rangeSize) {
  requirePlainObject(filter, 'log filter');
  const fromBlock = Number(parseQuantity(filter.fromBlock, 'log filter fromBlock'));
  const toBlock = Number(parseQuantity(filter.toBlock, 'log filter toBlock'));
  return planLogRanges(fromBlock, toBlock, { rangeSize, maxRanges: 20 }).map((range) => ({
    ...filter,
    fromBlock: ethers.toQuantity(range.fromBlock),
    toBlock: ethers.toQuantity(range.toBlock),
  }));
}

export function validateOldAccountReceiptLog(log, item, options) {
  requirePlainObject(log, 'old-account receipt log');
  requirePlainObject(item, 'old-account inventory item');
  const parsed = ACCOUNT_CREATED_INTERFACE.parseLog({ topics: log.topics, data: log.data });
  if (!parsed || parsed.name !== 'ERC6551AccountCreated') throw new Error('Old-account receipt log could not be decoded.');
  assertAddress(log.address, options.canonicalRegistry, 'old-account receipt log emitter');
  assertAddress(parsed.args.account, item.account, 'old-account receipt log account');
  assertAddress(parsed.args.implementation, options.implementation, 'old-account receipt log implementation');
  assertAddress(parsed.args.tokenContract, options.collection, 'old-account receipt log collection');
  if (parsed.args.salt.toLowerCase() !== options.salt.toLowerCase()
    || parsed.args.chainId !== BigInt(options.chainId)
    || parsed.args.tokenId.toString() !== item.tokenId) {
    throw new Error('Old-account receipt log token, salt, or chain drifted.');
  }
  if (normalizeHash(log.transactionHash, 'old-account receipt transaction hash') !== item.transactionHash
    || normalizeHash(log.blockHash, 'old-account receipt block hash') !== item.blockHash
    || Number(parseQuantity(log.transactionIndex, 'old-account receipt transaction index')) !== item.transactionIndex
    || Number(parseQuantity(log.logIndex, 'old-account receipt log index')) !== item.logIndex
    || log.removed !== false) {
    throw new Error('Old-account receipt log coordinates drifted.');
  }
  return item;
}

export function buildUnsignedConfigUpdate({
  owner, ownerNonce, newImplementation, gas, maxFeePerGas, maxPriorityFeePerGas,
  currentRegistry, existingSalt,
}) {
  assertAddress(owner, OWNER, 'collection owner');
  assertAddress(currentRegistry, CANONICAL_REGISTRY, 'current registry');
  const implementation = ethers.getAddress(newImplementation);
  const transaction = {
    type: '0x2',
    chainId: CHAIN_ID_HEX,
    from: ethers.getAddress(owner),
    nonce: ethers.toQuantity(requireUint(ownerNonce, 'owner nonce')),
    to: COLLECTION,
    value: '0x0',
    data: CONFIG_INTERFACE.encodeFunctionData('setERC6551Config', [currentRegistry, implementation, existingSalt]),
    gas: ethers.toQuantity(requireUint(gas, 'gas')),
    maxFeePerGas: ethers.toQuantity(requireUint(maxFeePerGas, 'max fee per gas')),
    maxPriorityFeePerGas: ethers.toQuantity(requireUint(maxPriorityFeePerGas, 'priority fee per gas')),
  };
  return transaction;
}

export function assertExactConfigTransaction(transaction, expected) {
  requirePlainObject(transaction, 'observed config transaction');
  requirePlainObject(expected, 'expected config transaction');
  const fields = {
    type: expected.type,
    chainId: expected.chainId,
    from: expected.from,
    nonce: expected.nonce,
    to: expected.to,
    value: expected.value,
    input: expected.data,
    gas: expected.gas,
    maxFeePerGas: expected.maxFeePerGas,
    maxPriorityFeePerGas: expected.maxPriorityFeePerGas,
  };
  const labels = {
    chainId: 'chain id', maxFeePerGas: 'max fee per gas', maxPriorityFeePerGas: 'max priority fee per gas',
  };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof transaction[key] !== 'string' || transaction[key].toLowerCase() !== String(value).toLowerCase()) {
      throw new Error(`Config transaction ${labels[key] ?? key} drifted.`);
    }
  }
  return transaction;
}

export function validateReleaseInspectionForVerification(inspection) {
  requirePlainObject(inspection, 'inspection');
  if (inspection.schemaVersion !== '2.0.0'
    || inspection.kind !== 'looper-permission-release-pre-config-inspection'
    || inspection.chainId !== CHAIN_ID
    || inspection.preview?.sha256 !== BOUND_PREVIEW_SHA256) {
    throw new Error('Inspection release identity drifted.');
  }
  const registry = inspection.deployments?.registry;
  const account = inspection.deployments?.account;
  if (registry?.transactionHash !== REGISTRY_DEPLOYMENT_HASH
    || registry?.runtimeBytes !== 1234
    || registry?.runtimeSha256 !== '0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb') {
    throw new Error('Inspection registry deployment drifted.');
  }
  assertAddress(registry.address, NEW_REGISTRY, 'inspection registry address');
  if (account?.transactionHash !== ACCOUNT_DEPLOYMENT_HASH
    || account?.runtimeBytes !== 6096
    || account?.runtimeSha256 !== '0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c') {
    throw new Error('Inspection account deployment drifted.');
  }
  assertAddress(account.address, NEW_ACCOUNT, 'inspection account address');

  const preState = inspection.preState;
  assertAddress(preState?.owner, OWNER, 'inspection owner');
  assertAddress(preState?.currentConfig?.registry, CANONICAL_REGISTRY, 'inspection current registry');
  assertAddress(preState?.currentConfig?.implementation, OLD_IMPLEMENTATION, 'inspection old implementation');
  if (preState?.currentConfig?.salt !== inspection.configUpdate?.expected?.salt) throw new Error('Inspection salt drifted.');
  if (preState?.actors?.deployerCode !== '0x') throw new Error('Inspection deployer code drifted.');
  if (preState?.actors?.deployerNonce !== EXPECTED_DEPLOYER_POST_NONCE.toString()) {
    throw new Error('Inspection deployer nonce drifted.');
  }

  const tokenIds = inspection.inventory?.tokenIds;
  const accounts = inspection.inventory?.accounts;
  if (stableJson(tokenIds) !== stableJson(EXPECTED_OLD_TOKEN_IDS)
    || !Array.isArray(accounts) || accounts.length !== EXPECTED_OLD_TOKEN_IDS.length
    || stableJson(accounts.map((item) => item.tokenId)) !== stableJson(EXPECTED_OLD_TOKEN_IDS)) {
    throw new Error('Inspection inventory drifted.');
  }
  const seenAccounts = new Set();
  for (const item of accounts) {
    const address = ethers.getAddress(item.account).toLowerCase();
    if (seenAccounts.has(address) || item.nativeBalanceWei !== '0' || item.runtimeBytes !== 173) {
      throw new Error('Inspection inventory account drifted.');
    }
    seenAccounts.add(address);
  }

  const update = inspection.configUpdate;
  if (update?.ready !== true || update.blocker !== null) throw new Error('Inspection is blocked and cannot verify a config release.');
  assertAddress(update.expected?.registry, CANONICAL_REGISTRY, 'inspection expected registry');
  assertAddress(update.expected?.implementation, NEW_ACCOUNT, 'inspection expected implementation');
  if (update.expected.salt !== preState.currentConfig.salt) throw new Error('Inspection expected salt drifted.');
  for (const [value, label] of [
    [update.ownerNonce, 'owner nonce'], [update.gas, 'gas'], [update.maxFeePerGas, 'max fee'],
    [update.maxPriorityFeePerGas, 'priority fee'], [update.estimatedMaximumFeeWei, 'maximum fee'],
  ]) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new Error(`Inspection ${label} is not canonical.`);
  }
  if (BigInt(update.estimatedMaximumFeeWei) !== BigInt(update.gas) * BigInt(update.maxFeePerGas)) {
    throw new Error('Inspection maximum fee drifted.');
  }
  const exactTransaction = buildUnsignedConfigUpdate({
    owner: preState.owner,
    ownerNonce: BigInt(update.ownerNonce),
    newImplementation: update.expected.implementation,
    gas: BigInt(update.gas),
    maxFeePerGas: BigInt(update.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(update.maxPriorityFeePerGas),
    currentRegistry: preState.currentConfig.registry,
    existingSalt: preState.currentConfig.salt,
  });
  if (stableJson(update.transaction) !== stableJson(exactTransaction)) throw new Error('Inspection unsigned transaction drifted.');
  return inspection;
}

export function createReleaseReadTransport({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required.');
  let requestId = 1;
  const lastRequestAt = new Map();
  async function throttle(key, minimumDelayMs) {
    const waitMs = Math.max(0, (lastRequestAt.get(key) ?? 0) + minimumDelayMs - Date.now());
    if (waitMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
    lastRequestAt.set(key, Date.now());
  }
  async function rpc(origin, method, params = [], retryCount = 0) {
    if (!RELEASE_RPC_ORIGINS.includes(origin) || !RPC_METHODS.has(method)) throw new Error('Closed release RPC route rejected.');
    await throttle(origin, origin === RELEASE_RPC_ORIGINS[0] ? 2200 : 100);
    const body = JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params });
    let response;
    try {
      response = await boundedFetch(fetchImpl, origin, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
        redirect: 'error', credentials: 'omit',
      }, 25_000, 4 * 1024 * 1024);
    } catch (error) {
      throw new Error(`${origin} ${method} request failed: ${error.message}`);
    }
    requirePlainObject(response, 'JSON-RPC response');
    if (Object.hasOwn(response, 'error')) {
      const code = response.error?.code;
      const message = typeof response.error?.message === 'string' ? response.error.message.slice(0, 240) : 'unknown';
      if (retryCount < 2 && (code === -32016 || /rate limit/i.test(message))) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500 * (retryCount + 1)));
        return rpc(origin, method, params, retryCount + 1);
      }
      const data = typeof response.error?.data === 'string' && /^0x[0-9a-fA-F]*$/.test(response.error.data)
        ? ` data=${response.error.data.toLowerCase()}` : '';
      throw new Error(`${origin} ${method} JSON-RPC error ${code}: ${message}${data}`);
    }
    if (response.jsonrpc !== '2.0' || !Object.hasOwn(response, 'id') || !Object.hasOwn(response, 'result')) {
      throw new Error(`Invalid JSON-RPC response for ${method}.`);
    }
    return response.result;
  }
  async function getLogsBatch(origin, filters, retryCount = 0) {
    if (origin !== RELEASE_RPC_ORIGINS[0]) throw new Error('Closed release log-batch origin rejected.');
    if (!Array.isArray(filters) || filters.length < 1 || filters.length > 3) throw new Error('Log batch must contain one to three fixed requests.');
    await throttle(origin, origin === RELEASE_RPC_ORIGINS[0] ? 500 : 100);
    const requests = filters.map((filter) => ({ jsonrpc: '2.0', id: requestId++, method: 'eth_getLogs', params: [filter] }));
    const response = await boundedFetch(fetchImpl, origin, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requests),
      redirect: 'error', credentials: 'omit',
    }, 25_000, 4 * 1024 * 1024);
    if (!Array.isArray(response) || response.length !== requests.length) throw new Error('Invalid fixed log batch response.');
    const byId = new Map(response.map((entry) => [entry.id, entry]));
    const entries = requests.map((request) => byId.get(request.id));
    const retryable = entries.some((entry) => entry?.error?.code === -32016 || /rate limit/i.test(String(entry?.error?.message ?? '')));
    if (retryable && retryCount < 4) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000 * (retryCount + 1)));
      return getLogsBatch(origin, filters, retryCount + 1);
    }
    return entries.map((entry) => {
      if (!isPlainObject(entry) || entry.jsonrpc !== '2.0' || Object.hasOwn(entry, 'error') || !Array.isArray(entry.result)) {
        throw new Error(`Fixed log batch entry is invalid (code ${entry?.error?.code ?? 'none'}).`);
      }
      return entry.result;
    });
  }
  async function blockscout(account, type) {
    const address = ethers.getAddress(account);
    if (!['ERC-20', 'ERC-721', 'ERC-1155'].includes(type)) throw new Error('Unknown Blockscout route type.');
    const url = `${RELEASE_BLOCKSCOUT_ORIGIN}/api/v2/addresses/${address}/tokens?type=${type}`;
    await throttle(RELEASE_BLOCKSCOUT_ORIGIN, 1050);
    const value = await boundedFetch(fetchImpl, url, {
      method: 'GET', redirect: 'error', credentials: 'omit', headers: {},
    }, 15_000, 1024 * 1024);
    return validateBlockscoutTokenPage(value, { type });
  }
  return Object.freeze({ rpc, getLogsBatch, blockscout });
}

export async function inspectLooperAccountMigration({
  previewBytes, registryTransactionHash = REGISTRY_DEPLOYMENT_HASH,
  accountTransactionHash = ACCOUNT_DEPLOYMENT_HASH, transport = createReleaseReadTransport(),
  canonicalCompileBundle,
} = {}) {
  const bound = validateBoundReleasePreview(previewBytes);
  const preview = bound.document;
  const registryHash = normalizeHash(registryTransactionHash, 'registry deployment hash');
  const accountHash = normalizeHash(accountTransactionHash, 'account deployment hash');
  if (registryHash !== REGISTRY_DEPLOYMENT_HASH || accountHash !== ACCOUNT_DEPLOYMENT_HASH) throw new Error('Deployment transaction hash is not the reviewed release hash.');
  if (canonicalCompileBundle !== undefined && stableJson(canonicalCompileBundle) !== stableJson(preview.compileBundle)) {
    throw new Error('Fresh compiler/source evidence drifted from the bound preview.');
  }

  const anchor = await establishAnchor(transport);
  const registryDeployment = await verifyCreateDeployment({
    transport, hash: registryHash, section: preview.registryDeployment, anchor,
  });
  const accountDeployment = await verifyCreateDeployment({
    transport, hash: accountHash, section: preview.accountDeployment, anchor,
  });
  if (registryDeployment.transaction.from !== accountDeployment.transaction.from
    || parseQuantity(accountDeployment.transaction.nonce, 'account nonce') !== parseQuantity(registryDeployment.transaction.nonce, 'registry nonce') + 1n
    || accountDeployment.receipt.blockNumber < registryDeployment.receipt.blockNumber) {
    throw new Error('Two-CREATE deployment nonce/order proof failed.');
  }

  const state = await readStateProof(transport, preview, anchor);
  const inventory = await enumerateOldInventory(transport, preview, state, anchor);
  const fees = await readFeeInputs(transport);
  const ownerNonce = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionCount', [state.owner, anchor.numberHex]), 'owner nonce');
  const ownerNoncePeer = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionCount', [state.owner, anchor.numberHex]), 'owner nonce peer');
  if (ownerNonce !== ownerNoncePeer) throw new Error('Owner nonce origins disagree.');
  const ownerCode = await sameStateRead(transport, 'eth_getCode', [state.owner, anchor.numberHex]);
  if (ownerCode !== '0x' && !/^0xef0100[0-9a-f]{40}$/.test(ownerCode)) throw new Error('Collection owner code profile is unsupported.');
  const deployerCode = await sameStateRead(transport, 'eth_getCode', [DEPLOYER, anchor.numberHex]);
  if (deployerCode !== '0x') throw new Error('Release deployer code is not empty at the anchor.');
  const deployerNonce = parseQuantity(
    await sameStateRead(transport, 'eth_getTransactionCount', [DEPLOYER, anchor.numberHex]),
    'deployer nonce',
  );
  if (deployerNonce !== EXPECTED_DEPLOYER_POST_NONCE) throw new Error('Release deployer nonce drifted.');
  state.actors = { ownerCode, deployerCode, deployerNonce: deployerNonce.toString() };
  const provisional = buildUnsignedConfigUpdate({
    owner: state.owner, ownerNonce, newImplementation: preview.accountDeployment.expectedAddress,
    gas: 1n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    currentRegistry: state.currentConfig.registry, existingSalt: state.currentConfig.salt,
  });
  let gas = null;
  let configBlocker = null;
  const estimateRequest = [{ from: provisional.from, to: provisional.to, value: provisional.value, data: provisional.data }, anchor.numberHex];
  try {
    const primary = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_estimateGas', estimateRequest), 'config gas estimate');
    const peer = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_estimateGas', estimateRequest), 'config gas estimate peer');
    if (primary !== peer) throw new Error('Config gas estimate origins disagree.');
    gas = primary;
  } catch (error) {
    let peerError;
    try { await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_estimateGas', estimateRequest); } catch (caught) { peerError = caught; }
    if (!String(error.message).includes('0xe46274bc') || !String(peerError?.message).includes('0xe46274bc')) throw error;
    configBlocker = {
      code: 'erc6551_config_frozen',
      revertSelector: '0xe46274bc',
      signature: 'ERC6551ConfigFrozen()',
      message: 'The live collection implementation deterministically rejects setERC6551Config.',
    };
  }
  const unsignedTransaction = buildUnsignedConfigUpdate({
    owner: state.owner, ownerNonce, newImplementation: preview.accountDeployment.expectedAddress,
    gas: gas ?? 0n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    currentRegistry: state.currentConfig.registry, existingSalt: state.currentConfig.salt,
  });
  if (gas === null) unsignedTransaction.gas = null;

  return {
    schemaVersion: '2.0.0', kind: 'looper-permission-release-pre-config-inspection',
    chainId: CHAIN_ID, preview: { sha256: bound.sha256 }, anchor,
    compiler: preview.compileBundle.compiler, sources: preview.compileBundle.sources,
    deployments: { registry: registryDeployment, account: accountDeployment },
    preState: state, inventory,
    configUpdate: {
      ready: configBlocker === null,
      blocker: configBlocker,
      expected: preview.configUpdate.expected,
      ownerNonce: ownerNonce.toString(), gas: gas?.toString() ?? null,
      maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      estimatedMaximumFeeWei: gas === null ? null : (gas * fees.maxFeePerGas).toString(), transaction: unsignedTransaction,
    },
  };
}

export async function verifyLooperAgentAccountRelease({ inspection, configTransactionHash, transport = createReleaseReadTransport() } = {}) {
  validateReleaseInspectionForVerification(inspection);
  const hash = normalizeHash(configTransactionHash, 'config transaction hash');
  const anchor = await establishAnchor(transport);
  const [txA, txB, receiptA, receiptB] = await Promise.all([
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionByHash', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionByHash', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionReceipt', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionReceipt', [hash]),
  ]);
  const tx = normalizeTransaction(txA);
  const receipt = normalizeReceipt(receiptA);
  if (stableJson(tx) !== stableJson(normalizeTransaction(txB)) || stableJson(receipt) !== stableJson(normalizeReceipt(receiptB))) {
    throw new Error('Config transaction or receipt origins disagree.');
  }
  const expected = inspection.configUpdate.transaction;
  if (tx.hash !== hash) throw new Error('Config transaction hash drifted.');
  assertExactConfigTransaction(tx, expected);
  if (receipt.status !== '0x1' || receipt.transactionHash !== hash || receipt.logs.length !== 1) throw new Error('Config receipt must succeed with exactly one event.');
  if (receipt.blockNumber > anchor.number) throw new Error('Config receipt is newer than the verification anchor.');
  const receiptBlocks = [];
  for (const origin of RELEASE_RPC_ORIGINS) {
    receiptBlocks.push(normalizeBlock(await transport.rpc(origin, 'eth_getBlockByNumber', [receipt.blockNumberHex, false])));
  }
  if (receiptBlocks.some((block) => block.hash !== receipt.blockHash)) throw new Error('Config receipt block is not canonical on all origins.');
  const parsed = CONFIG_INTERFACE.parseLog(receipt.logs[0]);
  if (!parsed || parsed.name !== 'ERC6551ConfigUpdated') throw new Error('Config receipt event is not exact.');
  assertAddress(parsed.args.registry, inspection.configUpdate.expected.registry, 'post registry event');
  assertAddress(parsed.args.implementation, inspection.configUpdate.expected.implementation, 'post implementation event');
  if (parsed.args.salt.toLowerCase() !== inspection.configUpdate.expected.salt.toLowerCase()) throw new Error('Post config salt event drifted.');

  const post = await readCollectionSnapshot(transport, anchor);
  assertAddress(post.owner, inspection.preState.owner, 'post owner');
  assertAddress(post.currentConfig.registry, inspection.configUpdate.expected.registry, 'post registry');
  assertAddress(post.currentConfig.implementation, inspection.configUpdate.expected.implementation, 'post implementation');
  if (post.currentConfig.salt !== inspection.configUpdate.expected.salt) throw new Error('Post config salt drifted.');
  if (stableJson(post.unrelated) !== stableJson(inspection.preState.unrelated)) throw new Error('Unrelated collection getters changed.');
  const ownerNonce = parseQuantity(await sameStateRead(transport, 'eth_getTransactionCount', [inspection.preState.owner, anchor.numberHex]), 'post owner nonce');
  if (ownerNonce !== parseQuantity(inspection.configUpdate.transaction.nonce, 'config nonce') + 1n) throw new Error('Post owner nonce drifted.');
  const deployerNonce = parseQuantity(
    await sameStateRead(transport, 'eth_getTransactionCount', [DEPLOYER, anchor.numberHex]),
    'post deployer nonce',
  );
  if (deployerNonce.toString() !== inspection.preState.actors.deployerNonce) throw new Error('Post deployer nonce drifted.');
  const ownerCode = await sameStateRead(transport, 'eth_getCode', [inspection.preState.owner, anchor.numberHex]);
  const deployerCode = await sameStateRead(transport, 'eth_getCode', [DEPLOYER, anchor.numberHex]);
  if (ownerCode !== inspection.preState.actors.ownerCode || deployerCode !== inspection.preState.actors.deployerCode || deployerCode !== '0x') {
    throw new Error('Release actor code profile drifted.');
  }
  const registryCode = await sameStateRead(transport, 'eth_getCode', [inspection.deployments.registry.address, anchor.numberHex]);
  const accountCode = await sameStateRead(transport, 'eth_getCode', [inspection.deployments.account.address, anchor.numberHex]);
  if (sha256Hex(registryCode) !== inspection.deployments.registry.runtimeSha256
    || sha256Hex(accountCode) !== inspection.deployments.account.runtimeSha256) throw new Error('Deployment runtime drifted.');
  await revalidateStoredDeployment(transport, inspection.deployments.registry, anchor);
  await revalidateStoredDeployment(transport, inspection.deployments.account, anchor);
  for (const item of inspection.inventory.accounts) {
    if (await sameStateRead(transport, 'eth_getBalance', [item.account, anchor.numberHex]) !== '0x0') throw new Error('Old-account inventory balance drifted.');
    for (const type of ['ERC-20', 'ERC-721', 'ERC-1155']) {
      const page = await transport.blockscout(item.account, type);
      await crossCheckTokenItems(transport, item.account, type, page.items, anchor);
    }
  }
  return {
    schemaVersion: '2.0.0', kind: 'looper-permission-release', chainId: CHAIN_ID,
    preview: inspection.preview, compiler: inspection.compiler, sources: inspection.sources,
    deployments: inspection.deployments,
    configUpdate: { transactionHash: hash, transaction: tx, receipt, event: {
      registry: ethers.getAddress(parsed.args.registry), implementation: ethers.getAddress(parsed.args.implementation), salt: parsed.args.salt,
    } },
    verifiedAtAnchor: anchor, postState: post,
    invariants: { unrelatedGettersUnchanged: true, deploymentReceiptsUnchanged: true, deploymentRuntimesUnchanged: true, oldInventoryStillEmpty: true, ownerNonce: ownerNonce.toString(), deployerNonce: deployerNonce.toString() },
  };
}

async function revalidateStoredDeployment(transport, deployment, anchor) {
  const [txA, txB, receiptA, receiptB] = await Promise.all([
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionByHash', [deployment.transactionHash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionByHash', [deployment.transactionHash]),
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionReceipt', [deployment.transactionHash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionReceipt', [deployment.transactionHash]),
  ]);
  const transaction = normalizeTransaction(txA);
  const receipt = normalizeReceipt(receiptA);
  if (stableJson(transaction) !== stableJson(normalizeTransaction(txB))
    || stableJson(receipt) !== stableJson(normalizeReceipt(receiptB))
    || stableJson(transaction) !== stableJson(deployment.transaction)
    || stableJson(receipt) !== stableJson(deployment.receipt)
    || receipt.blockNumber > anchor.number) {
    throw new Error('Deployment transaction or receipt drifted.');
  }
}

async function establishAnchor(transport) {
  const chains = [];
  const heads = [];
  for (const origin of RELEASE_RPC_ORIGINS) {
    chains.push(await transport.rpc(origin, 'eth_chainId'));
    heads.push(parseQuantity(await transport.rpc(origin, 'eth_blockNumber'), 'head'));
  }
  if (chains.some((value) => value !== CHAIN_ID_HEX)) throw new Error('Base chain ID quorum failed.');
  const number = Number(heads.reduce((left, right) => left < right ? left : right));
  const numberHex = ethers.toQuantity(number);
  const blocks = [];
  for (const origin of RELEASE_RPC_ORIGINS) blocks.push(await transport.rpc(origin, 'eth_getBlockByNumber', [numberHex, false]));
  const normalized = blocks.map(normalizeBlock);
  if (normalized.some((block) => block.number !== numberHex || block.hash !== normalized[0].hash)) throw new Error('Three-origin anchor hash disagreement.');
  return { number, numberHex, hash: normalized[0].hash, origins: [...RELEASE_RPC_ORIGINS] };
}

async function verifyCreateDeployment({ transport, hash, section, anchor }) {
  const [txA, txB, receiptA, receiptB] = await Promise.all([
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionByHash', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionByHash', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionReceipt', [hash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionReceipt', [hash]),
  ]);
  const tx = normalizeTransaction(txA);
  const txPeer = normalizeTransaction(txB);
  const receipt = normalizeReceipt(receiptA);
  const receiptPeer = normalizeReceipt(receiptB);
  if (stableJson(tx) !== stableJson(txPeer) || stableJson(receipt) !== stableJson(receiptPeer)) throw new Error('Deployment transaction/receipt origins disagree.');
  if (tx.hash !== hash || tx.to !== null || tx.from !== section.transaction.from.toLowerCase()
    || parseQuantity(tx.nonce, 'deployment nonce') !== BigInt(section.transaction.nonce)
    || tx.input !== section.transaction.data.toLowerCase() || tx.value !== '0x0') throw new Error('CREATE transaction drifted from preview.');
  const expectedAddress = ethers.getCreateAddress({ from: tx.from, nonce: parseQuantity(tx.nonce, 'deployment nonce') });
  assertAddress(expectedAddress, section.expectedAddress, 'CREATE address');
  if (receipt.status !== '0x1' || receipt.transactionHash !== hash || receipt.to !== null
    || receipt.contractAddress !== section.expectedAddress.toLowerCase() || receipt.logs.length !== 0) throw new Error('CREATE receipt is invalid.');
  const blockA = normalizeBlock(await transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getBlockByNumber', [receipt.blockNumberHex, false]));
  const blockB = normalizeBlock(await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getBlockByNumber', [receipt.blockNumberHex, false]));
  if (blockA.hash !== receipt.blockHash || blockB.hash !== receipt.blockHash) throw new Error('CREATE receipt block is not canonical.');
  const runtime = await sameStateRead(transport, 'eth_getCode', [section.expectedAddress, anchor.numberHex]);
  if (runtime.toLowerCase() !== section.expectedRuntimeBytecode.toLowerCase()
    || ethers.dataLength(runtime) !== section.expectedRuntimeBytes || sha256Hex(runtime) !== section.expectedRuntimeSha256) throw new Error('Deployed runtime does not match preview.');
  return {
    transactionHash: hash, address: section.expectedAddress, transaction: tx, receipt,
    creationBytes: ethers.dataLength(tx.input), creationSha256: sha256Hex(tx.input),
    runtimeBytes: ethers.dataLength(runtime), runtimeSha256: sha256Hex(runtime),
  };
}

async function readStateProof(transport, preview, anchor) {
  const snapshot = await readCollectionSnapshot(transport, anchor);
  assertAddress(snapshot.owner, OWNER, 'current collection owner');
  assertAddress(snapshot.currentConfig.registry, CANONICAL_REGISTRY, 'current ERC-6551 registry');
  if (snapshot.currentConfig.implementation.toLowerCase() === preview.accountDeployment.expectedAddress.toLowerCase()) throw new Error('Collection config is already changed.');
  if (snapshot.currentConfig.salt !== preview.salt) throw new Error('Existing salt drifted.');
  const registryCollection = await callSame(transport, preview.registryDeployment.expectedAddress, MODULE_REGISTRY_INTERFACE, 'collection', [], anchor);
  const registryPaused = await callSame(transport, preview.registryDeployment.expectedAddress, MODULE_REGISTRY_INTERFACE, 'globallyPaused', [], anchor);
  assertAddress(registryCollection, COLLECTION, 'module registry collection');
  if (registryPaused !== true) throw new Error('Module registry must remain globally paused.');
  const accountModuleRegistry = await callSame(transport, preview.accountDeployment.expectedAddress, ACCOUNT_INTERFACE, 'moduleRegistry', [], anchor);
  const directAccountOwner = await callSame(transport, preview.accountDeployment.expectedAddress, ACCOUNT_INTERFACE, 'owner', [], anchor);
  assertAddress(accountModuleRegistry, preview.registryDeployment.expectedAddress, 'account module registry');
  if (directAccountOwner !== ethers.ZeroAddress) throw new Error('Direct account implementation must be unowned.');
  return {
    ...snapshot,
    registry: { address: preview.registryDeployment.expectedAddress, collection: ethers.getAddress(registryCollection), globallyPaused: registryPaused },
    account: { address: preview.accountDeployment.expectedAddress, moduleRegistry: ethers.getAddress(accountModuleRegistry), selfImplementation: preview.accountDeployment.expectedAddress, directOwner: directAccountOwner },
  };
}

async function readCollectionSnapshot(transport, anchor) {
  const owner = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'owner', [], anchor);
  const registry = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc6551Registry', [], anchor);
  const implementation = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc6551Implementation', [], anchor);
  const salt = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc6551Salt', [], anchor);
  const erc8004Registry = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'EXPECTED_IDENTITY_REGISTRY', [], anchor);
  const erc8004AgentBaseURI = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc8004AgentBaseURI', [], anchor);
  const paused = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'paused', [], anchor);
  const tokenEvidence = [];
  for (const tokenId of EXPECTED_OLD_TOKEN_IDS) {
    const erc721tContext = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'metadata', [tokenId, 'context'], anchor);
    const erc8004Bound = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc8004BoundByLooper', [tokenId], anchor);
    const erc8004IdentityTokenId = await callSame(
      transport, COLLECTION, CONFIG_INTERFACE, 'erc8004AgentIdByLooper', [tokenId], anchor,
    );
    const erc8004AgentURI = await callSame(transport, COLLECTION, CONFIG_INTERFACE, 'erc8004AgentURI', [tokenId], anchor);
    tokenEvidence.push({
      tokenId,
      erc721tContext,
      erc8004Bound,
      erc8004IdentityTokenId: erc8004IdentityTokenId.toString(),
      erc8004AgentURI,
    });
  }
  return {
    owner: ethers.getAddress(owner),
    currentConfig: { registry: ethers.getAddress(registry), implementation: ethers.getAddress(implementation), salt },
    unrelated: {
      erc8004Registry: ethers.getAddress(erc8004Registry),
      erc8004AgentBaseURI,
      paused,
      tokenEvidence: EXPECTED_OLD_TOKEN_IDS.map((tokenId) => tokenEvidence.find((entry) => entry.tokenId === tokenId)),
    },
  };
}

async function enumerateOldInventory(transport, preview, state, anchor) {
  const deploymentBlock = await findDeploymentBlock(transport, COLLECTION, anchor.number);
  const rangeSize = 1000;
  const ranges = planLogRanges(deploymentBlock, anchor.number, { rangeSize, maxRanges: 1000 });
  const implementationTopic = ethers.zeroPadValue(state.currentConfig.implementation, 32);
  const collectionTopic = ethers.zeroPadValue(COLLECTION, 32);
  const filters = ranges.map((range) => ({
    address: CANONICAL_REGISTRY,
    fromBlock: ethers.toQuantity(range.fromBlock), toBlock: ethers.toQuantity(range.toBlock),
    topics: [ACCOUNT_CREATED_TOPIC, implementationTopic, collectionTopic],
  }));
  const rawLogs = await collectCanonicalLogsFromTwoOrigins({ transport, filters, cap: 100000 });
  const canonicalPrimaryLogs = rawLogs.map(canonicalRawEventLog);
  const accounts = decodeCanonicalAccountCreatedLogs(canonicalPrimaryLogs, {
    implementation: state.currentConfig.implementation, collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY, salt: state.currentConfig.salt, chainId: CHAIN_ID, cap: 100000,
  });
  if (stableJson(accounts.map((item) => item.tokenId)) !== stableJson(EXPECTED_OLD_TOKEN_IDS)) {
    throw new Error(`Old implementation account IDs are not exactly 1,645,646,3802 (observed ${accounts.map((item) => item.tokenId).join(',') || 'none'}).`);
  }
  for (const item of accounts) {
    await revalidateOldAccount(transport, item, state, anchor);
    const balance = await sameStateRead(transport, 'eth_getBalance', [item.account, anchor.numberHex]);
    if (balance !== '0x0') throw new Error(`Old account ${item.account} has native balance.`);
    for (const type of ['ERC-20', 'ERC-721', 'ERC-1155']) {
      const page = await transport.blockscout(item.account, type);
      await crossCheckTokenItems(transport, item.account, type, page.items, anchor);
    }
    item.nativeBalanceWei = '0';
    item.blockscout = { erc20: 'empty', erc721: 'empty', erc1155: 'empty' };
  }
  return { deploymentBlock, rangeSize, rangeCount: ranges.length, eventCap: 100000, tokenIds: EXPECTED_OLD_TOKEN_IDS, accounts };
}

async function revalidateOldAccount(transport, item, state, anchor) {
  const [receiptA, receiptB] = await Promise.all([
    transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_getTransactionReceipt', [item.transactionHash]),
    transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getTransactionReceipt', [item.transactionHash]),
  ]);
  const receipt = normalizeReceipt(receiptA);
  if (stableJson(receipt) !== stableJson(normalizeReceipt(receiptB)) || receipt.status !== '0x1' || receipt.blockHash !== item.blockHash) {
    throw new Error(`Old account ${item.account} receipt proof failed.`);
  }
  const rawMatches = receiptA.logs.filter((log) => canonicalQuantity(log.logIndex) === ethers.toQuantity(item.logIndex));
  if (rawMatches.length !== 1 || receipt.transactionIndex !== item.transactionIndex) {
    throw new Error(`Old account ${item.account} receipt log proof failed.`);
  }
  validateOldAccountReceiptLog(rawMatches[0], item, {
    implementation: state.currentConfig.implementation,
    collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY,
    salt: state.currentConfig.salt,
    chainId: CHAIN_ID,
  });
  const runtime = await sameStateRead(transport, 'eth_getCode', [item.account, anchor.numberHex]);
  const expected = standardProxyRuntime(state.currentConfig.implementation, state.currentConfig.salt, COLLECTION, item.tokenId);
  if (runtime.toLowerCase() !== expected.toLowerCase() || ethers.dataLength(runtime) !== 173) throw new Error(`Old account ${item.account} runtime proof failed.`);
  item.runtimeBytes = 173;
  item.runtimeSha256 = sha256Hex(runtime);
}

async function crossCheckTokenItems(transport, account, type, items, anchor) {
  for (const item of items) {
    const token = item.token;
    const contract = token.address_hash ?? token.address;
    if (!contract) throw new Error('Blockscout token contract is missing.');
    const address = ethers.getAddress(contract);
    let result;
    if (type === 'ERC-20') result = await callSame(transport, address, new ethers.Interface(ERC20_ABI), 'balanceOf', [account], anchor);
    else if (type === 'ERC-721') {
      const tokenId = item.token_id ?? item.token_instance?.id;
      if (!/^(0|[1-9]\d*)$/.test(String(tokenId ?? ''))) throw new Error('Blockscout ERC-721 token ID is malformed.');
      result = await callSame(transport, address, new ethers.Interface(ERC721_ABI), 'ownerOf', [tokenId], anchor);
      if (String(result).toLowerCase() === account.toLowerCase()) throw new Error('Anchored RPC confirms an ERC-721 holding.');
      continue;
    } else {
      const tokenId = item.token_id ?? item.token_instance?.id;
      if (!/^(0|[1-9]\d*)$/.test(String(tokenId ?? ''))) throw new Error('Blockscout ERC-1155 token ID is malformed.');
      result = await callSame(transport, address, new ethers.Interface(ERC1155_ABI), 'balanceOf', [account, tokenId], anchor);
    }
    if (BigInt(result) !== 0n) throw new Error(`Anchored RPC confirms a ${type} holding.`);
  }
}

async function findDeploymentBlock(transport, address, anchorNumber) {
  let low = 0;
  let high = anchorNumber;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const code = await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getCode', [address, ethers.toQuantity(middle)]);
    if (code === '0x') low = middle + 1;
    else high = middle;
  }
  if (await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_getCode', [address, ethers.toQuantity(low)]) === '0x') throw new Error('Collection deployment block not found.');
  return low;
}

async function readFeeInputs(transport) {
  const gasPrice = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_gasPrice'), 'gas price');
  const gasPricePeer = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_gasPrice'), 'gas price peer');
  const priority = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[0], 'eth_maxPriorityFeePerGas'), 'priority fee');
  const priorityPeer = parseQuantity(await transport.rpc(RELEASE_RPC_ORIGINS[1], 'eth_maxPriorityFeePerGas'), 'priority fee peer');
  const maxPriorityFeePerGas = priority > priorityPeer ? priority : priorityPeer;
  const maxFeePerGas = (gasPrice > gasPricePeer ? gasPrice : gasPricePeer) * 2n + maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

async function callSame(transport, to, iface, functionName, args, anchor) {
  const data = iface.encodeFunctionData(functionName, args);
  let result;
  try {
    result = await sameStateRead(transport, 'eth_call', [{ to, data }, anchor.numberHex]);
  } catch (error) {
    throw new Error(`${functionName}() proof failed: ${error.message}`);
  }
  const decoded = iface.decodeFunctionResult(functionName, result);
  return decoded.length === 1 ? decoded[0] : decoded;
}

async function sameStateRead(transport, method, params) {
  const left = await transport.rpc(RELEASE_RPC_ORIGINS[0], method, params);
  const right = await transport.rpc(RELEASE_RPC_ORIGINS[1], method, params);
  if (stableJson(left) !== stableJson(right)) throw new Error(`${method} state origins disagree.`);
  return left;
}

function standardProxyRuntime(implementation, salt, collection, tokenId) {
  return ethers.concat([
    '0x363d3d373d3d3d363d73', implementation, '0x5af43d82803e903d91602b57fd5bf3',
    salt, ethers.zeroPadValue(ethers.toBeHex(CHAIN_ID), 32), ethers.zeroPadValue(collection, 32),
    ethers.zeroPadValue(ethers.toBeHex(tokenId), 32),
  ]);
}

async function boundedFetch(fetchImpl, url, options, timeoutMs, maxBytes) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if ((response?.status === 413 || response?.status === 429 || (response?.status >= 500 && response?.status <= 599)) && attempt < 4) {
        const retryAfter = Number(response.headers?.get?.('retry-after') ?? 1);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(1000, Math.min(10_000, retryAfter * 1000))));
        continue;
      }
      if (!response || response.ok !== true || response.url !== new URL(url).href) throw new Error(`Closed release request failed for ${url} (status ${response?.status ?? 'none'}).`);
      const length = Number(response.headers?.get?.('content-length') ?? 0);
      if (Number.isFinite(length) && length > maxBytes) throw new Error('Release response exceeds size cap.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw new Error('Release response exceeds size cap.');
      return JSON.parse(bytes.toString('utf8'));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Closed release request exhausted retries for ${url}.`);
}

function normalizeTransaction(value) {
  requirePlainObject(value, 'transaction');
  return {
    hash: normalizeHash(value.hash, 'transaction hash'),
    blockHash: normalizeHash(value.blockHash, 'transaction block hash'),
    blockNumber: canonicalQuantity(value.blockNumber),
    transactionIndex: canonicalQuantity(value.transactionIndex),
    from: ethers.getAddress(value.from).toLowerCase(),
    to: value.to === null ? null : ethers.getAddress(value.to).toLowerCase(),
    nonce: canonicalQuantity(value.nonce), value: canonicalQuantity(value.value),
    input: normalizeHex(value.input, 'transaction input'),
    type: canonicalQuantity(value.type), chainId: canonicalQuantity(value.chainId), gas: canonicalQuantity(value.gas),
    maxFeePerGas: value.maxFeePerGas == null ? null : canonicalQuantity(value.maxFeePerGas),
    maxPriorityFeePerGas: value.maxPriorityFeePerGas == null ? null : canonicalQuantity(value.maxPriorityFeePerGas),
  };
}

function normalizeReceipt(value) {
  requirePlainObject(value, 'receipt');
  return {
    transactionHash: normalizeHash(value.transactionHash, 'receipt transaction hash'),
    blockHash: normalizeHash(value.blockHash, 'receipt block hash'),
    blockNumber: Number(parseQuantity(value.blockNumber, 'receipt block number')),
    blockNumberHex: canonicalQuantity(value.blockNumber),
    transactionIndex: Number(parseQuantity(value.transactionIndex, 'receipt transaction index')),
    from: ethers.getAddress(value.from).toLowerCase(),
    to: value.to === null ? null : ethers.getAddress(value.to).toLowerCase(),
    contractAddress: value.contractAddress === null ? null : ethers.getAddress(value.contractAddress).toLowerCase(),
    status: canonicalQuantity(value.status), type: canonicalQuantity(value.type),
    logs: value.logs.map(normalizeLog),
  };
}

function canonicalRawEventLog(log) {
  requireExactKeys(log, ['address', 'blockHash', 'blockNumber', 'blockTimestamp', 'transactionHash', 'transactionIndex', 'logIndex', 'removed', 'data', 'topics'], 'raw event log');
  return {
    address: ethers.getAddress(log.address), blockHash: normalizeHash(log.blockHash, 'log block hash'),
    blockNumber: canonicalQuantity(log.blockNumber), blockTimestamp: canonicalQuantity(log.blockTimestamp),
    transactionHash: normalizeHash(log.transactionHash, 'log transaction hash'),
    transactionIndex: canonicalQuantity(log.transactionIndex), logIndex: canonicalQuantity(log.logIndex),
    removed: log.removed === false ? false : (() => { throw new Error('Removed event logs are forbidden.'); })(),
    data: normalizeHex(log.data, 'log data'),
    topics: log.topics.map((topic) => normalizeHash(topic, 'log topic')),
  };
}

function normalizeLog(log) {
  requirePlainObject(log, 'receipt log');
  return {
    address: ethers.getAddress(log.address).toLowerCase(),
    blockHash: normalizeHash(log.blockHash, 'log block hash'), blockNumber: canonicalQuantity(log.blockNumber),
    transactionHash: normalizeHash(log.transactionHash, 'log transaction hash'), transactionIndex: canonicalQuantity(log.transactionIndex),
    logIndex: canonicalQuantity(log.logIndex), removed: log.removed === false, data: normalizeHex(log.data, 'log data'),
    topics: log.topics.map((topic) => normalizeHash(topic, 'log topic')),
  };
}

function normalizeBlock(value) {
  requirePlainObject(value, 'block');
  return { number: canonicalQuantity(value.number), hash: normalizeHash(value.hash, 'block hash'), parentHash: normalizeHash(value.parentHash, 'parent hash') };
}

function sha256Hex(value) {
  return `0x${createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex')}`;
}
function normalizeHash(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is invalid.`);
  return value.toLowerCase();
}
function normalizeHex(value, label) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) throw new Error(`${label} is invalid.`);
  return value.toLowerCase();
}
function canonicalQuantity(value) { return ethers.toQuantity(parseQuantity(value, 'quantity')); }
function parseQuantity(value, label) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) throw new Error(`${label} is not canonical.`);
  return BigInt(value);
}
function requireUint(value, label) {
  const result = typeof value === 'bigint' ? value : BigInt(value);
  if (result < 0n || result > ethers.MaxUint256) throw new Error(`${label} is invalid.`);
  return result;
}
function assertAddress(actual, expected, label) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`${label} mismatch.`);
}
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function requirePlainObject(value, label) { if (!isPlainObject(value)) throw new Error(`${label} must be a plain object with no prototype data.`); }
function requireExactKeys(value, expected, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} has unknown or missing keys.`);
}
function stableJson(value) { return JSON.stringify(value); }

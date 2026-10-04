import { createPublicClient, getAddress, http } from 'viem';
import { base } from 'viem/chains';

export const LOOPERS_MAINNET_CONTRACT = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const LOOPERS_MAINNET_ADAPTER = '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27';
export const LOOPERS_MAINNET_CHAIN_ID = 8453;
const DEFAULT_RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://mainnet.base.org',
];
const DEFAULT_RPC_TIMEOUT_MS = 5_000;
const DEFAULT_INDEXER_TIMEOUT_MS = 5_000;
const DEFAULT_METADATA_BASE_URL = 'https://helixa.xyz/loopers/metadata-hotfix/';
const DEFAULT_IMAGE_BASE_URL = 'https://helixa.xyz/loopers/images/';
const DEFAULT_INDEXER_BASE_URL = 'https://base.blockscout.com/api/v2';
const DEFAULT_OWNER_CHUNK_SIZE = 50;
const LOOPERS_READ_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'totalMinted',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'erc8004AgentIdByLooper',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
];
const LOOPERS_TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
  ],
};
const ADAPTER_READ_ABI = [
  {
    type: 'function',
    name: 'isController',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'controller', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
];

export function createLoopersPublicClients({ rpcUrl, rpcUrls, publicClient, publicClients, rpcRetryCount = 0, rpcRetryDelay = 150 } = {}) {
  const injected = Array.isArray(publicClients) ? publicClients.filter(Boolean) : [];
  if (injected.length) return injected;
  if (publicClient) return [publicClient];
  if (!Number.isSafeInteger(rpcRetryCount) || rpcRetryCount < 0 || rpcRetryCount > 5) throw new TypeError('RPC retry count is invalid.');
  if (!Number.isSafeInteger(rpcRetryDelay) || rpcRetryDelay < 1 || rpcRetryDelay > 5_000) throw new TypeError('RPC retry delay is invalid.');
  const urls = rpcUrl ? [rpcUrl, ...DEFAULT_RPC_URLS.filter((url) => url !== rpcUrl)] : (rpcUrls ?? DEFAULT_RPC_URLS);
  return [...new Set(urls)].map((url) => createPublicClient({
    chain: base,
    transport: http(url, { timeout: DEFAULT_RPC_TIMEOUT_MS, retryCount: rpcRetryCount, retryDelay: rpcRetryDelay }),
  }));
}

export function createLoopersOwnedAgentLoader({
  rpcUrl,
  rpcUrls,
  publicClient,
  publicClients,
  fetchImpl = fetch,
  contract = LOOPERS_MAINNET_CONTRACT,
  adapter = LOOPERS_MAINNET_ADAPTER,
  metadataBaseUrl = DEFAULT_METADATA_BASE_URL,
  imageBaseUrl = DEFAULT_IMAGE_BASE_URL,
  indexerBaseUrl = DEFAULT_INDEXER_BASE_URL,
  indexerTimeoutMs = DEFAULT_INDEXER_TIMEOUT_MS,
  ownerChunkSize = DEFAULT_OWNER_CHUNK_SIZE,
} = {}) {
  const clients = createLoopersPublicClients({ rpcUrl, rpcUrls, publicClient, publicClients });
  return async function loadOwnedLooperAgentsForAddress({ address }) {
    return loadOwnedLooperAgents({
      address,
      publicClients: clients,
      fetchImpl,
      contract,
      adapter,
      metadataBaseUrl,
      imageBaseUrl,
      indexerBaseUrl,
      indexerTimeoutMs,
      ownerChunkSize,
    });
  };
}

export async function loadOwnedLooperAgents({
  address,
  publicClient,
  publicClients,
  fetchImpl = fetch,
  contract = LOOPERS_MAINNET_CONTRACT,
  adapter = LOOPERS_MAINNET_ADAPTER,
  metadataBaseUrl = DEFAULT_METADATA_BASE_URL,
  imageBaseUrl = DEFAULT_IMAGE_BASE_URL,
  indexerBaseUrl = DEFAULT_INDEXER_BASE_URL,
  indexerTimeoutMs = DEFAULT_INDEXER_TIMEOUT_MS,
  ownerChunkSize = DEFAULT_OWNER_CHUNK_SIZE,
} = {}) {
  const owner = normalizeAddress(address);
  const clients = normalizeClients(publicClients, publicClient);
  const [balance, totalMinted] = await Promise.all([
    readMaxUint(clients, {
      address: contract,
      abi: LOOPERS_READ_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
    readMaxUint(clients, {
      address: contract,
      abi: LOOPERS_READ_ABI,
      functionName: 'totalMinted',
    }),
  ]);
  if (balance === 0n) return [];

  const indexedTokenIds = await findOwnedTokenIdsFromIndexer({
    owner,
    contract,
    expectedBalance: balance,
    fetchImpl,
    indexerBaseUrl,
    indexerTimeoutMs,
  });
  const ownedTokenIds = indexedTokenIds ?? await findOwnedTokenIdsByOwnerOf({
    publicClients: clients,
    contract,
    owner,
    expectedBalance: balance,
    totalMinted,
    ownerChunkSize,
  });
  if (ownedTokenIds.length !== Number(balance)) {
    throw new Error(`Looper ownership scan incomplete: expected ${balance}, found ${ownedTokenIds.length}.`);
  }

  const authorizations = await authorizeLooperControls({
    publicClients: clients,
    contract,
    adapter,
    tokenIds: ownedTokenIds,
    wallet: owner,
  });
  const hydrated = [];
  for (const tokenId of ownedTokenIds) {
    const authorization = authorizations.get(String(tokenId));
    hydrated.push(await hydrateOwnedLooper({
      tokenId,
      owner,
      authorization,
      fetchImpl,
      metadataBaseUrl,
      imageBaseUrl,
    }));
  }
  return hydrated.sort(compareTokenIds);
}

async function authorizeLooperControls({ tokenIds, wallet, publicClients, contract, adapter }) {
  const owner = normalizeAddress(wallet);
  const normalizedTokenIds = tokenIds.map(normalizeTokenId);
  const ownershipAndIdentityReads = normalizedTokenIds.flatMap((tokenId) => [
    {
      address: contract,
      abi: LOOPERS_READ_ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    },
    {
      address: contract,
      abi: LOOPERS_READ_ABI,
      functionName: 'erc8004AgentIdByLooper',
      args: [tokenId],
    },
  ]);
  const ownershipAndIdentity = await completeMulticallWithFallback(publicClients, ownershipAndIdentityReads);
  const identities = normalizedTokenIds.map((tokenId, index) => {
    const ownerResult = ownershipAndIdentity[index * 2];
    const identityResult = ownershipAndIdentity[index * 2 + 1];
    if (ownerResult?.status !== 'success' || identityResult?.status !== 'success') {
      const error = new Error('Looper authorization read failed on every provider.');
      error.code = 'chain_read_failed';
      throw error;
    }
    const actualOwner = normalizeAddress(ownerResult.result);
    if (actualOwner.toLowerCase() !== owner.toLowerCase()) {
      const error = new Error('Authenticated wallet does not own this Looper.');
      error.code = 'forbidden';
      throw error;
    }
    const agentId = BigInt(identityResult.result);
    if (agentId <= 0n) throw new Error('Looper has no canonical ERC-8004 identity.');
    return { tokenId, actualOwner, agentId };
  });
  const controllerReads = identities.map(({ agentId }) => ({
    address: adapter,
    abi: ADAPTER_READ_ABI,
    functionName: 'isController',
    args: [agentId, owner],
  }));
  const controllerResults = await completeMulticallWithFallback(publicClients, controllerReads);
  return new Map(identities.map(({ tokenId, actualOwner, agentId }, index) => {
    const controllerResult = controllerResults[index];
    if (controllerResult?.status !== 'success') {
      const error = new Error('Looper controller read failed on every provider.');
      error.code = 'chain_read_failed';
      throw error;
    }
    if (!controllerResult.result) {
      const error = new Error('Authenticated wallet is not the ERC-8004 identity controller.');
      error.code = 'forbidden';
      throw error;
    }
    return [tokenId.toString(), {
      chainId: LOOPERS_MAINNET_CHAIN_ID,
      contract: getAddress(contract),
      adapter: getAddress(adapter),
      tokenId: tokenId.toString(),
      owner: actualOwner,
      erc8004AgentId: agentId.toString(),
      controllerVerified: true,
    }];
  }));
}

export async function authorizeLooperControl({
  tokenId,
  wallet,
  publicClient,
  publicClients,
  contract = LOOPERS_MAINNET_CONTRACT,
  adapter = LOOPERS_MAINNET_ADAPTER,
} = {}) {
  const owner = normalizeAddress(wallet);
  const normalizedTokenId = normalizeTokenId(tokenId);
  const clients = normalizeClients(publicClients, publicClient);
  const actualOwner = await readExpectedOwnerWithFallback(clients, {
    address: contract,
    abi: LOOPERS_READ_ABI,
    functionName: 'ownerOf',
    args: [normalizedTokenId],
  }, owner);
  const agentId = await readWithFallback(clients, {
    address: contract,
    abi: LOOPERS_READ_ABI,
    functionName: 'erc8004AgentIdByLooper',
    args: [normalizedTokenId],
  });
  if (BigInt(agentId) <= 0n) throw new Error('Looper has no canonical ERC-8004 identity.');
  const controllerVerified = await readWithFallback(clients, {
    address: adapter,
    abi: ADAPTER_READ_ABI,
    functionName: 'isController',
    args: [BigInt(agentId), owner],
  });
  if (!controllerVerified) {
    const error = new Error('Authenticated wallet is not the ERC-8004 identity controller.');
    error.code = 'forbidden';
    throw error;
  }
  return {
    chainId: LOOPERS_MAINNET_CHAIN_ID,
    contract: getAddress(contract),
    adapter: getAddress(adapter),
    tokenId: normalizedTokenId.toString(),
    owner: actualOwner,
    erc8004AgentId: BigInt(agentId).toString(),
    controllerVerified: true,
  };
}

export async function readLooperTransferEvents({
  publicClient,
  tokenId,
  fromBlock,
  toBlock,
  contract = LOOPERS_MAINNET_CONTRACT,
  cap = 1_000,
} = {}) {
  if (typeof publicClient?.getLogs !== 'function') throw new TypeError('A Base public client is required.');
  const normalizedTokenId = normalizeTokenId(tokenId);
  const start = normalizeBlockNumber(fromBlock, 'fromBlock');
  const end = normalizeBlockNumber(toBlock, 'toBlock');
  if (end < start) throw new TypeError('Transfer block range is invalid.');
  if (end - start + 1 > 2_000) throw new TypeError('Transfer block span exceeds 2000 blocks.');
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 10_000) throw new TypeError('Transfer evidence cap is invalid.');
  const collection = getAddress(contract);
  const logs = await publicClient.getLogs({
    address: collection,
    event: LOOPERS_TRANSFER_EVENT,
    args: { tokenId: normalizedTokenId },
    fromBlock: BigInt(start),
    toBlock: BigInt(end),
    strict: true,
  });
  if (!Array.isArray(logs)) throw new Error('Looper Transfer evidence is malformed.');
  if (logs.length > cap) throw new Error('Looper Transfer evidence cap exceeded.');
  return logs.map((log) => {
    try {
      if (log.removed !== false || getAddress(log.address) !== collection || BigInt(log.args?.tokenId) !== normalizedTokenId) throw new Error('mismatch');
      const blockNumber = normalizeBlockNumber(log.blockNumber, 'Transfer blockNumber');
      if (blockNumber < start || blockNumber > end) throw new Error('range');
      return Object.freeze({
        blockNumber,
        blockHash: normalizeEvidenceHash(log.blockHash),
        transactionHash: normalizeEvidenceHash(log.transactionHash),
        transactionIndex: normalizeBlockNumber(log.transactionIndex, 'Transfer transactionIndex'),
        logIndex: normalizeBlockNumber(log.logIndex, 'Transfer logIndex'),
        from: getAddress(log.args.from),
        to: getAddress(log.args.to),
        tokenId: normalizedTokenId.toString(),
      });
    } catch {
      throw new Error('Looper Transfer evidence is malformed or mismatched.');
    }
  }).sort((left, right) => left.blockNumber - right.blockNumber || left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex);
}

export async function readLooperControllerEvidence({
  publicClient,
  tokenId,
  controller,
  blockNumber,
  contract = LOOPERS_MAINNET_CONTRACT,
  adapter = LOOPERS_MAINNET_ADAPTER,
} = {}) {
  if (typeof publicClient?.readContract !== 'function') throw new TypeError('A Base public client is required.');
  const normalizedTokenId = normalizeTokenId(tokenId);
  const normalizedController = normalizeAddress(controller);
  const normalizedBlock = normalizeBlockNumber(blockNumber, 'blockNumber');
  const erc8004AgentId = BigInt(await publicClient.readContract({
    address: getAddress(contract),
    abi: LOOPERS_READ_ABI,
    functionName: 'erc8004AgentIdByLooper',
    args: [normalizedTokenId],
    blockNumber: BigInt(normalizedBlock),
  }));
  if (erc8004AgentId <= 0n) throw new Error('Looper controller evidence has no canonical ERC-8004 identity.');
  const verified = await publicClient.readContract({
    address: getAddress(adapter),
    abi: ADAPTER_READ_ABI,
    functionName: 'isController',
    args: [erc8004AgentId, normalizedController],
    blockNumber: BigInt(normalizedBlock),
  });
  if (verified !== true) throw new Error('Looper controller evidence is not verified.');
  return Object.freeze({ tokenId: normalizedTokenId.toString(), erc8004AgentId: erc8004AgentId.toString(), controller: normalizedController, verified: true, blockNumber: normalizedBlock });
}

function normalizeBlockNumber(value, label) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(label + ' must be a non-negative safe integer.');
  return number;
}

function normalizeEvidenceHash(value) {
  const hash = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(hash)) throw new TypeError('Evidence hash is invalid.');
  return hash;
}

async function findOwnedTokenIdsByOwnerOf({ publicClients, contract, owner, expectedBalance, totalMinted, ownerChunkSize }) {
  const owned = [];
  const max = Number(totalMinted);
  const targetCount = Number(expectedBalance);
  if (!Number.isSafeInteger(max) || max < 0 || max > 7_777) throw new Error('Looper total supply is outside the bounded scan range.');
  const chunkSize = Math.max(1, Math.min(Number(ownerChunkSize) || DEFAULT_OWNER_CHUNK_SIZE, 100));
  for (let end = max; end >= 1 && owned.length < targetCount; end -= chunkSize) {
    const start = Math.max(1, end - chunkSize + 1);
    const contracts = [];
    for (let tokenId = start; tokenId <= end; tokenId += 1) {
      contracts.push({
        address: contract,
        abi: LOOPERS_READ_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
    }
    const results = await completeMulticallWithFallback(publicClients, contracts);
    for (let index = 0; index < results.length; index += 1) {
      let result = results[index];
      if (result?.status !== 'success') {
        try {
          result = { status: 'success', result: await readWithFallback(publicClients, contracts[index]) };
        } catch {
          continue;
        }
      }
      if (String(result.result ?? '').toLowerCase() !== owner.toLowerCase()) continue;
      owned.push(String(start + index));
    }
  }
  return owned.slice(0, targetCount);
}

async function completeMulticallWithFallback(clients, contracts) {
  const merged = Array.from({ length: contracts.length }, () => null);
  const responses = await Promise.allSettled(clients.map((client) => client.multicall({ contracts, allowFailure: true })));
  let completedResponse = false;
  let lastError = null;
  for (const response of responses) {
    if (response.status === 'rejected') {
      lastError = response.reason;
      continue;
    }
    const results = response.value;
    if (!Array.isArray(results) || results.length !== contracts.length) {
      lastError = new Error('RPC returned an incomplete ownership chunk.');
      continue;
    }
    completedResponse = true;
    results.forEach((result, index) => {
      if (result?.status === 'success') merged[index] = result;
    });
  }
  if (!completedResponse) {
    throw new Error(`Looper ownership scan incomplete: ${lastError?.message ?? 'all providers failed'}`);
  }
  return merged.map((result) => result ?? { status: 'failure' });
}

async function readWithFallback(clients, request) {
  const responses = await Promise.allSettled(clients.map((client) => client.readContract(request)));
  const completed = responses.find((response) => response.status === 'fulfilled');
  if (completed) return completed.value;
  const lastError = responses.findLast((response) => response.status === 'rejected')?.reason;
  throw new Error(`Looper chain read failed: ${lastError?.message ?? 'all providers failed'}`);
}

async function readExpectedOwnerWithFallback(clients, request, expectedOwner) {
  const responses = await Promise.allSettled(clients.map((client) => client.readContract(request)));
  let completedRead = false;
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;
    const actualOwner = normalizeAddress(response.value);
    completedRead = true;
    if (actualOwner.toLowerCase() === expectedOwner.toLowerCase()) return actualOwner;
  }
  const error = new Error(completedRead
    ? 'Authenticated wallet does not own this Looper.'
    : 'Looper owner read failed on every provider.');
  error.code = completedRead ? 'forbidden' : 'chain_read_failed';
  throw error;
}

async function readMaxUint(clients, request) {
  const responses = await Promise.allSettled(clients.map((client) => client.readContract(request)));
  const values = responses
    .filter((response) => response.status === 'fulfilled')
    .map((response) => BigInt(response.value));
  if (!values.length) throw new Error('Looper chain read failed on every provider.');
  return values.reduce((max, value) => value > max ? value : max, 0n);
}

async function hydrateOwnedLooper({ tokenId, owner, authorization, fetchImpl, metadataBaseUrl, imageBaseUrl }) {
  const metadata = await fetchLooperMetadata({ tokenId, fetchImpl, metadataBaseUrl });
  const traits = metadataToTraits(metadata);
  const role = traits['Agent Class'] ?? traits.Class ?? 'Looper agent';
  const secondary = traits['Secondary Class'];
  const specialization = traits.Specialization;
  const risk = traits.Risk;
  const autonomy = traits.Autonomy;
  const name = String(metadata?.name ?? `Looper #${tokenId}`).trim() || `Looper #${tokenId}`;
  const image = normalizeHttpsUrl(metadata?.image) ?? joinUrl(imageBaseUrl, `${tokenId}.png`);

  return {
    tokenId,
    name,
    canonicalName: name,
    owner,
    image,
    role,
    verified: true,
    erc8004AgentId: authorization.erc8004AgentId,
    controllerVerified: authorization.controllerVerified,
    chainId: authorization.chainId,
    contract: authorization.contract,
    adapter: authorization.adapter,
    credScore: null,
    credLabel: 'Cred pending',
    href: `/multipass/loopers/${encodeURIComponent(tokenId)}`,
    state: 'Owned Looper',
    traits,
    attributes: Array.isArray(metadata?.attributes) ? metadata.attributes : [],
    identityBadges: [
      `ERC-8004 #${authorization.erc8004AgentId}`,
      role,
      secondary,
      risk ? `${risk} risk` : null,
      autonomy ? `${autonomy} autonomy` : null,
    ].filter(Boolean).slice(0, 4),
    logline: [role, secondary, specialization].filter(Boolean).join(' · '),
    temperament: [risk, autonomy].filter(Boolean).join(' / ') || 'Review-only operator',
    temperamentBody: createTemperamentBody({ risk, autonomy }),
    identityBody: `Wallet-owned Looper #${tokenId}, bound to ERC-8004 identity #${authorization.erc8004AgentId}.`,
    mandateBody: specialization ? `Primary operating bias: ${specialization}.` : 'Use token traits, wallet context, and memory to brief before proposals.',
    operatorBody: 'No spend, post, or transaction executes without owner approval.',
    profileLane: specialization ?? role,
    watchLabel: specialization ?? 'Wallet context',
    watchBody: createWatchBody({ specialization, role }),
  };
}

async function findOwnedTokenIdsFromIndexer({ owner, contract, expectedBalance, fetchImpl, indexerBaseUrl, indexerTimeoutMs }) {
  if (!indexerBaseUrl || typeof fetchImpl !== 'function') return null;
  const endpoint = `${String(indexerBaseUrl).replace(/\/+$/u, '')}/tokens/${getAddress(contract)}/instances`;
  const tokenIds = new Set();
  let nextPageParams = { holder_address_hash: owner };

  for (let page = 0; page < 20 && nextPageParams; page += 1) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(nextPageParams)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, indexerTimeoutMs);
    if (!response?.ok) return null;
    const body = await response.json().catch(() => null);
    if (!Array.isArray(body?.items)) return null;
    for (const item of body.items) {
      const indexedContract = item?.token?.address_hash;
      if (indexedContract && String(indexedContract).toLowerCase() !== String(contract).toLowerCase()) return null;
      try {
        tokenIds.add(normalizeTokenId(item?.id).toString());
      } catch {
        return null;
      }
    }
    if (tokenIds.size > Number(expectedBalance)) return null;
    nextPageParams = body.next_page_params && typeof body.next_page_params === 'object'
      ? { holder_address_hash: owner, ...body.next_page_params }
      : null;
  }

  return tokenIds.size === Number(expectedBalance)
    ? [...tokenIds].sort((left, right) => Number(left) - Number(right))
    : null;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(fetchImpl(url, { ...init, signal: controller.signal })).catch(() => null),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, Math.max(1, Number(timeoutMs) || DEFAULT_INDEXER_TIMEOUT_MS));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLooperMetadata({ tokenId, fetchImpl, metadataBaseUrl }) {
  const response = await fetchImpl(joinUrl(metadataBaseUrl, `${tokenId}.json`), {
    method: 'GET',
    headers: { accept: 'application/json' },
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function metadataToTraits(metadata) {
  const traits = {};
  for (const attribute of Array.isArray(metadata?.attributes) ? metadata.attributes : []) {
    const key = String(attribute?.trait_type ?? attribute?.traitType ?? '').trim();
    if (!key) continue;
    traits[key] = String(attribute?.value ?? '').trim();
  }
  return traits;
}

function createTemperamentBody({ risk, autonomy }) {
  if (risk || autonomy) return `Risk posture: ${risk ?? 'unknown'}. Autonomy: ${autonomy ?? 'unknown'}. Console mode stays review-only.`;
  return 'Looper temperament is inferred from public token traits and owner memory.';
}

function createWatchBody({ specialization, role }) {
  if (specialization) return `Tracks ${specialization} through wallet context, memory, and review-only proposals.`;
  return `Uses the ${role} trait profile to brief the connected owner before any proposal.`;
}

function compareTokenIds(left, right) {
  return Number(left.tokenId) - Number(right.tokenId);
}

function normalizeClients(publicClients, publicClient) {
  const clients = Array.isArray(publicClients) ? publicClients.filter(Boolean) : (publicClient ? [publicClient] : []);
  if (!clients.length) throw new TypeError('At least one Base public client is required.');
  return clients;
}

function normalizeAddress(value) {
  try {
    return getAddress(String(value ?? '').trim());
  } catch {
    throw new TypeError('Provide a valid Ethereum address.');
  }
}

function normalizeTokenId(value) {
  try {
    const tokenId = BigInt(value);
    if (tokenId <= 0n || tokenId > 7_777n) throw new Error('out of range');
    return tokenId;
  } catch {
    throw new TypeError('Provide a valid Looper token ID.');
  }
}

function normalizeHttpsUrl(value) {
  const text = String(value ?? '').trim();
  return /^https:\/\//i.test(text) ? text : null;
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  const suffix = String(path ?? '').replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

import { createPublicClient, getAddress, http } from 'viem';
import { base } from 'viem/chains';

export const LOOPERS_MAINNET_CONTRACT = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const LOOPERS_MAINNET_ADAPTER = '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27';
export const LOOPERS_MAINNET_CHAIN_ID = 8453;
const DEFAULT_RPC_URLS = ['https://base.drpc.org', 'https://mainnet.base.org'];
const DEFAULT_METADATA_BASE_URL = 'https://helixa.xyz/loopers/metadata-hotfix/';
const DEFAULT_IMAGE_BASE_URL = 'https://helixa.xyz/loopers/images/';
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
const ADAPTER_READ_ABI = [
  {
    type: 'function',
    name: 'isController',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'controller', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
];

export function createLoopersPublicClients({ rpcUrl, rpcUrls, publicClient, publicClients } = {}) {
  const injected = Array.isArray(publicClients) ? publicClients.filter(Boolean) : [];
  if (injected.length) return injected;
  if (publicClient) return [publicClient];
  const urls = rpcUrl ? [rpcUrl, ...DEFAULT_RPC_URLS.filter((url) => url !== rpcUrl)] : (rpcUrls ?? DEFAULT_RPC_URLS);
  return [...new Set(urls)].map((url) => createPublicClient({ chain: base, transport: http(url) }));
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

  const ownedTokenIds = await findOwnedTokenIdsByOwnerOf({
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

  const hydrated = [];
  for (const tokenId of ownedTokenIds) {
    const authorization = await authorizeLooperControl({
      publicClients: clients,
      contract,
      adapter,
      tokenId,
      wallet: owner,
    });
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
    results.forEach((result, index) => {
      if (String(result.result ?? '').toLowerCase() !== owner.toLowerCase()) return;
      owned.push(String(start + index));
    });
  }
  return owned.slice(0, targetCount);
}

async function completeMulticallWithFallback(clients, contracts) {
  let lastError = null;
  for (const client of clients) {
    try {
      const results = await client.multicall({ contracts, allowFailure: true });
      if (Array.isArray(results) && results.length === contracts.length && results.every((result) => result?.status === 'success')) {
        return results;
      }
      lastError = new Error('RPC returned an incomplete ownership chunk.');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Looper ownership scan incomplete: ${lastError?.message ?? 'all providers failed'}`);
}

async function readWithFallback(clients, request) {
  let lastError = null;
  for (const client of clients) {
    try {
      return await client.readContract(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Looper chain read failed: ${lastError?.message ?? 'all providers failed'}`);
}

async function readExpectedOwnerWithFallback(clients, request, expectedOwner) {
  let completedRead = false;
  for (const client of clients) {
    try {
      const actualOwner = normalizeAddress(await client.readContract(request));
      completedRead = true;
      if (actualOwner.toLowerCase() === expectedOwner.toLowerCase()) return actualOwner;
    } catch {}
  }
  const error = new Error(completedRead
    ? 'Authenticated wallet does not own this Looper.'
    : 'Looper owner read failed on every provider.');
  error.code = completedRead ? 'forbidden' : 'chain_read_failed';
  throw error;
}

async function readMaxUint(clients, request) {
  const values = [];
  for (const client of clients) {
    try {
      values.push(BigInt(await client.readContract(request)));
    } catch {}
  }
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

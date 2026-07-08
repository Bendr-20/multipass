import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

const SCHEMA_VERSION = '0.1.0';
const HELIXA_CHAIN_ID = 8453;
const HELIXA_AGENT_API_BASE = 'https://api.helixa.xyz/api/v2/agent';
const ETHEREUM_CHAIN_ID = 1;
const NORMIES_API_BASE = 'https://api.normies.art';
const NORMIES_AGENT_IDENTITY_CONTRACT = '0xde152afb7db5373f34876e1499fbd893a82dd336';
const NORMIES_ART_CONTRACT = '0x9eb6e2025b64f340691e424b7fe7022ffde12438';
const NORMIES_SOURCE_TYPE = 'normies_agent_nft';
const ERC8004_BASE_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ERC8004_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ERC8004_BLOCKSCOUT_API = 'https://base.blockscout.com/api';
const BASE_RPC_URL = 'https://mainnet.base.org';
const BASE_RPC_FALLBACK_URLS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'];
const DEFAULT_ERC8004_DISCOVERY_TIMEOUT_MS = 8000;
const ERC8004_IDENTITY_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
];
const SOURCE_TYPE = 'helixa_agent';
const ACTIVATION_ORIGIN = 'live_agent_record';
const ACTIVATION_ORIGIN_SOURCE = 'trusted_resolver_metadata';

const PUBLIC_SOURCE_FIELDS = new Set([
  'tokenId',
  'agentAddress',
  'name',
  'owner',
  'verified',
  'mintOrigin',
  'credScore',
  'framework',
  'mintedAt',
  'services',
  'socials',
]);

const SERVICE_PUBLIC_FIELDS = new Set([
  'url',
  'profileUrl',
  'handle',
  'description',
  'protocol',
]);

export function parseActivationInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new TypeError('Use a token ID like 1 or a canonical Base ID like 8453:1.');
  }

  if (/^\d+$/.test(raw)) {
    if (!isPositiveTokenId(raw)) {
      throw new TypeError('Use a token ID greater than zero.');
    }
    return { chainId: HELIXA_CHAIN_ID, tokenId: raw, canonicalId: `${HELIXA_CHAIN_ID}:${raw}` };
  }

  const canonical = raw.match(/^(\d+):(\d+)$/);
  if (!canonical) {
    throw new TypeError('Use a token ID like 1 or a canonical Base ID like 8453:1. API activation does not support name search.');
  }

  const chainId = Number(canonical[1]);
  if (chainId !== HELIXA_CHAIN_ID) {
    throw new TypeError('API activation supports Base Helixa AgentDNA records only. Use 8453:<tokenId>.');
  }

  const tokenId = canonical[2];
  if (!isPositiveTokenId(tokenId)) {
    throw new TypeError('Use a token ID greater than zero.');
  }

  return { chainId, tokenId, canonicalId: `${HELIXA_CHAIN_ID}:${tokenId}` };
}

export async function fetchHelixaAgent(tokenId, fetchImpl = fetch) {
  const parsed = parseActivationInput(tokenId);
  const url = `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(parsed.tokenId)}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new Error(`Could not reach the Helixa API: ${error?.message ?? error}`);
  }

  if (!response?.ok) {
    const status = response?.status ?? 'unknown status';
    if (status === 404) throw new Error('No Helixa agent found for that token ID.');
    if (status === 429) throw new Error('Helixa API is rate-limiting activation requests. Try again shortly.');
    throw new Error(`GET Helixa agent failed with ${status}.`);
  }

  if (typeof response.json === 'function') {
    return response.json();
  }

  const text = await response.text();
  return JSON.parse(text);
}

export function buildSavedRecordFromHelixaAgent(agent, options = {}) {
  const tokenId = normalizeTokenId(agent?.tokenId);
  const canonicalId = `${HELIXA_CHAIN_ID}:${tokenId}`;
  const multipassId = `mp_helixa_agent_${tokenId}`;
  const displayName = normalizeDisplayName(agent?.name, tokenId);
  const slug = slugifyDisplayName(displayName, tokenId);
  const observedAt = normalizeObservedAt(options.observedAt);
  const sourceSnapshot = sanitizeSourceSnapshot({ ...agent, tokenId });
  const sourceUrl = `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`;
  const erc8004Identities = normalizeErc8004Identities(options.erc8004Identities, { observedAt });
  const primaryErc8004Identity = selectPrimaryErc8004Identity(erc8004Identities);
  const fragments = createPublicFragments({ tokenId, canonicalId, multipassId, displayName, observedAt, sourceSnapshot, sourceUrl, erc8004Identities });
  const standardsProfileId = `sp_helixa_agent_${tokenId}`;
  const credScore = Number(sourceSnapshot.credScore);
  const hasCredScore = Number.isFinite(credScore);

  const profile = assertMultipassProfile({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    subject_type: 'agent',
    display_name: displayName,
    slug,
    status: 'active',
    owner_summary: {
      owner_state: 'unclaimed',
      verification_status: 'none',
      visibility: 'public',
      summary: 'Saved from a live public Helixa source record. Management is not claimed until a separate verification flow completes.',
    },
    custody_epoch: null,
    public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({
      fragment_id,
      fragment_type,
      status,
      assurance_level,
      visibility,
      updated_at,
    })),
    cred_summary: {
      trust_state: hasCredScore ? 'building' : 'none',
      attestation_count: fragments.filter((fragment) => fragment.fragment_type === 'attestation').length,
      receipt_count: 0,
      last_updated_at: observedAt,
      public_note: hasCredScore
        ? `Public Cred score ${sourceSnapshot.credScore} observed from the live Helixa source record.`
        : 'No public Cred score was published by the live Helixa source record.',
    },
    discovery_profile: {
      summary: `${displayName} saved from a public Helixa AgentDNA source record. Source evidence only; owner, tools, payments, and private credentials are not claimed by this save.`,
      tags: uniqueStrings(['helixa', 'agentdna', 'multipass', sourceSnapshot.framework]),
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: standardsProfileId,
      supported_standard_ids: ['ERC-8004'],
      last_verified_at: primaryErc8004Identity ? observedAt : null,
    },
    payment_profile: {
      accepted_assets: [],
      x402_manifest_url: null,
      paid_endpoints_enabled: false,
    },
    updated_at: observedAt,
  });

  const agentCard = assertAgentCard({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    name: displayName,
    subject_type: 'agent',
    capabilities: [],
    message_routes: [],
    service_endpoints: createServiceEndpoints(sourceSnapshot.services),
    x402_manifest_url: null,
    accepted_assets: [],
    trust_summary: {
      identity_status: primaryErc8004Identity ? 'verified' : 'unverified',
      assurance_level: primaryErc8004Identity ? 'onchain_verified' : 'unverified',
      last_updated_at: observedAt,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: 'Saved records are unclaimed until ownership and management rights are verified.',
    },
    standards_refs: [
      {
        standard_id: 'ERC-8004',
        support_status: primaryErc8004Identity ? 'active' : 'imported_unverified',
        record_id: primaryErc8004Identity?.canonicalId ?? canonicalId,
      },
    ],
  });

  const standardsProfile = assertStandardsProfile({
    schema_version: SCHEMA_VERSION,
    standards_profile_id: standardsProfileId,
    multipass_id: multipassId,
    primary_refs: { helixa_agent: canonicalId, erc8004_identity: primaryErc8004Identity?.canonicalId ?? null },
    standard_refs: [
      {
        standard_id: 'ERC-8004',
        status: primaryErc8004Identity ? 'active' : 'imported_unverified',
        chain_id: primaryErc8004Identity?.chainId ?? HELIXA_CHAIN_ID,
        contract_address: primaryErc8004Identity?.registryAddress ?? null,
        record_id: primaryErc8004Identity?.canonicalId ?? canonicalId,
        adapter_version: '0.1.0',
        last_verified_at: primaryErc8004Identity ? observedAt : null,
        assurance_level: primaryErc8004Identity ? 'onchain_verified' : 'unverified',
      },
    ],
    compatibility_summary: {
      identity_bound: Boolean(primaryErc8004Identity),
      owner_verified: primaryErc8004Identity ? ['agent_owned', 'owner_owned'].includes(primaryErc8004Identity.custody) : false,
      risk_checked: false,
      tools_verified: false,
      work_attested: false,
      trust_updated: Boolean(primaryErc8004Identity),
    },
    adapter_versions: { 'ERC-8004': '0.1.0' },
    last_verified_at: primaryErc8004Identity ? observedAt : null,
  });

  const x402Manifest = assertX402Manifest({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    endpoints: [],
  });

  const receipts = [];

  return {
    source: {
      sourceType: SOURCE_TYPE,
      canonicalId,
      tokenId,
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: ACTIVATION_ORIGIN,
        originSource: ACTIVATION_ORIGIN_SOURCE,
        sourceType: SOURCE_TYPE,
        canonicalId,
        tokenId,
        savedAt: observedAt,
      },
      sourceSnapshot: {
        ...sourceSnapshot,
        ...(erc8004Identities.length ? { erc8004Identities: erc8004Identities.map(publicErc8004IdentitySnapshot) } : {}),
      },
    },
    profile,
    fragments: fragments.map(assertIdentityFragment),
    agentCard,
    standardsProfile,
    x402Manifest,
    receipts: receipts.map(assertReceiptFragment),
    change: {
      change_id: `change_helixa_agent_${safeKey(tokenId)}_initial_save`,
      message: 'Multipass saved from live public source record.',
      created_at: observedAt,
    },
  };
}

export async function activateHelixaRecord(input, { fetchImpl = fetch, observedAt, erc8004Discovery = discoverErc8004Identities, discoveryTimeoutMs, readContract, publicClient } = {}) {
  const normiesInput = parseNormiesActivationInput(input);
  if (normiesInput) {
    return activateNormiesAgentRecord(normiesInput, { fetchImpl, observedAt });
  }

  const erc8004Input = parseErc8004ActivationInput(input);
  if (erc8004Input) {
    return activateErc8004IdentityRecord(erc8004Input, { fetchImpl, observedAt, readContract, publicClient });
  }

  const parsed = parseActivationInput(input);
  const agent = await fetchHelixaAgent(parsed.tokenId, fetchImpl);
  const returnedTokenId = agent?.tokenId === undefined || agent?.tokenId === null ? parsed.tokenId : normalizeTokenId(agent.tokenId);
  if (returnedTokenId !== parsed.tokenId) {
    throw new Error('Helixa API returned an agent token ID that did not match the activation input.');
  }
  const normalizedAgent = { ...agent, tokenId: parsed.tokenId };
  const erc8004Identities = await discoverErc8004IdentitiesWithTimeout(normalizedAgent, {
    observedAt,
    erc8004Discovery,
    timeoutMs: discoveryTimeoutMs,
  });
  return buildSavedRecordFromHelixaAgent(normalizedAgent, { observedAt, erc8004Identities });
}


async function activateNormiesAgentRecord(input, { fetchImpl, observedAt } = {}) {
  const info = input.agentId
    ? await fetchNormiesJson(`/agents/by-agent-id/${encodeURIComponent(input.agentId)}/info`, { fetchImpl })
    : await fetchNormiesJson(`/agents/info/${encodeURIComponent(input.tokenId)}`, { fetchImpl });
  const normieTokenId = normalizeTokenId(info?.tokenId ?? input.tokenId);
  const agentId = normalizeTokenId(info?.agentId ?? input.agentId);

  if (input.agentId && agentId !== input.agentId) {
    throw new Error('Normies API returned an agent ID that did not match the activation input.');
  }
  if (input.tokenId && normieTokenId !== input.tokenId) {
    throw new Error('Normies API returned a token ID that did not match the activation input.');
  }

  const [bindingBody, ownerBody] = await Promise.all([
    fetchNormiesJson(`/agents/binding/${encodeURIComponent(normieTokenId)}`, { fetchImpl }),
    fetchNormiesJson(`/normie/${encodeURIComponent(normieTokenId)}/owner`, { fetchImpl }),
  ]);
  const binding = bindingBody?.binding ?? null;
  const bindingAgentId = normalizeTokenId(binding?.agentId ?? agentId);
  const bindingTokenId = normalizeTokenId(binding?.tokenId ?? normieTokenId);

  if (bindingAgentId !== agentId || bindingTokenId !== normieTokenId) {
    throw new Error('Normies API returned a binding that did not match the activation input.');
  }

  return buildSavedRecordFromNormiesAgent({
    info: { ...info, tokenId: normieTokenId, agentId },
    binding: { ...binding, tokenId: normieTokenId, agentId },
    owner: ownerBody?.owner,
  }, { observedAt });
}

async function fetchNormiesJson(path, { fetchImpl }) {
  const url = `${NORMIES_API_BASE}${path}`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new Error(`Could not reach the Normies API: ${error?.message ?? error}`);
  }

  if (!response?.ok) {
    const status = response?.status ?? 'unknown status';
    if (status === 404) throw new Error('No Normies agent found for that activation input.');
    if (status === 429) throw new Error('Normies API is rate-limiting activation requests. Try again shortly.');
    throw new Error(`GET Normies agent failed with ${status}.`);
  }

  return typeof response.json === 'function' ? response.json() : JSON.parse(await response.text());
}

function parseNormiesActivationInput(input) {
  const raw = String(input ?? '').trim();
  const match = raw.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/);
  if (!match) return null;
  const chainId = Number(match[1]);
  const contractAddress = normalizeAddress(match[2]);
  const tokenId = match[3];
  if (chainId !== ETHEREUM_CHAIN_ID || !contractAddress || !isPositiveTokenId(tokenId)) return null;
  if (addressesEqual(contractAddress, NORMIES_AGENT_IDENTITY_CONTRACT)) {
    return { chainId, agentContract: NORMIES_AGENT_IDENTITY_CONTRACT, agentId: tokenId };
  }
  if (addressesEqual(contractAddress, NORMIES_ART_CONTRACT)) {
    return { chainId, tokenContract: NORMIES_ART_CONTRACT, tokenId };
  }
  return null;
}

function parseErc8004ActivationInput(input) {
  const raw = String(input ?? '').trim();
  const short = raw.match(/^erc8004:(\d+):(\d+)$/i);
  const wrapped = raw.match(/^erc8004:eip155:(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/i);
  const eip155 = raw.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/i);
  const match = short ?? wrapped ?? eip155;
  if (!match) {
    if (/^erc8004:/i.test(raw) || /^eip155:8453:/i.test(raw)) {
      throw new TypeError('Use a Base ERC-8004 identity source like erc8004:8453:<tokenId> or eip155:8453:<registry>:<tokenId>.');
    }
    return null;
  }

  const chainId = Number(match[1]);
  const registryAddress = short ? ERC8004_BASE_IDENTITY_REGISTRY : normalizeAddress(match[2]);
  const tokenId = short ? match[2] : match[3];
  if (chainId !== HELIXA_CHAIN_ID) {
    throw new TypeError('Direct ERC-8004 activation supports Base identities only. Use chain 8453.');
  }
  if (!registryAddress || !addressesEqual(registryAddress, ERC8004_BASE_IDENTITY_REGISTRY)) {
    throw new TypeError('Direct ERC-8004 activation supports the Base ERC-8004 Identity Registry only.');
  }
  if (!isPositiveTokenId(tokenId)) {
    throw new TypeError('Use an ERC-8004 identity token ID greater than zero.');
  }
  return {
    chainId: HELIXA_CHAIN_ID,
    registryAddress: ERC8004_BASE_IDENTITY_REGISTRY,
    tokenId,
    canonicalId: `eip155:${HELIXA_CHAIN_ID}:${ERC8004_BASE_IDENTITY_REGISTRY}:${tokenId}`,
  };
}

async function activateErc8004IdentityRecord(input, { fetchImpl, observedAt, readContract, publicClient } = {}) {
  const client = publicClient ?? (readContract ? null : createPublicClient({
    chain: base,
    transport: createBaseRpcTransport(process.env.BASE_RPC_URL),
  }));
  const onchain = await readErc8004IdentityToken({
    tokenId: input.tokenId,
    registryAddress: input.registryAddress,
    readContract,
    publicClient: client,
  });
  if (!onchain?.owner) throw new Error('No ERC-8004 identity found for that source ID.');

  const metadata = await readErc8004TokenMetadata(onchain.tokenURI, { fetchImpl });
  return buildSavedRecordFromErc8004Identity({ input, onchain, metadata }, { observedAt });
}

function buildSavedRecordFromNormiesAgent({ info, binding, owner }, options = {}) {
  const normieTokenId = normalizeTokenId(info?.tokenId ?? binding?.tokenId);
  const agentId = normalizeTokenId(info?.agentId ?? binding?.agentId);
  const observedAt = normalizeObservedAt(options.observedAt);
  const identityId = normiesAgentIdentityId(agentId);
  const backingNftId = normiesBackingNftId(normieTokenId);
  const multipassId = `mp_normies_agent_${agentId}`;
  const displayName = normalizeDisplayName(info?.name, normieTokenId);
  const slug = slugifyDisplayName(displayName, normieTokenId);
  const normalizedOwner = normalizeAddress(owner);
  const imageUrl = `${NORMIES_API_BASE}/agents/image/${encodeURIComponent(normieTokenId)}`;
  const agentInfoUrl = `${NORMIES_API_BASE}/agents/info/${encodeURIComponent(normieTokenId)}`;
  const agentCardUrl = `${NORMIES_API_BASE}/agents/agent-card/${encodeURIComponent(normieTokenId)}`;
  const metadataUrl = `${NORMIES_API_BASE}/agents/metadata/${encodeURIComponent(normieTokenId)}`;
  const backingTokenAddress = normalizeAddress(binding?.tokenContract) ?? NORMIES_ART_CONTRACT;
  const summary = createNormiesSummary({ info, displayName, normieTokenId });
  const fragments = createNormiesPublicFragments({
    multipassId,
    normieTokenId,
    agentId,
    displayName,
    observedAt,
    identityId,
    backingNftId,
    owner: normalizedOwner,
    agentInfoUrl,
    metadataUrl,
  });

  const profile = assertMultipassProfile({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    subject_type: 'agent',
    display_name: displayName,
    slug,
    status: 'active',
    owner_summary: {
      owner_state: 'unclaimed',
      verification_status: 'none',
      visibility: 'public',
      summary: 'Read-only Ethereum Normies NFT-backed agent profile. Management is not claimed until a separate verification flow completes.',
    },
    custody_epoch: null,
    public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({
      fragment_id,
      fragment_type,
      status,
      assurance_level,
      visibility,
      updated_at,
    })),
    cred_summary: {
      trust_state: 'building',
      attestation_count: 0,
      receipt_count: 0,
      last_updated_at: observedAt,
      public_note: 'ERC-8004-style Normies identity and backing Ethereum NFT provenance imported from public source records.',
    },
    discovery_profile: {
      summary,
      tags: uniqueStrings(['normies', 'ethereum', 'erc-8004', 'agent-nft', info?.type]),
      avatar_url: imageUrl,
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: `sp_normies_agent_${agentId}`,
      supported_standard_ids: ['ERC-8004'],
      last_verified_at: observedAt,
    },
    payment_profile: {
      accepted_assets: [],
      x402_manifest_url: null,
      paid_endpoints_enabled: false,
    },
    updated_at: observedAt,
  });

  const agentCard = assertAgentCard({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    name: displayName,
    subject_type: 'agent',
    summary: truncate(summary, 500),
    boundaries: [
      'Read-only cross-chain source import. Ethereum NFT ownership does not grant Multipass management without a separate verification flow.',
    ],
    capabilities: createNormiesCapabilities(info),
    message_routes: [],
    service_endpoints: [
      {
        endpoint_id: 'normies_agent_info',
        url: agentInfoUrl,
        description: 'Public Normies agent info endpoint for this NFT-backed agent profile.',
        visibility: 'public',
      },
      {
        endpoint_id: 'normies_agent_card',
        url: agentCardUrl,
        description: 'Public Normies agent card endpoint for this NFT-backed agent profile.',
        visibility: 'public',
      },
      {
        endpoint_id: 'normies_agent_metadata',
        url: metadataUrl,
        description: 'Public Normies ERC-8004 metadata endpoint for this agent identity.',
        visibility: 'public',
      },
    ],
    x402_manifest_url: null,
    accepted_assets: [],
    trust_summary: {
      identity_status: 'verified',
      assurance_level: 'onchain_verified',
      last_updated_at: observedAt,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: 'Imported public Normies identity records are read-only until the owner completes a Multipass management claim.',
    },
    standards_refs: [{ standard_id: 'ERC-8004', support_status: 'active', record_id: identityId }],
  });

  const standardsProfile = assertStandardsProfile({
    schema_version: SCHEMA_VERSION,
    standards_profile_id: `sp_normies_agent_${agentId}`,
    multipass_id: multipassId,
    primary_refs: {
      erc8004_identity: identityId,
      backing_nft: backingNftId,
    },
    standard_refs: [
      {
        standard_id: 'ERC-8004',
        status: 'active',
        chain_id: ETHEREUM_CHAIN_ID,
        contract_address: NORMIES_AGENT_IDENTITY_CONTRACT,
        record_id: identityId,
        adapter_version: '0.1.0',
        last_verified_at: observedAt,
        assurance_level: 'onchain_verified',
      },
    ],
    compatibility_summary: {
      identity_bound: true,
      owner_verified: false,
      risk_checked: false,
      tools_verified: false,
      work_attested: false,
      trust_updated: true,
    },
    adapter_versions: { 'ERC-8004': '0.1.0' },
    last_verified_at: observedAt,
  });

  const x402Manifest = assertX402Manifest({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    endpoints: [],
  });

  return {
    source: {
      sourceType: NORMIES_SOURCE_TYPE,
      canonicalId: identityId,
      tokenId: agentId,
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: 'normies_agent_identity',
        originSource: ACTIVATION_ORIGIN_SOURCE,
        sourceType: NORMIES_SOURCE_TYPE,
        canonicalId: identityId,
        tokenId: agentId,
        savedAt: observedAt,
      },
      sourceSnapshot: {
        sourceType: NORMIES_SOURCE_TYPE,
        id: agentId,
        tokenId: normieTokenId,
        canonicalId: identityId,
        chainId: ETHEREUM_CHAIN_ID,
        contractAddress: NORMIES_AGENT_IDENTITY_CONTRACT,
        collectionAddress: backingTokenAddress,
        owner: normalizedOwner,
        name: displayName,
        displayName,
        summary,
        description: truncate(String(info?.backstory ?? info?.tagline ?? '').trim(), 1000),
        imageUrl,
        metadataUrl,
        apiUrl: agentInfoUrl,
        profileUrl: `${NORMIES_API_BASE}/normie/${encodeURIComponent(normieTokenId)}`,
        traits: sanitizeNormiesTraits(info?.traits),
        standards: { erc8004Identity: identityId, backingNft: backingNftId },
      },
    },
    profile,
    fragments: fragments.map(assertIdentityFragment),
    agentCard,
    standardsProfile,
    x402Manifest,
    receipts: [],
    change: {
      change_id: `change_normies_agent_${safeKey(agentId)}_initial_save`,
      message: 'Multipass saved from public Normies agent NFT source record.',
      created_at: observedAt,
    },
  };
}

function buildSavedRecordFromErc8004Identity({ input, onchain, metadata }, options = {}) {
  const tokenId = normalizeTokenId(input?.tokenId);
  const observedAt = normalizeObservedAt(options.observedAt);
  const canonicalId = input?.canonicalId ?? `eip155:${HELIXA_CHAIN_ID}:${ERC8004_BASE_IDENTITY_REGISTRY}:${tokenId}`;
  const owner = normalizeAddress(onchain?.owner);
  const displayName = normalizeDisplayName(metadata?.name, tokenId);
  const slug = slugifyDisplayName(displayName, tokenId);
  const multipassId = `mp_erc8004_${HELIXA_CHAIN_ID}_${tokenId}`;
  const standardsProfileId = `sp_erc8004_${HELIXA_CHAIN_ID}_${tokenId}`;
  const metadataUrl = safePublicUrl(onchain?.tokenURI) ?? null;
  const explorerUrl = `https://basescan.org/token/${ERC8004_BASE_IDENTITY_REGISTRY}?a=${encodeURIComponent(tokenId)}`;
  const serviceEndpoints = createErc8004MetadataServiceEndpoints(metadata?.services);
  const messageRoutes = createErc8004MessageRoutes(metadata?.services, owner);
  const summary = normalizeErc8004Summary(metadata, displayName);
  const fragments = createErc8004PublicFragments({
    multipassId,
    tokenId,
    canonicalId,
    displayName,
    owner,
    observedAt,
    explorerUrl,
    metadataUrl,
    serviceEndpoints,
  });

  const profile = assertMultipassProfile({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    subject_type: 'agent',
    display_name: displayName,
    slug,
    status: metadata?.active === false ? 'suspended' : 'active',
    owner_summary: {
      owner_state: 'unclaimed',
      verification_status: 'none',
      visibility: 'public',
      summary: 'Read-only ERC-8004 identity imported from public registration metadata. Management is not claimed until a separate verification flow completes.',
    },
    custody_epoch: null,
    public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({
      fragment_id,
      fragment_type,
      status,
      assurance_level,
      visibility,
      updated_at,
    })),
    cred_summary: {
      trust_state: 'building',
      attestation_count: fragments.filter((fragment) => fragment.fragment_type === 'attestation').length,
      receipt_count: 0,
      last_updated_at: observedAt,
      public_note: 'ERC-8004 identity, owner, and registration metadata imported from public source records.',
    },
    discovery_profile: {
      summary,
      tags: normalizeErc8004Tags(metadata),
      ...(safePublicUrl(metadata?.image) ? { avatar_url: safePublicUrl(metadata.image) } : {}),
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: standardsProfileId,
      supported_standard_ids: ['ERC-8004'],
      last_verified_at: observedAt,
    },
    payment_profile: {
      accepted_assets: [],
      x402_manifest_url: null,
      paid_endpoints_enabled: Boolean(metadata?.x402Support),
    },
    updated_at: observedAt,
  });

  const agentCard = assertAgentCard({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    name: displayName,
    subject_type: 'agent',
    summary: truncate(summary, 500),
    boundaries: [
      'Read-only ERC-8004 source import. Identity ownership does not grant Multipass management without a separate verification flow.',
    ],
    capabilities: createErc8004Capabilities(metadata),
    message_routes: messageRoutes,
    service_endpoints: serviceEndpoints,
    x402_manifest_url: null,
    accepted_assets: [],
    trust_summary: {
      identity_status: 'verified',
      assurance_level: 'onchain_verified',
      last_updated_at: observedAt,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: 'Imported ERC-8004 identity records are read-only until the owner completes a Multipass management claim.',
    },
    standards_refs: [{ standard_id: 'ERC-8004', support_status: 'active', record_id: canonicalId }],
  });

  const standardsProfile = assertStandardsProfile({
    schema_version: SCHEMA_VERSION,
    standards_profile_id: standardsProfileId,
    multipass_id: multipassId,
    primary_refs: { erc8004_identity: canonicalId },
    standard_refs: [
      {
        standard_id: 'ERC-8004',
        status: 'active',
        chain_id: HELIXA_CHAIN_ID,
        contract_address: ERC8004_BASE_IDENTITY_REGISTRY,
        record_id: canonicalId,
        adapter_version: '0.1.0',
        last_verified_at: observedAt,
        assurance_level: 'onchain_verified',
      },
    ],
    compatibility_summary: {
      identity_bound: true,
      owner_verified: false,
      risk_checked: false,
      tools_verified: false,
      work_attested: false,
      trust_updated: true,
    },
    adapter_versions: { 'ERC-8004': '0.1.0' },
    last_verified_at: observedAt,
  });

  const x402Manifest = assertX402Manifest({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    endpoints: [],
  });

  return {
    source: {
      sourceType: 'erc8004_identity',
      canonicalId,
      tokenId,
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: 'erc8004_identity_registry',
        originSource: ACTIVATION_ORIGIN_SOURCE,
        sourceType: 'erc8004_identity',
        canonicalId,
        tokenId,
        savedAt: observedAt,
      },
      sourceSnapshot: {
        sourceType: 'erc8004_identity',
        canonicalId,
        chainId: HELIXA_CHAIN_ID,
        contractAddress: ERC8004_BASE_IDENTITY_REGISTRY,
        tokenId,
        owner,
        ownerAddress: owner,
        name: displayName,
        displayName,
        summary,
        description: truncate(String(metadata?.description ?? '').trim(), 1000),
        imageUrl: safePublicUrl(metadata?.image) ?? undefined,
        metadataUrl,
        tokenURI: truncate(String(onchain?.tokenURI ?? '').trim(), 500),
        active: metadata?.active === undefined ? undefined : Boolean(metadata.active),
        agentType: metadata?.agentType ? truncate(String(metadata.agentType), 120) : undefined,
        tags: normalizeErc8004Tags(metadata),
        services: serviceEndpoints.map((endpoint) => ({ endpoint_id: endpoint.endpoint_id, url: endpoint.url, protocol: protocolForEndpoint(endpoint.endpoint_id) })),
        messageRoutes,
        standards: { erc8004Identity: canonicalId },
      },
    },
    profile,
    fragments: fragments.map(assertIdentityFragment),
    agentCard,
    standardsProfile,
    x402Manifest,
    receipts: [],
    change: {
      change_id: `change_erc8004_${safeKey(tokenId)}_initial_save`,
      message: 'Multipass saved from public ERC-8004 identity source record.',
      created_at: observedAt,
    },
  };
}

function createErc8004PublicFragments({ multipassId, tokenId, canonicalId, displayName, owner, observedAt, explorerUrl, metadataUrl, serviceEndpoints }) {
  const fragments = [
    createFragment({
      fragment_id: `frag_erc8004_${safeKey(tokenId)}_identity`,
      multipass_id: multipassId,
      fragment_type: 'standard_ref',
      status: 'verified',
      assurance_level: 'onchain_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'contract_read',
      source_id: canonicalId,
      issuer: 'ERC-8004 Identity Registry',
      observed_at: observedAt,
      reference_url: explorerUrl,
      public_value: `${displayName} ERC-8004 identity ${canonicalId}.`,
      proof_reference: canonicalId,
    }),
  ];

  if (owner) {
    fragments.push(createFragment({
      fragment_id: `frag_erc8004_${safeKey(tokenId)}_owner`,
      multipass_id: multipassId,
      fragment_type: 'wallet',
      status: 'verified',
      assurance_level: 'onchain_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'contract_read',
      source_id: `${canonicalId}:owner`,
      issuer: 'ERC-8004 Identity Registry',
      observed_at: observedAt,
      reference_url: explorerUrl,
      public_value: `Current onchain owner ${owner} observed for ERC-8004 identity ${canonicalId}. This does not grant Multipass management.`,
      proof_reference: owner,
    }));
  }

  if (metadataUrl) {
    fragments.push(createFragment({
      fragment_id: `frag_erc8004_${safeKey(tokenId)}_metadata`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'verified',
      assurance_level: 'issuer_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'issuer_attestation',
      source_id: `${canonicalId}:metadata`,
      issuer: 'ERC-8004 Registration Metadata',
      observed_at: observedAt,
      reference_url: metadataUrl,
      public_value: 'Public ERC-8004 registration metadata endpoint for this agent identity.',
      endpoint_ref: { endpoint_id: 'erc8004_metadata', url: metadataUrl, protocol: 'api' },
    }));
  }

  for (const endpoint of serviceEndpoints) {
    fragments.push(createFragment({
      fragment_id: `frag_erc8004_${safeKey(tokenId)}_service_${safeKey(endpoint.endpoint_id)}`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'verified',
      assurance_level: 'issuer_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'issuer_attestation',
      source_id: `${canonicalId}:${safeKey(endpoint.endpoint_id)}`,
      issuer: 'ERC-8004 Registration Metadata',
      observed_at: observedAt,
      reference_url: endpoint.url,
      public_value: endpoint.description,
      endpoint_ref: { endpoint_id: endpoint.endpoint_id, url: endpoint.url, protocol: protocolForEndpoint(endpoint.endpoint_id) },
    }));
  }

  return fragments;
}

function normalizeErc8004Summary(metadata, displayName) {
  const description = String(metadata?.description ?? '').trim();
  return truncate(description || `${displayName} imported from a public ERC-8004 identity registration.`, 1000);
}

function normalizeErc8004Tags(metadata) {
  return uniqueStrings([
    'erc-8004',
    'multipass',
    metadata?.agentType,
    ...(Array.isArray(metadata?.tags) ? metadata.tags : []),
    ...(Array.isArray(metadata?.categories) ? metadata.categories.flatMap((entry) => String(entry ?? '').split(',')) : []),
    ...(Array.isArray(metadata?.supportedTrust) ? metadata.supportedTrust : []),
  ]);
}

function createErc8004Capabilities(metadata) {
  const capabilities = [];
  for (const value of normalizeErc8004Tags(metadata).filter((entry) => !['erc-8004', 'multipass'].includes(entry)).slice(0, 6)) {
    capabilities.push({
      capability_id: `erc8004_${safeKey(value)}`,
      label: formatLabel(value),
      description: `Public ERC-8004 registration tag: ${formatLabel(value)}.`,
      visibility: 'public',
    });
  }
  return capabilities;
}

function createErc8004MetadataServiceEndpoints(services) {
  return normalizeErc8004ServiceEntries(services)
    .map((service) => {
      const url = safePublicUrl(service.endpoint);
      if (!url) return null;
      const endpointId = safeKey(service.name || protocolForServiceUrl(url) || 'service');
      return {
        endpoint_id: endpointId,
        url,
        description: `${formatLabel(service.name || endpointId)} endpoint published by ERC-8004 registration metadata.`,
        visibility: 'public',
      };
    })
    .filter(Boolean);
}

function createErc8004MessageRoutes(services, owner) {
  const routes = [];
  for (const service of normalizeErc8004ServiceEntries(services)) {
    const endpoint = String(service.endpoint ?? '').trim();
    if (!endpoint || safePublicUrl(endpoint)) continue;
    const serviceName = String(service.name ?? '').toLowerCase();
    if (serviceName.includes('email') || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(endpoint)) {
      routes.push({ route_id: `route_${safeKey(service.name || 'email')}`, channel: 'email', address: truncate(endpoint, 320), visibility: 'public' });
    } else if (normalizeAddress(endpoint)) {
      routes.push({ route_id: `route_${safeKey(service.name || 'wallet')}`, channel: 'onchain', address: normalizeAddress(endpoint), visibility: 'public' });
    }
  }
  if (owner && !routes.some((route) => route.channel === 'onchain' && addressesEqual(route.address, owner))) {
    routes.push({ route_id: 'route_erc8004_owner', channel: 'onchain', address: owner, visibility: 'public' });
  }
  return routes;
}

function normalizeErc8004ServiceEntries(services) {
  if (Array.isArray(services)) {
    return services
      .filter(isPlainObject)
      .map((service) => ({
        name: truncate(String(service.name ?? service.type ?? service.protocol ?? '').trim(), 80),
        endpoint: truncate(String(service.endpoint ?? service.url ?? service.uri ?? '').trim(), 500),
      }))
      .filter((service) => service.name || service.endpoint);
  }
  if (isPlainObject(services)) {
    return Object.entries(services).map(([name, config]) => ({
      name: truncate(String(name ?? '').trim(), 80),
      endpoint: truncate(String(config?.endpoint ?? config?.url ?? config?.profileUrl ?? (typeof config === 'string' ? config : '')).trim(), 500),
    })).filter((service) => service.name || service.endpoint);
  }
  return [];
}

function protocolForServiceUrl(url) {
  try {
    const parsed = new URL(url);
    if (/mcp/i.test(parsed.pathname)) return 'mcp';
    if (/agent-card|a2a/i.test(parsed.pathname)) return 'a2a';
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? 'web' : 'api';
  } catch {
    return null;
  }
}

async function discoverErc8004IdentitiesWithTimeout(agent, { observedAt, erc8004Discovery, timeoutMs }) {
  const normalizedTimeoutMs = normalizeDiscoveryTimeoutMs(timeoutMs ?? process.env.MULTIPASS_ERC8004_DISCOVERY_TIMEOUT_MS);
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve([]), normalizedTimeoutMs);
  });

  try {
    const discovered = await Promise.race([
      Promise.resolve().then(() => erc8004Discovery(agent, { observedAt })),
      timeout,
    ]);
    return Array.isArray(discovered) ? discovered : [];
  } catch {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function normalizeDiscoveryTimeoutMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_ERC8004_DISCOVERY_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(number), 1), 30000);
}

export async function discoverErc8004Identities(agent, options = {}) {
  const tokenId = normalizeTokenId(agent?.tokenId);
  const chainId = Number(options.chainId ?? HELIXA_CHAIN_ID);
  const registryAddress = normalizeAddress(options.registryAddress ?? process.env.MULTIPASS_ERC8004_REGISTRY_ADDRESS ?? ERC8004_BASE_IDENTITY_REGISTRY);
  if (!Number.isInteger(chainId) || chainId < 1 || !registryAddress) return [];

  const platformWallets = normalizeAddressList(options.platformWallets ?? process.env.MULTIPASS_ERC8004_PLATFORM_WALLETS);
  const holders = createErc8004CandidateHolders(agent, platformWallets);
  if (!holders.length) return [];

  const publicClient = options.publicClient ?? (options.readContract ? null : createPublicClient({
    chain: base,
    transport: createBaseRpcTransport(options.rpcUrl ?? process.env.BASE_RPC_URL),
  }));
  const identities = new Map();

  for (const holder of holders) {
    const holderTokenIds = await fetchErc8004TokenIdsForHolder(holder.address, {
      fetchImpl: options.fetchImpl ?? fetch,
      apiUrl: options.blockscoutApiUrl ?? process.env.MULTIPASS_ERC8004_BLOCKSCOUT_API ?? ERC8004_BLOCKSCOUT_API,
      registryAddress,
      fromBlock: options.fromBlock ?? 0,
      toBlock: options.toBlock ?? 'latest',
    });

    for (const identityTokenId of holderTokenIds.slice(0, options.maxTokensPerHolder ?? 250)) {
      const onchain = await readErc8004IdentityToken({
        tokenId: identityTokenId,
        registryAddress,
        readContract: options.readContract,
        publicClient,
      });
      if (!onchain?.owner || !addressesEqual(onchain.owner, holder.address)) continue;

      const metadata = await readErc8004TokenMetadata(onchain.tokenURI, { fetchImpl: options.fetchImpl ?? fetch });
      const metadataMatch = matchErc8004MetadataToHelixaAgent(metadata, onchain.tokenURI, tokenId);
      if (!metadataMatch) continue;

      const canonicalId = `eip155:${chainId}:${registryAddress}:${identityTokenId}`;
      identities.set(canonicalId, {
        chainId,
        registryAddress,
        tokenId: identityTokenId,
        owner: onchain.owner,
        custody: classifyErc8004Custody({ agent, owner: onchain.owner, platformWallets }),
        name: truncate(String(metadata?.name ?? '').trim(), 120),
        match: metadataMatch,
        tokenURI: onchain.tokenURI,
        explorerUrl: `https://basescan.org/token/${registryAddress}?a=${encodeURIComponent(identityTokenId)}`,
      });
    }
  }

  return normalizeErc8004Identities([...identities.values()]);
}

export function slugifyDisplayName(name, tokenId) {
  const suffix = String(tokenId ?? '').trim();
  const normalizedName = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+)\.0+\b/g, '$1')
    .toLowerCase();
  const words = normalizedName.match(/[a-z0-9]+/g) ?? ['agent'];
  const cleanSuffix = suffix.replace(/[^0-9a-z]+/gi, '') || 'record';
  const maxLength = 81;
  const suffixPart = `-${cleanSuffix}`;
  const baseMax = Math.max(1, maxLength - suffixPart.length);
  const base = trimSlug(words.join('-').slice(0, baseMax)) || 'agent';
  return `${base}${suffixPart}`.slice(0, maxLength).replace(/-+$/g, '') || `agent-${cleanSuffix}`;
}

export function sanitizeSourceSnapshot(agent) {
  if (!isPlainObject(agent)) return {};

  const snapshot = {};
  for (const field of PUBLIC_SOURCE_FIELDS) {
    if (!(field in agent)) continue;
    const value = agent[field];
    if (value === undefined) continue;

    if (field === 'tokenId') {
      snapshot.tokenId = String(value);
      continue;
    }

    if (field === 'socials') {
      const socials = sanitizeSocials(value);
      if (socials) snapshot.socials = socials;
      continue;
    }

    if (field === 'services') {
      const services = sanitizeServices(value);
      if (services) snapshot.services = services;
      continue;
    }

    const sanitized = sanitizePrimitive(value);
    if (sanitized !== undefined) {
      snapshot[field] = sanitized;
    }
  }
  return snapshot;
}

function createBaseRpcTransport(primaryUrl) {
  const urls = uniqueStrings([primaryUrl, ...BASE_RPC_FALLBACK_URLS]);
  return urls.length === 1 ? http(urls[0] ?? BASE_RPC_URL) : fallback(urls.map((url) => http(url)));
}

function createErc8004CandidateHolders(agent, platformWallets = []) {
  const holders = new Map();
  addErc8004CandidateHolder(holders, agent?.agentAddress, 'agent_address');
  addErc8004CandidateHolder(holders, agent?.owner, 'source_owner');
  for (const wallet of platformWallets) addErc8004CandidateHolder(holders, wallet, 'platform_wallet');
  return [...holders.values()];
}

function addErc8004CandidateHolder(holders, value, role) {
  const address = normalizeAddress(value);
  if (!address) return;
  const key = address.toLowerCase();
  const holder = holders.get(key) ?? { address, roles: [] };
  if (!holder.roles.includes(role)) holder.roles.push(role);
  holders.set(key, holder);
}

async function fetchErc8004TokenIdsForHolder(holder, { fetchImpl, apiUrl, registryAddress, fromBlock, toBlock }) {
  const url = new URL(apiUrl);
  url.searchParams.set('module', 'logs');
  url.searchParams.set('action', 'getLogs');
  url.searchParams.set('address', registryAddress);
  url.searchParams.set('fromBlock', String(fromBlock));
  url.searchParams.set('toBlock', String(toBlock));
  url.searchParams.set('topic0', ERC8004_TRANSFER_TOPIC);
  url.searchParams.set('topic2', addressToTopic(holder));
  url.searchParams.set('topic0_2_opr', 'and');

  let response;
  try {
    response = await fetchImpl(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    return [];
  }
  if (!response?.ok) return [];

  let body;
  try {
    body = typeof response.json === 'function' ? await response.json() : JSON.parse(await response.text());
  } catch {
    return [];
  }

  const logs = Array.isArray(body?.result) ? body.result : [];
  return uniqueStrings(logs.map(extractErc8004TransferTokenId).filter(Boolean));
}

async function readErc8004IdentityToken({ tokenId, registryAddress, readContract, publicClient }) {
  try {
    const contractReader = readContract ?? ((request) => publicClient.readContract(request));
    const args = [BigInt(tokenId)];
    const owner = normalizeAddress(await contractReader({ address: registryAddress, abi: ERC8004_IDENTITY_ABI, functionName: 'ownerOf', args }));
    if (!owner) return null;
    const tokenURI = String(await contractReader({ address: registryAddress, abi: ERC8004_IDENTITY_ABI, functionName: 'tokenURI', args }) ?? '');
    return { owner, tokenURI };
  } catch {
    return null;
  }
}

async function readErc8004TokenMetadata(tokenURI, { fetchImpl }) {
  if (typeof tokenURI !== 'string' || !tokenURI.trim()) return null;
  const trimmed = tokenURI.trim();
  try {
    if (trimmed.startsWith('data:')) return parseDataJsonUri(trimmed);
    const url = safePublicUrl(trimmed);
    if (!url) return null;
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response?.ok) return null;
    return typeof response.json === 'function' ? await response.json() : JSON.parse(await response.text());
  } catch {
    return null;
  }
}

function parseDataJsonUri(uri) {
  const match = uri.match(/^data:([^,]*),(.*)$/s);
  if (!match) return null;
  const meta = match[1].toLowerCase();
  const payload = match[2];
  const text = meta.includes(';base64') ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
  return JSON.parse(text);
}

function matchErc8004MetadataToHelixaAgent(metadata, tokenURI, tokenId) {
  const token = String(tokenId);
  if (metadataContainsExactTokenRef(metadata, token)) return 'metadata_registration';
  const serialized = JSON.stringify(metadata ?? {}) || String(tokenURI ?? '');
  const escaped = escapeRegExp(token);
  if (new RegExp(`(?:api\\.helixa\\.xyz/api/v2/agent|helixa\\.xyz/agent)/${escaped}(?:[^0-9]|$)`, 'i').test(serialized)) {
    return 'metadata_url';
  }
  if (new RegExp(`(?:^|[^0-9])8453:${escaped}(?:[^0-9]|$)`).test(serialized)) {
    return 'metadata_registration';
  }
  return null;
}

function metadataContainsExactTokenRef(value, tokenId) {
  if (Array.isArray(value)) return value.some((entry) => metadataContainsExactTokenRef(entry, tokenId));
  if (!isPlainObject(value)) return false;

  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['tokenid', 'agentid', 'agentdnatokenid', 'helixatokenid'].includes(normalizedKey) && String(fieldValue) === tokenId) {
      return true;
    }
    if (normalizedKey === 'agentid' && String(fieldValue) === `${HELIXA_CHAIN_ID}:${tokenId}`) {
      return true;
    }
    if (metadataContainsExactTokenRef(fieldValue, tokenId)) return true;
  }
  return false;
}

function classifyErc8004Custody({ agent, owner, platformWallets }) {
  if (addressesEqual(owner, agent?.agentAddress)) return 'agent_owned';
  if (addressesEqual(owner, agent?.owner) && isAgentOwnedHelixaRecord(agent)) return 'agent_owned';
  if (platformWallets.some((wallet) => addressesEqual(owner, wallet))) return 'platform_held_mirror';
  if (addressesEqual(owner, agent?.owner)) return 'owner_owned';
  return 'candidate_match';
}

function isAgentOwnedHelixaRecord(agent) {
  const mintOrigin = String(agent?.mintOrigin ?? '').toUpperCase();
  const principalType = String(agent?.metadata?.principalType ?? agent?.metadata?.entityType ?? '').toLowerCase();
  return mintOrigin === 'AGENT_SIWA' || principalType === 'agent';
}

function normalizeAddressList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  return uniqueStrings(raw.map(normalizeAddress).filter(Boolean));
}

function addressToTopic(address) {
  return `0x${normalizeAddress(address).slice(2).toLowerCase().padStart(64, '0')}`;
}

function extractErc8004TransferTokenId(log) {
  const topic = log?.topics?.[3] ?? log?.topic3;
  if (typeof topic !== 'string' || !/^0x[a-fA-F0-9]+$/.test(topic)) return null;
  try {
    return BigInt(topic).toString();
  } catch {
    return null;
  }
}

function addressesEqual(left, right) {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft.toLowerCase() === normalizedRight.toLowerCase());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeErc8004Identities(value) {
  if (!Array.isArray(value)) return [];
  const identities = [];
  const seen = new Set();

  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const chainId = Number(item.chainId ?? HELIXA_CHAIN_ID);
    const tokenId = String(item.tokenId ?? '').trim();
    const registryAddress = normalizeAddress(item.registryAddress ?? ERC8004_BASE_IDENTITY_REGISTRY);
    if (!Number.isInteger(chainId) || chainId < 1 || !isPositiveTokenId(tokenId) || !registryAddress) continue;

    const canonicalId = `eip155:${chainId}:${registryAddress}:${tokenId}`;
    if (seen.has(canonicalId)) continue;
    seen.add(canonicalId);

    identities.push({
      chainId,
      tokenId,
      registryAddress,
      canonicalId,
      owner: normalizeAddress(item.owner),
      custody: normalizeErc8004Custody(item.custody),
      name: truncate(String(item.name ?? '').trim(), 120),
      match: truncate(String(item.match ?? '').trim(), 120),
      tokenURI: truncate(String(item.tokenURI ?? '').trim(), 500),
      explorerUrl: safePublicUrl(item.explorerUrl) ?? `https://basescan.org/token/${registryAddress}?a=${encodeURIComponent(tokenId)}`,
    });
  }

  return identities.sort((left, right) => erc8004CustodyRank(left.custody) - erc8004CustodyRank(right.custody));
}

function selectPrimaryErc8004Identity(identities) {
  return identities.find((identity) => identity.custody !== 'candidate_match') ?? identities[0] ?? null;
}

function publicErc8004IdentitySnapshot(identity) {
  return {
    chainId: identity.chainId,
    registryAddress: identity.registryAddress,
    tokenId: identity.tokenId,
    canonicalId: identity.canonicalId,
    owner: identity.owner,
    custody: identity.custody,
    name: identity.name,
    match: identity.match,
  };
}

function normalizeErc8004Custody(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['agent_owned', 'owner_owned', 'platform_held_mirror', 'candidate_match'].includes(normalized)) return normalized;
  return 'candidate_match';
}

function erc8004CustodyRank(custody) {
  return { agent_owned: 0, owner_owned: 1, platform_held_mirror: 2, candidate_match: 3 }[custody] ?? 4;
}

function formatErc8004Custody(custody) {
  return {
    agent_owned: 'Agent-owned ERC-8004 identity',
    owner_owned: 'Owner-owned ERC-8004 identity',
    platform_held_mirror: 'Platform-held ERC-8004 mirror',
    candidate_match: 'Candidate ERC-8004 identity match',
  }[custody] ?? 'Candidate ERC-8004 identity match';
}

function normalizeAddress(value) {
  const candidate = String(value ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) return null;
  return candidate;
}


function normiesAgentIdentityId(agentId) {
  return `eip155:${ETHEREUM_CHAIN_ID}:${NORMIES_AGENT_IDENTITY_CONTRACT}:${agentId}`;
}

function normiesBackingNftId(tokenId) {
  return `eip155:${ETHEREUM_CHAIN_ID}:${NORMIES_ART_CONTRACT}:${tokenId}`;
}

function createNormiesSummary({ info, displayName, normieTokenId }) {
  const tagline = String(info?.tagline ?? '').trim();
  const type = String(info?.type ?? '').trim();
  const level = info?.canvas?.level === undefined ? null : Number(info.canvas.level);
  const levelText = Number.isFinite(level) ? ` Level ${level}.` : '';
  const descriptor = tagline || (type ? `${type} agent` : 'agent');
  return truncate(`${displayName} is an Ethereum Normies NFT-backed agent profile for Normie #${normieTokenId}. ${descriptor}.${levelText} This Multipass import shows public ERC-8004 identity and NFT provenance only; it does not claim Base AgentDNA mint authority or management rights.`, 1000);
}

function createNormiesCapabilities(info) {
  const capabilities = [];
  const communicationStyle = String(info?.communicationStyle ?? '').trim();
  if (communicationStyle) {
    capabilities.push({
      capability_id: 'normies_persona',
      label: 'Normies persona profile',
      description: truncate(`Public persona profile with communication style: ${communicationStyle}`, 500),
      visibility: 'public',
    });
  }
  if (Array.isArray(info?.personalityTraits) && info.personalityTraits.length) {
    capabilities.push({
      capability_id: 'normies_traits',
      label: 'Public personality traits',
      description: truncate(info.personalityTraits.slice(0, 3).join('; '), 500),
      visibility: 'public',
    });
  }
  return capabilities;
}

function createNormiesPublicFragments({ multipassId, normieTokenId, agentId, displayName, observedAt, identityId, backingNftId, owner, agentInfoUrl, metadataUrl }) {
  const identityExplorerUrl = `https://etherscan.io/token/${NORMIES_AGENT_IDENTITY_CONTRACT}?a=${encodeURIComponent(agentId)}`;
  const backingExplorerUrl = `https://etherscan.io/token/${NORMIES_ART_CONTRACT}?a=${encodeURIComponent(normieTokenId)}`;
  const fragments = [
    createFragment({
      fragment_id: `frag_normies_agent_${safeKey(agentId)}_erc8004`,
      multipass_id: multipassId,
      fragment_type: 'standard_ref',
      status: 'verified',
      assurance_level: 'onchain_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'contract_read',
      source_id: identityId,
      issuer: 'Normies ERC-8004 Agent Registry',
      observed_at: observedAt,
      reference_url: identityExplorerUrl,
      public_value: `Normies ERC-8004 agent identity ${identityId} for ${displayName}.`,
      proof_reference: identityId,
    }),
    createFragment({
      fragment_id: `frag_normies_agent_${safeKey(agentId)}_backing_nft`,
      multipass_id: multipassId,
      fragment_type: 'collection',
      status: 'verified',
      assurance_level: 'onchain_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'contract_read',
      source_id: backingNftId,
      issuer: 'Normies',
      observed_at: observedAt,
      reference_url: backingExplorerUrl,
      public_value: `Agent identity is backed by underlying Ethereum Normies NFT #${normieTokenId} (${backingNftId}).`,
      proof_reference: backingNftId,
    }),
    createFragment({
      fragment_id: `frag_normies_agent_${safeKey(agentId)}_metadata`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'verified',
      assurance_level: 'platform_verified',
      transfer_policy: 'pause_on_transfer',
      source_type: 'platform_check',
      source_id: `${identityId}:metadata`,
      issuer: 'Normies',
      observed_at: observedAt,
      reference_url: metadataUrl,
      public_value: 'Public Normies ERC-8004 metadata endpoint for this agent identity.',
      endpoint_ref: { endpoint_id: 'normies_agent_metadata', url: metadataUrl, protocol: 'api' },
    }),
  ];

  if (owner) {
    fragments.push(createFragment({
      fragment_id: `frag_normies_agent_${safeKey(agentId)}_custody`,
      multipass_id: multipassId,
      fragment_type: 'custody_record',
      status: 'verified',
      assurance_level: 'onchain_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'contract_read',
      source_id: `${backingNftId}:owner`,
      issuer: 'Normies',
      observed_at: observedAt,
      reference_url: agentInfoUrl,
      public_value: `Current Ethereum owner ${owner} observed for Normies NFT #${normieTokenId}. This does not grant Multipass management.`,
      proof_reference: owner,
    }));
  }

  return fragments;
}

function sanitizeNormiesTraits(value) {
  if (!isPlainObject(value)) return undefined;
  const attributes = isPlainObject(value.attributes) ? value.attributes : value;
  const sanitized = {};
  for (const [key, entry] of Object.entries(attributes)) {
    const safeName = truncate(String(key ?? '').trim(), 80);
    const safeValue = sanitizePublicPrimitive(entry);
    if (!safeName || safeValue === undefined || !String(safeValue).trim()) continue;
    sanitized[safeName] = typeof safeValue === 'string' ? truncate(safeValue, 200) : safeValue;
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function createPublicFragments({ tokenId, canonicalId, multipassId, displayName, observedAt, sourceSnapshot, sourceUrl, erc8004Identities = [] }) {
  const sourceVerified = sourceSnapshot.verified === true;
  const fragments = [createFragment({
    fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_source`,
    multipass_id: multipassId,
    fragment_type: 'attestation',
    status: sourceVerified ? 'verified' : 'pending',
    assurance_level: sourceVerified ? 'platform_verified' : 'unverified',
    transfer_policy: 'historical_on_transfer',
    source_type: 'registry_import',
    source_id: canonicalId,
    issuer: 'Helixa',
    observed_at: observedAt,
    reference_url: sourceUrl,
    public_value: `${displayName} was saved from public Helixa AgentDNA token #${tokenId}.`,
  })];

  if (sourceSnapshot.owner) {
    fragments.push(createFragment({
      fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_owner_wallet`,
      multipass_id: multipassId,
      fragment_type: 'wallet',
      status: 'pending',
      assurance_level: 'self_attested',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'registry_import',
      source_id: canonicalId,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: sourceUrl,
      public_value: `Public source owner ${sourceSnapshot.owner} observed on the live Helixa record. This does not grant Multipass management.`,
    }));
  }

  if (sourceSnapshot.credScore !== undefined) {
    fragments.push(createFragment({
      fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_cred`,
      multipass_id: multipassId,
      fragment_type: 'risk_summary',
      status: 'pending',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'platform_check',
      source_id: canonicalId,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: sourceUrl,
      public_value: `Public Cred score ${sourceSnapshot.credScore} observed from the live Helixa source record.`,
    }));
  }

  for (const identity of erc8004Identities) {
    fragments.push(createErc8004IdentityFragment({ tokenId, multipassId, observedAt, identity }));
  }

  for (const [network, handle] of Object.entries(sourceSnapshot.socials ?? {})) {
    if (!handle) continue;
    fragments.push(createFragment({
      fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_social_${safeKey(network)}`,
      multipass_id: multipassId,
      fragment_type: 'social',
      status: 'pending',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'platform_check',
      source_id: `${canonicalId}:${safeKey(network)}`,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: sourceUrl,
      public_value: `${formatLabel(network)} handle ${String(handle)} observed from the live Helixa source record.`,
    }));
  }

  for (const endpoint of createServiceEndpoints(sourceSnapshot.services)) {
    fragments.push(createFragment({
      fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_service_${safeKey(endpoint.endpoint_id)}`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'pending',
      assurance_level: 'self_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'platform_check',
      source_id: `${canonicalId}:${safeKey(endpoint.endpoint_id)}`,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: sourceUrl,
      public_value: `${endpoint.description}`,
      endpoint_ref: { endpoint_id: endpoint.endpoint_id, url: endpoint.url, protocol: protocolForEndpoint(endpoint.endpoint_id) },
    }));
  }

  return fragments;
}

function createErc8004IdentityFragment({ tokenId, multipassId, observedAt, identity }) {
  const custodyLabel = formatErc8004Custody(identity.custody);
  return createFragment({
    fragment_id: `frag_helixa_agent_${safeKey(tokenId)}_erc8004_${safeKey(identity.chainId)}_${safeKey(identity.tokenId)}`,
    multipass_id: multipassId,
    fragment_type: 'standard_ref',
    status: identity.custody === 'candidate_match' ? 'pending' : 'verified',
    assurance_level: identity.custody === 'candidate_match' ? 'issuer_attested' : 'onchain_verified',
    transfer_policy: identity.custody === 'platform_held_mirror' ? 'pause_on_transfer' : 'reverify_on_transfer',
    source_type: 'contract_read',
    source_id: identity.canonicalId,
    issuer: 'ERC-8004 Identity Registry',
    observed_at: observedAt,
    reference_url: identity.explorerUrl,
    public_value: `${custodyLabel} ${identity.canonicalId}${identity.name ? ` (${identity.name})` : ''}.`,
    proof_reference: identity.canonicalId,
  });
}

function createFragment({ fragment_id, multipass_id, fragment_type, status, assurance_level, transfer_policy, source_type, source_id, issuer, observed_at, reference_url, public_value, proof_reference, endpoint_ref }) {
  return {
    schema_version: SCHEMA_VERSION,
    fragment_id,
    multipass_id,
    fragment_type,
    status,
    assurance_level,
    visibility: 'public',
    transfer_policy,
    source: { source_type, source_id, issuer, observed_at, reference_url },
    public_value,
    proof_reference: proof_reference ?? reference_url,
    created_at: observed_at,
    updated_at: observed_at,
    ...(status === 'verified' ? { verified_at: observed_at } : {}),
    ...(endpoint_ref ? { endpoint_ref } : {}),
  };
}

function createServiceEndpoints(services) {
  if (!isPlainObject(services)) return [];
  return Object.entries(services)
    .map(([service, config]) => {
      if (isSensitiveField(service)) return null;
      const endpointId = safeKey(service);
      const url = safePublicUrl(config?.url ?? config?.profileUrl ?? (typeof config === 'string' ? config : null));
      if (!url) return null;
      return {
        endpoint_id: endpointId,
        url,
        description: `${formatLabel(service)} endpoint published by the public Helixa source record.`,
        visibility: 'public',
      };
    })
    .filter(Boolean);
}

function sanitizeSocials(socials) {
  if (!isPlainObject(socials)) return undefined;
  const sanitized = {};
  for (const [network, value] of Object.entries(socials)) {
    if (isSensitiveField(network)) continue;
    const clean = sanitizePublicPrimitive(value);
    if (clean !== undefined && String(clean).trim()) {
      sanitized[network] = clean;
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizeServices(services) {
  if (!isPlainObject(services)) return undefined;
  const sanitized = {};
  for (const [service, config] of Object.entries(services)) {
    if (isSensitiveField(service)) continue;
    const clean = sanitizeServiceConfig(config);
    if (clean && Object.keys(clean).length) {
      sanitized[service] = clean;
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizeServiceConfig(config) {
  if (typeof config === 'string') {
    if (isSensitiveValue(config)) return null;
    const url = safePublicUrl(config);
    return url ? { url } : { handle: truncate(config.trim(), 200) };
  }

  if (!isPlainObject(config)) return null;
  const sanitized = {};
  for (const [field, value] of Object.entries(config)) {
    if (!SERVICE_PUBLIC_FIELDS.has(field) || isSensitiveField(field)) continue;
    if (field === 'url' || field === 'profileUrl') {
      const url = safePublicUrl(value);
      if (url) sanitized[field] = url;
      continue;
    }
    const clean = sanitizePublicPrimitive(value);
    if (clean !== undefined && String(clean).trim()) {
      sanitized[field] = typeof clean === 'string' ? truncate(clean, 500) : clean;
    }
  }
  return sanitized;
}

function safePublicUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    for (const key of url.searchParams.keys()) {
      if (isSensitiveField(key)) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizePrimitive(value) {
  if (value === null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

function sanitizePublicPrimitive(value) {
  const clean = sanitizePrimitive(value);
  if (typeof clean === 'string' && isSensitiveValue(clean)) return undefined;
  return clean;
}

function isSensitiveValue(value) {
  const normalized = String(value ?? '').toLowerCase();
  return /(^|\s)(bearer|basic)\s+[a-z0-9._~+\-/]+=*/i.test(normalized)
    || /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|password|credential)\s*[:=]/i.test(normalized)
    || /^sk-[a-z0-9_-]{12,}$/i.test(normalized);
}

function normalizeTokenId(value) {
  const tokenId = String(value ?? '').trim();
  if (!isPositiveTokenId(tokenId)) {
    throw new TypeError('Helixa agent record requires a positive tokenId.');
  }
  return tokenId;
}

function normalizeDisplayName(name, tokenId) {
  const value = String(name ?? '').trim() || `Agent #${tokenId}`;
  return truncate(value.replace(/\s+/g, ' '), 120);
}

function normalizeObservedAt(value) {
  const candidate = value ? new Date(value) : new Date();
  if (Number.isNaN(candidate.getTime())) {
    throw new TypeError('observedAt must be a valid date-time value.');
  }
  return candidate.toISOString();
}

function isPositiveTokenId(value) {
  return /^[1-9]\d*$/.test(value);
}

function isSensitiveField(field) {
  const normalized = String(field).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'tokenid') return false;
  return normalized.includes('privatekey')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('bearer')
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('sessiontoken')
    || normalized.includes('authtoken')
    || normalized.includes('apikey')
    || normalized === 'auth'
    || normalized === 'authorization';
}

function protocolForEndpoint(endpointId) {
  const normalized = String(endpointId).toLowerCase();
  if (['web', 'api', 'mcp', 'a2a', 'x402'].includes(normalized)) return normalized;
  return 'api';
}

function safeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function formatLabel(value) {
  const raw = String(value ?? 'service');
  const known = { a2a: 'A2A', api: 'API', mcp: 'MCP', web: 'Web', x: 'X', github: 'GitHub' };
  const normalized = raw.toLowerCase();
  return known[normalized] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
}

function truncate(value, maxLength) {
  return String(value).slice(0, maxLength);
}

function trimSlug(value) {
  return String(value).replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

import { deriveMarketplacePresenceFromFragments } from './marketplace-presence.js';

const HELIXA_CHAIN_ID = 8453;
export const HELIXA_SOURCE_TYPE = 'helixa_agent';
export const ERC8004_SOURCE_TYPE = 'erc8004_identity';
export const ERC8004_BASE_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const HYDRATED_PROFILE_MODES = new Set(['activated', 'saved', 'activation_preview']);

export function normalizeMultipassSourceInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new TypeError('Provide a source identity to resolve.');

  const explicit = raw.match(/^helixa-agentdna:(\d+):(\d+)$/);
  const legacy = raw.match(/^(\d+):(\d+)$/);
  const tokenOnly = raw.match(/^\d+$/);
  const ercShort = raw.match(/^erc8004:(\d+):(\d+)$/i);
  const ercFull = raw.match(/^erc8004:eip155:(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/i);
  const eip155 = raw.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/i);

  if (ercShort) return createErc8004SourceIdentity(Number(ercShort[1]), ERC8004_BASE_IDENTITY_REGISTRY, ercShort[2]);
  if (ercFull) return createErc8004SourceIdentity(Number(ercFull[1]), ercFull[2], ercFull[3]);
  if (eip155) return createErc8004SourceIdentity(Number(eip155[1]), eip155[2], eip155[3]);
  if (/^erc8004:/i.test(raw)) {
    throw new TypeError('Use an ERC-8004 source like erc8004:8453:<tokenId> or eip155:8453:<registry>:<tokenId>.');
  }

  let chainId;
  let tokenId;
  if (explicit) {
    chainId = Number(explicit[1]);
    tokenId = normalizeHelixaTokenId(explicit[2]);
  } else if (legacy) {
    chainId = Number(legacy[1]);
    tokenId = normalizeHelixaTokenId(legacy[2]);
  } else if (tokenOnly) {
    chainId = HELIXA_CHAIN_ID;
    tokenId = normalizeHelixaTokenId(raw);
  } else if (/^(agent-nft|agent-aura):/i.test(raw)) {
    throw new TypeError('Use a Helixa AgentDNA token ID or a Base ERC-8004 identity source for this implementation slice.');
  } else {
    throw new TypeError('Use a Helixa AgentDNA token ID, 8453:<tokenId>, helixa-agentdna:8453:<tokenId>, or eip155:8453:<registry>:<tokenId>.');
  }

  if (chainId !== HELIXA_CHAIN_ID) throw new TypeError('This slice supports Base Helixa AgentDNA records only. Use chain 8453.');

  return {
    kind: 'helixa_agentdna',
    sourceType: HELIXA_SOURCE_TYPE,
    canonicalId: `helixa-agentdna:${HELIXA_CHAIN_ID}:${tokenId}`,
    legacyCanonicalId: `${HELIXA_CHAIN_ID}:${tokenId}`,
    chainId: HELIXA_CHAIN_ID,
    tokenId,
  };
}

export function buildHydratedProfileResponse({ mode, profile, sourceStore, sourceIdentity, baseUrl, activation = {} }) {
  if (!profile) throw new TypeError('Hydrated profile response requires profile.');
  if (!sourceStore) throw new TypeError('Hydrated profile response requires sourceStore.');
  if (!sourceIdentity) throw new TypeError('Hydrated profile response requires sourceIdentity.');
  if (!HYDRATED_PROFILE_MODES.has(mode)) throw new TypeError('Hydrated profile response mode must be one of activated, saved, activation_preview.');

  const multipassId = profile.multipass_id;
  const source = sourceIdentity;
  const schemaVersion = profile.schema_version ?? '0.1.0';
  const publicFragments = sourceStore.getPublicFragments?.(multipassId) ?? [];
  const derivedMarketplacePresence = deriveMarketplacePresenceFromFragments(publicFragments);
  const fallbackMarketplacePresence = Array.isArray(profile?.marketplacePresence) ? profile.marketplacePresence : [];
  const marketplacePresence = derivedMarketplacePresence.length ? derivedMarketplacePresence : fallbackMarketplacePresence;
  const hasMarketplaceFragments = publicFragments.some((fragment) => fragment?.marketplace_ref);
  const responseProfile = marketplacePresence.length || hasMarketplaceFragments
    ? { ...profile, marketplacePresence }
    : profile;
  const tools = sourceStore.getTools?.(multipassId) ?? {
    schema_version: schemaVersion,
    multipass_id: multipassId,
    summary: { total: 0 },
    tools: [],
  };
  const agentCard = sourceStore.getAgentCard?.(multipassId, { baseUrl }) ?? null;
  const standards = sourceStore.getStandardsProfile?.(multipassId) ?? null;
  const x401 = sourceStore.getX401Manifest?.(multipassId) ?? null;
  const x402 = sourceStore.getX402Manifest?.(multipassId) ?? null;
  const receipts = sourceStore.getReceiptFragments?.(multipassId) ?? [];
  const changes = sourceStore.getChangeLog?.(multipassId) ?? {
    schema_version: schemaVersion,
    multipass_id: multipassId,
    entries: [],
  };
  const ownerState = String(profile.owner_summary?.owner_state ?? '').toLowerCase();

  return {
    schema_version: schemaVersion,
    mode,
    state: mode === 'activated' || mode === 'saved' ? 'saved_record' : 'activated_unsaved',
    source_identity: pruneUndefined({
      kind: source.kind,
      canonical_id: source.canonicalId,
      legacy_canonical_id: source.legacyCanonicalId,
      chain_id: source.chainId,
      token_id: source.tokenId,
      contract_address: source.contractAddress,
      verification_state: mode === 'activation_preview' ? 'imported_unverified' : 'source_verified',
    }),
    profile: responseProfile,
    ...(marketplacePresence.length || hasMarketplaceFragments ? { marketplacePresence } : {}),
    fragments: { schema_version: schemaVersion, multipass_id: multipassId, fragments: publicFragments },
    agent_card: agentCard,
    card: agentCard,
    standards,
    x401,
    x402,
    receipts: { schema_version: schemaVersion, multipass_id: multipassId, receipts },
    tools,
    changes,
    activation: {
      state: activation.state ?? (mode === 'activation_preview' ? 'not_activated' : mode === 'saved' ? 'saved_record' : 'activated'),
      manager_state: activation.manager_state ?? (ownerState === 'claimed' ? 'owner_verified' : 'none'),
      claim_url: mode === 'activation_preview' ? null : `/multipass/${encodeURIComponent(profile.slug)}`,
    },
    routes: mode === 'activation_preview'
      ? createActivationPreviewRoutes(baseUrl, source)
      : createHydratedRoutes(baseUrl, profile.slug),
    routes_meta: {
      public_profile: mode === 'activation_preview' ? `/multipass/?agent=${encodeURIComponent(getActivationShareInput(source))}` : `/multipass/${encodeURIComponent(profile.slug)}`,
      activate: `/multipass/?agent=${encodeURIComponent(getActivationShareInput(source))}`,
    },
  };
}

function createErc8004SourceIdentity(chainId, registryAddress, tokenIdValue) {
  const tokenId = normalizeErc8004TokenId(tokenIdValue);
  if (chainId !== HELIXA_CHAIN_ID) throw new TypeError('This slice supports Base ERC-8004 identities only. Use chain 8453.');
  const registry = normalizeAddress(registryAddress);
  if (!registry || !addressesEqual(registry, ERC8004_BASE_IDENTITY_REGISTRY)) {
    throw new TypeError('This slice supports the Base ERC-8004 Identity Registry only.');
  }

  return {
    kind: 'erc8004_identity',
    sourceType: ERC8004_SOURCE_TYPE,
    canonicalId: `eip155:${HELIXA_CHAIN_ID}:${ERC8004_BASE_IDENTITY_REGISTRY}:${tokenId}`,
    legacyCanonicalId: `erc8004:${HELIXA_CHAIN_ID}:${tokenId}`,
    chainId: HELIXA_CHAIN_ID,
    tokenId,
    contractAddress: ERC8004_BASE_IDENTITY_REGISTRY,
  };
}

function normalizeErc8004TokenId(tokenId) {
  const raw = String(tokenId);
  if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) throw new TypeError('Use a positive ERC-8004 identity token ID.');
  return raw.replace(/^0+/, '');
}

function getActivationShareInput(source) {
  return source.sourceType === ERC8004_SOURCE_TYPE ? source.canonicalId : source.tokenId;
}

function normalizeAddress(value) {
  const raw = String(value ?? '').trim();
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw : null;
}

function addressesEqual(left, right) {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft.toLowerCase() === normalizedRight.toLowerCase());
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizeHelixaTokenId(tokenId) {
  const raw = String(tokenId);
  if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) throw new TypeError('Use a positive Helixa AgentDNA token ID.');
  return raw.replace(/^0+/, '');
}

function createHydratedRoutes(baseUrl, identifier) {
  const root = stripTrailingSlash(baseUrl ?? '');
  const encoded = encodeURIComponent(identifier);
  return {
    profile: `${root}/api/multipass/${encoded}`,
    versioned_profile: `${root}/api/v0/multipass/${encoded}`,
    card: `${root}/api/multipass/${encoded}/card`,
    agent_card: `${root}/api/multipass/${encoded}/agent-card`,
    fragments: `${root}/api/multipass/${encoded}/fragments`,
    tools: `${root}/api/multipass/${encoded}/tools`,
    standards: `${root}/api/multipass/${encoded}/standards`,
    x401: `${root}/api/multipass/${encoded}/x401`,
    x402: `${root}/api/multipass/${encoded}/x402`,
    receipts: `${root}/api/multipass/${encoded}/receipts`,
    changes: `${root}/api/multipass/${encoded}/changes`,
  };
}

function createActivationPreviewRoutes(baseUrl, source) {
  const root = stripTrailingSlash(baseUrl ?? '');
  return {
    resolve: `${root}/api/multipass/resolve?source=${encodeURIComponent(source.canonicalId)}`,
    save: `${root}/api/multipass`,
  };
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

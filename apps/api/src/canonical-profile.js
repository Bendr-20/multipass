const HELIXA_CHAIN_ID = 8453;
const HELIXA_SOURCE_TYPE = 'helixa_agent';

export function normalizeMultipassSourceInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new TypeError('Provide a source identity to resolve.');

  const explicit = raw.match(/^helixa-agentdna:(\d+):(\d+)$/);
  const legacy = raw.match(/^(\d+):(\d+)$/);
  const tokenOnly = raw.match(/^\d+$/);

  let chainId;
  let tokenId;
  if (explicit) {
    chainId = Number(explicit[1]);
    tokenId = explicit[2];
  } else if (legacy) {
    chainId = Number(legacy[1]);
    tokenId = legacy[2];
  } else if (tokenOnly) {
    chainId = HELIXA_CHAIN_ID;
    tokenId = raw;
  } else if (/^(erc8004|agent-nft|agent-aura):/.test(raw)) {
    throw new TypeError('That source identity type is not supported in this implementation slice.');
  } else {
    throw new TypeError('Use a Helixa AgentDNA token ID, 8453:<tokenId>, or helixa-agentdna:8453:<tokenId>.');
  }

  if (chainId !== HELIXA_CHAIN_ID) throw new TypeError('This slice supports Base Helixa AgentDNA records only. Use chain 8453.');
  if (!/^\d+$/.test(tokenId) || tokenId === '0') throw new TypeError('Use a positive Helixa AgentDNA token ID.');

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

  const multipassId = profile.multipass_id;
  const source = sourceIdentity;
  const schemaVersion = profile.schema_version ?? '0.1.0';
  const publicFragments = sourceStore.getPublicFragments?.(multipassId) ?? [];
  const tools = sourceStore.getTools?.(multipassId) ?? {
    schema_version: schemaVersion,
    multipass_id: multipassId,
    summary: { total: 0 },
    tools: [],
  };
  const agentCard = sourceStore.getAgentCard?.(multipassId, { baseUrl }) ?? null;
  const standards = sourceStore.getStandardsProfile?.(multipassId) ?? null;
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
    source_identity: {
      kind: source.kind,
      canonical_id: source.canonicalId,
      legacy_canonical_id: source.legacyCanonicalId,
      chain_id: source.chainId,
      token_id: source.tokenId,
      verification_state: mode === 'activation_preview' ? 'imported_unverified' : 'source_verified',
    },
    profile,
    fragments: { schema_version: schemaVersion, multipass_id: multipassId, fragments: publicFragments },
    agent_card: agentCard,
    card: agentCard,
    standards,
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
      public_profile: mode === 'activation_preview' ? `/multipass/?agent=${encodeURIComponent(source.tokenId)}` : `/multipass/${encodeURIComponent(profile.slug)}`,
      activate: `/multipass/?agent=${encodeURIComponent(source.tokenId)}`,
    },
  };
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

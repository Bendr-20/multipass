const HELIXA_CHAIN_ID = 8453;
const HELIXA_AGENT_API_BASE = 'https://api.helixa.xyz/api/v2/agent';

export class HelixaResolverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HelixaResolverError';
    this.code = code;
    this.details = details;
  }
}

export function parseHelixaResolverInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new HelixaResolverError('empty_input', 'Enter a Helixa token ID or Helixa ID.');
  }

  if (/^\d+$/.test(raw)) {
    if (!isPositiveTokenId(raw)) {
      throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
    }
    return { chainId: HELIXA_CHAIN_ID, tokenId: raw, canonicalId: `${HELIXA_CHAIN_ID}:${raw}` };
  }

  const canonical = raw.match(/^(\d+):(\d+)$/);
  if (!canonical) {
    throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
  }

  const chainId = Number(canonical[1]);
  if (chainId !== HELIXA_CHAIN_ID) {
    throw new HelixaResolverError('unsupported_chain', 'V0 supports Base Helixa AgentDNA records only.', { chainId });
  }

  const tokenId = canonical[2];
  if (!isPositiveTokenId(tokenId)) {
    throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
  }

  return { chainId, tokenId, canonicalId: `${HELIXA_CHAIN_ID}:${tokenId}` };
}

export async function fetchHelixaAgent(tokenId, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new HelixaResolverError('network_error', 'Could not reach the Helixa API. Static demo is still available.', { cause: error.message });
  }

  if (!response.ok) {
    if (response.status === 404) throw new HelixaResolverError('not_found', 'No Helixa agent found for that ID.');
    if (response.status === 429) {
      throw new HelixaResolverError('rate_limited', 'Helixa API is rate-limiting requests. Try again shortly.', {
        retryAfter: response.headers?.get?.('Retry-After') ?? null,
      });
    }
    throw new HelixaResolverError('http_error', `GET Helixa agent failed with ${response.status}`, { status: response.status });
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HelixaResolverError('invalid_json', 'Helixa returned a response this prototype cannot read yet.', { cause: error.message });
  }
}

export function mapHelixaAgentToMultipassDemo(agent) {
  const tokenId = String(agent?.tokenId ?? '').trim() || 'unknown';
  const displayName = agent?.name || `Agent #${tokenId}`;
  const multipassId = `mp_helixa_agent_${tokenId}`;
  const profileUrl = agent?.services?.web?.url ?? `https://helixa.xyz/agent/${encodeURIComponent(tokenId)}`;
  const observedAt = agent?.mintedAt ?? new Date().toISOString();
  const fragments = createLiveFragments(agent, tokenId, multipassId, observedAt);
  const credTier = formatCredTier(agent?.credScore);
  const acceptedPayments = normalizeAcceptedPayments(agent);
  const standards = extractStandards(agent);

  const agentCard = {
    name: displayName,
    tokenId,
    helixaId: `${HELIXA_CHAIN_ID}:${tokenId}`,
    framework: agent?.framework ?? agent?.metadata?.framework ?? 'unknown',
    credScore: hasNumericCred(agent?.credScore) ? Number(agent.credScore) : null,
    credTier,
    verified: Boolean(agent?.verified),
    profileUrl,
    proofFragmentIds: fragments.map((fragment) => fragment.fragment_id),
    ownerSnapshot: createLiveOwnerSnapshot(agent),
    changeReviewLedger: createLiveChangeLedger(agent),
    transferPreview: createLiveTransferPreview(agent),
  };

  return {
    modeLabel: 'Live Resolver',
    sourceLabel: 'live Helixa API',
    heroNote: `Read-only live Helixa API data for ${displayName}.`,
    profile: {
      schema_version: '0.1.0',
      multipass_id: multipassId,
      subject_type: 'agent',
      display_name: displayName,
      slug: `helixa-agent-${tokenId}`,
      status: 'live_resolved',
      owner_summary: {
        owner_state: agent?.owner ? 'observed' : 'not_published',
        verification_status: agent?.verified ? 'verified' : 'unverified',
        visibility: 'public',
        summary: 'Public owner state observed from the live Helixa API.',
      },
      custody_epoch: null,
      public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at })),
      cred_summary: {
        trust_state: hasNumericCred(agent?.credScore) ? 'established' : 'pending',
        attestation_count: fragments.filter((fragment) => fragment.fragment_type === 'attestation').length,
        receipt_count: 0,
        last_updated_at: observedAt,
        public_note: hasNumericCred(agent?.credScore)
          ? `Cred score ${agent.credScore} imported from Helixa API. Cred is an evidence signal, not a payment outcome.`
          : 'No live Cred score published by the Helixa API.',
      },
      discovery_profile: {
        summary: `${displayName} resolved from the live Helixa API as AgentDNA token #${tokenId}.`,
        tags: compact(['helixa', 'multipass', agent?.framework]),
        avatar_url: null,
        visibility: 'public',
      },
      standards_profile: {
        standards_profile_id: `sp_helixa_agent_${tokenId}`,
        supported_standard_ids: standards,
        last_verified_at: null,
      },
      payment_profile: {
        accepted_assets: acceptedPayments.map((asset) => ({ asset: asset.toUpperCase(), chain_id: HELIXA_CHAIN_ID })),
        x402_manifest_url: null,
        paid_endpoints_enabled: false,
      },
      updated_at: observedAt,
    },
    fragments: { subject_id: `helixa-agent-${tokenId}`, fragments },
    card: createLiveAgentCardDocument(agent, tokenId, profileUrl),
    agentCards: [agentCard],
    standards: { standard_refs: standards.map((standard) => ({ standard_id: standard, status: 'referenced' })) },
    x402: { endpoints: acceptedPayments.map((asset) => ({ endpoint_id: 'live-profile-reference', asset: asset.toUpperCase(), route: profileUrl, status: 'planned' })) },
    receipt: {
      receipt_id: 'No live receipt attached',
      status: 'not_attached',
      response_class: null,
      redaction_note: 'No live receipt attached to this public Helixa API record.',
    },
    routes: { profile: `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}` },
  };
}

export async function loadLiveHelixaMultipass(input, fetchImpl = fetch) {
  const parsed = parseHelixaResolverInput(input);
  const agent = await fetchHelixaAgent(parsed.tokenId, fetchImpl);
  return {
    ...mapHelixaAgentToMultipassDemo(agent),
    resolver: parsed,
  };
}

function createLiveFragments(agent, tokenId, multipassId, observedAt) {
  const fragments = [];

  fragments.push(createFragment({
    fragment_id: `frag_live_${tokenId}_identity`,
    multipass_id: multipassId,
    fragment_type: 'attestation',
    status: agent?.verified ? 'verified' : 'pending',
    assurance_level: agent?.verified ? 'onchain_verified' : 'platform_verified',
    transfer_policy: 'historical_on_transfer',
    source_type: agent?.explorer ? 'contract_read' : 'platform_check',
    observed_at: observedAt,
    reference_url: agent?.explorer ?? `https://helixa.xyz/agent/${encodeURIComponent(tokenId)}`,
    public_value: `Helixa AgentDNA token #${tokenId}${agent?.mintOrigin ? ` minted from ${agent.mintOrigin}` : ''}.`,
  }));

  if (hasNumericCred(agent?.credScore)) {
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_cred`,
      multipass_id: multipassId,
      fragment_type: 'risk_summary',
      status: 'verified',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'registry_import',
      observed_at: observedAt,
      reference_url: `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`,
      public_value: `Cred score ${agent.credScore}, ${formatCredTier(agent.credScore)} tier, imported from Helixa API.`,
    }));
  }

  for (const [network, value] of Object.entries(agent?.socials ?? {})) {
    if (!value) continue;
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_social_${safeKey(network)}`,
      multipass_id: multipassId,
      fragment_type: 'social',
      status: agent?.verified ? 'verified' : 'pending',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'platform_check',
      observed_at: observedAt,
      reference_url: `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`,
      public_value: `${formatLabel(network)} handle ${value} imported from Helixa API.`,
    }));
  }

  for (const [service, config] of Object.entries(agent?.services ?? {})) {
    const route = config?.url ?? config?.handle;
    if (!route) continue;
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_service_${safeKey(service)}`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'pending',
      assurance_level: 'self_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'platform_check',
      observed_at: observedAt,
      reference_url: `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`,
      public_value: `${formatLabel(service)} service route published by Helixa API.`,
      endpoint_ref: { endpoint_id: safeKey(service), url: route, protocol: service },
    }));
  }

  for (const standard of extractStandards(agent)) {
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_standard_${safeKey(standard)}`,
      multipass_id: multipassId,
      fragment_type: 'standard_ref',
      status: 'stale',
      assurance_level: 'issuer_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'issuer_attestation',
      observed_at: observedAt,
      reference_url: `${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`,
      public_value: `${standard} appears in public Helixa traits or metadata and needs a fresh adapter check before stronger claims.`,
    }));
  }

  return fragments;
}

function createFragment({ fragment_id, multipass_id, fragment_type, status, assurance_level, transfer_policy, source_type, observed_at, reference_url, public_value, endpoint_ref = undefined }) {
  return {
    schema_version: '0.1.0',
    fragment_id,
    multipass_id,
    fragment_type,
    status,
    assurance_level,
    visibility: 'public',
    transfer_policy,
    source: { source_type, source_id: fragment_id, issuer: 'Helixa', observed_at, reference_url },
    public_value,
    proof_reference: reference_url,
    created_at: observed_at,
    updated_at: observed_at,
    ...(status === 'verified' ? { verified_at: observed_at } : {}),
    ...(endpoint_ref ? { endpoint_ref } : {}),
  };
}

function createLiveOwnerSnapshot(agent) {
  return {
    owner: shortAddress(agent?.owner) ?? 'Owner not published',
    operator: shortAddress(agent?.operator) ?? 'Not delegated',
    custodyEpoch: 'Live API observation',
    permissionState: 'Read-only public profile',
    visibility: 'Public profile, private credentials hidden',
    recentChange: 'Live profile fetched',
    reviewAction: 'Review live identity fields',
    note: 'State reference only. Multipass shows ownership, custody, visibility, and review context without executing approvals or transferring authority.',
  };
}

function createLiveChangeLedger(agent) {
  const rows = [
    { event: 'Live profile fetched', source: 'Helixa API', impact: 'Public profile refreshed', reviewState: 'Verified' },
    { event: 'Owner observed', source: 'Helixa API', impact: agent?.owner ? 'Owner field published' : 'Owner not published', reviewState: agent?.owner ? 'Verified' : 'Review required' },
    { event: 'Private credentials hidden', source: 'Private vault', impact: 'No secrets or private credentials exposed', reviewState: 'No public action' },
  ];

  if (hasNumericCred(agent?.credScore)) {
    rows.splice(1, 0, { event: 'Cred imported', source: 'Helixa API', impact: `Cred score ${agent.credScore} displayed as context`, reviewState: 'Verified' });
  }

  if (Object.keys(agent?.services ?? {}).length) {
    rows.push({ event: 'Services reviewed', source: 'Helixa API', impact: 'Public routes shown as references only', reviewState: 'Review required' });
  }

  return rows;
}

function createLiveTransferPreview(agent) {
  return {
    currentOwner: shortAddress(agent?.owner) ?? 'Owner not published',
    custodyEpoch: 'Live API observation',
    claimAction: 'No transfer detected',
    permissionsState: 'Read-only public profile',
    toolAction: 'Reverify tools before active use',
    privateAccessAction: 'Rotate private access on custody change',
    historyState: 'Public history preserved',
    credContinuity: 'Cred continues with ownership-change context if custody changes.',
    note: 'Transfer state preview preserves public history but does not transfer secrets, private credentials, or active authority.',
  };
}

function createLiveAgentCardDocument(agent, tokenId, profileUrl) {
  return {
    schema_version: '0.1.0',
    agent_id: `${HELIXA_CHAIN_ID}:${tokenId}`,
    name: agent?.name ?? `Agent #${tokenId}`,
    capabilities: [...(agent?.skills ?? []), ...(agent?.domains ?? [])].map((name) => ({ name })),
    service_endpoints: Object.entries(agent?.services ?? {}).map(([id, config]) => ({
      endpoint_id: safeKey(id),
      url: config?.url ?? config?.handle ?? profileUrl,
      protocol: id,
    })),
    trust_summary: {
      identity_status: agent?.verified ? 'verified' : 'pending',
      assurance_level: agent?.verified ? 'onchain_verified' : 'platform_verified',
      cred_score: hasNumericCred(agent?.credScore) ? Number(agent.credScore) : null,
    },
    profile_url: profileUrl,
  };
}

function formatCredTier(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'Unrated';
  if (value >= 80) return 'Preferred';
  if (value >= 65) return 'Prime';
  if (value >= 50) return 'Qualified';
  if (value >= 30) return 'Marginal';
  return 'Junk';
}

function hasNumericCred(score) {
  return Number.isFinite(Number(score));
}

function shortAddress(address) {
  const value = String(address ?? '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function extractStandards(agent) {
  const candidates = [...(agent?.traits ?? []), ...(agent?.skills ?? []), ...(agent?.domains ?? [])]
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
  return [...new Set(candidates.filter((value) => /^ERC-\d+/i.test(value)).map((value) => value.toUpperCase()))];
}

function normalizeAcceptedPayments(agent) {
  return [...new Set([...(agent?.metadata?.acceptedPayments ?? []), agent?.linkedToken?.symbol].filter(Boolean).map((asset) => String(asset).toLowerCase()))];
}

function compact(items) {
  return items.filter(Boolean);
}

function safeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function formatLabel(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPositiveTokenId(value) {
  return /^\d+$/.test(value) && !/^0+$/.test(value);
}

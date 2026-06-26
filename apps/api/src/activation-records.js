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
const SOURCE_TYPE = 'helixa_agent';
const ACTIVATION_ORIGIN = 'live_agent_record';
const ACTIVATION_ORIGIN_SOURCE = 'trusted_resolver_metadata';

const PUBLIC_SOURCE_FIELDS = new Set([
  'tokenId',
  'name',
  'owner',
  'verified',
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
  const fragments = createPublicFragments({ tokenId, canonicalId, multipassId, displayName, observedAt, sourceSnapshot, sourceUrl });
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
      summary: `${displayName} saved from a public Helixa AgentDNA source record. Display only; owner, tools, payments, and private credentials are not claimed by this save.`,
      tags: uniqueStrings(['helixa', 'agentdna', 'multipass', sourceSnapshot.framework]),
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: standardsProfileId,
      supported_standard_ids: ['ERC-8004'],
      last_verified_at: null,
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
      identity_status: 'unverified',
      assurance_level: 'unverified',
      last_updated_at: observedAt,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: 'Saved records are display-only until ownership and management rights are verified.',
    },
    standards_refs: [
      { standard_id: 'ERC-8004', support_status: 'imported_unverified', record_id: canonicalId },
    ],
  });

  const standardsProfile = assertStandardsProfile({
    schema_version: SCHEMA_VERSION,
    standards_profile_id: standardsProfileId,
    multipass_id: multipassId,
    primary_refs: { helixa_agent: canonicalId },
    standard_refs: [
      {
        standard_id: 'ERC-8004',
        status: 'imported_unverified',
        chain_id: HELIXA_CHAIN_ID,
        contract_address: null,
        record_id: canonicalId,
        adapter_version: '0.1.0',
        last_verified_at: null,
        assurance_level: 'unverified',
      },
    ],
    compatibility_summary: {
      identity_bound: false,
      owner_verified: false,
      risk_checked: false,
      tools_verified: false,
      work_attested: false,
      trust_updated: false,
    },
    adapter_versions: { 'ERC-8004': '0.1.0' },
    last_verified_at: null,
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
      sourceSnapshot,
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

export async function activateHelixaRecord(input, { fetchImpl = fetch, observedAt } = {}) {
  const parsed = parseActivationInput(input);
  const agent = await fetchHelixaAgent(parsed.tokenId, fetchImpl);
  const returnedTokenId = agent?.tokenId === undefined || agent?.tokenId === null ? parsed.tokenId : normalizeTokenId(agent.tokenId);
  if (returnedTokenId !== parsed.tokenId) {
    throw new Error('Helixa API returned an agent token ID that did not match the activation input.');
  }
  return buildSavedRecordFromHelixaAgent({ ...agent, tokenId: parsed.tokenId }, { observedAt });
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

function createPublicFragments({ tokenId, canonicalId, multipassId, displayName, observedAt, sourceSnapshot, sourceUrl }) {
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

function createFragment({ fragment_id, multipass_id, fragment_type, status, assurance_level, transfer_policy, source_type, source_id, issuer, observed_at, reference_url, public_value, endpoint_ref }) {
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
    proof_reference: reference_url,
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

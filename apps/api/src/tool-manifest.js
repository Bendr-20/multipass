import {
  assertAgentCard,
  assertIdentityFragment,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

const SCHEMA_VERSION = '0.1.0';
const BANKR_X402_REGISTRIES = new Set(['bankr_x402_cloud']);
const ACTIVE_TOOL_STATUSES = new Set(['pending', 'verified', 'stale', 'disputed']);
const DEFAULT_X402_DECIMALS = 18;

export function getPublicToolFragments(fragments = []) {
  if (!Array.isArray(fragments)) return [];
  return fragments
    .filter((fragment) => fragment?.fragment_type === 'tool_manifest')
    .filter((fragment) => fragment.visibility === 'public')
    .filter((fragment) => Boolean(fragment.tool_manifest_ref))
    .map(assertToolManifestIdentityFragment);
}

export function normalizeToolManifestFragment(fragment) {
  const valid = assertToolManifestIdentityFragment(fragment);
  const ref = valid.tool_manifest_ref;
  const endpointUrl = normalizeHttpsUrl(ref.endpoint_url, 'tool_manifest_ref.endpoint_url');
  const manifestUrl = normalizeOptionalHttpsUrl(ref.manifest_url, 'tool_manifest_ref.manifest_url');
  const creatorAddress = normalizeOptionalCreatorAddress(ref.creator_address);

  return {
    fragment_id: valid.fragment_id,
    multipass_id: valid.multipass_id,
    tool_id: ref.tool_id,
    registry: ref.registry,
    name: ref.name,
    description: ref.description,
    endpoint_url: endpointUrl,
    manifest_url: manifestUrl,
    manifest_hash: ref.manifest_hash ?? null,
    creator_address: creatorAddress,
    pricing: {
      model: ref.pricing.model,
      amount: ref.pricing.amount ?? null,
      asset: ref.pricing.asset ?? null,
      chain_id: ref.pricing.chain_id ?? null,
    },
    access: {
      summary: ref.access.summary ?? null,
      requires_owner_approval: ref.access.requires_owner_approval ?? null,
    },
    schemas: {
      input_summary: ref.schemas.input_summary ?? null,
      output_summary: ref.schemas.output_summary ?? null,
    },
    verifiability: {
      tier: ref.verifiability.tier ?? null,
      summary: ref.verifiability.summary ?? null,
    },
    status: valid.status,
    assurance_level: valid.assurance_level,
    visibility: valid.visibility,
    last_checked_at: ref.last_checked_at ?? null,
    updated_at: valid.updated_at,
  };
}

export function summarizeToolsResponse(multipassId, fragments = []) {
  const tools = getPublicToolFragments(fragments).map(normalizeToolManifestFragment);
  return {
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    tools,
    summary: {
      total: tools.length,
      x402_count: tools.filter(isBankrX402Tool).length,
      verified_count: tools.filter((tool) => tool.status === 'verified').length,
      stale_count: tools.filter((tool) => tool.status === 'stale').length,
    },
  };
}

export function deriveX402ManifestFromTools(multipassId, fragments = []) {
  const endpoints = getPublicToolFragments(fragments)
    .map(normalizeToolManifestFragment)
    .filter(isActiveTool)
    .filter(isBankrX402Tool)
    .filter(hasX402Pricing)
    .map((tool) => ({
      endpoint_id: tool.tool_id,
      url: tool.endpoint_url,
      method: 'POST',
      description: truncate(tool.description, 1000),
      price: { amount: tool.pricing.amount, decimals: DEFAULT_X402_DECIMALS },
      asset: tool.pricing.asset,
      chain_id: tool.pricing.chain_id,
      provider: 'bankr_x402_cloud',
      settlement_reference_policy: 'provider_receipt',
      rate_limit: { requests: 0, window_seconds: 60 },
      visibility: 'public',
      requires_owner_approval: tool.access.requires_owner_approval ?? false,
    }));

  return assertX402Manifest({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    endpoints,
  });
}

export function deriveAgentCardServiceUpdates(agentCard, fragments = [], baseUrl = '') {
  const validCard = assertAgentCard(agentCard);
  const normalizedBaseUrl = normalizeOptionalBaseUrl(baseUrl);
  const tools = getPublicToolFragments(fragments).map(normalizeToolManifestFragment).filter(isActiveTool);
  const serviceEndpoints = mergeServiceEndpoints(
    validCard.service_endpoints,
    tools.map((tool) => ({
      endpoint_id: tool.tool_id,
      url: tool.endpoint_url,
      description: truncate(`${tool.name}: ${tool.description}`, 500),
      visibility: 'public',
    })),
  );
  const acceptedAssets = mergeAcceptedAssets(validCard.accepted_assets, tools);
  const x402ManifestUrl = deriveX402ManifestUrl(validCard, tools, normalizedBaseUrl);

  return assertAgentCard({
    ...validCard,
    service_endpoints: serviceEndpoints,
    accepted_assets: acceptedAssets,
    x402_manifest_url: x402ManifestUrl,
  });
}

function assertToolManifestIdentityFragment(fragment) {
  const valid = assertIdentityFragment(fragment);
  if (valid.fragment_type !== 'tool_manifest') {
    throw new TypeError('fragment_type must be tool_manifest for tool manifest normalization.');
  }
  if (!valid.tool_manifest_ref) {
    throw new TypeError('tool_manifest_ref is required for tool_manifest fragments.');
  }

  const ref = valid.tool_manifest_ref;
  normalizeHttpsUrl(ref.endpoint_url, 'tool_manifest_ref.endpoint_url');
  normalizeOptionalHttpsUrl(ref.manifest_url, 'tool_manifest_ref.manifest_url');
  normalizeOptionalCreatorAddress(ref.creator_address);
  return valid;
}

function isActiveTool(tool) {
  return ACTIVE_TOOL_STATUSES.has(tool.status);
}

function isBankrX402Tool(tool) {
  return BANKR_X402_REGISTRIES.has(tool.registry);
}

function hasX402Pricing(tool) {
  return typeof tool.pricing.amount === 'string'
    && /^[0-9]+(\.[0-9]+)?$/.test(tool.pricing.amount)
    && typeof tool.pricing.asset === 'string'
    && tool.pricing.asset.length > 0
    && Number.isInteger(tool.pricing.chain_id)
    && tool.pricing.chain_id > 0;
}

function mergeServiceEndpoints(existing = [], derived = []) {
  const endpoints = existing.map((endpoint) => ({ ...endpoint }));
  const seenEndpointIds = new Set(endpoints.map((endpoint) => endpoint.endpoint_id));

  for (const endpoint of derived) {
    if (seenEndpointIds.has(endpoint.endpoint_id)) continue;
    seenEndpointIds.add(endpoint.endpoint_id);
    endpoints.push(endpoint);
  }

  return endpoints;
}

function mergeAcceptedAssets(existing = [], tools = []) {
  const assets = existing.map((asset) => ({ ...asset }));
  const seen = new Set(assets.map(assetKey));

  for (const tool of tools) {
    const asset = tool.pricing.asset;
    const chainId = tool.pricing.chain_id;
    if (typeof asset !== 'string' || !asset || !Number.isInteger(chainId) || chainId < 1) continue;
    const next = { asset, chain_id: chainId };
    const key = assetKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push(next);
  }

  return assets;
}

function deriveX402ManifestUrl(agentCard, tools, normalizedBaseUrl) {
  if (!tools.some((tool) => isBankrX402Tool(tool) && hasX402Pricing(tool))) {
    return agentCard.x402_manifest_url ?? null;
  }
  if (!normalizedBaseUrl) return agentCard.x402_manifest_url ?? null;
  return `${normalizedBaseUrl}/api/multipass/${encodeURIComponent(agentCard.multipass_id)}/x402`;
}

function normalizeHttpsUrl(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
  rejectUrlCredentials(parsed, field);
  return parsed.toString();
}

function normalizeOptionalHttpsUrl(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeHttpsUrl(value, field);
}

function normalizeOptionalCreatorAddress(value) {
  if (value === undefined || value === null || value === '') return null;
  const address = String(value).trim();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    throw new TypeError('tool_manifest_ref.creator_address must be a lowercase 0x EVM address.');
  }
  return address;
}

function normalizeOptionalBaseUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError('baseUrl must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('baseUrl must use http or https.');
  rejectUrlCredentials(parsed, 'baseUrl');
  return parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
}

function rejectUrlCredentials(parsed, field) {
  if (parsed.username || parsed.password) throw new TypeError(`${field} must not include credentials.`);
}

function assetKey(asset) {
  return `${String(asset.asset).toUpperCase()}:${asset.chain_id}`;
}

function truncate(value, maxLength) {
  return String(value ?? '').slice(0, maxLength);
}

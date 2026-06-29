import { isSafeMultipassSharePath } from './save-panel.js';
import { STATIC_DEMO_DATA } from './static-demo-data.js';

const DEFAULT_API_BASE = '/multipass-api';

export function getApiBaseFromLocation(locationUrl) {
  const parsed = parseSafeApiOverride(locationUrl);
  return parsed ? stripTrailingSlash(parsed.toString()) : DEFAULT_API_BASE;
}

export function getWritableApiBaseFromLocation(locationUrl) {
  const parsed = parseSafeApiOverride(locationUrl);
  if (!parsed) return DEFAULT_API_BASE;
  return parsed.origin === locationUrl.origin ? stripTrailingSlash(parsed.toString()) : DEFAULT_API_BASE;
}

function parseSafeApiOverride(locationUrl) {
  const raw = locationUrl.searchParams.get('api');
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function getSavedSlugFromLocation(locationUrl) {
  const match = locationUrl.pathname.match(/^\/multipass\/([a-z0-9][a-z0-9-]{1,80})$/);
  if (!match) return null;
  const sharePath = `/multipass/${match[1]}`;
  return isSafeMultipassSharePath(sharePath) ? match[1] : null;
}

export function buildSavedRoutes(apiBase, slug) {
  const root = `${stripTrailingSlash(apiBase || DEFAULT_API_BASE)}/api/multipass/${encodeURIComponent(slug)}`;
  return {
    profile: root,
    fragments: `${root}/fragments`,
    card: `${root}/card`,
    standards: `${root}/standards`,
    x402: `${root}/x402`,
    changes: `${root}/changes`,
  };
}

export function buildDemoRoutes(apiBase, subject) {
  const base = stripTrailingSlash(apiBase || DEFAULT_API_BASE);
  const root = `${base}/api/multipass/${encodeURIComponent(subject.slug)}`;
  return {
    profile: root,
    fragments: `${root}/fragments`,
    card: `${root}/agent-card`,
    standards: `${root}/standards`,
    x402: `${root}/x402`,
    receipt: `${root}/receipts/${encodeURIComponent(subject.receiptId)}`,
  };
}

export async function loadJson(route, fetchImpl = fetch) {
  const response = await fetchImpl(route);
  if (!response.ok) {
    throw new Error(`GET ${route} failed with ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`API returned invalid JSON for ${route}: ${error.message}`);
  }
}

export async function loadSavedMultipassDemo({ apiBase = DEFAULT_API_BASE, slug, fetchImpl = fetch }) {
  const routes = buildSavedRoutes(apiBase, slug);
  const [profile, fragments, card, standards, x402, changes] = await Promise.all([
    loadJson(routes.profile, fetchImpl),
    loadJson(routes.fragments, fetchImpl),
    loadJson(routes.card, fetchImpl),
    loadJson(routes.standards, fetchImpl),
    loadJson(routes.x402, fetchImpl),
    loadJson(routes.changes, fetchImpl),
  ]);
  const agentCard = createSavedAgentCard({ profile, fragments, card, standards });

  return {
    profile,
    fragments,
    card,
    standards,
    x402,
    receipt: {
      schema_version: '0.1.0',
      receipt_id: 'receipt_unavailable',
      multipass_id: profile.multipass_id,
      endpoint_id: 'saved-profile',
      provider: 'helixa_api',
      amount: '0',
      asset: 'CRED',
      chain_id: 8453,
      status: 'unavailable',
      created_at: profile.updated_at ?? new Date(0).toISOString(),
      response_class: 'not_applicable',
    },
    changes,
    routes,
    modeLabel: 'Saved Multipass',
    sourceLabel: 'saved Multipass API',
    agentCards: agentCard ? [agentCard] : [],
    liveProfilePage: {
      headline: `${profile.display_name} Multipass`,
      headerMeta: `Saved Multipass · ${profile.slug}`,
      sharePath: `/multipass/${profile.slug}`,
    },
    activation: { state: 'saved_record' },
  };
}

export async function loadMultipassDemo({ apiBase = DEFAULT_API_BASE, subject, fetchImpl = fetch }) {
  const routes = buildDemoRoutes(apiBase, subject);
  const [profile, fragments, card, standards, x402, receipt] = await Promise.all([
    loadJson(routes.profile, fetchImpl),
    loadJson(routes.fragments, fetchImpl),
    loadJson(routes.card, fetchImpl),
    loadJson(routes.standards, fetchImpl),
    loadJson(routes.x402, fetchImpl),
    loadJson(routes.receipt, fetchImpl),
  ]);

  return { profile, fragments, card, standards, x402, receipt, routes, modeLabel: 'Local API Demo', sourceLabel: 'local API' };
}

function createSavedAgentCard({ profile, fragments, card, standards } = {}) {
  const tokenId = extractSavedTokenId({ profile, fragments, card, standards });
  const helixaId = extractSavedCanonicalId({ profile, fragments, card, standards }) ?? (tokenId ? `8453:${tokenId}` : profile?.multipass_id);
  const credScore = extractSavedCredScore({ profile, fragments, card });
  const proofFragmentIds = Array.isArray(fragments?.fragments)
    ? fragments.fragments.filter((fragment) => fragment?.visibility === 'public').map((fragment) => fragment.fragment_id).filter(Boolean)
    : [];
  const profileUrl = extractProfileUrl(card) ?? (tokenId ? `https://helixa.xyz/agent/${encodeURIComponent(tokenId)}` : null);

  return {
    name: card?.name ?? profile?.display_name ?? 'Saved Multipass',
    tokenId: tokenId ?? profile?.slug ?? profile?.multipass_id,
    helixaId,
    framework: extractSavedFramework(profile) ?? 'unknown',
    credScore,
    credTier: extractSavedCredTier({ profile, fragments, card, credScore }),
    verified: isSavedIdentityVerified({ profile, fragments, card }),
    profileUrl,
    proofFragmentIds,
    ownerSnapshot: createSavedOwnerSnapshot(profile),
    changeReviewLedger: createSavedChangeLedger(profile),
  };
}

function extractSavedTokenId(documents) {
  const canonicalId = extractSavedCanonicalId(documents);
  const fromCanonical = String(canonicalId ?? '').match(/^8453:(\d+)$/)?.[1];
  if (fromCanonical) return fromCanonical;

  const textCandidates = [
    documents?.profile?.slug,
    documents?.profile?.multipass_id,
    documents?.card?.['agent_id'],
    documents?.card?.profile_url,
    extractProfileUrl(documents?.card),
    ...(Array.isArray(documents?.fragments?.fragments) ? documents.fragments.fragments.flatMap((fragment) => [fragment?.public_value, fragment?.proof_reference, fragment?.source?.reference_url]) : []),
  ];
  return textCandidates.map(extractTokenIdFromText).find(Boolean) ?? null;
}

function extractSavedCanonicalId({ profile, fragments, card, standards } = {}) {
  const candidates = [
    profile?.helixa_id,
    profile?.helixaId,
    profile?.source_canonical_id,
    card?.['agent_id'],
    ...(Array.isArray(card?.standards_refs) ? card.standards_refs.map((ref) => ref?.record_id) : []),
    standards?.primary_refs?.helixa_agent,
    ...(Array.isArray(standards?.standard_refs) ? standards.standard_refs.map((ref) => ref?.record_id) : []),
    ...(Array.isArray(fragments?.fragments) ? fragments.fragments.map((fragment) => fragment?.source?.source_id) : []),
  ];
  return candidates.map((value) => String(value ?? '').trim()).find((value) => /^8453:\d+$/.test(value)) ?? null;
}

function extractTokenIdFromText(value) {
  const text = String(value ?? '');
  return text.match(/(?:^|[^\d])8453:(\d+)(?:$|[^\d])/)?.[1]
    ?? text.match(/agent\/(\d+)(?:$|[/?#])/i)?.[1]
    ?? text.match(/aura\/(\d+)\.png(?:$|[?#])/i)?.[1]
    ?? text.match(/(?:^|[^\d])#(\d+)(?:$|[^\d])/)?.[1]
    ?? text.match(/(?:^|_)agent_(\d+)(?:$|_)/)?.[1]
    ?? null;
}

function extractSavedCredScore({ profile, fragments, card } = {}) {
  const candidates = [
    card?.trust_summary?.cred_score,
    profile?.cred_summary?.score,
    profile?.cred_summary?.cred_score,
    profile?.credScore,
    profile?.cred_summary?.public_note,
    ...(Array.isArray(fragments?.fragments) ? fragments.fragments.filter((fragment) => fragment?.fragment_type === 'risk_summary').flatMap((fragment) => [fragment?.public_value, fragment?.summary]) : []),
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(Number(candidate))) return Number(candidate);
    const match = String(candidate ?? '').match(/\bCred(?:\s+score)?\s+(\d{1,3})\b/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function extractSavedCredTier({ profile, fragments, card, credScore } = {}) {
  const textCandidates = [
    card?.trust_summary?.cred_tier,
    profile?.cred_summary?.tier,
    profile?.cred_summary?.trust_state,
    profile?.cred_summary?.public_note,
    ...(Array.isArray(fragments?.fragments) ? fragments.fragments.filter((fragment) => fragment?.fragment_type === 'risk_summary').map((fragment) => fragment?.public_value) : []),
  ].map((value) => String(value ?? ''));
  const fromText = textCandidates.join(' ').match(/\b(Junk|Marginal|Qualified|Prime|Preferred)\b/i)?.[1];
  if (fromText) return fromText[0].toUpperCase() + fromText.slice(1).toLowerCase();
  return formatSavedCredTier(credScore);
}

function formatSavedCredTier(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'Unrated';
  if (value >= 80) return 'Preferred';
  if (value >= 65) return 'Prime';
  if (value >= 50) return 'Qualified';
  if (value >= 30) return 'Marginal';
  return 'Junk';
}

function isSavedIdentityVerified({ profile, fragments, card } = {}) {
  const statuses = [
    profile?.owner_summary?.verification_status,
    profile?.status,
    card?.trust_summary?.identity_status,
    ...(Array.isArray(fragments?.fragments) ? fragments.fragments.filter((fragment) => fragment?.fragment_type === 'attestation').map((fragment) => fragment?.status) : []),
  ].map((value) => String(value ?? '').toLowerCase());
  return statuses.some((status) => ['verified', 'active', 'claimed'].includes(status));
}

function extractSavedFramework(profile) {
  const tags = Array.isArray(profile?.discovery_profile?.tags) ? profile.discovery_profile.tags : [];
  const framework = tags.find((tag) => !['helixa', 'agentdna', 'multipass'].includes(String(tag).toLowerCase()));
  return framework ? String(framework) : null;
}

function extractProfileUrl(card) {
  if (card?.profile_url) return String(card.profile_url);
  if (!Array.isArray(card?.service_endpoints)) return null;
  return card.service_endpoints.find((endpoint) => endpoint?.endpoint_id === 'web')?.url ?? card.service_endpoints.find((endpoint) => endpoint?.url)?.url ?? null;
}

function createSavedOwnerSnapshot(profile) {
  const owner = profile?.owner_summary ?? {};
  return {
    owner: owner.owner_state ? formatSavedState(owner.owner_state) : 'Owner not published',
    operator: 'Saved Multipass API',
    custodyEpoch: profile?.custody_epoch ?? 'Saved profile',
    permissionState: owner.verification_status ? formatSavedState(owner.verification_status) : 'Management state not published',
    visibility: owner.visibility ? formatSavedState(owner.visibility) : 'Public profile',
    recentChange: profile?.updated_at ? `Updated ${profile.updated_at}` : 'No recent public change',
    reviewAction: owner.summary ?? 'No public review action',
  };
}

function createSavedChangeLedger(profile) {
  return profile?.updated_at ? [{
    event: 'Saved profile refreshed',
    source: 'Saved Multipass API',
    impact: 'Public profile display context updated',
    reviewState: profile?.status === 'active' ? 'Verified' : 'Review state not published',
  }] : [];
}

function formatSavedState(value) {
  return String(value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function shouldUseStaticDemo(locationUrl) {
  const path = locationUrl.pathname;
  const isMultipassRoute = path === '/multipass' || path === '/multipass/';
  return isMultipassRoute && !parseSafeApiOverride(locationUrl);
}

export async function loadStaticMultipassDemo() {
  return structuredClone(STATIC_DEMO_DATA);
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

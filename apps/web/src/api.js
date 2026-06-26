import { isSafeMultipassSharePath } from './save-panel.js';
import { STATIC_DEMO_DATA } from './static-demo-data.js';

const DEFAULT_API_BASE = '/multipass-api';

export function getApiBaseFromLocation(locationUrl) {
  const parsed = parseSafeApiOverride(locationUrl);
  return parsed ? stripTrailingSlash(parsed.toString()) : DEFAULT_API_BASE;
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

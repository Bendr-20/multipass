import { STATIC_DEMO_DATA } from './static-demo-data.js';

const DEFAULT_API_BASE = '/multipass-api';

export function getApiBaseFromLocation(locationUrl) {
  const raw = locationUrl.searchParams.get('api');
  if (!raw) return DEFAULT_API_BASE;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_API_BASE;
    return stripTrailingSlash(parsed.toString());
  } catch {
    return DEFAULT_API_BASE;
  }
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
  return !locationUrl.searchParams.has('api') && (path === '/multipass' || path.startsWith('/multipass/'));
}

export async function loadStaticMultipassDemo() {
  return structuredClone(STATIC_DEMO_DATA);
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

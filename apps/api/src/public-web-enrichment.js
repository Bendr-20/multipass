import { isIP } from 'node:net';

import { assertIdentityFragment } from '@helixa/multipass-sdk';

const SCHEMA_VERSION = '0.1.0';
const PUBLIC_WEB_TIER = 'public_web_observed';
const PUBLIC_WEB_ISSUER = 'public_web_importer';
const DEFAULT_OWNER_WARNING = 'Automated public-web enrichment is not owner-verified. Claim this Multipass to correct, verify, or remove scraped metadata.';
const HTTP_ROUTE_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)/gi;
const DOCUMENT_CANDIDATE_PATHS = [
  '/llms.txt',
  '/llms-full.txt',
  '/.well-known/openapi.json',
  '/.well-known/ai-plugin.json',
  '/openapi.json',
  '/strategy-plugin.txt',
  '/agent/integrations/mcp',
];
const FETCHABLE_CONTENT_TYPES = ['text/html', 'text/plain', 'text/markdown', 'application/json'];

export async function discoverPublicWebDocuments({ seedUrl, fetchImpl = globalThis.fetch, maxBytes = 250_000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const seed = normalizeHttpsUrl(seedUrl, 'seedUrl');
  const candidates = collectDocumentCandidateUrls(seed);
  const documents = [];

  for (const url of candidates) {
    const response = await fetchImpl(url, { headers: { accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1' } });
    if (!response?.ok) continue;
    const contentType = String(response.headers?.get?.('content-type') ?? '').toLowerCase();
    if (contentType && !FETCHABLE_CONTENT_TYPES.some((type) => contentType.includes(type))) continue;
    const raw = await response.text();
    const text = String(raw ?? '').slice(0, maxBytes);
    documents.push({
      url,
      title: extractDocumentTitle(text, contentType),
      text: normalizeDocumentText(text, contentType),
      contentType: contentType || null,
    });
  }

  return documents;
}

export function buildPublicWebEnrichment({ multipassId, displayName, seedUrl, documents = [], now = new Date().toISOString() } = {}) {
  const observedAt = normalizeDate(now, 'now');
  const profileName = cleanText(displayName) || 'agent';
  const seed = normalizeHttpsUrl(seedUrl, 'seedUrl');
  const sourceHost = new URL(seed).hostname.toLowerCase();
  const prefix = deriveSourcePrefix(sourceHost, profileName);
  const normalizedDocuments = normalizeDocuments(documents, seed);
  const bodyText = normalizedDocuments.map((document) => document.text).join('\n');
  const text = normalizedDocuments.map((document) => `${document.title ?? ''}\n${document.text}`).join('\n');
  const summary = extractSummary(bodyText, profileName);
  const tags = deriveTags(text);
  const avatarUrl = extractAvatarUrl(text);
  const endpoints = normalizedDocuments.map((document) => ({
    endpointId: `${prefix}-${slugifyId(endpointLabelFromUrl(document.url))}`,
    url: document.url,
    protocol: protocolFromUrl(document.url),
    description: `${profileName} public ${endpointLabelFromUrl(document.url)} source used for automated Multipass enrichment.`,
  }));
  const tools = deriveToolsFromDocuments({ documents: normalizedDocuments, sourceHost, prefix, observedAt });
  const capabilities = deriveCapabilities({ text, tools });

  return {
    schemaVersion: SCHEMA_VERSION,
    multipassId: cleanText(multipassId),
    sourceHost,
    sourcePrefix: prefix,
    sourceUrls: normalizedDocuments.map((document) => document.url),
    summary,
    tags,
    avatarUrl,
    ownerWarning: DEFAULT_OWNER_WARNING,
    endpoints,
    tools,
    capabilities,
    observedAt,
  };
}

export function normalizePublicWebEnrichment(input = {}, { multipassId, now = new Date().toISOString() } = {}) {
  const observedAt = normalizeDate(now, 'now');
  const sourceHost = normalizeHost(input.sourceHost, 'sourceHost');
  const sourcePrefix = slugifyId(input.sourcePrefix ?? sourceHost.split('.')[0]);
  const sourceUrls = normalizeSourceUrls(input.sourceUrls ?? []);
  const primarySourceUrl = sourceUrls[0] ?? `https://${sourceHost}/`;
  const ownerWarning = normalizeBoundedText(input.ownerWarning ?? DEFAULT_OWNER_WARNING, 'ownerWarning', 500);
  const summary = normalizeOptionalBoundedText(input.summary, 'summary', 1000);
  const tags = normalizeTags(input.tags ?? []);
  const avatarUrl = input.avatarUrl ? normalizeHttpsUrl(input.avatarUrl, 'avatarUrl') : null;
  const endpointInputs = normalizeEndpointInputs(input.endpoints ?? []);
  const toolInputs = normalizeToolInputs(input.tools ?? []);
  const capabilities = normalizeCapabilities(input.capabilities ?? []);
  const profileMultipassId = normalizeBoundedText(multipassId ?? input.multipassId, 'multipassId', 160);

  const endpointFragments = endpointInputs.map((endpoint) => assertIdentityFragment({
    schema_version: SCHEMA_VERSION,
    fragment_id: `frag_public_web_${sourcePrefix}_endpoint_${slugifyId(endpoint.endpointId)}`,
    multipass_id: profileMultipassId,
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: {
      source_type: 'platform_check',
      source_id: sourceScopedId(sourceHost, endpoint.endpointId),
      issuer: PUBLIC_WEB_ISSUER,
      observed_at: observedAt,
      reference_url: primarySourceUrl,
    },
    public_value: truncate(`${endpoint.description} ${ownerWarning}`, 1000),
    proof_reference: endpoint.url,
    created_at: observedAt,
    updated_at: observedAt,
    endpoint_ref: {
      endpoint_id: endpoint.endpointId,
      url: endpoint.url,
      protocol: endpoint.protocol,
    },
  }));

  const toolFragments = toolInputs.map((tool) => assertIdentityFragment({
    schema_version: SCHEMA_VERSION,
    fragment_id: `frag_tool_public_web_${slugifyId(tool.toolId)}`,
    multipass_id: profileMultipassId,
    fragment_type: 'tool_manifest',
    status: tool.status,
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: {
      source_type: 'platform_check',
      source_id: sourceScopedId(sourceHost, tool.toolId),
      issuer: PUBLIC_WEB_ISSUER,
      observed_at: observedAt,
      reference_url: primarySourceUrl,
    },
    public_value: truncate(`${tool.description} ${ownerWarning}`, 1000),
    proof_reference: tool.manifestUrl ?? primarySourceUrl,
    created_at: observedAt,
    updated_at: observedAt,
    tool_manifest_ref: {
      tool_id: tool.toolId,
      registry: 'unknown',
      name: tool.name,
      description: tool.description,
      endpoint_url: tool.endpointUrl,
      manifest_url: tool.manifestUrl,
      manifest_hash: null,
      creator_address: null,
      pricing: { model: 'unknown', amount: null, asset: null, chain_id: null },
      access: {
        summary: 'Imported from public docs. API-key, x402, or other access requirements must be verified with the owner/provider before execution.',
        requires_owner_approval: false,
      },
      schemas: {
        input_summary: tool.inputSummary,
        output_summary: tool.outputSummary,
      },
      verifiability: {
        tier: tool.verifiabilityTier,
        summary: 'Automatically extracted from public web documentation. Not owner-claimed or availability-verified by Multipass.',
      },
      last_checked_at: observedAt,
    },
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    multipassId: profileMultipassId,
    sourceHost,
    sourcePrefix,
    sourceUrls,
    sourceScope: `public-web:${sourceHost}:`,
    summary,
    tags,
    avatarUrl,
    ownerWarning,
    endpoints: endpointInputs,
    tools: toolInputs,
    capabilities,
    fragments: [...endpointFragments, ...toolFragments],
    observedAt,
    paymentSignals: {
      mentionsX402: Boolean(String(input.tags ?? '').toLowerCase().includes('x402') || capabilities.some((capability) => capability.capabilityId === 'x402_pay_per_call')),
    },
  };
}

export function isPublicWebImporterFragment(fragment, sourceScope) {
  return fragment?.source?.issuer === PUBLIC_WEB_ISSUER
    && String(fragment?.source?.source_id ?? '').startsWith(sourceScope);
}

function deriveToolsFromDocuments({ documents, sourceHost, prefix }) {
  const byPath = new Map();
  for (const document of documents) {
    for (const route of extractDocumentRoutes(document.text)) {
      const method = route.method;
      const path = cleanRoutePath(route.path);
      if (!path) continue;
      const line = route.line ?? extractLineForRoute(document.text, `${method} ${path}`);
      const endpointUrl = new URL(path, `https://${sourceHost}`).toString();
      const current = byPath.get(path) ?? { method, path, endpointUrl, lines: [], manifestUrls: new Set() };
      current.lines.push(line);
      current.manifestUrls.add(document.url);
      byPath.set(path, current);
    }
  }

  const routes = [...byPath.values()];
  const tools = [];
  const strategyRoutes = routes.filter((route) => route.path.includes('/strategy/'));
  const normalRoutes = routes.filter((route) => !route.path.includes('/strategy/'));

  for (const route of normalRoutes) {
    const routeName = knownRouteName(route.path) ?? titleFromRoute(route.path);
    tools.push({
      toolId: `${prefix}-${knownRouteSlug(route.path) ?? slugifyId(routeName)}`,
      name: routeName,
      endpointUrl: route.endpointUrl,
      manifestUrl: [...route.manifestUrls][0] ?? null,
      description: knownRouteDescription(route.path) ?? descriptionFromLines(route.lines, routeName),
      inputSummary: knownInputSummary(route.path) ?? `Input schema published in public docs for ${route.path}.`,
      outputSummary: knownOutputSummary(route.path) ?? `Output schema published in public docs for ${route.path}.`,
      status: 'pending',
      verifiabilityTier: PUBLIC_WEB_TIER,
    });
  }

  if (strategyRoutes.length > 0) {
    const deployRoute = strategyRoutes.find((route) => route.path.endsWith('/deploy')) ?? strategyRoutes[0];
    tools.push({
      toolId: `${prefix}-prompt-to-strategy`,
      name: 'Prompt to Strategy',
      endpointUrl: deployRoute.endpointUrl,
      manifestUrl: [...deployRoute.manifestUrls][0] ?? null,
      description: 'Beta Prompt-to-Strategy flow covering schema, token resolution, preflight, deploy, status, actions, and stop.',
      inputSummary: 'Strategy spec and supporting Base spot strategy inputs described in public docs.',
      outputSummary: 'Strategy deployment, status, actions, or stop response depending on the selected strategy route.',
      status: 'pending',
      verifiabilityTier: PUBLIC_WEB_TIER,
    });
  }

  return dedupeBy(tools, (tool) => tool.toolId).slice(0, 12);
}

function deriveCapabilities({ text, tools }) {
  const lower = text.toLowerCase();
  const capabilities = [];
  const add = (capabilityId, label, description) => capabilities.push({ capabilityId, label, description, visibility: 'public' });

  if (tools.some((tool) => tool.toolId.includes('token'))) add('token_analysis', 'Token analysis', 'Token, market, and onchain context extracted from public docs.');
  if (tools.some((tool) => tool.toolId.includes('trending'))) add('market_intelligence', 'Market intelligence', 'Trending token discovery and market overview capability from public docs.');
  if (tools.some((tool) => tool.toolId.includes('wallet'))) add('wallet_analysis', 'Wallet analysis', 'Wallet or portfolio analysis capability from public docs.');
  if (tools.some((tool) => tool.toolId.includes('swap'))) add('swap_execution', 'Swap execution', 'Natural-language swap route or transaction-preparation capability from public docs.');
  if (tools.some((tool) => tool.toolId.includes('strategy'))) add('prompt_to_strategy', 'Prompt to Strategy', 'Strategy automation flow extracted from public docs.');
  if (lower.includes('x402')) add('x402_pay_per_call', 'x402 pay-per-call', 'Public docs mention x402 payment support.');
  if (capabilities.length === 0 && tools.length > 0) add('public_api_tools', 'Public API tools', 'Public API tool surface extracted from public docs.');

  return dedupeBy(capabilities, (capability) => capability.capabilityId).slice(0, 8);
}

function deriveTags(text) {
  const lower = text.toLowerCase();
  const tags = ['public-web'];
  const checks = [
    ['defai', 'defai'],
    ['x402', 'x402'],
    ['mcp', 'mcp'],
    ['api', 'api'],
    ['virtuals', 'virtuals-acp'],
    ['wallet', 'wallet-analysis'],
    ['trading', 'trading'],
    ['swap', 'swap'],
    ['strategy', 'strategy'],
    ['base', 'base'],
  ];
  for (const [needle, tag] of checks) {
    if (lower.includes(needle)) tags.push(tag);
  }
  return normalizeTags(tags);
}

function extractSummary(text, displayName) {
  const jsonSummary = extractJsonSummary(text);
  if (jsonSummary) return jsonSummary;

  const sentences = splitSentences(text);
  const nameToken = displayName.toLowerCase().split(/\s|-/)[0] ?? '';
  const namePattern = nameToken ? new RegExp(`\\b${escapeRegExp(nameToken)}\\b\\s+(?:is|are)\\b`, 'i') : null;
  const preferred = (namePattern ? sentences.find((sentence) => namePattern.test(sentence)) : null)
    ?? sentences.find((sentence) => sentence.toLowerCase().includes(nameToken) && /\bis\b|\bare\b/i.test(sentence))
    ?? sentences[0]
    ?? sentences.find((sentence) => sentence.toLowerCase().includes(nameToken))
    ?? sentences.find((sentence) => /\bis\b|\bare\b/i.test(sentence))
    ?? `${displayName} public docs imported by Multipass.`;
  return truncate(preferred, 500);
}

function extractJsonSummary(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const name = cleanText(parsed.name);
    const description = cleanText(parsed.description);
    if (name && description) return truncate(`${name}: ${description}`, 500);
    if (description) return truncate(description, 500);
  } catch {
    return null;
  }
  return null;
}

function splitSentences(text) {
  const markdownCleaned = stripMarkdownBoilerplate(text);
  const cleaned = cleanText(markdownCleaned);
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20
      && !/^post\s+\//i.test(sentence)
      && !/^get\s+\//i.test(sentence)
      && !/^>/i.test(sentence)
      && !/\bRaw:\s*https?:\/\//i.test(sentence)
      && !/\b(?:var|let|const|function|document|window)\b|[{};]/i.test(sentence));
}

function stripMarkdownBoilerplate(text) {
  return String(text ?? '')
    .replace(/SECURITY NOTICE:[\s\S]*?---/gi, ' ')
    .replace(/^>.*$/gm, ' ')
    .replace(/^---+$/gm, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ');
}

function extractAvatarUrl(text) {
  const match = text.match(/https:\/\/[^\s)'"<>]+\.(?:png|jpg|jpeg|webp|gif|svg)/i);
  return match ? normalizeHttpsUrl(match[0], 'avatarUrl') : null;
}

function collectDocumentCandidateUrls(seedUrl) {
  const parsed = new URL(seedUrl);
  const origin = parsed.origin;
  const candidates = [seedUrl, ...DOCUMENT_CANDIDATE_PATHS.map((pathname) => new URL(pathname, origin).toString())];
  return dedupeBy(candidates, (url) => url);
}

function extractDocumentTitle(text, contentType) {
  if (String(contentType ?? '').includes('text/html')) {
    const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match) return cleanText(stripHtml(match[1]));
  }
  const firstLine = text.split(/\n+/).map(cleanText).find(Boolean);
  return firstLine ? truncate(firstLine, 120) : '';
}

function normalizeDocumentText(text, contentType) {
  if (String(contentType ?? '').includes('text/html')) {
    return cleanText([
      extractHtmlMetadataText(text),
      stripHtml(text),
      extractScriptRouteText(text),
    ].filter(Boolean).join('\n'));
  }
  return cleanText(stripMarkdownBoilerplate(text));
}

function extractHtmlMetadataText(html) {
  const descriptions = [];
  for (const match of String(html ?? '').matchAll(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
    descriptions.push(match[1]);
  }
  if (descriptions.length > 0) return cleanText(descriptions.join(' '));
  const titleMatch = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? cleanText(stripHtml(titleMatch[1])) : '';
}

function extractScriptRouteText(html) {
  const lines = [];
  for (const scriptMatch of String(html ?? '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = scriptMatch[1];
    for (const pathMatch of script.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/gi)) {
      const index = pathMatch.index ?? 0;
      const snippet = script.slice(Math.max(0, index - 360), Math.min(script.length, index + 520));
      const fields = [];
      for (const field of ['id', 'name', 'desc', 'description', 'price', 'path']) {
        const fieldMatch = snippet.match(new RegExp(`\\b${field}\\s*:\\s*['"]([^'"]+)['"]`, 'i'));
        if (fieldMatch) fields.push(`${field}: '${fieldMatch[1]}'`);
      }
      if (fields.length > 0) lines.push(fields.join(' '));
    }
  }
  return cleanText(lines.join('\n'));
}

function stripHtml(html) {
  return cleanText(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function normalizeDocuments(documents, seedUrl) {
  const normalized = [];
  const seen = new Set();
  const sourceDocuments = Array.isArray(documents) && documents.length > 0 ? documents : [{ url: seedUrl, text: '' }];
  for (const document of sourceDocuments) {
    const url = normalizeHttpsUrl(document?.url ?? seedUrl, 'document.url');
    if (seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      url,
      title: cleanText(document?.title),
      text: cleanText(document?.text ?? document?.content ?? ''),
    });
  }
  return normalized;
}

function normalizeEndpointInputs(endpoints) {
  return dedupeBy(endpoints.map((endpoint) => ({
    endpointId: slugifyId(endpoint.endpointId),
    url: normalizeHttpsUrl(endpoint.url, 'endpoint.url'),
    protocol: normalizeProtocol(endpoint.protocol),
    description: normalizeBoundedText(endpoint.description, 'endpoint.description', 500),
  })), (endpoint) => endpoint.endpointId).slice(0, 16);
}

function normalizeToolInputs(tools) {
  return dedupeBy(tools.map((tool) => ({
    toolId: slugifyId(tool.toolId),
    name: normalizeBoundedText(tool.name, 'tool.name', 120),
    endpointUrl: normalizeHttpsUrl(tool.endpointUrl, 'tool.endpointUrl'),
    manifestUrl: tool.manifestUrl ? normalizeHttpsUrl(tool.manifestUrl, 'tool.manifestUrl') : null,
    description: normalizeBoundedText(tool.description, 'tool.description', 500),
    inputSummary: normalizeOptionalBoundedText(tool.inputSummary, 'tool.inputSummary', 500) ?? 'Input schema published in public docs.',
    outputSummary: normalizeOptionalBoundedText(tool.outputSummary, 'tool.outputSummary', 500) ?? 'Output schema published in public docs.',
    status: normalizeStatus(tool.status),
    verifiabilityTier: normalizeOptionalBoundedText(tool.verifiabilityTier, 'tool.verifiabilityTier', 80) ?? PUBLIC_WEB_TIER,
  })), (tool) => tool.toolId).slice(0, 16);
}

function normalizeCapabilities(capabilities) {
  return dedupeBy(capabilities.map((capability) => ({
    capabilityId: slugifyId(capability.capabilityId),
    label: normalizeBoundedText(capability.label, 'capability.label', 120),
    description: normalizeOptionalBoundedText(capability.description, 'capability.description', 500) ?? null,
    visibility: 'public',
  })), (capability) => capability.capabilityId).slice(0, 8);
}

function normalizeSourceUrls(urls) {
  return dedupeBy((Array.isArray(urls) ? urls : [urls]).filter(Boolean).map((url) => normalizeHttpsUrl(url, 'sourceUrl')), (url) => url).slice(0, 20);
}

function normalizeTags(tags) {
  return dedupeBy((Array.isArray(tags) ? tags : [tags]).map((tag) => slugifyId(tag)).filter(Boolean), (tag) => tag).slice(0, 12);
}

function normalizeStatus(value) {
  const status = String(value ?? 'pending').trim();
  if (!['pending', 'stale', 'disputed'].includes(status)) return 'pending';
  return status;
}

function protocolFromUrl(url) {
  const parsed = new URL(url);
  const value = `${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (value.includes('mcp') || value.includes('strategy-plugin')) return 'mcp';
  if (value.includes('openapi') || value.includes('llms') || value.includes('api')) return 'api';
  return 'web';
}

function endpointLabelFromUrl(url) {
  const parsed = new URL(url);
  const basename = parsed.pathname.split('/').filter(Boolean).at(-1) || parsed.hostname.split('.')[0] || 'landing';
  return basename === 'landing' ? 'landing' : basename;
}

function cleanRoutePath(path) {
  const cleaned = String(path ?? '').replace(/[).,;]+$/g, '').trim();
  const parsed = cleaned.split(/[?#]/)[0];
  return parsed.replace(/[).,;]+$/g, '').trim();
}

function extractDocumentRoutes(text) {
  const routes = [];
  for (const match of String(text ?? '').matchAll(HTTP_ROUTE_PATTERN)) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      line: extractLineForRoute(text, match[0]),
    });
  }

  for (const match of String(text ?? '').matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/gi)) {
    const path = match[1];
    if (!path.startsWith('/')) continue;
    routes.push({
      method: 'GET',
      path,
      line: extractLineForRoute(text, match[0]),
    });
  }

  return routes;
}

function extractLineForRoute(text, routeToken) {
  return text.split(/\n+/).map(cleanText).find((line) => line.includes(routeToken)) ?? routeToken;
}

function knownRouteSlug(path) {
  if (path.endsWith('/ask')) return 'ask';
  if (path.endsWith('/token')) return 'token-analysis';
  if (path.endsWith('/trending')) return 'trending';
  if (path.endsWith('/wallet_analysis')) return 'wallet-analysis';
  if (path.endsWith('/swap')) return 'swap-execution';
  return null;
}

function knownRouteName(path) {
  if (path.endsWith('/ask')) return 'VU Ask';
  if (path.endsWith('/token')) return 'Token Analysis';
  if (path.endsWith('/trending')) return 'Trending Tokens';
  if (path.endsWith('/wallet_analysis')) return 'Wallet Analysis';
  if (path.endsWith('/swap')) return 'Swap Execution';
  return null;
}

function knownRouteDescription(path) {
  if (path.endsWith('/ask')) return 'General-purpose DeFi AI chat powered by the public agent API.';
  if (path.endsWith('/token')) return 'Multi-agent token analysis covering price action, onchain activity, social sentiment, technical analysis, and token context.';
  if (path.endsWith('/trending')) return 'Natural-language market discovery for trending tokens, movers, categories, chains, and risk overviews.';
  if (path.endsWith('/wallet_analysis')) return 'Wallet and portfolio analysis for EVM or Solana addresses, including holdings, PnL, trading history, and risk context.';
  if (path.endsWith('/swap')) return 'Natural-language swap intent parser that returns a ready-to-sign transaction payload when supported by the provider.';
  return null;
}

function knownInputSummary(path) {
  if (path.endsWith('/ask')) return 'question: natural-language crypto, DeFi, protocol, market, or portfolio question.';
  if (path.endsWith('/token')) return 'token: symbol, token name, or contract address.';
  if (path.endsWith('/trending')) return 'instruction: optional chain, category, or timeframe request.';
  if (path.endsWith('/wallet_analysis')) return 'wallet: EVM or Solana wallet address.';
  if (path.endsWith('/swap')) return 'instruction: natural-language swap request including chain, assets, amount, and wallet address.';
  return null;
}

function knownOutputSummary(path) {
  if (path.endsWith('/ask')) return 'AI-generated answer with market, DeFi, protocol, or portfolio context when available.';
  if (path.endsWith('/token')) return 'Structured token analysis and AI-generated summary.';
  if (path.endsWith('/trending')) return 'Token discovery results with metrics and short analysis.';
  if (path.endsWith('/wallet_analysis')) return 'AI-generated wallet analysis for due diligence, copy-trading research, or portfolio review.';
  if (path.endsWith('/swap')) return 'Ready-to-sign transaction data and route context when supported by the provider.';
  return null;
}

function titleFromRoute(path) {
  const last = path.split('/').filter(Boolean).at(-1) ?? 'api';
  return last.split(/[_-]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function descriptionFromLines(lines, fallbackName) {
  const cleanLines = lines.map(cleanText).filter(Boolean);
  if (cleanLines.length === 0) return `${fallbackName} endpoint extracted from public docs.`;
  const withoutRoute = cleanLines[0].replace(/^\s*(GET|POST|PUT|PATCH|DELETE)\s+\S+\s*-?\s*/i, '');
  return truncate(withoutRoute || `${fallbackName} endpoint extracted from public docs.`, 500);
}

function deriveSourcePrefix(sourceHost, displayName) {
  const hostPrefix = sourceHost.split('.')[0];
  if (hostPrefix && hostPrefix !== 'www') return slugifyId(hostPrefix);
  return slugifyId(displayName).split('-').slice(0, 2).join('-') || 'public-web';
}

function sourceScopedId(sourceHost, id) {
  return `public-web:${sourceHost}:${slugifyId(id)}`;
}

function normalizeProtocol(value) {
  const protocol = String(value ?? '').trim().toLowerCase();
  if (!['web', 'api', 'mcp', 'a2a', 'x402', 'x401'].includes(protocol)) throw new TypeError('endpoint protocol is invalid.');
  return protocol;
}

function normalizeHost(value, field) {
  const host = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(host)) throw new TypeError(`${field} is invalid.`);
  return host;
}

function normalizeHttpsUrl(value, field) {
  const raw = String(value ?? '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
  if (parsed.username || parsed.password) throw new TypeError(`${field} must not include credentials.`);
  assertPublicHostname(parsed.hostname, field);
  return parsed.toString();
}

function assertPublicHostname(hostname, field) {
  const host = String(hostname ?? '').toLowerCase();
  const unbracketed = host.replace(/^\[(.*)]$/, '$1');
  if (unbracketed === 'localhost' || unbracketed.endsWith('.localhost')) {
    throw new TypeError(`${field} must use a public hostname.`);
  }
  if (isIP(unbracketed) !== 0) {
    throw new TypeError(`${field} must use a public hostname.`);
  }
}

function normalizeBoundedText(value, field, maxLength) {
  const normalized = cleanText(value);
  if (!normalized) throw new TypeError(`${field} is required.`);
  if (normalized.length > maxLength) throw new TypeError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function normalizeOptionalBoundedText(value, field, maxLength) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  if (normalized.length > maxLength) return truncate(normalized, maxLength);
  return normalized;
}

function normalizeDate(value, field) {
  const date = new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date-time.`);
  return date.toISOString();
}

function cleanText(value) {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) => ({
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    })[entity] ?? _);
}

function slugifyId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function dedupeBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

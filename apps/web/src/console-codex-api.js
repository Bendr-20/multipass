import { SavedMultipassError, joinApiPath } from './saved-multipass-api.js';

const CODEX_QUERY_PATH = '/api/multipass/console/codex/query';
const CODEX_OPERATIONS = new Set([
  'getTokenProfile',
  'explainTraits',
  'compareTokens',
  'findByTraits',
  'findSimilar',
  'getTraitStats',
  'getCollectionSummary',
]);
const ENVELOPE_KEYS = Object.freeze([
  'artifactHash',
  'codexVersion',
  'evidence',
  'operation',
  'result',
  'schemaVersion',
  'subjectIds',
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TOKEN_ID_PATTERN = /^[1-9][0-9]{0,3}$/u;

export async function queryConsoleCodex({
  apiBase,
  selectedTokenId,
  operation,
  input,
  csrfToken,
  fetchImpl = fetch,
} = {}) {
  const normalizedTokenId = String(selectedTokenId ?? '').trim();
  if (!TOKEN_ID_PATTERN.test(normalizedTokenId) || Number(normalizedTokenId) > 7_777) {
    throw new SavedMultipassError('Selected Looper token ID is invalid.');
  }
  if (!CODEX_OPERATIONS.has(operation) || !isPlainObject(input)) {
    throw new SavedMultipassError('Codex query is invalid.');
  }
  const endpoint = sameOriginEndpoint(apiBase);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(csrfToken ? { 'x-csrf-token': String(csrfToken) } : {}),
    },
    body: JSON.stringify({ selectedTokenId: normalizedTokenId, operation, input }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const serverMessage = responseBody?.error?.message;
    const message = typeof serverMessage === 'string' && serverMessage.length <= 256
      ? serverMessage
      : `Codex query failed with ${response.status}`;
    throw new SavedMultipassError(message, { status: response.status, body: responseBody });
  }
  if (!isConsoleCodexEnvelope(responseBody, operation)) {
    throw new SavedMultipassError('Codex response envelope is invalid.');
  }
  return responseBody;
}

export async function loadConsoleCodexBundle({
  apiBase,
  selectedTokenId,
  csrfToken,
  fetchImpl = fetch,
} = {}) {
  const normalizedTokenId = String(selectedTokenId ?? '').trim();
  const tokenId = Number(normalizedTokenId);
  const common = { apiBase, selectedTokenId: normalizedTokenId, csrfToken, fetchImpl };
  const [profile, explanation, similarity] = await Promise.all([
    queryConsoleCodex({ ...common, operation: 'getTokenProfile', input: { tokenId } }),
    queryConsoleCodex({ ...common, operation: 'explainTraits', input: { tokenId } }),
    queryConsoleCodex({ ...common, operation: 'findSimilar', input: { tokenId } }),
  ]);
  if (profile.artifactHash !== explanation.artifactHash
    || profile.artifactHash !== similarity.artifactHash
    || profile.codexVersion !== explanation.codexVersion
    || profile.codexVersion !== similarity.codexVersion) {
    throw new SavedMultipassError('Codex responses must come from the same artifact and version.');
  }
  return {
    selectedTokenId: normalizedTokenId,
    artifactHash: profile.artifactHash,
    codexVersion: profile.codexVersion,
    profile,
    explanation,
    similarity,
  };
}

function sameOriginEndpoint(apiBase) {
  const browserLocation = globalThis.location ?? globalThis.window?.location;
  if (!browserLocation?.origin) throw new SavedMultipassError('Codex API requires a browser origin.');
  let endpoint;
  try {
    endpoint = new URL(joinApiPath(apiBase ?? browserLocation.origin, CODEX_QUERY_PATH), browserLocation.origin);
  } catch {
    throw new SavedMultipassError('Codex API URL is invalid.');
  }
  if (endpoint.origin !== browserLocation.origin) {
    throw new SavedMultipassError('Codex API must use the same-origin endpoint.');
  }
  return endpoint.toString();
}

function isConsoleCodexEnvelope(value, expectedOperation) {
  return isPlainObject(value)
    && exactKeys(value, ENVELOPE_KEYS)
    && value.operation === expectedOperation
    && CODEX_OPERATIONS.has(value.operation)
    && typeof value.schemaVersion === 'string'
    && VERSION_PATTERN.test(value.schemaVersion)
    && typeof value.artifactHash === 'string'
    && HASH_PATTERN.test(value.artifactHash)
    && typeof value.codexVersion === 'string'
    && VERSION_PATTERN.test(value.codexVersion);
}

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

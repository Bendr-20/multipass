export const CANONICAL_ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
export const LOOPERS_MAINNET_COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const DEFAULT_LOOPER_CRED_API_BASE_URL = 'https://api.helixa.xyz';
export const DEFAULT_LOOPER_CRED_TIMEOUT_MS = 4_000;
export const DEFAULT_LOOPER_CRED_CONCURRENCY = 4;

const CANONICAL_CHAIN_ID = 8453;
const CRED_TIERS = new Set(['JUNK', 'MARGINAL', 'QUALIFIED', 'PRIME', 'PREFERRED']);
const COVERAGE_LABELS = new Set(['THIN', 'PARTIAL', 'GOOD', 'STRONG']);
const EVIDENCE_KEYS = Object.freeze([
  'binding',
  'metadata',
  'continuity',
  'erc6551Activity',
  'erc8004Reputation',
  'verifiedReceipts',
]);
const EVIDENCE_KEY_SET = new Set(EVIDENCE_KEYS);
const STABLE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const METHODOLOGY_VERSION = /^looper-cred-v[1-9]\d{0,5}$/u;
const DECIMAL_ID = /^(?:0|[1-9]\d*)$/u;

export class LooperCredClientError extends Error {
  constructor(code, { status = 503, cause } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'LooperCredClientError';
    this.code = STABLE_CODE.test(String(code)) ? String(code) : 'upstream_unavailable';
    this.status = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
  }
}

export function createLooperCredClient({
  baseUrl = DEFAULT_LOOPER_CRED_API_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_LOOPER_CRED_TIMEOUT_MS,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const boundedTimeoutMs = normalizePositiveInteger(timeoutMs, 'timeoutMs', { max: 30_000 });
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  return {
    async getCred(expectedSubject) {
      const expected = normalizeExpectedSubject(expectedSubject);
      const endpoint = new URL(`/api/v2/cred/erc8004/${expected.chainId}/${encodeURIComponent(expected.agentId)}`, normalizedBaseUrl);
      endpoint.searchParams.set('registry', CANONICAL_ERC8004_REGISTRY);
      const controller = new AbortController();
      let timer;
      try {
        const response = await Promise.race([
          Promise.resolve(fetchImpl(endpoint, {
            method: 'GET',
            headers: { accept: 'application/json' },
            signal: controller.signal,
          })).catch((error) => {
            throw new LooperCredClientError('upstream_unavailable', { cause: error });
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new LooperCredClientError('upstream_timeout', { status: 504 }));
            }, boundedTimeoutMs);
          }),
        ]);
        if (!response || typeof response.ok !== 'boolean') {
          throw new LooperCredClientError('upstream_unavailable');
        }
        const payload = await readJson(response);
        if (!response.ok) {
          const code = STABLE_CODE.test(String(payload?.error ?? ''))
            ? String(payload.error)
            : 'upstream_unavailable';
          throw new LooperCredClientError(code, { status: response.status });
        }
        return normalizeCanonicalLooperCred(payload, expected);
      } catch (error) {
        if (error instanceof LooperCredClientError) throw error;
        if (error?.name === 'AbortError') {
          throw new LooperCredClientError('upstream_timeout', { status: 504, cause: error });
        }
        throw new LooperCredClientError('upstream_unavailable', { cause: error });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function normalizeCanonicalLooperCred(payload, expectedSubject) {
  const expected = normalizeExpectedSubject(expectedSubject);
  if (!isPlainObject(payload) || !isPlainObject(payload.subject)) invalidResponse();
  const subject = payload.subject;
  const subjectMatches = subject.chainId === expected.chainId
    && canonicalDecimalId(subject.agentId) === expected.agentId
    && canonicalDecimalId(subject.looperTokenId) === expected.looperTokenId
    && equalAddress(subject.registry, CANONICAL_ERC8004_REGISTRY)
    && equalAddress(subject.collection, LOOPERS_MAINNET_COLLECTION);
  if (!subjectMatches) throw new LooperCredClientError('subject_mismatch', { status: 422 });

  const score = boundedScore(payload.score);
  const tier = String(payload.tier ?? '');
  if (!CRED_TIERS.has(tier) || tier !== tierForScore(score)) invalidResponse();
  const coverage = normalizeCoverage(payload.evidenceCoverage);
  const freshness = normalizeFreshness(payload.freshness);
  const methodologyVersion = String(payload.methodologyVersion ?? '');
  if (!METHODOLOGY_VERSION.test(methodologyVersion)) invalidResponse();
  const computedAt = canonicalIsoTimestamp(payload.computedAt);
  const updatedAt = canonicalIsoTimestamp(payload.updatedAt);

  return {
    score,
    tier,
    coverage,
    freshness,
    methodologyVersion,
    computedAt,
    updatedAt,
    status: freshness.stale ? 'stale' : 'available',
  };
}

export async function enrichOwnedLoopersWithCred(agents, {
  credClient,
  concurrency = DEFAULT_LOOPER_CRED_CONCURRENCY,
} = {}) {
  if (!Array.isArray(agents)) throw new TypeError('Owned Looper agents must be an array.');
  if (!credClient || typeof credClient.getCred !== 'function') {
    throw new TypeError('A Looper CRED client is required.');
  }
  const limit = normalizePositiveInteger(concurrency, 'concurrency', { max: 16 });
  const subjects = new Map();
  const prepared = agents.map((agent) => {
    const tokenId = optionalCanonicalId(agent?.tokenId);
    const agentId = optionalCanonicalId(agent?.erc8004AgentId);
    const chainId = agent?.chainId === undefined ? CANONICAL_CHAIN_ID : Number(agent.chainId);
    if (!tokenId || !agentId || chainId !== CANONICAL_CHAIN_ID) {
      return { agent, key: null, cred: unavailableCred('missing_identity') };
    }
    const expected = { chainId: CANONICAL_CHAIN_ID, agentId, looperTokenId: tokenId };
    const key = `${expected.chainId}:${expected.agentId}:${expected.looperTokenId}`;
    if (!subjects.has(key)) subjects.set(key, expected);
    return { agent, key, cred: null };
  });

  const results = new Map();
  const queue = [...subjects.entries()];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const [key, subject] = queue[index];
      try {
        results.set(key, await credClient.getCred(subject));
      } catch (error) {
        results.set(key, unavailableCred(error instanceof LooperCredClientError ? error.code : 'upstream_unavailable'));
      }
    }
  });
  await Promise.all(workers);

  return prepared.map(({ agent, key, cred: immediateCred }) => {
    const cred = immediateCred ?? results.get(key) ?? unavailableCred('upstream_unavailable');
    const available = cred.status === 'available' || cred.status === 'stale';
    return {
      ...agent,
      cred,
      credScore: available ? cred.score : null,
      credLabel: available
        ? `CRED ${cred.score} · ${cred.tier}${cred.status === 'stale' ? ' · STALE' : ''}`
        : 'CRED unavailable',
    };
  });
}

function normalizeExpectedSubject(value) {
  if (!isPlainObject(value)) throw new TypeError('Expected Looper CRED subject is required.');
  const chainId = Number(value.chainId);
  const agentId = canonicalDecimalId(value.agentId);
  const looperTokenId = canonicalDecimalId(value.looperTokenId);
  if (chainId !== CANONICAL_CHAIN_ID || !agentId || !looperTokenId) {
    throw new TypeError('Expected Looper CRED subject is invalid.');
  }
  return { chainId, agentId, looperTokenId };
}

function normalizeCoverage(value) {
  if (!isPlainObject(value)) invalidResponse();
  const score = boundedScore(value.score);
  const label = String(value.label ?? '');
  if (!COVERAGE_LABELS.has(label) || label !== coverageLabelForScore(score)) invalidResponse();
  const present = normalizeEvidenceList(value.present);
  const missing = normalizeEvidenceList(value.missing);
  const combined = [...present, ...missing];
  if (new Set(combined).size !== EVIDENCE_KEYS.length || combined.length !== EVIDENCE_KEYS.length) invalidResponse();
  if (EVIDENCE_KEYS.some((key) => !combined.includes(key))) invalidResponse();
  return { score, label, present, missing };
}

function normalizeEvidenceList(value) {
  if (!Array.isArray(value)) invalidResponse();
  const normalized = value.map((entry) => String(entry));
  if (normalized.some((entry) => !EVIDENCE_KEY_SET.has(entry))) invalidResponse();
  if (new Set(normalized).size !== normalized.length) invalidResponse();
  return normalized;
}

function normalizeFreshness(value) {
  if (!isPlainObject(value)) invalidResponse();
  const status = String(value.status ?? '');
  const stale = value.stale;
  const cached = value.cached;
  if (!['fresh', 'stale'].includes(status) || typeof stale !== 'boolean' || typeof cached !== 'boolean') invalidResponse();
  if ((status === 'stale') !== stale || (stale && !cached)) invalidResponse();
  const normalized = {
    status,
    stale,
    cached,
    ageSeconds: nonnegativeInteger(value.ageSeconds),
    maxAgeSeconds: nonnegativeInteger(value.maxAgeSeconds),
    staleIfErrorSeconds: nonnegativeInteger(value.staleIfErrorSeconds),
  };
  if (normalized.staleIfErrorSeconds < normalized.maxAgeSeconds) invalidResponse();
  if (!stale && normalized.ageSeconds > normalized.maxAgeSeconds) invalidResponse();
  if (stale && (normalized.ageSeconds <= normalized.maxAgeSeconds || normalized.ageSeconds > normalized.staleIfErrorSeconds)) invalidResponse();
  if (value.reason !== undefined) {
    const reason = String(value.reason);
    if (!stale || !STABLE_CODE.test(reason)) invalidResponse();
    normalized.reason = reason;
  }
  return normalized;
}

function unavailableCred(code) {
  return {
    score: null,
    tier: null,
    coverage: null,
    freshness: null,
    methodologyVersion: null,
    computedAt: null,
    updatedAt: null,
    status: 'unavailable',
    error: { code: STABLE_CODE.test(String(code)) ? String(code) : 'upstream_unavailable' },
  };
}

async function readJson(response) {
  try {
    const value = await response.json();
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new TypeError('Looper CRED API base URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Looper CRED API base URL must be HTTP(S) without credentials.');
  }
  return url;
}

function normalizePositiveInteger(value, label, { max }) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > max) {
    throw new TypeError(`${label} must be a positive integer no greater than ${max}.`);
  }
  return numeric;
}

function tierForScore(score) {
  if (score >= 91) return 'PREFERRED';
  if (score >= 76) return 'PRIME';
  if (score >= 51) return 'QUALIFIED';
  if (score >= 26) return 'MARGINAL';
  return 'JUNK';
}

function coverageLabelForScore(score) {
  if (score >= 80) return 'STRONG';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'PARTIAL';
  return 'THIN';
}

function boundedScore(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) invalidResponse();
  return value;
}

function nonnegativeInteger(value) {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) invalidResponse();
  return value;
}

function canonicalIsoTimestamp(value) {
  const text = String(value ?? '');
  if (text.length > 40) invalidResponse();
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) invalidResponse();
  return text;
}

function canonicalDecimalId(value) {
  const text = String(value ?? '');
  if (!DECIMAL_ID.test(text)) return null;
  try {
    const parsed = BigInt(text);
    return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function optionalCanonicalId(value) {
  const normalized = canonicalDecimalId(value);
  return normalized && normalized !== '0' ? normalized : null;
}

function equalAddress(actual, expected) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(actual ?? ''))
    && String(actual).toLowerCase() === expected.toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function invalidResponse() {
  throw new LooperCredClientError('invalid_response', { status: 502 });
}

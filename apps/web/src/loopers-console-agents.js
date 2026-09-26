import { SavedMultipassError, joinApiPath } from './saved-multipass-api.js';

export async function fetchOwnedLooperAgents({ apiBase = '', fetchImpl = fetch } = {}) {
  const response = await fetchImpl(joinApiPath(apiBase, '/api/loopers/owned'), {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(body?.error?.message ?? `Owned Loopers request failed with ${response.status}`, { status: response.status, body });
  }
  if (!Array.isArray(body?.agents)) {
    throw new SavedMultipassError('Loopers ownership response did not include an agent list.');
  }
  return body.agents.map(mapOwnedLooperAgent).filter(Boolean);
}

function mapOwnedLooperAgent(agent = {}) {
  const tokenId = String(agent.tokenId ?? '').trim();
  if (!tokenId) return null;
  const name = String(agent.name ?? `Looper #${tokenId}`).trim() || `Looper #${tokenId}`;
  const role = String(agent.role ?? findTrait(agent, 'Agent Class') ?? findTrait(agent, 'Class') ?? 'Looper agent').trim() || 'Looper agent';
  const specialization = findTrait(agent, 'Specialization');
  const risk = findTrait(agent, 'Risk');
  const autonomy = findTrait(agent, 'Autonomy');
  const cred = normalizeOwnedLooperCred(agent.cred);
  const credAvailable = cred.status === 'available' || cred.status === 'stale';

  return {
    ...agent,
    tokenId,
    name,
    canonicalName: String(agent.canonicalName ?? name).trim() || name,
    role,
    verified: agent.verified !== false,
    cred,
    credScore: credAvailable ? cred.score : null,
    credLabel: credAvailable
      ? `CRED ${cred.score} · ${cred.tier}${cred.status === 'stale' ? ' · STALE' : ''}`
      : cred.status === 'pending' ? 'CRED pending' : 'CRED unavailable',
    state: agent.state ?? 'Owned Looper',
    href: agent.href ?? `/multipass/loopers/${encodeURIComponent(tokenId)}`,
    identityBadges: Array.isArray(agent.identityBadges) && agent.identityBadges.length
      ? agent.identityBadges
      : [role, risk ? `${risk} risk` : null, autonomy ? `${autonomy} autonomy` : null].filter(Boolean),
    logline: agent.logline ?? [role, specialization].filter(Boolean).join(' · '),
    profileLane: agent.profileLane ?? specialization ?? role,
    watchLabel: agent.watchLabel ?? specialization ?? 'Wallet context',
    watchBody: agent.watchBody ?? 'Wallet-owned Looper identity with review-only chat and proposals.',
    identityBody: agent.identityBody ?? `Wallet-owned Looper identity derived from token #${tokenId}.`,
    mandateBody: agent.mandateBody ?? 'Use traits, wallet context, and memory to brief before any proposal.',
    operatorBody: agent.operatorBody ?? 'No spend, post, or transaction executes without owner approval.',
  };
}

export function normalizeOwnedLooperCred(value) {
  if (value === undefined || value === null) return emptyCred('pending');
  if (!isPlainObject(value)) return emptyCred('unavailable');
  if (value.status === 'unavailable') {
    const code = /^[a-z][a-z0-9_]{0,63}$/u.test(String(value.error?.code ?? ''))
      ? String(value.error.code)
      : 'upstream_unavailable';
    return { ...emptyCred('unavailable'), error: { code } };
  }
  if (!['available', 'stale'].includes(value.status)) return emptyCred('unavailable');
  if (!Number.isInteger(value.score) || value.score < 0 || value.score > 100) return emptyCred('unavailable');
  if (!['JUNK', 'MARGINAL', 'QUALIFIED', 'PRIME', 'PREFERRED'].includes(value.tier)) return emptyCred('unavailable');
  if (!validCoverage(value.coverage) || !validFreshness(value.freshness, value.status)) return emptyCred('unavailable');
  if (!/^looper-cred-v[1-9]\d{0,5}$/u.test(String(value.methodologyVersion ?? ''))) return emptyCred('unavailable');
  if (!validIso(value.computedAt) || !validIso(value.updatedAt)) return emptyCred('unavailable');
  return {
    score: value.score,
    tier: value.tier,
    coverage: {
      score: value.coverage.score,
      label: value.coverage.label,
      present: [...value.coverage.present],
      missing: [...value.coverage.missing],
    },
    freshness: {
      status: value.freshness.status,
      stale: value.freshness.stale,
      cached: value.freshness.cached,
      ageSeconds: value.freshness.ageSeconds,
      maxAgeSeconds: value.freshness.maxAgeSeconds,
      staleIfErrorSeconds: value.freshness.staleIfErrorSeconds,
      ...(value.freshness.reason === undefined ? {} : { reason: value.freshness.reason }),
    },
    methodologyVersion: value.methodologyVersion,
    computedAt: value.computedAt,
    updatedAt: value.updatedAt,
    status: value.status,
  };
}

function emptyCred(status) {
  return {
    score: null,
    tier: null,
    coverage: null,
    freshness: null,
    methodologyVersion: null,
    computedAt: null,
    updatedAt: null,
    status,
  };
}

function validCoverage(value) {
  if (!isPlainObject(value) || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return false;
  if (!['THIN', 'PARTIAL', 'GOOD', 'STRONG'].includes(value.label)) return false;
  if (!Array.isArray(value.present) || !Array.isArray(value.missing)) return false;
  const allowed = ['binding', 'metadata', 'continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'];
  const combined = [...value.present, ...value.missing];
  return combined.length === allowed.length
    && new Set(combined).size === allowed.length
    && allowed.every((key) => combined.includes(key));
}

function validFreshness(value, status) {
  if (!isPlainObject(value)) return false;
  if (!['fresh', 'stale'].includes(value.status) || typeof value.stale !== 'boolean' || typeof value.cached !== 'boolean') return false;
  if ((value.status === 'stale') !== value.stale || (status === 'stale') !== value.stale || (value.stale && !value.cached)) return false;
  for (const key of ['ageSeconds', 'maxAgeSeconds', 'staleIfErrorSeconds']) {
    if (!Number.isInteger(value[key]) || value[key] < 0) return false;
  }
  return value.reason === undefined || (value.stale && /^[a-z][a-z0-9_]{0,63}$/u.test(String(value.reason)));
}

function validIso(value) {
  const text = String(value ?? '');
  const parsed = Date.parse(text);
  return text.length <= 40 && Number.isFinite(parsed) && new Date(parsed).toISOString() === text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function findTrait(agent = {}, traitType = '') {
  const traits = agent.traits && typeof agent.traits === 'object' ? agent.traits : {};
  if (traits[traitType]) return String(traits[traitType]).trim();
  const match = Array.isArray(agent.attributes)
    ? agent.attributes.find((attribute) => String(attribute?.trait_type ?? attribute?.traitType ?? '').trim().toLowerCase() === traitType.toLowerCase())
    : null;
  return match?.value === undefined ? null : String(match.value).trim();
}

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

  return {
    ...agent,
    tokenId,
    name,
    canonicalName: String(agent.canonicalName ?? name).trim() || name,
    role,
    verified: agent.verified !== false,
    credLabel: agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`),
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

function findTrait(agent = {}, traitType = '') {
  const traits = agent.traits && typeof agent.traits === 'object' ? agent.traits : {};
  if (traits[traitType]) return String(traits[traitType]).trim();
  const match = Array.isArray(agent.attributes)
    ? agent.attributes.find((attribute) => String(attribute?.trait_type ?? attribute?.traitType ?? '').trim().toLowerCase() === traitType.toLowerCase())
    : null;
  return match?.value === undefined ? null : String(match.value).trim();
}

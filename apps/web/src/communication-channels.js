const BLOCKED_STATUSES = new Set(['revoked', 'retired', 'hidden']);
const CHANNEL_PRIORITY = ['Email', 'AgentMail', 'Telegram', 'X', 'Farcaster', 'Wiretap', 'GitHub', 'Website'];

export function getCommunicationChannels(data = {}) {
  const candidates = [
    ...getArray(data?.communicationChannels).map(normalizeExplicitChannel),
    ...getArray(data?.profile?.communicationChannels).map(normalizeExplicitChannel),
    ...getPublicSocialFragments(data).map(deriveCommunicationChannelFromFragment),
    ...getArray(data?.card?.message_routes).map(deriveCommunicationChannelFromMessageRoute),
    ...getArray(data?.agentCard?.message_routes).map(deriveCommunicationChannelFromMessageRoute),
  ].filter(Boolean);

  const channels = [];
  for (const candidate of candidates) {
    if (channels.some((entry) => communicationChannelKey(entry) === communicationChannelKey(candidate))) continue;
    channels.push(candidate);
  }

  return [...channels].sort(compareCommunicationChannels);
}

export function getCommunicationContactPolicy(data = {}) {
  const policy = data?.card?.contact_policy ?? data?.agentCard?.contact_policy ?? data?.contact_policy ?? data?.profile?.contact_policy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const mode = firstPresentText(policy.mode);
  const note = firstPresentText(policy.policy_note, policy.note, policy.summary);
  const requiresOwnerApproval = typeof policy.requires_owner_approval === 'boolean' ? policy.requires_owner_approval : undefined;
  if (!mode && !note && requiresOwnerApproval === undefined) return null;
  return { mode, note, requiresOwnerApproval };
}

function getPublicSocialFragments(data) {
  return getArray(data?.fragments?.fragments).filter((fragment) => {
    if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) return false;
    if (String(fragment.fragment_type ?? '').toLowerCase() !== 'social') return false;
    if (String(fragment.visibility ?? '').toLowerCase() !== 'public') return false;
    if (BLOCKED_STATUSES.has(String(fragment.status ?? '').toLowerCase())) return false;
    return true;
  });
}

function deriveCommunicationChannelFromFragment(fragment) {
  const label = inferChannelLabel(fragment);
  const value = inferChannelValue(label, fragment);
  if (!label || !value) return null;
  const url = inferChannelUrl(label, value);
  return {
    label,
    value,
    url,
    status: firstPresentText(fragment.status),
    sourceLabel: firstPresentText(fragment.source?.issuer, fragment.source?.source_type, 'Public fragment'),
    sourceUrl: firstPresentText(fragment.source?.reference_url, fragment.proof_reference),
    proofNote: firstPresentText(fragment.proof_reference),
    fragmentId: firstPresentText(fragment.fragment_id),
  };
}

function deriveCommunicationChannelFromMessageRoute(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null;
  const label = labelFromText(firstPresentText(route.channel, route.type, route.protocol, route.route_id, route.name)) || 'Message route';
  const value = firstPresentText(route.address, route.handle, route.url, route.endpoint, route.value);
  if (!value) return null;
  return {
    label,
    value,
    url: inferChannelUrl(label, value),
    status: firstPresentText(route.status, route.mode),
    sourceLabel: firstPresentText(route.source, 'Agent card'),
    sourceUrl: '',
    proofNote: firstPresentText(route.description, route.summary),
    fragmentId: '',
  };
}

function normalizeExplicitChannel(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const label = labelFromText(firstPresentText(entry.label, entry.channel, entry.type, entry.platform, entry.name));
  const value = firstPresentText(entry.value, entry.handle, entry.address, entry.url);
  if (!label || !value) return null;
  return {
    label,
    value,
    url: firstPresentText(entry.url) || inferChannelUrl(label, value),
    status: firstPresentText(entry.status),
    sourceLabel: firstPresentText(entry.sourceLabel, entry.source?.label, entry.source, 'Published profile'),
    sourceUrl: firstPresentText(entry.sourceUrl, entry.source?.url),
    proofNote: firstPresentText(entry.proofNote, entry.proof, entry.summary),
    fragmentId: firstPresentText(entry.fragmentId, entry.fragment_id),
  };
}

function inferChannelLabel(fragment) {
  const text = [fragment.fragment_id, fragment.source?.source_id, fragment.public_value, fragment.proof_reference].map((value) => String(value ?? '').toLowerCase()).join(' ');
  if (/agentmail/.test(text)) return 'AgentMail';
  if (/wiretap|\baim\b|darklabz/.test(text)) return 'Wiretap';
  if (/telegram|\bt\.me\b/.test(text)) return 'Telegram';
  if (/farcaster|warpcast/.test(text)) return 'Farcaster';
  if (/(^|[^a-z])x($|[^a-z])|twitter|x\.com/.test(text)) return 'X';
  if (/github/.test(text)) return 'GitHub';
  if (/website|homepage|https?:\/\//.test(text)) return 'Website';
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return 'Email';
  return labelFromText(firstPresentText(fragment.source?.source_id, fragment.fragment_id)) || 'Social';
}

function inferChannelValue(label, fragment) {
  const publicValue = firstPresentText(fragment.public_value, fragment.proof_reference, fragment.source?.reference_url);
  if (!publicValue) return '';
  const url = publicValue.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,]+$/g, '');
  const email = publicValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];

  if (['Email', 'AgentMail', 'Wiretap'].includes(label) && email) return email;
  if (label === 'Website' && url) return url;
  if (label === 'GitHub') {
    const repo = publicValue.match(/(?:github\s+handle|github:?|github\.com\/)(?:\s+)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i)?.[1];
    if (repo) return repo;
  }
  if (['X', 'Telegram', 'Farcaster'].includes(label)) {
    const handle = publicValue.match(/@([A-Za-z0-9_.-]{2,80})/)?.[1]
      ?? publicValue.match(/:\s*([A-Za-z0-9_.-]{2,80})/)?.[1]
      ?? publicValue.match(/handle\s+([A-Za-z0-9_.@-]{2,80})/i)?.[1];
    if (handle) return handle.replace(/^@/, '');
  }

  return publicValue
    .replace(/^[A-Za-z0-9 ._-]{1,40}:\s*/, '')
    .replace(/\s+observed from .*$/i, '')
    .trim();
}

function inferChannelUrl(label, value) {
  const text = firstPresentText(value);
  if (!text) return '';
  const direct = safeCommunicationUrl(text);
  if (direct) return direct;
  const clean = text.replace(/^@/, '').trim();
  if (!clean) return '';
  if (label === 'Email' || label === 'AgentMail') return safeCommunicationUrl(`mailto:${clean}`);
  if (label === 'X') return `https://x.com/${encodeURIComponent(clean)}`;
  if (label === 'Telegram') return `https://t.me/${encodeURIComponent(clean)}`;
  if (label === 'Farcaster') return `https://warpcast.com/${encodeURIComponent(clean)}`;
  if (label === 'GitHub' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) return `https://github.com/${clean}`;
  return '';
}

function safeCommunicationUrl(value) {
  try {
    const parsed = new URL(String(value));
    if (parsed.username || parsed.password) return '';
    if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return parsed.href;
    return '';
  } catch {
    return '';
  }
}

function communicationChannelKey(entry) {
  return `${entry.label.toLowerCase()}:${firstPresentText(entry.url, entry.value).toLowerCase()}`;
}

function compareCommunicationChannels(left, right) {
  const leftIndex = priorityIndex(left.label);
  const rightIndex = priorityIndex(right.label);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return communicationChannelKey(left).localeCompare(communicationChannelKey(right));
}

function priorityIndex(label) {
  const index = CHANNEL_PRIORITY.indexOf(label);
  return index === -1 ? CHANNEL_PRIORITY.length : index;
}

function labelFromText(value) {
  const text = firstPresentText(value);
  if (!text) return '';
  const normalized = text.toLowerCase();
  if (normalized.includes('agentmail')) return 'AgentMail';
  if (normalized.includes('wiretap') || normalized === 'aim') return 'Wiretap';
  if (normalized.includes('telegram')) return 'Telegram';
  if (normalized.includes('farcaster')) return 'Farcaster';
  if (normalized === 'x' || normalized.includes('twitter')) return 'X';
  if (normalized.includes('github')) return 'GitHub';
  if (normalized.includes('website')) return 'Website';
  if (normalized.includes('email')) return 'Email';
  return text
    .split(/[:/_-]+/)
    .filter(Boolean)
    .at(-1)
    ?.replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? '';
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstPresentText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

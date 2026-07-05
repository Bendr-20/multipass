const MIN_MEMBERS = 2;
const MAX_MEMBERS = 24;
const DISPLAY_NAME_MIN = 3;
const DISPLAY_NAME_MAX = 120;
const SUMMARY_MAX = 500;
const POLICY_NOTE_MAX = 500;
const CHAIN_ID = 8453;
const ALLOWED_SUBJECT_TYPES = new Set(['swarm', 'collection']);

export class GroupActivationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'GroupActivationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeGroupActivationInput(input = {}) {
  const payload = isPlainObject(input) ? input : {};
  const subjectType = normalizeSubjectType(payload.subject_type);
  const displayName = normalizeText(payload.display_name, 'display_name', { required: true });

  if (displayName.length < DISPLAY_NAME_MIN || displayName.length > DISPLAY_NAME_MAX) {
    throwInvalid('display_name', `Display name must be ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters.`, {
      min: DISPLAY_NAME_MIN,
      max: DISPLAY_NAME_MAX,
      received: displayName.length,
    });
  }

  const summary = normalizeText(payload.summary, 'summary', { max: SUMMARY_MAX });
  const sharedPolicyNote = normalizeText(payload.shared_policy_note, 'shared_policy_note', { max: POLICY_NOTE_MAX });
  const members = normalizeMembers(payload.member_ids);

  return {
    subjectType,
    displayName,
    baseSlug: slugifyDisplayName(displayName),
    summary,
    sharedPolicyNote,
    members,
  };
}

export async function resolveGroupMembers(normalized, activationService) {
  if (typeof activationService !== 'function') {
    throw new GroupActivationError(
      'group_member_resolution_unavailable',
      'Group member resolution is not configured.',
      503,
      {},
    );
  }

  const records = [];
  const memberSummaries = [];

  for (const member of normalized.members) {
    let record;
    try {
      record = await activationService(member.tokenId);
    } catch (error) {
      throw mapMemberResolutionError(error, member);
    }

    if (!record) {
      throw groupMemberNotFound(member);
    }

    records.push(record);
    memberSummaries.push(createMemberSummary(member, record));
  }

  return { records, memberSummaries };
}

function normalizeSubjectType(value) {
  if (typeof value !== 'string') {
    throwInvalid('subject_type', 'Subject type must be swarm or collection.', {
      allowed: [...ALLOWED_SUBJECT_TYPES],
    });
  }

  const normalized = value.trim();
  if (!ALLOWED_SUBJECT_TYPES.has(normalized)) {
    throwInvalid('subject_type', 'Subject type must be swarm or collection.', {
      allowed: [...ALLOWED_SUBJECT_TYPES],
      received: normalized,
    });
  }

  return normalized;
}

function normalizeText(value, field, { required = false, max = null } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      throwInvalid(field, `${field} is required.`, { required: true });
    }
    return '';
  }

  if (typeof value !== 'string') {
    throwInvalid(field, `${field} must be a string.`, { receivedType: typeof value });
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throwInvalid(field, `${field} is required.`, { required: true });
  }

  if (max !== null && normalized.length > max) {
    throwInvalid(field, `${field} must be ${max} characters or fewer.`, {
      max,
      received: normalized.length,
    });
  }

  return normalized;
}

function normalizeMembers(value) {
  const rawIds = parseMemberIdList(value);

  if (rawIds.length < MIN_MEMBERS || rawIds.length > MAX_MEMBERS) {
    throwInvalid('member_ids', `Member IDs must include ${MIN_MEMBERS} to ${MAX_MEMBERS} records.`, {
      min: MIN_MEMBERS,
      max: MAX_MEMBERS,
      received: rawIds.length,
    });
  }

  const members = rawIds.map((rawId, index) => parseMemberId(rawId, index));
  const seenCanonicalIds = new Set();
  for (const member of members) {
    if (seenCanonicalIds.has(member.canonicalId)) {
      throwInvalid('member_ids', 'Member IDs must be unique after normalization.', {
        duplicate: member.canonicalId,
      });
    }
    seenCanonicalIds.add(member.canonicalId);
  }

  return members;
}

function parseMemberIdList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
  }

  throwInvalid('member_ids', 'Member IDs must be an array or a comma/newline separated string.', {
    receivedType: value === null ? 'null' : typeof value,
  });
}

function parseMemberId(value, index) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throwInvalidMemberId(value, index);
    }
    return toMember(String(value));
  }

  if (typeof value !== 'string') {
    throwInvalidMemberId(value, index);
  }

  const raw = value.trim();
  if (/^[1-9]\d*$/.test(raw)) {
    return toMember(raw);
  }

  const canonical = raw.match(/^(\d+):(\d+)$/);
  if (!canonical || Number(canonical[1]) !== CHAIN_ID || !/^[1-9]\d*$/.test(canonical[2])) {
    throwInvalidMemberId(value, index);
  }

  return toMember(canonical[2]);
}

function toMember(tokenId) {
  return { tokenId, canonicalId: `${CHAIN_ID}:${tokenId}` };
}

function createMemberSummary(member, record) {
  const sourceSnapshot = record?.sourceContext?.sourceSnapshot ?? {};

  return {
    name: firstNonEmptyString(record?.profile?.display_name, record?.agentCard?.name) ?? `AgentDNA ${member.tokenId}`,
    token_id: member.tokenId,
    canonical_id: member.canonicalId,
    cred_score: extractCredScore(record, sourceSnapshot),
    cred_tier: firstNonEmptyString(sourceSnapshot.credTier, sourceSnapshot.tier, sourceSnapshot.cred_tier) ?? null,
    source_status: 'resolved',
    profile_url: firstNonEmptyString(sourceSnapshot.profileUrl, sourceSnapshot.profile_url) ?? null,
  };
}

function extractCredScore(record, sourceSnapshot) {
  const credSummary = record?.profile?.cred_summary;
  const profileScore = extractCredSummaryScore(credSummary);
  if (profileScore !== null) return profileScore;
  return normalizeCredScore(sourceSnapshot.credScore ?? sourceSnapshot.cred_score);
}

function extractCredSummaryScore(credSummary) {
  if (credSummary === undefined || credSummary === null) return null;
  if (typeof credSummary === 'number' || typeof credSummary === 'string') {
    return normalizeCredScore(credSummary);
  }
  if (!isPlainObject(credSummary)) return null;

  return normalizeCredScore(
    credSummary.score
      ?? credSummary.cred_score
      ?? credSummary.credScore
      ?? credSummary.value,
  );
}

function normalizeCredScore(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function mapMemberResolutionError(error, member) {
  if (isNotFoundError(error)) {
    return groupMemberNotFound(member, error);
  }

  if (isRateLimitError(error)) {
    return new GroupActivationError(
      'group_member_rate_limited',
      `Group member ${member.canonicalId} could not be resolved because the resolver is rate-limited.`,
      429,
      memberErrorDetails(member, error),
    );
  }

  return new GroupActivationError(
    'group_member_resolution_unavailable',
    `Group member ${member.canonicalId} could not be resolved because the resolver is unavailable.`,
    503,
    memberErrorDetails(member, error),
  );
}

function groupMemberNotFound(member, error = null) {
  return new GroupActivationError(
    'group_member_not_found',
    `Group member ${member.canonicalId} was not found in the public Helixa AgentDNA source.`,
    404,
    memberErrorDetails(member, error),
  );
}

function memberErrorDetails(member, error = null) {
  const details = {
    token_id: member.tokenId,
    canonical_id: member.canonicalId,
  };
  const resolverStatus = resolverStatusCode(error);
  if (resolverStatus) {
    details.resolver_status = resolverStatus;
  }
  return details;
}

function isNotFoundError(error) {
  if (resolverStatusCode(error) === 404) return true;
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  return code.includes('not_found') || code.includes('notfound') || /\bnot found\b|no helixa agent|\b404\b/.test(message);
}

function isRateLimitError(error) {
  if (resolverStatusCode(error) === 429) return true;
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  return code.includes('rate') || /rate[- ]?limit|too many requests|\b429\b/.test(message);
}

function resolverStatusCode(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return Number.isInteger(status) ? status : null;
}

function throwInvalidMemberId(value, index) {
  throwInvalid('member_ids', 'Member IDs must be Base AgentDNA token IDs like 1 or canonical IDs like 8453:1.', {
    index,
    received: String(value),
    chainId: CHAIN_ID,
  });
}

function throwInvalid(field, message, details = {}) {
  throw new GroupActivationError('invalid_group_activation', message, 400, { field, ...details });
}

function slugifyDisplayName(value) {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'group';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

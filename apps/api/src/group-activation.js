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

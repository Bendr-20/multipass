import { createHash } from 'node:crypto';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX401Manifest,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import { deriveX401ManifestFromFragments } from './x401-manifest.js';

const SCHEMA_VERSION = '0.1.0';
const GROUP_SOURCE_TYPE = 'multipass_group';
const GROUP_ACTIVATION_ORIGIN = 'group_activation';
const GROUP_ACTIVATION_ORIGIN_SOURCE = 'multipass_group_builder';
const FINGERPRINT_LENGTH = 8;
const PROFILE_SLUG_MAX_LENGTH = 81;
const X401_HEADERS = {
  request: 'PROOF-REQUEST',
  response: 'PROOF-RESPONSE',
  result: 'PROOF-RESULT',
};

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

  const resolvedMembers = await Promise.all(normalized.members.map(async (member) => {
    let record;
    try {
      record = await activationService(member.tokenId);
    } catch (error) {
      throw mapMemberResolutionError(error, member);
    }

    if (!record) {
      throw groupMemberNotFound(member);
    }

    return { record, memberSummary: createMemberSummary(member, record) };
  }));

  return {
    records: resolvedMembers.map(({ record }) => record),
    memberSummaries: resolvedMembers.map(({ memberSummary }) => memberSummary),
  };
}


export function buildGroupActivationRecord(normalized, resolved, options = {}) {
  const observedAt = normalizeObservedAt(options.observedAt);
  const orderedCanonicalIds = normalized.members.map((member) => member.canonicalId);
  const fingerprint = createGroupFingerprint(normalized, orderedCanonicalIds);
  const multipassId = `mp_group_${normalized.subjectType}_${fingerprint}`;
  const slug = `${truncateSlugBase(normalized.baseSlug)}-${fingerprint}`;
  const sourceCanonicalId = `${GROUP_SOURCE_TYPE}:${normalized.subjectType}:${normalized.baseSlug}:${orderedCanonicalIds.join(',')}`;
  const memberSummaries = normalizeMemberSummaries(normalized, resolved);
  const memberStandardRefs = collectMemberStandardRefs(resolved, memberSummaries, observedAt);
  const standardsProfileId = `sp_group_${normalized.subjectType}_${fingerprint}`;
  const fragments = createGroupFragments({
    normalized,
    memberSummaries,
    memberStandardRefs,
    multipassId,
    sourceCanonicalId,
    fingerprint,
    slug,
    observedAt,
  }).map(assertIdentityFragment);
  const credScores = memberSummaries
    .map((member) => normalizeCredScore(member.cred_score))
    .filter((score) => score !== null);

  const profile = assertMultipassProfile({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    subject_type: normalized.subjectType,
    display_name: normalized.displayName,
    slug,
    status: 'active',
    owner_summary: {
      owner_state: 'unclaimed',
      verification_status: 'none',
      visibility: 'public',
      summary: `${normalized.displayName} is an unclaimed public group Multipass built from public AgentDNA member records.`,
    },
    custody_epoch: null,
    public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({
      fragment_id,
      fragment_type,
      status,
      assurance_level,
      visibility,
      updated_at,
    })),
    cred_summary: {
      trust_state: credScores.length ? 'building' : 'none',
      attestation_count: fragments.length,
      receipt_count: 0,
      last_updated_at: observedAt,
      public_note: credScores.length
        ? truncate(`Aggregate public Cred context from ${credScores.length} resolved members. Context only; no group score is assigned.`, 500)
        : 'No public member Cred scores were available for aggregate context.',
    },
    discovery_profile: {
      summary: truncate(normalized.summary || `${normalized.displayName} is a public ${normalized.subjectType} Multipass built from resolved AgentDNA member records.`, 1000),
      tags: uniqueStrings(['helixa', 'multipass', normalized.subjectType, 'group-activation']),
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: standardsProfileId,
      supported_standard_ids: memberStandardRefs.length ? ['ERC-8004'] : [],
      last_verified_at: memberStandardRefs.length ? observedAt : null,
    },
    payment_profile: {
      accepted_assets: [],
      x402_manifest_url: null,
      paid_endpoints_enabled: false,
    },
    updated_at: observedAt,
  });

  const agentCard = assertAgentCard({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    name: normalized.displayName,
    subject_type: normalized.subjectType,
    summary: truncate(normalized.summary || `${normalized.displayName} group Multipass public metadata.`, 500),
    capabilities: [],
    message_routes: [],
    service_endpoints: [],
    x402_manifest_url: null,
    accepted_assets: [],
    trust_summary: {
      identity_status: 'pending',
      assurance_level: 'issuer_attested',
      last_updated_at: observedAt,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: truncate(normalized.sharedPolicyNote || 'Owner or delegated authority approval is required before group-level routes, tools, or paid actions.', 500),
    },
    standards_refs: memberStandardRefs.map(({ ref, member }) => ({
      standard_id: 'ERC-8004',
      support_status: ref.status ?? 'imported_unverified',
      record_id: ref.record_id ?? member.canonical_id,
    })),
    x401_manifest_url: null,
  });

  const standardsProfile = assertStandardsProfile({
    schema_version: SCHEMA_VERSION,
    standards_profile_id: standardsProfileId,
    multipass_id: multipassId,
    primary_refs: {
      group_source: sourceCanonicalId,
      member_roster: orderedCanonicalIds.join(','),
    },
    standard_refs: memberStandardRefs.map(({ ref }) => ({
      standard_id: 'ERC-8004',
      status: ref.status ?? 'imported_unverified',
      chain_id: ref.chain_id ?? CHAIN_ID,
      contract_address: ref.contract_address ?? null,
      record_id: ref.record_id ?? null,
      adapter_version: ref.adapter_version ?? '0.1.0',
      last_verified_at: ref.last_verified_at ?? observedAt,
      assurance_level: ref.assurance_level ?? 'platform_verified',
    })),
    compatibility_summary: {
      identity_bound: memberStandardRefs.length > 0,
      owner_verified: false,
      risk_checked: credScores.length > 0,
      tools_verified: false,
      work_attested: false,
      trust_updated: credScores.length > 0,
    },
    adapter_versions: memberStandardRefs.length ? { 'ERC-8004': '0.1.0' } : {},
    last_verified_at: memberStandardRefs.length ? observedAt : null,
  });

  const x402Manifest = assertX402Manifest({
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    endpoints: [],
  });
  const receipts = [];
  receipts.forEach(assertReceiptFragment);
  assertX401Manifest(deriveX401ManifestFromFragments(multipassId, fragments));

  return {
    source: {
      sourceType: GROUP_SOURCE_TYPE,
      canonicalId: sourceCanonicalId,
      tokenId: null,
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: GROUP_ACTIVATION_ORIGIN,
        originSource: GROUP_ACTIVATION_ORIGIN_SOURCE,
        sourceType: GROUP_SOURCE_TYPE,
        canonicalId: sourceCanonicalId,
        tokenId: null,
        savedAt: observedAt,
      },
      sourceSnapshot: {
        sourceType: GROUP_SOURCE_TYPE,
        subjectType: normalized.subjectType,
        displayName: normalized.displayName,
        summary: normalized.summary,
        sharedPolicyNote: normalized.sharedPolicyNote,
        fingerprint,
        memberSummaries,
      },
    },
    profile,
    fragments,
    agentCard,
    standardsProfile,
    x402Manifest,
    receipts,
    change: {
      change_id: `change_group_${normalized.subjectType}_${fingerprint}_initial_activation`,
      message: 'Group Multipass activated from public AgentDNA member records.',
      created_at: observedAt,
    },
  };
}

export async function createGroupActivationPreview(input, { activationService, observedAt } = {}) {
  const normalized = normalizeGroupActivationInput(input);
  const resolved = await resolveGroupMembers(normalized, activationService);
  const record = buildGroupActivationRecord(normalized, resolved, { observedAt });
  return { record, members: resolved.memberSummaries };
}


function createGroupFingerprint(normalized, orderedCanonicalIds) {
  return createHash('sha256')
    .update(`${normalized.subjectType}|${normalized.baseSlug}|${orderedCanonicalIds.join(',')}`)
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

function truncateSlugBase(baseSlug) {
  const maxBaseLength = PROFILE_SLUG_MAX_LENGTH - FINGERPRINT_LENGTH - 1;
  const truncated = String(baseSlug ?? 'group')
    .slice(0, maxBaseLength)
    .replace(/-+$/g, '');
  return truncated || 'group';
}

function normalizeObservedAt(value) {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GroupActivationError('invalid_group_activation', 'observedAt must be a valid date-time.', 400, {
      field: 'observedAt',
    });
  }
  return date.toISOString();
}

function normalizeMemberSummaries(normalized, resolved) {
  const summaries = Array.isArray(resolved?.memberSummaries) ? resolved.memberSummaries : [];
  if (summaries.length === normalized.members.length) {
    return summaries.map((summary, index) => normalizeMemberSummary(summary, normalized.members[index]));
  }

  const records = Array.isArray(resolved?.records) ? resolved.records : [];
  return normalized.members.map((member, index) => createMemberSummary(member, records[index]));
}

function normalizeMemberSummary(summary, member) {
  return {
    name: firstNonEmptyString(summary?.name) ?? `AgentDNA ${member.tokenId}`,
    token_id: member.tokenId,
    canonical_id: member.canonicalId,
    cred_score: normalizeCredScore(summary?.cred_score),
    cred_tier: firstNonEmptyString(summary?.cred_tier) ?? null,
    source_status: firstNonEmptyString(summary?.source_status) ?? 'resolved',
    profile_url: firstNonEmptyString(summary?.profile_url) ?? null,
  };
}

function collectMemberStandardRefs(resolved, memberSummaries, observedAt) {
  const records = Array.isArray(resolved?.records) ? resolved.records : [];
  const refs = [];
  for (const [index, record] of records.entries()) {
    const member = memberSummaries[index];
    if (!member) continue;
    const ref = extractErc8004Ref(record, observedAt);
    if (!ref) continue;
    refs.push({ member, ref });
  }
  return refs;
}

function extractErc8004Ref(record, observedAt) {
  const refs = Array.isArray(record?.standardsProfile?.standard_refs) ? record.standardsProfile.standard_refs : [];
  const direct = refs.find((ref) => ref?.standard_id === 'ERC-8004' && ref?.record_id);
  if (direct) {
    return normalizeErc8004StandardRef(direct, observedAt);
  }

  const snapshotRefs = Array.isArray(record?.sourceContext?.sourceSnapshot?.erc8004Identities)
    ? record.sourceContext.sourceSnapshot.erc8004Identities
    : [];
  const snapshot = snapshotRefs.find((ref) => ref?.canonicalId || ref?.record_id);
  if (snapshot) {
    return normalizeErc8004StandardRef({
      standard_id: 'ERC-8004',
      status: snapshot.status ?? 'active',
      chain_id: snapshot.chainId ?? snapshot.chain_id ?? CHAIN_ID,
      contract_address: snapshot.registryAddress ?? snapshot.contract_address ?? null,
      record_id: snapshot.canonicalId ?? snapshot.record_id,
      adapter_version: snapshot.adapterVersion ?? snapshot.adapter_version ?? '0.1.0',
      last_verified_at: snapshot.lastVerifiedAt ?? snapshot.last_verified_at ?? observedAt,
      assurance_level: snapshot.assuranceLevel ?? snapshot.assurance_level ?? 'onchain_verified',
    }, observedAt);
  }

  return null;
}

function normalizeErc8004StandardRef(ref, observedAt) {
  const recordId = firstNonEmptyString(ref.record_id, ref.recordId, ref.canonicalId);
  if (!recordId) return null;
  return {
    standard_id: 'ERC-8004',
    status: normalizeStandardStatus(ref.status),
    chain_id: normalizeChainId(ref.chain_id ?? ref.chainId),
    contract_address: firstNonEmptyString(ref.contract_address, ref.contractAddress, ref.registryAddress) ?? null,
    record_id: recordId,
    adapter_version: firstNonEmptyString(ref.adapter_version, ref.adapterVersion) ?? '0.1.0',
    last_verified_at: normalizeNullableObservedAt(ref.last_verified_at ?? ref.lastVerifiedAt, observedAt),
    assurance_level: normalizeAssuranceLevel(ref.assurance_level ?? ref.assuranceLevel),
  };
}

function normalizeStandardStatus(value) {
  const normalized = String(value ?? '').trim();
  const allowed = new Set(['active', 'adapter_ready', 'pending', 'stale', 'disputed', 'revoked', 'unsupported', 'imported_unverified']);
  return allowed.has(normalized) ? normalized : 'imported_unverified';
}

function normalizeFragmentStatusFromStandard(status) {
  return status === 'active' || status === 'adapter_ready' ? 'verified' : 'pending';
}

function normalizeChainId(value) {
  const chainId = Number(value ?? CHAIN_ID);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : CHAIN_ID;
}

function normalizeNullableObservedAt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeAssuranceLevel(value) {
  const normalized = String(value ?? '').trim();
  const allowed = new Set(['unverified', 'self_attested', 'platform_verified', 'cryptographic', 'issuer_attested', 'onchain_verified']);
  return allowed.has(normalized) ? normalized : 'platform_verified';
}

function createGroupFragments({ normalized, memberSummaries, memberStandardRefs, multipassId, sourceCanonicalId, fingerprint, slug, observedAt }) {
  const fragments = [
    createGroupFragment({
      fragment_id: `frag_group_${safeKey(normalized.subjectType)}_${fingerprint}_roster`,
      multipass_id: multipassId,
      fragment_type: 'custody_record',
      status: 'verified',
      assurance_level: 'platform_verified',
      transfer_policy: 'pause_on_transfer',
      source_type: 'registry_import',
      source_id: sourceCanonicalId,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: `https://helixa.xyz/multipass/${slug}`,
      public_value: createRosterPublicValue(memberSummaries),
      proof_reference: sourceCanonicalId,
    }),
    createGroupFragment({
      fragment_id: `frag_group_${safeKey(normalized.subjectType)}_${fingerprint}_policy`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'pending',
      assurance_level: 'self_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'owner_submission',
      source_id: `${sourceCanonicalId}:shared_policy`,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: `https://helixa.xyz/multipass/${slug}`,
      public_value: truncate(normalized.sharedPolicyNote || 'Owner approval required for shared routes and public tool policy changes.', 1000),
      proof_reference: `${sourceCanonicalId}:shared_policy`,
      endpoint_ref: {
        endpoint_id: 'group_shared_policy',
        url: `https://api.helixa.xyz/api/multipass/${slug}`,
        protocol: 'api',
      },
    }),
    createGroupFragment({
      fragment_id: `frag_group_${safeKey(normalized.subjectType)}_${fingerprint}_cred`,
      multipass_id: multipassId,
      fragment_type: 'risk_summary',
      status: memberSummaries.some((member) => normalizeCredScore(member.cred_score) !== null) ? 'verified' : 'pending',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'platform_check',
      source_id: `${sourceCanonicalId}:aggregate_cred`,
      issuer: 'Helixa',
      observed_at: observedAt,
      reference_url: `https://helixa.xyz/multipass/${slug}`,
      public_value: createAggregateCredPublicValue(memberSummaries),
      proof_reference: `${sourceCanonicalId}:aggregate_cred`,
    }),
  ];

  for (const { member, ref } of memberStandardRefs) {
    fragments.push(createGroupFragment({
      fragment_id: `frag_group_${safeKey(normalized.subjectType)}_${fingerprint}_erc8004_${safeKey(member.token_id)}`,
      multipass_id: multipassId,
      fragment_type: 'standard_ref',
      status: normalizeFragmentStatusFromStandard(ref.status),
      assurance_level: ref.assurance_level,
      transfer_policy: 'reverify_on_transfer',
      source_type: ref.contract_address ? 'contract_read' : 'registry_import',
      source_id: ref.record_id,
      issuer: 'ERC-8004 Identity Registry',
      observed_at: observedAt,
      reference_url: createErc8004ReferenceUrl(ref),
      public_value: truncate(`Member ${member.name} publishes ERC-8004 reference ${ref.record_id}.`, 1000),
      proof_reference: ref.record_id,
    }));
  }

  fragments.push(createGroupFragment({
    fragment_id: `frag_group_${safeKey(normalized.subjectType)}_${fingerprint}_x401`,
    multipass_id: multipassId,
    fragment_type: 'verification_result',
    status: 'pending',
    assurance_level: 'issuer_attested',
    transfer_policy: 'never_transfer',
    source_type: 'issuer_attestation',
    source_id: `x401:helixa:group_authority:${fingerprint}`,
    issuer: 'Helixa',
    observed_at: observedAt,
    reference_url: 'https://www.proof.com/x401',
    public_value: truncate('Satisfy owner or delegated-authority proof before group-level high-trust or paid action. Public x401 metadata only; private credential material is not exposed.', 1000),
    proof_reference: `x401:helixa:group_authority:${fingerprint}`,
    verification_ref: {
      verification_type: 'x401_group_authority',
      result: 'inconclusive',
      issuer: 'Helixa',
      risk_level: 'medium',
      score: null,
    },
    x401_proof_ref: {
      protocol: 'x401',
      issuer_id: 'helixa',
      issuer_name: 'Helixa',
      requirement_id: 'group_authority',
      credential_format: 'openid4vp',
      claim_types: ['delegated_authority', 'group_membership'],
      scope: 'Satisfy owner or delegated-authority proof before group-level high-trust or paid action.',
      result: 'inconclusive',
      header_names: X401_HEADERS,
      required_before_payment: true,
      private_credential_state: 'not_exposed',
    },
  }));

  return fragments;
}

function createGroupFragment({
  fragment_id,
  multipass_id,
  fragment_type,
  status,
  assurance_level,
  transfer_policy,
  source_type,
  source_id,
  issuer,
  observed_at,
  reference_url,
  public_value,
  proof_reference,
  endpoint_ref,
  verification_ref,
  x401_proof_ref,
}) {
  return {
    schema_version: SCHEMA_VERSION,
    fragment_id,
    multipass_id,
    fragment_type,
    status,
    assurance_level,
    visibility: 'public',
    transfer_policy,
    source: {
      source_type,
      source_id,
      issuer,
      observed_at,
      reference_url,
    },
    public_value,
    proof_reference,
    created_at: observed_at,
    updated_at: observed_at,
    ...(status === 'verified' ? { verified_at: observed_at } : {}),
    ...(endpoint_ref ? { endpoint_ref } : {}),
    ...(verification_ref ? { verification_ref } : {}),
    ...(x401_proof_ref ? { x401_proof_ref } : {}),
  };
}

function createRosterPublicValue(memberSummaries) {
  const names = memberSummaries.map((member) => member.name);
  const shown = names.slice(0, 12).join(', ');
  const remainder = names.length > 12 ? `, and ${names.length - 12} more` : '';
  return truncate(`Roster includes ${memberSummaries.length} public AgentDNA members: ${shown}${remainder}.`, 1000);
}

function createAggregateCredPublicValue(memberSummaries) {
  const scores = memberSummaries
    .map((member) => normalizeCredScore(member.cred_score))
    .filter((score) => score !== null);
  if (!scores.length) {
    return 'No public member Cred scores were available. This fragment is context only; no group score is assigned.';
  }

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return truncate(`${scores.length} public Cred scores observed across resolved members. Average ${formatNumber(average)}, range ${formatNumber(min)}-${formatNumber(max)}. Aggregate context only; no group score is assigned.`, 1000);
}

function createErc8004ReferenceUrl(ref) {
  if (ref.contract_address && ref.record_id) {
    const tokenId = String(ref.record_id).split(':').pop();
    return `https://base.blockscout.com/token/${ref.contract_address}/instance/${tokenId}`;
  }
  return 'https://ethskills.com/';
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function safeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'group';
}

function truncate(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).replace(/\s+$/g, '') + '…';
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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX401Manifest,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import {
  buildGroupActivationRecord,
  createGroupActivationPreview,
  GroupActivationError,
  normalizeGroupActivationInput,
  resolveGroupMembers,
} from '../src/group-activation.js';
import { createSqliteSavedRecords } from '../src/saved-records.js';
import { deriveX401ManifestFromFragments } from '../src/x401-manifest.js';

const OBSERVED_AT = '2026-07-05T06:00:00.000Z';

function validPayload(overrides = {}) {
  return {
    subject_type: 'swarm',
    display_name: 'Helixa Swarm',
    summary: 'Public parent Multipass for Helixa agents.',
    member_ids: ['1', '81'],
    shared_policy_note: 'Owner approval required for shared policy changes.',
    ...overrides,
  };
}

function assertInvalid(input, expectedDetailField) {
  assert.throws(
    () => normalizeGroupActivationInput(input),
    (error) => {
      assert.ok(error instanceof GroupActivationError);
      assert.equal(error.code, 'invalid_group_activation');
      assert.equal(error.status, 400);
      if (expectedDetailField) {
        assert.equal(error.details?.field, expectedDetailField);
      }
      return true;
    },
  );
}

function fakeActivationRecord(tokenId, overrides = {}) {
  return {
    profile: overrides.profile ?? {},
    agentCard: overrides.agentCard ?? {},
    standardsProfile: overrides.standardsProfile,
    source: {
      sourceType: 'helixa_agent',
      canonicalId: `8453:${tokenId}`,
      tokenId: String(tokenId),
    },
    sourceContext: {
      sourceSnapshot: overrides.sourceSnapshot ?? {},
    },
  };
}

function fakeResolvedGroup() {
  const normalized = normalizeGroupActivationInput(validPayload({
    display_name: 'Helixa Swarm',
    member_ids: ['1', '81', '1066'],
    summary: 'Public parent Multipass for the core Helixa agent team.',
    shared_policy_note: 'Owner approval required for shared routes and public tool policy changes.',
  }));

  const records = [
    fakeActivationRecord('1', {
      profile: { display_name: 'Bendr 2.0', cred_summary: { score: 82 } },
      agentCard: { name: 'Bendr 2.0' },
      sourceSnapshot: { credTier: 'Prime', profileUrl: 'https://helixa.xyz/agent/1' },
      standardsProfile: {
        standard_refs: [erc8004Ref('8453:1', { contract_address: '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432' })],
      },
    }),
    fakeActivationRecord('81', {
      profile: { display_name: 'Quigbot', cred_summary: { score: 75 } },
      agentCard: { name: 'Quigbot' },
      sourceSnapshot: { credTier: 'Prime', profileUrl: 'https://helixa.xyz/agent/81' },
      standardsProfile: {
        standard_refs: [erc8004Ref('8453:81', { assurance_level: 'platform_verified', status: 'imported_unverified' })],
      },
    }),
    fakeActivationRecord('1066', {
      profile: { display_name: 'Helixa', cred_summary: { score: 80 } },
      agentCard: { name: 'Helixa' },
      sourceSnapshot: {
        credTier: 'Prime',
        profileUrl: 'https://helixa.xyz/agent/1066',
        erc8004Identities: [
          {
            canonicalId: '8453:1066',
            chainId: 8453,
            registryAddress: '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432',
            explorerUrl: 'https://base.blockscout.com/token/1066',
            lastVerifiedAt: OBSERVED_AT,
            assuranceLevel: 'onchain_verified',
            status: 'active',
          },
        ],
      },
    }),
  ];

  return {
    normalized,
    resolved: {
      records,
      memberSummaries: [
        {
          name: 'Bendr 2.0',
          token_id: '1',
          canonical_id: '8453:1',
          cred_score: 82,
          cred_tier: 'Prime',
          source_status: 'resolved',
          profile_url: 'https://helixa.xyz/agent/1',
        },
        {
          name: 'Quigbot',
          token_id: '81',
          canonical_id: '8453:81',
          cred_score: 75,
          cred_tier: 'Prime',
          source_status: 'resolved',
          profile_url: 'https://helixa.xyz/agent/81',
        },
        {
          name: 'Helixa',
          token_id: '1066',
          canonical_id: '8453:1066',
          cred_score: 80,
          cred_tier: 'Prime',
          source_status: 'resolved',
          profile_url: 'https://helixa.xyz/agent/1066',
        },
      ],
    },
  };
}

function erc8004Ref(recordId, overrides = {}) {
  return {
    standard_id: 'ERC-8004',
    status: overrides.status ?? 'active',
    chain_id: overrides.chain_id ?? 8453,
    contract_address: overrides.contract_address ?? null,
    record_id: recordId,
    adapter_version: overrides.adapter_version ?? '0.1.0',
    last_verified_at: overrides.last_verified_at ?? OBSERVED_AT,
    assurance_level: overrides.assurance_level ?? 'onchain_verified',
  };
}

function expectedFingerprint(normalized) {
  const canonicalIds = normalized.members.map((member) => member.canonicalId).join(',');
  return createHash('sha256')
    .update(`${normalized.subjectType}|${normalized.baseSlug}|${canonicalIds}`)
    .digest('hex')
    .slice(0, 8);
}

function fragmentByType(record, fragmentType) {
  return record.fragments.find((fragment) => fragment.fragment_type === fragmentType);
}

async function assertResolutionError(activationService, expected) {
  const normalized = normalizeGroupActivationInput(validPayload({ member_ids: ['1', '81'] }));

  await assert.rejects(
    () => resolveGroupMembers(normalized, activationService),
    (error) => {
      assert.ok(error instanceof GroupActivationError);
      assert.equal(error.code, expected.code);
      assert.equal(error.status, expected.status);
      assert.equal(error.details?.token_id, expected.tokenId);
      assert.equal(error.details?.canonical_id, expected.canonicalId);
      assert.equal(JSON.stringify(error.details).includes('stack'), false);
      return true;
    },
  );
}

test('normalizeGroupActivationInput accepts swarm and collection subjects', () => {
  assert.equal(normalizeGroupActivationInput(validPayload({ subject_type: 'swarm' })).subjectType, 'swarm');
  assert.equal(normalizeGroupActivationInput(validPayload({ subject_type: 'collection' })).subjectType, 'collection');
});

test('normalizeGroupActivationInput rejects unsupported subject types with a structured error', () => {
  assertInvalid(validPayload({ subject_type: 'agent' }), 'subject_type');
  assertInvalid(validPayload({ subject_type: 'project' }), 'subject_type');
});

test('normalizeGroupActivationInput trims text fields and derives a stable base slug', () => {
  const normalized = normalizeGroupActivationInput(validPayload({
    display_name: '  Helixa Swarm  ',
    summary: '  Public parent Multipass.  ',
    shared_policy_note: '  Approval required.  ',
  }));

  assert.equal(normalized.displayName, 'Helixa Swarm');
  assert.equal(normalized.baseSlug, 'helixa-swarm');
  assert.equal(normalized.summary, 'Public parent Multipass.');
  assert.equal(normalized.sharedPolicyNote, 'Approval required.');
});

test('normalizeGroupActivationInput enforces display name length boundaries', () => {
  assertInvalid(validPayload({ display_name: 'Hi' }), 'display_name');
  assertInvalid(validPayload({ display_name: 'x'.repeat(121) }), 'display_name');

  assert.equal(normalizeGroupActivationInput(validPayload({ display_name: 'abc' })).displayName, 'abc');
  assert.equal(normalizeGroupActivationInput(validPayload({ display_name: 'x'.repeat(120) })).displayName.length, 120);
});

test('normalizeGroupActivationInput enforces summary and shared policy note maximum lengths', () => {
  assertInvalid(validPayload({ summary: 'x'.repeat(501) }), 'summary');
  assertInvalid(validPayload({ shared_policy_note: 'x'.repeat(501) }), 'shared_policy_note');

  assert.equal(normalizeGroupActivationInput(validPayload({ summary: 'x'.repeat(500) })).summary.length, 500);
  assert.equal(normalizeGroupActivationInput(validPayload({ shared_policy_note: 'x'.repeat(500) })).sharedPolicyNote.length, 500);
});

test('normalizeGroupActivationInput reads only pinned snake_case public API keys', () => {
  const normalized = normalizeGroupActivationInput({
    subject_type: 'swarm',
    subjectType: 'collection',
    display_name: 'Snake Case Group',
    displayName: 'Camel Case Group',
    summary: 'Snake summary',
    member_ids: ['1', '81'],
    memberIds: ['1066', '1058'],
    shared_policy_note: 'Snake policy',
    sharedPolicyNote: 'Camel policy',
  });

  assert.equal(normalized.subjectType, 'swarm');
  assert.equal(normalized.displayName, 'Snake Case Group');
  assert.equal(normalized.summary, 'Snake summary');
  assert.equal(normalized.sharedPolicyNote, 'Snake policy');
  assert.deepEqual(normalized.members, [
    { tokenId: '1', canonicalId: '8453:1' },
    { tokenId: '81', canonicalId: '8453:81' },
  ]);

  assertInvalid({
    subjectType: 'swarm',
    displayName: 'Camel Only Group',
    summary: 'Camel summary',
    memberIds: ['1', '81'],
    sharedPolicyNote: 'Camel policy',
  }, 'subject_type');
});

test('normalizeGroupActivationInput parses member IDs from arrays and comma or newline strings', () => {
  assert.deepEqual(normalizeGroupActivationInput(validPayload({ member_ids: [1, '8453:81'] })).members, [
    { tokenId: '1', canonicalId: '8453:1' },
    { tokenId: '81', canonicalId: '8453:81' },
  ]);

  assert.deepEqual(normalizeGroupActivationInput(validPayload({ member_ids: '1, 8453:81\n1066' })).members, [
    { tokenId: '1', canonicalId: '8453:1' },
    { tokenId: '81', canonicalId: '8453:81' },
    { tokenId: '1066', canonicalId: '8453:1066' },
  ]);
});

test('normalizeGroupActivationInput rejects member count bounds, invalid IDs, token zero, and duplicates after canonicalization', () => {
  assertInvalid(validPayload({ member_ids: ['1'] }), 'member_ids');
  assertInvalid(validPayload({ member_ids: Array.from({ length: 25 }, (_, index) => String(index + 1)) }), 'member_ids');
  assertInvalid(validPayload({ member_ids: ['1', '8454:81'] }), 'member_ids');
  assertInvalid(validPayload({ member_ids: ['1', '01'] }), 'member_ids');
  assertInvalid(validPayload({ member_ids: ['0', '1'] }), 'member_ids');
  assertInvalid(validPayload({ member_ids: ['1', '8453:1'] }), 'member_ids');
});

test('resolveGroupMembers calls activation service with normalized token IDs and returns stable member summaries', async () => {
  const normalized = normalizeGroupActivationInput(validPayload({ member_ids: ['8453:81', '1', '1066'] }));
  const calls = [];
  const record81 = fakeActivationRecord('81', {
    profile: { display_name: 'Quigbot', cred_summary: { score: 75 } },
    agentCard: { name: 'Ignored Card Name' },
    sourceSnapshot: {
      credScore: 70,
      credTier: 'Prime',
      profileUrl: 'https://helixa.xyz/agent/81',
    },
  });
  const record1 = fakeActivationRecord('1', {
    profile: { cred_summary: null },
    agentCard: { name: 'Bendr 2.0' },
    sourceSnapshot: {
      credScore: 82,
      tier: 'Preferred',
      profile_url: 'https://helixa.xyz/agent/1',
    },
  });
  const record1066 = fakeActivationRecord('1066');
  const recordsByTokenId = new Map([
    ['81', record81],
    ['1', record1],
    ['1066', record1066],
  ]);

  const resolved = await resolveGroupMembers(normalized, async (tokenId) => {
    calls.push(tokenId);
    return recordsByTokenId.get(tokenId);
  });

  assert.deepEqual(calls, ['81', '1', '1066']);
  assert.deepEqual(resolved.records, [record81, record1, record1066]);
  assert.deepEqual(resolved.memberSummaries, [
    {
      name: 'Quigbot',
      token_id: '81',
      canonical_id: '8453:81',
      cred_score: 75,
      cred_tier: 'Prime',
      source_status: 'resolved',
      profile_url: 'https://helixa.xyz/agent/81',
    },
    {
      name: 'Bendr 2.0',
      token_id: '1',
      canonical_id: '8453:1',
      cred_score: 82,
      cred_tier: 'Preferred',
      source_status: 'resolved',
      profile_url: 'https://helixa.xyz/agent/1',
    },
    {
      name: 'AgentDNA 1066',
      token_id: '1066',
      canonical_id: '8453:1066',
      cred_score: null,
      cred_tier: null,
      source_status: 'resolved',
      profile_url: null,
    },
  ]);

  for (const summary of resolved.memberSummaries) {
    assert.deepEqual(Object.keys(summary), [
      'name',
      'token_id',
      'canonical_id',
      'cred_score',
      'cred_tier',
      'source_status',
      'profile_url',
    ]);
  }
});

test('resolveGroupMembers maps missing members to structured not found errors', async () => {
  await assertResolutionError(async (tokenId) => {
    if (tokenId === '1') return fakeActivationRecord('1');
    return null;
  }, {
    code: 'group_member_not_found',
    status: 404,
    tokenId: '81',
    canonicalId: '8453:81',
  });
});

test('resolveGroupMembers maps resolver rate limits to structured rate limit errors', async () => {
  await assertResolutionError(async (tokenId) => {
    if (tokenId === '1') return fakeActivationRecord('1');
    const error = new Error('Helixa API is rate-limiting activation requests.');
    error.status = 429;
    throw error;
  }, {
    code: 'group_member_rate_limited',
    status: 429,
    tokenId: '81',
    canonicalId: '8453:81',
  });
});

test('resolveGroupMembers maps unavailable resolver errors to structured unavailable errors', async () => {
  await assertResolutionError(async (tokenId) => {
    if (tokenId === '1') return fakeActivationRecord('1');
    const error = new Error('ECONNRESET');
    error.status = 503;
    throw error;
  }, {
    code: 'group_member_resolution_unavailable',
    status: 503,
    tokenId: '81',
    canonicalId: '8453:81',
  });
});

test('buildGroupActivationRecord builds deterministic group IDs and persistence wrapper fields', () => {
  const { normalized, resolved } = fakeResolvedGroup();
  const record = buildGroupActivationRecord(normalized, resolved, { observedAt: OBSERVED_AT });
  const fingerprint = expectedFingerprint(normalized);

  assert.equal(record.source.sourceType, 'multipass_group');
  assert.equal(record.source.canonicalId, 'multipass_group:swarm:helixa-swarm:8453:1,8453:81,8453:1066');
  assert.equal(record.source.tokenId, null);
  assert.equal(record.profile.multipass_id, `mp_group_swarm_${fingerprint}`);
  assert.equal(record.profile.slug, `helixa-swarm-${fingerprint}`);
  assert.match(record.profile.slug, /^[a-z0-9][a-z0-9-]{1,80}$/);

  assert.deepEqual(record.sourceContext.activation, {
    state: 'saved_unclaimed',
    origin: 'group_activation',
    originSource: 'multipass_group_builder',
    sourceType: 'multipass_group',
    canonicalId: record.source.canonicalId,
    tokenId: null,
    savedAt: OBSERVED_AT,
  });
  assert.deepEqual(record.sourceContext.sourceSnapshot, {
    sourceType: 'multipass_group',
    subjectType: 'swarm',
    displayName: 'Helixa Swarm',
    summary: 'Public parent Multipass for the core Helixa agent team.',
    sharedPolicyNote: 'Owner approval required for shared routes and public tool policy changes.',
    fingerprint,
    memberSummaries: resolved.memberSummaries,
  });
  assert.deepEqual(record.change, {
    change_id: `change_group_swarm_${fingerprint}_initial_activation`,
    message: 'Group Multipass activated from public AgentDNA member records.',
    created_at: OBSERVED_AT,
  });

  const renamed = normalizeGroupActivationInput(validPayload({
    display_name: 'Helixa Core Swarm',
    member_ids: ['1', '81', '1066'],
  }));
  const renamedRecord = buildGroupActivationRecord(renamed, resolved, { observedAt: OBSERVED_AT });
  assert.notEqual(renamedRecord.profile.multipass_id, record.profile.multipass_id);

  const longName = normalizeGroupActivationInput(validPayload({
    display_name: `${'A'.repeat(110)} swarm`,
    member_ids: ['1', '81', '1066'],
  }));
  const longRecord = buildGroupActivationRecord(longName, resolved, { observedAt: OBSERVED_AT });
  assert.match(longRecord.profile.slug, /^[a-z0-9][a-z0-9-]{1,80}$/);
  assert.ok(longRecord.profile.slug.length <= 81);
  assert.ok(longRecord.profile.slug.endsWith(`-${expectedFingerprint(longName)}`));
});

test('buildGroupActivationRecord output passes schemas and saves through the SQLite activated-record store', () => {
  const { normalized, resolved } = fakeResolvedGroup();
  const record = buildGroupActivationRecord(normalized, resolved, { observedAt: OBSERVED_AT });

  assertMultipassProfile(record.profile);
  record.fragments.forEach(assertIdentityFragment);
  assertAgentCard(record.agentCard);
  assertStandardsProfile(record.standardsProfile);
  assertX402Manifest(record.x402Manifest);
  record.receipts.forEach(assertReceiptFragment);

  const x401Manifest = assertX401Manifest(deriveX401ManifestFromFragments(record.profile.multipass_id, record.fragments));
  assert.equal(x401Manifest.x401_supported, true);
  assert.equal(x401Manifest.trusted_issuers[0]?.issuer_id, 'helixa');
  assert.equal(x401Manifest.proof_requirements[0]?.requirement_id, 'group_authority');
  assert.equal(x401Manifest.proof_requirements[0]?.required_before_payment, true);
  assert.deepEqual(x401Manifest.proof_requirements[0]?.claim_types, ['delegated_authority', 'group_membership']);
  assert.equal(x401Manifest.route_policies[0]?.x401_required, true);
  assert.equal(x401Manifest.route_policies[0]?.x402_after_x401, true);
  assert.match(x401Manifest.route_policies[0]?.scope, /high-trust or paid action/i);

  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const saved = store.saveActivatedRecord(record);
  assert.equal(saved.created, true);
  assert.equal(saved.profile.multipass_id, record.profile.multipass_id);
  assert.equal(saved.profile.slug, record.profile.slug);
  assert.equal(store.resolveBySource('multipass_group', record.source.canonicalId).profile.multipass_id, record.profile.multipass_id);
});

test('buildGroupActivationRecord creates public roster, policy, aggregate Cred, standards, and x401 fragments', () => {
  const { normalized, resolved } = fakeResolvedGroup();
  const record = buildGroupActivationRecord(normalized, resolved, { observedAt: OBSERVED_AT });

  const roster = fragmentByType(record, 'custody_record');
  assert.equal(roster.status, 'verified');
  assert.equal(roster.assurance_level, 'platform_verified');
  assert.equal(roster.visibility, 'public');
  assert.equal(roster.transfer_policy, 'pause_on_transfer');
  assert.match(roster.public_value, /Bendr 2\.0, Quigbot, Helixa/);

  const policy = fragmentByType(record, 'endpoint');
  assert.equal(policy.status, 'pending');
  assert.equal(policy.assurance_level, 'self_attested');
  assert.equal(policy.visibility, 'public');
  assert.equal(policy.transfer_policy, 'pause_on_transfer');
  assert.equal(policy.public_value, normalized.sharedPolicyNote);
  assert.equal(policy.endpoint_ref.protocol, 'api');

  const aggregateCred = fragmentByType(record, 'risk_summary');
  assert.equal(aggregateCred.status, 'verified');
  assert.equal(aggregateCred.assurance_level, 'platform_verified');
  assert.equal(aggregateCred.visibility, 'public');
  assert.equal(aggregateCred.transfer_policy, 'reverify_on_transfer');
  assert.match(aggregateCred.public_value, /3 public Cred scores/);
  assert.doesNotMatch(aggregateCred.public_value, /payment buys|payment proves/i);

  const standardRefs = record.fragments.filter((fragment) => fragment.fragment_type === 'standard_ref');
  assert.equal(standardRefs.length, 3);
  assert.deepEqual(standardRefs.map((fragment) => fragment.proof_reference), ['8453:1', '8453:81', '8453:1066']);
  assert.ok(standardRefs.every((fragment) => fragment.visibility === 'public'));

  const x401 = fragmentByType(record, 'verification_result');
  assert.equal(x401.status, 'pending');
  assert.equal(x401.assurance_level, 'issuer_attested');
  assert.equal(x401.visibility, 'public');
  assert.ok(['never_transfer', 'reverify_on_transfer'].includes(x401.transfer_policy));
  assert.equal(x401.verification_ref.verification_type, 'x401_group_authority');
  assert.equal(x401.verification_ref.result, 'inconclusive');
  assert.equal(x401.verification_ref.issuer, 'Helixa');
  assert.equal(x401.x401_proof_ref.protocol, 'x401');
  assert.equal(x401.x401_proof_ref.issuer_id, 'helixa');
  assert.equal(x401.x401_proof_ref.issuer_name, 'Helixa');
  assert.equal(x401.x401_proof_ref.requirement_id, 'group_authority');
  assert.equal(x401.x401_proof_ref.credential_format, 'openid4vp');
  assert.deepEqual(x401.x401_proof_ref.claim_types, ['delegated_authority', 'group_membership']);
  assert.equal(x401.x401_proof_ref.result, 'inconclusive');
  assert.deepEqual(x401.x401_proof_ref.header_names, {
    request: 'PROOF-REQUEST',
    response: 'PROOF-RESPONSE',
    result: 'PROOF-RESULT',
  });
  assert.equal(x401.x401_proof_ref.required_before_payment, true);
  assert.equal(x401.x401_proof_ref.private_credential_state, 'not_exposed');
});

test('buildGroupActivationRecord creates approval-required group card, standards profile, empty x402, and safe profile summary', () => {
  const { normalized, resolved } = fakeResolvedGroup();
  const record = buildGroupActivationRecord(normalized, resolved, { observedAt: OBSERVED_AT });

  assert.equal(record.profile.subject_type, 'swarm');
  assert.equal(record.profile.status, 'active');
  assert.equal(record.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(record.profile.owner_summary.verification_status, 'none');
  assert.equal(record.profile.owner_summary.visibility, 'public');
  assert.equal(record.profile.payment_profile.paid_endpoints_enabled, false);
  assert.equal(record.profile.cred_summary.trust_state, 'building');
  assert.match(record.profile.cred_summary.public_note, /aggregate public Cred context/i);
  assert.doesNotMatch(record.profile.cred_summary.public_note, /new trust score|payment proves/i);

  assert.equal(record.agentCard.subject_type, normalized.subjectType);
  assert.equal(record.agentCard.contact_policy.mode, 'approval_required');
  assert.equal(record.agentCard.contact_policy.requires_owner_approval, true);
  assert.deepEqual(record.agentCard.accepted_assets, []);
  assert.equal(record.agentCard.x402_manifest_url, null);
  assert.deepEqual(record.agentCard.capabilities, []);
  assert.deepEqual(record.agentCard.message_routes, []);

  assert.equal(record.standardsProfile.primary_refs.group_source, record.source.canonicalId);
  assert.equal(record.standardsProfile.standard_refs.length, 3);
  assert.ok(record.standardsProfile.standard_refs.every((ref) => ref.standard_id === 'ERC-8004'));
  assert.equal(record.standardsProfile.compatibility_summary.identity_bound, true);
  assert.equal(record.standardsProfile.compatibility_summary.owner_verified, false);
  assert.equal(record.standardsProfile.compatibility_summary.tools_verified, false);
  assert.equal(record.standardsProfile.compatibility_summary.work_attested, false);

  assert.deepEqual(record.x402Manifest, {
    schema_version: '0.1.0',
    multipass_id: record.profile.multipass_id,
    endpoints: [],
  });
  assert.deepEqual(record.receipts, []);
});

test('createGroupActivationPreview builds a record and returns stable member summaries', async () => {
  const { resolved } = fakeResolvedGroup();
  const recordsByToken = new Map(resolved.records.map((record) => [record.source.tokenId, record]));
  const calls = [];

  const preview = await createGroupActivationPreview(validPayload({ member_ids: '1,81\n1066' }), {
    observedAt: OBSERVED_AT,
    activationService: async (tokenId) => {
      calls.push(tokenId);
      return recordsByToken.get(tokenId);
    },
  });

  assert.deepEqual(calls, ['1', '81', '1066']);
  assert.equal(preview.record.source.sourceType, 'multipass_group');
  assert.equal(preview.record.sourceContext.activation.origin, 'group_activation');
  assert.deepEqual(preview.members, resolved.memberSummaries);
  assert.deepEqual(preview.record.sourceContext.sourceSnapshot.memberSummaries, resolved.memberSummaries);
  assert.equal(preview.record.profile.multipass_id, `mp_group_swarm_${expectedFingerprint(normalizeGroupActivationInput(validPayload({ member_ids: '1,81\n1066' })))}`);
});

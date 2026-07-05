import assert from 'node:assert/strict';
import test from 'node:test';

import { GroupActivationError, normalizeGroupActivationInput, resolveGroupMembers } from '../src/group-activation.js';

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

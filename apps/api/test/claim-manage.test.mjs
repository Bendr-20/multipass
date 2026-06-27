import assert from 'node:assert/strict';
import test from 'node:test';

import { createSqliteSavedRecords } from '../src/saved-records.js';

const NOW = '2026-06-26T23:45:00.000Z';
const OWNER = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const MANAGER = '0x339559A2d1CD15059365FC7bD36b3047BbA480E0';

function makeSavedRecord(overrides = {}) {
  return {
    source: {
      sourceType: 'helixa_agent',
      canonicalId: overrides.canonicalId ?? '8453:1',
      tokenId: overrides.tokenId ?? '1',
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: 'live_agent_record',
        originSource: 'trusted_resolver_metadata',
        sourceType: 'helixa_agent',
        canonicalId: overrides.canonicalId ?? '8453:1',
        tokenId: overrides.tokenId ?? '1',
        savedAt: NOW,
      },
      sourceSnapshot: {
        name: overrides.displayName ?? 'Bendr 2.0',
        tokenId: overrides.tokenId ?? '1',
        owner: overrides.owner ?? OWNER,
        summary: 'Original live summary.',
      },
    },
    profile: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      subject_type: 'agent',
      display_name: overrides.displayName ?? 'Bendr 2.0',
      slug: overrides.slug ?? 'bendr-2-1',
      status: 'active',
      owner_summary: {
        owner_state: 'unclaimed',
        verification_status: 'none',
        visibility: 'public',
        summary: 'Management is not claimed.',
      },
      custody_epoch: null,
      public_fragments: [],
      cred_summary: { trust_state: 'none', attestation_count: 0, receipt_count: 0, last_updated_at: NOW },
      discovery_profile: { summary: 'Saved from a public live source record.', tags: ['helixa'], avatar_url: null, visibility: 'public' },
      standards_profile: { standards_profile_id: 'sp_helixa_agent_1', supported_standard_ids: ['ERC-8004'], last_verified_at: null },
      payment_profile: { accepted_assets: [], x402_manifest_url: null, paid_endpoints_enabled: false },
      updated_at: NOW,
    },
    fragments: [],
    agentCard: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      name: overrides.displayName ?? 'Bendr 2.0',
      subject_type: 'agent',
      capabilities: [],
      message_routes: [],
      service_endpoints: [],
      x402_manifest_url: null,
      accepted_assets: [],
      trust_summary: { identity_status: 'unverified', assurance_level: 'unverified', last_updated_at: null },
      rate_limits: { requests: 0, window_seconds: 60 },
      contact_policy: { mode: 'approval_required', requires_owner_approval: true },
      standards_refs: [],
    },
    standardsProfile: {
      schema_version: '0.1.0',
      standards_profile_id: 'sp_helixa_agent_1',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      primary_refs: {},
      standard_refs: [],
      compatibility_summary: {
        identity_bound: false,
        owner_verified: false,
        risk_checked: false,
        tools_verified: false,
        work_attested: false,
        trust_updated: false,
      },
      adapter_versions: {},
      last_verified_at: null,
    },
    x402Manifest: { schema_version: '0.1.0', multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1', endpoints: [] },
    receipts: [],
    change: { change_id: 'change_initial_save', message: 'Multipass saved from live public source record.', created_at: NOW },
  };
}

function makeStore() {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord());
  return store;
}

test('claim nonce message binds Multipass id source domain expiry and safe warning', () => {
  const store = makeStore();
  const nonce = store.createClaimNonce('bendr-2-1', {
    domain: 'helixa.xyz',
    now: NOW,
    ttlMs: 10 * 60 * 1000,
  });

  assert.equal(nonce.multipass_id, 'mp_helixa_agent_1');
  assert.equal(nonce.source_canonical_id, '8453:1');
  assert.match(nonce.nonce, /^[a-f0-9]{32,}$/);
  assert.match(nonce.message, /Multipass ID: mp_helixa_agent_1/);
  assert.match(nonce.message, /Source canonical ID: 8453:1/);
  assert.match(nonce.message, /Domain: helixa\.xyz/);
  assert.match(nonce.message, /does not transfer funds, assets, tools, credentials, or ownership/i);

  const consumed = store.consumeClaimNonce(nonce.nonce, { multipassId: 'mp_helixa_agent_1', now: '2026-06-26T23:46:00.000Z' });
  assert.equal(consumed.message, nonce.message);
  assert.throws(() => store.consumeClaimNonce(nonce.nonce, { multipassId: 'mp_helixa_agent_1', now: '2026-06-26T23:47:00.000Z' }), /already used/);
});

test('expired claim nonce cannot be consumed', () => {
  const store = makeStore();
  const nonce = store.createClaimNonce('mp_helixa_agent_1', { domain: 'helixa.xyz', now: NOW, ttlMs: 1000 });
  assert.throws(
    () => store.consumeClaimNonce(nonce.nonce, { multipassId: 'mp_helixa_agent_1', now: '2026-06-26T23:45:02.000Z' }),
    /expired/,
  );
});

test('manual review request marks claim pending without creating edit access', () => {
  const store = makeStore();
  const request = store.createManualReviewRequest('bendr-2-1', {
    proposedManagerWallet: MANAGER,
    contactRoute: 'x.com/jimtheape',
    note: 'Team operator requesting public profile management.',
    now: NOW,
  });

  assert.equal(request.status, 'pending_review');
  assert.equal(request.proposed_manager_wallet, MANAGER.toLowerCase());
  assert.equal(store.getClaimState('mp_helixa_agent_1').status, 'claim_pending');
  assert.equal(store.resolveProfile('bendr-2-1').owner_summary.verification_status, 'pending');
  assert.equal(store.resolveProfile('bendr-2-1').owner_summary.owner_state, 'claimed');
  assert.equal(store.findApprovedManagerClaim('mp_helixa_agent_1', MANAGER), null);
  assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Management claim requested/);
});

test('admin approval keeps review-approved claim distinct from owner wallet verification', () => {
  const store = makeStore();
  const request = store.createManualReviewRequest('mp_helixa_agent_1', {
    proposedManagerWallet: MANAGER,
    contactRoute: 'agentmail:team@example.test',
    note: 'Manual review path.',
    now: NOW,
  });

  const approval = store.approveManualReviewClaim('mp_helixa_agent_1', request.claim_id, {
    admin: 'operator',
    now: '2026-06-26T23:50:00.000Z',
  });

  assert.equal(approval.status, 'approved');
  assert.equal(store.getClaimState('mp_helixa_agent_1').status, 'claimed_review_approved');
  const profile = store.resolveProfile('bendr-2-1');
  assert.equal(profile.owner_summary.owner_state, 'claimed');
  assert.equal(profile.owner_summary.verification_status, 'verified');
  assert.match(profile.owner_summary.summary, /review-approved/i);
  assert.doesNotMatch(profile.owner_summary.summary, /owner-wallet verified/i);
  assert.equal(store.findApprovedManagerClaim('mp_helixa_agent_1', MANAGER).claim_id, request.claim_id);
});

test('owner wallet verification stays authoritative over later manual review approval', () => {
  const store = makeStore();
  const request = store.createManualReviewRequest('mp_helixa_agent_1', {
    proposedManagerWallet: MANAGER,
    contactRoute: 'agentmail:team@example.test',
    note: 'Manual review path.',
    now: NOW,
  });

  store.markOwnerWalletVerified('mp_helixa_agent_1', {
    managerWallet: OWNER,
    now: '2026-06-26T23:46:00.000Z',
  });
  store.approveManualReviewClaim('mp_helixa_agent_1', request.claim_id, {
    admin: 'operator',
    now: '2026-06-26T23:50:00.000Z',
  });

  assert.equal(store.getClaimState('mp_helixa_agent_1').status, 'claimed_verified_owner');
  const profile = store.resolveProfile('bendr-2-1');
  assert.equal(profile.owner_summary.owner_state, 'verified');
  assert.match(profile.owner_summary.summary, /owner-wallet verified/i);
  assert.equal(store.findApprovedManagerClaim('mp_helixa_agent_1', MANAGER).claim_id, request.claim_id);
});

test('manager sessions are scoped, CSRF protected, expirable, and revocable', () => {
  const store = makeStore();
  const session = store.createManagerSession('mp_helixa_agent_1', {
    managerWallet: OWNER,
    claimStatus: 'claimed_verified_owner',
    now: NOW,
    ttlMs: 60 * 60 * 1000,
  });

  const valid = store.validateManagerSession({
    sessionId: session.sessionId,
    multipassId: 'mp_helixa_agent_1',
    csrfToken: session.csrfToken,
    now: '2026-06-27T00:00:00.000Z',
  });
  assert.equal(valid.manager_wallet, OWNER.toLowerCase());
  assert.equal(valid.claim_status, 'claimed_verified_owner');

  assert.throws(() => store.validateManagerSession({ sessionId: session.sessionId, multipassId: 'mp_other', csrfToken: session.csrfToken, now: NOW }), /scoped/);
  assert.throws(() => store.validateManagerSession({ sessionId: session.sessionId, multipassId: 'mp_helixa_agent_1', csrfToken: 'bad', now: NOW }), /CSRF/);
  assert.throws(() => store.validateManagerSession({ sessionId: session.sessionId, multipassId: 'mp_helixa_agent_1', csrfToken: session.csrfToken, now: '2026-06-27T01:00:01.000Z' }), /expired/);

  const second = store.createManagerSession('mp_helixa_agent_1', { managerWallet: OWNER, claimStatus: 'claimed_verified_owner', now: NOW });
  store.revokeManagerSession(second.sessionId, { now: '2026-06-26T23:55:00.000Z' });
  assert.throws(() => store.validateManagerSession({ sessionId: second.sessionId, multipassId: 'mp_helixa_agent_1', csrfToken: second.csrfToken, now: NOW }), /revoked/);
});

test('manager public profile edits are allowlisted and logged', () => {
  const store = makeStore();
  const updated = store.updatePublicProfile('bendr-2-1', {
    display_name: 'Bendr Prime',
    summary: 'Public profile summary managed through Multipass.',
    avatar_url: 'https://assets.example.test/bendr.png',
    tags: ['helixa', 'operator', 'agent'],
  }, {
    actorWallet: OWNER,
    now: '2026-06-27T00:05:00.000Z',
  });

  assert.deepEqual(updated.changedFields, ['display_name', 'summary', 'avatar_url', 'tags']);
  const profile = store.resolveProfile('mp_helixa_agent_1');
  assert.equal(profile.display_name, 'Bendr Prime');
  assert.equal(profile.discovery_profile.summary, 'Public profile summary managed through Multipass.');
  assert.equal(profile.discovery_profile.avatar_url, 'https://assets.example.test/bendr.png');
  assert.deepEqual(profile.discovery_profile.tags, ['helixa', 'operator', 'agent']);
  assert.equal(store.getAgentCard('mp_helixa_agent_1').name, 'Bendr Prime');
  assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Public profile updated/);

  assert.throws(
    () => store.updatePublicProfile('mp_helixa_agent_1', { cred_summary: { trust_state: 'established' } }, { actorWallet: OWNER, now: NOW }),
    /not editable/,
  );
  assert.throws(
    () => store.updatePublicProfile('mp_helixa_agent_1', { avatar_url: 'javascript:alert(1)' }, { actorWallet: OWNER, now: NOW }),
    /avatar_url/,
  );
});

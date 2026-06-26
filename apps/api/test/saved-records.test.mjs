import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSqliteSavedRecords } from '../src/saved-records.js';

function makeSavedRecord(overrides = {}) {
  const now = '2026-06-26T20:00:00.000Z';
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
        savedAt: now,
      },
      sourceSnapshot: {
        name: overrides.displayName ?? 'Bendr 2.0',
        tokenId: overrides.tokenId ?? '1',
        owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        privateKey: 'must-not-persist',
        socials: {
          x: 'BendrAI_eth',
          auth: 'must-not-persist',
          bearerToken: 'must-not-persist',
          secret: 'must-not-persist',
          password: 'must-not-persist',
          credential: 'must-not-persist',
          accessToken: 'must-not-persist',
        },
      },
    },
    profile: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      subject_type: 'agent',
      display_name: overrides.displayName ?? 'Bendr 2.0',
      slug: overrides.slug ?? 'bendr-2',
      status: 'active',
      owner_summary: { owner_state: 'unclaimed', verification_status: 'none', visibility: 'public' },
      custody_epoch: null,
      public_fragments: [],
      cred_summary: { trust_state: 'none', attestation_count: 0, receipt_count: 0, last_updated_at: now },
      discovery_profile: { summary: 'Saved from a public live source record.', tags: ['helixa'], visibility: 'public' },
      standards_profile: { standards_profile_id: 'sp_helixa_agent_1', supported_standard_ids: ['ERC-8004'], last_verified_at: null },
      payment_profile: { accepted_assets: [], x402_manifest_url: null, paid_endpoints_enabled: false },
      updated_at: now,
    },
    fragments: [
      {
        schema_version: '0.1.0',
        fragment_id: 'saved_public_wallet',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        fragment_type: 'wallet',
        status: 'pending',
        assurance_level: 'self_attested',
        visibility: 'public',
        transfer_policy: 'reverify_on_transfer',
        source: { source_type: 'registry_import', source_id: '8453:1', issuer: null, observed_at: now },
        created_at: now,
        updated_at: now,
      },
      {
        schema_version: '0.1.0',
        fragment_id: 'saved_private_note',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        fragment_type: 'attestation',
        status: 'pending',
        assurance_level: 'self_attested',
        visibility: 'private',
        transfer_policy: 'never_transfer',
        source: { source_type: 'owner_submission', source_id: 'private', issuer: null, observed_at: now },
        created_at: now,
        updated_at: now,
      },
    ],
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
    x402Manifest: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      endpoints: [],
    },
    receipts: [
      {
        schema_version: '0.1.0',
        receipt_id: 'saved_receipt_1',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        endpoint_id: 'save',
        provider: 'partner',
        amount: '0',
        asset: 'CRED',
        chain_id: 8453,
        status: 'settled',
        created_at: now,
        response_class: 'success',
      },
    ],
    change: {
      change_id: 'change_initial_save',
      message: 'Multipass saved from live public source record.',
      created_at: now,
    },
  };
}

test('createSqliteSavedRecords saves and resolves by id slug and source', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const saved = store.saveActivatedRecord(makeSavedRecord());

  assert.equal(saved.created, true);
  assert.equal(saved.profile.multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.resolveProfile('mp_helixa_agent_1').slug, 'bendr-2');
  assert.equal(store.resolveProfile('bendr-2').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.resolveBySource('helixa_agent', '8453:1').profile.slug, 'bendr-2');
  assert.equal(store.getChangeLog('mp_helixa_agent_1').entries.length, 1);
});


test('saved repository returns public document bundle and sanitized source context', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord());

  assert.equal(store.getAgentCard('mp_helixa_agent_1').name, 'Bendr 2.0');
  assert.deepEqual(store.getPublicFragments('mp_helixa_agent_1').map((fragment) => fragment.fragment_id), ['saved_public_wallet']);
  assert.equal(store.getStandardsProfile('mp_helixa_agent_1').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.getX402Manifest('mp_helixa_agent_1').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.getReceiptFragment('mp_helixa_agent_1', 'saved_receipt_1').receipt_id, 'saved_receipt_1');
  assert.equal(store.getReceiptFragment('mp_helixa_agent_1', 'missing'), null);
  const sourceContext = store.getSourceContext('mp_helixa_agent_1');
  assert.equal(sourceContext.activation.canonicalId, '8453:1');
  assert.equal(sourceContext.sourceSnapshot.owner, '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal(sourceContext.sourceSnapshot.tokenId, '1');
  assert.equal(sourceContext.sourceSnapshot.socials.x, 'BendrAI_eth');
  assert.equal('auth' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('bearerToken' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('secret' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('password' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('credential' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('accessToken' in sourceContext.sourceSnapshot.socials, false);
  assert.equal('privateKey' in sourceContext.sourceSnapshot, false);
});

test('saveActivatedRecord validates source and change metadata', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), source: { sourceType: '', canonicalId: '8453:1' } }), /sourceType/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), source: { sourceType: 'helixa_agent', canonicalId: '' } }), /canonicalId/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), sourceContext: { sourceSnapshot: {} } }), /sourceContext\.activation/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), sourceContext: { activation: {} } }), /sourceContext\.sourceSnapshot/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), change: null }), /change/);
});

test('saveActivatedRecord rejects bundle documents for another Multipass', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecord();
  record.agentCard = { ...record.agentCard, multipass_id: 'mp_other' };
  assert.throws(() => store.saveActivatedRecord(record), /agentCard\.multipass_id/);
});

test('saveActivatedRecord is idempotent by source canonical id', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const first = store.saveActivatedRecord(makeSavedRecord());
  const second = store.saveActivatedRecord(makeSavedRecord({ displayName: 'Renamed later' }));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.profile.display_name, 'Bendr 2.0');
  assert.equal(store.getChangeLog('mp_helixa_agent_1').entries.length, 1);
});

test('file-backed store persists after reopening', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-saved-'));
  const databasePath = path.join(dir, 'multipass.sqlite');
  try {
    const first = createSqliteSavedRecords({ databasePath });
    first.saveActivatedRecord(makeSavedRecord());
    first.close();
    const reopened = createSqliteSavedRecords({ databasePath });
    assert.equal(reopened.resolveProfile('bendr-2').multipass_id, 'mp_helixa_agent_1');
    reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

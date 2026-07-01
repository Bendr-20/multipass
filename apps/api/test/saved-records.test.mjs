import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSqliteSavedRecords } from '../src/saved-records.js';

const NOW = '2026-06-26T20:00:00.000Z';

function makeSavedRecord(overrides = {}) {
  const now = NOW;
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

function makeToolFragment(overrides = {}, refOverrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: overrides.fragment_id ?? 'saved_tool_lookup',
    multipass_id: overrides.multipass_id ?? 'mp_helixa_agent_1',
    fragment_type: overrides.fragment_type ?? 'tool_manifest',
    status: overrides.status ?? 'verified',
    assurance_level: overrides.assurance_level ?? 'platform_verified',
    visibility: overrides.visibility ?? 'public',
    transfer_policy: overrides.transfer_policy ?? 'pause_on_transfer',
    source: overrides.source ?? {
      source_type: 'registry_import',
      source_id: 'bankr_x402_cloud:saved-lookup',
      issuer: 'bankr_x402_cloud',
      observed_at: NOW,
    },
    tool_manifest_ref: overrides.tool_manifest_ref === undefined ? {
      tool_id: refOverrides.tool_id ?? 'saved-lookup',
      registry: refOverrides.registry ?? 'bankr_x402_cloud',
      name: refOverrides.name ?? 'Saved Lookup Tool',
      description: refOverrides.description ?? 'Looks up saved Multipass state.',
      endpoint_url: refOverrides.endpoint_url ?? 'https://api.example.test/tools/saved-lookup',
      manifest_url: refOverrides.manifest_url ?? 'https://api.example.test/tools/saved-lookup/manifest.json',
      manifest_hash: refOverrides.manifest_hash ?? 'sha256:savedlookup',
      creator_address: refOverrides.creator_address ?? '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
      pricing: refOverrides.pricing ?? {
        model: 'fixed',
        amount: '0.05',
        asset: 'USDC',
        chain_id: 8453,
      },
      access: refOverrides.access ?? {
        summary: 'Public x402 access.',
        requires_owner_approval: false,
      },
      schemas: refOverrides.schemas ?? {
        input_summary: 'Multipass id or slug.',
        output_summary: 'Saved Multipass data.',
      },
      verifiability: refOverrides.verifiability ?? {
        tier: 'provider_verified',
        summary: 'Imported from Bankr x402 Cloud.',
      },
      last_checked_at: refOverrides.last_checked_at ?? NOW,
    } : overrides.tool_manifest_ref,
    created_at: overrides.created_at ?? NOW,
    updated_at: overrides.updated_at ?? NOW,
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

test('saved repository returns public tools and derives x402 and agent-card from active tools', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecord();
  record.fragments = [
    ...record.fragments,
    makeToolFragment(),
    makeToolFragment(
      { fragment_id: 'saved_hidden_tool', visibility: 'hidden' },
      {
        tool_id: 'hidden-lookup',
        name: 'Hidden Lookup Tool',
        endpoint_url: 'https://api.example.test/tools/hidden-lookup',
        manifest_url: 'https://api.example.test/tools/hidden-lookup/manifest.json',
      },
    ),
  ];
  store.saveActivatedRecord(record);

  const tools = store.getTools('mp_helixa_agent_1');
  assert.equal(tools.schema_version, '0.1.0');
  assert.equal(tools.multipass_id, 'mp_helixa_agent_1');
  assert.deepEqual(tools.tools.map((tool) => tool.tool_id), ['saved-lookup']);

  const x402 = store.getX402Manifest('mp_helixa_agent_1');
  assert.deepEqual(x402.endpoints.map((endpoint) => endpoint.endpoint_id), ['saved-lookup']);
  assert.equal(x402.endpoints[0].url, 'https://api.example.test/tools/saved-lookup');

  const card = store.getAgentCard('mp_helixa_agent_1', { baseUrl: 'https://multipass.example.test/' });
  assert.equal(card.x402_manifest_url, 'https://multipass.example.test/api/multipass/mp_helixa_agent_1/x402');
  assert.deepEqual(card.service_endpoints.map((endpoint) => endpoint.endpoint_id), ['saved-lookup']);
});

test('saved repository falls back to persisted x402 and agent-card without public active tools', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecord();
  record.agentCard = {
    ...record.agentCard,
    service_endpoints: [
      {
        endpoint_id: 'authored-status',
        url: 'https://api.example.test/status',
        description: 'Authored status endpoint.',
        visibility: 'public',
      },
    ],
    x402_manifest_url: 'https://api.example.test/x402.json',
  };
  record.x402Manifest = {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    endpoints: [
      {
        endpoint_id: 'persisted-status',
        url: 'https://api.example.test/status',
        method: 'GET',
        description: 'Persisted status endpoint.',
        price: { amount: '1', decimals: 18 },
        asset: 'CRED',
        chain_id: 8453,
        provider: 'bankr_x402_cloud',
        settlement_reference_policy: 'provider_receipt',
        rate_limit: { requests: 10, window_seconds: 60 },
        visibility: 'public',
        requires_owner_approval: false,
      },
    ],
  };
  store.saveActivatedRecord(record);

  assert.deepEqual(store.getTools('mp_helixa_agent_1').tools, []);
  assert.deepEqual(store.getX402Manifest('mp_helixa_agent_1').endpoints.map((endpoint) => endpoint.endpoint_id), ['persisted-status']);
  const card = store.getAgentCard('mp_helixa_agent_1', { baseUrl: 'https://multipass.example.test/' });
  assert.deepEqual(card.service_endpoints.map((endpoint) => endpoint.endpoint_id), ['authored-status']);
  assert.equal(card.x402_manifest_url, 'https://api.example.test/x402.json');
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

test('importBankrTool stores Bankr x402 metadata and updates public derived documents', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord({ multipassId: 'mp_bendr_2' }));

  const imported = store.importBankrTool('mp_bendr_2', {
    source: 'bankr_x402_cloud',
    serviceName: 'cred-report',
    endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report',
    network: 'base',
    currency: 'USDC',
    service: {
      price: '1.00',
      description: 'Helixa AgentDNA cred report.',
      methods: ['GET'],
      schema: { queryParams: { id: 'number - AgentDNA token ID' }, output: { score: 'number' } },
    },
  }, { actorWallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', now: '2026-07-01T00:00:00.000Z' });

  assert.equal(imported.fragment.fragment_type, 'tool_manifest');
  assert.equal(imported.fragment.tool_manifest_ref.tool_id, 'cred-report');
  assert.deepEqual(imported.tools.tools.map((tool) => tool.tool_id), ['cred-report']);
  assert.deepEqual(store.getTools('mp_bendr_2').tools.map((tool) => tool.tool_id), ['cred-report']);
  assert.deepEqual(store.getX402Manifest('mp_bendr_2').endpoints.map((endpoint) => endpoint.endpoint_id), ['cred-report']);
  assert.equal(store.getX402Manifest('mp_bendr_2').endpoints[0].asset, 'USDC');
  assert.deepEqual(store.getAgentCard('mp_bendr_2', { baseUrl: 'https://multipass.example.test' }).service_endpoints.map((endpoint) => endpoint.endpoint_id), ['cred-report']);
  assert.equal(store.resolveProfile('mp_bendr_2').public_fragments.some((fragment) => fragment.fragment_id === imported.fragment.fragment_id), true);
  assert.equal(store.getChangeLog('mp_bendr_2').entries.at(-1).message, 'Tool service imported: cred-report.');
  assert.equal(store.getAuditEvents('mp_bendr_2').at(-1).event_type, 'tool_imported');
  assert.equal(store.getAuditEvents('mp_bendr_2').at(-1).event.actorWallet, '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea');

  assert.throws(
    () => store.importBankrTool('mp_bendr_2', {
      source: 'bankr_x402_cloud',
      serviceName: 'cred-report',
      endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report',
      network: 'base',
      currency: 'USDC',
      service: { price: '1.00', description: 'Duplicate cred report.' },
    }, { actorWallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' }),
    /tool_id.*already exists|already imported/i,
  );
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

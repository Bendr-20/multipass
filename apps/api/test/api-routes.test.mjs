import assert from 'node:assert/strict';
import test from 'node:test';

import { MultipassValidationError } from '@helixa/multipass-sdk';

import { buildSavedRecordFromHelixaAgent } from '../src/activation-records.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { createSqliteSavedRecords } from '../src/saved-records.js';

const profile = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  subject_type: 'agent',
  display_name: 'Bendr 2.0',
  slug: 'bendr-2',
  status: 'draft',
  owner_summary: {
    owner_state: 'unclaimed',
    verification_status: 'none',
    visibility: 'public',
  },
  custody_epoch: null,
  public_fragments: [],
  cred_summary: {
    trust_state: 'none',
    attestation_count: 0,
    receipt_count: 0,
    last_updated_at: null,
  },
  discovery_profile: {
    summary: 'A Multipass profile used for API tests.',
    tags: ['test'],
    visibility: 'public',
  },
  standards_profile: {
    standards_profile_id: 'sp_bendr',
    supported_standard_ids: ['ERC-8004'],
    last_verified_at: null,
  },
  payment_profile: {
    accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
    x402_manifest_url: null,
    paid_endpoints_enabled: false,
  },
  updated_at: '2026-06-24T00:00:00Z',
};

const publicFragment = {
  schema_version: '0.1.0',
  fragment_id: 'frag_public_wallet',
  multipass_id: 'mp_bendr',
  fragment_type: 'wallet',
  status: 'pending',
  assurance_level: 'unverified',
  visibility: 'public',
  transfer_policy: 'reverify_on_transfer',
  source: {
    source_type: 'owner_submission',
    source_id: 'submission_1',
    issuer: null,
    observed_at: '2026-06-24T00:00:00Z',
  },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
};

const privateFragment = {
  ...publicFragment,
  fragment_id: 'frag_private_note',
  fragment_type: 'attestation',
  visibility: 'private',
};

const agentCard = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  name: 'Bendr 2.0',
  subject_type: 'agent',
  capabilities: [],
  message_routes: [],
  service_endpoints: [],
  x402_manifest_url: null,
  accepted_assets: [],
  trust_summary: {
    identity_status: 'unverified',
    assurance_level: 'unverified',
    last_updated_at: null,
  },
  rate_limits: {
    requests: 0,
    window_seconds: 60,
  },
  contact_policy: {
    mode: 'approval_required',
    requires_owner_approval: true,
  },
  standards_refs: [],
};

const standardsProfile = {
  schema_version: '0.1.0',
  standards_profile_id: 'sp_bendr',
  multipass_id: 'mp_bendr',
  primary_refs: {},
  standard_refs: [
    {
      standard_id: 'ERC-8004',
      status: 'stale',
      chain_id: 8453,
      contract_address: null,
      record_id: '1',
      adapter_version: '0.1.0',
      last_verified_at: null,
      assurance_level: 'unverified',
    },
  ],
  compatibility_summary: {
    identity_bound: false,
    owner_verified: false,
    risk_checked: false,
    tools_verified: false,
    work_attested: false,
    trust_updated: false,
  },
  adapter_versions: { 'ERC-8004': '0.1.0' },
  last_verified_at: null,
};

const x402Manifest = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  endpoints: [
    {
      endpoint_id: 'lookup',
      url: 'https://api.example.test/multipass/mp_bendr',
      method: 'GET',
      description: 'Lookup profile.',
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

const receipt = {
  schema_version: '0.1.0',
  receipt_id: 'receipt_1',
  multipass_id: 'mp_bendr',
  endpoint_id: 'lookup',
  provider: 'bankr_x402_cloud',
  amount: '1',
  asset: 'CRED',
  chain_id: 8453,
  status: 'settled',
  created_at: '2026-06-24T00:00:00Z',
  response_class: 'success',
};

function makeApi() {
  return createMultipassApi({
    store: createFixtureStore(),
    baseUrl: 'https://multipass.example.test',
  });
}

function createFixtureStore() {
  return createMemoryStore({
    profiles: [profile],
    fragments: [publicFragment, privateFragment],
    agentCards: [agentCard],
    standardsProfiles: [standardsProfile],
    x402Manifests: [x402Manifest],
    receiptFragments: [receipt],
  });
}

function makeSavedRecord() {
  return buildSavedRecordFromHelixaAgent({
    tokenId: '1',
    name: 'Bendr 2.0',
    owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    verified: true,
  }, { observedAt: '2026-06-26T20:00:00.000Z' });
}

function makeSaveApi() {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  return createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      assert.equal(input, '1');
      return makeSavedRecord();
    },
  });
}

async function requestJson(api, path) {
  const response = await api.handleRequest(new Request(`https://multipass.example.test${path}`));
  return {
    response,
    body: await response.json(),
  };
}

async function postJson(api, path, body) {
  const response = await api.handleRequest(new Request(`https://multipass.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}

test('serves canonical profile by slug or id', async () => {
  const api = makeApi();

  const bySlug = await requestJson(api, '/api/multipass/bendr-2');
  assert.equal(bySlug.response.status, 200);
  assert.equal(bySlug.response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(bySlug.body.multipass_id, 'mp_bendr');

  const byId = await requestJson(api, '/api/multipass/mp_bendr');
  assert.equal(byId.response.status, 200);
  assert.equal(byId.body.slug, 'bendr-2');
});

test('serves public fragments without leaking private fragments', async () => {
  const api = makeApi();

  const { response, body } = await requestJson(api, '/api/multipass/bendr-2/fragments');

  assert.equal(response.status, 200);
  assert.deepEqual(body.fragments.map((fragment) => fragment.fragment_id), ['frag_public_wallet']);
});

test('serves agent card, standards profile, x402 manifest, and receipt fragment', async () => {
  const api = makeApi();

  assert.equal((await requestJson(api, '/api/multipass/bendr-2/agent-card')).body.name, 'Bendr 2.0');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/standards')).body.standard_refs[0].status, 'stale');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/x402')).body.endpoints[0].provider, 'bankr_x402_cloud');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/receipts/receipt_1')).body.status, 'settled');
});

test('serves site-level discovery pointer', async () => {
  const api = makeApi();

  const { response, body } = await requestJson(api, '/.well-known/helixa-multipass.json');

  assert.equal(response.status, 200);
  assert.equal(body.schema_version, '0.1.0');
  assert.equal(body.service, 'helixa-multipass');
  assert.equal(body.routes.profile, 'https://multipass.example.test/api/multipass/{id}');
});

test('returns structured 404 errors', async () => {
  const api = makeApi();

  const { response, body } = await requestJson(api, '/api/multipass/missing');

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'not_found');
  assert.match(body.error.message, /Multipass not found/);
});

test('POST /api/multipass/activate returns preview JSON without persisting', async () => {
  const api = makeSaveApi();

  const preview = await postJson(api, '/api/multipass/activate', { agent: '1' });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.state, 'activated_unsaved');
  assert.equal(preview.body.profile.slug, 'bendr-2-1');
  assert.equal(preview.body.source.canonicalId, '8453:1');

  const savedRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(savedRead.response.status, 404);
});

test('POST /api/multipass saves idempotent persistent records', async () => {
  const api = makeSaveApi();

  const first = await postJson(api, '/api/multipass', { agent: '1' });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.created, true);
  assert.equal(first.body.state, 'saved_unclaimed');
  assert.equal(first.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(first.body.slug, 'bendr-2-1');
  assert.equal(first.body.profile.slug, 'bendr-2-1');
  assert.equal(first.body.sharePath, '/multipass/bendr-2-1');

  const second = await postJson(api, '/api/multipass', { agent: '1' });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(second.body.slug, 'bendr-2-1');
  assert.equal(second.body.sharePath, '/multipass/bendr-2-1');
});

test('GET saved profile resolves before fixture store and exposes saved documents', async () => {
  const api = makeSaveApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const profileRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(profileRead.response.status, 200);
  assert.equal(profileRead.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(profileRead.body.slug, 'bendr-2-1');

  assert.equal((await requestJson(api, '/api/multipass/bendr-2-1/card')).body.name, 'Bendr 2.0');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2-1/agent-card')).body.name, 'Bendr 2.0');
  const fragments = await requestJson(api, '/api/multipass/bendr-2-1/fragments');
  assert.notDeepEqual(fragments.body.fragments.map((fragment) => fragment.fragment_id), ['frag_public_wallet']);
  assert.ok(fragments.body.fragments.some((fragment) => fragment.fragment_id === 'frag_helixa_agent_1_owner_wallet'));
  const changes = await requestJson(api, '/api/multipass/mp_helixa_agent_1/changes');
  assert.equal(changes.body.entries[0].message, 'Multipass saved from live public source record.');
});

test('POST routes return structured input errors', async () => {
  const api = makeSaveApi();

  const badJsonResponse = await api.handleRequest(new Request('https://multipass.example.test/api/multipass', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }));
  const badJson = await badJsonResponse.json();
  assert.equal(badJsonResponse.status, 400);
  assert.equal(badJson.error.code, 'invalid_json');

  const missing = await postJson(api, '/api/multipass', {});
  assert.equal(missing.response.status, 400);
  assert.equal(missing.body.error.code, 'invalid_request');
});

test('POST save and preview require activation configuration', async () => {
  const api = makeApi();
  const preview = await postJson(api, '/api/multipass/activate', { agent: '1' });
  const save = await postJson(api, '/api/multipass', { agent: '1' });

  assert.equal(preview.response.status, 503);
  assert.equal(preview.body.error.code, 'not_configured');
  assert.equal(save.response.status, 503);
  assert.equal(save.body.error.code, 'not_configured');
});

test('validates store documents before serving them', () => {
  const invalid = { ...profile };
  delete invalid.schema_version;

  assert.throws(
    () => createMemoryStore({ profiles: [invalid] }),
    (error) => {
      assert.ok(error instanceof MultipassValidationError);
      assert.equal(error.schemaName, 'multipass-profile');
      return true;
    },
  );
});

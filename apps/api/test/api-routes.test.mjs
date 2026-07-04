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

function makeToolFragment(overrides = {}, refOverrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: overrides.fragment_id ?? 'frag_tool_paid_chat',
    multipass_id: overrides.multipass_id ?? 'mp_bendr',
    fragment_type: overrides.fragment_type ?? 'tool_manifest',
    status: overrides.status ?? 'verified',
    assurance_level: overrides.assurance_level ?? 'platform_verified',
    visibility: overrides.visibility ?? 'public',
    transfer_policy: overrides.transfer_policy ?? 'pause_on_transfer',
    source: overrides.source ?? {
      source_type: 'registry_import',
      source_id: 'bankr_x402_cloud:paid-chat',
      issuer: 'bankr_x402_cloud',
      observed_at: '2026-06-24T00:00:00Z',
    },
    tool_manifest_ref: overrides.tool_manifest_ref === undefined ? {
      tool_id: refOverrides.tool_id ?? 'paid-chat',
      registry: refOverrides.registry ?? 'bankr_x402_cloud',
      name: refOverrides.name ?? 'Paid Chat Tool',
      description: refOverrides.description ?? 'Runs a paid chat turn.',
      endpoint_url: refOverrides.endpoint_url ?? 'https://api.example.test/tools/paid-chat',
      manifest_url: refOverrides.manifest_url ?? 'https://api.example.test/tools/paid-chat/manifest.json',
      manifest_hash: refOverrides.manifest_hash ?? 'sha256:paidchat',
      creator_address: refOverrides.creator_address ?? '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
      pricing: refOverrides.pricing ?? {
        model: 'fixed',
        amount: '0.25',
        asset: 'USDC',
        chain_id: 8453,
      },
      access: refOverrides.access ?? {
        summary: 'Public x402 access.',
        requires_owner_approval: false,
      },
      schemas: refOverrides.schemas ?? {
        input_summary: 'Chat request.',
        output_summary: 'Chat response.',
      },
      verifiability: refOverrides.verifiability ?? {
        tier: 'provider_verified',
        summary: 'Imported from Bankr x402 Cloud.',
      },
      last_checked_at: refOverrides.last_checked_at ?? '2026-06-24T00:05:00Z',
    } : overrides.tool_manifest_ref,
    created_at: overrides.created_at ?? '2026-06-24T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-06-24T00:00:00Z',
  };
}

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

function createCustomFixtureStore({ fragments = [publicFragment, privateFragment], agentCards = [agentCard], x402Manifests = [x402Manifest] } = {}) {
  return createMemoryStore({
    profiles: [profile],
    fragments,
    agentCards,
    standardsProfiles: [standardsProfile],
    x402Manifests,
    receiptFragments: [receipt],
  });
}

function makeCustomApi(options = {}) {
  return createMultipassApi({
    store: createCustomFixtureStore(options),
    baseUrl: 'https://multipass.example.test',
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

function makeSavedRecordWithPublicTool() {
  const record = makeSavedRecord();
  return {
    ...record,
    fragments: [
      ...record.fragments,
      makeToolFragment({
        fragment_id: 'frag_tool_agent_lookup',
        multipass_id: record.profile.multipass_id,
      }, {
        tool_id: 'agent-lookup',
        name: 'Agent lookup',
        endpoint_url: 'https://api.example.test/tools/agent-lookup',
        manifest_url: 'https://api.example.test/tools/agent-lookup/manifest.json',
      }),
      makeToolFragment({
        fragment_id: 'frag_tool_hidden_lookup',
        multipass_id: record.profile.multipass_id,
        visibility: 'hidden',
      }, {
        tool_id: 'hidden-lookup',
        name: 'Hidden lookup',
        endpoint_url: 'https://api.example.test/tools/hidden-lookup',
      }),
    ],
  };
}

function makeSavedRecordWithSourceContext({ sourceType, canonicalId = '8453:1', tokenId = '1', slug = 'bendr-non-helixa', multipassId = 'mp_non_helixa_agent_1' } = {}) {
  const record = makeSavedRecordWithPublicTool();
  return {
    ...record,
    source: { sourceType, canonicalId, tokenId },
    sourceContext: {
      activation: {
        ...record.sourceContext.activation,
        sourceType,
        canonicalId,
        tokenId,
      },
      sourceSnapshot: {
        ...record.sourceContext.sourceSnapshot,
        sourceType,
        canonicalId,
        tokenId,
      },
    },
    profile: {
      ...record.profile,
      multipass_id: multipassId,
      slug,
    },
    fragments: record.fragments.map((fragment) => ({ ...fragment, multipass_id: multipassId })),
    agentCard: { ...record.agentCard, multipass_id: multipassId },
    standardsProfile: {
      ...record.standardsProfile,
      standards_profile_id: `sp_${multipassId}`,
      multipass_id: multipassId,
    },
    x402Manifest: { ...record.x402Manifest, multipass_id: multipassId },
    receipts: record.receipts.map((item) => ({ ...item, multipass_id: multipassId })),
    change: {
      ...record.change,
      change_id: `change_${multipassId}_initial_save`,
    },
  };
}

function makeCanonicalApi() {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  return createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      assert.equal(input, '1');
      return makeSavedRecordWithPublicTool();
    },
  });
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

function expectedLegacyActivationSource(overrides = {}) {
  return {
    state: 'saved_unclaimed',
    origin: 'live_agent_record',
    originSource: 'trusted_resolver_metadata',
    sourceType: 'helixa_agent',
    canonicalId: '8453:1',
    tokenId: '1',
    savedAt: '2026-06-26T20:00:00.000Z',
    ...overrides,
  };
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

test('serves public tool cards without leaking non-public tool manifests', async () => {
  const publicTool = makeToolFragment();
  const hiddenTool = makeToolFragment(
    { fragment_id: 'frag_tool_hidden', visibility: 'hidden' },
    {
      tool_id: 'secret-tool',
      name: 'Secret Tool',
      description: 'Hidden tool should not leave the server.',
      endpoint_url: 'https://api.example.test/tools/secret-tool',
      manifest_url: 'https://api.example.test/tools/secret-tool/manifest.json',
    },
  );
  const api = makeCustomApi({ fragments: [publicFragment, publicTool, hiddenTool] });

  const bySlug = await requestJson(api, '/api/multipass/bendr-2/tools');
  const byId = await requestJson(api, '/api/multipass/mp_bendr/tools');

  assert.equal(bySlug.response.status, 200);
  assert.equal(byId.response.status, 200);
  assert.equal(bySlug.body.schema_version, '0.1.0');
  assert.equal(bySlug.body.multipass_id, 'mp_bendr');
  assert.equal(bySlug.body.summary.total, 1);
  assert.equal(bySlug.body.tools[0].tool_id, 'paid-chat');
  assert.equal(bySlug.body.tools[0].registry, 'bankr_x402_cloud');
  assert.equal(bySlug.body.tools[0].endpoint_url, 'https://api.example.test/tools/paid-chat');
  assert.deepEqual(byId.body.tools.map((tool) => tool.tool_id), ['paid-chat']);
  const serialized = JSON.stringify(bySlug.body);
  assert.doesNotMatch(serialized, /secret-tool/);
  assert.doesNotMatch(serialized, /Hidden tool/);
});

test('serves agent card, standards profile, x402 manifest, and receipt fragment', async () => {
  const api = makeApi();

  assert.equal((await requestJson(api, '/api/multipass/bendr-2/agent-card')).body.name, 'Bendr 2.0');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/standards')).body.standard_refs[0].status, 'stale');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/x402')).body.endpoints[0].provider, 'bankr_x402_cloud');
  assert.equal((await requestJson(api, '/api/multipass/bendr-2/receipts/receipt_1')).body.status, 'settled');
});

test('derives x402 manifest from active public Bankr tool cards', async () => {
  const activeBankrTool = makeToolFragment();
  const revokedBankrTool = makeToolFragment(
    { fragment_id: 'frag_tool_revoked', status: 'revoked' },
    {
      tool_id: 'revoked-paid-chat',
      name: 'Revoked Paid Chat',
      endpoint_url: 'https://api.example.test/tools/revoked-paid-chat',
      manifest_url: 'https://api.example.test/tools/revoked-paid-chat/manifest.json',
    },
  );
  const nonX402Tool = makeToolFragment(
    { fragment_id: 'frag_tool_analysis' },
    {
      tool_id: 'analysis',
      registry: 'helixa_api',
      name: 'Analysis Tool',
      endpoint_url: 'https://api.example.test/tools/analysis',
      manifest_url: null,
      pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    },
  );
  const privateBankrTool = makeToolFragment(
    { fragment_id: 'frag_tool_private_paid', visibility: 'private' },
    {
      tool_id: 'private-paid-chat',
      name: 'Private Paid Chat',
      endpoint_url: 'https://api.example.test/tools/private-paid-chat',
      manifest_url: 'https://api.example.test/tools/private-paid-chat/manifest.json',
    },
  );
  const api = makeCustomApi({ fragments: [activeBankrTool, revokedBankrTool, nonX402Tool, privateBankrTool] });

  const { response, body } = await requestJson(api, '/api/multipass/bendr-2/x402');

  assert.equal(response.status, 200);
  assert.deepEqual(body.endpoints.map((endpoint) => endpoint.endpoint_id), ['paid-chat']);
  assert.equal(body.endpoints[0].url, 'https://api.example.test/tools/paid-chat');
  assert.equal(body.endpoints[0].method, 'POST');
  assert.deepEqual(body.endpoints[0].price, { amount: '0.25', decimals: 18 });
  assert.equal(body.endpoints[0].asset, 'USDC');
  assert.equal(body.endpoints[0].chain_id, 8453);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /revoked-paid-chat/);
  assert.doesNotMatch(serialized, /analysis/);
  assert.doesNotMatch(serialized, /private-paid-chat/);
});

test('derives agent-card service endpoints from public tool cards without clobbering gated authored endpoints', async () => {
  const authoredCard = {
    ...agentCard,
    service_endpoints: [
      {
        endpoint_id: 'paid-chat',
        url: 'https://gated.example.test/tools/paid-chat',
        description: 'Authored gated paid chat endpoint.',
        visibility: 'gated',
      },
    ],
    accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
  };
  const bankrTool = makeToolFragment();
  const publicServiceTool = makeToolFragment(
    { fragment_id: 'frag_tool_analysis' },
    {
      tool_id: 'analysis',
      registry: 'helixa_api',
      name: 'Analysis Tool',
      description: 'Runs public analysis.',
      endpoint_url: 'https://api.example.test/tools/analysis',
      manifest_url: null,
      pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    },
  );
  const privateServiceTool = makeToolFragment(
    { fragment_id: 'frag_tool_private_analysis', visibility: 'gated' },
    {
      tool_id: 'private-analysis',
      registry: 'helixa_api',
      name: 'Private Analysis',
      description: 'Gated analysis should not be public.',
      endpoint_url: 'https://api.example.test/tools/private-analysis',
      manifest_url: null,
      pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    },
  );
  const api = makeCustomApi({
    fragments: [bankrTool, publicServiceTool, privateServiceTool],
    agentCards: [authoredCard],
  });

  const { response, body } = await requestJson(api, '/api/multipass/bendr-2/agent-card');

  assert.equal(response.status, 200);
  assert.equal(body.x402_manifest_url, 'https://multipass.example.test/api/multipass/mp_bendr/x402');
  assert.deepEqual(body.service_endpoints.find((endpoint) => endpoint.endpoint_id === 'paid-chat'), {
    endpoint_id: 'paid-chat',
    url: 'https://gated.example.test/tools/paid-chat',
    description: 'Authored gated paid chat endpoint.',
    visibility: 'gated',
  });
  assert.deepEqual(body.service_endpoints.find((endpoint) => endpoint.endpoint_id === 'analysis'), {
    endpoint_id: 'analysis',
    url: 'https://api.example.test/tools/analysis',
    description: 'Analysis Tool: Runs public analysis.',
    visibility: 'public',
  });
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /private-analysis/);
  assert.doesNotMatch(serialized, /Gated analysis/);
});

test('preserves persisted x402 manifest and agent-card when no public active tool fragments exist', async () => {
  const api = makeApi();

  const x402 = await requestJson(api, '/api/multipass/bendr-2/x402');
  const card = await requestJson(api, '/api/multipass/bendr-2/agent-card');

  assert.deepEqual(x402.body.endpoints.map((endpoint) => endpoint.endpoint_id), ['lookup']);
  assert.equal(x402.body.endpoints[0].url, 'https://api.example.test/multipass/mp_bendr');
  assert.deepEqual(card.body.service_endpoints, []);
  assert.equal(card.body.x402_manifest_url, null);
});

test('serves site-level discovery pointer', async () => {
  const api = makeApi();

  const { response, body } = await requestJson(api, '/.well-known/helixa-multipass.json');

  assert.equal(response.status, 200);
  assert.equal(body.schema_version, '0.1.0');
  assert.equal(body.service, 'helixa-multipass');
  assert.equal(body.routes.profile, 'https://multipass.example.test/api/multipass/{id}');
});

test('serves public Multipass discovery alias and OpenAPI document', async () => {
  const api = makeApi();

  const discovery = await requestJson(api, '/.well-known/multipass.json');
  assert.equal(discovery.response.status, 200);
  assert.equal(discovery.body.routes.openapi, 'https://multipass.example.test/api/openapi.json');
  assert.equal(discovery.body.routes.resolve, 'https://multipass.example.test/api/resolve?agent={input}');
  assert.equal(discovery.body.routes.search, 'https://multipass.example.test/api/search?q={query}');
  assert.equal(discovery.body.routes.versioned_profile, 'https://multipass.example.test/api/v0/multipass/{id}');
  assert.equal(discovery.body.routes.card, 'https://multipass.example.test/api/multipass/{id}/card');
  assert.equal(discovery.body.routes.agent_card, 'https://multipass.example.test/api/multipass/{id}/agent-card');
  assert.equal(discovery.body.routes.tools, 'https://multipass.example.test/api/multipass/{id}/tools');
  assert.equal(discovery.body.routes.changes, 'https://multipass.example.test/api/multipass/{id}/changes');

  const openapi = await requestJson(api, '/api/openapi.json');
  assert.equal(openapi.response.status, 200);
  assert.equal(openapi.body.openapi, '3.1.0');
  assert.equal(openapi.body.info.title, 'Helixa Multipass API');
  assert.ok(openapi.body.paths['/.well-known/helixa-multipass.json']);
  assert.ok(openapi.body.paths['/api/multipass/{id}']);
  assert.ok(openapi.body.paths['/api/v0/multipass/{id}']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/card']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/agent-card']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/tools']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/changes']);
  assert.ok(openapi.body.paths['/api/resolve']);
  assert.ok(openapi.body.paths['/api/search']);
});

test('serves versioned public read aliases and receipt collections', async () => {
  const api = makeApi();

  const versioned = await requestJson(api, '/api/v0/multipass/bendr-2');
  assert.equal(versioned.response.status, 200);
  assert.equal(versioned.body.multipass_id, 'mp_bendr');

  const receipts = await requestJson(api, '/api/multipass/bendr-2/receipts');
  assert.equal(receipts.response.status, 200);
  assert.deepEqual(receipts.body.receipts.map((item) => item.receipt_id), ['receipt_1']);
});

test('GET /api/multipass/resolve hydrates saved Helixa AgentDNA profiles with public tools', async () => {
  const api = makeCanonicalApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const result = await requestJson(api, '/api/multipass/resolve?source=helixa-agentdna:8453:1');

  assert.equal(result.response.status, 200);
  assert.equal(result.body.mode, 'activated');
  assert.equal(result.body.state, 'saved_record');
  assert.equal(result.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(result.body.source_identity.legacy_canonical_id, '8453:1');
  assert.equal(result.body.profile.slug, 'bendr-2-1');
  assert.deepEqual(result.body.tools.tools.map((tool) => tool.tool_id), ['agent-lookup']);
  assert.equal(JSON.stringify(result.body).includes('hidden-lookup'), false);
  assert.equal(result.body.routes_meta.public_profile, '/multipass/bendr-2-1');
});

test('GET /api/multipass/:id/hydrated returns the same public tools as source hydration', async () => {
  const api = makeCanonicalApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const hydrated = await requestJson(api, '/api/multipass/bendr-2-1/hydrated');

  assert.equal(hydrated.response.status, 200);
  assert.equal(hydrated.body.mode, 'saved');
  assert.equal(hydrated.body.profile.slug, 'bendr-2-1');
  assert.deepEqual(hydrated.body.tools.tools.map((tool) => tool.tool_id), ['agent-lookup']);
});

test('GET /api/multipass/:id/hydrated fails closed for fixture-only profiles', async () => {
  const api = makeApi();

  const profileRead = await requestJson(api, '/api/multipass/bendr-2');
  assert.equal(profileRead.response.status, 200);
  assert.equal(profileRead.body.multipass_id, 'mp_bendr');

  const hydrated = await requestJson(api, '/api/multipass/bendr-2/hydrated');
  assert.equal(hydrated.response.status, 404);
  assert.equal(hydrated.body.error.code, 'not_found');
});

test('GET /api/multipass/:id/hydrated fails closed when saved source type is not Helixa', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  savedRecords.saveActivatedRecord(makeSavedRecordWithSourceContext({ sourceType: 'other_source' }));
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });

  const hydrated = await requestJson(api, '/api/multipass/bendr-non-helixa/hydrated');
  assert.equal(hydrated.response.status, 404);
  assert.equal(hydrated.body.error.code, 'not_found');

  const legacy = await requestJson(api, '/api/resolve?agent=bendr-non-helixa');
  assert.equal(legacy.response.status, 200);
  assert.equal(legacy.body.state, 'saved_record');
  assert.equal(legacy.body.source_identity, undefined);
  assert.deepEqual(legacy.body.source, expectedLegacyActivationSource({ sourceType: 'other_source' }));
});

test('GET /api/multipass/resolve returns activation preview without saving unactivated sources', async () => {
  const api = makeCanonicalApi();

  const preview = await requestJson(api, '/api/multipass/resolve?source=helixa-agentdna:8453:1');
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.mode, 'activation_preview');
  assert.equal(preview.body.state, 'activated_unsaved');
  assert.equal(preview.body.activation.state, 'not_activated');
  assert.equal(preview.body.activation.claim_url, null);
  assert.equal(preview.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(preview.body.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(preview.body.routes.profile, undefined);
  assert.equal(preview.body.routes.tools, undefined);
  assert.equal(preview.body.routes.save, 'https://multipass.example.test/api/multipass');
  assert.equal(JSON.stringify(preview.body.routes).includes('/api/multipass/bendr-2-1'), false);
  assert.equal(preview.body.save_url, 'https://multipass.example.test/api/multipass');

  const savedRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(savedRead.response.status, 404);
});

test('resolves saved records and live activation previews through public resolver endpoint', async () => {
  const api = makeCanonicalApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const saved = await requestJson(api, '/api/resolve?agent=bendr-2-1');
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.state, 'saved_record');
  assert.equal(saved.body.mode, 'saved');
  assert.equal(saved.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.deepEqual(saved.body.source, expectedLegacyActivationSource());

  const bySource = await requestJson(api, '/api/resolve?agent=1');
  assert.equal(bySource.response.status, 200);
  assert.equal(bySource.body.state, 'saved_record');
  assert.equal(bySource.body.mode, 'activated');
  assert.equal(bySource.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.deepEqual(bySource.body.source, expectedLegacyActivationSource());
  assert.equal(bySource.body.profile.slug, 'bendr-2-1');
  assert.equal(bySource.body.routes.profile, 'https://multipass.example.test/api/multipass/bendr-2-1');

  const byExplicitSource = await requestJson(api, '/api/resolve?agent=helixa-agentdna:8453:1');
  assert.equal(byExplicitSource.response.status, 200);
  assert.equal(byExplicitSource.body.state, 'saved_record');
  assert.equal(byExplicitSource.body.mode, 'activated');
  assert.equal(byExplicitSource.body.profile.slug, 'bendr-2-1');
  assert.deepEqual(byExplicitSource.body.source, expectedLegacyActivationSource());
});

test('legacy /api/resolve numeric agent returns activation preview before save', async () => {
  const api = makeCanonicalApi();

  const live = await requestJson(api, '/api/resolve?agent=1');

  assert.equal(live.response.status, 200);
  assert.equal(live.body.state, 'activated_unsaved');
  assert.equal(live.body.mode, 'activation_preview');
  assert.equal(live.body.source.canonicalId, '8453:1');
  assert.equal(live.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(live.body.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(live.body.save_url, 'https://multipass.example.test/api/multipass');
});

test('search returns conservative public profile matches only', async () => {
  const api = makeSaveApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const result = await requestJson(api, '/api/search?q=bend');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.matches.map((match) => match.slug), ['bendr-2-1', 'bendr-2']);
  assert.deepEqual(result.body.matches.map((match) => match.kind), ['saved', 'fixture']);
  assert.ok(result.body.matches.every((match) => !('fragments' in match)));

  const short = await requestJson(api, '/api/search?q=b');
  assert.equal(short.response.status, 400);
  assert.equal(short.body.error.code, 'invalid_request');
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
  assert.equal(preview.body.error.message, 'Multipass activation is not configured.');
  assert.equal(save.response.status, 503);
  assert.equal(save.body.error.code, 'not_configured');
  assert.equal(save.body.error.message, 'Multipass activation records are not configured.');
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

const OWNER_WALLET = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const MANAGER_WALLET = '0x339559A2d1CD15059365FC7bD36b3047BbA480E0';

function makeClaimApi() {
  return makeClaimApiWithRecords().api;
}

function makeClaimApiWithRecords(options = {}) {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  savedRecords.saveActivatedRecord(makeSavedRecord());
  return {
    savedRecords,
    api: createMultipassApi({
      store: createFixtureStore(),
      savedRecords,
      baseUrl: 'https://multipass.example.test',
      allowedOrigins: ['https://multipass.example.test'],
      adminSecret: 'test-admin-secret',
      fetchImpl: options.fetchImpl,
      signatureVerifier: async ({ wallet, message, signature }) => {
        assert.match(message, /Helixa Multipass claim management/);
        return signature === `valid:${wallet.toLowerCase()}`;
      },
    }),
  };
}

async function postJsonWithHeaders(api, path, body, headers = {}) {
  const response = await api.handleRequest(new Request(`https://multipass.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}

async function patchJsonWithHeaders(api, path, body, headers = {}) {
  const response = await api.handleRequest(new Request(`https://multipass.example.test${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}

async function createOwnerSession(api) {
  const nonce = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/nonce', {}, { origin: 'https://multipass.example.test' });
  const verified = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: OWNER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${OWNER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  return {
    cookie: verified.response.headers.get('set-cookie'),
    csrfToken: verified.body.csrfToken,
    headers: {
      origin: 'https://multipass.example.test',
      cookie: verified.response.headers.get('set-cookie'),
      'x-csrf-token': verified.body.csrfToken,
    },
  };
}

function bankrToolImportInput(overrides = {}) {
  return {
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
    ...overrides,
  };
}

test('claim nonce route returns a scoped signing message for saved records', async () => {
  const api = makeClaimApi();

  const { response, body } = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/claim/nonce', {}, {
    origin: 'https://multipass.example.test',
  });

  assert.equal(response.status, 200);
  assert.equal(body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(body.source_canonical_id, '8453:1');
  assert.match(body.message, /Domain: multipass\.example\.test/);
  assert.match(body.message, /does not transfer funds, assets, tools, credentials, or ownership/i);
});

test('owner wallet claim verifies signature and creates CSRF protected manager session', async () => {
  const api = makeClaimApi();
  const nonce = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/nonce', {}, { origin: 'https://multipass.example.test' });

  const verified = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: OWNER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${OWNER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });

  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.claim_status, 'claimed_verified_owner');
  assert.match(verified.body.csrfToken, /^[a-f0-9]{64}$/);
  assert.equal(verified.body.profile.owner_summary.owner_state, 'verified');
  const cookie = verified.response.headers.get('set-cookie');
  assert.match(cookie, /multipass_manager=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const missingCsrf = await patchJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/profile', {
    display_name: 'Bendr Managed',
  }, { origin: 'https://multipass.example.test', cookie });
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.body.error.code, 'forbidden');

  const wrongOrigin = await patchJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/profile', {
    display_name: 'Bendr Managed',
  }, { origin: 'https://evil.example.test', cookie, 'x-csrf-token': verified.body.csrfToken });
  assert.equal(wrongOrigin.response.status, 403);

  const blocked = await patchJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/profile', {
    cred_summary: { trust_state: 'established' },
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': verified.body.csrfToken });
  assert.equal(blocked.response.status, 400);
  assert.equal(blocked.body.error.code, 'invalid_request');

  const edited = await patchJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/profile', {
    display_name: 'Bendr Managed',
    summary: 'Managed public Multipass profile.',
    avatar_url: 'https://assets.example.test/bendr.png',
    tags: ['helixa', 'managed'],
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': verified.body.csrfToken });
  assert.equal(edited.response.status, 200);
  assert.deepEqual(edited.body.changedFields, ['display_name', 'summary', 'avatar_url', 'tags']);
  assert.equal(edited.body.profile.display_name, 'Bendr Managed');

  const changes = await requestJson(api, '/api/multipass/mp_helixa_agent_1/changes');
  assert.match(changes.body.entries.at(-1).message, /Public profile updated/);

  const logout = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/session/logout', {}, {
    origin: 'https://multipass.example.test',
    cookie,
    'x-csrf-token': verified.body.csrfToken,
  });
  assert.equal(logout.response.status, 200);
  assert.equal(logout.body.ok, true);
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);

  const afterLogout = await patchJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/profile', {
    display_name: 'Bendr After Logout',
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': verified.body.csrfToken });
  assert.equal(afterLogout.response.status, 403);
  assert.equal(afterLogout.body.error.code, 'forbidden');
});

test('manager visibility edits remove saved records from public search without hiding exact reads', async () => {
  const { api } = makeClaimApiWithRecords();
  const { headers } = await createOwnerSession(api);

  const hidden = await patchJsonWithHeaders(api, '/api/multipass/bendr-2-1/profile', {
    visibility: 'hidden',
  }, headers);
  assert.equal(hidden.response.status, 200);
  assert.deepEqual(hidden.body.changedFields, ['visibility']);
  assert.equal(hidden.body.profile.owner_summary.visibility, 'hidden');

  const exact = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(exact.response.status, 200);
  assert.equal(exact.body.owner_summary.visibility, 'hidden');

  const search = await requestJson(api, '/api/search?q=bend');
  assert.equal(search.response.status, 200);
  assert.deepEqual(search.body.matches.map((match) => [match.kind, match.slug]), [['fixture', 'bendr-2']]);
});

test('manager session can create update and revoke public fragments through API', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);

  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Public profile JSON endpoint.',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1',
    endpoint_ref: {
      endpoint_id: 'profile-json',
      url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1',
      protocol: 'api',
    },
  }, headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.fragment_type, 'endpoint');
  assert.equal(created.body.fragment.endpoint_ref.protocol, 'api');
  assert.equal(created.body.profile.public_fragments[0].fragment_id, created.body.fragment.fragment_id);

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1/fragments');
  assert.ok(publicRead.body.fragments.some((fragment) => fragment.fragment_id === created.body.fragment.fragment_id));

  const updated = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}`, {
    public_value: 'Updated public profile JSON endpoint.',
    status: 'stale',
  }, headers);
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.fragment.status, 'stale');
  assert.equal(updated.body.profile.public_fragments.find((fragment) => fragment.fragment_id === created.body.fragment.fragment_id).status, 'stale');

  const revoked = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}/revoke`, {}, headers);
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.fragment.status, 'revoked');

  const changes = await requestJson(api, '/api/multipass/bendr-2-1/changes');
  assert.match(changes.body.entries.at(-1).message, /Public route revoked: Updated public profile JSON endpoint\./);
});

test('manager session imports Bankr service configs into tools x402 and agent card', async () => {
  const api = makeClaimApi();
  const { headers, csrfToken } = await createOwnerSession(api);

  const missingSession = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/import', bankrToolImportInput(), {
    origin: 'https://multipass.example.test',
    'x-csrf-token': csrfToken,
  });
  assert.equal(missingSession.response.status, 401);

  const imported = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/import', bankrToolImportInput(), headers);
  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.fragment.fragment_type, 'tool_manifest');
  assert.equal(imported.body.fragment.tool_manifest_ref.tool_id, 'cred-report');
  assert.deepEqual(imported.body.tools.tools.map((tool) => tool.tool_id), ['cred-report']);

  const duplicate = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/import', bankrToolImportInput({ service: { price: '1.00', description: 'Duplicate.' } }), headers);
  assert.equal(duplicate.response.status, 400);
  assert.match(duplicate.body.error.message, /tool_id.*already exists|already imported/i);

  const tools = await requestJson(api, '/api/multipass/bendr-2-1/tools');
  assert.deepEqual(tools.body.tools.map((tool) => tool.tool_id), ['cred-report']);
  assert.equal(tools.body.tools[0].pricing.amount, '1.00');

  const x402 = await requestJson(api, '/api/multipass/bendr-2-1/x402');
  assert.deepEqual(x402.body.endpoints.map((endpoint) => endpoint.endpoint_id), ['cred-report']);
  assert.equal(x402.body.endpoints[0].asset, 'USDC');
  assert.equal(x402.body.endpoints[0].chain_id, 8453);

  const card = await requestJson(api, '/api/multipass/bendr-2-1/agent-card');
  assert.equal(card.body.service_endpoints.some((endpoint) => endpoint.endpoint_id === 'cred-report'), true);
  assert.equal(card.body.x402_manifest_url, 'https://multipass.example.test/api/multipass/mp_helixa_agent_1/x402');
});

test('manager session refreshes Bankr tool status from x402 challenge metadata', async () => {
  const { api } = makeClaimApiWithRecords({
    fetchImpl: async () => new Response(JSON.stringify({ accepts: [{ network: 'eip155:8453', maxAmountRequired: '1000000' }] }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const { headers, csrfToken } = await createOwnerSession(api);
  const imported = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/import', bankrToolImportInput(), headers);
  const fragmentId = imported.body.fragment.fragment_id;

  const missingSession = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/tools/${fragmentId}/refresh`, {}, {
    origin: 'https://multipass.example.test',
    'x-csrf-token': csrfToken,
  });
  assert.equal(missingSession.response.status, 401);

  const refreshed = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/tools/${fragmentId}/refresh`, {}, headers);
  assert.equal(refreshed.response.status, 200);
  assert.equal(refreshed.body.fragment.status, 'verified');
  assert.equal(refreshed.body.refresh.status, 'verified');
  assert.match(refreshed.body.refresh.summary, /endpoint reachable/i);
  assert.equal(refreshed.body.fragment.tool_manifest_ref.last_checked_at, refreshed.body.refresh.checked_at);
  assert.deepEqual(refreshed.body.tools.tools.map((tool) => [tool.tool_id, tool.status]), [['cred-report', 'verified']]);

  const changes = await requestJson(api, '/api/multipass/bendr-2-1/changes');
  assert.match(changes.body.entries.at(-1).message, /Tool service refreshed: cred-report\./);
});

test('manager session marks failed tool refresh stale without deleting the card', async () => {
  const { api } = makeClaimApiWithRecords({
    fetchImpl: async () => new Response('server down', { status: 500 }),
  });
  const { headers } = await createOwnerSession(api);
  const imported = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/import', bankrToolImportInput(), headers);
  const fragmentId = imported.body.fragment.fragment_id;

  const refreshed = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/tools/${fragmentId}/refresh`, {}, headers);
  assert.equal(refreshed.response.status, 200);
  assert.equal(refreshed.body.fragment.status, 'stale');
  assert.equal(refreshed.body.refresh.status, 'stale');
  assert.match(refreshed.body.refresh.summary, /endpoint check failed/i);

  const tools = await requestJson(api, '/api/multipass/bendr-2-1/tools');
  assert.deepEqual(tools.body.tools.map((tool) => [tool.tool_id, tool.status]), [['cred-report', 'stale']]);
});

test('manager tool refresh rejects unknown and non-tool fragments', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);

  const unknown = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/frag_missing/refresh', {}, headers);
  assert.equal(unknown.response.status, 404);

  const nonTool = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/tools/frag_helixa_activation/refresh', {}, headers);
  assert.equal(nonTool.response.status, 404);
});

test('fragment write routes enforce manager session csrf origin blocked inputs and imported read-only fragments', async () => {
  const api = makeClaimApi();
  const { headers, cookie, csrfToken } = await createOwnerSession(api);

  const missingSession = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'wallet',
    public_value: OWNER_WALLET,
  }, { origin: 'https://multipass.example.test', 'x-csrf-token': csrfToken });
  assert.equal(missingSession.response.status, 401);

  const badCsrf = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'wallet',
    public_value: OWNER_WALLET,
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': 'bad' });
  assert.equal(badCsrf.response.status, 403);

  const badOrigin = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'wallet',
    public_value: OWNER_WALLET,
  }, { origin: 'https://evil.example.test', cookie, 'x-csrf-token': csrfToken });
  assert.equal(badOrigin.response.status, 403);

  const blockedType = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'risk_summary',
    public_value: 'Cred 999',
  }, headers);
  assert.equal(blockedType.response.status, 400);
  assert.equal(blockedType.body.error.code, 'invalid_request');

  const unsafeUrl = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'HTTP endpoint',
    endpoint_ref: { endpoint_id: 'bad', url: 'http://example.test', protocol: 'api' },
  }, headers);
  assert.equal(unsafeUrl.response.status, 400);

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1/fragments');
  const importedFragment = publicRead.body.fragments.find((fragment) => fragment.source?.source_type !== 'owner_submission' || fragment.source?.issuer !== null);
  assert.ok(importedFragment);
  const readOnly = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${importedFragment.fragment_id}`, {
    public_value: 'Manager edited imported fragment.',
  }, headers);
  assert.equal(readOnly.response.status, 403);

  const readOnlyRevoke = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${importedFragment.fragment_id}/revoke`, {}, headers);
  assert.equal(readOnlyRevoke.response.status, 403);

  const missing = await patchJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments/frag_missing', {
    public_value: 'Missing.',
  }, headers);
  assert.equal(missing.response.status, 404);

  const noStoreApi = makeApi();
  const noStoreCreate = await postJsonWithHeaders(noStoreApi, '/api/multipass/bendr-2/fragments', {
    fragment_type: 'wallet',
    public_value: OWNER_WALLET,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(noStoreCreate.response.status, 503);
  assert.equal(noStoreCreate.body.error.code, 'not_configured');

  const noStorePatch = await patchJsonWithHeaders(noStoreApi, '/api/multipass/bendr-2/fragments/frag_public_wallet', {
    public_value: OWNER_WALLET,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(noStorePatch.response.status, 503);

  const noStoreRevoke = await postJsonWithHeaders(noStoreApi, '/api/multipass/bendr-2/fragments/frag_public_wallet/revoke', {}, { origin: 'https://multipass.example.test' });
  assert.equal(noStoreRevoke.response.status, 503);
});

test('wallet claim rejects signatures from wallets that are not source owner or approved manager', async () => {
  const api = makeClaimApi();
  const nonce = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/nonce', {}, { origin: 'https://multipass.example.test' });

  const rejected = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: MANAGER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${MANAGER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });

  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.error.code, 'forbidden');
});

test('claim verify returns structured errors for expired used or wrong-scope nonces', async () => {
  const { api, savedRecords } = makeClaimApiWithRecords();
  const expired = savedRecords.createClaimNonce('mp_helixa_agent_1', {
    domain: 'multipass.example.test',
    now: '2026-06-26T23:45:00.000Z',
    ttlMs: 1,
  });

  const expiredResponse = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: OWNER_WALLET,
    nonce: expired.nonce,
    signature: `valid:${OWNER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(expiredResponse.response.status, 403);
  assert.equal(expiredResponse.body.error.code, 'forbidden');
  assert.match(expiredResponse.body.error.message, /expired/i);

  const nonce = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/nonce', {}, { origin: 'https://multipass.example.test' });
  const first = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: OWNER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${OWNER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(first.response.status, 200);

  const reused = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: OWNER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${OWNER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(reused.response.status, 403);
  assert.equal(reused.body.error.code, 'forbidden');
  assert.match(reused.body.error.message, /already used/i);
});

test('manual review creates pending claim without session and approved manager must still sign', async () => {
  const api = makeClaimApi();

  const pending = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/claim/verify', {
    mode: 'manual_review',
    proposedManagerWallet: MANAGER_WALLET,
    contactRoute: 'agentmail:team@example.test',
    note: 'Please approve public profile management for this team wallet.',
  }, { origin: 'https://multipass.example.test' });

  assert.equal(pending.response.status, 202);
  assert.equal(pending.body.claim_status, 'claim_pending');
  assert.equal(pending.response.headers.get('set-cookie'), null);
  assert.equal(pending.body.profile.owner_summary.verification_status, 'pending');

  const claimId = pending.body.claim.claim_id;
  const deniedApproval = await postJsonWithHeaders(api, `/api/admin/multipass/mp_helixa_agent_1/claims/${claimId}/approve`, {}, {
    origin: 'https://multipass.example.test',
  });
  assert.equal(deniedApproval.response.status, 401);

  const missingClaim = await postJsonWithHeaders(api, '/api/admin/multipass/mp_helixa_agent_1/claims/claim_missing/approve', {}, {
    origin: 'https://multipass.example.test',
    'x-admin-secret': 'test-admin-secret',
  });
  assert.equal(missingClaim.response.status, 404);
  assert.equal(missingClaim.body.error.code, 'not_found');

  const approved = await postJsonWithHeaders(api, `/api/admin/multipass/mp_helixa_agent_1/claims/${claimId}/approve`, {}, {
    origin: 'https://multipass.example.test',
    'x-admin-secret': 'test-admin-secret',
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.claim_status, 'claimed_review_approved');
  assert.match(approved.body.profile.owner_summary.summary, /review-approved/i);
  assert.doesNotMatch(approved.body.profile.owner_summary.summary, /owner-wallet verified/i);

  const duplicateApproval = await postJsonWithHeaders(api, `/api/admin/multipass/mp_helixa_agent_1/claims/${claimId}/approve`, {}, {
    origin: 'https://multipass.example.test',
    'x-admin-secret': 'test-admin-secret',
  });
  assert.equal(duplicateApproval.response.status, 400);
  assert.equal(duplicateApproval.body.error.code, 'invalid_request');

  const nonce = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/nonce', {}, { origin: 'https://multipass.example.test' });
  const session = await postJsonWithHeaders(api, '/api/multipass/mp_helixa_agent_1/claim/verify', {
    mode: 'wallet_signature',
    wallet: MANAGER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${MANAGER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.claim_status, 'claimed_review_approved');
  assert.match(session.response.headers.get('set-cookie'), /multipass_manager=/);
});

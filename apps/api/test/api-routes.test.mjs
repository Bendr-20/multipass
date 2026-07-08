import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { MultipassValidationError, assertAgentCard, assertX401Manifest } from '@helixa/multipass-sdk';

import { buildSavedRecordFromHelixaAgent } from '../src/activation-records.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { createSqliteSavedRecords } from '../src/saved-records.js';

const RED_AVATAR_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEklEQVR4nGP4y8CAB+GTG8HSAD3qYtVdVKzfAAAAAElFTkSuQmCC';
const RED_AVATAR_DATA_URL = `data:image/png;base64,${RED_AVATAR_PNG_BASE64}`;

function sampleJpegPixel(bytes, { x, y }) {
  const rgb = execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vf', `crop=1:1:${x}:${y},format=rgb24`,
    '-f', 'rawvideo',
    'pipe:1',
  ], { input: bytes });
  return [...rgb.slice(0, 3)];
}

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

const x401ProofFragment = {
  schema_version: '0.1.0',
  fragment_id: 'frag_x401_authorization',
  multipass_id: 'mp_bendr',
  fragment_type: 'verification_result',
  status: 'verified',
  assurance_level: 'issuer_attested',
  visibility: 'public',
  transfer_policy: 'pause_on_transfer',
  source: {
    source_type: 'issuer_attestation',
    source_id: 'proof:x401:human_authorization',
    issuer: 'Proof',
    observed_at: '2026-06-24T00:00:00Z',
    reference_url: 'https://www.proof.com/x401',
  },
  public_value: 'x401-compatible delegated human authorization proof metadata. No private credential material is exposed.',
  proof_reference: 'x401:proof:human_authorization',
  x401_proof_ref: {
    protocol: 'x401',
    issuer_id: 'proof',
    issuer_name: 'Proof',
    requirement_id: 'human_authorization',
    credential_format: 'openid4vp',
    claim_types: ['personhood', 'delegated_authority'],
    scope: 'agent may request a paid high-trust action',
    result: 'passed',
    header_names: { request: 'PROOF-REQUEST', response: 'PROOF-RESPONSE', result: 'PROOF-RESULT' },
    private_credential_state: 'not_exposed',
  },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  verified_at: '2026-06-24T00:00:00Z',
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
  x401_manifest_url: null,
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

function makeErc8004SaveApi() {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  return createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      assert.equal(input, 'erc8004:8453:19125');
      return makeSavedRecordWithSourceContext({
        sourceType: 'erc8004_identity',
        canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125',
        tokenId: '19125',
        slug: 'ack-19125',
        multipassId: 'mp_erc8004_8453_19125',
      });
    },
  });
}

const GROUP_OBSERVED_AT = '2026-07-05T06:00:00.000Z';

function groupPayload(overrides = {}) {
  return {
    subject_type: 'swarm',
    display_name: 'Helixa Swarm',
    summary: 'Public parent Multipass for Helixa agents.',
    member_ids: ['1', '81', '1066'],
    shared_policy_note: 'Owner approval required for shared policy changes.',
    ...overrides,
  };
}

function fakeGroupMemberRecord(tokenId, overrides = {}) {
  const id = String(tokenId);
  const defaults = {
    1: { name: 'Bendr 2.0', credScore: 82, tier: 'Prime' },
    81: { name: 'Quigbot', credScore: 75, tier: 'Prime' },
    1066: { name: 'Helixa', credScore: 80, tier: 'Prime' },
    1058: { name: 'Phantom Relay', credScore: 70, tier: 'Qualified' },
  }[id] ?? { name: `AgentDNA ${id}`, credScore: null, tier: null };
  const name = overrides.name ?? defaults.name;
  return {
    profile: {
      display_name: name,
      cred_summary: defaults.credScore === null ? null : { score: overrides.credScore ?? defaults.credScore },
    },
    agentCard: { name },
    standardsProfile: {
      standard_refs: [
        {
          standard_id: 'ERC-8004',
          status: 'active',
          chain_id: 8453,
          contract_address: '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432',
          record_id: `8453:${id}`,
          adapter_version: '0.1.0',
          last_verified_at: GROUP_OBSERVED_AT,
          assurance_level: 'onchain_verified',
        },
      ],
    },
    source: {
      sourceType: 'helixa_agent',
      canonicalId: `8453:${id}`,
      tokenId: id,
    },
    sourceContext: {
      sourceSnapshot: {
        credTier: overrides.credTier ?? defaults.tier,
        profileUrl: `https://helixa.xyz/agent/${id}`,
      },
    },
  };
}

function makeGroupApi(options = {}) {
  const savedRecords = options.savedRecords ?? createSqliteSavedRecords({ databasePath: ':memory:' });
  const recordsByTokenId = options.recordsByTokenId ?? new Map([
    ['1', fakeGroupMemberRecord('1')],
    ['81', fakeGroupMemberRecord('81')],
    ['1066', fakeGroupMemberRecord('1066')],
    ['1058', fakeGroupMemberRecord('1058')],
  ]);
  const activationService = options.activationService ?? (async (tokenId) => recordsByTokenId.get(String(tokenId)) ?? null);
  return {
    savedRecords,
    api: createMultipassApi({
      store: createFixtureStore(),
      savedRecords,
      baseUrl: 'https://multipass.example.test',
      activationService,
      allowedOrigins: options.allowedOrigins,
      adminSecret: options.adminSecret,
      fetchImpl: options.fetchImpl,
      signatureVerifier: options.signatureVerifier,
    }),
  };
}

function expectedGroupSlug(payload = groupPayload()) {
  const baseSlug = String(payload.display_name ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'group';
  const members = normalizeExpectedMemberIds(payload.member_ids).join(',');
  const fingerprint = createHash('sha256')
    .update(`${payload.subject_type}|${baseSlug}|${members}`)
    .digest('hex')
    .slice(0, 8);
  return `${baseSlug}-${fingerprint}`;
}

function normalizeExpectedMemberIds(input) {
  const values = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/g);
  return values
    .filter((value) => String(value).trim())
    .map((value) => {
      const raw = String(value).trim();
      const canonical = raw.match(/^8453:(\d+)$/);
      return canonical ? `8453:${canonical[1]}` : `8453:${raw}`;
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
  assert.equal(discovery.body.name, 'Helixa Multipass');
  assert.match(discovery.body.description, /public agent profile/i);
  assert.equal(discovery.body.primary_phrase, 'public agent profile');
  assert.equal(discovery.body.routes.profile, 'https://multipass.example.test/api/multipass/{id}');
  assert.equal(discovery.body.routes.openapi, 'https://multipass.example.test/api/openapi.json');
  assert.equal(discovery.body.routes.resolve, 'https://multipass.example.test/api/resolve?agent={input}');
  assert.equal(discovery.body.routes.search, 'https://multipass.example.test/api/search?q={query}');
  assert.deepEqual(discovery.body.supported_source_ids, [
    'helixa-agentdna:8453:{tokenId}',
    '8453:{tokenId}',
    '{tokenId}',
    'erc8004:8453:{tokenId}',
    'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:{tokenId}',
  ]);
  assert.equal(discovery.body.routes.versioned_profile, 'https://multipass.example.test/api/v0/multipass/{id}');
  assert.equal(discovery.body.routes.card, 'https://multipass.example.test/api/multipass/{id}/card');
  assert.equal(discovery.body.routes.agent_card, 'https://multipass.example.test/api/multipass/{id}/agent-card');
  assert.equal(discovery.body.routes.tools, 'https://multipass.example.test/api/multipass/{id}/tools');
  assert.equal(discovery.body.routes.changes, 'https://multipass.example.test/api/multipass/{id}/changes');
  assert.equal(discovery.body.routes.share, 'https://multipass.example.test/multipass/share/{id}');
  assert.equal(discovery.body.routes.share_image, 'https://multipass.example.test/multipass/share/{id}.jpg');
  assert.equal(discovery.body.routes.api_share, 'https://multipass.example.test/api/multipass/{id}/share');
  assert.equal(discovery.body.routes.api_share_image, 'https://multipass.example.test/api/multipass/{id}/share.jpg');
  assert.equal(discovery.body.start_here.resolve, 'https://multipass.example.test/api/resolve?agent={input}');
  assert.equal(discovery.body.start_here.agent_card, 'https://multipass.example.test/api/multipass/{id}/agent-card');
  assert.equal(discovery.body.example_profile.id, 'bendr-2-1');
  assert.match(discovery.body.agent_instructions[0], /resolve/i);
  assert.match(discovery.body.boundaries.join(' '), /does not execute tools/i);

  const openapi = await requestJson(api, '/api/openapi.json');
  assert.equal(openapi.response.status, 200);
  assert.equal(openapi.body.openapi, '3.1.0');
  assert.equal(openapi.body.info.title, 'Helixa Multipass API');
  assert.match(openapi.body.info.description, /public agent profile/i);
  assert.ok(openapi.body.paths['/.well-known/helixa-multipass.json']);
  assert.ok(openapi.body.paths['/api/multipass/{id}']);
  assert.ok(openapi.body.paths['/api/v0/multipass/{id}']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/card']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/agent-card']);
  assert.match(openapi.body.paths['/api/multipass/{id}/agent-card'].get.description, /machine-readable/i);
  assert.ok(openapi.body.paths['/api/multipass/{id}/tools']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/changes']);
  assert.match(openapi.body.paths['/multipass/share/{id}'].get.summary, /crawler/i);
  assert.match(openapi.body.paths['/multipass/share/{id}.jpg'].get.summary, /JPEG/i);
  assert.ok(openapi.body.paths['/api/multipass/{id}/share']);
  assert.ok(openapi.body.paths['/api/multipass/{id}/share.jpg']);
  assert.ok(openapi.body.paths['/api/resolve']);
  assert.match(openapi.body.paths['/api/multipass/resolve'].get.summary, /ERC-8004/i);
  assert.match(openapi.body.paths['/api/multipass/resolve'].get.parameters[0].description, /erc8004:8453/i);
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

test('saved Helixa AgentDNA records backfill public x401 compatibility metadata', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  savedRecords.saveActivatedRecord(makeSavedRecord());
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });

  const x401 = await requestJson(api, '/api/multipass/bendr-2-1/x401');

  assert.equal(x401.response.status, 200);
  assert.equal(x401.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(x401.body.x401_supported, true);
  assert.equal(x401.body.trusted_issuers[0].issuer_id, 'helixa');
  assert.equal(x401.body.proof_requirements[0].requirement_id, 'human_authorization');
  assert.equal(x401.body.proof_requirements[0].credential_format, 'openid4vp');
  assert.equal(x401.body.proof_requirements[0].visibility, 'public');
  assert.match(x401.body.boundaries.join(' '), /does not expose private credentials/i);
  assert.match(x401.body.boundaries.join(' '), /or imply a commercial relationship/i);
});

test('GET /multipass/share/:id renders dynamic saved-profile preview metadata', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecordWithSourceContext({
    sourceType: 'erc8004_identity',
    canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125',
    tokenId: '19125',
    slug: 'ack-19125',
    multipassId: 'mp_erc8004_8453_19125',
  });
  record.profile.display_name = 'ACK';
  record.profile.discovery_profile = {
    ...record.profile.discovery_profile,
    summary: 'ACK (Agent Consensus Kudos) is a peer-driven reputation layer for AI agents. Built on ERC-8004, ACK surfaces trust through consensus.',
    tags: ['erc-8004', 'reputation', 'trust'],
  };
  record.agentCard.name = 'ACK';
  savedRecords.saveActivatedRecord(record);
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });

  const response = await api.handleRequest(new Request('https://multipass.example.test/multipass/share/ack-19125'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.ok(html.includes('<title>ACK Multipass</title>'));
  assert.ok(html.includes('<meta property="og:title" content="ACK Multipass" />'));
  assert.match(html, /<meta property="og:description" content="ACK .*ERC-8004/i);
  assert.ok(html.includes('<meta property="og:image" content="https://multipass.example.test/multipass/share/ack-19125.jpg" />'));
  assert.ok(html.includes('<meta property="og:image:type" content="image/jpeg" />'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(html.includes('<meta name="twitter:image" content="https://multipass.example.test/multipass/share/ack-19125.jpg" />'));
  assert.ok(html.includes('<link rel="canonical" href="https://multipass.example.test/multipass/share/ack-19125" />'));
  assert.ok(html.includes('<a class="open-profile" href="https://multipass.example.test/multipass/ack-19125">Open Multipass profile</a>'));
  assert.ok(html.includes("window.location.replace('https://multipass.example.test/multipass/ack-19125')"));
  assert.doesNotMatch(html, /privateKey|accessToken|apiKey/);
});

test('GET /multipass/share/:id.jpg fetches and persists HTTPS profile images into the generated card', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecordWithSourceContext({
    sourceType: 'erc8004_identity',
    canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125',
    tokenId: '19125',
    slug: 'ack-19125',
    multipassId: 'mp_erc8004_8453_19125',
  });
  record.profile.display_name = 'ACK';
  record.profile.discovery_profile = {
    ...record.profile.discovery_profile,
    summary: 'ACK (Agent Consensus Kudos) is a peer-driven reputation layer for AI agents. Built on ERC-8004, ACK surfaces trust through consensus.',
    tags: ['erc-8004', 'reputation', 'trust'],
    avatar_url: 'https://example.com/red-profile.png',
  };
  record.agentCard.name = 'ACK';
  savedRecords.saveActivatedRecord(record);
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(Buffer.from(RED_AVATAR_PNG_BASE64, 'base64'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  };

  try {
    const response = await api.handleRequest(new Request('https://multipass.example.test/multipass/share/ack-19125.jpg'));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.deepEqual(fetchCalls, ['https://example.com/red-profile.png']);
    const [red, green, blue] = sampleJpegPixel(bytes, { x: 915, y: 260 });
    assert.ok(red > 180 && green < 80 && blue < 80, `expected fetched profile image on card, got rgb(${red}, ${green}, ${blue})`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /multipass/share/:id.jpg renders dynamic saved-profile JPEG preview image', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecordWithSourceContext({
    sourceType: 'erc8004_identity',
    canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125',
    tokenId: '19125',
    slug: 'ack-19125',
    multipassId: 'mp_erc8004_8453_19125',
  });
  record.profile.display_name = 'ACK';
  record.profile.discovery_profile = {
    ...record.profile.discovery_profile,
    summary: 'ACK (Agent Consensus Kudos) is a peer-driven reputation layer for AI agents. Built on ERC-8004, ACK surfaces trust through consensus.',
    tags: ['erc-8004', 'reputation', 'trust'],
    avatar_url: RED_AVATAR_DATA_URL,
  };
  record.agentCard.name = 'ACK';
  savedRecords.saveActivatedRecord(record);
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });

  const response = await api.handleRequest(new Request('https://multipass.example.test/multipass/share/ack-19125.jpg'));
  const bytes = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /image\/jpeg/);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(bytes.length > 20_000);

  const [red, green, blue] = sampleJpegPixel(bytes, { x: 915, y: 260 });
  assert.ok(red > 180 && green < 80 && blue < 80, `expected saved profile image on card, got rgb(${red}, ${green}, ${blue})`);
});

test('GET /api/multipass/:id/hydrated supports saved Base ERC-8004 identity sources', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const record = makeSavedRecordWithSourceContext({
    sourceType: 'erc8004_identity',
    canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125',
    tokenId: '19125',
    slug: 'ack-19125',
    multipassId: 'mp_erc8004_8453_19125',
  });
  record.profile.display_name = 'ACK';
  record.profile.discovery_profile = {
    ...record.profile.discovery_profile,
    summary: 'ACK (Agent Consensus Kudos) is a peer-driven reputation layer for AI agents. Built on ERC-8004, ACK surfaces trust through consensus.',
    tags: ['erc-8004', 'reputation', 'trust'],
  };
  record.agentCard.name = 'ACK';
  savedRecords.saveActivatedRecord(record);
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
  });

  const hydrated = await requestJson(api, '/api/multipass/ack-19125/hydrated');
  assert.equal(hydrated.response.status, 200);
  assert.equal(hydrated.body.mode, 'saved');
  assert.equal(hydrated.body.source_identity.kind, 'erc8004_identity');
  assert.equal(hydrated.body.source_identity.canonical_id, 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125');
  assert.equal(hydrated.body.profile.slug, 'ack-19125');
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

test('GET /api/multipass/resolve previews and hydrates Base ERC-8004 identity sources', async () => {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const canonicalId = 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125';
  const record = makeSavedRecordWithSourceContext({
    sourceType: 'erc8004_identity',
    canonicalId,
    tokenId: '19125',
    slug: 'ack-19125',
    multipassId: 'mp_erc8004_8453_19125',
  });
  record.profile.display_name = 'ACK';
  record.agentCard.name = 'ACK';
  const calls = [];
  const api = createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      calls.push(input);
      assert.equal(input, canonicalId);
      return record;
    },
  });

  const preview = await requestJson(api, '/api/multipass/resolve?source=erc8004%3A8453%3A19125');
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.mode, 'activation_preview');
  assert.equal(preview.body.state, 'activated_unsaved');
  assert.equal(preview.body.source_identity.kind, 'erc8004_identity');
  assert.equal(preview.body.source_identity.canonical_id, canonicalId);
  assert.equal(preview.body.source_identity.legacy_canonical_id, 'erc8004:8453:19125');
  assert.equal(preview.body.source_identity.contract_address, '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
  assert.equal(preview.body.profile.slug, 'ack-19125');
  assert.equal(preview.body.routes_meta.public_profile, '/multipass/?agent=eip155%3A8453%3A0x8004A169FB4a3325136EB29fA0ceB6D2e539a432%3A19125');
  assert.deepEqual(calls, [canonicalId]);

  savedRecords.saveActivatedRecord(record);
  const saved = await requestJson(api, '/api/multipass/resolve?source=eip155%3A8453%3A0x8004A169FB4a3325136EB29fA0ceB6D2e539a432%3A19125');
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.mode, 'activated');
  assert.equal(saved.body.state, 'saved_record');
  assert.equal(saved.body.profile.slug, 'ack-19125');
  assert.equal(saved.body.source_identity.kind, 'erc8004_identity');
});

test('GET /api/multipass/:id/hydrated fails closed when saved source type is unsupported', async () => {
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

test('POST /api/multipass saves Base ERC-8004 source records through the same route', async () => {
  const api = makeErc8004SaveApi();

  const first = await postJson(api, '/api/multipass', { agent: 'erc8004:8453:19125' });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.created, true);
  assert.equal(first.body.state, 'saved_unclaimed');
  assert.equal(first.body.multipass_id, 'mp_erc8004_8453_19125');
  assert.equal(first.body.slug, 'ack-19125');
  assert.equal(first.body.profile.slug, 'ack-19125');
  assert.equal(first.body.sharePath, '/multipass/ack-19125');

  const saved = await requestJson(api, '/api/multipass/resolve?source=eip155%3A8453%3A0x8004A169FB4a3325136EB29fA0ceB6D2e539a432%3A19125');
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.mode, 'activated');
  assert.equal(saved.body.source_identity.kind, 'erc8004_identity');
  assert.equal(saved.body.profile.slug, 'ack-19125');
});

test('POST /api/multipass/groups/preview returns group preview record and stable members', async () => {
  const { api, savedRecords } = makeGroupApi();

  const preview = await postJson(api, '/api/multipass/groups/preview', groupPayload());

  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.schema_version, '0.1.0');
  assert.equal(preview.body.state, 'group_preview');
  assert.equal(preview.body.record.source.sourceType, 'multipass_group');
  assert.equal(preview.body.record.profile.slug, expectedGroupSlug());
  assert.deepEqual(preview.body.members.map((member) => ({
    name: member.name,
    token_id: member.token_id,
    canonical_id: member.canonical_id,
  })), [
    { name: 'Bendr 2.0', token_id: '1', canonical_id: '8453:1' },
    { name: 'Quigbot', token_id: '81', canonical_id: '8453:81' },
    { name: 'Helixa', token_id: '1066', canonical_id: '8453:1066' },
  ]);
  assert.equal(savedRecords.resolveProfile(preview.body.record.profile.slug), null);
});

test('POST /api/multipass/groups/preview returns structured validation errors with details', async () => {
  const { api } = makeGroupApi();

  const result = await postJson(api, '/api/multipass/groups/preview', groupPayload({ display_name: 'Hi' }));

  assert.equal(result.response.status, 400);
  assert.equal(result.body.schema_version, '0.1.0');
  assert.equal(result.body.error.code, 'invalid_group_activation');
  assert.match(result.body.error.message, /Display name/);
  assert.equal(result.body.error.details.field, 'display_name');
  assert.equal(result.body.error.details.min, 3);
});

test('POST /api/multipass/groups/preview maps unresolved members to group_member_not_found', async () => {
  const { api } = makeGroupApi({
    activationService: async (tokenId) => (tokenId === '1' ? fakeGroupMemberRecord('1') : null),
  });

  const result = await postJson(api, '/api/multipass/groups/preview', groupPayload({ member_ids: ['1', '81'] }));

  assert.equal(result.response.status, 404);
  assert.equal(result.body.error.code, 'group_member_not_found');
  assert.equal(result.body.error.details.token_id, '81');
  assert.equal(result.body.error.details.canonical_id, '8453:81');
});

test('POST /api/multipass/groups/preview maps resolver rate limits through the route layer', async () => {
  const { api } = makeGroupApi({
    activationService: async (tokenId) => {
      if (tokenId === '1') return fakeGroupMemberRecord('1');
      const error = new Error('Too many requests');
      error.status = 429;
      throw error;
    },
  });

  const result = await postJson(api, '/api/multipass/groups/preview', groupPayload({ member_ids: ['1', '81'] }));

  assert.equal(result.response.status, 429);
  assert.equal(result.body.error.code, 'group_member_rate_limited');
  assert.equal(result.body.error.details.token_id, '81');
  assert.equal(result.body.error.details.resolver_status, 429);
});

test('POST /api/multipass/groups/preview maps resolver outages through the route layer', async () => {
  const { api } = makeGroupApi({
    activationService: async (tokenId) => {
      if (tokenId === '1') return fakeGroupMemberRecord('1');
      const error = new Error('ECONNRESET');
      error.status = 503;
      throw error;
    },
  });

  const result = await postJson(api, '/api/multipass/groups/preview', groupPayload({ member_ids: ['1', '81'] }));

  assert.equal(result.response.status, 503);
  assert.equal(result.body.error.code, 'group_member_resolution_unavailable');
  assert.equal(result.body.error.details.token_id, '81');
  assert.equal(result.body.error.details.resolver_status, 503);
});

test('POST /api/multipass/groups ignores client-supplied record fields and rebuilds server-side', async () => {
  const { api, savedRecords } = makeGroupApi();

  const result = await postJson(api, '/api/multipass/groups', {
    ...groupPayload({ member_ids: ['1', '81'] }),
    record: { profile: { slug: 'client-injected-slug', multipass_id: 'mp_client_injected' } },
    preview: { profile: { slug: 'client-preview-slug' } },
    members: [{ name: 'Injected Member', token_id: '999', canonical_id: '8453:999' }],
    slug: 'client-slug',
    multipass_id: 'mp_client_supplied',
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.state, 'saved_group_unclaimed');
  assert.equal(result.body.slug, expectedGroupSlug(groupPayload({ member_ids: ['1', '81'] })));
  assert.notEqual(result.body.slug, 'client-slug');
  assert.notEqual(result.body.multipass_id, 'mp_client_supplied');
  assert.deepEqual(savedRecords.getSourceContext(result.body.multipass_id).sourceSnapshot.memberSummaries.map((member) => member.name), [
    'Bendr 2.0',
    'Quigbot',
  ]);
  assert.doesNotMatch(JSON.stringify(savedRecords.getSourceContext(result.body.multipass_id)), /client|Injected/);
});

test('POST /api/multipass/groups returns saved group response for new records', async () => {
  const { api } = makeGroupApi();

  const result = await postJson(api, '/api/multipass/groups', groupPayload());

  assert.equal(result.response.status, 201);
  assert.equal(result.body.schema_version, '0.1.0');
  assert.equal(result.body.state, 'saved_group_unclaimed');
  assert.equal(result.body.created, true);
  assert.equal(result.body.multipass_id, result.body.profile.multipass_id);
  assert.equal(result.body.slug, expectedGroupSlug());
  assert.equal(result.body.profile.slug, expectedGroupSlug());
  assert.equal(result.body.sharePath, `/multipass/${encodeURIComponent(result.body.profile.slug)}`);
});

test('POST /api/multipass/groups returns existing saved group for the same normalized payload', async () => {
  const { api } = makeGroupApi();

  const first = await postJson(api, '/api/multipass/groups', groupPayload({ member_ids: ['1', '8453:81'] }));
  const second = await postJson(api, '/api/multipass/groups', groupPayload({ member_ids: ['1', '81'] }));

  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.state, 'saved_group_existing');
  assert.equal(second.body.created, false);
  assert.equal(second.body.multipass_id, first.body.multipass_id);
  assert.equal(second.body.slug, first.body.slug);
});

test('POST /api/multipass/groups retries one unrelated slug collision with group suffix', async () => {
  const payload = groupPayload({ display_name: 'Collision Group', member_ids: ['1', '81'] });
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const collidingSlug = expectedGroupSlug(payload);
  savedRecords.saveActivatedRecord(makeSavedRecordWithSourceContext({
    sourceType: 'other_source',
    canonicalId: 'other:colliding-slug',
    slug: collidingSlug,
    multipassId: 'mp_unrelated_slug_collision',
  }));
  const { api } = makeGroupApi({ savedRecords });

  const result = await postJson(api, '/api/multipass/groups', payload);

  assert.equal(result.response.status, 201);
  assert.equal(result.body.created, true);
  assert.equal(result.body.slug, `${collidingSlug}-group`);
  assert.equal(savedRecords.resolveProfile('mp_unrelated_slug_collision').slug, collidingSlug);
});

test('POST /api/multipass/groups slug retry preserves sourceSnapshot copy that mentions original slug', async () => {
  const basePayload = groupPayload({ display_name: 'Collision Copy Group', member_ids: ['1', '81'] });
  const collidingSlug = expectedGroupSlug(basePayload);
  const payload = {
    ...basePayload,
    summary: `Summary keeps ${collidingSlug} as public copy.`,
    shared_policy_note: `Policy keeps ${collidingSlug} as public copy.`,
  };
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  savedRecords.saveActivatedRecord(makeSavedRecordWithSourceContext({
    sourceType: 'other_source',
    canonicalId: 'other:copy-slug-collision',
    slug: collidingSlug,
    multipassId: 'mp_unrelated_copy_slug_collision',
  }));
  const recordsByTokenId = new Map([
    ['1', fakeGroupMemberRecord('1')],
    ['81', fakeGroupMemberRecord('81', { name: `Member keeps ${collidingSlug} literal` })],
  ]);
  const { api } = makeGroupApi({ savedRecords, recordsByTokenId });

  const result = await postJson(api, '/api/multipass/groups', payload);

  assert.equal(result.response.status, 201);
  assert.equal(result.body.slug, `${collidingSlug}-group`);
  const sourceSnapshot = savedRecords.getSourceContext(result.body.multipass_id).sourceSnapshot;
  assert.equal(sourceSnapshot.summary, `Summary keeps ${collidingSlug} as public copy.`);
  assert.equal(sourceSnapshot.sharedPolicyNote, `Policy keeps ${collidingSlug} as public copy.`);
  assert.equal(sourceSnapshot.memberSummaries[1].name, `Member keeps ${collidingSlug} literal`);
});

test('POST /api/multipass/groups returns structured conflict after a second unrelated slug collision', async () => {
  const payload = groupPayload({ display_name: 'Double Collision Group', member_ids: ['1', '81'] });
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  const collidingSlug = expectedGroupSlug(payload);
  savedRecords.saveActivatedRecord(makeSavedRecordWithSourceContext({
    sourceType: 'other_source',
    canonicalId: 'other:colliding-slug-one',
    slug: collidingSlug,
    multipassId: 'mp_unrelated_slug_collision_one',
  }));
  savedRecords.saveActivatedRecord(makeSavedRecordWithSourceContext({
    sourceType: 'other_source',
    canonicalId: 'other:colliding-slug-two',
    slug: `${collidingSlug}-group`,
    multipassId: 'mp_unrelated_slug_collision_two',
  }));
  const { api } = makeGroupApi({ savedRecords });

  const result = await postJson(api, '/api/multipass/groups', payload);

  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, 'group_slug_conflict');
  assert.match(result.body.error.message, /generated slug/i);
  assert.equal(result.body.error.details.slug, collidingSlug);
  assert.equal(result.body.error.details.retry_slug, `${collidingSlug}-group`);
  assert.doesNotMatch(JSON.stringify(result.body), /UNIQUE constraint|SQLite/i);
});

test('saved group x401 route exposes Helixa group authority proof metadata', async () => {
  const { api } = makeGroupApi();
  const saved = await postJson(api, '/api/multipass/groups', groupPayload());

  const x401 = await requestJson(api, `/api/multipass/${saved.body.slug}/x401`);

  assert.equal(x401.response.status, 200);
  assert.equal(x401.body.multipass_id, saved.body.multipass_id);
  assert.equal(x401.body.x401_supported, true);
  assert.equal(x401.body.trusted_issuers[0].issuer_id, 'helixa');
  assert.equal(x401.body.proof_requirements[0].requirement_id, 'group_authority');
});

test('saved group standards-profile alias serves the public standards document', async () => {
  const { api } = makeGroupApi();
  const saved = await postJson(api, '/api/multipass/groups', groupPayload());

  const canonical = await requestJson(api, `/api/multipass/${saved.body.slug}/standards`);
  const alias = await requestJson(api, `/api/multipass/${saved.body.slug}/standards-profile`);

  assert.equal(canonical.response.status, 200);
  assert.equal(alias.response.status, 200);
  assert.deepEqual(alias.body, canonical.body);
  assert.equal(alias.body.multipass_id, saved.body.multipass_id);
  assert.ok(alias.body.standard_refs.some((ref) => ref.standard_id === 'ERC-8004'));
});

test('group parent manager controls allow review-approved public edits without mutating imported roster proof', async () => {
  const { api } = makeGroupApi({
    adminSecret: 'test-admin-secret',
    signatureVerifier: async ({ wallet, message, signature }) => {
      assert.match(message, /Helixa Multipass claim management/);
      return signature === `valid:${wallet.toLowerCase()}`;
    },
  });
  const saved = await postJson(api, '/api/multipass/groups', groupPayload());
  assert.equal(saved.response.status, 201);

  const pending = await postJsonWithHeaders(api, `/api/multipass/${saved.body.slug}/claim/verify`, {
    mode: 'manual_review',
    proposedManagerWallet: MANAGER_WALLET,
    contactRoute: 'agentmail:team@example.test',
    note: 'Approve the team wallet for safe public group metadata edits.',
  }, { origin: 'https://multipass.example.test' });
  assert.equal(pending.response.status, 202);
  assert.equal(pending.body.claim_status, 'claim_pending');
  assert.equal(pending.response.headers.get('set-cookie'), null);
  assert.match(pending.body.profile.owner_summary.summary, /does not transfer custody, tools, credentials, or ownership/i);

  const approved = await postJsonWithHeaders(api, `/api/admin/multipass/${saved.body.slug}/claims/${pending.body.claim.claim_id}/approve`, {}, {
    origin: 'https://multipass.example.test',
    'x-admin-secret': 'test-admin-secret',
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.claim_status, 'claimed_review_approved');

  const nonce = await postJsonWithHeaders(api, `/api/multipass/${saved.body.slug}/claim/nonce`, {}, { origin: 'https://multipass.example.test' });
  const session = await postJsonWithHeaders(api, `/api/multipass/${saved.body.slug}/claim/verify`, {
    mode: 'wallet_signature',
    wallet: MANAGER_WALLET,
    nonce: nonce.body.nonce,
    signature: `valid:${MANAGER_WALLET.toLowerCase()}`,
  }, { origin: 'https://multipass.example.test' });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.claim_status, 'claimed_review_approved');
  const headers = {
    origin: 'https://multipass.example.test',
    cookie: session.response.headers.get('set-cookie'),
    'x-csrf-token': session.body.csrfToken,
  };

  const edited = await patchJsonWithHeaders(api, `/api/multipass/${saved.body.slug}/profile`, {
    display_name: 'Helixa Swarm Managed',
    summary: 'Managed public parent Multipass metadata for the Helixa Swarm.',
    avatar_url: 'https://assets.example.test/helixa-swarm.png',
    tags: ['helixa', 'swarm', 'managed'],
  }, headers);
  assert.equal(edited.response.status, 200);
  assert.deepEqual(edited.body.changedFields, ['display_name', 'summary', 'avatar_url', 'tags']);
  assert.equal(edited.body.profile.subject_type, 'swarm');
  assert.equal(edited.body.profile.display_name, 'Helixa Swarm Managed');

  const fragments = await requestJson(api, `/api/multipass/${saved.body.slug}/fragments`);
  const roster = fragments.body.fragments.find((fragment) => fragment.fragment_id.includes('_roster'));
  assert.ok(roster);
  const readOnlyRosterEdit = await patchJsonWithHeaders(api, `/api/multipass/${saved.body.slug}/fragments/${roster.fragment_id}`, {
    public_value: 'Manager should not rewrite imported roster proof.',
  }, headers);
  assert.equal(readOnlyRosterEdit.response.status, 403);
  assert.equal(readOnlyRosterEdit.body.error.code, 'forbidden');

  const bodyText = JSON.stringify({ pending: pending.body, approved: approved.body, edited: edited.body, readOnlyRosterEdit: readOnlyRosterEdit.body });
  assert.doesNotMatch(bodyText, /custody transferred|transfer ownership|executes tools|private credential access|payment proves trust|authority over members/i);
});

test('POST /api/multipass/groups persists group sourceSnapshot through the API path', async () => {
  const { api, savedRecords } = makeGroupApi();

  const saved = await postJson(api, '/api/multipass/groups', groupPayload({
    display_name: 'Source Snapshot Group',
    summary: 'Snapshot survives the route layer.',
    shared_policy_note: 'Snapshot policy note.',
    member_ids: ['1', '81'],
  }));

  assert.equal(saved.response.status, 201);
  assert.deepEqual(savedRecords.getSourceContext(saved.body.multipass_id).sourceSnapshot, {
    sourceType: 'multipass_group',
    subjectType: 'swarm',
    displayName: 'Source Snapshot Group',
    summary: 'Snapshot survives the route layer.',
    sharedPolicyNote: 'Snapshot policy note.',
    fingerprint: saved.body.multipass_id.replace('mp_group_swarm_', ''),
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
    ],
  });
});

test('GET saved profile resolves before fixture store and exposes saved documents', async () => {
  const api = makeSaveApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const profileRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(profileRead.response.status, 200);
  assert.equal(profileRead.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(profileRead.body.slug, 'bendr-2-1');

  const savedCard = await requestJson(api, '/api/multipass/bendr-2-1/card');
  const savedAgentCard = await requestJson(api, '/api/multipass/bendr-2-1/agent-card');
  assert.equal(savedCard.body.name, 'Bendr 2.0');
  assert.equal(savedAgentCard.body.name, 'Bendr 2.0');
  assert.match(savedAgentCard.body.summary, /public agent profile/i);
  assert.ok(Array.isArray(savedAgentCard.body.links));
  const linkRels = new Set(savedAgentCard.body.links.map((link) => link.rel));
  for (const rel of ['profile', 'hydrated', 'tools', 'x402', 'receipts', 'changes']) {
    assert.ok(linkRels.has(rel), `missing ${rel} link`);
  }
  assert.ok(Array.isArray(savedAgentCard.body.services));
  assert.ok(Array.isArray(savedAgentCard.body.boundaries));
  const boundaries = savedAgentCard.body.boundaries.join(' ');
  assert.match(boundaries, /does not execute tools/i);
  assert.match(boundaries, /transfer custody/i);
  assert.doesNotThrow(() => assertAgentCard(savedCard.body));
  assert.doesNotThrow(() => assertAgentCard(savedAgentCard.body));
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


function marketplaceRef(overrides = {}) {
  return {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    title: 'Helixa agent profile',
    summary: 'Public marketplace listing for Helixa services.',
    listing_id: 'helixa',
    status: 'manager_supplied',
    services: [{ name: 'Deep CRED report', price: '$1 USDC', payment_mode: 'x402', endpoint_url: 'https://api.example.test/service' }],
    payment_rails: [{ asset: 'USDC', mode: 'x402', chain: 'Base' }],
    facts: [{ label: 'Source', value: 'Manager supplied public listing' }],
    ...overrides,
  };
}

function marketplacePayload(ref = marketplaceRef()) {
  return {
    fragment_type: 'attestation',
    public_value: `Marketplace connection: ${ref.title} on ${ref.marketplace}. ${ref.summary}`,
    reference_url: ref.profile_url,
    transfer_policy: 'historical_on_transfer',
    marketplace_ref: ref,
  };
}

test('manager session creates updates and retires Marketplace Connection fragments', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);

  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({ source_checked_at: '2026-07-06' })), headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.fragment_type, 'attestation');
  assert.equal(created.body.fragment.status, 'pending');
  assert.equal(created.body.fragment.assurance_level, 'self_attested');
  assert.equal(created.body.fragment.visibility, 'public');
  assert.equal(created.body.fragment.transfer_policy, 'historical_on_transfer');
  assert.equal(created.body.fragment.source.issuer, null);
  assert.equal(created.body.fragment.source.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(created.body.fragment.marketplace_ref.source_checked_at, '2026-07-06T00:00:00.000Z');

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(publicRead.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(publicRead.body.profile, undefined);
  assert.deepEqual(publicRead.body.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);

  const hydrated = await requestJson(api, '/api/multipass/bendr-2-1/hydrated');
  assert.deepEqual(hydrated.body.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);
  assert.deepEqual(hydrated.body.profile.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);

  const updatedRef = marketplaceRef({ title: 'Updated title', summary: 'Updated summary.', status: 'stale', source_checked_at: '' });
  const updated = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}`, marketplacePayload(updatedRef), headers);
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.fragment.status, 'stale');
  assert.equal(updated.body.fragment.marketplace_ref.title, 'Updated title');
  assert.equal(updated.body.fragment.marketplace_ref.summary, 'Updated summary.');
  assert.equal(Object.hasOwn(updated.body.fragment.marketplace_ref, 'source_checked_at'), false);

  const revoked = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}/revoke`, {}, headers);
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.fragment.status, 'revoked');

  const afterRevoke = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(afterRevoke.body.marketplacePresence.some((entry) => entry.fragmentId === created.body.fragment.fragment_id), false);

  const changes = await requestJson(api, '/api/multipass/bendr-2-1/changes');
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection added: Bankr\./);
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection updated: Bankr\./);
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection retired: Bankr\./);
});

test('Marketplace Connection fragment writes reject unsafe and generic top-level-only edits', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(), headers);
  const fragmentId = created.body.fragment.fragment_id;

  const cases = [
    ['non-https', marketplacePayload(marketplaceRef({ profile_url: 'http://bankr.bot/agents/helixa' }))],
    ['credentials', marketplacePayload(marketplaceRef({ profile_url: 'https://user:pass@bankr.bot/agents/helixa' }))],
    ['mismatched reference url', { ...marketplacePayload(), reference_url: 'https://bankr.bot/agents/not-helixa' }],
    ['service non-https endpoint', marketplacePayload(marketplaceRef({ services: [{ name: 'Bad service', endpoint_url: 'http://api.example.test/service' }] }))],
    ['service credentialed endpoint', marketplacePayload(marketplaceRef({ services: [{ name: 'Bad service', endpoint_url: 'https://user:pass@api.example.test/service' }] }))],
    ['unsafe text', marketplacePayload(marketplaceRef({ summary: '<img onerror=alert(1)>' }))],
    ['wrong type', { ...marketplacePayload(), fragment_type: 'wallet' }],
    ['verified display status', marketplacePayload(marketplaceRef({ status: 'verified' }))],
    ['platform verified display status', marketplacePayload(marketplaceRef({ status: 'platform_verified' }))],
    ['future source checked', marketplacePayload(marketplaceRef({ source_checked_at: '2999-01-01T00:00:00.000Z' }))],
    ['invalid source checked', marketplacePayload(marketplaceRef({ source_checked_at: 'not a date' }))],
  ];

  for (const [, payload] of cases) {
    const result = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', payload, headers);
    assert.equal(result.response.status, 400);
  }

  const patchMismatch = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${fragmentId}`, {
    ...marketplacePayload(),
    reference_url: 'https://bankr.bot/agents/not-helixa',
  }, headers);
  assert.equal(patchMismatch.response.status, 400);

  const guardedPatch = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${fragmentId}`, { status: 'stale' }, headers);
  assert.equal(guardedPatch.response.status, 403);
  assert.equal(guardedPatch.body.error.message, 'Marketplace Connection fragments must be edited through Marketplace Connections.');

  for (const patch of [
    { reference_url: 'https://bankr.bot/agents/other' },
    { transfer_policy: 'never_transfer' },
    { public_value: 'Generic edit' },
    { proof_reference: 'Generic proof' },
    { endpoint_ref: { endpoint_id: 'bad', url: 'https://example.test', protocol: 'web' } },
  ]) {
    const result = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${fragmentId}`, patch, headers);
    assert.equal(result.response.status, 403);
  }
});

test('Marketplace Connection normalization bounds optional row arrays', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({
    services: Array.from({ length: 12 }, (_, index) => ({ name: `Service ${index}` })),
    payment_rails: Array.from({ length: 12 }, (_, index) => ({ asset: `Asset ${index}` })),
    facts: Array.from({ length: 12 }, (_, index) => ({ label: `Fact ${index}`, value: 'Public value' })),
  })), headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.marketplace_ref.services.length, 8);
  assert.equal(created.body.fragment.marketplace_ref.payment_rails.length, 8);
  assert.equal(created.body.fragment.marketplace_ref.facts.length, 8);
});

test('saved API de-dupes Marketplace Connections by normalized profile URL', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const first = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({ title: 'First Bankr listing' })), headers);
  assert.equal(first.response.status, 201);
  const duplicate = marketplaceRef({
    profile_url: 'https://bankr.bot/agents/helixa/',
    title: 'Duplicate Bankr listing',
  });
  const second = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(duplicate), headers);
  assert.equal(second.response.status, 201);

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(publicRead.body.marketplacePresence.length, 1);
  assert.equal(publicRead.body.marketplacePresence[0].title, 'First Bankr listing');
});

test('saved API omits unsafe historical Marketplace Connection text from public reads', async () => {
  const baseMarketplaceFragment = {
    schema_version: '0.1.0',
    multipass_id: 'mp_bendr',
    fragment_type: 'attestation',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'historical_on_transfer',
    source: {
      source_type: 'owner_submission',
      source_id: 'manager:frag_marketplace_historical',
      issuer: null,
      observed_at: '2026-07-06T00:00:00Z',
      reference_url: 'https://bankr.bot/agents/helixa',
    },
    public_value: 'Marketplace connection.',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  };
  const unsafeRequired = {
    ...baseMarketplaceFragment,
    fragment_id: 'frag_marketplace_required_unsafe',
    marketplace_ref: marketplaceRef({ summary: 'Unsafe <script>alert(1)</script>' }),
  };
  const unsafeOptional = {
    ...baseMarketplaceFragment,
    fragment_id: 'frag_marketplace_optional_unsafe',
    marketplace_ref: marketplaceRef({
      listing_id: 'helixa<script>',
      source_checked_at: '2026-07-06T00:00:00.000Z<script>',
      services: [
        { name: 'Deep CRED <script>', price: '$1 USDC', payment_mode: 'javascript:alert(1)', endpoint_url: 'https://api.example.test/service' },
        { name: '<img onerror=x>' },
      ],
      payment_rails: [
        { asset: 'USDC', mode: 'data:text/html', chain: 'Base' },
        { asset: '<bad>' },
      ],
      reputation: { score: '95', positive_rate: '99%<script>', sold_count: '12', review_count: 'javascript:alert(1)' },
      facts: [
        { label: 'Source', value: '<script>alert(1)</script>' },
        { label: 'Safe fact', value: 'Safe value' },
        { label: '<img onerror=x>' },
      ],
    }),
  };
  const api = createMultipassApi({
    store: {
      resolveProfile(identifier) {
        return identifier === 'bendr-2' || identifier === 'mp_bendr' ? profile : null;
      },
      getPublicFragments() {
        return [unsafeRequired, unsafeOptional];
      },
      searchProfiles() {
        return [];
      },
    },
    baseUrl: 'https://multipass.example.test',
  });

  const publicRead = await requestJson(api, '/api/multipass/bendr-2');
  assert.equal(publicRead.response.status, 200);
  assert.equal(publicRead.body.marketplacePresence.length, 1);
  const [entry] = publicRead.body.marketplacePresence;
  assert.equal(entry.fragmentId, 'frag_marketplace_optional_unsafe');
  assert.equal(entry.marketplace, 'Bankr');
  assert.equal(entry.listingId, '');
  assert.equal(entry.title, 'Helixa agent profile');
  assert.equal(entry.summary, 'Public marketplace listing for Helixa services.');
  assert.deepEqual(entry.services, [{ price: '$1 USDC', endpointUrl: 'https://api.example.test/service' }]);
  assert.deepEqual(entry.paymentRails, [{ asset: 'USDC', chain: 'Base' }]);
  assert.deepEqual(entry.reputation, { score: '95', sold_count: '12' });
  assert.deepEqual(entry.facts, [{ label: 'Source' }, { label: 'Safe fact', value: 'Safe value' }]);
  assert.equal(entry.source.checkedAt, '');
  assert.doesNotMatch(JSON.stringify(publicRead.body.marketplacePresence), /<|>|javascript:|data:|file:|onerror|onload|script/i);
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
      url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1/',
      manifest_url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1/manifest/',
      protocol: 'api',
    },
  }, headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.fragment_type, 'endpoint');
  assert.equal(created.body.fragment.endpoint_ref.protocol, 'api');
  assert.equal(created.body.fragment.endpoint_ref.url, 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1/');
  assert.equal(created.body.fragment.endpoint_ref.manifest_url, 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1/manifest/');
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


test('public x401 manifest exposes proof challenge metadata without private credentials or partnership claims', async () => {
  const api = makeCustomApi({ fragments: [publicFragment, privateFragment, x401ProofFragment] });
  const response = await api.handleRequest(new Request('https://multipass.example.test/api/multipass/bendr-2/x401'));
  assert.equal(response.status, 200);
  const body = await response.json();

  assertX401Manifest(body);
  assert.equal(body.x401_supported, true);
  assert.equal(body.current_header_names.request, 'PROOF-REQUEST');
  assert.equal(body.proof_requirements[0].required_before_payment, true);
  assert.equal(body.proof_requirements[0].accepted_issuers[0], 'proof');
  assert.match(body.boundaries.join(' '), /does not expose private credentials/i);
  assert.doesNotMatch(JSON.stringify(body), /partner/i);
});

test('agent-card discovery links include the x401 public manifest', async () => {
  const api = makeApi();
  const response = await api.handleRequest(new Request('https://multipass.example.test/api/multipass/bendr-2/agent-card'));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.x401_manifest_url, 'https://multipass.example.test/api/multipass/bendr-2/x401');
  assert.ok(body.links.some((link) => link.rel === 'x401' && link.href.endsWith('/x401')));
});

test('discovery document advertises x401 as an identity proof layer beside x402', async () => {
  const api = makeApi();
  const response = await api.handleRequest(new Request('https://multipass.example.test/.well-known/multipass.json'));
  const body = await response.json();

  assert.equal(body.routes.x401, 'https://multipass.example.test/api/multipass/{id}/x401');
  assert.match(body.agent_instructions.join(' '), /x401/i);
  assert.match(body.description, /x401/);
});

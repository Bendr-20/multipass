import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAgentCard, validateX402Manifest } from '@helixa/multipass-sdk';

import {
  deriveAgentCardServiceUpdates,
  deriveX402ManifestFromTools,
  getPublicToolFragments,
  normalizeBankrServiceTool,
  normalizeToolManifestFragment,
  summarizeToolsResponse,
} from '../src/tool-manifest.js';

const MP = 'mp_bendr';
const NOW = '2026-06-24T00:00:00Z';

function makeToolFragment(overrides = {}, refOverrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: overrides.fragment_id ?? 'frag_tool_lookup',
    multipass_id: overrides.multipass_id ?? MP,
    fragment_type: overrides.fragment_type ?? 'tool_manifest',
    status: overrides.status ?? 'verified',
    assurance_level: overrides.assurance_level ?? 'platform_verified',
    visibility: overrides.visibility ?? 'public',
    transfer_policy: overrides.transfer_policy ?? 'pause_on_transfer',
    source: overrides.source ?? {
      source_type: 'registry_import',
      source_id: 'bankr_x402_cloud:lookup',
      issuer: 'bankr_x402_cloud',
      observed_at: NOW,
    },
    tool_manifest_ref: overrides.tool_manifest_ref === undefined ? {
      tool_id: refOverrides.tool_id ?? 'lookup',
      registry: refOverrides.registry ?? 'bankr_x402_cloud',
      name: refOverrides.name ?? 'Lookup Tool',
      description: refOverrides.description ?? 'Looks up a Multipass profile.',
      endpoint_url: refOverrides.endpoint_url ?? 'https://api.example.test/tools/lookup',
      manifest_url: refOverrides.manifest_url ?? 'https://api.example.test/tools/lookup/manifest.json',
      manifest_hash: refOverrides.manifest_hash ?? 'sha256:abc123',
      creator_address: refOverrides.creator_address ?? '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
      pricing: refOverrides.pricing ?? {
        model: 'fixed',
        amount: '0.01',
        asset: 'USDC',
        chain_id: 8453,
      },
      access: refOverrides.access ?? {
        summary: 'Public x402 access.',
        requires_owner_approval: false,
      },
      schemas: refOverrides.schemas ?? {
        input_summary: 'Multipass id or slug.',
        output_summary: 'Multipass profile JSON.',
      },
      verifiability: refOverrides.verifiability ?? {
        tier: 'provider_verified',
        summary: 'Imported from Bankr x402 Cloud.',
      },
      last_checked_at: refOverrides.last_checked_at ?? '2026-06-24T00:05:00Z',
    } : overrides.tool_manifest_ref,
    created_at: overrides.created_at ?? NOW,
    updated_at: overrides.updated_at ?? NOW,
  };
}

function makeEndpointFragment() {
  return {
    schema_version: '0.1.0',
    fragment_id: 'frag_endpoint',
    multipass_id: MP,
    fragment_type: 'endpoint',
    status: 'verified',
    assurance_level: 'platform_verified',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: {
      source_type: 'owner_submission',
      source_id: 'endpoint:lookup',
      issuer: null,
      observed_at: NOW,
    },
    public_value: 'Public endpoint.',
    endpoint_ref: {
      endpoint_id: 'lookup',
      url: 'https://api.example.test/lookup',
      protocol: 'api',
    },
    created_at: NOW,
    updated_at: NOW,
  };
}

function makeAgentCard() {
  return {
    schema_version: '0.1.0',
    multipass_id: MP,
    name: 'Bendr 2.0',
    subject_type: 'agent',
    capabilities: [{ capability_id: 'chat', label: 'Chat', visibility: 'public' }],
    message_routes: [],
    service_endpoints: [
      {
        endpoint_id: 'status',
        url: 'https://api.example.test/status',
        description: 'Status endpoint.',
        visibility: 'public',
      },
      {
        endpoint_id: 'lookup',
        url: 'https://old.example.test/tools/lookup',
        description: 'Old lookup endpoint.',
        visibility: 'public',
      },
    ],
    x402_manifest_url: null,
    accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
    trust_summary: {
      identity_status: 'verified',
      assurance_level: 'platform_verified',
      last_updated_at: NOW,
    },
    rate_limits: { requests: 0, window_seconds: 60 },
    contact_policy: { mode: 'approval_required', requires_owner_approval: true },
    standards_refs: [],
  };
}

test('normalizeBankrServiceTool converts Bankr x402 service config to a tool manifest fragment', () => {
  const config = {
    network: 'base',
    currency: 'USDC',
    services: {
      'cred-report': {
        price: '1.00',
        description: 'Helixa AgentDNA cred report.',
        methods: ['GET'],
        schema: { queryParams: { id: 'number - AgentDNA token ID' }, output: { score: 'number' } },
      },
    },
  };

  const fragment = normalizeBankrServiceTool({
    multipassId: 'mp_bendr_2',
    serviceName: 'cred-report',
    service: config.services['cred-report'],
    network: config.network,
    currency: config.currency,
    endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report',
    now: '2026-07-01T00:00:00.000Z',
  });

  assert.equal(fragment.fragment_type, 'tool_manifest');
  assert.equal(fragment.multipass_id, 'mp_bendr_2');
  assert.equal(fragment.tool_manifest_ref.tool_id, 'cred-report');
  assert.equal(fragment.tool_manifest_ref.registry, 'bankr_x402_cloud');
  assert.equal(fragment.tool_manifest_ref.endpoint_url, 'https://api.bankr.bot/x402/helixa/cred-report');
  assert.equal(fragment.tool_manifest_ref.pricing.model, 'fixed');
  assert.equal(fragment.tool_manifest_ref.pricing.amount, '1.00');
  assert.equal(fragment.tool_manifest_ref.pricing.asset, 'USDC');
  assert.equal(fragment.tool_manifest_ref.pricing.chain_id, 8453);
  assert.match(fragment.tool_manifest_ref.schemas.input_summary, /queryParams\.id: number - AgentDNA token ID/);
  assert.match(fragment.tool_manifest_ref.schemas.output_summary, /output\.score: number/);
  assert.doesNotMatch(fragment.tool_manifest_ref.schemas.input_summary, /\{\"/);
});

test('getPublicToolFragments returns only public tool manifest fragments with refs', () => {
  const publicTool = makeToolFragment();
  const privateTool = makeToolFragment({ fragment_id: 'frag_tool_private', visibility: 'private' });
  const missingRef = makeToolFragment({ fragment_id: 'frag_tool_missing', tool_manifest_ref: null });

  const tools = getPublicToolFragments([publicTool, privateTool, makeEndpointFragment(), missingRef]);

  assert.deepEqual(tools.map((tool) => tool.fragment_id), ['frag_tool_lookup']);
  assert.equal(tools[0].fragment_type, 'tool_manifest');
  assert.equal(tools[0].visibility, 'public');
  assert.equal(tools[0].tool_manifest_ref.tool_id, 'lookup');
  assert.equal(tools[0].tool_manifest_ref.registry, 'bankr_x402_cloud');
});

test('summarizeToolsResponse returns normalized public cards and counts', () => {
  const verifiedBankr = makeToolFragment();
  const staleHelixa = makeToolFragment(
    { fragment_id: 'frag_tool_analysis', status: 'stale' },
    {
      tool_id: 'analysis',
      registry: 'helixa_api',
      name: 'Analysis Tool',
      endpoint_url: 'https://api.example.test/tools/analysis',
      manifest_url: null,
      pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    },
  );
  const revokedBankr = makeToolFragment(
    { fragment_id: 'frag_tool_revoked', status: 'revoked' },
    { tool_id: 'old-lookup', name: 'Old Lookup', endpoint_url: 'https://api.example.test/tools/old-lookup' },
  );
  const privateTool = makeToolFragment({ fragment_id: 'frag_tool_private', visibility: 'private' });

  const response = summarizeToolsResponse(MP, [verifiedBankr, staleHelixa, revokedBankr, privateTool]);

  assert.equal(response.schema_version, '0.1.0');
  assert.equal(response.multipass_id, MP);
  assert.deepEqual(response.tools.map((tool) => tool.tool_id), ['lookup', 'analysis', 'old-lookup']);
  assert.deepEqual(response.tools[0], {
    fragment_id: 'frag_tool_lookup',
    multipass_id: MP,
    tool_id: 'lookup',
    registry: 'bankr_x402_cloud',
    name: 'Lookup Tool',
    description: 'Looks up a Multipass profile.',
    endpoint_url: 'https://api.example.test/tools/lookup',
    manifest_url: 'https://api.example.test/tools/lookup/manifest.json',
    manifest_hash: 'sha256:abc123',
    creator_address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    pricing: { model: 'fixed', amount: '0.01', asset: 'USDC', chain_id: 8453 },
    access: { summary: 'Public x402 access.', requires_owner_approval: false },
    schemas: { input_summary: 'Multipass id or slug.', output_summary: 'Multipass profile JSON.' },
    verifiability: { tier: 'provider_verified', summary: 'Imported from Bankr x402 Cloud.' },
    status: 'verified',
    assurance_level: 'platform_verified',
    visibility: 'public',
    last_checked_at: '2026-06-24T00:05:00Z',
    updated_at: NOW,
  });
  assert.deepEqual(response.summary, {
    total: 3,
    x402_count: 2,
    verified_count: 1,
    stale_count: 1,
  });
});

test('deriveX402ManifestFromTools includes only active public Bankr x402 tools', () => {
  const verifiedBankr = makeToolFragment();
  const pendingBankr = makeToolFragment(
    { fragment_id: 'frag_tool_pay', status: 'pending' },
    { tool_id: 'pay', name: 'Pay Tool', endpoint_url: 'https://api.example.test/tools/pay' },
  );
  const revokedBankr = makeToolFragment(
    { fragment_id: 'frag_tool_revoked', status: 'revoked' },
    { tool_id: 'old-lookup', name: 'Old Lookup', endpoint_url: 'https://api.example.test/tools/old-lookup' },
  );
  const helixaTool = makeToolFragment(
    { fragment_id: 'frag_tool_analysis' },
    { tool_id: 'analysis', registry: 'helixa_api', name: 'Analysis Tool', endpoint_url: 'https://api.example.test/tools/analysis' },
  );
  const privateBankr = makeToolFragment({ fragment_id: 'frag_tool_private', visibility: 'private' });

  const manifest = deriveX402ManifestFromTools(MP, [verifiedBankr, pendingBankr, revokedBankr, helixaTool, privateBankr]);

  assert.equal(validateX402Manifest(manifest).ok, true);
  assert.deepEqual(manifest.endpoints.map((endpoint) => endpoint.endpoint_id), ['lookup', 'pay']);
  assert.deepEqual(manifest.endpoints[0], {
    endpoint_id: 'lookup',
    url: 'https://api.example.test/tools/lookup',
    method: 'POST',
    description: 'Looks up a Multipass profile.',
    price: { amount: '0.01', decimals: 18 },
    asset: 'USDC',
    chain_id: 8453,
    provider: 'bankr_x402_cloud',
    settlement_reference_policy: 'provider_receipt',
    rate_limit: { requests: 0, window_seconds: 60 },
    visibility: 'public',
    requires_owner_approval: false,
  });
});

test('normalizeToolManifestFragment rejects insecure credentialed URLs and malformed creator addresses', () => {
  assert.throws(
    () => normalizeToolManifestFragment(makeToolFragment({}, { endpoint_url: 'http://api.example.test/tools/lookup' })),
    /endpoint_url.*https/i,
  );
  assert.throws(
    () => normalizeToolManifestFragment(makeToolFragment({}, { manifest_url: 'http://api.example.test/tools/lookup/manifest.json' })),
    /manifest_url.*https/i,
  );
  assert.throws(
    () => normalizeToolManifestFragment(makeToolFragment({}, { endpoint_url: 'https://user:secret@api.example.test/tools/lookup' })),
    /endpoint_url.*credentials/i,
  );
  assert.throws(
    () => normalizeToolManifestFragment(makeToolFragment({}, { manifest_url: 'https://user:secret@api.example.test/tools/lookup/manifest.json' })),
    /manifest_url.*credentials/i,
  );
  assert.throws(
    () => normalizeToolManifestFragment(makeToolFragment({}, { creator_address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' })),
    /creator_address|pattern|lowercase/i,
  );
});

test('deriveAgentCardServiceUpdates appends tool summaries and accepted assets without dropping existing fields', () => {
  const card = makeAgentCard();
  const lookup = makeToolFragment();
  const analysis = makeToolFragment(
    { fragment_id: 'frag_tool_analysis', status: 'stale' },
    {
      tool_id: 'analysis',
      registry: 'helixa_api',
      name: 'Analysis Tool',
      description: 'Runs an analysis job.',
      endpoint_url: 'https://api.example.test/tools/analysis',
      manifest_url: null,
      pricing: { model: 'metered', amount: '2', asset: 'USDC', chain_id: 8453 },
    },
  );

  const updated = deriveAgentCardServiceUpdates(card, [lookup, analysis], 'https://multipass.example.test/');

  assert.equal(validateAgentCard(updated).ok, true);
  assert.equal(updated.name, card.name);
  assert.deepEqual(updated.capabilities, card.capabilities);
  assert.equal(updated.trust_summary, card.trust_summary);
  assert.deepEqual(updated.service_endpoints, [
    {
      endpoint_id: 'status',
      url: 'https://api.example.test/status',
      description: 'Status endpoint.',
      visibility: 'public',
    },
    {
      endpoint_id: 'lookup',
      url: 'https://old.example.test/tools/lookup',
      description: 'Old lookup endpoint.',
      visibility: 'public',
    },
    {
      endpoint_id: 'analysis',
      url: 'https://api.example.test/tools/analysis',
      description: 'Analysis Tool: Runs an analysis job.',
      visibility: 'public',
    },
  ]);
  assert.deepEqual(updated.accepted_assets, [
    { asset: 'CRED', chain_id: 8453 },
    { asset: 'USDC', chain_id: 8453 },
  ]);
  assert.equal(updated.x402_manifest_url, 'https://multipass.example.test/api/multipass/mp_bendr/x402');
});

test('deriveAgentCardServiceUpdates rejects credentialed base URLs', () => {
  assert.throws(
    () => deriveAgentCardServiceUpdates(makeAgentCard(), [makeToolFragment()], 'https://user:secret@multipass.example.test/'),
    /baseUrl.*credentials/i,
  );
  assert.throws(
    () => deriveAgentCardServiceUpdates(makeAgentCard(), [], 'https://user:secret@multipass.example.test/'),
    /baseUrl.*credentials/i,
  );
});

test('deriveAgentCardServiceUpdates does not overwrite or publicize existing gated endpoints', () => {
  const card = makeAgentCard();
  card.service_endpoints = [
    {
      endpoint_id: 'lookup',
      url: 'https://old.example.test/tools/lookup',
      description: 'Gated lookup endpoint.',
      visibility: 'gated',
    },
  ];
  const analysis = makeToolFragment(
    { fragment_id: 'frag_tool_analysis' },
    {
      tool_id: 'analysis',
      registry: 'helixa_api',
      name: 'Analysis Tool',
      description: 'Runs an analysis job.',
      endpoint_url: 'https://api.example.test/tools/analysis',
      manifest_url: null,
      pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    },
  );

  const updated = deriveAgentCardServiceUpdates(card, [makeToolFragment(), analysis], 'https://multipass.example.test/');

  assert.equal(validateAgentCard(updated).ok, true);
  assert.deepEqual(updated.service_endpoints, [
    {
      endpoint_id: 'lookup',
      url: 'https://old.example.test/tools/lookup',
      description: 'Gated lookup endpoint.',
      visibility: 'gated',
    },
    {
      endpoint_id: 'analysis',
      url: 'https://api.example.test/tools/analysis',
      description: 'Analysis Tool: Runs an analysis job.',
      visibility: 'public',
    },
  ]);
});

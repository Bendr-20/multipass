import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHydratedProfileResponse,
  normalizeMultipassSourceInput,
} from '../src/canonical-profile.js';

test('normalizeMultipassSourceInput accepts Helixa AgentDNA shorthand and explicit source ids', () => {
  assert.deepEqual(normalizeMultipassSourceInput('1'), {
    kind: 'helixa_agentdna',
    sourceType: 'helixa_agent',
    canonicalId: 'helixa-agentdna:8453:1',
    legacyCanonicalId: '8453:1',
    chainId: 8453,
    tokenId: '1',
  });
  assert.equal(normalizeMultipassSourceInput('8453:1').canonicalId, 'helixa-agentdna:8453:1');
  assert.equal(normalizeMultipassSourceInput('helixa-agentdna:8453:1').legacyCanonicalId, '8453:1');
  assert.deepEqual(normalizeMultipassSourceInput('001'), {
    kind: 'helixa_agentdna',
    sourceType: 'helixa_agent',
    canonicalId: 'helixa-agentdna:8453:1',
    legacyCanonicalId: '8453:1',
    chainId: 8453,
    tokenId: '1',
  });
  assert.deepEqual(normalizeMultipassSourceInput('8453:001'), {
    kind: 'helixa_agentdna',
    sourceType: 'helixa_agent',
    canonicalId: 'helixa-agentdna:8453:1',
    legacyCanonicalId: '8453:1',
    chainId: 8453,
    tokenId: '1',
  });
});

test('normalizeMultipassSourceInput accepts Base ERC-8004 identity ids', () => {
  const registry = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
  const canonical = `eip155:8453:${registry}:19125`;

  assert.deepEqual(normalizeMultipassSourceInput('erc8004:8453:19125'), {
    kind: 'erc8004_identity',
    sourceType: 'erc8004_identity',
    canonicalId: canonical,
    legacyCanonicalId: 'erc8004:8453:19125',
    chainId: 8453,
    tokenId: '19125',
    contractAddress: registry,
  });
  assert.deepEqual(normalizeMultipassSourceInput(`eip155:8453:${registry.toLowerCase()}:19125`), {
    kind: 'erc8004_identity',
    sourceType: 'erc8004_identity',
    canonicalId: canonical,
    legacyCanonicalId: 'erc8004:8453:19125',
    chainId: 8453,
    tokenId: '19125',
    contractAddress: registry,
  });
});

test('normalizeMultipassSourceInput rejects unsupported source shapes', () => {
  assert.throws(() => normalizeMultipassSourceInput(''), /source/i);
  assert.throws(() => normalizeMultipassSourceInput('8453:0'), /token/i);
  assert.throws(() => normalizeMultipassSourceInput('8453:00'), /positive Helixa AgentDNA token/i);
  assert.throws(() => normalizeMultipassSourceInput('00'), /positive Helixa AgentDNA token/i);
  assert.throws(() => normalizeMultipassSourceInput('helixa-agentdna:8453:000'), /positive Helixa AgentDNA token/i);
  assert.throws(() => normalizeMultipassSourceInput('1:1'), /Base Helixa/i);
  assert.throws(() => normalizeMultipassSourceInput('erc8004:1:1'), /Base ERC-8004/i);
  assert.throws(() => normalizeMultipassSourceInput('eip155:8453:0x0000000000000000000000000000000000000001:1'), /ERC-8004 Identity Registry/i);
  assert.throws(() => normalizeMultipassSourceInput('agent-nft:eip155:8453:0xabc:1'), /Use a Helixa AgentDNA token ID/i);
});

function makeSourceStore() {
  return {
    getPublicFragments: () => [{ fragment_id: 'frag_public', visibility: 'public' }],
    getTools: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', summary: { total: 1 }, tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup' }] }),
    getAgentCard: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0' }),
    getStandardsProfile: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] }),
    getX402Manifest: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] }),
    getReceiptFragments: () => [],
    getChangeLog: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Activated.' }] }),
    getSourceContext: () => ({ activation: { sourceType: 'helixa_agent', canonicalId: '8453:1', tokenId: '1' } }),
  };
}

test('buildHydratedProfileResponse returns one canonical public-safe document', () => {
  const profile = {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    slug: 'bendr-2-1',
    display_name: 'Bendr 2.0',
    owner_summary: { owner_state: 'unclaimed', verification_status: 'none' },
    updated_at: '2026-07-03T00:00:00.000Z',
  };

  const hydrated = buildHydratedProfileResponse({
    mode: 'activated',
    profile,
    sourceStore: makeSourceStore(),
    sourceIdentity: normalizeMultipassSourceInput('helixa-agentdna:8453:1'),
    baseUrl: 'https://multipass.example.test',
  });

  assert.equal(hydrated.schema_version, '0.1.0');
  assert.equal(hydrated.mode, 'activated');
  assert.equal(hydrated.source_identity.kind, 'helixa_agentdna');
  assert.equal(hydrated.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(hydrated.source_identity.legacy_canonical_id, '8453:1');
  assert.equal(hydrated.profile.slug, 'bendr-2-1');
  assert.equal(hydrated.fragments.fragments.length, 1);
  assert.equal(hydrated.tools.tools[0].tool_id, 'agent-lookup');
  assert.equal(hydrated.agent_card.name, 'Bendr 2.0');
  assert.equal(hydrated.activation.state, 'activated');
  assert.equal(hydrated.activation.manager_state, 'none');
  assert.equal(hydrated.routes_meta.public_profile, '/multipass/bendr-2-1');
  assert.equal(hydrated.routes.profile, 'https://multipass.example.test/api/multipass/bendr-2-1');
});

test('buildHydratedProfileResponse keeps activation previews on the agent query share path', () => {
  const profile = {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    slug: 'bendr-2-1',
    display_name: 'Bendr 2.0',
    owner_summary: { owner_state: 'unclaimed', verification_status: 'none' },
    updated_at: '2026-07-03T00:00:00.000Z',
  };

  const hydrated = buildHydratedProfileResponse({
    mode: 'activation_preview',
    profile,
    sourceStore: makeSourceStore(),
    sourceIdentity: normalizeMultipassSourceInput('1'),
    baseUrl: 'https://multipass.example.test',
  });

  assert.equal(hydrated.state, 'activated_unsaved');
  assert.equal(hydrated.activation.state, 'not_activated');
  assert.equal(hydrated.activation.claim_url, null);
  assert.equal(hydrated.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(hydrated.routes_meta.activate, '/multipass/?agent=1');
  assert.deepEqual(Object.keys(hydrated.routes), ['resolve', 'save']);
  assert.equal(hydrated.routes.profile, undefined);
  assert.equal(hydrated.routes.fragments, undefined);
  assert.equal(hydrated.routes.save, 'https://multipass.example.test/api/multipass');
  assert.equal(JSON.stringify(hydrated.routes).includes('/api/multipass/bendr-2-1'), false);
});

test('buildHydratedProfileResponse keeps ERC-8004 activation previews on the canonical source query path', () => {
  const profile = {
    schema_version: '0.1.0',
    multipass_id: 'mp_erc8004_8453_19125',
    slug: 'ack-19125',
    display_name: 'ACK',
    owner_summary: { owner_state: 'unclaimed', verification_status: 'none' },
    updated_at: '2026-07-08T00:00:00.000Z',
  };
  const sourceIdentity = normalizeMultipassSourceInput('erc8004:8453:19125');

  const hydrated = buildHydratedProfileResponse({
    mode: 'activation_preview',
    profile,
    sourceStore: makeSourceStore(),
    sourceIdentity,
    baseUrl: 'https://multipass.example.test',
  });

  assert.equal(hydrated.source_identity.kind, 'erc8004_identity');
  assert.equal(hydrated.source_identity.contract_address, '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
  assert.equal(hydrated.source_identity.canonical_id, 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:19125');
  assert.equal(hydrated.routes_meta.public_profile, '/multipass/?agent=eip155%3A8453%3A0x8004A169FB4a3325136EB29fA0ceB6D2e539a432%3A19125');
  assert.equal(hydrated.routes.resolve, 'https://multipass.example.test/api/multipass/resolve?source=eip155%3A8453%3A0x8004A169FB4a3325136EB29fA0ceB6D2e539a432%3A19125');
});

test('buildHydratedProfileResponse rejects invalid modes fail-closed', () => {
  const args = {
    profile: { schema_version: '0.1.0', multipass_id: 'mp_1', slug: 'agent-1', display_name: 'Agent 1' },
    sourceStore: makeSourceStore(),
    sourceIdentity: normalizeMultipassSourceInput('1'),
    baseUrl: 'https://multipass.example.test',
  };

  assert.throws(() => buildHydratedProfileResponse({ ...args, mode: 'bad_mode' }), /mode/i);
  assert.throws(() => buildHydratedProfileResponse({ ...args, mode: undefined }), /mode/i);
});

test('buildHydratedProfileResponse requires explicit source identity', () => {
  assert.throws(() => buildHydratedProfileResponse({
    mode: 'saved',
    profile: { schema_version: '0.1.0', multipass_id: 'mp_1', slug: 'agent-1', display_name: 'Agent 1' },
    sourceStore: makeSourceStore(),
    baseUrl: 'https://multipass.example.test',
  }), /sourceIdentity/);
});

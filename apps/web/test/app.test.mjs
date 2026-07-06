import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { GENERATED_SHARE_CARDS } from '../src/generated-share-cards.js';
import { HelixaResolverError } from '../src/live-helixa-resolver.js';
import { isSafeMultipassSharePath } from '../src/save-panel.js';
import { getAgentSharePath } from '../src/share-cards.js';

const NAKAMIGO_2432_IMAGE = 'https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432';
const QUIGBOT_GENERATED_SHARE_PATH = getAgentSharePath(GENERATED_SHARE_CARDS['81']);

function sampleData() {
  return {
    profile: {
      display_name: 'Bendr 2.0',
      multipass_id: 'mp_bendr_2',
      slug: 'bendr-2',
      status: 'link_ready',
      subject_type: 'agent',
      cred_summary: { trust_state: 'established', public_note: 'Cred score 80 imported from Helixa API.' },
    },
    fragments: {
      subject_id: 'bendr-2',
      private_fragments: [{ fragment_id: 'frag_bendr_unexpected_private_field', visibility: 'private' }],
      fragments: [
        {
          fragment_id: 'frag_bendr_profile',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Bendr profile checked by Helixa record.',
        },
        {
          fragment_id: 'frag_bendr_endpoint',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'owner_submission', issuer: null },
          public_value: 'Bendr endpoint awaiting live verification.',
          endpoint_ref: { protocol: 'api' },
        },
        {
          fragment_id: 'frag_bendr_standard_ref',
          fragment_type: 'standard_ref',
          status: 'stale',
          assurance_level: 'issuer_attested',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'issuer_attestation', issuer: 'Helixa' },
          public_value: 'Adapter reference needs a fresh check.',
        },
        {
          fragment_id: 'frag_bendr_receipt_history',
          fragment_type: 'receipt',
          status: 'historical',
          assurance_level: 'issuer_attested',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          source: { source_type: 'payment_receipt', issuer: 'Helixa' },
          public_value: 'Receipt evidence retained as history.',
        },
        {
          fragment_id: 'frag_bendr_route_dispute',
          fragment_type: 'verification_result',
          status: 'disputed',
          assurance_level: 'unverified',
          visibility: 'public',
          transfer_policy: 'never_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Route claim intentionally marked disputed in the record.',
        },
        {
          fragment_id: 'frag_bendr_helixa_identity',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'onchain_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          source: { source_type: 'contract_read', issuer: 'Helixa' },
          public_value: 'Helixa AgentDNA token #1 on Base, contract 0x2e3B541C59D38b84E3Bc54e977200230A204Fe60.',
        },
        {
          fragment_id: 'frag_bendr_cred_score',
          fragment_type: 'risk_summary',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'registry_import', issuer: 'Helixa' },
          public_value: 'Cred score 80, Preferred tier, imported from Helixa API.',
        },
        {
          fragment_id: 'frag_quigbot_identity',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Quigbot identity checked by Helixa record.',
        },
        {
          fragment_id: 'frag_quigbot_cred',
          fragment_type: 'risk_summary',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'registry_import', issuer: 'Helixa' },
          public_value: 'Quigbot Cred score 75, Prime tier.',
        },
        {
          fragment_id: 'frag_helixa_swarm_roster',
          fragment_type: 'custody_record',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Parent Multipass manages Bendr 2.0, Quigbot, Helixa, Phantom Relay, and Nox as one public swarm roster.',
        },
        {
          fragment_id: 'frag_helixa_swarm_tools',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'owner_submission', issuer: 'Helixa' },
          public_value: 'Shared tool policy context for routes, permissions, and approvals across the swarm.',
          endpoint_ref: { protocol: 'api' },
        },
        {
          fragment_id: 'frag_helixa_swarm_cred',
          fragment_type: 'risk_summary',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'registry_import', issuer: 'Helixa' },
          public_value: "Aggregate Cred context summarizes the roster without erasing each agent's individual profile.",
        },
        { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
      ],
    },
    card: { capabilities: [{}], service_endpoints: [{}], trust_summary: { identity_status: 'verified', assurance_level: 'onchain_verified', last_updated_at: '2026-06-24T22:49:52Z' } },
    agentCards: [
      { name: 'Bendr 2.0', tokenId: 1, helixaId: '8453:1', framework: 'openclaw', credScore: 80, credTier: 'Preferred', verified: true, profileUrl: 'https://helixa.xyz/agent/1', proofFragmentIds: ['frag_bendr_profile', 'frag_bendr_endpoint', 'frag_bendr_standard_ref', 'frag_bendr_receipt_history', 'frag_bendr_route_dispute', 'frag_bendr_helixa_identity', 'frag_bendr_cred_score'], ownerSnapshot: { owner: '0x3395...480E0', operator: 'Bendr runtime', custodyEpoch: 'Epoch 01', permissionState: 'Active owner-approved routes', visibility: 'Public profile, private credentials hidden', recentChange: 'Cred import refreshed', reviewAction: 'Review stale standards reference' }, changeReviewLedger: [
        { event: 'Cred import refreshed', source: 'Helixa API', impact: 'Cred context updated', reviewState: 'Verified' },
        { event: 'Standards reference stale', source: 'Standards profile', impact: 'Adapter claim needs a fresh check', reviewState: 'Reverify' },
        { event: 'Private credentials hidden', source: 'Private vault', impact: 'No public data exposed', reviewState: 'No public action' },
      ] },
      { name: 'Quigbot', tokenId: 81, helixaId: '8453:81', framework: 'openclaw', credScore: 75, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/agent/81', visual: { imageUrl: NAKAMIGO_2432_IMAGE, label: 'Nakamigo #2432 visual identity', tone: 'prime' }, proofFragmentIds: ['frag_quigbot_identity', 'frag_quigbot_cred'] },
      { name: 'Helixa Swarm', tokenId: 'swarm:helixa', helixaId: '8453:swarm:helixa', framework: 'multi-agent', credScore: 78, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/swarm/helixa', subjectType: 'swarm', members: 5, role: 'Parent Multipass', custody: 'Custody epoch ready', proofFragmentIds: ['frag_helixa_swarm_roster', 'frag_helixa_swarm_tools', 'frag_helixa_swarm_cred'], roster: [{ name: 'Bendr 2.0', role: 'Lead Agent / Trust Router' }, { name: 'Quigbot', role: 'Product / Strategy Agent' }, { name: 'Helixa', role: 'Protocol / Identity Agent' }, { name: 'Phantom Relay', role: 'Routing / Relay Agent' }, { name: 'Nox', role: 'Ops / Safety Agent' }], sharedControls: ['Tool approvals', 'Route policy', 'Owner approval'], aggregateCred: 'Cred 78 Prime summarizes the roster without replacing individual agent scores.', transferBehavior: 'Permissions pause and tool routes reverify when custody changes.', transferPreview: { currentOwner: '0x3395...480E0', custodyEpoch: 'Epoch 03', claimAction: 'Claim swarm', permissionsState: 'Permissions paused', toolAction: 'Reverify shared tools', privateAccessAction: 'Rotate private access', historyState: 'History preserved', credContinuity: 'Cred continues with ownership-change context.' }, ownerSnapshot: { owner: '0x3395...480E0', operator: 'Helixa ops', custodyEpoch: 'Epoch 03', permissionState: 'Paused until owner review', visibility: 'Public profile, gated private data', recentChange: 'Transfer detected 2026-06-24', reviewAction: 'Reverify routes before resume' }, changeReviewLedger: [
        { event: 'Cred import refreshed', source: 'Helixa API', impact: 'Aggregate Cred context updated', reviewState: 'Verified' },
        { event: 'Transfer detected', source: 'Owner registry', impact: 'Permissions paused', reviewState: 'Review required' },
        { event: 'Shared route policy changed', source: 'Policy reference', impact: 'Routes paused for recheck', reviewState: 'Paused' },
        { event: 'Standards reference stale', source: 'Standards profile', impact: 'Adapter claim needs a fresh check', reviewState: 'Reverify' },
        { event: 'Private credentials hidden', source: 'Private vault', impact: 'No secrets or private credentials exposed', reviewState: 'No public action' },
      ] },
    ],
    standards: { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    x402: { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled', response_class: 'success' },
    routes: {},
  };
}

function okxMarketplacePresence(overrides = {}) {
  const base = {
    marketplace: 'OKX.AI',
    listingId: '1965',
    profileUrl: 'https://www.okx.ai/agents/1965',
    status: 'public_metadata',
    source: {
      label: 'Public marketplace metadata',
      url: 'https://www.okx.ai/agents/1965',
      checkedAt: '2026-07-05T21:45:02Z',
      provenance: 'public marketplace metadata',
    },
    services: [
      {
        name: 'CertiK Security APIs',
        price: '0.001 USDT',
        paymentMode: 'x402 marketplace checkout',
        endpointUrl: 'https://skills-for-okx.certik.com/api/services',
      },
    ],
    paymentRails: [
      { asset: 'USDT', mode: 'x402 marketplace checkout', chain: 'X Layer 196' },
    ],
    reputation: { score: '5.0', positiveRate: '100%', soldCount: '53', reviewCount: '1' },
    facts: [{ label: 'Marketplace/payment chain', value: 'X Layer 196' }],
  };
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
    proof: overrides.proof,
    services: overrides.services ?? base.services,
    paymentRails: overrides.paymentRails ?? base.paymentRails,
    reputation: { ...base.reputation, ...(overrides.reputation ?? {}) },
    facts: overrides.facts ?? base.facts,
  };
}

function samplePublicTools() {
  return {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    tools: [
      {
        fragment_id: 'frag_tool_bendr_lookup',
        multipass_id: 'mp_helixa_agent_1',
        tool_id: 'bendr-lookup',
        registry: 'bankr_x402_cloud',
        name: 'Bendr x402 profile lookup',
        description: 'Looks up public Multipass profile context.',
        endpoint_url: 'https://api.bankr.example/tools/bendr/lookup',
        manifest_url: 'https://api.bankr.example/tools/bendr/lookup/manifest.json',
        pricing: { model: 'fixed', amount: '0.02', asset: 'USDC', chain_id: 8453 },
        schemas: { input_summary: 'Multipass slug or Helixa ID.', output_summary: 'Public profile JSON.' },
        verifiability: { tier: 'provider_verified', summary: 'Imported from Bankr x402 Cloud.' },
        status: 'verified',
        assurance_level: 'platform_verified',
        visibility: 'public',
        last_checked_at: '2026-06-24T00:05:00Z',
      },
    ],
  };
}

function setupDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', { url });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  return dom.window.document.querySelector('#app');
}

async function flushAsyncEvents(count = 8) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

async function flushHomepagePrefetch() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushAsyncEvents(20);
}

async function savedProfileFetch(url) {
  const value = String(url);
  if (value.endsWith('/hydrated')) {
    return new Response('missing', { status: 404 });
  }
  if (value.endsWith('/api/multipass/bendr-2-1')) {
    return new Response(JSON.stringify({
      ...sampleData().profile,
      display_name: 'Saved Bendr',
      slug: 'bendr-2-1',
      multipass_id: 'mp_helixa_agent_1',
      status: 'active',
      owner_summary: {
        owner_state: 'unclaimed',
        verification_status: 'unclaimed',
        summary: 'Saved unclaimed profile. Management is unclaimed.',
      },
    }), { status: 200 });
  }
  if (String(url).endsWith('/fragments')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', fragments: [] }), { status: 200 });
  if (String(url).endsWith('/card') || String(url).endsWith('/agent-card')) return new Response(JSON.stringify({ ...sampleData().card, multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' }), { status: 200 });
  if (String(url).endsWith('/standards')) return new Response(JSON.stringify(sampleData().standards), { status: 200 });
  if (String(url).endsWith('/x402')) return new Response(JSON.stringify(sampleData().x402), { status: 200 });
  if (String(url).endsWith('/tools')) return new Response(JSON.stringify(samplePublicTools()), { status: 200 });
  if (String(url).endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Multipass saved from live public source record.' }] }), { status: 200 });
  throw new Error(`Unexpected URL ${url}`);
}

async function savedProfileNoToolsFetch(url) {
  if (String(url).endsWith('/tools')) {
    return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [] }), { status: 200 });
  }
  return savedProfileFetch(url);
}

function fillGroupActivationForm(root, overrides = {}) {
  if (!root.querySelector('[data-role="group-activation-form"]')) {
    root.querySelector('[data-action="show-group-activation"]')?.click();
  }
  const form = root.querySelector('[data-role="group-activation-form"]');
  assert.ok(form);
  form.querySelector('[name="subject_type"]').value = overrides.subject_type ?? 'swarm';
  form.querySelector('[name="display_name"]').value = overrides.display_name ?? 'Helixa Swarm';
  form.querySelector('[name="summary"]').value = overrides.summary ?? 'Public parent Multipass for the core Helixa agent team.';
  form.querySelector('[name="member_ids"]').value = overrides.member_ids ?? '1, 81\n1066';
  form.querySelector('[name="shared_policy_note"]').value = overrides.shared_policy_note ?? 'Owner approval required for shared routes.';
  return form;
}

function groupPreviewResponse(overrides = {}) {
  return {
    schema_version: '0.1.0',
    state: 'group_preview',
    record: {
      profile: {
        display_name: 'Helixa Swarm',
        subject_type: 'swarm',
        ...(overrides.profile ?? {}),
      },
    },
    members: [
      { name: 'Bendr 2.0', token_id: '1', canonical_id: '8453:1', cred_score: 82, cred_tier: 'Prime', source_status: 'resolved' },
      { name: 'Quigbot', token_id: '81', canonical_id: '8453:81', cred_score: 76, cred_tier: 'Prime', source_status: 'resolved' },
      { name: 'Helixa', token_id: '1066', canonical_id: '8453:1066', cred_score: 70, cred_tier: 'Prime', source_status: 'resolved' },
    ],
    ...overrides,
  };
}

function groupSaveResponse(overrides = {}) {
  return {
    schema_version: '0.1.0',
    state: 'saved_group_unclaimed',
    created: true,
    multipass_id: 'mp_group_swarm_9c41a2',
    slug: 'helixa-swarm-9c41a2',
    sharePath: '/multipass/helixa-swarm-9c41a2',
    profile: { display_name: 'Helixa Swarm', subject_type: 'swarm', slug: 'helixa-swarm-9c41a2' },
    ...overrides,
  };
}

async function savedGroupProfileFetch(url) {
  const value = String(url);
  if (value.endsWith('/hydrated')) {
    return new Response('missing', { status: 404 });
  }
  if (value.endsWith('/api/multipass/helixa-collection-9c41a2')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      display_name: 'Helixa Collection',
      multipass_id: 'mp_group_collection_9c41a2',
      slug: 'helixa-collection-9c41a2',
      status: 'active',
      subject_type: 'collection',
      summary: 'Public parent Multipass for a curated member collection.',
      owner_summary: {
        owner_state: 'unclaimed',
        verification_status: 'none',
        visibility: 'public',
        summary: 'Group management is unclaimed.',
      },
      cred_summary: { trust_state: 'context', public_note: 'Aggregate member Cred context only; no group score is assigned.' },
    }), { status: 200 });
  }
  if (value.endsWith('/fragments')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      multipass_id: 'mp_group_collection_9c41a2',
      fragments: [
        {
          fragment_id: 'frag_group_collection_9c41a2_roster',
          fragment_type: 'custody_record',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'registry_import', source_id: 'collection:helixa', issuer: 'Helixa' },
          public_value: 'Roster includes 3 public AgentDNA members: Bendr 2.0, Quigbot, and Nox.',
        },
        {
          fragment_id: 'frag_group_collection_9c41a2_policy',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'owner_submission', source_id: 'collection:helixa:policy', issuer: 'Helixa' },
          public_value: 'Shared policy requires owner approval before collection-level route changes.',
          endpoint_ref: { protocol: 'api' },
        },
        {
          fragment_id: 'frag_group_collection_9c41a2_cred',
          fragment_type: 'risk_summary',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'platform_check', source_id: 'collection:helixa:cred', issuer: 'Helixa' },
          public_value: 'Bendr 2.0 Cred 82 Prime, Quigbot Cred 76 Prime, Nox Cred 69 Prime. Aggregate context only; no group score is assigned.',
        },
      ],
    }), { status: 200 });
  }
  if (value.endsWith('/card') || value.endsWith('/agent-card')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      name: 'Helixa Collection',
      description: 'Parent Multipass card for a public member collection.',
      capabilities: [],
      service_endpoints: [],
      trust_summary: { identity_status: 'verified', assurance_level: 'platform_verified', summary: 'Parent Multipass for a collection roster.' },
    }), { status: 200 });
  }
  if (value.endsWith('/standards')) return new Response(JSON.stringify({ standard_refs: [{ standard_id: 'ERC-8004', status: 'member_refs_available' }] }), { status: 200 });
  if (value.endsWith('/x401')) return new Response(JSON.stringify({ x401_supported: true, trusted_issuers: [{ issuer_id: 'helixa' }], proof_requirements: [{ requirement_id: 'group_authority' }], route_policies: [] }), { status: 200 });
  if (value.endsWith('/x402')) return new Response(JSON.stringify({ endpoints: [] }), { status: 200 });
  if (value.endsWith('/tools')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_group_collection_9c41a2', tools: [] }), { status: 200 });
  if (value.endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_group_collection_9c41a2', entries: [{ message: 'Group Multipass activated from public AgentDNA member records.' }] }), { status: 200 });
  throw new Error(`Unexpected group URL ${url}`);
}

async function savedQuigbotFetch(url) {
  const value = String(url);
  if (value.endsWith('/hydrated')) {
    return new Response('missing', { status: 404 });
  }
  if (value.endsWith('/api/multipass/quigbot-81') || value.endsWith('/api/multipass/mp_helixa_agent_81')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      display_name: 'Quigbot',
      slug: 'quigbot-81',
      multipass_id: 'mp_helixa_agent_81',
      status: 'active',
      subject_type: 'agent',
      owner_summary: { owner_state: 'verified', verification_status: 'verified', visibility: 'public' },
      cred_summary: { trust_state: 'building', public_note: 'Public Cred score 75 observed from the live Helixa source record.' },
      discovery_profile: { tags: ['helixa', 'agentdna', 'multipass', 'openclaw'], visibility: 'public', avatar_url: NAKAMIGO_2432_IMAGE },
      updated_at: '2026-06-29T20:40:40.613Z',
    }), { status: 200 });
  }
  if (value.endsWith('/fragments')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      multipass_id: 'mp_helixa_agent_81',
      fragments: [
        { fragment_id: 'frag_helixa_agent_81_source', fragment_type: 'attestation', status: 'verified', assurance_level: 'platform_verified', visibility: 'public', transfer_policy: 'historical_on_transfer', source: { source_id: '8453:81', reference_url: 'https://api.helixa.xyz/api/v2/agent/81' }, public_value: 'Quigbot was saved from public Helixa AgentDNA token #81.' },
        { fragment_id: 'frag_helixa_agent_81_cred', fragment_type: 'risk_summary', status: 'pending', assurance_level: 'platform_verified', visibility: 'public', transfer_policy: 'reverify_on_transfer', source: { source_id: '8453:81' }, public_value: 'Public Cred score 75 observed from the live Helixa source record.' },
      ],
    }), { status: 200 });
  }
  if (value.endsWith('/card') || value.endsWith('/agent-card')) {
    return new Response(JSON.stringify({
      ...sampleData().card,
      multipass_id: 'mp_helixa_agent_81',
      name: 'Quigbot',
      standards_refs: [{ standard_id: 'ERC-8004', support_status: 'imported_unverified', record_id: '8453:81' }],
      trust_summary: { identity_status: 'verified', assurance_level: 'platform_verified', last_updated_at: '2026-06-29T20:40:40.613Z' },
    }), { status: 200 });
  }
  if (value.endsWith('/standards')) {
    return new Response(JSON.stringify({
      schema_version: '0.1.0',
      multipass_id: 'mp_helixa_agent_81',
      primary_refs: { helixa_agent: '8453:81' },
      standard_refs: [{ standard_id: 'ERC-8004', status: 'imported_unverified', record_id: '8453:81' }],
    }), { status: 200 });
  }
  if (value.endsWith('/x402')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_81', endpoints: [] }), { status: 200 });
  if (value.endsWith('/tools')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_81', tools: [] }), { status: 200 });
  if (value.endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_81', entries: [{ message: 'Management claim owner-wallet verified.' }] }), { status: 200 });
  throw new Error(`Unexpected URL ${url}`);
}

function createWalletClientFixture({ snapshot, connect, signMessage } = {}) {
  let currentSnapshot = {
    ready: true,
    configured: true,
    connected: false,
    address: null,
    label: null,
    connectLabel: 'Connect wallet to claim',
    ...snapshot,
  };
  return {
    getSnapshot() {
      return currentSnapshot;
    },
    setSnapshot(nextSnapshot) {
      currentSnapshot = { ...currentSnapshot, ...nextSnapshot };
    },
    subscribe() {
      return () => {};
    },
    async connect() {
      return connect?.();
    },
    async signMessage(message) {
      if (signMessage) return signMessage(message);
      return { wallet: currentSnapshot.address, signature: '0xsig' };
    },
  };
}

function createSavedMultipassError({ status = 403, code = 'forbidden', message = 'Wallet is not eligible to manage this Multipass record.' } = {}) {
  const error = new Error(message);
  error.name = 'SavedMultipassError';
  error.details = { status, body: { error: { code, message } } };
  return error;
}

async function renderClaimFailureText(error) {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({
    snapshot: {
      connected: true,
      address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      label: '0x27E3...91Ea',
      connectLabel: 'Sign owner claim',
    },
  });
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => { throw error; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  return root.querySelector('.claim-management-panel').textContent;
}

async function renderClaimedSavedProfileRoot() {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({
      claim_status: 'claimed_verified_owner',
      csrfToken: 'csrf-1',
      profile: {
        ...sampleData().profile,
        slug: 'bendr-2-1',
        display_name: 'Saved Bendr',
        owner_summary: {
          owner_state: 'claimed',
          verification_status: 'verified',
          visibility: 'public',
          summary: 'Owner-wallet verified for public profile edits.',
        },
      },
    }),
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  return root;
}

async function renderClaimedMarketplaceManager({ initialFragments = [], claimApiOverrides = {} } = {}) {
  const calls = [];
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const profile = {
    ...sampleData().profile,
    slug: 'bendr-2-1',
    owner_summary: { owner_state: 'claimed', verification_status: 'verified', visibility: 'public' },
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile }),
    createMultipassFragment: async (input) => {
      calls.push(['create', input]);
      const fragment = { fragment_id: 'frag_marketplace_bankr', fragment_type: 'attestation', status: 'pending', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: input.fragment.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment, ...initialFragments] }, profile };
    },
    updateMultipassFragment: async (input) => {
      calls.push(['update', input]);
      const fragment = { fragment_id: input.fragmentId, fragment_type: 'attestation', status: 'stale', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: input.patch.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment] }, profile };
    },
    revokeMultipassFragment: async (input) => {
      calls.push(['revoke', input]);
      const fragment = { fragment_id: input.fragmentId, fragment_type: 'attestation', status: 'revoked', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: initialFragments[0]?.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment] }, profile };
    },
    ...claimApiOverrides,
  };
  const fetchImpl = async () => {
    const body = sampleData();
    body.profile = profile;
    body.fragments = { fragments: initialFragments };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await createApp({ root, claimApi, walletSigner: async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' }), fetchImpl }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();
  return { root, calls };
}



function quigbotLiveData(overrides = {}) {
  return {
    ...sampleData(),
    modeLabel: 'Live Profile',
    sourceLabel: 'live Helixa API',
    profile: { ...sampleData().profile, display_name: 'Quigbot', ...(overrides.profile ?? {}) },
    resolver: { canonicalId: '8453:81', tokenId: '81', ...(overrides.resolver ?? {}) },
    liveProfilePage: {
      headline: 'Quigbot Multipass',
      headerMeta: 'Live profile · 8453:81',
      sharePath: '/multipass/?agent=81',
      ...(overrides.liveProfilePage ?? {}),
    },
    ...overrides,
  };
}

async function renderResolvedQuigbotProfile(liveData = quigbotLiveData()) {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await flushAsyncEvents();
  return root;
}

function profileDrawerTitles(profile) {
  return [...profile.querySelectorAll('.profile-detail-drawer summary span')].map((node) => node.textContent);
}

function profileDrawerByTitle(profile, title) {
  return [...profile.querySelectorAll('.profile-detail-drawer')].find((drawer) => drawer.querySelector('summary span')?.textContent === title);
}



test('homepage leads with Multipass product hero instead of Bendr record sheet', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const hero = root.querySelector('.product-hero');
  assert.ok(hero);
  assert.equal(hero.querySelector('.eyebrow')?.textContent, 'What it is');
  assert.doesNotMatch(hero.querySelector('.eyebrow')?.textContent ?? '', /Helixa Multipass/i);
  assert.match(hero.textContent, /Portable identity profiles for agents/i);
  assert.doesNotMatch(hero.textContent, /mp_bendr_2/);
  assert.doesNotMatch(hero.textContent, /receipt_bendr_lookup/);
  assert.equal(root.querySelector('.record-sheet'), null);
});

test('homepage keeps activation below the standalone desktop hero', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const hero = root.querySelector('.product-hero');
  const heroCard = root.querySelector('.product-hero-copy');
  const activation = root.querySelector('.live-resolver');
  const groupActivation = root.querySelector('.group-activation-section');
  const systemPanel = root.querySelector('.multipass-system-panel');

  assert.ok(hero);
  assert.ok(heroCard);
  assert.ok(activation);
  assert.equal(groupActivation, null);
  assert.ok(systemPanel);
  assert.equal(hero.children.length, 1);
  assert.equal(hero.firstElementChild, heroCard);
  assert.equal(hero.contains(activation), false);
  assert.equal(hero.nextElementSibling, activation);
  assert.equal(activation.nextElementSibling, systemPanel);
  assert.ok(heroCard.querySelector('.product-hero-main'));
  assert.ok(heroCard.contains(root.querySelector('.profile-visual-strip')));
  assert.equal(heroCard.firstElementChild?.classList.contains('product-hero-main'), true);
  assert.equal(heroCard.querySelector('.product-hero-main')?.nextElementSibling, root.querySelector('.profile-visual-strip'));
});


test('group activation stays hidden behind the Activate Swarm button on the homepage', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const resolver = root.querySelector('.live-resolver');
  const actionStack = resolver?.querySelector('.live-resolver-actions');
  const activateButton = actionStack?.querySelector('button[type="submit"]');
  const showSwarmButton = actionStack?.querySelector('[data-action="show-group-activation"]');
  assert.ok(resolver);
  assert.ok(actionStack);
  assert.equal(actionStack?.children[0], activateButton);
  assert.equal(actionStack?.children[1], showSwarmButton);
  assert.ok(showSwarmButton);
  assert.equal(showSwarmButton.textContent, 'Activate Swarm');
  assert.equal(root.querySelector('.group-activation-section'), null);
  assert.doesNotMatch(root.textContent, /Activate collection or swarm/);

  showSwarmButton.click();
  await flushAsyncEvents();

  const section = root.querySelector('.group-activation-section');
  const panel = root.querySelector('.group-activation-panel');
  const text = section?.textContent ?? '';

  assert.ok(section);
  assert.ok(panel);
  assert.match(text, /Activate collection or swarm/);
  assert.match(text, /Subject type/);
  assert.match(text, /Display name/);
  assert.match(text, /Summary/);
  assert.match(text, /Member IDs/);
  assert.match(text, /Shared policy note/);
  assert.match(text, /Preview group Multipass/);
  assert.match(text, /Activate group Multipass/);
  assert.ok(panel.querySelector('option[value="swarm"]'));
  assert.ok(panel.querySelector('option[value="collection"]'));
  assert.equal(panel.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), true);
  assert.match(text, /public parent Multipass metadata only/i);
});

test('group activation preview submits through the client and renders parent profile with member summaries', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const requests = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options, body: JSON.parse(options.body) });
      assert.equal(options.method, 'POST');
      if (String(url).endsWith('/api/multipass/groups/preview')) {
        return new Response(JSON.stringify(groupPreviewResponse()), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);

  assert.deepEqual(requests.map((request) => request.url), ['/multipass-api/api/multipass/groups/preview']);
  assert.deepEqual(requests[0].body, {
    subject_type: 'swarm',
    display_name: 'Helixa Swarm',
    summary: 'Public parent Multipass for the core Helixa agent team.',
    shared_policy_note: 'Owner approval required for shared routes.',
    member_ids: ['1', '81', '1066'],
  });
  const preview = root.querySelector('.group-activation-preview');
  assert.ok(preview);
  assert.match(preview.textContent, /Helixa Swarm/);
  assert.match(preview.textContent, /Proposed parent profile for swarm/);
  assert.match(preview.textContent, /Bendr 2\.0/);
  assert.match(preview.textContent, /Quigbot/);
  assert.match(preview.textContent, /Token ID 1/);
  assert.match(preview.textContent, /Token ID 81/);
  assert.match(preview.textContent, /Cred 82 Prime/);
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), false);
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hidden, false);
});

test('group activation structured validation errors render as blocking user-facing errors', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async () => new Response(JSON.stringify({
      schema_version: '0.1.0',
      error: {
        code: 'invalid_group_activation',
        message: 'At least two unique members are required.',
        details: { field: 'member_ids' },
      },
    }), { status: 400 }),
  }).start();

  fillGroupActivationForm(root, { display_name: 'Broken Group', member_ids: '1' });
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);

  const error = root.querySelector('.group-activation-error[role="alert"]');
  assert.ok(error);
  assert.match(error.textContent, /At least two unique members are required/);
  assert.match(error.textContent, /invalid_group_activation/);
  assert.match(error.textContent, /member_ids/);
  assert.equal(root.querySelector('.group-activation-preview'), null);
  assert.equal(root.querySelector('[name="display_name"]')?.value, 'Broken Group');
  assert.equal(root.querySelector('[name="member_ids"]')?.value, '1');
});

test('group activation reset clears preview result and error state without navigating', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const startingHref = window.location.href;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async () => new Response(JSON.stringify(groupPreviewResponse()), { status: 200 }),
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);
  assert.ok(root.querySelector('.group-activation-preview'));

  root.querySelector('[data-action="reset-group-multipass"]').click();
  await flushAsyncEvents(20);

  assert.equal(window.location.href, startingHref);
  assert.equal(root.querySelector('.group-activation-preview'), null);
  assert.equal(root.querySelector('.group-activation-success'), null);
  assert.equal(root.querySelector('.group-activation-error'), null);
  assert.equal(root.querySelector('[name="display_name"]')?.value, '');
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), true);
});

test('group activation save calls client and renders deterministic safe share path link', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const requests = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url).endsWith('/api/multipass/groups/preview')) {
        return new Response(JSON.stringify(groupPreviewResponse()), { status: 200 });
      }
      if (String(url).endsWith('/api/multipass/groups')) {
        return new Response(JSON.stringify(groupSaveResponse()), { status: 201 });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);
  root.querySelector('[data-action="save-group-multipass"]').click();
  await flushAsyncEvents(50);

  assert.deepEqual(requests.map((request) => request.url), [
    '/multipass-api/api/multipass/groups/preview',
    '/multipass-api/api/multipass/groups',
  ]);
  assert.deepEqual(requests[1].body.member_ids, ['1', '81', '1066']);
  const success = root.querySelector('.group-activation-success');
  assert.ok(success);
  assert.match(success.textContent, /\/multipass\/helixa-swarm-9c41a2/);
  assert.match(success.textContent, /unclaimed management/i);
  const link = success.querySelector('a[href="/multipass/helixa-swarm-9c41a2"]');
  assert.ok(link);
  assert.equal(link.textContent, 'Open parent Multipass');
  assert.equal(success.querySelector('a[href^="https://"]'), null);
});

test('group activation requires the current form payload to be previewed before saving', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const requests = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url).endsWith('/api/multipass/groups/preview')) {
        return new Response(JSON.stringify(groupPreviewResponse()), { status: 200 });
      }
      if (String(url).endsWith('/api/multipass/groups')) {
        return new Response(JSON.stringify(groupSaveResponse()), { status: 201 });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);
  root.querySelector('[name="display_name"]').value = 'Edited Swarm';
  root.querySelector('[data-action="save-group-multipass"]').click();
  await flushAsyncEvents(50);

  assert.deepEqual(requests.map((request) => request.url), ['/multipass-api/api/multipass/groups/preview']);
  assert.equal(root.querySelector('.group-activation-success'), null);
  const error = root.querySelector('.group-activation-error[role="alert"]');
  assert.ok(error);
  assert.match(error.textContent, /Preview the current group details before activating/);
  assert.equal(root.querySelector('[name="display_name"]')?.value, 'Edited Swarm');
});

test('group activation does not start a new preview while save is in flight', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const requests = [];
  let resolveSave;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url).endsWith('/api/multipass/groups/preview')) {
        return new Response(JSON.stringify(groupPreviewResponse()), { status: 200 });
      }
      if (String(url).endsWith('/api/multipass/groups')) {
        return new Promise((resolve) => { resolveSave = resolve; });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);
  root.querySelector('[data-action="save-group-multipass"]').click();
  await flushAsyncEvents(10);

  assert.equal(root.querySelector('[data-action="preview-group-multipass"]')?.hasAttribute('disabled'), true);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(20);
  assert.deepEqual(requests.map((request) => request.url), [
    '/multipass-api/api/multipass/groups/preview',
    '/multipass-api/api/multipass/groups',
  ]);

  resolveSave(new Response(JSON.stringify(groupSaveResponse()), { status: 201 }));
  await flushAsyncEvents(50);
  assert.ok(root.querySelector('.group-activation-success'));
});

test('group activation reset ignores stale preview responses', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolvePreview;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async () => new Promise((resolve) => { resolvePreview = resolve; }),
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(10);
  assert.match(root.querySelector('.group-activation-panel')?.textContent ?? '', /Previewing group Multipass/);

  root.querySelector('[data-action="reset-group-multipass"]').click();
  resolvePreview(new Response(JSON.stringify(groupPreviewResponse()), { status: 200 }));
  await flushAsyncEvents(50);

  assert.equal(root.querySelector('.group-activation-preview'), null);
  assert.equal(root.querySelector('.group-activation-error'), null);
  assert.equal(root.querySelector('[name="display_name"]')?.value, '');
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), true);
});

test('group activation reset ignores stale save responses', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolveSave;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/multipass/groups/preview')) {
        return new Response(JSON.stringify(groupPreviewResponse()), { status: 200 });
      }
      if (String(url).endsWith('/api/multipass/groups')) {
        return new Promise((resolve) => { resolveSave = resolve; });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  fillGroupActivationForm(root);
  root.querySelector('[data-action="preview-group-multipass"]').click();
  await flushAsyncEvents(50);
  root.querySelector('[data-action="save-group-multipass"]').click();
  await flushAsyncEvents(10);
  assert.match(root.querySelector('.group-activation-panel')?.textContent ?? '', /Activating group Multipass/);

  root.querySelector('[data-action="reset-group-multipass"]').click();
  resolveSave(new Response(JSON.stringify(groupSaveResponse()), { status: 201 }));
  await flushAsyncEvents(50);

  assert.equal(root.querySelector('.group-activation-success'), null);
  assert.equal(root.querySelector('.group-activation-error'), null);
  assert.equal(root.querySelector('[name="display_name"]')?.value, '');
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), true);
});

test('group activation saved route renders parent Multipass roster context instead of agent-only copy', async () => {
  const root = setupDom('https://helixa.xyz/multipass/helixa-collection-9c41a2?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedGroupProfileFetch }).start();

  const profile = root.querySelector('.multipass-profile-page');
  assert.ok(profile);
  const roster = profileDrawerByTitle(profile, 'Collection roster');
  assert.ok(roster);
  assert.match(profile.textContent, /Helixa Collection/);
  assert.match(profile.textContent, /Parent Multipass/);
  assert.match(roster.textContent, /collection roster/i);
  assert.match(roster.textContent, /Bendr 2\.0/);
  assert.match(roster.textContent, /Quigbot/);
  assert.match(roster.textContent, /Nox/);
  assert.match(roster.textContent, /Shared policy requires owner approval/);
  assert.doesNotMatch(profile.textContent, /public agent profile/i);
  assert.doesNotMatch(profile.textContent, /Agent Activation|stable public agent profile|Portable Agent Identity/);
  assert.doesNotMatch(profile.textContent, /frag_group_collection_9c41a2/);
});

test('group parent owner command center uses parent metadata controls copy', async () => {
  const root = setupDom('https://helixa.xyz/multipass/helixa-collection-9c41a2?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedGroupProfileFetch }).start();

  const commandCenters = root.querySelectorAll('.claim-management-panel');
  assert.equal(commandCenters.length, 1);
  const panel = commandCenters[0];
  assert.match(panel.textContent, /Owner Command Center/);
  assert.match(panel.textContent, /parent Multipass/i);
  assert.match(panel.textContent, /group metadata/i);
  assert.match(panel.textContent, /roster/i);
  assert.match(panel.textContent, /policy/i);
  assert.match(panel.textContent, /public proof fragments/i);
  assert.match(panel.textContent, /source-owner proof/i);
  assert.match(panel.textContent, /manual review/i);
  assert.doesNotMatch(panel.textContent, /public agent profile|agent-only|stable public agent profile/i);
  assert.doesNotMatch(panel.textContent, /owns member|acts for member|acts on behalf|executes tools|can execute tools|releases credentials|private credentials available|payment proves trust|buys trust|buy trust|trust purchased|custody transferred|transfer ownership|grants authority/i);
});

test('group activation safety wording scan avoids authority payment and credential claims', async () => {
  const homepage = setupDom('https://helixa.xyz/multipass/');
  await createApp({ homepage, root: homepage, loadDemo: async () => sampleData() }).start();
  const savedRoot = setupDom('https://helixa.xyz/multipass/helixa-collection-9c41a2?api=https://api.example.test');
  await createApp({ root: savedRoot, fetchImpl: savedGroupProfileFetch }).start();

  const combined = `${homepage.textContent}\n${savedRoot.textContent}`;
  assert.doesNotMatch(combined, /owns member|acts for member|acts on behalf|executes tools|can execute tools|releases credentials|private credentials available|payment proves trust|buys trust|buy trust|trust purchased|custody transferred|transfer ownership|grants authority/i);
  assert.doesNotMatch(combined, /x402 payment call|wallet signing required|onchain write/i);
});

test('homepage renders agent visuals without extra context copy', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelector('.product-card-grid'), null);
  assert.equal(root.querySelector('.share-panel'), null);
  assert.equal(root.querySelector('a[href="/multipass/agents"]')?.textContent, 'View agents');
  const strip = root.querySelector('.profile-visual-strip');
  assert.ok(strip);
  assert.equal(strip.querySelector('.card-carousel-head'), null);
  assert.equal(strip.querySelector('.card-detail'), null);
  assert.equal(strip.querySelector('.visual-card-viewport'), null);
  assert.ok(strip.querySelector('.visual-card-track'));
  assert.equal(strip.querySelector('.visual-card-track')?.hasAttribute('style'), false);
  assert.equal(strip.querySelector('.card-track'), null);
  assert.equal(strip.querySelectorAll('.card-button').length, 0);
  assert.equal(strip.querySelectorAll('a.visual-card-button').length, 3);
  assert.equal(strip.querySelector('.visual-carousel-controls'), null);
  assert.equal(strip.querySelector('a.visual-card-button[href="/multipass/?agent=1"]')?.textContent.includes('Open profile'), true);
  const quigbotVisual = strip.querySelector('a.visual-card-button[href="/multipass/?agent=81"]')?.querySelector('img[data-visual-card-image="true"]');
  assert.equal(quigbotVisual?.getAttribute('src'), 'https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432');
  assert.doesNotMatch(strip.innerHTML, /api\.helixa\.xyz\/api\/v2\/aura\/81\.png/);
  assert.ok(root.querySelector('.product-hero-copy')?.contains(strip));
  const heroMain = root.querySelector('.product-hero-main');
  assert.ok(heroMain);
  assert.ok(heroMain.contains(root.querySelector('.homepage-actions')));
  assert.equal(heroMain.nextElementSibling, strip);
  assert.match(strip.textContent, /Bendr 2\.0/);
  assert.match(strip.textContent, /Quigbot/);
});

test('homepage visual carousel is native swipeable linked profiles, not a button slider', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const strip = root.querySelector('.profile-visual-strip');
  assert.ok(strip);
  const track = strip.querySelector('.visual-card-track');
  assert.ok(track);
  assert.match(track.getAttribute('aria-label') ?? '', /Swipe through/i);
  assert.equal(track.hasAttribute('style'), false);
  assert.equal(strip.querySelector('button[aria-label="Next agent"]'), null);
  assert.equal(strip.querySelector('button[aria-label="Previous agent"]'), null);
  assert.equal(strip.querySelector('button.visual-card-button'), null);
  assert.deepEqual([...strip.querySelectorAll('a.visual-card-button')].map((link) => link.getAttribute('href')), [
    '/multipass/?agent=1',
    '/multipass/?agent=81',
    '/multipass/swarm/helixa',
  ]);
  assert.equal(strip.querySelector('a.visual-card-button[href^="https://helixa.xyz/agent/"]'), null);
  assert.equal(strip.querySelector('a.visual-card-button[href^="https://helixa.xyz/swarm/"]'), null);
});

test('homepage View agents opens a dedicated public agents route instead of rendering the full gallery inline', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelector('.public-agent-gallery'), null);
  assert.equal(root.querySelector('a[href="/multipass/agents"]')?.textContent, 'View agents');
});

test('dedicated agents route renders public agent gallery cards with safe Multipass links', async () => {
  const root = setupDom('https://helixa.xyz/multipass/agents');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelector('.product-home-shell'), null);
  assert.equal(root.querySelector('.live-resolver'), null);
  const gallery = root.querySelector('.public-agent-gallery');
  assert.ok(gallery);
  assert.match(gallery.textContent, /Public agent gallery/);
  assert.doesNotMatch(root.textContent, /without crowding/i);
  assert.equal(gallery.querySelectorAll('.public-agent-card').length, 3);
  assert.ok(gallery.querySelector('a.public-agent-card[href="/multipass/?agent=1"]'));
  assert.ok(gallery.querySelector('a.public-agent-card[href="/multipass/?agent=81"]'));
  assert.ok(gallery.querySelector('a.public-agent-card[href="/multipass/swarm/helixa"]'));
  assert.match(gallery.textContent, /Cred/);
  assert.match(gallery.textContent, /Custody/);
  assert.match(gallery.textContent, /Proof/);
  assert.match(gallery.textContent, /Open profile/);
  assert.equal(gallery.querySelector('a[href^="https://helixa.xyz/agent/"]'), null);
  assert.equal(gallery.querySelector('a[href^="https://helixa.xyz/swarm/"]'), null);
});

test('production agents route uses the full static gallery instead of the single API demo profile', async () => {
  const root = setupDom('https://helixa.xyz/multipass/agents');
  await createApp({
    root,
    fetchImpl: async () => {
      throw new Error('Agents gallery route should not fetch the single-profile API demo.');
    },
  }).start();

  const gallery = root.querySelector('.public-agent-gallery');
  assert.ok(gallery);
  assert.equal(gallery.querySelectorAll('.public-agent-card').length, 3);
  assert.match(gallery.textContent, /Bendr 2\.0/);
  assert.match(gallery.textContent, /Quigbot/);
  assert.match(gallery.textContent, /Helixa Swarm/);
});

test('agents route swarm card click opens a standalone swarm Multipass route', async () => {
  const root = setupDom('https://helixa.xyz/multipass/agents');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return sampleData();
    },
  }).start();

  const card = [...root.querySelectorAll('.public-agent-card')].find((candidate) => /Helixa Swarm/.test(candidate.textContent));
  assert.ok(card);
  assert.equal(card.getAttribute('href'), '/multipass/swarm/helixa');

  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  card.dispatchEvent(click);
  await Promise.resolve();

  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(calls, []);
  assert.equal(root.querySelector('.product-home-shell'), null);
  assert.equal(root.querySelector('.homepage-selected-agent-detail'), null);
  const profilePage = root.querySelector('.multipass-profile-page');
  assert.ok(profilePage);
  assert.match(profilePage.textContent, /Swarm detail/);
  assert.match(profilePage.textContent, /Bendr 2\.0/);
  assert.match(profilePage.textContent, /Phantom Relay/);
  assert.match(profilePage.textContent, /Permissions pause and tool routes reverify/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/swarm/helixa');
});

test('static swarm route loads standalone Multipass page without API calls', async () => {
  const root = setupDom('https://helixa.xyz/multipass/swarm/helixa');
  await createApp({
    root,
    fetchImpl: async () => {
      throw new Error('static swarm route must not call the API');
    },
  }).start();

  assert.equal(root.querySelector('.product-home-shell'), null);
  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.match(root.textContent, /Helixa Swarm/);
  assert.match(root.textContent, /Swarm detail/);
  assert.match(root.textContent, /Nox/);
  const auraImage = root.querySelector('.aura-card img');
  assert.equal(auraImage?.getAttribute('src'), 'https://helixa.xyz/multipass/helixa-logo.png');
  assert.equal(auraImage?.getAttribute('alt'), 'Helixa logo swarm identity');
  assert.doesNotMatch(root.textContent, /E2ETest/);
});

test('homepage profile card click resolves in place without showing stale profile shell', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  let resolveLive;
  const liveData = {
    ...sampleData(),
    profile: { ...sampleData().profile, display_name: 'Bendr 2.0' },
    resolver: { canonicalId: '8453:1', tokenId: '1' },
    liveProfilePage: { headline: 'Bendr Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
  };
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return new Promise((resolve) => { resolveLive = () => resolve(liveData); });
    },
  }).start();

  const card = root.querySelector('a.visual-card-button[href="/multipass/?agent=1"]');
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  card.dispatchEvent(click);
  await Promise.resolve();

  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(calls, ['1']);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/');
  assert.ok(root.querySelector('.product-home-shell'));
  assert.equal(root.querySelector('.multipass-profile-page'), null);
  assert.equal(root.querySelector('.record-sheet'), null);

  resolveLive();
  await flushAsyncEvents(20);

  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=1');
});

test('homepage profile card click keeps clicked agent selected while loading', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return new Promise(() => {});
    },
  }).start();

  const card = root.querySelector('a.visual-card-button[href="/multipass/?agent=81"]');
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  card.dispatchEvent(click);
  await Promise.resolve();

  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(calls, ['81']);
  assert.ok(root.querySelector('.product-home-shell'));

  const selectedCard = root.querySelector('.visual-card-button.selected');
  assert.match(selectedCard?.textContent ?? '', /Quigbot/);
  assert.doesNotMatch(selectedCard?.textContent ?? '', /Bendr 2\.0/);
  assert.equal(selectedCard?.getAttribute('aria-busy'), 'true');
  assert.match(selectedCard?.textContent ?? '', /Opening Quigbot/);

  const bendrCard = root.querySelector('a.visual-card-button[href="/multipass/?agent=1"]');
  assert.equal(bendrCard?.classList.contains('selected'), false);
});

test('homepage silently prefetches valid visible agent profiles', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return quigbotLiveData({
        profile: { ...sampleData().profile, display_name: input === '81' ? 'Quigbot Prefetched' : 'Bendr Prefetched' },
        resolver: { canonicalId: `8453:${input}`, tokenId: input },
        liveProfilePage: { headline: `${input} Multipass`, headerMeta: `Live profile · 8453:${input}`, sharePath: `/multipass/?agent=${input}` },
      });
    },
    prefetchProfiles: true,
  }).start();
  await flushHomepagePrefetch();

  assert.deepEqual(calls.sort(), ['1', '81']);
  assert.ok(root.querySelector('.product-home-shell'));
  assert.equal(root.querySelector('.multipass-profile-page'), null);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/');
});

test('homepage profile card click uses prefetched cache immediately', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return quigbotLiveData({
        profile: { ...sampleData().profile, display_name: input === '81' ? 'Quigbot Prefetched' : 'Bendr Prefetched' },
        resolver: { canonicalId: `8453:${input}`, tokenId: input },
        liveProfilePage: { headline: `${input} Multipass`, headerMeta: `Live profile · 8453:${input}`, sharePath: `/multipass/?agent=${input}` },
      });
    },
    prefetchProfiles: true,
  }).start();
  await flushHomepagePrefetch();

  const beforeClickCalls = [...calls];
  const card = root.querySelector('a.visual-card-button[href="/multipass/?agent=81"]');
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  card.dispatchEvent(click);
  await Promise.resolve();

  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(calls, beforeClickCalls);
  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.match(root.textContent, /Quigbot Prefetched/);
  assert.doesNotMatch(root.textContent, /Opening Quigbot/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=81');
});


test('homepage visual image failures fall back to initials instead of broken panels', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const image = root.querySelector('.profile-visual-strip img[data-visual-card-image="true"]');
  assert.ok(image);
  image.dispatchEvent(new root.ownerDocument.defaultView.Event('error'));

  assert.equal(image.hidden, true);
  assert.equal(image.closest('.profile-card-visual')?.classList.contains('image-failed'), true);
  assert.match(image.closest('.profile-card-visual')?.textContent ?? '', /B/);
});

test('initial render shows loading state then product-led Multipass record', async () => {
  const root = setupDom();
  let resolveLoad;
  const app = createApp({
    root,
    loadDemo: () => new Promise((resolve) => { resolveLoad = resolve; }),
  });

  const ready = app.start();
  assert.match(root.textContent, /Loading Multipass/);
  assert.doesNotMatch(root.textContent, /Loading Bendr 2\.0/);

  resolveLoad(sampleData());
  await ready;

  assert.match(root.textContent, /portable public agent profiles/i);
  assert.match(root.textContent, /agent builders/i);
  assert.match(root.textContent, /visual identity graph/i);
  assert.doesNotMatch(root.textContent, /Internal Prototype/);
  assert.doesNotMatch(root.textContent, /Hidden Prototype/);
  assert.doesNotMatch(root.textContent, /Bendr Public Profile/);
  assert.match(root.textContent, /agent builders/i);
  const brandLogo = root.querySelector('.brand-logo');
  assert.equal(brandLogo?.getAttribute('src'), '/multipass/helixa-logo.png');
  assert.equal(brandLogo?.getAttribute('alt'), '');
  const brandLogoLink = root.querySelector('.brand-logo-link');
  assert.equal(brandLogoLink?.getAttribute('href'), '/multipass/');
  assert.equal(brandLogoLink?.getAttribute('aria-label'), 'Go to Multipass home');
  assert.ok(brandLogoLink?.querySelector('.brand-logo-frame'));
  assert.equal(root.querySelector('.brand-wordmark')?.textContent, 'Multipass');
  assert.equal(root.querySelector('.brand-stack .header-meta')?.textContent, 'Portable Agent Identities');
  assert.equal(root.querySelector('.header-actions .header-meta'), null);
  const menuButton = root.querySelector('.site-menu-button');
  assert.equal(menuButton?.getAttribute('type'), 'button');
  assert.equal(menuButton?.getAttribute('aria-label'), 'Open Multipass navigation');
  assert.equal(menuButton?.querySelectorAll('span').length, 3);
  assert.match(root.textContent, /MULTIPASS/);
  assert.doesNotMatch(root.textContent, /What the card shows/);
  assert.doesNotMatch(root.textContent, /What proof adds/);
  assert.doesNotMatch(root.textContent, /Proof below/);
  assert.doesNotMatch(root.textContent, /Portable by design/);
  assert.match(root.textContent, /MULTIPASS/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.doesNotMatch(root.querySelector('.homepage-hero')?.textContent ?? '', /mp_bendr_2/);
  assert.doesNotMatch(root.querySelector('.homepage-hero')?.textContent ?? '', /bendr-2/);
  assert.match(root.textContent, /Bendr 2\.0 Public Profile/);
  const resolver = root.querySelector('.live-resolver');
  assert.ok(resolver);
  assert.doesNotMatch(resolver.textContent, /\b(?:preview|demo|fixture)\b/i);
  assert.doesNotMatch(root.textContent, /\b(?:demo|fixture)\b/i);
  assert.match(root.textContent, /Proof ledger/);
  assert.doesNotMatch(root.textContent, /Card first/);
  assert.match(root.textContent, /Example public agent profiles/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /Quigbot/);
  assert.match(root.textContent, /Cred 80/);
  assert.match(root.textContent, /8453:1/);
  assert.match(root.textContent, /Inspect proof/);
  assert.match(root.textContent, /card needs verification/i);
  assert.match(root.textContent, /Proof vocabulary/);
  assert.match(root.textContent, /Endpoint fragments describe routes/i);
  assert.match(root.textContent, /Platform verified means/i);
  assert.match(root.querySelector('.fragment-card').textContent, /Source/i);
  for (const state of ['verified', 'pending', 'stale', 'historical', 'disputed']) {
    assert.match(root.textContent, new RegExp(state, 'i'));
  }
  assert.ok(root.querySelector('.record-shell'));
  assert.equal(root.querySelector('.record-sheet'), null);
  assert.ok(root.querySelector('.prototype-ribbon'));
  assert.equal(root.querySelector('.clarity-grid'), null);
  assert.equal(root.querySelectorAll('.clarity-card').length, 0);
  assert.ok(root.querySelector('.card-carousel'));
  assert.equal(root.querySelectorAll('.card-button').length, 3);
  assert.match(root.querySelector('.card-detail').textContent, /Helixa ID/);
  assert.ok(root.querySelectorAll('.fragment-card').length >= 6);
  assert.match(root.textContent, /Helixa AgentDNA token #1/);
  assert.match(root.textContent, /Cred score 80/);
  assert.equal(root.querySelector('.fragment-legend')?.tagName, 'DETAILS');
  assert.equal(root.querySelector('.fragment-legend')?.hasAttribute('open'), false);
  assert.ok(root.querySelector('.proof-ledger'));
  assert.ok(root.querySelector('.homepage-proof-panel'));
  assert.equal(root.querySelectorAll('.homepage-proof-stat').length, 4);
});

test('hamburger menu opens trusted Helixa and CRED links', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const app = createApp({ root, loadDemo: async () => sampleData() });

  await app.start();

  const menuButton = root.querySelector('.site-menu-button');
  const menu = root.querySelector('.site-menu');
  assert.ok(menuButton);
  assert.ok(menu);
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.hidden, true);

  menuButton.click();

  assert.equal(menuButton.getAttribute('aria-expanded'), 'true');
  assert.equal(menu.hidden, false);

  const links = [...menu.querySelectorAll('a')].map((link) => ({ label: link.textContent.trim(), href: link.getAttribute('href') }));
  assert.deepEqual(links, [
    { label: 'Multipass Home', href: '/multipass/' },
    { label: 'Register Agent', href: 'https://helixa.xyz/' },
    { label: 'Cred Exchange', href: 'https://cred.exchange/' },
    { label: '$CRED Token', href: 'https://bankr.bot/agents/helixa' },
    { label: 'Docs / API', href: 'https://api.helixa.xyz/' },
  ]);

  assert.equal(menu.querySelector('a[href="https://bankr.bot/agents/helixa"]')?.getAttribute('target'), '_blank');
});

test('resolver bar renders without changing default static data', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const resolver = root.querySelector('.live-resolver');
  assert.ok(resolver);
  assert.match(resolver.textContent, /Activate a live agent record/);
  assert.match(resolver.textContent, /Enter an AgentDNA ID, ERC-8004-style ID, token ID, or agent name/);
  assert.match(resolver.textContent, /Activate Multipass/);
  assert.equal(resolver.querySelector('.resolver-examples'), null);
  assert.doesNotMatch(resolver.textContent, /Examples/);
  assert.doesNotMatch(resolver.textContent, /Try\s/);
  assert.doesNotMatch(resolver.textContent, /Resolve live Helixa agent/);
  assert.doesNotMatch(resolver.textContent, /Helixa ID, name, or handle/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.doesNotMatch(root.textContent, /Bendr is one profile, not the homepage/);
  assert.doesNotMatch(resolver.textContent, /\b(?:preview|demo|fixture)\b/i);
  assert.doesNotMatch(root.textContent, /\b(?:demo|fixture)\b/i);
});

test('static homepage keeps agent visuals inspection-only', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const strip = root.querySelector('.profile-visual-strip');
  assert.ok(strip);
  assert.equal(strip.querySelector('input'), null);
  assert.equal(strip.querySelector('.visual-card-viewport'), null);
  assert.ok(strip.querySelector('.visual-card-track'));
  assert.equal(strip.querySelector('.card-track'), null);
  assert.equal(strip.querySelectorAll('.card-button').length, 0);
  assert.equal(strip.querySelectorAll('.visual-card-button').length, 3);
  assert.equal(strip.querySelector('.visual-carousel-controls'), null);
  assert.doesNotMatch(strip.textContent, /claim|approve|transfer|payment|wallet/i);
});

test('static initial state presents Multipass product home instead of Bendr profile', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.ok(root.querySelector('.product-home-shell'));
  const hero = root.querySelector('.product-hero');
  assert.match(hero?.textContent ?? '', /Portable identity profiles for agents/);
  assert.equal(hero?.querySelector('.live-resolver'), null);
  assert.match(root.querySelector('.live-resolver')?.textContent ?? '', /Activate a live agent record/);
  assert.equal(hero?.querySelector('.homepage-proof-panel'), null);
  const proofPanel = root.querySelector('.homepage-proof-panel');
  assert.match(proofPanel?.textContent ?? '', /What it does/);
  assert.match(proofPanel?.textContent ?? '', /Multipass turns scattered agent identity into one readable public agent profile/);
  assert.match(proofPanel?.textContent ?? '', /Identity inputs/);
  assert.match(proofPanel?.textContent ?? '', /AgentDNA/);
  assert.match(proofPanel?.textContent ?? '', /Owner wallet/);
  assert.match(proofPanel?.textContent ?? '', /Manager agent/);
  assert.match(proofPanel?.textContent ?? '', /Endpoints/);
  assert.match(proofPanel?.textContent ?? '', /NFT provenance/);
  assert.match(proofPanel?.textContent ?? '', /Human-owned/);
  assert.match(proofPanel?.textContent ?? '', /Agent-managed/);
  assert.match(proofPanel?.textContent ?? '', /Standards-readable/);
  assert.match(proofPanel?.textContent ?? '', /Usable profile/);
  assert.match(proofPanel?.textContent ?? '', /Public proof/);
  assert.match(proofPanel?.textContent ?? '', /Permissions/);
  assert.match(proofPanel?.textContent ?? '', /Work routes/);
  assert.match(proofPanel?.textContent ?? '', /Trust context/);
  assert.match(proofPanel?.textContent ?? '', /Shareable profile/);
  assert.match(proofPanel?.textContent ?? '', /ERC-8004/);
  assert.match(proofPanel?.textContent ?? '', /Cred/);
  assert.match(proofPanel?.textContent ?? '', /x401/);
  assert.match(proofPanel?.textContent ?? '', /x402/);
  assert.match(proofPanel?.textContent ?? '', /MCP\/A2A/);
  assert.doesNotMatch(proofPanel?.textContent ?? '', /Wiretap|ClawBank/);
  assert.equal(proofPanel?.querySelectorAll('.homepage-proof-stat').length, 0);
  assert.equal(proofPanel?.querySelector('a, button, form, input, textarea, select, [data-action]'), null);
  const activation = root.querySelector('.live-resolver');
  const groupActivation = root.querySelector('.group-activation-section');
  assert.equal(groupActivation, null);
  assert.equal(proofPanel?.previousElementSibling, activation);
  assert.equal(activation?.previousElementSibling, hero);
  assert.doesNotMatch(root.textContent, /Bendr is one profile, not the homepage/);
  assert.match(root.textContent, /View agents/);
  assert.equal(root.querySelector('.activation-summary'), null);
  assert.equal(root.querySelector('.proof-ledger'), null);
  assert.doesNotMatch(root.textContent, /Bendr 2\.0 Public Profile/);
  assert.doesNotMatch(root.textContent, /\b(?:Demo|demo|fixture|Fixture)\b/);
});


test('resolved live profile renders visual-first drawers without homepage or resolver chrome', async () => {
  const root = await renderResolvedQuigbotProfile();

  const profile = root.querySelector('.multipass-profile-page');
  assert.ok(profile);
  assert.ok(profile.querySelector(':scope > .aura-card'));
  assert.equal(profile.querySelector('.live-resolver'), null);
  assert.equal(profile.querySelector('.profile-gallery'), null);
  assert.equal(profile.querySelector('.homepage-hero'), null);
  assert.equal(profile.querySelectorAll('.profile-detail-drawer').length >= 5, true);
  assert.deepEqual(profileDrawerTitles(profile), [
    'Share and status',
    'Ownership and management',
    'Visual provenance',
    'Trust context',
    'Tools and services',
    'Public proof fragments',
    'Proof ledger',
  ]);
  assert.match(profile.querySelector('.profile-detail-drawers')?.textContent ?? '', /Proof ledger/);
});

test('saved and static profile routes render profile-first visual pages without gallery chrome', async () => {
  const savedRoot = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root: savedRoot, fetchImpl: savedProfileFetch }).start();

  assert.equal(savedRoot.querySelector('.multipass-profile-page .live-resolver'), null);
  assert.equal(savedRoot.querySelector('.multipass-profile-page .profile-gallery'), null);
  assert.ok(savedRoot.querySelector('.multipass-profile-page > .aura-card'));

  const staticRoot = setupDom('https://helixa.xyz/profile/bendr-2');
  await createApp({ root: staticRoot, loadDemo: async () => sampleData() }).start();

  assert.equal(staticRoot.querySelector('.multipass-profile-page .live-resolver'), null);
  assert.equal(staticRoot.querySelector('.multipass-profile-page .profile-gallery'), null);
  assert.ok(staticRoot.querySelector('.multipass-profile-page > .aura-card'));
});

test('refreshed saved Quigbot profile uses holder-editable avatar image and source stats', async () => {
  const root = setupDom('https://helixa.xyz/multipass/quigbot-81?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedQuigbotFetch }).start();

  const auraCard = root.querySelector('.multipass-profile-page > .aura-card');
  assert.ok(auraCard);
  assert.equal(auraCard.querySelector('img')?.getAttribute('src'), NAKAMIGO_2432_IMAGE);
  assert.notEqual(auraCard.querySelector('img')?.getAttribute('src'), 'https://api.helixa.xyz/api/v2/aura/81.png');
  assert.match(auraCard.textContent ?? '', /8453:81/);
  assert.match(auraCard.textContent ?? '', /Cred 75/);
  assert.match(auraCard.textContent ?? '', /verified/);
  assert.match(root.querySelector('.aura-provenance-drawer')?.textContent ?? '', /Manager public avatar URL/);
  assert.equal(root.querySelector('.aura-share-action')?.getAttribute('data-share-url'), QUIGBOT_GENERATED_SHARE_PATH);
});

test('saved Quigbot profile refresh survives trailing slash route', async () => {
  const root = setupDom('https://helixa.xyz/multipass/quigbot-81/?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedQuigbotFetch }).start();

  const auraCard = root.querySelector('.multipass-profile-page > .aura-card');
  assert.ok(auraCard);
  assert.equal(auraCard.querySelector('img')?.getAttribute('src'), NAKAMIGO_2432_IMAGE);
  assert.match(root.querySelector('.aura-provenance-drawer')?.textContent ?? '', /Manager public avatar URL/);
});

test('agent query refresh keeps saved holder avatar overlay when a saved profile exists', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81&api=https://api.example.test');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => ({
      ...quigbotLiveData(),
      profile: {
        ...quigbotLiveData().profile,
        discovery_profile: { ...quigbotLiveData().profile.discovery_profile, avatar_url: null },
      },
      visualIdentity: {
        source: 'helixa_aura',
        label: 'Quigbot visual identity',
        imageUrl: 'https://api.helixa.xyz/api/v2/aura/81.png',
        initials: 'Q',
        tone: 'building',
        chips: ['8453:81'],
        provenanceDrawer: {
          title: 'Quigbot visual provenance',
          summary: 'Live Helixa aura metadata.',
          facts: [{ label: 'Visual source', value: 'Helixa aura route for token 81' }],
        },
      },
      liveProfilePage: { headline: 'Quigbot Multipass', headerMeta: 'Live profile · 8453:81', sharePath: '/multipass/?agent=81' },
      resolver: { chainId: 8453, tokenId: '81', canonicalId: '8453:81' },
    }),
    fetchImpl: savedQuigbotFetch,
  }).start();

  await flushAsyncEvents(20);
  const auraCard = root.querySelector('.multipass-profile-page > .aura-card');
  assert.ok(auraCard);
  assert.equal(auraCard.querySelector('img')?.getAttribute('src'), NAKAMIGO_2432_IMAGE);
  assert.notEqual(auraCard.querySelector('img')?.getAttribute('src'), 'https://api.helixa.xyz/api/v2/aura/81.png');
  assert.match(root.querySelector('.aura-provenance-drawer')?.textContent ?? '', /Manager public avatar URL/);
});

test('agent query refresh hydrates saved public tool cards when a saved profile exists', async () => {
  const liveData = {
    ...sampleData(),
    profile: {
      ...sampleData().profile,
      multipass_id: 'mp_helixa_agent_1',
      slug: 'helixa-agent-1',
      discovery_profile: { visibility: 'public', avatar_url: null },
    },
    liveProfilePage: { headline: 'Bendr 2.0 Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
    resolver: { chainId: 8453, tokenId: '1', canonicalId: '8453:1' },
  };
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/api/multipass/mp_helixa_agent_1')) {
      return new Response(JSON.stringify({
        ...sampleData().profile,
        multipass_id: 'mp_helixa_agent_1',
        slug: 'bendr-2-1',
        discovery_profile: { visibility: 'public', avatar_url: null },
      }), { status: 200 });
    }
    if (value.endsWith('/api/multipass/mp_helixa_agent_1/tools')) {
      return new Response(JSON.stringify(samplePublicTools()), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const root = setupDom('https://helixa.xyz/multipass/?agent=1&api=https://api.example.test');

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData, fetchImpl }).start();

  await flushAsyncEvents(20);
  const toolsPanel = root.querySelector('.public-tools-panel');
  assert.ok(toolsPanel);
  assert.match(toolsPanel.textContent, /Bendr x402 profile lookup/);
  assert.match(toolsPanel.textContent, /api\.bankr\.example\/tools\/bendr\/lookup/);
});

test('agent query does not fall back to legacy resolver when canonical API returns a server error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const calls = [];
  const app = createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (route) => {
      calls.push(String(route));
      if (String(route).includes('/api/multipass/resolve?source=')) {
        return { ok: false, status: 500, text: async () => 'broken' };
      }
      throw new Error(`unexpected legacy fallback ${route}`);
    },
    prefetchProfiles: false,
  });

  await app.start();
  await flushAsyncEvents(20);

  assert.deepEqual(calls, ['/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1']);
  assert.match(root.textContent, /Could not reach the Helixa API/);
});

test('agent query loads canonical hydrated profile and renders saved public tools', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const calls = [];
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activated',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', discovery_profile: { summary: 'Activated agent.', tags: [], visibility: 'public' }, owner_summary: { owner_state: 'unclaimed' }, updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup', description: 'Lookup this agent.' }] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const app = createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (route) => {
      calls.push(String(route));
      if (String(route).includes('/api/multipass/resolve?source=')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(hydrated) };
      }
      throw new Error(`unexpected route ${route}`);
    },
    prefetchProfiles: false,
  });

  await app.start();
  await flushAsyncEvents(20);

  assert.equal(calls.some((route) => route === '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1'), true);
  assert.match(root.textContent, /Agent lookup/);
  assert.doesNotMatch(root.textContent, /display-only/i);
});

test('resolver transitional states keep the live resolver shell instead of profile-first layout', async () => {
  const invalidRoot = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root: invalidRoot,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); },
  }).start();
  invalidRoot.querySelector('.live-resolver input').value = 'not an id';
  invalidRoot.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.ok(invalidRoot.querySelector('.live-resolver'));
  assert.equal(invalidRoot.querySelector('.multipass-profile-page'), null);

  const ambiguousRoot = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root: ambiguousRoot,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => {
      throw new HelixaResolverError('ambiguous_lookup', 'Multiple Helixa agents matched that name.', {
        matches: [
          { tokenId: '1', name: 'Bendr 2.0', helixaId: '8453:1', framework: 'openclaw', credScore: 80, verified: true },
          { tokenId: '81', name: 'Quigbot', helixaId: '8453:81', framework: 'openclaw', credScore: 75, verified: true },
        ],
      });
    },
  }).start();
  ambiguousRoot.querySelector('.live-resolver input').value = 'agent';
  ambiguousRoot.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.ok(ambiguousRoot.querySelector('.live-resolver'));
  assert.ok(ambiguousRoot.querySelector('.lookup-matches'));
  assert.equal(ambiguousRoot.querySelector('.multipass-profile-page'), null);

  const loadingRoot = setupDom('https://helixa.xyz/multipass/?agent=81');
  await createApp({
    root: loadingRoot,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => new Promise(() => {}),
  }).start();
  assert.ok(loadingRoot.querySelector('.live-resolver'));
  assert.equal(loadingRoot.querySelector('.multipass-profile-page'), null);
  assert.equal(loadingRoot.querySelector('.homepage-hero'), null);
  assert.equal(loadingRoot.querySelector('.profile-visual-strip'), null);
  assert.doesNotMatch(loadingRoot.textContent, /Bendr 2\.0/);
});

test('resolved profile synthesizes a fallback visual from the live selected agent', async () => {
  const root = await renderResolvedQuigbotProfile(quigbotLiveData({ visualIdentity: null }));

  const card = root.querySelector('.multipass-profile-page > .aura-card');
  assert.ok(card);
  assert.match(card.textContent ?? '', /Quigbot/);
  assert.doesNotMatch(card.textContent ?? '', /Bendr 2\.0/);
});

test('profile detail drawers keep secondary content collapsed and JSON toggles working', async () => {
  const root = await renderResolvedQuigbotProfile();
  const profile = root.querySelector('.multipass-profile-page');
  assert.ok(profile);
  assert.deepEqual(profileDrawerTitles(profile), [
    'Share and status',
    'Ownership and management',
    'Visual provenance',
    'Trust context',
    'Tools and services',
    'Public proof fragments',
    'Proof ledger',
  ]);

  assert.equal(profile.querySelectorAll('.profile-detail-drawer[open]').length <= 1, true);
  assert.equal(profile.querySelectorAll(':scope > .proof-ledger').length, 0);
  assert.equal(profile.querySelectorAll('.proof-ledger').length, 1);

  const proofDrawer = profileDrawerByTitle(profile, 'Proof ledger');
  assert.ok(proofDrawer);
  const firstToggle = proofDrawer.querySelector('[data-action="toggle-json"]');
  assert.ok(firstToggle);
  assert.equal(firstToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(proofDrawer.querySelector('pre'), null);
  firstToggle.click();
  const expandedProofDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Proof ledger');
  assert.equal(expandedProofDrawer.querySelector('[data-action="toggle-json"]')?.getAttribute('aria-expanded'), 'true');
  assert.match(expandedProofDrawer.querySelector('pre')?.textContent ?? '', /Quigbot/);
});


test('successful live resolve shows activated Multipass summary without stale static framing', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const liveData = {
    ...sampleData(),
    modeLabel: 'Live Profile',
    sourceLabel: 'live Helixa API',
    profile: { ...sampleData().profile, display_name: 'Quigbot' },
    resolver: { canonicalId: '8453:81', tokenId: '81' },
    liveProfilePage: { headline: 'Quigbot Multipass', headerMeta: 'Live profile · 8453:81', sharePath: '/multipass/?agent=81' },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();

  const activation = root.querySelector('.activation-summary');
  assert.match(activation.textContent, /Activated Multipass/);
  assert.match(activation.textContent, /Quigbot/);
  assert.match(activation.textContent, /8453:81/);
  assert.match(activation.textContent, /Activated from live agent record/);
  assert.match(activation.textContent, /This Multipass was built from a live public agent record/);
  assert.match(activation.textContent, /live Helixa API/);
  assert.match(root.textContent, /Live source resolved into an activation preview/);
  assert.doesNotMatch(root.textContent, /This is a static public demo/);
});

test('trusted NFT adapter metadata is required for Activated from NFT label', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    resolver: { canonicalId: '8453:1', tokenId: '1' },
    activation: { origin: 'nft_adapter_new_erc8004', originSource: 'trusted_resolver_metadata' },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.querySelector('.activation-summary').textContent, /Activated from NFT/);
});

test('untrusted NFT-looking live data does not claim Activated from NFT', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    resolver: { canonicalId: '8453:1', tokenId: '1' },
    activation: { origin: 'nft_adapter_new_erc8004', originSource: 'guessed_from_collection' },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();

  const activation = root.querySelector('.activation-summary').textContent;
  assert.match(activation, /Activated from live agent record/);
  assert.doesNotMatch(activation, /Activated from NFT/);
});

test('activated page avoids custody and binding overclaims', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    resolver: { canonicalId: '8453:1', tokenId: '1' },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.doesNotMatch(root.textContent, /bind to existing ERC-8004/i);
  assert.doesNotMatch(root.textContent, /transfer ownership/i);
  assert.doesNotMatch(root.textContent, /move tools/i);
  assert.doesNotMatch(root.textContent, /move secrets/i);
  assert.doesNotMatch(root.textContent, /grant permissions/i);
  assert.doesNotMatch(root.textContent, /passport/i);
  assert.doesNotMatch(root.textContent, /Multi Pass/i);
  assert.doesNotMatch(root.textContent, /created ERC-8004/i);
});


test('render uses live hero note when data supplies one', async () => {
  const data = { ...sampleData(), heroNote: 'Public Helixa API source evidence for Bendr 2.0.', sourceLabel: 'live Helixa API' };
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  await createApp({ root, loadDemo: async () => data }).start();

  assert.match(root.textContent, /Public Helixa API source evidence for Bendr 2\.0/);
  assert.doesNotMatch(root.textContent, /public record data/);
});

test('agent card carousel switches selected card detail', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.match(root.querySelector('.card-detail').textContent, /Bendr 2\.0/);
  assert.match(root.querySelector('.card-detail').textContent, /Cred 80/);

  root.querySelectorAll('.card-button')[1].click();

  assert.match(root.querySelector('.card-detail').textContent, /Quigbot/);
  assert.match(root.querySelector('.card-detail').textContent, /8453:81/);
  assert.match(root.querySelector('.card-detail').textContent, /Cred 75/);
});



test('landing page presents Helixa Swarm as a parent collection card', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelectorAll('.card-button').length, 3);
  assert.match(root.textContent, /Helixa Swarm/);
  assert.match(root.textContent, /Parent Multipass/);
  assert.match(root.textContent, /5 agents/);
  assert.doesNotMatch(root.textContent, /E2ETest/);
  assert.match(root.textContent, /Custody epoch ready/);
  assert.doesNotMatch(root.querySelector('.fragment-map').textContent, /Swarm roster/);

  root.querySelectorAll('.card-button')[2].click();
  assert.match(root.querySelector('.fragment-map').textContent, /Swarm roster/);
  assert.match(root.querySelector('.fragment-map').textContent, /Shared tool policy/);
  assert.match(root.querySelector('.fragment-map').textContent, /Aggregate Cred context/);
  assert.equal(root.textContent.includes('frag_helixa_swarm_'), false);
});


test('selecting Helixa Swarm shows roster roles policy references and transfer behavior', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  root.querySelectorAll('.card-button')[2].click();

  const detail = root.querySelector('.card-detail').textContent;
  assert.match(detail, /Swarm detail/);
  assert.match(detail, /Bendr 2\.0/);
  assert.match(detail, /Lead Agent \/ Trust Router/);
  assert.match(detail, /Quigbot/);
  assert.match(detail, /Product \/ Strategy Agent/);
  assert.match(detail, /Helixa/);
  assert.match(detail, /Protocol \/ Identity Agent/);
  assert.match(detail, /Phantom Relay/);
  assert.match(detail, /Routing \/ Relay Agent/);
  assert.match(detail, /Nox/);
  assert.match(detail, /Ops \/ Safety Agent/);
  assert.doesNotMatch(detail, /E2ETest/);
  assert.match(detail, /Policy references/);
  assert.match(detail, /Tool approval policy/);
  assert.match(detail, /Route policy reference/);
  assert.match(detail, /Owner approval required/);
  assert.doesNotMatch(detail, /Shared controls/);
  assert.match(detail, /Cred 78 Prime summarizes the roster without replacing individual agent scores/);
  assert.match(detail, /Permissions pause and tool routes reverify when custody changes/);
});




test('selected card renders owner and custody snapshot without executable controls', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  let snapshot = root.querySelector('.owner-snapshot');
  assert.ok(snapshot);
  assert.match(snapshot.textContent, /Owner & Custody Snapshot/);
  assert.match(snapshot.textContent, /0x3395\.\.\.480E0/);
  assert.match(snapshot.textContent, /Bendr runtime/);
  assert.match(snapshot.textContent, /Epoch 01/);
  assert.match(snapshot.textContent, /Active owner-approved routes/);
  assert.match(snapshot.textContent, /Public profile, private credentials hidden/);
  assert.match(snapshot.textContent, /Cred import refreshed/);
  assert.match(snapshot.textContent, /Review stale standards reference/);
  assert.doesNotMatch(snapshot.textContent, /Execute|Approve now|Transfer now/i);

  root.querySelectorAll('.card-button')[2].click();
  snapshot = root.querySelector('.owner-snapshot');
  assert.match(snapshot.textContent, /Helixa ops/);
  assert.match(snapshot.textContent, /Paused until owner review/);
  assert.match(snapshot.textContent, /Transfer detected 2026-06-24/);
  assert.match(snapshot.textContent, /Reverify routes before resume/);
});

test('selected card renders change review ledger below owner snapshot without executable controls', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  let ledger = root.querySelector('.change-review-ledger');
  assert.ok(ledger);
  assert.match(ledger.textContent, /Change \+ Review Ledger/);
  assert.match(ledger.textContent, /Cred import refreshed/);
  assert.match(ledger.textContent, /Verified/);
  assert.match(ledger.textContent, /Standards reference stale/);
  assert.match(ledger.textContent, /Reverify/);
  assert.match(ledger.textContent, /Private credentials hidden/);
  assert.match(ledger.textContent, /No public action/);
  assert.doesNotMatch(ledger.textContent, /Execute|Approve now|Transfer now/i);

  const snapshot = root.querySelector('.owner-snapshot');
  assert.ok(snapshot.compareDocumentPosition(ledger) & root.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);

  root.querySelectorAll('.card-button')[2].click();
  ledger = root.querySelector('.change-review-ledger');
  const transfer = root.querySelector('.transfer-preview');
  assert.match(ledger.textContent, /Transfer detected/);
  assert.match(ledger.textContent, /Review required/);
  assert.match(ledger.textContent, /Shared route policy changed/);
  assert.match(ledger.textContent, /Paused/);
  assert.ok(root.querySelector('.owner-snapshot').compareDocumentPosition(ledger) & root.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(ledger.compareDocumentPosition(transfer) & root.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
});

test('selected card renders ownership state with paused permissions and preserved history', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  root.querySelectorAll('.card-button')[2].click();

  const preview = root.querySelector('.transfer-preview');
  assert.ok(preview);
  assert.match(preview.textContent, /Ownership State/);
  assert.doesNotMatch(preview.textContent, /\bpreview\b/i);
  assert.match(preview.textContent, /Current owner/);
  assert.match(preview.textContent, /0x3395\.\.\.480E0/);
  assert.match(preview.textContent, /Custody epoch/);
  assert.match(preview.textContent, /Epoch 03/);
  assert.match(preview.textContent, /New owner claim required/);
  assert.doesNotMatch(preview.textContent, /Claim swarm/);
  assert.match(preview.textContent, /Permissions paused/);
  assert.match(preview.textContent, /Reverify shared tools/);
  assert.match(preview.textContent, /Rotate private access/);
  assert.match(preview.textContent, /History preserved/);
  assert.match(preview.textContent, /Cred continues with ownership-change context/);
  assert.match(preview.textContent, /does not transfer secrets/);
});

test('proof section follows selected card', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  root.querySelectorAll('.card-button')[1].click();
  let proofTitles = [...root.querySelectorAll('.fragment-card h3')].map((node) => node.textContent);
  assert.deepEqual(proofTitles, ['Quigbot identity', 'Quigbot Cred context']);
  assert.match(root.querySelector('.proof-ledger').textContent, /2 public/);
  assert.doesNotMatch(root.querySelector('.fragment-map').textContent, /Helixa AgentDNA identity/);

  root.querySelectorAll('.card-button')[2].click();
  proofTitles = [...root.querySelectorAll('.fragment-card h3')].map((node) => node.textContent);
  assert.deepEqual(proofTitles, ['Swarm roster', 'Shared tool policy', 'Aggregate Cred context']);
  assert.match(root.querySelector('.proof-ledger').textContent, /3 public/);
  assert.doesNotMatch(root.querySelector('.fragment-map').textContent, /Quigbot identity/);
});

test('profile page keeps product education cards and raw fragment ids out of default view', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.match(root.textContent, /MULTIPASS/i);
  assert.doesNotMatch(root.textContent, /Card first/i);
  assert.doesNotMatch(root.textContent, /Proof below/i);
  assert.doesNotMatch(root.textContent, /Portable by design/i);
  assert.equal(root.querySelector('.story-records'), null);
  assert.equal(root.querySelector('.clarity-grid'), null);
  assert.match(root.textContent, /Inspect proof/i);
  assert.equal(root.textContent.includes('frag_bendr_'), false);

  const carousel = root.querySelector('.card-carousel');
  const proof = root.querySelector('.fragment-map');
  assert.ok(carousel.compareDocumentPosition(proof) & root.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
});

test('proof ledger renders all seven document types and JSON toggles open and close', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  for (const title of ['Profile', 'Public Fragments', 'Agent Card', 'Standards', 'x401', 'x402', 'Receipt']) {
    assert.match(root.textContent, new RegExp(title));
  }
  assert.match(root.textContent, /canonical summary/i);
  assert.match(root.textContent, /without claiming every adapter is live/i);
  assert.match(root.textContent, /without implying live settlement/i);
  assert.match(root.textContent, /without becoming trust by itself/i);
  assert.equal(root.querySelectorAll('.ledger-entry .why').length, 7);

  const firstToggle = root.querySelector('[data-action="toggle-json"]');
  assert.equal(firstToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(firstToggle.getAttribute('aria-controls'), 'proof-json-0');
  assert.equal(root.querySelector('pre'), null);
  firstToggle.click();
  assert.equal(root.querySelector('[data-action="toggle-json"]').getAttribute('aria-expanded'), 'true');
  assert.match(root.querySelector('pre').textContent, /Bendr 2\.0/);
  root.querySelector('[data-action="toggle-json"]').click();
  assert.equal(root.querySelector('pre'), null);

  root.querySelectorAll('[data-action="toggle-json"]')[1].click();
  assert.equal(root.innerHTML.includes('frag_bendr_private_placeholder'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_unexpected_private_field'), false);
  root.querySelectorAll('[data-action="toggle-json"]')[1].click();
  assert.equal(root.querySelector('pre'), null);
});


test('proof ledger uses neutral badges for counts and green only for settled states', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const neutralBadges = [...root.querySelectorAll('.badge.neutral')].map((badge) => badge.textContent);
  assert.ok(neutralBadges.includes('1 capabilities'));
  assert.ok(neutralBadges.includes('1 refs'));
  assert.ok(neutralBadges.includes('1 endpoints'));
  const verifiedBadges = [...root.querySelectorAll('.badge.verified')].map((badge) => badge.textContent);
  const neutralBadgesAll = [...root.querySelectorAll('.badge.neutral')].map((badge) => badge.textContent);
  assert.deepEqual(verifiedBadges, ['settled']);
  assert.ok(neutralBadgesAll.includes('link_ready'));
  assert.ok(neutralBadgesAll.includes('7 public'));
});

test('default loader uses safe api query override from window location', async () => {
  const root = setupDom('http://localhost/?api=http://127.0.0.1:9999/');
  const calls = [];
  const payloads = {
    'http://127.0.0.1:9999/api/multipass/bendr-2': sampleData().profile,
    'http://127.0.0.1:9999/api/multipass/bendr-2/fragments': sampleData().fragments,
    'http://127.0.0.1:9999/api/multipass/bendr-2/agent-card': sampleData().card,
    'http://127.0.0.1:9999/api/multipass/bendr-2/standards': sampleData().standards,
    'http://127.0.0.1:9999/api/multipass/bendr-2/x402': sampleData().x402,
    'http://127.0.0.1:9999/api/multipass/bendr-2/receipts/receipt_bendr_lookup': sampleData().receipt,
  };

  globalThis.fetch = async (route) => {
    calls.push(route);
    return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
  };

  try {
    await createApp({ root }).start();
  } finally {
    delete globalThis.fetch;
  }

  assert.ok(calls.every((route) => route.startsWith('http://127.0.0.1:9999/')));
  assert.match(root.textContent, /Bendr 2\.0/);
});


test('static /multipass/ page loads product home without calling API', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  globalThis.fetch = async (route) => {
    calls.push(route);
    throw new Error(`unexpected fetch ${route}`);
  };

  try {
    await createApp({ root }).start();
  } finally {
    delete globalThis.fetch;
  }

  assert.deepEqual(calls, []);
  assert.ok(root.querySelector('.product-home-shell'));
  assert.match(root.textContent, /Portable identity profiles for agents/);
  assert.match(root.textContent, /View agents/);
  assert.equal(root.querySelector('.fragment-card'), null);
  assert.equal(root.querySelector('.proof-ledger'), null);
  assert.equal(root.innerHTML.includes('/multipass-api'), false);
});


test('static /multipass/ ignores unsafe api query override without calling API', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?api=not-a-url');
  const calls = [];
  globalThis.fetch = async (route) => {
    calls.push(route);
    throw new Error(`unexpected fetch ${route}`);
  };

  try {
    await createApp({ root }).start();
  } finally {
    delete globalThis.fetch;
  }

  assert.deepEqual(calls, []);
  assert.ok(root.querySelector('.product-home-shell'));
  assert.match(root.textContent, /Portable identity profiles for agents/);
  assert.equal(root.innerHTML.includes('/multipass-api'), false);
});


test('resolver submit loads live data and updates source label', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver', heroNote: 'Public Helixa API source evidence for Live Bendr.' };
  const calls = [];
  const app = createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); return liveData; },
  });

  await app.start();
  root.querySelector('.live-resolver input').value = '8453:1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['8453:1']);
  assert.match(root.textContent, /Live Bendr/);
  assert.match(root.textContent, /live Helixa API/);
  assert.match(root.textContent, /Live source resolved into an activation preview/);
});


test('Bendr public profile does not require marketplace listing data', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.equal(root.querySelector('.marketplace-listing'), null);
  assert.doesNotMatch(root.innerHTML, /Marketplace listing context/);
  assert.doesNotMatch(root.innerHTML, /Example public agent profiles/);
  const trustCopy = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')?.textContent ?? '';
  assert.match(trustCopy, /Marketplace Connections/);
  assert.match(trustCopy, /No marketplace connections published yet/);
});

test('live resolver renders public agent profile compatibility context without executable controls', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = {
    ...sampleData(),
    profile: { ...sampleData().profile, display_name: 'Live Bendr' },
    sourceLabel: 'live Helixa API',
    modeLabel: 'Live Resolver',
    marketplaceListing: {
      title: 'Bendr 2.0 public agent profile',
      subtitle: '8453:1 · openclaw',
      summary: 'Public AgentDNA profile prepared for directories, builders, and marketplace compatibility with trust context.',
      identity: { name: 'Bendr 2.0', helixaId: '8453:1', tokenId: '1', framework: 'openclaw', verifiedLabel: 'Verified AgentDNA', sourceLabel: 'Live Helixa API' },
      score: { label: 'Cred 80', tier: 'Preferred', value: 80, tone: 'preferred' },
      badges: [{ label: 'Verified AgentDNA', tone: 'verified' }, { label: 'Open to work', tone: 'verified' }],
      facts: [{ label: 'Owner', value: '0x27E3...91Ea' }, { label: 'Operator', value: 'Not delegated' }],
      routes: [{ label: 'Web', value: 'https://helixa.xyz/agent/1', url: 'https://helixa.xyz/agent/1', kind: 'service' }, { label: 'MCP', value: 'https://api.helixa.xyz/api/mcp', url: 'https://api.helixa.xyz/api/mcp', kind: 'service' }],
      paymentReferences: [{ label: 'Accepted reference', value: 'USDC', chainId: 8453, source: 'Helixa metadata' }, { label: 'Linked token', value: 'CRED', chainId: 8453, source: 'Helixa linked token' }],
      proof: { publicFragmentCount: 7, verifiedSignalCount: 3, reviewRequiredCount: 2, privateCredentialState: 'No secrets or private credentials exposed' },
      links: [{ label: 'Explorer', url: 'https://basescan.org/token/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60?a=1' }],
      safetyNote: 'Public routes and proof are visible; authority and private credentials stay protected.',
    },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  const listing = root.querySelector('.marketplace-listing');
  assert.ok(listing);
  assert.match(listing.textContent, /Public agent profile context/);
  assert.match(listing.textContent, /Bendr 2\.0 public agent profile/);
  assert.match(listing.textContent, /Cred 80/);
  assert.match(listing.textContent, /Preferred/);
  assert.match(listing.textContent, /Live Helixa API/);
  assert.match(listing.textContent, /No secrets or private credentials exposed/);
  assert.match(listing.textContent, /USDC/);
  assert.match(listing.textContent, /CRED/);
  assert.equal(listing.querySelector('button'), null);
  assert.equal(listing.querySelector('form'), null);
  assert.equal(listing.querySelector('[data-action]'), null);
  assert.doesNotMatch(listing.textContent, /instant approval|instant transfer|instant claim|checkout|credential release/i);
});

test('marketplace listing renderer does not link unsafe URLs', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplaceListing: {
      title: 'Verified agent listing for Safe Test',
      summary: 'Safe renderer boundary test.',
      identity: { verifiedLabel: 'Verified AgentDNA' },
      score: { tier: 'Qualified', label: 'Cred 50' },
      badges: [],
      facts: [],
      routes: [{ label: 'Unsafe', value: 'javascript:alert(1)', url: 'javascript:alert(1)', kind: 'service' }],
      paymentReferences: [],
      proof: { publicFragmentCount: 0, verifiedSignalCount: 0, reviewRequiredCount: 0, privateCredentialState: 'No secrets or private credentials exposed' },
      links: [{ label: 'Unsafe link', url: 'javascript:alert(1)' }],
      safetyNote: 'Public inspection only.',
    },
  };
  await createApp({ root, loadDemo: async () => data }).start();

  const listing = root.querySelector('.marketplace-listing');
  assert.ok(listing);
  assert.equal(listing.querySelector('a[href^="javascript:"]'), null);
  assert.match(listing.textContent, /Unsafe/);
  assert.match(listing.textContent, /Unsafe link/);
});

test('profile Trust context renders Marketplace Connections empty state without records', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = { ...sampleData() };
  delete data.marketplacePresence;

  await createApp({ root, loadDemo: async () => data }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /No marketplace connections published yet/);
  assert.match(panel.textContent, /OKX\.AI/);
  assert.match(panel.textContent, /OpenSea/);
  assert.match(panel.textContent, /Bankr/);
  assert.match(panel.textContent, /ACP/);
  assert.match(panel.textContent, /direct x402/);
  assert.equal(panel.querySelector('.marketplace-presence-card'), null);
  assert.doesNotMatch(panel.textContent, /CertiK Security APIs/);
  assert.doesNotMatch(panel.textContent, /X Layer 196/);
});

test('profile Trust context renders Marketplace Connections cards from public metadata', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = { ...sampleData(), marketplacePresence: [null, {}, { marketplace: 'Empty marketplace' }, okxMarketplacePresence({ status: 'public_import', paymentRails: [] })] };

  await createApp({ root, loadDemo: async () => data }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.ok(trustDrawer.contains(panel));
  assert.equal(panel.querySelectorAll('.marketplace-presence-card').length, 1);
  assert.doesNotMatch(panel.textContent, /Empty marketplace/);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /OKX\.AI/);
  assert.match(panel.textContent, /Listing ID/);
  assert.match(panel.textContent, /1965/);
  assert.match(panel.textContent, /CertiK Security APIs/);
  const serviceCard = panel.querySelector('.marketplace-presence-service');
  assert.ok(serviceCard);
  assert.match(serviceCard.textContent, /0\.001 USDT/);
  assert.match(serviceCard.textContent, /x402 marketplace checkout/);
  assert.match(panel.textContent, /Public import/);
  assert.match(panel.textContent, /X Layer 196/);
  assert.match(panel.textContent, /5\.0/);
  assert.match(panel.textContent, /100%/);
  assert.match(panel.textContent, /53/);
  assert.match(panel.textContent, /1/);
  assert.match(panel.textContent, /2026-07-05T21:45:02Z/);
  assert.match(panel.textContent, /Optional public marketplace metadata only/);
});

test('marketplace presence links only render safe public URLs', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplacePresence: [okxMarketplacePresence({
      profileUrl: 'javascript:alert(1)',
      source: { url: 'https://source.example.test/public/1965' },
      services: [{ name: 'Private endpoint test', price: '0.001 USDT', endpointUrl: 'https://user:pass@example.com/private' }],
    })],
  };

  await createApp({ root, loadDemo: async () => data }).start();

  const panel = root.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.equal(panel.querySelector('a[href^="javascript:"]'), null);
  assert.equal(panel.querySelector('a[href="https://user:pass@example.com/private"]'), null);
  assert.doesNotMatch(panel.innerHTML, /user:pass/);
  const safeSource = panel.querySelector('a[href="https://source.example.test/public/1965"]');
  assert.ok(safeSource);
  assert.equal(safeSource.getAttribute('target'), '_blank');
  assert.match(safeSource.getAttribute('rel') ?? '', /noopener/);
  assert.match(safeSource.getAttribute('rel') ?? '', /noreferrer/);
});

test('marketplace connections render empty state while preserving routes and legacy marketplace listing', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplacePresence: [],
    fragments: {
      ...sampleData().fragments,
      fragments: [
        ...sampleData().fragments.fragments,
        {
          fragment_id: 'frag_presence_route_safe',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'owner_submission', issuer: null },
          public_value: 'Marketplace-safe route',
          endpoint_ref: { endpoint_id: 'marketplace-safe-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
          updated_at: '2026-07-05T21:40:00Z',
        },
      ],
    },
    marketplaceListing: {
      title: 'Legacy marketplace listing',
      summary: 'Compatibility panel stays visible.',
      identity: { verifiedLabel: 'Verified AgentDNA' },
      score: { tier: 'Preferred', label: 'Cred 80' },
      routes: [],
      paymentReferences: [],
      proof: { publicFragmentCount: 0, verifiedSignalCount: 0, reviewRequiredCount: 0, privateCredentialState: 'No secrets or private credentials exposed' },
      links: [],
    },
  };

  await createApp({ root, loadDemo: async () => data }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /No marketplace connections published yet/);
  assert.equal(panel.querySelector('.marketplace-presence-card'), null);
  assert.ok(trustDrawer.querySelector('.public-routes-panel'));
  assert.ok(trustDrawer.querySelector('.marketplace-listing'));
});

test('marketplace presence only renders platform verified with verified source evidence', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplacePresence: [
      okxMarketplacePresence({
        listingId: 'claimed-only',
        status: 'platform_verified',
        source: { url: '' },
        proof: { assurance: 'platform_verified', source: { url: 'https://source.example.test/proof-only/1965' } },
      }),
      okxMarketplacePresence({
        listingId: 'verified-source',
        source: { url: 'https://source.example.test/verified/1965' },
        proof: { assurance: 'platform_verified' },
      }),
    ],
  };

  await createApp({ root, loadDemo: async () => data }).start();

  const cards = [...root.querySelectorAll('.marketplace-presence-card')];
  const claimedOnly = cards.find((card) => card.textContent.includes('claimed-only'));
  const verifiedSource = cards.find((card) => card.textContent.includes('verified-source'));
  assert.ok(claimedOnly);
  assert.ok(verifiedSource);
  assert.doesNotMatch(claimedOnly.textContent, /Platform verified source/);
  assert.match(claimedOnly.textContent, /Public metadata/);
  assert.match(verifiedSource.textContent, /Platform verified source/);
});

test('OpenSea-style marketplace connection renders as optional public metadata only', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplacePresence: [{
      marketplace: 'OpenSea',
      listingId: 'base:0x2e3B541C59D38b84E3Bc54e977200230A204Fe60:81',
      profileUrl: 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81',
      status: 'manager_supplied',
      source: {
        label: 'OpenSea public item',
        url: 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81',
        checkedAt: '2026-07-06T00:00:00Z',
        provenance: 'source-referenced listing',
      },
      services: [{ name: 'Public agent tool manifest', paymentMode: 'metadata only' }],
      paymentRails: ['metadata only'],
      reputation: {},
      proof: { assurance: 'public_metadata', fragmentIds: [] },
    }],
  };

  await createApp({ root, loadDemo: async () => data }).start();

  const panel = root.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /OpenSea/);
  assert.match(panel.textContent, /Manager supplied/);
  assert.match(panel.textContent, /Public agent tool manifest/);
  assert.match(panel.textContent, /metadata only/);
  assert.doesNotMatch(panel.textContent, /official OpenSea integration/i);
  assert.doesNotMatch(panel.textContent, /registered on OpenSea/i);
  const link = panel.querySelector('a[href="https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81"]');
  assert.ok(link);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.match(link.getAttribute('rel') ?? '', /noopener/);
  assert.match(link.getAttribute('rel') ?? '', /noreferrer/);
});

test('marketplace presence safety copy avoids authority payment credential and registration overclaims', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = { ...sampleData(), marketplacePresence: [okxMarketplacePresence()] };

  await createApp({ root, loadDemo: async () => data }).start();

  const copy = root.querySelector('.marketplace-presence-panel')?.textContent.toLowerCase() ?? '';
  for (const phrase of [
    'payment proves trust',
    'private credentials available',
    'acts on behalf',
    'executes tools',
    'custody transfer',
    'authority over marketplace account',
    'official okx integration',
    'official opensea integration',
    'registered on okx',
    'registered on opensea',
    'collects x401 proof',
    'requires identity proof',
  ]) {
    assert.equal(copy.includes(phrase), false, phrase);
  }
});

test('static swarm profile renders empty Marketplace Connections without seeded OKX claim', async () => {
  const root = setupDom('https://helixa.xyz/multipass/swarm/helixa');

  await createApp({ root, prefetchProfiles: false }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /No marketplace connections published yet/);
  assert.equal(panel.querySelector('.marketplace-presence-card'), null);
  assert.doesNotMatch(panel.textContent, /CertiK Security APIs/);
  assert.doesNotMatch(panel.textContent, /X Layer 196/);
  assert.doesNotMatch(panel.textContent, /registered on OKX/i);
  assert.doesNotMatch(panel.textContent, /official OKX integration/i);
});

test('public profile button restores Multipass home after live resolve from homepage', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver' };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  root.querySelector('[data-action="reset-static-demo"]').click();

  assert.match(root.textContent, /Portable identity profiles for agents/);
  assert.doesNotMatch(root.textContent, /Bendr is one profile, not the homepage/);
  assert.doesNotMatch(root.textContent, /Live Bendr/);
});

test('back to Multipass home from direct agent query clears profile route state', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const liveData = {
    ...sampleData(),
    profile: { ...sampleData().profile, display_name: 'Quigbot' },
    resolver: { canonicalId: '8453:81', tokenId: '81' },
    liveProfilePage: { headline: 'Quigbot Multipass', headerMeta: 'Live profile · 8453:81', sharePath: '/multipass/?agent=81' },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();
  root.querySelector('[data-action="reset-static-demo"]').click();

  assert.ok(root.querySelector('.product-home-shell'));
  assert.equal(root.querySelector('.multipass-profile-page'), null);
  assert.equal(root.querySelector('.record-sheet'), null);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/');
});

test('Bendr public profile reset invalidates an in-flight live resolver response', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolveLive;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => new Promise((resolve) => { resolveLive = resolve; }),
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="reset-static-demo"]').click();
  resolveLive({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Late Live Bendr' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();

  assert.doesNotMatch(root.textContent, /Late Live Bendr/);
  assert.match(root.textContent, /Portable identity profiles for agents/);
});

test('resolver invalid input shows validation error and keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); },
  }).start();

  root.querySelector('.live-resolver input').value = 'Bendr';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Use a token ID like 1 or a Helixa ID like 8453:1/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('resolver unsupported chain shows Base-only error and keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('unsupported_chain', 'V0 supports Base Helixa AgentDNA records only.'); },
  }).start();

  root.querySelector('.live-resolver input').value = '1:1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /V0 supports Base Helixa AgentDNA records only/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('resolver API error keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('not_found', 'No Helixa agent found for that ID.'); },
  }).start();

  root.querySelector('.live-resolver input').value = '999999';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /No Helixa agent found for that ID/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('failed lookup after live activation returns to preview state without stale activated copy', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let calls = 0;
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    profile: { ...sampleData().profile, display_name: 'Quigbot Live' },
    resolver: { canonicalId: '8453:81', tokenId: '81' },
    liveProfilePage: { headline: 'Quigbot Multipass', headerMeta: 'Live profile · 8453:81', sharePath: '/multipass/?agent=81' },
  };

  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => {
      calls += 1;
      if (calls === 1) return liveData;
      throw new HelixaResolverError('not_found', 'No Helixa agent found for that ID.');
    },
  }).start();

  root.querySelector('.live-resolver input').value = '81';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  assert.match(root.querySelector('.activation-summary').textContent, /Activated Multipass/);

  root.querySelector('[data-action="reset-static-demo"]').click();
  root.querySelector('.live-resolver input').value = '999999';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /No Helixa agent found for that ID/);
  assert.ok(root.querySelector('.product-home-shell'));
  assert.equal(root.querySelector('.multipass-profile-page'), null);
  assert.doesNotMatch(root.textContent, /Quigbot Live/);
  assert.doesNotMatch(root.textContent, /Activated Multipass/);
  assert.equal(new URL(window.location.href).searchParams.get('agent'), null);
});

test('resolver rate limit disables retry during Retry-After window', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('rate_limited', 'Helixa API is rate-limiting requests. Try again shortly.', { retryAfter: '12' }); },
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(root.querySelector('.live-resolver button[type="submit"]').disabled, true);
  assert.match(root.textContent, /Try again in 12 seconds/);
});

test('resolver disables duplicate submit while matching request is in flight', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolveLive;
  let calls = 0;
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => { calls += 1; return new Promise((resolve) => { resolveLive = resolve; }); } }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(calls, 1);
  assert.equal(root.querySelector('.live-resolver button[type="submit"]').textContent, 'Activating...');

  resolveLive(sampleData());
  await Promise.resolve();
  await Promise.resolve();
});

test('changed input can supersede an older in-flight resolver request through the real UI', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  const resolvers = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: (input) => new Promise((resolve) => { calls.push(input); resolvers.push(resolve); }),
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(root.querySelector('.live-resolver button[type="submit"]').disabled, false);
  root.querySelector('.live-resolver input').value = '81';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, ['1', '81']);
  resolvers[1]({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Quigbot Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();
  assert.match(root.textContent, /Quigbot Live/);
});

test('newer resolver response supersedes older response', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const resolvers = [];
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: (input) => new Promise((resolve) => resolvers.push({ input, resolve })) }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('.live-resolver input').value = '81';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  resolvers[1].resolve({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Quigbot Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();
  resolvers[0].resolve({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Old Bendr Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Quigbot Live/);
  assert.doesNotMatch(root.textContent, /Old Bendr Live/);
});

test('agent query auto-resolves live record after static load', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=8453:1');
  const calls = [];
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async (input) => { calls.push(input); return { ...sampleData(), sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver' }; } }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['8453:1']);
  assert.match(root.textContent, /live Helixa API/);
});

test('resolved live agent takes over the page hero and record surface', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const liveData = {
    ...sampleData(),
    modeLabel: 'Live Profile',
    sourceLabel: 'live Helixa API',
    profile: { ...sampleData().profile, display_name: 'Quigbot', slug: 'helixa-agent-81', multipass_id: 'mp_helixa_agent_81' },
    liveProfilePage: {
      eyebrow: 'LIVE MULTIPASS',
      headline: 'Quigbot Multipass',
      body: 'Live AgentDNA profile for Quigbot with public identity, routes, custody context, and proof inspection.',
      note: 'Shareable live profile for 8453:81.',
      recordIntro: 'Live public AgentDNA profile assembled from public Helixa API signals.',
      headerMeta: 'Live profile · 8453:81',
      sharePath: '/multipass/?agent=81',
    },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  await Promise.resolve();
  await Promise.resolve();

  const profile = root.querySelector('.multipass-profile-page');
  assert.ok(profile);
  assert.equal(root.querySelector('.homepage-hero'), null);
  assert.match(root.querySelector('.header-meta').textContent, /Live profile · 8453:81/);
  assert.match(profile.querySelector('.aura-card')?.textContent ?? '', /Quigbot/);
  assert.equal(root.querySelector('.share-link'), null);
  assert.equal(root.querySelector('.share-panel .share-url')?.textContent, 'https://helixa.xyz/multipass/?agent=81');
  assert.match(root.querySelector('.share-panel')?.textContent ?? '', /Quigbot Multipass/);
});


test('live profile renders OpenSea-style Agent Aura item panel with provenance drawer', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const data = {
    ...sampleData(),
    liveProfilePage: { headline: 'Quigbot Multipass', sharePath: '/multipass/?agent=81' },
    visualIdentity: {
      source: 'helixa_aura',
      label: 'Helixa Agent Aura',
      imageUrl: 'https://api.helixa.xyz/api/v2/aura/81.png',
      initials: 'Q',
      tone: 'prime',
      summary: 'Default Helixa Agent Aura. Owners can later bind an agent NFT, collection NFT, or custom visual.',
      chips: ['Cred 75', 'openclaw', 'Verified'],
      provenanceDrawer: {
        title: 'Agent Aura Provenance',
        summary: 'Public Helixa API-reported provenance for this AgentDNA visual.',
        facts: [
          { label: 'Helixa ID', value: '8453:81' },
          { label: 'AgentDNA token ID', value: '81' },
          { label: 'Chain', value: 'Base (8453)' },
          { label: 'Contract', value: '0x2e3B541C59D38b84E3Bc54e977200230A204Fe60' },
          { label: 'Owner', value: '0x17d7...bDe4' },
          { label: 'Metadata source', value: 'https://api.helixa.xyz/api/v2/metadata/81' },
          { label: 'Aura image source', value: 'https://api.helixa.xyz/api/v2/aura/81.png' },
          { label: 'API source', value: 'https://api.helixa.xyz/api/v2/agent/81' },
        ],
        links: [
          { label: 'Metadata JSON', url: 'https://api.helixa.xyz/api/v2/metadata/81' },
          { label: 'Aura image', url: 'https://api.helixa.xyz/api/v2/aura/81.png' },
          { label: 'OpenSea item', url: 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81' },
        ],
        safetyNote: 'Public provenance context. Viewing does not grant authority or expose private credentials.',
      },
    },
    marketplaceListing: {
      title: 'Quigbot public agent profile',
      summary: 'Live public AgentDNA profile with trust context.',
      identity: { helixaId: '8453:81', framework: 'openclaw', verifiedLabel: 'Verified AgentDNA', sourceLabel: 'Live Helixa API' },
      score: { tier: 'Prime', label: 'Cred 75' },
      badges: [],
      facts: [],
      routes: [],
      paymentReferences: [],
      links: [],
      safetyNote: 'Public inspection only.',
    },
  };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => data }).start();
  await Promise.resolve();
  await Promise.resolve();

  const auraCard = root.querySelector('.aura-card');
  const drawer = root.querySelector('.aura-provenance-drawer');
  assert.equal(auraCard?.getAttribute('data-visual-source'), 'helixa_aura');
  assert.match(auraCard?.getAttribute('aria-label') ?? '', /public agent profile/i);
  assert.ok(root.querySelector('.aura-asset-frame'));
  assert.ok(root.querySelector('.aura-item-meta'));
  assert.ok(profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Visual provenance')?.contains(drawer));
  assert.ok(profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')?.contains(root.querySelector('.marketplace-listing')));
  assert.equal(auraCard.querySelector('h2')?.textContent, 'Quigbot');
  assert.doesNotMatch(auraCard.textContent, /Helixa Agent Aura/);
  const shareAction = auraCard.querySelector('button.aura-share-action[data-action="share-profile"]');
  assert.equal(shareAction?.getAttribute('data-share-url'), QUIGBOT_GENERATED_SHARE_PATH);
  assert.equal(shareAction?.getAttribute('aria-label'), 'Share Quigbot Multipass profile');
  assert.match(drawer?.textContent ?? '', /Agent Aura Provenance/);
  assert.match(drawer?.textContent ?? '', /8453:81/);
  assert.match(drawer?.textContent ?? '', /AgentDNA token ID/);
  assert.match(drawer?.textContent ?? '', /Base \(8453\)/);
  assert.match(drawer?.textContent ?? '', /0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/);
  assert.match(drawer?.textContent ?? '', /0x17d7\.\.\.bDe4/);
  assert.match(drawer?.textContent ?? '', /https:\/\/api\.helixa\.xyz\/api\/v2\/metadata\/81/);
  assert.match(drawer?.textContent ?? '', /https:\/\/api\.helixa\.xyz\/api\/v2\/aura\/81\.png/);
  assert.match(drawer?.textContent ?? '', /https:\/\/api\.helixa\.xyz\/api\/v2\/agent\/81/);
  assert.equal([...drawer.querySelectorAll('a')].some((link) => link.href === 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81'), true);
  assert.match(drawer?.textContent ?? '', /does not grant authority/i);
  assert.equal(root.querySelector('.aura-card img')?.getAttribute('src'), 'https://api.helixa.xyz/api/v2/aura/81.png');
  assert.doesNotMatch(root.textContent, /Default visual identity/);
  assert.doesNotMatch(root.textContent, /Default Helixa Agent Aura/);
  assert.doesNotMatch(root.textContent, /agent NFT, collection NFT, or custom visual/);
});

test('aura share icon opens native share without navigating to crawler preview page', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const shares = [];
  Object.defineProperty(window.navigator, 'share', {
    configurable: true,
    value: async (payload) => { shares.push(payload); },
  });
  const data = {
    ...sampleData(),
    liveProfilePage: { headline: 'Quigbot Multipass', sharePath: '/multipass/?agent=81' },
    visualIdentity: {
      source: 'helixa_aura',
      label: 'Helixa Agent Aura',
      imageUrl: 'https://api.helixa.xyz/api/v2/aura/81.png',
      initials: 'Q',
      tone: 'prime',
      chips: ['Cred 75'],
    },
  };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => data }).start();
  await Promise.resolve();
  await Promise.resolve();

  const shareAction = root.querySelector('button.aura-share-action');
  shareAction.click();
  await Promise.resolve();

  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=81');
  assert.deepEqual(shares, [{ title: 'Quigbot Multipass', text: 'Quigbot Multipass', url: new URL(QUIGBOT_GENERATED_SHARE_PATH, 'https://helixa.xyz').href }]);
});

test('resolved numeric profile missing manifest omits aura share action', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=9999');
  const missingManifestProfile = {
    ...sampleData(),
    profile: {
      ...sampleData().profile,
      display_name: 'Manifest Missing',
      slug: 'helixa-agent-9999',
      multipass_id: 'mp_helixa_agent_9999',
    },
    resolver: { canonicalId: '8453:9999', tokenId: '9999' },
    liveProfilePage: { headline: 'Manifest Missing Multipass', headerMeta: 'Live profile · 8453:9999', sharePath: '/multipass/?agent=9999' },
    agentCards: [{ name: 'Manifest Missing', tokenId: 9999, helixaId: '8453:9999', framework: 'openclaw', credScore: 50, credTier: 'Test', verified: true, profileUrl: 'https://helixa.xyz/agent/9999' }],
    visualIdentity: {
      source: 'helixa_aura',
      label: 'Manifest Missing visual identity',
      imageUrl: 'https://api.helixa.xyz/api/v2/aura/9999.png',
      initials: 'MM',
      tone: 'prime',
      chips: ['8453:9999'],
    },
  };

  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      assert.equal(input, '9999');
      return missingManifestProfile;
    },
  }).start();
  await flushAsyncEvents();

  assert.ok(root.querySelector('.aura-card'));
  assert.equal(root.querySelector('.aura-share-action'), null);
});

test('Agent Aura provenance drawer is optional and skips empty rows', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const data = {
    ...sampleData(),
    visualIdentity: { source: 'helixa_aura', label: 'Helixa Agent Aura', imageUrl: 'https://api.helixa.xyz/api/v2/aura/81.png', initials: 'Q', tone: 'prime', chips: [] },
  };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => data }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(root.querySelector('.aura-card'));
  assert.equal(root.querySelector('.aura-provenance-drawer'), null);

  const rootWithSparseDrawer = setupDom('https://helixa.xyz/multipass/?agent=81');
  const sparseData = {
    ...data,
    visualIdentity: {
      ...data.visualIdentity,
      provenanceDrawer: {
        title: 'Agent Aura Provenance',
        summary: 'Public Helixa API-reported provenance for this AgentDNA visual.',
        facts: [{ label: 'Helixa ID', value: '8453:81' }, { label: 'Owner', value: '' }, { label: 'Framework', value: null }],
        links: [{ label: 'Metadata JSON', url: 'https://api.helixa.xyz/api/v2/metadata/81' }, { label: 'Explorer', url: '' }],
        safetyNote: 'Public inspection only.',
      },
    },
  };
  await createApp({ root: rootWithSparseDrawer, loadDemo: async () => sampleData(), loadLiveDemo: async () => sparseData }).start();
  await Promise.resolve();
  await Promise.resolve();

  const drawer = rootWithSparseDrawer.querySelector('.aura-provenance-drawer');
  assert.match(drawer?.textContent ?? '', /8453:81/);
  assert.doesNotMatch(drawer?.textContent ?? '', /Owner/);
  assert.doesNotMatch(drawer?.textContent ?? '', /Framework/);
  assert.equal(drawer?.querySelectorAll('a').length, 1);
});

test('Agent Aura provenance drawer renders only safe public links', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=81');
  const data = {
    ...sampleData(),
    visualIdentity: {
      source: 'helixa_aura',
      label: 'Helixa Agent Aura',
      imageUrl: 'https://api.helixa.xyz/api/v2/aura/81.png',
      initials: 'Q',
      tone: 'prime',
      chips: [],
      provenanceDrawer: {
        title: 'Agent Aura Provenance',
        summary: 'Public Helixa API-reported provenance for this AgentDNA visual.',
        facts: [{ label: 'Helixa ID', value: '8453:81' }],
        links: [
          { label: 'Good metadata', url: 'https://api.helixa.xyz/api/v2/metadata/81' },
          { label: 'Bad script', url: 'javascript:alert(1)' },
          { label: 'Bad ftp', url: 'ftp://example.com/file' },
          { label: 'Bad malformed', url: 'not a url' },
          { label: 'Bad credentials', url: 'https://user:pass@example.com/secret' },
        ],
        safetyNote: 'Public inspection only.',
      },
    },
  };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => data }).start();
  await Promise.resolve();
  await Promise.resolve();

  const links = [...root.querySelectorAll('.aura-provenance-drawer a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'Good metadata');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
  assert.doesNotMatch(root.querySelector('.aura-provenance-drawer')?.innerHTML ?? '', /javascript:|ftp:\/\/|user:pass/);
});

test('manual resolver writes a clean share URL and reset removes it', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = {
    ...sampleData(),
    profile: { ...sampleData().profile, display_name: 'Bendr 2.0' },
    liveProfilePage: {
      headline: 'Bendr 2.0 Multipass',
      sharePath: '/multipass/?agent=1',
    },
  };

  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();
  root.querySelector('.live-resolver input').value = '8453:1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=1');
  root.querySelector('[data-action="reset-static-demo"]').click();
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/');
});

test('empty agent query shows the same empty-input validation error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); throw new HelixaResolverError('empty_input', 'Enter a Helixa token ID or Helixa ID.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['']);
  assert.match(root.textContent, /Enter a Helixa token ID or Helixa ID/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('invalid agent query shows the same format validation error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=Bendr');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['Bendr']);
  assert.match(root.textContent, /Use a token ID like 1 or a Helixa ID like 8453:1/);
});



test('resolver omits example chips and keeps activation focused on manual input', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const resolver = root.querySelector('.live-resolver');
  assert.ok(resolver);
  assert.equal(resolver.querySelector('.resolver-examples'), null);
  assert.equal(resolver.querySelectorAll('[data-action="resolve-example-agent"]').length, 0);
  assert.doesNotMatch(resolver.textContent, /Examples|Try\s/);
  assert.ok(resolver.querySelector('[data-action="resolve-live-agent"]'));
});

test('ambiguous name lookup renders selectable live agent matches', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      if (input === 'bot') {
        throw new HelixaResolverError('ambiguous_lookup', 'Pick a matching Helixa agent.', {
          matches: [
            { tokenId: '81', name: 'Quigbot', helixaId: '8453:81', framework: 'openclaw', credScore: 75, verified: true },
            { tokenId: '10', name: 'MoltBot Agent', helixaId: '8453:10', framework: 'custom', credScore: 32, verified: false },
          ],
        });
      }
      return {
        ...sampleData(),
        profile: { ...sampleData().profile, display_name: 'Quigbot' },
        liveProfilePage: { headline: 'Quigbot Multipass', sharePath: '/multipass/?agent=81' },
      };
    },
  }).start();

  root.querySelector('.live-resolver input').value = 'bot';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Pick a matching Helixa agent/);
  assert.match(root.textContent, /Quigbot/);
  assert.match(root.textContent, /MoltBot Agent/);
  assert.equal(root.querySelectorAll('.lookup-match-card').length, 2);
  root.querySelector('[data-action="select-lookup-match"][data-token-id="81"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['bot', '81']);
  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.equal(root.querySelector('.homepage-hero'), null);
  assert.match(root.querySelector('.aura-card')?.textContent ?? '', /Quigbot/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=81');
});


test('loaded live activation preview explains the stable profile candidate before save', async () => {
  const root = await renderResolvedQuigbotProfile();

  const preview = root.querySelector('.activation-preview-panel');
  assert.ok(preview);
  assert.match(preview.textContent, /Activation preview/);
  assert.match(preview.textContent, /Quigbot/);
  assert.match(preview.textContent, /8453:81/);
  assert.match(preview.textContent, /Token 81/);
  assert.match(preview.textContent, /\/multipass\/\?agent=81/);
  assert.match(preview.textContent, /stable public agent profile/i);
  assert.match(preview.textContent, /does not transfer custody/i);
  assert.match(preview.textContent, /does not release credentials/i);
  assert.match(preview.textContent, /does not change approvals/i);
  assert.equal(root.querySelector('.save-panel button[data-action="save-multipass"]')?.textContent, 'Activate Multipass');
});

test('live activation preview activates with resolved token id and updates share panel', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=Quigbot');
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    resolver: { canonicalId: '8453:1', tokenId: '1' },
    liveProfilePage: { headline: 'Bendr Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
  };
  const saves = [];

  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => liveData,
    saveMultipass: async ({ agent }) => {
      saves.push(agent);
      return { created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } };
    },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  const button = [...root.querySelectorAll('button')].find((node) => node.textContent === 'Activate Multipass');
  assert.ok(button);
  button.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(saves, ['1']);
  assert.match(root.textContent, /Activated Multipass/);
  assert.doesNotMatch(root.textContent, /Save Multipass/);
  assert.match(root.textContent, /\/multipass\/bendr-2-1/);
  assert.equal(new URL(window.location.href).pathname, '/multipass/bendr-2-1');
});

test('direct saved slug route loads saved Multipass from API instead of static preview', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const fetches = [];
  await createApp({
    root,
    fetchImpl: async (url) => {
      fetches.push(url);
      return savedProfileFetch(url);
    },
  }).start();

  assert.match(root.textContent, /Saved Bendr/);
  assert.match(root.textContent, /Activated Multipass/);
  assert.doesNotMatch(root.textContent, /Save Multipass/);
  assert.doesNotMatch(root.textContent, /Bendr 2.0 Public Profile/);
  assert.ok(fetches.some((url) => String(url).includes('/api/multipass/bendr-2-1')));
});

test('save error does not update stable URL or claim success', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => ({
      ...sampleData(),
      sourceLabel: 'live Helixa API',
      resolver: { canonicalId: '8453:1', tokenId: '1' },
      liveProfilePage: { headline: 'Bendr Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
    }),
    saveMultipass: async () => { throw new Error('Save API unavailable.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();
  [...root.querySelectorAll('button')].find((node) => node.textContent === 'Activate Multipass').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Save API unavailable/);
  assert.doesNotMatch(root.textContent, /Stable public agent profile is ready to share/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=1');
});

test('static preview does not show persistent activation action panel', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();
  assert.equal(root.querySelector('.save-panel'), null);
});

test('safe Multipass share path helper accepts only preview and stable profile paths', () => {
  assert.equal(isSafeMultipassSharePath('/multipass/'), true);
  assert.equal(isSafeMultipassSharePath('/multipass/?agent=1'), true);
  assert.equal(isSafeMultipassSharePath('/multipass/bendr-2-1'), true);
  assert.equal(isSafeMultipassSharePath('https://evil.test/multipass/bendr-2-1'), false);
  assert.equal(isSafeMultipassSharePath('/multipass/a%2Fb'), false);
  assert.equal(isSafeMultipassSharePath('/multipass/../admin'), false);
  assert.equal(isSafeMultipassSharePath('/multipass/?agent=Quigbot'), false);
});

test('API failure renders setup message', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => { throw new Error('GET /multipass-api failed with 502'); } }).start();

  assert.match(root.textContent, /Could not load Multipass API data/);
  assert.match(root.textContent, /pnpm api:bendr/);
  assert.match(root.textContent, /GET \/multipass-api failed with 502/);
});

test('non-public fragment ids and unexpected private fields are absent from rendered HTML', async () => {
  const root = setupDom();
  const data = sampleData();
  data.fragments.hidden_fragments = [{ fragment_id: 'frag_bendr_hidden_placeholder', visibility: 'hidden' }];
  data.fragments.gated_fragments = [{ fragment_id: 'frag_bendr_gated_placeholder', visibility: 'gated' }];
  data.fragments.fragments.push(
    { fragment_id: 'frag_bendr_hidden_nested', visibility: 'hidden' },
    { fragment_id: 'frag_bendr_gated_nested', visibility: 'gated' },
  );

  await createApp({ root, loadDemo: async () => data }).start();

  assert.equal(root.innerHTML.includes('frag_bendr_private_placeholder'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_unexpected_private_field'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_hidden_placeholder'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_gated_placeholder'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_hidden_nested'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_gated_nested'), false);
});

test('direct saved slug route renders source-owner claim management panel', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({
    root,
    fetchImpl: savedProfileFetch,
  }).start();

  const panel = root.querySelector('.claim-management-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Claim management/);
  assert.match(panel.textContent, /public profile edits only/i);
  assert.match(panel.textContent, /does not transfer custody, tools, credentials, or ownership/i);
  assert.equal(panel.querySelector('[data-action="claim-with-wallet"]')?.textContent, 'Connect wallet to claim');
  assert.doesNotMatch(panel.textContent, /move secrets|grant permissions|transfer ownership/i);
});

test('direct saved slug route renders Owner Command Center product metrics', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedProfileFetch }).start();

  const panel = root.querySelector('.owner-command-center');
  assert.ok(panel);
  const metrics = panel.querySelector('.owner-command-metrics');
  assert.ok(metrics);
  assert.match(metrics.textContent, /Public tools/);
  assert.match(metrics.textContent, /x402 cards/);
  assert.match(metrics.textContent, /Public routes/);
  assert.match(metrics.textContent, /Recent receipts/);
  assert.match(panel.textContent, /Discovery and display controls only/);
  assert.match(panel.textContent, /does not call tools/);
  assert.match(panel.textContent, /does not transfer custody/);
  assert.doesNotMatch(panel.textContent, /execute tool|access granted|credentials released|buy trust|trust purchased|custody transferred|transfer ownership|grant permissions/i);
});

test('direct saved slug route renders Tools and services public cards', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedProfileFetch }).start();

  const profile = root.querySelector('.multipass-profile-page');
  const drawer = profileDrawerByTitle(profile, 'Tools and services');
  assert.ok(drawer);
  const panel = drawer.querySelector('.public-tools-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Bendr x402 profile lookup/);
  assert.match(panel.textContent, /api\.bankr\.example\/tools\/bendr\/lookup/);
  assert.match(panel.textContent, /0\.02 USDC on chain 8453/);
  assert.match(panel.textContent, /Multipass slug or Helixa ID/);
  assert.match(panel.textContent, /Public profile JSON/);
  assert.match(panel.textContent, /Discovery metadata only/);
  assert.match(panel.textContent, /do not call tools/);
  assert.equal(panel.querySelector('button, form, input, textarea, select, [data-action]'), null);
  assert.doesNotMatch(panel.textContent, /execute tool|access granted|credentials released|buy trust|trust purchased/i);
});

test('saved profile without public tool cards renders empty state and command center placeholder', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedProfileNoToolsFetch }).start();

  const profile = root.querySelector('.multipass-profile-page');
  const drawer = profileDrawerByTitle(profile, 'Tools and services');
  assert.ok(drawer);
  assert.match(drawer.textContent, /No public tool cards are published for this profile yet\./);
  assert.equal(drawer.querySelector('.public-tool-card'), null);

  const commandTools = root.querySelector('.owner-command-center [data-command-section="tools"]');
  assert.ok(commandTools);
  assert.match(commandTools.textContent, /Tool registry cards are next/);
  assert.equal(commandTools.querySelector('.public-tool-card'), null);
});

test('Owner Command Center tools section renders public tool cards when published', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedProfileFetch }).start();

  const commandTools = root.querySelector('.owner-command-center [data-command-section="tools"]');
  assert.ok(commandTools);
  assert.ok(commandTools.querySelector('.public-tools-panel'));
  assert.match(commandTools.textContent, /Bendr x402 profile lookup/);
  assert.match(commandTools.textContent, /0\.02 USDC on chain 8453/);
  assert.match(commandTools.textContent, /Discovery metadata only/);
  assert.doesNotMatch(commandTools.textContent, /execute tool|access granted|credentials released|buy trust|trust purchased/i);
});

test('saved profile owner dashboard shows visibility and recent changes', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  await createApp({ root, fetchImpl: savedProfileFetch }).start();

  const dashboard = root.querySelector('.owner-dashboard-panel');
  assert.ok(dashboard);
  assert.match(dashboard.textContent, /Owner dashboard/);
  assert.match(dashboard.textContent, /Visibility/);
  assert.match(dashboard.textContent, /public/);
  assert.match(dashboard.textContent, /Recent changes/);
  assert.match(dashboard.textContent, /Multipass saved from live public source record/);
});

test('claimed saved profile renders one owner command center', async () => {
  const root = await renderClaimedSavedProfileRoot();

  const commandCenter = root.querySelector('.owner-command-center');
  assert.ok(commandCenter);
  assert.equal(root.querySelectorAll('.owner-command-center').length, 1);
  assert.match(commandCenter.textContent, /Owner Command Center/);
  assert.match(commandCenter.textContent, /What you control/);
  assert.match(commandCenter.textContent, /Next best action/);

  const commandSectionOrder = [...commandCenter.querySelectorAll('[data-command-section]')]
    .map((section) => section.getAttribute('data-command-section'));
  assert.deepEqual(commandSectionOrder.slice(0, 6), ['overview', 'profile', 'routes', 'marketplace-connections', 'tools', 'fragments']);
});

test('owner command center safety copy limits public metadata and tool authority claims', async () => {
  const root = await renderClaimedSavedProfileRoot();

  const commandCenter = root.querySelector('.owner-command-center');
  assert.ok(commandCenter);
  const safetyCopy = commandCenter.textContent;
  assert.match(safetyCopy, /public metadata/i);
  assert.match(safetyCopy, /does not transfer custody/i);
  assert.match(safetyCopy, /does not call tools/i);
  assert.match(safetyCopy, /grant access/i);
  assert.match(safetyCopy, /release credentials/i);
  assert.match(safetyCopy, /prove trust by payment alone/i);
  assert.doesNotMatch(safetyCopy, /tool execution is enabled|access granted|credentials released|trust purchased/i);
});

test('claimed manager publishes Marketplace Connection with structured fragment payload', async () => {
  const { root, calls } = await renderClaimedMarketplaceManager();
  const form = root.querySelector('[data-action="create-marketplace-connection"]');
  form.querySelector('input[name="marketplace"]').value = 'Bankr';
  form.querySelector('input[name="profile_url"]').value = 'https://bankr.bot/agents/helixa';
  form.querySelector('input[name="title"]').value = 'Helixa agent profile';
  form.querySelector('textarea[name="summary"]').value = 'Public marketplace listing for Helixa services.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  const payload = calls.find(([kind]) => kind === 'create')[1].fragment;
  assert.equal(payload.fragment_type, 'attestation');
  assert.equal(payload.status, undefined);
  assert.equal(payload.transfer_policy, 'historical_on_transfer');
  assert.equal(payload.marketplace_ref.marketplace, 'Bankr');
  assert.match(root.querySelector('.marketplace-connection-manager-panel').textContent, /Marketplace connection saved|published/i);
});

test('claimed manager updates and retires existing Marketplace Connection', async () => {
  const fragment = { fragment_id: 'frag_marketplace_bankr', fragment_type: 'attestation', status: 'pending', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa', summary: 'Summary.', status: 'manager_supplied' } };
  const { root, calls } = await renderClaimedMarketplaceManager({ initialFragments: [fragment] });
  const form = root.querySelector('[data-action="update-marketplace-connection"][data-fragment-id="frag_marketplace_bankr"]');
  form.querySelector('input[name="title"]').value = 'Updated title';
  form.querySelector('select[name="status"]').value = 'stale';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  const update = calls.find(([kind]) => kind === 'update')[1];
  assert.equal(update.patch.fragment_type, undefined);
  assert.equal(update.patch.status, undefined);
  assert.equal(update.patch.marketplace_ref.title, 'Updated title');
  root.querySelector('[data-action="retire-marketplace-connection"][data-fragment-id="frag_marketplace_bankr"]').click();
  await flushAsyncEvents();
  assert.equal(calls.find(([kind]) => kind === 'revoke')[1].fragmentId, 'frag_marketplace_bankr');
});

test('Marketplace Connection write errors stay localized to the marketplace panel', async () => {
  const { root } = await renderClaimedMarketplaceManager({ claimApiOverrides: { createMultipassFragment: async () => { throw new Error('Marketplace API failed.'); } } });
  const form = root.querySelector('[data-action="create-marketplace-connection"]');
  form.querySelector('input[name="marketplace"]').value = 'Bankr';
  form.querySelector('input[name="profile_url"]').value = 'https://bankr.bot/agents/helixa';
  form.querySelector('input[name="title"]').value = 'Helixa agent profile';
  form.querySelector('textarea[name="summary"]').value = 'Public marketplace listing for Helixa services.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.marketplace-connection-manager-panel').textContent, /Marketplace API failed/);
  assert.equal(root.querySelector('.route-manager-panel .resolver-message.error'), null);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});

test('claimed saved profile can import Bankr x402 tool metadata', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: 'Saved Bendr' } }),
    importMultipassTool: async ({ id, csrfToken, tool }) => {
      calls.push(['import-tool', id, csrfToken, tool]);
      return {
        fragment: { fragment_id: 'frag_tool_bankr_cred_report' },
        tools: {
          schema_version: '0.1.0',
          multipass_id: 'mp_helixa_agent_1',
          tools: [{
            fragment_id: 'frag_tool_bankr_cred_report',
            multipass_id: 'mp_helixa_agent_1',
            tool_id: 'cred-report',
            registry: 'bankr_x402_cloud',
            name: 'cred-report',
            description: 'Helixa AgentDNA cred report.',
            endpoint_url: 'https://api.bankr.bot/x402/helixa/cred-report',
            manifest_url: null,
            pricing: { model: 'fixed', amount: '1.00', asset: 'USDC', chain_id: 8453 },
            schemas: { input_summary: 'id: number - AgentDNA token ID', output_summary: 'score: number' },
            verifiability: { tier: 'provider_verified', summary: 'Imported from Bankr x402 service metadata.' },
            status: 'pending',
            assurance_level: 'issuer_attested',
            visibility: 'public',
            last_checked_at: '2026-07-01T00:00:00.000Z',
          }],
        },
      };
    },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileNoToolsFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const form = root.querySelector('[data-action="import-bankr-tool"]');
  assert.ok(form);
  form.querySelector('input[name="serviceName"]').value = 'cred-report';
  form.querySelector('input[name="endpointUrl"]').value = 'https://api.bankr.bot/x402/helixa/cred-report';
  form.querySelector('input[name="price"]').value = '1.00';
  form.querySelector('input[name="asset"]').value = 'USDC';
  form.querySelector('select[name="method"]').value = 'GET';
  form.querySelector('input[name="inputSummary"]').value = 'id: number - AgentDNA token ID';
  form.querySelector('input[name="outputSummary"]').value = 'score: number';
  form.querySelector('textarea[name="description"]').value = 'Helixa AgentDNA cred report.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  assert.deepEqual(calls[0], ['import-tool', 'bendr-2-1', 'csrf-1', {
    source: 'bankr_x402_cloud',
    serviceName: 'cred-report',
    endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report',
    network: 'base',
    currency: 'USDC',
    service: {
      price: '1.00',
      description: 'Helixa AgentDNA cred report.',
      methods: ['GET'],
      schema: { input: 'id: number - AgentDNA token ID', output: 'score: number' },
    },
  }]);
  const toolPanel = root.querySelector('.tool-manager-panel');
  assert.match(toolPanel.textContent, /Tool service imported/);
  assert.match(toolPanel.textContent, /Helixa AgentDNA cred report/);
  assert.ok(toolPanel.querySelector('.public-tool-card'));
});

test('claimed saved profile can refresh public tool status', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const checkedAt = '2026-07-03T03:30:00.000Z';
  const refreshedTools = samplePublicTools();
  refreshedTools.tools = refreshedTools.tools.map((tool) => ({ ...tool, status: 'stale', last_checked_at: checkedAt }));
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: 'Saved Bendr' } }),
    refreshMultipassTool: async ({ id, fragmentId, csrfToken }) => {
      calls.push(['refresh-tool', id, fragmentId, csrfToken]);
      return {
        refresh: { fragment_id: fragmentId, status: 'stale', summary: 'Endpoint check failed.', checked_at: checkedAt },
        tools: refreshedTools,
      };
    },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const button = root.querySelector('.tool-manager-panel [data-action="refresh-tool"]');
  assert.ok(button);
  button.click();
  await flushAsyncEvents();

  assert.deepEqual(calls, [['refresh-tool', 'bendr-2-1', 'frag_tool_bendr_lookup', 'csrf-1']]);
  const toolPanel = root.querySelector('.tool-manager-panel');
  assert.match(toolPanel.textContent, /Tool status refreshed/);
  assert.match(toolPanel.textContent, /Endpoint check failed/);
  assert.match(toolPanel.textContent, /stale/);
});

test('failed tool import keeps route and profile data visible', async () => {
  const route = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const fetchWithRoute = async (url) => {
    const value = String(url);
    if (value.endsWith('/hydrated')) {
      return new Response('missing', { status: 404 });
    }
    if (value.endsWith('/fragments')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [route] }), { status: 200 });
    return savedProfileNoToolsFetch(url);
  };
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: 'Saved Bendr' } }),
    importMultipassTool: async () => { throw new Error('tool_id already exists for an active tool: cred-report'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: fetchWithRoute }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const form = root.querySelector('[data-action="import-bankr-tool"]');
  form.querySelector('input[name="serviceName"]').value = 'cred-report';
  form.querySelector('input[name="endpointUrl"]').value = 'https://api.bankr.bot/x402/helixa/cred-report';
  form.querySelector('input[name="price"]').value = '1.00';
  form.querySelector('input[name="asset"]').value = 'USDC';
  form.querySelector('textarea[name="description"]').value = 'Helixa AgentDNA cred report.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  assert.match(root.querySelector('.tool-manager-panel').textContent, /tool_id already exists/);
  assert.match(root.querySelector('.route-manager-panel').textContent, /Primary profile route/);
  assert.match(root.querySelector('.multipass-profile-page').textContent, /Saved Bendr/);
});

test('claim button renders connected wallet shortened address', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({
    snapshot: {
      connected: true,
      address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      label: '0x27E3...91Ea',
      connectLabel: 'Sign owner claim',
    },
  });

  await createApp({ root, walletClient, fetchImpl: savedProfileFetch }).start();

  assert.equal(root.querySelector('[data-action="claim-with-wallet"]')?.textContent, 'Sign owner claim with 0x27E3...91Ea');
});

test('saved profile claim connects wallet before creating nonce', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  let walletClient;
  walletClient = createWalletClientFixture({
    connect: async () => {
      calls.push(['connect']);
      walletClient.setSnapshot({
        connected: true,
        address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        label: '0x27E3...91Ea',
        connectLabel: 'Sign owner claim',
      });
    },
    signMessage: async (message) => {
      calls.push(['sign', message]);
      return { wallet: walletClient.getSnapshot().address, signature: '0xsig' };
    },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => {
      calls.push(['verify']);
      return { claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  assert.deepEqual(calls.slice(0, 3), [['connect'], ['nonce'], ['sign', 'Sign Bendr claim']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /claimed_verified_owner/);
});

test('wallet modal cancellation does not create a claim nonce', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    connect: async () => {
      calls.push(['connect']);
      throw { code: 4001 };
    },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => { calls.push(['verify']); return {}; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  assert.deepEqual(calls, [['connect']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Wallet signature cancelled. Nothing was changed./);
});

test('claim button is disabled when wallet login is not configured', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({ snapshot: { configured: false } });

  await createApp({ root, walletClient, fetchImpl: savedProfileFetch }).start();

  const button = root.querySelector('[data-action="claim-with-wallet"]');
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Wallet login not configured');
  assert.match(root.querySelector('.claim-management-panel').textContent, /Wallet login is not configured for this build./);
});

test('claim flow stops when connect returns no EVM wallet', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    connect: async () => {
      calls.push(['connect']);
    },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => { calls.push(['verify']); return {}; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  assert.deepEqual(calls, [['connect']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Connect an Ethereum wallet to sign the owner claim./);
});

test('claim flow handles missing personal_sign support before verify', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    snapshot: {
      connected: true,
      address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      label: '0x27E3...91Ea',
      connectLabel: 'Sign owner claim',
    },
    signMessage: async () => {
      calls.push(['sign']);
      throw new Error('Connected wallet cannot sign messages.');
    },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => { calls.push(['verify']); return {}; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  assert.deepEqual(calls, [['nonce'], ['sign']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Connected wallet cannot sign messages./);
});

test('API unauthorized claim shows wrong-wallet manual-review guidance', async () => {
  const panelText = await renderClaimFailureText(createSavedMultipassError());

  assert.match(panelText, /That wallet cannot manage this Multipass. Connect the source owner wallet or request manual review./);
});

test('unrelated claim API errors keep their original messages instead of wrong-wallet guidance', async () => {
  const cases = [
    {
      name: 'invalid_request SavedMultipassError',
      error: createSavedMultipassError({ status: 400, code: 'invalid_request', message: 'Invalid claim request payload.' }),
      expected: /Invalid claim request payload\./,
    },
    {
      name: 'bad-signature forbidden SavedMultipassError',
      error: createSavedMultipassError({ status: 403, code: 'forbidden', message: 'Signature verification failed.' }),
      expected: /Signature verification failed\./,
    },
    {
      name: 'expired nonce forbidden SavedMultipassError',
      error: createSavedMultipassError({ status: 403, code: 'forbidden', message: 'Claim nonce expired.' }),
      expected: /Claim nonce expired\./,
    },
    {
      name: 'generic network Error',
      error: new Error('Network unavailable.'),
      expected: /Network unavailable\./,
    },
    {
      name: 'API rejection wording Error',
      error: new Error('Signature policy rejected the request.'),
      expected: /Signature policy rejected the request\./,
    },
  ];

  for (const { name, error, expected } of cases) {
    const panelText = await renderClaimFailureText(error);
    assert.match(panelText, expected, name);
    assert.doesNotMatch(panelText, /That wallet cannot manage this Multipass/i, name);
    assert.doesNotMatch(panelText, /Connect the source owner wallet/i, name);
  }
});

test('saved profile owner wallet claim enables safe public profile edits', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const claimApi = {
    createClaimNonce: async ({ id, apiBase }) => { calls.push(['nonce', id, apiBase]); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async ({ id, wallet, nonce, signature }) => {
      calls.push(['verify', id, wallet, nonce, signature]);
      return { claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: 'Saved Bendr', owner_summary: { verification_status: 'verified', summary: 'Owner-wallet verified for public profile edits.' } } };
    },
    updateMultipassProfile: async ({ id, csrfToken, patch }) => {
      calls.push(['update', id, csrfToken, patch]);
      return {
        changedFields: Object.keys(patch),
        profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: patch.display_name, summary: patch.summary, discovery_profile: { ...sampleData().profile.discovery_profile, avatar_url: patch.avatar_url }, owner_summary: { ...sampleData().profile.owner_summary, visibility: patch.visibility } },
        changes: { multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Public profile updated: display name, summary, profile image, visibility.' }] },
      };
    },
  };
  const walletSigner = async (message) => {
    calls.push(['sign', message]);
    return { wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' };
  };

  await createApp({
    root,
    claimApi,
    walletSigner,
    fetchImpl: savedProfileFetch,
  }).start();

  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.querySelector('.claim-management-panel').textContent, /claimed_verified_owner/);
  const form = root.querySelector('[data-action="update-public-profile"]');
  assert.ok(form);
  form.querySelector('input[name="display_name"]').value = 'Bendr Managed';
  assert.match(form.textContent, /Edit public profile/);
  assert.match(form.textContent, /Safe public fields for the saved Multipass profile/);
  assert.match(form.textContent, /Profile image URL/);
  assert.match(form.textContent, /Updates the public Multipass visual only/);
  assert.doesNotMatch(form.textContent, /Avatar URL/);
  form.querySelector('textarea[name="summary"]').value = 'Managed public profile copy.';
  form.querySelector('input[name="avatar_url"]').value = 'https://assets.example.test/bendr-v2.png';
  form.querySelector('select[name="visibility"]').value = 'hidden';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Bendr Managed/);
  assert.match(root.querySelector('.owner-dashboard-panel').textContent, /hidden/);
  assert.match(root.querySelector('.owner-dashboard-panel').textContent, /Public profile updated: display name, summary, profile image, visibility/);
  assert.deepEqual(calls[0], ['nonce', 'bendr-2-1', '/multipass-api']);
  assert.deepEqual(calls[1], ['sign', 'Sign Bendr claim']);
  assert.deepEqual(calls[2], ['verify', 'bendr-2-1', '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', 'nonce-1', '0xsig']);
  assert.deepEqual(calls[3], ['update', 'bendr-2-1', 'csrf-1', { display_name: 'Bendr Managed', summary: 'Managed public profile copy.', avatar_url: 'https://assets.example.test/bendr-v2.png', visibility: 'hidden' }]);
});

test('claimed saved profile can create update revoke and show fragment errors', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const fragment = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_wallet_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'wallet',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_wallet_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary public wallet',
    proof_reference: 'owner note',
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    createMultipassFragment: async ({ id, csrfToken, fragment: input }) => {
      calls.push(['create-fragment', id, csrfToken, input]);
      if (calls.filter(([type]) => type === 'create-fragment').length === 1) throw new Error('Unsafe URL rejected.');
      return { fragment, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [fragment] }, profile: { ...sampleData().profile, slug: 'bendr-2-1', public_fragments: [{ fragment_id: fragment.fragment_id, fragment_type: 'wallet', status: 'pending', assurance_level: 'self_attested', visibility: 'public', updated_at: fragment.updated_at }] } };
    },
    updateMultipassFragment: async ({ id, fragmentId, csrfToken, patch }) => {
      calls.push(['update-fragment', id, fragmentId, csrfToken, patch]);
      const updated = { ...fragment, public_value: patch.public_value, status: patch.status, transfer_policy: patch.transfer_policy, proof_reference: patch.proof_reference, updated_at: '2026-06-27T00:15:00.000Z' };
      return { fragment: updated, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [updated] }, profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
    revokeMultipassFragment: async ({ id, fragmentId, csrfToken }) => {
      calls.push(['revoke-fragment', id, fragmentId, csrfToken]);
      const revoked = { ...fragment, status: 'revoked', revoked_at: '2026-06-27T00:20:00.000Z' };
      return { fragment: revoked, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [revoked] }, profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  assert.ok(root.querySelector('.fragment-manager-panel'));
  let createForm = root.querySelector('[data-action="create-public-fragment"]');
  createForm.querySelector('select[name="fragment_type"]').value = 'wallet';
  createForm.querySelector('input[name="public_value"]').value = 'Primary public wallet';
  createForm.querySelector('input[name="reference_url"]').value = 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  createForm.querySelector('input[name="proof_reference"]').value = 'owner note';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.fragment-manager-panel').textContent, /Unsafe URL rejected/);

  createForm = root.querySelector('[data-action="create-public-fragment"]');
  createForm.querySelector('select[name="fragment_type"]').value = 'wallet';
  createForm.querySelector('input[name="public_value"]').value = 'Primary public wallet';
  createForm.querySelector('input[name="reference_url"]').value = 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  createForm.querySelector('input[name="proof_reference"]').value = 'owner note';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.fragment-manager-panel').textContent, /Primary public wallet/);

  const editForm = root.querySelector('[data-action="update-public-fragment"]');
  editForm.querySelector('input[name="public_value"]').value = 'Updated public wallet';
  editForm.querySelector('input[name="reference_url"]').value = 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  editForm.querySelector('input[name="proof_reference"]').value = 'updated owner note';
  editForm.querySelector('select[name="status"]').value = 'stale';
  editForm.querySelector('select[name="transfer_policy"]').value = 'pause_on_transfer';
  editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  root.querySelector('[data-action="revoke-public-fragment"]').click();
  await flushAsyncEvents();

  const expectedInput = {
    fragment_type: 'wallet',
    public_value: 'Primary public wallet',
    reference_url: 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    proof_reference: 'owner note',
  };
  assert.deepEqual(calls[0], ['create-fragment', 'bendr-2-1', 'csrf-1', expectedInput]);
  assert.deepEqual(calls[1], ['create-fragment', 'bendr-2-1', 'csrf-1', expectedInput]);
  assert.deepEqual(calls[2], ['update-fragment', 'bendr-2-1', 'frag_manager_wallet_1', 'csrf-1', { public_value: 'Updated public wallet', reference_url: 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', proof_reference: 'updated owner note', status: 'stale', transfer_policy: 'pause_on_transfer' }]);
  assert.deepEqual(calls[3], ['revoke-fragment', 'bendr-2-1', 'frag_manager_wallet_1', 'csrf-1']);
});

test('profile trust context renders safe public route cards from endpoint fragments', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = sampleData();
  data.fragments.fragments = [
    ...data.fragments.fragments,
    {
      fragment_id: 'frag_public_route_safe',
      fragment_type: 'endpoint',
      status: 'pending',
      assurance_level: 'self_attested',
      visibility: 'public',
      transfer_policy: 'pause_on_transfer',
      source: { source_type: 'owner_submission', issuer: null, reference_url: 'https://wrong.example.test/not-used' },
      public_value: 'Primary profile route',
      endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
      updated_at: '2026-06-27T00:10:00.000Z',
    },
    {
      fragment_id: 'frag_public_route_unsafe',
      fragment_type: 'endpoint',
      status: 'stale',
      assurance_level: 'self_attested',
      visibility: 'public',
      transfer_policy: 'pause_on_transfer',
      source: { source_type: 'owner_submission', issuer: null },
      public_value: 'Unsafe route text',
      endpoint_ref: { endpoint_id: 'unsafe-route', url: 'javascript:alert(1)', protocol: 'web' },
      updated_at: '2026-06-27T00:09:00.000Z',
    },
  ];

  await createApp({ root, loadDemo: async () => data }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.public-routes-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Published reference routes/);
  assert.match(panel.textContent, /Primary profile route/);
  assert.match(panel.textContent, /Primary route/);
  assert.equal(panel.querySelector('a[href="https://helixa.xyz/multipass/bendr-2-1"]')?.textContent, 'https://helixa.xyz/multipass/bendr-2-1');
  assert.equal(panel.querySelector('a[href^="javascript:"]'), null);
  assert.equal(panel.innerHTML.includes('https://wrong.example.test/not-used'), false);
});

test('claimed saved profile can create update and retire public route cards', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const fragment = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    createMultipassFragment: async ({ id, csrfToken, fragment: input }) => {
      calls.push(['create-route', id, csrfToken, input]);
      return { fragment, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [fragment] }, profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
    updateMultipassFragment: async ({ id, fragmentId, csrfToken, patch }) => {
      calls.push(['update-route', id, fragmentId, csrfToken, patch]);
      const updated = { ...fragment, ...patch, endpoint_ref: patch.endpoint_ref, updated_at: '2026-06-27T00:15:00.000Z' };
      return { fragment: updated, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [updated] }, profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
    revokeMultipassFragment: async ({ id, fragmentId, csrfToken }) => {
      calls.push(['retire-route', id, fragmentId, csrfToken]);
      const revoked = { ...fragment, status: 'revoked', revoked_at: '2026-06-27T00:20:00.000Z' };
      return { fragment: revoked, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [revoked] }, profile: { ...sampleData().profile, slug: 'bendr-2-1' } };
    },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const createForm = root.querySelector('[data-action="create-public-route"]');
  assert.ok(createForm);
  createForm.querySelector('input[name="route_label"]').value = 'Primary profile route';
  createForm.querySelector('input[name="route_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1';
  createForm.querySelector('input[name="proof_reference"]').value = 'owner note';
  createForm.querySelector('select[name="route_type"]').value = 'web';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  const editForm = root.querySelector('[data-action="update-public-route"]');
  assert.ok(editForm);
  editForm.querySelector('input[name="route_label"]').value = 'Updated public profile route';
  editForm.querySelector('input[name="route_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1?route=main';
  editForm.querySelector('input[name="proof_reference"]').value = 'updated owner note';
  editForm.querySelector('select[name="status"]').value = 'stale';
  editForm.querySelector('select[name="route_type"]').value = 'api';
  editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  root.querySelector('[data-action="revoke-public-route"]').click();
  await flushAsyncEvents();

  assert.deepEqual(calls[0], ['create-route', 'bendr-2-1', 'csrf-1', {
    fragment_type: 'endpoint',
    public_value: 'Primary profile route',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1',
    proof_reference: 'owner note',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
  }]);
  assert.deepEqual(calls[1], ['update-route', 'bendr-2-1', 'frag_manager_route_1', 'csrf-1', {
    public_value: 'Updated public profile route',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1?route=main',
    proof_reference: 'updated owner note',
    status: 'stale',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1?route=main', protocol: 'api' },
  }]);
  assert.deepEqual(calls[2], ['retire-route', 'bendr-2-1', 'frag_manager_route_1', 'csrf-1']);
});

test('claimed route manager shows validation errors without calling route create API', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    createMultipassFragment: async () => { calls.push('create'); throw new Error('should not call create'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  assert.ok(root.querySelector('.claim-management-panel'));
  const claimButton = root.querySelector('[data-action="claim-with-wallet"]');
  assert.ok(claimButton);
  claimButton.click();
  await flushAsyncEvents();

  const createForm = root.querySelector('[data-action="create-public-route"]');
  createForm.querySelector('input[name="route_label"]').value = 'Bad route';
  createForm.querySelector('input[name="route_url"]').value = 'http://example.test/not-safe';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  const routePanel = root.querySelector('.route-manager-panel');
  assert.match(routePanel.textContent, /Route URL must be an HTTPS URL/);
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});

test('failed route update keeps existing route cards visible and shows route error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const route = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const fetchWithRoute = async (url) => {
    const value = String(url);
    if (value.endsWith('/hydrated')) {
      return new Response('missing', { status: 404 });
    }
    if (value.endsWith('/api/multipass/bendr-2-1')) {
      return new Response(JSON.stringify({
        ...sampleData().profile,
        display_name: 'Saved Bendr',
        slug: 'bendr-2-1',
        multipass_id: 'mp_helixa_agent_1',
        status: 'active',
        owner_summary: { owner_state: 'unclaimed', verification_status: 'unclaimed', summary: 'Saved unclaimed profile. Management is unclaimed.' },
      }), { status: 200 });
    }
    if (value.endsWith('/fragments')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [route] }), { status: 200 });
    return savedProfileFetch(url);
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    updateMultipassFragment: async () => { throw new Error('Manager session expired.'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: fetchWithRoute }).start();
  assert.ok(root.querySelector('.claim-management-panel'));
  const claimButton = root.querySelector('[data-action="claim-with-wallet"]');
  assert.ok(claimButton);
  claimButton.click();
  await flushAsyncEvents();

  const editForm = root.querySelector('[data-action="update-public-route"]');
  editForm.querySelector('input[name="route_label"]').value = 'Primary profile route';
  editForm.querySelector('input[name="route_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1?route=main';
  editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  assert.match(root.querySelector('.route-manager-panel').textContent, /Manager session expired/);
  assert.match(root.querySelector('.public-routes-panel').textContent, /Primary profile route/);
  assert.ok(root.querySelector('[data-action="update-public-route"]'));
  assert.ok(root.querySelector('.claim-management-panel'));
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});

test('failed route retire keeps route visible with old status', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const route = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const fetchWithRoute = async (url) => {
    const value = String(url);
    if (value.endsWith('/hydrated')) {
      return new Response('missing', { status: 404 });
    }
    if (value.endsWith('/api/multipass/bendr-2-1')) {
      return new Response(JSON.stringify({
        ...sampleData().profile,
        display_name: 'Saved Bendr',
        slug: 'bendr-2-1',
        multipass_id: 'mp_helixa_agent_1',
        status: 'active',
        owner_summary: { owner_state: 'unclaimed', verification_status: 'unclaimed', summary: 'Saved unclaimed profile. Management is unclaimed.' },
      }), { status: 200 });
    }
    if (value.endsWith('/fragments')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [route] }), { status: 200 });
    return savedProfileFetch(url);
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    revokeMultipassFragment: async () => { throw new Error('Manager session cookie is required.'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: fetchWithRoute }).start();
  assert.ok(root.querySelector('.claim-management-panel'));
  const claimButton = root.querySelector('[data-action="claim-with-wallet"]');
  assert.ok(claimButton);
  claimButton.click();
  await flushAsyncEvents();

  root.querySelector('[data-action="revoke-public-route"]').click();
  await flushAsyncEvents();

  assert.match(root.querySelector('.route-manager-panel').textContent, /Manager session cookie is required/);
  assert.match(root.querySelector('.public-route-card').textContent, /Review required/);
  assert.match(root.querySelector('.public-route-card').textContent, /Primary profile route/);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});

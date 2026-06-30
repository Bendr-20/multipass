import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { HelixaResolverError } from '../src/live-helixa-resolver.js';
import { isSafeMultipassSharePath } from '../src/save-panel.js';

const NAKAMIGO_2432_IMAGE = 'https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432';

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
          fragment_id: 'frag_e2etest_identity',
          fragment_type: 'attestation',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          source: { source_type: 'owner_submission', issuer: 'Helixa' },
          public_value: 'E2ETest is a low-assurance test record.',
        },
        {
          fragment_id: 'frag_e2etest_cred',
          fragment_type: 'risk_summary',
          status: 'disputed',
          assurance_level: 'unverified',
          visibility: 'public',
          transfer_policy: 'never_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Lower trust context for a test agent.',
        },
        {
          fragment_id: 'frag_helixa_swarm_roster',
          fragment_type: 'custody_record',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Parent Multipass manages Bendr, Quigbot, and E2ETest agents as one collection roster.',
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
      { name: 'Quigbot', tokenId: 81, helixaId: '8453:81', framework: 'openclaw', credScore: 75, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/agent/81', proofFragmentIds: ['frag_quigbot_identity', 'frag_quigbot_cred'] },
      { name: 'E2ETest', tokenId: 0, helixaId: '8453:0', framework: 'openclaw', credScore: 41, credTier: 'Marginal', verified: false, profileUrl: 'https://helixa.xyz/agent/0', proofFragmentIds: ['frag_e2etest_identity', 'frag_e2etest_cred'] },
      { name: 'Helixa Swarm', tokenId: 'swarm:helixa', helixaId: '8453:swarm:helixa', framework: 'multi-agent', credScore: 78, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/swarm/helixa', subjectType: 'swarm', members: 3, role: 'Parent Multipass', custody: 'Custody epoch ready', proofFragmentIds: ['frag_helixa_swarm_roster', 'frag_helixa_swarm_tools', 'frag_helixa_swarm_cred'], roster: [{ name: 'Bendr 2.0', role: 'Lead agent' }, { name: 'Quigbot', role: 'Product agent' }, { name: 'E2ETest', role: 'Test agent' }], sharedControls: ['Tool approvals', 'Route policy', 'Owner approval'], aggregateCred: 'Cred 78 Prime summarizes the roster without replacing individual agent scores.', transferBehavior: 'Permissions pause and tool routes reverify when custody changes.', transferPreview: { currentOwner: '0x3395...480E0', custodyEpoch: 'Epoch 03', claimAction: 'Claim swarm', permissionsState: 'Permissions paused', toolAction: 'Reverify shared tools', privateAccessAction: 'Rotate private access', historyState: 'History preserved', credContinuity: 'Cred continues with ownership-change context.' }, ownerSnapshot: { owner: '0x3395...480E0', operator: 'Helixa ops', custodyEpoch: 'Epoch 03', permissionState: 'Paused until owner review', visibility: 'Public profile, gated private data', recentChange: 'Transfer detected 2026-06-24', reviewAction: 'Reverify routes before resume' }, changeReviewLedger: [
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

function setupDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', { url });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  return dom.window.document.querySelector('#app');
}

async function flushAsyncEvents(count = 8) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

async function savedProfileFetch(url) {
  if (String(url).endsWith('/api/multipass/bendr-2-1')) {
    return new Response(JSON.stringify({
      ...sampleData().profile,
      display_name: 'Saved Bendr',
      slug: 'bendr-2-1',
      multipass_id: 'mp_helixa_agent_1',
      status: 'active',
      owner_summary: {
        owner_state: 'unclaimed',
        verification_status: 'unclaimed',
        summary: 'Saved display-only profile. Management is unclaimed.',
      },
    }), { status: 200 });
  }
  if (String(url).endsWith('/fragments')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', fragments: [] }), { status: 200 });
  if (String(url).endsWith('/card') || String(url).endsWith('/agent-card')) return new Response(JSON.stringify({ ...sampleData().card, multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' }), { status: 200 });
  if (String(url).endsWith('/standards')) return new Response(JSON.stringify(sampleData().standards), { status: 200 });
  if (String(url).endsWith('/x402')) return new Response(JSON.stringify(sampleData().x402), { status: 200 });
  if (String(url).endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Multipass saved from live public source record.' }] }), { status: 200 });
  throw new Error(`Unexpected URL ${url}`);
}

async function savedQuigbotFetch(url) {
  const value = String(url);
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

test('homepage renders agent visuals without extra context copy', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelector('.product-card-grid'), null);
  assert.equal(root.querySelector('.share-panel'), null);
  assert.equal(root.querySelector('a[href="#agent-visuals"]')?.textContent, 'View agents');
  const strip = root.querySelector('.profile-visual-strip');
  assert.ok(strip);
  assert.equal(strip.querySelector('.card-carousel-head'), null);
  assert.equal(strip.querySelector('.card-detail'), null);
  assert.equal(strip.querySelector('.visual-card-viewport'), null);
  assert.ok(strip.querySelector('.visual-card-track'));
  assert.equal(strip.querySelector('.visual-card-track')?.hasAttribute('style'), false);
  assert.equal(strip.querySelector('.card-track'), null);
  assert.equal(strip.querySelectorAll('.card-button').length, 0);
  assert.equal(strip.querySelectorAll('a.visual-card-button').length, 4);
  assert.equal(strip.querySelector('.visual-carousel-controls'), null);
  assert.equal(strip.querySelector('a.visual-card-button[href="/multipass/?agent=1"]')?.textContent.includes('Open profile'), true);
  assert.equal(strip.querySelector('a.visual-card-button[href="/multipass/?agent=81"]')?.querySelector('img[data-visual-card-image="true"]')?.getAttribute('src'), 'https://api.helixa.xyz/api/v2/aura/81.png');
  assert.ok(root.querySelector('.product-hero-copy')?.contains(strip));
  assert.ok(strip.previousElementSibling?.classList.contains('homepage-actions'));
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
    '/multipass/?agent=0',
    '/multipass/',
  ]);
  assert.equal(strip.querySelector('a.visual-card-button[href^="https://helixa.xyz/agent/"]'), null);
  assert.equal(strip.querySelector('a.visual-card-button[href^="https://helixa.xyz/swarm/"]'), null);
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

  assert.match(root.textContent, /portable agent trust profiles/i);
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
  assert.doesNotMatch(root.textContent, /\b(?:preview|demo|fixture)\b/i);
  assert.match(root.textContent, /Proof ledger/);
  assert.doesNotMatch(root.textContent, /Card first/);
  assert.match(root.textContent, /Example trust profiles/);
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
  assert.equal(root.querySelectorAll('.card-button').length, 4);
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
  assert.doesNotMatch(root.textContent, /\b(?:preview|demo|fixture)\b/i);
});

test('static homepage keeps agent visuals display-only', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const strip = root.querySelector('.profile-visual-strip');
  assert.ok(strip);
  assert.equal(strip.querySelector('input'), null);
  assert.equal(strip.querySelector('.visual-card-viewport'), null);
  assert.ok(strip.querySelector('.visual-card-track'));
  assert.equal(strip.querySelector('.card-track'), null);
  assert.equal(strip.querySelectorAll('.card-button').length, 0);
  assert.equal(strip.querySelectorAll('.visual-card-button').length, 4);
  assert.equal(strip.querySelector('.visual-carousel-controls'), null);
  assert.doesNotMatch(strip.textContent, /claim|approve|transfer|payment|wallet/i);
});

test('static initial state presents Multipass product home instead of Bendr profile', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.ok(root.querySelector('.product-home-shell'));
  const hero = root.querySelector('.product-hero');
  assert.match(hero?.textContent ?? '', /Portable identity profiles for agents/);
  assert.match(hero?.querySelector('.live-resolver')?.textContent ?? '', /Activate a live agent record/);
  assert.equal(hero?.querySelector('.homepage-proof-panel'), null);
  const proofPanel = root.querySelector('.homepage-proof-panel');
  assert.match(proofPanel?.textContent ?? '', /What it does/);
  assert.match(proofPanel?.textContent ?? '', /Multipass turns scattered agent identity into one readable trust profile/);
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
  assert.match(proofPanel?.textContent ?? '', /x402/);
  assert.match(proofPanel?.textContent ?? '', /MCP\/A2A/);
  assert.doesNotMatch(proofPanel?.textContent ?? '', /Wiretap|ClawBank/);
  assert.equal(proofPanel?.querySelectorAll('.homepage-proof-stat').length, 0);
  assert.equal(proofPanel?.querySelector('a, button, form, input, textarea, select, [data-action]'), null);
  assert.equal(proofPanel?.previousElementSibling, hero);
  assert.doesNotMatch(root.textContent, /Bendr is one profile, not the homepage/);
  assert.match(root.textContent, /View agents/);
  assert.equal(root.querySelector('.activation-summary'), null);
  assert.equal(root.querySelector('.proof-ledger'), null);
  assert.doesNotMatch(root.textContent, /Bendr 2\.0 Public Profile/);
  assert.doesNotMatch(root.textContent, /\b(?:Preview|preview|Demo|demo|fixture|Fixture)\b/);
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
  assert.equal(root.querySelector('.aura-share-action')?.getAttribute('data-share-url'), '/multipass/share/81/');
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
  assert.match(root.textContent, /Live record activated into a display-only Multipass/);
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
  const data = { ...sampleData(), heroNote: 'Read-only live Helixa API data for Bendr 2.0.', sourceLabel: 'live Helixa API' };
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  await createApp({ root, loadDemo: async () => data }).start();

  assert.match(root.textContent, /Read-only live Helixa API data for Bendr 2\.0/);
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

  assert.equal(root.querySelectorAll('.card-button').length, 4);
  assert.match(root.textContent, /Helixa Swarm/);
  assert.match(root.textContent, /Parent Multipass/);
  assert.match(root.textContent, /3 agents/);
  assert.match(root.textContent, /Custody epoch ready/);
  assert.doesNotMatch(root.querySelector('.fragment-map').textContent, /Swarm roster/);

  root.querySelectorAll('.card-button')[3].click();
  assert.match(root.querySelector('.fragment-map').textContent, /Swarm roster/);
  assert.match(root.querySelector('.fragment-map').textContent, /Shared tool policy/);
  assert.match(root.querySelector('.fragment-map').textContent, /Aggregate Cred context/);
  assert.equal(root.textContent.includes('frag_helixa_swarm_'), false);
});


test('selecting Helixa Swarm shows roster roles policy references and transfer behavior', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  root.querySelectorAll('.card-button')[3].click();

  const detail = root.querySelector('.card-detail').textContent;
  assert.match(detail, /Swarm detail/);
  assert.match(detail, /Bendr 2\.0/);
  assert.match(detail, /Lead agent/);
  assert.match(detail, /Quigbot/);
  assert.match(detail, /Product agent/);
  assert.match(detail, /E2ETest/);
  assert.match(detail, /Test agent/);
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

  root.querySelectorAll('.card-button')[3].click();
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

  root.querySelectorAll('.card-button')[3].click();
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

  root.querySelectorAll('.card-button')[3].click();

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
  assert.deepEqual(proofTitles, ['E2ETest test identity', 'Lower trust context']);
  assert.match(root.querySelector('.proof-ledger').textContent, /2 public/);

  root.querySelectorAll('.card-button')[3].click();
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

test('proof ledger renders all six document types and JSON toggles open and close', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  for (const title of ['Profile', 'Public Fragments', 'Agent Card', 'Standards', 'x402', 'Receipt']) {
    assert.match(root.textContent, new RegExp(title));
  }
  assert.match(root.textContent, /canonical summary/i);
  assert.match(root.textContent, /without claiming every adapter is live/i);
  assert.match(root.textContent, /without implying live settlement/i);
  assert.match(root.textContent, /without becoming trust by itself/i);
  assert.equal(root.querySelectorAll('.ledger-entry .why').length, 6);

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
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver', heroNote: 'Read-only live Helixa API data for Live Bendr.' };
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
  assert.match(root.textContent, /Live record activated into a display-only Multipass/);
});


test('Bendr public profile does not require marketplace listing data', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.ok(root.querySelector('.multipass-profile-page'));
  assert.equal(root.querySelector('.marketplace-listing'), null);
  assert.doesNotMatch(root.innerHTML, /Marketplace listing context/);
  assert.doesNotMatch(root.innerHTML, /Example trust profiles/);
  assert.match(profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')?.textContent ?? '', /not published for this profile yet/);
});

test('live resolver renders trust profile compatibility context without executable controls', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = {
    ...sampleData(),
    profile: { ...sampleData().profile, display_name: 'Live Bendr' },
    sourceLabel: 'live Helixa API',
    modeLabel: 'Live Resolver',
    marketplaceListing: {
      title: 'Bendr 2.0 trust profile',
      subtitle: '8453:1 · openclaw',
      summary: 'Read-only public AgentDNA trust profile prepared for directories, builders, and marketplace compatibility.',
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
  assert.match(listing.textContent, /Trust profile context/);
  assert.match(listing.textContent, /Bendr 2\.0 trust profile/);
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
      safetyNote: 'Display only.',
    },
  };
  await createApp({ root, loadDemo: async () => data }).start();

  const listing = root.querySelector('.marketplace-listing');
  assert.ok(listing);
  assert.equal(listing.querySelector('a[href^="javascript:"]'), null);
  assert.match(listing.textContent, /Unsafe/);
  assert.match(listing.textContent, /Unsafe link/);
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
      body: 'Live AgentDNA profile for Quigbot with public trust, routes, custody context, and proof inspection.',
      note: 'Shareable live profile for 8453:81.',
      recordIntro: 'Live AgentDNA trust profile assembled from public Helixa API signals.',
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
        safetyNote: 'Display only. Public provenance does not grant authority or expose private credentials.',
      },
    },
    marketplaceListing: {
      title: 'Quigbot trust profile',
      summary: 'Live AgentDNA record with public trust context.',
      identity: { helixaId: '8453:81', framework: 'openclaw', verifiedLabel: 'Verified AgentDNA', sourceLabel: 'Live Helixa API' },
      score: { tier: 'Prime', label: 'Cred 75' },
      badges: [],
      facts: [],
      routes: [],
      paymentReferences: [],
      links: [],
      safetyNote: 'Display only.',
    },
  };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => data }).start();
  await Promise.resolve();
  await Promise.resolve();

  const auraCard = root.querySelector('.aura-card');
  const drawer = root.querySelector('.aura-provenance-drawer');
  assert.equal(auraCard?.getAttribute('data-visual-source'), 'helixa_aura');
  assert.match(auraCard?.getAttribute('aria-label') ?? '', /trust profile/i);
  assert.ok(root.querySelector('.aura-asset-frame'));
  assert.ok(root.querySelector('.aura-item-meta'));
  assert.ok(profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Visual provenance')?.contains(drawer));
  assert.ok(profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')?.contains(root.querySelector('.marketplace-listing')));
  assert.equal(auraCard.querySelector('h2')?.textContent, 'Quigbot');
  assert.doesNotMatch(auraCard.textContent, /Helixa Agent Aura/);
  const shareAction = auraCard.querySelector('button.aura-share-action[data-action="share-profile"]');
  assert.equal(shareAction?.getAttribute('data-share-url'), '/multipass/share/81/');
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
  assert.deepEqual(shares, [{ title: 'Quigbot Multipass', text: 'Quigbot Multipass', url: 'https://helixa.xyz/multipass/share/81/' }]);
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
        safetyNote: 'Display only.',
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
        safetyNote: 'Display only.',
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


test('live activated page saves with resolved token id and updates share panel', async () => {
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

  const button = [...root.querySelectorAll('button')].find((node) => node.textContent === 'Save Multipass');
  assert.ok(button);
  button.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(saves, ['1']);
  assert.match(root.textContent, /Saved Multipass/);
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
  assert.match(root.textContent, /Saved Multipass/);
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
  [...root.querySelectorAll('button')].find((node) => node.textContent === 'Save Multipass').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Save API unavailable/);
  assert.doesNotMatch(root.textContent, /Saved Multipass/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=1');
});

test('static preview does not show Save Multipass action', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();
  assert.doesNotMatch(root.textContent, /Save Multipass/);
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

test('direct saved slug route renders display-only claim management panel', async () => {
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
        profile: { ...sampleData().profile, slug: 'bendr-2-1', display_name: patch.display_name, summary: patch.summary, owner_summary: { ...sampleData().profile.owner_summary, visibility: patch.visibility } },
        changes: { multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Public profile updated: display_name, summary, visibility.' }] },
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
  form.querySelector('textarea[name="summary"]').value = 'Managed public profile copy.';
  form.querySelector('select[name="visibility"]').value = 'hidden';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Bendr Managed/);
  assert.match(root.querySelector('.owner-dashboard-panel').textContent, /hidden/);
  assert.match(root.querySelector('.owner-dashboard-panel').textContent, /Public profile updated: display_name, summary, visibility/);
  assert.deepEqual(calls[0], ['nonce', 'bendr-2-1', '/multipass-api']);
  assert.deepEqual(calls[1], ['sign', 'Sign Bendr claim']);
  assert.deepEqual(calls[2], ['verify', 'bendr-2-1', '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', 'nonce-1', '0xsig']);
  assert.deepEqual(calls[3], ['update', 'bendr-2-1', 'csrf-1', { display_name: 'Bendr Managed', summary: 'Managed public profile copy.', visibility: 'hidden' }]);
});

test('claimed saved profile can create update revoke and show fragment errors', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const fragment = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_endpoint_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_endpoint_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Profile JSON endpoint',
    endpoint_ref: { endpoint_id: 'profile-json', url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1', protocol: 'api' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    createMultipassFragment: async ({ id, csrfToken, fragment: input }) => {
      calls.push(['create-fragment', id, csrfToken, input]);
      if (calls.filter(([type]) => type === 'create-fragment').length === 1) throw new Error('Unsafe URL rejected.');
      return { fragment, fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [fragment] }, profile: { ...sampleData().profile, slug: 'bendr-2-1', public_fragments: [{ fragment_id: fragment.fragment_id, fragment_type: 'endpoint', status: 'pending', assurance_level: 'self_attested', visibility: 'public', updated_at: fragment.updated_at }] } };
    },
    updateMultipassFragment: async ({ id, fragmentId, csrfToken, patch }) => {
      calls.push(['update-fragment', id, fragmentId, csrfToken, patch]);
      const updated = { ...fragment, public_value: patch.public_value, status: patch.status, transfer_policy: patch.transfer_policy, endpoint_ref: patch.endpoint_ref ?? fragment.endpoint_ref, updated_at: '2026-06-27T00:15:00.000Z' };
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
  createForm.querySelector('select[name="fragment_type"]').value = 'endpoint';
  createForm.querySelector('select[name="fragment_type"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  createForm.querySelector('input[name="public_value"]').value = 'Profile JSON endpoint';
  createForm.querySelector('input[name="reference_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1';
  createForm.querySelector('input[name="endpoint_id"]').value = 'profile-json';
  createForm.querySelector('input[name="endpoint_url"]').value = 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1';
  createForm.querySelector('select[name="endpoint_protocol"]').value = 'api';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.fragment-manager-panel').textContent, /Unsafe URL rejected/);

  createForm = root.querySelector('[data-action="create-public-fragment"]');
  createForm.querySelector('select[name="fragment_type"]').value = 'endpoint';
  createForm.querySelector('select[name="fragment_type"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  createForm.querySelector('input[name="public_value"]').value = 'Profile JSON endpoint';
  createForm.querySelector('input[name="reference_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1';
  createForm.querySelector('input[name="endpoint_id"]').value = 'profile-json';
  createForm.querySelector('input[name="endpoint_url"]').value = 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1';
  createForm.querySelector('select[name="endpoint_protocol"]').value = 'api';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.fragment-manager-panel').textContent, /Profile JSON endpoint/);

  const editForm = root.querySelector('[data-action="update-public-fragment"]');
  editForm.querySelector('input[name="public_value"]').value = 'Updated profile JSON endpoint';
  editForm.querySelector('input[name="reference_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1';
  editForm.querySelector('input[name="proof_reference"]').value = 'owner note';
  editForm.querySelector('select[name="status"]').value = 'stale';
  editForm.querySelector('select[name="transfer_policy"]').value = 'pause_on_transfer';
  editForm.querySelector('input[name="endpoint_id"]').value = 'profile-json-v2';
  editForm.querySelector('input[name="endpoint_url"]').value = 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1';
  editForm.querySelector('select[name="endpoint_protocol"]').value = 'mcp';
  editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  root.querySelector('[data-action="revoke-public-fragment"]').click();
  await flushAsyncEvents();

  const expectedEndpointInput = { fragment_type: 'endpoint', public_value: 'Profile JSON endpoint', reference_url: 'https://helixa.xyz/multipass/bendr-2-1', endpoint_ref: { endpoint_id: 'profile-json', url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1', protocol: 'api' } };
  assert.deepEqual(calls[0], ['create-fragment', 'bendr-2-1', 'csrf-1', expectedEndpointInput]);
  assert.deepEqual(calls[1], ['create-fragment', 'bendr-2-1', 'csrf-1', expectedEndpointInput]);
  assert.deepEqual(calls[2], ['update-fragment', 'bendr-2-1', 'frag_manager_endpoint_1', 'csrf-1', { public_value: 'Updated profile JSON endpoint', reference_url: 'https://helixa.xyz/multipass/bendr-2-1', proof_reference: 'owner note', status: 'stale', transfer_policy: 'pause_on_transfer', endpoint_ref: { endpoint_id: 'profile-json-v2', url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1', protocol: 'mcp' } }]);
  assert.deepEqual(calls[3], ['revoke-fragment', 'bendr-2-1', 'frag_manager_endpoint_1', 'csrf-1']);
});

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';

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
          public_value: 'Bendr profile checked by Helixa fixture.',
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
          public_value: 'Route claim intentionally marked disputed in the fixture.',
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
          fragment_id: 'frag_helixa_swarm_roster',
          fragment_type: 'custody_record',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Parent Multipass manages Bendr, Quigbot, and E2ETest demo agents as one collection roster.',
        },
        {
          fragment_id: 'frag_helixa_swarm_tools',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          source: { source_type: 'owner_submission', issuer: 'Helixa' },
          public_value: 'Shared tool policy preview for routes, permissions, and approvals across the swarm.',
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
      { name: 'Bendr 2.0', tokenId: 1, helixaId: '8453:1', framework: 'openclaw', credScore: 80, credTier: 'Preferred', verified: true, profileUrl: 'https://helixa.xyz/agent/1' },
      { name: 'Quigbot', tokenId: 81, helixaId: '8453:81', framework: 'openclaw', credScore: 75, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/agent/81' },
      { name: 'E2ETest', tokenId: 0, helixaId: '8453:0', framework: 'openclaw', credScore: 41, credTier: 'Marginal', verified: false, profileUrl: 'https://helixa.xyz/agent/0' },
      { name: 'Helixa Swarm', tokenId: 'swarm:helixa', helixaId: '8453:swarm:helixa', framework: 'multi-agent', credScore: 78, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/swarm/helixa', subjectType: 'swarm', members: 3, role: 'Parent Multipass', custody: 'Custody epoch ready', roster: [{ name: 'Bendr 2.0', role: 'Lead agent' }, { name: 'Quigbot', role: 'Product agent' }, { name: 'E2ETest', role: 'Test agent' }], sharedControls: ['Tool approvals', 'Route policy', 'Owner approval'], aggregateCred: 'Cred 78 Prime summarizes the roster without replacing individual agent scores.', transferBehavior: 'Permissions pause and tool routes reverify when custody changes.' },
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

test('initial render shows loading state then product-led Multipass record', async () => {
  const root = setupDom();
  let resolveLoad;
  const app = createApp({
    root,
    loadDemo: () => new Promise((resolve) => { resolveLoad = resolve; }),
  });

  const ready = app.start();
  assert.match(root.textContent, /Loading Bendr 2\.0/);

  resolveLoad(sampleData());
  await ready;

  assert.match(root.textContent, /identity layer/i);
  assert.match(root.textContent, /agent builders/i);
  assert.match(root.textContent, /machine-readable/i);
  assert.match(root.textContent, /Internal Prototype/);
  assert.match(root.textContent, /agent builders/i);
  assert.match(root.textContent, /What is Multipass/);
  assert.match(root.textContent, /What the card shows/);
  assert.match(root.textContent, /What proof adds/);
  assert.match(root.textContent, /agents, swarms, apps, and marketplaces/i);
  assert.match(root.textContent, /raw protocol details/i);
  assert.match(root.textContent, /MULTIPASS RECORD/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /mp_bendr_2/);
  assert.match(root.textContent, /bendr-2/);
  assert.match(root.textContent, /Source/);
  assert.match(root.textContent, /local API/);
  assert.match(root.textContent, /link_ready/);
  assert.match(root.textContent, /Public proof only/);
  assert.match(root.textContent, /Proof ledger/);
  assert.match(root.textContent, /Card first/);
  assert.match(root.textContent, /Agent cards/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /Quigbot/);
  assert.match(root.textContent, /Cred 80/);
  assert.match(root.textContent, /8453:1/);
  assert.match(root.textContent, /Inspect proof/);
  assert.match(root.textContent, /card needs verification/i);
  assert.match(root.textContent, /Status legend/);
  assert.match(root.textContent, /Visibility legend/);
  assert.match(root.textContent, /Assurance legend/);
  assert.match(root.textContent, /Fragment type legend/);
  assert.match(root.textContent, /Transfer policy/);
  assert.match(root.textContent, /Endpoint fragments describe routes/i);
  assert.match(root.textContent, /Platform verified means/i);
  for (const state of ['verified', 'pending', 'stale', 'historical', 'disputed']) {
    assert.match(root.textContent, new RegExp(state, 'i'));
  }
  assert.ok(root.querySelector('.record-shell'));
  assert.ok(root.querySelector('.record-sheet'));
  assert.ok(root.querySelector('.prototype-ribbon'));
  assert.ok(root.querySelector('.clarity-grid'));
  assert.equal(root.querySelectorAll('.clarity-card').length, 3);
  assert.ok(root.querySelector('.card-carousel'));
  assert.equal(root.querySelectorAll('.card-button').length, 4);
  assert.match(root.querySelector('.card-detail').textContent, /Helixa ID/);
  assert.ok(root.querySelectorAll('.fragment-card').length >= 6);
  assert.match(root.textContent, /Helixa AgentDNA token #1/);
  assert.match(root.textContent, /Cred score 80/);
  assert.ok(root.querySelector('.fragment-legend'));
  assert.ok(root.querySelector('.proof-ledger'));
  assert.equal(root.querySelectorAll('.record-sheet .field').length, 7);
  assert.equal(root.querySelector('.field strong.status').classList.contains('verified'), false);
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
  assert.match(root.textContent, /Swarm roster/);
  assert.match(root.textContent, /Shared tool policy/);
  assert.match(root.textContent, /Aggregate Cred context/);
  assert.equal(root.textContent.includes('frag_helixa_swarm_'), false);
});


test('selecting Helixa Swarm shows roster roles controls and transfer behavior', async () => {
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
  assert.match(detail, /Tool approvals/);
  assert.match(detail, /Route policy/);
  assert.match(detail, /Owner approval/);
  assert.match(detail, /Cred 78 Prime summarizes the roster without replacing individual agent scores/);
  assert.match(detail, /Permissions pause and tool routes reverify when custody changes/);
});

test('landing page leads with product explanation and keeps raw fragment ids out of default view', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.match(root.textContent, /What is Multipass/i);
  assert.match(root.textContent, /agents, swarms, apps, and marketplaces/i);
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
  assert.ok(neutralBadgesAll.includes('10 public'));
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


test('static /multipass/ page loads bundled fixture without calling API', async () => {
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
  assert.match(root.textContent, /Static Demo/);
  assert.match(root.textContent, /bundled fixture/);
  assert.match(root.textContent, /mp_bendr_2/);
  assert.ok(root.querySelectorAll('.fragment-card').length >= 6);
  assert.match(root.textContent, /Helixa AgentDNA token #1/);
  assert.match(root.textContent, /Cred score 80/);
  for (const state of ['verified', 'pending', 'stale', 'historical', 'disputed']) {
    assert.match(root.textContent, new RegExp(state, 'i'));
  }
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
  assert.match(root.textContent, /Static Demo/);
  assert.match(root.textContent, /bundled fixture/);
  assert.equal(root.innerHTML.includes('/multipass-api'), false);
});

test('API failure renders setup message', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => { throw new Error('GET /multipass-api failed with 502'); } }).start();

  assert.match(root.textContent, /Could not load Multipass API data/);
  assert.match(root.textContent, /pnpm api:bendr/);
  assert.match(root.textContent, /GET \/multipass-api failed with 502/);
});

test('private fragment ids and unexpected private fields are absent from rendered HTML', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.innerHTML.includes('frag_bendr_private_placeholder'), false);
  assert.equal(root.innerHTML.includes('frag_bendr_unexpected_private_field'), false);
});

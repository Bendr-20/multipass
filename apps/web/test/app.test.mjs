import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { HelixaResolverError } from '../src/live-helixa-resolver.js';

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
          fragment_id: 'frag_quigbot_identity',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
          public_value: 'Quigbot identity checked by Helixa fixture.',
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
          public_value: 'Lower trust context for a test/demo agent.',
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



test('homepage leads with Multipass product hero instead of Bendr record sheet', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const hero = root.querySelector('.homepage-hero');
  assert.ok(hero);
  assert.match(hero.textContent, /Multipass/i);
  assert.match(hero.textContent, /portable agent trust profiles/i);
  assert.doesNotMatch(hero.textContent, /mp_bendr_2/);
  assert.doesNotMatch(hero.textContent, /receipt_bendr_lookup/);
  assert.equal(root.querySelector('.record-sheet'), null);
});

test('homepage renders visual profile gallery cards with proof context', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const gallery = root.querySelector('.profile-gallery');
  assert.ok(gallery);
  assert.match(gallery.textContent, /Example trust profiles/i);
  const cards = [...root.querySelectorAll('.profile-card')];
  assert.ok(cards.length >= 4);
  assert.ok(cards.every((card) => card.querySelector('.profile-card-visual')));
  assert.ok(cards.every((card) => /Cred|Trust/.test(card.textContent)));
  assert.ok(cards.every((card) => /proof/i.test(card.textContent)));
  assert.match(cards[0].textContent, /Bendr 2\.0/);
  assert.match(cards[0].textContent, /Lead agent/i);
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
  assert.match(root.textContent, /Internal Prototype/);
  assert.match(root.textContent, /agent builders/i);
  assert.match(root.textContent, /What is Multipass/);
  assert.match(root.textContent, /What the card shows/);
  assert.match(root.textContent, /What proof adds/);
  assert.match(root.textContent, /portable agent trust profile/i);
  assert.match(root.textContent, /raw protocol details/i);
  assert.match(root.textContent, /MULTIPASS/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.doesNotMatch(root.querySelector('.homepage-hero')?.textContent ?? '', /mp_bendr_2/);
  assert.doesNotMatch(root.querySelector('.homepage-hero')?.textContent ?? '', /bendr-2/);
  assert.match(root.textContent, /bundled fixture/);
  assert.match(root.textContent, /Proof ledger/);
  assert.match(root.textContent, /Card first/);
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
  assert.ok(root.querySelector('.clarity-grid'));
  assert.equal(root.querySelectorAll('.clarity-card').length, 3);
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
  assert.match(resolver.textContent, /Resolve live Helixa agent/);
  assert.match(resolver.textContent, /Try 1, 8453:1, Bendr 2\.0, or Quigbot/);
  assert.match(resolver.textContent, /Helixa ID, name, or handle/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /bundled fixture/);
});

test('static homepage renders display-only share panel', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const panel = root.querySelector('.share-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Portable Agent Identity/);
  assert.match(panel.textContent, /Share this Multipass/i);
  assert.match(panel.textContent, /Tap and hold to copy/i);
  assert.equal(panel.querySelector('input'), null);
  assert.equal(panel.querySelector('.share-url')?.textContent, 'https://helixa.xyz/multipass/');
  assert.doesNotMatch(panel.textContent, /claim|approve|transfer|payment|wallet/i);
});


test('render uses live hero note when data supplies one', async () => {
  const data = { ...sampleData(), heroNote: 'Read-only live Helixa API data for Bendr 2.0.', sourceLabel: 'live Helixa API' };
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => data }).start();

  assert.match(root.textContent, /Read-only live Helixa API data for Bendr 2\.0/);
  assert.doesNotMatch(root.textContent, /public fixture data/);
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

test('selected card renders transfer state preview with paused permissions and preserved history', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  root.querySelectorAll('.card-button')[3].click();

  const preview = root.querySelector('.transfer-preview');
  assert.ok(preview);
  assert.match(preview.textContent, /Transfer State Preview/);
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

test('landing page leads with product explanation and keeps raw fragment ids out of default view', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.match(root.textContent, /What is Multipass/i);
  assert.match(root.textContent, /portable agent trust profile/i);
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
  assert.doesNotMatch(root.querySelector('.homepage-hero')?.textContent ?? '', /mp_bendr_2/);
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
  assert.match(root.textContent, /Live Helixa API data loaded/);
});


test('static demo does not require marketplace listing data', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.querySelector('.marketplace-listing'), null);
  assert.doesNotMatch(root.innerHTML, /Marketplace listing preview/);
  assert.match(root.innerHTML, /Example trust profiles/);
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
  const root = setupDom('https://helixa.xyz/multipass/');
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

test('static demo button restores bundled fixture after live resolve', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver' };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  root.querySelector('[data-action="reset-static-demo"]').click();

  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /bundled fixture/);
  assert.doesNotMatch(root.textContent, /Live Bendr/);
});

test('static demo reset invalidates an in-flight live resolver response', async () => {
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
  assert.match(root.textContent, /bundled fixture/);
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
  assert.equal(root.querySelector('.live-resolver button[type="submit"]').textContent, 'Resolving...');

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

  assert.equal(root.querySelector('.homepage-hero h1').textContent, 'Quigbot Multipass');
  assert.match(root.querySelector('.homepage-proof-panel').textContent, /Trust profile stack/);
  assert.match(root.querySelector('.header-meta').textContent, /Live profile · 8453:81/);
  assert.equal(root.querySelector('.share-link')?.getAttribute('href'), '/multipass/?agent=81');
  assert.match(root.querySelector('.share-link')?.textContent ?? '', /\/multipass\/\?agent=81/);
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
  assert.equal(auraCard?.nextElementSibling, drawer);
  assert.equal(drawer?.nextElementSibling, root.querySelector('.marketplace-listing'));
  assert.match(root.textContent, /Helixa Agent Aura/);
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



test('resolver example chips resolve live agents through the existing flow', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => {
      calls.push(input);
      return {
        ...sampleData(),
        liveProfilePage: { headline: `${input} Multipass`, sharePath: '/multipass/?agent=81' },
      };
    },
  }).start();

  const chips = [...root.querySelectorAll('[data-action="resolve-example-agent"]')].map((button) => button.textContent.trim());
  assert.deepEqual(chips, ['Bendr', 'Quigbot', '81']);

  root.querySelector('[data-action="resolve-example-agent"][data-agent="Quigbot"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['Quigbot']);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=81');
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
  assert.equal(root.querySelector('.homepage-hero h1').textContent, 'Quigbot Multipass');
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=81');
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

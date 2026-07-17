import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO_SUBJECT,
  FRAGMENT_LEGENDS,
  HERO_COPY,
  V01_COPY,
  V02_COPY,
  createClaritySections,
  createAgentCarousel,
  createOwnerCustodySnapshot,
  createFragmentTrustMap,
  createProofCards,
  createStoryCards,
  summarizeProfile,
} from '../src/content.js';
import { STATIC_DEMO_DATA } from '../src/static-demo-data.js';

test('DEMO_SUBJECT contains Bendr V0 metadata', () => {
  assert.equal(DEMO_SUBJECT.slug, 'bendr-2');
  assert.equal(DEMO_SUBJECT.receiptId, 'receipt_bendr_lookup');
  assert.equal(DEMO_SUBJECT.label, 'Bendr 2.0');
});


test('static Helixa Swarm demo uses approved public roster only', () => {
  const swarm = STATIC_DEMO_DATA.agentCards.find((card) => card.tokenId === 'swarm:helixa');
  assert.equal(swarm.members, 5);
  assert.deepEqual(swarm.roster.map((member) => member.name), ['Bendr 2.0', 'Quigbot', 'Helixa', 'Phantom Relay', 'Nox']);
  assert.deepEqual(swarm.roster.map((member) => member.role), ['Lead Agent / Trust Router', 'Product / Strategy Agent', 'Protocol / Identity Agent', 'Routing / Relay Agent', 'Ops / Safety Agent']);
  assert.deepEqual(swarm.visual, {
    imageUrl: 'https://helixa.xyz/multipass/helixa-logo.png',
    label: 'Helixa logo swarm identity',
    tone: 'swarm',
  });

  const publicDemoText = JSON.stringify(STATIC_DEMO_DATA);
  assert.doesNotMatch(publicDemoText, /E2ETest/);
  assert.doesNotMatch(publicDemoText, /e2etest/i);
});


test('landing copy names agent builders and explains product-card-proof flow', () => {
  assert.match(HERO_COPY.headline, /public agent profiles/i);
  assert.doesNotMatch(HERO_COPY.headline, /trust profiles/i);
  assert.match(HERO_COPY.body, /visual identity graph/i);
  assert.match(V01_COPY.audience, /agent builders/i);
  assert.equal(V01_COPY.prototypeLabel, '');
  assert.match(V01_COPY.productSentence, /public agent profile/i);

  const sections = createClaritySections();
  const titles = sections.map((section) => section.title);
  assert.deepEqual(titles, [
    'What is Multipass?',
    'What the card shows',
    'What proof adds',
  ]);

  const combined = JSON.stringify(sections);
  assert.match(combined, /public agent profile/i);
  assert.match(combined, /agents, humans, swarms, collections, projects, organizations, apps, directories, and marketplace display surfaces/i);
  assert.match(combined, /Helixa ID/i);
  assert.match(combined, /trust context/i);
  assert.match(combined, /Cred context/i);
  assert.match(combined, /raw protocol details/i);
});


test('V0.2 copy and legends explain fragment trust states', () => {
  assert.match(V02_COPY.title, /Inspect proof/i);
  assert.match(V02_COPY.body, /card needs verification/i);
  assert.match(V02_COPY.body, /transfer rule/i);

  assert.deepEqual(Object.keys(FRAGMENT_LEGENDS.visibility), ['public', 'gated', 'private', 'hidden']);
  for (const type of ['endpoint', 'attestation', 'receipt', 'standard_ref', 'verification_result']) {
    assert.equal(typeof FRAGMENT_LEGENDS.fragmentType[type], 'string');
    assert.ok(FRAGMENT_LEGENDS.fragmentType[type].length > 20);
  }
  for (const assurance of ['unverified', 'self_attested', 'platform_verified', 'cryptographic', 'issuer_attested', 'onchain_verified']) {
    assert.equal(typeof FRAGMENT_LEGENDS.assurance[assurance], 'string');
    assert.ok(FRAGMENT_LEGENDS.assurance[assurance].length > 20);
  }
  for (const status of ['verified', 'pending', 'stale', 'historical', 'disputed']) {
    assert.equal(typeof FRAGMENT_LEGENDS.status[status], 'string');
    assert.ok(FRAGMENT_LEGENDS.status[status].length > 20);
  }
  for (const policy of ['reverify_on_transfer', 'pause_on_transfer', 'historical_on_transfer', 'never_transfer']) {
    assert.equal(typeof FRAGMENT_LEGENDS.transferPolicy[policy], 'string');
    assert.ok(FRAGMENT_LEGENDS.transferPolicy[policy].length > 20);
  }
});


test('agent carousel maps real Helixa card data for display', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      { name: 'Bendr 2.0', tokenId: 1, helixaId: '8453:1', framework: 'openclaw', credScore: 80, credTier: 'Preferred', verified: true, profileUrl: 'https://helixa.xyz/agent/1' },
      { name: 'Quigbot', tokenId: 81, helixaId: '8453:81', framework: 'openclaw', credScore: 75, credTier: 'Prime', verified: true, profileUrl: 'https://helixa.xyz/agent/81' },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  assert.equal(carousel.title, 'Example public agent profiles.');
  assert.equal(carousel.cards.length, 2);
  assert.equal(carousel.cards[0].helixaId, '8453:1');
  assert.equal(carousel.cards[0].credLabel, 'Cred 80');
  assert.equal(carousel.cards[0].verifiedLabel, 'verified');
  assert.equal(carousel.cards[0].role, 'Lead agent');
  assert.equal(carousel.cards[0].visual.imageUrl, 'https://api.helixa.xyz/api/v2/aura/1.png');
  assert.match(carousel.cards[0].proofSummary, /Proof pending|proof signals/);
});

test('agent carousel renders IPFS profile images through an HTTPS gateway', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      {
        name: 'mferGPT',
        tokenId: 'saved:mfergpt-73',
        helixaId: 'eip155:1:25068',
        framework: 'openclaw',
        credScore: 75,
        credTier: 'Building',
        verified: false,
        visual: { imageUrl: 'ipfs://QmVWZLP5az4M3weSKsmz4yoRvsYuu2p32FUUrKts8r68Tn' },
      },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  assert.equal(carousel.cards[0].visual.imageUrl, 'https://ipfs.io/ipfs/QmVWZLP5az4M3weSKsmz4yoRvsYuu2p32FUUrKts8r68Tn');
});



test('agent carousel includes collection swarm cards with roster and custody context', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      {
        name: 'Helixa Swarm',
        tokenId: 'swarm:helixa',
        helixaId: '8453:swarm:helixa',
        framework: 'multi-agent',
        credScore: 78,
        credTier: 'Prime',
        verified: true,
        profileUrl: 'https://helixa.xyz/swarm/helixa',
        subjectType: 'swarm',
        members: 5,
        role: 'Parent Multipass',
        custody: 'Custody epoch ready',
      },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  assert.equal(carousel.cards[0].subjectLabel, 'swarm');
  assert.equal(carousel.cards[0].memberLabel, '5 agents');
  assert.equal(carousel.cards[0].role, 'Parent Multipass');
  assert.equal(carousel.cards[0].custody, 'Custody epoch ready');
});


test('swarm cards expose roster roles policy references and transfer behavior', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      {
        name: 'Helixa Swarm',
        tokenId: 'swarm:helixa',
        helixaId: '8453:swarm:helixa',
        framework: 'multi-agent',
        credScore: 78,
        credTier: 'Prime',
        verified: true,
        profileUrl: 'https://helixa.xyz/swarm/helixa',
        subjectType: 'swarm',
        members: 5,
        role: 'Parent Multipass',
        custody: 'Custody epoch ready',
        roster: [
          { name: 'Bendr 2.0', role: 'Lead Agent / Trust Router' },
          { name: 'Quigbot', role: 'Product / Strategy Agent' },
          { name: 'Helixa', role: 'Protocol / Identity Agent' },
          { name: 'Phantom Relay', role: 'Routing / Relay Agent' },
          { name: 'Nox', role: 'Ops / Safety Agent' },
        ],
        sharedControls: ['Tool approval policy', 'Route policy reference', 'Owner approval required'],
        aggregateCred: 'Cred 78 Prime summarizes the roster without replacing individual agent scores.',
        transferBehavior: 'Permissions pause and tool routes reverify when custody changes.',
      },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  const swarm = carousel.cards[0];
  assert.equal(swarm.detailMode, 'swarm');
  assert.deepEqual(swarm.roster.map((member) => member.name), ['Bendr 2.0', 'Quigbot', 'Helixa', 'Phantom Relay', 'Nox']);
  assert.deepEqual(swarm.roster.map((member) => member.role), ['Lead Agent / Trust Router', 'Product / Strategy Agent', 'Protocol / Identity Agent', 'Routing / Relay Agent', 'Ops / Safety Agent']);
  assert.deepEqual(swarm.sharedControls, ['Tool approval policy', 'Route policy reference', 'Owner approval required']);
  assert.match(swarm.aggregateCred, /without replacing individual agent scores/i);
  assert.match(swarm.transferBehavior, /Permissions pause/i);
});




test('owner custody snapshot exposes V0 owner operator permission and review state', () => {
  const snapshot = createOwnerCustodySnapshot({
    name: 'Helixa Swarm',
    ownerSnapshot: {
      owner: '0x3395...480E0',
      operator: 'Helixa ops',
      custodyEpoch: 'Epoch 03',
      permissionState: 'Paused until owner review',
      visibility: 'Public profile, gated private data',
      recentChange: 'Transfer detected 2026-06-24',
      reviewAction: 'Reverify routes before resume',
    },
  });

  assert.equal(snapshot.title, 'Owner & Custody Snapshot');
  assert.equal(snapshot.owner, '0x3395...480E0');
  assert.equal(snapshot.operator, 'Helixa ops');
  assert.equal(snapshot.custodyEpoch, 'Epoch 03');
  assert.equal(snapshot.permissionState, 'Paused until owner review');
  assert.equal(snapshot.visibility, 'Public profile, gated private data');
  assert.equal(snapshot.recentChange, 'Transfer detected 2026-06-24');
  assert.equal(snapshot.reviewAction, 'Reverify routes before resume');
  assert.match(snapshot.note, /state reference/i);
});

test('agent carousel exposes transfer state preview without transferring secrets', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      {
        name: 'Helixa Swarm',
        tokenId: 'swarm:helixa',
        helixaId: '8453:swarm:helixa',
        framework: 'multi-agent',
        credScore: 78,
        credTier: 'Prime',
        verified: true,
        profileUrl: 'https://helixa.xyz/swarm/helixa',
        subjectType: 'swarm',
        members: 5,
        role: 'Parent Multipass',
        custody: 'Custody epoch ready',
        transferPreview: {
          currentOwner: '0x3395...480E0',
          custodyEpoch: 'Epoch 03',
          claimAction: 'New owner claim required',
          permissionsState: 'Permissions paused',
          toolAction: 'Reverify shared tools',
          privateAccessAction: 'Rotate private access',
          historyState: 'History preserved',
          credContinuity: 'Cred continues with ownership-change context.',
        },
      },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  const transfer = carousel.cards[0].transferPreview;
  assert.equal(transfer.title, 'Ownership State');
  assert.equal(transfer.currentOwner, '0x3395...480E0');
  assert.equal(transfer.claimAction, 'New owner claim required');
  assert.equal(transfer.permissionsState, 'Permissions paused');
  assert.equal(transfer.toolAction, 'Reverify shared tools');
  assert.equal(transfer.privateAccessAction, 'Rotate private access');
  assert.match(transfer.note, /does not transfer secrets/i);
});

test('agent carousel exposes change review ledger rows without executable actions', () => {
  const carousel = createAgentCarousel({
    agentCards: [
      {
        name: 'Helixa Swarm',
        tokenId: 'swarm:helixa',
        helixaId: '8453:swarm:helixa',
        framework: 'multi-agent',
        credScore: 78,
        credTier: 'Prime',
        verified: true,
        profileUrl: 'https://helixa.xyz/swarm/helixa',
        subjectType: 'swarm',
        members: 5,
        role: 'Parent Multipass',
        custody: 'Custody epoch ready',
        changeReviewLedger: [
          { event: 'Cred import refreshed', source: 'Helixa API', impact: 'Cred context updated', reviewState: 'Verified' },
          { event: 'Transfer detected', source: 'Owner registry', impact: 'Permissions paused', reviewState: 'Review required' },
          { event: 'Standards reference stale', source: 'Standards profile', impact: 'Adapter claim needs a fresh check', reviewState: 'Reverify' },
        ],
      },
    ],
    profile: { display_name: 'Fallback', slug: 'fallback', cred_summary: { trust_state: 'none' } },
    card: { trust_summary: { identity_status: 'pending' } },
  });

  const ledger = carousel.cards[0].changeReviewLedger;
  assert.equal(ledger.title, 'Change + Review Ledger');
  assert.deepEqual(ledger.rows.map((row) => row.event), [
    'Cred import refreshed',
    'Transfer detected',
    'Standards reference stale',
  ]);
  assert.deepEqual(ledger.rows.map((row) => row.reviewState), ['Verified', 'Review required', 'Reverify']);
  assert.match(ledger.note, /readable state/i);
  assert.doesNotMatch(JSON.stringify(ledger), /Execute|Approve now|Transfer now/i);
});

test('fragment trust map follows selected proof ids', () => {
  const data = {
    fragments: {
      fragments: [
        { fragment_id: 'frag_bendr_helixa_identity', fragment_type: 'attestation', status: 'verified', assurance_level: 'onchain_verified', visibility: 'public', transfer_policy: 'historical_on_transfer', public_value: 'Bendr identity.', source: { source_type: 'contract_read', issuer: 'Helixa' } },
        { fragment_id: 'frag_quigbot_identity', fragment_type: 'attestation', status: 'verified', assurance_level: 'platform_verified', visibility: 'public', transfer_policy: 'historical_on_transfer', public_value: 'Quigbot identity.', source: { source_type: 'platform_check', issuer: 'Helixa' } },
        { fragment_id: 'frag_quigbot_cred', fragment_type: 'risk_summary', status: 'verified', assurance_level: 'platform_verified', visibility: 'public', transfer_policy: 'reverify_on_transfer', public_value: 'Quigbot Cred context.', source: { source_type: 'registry_import', issuer: 'Helixa' } },
      ],
    },
  };

  const map = createFragmentTrustMap(data, { proofFragmentIds: ['frag_quigbot_identity', 'frag_quigbot_cred'] });

  assert.deepEqual(map.cards.map((card) => card.title), ['Quigbot identity', 'Quigbot Cred context']);
});

test('proof ledger public fragments follow selected proof ids', () => {
  const data = {
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'established' } },
    fragments: {
      fragments: [
        { fragment_id: 'frag_bendr_helixa_identity', fragment_type: 'attestation', visibility: 'public' },
        { fragment_id: 'frag_helixa_swarm_roster', fragment_type: 'custody_record', visibility: 'public' },
        { fragment_id: 'frag_helixa_swarm_tools', fragment_type: 'endpoint', visibility: 'public' },
        { fragment_id: 'frag_helixa_swarm_cred', fragment_type: 'risk_summary', visibility: 'public' },
      ],
    },
    card: { capabilities: [{}], service_endpoints: [{}] },
    standards: { standard_refs: [] },
    x402: { endpoints: [] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  };

  const cards = createProofCards(data, { name: 'Helixa Swarm', proofFragmentIds: ['frag_helixa_swarm_roster', 'frag_helixa_swarm_tools', 'frag_helixa_swarm_cred'] });
  const publicFragments = cards.find((card) => card.title === 'Public Fragments');

  assert.equal(publicFragments.status, '3 public');
  assert.match(publicFragments.summary, /Helixa Swarm/);
  assert.equal(publicFragments.json.fragments.length, 3);
});

test('fragment trust map turns raw fragment ids into readable proof cards', () => {
  const map = createFragmentTrustMap({
    fragments: {
      fragments: [
        {
          fragment_id: 'frag_bendr_helixa_identity',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'onchain_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          public_value: 'Helixa AgentDNA token #1 on Base.',
          source: { source_type: 'contract_read', issuer: 'Helixa' },
        },
      ],
    },
  });

  assert.equal(map.title, 'Inspect proof');
  assert.equal(map.cards[0].title, 'Helixa AgentDNA identity');
  assert.equal(map.cards[0].id, 'frag_bendr_helixa_identity');
  assert.equal(map.cards[0].statusLabel, 'Verified');
  assert.match(map.cards[0].summary, /Identity or claim check/i);
  assert.match(map.cards[0].summary, /Helixa AgentDNA token #1/i);
});


test('fragment trust map names swarm proof signals without raw ids as titles', () => {
  const map = createFragmentTrustMap({
    fragments: {
      fragments: [
        {
          fragment_id: 'frag_helixa_swarm_roster',
          fragment_type: 'custody_record',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'pause_on_transfer',
          public_value: 'Parent Multipass manages Bendr 2.0, Quigbot, Helixa, Phantom Relay, and Nox as one public swarm roster.',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
        },
      ],
    },
  });

  assert.equal(map.cards[0].title, 'Swarm roster');
  assert.equal(map.cards[0].id, 'frag_helixa_swarm_roster');
  assert.notEqual(map.cards[0].title, map.cards[0].id);
});

test('fragment trust map keeps public fragments separate and explains transfer policy', () => {
  const map = createFragmentTrustMap({
    fragments: {
      fragments: [
        {
          fragment_id: 'frag_verified_profile',
          fragment_type: 'attestation',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'historical_on_transfer',
          public_value: 'Verified profile claim.',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
        },
        {
          fragment_id: 'frag_pending_endpoint',
          fragment_type: 'endpoint',
          status: 'pending',
          assurance_level: 'self_attested',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          public_value: 'Pending endpoint route.',
          source: { source_type: 'owner_submission', issuer: null },
          endpoint_ref: { protocol: 'x402' },
        },
        {
          fragment_id: 'frag_disputed_private',
          fragment_type: 'attestation',
          status: 'disputed',
          assurance_level: 'unverified',
          visibility: 'private',
          transfer_policy: 'never_transfer',
          public_value: null,
          source: { source_type: 'owner_submission', issuer: null },
        },
      ],
    },
  });

  assert.equal(map.cards.length, 2);
  assert.equal(map.cards.some((card) => card.id === 'frag_disputed_private'), false);
  assert.match(map.cards[0].typeLabel, /Attestation/);
  assert.match(map.cards[0].assuranceLabel, /Platform verified/);
  assert.match(map.cards[0].transferPolicyLabel, /Historical on transfer/);
  assert.match(map.cards[1].summary, /x402 endpoint/i);
  assert.match(map.cards[1].statusExplanation, /waiting for review/i);
  assert.match(map.emptyPrivateNote, /private and hidden fragments are not rendered/i);
});

test('fragment trust map leads with concrete evidence before taxonomy metadata', () => {
  const map = createFragmentTrustMap({
    fragments: {
      fragments: [
        {
          fragment_id: 'frag_bendr_cred_score',
          fragment_type: 'risk_summary',
          status: 'pending',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          public_value: 'Cred score 80, Preferred tier, imported from Helixa API.',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
        },
        {
          fragment_id: 'frag_bendr_social_x',
          fragment_type: 'social',
          status: 'verified',
          assurance_level: 'platform_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          public_value: 'X handle @BendrAI_eth imported from Helixa API.',
          source: { source_type: 'platform_check', issuer: 'Helixa' },
        },
      ],
    },
  });

  assert.match(map.cards[0].summary, /Cred and risk context/i);
  assert.match(map.cards[0].summary, /Cred score 80/i);
  assert.match(map.cards[1].summary, /Public social or contact route/i);
  assert.match(map.cards[1].summary, /@BendrAI_eth/i);
});

test('fragment trust map explains Intuition graph fragments in user-facing language', () => {
  const map = createFragmentTrustMap({
    fragments: {
      fragments: [
        {
          fragment_id: 'frag_live_1_intuition',
          fragment_type: 'standard_ref',
          status: 'verified',
          assurance_level: 'onchain_verified',
          visibility: 'public',
          transfer_policy: 'reverify_on_transfer',
          public_value: 'Intuition identity graph published for ERC-8004 agent 8453:18531 with identity atom 0x2895...ccf37 and Helixa Cred assessment claim 0x98b4...e7b1.',
          source: { source_type: 'issuer_attestation', issuer: 'Intuition' },
          intuition_ref: { canonical_agent_id: '8453:18531' },
        },
      ],
    },
  });

  assert.match(map.cards[0].summary, /Intuition identity graph proof for ERC-8004 agent 8453:18531/);
  assert.match(map.cards[0].summary, /human-readable identity atom to the CAIP anchor/);
});

test('summary helpers produce display strings from record-shaped documents', () => {
  const summary = summarizeProfile({
    display_name: 'Bendr 2.0',
    status: 'link_ready',
    subject_type: 'agent',
    cred_summary: { trust_state: 'building' },
  });

  assert.match(summary, /Bendr 2\.0/);
  assert.match(summary, /link_ready/);
  assert.match(summary, /building/);
});

test('story and proof cards cover the intended demo sections', () => {
  const data = {
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    fragments: {
      subject_id: 'bendr-2',
      private_fragments: [{ fragment_id: 'frag_bendr_unexpected_private_field', visibility: 'private' }],
      fragments: [
        { fragment_id: 'frag_public', visibility: 'public' },
        { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
      ],
    },
    card: { capabilities: [{}], service_endpoints: [{}] },
    standards: { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    x402: { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  };

  const storyCards = createStoryCards(data);
  assert.deepEqual(storyCards.map((card) => card.title), [
    'Card first',
    'Proof below',
    'Portable by design',
  ]);
  assert.deepEqual(storyCards.map((card) => card.label), [
    'Fast read',
    'Selected proof',
    '1 x402 endpoint',
  ]);
  const storyText = JSON.stringify(storyCards);
  assert.doesNotMatch(storyText, /\d+ public fragments/i);
  assert.match(storyText, /proof below/i);
  assert.match(storyText, /profile across discovery/i);
  const proofCards = createProofCards(data);
  assert.deepEqual(proofCards.map((card) => card.title), [
    'Profile',
    'Public Fragments',
    'Agent Card',
    'Standards',
    'x401',
    'x402',
    'Receipt',
  ]);
  for (const card of proofCards) {
    assert.equal(typeof card.why, 'string');
    assert.ok(card.why.length > 20, `${card.title} needs a useful explanation`);
  }
  assert.match(proofCards.find((card) => card.title === 'Standards').why, /reference/i);
  assert.match(proofCards.find((card) => card.title === 'x401').why, /identity/i);
  assert.match(proofCards.find((card) => card.title === 'x402').why, /access/i);
  assert.match(proofCards.find((card) => card.title === 'Receipt').why, /evidence/i);
});

test('proof card summaries and JSON do not include non-public fragment ids', () => {
  const cards = createProofCards({
    profile: {
      display_name: 'Bendr 2.0',
      status: 'link_ready',
      subject_type: 'agent',
      cred_summary: { trust_state: 'building' },
      hidden_fragments: [{ fragment_id: 'frag_profile_hidden_placeholder', visibility: 'hidden' }],
      gated_fragments: [{ fragment_id: 'frag_profile_gated_placeholder', visibility: 'gated' }],
    },
    fragments: {
      subject_id: 'bendr-2',
      private_fragments: [{ fragment_id: 'frag_bendr_unexpected_private_field', visibility: 'private' }],
      hidden_fragments: [{ fragment_id: 'frag_bendr_hidden_placeholder', visibility: 'hidden' }],
      gated_fragments: [{ fragment_id: 'frag_bendr_gated_placeholder', visibility: 'gated' }],
      fragments: [
        { fragment_id: 'frag_public', visibility: 'public' },
        { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
        { fragment_id: 'frag_bendr_hidden_nested', visibility: 'hidden' },
        { fragment_id: 'frag_bendr_gated_nested', visibility: 'gated' },
      ],
    },
    card: { capabilities: [], service_endpoints: [] },
    standards: { standard_refs: [] },
    x402: { endpoints: [] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  });

  const json = JSON.stringify(cards);
  assert.equal(json.includes('frag_bendr_private_placeholder'), false);
  assert.equal(json.includes('frag_bendr_unexpected_private_field'), false);
  assert.equal(json.includes('frag_bendr_hidden_placeholder'), false);
  assert.equal(json.includes('frag_bendr_gated_placeholder'), false);
  assert.equal(json.includes('frag_bendr_hidden_nested'), false);
  assert.equal(json.includes('frag_bendr_gated_nested'), false);
  assert.equal(json.includes('frag_profile_hidden_placeholder'), false);
  assert.equal(json.includes('frag_profile_gated_placeholder'), false);
});

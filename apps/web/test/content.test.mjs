import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO_SUBJECT,
  HERO_COPY,
  V01_COPY,
  createClaritySections,
  createProofCards,
  createStoryCards,
  summarizeProfile,
} from '../src/content.js';

test('DEMO_SUBJECT contains Bendr V0 metadata', () => {
  assert.equal(DEMO_SUBJECT.slug, 'bendr-2');
  assert.equal(DEMO_SUBJECT.receiptId, 'receipt_bendr_lookup');
  assert.equal(DEMO_SUBJECT.label, 'Bendr 2.0');
});


test('V0.1 copy names agent builders and separates prototype state', () => {
  assert.match(HERO_COPY.headline, /portable trust profile/i);
  assert.match(V01_COPY.audience, /agent builders/i);
  assert.match(V01_COPY.prototypeLabel, /Internal Prototype/);

  const sections = createClaritySections();
  const titles = sections.map((section) => section.title);
  assert.deepEqual(titles, [
    'What this record proves',
    'What is static demo data',
    'What is planned but not live',
  ]);

  const combined = JSON.stringify(sections);
  assert.match(combined, /identity/i);
  assert.match(combined, /public proof/i);
  assert.match(combined, /standards/i);
  assert.match(combined, /access receipts/i);
  assert.match(combined, /fixture/i);
  assert.match(combined, /no live auth/i);
  assert.match(combined, /no live settlement/i);
});

test('summary helpers produce display strings from fixture-shaped documents', () => {
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
    'Identity Graph',
    'Standards Spine',
    'Access and Receipts',
  ]);
  const storyText = JSON.stringify(storyCards);
  assert.match(storyText, /public fragments/i);
  assert.match(storyText, /standards references/i);
  assert.match(storyText, /receipt evidence/i);
  const proofCards = createProofCards(data);
  assert.deepEqual(proofCards.map((card) => card.title), [
    'Profile',
    'Public Fragments',
    'Agent Card',
    'Standards',
    'x402',
    'Receipt',
  ]);
  for (const card of proofCards) {
    assert.equal(typeof card.why, 'string');
    assert.ok(card.why.length > 20, `${card.title} needs a useful explanation`);
  }
  assert.match(proofCards.find((card) => card.title === 'Standards').why, /reference/i);
  assert.match(proofCards.find((card) => card.title === 'x402').why, /access/i);
  assert.match(proofCards.find((card) => card.title === 'Receipt').why, /evidence/i);
});

test('proof card summaries and JSON do not include private fragment ids', () => {
  const cards = createProofCards({
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    fragments: {
      subject_id: 'bendr-2',
      private_fragments: [{ fragment_id: 'frag_bendr_unexpected_private_field', visibility: 'private' }],
      fragments: [
        { fragment_id: 'frag_public', visibility: 'public' },
        { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
      ],
    },
    card: { capabilities: [], service_endpoints: [] },
    standards: { standard_refs: [] },
    x402: { endpoints: [] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  });

  assert.equal(JSON.stringify(cards).includes('frag_bendr_private_placeholder'), false);
  assert.equal(JSON.stringify(cards).includes('frag_bendr_unexpected_private_field'), false);
});

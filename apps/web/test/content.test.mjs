import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO_SUBJECT,
  createProofCards,
  createStoryCards,
  summarizeProfile,
} from '../src/content.js';

test('DEMO_SUBJECT contains Bendr V0 metadata', () => {
  assert.equal(DEMO_SUBJECT.slug, 'bendr-2');
  assert.equal(DEMO_SUBJECT.receiptId, 'receipt_bendr_lookup');
  assert.equal(DEMO_SUBJECT.label, 'Bendr 2.0');
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
    fragments: { fragments: [
      { fragment_id: 'frag_public', visibility: 'public' },
      { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
    ] },
    card: { capabilities: [{}], service_endpoints: [{}] },
    standards: { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    x402: { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  };

  assert.deepEqual(createStoryCards(data).map((card) => card.title), [
    'Identity Graph',
    'Standards Spine',
    'Access and Receipts',
  ]);
  assert.deepEqual(createProofCards(data).map((card) => card.title), [
    'Profile',
    'Public Fragments',
    'Agent Card',
    'Standards',
    'x402',
    'Receipt',
  ]);
});

test('proof card summaries and JSON do not include private fragment ids', () => {
  const cards = createProofCards({
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    fragments: { fragments: [
      { fragment_id: 'frag_public', visibility: 'public' },
      { fragment_id: 'frag_bendr_private_placeholder', visibility: 'private' },
    ] },
    card: { capabilities: [], service_endpoints: [] },
    standards: { standard_refs: [] },
    x402: { endpoints: [] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  });

  assert.equal(JSON.stringify(cards).includes('frag_bendr_private_placeholder'), false);
});

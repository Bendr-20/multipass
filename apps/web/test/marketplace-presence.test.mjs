import assert from 'node:assert/strict';
import test from 'node:test';

import { getMarketplacePresenceEntries, normalizeMarketplaceProfileUrlForKey } from '../src/marketplace-presence.js';

const MARKETPLACE_FRAGMENT = {
  fragment_id: 'frag_marketplace_bankr',
  fragment_type: 'attestation',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  source: { source_type: 'owner_submission', issuer: null, observed_at: '2026-07-06T00:00:00.000Z', reference_url: 'https://bankr.bot/agents/helixa' },
  marketplace_ref: {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    title: 'Helixa agent profile',
    summary: 'Public marketplace listing for Helixa services.',
    listing_id: 'helixa',
    status: 'manager_supplied',
    services: [{ name: 'Deep CRED report', endpoint_url: 'https://api.example.test/service' }],
  },
};

test('getMarketplacePresenceEntries derives fragment entries before explicit data and de-dupes by URL', () => {
  const entries = getMarketplacePresenceEntries({
    fragments: { fragments: [MARKETPLACE_FRAGMENT] },
    marketplacePresence: [{ marketplace: 'Bankr', profileUrl: 'https://bankr.bot/agents/helixa/', title: 'Old explicit', summary: 'Old summary.', status: 'public_import' }],
    profile: { marketplacePresence: [{ marketplace: 'Bankr', listingId: 'helixa', title: 'Old profile explicit', summary: 'Old summary.' }] },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Helixa agent profile');
  assert.equal(entries[0].services[0].endpointUrl, 'https://api.example.test/service');
  assert.equal(entries[0].source.label, 'Manager supplied source');
  assert.equal(entries[0].proof.fragmentId, 'frag_marketplace_bankr');
});

test('getMarketplacePresenceEntries skips each malformed revoked hidden and unsafe marketplace fragment', () => {
  const invalidCases = [
    ['revoked', { status: 'revoked' }],
    ['hidden', { visibility: 'hidden' }],
    ['unsafe', { marketplace_ref: { ...MARKETPLACE_FRAGMENT.marketplace_ref, profile_url: 'javascript:alert(1)' } }],
    ['missing-summary', { marketplace_ref: { ...MARKETPLACE_FRAGMENT.marketplace_ref, profile_url: 'https://bankr.bot/agents/missing-summary', summary: '' } }],
  ];

  for (const [fragmentId, overrides] of invalidCases) {
    const fragment = {
      ...MARKETPLACE_FRAGMENT,
      fragment_id: fragmentId,
      marketplace_ref: {
        ...MARKETPLACE_FRAGMENT.marketplace_ref,
        profile_url: `https://bankr.bot/agents/${fragmentId}`,
      },
      ...overrides,
    };
    const entries = getMarketplacePresenceEntries({ fragments: { fragments: [fragment] } });
    assert.deepEqual(entries, [], `${fragmentId} should be skipped`);
  }

  const valid = getMarketplacePresenceEntries({ fragments: { fragments: [{ ...MARKETPLACE_FRAGMENT, fragment_id: 'good' }] } });
  assert.deepEqual(valid.map((entry) => entry.fragmentId), ['good']);
});

test('normalizeMarketplaceProfileUrlForKey removes hash lowercases host and trims one trailing slash', () => {
  assert.equal(
    normalizeMarketplaceProfileUrlForKey('https://BANKR.bot/agents/helixa/#top'),
    'https://bankr.bot/agents/helixa',
  );
  assert.equal(normalizeMarketplaceProfileUrlForKey('https://user:pass@bankr.bot/agents/helixa'), '');
});

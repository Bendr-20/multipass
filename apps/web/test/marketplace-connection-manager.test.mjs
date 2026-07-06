import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  bindMarketplaceConnectionManager,
  compactMarketplaceConnectionInput,
  compactMarketplaceConnectionPatch,
  createMarketplaceDraftFromUrl,
  mergeMarketplaceConnectionMutationState,
  renderMarketplaceConnectionManagerPanel,
} from '../src/marketplace-connection-manager.js';

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main id="app">${html}</main>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document.querySelector('#app');
}

test('createMarketplaceDraftFromUrl parses required examples and host fallbacks without network calls', () => {
  assert.deepEqual(createMarketplaceDraftFromUrl('https://bankr.bot/agents/helixa').draft, {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    listing_id: 'helixa',
    title: 'helixa',
    summary: '',
    status: 'public_import',
  });
  assert.deepEqual(createMarketplaceDraftFromUrl('https://www.okx.ai/agent/WorldCupCaller/?ref=mp#top').draft, {
    marketplace: 'OKX.AI',
    profile_url: 'https://www.okx.ai/agent/WorldCupCaller?ref=mp',
    listing_id: 'WorldCupCaller',
    title: 'WorldCupCaller',
    summary: '',
    status: 'public_import',
  });
  assert.deepEqual(createMarketplaceDraftFromUrl('https://agentgram.xyz/').draft, {
    marketplace: 'AgentGram',
    profile_url: 'https://agentgram.xyz/',
    listing_id: '',
    title: 'AgentGram',
    summary: '',
    status: 'public_import',
  });
  assert.equal(createMarketplaceDraftFromUrl('https://market.example.test/listings/alpha-1/').draft.marketplace, 'Market Example Test');
  assert.equal(createMarketplaceDraftFromUrl('https://market.example.test/listings/%E0%A4%A').draft.listing_id, '');
});

test('createMarketplaceDraftFromUrl rejects invalid unsafe and credentialed URLs', () => {
  assert.equal(createMarketplaceDraftFromUrl('not a url').error, 'Marketplace URL must be a valid URL.');
  assert.equal(createMarketplaceDraftFromUrl('http://bankr.bot/agents/helixa').error, 'Marketplace URL must use https.');
  assert.equal(createMarketplaceDraftFromUrl('https://user:pass@bankr.bot/agents/helixa').error, 'Marketplace URL must not include credentials.');
});

test('URL paste prefill populates fields locally without fetch', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network must not be called'); };
  try {
    const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [] } } }));
    bindMarketplaceConnectionManager(root, {});
    root.querySelector('input[name="marketplace_url_import"]').value = 'https://bankr.bot/agents/helixa';
    root.querySelector('[data-action="prefill-marketplace-url"]').click();
    assert.equal(root.querySelector('input[name="marketplace"]').value, 'Bankr');
    assert.equal(root.querySelector('input[name="profile_url"]').value, 'https://bankr.bot/agents/helixa');
    assert.equal(root.querySelector('input[name="listing_id"]').value, 'helixa');
    assert.equal(root.querySelector('input[name="title"]').value, 'helixa');
    assert.equal(root.querySelector('select[name="status"]').value, 'public_import');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('compactMarketplaceConnectionInput builds complete create payload without top-level status', () => {
  const form = setup(`
    <form>
      <input name="marketplace" value="Bankr" />
      <input name="profile_url" value="https://bankr.bot/agents/helixa" />
      <input name="title" value="Helixa agent profile" />
      <textarea name="summary">Public marketplace listing for Helixa services.</textarea>
      <input name="listing_id" value="helixa" />
      <select name="status"><option value="manager_supplied" selected>manager_supplied</option></select>
      <input name="source_checked_at" value="2026-07-06" />
      <input name="service_name" value="Deep CRED report" />
      <input name="service_price" value="$1 USDC" />
      <input name="service_payment_mode" value="x402" />
      <input name="service_endpoint_url" value="https://api.example.test/service" />
    </form>
  `).querySelector('form');
  const payload = compactMarketplaceConnectionInput(new window.FormData(form));
  assert.equal(payload.fragment_type, 'attestation');
  assert.equal(payload.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(payload.transfer_policy, 'historical_on_transfer');
  assert.equal(payload.status, undefined);
  assert.equal(payload.marketplace_ref.marketplace, 'Bankr');
  assert.equal(payload.marketplace_ref.status, 'manager_supplied');
  assert.equal(payload.marketplace_ref.source_checked_at, '2026-07-06');
});

test('compactMarketplaceConnectionPatch replaces marketplace_ref without fragment_type or top-level status', () => {
  const form = setup(`
    <form>
      <input name="marketplace" value="Bankr" />
      <input name="profile_url" value="https://bankr.bot/agents/helixa" />
      <input name="title" value="Updated title" />
      <textarea name="summary">Updated summary.</textarea>
      <select name="status"><option value="stale" selected>stale</option></select>
      <input name="source_checked_at" value="" />
    </form>
  `).querySelector('form');
  const payload = compactMarketplaceConnectionPatch(new window.FormData(form), {});
  assert.equal(payload.fragment_type, undefined);
  assert.equal(payload.status, undefined);
  assert.equal(payload.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(payload.marketplace_ref.status, 'stale');
  assert.equal(Object.hasOwn(payload.marketplace_ref, 'source_checked_at'), false);
});

test('status select exposes only manager display statuses and defaults manual drafts to manager supplied', () => {
  const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [] } } }));
  const select = root.querySelector('select[name="status"]');
  const options = [...select.options].map((option) => option.value);
  assert.deepEqual(options, ['manager_supplied', 'public_import', 'pending', 'stale', 'disputed']);
  assert.equal(select.value, 'manager_supplied');
  assert.equal(options.includes('verified'), false);
  assert.equal(options.includes('platform_verified'), false);
  assert.equal(options.includes('revoked'), false);
});

test('render and bind Marketplace Connections manager dispatch create update and retire', () => {
  const fragment = {
    fragment_id: 'frag_marketplace_bankr',
    fragment_type: 'attestation',
    status: 'pending',
    visibility: 'public',
    source: { source_type: 'owner_submission', issuer: null },
    marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa', summary: 'Summary.', status: 'manager_supplied' },
  };
  const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [fragment] } } }));
  const calls = [];
  bindMarketplaceConnectionManager(root, {
    createMarketplaceConnection: (event) => calls.push(['create', event.currentTarget.dataset.action]),
    updateMarketplaceConnection: (event) => calls.push(['update', event.currentTarget.dataset.fragmentId]),
    retireMarketplaceConnection: (event) => calls.push(['retire', event.currentTarget.dataset.fragmentId]),
  });
  root.querySelector('[data-action="create-marketplace-connection"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="update-marketplace-connection"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="retire-marketplace-connection"]').click();
  assert.deepEqual(calls, [['create', 'create-marketplace-connection'], ['update', 'frag_marketplace_bankr'], ['retire', 'frag_marketplace_bankr']]);
});

test('mergeMarketplaceConnectionMutationState updates profile and fragments without touching unrelated manager state', () => {
  const current = {
    claimCsrfToken: 'csrf-1',
    walletStatus: 'connected',
    routeStatus: 'idle',
    toolStatus: 'idle',
    fragmentStatus: 'idle',
    data: {
      profile: { slug: 'helixa', display_name: 'Helixa' },
      routes: { routes: ['keep'] },
      tools: { tools: ['keep'] },
      fragments: { fragments: [] },
    },
  };
  const fragments = { fragments: [{ fragment_id: 'frag_marketplace_bankr' }] };
  const next = mergeMarketplaceConnectionMutationState(current, {
    profile: { display_name: 'Helixa', public_fragments: [{ fragment_id: 'frag_marketplace_bankr' }] },
    fragments,
  }, { marketplaceConnectionStatus: 'marketplace_connection_created' });

  assert.equal(next.claimCsrfToken, 'csrf-1');
  assert.equal(next.walletStatus, 'connected');
  assert.equal(next.routeStatus, 'idle');
  assert.equal(next.toolStatus, 'idle');
  assert.equal(next.fragmentStatus, 'idle');
  assert.equal(next.marketplaceConnectionStatus, 'marketplace_connection_created');
  assert.deepEqual(next.data.profile, { slug: 'helixa', display_name: 'Helixa', public_fragments: [{ fragment_id: 'frag_marketplace_bankr' }] });
  assert.equal(next.data.routes, current.data.routes);
  assert.equal(next.data.tools, current.data.tools);
  assert.equal(next.data.fragments, fragments);
});

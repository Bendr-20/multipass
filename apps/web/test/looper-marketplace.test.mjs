import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getApiBaseFromLocation } from '../src/api.js';
import { LOOPERS_MARKETPLACE_PATH, bindLooperMarketplace, createInitialLooperMarketplaceState, getLooperMarketplaceMetrics, getLooperMarketplaceRoute, joinLooperMarketplaceSnapshot, loadLooperMarketplaceListings, loadLooperMarketplaceSnapshot, renderLooperMarketplace, selectLooperMarketplaceItems } from '../src/looper-marketplace.js';

const CONTRACT = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OPENSEA_ROOT = 'https://opensea.io/assets/base/' + CONTRACT.toLowerCase();
const listing = (tokenId, baseUnits, amount = baseUnits, currency = 'ETH') => ({ token_id: String(tokenId), price: { currency, amount: String(amount), base_units: String(baseUnits), decimals: 18 }, item_url: OPENSEA_ROOT + '/' + tokenId });
const feed = (listings = [], overrides = {}) => ({ schema_version: '1.0.0', collection: 'loopers-639312714', contract: CONTRACT, status: 'fresh', observed_at: '2026-10-08T14:00:00.000Z', listings, ...overrides });
const activation = (...ids) => ({ status: 'available', tokenIds: new Set(ids.map(String)) });
function domRoot() { return new JSDOM('<!doctype html><main id="app"></main>').window.document.querySelector('#app'); }

function streamedJsonResponse(value, { headers = {} } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let sent = false;
  return {
    ok: true,
    headers: new Headers(headers),
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
    async text() { assert.fail('response.text() must not be called'); },
  };
}

test('recognizes exact list and canonical detail routes including a non-3802 token', () => {
  assert.equal(LOOPERS_MARKETPLACE_PATH, '/multipass/the-loop');
  assert.deepEqual(getLooperMarketplaceRoute(new URL('https://helixa.xyz/multipass/the-loop')), { kind: 'list', tokenId: null });
  assert.equal(getLooperMarketplaceRoute(new URL('https://helixa.xyz/multipass/loopers')), null);
  assert.deepEqual(getLooperMarketplaceRoute(new URL('https://helixa.xyz/multipass/the-loop/617')), { kind: 'detail', tokenId: '617' });
  for (const path of ['/multipass/the-loop/', '/multipass/the-loop/0617', '/multipass/the-loop/0', '/multipass/the-loop/7778', '/multipass/the-loop/617/more']) assert.deepEqual(getLooperMarketplaceRoute(new URL('https://helixa.xyz' + path)), { kind: 'invalid', tokenId: null });
  assert.equal(getLooperMarketplaceRoute(new URL('https://helixa.xyz/multipass/agents')), null);
});

test('loader uses exact default API boundary and injected fetch', async () => {
  assert.equal(getApiBaseFromLocation(new URL('https://helixa.xyz/multipass/the-loop')), '/multipass-api');
  const calls = [];
  const controller = new AbortController();
  const result = await loadLooperMarketplaceListings({ locationUrl: new URL('https://helixa.xyz/multipass/the-loop'), signal: controller.signal, fetchImpl: async (url, init) => { calls.push([String(url), init]); return streamedJsonResponse(feed([listing('617', '1000000000000000000', '1')])); } });
  assert.equal(calls[0][0], '/multipass-api/api/loopers/marketplace/listings');
  assert.equal(calls[0][1].method, 'GET'); assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].signal, controller.signal);
  assert.deepEqual(result.listings.map((row) => row.tokenId), ['617']);
});

test('listing loader counts hostile stream bytes, cancels over the cap, and never falls back to text', async () => {
  let cancelled = false;
  const response = {
    ok: true,
    headers: new Headers(),
    body: {
      getReader() {
        let reads = 0;
        return {
          async read() {
            reads += 1;
            return { done: false, value: new Uint8Array(reads === 1 ? 600_000 : 400_001) };
          },
          async cancel() { cancelled = true; },
        };
      },
    },
    async text() { assert.fail('response.text() must not be called'); },
  };

  await assert.rejects(
    loadLooperMarketplaceListings({ locationUrl: new URL('https://helixa.xyz/multipass/the-loop'), fetchImpl: async () => response }),
    /Marketplace listings unavailable/,
  );
  assert.equal(cancelled, true);
});

test('listing loader rejects invalid lengths and non-stream bodies without text fallback', async () => {
  for (const contentLength of ['not-a-size', '-1', '1000001']) {
    await assert.rejects(
      loadLooperMarketplaceListings({
        locationUrl: new URL('https://helixa.xyz/multipass/the-loop'),
        fetchImpl: async () => ({
          ok: true,
          headers: new Headers({ 'content-length': contentLength }),
          body: { getReader() { assert.fail('invalid declared length must be rejected before reading'); } },
          async text() { assert.fail('response.text() must not be called'); },
        }),
      }),
      /Marketplace listings unavailable/,
    );
  }

  await assert.rejects(
    loadLooperMarketplaceListings({
      locationUrl: new URL('https://helixa.xyz/multipass/the-loop'),
      fetchImpl: async () => ({ ok: true, headers: new Headers(), body: null, async text() { assert.fail('response.text() must not be called'); } }),
    }),
    /Marketplace listings unavailable/,
  );
});

test('snapshot loader composes the default listing loader with activation', async () => {
  const snapshot = await loadLooperMarketplaceSnapshot({
    locationUrl: new URL('https://helixa.xyz/multipass/the-loop'),
    activationLoader: async () => activation('617'),
    fetchImpl: async () => streamedJsonResponse(feed([listing('617', '9')])),
  });
  assert.equal(snapshot.listingsStatus, 'available');
  assert.equal(snapshot.items[0].listing?.baseUnits, '9');
});

test('snapshot timeout aborts and cancels the default listing body reader', async () => {
  let cancelled = false;
  const snapshot = await loadLooperMarketplaceSnapshot({
    locationUrl: new URL('https://helixa.xyz/multipass/the-loop'),
    timeoutMs: 5,
    activationLoader: async () => activation('617'),
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      body: {
        getReader() {
          return {
            read() { return new Promise(() => {}); },
            async cancel() { cancelled = true; },
          };
        },
      },
      async text() { assert.fail('response.text() must not be called'); },
    }),
  });
  assert.equal(cancelled, true);
  assert.equal(snapshot.activationStatus, 'available');
  assert.equal(snapshot.listingsStatus, 'unavailable');
});

test('snapshot loader bounds hanging listing reads and passes one abort signal to both sources', async () => {
  let activationSignal;
  let listingsSignal;
  const snapshot = await loadLooperMarketplaceSnapshot({
    locationUrl: new URL('https://helixa.xyz/multipass/the-loop'),
    timeoutMs: 5,
    activationLoader: async ({ signal }) => { activationSignal = signal; return activation('617'); },
    listingsLoader: ({ signal }) => { listingsSignal = signal; return new Promise(() => {}); },
  });

  assert.equal(activationSignal, listingsSignal);
  assert.equal(listingsSignal.aborted, true);
  assert.equal(snapshot.activationStatus, 'available');
  assert.equal(snapshot.listingsStatus, 'unavailable');
  assert.equal(snapshot.items[0].listing, null);
});

test('join trusts activation IDs, ignores unsafe listings, and pins URLs', () => {
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('2', '617', '3802'), listings: feed([listing('617', '25', '0.25'), listing('999', '1'), { ...listing('2', '3'), item_url: 'https://evil.example' }, { ...listing('3802', '4'), price: { ...listing('3802', '4').price, currency: '<b>ETH</b>' } }]) });
  assert.deepEqual(snapshot.items.map((x) => x.tokenId), ['2', '617', '3802']);
  assert.equal(snapshot.items[0].listing, null); assert.equal(snapshot.items[2].listing, null);
  assert.equal(snapshot.items[1].imageUrl, 'https://helixa.xyz/loopers/images/617.png');
  assert.equal(snapshot.items[1].detailHref, '/multipass/the-loop/617');
  assert.equal(snapshot.items[1].listing.itemUrl, OPENSEA_ROOT + '/617');
});

test('activation failure suppresses partial roster and listing failure cannot invent listings', async () => {
  const a = await loadLooperMarketplaceSnapshot({ locationUrl: new URL('https://helixa.xyz/multipass/the-loop'), activationLoader: async () => ({ status: 'unavailable', tokenIds: new Set(['617']) }), listingsLoader: async () => feed([listing('617', '1')]) });
  assert.equal(a.activationStatus, 'unavailable'); assert.deepEqual(a.items, []);
  const b = await loadLooperMarketplaceSnapshot({ locationUrl: new URL('https://helixa.xyz/multipass/the-loop'), activationLoader: async () => activation('617'), listingsLoader: async () => { throw new Error('private'); } });
  assert.equal(b.listingsStatus, 'unavailable'); assert.equal(b.items[0].listing, null);
});

test('filters canonical token search and sorts exact BigInt prices with token tie breaks', () => {
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('2', '10', '617', '3802'), listings: feed([listing('2', '9007199254740993123456789'), listing('10', '9'), listing('617', '9007199254740993123456789')]) });
  assert.deepEqual(selectLooperMarketplaceItems(snapshot, { view: 'listed', search: '', sort: 'price-asc' }).map(x => x.tokenId), ['10', '2', '617']);
  assert.deepEqual(selectLooperMarketplaceItems(snapshot, { view: 'listed', search: '', sort: 'price-desc' }).map(x => x.tokenId), ['2', '617', '10']);
  assert.deepEqual(selectLooperMarketplaceItems(snapshot, { view: 'all', search: '', sort: 'token-desc' }).map(x => x.tokenId), ['3802', '617', '10', '2']);
  assert.deepEqual(selectLooperMarketplaceItems(snapshot, { view: 'all', search: '617', sort: 'token-asc' }).map(x => x.tokenId), ['617']);
  assert.deepEqual(selectLooperMarketplaceItems(snapshot, { view: 'all', search: '0617', sort: 'token-asc' }), []);
});

test('metrics include counts, exact floor and freshness', () => {
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('2', '10', '617'), listings: feed([listing('2', '1000000000000000000', '1'), listing('10', '9', '0.000000000000000009')], { status: 'stale' }) });
  assert.deepEqual(getLooperMarketplaceMetrics(snapshot), { activatedCount: 3, listedActivatedCount: 2, floor: { amount: '0.000000000000000009', currency: 'ETH' }, freshnessStatus: 'stale', observedAt: '2026-10-08T14:00:00.000Z' });
});

test('unavailable listings keep activation metrics authoritative and render listing metrics unknown', () => {
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('617'), listings: null });
  assert.deepEqual(getLooperMarketplaceMetrics(snapshot), {
    activatedCount: 1, listedActivatedCount: null, floor: null, freshnessStatus: 'unavailable', observedAt: null,
  });

  const root = domRoot();
  root.innerHTML = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'list', tokenId: null }), status: 'ready', snapshot, view: 'all' });
  const metrics = Object.fromEntries([...root.querySelectorAll('.looper-marketplace-metrics > div')].map((entry) => [entry.querySelector('dt').textContent, entry.querySelector('dd').textContent]));
  assert.equal(metrics.Activated, '1');
  assert.equal(metrics['Listed activated'], 'Unavailable');
  assert.equal(metrics['Activated floor'], 'Unavailable');
});

test('renderer covers loading stale unavailable empty cards and safe links without CRED/Season', () => {
  assert.match(renderLooperMarketplace(createInitialLooperMarketplaceState({ kind: 'list', tokenId: null })), /Loading activated Loopers/);
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('617', '3802'), listings: feed([listing('617', '25', '0.25')], { status: 'stale' }) });
  const root = domRoot(); root.innerHTML = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'list', tokenId: null }), status: 'ready', snapshot, view: 'all' });
  assert.match(root.textContent, /Marketplace data is stale/); assert.match(root.textContent, /Activated2/); assert.match(root.textContent, /Listed activated1/); assert.match(root.textContent, /Not listed/);
  const image = root.querySelector('img[src="https://helixa.xyz/loopers/images/617.png"]'); assert.equal(image?.getAttribute('loading'), 'lazy'); assert.equal(image?.getAttribute('decoding'), 'async');
  assert.ok(root.querySelector('a[href="/multipass/the-loop/617"]'));
  const external = root.querySelector('a[href="' + OPENSEA_ROOT + '/617"]'); assert.equal(external?.target, '_blank'); assert.equal(external?.rel, 'noopener noreferrer');
  assert.doesNotMatch(root.textContent, /CRED|Season/iu);
  const unavailable = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'list', tokenId: null }), status: 'ready', snapshot: { activationStatus: 'unavailable', listingsStatus: 'available', items: [] } });
  assert.match(unavailable, /Activated roster unavailable/); assert.match(unavailable, /Retry/);
  const empty = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'list', tokenId: null }), status: 'ready', snapshot: joinLooperMarketplaceSnapshot({ activation: activation('617'), listings: feed([]) }) }); assert.match(empty, /No listed activated Loopers/);
});

test('detail renders non-3802 token and safe missing/invalid states', () => {
  const snapshot = joinLooperMarketplaceSnapshot({ activation: activation('617'), listings: feed([listing('617', '1')]) });
  const root = domRoot(); root.innerHTML = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'detail', tokenId: '617' }), status: 'ready', snapshot });
  assert.match(root.textContent, /Looper #617/); assert.match(root.textContent, /Activated/); assert.ok(root.querySelector('a[href="/multipass/the-loop"]')); assert.ok(root.querySelector('img[src="https://helixa.xyz/loopers/images/617.png"]'));
  assert.match(renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'detail', tokenId: '618' }), status: 'ready', snapshot }), /Looper unavailable/);
  assert.match(renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'invalid', tokenId: null }), status: 'invalid' }), /Looper route not found/);
});

test('marketplace styles provide responsive grid, touch targets, and overflow containment', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.looper-marketplace-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*240px\),\s*1fr\)\)/s);
  assert.match(css, /\.looper-marketplace-shell\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.looper-marketplace-actions a[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width:\s*680px\)/);
});

test('Retry binding calls injected handler without network', () => {
  const root = domRoot(); root.innerHTML = renderLooperMarketplace({ ...createInitialLooperMarketplaceState({ kind: 'list', tokenId: null }), status: 'ready', snapshot: { activationStatus: 'unavailable', listingsStatus: 'unavailable', items: [] } });
  let retries = 0; bindLooperMarketplace(root, { retry: () => { retries += 1; } }); root.querySelector('[data-action="retry-looper-marketplace"]').click(); assert.equal(retries, 1);
});

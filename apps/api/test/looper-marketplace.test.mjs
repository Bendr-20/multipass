import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOPERS_BASE_CONTRACT, LOOPERS_OPENSEA_SLUG, createLooperMarketplaceListingsLoader } from '../src/looper-marketplace.js';


test('exports pinned marketplace adapter', () => {
  assert.equal(LOOPERS_BASE_CONTRACT, '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a');
  assert.equal(LOOPERS_OPENSEA_SLUG, 'loopers-639312714');
  assert.equal(typeof createLooperMarketplaceListingsLoader, 'function');
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_WETH = '0x4200000000000000000000000000000000000006';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const NOW_MS = 1_760_000_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1_000);

function listing({
  tokenId = '1', baseUnits = '1000000000000000000', contract = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  chain = 'base', status = 'ACTIVE', itemType = 2, quantity = '1', paymentItemType = 0,
  paymentToken = ZERO_ADDRESS, currency = 'ETH', decimals = 18,
  startTime = String(NOW_SECONDS - 60), endTime = String(NOW_SECONDS + 60),
  consideration, priceValue = baseUnits, itemUrl = 'https://evil.example/steal',
} = {}) {
  return {
    chain, status, item_url: itemUrl,
    price: { current: { currency, decimals, value: priceValue } },
    protocol_data: { parameters: {
      startTime, endTime,
      offer: [{ itemType, token: contract, identifierOrCriteria: tokenId, startAmount: quantity, endAmount: quantity }],
      consideration: consideration ?? [{ itemType: paymentItemType, token: paymentToken, startAmount: baseUnits, endAmount: baseUnits, recipient: RECIPIENT }],
    } },
  };
}

function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function page(listings, next = null) { return { listings, next }; }

function loaderForPages(pages, options = {}) {
  let index = 0;
  const requests = [];
  const load = createLooperMarketplaceListingsLoader({
    apiKey: 'top-secret-api-key', now: () => NOW_MS,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      const current = pages[Math.min(index, pages.length - 1)];
      index += 1;
      return current instanceof Response ? current : jsonResponse(current);
    },
    ...options,
  });
  return { load, requests, calls: () => index };
}

test('normalizes listings into safe public fields and derives item URLs locally', async () => {
  const { load, requests } = loaderForPages([page([listing({ tokenId: '42', baseUnits: '1000000000000000001', currency: '<script>FAKE</script>' })])]);
  const result = await load();
  assert.deepEqual(result, {
    schema_version: '1.0.0', collection: LOOPERS_OPENSEA_SLUG, contract: LOOPERS_BASE_CONTRACT,
    status: 'fresh', observed_at: new Date(NOW_MS).toISOString(),
    listings: [{
      token_id: '42',
      price: { currency: 'ETH', amount: '1.000000000000000001', base_units: '1000000000000000001', decimals: 18 },
      item_url: 'https://opensea.io/assets/base/' + LOOPERS_BASE_CONTRACT.toLowerCase() + '/42',
    }],
  });
  assert.deepEqual(Object.keys(result), ['schema_version', 'collection', 'contract', 'status', 'observed_at', 'listings']);
  assert.deepEqual(Object.keys(result.listings[0]), ['token_id', 'price', 'item_url']);
  const url = new URL(requests[0].url);
  assert.equal(url.origin + url.pathname, 'https://api.opensea.io/api/v2/listings/collection/' + LOOPERS_OPENSEA_SLUG + '/best');
  assert.equal(url.searchParams.get('limit'), '100');
  assert.equal(requests[0].init.headers['X-API-KEY'], 'top-secret-api-key');
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});

test('accepts only exact Base contract ERC-721 quantity-one offers', async () => {
  const impostor = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94b';
  const candidates = [
    listing({ tokenId: '1', chain: 'ethereum' }), listing({ tokenId: '2', contract: impostor }),
    listing({ tokenId: '3', itemType: 3 }), listing({ tokenId: '4', quantity: '2' }), listing({ tokenId: '5' }),
  ];
  candidates[0].protocol_data.parameters.offer.push(candidates[0].protocol_data.parameters.offer[0]);
  const result = await loaderForPages([page(candidates)]).load();
  assert.deepEqual(result.listings.map(({ token_id }) => token_id), ['5']);
});

test('accepts only ACTIVE started and unexpired orders', async () => {
  const result = await loaderForPages([page([
    listing({ tokenId: '1', status: 'CANCELLED' }), listing({ tokenId: '2', startTime: String(NOW_SECONDS + 1) }),
    listing({ tokenId: '3', endTime: String(NOW_SECONDS) }),
    listing({ tokenId: '4', startTime: String(NOW_SECONDS), endTime: String(NOW_SECONDS + 1) }),
  ])]).load();
  assert.deepEqual(result.listings.map(({ token_id }) => token_id), ['4']);
});

test('derives ETH and WETH from exact item types and pinned addresses rather than symbols', async () => {
  const result = await loaderForPages([page([
    listing({ tokenId: '1', currency: 'WETH' }),
    listing({ tokenId: '2', paymentItemType: 1, paymentToken: BASE_WETH, currency: 'ETH' }),
    listing({ tokenId: '3', paymentItemType: 1, paymentToken: ZERO_ADDRESS }),
    listing({ tokenId: '4', paymentItemType: 0, paymentToken: BASE_WETH }),
    listing({ tokenId: '5', paymentItemType: 1, paymentToken: '0x2222222222222222222222222222222222222222', currency: 'WETH' }),
  ])]).load();
  assert.deepEqual(result.listings.map(({ token_id, price }) => [token_id, price.currency]), [['1', 'ETH'], ['2', 'WETH']]);
});

test('accepts dynamic-price consideration and normalizes the current buyer price', async () => {
  const result = await loaderForPages([page([listing({
    tokenId: '1',
    priceValue: '1500000000000000000',
    consideration: [{
      itemType: 0, token: ZERO_ADDRESS,
      startAmount: '2000000000000000000', endAmount: '1000000000000000000', recipient: RECIPIENT,
    }],
  })])]).load();
  assert.deepEqual(result.listings.map(({ token_id, price }) => [token_id, price.base_units, price.amount]), [
    ['1', '1500000000000000000', '1.5'],
  ]);
});

test('accepts fee-adjusted consideration and normalizes the current buyer price', async () => {
  const result = await loaderForPages([page([listing({
    tokenId: '2',
    priceValue: '1000000000000000000',
    consideration: [
      { itemType: 0, token: ZERO_ADDRESS, startAmount: '1000000000000000000', endAmount: '1000000000000000000', recipient: RECIPIENT },
      { itemType: 0, token: ZERO_ADDRESS, startAmount: '25000000000000000', endAmount: '25000000000000000', recipient: '0x2222222222222222222222222222222222222222' },
    ],
  })])]).load();
  assert.deepEqual(result.listings.map(({ token_id, price }) => [token_id, price.base_units, price.amount]), [
    ['2', '1000000000000000000', '1'],
  ]);
});

test('rejects mixed, malformed, or zero consideration', async () => {
  const part = { itemType: 0, token: ZERO_ADDRESS, startAmount: '500000000000000000', endAmount: '500000000000000000', recipient: RECIPIENT };
  const split = [part, { ...part, recipient: '0x2222222222222222222222222222222222222222' }];
  const result = await loaderForPages([page([
    listing({ tokenId: '1', consideration: [part, { ...part, itemType: 1, token: BASE_WETH }] }),
    listing({ tokenId: '2', consideration: [{ ...part, startAmount: '1e18' }] }),
    listing({ tokenId: '3', consideration: [{ ...part, endAmount: 'not-a-uint' }] }),
    listing({ tokenId: '4', consideration: [], baseUnits: '0', priceValue: '0' }),
    listing({ tokenId: '5', consideration: [{ ...part, recipient: 'bad' }], baseUnits: part.startAmount, priceValue: part.startAmount }),
    listing({ tokenId: '6', consideration: [{ ...part, startAmount: '0' }], baseUnits: part.startAmount, priceValue: part.startAmount }),
    listing({ tokenId: '7', consideration: split }),
  ])]).load();
  assert.deepEqual(result.listings.map(({ token_id }) => token_id), ['7']);
});

test('enforces token bounds and canonical identifiers', async () => {
  const result = await loaderForPages([page([
    listing({ tokenId: '0' }), listing({ tokenId: '01' }), listing({ tokenId: '7778' }),
    listing({ tokenId: '-1' }), listing({ tokenId: '7777', itemUrl: 'javascript:alert(1)' }),
  ])]).load();
  assert.deepEqual(result.listings.map(({ token_id }) => token_id), ['7777']);
  assert.equal(JSON.stringify(result).includes('javascript:'), false);
});

test('deduplicates cheapest orders and sorts exactly by BigInt price then token id', async () => {
  const huge = '900719925474099300000000000000000001';
  const cheap = '900719925474099300000000000000000000';
  const result = await loaderForPages([page([
    listing({ tokenId: '10', baseUnits: huge }), listing({ tokenId: '2', baseUnits: cheap }),
    listing({ tokenId: '10', baseUnits: cheap }), listing({ tokenId: '3', baseUnits: '1' }), listing({ tokenId: '2', baseUnits: huge }),
  ])]).load();
  assert.deepEqual(result.listings.map(({ token_id, price }) => [token_id, price.base_units]), [['3', '1'], ['2', cheap], ['10', cheap]]);
});

test('follows validated opaque cursors with bounded pagination', async () => {
  const { load, requests } = loaderForPages([page([listing({ tokenId: '2' })], 'abc_DEF-123'), page([listing({ tokenId: '1' })])]);
  const result = await load();
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.has('next'), false);
  assert.equal(new URL(requests[1].url).searchParams.get('next'), 'abc_DEF-123');
  assert.deepEqual(result.listings.map(({ token_id }) => token_id), ['1', '2']);
});

test('rejects repeated oversized malformed and over-limit cursors', async () => {
  for (const pages of [
    [page([], 'repeat'), page([], 'repeat')], [page([], 'x'.repeat(17))],
    [page([], 'bad cursor!')], [page([], 'one'), page([], 'two')],
  ]) {
    await assert.rejects(loaderForPages(pages, { maxPages: 2, maxCursorLength: 16 }).load(), /marketplace upstream unavailable/i);
  }
});

test('enforces declared actual per-page and cumulative byte bounds', async () => {
  await assert.rejects(loaderForPages([jsonResponse(page([], 'next'), { headers: { 'content-length': '9999' } })], { maxPageBytes: 128 }).load(), /upstream unavailable/i);
  await assert.rejects(loaderForPages([page([listing({ itemUrl: 'x'.repeat(500) })])], { maxPageBytes: 128 }).load(), /upstream unavailable/i);
  const first = page([], 'next'); const second = page([]);
  const total = Buffer.byteLength(JSON.stringify(first)) + Buffer.byteLength(JSON.stringify(second));
  await assert.rejects(loaderForPages([first, second], { maxPageBytes: 256, maxTotalBytes: total - 1 }).load(), /upstream unavailable/i);
});

test('rejects a hostile oversized response without calling an unbounded text fallback', async () => {
  let textCalled = false;
  const load = createLooperMarketplaceListingsLoader({
    apiKey: '***', now: () => NOW_MS, maxPageBytes: 128,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      body: null,
      async text() {
        textCalled = true;
        return 'x'.repeat(1_000_000);
      },
    }),
  });
  await assert.rejects(load(), { message: 'Looper marketplace upstream unavailable.' });
  assert.equal(textCalled, false);
});

test('aborts timed-out requests and exposes only a safe error', async () => {
  let aborted = false;
  const load = createLooperMarketplaceListingsLoader({ apiKey: 'do-not-leak', timeoutMs: 10, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('secret https://evil.example'), { name: 'AbortError' })); });
  }) });
  await assert.rejects(load(), error => error.message === 'Looper marketplace upstream unavailable.');
  assert.equal(aborted, true);
});

test('keeps the AbortController timeout active while reading the response body', async () => {
  let aborted = false;
  const load = createLooperMarketplaceListingsLoader({
    apiKey: 'test-key',
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      headers: new Headers(),
      body: {
        getReader() {
          return {
            read: () => new Promise((resolve, reject) => {
              const fallback = setTimeout(() => resolve({ done: true }), 30);
              signal.addEventListener('abort', () => {
                clearTimeout(fallback);
                aborted = true;
                reject(Object.assign(new Error('private body'), { name: 'AbortError' }));
              }, { once: true });
            }),
            cancel: async () => {},
          };
        },
      },
    }),
  });
  await assert.rejects(load(), { message: 'Looper marketplace upstream unavailable.' });
  assert.equal(aborted, true);
});

test('rejects HTTP failures and malformed top-level pages without leaking data', async () => {
  for (const response of [
    jsonResponse({ secret: 'body-secret', url: 'https://evil.example' }, { status: 500 }),
    jsonResponse([]), jsonResponse({ listings: 'bad' }), new Response('{not json', { status: 200 }),
  ]) {
    await assert.rejects(loaderForPages([response]).load(), error => error.message === 'Looper marketplace upstream unavailable.' && !/secret|evil|not json/i.test(error.message));
  }
});

test('coalesces concurrent loads and serves fresh cache within default TTL', async () => {
  let resolveFetch; let calls = 0;
  const pending = new Promise(resolve => { resolveFetch = resolve; });
  const load = createLooperMarketplaceListingsLoader({ apiKey: 'key', now: () => NOW_MS, fetchImpl: async () => { calls += 1; return pending; } });
  const first = load(); const second = load();
  assert.equal(calls, 1);
  resolveFetch(jsonResponse(page([listing()])));
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b); assert.notEqual(a, b);
  assert.equal((await load()).status, 'fresh'); assert.equal(calls, 1);
});

test('uses a valid prior snapshot as stale only inside max-stale', async () => {
  let now = NOW_MS; let fail = false; let calls = 0;
  const load = createLooperMarketplaceListingsLoader({ apiKey: 'key', now: () => now, freshTtlMs: 100, maxStaleMs: 500, fetchImpl: async () => {
    calls += 1; if (fail) throw new Error('secret'); return jsonResponse(page([listing()]));
  } });
  const fresh = await load(); fail = true; now += 101;
  const stale = await load();
  assert.equal(stale.status, 'stale'); assert.equal(stale.observed_at, fresh.observed_at); assert.deepEqual(stale.listings, fresh.listings);
  now = NOW_MS + 501;
  await assert.rejects(load(), { message: 'Looper marketplace upstream unavailable.' });
  assert.equal(calls, 3);
});

test('rejects an upstream failure when no valid snapshot exists', async () => {
  await assert.rejects(loaderForPages([jsonResponse({ leaked: 'secret' }, { status: 503 })]).load(), { message: 'Looper marketplace upstream unavailable.' });
});

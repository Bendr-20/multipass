import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBasescanTxUrl,
  buildOpenSeaItemUrl,
  canonicalSaleId,
  classifyPaymentFamily,
  isTrustedImageUrl,
  normalizeEventTimestamp,
  normalizeRestSale,
  normalizeStreamSale,
} from '../src/loopers-sales/normalize.js';

const LOOPERS = '0x1234567890abcdef1234567890abcdef12345678';
const ZERO = '0x0000000000000000000000000000000000000000';
const WETH = '0x4200000000000000000000000000000000000006';
const TX = `0x${'ab'.repeat(32)}`;
const ORDER = `0x${'cd'.repeat(32)}`;
const SELLER = `0x${'11'.repeat(20)}`;
const BUYER = `0x${'22'.repeat(20)}`;
const NOW = 1_789_777_100;
const config = { expectedContract: LOOPERS, nowSeconds: NOW };

function restSale(overrides = {}) {
  return {
    event_type: 'sale',
    chain: 'base',
    event_timestamp: 1_789_777_003,
    transaction: TX.toUpperCase().replace('0X', '0x'),
    order_hash: ORDER,
    quantity: 1,
    buyer: BUYER,
    seller: SELLER,
    payment: {
      quantity: '11500000000000000',
      decimals: 18,
      symbol: 'ETH',
      token_address: ZERO,
    },
    nft: {
      contract: LOOPERS.toUpperCase().replace('0X', '0x'),
      identifier: '6366',
      name: 'Looper #6366',
      display_image_url: 'https://i2c.seadn.io/loopers/6366.png',
    },
    ...overrides,
  };
}

function streamSale(payloadOverrides = {}, eventOverrides = {}) {
  return {
    event_type: 'item_sold',
    payload: {
      item: {
        nft_id: `base/${LOOPERS}/6366`,
        metadata: {
          name: 'Looper #6366',
          image_url: 'https://i2c.seadn.io/loopers/6366.png',
        },
      },
      transaction: { hash: TX },
      order_hash: ORDER,
      quantity: 1,
      maker: { address: SELLER },
      taker: { address: BUYER },
      payment_token: { address: ZERO, decimals: 18, symbol: 'ETH' },
      sale_price: '11500000000000000',
      event_timestamp: '2026-09-19T00:16:43.999Z',
      ...payloadOverrides,
    },
    ...eventOverrides,
  };
}

test('REST and Stream payloads normalize to one canonical sale identity', () => {
  const rest = normalizeRestSale(restSale(), config);
  const stream = normalizeStreamSale(streamSale({ order_hash: undefined }), config);

  assert.ok(rest);
  assert.ok(stream);
  assert.equal(rest.id, `${TX}:6366`);
  assert.equal(stream.id, rest.id);
  assert.equal(rest.transactionHash, TX);
  assert.equal(stream.transactionHash, TX);
  assert.equal(rest.orderHash, ORDER);
  assert.equal(stream.orderHash, null);
  assert.equal(rest.eventTimestamp, 1_789_777_003);
  assert.equal(stream.eventTimestamp, 1_789_777_003);
  assert.deepEqual(
    { ...stream, orderHash: rest.orderHash },
    rest,
  );
});

test('canonical sale IDs lowercase validated transaction hashes and normalize token IDs', () => {
  assert.equal(canonicalSaleId(TX.toUpperCase().replace('0X', '0x'), '0006366'), `${TX}:6366`);
  assert.equal(canonicalSaleId('0x1234', '6366'), null);
  assert.equal(canonicalSaleId(TX, '-1'), null);
  assert.equal(canonicalSaleId(TX, (2n ** 256n).toString()), null);
});

test('REST rejects the wrong event, chain, contract, and ERC-721 quantity', () => {
  assert.equal(normalizeRestSale(restSale({ event_type: 'transfer' }), config), null);
  assert.equal(normalizeRestSale(restSale({ chain: 'ethereum' }), config), null);
  assert.equal(normalizeRestSale(restSale({ nft: { ...restSale().nft, contract: SELLER } }), config), null);
  assert.equal(normalizeRestSale(restSale({ quantity: 2 }), config), null);
  assert.equal(normalizeRestSale(restSale({ quantity: '1' }), config), null);
});

test('Stream rejects the wrong event, chain, contract, and ERC-721 quantity', () => {
  assert.equal(normalizeStreamSale(streamSale({}, { event_type: 'item_transferred' }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ item: { ...streamSale().payload.item, nft_id: `ethereum/${LOOPERS}/6366` } }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ item: { ...streamSale().payload.item, nft_id: `base/${SELLER}/6366` } }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ quantity: 2 }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ quantity: '1' }), config), null);
});

test('normalizers reject malformed transaction/order hashes and token IDs', () => {
  assert.equal(normalizeRestSale(restSale({ transaction: '0x1234' }), config), null);
  assert.equal(normalizeRestSale(restSale({ order_hash: '0x1234' }), config), null);
  assert.equal(normalizeRestSale(restSale({ nft: { ...restSale().nft, identifier: '6.366' } }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ transaction: { hash: 'javascript:alert(1)' } }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ order_hash: '0x1234' }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ item: { ...streamSale().payload.item, nft_id: `base/${LOOPERS}/-1` } }), config), null);
});

test('normalizers reject malformed payment fields', () => {
  for (const quantity of ['0', '-1', '+1', '1.5', '1e18', '', '01', '1'.repeat(97)]) {
    assert.equal(normalizeRestSale(restSale({ payment: { ...restSale().payment, quantity } }), config), null, quantity);
  }
  for (const decimals of [-1, 1.5, 37, '18']) {
    assert.equal(normalizeStreamSale(streamSale({ payment_token: { ...streamSale().payload.payment_token, decimals } }), config), null, String(decimals));
  }
  assert.equal(normalizeRestSale(restSale({ payment: { ...restSale().payment, symbol: '' } }), config), null);
  assert.equal(normalizeRestSale(restSale({ payment: { ...restSale().payment, token_address: '0x1234' } }), config), null);
  assert.equal(normalizeStreamSale(streamSale({ sale_price: undefined }), config), null);
});

test('REST timestamps require positive integer Unix seconds', () => {
  assert.equal(normalizeEventTimestamp(1000, { source: 'rest', nowSeconds: 1300 }), 1000);
  for (const value of [1000.5, '1000', 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeEventTimestamp(value, { source: 'rest', nowSeconds: 1300 }), null, String(value));
  }
});

test('Stream timestamps require zoned RFC 3339 and floor fractional seconds', () => {
  assert.equal(normalizeEventTimestamp('2026-09-19T00:16:43.999Z', { source: 'stream', nowSeconds: NOW }), 1_789_777_003);
  assert.equal(normalizeEventTimestamp('2026-09-19T02:16:43.999+02:00', { source: 'stream', nowSeconds: NOW }), 1_789_777_003);
  for (const value of ['2026-09-19T00:16:43', '2026-09-19', '2026-02-30T00:00:00Z', '2026-09-19T00:00:00+24:00', 'not-a-date', '', -1]) {
    assert.equal(normalizeEventTimestamp(value, { source: 'stream', nowSeconds: NOW }), null, String(value));
  }
});

test('timestamp future boundary is checked after flooring to integer seconds', () => {
  assert.equal(normalizeEventTimestamp('1970-01-01T00:21:40.999Z', { source: 'stream', nowSeconds: 1000 }), 1300);
  assert.equal(normalizeEventTimestamp('1970-01-01T00:21:41.000Z', { source: 'stream', nowSeconds: 1000 }), null);
  assert.equal(normalizeEventTimestamp(1300, { source: 'rest', nowSeconds: 1000 }), 1300);
  assert.equal(normalizeEventTimestamp(1301, { source: 'rest', nowSeconds: 1000 }), null);
});

test('canonical OpenSea and Basescan links use validated components only', () => {
  assert.equal(
    buildOpenSeaItemUrl({ chain: 'base', contract: LOOPERS.toUpperCase().replace('0X', '0x'), tokenId: '0006366' }),
    `https://opensea.io/assets/base/${LOOPERS}/6366`,
  );
  assert.equal(buildBasescanTxUrl(TX.toUpperCase().replace('0X', '0x')), `https://basescan.org/tx/${TX}`);
  assert.equal(buildOpenSeaItemUrl({ chain: 'ethereum', contract: LOOPERS, tokenId: '6366' }), null);
  assert.equal(buildOpenSeaItemUrl({ chain: 'base', contract: 'not-an-address', tokenId: '6366' }), null);
  assert.equal(buildBasescanTxUrl('https://evil.example/'), null);
});

test('only exact native ETH and canonical Base WETH address-symbol pairs share base-eth family', () => {
  assert.equal(classifyPaymentFamily({ tokenAddress: ZERO, symbol: ' eth ' }), 'base-eth');
  assert.equal(classifyPaymentFamily({ tokenAddress: WETH.toUpperCase().replace('0X', '0x'), symbol: 'wEtH' }), 'base-eth');
  assert.equal(classifyPaymentFamily({ tokenAddress: ZERO, symbol: 'WETH' }), null);
  assert.equal(classifyPaymentFamily({ tokenAddress: WETH, symbol: 'ETH' }), null);
  assert.equal(classifyPaymentFamily({ tokenAddress: SELLER, symbol: 'ETH' }), null);
  assert.equal(classifyPaymentFamily({ tokenAddress: ZERO, symbol: 'ETHEREUM' }), null);
});

test('misleading ETH symbols on other token addresses remain normalized but incompatible', () => {
  const sale = normalizeRestSale(restSale({ payment: { ...restSale().payment, token_address: SELLER } }), config);
  assert.ok(sale);
  assert.equal(sale.paymentTokenAddress, SELLER);
  assert.equal(sale.paymentSymbol, 'ETH');
  assert.equal(classifyPaymentFamily({ tokenAddress: sale.paymentTokenAddress, symbol: sale.paymentSymbol }), null);
});

test('trusted image allowlist accepts only exact helixa.xyz and label-boundary seadn.io hosts', () => {
  for (const url of [
    'https://helixa.xyz/multipass/loopers-logo.png',
    'https://i2c.seadn.io/loopers/6366.png',
    'https://a.b.seadn.io/image?q=1',
  ]) assert.equal(isTrustedImageUrl(url), true, url);

  for (const url of [
    'http://i2c.seadn.io/image.png',
    'https://evilseadn.io/image.png',
    'https://seadn.io/image.png',
    'https://i2c.seadn.io./image.png',
    'https://user:pass@i2c.seadn.io/image.png',
    'https://i2c.seadn.io:444/image.png',
    'https://xn--e1afmkfd.seadn.io/image.png',
    'https://127.0.0.1/image.png',
    'https://[::1]/image.png',
    'https://images.helixa.xyz/image.png',
    'not a URL',
  ]) assert.equal(isTrustedImageUrl(url), false, url);
});

test('untrusted payload images are dropped without any local image fetch', () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('normalization must not fetch images');
  };
  try {
    const sale = normalizeRestSale(restSale({ nft: { ...restSale().nft, display_image_url: 'https://evil.example/image.png' } }), config);
    assert.ok(sale);
    assert.equal(sale.imageUrl, null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

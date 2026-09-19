import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTelegramError,
  editSaleCard,
  renderSaleCard,
  sendSaleCard,
} from '../src/loopers-sales/telegram.js';

const LOGO = 'https://helixa.xyz/multipass/loopers-logo.png';
const TX = `0x${'a'.repeat(64)}`;

function item(overrides = {}) {
  return {
    tokenId: '6366',
    tokenName: 'Looper #6366',
    imageUrl: 'https://i2c.seadn.io/loopers/6366.png',
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
    paymentQuantityRaw: '1500000000000000000',
    paymentDecimals: 18,
    paymentSymbol: 'ETH',
    paymentFamily: 'base-eth',
    openSeaUrl: 'https://opensea.io/assets/base/0x3333333333333333333333333333333333333333/6366',
    transactionUrl: `https://basescan.org/tx/${TX}`,
    ...overrides,
  };
}

function floor(value = { numerator: 1n, scale: 1n }) {
  return { value, symbol: 'ETH', paymentFamily: 'base-eth', fresh: true };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('renders normal and premium individual cards with exact money and escaped external text', () => {
  const normal = renderSaleCard({ transactionHash: TX, items: [item({
    tokenName: 'Looper <6366> & friends',
    paymentQuantityRaw: '1249999999999999999',
  })] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });

  assert.match(normal.caption, /^<b>Looper sold<\/b>/);
  assert.match(normal.caption, /Looper &lt;6366&gt; &amp; friends/);
  assert.match(normal.caption, /Price: 1\.25 ETH/);
  assert.match(normal.caption, /Floor: 1 ETH/);
  assert.match(normal.caption, /Seller: 0x1111…1111/);
  assert.match(normal.caption, /Buyer: 0x2222…2222/);
  assert.doesNotMatch(normal.caption, /ABOVE-FLOOR/);

  const premium = renderSaleCard({ transactionHash: TX, items: [item()] }, {
    floorSnapshot: floor(),
    multiplier: { numerator: 5n, denominator: 4n },
  });
  assert.match(premium.caption, /^<b>🔥 ABOVE-FLOOR LOOPER SALE 🔥<\/b>/);
  assert.match(premium.caption, /Multiplier: 1\.50× floor/);
  assert.match(premium.caption, /Above floor: 50\.0%/);
  assert.equal(premium.imageUrl, 'https://i2c.seadn.io/loopers/6366.png');
});

test('renders sorted sweep totals, repeating average, premium treatment, and original floor snapshots', () => {
  const group = {
    transactionHash: TX,
    items: [
      item({ tokenId: '10', tokenName: 'Looper #10', paymentQuantityRaw: '1', paymentDecimals: 0 }),
      item({ tokenId: '2', tokenName: 'Looper #2', paymentQuantityRaw: '1', paymentDecimals: 0 }),
      item({ tokenId: '3', tokenName: 'Looper #3', paymentQuantityRaw: '2', paymentDecimals: 0 }),
    ],
  };
  const card = renderSaleCard(group, {
    floorSnapshot: floor({ numerator: 1n, scale: 1n }),
    multiplier: { numerator: 5n, denominator: 4n },
  });

  assert.match(card.caption, /^<b>🔥 ABOVE-FLOOR LOOPER SWEEP 🔥<\/b>/);
  assert.match(card.caption, /Loopers: 3 \(#2, #3, #10\)/);
  assert.match(card.caption, /Total: 4 ETH/);
  assert.match(card.caption, /Average: 1\.33333333 ETH/);
  assert.match(card.caption, /Multiplier: 1\.33× floor/);
  assert.match(card.caption, /Above floor: 33\.3%/);

  const lateEdit = renderSaleCard({ ...group, items: [...group.items, item({ tokenId: '11', paymentQuantityRaw: '1', paymentDecimals: 0 })] }, {
    floorSnapshot: floor({ numerator: 1n, scale: 1n }),
    multiplier: { numerator: 5n, denominator: 4n },
  });
  assert.match(lateEdit.caption, /Floor: 1 ETH/);
});

test('mixed-currency sweeps keep separated totals and omit average and premium claims', () => {
  const card = renderSaleCard({ transactionHash: TX, items: [
    item({ tokenId: '1', paymentQuantityRaw: '2', paymentDecimals: 0 }),
    item({ tokenId: '2', paymentQuantityRaw: '3', paymentDecimals: 0, paymentSymbol: 'USDC', paymentFamily: null }),
  ] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });

  assert.match(card.caption, /^<b>Looper sweep<\/b>/);
  assert.match(card.caption, /Totals: 2 ETH; 3 USDC/);
  assert.doesNotMatch(card.caption, /Average:|Multiplier:|Above floor:/);
});

test('cards stay within Telegram limits and use a concise sorted token summary', () => {
  const items = Array.from({ length: 300 }, (_, index) => item({
    tokenId: String(300 - index),
    tokenName: `<Looper ${'x'.repeat(500)}>`,
  }));
  const card = renderSaleCard({ transactionHash: TX, items }, {
    floorSnapshot: floor(),
    multiplier: { numerator: 5n, denominator: 4n },
  });

  assert.ok(card.caption.length <= 1024);
  assert.ok(card.text.length <= 4096);
  assert.match(card.caption, /#1, #2, #3/);
  assert.match(card.caption, /more/);
  assert.doesNotMatch(card.caption, /<Looper/);
});

test('classifies Telegram errors without retaining secrets or raw bodies', () => {
  assert.deepEqual(classifyTelegramError({ status: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } }), {
    kind: 'retryable', retryAfterSeconds: 7,
  });
  assert.equal(classifyTelegramError({ status: 503, description: 'down' }).kind, 'retryable');
  assert.equal(classifyTelegramError({ status: 401, description: 'Unauthorized' }).kind, 'fatal');
  assert.equal(classifyTelegramError({ status: 400, description: 'Bad Request: chat not found' }).kind, 'fatal');
  assert.equal(classifyTelegramError({ status: 400, description: 'Bad Request: failed to get HTTP URL content' }).kind, 'media');
  assert.equal(classifyTelegramError({ status: 400, description: "Bad Request: can't parse entities" }).kind, 'content');
  assert.equal(classifyTelegramError({ status: 400, description: 'Bad Request: message is not modified' }).kind, 'not-modified');
  assert.equal(classifyTelegramError({ status: 400, description: 'Bad Request: message to edit not found' }).kind, 'unresolved-edit');
  assert.equal(classifyTelegramError({ status: 418, description: 'token=super-secret' }).kind, 'retryable');
});

test('send retries transient errors and falls back from remote photo to logo to text', async () => {
  const methods = [];
  const photos = [];
  let call = 0;
  const fetchImpl = async (url, options) => {
    methods.push(String(url).split('/').at(-1));
    const payload = JSON.parse(options.body);
    if (payload.photo) photos.push(payload.photo);
    call += 1;
    if (call === 1) throw new TypeError('network failed');
    if (call === 2) return jsonResponse({ ok: false, description: 'failed to get HTTP URL content' }, 400);
    if (call === 3) return jsonResponse({ ok: false, description: 'wrong file identifier/HTTP URL specified' }, 400);
    return jsonResponse({ ok: true, result: { message_id: 99 } });
  };

  const result = await sendSaleCard({
    fetchImpl,
    botToken: 'must-not-leak',
    chatId: '-1001',
    card: renderSaleCard({ transactionHash: TX, items: [item()] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } }),
  });

  assert.deepEqual(result, { messageId: 99, mode: 'text' });
  assert.deepEqual(methods, ['sendPhoto', 'sendPhoto', 'sendPhoto', 'sendMessage']);
  assert.deepEqual(photos, ['https://i2c.seadn.io/loopers/6366.png', 'https://i2c.seadn.io/loopers/6366.png', LOGO]);
});

test('known caption-content rejection retries concise HTML then falls back directly to text', async () => {
  const methods = [];
  const fetchImpl = async (url) => {
    const method = String(url).split('/').at(-1);
    methods.push(method);
    if (method === 'sendPhoto') return jsonResponse({ ok: false, description: "Bad Request: can't parse entities" }, 400);
    return jsonResponse({ ok: true, result: { message_id: 10 } });
  };
  const card = renderSaleCard({ transactionHash: TX, items: [item()] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });

  const result = await sendSaleCard({ fetchImpl, botToken: 'secret', chatId: '1', card });
  assert.deepEqual(result, { messageId: 10, mode: 'text' });
  assert.deepEqual(methods, ['sendPhoto', 'sendPhoto', 'sendMessage']);
});

test('send never submits an untrusted image URL and does no local image fetch', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return jsonResponse({ ok: true, result: { message_id: 11 } });
  };
  const card = renderSaleCard({ transactionHash: TX, items: [item({
    imageUrl: 'https://helixa.xyz.evil.example/steal.png',
  })] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });

  const result = await sendSaleCard({ fetchImpl, botToken: 'secret', chatId: '1', card });
  assert.deepEqual(result, { messageId: 11, mode: 'photo' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.telegram\.org/);
  assert.equal(calls[0].body.photo, LOGO);
});

test('send honors retry_after and returns photo delivery mode', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 0 } }, 429);
    return jsonResponse({ ok: true, result: { message_id: 12 } });
  };
  const result = await sendSaleCard({
    fetchImpl, botToken: 'secret', chatId: '1',
    card: renderSaleCard({ transactionHash: TX, items: [item()] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } }),
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { messageId: 12, mode: 'photo' });
});

test('edit uses the delivery-mode method and treats not-modified as success', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ method: String(url).split('/').at(-1), body: JSON.parse(options.body) });
    return jsonResponse({ ok: false, description: 'Bad Request: message is not modified' }, 400);
  };
  const card = renderSaleCard({ transactionHash: TX, items: [item()] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });

  assert.deepEqual(await editSaleCard({ fetchImpl, botToken: 'secret', chatId: '1', messageId: 44, mode: 'photo', card }), {
    messageId: 44, mode: 'photo',
  });
  assert.equal(calls[0].method, 'editMessageCaption');
  assert.equal(calls[0].body.message_id, 44);
});

test('edit text retries server failures and leaves non-editable messages unresolved', async () => {
  let calls = 0;
  const card = renderSaleCard({ transactionHash: TX, items: [item()] }, { floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n } });
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(String(url), /editMessageText$/);
    if (calls === 1) return jsonResponse({ ok: false, description: 'server error' }, 500);
    return jsonResponse({ ok: false, description: "Bad Request: message can't be edited" }, 400);
  };

  await assert.rejects(
    editSaleCard({ fetchImpl, botToken: 'never-print-this', chatId: '1', messageId: 45, mode: 'text', card }),
    (error) => error.classification?.kind === 'unresolved-edit' && !error.message.includes('never-print-this'),
  );
  assert.equal(calls, 2);
});

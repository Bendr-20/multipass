import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createJsonSeenStore,
  formatTelegramActivityMessage,
  normalizeReservoirSale,
  parseLoopersActivityBotOptions,
} from '../src/loopers-activity-bot.js';

test('normalizes a Reservoir sale into Loopers activity', () => {
  const sale = normalizeReservoirSale({
    id: 'sale-1',
    txHash: '0xabc',
    timestamp: 1_787_777_777,
    token: {
      contract: '0xLoopers',
      tokenId: '1010',
      name: 'Looper #1010',
      image: 'https://arweave.net/image',
    },
    from: '0x0000000000000000000000000000000000000001',
    to: '0x0000000000000000000000000000000000000002',
    orderSource: { name: 'OpenSea' },
    price: {
      amount: { native: 0.0777, usd: 233.10 },
      currency: { symbol: 'ETH' },
    },
  }, {
    expectedContract: '0xloopers',
    explorerTxBaseUrl: 'https://basescan.org/tx/',
    tokenBaseUrl: 'https://helixa.xyz/multipass/loopers/',
  });

  assert.deepEqual(sale, {
    id: 'sale-1',
    kind: 'sale',
    tokenId: '1010',
    tokenName: 'Looper #1010',
    imageUrl: 'https://arweave.net/image',
    seller: '0x0000000000000000000000000000000000000001',
    buyer: '0x0000000000000000000000000000000000000002',
    priceText: '0.0777 ETH ($233.10)',
    marketplace: 'OpenSea',
    txHash: '0xabc',
    txUrl: 'https://basescan.org/tx/0xabc',
    tokenUrl: 'https://helixa.xyz/multipass/loopers/1010',
    occurredAt: '2026-08-26T20:56:17.000Z',
  });
});

test('rejects Reservoir sales for another collection', () => {
  assert.equal(normalizeReservoirSale({
    id: 'sale-2',
    token: { contract: '0xOther', tokenId: '1' },
  }, {
    expectedContract: '0xloopers',
  }), null);
});

test('formats Telegram activity without leaking raw markup', () => {
  const message = formatTelegramActivityMessage({
    kind: 'sale',
    tokenId: '1010',
    tokenName: 'Looper #1010 <bad>',
    seller: '0x0000000000000000000000000000000000000001',
    buyer: '0x0000000000000000000000000000000000000002',
    priceText: '0.0777 ETH ($233.10)',
    marketplace: 'OpenSea',
    txUrl: 'https://basescan.org/tx/0xabc',
    tokenUrl: 'https://helixa.xyz/multipass/loopers/1010',
  });

  assert.equal(message, [
    'Looper sale',
    'Looper #1010 &lt;bad&gt;',
    'Price: 0.0777 ETH ($233.10)',
    'Marketplace: OpenSea',
    'From: 0x0000...0001',
    'To: 0x0000...0002',
    '<a href="https://helixa.xyz/multipass/loopers/1010">View Looper</a> | <a href="https://basescan.org/tx/0xabc">Tx</a>',
  ].join('\n'));
});

test('json seen store dedupes posted sales across runs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loopers-activity-bot-'));
  const statePath = path.join(dir, 'seen.json');
  try {
    const first = await createJsonSeenStore({ statePath });
    assert.equal(first.has('sale-1'), false);
    first.mark('sale-1');
    await first.save();

    const second = await createJsonSeenStore({ statePath });
    assert.equal(second.has('sale-1'), true);
    assert.equal(second.has('sale-2'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parses Telegram activity bot env without requiring secrets in code', () => {
  const options = parseLoopersActivityBotOptions([], {
    LOOPERS_ACTIVITY_CONTRACT: '0x1234567890123456789012345678901234567890',
    LOOPERS_ACTIVITY_TELEGRAM_CHAT_ID: '-100123',
    LOOPERS_ACTIVITY_TELEGRAM_BOT_TOKEN: 'masked-token',
    LOOPERS_ACTIVITY_STATE_PATH: '/tmp/loopers-seen.json',
  });

  assert.equal(options.contract, '0x1234567890123456789012345678901234567890');
  assert.equal(options.telegramChatId, '-100123');
  assert.equal(options.telegramBotToken, 'masked-token');
  assert.equal(options.statePath, '/tmp/loopers-seen.json');
  assert.equal(options.reservoirApiBaseUrl, 'https://api-base.reservoir.tools');
  assert.equal(options.pollIntervalMs, 60_000);
});

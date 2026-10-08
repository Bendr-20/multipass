import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, padHex, toHex } from 'viem';

import {
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC6551_REGISTRY,
  LOOPERS_COLLECTION,
  RELEASED_ACCOUNT_IMPLEMENTATION,
  deriveLooperAccount,
} from '../src/looper-agent-wallet.js';
import {
  LAST_LOOPER_STORAGE_KEY,
  compareLooperTokenIds,
  loadReleasedLooperTokenIds,
  normalizeConsoleWalletKey,
  normalizeLooperTokenId,
  readLastLooperForWallet,
  resolveDefaultLooperTokenId,
  writeLastLooperForWallet,
} from '../src/console-looper-selection.js';

const ACCOUNT_CREATED_TOPIC = '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722';
const DEPLOYMENT_BLOCK = 51_658_273;

const WALLET_A = '0x1234567890abcdef1234567890abcdef12345678';
const WALLET_B = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump(key) { return values.get(key); },
  };
}

function eventRow({
  tokenId = '270',
  blockNumber = DEPLOYMENT_BLOCK + 100,
  index = 1,
  implementation = RELEASED_ACCOUNT_IMPLEMENTATION,
  collection = LOOPERS_COLLECTION,
  salt = ACCOUNT_SALT,
  chainId = BASE_CHAIN_ID,
  account = deriveLooperAccount({ implementation: RELEASED_ACCOUNT_IMPLEMENTATION, tokenId }),
  transactionHash = `0x${'ab'.repeat(31)}${Number(tokenId).toString(16).padStart(2, '0').slice(-2)}`,
} = {}) {
  return {
    address: { hash: ERC6551_REGISTRY },
    block_number: blockNumber,
    index,
    transaction_hash: transactionHash,
    topics: [
      ACCOUNT_CREATED_TOPIC,
      padHex(implementation, { size: 32 }),
      padHex(collection, { size: 32 }),
      padHex(toHex(BigInt(tokenId)), { size: 32 }),
    ],
    data: encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }],
      [account, salt, BigInt(chainId)],
    ),
  };
}

function jsonResponse(value, { status = 200 } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let sent = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
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

test('Console Looper values use strict canonical wallet and token forms', () => {
  assert.equal(normalizeConsoleWalletKey(WALLET_A.toUpperCase().replace('0X', '0x')), WALLET_A);
  assert.equal(normalizeConsoleWalletKey(' 0x1234 '), null);
  assert.equal(normalizeConsoleWalletKey('not-a-wallet'), null);
  assert.equal(normalizeLooperTokenId('1'), '1');
  assert.equal(normalizeLooperTokenId('3802'), '3802');
  assert.equal(normalizeLooperTokenId('003'), null);
  assert.equal(normalizeLooperTokenId('0'), null);
  assert.equal(normalizeLooperTokenId('7778'), null);
  assert.equal(normalizeLooperTokenId('1e3'), null);
  assert.equal(compareLooperTokenIds('2', '10'), -1);
  assert.equal(compareLooperTokenIds('10', '2'), 1);
  assert.equal(compareLooperTokenIds('10', '10'), 0);
});

test('default selection uses canonical token order and last then activated then first priority', () => {
  const agents = [{ tokenId: '612' }, { tokenId: '10' }, { tokenId: '270' }];
  assert.equal(resolveDefaultLooperTokenId({
    agents,
    rememberedTokenId: '612',
    activatedTokenIds: new Set(['270']),
    activationStatus: 'available',
  }), '612');
  assert.equal(resolveDefaultLooperTokenId({
    agents,
    rememberedTokenId: '999',
    activatedTokenIds: new Set(['270', '612']),
    activationStatus: 'available',
  }), '270');
  assert.equal(resolveDefaultLooperTokenId({
    agents,
    activatedTokenIds: new Set(),
    activationStatus: 'unavailable',
  }), '10');
  assert.equal(resolveDefaultLooperTokenId({ agents: [] }), null);
  assert.deepEqual(agents.map((agent) => agent.tokenId), ['612', '10', '270']);
});

test('last-used store is versioned, wallet-scoped, and preserves other wallet entries', () => {
  const storage = memoryStorage();
  assert.equal(readLastLooperForWallet({ storage, wallet: WALLET_A }), null);
  assert.equal(writeLastLooperForWallet({ storage, wallet: WALLET_A, tokenId: '270' }), true);
  assert.equal(writeLastLooperForWallet({ storage, wallet: WALLET_B, tokenId: '612' }), true);
  assert.equal(readLastLooperForWallet({ storage, wallet: WALLET_A.toUpperCase().replace('0X', '0x') }), '270');
  assert.equal(readLastLooperForWallet({ storage, wallet: WALLET_B }), '612');
  assert.deepEqual(JSON.parse(storage.dump(LAST_LOOPER_STORAGE_KEY)), {
    schemaVersion: 1,
    selections: {
      [WALLET_A]: '270',
      [WALLET_B]: '612',
    },
  });
});

test('last-used store fails closed on corrupt schemas, invalid values, and unavailable storage', () => {
  for (const raw of [
    'not json',
    JSON.stringify([]),
    JSON.stringify({ schemaVersion: 2, selections: { [WALLET_A]: '270' } }),
    JSON.stringify({ schemaVersion: 1, selections: { [WALLET_A]: '0270' } }),
  ]) {
    const storage = memoryStorage({ [LAST_LOOPER_STORAGE_KEY]: raw });
    assert.equal(readLastLooperForWallet({ storage, wallet: WALLET_A }), null);
  }

  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.equal(readLastLooperForWallet({ storage: throwing, wallet: WALLET_A }), null);
  assert.equal(writeLastLooperForWallet({ storage: throwing, wallet: WALLET_A, tokenId: '270' }), false);
  assert.equal(writeLastLooperForWallet({ storage: memoryStorage(), wallet: WALLET_A, tokenId: '0270' }), false);
  assert.equal(writeLastLooperForWallet({ storage: memoryStorage(), wallet: '0x1234', tokenId: '270' }), false);
});

test('released wallet discovery follows bounded V2 cursors and skips unrelated registry events', async () => {
  const calls = [];
  const unrelated = eventRow({
    tokenId: '999',
    blockNumber: DEPLOYMENT_BLOCK + 90,
    index: 2,
    implementation: '0x1111111111111111111111111111111111111111',
    collection: '0x2222222222222222222222222222222222222222',
    account: '0x3333333333333333333333333333333333333333',
  });
  const pages = [
    {
      items: [eventRow({ tokenId: '612', blockNumber: DEPLOYMENT_BLOCK + 100, index: 3 }), unrelated],
      next_page_params: { block_number: DEPLOYMENT_BLOCK + 90, index: 2, items_count: 2, topic: ACCOUNT_CREATED_TOPIC },
    },
    {
      items: [eventRow({ tokenId: '270', blockNumber: DEPLOYMENT_BLOCK + 50, index: 1 }), eventRow({ tokenId: '1', blockNumber: DEPLOYMENT_BLOCK - 1, index: 0 })],
      next_page_params: { block_number: DEPLOYMENT_BLOCK - 1, index: 0, items_count: 2, topic: ACCOUNT_CREATED_TOPIC },
    },
  ];
  const result = await loadReleasedLooperTokenIds({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse(pages[calls.length - 1]);
    },
  });

  assert.equal(result.status, 'available');
  assert.deepEqual([...result.tokenIds].sort(compareLooperTokenIds), ['270', '612']);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, new RegExp(`/api/v2/addresses/${ERC6551_REGISTRY}/logs\\?topic=${ACCOUNT_CREATED_TOPIC}`, 'i'));
  assert.match(calls[1].url, /block_number=.*&index=.*&items_count=.*&topic=/);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers.accept, 'application/json');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('released wallet discovery rejects matching malformed rows without returning a partial set', async () => {
  const valid = eventRow({ tokenId: '270', blockNumber: DEPLOYMENT_BLOCK + 100, index: 2 });
  const invalid = eventRow({ tokenId: '612', blockNumber: DEPLOYMENT_BLOCK + 90, index: 1, chainId: 1 });
  const result = await loadReleasedLooperTokenIds({
    fetchImpl: async () => jsonResponse({ items: [valid, invalid], next_page_params: null }),
  });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual([...result.tokenIds], []);
});

test('released wallet discovery rejects malformed page and cursor contracts', async () => {
  const malformedPages = [
    { items: [], next_page_params: null, extra: true },
    { items: Array.from({ length: 51 }, (_, index) => eventRow({ tokenId: String(index + 1), blockNumber: DEPLOYMENT_BLOCK + 100 - index, index })), next_page_params: null },
    { items: [eventRow()], next_page_params: { block_number: String(DEPLOYMENT_BLOCK), index: 1, items_count: 1, topic: ACCOUNT_CREATED_TOPIC } },
    { items: [eventRow({ blockNumber: DEPLOYMENT_BLOCK + 10, index: 1 }), eventRow({ tokenId: '612', blockNumber: DEPLOYMENT_BLOCK + 11, index: 2 })], next_page_params: null },
  ];
  for (const page of malformedPages) {
    const result = await loadReleasedLooperTokenIds({ fetchImpl: async () => jsonResponse(page) });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual([...result.tokenIds], []);
  }
});

test('released wallet discovery enforces byte, page, timeout, and cancellation bounds', async () => {
  let cancelled = false;
  let result = await loadReleasedLooperTokenIds({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: {
        getReader() {
          let reads = 0;
          return {
            async read() {
              reads += 1;
              return { done: false, value: new Uint8Array(reads === 1 ? 60 : 41) };
            },
            async cancel() { cancelled = true; },
          };
        },
      },
      async text() { assert.fail('response.text() must not be called'); },
    }),
    maxPageBytes: 100,
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(cancelled, true);

  let calls = 0;
  result = await loadReleasedLooperTokenIds({
    maxPages: 2,
    fetchImpl: async () => {
      calls += 1;
      const block = DEPLOYMENT_BLOCK + 100 - calls;
      return jsonResponse({
        items: [eventRow({ tokenId: String(calls), blockNumber: block, index: 1 })],
        next_page_params: { block_number: block, index: 1, items_count: 1, topic: ACCOUNT_CREATED_TOPIC },
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.status, 'unavailable');

  const controller = new AbortController();
  controller.abort();
  result = await loadReleasedLooperTokenIds({ fetchImpl: async () => assert.fail('fetch must not run'), signal: controller.signal });
  assert.equal(result.status, 'unavailable');
});

test('released wallet discovery rejects invalid lengths and non-stream bodies without text fallback', async () => {
  for (const contentLength of ['not-a-size', '-1', '1048577']) {
    const result = await loadReleasedLooperTokenIds({
      fetchImpl: async () => ({
        ok: true,
        headers: new Headers({ 'content-length': contentLength }),
        body: { getReader() { assert.fail('invalid declared length must be rejected before reading'); } },
        async text() { assert.fail('response.text() must not be called'); },
      }),
    });
    assert.equal(result.status, 'unavailable');
  }

  const result = await loadReleasedLooperTokenIds({
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      body: null,
      async text() { assert.fail('response.text() must not be called'); },
    }),
  });
  assert.equal(result.status, 'unavailable');
});

test('released wallet discovery cancels a body read when its timeout aborts', async () => {
  let cancelled = false;
  const result = await loadReleasedLooperTokenIds({
    timeoutMs: 5,
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
  assert.equal(result.status, 'unavailable');
  assert.equal(cancelled, true);
});

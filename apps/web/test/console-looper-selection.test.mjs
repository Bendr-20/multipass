import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAST_LOOPER_STORAGE_KEY,
  compareLooperTokenIds,
  normalizeConsoleWalletKey,
  normalizeLooperTokenId,
  readLastLooperForWallet,
  resolveDefaultLooperTokenId,
  writeLastLooperForWallet,
} from '../src/console-looper-selection.js';

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

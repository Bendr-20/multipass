import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInjectedWalletClient,
  createLegacyWalletClient,
  getWalletErrorMessage,
  shortenAddress,
} from '../src/wallet-client.js';

test('shortenAddress returns compact EVM display label', () => {
  assert.equal(shortenAddress('0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea'), '0x27E3...91Ea');
  assert.equal(shortenAddress(null), null);
});

test('createLegacyWalletClient wraps wallet signer callback', async () => {
  const calls = [];
  const client = createLegacyWalletClient(async (message) => {
    calls.push(message);
    return { wallet: '0xwallet', signature: '0xsig' };
  });

  assert.deepEqual(client.getSnapshot(), {
    ready: true,
    configured: true,
    connected: true,
    address: null,
    label: null,
    connectLabel: 'Sign owner claim',
  });
  assert.equal(typeof client.subscribe(() => {}), 'function');
  await client.connect();
  assert.deepEqual(await client.signMessage('hello'), { wallet: '0xwallet', signature: '0xsig' });
  assert.deepEqual(calls, ['hello']);
});

test('createInjectedWalletClient requests accounts before personal_sign and stores wallet label', async () => {
  const wallet = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  const calls = [];
  const client = createInjectedWalletClient({
    getWindow: () => ({
      ethereum: {
        request: async (payload) => {
          calls.push(payload);
          if (payload.method === 'eth_requestAccounts') return [wallet];
          if (payload.method === 'personal_sign') return '0xsig';
          throw new Error(`Unexpected method ${payload.method}`);
        },
      },
    }),
  });

  assert.equal(client.getSnapshot().connected, false);
  assert.deepEqual(await client.signMessage('hello'), { wallet, signature: '0xsig' });
  assert.deepEqual(calls, [
    { method: 'eth_requestAccounts' },
    { method: 'personal_sign', params: ['hello', wallet] },
  ]);
  assert.deepEqual(client.getSnapshot(), {
    ready: true,
    configured: true,
    connected: true,
    address: wallet,
    label: '0x27E3...91Ea',
    connectLabel: 'Sign owner claim',
  });
});

test('getWalletErrorMessage normalizes cancellation and preserves normal errors', () => {
  assert.equal(getWalletErrorMessage({ code: 4001 }), 'Wallet signature cancelled. Nothing was changed.');
  assert.equal(getWalletErrorMessage(new Error('User rejected the request')), 'Wallet signature cancelled. Nothing was changed.');
  assert.equal(getWalletErrorMessage(new Error('no personal_sign support')), 'no personal_sign support');
});

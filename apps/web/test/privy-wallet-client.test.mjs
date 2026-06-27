import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPrivyConnectAction,
  createPrivyWalletClient,
  selectEvmWallet,
} from '../src/privy-wallet-client.js';

function wallet({ address, connectedAt, provider = { request: async () => '0xsig' } } = {}) {
  return {
    address,
    connectedAt,
    getEthereumProvider: provider === null ? undefined : async () => provider,
  };
}

test('selectEvmWallet prefers wallets with EVM provider and address', () => {
  const evmWallet = wallet({ address: '0xevm', connectedAt: 1 });
  assert.equal(selectEvmWallet([
    { address: '0xno-provider' },
    wallet({ address: null, connectedAt: 3 }),
    evmWallet,
  ]), evmWallet);
});

test('selectEvmWallet prefers the most recently connected EVM wallet', () => {
  const earlier = wallet({ address: '0xearlier', connectedAt: 100 });
  const latest = wallet({ address: '0xlatest', connectedAt: 300 });
  const missingTimestamp = wallet({ address: '0xmissing' });

  assert.equal(selectEvmWallet([latest, missingTimestamp, earlier]), latest);
});

test('createPrivyWalletClient publishes snapshot updates to subscribers and labels addresses', () => {
  const client = createPrivyWalletClient();
  const snapshots = [];
  const unsubscribe = client.subscribe(() => snapshots.push(client.getSnapshot()));

  client.setSnapshot({
    ready: true,
    configured: true,
    connected: true,
    address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
  });
  unsubscribe();
  client.setSnapshot({ connected: false, address: null });

  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], {
    ready: true,
    configured: true,
    connected: true,
    address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    label: '0x27E3...91Ea',
    connectLabel: 'Sign owner claim',
  });
});

test('createPrivyWalletClient delegates connect and signMessage actions', async () => {
  const calls = [];
  const client = createPrivyWalletClient();
  client.setActions({
    connect: async () => calls.push(['connect']),
    signMessage: async (message) => {
      calls.push(['signMessage', message]);
      return { wallet: '0xwallet', signature: '0xsig' };
    },
  });

  await client.connect();
  assert.deepEqual(await client.signMessage('hello'), { wallet: '0xwallet', signature: '0xsig' });
  assert.deepEqual(calls, [['connect'], ['signMessage', 'hello']]);
});

test('createPrivyConnectAction opens Privy with Multipass prompt and explicit timeout', async () => {
  const calls = [];
  const action = createPrivyConnectAction({
    configured: true,
    connectWallet: (options) => calls.push(['connectWallet', options]),
    client: {
      waitForConnection: async (options) => {
        calls.push(['waitForConnection', options]);
        return '0xwallet';
      },
    },
  });

  assert.equal(await action(), '0xwallet');
  assert.deepEqual(calls, [
    ['connectWallet', {
      walletChainType: 'ethereum-only',
      description: 'Connect the wallet that manages this Multipass public profile.',
    }],
    ['waitForConnection', { timeoutMs: 15000 }],
  ]);
});

test('createPrivyConnectAction propagates modal rejection without waiting for wallet state', async () => {
  const calls = [];
  const modalError = new Error('wallet modal cancelled');
  const modalRejection = Promise.reject(modalError);
  modalRejection.catch(() => {});
  const action = createPrivyConnectAction({
    configured: true,
    connectWallet: (options) => {
      calls.push(['connectWallet', options]);
      return modalRejection;
    },
    client: {
      waitForConnection: async (options) => {
        calls.push(['waitForConnection', options]);
        throw new Error('should not wait');
      },
    },
  });

  await assert.rejects(action(), modalError);
  assert.deepEqual(calls, [[
    'connectWallet',
    {
      walletChainType: 'ethereum-only',
      description: 'Connect the wallet that manages this Multipass public profile.',
    },
  ]]);
});

test('waitForConnection resolves the connected address string', async () => {
  const client = createPrivyWalletClient();
  const connected = client.waitForConnection({ timeoutMs: 100 });
  const address = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

  queueMicrotask(() => client.setSnapshot({
    ready: true,
    configured: true,
    connected: true,
    address,
  }));

  assert.equal(await connected, address);
});

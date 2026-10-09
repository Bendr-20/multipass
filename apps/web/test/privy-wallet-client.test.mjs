import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PRIVY_BASE_ACCOUNT_WALLET_ID,
  createPrivyConnectAction,
  createPrivyConnectionError,
  selectBaseAccountIdentityAddress,
  createPrivyWalletClient,
  createPrivySignMessageAction,
  createPrivyRequestAction,
  createPrivySendTransactionAction,
  classifyPrivyWalletProfile,
  getAddressFromPrivyConnectResult,
  isPrivyWalletUsableInBrowser,
  prepareWalletSigningProvider,
  PRIVY_CONNECT_WALLET_LIST,
  PRIVY_EXTERNAL_WALLET_CONFIG,
  selectConnectedWalletAddress,
  selectEvmWallet,
  submitPrivyLooperTransaction,
} from '../src/privy-wallet-client.js';

function wallet({ address, connectedAt, provider = { request: async () => '0xsig' } } = {}) {
  return {
    address,
    connectedAt,
    getEthereumProvider: provider === null ? undefined : async () => provider,
  };
}

test('mobile OKX stays on WalletConnect so Safari retains the signing provider', async () => {
  assert.equal(PRIVY_CONNECT_WALLET_LIST.includes('okx_wallet'), false);
  assert.notEqual(PRIVY_CONNECT_WALLET_LIST.indexOf('wallet_connect'), -1);

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies['@privy-io/react-auth'], '3.37.0');
});

test('mobile Safari rejects stale injected OKX state but accepts OKX WalletConnect and the OKX in-app browser', () => {
  const safariEnvironment = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6.1 Mobile/15E148 Safari/604.1',
    okxInjected: false,
  };
  assert.equal(isPrivyWalletUsableInBrowser({ walletClientType: 'okx_wallet', connectorType: 'injected' }, safariEnvironment), false);
  assert.equal(isPrivyWalletUsableInBrowser({ walletClientType: 'okx_wallet', connectorType: 'wallet_connect' }, safariEnvironment), true);
  assert.equal(isPrivyWalletUsableInBrowser({ walletClientType: 'okx_wallet', connectorType: 'injected' }, {
    userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 OKEx/6.191.0',
    okxInjected: true,
  }), true);
});

test('Base Account signing preparation bypasses the deferred Privy proxy provider', () => {
  const calls = [];
  const provider = { request: async () => '0xbase-signature' };
  const baseAccount = {
    address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
    getEthereumProvider() {
      calls.push('privy-proxy');
      return Promise.resolve({ request: async () => '0xproxy-signature' });
    },
  };
  const baseAccountSdk = {
    getProvider() {
      calls.push('base-provider');
      return provider;
    },
  };

  assert.equal(prepareWalletSigningProvider(baseAccount, { baseAccountSdk }), provider);
  assert.deepEqual(calls, ['base-provider']);
});

test('prepared Base Account signer starts personal_sign synchronously inside the user click', async () => {
  const calls = [];
  let finishSignature;
  const signatureResult = new Promise((resolve) => { finishSignature = resolve; });
  const provider = {
    request(payload) {
      calls.push(payload);
      return signatureResult;
    },
  };
  const baseAccount = {
    address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
    async getEthereumProvider() {
      throw new Error('signing must use the provider prepared before the click');
    },
  };
  const client = createPrivyWalletClient();
  client.setSignableWallet(baseAccount);
  client.setPreparedSigningProvider(baseAccount, provider);
  const signMessage = createPrivySignMessageAction({ client });

  const pending = signMessage('Prepared Base Account challenge');

  assert.deepEqual(calls, [{
    method: 'personal_sign',
    params: ['0x50726570617265642042617365204163636f756e74206368616c6c656e6765', baseAccount.address],
  }]);
  finishSignature('0xbase-signature');
  assert.deepEqual(await pending, { wallet: baseAccount.address, signature: '0xbase-signature' });
});

test('prepared Base Account provider handles Looper transaction and chain requests without the stale proxy', async () => {
  const calls = [];
  const address = '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea';
  const hash = '0x' + 'ab'.repeat(32);
  const baseAccount = {
    address,
    walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
    async getEthereumProvider() {
      throw new Error('Base Account transaction must use the prepared SDK provider');
    },
  };
  const provider = {
    async request(payload) {
      calls.push(payload);
      return payload.method === 'eth_sendTransaction' ? hash : '0x2105';
    },
  };
  const client = createPrivyWalletClient();
  client.setSignableWallet(baseAccount);
  client.setPreparedSigningProvider(baseAccount, provider);
  const transaction = {
    chainId: '0x2105', from: address, to: '0x9999999999999999999999999999999999999999', value: '0x0', data: '0x1234',
  };

  const chainRequest = createPrivyRequestAction({ client })({ method: 'eth_chainId' });
  assert.equal(calls.length, 1);
  assert.equal(await chainRequest, '0x2105');
  const transactionRequest = createPrivySendTransactionAction({ client })(transaction);
  assert.equal(calls.length, 2);
  assert.equal(await transactionRequest, hash);
  assert.deepEqual(calls, [
    { method: 'eth_chainId' },
    { method: 'eth_sendTransaction', params: [transaction] },
  ]);
});
test('final transaction tap rejects synchronously when no prepared provider exists', () => {
  let waited = false;
  const client = {
    getPreparedSigningProvider: () => null,
    waitForPreparedSigningProvider: () => { waited = true; return Promise.resolve(null); },
  };
  assert.throws(() => createPrivySendTransactionAction({ client })({}), /provider is not ready/i);
  assert.equal(waited, false);
});
test('Privy wallet profile identifies Base Account and smart-wallet metadata without deciding onchain readiness', () => {
  assert.deepEqual(classifyPrivyWalletProfile({ walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID }), {
    kind: 'smart_or_delegated',
    walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
  });
  assert.deepEqual(classifyPrivyWalletProfile({ walletClientType: 'metamask' }), {
    kind: 'eoa_candidate',
    walletClientType: 'metamask',
  });
  assert.deepEqual(classifyPrivyWalletProfile(null), { kind: 'unknown', walletClientType: null });
});

test('canonical Base Account signer reaches the exact Looper transaction submission boundary', async () => {
  const calls = [];
  const address = '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea';
  const hash = `0x${'aa'.repeat(32)}`;
  const baseAccount = {
    address,
    walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
    async getEthereumProvider() {
      return { async request(payload) { calls.push(payload); return hash; } };
    },
  };
  const transaction = {
    chainId: '0x2105',
    from: address,
    to: '0x9999999999999999999999999999999999999999',
    value: '0x0',
    data: '0x1234',
  };
  assert.equal(await submitPrivyLooperTransaction(baseAccount, transaction), hash);
  assert.deepEqual(calls, [{ method: 'eth_sendTransaction', params: [transaction] }]);
});

test('named Looper transaction action forwards only eth_sendTransaction payloads', async () => {
  const client = createPrivyWalletClient();
  const calls = [];
  client.setActions({ sendTransaction: async (transaction) => {
    calls.push(transaction);
    return '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  } });
  const transaction = { chainId: '0x2105', from: '0x1', to: '0x2', value: '0x0', data: '0x1234' };
  assert.match(await client.sendTransaction(transaction), /^0x[a-f0-9]{64}$/);
  assert.deepEqual(calls, [transaction]);
});

test('selectEvmWallet prefers wallets with EVM provider and address', () => {
  const evmWallet = wallet({ address: '0xevm', connectedAt: 1 });
  assert.equal(selectEvmWallet([
    { address: '0xno-provider' },
    wallet({ address: null, connectedAt: 3 }),
    evmWallet,
  ]), evmWallet);
});

test('selectEvmWallet skips stale injected OKX state in mobile Safari', () => {
  const staleInjected = wallet({ address: '0xstale', connectedAt: 300 });
  staleInjected.walletClientType = 'okx_wallet';
  staleInjected.connectorType = 'injected';
  const walletConnect = wallet({ address: '0xwalletconnect', connectedAt: 100 });
  walletConnect.walletClientType = 'okx_wallet';
  walletConnect.connectorType = 'wallet_connect';

  assert.equal(selectEvmWallet([staleInjected, walletConnect], {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Version/26.6.1 Mobile/15E148 Safari/604.1',
    okxInjected: false,
  }), walletConnect);
});

test('selectEvmWallet prefers the most recently connected EVM wallet', () => {
  const earlier = wallet({ address: '0xearlier', connectedAt: 100 });
  const latest = wallet({ address: '0xlatest', connectedAt: 300 });
  const missingTimestamp = wallet({ address: '0xmissing' });

  assert.equal(selectEvmWallet([latest, missingTimestamp, earlier]), latest);
});

test('selectConnectedWalletAddress rejects address-only and linked identity records without a live provider', () => {
  const smartWallet = { address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', connectedAt: 400 };
  const user = {
    linkedAccounts: [
      { type: 'email', address: 'not-a-wallet' },
      { type: 'wallet', address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' },
    ],
  };

  assert.equal(selectConnectedWalletAddress([smartWallet], user), null);
});

test('Base Account identity selects the dedicated connector without pretending it is connected', () => {
  assert.equal(selectBaseAccountIdentityAddress([], {
    linkedAccounts: [{
      type: 'wallet',
      walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
      address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    }],
  }), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal(selectConnectedWalletAddress([], {
    linkedAccounts: [{
      type: 'wallet',
      walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
      address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    }],
  }), null);
});

test('getAddressFromPrivyConnectResult extracts smart wallet addresses from modal results', () => {
  assert.equal(getAddressFromPrivyConnectResult({
    wallet: { address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' },
  }), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
});

test('getAddressFromPrivyConnectResult accepts Base Account smart wallet result shapes', () => {
  assert.equal(getAddressFromPrivyConnectResult({
    baseAccount: { address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' },
  }), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');

  assert.equal(getAddressFromPrivyConnectResult({
    user: {
      linkedAccounts: [
        { type: 'email', address: 'not-a-wallet' },
        {
          type: 'wallet',
          walletClientType: PRIVY_BASE_ACCOUNT_WALLET_ID,
          smartWallet: { address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' },
        },
      ],
    },
  }), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
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

test('createPrivyWalletClient starts configured while Privy is still loading', () => {
  const client = createPrivyWalletClient();

  assert.deepEqual(client.getSnapshot(), {
    ready: false,
    configured: true,
    connected: false,
    address: null,
    label: null,
    connectLabel: 'Loading wallet options...',
  });
});

test('createPrivyWalletClient delegates connect disconnect and signMessage actions', async () => {
  const calls = [];
  const client = createPrivyWalletClient();
  client.setActions({
    connect: async () => calls.push(['connect']),
    disconnect: async () => calls.push(['disconnect']),
    signMessage: async (message) => {
      calls.push(['signMessage', message]);
      return { wallet: '0xwallet', signature: '0xsig' };
    },
  });

  await client.connect();
  await client.disconnect();
  assert.deepEqual(await client.signMessage('hello'), { wallet: '0xwallet', signature: '0xsig' });
  assert.deepEqual(calls, [['connect'], ['disconnect'], ['signMessage', 'hello']]);
});

test('Privy connect wallet list puts the Coinbase app connector before popup-based Base Account', () => {
  assert.deepEqual(PRIVY_CONNECT_WALLET_LIST, [
    'coinbase_wallet',
    PRIVY_BASE_ACCOUNT_WALLET_ID,
    'metamask',
    'detected_ethereum_wallets',
    'rainbow',
    'wallet_connect',
    'wallet_connect_qr',
  ]);
  assert.equal(PRIVY_CONNECT_WALLET_LIST[0], 'coinbase_wallet');
  assert.equal(PRIVY_CONNECT_WALLET_LIST.includes('base_account'), true);
  assert.equal(PRIVY_CONNECT_WALLET_LIST.includes('coinbase_wallet'), true);
  assert.equal(PRIVY_CONNECT_WALLET_LIST.includes('detected_ethereum_wallets'), true);
});

test('Privy keeps Coinbase Wallet app-only while Base Account owns the smart-wallet popup path', () => {
  assert.deepEqual(PRIVY_EXTERNAL_WALLET_CONFIG, {
    coinbaseWallet: {
      config: {
        appName: 'Helixa',
        appLogoUrl: 'https://helixa.xyz/multipass/helixa-logo.png',
        appChainIds: [8453, 84532],
        preference: { options: 'eoaOnly' },
      },
    },
    baseAccount: {
      config: {
        appName: 'Helixa',
        appLogoUrl: 'https://helixa.xyz/multipass/helixa-logo.png',
        appChainIds: [8453, 84532],
      },
    },
  });
});

test('createPrivyConnectAction authorizes Base Account before waiting for its live wallet', async () => {
  const calls = [];
  const action = createPrivyConnectAction({
    configured: true,
    preferBaseAccount: true,
    connectWallet: () => calls.push(['modal']),
    connectBaseAccount: () => calls.push(['base']),
    client: {
      clearConnectionError() {},
      waitForConnection: async (options) => {
        calls.push(['wait', options]);
        return '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
      },
    },
  });

  assert.equal(await action(), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.deepEqual(calls, [['base'], ['wait', { timeoutMs: 45000 }]]);
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
      walletList: PRIVY_CONNECT_WALLET_LIST,
      description: 'Connect your wallet to Multipass.',
    }],
    ['waitForConnection', { timeoutMs: 45000 }],
  ]);
});

test('wallet client waits for Privy to publish a signable provider after mobile handoff', async () => {
  const client = createPrivyWalletClient();
  const wallet = {
    address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    getEthereumProvider: async () => ({ request: async () => '0xsigned' }),
  };
  const pending = client.waitForSignableWallet({ timeoutMs: 100 });
  queueMicrotask(() => client.setSignableWallet(wallet));
  assert.equal(await pending, wallet);
});

test('createPrivyConnectAction does not trust an address-only modal result as a live connection', async () => {
  const calls = [];
  const action = createPrivyConnectAction({
    configured: true,
    connectWallet: () => ({
      wallet: { address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' },
    }),
    client: {
      clearConnectionError() {},
      waitForConnection: async (options) => {
        calls.push(options);
        return '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
      },
    },
  });

  assert.equal(await action(), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.deepEqual(calls, [{ timeoutMs: 45000 }]);
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
        walletList: PRIVY_CONNECT_WALLET_LIST,
        description: 'Connect your wallet to Multipass.',
      },
  ]]);
});

test('waitForConnection rejects immediately when Privy reports wallet modal cancellation', async () => {
  const client = createPrivyWalletClient();
  const connected = client.waitForConnection({ timeoutMs: 1000 });

  queueMicrotask(() => client.failConnection(createPrivyConnectionError('exited_auth_flow')));

  await assert.rejects(connected, {
    message: 'Wallet signature cancelled. Nothing was changed.',
  });
});

test('createPrivyConnectAction clears stale Privy connection errors before opening modal', async () => {
  const client = createPrivyWalletClient();
  client.failConnection(createPrivyConnectionError('exited_auth_flow'));

  const action = createPrivyConnectAction({
    configured: true,
    connectWallet: () => {
      queueMicrotask(() => client.setSnapshot({
        ready: true,
        configured: true,
        connected: true,
        address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      }));
    },
    client,
  });

  assert.equal(await action(), '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
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

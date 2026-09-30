import React, { useCallback, useEffect } from 'react';
import { useBaseAccountSdk, useConnectWallet, useLogout, usePrivy, useWallets } from '@privy-io/react-auth';
import { getAddress, isAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';

import { defaultWalletSnapshot, requestPersonalSign, shortenAddress } from './wallet-client.js';

const LOADING_WALLET_MESSAGE = 'Wallet options are still loading.';
const WALLET_NOT_CONFIGURED_MESSAGE = 'Wallet login is not configured for this build.';
const CONNECT_EVM_WALLET_MESSAGE = 'Connect an Ethereum wallet to sign the owner claim.';
const WALLET_CANNOT_SIGN_MESSAGE = 'Connected wallet cannot sign messages.';
const PRIVY_CONNECT_DESCRIPTION = 'Connect your wallet to Multipass.';
const PRIVY_APP_NAME = 'Helixa';
const PRIVY_APP_LOGO_URL = 'https://helixa.xyz/multipass/helixa-logo.png';
const PRIVY_SMART_WALLET_CHAIN_IDS = [base.id, baseSepolia.id];
export const PRIVY_BASE_ACCOUNT_WALLET_ID = 'base_account';
export const PRIVY_CONNECT_WALLET_LIST = [
  'coinbase_wallet',
  PRIVY_BASE_ACCOUNT_WALLET_ID,
  'metamask',
  'detected_ethereum_wallets',
  'rainbow',
  'wallet_connect',
  'wallet_connect_qr',
];
export const PRIVY_EXTERNAL_WALLET_CONFIG = {
  coinbaseWallet: {
    config: {
      appName: PRIVY_APP_NAME,
      appLogoUrl: PRIVY_APP_LOGO_URL,
      appChainIds: PRIVY_SMART_WALLET_CHAIN_IDS,
      preference: { options: 'eoaOnly' },
    },
  },
  baseAccount: {
    config: {
      appName: PRIVY_APP_NAME,
      appLogoUrl: PRIVY_APP_LOGO_URL,
      appChainIds: PRIVY_SMART_WALLET_CHAIN_IDS,
    },
  },
};

function connectedAtValue(wallet) {
  const value = Number(wallet?.connectedAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function defaultConnectLabel(snapshot) {
  if (snapshot.ready === false) return 'Loading wallet options...';
  if (snapshot.configured === false) return 'Wallet login not configured';
  if (snapshot.connected && snapshot.address) return 'Sign owner claim';
  return 'Connect wallet to claim';
}

function loadingAction() {
  throw new Error(LOADING_WALLET_MESSAGE);
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

function normalizeAddressOrNull(value) {
  const address = String(value ?? '').trim();
  return isAddress(address) ? getAddress(address) : null;
}

function getWalletAddress(wallet) {
  return normalizeAddressOrNull(wallet?.address ?? wallet?.walletAddress);
}

function getAddressFromLinkedAccounts(accounts = []) {
  if (!Array.isArray(accounts)) return null;
  for (const account of accounts) {
    const address = getWalletAddress(account)
      ?? getWalletAddress(account?.wallet)
      ?? getWalletAddress(account?.smartWallet)
      ?? getWalletAddress(account?.embeddedWallet);
    if (address) return address;
  }
  return null;
}

export function getAddressFromPrivyConnectResult(result) {
  if (Array.isArray(result)) {
    for (const item of result) {
      const address = getAddressFromPrivyConnectResult(item);
      if (address) return address;
    }
    return null;
  }

  return getWalletAddress(result)
    ?? getWalletAddress(result?.wallet)
    ?? getWalletAddress(result?.smartWallet)
    ?? getWalletAddress(result?.baseAccount)
    ?? getWalletAddress(result?.embeddedWallet)
    ?? getWalletAddress(result?.account)
    ?? getWalletAddress(result?.user?.wallet)
    ?? getWalletAddress(result?.user?.smartWallet)
    ?? getAddressFromLinkedAccounts(result?.user?.linkedAccounts);
}

export function createPrivyConnectionError(error) {
  const message = typeof error === 'string' ? error : error?.message;
  const normalized = String(message ?? '').toLowerCase();
  const isCancellation = normalized.includes('exited')
    || normalized.includes('cancel')
    || normalized.includes('reject')
    || normalized.includes('denied');

  if (isCancellation) {
    return new Error('Wallet signature cancelled. Nothing was changed.');
  }

  return new Error(message || 'Wallet connection failed. Nothing was changed.');
}

export function classifyPrivyWalletProfile(wallet) {
  if (!wallet) return { kind: 'unknown', walletClientType: null };
  const walletClientType = String(wallet.walletClientType ?? wallet.type ?? wallet.id ?? '').trim().toLowerCase() || null;
  const smart = walletClientType === PRIVY_BASE_ACCOUNT_WALLET_ID
    || walletClientType === 'smart_wallet'
    || walletClientType === 'smart-wallet'
    || Boolean(wallet.smartWallet);
  return {
    kind: smart ? 'smart_or_delegated' : 'eoa_candidate',
    walletClientType,
  };
}

export async function submitPrivyLooperTransaction(wallet, transaction) {
  if (!wallet) throw new Error('Connected wallet cannot submit transactions.');
  const provider = await wallet.getEthereumProvider?.();
  if (typeof provider?.request !== 'function') throw new Error('Connected wallet cannot submit transactions.');
  const exactKeys = Object.keys(transaction ?? {}).sort().join(',');
  if (exactKeys !== 'chainId,data,from,to,value' || transaction.chainId !== '0x2105' || transaction.value !== '0x0') {
    throw new Error('Looper wallet transaction payload is invalid.');
  }
  if (normalizeAddressOrNull(transaction.from) !== getWalletAddress(wallet)) {
    throw new Error('Looper wallet transaction sender changed.');
  }
  return provider.request({ method: 'eth_sendTransaction', params: [transaction] });
}

export function isPrivyWalletUsableInBrowser(wallet, { userAgent = '', okxInjected = false } = {}) {
  const walletClientType = String(wallet?.walletClientType ?? wallet?.type ?? wallet?.id ?? '').trim().toLowerCase();
  const connectorType = String(wallet?.connectorType ?? '').trim().toLowerCase();
  const isAppleMobileBrowser = /(?:iPhone|iPad|iPod)/i.test(String(userAgent));
  if (walletClientType === 'okx_wallet' && connectorType === 'injected' && isAppleMobileBrowser && !okxInjected) {
    return false;
  }
  return true;
}

export function selectEvmWallet(wallets = [], environment = {}) {
  let selected = null;
  for (const wallet of wallets) {
    if (!isPrivyWalletUsableInBrowser(wallet, environment)) continue;
    if (!wallet?.address || typeof wallet.getEthereumProvider !== 'function') continue;
    if (!selected || connectedAtValue(wallet) > connectedAtValue(selected)) selected = wallet;
  }
  return selected;
}

export function selectConnectedWalletAddress(wallets = [], user = null, environment = {}) {
  const blockedMobileWallet = wallets.some((wallet) => !isPrivyWalletUsableInBrowser(wallet, environment));
  const usableWallets = wallets.filter((wallet) => isPrivyWalletUsableInBrowser(wallet, environment));
  const signableWallet = selectEvmWallet(usableWallets, environment);
  const signableAddress = getWalletAddress(signableWallet);
  if (signableAddress) return signableAddress;

  let selectedWallet = null;
  for (const wallet of usableWallets) {
    if (!getWalletAddress(wallet)) continue;
    if (!selectedWallet || connectedAtValue(wallet) > connectedAtValue(selectedWallet)) selectedWallet = wallet;
  }
  const selectedAddress = getWalletAddress(selectedWallet);
  if (selectedAddress) return selectedAddress;

  if (blockedMobileWallet) return null;

  const linkedAccounts = [user?.wallet, ...(Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : [])];
  for (const account of linkedAccounts) {
    const address = getWalletAddress(account);
    if (address) return address;
  }

  return null;
}

export function createPrivyConnectAction({ client, configured, connectWallet }) {
  return async () => {
    if (!configured) throw new Error(WALLET_NOT_CONFIGURED_MESSAGE);
    if (typeof connectWallet !== 'function') throw new Error(LOADING_WALLET_MESSAGE);
    client.clearConnectionError?.();
    const modalResult = connectWallet({
      walletChainType: 'ethereum-only',
      walletList: PRIVY_CONNECT_WALLET_LIST,
      description: PRIVY_CONNECT_DESCRIPTION,
    });
    const result = isPromiseLike(modalResult) ? await modalResult : modalResult;
    const resultAddress = getAddressFromPrivyConnectResult(result);
    if (resultAddress) {
      client.setSnapshot?.({
        ready: true,
        configured: true,
        connected: true,
        address: resultAddress,
      });
      return resultAddress;
    }
    return client.waitForConnection({ timeoutMs: 45000 });
  };
}

export function createPrivySignMessageAction({ client } = {}) {
  return function signMessage(message) {
    const prepared = client.getPreparedSigningProvider?.();
    if (prepared) {
      const signature = requestPersonalSign(prepared.provider, prepared.wallet.address, message);
      return Promise.resolve(signature).then((value) => ({
        wallet: prepared.wallet.address,
        signature: value,
      }));
    }

    return (async () => {
      const wallet = await client.waitForSignableWallet();
      const provider = await wallet.getEthereumProvider();
      if (typeof provider?.request !== 'function') throw new Error(WALLET_CANNOT_SIGN_MESSAGE);
      const signature = await requestPersonalSign(provider, wallet.address, message);
      return { wallet: wallet.address, signature };
    })();
  };
}

export function prepareWalletSigningProvider(wallet, { baseAccountSdk } = {}) {
  if (
    wallet?.walletClientType === PRIVY_BASE_ACCOUNT_WALLET_ID
    && typeof baseAccountSdk?.getProvider === 'function'
  ) {
    return baseAccountSdk.getProvider();
  }
  return wallet?.getEthereumProvider?.();
}

export function createPrivyWalletClient() {
  let snapshot = defaultWalletSnapshot({
    ready: false,
    connectLabel: 'Loading wallet options...',
  });
  let actions = {
    connect: loadingAction,
    disconnect: async () => setSnapshot({ connected: false, address: null }),
    signMessage: loadingAction,
    sendTransaction: loadingAction,
    request: loadingAction,
  };
  const subscribers = new Set();
  let connectionError = null;
  let signableWallet = null;
  let preparedSigningProvider = null;

  function notify() {
    for (const listener of subscribers) listener(snapshot);
  }

  function getSnapshot() {
    return snapshot;
  }

  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function setSnapshot(nextSnapshot = {}) {
    if (nextSnapshot.connected) connectionError = null;
    const merged = { ...snapshot, ...nextSnapshot };
    let address = Object.hasOwn(nextSnapshot, 'address') ? nextSnapshot.address : merged.address;
    if (nextSnapshot.connected === false) address = null;
    const connected = Boolean(merged.connected && address);

    snapshot = {
      ...merged,
      connected,
      address: connected ? address : null,
      label: connected ? shortenAddress(address) : null,
      connectLabel: typeof nextSnapshot.connectLabel === 'string'
        ? nextSnapshot.connectLabel
        : defaultConnectLabel({ ...merged, connected, address: connected ? address : null }),
    };
    notify();
    return snapshot;
  }

  function setActions(nextActions = {}) {
    actions = { ...actions, ...nextActions };
  }

  function clearConnectionError() {
    connectionError = null;
  }

  function setSignableWallet(wallet) {
    const nextWallet = wallet && typeof wallet.getEthereumProvider === 'function' ? wallet : null;
    if (nextWallet !== signableWallet) preparedSigningProvider = null;
    signableWallet = nextWallet;
    notify();
  }

  function setPreparedSigningProvider(wallet, provider) {
    if (wallet !== signableWallet || typeof provider?.request !== 'function') return false;
    preparedSigningProvider = { wallet, provider };
    notify();
    return true;
  }

  function getPreparedSigningProvider() {
    if (preparedSigningProvider?.wallet !== signableWallet) return null;
    return preparedSigningProvider;
  }

  function waitForPreparedSigningProvider({ timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const current = getPreparedSigningProvider();
      if (current) {
        resolve(current);
        return;
      }
      let settled = false;
      let unsubscribe = () => {};
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        callback(value);
      };
      const timeoutId = setTimeout(() => finish(reject, new Error('Wallet connected, but its signing provider did not become ready. Return to the browser and try again.')), timeoutMs);
      unsubscribe = subscribe(() => {
        const prepared = getPreparedSigningProvider();
        if (prepared) finish(resolve, prepared);
      });
    });
  }

  function waitForSignableWallet({ timeoutMs = 120000 } = {}) {
    return new Promise((resolve, reject) => {
      if (signableWallet) {
        resolve(signableWallet);
        return;
      }
      if (connectionError) {
        reject(connectionError);
        return;
      }
      let settled = false;
      let unsubscribe = () => {};
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        callback(value);
      };
      const timeoutId = setTimeout(() => finish(reject, new Error('Wallet connected, but its signing provider did not become ready. Return to the browser and try again.')), timeoutMs);
      unsubscribe = subscribe(() => {
        if (connectionError) {
          finish(reject, connectionError);
          return;
        }
        if (signableWallet) finish(resolve, signableWallet);
      });
    });
  }

  function failConnection(error) {
    connectionError = error instanceof Error ? error : createPrivyConnectionError(error);
    notify();
  }

  function waitForConnection({ timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const current = getSnapshot();
      if (current.connected && current.address) {
        resolve(current.address);
        return;
      }
      if (connectionError) {
        reject(connectionError);
        return;
      }

      let settled = false;
      let unsubscribe = () => {};
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        callback(value);
      };
      const timeoutId = setTimeout(() => {
        finish(reject, new Error(CONNECT_EVM_WALLET_MESSAGE));
      }, timeoutMs);

      unsubscribe = subscribe(() => {
        if (connectionError) {
          finish(reject, connectionError);
          return;
        }
        const next = getSnapshot();
        if (next.connected && next.address) finish(resolve, next.address);
      });
    });
  }

  return {
    getSnapshot,
    subscribe,
    connect: (...args) => actions.connect(...args),
    disconnect: (...args) => actions.disconnect(...args),
    signMessage: (...args) => actions.signMessage(...args),
    sendTransaction: (...args) => actions.sendTransaction(...args),
    request: (...args) => actions.request(...args),
    setSnapshot,
    setActions,
    clearConnectionError,
    failConnection,
    setSignableWallet,
    setPreparedSigningProvider,
    getPreparedSigningProvider,
    waitForConnection,
    waitForSignableWallet,
    waitForPreparedSigningProvider,
  };
}

export function PrivyWalletBridge({ client, configured }) {
  const privy = usePrivy();
  const { wallets = [], ready: walletsReady = false } = useWallets();
  const { baseAccountSdk } = useBaseAccountSdk();
  const handleConnectSuccess = useCallback(() => {
    client.clearConnectionError();
  }, [client]);
  const handleConnectError = useCallback((error) => {
    client.failConnection(createPrivyConnectionError(error));
  }, [client]);
  const { logout } = useLogout();
  const { connectWallet: connectWalletFromHook } = useConnectWallet({
    onSuccess: handleConnectSuccess,
    onError: handleConnectError,
  });
  const browserEnvironment = {
    userAgent: globalThis.navigator?.userAgent ?? '',
    okxInjected: Boolean(globalThis.window?.okxwallet),
  };
  const activeWallet = selectEvmWallet(wallets, browserEnvironment);
  const connectedAddress = selectConnectedWalletAddress(wallets, privy?.user, browserEnvironment);
  const connectWallet = connectWalletFromHook ?? privy?.connectWallet;

  useEffect(() => {
    let current = true;
    client.setSignableWallet(activeWallet);
    if (activeWallet) {
      let provider;
      try {
        provider = prepareWalletSigningProvider(activeWallet, { baseAccountSdk });
      } catch {
        provider = null;
      }
      Promise.resolve(provider).then((resolvedProvider) => {
        if (current) client.setPreparedSigningProvider(activeWallet, resolvedProvider);
      }).catch(() => {});
    }
    client.setSnapshot({
      ready: Boolean(configured && privy?.ready && (walletsReady || connectedAddress)),
      configured: Boolean(configured),
      connected: Boolean(connectedAddress),
      address: connectedAddress,
      walletProfile: classifyPrivyWalletProfile(activeWallet),
    });
    return () => { current = false; };
  }, [client, configured, privy?.ready, walletsReady, connectedAddress, activeWallet, baseAccountSdk]);

  useEffect(() => {
    client.setActions({
      connect: createPrivyConnectAction({ client, configured, connectWallet }),
      disconnect: async () => {
        if (!configured) throw new Error(WALLET_NOT_CONFIGURED_MESSAGE);
        if (typeof logout === 'function') await logout();
        client.setSnapshot({
          ready: true,
          configured: true,
          connected: false,
          address: null,
        });
      },
      signMessage: createPrivySignMessageAction({ client }),
      sendTransaction: async (transaction) => submitPrivyLooperTransaction(await client.waitForSignableWallet(), transaction),
      request: async (payload) => {
        const wallet = await client.waitForSignableWallet();
        const provider = await wallet.getEthereumProvider();
        if (typeof provider?.request !== 'function') throw new Error('Connected wallet cannot submit transactions.');
        return provider.request(payload);
      },
    });
  }, [client, configured, connectWallet, logout, wallets]);

  return React.createElement(React.Fragment, null);
}

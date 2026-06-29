import React, { useCallback, useEffect } from 'react';
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth';

import { defaultWalletSnapshot, requestPersonalSign, shortenAddress } from './wallet-client.js';

const LOADING_WALLET_MESSAGE = 'Wallet options are still loading.';
const WALLET_NOT_CONFIGURED_MESSAGE = 'Wallet login is not configured for this build.';
const CONNECT_EVM_WALLET_MESSAGE = 'Connect an Ethereum wallet to sign the owner claim.';
const WALLET_CANNOT_SIGN_MESSAGE = 'Connected wallet cannot sign messages.';
const PRIVY_CONNECT_DESCRIPTION = 'Connect the wallet that manages this Multipass public profile.';

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

export function selectEvmWallet(wallets = []) {
  let selected = null;
  for (const wallet of wallets) {
    if (!wallet?.address || typeof wallet.getEthereumProvider !== 'function') continue;
    if (!selected || connectedAtValue(wallet) > connectedAtValue(selected)) selected = wallet;
  }
  return selected;
}

export function createPrivyConnectAction({ client, configured, connectWallet }) {
  return async () => {
    if (!configured) throw new Error(WALLET_NOT_CONFIGURED_MESSAGE);
    if (typeof connectWallet !== 'function') throw new Error(LOADING_WALLET_MESSAGE);
    client.clearConnectionError?.();
    const modalResult = connectWallet({
      walletChainType: 'ethereum-only',
      description: PRIVY_CONNECT_DESCRIPTION,
    });
    if (isPromiseLike(modalResult)) await modalResult;
    return client.waitForConnection({ timeoutMs: 15000 });
  };
}

export function createPrivyWalletClient() {
  let snapshot = defaultWalletSnapshot({
    ready: false,
    configured: false,
    connectLabel: 'Loading wallet options...',
  });
  let actions = {
    connect: loadingAction,
    signMessage: loadingAction,
  };
  const subscribers = new Set();
  let connectionError = null;

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
    signMessage: (...args) => actions.signMessage(...args),
    setSnapshot,
    setActions,
    clearConnectionError,
    failConnection,
    waitForConnection,
  };
}

export function PrivyWalletBridge({ client, configured }) {
  const privy = usePrivy();
  const { wallets = [], ready: walletsReady = false } = useWallets();
  const handleConnectSuccess = useCallback(() => {
    client.clearConnectionError();
  }, [client]);
  const handleConnectError = useCallback((error) => {
    client.failConnection(createPrivyConnectionError(error));
  }, [client]);
  const { connectWallet: connectWalletFromHook } = useConnectWallet({
    onSuccess: handleConnectSuccess,
    onError: handleConnectError,
  });
  const activeWallet = selectEvmWallet(wallets);
  const connectWallet = connectWalletFromHook ?? privy?.connectWallet;

  useEffect(() => {
    client.setSnapshot({
      ready: Boolean(configured && privy?.ready && walletsReady),
      configured: Boolean(configured),
      connected: Boolean(activeWallet?.address),
      address: activeWallet?.address ?? null,
    });
  }, [client, configured, privy?.ready, walletsReady, activeWallet?.address]);

  useEffect(() => {
    client.setActions({
      connect: createPrivyConnectAction({ client, configured, connectWallet }),
      signMessage: async (message) => {
        const wallet = selectEvmWallet(wallets);
        if (!wallet) throw new Error(CONNECT_EVM_WALLET_MESSAGE);
        const provider = await wallet.getEthereumProvider();
        if (typeof provider?.request !== 'function') throw new Error(WALLET_CANNOT_SIGN_MESSAGE);
        const signature = await requestPersonalSign(provider, wallet.address, message);
        return { wallet: wallet.address, signature };
      },
    });
  }, [client, configured, connectWallet, wallets]);

  return React.createElement(React.Fragment, null);
}

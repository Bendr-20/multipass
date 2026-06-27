import React, { useEffect } from 'react';
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth';

import { defaultWalletSnapshot, shortenAddress } from './wallet-client.js';

const LOADING_WALLET_MESSAGE = 'Wallet options are still loading.';
const WALLET_NOT_CONFIGURED_MESSAGE = 'Wallet login is not configured for this build.';
const CONNECT_EVM_WALLET_MESSAGE = 'Connect an Ethereum wallet to sign the owner claim.';
const WALLET_CANNOT_SIGN_MESSAGE = 'Connected wallet cannot sign messages.';

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

export function selectEvmWallet(wallets = []) {
  let selected = null;
  for (const wallet of wallets) {
    if (!wallet?.address || typeof wallet.getEthereumProvider !== 'function') continue;
    if (!selected || connectedAtValue(wallet) > connectedAtValue(selected)) selected = wallet;
  }
  return selected;
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

  function waitForConnection({ timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const current = getSnapshot();
      if (current.connected && current.address) {
        resolve(current.address);
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
    waitForConnection,
  };
}

export function PrivyWalletBridge({ client, configured }) {
  const privy = usePrivy();
  const { wallets = [], ready: walletsReady = false } = useWallets();
  const { connectWallet: connectWalletFromHook } = useConnectWallet();
  const activeWallet = selectEvmWallet(wallets);
  const connectWallet = privy?.connectWallet ?? connectWalletFromHook;

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
      connect: async () => {
        if (!configured) throw new Error(WALLET_NOT_CONFIGURED_MESSAGE);
        if (typeof connectWallet !== 'function') throw new Error(LOADING_WALLET_MESSAGE);
        connectWallet({ walletChainType: 'ethereum-only' });
        return client.waitForConnection();
      },
      signMessage: async (message) => {
        const wallet = selectEvmWallet(wallets);
        if (!wallet) throw new Error(CONNECT_EVM_WALLET_MESSAGE);
        const provider = await wallet.getEthereumProvider();
        if (typeof provider?.request !== 'function') throw new Error(WALLET_CANNOT_SIGN_MESSAGE);
        const signature = await provider.request({
          method: 'personal_sign',
          params: [message, wallet.address],
        });
        return { wallet: wallet.address, signature };
      },
    });
  }, [client, configured, connectWallet, wallets]);

  return React.createElement(React.Fragment, null);
}

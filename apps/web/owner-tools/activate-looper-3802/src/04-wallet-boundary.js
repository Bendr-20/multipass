'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const WALLET_METHODS = ns.deepFreeze(['eth_chainId', 'eth_accounts', 'eth_requestAccounts', 'wallet_switchEthereumChain', 'eth_sendTransaction']);

  function createWalletBoundary(provider) {
    const validProvider = provider && typeof provider.request === 'function';
    function request(method, params) {
      if (!WALLET_METHODS.includes(method)) throw new Error('Blocked wallet method.');
      if (!validProvider) throw new Error('Injected wallet not found.');
      const payload = params === undefined ? { method } : { method, params };
      return provider.request(payload);
    }
    async function readState() {
      if (!validProvider) return ns.deepFreeze({ chainId: null, account: null });
      const [chainId, accounts] = await Promise.all([request('eth_chainId'), request('eth_accounts')]);
      if (typeof chainId !== 'string' || !Array.isArray(accounts) || accounts.some((value) => typeof value !== 'string')) throw new Error('Injected wallet returned malformed state.');
      return ns.deepFreeze({ chainId, account: accounts[0] || null });
    }
    async function connectAndSwitch() {
      const accounts = await request('eth_requestAccounts');
      if (!Array.isArray(accounts) || accounts.some((value) => typeof value !== 'string')) throw new Error('Injected wallet returned malformed accounts.');
      let chainId = await request('eth_chainId');
      if (chainId !== ns.PINSET.chainIdHex) {
        await request('wallet_switchEthereumChain', [{ chainId: ns.PINSET.chainIdHex }]);
        chainId = await request('eth_chainId');
      }
      if (chainId !== ns.PINSET.chainIdHex) throw new Error('Wallet did not switch to Base.');
      return ns.deepFreeze({ chainId, account: accounts[0] || null });
    }
    function onWalletChange(listener) {
      if (!validProvider || typeof provider.on !== 'function') return () => {};
      provider.on('accountsChanged', listener);
      provider.on('chainChanged', listener);
      return () => {
        if (typeof provider.removeListener === 'function') {
          provider.removeListener('accountsChanged', listener);
          provider.removeListener('chainChanged', listener);
        }
      };
    }
    function sendPinnedActivation(...args) {
      if (args.length !== 0) throw new Error('sendPinnedActivation takes no arguments.');
      ns.validateExactTransaction(ns.EXACT_TRANSACTION);
      return request('eth_sendTransaction', [ns.EXACT_TRANSACTION]);
    }
    return ns.deepFreeze({ hasProvider: validProvider, readState, connectAndSwitch, onWalletChange, sendPinnedActivation });
  }

  Object.defineProperties(ns, {
    WALLET_METHODS: { value: WALLET_METHODS, enumerable: true, writable: false, configurable: false },
    createWalletBoundary: { value: createWalletBoundary, enumerable: true, writable: false, configurable: false },
  });
})();

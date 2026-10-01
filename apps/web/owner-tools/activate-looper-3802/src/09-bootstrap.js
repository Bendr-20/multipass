'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  function bootstrap({ window, document }) {
    const transport = ns.createPublicRpcTransport({ fetch: window.fetch.bind(window), AbortController: window.AbortController, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), sleep: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)), now: () => Date.now() });
    let provider = null; let storage = null; let locks = null;
    try { provider = window.ethereum || null; } catch {}
    try { storage = window.localStorage; } catch {}
    try { locks = window.navigator?.locks || null; } catch {}
    const wallet = ns.createWalletBoundary(provider);
    let controller;
    const store = storage ? ns.createAttemptStore(storage, () => controller?.invalidateStorage()) : ns.deepFreeze({
      read() { throw new Error('Durable activation storage is unavailable; page is read-only.'); },
      handleStorageEvent() {},
    });
    const coordinator = ns.createCrossTabCoordinator({ locks: storage ? locks : null, store, crypto: window.crypto, now: () => Date.now(), setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window) });
    const renderer = ns.createRenderer(document);
    controller = ns.createController({ transport, wallet, store, coordinator, renderer, crypto: window.crypto, now: () => Date.now() });
    renderer.elements.connect.addEventListener('click', () => void controller.connect());
    renderer.elements.activate.addEventListener('click', () => void controller.activate());
    renderer.elements.resume.addEventListener('click', () => void controller.resume());
    renderer.elements.retry.addEventListener('click', () => void controller.retry());
    renderer.elements.acknowledge.addEventListener('click', () => void controller.acknowledge());
    wallet.onWalletChange(controller.invalidateWallet);
    window.addEventListener('storage', (event) => store.handleStorageEvent(event));
    void controller.refresh();
    return ns.deepFreeze({ transport, wallet, store, coordinator, renderer, controller });
  }
  Object.defineProperty(ns, 'bootstrap', { value: bootstrap, enumerable: true, writable: false, configurable: false });
  if (typeof window !== 'undefined' && typeof document !== 'undefined') bootstrap({ window, document });
})();

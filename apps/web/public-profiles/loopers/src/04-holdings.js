'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'createHoldingsClient')) throw new Error('createHoldingsClient is already registered.');

  function createHoldingsClient() {
    throw new Error('Not implemented');
  }

  Object.defineProperty(ns, 'createHoldingsClient', {
    value: createHoldingsClient,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

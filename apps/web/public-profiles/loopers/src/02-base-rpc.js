'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'createBaseRpcClient')) throw new Error('createBaseRpcClient is already registered.');

  function createBaseRpcClient() {
    throw new Error('Not implemented');
  }

  Object.defineProperty(ns, 'createBaseRpcClient', {
    value: createBaseRpcClient,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

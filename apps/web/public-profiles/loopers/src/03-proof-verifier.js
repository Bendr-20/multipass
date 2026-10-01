'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'verifyLooperProfileProof')) throw new Error('verifyLooperProfileProof is already registered.');

  function verifyLooperProfileProof() {
    throw new Error('Not implemented');
  }

  Object.defineProperty(ns, 'verifyLooperProfileProof', {
    value: verifyLooperProfileProof,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

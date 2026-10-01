'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'bootstrapLooperMultipassProfile')) throw new Error('bootstrapLooperMultipassProfile is already registered.');

  function bootstrapLooperMultipassProfile() {
    throw new Error('Not implemented');
  }

  Object.defineProperty(ns, 'bootstrapLooperMultipassProfile', {
    value: bootstrapLooperMultipassProfile,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

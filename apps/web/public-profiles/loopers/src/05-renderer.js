'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'createProfileRenderer')) throw new Error('createProfileRenderer is already registered.');

  function createProfileRenderer() {
    throw new Error('Not implemented');
  }

  Object.defineProperty(ns, 'createProfileRenderer', {
    value: createProfileRenderer,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

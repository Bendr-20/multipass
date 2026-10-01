'use strict';

(() => {
  const name = 'LooperMultipassProfile';
  if (Object.prototype.hasOwnProperty.call(globalThis, name)) {
    throw new Error(`${name} namespace is already registered.`);
  }
  Object.defineProperty(globalThis, name, {
    value: Object.create(null),
    enumerable: false,
    writable: false,
    configurable: false,
  });
})();

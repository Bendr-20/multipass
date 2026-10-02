import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeRestapNetworkJson } from '../src/restap-network/jcs.js';

test('JCS matches RFC 8785 number and escaping vectors', () => {
  const input = {
    numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27],
    string: `\u20ac$\u000f\nA'B"\\"/`,
    literals: [null, true, false],
  };
  assert.equal(
    canonicalizeRestapNetworkJson(input),
    `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA'B\\"\\\\\\"/"}`,
  );
  assert.equal(canonicalizeRestapNetworkJson(-0), '0');
});

test('JCS sorts object names by UTF-16 code units and preserves array order', () => {
  const input = { '\u20ac': 'euro', '\r': 'cr', '\ufb33': 'hebrew', '1': 'one', '\ud83d\ude00': 'emoji', '\u0080': 'control', '\u00f6': 'o', array: [3, 2, 1] };
  assert.equal(
    canonicalizeRestapNetworkJson(input),
    '{"\\r":"cr","1":"one","array":[3,2,1],"":"control","ö":"o","€":"euro","😀":"emoji","דּ":"hebrew"}',
  );
});

test('JCS is stable across insertion order and nested plain objects', () => {
  const one = { z: [{ b: 2, a: 1 }], a: { d: 4, c: 3 } };
  const two = { a: { c: 3, d: 4 }, z: [{ a: 1, b: 2 }] };
  assert.equal(canonicalizeRestapNetworkJson(one), canonicalizeRestapNetworkJson(two));
});

test('JCS rejects non-JSON values, sparse or decorated arrays, prototypes, cycles, accessors, symbols, and lone surrogates', () => {
  const sparse = []; sparse[1] = 1;
  const decorated = [1]; decorated.extra = true;
  const cyclic = {}; cyclic.self = cyclic;
  const accessor = {}; Object.defineProperty(accessor, 'value', { enumerable: true, get() { return 1; } });
  const symbolKey = { valid: true }; symbolKey[Symbol('hidden')] = true;
  for (const value of [undefined, 1n, Infinity, -Infinity, NaN, () => {}, Symbol('x'), sparse, decorated, new Date(), cyclic, accessor, symbolKey, '\ud800', { '\udfff': 1 }]) {
    assert.throws(() => canonicalizeRestapNetworkJson(value));
  }
});

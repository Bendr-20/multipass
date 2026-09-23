import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStrictJsonObject } from '../src/strict-json-envelope.js';

function assertRecursivelyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child);
}

function nestedObject(depth) {
  let value = 'true';
  for (let index = 0; index < depth; index += 1) value = `{"level":${value}}`;
  return value;
}

test('accepts exactly one JSON object with outer JSON whitespace and valid escaped strings', () => {
  const decoded = parseStrictJsonObject(' \n\t{"message":"quote: \\" slash: \\\\ snowman: \\u2603","nested":{"items":[true,null,-1.25e+2]}}\r ');

  assert.deepEqual(decoded, {
    message: 'quote: " slash: \\ snowman: ☃',
    nested: { items: [true, null, -125] },
  });
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.getPrototypeOf(decoded.nested), Object.prototype);
  assertRecursivelyFrozen(decoded);
});

test('rejects non-string input without coercion and requires an object root', () => {
  for (const value of [null, undefined, 42, true, {}, ['{}']]) {
    assert.throws(() => parseStrictJsonObject(value), /string/i);
  }
  for (const value of ['', '   ', 'null', '[]', '"object"', 'true', '1']) {
    assert.throws(() => parseStrictJsonObject(value), /exact json object/i);
  }
});

test('rejects mixed prose, leading or trailing JSON values, and non-JSON outer whitespace', () => {
  for (const value of [
    'prefix {"schema_version":"0.1.0"}',
    '{"schema_version":"0.1.0"} suffix',
    '{}{}',
    '{} null',
    '\u00a0{}',
  ]) {
    assert.throws(() => parseStrictJsonObject(value), /exact json object/i);
  }
});

test('rejects duplicate decoded keys at every object nesting level', () => {
  for (const value of [
    '{"assistant_text":"a","assistant_text":"b"}',
    '{"outer":{"same":1,"same":2}}',
    '{"items":[{"same":1,"same":2}]}',
    '{"a":1,"\\u0061":2}',
    '{"😀":1,"\\ud83d\\ude00":2}',
  ]) {
    assert.throws(() => parseStrictJsonObject(value), /duplicate/i);
  }
});

test('rejects forbidden decoded prototype keys at every nesting level', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => parseStrictJsonObject(`{"${key}":true}`), /forbidden/i);
    assert.throws(() => parseStrictJsonObject(`{"safe":{"${key}":true}}`), /forbidden/i);
  }
  assert.throws(() => parseStrictJsonObject('{"safe":1,"\\u005f_proto__":2}'), /forbidden/i);
  assert.throws(() => parseStrictJsonObject('{"constr\\u0075ctor":1}'), /forbidden/i);
});

test('rejects malformed strings, escapes, JSON structure, numbers, and array holes', () => {
  const malformed = [
    '{"a":"unterminated}',
    '{"a":"bad\\xescape"}',
    '{"a":"bad\\u12xz"}',
    '{"a":"line\nbreak"}',
    '{a:1}',
    '{"a":1,}',
    '{"a" 1}',
    '{"a":01}',
    '{"a":1.}',
    '{"a":.1}',
    '{"a":NaN}',
    '{"a":[,]}',
    '{"a":[1,,2]}',
    '{"a":[1,]}',
  ];
  for (const value of malformed) assert.throws(() => parseStrictJsonObject(value), /json/i);
});

test('rejects JSON numbers that decode outside the finite JSON number domain', () => {
  assert.throws(() => parseStrictJsonObject('{"amount":1e9999}'), /finite|json/i);
  assert.throws(() => parseStrictJsonObject('{"amount":-1e9999}'), /finite|json/i);
});

test('enforces the UTF-8 input byte limit including multibyte input', () => {
  const withinLimit = JSON.stringify({ text: 'a'.repeat((16 * 1024) - 11) });
  assert.equal(Buffer.byteLength(withinLimit, 'utf8'), 16 * 1024);
  assert.equal(parseStrictJsonObject(withinLimit).text.length, (16 * 1024) - 11);

  const asciiOverflow = JSON.stringify({ text: 'a'.repeat((16 * 1024) - 10) });
  assert.throws(() => parseStrictJsonObject(asciiOverflow), /16.*kib|16384|byte/i);

  const multibyteOverflow = JSON.stringify({ text: '💸'.repeat(4_094) });
  assert.ok(Buffer.byteLength(multibyteOverflow, 'utf8') > 16 * 1024);
  assert.throws(() => parseStrictJsonObject(multibyteOverflow), /16.*kib|16384|byte/i);
});

test('enforces maximum depth, object member count, and array item count', () => {
  assert.doesNotThrow(() => parseStrictJsonObject(nestedObject(12)));
  assert.throws(() => parseStrictJsonObject(nestedObject(13)), /depth/i);

  const object64 = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`k${index}`, index]));
  assert.doesNotThrow(() => parseStrictJsonObject(JSON.stringify(object64)));
  const object65 = { ...object64, k64: 64 };
  assert.throws(() => parseStrictJsonObject(JSON.stringify(object65)), /64|member/i);

  assert.doesNotThrow(() => parseStrictJsonObject('{"items":[0,1,2,3,4,5,6,7]}'));
  assert.throws(() => parseStrictJsonObject('{"items":[0,1,2,3,4,5,6,7,8]}'), /8|array/i);
});

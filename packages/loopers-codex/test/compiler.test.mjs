import assert from 'node:assert/strict';
import test from 'node:test';

import * as codex from '../src/index.js';

const {
  canonicalJsonHash,
  canonicalJsonStringify,
} = codex;

test('canonical JSON package exposes the locked foundation constants', () => {
  assert.equal(codex.LOOPER_CODEX_SCHEMA_VERSION, '1.0.0');
  assert.equal(codex.LOOPER_CODEX_COMPILER_VERSION, '1.0.0');
  assert.deepEqual(codex.LOOPER_CODEX_COLLECTION, {
    name: 'Loopers',
    chainId: 8453,
    contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
    count: 7777,
  });
  assert.deepEqual(codex.LOOPER_CODEX_LIMITS, {
    releaseManifestBytes: 1 * 1024 * 1024,
    metadataFileBytes: 64 * 1024,
    codexFileBytes: 128 * 1024,
    sourceFileBytes: 4 * 1024 * 1024,
    metadataAggregateBytes: 512 * 1024 * 1024,
    codexAggregateBytes: 1024 * 1024 * 1024,
    artifactBytes: 128 * 1024 * 1024,
    traitStringMinLength: 1,
    traitStringMaxLength: 96,
    filterMinItems: 1,
    filterMaxItems: 12,
    searchDefaultLimit: 25,
    searchMaxLimit: 100,
    similarityDefaultLimit: 10,
    similarityMaxLimit: 25,
    cursorMaxLength: 512,
  });
  assert.deepEqual(codex.LOOPER_CODEX_DERIVED_TRAIT_TYPES, [
    'Agent Class',
    'Secondary Class',
    'Specialization',
    'Risk',
    'Autonomy',
  ]);
  assert.equal(codex.LOOPER_CODEX_FIXED_POINT_SCALE, 1_000_000);
});

test('canonical JSON sorts object keys recursively while preserving array order', () => {
  const value = {
    zebra: 1,
    alpha: {
      y: true,
      x: null,
    },
    items: [
      { second: 2, first: 1 },
      'tail',
    ],
  };

  assert.equal(
    canonicalJsonStringify(value),
    '{"alpha":{"x":null,"y":true},"items":[{"first":1,"second":2},"tail"],"zebra":1}',
  );
});

test('canonical JSON preserves array order', () => {
  assert.equal(canonicalJsonStringify([3, 1, 2]), '[3,1,2]');
  assert.notEqual(canonicalJsonStringify([3, 1, 2]), canonicalJsonStringify([1, 2, 3]));
});

test('canonical JSON rejects unsupported values', () => {
  for (const value of [undefined, 1n, Symbol('unsupported'), () => {}]) {
    assert.throws(() => canonicalJsonStringify(value), TypeError);
  }

  assert.throws(() => canonicalJsonStringify({ nested: undefined }), TypeError);
  assert.throws(() => canonicalJsonStringify([1, undefined]), TypeError);
  assert.throws(() => canonicalJsonStringify(new Date(0)), TypeError);
  assert.throws(() => canonicalJsonStringify([1, , 3]), TypeError);
});

test('canonical JSON rejects non-finite numbers', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalJsonStringify(value), /finite/);
  }
});

test('canonical JSON rejects cyclic values', () => {
  const value = { name: 'cycle' };
  value.self = value;

  assert.throws(() => canonicalJsonStringify(value), /cyclic/);
});

test('canonical JSON hashes equivalent values identically with SHA-256', () => {
  const left = { beta: [2, 1], alpha: { enabled: true } };
  const right = { alpha: { enabled: true }, beta: [2, 1] };

  assert.equal(canonicalJsonHash(left), canonicalJsonHash(right));
  assert.match(canonicalJsonHash(left), /^[0-9a-f]{64}$/);
  assert.notEqual(canonicalJsonHash(left), canonicalJsonHash({ ...right, beta: [1, 2] }));
});

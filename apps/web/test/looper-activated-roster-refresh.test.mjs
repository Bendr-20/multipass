import assert from 'node:assert/strict';
import test from 'node:test';

import { assertMonotonicPublication, reconcileProviderScans } from '../scripts/refresh-looper-activated-roster.mjs';

const HASH_A = '0x' + '11'.repeat(32);
const HASH_B = '0x' + '22'.repeat(32);
const scan = (provider, observedBlock, observedAt, tokenIds, blockHash = HASH_A) => ({ provider, blockHash, observedBlock, observedAt, tokenIds });
const document = ({ observedBlock = 100, observedAt = '2026-10-08T00:00:00.000Z', tokenIds = ['1', '143'] } = {}) => ({
  schema_version: '1.0.0', chain_id: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  implementation: '0xf192f350427c8F58bC28e78b1e6Af164279F486e',
  observed_block: observedBlock, observed_at: observedAt, count: tokenIds.length, token_ids: tokenIds,
});

test('reconciles exact provider agreement at the earliest pinned block', () => {
  const tokenIds = ['1', '143', '3802'];
  const result = reconcileProviderScans([
    scan('a', 100, '2026-10-08T00:00:00.000Z', tokenIds, HASH_A),
    scan('b', 105, '2026-10-08T00:00:10.000Z', tokenIds, HASH_B),
  ], { minimumCount: 3 });
  assert.equal(result.observed_block, 100);
  assert.equal(result.observed_at, '2026-10-08T00:00:00.000Z');
  assert.deepEqual(result.token_ids, tokenIds);
  assert.equal(result.count, 3);
});

test('rejects provider disagreement and malformed pinned scans', () => {
  assert.throws(() => reconcileProviderScans([
    scan('a', 100, '2026-10-08T00:00:00.000Z', ['1', '143']),
    scan('b', 100, '2026-10-08T00:00:00.000Z', ['1', '3802']),
  ], { minimumCount: 2 }), /disagree/u);
  assert.throws(() => reconcileProviderScans([
    scan('a', null, '2026-10-08T00:00:00.000Z', ['1']),
    scan('b', 100, '2026-10-08T00:00:00.000Z', ['1']),
  ], { minimumCount: 1 }), /malformed/u);
  assert.throws(() => reconcileProviderScans([
    scan('a', 100, '2026-10-08T00:00:00.000Z', ['1'], '0x1234'),
    scan('b', 100, '2026-10-08T00:00:00.000Z', ['1']),
  ], { minimumCount: 1 }), /malformed/u);
});

test('publication rejects malformed baselines, block or count regressions, and lost token IDs', () => {
  const previous = document();
  assert.doesNotThrow(() => assertMonotonicPublication(previous, document({ observedBlock: 101, tokenIds: ['1', '143', '3802'] })));
  assert.throws(() => assertMonotonicPublication(previous, document({ observedBlock: 99 })), /block regressed/u);
  assert.throws(() => assertMonotonicPublication(previous, document({ observedBlock: 101, tokenIds: ['1'] })), /count regressed/u);
  assert.throws(() => assertMonotonicPublication(previous, document({ observedBlock: 101, tokenIds: ['1', '3802'] })), /lost/u);
  assert.throws(() => assertMonotonicPublication({ ...previous, token_ids: ['1', '1'] }, document({ observedBlock: 101 })), /malformed/u);
  assert.throws(() => assertMonotonicPublication({ ...previous, token_ids: ['143', '1'] }, document({ observedBlock: 101 })), /malformed/u);
  assert.throws(() => assertMonotonicPublication({ ...previous, schema_version: '2.0.0' }, document({ observedBlock: 101 })), /malformed/u);
});

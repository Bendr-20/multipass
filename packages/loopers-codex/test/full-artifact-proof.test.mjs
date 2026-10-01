import assert from 'node:assert/strict';
import test from 'node:test';

import { proveLooperCodexArtifact } from '../scripts/prove-looper-codex.js';

const artifactPath = process.env.LOOPER_CODEX_ARTIFACT;

test('full 7,777-token artifact proves all seven #3802 queries without network', {
  skip: artifactPath ? false : 'LOOPER_CODEX_ARTIFACT is not set',
  timeout: 120_000,
}, async () => {
  const result = await proveLooperCodexArtifact(artifactPath);
  assert.deepEqual(Object.keys(result), [
    'count', 'schemaVersion', 'artifactHash', 'tokenId', 'operationCount', 'fetchCalls',
  ]);
  assert.equal(result.count, 7777);
  assert.equal(result.schemaVersion, '1.0.0');
  assert.match(result.artifactHash, /^[0-9a-f]{64}$/);
  assert.equal(result.tokenId, 3802);
  assert.equal(result.operationCount, 7);
  assert.equal(result.fetchCalls, 0);
});

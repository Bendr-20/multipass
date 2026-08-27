import assert from 'node:assert/strict';
import test from 'node:test';

import { createAllowlistSnapshot, verifyAllowlistProof } from '../src/allowlist-snapshot.js';

const ADDRESS_A = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const ADDRESS_B = '0x0000000000000000000000000000000000000001';

test('createAllowlistSnapshot exports ordered addresses with a verifiable Merkle root', () => {
  const snapshot = createAllowlistSnapshot({
    schema_version: '0.1.0',
    entries: [
      { address: ADDRESS_A.toLowerCase(), registered_at: '2026-08-24T00:00:00.000Z', source: 'x:loopers' },
      { address: ADDRESS_B, registered_at: '2026-08-24T00:01:00.000Z', source: 'telegram' },
      { address: ADDRESS_A, registered_at: '2026-08-24T00:02:00.000Z', source: 'duplicate' },
      { address: 'not-an-address', source: 'bad' },
    ],
  }, { generatedAt: '2026-08-24T00:02:30.000Z' });

  assert.equal(snapshot.count, 2);
  assert.equal(snapshot.generated_at, '2026-08-24T00:02:30.000Z');
  assert.equal(snapshot.entries[0].position, 1);
  assert.equal(snapshot.entries[0].address, ADDRESS_A);
  assert.equal(snapshot.entries[0].source, 'x:loopers');
  assert.match(snapshot.merkle.root, /^0x[0-9a-f]{64}$/);
  assert.equal(verifyAllowlistProof(snapshot.entries[0].address, snapshot.entries[0].proof, snapshot.merkle.root), true);
  assert.equal(verifyAllowlistProof(snapshot.entries[1].address, snapshot.entries[1].proof, snapshot.merkle.root), true);
});

test('createAllowlistSnapshot handles an empty allowlist', () => {
  const snapshot = createAllowlistSnapshot({ entries: [] }, { generatedAt: '2026-08-24T00:00:00.000Z' });

  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.merkle.root, null);
  assert.deepEqual(snapshot.entries, []);
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSqliteLooperNameStore } from '../src/looper-name-store.js';

const identity = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '617',
  owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
  controllerVerified: true,
};

test('Looper name survives store reopen and follows the token to a new owner', () => {
  const directory = mkdtempSync(join(tmpdir(), 'multipass-looper-names-'));
  const databasePath = join(directory, 'multipass.sqlite');
  try {
    const first = createSqliteLooperNameStore({ databasePath, now: () => '2026-09-30T00:30:00.000Z' });
    first.set({ identity, name: 'Signal Loop', wallet: identity.owner });
    first.close();

    const second = createSqliteLooperNameStore({ databasePath });
    const transferred = { ...identity, owner: '0x1234567890abcdef1234567890abcdef12345678' };
    assert.equal(second.get(transferred)?.name, 'Signal Loop');
    second.reset({ identity: transferred, wallet: transferred.owner });
    assert.equal(second.get(transferred), null);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Looper name writes require matching verified controller and bounded names', () => {
  const store = createSqliteLooperNameStore();
  assert.throws(() => store.set({ identity: { ...identity, controllerVerified: false }, name: 'Nope', wallet: identity.owner }), /controller/i);
  assert.throws(() => store.set({ identity, name: 'Nope', wallet: '0x1234567890abcdef1234567890abcdef12345678' }), /wallet/i);
  assert.throws(() => store.set({ identity, name: 'x'.repeat(81), wallet: identity.owner }), /80/);
  store.close();
});

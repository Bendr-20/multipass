import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AllowlistInputError, createJsonAllowlistStore, createMemoryAllowlistStore, normalizeAllowlistAddress } from '../src/allowlist-store.js';

const ADDRESS = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const LOWER_ADDRESS = ADDRESS.toLowerCase();

test('normalizeAllowlistAddress returns a checksum address', () => {
  assert.equal(normalizeAllowlistAddress(LOWER_ADDRESS), ADDRESS);
});

test('normalizeAllowlistAddress rejects invalid addresses', () => {
  assert.throws(() => normalizeAllowlistAddress('not-an-address'), AllowlistInputError);
});

test('memory allowlist store registers an address once', () => {
  const store = createMemoryAllowlistStore({ now: () => new Date('2026-08-23T18:30:00.000Z') });

  const first = store.register({ address: LOWER_ADDRESS, source: 'telegram' });
  const duplicate = store.register({ address: ADDRESS, source: 'site' });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.entry.address, ADDRESS);
  assert.equal(first.entry.source, 'telegram');
  assert.equal(store.count(), 1);
  assert.deepEqual(store.status(ADDRESS), {
    registered: true,
    address: ADDRESS,
    entry: {
      address: ADDRESS,
      registered_at: '2026-08-23T18:30:00.000Z',
      source: 'telegram',
    },
  });
});

test('json allowlist store persists and reloads registered addresses', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-allowlist-'));
  const filePath = path.join(dir, 'allowlist.json');

  try {
    const store = await createJsonAllowlistStore({
      filePath,
      now: () => new Date('2026-08-23T18:31:00.000Z'),
    });
    const registered = await store.register({ address: LOWER_ADDRESS, source: 'launch-page' });
    assert.equal(registered.created, true);

    const saved = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(saved.entries.length, 1);
    assert.equal(saved.entries[0].address, ADDRESS);
    assert.equal(saved.entries[0].registered_at, '2026-08-23T18:31:00.000Z');

    const reloaded = await createJsonAllowlistStore({ filePath });
    const status = await reloaded.status(ADDRESS);
    assert.equal(status.registered, true);
    assert.equal(status.entry.registered_at, '2026-08-23T18:31:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

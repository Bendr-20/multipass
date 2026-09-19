import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDefaultSalesState,
  loadSalesState,
  pruneSalesState,
  saveSalesStateAtomic,
} from '../src/loopers-sales/state.js';

const DAY = 86_400;

async function withTempState(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loopers-sales-state-'));
  const statePath = path.join(dir, 'state.json');
  try {
    await run({ dir, statePath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function populatedState(nowSeconds = 2_000_000_000) {
  return {
    ...createDefaultSalesState({ baselineCutoff: nowSeconds - 100 }),
    restWatermark: nowSeconds - 10,
    seenIds: {
      recent: nowSeconds - DAY,
    },
    pendingGroups: {
      '0xpending': {
        flushAt: nowSeconds + 8,
        items: [{ id: 'sale-pending', priceAtomic: '123456789012345678901234567890' }],
      },
    },
    retryRecords: {
      'sale-retry': { attempt: 3, retryAt: nowSeconds + 30 },
    },
    deliveredTransactions: {
      '0xdelivered': {
        deliveredAt: nowSeconds - DAY,
        messageId: '42',
        mode: 'photo',
        floorAtomic: '50000000000000000',
        lastCaption: 'caption',
        items: [{ id: 'sale-delivered', priceAtomic: '70000000000000000' }],
        unresolvedItems: [],
        pinned: false,
      },
    },
    deliveredTombstones: {
      '0xold': { deliveredAt: 1 },
    },
  };
}

test('creates the complete versioned default state with a permanent baseline cutoff', () => {
  assert.deepEqual(createDefaultSalesState({ baselineCutoff: 123 }), {
    schemaVersion: 1,
    baselineCutoff: 123,
    restWatermark: 123,
    seenIds: {},
    pendingGroups: {},
    retryRecords: {},
    deliveredTransactions: {},
    deliveredTombstones: {},
    updatedAt: 123,
  });
});

test('atomically saves and reloads all durable work with decimal quantities as strings', async () => {
  await withTempState(async ({ statePath }) => {
    const state = populatedState();
    await saveSalesStateAtomic({ statePath, state });

    const serialized = await readFile(statePath, 'utf8');
    assert.match(serialized, /"123456789012345678901234567890"/);
    assert.deepEqual(await loadSalesState({ statePath, nowSeconds: 2_000_000_000 }), state);
    assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  });
});

test('loading a missing file returns a fresh baseline while corrupt JSON fails fast', async () => {
  await withTempState(async ({ statePath }) => {
    assert.deepEqual(
      await loadSalesState({ statePath, nowSeconds: 456 }),
      createDefaultSalesState({ baselineCutoff: 456 }),
    );

    await writeFile(statePath, '{broken');
    await assert.rejects(
      loadSalesState({ statePath, nowSeconds: 999 }),
      /Failed to parse sales state/,
    );
  });
});

test('load preserves unflushed pending and retry work across restart', async () => {
  await withTempState(async ({ statePath }) => {
    const state = populatedState();
    await saveSalesStateAtomic({ statePath, state });
    const restarted = await loadSalesState({ statePath, nowSeconds: 2_000_000_001 });
    assert.deepEqual(restarted.pendingGroups, state.pendingGroups);
    assert.deepEqual(restarted.retryRecords, state.retryRecords);
  });
});

test('prunes seen IDs after seven days and caps newest entries at 50,000', () => {
  const now = 2_000_000_000;
  const state = populatedState(now);
  state.seenIds = {
    boundary: now - (7 * DAY),
    expired: now - (7 * DAY) - 1,
  };
  const agePruned = pruneSalesState(state, { nowSeconds: now });
  assert.equal(agePruned.seenIds.boundary, now - (7 * DAY));
  assert.equal(agePruned.seenIds.expired, undefined);

  for (let index = 0; index < 50_005; index += 1) {
    state.seenIds[`id-${index}`] = now - index;
  }
  const capped = pruneSalesState(state, { nowSeconds: now });
  assert.equal(Object.keys(capped.seenIds).length, 50_000);
  assert.equal(capped.seenIds['id-0'], now);
  assert.equal(capped.seenIds['id-49999'], now - 49_999);
  assert.equal(capped.seenIds['id-50000'], undefined);
  assert.equal(state.seenIds.expired, now - (7 * DAY) - 1, 'pruning does not mutate caller state');
});

test('expires unpinned delivered records into indefinite tombstones but retains pinned records', () => {
  const now = 2_000_000_000;
  const state = populatedState(now);
  state.deliveredTransactions = {
    expired: { deliveredAt: now - (30 * DAY) - 1, pinned: false, items: [{ id: 'old' }] },
    boundary: { deliveredAt: now - (30 * DAY), pinned: false, items: [{ id: 'boundary' }] },
    pinned: {
      deliveredAt: now - (365 * DAY),
      pinned: true,
      unresolvedItems: [{ id: 'late' }],
    },
  };
  state.deliveredTombstones = { ancient: { deliveredAt: 1 } };

  const pruned = pruneSalesState(state, { nowSeconds: now });
  assert.equal(pruned.deliveredTransactions.expired, undefined);
  assert.deepEqual(pruned.deliveredTombstones.expired, { deliveredAt: now - (30 * DAY) - 1 });
  assert.ok(pruned.deliveredTransactions.boundary);
  assert.ok(pruned.deliveredTransactions.pinned);
  assert.deepEqual(pruned.deliveredTombstones.ancient, { deliveredAt: 1 });
});

function injectedFs(failOperation, calls) {
  return {
    ...fs,
    async open(target, flags, mode) {
      const isDirectory = flags === 'r' && mode === undefined;
      const operation = isDirectory ? 'directory-open' : 'file-open';
      calls.push(operation);
      if (failOperation === operation) throw new Error(`injected ${operation}`);
      const handle = await fs.open(target, flags, mode);
      return {
        async writeFile(contents, options) {
          calls.push('write');
          if (failOperation === 'write') throw new Error('injected write');
          return handle.writeFile(contents, options);
        },
        async sync() {
          const syncOperation = isDirectory ? 'directory-fsync' : 'file-fsync';
          calls.push(syncOperation);
          if (failOperation === syncOperation) throw new Error(`injected ${syncOperation}`);
          return handle.sync();
        },
        close: () => handle.close(),
      };
    },
    async rename(from, to) {
      calls.push('rename');
      if (failOperation === 'rename') throw new Error('injected rename');
      return fs.rename(from, to);
    },
  };
}

for (const failure of ['file-open', 'write', 'file-fsync', 'rename', 'directory-open']) {
  test(`${failure} failure keeps the original valid target and safely removes the temp file`, async () => {
    await withTempState(async ({ dir, statePath }) => {
      const original = populatedState();
      const replacement = { ...populatedState(), restWatermark: 2_000_000_999 };
      await saveSalesStateAtomic({ statePath, state: original });
      const calls = [];

      await assert.rejects(
        saveSalesStateAtomic({ statePath, state: replacement, fsImpl: injectedFs(failure, calls) }),
        new RegExp(`injected ${failure}`),
      );
      assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), original);
      assert.deepEqual((await fs.readdir(dir)).sort(), ['state.json']);
    });
  });
}

test('directory fsync failure surfaces after rename with a complete valid new target', async () => {
  await withTempState(async ({ dir, statePath }) => {
    const original = populatedState();
    const replacement = { ...populatedState(), restWatermark: 2_000_000_999 };
    await saveSalesStateAtomic({ statePath, state: original });

    await assert.rejects(
      saveSalesStateAtomic({ statePath, state: replacement, fsImpl: injectedFs('directory-fsync', []) }),
      /injected directory-fsync/,
    );
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), replacement);
    assert.deepEqual((await fs.readdir(dir)).sort(), ['state.json']);
  });
});

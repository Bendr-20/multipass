import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildAllowlistBatchPlan,
  parseAllowlistBatchText,
} from '../src/allowlist-batch.js';

const execFileAsync = promisify(execFile);
const EXISTING = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const NEW_A = '0x0000000000000000000000000000000000000001';
const NEW_B = '0x0000000000000000000000000000000000000002';

test('parseAllowlistBatchText accepts JSON entries and checksum-normalizes addresses', () => {
  const entries = parseAllowlistBatchText(JSON.stringify({
    entries: [
      { address: NEW_A, source: 'vip import', registered_at: '2026-09-06T19:45:00.000Z' },
      { address: NEW_B.toLowerCase() },
    ],
  }));

  assert.deepEqual(entries, [
    { address: NEW_A, source: 'vip import', registered_at: '2026-09-06T19:45:00.000Z' },
    { address: NEW_B, source: null, registered_at: null },
  ]);
});

test('parseAllowlistBatchText accepts newline address lists with comments', () => {
  const entries = parseAllowlistBatchText(`
    # Loopers add-on list
    ${NEW_A}

    ${NEW_B}, partner-drop
  `);

  assert.deepEqual(entries, [
    { address: NEW_A, source: null, registered_at: null },
    { address: NEW_B, source: 'partner-drop', registered_at: null },
  ]);
});

test('buildAllowlistBatchPlan rejects invalid rows and duplicate batch addresses before merge', () => {
  assert.throws(
    () => buildAllowlistBatchPlan({
      existingEntries: [],
      batchEntries: [
        { address: NEW_A },
        { address: NEW_A.toLowerCase() },
        { address: 'not-an-address' },
      ],
    }),
    /duplicate address.+valid Ethereum address/is,
  );
});

test('buildAllowlistBatchPlan reports existing duplicates and produces merged preview entries', () => {
  const plan = buildAllowlistBatchPlan({
    existingEntries: [
      { address: EXISTING, registered_at: '2026-08-23T18:30:00.000Z', source: 'site' },
    ],
    batchEntries: [
      { address: EXISTING.toLowerCase(), source: 'manual' },
      { address: NEW_A, source: 'manual' },
      { address: NEW_B, registered_at: '2026-09-06T19:50:00.000Z' },
    ],
    defaultSource: 'quigley-import',
    generatedAt: '2026-09-06T20:00:00.000Z',
  });

  assert.equal(plan.old_count, 1);
  assert.equal(plan.added_count, 2);
  assert.equal(plan.skipped_existing_count, 1);
  assert.equal(plan.new_count, 3);
  assert.deepEqual(plan.skipped_existing.map((entry) => entry.address), [EXISTING]);
  assert.deepEqual(plan.added.map((entry) => entry.address), [NEW_A, NEW_B]);
  assert.equal(plan.added[0].source, 'manual');
  assert.equal(plan.added[1].source, 'quigley-import');
  assert.equal(plan.added[1].registered_at, '2026-09-06T19:50:00.000Z');
  assert.deepEqual(plan.mergedEntries.map((entry) => entry.address), [EXISTING, NEW_A, NEW_B]);
  assert.match(plan.snapshot.merkle.root, /^0x[0-9a-f]{64}$/);
  assert.equal(plan.snapshot.count, 3);
});

test('import-loopers-allowlist-batch script dry-runs and applies with a manifest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-allowlist-batch-'));
  const storePath = path.join(dir, 'allowlist.json');
  const batchPath = path.join(dir, 'batch.txt');
  const manifestPath = path.join(dir, 'manifest.json');

  try {
    await writeFile(storePath, `${JSON.stringify({
      schema_version: '0.1.0',
      generated_at: '2026-09-06T19:30:00.000Z',
      entries: [{ address: EXISTING, registered_at: '2026-08-23T18:30:00.000Z', source: 'site' }],
    }, null, 2)}\n`);
    await writeFile(batchPath, `${EXISTING}\n${NEW_A}, quigley-add\n`);

    const dryRun = await execFileAsync('node', [
      'apps/api/scripts/import-loopers-allowlist-batch.js',
      '--store',
      storePath,
      '--input',
      batchPath,
      '--manifest',
      manifestPath,
      '--generated-at',
      '2026-09-06T20:05:00.000Z',
    ], { cwd: process.cwd() });
    const dryRunBody = JSON.parse(dryRun.stdout);
    assert.equal(dryRunBody.dry_run, true);
    assert.equal(dryRunBody.added_count, 1);
    assert.equal(JSON.parse(await readFile(storePath, 'utf8')).entries.length, 1);

    const applied = await execFileAsync('node', [
      'apps/api/scripts/import-loopers-allowlist-batch.js',
      '--store',
      storePath,
      '--input',
      batchPath,
      '--apply',
      '--manifest',
      manifestPath,
      '--generated-at',
      '2026-09-06T20:06:00.000Z',
    ], { cwd: process.cwd() });
    const appliedBody = JSON.parse(applied.stdout);
    assert.equal(appliedBody.dry_run, false);
    assert.equal(appliedBody.new_count, 2);
    assert.equal(JSON.parse(await readFile(storePath, 'utf8')).entries.length, 2);
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).snapshot.count, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

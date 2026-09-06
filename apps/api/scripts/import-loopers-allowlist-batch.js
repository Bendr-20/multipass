#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildAllowlistBatchPlan,
  createMergedAllowlistFile,
  parseAllowlistBatchText,
} from '../src/allowlist-batch.js';

const args = parseArgs(process.argv.slice(2));
const storePath = args.store || process.env.MULTIPASS_LOOPERS_ALLOWLIST_PATH;
const inputPath = args.input;
const generatedAt = args.generatedAt || new Date().toISOString();

if (!storePath || !inputPath) {
  console.error('Usage: import-loopers-allowlist-batch.js --store /path/allowlist.json --input /path/batch.json|txt [--apply] [--source label] [--manifest /path/manifest.json]');
  console.error('You may omit --store when MULTIPASS_LOOPERS_ALLOWLIST_PATH is set.');
  process.exit(1);
}

const store = JSON.parse(await readFile(resolve(storePath), 'utf8'));
const batchEntries = parseAllowlistBatchText(await readFile(resolve(inputPath), 'utf8'));
const plan = buildAllowlistBatchPlan({
  existingEntries: store.entries ?? [],
  batchEntries,
  defaultSource: args.source || 'manual-import',
  generatedAt,
});

const manifest = {
  schema_version: '0.1.0',
  generated_at: generatedAt,
  dry_run: !args.apply,
  store: resolve(storePath),
  input: resolve(inputPath),
  old_count: plan.old_count,
  batch_count: plan.batch_count,
  added_count: plan.added_count,
  skipped_existing_count: plan.skipped_existing_count,
  new_count: plan.new_count,
  added: plan.added,
  skipped_existing: plan.skipped_existing,
  snapshot: plan.snapshot,
};

if (args.manifest) {
  await writeJsonAtomic(resolve(args.manifest), manifest);
}

if (args.apply) {
  await writeJsonAtomic(resolve(storePath), createMergedAllowlistFile({
    existing: store,
    mergedEntries: plan.mergedEntries,
    generatedAt,
  }));
}

console.log(JSON.stringify(manifest, null, 2));

function parseArgs(argv) {
  const parsed = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--store') parsed.store = argv[++index];
    else if (arg === '--input') parsed.input = argv[++index];
    else if (arg === '--source') parsed.source = argv[++index];
    else if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (arg === '--generated-at') parsed.generatedAt = argv[++index];
    else if (arg === '--apply') parsed.apply = true;
  }
  return parsed;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

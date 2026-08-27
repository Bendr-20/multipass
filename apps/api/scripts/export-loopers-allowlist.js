#!/usr/bin/env node
import { resolve } from 'node:path';

import { createAllowlistSnapshot, readAllowlistFile, writeAllowlistSnapshot } from '../src/allowlist-snapshot.js';

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input || process.env.MULTIPASS_LOOPERS_ALLOWLIST_PATH;
const outputPath = args.output;

if (!inputPath || !outputPath) {
  console.error('Usage: export-loopers-allowlist.js --input /path/allowlist.json --output /path/snapshot.json');
  console.error('You may omit --input when MULTIPASS_LOOPERS_ALLOWLIST_PATH is set.');
  process.exit(1);
}

const allowlist = await readAllowlistFile(resolve(inputPath));
const snapshot = createAllowlistSnapshot(allowlist);
await writeAllowlistSnapshot(snapshot, resolve(outputPath));

console.log(JSON.stringify({
  output: resolve(outputPath),
  count: snapshot.count,
  merkle_root: snapshot.merkle.root,
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') parsed.input = argv[++index];
    else if (arg === '--output') parsed.output = argv[++index];
  }
  return parsed;
}

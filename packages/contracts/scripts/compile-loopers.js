#!/usr/bin/env node
import { resolve } from 'node:path';

import { compileLoopers, writeArtifact } from './lib/loopers-compiler.js';

const args = parseArgs(process.argv.slice(2));
const artifact = await compileLoopers();
const outputPath = await writeArtifact(artifact, args.output ? resolve(args.output) : undefined);

console.log(JSON.stringify({
  artifact: outputPath,
  contract: artifact.contractName,
  abi_entries: artifact.abi.length,
  bytecode_bytes: (artifact.bytecode.length - 2) / 2,
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') parsed.output = argv[++index];
  }
  return parsed;
}

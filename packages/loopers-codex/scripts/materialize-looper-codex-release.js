#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { canonicalJsonHash } from '../src/canonical-json.js';
import {
  LOOPER_CODEX_COLLECTION,
  LOOPER_CODEX_COMPILER_VERSION,
} from '../src/constants.js';
import { materializeLooperCodexRelease } from '../src/release-manifest.js';

const HELP = `materialize-looper-codex-release

Usage:
  materialize-looper-codex-release \
    --metadata-dir PATH \
    --codex-dir PATH \
    --trait-personality-matrix PATH \
    --agent-class-model PATH \
    --hashlips-export-manifest PATH \
    --collection-provenance PATH \
    --output-dir PATH \
    --chain-id 8453 \
    --collection 0x1649CD37f4748807b4882FC48765bA0B2aFfa94a \
    --compiler-version 1.0.0 \
    --audited-at 2026-09-30T00:00:00.000Z
`;

const OPTION_TO_KEY = Object.freeze({
  '--metadata-dir': 'metadataDir',
  '--codex-dir': 'codexDir',
  '--trait-personality-matrix': 'traitPersonalityMatrixPath',
  '--agent-class-model': 'agentClassModelPath',
  '--hashlips-export-manifest': 'hashlipsExportManifestPath',
  '--collection-provenance': 'collectionProvenancePath',
  '--output-dir': 'outputDir',
  '--chain-id': 'chainId',
  '--collection': 'collection',
  '--compiler-version': 'compilerVersion',
  '--audited-at': 'auditedAt',
});

const PATH_KEYS = new Set([
  'metadataDir',
  'codexDir',
  'traitPersonalityMatrixPath',
  'agentClassModelPath',
  'hashlipsExportManifestPath',
  'collectionProvenancePath',
  'outputDir',
]);

export function parseMaterializerArguments(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (args.includes('--help')) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const key = OPTION_TO_KEY[option];
    if (!key) throw new Error(`unknown option ${option ?? '<missing>'}`);
    if (Object.hasOwn(options, key)) throw new Error(`duplicate option ${option}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`option ${option} requires a value`);
    }
    options[key] = value;
  }
  for (const [option, key] of Object.entries(OPTION_TO_KEY)) {
    if (!Object.hasOwn(options, key)) throw new Error(`missing required option ${option}`);
  }
  const chainId = Number(options.chainId);
  if (chainId !== LOOPER_CODEX_COLLECTION.chainId) {
    throw new Error(`chain ID must be ${LOOPER_CODEX_COLLECTION.chainId}`);
  }
  if (options.collection !== LOOPER_CODEX_COLLECTION.contract) {
    throw new Error(`collection must be ${LOOPER_CODEX_COLLECTION.contract}`);
  }
  if (options.compilerVersion !== LOOPER_CODEX_COMPILER_VERSION) {
    throw new Error(`compiler version must be ${LOOPER_CODEX_COMPILER_VERSION}`);
  }
  return {
    ...options,
    chainId,
    count: LOOPER_CODEX_COLLECTION.count,
  };
}

export async function runMaterializerCli(argv = process.argv.slice(2)) {
  const parsed = parseMaterializerArguments(argv);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  const manifest = await materializeLooperCodexRelease(parsed);
  process.stdout.write(
    `materialized count=${manifest.count} schema=${manifest.schemaVersion} manifest=${canonicalJsonHash(manifest)}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMaterializerCli().catch((error) => {
    process.stderr.write(`materialization failed: ${sanitizeError(error, process.argv.slice(2))}\n`);
    process.exitCode = 1;
  });
}

function sanitizeError(error, argv) {
  let message = error instanceof Error ? error.message : String(error);
  for (let index = 0; index < argv.length - 1; index += 1) {
    const key = OPTION_TO_KEY[argv[index]];
    if (PATH_KEYS.has(key)) {
      message = message.split(argv[index + 1]).join('<redacted-path>');
    }
  }
  return message.replace(/[\r\n]+/g, ' ');
}

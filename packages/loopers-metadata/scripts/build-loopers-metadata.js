#!/usr/bin/env node
import {
  LooperMetadataError,
  compileLooperMetadataFromDirs,
  validateImageFilesForBundle,
  writeLooperMetadataBundle,
} from '../src/index.js';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

try {
  const required = [
    'hashlipsJsonDir',
    'personalityMatrixPath',
    'classModelPath',
    'exportManifestPath',
    'outputDir',
    'imageBaseUri',
    'codexBaseUri',
  ];
  for (const key of required) {
    if (!args[key]) throw new LooperMetadataError(`Missing required option --${toFlag(key)}`);
  }

  const bundle = await compileLooperMetadataFromDirs({
    hashlipsJsonDir: args.hashlipsJsonDir,
    personalityMatrixPath: args.personalityMatrixPath,
    classModelPath: args.classModelPath,
    exportManifestPath: args.exportManifestPath,
    outputDir: args.outputDir,
    imageBaseUri: args.imageBaseUri,
    codexBaseUri: args.codexBaseUri,
    externalUrlBase: args.externalUrlBase,
    expectedCount: args.expectedCount ? Number(args.expectedCount) : null,
    generatedAt: args.generatedAt,
    requireCompleteClassAffinities: !args.allowIncompleteClassAffinities,
  });

  const imageValidation = await validateImageFilesForBundle(bundle, args.hashlipsImagesDir);
  if (!imageValidation.ok) {
    throw new LooperMetadataError('HashLips image output is incomplete', imageValidation.issues);
  }

  await writeLooperMetadataBundle(bundle, args.outputDir);
  console.log(`Wrote ${bundle.count} Looper token metadata files and Agent Codex files to ${args.outputDir}`);
} catch (error) {
  if (error instanceof LooperMetadataError) {
    console.error(error.message);
  } else {
    console.error(error?.stack ?? String(error));
  }
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = toCamel(arg.slice(2));
    if (key === 'allowIncompleteClassAffinities') {
      parsed[key] = true;
      continue;
    }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toFlag(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function printUsage() {
  console.log(`Usage:
  pnpm loopers:metadata -- \\
    --hashlips-json-dir /path/to/hashlips/build/json \\
    --hashlips-images-dir /path/to/hashlips/build/images \\
    --export-manifest-path /path/to/hashlips-engine-export-v01-manifest.json \\
    --personality-matrix-path /path/to/trait-personality-matrix.json \\
    --class-model-path /path/to/agent-class-model.json \\
    --output-dir /private/final-loopers-metadata \\
    --image-base-uri ar://FINAL_IMAGE_BUNDLE \\
    --codex-base-uri ar://FINAL_CODEX_BUNDLE/codex \\
    --external-url-base https://helixa.xyz/multipass/loopers \\
    --expected-count 7777

By default this fails unless every non-None approved trait has class affinities.
Use --allow-incomplete-class-affinities only for draft/local QA output.`);
}

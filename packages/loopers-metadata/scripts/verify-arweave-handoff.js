#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  LooperMetadataError,
  compileLooperMetadataFromDirs,
  readJsonFile,
  validateImageFilesForBundle,
  validateLooperMetadataBundle,
  writeLooperMetadataBundle,
} from '../src/index.js';

const ARWEAVE_TX_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STAGING_URI_PATTERNS = [
  /loopers-full-/i,
  /placeholder/i,
  /REPLACE_WITH/i,
  /NewUriToReplace/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /\/home\//i,
  /file:\/\//i,
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

try {
  const required = [
    'hashlipsJsonDir',
    'hashlipsImagesDir',
    'personalityMatrixPath',
    'classModelPath',
    'exportManifestPath',
    'outputDir',
    'placeholderMetadataPath',
    'placeholderTokenUri',
    'imageBaseUri',
    'metadataBaseUri',
    'codexBaseUri',
    'expectedCount',
    'revealOffset',
  ];
  for (const key of required) {
    if (!args[key]) throw new LooperMetadataError(`Missing required option --${toFlag(key)}`);
  }

  const expectedCount = toPositiveInteger(args.expectedCount, '--expected-count');
  const revealOffset = toNonNegativeInteger(args.revealOffset, '--reveal-offset') % expectedCount;
  const paths = {
    hashlipsJsonDir: resolveInputPath(args.hashlipsJsonDir),
    hashlipsImagesDir: resolveInputPath(args.hashlipsImagesDir),
    personalityMatrixPath: resolveInputPath(args.personalityMatrixPath),
    classModelPath: resolveInputPath(args.classModelPath),
    exportManifestPath: resolveInputPath(args.exportManifestPath),
    outputDir: resolveInputPath(args.outputDir),
    placeholderMetadataPath: resolveInputPath(args.placeholderMetadataPath),
    reportPath: args.reportPath ? resolveInputPath(args.reportPath) : null,
  };
  const placeholderTokenUri = validateArweaveUri(args.placeholderTokenUri, '--placeholder-token-uri', {
    mustEndWithJson: true,
  });
  const imageBaseUri = validateArweaveUri(args.imageBaseUri, '--image-base-uri');
  const metadataBaseUri = validateArweaveUri(args.metadataBaseUri, '--metadata-base-uri', {
    requireTrailingSlash: true,
  });
  const codexBaseUri = validateArweaveUri(args.codexBaseUri, '--codex-base-uri');

  if (!codexBaseUri.normalized.endsWith('/codex')) {
    throw new LooperMetadataError('--codex-base-uri must end with /codex so token codex links are deterministic');
  }
  const codexDerivedMetadataBase = `${codexBaseUri.normalized.slice(0, -'/codex'.length)}/metadata/`;
  if (codexDerivedMetadataBase !== metadataBaseUri.normalized) {
    throw new LooperMetadataError('metadata and codex bases must share one final Arweave manifest root', [
      `metadata base: ${metadataBaseUri.normalized}`,
      `codex-derived metadata base: ${codexDerivedMetadataBase}`,
    ]);
  }

  const placeholderMetadata = await readJsonFile(paths.placeholderMetadataPath);
  const placeholderIssues = validatePlaceholderMetadata(placeholderMetadata);
  if (placeholderIssues.length) {
    throw new LooperMetadataError('Placeholder metadata is not upload-ready', placeholderIssues);
  }

  const bundle = await compileLooperMetadataFromDirs({
    hashlipsJsonDir: paths.hashlipsJsonDir,
    personalityMatrixPath: paths.personalityMatrixPath,
    classModelPath: paths.classModelPath,
    exportManifestPath: paths.exportManifestPath,
    outputDir: paths.outputDir,
    imageBaseUri: imageBaseUri.normalized,
    codexBaseUri: codexBaseUri.normalized,
    externalUrlBase: args.externalUrlBase,
    expectedCount,
    generatedAt: args.generatedAt,
    requireCompleteClassAffinities: !args.allowIncompleteClassAffinities,
  });

  const validation = validateLooperMetadataBundle(bundle);
  if (!validation.ok) {
    throw new LooperMetadataError('Compiled final Arweave metadata failed validation', validation.issues);
  }

  const imageValidation = await validateImageFilesForBundle(bundle, paths.hashlipsImagesDir);
  if (!imageValidation.ok) {
    throw new LooperMetadataError('HashLips image output is incomplete', imageValidation.issues);
  }

  await writeLooperMetadataBundle(bundle, paths.outputDir);

  const sampleTokenIds = sampleIds(expectedCount);
  const revealSamples = [];
  const sampleIssues = [];
  for (const tokenId of sampleTokenIds) {
    const metadataId = ((tokenId - 1 + revealOffset) % expectedCount) + 1;
    const tokenUri = `${metadataBaseUri.normalized}${metadataId}.json`;
    const token = await readJsonFile(join(paths.outputDir, 'metadata', `${metadataId}.json`));
    const codex = await readJsonFile(join(paths.outputDir, 'codex', `${metadataId}.json`));

    if (token.name !== `Looper #${metadataId}`) {
      sampleIssues.push(`tokenURI sample ${tokenId} resolved to ${token.name}, expected Looper #${metadataId}`);
    }
    if (token.image !== `${imageBaseUri.normalized}/${metadataId}.png`) {
      sampleIssues.push(`Looper #${metadataId} image URI mismatch: ${token.image}`);
    }
    if (token.codex_uri !== `${codexBaseUri.normalized}/${metadataId}.json`) {
      sampleIssues.push(`Looper #${metadataId} codex URI mismatch: ${token.codex_uri}`);
    }
    if (codex.token_metadata_uri !== tokenUri) {
      sampleIssues.push(`Looper #${metadataId} Codex token_metadata_uri mismatch: ${codex.token_metadata_uri}`);
    }

    revealSamples.push({
      token_id: tokenId,
      metadata_id: metadataId,
      token_uri: tokenUri,
      image: token.image,
      codex_uri: token.codex_uri,
    });
  }
  if (sampleIssues.length) throw new LooperMetadataError('Reveal URI samples failed', sampleIssues);

  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    expected_count: expectedCount,
    reveal_offset: revealOffset,
    placeholder_token_uri: placeholderTokenUri.normalized,
    image_base_uri: imageBaseUri.normalized,
    metadata_base_uri: metadataBaseUri.normalized,
    codex_base_uri: codexBaseUri.normalized,
    output_dir: paths.outputDir,
    reveal_samples: revealSamples,
  };

  if (paths.reportPath) {
    await mkdir(dirname(paths.reportPath), { recursive: true });
    await writeFile(paths.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(`Loopers Arweave handoff dry-run passed for ${expectedCount} tokens`);
  console.log(`Placeholder token URI: ${placeholderTokenUri.normalized}`);
  console.log(`Reveal base URI: ${metadataBaseUri.normalized}`);
  console.log(`Reveal offset: ${revealOffset}`);
  console.log(`Sample tokenURI(1): ${revealSamples[0]?.token_uri}`);
  if (paths.reportPath) console.log(`Report: ${paths.reportPath}`);
} catch (error) {
  if (error instanceof LooperMetadataError) {
    console.error(error.message);
  } else {
    console.error(error?.stack ?? String(error));
  }
  process.exit(1);
}

function validatePlaceholderMetadata(metadata) {
  const issues = [];
  if (metadata?.name !== 'Loopers') issues.push('placeholder name must be Loopers');
  if (!metadata?.description || /final art|traits reveal/i.test(metadata.description) === false) {
    issues.push('placeholder description should clearly say final art/traits are unrevealed');
  }
  if (!/^https:\/\//i.test(String(metadata?.image ?? ''))) {
    issues.push('placeholder image must use an HTTPS public-safe image');
  }
  if (!/^https:\/\//i.test(String(metadata?.external_url ?? ''))) {
    issues.push('placeholder external_url must use HTTPS');
  }
  if (!Array.isArray(metadata?.attributes) || metadata.attributes.length === 0) {
    issues.push('placeholder attributes must be present');
  }
  return issues;
}

function resolveInputPath(value) {
  const path = String(value ?? '').trim();
  if (!path) return path;
  return isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function validateArweaveUri(value, label, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new LooperMetadataError(`${label} is required`);
  for (const pattern of STAGING_URI_PATTERNS) {
    if (pattern.test(raw)) throw new LooperMetadataError(`${label} contains staging/private value matching ${pattern}`);
  }

  const parsed = parseArweaveUri(raw);
  if (!parsed) {
    throw new LooperMetadataError(`${label} must be a real Arweave URI`, [
      'Use ar://<43-char-tx-id>/... or https://arweave.net/<43-char-tx-id>/...',
    ]);
  }
  if (options.requireTrailingSlash) {
    parsed.normalized = `${parsed.normalized.replace(/\/+$/, '')}/`;
  } else if (!options.mustEndWithJson) {
    parsed.normalized = parsed.normalized.replace(/\/+$/, '');
  }
  if (options.mustEndWithJson && !parsed.normalized.endsWith('.json')) {
    throw new LooperMetadataError(`${label} must point to a JSON file`);
  }
  return parsed;
}

function parseArweaveUri(raw) {
  const collapsedTrailingSlash = raw.replace(/\/+$/, '/');
  const arMatch = /^ar:\/\/([A-Za-z0-9_-]{43})(\/.*)?$/i.exec(collapsedTrailingSlash);
  if (arMatch) return parsedUri(arMatch[1], collapsedTrailingSlash);
  const httpsMatch = /^https:\/\/arweave\.net\/([A-Za-z0-9_-]{43})(\/.*)?$/i.exec(collapsedTrailingSlash);
  if (httpsMatch) return parsedUri(httpsMatch[1], collapsedTrailingSlash);
  return null;
}

function parsedUri(txId, normalized) {
  if (!ARWEAVE_TX_ID_PATTERN.test(txId)) return null;
  return { txId, normalized };
}

function sampleIds(expectedCount) {
  return [...new Set([1, 2, 777, 1777, 3777, 5777, expectedCount].filter((id) => id >= 1 && id <= expectedCount))];
}

function toPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new LooperMetadataError(`${label} must be a positive integer`);
  return number;
}

function toNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new LooperMetadataError(`${label} must be a non-negative integer`);
  return number;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
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
  pnpm loopers:verify-arweave-handoff -- \\
    --hashlips-json-dir /private/hashlips/build/json \\
    --hashlips-images-dir /private/hashlips/build/images \\
    --export-manifest-path /private/hashlips-engine-export-v01-manifest.json \\
    --personality-matrix-path /private/trait-personality-matrix.json \\
    --class-model-path /private/agent-class-model.json \\
    --placeholder-metadata-path artifacts/loopers-placeholder-mainnet/metadata.json \\
    --placeholder-token-uri https://arweave.net/<PLACEHOLDER_TX_ID>/metadata.json \\
    --image-base-uri https://arweave.net/<IMAGE_MANIFEST_TX_ID> \\
    --metadata-base-uri https://arweave.net/<FINAL_MANIFEST_TX_ID>/metadata/ \\
    --codex-base-uri https://arweave.net/<FINAL_MANIFEST_TX_ID>/codex \\
    --output-dir /private/final-loopers-arweave-dry-run \\
    --expected-count 7777 \\
    --reveal-offset 5911

This dry-runs the exact metadata rewrite and reveal tokenURI math without uploading anything.`);
}

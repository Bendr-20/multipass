#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { LooperMetadataError, readJsonFile, validateLooperMetadataBundle } from '../src/index.js';

const VISUAL_LAYERS = [
  'Background',
  'Outfit',
  'Skin',
  'Eyes',
  'Mouth',
  'Head Layer',
  'Eyewear',
  'Held Object',
  'Foreground Scraps',
  'Artifact',
  'Overlay',
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

try {
  const required = ['metadataDir', 'codexDir', 'imagesDir', 'expectedCount'];
  for (const key of required) {
    if (!args[key]) throw new LooperMetadataError(`Missing required option --${toFlag(key)}`);
  }

  const expectedCount = Number(args.expectedCount);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new LooperMetadataError('--expected-count must be a positive integer');
  }

  const tokenFiles = await readNumberedJsonFiles(args.metadataDir);
  const codexFiles = await readNumberedJsonFiles(args.codexDir);
  const imageFiles = await readNumberedPngFiles(args.imagesDir);

  const issues = [
    ...validateContiguousIds('token metadata', tokenFiles.ids, expectedCount),
    ...validateContiguousIds('Agent Codex', codexFiles.ids, expectedCount),
    ...validateContiguousIds('images', imageFiles.ids, expectedCount),
  ];

  const tokenMetadata = await readJsonItems(args.metadataDir, tokenFiles.ids);
  const agentCodex = await readJsonItems(args.codexDir, codexFiles.ids);

  const bundleValidation = validateLooperMetadataBundle({
    schema_version: '0.1.0',
    generated_at: new Date(0).toISOString(),
    collection: 'Loopers',
    count: tokenMetadata.length,
    token_metadata: tokenMetadata,
    agent_codex: agentCodex,
  });
  if (!bundleValidation.ok) issues.push(...bundleValidation.issues);

  const traitSummary = summarizeTraits(tokenMetadata, issues);
  const imageSummary = await summarizeImages(args.imagesDir, imageFiles.ids, issues);
  const tokenUriSummary = summarizeTokenUris(tokenMetadata, agentCodex, issues);

  const report = {
    ok: issues.length === 0,
    generated_at: new Date().toISOString(),
    expected_count: expectedCount,
    counts: {
      token_metadata: tokenFiles.ids.length,
      agent_codex: codexFiles.ids.length,
      images: imageFiles.ids.length,
    },
    token_uris: tokenUriSummary,
    images: imageSummary,
    traits: traitSummary,
    issues,
  };

  if (args.reportPath) {
    await mkdir(dirname(args.reportPath), { recursive: true });
    await writeFile(args.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (!report.ok) {
    console.error(`Loopers bundle preflight failed with ${issues.length} issue(s)`);
    for (const issue of issues.slice(0, 50)) console.error(`- ${issue}`);
    if (issues.length > 50) console.error(`- ...${issues.length - 50} more`);
    process.exit(1);
  }

  console.log(`Loopers bundle preflight passed for ${expectedCount} tokens`);
  console.log(`Images: ${imageSummary.total_bytes} bytes across ${imageSummary.unique_dimensions.length} dimension set(s)`);
  console.log(`Token images: ${tokenUriSummary.image_base_uri}`);
  console.log(`Codex URIs: ${tokenUriSummary.codex_base_uri}`);
  if (args.reportPath) console.log(`Report: ${args.reportPath}`);
} catch (error) {
  if (error instanceof LooperMetadataError) {
    console.error(error.message);
  } else {
    console.error(error?.stack ?? String(error));
  }
  process.exit(1);
}

async function readNumberedJsonFiles(dir) {
  const ids = (await readdir(dir))
    .filter((file) => /^\d+\.json$/.test(file))
    .map((file) => Number(file.slice(0, -5)))
    .sort((a, b) => a - b);
  return { ids };
}

async function readNumberedPngFiles(dir) {
  const ids = (await readdir(dir))
    .filter((file) => /^\d+\.png$/.test(file))
    .map((file) => Number(file.slice(0, -4)))
    .sort((a, b) => a - b);
  return { ids };
}

function validateContiguousIds(label, ids, expectedCount) {
  const issues = [];
  if (ids.length !== expectedCount) issues.push(`${label} count mismatch: expected ${expectedCount}, found ${ids.length}`);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) issues.push(`${label} duplicate id ${id}`);
    seen.add(id);
  }
  for (let id = 1; id <= expectedCount; id += 1) {
    if (!seen.has(id)) issues.push(`${label} missing id ${id}`);
  }
  return issues;
}

async function readJsonItems(dir, ids) {
  const items = [];
  for (const id of ids) items.push(await readJsonFile(join(dir, `${id}.json`)));
  return items;
}

function summarizeTraits(tokens, issues) {
  const byLayer = {};
  for (const token of tokens) {
    const id = Number(String(token.name ?? '').replace('Looper #', ''));
    const attributes = Array.isArray(token.attributes) ? token.attributes : [];
    const visualAttributes = attributes.filter((attribute) => VISUAL_LAYERS.includes(attribute.trait_type));
    const layerNames = new Set(visualAttributes.map((attribute) => attribute.trait_type));
    for (const layer of VISUAL_LAYERS) {
      if (!layerNames.has(layer)) issues.push(`Looper #${id} missing visual layer ${layer}`);
    }

    const heldObject = attributes.find((attribute) => attribute.trait_type === 'Held Object')?.value ?? 'None';
    const artifact = attributes.find((attribute) => attribute.trait_type === 'Artifact')?.value ?? 'None';
    if (heldObject !== 'None' && artifact !== 'None') {
      issues.push(`Looper #${id} has held object '${heldObject}' with artifact '${artifact}'`);
    }

    for (const attribute of visualAttributes) {
      const layer = attribute.trait_type;
      const value = attribute.value;
      byLayer[layer] ??= { total: 0, non_none: 0, values: {} };
      byLayer[layer].total += 1;
      if (value !== 'None') byLayer[layer].non_none += 1;
      byLayer[layer].values[value] = (byLayer[layer].values[value] ?? 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(byLayer).map(([layer, summary]) => [
      layer,
      {
        total: summary.total,
        non_none: summary.non_none,
        unique_values: Object.keys(summary.values).length,
        top_values: Object.entries(summary.values)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, count]) => ({ value, count })),
      },
    ]),
  );
}

async function summarizeImages(imagesDir, ids, issues) {
  let totalBytes = 0;
  const dimensions = new Map();
  const sampleHashes = {};
  const hashSampleIds = new Set([1, 777, 1777, 3777, 5777, 7777].filter((id) => ids.includes(id)));

  for (const id of ids) {
    const filePath = join(imagesDir, `${id}.png`);
    const fileStat = await stat(filePath);
    totalBytes += fileStat.size;
    if (fileStat.size <= 0) issues.push(`image ${id}.png is empty`);

    const header = await readFileHeader(filePath, 24);
    const pngInfo = readPngInfo(header);
    if (!pngInfo.ok) {
      issues.push(`image ${id}.png is not a valid PNG`);
    } else {
      const key = `${pngInfo.width}x${pngInfo.height}`;
      dimensions.set(key, (dimensions.get(key) ?? 0) + 1);
    }
    if (hashSampleIds.has(id)) {
      sampleHashes[`${id}.png`] = createHash('sha256').update(await readFile(filePath)).digest('hex');
    }
  }

  return {
    total_bytes: totalBytes,
    unique_dimensions: [...dimensions.entries()].map(([dimensionsKey, count]) => ({ dimensions: dimensionsKey, count })),
    sample_sha256: sampleHashes,
  };
}

async function readFileHeader(filePath, byteLength) {
  const file = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(byteLength);
    const { bytesRead } = await file.read(buffer, 0, byteLength, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function readPngInfo(buffer) {
  if (buffer.length < 24) return { ok: false };
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return { ok: false };
  return {
    ok: true,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function summarizeTokenUris(tokens, codex, issues) {
  const imageBases = new Set();
  const codexBases = new Set();
  const tokenMetadataBases = new Set();

  for (const token of tokens) {
    const id = Number(String(token.name ?? '').replace('Looper #', ''));
    const image = String(token.image ?? '');
    const codexUri = String(token.codex_uri ?? '');
    if (!image.endsWith(`/${id}.png`)) issues.push(`Looper #${id} image URI does not end with /${id}.png`);
    if (!codexUri.endsWith(`/codex/${id}.json`)) issues.push(`Looper #${id} codex URI does not end with /codex/${id}.json`);
    imageBases.add(image.replace(/\/\d+\.png$/, ''));
    codexBases.add(codexUri.replace(/\/codex\/\d+\.json$/, '/codex'));
  }

  for (const doc of codex) {
    const id = Number(doc.token_id);
    const tokenMetadataUri = String(doc.token_metadata_uri ?? '');
    if (!tokenMetadataUri.endsWith(`/metadata/${id}.json`)) {
      issues.push(`Looper #${id} token_metadata_uri does not end with /metadata/${id}.json`);
    }
    tokenMetadataBases.add(tokenMetadataUri.replace(/\/metadata\/\d+\.json$/, '/metadata'));
  }

  if (imageBases.size !== 1) issues.push(`found ${imageBases.size} image base URIs`);
  if (codexBases.size !== 1) issues.push(`found ${codexBases.size} codex base URIs`);
  if (tokenMetadataBases.size !== 1) issues.push(`found ${tokenMetadataBases.size} token metadata base URIs`);

  return {
    image_base_uri: [...imageBases][0] ?? null,
    codex_base_uri: [...codexBases][0] ?? null,
    token_metadata_base_uri: [...tokenMetadataBases][0] ?? null,
  };
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
    parsed[toCamel(arg.slice(2))] = argv[index + 1];
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
  node packages/loopers-metadata/scripts/verify-loopers-bundle.js \\
    --metadata-dir /private/final-loopers-metadata/metadata \\
    --codex-dir /private/final-loopers-metadata/codex \\
    --images-dir /private/hashlips/build/images \\
    --expected-count 7777 \\
    --report-path /private/final-loopers-metadata/preflight-report.json`);
}

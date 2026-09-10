#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (isDirectRun(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node packages/loopers-metadata/scripts/settle-loopers-bounties.js \\
    --metadata-dir /path/to/final/metadata \\
    --mints-path /path/to/mints.json \\
    --bounties-path /path/to/bounties.json \\
    --output-path /path/to/settlement.json

Inputs:
  mints.json: { "mints": [{ "token_id": 1, "minter": "0x...", "tx_hash": "0x...", "block_number": 1, "log_index": 0, "eligible": true }] }
  bounties.json: { "bounties": [{ "id": "pikachu-artifact", "status": "active", "trait_type": "Artifact", "value": "Pikachu", "reward_amount": 100, "reward_symbol": "CRED" }] }
`);
    return;
  }

  for (const key of ['metadataDir', 'mintsPath', 'bountiesPath', 'outputPath']) {
    if (!args[key]) throw new Error(`Missing required argument: --${toKebabCase(key)}`);
  }

  const report = await settleLoopersBounties({
    metadataDir: args.metadataDir,
    mintsPath: args.mintsPath,
    bountiesPath: args.bountiesPath,
  });

  await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Settled ${report.settlements.length} active Loopers mint bounties`);
}

export async function settleLoopersBounties({ metadataDir, mintsPath, bountiesPath }) {
  const mints = readArray(await readJson(mintsPath), 'mints')
    .filter((mint) => mint?.eligible !== false)
    .sort(compareMintOrder);
  const bounties = readArray(await readJson(bountiesPath), 'bounties')
    .filter((bounty) => bounty?.status === 'active');

  const tokenCache = new Map();
  const settlements = [];
  for (const bounty of bounties) {
    let winner = null;
    for (const mint of mints) {
      const token = await readTokenMetadata(metadataDir, mint.token_id, tokenCache);
      if (!tokenHasTrait(token, bounty.trait_type, bounty.value)) continue;
      winner = {
        token_id: Number(mint.token_id),
        minter: mint.minter ?? '',
        tx_hash: mint.tx_hash ?? '',
        block_number: mint.block_number ?? null,
        log_index: mint.log_index ?? null,
      };
      break;
    }

    settlements.push({
      bounty_id: String(bounty.id ?? `${bounty.trait_type}:${bounty.value}`),
      trait: {
        trait_type: String(bounty.trait_type ?? ''),
        value: String(bounty.value ?? ''),
      },
      reward: {
        amount: Number(bounty.reward_amount ?? 0),
        symbol: String(bounty.reward_symbol ?? ''),
      },
      winner,
    });
  }

  return {
    schema_version: '0.1.0',
    generated_at: new Date().toISOString(),
    metadata_dir: metadataDir,
    mint_count: mints.length,
    settlements,
  };
}

async function readTokenMetadata(metadataDir, tokenId, cache) {
  const normalized = Number(tokenId);
  if (!Number.isInteger(normalized) || normalized <= 0) throw new Error(`Invalid token_id: ${tokenId}`);
  if (cache.has(normalized)) return cache.get(normalized);
  const token = await readJson(path.join(metadataDir, `${normalized}.json`));
  cache.set(normalized, token);
  return token;
}

function tokenHasTrait(token, traitType, value) {
  const expectedType = String(traitType ?? '');
  const expectedValue = String(value ?? '');
  return Array.isArray(token?.attributes)
    && token.attributes.some((attribute) => attribute?.trait_type === expectedType && attribute?.value === expectedValue);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function readArray(value, key) {
  if (!Array.isArray(value?.[key])) throw new Error(`Expected ${key} array`);
  return value[key];
}

function compareMintOrder(left, right) {
  return compareNullableNumber(left.block_number, right.block_number)
    || compareNullableNumber(left.log_index, right.log_index)
    || String(left.tx_hash ?? '').localeCompare(String(right.tx_hash ?? ''));
}

function compareNullableNumber(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const safeLeft = Number.isFinite(leftNumber) ? leftNumber : Number.MAX_SAFE_INTEGER;
  const safeRight = Number.isFinite(rightNumber) ? rightNumber : Number.MAX_SAFE_INTEGER;
  return safeLeft - safeRight;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--metadata-dir') parsed.metadataDir = argv[++index];
    else if (arg === '--mints-path') parsed.mintsPath = argv[++index];
    else if (arg === '--bounties-path') parsed.bountiesPath = argv[++index];
    else if (arg === '--output-path') parsed.outputPath = argv[++index];
    else if (arg === '--help') parsed.help = true;
  }
  return parsed;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isDirectRun(url) {
  return process.argv[1] && fileURLToPath(url) === path.resolve(process.argv[1]);
}

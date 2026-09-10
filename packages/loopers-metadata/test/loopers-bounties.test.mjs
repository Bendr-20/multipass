import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(execFileCallback);

test('settle-loopers-bounties picks the first eligible mint for each active trait bounty', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loopers-bounties-'));
  const metadataDir = path.join(dir, 'metadata');
  const outputPath = path.join(dir, 'settlement.json');
  const mintsPath = path.join(dir, 'mints.json');
  const bountiesPath = path.join(dir, 'bounties.json');
  const scriptPath = fileURLToPath(new URL('../scripts/settle-loopers-bounties.js', import.meta.url));

  await writeToken(metadataDir, 1, 'Mario');
  await writeToken(metadataDir, 2, 'Pikachu');
  await writeToken(metadataDir, 3, 'Toshi');
  await writeToken(metadataDir, 4, 'Pikachu');

  await writeJson(bountiesPath, {
    bounties: [
      { id: 'pikachu-artifact', status: 'active', trait_type: 'Artifact', value: 'Pikachu', reward_amount: 100, reward_symbol: 'CRED' },
      { id: 'mario-artifact', status: 'active', trait_type: 'Artifact', value: 'Mario', reward_amount: 100, reward_symbol: 'CRED' },
      { id: 'toshi-artifact', status: 'active', trait_type: 'Artifact', value: 'Toshi', reward_amount: 100, reward_symbol: 'TOSHI' },
    ],
  });
  await writeJson(mintsPath, {
    mints: [
      { token_id: 4, minter: '0xSkip', tx_hash: '0xineligible', block_number: 1, log_index: 1, eligible: false },
      { token_id: 2, minter: '0xPika', tx_hash: '0xpika', block_number: 2, log_index: 1 },
      { token_id: 3, minter: '0xToshi', tx_hash: '0xtoshi', block_number: 3, log_index: 1 },
      { token_id: 1, minter: '0xMario', tx_hash: '0xmario', block_number: 4, log_index: 1 },
    ],
  });

  const result = await execFile(process.execPath, [
    scriptPath,
    '--metadata-dir', metadataDir,
    '--mints-path', mintsPath,
    '--bounties-path', bountiesPath,
    '--output-path', outputPath,
  ]);

  assert.match(result.stdout, /Settled 3 active Loopers mint bounties/);
  const report = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(report.settlements.length, 3);
  assert.deepEqual(report.settlements.map((settlement) => settlement.bounty_id), [
    'pikachu-artifact',
    'mario-artifact',
    'toshi-artifact',
  ]);
  assert.deepEqual(report.settlements.map((settlement) => settlement.winner?.token_id), [2, 1, 3]);
  assert.deepEqual(report.settlements.map((settlement) => settlement.reward), [
    { amount: 100, symbol: 'CRED' },
    { amount: 100, symbol: 'CRED' },
    { amount: 100, symbol: 'TOSHI' },
  ]);
});

async function writeToken(metadataDir, tokenId, artifact) {
  await writeJson(path.join(metadataDir, `${tokenId}.json`), {
    name: `Looper #${tokenId}`,
    attributes: [
      { trait_type: 'Artifact', value: artifact },
      { trait_type: 'Background', value: 'Ignored Background' },
    ],
  });
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

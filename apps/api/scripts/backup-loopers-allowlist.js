#!/usr/bin/env node
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input || process.env.MULTIPASS_LOOPERS_ALLOWLIST_PATH;
const backupDir = args.backupDir || process.env.MULTIPASS_LOOPERS_ALLOWLIST_BACKUP_DIR || '/var/lib/helixa/backups/loopers-allowlist';

if (!inputPath) {
  console.error('Usage: backup-loopers-allowlist.js --input /path/allowlist.json [--backup-dir /path/backups]');
  console.error('You may omit --input when MULTIPASS_LOOPERS_ALLOWLIST_PATH is set.');
  process.exit(1);
}

const source = resolve(inputPath);
const sourceStat = await stat(source);
if (!sourceStat.isFile()) {
  throw new Error(`Allowlist path is not a file: ${source}`);
}

await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const destination = join(resolve(backupDir), `${stamp}-${basename(source)}`);
await copyFile(source, destination);

console.log(JSON.stringify({
  backup: destination,
  source,
  bytes: sourceStat.size,
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') parsed.input = argv[++index];
    else if (arg === '--backup-dir') parsed.backupDir = argv[++index];
  }
  return parsed;
}

#!/usr/bin/env node
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  compileLooperCodexArtifact,
  serializeLooperCodexArtifact,
  verifyLooperCodexArtifact,
} from '../src/compiler.js';
import { LOOPER_CODEX_COLLECTION, LOOPER_CODEX_LIMITS } from '../src/constants.js';
import { readRegularFile, requireLocalFilesystemPath } from '../src/safe-files.js';

const HELP = `Usage: build-looper-codex --release-dir <path> --output <path>
`;

export async function buildLooperCodexFile({
  releaseDir,
  output,
  expectedCount = LOOPER_CODEX_COLLECTION.count,
}) {
  requireLocalFilesystemPath(releaseDir, 'releaseDir');
  requireLocalFilesystemPath(output, 'output');
  await requireMissing(output);
  const artifact = await compileLooperCodexArtifact({ releaseDir, expectedCount });
  const serialized = serializeLooperCodexArtifact(artifact);
  if (Buffer.byteLength(serialized) > LOOPER_CODEX_LIMITS.artifactBytes) {
    throw new RangeError(`artifact exceeds byte limit of ${LOOPER_CODEX_LIMITS.artifactBytes}`);
  }

  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(parent, `.${basename(output)}.tmp-`));
  const temporaryFile = join(temporaryDirectory, 'artifact.json');
  try {
    await writeFile(temporaryFile, serialized, { flag: 'wx' });
    const bytes = await readRegularFile(temporaryFile, {
      maxBytes: LOOPER_CODEX_LIMITS.artifactBytes,
      label: 'runtime artifact',
    });
    const reread = JSON.parse(bytes.toString('utf8'));
    verifyLooperCodexArtifact(reread, {
      expectedCount,
      expectedSourceHashes: artifact.semantic.sourceHashes,
    });
    await rename(temporaryFile, output);
    return reread;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const args = argv.filter((argument) => argument !== '--');
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!['--release-dir', '--output'].includes(flag) || !value || value.startsWith('--')) {
      throw new TypeError(`Unknown or incomplete argument: ${flag ?? '<missing>'}`);
    }
    if (flag === '--release-dir') result.releaseDir = value;
    else result.output = value;
  }
  if (!result.releaseDir || !result.output) throw new TypeError('Both --release-dir and --output are required');
  return result;
}

async function requireMissing(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('output already exists');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const testExpectedCount = process.env.NODE_ENV === 'test'
    ? Number(process.env.LOOPER_CODEX_TEST_EXPECTED_COUNT || LOOPER_CODEX_COLLECTION.count)
    : LOOPER_CODEX_COLLECTION.count;
  const artifact = await buildLooperCodexFile({ ...options, expectedCount: testExpectedCount });
  process.stdout.write(
    `count=${artifact.semantic.count} schema=${artifact.semantic.schemaVersion} hash=${artifact.artifactHash}\n`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

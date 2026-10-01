import { createHash } from 'node:crypto';
import { constants as fileConstants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJsonHash } from './canonical-json.js';

const HTTP_PATH = /^https?:\/\//i;

export function requireLocalFilesystemPath(path, label = 'path') {
  if (typeof path !== 'string' || path.length === 0 || HTTP_PATH.test(path)) {
    throw new TypeError(`${label} must be a local filesystem path`);
  }
  return path;
}

export async function requireRegularDirectory(path, label = 'directory') {
  requireLocalFilesystemPath(path, label);
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    throw contextualize(error, `Cannot inspect ${label}`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new TypeError(`${label} must be a regular non-symlink directory`);
  }
  return stats;
}

export async function readRegularFile(path, { maxBytes, label = 'file' } = {}) {
  requireLocalFilesystemPath(path, label);
  requirePositiveSafeInteger(maxBytes, 'maxBytes');

  let pathStats;
  try {
    pathStats = await lstat(path);
  } catch (error) {
    throw contextualize(error, `Cannot inspect ${label}`);
  }
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) {
    throw new TypeError(`${label} must be a regular non-symlink file`);
  }
  if (pathStats.size > maxBytes) {
    throw new RangeError(`${label} exceeds per-file byte limit of ${maxBytes}`);
  }

  let handle;
  try {
    handle = await open(path, fileConstants.O_RDONLY | (fileConstants.O_NOFOLLOW ?? 0));
    const openedStats = await handle.stat();
    if (!openedStats.isFile()) {
      throw new TypeError(`${label} must be a regular non-symlink file`);
    }
    if (openedStats.size > maxBytes) {
      throw new RangeError(`${label} exceeds per-file byte limit of ${maxBytes}`);
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength > maxBytes) {
      throw new RangeError(`${label} exceeds per-file byte limit of ${maxBytes}`);
    }
    return bytes;
  } catch (error) {
    if (error?.code === 'ELOOP') {
      throw new TypeError(`${label} must be a regular non-symlink file`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function inspectRegularJsonFile(path, options) {
  const bytes = await readRegularFile(path, options);
  try {
    JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new SyntaxError(`malformed JSON in ${options?.displayName ?? options?.label ?? 'file'}: ${error.message}`);
  }
  return Object.freeze({
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  });
}

export async function inspectNumberedJsonDirectory({
  directory,
  count,
  perFileBytes,
  aggregateBytes,
  label = 'numbered JSON directory',
}) {
  requirePositiveSafeInteger(count, 'count');
  requirePositiveSafeInteger(perFileBytes, 'perFileBytes');
  requirePositiveSafeInteger(aggregateBytes, 'aggregateBytes');
  await requireRegularDirectory(directory, label);

  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const names = new Set(directoryEntries.map((entry) => entry.name));
  for (let id = 1; id <= count; id += 1) {
    const expectedName = `${id}.json`;
    if (!names.has(expectedName)) {
      throw new Error(`missing numbered file ${expectedName}`);
    }
  }

  const numberedPattern = /^(0|[1-9]\d*)\.json$/;
  for (const entry of directoryEntries) {
    const match = numberedPattern.exec(entry.name);
    if (match && (Number(match[1]) < 1 || Number(match[1]) > count)) {
      throw new Error(`unexpected numbered file ${entry.name}`);
    }
    if (!match) {
      throw new Error(`unexpected entry ${entry.name}`);
    }
  }

  const entries = [];
  let totalBytes = 0;
  for (let id = 1; id <= count; id += 1) {
    const displayName = `${id}.json`;
    const file = await inspectRegularJsonFile(join(directory, displayName), {
      maxBytes: perFileBytes,
      label: displayName,
      displayName,
    });
    totalBytes += file.byteLength;
    if (totalBytes > aggregateBytes) {
      throw new RangeError(`${label} exceeds aggregate byte limit of ${aggregateBytes}`);
    }
    entries.push(Object.freeze([id, file.byteLength, file.sha256]));
  }

  return Object.freeze({
    count,
    totalBytes,
    entries: Object.freeze(entries),
    sha256: canonicalJsonHash(entries),
  });
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requirePositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function contextualize(error, prefix) {
  if (error && typeof error === 'object') {
    error.message = `${prefix}: ${error.message}`;
  }
  return error;
}

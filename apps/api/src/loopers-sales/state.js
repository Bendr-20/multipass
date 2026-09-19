import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const SCHEMA_VERSION = 1;
const SEEN_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const MAX_SEEN_IDS = 50_000;
const DELIVERED_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export function createDefaultSalesState({ baselineCutoff }) {
  assertUnixSeconds(baselineCutoff, 'baselineCutoff');
  return {
    schemaVersion: SCHEMA_VERSION,
    baselineCutoff,
    restWatermark: baselineCutoff,
    seenIds: {},
    pendingGroups: {},
    retryRecords: {},
    deliveredTransactions: {},
    deliveredTombstones: {},
    updatedAt: baselineCutoff,
  };
}

export async function loadSalesState({ statePath, nowSeconds }) {
  assertUnixSeconds(nowSeconds, 'nowSeconds');

  let serialized;
  try {
    serialized = await fs.readFile(statePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return createDefaultSalesState({ baselineCutoff: nowSeconds });
    }
    throw error;
  }

  let state;
  try {
    state = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Failed to parse sales state at ${statePath}`, { cause: error });
  }

  validateSalesState(state, statePath);
  return pruneSalesState(state, { nowSeconds });
}

export function pruneSalesState(state, { nowSeconds }) {
  assertUnixSeconds(nowSeconds, 'nowSeconds');
  validateSalesState(state, 'state');
  const pruned = structuredClone(state);

  const oldestSeen = nowSeconds - SEEN_RETENTION_SECONDS;
  const retainedSeen = Object.entries(pruned.seenIds)
    .filter(([, seenAt]) => Number.isFinite(seenAt) && seenAt >= oldestSeen)
    .sort(([firstId, firstSeenAt], [secondId, secondSeenAt]) => (
      secondSeenAt - firstSeenAt || firstId.localeCompare(secondId)
    ))
    .slice(0, MAX_SEEN_IDS);
  pruned.seenIds = Object.fromEntries(retainedSeen);

  const oldestDelivered = nowSeconds - DELIVERED_RETENTION_SECONDS;
  for (const [transactionHash, record] of Object.entries(pruned.deliveredTransactions)) {
    if (record?.pinned === true || !Number.isFinite(record?.deliveredAt) || record.deliveredAt >= oldestDelivered) {
      continue;
    }
    pruned.deliveredTombstones[transactionHash] ??= { deliveredAt: record.deliveredAt };
    delete pruned.deliveredTransactions[transactionHash];
  }

  return pruned;
}

export async function saveSalesStateAtomic({ statePath, state, fsImpl = fs }) {
  validateSalesState(state, 'state');
  const parentDirectory = path.dirname(statePath);
  const tempPath = path.join(
    parentDirectory,
    `.${path.basename(statePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  );
  const serialized = `${JSON.stringify(state, null, 2)}\n`;

  let tempHandle;
  let directoryHandle;
  let renamed = false;
  try {
    tempHandle = await fsImpl.open(tempPath, 'wx', 0o600);
    await tempHandle.writeFile(serialized, 'utf8');
    await tempHandle.sync();
    await tempHandle.close();
    tempHandle = undefined;

    directoryHandle = await fsImpl.open(parentDirectory, 'r');
    await fsImpl.rename(tempPath, statePath);
    renamed = true;
    await directoryHandle.sync();
  } finally {
    await closeIgnoringErrors(tempHandle);
    await closeIgnoringErrors(directoryHandle);
    if (!renamed) await unlinkIgnoringMissing(fsImpl, tempPath);
  }
}

function validateSalesState(state, source) {
  if (!isPlainObject(state)) throw new Error(`Invalid sales state in ${source}: expected an object`);
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Invalid sales state in ${source}: unsupported schemaVersion`);
  }
  assertUnixSeconds(state.baselineCutoff, 'baselineCutoff', source);
  assertUnixSeconds(state.restWatermark, 'restWatermark', source);
  assertUnixSeconds(state.updatedAt, 'updatedAt', source);
  for (const field of [
    'seenIds',
    'pendingGroups',
    'retryRecords',
    'deliveredTransactions',
    'deliveredTombstones',
  ]) {
    if (!isPlainObject(state[field])) {
      throw new Error(`Invalid sales state in ${source}: ${field} must be an object`);
    }
  }
}

function assertUnixSeconds(value, field, source = 'arguments') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid sales state in ${source}: ${field} must be a non-negative integer`);
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function closeIgnoringErrors(handle) {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // Preserve the primary persistence error.
  }
}

async function unlinkIgnoringMissing(fsImpl, filePath) {
  try {
    await fsImpl.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Cleanup is best effort; the target file has not been replaced.
    }
  }
}

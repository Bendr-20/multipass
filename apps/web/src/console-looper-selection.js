import { decodeAbiParameters, padHex } from 'viem';

import { readBoundedResponseBody } from './bounded-response-body.js';

import {
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC6551_REGISTRY,
  LOOPERS_COLLECTION,
  RELEASED_ACCOUNT_IMPLEMENTATION,
  deriveLooperAccount,
} from './looper-agent-wallet.js';

export const LAST_LOOPER_STORAGE_KEY = 'multipass.console.lastLooperByWallet.v1';
const LAST_LOOPER_SCHEMA_VERSION = 1;
const MAX_LOOPER_TOKEN_ID = 7_777n;
const RELEASE_DEPLOYMENT_BLOCK = 51_658_273;
const ACCOUNT_CREATED_TOPIC = '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722';
const BLOCKSCOUT_LOGS_URL = `https://base.blockscout.com/api/v2/addresses/${ERC6551_REGISTRY}/logs`;
const RELEASED_IMPLEMENTATION_TOPIC = padHex(RELEASED_ACCOUNT_IMPLEMENTATION, { size: 32 }).toLowerCase();
const LOOPERS_COLLECTION_TOPIC = padHex(LOOPERS_COLLECTION, { size: 32 }).toLowerCase();
const EVENT_DATA_ABI = [{ type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }];

export function normalizeConsoleWalletKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

export function normalizeLooperTokenId(value) {
  const normalized = String(value ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  try {
    const tokenId = BigInt(normalized);
    return tokenId <= MAX_LOOPER_TOKEN_ID ? tokenId.toString() : null;
  } catch {
    return null;
  }
}

export function compareLooperTokenIds(left, right) {
  const leftId = normalizeLooperTokenId(left);
  const rightId = normalizeLooperTokenId(right);
  if (leftId === rightId) return 0;
  if (leftId === null) return 1;
  if (rightId === null) return -1;
  return BigInt(leftId) < BigInt(rightId) ? -1 : 1;
}

export function resolveDefaultLooperTokenId({
  agents = [],
  rememberedTokenId = null,
  activatedTokenIds = new Set(),
  activationStatus = 'unavailable',
} = {}) {
  const orderedTokenIds = (Array.isArray(agents) ? agents : [])
    .map((agent) => normalizeLooperTokenId(agent?.tokenId))
    .filter(Boolean)
    .sort(compareLooperTokenIds);
  if (!orderedTokenIds.length) return null;

  const remembered = normalizeLooperTokenId(rememberedTokenId);
  if (remembered && orderedTokenIds.includes(remembered)) return remembered;

  if (activationStatus === 'available') {
    const activated = new Set(
      [...(activatedTokenIds instanceof Set ? activatedTokenIds : [])]
        .map(normalizeLooperTokenId)
        .filter(Boolean),
    );
    const firstActivated = orderedTokenIds.find((tokenId) => activated.has(tokenId));
    if (firstActivated) return firstActivated;
  }

  return orderedTokenIds[0];
}

export async function loadReleasedLooperTokenIds({
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = 4_000,
  maxPages = 16,
  maxPageBytes = 1_048_576,
} = {}) {
  const unavailable = () => ({ status: 'unavailable', tokenIds: new Set() });
  if (typeof fetchImpl !== 'function' || signal?.aborted) return unavailable();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Released-wallet lookup timed out.')), Math.max(1, Number(timeoutMs) || 1));
  const tokenIds = new Set();
  const events = new Map();
  let cursor = null;
  let previousRow = null;
  let previousCursor = null;

  try {
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      if (controller.signal.aborted) return unavailable();
      const url = new URL(BLOCKSCOUT_LOGS_URL);
      if (cursor) {
        for (const key of ['block_number', 'index', 'items_count', 'topic']) {
          url.searchParams.set(key, String(cursor[key]));
        }
      } else {
        url.searchParams.set('topic', ACCOUNT_CREATED_TOPIC);
      }
      const response = await fetchImpl(url, {
        method: 'GET',
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response?.ok) return unavailable();
      const text = await readBoundedResponseBody(response, { maxBytes: maxPageBytes, signal: controller.signal });
      const page = JSON.parse(text);
      if (!isExactObject(page, ['items', 'next_page_params']) || !Array.isArray(page.items) || page.items.length > 50) return unavailable();

      let crossedDeploymentBoundary = false;
      for (const row of page.items) {
        const generic = normalizeRegistryRow(row);
        if (!generic) return unavailable();
        const eventKey = `${generic.transactionHash}:${generic.index}`;
        const duplicate = events.get(eventKey);
        if (duplicate) {
          if (duplicate !== generic.fingerprint) return unavailable();
          continue;
        }
        events.set(eventKey, generic.fingerprint);
        if (previousRow && comparePosition(generic, previousRow) >= 0) return unavailable();
        previousRow = generic;
        if (generic.blockNumber < RELEASE_DEPLOYMENT_BLOCK) {
          crossedDeploymentBoundary = true;
          break;
        }
        if (generic.implementationTopic !== RELEASED_IMPLEMENTATION_TOPIC
          || generic.collectionTopic !== LOOPERS_COLLECTION_TOPIC) continue;
        const tokenId = normalizeLooperTokenId(BigInt(generic.tokenTopic).toString());
        if (!tokenId) return unavailable();
        const [account, salt, chainId] = decodeAbiParameters(EVENT_DATA_ABI, generic.data);
        const expectedAccount = deriveLooperAccount({ implementation: RELEASED_ACCOUNT_IMPLEMENTATION, tokenId });
        if (String(salt).toLowerCase() !== ACCOUNT_SALT
          || BigInt(chainId) !== BigInt(BASE_CHAIN_ID)
          || String(account).toLowerCase() !== expectedAccount.toLowerCase()) return unavailable();
        tokenIds.add(tokenId);
      }

      if (crossedDeploymentBoundary || page.next_page_params === null) {
        return { status: 'available', tokenIds };
      }
      const nextCursor = normalizeCursor(page.next_page_params);
      if (!nextCursor || page.items.length === 0) return unavailable();
      if (previousCursor && comparePosition(nextCursor, previousCursor) >= 0) return unavailable();
      const lastRow = normalizeRegistryRow(page.items.at(-1));
      if (!lastRow || comparePosition(nextCursor, lastRow) !== 0) return unavailable();
      previousCursor = nextCursor;
      cursor = nextCursor;
    }
    return unavailable();
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export function readLastLooperForWallet({ storage = globalThis.localStorage, wallet } = {}) {
  const walletKey = normalizeConsoleWalletKey(wallet);
  if (!walletKey || !storage?.getItem) return null;
  try {
    return readPreferenceDocument(storage)?.selections?.[walletKey] ?? null;
  } catch {
    return null;
  }
}

export function writeLastLooperForWallet({ storage = globalThis.localStorage, wallet, tokenId } = {}) {
  const walletKey = normalizeConsoleWalletKey(wallet);
  const normalizedTokenId = normalizeLooperTokenId(tokenId);
  if (!walletKey || !normalizedTokenId || !storage?.setItem) return false;
  try {
    const current = readPreferenceDocument(storage) ?? { schemaVersion: LAST_LOOPER_SCHEMA_VERSION, selections: {} };
    const next = {
      schemaVersion: LAST_LOOPER_SCHEMA_VERSION,
      selections: {
        ...current.selections,
        [walletKey]: normalizedTokenId,
      },
    };
    storage.setItem(LAST_LOOPER_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function readPreferenceDocument(storage) {
  const raw = storage.getItem(LAST_LOOPER_STORAGE_KEY);
  if (raw === null) return { schemaVersion: LAST_LOOPER_SCHEMA_VERSION, selections: {} };
  const parsed = JSON.parse(raw);
  if (!isPlainObject(parsed)
    || parsed.schemaVersion !== LAST_LOOPER_SCHEMA_VERSION
    || !isPlainObject(parsed.selections)) return null;
  const selections = {};
  for (const [wallet, tokenId] of Object.entries(parsed.selections)) {
    const walletKey = normalizeConsoleWalletKey(wallet);
    const normalizedTokenId = normalizeLooperTokenId(tokenId);
    if (walletKey && normalizedTokenId) selections[walletKey] = normalizedTokenId;
  }
  return { schemaVersion: LAST_LOOPER_SCHEMA_VERSION, selections };
}

function normalizeRegistryRow(row) {
  if (!isPlainObject(row)) return null;
  const address = typeof row.address === 'string' ? row.address : row.address?.hash;
  const blockNumber = normalizeSafeInteger(row.block_number);
  const index = normalizeSafeInteger(row.index);
  const transactionHash = normalizeHex(row.transaction_hash, 32);
  const topics = Array.isArray(row.topics) ? row.topics.map((topic) => normalizeHex(topic, 32)) : [];
  const data = normalizeHex(row.data, 96);
  if (String(address ?? '').toLowerCase() !== ERC6551_REGISTRY.toLowerCase()
    || blockNumber === null || index === null || !transactionHash
    || topics.length !== 4 || topics.some((topic) => !topic)
    || topics[0] !== ACCOUNT_CREATED_TOPIC || !data) return null;
  const normalized = {
    blockNumber,
    index,
    transactionHash,
    implementationTopic: topics[1],
    collectionTopic: topics[2],
    tokenTopic: topics[3],
    data,
  };
  normalized.fingerprint = JSON.stringify({
    address: ERC6551_REGISTRY.toLowerCase(),
    blockNumber,
    index,
    transactionHash,
    topics,
    data,
  });
  return normalized;
}

function normalizeCursor(value) {
  if (!isExactObject(value, ['block_number', 'index', 'items_count', 'topic'])) return null;
  const blockNumber = normalizeSafeInteger(value.block_number);
  const index = normalizeSafeInteger(value.index);
  const itemsCount = normalizeSafeInteger(value.items_count);
  if (blockNumber === null || index === null || itemsCount === null || itemsCount < 1 || itemsCount > 50
    || value.topic !== ACCOUNT_CREATED_TOPIC) return null;
  return { blockNumber, index, block_number: blockNumber, items_count: itemsCount, topic: value.topic };
}

function normalizeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeHex(value, bytes) {
  const normalized = String(value ?? '').toLowerCase();
  return new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(normalized) ? normalized : null;
}

function comparePosition(left, right) {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.index === right.index) return 0;
  return left.index < right.index ? -1 : 1;
}

function isExactObject(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

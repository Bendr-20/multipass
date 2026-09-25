export const LAST_LOOPER_STORAGE_KEY = 'multipass.console.lastLooperByWallet.v1';
const LAST_LOOPER_SCHEMA_VERSION = 1;
const MAX_LOOPER_TOKEN_ID = 7_777n;

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

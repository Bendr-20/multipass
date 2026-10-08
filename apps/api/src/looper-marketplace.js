export const LOOPERS_BASE_CONTRACT = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const LOOPERS_OPENSEA_SLUG = 'loopers-639312714';

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_WETH = '0x4200000000000000000000000000000000000006';
const CONTRACT_LOWER = LOOPERS_BASE_CONTRACT.toLowerCase();
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/iu;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/u;
const MAX_TOKEN_ID = 7_777n;
const MAX_UINT256 = (2n ** 256n) - 1n;
const SAFE_ERROR_MESSAGE = 'Looper marketplace upstream unavailable.';

export function createLooperMarketplaceListingsLoader({
  fetchImpl = fetch,
  apiKey,
  now = Date.now,
  timeoutMs = 5_000,
  maxPages = 10,
  maxCursorLength = 512,
  maxPageBytes = 1_000_000,
  maxTotalBytes = 4_000_000,
  freshTtlMs = 60_000,
  maxStaleMs = 5 * 60_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');
  const bounds = {
    timeoutMs: boundedInteger(timeoutMs, 'timeoutMs', 1, 60_000),
    maxPages: boundedInteger(maxPages, 'maxPages', 1, 100),
    maxCursorLength: boundedInteger(maxCursorLength, 'maxCursorLength', 1, 2_048),
    maxPageBytes: boundedInteger(maxPageBytes, 'maxPageBytes', 1, 10_000_000),
    maxTotalBytes: boundedInteger(maxTotalBytes, 'maxTotalBytes', 1, 50_000_000),
    freshTtlMs: boundedInteger(freshTtlMs, 'freshTtlMs', 0, 60 * 60_000),
    maxStaleMs: boundedInteger(maxStaleMs, 'maxStaleMs', 0, 24 * 60 * 60_000),
  };
  if (bounds.maxStaleMs < bounds.freshTtlMs) {
    throw new TypeError('maxStaleMs must be at least freshTtlMs.');
  }
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  let cached = null;
  let inFlight = null;

  async function refresh(observedMs) {
    const listings = await fetchAllListings({
      fetchImpl,
      apiKey: normalizedApiKey,
      nowSeconds: Math.floor(observedMs / 1_000),
      bounds,
    });
    const snapshot = {
      schema_version: '1.0.0',
      collection: LOOPERS_OPENSEA_SLUG,
      contract: LOOPERS_BASE_CONTRACT,
      status: 'fresh',
      observed_at: new Date(observedMs).toISOString(),
      listings,
    };
    cached = { observedMs, snapshot };
    return snapshot;
  }

  return async function loadLooperMarketplaceListings() {
    const currentMs = normalizeNow(now());
    if (cached && currentMs - cached.observedMs <= bounds.freshTtlMs) {
      return cloneSnapshot(cached.snapshot);
    }
    if (!inFlight) {
      inFlight = refresh(currentMs).finally(() => { inFlight = null; });
    }
    try {
      return cloneSnapshot(await inFlight);
    } catch {
      const fallbackNow = normalizeNow(now());
      if (cached && fallbackNow - cached.observedMs <= bounds.maxStaleMs) {
        return cloneSnapshot({ ...cached.snapshot, status: 'stale' });
      }
      throw safeUpstreamError();
    }
  };
}

async function fetchAllListings({ fetchImpl, apiKey, nowSeconds, bounds }) {
  const normalized = [];
  const seenCursors = new Set();
  let cursor = null;
  let totalBytes = 0;

  for (let pageIndex = 0; pageIndex < bounds.maxPages; pageIndex += 1) {
    const url = new URL(OPENSEA_API_BASE + '/listings/collection/' + LOOPERS_OPENSEA_SLUG + '/best');
    url.searchParams.set('limit', '100');
    if (cursor !== null) url.searchParams.set('next', cursor);
    const headers = { accept: 'application/json' };
    if (apiKey) headers['X-API-KEY'] = apiKey;
    const body = await boundedRequest(fetchImpl, url, { method: 'GET', headers }, {
      timeoutMs: bounds.timeoutMs,
      maxPageBytes: bounds.maxPageBytes,
      maxRemainingBytes: bounds.maxTotalBytes - totalBytes,
    });
    totalBytes += body.bytes;
    if (totalBytes > bounds.maxTotalBytes) throw safeUpstreamError();
    let payload;
    try {
      payload = JSON.parse(body.text);
    } catch {
      throw safeUpstreamError();
    }
    if (!isPlainObject(payload) || !Array.isArray(payload.listings)) throw safeUpstreamError();
    for (const candidate of payload.listings) {
      const listing = normalizeListing(candidate, nowSeconds);
      if (listing) normalized.push(listing);
    }
    const next = payload.next;
    if (next === null || next === undefined || next === '') {
      return dedupeAndSort(normalized);
    }
    if (typeof next !== 'string' || next.length > bounds.maxCursorLength
      || !CURSOR_PATTERN.test(next) || seenCursors.has(next)) {
      throw safeUpstreamError();
    }
    seenCursors.add(next);
    cursor = next;
  }
  throw safeUpstreamError();
}

async function boundedRequest(fetchImpl, url, init, { timeoutMs, maxPageBytes, maxRemainingBytes }) {
  const controller = new AbortController();
  let timer;
  const request = async () => {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response || response.ok !== true || !response.headers) throw safeUpstreamError();
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      if (!DECIMAL_PATTERN.test(declaredLength)
        || BigInt(declaredLength) > BigInt(maxPageBytes)
        || BigInt(declaredLength) > BigInt(maxRemainingBytes)) {
        throw safeUpstreamError();
      }
    }
    return readBoundedBody(response, Math.min(maxPageBytes, maxRemainingBytes));
  };
  try {
    return await Promise.race([
      request(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(safeUpstreamError());
        }, timeoutMs);
      }),
    ]);
  } catch {
    controller.abort();
    throw safeUpstreamError();
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedBody(response, maxBytes) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw safeUpstreamError();
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw safeUpstreamError();
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return { text, bytes };
    } catch {
      throw safeUpstreamError();
    }
  }
  if (typeof response.text !== 'function') throw safeUpstreamError();
  let text;
  try {
    text = await response.text();
  } catch {
    throw safeUpstreamError();
  }
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) throw safeUpstreamError();
  return { text, bytes };
}

function normalizeListing(value, nowSeconds) {
  try {
    if (!isPlainObject(value) || value.chain !== 'base' || value.status !== 'ACTIVE') return null;
    const parameters = value.protocol_data?.parameters;
    if (!isPlainObject(parameters)) return null;
    const startTime = canonicalUint(parameters.startTime);
    const endTime = canonicalUint(parameters.endTime);
    if (startTime === null || endTime === null || startTime > BigInt(nowSeconds) || endTime <= BigInt(nowSeconds)) return null;
    if (!Array.isArray(parameters.offer) || parameters.offer.length !== 1) return null;
    const offer = parameters.offer[0];
    if (!isPlainObject(offer) || offer.itemType !== 2 || normalizeAddress(offer.token) !== CONTRACT_LOWER
      || offer.startAmount !== '1' || offer.endAmount !== '1') return null;
    const tokenIdValue = canonicalUint(offer.identifierOrCriteria);
    if (tokenIdValue === null || tokenIdValue < 1n || tokenIdValue > MAX_TOKEN_ID) return null;
    const tokenId = tokenIdValue.toString();

    const payment = normalizeConsideration(parameters.consideration);
    if (!payment) return null;
    const currentPrice = value.price?.current;
    if (!isPlainObject(currentPrice) || currentPrice.decimals !== 18) return null;
    const quotedValue = canonicalUint(currentPrice.value);
    if (quotedValue === null || quotedValue === 0n || quotedValue !== payment.baseUnits) return null;
    const baseUnits = payment.baseUnits.toString();
    return {
      token_id: tokenId,
      price: {
        currency: payment.currency,
        amount: formatUnits18(payment.baseUnits),
        base_units: baseUnits,
        decimals: 18,
      },
      item_url: 'https://opensea.io/assets/base/' + CONTRACT_LOWER + '/' + tokenId,
    };
  } catch {
    return null;
  }
}

function normalizeConsideration(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  let currency = null;
  let total = 0n;
  for (const item of value) {
    if (!isPlainObject(item) || !ADDRESS_PATTERN.test(String(item.recipient ?? ''))) return null;
    const token = normalizeAddress(item.token);
    let itemCurrency;
    if (item.itemType === 0 && token === ZERO_ADDRESS) itemCurrency = 'ETH';
    else if (item.itemType === 1 && token === BASE_WETH) itemCurrency = 'WETH';
    else return null;
    if (currency !== null && currency !== itemCurrency) return null;
    currency = itemCurrency;
    const start = canonicalUint(item.startAmount);
    const end = canonicalUint(item.endAmount);
    if (start === null || end === null || start === 0n || start !== end) return null;
    total += start;
    if (total > MAX_UINT256) return null;
  }
  return total > 0n ? { currency, baseUnits: total } : null;
}

function dedupeAndSort(values) {
  const cheapest = new Map();
  for (const value of values) {
    const existing = cheapest.get(value.token_id);
    if (!existing || BigInt(value.price.base_units) < BigInt(existing.price.base_units)) {
      cheapest.set(value.token_id, value);
    }
  }
  return [...cheapest.values()].sort((left, right) => {
    const priceDifference = BigInt(left.price.base_units) - BigInt(right.price.base_units);
    if (priceDifference < 0n) return -1;
    if (priceDifference > 0n) return 1;
    const tokenDifference = BigInt(left.token_id) - BigInt(right.token_id);
    return tokenDifference < 0n ? -1 : tokenDifference > 0n ? 1 : 0;
  });
}

function formatUnits18(value) {
  const digits = value.toString().padStart(19, '0');
  const integer = digits.slice(0, -18);
  const fraction = digits.slice(-18).replace(/0+$/u, '');
  return fraction ? integer + '.' + fraction : integer;
}

function canonicalUint(value) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= MAX_UINT256 ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizeNow(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError('now returned an invalid timestamp.');
  return Math.floor(number);
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(name + ' is outside its safe bound.');
  }
  return value;
}

function cloneSnapshot(value) {
  return {
    ...value,
    listings: value.listings.map(listing => ({
      ...listing,
      price: { ...listing.price },
    })),
  };
}

function safeUpstreamError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

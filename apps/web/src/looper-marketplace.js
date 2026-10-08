import { getApiBaseFromLocation } from './api.js';
import { readBoundedResponseBody } from './bounded-response-body.js';
import { compareLooperTokenIds, loadReleasedLooperTokenIds, normalizeLooperTokenId } from './console-looper-selection.js';

export const LOOPERS_MARKETPLACE_PATH = '/multipass/loopers';
const LOOPERS_CONTRACT = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const LOOPERS_COLLECTION = 'loopers-639312714';
const OPENSEA_ROOT = 'https://opensea.io/assets/base/' + LOOPERS_CONTRACT.toLowerCase();
const MAX_BROWSER_RESPONSE_BYTES = 1_000_000;
const MARKETPLACE_REQUEST_TIMEOUT_MS = 10_000;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/u;
const PRICE_AMOUNT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

export function getLooperMarketplaceRoute(locationUrl) {
  const path = locationUrl?.pathname;
  if (path === LOOPERS_MARKETPLACE_PATH) return { kind: 'list', tokenId: null };
  if (!String(path ?? '').startsWith(LOOPERS_MARKETPLACE_PATH + '/')) return null;
  const match = String(path).match(/^\/multipass\/loopers\/([^/]+)$/u);
  const tokenId = match ? normalizeLooperTokenId(match[1]) : null;
  return tokenId && match[1] === tokenId ? { kind: 'detail', tokenId } : { kind: 'invalid', tokenId: null };
}

export function createInitialLooperMarketplaceState(route) {
  return {
    route: route ?? { kind: 'invalid', tokenId: null },
    status: route?.kind === 'invalid' ? 'invalid' : 'loading',
    snapshot: null,
    view: 'listed',
    search: '',
    sort: 'token-asc',
  };
}

export async function loadLooperMarketplaceListings({ locationUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Marketplace transport unavailable.');
  const apiBase = getApiBaseFromLocation(locationUrl);
  const response = await fetchImpl(apiBase + '/api/loopers/marketplace/listings', {
    method: 'GET', credentials: 'omit', headers: { accept: 'application/json' }, signal,
  });
  if (!response?.ok) throw new Error('Marketplace listings unavailable.');
  let text;
  try {
    text = await readBoundedResponseBody(response, { maxBytes: MAX_BROWSER_RESPONSE_BYTES, signal });
  } catch {
    throw new Error('Marketplace listings unavailable.');
  }
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Marketplace listings unavailable.'); }
  const normalized = normalizeFeed(value);
  if (!normalized) throw new Error('Marketplace listings unavailable.');
  return normalized;
}

export async function loadLooperMarketplaceSnapshot({
  locationUrl,
  fetchImpl = globalThis.fetch,
  activationLoader = loadReleasedLooperTokenIds,
  listingsLoader = loadLooperMarketplaceListings,
  signal,
  timeoutMs = MARKETPLACE_REQUEST_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener?.('abort', abort, { once: true });
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : MARKETPLACE_REQUEST_TIMEOUT_MS;
  const timeout = globalThis.setTimeout(() => controller.abort(new Error('Marketplace request timed out.')), boundedTimeoutMs);
  let activationResult;
  let listingsResult;
  try {
    [activationResult, listingsResult] = await Promise.all([
      settleWithAbort(() => activationLoader({ fetchImpl, signal: controller.signal }), controller.signal),
      settleWithAbort(() => listingsLoader({ locationUrl, fetchImpl, signal: controller.signal }), controller.signal),
    ]);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abort);
  }
  const activation = activationResult.status === 'fulfilled'
    ? activationResult.value
    : { status: 'unavailable', tokenIds: new Set() };
  const listings = listingsResult.status === 'fulfilled' ? listingsResult.value : null;
  return joinLooperMarketplaceSnapshot({ activation, listings });
}

export function joinLooperMarketplaceSnapshot({ activation, listings } = {}) {
  const activationAvailable = activation?.status === 'available' && activation.tokenIds instanceof Set;
  const normalizedFeed = normalizeFeed(listings);
  if (!activationAvailable) {
    return {
      activationStatus: 'unavailable',
      listingsStatus: normalizedFeed ? 'available' : 'unavailable',
      feedStatus: normalizedFeed?.status ?? 'unavailable',
      observedAt: normalizedFeed?.observedAt ?? null,
      items: [],
    };
  }
  const tokenIds = [...activation.tokenIds]
    .map(normalizeLooperTokenId)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort(compareLooperTokenIds);
  const byToken = new Map((normalizedFeed?.listings ?? []).map((entry) => [entry.tokenId, entry]));
  return {
    activationStatus: 'available',
    listingsStatus: normalizedFeed ? 'available' : 'unavailable',
    feedStatus: normalizedFeed?.status ?? 'unavailable',
    observedAt: normalizedFeed?.observedAt ?? null,
    items: tokenIds.map((tokenId) => ({
      tokenId,
      imageUrl: 'https://helixa.xyz/loopers/images/' + tokenId + '.png',
      detailHref: LOOPERS_MARKETPLACE_PATH + '/' + tokenId,
      listing: byToken.get(tokenId) ?? null,
    })),
  };
}

export function selectLooperMarketplaceItems(snapshot, controls = {}) {
  if (snapshot?.activationStatus !== 'available') return [];
  const view = controls.view === 'all' ? 'all' : 'listed';
  const search = String(controls.search ?? '').trim();
  const canonicalSearch = search === '' ? null : normalizeLooperTokenId(search);
  if (search && canonicalSearch !== search) return [];
  const values = snapshot.items.filter((item) => (view === 'all' || item.listing) && (!canonicalSearch || item.tokenId === canonicalSearch));
  const sort = ['token-asc', 'token-desc', 'price-asc', 'price-desc'].includes(controls.sort) ? controls.sort : 'token-asc';
  return [...values].sort((left, right) => compareItems(left, right, sort));
}

export function getLooperMarketplaceMetrics(snapshot) {
  const items = snapshot?.activationStatus === 'available' ? snapshot.items : [];
  const listingsAvailable = snapshot?.listingsStatus === 'available';
  const listed = listingsAvailable ? items.filter((item) => item.listing) : [];
  const floorListing = [...listed].sort((left, right) => comparePrices(left, right, 1))[0]?.listing ?? null;
  return {
    activatedCount: items.length,
    listedActivatedCount: listingsAvailable ? listed.length : null,
    floor: floorListing ? { amount: floorListing.amount, currency: floorListing.currency } : null,
    freshnessStatus: snapshot?.feedStatus ?? 'unavailable',
    observedAt: snapshot?.observedAt ?? null,
  };
}

export function renderLooperMarketplace(state = {}) {
  if (state.route?.kind === 'invalid' || state.status === 'invalid') return renderStatus('Looper route not found', 'Use a canonical decimal Looper token ID.', false);
  if (state.status === 'loading') return renderStatus('Loading activated Loopers…', 'Verifying released accounts and current marketplace listings.', false, 'polite');
  const snapshot = state.snapshot;
  if (!snapshot || snapshot.activationStatus !== 'available') return renderStatus('Activated roster unavailable', 'The verified activation source could not be loaded. No partial roster is shown.', true);
  if (state.route?.kind === 'detail') return renderDetail(snapshot, state.route.tokenId);
  return renderList(snapshot, state);
}

export function bindLooperMarketplace(root, handlers = {}) {
  root?.querySelectorAll?.('[data-marketplace-view]').forEach((button) => button.addEventListener('click', () => handlers.setView?.(button.dataset.marketplaceView)));
  root?.querySelector?.('[data-marketplace-search]')?.addEventListener('input', (event) => handlers.setSearch?.(event.currentTarget.value));
  root?.querySelector?.('[data-marketplace-sort]')?.addEventListener('change', (event) => handlers.setSort?.(event.currentTarget.value));
  root?.querySelectorAll?.('[data-action="retry-looper-marketplace"]').forEach((button) => button.addEventListener('click', () => handlers.retry?.()));
}

function normalizeFeed(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)
    && ['fresh', 'stale'].includes(value.status)
    && isCanonicalTimestamp(value.observedAt)
    && Array.isArray(value.listings)) {
    const listings = value.listings.map(normalizeInternalListing);
    if (listings.every(Boolean)) return { status: value.status, observedAt: value.observedAt, listings };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema_version !== '1.0.0'
    || value.collection !== LOOPERS_COLLECTION
    || value.contract !== LOOPERS_CONTRACT
    || !['fresh', 'stale'].includes(value.status)
    || !isCanonicalTimestamp(value.observed_at)
    || !Array.isArray(value.listings)) return null;
  const cheapest = new Map();
  for (const row of value.listings) {
    const normalized = normalizeListing(row);
    if (!normalized) continue;
    const prior = cheapest.get(normalized.tokenId);
    if (!prior || BigInt(normalized.baseUnits) < BigInt(prior.baseUnits)) cheapest.set(normalized.tokenId, normalized);
  }
  return {
    status: value.status,
    observedAt: value.observed_at,
    listings: [...cheapest.values()].sort((a, b) => compareLooperTokenIds(a.tokenId, b.tokenId)),
  };
}

function normalizeListing(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tokenId = normalizeLooperTokenId(value.token_id);
  if (!tokenId || value.token_id !== tokenId) return null;
  const price = value.price;
  if (!price || typeof price !== 'object' || Array.isArray(price)
    || !['ETH', 'WETH'].includes(price.currency)
    || price.decimals !== 18
    || !CANONICAL_UINT.test(String(price.base_units ?? ''))
    || BigInt(price.base_units) <= 0n
    || !PRICE_AMOUNT.test(String(price.amount ?? ''))) return null;
  const expectedItemUrl = OPENSEA_ROOT + '/' + tokenId;
  if (value.item_url !== expectedItemUrl) return null;
  return { tokenId, currency: price.currency, amount: String(price.amount), baseUnits: String(price.base_units), itemUrl: expectedItemUrl };
}

function normalizeInternalListing(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tokenId = normalizeLooperTokenId(value.tokenId);
  if (!tokenId || value.tokenId !== tokenId || !['ETH', 'WETH'].includes(value.currency)
    || !CANONICAL_UINT.test(String(value.baseUnits ?? '')) || BigInt(value.baseUnits) <= 0n
    || !PRICE_AMOUNT.test(String(value.amount ?? '')) || value.itemUrl !== OPENSEA_ROOT + '/' + tokenId) return null;
  return { tokenId, currency: value.currency, amount: String(value.amount), baseUnits: String(value.baseUnits), itemUrl: value.itemUrl };
}

function compareItems(left, right, sort) {
  if (sort === 'token-desc') return -compareLooperTokenIds(left.tokenId, right.tokenId);
  if (sort === 'price-asc') return comparePrices(left, right, 1);
  if (sort === 'price-desc') return comparePrices(left, right, -1);
  return compareLooperTokenIds(left.tokenId, right.tokenId);
}

function comparePrices(left, right, direction) {
  if (!left.listing && !right.listing) return compareLooperTokenIds(left.tokenId, right.tokenId);
  if (!left.listing) return 1;
  if (!right.listing) return -1;
  const a = BigInt(left.listing.baseUnits);
  const b = BigInt(right.listing.baseUnits);
  if (a < b) return -direction;
  if (a > b) return direction;
  return compareLooperTokenIds(left.tokenId, right.tokenId);
}

function renderList(snapshot, state) {
  const metrics = getLooperMarketplaceMetrics(snapshot);
  const items = selectLooperMarketplaceItems(snapshot, state);
  const listingsUnavailable = snapshot.listingsStatus !== 'available';
  return     '<section class="looper-marketplace" aria-labelledby="looper-marketplace-title">' +
      '<div class="looper-marketplace-hero"><p class="eyebrow">Activated on Base</p><h1 id="looper-marketplace-title">Looper marketplace</h1><p>Browse verified activated Loopers and current OpenSea listings.</p></div>' +
      renderMetrics(metrics) +
      (snapshot.feedStatus === 'stale' ? '<p class="looper-marketplace-warning" role="status">Marketplace data is stale. Confirm the listing on OpenSea before acting.</p>' : '') +
      (listingsUnavailable ? '<div class="looper-marketplace-warning" role="status"><strong>Marketplace listings unavailable.</strong> Listing status is not inferred. <button type="button" data-action="retry-looper-marketplace">Retry</button></div>' : '') +
      renderControls(state) +
      (items.length ? '<div class="looper-marketplace-grid">' + items.map((item) => renderCard(item, listingsUnavailable)).join('') + '</div>' : renderEmpty(state, listingsUnavailable)) +
    '</section>';
}

function renderMetrics(metrics) {
  const listingsUnavailable = metrics.listedActivatedCount === null;
  const floor = listingsUnavailable ? 'Unavailable' : (metrics.floor ? escapeHtml(metrics.floor.amount + ' ' + metrics.floor.currency) : '—');
  const freshness = metrics.observedAt ? '<time datetime="' + escapeAttribute(metrics.observedAt) + '">' + escapeHtml(metrics.observedAt) + '</time>' : 'Unavailable';
  return '<dl class="looper-marketplace-metrics">' +
    metric('Activated', String(metrics.activatedCount)) +
    metric('Listed activated', listingsUnavailable ? 'Unavailable' : String(metrics.listedActivatedCount)) +
    metric('Activated floor', floor, true) +
    metric('Freshness', escapeHtml(metrics.freshnessStatus) + '<small>' + freshness + '</small>', true) +
  '</dl>';
}

function metric(label, value, html = false) { return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + (html ? value : escapeHtml(value)) + '</dd></div>'; }

function renderControls(state) {
  return '<div class="looper-marketplace-controls" aria-label="Marketplace controls">' +
    '<div class="looper-marketplace-toggle"><button type="button" data-marketplace-view="listed" aria-pressed="' + String(state.view !== 'all') + '">Listed activated</button><button type="button" data-marketplace-view="all" aria-pressed="' + String(state.view === 'all') + '">All activated</button></div>' +
    '<label>Token ID<input data-marketplace-search inputmode="numeric" pattern="[1-9][0-9]*" value="' + escapeAttribute(state.search ?? '') + '" placeholder="e.g. 617"></label>' +
    '<label>Sort<select data-marketplace-sort>' + [['token-asc','Token ID: low to high'],['token-desc','Token ID: high to low'],['price-asc','Price: low to high'],['price-desc','Price: high to low']].map(([value,label]) => '<option value="' + value + '"' + (state.sort === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
  '</div>';
}

function renderEmpty(state, listingsUnavailable) {
  if (listingsUnavailable && state.view !== 'all') return '<div class="looper-marketplace-empty"><h2>Listings unavailable</h2><p>Current listed inventory cannot be verified.</p></div>';
  if (state.search) return '<div class="looper-marketplace-empty"><h2>No activated Looper matches that token ID</h2><p>Enter a canonical decimal token ID.</p></div>';
  if (state.view !== 'all') return '<div class="looper-marketplace-empty"><h2>No listed activated Loopers</h2><p>Try All activated to browse the verified roster.</p></div>';
  return '<div class="looper-marketplace-empty"><h2>No activated Loopers found</h2><p>The verified activation roster is empty.</p></div>';
}

function renderCard(item, listingsUnavailable) {
  const listing = item.listing;
  const listingText = listing ? escapeHtml(listing.amount + ' ' + listing.currency) : (listingsUnavailable ? 'Listing unavailable' : 'Not listed');
  const openSea = listing ? '<a class="looper-marketplace-external" href="' + escapeAttribute(listing.itemUrl) + '" target="_blank" rel="noopener noreferrer">View on OpenSea</a>' : '';
  return '<article class="looper-marketplace-card"><a class="looper-marketplace-image" href="' + escapeAttribute(item.detailHref) + '"><img src="' + escapeAttribute(item.imageUrl) + '" alt="Looper #' + escapeAttribute(item.tokenId) + '" loading="lazy" decoding="async"></a><div class="looper-marketplace-card-body"><div class="looper-marketplace-card-title"><h2>Looper #' + escapeHtml(item.tokenId) + '</h2><span>Activated</span></div><p class="looper-marketplace-price">' + listingText + '</p><div class="looper-marketplace-actions"><a href="' + escapeAttribute(item.detailHref) + '">View Multipass</a>' + openSea + '</div></div></article>';
}

function renderDetail(snapshot, tokenId) {
  const item = snapshot.items.find((entry) => entry.tokenId === tokenId);
  if (!item) return renderStatus('Looper unavailable', 'This canonical token ID is not in the verified activated roster.', false, null, true);
  const listingUnavailable = snapshot.listingsStatus !== 'available';
  const listingText = item.listing ? escapeHtml(item.listing.amount + ' ' + item.listing.currency) : (listingUnavailable ? 'Listing unavailable' : 'Not listed');
  const external = item.listing ? '<a href="' + escapeAttribute(item.listing.itemUrl) + '" target="_blank" rel="noopener noreferrer">View on OpenSea</a>' : '';
  const freshness = snapshot.observedAt ? escapeHtml(snapshot.feedStatus + ' · ' + snapshot.observedAt) : 'Unavailable';
  return '<article class="looper-marketplace-detail"><a class="looper-marketplace-back" href="' + LOOPERS_MARKETPLACE_PATH + '">Back to marketplace</a>' + (snapshot.feedStatus === 'stale' ? '<p class="looper-marketplace-warning">Marketplace data is stale. Confirm on OpenSea.</p>' : '') + '<div class="looper-marketplace-detail-grid"><img src="' + escapeAttribute(item.imageUrl) + '" alt="Looper #' + escapeAttribute(tokenId) + '" loading="lazy" decoding="async"><div><p class="eyebrow">Activated Looper</p><h1>Looper #' + escapeHtml(tokenId) + '</h1><dl><div><dt>Activation</dt><dd>Activated</dd></div><div><dt>Listing</dt><dd>' + listingText + '</dd></div><div><dt>Freshness</dt><dd>' + freshness + '</dd></div></dl><div class="looper-marketplace-actions">' + external + '</div></div></div></article>';
}

function renderStatus(title, body, retry, live = null, back = false) {
  return '<section class="looper-marketplace looper-marketplace-status"' + (live ? ' aria-live="' + live + '"' : '') + '><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(body) + '</p>' + (retry ? '<button type="button" data-action="retry-looper-marketplace">Retry</button>' : '') + (back ? '<a href="' + LOOPERS_MARKETPLACE_PATH + '">Back to marketplace</a>' : '') + '</section>';
}

function settleWithAbort(operation, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ status: 'rejected', reason: signal.reason ?? new Error('Marketplace request aborted.') });
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(operation).then(
      (value) => finish({ status: 'fulfilled', value }),
      (reason) => finish({ status: 'rejected', reason }),
    );
  });
}

function isCanonicalTimestamp(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[c]); }
function escapeAttribute(value) { return escapeHtml(value); }

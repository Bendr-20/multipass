const UNSAFE_PUBLIC_STRING_PATTERN = /[<>]|javascript:|data:|file:|<script|onerror\s*=|onload\s*=/i;

export function deriveMarketplacePresenceFromFragments(fragments = []) {
  const entries = [];
  const seen = new Set();
  for (const fragment of fragments) {
    const ref = fragment?.marketplace_ref;
    if (!ref || fragment.visibility !== 'public' || fragment.status === 'revoked') continue;

    const marketplace = normalizeRequiredDisplayString(ref.marketplace, 80);
    const title = normalizeRequiredDisplayString(ref.title, 120);
    const summary = normalizeRequiredDisplayString(ref.summary, 500);
    if (!marketplace || !title || !summary || !hasText(ref.profile_url)) continue;

    const profileUrl = normalizeMarketplacePresenceUrl(ref.profile_url);
    if (!profileUrl) continue;

    const listingId = normalizeOptionalDisplayString(ref.listing_id, 120);
    const fragmentId = normalizeOptionalDisplayString(fragment.fragment_id, 160);
    const key = marketplacePresenceKey({ profileUrl, marketplace, listingId, fragmentId });
    if (seen.has(key)) continue;
    seen.add(key);

    const status = normalizeOptionalDisplayString(ref.status, 80) || normalizeOptionalDisplayString(fragment.status, 80);
    entries.push({
      fragmentId,
      marketplace,
      listingId,
      profileUrl,
      title,
      summary,
      status,
      services: normalizeMarketplaceServices(ref.services),
      paymentRails: normalizeMarketplacePaymentRails(ref.payment_rails),
      reputation: normalizeMarketplaceReputation(ref.reputation),
      facts: normalizeMarketplaceFacts(ref.facts),
      source: {
        label: marketplaceSourceLabel(status),
        url: profileUrl || normalizeMarketplacePresenceUrl(fragment.source?.reference_url) || '',
        checkedAt: normalizeCheckedAt(ref.source_checked_at, fragment.source?.observed_at),
        provenance: marketplaceSourceProvenance(status),
      },
      proof: {
        assurance: normalizeOptionalDisplayString(fragment.assurance_level, 80),
        fragmentId,
        sourceType: normalizeOptionalDisplayString(fragment.source?.source_type, 80),
      },
    });
  }
  return entries;
}

export function normalizeMarketplacePresenceUrl(value) {
  if (!hasText(value)) return '';
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
}

export function marketplacePresenceKey({ profileUrl, marketplace, listingId, fragmentId }) {
  const normalizedUrl = normalizeMarketplacePresenceUrl(profileUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  const market = normalizeOptionalDisplayString(marketplace, 80).toLowerCase();
  const listing = normalizeOptionalDisplayString(listingId, 120).toLowerCase();
  if (market && listing) return `listing:${market}:${listing}`;
  return `fragment:${normalizeOptionalDisplayString(fragmentId, 160)}`;
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequiredDisplayString(value, maxLength) {
  return normalizeOptionalDisplayString(value, maxLength);
}

function normalizeOptionalDisplayString(value, maxLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (maxLength && normalized.length > maxLength) return '';
  if (UNSAFE_PUBLIC_STRING_PATTERN.test(normalized)) return '';
  return normalized;
}

function normalizeCheckedAt(sourceCheckedAt, observedAt) {
  if (hasText(sourceCheckedAt)) return normalizeOptionalDisplayString(sourceCheckedAt, 80);
  return normalizeOptionalDisplayString(observedAt, 80);
}

function normalizeMarketplaceServices(services) {
  if (!Array.isArray(services)) return [];
  return services.slice(0, 8).filter(isPlainObject).map((service) => {
    const row = {};
    const name = normalizeOptionalDisplayString(service.name, 120);
    if (name) row.name = name;
    const price = normalizeOptionalDisplayString(service.price, 80);
    if (price) row.price = price;
    const paymentMode = normalizeOptionalDisplayString(service.payment_mode, 80);
    if (paymentMode) row.paymentMode = paymentMode;
    const endpointUrl = normalizeMarketplacePresenceUrl(service.endpoint_url);
    if (endpointUrl) row.endpointUrl = endpointUrl;
    return row;
  }).filter(hasDisplayFields);
}

function normalizeMarketplacePaymentRails(paymentRails) {
  if (!Array.isArray(paymentRails)) return [];
  return paymentRails.slice(0, 8).filter(isPlainObject).map((rail) => {
    const row = {};
    const asset = normalizeOptionalDisplayString(rail.asset, 80);
    if (asset) row.asset = asset;
    const mode = normalizeOptionalDisplayString(rail.mode, 80);
    if (mode) row.mode = mode;
    const chain = normalizeOptionalDisplayString(rail.chain, 80);
    if (chain) row.chain = chain;
    return row;
  }).filter(hasDisplayFields);
}

function normalizeMarketplaceReputation(reputation) {
  if (!isPlainObject(reputation)) return {};
  const row = {};
  for (const field of ['score', 'positive_rate', 'sold_count', 'review_count']) {
    const value = normalizeOptionalDisplayString(reputation[field], 80);
    if (value) row[field] = value;
  }
  return row;
}

function normalizeMarketplaceFacts(facts) {
  if (!Array.isArray(facts)) return [];
  return facts.slice(0, 8).filter(isPlainObject).map((fact) => {
    const row = {};
    const label = normalizeOptionalDisplayString(fact.label, 80);
    if (label) row.label = label;
    const value = normalizeOptionalDisplayString(fact.value, 160);
    if (value) row.value = value;
    return row;
  }).filter(hasDisplayFields);
}

function hasDisplayFields(value) {
  return Object.keys(value).length > 0;
}

function marketplaceSourceLabel(status) {
  switch (String(status ?? '').trim()) {
    case 'public_import':
      return 'Public marketplace import';
    case 'pending':
      return 'Pending marketplace connection';
    case 'stale':
      return 'Stale marketplace connection';
    case 'disputed':
      return 'Disputed marketplace connection';
    case 'manager_supplied':
    default:
      return 'Manager supplied marketplace connection';
  }
}

function marketplaceSourceProvenance(status) {
  switch (String(status ?? '').trim()) {
    case 'public_import':
      return 'public_import';
    case 'pending':
      return 'manager_supplied_pending';
    case 'stale':
      return 'manager_supplied_stale';
    case 'disputed':
      return 'manager_supplied_disputed';
    case 'manager_supplied':
    default:
      return 'manager_supplied';
  }
}

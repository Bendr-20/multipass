export function getMarketplacePresenceEntries(data = {}) {
  const candidates = [
    ...getMarketplacePresenceFragments(data).map(deriveMarketplacePresenceEntryFromFragment),
    ...getArray(data?.marketplacePresence).map((entry) => normalizeMarketplacePresenceEntry(entry)),
    ...getArray(data?.profile?.marketplacePresence).map((entry) => normalizeMarketplacePresenceEntry(entry)),
  ].filter(Boolean);

  const entries = [];
  for (const candidate of candidates) {
    if (entries.some((entry) => areDuplicateMarketplacePresenceEntries(entry, candidate))) continue;
    entries.push(candidate);
  }
  return entries;
}

export function normalizeMarketplaceProfileUrlForKey(value) {
  const text = firstPresentText(value);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (!isRenderablePublicUrl(parsed)) return '';
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.toString();
  } catch {
    return '';
  }
}

function getMarketplacePresenceFragments(data) {
  return getArray(data?.fragments?.fragments).filter((fragment) => {
    const marketplaceRef = fragment?.marketplace_ref;
    return marketplaceRef && typeof marketplaceRef === 'object' && !Array.isArray(marketplaceRef);
  });
}

function deriveMarketplacePresenceEntryFromFragment(fragment) {
  if (!isPublicMarketplaceFragment(fragment)) return null;

  const ref = fragment.marketplace_ref;
  const marketplace = firstPresentText(ref.marketplace, ref.marketplaceName, ref.platform, ref.name);
  const profileUrl = firstPresentText(ref.profile_url, ref.profileUrl, ref.url);
  const title = firstPresentText(ref.title);
  const summary = firstPresentText(ref.summary);
  const listingId = firstPresentText(ref.listing_id, ref.listingId, ref.id);
  const fragmentId = firstPresentText(fragment.fragment_id, fragment.fragmentId);

  if (!marketplace || !profileUrl || !title || !summary || !isRenderablePublicUrl(profileUrl)) return null;

  return normalizeMarketplacePresenceEntry({
    marketplace,
    listingId,
    profileUrl,
    title,
    summary,
    status: firstPresentText(ref.status, fragment.status),
    source: normalizeMarketplaceFragmentSource(fragment, ref),
    services: ref.services ?? ref.serviceListings ?? ref.offerings,
    paymentRails: ref.paymentRails ?? ref.payment_rails ?? ref.payments,
    reputation: ref.reputation ?? ref.reputationFacts ?? ref.stats,
    facts: ref.facts ?? ref.provenanceFacts,
    fragmentId,
    proof: {
      fragmentId,
      fragmentIds: fragmentId ? [fragmentId] : [],
      assurance: firstPresentText(fragment.assurance_level, fragment.assurance, ref.assurance),
      status: firstPresentText(fragment.status),
    },
  });
}

function isPublicMarketplaceFragment(fragment) {
  if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) return false;
  if (String(fragment.visibility ?? '').trim().toLowerCase() !== 'public') return false;
  const fragmentStatus = String(fragment.status ?? '').trim().toLowerCase();
  const refStatus = String(fragment.marketplace_ref?.status ?? '').trim().toLowerCase();
  if (['revoked', 'retired', 'hidden'].includes(fragmentStatus)) return false;
  if (['revoked', 'retired', 'hidden'].includes(refStatus)) return false;
  return true;
}

function normalizeMarketplaceFragmentSource(fragment, ref) {
  const source = fragment?.source && typeof fragment.source === 'object' && !Array.isArray(fragment.source) ? fragment.source : {};
  const status = firstPresentText(ref.status, fragment.status).toLowerCase();
  const fallbackLabel = status === 'manager_supplied' ? 'Manager supplied source' : 'Marketplace source';
  return {
    label: status === 'manager_supplied' ? 'Manager supplied source' : firstPresentText(source.label, source.name, ref.source_label, fallbackLabel),
    url: firstPresentText(source.url, source.reference_url, ref.source_url, ref.sourceUrl, fragment.reference_url, ref.profile_url),
    checkedAt: firstPresentText(ref.source_checked_at, ref.sourceCheckedAt, source.checkedAt, source.checked_at, source.observed_at, fragment.updated_at, fragment.created_at),
    provenance: firstPresentText(source.provenance, source.type, source.source_type, ref.provenance),
  };
}

function normalizeMarketplacePresenceEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const marketplace = firstPresentText(entry.marketplace, entry.marketplaceName, entry.platform, entry.name);
  const listingId = firstPresentText(entry.listingId, entry.listing_id, entry.id);
  const profileUrl = firstPresentText(entry.profileUrl, entry.profile_url, entry.url);
  const title = firstPresentText(entry.title, entry.listingTitle, entry.heading);
  const summary = firstPresentText(entry.summary, entry.description, entry.body);
  const source = normalizeMarketplacePresenceSource(entry);
  const services = normalizeMarketplacePresenceServices(entry.services ?? entry.serviceListings ?? entry.offerings);
  const paymentRails = normalizeMarketplacePresencePaymentRails(entry.paymentRails ?? entry.payment_rails ?? entry.payments);
  const reputation = normalizeMarketplacePresenceReputation(entry.reputation ?? entry.reputationFacts ?? entry.stats);
  const facts = normalizeMarketplacePresenceFacts(entry.facts ?? entry.provenanceFacts);
  const status = firstPresentText(entry.status, entry.state);
  const fragmentId = firstPresentText(entry.fragmentId, entry.fragment_id, entry.proof?.fragmentId);

  const hasRenderableContext = [title, summary, listingId, profileUrl, source.url, source.checkedAt, source.provenance, status].some(Boolean)
    || services.length > 0
    || paymentRails.length > 0
    || marketplacePresenceReputationFacts(reputation).length > 0
    || facts.length > 0;

  if (!marketplace || !hasRenderableContext) return null;

  return { marketplace, listingId, profileUrl, title, summary, source, services, paymentRails, reputation, facts, status, proof: normalizeMarketplacePresenceProof(entry.proof, fragmentId), fragmentId };
}

function normalizeMarketplacePresenceSource(entry) {
  const source = entry?.source && typeof entry.source === 'object' && !Array.isArray(entry.source) ? entry.source : {};
  return {
    label: firstPresentText(source.label, source.name, entry.sourceLabel, 'Source'),
    url: firstPresentText(source.url, source.reference_url, entry.sourceUrl, entry.source_url),
    checkedAt: firstPresentText(source.checkedAt, source.checked_at, source.observed_at, entry.checkedAt, entry.checked_at),
    provenance: firstPresentText(source.provenance, source.type, source.source_type, entry.provenance),
  };
}

function normalizeMarketplacePresenceServices(services) {
  if (!Array.isArray(services)) return [];
  return services.map((service) => {
    if (typeof service === 'string') return { name: service, price: '', paymentMode: '', endpointUrl: '' };
    if (!service || typeof service !== 'object' || Array.isArray(service)) return null;
    const name = firstPresentText(service.name, service.label, service.service);
    const price = firstPresentText(service.price, service.priceLabel, service.price_label);
    const paymentMode = firstPresentText(service.paymentMode, service.payment_mode, service.mode);
    const endpointUrl = firstPresentText(service.endpointUrl, service.endpoint_url, service.url);
    return name || price || paymentMode || endpointUrl ? { name: name || 'Marketplace service', price, paymentMode, endpointUrl } : null;
  }).filter(Boolean);
}

function normalizeMarketplacePresencePaymentRails(paymentRails) {
  if (!Array.isArray(paymentRails)) return [];
  return paymentRails.map((rail) => {
    if (typeof rail === 'string') return { asset: rail, mode: '', chain: '' };
    if (!rail || typeof rail !== 'object' || Array.isArray(rail)) return null;
    const asset = firstPresentText(rail.asset, rail.token, rail.rail);
    const mode = firstPresentText(rail.mode, rail.paymentMode, rail.payment_mode, rail.label);
    const chain = firstPresentText(rail.chain, rail.network, rail.chainLabel, rail.chain_label);
    return asset || mode || chain ? { asset, mode, chain } : null;
  }).filter(Boolean);
}

function normalizeMarketplacePresenceReputation(reputation) {
  const source = reputation && typeof reputation === 'object' && !Array.isArray(reputation) ? reputation : {};
  return {
    score: firstPresentText(source.score, source.rating),
    positiveRate: firstPresentText(source.positiveRate, source.positive_rate, source.positive),
    soldCount: firstPresentText(source.soldCount, source.sold_count, source.sold, source.sales),
    reviewCount: firstPresentText(source.reviewCount, source.review_count, source.reviews),
  };
}

function normalizeMarketplacePresenceFacts(facts) {
  if (!Array.isArray(facts)) return [];
  return facts.map((fact) => {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return null;
    const label = firstPresentText(fact.label, fact.name);
    const value = firstPresentText(fact.value, fact.text);
    return label && value ? { label, value } : null;
  }).filter(Boolean);
}

function normalizeMarketplacePresenceProof(proof, fragmentId) {
  const normalized = proof && typeof proof === 'object' && !Array.isArray(proof) ? { ...proof } : {};
  if (fragmentId && !normalized.fragmentId) normalized.fragmentId = fragmentId;
  return Object.keys(normalized).length ? normalized : undefined;
}

function marketplacePresenceReputationFacts(reputation) {
  return [
    { label: 'Score', value: reputation.score },
    { label: 'Positive rate', value: reputation.positiveRate },
    { label: 'Sold', value: reputation.soldCount },
    { label: 'Reviews', value: reputation.reviewCount },
  ].filter((fact) => fact.value);
}

function areDuplicateMarketplacePresenceEntries(left, right) {
  const leftListingKey = getMarketplaceListingKey(left);
  const rightListingKey = getMarketplaceListingKey(right);
  if (leftListingKey && leftListingKey === rightListingKey) return true;

  const leftUrlKey = normalizeMarketplaceProfileUrlForKey(left.profileUrl);
  const rightUrlKey = normalizeMarketplaceProfileUrlForKey(right.profileUrl);
  if (leftUrlKey && leftUrlKey === rightUrlKey && !haveDistinctListingIds(left, right)) return true;

  const leftFragmentKey = firstPresentText(left.fragmentId, left.proof?.fragmentId);
  const rightFragmentKey = firstPresentText(right.fragmentId, right.proof?.fragmentId);
  return Boolean(leftFragmentKey && leftFragmentKey === rightFragmentKey);
}

function getMarketplaceListingKey(entry) {
  const marketplace = firstPresentText(entry.marketplace).toLowerCase();
  const listingId = firstPresentText(entry.listingId).toLowerCase();
  return marketplace && listingId ? `${marketplace}:${listingId}` : '';
}

function haveDistinctListingIds(left, right) {
  const leftListingId = firstPresentText(left.listingId).toLowerCase();
  const rightListingId = firstPresentText(right.listingId).toLowerCase();
  return Boolean(leftListingId && rightListingId && leftListingId !== rightListingId);
}

function isRenderablePublicUrl(url) {
  if (!url) return false;
  try {
    const parsed = url instanceof URL ? url : new URL(String(url));
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstPresentText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

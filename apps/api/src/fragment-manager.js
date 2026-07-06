import { randomBytes } from 'node:crypto';

import { assertIdentityFragment } from '@helixa/multipass-sdk';

const MANAGER_FRAGMENT_TYPES = new Set(['wallet', 'social', 'endpoint', 'standard_ref', 'attestation']);
const MANAGER_FRAGMENT_STATUSES = new Set(['pending', 'stale', 'revoked', 'disputed']);
const MANAGER_FRAGMENT_UPDATE_FIELDS = new Set(['fragment_type', 'public_value', 'reference_url', 'proof_reference', 'endpoint_ref', 'status', 'transfer_policy', 'marketplace_ref']);
const TRANSFER_POLICIES = new Set(['reverify_on_transfer', 'pause_on_transfer', 'historical_on_transfer', 'never_transfer']);
const ENDPOINT_PROTOCOLS = new Set(['web', 'api', 'mcp', 'a2a', 'x402']);
const MARKETPLACE_REF_FIELDS = new Set([
  'marketplace',
  'profile_url',
  'title',
  'summary',
  'listing_id',
  'status',
  'source_checked_at',
  'services',
  'payment_rails',
  'reputation',
  'facts',
]);
const MARKETPLACE_DISPLAY_STATUSES = new Set(['manager_supplied', 'public_import', 'pending', 'stale', 'disputed']);
const MARKETPLACE_SERVICE_FIELDS = new Set(['name', 'price', 'payment_mode', 'endpoint_url']);
const MARKETPLACE_PAYMENT_RAIL_FIELDS = new Set(['asset', 'mode', 'chain']);
const MARKETPLACE_REPUTATION_FIELDS = new Set(['score', 'positive_rate', 'sold_count', 'review_count']);
const MARKETPLACE_FACT_FIELDS = new Set(['label', 'value']);
const MARKETPLACE_FRAGMENT_PATCH_MESSAGE = 'Marketplace Connection fragments must be edited through Marketplace Connections.';

export function normalizeManagerFragmentInput(input, { multipassId, now, randomHex = defaultRandomHex } = {}) {
  if (!isPlainObject(input)) throw new TypeError('Fragment input must be an object.');
  rejectUnexpectedFragmentFields(input, new Set(['fragment_type', 'public_value', 'reference_url', 'proof_reference', 'endpoint_ref', 'transfer_policy', 'visibility', 'marketplace_ref']));
  if ('visibility' in input && input.visibility !== 'public') throw new TypeError('Manager-created fragments must be public.');

  const fragmentType = normalizeManagerFragmentType(input.fragment_type);
  if ('marketplace_ref' in input && fragmentType !== 'attestation') {
    throw new TypeError('marketplace_ref is only allowed for attestation fragments.');
  }

  const marketplaceRef = 'marketplace_ref' in input ? normalizeMarketplaceRef(input.marketplace_ref, { now }) : null;
  const referenceUrl = marketplaceRef
    ? normalizeRequiredMarketplaceHttpsUrl(input.reference_url, 'reference_url')
    : normalizeOptionalHttpsUrl(input.reference_url, 'reference_url');
  if (marketplaceRef && referenceUrl !== marketplaceRef.profile_url) {
    throw new TypeError('reference_url must match marketplace_ref.profile_url.');
  }

  const transferPolicy = normalizeTransferPolicy(input.transfer_policy ?? defaultTransferPolicy(fragmentType));
  const endpointRef = normalizeEndpointRef(input.endpoint_ref, fragmentType);
  const fragmentId = `frag_manager_${fragmentType}_${randomHex(8)}`;
  const fragment = {
    schema_version: '0.1.0',
    fragment_id: fragmentId,
    multipass_id: normalizeRequiredString(multipassId, 'multipassId', 160),
    fragment_type: fragmentType,
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: transferPolicy,
    source: {
      source_type: 'owner_submission',
      source_id: `manager:${fragmentId}`,
      issuer: null,
      observed_at: normalizeDate(now),
      reference_url: referenceUrl,
    },
    public_value: normalizeFragmentPublicValue(fragmentType, input.public_value),
    proof_reference: normalizeOptionalSafeString(input.proof_reference, 'proof_reference', 500),
    created_at: normalizeDate(now),
    updated_at: normalizeDate(now),
    endpoint_ref: endpointRef,
  };

  if (marketplaceRef) {
    fragment.status = deriveMarketplaceFragmentStatus(marketplaceRef.status);
    fragment.transfer_policy = 'historical_on_transfer';
    fragment.assurance_level = 'self_attested';
    fragment.source.reference_url = marketplaceRef.profile_url;
    fragment.marketplace_ref = marketplaceRef;
  }

  if (fragment.source.reference_url === null) delete fragment.source.reference_url;
  if (fragment.proof_reference === null) delete fragment.proof_reference;
  if (fragment.endpoint_ref === null) delete fragment.endpoint_ref;

  return assertIdentityFragment(fragment);
}

export function normalizeManagerFragmentPatch(existing, patch, { now } = {}) {
  assertManagerEditableFragment(existing);
  if (!isPlainObject(patch)) throw new TypeError('Fragment patch must be an object.');
  rejectUnexpectedFragmentFields(patch, MANAGER_FRAGMENT_UPDATE_FIELDS);
  if (Object.keys(patch).length === 0) throw new TypeError('Fragment update has no accepted changes.');

  const hasMarketplacePatch = Object.hasOwn(patch, 'marketplace_ref');
  if (isMarketplaceConnectionFragment(existing) && !hasMarketplacePatch) {
    throw new Error(MARKETPLACE_FRAGMENT_PATCH_MESSAGE);
  }
  if ('fragment_type' in patch && !hasMarketplacePatch) {
    throw new TypeError('fragment_type is not editable through Multipass fragment management.');
  }

  const next = structuredClone(existing);
  if (hasMarketplacePatch) {
    const patchFragmentType = 'fragment_type' in patch ? normalizeManagerFragmentType(patch.fragment_type) : existing.fragment_type;
    if (existing.fragment_type !== 'attestation' || patchFragmentType !== 'attestation') {
      throw new TypeError('marketplace_ref is only allowed for attestation fragments.');
    }
    if ('endpoint_ref' in patch) {
      throw new TypeError('endpoint_ref is not allowed for Marketplace Connection fragments.');
    }
    const marketplaceRef = normalizeMarketplaceRef(patch.marketplace_ref, { now, forUpdate: true });
    const referenceUrl = normalizeRequiredMarketplaceHttpsUrl(patch.reference_url, 'reference_url');
    if (referenceUrl !== marketplaceRef.profile_url) {
      throw new TypeError('reference_url must match marketplace_ref.profile_url.');
    }

    if ('public_value' in patch) next.public_value = normalizeFragmentPublicValue(existing.fragment_type, patch.public_value);
    if ('proof_reference' in patch) {
      const proofReference = normalizeOptionalSafeString(patch.proof_reference, 'proof_reference', 500);
      if (proofReference) next.proof_reference = proofReference;
      else delete next.proof_reference;
    }
    next.status = deriveMarketplaceFragmentStatus(marketplaceRef.status);
    next.transfer_policy = 'historical_on_transfer';
    next.assurance_level = 'self_attested';
    next.visibility = 'public';
    next.source = {
      ...next.source,
      issuer: null,
      reference_url: marketplaceRef.profile_url,
    };
    next.marketplace_ref = marketplaceRef;
    delete next.endpoint_ref;
    next.updated_at = normalizeDate(now);

    return assertIdentityFragment(next);
  }

  if ('public_value' in patch) next.public_value = normalizeFragmentPublicValue(existing.fragment_type, patch.public_value);
  if ('reference_url' in patch) {
    const referenceUrl = normalizeOptionalHttpsUrl(patch.reference_url, 'reference_url');
    if (referenceUrl) next.source.reference_url = referenceUrl;
    else delete next.source.reference_url;
  }
  if ('proof_reference' in patch) {
    const proofReference = normalizeOptionalSafeString(patch.proof_reference, 'proof_reference', 500);
    if (proofReference) next.proof_reference = proofReference;
    else delete next.proof_reference;
  }
  if ('endpoint_ref' in patch) {
    const endpointRef = normalizeEndpointRef(patch.endpoint_ref, existing.fragment_type);
    if (endpointRef) next.endpoint_ref = endpointRef;
    else delete next.endpoint_ref;
  }
  if ('status' in patch) next.status = normalizeManagerStatus(patch.status);
  if ('transfer_policy' in patch) next.transfer_policy = normalizeTransferPolicy(patch.transfer_policy);
  next.updated_at = normalizeDate(now);

  return assertIdentityFragment(next);
}

export function assertManagerEditableFragment(fragment) {
  if (fragment?.source?.source_type !== 'owner_submission' || fragment?.source?.issuer !== null) {
    throw new Error('Imported fragments are read-only through Multipass fragment management.');
  }
  if (!MANAGER_FRAGMENT_TYPES.has(fragment.fragment_type)) {
    throw new Error('Fragment type is not editable through Multipass fragment management.');
  }
}

export function summarizePublicFragments(fragments) {
  return fragments
    .filter((fragment) => fragment.visibility === 'public')
    .map((fragment) => ({
      fragment_id: fragment.fragment_id,
      fragment_type: fragment.fragment_type,
      status: fragment.status,
      assurance_level: fragment.assurance_level,
      visibility: fragment.visibility,
      updated_at: fragment.updated_at,
    }));
}

export function normalizeMarketplaceRef(input, { now } = {}) {
  if (!isPlainObject(input)) throw new TypeError('marketplace_ref must be an object.');
  rejectUnexpectedFragmentFields(input, MARKETPLACE_REF_FIELDS);

  const marketplaceRef = {
    marketplace: normalizeSafePublicValue(input.marketplace, 'marketplace_ref.marketplace', 80),
    profile_url: normalizeRequiredMarketplaceHttpsUrl(input.profile_url, 'marketplace_ref.profile_url'),
    title: normalizeSafePublicValue(input.title, 'marketplace_ref.title', 120),
    summary: normalizeSafePublicValue(input.summary, 'marketplace_ref.summary', 500),
    status: normalizeMarketplaceDisplayStatus(input.status),
  };

  const listingId = normalizeOptionalSafeString(input.listing_id, 'marketplace_ref.listing_id', 120);
  if (listingId) marketplaceRef.listing_id = listingId;

  const sourceCheckedAt = normalizeMarketplaceSourceCheckedAt(input.source_checked_at, { now });
  if (sourceCheckedAt) marketplaceRef.source_checked_at = sourceCheckedAt;

  const services = normalizeMarketplaceServices(input.services);
  if (services) marketplaceRef.services = services;

  const paymentRails = normalizeMarketplacePaymentRails(input.payment_rails);
  if (paymentRails) marketplaceRef.payment_rails = paymentRails;

  const reputation = normalizeMarketplaceReputation(input.reputation);
  if (reputation) marketplaceRef.reputation = reputation;

  const facts = normalizeMarketplaceFacts(input.facts);
  if (facts) marketplaceRef.facts = facts;

  return marketplaceRef;
}

export function deriveMarketplaceFragmentStatus(displayStatus) {
  const status = normalizeMarketplaceDisplayStatus(displayStatus);
  if (status === 'stale') return 'stale';
  if (status === 'disputed') return 'disputed';
  return 'pending';
}

export function isMarketplaceConnectionFragment(fragment) {
  return fragment?.fragment_type === 'attestation' && isPlainObject(fragment.marketplace_ref);
}

function normalizeFragmentPublicValue(fragmentType, value) {
  return fragmentType === 'wallet'
    ? normalizeWallet(value, 'public_value')
    : normalizeSafePublicValue(value, 'public_value', 1000);
}

function normalizeWallet(value, field) {
  const wallet = String(value ?? '').trim().toLowerCase();
  rejectUnsafePublicString(wallet, field);
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError(`${field} must be an EVM wallet address.`);
  return wallet;
}

function rejectUnexpectedFragmentFields(input, allowed) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new TypeError(`${key} is not editable through Multipass fragment management.`);
  }
}

function normalizeManagerFragmentType(value) {
  const fragmentType = String(value ?? '').trim();
  if (!MANAGER_FRAGMENT_TYPES.has(fragmentType)) throw new TypeError(`${fragmentType || 'fragment_type'} is not allowed for manager-created fragments.`);
  return fragmentType;
}

function normalizeManagerStatus(value) {
  const status = String(value ?? '').trim();
  if (!MANAGER_FRAGMENT_STATUSES.has(status)) throw new TypeError('status is not allowed for manager-created fragments.');
  return status;
}

function normalizeMarketplaceDisplayStatus(value) {
  const status = String(value ?? '').trim();
  if (!MARKETPLACE_DISPLAY_STATUSES.has(status)) throw new TypeError('marketplace_ref.status is invalid.');
  return status;
}

function defaultTransferPolicy(fragmentType) {
  if (fragmentType === 'endpoint') return 'pause_on_transfer';
  if (fragmentType === 'attestation') return 'historical_on_transfer';
  return 'reverify_on_transfer';
}

function normalizeTransferPolicy(value) {
  const policy = String(value ?? '').trim();
  if (!TRANSFER_POLICIES.has(policy)) throw new TypeError('transfer_policy is invalid.');
  return policy;
}

function normalizeEndpointRef(value, fragmentType) {
  if (value === undefined || value === null || value === '') return null;
  if (fragmentType !== 'endpoint') throw new TypeError('endpoint_ref is only allowed for endpoint fragments.');
  if (!isPlainObject(value)) throw new TypeError('endpoint_ref must be an object.');

  const protocol = String(value.protocol ?? '').trim();
  if (!ENDPOINT_PROTOCOLS.has(protocol)) throw new TypeError('endpoint_ref.protocol is invalid.');
  const endpointRef = {
    endpoint_id: normalizeSafeToken(value.endpoint_id, 'endpoint_ref.endpoint_id', 80),
    url: normalizeRequiredHttpsUrl(value.url, 'endpoint_ref.url'),
    protocol,
  };
  const manifestUrl = normalizeOptionalHttpsUrl(value.manifest_url, 'endpoint_ref.manifest_url');
  if (manifestUrl) endpointRef.manifest_url = manifestUrl;

  return endpointRef;
}

function normalizeMarketplaceServices(value) {
  return normalizeBoundedMarketplaceArray(value, 'marketplace_ref.services', (entry, index) => {
    rejectUnexpectedFragmentFields(entry, MARKETPLACE_SERVICE_FIELDS);
    const row = {};
    const name = normalizeOptionalSafeString(entry.name, `marketplace_ref.services[${index}].name`, 120);
    if (name) row.name = name;
    const price = normalizeOptionalSafeString(entry.price, `marketplace_ref.services[${index}].price`, 80);
    if (price) row.price = price;
    const paymentMode = normalizeOptionalSafeString(entry.payment_mode, `marketplace_ref.services[${index}].payment_mode`, 80);
    if (paymentMode) row.payment_mode = paymentMode;
    const endpointUrl = normalizeOptionalMarketplaceHttpsUrl(entry.endpoint_url, `marketplace_ref.services[${index}].endpoint_url`);
    if (endpointUrl) row.endpoint_url = endpointUrl;
    return row;
  });
}

function normalizeMarketplacePaymentRails(value) {
  return normalizeBoundedMarketplaceArray(value, 'marketplace_ref.payment_rails', (entry, index) => {
    rejectUnexpectedFragmentFields(entry, MARKETPLACE_PAYMENT_RAIL_FIELDS);
    const row = {};
    const asset = normalizeOptionalSafeString(entry.asset, `marketplace_ref.payment_rails[${index}].asset`, 80);
    if (asset) row.asset = asset;
    const mode = normalizeOptionalSafeString(entry.mode, `marketplace_ref.payment_rails[${index}].mode`, 80);
    if (mode) row.mode = mode;
    const chain = normalizeOptionalSafeString(entry.chain, `marketplace_ref.payment_rails[${index}].chain`, 80);
    if (chain) row.chain = chain;
    return row;
  });
}

function normalizeMarketplaceFacts(value) {
  return normalizeBoundedMarketplaceArray(value, 'marketplace_ref.facts', (entry, index) => {
    rejectUnexpectedFragmentFields(entry, MARKETPLACE_FACT_FIELDS);
    const row = {};
    const label = normalizeOptionalSafeString(entry.label, `marketplace_ref.facts[${index}].label`, 80);
    if (label) row.label = label;
    const factValue = normalizeOptionalSafeString(entry.value, `marketplace_ref.facts[${index}].value`, 160);
    if (factValue) row.value = factValue;
    return row;
  });
}

function normalizeBoundedMarketplaceArray(value, field, normalizeEntry) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  return value.slice(0, 8).map((entry, index) => {
    if (!isPlainObject(entry)) throw new TypeError(`${field}[${index}] must be an object.`);
    return normalizeEntry(entry, index);
  });
}

function normalizeMarketplaceReputation(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!isPlainObject(value)) throw new TypeError('marketplace_ref.reputation must be an object.');
  rejectUnexpectedFragmentFields(value, MARKETPLACE_REPUTATION_FIELDS);
  const reputation = {};
  for (const field of MARKETPLACE_REPUTATION_FIELDS) {
    const normalized = normalizeOptionalSafeString(value[field], `marketplace_ref.reputation.${field}`, 80);
    if (normalized) reputation[field] = normalized;
  }
  return Object.keys(reputation).length ? reputation : null;
}

function normalizeMarketplaceSourceCheckedAt(value, { now, omitBlank = true } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') return omitBlank ? null : null;
  const raw = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new TypeError('source_checked_at must be a valid date.');
  const requestClock = new Date(now ?? Date.now()).getTime();
  if (date.getTime() > requestClock + 5 * 60 * 1000) throw new TypeError('source_checked_at cannot be in the future.');
  return date.toISOString();
}

function normalizeSafePublicValue(value, field, maxLength) {
  const normalized = normalizeRequiredString(value, field, maxLength);
  rejectUnsafePublicString(normalized, field);
  return normalized;
}

function normalizeOptionalSafeString(value, field, maxLength) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = normalizeRequiredString(value, field, maxLength);
  rejectUnsafePublicString(normalized, field);
  return normalized;
}

function normalizeSafeToken(value, field, maxLength) {
  const normalized = normalizeRequiredString(value, field, maxLength);
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) throw new TypeError(`${field} contains unsupported characters.`);
  return normalized;
}

function rejectUnsafePublicString(value, field) {
  if (/[<>]/.test(value) || /javascript:|data:|file:|<script|onerror\s*=|onload\s*=/i.test(value)) {
    throw new TypeError(`${field} contains unsafe public content.`);
  }
}

function normalizeRequiredHttpsUrl(value, field) {
  return parseHttpsUrl(normalizeRequiredString(value, field, 500), field);
}

function normalizeRequiredMarketplaceHttpsUrl(value, field) {
  return parseHttpsUrl(normalizeRequiredString(value, field, 500), field, { marketplaceCanonical: true });
}

function normalizeOptionalHttpsUrl(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseHttpsUrl(String(value).trim(), field);
}

function normalizeOptionalMarketplaceHttpsUrl(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseHttpsUrl(String(value).trim(), field, { marketplaceCanonical: true });
}

function parseHttpsUrl(raw, field, { marketplaceCanonical = false } = {}) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
  if (parsed.username || parsed.password) throw new TypeError(`${field} must not include credentials.`);
  if (marketplaceCanonical) {
    parsed.hash = '';
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.hostname = parsed.hostname.toLowerCase();
  }
  return parsed.toString();
}

function normalizeRequiredString(value, field, maxLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  if (normalized.length > maxLength) throw new TypeError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function normalizeDate(value) {
  const date = value === undefined || value === null || value === '' ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date.toISOString();
}

function defaultRandomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

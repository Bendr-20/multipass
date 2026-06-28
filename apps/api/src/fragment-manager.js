import { randomBytes } from 'node:crypto';

import { assertIdentityFragment } from '@helixa/multipass-sdk';

const MANAGER_FRAGMENT_TYPES = new Set(['wallet', 'social', 'endpoint', 'standard_ref', 'attestation']);
const MANAGER_FRAGMENT_STATUSES = new Set(['pending', 'stale', 'revoked', 'disputed']);
const MANAGER_FRAGMENT_UPDATE_FIELDS = new Set(['public_value', 'reference_url', 'proof_reference', 'endpoint_ref', 'status', 'transfer_policy']);
const TRANSFER_POLICIES = new Set(['reverify_on_transfer', 'pause_on_transfer', 'historical_on_transfer', 'never_transfer']);
const ENDPOINT_PROTOCOLS = new Set(['web', 'api', 'mcp', 'a2a', 'x402']);

export function normalizeManagerFragmentInput(input, { multipassId, now, randomHex = defaultRandomHex } = {}) {
  if (!isPlainObject(input)) throw new TypeError('Fragment input must be an object.');
  rejectUnexpectedFragmentFields(input, new Set(['fragment_type', 'public_value', 'reference_url', 'proof_reference', 'endpoint_ref', 'transfer_policy', 'visibility']));
  if ('visibility' in input && input.visibility !== 'public') throw new TypeError('Manager-created fragments must be public.');

  const fragmentType = normalizeManagerFragmentType(input.fragment_type);
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
      reference_url: normalizeOptionalHttpsUrl(input.reference_url, 'reference_url'),
    },
    public_value: normalizeFragmentPublicValue(fragmentType, input.public_value),
    proof_reference: normalizeOptionalSafeString(input.proof_reference, 'proof_reference', 500),
    created_at: normalizeDate(now),
    updated_at: normalizeDate(now),
    endpoint_ref: endpointRef,
  };

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

  const next = structuredClone(existing);
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

function normalizeOptionalHttpsUrl(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseHttpsUrl(String(value).trim(), field);
}

function parseHttpsUrl(raw, field) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
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

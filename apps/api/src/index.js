import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
  assertX401Manifest,
} from '@helixa/multipass-sdk';

import {
  ERC8004_SOURCE_TYPE,
  HELIXA_SOURCE_TYPE,
  buildHydratedProfileResponse,
  normalizeMultipassSourceInput,
} from './canonical-profile.js';
import { GroupActivationError, createGroupActivationPreview } from './group-activation.js';
import { deriveMarketplacePresenceFromFragments } from './marketplace-presence.js';
import { verifyEthereumPersonalSignature } from './signature-verifier.js';
import {
  deriveAgentCardServiceUpdates,
  deriveX402ManifestFromTools,
  summarizeToolsResponse,
} from './tool-manifest.js';
import { deriveX401ManifestFromFragments } from './x401-manifest.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};
const MANAGER_COOKIE_NAME = 'multipass_manager';
const SUPPORTED_HYDRATED_SOURCE_TYPES = new Set([HELIXA_SOURCE_TYPE, ERC8004_SOURCE_TYPE]);

export function createMemoryStore(input = {}) {
  const {
    profiles: profileInput = [],
    fragments: fragmentInput = [],
    agentCards: agentCardInput = [],
    standardsProfiles: standardsProfileInput = [],
    x402Manifests: x402ManifestInput = [],
    x401Manifests: x401ManifestInput = [],
    receiptFragments: receiptFragmentInput = [],
  } = input;

  const profiles = profileInput.map(assertMultipassProfile);
  const fragments = fragmentInput.map(assertIdentityFragment);
  const agentCards = agentCardInput.map(assertAgentCard);
  const standardsProfiles = standardsProfileInput.map(assertStandardsProfile);
  const x402Manifests = x402ManifestInput.map(assertX402Manifest);
  const x401Manifests = x401ManifestInput.map(assertX401Manifest);
  const receiptFragments = receiptFragmentInput.map(assertReceiptFragment);

  const profilesById = new Map();
  const profilesBySlug = new Map();
  const fragmentsByProfile = new Map();
  const agentCardsByProfile = new Map();
  const standardsByProfile = new Map();
  const x402ByProfile = new Map();
  const x401ByProfile = new Map();
  const receiptsByProfile = new Map();

  for (const profile of profiles) {
    profilesById.set(profile.multipass_id, profile);
    profilesBySlug.set(profile.slug, profile);
  }

  for (const fragment of fragments) {
    appendToMapList(fragmentsByProfile, fragment.multipass_id, fragment);
  }

  for (const agentCard of agentCards) {
    agentCardsByProfile.set(agentCard.multipass_id, agentCard);
  }

  for (const standardsProfile of standardsProfiles) {
    standardsByProfile.set(standardsProfile.multipass_id, standardsProfile);
  }

  for (const manifest of x402Manifests) {
    x402ByProfile.set(manifest.multipass_id, manifest);
  }

  for (const manifest of x401Manifests) {
    x401ByProfile.set(manifest.multipass_id, manifest);
  }

  for (const receipt of receiptFragments) {
    appendToMapList(receiptsByProfile, receipt.multipass_id, receipt);
  }

  return {
    resolveProfile(identifier) {
      return profilesById.get(identifier) ?? profilesBySlug.get(identifier) ?? null;
    },

    getPublicFragments(multipassId) {
      return (fragmentsByProfile.get(multipassId) ?? []).filter((fragment) => fragment.visibility === 'public');
    },

    getTools(multipassId) {
      return summarizeToolsResponse(multipassId, fragmentsByProfile.get(multipassId) ?? []);
    },

    getAgentCard(multipassId, options = {}) {
      const agentCard = agentCardsByProfile.get(multipassId) ?? null;
      if (!agentCard) return null;
      return deriveAgentCardServiceUpdates(agentCard, fragmentsByProfile.get(multipassId) ?? [], options.baseUrl ?? '');
    },

    getStandardsProfile(multipassId) {
      return standardsByProfile.get(multipassId) ?? null;
    },

    getX402Manifest(multipassId) {
      const derived = deriveX402ManifestFromTools(multipassId, fragmentsByProfile.get(multipassId) ?? []);
      if (derived.endpoints.length > 0) return derived;
      return x402ByProfile.get(multipassId) ?? null;
    },

    getX401Manifest(multipassId) {
      const derived = deriveX401ManifestFromFragments(multipassId, fragmentsByProfile.get(multipassId) ?? []);
      if (derived.x401_supported) return derived;
      return x401ByProfile.get(multipassId) ?? derived;
    },

    getReceiptFragments(multipassId) {
      return receiptsByProfile.get(multipassId) ?? [];
    },

    getReceiptFragment(multipassId, receiptId) {
      return (receiptsByProfile.get(multipassId) ?? []).find((receipt) => receipt.receipt_id === receiptId) ?? null;
    },

    searchProfiles(query, options = {}) {
      return searchProfileList(profiles, query, options);
    },
  };
}

export function createMultipassApi({
  store,
  baseUrl,
  savedRecords,
  activationService,
  allowedOrigins,
  adminSecret,
  signatureVerifier = verifyEthereumPersonalSignature,
  cookieSecure,
  fetchImpl = fetch,
} = {}) {
  if (!store) {
    throw new TypeError('createMultipassApi requires a store');
  }

  const normalizedBaseUrl = stripTrailingSlash(baseUrl ?? 'http://localhost');
  const context = {
    store,
    savedRecords,
    activationService,
    normalizedBaseUrl,
    allowedOrigins: normalizeAllowedOrigins(allowedOrigins, normalizedBaseUrl),
    adminSecret,
    signatureVerifier,
    cookieSecure: cookieSecure ?? inferSecureCookie(allowedOrigins, normalizedBaseUrl),
    cookieName: MANAGER_COOKIE_NAME,
    fetchImpl,
  };

  return {
    async handleRequest(request) {
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        const method = request.method.toUpperCase();

        if (method === 'POST') {
          if (parts[0] === 'api' && parts[1] === 'admin') {
            return await handleAdminPost(request, parts, context);
          }
          return await handlePostRequest(request, parts, context);
        }

        if (method === 'PATCH') {
          return await handlePatchRequest(request, parts, context);
        }

        if (method !== 'GET') {
          return errorResponse(405, 'method_not_allowed', 'Only GET, PATCH, and selected POST routes are supported by the Multipass API boundary.');
        }

        if (url.pathname === '/.well-known/helixa-multipass.json' || url.pathname === '/.well-known/multipass.json') {
          return jsonResponse(createDiscoveryDocument(normalizedBaseUrl));
        }

        if (url.pathname === '/api/openapi.json') {
          return jsonResponse(createOpenApiDocument(normalizedBaseUrl));
        }

        if (parts[0] === 'api' && parts[1] === 'multipass' && parts[2] === 'resolve') {
          return await handleCanonicalResolve(url, context);
        }

        if (parts[0] === 'api' && parts[1] === 'resolve') {
          return await handleResolve(url, context);
        }

        if (parts[0] === 'api' && parts[1] === 'search') {
          return handleSearch(url, context);
        }

        const shareResponse = await handleDynamicShareRead(parts, context);
        if (shareResponse) return shareResponse;

        return handlePublicRead(parts, context);
      } catch (error) {
        if (error instanceof ApiInputError) {
          return errorResponse(400, error.code, error.message);
        }
        if (error instanceof ApiUnauthorizedError) {
          return errorResponse(401, 'unauthorized', error.message);
        }
        if (error instanceof ApiForbiddenError) {
          return errorResponse(403, 'forbidden', error.message);
        }
        if (error instanceof ApiNotFoundError) {
          return errorResponse(404, 'not_found', error.message);
        }
        if (error instanceof GroupActivationError) {
          return errorResponse(error.status ?? 400, error.code, error.message, error.details ?? {});
        }
        if (error instanceof TypeError) {
          return errorResponse(400, 'invalid_request', error.message);
        }
        throw error;
      }
    },
  };
}

async function handlePostRequest(request, parts, context) {
  if (parts[0] !== 'api' || parts[1] !== 'multipass') {
    return errorResponse(404, 'not_found', 'Route not found.');
  }

  if (parts[2] === 'groups' && parts[3] === 'preview' && parts.length === 4) {
    return handleGroupPreview(request, context);
  }

  if (parts[2] === 'groups' && parts.length === 3) {
    return handleSaveGroupMultipass(request, context);
  }

  if (parts[2] === 'activate' && parts.length === 3) {
    if (!context.activationService) {
      return errorResponse(503, 'not_configured', 'Multipass activation is not configured.');
    }
    return handleActivatePreview(request, context.activationService);
  }

  if (parts.length === 2) {
    if (!context.savedRecords) {
      return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
    }
    if (!context.activationService) {
      return errorResponse(503, 'not_configured', 'Multipass activation is not configured.');
    }
    return handleSaveMultipass(request, context);
  }

  if (parts[2] && parts[3] === 'claim' && parts[4] === 'nonce' && parts.length === 5) {
    return handleClaimNonce(request, parts[2], context);
  }

  if (parts[2] && parts[3] === 'claim' && parts[4] === 'verify' && parts.length === 5) {
    return handleClaimVerify(request, parts[2], context);
  }

  if (parts[2] && parts[3] === 'fragments' && parts.length === 4) {
    return handleCreateFragment(request, parts[2], context);
  }

  if (parts[2] && parts[3] === 'fragments' && parts[4] && parts[5] === 'revoke' && parts.length === 6) {
    return handleRevokeFragment(request, parts[2], parts[4], context);
  }

  if (parts[2] && parts[3] === 'tools' && parts[4] && parts[5] === 'refresh' && parts.length === 6) {
    return handleRefreshTool(request, parts[2], parts[4], context);
  }

  if (parts[2] && parts[3] === 'tools' && parts[4] === 'import' && parts.length === 5) {
    return handleImportTool(request, parts[2], context);
  }

  if (parts[2] && parts[3] === 'session' && parts[4] === 'logout' && parts.length === 5) {
    return handleSessionLogout(request, parts[2], context);
  }

  return errorResponse(404, 'not_found', 'Route not found.');
}

async function handleAdminPost(request, parts, context) {
  if (parts[2] !== 'multipass' || !parts[3] || parts[4] !== 'claims' || !parts[5] || parts[6] !== 'approve' || parts.length !== 7) {
    return errorResponse(404, 'not_found', 'Route not found.');
  }
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  assertTrustedOrigin(request, context);
  if (!context.adminSecret) {
    return errorResponse(503, 'not_configured', 'Multipass admin approval is not configured.');
  }
  if (request.headers.get('x-admin-secret') !== context.adminSecret) {
    throw new ApiUnauthorizedError('Admin approval requires a valid server-side admin secret.');
  }

  const profile = resolveSavedProfile(context.savedRecords, parts[3]);
  let claim;
  try {
    claim = context.savedRecords.approveManualReviewClaim(profile.multipass_id, parts[5], {
      admin: 'api-admin',
    });
  } catch (error) {
    throw mapAdminClaimError(error);
  }
  const updatedProfile = context.savedRecords.resolveProfile(profile.multipass_id);
  return jsonResponse({
    schema_version: '0.1.0',
    claim_status: context.savedRecords.getClaimState(profile.multipass_id).status,
    claim,
    profile: updatedProfile,
  });
}

async function handlePatchRequest(request, parts, context) {
  if (parts[0] !== 'api' || parts[1] !== 'multipass' || !parts[2]) {
    return errorResponse(404, 'not_found', 'Route not found.');
  }
  if (parts[3] === 'profile' && parts.length === 4) {
    return handlePatchProfile(request, parts[2], context);
  }
  if (parts[3] === 'fragments' && parts[4] && parts.length === 5) {
    return handlePatchFragment(request, parts[2], parts[4], context);
  }
  return errorResponse(404, 'not_found', 'Route not found.');
}

async function handleActivatePreview(request, activationService) {
  const body = await readJsonBody(request);
  const agent = String(body.agent ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to activate.');
  const record = await activationService(agent);
  return jsonResponse({
    schema_version: '0.1.0',
    state: 'activated_unsaved',
    profile: record.profile,
    source: record.source,
  });
}

async function handleSaveMultipass(request, { savedRecords, activationService }) {
  if (!savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }

  const body = await readJsonBody(request);
  const agent = String(body.agent ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to save.');
  const record = await activationService(agent);
  const saved = savedRecords.saveActivatedRecord(record);
  return jsonResponse({
    schema_version: '0.1.0',
    state: saved.created ? 'saved_unclaimed' : 'saved_existing',
    created: saved.created,
    multipass_id: saved.profile.multipass_id,
    slug: saved.profile.slug,
    profile: saved.profile,
    sharePath: `/multipass/${encodeURIComponent(saved.profile.slug)}`,
  }, saved.created ? 201 : 200);
}

async function handleGroupPreview(request, context) {
  if (!context.activationService) {
    return errorResponse(503, 'not_configured', 'Multipass group activation is not configured.');
  }

  const body = await readJsonBody(request);
  const preview = await createGroupActivationPreview(body, { activationService: context.activationService });
  return jsonResponse({
    schema_version: '0.1.0',
    state: 'group_preview',
    record: preview.record,
    members: preview.members,
  });
}

async function handleSaveGroupMultipass(request, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  if (!context.activationService) {
    return errorResponse(503, 'not_configured', 'Multipass group activation is not configured.');
  }

  const body = await readJsonBody(request);
  const preview = await createGroupActivationPreview(body, { activationService: context.activationService });
  const saved = saveGroupActivationRecord(context.savedRecords, preview.record);
  return jsonResponse({
    schema_version: '0.1.0',
    state: saved.created ? 'saved_group_unclaimed' : 'saved_group_existing',
    created: saved.created,
    multipass_id: saved.profile.multipass_id,
    slug: saved.profile.slug,
    profile: saved.profile,
    sharePath: `/multipass/${encodeURIComponent(saved.profile.slug)}`,
  }, saved.created ? 201 : 200);
}

function saveGroupActivationRecord(savedRecords, record) {
  try {
    return savedRecords.saveActivatedRecord(record);
  } catch (error) {
    if (!isSavedRecordSlugCollisionError(error)) {
      if (isSavedRecordUniquenessError(error)) {
        throwGroupSlugConflict(record.profile.slug, null);
      }
      throw error;
    }
  }

  const retrySlug = createGroupRetrySlug(record);
  try {
    return savedRecords.saveActivatedRecord(cloneRecordWithSlug(record, retrySlug));
  } catch (error) {
    if (isSavedRecordUniquenessError(error)) {
      throwGroupSlugConflict(record.profile.slug, retrySlug);
    }
    throw error;
  }
}

function throwGroupSlugConflict(slug, retrySlug) {
  throw new GroupActivationError(
    'group_slug_conflict',
    'A saved Multipass group already uses the generated slug. Try a more specific group display name.',
    409,
    pruneUndefined({ slug, retry_slug: retrySlug }),
  );
}

function createGroupRetrySlug(record) {
  const currentSlug = String(record?.profile?.slug ?? '').trim() || 'group';
  const fingerprint = String(record?.sourceContext?.sourceSnapshot?.fingerprint ?? '').trim();
  if (/^[a-f0-9]{8}$/.test(fingerprint) && currentSlug.endsWith(`-${fingerprint}`)) {
    const suffix = `-${fingerprint}-group`;
    const maxBaseLength = 81 - suffix.length;
    const base = currentSlug
      .slice(0, -(fingerprint.length + 1))
      .slice(0, maxBaseLength)
      .replace(/-+$/g, '') || 'group';
    return `${base}${suffix}`;
  }

  const base = currentSlug.slice(0, 75).replace(/-+$/g, '') || 'group';
  return `${base}-group`;
}

function cloneRecordWithSlug(record, slug) {
  const currentSlug = String(record?.profile?.slug ?? '').trim();
  const cloned = cloneJsonValue(record);

  cloned.profile = { ...cloned.profile, slug };
  rewriteSlugUrlFields(cloned.profile.discovery_profile, currentSlug, slug);

  rewriteSlugUrlFields(cloned.agentCard, currentSlug, slug);
  rewriteSlugUrlFields(cloned.standardsProfile, currentSlug, slug);

  for (const fragment of cloned.fragments ?? []) {
    rewriteSlugUrlFields(fragment.source, currentSlug, slug);
    rewriteSlugUrlFields(fragment.endpoint_ref, currentSlug, slug);
    rewriteSlugUrlFields(fragment.verification_ref, currentSlug, slug);
    rewriteSlugUrlFields(fragment.x401_proof_ref, currentSlug, slug);
  }

  return cloned;
}

function cloneJsonValue(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function rewriteSlugUrlFields(value, currentSlug, nextSlug) {
  if (!currentSlug || !nextSlug || !value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item) => rewriteSlugUrlFields(item, currentSlug, nextSlug));
    return;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (isSlugUrlField(key)) {
      value[key] = rewriteGeneratedMultipassSlugUrl(fieldValue, currentSlug, nextSlug);
    } else if (fieldValue && typeof fieldValue === 'object') {
      rewriteSlugUrlFields(fieldValue, currentSlug, nextSlug);
    }
  }
}

function isSlugUrlField(key) {
  return /(?:^|_)(?:url|href|uri|path)$|(?:Url|Href|Uri|Path)$/.test(key);
}

function rewriteGeneratedMultipassSlugUrl(value, currentSlug, nextSlug) {
  if (typeof value !== 'string' || !value.includes(currentSlug)) return value;

  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url;
  try {
    url = new URL(value, 'https://multipass.invalid');
  } catch {
    return value;
  }

  const parts = url.pathname.split('/');
  let changed = false;
  for (let index = 1; index < parts.length; index += 1) {
    if (parts[index - 1] !== 'multipass') continue;
    let decodedPart;
    try {
      decodedPart = decodeURIComponent(parts[index]);
    } catch {
      decodedPart = parts[index];
    }
    if (decodedPart !== currentSlug) continue;
    parts[index] = encodeURIComponent(nextSlug);
    changed = true;
  }

  if (!changed) return value;
  url.pathname = parts.join('/');
  if (isAbsolute) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

function isSavedRecordSlugCollisionError(error) {
  const message = String(error?.message ?? '');
  return isSavedRecordUniquenessError(error) && /saved_records\.slug|\bslug\b/i.test(message);
}

function isSavedRecordUniquenessError(error) {
  const message = String(error?.message ?? '');
  const code = String(error?.code ?? '');
  return /UNIQUE constraint failed|constraint/i.test(message) || code.includes('SQLITE_CONSTRAINT');
}

function handleClaimNonce(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  return jsonResponse(context.savedRecords.createClaimNonce(profile.multipass_id, {
    domain: domainFromRequest(request),
  }));
}

async function handleClaimVerify(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  const body = await readJsonBody(request);
  const mode = String(body.mode ?? '').trim();

  if (mode === 'manual_review') {
    const claim = context.savedRecords.createManualReviewRequest(profile.multipass_id, {
      proposedManagerWallet: body.proposedManagerWallet,
      contactRoute: body.contactRoute,
      note: body.note,
    });
    return jsonResponse({
      schema_version: '0.1.0',
      claim_status: 'claim_pending',
      claim,
      profile: context.savedRecords.resolveProfile(profile.multipass_id),
    }, 202);
  }

  if (mode !== 'wallet_signature') {
    throw new ApiInputError('invalid_request', 'Use wallet_signature or manual_review claim verification mode.');
  }

  const wallet = normalizeWallet(body.wallet, 'wallet');
  const signature = String(body.signature ?? '').trim();
  const nonceValue = String(body.nonce ?? '').trim();
  if (!signature) throw new ApiInputError('invalid_request', 'signature is required.');
  if (!nonceValue) throw new ApiInputError('invalid_request', 'nonce is required.');

  let nonce;
  try {
    nonce = context.savedRecords.consumeClaimNonce(nonceValue, { multipassId: profile.multipass_id });
  } catch (error) {
    throw new ApiForbiddenError(error.message);
  }
  const validSignature = await context.signatureVerifier({ wallet, message: nonce.message, signature });
  if (!validSignature) {
    throw new ApiForbiddenError('Wallet signature did not verify against the claim nonce.');
  }

  const sourceOwner = getSourceOwnerWallet(context.savedRecords, profile.multipass_id);
  let claimStatus;
  if (sourceOwner && sourceOwner === wallet) {
    context.savedRecords.markOwnerWalletVerified(profile.multipass_id, { managerWallet: wallet });
    claimStatus = 'claimed_verified_owner';
  } else if (context.savedRecords.findApprovedManagerClaim(profile.multipass_id, wallet)) {
    claimStatus = 'claimed_review_approved';
  } else {
    throw new ApiForbiddenError('Wallet is not eligible to manage this Multipass record.');
  }

  const session = context.savedRecords.createManagerSession(profile.multipass_id, {
    managerWallet: wallet,
    claimStatus,
  });
  return jsonResponse({
    schema_version: '0.1.0',
    claim_status: claimStatus,
    csrfToken: session.csrfToken,
    session_expires_at: session.expires_at,
    profile: context.savedRecords.resolveProfile(profile.multipass_id),
  }, 200, { 'set-cookie': buildSessionCookie(session.sessionId, context) });
}

async function handlePatchProfile(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  const body = await readJsonBody(request);
  const updated = context.savedRecords.updatePublicProfile(profile.multipass_id, body, {
    actorWallet: session.manager_wallet,
  });
  return jsonResponse({
    schema_version: '0.1.0',
    changedFields: updated.changedFields,
    profile: updated.profile,
    changes: context.savedRecords.getChangeLog?.(profile.multipass_id),
  });
}

async function handleCreateFragment(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  const body = await readJsonBody(request);
  try {
    const created = context.savedRecords.createPublicFragment(profile.multipass_id, body, { actorWallet: session.manager_wallet });
    return jsonResponse({ schema_version: '0.1.0', ...created }, 201);
  } catch (error) {
    throw mapFragmentMutationError(error);
  }
}

async function handlePatchFragment(request, identifier, fragmentId, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  const body = await readJsonBody(request);
  try {
    const updated = context.savedRecords.updatePublicFragment(profile.multipass_id, fragmentId, body, { actorWallet: session.manager_wallet });
    return jsonResponse({ schema_version: '0.1.0', ...updated });
  } catch (error) {
    throw mapFragmentMutationError(error);
  }
}

function handleRevokeFragment(request, identifier, fragmentId, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  try {
    const revoked = context.savedRecords.revokePublicFragment(profile.multipass_id, fragmentId, { actorWallet: session.manager_wallet });
    return jsonResponse({ schema_version: '0.1.0', ...revoked });
  } catch (error) {
    throw mapFragmentMutationError(error);
  }
}

async function handleImportTool(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  const body = await readJsonBody(request);
  try {
    const imported = context.savedRecords.importBankrTool(profile.multipass_id, body, { actorWallet: session.manager_wallet });
    return jsonResponse({ schema_version: '0.1.0', ...imported }, 201);
  } catch (error) {
    throw mapToolImportError(error);
  }
}

async function handleRefreshTool(request, identifier, fragmentId, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  try {
    const refreshed = await context.savedRecords.refreshTool(profile.multipass_id, fragmentId, {
      actorWallet: session.manager_wallet,
      fetchImpl: context.fetchImpl,
    });
    return jsonResponse({ schema_version: '0.1.0', ...refreshed });
  } catch (error) {
    throw mapToolImportError(error);
  }
}

function requireManagerSession(request, identifier, context) {
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  const sessionId = parseCookies(request.headers.get('cookie')).get(context.cookieName);
  if (!sessionId) throw new ApiUnauthorizedError('Manager session cookie is required.');
  try {
    const session = context.savedRecords.validateManagerSession({
      sessionId,
      multipassId: profile.multipass_id,
      csrfToken: request.headers.get('x-csrf-token') ?? '',
    });
    return { profile, session };
  } catch (error) {
    throw new ApiForbiddenError(error.message);
  }
}

function mapFragmentMutationError(error) {
  const message = error.message ?? 'Fragment mutation failed.';
  if (/not found/i.test(message)) return new ApiNotFoundError(message);
  if (/read-only|not editable|imported|Marketplace Connection fragments must be edited/i.test(message)) return new ApiForbiddenError(message);
  return new ApiInputError('invalid_request', message);
}

function mapToolImportError(error) {
  const message = error.message ?? 'Tool import failed.';
  if (/not found/i.test(message)) return new ApiNotFoundError(message);
  return new ApiInputError('invalid_request', message);
}

function handleSessionLogout(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Multipass activation records are not configured.');
  }
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  const sessionId = parseCookies(request.headers.get('cookie')).get(context.cookieName);
  if (sessionId) {
    try {
      context.savedRecords.validateManagerSession({
        sessionId,
        multipassId: profile.multipass_id,
        csrfToken: request.headers.get('x-csrf-token') ?? '',
      });
      context.savedRecords.revokeManagerSession(sessionId);
    } catch (error) {
      throw new ApiForbiddenError(error.message);
    }
  }
  return jsonResponse({ schema_version: '0.1.0', ok: true }, 200, { 'set-cookie': clearSessionCookie(context) });
}

async function handleCanonicalResolve(url, context) {
  const sourceRaw = String(url.searchParams.get('source') ?? '').trim();
  if (!sourceRaw) throw new ApiInputError('invalid_request', 'Provide source to resolve.');
  return jsonResponse(await resolveCanonicalSource(sourceRaw, context));
}

async function handleResolve(url, context) {
  const agent = String(url.searchParams.get('agent') ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to resolve.');

  if (isCanonicalSourceInput(agent)) {
    return jsonResponse(addLegacyResolverSource(await resolveCanonicalSource(agent, context), context.savedRecords));
  }

  const savedProfile = context.savedRecords?.resolveProfile?.(agent);
  if (savedProfile) {
    try {
      return jsonResponse(addLegacyResolverSource(buildHydratedProfileResponse({
        mode: 'saved',
        profile: savedProfile,
        sourceStore: context.savedRecords,
        sourceIdentity: inferSourceIdentityFromSaved(savedProfile, context.savedRecords),
        baseUrl: context.normalizedBaseUrl,
      }), context.savedRecords));
    } catch (error) {
      if (!(error instanceof ApiNotFoundError)) throw error;
      return jsonResponse(buildLegacySavedResolverResponse(savedProfile, context));
    }
  }

  const fixtureProfile = context.store.resolveProfile(agent);
  if (fixtureProfile) {
    return jsonResponse({
      schema_version: '0.1.0',
      state: 'saved_record',
      profile: fixtureProfile,
      source: null,
      routes: createProfileRoutes(context.normalizedBaseUrl, fixtureProfile.slug),
    });
  }

  if (!context.activationService) {
    return errorResponse(404, 'not_found', `Multipass not found: ${agent}`);
  }

  try {
    return jsonResponse(await resolveCanonicalSource(agent, context));
  } catch (error) {
    return errorResponse(404, 'not_found', `Multipass not found: ${agent}`);
  }
}

async function resolveCanonicalSource(sourceRaw, context) {
  const sourceIdentity = normalizeMultipassSourceInput(sourceRaw);

  const existing = context.savedRecords?.resolveBySource?.(sourceIdentity.sourceType, sourceIdentity.legacyCanonicalId)
    ?? context.savedRecords?.resolveBySource?.(sourceIdentity.sourceType, sourceIdentity.canonicalId)
    ?? null;
  if (existing) {
    return buildHydratedProfileResponse({
      mode: 'activated',
      profile: existing.profile,
      sourceStore: context.savedRecords,
      sourceIdentity,
      baseUrl: context.normalizedBaseUrl,
    });
  }

  if (!context.activationService) {
    throw new ApiNotFoundError(`Multipass source not found: ${sourceRaw}`);
  }

  try {
    const record = await context.activationService(getActivationInputForSource(sourceIdentity));
    return {
      ...buildHydratedProfileResponse({
        mode: 'activation_preview',
        profile: record.profile,
        sourceStore: createRecordSourceStore(record),
        sourceIdentity,
        baseUrl: context.normalizedBaseUrl,
        activation: { state: 'not_activated', manager_state: 'none', claim_url: null },
      }),
      source: record.source,
      save_url: `${context.normalizedBaseUrl}/api/multipass`,
    };
  } catch (error) {
    throw new ApiNotFoundError(`Multipass source not found: ${sourceRaw}`);
  }
}

function handleSearch(url, context) {
  const query = String(url.searchParams.get('q') ?? '').trim();
  if (query.length < 2) {
    throw new ApiInputError('invalid_request', 'Search query must be at least 2 characters.');
  }

  const matches = [];
  const seen = new Set();
  for (const [kind, sourceStore] of [
    ['saved', context.savedRecords],
    ['fixture', context.store],
  ]) {
    if (!sourceStore?.searchProfiles) continue;
    for (const profile of sourceStore.searchProfiles(query, { limit: 10 })) {
      if (seen.has(profile.multipass_id)) continue;
      seen.add(profile.multipass_id);
      matches.push(createProfileSearchResult(profile, kind, context.normalizedBaseUrl));
      if (matches.length >= 10) break;
    }
    if (matches.length >= 10) break;
  }

  return jsonResponse({
    schema_version: '0.1.0',
    query,
    matches,
  });
}

async function handleDynamicShareRead(parts, context) {
  const parsed = parseDynamicShareParts(parts);
  if (!parsed) return null;
  const resolved = resolvePublicProfile(parsed.identifier, { store: context.store, savedRecords: context.savedRecords });
  if (!resolved) return errorResponse(404, 'not_found', `Multipass not found: ${parsed.identifier}`);

  if (parsed.kind === 'jpg') {
    const jpeg = await renderShareCardJpeg(resolved.profile, resolved.sourceStore, context.normalizedBaseUrl);
    return binaryResponse(jpeg, 'image/jpeg', {
      'cache-control': 'public, max-age=300',
    });
  }

  return htmlResponse(renderDynamicShareHtml(resolved.profile, resolved.sourceStore, context.normalizedBaseUrl), {
    'cache-control': 'public, max-age=300',
  });
}

function parseDynamicShareParts(parts) {
  if (parts[0] === 'multipass' && parts[1] === 'share' && parts[2] && parts.length === 3) {
    return parseShareIdentifier(parts[2]);
  }
  if (parts[0] === 'api' && parts[1] === 'multipass' && parts[2] && parts[3] === 'share' && parts.length === 4) {
    return { identifier: parts[2], kind: 'html' };
  }
  if (parts[0] === 'api' && parts[1] === 'multipass' && parts[2] && parts[3] === 'share.jpg' && parts.length === 4) {
    return { identifier: parts[2], kind: 'jpg' };
  }
  return null;
}

function parseShareIdentifier(rawPart) {
  const raw = String(rawPart ?? '').trim();
  const jpg = raw.match(/^([a-z0-9][a-z0-9-]{1,80})\.jpg$/i);
  if (jpg) return { identifier: jpg[1], kind: 'jpg' };
  if (/^[a-z0-9][a-z0-9-]{1,80}$/i.test(raw)) return { identifier: raw, kind: 'html' };
  return null;
}

function renderDynamicShareHtml(profile, sourceStore, baseUrl) {
  const displayName = profile.display_name ?? profile.slug ?? 'Multipass';
  const title = truncate(`${displayName} Multipass`, 80);
  const description = truncate(profile.discovery_profile?.summary || `Public Multipass profile for ${displayName}. Identity, proof, custody, Cred, and discovery context for agents and AI-native systems.`, 220);
  const shareUrl = new URL(`/multipass/share/${encodeURIComponent(profile.slug)}`, baseUrl).toString();
  const imageUrl = new URL(`/multipass/share/${encodeURIComponent(profile.slug)}.jpg`, baseUrl).toString();
  const profileUrl = new URL(`/multipass/${encodeURIComponent(profile.slug)}`, baseUrl).toString();
  const visualSource = safePublicUrl(profile.discovery_profile?.avatar_url);
  const tags = uniqueStrings(profile.discovery_profile?.tags ?? []).slice(0, 8).join(', ');
  const agentCard = sourceStore.getAgentCard?.(profile.multipass_id);
  const cardSummary = agentCard?.summary ? truncate(agentCard.summary, 180) : description;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(title)} preview" />
  <meta name="multipass:id" content="${escapeHtml(profile.multipass_id)}" />
  ${visualSource ? `<meta name="multipass:visual-source" content="${escapeHtml(visualSource)}" />` : ''}
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(cardSummary)}</p>
    ${tags ? `<p>${escapeHtml(tags)}</p>` : ''}
    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)} preview" width="1200" height="630" />
    <p><a class="open-profile" href="${escapeHtml(profileUrl)}">Open Multipass profile</a></p>
  </main>
  <script>if (!/bot|crawl|spider|telegram|twitter|discord|slack|facebook|whatsapp/i.test(navigator.userAgent)) window.location.replace('${escapeJsString(profileUrl)}');</script>
</body>
</html>`;
}

async function renderShareCardJpeg(profile, sourceStore, baseUrl) {
  const profileImageUrl = await resolveShareCardImageUrl(profile.discovery_profile?.avatar_url);
  const svg = renderShareCardSvg(profile, sourceStore, baseUrl, { profileImageUrl });
  return svgToJpeg(svg);
}

async function resolveShareCardImageUrl(value) {
  const safe = safeShareCardImageUrl(value);
  if (!safe) return null;
  if (safe.startsWith('data:image/')) return safe;
  return await fetchShareCardImageDataUri(safe);
}

async function fetchShareCardImageDataUri(url) {
  if (isBlockedShareCardImageUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok || isBlockedShareCardImageUrl(response.url || url)) return null;
    const contentType = normalizeShareCardImageContentType(response.headers.get('content-type'), url);
    if (!contentType) return null;
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 2_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2_000_000) return null;
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeShareCardImageContentType(value, url) {
  const contentType = String(value ?? '').split(';')[0].trim().toLowerCase();
  if (['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return contentType;
  const pathname = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
  })();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  return null;
}

function isBlockedShareCardImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return true;
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
    return isPrivateIpLiteral(host);
  } catch {
    return true;
  }
}

function isPrivateIpLiteral(host) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || a === 0;
  }
  const normalized = host.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.');
}

function renderShareCardSvg(profile, sourceStore, baseUrl, { profileImageUrl = null } = {}) {
  const displayName = profile.display_name ?? profile.slug ?? 'Multipass';
  const title = truncate(displayName, 42);
  const summary = truncate(profile.discovery_profile?.summary || 'Public Multipass profile for agents and AI-native systems.', 115);
  const tags = uniqueStrings(profile.discovery_profile?.tags ?? []).slice(0, 4);
  const status = titleCase(profile.owner_summary?.owner_state ?? 'public profile');
  const subject = titleCase(profile.subject_type ?? 'agent');
  const initials = initialsForShareCard(displayName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090907"/><stop offset="0.58" stop-color="#17110d"/><stop offset="1" stop-color="#312216"/></linearGradient>
    <radialGradient id="glow" cx="0.84" cy="0.1" r="0.7"><stop offset="0" stop-color="#c99b59" stop-opacity="0.5"/><stop offset="1" stop-color="#c99b59" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000000" flood-opacity="0.35"/></filter>
    <clipPath id="profileImageClip"><rect x="766" y="116" width="320" height="320" rx="54" ry="54"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="70" y="70" width="1060" height="490" rx="52" fill="#14100d" stroke="#d8b06b" stroke-opacity="0.28" filter="url(#shadow)"/>
  <text x="112" y="135" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="#d8b06b" letter-spacing="5">MULTIPASS</text>
  <text x="112" y="240" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="900" fill="#fff7e8">${escapeSvg(title)}</text>
  <text x="112" y="298" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="700" fill="#d7c1a2">${escapeSvg(subject)} · ${escapeSvg(status)}</text>
  ${wrapSvgText(summary, 112, 354, 30, 34, '#f0dfc4')}
  <rect x="756" y="106" width="340" height="340" rx="62" fill="#090907" stroke="#d8b06b" stroke-opacity="0.45" stroke-width="2"/>
  ${profileImageUrl ? renderShareCardProfileImage(profileImageUrl) : renderShareCardFallbackInitials(initials)}
  <text x="112" y="500" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="800" fill="#d8b06b">${escapeSvg(tags.length ? tags.join('  ·  ') : 'identity · proof · discovery')}</text>
  <text x="766" y="492" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#d7c1a2">helixa.xyz/multipass</text>
</svg>`;
}

function renderShareCardProfileImage(profileImageUrl) {
  const escaped = escapeHtml(profileImageUrl);
  return `<image x="766" y="116" width="320" height="320" href="${escaped}" xlink:href="${escaped}" preserveAspectRatio="xMidYMid slice" clip-path="url(#profileImageClip)"/>`;
}

function renderShareCardFallbackInitials(initials) {
  return `<rect x="786" y="136" width="280" height="280" rx="50" fill="#211915"/>
  <text x="926" y="286" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="104" font-weight="900" fill="#d8b06b">${escapeSvg(initials)}</text>`;
}

async function svgToJpeg(svg) {
  const dir = await mkdtemp(join(tmpdir(), 'multipass-share-'));
  const svgPath = join(dir, 'card.svg');
  const jpgPath = join(dir, 'card.jpg');
  try {
    await writeFile(svgPath, svg);
    await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'svg_pipe', '-i', svgPath, '-frames:v', '1', '-q:v', '2', jpgPath]);
    return await readFile(jpgPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed with code ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      resolve();
    });
  });
}

function initialsForShareCard(value) {
  const words = String(value ?? '').match(/[A-Za-z0-9]+/g)?.slice(0, 2) ?? [];
  return words.map((word) => word[0]?.toUpperCase()).join('') || 'MP';
}

function wrapSvgText(value, x, y, fontSize, maxChars, fill) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= 2) break;
  }
  if (line && lines.length < 3) lines.push(line);
  return lines.slice(0, 3).map((entry, index) => `<text x="${x}" y="${y + index * (fontSize + 10)}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="650" fill="${fill}">${escapeSvg(entry)}</text>`).join('\n  ');
}

function htmlResponse(body, extraHeaders = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...extraHeaders },
  });
}

function binaryResponse(body, contentType, extraHeaders = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...extraHeaders },
  });
}

function truncate(value, maxLength) {
  const raw = String(value ?? '').trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function safePublicUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeShareCardImageUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(raw) && raw.length <= 2_000_000) return raw;
  return safePublicUrl(raw);
}

function titleCase(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function escapeJsString(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('</script', '<\\/script');
}

function handlePublicRead(parts, { store, savedRecords, normalizedBaseUrl }) {
  const readParts = normalizePublicReadParts(parts);
  if (!readParts) {
    return errorResponse(404, 'not_found', 'Route not found.');
  }

  const resolved = resolvePublicProfile(readParts.identifier, { store, savedRecords });
  if (!resolved) {
    return errorResponse(404, 'not_found', `Multipass not found: ${readParts.identifier}`);
  }

  const { profile, sourceStore } = resolved;

  if (!readParts.resource) {
    return jsonResponse(decorateProfileWithMarketplacePresence(profile, sourceStore));
  }

  if (readParts.resource === 'hydrated' && !readParts.resourceId) {
    return jsonResponse(buildHydratedProfileResponse({
      mode: 'saved',
      profile,
      sourceStore,
      sourceIdentity: inferSourceIdentityFromSaved(profile, sourceStore),
      baseUrl: normalizedBaseUrl,
    }));
  }

  if (readParts.resource === 'fragments' && !readParts.resourceId) {
    return jsonResponse({
      schema_version: profile.schema_version,
      multipass_id: profile.multipass_id,
      fragments: sourceStore.getPublicFragments(profile.multipass_id),
    });
  }

  if (readParts.resource === 'tools' && !readParts.resourceId) {
    return jsonResponse(getToolsResponse(sourceStore, profile.multipass_id));
  }

  if ((readParts.resource === 'agent-card' || readParts.resource === 'card') && !readParts.resourceId) {
    const agentCard = sourceStore.getAgentCard(profile.multipass_id, { baseUrl: normalizedBaseUrl });
    return jsonOrNotFound(decorateAgentCardForDiscovery(agentCard, profile, normalizedBaseUrl), 'Agent card not found.');
  }

  if ((readParts.resource === 'standards' || readParts.resource === 'standards-profile') && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getStandardsProfile(profile.multipass_id), 'Standards profile not found.');
  }

  if (readParts.resource === 'x402' && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getX402Manifest(profile.multipass_id), 'x402 manifest not found.');
  }

  if (readParts.resource === 'x401' && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getX401Manifest(profile.multipass_id), 'x401 manifest not found.');
  }

  if (readParts.resource === 'receipts' && !readParts.resourceId) {
    return jsonResponse({
      schema_version: profile.schema_version,
      multipass_id: profile.multipass_id,
      receipts: sourceStore.getReceiptFragments?.(profile.multipass_id) ?? [],
    });
  }

  if (readParts.resource === 'receipts' && readParts.resourceId) {
    return jsonOrNotFound(
      sourceStore.getReceiptFragment(profile.multipass_id, readParts.resourceId),
      `Receipt not found: ${readParts.resourceId}`,
    );
  }

  if (readParts.resource === 'changes' && !readParts.resourceId && typeof sourceStore.getChangeLog === 'function') {
    return jsonResponse(sourceStore.getChangeLog(profile.multipass_id));
  }

  return errorResponse(404, 'not_found', 'Route not found.');
}

function normalizePublicReadParts(parts) {
  if (parts[0] === 'api' && parts[1] === 'multipass' && parts[2] && parts.length <= 5) {
    return { identifier: parts[2], resource: parts[3] ?? null, resourceId: parts[4] ?? null };
  }
  if (parts[0] === 'api' && parts[1] === 'v0' && parts[2] === 'multipass' && parts[3] && parts.length <= 6) {
    return { identifier: parts[3], resource: parts[4] ?? null, resourceId: parts[5] ?? null };
  }
  return null;
}

function createRecordSourceStore(record) {
  return createMemoryStore({
    profiles: [record.profile],
    fragments: record.fragments ?? [],
    agentCards: [record.agentCard],
    standardsProfiles: [record.standardsProfile],
    x402Manifests: [record.x402Manifest],
    x401Manifests: record.x401Manifest ? [record.x401Manifest] : [],
    receiptFragments: record.receipts ?? [],
  });
}

function getActivationInputForSource(sourceIdentity) {
  return sourceIdentity.sourceType === ERC8004_SOURCE_TYPE ? sourceIdentity.canonicalId : sourceIdentity.tokenId;
}

function inferSourceIdentityFromSaved(profile, sourceStore) {
  const activation = sourceStore.getSourceContext?.(profile.multipass_id)?.activation;
  const sourceType = String(activation?.sourceType ?? '').trim();
  const canonicalId = String(activation?.canonicalId ?? '').trim();

  if (!SUPPORTED_HYDRATED_SOURCE_TYPES.has(sourceType) || !canonicalId) {
    throw new ApiNotFoundError(`Supported source identity not found for saved Multipass: ${profile.slug ?? profile.multipass_id}`);
  }

  try {
    const sourceIdentity = normalizeMultipassSourceInput(canonicalId);
    if (!SUPPORTED_HYDRATED_SOURCE_TYPES.has(sourceIdentity.sourceType)) {
      throw new TypeError('Multipass activation source is not supported for hydration.');
    }
    return sourceIdentity;
  } catch {
    throw new ApiNotFoundError(`Supported source identity not found for saved Multipass: ${profile.slug ?? profile.multipass_id}`);
  }
}

function buildLegacySavedResolverResponse(profile, context) {
  return {
    schema_version: '0.1.0',
    state: 'saved_record',
    profile,
    source: getLegacySourceFromSavedContext(profile, context.savedRecords),
    routes: createProfileRoutes(context.normalizedBaseUrl, profile.slug),
  };
}

function addLegacyResolverSource(response, sourceStore) {
  if (response?.state !== 'saved_record' || response.source !== undefined || !response.profile) {
    return response;
  }

  const source = getLegacySourceFromSavedContext(response.profile, sourceStore);
  return source ? { ...response, source } : response;
}

function getLegacySourceFromSavedContext(profile, sourceStore) {
  const activation = sourceStore?.getSourceContext?.(profile.multipass_id)?.activation;
  const sourceType = String(activation?.sourceType ?? '').trim();
  const canonicalId = String(activation?.canonicalId ?? '').trim();
  if (!sourceType || !canonicalId) return null;

  return pruneUndefined({
    state: copyStringOrNull(activation.state),
    origin: copyStringOrNull(activation.origin),
    originSource: copyStringOrNull(activation.originSource),
    sourceType,
    canonicalId,
    tokenId: activation.tokenId === undefined ? undefined : copyStringOrNull(activation.tokenId),
    savedAt: copyStringOrNull(activation.savedAt),
  });
}

function copyStringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isCanonicalSourceInput(input) {
  try {
    normalizeMultipassSourceInput(input);
    return true;
  } catch {
    return false;
  }
}

function resolvePublicProfile(identifier, { store, savedRecords }) {
  const savedProfile = savedRecords?.resolveProfile?.(identifier);
  if (savedProfile) return { profile: savedProfile, sourceStore: savedRecords };
  const profile = store.resolveProfile(identifier);
  return profile ? { profile, sourceStore: store } : null;
}

function decorateProfileWithMarketplacePresence(profile, sourceStore) {
  const fragments = sourceStore.getPublicFragments?.(profile.multipass_id) ?? [];
  const derived = deriveMarketplacePresenceFromFragments(fragments);
  const fallback = Array.isArray(profile?.marketplacePresence) ? profile.marketplacePresence : [];
  const marketplacePresence = derived.length ? derived : fallback;
  const hasMarketplaceFragments = fragments.some((fragment) => fragment?.marketplace_ref);
  return marketplacePresence.length || hasMarketplaceFragments ? { ...profile, marketplacePresence } : profile;
}

function getToolsResponse(sourceStore, multipassId) {
  if (typeof sourceStore.getTools === 'function') {
    return sourceStore.getTools(multipassId);
  }
  return summarizeToolsResponse(multipassId, sourceStore.getPublicFragments?.(multipassId) ?? []);
}

function resolveSavedProfile(savedRecords, identifier) {
  const profile = savedRecords?.resolveProfile?.(identifier);
  if (!profile) throw new ApiNotFoundError(`Multipass not found: ${identifier}`);
  return profile;
}

function getSourceOwnerWallet(savedRecords, multipassId) {
  const snapshot = savedRecords.getSourceContext?.(multipassId)?.sourceSnapshot ?? {};
  return normalizeWalletOrNull(snapshot.owner ?? snapshot.ownerAddress);
}

function mapAdminClaimError(error) {
  const message = error.message ?? 'Claim approval failed.';
  if (/not found/i.test(message)) return new ApiNotFoundError(message);
  return new ApiInputError('invalid_request', message);
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiInputError('invalid_json', 'Request body must be valid JSON.');
  }
}

class ApiInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiInputError';
    this.code = code;
  }
}

class ApiUnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiUnauthorizedError';
  }
}

class ApiForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiForbiddenError';
  }
}

class ApiNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiNotFoundError';
  }
}

function appendToMapList(map, key, value) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function jsonOrNotFound(value, message) {
  if (!value) {
    return errorResponse(404, 'not_found', message);
  }
  return jsonResponse(value);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function errorResponse(status, code, message, details) {
  return jsonResponse({
    schema_version: '0.1.0',
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  }, status);
}

function createDiscoveryDocument(baseUrl) {
  return {
    schema_version: '0.1.0',
    service: 'helixa-multipass',
    name: 'Helixa Multipass',
    description: 'Helixa Multipass publishes a public agent profile language for discovering agent metadata, x401 proof context, x402 payment routes, and public change history without granting execution authority.',
    purpose: 'Give humans and agents a stable public agent profile entry point before they inspect trust context such as CRED, proofs, x401 manifests, x402 manifests, receipts, routes, or changes.',
    primary_phrase: 'public agent profile',
    routes: {
      discovery: `${baseUrl}/.well-known/multipass.json`,
      helixa_discovery: `${baseUrl}/.well-known/helixa-multipass.json`,
      profile: `${baseUrl}/api/multipass/{id}`,
      versioned_profile: `${baseUrl}/api/v0/multipass/{id}`,
      card: `${baseUrl}/api/multipass/{id}/card`,
      agent_card: `${baseUrl}/api/multipass/{id}/agent-card`,
      fragments: `${baseUrl}/api/multipass/{id}/fragments`,
      tools: `${baseUrl}/api/multipass/{id}/tools`,
      hydrated: `${baseUrl}/api/multipass/{id}/hydrated`,
      standards: `${baseUrl}/api/multipass/{id}/standards`,
      x401: `${baseUrl}/api/multipass/{id}/x401`,
      x402: `${baseUrl}/api/multipass/{id}/x402`,
      receipts: `${baseUrl}/api/multipass/{id}/receipts`,
      receipt: `${baseUrl}/api/multipass/{id}/receipts/{receipt_id}`,
      changes: `${baseUrl}/api/multipass/{id}/changes`,
      share: `${baseUrl}/multipass/share/{id}`,
      share_image: `${baseUrl}/multipass/share/{id}.jpg`,
      api_share: `${baseUrl}/api/multipass/{id}/share`,
      api_share_image: `${baseUrl}/api/multipass/{id}/share.jpg`,
      resolve: `${baseUrl}/api/resolve?agent={input}`,
      canonical_resolve: `${baseUrl}/api/multipass/resolve?source={source}`,
      search: `${baseUrl}/api/search?q={query}`,
      openapi: `${baseUrl}/api/openapi.json`,
    },
    supported_source_ids: [
      'helixa-agentdna:8453:{tokenId}',
      '8453:{tokenId}',
      '{tokenId}',
      'erc8004:8453:{tokenId}',
      'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:{tokenId}',
    ],
    start_here: {
      resolve: `${baseUrl}/api/resolve?agent={input}`,
      profile: `${baseUrl}/api/multipass/{id}`,
      hydrated: `${baseUrl}/api/multipass/{id}/hydrated`,
      agent_card: `${baseUrl}/api/multipass/{id}/agent-card`,
    },
    example_profile: {
      id: 'bendr-2-1',
      profile: `${baseUrl}/api/multipass/bendr-2-1`,
      agent_card: `${baseUrl}/api/multipass/bendr-2-1/agent-card`,
      hydrated: `${baseUrl}/api/multipass/bendr-2-1/hydrated`,
    },
    agent_instructions: [
      'Start with resolve when you have user input, a slug, or an external agent identifier; it returns the best public Multipass profile candidate or activation preview.',
      'Use agent-card for a compact machine-readable profile summary suitable for agent routing, capability display, and service endpoint inspection.',
      'Use hydrated when you need the profile plus public companion resources, including fragments, tools, standards, x401 identity proof metadata, x402 payment metadata, receipts, routes, and changes.',
    ],
    boundaries: [
      'Viewing a Multipass public agent profile does not execute tools or call agent services.',
      'Viewing or resolving a profile does not transfer custody or ownership.',
      'Public metadata does not expose private credentials or grant approvals.',
      'x401 proof metadata describes identity or authority requirements; it does not expose private credentials.',
      'Payments, receipts, and CRED are trust context; trust is not bought by payment.',
    ],
  };
}

function createOpenApiDocument(baseUrl) {
  const profileResponse = {
    description: 'Public Multipass profile response.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/MultipassProfile' },
      },
    },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Helixa Multipass API',
      version: '0.1.0',
      description: 'Public Multipass API for public agent profiles. CRED, x401 proof metadata, x402 payment metadata, receipts, routes, and changes provide trust context; payments and receipts do not buy trust.',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/.well-known/helixa-multipass.json': { get: { summary: 'Legacy Helixa Multipass discovery route alias', responses: { 200: { description: 'Discovery document' } } } },
      '/.well-known/multipass.json': { get: { summary: 'Discover Multipass public routes', responses: { 200: { description: 'Discovery document' } } } },
      '/api/openapi.json': { get: { summary: 'OpenAPI description for public Multipass routes', responses: { 200: { description: 'OpenAPI document' } } } },
      '/api/multipass/{id}': { get: { summary: 'Fetch a public Multipass profile by id or slug', parameters: [pathParameter('id')], responses: { 200: profileResponse } } },
      '/api/v0/multipass/{id}': { get: { summary: 'Versioned alias for fetching a public Multipass profile', parameters: [pathParameter('id')], responses: { 200: profileResponse } } },
      '/api/multipass/{id}/fragments': { get: { summary: 'Fetch public fragments only', parameters: [pathParameter('id')], responses: { 200: { description: 'Public fragment collection' } } } },
      '/api/multipass/{id}/tools': { get: { summary: 'Fetch public tool and service cards', parameters: [pathParameter('id')], responses: { 200: { description: 'Public tool and service card collection' } } } },
      '/api/multipass/{id}/hydrated': { get: { summary: 'Fetch a hydrated saved profile with public companion resources', parameters: [pathParameter('id')], responses: { 200: { description: 'Hydrated profile response' } } } },
      '/api/multipass/{id}/card': { get: { summary: 'Compatibility alias for fetching the agent-readable card', parameters: [pathParameter('id')], responses: { 200: { description: 'Agent card' } } } },
      '/api/multipass/{id}/agent-card': { get: { summary: 'Fetch agent-readable card', description: 'Fetch the compact, machine-readable public agent profile card for routing and display.', parameters: [pathParameter('id')], responses: { 200: { description: 'Agent card' } } } },
      '/api/multipass/{id}/standards': { get: { summary: 'Fetch standards compatibility profile', parameters: [pathParameter('id')], responses: { 200: { description: 'Standards profile' } } } },
      '/api/multipass/{id}/x401': { get: { summary: 'Fetch public x401 identity proof manifest', parameters: [pathParameter('id')], responses: { 200: { description: 'x401 manifest' } } } },
      '/api/multipass/{id}/x402': { get: { summary: 'Fetch public x402 manifest', parameters: [pathParameter('id')], responses: { 200: { description: 'x402 manifest' } } } },
      '/api/multipass/{id}/receipts': { get: { summary: 'Fetch public receipt fragments', parameters: [pathParameter('id')], responses: { 200: { description: 'Receipt fragment collection' } } } },
      '/api/multipass/{id}/receipts/{receipt_id}': { get: { summary: 'Fetch one public receipt fragment', parameters: [pathParameter('id'), pathParameter('receipt_id')], responses: { 200: { description: 'Receipt fragment' } } } },
      '/api/multipass/{id}/changes': { get: { summary: 'Fetch public change history for saved records when available', parameters: [pathParameter('id')], responses: { 200: { description: 'Public change log' } } } },
      '/multipass/share/{id}': { get: { summary: 'Render crawler-friendly dynamic share metadata for a saved Multipass profile', parameters: [pathParameter('id')], responses: { 200: { description: 'HTML page with Open Graph and Twitter metadata for crawlers' } } } },
      '/multipass/share/{id}.jpg': { get: { summary: 'Render a dynamic JPEG preview image for a saved Multipass profile', parameters: [pathParameter('id')], responses: { 200: { description: 'JPEG preview image' } } } },
      '/api/multipass/{id}/share': { get: { summary: 'API alias for crawler-friendly dynamic share metadata', parameters: [pathParameter('id')], responses: { 200: { description: 'HTML page with Open Graph and Twitter metadata for crawlers' } } } },
      '/api/multipass/{id}/share.jpg': { get: { summary: 'API alias for a dynamic JPEG preview image', parameters: [pathParameter('id')], responses: { 200: { description: 'JPEG preview image' } } } },
      '/api/resolve': { get: { summary: 'Resolve an input to a saved profile or live activation preview', parameters: [queryParameter('agent')], responses: { 200: { description: 'Resolution result' } } } },
      '/api/multipass/resolve': { get: { summary: 'Resolve a Helixa AgentDNA or Base ERC-8004 source identity to a hydrated profile or activation preview', parameters: [queryParameter('source', 'Source identity. Supports Helixa AgentDNA forms like {tokenId}, 8453:{tokenId}, helixa-agentdna:8453:{tokenId}, and Base ERC-8004 forms like erc8004:8453:{tokenId} or eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:{tokenId}.')], responses: { 200: { description: 'Canonical source resolution result' } } } },
      '/api/search': { get: { summary: 'Conservative exact or prefix search over public profile summaries', parameters: [queryParameter('q')], responses: { 200: { description: 'Search matches' } } } },
    },
    components: {
      schemas: {
        MultipassProfile: { type: 'object', description: 'Public Multipass profile document.' },
      },
    },
  };
}

function pathParameter(name) {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

function queryParameter(name, description) {
  return {
    name,
    in: 'query',
    required: true,
    schema: { type: 'string' },
    ...(description ? { description } : {}),
  };
}

function createProfileRoutes(baseUrl, identifier) {
  const encoded = encodeURIComponent(identifier);
  return {
    profile: `${baseUrl}/api/multipass/${encoded}`,
    versioned_profile: `${baseUrl}/api/v0/multipass/${encoded}`,
    card: `${baseUrl}/api/multipass/${encoded}/card`,
    agent_card: `${baseUrl}/api/multipass/${encoded}/agent-card`,
    fragments: `${baseUrl}/api/multipass/${encoded}/fragments`,
    tools: `${baseUrl}/api/multipass/${encoded}/tools`,
    hydrated: `${baseUrl}/api/multipass/${encoded}/hydrated`,
    standards: `${baseUrl}/api/multipass/${encoded}/standards`,
    x401: `${baseUrl}/api/multipass/${encoded}/x401`,
    x402: `${baseUrl}/api/multipass/${encoded}/x402`,
    receipts: `${baseUrl}/api/multipass/${encoded}/receipts`,
    changes: `${baseUrl}/api/multipass/${encoded}/changes`,
  };
}

function decorateAgentCardForDiscovery(card, profile, baseUrl) {
  if (!card || !profile) return card;

  const displayName = profile.display_name ?? profile.name ?? profile.source ?? profile.slug ?? profile.multipass_id ?? 'This agent';
  const routeIdentifier = profile.slug ?? profile.multipass_id;
  const routes = createProfileRoutes(baseUrl, routeIdentifier);
  const requiredLinks = [
    { rel: 'profile', href: routes.profile },
    { rel: 'hydrated', href: routes.hydrated },
    { rel: 'tools', href: routes.tools },
    { rel: 'x401', href: routes.x401 },
    { rel: 'x402', href: routes.x402 },
    { rel: 'receipts', href: routes.receipts },
    { rel: 'changes', href: routes.changes },
  ];
  const links = Array.isArray(card.links) ? [...card.links] : [];
  const existingRels = new Set(links.map((link) => link?.rel).filter((rel) => typeof rel === 'string'));

  for (const link of requiredLinks) {
    if (existingRels.has(link.rel)) continue;
    existingRels.add(link.rel);
    links.push(link);
  }

  return {
    ...card,
    summary: card.summary ?? `${displayName} public agent profile. Includes public identity, x401 proof, tool, x402 payment, receipt, and change context when available.`,
    services: Array.isArray(card.services) ? card.services : [],
    x401_manifest_url: card.x401_manifest_url ?? routes.x401,
    links,
    boundaries: Array.isArray(card.boundaries)
      ? card.boundaries
      : ['Public agent-card metadata does not execute tools, transfer custody, expose private credentials, or grant approvals.'],
  };
}

function createProfileSearchResult(profile, kind, baseUrl) {
  return {
    kind,
    multipass_id: profile.multipass_id,
    slug: profile.slug,
    display_name: profile.display_name,
    subject_type: profile.subject_type,
    summary: profile.discovery_profile?.summary ?? null,
    tags: profile.discovery_profile?.tags ?? [],
    owner_state: profile.owner_summary?.owner_state ?? null,
    verification_status: profile.owner_summary?.verification_status ?? null,
    trust_state: profile.cred_summary?.trust_state ?? null,
    profile_url: `${baseUrl}/api/multipass/${encodeURIComponent(profile.slug)}`,
  };
}

function searchProfileList(profiles, query, options = {}) {
  const needle = query.toLowerCase();
  const limit = options.limit ?? 10;
  return profiles
    .filter((profile) => {
      const fields = [profile.slug, profile.multipass_id, profile.display_name, ...(profile.discovery_profile?.tags ?? [])]
        .map((field) => String(field ?? '').toLowerCase());
      return fields.some((field) => field === needle || field.startsWith(needle));
    })
    .slice(0, limit);
}

function assertTrustedOrigin(request, context) {
  const origin = request.headers.get('origin') || originFromReferer(request.headers.get('referer'));
  if (!origin) return;
  if (!context.allowedOrigins.has(origin)) {
    throw new ApiForbiddenError('Request origin is not allowed for Multipass manager writes.');
  }
}

function domainFromRequest(request) {
  const origin = request.headers.get('origin');
  if (origin) return new URL(origin).host;
  return new URL(request.url).host;
}

function originFromReferer(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function normalizeAllowedOrigins(allowedOrigins, baseUrl) {
  const origins = allowedOrigins?.length ? allowedOrigins : [new URL(baseUrl).origin];
  return new Set(origins.map((origin) => new URL(origin).origin));
}

function inferSecureCookie(allowedOrigins, baseUrl) {
  const origins = allowedOrigins?.length ? allowedOrigins : [baseUrl];
  return origins.some((origin) => new URL(origin).protocol === 'https:');
}

function buildSessionCookie(sessionId, context) {
  return [
    `${context.cookieName}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    context.cookieSecure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function clearSessionCookie(context) {
  return [
    `${context.cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    context.cookieSecure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function normalizeWallet(value, field) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new ApiInputError('invalid_request', `${field} must be an EVM wallet address.`);
  return wallet;
}

function normalizeWalletOrNull(value) {
  const wallet = String(value ?? '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
}


function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

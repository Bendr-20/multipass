import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import { verifyEthereumPersonalSignature } from './signature-verifier.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};
const MANAGER_COOKIE_NAME = 'multipass_manager';

export function createMemoryStore(input = {}) {
  const {
    profiles: profileInput = [],
    fragments: fragmentInput = [],
    agentCards: agentCardInput = [],
    standardsProfiles: standardsProfileInput = [],
    x402Manifests: x402ManifestInput = [],
    receiptFragments: receiptFragmentInput = [],
  } = input;

  const profiles = profileInput.map(assertMultipassProfile);
  const fragments = fragmentInput.map(assertIdentityFragment);
  const agentCards = agentCardInput.map(assertAgentCard);
  const standardsProfiles = standardsProfileInput.map(assertStandardsProfile);
  const x402Manifests = x402ManifestInput.map(assertX402Manifest);
  const receiptFragments = receiptFragmentInput.map(assertReceiptFragment);

  const profilesById = new Map();
  const profilesBySlug = new Map();
  const fragmentsByProfile = new Map();
  const agentCardsByProfile = new Map();
  const standardsByProfile = new Map();
  const x402ByProfile = new Map();
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

    getAgentCard(multipassId) {
      return agentCardsByProfile.get(multipassId) ?? null;
    },

    getStandardsProfile(multipassId) {
      return standardsByProfile.get(multipassId) ?? null;
    },

    getX402Manifest(multipassId) {
      return x402ByProfile.get(multipassId) ?? null;
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

        if (parts[0] === 'api' && parts[1] === 'resolve') {
          return await handleResolve(url, context);
        }

        if (parts[0] === 'api' && parts[1] === 'search') {
          return handleSearch(url, context);
        }

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

  if (parts[2] === 'activate' && parts.length === 3) {
    if (!context.activationService) {
      return errorResponse(503, 'not_configured', 'Multipass activation is not configured.');
    }
    return handleActivatePreview(request, context.activationService);
  }

  if (parts.length === 2) {
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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

function handleClaimNonce(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
  }
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  return jsonResponse(context.savedRecords.createClaimNonce(profile.multipass_id, {
    domain: domainFromRequest(request),
  }));
}

async function handleClaimVerify(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
  }
  const { profile, session } = requireManagerSession(request, identifier, context);
  try {
    const revoked = context.savedRecords.revokePublicFragment(profile.multipass_id, fragmentId, { actorWallet: session.manager_wallet });
    return jsonResponse({ schema_version: '0.1.0', ...revoked });
  } catch (error) {
    throw mapFragmentMutationError(error);
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
  if (/read-only|not editable|imported/i.test(message)) return new ApiForbiddenError(message);
  return new ApiInputError('invalid_request', message);
}

function handleSessionLogout(request, identifier, context) {
  if (!context.savedRecords) {
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
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

async function handleResolve(url, context) {
  const agent = String(url.searchParams.get('agent') ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to resolve.');

  const existing = resolvePublicProfile(agent, context);
  if (existing) {
    return jsonResponse({
      schema_version: '0.1.0',
      state: 'saved_record',
      profile: existing.profile,
      source: existing.sourceStore.getSourceContext?.(existing.profile.multipass_id)?.activation ?? null,
      routes: createProfileRoutes(context.normalizedBaseUrl, existing.profile.slug),
    });
  }

  if (!context.activationService) {
    return errorResponse(404, 'not_found', `Multipass not found: ${agent}`);
  }

  try {
    const record = await context.activationService(agent);
    return jsonResponse({
      schema_version: '0.1.0',
      state: 'activated_unsaved',
      profile: record.profile,
      source: record.source,
      save_url: `${context.normalizedBaseUrl}/api/multipass`,
    });
  } catch (error) {
    return errorResponse(404, 'not_found', `Multipass not found: ${agent}`);
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

function handlePublicRead(parts, { store, savedRecords }) {
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
    return jsonResponse(profile);
  }

  if (readParts.resource === 'fragments' && !readParts.resourceId) {
    return jsonResponse({
      schema_version: profile.schema_version,
      multipass_id: profile.multipass_id,
      fragments: sourceStore.getPublicFragments(profile.multipass_id),
    });
  }

  if ((readParts.resource === 'agent-card' || readParts.resource === 'card') && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getAgentCard(profile.multipass_id), 'Agent card not found.');
  }

  if (readParts.resource === 'standards' && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getStandardsProfile(profile.multipass_id), 'Standards profile not found.');
  }

  if (readParts.resource === 'x402' && !readParts.resourceId) {
    return jsonOrNotFound(sourceStore.getX402Manifest(profile.multipass_id), 'x402 manifest not found.');
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

function resolvePublicProfile(identifier, { store, savedRecords }) {
  const savedProfile = savedRecords?.resolveProfile?.(identifier);
  if (savedProfile) return { profile: savedProfile, sourceStore: savedRecords };
  const profile = store.resolveProfile(identifier);
  return profile ? { profile, sourceStore: store } : null;
}

function resolveSavedProfile(savedRecords, identifier) {
  const profile = savedRecords?.resolveProfile?.(identifier);
  if (!profile) throw new ApiNotFoundError(`Saved Multipass not found: ${identifier}`);
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

function errorResponse(status, code, message) {
  return jsonResponse({
    schema_version: '0.1.0',
    error: {
      code,
      message,
    },
  }, status);
}

function createDiscoveryDocument(baseUrl) {
  return {
    schema_version: '0.1.0',
    service: 'helixa-multipass',
    routes: {
      profile: `${baseUrl}/api/multipass/{id}`,
      versioned_profile: `${baseUrl}/api/v0/multipass/{id}`,
      agent_card: `${baseUrl}/api/multipass/{id}/agent-card`,
      fragments: `${baseUrl}/api/multipass/{id}/fragments`,
      standards: `${baseUrl}/api/multipass/{id}/standards`,
      x402: `${baseUrl}/api/multipass/{id}/x402`,
      receipts: `${baseUrl}/api/multipass/{id}/receipts`,
      receipt: `${baseUrl}/api/multipass/{id}/receipts/{receipt_id}`,
      resolve: `${baseUrl}/api/resolve?agent={input}`,
      search: `${baseUrl}/api/search?q={query}`,
      openapi: `${baseUrl}/api/openapi.json`,
    },
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
      description: 'Public display-only Multipass identity and trust profile API. Payments and receipts do not buy trust.',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/.well-known/multipass.json': { get: { summary: 'Discover Multipass public routes', responses: { 200: { description: 'Discovery document' } } } },
      '/api/openapi.json': { get: { summary: 'OpenAPI description for public Multipass routes', responses: { 200: { description: 'OpenAPI document' } } } },
      '/api/multipass/{id}': { get: { summary: 'Fetch a public Multipass profile by id or slug', parameters: [pathParameter('id')], responses: { 200: profileResponse } } },
      '/api/v0/multipass/{id}': { get: { summary: 'Versioned alias for fetching a public Multipass profile', parameters: [pathParameter('id')], responses: { 200: profileResponse } } },
      '/api/multipass/{id}/fragments': { get: { summary: 'Fetch public fragments only', parameters: [pathParameter('id')], responses: { 200: { description: 'Public fragment collection' } } } },
      '/api/multipass/{id}/agent-card': { get: { summary: 'Fetch agent-readable card', parameters: [pathParameter('id')], responses: { 200: { description: 'Agent card' } } } },
      '/api/multipass/{id}/standards': { get: { summary: 'Fetch standards compatibility profile', parameters: [pathParameter('id')], responses: { 200: { description: 'Standards profile' } } } },
      '/api/multipass/{id}/x402': { get: { summary: 'Fetch public x402 manifest', parameters: [pathParameter('id')], responses: { 200: { description: 'x402 manifest' } } } },
      '/api/multipass/{id}/receipts': { get: { summary: 'Fetch public receipt fragments', parameters: [pathParameter('id')], responses: { 200: { description: 'Receipt fragment collection' } } } },
      '/api/multipass/{id}/receipts/{receipt_id}': { get: { summary: 'Fetch one public receipt fragment', parameters: [pathParameter('id'), pathParameter('receipt_id')], responses: { 200: { description: 'Receipt fragment' } } } },
      '/api/resolve': { get: { summary: 'Resolve an input to a saved profile or live activation preview', parameters: [queryParameter('agent')], responses: { 200: { description: 'Resolution result' } } } },
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

function queryParameter(name) {
  return { name, in: 'query', required: true, schema: { type: 'string' } };
}

function createProfileRoutes(baseUrl, identifier) {
  const encoded = encodeURIComponent(identifier);
  return {
    profile: `${baseUrl}/api/multipass/${encoded}`,
    versioned_profile: `${baseUrl}/api/v0/multipass/${encoded}`,
    agent_card: `${baseUrl}/api/multipass/${encoded}/agent-card`,
    fragments: `${baseUrl}/api/multipass/${encoded}/fragments`,
    standards: `${baseUrl}/api/multipass/${encoded}/standards`,
    x402: `${baseUrl}/api/multipass/${encoded}/x402`,
    receipts: `${baseUrl}/api/multipass/${encoded}/receipts`,
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

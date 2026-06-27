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

    getReceiptFragment(multipassId, receiptId) {
      return (receiptsByProfile.get(multipassId) ?? []).find((receipt) => receipt.receipt_id === receiptId) ?? null;
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

        if (url.pathname === '/.well-known/helixa-multipass.json') {
          return jsonResponse(createDiscoveryDocument(normalizedBaseUrl));
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
  if (parts[0] !== 'api' || parts[1] !== 'multipass' || !parts[2] || parts[3] !== 'profile' || parts.length !== 4) {
    return errorResponse(404, 'not_found', 'Route not found.');
  }
  return handlePatchProfile(request, parts[2], context);
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
  assertTrustedOrigin(request, context);
  const profile = resolveSavedProfile(context.savedRecords, identifier);
  const sessionId = parseCookies(request.headers.get('cookie')).get(context.cookieName);
  if (!sessionId) throw new ApiUnauthorizedError('Manager session cookie is required.');

  let session;
  try {
    session = context.savedRecords.validateManagerSession({
      sessionId,
      multipassId: profile.multipass_id,
      csrfToken: request.headers.get('x-csrf-token') ?? '',
    });
  } catch (error) {
    throw new ApiForbiddenError(error.message);
  }

  const body = await readJsonBody(request);
  const updated = context.savedRecords.updatePublicProfile(profile.multipass_id, body, {
    actorWallet: session.manager_wallet,
  });
  return jsonResponse({
    schema_version: '0.1.0',
    changedFields: updated.changedFields,
    profile: updated.profile,
  });
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

function handlePublicRead(parts, { store, savedRecords }) {
  if (parts[0] !== 'api' || parts[1] !== 'multipass' || !parts[2]) {
    return errorResponse(404, 'not_found', 'Route not found.');
  }

  const resolved = resolvePublicProfile(parts[2], { store, savedRecords });
  if (!resolved) {
    return errorResponse(404, 'not_found', `Multipass not found: ${parts[2]}`);
  }

  const { profile, sourceStore } = resolved;

  if (parts.length === 3) {
    return jsonResponse(profile);
  }

  if (parts[3] === 'fragments' && parts.length === 4) {
    return jsonResponse({
      schema_version: profile.schema_version,
      multipass_id: profile.multipass_id,
      fragments: sourceStore.getPublicFragments(profile.multipass_id),
    });
  }

  if ((parts[3] === 'agent-card' || parts[3] === 'card') && parts.length === 4) {
    return jsonOrNotFound(sourceStore.getAgentCard(profile.multipass_id), 'Agent card not found.');
  }

  if (parts[3] === 'standards' && parts.length === 4) {
    return jsonOrNotFound(sourceStore.getStandardsProfile(profile.multipass_id), 'Standards profile not found.');
  }

  if (parts[3] === 'x402' && parts.length === 4) {
    return jsonOrNotFound(sourceStore.getX402Manifest(profile.multipass_id), 'x402 manifest not found.');
  }

  if (parts[3] === 'receipts' && parts[4] && parts.length === 5) {
    return jsonOrNotFound(
      sourceStore.getReceiptFragment(profile.multipass_id, parts[4]),
      `Receipt not found: ${parts[4]}`,
    );
  }

  if (parts[3] === 'changes' && parts.length === 4 && typeof sourceStore.getChangeLog === 'function') {
    return jsonResponse(sourceStore.getChangeLog(profile.multipass_id));
  }

  return errorResponse(404, 'not_found', 'Route not found.');
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
      agent_card: `${baseUrl}/api/multipass/{id}/agent-card`,
      fragments: `${baseUrl}/api/multipass/{id}/fragments`,
      standards: `${baseUrl}/api/multipass/{id}/standards`,
      x402: `${baseUrl}/api/multipass/{id}/x402`,
      receipt: `${baseUrl}/api/multipass/{id}/receipts/{receipt_id}`,
    },
  };
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

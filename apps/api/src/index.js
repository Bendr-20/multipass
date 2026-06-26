import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

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

export function createMultipassApi({ store, baseUrl, savedRecords, activationService } = {}) {
  if (!store) {
    throw new TypeError('createMultipassApi requires a store');
  }

  const normalizedBaseUrl = stripTrailingSlash(baseUrl ?? 'http://localhost');

  return {
    async handleRequest(request) {
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

        if (request.method === 'POST') {
          return await handlePostRequest(request, parts, { savedRecords, activationService });
        }

        if (request.method !== 'GET') {
          return errorResponse(405, 'method_not_allowed', 'Only GET and selected POST routes are supported by the Multipass API boundary.');
        }

        if (url.pathname === '/.well-known/helixa-multipass.json') {
          return jsonResponse(createDiscoveryDocument(normalizedBaseUrl));
        }

        return handlePublicRead(parts, { store, savedRecords });
      } catch (error) {
        if (error instanceof ApiInputError) {
          return errorResponse(400, error.code, error.message);
        }
        throw error;
      }
    },
  };
}

async function handlePostRequest(request, parts, { savedRecords, activationService }) {
  if (parts[0] !== 'api' || parts[1] !== 'multipass') {
    return errorResponse(404, 'not_found', 'Route not found.');
  }

  if (!activationService) {
    return errorResponse(503, 'not_configured', 'Multipass activation is not configured.');
  }

  if (parts[2] === 'activate' && parts.length === 3) {
    return handleActivatePreview(request, activationService);
  }

  if (parts.length === 2) {
    return handleSaveMultipass(request, { savedRecords, activationService });
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
    profile: saved.profile,
    sharePath: `/multipass/${encodeURIComponent(saved.profile.slug)}`,
  }, saved.created ? 201 : 200);
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
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

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

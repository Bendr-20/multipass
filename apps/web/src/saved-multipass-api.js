export class SavedMultipassError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SavedMultipassError';
    this.details = details;
  }
}

export async function saveActivatedMultipass({ agent, apiBase, fetchImpl = fetch } = {}) {
  const trimmed = String(agent ?? '').trim();
  if (!trimmed) throw new SavedMultipassError('Activate a live record before saving.');
  return requestSavedJson({
    apiBase,
    path: '/api/multipass',
    method: 'POST',
    body: { agent: trimmed },
    fetchImpl,
    errorPrefix: 'Save failed',
  });
}

export async function createClaimNonce({ id, apiBase, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/claim/nonce`,
    method: 'POST',
    body: {},
    fetchImpl,
    errorPrefix: 'Claim nonce request failed',
  });
}

export async function verifyClaimSignature({ id, apiBase, wallet, nonce, signature, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/claim/verify`,
    method: 'POST',
    body: {
      mode: 'wallet_signature',
      wallet: String(wallet ?? '').trim(),
      nonce: String(nonce ?? '').trim(),
      signature: String(signature ?? '').trim(),
    },
    fetchImpl,
    errorPrefix: 'Claim verification failed',
  });
}

export async function submitManualReviewClaim({ id, apiBase, proposedManagerWallet, contactRoute, note, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/claim/verify`,
    method: 'POST',
    body: {
      mode: 'manual_review',
      proposedManagerWallet: String(proposedManagerWallet ?? '').trim(),
      contactRoute: String(contactRoute ?? '').trim(),
      note: String(note ?? '').trim(),
    },
    fetchImpl,
    errorPrefix: 'Manual review request failed',
  });
}

export async function updateMultipassProfile({ id, apiBase, csrfToken, patch, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/profile`,
    method: 'PATCH',
    body: patch ?? {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Profile update failed',
  });
}

export async function createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/fragments`,
    method: 'POST',
    body: fragment ?? {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Fragment create failed',
  });
}

export async function updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  const safeFragmentId = requireFragmentIdentifier(fragmentId);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/fragments/${encodeURIComponent(safeFragmentId)}`,
    method: 'PATCH',
    body: patch ?? {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Fragment update failed',
  });
}

export async function revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  const safeFragmentId = requireFragmentIdentifier(fragmentId);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/fragments/${encodeURIComponent(safeFragmentId)}/revoke`,
    method: 'POST',
    body: {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Fragment revoke failed',
  });
}

export async function importMultipassTool({ id, apiBase, csrfToken, tool, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/tools/import`,
    method: 'POST',
    body: tool ?? {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Tool import failed',
  });
}

export async function refreshMultipassTool({ id, fragmentId, apiBase, csrfToken, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  const safeFragmentId = requireFragmentIdentifier(fragmentId);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/tools/${encodeURIComponent(safeFragmentId)}/refresh`,
    method: 'POST',
    body: {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Tool refresh failed',
  });
}

export async function logoutMultipassSession({ id, apiBase, csrfToken, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/session/logout`,
    method: 'POST',
    body: {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Logout failed',
  });
}

async function requestSavedJson({ apiBase, path, method, body, csrfToken, fetchImpl, errorPrefix }) {
  const base = apiBase ?? globalThis.location?.origin ?? '';
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (csrfToken) headers['x-csrf-token'] = String(csrfToken);

  const response = await fetchImpl(joinApiPath(base, path), {
    method,
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(responseBody?.error?.message ?? `${errorPrefix} with ${response.status}`, { status: response.status, body: responseBody });
  }
  return responseBody;
}

function requireMultipassIdentifier(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new SavedMultipassError('Saved Multipass id is required.');
  return id;
}

function requireFragmentIdentifier(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new SavedMultipassError('Fragment id is required.');
  return id;
}

export function joinApiPath(apiBase, path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = String(apiBase || '');
  if (/^https?:\/\//i.test(base)) {
    const parsed = new URL(stripTrailingSlash(base));
    const basePath = stripTrailingSlash(parsed.pathname === '/' ? '' : parsed.pathname);
    parsed.pathname = `${basePath}${cleanPath}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }
  return `${stripTrailingSlash(base)}${cleanPath}`;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

import { SavedMultipassError, joinApiPath } from './saved-multipass-api.js';

export async function authenticateConsoleSession({ apiBase, wallet, signMessage, fetchImpl = fetch } = {}) {
  const normalizedWallet = String(wallet ?? '').trim();
  const challenge = await requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/session/nonce',
    method: 'POST',
    body: { wallet: normalizedWallet },
    fetchImpl,
  });
  if (typeof signMessage !== 'function') throw new SavedMultipassError('Connected wallet cannot sign the Console challenge.');
  const signed = await signMessage(challenge.message);
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/session/verify',
    method: 'POST',
    body: {
      wallet: String(signed?.wallet ?? normalizedWallet).trim(),
      nonce: challenge.nonce,
      signature: String(signed?.signature ?? '').trim(),
    },
    fetchImpl,
  });
}

export async function activateConsoleAgent({ apiBase, tokenId, runtimeName, csrfToken, fetchImpl = fetch } = {}) {
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/activate',
    method: 'POST',
    csrfToken,
    body: {
      tokenId: String(tokenId ?? '').trim(),
      runtimeName: String(runtimeName ?? '').trim(),
    },
    fetchImpl,
  });
}

export async function sendConsoleAgentMessage({
  apiBase,
  message,
  tokenId,
  csrfToken,
  fetchImpl = fetch,
} = {}) {
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/message',
    method: 'POST',
    csrfToken,
    body: {
      tokenId: String(tokenId ?? '').trim(),
      message: String(message ?? '').trim(),
    },
    fetchImpl,
  });
}

async function requestConsoleJson({ apiBase, path, method, body, csrfToken, fetchImpl }) {
  const base = apiBase ?? globalThis.location?.origin ?? '';
  const response = await fetchImpl(joinApiPath(base, path), {
    method,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(csrfToken ? { 'x-csrf-token': String(csrfToken) } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(responseBody?.error?.message ?? `Agent runtime request failed with ${response.status}`, { status: response.status, body: responseBody });
  }
  return responseBody;
}

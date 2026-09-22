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
  walletContext,
  fetchImpl = fetch,
} = {}) {
  const normalizedTokenId = String(tokenId ?? '').trim();
  const normalizedWalletContext = normalizeReadOnlyWalletContext(walletContext, normalizedTokenId);
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/message',
    method: 'POST',
    csrfToken,
    body: {
      tokenId: normalizedTokenId,
      message: String(message ?? '').trim(),
      ...(normalizedWalletContext ? { walletContext: normalizedWalletContext } : {}),
    },
    fetchImpl,
  });
}

function normalizeReadOnlyWalletContext(context, tokenId) {
  if (context === undefined || context === null) return null;
  rejectUnsafeContextValue(context);
  const capabilities = context?.capabilities;
  if (context?.schema_version !== '0.1.0'
    || context?.kind !== 'looper_wallet_read_context'
    || String(context?.scope?.tokenId ?? '') !== tokenId
    || context?.scope?.chainId !== 8453
    || capabilities?.read !== true
    || capabilities?.sign !== false
    || capabilities?.submit !== false
    || capabilities?.approve !== false) {
    throw new SavedMultipassError('Looper wallet context must be owner-scoped and read-only.');
  }
  return JSON.parse(JSON.stringify(context));
}

function rejectUnsafeContextValue(value, path = '') {
  if (typeof value === 'function' || typeof value === 'bigint') {
    throw new SavedMultipassError('Looper wallet context must be read-only JSON.');
  }
  if (!value || typeof value !== 'object') return;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
    throw new SavedMultipassError('Looper wallet context must be read-only JSON.');
  }
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (/(?:calldata|transaction|prepared|provider|callback|credential|api.?key|store.?key)/i.test(nextPath)) {
      throw new SavedMultipassError('Looper wallet context contains private or executable data.');
    }
    rejectUnsafeContextValue(entry, nextPath);
  }
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

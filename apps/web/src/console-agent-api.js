import { SavedMultipassError, joinApiPath } from './saved-multipass-api.js';

export async function requestConsoleSessionChallenge({ apiBase, wallet, fetchImpl = fetch } = {}) {
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/session/nonce',
    method: 'POST',
    body: { wallet: String(wallet ?? '').trim() },
    fetchImpl,
  });
}

export async function authenticateConsoleSession({ apiBase, wallet, challenge, signMessage, fetchImpl = fetch, onStage = () => {} } = {}) {
  const normalizedWallet = String(wallet ?? '').trim();
  let activeChallenge = challenge;
  if (!activeChallenge) {
    onStage('nonce');
    activeChallenge = await requestConsoleSessionChallenge({ apiBase, wallet: normalizedWallet, fetchImpl });
  }
  if (typeof activeChallenge?.message !== 'string' || typeof activeChallenge?.nonce !== 'string') {
    throw new SavedMultipassError('Console authentication challenge is invalid.');
  }
  if (typeof signMessage !== 'function') throw new SavedMultipassError('Connected wallet cannot sign the Console challenge.');
  onStage('signature');
  const signed = await signMessage(activeChallenge.message);
  onStage('session');
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/session/verify',
    method: 'POST',
    body: {
      wallet: String(signed?.wallet ?? normalizedWallet).trim(),
      nonce: activeChallenge.nonce,
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

export async function updateConsoleAgentName({ apiBase, tokenId, name, csrfToken, fetchImpl = fetch } = {}) {
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/name',
    method: 'POST',
    csrfToken,
    body: {
      tokenId: String(tokenId ?? '').trim(),
      name: name === null ? null : String(name ?? '').trim(),
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
  attachment,
  clientMessageId,
  fetchImpl = fetch,
} = {}) {
  const normalizedTokenId = String(tokenId ?? '').trim();
  if (attachment && !/^[A-Za-z0-9_-]{8,128}$/u.test(String(clientMessageId ?? '').trim())) {
    throw new SavedMultipassError('Image turns require a stable client message id.');
  }
  const normalizedWalletContext = normalizeReadOnlyWalletContext(walletContext, normalizedTokenId);
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/message',
    method: 'POST',
    csrfToken,
    body: {
      tokenId: normalizedTokenId,
      message: String(message ?? '').trim(),
      ...(clientMessageId ? { clientMessageId: String(clientMessageId) } : {}),
      ...(attachment ? { attachment: normalizeImageAttachment(attachment) } : {}),
      ...(normalizedWalletContext ? { walletContext: normalizedWalletContext } : {}),
    },
    fetchImpl,
  });
}

function normalizeImageAttachment(value) {
  if (value?.kind !== 'image'
    || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(value.mimeType)
    || typeof value.base64 !== 'string'
    || !value.base64) {
    throw new SavedMultipassError('Prepared image attachment is invalid.');
  }
  return {
    kind: 'image',
    mimeType: value.mimeType,
    filename: String(value.filename ?? 'image'),
    base64: value.base64,
    width: value.width ?? null,
    height: value.height ?? null,
  };
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

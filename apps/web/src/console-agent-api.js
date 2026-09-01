import { SavedMultipassError, joinApiPath } from './saved-multipass-api.js';

export async function sendConsoleAgentMessage({
  apiBase,
  wallet,
  message,
  agentId = 'agent-manager',
  tokenId = null,
  agentName = null,
  participants = [],
  roomName = null,
  fetchImpl = fetch,
} = {}) {
  return requestConsoleJson({
    apiBase,
    path: '/api/multipass/console/agent/message',
    method: 'POST',
    body: {
      wallet: String(wallet ?? '').trim(),
      agentId: String(agentId ?? 'agent-manager').trim() || 'agent-manager',
      tokenId: String(tokenId ?? agentId ?? 'agent-manager').trim() || 'agent-manager',
      agentName: String(agentName ?? '').trim() || null,
      participants: Array.isArray(participants) ? participants : [],
      roomName: String(roomName ?? '').trim() || null,
      message: String(message ?? '').trim(),
    },
    fetchImpl,
  });
}

async function requestConsoleJson({ apiBase, path, method, body, fetchImpl }) {
  const base = apiBase ?? globalThis.location?.origin ?? '';
  const response = await fetchImpl(joinApiPath(base, path), {
    method,
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(responseBody?.error?.message ?? `Agent runtime request failed with ${response.status}`, { status: response.status, body: responseBody });
  }
  return responseBody;
}

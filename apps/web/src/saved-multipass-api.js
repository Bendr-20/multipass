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
  const base = apiBase ?? globalThis.location?.origin ?? '';

  const response = await fetchImpl(joinApiPath(base, '/api/multipass'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ agent: trimmed }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(body?.error?.message ?? `Save failed with ${response.status}`, { status: response.status, body });
  }
  return body;
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

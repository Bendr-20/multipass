const PANTHEON_BASE_REGISTRY_URL = 'https://launch.pantheonvaults.com/api/skill/registry?chain=base';
const MAX_REGISTRY_BYTES = 131_072;

export async function loadPantheonCredRegistry({ fetchImpl = globalThis.fetch, signal, timeoutMs = 5_000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Pantheon registry fetch is unavailable.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError('Pantheon registry timeout is invalid.');
  const deadline = AbortSignal.timeout(timeoutMs);
  const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let response;
  try {
    response = await fetchImpl(PANTHEON_BASE_REGISTRY_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: boundedSignal,
    });
  } catch {
    throw new Error('Pantheon registry is unavailable.');
  }
  if (!response?.ok) throw new Error('Pantheon registry is unavailable.');
  const contentType = String(response.headers?.get?.('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new Error('Pantheon registry did not return JSON.');
  const declaredLength = Number.parseInt(response.headers?.get?.('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REGISTRY_BYTES) {
    throw new Error('Pantheon registry response is too large.');
  }
  const bytes = await readBoundedBody(response, boundedSignal);
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Pantheon registry returned malformed JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Pantheon registry returned malformed JSON.');
  }
  return value;
}
async function readBoundedBody(response, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('Pantheon registry response body is unavailable.');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new Error('Pantheon registry timed out.');
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Pantheon registry response body is malformed.');
      total += value.byteLength;
      if (total > MAX_REGISTRY_BYTES) {
        await reader.cancel('response too large');
        throw new Error('Pantheon registry response is too large.');
      }
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

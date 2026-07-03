const SUMMARY_LIMIT = 180;
const DEFAULT_TIMEOUT_MS = 5000;
const METHOD_FALLBACK_STATUSES = new Set([405, 501]);

export async function refreshToolFragment(fragment, options = {}) {
  const now = normalizeIsoDate(options.now ?? new Date().toISOString());
  const ref = fragment?.tool_manifest_ref;
  if (!ref || fragment?.fragment_type !== 'tool_manifest') {
    throw new TypeError('tool_manifest fragment is required.');
  }

  const endpointUrl = normalizeHttpsUrl(ref.endpoint_url);
  if (!endpointUrl.ok) {
    return buildRefreshResult(fragment, {
      now,
      status: 'disputed',
      summary: `Unsafe endpoint URL: ${endpointUrl.reason}.`,
    });
  }

  const manifestUrl = ref.manifest_url ? normalizeHttpsUrl(ref.manifest_url) : { ok: true, url: null };
  if (!manifestUrl.ok) {
    return buildRefreshResult(fragment, {
      now,
      status: 'disputed',
      summary: `Unsafe manifest URL: ${manifestUrl.reason}.`,
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const endpointProbe = await probeUrl(endpointUrl.url, { fetchImpl, timeoutMs });
  const endpointReachable = isReachableProbe(endpointProbe, { registry: ref.registry });
  if (!endpointReachable) {
    return buildRefreshResult(fragment, {
      now,
      status: 'stale',
      summary: `Endpoint check failed: ${formatProbeSummary(endpointProbe)}.`,
    });
  }

  if (manifestUrl.url) {
    const manifestProbe = await probeUrl(manifestUrl.url, { fetchImpl, timeoutMs });
    const manifestReachable = isReachableProbe(manifestProbe, { registry: ref.registry, allowGeneric402: false });
    if (!manifestReachable) {
      return buildRefreshResult(fragment, {
        now,
        status: 'stale',
        summary: `Endpoint reachable. Manifest check failed: ${formatProbeSummary(manifestProbe)}.`,
      });
    }

    return buildRefreshResult(fragment, {
      now,
      status: 'verified',
      summary: 'Endpoint reachable. Manifest reachable.',
    });
  }

  return buildRefreshResult(fragment, {
    now,
    status: 'verified',
    summary: 'Endpoint reachable. Manifest not published.',
  });
}

async function probeUrl(url, { fetchImpl, timeoutMs }) {
  const head = await fetchWithTimeout(fetchImpl, url, { method: 'HEAD' }, timeoutMs);
  if (head.kind === 'response' && METHOD_FALLBACK_STATUSES.has(head.status)) {
    return fetchWithTimeout(fetchImpl, url, { method: 'GET' }, timeoutMs);
  }
  return head;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...init, signal: controller?.signal })),
      timeout,
    ]);
    if (response?.kind === 'timeout') return response;
    return {
      kind: 'response',
      status: response.status,
      ok: response.ok,
      contentType: response.headers?.get?.('content-type') ?? null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'error', message: publicErrorMessage(error) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isReachableProbe(probe, { registry, allowGeneric402 = true } = {}) {
  if (probe.kind !== 'response') return false;
  if (probe.status >= 200 && probe.status < 300) return true;
  if (probe.status === 402 && allowGeneric402 && registry === 'bankr_x402_cloud') return true;
  return false;
}

function buildRefreshResult(fragment, { now, status, summary }) {
  const next = structuredClone(fragment);
  next.status = status;
  next.updated_at = now;
  next.source = {
    ...(next.source ?? {}),
    observed_at: now,
  };
  next.tool_manifest_ref = {
    ...(next.tool_manifest_ref ?? {}),
    last_checked_at: now,
  };

  const safeSummary = truncateSummary(summary);
  return {
    fragment: next,
    refresh: {
      fragment_id: next.fragment_id,
      status,
      checked_at: now,
      summary: safeSummary,
    },
  };
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'URL must use HTTPS' };
    }
    return { ok: true, url: url.href };
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
}

function normalizeIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date-time.');
  return date.toISOString();
}

function normalizeTimeout(value) {
  const timeout = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(timeout), 1), 30_000);
}

function formatProbeSummary(probe) {
  if (probe.kind === 'timeout') return 'timed out';
  if (probe.kind === 'error') return probe.message || 'network error';
  if (probe.kind === 'response') return `HTTP ${probe.status}`;
  return 'unknown result';
}

function publicErrorMessage(error) {
  const message = String(error?.message ?? 'network error').replace(/https?:\/\/[^\s)]+/g, '[url]');
  return truncateSummary(message || 'network error');
}

function truncateSummary(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= SUMMARY_LIMIT) return text;
  return `${text.slice(0, SUMMARY_LIMIT - 1)}…`;
}

import { readFile } from 'node:fs/promises';
import { parse as parseLosslessJson } from 'lossless-json';

const API_BASE = 'https://api.opensea.io/api/v2';
const STREAM_BASE = 'wss://stream-api.opensea.io/socket/websocket';
const FLOOR_PATTERN = /^(?:0|[1-9]\d{0,30})(?:\.\d{1,36})?$/;
const MAX_RETRY_AFTER_SECONDS = 300;

function safeError(message, properties = {}) {
  return Object.assign(new Error(message), properties);
}

export async function readOpenSeaApiKey(configPath) {
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    throw safeError('Unable to read OpenSea API key config');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || typeof config.api_key !== 'string' || config.api_key.trim() === '') {
    throw safeError('OpenSea API key config is invalid');
  }
  return config.api_key.trim();
}

export function classifyOpenSeaError(response) {
  const status = Number(response?.status) || 0;
  const fatal = status === 401 || status === 403;
  const retryable = status === 429 || status >= 500;
  let retryAfterMs = null;
  if (status === 429) {
    const raw = response?.headers?.get?.('retry-after');
    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
      const seconds = Number(raw.trim());
      if (Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_RETRY_AFTER_SECONDS) {
        retryAfterMs = seconds * 1_000;
      }
    }
  }
  return { status, fatal, retryable, retryAfterMs };
}

function normalizedRetry(retry = {}) {
  return {
    maxAttempts: Number.isInteger(retry.maxAttempts) && retry.maxAttempts > 0 ? retry.maxAttempts : 4,
    baseDelayMs: Number.isFinite(retry.baseDelayMs) && retry.baseDelayMs >= 0 ? retry.baseDelayMs : 500,
    maxDelayMs: Number.isFinite(retry.maxDelayMs) && retry.maxDelayMs >= 0 ? retry.maxDelayMs : 10_000,
    jitter: typeof retry.jitter === 'function' ? retry.jitter : Math.random,
    sleep: typeof retry.sleep === 'function' ? retry.sleep : ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

function backoffDelay(attempt, retry) {
  const bounded = Math.min(retry.maxDelayMs, retry.baseDelayMs * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.max(0, Math.min(1, Number(retry.jitter()) || 0));
  return Math.min(retry.maxDelayMs, Math.round(bounded * (1 + jitter * 0.25)));
}

async function fetchWithRetry(fetchImpl, url, init, retryOptions, decode = response => response) {
  const retry = normalizedRetry(retryOptions);
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      if (attempt === retry.maxAttempts) {
        throw safeError('OpenSea request failed after retries', { retryable: true });
      }
      await retry.sleep(backoffDelay(attempt, retry));
      continue;
    }

    if (response.ok) {
      try {
        return await decode(response);
      } catch {
        if (attempt === retry.maxAttempts) {
          throw safeError('OpenSea response could not be parsed after retries', { retryable: true });
        }
        await retry.sleep(backoffDelay(attempt, retry));
        continue;
      }
    }
    const classification = classifyOpenSeaError(response);
    if (classification.fatal) {
      throw safeError(`OpenSea authentication failed (${classification.status})`, classification);
    }
    if (!classification.retryable || attempt === retry.maxAttempts) {
      throw safeError(`OpenSea request failed (${classification.status})`, classification);
    }
    await retry.sleep(classification.retryAfterMs ?? backoffDelay(attempt, retry));
  }
  throw safeError('OpenSea request failed');
}

function requestHeaders(apiKey) {
  return { Accept: 'application/json', 'X-API-KEY': apiKey };
}

export async function fetchOpenSeaSalesSnapshot({ fetchImpl = fetch, apiKey, slug, after, before, retry }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const events = [];
  let cursor = null;
  const seenCursors = new Set();

  for (let page = 0; page < 1_000; page += 1) {
    const url = new URL(`${API_BASE}/events/collection/${encodeURIComponent(slug)}`);
    url.searchParams.append('event_type', 'sale');
    url.searchParams.set('after', String(after));
    url.searchParams.set('before', String(before));
    url.searchParams.set('limit', '200');
    if (cursor !== null) url.searchParams.set('next', cursor);

    const body = await fetchWithRetry(fetchImpl, url, {
      method: 'GET', headers: requestHeaders(apiKey),
    }, retry, async response => {
      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.asset_events)) {
        throw new Error('invalid events shape');
      }
      return parsed;
    });
    events.push(...body.asset_events);
    if (body.next === null || body.next === undefined || body.next === '') {
      return { events, upperBound: before };
    }
    if (typeof body.next !== 'string' || seenCursors.has(body.next)) {
      throw safeError('OpenSea events response had an invalid pagination cursor', { retryable: true });
    }
    seenCursors.add(body.next);
    cursor = body.next;
  }
  throw safeError('OpenSea events pagination exceeded its safe bound', { retryable: true });
}

export async function fetchOpenSeaFloor({ fetchImpl = fetch, apiKey, slug, nowSeconds, retry }) {
  const url = new URL(`${API_BASE}/collections/${encodeURIComponent(slug)}/stats`);
  const body = await fetchWithRetry(fetchImpl, url, {
    method: 'GET', headers: requestHeaders(apiKey),
  }, retry, async response => parseLosslessJson(await response.text()));
  const value = body?.total?.floor_price;
  const floorLexeme = value && typeof value === 'object' && typeof value.value === 'string'
    ? value.value
    : null;
  const rawSymbol = body?.total?.floor_price_symbol;
  const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';
  if (!floorLexeme || !FLOOR_PATTERN.test(floorLexeme) || !/[1-9]/.test(floorLexeme)
    || (symbol !== 'ETH' && symbol !== 'WETH')) {
    throw safeError('OpenSea floor response contained an unusable floor');
  }
  return { floorLexeme, symbol, fetchedAt: nowSeconds };
}

function noOp() {}

export function createOpenSeaPhoenixStream({
  apiKey,
  slug,
  WebSocketImpl = WebSocket,
  timers = globalThis,
  logger = {},
  onSale = noOp,
  onReadyChange = noOp,
}) {
  const topic = `collection:${slug}`;
  let socket = null;
  let stopped = false;
  let ready = false;
  let reference = 0;
  let joinReference = null;
  let joinReplyRef = null;
  let joinTimer = null;
  let heartbeatTimer = null;
  let pendingHeartbeatRef = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let connectionGeneration = 0;
  let startPromise = null;
  let resolveStart = null;
  let rejectStart = null;

  const setTimer = (fn, delay) => timers.setTimeout(fn, delay);
  const clearTimer = timer => {
    if (timer !== null && timer !== undefined) timers.clearTimeout(timer);
  };
  const nextRef = () => String(++reference);
  const log = (level, message) => {
    const method = typeof logger[level] === 'function' ? logger[level] : null;
    if (method) method.call(logger, message);
  };
  const setReady = value => {
    if (ready === value) return;
    ready = value;
    try { onReadyChange(value); } catch { log('warn', 'OpenSea Stream readiness callback failed'); }
  };
  const clearConnectionTimers = () => {
    clearTimer(joinTimer);
    clearTimer(heartbeatTimer);
    joinTimer = null;
    heartbeatTimer = null;
    pendingHeartbeatRef = null;
  };
  const settleStartError = message => {
    if (rejectStart) {
      const reject = rejectStart;
      resolveStart = null;
      rejectStart = null;
      reject(safeError(message));
    }
  };
  const settleStartSuccess = () => {
    if (resolveStart) {
      const resolve = resolveStart;
      resolveStart = null;
      rejectStart = null;
      resolve();
    }
  };

  let connect;
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5)));
    reconnectAttempt += 1;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      if (!stopped) connect();
    }, delay);
  };
  const disconnect = (reason, { rejectPendingStart = false } = {}) => {
    if (stopped) return;
    setReady(false);
    clearConnectionTimers();
    if (rejectPendingStart) settleStartError(reason);
    const current = socket;
    socket = null;
    if (current && current.readyState === (WebSocketImpl.OPEN ?? 1)) {
      try { current.close(); } catch { /* close failures are handled by reconnect */ }
    }
    log('warn', reason);
    scheduleReconnect();
  };

  const scheduleHeartbeat = generation => {
    clearTimer(heartbeatTimer);
    heartbeatTimer = setTimer(() => {
      heartbeatTimer = null;
      if (stopped || generation !== connectionGeneration || !ready || !socket) return;
      if (pendingHeartbeatRef !== null) {
        disconnect('OpenSea Stream heartbeat acknowledgement missed');
        return;
      }
      const ref = nextRef();
      pendingHeartbeatRef = ref;
      try {
        socket.send(JSON.stringify([null, ref, 'phoenix', 'heartbeat', {}]));
      } catch {
        disconnect('OpenSea Stream heartbeat send failed');
        return;
      }
      scheduleHeartbeat(generation);
    }, 30_000);
  };

  connect = () => {
    if (stopped) return;
    const generation = ++connectionGeneration;
    const authenticatedUrl = `${STREAM_BASE}?token=${encodeURIComponent(apiKey)}&vsn=2.0.0`;
    let current;
    try {
      current = new WebSocketImpl(authenticatedUrl);
      socket = current;
    } catch {
      settleStartError('OpenSea Stream connection failed');
      scheduleReconnect();
      return;
    }

    const failCurrent = (message, rejectPendingStart = false) => {
      if (generation !== connectionGeneration || stopped) return;
      disconnect(message, { rejectPendingStart });
    };

    current.addEventListener('open', () => {
      if (generation !== connectionGeneration || stopped || current !== socket) return;
      joinReference = nextRef();
      joinReplyRef = nextRef();
      current.send(JSON.stringify([joinReference, joinReplyRef, topic, 'phx_join', {}]));
      joinTimer = setTimer(() => failCurrent('OpenSea Stream join acknowledgement timed out', true), 10_000);
    });

    current.addEventListener('message', event => {
      if (generation !== connectionGeneration || stopped || current !== socket) return;
      let frame;
      try { frame = JSON.parse(event.data); } catch {
        failCurrent('OpenSea Stream sent a malformed frame');
        return;
      }
      if (!Array.isArray(frame) || frame.length !== 5) return;
      const [frameJoinRef, ref, frameTopic, frameEvent, payload] = frame;

      if (frameTopic === 'phoenix' && frameEvent === 'phx_reply' && ref === pendingHeartbeatRef) {
        if (payload?.status === 'ok') {
          pendingHeartbeatRef = null;
          scheduleHeartbeat(generation);
        } else {
          failCurrent('OpenSea Stream heartbeat was rejected');
        }
        return;
      }

      if (frameTopic !== topic || frameJoinRef !== joinReference) return;
      if (frameEvent === 'phx_reply' && ref === joinReplyRef) {
        if (payload?.status === 'ok') {
          clearTimer(joinTimer);
          joinTimer = null;
          reconnectAttempt = 0;
          setReady(true);
          settleStartSuccess();
          scheduleHeartbeat(generation);
        } else if (payload?.status === 'error') {
          failCurrent('OpenSea Stream join was rejected', true);
        }
        return;
      }
      if (ready && frameEvent === 'item_sold') {
        try { onSale(payload); } catch { log('warn', 'OpenSea Stream sale callback failed'); }
      }
    });

    current.addEventListener('error', () => failCurrent('OpenSea Stream socket error', Boolean(rejectStart)));
    current.addEventListener('close', () => failCurrent('OpenSea Stream socket closed', Boolean(rejectStart)));
  };

  return {
    start() {
      if (ready) return Promise.resolve();
      if (startPromise && rejectStart) return startPromise;
      stopped = false;
      startPromise = new Promise((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;
      });
      connect();
      return startPromise;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      ++connectionGeneration;
      setReady(false);
      clearConnectionTimers();
      clearTimer(reconnectTimer);
      reconnectTimer = null;
      settleStartError('OpenSea Stream stopped before becoming ready');
      const current = socket;
      socket = null;
      if (current) {
        try { current.close(); } catch { /* already closed */ }
      }
    },
    isReady() { return ready; },
  };
}

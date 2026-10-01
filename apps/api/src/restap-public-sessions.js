import { createHash, randomBytes } from 'node:crypto';

const NAMESPACE = 'restap:looper:3802';
const DEFAULT_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_SESSIONS = 10_000;
const MAX_TURNS = 12;
const MAX_USER_BYTES = 2_000;
const MAX_ASSISTANT_BYTES = 4_096;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export function createRestapPublicSessionStore({
  now = Date.now,
  randomBytesImpl = randomBytes,
  ttlMs = DEFAULT_TTL_MS,
  maxSessions = DEFAULT_MAX_SESSIONS,
} = {}) {
  if (typeof now !== 'function' || typeof randomBytesImpl !== 'function') {
    throw new TypeError('RESTAP public sessions require clock and RNG functions.');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > DEFAULT_TTL_MS) {
    throw new RangeError('RESTAP public session TTL is invalid.');
  }
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > DEFAULT_MAX_SESSIONS) {
    throw new RangeError('RESTAP public session capacity is invalid.');
  }

  const sessions = new Map();
  let closed = false;

  function create(...args) {
    assertOpen();
    if (args.length !== 0) throw new TypeError('RESTAP public sessions accept no caller namespace or metadata argument.');
    const current = readNow(now);
    sweepExpired(sessions, current);
    while (sessions.size >= maxSessions) evictOldest(sessions);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const entropy = randomBytesImpl(32);
      if (!(entropy instanceof Uint8Array) || entropy.byteLength !== 32) {
        throw new TypeError('RESTAP public session RNG must return exactly 32 bytes.');
      }
      const sessionId = Buffer.from(entropy).toString('base64url');
      const key = hashSessionId(sessionId);
      if (sessions.has(key)) continue;
      sessions.set(key, { namespace: NAMESPACE, expiresAt: current + ttlMs, turns: [] });
      return view(sessionId, []);
    }
    throw new Error('RESTAP public session RNG collision limit exceeded.');
  }

  function resolve(sessionId) {
    assertOpen();
    const current = readNow(now);
    const entry = lookup(sessions, sessionId, current);
    entry.expiresAt = current + ttlMs;
    return view(sessionId, entry.turns);
  }

  function appendTurn(sessionId, turn) {
    assertOpen();
    const current = readNow(now);
    const entry = lookup(sessions, sessionId, current);
    if (entry.turns.length >= MAX_TURNS) throw new RangeError('RESTAP public session is limited to 12 turns.');
    if (!plainObject(turn)) throw new TypeError('RESTAP public turn must be a plain object.');
    const keys = Object.keys(turn);
    if (keys.length !== 2 || !keys.includes('user') || !keys.includes('assistant')) {
      throw new TypeError('RESTAP public turn contains unknown metadata.');
    }
    const normalized = Object.freeze({
      user: boundedText(turn.user, 'user', MAX_USER_BYTES),
      assistant: boundedText(turn.assistant, 'assistant', MAX_ASSISTANT_BYTES),
    });
    entry.turns.push(normalized);
    entry.expiresAt = current + ttlMs;
    return view(sessionId, entry.turns);
  }

  function close() {
    if (closed) return;
    sessions.clear();
    closed = true;
  }

  function assertOpen() {
    if (closed) throw new Error('RESTAP public session store is closed.');
  }

  return Object.freeze({ create, resolve, appendTurn, close });
}

function lookup(sessions, sessionId, current) {
  if (typeof sessionId !== 'string' || !SESSION_PATTERN.test(sessionId)) throw invalidSession();
  const key = hashSessionId(sessionId);
  const entry = sessions.get(key);
  if (!entry || entry.namespace !== NAMESPACE || entry.expiresAt <= current) {
    if (entry) sessions.delete(key);
    throw invalidSession();
  }
  return entry;
}

function hashSessionId(sessionId) {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

function sweepExpired(sessions, current) {
  for (const [key, entry] of sessions) {
    if (entry.expiresAt <= current) sessions.delete(key);
  }
}

function evictOldest(sessions) {
  let oldestKey;
  let oldestExpiry = Number.POSITIVE_INFINITY;
  for (const [key, entry] of sessions) {
    if (entry.expiresAt < oldestExpiry) {
      oldestKey = key;
      oldestExpiry = entry.expiresAt;
    }
  }
  if (oldestKey !== undefined) sessions.delete(oldestKey);
}

function view(sessionId, turns) {
  const history = Object.freeze(turns.map((turn) => Object.freeze({ user: turn.user, assistant: turn.assistant })));
  return Object.freeze({ sessionId, history });
}

function boundedText(value, label, maximum) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`RESTAP ${label} turn must be a string.`);
  if (CONTROL_CHARACTERS.test(value)) throw new TypeError(`RESTAP ${label} turn must not contain control characters.`);
  if (Buffer.byteLength(value, 'utf8') > maximum) throw new RangeError(`RESTAP ${label} turn exceeds ${maximum} bytes.`);
  return value;
}

function readNow(now) {
  const value = now();
  const milliseconds = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(milliseconds)) throw new TypeError('RESTAP public session clock returned an invalid time.');
  return milliseconds;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidSession() {
  return new RangeError('invalid_session_id');
}

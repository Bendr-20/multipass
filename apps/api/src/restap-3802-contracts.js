import { parseStrictJsonObject } from './strict-json-envelope.js';

export const RESTAP_VERSION = '0.1.4-beta';
export const RESTAP_UPSTREAM_COMMIT = '5d7222692a0d1c53fbb03091b94de6c732cac2bc';
export const RESTAP_CANARY_TOKEN_ID = '3802';
export const RESTAP_BASE_PATH = '/api/restap/loopers/3802';

export const RESTAP_LIMITS = deepFreeze({
  talkBodyBytes: 8 * 1024,
  talkMessageBytes: 2_000,
  talkReplyBytes: 4_096,
  newsBodyBytes: 16 * 1024,
  newsPageDefault: 20,
  newsPageMax: 50,
  signatureSkewSeconds: 300,
});

export const RESTAP_CONFORMANCE = deepFreeze({
  provenance: {
    repository: 'https://github.com/LiamVisionary/restap',
    commit: RESTAP_UPSTREAM_COMMIT,
    version: RESTAP_VERSION,
    readmeUrl:       'https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/README.md',
    readmeSha256: 'e94a4ea4b90417760019e314e9b03bf730c1ad519b4b9cbecab77b234f2a3943',
    typesUrl:       'https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/src/types.ts',
    typesSha256: '8f7ffe519b7a0cefb6265223ecded251ee3b2893051f37c3ebaedcd05ab8ee30',
    packageUrl:       'https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/package.json',
    packageSha256: 'd515f98219ec23bef95eccd507c87e88174201a8d7a4d44b666982f97b62bee6',
    licenseDeclared: 'MIT',
    licenseEvidence: 'package.json#license',
    licenseFileAtCommit: false,
    transcription: 'independently-authored minimal conformance fixture; no upstream runtime code',
  },
  shapes: {
    discovery: {
      required: ['restap_version', 'agent', 'capabilities'],
      agentRequired: ['name', 'contact'],
      capabilityRequired: ['id', 'title', 'method', 'endpoint'],
    },
    talk: {
      requestRequired: ['message'],
      requestOptional: ['session_id'],
      responseRequired: ['reply'],
      responseOptional: ['session_id', 'suggested_actions'],
    },
    news: {
      postRequired: ['type'],
      postOptional: ['from', 'in_reply_to', 'message', 'data', 'session_id'],
      responseRequired: ['items'],
      responseOptional: ['timestamp'],
    },
  },
});

const OWNER_PROFILE_KEYS = Object.freeze([
  'biography',
  'displayName',
  'mission',
  'publicConversationEnabled',
  'voicePresentation',
]);
const AVAILABILITY_KEYS = Object.freeze(['discovery', 'newsRead', 'newsWrite', 'talk']);
const SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FORBIDDEN_NEWS_KEYS = /^(?:authorization|callback|callback_url|command|commands|cookie|endpoint|password|private_key|prompt|secret|signature|token|tool|tools|uri|url|webhook)$/iu;
const NEWS_MAX_DEPTH = 8;
const NEWS_MAX_ARRAY_ITEMS = 64;
const NEWS_MAX_OBJECT_KEYS = 64;
const NEWS_MAX_STRING_BYTES = 4_096;

export function buildRestap3802Discovery({
  publicBaseUrl,
  codexProfile,
  ownerProfile,
  contact,
  erc8004,
  availability,
} = {}) {
  const baseUrl = buildExternalBaseUrl(publicBaseUrl);
  const codex = normalizeCodexProfile(codexProfile);
  const owner = normalizeOwnerProfile(ownerProfile);
  const contactUrl = parsePublicBaseUrl(contact).toString().replace(/\/$/u, '');
  const gates = normalizeAvailability(availability);
  const identityReference = erc8004 === undefined ? undefined : normalizeErc8004(erc8004);

  const agentExtension = {
    base_url: baseUrl,
    canonical_image: codex.imageUrl,
    display_name: owner.displayName,
    public_conversation_enabled: owner.publicConversationEnabled,
    biography: owner.biography,
    mission: owner.mission,
    voice_presentation: owner.voicePresentation,
    codex: {
      schema_version: codex.schemaVersion,
      artifact_hash: codex.artifactHash,
      version: codex.codexVersion,
    },
  };
  if (identityReference) agentExtension.erc8004 = identityReference;

  return deepFreeze({
    restap_version: RESTAP_VERSION,
    agent: {
      name: codex.canonicalName,
      contact: contactUrl,
      x_helixa: agentExtension,
    },
    capabilities: [
      capability({
        id: 'talk',
        title: 'Talk to Looper #3802',
        method: 'POST',
        endpoint: '/talk',
        available: gates.talk,
        authentication: 'none',
        sessions: true,
        requestBytes: RESTAP_LIMITS.talkBodyBytes,
      }),
      capability({
        id: 'news-write',
        title: 'Submit passive news to Looper #3802',
        method: 'POST',
        endpoint: '/news',
        available: gates.newsWrite,
        authentication: 'restap-signature-v1',
        sessions: false,
        requestBytes: RESTAP_LIMITS.newsBodyBytes,
      }),
      capability({
        id: 'news-read',
        title: 'Read Looper #3802 news as its current owner',
        method: 'GET',
        endpoint: '/news',
        available: gates.newsRead,
        authentication: 'console-session-current-owner',
        sessions: false,
        requestBytes: 0,
      }),
    ],
  });
}

export function normalizeRestapTalkRequest(value) {
  assertPlainObject(value, 'RESTAP talk request');
  assertExactKeys(value, ['message', 'session_id'], ['message'], 'RESTAP talk request');
  const result = { message: normalizeText(value.message, 'message', RESTAP_LIMITS.talkMessageBytes) };
  if (Object.hasOwn(value, 'session_id')) result.session_id = normalizeSessionId(value.session_id);
  assertByteLimit(result, RESTAP_LIMITS.talkBodyBytes, 'RESTAP talk body');
  return deepFreeze(result);
}

export function normalizeRestapTalkResponse(value) {
  assertPlainObject(value, 'RESTAP talk response');
  assertExactKeys(value, ['reply', 'session_id'], ['reply', 'session_id'], 'RESTAP talk response');
  return deepFreeze({
    reply: normalizeText(value.reply, 'reply', RESTAP_LIMITS.talkReplyBytes),
    session_id: normalizeSessionId(value.session_id),
  });
}

export function normalizeRestapNewsPost(value) {
  assertPlainObject(value, 'RESTAP news post');
  assertExactKeys(
    value,
    ['data', 'from', 'in_reply_to', 'message', 'session_id', 'type'],
    ['type'],
    'RESTAP news post',
  );
  const result = { type: normalizeText(value.type, 'type', 128) };
  if (Object.hasOwn(value, 'from')) result.from = normalizeIdentifier(value.from, 'from');
  if (Object.hasOwn(value, 'in_reply_to')) result.in_reply_to = normalizeIdentifier(value.in_reply_to, 'in_reply_to');
  if (Object.hasOwn(value, 'message')) result.message = normalizeText(value.message, 'message', NEWS_MAX_STRING_BYTES);
  if (Object.hasOwn(value, 'data')) result.data = normalizeNewsJson(value.data, 1);
  if (Object.hasOwn(value, 'session_id')) result.session_id = normalizeSessionId(value.session_id);
  assertByteLimit(result, RESTAP_LIMITS.newsBodyBytes, 'RESTAP news body');
  return deepFreeze(result);
}

export function normalizeRestapNewsRead(value) {
  assertPlainObject(value, 'RESTAP news response');
  assertExactKeys(value, ['items', 'nextCursor', 'timestamp'], ['items'], 'RESTAP news response');
  if (!Array.isArray(value.items) || value.items.length > RESTAP_LIMITS.newsPageMax) {
    throw new TypeError('RESTAP news response items must be a bounded array.');
  }
  const result = { items: value.items.map(normalizeNewsItem) };
  if (Object.hasOwn(value, 'timestamp')) result.timestamp = normalizeTimestamp(value.timestamp, 'timestamp');
  if (Object.hasOwn(value, 'nextCursor')) {
    result.x_helixa_next_cursor = normalizeCursor(value.nextCursor);
  }
  return deepFreeze(result);
}

export function normalizeRestapNewsWriteAcknowledgment({ itemId, receivedAt } = {}) {
  const normalizedItemId = normalizeIdentifier(itemId, 'itemId');
  if (typeof receivedAt !== 'string' || receivedAt.length > 64 || Number.isNaN(Date.parse(receivedAt))) {
    throw new TypeError('receivedAt must be an ISO timestamp string.');
  }
  const canonicalTime = new Date(receivedAt).toISOString();
  if (canonicalTime !== receivedAt) throw new TypeError('receivedAt must be a canonical ISO timestamp string.');
  return deepFreeze({
    x_helixa_accepted: true,
    x_helixa_item_id: normalizedItemId,
    x_helixa_received_at: canonicalTime,
  });
}

export function canonicalizeRestapJson(value) {
  return encodeCanonical(value, 0);
}

export function canonicalizeRestapJsonText(source) {
  return canonicalizeRestapJson(parseStrictJsonObject(source));
}

function capability({ id, title, method, endpoint, available, authentication, sessions, requestBytes }) {
  return {
    id,
    title,
    method,
    endpoint,
    x_helixa: {
      available,
      authentication,
      content_types: ['application/json'],
      output_formats: ['application/json'],
      sessions: { supported: sessions },
      request_body_bytes: requestBytes,
      limits: id === 'talk'
        ? { per_ip_per_minute: 20, per_session_per_minute: 10, global_concurrency: 4, global_per_day: 10_000 }
        : { page_default: RESTAP_LIMITS.newsPageDefault, page_max: RESTAP_LIMITS.newsPageMax },
    },
  };
}

function normalizeCodexProfile(value) {
  assertPlainObject(value, 'Codex profile');
  const identity = value.identity;
  assertPlainObject(identity, 'Codex identity');
  if (String(identity.tokenId) !== RESTAP_CANARY_TOKEN_ID) {
    throw new TypeError('RESTAP discovery requires Codex token 3802.');
  }
  const canonicalName = normalizeText(identity.canonicalName, 'Codex canonical name', 256);
  assertPlainObject(identity.image, 'Codex image');
  const imageUrl = normalizeHttpsUrl(identity.image.url, 'Codex image');
  const schemaVersion = normalizeText(value.schemaVersion, 'Codex schema version', 64);
  const artifactHash = normalizeHash(value.artifactHash, 'Codex artifact hash');
  const codexVersion = normalizeText(value.codexVersion, 'Codex version', 128);
  return { canonicalName, imageUrl, schemaVersion, artifactHash, codexVersion };
}

function normalizeOwnerProfile(value) {
  assertPlainObject(value, 'owner public profile');
  assertExactKeys(value, OWNER_PROFILE_KEYS, OWNER_PROFILE_KEYS, 'owner public profile');
  if (value.publicConversationEnabled !== true) {
    throw new TypeError('owner public profile must enable public conversation.');
  }
  return {
    displayName: normalizeText(value.displayName, 'displayName', 256),
    publicConversationEnabled: true,
    biography: normalizeText(value.biography, 'biography', 2_048),
    mission: normalizeText(value.mission, 'mission', 2_048),
    voicePresentation: normalizeText(value.voicePresentation, 'voicePresentation', 1_024),
  };
}

function normalizeAvailability(value) {
  assertPlainObject(value, 'availability');
  assertExactKeys(value, AVAILABILITY_KEYS, AVAILABILITY_KEYS, 'availability');
  const result = {};
  for (const key of AVAILABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') throw new TypeError(`availability.${key} must be boolean.`);
    result[key] = value[key];
  }
  if (result.discovery !== true) throw new TypeError('RESTAP discovery gate must be enabled to build discovery.');
  return result;
}

function normalizeErc8004(value) {
  assertPlainObject(value, 'ERC-8004 reference');
  assertExactKeys(value, ['agentId', 'chainId', 'registry'], ['agentId', 'chainId', 'registry'], 'ERC-8004 reference');
  if (value.chainId !== 8453) throw new TypeError('ERC-8004 reference must use Base chain 8453.');
  if (typeof value.registry !== 'string' || !/^0x[a-fA-F0-9]{40}$/u.test(value.registry)) {
    throw new TypeError('ERC-8004 registry must be an address.');
  }
  if (typeof value.agentId !== 'string' || !/^[1-9]\d*$/u.test(value.agentId)) {
    throw new TypeError('ERC-8004 agent ID must be a positive decimal string.');
  }
  return { chain_id: 8453, registry: value.registry, agent_id: value.agentId };
}

function buildExternalBaseUrl(value) {
  const url = parsePublicBaseUrl(value);
  if (url.search || url.hash || url.username || url.password) {
    throw new TypeError('RESTAP public base must not include credentials, query, or fragment.');
  }
  const prefix = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/u, '');
  url.pathname = `${prefix}${RESTAP_BASE_PATH}`;
  return url.toString().replace(/\/$/u, '');
}

function normalizeHttpsUrl(value, label) {
  return parseHttpsUrl(value, label).toString().replace(/\/$/u, '');
}

function parsePublicBaseUrl(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) {
    throw new TypeError('RESTAP public base must be an HTTPS URL or HTTP loopback URL.');
  }
  let url;
  try { url = new URL(value); } catch { throw new TypeError('RESTAP public base must be an HTTPS URL or HTTP loopback URL.'); }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (!url.hostname || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new TypeError('RESTAP public base must be an HTTPS URL or HTTP loopback URL.');
  }
  return url;
}

function parseHttpsUrl(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) {
    throw new TypeError(`${label} must be an HTTPS URL.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new TypeError(`${label} must be an HTTPS URL.`);
  }
  return url;
}

function normalizeNewsItem(value) {
  assertPlainObject(value, 'RESTAP news item');
  assertExactKeys(
    value,
    ['data', 'from', 'in_reply_to', 'job_id', 'message', 'query_id', 'session_id', 'timestamp', 'type'],
    ['type'],
    'RESTAP news item',
  );
  const result = { type: normalizeText(value.type, 'news item type', 128) };
  for (const key of ['from', 'in_reply_to', 'job_id', 'query_id']) {
    if (Object.hasOwn(value, key)) result[key] = normalizeIdentifier(value[key], key);
  }
  if (Object.hasOwn(value, 'message')) result.message = normalizeText(value.message, 'news item message', NEWS_MAX_STRING_BYTES);
  if (Object.hasOwn(value, 'data')) result.data = normalizeNewsJson(value.data, 1);
  if (Object.hasOwn(value, 'session_id')) result.session_id = normalizeSessionId(value.session_id);
  if (Object.hasOwn(value, 'timestamp')) result.timestamp = normalizeTimestamp(value.timestamp, 'news item timestamp');
  return deepFreeze(result);
}

function normalizeNewsJson(value, depth) {
  if (depth > NEWS_MAX_DEPTH) throw new TypeError('RESTAP news data exceeds maximum depth.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('RESTAP news data numbers must be finite JSON numbers.');
    return value;
  }
  if (typeof value === 'string') return normalizeText(value, 'RESTAP news data string', NEWS_MAX_STRING_BYTES, { allowEmpty: true });
  if (Array.isArray(value)) {
    if (value.length > NEWS_MAX_ARRAY_ITEMS) throw new TypeError('RESTAP news data array is too large.');
    return value.map((item) => normalizeNewsJson(item, depth + 1));
  }
  assertPlainObject(value, 'RESTAP news data');
  const keys = Object.keys(value);
  if (keys.length > NEWS_MAX_OBJECT_KEYS) throw new TypeError('RESTAP news data object is too large.');
  const result = {};
  for (const key of keys.sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key)) throw new TypeError(`RESTAP news data key "${key}" is forbidden.`);
    if (FORBIDDEN_NEWS_KEYS.test(key)) throw new TypeError(`RESTAP news data key "${key}" is sensitive or executable.`);
    if (!key || key.length > 128 || CONTROL_CHARACTERS.test(key)) throw new TypeError('RESTAP news data key is invalid.');
    result[key] = normalizeNewsJson(value[key], depth + 1);
  }
  return result;
}

function normalizeText(value, label, maxBytes, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new TypeError(`${label} must be a string.`);
  if (CONTROL_CHARACTERS.test(value)) throw new TypeError(`${label} must not contain control characters.`);
  if (Buffer.byteLength(value, 'utf8') > maxBytes) throw new TypeError(`${label} exceeds ${maxBytes} bytes.`);
  return value;
}

function normalizeSessionId(value) {
  if (typeof value !== 'string' || !SESSION_PATTERN.test(value)) {
    throw new TypeError('session_id must be a server-minted base64url token.');
  }
  return value;
}

function normalizeIdentifier(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function normalizeCursor(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || CONTROL_CHARACTERS.test(value)) {
    throw new TypeError('next cursor is invalid.');
  }
  return value;
}

function normalizeTimestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function normalizeHash(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}

function assertByteLimit(value, maximum, label) {
  const bytes = Buffer.byteLength(canonicalizeRestapJson(value), 'utf8');
  if (bytes > maximum) throw new TypeError(`${label} exceeds ${maximum} bytes.`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
}

function assertExactKeys(value, allowed, required, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`${label} contains unknown key "${key}".`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing required key "${key}".`);
  }
}

function encodeCanonical(value, depth) {
  if (depth > 32) throw new TypeError('Canonical JSON exceeds maximum depth.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON numbers must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => encodeCanonical(item, depth + 1)).join(',')}]`;
  assertPlainObject(value, 'Canonical JSON value');
  const entries = [];
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key)) throw new TypeError(`Canonical JSON key "${key}" is forbidden.`);
    const child = value[key];
    if (child === undefined || typeof child === 'bigint' || typeof child === 'function' || typeof child === 'symbol') {
      throw new TypeError('Canonical JSON contains a non-JSON value.');
    }
    entries.push(`${JSON.stringify(key)}:${encodeCanonical(child, depth + 1)}`);
  }
  return `{${entries.join(',')}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

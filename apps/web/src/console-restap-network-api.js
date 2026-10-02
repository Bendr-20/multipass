const TOPICS = Object.freeze(['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general']);
const CADENCES = Object.freeze(['once', 'daily']);
const POLICY_KEYS = Object.freeze(['expected_policy_version', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);
const INTENT_KEYS = Object.freeze(['peer_token_ids', 'topic', 'cadence', 'run_at', 'idempotency_key']);

export class ConsoleRestapNetworkApiError extends Error {
  constructor({ status, code }) {
    super(status === 409 ? 'RESTAP network state changed. Refresh and retry.' : status === 401 || status === 403 ? 'Console authorization is required.' : 'RESTAP network controls are unavailable.');
    this.name = 'ConsoleRestapNetworkApiError';
    this.status = Number.isInteger(status) ? status : 0;
    this.code = typeof code === 'string' && /^[a-z0-9_]{1,64}$/u.test(code) ? code : 'restap_network_unavailable';
  }
}

export function createConsoleRestapNetworkApi({ fetchImpl, apiBase = '' } = {}) {
  const activeFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  if (typeof activeFetch !== 'function') throw new TypeError('fetchImpl must be a function.');
  const base = String(apiBase ?? '').replace(/\/$/u, '');

  async function call(path, { method = 'GET', csrfToken = null, body, signal } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrfToken !== null) headers['x-csrf-token'] = boundedText(csrfToken, 'csrfToken', 512);
    const response = await activeFetch(base + path, { method, credentials: 'include', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new ConsoleRestapNetworkApiError({ status: response.status, code: payload?.error?.code });
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ConsoleRestapNetworkApiError({ status: 503, code: 'invalid_response' });
    return payload;
  }

  return Object.freeze({
    getPolicy(input) {
      exactObject(input, ['signal', 'tokenId'], 'get policy', new Set(['signal']));
      return call(path(input.tokenId, 'policy'), { signal: input.signal });
    },
    putPolicy(input) {
      exactObject(input, ['csrfToken', 'policy', 'signal', 'tokenId'], 'put policy', new Set(['signal']));
      return call(path(input.tokenId, 'policy'), { method: 'PUT', csrfToken: input.csrfToken, body: normalizePolicy(input.policy), signal: input.signal });
    },
    createIntent(input) {
      exactObject(input, ['csrfToken', 'intent', 'signal', 'tokenId'], 'create intent', new Set(['signal']));
      return call(path(input.tokenId, 'intents'), { method: 'POST', csrfToken: input.csrfToken, body: normalizeIntent(input.intent), signal: input.signal });
    },
    listIntents(input) {
      exactObject(input, ['signal', 'tokenId'], 'list intents', new Set(['signal']));
      return call(path(input.tokenId, 'intents'), { signal: input.signal });
    },
    deleteIntent(input) {
      exactObject(input, ['csrfToken', 'expectedPolicyVersion', 'intentId', 'signal', 'tokenId'], 'delete intent', new Set(['signal']));
      return call(path(input.tokenId, 'intents/' + encodeURIComponent(identifier(input.intentId, 'intentId'))), { method: 'DELETE', csrfToken: input.csrfToken, body: { expected_policy_version: version(input.expectedPolicyVersion) }, signal: input.signal });
    },
    stop(input) {
      exactObject(input, ['csrfToken', 'expectedPolicyVersion', 'signal', 'tokenId'], 'stop', new Set(['signal']));
      return call(path(input.tokenId, 'stop'), { method: 'POST', csrfToken: input.csrfToken, body: { expected_policy_version: version(input.expectedPolicyVersion) }, signal: input.signal });
    },
  });
}

function path(tokenId, suffix) { return '/api/multipass/console/restap-network/' + encodeURIComponent(token(tokenId)) + '/' + suffix; }
function normalizePolicy(value) {
  exactObject(value, POLICY_KEYS, 'policy');
  for (const key of ['network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled']) if (typeof value[key] !== 'boolean') throw new TypeError(key + ' must be boolean.');
  const result = {
    expected_policy_version: version(value.expected_policy_version),
    network_enabled: value.network_enabled,
    inbound_enabled: value.inbound_enabled,
    autonomous_initiation_enabled: value.autonomous_initiation_enabled,
    daily_initiated_conversation_limit: integer(value.daily_initiated_conversation_limit, 0, 10),
    daily_generated_message_limit: integer(value.daily_generated_message_limit, 0, 30),
    per_peer_daily_limit: integer(value.per_peer_daily_limit, 0, 5),
    topics: closedArray(value.topics, TOPICS, 'topics'),
    allow_peer_token_ids: tokenArray(value.allow_peer_token_ids),
    block_peer_token_ids: tokenArray(value.block_peer_token_ids),
    mute_until: value.mute_until === null ? null : canonicalTime(value.mute_until),
  };
  if (result.allow_peer_token_ids.some((item) => result.block_peer_token_ids.includes(item))) throw new TypeError('allow and block peers overlap.');
  return result;
}
function normalizeIntent(value) {
  exactObject(value, INTENT_KEYS, 'intent');
  return { peer_token_ids: tokenArray(value.peer_token_ids, true), topic: closed(value.topic, TOPICS, 'topic'), cadence: closed(value.cadence, CADENCES, 'cadence'), run_at: canonicalTime(value.run_at), idempotency_key: identifier(value.idempotency_key, 'idempotency_key') };
}
function exactObject(value, keys, label, optional = new Set()) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain object.'); const actual = Reflect.ownKeys(value); const allowed = new Set(keys); for (const key of actual) { if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(label + ' contains unknown fields.'); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' fields must be data properties.'); } for (const key of keys) if (!optional.has(key) && !Object.hasOwn(value, key)) throw new TypeError(label + ' is missing fields.'); }
function token(value) { const normalized = String(value ?? ''); if (!/^(?:[1-9][0-9]*)$/u.test(normalized) || BigInt(normalized) > 7_777n) throw new TypeError('tokenId must be canonical.'); return normalized; }
function tokenArray(value, required = false) { if (!Array.isArray(value) || value.length > 256 || (required && value.length === 0)) throw new TypeError('peer token IDs are invalid.'); const result = value.map(token); if (new Set(result).size !== result.length) throw new TypeError('peer token IDs contain duplicates.'); return result.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0); }
function closedArray(value, allowed, label) { if (!Array.isArray(value) || value.length > allowed.length) throw new TypeError(label + ' is invalid.'); const result = value.map((item) => closed(item, allowed, label)); if (new Set(result).size !== result.length) throw new TypeError(label + ' contains duplicates.'); return result.sort(); }
function closed(value, allowed, label) { if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(label + ' is invalid.'); return value; }
function canonicalTime(value) { if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('time must be canonical.'); return value; }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('integer is out of bounds.'); return value; }
function version(value) { return integer(value, 0, Number.MAX_SAFE_INTEGER); }
function identifier(value, label) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/u.test(value)) throw new TypeError(label + ' is invalid.'); return value; }
function boundedText(value, label, max) { if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(label + ' is invalid.'); return value; }

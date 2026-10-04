const TOPICS = Object.freeze(['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general']);
const CADENCES = Object.freeze(['once', 'daily']);
const POLICY_KEYS = Object.freeze(['expected_policy_version', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);
const INTENT_KEYS = Object.freeze(['peer_token_ids', 'topic', 'cadence', 'run_at', 'idempotency_key']);
const POLICY_RESPONSE_KEYS = Object.freeze(['schema_version', 'token_id', 'policy', 'lease_status', 'eligibility_status', 'quota_usage', 'transcripts']);
const PROJECTED_POLICY_KEYS = Object.freeze(['policy_version', 'custody_generation', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);
const PROJECTED_INTENT_KEYS = Object.freeze(['intent_id', 'source', 'topic', 'status', 'earliest_at', 'expires_at', 'attempt_count', 'attempt_limit', 'next_eligible_at']);

export class ConsoleRestapNetworkApiError extends Error {
  constructor({ status, code }) {
    super(status === 409 ? 'RESTAP network state changed. Refresh and retry.' : status === 401 || status === 403 ? 'Console authorization is required.' : 'RESTAP network controls are unavailable.');
    this.name = 'ConsoleRestapNetworkApiError';
    this.status = Number.isInteger(status) ? status : 0;
    this.code = typeof code === 'string' && /^[a-z0-9_]{1,64}$/u.test(code) ? code : 'restap_network_unavailable';
  }
}

export function createConsoleRestapNetworkApi({ fetchImpl, apiBase = '/multipass-api' } = {}) {
  const activeFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  if (typeof activeFetch !== 'function') throw new TypeError('fetchImpl must be a function.');
  const base = String(apiBase || '/multipass-api').replace(/\/$/u, '');

  async function call(path, { method = 'GET', csrfToken = null, body, signal, validate } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrfToken !== null) headers['x-csrf-token'] = boundedText(csrfToken, 'csrfToken', 512);
    let response;
    try {
      response = await activeFetch(base + path, { method, credentials: 'include', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    } catch {
      throw new ConsoleRestapNetworkApiError({ status: 0, code: 'restap_network_unavailable' });
    }
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new ConsoleRestapNetworkApiError({ status: response.status, code: payload?.error?.code });
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ConsoleRestapNetworkApiError({ status: 503, code: 'invalid_response' });
    if (!validate) return payload;
    try { return validate(payload); } catch { throw new ConsoleRestapNetworkApiError({ status: 503, code: 'invalid_response' }); }
  }

  return Object.freeze({
    getPolicy(input) {
      exactObject(input, ['signal', 'tokenId'], 'get policy', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'policy'), { signal: input.signal, validate: (payload) => validatePolicyResponse(payload, tokenId) });
    },
    putPolicy(input) {
      exactObject(input, ['csrfToken', 'policy', 'signal', 'tokenId'], 'put policy', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'policy'), { method: 'PUT', csrfToken: input.csrfToken, body: normalizePolicy(input.policy), signal: input.signal, validate: (payload) => validatePolicyResponse(payload, tokenId) });
    },
    createIntent(input) {
      exactObject(input, ['csrfToken', 'intent', 'signal', 'tokenId'], 'create intent', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'intents'), { method: 'POST', csrfToken: input.csrfToken, body: normalizeIntent(input.intent), signal: input.signal, validate: (payload) => validateIntentResponse(payload, tokenId, false) });
    },
    listIntents(input) {
      exactObject(input, ['signal', 'tokenId'], 'list intents', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'intents'), { signal: input.signal, validate: (payload) => validateIntentResponse(payload, tokenId, true) });
    },
    deleteIntent(input) {
      exactObject(input, ['csrfToken', 'expectedPolicyVersion', 'intentId', 'signal', 'tokenId'], 'delete intent', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'intents/' + encodeURIComponent(identifier(input.intentId, 'intentId'))), { method: 'DELETE', csrfToken: input.csrfToken, body: { expected_policy_version: version(input.expectedPolicyVersion) }, signal: input.signal, validate: (payload) => validateIntentResponse(payload, tokenId, false) });
    },
    stop(input) {
      exactObject(input, ['csrfToken', 'expectedPolicyVersion', 'signal', 'tokenId'], 'stop', new Set(['signal']));
      const tokenId = token(input.tokenId);
      return call(path(tokenId, 'stop'), { method: 'POST', csrfToken: input.csrfToken, body: { expected_policy_version: version(input.expectedPolicyVersion) }, signal: input.signal, validate: (payload) => validatePolicyResponse(payload, tokenId) });
    },
  });
}

function validatePolicyResponse(value, expectedTokenId) {
  exactObject(value, POLICY_RESPONSE_KEYS, 'policy response');
  if (value.schema_version !== '0.1.0' || token(value.token_id) !== expectedTokenId) throw new TypeError('policy response is invalid.');
  exactObject(value.policy, PROJECTED_POLICY_KEYS, 'projected policy');
  for (const key of ['network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled']) if (typeof value.policy[key] !== 'boolean') throw new TypeError('projected policy is invalid.');
  version(value.policy.policy_version);
  version(value.policy.custody_generation);
  integer(value.policy.daily_initiated_conversation_limit, 0, 10);
  integer(value.policy.daily_generated_message_limit, 0, 30);
  integer(value.policy.per_peer_daily_limit, 0, 5);
  closedArray(value.policy.topics, TOPICS, 'topics');
  tokenArray(value.policy.allow_peer_token_ids);
  tokenArray(value.policy.block_peer_token_ids);
  if (value.policy.mute_until !== null) canonicalTime(value.policy.mute_until);
  closed(value.lease_status, ['active', 'inactive', 'unavailable'], 'lease status');
  closed(value.eligibility_status, ['eligible', 'unavailable'], 'eligibility status');
  exactObject(value.quota_usage, ['initiated', 'generated', 'cost_units'], 'quota usage');
  integer(value.quota_usage.initiated, 0, Number.MAX_SAFE_INTEGER);
  integer(value.quota_usage.generated, 0, Number.MAX_SAFE_INTEGER);
  integer(value.quota_usage.cost_units, 0, Number.MAX_SAFE_INTEGER);
  exactObject(value.transcripts, ['available', 'reason'], 'transcripts');
  if (value.transcripts.available !== false || value.transcripts.reason !== 'pilot_memory_only') throw new TypeError('transcripts are invalid.');
  return value;
}

function validateIntentResponse(value, expectedTokenId, list) {
  exactObject(value, ['schema_version', 'token_id', list ? 'intents' : 'intent'], 'intent response');
  if (value.schema_version !== '0.1.0' || token(value.token_id) !== expectedTokenId) throw new TypeError('intent response is invalid.');
  if (list) {
    if (!Array.isArray(value.intents) || value.intents.length > 256) throw new TypeError('intent response is invalid.');
    for (const intent of value.intents) validateProjectedIntent(intent);
  } else validateProjectedIntent(value.intent);
  return value;
}

function validateProjectedIntent(value) {
  exactObject(value, PROJECTED_INTENT_KEYS, 'projected intent');
  identifier(value.intent_id, 'intent_id');
  closed(value.source, ['one_shot', 'daily'], 'source');
  closed(value.topic, TOPICS, 'topic');
  closed(value.status, ['pending', 'leased', 'completed', 'cancelled', 'expired', 'exhausted'], 'status');
  canonicalTime(value.earliest_at);
  canonicalTime(value.expires_at);
  canonicalTime(value.next_eligible_at);
  integer(value.attempt_count, 0, Number.MAX_SAFE_INTEGER);
  integer(value.attempt_limit, 1, Number.MAX_SAFE_INTEGER);
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

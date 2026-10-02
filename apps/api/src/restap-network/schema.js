import {
  RESTAP_NETWORK_CADENCES,
  RESTAP_NETWORK_INTERNAL_PATHS,
  RESTAP_NETWORK_LIMITS,
  RESTAP_NETWORK_TOPICS,
} from './constants.js';

const UINT256_MAX = (2n ** 256n) - 1n;
const ADDRESS = /^0x[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9_-]{32,128}$/u;
const IDENTITY_ID = /^[A-Za-z0-9:._-]{1,128}$/u;
const VERSION = /^[A-Za-z0-9._-]{1,64}$/u;
const STATUS_CLASSES = new Set(['eligible', 'unavailable', 'not_found', 'authentication_failed', 'rate_limited', 'budget_exhausted', 'provider_unavailable', 'database_unavailable', 'cancelled', 'committed']);
const OUTCOMES = new Set(['committed', 'released', 'charged_unknown', 'cancelled_charged', 'failed_charged']);
const OUTCOME_REASONS = new Set(['completed', 'policy_changed', 'authority_changed', 'lease_changed', 'gate_changed', 'blocked', 'provider_failed', 'provider_unknown', 'quota_released']);
const OPERATIONS = new Set(Object.keys(RESTAP_NETWORK_INTERNAL_PATHS));
const DISCOVERY_OPERATIONS = new Set(['discovery', 'opening', 'reply']);
const CONSTRAINTS = new Set(['no-tools', 'no-wallet', 'no-private-memory']);

export function normalizeRestapNetworkTokenId(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) throw new TypeError('token ID must be a canonical decimal string.');
  let parsed;
  try { parsed = BigInt(value); } catch { throw new TypeError('token ID is invalid.'); }
  if (parsed > UINT256_MAX) throw new TypeError('token ID exceeds uint256.');
  return value;
}

export function normalizeRestapNetworkPolicyInput(value, { selfTokenId } = {}) {
  const label = 'RESTAP network policy';
  const keys = [
    'expected_policy_version', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled',
    'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit',
    'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until',
  ];
  assertExactObject(value, keys, keys, label);
  const self = normalizeRestapNetworkTokenId(selfTokenId);
  const result = {
    expected_policy_version: integer(value.expected_policy_version, 'expected_policy_version', 0),
    network_enabled: bool(value.network_enabled, 'network_enabled'),
    inbound_enabled: bool(value.inbound_enabled, 'inbound_enabled'),
    autonomous_initiation_enabled: bool(value.autonomous_initiation_enabled, 'autonomous_initiation_enabled'),
    daily_initiated_conversation_limit: integer(value.daily_initiated_conversation_limit, 'daily_initiated_conversation_limit', 0, RESTAP_NETWORK_LIMITS.initiatedPerTokenDay),
    daily_generated_message_limit: integer(value.daily_generated_message_limit, 'daily_generated_message_limit', 0, RESTAP_NETWORK_LIMITS.generatedPerTokenDay),
    per_peer_daily_limit: integer(value.per_peer_daily_limit, 'per_peer_daily_limit', 0, RESTAP_NETWORK_LIMITS.initiatedPerOrderedPairDay),
    topics: closedSet(value.topics, RESTAP_NETWORK_TOPICS, 'topics'),
    allow_peer_token_ids: tokenSet(value.allow_peer_token_ids, self, 'allow_peer_token_ids'),
    block_peer_token_ids: tokenSet(value.block_peer_token_ids, self, 'block_peer_token_ids'),
    mute_until: value.mute_until === null ? null : canonicalInstant(value.mute_until, 'mute_until'),
  };
  const blocked = new Set(result.block_peer_token_ids);
  if (result.allow_peer_token_ids.some((tokenId) => blocked.has(tokenId))) throw new TypeError('allow and block peer token IDs must not overlap.');
  return deepFreeze(result);
}

export function normalizeRestapNetworkIntentInput(value, { selfTokenId } = {}) {
  const keys = ['peer_token_ids', 'topic', 'cadence', 'run_at', 'idempotency_key'];
  assertExactObject(value, keys, keys, 'RESTAP network intent');
  const peers = tokenSet(value.peer_token_ids, normalizeRestapNetworkTokenId(selfTokenId), 'peer_token_ids');
  if (!peers.length) throw new TypeError('peer_token_ids must not be empty.');
  return deepFreeze({
    peer_token_ids: peers,
    topic: closedValue(value.topic, RESTAP_NETWORK_TOPICS, 'topic'),
    cadence: closedValue(value.cadence, RESTAP_NETWORK_CADENCES, 'cadence'),
    run_at: canonicalInstant(value.run_at, 'run_at'),
    idempotency_key: identifier(value.idempotency_key, 'idempotency_key'),
  });
}

export function normalizeRestapNetworkIntentCancel(value) {
  return expectedVersion(value, 'RESTAP network intent cancellation');
}

export function normalizeRestapNetworkStopInput(value) {
  return expectedVersion(value, 'RESTAP network stop');
}

export function normalizeRestapNetworkDiscovery(value) {
  const keys = ['schema_version', 'token_id', 'canonical_name', 'canonical_image', 'restap_version', 'operations', 'topics', 'limits', 'constraints'];
  assertExactObject(value, keys, keys, 'RESTAP network discovery');
  assertExactObject(value.limits, ['message_bytes', 'reply_rounds'], ['message_bytes', 'reply_rounds'], 'RESTAP network discovery limits');
  const operations = closedSet(value.operations, DISCOVERY_OPERATIONS, 'operations');
  const constraints = closedSet(value.constraints, CONSTRAINTS, 'constraints');
  for (const required of CONSTRAINTS) if (!constraints.includes(required)) throw new TypeError('discovery constraints must include ' + required + '.');
  return deepFreeze({
    schema_version: version(value.schema_version, 'schema_version'),
    token_id: normalizeRestapNetworkTokenId(value.token_id),
    canonical_name: text(value.canonical_name, 'canonical_name', 256),
    canonical_image: httpsUrl(value.canonical_image, 'canonical_image'),
    restap_version: version(value.restap_version, 'restap_version'),
    operations,
    topics: closedSet(value.topics, RESTAP_NETWORK_TOPICS, 'topics'),
    limits: {
      message_bytes: integer(value.limits.message_bytes, 'message_bytes', 1, RESTAP_NETWORK_LIMITS.messageBytes),
      reply_rounds: integer(value.limits.reply_rounds, 'reply_rounds', 0, RESTAP_NETWORK_LIMITS.replyRounds),
    },
    constraints,
  });
}

export function normalizeRestapNetworkMessageEnvelope(value) {
  const keys = ['schema_version', 'operation_id', 'conversation_id', 'sender_token_id', 'recipient_token_id', 'topic', 'turn_index', 'message'];
  assertExactObject(value, keys, keys, 'RESTAP network message envelope');
  const sender = normalizeRestapNetworkTokenId(value.sender_token_id);
  const recipient = normalizeRestapNetworkTokenId(value.recipient_token_id);
  if (sender === recipient) throw new TypeError('sender and recipient token IDs must differ.');
  return deepFreeze({
    schema_version: version(value.schema_version, 'schema_version'),
    operation_id: identifier(value.operation_id, 'operation_id'),
    conversation_id: identifier(value.conversation_id, 'conversation_id'),
    sender_token_id: sender,
    recipient_token_id: recipient,
    topic: closedValue(value.topic, RESTAP_NETWORK_TOPICS, 'topic'),
    turn_index: integer(value.turn_index, 'turn_index', 0, RESTAP_NETWORK_LIMITS.storedMessages - 1),
    message: text(value.message, 'message', RESTAP_NETWORK_LIMITS.messageBytes),
  });
}

export function normalizeRestapNetworkGrantHeader(value) {
  const keys = ['schema_version', 'alg', 'kid', 'typ'];
  assertExactObject(value, keys, keys, 'RESTAP network grant header');
  if (value.alg !== 'Ed25519') throw new TypeError('grant alg must be Ed25519.');
  if (value.typ !== 'looper-communication-grant+jcs') throw new TypeError('grant typ is invalid.');
  return deepFreeze({ schema_version: version(value.schema_version, 'schema_version'), alg: 'Ed25519', kid: identifier(value.kid, 'kid'), typ: value.typ });
}

export function normalizeRestapNetworkGrantPayload(value) {
  const keys = [
    'iss', 'aud', 'chain_id', 'collection', 'sender_token_id', 'sender_account', 'sender_identity_id',
    'sender_custody_epoch', 'sender_activation_lease_id', 'recipient_token_id', 'recipient_custody_epoch',
    'recipient_activation_lease_id', 'operation', 'path', 'body_sha256', 'iat', 'nbf', 'exp', 'nonce',
    'operation_id', 'correlation_id', 'sender_policy_version', 'recipient_policy_version', 'reservation',
  ];
  assertExactObject(value, keys, keys, 'RESTAP network grant payload');
  assertExactObject(value.reservation, ['conversations', 'messages', 'concurrency_per_token', 'cost_units'], ['conversations', 'messages', 'concurrency_per_token', 'cost_units'], 'RESTAP network grant reservation');
  if (value.iss !== 'helixa-restap-network') throw new TypeError('grant issuer is invalid.');
  if (value.aud !== 'helixa-restap-network-relay') throw new TypeError('grant audience is invalid.');
  const operation = closedValue(value.operation, OPERATIONS, 'operation');
  if (value.path !== RESTAP_NETWORK_INTERNAL_PATHS[operation]) throw new TypeError('grant path does not match operation.');
  const iat = integer(value.iat, 'iat', 0);
  const nbf = integer(value.nbf, 'nbf', 0);
  const exp = integer(value.exp, 'exp', 0);
  if (nbf > iat || exp < iat || exp - iat > RESTAP_NETWORK_LIMITS.grantTtlMs / 1000) throw new TypeError('grant exp/nbf time window is invalid.');
  const sender = normalizeRestapNetworkTokenId(value.sender_token_id);
  const recipient = normalizeRestapNetworkTokenId(value.recipient_token_id);
  if (sender === recipient) throw new TypeError('grant sender and recipient must differ.');
  return deepFreeze({
    iss: value.iss,
    aud: value.aud,
    chain_id: integer(value.chain_id, 'chain_id', 1),
    collection: address(value.collection, 'collection'),
    sender_token_id: sender,
    sender_account: address(value.sender_account, 'sender_account'),
    sender_identity_id: value.sender_identity_id === null ? null : pattern(value.sender_identity_id, IDENTITY_ID, 'sender_identity_id'),
    sender_custody_epoch: integer(value.sender_custody_epoch, 'sender_custody_epoch', 0),
    sender_activation_lease_id: identifier(value.sender_activation_lease_id, 'sender_activation_lease_id'),
    recipient_token_id: recipient,
    recipient_custody_epoch: integer(value.recipient_custody_epoch, 'recipient_custody_epoch', 0),
    recipient_activation_lease_id: identifier(value.recipient_activation_lease_id, 'recipient_activation_lease_id'),
    operation,
    path: value.path,
    body_sha256: pattern(value.body_sha256, HASH, 'body_sha256'),
    iat,
    nbf,
    exp,
    nonce: identifier(value.nonce, 'nonce'),
    operation_id: identifier(value.operation_id, 'operation_id'),
    correlation_id: identifier(value.correlation_id, 'correlation_id'),
    sender_policy_version: integer(value.sender_policy_version, 'sender_policy_version', 0),
    recipient_policy_version: integer(value.recipient_policy_version, 'recipient_policy_version', 0),
    reservation: {
      conversations: integer(value.reservation.conversations, 'conversations', 0, 1),
      messages: integer(value.reservation.messages, 'messages', 0, 1),
      concurrency_per_token: integer(value.reservation.concurrency_per_token, 'concurrency_per_token', 0, RESTAP_NETWORK_LIMITS.concurrentPerToken),
      cost_units: integer(value.reservation.cost_units, 'cost_units', 0, Number.MAX_SAFE_INTEGER),
    },
  });
}

export function normalizeRestapNetworkOperationOutcome(value) {
  assertExactObject(value, ['state', 'reason'], ['state', 'reason'], 'RESTAP network operation outcome');
  return deepFreeze({ state: closedValue(value.state, OUTCOMES, 'state'), reason: closedValue(value.reason, OUTCOME_REASONS, 'reason') });
}

export function normalizeRestapNetworkStatusClass(value) {
  return closedValue(value, STATUS_CLASSES, 'status class');
}

function expectedVersion(value, label) {
  assertExactObject(value, ['expected_policy_version'], ['expected_policy_version'], label);
  return deepFreeze({ expected_policy_version: integer(value.expected_policy_version, 'expected_policy_version', 0) });
}

function assertExactObject(value, allowed, required, label) {
  assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new TypeError(label + ' contains unknown key "' + key + '".');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError(label + ' is missing required key "' + key + '".');
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be a plain object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(label + ' must be a plain object.');
}

function tokenSet(value, selfTokenId, label) {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError(label + ' must be a bounded array.');
  const result = value.map(normalizeRestapNetworkTokenId);
  if (new Set(result).size !== result.length) throw new TypeError(label + ' must not contain duplicates.');
  if (result.includes(selfTokenId)) throw new TypeError(label + ' must not include the sender token ID.');
  return result.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
}

function closedSet(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.length) throw new TypeError(label + ' must be a bounded array.');
  const result = value.map((entry) => closedValue(entry, allowed, label));
  if (new Set(result).size !== result.length) throw new TypeError(label + ' must not contain duplicates.');
  return result.sort();
}

function closedValue(value, allowed, label) {
  if (typeof value !== 'string' || !(allowed instanceof Set ? allowed.has(value) : allowed.includes(value))) throw new TypeError(label + ' is not allowed.');
  return value;
}

function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(label + ' must be a bounded integer.');
  return value;
}

function bool(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean.');
  return value;
}

function canonicalInstant(value, label) {
  if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError(label + ' must be a canonical RFC 3339 instant.');
  return value;
}

function identifier(value, label) {
  return pattern(value, IDENTIFIER, label);
}

function version(value, label) {
  return pattern(value, VERSION, label);
}

function address(value, label) {
  return pattern(value, ADDRESS, label);
}

function pattern(value, expression, label) {
  if (typeof value !== 'string' || !expression.test(value)) throw new TypeError(label + ' is invalid.');
  return value;
}

function text(value, label, maximumBytes) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > maximumBytes) throw new TypeError(label + ' exceeds allowed bytes or is empty.');
  return value;
}

function httpsUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError(label + ' must be an HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== value) throw new TypeError(label + ' must be a canonical HTTPS URL.');
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

import { createHash } from 'node:crypto';
import { getAddress } from 'viem';

import { RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkIntentInput, normalizeRestapNetworkTokenId } from './schema.js';

const DAY_MS = 24 * 60 * 60_000;
const TERMINAL = new Set(['completed', 'cancelled', 'expired', 'exhausted']);
const OUTCOMES = new Set(['succeeded', 'failed', 'cancelled']);

export function createRestapNetworkIntentStore({
  store,
  now = Date.now,
  createId,
  authenticateConsoleOwner,
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function' || typeof store.readAll !== 'function') throw new TypeError('Intent store requires the RESTAP network store.');
  if (typeof now !== 'function' || typeof createId !== 'function' || typeof authenticateConsoleOwner !== 'function') throw new TypeError('Intent store dependencies are invalid.');

  function create(value) {
    exactObject(value, ['source', 'ownerSession', 'authority', 'intent', 'expiresAt', 'attemptLimit'], 'RESTAP network intent creation');
    if (value.source !== 'console_owner') throw new TypeError('RESTAP network intents require a Console owner source.');
    const authority = normalizeAuthority(value.authority);
    const authenticated = authenticateConsoleOwner(Object.freeze({ ownerSession: value.ownerSession, authority }));
    if (authenticated && typeof authenticated.then === 'function') throw new TypeError('Console owner authentication must be synchronous.');
    if (authenticated !== true) throw new Error('RESTAP network intent requires an authenticated Console owner.');

    const intent = normalizeRestapNetworkIntentInput(value.intent, { selfTokenId: authority.tokenId });
    const timestamp = clock(now());
    const runAt = Date.parse(intent.run_at);
    if (!Number.isSafeInteger(runAt) || runAt < timestamp) throw new TypeError('RESTAP network intent run_at is expired or in the past.');
    const expiresAt = integer(value.expiresAt, 'Intent expiry', runAt + 1);
    const attemptLimit = integer(value.attemptLimit, 'Intent attempt limit', 1, 100);
    const source = intent.cadence === 'once' ? 'one_shot' : 'daily';
    const peers = normalizePeerSet(intent.peer_token_ids, authority.tokenId);
    const peerSetDigest = digest(JSON.stringify(peers));
    const idempotencyDigest = digest('intent-idempotency|' + intent.idempotency_key);
    const signature = { authority, source, topic: intent.topic, peerSetDigest, runAt, expiresAt, attemptLimit };

    return store.transaction('intent_create', (tx) => {
      const policy = requireCurrentAuthority(tx, authority, timestamp);
      assertPolicyApproval(tx, policy, authority, peers, intent.topic);
      const existing = tx.get(
        'SELECT * FROM restap_network_intents WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND idempotency_key = ?',
        [authority.chainId, authority.collection, authority.tokenId, authority.custodyGeneration, idempotencyDigest],
      );
      if (existing) return joinExisting(existing, signature);
      const intentId = opaqueId(createId('intent'));
      tx.run(
        'INSERT INTO restap_network_intents (intent_id, chain_id, collection, token_id, custody_generation, activation_lease_id, policy_version, source, topic, peer_set_digest, selection_cursor, idempotency_key, earliest_at, expires_at, attempt_count, attempt_limit, next_eligible_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [intentId, authority.chainId, authority.collection, authority.tokenId, authority.custodyGeneration, authority.activationLeaseId, authority.policyVersion,
          source, intent.topic, peerSetDigest, 0, idempotencyDigest, runAt, expiresAt, 0, attemptLimit, runAt, 'pending', timestamp, timestamp],
      );
      return project(tx.get('SELECT * FROM restap_network_intents WHERE intent_id = ?', [intentId]));
    });
  }

  function acquire(value) {
    exactObject(value, ['intentId', 'authority', 'peerTokenIds', 'candidates'], 'RESTAP network intent acquisition');
    const intentId = opaqueId(value.intentId);
    const authority = normalizeAuthority(value.authority);
    const peers = normalizePeerSet(value.peerTokenIds, authority.tokenId);
    const peerSetDigest = digest(JSON.stringify(peers));
    const candidates = normalizeCandidates(value.candidates, authority.tokenId);
    const timestamp = clock(now());

    return store.transaction('intent_acquire', (tx) => {
      const row = tx.get('SELECT * FROM restap_network_intents WHERE intent_id = ?', [intentId]);
      if (!row) throw new Error('RESTAP network intent is unavailable.');
      if (TERMINAL.has(row.status)) throw new Error('RESTAP network intent is terminal.');
      if (row.status !== 'pending') return Object.freeze({ status: 'unavailable' });
      if (Number(row.expires_at) <= timestamp) return transition(tx, row, 'expired', timestamp);
      if (!authorityMatches(row, authority) || !currentAuthorityMatches(tx, row, timestamp)) return transition(tx, row, 'cancelled', timestamp);
      if (row.peer_set_digest !== peerSetDigest) throw new Error('RESTAP network intent peer set mismatch.');
      if (timestamp < Number(row.next_eligible_at)) return Object.freeze({ status: 'unavailable' });
      if (Number(row.attempt_count) >= Number(row.attempt_limit)) return transition(tx, row, 'exhausted', timestamp);

      const policy = tx.get(
        'SELECT * FROM restap_network_owner_policies WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND policy_version = ?',
        [row.chain_id, row.collection, row.token_id, row.custody_generation, row.policy_version],
      );
      const allowedPeers = new Set(tx.all(
        "SELECT peer_token_id FROM restap_network_policy_peers WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND policy_version = ? AND relation = 'allow'",
        [row.chain_id, row.collection, row.token_id, row.custody_generation, row.policy_version],
      ).map((entry) => entry.peer_token_id));
      const blockedPeers = new Set(tx.all(
        "SELECT peer_token_id FROM restap_network_policy_peers WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND policy_version = ? AND relation = 'block'",
        [row.chain_id, row.collection, row.token_id, row.custody_generation, row.policy_version],
      ).map((entry) => entry.peer_token_id));
      if (!topicEnabled(policy, row.topic)) return transition(tx, row, 'cancelled', timestamp);

      const eligible = candidates.filter((candidate) => peers.includes(candidate.tokenId)
        && allowedPeers.has(candidate.tokenId) && !blockedPeers.has(candidate.tokenId)
        && candidate.eligible && !candidate.blocked && !candidate.pairExhausted && !candidate.alreadyActive
        && candidate.topics.includes(row.topic));
      if (eligible.length === 0) return Object.freeze({ status: 'unavailable' });
      eligible.sort((left, right) => compareTokenIds(left.tokenId, right.tokenId));
      const cursor = Number(row.selection_cursor);
      const selected = eligible[cursor % eligible.length];
      const nextCursor = cursor + 1;
      const attempt = Number(row.attempt_count) + 1;
      const nextEligibleAt = row.source === 'daily' ? nextDailyOccurrence(Number(row.earliest_at), timestamp) : Number(row.next_eligible_at);
      tx.run("UPDATE restap_network_intents SET status = 'leased', selection_cursor = ?, attempt_count = ?, next_eligible_at = ?, updated_at = ? WHERE intent_id = ? AND status = 'pending'", [nextCursor, attempt, nextEligibleAt, timestamp, intentId]);
      return deepFreeze({
        status: 'acquired', intentId, source: row.source, peerTokenId: selected.tokenId, topic: row.topic,
        selectionCursor: nextCursor, attempt, nextEligibleAt,
        authority: authorityProjection(row),
      });
    });
  }

  function settle(value) {
    exactObject(value, ['intentId', 'authority', 'outcome'], 'RESTAP network intent settlement');
    const intentId = opaqueId(value.intentId);
    const authority = normalizeAuthority(value.authority);
    if (!OUTCOMES.has(value.outcome)) throw new TypeError('RESTAP network intent outcome is invalid.');
    const timestamp = clock(now());
    return store.transaction('intent_settle', (tx) => {
      const row = tx.get('SELECT * FROM restap_network_intents WHERE intent_id = ?', [intentId]);
      if (!row) throw new Error('RESTAP network intent is unavailable.');
      if (row.status !== 'leased') throw new Error('RESTAP network intent is not leased.');
      if (!authorityMatches(row, authority) || !currentAuthorityMatches(tx, row, timestamp)) return transition(tx, row, 'cancelled', timestamp);
      let status;
      if (value.outcome === 'cancelled') status = 'cancelled';
      else if (value.outcome === 'succeeded') status = row.source === 'daily' && Number(row.next_eligible_at) < Number(row.expires_at) ? 'pending' : 'completed';
      else status = Number(row.attempt_count) >= Number(row.attempt_limit) ? 'exhausted' : 'pending';
      tx.run('UPDATE restap_network_intents SET status = ?, updated_at = ? WHERE intent_id = ? AND status = ?', [status, timestamp, intentId, 'leased']);
      return project({ ...row, status, updated_at: timestamp });
    });
  }

  function get(intentId) {
    const row = store.readOne('SELECT * FROM restap_network_intents WHERE intent_id = ?', [opaqueId(intentId)]);
    return row ? project(row) : null;
  }

  return Object.freeze({ create, acquire, settle, get });
}

function requireCurrentAuthority(tx, authority, timestamp) {
  const custody = tx.get('SELECT generation, status FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1', [authority.chainId, authority.collection, authority.tokenId]);
  if (!custody || custody.status !== 'ready' || Number(custody.generation) !== authority.custodyGeneration) throw new Error('RESTAP network intent custody authority is stale.');
  const lease = tx.get("SELECT * FROM restap_network_activation_leases WHERE lease_id = ? AND status = 'active' AND expires_at > ?", [authority.activationLeaseId, timestamp]);
  if (!lease || Number(lease.chain_id) !== authority.chainId || lease.collection !== authority.collection || lease.token_id !== authority.tokenId || Number(lease.custody_generation) !== authority.custodyGeneration) throw new Error('RESTAP network intent activation lease is stale.');
  const policy = tx.get('SELECT * FROM restap_network_owner_policies WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? ORDER BY policy_version DESC LIMIT 1', [authority.chainId, authority.collection, authority.tokenId, authority.custodyGeneration]);
  if (!policy || Number(policy.policy_version) !== authority.policyVersion || !Number(policy.network_enabled) || !Number(policy.autonomous_enabled) || (policy.mute_until !== null && Number(policy.mute_until) > timestamp)) throw new Error('RESTAP network intent policy is stale or closed.');
  return policy;
}

function currentAuthorityMatches(tx, row, timestamp) {
  try {
    requireCurrentAuthority(tx, authorityProjection(row), timestamp);
    return true;
  } catch {
    return false;
  }
}

function assertPolicyApproval(tx, policy, authority, peers, topic) {
  if (!topicEnabled(policy, topic)) throw new Error('RESTAP network intent topic is outside owner-approved topics.');
  const rows = tx.all('SELECT peer_token_id, relation FROM restap_network_policy_peers WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND policy_version = ?', [authority.chainId, authority.collection, authority.tokenId, authority.custodyGeneration, authority.policyVersion]);
  const allowed = new Set(rows.filter((row) => row.relation === 'allow').map((row) => row.peer_token_id));
  const blocked = new Set(rows.filter((row) => row.relation === 'block').map((row) => row.peer_token_id));
  if (peers.some((peer) => !allowed.has(peer) || blocked.has(peer))) throw new Error('RESTAP network intent target is outside the owner-approved peer set.');
}

function joinExisting(row, expected) {
  if (!authorityMatches(row, expected.authority)
    || row.source !== expected.source || row.topic !== expected.topic || row.peer_set_digest !== expected.peerSetDigest
    || Number(row.earliest_at) !== expected.runAt || Number(row.expires_at) !== expected.expiresAt || Number(row.attempt_limit) !== expected.attemptLimit) {
    throw new Error('RESTAP network intent idempotency conflict.');
  }
  return deepFreeze({ ...project(row), joined: true });
}

function transition(tx, row, status, timestamp) {
  tx.run('UPDATE restap_network_intents SET status = ?, updated_at = ? WHERE intent_id = ?', [status, timestamp, row.intent_id]);
  return Object.freeze({ status });
}

function normalizeAuthority(value) {
  exactObject(value, ['chainId', 'collection', 'tokenId', 'custodyGeneration', 'activationLeaseId', 'policyVersion'], 'RESTAP network intent authority');
  return Object.freeze({
    chainId: integer(value.chainId, 'Authority chain ID', 1),
    collection: getAddress(value.collection),
    tokenId: normalizeRestapNetworkTokenId(value.tokenId),
    custodyGeneration: integer(value.custodyGeneration, 'Authority custody generation', 0),
    activationLeaseId: boundedString(value.activationLeaseId, 'Authority activation lease ID', 16, 256),
    policyVersion: integer(value.policyVersion, 'Authority policy version', 0),
  });
}

function authorityProjection(row) {
  return Object.freeze({
    chainId: Number(row.chain_id), collection: row.collection, tokenId: row.token_id,
    custodyGeneration: Number(row.custody_generation), activationLeaseId: row.activation_lease_id,
    policyVersion: Number(row.policy_version),
  });
}

function authorityMatches(row, authority) {
  return Number(row.chain_id) === authority.chainId && row.collection === authority.collection && row.token_id === authority.tokenId
    && Number(row.custody_generation) === authority.custodyGeneration && row.activation_lease_id === authority.activationLeaseId
    && Number(row.policy_version) === authority.policyVersion;
}

function normalizePeerSet(values, selfTokenId) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 256) throw new TypeError('RESTAP network intent peer set is invalid.');
  const peers = [...new Set(values.map(normalizeRestapNetworkTokenId))].sort(compareTokenIds);
  if (peers.length !== values.length || peers.includes(selfTokenId)) throw new TypeError('RESTAP network intent peer set is invalid.');
  return Object.freeze(peers);
}

function normalizeCandidates(values, selfTokenId) {
  if (!Array.isArray(values) || values.length > 256) throw new TypeError('RESTAP network intent candidates are invalid.');
  const seen = new Set();
  return Object.freeze(values.map((value) => {
    exactObject(value, ['tokenId', 'eligible', 'blocked', 'pairExhausted', 'alreadyActive', 'topics'], 'RESTAP network intent candidate');
    const tokenId = normalizeRestapNetworkTokenId(value.tokenId);
    if (tokenId === selfTokenId || seen.has(tokenId)) throw new TypeError('RESTAP network intent candidate token is invalid.');
    seen.add(tokenId);
    for (const key of ['eligible', 'blocked', 'pairExhausted', 'alreadyActive']) if (typeof value[key] !== 'boolean') throw new TypeError('RESTAP network intent candidate flags are invalid.');
    if (!Array.isArray(value.topics) || value.topics.length > RESTAP_NETWORK_TOPICS.length) throw new TypeError('RESTAP network intent candidate topics are invalid.');
    const topics = [...new Set(value.topics)].sort();
    if (topics.length !== value.topics.length || topics.some((topic) => !RESTAP_NETWORK_TOPICS.includes(topic))) throw new TypeError('RESTAP network intent candidate topics are invalid.');
    return Object.freeze({ tokenId, eligible: value.eligible, blocked: value.blocked, pairExhausted: value.pairExhausted, alreadyActive: value.alreadyActive, topics: Object.freeze(topics) });
  }));
}

function topicEnabled(policy, topic) {
  const index = RESTAP_NETWORK_TOPICS.indexOf(topic);
  return index >= 0 && (Number(policy.topic_mask) & (1 << index)) !== 0;
}

function nextDailyOccurrence(earliestAt, timestamp) {
  const periods = Math.floor((timestamp - earliestAt) / DAY_MS) + 1;
  return earliestAt + Math.max(1, periods) * DAY_MS;
}

function project(row) {
  return deepFreeze({
    intentId: row.intent_id, source: row.source, topic: row.topic, selectionCursor: Number(row.selection_cursor),
    earliestAt: Number(row.earliest_at), expiresAt: Number(row.expires_at), attemptCount: Number(row.attempt_count),
    attemptLimit: Number(row.attempt_limit), nextEligibleAt: Number(row.next_eligible_at), status: row.status,
    authority: authorityProjection(row),
  });
}

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function compareTokenIds(left, right) { const a = BigInt(left); const b = BigInt(right); return a < b ? -1 : a > b ? 1 : 0; }
function clock(value) { return integer(value, 'Intent clock', 0); }
function opaqueId(value) { return boundedString(value, 'Intent ID', 8, 256); }
function boundedString(value, label, minimum, maximum) { if (typeof value !== 'string' || value.length < minimum || value.length > maximum || [...value].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) throw new TypeError(label + ' is invalid.'); return value; }
function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(label + ' is invalid.'); return value; }

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be a plain object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(label + ' must be a plain object without a prototype.');
  const actual = Reflect.ownKeys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(label + ' must contain the exact allowed fields.');
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) throw new TypeError(label + ' fields must be enumerable data properties.');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

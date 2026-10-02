import { getAddress } from 'viem';

import { RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkPolicyInput, normalizeRestapNetworkTokenId } from './schema.js';

const MAX_MUTE_MS = 7 * 24 * 60 * 60_000;

export function createRestapNetworkPolicyStore({
  store,
  now = Date.now,
  tokenScopeDigest,
  onAtomicStop = () => {},
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function' || typeof store.readAll !== 'function') throw new TypeError('Policy store requires the RESTAP network store.');
  if (typeof now !== 'function') throw new TypeError('Policy store clock is invalid.');
  if (typeof tokenScopeDigest !== 'function') throw new TypeError('Policy store requires a keyed token scope digest.');
  if (typeof onAtomicStop !== 'function') throw new TypeError('Policy stop callback must be a function.');

  function get({ custody } = {}) {
    const authority = requireCurrentCustody(store, custody);
    const row = latestPolicy(authority);
    return row ? materialize(row, authority) : closedDefault(authority.generation);
  }

  function put({ custody, owner, expectedVersion, policy } = {}) {
    const authority = requireOwner(store, custody, owner);
    const expected = version(expectedVersion);
    const normalized = normalizeRestapNetworkPolicyInput({ expected_policy_version: expected, ...policy }, { selfTokenId: authority.tokenId });
    const muteUntil = normalized.mute_until === null ? null : Date.parse(normalized.mute_until);
    const timestamp = clock(now);
    if (muteUntil !== null && (muteUntil < timestamp || muteUntil > timestamp + MAX_MUTE_MS)) throw new TypeError('Policy mute_until exceeds the maximum mute window.');
    const nextVersion = expected + 1;
    store.transaction('owner_policy_put', (tx) => {
      assertCurrentCustody(tx, authority);
      assertExpectedVersion(tx, authority, expected);
      insertPolicy(tx, authority, nextVersion, normalized, muteUntil, timestamp);
    });
    return get({ custody: authority });
  }

  function stop({ custody, owner, expectedVersion } = {}) {
    const authority = requireOwner(store, custody, owner);
    const expected = version(expectedVersion);
    const nextVersion = expected + 1;
    const timestamp = clock(now);
    const scopeDigest = String(tokenScopeDigest(authority)).toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(scopeDigest)) throw new TypeError('Token scope digest must be a 32-byte lowercase hex digest.');
    store.transaction('owner_policy_stop', (tx) => {
      assertCurrentCustody(tx, authority);
      assertExpectedVersion(tx, authority, expected);
      insertClosedPolicy(tx, authority, nextVersion, timestamp);
      tx.run(
        "UPDATE restap_network_activation_leases SET status = 'deactivated', deactivated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND status IN ('active','candidate')",
        [timestamp, authority.chainId, authority.collection, authority.tokenId],
      );
      tx.run(
        "UPDATE restap_network_intents SET status = 'cancelled', updated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND status IN ('pending','leased')",
        [timestamp, authority.chainId, authority.collection, authority.tokenId],
      );
      tx.run(
        "UPDATE restap_network_operations SET status = 'released', terminal_at = ?, updated_at = ? WHERE status = 'reserved' AND ((sender_token_id = ? AND sender_custody_generation = ?) OR (recipient_token_id = ? AND recipient_custody_generation = ?))",
        [timestamp, timestamp, authority.tokenId, authority.generation, authority.tokenId, authority.generation],
      );
      tx.run(
        "UPDATE restap_network_operations SET status = 'cancelled_charged', terminal_at = ?, updated_at = ? WHERE status = 'provider_dispatched' AND ((sender_token_id = ? AND sender_custody_generation = ?) OR (recipient_token_id = ? AND recipient_custody_generation = ?))",
        [timestamp, timestamp, authority.tokenId, authority.generation, authority.tokenId, authority.generation],
      );
      const currentBreaker = tx.get("SELECT generation FROM restap_network_circuit_breakers WHERE scope_class = 'token' AND scope_digest = ?", [scopeDigest]);
      const breakerGeneration = Number(currentBreaker?.generation ?? 0) + 1;
      tx.run(
        "INSERT INTO restap_network_circuit_breakers (breaker_id, scope_class, scope_digest, state, generation, reason_class, opened_at, updated_at) VALUES (?, 'token', ?, 'open', ?, 'owner_stop', ?, ?) ON CONFLICT(scope_class, scope_digest) DO UPDATE SET state = 'open', generation = excluded.generation, reason_class = excluded.reason_class, opened_at = excluded.opened_at, updated_at = excluded.updated_at",
        ['token:' + scopeDigest, scopeDigest, breakerGeneration, timestamp, timestamp],
      );
      const callbackResult = onAtomicStop(Object.freeze({ tx: Object.freeze({ run: tx.run }), custody: authority, policyVersion: nextVersion, breakerGeneration, timestamp }));
      if (callbackResult && typeof callbackResult.then === 'function') throw new TypeError('Policy stop callback must be synchronous.');
    });
    return get({ custody: authority });
  }

  function latestPolicy(authority) {
    return store.readOne(
      'SELECT * FROM restap_network_owner_policies WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? ORDER BY policy_version DESC LIMIT 1',
      [authority.chainId, authority.collection, authority.tokenId, authority.generation],
    );
  }

  function materialize(row, authority) {
    const peers = store.readAll(
      'SELECT peer_token_id, relation FROM restap_network_policy_peers WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND policy_version = ? ORDER BY peer_token_id, relation',
      [authority.chainId, authority.collection, authority.tokenId, authority.generation, Number(row.policy_version)],
    );
    const allowTokenIds = peers.filter((peer) => peer.relation === 'allow').map((peer) => peer.peer_token_id);
    const blockTokenIds = peers.filter((peer) => peer.relation === 'block').map((peer) => peer.peer_token_id);
    return freezePolicy({
      policyVersion: Number(row.policy_version),
      custodyGeneration: authority.generation,
      networkEnabled: Boolean(row.network_enabled),
      inboundEnabled: Boolean(row.inbound_enabled),
      autonomousEnabled: Boolean(row.autonomous_enabled),
      initiatedDailyLimit: Number(row.initiated_daily_limit),
      generatedDailyLimit: Number(row.generated_daily_limit),
      peerDailyLimit: Number(row.peer_daily_limit),
      topics: decodeTopics(Number(row.topic_mask)),
      allowTokenIds,
      blockTokenIds,
      muteUntil: row.mute_until === null ? null : Number(row.mute_until),
      transcriptCapability: 'unavailable',
    });
  }

  return Object.freeze({ get, put, stop });
}

function requireOwner(store, custody, owner) {
  const authority = requireCurrentCustody(store, custody);
  let wallet;
  try { wallet = getAddress(owner); } catch { throw new TypeError('Policy writer must be the current owner.'); }
  if (wallet !== authority.owner) throw new Error('Policy writer must be the current owner.');
  return authority;
}

function requireCurrentCustody(store, value) {
  if (!isPlainObject(value)) throw new TypeError('Policy custody snapshot must be a plain object.');
  const chainId = positiveInteger(value.chainId, 'Custody chain ID');
  const collection = getAddress(value.collection);
  const tokenId = normalizeRestapNetworkTokenId(String(value.tokenId ?? ''));
  const generation = version(value.generation);
  const canonicalAccount = getAddress(value.canonicalAccount);
  const owner = getAddress(value.owner);
  const controller = getAddress(value.controller);
  if (value.status !== 'ready') throw new Error('Policy custody must be ready.');
  const current = store.readOne(
    'SELECT generation, canonical_account, owner_address, controller_address, status FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1',
    [chainId, collection, tokenId],
  );
  if (!current || current.status !== 'ready' || Number(current.generation) !== generation
    || getAddress(current.canonical_account) !== canonicalAccount || getAddress(current.owner_address) !== owner
    || getAddress(current.controller_address) !== controller) throw new Error('Policy custody snapshot is not current.');
  return Object.freeze({ chainId, collection, tokenId, generation, canonicalAccount, owner, controller, status: 'ready' });
}

function assertCurrentCustody(tx, authority) {
  const current = tx.get(
    'SELECT generation, canonical_account, owner_address, controller_address, status FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1',
    [authority.chainId, authority.collection, authority.tokenId],
  );
  if (!current || current.status !== 'ready' || Number(current.generation) !== authority.generation
    || getAddress(current.canonical_account) !== authority.canonicalAccount || getAddress(current.owner_address) !== authority.owner
    || getAddress(current.controller_address) !== authority.controller) throw new Error('Policy custody changed before commit.');
}

function assertExpectedVersion(tx, authority, expected) {
  const current = tx.get(
    'SELECT MAX(policy_version) AS policy_version FROM restap_network_owner_policies WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ?',
    [authority.chainId, authority.collection, authority.tokenId, authority.generation],
  );
  if (Number(current?.policy_version ?? 0) !== expected) throw new Error('Policy version conflict.');
}

function insertPolicy(tx, authority, policyVersion, normalized, muteUntil, timestamp) {
  tx.run(
    'INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [authority.chainId, authority.collection, authority.tokenId, authority.generation, policyVersion, Number(normalized.network_enabled), Number(normalized.inbound_enabled), Number(normalized.autonomous_initiation_enabled), normalized.daily_initiated_conversation_limit, normalized.daily_generated_message_limit, normalized.per_peer_daily_limit, encodeTopics(normalized.topics), muteUntil, timestamp, timestamp],
  );
  for (const [relation, peers] of [['allow', normalized.allow_peer_token_ids], ['block', normalized.block_peer_token_ids]]) {
    for (const peer of peers) tx.run(
      'INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [authority.chainId, authority.collection, authority.tokenId, authority.generation, policyVersion, peer, relation],
    );
  }
}

function insertClosedPolicy(tx, authority, policyVersion, timestamp) {
  tx.run(
    'INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)',
    [authority.chainId, authority.collection, authority.tokenId, authority.generation, policyVersion, timestamp, timestamp],
  );
}

function closedDefault(custodyGeneration) {
  return freezePolicy({ policyVersion: 0, custodyGeneration, networkEnabled: false, inboundEnabled: false, autonomousEnabled: false, initiatedDailyLimit: 0, generatedDailyLimit: 0, peerDailyLimit: 0, topics: [], allowTokenIds: [], blockTokenIds: [], muteUntil: null, transcriptCapability: 'unavailable' });
}

function freezePolicy(value) {
  value.topics = Object.freeze([...value.topics]);
  value.allowTokenIds = Object.freeze([...value.allowTokenIds]);
  value.blockTokenIds = Object.freeze([...value.blockTokenIds]);
  return Object.freeze(value);
}

function encodeTopics(topics) {
  return topics.reduce((mask, topic) => mask | (1 << RESTAP_NETWORK_TOPICS.indexOf(topic)), 0);
}

function decodeTopics(mask) {
  return RESTAP_NETWORK_TOPICS.filter((_, index) => (mask & (1 << index)) !== 0).sort();
}

function clock(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Policy clock is invalid.');
  return value;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Policy version or custody generation is invalid.');
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' is invalid.');
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

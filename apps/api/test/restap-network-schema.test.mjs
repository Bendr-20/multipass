import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESTAP_NETWORK_CADENCES,
  RESTAP_NETWORK_LIMITS,
  RESTAP_NETWORK_TOPICS,
} from '../src/restap-network/constants.js';
import {
  normalizeRestapNetworkDiscovery,
  normalizeRestapNetworkGrantHeader,
  normalizeRestapNetworkGrantPayload,
  normalizeRestapNetworkIntentCancel,
  normalizeRestapNetworkIntentInput,
  normalizeRestapNetworkMessageEnvelope,
  normalizeRestapNetworkOperationOutcome,
  normalizeRestapNetworkPolicyInput,
  normalizeRestapNetworkStatusClass,
  normalizeRestapNetworkStopInput,
  normalizeRestapNetworkTokenId,
} from '../src/restap-network/schema.js';

const ID = 'AbcdEFGHijklMNOPqrstUVWXyz0123456789_-';
const HASH = 'a'.repeat(64);
const TIME = '2026-10-02T00:00:00.000Z';

function rejectsExtra(normalize, value) {
  assert.throws(() => normalize({ ...value, surprise: true }), /unknown key/i);
}

test('network constants freeze exact platform maxima and closed taxonomies', () => {
  assert.deepEqual(RESTAP_NETWORK_LIMITS, {
    initiatedPerTokenDay: 10,
    generatedPerTokenDay: 30,
    initiatedPerOrderedPairDay: 5,
    replyRounds: 3,
    concurrentPerToken: 2,
    activeDeliveriesPerConversation: 1,
    messageBytes: 2_000,
    storedMessages: 12,
    conversationTtlMs: 30 * 60_000,
    grantTtlMs: 2 * 60_000,
    activationLeaseTtlMs: 24 * 60 * 60_000,
    minimumWorkerCadenceMs: 60_000,
    replayRetentionMs: 48 * 60 * 60_000,
    quotaRetentionMs: 8 * 24 * 60 * 60_000,
    terminalOperationRetentionMs: 30 * 24 * 60 * 60_000,
    redactedAuditRetentionMs: 30 * 24 * 60 * 60_000,
    pilotUnknownChargeBudget: 0,
    finalizedHeadSkewBlocks: 2,
  });
  assert.deepEqual(RESTAP_NETWORK_CADENCES, ['once', 'daily']);
  assert.deepEqual(RESTAP_NETWORK_TOPICS, [
    'collection-lore', 'trait-discussion', 'market-observation',
    'project-updates', 'collaboration-ideas', 'general',
  ]);
  assert.equal(Object.isFrozen(RESTAP_NETWORK_LIMITS), true);
  assert.equal(Object.isFrozen(RESTAP_NETWORK_CADENCES), true);
  assert.equal(Object.isFrozen(RESTAP_NETWORK_TOPICS), true);
});

test('canonical token IDs reject aliases and unsafe values', () => {
  assert.equal(normalizeRestapNetworkTokenId('0'), '0');
  assert.equal(normalizeRestapNetworkTokenId('7777'), '7777');
  for (const value of [0, 1, '', '00', '01', '-1', '+1', '1.0', ' 1', (2n ** 256n).toString()]) {
    assert.throws(() => normalizeRestapNetworkTokenId(value), /token/i);
  }
});

test('policy input is exact, lower-only, sorted, deduplicated, and frozen', () => {
  const value = {
    expected_policy_version: 7,
    network_enabled: true,
    inbound_enabled: true,
    autonomous_initiation_enabled: false,
    daily_initiated_conversation_limit: 3,
    daily_generated_message_limit: 12,
    per_peer_daily_limit: 2,
    topics: ['general', 'collection-lore'],
    allow_peer_token_ids: ['3', '2'],
    block_peer_token_ids: ['8'],
    mute_until: TIME,
  };
  const result = normalizeRestapNetworkPolicyInput(value, { selfTokenId: '1' });
  assert.deepEqual(result.topics, ['collection-lore', 'general']);
  assert.deepEqual(result.allow_peer_token_ids, ['2', '3']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.topics), true);
  rejectsExtra((input) => normalizeRestapNetworkPolicyInput(input, { selfTokenId: '1' }), value);
  const { topics: _omitted, ...missingTopics } = value;
  assert.throws(() => normalizeRestapNetworkPolicyInput(missingTopics, { selfTokenId: '1' }), /missing required key/i);
  for (const invalid of [
    { ...value, expected_policy_version: -1 },
    { ...value, daily_initiated_conversation_limit: 11 },
    { ...value, daily_generated_message_limit: 31 },
    { ...value, per_peer_daily_limit: 6 },
    { ...value, topics: ['arbitrary'] },
    { ...value, topics: ['general', 'general'] },
    { ...value, allow_peer_token_ids: ['1'] },
    { ...value, allow_peer_token_ids: ['2'], block_peer_token_ids: ['2'] },
    { ...value, mute_until: '2026-10-02T00:00:00Z' },
  ]) assert.throws(() => normalizeRestapNetworkPolicyInput(invalid, { selfTokenId: '1' }));
});

test('intent, cancellation, and stop inputs are exact and closed', () => {
  const intent = {
    peer_token_ids: ['3', '2'], topic: 'general', cadence: 'daily', run_at: TIME, idempotency_key: ID,
  };
  assert.deepEqual(normalizeRestapNetworkIntentInput(intent, { selfTokenId: '1' }), {
    ...intent, peer_token_ids: ['2', '3'],
  });
  rejectsExtra((input) => normalizeRestapNetworkIntentInput(input, { selfTokenId: '1' }), intent);
  for (const invalid of [
    { ...intent, peer_token_ids: [] },
    { ...intent, peer_token_ids: ['1'] },
    { ...intent, peer_token_ids: ['2', '2'] },
    { ...intent, topic: 'anything' },
    { ...intent, cadence: 'hourly' },
    { ...intent, cadence: '*/5 * * * *' },
    { ...intent, run_at: '2026-10-02T00:00:00Z' },
    { ...intent, idempotency_key: 'short' },
  ]) assert.throws(() => normalizeRestapNetworkIntentInput(invalid, { selfTokenId: '1' }));
  assert.deepEqual(normalizeRestapNetworkIntentCancel({ expected_policy_version: 2 }), { expected_policy_version: 2 });
  assert.deepEqual(normalizeRestapNetworkStopInput({ expected_policy_version: 2 }), { expected_policy_version: 2 });
  rejectsExtra(normalizeRestapNetworkIntentCancel, { expected_policy_version: 2 });
  rejectsExtra(normalizeRestapNetworkStopInput, { expected_policy_version: 2 });
});

test('internal discovery and message envelopes are exact, byte bounded, and frozen', () => {
  const discovery = {
    schema_version: '1', token_id: '2', canonical_name: 'Looper #2', canonical_image: 'https://helixa.xyz/2.png',
    restap_version: '0.1.4-beta', operations: ['opening', 'reply'], topics: ['general'],
    limits: { message_bytes: 2000, reply_rounds: 3 }, constraints: ['no-tools', 'no-wallet', 'no-private-memory'],
  };
  assert.deepEqual(normalizeRestapNetworkDiscovery(discovery), {
    ...discovery, constraints: ['no-private-memory', 'no-tools', 'no-wallet'],
  });
  rejectsExtra(normalizeRestapNetworkDiscovery, discovery);
  const envelope = {
    schema_version: '1', operation_id: ID, conversation_id: ID + 'a', sender_token_id: '1', recipient_token_id: '2',
    topic: 'general', turn_index: 0, message: 'hello',
  };
  assert.deepEqual(normalizeRestapNetworkMessageEnvelope(envelope), envelope);
  rejectsExtra(normalizeRestapNetworkMessageEnvelope, envelope);
  assert.throws(() => normalizeRestapNetworkMessageEnvelope({ ...envelope, message: '💥'.repeat(501) }), /bytes/i);
  assert.throws(() => normalizeRestapNetworkMessageEnvelope({ ...envelope, sender_token_id: '2' }), /sender/i);
});

test('grant header and payload reject every authority mismatch surface structurally', () => {
  const header = { schema_version: '1', alg: 'Ed25519', kid: ID, typ: 'looper-communication-grant+jcs' };
  assert.deepEqual(normalizeRestapNetworkGrantHeader(header), header);
  rejectsExtra(normalizeRestapNetworkGrantHeader, header);
  assert.throws(() => normalizeRestapNetworkGrantHeader({ ...header, alg: 'none' }), /alg/i);
  const payload = {
    iss: 'helixa-restap-network', aud: 'helixa-restap-network-relay', chain_id: 8453,
    collection: '0x1649cd37f4748807b4882fc48765ba0b2affa94a', sender_token_id: '1',
    sender_account: '0x1111111111111111111111111111111111111111', sender_identity_id: '8004:1',
    sender_custody_epoch: 2, sender_activation_lease_id: ID, recipient_token_id: '2',
    recipient_custody_epoch: 4, recipient_activation_lease_id: ID + 'b', operation: 'opening',
    path: 'restap-network:opening', body_sha256: HASH, iat: 1790899200, nbf: 1790899200,
    exp: 1790899320, nonce: ID + 'c', operation_id: ID + 'd', correlation_id: ID + 'e',
    sender_policy_version: 7, recipient_policy_version: 9,
    reservation: { conversations: 1, messages: 1, concurrency_per_token: 1, cost_units: 10 },
  };
  assert.deepEqual(normalizeRestapNetworkGrantPayload(payload), payload);
  assert.equal(normalizeRestapNetworkGrantPayload({ ...payload, sender_identity_id: null }).sender_identity_id, null);
  rejectsExtra(normalizeRestapNetworkGrantPayload, payload);
  const hostileReservation = Object.create({ inherited: true });
  Object.assign(hostileReservation, payload.reservation);
  assert.throws(() => normalizeRestapNetworkGrantPayload({ ...payload, reservation: hostileReservation }), /plain object/i);
  assert.throws(() => normalizeRestapNetworkGrantPayload({ ...payload, exp: payload.iat + 121 }), /exp/i);
  assert.throws(() => normalizeRestapNetworkGrantPayload({ ...payload, path: 'restap-network:reply' }), /path/i);
});

test('operation outcomes and bounded status classes are closed', () => {
  for (const state of ['committed', 'released', 'charged_unknown', 'cancelled_charged', 'failed_charged']) {
    assert.deepEqual(normalizeRestapNetworkOperationOutcome({ state, reason: 'policy_changed' }), { state, reason: 'policy_changed' });
  }
  assert.throws(() => normalizeRestapNetworkOperationOutcome({ state: 'success', reason: 'anything' }));
  assert.equal(normalizeRestapNetworkStatusClass('unavailable'), 'unavailable');
  assert.throws(() => normalizeRestapNetworkStatusClass('wallet 0xsecret failed'));
});

test('all schema functions reject prototype-bearing inputs', () => {
  const hostile = Object.create({ inherited: true });
  hostile.expected_policy_version = 1;
  assert.throws(() => normalizeRestapNetworkStopInput(hostile), /plain object/i);
});

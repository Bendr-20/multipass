import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkPolicyStore } from '../src/restap-network/policy-store.js';

const COLLECTION = '0x' + '1'.repeat(40);
const ACCOUNT = '0x' + '2'.repeat(40);
const OWNER = '0x' + '3'.repeat(40);
const CONTROLLER = '0x' + '4'.repeat(40);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-policy-'));
  const store = createRestapNetworkDatabase({ filename: join(directory, 'network.sqlite') });
  const custody = Object.freeze({ chainId: 8453, collection: COLLECTION, tokenId: '1', generation: 1, canonicalAccount: ACCOUNT, owner: OWNER, controller: CONTROLLER, status: 'ready' });
  store.transaction('seed_custody', (tx) => tx.run(
    'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [8453, COLLECTION, '1', 1, ACCOUNT, OWNER, CONTROLLER, 100, 'a'.repeat(64), 99, 0, 'ready', 1_000],
  ));
  const events = [];
  const policies = createRestapNetworkPolicyStore({ store, now: () => 2_000, tokenScopeDigest: () => 'a'.repeat(64), onAtomicStop(input) { events.push(input); input.tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES ('stop', 'policy', 'ok', 2000)"); } });
  return { directory, store, custody, policies, events, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

function seedStopTargets(f, prefix = '') {
  const leaseId = prefix + 'lease';
  const intentId = prefix + 'intent';
  f.store.transaction('seed_stop_targets', (tx) => {
    tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [leaseId, 8453, COLLECTION, '1', 1, ACCOUNT, OWNER, CONTROLLER, 1_000, 1_000, 10_000, 'active']);
    tx.run('INSERT INTO restap_network_intents (intent_id, chain_id, collection, token_id, custody_generation, activation_lease_id, policy_version, source, topic, peer_set_digest, idempotency_key, earliest_at, expires_at, attempt_limit, next_eligible_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [intentId, 8453, COLLECTION, '1', 1, leaseId, 1, 'one_shot', 'general', 'b'.repeat(64), prefix + 'idem', 1_000, 10_000, 1, 1_000, 'pending', 1_000, 1_000]);
    for (const [suffix, status] of [['reserved', 'reserved'], ['dispatched', 'provider_dispatched']]) tx.run('INSERT INTO restap_network_operations (operation_id, operation_kind, status, sender_token_id, recipient_token_id, sender_custody_generation, recipient_custody_generation, sender_lease_id, recipient_lease_id, sender_policy_version, recipient_policy_version, gate_generation, safe_block_number, safe_block_hash, body_digest, reserved_conversations, reserved_messages, reserved_cost_units, created_at, updated_at, provider_dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [prefix + suffix, 'opening', status, '1', '2', 1, 1, leaseId, 'peer-lease', 1, 1, 0, 100, 'a'.repeat(64), 'c'.repeat(64), 1, 1, 1, 1_000, 1_000, status === 'provider_dispatched' ? 1_500 : null]);
  });
  return { leaseId, intentId, reservedId: prefix + 'reserved', dispatchedId: prefix + 'dispatched' };
}

function enabledPolicy(patch = {}) {
  return {
    network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false,
    daily_initiated_conversation_limit: 5, daily_generated_message_limit: 15, per_peer_daily_limit: 2,
    topics: ['general'], allow_peer_token_ids: ['2'], block_peer_token_ids: ['3'], mute_until: null,
    ...patch,
  };
}

test('closed defaults are custody scoped, immutable, and expose no transcript capability', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const policy = f.policies.get({ custody: f.custody });
  assert.deepEqual(policy, {
    policyVersion: 0, custodyGeneration: 1, networkEnabled: false, inboundEnabled: false, autonomousEnabled: false,
    initiatedDailyLimit: 0, generatedDailyLimit: 0, peerDailyLimit: 0, topics: [], allowTokenIds: [], blockTokenIds: [],
    muteUntil: null, transcriptCapability: 'unavailable',
  });
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.topics), true);
});

test('writes require current owner, exact custody epoch, and expected version', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.throws(() => f.policies.put({ custody: f.custody, owner: CONTROLLER, expectedVersion: 0, policy: enabledPolicy() }), /current owner/i);
  assert.throws(() => f.policies.put({ custody: { ...f.custody, generation: 2 }, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() }), /custody/i);
  const first = f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() });
  assert.equal(first.policyVersion, 1);
  assert.throws(() => f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() }), /version conflict/i);
});

test('policy normalization is closed, lower-only, sorted, and conflict free', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const saved = f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy({ topics: ['project-updates', 'general'], allow_peer_token_ids: ['9', '2'] }) });
  assert.deepEqual(saved.topics, ['general', 'project-updates']);
  assert.deepEqual(saved.allowTokenIds, ['2', '9']);
  for (const [patch, error] of [
    [{ daily_initiated_conversation_limit: 11 }, /bounded/i],
    [{ daily_generated_message_limit: 31 }, /bounded/i],
    [{ per_peer_daily_limit: 6 }, /bounded/i],
    [{ topics: ['unsafe'] }, /not allowed/i],
    [{ allow_peer_token_ids: ['1'] }, /sender token/i],
    [{ allow_peer_token_ids: ['2', '2'] }, /duplicates/i],
    [{ allow_peer_token_ids: ['2'], block_peer_token_ids: ['2'] }, /overlap/i],
    [{ transcript_capability: 'plaintext' }, /unknown/i],
  ]) assert.throws(() => f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 1, policy: enabledPolicy(patch) }), error);
});

test('a new custody generation starts closed and cannot inherit the prior owner policy', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() });
  const transferred = { ...f.custody, generation: 2, owner: '0x' + '5'.repeat(40), controller: '0x' + '5'.repeat(40) };
  f.store.transaction('seed_transfer', (tx) => tx.run(
    'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [8453, COLLECTION, '1', 2, ACCOUNT, transferred.owner, transferred.controller, 101, 'b'.repeat(64), 101, 0, 'ready', 2_000],
  ));
  const current = f.policies.get({ custody: transferred });
  assert.equal(current.policyVersion, 0);
  assert.equal(current.networkEnabled, false);
  assert.deepEqual(current.allowTokenIds, []);
});

test('mute bounds and inbound/autonomous flags persist exactly', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const saved = f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy({ inbound_enabled: false, autonomous_initiation_enabled: true, mute_until: new Date(2_000 + 7 * 86_400_000).toISOString() }) });
  assert.equal(saved.inboundEnabled, false);
  assert.equal(saved.autonomousEnabled, true);
  assert.equal(saved.muteUntil, 2_000 + 7 * 86_400_000);
  assert.throws(() => f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 1, policy: enabledPolicy({ mute_until: new Date(2_000 + 7 * 86_400_000 + 1).toISOString() }) }), /mute/i);
});

test('immediate stop bumps generation and performs cancellation work in the same transaction', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  f.policies.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() });
  const targets = seedStopTargets(f);
  const stopped = f.policies.stop({ custody: f.custody, owner: OWNER, expectedVersion: 1 });
  assert.equal(stopped.policyVersion, 2);
  assert.equal(stopped.networkEnabled, false);
  assert.equal(stopped.inboundEnabled, false);
  assert.equal(stopped.autonomousEnabled, false);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].policyVersion, 2);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_activation_leases WHERE lease_id = ?', [targets.leaseId]).status, 'deactivated');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', [targets.intentId]).status, 'cancelled');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [targets.reservedId]).status, 'released');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [targets.dispatchedId]).status, 'cancelled_charged');
  const breaker = f.store.readOne("SELECT state, generation, reason_class FROM restap_network_circuit_breakers WHERE scope_class = 'token'");
  assert.equal(breaker.state, 'open');
  assert.equal(breaker.generation, 1);
  assert.equal(breaker.reason_class, 'owner_stop');
  assert.equal(f.store.readOne("SELECT count(*) AS count FROM restap_network_audit_events WHERE event_id = 'stop'").count, 1);
});

test('failed atomic stop callback rolls back policy generation and every side effect', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const broken = createRestapNetworkPolicyStore({ store: f.store, now: () => 2_000, tokenScopeDigest: () => 'a'.repeat(64), onAtomicStop({ tx }) { tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES ('rollback', 'policy', 'ok', 2000)"); throw new Error('cancel failed'); } });
  broken.put({ custody: f.custody, owner: OWNER, expectedVersion: 0, policy: enabledPolicy() });
  const targets = seedStopTargets(f, 'rollback-');
  assert.throws(() => broken.stop({ custody: f.custody, owner: OWNER, expectedVersion: 1 }), /cancel failed/);
  assert.equal(broken.get({ custody: f.custody }).policyVersion, 1);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_activation_leases WHERE lease_id = ?', [targets.leaseId]).status, 'active');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', [targets.intentId]).status, 'pending');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [targets.reservedId]).status, 'reserved');
  assert.equal(f.store.readOne('SELECT status FROM restap_network_operations WHERE operation_id = ?', [targets.dispatchedId]).status, 'provider_dispatched');
  assert.equal(f.store.readOne("SELECT count(*) AS count FROM restap_network_circuit_breakers WHERE scope_class = 'token'").count, 0);
  assert.equal(f.store.readOne("SELECT count(*) AS count FROM restap_network_audit_events WHERE event_id = 'rollback'").count, 0);
});

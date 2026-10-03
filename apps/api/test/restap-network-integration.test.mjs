import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkCoordinator } from '../src/restap-network/coordinator.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkEligibilityResolver } from '../src/restap-network/eligibility.js';
import { createRestapNetworkIntentStore } from '../src/restap-network/intents.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 12);
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x1111111111111111111111111111111111111111';
const CONTROLLER = '0x2222222222222222222222222222222222222222';
const ACCOUNTS = Object.freeze({ '1': '0x3333333333333333333333333333333333333333', '2': '0x4444444444444444444444444444444444444444' });
const BLOCK_HASH = '0x' + 'ab'.repeat(32);
const HASH = 'a'.repeat(64);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-integration-'));
  const filename = join(directory, 'network.sqlite');
  let clock = NOW;
  let sequence = 0;
  const store = createRestapNetworkDatabase({ filename });
  const states = seed(store);
  const intents = createRestapNetworkIntentStore({
    store,
    now: () => clock,
    createId: () => 'integration-intent-' + String(++sequence).padStart(12, '0'),
    authenticateConsoleOwner: ({ ownerSession }) => ownerSession === 'AUTHENTICATED-OWNER-SESSION',
  });
  const metrics = [];
  const resolver = createRestapNetworkEligibilityResolver({
    now: () => clock,
    readCodexMembership: async ({ tokenId }) => structuredClone(states[tokenId].codex),
    deriveCanonicalAccount: ({ tokenId }) => ACCOUNTS[tokenId],
    readAccountIntegrity: async ({ tokenId }) => structuredClone(states[tokenId].integrity),
    readCustody: async ({ tokenId }) => structuredClone(states[tokenId].custody),
    readActivationLease: async ({ tokenId }) => structuredClone(states[tokenId].lease),
    readPolicy: async ({ tokenId }) => structuredClone(states[tokenId].policy),
    readPilotRoster: async ({ tokenId }) => states[tokenId].rostered,
    readGates: async ({ tokenId }) => structuredClone(states[tokenId].gates),
    readBreakers: async ({ tokenId }) => structuredClone(states[tokenId].breakers),
    recordMetric: (metric) => metrics.push(metric),
  });
  const coordinator = createRestapNetworkCoordinator({
    store,
    now: () => clock,
    createId: (kind) => kind + '-integration-' + String(++sequence).padStart(16, '0'),
    globalDailyCostLimit: 100,
  });
  return {
    directory, filename, store, states, intents, resolver, coordinator, metrics,
    setNow(value) { clock = value; },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

function seed(store) {
  const states = {};
  store.transaction('integration_seed', (tx) => {
    for (const tokenId of ['1', '2']) {
      const account = ACCOUNTS[tokenId];
      const leaseId = tokenId.repeat(32);
      tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, tokenId, 1, account, OWNER, CONTROLLER, 100, BLOCK_HASH.slice(2), 100, 0, 'ready', NOW]);
      tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [leaseId, 8453, COLLECTION, tokenId, 1, account, OWNER, CONTROLLER, NOW - 1_000, NOW - 500, NOW + DAY - 500, 'active']);
      tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, tokenId, 1, 1, 1, 1, 1, 10, 30, 5, 63, null, NOW, NOW]);
      const peer = tokenId === '1' ? '2' : '1';
      tx.run('INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, tokenId, 1, 1, peer, 'allow']);
      states[tokenId] = tokenState(tokenId, account, leaseId, peer);
    }
  });
  return states;
}

function tokenState(tokenId, account, leaseId, peer) {
  return {
    codex: { member: true, identityId: 'codex:' + tokenId },
    integrity: { eligible: true, status: 'ready', proof: { chainId: 8453, collection: COLLECTION, tokenId, account, owner: OWNER, controller: CONTROLLER, safeBlock: { number: 100, hash: BLOCK_HASH }, latest: { owner: OWNER, controller: CONTROLLER } } },
    custody: { chainId: 8453, collection: COLLECTION, tokenId, generation: 1, canonicalAccount: account, owner: OWNER, controller: CONTROLLER, safeBlockNumber: 100, safeBlockHash: BLOCK_HASH, status: 'ready' },
    lease: { leaseId, chainId: 8453, collection: COLLECTION, tokenId, custodyGeneration: 1, canonicalAccount: account, owner: OWNER, controller: CONTROLLER, issuedAt: NOW - 1_000, lastRenewedAt: NOW - 500, expiresAt: NOW + DAY - 500, status: 'active' },
    policy: { policyVersion: 1, custodyGeneration: 1, networkEnabled: true, inboundEnabled: true, autonomousEnabled: true, topics: ['general'], allowTokenIds: [peer], blockTokenIds: [], muteUntil: null },
    rostered: true,
    gates: { global: true, phase: true, collection: true, token: true, emergency: false },
    breakers: { global: 'closed', collection: 'closed', token: 'closed', pair: 'closed', provider: 'closed' },
  };
}

function authority() {
  return { chainId: 8453, collection: COLLECTION, tokenId: '1', custodyGeneration: 1, activationLeaseId: '1'.repeat(32), policyVersion: 1 };
}
function intentInput(cadence, idempotencyKey) {
  const runAt = NOW + 1_000;
  return {
    source: 'console_owner', ownerSession: 'AUTHENTICATED-OWNER-SESSION', authority: authority(),
    intent: { peer_token_ids: ['2'], topic: 'general', cadence, run_at: new Date(runAt).toISOString(), idempotency_key: idempotencyKey.padEnd(32, 'x') },
    expiresAt: runAt + (cadence === 'daily' ? 3 * DAY : DAY), attemptLimit: 3,
  };
}
function peerInput() { return { chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2', boundary: 'intent_lease' }; }
function candidate(eligible = true) { return [{ tokenId: '2', eligible, blocked: false, pairExhausted: false, alreadyActive: false, topics: ['general'] }]; }

test('two eligible opted-in Loopers execute one owner one-shot plus one daily occurrence with one bounded conversation and exact accounting', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const selfOne = await f.resolver.resolveSelfForConsole({ chainId: 8453, collection: COLLECTION, tokenId: '1', owner: OWNER, boundary: 'policy_mutation' });
  const selfTwo = await f.resolver.resolveSelfForConsole({ chainId: 8453, collection: COLLECTION, tokenId: '2', owner: OWNER, boundary: 'policy_mutation' });
  assert.equal(selfOne.status, 'eligible', JSON.stringify(selfOne));
  assert.equal(selfTwo.status, 'eligible', JSON.stringify(selfTwo));
  const eligible = await f.resolver.resolvePeerForRelay(peerInput());
  assert.equal(eligible.status, 'eligible', JSON.stringify({ eligible, metrics: f.metrics }));
  assert.deepEqual(eligible.topics, ['general']);

  const oneShot = f.intents.create(intentInput('once', 'integration-once'));
  const daily = f.intents.create(intentInput('daily', 'integration-daily'));
  f.setNow(NOW + 1_000);
  const acquire = (intentId) => f.intents.acquire({ intentId, authority: authority(), peerTokenIds: ['2'], candidates: candidate() });
  const oneOccurrence = acquire(oneShot.intentId);
  const dailyOccurrence = acquire(daily.intentId);
  assert.equal(oneOccurrence.status, 'acquired');
  assert.equal(dailyOccurrence.status, 'acquired');
  assert.equal(f.intents.settle({ intentId: oneShot.intentId, authority: authority(), outcome: 'succeeded' }).status, 'completed');
  assert.equal(f.intents.settle({ intentId: daily.intentId, authority: authority(), outcome: 'succeeded' }).status, 'pending');

  const snapshot = {
    bodyHash: HASH, gateGeneration: 1, recipientCustodyGeneration: 1, recipientLeaseId: f.states['2'].lease.leaseId,
    recipientPolicyVersion: 1, recipientTokenId: '2', safeBlockHash: HASH, safeBlockNumber: 100,
    senderCustodyGeneration: 1, senderLeaseId: f.states['1'].lease.leaseId, senderPolicyVersion: 1, senderTokenId: '1',
  };
  const operation = f.coordinator.reserve({ conversationId: 'integration-conversation-00000001', costUnits: 9, idempotencyKey: 'integration-operation-idempotency', nonce: 'integration-operation-nonce', operationKind: 'opening', snapshot, topic: 'general' });
  assert.equal(f.coordinator.markProviderDispatched({ operationId: operation.operationId, freshSnapshot: snapshot }).status, 'provider_dispatched');
  const committed = f.coordinator.commitAfterRecheck({ operationId: operation.operationId, freshSnapshot: snapshot, contentHash: createHash('sha256').update('bounded generated reply').digest('hex'), speakerClass: 'recipient' });
  assert.equal(committed.status, 'committed');
  assert.equal(f.coordinator.markDeliveryDelivered({ operationId: operation.operationId }).status, 'delivered');

  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_conversations').count, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries WHERE status = ?', ['delivered']).count, 1);
  const global = f.store.readOne("SELECT used_units, reserved_units FROM restap_network_quota_buckets WHERE scope_class = 'global'");
  assert.deepEqual({ used: global.used_units, reserved: global.reserved_units }, { used: 9, reserved: 0 });
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations WHERE status = ?', ['committed']).count, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_intents WHERE source = ?', ['daily']).count, 1);
});

test('all negative eligibility classes fail before inference with one unavailable projection', async (t) => {
  const cases = [
    ['ineligible', (s) => { s['2'].codex.member = false; }],
    ['expired', (s) => { s['2'].lease.expiresAt = NOW; }],
    ['inactive', (s) => { s['2'].lease.status = 'deactivated'; }],
    ['non-opted-in', (s) => { s['2'].policy.networkEnabled = false; }],
    ['blocked', (s) => { s['2'].policy.blockTokenIds = ['1']; }],
    ['transferred', (s) => { s['2'].custody.owner = '0x5555555555555555555555555555555555555555'; }],
    ['provider-disputed', (s) => { s['2'].custody.status = 'disputed'; }],
    ['wrong-code', (s) => { s['2'].integrity = { eligible: false, status: 'implementation_mismatch' }; }],
    ['external-identity', (s) => { s['2'].codex = { member: false, identityId: null }; }],
    ['unrostered', (s) => { s['2'].rostered = false; }],
    ['breaker-open', (s) => { s['2'].breakers.provider = 'open'; }],
    ['gate-off', (s) => { s['2'].gates.phase = false; }],
  ];
  for (const [name, mutate] of cases) {
    const f = await fixture(); t.after(() => f.close());
    mutate(f.states);
    const result = await f.resolver.resolvePeerForRelay(peerInput());
    assert.deepEqual(result, { status: 'unavailable' }, name);
    assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 0, name + ' must fail before inference/reservation');
  }
});

import assert from 'node:assert/strict';
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkCoordinator } from '../src/restap-network/coordinator.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkGrantService, createRestapNetworkPublicKeyRegistry } from '../src/restap-network/grants.js';
import {
  createDueOperation, createRestapNetworkRelay, deliverOpening, deliverReply,
  finalizeOperation, mintRelayGrant, readInternalDiscovery,
} from '../src/restap-network/relay.js';

const NOW_MS = Date.UTC(2026, 9, 2, 12);
const NOW_SECONDS = Math.floor(NOW_MS / 1_000);
const COLLECTION = '0x1649cd37f4748807b4882fc48765ba0b2affa94a';
const SENDER_ACCOUNT = '0x3333333333333333333333333333333333333333';
const RECIPIENT_ACCOUNT = '0x4444444444444444444444444444444444444444';
const KEY_ID = 'relay-key-00000000000000000000001';
const PRIVATE_KEY = createPrivateKey({ key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
const PUBLIC_DER = Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
const INTENT_ID = 'intent-authorized-00000000000000000001';
const OPERATION_ID = 'operation-00000000000000000000000000000001';
const CONVERSATION_ID = 'conversation-00000000000000000000000001';
const OPENING = 'PRIVATE-OPENING-SENTINEL: What story stands out?';
const GENERATED = 'PRIVATE-GENERATED-REPLY-SENTINEL';

function envelope({ operationId = OPERATION_ID, conversationId = CONVERSATION_ID, turnIndex = 0, message = OPENING, senderTokenId = '1', recipientTokenId = '2' } = {}) {
  return { schema_version: '1', operation_id: operationId, conversation_id: conversationId, sender_token_id: senderTokenId, recipient_token_id: recipientTokenId, topic: 'general', turn_index: turnIndex, message };
}

function dueIntent(patch = {}) {
  return {
    intentId: INTENT_ID,
    expectedPolicyVersion: 3,
    operation: 'opening',
    chainId: 8453,
    collection: COLLECTION,
    senderTokenId: '1',
    recipientTokenId: '2',
    topic: 'general',
    idempotencyKey: 'idempotency-000000000000000000001',
    correlationId: CONVERSATION_ID,
    nonce: 'nonce-000000000000000000000000001',
    costUnits: 9,
    canonicalBody: envelope(),
    ...patch,
  };
}

function createConversationAdapter(events, fault = null) {
  const records = new Map();
  let sequence = 0;
  return Object.freeze({
    open({ topic, opening }) {
      events.push('delivery:open');
      const value = { conversationId: CONVERSATION_ID, topic, turnCount: 1, nextSpeaker: 'recipient', status: 'active', messages: [{ speaker: 'sender', text: opening, turnIndex: 0, createdAt: NOW_MS }] };
      records.set(CONVERSATION_ID, value);
      fault?.('open');
      return structuredClone(value);
    },
    beginDelivery({ conversationId, speaker }) {
      events.push('delivery:begin');
      const value = records.get(conversationId);
      if (!value || value.nextSpeaker !== speaker) throw new Error('strict alternation');
      return { conversationId, deliveryId: 'delivery-' + String(++sequence).padStart(24, '0'), speaker };
    },
    abortDelivery() { events.push('delivery:abort'); },
    commitDelivery({ conversationId, output }) {
      events.push('delivery:commit');
      const value = records.get(conversationId);
      const speaker = value.nextSpeaker;
      value.messages.push({ speaker, text: output, turnIndex: value.messages.length, createdAt: NOW_MS });
      value.turnCount += 1;
      value.nextSpeaker = speaker === 'sender' ? 'recipient' : 'sender';
      fault?.('commit');
      return structuredClone(value);
    },
    get({ conversationId }) {
      const value = records.get(conversationId);
      if (!value) throw new Error('conversation not found');
      return structuredClone(value);
    },
    seed(value) { records.set(value.conversationId, structuredClone(value)); },
  });
}

async function fixture({ boundaryFault = null, boundaryAction = null, conversationFault = null, providerOutput = GENERATED, operation = 'opening', message = envelope() } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-relay-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const events = [];
  const kindCounts = new Map();
  const baseCoordinator = createRestapNetworkCoordinator({
    store,
    now: () => NOW_MS,
    createId(kind) {
      const count = (kindCounts.get(kind) ?? 0) + 1;
      kindCounts.set(kind, count);
      if (kind === 'operation') return 'operation-' + String(count).padStart(32, '0');
      return kind + '-' + String(count).padStart(32, '0');
    },
    globalDailyCostLimit: 1_000,
  });
  const coordinator = Object.freeze({
    reserve(input) { events.push('reserve'); return baseCoordinator.reserve(input); },
    getOperation: (id) => baseCoordinator.getOperation(id),
    dispatchProvider(input) { events.push('dispatch-marker'); return baseCoordinator.dispatchProvider(input); },
    release: (input) => baseCoordinator.release(input),
    markChargedUnknown: (input) => baseCoordinator.markChargedUnknown(input),
    markCancelledCharged: (input) => baseCoordinator.markCancelledCharged(input),
    markFailedCharged: (input) => baseCoordinator.markFailedCharged(input),
    commitAfterRecheck(input) { events.push('atomic-commit'); return baseCoordinator.commitAfterRecheck(input); },
    markDeliveryDelivered(input) { events.push('delivery-marker'); return baseCoordinator.markDeliveryDelivered(input); },
  });
  const registry = createRestapNetworkPublicKeyRegistry({ keys: [{ keyId: KEY_ID, algorithm: 'Ed25519', publicKey: PUBLIC_DER, activatesAt: NOW_SECONDS - 10, notBefore: NOW_SECONDS - 10, notAfter: NOW_SECONDS + 10_000, status: 'signing' }] });
  const grantService = createRestapNetworkGrantService({ signer: { keyId: KEY_ID, sign: async (bytes) => cryptoSign(null, bytes, PRIVATE_KEY) }, keyRegistry: registry, now: () => NOW_SECONDS });
  const authority = { available: true, senderCustodyGeneration: 7, recipientCustodyGeneration: 8, senderActivationLeaseId: '1'.repeat(32), recipientActivationLeaseId: '2'.repeat(32), senderPolicyVersion: 3, recipientPolicyVersion: 4, gateGeneration: 5, safeBlockNumber: 100, safeBlockHash: 'a'.repeat(64) };
  const eligibility = Object.freeze({ async resolvePeerForRelay(input) {
    events.push('eligibility:' + input.boundary);
    if (!authority.available) return { status: 'unavailable' };
    return { status: 'eligible', chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2', senderAccount: SENDER_ACCOUNT, recipientAccount: RECIPIENT_ACCOUNT, senderIdentityId: 'codex:1', recipientIdentityId: 'codex:2', senderCustodyGeneration: authority.senderCustodyGeneration, recipientCustodyGeneration: authority.recipientCustodyGeneration, senderActivationLeaseId: authority.senderActivationLeaseId, recipientActivationLeaseId: authority.recipientActivationLeaseId, senderPolicyVersion: authority.senderPolicyVersion, recipientPolicyVersion: authority.recipientPolicyVersion, topics: ['general'] };
  } });
  const conversations = createConversationAdapter(events, conversationFault);
  const providerCalls = [];
  const intent = dueIntent({ operation, canonicalBody: message, correlationId: message.conversation_id });
  let boundaryFailed = false;
  const relayOptions = {
    coordinator, grantService, eligibility, conversations,
    runtime: { async generate(input) { events.push('provider'); providerCalls.push(input); return providerOutput; } },
    now: () => NOW_MS,
    readBoundaryState: () => ({ gateGeneration: authority.gateGeneration, safeBlockNumber: authority.safeBlockNumber, safeBlockHash: authority.safeBlockHash }),
    readDiscovery: ({ tokenId }) => ({ tokenId, status: 'available' }),
    readDueIntent: async () => intent,
    onBoundary: boundaryFault || boundaryAction ? async (value) => {
      if (boundaryAction) await boundaryAction(value, conversations);
      if (!boundaryFailed && value.boundary === boundaryFault) { boundaryFailed = true; throw new Error('injected ' + boundaryFault); }
    } : null,
  };
  const relay = createRestapNetworkRelay(relayOptions);
  return { relay, relayOptions, intent, message, authority, events, providerCalls, store, baseCoordinator, coordinator, conversations, filename, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

async function reserveAndGrant(f) {
  const created = await f.relay.createDueOperation({ intentId: f.intent.intentId, expectedPolicyVersion: f.intent.expectedPolicyVersion });
  const grant = await f.relay.mintRelayGrant({ operationId: created.operationId, canonicalBody: f.message });
  return { created, grant };
}

test('exports typed same-process functions and owner-authorized exact creation contract', async (t) => {
  for (const value of [createDueOperation, mintRelayGrant, readInternalDiscovery, deliverOpening, deliverReply, finalizeOperation, createRestapNetworkRelay]) assert.equal(typeof value, 'function');
  const f = await fixture(); t.after(() => f.close());
  await assert.rejects(() => f.relay.createDueOperation({ intentId: INTENT_ID, expectedPolicyVersion: 3, senderTokenId: '9' }), /exact|unknown/i);
});

test('happy path orders boundaries and retries with one provider call and no transcript result', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  const first = await f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message });
  const retry = await f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message });
  assert.deepEqual(first, retry);
  assert.deepEqual(first, { status: 'delivered', operationId: OPERATION_ID, deliverySequence: 0 });
  assert.equal(f.providerCalls.length, 1);
  assert.equal(Object.hasOwn(first, 'conversation'), false);
  assert.deepEqual(f.events.filter((value) => ['reserve', 'eligibility:pre_dispatch', 'dispatch-marker', 'provider', 'eligibility:pre_commit', 'atomic-commit', 'delivery:open', 'delivery-marker'].includes(value)), ['reserve', 'eligibility:pre_dispatch', 'dispatch-marker', 'provider', 'eligibility:pre_commit', 'atomic-commit', 'delivery:open', 'delivery-marker']);
});

test('parallel deliveries are single-flight with one provider call, bill, and content mutation', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  const results = await Promise.all(Array.from({ length: 20 }, () => f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message })));
  assert.equal(results.every((value) => value.status === 'delivered'), true);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.events.filter((value) => value === 'delivery:commit').length, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 1);
});

test('grant and canonical envelope bind every durable authority and reservation field before inference', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  const tampered = [
    { ...grant, header: { ...grant.header, alg: 'none' } },
    { ...grant, payload: { ...grant.payload, aud: 'other' } },
    { ...grant, payload: { ...grant.payload, nonce: 'nonce-999999999999999999999999999' } },
    { ...grant, payload: { ...grant.payload, sender_activation_lease_id: '9'.repeat(32) } },
    { ...grant, payload: { ...grant.payload, recipient_custody_epoch: 99 } },
    { ...grant, payload: { ...grant.payload, sender_policy_version: 99 } },
    { ...grant, payload: { ...grant.payload, reservation: { ...grant.payload.reservation, cost_units: 99 } } },
  ];
  for (const invalid of tampered) await assert.rejects(() => f.relay.deliverOpening({ operationId: created.operationId, grant: invalid, message: f.message }), /authentication/i);
  await assert.rejects(() => f.relay.deliverOpening({ operationId: created.operationId, grant, message: { ...f.message, message: 'changed' } }), /authentication/i);
  assert.equal(f.providerCalls.length, 0);
  assert.equal(f.baseCoordinator.getOperation(created.operationId).status, 'reserved');
});

test('create and grant minting are single-flight under concurrency', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const created = await Promise.all(Array.from({ length: 20 }, () => f.relay.createDueOperation({ intentId: INTENT_ID, expectedPolicyVersion: 3 })));
  assert.equal(new Set(created.map((value) => value.operationId)).size, 1);
  assert.equal(f.events.filter((value) => value === 'reserve').length, 1);
  const grants = await Promise.all(Array.from({ length: 20 }, () => f.relay.mintRelayGrant({ operationId: OPERATION_ID, canonicalBody: f.message })));
  assert.equal(new Set(grants.map((value) => value.signature)).size, 1);
});

test('fresh relay instance joins the durable reservation without duplicate billing or delivery', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  await f.relay.createDueOperation({ intentId: INTENT_ID, expectedPolicyVersion: 3 });
  const restarted = createRestapNetworkRelay(f.relayOptions);
  const joined = await restarted.createDueOperation({ intentId: INTENT_ID, expectedPolicyVersion: 3 });
  assert.equal(joined.operationId, OPERATION_ID);
  assert.equal(joined.joined, true);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 1);
  const grant = await restarted.mintRelayGrant({ operationId: OPERATION_ID, canonicalBody: f.message });
  await restarted.deliverOpening({ operationId: OPERATION_ID, grant, message: f.message });
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 1);
});

test('conversation commit throw after mutation resumes without duplicate content or provider call', async (t) => {
  let failed = false;
  const f = await fixture({ conversationFault: (phase) => { if (phase === 'commit' && !failed) { failed = true; throw new Error('injected conversation commit'); } } });
  t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  await assert.rejects(() => f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message }), /injected conversation commit/);
  assert.equal(f.baseCoordinator.getOperation(created.operationId).status, 'committed');
  const result = await f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message });
  assert.equal(result.status, 'delivered');
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.conversations.get({ conversationId: CONVERSATION_ID }).turnCount, 2);
});

for (const boundary of ['after_commit', 'after_conversation_commit', 'before_delivery_marker']) {
  test('committed delivery resumes exactly once after ' + boundary + ' failure', async (t) => {
    const f = await fixture({ boundaryFault: boundary }); t.after(() => f.close());
    const { created, grant } = await reserveAndGrant(f);
    await assert.rejects(() => f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message }), /injected/);
    assert.equal(f.baseCoordinator.getOperation(created.operationId).status, 'committed');
    const result = await f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message });
    assert.equal(result.status, 'delivered');
    assert.equal(f.providerCalls.length, 1);
    assert.equal(f.events.filter((value) => value === 'delivery:commit').length, 1);
    assert.equal(f.events.filter((value) => value === 'delivery-marker').length, 1);
  });
}

test('malformed provider output terminalizes post-dispatch without content delivery', async (t) => {
  const f = await fixture({ providerOutput: { status: 'already_committed' } }); t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  await assert.rejects(() => f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message }), /text-only|string/i);
  assert.equal(f.baseCoordinator.getOperation(created.operationId).status, 'charged_unknown');
  assert.equal(f.events.some((value) => value.startsWith('delivery:')), false);
});

test('reply binds an immutable transcript turn and speaker', async (t) => {
  const replyMessage = envelope({ turnIndex: 1, message: 'first reply', senderTokenId: '2', recipientTokenId: '1' });
  const f = await fixture({ operation: 'reply', message: replyMessage }); t.after(() => f.close());
  f.conversations.seed({ conversationId: CONVERSATION_ID, topic: 'general', turnCount: 2, nextSpeaker: 'sender', status: 'active', messages: [{ speaker: 'sender', text: 'opening', turnIndex: 0, createdAt: NOW_MS }, { speaker: 'recipient', text: 'first reply', turnIndex: 1, createdAt: NOW_MS }] });
  const { created, grant } = await reserveAndGrant(f);
  const result = await f.relay.deliverReply({ operationId: created.operationId, grant, message: replyMessage });
  assert.equal(result.status, 'delivered');
  assert.equal(f.providerCalls.length, 1);
});

test('reply transcript advance during inference fails charged with no stale delivery', async (t) => {
  const replyMessage = envelope({ turnIndex: 1, message: 'first reply', senderTokenId: '2', recipientTokenId: '1' });
  let mutated = false;
  const f = await fixture({ operation: 'reply', message: replyMessage, boundaryAction: ({ boundary }, conversations) => {
    if (boundary === 'during_inference' && !mutated) {
      mutated = true;
      conversations.seed({ conversationId: CONVERSATION_ID, topic: 'general', turnCount: 3, nextSpeaker: 'recipient', status: 'active', messages: [{ speaker: 'sender', text: 'opening', turnIndex: 0, createdAt: NOW_MS }, { speaker: 'recipient', text: 'first reply', turnIndex: 1, createdAt: NOW_MS }, { speaker: 'sender', text: 'advanced', turnIndex: 2, createdAt: NOW_MS }] });
    }
  } });
  t.after(() => f.close());
  f.conversations.seed({ conversationId: CONVERSATION_ID, topic: 'general', turnCount: 2, nextSpeaker: 'sender', status: 'active', messages: [{ speaker: 'sender', text: 'opening', turnIndex: 0, createdAt: NOW_MS }, { speaker: 'recipient', text: 'first reply', turnIndex: 1, createdAt: NOW_MS }] });
  const { created, grant } = await reserveAndGrant(f);
  await assert.rejects(() => f.relay.deliverReply({ operationId: created.operationId, grant, message: replyMessage }), /state changed/i);
  assert.equal(f.baseCoordinator.getOperation(created.operationId).status, 'failed_charged');
  assert.equal(f.events.filter((value) => value === 'delivery:commit').length, 0);
});

test('discovery is read-only and finalize releases without provider, generated-message, or delivery accounting', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { created } = await reserveAndGrant(f);
  const before = f.store.readOne('SELECT reserved_units, used_units FROM restap_network_quota_buckets WHERE scope_class = ? ORDER BY bucket_id LIMIT 1', ['global']);
  const result = await f.relay.readInternalDiscovery({ operationId: created.operationId, recipientTokenId: '2' });
  assert.deepEqual(result.discovery, { tokenId: '2', status: 'available' });
  const after = f.store.readOne('SELECT reserved_units, used_units FROM restap_network_quota_buckets WHERE scope_class = ? ORDER BY bucket_id LIMIT 1', ['global']);
  assert.deepEqual(after, before);
  const finalized = await f.relay.finalizeOperation({ operationId: created.operationId, outcome: { state: 'released', reason: 'quota_released' } });
  assert.equal(finalized.status, 'released');
  assert.equal(f.providerCalls.length, 0);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 0);
});

test('privacy sentinels and unsalted hashes are absent from SQLite/WAL after successful delivery', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { created, grant } = await reserveAndGrant(f);
  await f.relay.deliverOpening({ operationId: created.operationId, grant, message: f.message });
  const bytes = Buffer.concat([await readFile(f.filename), await readFile(f.filename + '-wal').catch(() => Buffer.alloc(0))]);
  for (const text of [OPENING, GENERATED]) {
    assert.equal(bytes.includes(Buffer.from(text)), false);
    assert.equal(bytes.includes(Buffer.from(createHash('sha256').update(text).digest('hex'))), false);
  }
});

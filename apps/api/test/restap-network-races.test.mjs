import assert from 'node:assert/strict';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkCoordinator } from '../src/restap-network/coordinator.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkGrantService, createRestapNetworkPublicKeyRegistry } from '../src/restap-network/grants.js';
import { createRestapNetworkRelay } from '../src/restap-network/relay.js';

const NOW_MS = Date.UTC(2026, 9, 2, 12);
const NOW_SECONDS = Math.floor(NOW_MS / 1_000);
const COLLECTION = '0x1649cd37f4748807b4882fc48765ba0b2affa94a';
const KEY_ID = 'race-key-000000000000000000000001';
const PRIVATE_KEY = createPrivateKey({ key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
const PUBLIC_DER = Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
const OPERATION_ID = 'operation-00000000000000000000000000000001';
const CONVERSATION_ID = 'race-conversation-0000000000000000001';
const STALE = 'STALE-CONTENT-MUST-NEVER-PERSIST';
const GENERATED = 'STALE-GENERATED-CONTENT';

function envelope() {
  return { schema_version: '1', operation_id: OPERATION_ID, conversation_id: CONVERSATION_ID, sender_token_id: '1', recipient_token_id: '2', topic: 'general', turn_index: 0, message: STALE };
}

async function fixture({ race, phase }) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-race-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const counts = new Map();
  const coordinator = createRestapNetworkCoordinator({
    store, now: () => NOW_MS, globalDailyCostLimit: 1_000,
    createId(kind) { const count = (counts.get(kind) ?? 0) + 1; counts.set(kind, count); return kind + '-' + String(count).padStart(32, '0'); },
  });
  const authority = { available: true, senderCustodyGeneration: 7, recipientCustodyGeneration: 8, senderActivationLeaseId: '1'.repeat(32), recipientActivationLeaseId: '2'.repeat(32), senderPolicyVersion: 3, recipientPolicyVersion: 4, gateGeneration: 5, safeBlockNumber: 100, safeBlockHash: 'a'.repeat(64) };
  let raced = false;
  function mutate() {
    if (raced) return;
    raced = true;
    if (race === 'transfer') { authority.senderCustodyGeneration += 1; authority.safeBlockNumber += 1; authority.safeBlockHash = 'b'.repeat(64); }
    if (race === 'lease') authority.recipientActivationLeaseId = '9'.repeat(32);
    if (race === 'policy') authority.senderPolicyVersion += 1;
    if (race === 'block') authority.available = false;
    if (race === 'global_gate') { authority.available = false; authority.gateGeneration += 1; }
  }
  const eligibility = { async resolvePeerForRelay() {
    if (!authority.available) return { status: 'unavailable' };
    return { status: 'eligible', chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2', senderAccount: '0x3333333333333333333333333333333333333333', recipientAccount: '0x4444444444444444444444444444444444444444', senderIdentityId: 'codex:1', recipientIdentityId: 'codex:2', senderCustodyGeneration: authority.senderCustodyGeneration, recipientCustodyGeneration: authority.recipientCustodyGeneration, senderActivationLeaseId: authority.senderActivationLeaseId, recipientActivationLeaseId: authority.recipientActivationLeaseId, senderPolicyVersion: authority.senderPolicyVersion, recipientPolicyVersion: authority.recipientPolicyVersion, topics: ['general'] };
  } };
  const registry = createRestapNetworkPublicKeyRegistry({ keys: [{ keyId: KEY_ID, algorithm: 'Ed25519', publicKey: PUBLIC_DER, activatesAt: NOW_SECONDS - 1, notBefore: NOW_SECONDS - 1, notAfter: NOW_SECONDS + 1_000, status: 'signing' }] });
  const grantService = createRestapNetworkGrantService({ signer: { keyId: KEY_ID, sign: async (bytes) => cryptoSign(null, bytes, PRIVATE_KEY) }, keyRegistry: registry, now: () => NOW_SECONDS });
  let providerCalls = 0;
  let contentWrites = 0;
  const conversations = {
    open() { contentWrites += 1; return { conversationId: CONVERSATION_ID }; },
    beginDelivery() { contentWrites += 1; return { deliveryId: 'delivery-never-used' }; },
    abortDelivery() {},
    commitDelivery() { contentWrites += 1; return {}; },
    get() { throw new Error('not used'); },
  };
  const message = envelope();
  const relay = createRestapNetworkRelay({
    coordinator, grantService, eligibility, conversations,
    runtime: { async generate() { providerCalls += 1; return GENERATED; } },
    now: () => NOW_MS,
    readBoundaryState: () => ({ gateGeneration: authority.gateGeneration, safeBlockNumber: authority.safeBlockNumber, safeBlockHash: authority.safeBlockHash }),
    readDiscovery: () => ({}),
    readDueIntent: async () => ({ intentId: 'race-intent-00000000000000000000001', expectedPolicyVersion: 3, operation: 'opening', chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2', topic: 'general', idempotencyKey: 'race-idempotency-00000000000000001', correlationId: CONVERSATION_ID, nonce: 'race-nonce-000000000000000000001', costUnits: 7, canonicalBody: message }),
    onBoundary: async ({ boundary }) => { if (boundary === phase) mutate(); },
  });
  return { relay, coordinator, store, filename, message, counts: () => ({ providerCalls, contentWrites }), async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

for (const phase of ['before_dispatch', 'during_inference', 'before_commit']) {
  for (const race of ['transfer', 'lease', 'policy', 'block', 'global_gate']) {
    test(phase + ' ' + race + ' race fails closed with conservative accounting and zero stale delivery', async (t) => {
      const f = await fixture({ race, phase }); t.after(() => f.close());
      const operation = await f.relay.createDueOperation({ intentId: 'race-intent-00000000000000000000001', expectedPolicyVersion: 3 });
      const grant = await f.relay.mintRelayGrant({ operationId: operation.operationId, canonicalBody: f.message });
      const result = await f.relay.deliverOpening({ operationId: operation.operationId, grant, message: f.message });
      const expected = phase === 'before_dispatch' ? 'released' : 'cancelled_charged';
      assert.equal(result.status, expected);
      assert.equal(f.coordinator.getOperation(operation.operationId).status, expected);
      assert.equal(f.counts().providerCalls, phase === 'before_dispatch' ? 0 : 1);
      assert.equal(f.counts().contentWrites, 0);
      assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 0);
      assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_concurrency_leases WHERE operation_id = ?', [operation.operationId]).count, 0);
      const bytes = Buffer.concat([await readFile(f.filename), await readFile(f.filename + '-wal').catch(() => Buffer.alloc(0))]);
      assert.equal(bytes.includes(Buffer.from(STALE)), false);
      assert.equal(bytes.includes(Buffer.from(GENERATED)), false);
    });
  }
}

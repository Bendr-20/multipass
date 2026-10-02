import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkActivationLeaseService } from '../src/restap-network/activation-leases.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';

const COLLECTION = '0x' + '1'.repeat(40);
const ACCOUNT = '0x' + '2'.repeat(40);
const OWNER = '0x' + '3'.repeat(40);
const CONTROLLER = '0x' + '4'.repeat(40);

async function fixture({ now = 1_000, random = ['11'.repeat(16), '22'.repeat(16)] } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-lease-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const clock = { value: now };
  let randomIndex = 0;
  const service = createRestapNetworkActivationLeaseService({
    store,
    now: () => clock.value,
    randomBytes: () => Buffer.from(random[randomIndex++] ?? '33'.repeat(16), 'hex'),
    getPolicyGeneration: () => 7,
  });
  const custody = Object.freeze({
    chainId: 8453, collection: COLLECTION, tokenId: '1', generation: 1,
    canonicalAccount: ACCOUNT, owner: OWNER, controller: CONTROLLER,
    safeBlockNumber: 100, safeBlockHash: '0x' + 'a'.repeat(64), status: 'ready',
  });
  store.transaction('seed_custody', (tx) => tx.run(
    'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [8453, COLLECTION, '1', 1, ACCOUNT, OWNER, CONTROLLER, 100, 'a'.repeat(64), 99, 0, 'ready', now],
  ));
  return { directory, filename, store, service, clock, custody, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

function authority(custody, patch = {}) { return { ...custody, ...patch }; }

test('issues opaque unique 128-bit leases only against exact ready custody and policy generation', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7 });
  const second = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7 });
  assert.match(first.leaseId, /^[0-9a-f]{32}$/u);
  assert.match(second.leaseId, /^[0-9a-f]{32}$/u);
  assert.notEqual(first.leaseId, second.leaseId);
  assert.equal(first.expiresAt - first.issuedAt, 86_400_000);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_activation_leases WHERE lease_id = ?', [first.leaseId]).status, 'deactivated');
  assert.throws(() => f.service.issue({ custody: f.custody, expectedPolicyGeneration: 6 }), /policy generation/i);
  assert.throws(() => f.service.issue({ custody: authority(f.custody, { owner: '0x' + '5'.repeat(40) }), expectedPolicyGeneration: 7 }), /authority/i);
  assert.throws(() => f.service.issue({ custody: authority(f.custody, { status: 'disputed' }), expectedPolicyGeneration: 7 }), /ready custody/i);
});

test('lease expiry is capped at 24 hours and invalid random identifiers fail closed', async (t) => {
  const f = await fixture({ random: ['ab'] }); t.after(() => f.close());
  assert.throws(() => f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7 }), /128-bit/i);
  const g = await fixture(); t.after(() => g.close());
  assert.throws(() => g.service.issue({ custody: g.custody, expectedPolicyGeneration: 7, ttlMs: 86_400_001 }), /24 hours/i);
});

test('fresh same-epoch activation renews without rotating ID or silently exceeding 24 hours', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const issued = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7, ttlMs: 10_000 });
  f.clock.value += 2_000;
  const renewed = f.service.renew({ custody: f.custody, expectedPolicyGeneration: 7, ttlMs: 20_000 });
  assert.equal(renewed.leaseId, issued.leaseId);
  assert.equal(renewed.lastRenewedAt, 3_000);
  assert.equal(renewed.expiresAt, 23_000);
  assert.throws(() => f.service.renew({ custody: authority(f.custody, { generation: 2 }), expectedPolicyGeneration: 7 }), /authority/i);
});

test('deactivation is immediate and renewal never silently reactivates it', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const issued = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7 });
  const result = f.service.deactivate({ custody: f.custody, expectedPolicyGeneration: 7 });
  assert.equal(result.deactivated, 1);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_activation_leases WHERE lease_id = ?', [issued.leaseId]).status, 'deactivated');
  assert.equal(f.service.renew({ custody: f.custody, expectedPolicyGeneration: 7 }), null);
});

test('restart loads unexpired leases only as inactive candidates and never extends them', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const issued = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7, ttlMs: 10_000 });
  f.clock.value += 2_000;
  f.store.close();
  const reopenedStore = createRestapNetworkDatabase({ filename: f.filename });
  t.after(() => reopenedStore.close());
  const restarted = createRestapNetworkActivationLeaseService({
    store: reopenedStore, now: () => f.clock.value, getPolicyGeneration: () => 7,
  });
  const candidates = restarted.loadCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'candidate');
  assert.equal(candidates[0].expiresAt, issued.expiresAt);
  assert.equal(Object.isFrozen(candidates[0]), true);
  assert.equal(restarted.renew({ custody: f.custody, expectedPolicyGeneration: 7 }), null);
});

test('candidate reauthorization requires exact fresh authority and does not extend expiry', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const issued = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7, ttlMs: 10_000 });
  f.service.loadCandidates();
  assert.throws(() => f.service.reauthorizeCandidate({ leaseId: issued.leaseId, custody: authority(f.custody, { canonicalAccount: '0x' + '6'.repeat(40) }), expectedPolicyGeneration: 7 }), /authority/i);
  const active = f.service.reauthorizeCandidate({ leaseId: issued.leaseId, custody: f.custody, expectedPolicyGeneration: 7 });
  assert.equal(active.status, 'active');
  assert.equal(active.expiresAt, issued.expiresAt);
});

test('expired candidates cannot reactivate', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const issued = f.service.issue({ custody: f.custody, expectedPolicyGeneration: 7, ttlMs: 1_000 });
  f.clock.value = 2_001;
  assert.deepEqual(f.service.loadCandidates(), []);
  assert.throws(() => f.service.reauthorizeCandidate({ leaseId: issued.leaseId, custody: f.custody, expectedPolicyGeneration: 7 }), /candidate/i);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_activation_leases WHERE lease_id = ?', [issued.leaseId]).status, 'expired');
});

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import {
  RESTAP_NETWORK_OPERATION_TRANSITIONS,
  createRestapNetworkCoordinator,
} from '../src/restap-network/coordinator.js';

const DAY = 86_400_000;
const HASH = (character) => character.repeat(64);

function snapshot({ senderTokenId = '1', recipientTokenId = '2', bodyHash = HASH('b'), safeBlockNumber = 100 } = {}) {
  return Object.freeze({
    senderTokenId,
    recipientTokenId,
    senderCustodyGeneration: 7,
    recipientCustodyGeneration: 8,
    senderLeaseId: '1'.repeat(32),
    recipientLeaseId: '2'.repeat(32),
    senderPolicyVersion: 3,
    recipientPolicyVersion: 4,
    gateGeneration: 5,
    safeBlockNumber,
    safeBlockHash: HASH('a'),
    bodyHash,
  });
}

async function fixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-coordinator-'));
  const filename = join(directory, 'network.sqlite');
  let now = options.now ?? Date.UTC(2026, 9, 2, 12);
  let id = 0;
  const store = createRestapNetworkDatabase({ filename, faultInjector: options.storeFaultInjector ?? null });
  const coordinator = createRestapNetworkCoordinator({
    store,
    now: () => now,
    createId: (kind) => kind + '-' + String(++id).padStart(6, '0'),
    globalDailyCostLimit: options.globalDailyCostLimit ?? 1_000,
    reservationTtlMs: options.reservationTtlMs ?? 1_000,
    faultInjector: options.faultInjector ?? null,
    quotaLimitResolver: options.quotaLimitResolver ?? null,
  });
  return {
    directory, filename, store, coordinator,
    setNow(value) { now = value; },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

function reservation(overrides = {}) {
  const authority = overrides.snapshot ?? snapshot(overrides);
  return {
    operationKind: overrides.operationKind ?? 'opening',
    snapshot: authority,
    idempotencyKey: overrides.idempotencyKey ?? 'idem-' + authority.senderTokenId + '-' + authority.recipientTokenId,
    nonce: overrides.nonce ?? 'nonce-' + authority.senderTokenId + '-' + authority.recipientTokenId,
    costUnits: overrides.costUnits ?? 10,
    conversationId: overrides.conversationId ?? 'conversation-' + authority.senderTokenId + '-' + authority.recipientTokenId,
    topic: overrides.topic ?? 'general',
  };
}

function dispatchAndCharge(coordinator, operation, terminal = 'failed_charged') {
  coordinator.markProviderDispatched({ operationId: operation.operationId, freshSnapshot: operation.snapshot });
  if (terminal === 'failed_charged') coordinator.markFailedCharged({ operationId: operation.operationId });
  else coordinator.markChargedUnknown({ operationId: operation.operationId });
}

function quotaRows(store) {
  return store.readAll('SELECT scope_class, used_units, reserved_units, limit_units, bucket_start, bucket_end FROM restap_network_quota_buckets ORDER BY bucket_id');
}

const EXACT_TRANSITIONS = Object.freeze({
  reserved: ['provider_dispatched', 'released'],
  provider_dispatched: ['charged_unknown', 'cancelled_charged', 'failed_charged', 'committed'],
  committed: [], released: [], charged_unknown: [], cancelled_charged: [], failed_charged: [],
});

test('owner policy quota limits are enforced atomically below platform maxima', async (t) => {
  const f = await fixture({ quotaLimitResolver: () => ({ initiatedDailyLimit: 1, generatedDailyLimit: 1, peerDailyLimit: 1 }) }); t.after(() => f.close());
  const first = f.coordinator.reserve(reservation());
  f.coordinator.markProviderDispatched({ operationId: first.operationId, freshSnapshot: first.snapshot });
  f.coordinator.markFailedCharged({ operationId: first.operationId });
  assert.throws(() => f.coordinator.reserve(reservation({ idempotencyKey: 'idem-owner-limit-2', nonce: 'nonce-owner-limit-2', conversationId: 'conversation-owner-limit-2' })), /quota|limit|exceeded/i);
});

test('operation transitions are exactly the approved table and terminal states are immutable', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  assert.deepEqual(RESTAP_NETWORK_OPERATION_TRANSITIONS, EXACT_TRANSITIONS);
  const operation = f.coordinator.reserve(reservation());
  assert.throws(() => f.coordinator.markCancelledCharged({ operationId: operation.operationId }), /transition/i);
  f.coordinator.release({ operationId: operation.operationId, reasonClass: 'pre_dispatch_cancelled' });
  for (const action of [
    () => f.coordinator.release({ operationId: operation.operationId, reasonClass: 'again' }),
    () => f.coordinator.markProviderDispatched({ operationId: operation.operationId, freshSnapshot: operation.snapshot }),
    () => f.coordinator.markChargedUnknown({ operationId: operation.operationId }),
  ]) assert.throws(action, /terminal|transition/i);
});

test('parallel reservations enforce two concurrency slots per involved token atomically', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const attempts = [2, 3, 4].map((recipientTokenId) => Promise.resolve().then(() => f.coordinator.reserve(reservation({
    snapshot: snapshot({ recipientTokenId: String(recipientTokenId) }),
    idempotencyKey: 'parallel-' + recipientTokenId,
    nonce: 'parallel-nonce-' + recipientTokenId,
    conversationId: 'parallel-conversation-' + recipientTokenId,
  }))));
  const settled = await Promise.allSettled(attempts);
  assert.equal(settled.filter((entry) => entry.status === 'fulfilled').length, 2);
  assert.equal(settled.filter((entry) => entry.status === 'rejected').length, 1);
  assert.match(settled.find((entry) => entry.status === 'rejected').reason.message, /concurrency/i);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 2);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_concurrency_leases').count, 6);
});

test('parallel exact idempotency duplicates join one reservation while changed bodies conflict', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const input = reservation({ idempotencyKey: 'EXACT-DUPLICATE-SENTINEL', nonce: 'DUPLICATE-NONCE-SENTINEL' });
  const joined = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => f.coordinator.reserve(input))));
  assert.equal(new Set(joined.map((entry) => entry.operationId)).size, 1);
  assert.equal(joined.filter((entry) => entry.joined).length, 19);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_replay_nonces').count, 1);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_idempotency_keys').count, 1);
  assert.throws(() => f.coordinator.reserve({ ...input, snapshot: snapshot({ bodyHash: HASH('c') }) }), /idempotency conflict/i);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 1);
});

test('daily initiation and ordered-pair quotas are exact under parallel promises', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  for (let index = 0; index < 10; index += 1) {
    const recipient = String(2 + (index % 2));
    const operation = f.coordinator.reserve(reservation({
      snapshot: snapshot({ recipientTokenId: recipient }), idempotencyKey: 'init-' + index,
      nonce: 'init-nonce-' + index, conversationId: 'init-conversation-' + index,
    }));
    dispatchAndCharge(f.coordinator, operation);
  }
  const overflow = await Promise.allSettled([10, 11].map((index) => Promise.resolve().then(() => f.coordinator.reserve(reservation({
    snapshot: snapshot({ recipientTokenId: String(index + 10) }), idempotencyKey: 'init-' + index,
    nonce: 'init-nonce-' + index, conversationId: 'init-conversation-' + index,
  })))));
  assert.equal(overflow.every((entry) => entry.status === 'rejected'), true);
  assert.match(overflow[0].reason.message, /initiation quota/i);

  const pairFixture = await fixture(); t.after(() => pairFixture.close());
  for (let index = 0; index < 5; index += 1) {
    const operation = pairFixture.coordinator.reserve(reservation({ idempotencyKey: 'pair-' + index, nonce: 'pair-nonce-' + index, conversationId: 'pair-conversation-' + index }));
    dispatchAndCharge(pairFixture.coordinator, operation);
  }
  assert.throws(() => pairFixture.coordinator.reserve(reservation({ idempotencyKey: 'pair-over', nonce: 'pair-over-nonce', conversationId: 'pair-over-conversation' })), /ordered pair quota/i);
});

test('generated-message and global daily cost reservations cannot exceed exact caps', async (t) => {
  const f = await fixture({ globalDailyCostLimit: 31 }); t.after(() => f.close());
  for (let index = 0; index < 3; index += 1) {
    const operation = f.coordinator.reserve(reservation({
      operationKind: 'reply', snapshot: snapshot({ senderTokenId: String(10 + index), recipientTokenId: '2' }),
      idempotencyKey: 'cost-' + index, nonce: 'cost-nonce-' + index, conversationId: 'cost-conversation-' + index,
    }));
    dispatchAndCharge(f.coordinator, operation);
  }
  assert.throws(() => f.coordinator.reserve(reservation({ operationKind: 'reply', snapshot: snapshot({ senderTokenId: '20', recipientTokenId: '2' }), idempotencyKey: 'cost-over', nonce: 'cost-over-nonce', conversationId: 'cost-over-conversation' })), /cost budget/i);

  const generated = await fixture({ globalDailyCostLimit: 10_000 }); t.after(() => generated.close());
  for (let index = 0; index < 30; index += 1) {
    const operation = generated.coordinator.reserve(reservation({
      operationKind: 'reply', snapshot: snapshot({ senderTokenId: String(100 + index), recipientTokenId: '2' }),
      idempotencyKey: 'generated-' + index, nonce: 'generated-nonce-' + index, conversationId: 'generated-conversation-' + index,
    }));
    dispatchAndCharge(generated.coordinator, operation);
  }
  assert.throws(() => generated.coordinator.reserve(reservation({ operationKind: 'reply', snapshot: snapshot({ senderTokenId: '999', recipientTokenId: '2' }), idempotencyKey: 'generated-over', nonce: 'generated-over-nonce', conversationId: 'generated-over-conversation' })), /generated message quota/i);
});

test('UTC bucket boundaries use explicit half-open start and end instants', async (t) => {
  const dayStart = Date.UTC(2026, 9, 2);
  const f = await fixture({ now: dayStart + DAY - 1 }); t.after(() => f.close());
  for (let index = 0; index < 5; index += 1) {
    const operation = f.coordinator.reserve(reservation({ idempotencyKey: 'utc-' + index, nonce: 'utc-nonce-' + index, conversationId: 'utc-conversation-' + index }));
    dispatchAndCharge(f.coordinator, operation);
  }
  assert.throws(() => f.coordinator.reserve(reservation({ idempotencyKey: 'utc-over', nonce: 'utc-over-nonce', conversationId: 'utc-over-conversation' })), /ordered pair quota/i);
  f.setNow(dayStart + DAY);
  const next = f.coordinator.reserve(reservation({ idempotencyKey: 'utc-next', nonce: 'utc-next-nonce', conversationId: 'utc-next-conversation' }));
  assert.equal(next.status, 'reserved');
  const boundaries = new Set(quotaRows(f.store).map((row) => row.bucket_start + ':' + row.bucket_end));
  assert.deepEqual(boundaries, new Set([dayStart + ':' + (dayStart + DAY), (dayStart + DAY) + ':' + (dayStart + 2 * DAY)]));
});

test('reservation freezes every authority coordinate and rejects raw/private fields', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const authority = snapshot();
  const operation = f.coordinator.reserve(reservation({ snapshot: authority }));
  assert.deepEqual(operation.snapshot, authority);
  assert.equal(Object.isFrozen(operation), true);
  assert.equal(Object.isFrozen(operation.snapshot), true);
  for (const extra of ['body', 'message', 'prompt', 'reply', 'grant', 'signature', 'rawJson', 'ip']) {
    assert.throws(() => f.coordinator.reserve({ ...reservation({ idempotencyKey: 'private-' + extra, nonce: 'private-nonce-' + extra }), [extra]: 'PRIVATE-SENTINEL-' + extra }), /unknown|not allowed/i, extra);
  }
});

test('dispatch marker is durable before provider work and provider never runs in a transaction', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const operation = f.coordinator.reserve(reservation());
  let calls = 0;
  const result = await f.coordinator.dispatchProvider({
    operationId: operation.operationId,
    freshSnapshot: operation.snapshot,
    async callProvider() {
      calls += 1;
      assert.equal(f.coordinator.getOperation(operation.operationId).status, 'provider_dispatched');
      f.store.transaction('provider_outside_tx', (tx) => tx.run("INSERT INTO restap_network_audit_events (event_id, event_class, status_class, occurred_at) VALUES ('provider-proof', 'test', 'ok', 1)"));
      return Object.freeze({ providerResult: 'opaque-memory-only' });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.providerResult, 'opaque-memory-only');
  const retry = await f.coordinator.dispatchProvider({ operationId: operation.operationId, freshSnapshot: operation.snapshot, async callProvider() { calls += 1; } });
  assert.deepEqual(retry, { status: 'already_dispatched', operationId: operation.operationId });
  assert.equal(calls, 1);
});

test('injected crashes before and after provider invocation never duplicate inference or reservations', async (t) => {
  for (const crashPhase of ['after_dispatch_marker', 'after_provider_return']) {
    let injected = false;
    const f = await fixture({ faultInjector(event) { if (!injected && event.phase === crashPhase) { injected = true; throw new Error('crash:' + crashPhase); } } });
    t.after(() => f.close());
    const operation = f.coordinator.reserve(reservation({ idempotencyKey: crashPhase, nonce: 'nonce-' + crashPhase, conversationId: 'conversation-' + crashPhase }));
    let calls = 0;
    await assert.rejects(() => f.coordinator.dispatchProvider({ operationId: operation.operationId, freshSnapshot: operation.snapshot, async callProvider() { calls += 1; return { output: 'memory-only' }; } }), /crash/);
    assert.equal(f.coordinator.getOperation(operation.operationId).status, 'provider_dispatched');
    const retry = await f.coordinator.dispatchProvider({ operationId: operation.operationId, freshSnapshot: operation.snapshot, async callProvider() { calls += 1; } });
    assert.equal(retry.status, 'already_dispatched');
    assert.equal(calls, crashPhase === 'after_dispatch_marker' ? 0 : 1);
    f.coordinator.markChargedUnknown({ operationId: operation.operationId });
    assert.equal(f.coordinator.getOperation(operation.operationId).status, 'charged_unknown');
  }
});

test('exact fresh snapshot commits one delivery sequence and retries never duplicate delivery or billing', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const operation = f.coordinator.reserve(reservation());
  f.coordinator.markProviderDispatched({ operationId: operation.operationId, freshSnapshot: operation.snapshot });
  const first = f.coordinator.commitAfterRecheck({ operationId: operation.operationId, freshSnapshot: operation.snapshot, contentHash: HASH('d'), speakerClass: 'recipient' });
  const retry = f.coordinator.commitAfterRecheck({ operationId: operation.operationId, freshSnapshot: operation.snapshot, contentHash: HASH('d'), speakerClass: 'recipient' });
  assert.deepEqual(retry, first);
  assert.equal(first.status, 'committed');
  assert.equal(first.deliverySequence, 0);
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 1);
  assert.equal(quotaRows(f.store).every((row) => Number(row.reserved_units) === 0), true);
  const used = quotaRows(f.store).map((row) => Number(row.used_units));
  assert.equal(used.every((value) => value > 0), true);
});

test('one active delivery per conversation blocks parallel turns until delivery is acknowledged', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = f.coordinator.reserve(reservation());
  f.coordinator.markProviderDispatched({ operationId: first.operationId, freshSnapshot: first.snapshot });
  f.coordinator.commitAfterRecheck({ operationId: first.operationId, freshSnapshot: first.snapshot, contentHash: HASH('d'), speakerClass: 'recipient' });
  const secondInput = reservation({ operationKind: 'reply', idempotencyKey: 'second', nonce: 'second-nonce', conversationId: 'conversation-1-2' });
  assert.throws(() => f.coordinator.reserve(secondInput), /active delivery/i);
  f.coordinator.markDeliveryDelivered({ operationId: first.operationId });
  const second = f.coordinator.reserve(secondInput);
  f.coordinator.markProviderDispatched({ operationId: second.operationId, freshSnapshot: second.snapshot });
  const committed = f.coordinator.commitAfterRecheck({ operationId: second.operationId, freshSnapshot: second.snapshot, contentHash: HASH('e'), speakerClass: 'sender' });
  assert.equal(committed.deliverySequence, 1);
});

test('stale pre-dispatch work releases reservations but dispatched work becomes an unknown charge', async (t) => {
  const f = await fixture({ reservationTtlMs: 100 }); t.after(() => f.close());
  const pre = f.coordinator.reserve(reservation({ idempotencyKey: 'stale-pre', nonce: 'stale-pre-nonce', conversationId: 'stale-pre-conversation' }));
  const post = f.coordinator.reserve(reservation({ snapshot: snapshot({ recipientTokenId: '3' }), idempotencyKey: 'stale-post', nonce: 'stale-post-nonce', conversationId: 'stale-post-conversation' }));
  f.coordinator.markProviderDispatched({ operationId: post.operationId, freshSnapshot: post.snapshot });
  f.setNow(Date.UTC(2026, 9, 2, 12) + 101);
  const recovery = f.coordinator.recoverStaleOperations();
  assert.deepEqual(recovery, { released: 1, chargedUnknown: 1 });
  assert.equal(f.coordinator.getOperation(pre.operationId).status, 'released');
  assert.equal(f.coordinator.getOperation(post.operationId).status, 'charged_unknown');
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_concurrency_leases').count, 0);
  assert.equal(quotaRows(f.store).every((row) => Number(row.reserved_units) === 0), true);
});

test('a stale commit snapshot cancels charged work without persisting or delivering content', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const operation = f.coordinator.reserve(reservation());
  f.coordinator.markProviderDispatched({ operationId: operation.operationId, freshSnapshot: operation.snapshot });
  const stale = { ...operation.snapshot, senderPolicyVersion: operation.snapshot.senderPolicyVersion + 1 };
  const result = f.coordinator.commitAfterRecheck({ operationId: operation.operationId, freshSnapshot: stale, contentHash: HASH('f'), speakerClass: 'recipient' });
  assert.deepEqual(result, { status: 'cancelled_charged', operationId: operation.operationId });
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_deliveries').count, 0);
  assert.equal(f.coordinator.getOperation(operation.operationId).status, 'cancelled_charged');
});

test('reservation write failures are fully atomic and retry cleanly reserves once', async (t) => {
  let coordinatorWrites = 0;
  let enabled = true;
  const f = await fixture({ storeFaultInjector(event) {
    if (enabled && event.label === 'coordinator_reserve' && event.phase === 'transaction_write' && ++coordinatorWrites === 4) throw new Error('injected reservation crash');
  } });
  t.after(() => f.close());
  const input = reservation();
  assert.throws(() => f.coordinator.reserve(input), /injected reservation crash/);
  for (const table of ['operations', 'quota_buckets', 'concurrency_leases', 'replay_nonces', 'idempotency_keys', 'conversations']) {
    assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_' + table).count, 0, table);
  }
  enabled = false;
  const operation = f.coordinator.reserve(input);
  assert.equal(operation.status, 'reserved');
  assert.equal(f.store.readOne('SELECT count(*) AS count FROM restap_network_operations').count, 1);
});

test('SQLite and WAL contain only hashes/coordinates, never raw request secrets or content', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const sentinels = ['RAW-IDEMPOTENCY-PRIVATE-SENTINEL', 'RAW-NONCE-PRIVATE-SENTINEL', 'PROMPT-PRIVATE-SENTINEL', 'REPLY-PRIVATE-SENTINEL'];
  f.coordinator.reserve(reservation({ idempotencyKey: sentinels[0], nonce: sentinels[1] }));
  const bytes = Buffer.concat([await readFile(f.filename), await readFile(f.filename + '-wal').catch(() => Buffer.alloc(0))]);
  for (const sentinel of sentinels) assert.equal(bytes.includes(Buffer.from(sentinel)), false, sentinel);
});

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { RESTAP_NETWORK_ACCOUNT_RELEASE, deriveReleasedAccount } from '../src/restap-network/account-integrity.js';
import { createCustodyReconciler } from '../src/restap-network/custody-reconciler.js';

const A = '0x2222222222222222222222222222222222222222';
const B = '0x3333333333333333333333333333333333333333';
const C = '0x4444444444444444444444444444444444444444';
const TOKEN_ID = '617';
const SECOND_TOKEN_ID = '618';
const ACCOUNT = deriveReleasedAccount({ tokenId: TOKEN_ID });
const HASH_100 = '0x' + 'aa'.repeat(32);
const HASH_101 = '0x' + 'bb'.repeat(32);

function event(kind, blockNumber, logIndex, patch = {}) {
  return {
    kind,
    source: kind === 'transfer' ? RESTAP_NETWORK_ACCOUNT_RELEASE.collection : RESTAP_NETWORK_ACCOUNT_RELEASE.controllerSource,
    tokenId: TOKEN_ID,
    blockNumber,
    blockHash: blockNumber === 100 ? HASH_100 : HASH_101,
    transactionHash: '0x' + blockNumber.toString(16).padStart(62, '0') + logIndex.toString(16).padStart(2, '0'),
    transactionIndex: 0,
    logIndex,
    ...patch,
  };
}
function evidence(overrides = {}) {
  return { safeBlock: { number: 100, hash: HASH_100 }, safeOwner: A, safeController: A, latestOwner: A, latestController: A, canonicalAccount: ACCOUNT, range: { fromBlock: 0, toBlock: 100 }, events: [], priorSafeHash: null, ...overrides };
}
function providerSequence(sequence, { tokenIds = [TOKEN_ID], listError = null } = {}) {
  let index = 0;
  const requests = [];
  return {
    requests,
    async readCustody(request) { requests.push(structuredClone(request)); return structuredClone(sequence[Math.min(index++, sequence.length - 1)]); },
    async listAffectedTokens() { if (listError) throw listError; return structuredClone(tokenIds); },
  };
}
async function fixture(values = [evidence(), evidence()], options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-custody-'));
  const filename = join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const providers = values.map((value) => value?.readCustody ? value : providerSequence([value]));
  const reconciler = createCustodyReconciler({ store, providers, release: RESTAP_NETWORK_ACCOUNT_RELEASE, auditKey: Buffer.alloc(32, 7), auditKeyId: 'test-2026-10', timeoutMs: 20, now: () => 1_000, ...options });
  return { directory, filename, store, providers, reconciler, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('initial finalized build persists a ready deeply frozen custody epoch', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const result = await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal(result.status, 'ready');
  assert.equal(result.generation, 1);
  const snapshot = f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID });
  assert.deepEqual({ owner: snapshot.owner, controller: snapshot.controller, account: snapshot.canonicalAccount }, { owner: A, controller: A, account: ACCOUNT });
  assert.equal(snapshot.safeBlockNumber, 100);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(f.store.readOne('SELECT status FROM restap_network_custody_epochs WHERE token_id = ?', [TOKEN_ID]).status, 'ready');
});

test('holder opt-in uses the older finalized head when authority and event evidence agree', async (t) => {
  const newer = evidence({ safeBlock: { number: 101, hash: HASH_101 }, range: { fromBlock: 0, toBlock: 101 } });
  const f = await fixture([evidence(), newer], { maxSafeBlockSkew: 1 }); t.after(() => f.close());
  const result = await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal(result.status, 'ready');
  const snapshot = f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID });
  assert.equal(snapshot.safeBlockNumber, 100);
  assert.equal(snapshot.safeBlockHash, HASH_100);

  const tooNew = evidence({ safeBlock: { number: 102, hash: '0x' + 'cc'.repeat(32) }, range: { fromBlock: 0, toBlock: 102 } });
  const overBound = await fixture([evidence(), tooNew], { maxSafeBlockSkew: 1 }); t.after(() => overBound.close());
  assert.equal((await overBound.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'safe_block_disagreement');
});

test('the pinned ERC-721 controller follows finalized ownership transfers', async (t) => {
  const moved = evidence({
    safeBlock: { number: 101, hash: HASH_101 },
    safeOwner: B,
    safeController: B,
    latestOwner: B,
    latestController: B,
    range: { fromBlock: 0, toBlock: 101 },
    events: [event('transfer', 101, 1, { from: A, to: B })],
  });
  const f = await fixture([moved, moved]); t.after(() => f.close());
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'ready');
  assert.equal(f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID }).controller, B);
});

test('finalized ERC-721 transfers replay monotonically including A to B to A and same-owner events', async (t) => {
  const initial = evidence();
  const toB = evidence({ safeBlock: { number: 101, hash: HASH_101 }, safeOwner: B, safeController: B, latestOwner: B, latestController: B, priorSafeHash: HASH_100, range: { fromBlock: 101, toBlock: 101 }, events: [event('transfer', 101, 1, { from: A, to: B })] });
  const hash102 = '0x' + 'cc'.repeat(32);
  const backA = evidence({ safeBlock: { number: 102, hash: hash102 }, safeOwner: A, safeController: A, latestOwner: A, latestController: A, priorSafeHash: HASH_101, range: { fromBlock: 102, toBlock: 102 }, events: [event('transfer', 102, 2, { from: B, to: A, blockHash: hash102 })] });
  const hash103 = '0x' + 'dd'.repeat(32);
  const sameOwner = evidence({ safeBlock: { number: 103, hash: hash103 }, safeOwner: A, safeController: A, latestOwner: A, latestController: A, priorSafeHash: hash102, range: { fromBlock: 103, toBlock: 103 }, events: [event('transfer', 103, 3, { from: A, to: A, blockHash: hash103 })] });
  const p1 = providerSequence([initial, toB, backA, sameOwner]);
  const p2 = providerSequence([initial, toB, backA, sameOwner]);
  const f = await fixture([p1, p2]); t.after(() => f.close());
  const generations = [];
  for (let index = 0; index < 4; index += 1) generations.push((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).generation);
  assert.deepEqual(generations, [1, 2, 3, 4]);
  assert.equal(f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID }).owner, A);
  assert.equal(f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID }).controller, A);
});

test('incremental reconciliation requires prior-safe hash continuity', async (t) => {
  const incrementalWithoutContinuity = evidence({ safeBlock: { number: 101, hash: HASH_101 }, range: { fromBlock: 101, toBlock: 101 } });
  const p1 = providerSequence([evidence(), incrementalWithoutContinuity]);
  const p2 = providerSequence([evidence(), incrementalWithoutContinuity]);
  const f = await fixture([p1, p2]); t.after(() => f.close());
  await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  const failed = await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal(failed.status, 'prior_hash_mismatch');
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'open');
});

test('transient provider failure opens the breaker without discarding verified custody and retries incrementally', async (t) => {
  const resumed = evidence({ range: { fromBlock: 101, toBlock: 100 }, priorSafeHash: HASH_100 });
  const requests = [];
  let leftCall = 0;
  let rightCall = 0;
  const left = {
    async readCustody(request) { requests.push(structuredClone(request)); leftCall += 1; return structuredClone(leftCall === 1 ? evidence() : resumed); },
    async listAffectedTokens() { return [TOKEN_ID]; },
  };
  const right = {
    async readCustody() { rightCall += 1; if (rightCall === 2) throw new Error('temporary provider failure'); return structuredClone(rightCall === 1 ? evidence() : resumed); },
    async listAffectedTokens() { return [TOKEN_ID]; },
  };
  const f = await fixture([left, right]); t.after(() => f.close());
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'ready');
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'provider_unavailable');
  assert.equal(f.reconciler.getEpochSnapshot({ tokenId: TOKEN_ID }).status, 'ready');
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'open');
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'ready');
  assert.equal(requests[2].fromBlock, 101);
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'closed');
});

test('non-ready custody or an open breaker forces a genesis rebuild before breaker closure', async (t) => {
  const mismatch = evidence({ safeBlock: { number: 101, hash: HASH_101 }, range: { fromBlock: 101, toBlock: 101 }, priorSafeHash: HASH_100, latestOwner: B });
  const full = evidence({ safeBlock: { number: 101, hash: HASH_101 }, range: { fromBlock: 0, toBlock: 101 }, priorSafeHash: HASH_100 });
  const p1 = providerSequence([evidence(), mismatch, full]);
  const p2 = providerSequence([evidence(), mismatch, full]);
  const f = await fixture([p1, p2]); t.after(() => f.close());
  await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'latest_authority_mismatch');
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'ready');
  assert.equal(p1.requests[2].fromBlock, 0);
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'closed');
});

test('rejects duplicate, contradictory, wrong-token, and wrong-source finalized events', async (t) => {
  const valid = event('transfer', 101, 1, { from: A, to: B });
  const cases = [
    [valid, { ...valid }],
    [{ ...valid, from: B }],
    [{ ...valid, tokenId: SECOND_TOKEN_ID }],
    [{ ...valid, source: RESTAP_NETWORK_ACCOUNT_RELEASE.controllerSource }],
  ];
  for (const events of cases) {
    await t.test(events.length === 2 ? 'duplicate' : Object.keys(events[0]).join(':'), async (t2) => {
      const bad = evidence({ safeBlock: { number: 101, hash: HASH_101 }, safeOwner: B, safeController: A, latestOwner: B, latestController: A, priorSafeHash: HASH_100, range: { fromBlock: 101, toBlock: 101 }, events });
      const p1 = providerSequence([evidence(), bad]);
      const p2 = providerSequence([evidence(), bad]);
      const f = await fixture([p1, p2]); t2.after(() => f.close());
      await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
      assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'event_history_invalid');
    });
  }
});

test('safe disagreement, exact provider disagreement, latest mismatch, unresolved range and timeout mark ineligible and open token breaker', async (t) => {
  const cases = [
    ['safe_block_disagreement', evidence(), evidence({ safeBlock: { number: 101, hash: HASH_101 } })],
    ['safe_block_disagreement', evidence(), evidence({ safeBlock: { number: 100, hash: HASH_101 } })],
    ['provider_disagreement', evidence(), evidence({ safeController: B, latestController: B })],
    ['latest_authority_mismatch', evidence({ latestOwner: B }), evidence({ latestOwner: B })],
    ['unresolved_range', evidence({ range: { fromBlock: 1, toBlock: 99 } }), evidence({ range: { fromBlock: 1, toBlock: 99 } })],
  ];
  for (const [status, left, right] of cases) {
    await t.test(status + ':' + right.safeBlock.number + ':' + right.safeBlock.hash.slice(-2), async (t2) => {
      const f = await fixture([left, right]); t2.after(() => f.close());
      const result = await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
      assert.equal(result.status, status);
      assert.equal(result.eligible, false);
      const breaker = f.store.readOne("SELECT state, generation, reason_class, scope_digest FROM restap_network_circuit_breakers WHERE scope_class = 'token'");
      assert.equal(breaker.state, 'open');
      assert.equal(breaker.generation, 1);
      assert.equal(breaker.reason_class, status);
      assert.equal(breaker.scope_digest.length, 64);
      assert.doesNotMatch(JSON.stringify(breaker), new RegExp(A.slice(2), 'i'));
    });
  }
  const hanging = { readCustody: async () => new Promise(() => {}), listAffectedTokens: async () => [TOKEN_ID] };
  const f = await fixture([providerSequence([evidence()]), hanging]); t.after(() => f.close());
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'provider_timeout');
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'open');
});

test('successful canonical rebuild after reorg advances generation and closes breaker', async (t) => {
  const wrongPrior = evidence({ safeBlock: { number: 101, hash: HASH_101 }, priorSafeHash: '0x' + 'ff'.repeat(32), range: { fromBlock: 101, toBlock: 101 }, events: [event('transfer', 101, 1, { from: A, to: A })] });
  const rebuiltHistory = { ...wrongPrior, range: { fromBlock: 0, toBlock: 101 } };
  const p1 = providerSequence([evidence(), wrongPrior, rebuiltHistory]);
  const p2 = providerSequence([evidence(), wrongPrior, rebuiltHistory]);
  const f = await fixture([p1, p2]); t.after(() => f.close());
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).generation, 1);
  assert.equal((await f.reconciler.reconcileToken({ tokenId: TOKEN_ID })).status, 'prior_hash_mismatch');
  const rebuilt = await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal(rebuilt.status, 'ready');
  assert.equal(rebuilt.rebuilt, true);
  assert.equal(rebuilt.generation, 2);
  assert.equal(p1.requests[2].fromBlock, 0);
  assert.equal(f.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'closed');
});

test('range provider failures open breakers for the union of identified tokens before returning', async (t) => {
  const timeoutProvider = { readCustody: async () => evidence(), listAffectedTokens: async () => new Promise(() => {}) };
  const f1 = await fixture([providerSequence([evidence()], { tokenIds: [TOKEN_ID] }), timeoutProvider]); t.after(() => f1.close());
  const timeout = await f1.reconciler.reconcileRange({ fromBlock: 1, toBlock: 2 });
  assert.deepEqual(timeout, { eligible: false, status: 'provider_timeout', fromBlock: 1, toBlock: 2, tokenIds: [TOKEN_ID] });
  assert.equal(f1.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'open');

  const f3 = await fixture([
    providerSequence([evidence()], { tokenIds: [TOKEN_ID] }),
    providerSequence([evidence()], { listError: new Error('offline') }),
  ]); t.after(() => f3.close());
  const unavailable = await f3.reconciler.reconcileRange({ fromBlock: 1, toBlock: 2 });
  assert.deepEqual(unavailable, { eligible: false, status: 'provider_unavailable', fromBlock: 1, toBlock: 2, tokenIds: [TOKEN_ID] });
  assert.equal(f3.store.readOne("SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token'").state, 'open');

  const f2 = await fixture([
    providerSequence([evidence()], { tokenIds: [TOKEN_ID] }),
    providerSequence([evidence()], { tokenIds: [SECOND_TOKEN_ID] }),
  ]); t.after(() => f2.close());
  const disagreement = await f2.reconciler.reconcileRange({ fromBlock: 1, toBlock: 2 });
  assert.deepEqual(disagreement, { eligible: false, status: 'provider_disagreement', fromBlock: 1, toBlock: 2, tokenIds: [TOKEN_ID, SECOND_TOKEN_ID] });
  assert.equal(f2.store.readOne("SELECT count(*) AS count FROM restap_network_circuit_breakers WHERE scope_class = 'token' AND state = 'open'").count, 2);
});

test('restart closes and reopens SQLite then resumes from persisted safe coordinates', async (t) => {
  const firstProvider = providerSequence([evidence()]);
  const peerProvider = providerSequence([evidence()]);
  const f = await fixture([firstProvider, peerProvider]);
  let reopened;
  t.after(async () => { reopened?.close(); f.store.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.reconciler.reconcileToken({ tokenId: TOKEN_ID });
  f.store.close();
  reopened = createRestapNetworkDatabase({ filename: f.filename });
  const resumed = evidence({ safeBlock: { number: 101, hash: HASH_101 }, priorSafeHash: HASH_100, range: { fromBlock: 101, toBlock: 101 } });
  const p1 = providerSequence([resumed]);
  const p2 = providerSequence([resumed]);
  const restarted = createCustodyReconciler({ store: reopened, providers: [p1, p2], auditKey: Buffer.alloc(32, 7), auditKeyId: 'test-2026-10', timeoutMs: 20, now: () => 2_000 });
  const result = await restarted.reconcileToken({ tokenId: TOKEN_ID });
  assert.equal(result.generation, 1);
  assert.equal(p1.requests[0].fromBlock, 101);
  const rangeEvidence = evidence({ safeBlock: { number: 101, hash: HASH_101 }, priorSafeHash: HASH_101, range: { fromBlock: 101, toBlock: 101 } });
  p1.readCustody = async () => structuredClone(rangeEvidence);
  p2.readCustody = async () => structuredClone(rangeEvidence);
  const range = await restarted.reconcileRange({ fromBlock: 101, toBlock: 101 });
  assert.deepEqual(range, { fromBlock: 101, toBlock: 101, tokenIds: [TOKEN_ID], ready: 1, ineligible: 0 });
});

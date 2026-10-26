import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveReleasedLooperAccount } from '../src/looper-account.js';
import * as credifi from '../src/credifi-owner-opt-in.js';

const OWNER = '0x2027af123cc4c3ced6ad389081e532af47b4dd89';
const OTHER = '0x1111111111111111111111111111111111111111';
const HASH_100 = '0x' + 'aa'.repeat(32);
const HASH_101 = '0x' + 'bb'.repeat(32);
const ACCOUNT = deriveReleasedLooperAccount('11');

function proof(overrides = {}) {
  return {
    chainId: 8453,
    collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
    tokenId: '11',
    safeBlock: { number: 100, hash: HASH_100 },
    account: ACCOUNT,
    accountDeployed: true,
    accountOwner: OWNER,
    accountToken: { chainId: 8453, collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', tokenId: '11' },
    owner: OWNER,
    controller: OWNER,
    erc8004AgentId: '86180',
    latest: { owner: OWNER, controller: OWNER },
    ...overrides,
  };
}

function custody(overrides = {}) {
  return {
    safeBlock: { number: 101, hash: HASH_101 },
    safeOwner: OWNER,
    safeController: OWNER,
    safeErc8004AgentId: '86180',
    latestOwner: OWNER,
    latestController: OWNER,
    latestErc8004AgentId: '86180',
    canonicalAccount: ACCOUNT,
    range: { fromBlock: 101, toBlock: 101 },
    events: [],
    priorSafeHash: HASH_100,
    ...overrides,
  };
}

function provider(id, value = custody()) {
  return { id, approved: true, maxRange: 20, async readCustody() { return structuredClone(value); }, async readAccountIntegrity() {}, async readFinalizedHead() {} };
}

function verifier({ integrity = { eligible: true, status: 'ready', proof: proof() }, providers = [provider('drpc'), provider('blast')] } = {}) {
  return credifi.createCredifiOwnerOptInVerifier({
    providers,
    accountIntegrityReader: { async read() { return structuredClone(integrity); } },
    maxTransferScanBlocks: 20,
  });
}

test('exports an opt-in-specific verifier with enough time for the paced dual-provider proof', () => {
  assert.equal(typeof credifi.createCredifiOwnerOptInVerifier, 'function');
  assert.equal(credifi.CREDIFI_OWNER_OPT_IN_VERIFICATION_TIMEOUT_MS, 15_000);
});

test('reports transient provider failures as retryable instead of owner mismatches', async () => {
  for (const status of ['provider_timeout', 'provider_unavailable', 'provider_disagreement', 'safe_block_disagreement']) {
    await assert.rejects(
      verifier({ integrity: { eligible: false, status, proof: null } }).verify({ tokenId: '11', wallet: OWNER }),
      (error) => error.code === 'credifi_opt_in_provider_unavailable' && error.status === 503 && /retry/i.test(error.message),
    );
  }
  await assert.rejects(
    credifi.createCredifiOwnerOptInVerifier({
      providers: [provider('drpc'), provider('blast')],
      accountIntegrityReader: { async read() { throw new Error('rpc transport failed'); } },
    }).verify({ tokenId: '11', wallet: OWNER }),
    (error) => error.code === 'credifi_opt_in_provider_unavailable' && error.status === 503,
  );
});

test('surfaces one transient integrity failure without a retry that can outlive the browser request', async () => {
  let reads = 0;
  const v = credifi.createCredifiOwnerOptInVerifier({
    providers: [provider('drpc'), provider('blast')],
    accountIntegrityReader: { async read() { reads += 1; return { eligible: false, status: 'provider_unavailable', proof: null }; } },
  });

  await assert.rejects(
    v.verify({ tokenId: '11', wallet: OWNER }),
    (error) => error.code === 'credifi_opt_in_provider_unavailable' && error.status === 503,
  );
  assert.equal(reads, 1);
});

test('briefly caches a successful finalized proof for immediate browser retries', async () => {
  let reads = 0;
  let now = 1_000;
  const v = credifi.createCredifiOwnerOptInVerifier({
    providers: [provider('drpc'), provider('blast')],
    accountIntegrityReader: { async read() { reads += 1; return { eligible: true, status: 'ready', proof: proof() }; } },
    cacheTtlMs: 15_000,
    now: () => now,
  });

  const first = await v.verify({ tokenId: '11', wallet: OWNER });
  const second = await v.verify({ tokenId: '11', wallet: OWNER });
  assert.deepEqual(second, first);
  assert.equal(reads, 1);
  now += 15_001;
  await v.verify({ tokenId: '11', wallet: OWNER });
  assert.equal(reads, 2);
});

test('coalesces concurrent integrity reads for the same token and wallet', async () => {
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const v = credifi.createCredifiOwnerOptInVerifier({
    providers: [provider('drpc'), provider('blast')],
    accountIntegrityReader: {
      async read() {
        reads += 1;
        await gate;
        return { eligible: true, status: 'ready', proof: proof() };
      },
    },
  });

  const first = v.verify({ tokenId: '11', wallet: OWNER });
  const second = v.verify({ tokenId: '11', wallet: OWNER });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 1);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, right);
});

test('requires dual-provider released-v1 identity, runtime, account-owner, token, and current controller consensus', async () => {
  const identity = await verifier().verify({ tokenId: '11', wallet: OWNER });
  assert.deepEqual(identity, {
    chainId: 8453,
    contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
    tokenId: '11', owner: OWNER, erc8004AgentId: '86180', controllerVerified: true,
    canonicalAccount: ACCOUNT, finalizedBlock: { number: 100, hash: HASH_100 },
  });
  for (const [status, patch] of [
    ['proxy_mismatch', { accountDeployed: false }],
    ['binding_mismatch', { accountToken: { chainId: 8453, collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', tokenId: '19' } }],
    ['ownership_mismatch', { accountOwner: OTHER }],
  ]) {
    const integrity = status === 'safe_block_disagreement'
      ? { eligible: false, status, proof: null }
      : { eligible: true, status: 'ready', proof: proof(patch) };
    await assert.rejects(verifier({ integrity }).verify({ tokenId: '11', wallet: OWNER }), (error) => error.code === 'credifi_opt_in_verification_failed');
  }
});

test('cross-checks the primary event provider against a second provider at the same finalized block', async () => {
  const current = { ...(await verifier().verify({ tokenId: '11', wallet: OWNER })), finalizedBlock: { number: 101, hash: HASH_101 } };
  const consent = { finalizedBlock: { number: 100, hash: HASH_100 } };
  assert.deepEqual(await verifier().verifyCustodyEpoch({ identity: current, consent }), { active: true, reason: null });
  const stale = provider('blast', custody({ safeBlock: { number: 101, hash: '0x' + 'cc'.repeat(32) } }));
  await assert.rejects(verifier({ providers: [provider('drpc'), stale] }).verifyCustodyEpoch({ identity: current, consent }), (error) => error.code === 'credifi_opt_in_provider_disagreement');
});

test('permanently invalidates an A to B to A custody round-trip because any intervening Transfer ends the epoch', async () => {
  const transferOut = { kind: 'transfer', source: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', tokenId: '11', blockNumber: 101, blockHash: HASH_101, transactionHash: '0x' + 'dd'.repeat(32), transactionIndex: 0, logIndex: 0, from: OWNER, to: OTHER };
  const transferBack = { ...transferOut, transactionHash: '0x' + 'ee'.repeat(32), logIndex: 1, from: OTHER, to: OWNER };
  const evidence = custody({ events: [transferOut, transferBack] });
  const v = verifier({ providers: [provider('drpc', evidence), provider('blast', evidence)] });
  const identity = { ...(await v.verify({ tokenId: '11', wallet: OWNER })), finalizedBlock: { number: 101, hash: HASH_101 } };
  assert.deepEqual(await v.verifyCustodyEpoch({ identity, consent: { finalizedBlock: { number: 100, hash: HASH_100 } } }), { active: false, reason: 'intervening_transfer' });
});

test('expires consent without scanning when the finalized gap exceeds the proven provider bound', async () => {
  let reads = 0;
  const counted = provider('drpc');
  counted.readCustody = async () => { reads += 1; return custody(); };
  const v = verifier({ providers: [counted, provider('blast')] });
  const identity = { ...(await v.verify({ tokenId: '11', wallet: OWNER })), finalizedBlock: { number: 121, hash: '0x' + 'ff'.repeat(32) } };
  assert.deepEqual(await v.verifyCustodyEpoch({ identity, consent: { finalizedBlock: { number: 100, hash: HASH_100 } } }), { active: false, reason: 'scan_window_expired' });
  assert.equal(reads, 0);
});

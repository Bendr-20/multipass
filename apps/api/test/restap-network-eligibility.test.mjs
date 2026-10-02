import assert from 'node:assert/strict';
import test from 'node:test';

import { createRestapNetworkEligibilityResolver, RESTAP_NETWORK_ELIGIBILITY_BOUNDARIES } from '../src/restap-network/eligibility.js';

const NOW = 2_000;
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x1111111111111111111111111111111111111111';
const CONTROLLER = '0x2222222222222222222222222222222222222222';
const ACCOUNT_1 = '0x3333333333333333333333333333333333333333';
const ACCOUNT_2 = '0x4444444444444444444444444444444444444444';
const OTHER_ACCOUNT = '0x5555555555555555555555555555555555555555';
const BLOCK_HASH = '0x' + 'ab'.repeat(32);

function clone(value) { return structuredClone(value); }

function tokenState(tokenId, account) {
  return {
    codex: { member: true, identityId: 'codex:' + tokenId },
    derivedAccount: account,
    integrity: {
      eligible: true,
      status: 'ready',
      proof: {
        chainId: 8453,
        collection: COLLECTION,
        tokenId,
        account,
        owner: OWNER,
        controller: CONTROLLER,
        safeBlock: { number: 100, hash: BLOCK_HASH },
        latest: { owner: OWNER, controller: CONTROLLER },
      },
    },
    custody: {
      chainId: 8453,
      collection: COLLECTION,
      tokenId,
      generation: 1,
      canonicalAccount: account,
      owner: OWNER,
      controller: CONTROLLER,
      safeBlockNumber: 100,
      safeBlockHash: BLOCK_HASH,
      status: 'ready',
    },
    lease: {
      leaseId: tokenId.repeat(32),
      chainId: 8453,
      collection: COLLECTION,
      tokenId,
      custodyGeneration: 1,
      canonicalAccount: account,
      owner: OWNER,
      controller: CONTROLLER,
      issuedAt: NOW - 20,
      lastRenewedAt: NOW - 10,
      expiresAt: NOW + 10_000,
      status: 'active',
    },
    policy: {
      policyVersion: 1,
      custodyGeneration: 1,
      networkEnabled: true,
      inboundEnabled: true,
      autonomousEnabled: false,
      topics: ['general', 'project-updates'],
      allowTokenIds: [],
      blockTokenIds: [],
      muteUntil: null,
    },
    rostered: true,
    gates: { global: true, phase: true, collection: true, token: true, emergency: false },
    breakers: { global: 'closed', collection: 'closed', token: 'closed', pair: 'closed', provider: 'closed' },
  };
}

function fixture() {
  const states = { '1': tokenState('1', ACCOUNT_1), '2': tokenState('2', ACCOUNT_2) };
  const metrics = [];
  const reads = { codex: 0, derived: 0, integrity: 0, custody: 0, lease: 0, policy: 0, roster: 0, gates: 0, breakers: 0 };
  const resolver = createRestapNetworkEligibilityResolver({
    now: () => NOW,
    readCodexMembership: async ({ tokenId }) => { reads.codex += 1; return clone(states[tokenId].codex); },
    deriveCanonicalAccount: ({ tokenId }) => { reads.derived += 1; return states[tokenId].derivedAccount; },
    readAccountIntegrity: async ({ tokenId }) => { reads.integrity += 1; return clone(states[tokenId].integrity); },
    readCustody: async ({ tokenId }) => { reads.custody += 1; return clone(states[tokenId].custody); },
    readActivationLease: async ({ tokenId }) => { reads.lease += 1; return clone(states[tokenId].lease); },
    readPolicy: async ({ tokenId }) => { reads.policy += 1; return clone(states[tokenId].policy); },
    readPilotRoster: async ({ tokenId }) => { reads.roster += 1; return states[tokenId].rostered; },
    readGates: async ({ tokenId }) => { reads.gates += 1; return clone(states[tokenId].gates); },
    readBreakers: async ({ tokenId }) => { reads.breakers += 1; return clone(states[tokenId].breakers); },
    recordMetric: (metric) => metrics.push(metric),
  });
  return { states, metrics, reads, resolver };
}

function peerInput(boundary = 'discovery') {
  return { chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2', boundary };
}

function selfInput(boundary = 'policy_mutation') {
  return { chainId: 8453, collection: COLLECTION, tokenId: '1', owner: OWNER, boundary };
}

function assertDeepFrozen(value) {
  assert.equal(Object.isFrozen(value), true);
  for (const item of Object.values(value)) if (item && typeof item === 'object') assertDeepFrozen(item);
}

test('eligible relay peers and owner self projection are bounded and deeply frozen', async () => {
  const f = fixture();
  const peer = await f.resolver.resolvePeerForRelay(peerInput());
  assert.deepEqual(peer, {
    status: 'eligible', chainId: 8453, collection: COLLECTION, senderTokenId: '1', recipientTokenId: '2',
    senderAccount: ACCOUNT_1, recipientAccount: ACCOUNT_2, senderIdentityId: 'codex:1', recipientIdentityId: 'codex:2',
    senderCustodyGeneration: 1, recipientCustodyGeneration: 1, senderActivationLeaseId: '1'.repeat(32), recipientActivationLeaseId: '2'.repeat(32),
    senderPolicyVersion: 1, recipientPolicyVersion: 1, topics: ['general', 'project-updates'],
  });
  assertDeepFrozen(peer);
  const self = await f.resolver.resolveSelfForConsole(selfInput());
  assert.equal(self.status, 'eligible');
  assert.equal(self.diagnostic, 'eligible');
  assert.equal(self.transcriptCapability, 'unavailable');
  assertDeepFrozen(self);
});

test('peer eligibility is an exact conjunction and every failure is uniformly unavailable', async () => {
  const cases = [
    ['codex membership', (s) => { s['2'].codex.member = false; }],
    ['canonical derivation', (s) => { s['2'].derivedAccount = OTHER_ACCOUNT; }],
    ...['account_missing', 'proxy_mismatch', 'implementation_mismatch', 'binding_mismatch', 'registry_mismatch', 'policy_mismatch', 'provider_disagreement'].map((status) => ['account integrity ' + status, (s) => { s['2'].integrity.eligible = false; s['2'].integrity.status = status; s['2'].integrity.proof = null; }]),
    ['integrity binding', (s) => { s['2'].integrity.proof.account = OTHER_ACCOUNT; }],
    ['latest owner', (s) => { s['2'].integrity.proof.latest.owner = CONTROLLER; }],
    ['latest controller', (s) => { s['2'].integrity.proof.latest.controller = OWNER; }],
    ['custody owner', (s) => { s['2'].custody.owner = CONTROLLER; }],
    ['custody controller', (s) => { s['2'].custody.controller = OWNER; }],
    ['custody ready', (s) => { s['2'].custody.status = 'disputed'; }],
    ['safe authority number', (s) => { s['2'].custody.safeBlockNumber = 101; }],
    ['safe authority hash', (s) => { s['2'].custody.safeBlockHash = '0x' + 'cd'.repeat(32); }],
    ['custody epoch', (s) => { s['2'].lease.custodyGeneration = 2; }],
    ['lease active', (s) => { s['2'].lease.status = 'candidate'; }],
    ['lease identifier', (s) => { s['2'].lease.leaseId = 'short'; }],
    ['lease issuance', (s) => { s['2'].lease.issuedAt = NOW; s['2'].lease.lastRenewedAt = NOW - 1; }],
    ['lease expiry', (s) => { s['2'].lease.expiresAt = NOW; }],
    ['lease reauthorization time', (s) => { s['2'].lease.lastRenewedAt = NOW + 1; }],
    ['lease TTL', (s) => { s['2'].lease.expiresAt = s['2'].lease.lastRenewedAt + (24 * 60 * 60 * 1_000) + 1; }],
    ['lease account', (s) => { s['2'].lease.canonicalAccount = OTHER_ACCOUNT; }],
    ['policy custody epoch', (s) => { s['2'].policy.custodyGeneration = 2; }],
    ['owner opt in', (s) => { s['2'].policy.networkEnabled = false; }],
    ['pilot roster', (s) => { s['2'].rostered = false; }],
    ['global gate', (s) => { s['2'].gates.global = false; }],
    ['phase gate', (s) => { s['2'].gates.phase = false; }],
    ['collection gate', (s) => { s['2'].gates.collection = false; }],
    ['token gate', (s) => { s['2'].gates.token = false; }],
    ['emergency gate', (s) => { s['2'].gates.emergency = true; }],
    ['inbound policy', (s) => { s['2'].policy.inboundEnabled = false; }],
    ['sender block', (s) => { s['1'].policy.blockTokenIds = ['2']; }],
    ['recipient block', (s) => { s['2'].policy.blockTokenIds = ['1']; }],
    ['sender allow', (s) => { s['1'].policy.allowTokenIds = ['3']; }],
    ['recipient allow', (s) => { s['2'].policy.allowTokenIds = ['3']; }],
    ['mute', (s) => { s['2'].policy.muteUntil = NOW + 1; }],
    ['topic intersection', (s) => { s['2'].policy.topics = ['trait-discussion']; }],
    ...['global', 'collection', 'token', 'pair', 'provider'].map((scope) => ['breaker ' + scope, (s) => { s['2'].breakers[scope] = 'open'; }]),
  ];
  for (const [label, mutate] of cases) {
    const f = fixture(); mutate(f.states);
    assert.deepEqual(await f.resolver.resolvePeerForRelay(peerInput()), { status: 'unavailable' }, label);
  }
});

test('self diagnostics are fixed-class and disclosed only to the freshly verified current owner', async () => {
  const f = fixture();
  f.states['1'].policy.networkEnabled = false;
  assert.deepEqual(await f.resolver.resolveSelfForConsole(selfInput()), {
    status: 'unavailable', diagnostic: 'policy', transcriptCapability: 'unavailable',
  });
  assert.deepEqual(await f.resolver.resolveSelfForConsole({ ...selfInput(), owner: CONTROLLER }), { status: 'unavailable' });
  f.states['1'].custody.owner = CONTROLLER;
  assert.deepEqual(await f.resolver.resolveSelfForConsole(selfInput()), { status: 'unavailable' });
});

test('all mandatory boundaries are accepted and every other value is rejected', async () => {
  assert.deepEqual(RESTAP_NETWORK_ELIGIBILITY_BOUNDARIES, ['discovery', 'intent_lease', 'reserve', 'pre_dispatch', 'pre_commit', 'policy_mutation', 'reply']);
  for (const boundary of RESTAP_NETWORK_ELIGIBILITY_BOUNDARIES) {
    const f = fixture();
    assert.equal((await f.resolver.resolvePeerForRelay(peerInput(boundary))).status, 'eligible');
  }
  const f = fixture();
  await assert.rejects(() => f.resolver.resolvePeerForRelay(peerInput('delivery')), /boundary/i);
  await assert.rejects(() => f.resolver.resolvePeerForRelay({ ...peerInput(), cachedAuthority: f.states['1'].custody }), /unknown key/i);
  await assert.rejects(() => f.resolver.resolveSelfForConsole(Object.assign(Object.create({ polluted: true }), selfInput())), /plain object/i);
});

test('every call rereads server authority and never trusts cached UI or process state', async () => {
  const f = fixture();
  assert.equal((await f.resolver.resolvePeerForRelay(peerInput())).status, 'eligible');
  const afterFirst = { ...f.reads };
  f.states['2'].policy.networkEnabled = false;
  assert.deepEqual(await f.resolver.resolvePeerForRelay(peerInput('pre_dispatch')), { status: 'unavailable' });
  for (const [name, count] of Object.entries(afterFirst)) assert.equal(f.reads[name] > count, true, name);
});

test('metrics contain only a boundary and bounded status class', async () => {
  const f = fixture();
  await f.resolver.resolvePeerForRelay(peerInput('reserve'));
  f.states['2'].policy.networkEnabled = false;
  await f.resolver.resolvePeerForRelay(peerInput('pre_commit'));
  assert.deepEqual(f.metrics, [
    { boundary: 'reserve', outcome: 'eligible' },
    { boundary: 'pre_commit', outcome: 'unavailable' },
  ]);
  for (const metric of f.metrics) assertDeepFrozen(metric);
});

test('malformed, missing, throwing, and asynchronous authority dependencies fail closed', async () => {
  const f = fixture();
  f.states['2'].lease = {};
  assert.deepEqual(await f.resolver.resolvePeerForRelay(peerInput()), { status: 'unavailable' });

  const broken = createRestapNetworkEligibilityResolver({
    now: () => NOW,
    readCodexMembership: async () => { throw new Error('secret provider detail'); },
    deriveCanonicalAccount: () => ACCOUNT_1,
    readAccountIntegrity: async () => ({}), readCustody: async () => ({}), readActivationLease: async () => ({}),
    readPolicy: async () => ({}), readPilotRoster: async () => true, readGates: async () => ({}), readBreakers: async () => ({}),
    recordMetric: () => {},
  });
  assert.deepEqual(await broken.resolvePeerForRelay(peerInput()), { status: 'unavailable' });

  const invalidClock = fixture();
  invalidClock.resolver = createRestapNetworkEligibilityResolver({
    now: () => { throw new Error('clock detail'); },
    readCodexMembership: async () => ({}), deriveCanonicalAccount: () => ACCOUNT_1, readAccountIntegrity: async () => ({}),
    readCustody: async () => ({}), readActivationLease: async () => ({}), readPolicy: async () => ({}),
    readPilotRoster: async () => true, readGates: async () => ({}), readBreakers: async () => ({}), recordMetric: () => {},
  });
  assert.deepEqual(await invalidClock.resolver.resolvePeerForRelay(peerInput()), { status: 'unavailable' });
});

test('constructor and call inputs are exact, same-token relays are rejected, and outputs expose no transcripts', async () => {
  assert.throws(() => createRestapNetworkEligibilityResolver({}), /dependencies/i);
  const f = fixture();
  await assert.rejects(() => f.resolver.resolvePeerForRelay({ ...peerInput(), recipientTokenId: '1' }), /differ/i);
  await assert.rejects(() => f.resolver.resolvePeerForRelay({ ...peerInput(), senderTokenId: '01' }), /token ID/i);
  const result = await f.resolver.resolvePeerForRelay(peerInput());
  assert.equal('transcript' in result, false);
  assert.equal('owner' in result, false);
  assert.equal('controller' in result, false);
});

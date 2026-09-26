import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_ERC8004_REGISTRY,
  DEFAULT_LOOPER_CRED_API_BASE_URL,
  LOOPERS_MAINNET_COLLECTION,
  LooperCredClientError,
  createLooperCredClient,
  enrichOwnedLoopersWithCred,
  normalizeCanonicalLooperCred,
} from '../src/looper-cred-client.js';

const COMPUTED_AT = '2026-09-26T22:00:00.000Z';
const EXPECTED_SUBJECT = Object.freeze({
  chainId: 8453,
  agentId: '87043',
  looperTokenId: '614',
});

function canonicalPayload(overrides = {}) {
  const { subject, evidenceCoverage, freshness, ...rest } = overrides;
  return {
    subject: {
      chainId: 8453,
      registry: CANONICAL_ERC8004_REGISTRY,
      agentId: '87043',
      collection: LOOPERS_MAINNET_COLLECTION,
      looperTokenId: '614',
      ...subject,
    },
    score: 40,
    tier: 'MARGINAL',
    evidenceCoverage: {
      score: 45,
      label: 'PARTIAL',
      present: ['binding', 'metadata'],
      missing: ['continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'],
      ...evidenceCoverage,
    },
    freshness: {
      status: 'fresh',
      stale: false,
      cached: false,
      ageSeconds: 0,
      maxAgeSeconds: 300,
      staleIfErrorSeconds: 86400,
      ...freshness,
    },
    methodologyVersion: 'looper-cred-v1',
    computedAt: COMPUTED_AT,
    updatedAt: COMPUTED_AT,
    ...rest,
  };
}

function normalizedCred(overrides = {}) {
  return {
    score: 40,
    tier: 'MARGINAL',
    coverage: {
      score: 45,
      label: 'PARTIAL',
      present: ['binding', 'metadata'],
      missing: ['continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'],
    },
    freshness: {
      status: 'fresh',
      stale: false,
      cached: false,
      ageSeconds: 0,
      maxAgeSeconds: 300,
      staleIfErrorSeconds: 86400,
    },
    methodologyVersion: 'looper-cred-v1',
    computedAt: COMPUTED_AT,
    updatedAt: COMPUTED_AT,
    status: 'available',
    ...overrides,
  };
}

function responseJson(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('canonical CRED client uses the exact ERC-8004 route and registry namespace', async () => {
  let request;
  const client = createLooperCredClient({
    baseUrl: 'https://cred.internal.example/root/',
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return responseJson(canonicalPayload());
    },
  });

  const result = await client.getCred(EXPECTED_SUBJECT);

  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://cred.internal.example/api/v2/cred/erc8004/8453/87043');
  assert.equal(url.searchParams.get('registry'), CANONICAL_ERC8004_REGISTRY);
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.accept, 'application/json');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(result, normalizedCred());
  assert.equal(DEFAULT_LOOPER_CRED_API_BASE_URL, 'https://api.helixa.xyz');
});

test('normalizer rejects identity/token collisions and every canonical subject mismatch', () => {
  const cases = [
    ['chain', { subject: { chainId: 1 } }, 'subject_mismatch'],
    ['registry', { subject: { registry: '0x0000000000000000000000000000000000000001' } }, 'subject_mismatch'],
    ['agent identity', { subject: { agentId: '614' } }, 'subject_mismatch'],
    ['collection', { subject: { collection: '0x0000000000000000000000000000000000000001' } }, 'subject_mismatch'],
    ['Looper token', { subject: { looperTokenId: '87043' } }, 'subject_mismatch'],
  ];
  for (const [label, overrides, code] of cases) {
    assert.throws(
      () => normalizeCanonicalLooperCred(canonicalPayload(overrides), EXPECTED_SUBJECT),
      (error) => error instanceof LooperCredClientError && error.code === code,
      label,
    );
  }
});

test('normalizer rejects out-of-bounds score and evidence coverage', () => {
  for (const payload of [
    canonicalPayload({ score: -1 }),
    canonicalPayload({ score: 101 }),
    canonicalPayload({ score: 40.5 }),
    canonicalPayload({ evidenceCoverage: { score: -1 } }),
    canonicalPayload({ evidenceCoverage: { score: 101 } }),
    canonicalPayload({ evidenceCoverage: { score: 45.5 } }),
  ]) {
    assert.throws(
      () => normalizeCanonicalLooperCred(payload, EXPECTED_SUBJECT),
      (error) => error instanceof LooperCredClientError && error.code === 'invalid_response',
    );
  }
});

test('normalizer validates tiers, coverage evidence sets, freshness, methodology, and timestamps', () => {
  const invalidPayloads = [
    canonicalPayload({ tier: 'LEGENDARY' }),
    canonicalPayload({ score: 40, tier: 'PRIME' }),
    canonicalPayload({ evidenceCoverage: { label: '<script>alert(1)</script>' } }),
    canonicalPayload({ evidenceCoverage: { score: 45, label: 'GOOD' } }),
    canonicalPayload({ evidenceCoverage: { present: ['binding', 'binding'] } }),
    canonicalPayload({ evidenceCoverage: { present: ['binding'], missing: ['binding', 'metadata', 'continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'] } }),
    canonicalPayload({ evidenceCoverage: { present: ['binding'], missing: ['metadata'] } }),
    canonicalPayload({ freshness: { status: 'fresh', stale: true } }),
    canonicalPayload({ freshness: { ageSeconds: -1 } }),
    canonicalPayload({ freshness: { ageSeconds: 301, maxAgeSeconds: 300 } }),
    canonicalPayload({ freshness: { status: 'stale', stale: true, cached: true, ageSeconds: 901, staleIfErrorSeconds: 900 } }),
    canonicalPayload({ methodologyVersion: '<script>' }),
    canonicalPayload({ computedAt: 'yesterday' }),
    canonicalPayload({ updatedAt: '<img src=x onerror=alert(1)>' }),
  ];
  for (const payload of invalidPayloads) {
    assert.throws(
      () => normalizeCanonicalLooperCred(payload, EXPECTED_SUBJECT),
      (error) => error instanceof LooperCredClientError && error.code === 'invalid_response',
    );
  }
});

test('normalizer accepts fresh and explicitly stale snapshots without hiding backend freshness', () => {
  assert.deepEqual(
    normalizeCanonicalLooperCred(canonicalPayload(), EXPECTED_SUBJECT),
    normalizedCred(),
  );

  const stale = normalizeCanonicalLooperCred(canonicalPayload({
    freshness: {
      status: 'stale',
      stale: true,
      cached: true,
      ageSeconds: 901,
      reason: 'upstream_timeout',
    },
  }), EXPECTED_SUBJECT);
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.freshness, {
    status: 'stale',
    stale: true,
    cached: true,
    ageSeconds: 901,
    maxAgeSeconds: 300,
    staleIfErrorSeconds: 86400,
    reason: 'upstream_timeout',
  });
});

test('client exposes stable typed timeout and upstream errors without accepting a score', async () => {
  const timedOut = createLooperCredClient({
    timeoutMs: 5,
    fetchImpl: async () => new Promise(() => {}),
  });
  await assert.rejects(
    timedOut.getCred(EXPECTED_SUBJECT),
    (error) => error instanceof LooperCredClientError && error.code === 'upstream_timeout' && error.status === 504,
  );

  const unavailable = createLooperCredClient({
    fetchImpl: async () => responseJson({ error: 'looper_identity_unmapped', detail: '<script>' }, { status: 404 }),
  });
  await assert.rejects(
    unavailable.getCred(EXPECTED_SUBJECT),
    (error) => error instanceof LooperCredClientError && error.code === 'looper_identity_unmapped' && error.status === 404,
  );
});

test('enrichment waits for resolved identities, excludes owner evidence, and is transfer invariant', async () => {
  const inputs = [];
  const credClient = {
    async getCred(input) {
      inputs.push(input);
      return normalizedCred();
    },
  };
  const before = [{
    tokenId: '614',
    erc8004AgentId: '87043',
    chainId: 8453,
    owner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ownerBalance: '999',
    ownerActivity: [{ hash: '0xowner' }],
    ownerSocials: ['@owner'],
    ownerReputation: 100,
  }];
  const after = [{ ...before[0], owner: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', ownerBalance: '0', ownerActivity: [] }];

  const [beforeResult, afterResult] = await Promise.all([
    enrichOwnedLoopersWithCred(before, { credClient }),
    enrichOwnedLoopersWithCred(after, { credClient }),
  ]);

  assert.deepEqual(inputs, [EXPECTED_SUBJECT, EXPECTED_SUBJECT]);
  assert.deepEqual(beforeResult[0].cred, afterResult[0].cred);
  assert.equal(beforeResult[0].credScore, 40);
  assert.equal(beforeResult[0].credLabel, 'CRED 40 · MARGINAL');
  assert.equal(JSON.stringify(inputs).toLowerCase().includes('owner'), false);
});

test('enrichment returns stable unavailable CRED for missing identities and typed failures', async () => {
  let calls = 0;
  const credClient = {
    async getCred() {
      calls += 1;
      throw new LooperCredClientError('upstream_timeout', { status: 504 });
    },
  };
  const [missing, unavailable] = await enrichOwnedLoopersWithCred([
    { tokenId: '1', erc8004AgentId: null, credScore: 99, credLabel: 'Cred 99' },
    { tokenId: '614', erc8004AgentId: '87043', credScore: 65, credLabel: 'Cred 65' },
  ], { credClient });

  assert.equal(calls, 1);
  assert.deepEqual(missing.cred, {
    score: null,
    tier: null,
    coverage: null,
    freshness: null,
    methodologyVersion: null,
    computedAt: null,
    updatedAt: null,
    status: 'unavailable',
    error: { code: 'missing_identity' },
  });
  assert.equal(missing.credScore, null);
  assert.equal(missing.credLabel, 'CRED unavailable');
  assert.equal(unavailable.cred.error.code, 'upstream_timeout');
  assert.equal(unavailable.credScore, null);
  assert.equal(unavailable.credLabel, 'CRED unavailable');
});

test('enrichment deduplicates canonical subjects and bounds distinct upstream calls', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const credClient = {
    async getCred(input) {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return normalizedCred({ score: Number(input.looperTokenId), tier: 'MARGINAL' });
    },
  };
  const agents = [
    { tokenId: '1', erc8004AgentId: '101', chainId: 8453 },
    { tokenId: '1', erc8004AgentId: '101', chainId: 8453, owner: '0xchanged' },
    { tokenId: '2', erc8004AgentId: '102', chainId: 8453 },
    { tokenId: '3', erc8004AgentId: '103', chainId: 8453 },
    { tokenId: '4', erc8004AgentId: '104', chainId: 8453 },
    { tokenId: '5', erc8004AgentId: '105', chainId: 8453 },
  ];

  const enriched = await enrichOwnedLoopersWithCred(agents, { credClient, concurrency: 2 });

  assert.equal(calls, 5);
  assert.equal(maxActive, 2);
  assert.equal(enriched.length, agents.length);
  assert.equal(enriched[0].cred, enriched[1].cred);
  assert.equal(enriched[5].credScore, 5);
});

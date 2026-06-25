import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  HelixaResolverError,
  createLiveMarketplaceListing,
  fetchHelixaAgent,
  loadLiveHelixaMultipass,
  mapHelixaAgentToMultipassDemo,
  parseHelixaResolverInput,
} from '../src/live-helixa-resolver.js';

const testRoot = dirname(fileURLToPath(import.meta.url));

async function bendrFixture() {
  return JSON.parse(await readFile(join(testRoot, 'fixtures/helixa-agent-1.json'), 'utf8'));
}

async function quigbotFixture() {
  return JSON.parse(await readFile(join(testRoot, 'fixtures/helixa-agent-81.json'), 'utf8'));
}

test('parseHelixaResolverInput accepts token id and canonical Base Helixa id', () => {
  assert.deepEqual(parseHelixaResolverInput('1'), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
  assert.deepEqual(parseHelixaResolverInput(' 8453:1 '), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
});

test('parseHelixaResolverInput keeps large token ids as strings', () => {
  const parsed = parseHelixaResolverInput('8453:900719925474099312345');
  assert.equal(parsed.tokenId, '900719925474099312345');
  assert.equal(typeof parsed.tokenId, 'string');
});

test('parseHelixaResolverInput rejects empty zero unsupported and fuzzy inputs', () => {
  assert.throws(() => parseHelixaResolverInput(''), (error) => error instanceof HelixaResolverError && error.code === 'empty_input');
  assert.throws(() => parseHelixaResolverInput('0'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('8453:0'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1.2'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('-1'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('Bendr'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('@BendrAI_eth'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('https://helixa.xyz/agent/1'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1abc'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1:2:3'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1:1'), (error) => error instanceof HelixaResolverError && error.code === 'unsupported_chain');
});

test('fetchHelixaAgent requests the public Helixa API without private headers', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ tokenId: 1, name: 'Bendr 2.0' }) };
  };

  const agent = await fetchHelixaAgent('1', fetchImpl);

  assert.equal(agent.name, 'Bendr 2.0');
  assert.equal(calls[0].url, 'https://api.helixa.xyz/api/v2/agent/1');
  assert.equal(calls[0].options?.credentials, 'omit');
  assert.deepEqual(Object.keys(calls[0].options?.headers ?? {}), ['Accept']);
});

test('fetchHelixaAgent handles 404 and 429 responses as typed errors', async () => {
  await assert.rejects(
    () => fetchHelixaAgent('999999', async () => ({ ok: false, status: 404, headers: new Map(), text: async () => 'not found' })),
    (error) => error instanceof HelixaResolverError && error.code === 'not_found',
  );

  await assert.rejects(
    () => fetchHelixaAgent('1', async () => ({ ok: false, status: 429, headers: { get: () => '12' }, text: async () => 'rate limited' })),
    (error) => error instanceof HelixaResolverError && error.code === 'rate_limited' && error.details.retryAfter === '12',
  );
});

test('fetchHelixaAgent handles network failures and invalid JSON', async () => {
  await assert.rejects(
    () => fetchHelixaAgent('1', async () => { throw new Error('offline'); }),
    (error) => error instanceof HelixaResolverError && error.code === 'network_error',
  );

  await assert.rejects(
    () => fetchHelixaAgent('1', async () => ({ ok: true, status: 200, text: async () => '{bad json' })),
    (error) => error instanceof HelixaResolverError && error.code === 'invalid_json',
  );
});

test('mapHelixaAgentToMultipassDemo maps Bendr public API data into Multipass display shape', async () => {
  const data = mapHelixaAgentToMultipassDemo(await bendrFixture());

  assert.equal(data.modeLabel, 'Live Profile');
  assert.equal(data.sourceLabel, 'live Helixa API');
  assert.equal(data.liveProfilePage.headline, 'Bendr 2.0 Multipass');
  assert.equal(data.liveProfilePage.headerMeta, 'Live profile · 8453:1');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/?agent=1');
  assert.match(data.liveProfilePage.recordIntro, /public Helixa API signals/);
  assert.equal(data.profile.display_name, 'Bendr 2.0');
  assert.equal(data.profile.slug, 'helixa-agent-1');
  assert.equal(data.profile.multipass_id, 'mp_helixa_agent_1');
  assert.equal(data.agentCards[0].helixaId, '8453:1');
  assert.equal(data.agentCards[0].credScore, 80);
  assert.equal(data.agentCards[0].credTier, 'Preferred');
  assert.equal(data.agentCards[0].ownerSnapshot.owner, '0x27E3...91Ea');
  assert.equal(data.agentCards[0].ownerSnapshot.operator, 'Not delegated');
  assert.match(data.agentCards[0].ownerSnapshot.note, /without executing approvals or transferring authority/i);
  assert.ok(data.agentCards[0].changeReviewLedger.length >= 4);
  assert.match(JSON.stringify(data.agentCards[0].changeReviewLedger), /Live profile fetched/);
  assert.equal(data.agentCards[0].transferPreview.claimAction, 'No transfer detected');
  assert.equal(data.receipt.status, 'not_attached');
  assert.equal(data.receipt.receipt_id, 'No live receipt attached');
});

test('mapHelixaAgentToMultipassDemo creates public readable fragments without private leaks or fake receipts', async () => {
  const fixture = await bendrFixture();
  fixture.private_api_key = 'secret';
  fixture.hiddenCredential = 'secret';

  const data = mapHelixaAgentToMultipassDemo(fixture);
  const rendered = JSON.stringify(data);

  assert.equal(rendered.includes('private_api_key'), false);
  assert.equal(rendered.includes('hiddenCredential'), false);
  assert.equal(rendered.includes('"secret"'), false);
  assert.ok(data.fragments.fragments.every((fragment) => fragment.visibility === 'public'));
  assert.deepEqual(data.agentCards[0].proofFragmentIds, data.fragments.fragments.map((fragment) => fragment.fragment_id));
  assert.match(data.fragments.fragments.map((fragment) => fragment.public_value).join(' '), /Cred score 80/);
  assert.match(data.fragments.fragments.map((fragment) => fragment.public_value).join(' '), /X handle @BendrAI_eth/);
  assert.doesNotMatch(data.receipt.receipt_id, /receipt_bendr_lookup/);
});

test('mapHelixaAgentToMultipassDemo handles missing optional public fields', () => {
  const data = mapHelixaAgentToMultipassDemo({ tokenId: '81', name: 'Quigbot', verified: true, credScore: 75, services: {}, socials: {}, operator: null, linkedToken: null, traits: null });

  assert.equal(data.profile.display_name, 'Quigbot');
  assert.equal(data.agentCards[0].framework, 'unknown');
  assert.equal(data.agentCards[0].profileUrl, 'https://helixa.xyz/agent/81');
  assert.equal(data.liveProfilePage.headline, 'Quigbot Multipass');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/?agent=81');
  assert.equal(data.agentCards[0].ownerSnapshot.operator, 'Not delegated');
  assert.equal(data.x402.endpoints.length, 0);
});

test('createLiveMarketplaceListing maps Bendr into a marketplace listing', async () => {
  assert.equal(typeof createLiveMarketplaceListing, 'function');
  const mapped = mapHelixaAgentToMultipassDemo(await bendrFixture());
  const listing = mapped.marketplaceListing;

  assert.equal(listing.title, 'Verified agent listing for Bendr 2.0');
  assert.equal(listing.identity.helixaId, '8453:1');
  assert.equal(listing.identity.framework, 'openclaw');
  assert.equal(listing.score.label, 'Cred 80');
  assert.equal(listing.score.tier, 'Preferred');
  assert.equal(listing.facts.some((fact) => fact.label === 'Owner' && fact.value === '0x27E3...91Ea'), true);
  assert.equal(listing.routes.some((route) => route.label === 'Web' && route.url === 'https://helixa.xyz/agent/1'), true);
  assert.equal(listing.routes.some((route) => route.label === 'MCP' && route.url === 'https://api.helixa.xyz/api/mcp'), true);
  assert.equal(listing.paymentReferences.some((payment) => payment.value === 'USDC'), true);
  assert.equal(listing.paymentReferences.some((payment) => payment.value === 'CRED'), true);
  assert.equal(listing.links.some((link) => link.label === 'Explorer' && link.url?.includes('basescan.org')), true);
  assert.equal(listing.proof.privateCredentialState, 'No secrets or private credentials exposed');
  assert.equal(Number.isInteger(listing.proof.publicFragmentCount), true);
  assert.ok(listing.proof.publicFragmentCount >= 4);
});

test('createLiveMarketplaceListing maps Quigbot with no payment references', async () => {
  const listing = mapHelixaAgentToMultipassDemo(await quigbotFixture()).marketplaceListing;

  assert.equal(listing.title, 'Verified agent listing for Quigbot');
  assert.equal(listing.identity.helixaId, '8453:81');
  assert.equal(listing.score.label, 'Cred 75');
  assert.equal(listing.score.tier, 'Prime');
  assert.equal(listing.paymentReferences.length, 0);
  assert.equal(listing.routes.some((route) => route.label === 'X' && route.value === '@quigleynft'), true);
  assert.equal(listing.routes.some((route) => route.label === 'A2A'), true);
});

test('marketplace listing omits unsafe URLs and secret-bearing fields', () => {
  const agent = {
    tokenId: 999,
    name: 'Unsafe Test',
    credScore: 50,
    verified: true,
    owner: '0x0000000000000000000000000000000000000001',
    services: {
      web: { url: 'javascript:alert(1)' },
      file: { url: 'file:///etc/passwd' },
      safe: { url: 'https://example.com/agent' },
    },
    metadata: {
      acceptedPayments: ['usdc'],
      accessToken: 'do-not-render',
      sessionToken: 'do-not-render',
    },
    private_api_key: 'do-not-render',
    hiddenCredential: 'do-not-render',
    secret: 'do-not-render',
  };

  const mapped = mapHelixaAgentToMultipassDemo(agent);
  const serialized = JSON.stringify(mapped.marketplaceListing);

  assert.equal(serialized.includes('do-not-render'), false);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.value === 'https://example.com/agent' && route.url === 'https://example.com/agent'), true);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.url?.startsWith('javascript:')), false);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.url?.startsWith('file:')), false);
});

test('loadLiveHelixaMultipass parses fetches and maps live agent data', async () => {
  const calls = [];
  const data = await loadLiveHelixaMultipass('8453:1', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify(await bendrFixture()) };
  });

  assert.equal(calls[0].url, 'https://api.helixa.xyz/api/v2/agent/1');
  assert.equal(data.profile.display_name, 'Bendr 2.0');
  assert.equal(data.resolver?.canonicalId, '8453:1');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/?agent=1');
});

test('loadLiveHelixaMultipass rejects invalid input before fetch', async () => {
  let called = false;
  await assert.rejects(
    () => loadLiveHelixaMultipass('Bendr', async () => { called = true; }),
    (error) => error instanceof HelixaResolverError && error.code === 'invalid_format',
  );
  assert.equal(called, false);
});

test('loadLiveHelixaMultipass rejects unsupported chains before fetch', async () => {
  let called = false;
  await assert.rejects(
    () => loadLiveHelixaMultipass('1:1', async () => { called = true; }),
    (error) => error instanceof HelixaResolverError && error.code === 'unsupported_chain',
  );
  assert.equal(called, false);
});

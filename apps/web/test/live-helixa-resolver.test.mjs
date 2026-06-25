import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  HelixaResolverError,
  fetchHelixaAgent,
  loadLiveHelixaMultipass,
  mapHelixaAgentToMultipassDemo,
  parseHelixaResolverInput,
} from '../src/live-helixa-resolver.js';

const testRoot = dirname(fileURLToPath(import.meta.url));

async function bendrFixture() {
  return JSON.parse(await readFile(join(testRoot, 'fixtures/helixa-agent-1.json'), 'utf8'));
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

  assert.equal(data.modeLabel, 'Live Resolver');
  assert.equal(data.sourceLabel, 'live Helixa API');
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
  assert.equal(data.agentCards[0].ownerSnapshot.operator, 'Not delegated');
  assert.equal(data.x402.endpoints.length, 0);
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

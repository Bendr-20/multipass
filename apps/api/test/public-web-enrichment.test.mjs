import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { createSqliteSavedRecords } from '../src/saved-records.js';
import {
  buildPublicWebEnrichment,
  discoverPublicWebDocuments,
} from '../src/public-web-enrichment.js';

const NOW = '2026-07-10T04:10:00.000Z';
const execFileAsync = promisify(execFile);

function makeSavedRecord(overrides = {}) {
  const multipassId = overrides.multipassId ?? 'mp_helixa_agent_1127';
  const slug = overrides.slug ?? 'velvet-unicorn-1127';
  return {
    source: { sourceType: 'helixa_agent', canonicalId: overrides.canonicalId ?? '8453:1127', tokenId: overrides.tokenId ?? '1127' },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: 'live_agent_record',
        sourceType: 'helixa_agent',
        canonicalId: overrides.canonicalId ?? '8453:1127',
        tokenId: overrides.tokenId ?? '1127',
        savedAt: NOW,
      },
      sourceSnapshot: { name: overrides.displayName ?? 'Velvet-Unicorn', tokenId: overrides.tokenId ?? '1127' },
    },
    profile: {
      schema_version: '0.1.0',
      multipass_id: multipassId,
      subject_type: 'agent',
      display_name: overrides.displayName ?? 'Velvet-Unicorn',
      slug,
      status: 'active',
      owner_summary: { owner_state: 'unclaimed', verification_status: 'none', visibility: 'public' },
      custody_epoch: null,
      public_fragments: [],
      cred_summary: { trust_state: 'none', attestation_count: 0, receipt_count: 0, last_updated_at: NOW },
      discovery_profile: { summary: 'Saved from a public Helixa AgentDNA source record.', tags: ['helixa'], visibility: 'public' },
      standards_profile: { standards_profile_id: `sp_${multipassId}`, supported_standard_ids: ['ERC-8004'], last_verified_at: null },
      payment_profile: { accepted_assets: [], x402_manifest_url: null, paid_endpoints_enabled: false },
      updated_at: NOW,
    },
    fragments: [],
    agentCard: {
      schema_version: '0.1.0',
      multipass_id: multipassId,
      name: overrides.displayName ?? 'Velvet-Unicorn',
      subject_type: 'agent',
      capabilities: [],
      message_routes: [],
      service_endpoints: [],
      x402_manifest_url: null,
      accepted_assets: [],
      trust_summary: { identity_status: 'unverified', assurance_level: 'unverified', last_updated_at: null },
      rate_limits: { requests: 0, window_seconds: 60 },
      contact_policy: { mode: 'approval_required', requires_owner_approval: true },
      standards_refs: [],
    },
    standardsProfile: {
      schema_version: '0.1.0',
      standards_profile_id: `sp_${multipassId}`,
      multipass_id: multipassId,
      primary_refs: {},
      standard_refs: [],
      compatibility_summary: {
        identity_bound: false,
        owner_verified: false,
        risk_checked: false,
        tools_verified: false,
        work_attested: false,
        trust_updated: false,
      },
      adapter_versions: {},
      last_verified_at: null,
    },
    x402Manifest: { schema_version: '0.1.0', multipass_id: multipassId, endpoints: [] },
    receipts: [],
    change: { change_id: 'change_initial_save', message: 'Multipass saved from live public source record.', created_at: NOW },
  };
}

const velvetDocs = [
  {
    url: 'https://vu.velvetdao.xyz/landing/',
    title: 'Velvet Unicorn API - The DeFAI Operating System',
    text: `Velvet Unicorn is a multi-agent DeFAI API for crypto analysis, wallet profiling, market intelligence, and onchain execution.
      Public docs mention REST API, x402 pay-per-call, MCP server, Virtuals ACP, API keys, and 1,000 free requests.
      Image: https://vu.velvetdao.xyz/agent/vu.png`,
  },
  {
    url: 'https://vu.velvetdao.xyz/llms.txt',
    title: 'Velvet Unicorn llms.txt',
    text: `POST /agent-api/v1/ask - Ask Velvet-Unicorn a crypto, DeFi, or portfolio question.
      POST /agent-api/v1/token - Token Analysis covering price action, onchain activity, social sentiment, technical analysis, and token context.
      POST /agent-api/v1/trending - Trending Tokens and market discovery for chains, categories, movers, and risk.
      POST /agent-api/v1/wallet_analysis - Wallet Analysis for EVM and Solana addresses including holdings, PnL, history, and risk.
      POST /agent-api/v1/swap - Swap Execution returns ready-to-sign transaction payloads.
      POST /agent-api/v1/strategy/schema - Prompt-to-Strategy schema.
      POST /agent-api/v1/strategy/deploy - Prompt-to-Strategy deploy on Base spot beta.
      GET /agent-api/v1/strategy/status - Prompt-to-Strategy status.`,
  },
  {
    url: 'https://vu.velvetdao.xyz/strategy-plugin.txt',
    title: 'Prompt-to-Strategy plugin',
    text: 'Coding agents can use the Prompt-to-Strategy plugin for schema, token resolution, preflight, deploy, status, actions, and stop.',
  },
];

test('discoverPublicWebDocuments fetches seed and agent-readable docs without browser automation', async () => {
  const fetched = [];
  const available = new Map([
    ['https://vu.velvetdao.xyz/landing/', { status: 200, contentType: 'text/html', body: '<title>VU</title><main>Velvet docs</main>' }],
    ['https://vu.velvetdao.xyz/llms.txt', { status: 200, contentType: 'text/plain', body: 'POST /agent-api/v1/token - Token Analysis' }],
    ['https://vu.velvetdao.xyz/llms-full.txt', { status: 200, contentType: 'text/plain', body: 'POST /agent-api/v1/trending - Trending Tokens' }],
    ['https://vu.velvetdao.xyz/.well-known/openapi.json', { status: 404, contentType: 'application/json', body: '{}' }],
    ['https://vu.velvetdao.xyz/strategy-plugin.txt', { status: 200, contentType: 'text/plain', body: 'Prompt-to-Strategy plugin' }],
  ]);
  const fetchImpl = async (url) => {
    const normalized = String(url);
    fetched.push(normalized);
    const response = available.get(normalized) ?? { status: 404, contentType: 'text/plain', body: 'missing' };
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? response.contentType : null },
      text: async () => response.body,
    };
  };

  const documents = await discoverPublicWebDocuments({ seedUrl: 'https://vu.velvetdao.xyz/landing/', fetchImpl });

  assert.ok(fetched.includes('https://vu.velvetdao.xyz/llms.txt'));
  assert.ok(fetched.includes('https://vu.velvetdao.xyz/llms-full.txt'));
  assert.ok(fetched.includes('https://vu.velvetdao.xyz/.well-known/openapi.json'));
  assert.deepEqual(documents.map((document) => document.url), [
    'https://vu.velvetdao.xyz/landing/',
    'https://vu.velvetdao.xyz/llms.txt',
    'https://vu.velvetdao.xyz/llms-full.txt',
    'https://vu.velvetdao.xyz/strategy-plugin.txt',
  ]);
  assert.equal(documents[0].title, 'VU');
  assert.match(documents[0].text, /Velvet docs/);
});

test('discoverPublicWebDocuments rejects non-public seed hosts before fetching', async () => {
  const fetchImpl = async () => {
    throw new Error('fetch should not be called for unsafe seeds');
  };

  for (const seedUrl of ['https://localhost/', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://[::1]/', 'https://[fd00::1]/']) {
    await assert.rejects(
      discoverPublicWebDocuments({ seedUrl, fetchImpl }),
      /public hostname/,
      seedUrl,
    );
  }
});

test('discoverPublicWebDocuments preserves public route catalogs embedded in HTML scripts', async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'text/html' },
    text: async () => `
      <title>SIBYL x402 Intelligence</title>
      <meta name="description" content="SIBYL intelligence APIs via x402 micropayments on Base.">
      <script>
        var SERVICES = [
          { id: 'sibyl-score', name: 'SIBYL Score', path: '/api/sibyl-score', desc: 'token intelligence score' }
        ];
      </script>
    `,
  });

  const documents = await discoverPublicWebDocuments({ seedUrl: 'https://sibylcap.com/x402', fetchImpl });

  assert.match(documents[0].text, /SIBYL intelligence APIs via x402/);
  assert.match(documents[0].text, /path: '\/api\/sibyl-score'/);
});

test('buildPublicWebEnrichment extracts docs into clear unverified tools, routes, and capabilities', () => {
  const enrichment = buildPublicWebEnrichment({
    multipassId: 'mp_helixa_agent_1127',
    displayName: 'Velvet-Unicorn',
    seedUrl: 'https://vu.velvetdao.xyz/landing/',
    documents: velvetDocs,
    now: NOW,
  });

  assert.equal(enrichment.summary, 'Velvet Unicorn is a multi-agent DeFAI API for crypto analysis, wallet profiling, market intelligence, and onchain execution.');
  assert.equal(enrichment.avatarUrl, 'https://vu.velvetdao.xyz/agent/vu.png');
  assert.deepEqual(enrichment.sourceUrls, [
    'https://vu.velvetdao.xyz/landing/',
    'https://vu.velvetdao.xyz/llms.txt',
    'https://vu.velvetdao.xyz/strategy-plugin.txt',
  ]);
  assert.deepEqual(enrichment.tools.map((tool) => tool.toolId), [
    'vu-ask',
    'vu-token-analysis',
    'vu-trending',
    'vu-wallet-analysis',
    'vu-swap-execution',
    'vu-prompt-to-strategy',
  ]);
  assert.ok(enrichment.tools.every((tool) => tool.status === 'pending'));
  assert.ok(enrichment.tools.every((tool) => tool.verifiabilityTier === 'public_web_observed'));
  assert.ok(enrichment.tools.at(-1).description.includes('schema, token resolution, preflight, deploy, status'));
  assert.ok(enrichment.endpoints.some((endpoint) => endpoint.protocol === 'mcp'));
  assert.ok(enrichment.capabilities.some((capability) => capability.capabilityId === 'x402_pay_per_call'));
  assert.ok(enrichment.ownerWarning.includes('not owner-verified'));
});

test('buildPublicWebEnrichment cleans JSON summaries and route query examples', () => {
  const enrichment = buildPublicWebEnrichment({
    multipassId: 'mp_helixa_agent_73',
    displayName: 'mferGPT',
    seedUrl: 'https://x402.mfergpt.lol/',
    documents: [{
      url: 'https://x402.mfergpt.lol/',
      title: 'mferGPT x402',
      text: JSON.stringify({
        name: 'mferGPT',
        description: 'AI agent, community tool, and web3 developer.',
        endpoints: {
          free: { 'GET /health': 'Health check' },
          paid: { 'GET /lore?q=sartoshi': { description: 'Query lore' } },
        },
      }),
    }],
    now: NOW,
  });

  assert.equal(enrichment.summary, 'mferGPT: AI agent, community tool, and web3 developer.');
  assert.deepEqual(enrichment.tools.map((tool) => tool.toolId), ['x402-health', 'x402-lore']);
  assert.equal(enrichment.tools[1].endpointUrl, 'https://x402.mfergpt.lol/lore');
});

test('buildPublicWebEnrichment extracts JS service path catalogs from public pages', () => {
  const enrichment = buildPublicWebEnrichment({
    multipassId: 'mp_helixa_agent_1037',
    displayName: 'SIBYL',
    seedUrl: 'https://sibylcap.com/x402',
    documents: [{
      url: 'https://sibylcap.com/x402',
      title: 'SIBYL x402 Intelligence',
      text: `
        SIBYL x402 Intelligence is a paid API endpoint catalog on Base.
        var SERVICES = [
          { id: 'sibyl-score', name: 'SIBYL Score', path: '/api/sibyl-score', desc: 'comprehensive 0-100 token intelligence score.' },
          { id: 'evaluate', name: 'Full Evaluation', path: '/api/evaluate', desc: 'three-criterion conviction score.' }
        ];
      `,
    }],
    now: NOW,
  });

  assert.equal(enrichment.summary, 'SIBYL x402 Intelligence is a paid API endpoint catalog on Base.');
  assert.deepEqual(enrichment.tools.map((tool) => tool.toolId), ['sibylcap-sibyl-score', 'sibylcap-evaluate']);
  assert.equal(enrichment.tools[0].endpointUrl, 'https://sibylcap.com/api/sibyl-score');
  assert.ok(enrichment.capabilities.some((capability) => capability.capabilityId === 'x402_pay_per_call'));
});

test('CLI applies public-web docs from a captured docs JSON file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'multipass-public-web-'));
  const databasePath = path.join(directory, 'multipass.sqlite');
  const docsPath = path.join(directory, 'docs.json');
  try {
    const store = createSqliteSavedRecords({ databasePath });
    store.saveActivatedRecord(makeSavedRecord());
    store.close();
    await writeFile(docsPath, JSON.stringify(velvetDocs), 'utf8');

    const { stdout } = await execFileAsync(process.execPath, [
      'apps/api/scripts/enrich-public-web-docs.js',
      '--database', databasePath,
      '--identifier', 'velvet-unicorn-1127',
      '--seed-url', 'https://vu.velvetdao.xyz/landing/',
      '--docs-json', docsPath,
      '--now', NOW,
      '--apply',
    ], { cwd: path.resolve(import.meta.dirname, '../../..') });
    const result = JSON.parse(stdout);

    assert.equal(result.applied, true);
    assert.equal(result.multipass_id, 'mp_helixa_agent_1127');
    assert.equal(result.tools.total, 6);
    const verify = createSqliteSavedRecords({ databasePath });
    assert.equal(verify.getTools('mp_helixa_agent_1127').summary.total, 6);
    verify.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('applyPublicWebEnrichment enriches a saved unclaimed profile without pretending owner verification', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord());
  const enrichment = buildPublicWebEnrichment({
    multipassId: 'mp_helixa_agent_1127',
    displayName: 'Velvet-Unicorn',
    seedUrl: 'https://vu.velvetdao.xyz/landing/',
    documents: velvetDocs,
    now: NOW,
  });

  const applied = store.applyPublicWebEnrichment('velvet-unicorn-1127', enrichment, { now: NOW });

  assert.equal(applied.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(applied.profile.owner_summary.verification_status, 'none');
  assert.match(applied.profile.owner_summary.summary, /not claimed management/i);
  assert.equal(applied.tools.summary.total, 6);
  assert.equal(applied.tools.summary.verified_count, 0);
  assert.deepEqual(applied.tools.tools.map((tool) => [tool.tool_id, tool.status, tool.verifiability.tier]), [
    ['vu-ask', 'pending', 'public_web_observed'],
    ['vu-token-analysis', 'pending', 'public_web_observed'],
    ['vu-trending', 'pending', 'public_web_observed'],
    ['vu-wallet-analysis', 'pending', 'public_web_observed'],
    ['vu-swap-execution', 'pending', 'public_web_observed'],
    ['vu-prompt-to-strategy', 'pending', 'public_web_observed'],
  ]);
  assert.equal(store.getAgentCard('mp_helixa_agent_1127', { baseUrl: 'https://helixa.xyz' }).capabilities.length, 6);
  assert.equal(store.getAgentCard('mp_helixa_agent_1127', { baseUrl: 'https://helixa.xyz' }).service_endpoints.length, 9);
  assert.equal(store.getChangeLog('mp_helixa_agent_1127').entries.at(-1).message, 'Automated public-web enrichment imported 6 tools and 3 source routes. Owner verification remains unclaimed.');
  assert.equal(store.getAuditEvents('mp_helixa_agent_1127').at(-1).event_type, 'automated_public_web_enrichment');

  const reapplied = store.applyPublicWebEnrichment('velvet-unicorn-1127', enrichment, { now: '2026-07-10T04:20:00.000Z' });
  assert.equal(reapplied.tools.summary.total, 6);
  assert.equal(store.getPublicFragments('mp_helixa_agent_1127').filter((fragment) => fragment.source?.issuer === 'public_web_importer').length, 9);

  store.close();
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshToolFragment } from '../src/tool-refresh.js';

const NOW = '2026-07-03T03:30:00.000Z';

function makeTool(overrides = {}, refOverrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: 'frag_tool_bankr_lookup',
    multipass_id: 'mp_test',
    fragment_type: 'tool_manifest',
    status: 'pending',
    assurance_level: 'issuer_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: {
      source_type: 'registry_import',
      source_id: 'bankr_x402_cloud:lookup',
      issuer: 'bankr_x402_cloud',
      observed_at: '2026-07-03T00:00:00.000Z',
      reference_url: 'https://x402.example.test/lookup',
    },
    public_value: 'Lookup tool.',
    tool_manifest_ref: {
      tool_id: 'lookup',
      registry: 'bankr_x402_cloud',
      name: 'lookup',
      description: 'Lookup tool.',
      endpoint_url: 'https://x402.example.test/lookup',
      manifest_url: null,
      manifest_hash: null,
      creator_address: null,
      pricing: { model: 'fixed', amount: '0.01', asset: 'USDC', chain_id: 8453 },
      access: { summary: 'x402 access.', requires_owner_approval: false },
      schemas: { input_summary: 'id', output_summary: 'profile' },
      verifiability: { tier: 'provider_verified', summary: 'Imported.' },
      last_checked_at: '2026-07-03T00:00:00.000Z',
      ...refOverrides,
    },
    created_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('refreshToolFragment treats Bankr 402 challenge as verified reachability', async () => {
  const result = await refreshToolFragment(makeTool(), {
    now: NOW,
    fetchImpl: async () => jsonResponse({ accepts: [{ network: 'eip155:8453', maxAmountRequired: '10000' }] }, { status: 402 }),
  });

  assert.equal(result.fragment.status, 'verified');
  assert.equal(result.fragment.updated_at, NOW);
  assert.equal(result.fragment.source.observed_at, NOW);
  assert.equal(result.fragment.tool_manifest_ref.last_checked_at, NOW);
  assert.equal(result.refresh.fragment_id, 'frag_tool_bankr_lookup');
  assert.equal(result.refresh.status, 'verified');
  assert.match(result.refresh.summary, /endpoint reachable/i);
});

test('refreshToolFragment verifies reachable endpoint and manifest URLs', async () => {
  const calls = [];
  const result = await refreshToolFragment(makeTool({}, {
    registry: 'opensea_agent_tool_registry',
    endpoint_url: 'https://api.example.test/tools/lookup',
    manifest_url: 'https://api.example.test/.well-known/tool.json',
    pricing: { model: 'free', amount: '0', asset: 'USDC', chain_id: 8453 },
  }), {
    now: NOW,
    fetchImpl: async (url, init = {}) => {
      calls.push([String(url), init.method]);
      return new Response('', { status: 200 });
    },
  });

  assert.equal(result.fragment.status, 'verified');
  assert.equal(result.refresh.status, 'verified');
  assert.equal(calls.length, 2);
  assert.match(result.refresh.summary, /manifest reachable/i);
});

test('refreshToolFragment marks failed endpoint stale without deleting metadata', async () => {
  const tool = makeTool({}, { name: 'Original Lookup' });
  const result = await refreshToolFragment(tool, {
    now: NOW,
    fetchImpl: async () => new Response('nope', { status: 500 }),
  });

  assert.equal(result.fragment.status, 'stale');
  assert.equal(result.fragment.tool_manifest_ref.name, 'Original Lookup');
  assert.equal(result.fragment.tool_manifest_ref.endpoint_url, tool.tool_manifest_ref.endpoint_url);
  assert.equal(result.refresh.status, 'stale');
  assert.match(result.refresh.summary, /endpoint check failed/i);
});

test('refreshToolFragment marks timeout stale with bounded public summary', async () => {
  const result = await refreshToolFragment(makeTool(), {
    now: NOW,
    timeoutMs: 5,
    fetchImpl: async () => new Promise(() => {}),
  });

  assert.equal(result.fragment.status, 'stale');
  assert.equal(result.refresh.status, 'stale');
  assert.ok(result.refresh.summary.length <= 180);
  assert.match(result.refresh.summary, /timed out/i);
});

test('refreshToolFragment marks unsafe endpoint disputed without fetching', async () => {
  let calls = 0;
  const result = await refreshToolFragment(makeTool({}, {
    endpoint_url: 'http://api.example.test/tools/lookup',
  }), {
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      return new Response('', { status: 200 });
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.fragment.status, 'disputed');
  assert.equal(result.refresh.status, 'disputed');
  assert.match(result.refresh.summary, /unsafe endpoint/i);
});

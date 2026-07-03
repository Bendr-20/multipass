import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalResolveRoute,
  buildDemoRoutes,
  buildHydratedSavedRoute,
  buildSavedRoutes,
  getApiBaseFromLocation,
  getWritableApiBaseFromLocation,
  loadHydratedMultipassDemo,
  loadJson,
  loadMultipassDemo,
  loadSavedMultipassDemo,
  normalizeHelixaAgentDnaSource,
  shouldUseStaticDemo,
  loadStaticMultipassDemo,
} from '../src/api.js';

const subject = { slug: 'bendr-2', receiptId: 'receipt_bendr_lookup' };

test('buildDemoRoutes creates proxied routes for every proof document', () => {
  assert.deepEqual(buildDemoRoutes('/multipass-api', subject), {
    profile: '/multipass-api/api/multipass/bendr-2',
    fragments: '/multipass-api/api/multipass/bendr-2/fragments',
    card: '/multipass-api/api/multipass/bendr-2/agent-card',
    standards: '/multipass-api/api/multipass/bendr-2/standards',
    x402: '/multipass-api/api/multipass/bendr-2/x402',
    receipt: '/multipass-api/api/multipass/bendr-2/receipts/receipt_bendr_lookup',
  });
});

test('buildSavedRoutes creates public saved profile companion routes including tools', () => {
  assert.deepEqual(buildSavedRoutes('/multipass-api', 'bendr-2-1'), {
    profile: '/multipass-api/api/multipass/bendr-2-1',
    fragments: '/multipass-api/api/multipass/bendr-2-1/fragments',
    card: '/multipass-api/api/multipass/bendr-2-1/card',
    standards: '/multipass-api/api/multipass/bendr-2-1/standards',
    x402: '/multipass-api/api/multipass/bendr-2-1/x402',
    tools: '/multipass-api/api/multipass/bendr-2-1/tools',
    changes: '/multipass-api/api/multipass/bendr-2-1/changes',
  });
});

test('buildCanonicalResolveRoute creates explicit canonical source resolver route', () => {
  assert.equal(
    buildCanonicalResolveRoute('/multipass-api', 'helixa-agentdna:8453:1'),
    '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
  );
});

test('buildHydratedSavedRoute creates saved hydrated route', () => {
  assert.equal(
    buildHydratedSavedRoute('/multipass-api', 'bendr-2-1'),
    '/multipass-api/api/multipass/bendr-2-1/hydrated',
  );
});

test('normalizeHelixaAgentDnaSource accepts positive Base AgentDNA sources', () => {
  assert.equal(normalizeHelixaAgentDnaSource('1'), 'helixa-agentdna:8453:1');
  assert.equal(normalizeHelixaAgentDnaSource('8453:1'), 'helixa-agentdna:8453:1');
  assert.equal(normalizeHelixaAgentDnaSource('helixa-agentdna:8453:1'), 'helixa-agentdna:8453:1');
});

test('normalizeHelixaAgentDnaSource rejects zero and unsupported AgentDNA sources', () => {
  for (const source of ['0', '00', '8453:0', '8453:00', 'helixa-agentdna:8453:0', 'helixa-agentdna:8453:00']) {
    assert.equal(normalizeHelixaAgentDnaSource(source), null, source);
  }

  assert.equal(normalizeHelixaAgentDnaSource('8454:1'), null);
  assert.equal(normalizeHelixaAgentDnaSource('erc8004:eip155:8453:0xabc:1'), null);
});

test('getApiBaseFromLocation accepts only safe http URLs and falls back otherwise', () => {
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/')), '/multipass-api');
  assert.equal(
    getApiBaseFromLocation(new URL('http://local.test/?api=http://127.0.0.1:9999/')),
    'http://127.0.0.1:9999',
  );
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=https://api.example.test/base/')), 'https://api.example.test/base');
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=javascript:alert(1)')), '/multipass-api');
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=not-a-url')), '/multipass-api');
});

test('getWritableApiBaseFromLocation rejects cross-origin api overrides for claim writes', () => {
  assert.equal(getWritableApiBaseFromLocation(new URL('https://helixa.xyz/multipass/bendr-2-1')), '/multipass-api');
  assert.equal(
    getWritableApiBaseFromLocation(new URL('https://helixa.xyz/multipass/bendr-2-1?api=https://evil.example.test/base/')),
    '/multipass-api',
  );
  assert.equal(
    getWritableApiBaseFromLocation(new URL('https://helixa.xyz/multipass/bendr-2-1?api=https://helixa.xyz/multipass-api/')),
    'https://helixa.xyz/multipass-api',
  );
});


test('Bendr public profile mode is used for /multipass/ unless api override is present', () => {
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/')), true);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=http://127.0.0.1:9999')), false);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=not-a-url')), true);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=javascript:alert(1)')), true);
  assert.equal(shouldUseStaticDemo(new URL('http://localhost/')), false);
});

test('Bendr public profile data is public API shaped and sanitized', async () => {
  const data = await loadStaticMultipassDemo();
  assert.equal(data.profile.multipass_id, 'mp_bendr_2');
  assert.equal(data.fragments.fragments.every((fragment) => fragment.visibility === 'public'), true);
  assert.equal(JSON.stringify(data).includes('frag_bendr_private_placeholder'), false);
  assert.equal(JSON.stringify(data).includes('private_fragments'), false);
  assert.equal(data.sourceLabel, 'Bendr public profile');
  assert.equal(data.modeLabel, 'Bendr 2.0 Public Profile');
});

test('loadJson throws clear errors for failed routes and invalid JSON', async () => {
  await assert.rejects(
    () => loadJson('/bad-route', async () => ({ ok: false, status: 404, text: async () => 'missing' })),
    /GET \/bad-route failed with 404/,
  );

  await assert.rejects(
    () => loadJson('/invalid-json', async () => ({ ok: true, status: 200, text: async () => '{' })),
    /API returned invalid JSON for \/invalid-json/,
  );
});

test('loadMultipassDemo fetches every document and returns normalized data', async () => {
  const calls = [];
  const payloads = {
    '/multipass-api/api/multipass/bendr-2': { multipass_id: 'mp_bendr_2' },
    '/multipass-api/api/multipass/bendr-2/fragments': { fragments: [] },
    '/multipass-api/api/multipass/bendr-2/agent-card': { name: 'Bendr 2.0' },
    '/multipass-api/api/multipass/bendr-2/standards': { standard_refs: [] },
    '/multipass-api/api/multipass/bendr-2/x402': { endpoints: [] },
    '/multipass-api/api/multipass/bendr-2/receipts/receipt_bendr_lookup': { receipt_id: 'receipt_bendr_lookup' },
  };

  const data = await loadMultipassDemo({
    apiBase: '/multipass-api',
    subject,
    fetchImpl: async (route) => {
      calls.push(route);
      return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
    },
  });

  assert.deepEqual(calls, Object.keys(payloads));
  assert.equal(data.profile.multipass_id, 'mp_bendr_2');
  assert.equal(data.receipt.receipt_id, 'receipt_bendr_lookup');
});

test('loadHydratedMultipassDemo normalizes canonical API data into app shape', async () => {
  const calls = [];
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activated',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup' }] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
    fetchImpl: async (route) => {
      calls.push(route);
      return { ok: true, status: 200, text: async () => JSON.stringify(hydrated) };
    },
  });

  assert.deepEqual(calls, ['/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1']);
  assert.equal(data.profile.slug, 'bendr-2-1');
  assert.equal(data.card.name, 'Bendr 2.0');
  assert.equal(data.tools.tools[0].tool_id, 'agent-lookup');
  assert.equal(data.sourceLabel, 'Helixa AgentDNA source');
  assert.equal(data.modeLabel, 'Activated Multipass');
  assert.equal(data.activation.state, 'activated');
  assert.equal(data.resolver.tokenId, '1');
  assert.equal(data.resolver.canonicalId, '8453:1');
  assert.equal(data.resolver.sourceCanonicalId, 'helixa-agentdna:8453:1');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/bendr-2-1');
  assert.equal(data.canonicalHydrated, true);
});

test('loadHydratedMultipassDemo preserves saved-profile activation semantics', async () => {
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'saved',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/bendr-2-1/hydrated',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(hydrated) }),
  });

  assert.equal(data.modeLabel, 'Saved Multipass');
  assert.equal(data.activation.state, 'saved_record');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/bendr-2-1');
});

test('loadHydratedMultipassDemo keeps activation preview share path on agent query', async () => {
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activation_preview',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'not_activated', manager_state: 'none', claim_url: null },
    routes_meta: { public_profile: '/multipass/?agent=1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(hydrated) }),
  });

  assert.equal(data.modeLabel, 'Activation Preview');
  assert.equal(data.activation.state, 'not_activated');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/?agent=1');
  assert.notEqual(data.liveProfilePage.sharePath, '/multipass/bendr-2-1');
});

test('loadSavedMultipassDemo fetches saved profile public tools with companion documents', async () => {
  const calls = [];
  const payloads = {
    '/multipass-api/api/multipass/bendr-2-1': { multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Saved Bendr' },
    '/multipass-api/api/multipass/bendr-2-1/fragments': { multipass_id: 'mp_helixa_agent_1', fragments: [] },
    '/multipass-api/api/multipass/bendr-2-1/card': { multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' },
    '/multipass-api/api/multipass/bendr-2-1/standards': { standard_refs: [] },
    '/multipass-api/api/multipass/bendr-2-1/x402': { endpoints: [] },
    '/multipass-api/api/multipass/bendr-2-1/tools': { multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'bendr-lookup', name: 'Bendr lookup' }] },
    '/multipass-api/api/multipass/bendr-2-1/changes': { entries: [] },
  };

  const data = await loadSavedMultipassDemo({
    apiBase: '/multipass-api',
    slug: 'bendr-2-1',
    fetchImpl: async (route) => {
      calls.push(route);
      if (String(route).endsWith('/hydrated')) {
        return { ok: false, status: 404, text: async () => 'missing' };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
    },
  });

  assert.deepEqual(calls, [
    '/multipass-api/api/multipass/bendr-2-1/hydrated',
    '/multipass-api/api/multipass/bendr-2-1',
    '/multipass-api/api/multipass/bendr-2-1/fragments',
    '/multipass-api/api/multipass/bendr-2-1/card',
    '/multipass-api/api/multipass/bendr-2-1/standards',
    '/multipass-api/api/multipass/bendr-2-1/x402',
    '/multipass-api/api/multipass/bendr-2-1/tools',
    '/multipass-api/api/multipass/bendr-2-1/changes',
  ]);
  assert.equal(data.profile.slug, 'bendr-2-1');
  assert.equal(data.tools.tools[0].tool_id, 'bendr-lookup');
  assert.equal(data.canonicalHydrated, false);
});

test('loadSavedMultipassDemo does not fall back to companions when hydrated route fails', async () => {
  const calls = [];

  await assert.rejects(
    () => loadSavedMultipassDemo({
      apiBase: '/multipass-api',
      slug: 'bendr-2-1',
      fetchImpl: async (route) => {
        calls.push(route);
        if (String(route).endsWith('/hydrated')) {
          return { ok: false, status: 500, text: async () => 'server error' };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({}) };
      },
    }),
    /GET \/multipass-api\/api\/multipass\/bendr-2-1\/hydrated failed with 500/,
  );

  assert.deepEqual(calls, ['/multipass-api/api/multipass/bendr-2-1/hydrated']);
});

test('loadSavedMultipassDemo reports saved tools fetch failures like other strict companions', async () => {
  await assert.rejects(
    () => loadSavedMultipassDemo({
      apiBase: '/multipass-api',
      slug: 'bendr-2-1',
      fetchImpl: async (route) => {
        if (String(route).endsWith('/hydrated')) {
          return { ok: false, status: 404, text: async () => 'missing' };
        }
        if (String(route).endsWith('/tools')) return { ok: false, status: 503, text: async () => 'unavailable' };
        return { ok: true, status: 200, text: async () => JSON.stringify({ multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Saved Bendr', fragments: [], standard_refs: [], endpoints: [], entries: [] }) };
      },
    }),
    /GET \/multipass-api\/api\/multipass\/bendr-2-1\/tools failed with 503/,
  );
});

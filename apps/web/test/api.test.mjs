import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDemoRoutes,
  getApiBaseFromLocation,
  getWritableApiBaseFromLocation,
  loadJson,
  loadMultipassDemo,
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


test('static demo mode is used for /multipass/ unless api override is present', () => {
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/')), true);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=http://127.0.0.1:9999')), false);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=not-a-url')), true);
  assert.equal(shouldUseStaticDemo(new URL('https://helixa.xyz/multipass/?api=javascript:alert(1)')), true);
  assert.equal(shouldUseStaticDemo(new URL('http://localhost/')), false);
});

test('static demo data is public API shaped and sanitized', async () => {
  const data = await loadStaticMultipassDemo();
  assert.equal(data.profile.multipass_id, 'mp_bendr_2');
  assert.equal(data.fragments.fragments.every((fragment) => fragment.visibility === 'public'), true);
  assert.equal(JSON.stringify(data).includes('frag_bendr_private_placeholder'), false);
  assert.equal(JSON.stringify(data).includes('private_fragments'), false);
  assert.equal(data.sourceLabel, 'bundled fixture');
  assert.equal(data.modeLabel, 'Static Demo');
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

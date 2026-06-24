import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDemoRoutes,
  getApiBaseFromLocation,
  loadJson,
  loadMultipassDemo,
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

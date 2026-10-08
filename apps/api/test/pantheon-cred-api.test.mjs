import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore, createMultipassApi } from '../src/index.js';

const PAYLOAD = {
  chain: 'base', chain_id: 8453,
  vault_address: '0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb',
  count: 0, tokens: [],
};

function api(fetchImpl) {
  return createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://multipass.example.test',
    fetchImpl,
  });
}

test('GET Console Pantheon CRED registry proxies the fixed provider response', async () => {
  const response = await api(async () => new Response(JSON.stringify(PAYLOAD), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })).handleRequest(new Request('https://multipass.example.test/api/multipass/console/pantheon/cred'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), PAYLOAD);
  assert.match(response.headers.get('cache-control'), /max-age=60/);
});

test('GET Console Pantheon CRED registry fails closed when provider is unavailable', async () => {
  const response = await api(async () => new Response('down', { status: 503 }))
    .handleRequest(new Request('https://multipass.example.test/api/multipass/console/pantheon/cred'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    schema_version: '0.1.0',
    error: { code: 'pantheon_unavailable', message: 'Pantheon registry is unavailable.' },
  });
});

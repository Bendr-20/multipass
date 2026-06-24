import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerOptions, startServer } from '../src/server.js';

test('parseServerOptions returns safe defaults', () => {
  assert.deepEqual(parseServerOptions([], {}), {
    fixture: 'generic',
    host: '127.0.0.1',
    port: 8787,
  });
});

test('CLI flags override environment values', () => {
  assert.deepEqual(
    parseServerOptions(['--fixture', 'bendr', '--host', '0.0.0.0', '--port', '9000'], {
      MULTIPASS_FIXTURE: 'generic',
      HOST: '127.0.0.1',
      PORT: '8787',
    }),
    {
      fixture: 'bendr',
      host: '0.0.0.0',
      port: 9000,
    },
  );
});

test('parseServerOptions rejects invalid ports', () => {
  assert.throws(() => parseServerOptions(['--port', 'not-a-number'], {}), /Invalid port/);
  assert.throws(() => parseServerOptions([], { PORT: 'not-a-number' }), /Invalid port/);
});

test('startServer serves discovery and profile routes on an ephemeral port', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0 });

  try {
    assert.equal(server.fixtureName, 'generic');
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const discovery = await fetch(`${server.url}/.well-known/helixa-multipass.json`);
    assert.equal(discovery.status, 200);
    const discoveryBody = await discovery.json();
    assert.equal(discoveryBody.routes.profile, `${server.url}/api/multipass/{id}`);

    const profile = await fetch(`${server.url}/api/multipass/demo-agent`);
    assert.equal(profile.status, 200);
    const profileBody = await profile.json();
    assert.equal(profileBody.multipass_id, 'mp_demo_agent');
  } finally {
    await server.close();
  }
});

test('startServer serves all local fixture routes', async () => {
  const cases = [
    ['generic', 'demo-agent', 'receipt_demo_lookup'],
    ['bendr', 'bendr-2', 'receipt_bendr_lookup'],
  ];

  for (const [fixture, slug, receiptId] of cases) {
    const server = await startServer({ fixture, host: '127.0.0.1', port: 0 });

    try {
      for (const pathName of [
        '/.well-known/helixa-multipass.json',
        `/api/multipass/${slug}`,
        `/api/multipass/${slug}/fragments`,
        `/api/multipass/${slug}/agent-card`,
        `/api/multipass/${slug}/standards`,
        `/api/multipass/${slug}/x402`,
        `/api/multipass/${slug}/receipts/${receiptId}`,
      ]) {
        const response = await fetch(`${server.url}${pathName}`);
        assert.equal(response.status, 200, `${fixture} ${pathName}`);
      }
    } finally {
      await server.close();
    }
  }
});

test('startServer can serve Bendr fixture', async () => {
  const server = await startServer({ fixture: 'bendr', host: '127.0.0.1', port: 0 });

  try {
    const profile = await fetch(`${server.url}/api/multipass/bendr-2`);
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).display_name, 'Bendr 2.0');
  } finally {
    await server.close();
  }
});

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSavedRecordFromHelixaAgent } from '../src/activation-records.js';

import { parseServerOptions, startServer } from '../src/server.js';

test('parseServerOptions returns safe defaults', () => {
  assert.deepEqual(parseServerOptions([], {}), {
    fixture: 'generic',
    host: '127.0.0.1',
    port: 8787,
    databasePath: null,
    allowedOrigins: [],
    adminSecret: null,
    cookieSecure: null,
    publicBaseUrl: null,
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
      databasePath: null,
      allowedOrigins: [],
      adminSecret: null,
      cookieSecure: null,
      publicBaseUrl: null,
    },
  );
});

test('parseServerOptions accepts claim management security env', () => {
  assert.deepEqual(parseServerOptions([], {
    MULTIPASS_ALLOWED_ORIGINS: 'https://helixa.xyz, https://www.helixa.xyz',
    MULTIPASS_ADMIN_SECRET: 'secret',
    MULTIPASS_COOKIE_SECURE: '1',
    MULTIPASS_PUBLIC_BASE_URL: 'https://helixa.xyz',
  }), {
    fixture: 'generic',
    host: '127.0.0.1',
    port: 8787,
    databasePath: null,
    allowedOrigins: ['https://helixa.xyz', 'https://www.helixa.xyz'],
    adminSecret: 'secret',
    cookieSecure: true,
    publicBaseUrl: 'https://helixa.xyz',
  });
});

test('parseServerOptions rejects invalid ports', () => {
  assert.throws(() => parseServerOptions(['--port', 'not-a-number'], {}), /Invalid port/);
  assert.throws(() => parseServerOptions([], { PORT: 'not-a-number' }), /Invalid port/);
});

test('parseServerOptions accepts database path from env or CLI', () => {
  assert.equal(parseServerOptions([], { MULTIPASS_DB_PATH: '/tmp/multipass.sqlite' }).databasePath, '/tmp/multipass.sqlite');
  assert.equal(parseServerOptions(['--database', '/tmp/cli.sqlite'], {}).databasePath, '/tmp/cli.sqlite');
});

test('startServer can advertise a public base URL while listening locally', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0, publicBaseUrl: 'https://helixa.xyz' });

  try {
    const discovery = await fetch(`${server.url}/.well-known/multipass.json`);
    assert.equal(discovery.status, 200);
    const discoveryBody = await discovery.json();
    assert.equal(discoveryBody.routes.profile, 'https://helixa.xyz/api/multipass/{id}');
    assert.equal(discoveryBody.routes.openapi, 'https://helixa.xyz/api/openapi.json');
  } finally {
    await server.close();
  }
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


test('startServer preserves binary JPEG bytes for dynamic share cards', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-server-binary-'));
  const databasePath = path.join(dir, 'multipass.sqlite');
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    databasePath,
    activationService: async (input) => {
      assert.equal(input, '1');
      return buildSavedRecordFromHelixaAgent({ tokenId: '1', name: 'Bendr 2.0' }, { observedAt: '2026-06-26T20:00:00.000Z' });
    },
  });

  try {
    const save = await fetch(`${server.url}/api/multipass`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: '1' }),
    });
    assert.equal(save.status, 201);

    const image = await fetch(`${server.url}/multipass/share/bendr-2-1.jpg`);
    const bytes = new Uint8Array(await image.arrayBuffer());

    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type') ?? '', /image\/jpeg/);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length > 20_000);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('startServer posts saved Multipass records through real HTTP server', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-server-'));
  const databasePath = path.join(dir, 'multipass.sqlite');
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    databasePath,
    activationService: async (input) => {
      assert.equal(input, '1');
      return buildSavedRecordFromHelixaAgent({ tokenId: '1', name: 'Bendr 2.0' }, { observedAt: '2026-06-26T20:00:00.000Z' });
    },
  });

  try {
    assert.equal(server.databasePath, databasePath);
    const save = await fetch(`${server.url}/api/multipass`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: '1' }),
    });
    assert.equal(save.status, 201);
    const saveBody = await save.json();
    assert.equal(saveBody.created, true);
    assert.equal(saveBody.profile.slug, 'bendr-2-1');

    const profile = await fetch(`${server.url}/api/multipass/bendr-2-1`);
    assert.equal(profile.status, 200);
    const profileBody = await profile.json();
    assert.equal(profileBody.multipass_id, 'mp_helixa_agent_1');
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

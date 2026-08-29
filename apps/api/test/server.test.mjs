import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSavedRecordFromHelixaAgent } from '../src/activation-records.js';
import { createAllowlistSnapshot, verifyAllowlistProof } from '../src/allowlist-snapshot.js';

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
    loopersAllowlistPath: null,
    loopersAllowlistSnapshotPath: null,
    loopersAllowlistRegistrationPaused: false,
    loopersAllowlistRequireBrowserOrigin: false,
    loopersAllowlistBlockedSources: [],
    loopersAllowlistRateLimit: undefined,
    loopersAllowlistSubnetRateLimit: undefined,
    loopersAllowlistGlobalRateLimit: undefined,
    loopersTurnstileSecretKey: null,
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
      loopersAllowlistPath: null,
      loopersAllowlistSnapshotPath: null,
      loopersAllowlistRegistrationPaused: false,
      loopersAllowlistRequireBrowserOrigin: false,
      loopersAllowlistBlockedSources: [],
      loopersAllowlistRateLimit: undefined,
      loopersAllowlistSubnetRateLimit: undefined,
      loopersAllowlistGlobalRateLimit: undefined,
      loopersTurnstileSecretKey: null,
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
    loopersAllowlistPath: null,
    loopersAllowlistSnapshotPath: null,
    loopersAllowlistRegistrationPaused: false,
    loopersAllowlistRequireBrowserOrigin: false,
    loopersAllowlistBlockedSources: [],
    loopersAllowlistRateLimit: undefined,
    loopersAllowlistSubnetRateLimit: undefined,
    loopersAllowlistGlobalRateLimit: undefined,
    loopersTurnstileSecretKey: null,
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

test('parseServerOptions accepts Looper allowlist path from env or CLI', () => {
  assert.equal(parseServerOptions([], { MULTIPASS_LOOPERS_ALLOWLIST_PATH: '/tmp/loopers.json' }).loopersAllowlistPath, '/tmp/loopers.json');
  assert.equal(parseServerOptions(['--loopers-allowlist', '/tmp/cli-loopers.json'], {}).loopersAllowlistPath, '/tmp/cli-loopers.json');
});

test('parseServerOptions accepts Looper allowlist snapshot path from env or CLI', () => {
  assert.equal(parseServerOptions([], { MULTIPASS_LOOPERS_ALLOWLIST_SNAPSHOT_PATH: '/tmp/loopers-snapshot.json' }).loopersAllowlistSnapshotPath, '/tmp/loopers-snapshot.json');
  assert.equal(parseServerOptions(['--loopers-allowlist-snapshot', '/tmp/cli-loopers-snapshot.json'], {}).loopersAllowlistSnapshotPath, '/tmp/cli-loopers-snapshot.json');
});

test('parseServerOptions accepts Looper allowlist pause flag from env', () => {
  assert.equal(parseServerOptions([], { MULTIPASS_LOOPERS_ALLOWLIST_PAUSED: '1' }).loopersAllowlistRegistrationPaused, true);
  assert.equal(parseServerOptions([], { MULTIPASS_LOOPERS_ALLOWLIST_PAUSED: '0' }).loopersAllowlistRegistrationPaused, false);
});

test('parseServerOptions accepts Looper allowlist slow-mode env', () => {
  const options = parseServerOptions([], {
    MULTIPASS_LOOPERS_ALLOWLIST_REQUIRE_BROWSER_ORIGIN: '1',
    MULTIPASS_LOOPERS_ALLOWLIST_BLOCKED_SOURCES: '20260826c, bot-wave',
    MULTIPASS_LOOPERS_ALLOWLIST_RATE_LIMIT: '1',
    MULTIPASS_LOOPERS_ALLOWLIST_RATE_WINDOW_SECONDS: '600',
    MULTIPASS_LOOPERS_ALLOWLIST_SUBNET_RATE_LIMIT: '4',
    MULTIPASS_LOOPERS_ALLOWLIST_SUBNET_RATE_WINDOW_SECONDS: '600',
    MULTIPASS_LOOPERS_ALLOWLIST_GLOBAL_RATE_LIMIT: '12',
    MULTIPASS_LOOPERS_ALLOWLIST_GLOBAL_RATE_WINDOW_SECONDS: '3600',
  });
  assert.equal(options.loopersAllowlistRequireBrowserOrigin, true);
  assert.deepEqual(options.loopersAllowlistBlockedSources, ['20260826c', 'bot-wave']);
  assert.deepEqual(options.loopersAllowlistRateLimit, { limit: 1, windowMs: 600_000 });
  assert.deepEqual(options.loopersAllowlistSubnetRateLimit, { limit: 4, windowMs: 600_000 });
  assert.deepEqual(options.loopersAllowlistGlobalRateLimit, { limit: 12, windowMs: 3_600_000 });
});

test('parseServerOptions accepts Looper Turnstile secret from env', () => {
  assert.equal(parseServerOptions([], { MULTIPASS_LOOPERS_TURNSTILE_SECRET_KEY: 'secret' }).loopersTurnstileSecretKey, 'secret');
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

test('startServer registers and checks Looper allowlist addresses', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistRateLimit: { limit: 5, windowMs: 60_000 },
  });
  const address = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

  try {
    const register = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: address.toLowerCase(), source: 'test' }),
    });
    assert.equal(register.status, 201);
    const registered = await register.json();
    assert.equal(registered.collection, 'loopers');
    assert.equal(registered.registered, true);
    assert.equal(registered.created, true);
    assert.equal(registered.address, address);
    assert.equal(registered.total_registered, undefined);

    const duplicate = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, source: 'duplicate' }),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).created, false);

    const status = await fetch(`${server.url}/api/loopers/allowlist/status?address=${address}`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.collection, 'loopers');
    assert.equal(statusBody.registered, true);
    assert.equal(statusBody.entry.source, 'test');
    assert.equal(statusBody.total_registered, undefined);
  } finally {
    await server.close();
  }
});

test('startServer can pause Looper allowlist registration intake', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistRegistrationPaused: true,
  });

  try {
    const register = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'test' }),
    });
    assert.equal(register.status, 503);
    assert.equal((await register.json()).error.code, 'registration_paused');
  } finally {
    await server.close();
  }
});

test('startServer can require trusted browser origin for Looper allowlist registration', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    publicBaseUrl: 'https://helixa.xyz',
    allowedOrigins: ['https://helixa.xyz'],
    loopersAllowlistRequireBrowserOrigin: true,
  });

  try {
    const noOrigin = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'test' }),
    });
    assert.equal(noOrigin.status, 403);
    assert.equal((await noOrigin.json()).error.code, 'browser_origin_required');

    const trustedOrigin = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://helixa.xyz' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'test' }),
    });
    assert.equal(trustedOrigin.status, 201);
  } finally {
    await server.close();
  }
});

test('startServer can block known bad Looper allowlist sources before rate limiting', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistBlockedSources: ['20260826c'],
    loopersAllowlistRateLimit: { limit: 1, windowMs: 60_000, now: () => 1_000 },
  });

  try {
    for (const address of [
      '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
      '0x0000000000000000000000000000000000000001',
    ]) {
      const blocked = await fetch(`${server.url}/api/loopers/allowlist/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, source: '20260826c' }),
      });
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json()).error.code, 'source_blocked');
    }

    const allowed = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'launch-page' }),
    });
    assert.equal(allowed.status, 201);
  } finally {
    await server.close();
  }
});

test('startServer serves frozen Looper allowlist proofs separately from registration status', async () => {
  const address = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  const ineligibleAddress = '0x0000000000000000000000000000000000000002';
  const snapshot = createAllowlistSnapshot({
    entries: [
      { address, registered_at: '2026-08-27T17:00:00.000Z', source: 'test-freeze' },
      { address: '0x0000000000000000000000000000000000000001', source: 'test-freeze' },
    ],
  }, { generatedAt: '2026-08-27T17:01:00.000Z' });
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistSnapshot: snapshot,
  });

  try {
    const proofResponse = await fetch(`${server.url}/api/loopers/allowlist/proof?address=${address.toLowerCase()}`);
    assert.equal(proofResponse.status, 200);
    const proofBody = await proofResponse.json();
    assert.equal(proofBody.collection, 'loopers');
    assert.equal(proofBody.address, address);
    assert.equal(proofBody.eligible, true);
    assert.equal(proofBody.merkle_root, snapshot.merkle.root);
    assert.equal(proofBody.leaf_encoding, snapshot.merkle.leaf_encoding);
    assert.equal(proofBody.snapshot.generated_at, '2026-08-27T17:01:00.000Z');
    assert.equal(proofBody.snapshot.count, 2);
    assert.equal(verifyAllowlistProof(proofBody.address, proofBody.proof, proofBody.merkle_root), true);

    const ineligibleResponse = await fetch(`${server.url}/api/loopers/allowlist/proof?address=${ineligibleAddress}`);
    assert.equal(ineligibleResponse.status, 200);
    const ineligibleBody = await ineligibleResponse.json();
    assert.equal(ineligibleBody.address, ineligibleAddress);
    assert.equal(ineligibleBody.eligible, false);
    assert.deepEqual(ineligibleBody.proof, []);
    assert.equal(ineligibleBody.merkle_root, snapshot.merkle.root);
  } finally {
    await server.close();
  }
});

test('startServer rejects invalid Looper proof addresses and reports missing snapshot config', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0 });

  try {
    const missing = await fetch(`${server.url}/api/loopers/allowlist/proof?address=0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea`);
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error.code, 'not_configured');

    const snapshotServer = await startServer({
      fixture: 'generic',
      host: '127.0.0.1',
      port: 0,
      loopersAllowlistSnapshot: createAllowlistSnapshot({ entries: [] }),
    });
    try {
      const invalid = await fetch(`${snapshotServer.url}/api/loopers/allowlist/proof?address=not-an-address`);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'invalid_address');
    } finally {
      await snapshotServer.close();
    }
  } finally {
    await server.close();
  }
});

test('startServer rejects invalid Looper allowlist addresses', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0 });

  try {
    const register = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: 'not-an-address' }),
    });
    assert.equal(register.status, 400);
    assert.equal((await register.json()).error.code, 'invalid_address');
  } finally {
    await server.close();
  }
});

test('startServer rate limits repeated Looper allowlist registration attempts by client', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistRateLimit: { limit: 1, windowMs: 60_000, now: () => 1_000 },
  });

  try {
    const first = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'test' }),
    });
    assert.equal(first.status, 201);

    const duplicate = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', source: 'retry' }),
    });
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.created, false);
    assert.equal(duplicateBody.entry.source, 'test');

    const limited = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ address: '0x0000000000000000000000000000000000000001', source: 'test' }),
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await limited.json()).error.code, 'rate_limited');
  } finally {
    await server.close();
  }
});

test('startServer rate limits Looper allowlist bursts by client subnet', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistRateLimit: { limit: 10, windowMs: 60_000, now: () => 1_000 },
    loopersAllowlistSubnetRateLimit: { limit: 1, windowMs: 60_000, now: () => 1_000 },
  });

  try {
    const first = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea', source: 'test' }),
    });
    assert.equal(first.status, 201);

    const limited = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.99' },
      body: JSON.stringify({ address: '0x0000000000000000000000000000000000000001', source: 'test' }),
    });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.message, 'Too many allowlist registration attempts from this network. Try again shortly.');
  } finally {
    await server.close();
  }
});

test('startServer rate limits Looper allowlist registration globally', async () => {
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersAllowlistRateLimit: { limit: 10, windowMs: 60_000, now: () => 1_000 },
    loopersAllowlistSubnetRateLimit: { limit: 10, windowMs: 60_000, now: () => 1_000 },
    loopersAllowlistGlobalRateLimit: { limit: 2, windowMs: 60_000, now: () => 1_000 },
  });

  try {
    for (const [index, address] of [
      '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
      '0x0000000000000000000000000000000000000001',
    ].entries()) {
      const allowed = await fetch(`${server.url}/api/loopers/allowlist/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.${index}.10` },
        body: JSON.stringify({ address, source: 'test' }),
      });
      assert.equal(allowed.status, 201);
    }

    const limited = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.3.10' },
      body: JSON.stringify({ address: '0x0000000000000000000000000000000000000002', source: 'test' }),
    });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.message, 'Loopers allowlist registration is in slow mode. Try again shortly.');
  } finally {
    await server.close();
  }
});

test('startServer rejects Looper allowlist honeypot submissions', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0 });

  try {
    const register = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
        website: 'https://bot.example',
      }),
    });
    assert.equal(register.status, 400);
    assert.equal((await register.json()).error.code, 'bot_detected');
  } finally {
    await server.close();
  }
});

test('startServer requires and verifies Turnstile when configured', async () => {
  const turnstileCalls = [];
  const server = await startServer({
    fixture: 'generic',
    host: '127.0.0.1',
    port: 0,
    loopersTurnstileSecretKey: 'secret',
    fetchImpl: async (url, options) => {
      turnstileCalls.push({ url, options });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });

  try {
    const missing = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea' }),
    });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).error.code, 'verification_required');

    const register = await fetch(`${server.url}/api/loopers/allowlist/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.42' },
      body: JSON.stringify({
        address: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
        turnstileToken: 'token',
      }),
    });
    assert.equal(register.status, 201);
    assert.equal(turnstileCalls.length, 1);
    assert.equal(turnstileCalls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const form = new URLSearchParams(turnstileCalls[0].options.body);
    assert.equal(form.get('secret'), 'secret');
    assert.equal(form.get('response'), 'token');
    assert.equal(form.get('remoteip'), '203.0.113.42');
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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('../scripts/smoke-looper-restap-3802.mjs', import.meta.url);
const KEY = '0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c';

async function cli(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [SCRIPT.pathname, ...args], {
      env: { ...process.env, ...options.env },
      timeout: 15_000,
    });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

function discovery(baseUrl, gates) {
  const available = new Set(gates);
  return {
    restap_version: '0.1.4-beta',
    agent: {
      name: 'Looper #3802',
      contact: 'https://helixa.test',
      x_helixa: {
        base_url: baseUrl,
        canonical_image: 'https://helixa.test/3802.png',
        display_name: 'Looper 3802',
        public_conversation_enabled: true,
        biography: 'Public biography.',
        mission: 'Public mission.',
        voice_presentation: 'Direct.',
        codex: { schema_version: '1.0.0', artifact_hash: 'a'.repeat(64), version: 'v1' },
      },
    },
    capabilities: [
      { id: 'talk', title: 'Talk', method: 'POST', endpoint: '/talk', x_helixa: { available: available.has('talk'), authentication: 'none', sessions: true, request_bytes: 8192 } },
      { id: 'news-write', title: 'Write', method: 'POST', endpoint: '/news', x_helixa: { available: available.has('news-write'), authentication: 'restap-signature-v1', sessions: false, request_bytes: 16384 } },
      { id: 'news-read', title: 'Read', method: 'GET', endpoint: '/news', x_helixa: { available: available.has('news-read'), authentication: 'console-session-current-owner', sessions: false, request_bytes: 0 } },
    ],
  };
}

async function mockRemote(gates, handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: request.method, url: request.url, headers: request.headers, body });
    const origin = 'http://' + request.headers.host;
    const base = origin + '/api/restap/loopers/3802';
    let result;
    if (request.url.startsWith('/api/restap/loopers/3801/')) result = [404, { error: { code: 'not_found' } }];
    if (!result && handler) result = await handler({ request, body, requests, base });
    if (!result && request.method === 'GET' && request.url === '/api/restap/loopers/3802/.well-known/restap.json') result = [200, discovery(base, gates)];
    if (!result) result = [404, { error: { code: 'not_found' } }];
    response.statusCode = result[0];
    response.setHeader('content-type', 'application/json');
    for (const [name, value] of Object.entries(result[2] ?? {})) response.setHeader(name, value);
    response.end(JSON.stringify(result[1]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/api/restap/loopers/3802`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('help is offline and package exposes the smoke command', async () => {
  const result = await cli(['--help'], { env: { RESTAP_NEWS_SIGNER_KEY: 'must-not-be-read' } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /--mode <local\|remote>/);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['smoke:restap-3802'], 'node scripts/smoke-looper-restap-3802.mjs');
});

test('remote never infers a base and exact cumulative phase/gate pairings are mandatory', async () => {
  for (const args of [
    ['--mode', 'remote', '--phase', 'discovery', '--expected-gates', 'discovery'],
    ['--mode', 'local', '--expected-gates', 'discovery'],
    ['--mode', 'local', '--phase', 'talk', '--expected-gates', 'talk,discovery'],
    ['--mode', 'local', '--phase', 'news-read', '--expected-gates', 'discovery,talk,news-write'],
    ['--mode', 'local', '--phase', 'discovery', '--expected-gates', 'discovery,discovery'],
  ]) {
    const result = await cli(args);
    assert.notEqual(result.code, 0, args.join(' '));
    assert.doesNotMatch(result.stderr + result.stdout, /helixa\.xyz/iu);
  }
});

test('accepts one package-manager argument separator', async () => {
  const result = await cli(['--', '--mode', 'local', '--phase', 'discovery', '--expected-gates', 'discovery']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /phase=discovery expected-gates=discovery/);
});

test('local all-gates smoke proves talk continuity, one write, owner read, and negatives', async () => {
  const result = await cli(['--mode', 'local', '--phase', 'news-read', '--expected-gates', 'discovery,talk,news-write,news-read']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'restap-3802-smoke=pass phase=news-read expected-gates=discovery,talk,news-write,news-read discovery=pass talk=pass continuity=pass news-write=pass news-read=pass negatives=pass');
});

test('remote discovery validates advertised gates and checks disabled surfaces', async (t) => {
  const good = await mockRemote(['discovery']);
  t.after(() => good.close());
  let result = await cli(['--mode', 'remote', '--base-url', good.baseUrl, '--phase', 'discovery', '--expected-gates', 'discovery']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /talk=disabled continuity=disabled news-write=disabled news-read=disabled negatives=pass/);
  assert.ok(good.requests.some((entry) => entry.url.endsWith('/.well-known/restap.json')));
  assert.ok(good.requests.some((entry) => entry.method === 'POST' && entry.url.endsWith('/talk')));
  assert.ok(good.requests.some((entry) => entry.method === 'POST' && entry.url.endsWith('/news')));
  assert.ok(good.requests.some((entry) => entry.method === 'GET' && entry.url.endsWith('/news')));

  const bad = await mockRemote(['discovery', 'talk']);
  t.after(() => bad.close());
  result = await cli(['--mode', 'remote', '--base-url', bad.baseUrl, '--phase', 'discovery', '--expected-gates', 'discovery']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /smoke failed/iu);
});

test('remote talk proves a fresh session and continuity without exposing session values', async (t) => {
  const session = 'S'.repeat(43);
  const remote = await mockRemote(['discovery', 'talk'], async ({ request, body }) => {
    if (request.method === 'POST' && request.url.endsWith('/talk')) {
      const parsed = JSON.parse(body);
      if (parsed.session_id !== undefined) assert.equal(parsed.session_id, session);
      return [200, { reply: 'bounded reply', session_id: session }];
    }
  });
  t.after(() => remote.close());
  const result = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--phase', 'talk', '--expected-gates', 'discovery,talk']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /talk=pass continuity=pass/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(session));
});

test('remote news-write accepts once, rejects replay, persists bounded proof mode 0600, and redacts failures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'restap-smoke-'));
  const proof = join(root, 'proof.json');
  let signed = 0;
  const remote = await mockRemote(['discovery', 'talk', 'news-write'], async ({ request, body }) => {
    if (request.method === 'POST' && request.url.endsWith('/talk')) return [200, { reply: 'ok', session_id: 'T'.repeat(43) }];
    if (request.method === 'POST' && request.url.endsWith('/news')) {
      if (request.headers['x-restap-signature']) {
        signed += 1;
        if (signed > 1) return [409, { error: { code: 'replay' } }];
        return [202, { x_helixa_accepted: true, x_helixa_item_id: 'item-7', x_helixa_received_at: '2026-10-01T20:00:00.000Z' }];
      }
      return [401, { error: { code: 'authentication_required' } }];
    }
  });
  t.after(() => remote.close());
  const result = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--phase', 'news-write', '--expected-gates', 'discovery,talk,news-write', '--allow-write', '--write-proof-state', proof], { env: { RESTAP_NEWS_SIGNER_KEY: KEY } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(signed, 2, 'one accepted signed write plus one rejected replay probe');
  assert.equal((await stat(proof)).mode & 0o777, 0o600);
  const saved = JSON.parse(await readFile(proof, 'utf8'));
  assert.deepEqual(Object.keys(saved), ['schemaVersion', 'kind', 'baseUrl', 'itemId', 'bodyHash', 'receivedAt']);
  assert.equal(saved.itemId, 'item-7');
  assert.doesNotMatch(JSON.stringify(saved), new RegExp(KEY.slice(2), 'iu'));

  const refused = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--phase', 'news-write', '--expected-gates', 'discovery,talk,news-write'], { env: { RESTAP_NEWS_SIGNER_KEY: KEY } });
  assert.notEqual(refused.code, 0);
  assert.doesNotMatch(refused.stderr + refused.stdout, new RegExp(KEY.slice(2), 'iu'));
});


test('loopback news-read accepts only signature-derived same-process owner state and exact write proof', async (t) => {
  const account = privateKeyToAccount(KEY);
  const root = await mkdtemp(join(tmpdir(), 'restap-owner-smoke-'));
  await writeFile(join(root, 'pid'), String(process.pid) + '\n', { mode: 0o644 });
  await chmod(join(root, 'pid'), 0o644);
  const challengePath = join(root, 'challenge.json');
  const signaturePath = join(root, 'signature.txt');
  const ownerState = join(root, 'owner-auth.json');
  const proofPath = join(root, 'proof.json');
  const nonce = 'nonce-for-owner-auth';
  const message = 'Sign exact local canary challenge.';
  const cookie = 'multipass_console=' + 'C'.repeat(43);
  const item = { type: 'restap.smoke', message: 'saved proof item' };
  const canonical = JSON.stringify(item, Object.keys(item).sort());
  const bodyHash = createHash('sha256').update(canonical).digest('hex');
  let remote;
  remote = await mockRemote(['discovery', 'talk', 'news-write', 'news-read'], async ({ request, body }) => {
    if (request.url === '/api/multipass/console/session/nonce') return [200, { wallet: account.address, nonce, message }];
    if (request.url === '/api/multipass/console/session/verify') {
      const submitted = JSON.parse(body);
      assert.equal(submitted.wallet, account.address);
      assert.equal(submitted.nonce, nonce);
      assert.equal(await account.signMessage({ message }), submitted.signature);
      return [200, { wallet: account.address }, { 'set-cookie': cookie + '; Path=/; HttpOnly; SameSite=Strict' }];
    }
    if (request.method === 'POST' && request.url.endsWith('/talk')) return [200, { reply: 'ok', session_id: 'R'.repeat(43) }];
    if (request.method === 'POST' && request.url.endsWith('/news')) return [401, { error: { code: 'authentication_required' } }];
    if (request.method === 'GET' && request.url.endsWith('/news')) {
      if (request.headers.cookie !== cookie) return [401, { error: { code: 'authentication_required' } }];
      return [200, { items: [item], timestamp: 1 }];
    }
  });
  t.after(() => remote.close());

  let result = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--owner-wallet', account.address, '--owner-auth-challenge-out', challengePath]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await stat(challengePath)).mode & 0o777, 0o600);
  const challenge = JSON.parse(await readFile(challengePath, 'utf8'));
  assert.equal(challenge.pid, process.pid);
  assert.equal(challenge.baseUrl, remote.baseUrl);
  await writeFile(signaturePath, await account.signMessage({ message: challenge.message }) + '\n', { mode: 0o600 });
  await chmod(signaturePath, 0o600);

  result = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--owner-auth-verify', challengePath, '--owner-signature-file', signaturePath, '--owner-auth-state', ownerState]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await stat(ownerState)).mode & 0o777, 0o600);
  await assert.rejects(stat(challengePath), { code: 'ENOENT' });
  await assert.rejects(stat(signaturePath), { code: 'ENOENT' });

  await writeFile(proofPath, JSON.stringify({ schemaVersion: 1, kind: 'restap-3802-news-write-proof', baseUrl: remote.baseUrl, itemId: 'item-7', bodyHash, receivedAt: '2026-10-01T20:00:00.000Z' }) + '\n', { mode: 0o600 });
  await chmod(proofPath, 0o600);
  result = await cli(['--mode', 'remote', '--base-url', remote.baseUrl, '--phase', 'news-read', '--expected-gates', 'discovery,talk,news-write,news-read', '--reuse-write-proof', proofPath, '--owner-auth-state', ownerState]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /news-read=pass negatives=pass/);
});

test('raw cookie inputs are rejected without reflection', async () => {
  const secret = 'multipass_console=super-secret-cookie';
  const arg = await cli(['--mode', 'local', '--phase', 'discovery', '--expected-gates', 'discovery', '--cookie', secret]);
  assert.notEqual(arg.code, 0);
  assert.doesNotMatch(arg.stderr + arg.stdout, /super-secret-cookie/);
  const env = await cli(['--mode', 'local', '--phase', 'discovery', '--expected-gates', 'discovery'], { env: { COOKIE: secret } });
  assert.notEqual(env.code, 0);
  assert.doesNotMatch(env.stderr + env.stdout, /super-secret-cookie/);
});

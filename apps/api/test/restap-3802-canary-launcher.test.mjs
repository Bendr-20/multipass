import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('../scripts/run-looper-restap-3802-canary.sh', import.meta.url).pathname;

async function run(args, options = {}) {
  try {
    const result = await execFileAsync('bash', [SCRIPT, ...args], { env: { ...process.env, ...options.env }, timeout: options.timeout ?? 15_000 });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'restap-launcher-'));
  const release = join(root, 'release');
  const state = join(root, 'state');
  await mkdir(join(release, 'apps/api/src'), { recursive: true });
  await mkdir(join(release, 'runtime'), { recursive: true });
  await mkdir(state, { mode: 0o700 });
  await chmod(state, 0o700);
  await writeFile(join(release, 'runtime/looper-codex-v1.json'), '{' + '"schemaVersion":"1.0.0"' + '}\n', { mode: 0o444 });
  await writeFile(join(release, 'apps/api/src/server.js'), 
    "const http=require('node:http');const host=process.env.HOST||'127.0.0.1';const port=Number(process.env.PORT);const s=http.createServer((q,r)=>{r.end('ok')});s.listen(port,host);const stop=()=>s.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);", { mode: 0o444 });
  const policy = join(root, 'policy.json');
  await writeFile(policy, JSON.stringify({ tokenId: '3802', newsSenders: [{ id: 'restap-smoke', enabled: true }] }) + '\n', { mode: 0o600 });
  await chmod(policy, 0o600);
  const database = join(state, 'restap-3802-canary.sqlite');
  await writeFile(database, 'copied-fixture', { mode: 0o600 });
  await chmod(database, 0o600);
  return { root, release, state, policy, database, port: await freePort() };
}

function base(f) {
  return ['--release', f.release, '--port', String(f.port), '--state-dir', f.state, '--policy', f.policy, '--database', f.database];
}

test('launcher defaults all RESTAP gates off and contains no mutation/auth bootstrap surface', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  for (const gate of ['DISCOVERY', 'TALK', 'NEWS_WRITE', 'NEWS_READ']) assert.match(source, new RegExp('MULTIPASS_RESTAP_' + gate + '_ENABLED'));
  assert.doesNotMatch(source, /nginx|systemctl|systemd|ERC-?8004|owner-auth-state|--wallet|--signature|--cookie|--session|--challenge/iu);
  assert.doesNotMatch(source, /(?:^|[;\s])(?:source|eval|\.)\s+.*bankr/imu);
  assert.match(source, /runtime_uid=\$\(id -u ubuntu\)/u);
  assert.match(source, /stat -c '%u'.*database.*runtime_uid/su);
  assert.match(source, /8#022.*policy must be protected/su);
});

test('starts an unrouted loopback canary with exact release and stops only after verified identity', async (t) => {
  const f = await fixture();
  t.after(async () => { await run([...base(f), '--stop']); await rm(f.root, { recursive: true, force: true }); });
  const started = await run(base(f));
  assert.equal(started.code, 0, started.stderr);
  assert.match(started.stdout, new RegExp('canary=ready .*port=' + f.port + ' gates=none'));
  assert.equal((await stat(join(f.state, 'pid'))).isFile(), true);
  assert.equal((await stat(join(f.state, 'stdout.log'))).isFile(), true);
  assert.equal((await stat(join(f.state, 'stderr.log'))).isFile(), true);
  const env = await readFile(join(f.state, 'gates.state'), 'utf8');
  assert.match(env, /MULTIPASS_RESTAP_DISCOVERY_ENABLED=false/);
  assert.match(env, /MULTIPASS_RESTAP_TALK_ENABLED=false/);
  assert.match(env, /MULTIPASS_RESTAP_NEWS_WRITE_ENABLED=false/);
  assert.match(env, /MULTIPASS_RESTAP_NEWS_READ_ENABLED=false/);
  const stopped = await run([...base(f), '--stop']);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.match(stopped.stdout, /canary=stopped .*auth-state=removed/);
});

test('each gate flag is independent and talk requires a protected Bankr file', async (t) => {
  for (const [flag, variable] of [
    ['--enable-discovery', 'MULTIPASS_RESTAP_DISCOVERY_ENABLED=true'],
    ['--enable-news-write', 'MULTIPASS_RESTAP_NEWS_WRITE_ENABLED=true'],
    ['--enable-news-read', 'MULTIPASS_RESTAP_NEWS_READ_ENABLED=true'],
  ]) {
    const f = await fixture();
    const result = await run([...base(f), flag]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(f.state, 'gates.state'), 'utf8'), new RegExp(variable));
    await run([...base(f), '--stop']);
    await rm(f.root, { recursive: true, force: true });
  }
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const result = await run([...base(f), '--enable-talk']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Bankr environment is required/iu);
});

test('rejects symlinked artifacts, exposed policy, outside database, occupied ports, and auth-shaped arguments', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const badPolicy = join(f.root, 'bad-policy.json');
  await writeFile(badPolicy, '{}\n', { mode: 0o666 });
  await chmod(badPolicy, 0o666);
  assert.notEqual((await run([...base(f).map((x, i, a) => a[i - 1] === '--policy' ? badPolicy : x)])).code, 0);
  const outside = join(f.root, 'production.sqlite');
  await writeFile(outside, 'x', { mode: 0o600 });
  assert.notEqual((await run([...base(f).map((x, i, a) => a[i - 1] === '--database' ? outside : x)])).code, 0);
  const artifact = join(f.release, 'runtime/looper-codex-v1.json');
  await rm(artifact);
  await symlink(join(f.root, 'elsewhere.json'), artifact);
  assert.notEqual((await run(base(f))).code, 0);
  const auth = await run([...base(f), '--cookie', 'secret-value']);
  assert.notEqual(auth.code, 0);
  assert.doesNotMatch(auth.stderr + auth.stdout, /secret-value/);
});

test('rejects an occupied loopback port and news-write policy without restap-smoke', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const occupied = net.createServer();
  await new Promise((resolve, reject) => occupied.listen(f.port, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const blocked = await run(base(f));
  assert.notEqual(blocked.code, 0);
  assert.match(blocked.stderr, /port occupied/iu);
  await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
  await writeFile(f.policy, JSON.stringify({ tokenId: '3802', newsSenders: [{ id: 'other', enabled: true }] }) + '\n', { mode: 0o600 });
  await chmod(f.policy, 0o600);
  const wrongSender = await run([...base(f), '--enable-news-write']);
  assert.notEqual(wrongSender.code, 0);
  assert.match(wrongSender.stderr, /restap-smoke/iu);
});

test('startup failure removes stale identity metadata and leaves copied inputs', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const server = join(f.release, 'apps/api/src/server.js');
  await chmod(server, 0o644);
  await writeFile(server, "setTimeout(() => process.exit(1), 150); setInterval(() => {}, 1000);");
  await chmod(server, 0o444);
  const result = await run(base(f));
  assert.notEqual(result.code, 0);
  for (const name of ['pid', 'starttime', 'release', 'port', 'policy', 'database', 'command.sha256']) {
    await assert.rejects(stat(join(f.state, name)), { code: 'ENOENT' });
  }
  assert.equal((await stat(f.database)).isFile(), true);
});

test('--stop fails closed on tampered identity and preserves owner auth until verified exit', async (t) => {
  const f = await fixture();
  t.after(async () => { await rm(join(f.state, 'pid'), { force: true }); await rm(f.root, { recursive: true, force: true }); });
  const started = await run(base(f));
  assert.equal(started.code, 0, started.stderr);
  await writeFile(join(f.state, 'owner-auth.json'), '{"secret":"not-logged"}\n', { mode: 0o600 });
  await writeFile(join(f.state, 'starttime'), '1\n', { mode: 0o600 });
  const stopped = await run([...base(f), '--stop']);
  assert.notEqual(stopped.code, 0);
  assert.equal((await stat(join(f.state, 'owner-auth.json'))).isFile(), true);
  assert.doesNotMatch(stopped.stderr + stopped.stdout, /not-logged/);
  const pid = Number((await readFile(join(f.state, 'pid'), 'utf8')).trim());
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
});

test('--replace is verified stop followed by start and removes stale owner auth only after exit', async (t) => {
  const f = await fixture();
  t.after(async () => { await run([...base(f), '--stop']); await rm(f.root, { recursive: true, force: true }); });
  assert.equal((await run(base(f))).code, 0);
  const oldPid = (await readFile(join(f.state, 'pid'), 'utf8')).trim();
  await writeFile(join(f.state, 'owner-auth.json'), '{}\n', { mode: 0o600 });
  const replaced = await run([...base(f), '--replace']);
  assert.equal(replaced.code, 0, replaced.stderr);
  const newPid = (await readFile(join(f.state, 'pid'), 'utf8')).trim();
  assert.notEqual(newPid, oldPid);
  await assert.rejects(stat(join(f.state, 'owner-auth.json')), { code: 'ENOENT' });
});

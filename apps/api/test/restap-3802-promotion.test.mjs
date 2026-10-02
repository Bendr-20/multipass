import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('../../../scripts/promote-looper-restap-3802.sh', import.meta.url).pathname;
const UNIT = 'multipass-api-xmtp-holder-proof.service';

async function run(args, f, extra = {}) {
  try {
    const result = await execFileAsync('bash', [SCRIPT, ...args], { env: { ...process.env, PATH: f.bin + ':' + process.env.PATH, RESTAP_PROMOTION_ETC_ROOT: f.etc, RESTAP_PROMOTION_STATE_FILE: f.serviceState, RESTAP_PROMOTION_CURL_LOG: f.curlLog, ...extra }, timeout: 20_000 });
    return { code: 0, ...result };
  } catch (error) { return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }; }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'restap-promotion-'));
  const release = join(root, 'release'); const current = join(root, 'current'); const staticRoot = join(root, 'static');
  const backup = join(root, 'backup'); const proof = join(root, 'proof'); const etc = join(root, 'etc'); const bin = join(root, 'bin');
  const dropinDir = join(etc, 'systemd/system', UNIT + '.d');
  await Promise.all([
    mkdir(join(release, 'apps/api/src'), { recursive: true }), mkdir(join(release, 'apps/web/dist'), { recursive: true }), mkdir(join(release, 'runtime'), { recursive: true }),
    mkdir(join(current, 'apps/api/src'), { recursive: true }), mkdir(staticRoot, { recursive: true }), mkdir(backup, { mode: 0o700 }), mkdir(proof, { mode: 0o700 }), mkdir(dropinDir, { recursive: true }), mkdir(join(etc, 'default'), { recursive: true }), mkdir(join(etc, 'nginx/sites-enabled'), { recursive: true }), mkdir(bin),
  ]);
  await chmod(backup, 0o700); await chmod(proof, 0o700);
  await writeFile(join(release, 'apps/api/src/server.js'), 'candidate\n'); await writeFile(join(release, 'apps/web/dist/index.html'), 'candidate static\n'); await writeFile(join(release, 'runtime/looper-codex-v1.json'), '{}\n');
  await writeFile(join(current, 'apps/api/src/server.js'), 'current\n'); await writeFile(join(staticRoot, 'index.html'), 'current static\n');
  const artifact = join(release, 'runtime/looper-codex-v1.json'); const policy = join(root, 'policy.json'); const database = join(root, 'canary.sqlite');
  await writeFile(policy, '{"schemaVersion":"1.0.0","tokenId":"3802"}\n', { mode: 0o600 }); await chmod(policy, 0o600);
  const db = new DatabaseSync(database); db.exec('CREATE TABLE restap_news_items(id TEXT PRIMARY KEY); CREATE TABLE restap_news_nonces(nonce TEXT PRIMARY KEY);'); db.prepare('INSERT INTO restap_news_items VALUES (?)').run('accepted'); db.prepare('INSERT INTO restap_news_nonces VALUES (?)').run('used'); db.close(); await chmod(database, 0o600);
  const fragment = join(etc, 'systemd/system', UNIT); const dropin = join(dropinDir, '30-restap-3802.conf'); const envFile = join(etc, 'default/multipass-api-xmtp-holder-proof'); const nginx = join(etc, 'nginx/sites-enabled/helixa.xyz');
  await writeFile(fragment, `[Service]\nExecStart=/usr/bin/node apps/api/src/server.js\n`);
  await writeFile(dropin, `[Service]\nWorkingDirectory=${current}\nEnvironment=UNRELATED_DROPIN=keep\n`);
  await writeFile(envFile, `UNRELATED_SECRET=keep-me\nMULTIPASS_DB_PATH=${database}\nBANKR_API_KEY=protected-existing-key\n`, { mode: 0o600 }); await chmod(envFile, 0o600);
  await writeFile(nginx, 'server { root ' + staticRoot + '; location /api/ { proxy_pass http://127.0.0.1:3000; } }\n');
  const serviceState = join(root, 'service.state'); const curlLog = join(root, 'curl.log'); await writeFile(serviceState, JSON.stringify({ cwd: current, baseCwd: current, pid: 1001, restarts: 0, fragment, dropin, host: '127.0.0.1', port: 8792, database }) + '\n');
  const systemctl = `#!/usr/bin/env node
const fs=require("node:fs");const p=process.env.RESTAP_PROMOTION_STATE_FILE;let s=JSON.parse(fs.readFileSync(p));const a=process.argv.slice(2);if(a[0]==="show"){const prop=a[a.indexOf("-p")+1];const m={WorkingDirectory:s.cwd,MainPID:String(s.pid),NRestarts:String(s.restarts),FragmentPath:s.fragment,DropInPaths:fs.existsSync(s.dropin)?s.dropin:"",ActiveState:"active",Environment:"HOST="+s.host+" PORT="+s.port+" MULTIPASS_DB_PATH="+s.database};process.stdout.write((m[prop]||"")+"\\n");}else if(a[0]==="cat"){process.stdout.write(fs.readFileSync(s.fragment));if(fs.existsSync(s.dropin))process.stdout.write(fs.readFileSync(s.dropin));}else if(a[0]==="restart"){const d=fs.existsSync(s.dropin)?fs.readFileSync(s.dropin,"utf8"):"";const x=[...d.matchAll(/^WorkingDirectory=(.+)$/gm)].at(-1);s.cwd=x?x[1]:s.baseCwd;s.pid+=1;s.restarts=0;fs.writeFileSync(p,JSON.stringify(s)+"\\n");}else if(a[0]==="daemon-reload"){}else process.exit(2);`;
  await writeFile(join(bin, 'systemctl'), systemctl, { mode: 0o755 }); await chmod(join(bin, 'systemctl'), 0o755);
  await writeFile(join(bin, 'curl'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RESTAP_PROMOTION_CURL_LOG"
printf '{"ok":true}\\n'
`, { mode: 0o755 }); await chmod(join(bin, 'curl'), 0o755);
  return { root, release, current, staticRoot, backup, proof, etc, bin, artifact, policy, database, serviceState, curlLog, fragment, dropin, envFile, nginx };
}

function args(mode, phase, f) { return ['--' + mode, '--phase', phase, '--release', f.release, '--artifact', f.artifact, '--policy', f.policy, '--database', f.database, '--unit', UNIT, '--static-root', f.staticRoot, '--backup-root', f.backup, '--proof-root', f.proof]; }

test('script is inspection-first, rollback-armed, and excludes destructive/publication operations', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.match(source, /--dry-run.*--rehearsal.*--promote.*--rollback/s);
  assert.match(source, /trap .*rollback/);
  assert.doesNotMatch(source, /DROP TABLE|DELETE FROM|ERC-?8004|openclaw|gateway/iu);
});

test('dry-run records redacted hashes and performs no mutation', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const before = await readFile(f.dropin, 'utf8');
  const result = await run(args('dry-run', 'discovery', f), f);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /promotion-preflight=pass/);
  assert.equal(await readFile(f.dropin, 'utf8'), before);
  const proof = JSON.parse(await readFile(join(f.proof, 'preflight.json'), 'utf8'));
  for (const key of ['configHash', 'releaseHash', 'staticHash', 'databaseHash']) assert.match(proof[key], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(proof), /keep-me|protected-existing-key/);
});

test('rehearsal mutates cumulatively then verifies rollback and preserves unrelated configuration/data', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const result = await run(args('rehearsal', 'news-write', f), f);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /rehearsal-restored=verified/);
  assert.match(await readFile(f.dropin, 'utf8'), /UNRELATED_DROPIN=keep/);
  assert.match(await readFile(f.envFile, 'utf8'), /UNRELATED_SECRET=keep-me/);
  const state = JSON.parse(await readFile(f.serviceState, 'utf8')); assert.equal(state.cwd, f.current);
  const db = new DatabaseSync(f.database, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM restap_news_items').get().n, 1); assert.equal(db.prepare('SELECT count(*) AS n FROM restap_news_nonces').get().n, 1); db.close();
  assert.equal(JSON.parse(await readFile(join(f.proof, 'rollback.json'), 'utf8')).verified, true);
});

test('rehearsal uses the inspected loopback service endpoint', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const result = await run(args('rehearsal', 'discovery', f), f);
  assert.equal(result.code, 0, result.stderr);
  const curls = await readFile(f.curlLog, 'utf8');
  assert.ok(curls.includes('http://127.0.0.1:8792/api/restap/loopers/3802/.well-known/restap.json'));
  assert.ok(curls.includes('http://127.0.0.1:8792/multipass/agents'));
  assert.ok(!curls.includes('127.0.0.1:3000'));
});

test('rehearsal accepts the inspected database path from the base unit', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await writeFile(f.envFile, 'UNRELATED_SECRET=keep-me\nBANKR_API_KEY=protected-existing-key\n', { mode: 0o600 });
  await chmod(f.envFile, 0o600);
  const result = await run(args('rehearsal', 'discovery', f), f);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(f.envFile, 'utf8'), 'UNRELATED_SECRET=keep-me\nBANKR_API_KEY=protected-existing-key\n');
});

test('first rehearsal restores an absent managed drop-in', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await rm(f.dropin);
  const result = await run(args('rehearsal', 'discovery', f), f);
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(readFile(f.dropin, 'utf8'), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(f.serviceState, 'utf8')).cwd, f.current);
});

test('promote leaves exact cumulative phase gates and rollback restores prior release', async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  let result = await run(args('promote', 'talk', f), f);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /promotion=verified/);
  const staged = (await readFile(f.dropin, 'utf8')) + (await readFile(f.envFile, 'utf8'));
  assert.match(staged, /MULTIPASS_RESTAP_DISCOVERY_ENABLED=true/); assert.match(staged, /MULTIPASS_RESTAP_TALK_ENABLED=true/); assert.match(staged, /MULTIPASS_RESTAP_NEWS_WRITE_ENABLED=false/); assert.match(staged, /UNRELATED_DROPIN=keep/);
  result = await run(args('rollback', 'talk', f), f);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /rollback=verified/);
  assert.equal(JSON.parse(await readFile(f.serviceState, 'utf8')).cwd, f.current);
});

test('aborts before mutation on exact unit, route, database, or working-directory drift', async () => {
  const scenarios = [
    async (f) => writeFile(f.nginx, 'server { location /other/ {} }\n'),
    async (f) => { const state = JSON.parse(await readFile(f.serviceState, 'utf8')); state.database = '/wrong.sqlite'; await writeFile(f.serviceState, JSON.stringify(state) + '\n'); },
    async (f) => writeFile(f.serviceState, JSON.stringify({ cwd: '/missing', pid: 1, restarts: 0, fragment: f.fragment, dropin: f.dropin }) + '\n'),
  ];
  for (const mutate of scenarios) {
    const f = await fixture();
    try {
      const before = await readFile(f.dropin, 'utf8');
      await mutate(f);
      const result = await run(args('promote', 'discovery', f), f);
      assert.notEqual(result.code, 0);
      assert.equal(await readFile(f.dropin, 'utf8'), before);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  }
  const f = await fixture();
  try {
    const wrongUnit = args('dry-run', 'discovery', f); wrongUnit[wrongUnit.indexOf(UNIT)] = 'other.service';
    assert.notEqual((await run(wrongUnit, f)).code, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('../../../scripts/promote-looper-restap-network.sh', import.meta.url);

test('promotion config uses the API Codex artifact environment contract', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.match(source, /Environment=MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH=\$artifact/u);
  assert.doesNotMatch(source, /MULTIPASS_LOOPERS_CODEX_ARTIFACT=/u);
});

test('promotion is inspect-first separately namespaced rehearsal-gated and rollback-preserving', async () => {
  await access(SCRIPT, constants.X_OK);
  const source = await readFile(SCRIPT, 'utf8');
  for (const required of ['multipass-restap-network', '--inspect', '--rehearsal', '--promote', '--rollback', 'rehearsal-proof', 'backup', 'proof', 'database']) assert.match(source, new RegExp(required, 'u'));
  assert.ok(source.indexOf('replies') < source.indexOf('initiation'));
  assert.ok(source.indexOf('initiation') < source.indexOf('discovery'));
  assert.ok(source.indexOf('discovery') < source.indexOf('policy'));
  assert.ok(source.indexOf('policy') < source.indexOf('foundation'));
  assert.doesNotMatch(source, /promote-looper-restap-3802|RESTAP_3802/iu);
  for (const marker of ['unit.present', 'environment.present', 'service.active', 'service.enabled']) assert.match(source, new RegExp(marker.replace('.', '\\.'), 'u'));
  assert.match(source, /rm -f .*SERVICE_NAME/iu);
});

test('promotion help and inspect mode require no mutation', async () => {
  const { spawnSync } = await import('node:child_process');
  const help = spawnSync('bash', [SCRIPT.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /rehearsal|rollback/iu);
  const inspect = spawnSync('bash', [SCRIPT.pathname, '--inspect'], { encoding: 'utf8' });
  assert.equal(inspect.status, 0); assert.match(inspect.stdout, /inspection/iu);
});


test('rehearsal emits a valid systemd service drop-in with explicit gate environment', async () => {
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'restap-promotion-'));
  const sha = 'a'.repeat(40);
  const release = join(root, 'multipass-restap-network-' + sha);
  const staticRoot = join(root, 'static');
  const backupRoot = join(root, 'backup');
  const proofRoot = join(root, 'proof');
  await Promise.all([mkdir(release), mkdir(staticRoot), mkdir(backupRoot), mkdir(proofRoot)]);
  const files = Object.fromEntries(await Promise.all(['artifact', 'policy', 'keys', 'unit'].map(async (name) => {
    const path = join(root, name); await writeFile(path, name); return [name, path];
  })));
  const result = spawnSync('bash', [SCRIPT.pathname, '--rehearsal', '--gate', 'foundation',
    '--release', release, '--release-sha', sha, '--artifact', files.artifact, '--policy', files.policy,
    '--key-registry', files.keys, '--database', join(root, 'network.sqlite'), '--unit', files.unit,
    '--static-root', staticRoot, '--backup-root', backupRoot, '--proof-root', proofRoot], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const rehearsalProof = result.stdout.trim();
  const environment = await readFile(join(new URL('.', 'file://' + rehearsalProof).pathname, 'environment'), 'utf8');
  assert.match(environment, /^\[Service\]\n/u);
  assert.equal(environment.includes('EnvironmentFile=' + files.policy + '\n'), true);
  assert.match(environment, /^Environment=MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED=true$/mu);
  assert.match(environment, /^Environment=MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED=false$/mu);
});

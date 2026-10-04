import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('../../../scripts/promote-looper-restap-network.sh', import.meta.url);

test('promotion config uses the API Codex artifact and protected signer environment contracts', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.match(source, /Environment=MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH=\$artifact/u);
  assert.match(source, /Environment=MULTIPASS_RESTAP_NETWORK_SIGNER_FILE=\$signer/u);
  assert.doesNotMatch(source, /MULTIPASS_LOOPERS_CODEX_ARTIFACT=/u);
});

test('promotion is inspect-first separately namespaced rehearsal-gated and rollback-preserving', async () => {
  await access(SCRIPT, constants.X_OK);
  const source = await readFile(SCRIPT, 'utf8');
  for (const required of ['multipass-restap-network', '--inspect', '--rehearsal', '--promote', '--rollback', '--signer', '--smoke-base-url', 'rehearsal-proof', 'backup', 'proof', 'database', 'candidate_started=true', 'smoke_passed=true', 'rollback=verified']) assert.match(source, new RegExp(required, 'u'));
  assert.ok(source.indexOf('replies') < source.indexOf('initiation'));
  assert.ok(source.indexOf('initiation') < source.indexOf('discovery'));
  assert.ok(source.indexOf('discovery') < source.indexOf('policy'));
  assert.ok(source.indexOf('policy') < source.indexOf('foundation'));
  assert.doesNotMatch(source, /promote-looper-restap-3802|RESTAP_3802/iu);
  for (const marker of ['unit.present', 'environment.present', 'service.active', 'service.enabled', 'database.present', 'database.before']) assert.match(source, new RegExp(marker.replace('.', '\\.'), 'u'));
  assert.match(source, /rm -f -- "\$unit_target"/u);
  assert.match(source, /rm -f -- "\$dropin_target"/u);
});

test('promotion proof binds every reviewed path, hash, gate tuple, and rolls back failures automatically', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  for (const field of ['release_sha', 'gate_tuple', 'release_path', 'artifact_path', 'artifact_sha256', 'policy_path', 'policy_sha256', 'key_registry_path', 'key_registry_sha256', 'signer_path', 'signer_sha256', 'database_path', 'database_sha256', 'unit_path', 'unit_sha256', 'static_root_path', 'static_root_sha256']) {
    assert.match(source, new RegExp(field + '=', 'u'), field);
  }
  assert.match(source, /trap .*automatic_rollback.*ERR|trap .*rollback.*ERR/u);
  assert.match(source, /systemctl restart.*SERVICE_NAME/u);
  assert.match(source, /smoke-looper-restap-network\.mjs/u);
  assert.match(source, /--mode remote.*--base-url "\$smoke_base_url"/su);
  assert.match(source, /secret.*0640|mode.*640/iu);
  assert.match(source, /User=.*root|service user.*root/iu);
  assert.match(source, /reject_escaping_symlinks/iu);
  assert.match(source, /resolved.*root.*\/\*/iu);
  assert.doesNotMatch(source, /must not contain symlinks/iu);
  const rehearsal = source.slice(source.indexOf('if [[ "$mode" == rehearsal ]]'));
  assert.ok(rehearsal.indexOf('restore_backup "$backup_dir"') < rehearsal.indexOf('database_sha256=$(hash_file "$database")'));
});

test('promotion help and inspect mode require no mutation', async () => {
  const { spawnSync } = await import('node:child_process');
  const help = spawnSync('bash', [SCRIPT.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /rehearsal|rollback/iu);
  const inspect = spawnSync('bash', [SCRIPT.pathname, '--inspect'], { encoding: 'utf8' });
  assert.equal(inspect.status, 0); assert.match(inspect.stdout, /inspection/iu);
});


test('live rehearsal is privileged and renders every exact gate plus signer reference', async () => {
  const { spawnSync } = await import('node:child_process');
  const source = await readFile(SCRIPT, 'utf8');
  for (const name of ['FOUNDATION', 'POLICY', 'DISCOVERY', 'INITIATION', 'REPLIES', 'TRANSCRIPTS', 'PILOT', 'GA']) {
    assert.match(source, new RegExp('Environment=MULTIPASS_RESTAP_NETWORK_' + name + '_ENABLED=', 'u'));
  }
  assert.match(source, /Environment=MULTIPASS_RESTAP_NETWORK_SIGNER_FILE=\$signer/u);
  if (process.getuid() !== 0) {
    const result = spawnSync('bash', [SCRIPT.pathname, '--rehearsal'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires root/i);
  }
});

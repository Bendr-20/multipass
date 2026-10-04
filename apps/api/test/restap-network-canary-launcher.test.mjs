import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import test from 'node:test';

const SCRIPT = new URL('../../../scripts/launch-looper-restap-network-canary.sh', import.meta.url);

test('network canary launcher is loopback-only immutable inspect-first and closed by default', async () => {
  await access(SCRIPT, constants.X_OK);
  const source = await readFile(SCRIPT, 'utf8');
  for (const required of ['127.0.0.1', '--release-sha', '--artifact', '--policy', '--key-registry', '--database', '--identity-file', '--stop', '--replace', 'occupied', 'MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED=false']) assert.match(source, new RegExp(required.replaceAll('-', '\-'), 'u'));
  assert.equal(source.includes('stat -c %u'), true);
  assert.equal(source.includes('MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH="$artifact"'), true);
  assert.doesNotMatch(source, /MULTIPASS_LOOPERS_CODEX_ARTIFACT=/u);
  assert.match(source, /0600|600/u);
  assert.doesNotMatch(source, /mint.*session|wallet.*signature/iu);
});

test('launcher help is offline and rejects auth-shaped arguments', async () => {
  const { spawnSync } = await import('node:child_process');
  let run = spawnSync('bash', [SCRIPT.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0); assert.match(run.stdout, /loopback|canary/iu);
  run = spawnSync('bash', [SCRIPT.pathname, '--session', 'secret'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0); assert.doesNotMatch(run.stderr + run.stdout, /secret/u);
});

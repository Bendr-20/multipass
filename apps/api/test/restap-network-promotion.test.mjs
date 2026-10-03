import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import test from 'node:test';

const SCRIPT = new URL('../../../scripts/promote-looper-restap-network.sh', import.meta.url);

test('promotion is inspect-first separately namespaced rehearsal-gated and rollback-preserving', async () => {
  await access(SCRIPT, constants.X_OK);
  const source = await readFile(SCRIPT, 'utf8');
  for (const required of ['multipass-restap-network', '--inspect', '--rehearsal', '--promote', '--rollback', 'rehearsal-proof', 'backup', 'proof', 'database']) assert.match(source, new RegExp(required, 'u'));
  assert.ok(source.indexOf('replies') < source.indexOf('initiation'));
  assert.ok(source.indexOf('initiation') < source.indexOf('discovery'));
  assert.ok(source.indexOf('discovery') < source.indexOf('policy'));
  assert.ok(source.indexOf('policy') < source.indexOf('foundation'));
  assert.doesNotMatch(source, /promote-looper-restap-3802|RESTAP_3802/iu);
});

test('promotion help and inspect mode require no mutation', async () => {
  const { spawnSync } = await import('node:child_process');
  const help = spawnSync('bash', [SCRIPT.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /rehearsal|rollback/iu);
  const inspect = spawnSync('bash', [SCRIPT.pathname, '--inspect'], { encoding: 'utf8' });
  assert.equal(inspect.status, 0); assert.match(inspect.stdout, /inspection/iu);
});

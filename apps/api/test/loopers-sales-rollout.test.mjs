import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const unitPath = path.join(root, 'deploy/systemd/loopers-sales-bot.service');
const helperPath = path.join(root, 'deploy/systemd/loopers-sales-bot-rollout.sh');

function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('systemd unit has hardened production sales-only settings', async () => {
  const unit = await readFile(unitPath, 'utf8');
  for (const line of [
    'Wants=network-online.target', 'After=network-online.target', 'User=ubuntu',
    'WorkingDirectory=/home/ubuntu/multipass', 'Environment=HOME=/home/ubuntu', 'UMask=0077',
    'EnvironmentFile=/home/ubuntu/.openclaw/workspace/agentdna/helixa-bot/.env',
    'Environment=LOOPERS_SALES_OPENSEA_CONFIG_PATH=/home/ubuntu/.config/opensea/config.json',
    'Environment=LOOPERS_SALES_COLLECTION_SLUG=loopers-639312714',
    'Environment=LOOPERS_SALES_CONTRACT=0x1649cd37f4748807b4882fc48765ba0b2affa94a',
    'Environment=LOOPERS_SALES_TELEGRAM_CHAT_ID=@theloopers',
    'Environment=LOOPERS_SALES_STATE_PATH=/var/lib/helixa/loopers-sales-seen.json',
    'Environment=LOOPERS_SALES_PREMIUM_MULTIPLIER=1.25',
    'ExecStart=/usr/bin/node apps/api/scripts/run-loopers-sales-bot.js',
    'Restart=on-failure',
  ]) assert.match(unit, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(unit, /TOKEN=|api_key|--opensea-api-key/i);
});

async function makeHarness({ failOn = '' } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loopers-rollout-'));
  const bin = path.join(dir, 'bin');
  const stateDir = path.join(dir, 'state');
  const unitDir = path.join(dir, 'units');
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(bin), mkdir(stateDir), mkdir(unitDir),
  ]));
  await writeFile(path.join(stateDir, 'old.active'), 'active');
  await writeFile(path.join(stateDir, 'old.enabled'), 'enabled');
  const dispatcher = `#!/bin/bash
set -eu
name=$(basename "$0")
echo "$name $*" >> "$HARNESS_LOG"
if [[ -n "${'${FAIL_ON:-}'}" && "$name $*" == *"$FAIL_ON"* ]]; then exit 42; fi
unit_key() { [[ "$1" == loopers-mint-activity-bot.service ]] && echo old || echo new; }
case "$name:$1" in
  systemctl:is-active) key=$(unit_key "$2"); [[ -f "$HARNESS_STATE/$key.active" ]] ;;
  systemctl:is-enabled) key=$(unit_key "$2"); [[ -f "$HARNESS_STATE/$key.enabled" ]] ;;
  systemctl:stop) key=$(unit_key "$2"); rm -f "$HARNESS_STATE/$key.active" ;;
  systemctl:start) key=$(unit_key "$2"); touch "$HARNESS_STATE/$key.active" ;;
  systemctl:enable) key=$(unit_key "$2"); touch "$HARNESS_STATE/$key.enabled" ;;
  systemctl:disable) key=$(unit_key "$2"); rm -f "$HARNESS_STATE/$key.enabled" ;;
  systemctl:show) echo 4242 ;;
  systemctl:cat) echo '[Unit]'; echo 'Description=old' ;;
  journalctl:*) echo 'loopers-sales-bot ready' ;;
  stat:*) echo '600 ubuntu:ubuntu' ;;
  install:*)
    if [[ " $* " == *" -d "* ]]; then mkdir -p "${'${@: -1}'}"; else cp "${'${@: -2:1}'}" "${'${@: -1}'}"; fi ;;
  cp:*) command /bin/cp "$@" ;;
  chmod:*) command /bin/chmod "$@" ;;
  sleep:*) : ;;
esac
`;
  for (const name of ['systemctl', 'journalctl', 'install', 'cp', 'chmod', 'sleep', 'stat']) {
    const file = path.join(bin, name); await writeFile(file, dispatcher); await chmod(file, 0o755);
  }
  const config = path.join(dir, 'opensea.json'); await writeFile(config, '{"api_key":"secret-never-print"}\n', { mode: 0o644 });
  const log = path.join(dir, 'commands.log'); await writeFile(log, '');
  return { dir, bin, stateDir, unitDir, config, log, failOn };
}

async function executeHarness(harness, args = ['--install']) {
  return run('bash', [helperPath, ...args], {
    cwd: root,
    env: {
      ...process.env, PATH: `${harness.bin}:/usr/bin:/bin`, FAIL_ON: harness.failOn,
      HARNESS_LOG: harness.log, HARNESS_STATE: harness.stateDir,
      LOOPERS_ROLLOUT_SYSTEMD_DIR: harness.unitDir,
      LOOPERS_ROLLOUT_OPENSEA_CONFIG: harness.config,
      LOOPERS_ROLLOUT_STATE_DIR: path.join(harness.dir, 'varlib'),
      LOOPERS_ROLLOUT_SKIP_PROBE: '1', LOOPERS_ROLLOUT_SKIP_STATE_CHECK: '1',
      LOOPERS_ROLLOUT_READY_TIMEOUT_SECONDS: '1',
    },
  });
}

test('probe-only never mutates systemd unit states', async () => {
  const h = await makeHarness();
  try {
    const result = await executeHarness(h, ['--probe-only']);
    assert.equal(result.code, 0, result.stderr);
    const log = await readFile(h.log, 'utf8');
    assert.doesNotMatch(log, /systemctl (stop|start|enable|disable)/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-never-print/);
  } finally { await rm(h.dir, { recursive: true, force: true }); }
});

for (const failOn of [
  'systemctl stop loopers-mint-activity-bot.service',
  'install -o root -g root -m 0644',
  'systemctl daemon-reload',
  'systemctl start loopers-sales-bot.service',
  'journalctl -u loopers-sales-bot.service',
  'systemctl disable loopers-mint-activity-bot.service',
  'systemctl enable loopers-sales-bot.service',
]) {
  test(`rolls back old service when ${failOn} fails`, async () => {
    const h = await makeHarness({ failOn });
    try {
      const result = await executeHarness(h);
      assert.notEqual(result.code, 0);
      assert.equal(await import('node:fs').then(({ existsSync }) => existsSync(path.join(h.stateDir, 'old.active'))), true);
      assert.equal(await import('node:fs').then(({ existsSync }) => existsSync(path.join(h.stateDir, 'old.enabled'))), true);
      assert.equal(await import('node:fs').then(({ existsSync }) => existsSync(path.join(h.stateDir, 'new.active'))), false);
      assert.equal(await import('node:fs').then(({ existsSync }) => existsSync(path.join(h.stateDir, 'new.enabled'))), false);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-never-print/);
    } finally { await rm(h.dir, { recursive: true, force: true }); }
  });
}

test('successful rollout verifies before enabling new and disabling old', async () => {
  const h = await makeHarness();
  try {
    const result = await executeHarness(h);
    assert.equal(result.code, 0, result.stderr);
    const log = await readFile(h.log, 'utf8');
    const startNew = log.indexOf('systemctl start loopers-sales-bot.service');
    const ready = log.indexOf('journalctl -u loopers-sales-bot.service');
    const disableOld = log.indexOf('systemctl disable loopers-mint-activity-bot.service');
    const enableNew = log.indexOf('systemctl enable loopers-sales-bot.service');
    assert.ok(startNew >= 0 && ready > startNew && disableOld > ready && enableNew > ready, log);
    assert.doesNotMatch(log, /secret-never-print/);
  } finally { await rm(h.dir, { recursive: true, force: true }); }
});

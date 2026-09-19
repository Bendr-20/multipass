import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const sweepAssetPath = path.join(root, 'apps/web/public/loopers-sweep.gif');
const unitPath = path.join(root, 'deploy/systemd/loopers-sales-bot.service');
const helperPath = path.join(root, 'deploy/systemd/loopers-sales-bot-rollout.sh');
const deployHarnessPath = path.join(
  root,
  'docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh',
);

function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('Loopers sweep animation is pinned to the approved asset', async () => {
  const [asset, metadata] = await Promise.all([readFile(sweepAssetPath), stat(sweepAssetPath)]);
  assert.equal(metadata.size, 2234613);
  assert.equal(asset.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.equal(asset.readUInt16LE(6), 720);
  assert.equal(asset.readUInt16LE(8), 900);
  assert.equal(
    createHash('sha256').update(asset).digest('hex'),
    '19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572',
  );
});

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
    'Environment=LOOPERS_SALES_SWEEP_ANIMATION_URL=https://helixa.xyz/multipass/loopers-sweep.gif',
    'ExecStart=/usr/bin/node apps/api/scripts/run-loopers-sales-bot.js',
    'Restart=on-failure',
  ]) assert.match(unit, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(unit, /TOKEN=|api_key|--opensea-api-key/i);
});

test('deployment harness requires the reviewed clean head and uses a direct isolated probe', async () => {
  const harness = await readFile(deployHarnessPath, 'utf8');

  assert.match(harness, /LOOPERS_MEDIA_REVIEWED_HEAD:?/);
  assert.doesNotMatch(harness, /LOOPERS_MEDIA_PRODUCTION_HEAD/);
  assert.match(
    harness,
    /readonly REVIEWED_PRODUCTION_HEAD=c76b1a7635c4bc80b93c6619a5ed347a03b4d18a/,
  );
  assert.match(harness, /git -C "\$WT" rev-parse HEAD/);
  assert.match(harness, /git -C "\$PROD" rev-parse HEAD/);
  assert.match(harness, /\[\[ \$production_head == "\$REVIEWED_PRODUCTION_HEAD" \]\]/);
  assert.match(harness, /\[\[ \$worktree_head == "\$REVIEWED_HEAD" \]\]/);
  assert.match(harness, /status --porcelain --untracked-files=all/);
  assert.match(harness, /git -C "\$PROD" ls-files --error-unmatch/);
  assert.match(harness, /git -C "\$PROD" diff --quiet --/);
  assert.match(harness, /git -C "\$PROD" diff --cached --quiet --/);
  assert.match(harness, /elif \[\[ -e \$PROD\/\$rel \|\| -L \$PROD\/\$rel \]\]/);
  const backupCreation = harness.indexOf('install -d -m 0700 "$BACKUP/files"');
  assert.ok(
    harness.indexOf('status --porcelain --untracked-files=all') < backupCreation,
    'clean-head proof must precede backup creation',
  );
  assert.ok(
    harness.indexOf('production_head=$(git -C "$PROD" rev-parse HEAD)') < backupCreation,
    'production-head proof must precede backup creation',
  );

  assert.match(harness, /PROBE_STATE=\$\(mktemp /);
  assert.match(
    harness,
    /sudo -u ubuntu[\s\S]*run-loopers-sales-bot\.js[\s\S]*--probe[\s\S]*--state-path "\$PROBE_STATE"[\s\S]*--opensea-config-path "\$OPENSEA_CONFIG"/,
  );
  const probeMktemp = harness.indexOf('PROBE_STATE=$(mktemp ');
  const removedBeforeUse = harness.indexOf('rm -f "$PROBE_STATE"', probeMktemp);
  const directProbe = harness.indexOf('sudo -u ubuntu', removedBeforeUse);
  const successCleanup = harness.indexOf('rm -f "$PROBE_STATE"', directProbe);
  assert.ok(
    probeMktemp >= 0 && removedBeforeUse > probeMktemp
      && directProbe > removedBeforeUse && successCleanup > directProbe,
    'probe state must be removed before use and after success',
  );
  assert.match(harness, /if \[\[ -n \$PROBE_STATE \]\]; then\n    rm -f "\$PROBE_STATE"/);
  assert.match(harness, /grep -F '"telegramCalls":0'/);
  assert.match(harness, /systemctl show "\$SERVICE" -p MainPID --value/);
  assert.match(harness, /== "\$pid_before_probe"/);
  assert.doesNotMatch(harness, /chmod[^\n]*OPENSEA_CONFIG/);
  assert.doesNotMatch(harness, /install -d[^\n]*(?:STATE_FILE|\/var\/lib\/helixa)/);
  assert.doesNotMatch(harness, /loopers-sales-bot-rollout\.sh --probe-only/);

  assert.match(
    harness,
    /GIF_FILE="\$file" EXPECTED_GIF_SIZE="\$GIF_SIZE" EXPECTED_GIF_WIDTH="\$GIF_WIDTH" EXPECTED_GIF_HEIGHT="\$GIF_HEIGHT" node -/,
  );
  for (const name of ['SIZE', 'WIDTH', 'HEIGHT']) {
    assert.match(harness, new RegExp(`process\\.env\\.EXPECTED_GIF_${name}`));
    assert.doesNotMatch(harness, new RegExp(`(?:^|\\s)GIF_${name}="\\$GIF_${name}"`));
  }
});

function findReadonlySelfAssignments(shell) {
  const readonlyNames = new Set(
    [...shell.matchAll(/^readonly(?:\s+-[a-zA-Z]+)?\s+([A-Z][A-Z0-9_]*)=/gm)]
      .map((match) => match[1]),
  );
  const conflicts = [];

  for (const [index, line] of shell.split('\n').entries()) {
    const words = line.trimStart().split(/\s+/);
    for (const word of words) {
      const assignment = word.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!assignment) break;
      const [, target, rhs] = assignment;
      const selfReferences = [
        `$${target}`, `"$${target}"`, `\${${target}}`, `"\${${target}}"`,
      ];
      if (readonlyNames.has(target) && selfReferences.includes(rhs)) {
        conflicts.push(`${target} at line ${index + 1}`);
      }
    }
  }

  return conflicts;
}

test('deployment harness never command-prefix assigns readonly all-caps variables to themselves', async () => {
  const synthetic = 'readonly READONLY=value\nHELPER=value READONLY="$READONLY" command';
  assert.deepEqual(findReadonlySelfAssignments(synthetic), ['READONLY at line 2']);

  const harness = await readFile(deployHarnessPath, 'utf8');
  assert.deepEqual(findReadonlySelfAssignments(harness), []);
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

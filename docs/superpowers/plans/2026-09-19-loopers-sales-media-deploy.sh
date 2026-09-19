#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${1:-} == --install && $# -eq 1 ]] || {
  printf '%s\n' 'Usage: 2026-09-19-loopers-sales-media-deploy.sh --install' >&2
  exit 2
}
: "${LOOPERS_MEDIA_REVIEWED_HEAD:?LOOPERS_MEDIA_REVIEWED_HEAD must be the reviewed 40-character worktree HEAD}"

readonly WT=${LOOPERS_MEDIA_WORKTREE:-/home/ubuntu/.config/superpowers/worktrees/multipass/feature-loopers-sales-media}
readonly PROD=${LOOPERS_MEDIA_PRODUCTION_REPO:-/home/ubuntu/multipass}
readonly BACKUP_ROOT=${LOOPERS_MEDIA_BACKUP_ROOT:-/home/ubuntu/.local/state/helixa-deploy-backups}
readonly REVIEWED_HEAD=$LOOPERS_MEDIA_REVIEWED_HEAD
readonly REVIEWED_PRODUCTION_HEAD=c76b1a7635c4bc80b93c6619a5ed347a03b4d18a
readonly SERVICE=loopers-sales-bot.service
readonly LIVE_GIF=/var/www/helixa.xyz/multipass/loopers-sweep.gif
readonly INSTALLED_UNIT=/etc/systemd/system/loopers-sales-bot.service
readonly STATE_FILE=/var/lib/helixa/loopers-sales-seen.json
readonly OPENSEA_CONFIG=/home/ubuntu/.config/opensea/config.json
readonly GIF_SHA256=19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572
readonly GIF_SIZE=2234613
readonly GIF_WIDTH=720
readonly GIF_HEIGHT=900
readonly STAMP=$(date -u +%Y%m%dT%H%M%SZ)
readonly BACKUP="$BACKUP_ROOT/loopers-sales-media-$STAMP"

readonly -a REPO_PATHS=(
  .gitignore
  apps/api/src/loopers-sales/telegram.js
  apps/api/test/loopers-sales-telegram.test.mjs
  apps/api/src/loopers-sales-bot.js
  apps/api/scripts/run-loopers-sales-bot.js
  apps/api/test/loopers-sales-bot.test.mjs
  apps/web/public/loopers-sweep.gif
  apps/web/dist/loopers-sweep.gif
  deploy/systemd/loopers-sales-bot.service
  apps/api/test/loopers-sales-rollout.test.mjs
  docs/superpowers/plans/2026-09-19-loopers-sales-media-upgrade.md
  docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh
)
readonly -a TRACKED_PATHS=(
  .gitignore
  apps/api/src/loopers-sales/telegram.js
  apps/api/test/loopers-sales-telegram.test.mjs
  apps/api/src/loopers-sales-bot.js
  apps/api/scripts/run-loopers-sales-bot.js
  apps/api/test/loopers-sales-bot.test.mjs
  apps/web/public/loopers-sweep.gif
  deploy/systemd/loopers-sales-bot.service
  apps/api/test/loopers-sales-rollout.test.mjs
  docs/superpowers/plans/2026-09-19-loopers-sales-media-upgrade.md
  docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh
)
readonly -a RUNTIME_PATHS=("$LIVE_GIF" "$INSTALLED_UNIT")

[[ $REVIEWED_HEAD =~ ^[0-9a-f]{40}$ ]] || {
  printf '%s\n' 'LOOPERS_MEDIA_REVIEWED_HEAD must be an exact lowercase 40-character commit SHA' >&2
  exit 1
}
worktree_head=$(git -C "$WT" rev-parse HEAD)
[[ $worktree_head == "$REVIEWED_HEAD" ]] || {
  printf 'Reviewed worktree HEAD mismatch: expected %s, found %s\n' "$REVIEWED_HEAD" "$worktree_head" >&2
  exit 1
}
worktree_status=$(git -C "$WT" status --porcelain --untracked-files=all)
[[ -z $worktree_status ]] || {
  printf '%s\n%s\n' 'Reviewed worktree is not clean:' "$worktree_status" >&2
  exit 1
}
production_head=$(git -C "$PROD" rev-parse HEAD)
[[ $production_head == "$REVIEWED_PRODUCTION_HEAD" ]] || {
  printf 'Production HEAD mismatch: expected %s, found %s\n' "$REVIEWED_PRODUCTION_HEAD" "$production_head" >&2
  exit 1
}

PRE_HEAD=
PRE_REF=
PRE_ACTIVE=
PRE_ENABLED=
PRE_PID=
PRE_RESTARTS=
POST_HEAD=
ROLLBACK_STARTED=0
MUTATION_STARTED=0
PROBE_STATE=

verify_gif_file() {
  local file=$1
  printf '%s  %s\n' "$GIF_SHA256" "$file" | sha256sum -c - >/dev/null
  [[ $(file -b --mime-type "$file") == image/gif ]]
  GIF_FILE="$file" EXPECTED_GIF_SIZE="$GIF_SIZE" EXPECTED_GIF_WIDTH="$GIF_WIDTH" EXPECTED_GIF_HEIGHT="$GIF_HEIGHT" node - <<'NODE'
const { readFileSync, statSync } = require('node:fs');
const p = process.env.GIF_FILE;
const bytes = readFileSync(p);
if (statSync(p).size !== Number(process.env.EXPECTED_GIF_SIZE)) process.exit(1);
if (bytes.subarray(0, 6).toString('ascii') !== 'GIF89a') process.exit(1);
if (bytes.readUInt16LE(6) !== Number(process.env.EXPECTED_GIF_WIDTH)) process.exit(1);
if (bytes.readUInt16LE(8) !== Number(process.env.EXPECTED_GIF_HEIGHT)) process.exit(1);
NODE
}

verify_manifest_restored() {
  sudo env BACKUP="$BACKUP" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
backup = Path(os.environ['BACKUP'])
rows = json.loads((backup / 'manifest.json').read_text())
for row in rows:
    path = Path(row['path'])
    if row['existed']:
        if not path.is_file():
            raise SystemExit(f'missing restored file: {path}')
        if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
            raise SystemExit(f'restored checksum mismatch: {path}')
        s = path.stat()
        if (s.st_mode & 0o7777) != row['mode'] or s.st_uid != row['uid'] or s.st_gid != row['gid']:
            raise SystemExit(f'restored metadata mismatch: {path}')
    elif path.exists():
        raise SystemExit(f'new path still exists after rollback: {path}')
PY
}

restore_service_state() {
  local rc=0 restore_epoch pid1 restarts1 pid2 restarts2
  sudo systemctl daemon-reload || rc=1
  if [[ $PRE_ENABLED == enabled ]]; then
    sudo systemctl enable "$SERVICE" >/dev/null || rc=1
  else
    sudo systemctl disable "$SERVICE" >/dev/null || rc=1
  fi
  if [[ $PRE_ACTIVE == active ]]; then
    restore_epoch=$(date +%s)
    sudo systemctl start "$SERVICE" || rc=1
    sudo systemctl is-active "$SERVICE" >/dev/null || rc=1
    pid1=$(systemctl show "$SERVICE" -p MainPID --value) || rc=1
    restarts1=$(systemctl show "$SERVICE" -p NRestarts --value) || rc=1
    [[ $pid1 =~ ^[1-9][0-9]*$ ]] || rc=1
    sleep 5
    pid2=$(systemctl show "$SERVICE" -p MainPID --value) || rc=1
    restarts2=$(systemctl show "$SERVICE" -p NRestarts --value) || rc=1
    [[ $pid2 == "$pid1" && $restarts2 == "$restarts1" ]] || rc=1
    journalctl -u "$SERVICE" --since "@$restore_epoch" --no-pager | grep -F 'loopers-sales-bot ready' >/dev/null || rc=1
  else
    sudo systemctl stop "$SERVICE" || rc=1
    if systemctl is-active "$SERVICE" >/dev/null; then rc=1; fi
  fi
  if [[ $PRE_ENABLED == enabled ]]; then
    systemctl is-enabled "$SERVICE" >/dev/null || rc=1
  else
    if systemctl is-enabled "$SERVICE" >/dev/null; then rc=1; fi
  fi
  return "$rc"
}

rollback() {
  local status=${1:-1}
  local rollback_error=0 candidate current parent subject
  (( ROLLBACK_STARTED == 0 )) || exit "$status"
  ROLLBACK_STARTED=1
  trap - ERR INT TERM
  set +e
  if [[ -n $PROBE_STATE ]]; then
    rm -f "$PROBE_STATE" || rollback_error=1
    PROBE_STATE=
  fi
  if (( MUTATION_STARTED == 0 )); then
    if (( rollback_error != 0 )); then
      printf 'Loopers sales media pre-mutation cleanup failed; inspect backup path %s\n' "$BACKUP" >&2
      exit 125
    fi
    printf 'Loopers sales media rollout failed before production mutation; backup %s\n' "$BACKUP" >&2
    exit "$status"
  fi
  sudo systemctl stop "$SERVICE" || rollback_error=1
  if [[ -f $BACKUP/manifest.json ]]; then
    sudo env BACKUP="$BACKUP" python3 - <<'PY' || rollback_error=1
import json, os, shutil
from pathlib import Path
backup = Path(os.environ['BACKUP'])
for row in json.loads((backup / 'manifest.json').read_text()):
    path = Path(row['path'])
    if row['existed']:
        src = backup / 'files' / str(path).lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, path)
        os.chown(path, row['uid'], row['gid'])
        os.chmod(path, row['mode'])
    elif path.exists():
        path.unlink()
PY
  else
    rollback_error=1
  fi

  current=$(git -C "$PROD" rev-parse HEAD 2>/dev/null) || rollback_error=1
  candidate=$POST_HEAD
  if [[ -z $candidate && -n $current && -n $PRE_HEAD && $current != "$PRE_HEAD" ]]; then
    parent=$(git -C "$PROD" rev-parse "$current^" 2>/dev/null) || true
    subject=$(git -C "$PROD" log -1 --format=%s "$current" 2>/dev/null) || true
    if [[ $parent == "$PRE_HEAD" && $subject == 'feat: upgrade Loopers sales media' ]]; then
      candidate=$current
    fi
  fi
  if [[ -n $candidate && -n $PRE_HEAD && -n $PRE_REF && $current == "$candidate" ]]; then
    git -C "$PROD" update-ref "$PRE_REF" "$PRE_HEAD" "$candidate" || rollback_error=1
  elif [[ -n $PRE_HEAD && $current != "$PRE_HEAD" ]]; then
    rollback_error=1
  fi
  if [[ -n $PRE_HEAD ]]; then
    git -C "$PROD" reset "$PRE_HEAD" -- "${TRACKED_PATHS[@]}" || rollback_error=1
    [[ $(git -C "$PROD" rev-parse HEAD 2>/dev/null) == "$PRE_HEAD" ]] || rollback_error=1
    git -C "$PROD" diff --cached --binary > "$BACKUP/rollback-index.patch" || rollback_error=1
    cmp -s "$BACKUP/pre-index.patch" "$BACKUP/rollback-index.patch" || rollback_error=1
  fi
  verify_manifest_restored || rollback_error=1
  restore_service_state || rollback_error=1
  if (( rollback_error != 0 )); then
    printf 'Loopers sales media rollback encountered errors; inspect backup %s\n' "$BACKUP" >&2
    exit 125
  fi
  printf 'Loopers sales media rollout failed; restored backup %s\n' "$BACKUP" >&2
  exit "$status"
}

trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM

for rel in "${REPO_PATHS[@]}"; do
  [[ -f $WT/$rel ]]
  if git -C "$PROD" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
    if ! git -C "$PROD" diff --quiet -- "$rel" \
      || ! git -C "$PROD" diff --cached --quiet -- "$rel"; then
      printf 'Tracked manifest path already differs in production: %s\n' "$rel" >&2
      exit 1
    fi
  elif [[ -e $PROD/$rel || -L $PROD/$rel ]]; then
    printf 'Untracked or ignored manifest path already exists in production: %s\n' "$rel" >&2
    exit 1
  fi
done

[[ -f $OPENSEA_CONFIG ]]
git -C "$WT" ls-files --error-unmatch -- apps/web/public/loopers-sweep.gif >/dev/null
git -C "$WT" check-ignore -q -- apps/web/dist/loopers-sweep.gif
verify_gif_file "$WT/apps/web/public/loopers-sweep.gif"
verify_gif_file "$WT/apps/web/dist/loopers-sweep.gif"
cmp -s "$WT/apps/web/public/loopers-sweep.gif" "$WT/apps/web/dist/loopers-sweep.gif"
bash -n "$WT/docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh"

install -d -m 0700 "$BACKUP/files"

PRE_HEAD=$(git -C "$PROD" rev-parse HEAD)
PRE_REF=$(git -C "$PROD" symbolic-ref -q HEAD)
PRE_ACTIVE=$(systemctl is-active "$SERVICE" || true)
PRE_ENABLED=$(systemctl is-enabled "$SERVICE" || true)
PRE_PID=$(systemctl show "$SERVICE" -p MainPID --value)
PRE_RESTARTS=$(systemctl show "$SERVICE" -p NRestarts --value)
printf '%s\n' "$PRE_HEAD" > "$BACKUP/pre-head"
printf '%s\n' "$PRE_REF" > "$BACKUP/pre-ref"
printf '%s\n' "$PRE_ACTIVE" > "$BACKUP/pre-active"
printf '%s\n' "$PRE_ENABLED" > "$BACKUP/pre-enabled"
printf '%s\n' "$PRE_PID" > "$BACKUP/pre-pid"
printf '%s\n' "$PRE_RESTARTS" > "$BACKUP/pre-restarts"
git -C "$PROD" status --porcelain=v1 > "$BACKUP/pre-git-status"
git -C "$PROD" diff --cached --binary > "$BACKUP/pre-index.patch"
stat -c '%a %U:%G' "$STATE_FILE" > "$BACKUP/pre-state-stat"

DEPLOY_PROD="$PROD" DEPLOY_BACKUP="$BACKUP" python3 - <<'PY'
import hashlib, json, os, shutil, stat
from pathlib import Path
prod = Path(os.environ['DEPLOY_PROD'])
backup = Path(os.environ['DEPLOY_BACKUP'])
repo = [
  '.gitignore',
  'apps/api/src/loopers-sales/telegram.js',
  'apps/api/test/loopers-sales-telegram.test.mjs',
  'apps/api/src/loopers-sales-bot.js',
  'apps/api/scripts/run-loopers-sales-bot.js',
  'apps/api/test/loopers-sales-bot.test.mjs',
  'apps/web/public/loopers-sweep.gif',
  'apps/web/dist/loopers-sweep.gif',
  'deploy/systemd/loopers-sales-bot.service',
  'apps/api/test/loopers-sales-rollout.test.mjs',
  'docs/superpowers/plans/2026-09-19-loopers-sales-media-upgrade.md',
  'docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh',
]
paths = [prod / p for p in repo] + [
  Path('/var/www/helixa.xyz/multipass/loopers-sweep.gif'),
  Path('/etc/systemd/system/loopers-sales-bot.service'),
]
rows = []
for src in paths:
    row = {'path': str(src), 'existed': src.exists()}
    if src.exists():
        s = src.stat()
        row.update(mode=stat.S_IMODE(s.st_mode), uid=s.st_uid, gid=s.st_gid,
                   sha256=hashlib.sha256(src.read_bytes()).hexdigest(), size=s.st_size)
        dst = backup / 'files' / str(src).lstrip('/')
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        if hashlib.sha256(dst.read_bytes()).hexdigest() != row['sha256']:
            raise SystemExit(f'backup checksum mismatch: {src}')
    rows.append(row)
(backup / 'manifest.json').write_text(json.dumps(rows, indent=2) + '\n')
PY

MUTATION_STARTED=1
for rel in "${REPO_PATHS[@]}"; do
  install -D -o ubuntu -g ubuntu -m "$(stat -c '%a' "$WT/$rel")" "$WT/$rel" "$PROD/$rel"
done

cd "$PROD"
git add -- "${TRACKED_PATHS[@]}"
git diff --cached --check
git commit --only -m 'feat: upgrade Loopers sales media' -- "${TRACKED_PATHS[@]}"
POST_HEAD=$(git rev-parse HEAD)
git diff-tree --no-commit-id --name-only -r "$POST_HEAD" | sort > "$BACKUP/committed-paths"
if comm -23 "$BACKUP/committed-paths" <(printf '%s\n' "${TRACKED_PATHS[@]}" | sort) | grep -q .; then
  echo 'integration commit contains an unreviewed path' >&2
  exit 1
fi
printf '%s\n' "$POST_HEAD" > "$BACKUP/post-head"
git diff --cached --binary > "$BACKUP/post-index.patch"
cmp -s "$BACKUP/pre-index.patch" "$BACKUP/post-index.patch"

node --test apps/api/test/loopers-sales-*.test.mjs apps/api/test/loopers-activity-bot.test.mjs
node --check apps/api/src/loopers-sales/telegram.js
node --check apps/api/src/loopers-sales-bot.js
node --check apps/api/scripts/run-loopers-sales-bot.js
bash -n docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh

pid_before_probe=$(systemctl show "$SERVICE" -p MainPID --value)
PROBE_STATE=$(mktemp "$BACKUP/loopers-sales-probe-state.XXXXXX")
rm -f "$PROBE_STATE"
sudo -u ubuntu env HOME=/home/ubuntu \
  /usr/bin/node "$PROD/apps/api/scripts/run-loopers-sales-bot.js" \
  --probe \
  --state-path "$PROBE_STATE" \
  --opensea-config-path "$OPENSEA_CONFIG" \
  | tee "$BACKUP/probe.log"
[[ $(systemctl show "$SERVICE" -p MainPID --value) == "$pid_before_probe" ]]
grep -F '"telegramCalls":0' "$BACKUP/probe.log" >/dev/null
rm -f "$PROBE_STATE"
PROBE_STATE=

verify_gif_file "$PROD/apps/web/dist/loopers-sweep.gif"
sudo install -o ubuntu -g ubuntu -m 0644 "$PROD/apps/web/dist/loopers-sweep.gif" "$LIVE_GIF"

live_body=$(mktemp)
live_headers=$(mktemp)
for attempt in 1 2 3 4 5; do
  if curl -fsS -D "$live_headers" -o "$live_body" https://helixa.xyz/multipass/loopers-sweep.gif \
    && grep -Eqi '^content-type:[[:space:]]*image/gif' "$live_headers" \
    && grep -Eqi "^content-length:[[:space:]]*$GIF_SIZE" "$live_headers" \
    && verify_gif_file "$live_body"; then
    break
  fi
  [[ $attempt -lt 5 ]]
  sleep 2
done
rm -f "$live_body" "$live_headers"

readonly DEPLOY_EPOCH=$(date +%s)
sudo install -o root -g root -m 0644 "$PROD/deploy/systemd/loopers-sales-bot.service" "$INSTALLED_UNIT"
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"

systemctl is-active "$SERVICE" >/dev/null
systemctl is-enabled "$SERVICE" >/dev/null
pid1=$(systemctl show "$SERVICE" -p MainPID --value)
restarts1=$(systemctl show "$SERVICE" -p NRestarts --value)
[[ $pid1 =~ ^[1-9][0-9]*$ ]]
sleep 5
pid2=$(systemctl show "$SERVICE" -p MainPID --value)
restarts2=$(systemctl show "$SERVICE" -p NRestarts --value)
[[ $pid2 == "$pid1" && $restarts2 == "$restarts1" ]]
journalctl -u "$SERVICE" --since "@$DEPLOY_EPOCH" --no-pager | tee "$BACKUP/post-restart-journal"
grep -F 'loopers-sales-bot ready' "$BACKUP/post-restart-journal" >/dev/null
[[ $(stat -c '%a %U:%G' "$STATE_FILE") == '600 ubuntu:ubuntu' ]]
verify_gif_file "$LIVE_GIF"

trap - ERR INT TERM
printf 'Loopers sales media rollout complete; backup retained at %s\n' "$BACKUP"

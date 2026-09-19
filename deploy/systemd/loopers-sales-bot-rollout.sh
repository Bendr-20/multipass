#!/usr/bin/env bash
set -Eeuo pipefail

readonly OLD_UNIT=loopers-mint-activity-bot.service
readonly NEW_UNIT=loopers-sales-bot.service
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly UNIT_SOURCE="$REPO_ROOT/deploy/systemd/$NEW_UNIT"
readonly SYSTEMD_DIR="${LOOPERS_ROLLOUT_SYSTEMD_DIR:-/etc/systemd/system}"
readonly OPENSEA_CONFIG="${LOOPERS_ROLLOUT_OPENSEA_CONFIG:-/home/ubuntu/.config/opensea/config.json}"
readonly STATE_DIR="${LOOPERS_ROLLOUT_STATE_DIR:-/var/lib/helixa}"
readonly STATE_PATH="$STATE_DIR/loopers-sales-seen.json"
readonly READY_TIMEOUT="${LOOPERS_ROLLOUT_READY_TIMEOUT_SECONDS:-90}"

usage() {
  printf '%s\n' 'Usage: loopers-sales-bot-rollout.sh --probe-only|--install'
}

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
mode=$1
[[ "$mode" == --probe-only || "$mode" == --install ]] || { usage >&2; exit 2; }

chmod 0600 "$OPENSEA_CONFIG"
install -d -o ubuntu -g ubuntu -m 0700 "$STATE_DIR"

run_probe() {
  [[ "${LOOPERS_ROLLOUT_SKIP_PROBE:-0}" == 1 ]] && return 0
  local probe_state
  probe_state=$(mktemp "${TMPDIR:-/tmp}/loopers-sales-probe.XXXXXX.json")
  rm -f "$probe_state"
  if ! sudo -u ubuntu /usr/bin/node "$REPO_ROOT/apps/api/scripts/run-loopers-sales-bot.js" \
    --probe --state-path "$probe_state" --opensea-config-path "$OPENSEA_CONFIG"; then
    rm -f "$probe_state"
    return 1
  fi
  rm -f "$probe_state"
}

run_probe
[[ "$mode" == --probe-only ]] && { printf '%s\n' 'Loopers sales probe complete'; exit 0; }

old_was_active=0
old_was_enabled=0
systemctl is-active "$OLD_UNIT" >/dev/null 2>&1 && old_was_active=1 || true
systemctl is-enabled "$OLD_UNIT" >/dev/null 2>&1 && old_was_enabled=1 || true
rollback_dir=$(mktemp -d "${TMPDIR:-/tmp}/loopers-sales-rollback.XXXXXX")
systemctl cat "$OLD_UNIT" > "$rollback_dir/$OLD_UNIT.before"
printf '%s\n' "$old_was_active" > "$rollback_dir/old-active"
printf '%s\n' "$old_was_enabled" > "$rollback_dir/old-enabled"

rollback() {
  local exit_code=${1:-1}
  trap - ERR INT TERM
  set +e
  systemctl stop "$NEW_UNIT"
  systemctl disable "$NEW_UNIT"
  if [[ "$old_was_enabled" == 1 ]]; then systemctl enable "$OLD_UNIT"; else systemctl disable "$OLD_UNIT"; fi
  if [[ "$old_was_active" == 1 ]]; then systemctl start "$OLD_UNIT"; else systemctl stop "$OLD_UNIT"; fi
  systemctl daemon-reload
  if [[ "$old_was_active" == 1 ]]; then systemctl is-active "$OLD_UNIT" >/dev/null; fi
  if [[ "$old_was_enabled" == 1 ]]; then systemctl is-enabled "$OLD_UNIT" >/dev/null; fi
  printf '%s\n' 'Loopers sales rollout failed; legacy service restored' >&2
  exit "$exit_code"
}

trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM

started_at=$(date +%s)
systemctl stop "$OLD_UNIT"
install -o root -g root -m 0644 "$UNIT_SOURCE" "$SYSTEMD_DIR/$NEW_UNIT"
systemctl daemon-reload
systemctl start "$NEW_UNIT"

ready=0
deadline=$((SECONDS + READY_TIMEOUT))
while (( SECONDS <= deadline )); do
  if journalctl -u "$NEW_UNIT" --since "@$started_at" --no-pager | grep -Fq 'loopers-sales-bot ready'; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]]
systemctl is-active "$NEW_UNIT" >/dev/null
pid_before=$(systemctl show "$NEW_UNIT" -p MainPID --value)
[[ "$pid_before" =~ ^[1-9][0-9]*$ ]]
sleep 2
pid_after=$(systemctl show "$NEW_UNIT" -p MainPID --value)
[[ "$pid_after" == "$pid_before" ]]
if [[ "${LOOPERS_ROLLOUT_SKIP_STATE_CHECK:-0}" != 1 ]]; then
  [[ -f "$STATE_PATH" ]]
  [[ "$(stat -c '%a %U:%G' "$STATE_PATH")" == '600 ubuntu:ubuntu' ]]
fi

# Preserve rollback posture until all runtime proof has passed.
systemctl disable "$OLD_UNIT"
systemctl enable "$NEW_UNIT"
systemctl is-active "$NEW_UNIT" >/dev/null
systemctl is-enabled "$NEW_UNIT" >/dev/null
! systemctl is-active "$OLD_UNIT" >/dev/null
! systemctl is-enabled "$OLD_UNIT" >/dev/null

trap - ERR INT TERM
printf '%s\n' 'Loopers sales rollout complete'

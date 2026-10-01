#!/usr/bin/env bash
set -Eeuo pipefail
release= port= state_dir=
while (($#)); do
  case "$1" in
    --release) release=$2; shift 2 ;;
    --port) port=$2; shift 2 ;;
    --state-dir) state_dir=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
[[ -n "$release" && -d "$release" && -f "$release/apps/api/src/server.js" ]] || { echo "invalid release" >&2; exit 65; }
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1024 && port <= 65535)) || { echo "invalid port" >&2; exit 65; }
[[ -n "$state_dir" ]] || { echo "missing state directory" >&2; exit 65; }
artifact="$release/runtime/looper-codex-v1.json"
[[ -f "$artifact" && ! -L "$artifact" ]] || { echo "missing release artifact" >&2; exit 65; }
if ss -H -ltn "sport = :$port" | grep -q .; then echo "port occupied: $port" >&2; exit 69; fi
mkdir -p "$state_dir"
chmod 700 "$state_dir"
if [[ -e "$state_dir/pid" ]]; then old=$(cat "$state_dir/pid" 2>/dev/null || true); [[ -z "$old" || ! -d "/proc/$old" ]] || { echo "canary already running" >&2; exit 69; }; fi
(
  set -a
  for env_file in /etc/default/multipass-api /etc/default/multipass-api-xmtp-holder-proof; do
    [[ ! -r "$env_file" ]] || source "$env_file"
  done
  set +a
  export HOST=127.0.0.1 PORT="$port"
  export MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH="$artifact"
  export MULTIPASS_XMTP_ENABLED=false
  export MULTIPASS_AGENT_BANKR_LLM_ENABLED=false
  export MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED=false
  export MULTIPASS_CONSOLE_MARKET_READ_ENABLED=false
  export MULTIPASS_CONSOLE_ACCOUNT_READ_ENABLED=false
  cd "$release"
  exec node apps/api/src/server.js --host 127.0.0.1 --port "$port"
) >"$state_dir/stdout.log" 2>"$state_dir/stderr.log" < /dev/null &
pid=$!
printf "%s\n" "$pid" > "$state_dir/pid"
for _ in $(seq 1 120); do
  kill -0 "$pid" 2>/dev/null || { cat "$state_dir/stderr.log" >&2; exit 70; }
  if ss -H -ltn "sport = :$port" | grep -q .; then
    printf "canary=ready pid=%s port=%s\n" "$pid" "$port"
    exit 0
  fi
  sleep 0.25
done
kill "$pid" 2>/dev/null || true
echo "canary startup timeout" >&2
exit 70

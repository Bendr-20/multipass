#!/usr/bin/env bash
set -Eeuo pipefail

release= port= state_dir= policy= database= bankr_env=
stop_only=false replace=false
discovery=false talk=false news_write=false news_read=false

fail() { printf '%s
' "$1" >&2; exit "${2:-65}"; }
need_value() { (($# >= 2)) || fail "missing argument value" 64; }
while (($#)); do
  case "$1" in
    --release) need_value "$@"; release=$2; shift 2 ;;
    --port) need_value "$@"; port=$2; shift 2 ;;
    --state-dir) need_value "$@"; state_dir=$2; shift 2 ;;
    --policy) need_value "$@"; policy=$2; shift 2 ;;
    --database) need_value "$@"; database=$2; shift 2 ;;
    --bankr-env) need_value "$@"; bankr_env=$2; shift 2 ;;
    --enable-discovery) discovery=true; shift ;;
    --enable-talk) talk=true; shift ;;
    --enable-news-write) news_write=true; shift ;;
    --enable-news-read) news_read=true; shift ;;
    --stop) stop_only=true; shift ;;
    --replace) replace=true; shift ;;
    *) printf 'unknown argument: %s
' "$1" >&2; exit 64 ;;
  esac
done

[[ -n "$release" && -n "$port" && -n "$state_dir" && -n "$policy" && -n "$database" ]] || fail "release, port, state directory, policy, and database are required"
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1024 && port <= 65535)) || fail "invalid port"
[[ -d "$release" && ! -L "$release" ]] || fail "invalid release"
release_real=$(realpath -e -- "$release") || fail "invalid release"
[[ "$release" == "$release_real" ]] || fail "release path must be exact"
[[ -f "$release/apps/api/src/server.js" && ! -L "$release/apps/api/src/server.js" ]] || fail "invalid release server"
artifact="$release/runtime/looper-codex-v1.json"
[[ -f "$artifact" && ! -L "$artifact" ]] || fail "missing pinned Codex artifact"
artifact_real=$(realpath -e -- "$artifact") || fail "invalid pinned Codex artifact"
[[ "$artifact_real" == "$release_real"/* ]] || fail "invalid pinned Codex artifact"
artifact_mode=$(stat -c '%a' -- "$artifact")
(( (8#$artifact_mode & 8#022) == 0 )) || fail "pinned Codex artifact is writable"

if [[ ! -e "$state_dir" ]]; then mkdir -m 700 -- "$state_dir"; fi
[[ -d "$state_dir" && ! -L "$state_dir" ]] || fail "invalid state directory"
state_real=$(realpath -e -- "$state_dir") || fail "invalid state directory"
[[ "$state_dir" == "$state_real" ]] || fail "state directory path must be exact"
[[ $(stat -c '%u' -- "$state_dir") == "$EUID" ]] || fail "invalid state directory owner"
[[ $(stat -c '%a' -- "$state_dir") == 700 ]] || fail "invalid state directory mode"

protected_file() {
  local path=$1 label=$2 mode owner
  [[ -f "$path" && ! -L "$path" ]] || fail "invalid $label"
  mode=$(stat -c '%a' -- "$path"); owner=$(stat -c '%u' -- "$path")
  [[ "$mode" == 600 || "$mode" == 400 ]] || fail "$label must be protected"
  [[ "$owner" == "$EUID" || "$owner" == 0 ]] || fail "invalid $label owner"
}
protected_file "$policy" "policy"
policy_real=$(realpath -e -- "$policy") || fail "invalid policy"
protected_file "$database" "database"
database_real=$(realpath -e -- "$database") || fail "invalid database"
[[ "$database_real" == "$state_real"/* ]] || fail "database must be a copied canary database inside state directory"

bankr_key= bankr_model=
read_bankr_env() {
  local line key value seen_key=false seen_model=false
  [[ -n "$bankr_env" ]] || fail "Bankr environment is required when talk is enabled"
  [[ -f "$bankr_env" && ! -L "$bankr_env" ]] || fail "invalid Bankr environment"
  [[ $(stat -c '%u' -- "$bankr_env") == 0 && $(stat -c '%a' -- "$bankr_env") == 600 ]] || fail "Bankr environment must be root-owned mode 0600"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    [[ "$line" != *$''* && "$line" != *$'
'* ]] || fail "invalid Bankr environment"
    [[ "$line" == *=* ]] || fail "invalid Bankr environment"
    key=${line%%=*}; value=${line#*=}
    case "$key" in
      BANKR_API_KEY)
        [[ "$seen_key" == false ]] || fail "duplicate Bankr environment key"
        [[ "$value" =~ ^[A-Za-z0-9._:-]{16,512}$ ]] || fail "invalid Bankr environment value"
        bankr_key=$value; seen_key=true ;;
      BANKR_MODEL)
        [[ "$seen_model" == false ]] || fail "duplicate Bankr environment key"
        [[ "$value" =~ ^[A-Za-z0-9._:/-]{1,128}$ ]] || fail "invalid Bankr model"
        bankr_model=$value; seen_model=true ;;
      *) fail "unknown Bankr environment key" ;;
    esac
  done < "$bankr_env"
  [[ "$seen_key" == true ]] || fail "Bankr API key is required"
}
[[ "$talk" == false ]] || read_bankr_env
if [[ "$news_write" == true ]]; then
  /usr/bin/node -e '
    const fs = require("node:fs");
    try {
      const policy = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const ok = Array.isArray(policy.newsSenders) && policy.newsSenders.some((sender) => sender && sender.id === "restap-smoke" && sender.enabled === true);
      process.exit(ok ? 0 : 1);
    } catch { process.exit(1); }
  ' "$policy_real" || fail "news-write policy must enable restap-smoke"
fi

meta_file() { printf '%s/%s' "$state_real" "$1"; }
secure_state_file() {
  local path=$1
  [[ -f "$path" && ! -L "$path" ]] || fail "canary identity verification failed" 69
  [[ $(stat -c '%u' -- "$path") == "$EUID" ]] || fail "canary identity verification failed" 69
  local mode; mode=$(stat -c '%a' -- "$path")
  (( (8#$mode & 8#077) == 0 )) || fail "canary identity verification failed" 69
}
read_meta() { local p; p=$(meta_file "$1"); secure_state_file "$p"; cat -- "$p"; }
process_live() {
  local pid=$1 state
  [[ -r "/proc/$pid/stat" ]] || return 1
  state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null) || return 1
  [[ "$state" != Z ]]
}
verify_identity() {
  local pid saved_start saved_release saved_port saved_policy saved_database saved_hash current_start current_hash
  pid=$(read_meta pid); [[ "$pid" =~ ^[1-9][0-9]*$ ]] || fail "canary identity verification failed" 69
  process_live "$pid" || fail "canary identity verification failed" 69
  saved_start=$(read_meta starttime); current_start=$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || true)
  [[ "$saved_start" =~ ^[0-9]+$ && "$saved_start" == "$current_start" ]] || fail "canary identity verification failed" 69
  saved_release=$(read_meta release); saved_port=$(read_meta port); saved_policy=$(read_meta policy); saved_database=$(read_meta database)
  [[ "$saved_release" == "$release_real" && "$saved_port" == "$port" && "$saved_policy" == "$policy_real" && "$saved_database" == "$database_real" ]] || fail "canary identity verification failed" 69
  [[ $(readlink -e "/proc/$pid/cwd" 2>/dev/null || true) == "$release_real" ]] || fail "canary identity verification failed" 69
  saved_hash=$(read_meta command.sha256); current_hash=$(sha256sum "/proc/$pid/cmdline" 2>/dev/null | awk '{print $1}')
  [[ "$saved_hash" =~ ^[a-f0-9]{64}$ && "$saved_hash" == "$current_hash" ]] || fail "canary identity verification failed" 69
  printf '%s' "$pid"
}
verified_stop() {
  local pid; pid=$(verify_identity)
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || fail "canary stop failed" 70
  for _ in $(seq 1 80); do
    if ! process_live "$pid"; then
      rm -f -- "$(meta_file owner-auth.json)" "$(meta_file pid)" "$(meta_file starttime)" "$(meta_file release)" "$(meta_file port)" "$(meta_file policy)" "$(meta_file database)" "$(meta_file command.sha256)"
      printf 'canary=stopped pid=%s port=%s
' "$pid" "$port"
      return 0
    fi
    sleep 0.1
  done
  fail "canary stop timeout" 70
}

if [[ "$stop_only" == true ]]; then
  [[ "$replace" == false ]] || fail "stop and replace are mutually exclusive" 64
  verified_stop
  exit 0
fi
if [[ "$replace" == true ]]; then verified_stop; fi

if [[ -e "$(meta_file pid)" ]]; then
  old=$(cat "$(meta_file pid)" 2>/dev/null || true)
  [[ -z "$old" || ! -r "/proc/$old/stat" ]] || fail "canary already running" 69
  fail "stale canary state requires inspection" 69
fi

/usr/bin/node -e "const n=require('node:net').createServer();n.once('error',()=>process.exit(1));n.listen($port,'127.0.0.1',()=>n.close(()=>process.exit(0)))" || fail "port occupied" 69

gates_tmp=$(meta_file .gates.tmp.$$)
umask 077
{
  printf 'MULTIPASS_RESTAP_DISCOVERY_ENABLED=%s
' "$discovery"
  printf 'MULTIPASS_RESTAP_TALK_ENABLED=%s
' "$talk"
  printf 'MULTIPASS_RESTAP_NEWS_WRITE_ENABLED=%s
' "$news_write"
  printf 'MULTIPASS_RESTAP_NEWS_READ_ENABLED=%s
' "$news_read"
} > "$gates_tmp"
mv -f -- "$gates_tmp" "$(meta_file gates.state)"

export HOST=127.0.0.1 PORT="$port"
export MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH="$artifact_real"
export MULTIPASS_RESTAP_3802_POLICY_PATH="$policy_real"
export MULTIPASS_DB_PATH="$database_real"
export MULTIPASS_RESTAP_DISCOVERY_ENABLED="$discovery"
export MULTIPASS_RESTAP_TALK_ENABLED="$talk"
export MULTIPASS_RESTAP_NEWS_WRITE_ENABLED="$news_write"
export MULTIPASS_RESTAP_NEWS_READ_ENABLED="$news_read"
export MULTIPASS_RESTAP_TRUST_LOOPBACK_PROXY=false
export MULTIPASS_XMTP_ENABLED=false
export MULTIPASS_AGENT_BANKR_LLM_ENABLED=false
export MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED=false
export MULTIPASS_CONSOLE_MARKET_READ_ENABLED=false
export MULTIPASS_CONSOLE_ACCOUNT_READ_ENABLED=false
if [[ "$talk" == true ]]; then
  export BANKR_API_KEY="$bankr_key"
  [[ -z "$bankr_model" ]] || export MULTIPASS_RESTAP_TALK_MODEL="$bankr_model"
fi

runner=(/usr/bin/node apps/api/src/server.js --host 127.0.0.1 --port "$port" --database "$database_real")
if ((EUID == 0)) && command -v runuser >/dev/null 2>&1 && id ubuntu >/dev/null 2>&1; then
  runner=(/usr/sbin/runuser -u ubuntu --preserve-environment -- "${runner[@]}")
fi
cd "$release_real"
setsid "${runner[@]}" >"$(meta_file stdout.log)" 2>"$(meta_file stderr.log)" < /dev/null &
pid=$!
cleanup_start() {
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f -- "$(meta_file pid)" "$(meta_file starttime)" "$(meta_file release)" "$(meta_file port)" "$(meta_file policy)" "$(meta_file database)" "$(meta_file command.sha256)"
}
trap 'cleanup_start; exit 70' ERR HUP INT TERM
for _ in $(seq 1 100); do [[ -r "/proc/$pid/stat" ]] && break; sleep 0.02; done
process_live "$pid" || { cat "$(meta_file stderr.log)" >&2; fail "canary failed to start" 70; }
write_meta() { local name=$1 value=$2 tmp; tmp=$(meta_file ".$name.tmp.$$"); printf '%s
' "$value" > "$tmp"; chmod 600 "$tmp"; mv -f -- "$tmp" "$(meta_file "$name")"; }
write_meta pid "$pid"
write_meta starttime "$(awk '{print $22}' "/proc/$pid/stat")"
write_meta release "$release_real"
write_meta port "$port"
write_meta policy "$policy_real"
write_meta database "$database_real"
write_meta command.sha256 "$(sha256sum "/proc/$pid/cmdline" | awk '{print $1}')"
ready=false
for _ in $(seq 1 120); do
  process_live "$pid" || { cat "$(meta_file stderr.log)" >&2; fail "canary failed to start" 70; }
  if /usr/bin/node -e "const n=require('node:net').connect({host:'127.0.0.1',port:$port});n.once('connect',()=>{n.destroy();process.exit(0)});n.once('error',()=>process.exit(1));setTimeout(()=>process.exit(1),100)"; then ready=true; break; fi
  sleep 0.1
done
[[ "$ready" == true ]] || fail "canary startup timeout" 70
trap - ERR HUP INT TERM
printf 'canary=ready pid=%s port=%s gates=%s,%s,%s,%s
' "$pid" "$port" "$discovery" "$talk" "$news_write" "$news_read"

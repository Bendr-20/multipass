#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage: launch-looper-restap-network-canary.sh [start options] | --stop --identity-file PATH | --replace [start options]
Starts an unrouted RESTAP network canary on loopback 127.0.0.1 only.
Required start options: --release PATH --release-sha SHA --artifact PATH --policy PATH --key-registry PATH --database PATH --identity-file PATH --pid-file PATH --log-file PATH --port N
Optional: --server-entry PATH --gate NAME --dry-run --replace
EOF
}

mode=start
replace=false
dry_run=false
release=''
release_sha=''
artifact=''
policy=''
key_registry=''
database=''
identity_file=''
pid_file=''
log_file=''
server_entry=''
port=''
foundation=false
policy_gate=false
discovery=false
initiation=false
replies=false
transcripts=false
pilot=false
ga=false

while (($#)); do
  case "$1" in
    --help) usage; exit 0 ;;
    --stop) mode=stop; shift ;;
    --replace) replace=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --release|--release-sha|--artifact|--policy|--key-registry|--database|--identity-file|--pid-file|--log-file|--port|--server-entry|--gate)
      flag=$1; shift; (($#)) || { echo "missing value for $flag" >&2; exit 2; }; value=$1; shift
      case "$flag" in
        --release) release=$value ;; --release-sha) release_sha=$value ;; --artifact) artifact=$value ;;
        --policy) policy=$value ;; --key-registry) key_registry=$value ;; --database) database=$value ;;
        --identity-file) identity_file=$value ;; --pid-file) pid_file=$value ;; --log-file) log_file=$value ;;
        --port) port=$value ;; --server-entry) server_entry=$value ;;
        --gate)
          case "$value" in foundation) foundation=true ;; policy) policy_gate=true ;; discovery) discovery=true ;; initiation) initiation=true ;; replies) replies=true ;; transcripts) transcripts=true ;; pilot) pilot=true ;; ga) ga=true ;; *) echo 'unknown gate' >&2; exit 2 ;; esac ;;
      esac ;;
    *) echo 'unknown argument' >&2; exit 2 ;;
  esac
done

safe_file() { [[ -f "$1" && ! -L "$1" ]] || { echo 'required regular file is unavailable' >&2; exit 1; }; }
secret_file() {
  safe_file "$1"
  [[ "$(stat -c %u "$1")" == 0 ]] || { echo 'secret file must be root-owned' >&2; exit 1; }
  [[ "$(stat -c %a "$1")" == 600 ]] || { echo 'secret file mode must be 0600' >&2; exit 1; }
}
read_identity() {
  [[ -n "$identity_file" ]] || { echo '--identity-file is required' >&2; exit 2; }
  safe_file "$identity_file"
  [[ "$(stat -c %u "$identity_file")" == "$(id -u)" && "$(stat -c %a "$identity_file")" == 600 ]] || { echo 'canary identity ownership or mode mismatch' >&2; exit 1; }
  [[ "$(wc -l < "$identity_file")" == 6 ]] || { echo 'invalid canary identity' >&2; exit 1; }
  NETWORK_CANARY_VERSION=$(sed -n 's/^NETWORK_CANARY_VERSION=//p' "$identity_file")
  PID=$(sed -n 's/^PID=//p' "$identity_file")
  START_TICKS=$(sed -n 's/^START_TICKS=//p' "$identity_file")
  SERVER_ENTRY=$(sed -n 's/^SERVER_ENTRY=//p' "$identity_file")
  PID_FILE=$(sed -n 's/^PID_FILE=//p' "$identity_file")
  RELEASE_SHA=$(sed -n 's/^RELEASE_SHA=//p' "$identity_file")
  [[ "$NETWORK_CANARY_VERSION" == '1' && "$PID" =~ ^[1-9][0-9]*$ && "$START_TICKS" =~ ^[0-9]+$ && "$SERVER_ENTRY" =~ ^/[A-Za-z0-9._/-]+$ && "$PID_FILE" =~ ^/[A-Za-z0-9._/-]+$ && "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'invalid canary identity' >&2; exit 1; }
}
stop_canary() {
  read_identity
  if ! kill -0 "$PID" 2>/dev/null; then echo 'recorded canary process is absent' >&2; exit 1; fi
  [[ "$(stat -c %u "/proc/$PID")" == "$(id -u)" ]] || { echo 'canary process owner mismatch' >&2; exit 1; }
  current_ticks=$(awk '{print $22}' "/proc/$PID/stat")
  [[ "$current_ticks" == "$START_TICKS" ]] || { echo 'canary process identity mismatch' >&2; exit 1; }
  tr '\0' ' ' < "/proc/$PID/cmdline" | grep -F -- "$SERVER_ENTRY" >/dev/null || { echo 'canary command identity mismatch' >&2; exit 1; }
  kill -TERM "$PID"
  for _ in {1..100}; do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$PID" 2>/dev/null && { echo 'canary did not stop cleanly' >&2; exit 1; }
  rm -f -- "$identity_file" "${PID_FILE:-}"
  echo 'RESTAP network canary stopped'
}

if [[ "$mode" == stop ]]; then stop_canary; exit 0; fi
if $replace && [[ -f "$identity_file" ]]; then stop_canary; fi

for value in release release_sha artifact policy key_registry database identity_file pid_file log_file port; do [[ -n "${!value}" ]] || { echo "required start option is missing: $value" >&2; exit 2; }; done
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'invalid release SHA' >&2; exit 2; }
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1024 && port <= 65535)) || { echo 'invalid loopback port' >&2; exit 2; }
[[ -d "$release" && ! -L "$release" ]] || { echo 'release must be an immutable directory' >&2; exit 1; }
release=$(realpath "$release")
[[ "$(basename "$release")" == "multipass-restap-network-$release_sha" ]] || { echo 'release path is not bound to SHA' >&2; exit 1; }
server_entry=${server_entry:-$release/apps/api/src/server.js}
safe_file "$server_entry"
safe_file "$artifact"
if ! $dry_run; then secret_file "$policy"; secret_file "$key_registry"; fi
[[ ! -L "$database" ]] || { echo 'database symlink is forbidden' >&2; exit 1; }
mkdir -p -- "$(dirname "$database")" "$(dirname "$identity_file")" "$(dirname "$pid_file")" "$(dirname "$log_file")"
if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; then echo 'occupied loopback port' >&2; exit 1; fi

MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED=false
MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED=false
MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED=false
MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED=false
MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED=false
MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED=false
MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED=false
MULTIPASS_RESTAP_NETWORK_GA_ENABLED=false
$foundation && MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED=true
$policy_gate && MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED=true
$discovery && MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED=true
$initiation && MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED=true
$replies && MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED=true
$transcripts && MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED=true
$pilot && MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED=true
$ga && MULTIPASS_RESTAP_NETWORK_GA_ENABLED=true

if $dry_run; then
  printf '{"mode":"dry-run","host":"127.0.0.1","port":%s,"release_sha":"%s","gates":"%s,%s,%s,%s,%s,%s,%s,%s"}\n' "$port" "$release_sha" "$foundation" "$policy_gate" "$discovery" "$initiation" "$replies" "$transcripts" "$pilot" "$ga"
  exit 0
fi

env HOST=127.0.0.1 PORT="$port" \
  MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH="$artifact" \
  MULTIPASS_RESTAP_NETWORK_POLICY_FILE="$policy" \
  MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE="$key_registry" \
  MULTIPASS_RESTAP_NETWORK_DATABASE_PATH="$database" \
  MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED="$MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED="$MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED="$MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED="$MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED="$MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED="$MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED="$MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED" \
  MULTIPASS_RESTAP_NETWORK_GA_ENABLED="$MULTIPASS_RESTAP_NETWORK_GA_ENABLED" \
  node "$server_entry" >>"$log_file" 2>&1 &
pid=$!
printf '%s\n' "$pid" > "$pid_file"
chmod 0600 "$pid_file"
start_ticks=$(awk '{print $22}' "/proc/$pid/stat")
cat > "$identity_file" <<EOF
NETWORK_CANARY_VERSION=1
PID=$pid
START_TICKS=$start_ticks
SERVER_ENTRY=$server_entry
PID_FILE=$pid_file
RELEASE_SHA=$release_sha
EOF
chmod 0600 "$identity_file"
echo "RESTAP network canary started on 127.0.0.1:$port"

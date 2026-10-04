#!/usr/bin/env bash
set -eEuo pipefail
umask 077

# Safety-critical disable order: replies initiation discovery policy foundation.
DISABLE_ORDER=(replies initiation discovery policy foundation)
SERVICE_NAME=multipass-restap-network.service
DROPIN_NAME=50-restap-network.conf
SYSTEMD_ROOT=/etc/systemd/system

usage() {
  cat <<'EOF'
Usage: promote-looper-restap-network.sh --inspect | --rehearsal OPTIONS | --promote OPTIONS | --rollback --backup PATH
Required mutation options: --release PATH --release-sha SHA --artifact PATH --policy PATH --key-registry PATH --signer PATH --database PATH --unit PATH --static-root PATH --backup-root PATH --proof-root PATH
Promotion also requires --rehearsal-proof PATH. Gates are explicit and closed by default.
Rehearsal installs and starts the exact candidate, runs the local smoke, and restores the prior service state before emitting proof.
EOF
}

mode='' release='' release_sha='' artifact='' policy='' key_registry='' signer='' database='' unit='' static_root='' backup_root='' proof_root='' rehearsal_proof='' backup=''
declare -A gates=([foundation]=false [policy]=false [discovery]=false [initiation]=false [replies]=false [transcripts]=false [pilot]=false [ga]=false)
while (($#)); do
  case "$1" in
    --help) usage; exit 0 ;;
    --inspect|--rehearsal|--promote|--rollback) [[ -z "$mode" ]] || { echo 'select exactly one mode' >&2; exit 2; }; mode=${1#--}; shift ;;
    --release|--release-sha|--artifact|--policy|--key-registry|--signer|--database|--unit|--static-root|--backup-root|--proof-root|--rehearsal-proof|--backup|--gate)
      flag=$1; shift; (($#)) || { echo "missing value for $flag" >&2; exit 2; }; value=$1; shift
      case "$flag" in
        --release) release=$value ;; --release-sha) release_sha=$value ;; --artifact) artifact=$value ;; --policy) policy=$value ;;
        --key-registry) key_registry=$value ;; --signer) signer=$value ;; --database) database=$value ;; --unit) unit=$value ;;
        --static-root) static_root=$value ;; --backup-root) backup_root=$value ;; --proof-root) proof_root=$value ;;
        --rehearsal-proof) rehearsal_proof=$value ;; --backup) backup=$value ;;
        --gate) [[ -v "gates[$value]" ]] || { echo 'unknown gate' >&2; exit 2; }; gates[$value]=true ;;
      esac ;;
    *) echo 'unknown argument' >&2; exit 2 ;;
  esac
done

[[ -n "$mode" ]] || { echo 'mode is required' >&2; exit 2; }
if [[ "$mode" == inspect ]]; then
  printf 'RESTAP network promotion inspection only\nservice=%s\ndropin=%s\ndisable-order=%s\n' "$SERVICE_NAME" "$DROPIN_NAME" "${DISABLE_ORDER[*]}"
  exit 0
fi
[[ "$(id -u)" == 0 ]] || { echo "$mode requires root" >&2; exit 1; }

unit_target="$SYSTEMD_ROOT/$SERVICE_NAME"
dropin_dir="$SYSTEMD_ROOT/$SERVICE_NAME.d"
dropin_target="$dropin_dir/$DROPIN_NAME"
rollback_needed=false
backup_dir=''

restore_backup() {
  local source=$1
  for marker in unit.present environment.present service.active service.enabled database.present database.path service.user service.group; do [[ -f "$source/$marker" ]] || { echo 'rollback state marker is missing' >&2; return 1; }; done
  local restore_database restore_user restore_group
  restore_database=$(cat "$source/database.path"); restore_user=$(cat "$source/service.user"); restore_group=$(cat "$source/service.group")
  [[ "$restore_database" =~ ^/[A-Za-z0-9._/:-]+$ && "$restore_user" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ && "$restore_group" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || { echo 'rollback metadata is invalid' >&2; return 1; }
  for gate in "${DISABLE_ORDER[@]}"; do printf 'disabling %s\n' "$gate" >&2; done
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  if grep -Fx true "$source/unit.present" >/dev/null; then install -o root -g root -m 0644 "$source/unit.before" "$unit_target"; else rm -f -- "$unit_target"; fi
  if grep -Fx true "$source/environment.present" >/dev/null; then
    install -d -o root -g root -m 0755 "$dropin_dir"
    install -o root -g root -m 0600 "$source/environment.before" "$dropin_target"
  else rm -f -- "$dropin_target"; fi
  rm -f -- "$restore_database-wal" "$restore_database-shm"
  if grep -Fx true "$source/database.present" >/dev/null; then install -o "$restore_user" -g "$restore_group" -m 0600 "$source/database.before" "$restore_database"; else rm -f -- "$restore_database"; fi
  systemctl daemon-reload
  if grep -Fx true "$source/service.enabled" >/dev/null; then systemctl enable "$SERVICE_NAME"; else systemctl disable "$SERVICE_NAME" 2>/dev/null || true; fi
  if grep -Fx true "$source/service.active" >/dev/null; then systemctl start "$SERVICE_NAME"; fi
}
automatic_rollback() { [[ -n "$backup_dir" && -d "$backup_dir" ]] && restore_backup "$backup_dir"; }
rollback_on_failure() { local status=$1; trap - ERR INT TERM; if $rollback_needed; then automatic_rollback || true; fi; exit "$status"; }
trap 'rollback_on_failure $?' ERR INT TERM

if [[ "$mode" == rollback ]]; then
  [[ -n "$backup" && -d "$backup" && ! -L "$backup" ]] || { echo 'verified backup is required' >&2; exit 2; }
  restore_backup "$backup"
  echo 'RESTAP network rollback restored; database rows retained'
  exit 0
fi

for value in release release_sha artifact policy key_registry signer database unit static_root backup_root proof_root; do [[ -n "${!value}" ]] || { echo "required option is missing: $value" >&2; exit 2; }; done
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'invalid release SHA' >&2; exit 2; }
for path in "$release" "$artifact" "$policy" "$key_registry" "$signer" "$database" "$unit" "$static_root" "$backup_root" "$proof_root"; do [[ "$path" =~ ^[/A-Za-z0-9._:-]+$ ]] || { echo 'path contains unsupported characters' >&2; exit 1; }; done
[[ -d "$release" && ! -L "$release" ]] || { echo 'release must be an immutable directory' >&2; exit 1; }
release=$(realpath "$release"); [[ "$(basename "$release")" == "multipass-restap-network-$release_sha" ]] || { echo 'release path does not match SHA' >&2; exit 1; }
for path in "$artifact" "$policy" "$key_registry" "$signer" "$database" "$unit"; do [[ -f "$path" && ! -L "$path" ]] || { echo 'required file is unsafe' >&2; exit 1; }; done
[[ -d "$static_root" && ! -L "$static_root" && -d "$backup_root" && ! -L "$backup_root" && -d "$proof_root" && ! -L "$proof_root" ]] || { echo 'required directory is unsafe' >&2; exit 1; }
if find "$release" "$static_root" -xdev -type l -print -quit | grep -q .; then echo 'release and static root must not contain symlinks' >&2; exit 1; fi

service_user=$(awk -F= '/^[[:space:]]*User=/{print $2}' "$unit" | tail -1 | tr -d '[:space:]')
service_group=$(awk -F= '/^[[:space:]]*Group=/{print $2}' "$unit" | tail -1 | tr -d '[:space:]')
[[ -n "$service_user" && -n "$service_group" && "$service_user" != root ]] || { echo 'service User/Group must name a dedicated non-root account; User=root is forbidden' >&2; exit 1; }
service_uid=$(getent passwd "$service_user" | cut -d: -f3); service_gid=$(getent group "$service_group" | cut -d: -f3)
[[ "$service_uid" =~ ^[0-9]+$ && "$service_uid" != 0 && "$service_gid" =~ ^[0-9]+$ ]] || { echo 'dedicated service account is unavailable' >&2; exit 1; }
secret_file() {
  local path=$1 label=$2
  [[ "$(stat -c %u "$path")" == 0 && "$(stat -c %g "$path")" == "$service_gid" && "$(stat -c %a "$path")" == 640 ]] || { echo "$label must be root-owned, service-group-readable, mode 0640" >&2; exit 1; }
}
secret_file "$policy" policy
secret_file "$key_registry" key-registry
secret_file "$signer" signer

gate_tuple() { printf '%d,%d,%d,%d,%d,%d,%d,%d' "$([[ ${gates[foundation]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[policy]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[discovery]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[initiation]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[replies]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[transcripts]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[pilot]} == true ]] && echo 1 || echo 0)" "$([[ ${gates[ga]} == true ]] && echo 1 || echo 0)"; }
tuple=$(gate_tuple)
case "$tuple" in
  0,0,0,0,0,0,0,0) smoke_phase=phase0 ;;
  1,0,0,0,0,0,0,0) smoke_phase=foundation ;;
  1,1,0,0,0,0,0,0) smoke_phase=holder-opt-in ;;
  1,1,1,1,1,0,1,0) smoke_phase=replies ;;
  *) echo 'gate tuple is not an exact reviewed production phase' >&2; exit 1 ;;
esac

hash_file() { sha256sum -- "$1" | awk '{print $1}'; }
hash_tree() { find "$1" -xdev -type f -printf '%P\0' | sort -z | while IFS= read -r -d '' entry; do printf '%s\0' "$entry"; sha256sum -- "$1/$entry" | awk '{print $1}'; done | sha256sum | awk '{print $1}'; }
artifact=$(realpath "$artifact"); policy=$(realpath "$policy"); key_registry=$(realpath "$key_registry"); signer=$(realpath "$signer"); database=$(realpath "$database"); unit=$(realpath "$unit"); static_root=$(realpath "$static_root")
artifact_sha256=$(hash_file "$artifact"); policy_sha256=$(hash_file "$policy"); key_registry_sha256=$(hash_file "$key_registry"); signer_sha256=$(hash_file "$signer"); database_sha256=$(hash_file "$database"); unit_sha256=$(hash_file "$unit"); static_root_sha256=$(hash_tree "$static_root")

render_environment() {
  local destination=$1
  cat > "$destination" <<EOF
[Service]
EnvironmentFile=$policy
Environment=MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED=${gates[foundation]}
Environment=MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED=${gates[policy]}
Environment=MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED=${gates[discovery]}
Environment=MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED=${gates[initiation]}
Environment=MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED=${gates[replies]}
Environment=MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED=${gates[transcripts]}
Environment=MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED=${gates[pilot]}
Environment=MULTIPASS_RESTAP_NETWORK_GA_ENABLED=${gates[ga]}
Environment=MULTIPASS_RESTAP_NETWORK_DATABASE_PATH=$database
Environment=MULTIPASS_RESTAP_NETWORK_POLICY_FILE=$policy
Environment=MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE=$key_registry
Environment=MULTIPASS_RESTAP_NETWORK_SIGNER_FILE=$signer
Environment=MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH=$artifact
EOF
  chmod 0600 "$destination"
}
write_bindings() {
  cat <<EOF
release_sha=$release_sha
gate_tuple=$tuple
release_path=$release
artifact_path=$artifact
artifact_sha256=$artifact_sha256
policy_path=$policy
policy_sha256=$policy_sha256
key_registry_path=$key_registry
key_registry_sha256=$key_registry_sha256
signer_path=$signer
signer_sha256=$signer_sha256
database_path=$database
database_sha256=$database_sha256
unit_path=$unit
unit_sha256=$unit_sha256
static_root_path=$static_root
static_root_sha256=$static_root_sha256
EOF
}
capture_backup() {
  backup_dir=$1; mkdir -p "$backup_dir"
  if systemctl is-active --quiet "$SERVICE_NAME"; then echo true > "$backup_dir/service.active"; else echo false > "$backup_dir/service.active"; fi
  if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then echo true > "$backup_dir/service.enabled"; else echo false > "$backup_dir/service.enabled"; fi
  printf '%s\n' "$database" > "$backup_dir/database.path"; printf '%s\n' "$service_user" > "$backup_dir/service.user"; printf '%s\n' "$service_group" > "$backup_dir/service.group"
  if [[ -f "$unit_target" ]]; then echo true > "$backup_dir/unit.present"; cp -a "$unit_target" "$backup_dir/unit.before"; else echo false > "$backup_dir/unit.present"; fi
  if [[ -f "$dropin_target" ]]; then echo true > "$backup_dir/environment.present"; cp -a "$dropin_target" "$backup_dir/environment.before"; else echo false > "$backup_dir/environment.present"; fi
  if [[ -f "$database" ]]; then echo true > "$backup_dir/database.present"; else echo false > "$backup_dir/database.present"; fi
  chmod 0600 "$backup_dir"/*
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  if grep -Fx true "$backup_dir/database.present" >/dev/null; then cp --reflink=auto -- "$database" "$backup_dir/database.before"; fi
  chmod 0600 "$backup_dir"/*
}
install_candidate() {
  local candidate=$1
  install -d -o root -g root -m 0755 "$dropin_dir"
  render_environment "$candidate"
  install -o root -g root -m 0644 "$unit" "$unit_target"
  install -o root -g root -m 0600 "$candidate" "$dropin_target"
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  systemctl is-active --quiet "$SERVICE_NAME"
}
run_smoke() {
  node "$release/apps/api/scripts/smoke-looper-restap-network.mjs" --mode local --phase "$smoke_phase" --expected-gates "$tuple" --release-sha "$release_sha" --release "$release" --artifact "$artifact" --policy "$policy" --key-registry "$key_registry" --database "$database" --fixture-key-ref "signer=$signer" >/dev/null
}
verify_proof() { local file=$1; while IFS= read -r binding; do grep -Fx -- "$binding" "$file" >/dev/null || { echo 'rehearsal proof binding mismatch' >&2; return 1; }; done < <(write_bindings); grep -Fx 'candidate_started=true' "$file" >/dev/null; grep -Fx 'smoke_passed=true' "$file" >/dev/null; grep -Fx 'rollback=verified' "$file" >/dev/null; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
if [[ "$mode" == rehearsal ]]; then
  proof_dir="$proof_root/rehearsal-$stamp"; backup_dir="$backup_root/rehearsal-$stamp"; mkdir -p "$proof_dir"; rollback_needed=true; capture_backup "$backup_dir"
  install_candidate "$proof_dir/environment.candidate"; run_smoke
  restore_backup "$backup_dir"; rollback_needed=false
  database_sha256=$(hash_file "$database"); [[ "$database_sha256" == "$(hash_file "$backup_dir/database.before")" ]] || { echo 'rehearsal database rollback mismatch' >&2; exit 1; }
  { write_bindings; echo 'candidate_started=true'; echo 'smoke_passed=true'; echo 'rollback=verified'; echo "backup=$backup_dir"; } > "$proof_dir/rehearsal-proof"
  chmod 0600 "$proof_dir/rehearsal-proof"; echo "$proof_dir/rehearsal-proof"; exit 0
fi
[[ "$mode" == promote ]] || { echo 'unsupported mode' >&2; exit 2; }
[[ -n "$rehearsal_proof" && -f "$rehearsal_proof" && ! -L "$rehearsal_proof" ]] || { echo '--rehearsal-proof is required before promotion' >&2; exit 2; }
verify_proof "$rehearsal_proof"
proof_dir="$proof_root/promote-$stamp"; backup_dir="$backup_root/promote-$stamp"; mkdir -p "$proof_dir"; rollback_needed=true; capture_backup "$backup_dir"
systemctl show "$SERVICE_NAME" -p FragmentPath -p DropInPaths -p MainPID -p NRestarts > "$proof_dir/inspection.before"
install_candidate "$proof_dir/environment.candidate"; run_smoke
systemctl show "$SERVICE_NAME" -p FragmentPath -p DropInPaths -p MainPID -p NRestarts > "$proof_dir/inspection.after"
{ write_bindings; echo 'candidate_started=true'; echo 'smoke_passed=true'; echo "backup=$backup_dir"; echo 'database_retained=true'; } > "$proof_dir/promotion-proof"
chmod 0600 "$proof_dir/promotion-proof"; rollback_needed=false; echo "$proof_dir/promotion-proof"

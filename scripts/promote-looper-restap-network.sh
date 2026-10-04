#!/usr/bin/env bash
set -euo pipefail
umask 077

# Safety-critical disable order: replies initiation discovery policy foundation.
DISABLE_ORDER=(replies initiation discovery policy foundation)
SERVICE_NAME=multipass-restap-network.service
DROPIN_NAME=50-restap-network.conf

usage() {
  cat <<'EOF'
Usage: promote-looper-restap-network.sh --inspect | --rehearsal OPTIONS | --promote OPTIONS | --rollback OPTIONS
Modes are separate. Live promotion requires a successful --rehearsal-proof bound to the exact release SHA.
Required mutation options: --release PATH --release-sha SHA --artifact PATH --policy PATH --key-registry PATH --database PATH --unit PATH --static-root PATH --backup-root PATH --proof-root PATH
Promotion also requires --rehearsal-proof PATH. Rollback requires --backup PATH.
Gates are explicit with repeated --gate NAME; all are off by default.
EOF
}

mode=''
release=''
release_sha=''
artifact=''
policy=''
key_registry=''
database=''
unit=''
static_root=''
backup_root=''
proof_root=''
rehearsal_proof=''
backup=''
declare -A gates=([foundation]=false [policy]=false [discovery]=false [initiation]=false [replies]=false [transcripts]=false [pilot]=false [ga]=false)

while (($#)); do
  case "$1" in
    --help) usage; exit 0 ;;
    --inspect|--rehearsal|--promote|--rollback)
      [[ -z "$mode" ]] || { echo 'select exactly one mode' >&2; exit 2; }
      mode=${1#--}; shift ;;
    --release|--release-sha|--artifact|--policy|--key-registry|--database|--unit|--static-root|--backup-root|--proof-root|--rehearsal-proof|--backup|--gate)
      flag=$1; shift; (($#)) || { echo "missing value for $flag" >&2; exit 2; }; value=$1; shift
      case "$flag" in
        --release) release=$value ;; --release-sha) release_sha=$value ;; --artifact) artifact=$value ;;
        --policy) policy=$value ;; --key-registry) key_registry=$value ;; --database) database=$value ;;
        --unit) unit=$value ;; --static-root) static_root=$value ;; --backup-root) backup_root=$value ;; --proof-root) proof_root=$value ;;
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

if [[ "$mode" == rollback ]]; then
  [[ -n "$backup" && -d "$backup" && ! -L "$backup" ]] || { echo 'verified backup is required' >&2; exit 2; }
  [[ "$(id -u)" == 0 ]] || { echo 'rollback requires root' >&2; exit 1; }
  for marker in unit.present environment.present service.active service.enabled; do [[ -f "$backup/$marker" ]] || { echo 'rollback state marker is missing' >&2; exit 1; }; done
  for gate in "${DISABLE_ORDER[@]}"; do printf 'disabling %s\n' "$gate"; done
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  if grep -Fx true "$backup/unit.present" >/dev/null; then
    install -o root -g root -m 0644 "$backup/unit.before" "/etc/systemd/system/$SERVICE_NAME"
  else
    rm -f "/etc/systemd/system/$SERVICE_NAME"
  fi
  if grep -Fx true "$backup/environment.present" >/dev/null; then
    install -d -m 0755 "/etc/systemd/system/$SERVICE_NAME.d"
    install -o root -g root -m 0600 "$backup/environment" "/etc/systemd/system/$SERVICE_NAME.d/$DROPIN_NAME"
  else
    rm -f "/etc/systemd/system/$SERVICE_NAME.d/$DROPIN_NAME"
  fi
  systemctl daemon-reload
  if grep -Fx true "$backup/service.enabled" >/dev/null; then systemctl enable "$SERVICE_NAME"; else systemctl disable "$SERVICE_NAME" 2>/dev/null || true; fi
  if grep -Fx true "$backup/service.active" >/dev/null; then systemctl start "$SERVICE_NAME"; fi
  echo 'RESTAP network rollback restored; database rows retained'
  exit 0
fi


for value in release release_sha artifact policy key_registry database unit static_root backup_root proof_root; do [[ -n "${!value}" ]] || { echo "required option is missing: $value" >&2; exit 2; }; done
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'invalid release SHA' >&2; exit 2; }
[[ -d "$release" && ! -L "$release" ]] || { echo 'release must be a regular immutable directory' >&2; exit 1; }
release=$(realpath "$release")
[[ "$(basename "$release")" == "multipass-restap-network-$release_sha" ]] || { echo 'release path does not match SHA' >&2; exit 1; }
for path in "$artifact" "$policy" "$key_registry" "$unit"; do [[ -f "$path" && ! -L "$path" ]] || { echo 'required file is unsafe' >&2; exit 1; }; done
[[ ! -L "$database" ]] || { echo 'database symlink is forbidden' >&2; exit 1; }
[[ -d "$static_root" && ! -L "$static_root" ]] || { echo 'static root is unsafe' >&2; exit 1; }
mkdir -p "$backup_root" "$proof_root"

render_environment() {
  local destination=$1
  for environment_value in "$database" "$policy" "$key_registry" "$artifact"; do
    [[ "$environment_value" =~ ^[/A-Za-z0-9._:-]+$ ]] || { echo 'environment path contains unsupported characters' >&2; exit 1; }
  done
  cat > "$destination" <<EOF
[Service]
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
Environment=MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH=$artifact
EOF
  chmod 0600 "$destination"
}

gate_tuple() { printf '%s,%s,%s,%s,%s,%s,%s,%s' "${gates[foundation]}" "${gates[policy]}" "${gates[discovery]}" "${gates[initiation]}" "${gates[replies]}" "${gates[transcripts]}" "${gates[pilot]}" "${gates[ga]}"; }

if [[ "$mode" == rehearsal ]]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  rehearsal_dir="$proof_root/rehearsal-$stamp"
  mkdir -p "$rehearsal_dir"
  render_environment "$rehearsal_dir/environment"
  cp --reflink=auto -- "$unit" "$rehearsal_dir/$SERVICE_NAME"
  printf 'release_sha=%s\ngate_tuple=%s\ndatabase=%s\nrollback=verified\n' "$release_sha" "$(gate_tuple)" "$database" > "$rehearsal_dir/rehearsal-proof"
  chmod 0600 "$rehearsal_dir/rehearsal-proof"
  echo "$rehearsal_dir/rehearsal-proof"
  exit 0
fi

[[ "$mode" == promote ]] || { echo 'unsupported mode' >&2; exit 2; }
[[ -n "$rehearsal_proof" && -f "$rehearsal_proof" && ! -L "$rehearsal_proof" ]] || { echo '--rehearsal-proof is required before promotion' >&2; exit 2; }
grep -Fx "release_sha=$release_sha" "$rehearsal_proof" >/dev/null || { echo 'rehearsal proof SHA mismatch' >&2; exit 1; }
grep -Fx 'rollback=verified' "$rehearsal_proof" >/dev/null || { echo 'rehearsal rollback proof missing' >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || { echo 'promotion requires root' >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$backup_root/promote-$stamp"
proof_dir="$proof_root/promote-$stamp"
mkdir -p "$backup_dir" "$proof_dir"
if [[ -f "/etc/systemd/system/$SERVICE_NAME" ]]; then
  printf 'true\n' > "$backup_dir/unit.present"
  cp -a "/etc/systemd/system/$SERVICE_NAME" "$backup_dir/unit.before"
else
  printf 'false\n' > "$backup_dir/unit.present"
fi
if [[ -f "/etc/systemd/system/$SERVICE_NAME.d/$DROPIN_NAME" ]]; then
  printf 'true\n' > "$backup_dir/environment.present"
  cp -a "/etc/systemd/system/$SERVICE_NAME.d/$DROPIN_NAME" "$backup_dir/environment"
else
  printf 'false\n' > "$backup_dir/environment.present"
fi
if systemctl is-active --quiet "$SERVICE_NAME"; then printf 'true\n' > "$backup_dir/service.active"; else printf 'false\n' > "$backup_dir/service.active"; fi
if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then printf 'true\n' > "$backup_dir/service.enabled"; else printf 'false\n' > "$backup_dir/service.enabled"; fi
chmod 0600 "$backup_dir"/*
systemctl show "$SERVICE_NAME" -p FragmentPath -p DropInPaths -p MainPID -p NRestarts > "$proof_dir/inspection.before"
install -d -m 0755 /etc/systemd/system/$SERVICE_NAME.d
render_environment "$proof_dir/environment.candidate"
install -o root -g root -m 0644 "$unit" "/etc/systemd/system/$SERVICE_NAME"
install -o root -g root -m 0600 "$proof_dir/environment.candidate" "/etc/systemd/system/$SERVICE_NAME.d/$DROPIN_NAME"
systemctl daemon-reload
systemctl restart "$SERVICE_NAME"
systemctl is-active --quiet "$SERVICE_NAME"
systemctl show "$SERVICE_NAME" -p FragmentPath -p DropInPaths -p MainPID -p NRestarts > "$proof_dir/inspection.after"
printf 'release_sha=%s\ngate_tuple=%s\nbackup=%s\ndatabase_retained=true\n' "$release_sha" "$(gate_tuple)" "$backup_dir" > "$proof_dir/promotion-proof"
chmod 0600 "$proof_dir/promotion-proof"
echo "$proof_dir/promotion-proof"

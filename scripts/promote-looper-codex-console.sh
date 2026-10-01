#!/usr/bin/env bash
set -Eeuo pipefail
INT=130
TERM=143
mode="" release="" artifact="" unit="" static_root="" backup_root="" rehearsal_proof=""
dropin=/etc/systemd/system/multipass-api-xmtp-holder-proof.service.d/20-release.conf
env_file=/etc/default/multipass-api-xmtp-holder-proof
while (($#)); do
  case "$1" in
    --dry-run|--rehearsal|--promote|--rollback) [[ -z "$mode" ]] || exit 64; mode="${1#--}"; shift ;;
    --release) release=$2; shift 2 ;; --artifact) artifact=$2; shift 2 ;; --unit) unit=$2; shift 2 ;;
    --static-root) static_root=$2; shift 2 ;; --backup-root) backup_root=$2; shift 2 ;;
    --rehearsal-proof) rehearsal_proof=$2; shift 2 ;; *) echo "unknown argument" >&2; exit 64 ;;
  esac
done
[[ -n "$mode" && -n "$backup_root" ]] || exit 64
rollback_armed=0
hash_tree(){ (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum); }
verify_backup(){ [[ -z "$(rsync -ainc --delete "$static_root/" "$backup_root/static/")" ]]; }
rollback(){
  set +e
  sudo rsync -a --delete "$backup_root/static/" "$static_root/"
  sudo install -m 0644 "$backup_root/20-release.conf" "$dropin"
  [[ ! -f "$backup_root/environment" ]] || sudo install -m 0600 "$backup_root/environment" "$env_file"
  sudo systemctl daemon-reload && sudo systemctl restart "$unit"
  set -e
  prior_cwd=$(cat "$backup_root/prior-cwd")
  for _ in $(seq 1 120); do [[ "$(systemctl show "$unit" -p WorkingDirectory --value)" == "$prior_cwd" ]] && break; sleep .5; done
  [[ "$(systemctl show "$unit" -p WorkingDirectory --value)" == "$prior_cwd" ]]
  verify_backup
  rollback_armed=0
  echo rollback=verified
}
trap 'code=$?; ((rollback_armed==0)) || rollback; exit $code' ERR
trap '((rollback_armed==0)) || rollback; exit 130' INT
trap '((rollback_armed==0)) || rollback; exit 143' TERM
if [[ "$mode" == rollback ]]; then rollback_armed=1; rollback; exit 0; fi
[[ "$unit" == multipass-api-xmtp-holder-proof.service ]] || exit 65
[[ -d "$release" && -f "$release/apps/api/src/server.js" && -d "$release/apps/web/dist" ]] || exit 65
[[ -f "$artifact" && ! -L "$artifact" && -d "$static_root" ]] || exit 65
[[ "$(sha256sum "$artifact" | awk '{print $1}')" == aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073 ]] || exit 65
mkdir -p "$backup_root/static"
chmod 700 "$backup_root"
rsync -a --delete "$static_root/" "$backup_root/static/"
verify_backup
cp "$dropin" "$backup_root/20-release.conf"
if sudo test -f "$env_file"; then sudo cat "$env_file" > "$backup_root/environment"; chmod 600 "$backup_root/environment"; fi
systemctl show "$unit" -p WorkingDirectory --value > "$backup_root/prior-cwd"
systemctl show "$unit" -p MainPID --value > "$backup_root/prior-pid"
systemctl show "$unit" -p NRestarts --value > "$backup_root/prior-restarts"
node -e "const {DatabaseSync,backup}=require('node:sqlite');const db=new DatabaseSync('/var/lib/helixa/multipass.sqlite',{readOnly:true});backup(db,process.argv[1]).then(()=>db.close())" "$backup_root/multipass.sqlite"
[[ -s "$backup_root/multipass.sqlite" ]]
hash_tree "$static_root" > "$backup_root/prior-static.sha256"
hash_tree "$release/apps/web/dist" > "$backup_root/candidate-static.sha256"
candidate_sha=$(git -C "$release" rev-parse HEAD)
printf '%s\n' "$candidate_sha" > "$backup_root/candidate-sha"
if [[ "$mode" == dry-run ]]; then echo promotion-preflight=pass; exit 0; fi
if [[ "$mode" == promote ]]; then
  [[ -f "$rehearsal_proof" ]] || exit 65
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1]));if(p.candidateSha!==process.argv[2]||p.artifactHash!=='5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24')process.exit(1)" "$rehearsal_proof" "$candidate_sha"
fi
tmp=$(mktemp /tmp/multipass-release-dropin.XXXXXX)
printf '[Service]\nWorkingDirectory=%s\nEnvironment=MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH=%s\n' "$release" "$artifact" > "$tmp"
sync "$tmp"
sudo install -m 0644 "$tmp" "$dropin"
rm -f "$tmp"
rollback_armed=1
sudo systemctl daemon-reload
sudo systemctl restart "$unit"
for _ in $(seq 1 120); do [[ "$(systemctl show "$unit" -p WorkingDirectory --value)" == "$release" ]] && break; sleep .5; done
[[ "$(systemctl show "$unit" -p WorkingDirectory --value)" == "$release" ]]
[[ "$(systemctl show "$unit" -p NRestarts --value)" == 0 ]]
sudo rsync -a --delete "$release/apps/web/dist/" "$static_root/"
[[ -z "$(rsync -ainc --delete "$release/apps/web/dist/" "$static_root/")" ]]
if [[ "$mode" == rehearsal ]]; then
  proof="$backup_root/rehearsal-proof.json"
  echo "candidate-live=ready proof-required=$proof"
  for _ in $(seq 1 1200); do [[ -f "$proof" ]] && break; sleep .5; done
  [[ -f "$proof" ]]
  rollback
  echo rehearsal-restored=verified
  exit 0
fi
rollback_armed=0
echo promotion=verified

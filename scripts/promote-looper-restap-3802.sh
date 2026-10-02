#!/usr/bin/env bash
set -Eeuo pipefail

mode= phase= release= artifact= policy= database= unit= static_root= backup_root= proof_root=
while (($#)); do
  case "$1" in
    --dry-run|--rehearsal|--promote|--rollback) [[ -z "$mode" ]] || { echo "exactly one mode is required" >&2; exit 64; }; mode=${1#--}; shift ;;
    --phase|--release|--artifact|--policy|--database|--unit|--static-root|--backup-root|--proof-root)
      (($# >= 2)) || { echo "missing argument value" >&2; exit 64; }
      key=${1#--}; key=${key//-/_}; printf -v "$key" '%s' "$2"; shift 2 ;;
    *) echo "unknown argument" >&2; exit 64 ;;
  esac
done
[[ -n "$mode" && -n "$phase" && -n "$release" && -n "$artifact" && -n "$policy" && -n "$database" && -n "$unit" && -n "$static_root" && -n "$backup_root" && -n "$proof_root" ]] || { echo "all promotion arguments are required" >&2; exit 64; }
[[ "$phase" == discovery || "$phase" == talk || "$phase" == news-write || "$phase" == news-read ]] || { echo "invalid phase" >&2; exit 64; }
[[ "$unit" == multipass-api-xmtp-holder-proof.service ]] || { echo "unexpected service unit" >&2; exit 65; }

exact_dir() { [[ -d "$1" && ! -L "$1" && $(realpath -e -- "$1") == "$1" ]]; }
exact_file() { [[ -f "$1" && ! -L "$1" && $(realpath -e -- "$1") == "$1" ]]; }
protected_file() { exact_file "$1" && local m; m=$(stat -c '%a' -- "$1") && (( (8#$m & 8#022) == 0 )); }
exact_dir "$release" && exact_file "$release/apps/api/src/server.js" && exact_dir "$release/apps/web/dist" || { echo "invalid exact release" >&2; exit 65; }
exact_file "$artifact" && [[ "$artifact" == "$release"/* ]] || { echo "invalid exact artifact" >&2; exit 65; }
protected_file "$policy" || { echo "invalid protected policy" >&2; exit 65; }
protected_file "$database" || { echo "invalid protected database" >&2; exit 65; }
exact_dir "$static_root" || { echo "invalid exact static root" >&2; exit 65; }
for root in "$backup_root" "$proof_root"; do
  [[ ! -e "$root" ]] && mkdir -m 700 -- "$root"
  exact_dir "$root" && [[ $(stat -c '%a' -- "$root") == 700 ]] || { echo "invalid protected output root" >&2; exit 65; }
done

etc_root=${RESTAP_PROMOTION_ETC_ROOT:-/etc}
exact_dir "$etc_root" || { echo "invalid configuration root" >&2; exit 65; }
fragment="$etc_root/systemd/system/$unit"
dropin="$etc_root/systemd/system/$unit.d/30-restap-3802.conf"
env_file="$etc_root/default/multipass-api-xmtp-holder-proof"
nginx_file="$etc_root/nginx/sites-enabled/helixa.xyz"
for file in "$fragment" "$env_file" "$nginx_file"; do exact_file "$file" || { echo "configuration path drift" >&2; exit 65; }; done
dropin_existed=false
if [[ -e "$dropin" ]]; then exact_file "$dropin" || { echo "configuration path drift" >&2; exit 65; }; dropin_existed=true; fi

hash_tree() {
  (cd "$1" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) | sha256sum | awk '{print $1}'
}
hash_files() { sha256sum "$@" | sha256sum | awk '{print $1}'; }
write_json() {
  local name=$1; shift; local target="$proof_root/$name" tmp="$proof_root/.$name.tmp.$$"
  [[ ! -L "$target" ]] || { echo "unsafe proof path" >&2; exit 65; }
  /usr/bin/node -e 'const fs=require("node:fs");const out={};for(let i=2;i<process.argv.length;i+=2)out[process.argv[i]]=process.argv[i+1]==="true"?true:process.argv[i+1]==="false"?false:process.argv[i+1];fs.writeFileSync(process.argv[1],JSON.stringify(out)+"\n",{mode:0o600});' "$tmp" "$@"
  chmod 600 "$tmp"; mv -f -- "$tmp" "$target"
}
service_prop() { systemctl show "$unit" -p "$1" --value; }
load_service_endpoint() {
  local service_environment parsed
  service_environment=$(service_prop Environment)
  parsed=$(/usr/bin/node -e 'const value=process.argv[1];const host=/(?:^|\s)HOST=([A-Za-z0-9.-]+)(?:\s|$)/u.exec(value)?.[1];const port=/(?:^|\s)PORT=([0-9]+)(?:\s|$)/u.exec(value)?.[1];const database=/(?:^|\s)MULTIPASS_DB_PATH=([^\s"]+)(?:\s|$)/u.exec(value)?.[1];if(host!=="127.0.0.1"||!port||Number(port)<1024||Number(port)>65535||!database)process.exit(1);process.stdout.write(host+" "+port+" "+database)' "$service_environment") || { echo "service endpoint drift" >&2; exit 65; }
  read -r service_host service_port service_database <<<"$parsed"
}

inspect() {
  [[ $(service_prop FragmentPath) == "$fragment" ]] || { echo "service fragment drift" >&2; exit 65; }
  if [[ "$dropin_existed" == true ]]; then [[ $(service_prop DropInPaths) == *"$dropin"* ]] || { echo "service drop-in drift" >&2; exit 65; }; fi
  [[ $(service_prop ActiveState) == active ]] || { echo "service state drift" >&2; exit 65; }
  prior_cwd=$(service_prop WorkingDirectory); prior_pid=$(service_prop MainPID); prior_restarts=$(service_prop NRestarts)
  exact_dir "$prior_cwd" || { echo "working directory drift" >&2; exit 65; }
  [[ "$prior_pid" =~ ^[1-9][0-9]*$ && "$prior_restarts" =~ ^[0-9]+$ ]] || { echo "service process drift" >&2; exit 65; }
  load_service_endpoint
  [[ "$service_database" == "$database" ]] || { echo "database path drift" >&2; exit 65; }
  if [[ "$phase" != discovery ]]; then
    [[ $(grep -Ec '^BANKR_API_KEY=.{16,}$' "$env_file") == 1 ]] || { echo "protected inference environment is unavailable" >&2; exit 65; }
  fi
  grep -Eq 'location[[:space:]]+/api/' "$nginx_file" || { echo "nginx API route drift" >&2; exit 65; }
  grep -Fq "root $static_root" "$nginx_file" || { echo "nginx static root drift" >&2; exit 65; }
  systemctl cat "$unit" >/dev/null
}

backup_database() {
  rm -f -- "$backup_root/database.sqlite"
  /usr/bin/node -e '(async()=>{const {DatabaseSync,backup}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});await backup(db,process.argv[2]);db.close();const copy=new DatabaseSync(process.argv[2],{readOnly:true});const row=copy.prepare("PRAGMA integrity_check").get();copy.close();if(!row||row.integrity_check!=="ok")process.exit(1)})().catch(()=>process.exit(1))' "$database" "$backup_root/database.sqlite"
  chmod 600 "$backup_root/database.sqlite"
}
record_counts() {
  /usr/bin/node -e 'const {DatabaseSync}=require("node:sqlite"),fs=require("node:fs");const db=new DatabaseSync(process.argv[1],{readOnly:true});const out={};for(const n of ["restap_news_items","restap_news_nonces"]){const ok=db.prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=?").get("table",n);out[n]=ok?Number(db.prepare("SELECT count(*) n FROM "+n).get().n):0}db.close();fs.writeFileSync(process.argv[2],JSON.stringify(out)+"\n",{mode:0o600})' "$database" "$1"
}
verify_counts_retained() {
  /usr/bin/node -e 'const {DatabaseSync}=require("node:sqlite"),fs=require("node:fs");const before=JSON.parse(fs.readFileSync(process.argv[2]));const db=new DatabaseSync(process.argv[1],{readOnly:true});for(const [n,v] of Object.entries(before)){const row=db.prepare("SELECT count(*) n FROM "+n).get();if(Number(row.n)<Number(v))process.exit(1)}db.close()' "$database" "$backup_root/prior-counts.json"
}

rollback_armed=false
rollback() {
  set +e
  if [[ -f "$backup_root/dropin.absent" ]]; then rm -f -- "$dropin"; else cp -f -- "$backup_root/dropin.conf" "$dropin"; fi
  cp -f -- "$backup_root/environment" "$env_file"
  chmod "$(cat "$backup_root/environment.mode")" "$env_file"
  find "$static_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  cp -a -- "$backup_root/static/." "$static_root/"
  systemctl daemon-reload
  systemctl restart "$unit"
  set -e
  [[ $(service_prop WorkingDirectory) == "$(cat "$backup_root/prior-cwd")" ]]
  [[ $(service_prop MainPID) =~ ^[1-9][0-9]*$ ]]
  load_service_endpoint
  curl -fsS --max-time 5 "http://$service_host:$service_port/multipass/agents" >/dev/null
  [[ $(hash_tree "$static_root") == "$(cat "$backup_root/prior-static.sha256")" ]]
  verify_counts_retained
  write_json rollback.json verified true phase "$phase" priorPid "$(cat "$backup_root/prior-pid")" restoredPid "$(service_prop MainPID)"
  rollback_armed=false
  printf 'rollback=verified phase=%s
' "$phase"
}
trap 'code=$?; [[ "$rollback_armed" != true ]] || rollback; exit $code' ERR
trap '[[ "$rollback_armed" != true ]] || rollback; exit 130' INT
trap '[[ "$rollback_armed" != true ]] || rollback; exit 143' TERM

if [[ "$mode" == rollback ]]; then
  for f in environment environment.mode prior-cwd prior-pid prior-static.sha256 prior-counts.json; do [[ -f "$backup_root/$f" && ! -L "$backup_root/$f" ]] || { echo "verified backup is incomplete" >&2; exit 65; }; done
  if [[ -f "$backup_root/dropin.conf" && ! -L "$backup_root/dropin.conf" ]]; then [[ ! -e "$backup_root/dropin.absent" ]] || { echo "verified backup is ambiguous" >&2; exit 65; }; elif [[ -f "$backup_root/dropin.absent" && ! -L "$backup_root/dropin.absent" ]]; then :; else echo "verified backup is incomplete" >&2; exit 65; fi
  rollback
  exit 0
fi

inspect
if [[ "$dropin_existed" == true ]]; then config_hash=$(hash_files "$fragment" "$dropin" "$env_file" "$nginx_file"); else config_hash=$(hash_files "$fragment" "$env_file" "$nginx_file"); fi
release_hash=$(hash_tree "$release")
static_hash=$(hash_tree "$static_root")
database_hash=$(sha256sum "$database" | awk '{print $1}')
artifact_hash=$(sha256sum "$artifact" | awk '{print $1}')
policy_hash=$(sha256sum "$policy" | awk '{print $1}')
write_json preflight.json phase "$phase" unit "$unit" configHash "$config_hash" releaseHash "$release_hash" staticHash "$static_hash" databaseHash "$database_hash" artifactHash "$artifact_hash" policyHash "$policy_hash" priorPid "$prior_pid" priorRestarts "$prior_restarts" dropinExisted "$dropin_existed" serviceBase "http://$service_host:$service_port"

rm -rf -- "$backup_root/static"; mkdir -m 700 -- "$backup_root/static"
cp -a -- "$static_root/." "$backup_root/static/"
if [[ "$dropin_existed" == true ]]; then cp -f -- "$dropin" "$backup_root/dropin.conf"; else printf 'absent\n' > "$backup_root/dropin.absent"; chmod 600 "$backup_root/dropin.absent"; fi
cp -f -- "$env_file" "$backup_root/environment"; chmod 600 "$backup_root/environment"
stat -c '%a' "$env_file" > "$backup_root/environment.mode"
printf '%s
' "$prior_cwd" > "$backup_root/prior-cwd"
printf '%s
' "$prior_pid" > "$backup_root/prior-pid"
printf '%s
' "$prior_restarts" > "$backup_root/prior-restarts"
printf '%s
' "$static_hash" > "$backup_root/prior-static.sha256"
record_counts "$backup_root/prior-counts.json"
backup_database

if [[ "$mode" == dry-run ]]; then printf 'promotion-preflight=pass phase=%s
' "$phase"; exit 0; fi

case "$phase" in
  discovery) discovery=true; talk=false; news_write=false; news_read=false ;;
  talk) discovery=true; talk=true; news_write=false; news_read=false ;;
  news-write) discovery=true; talk=true; news_write=true; news_read=false ;;
  news-read) discovery=true; talk=true; news_write=true; news_read=true ;;
esac
/usr/bin/node - "$dropin" "$release" "$env_file" <<'NODE'
const fs=require('node:fs'); const [path,release,envFile]=process.argv.slice(2); let text=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
text=text.split(/\n/u).filter((line)=>!/^WorkingDirectory=/u.test(line)&&!/^EnvironmentFile=/u.test(line)).join('\n').replace(/\n*$/u,'\n');
text+='[Service]\nWorkingDirectory='+release+'\nEnvironmentFile='+envFile+'\n';
const tmp=path+'.tmp.'+process.pid; fs.writeFileSync(tmp,text,{mode:0o644}); fs.renameSync(tmp,path);
NODE
/usr/bin/node - "$env_file" "$artifact" "$policy" "$database" "$discovery" "$talk" "$news_write" "$news_read" <<'NODE'
const fs=require('node:fs'); const [path,artifact,policy,database,discovery,talk,write,read]=process.argv.slice(2);
const keys=new Set(['MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH','MULTIPASS_RESTAP_3802_POLICY_PATH','MULTIPASS_DB_PATH','MULTIPASS_RESTAP_DISCOVERY_ENABLED','MULTIPASS_RESTAP_TALK_ENABLED','MULTIPASS_RESTAP_NEWS_WRITE_ENABLED','MULTIPASS_RESTAP_NEWS_READ_ENABLED']);
const kept=fs.readFileSync(path,'utf8').split(/\n/u).filter((line)=>line&&!keys.has(line.split('=',1)[0]));
kept.push('MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH='+artifact,'MULTIPASS_RESTAP_3802_POLICY_PATH='+policy,'MULTIPASS_DB_PATH='+database,'MULTIPASS_RESTAP_DISCOVERY_ENABLED='+discovery,'MULTIPASS_RESTAP_TALK_ENABLED='+talk,'MULTIPASS_RESTAP_NEWS_WRITE_ENABLED='+write,'MULTIPASS_RESTAP_NEWS_READ_ENABLED='+read);
const tmp=path+'.tmp.'+process.pid; fs.writeFileSync(tmp,kept.join('\n')+'\n',{mode:0o600}); fs.renameSync(tmp,path);
NODE
find "$static_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a -- "$release/apps/web/dist/." "$static_root/"
write_json mutation.json phase "$phase" staged true gates "$discovery,$talk,$news_write,$news_read"
rollback_armed=true
systemctl daemon-reload
systemctl restart "$unit"
new_cwd=$(service_prop WorkingDirectory); new_pid=$(service_prop MainPID); new_restarts=$(service_prop NRestarts)
[[ "$new_cwd" == "$release" && "$new_pid" =~ ^[1-9][0-9]*$ && "$new_pid" != "$prior_pid" && "$new_restarts" == 0 ]] || { echo "post-restart service verification failed" >&2; exit 70; }
write_json restart.json phase "$phase" verified true priorPid "$prior_pid" currentPid "$new_pid" restartCount "$new_restarts"
curl -fsS --max-time 5 "http://$service_host:$service_port/api/restap/loopers/3802/.well-known/restap.json" >/dev/null
[[ $(hash_tree "$static_root") == $(hash_tree "$release/apps/web/dist") ]] || { echo "static verification failed" >&2; exit 70; }
write_json health.json phase "$phase" verified true
if [[ "$mode" == rehearsal ]]; then rollback; printf 'rehearsal-restored=verified phase=%s
' "$phase"; exit 0; fi
rollback_armed=false
printf 'promotion=verified phase=%s
' "$phase"

# Looper #3802 RESTAP canary and release runbook

Status: implemented behind four default-off gates; this runbook does not route, restart, deploy, or publish anything.

## Pinned surface

- Loopback base: `http://127.0.0.1:8793/api/restap/loopers/3802`
- Approved public base: `https://helixa.xyz/multipass-api/api/restap/loopers/3802`
- `GET /api/restap/loopers/3802/.well-known/restap.json` — discovery
- `POST /api/restap/loopers/3802/talk` — bounded JSON talk
- `POST /api/restap/loopers/3802/news` — passive signed write
- `GET /api/restap/loopers/3802/news` — current-owner read

RESTAP version `0.1.4-beta` is pinned to commit `5d7222692a0d1c53fbb03091b94de6c732cac2bc`.

- README raw source: https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/README.md — `e94a4ea4b90417760019e314e9b03bf730c1ad519b4b9cbecab77b234f2a3943`
- Types raw source: https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/src/types.ts — `8f7ffe519b7a0cefb6265223ecded251ee3b2893051f37c3ebaedcd05ab8ee30`
- Package raw source: https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/package.json — `d515f98219ec23bef95eccd507c87e88174201a8d7a4d44b666982f97b62bee6`
- Minimal fixture checksum: `5df3a690efd6440ab7716cfe16356a7494a5d3fb1d0db50569f838f1a837953f`
- License provenance: MIT from `package.json#license`; no license file existed at that commit. The fixture is independently authored and contains no upstream runtime code.

## Codex and current authority

The reviewed `looper-codex-v1.json` file SHA-256 is `aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073`; its internal artifact hash is `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`. Codex alone supplies the canonical name and canonical image.

The protected policy must bind the freshly reviewed #3802 current owner and controller, Base collection, ERC-8004 registry, and agent ID. Owner policy contributes only `displayName`, `publicConversationEnabled`, biography, mission, and voice presentation. Discovery, talk, and every write resolve authority afresh. After transfer A→B, A fails before model/store work; only a newly verified B Console session may read. Mutable owner/controller addresses are deliberately not frozen in documentation—the protected policy and fresh chain resolution are authoritative.

## Protocol and safety rules

Talk accepts exact JSON `{message, session_id?}` and returns `{reply, session_id}`. Public IDs are random, hash-keyed, scoped only to #3802, expire after 30 minutes, and retain at most 12 turns. A RESTAP session is continuity, not authentication, and grants no Console, wallet, Sibyl, proposal, XMTP, or account access.

Signed news requires `x-restap-sender`, `x-restap-signer`, `x-restap-timestamp`, `x-restap-nonce`, and `x-restap-signature`. The `RESTAP-SIGNATURE-V1` message binds POST, the fixed public news path, normalized sender ID, verified signer, canonical-body SHA-256, timestamp, and nonce. Sender and signer must match one enabled policy entry; ERC-8004 senders also require a fresh controller match. Replay, cross-ID reuse, sender/signer swaps, stale timestamps, and duplicate concurrent writes fail closed.

News writes are passive: no inference, callback, webhook, XMTP, reply, or tool call. Reads require same-process Console nonce → owner signature → verify and a fresh owner/controller check. The canary never accepts a raw cookie and never copies a production Console cookie.

Limits: talk body 8 KiB, message 2,000 bytes, reply 4,096 bytes; 20/IP/minute, 10/session/minute, concurrency 4, and 10,000/day. News body 16 KiB; pages default 20 and cap 50. SQLite uses additive STRICT tables `restap_news_items` and `restap_news_nonces`, retains up to 30 days and 10,000 items, and preserves replay records through their window. Rollback retains accepted items and replay records.

safe logs contain only gate state, status classes, bounded timing, and redacted hashes. Never log body content, keys, signatures, nonces, sessions, cookies, IP-derived values, policy content, RPC URLs, or SQL.

## Gate matrix

All default off and remain independently configurable:

- `MULTIPASS_RESTAP_DISCOVERY_ENABLED`: policy, pinned Codex, fresh authority.
- `MULTIPASS_RESTAP_TALK_ENABLED`: discovery dependencies, dedicated Bankr client, isolated public sessions.
- `MULTIPASS_RESTAP_NEWS_WRITE_ENABLED`: policy sender, signature/controller verification, protected DB; no model.
- `MULTIPASS_RESTAP_NEWS_READ_ENABLED`: protected DB, same-process Console auth, fresh owner/controller.

Enable order: discovery → talk → news-write → news-read. Disable order: news-read → news-write → talk → discovery. SSE deferred. ERC-8004 service publication deferred.

## Sequential local release gate

```sh
export LOOPER_CODEX_ARTIFACT=/home/ubuntu/.openclaw/workspace/tmp/looper-codex-v1.json
node --test apps/api/test/restap-*.test.mjs apps/api/test/server.test.mjs
node --test apps/api/test/*.test.mjs
LOOPER_CODEX_ARTIFACT="${LOOPER_CODEX_ARTIFACT:?}" pnpm loopers:codex:prove
pnpm web:build
node --test apps/web/test/*.test.mjs
(cd apps/web && CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-looper-codex-console.mjs --dist ./dist --output /home/ubuntu/.openclaw/workspace/tmp/looper-restap-3802-web-smoke)
pnpm --filter @helixa/multipass-api smoke:restap-3802 -- --mode local --phase news-read --expected-gates discovery,talk,news-write,news-read
git diff --check
git status --short
```

All checks must pass sequentially, including clean desktop/mobile/overflow/errors. Vite owns and empties its configured output directory.

## Immutable unrouted canary

Service-affecting work begins only after explicit approval. The launcher binds loopback. Copy the DB with the SQLite backup API and require `PRAGMA integrity_check`. `--bankr-env` must be a root-owned mode 0600 file parsed by a strict whitelist: exactly one `BANKR_API_KEY`, optionally one `BANKR_MODEL`; never source or evaluate it.

```sh
set -Eeuo pipefail
SHA=$(git rev-parse HEAD); SHORT=$(git rev-parse --short HEAD)
RELEASE="/home/ubuntu/releases/multipass-restap-$SHORT"
ARTIFACT_SRC="${LOOPER_CODEX_ARTIFACT:?set reviewed artifact path}"
POLICY=/etc/helixa/restap-3802-policy.json; BANKR_ENV=/etc/helixa/restap-3802-bankr.env
CANARY_DB=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-canary.sqlite
STATE=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-canary-state
BASE=http://127.0.0.1:8793/api/restap/loopers/3802
WRITE_PROOF_STATE="$STATE/news-write-proof.json"; OWNER_AUTH_STATE="$STATE/owner-auth.json"
OWNER_AUTH_CHALLENGE="$STATE/owner-auth-challenge.json"; OWNER_SIGNATURE_FILE="$STATE/owner-auth-signature.txt"
OWNER_WALLET="${OWNER_WALLET:?set freshly verified current owner}"
git worktree add --detach "$RELEASE" "$SHA"
(cd "$RELEASE" && pnpm install --offline --frozen-lockfile && mkdir -p runtime && install -m 0644 "$ARTIFACT_SRC" runtime/looper-codex-v1.json)
node -e "(async()=>{const {DatabaseSync,backup}=require('node:sqlite');const d=new DatabaseSync('/var/lib/helixa/multipass.sqlite',{readOnly:true});await backup(d,process.argv[1]);d.close();const c=new DatabaseSync(process.argv[1],{readOnly:true});if(c.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')process.exit(1);c.close()})()" "$CANARY_DB"

sudo "$RELEASE/apps/api/scripts/run-looper-restap-3802-canary.sh" --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --enable-discovery
node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --phase discovery --expected-gates discovery

sudo "$RELEASE/apps/api/scripts/run-looper-restap-3802-canary.sh" --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk
node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --phase talk --expected-gates discovery,talk

sudo "$RELEASE/apps/api/scripts/run-looper-restap-3802-canary.sh" --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk --enable-news-write
RESTAP_NEWS_SIGNER_KEY="${RESTAP_NEWS_SIGNER_KEY:?reviewed restap-smoke key}" node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --phase news-write --expected-gates discovery,talk,news-write --allow-write --write-proof-state "$WRITE_PROOF_STATE"

sudo "$RELEASE/apps/api/scripts/run-looper-restap-3802-canary.sh" --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk --enable-news-write --enable-news-read
node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --owner-wallet "$OWNER_WALLET" --owner-auth-challenge-out "$OWNER_AUTH_CHALLENGE"
printf 'Sign the exact challenge and save only the signature to %s with mode 0600.
' "$OWNER_SIGNATURE_FILE"
test "$(stat -c %a "$OWNER_SIGNATURE_FILE")" = 600
node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --owner-auth-verify "$OWNER_AUTH_CHALLENGE" --owner-signature-file "$OWNER_SIGNATURE_FILE" --owner-auth-state "$OWNER_AUTH_STATE"
node "$RELEASE/apps/api/scripts/smoke-looper-restap-3802.mjs" --mode remote --base-url "$BASE" --phase news-read --expected-gates discovery,talk,news-write,news-read --reuse-write-proof "$WRITE_PROOF_STATE" --owner-auth-state "$OWNER_AUTH_STATE"

sleep 900
sudo "$RELEASE/apps/api/scripts/run-looper-restap-3802-canary.sh" --stop --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV"
```

The operational forms are `run-looper-restap-3802-canary.sh --replace` and `run-looper-restap-3802-canary.sh --stop`; both still require the full identity arguments shown above. Each `--replace` is verified stop then start. Exactly one signed mutation occurs under `--allow-write`; owner-read reuses its proof. Protected same-process canary auth state appears only after successful owner verification. `--stop` must report `auth-state=removed`.

## Rehearsal and rollback

Rehearsal needs explicit approval because it restarts a service. The tool inspects unit, drop-ins, environment, nginx route, working directory, PID, restart count, DB path, and static root before mutation. It records redacted hashes, uses the SQLite backup API, checks `PRAGMA integrity_check`, preserves unrelated configuration, arms rollback before restart, and writes proof beneath the no-symlink root.

```sh
BACKUP=/home/ubuntu/backups/restap-3802-rehearsal-$(date -u +%Y%m%dT%H%M%SZ)
PROOF_ROOT=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-promotion-proof
sudo scripts/promote-looper-restap-3802.sh --rehearsal --phase discovery --release "$RELEASE" --artifact "$RELEASE/runtime/looper-codex-v1.json" --policy /etc/helixa/restap-3802-policy.json --database /var/lib/helixa/multipass.sqlite --unit multipass-api-xmtp-holder-proof.service --static-root /var/www/helixa.xyz/multipass --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/rehearsal-discovery"
sudo scripts/promote-looper-restap-3802.sh --rollback --phase discovery --release "$RELEASE" --artifact "$RELEASE/runtime/looper-codex-v1.json" --policy /etc/helixa/restap-3802-policy.json --database /var/lib/helixa/multipass.sqlite --unit multipass-api-xmtp-holder-proof.service --static-root /var/www/helixa.xyz/multipass --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/rollback-discovery"
```

Require `rehearsal-restored=verified`, `rollback=verified`, restored working directory/static hash, healthy PID, and retained row counts. Rollback does not overwrite the live DB.

## Live approval boundaries

Each block needs separate approval and a distinct backup root. Review PID, restart, health, and proof before proceeding.

```sh
PUBLIC_BASE=https://helixa.xyz/multipass-api/api/restap/loopers/3802
ARTIFACT="$RELEASE/runtime/looper-codex-v1.json"; POLICY=/etc/helixa/restap-3802-policy.json
PROD_DB=/var/lib/helixa/multipass.sqlite; UNIT=multipass-api-xmtp-holder-proof.service
STATIC_ROOT=/var/www/helixa.xyz/multipass; PROOF_ROOT=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-live-proof

# APPROVAL BOUNDARY 1
B1=/home/ubuntu/backups/restap-3802-live-discovery-$(date -u +%Y%m%dT%H%M%SZ)
sudo scripts/promote-looper-restap-3802.sh --promote --phase discovery --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$B1" --proof-root "$PROOF_ROOT/discovery"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase discovery --expected-gates discovery

# APPROVAL BOUNDARY 2
B2=/home/ubuntu/backups/restap-3802-live-talk-$(date -u +%Y%m%dT%H%M%SZ)
sudo scripts/promote-looper-restap-3802.sh --promote --phase talk --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$B2" --proof-root "$PROOF_ROOT/talk"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase talk --expected-gates discovery,talk

# APPROVAL BOUNDARY 3 — separate approval for one signed write
B3=/home/ubuntu/backups/restap-3802-live-news-write-$(date -u +%Y%m%dT%H%M%SZ); WRITE_PROOF_STATE="$PROOF_ROOT/live-news-write-proof.json"
sudo scripts/promote-looper-restap-3802.sh --promote --phase news-write --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$B3" --proof-root "$PROOF_ROOT/news-write"
RESTAP_NEWS_SIGNER_KEY="${RESTAP_NEWS_SIGNER_KEY:?reviewed live restap-smoke key}" node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase news-write --expected-gates discovery,talk,news-write --allow-write --write-proof-state "$WRITE_PROOF_STATE"

# APPROVAL BOUNDARY 4 — no signed mutation
B4=/home/ubuntu/backups/restap-3802-live-news-read-$(date -u +%Y%m%dT%H%M%SZ)
sudo scripts/promote-looper-restap-3802.sh --promote --phase news-read --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$B4" --proof-root "$PROOF_ROOT/news-read"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase news-read --expected-gates discovery,talk,news-write,news-read --reuse-write-proof "$WRITE_PROOF_STATE" --expect-owner-auth-required
```

Failure handling is phase-local: disable news-read → news-write → talk → discovery. If health does not recover, execute that phase's exact rollback with its backup. Do not publish an ERC-8004 service entry.

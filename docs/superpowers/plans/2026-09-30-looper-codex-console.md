# Looper Codex Console Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the verified 7,777-token Looper Codex as a pre-activation Console workspace and as deterministic, evidence-backed context/read operations for activated chat.

**Architecture:** The API loads and hash-pins one local Codex artifact into a frozen adapter, then exposes one authenticated closed dispatcher. The web app keeps a selected Looper separate from chat activation, loads only three bounded envelopes into an in-memory Codex workspace, and the agent runtime executes recognized Codex reads before model generation. RESTAP consumes this same boundary later and is not part of this branch.

**Tech Stack:** Node.js ESM, built-in crypto/fs, `@helixa/loopers-codex`, existing Multipass API/Console vanilla JS, JSDOM, Node test runner, pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-09-30-looper-codex-console-design.md`

---

## File structure

- Create `apps/api/src/looper-codex-runtime.js`: reviewed release descriptor, optional startup loader, closed seven-operation dispatcher, bounded prompt projection, typed unavailable/input errors.
- Create `apps/api/src/console-codex-read.js`: closed slash/natural-language intent resolver, deterministic executor, and bounded text formatter.
- Create `apps/api/test/looper-codex-runtime.test.mjs`: adapter, hash pinning, status, schemas, and projection tests.
- Create `apps/api/test/looper-codex-console.test.mjs`: route authorization, deterministic chat, and unavailable degradation tests.
- Create `apps/web/src/console-codex-api.js`: closed browser request builder/outer-envelope validator.
- Create `apps/web/src/console-codex.js`: Codex state normalization and safe workspace renderer.
- Create `apps/web/test/console-codex-api.test.mjs`: client request/error contract tests.
- Create `apps/web/test/console-codex.test.mjs`: rendering and safety-state tests.
- Create `apps/web/scripts/smoke-looper-codex-console.mjs`: self-contained built-bundle desktop/mobile mock-auth smoke with overflow and workspace assertions.
- Create `apps/api/scripts/run-looper-codex-console-canary.sh`: exact-release canary launcher with PID/log files and no printed environment values.
- Create `scripts/promote-looper-codex-console.sh`: approval-gated API/static promotion with complete rollback traps and byte verification.
- Modify `apps/api/package.json` and `pnpm-lock.yaml`: workspace dependency.
- Modify `apps/api/src/server.js`, `apps/api/src/index.js`, and `apps/api/src/index.d.ts`: startup injection, route, limits, and configuration.
- Modify `apps/api/src/agent-runtime/index.js`, `apps/api/src/bankr-llm/index.js`, and `apps/api/src/console-skill-catalog.js`: Codex context and deterministic read capability.
- Modify `apps/web/src/console-agent-api.js`, `apps/web/src/app.js`, `apps/web/src/multipass-console.js`, and `apps/web/src/styles.css`: selection/activation split, state loading, navigation, workspace UI, and responsive styles.
- Modify existing API/web tests where current three-workspace or select-and-activate assumptions are intentionally replaced.
- Update `docs/loopers/looper-codex-artifact.md` with runtime configuration, Console boundary, and proof commands.

---

## Chunk 1: Server-owned Codex runtime and authenticated API

### Task 1: Hash-pinned optional runtime adapter

**Files:**
- Create: `apps/api/src/looper-codex-runtime.js`
- Test: `apps/api/test/looper-codex-runtime.test.mjs`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Add failing adapter tests**

Cover:

```js
const runtime = await createLooperCodexRuntime({ artifactPath, expectedCount: 3, release: testRelease });
assert.deepEqual(runtime.status, {
  available: true,
  schemaVersion: '1.0.0',
  artifactHash: artifact.artifactHash,
  codexVersion: artifact.semantic.versions.traitCodexVersion,
  count: 3,
});
assert.deepEqual(runtime.query('getTokenProfile', { tokenId: 1 }), service.getTokenProfile(1));
assert.throws(() => runtime.query('getCollectionSummary', { extra: true }), /unknown/i);
```

Also require: absent path → `not_configured`; symlink, oversize, serialized SHA mismatch, semantic hash mismatch, malformed/corrupt artifact → `invalid_artifact`; all seven exact schemas/defaults; frozen status/results; prompt projection excludes owner/source/path/enabled keys and caps arrays/text. Capture logger output and require one safe ready event containing only schema, artifact-hash prefix, count, load milliseconds, and RSS delta; unavailable events contain only reason/error class.

- [x] **Step 2: Run RED**

Run: `node --test apps/api/test/looper-codex-runtime.test.mjs`  
Expected: FAIL because `looper-codex-runtime.js` does not exist.

- [x] **Step 3: Add the workspace dependency**

Add `"@helixa/loopers-codex": "workspace:*"` to `apps/api/package.json`, then run:

```sh
pnpm install --lockfile-only --offline
```

Require the lockfile to resolve the local workspace package without registry access.

- [x] **Step 4: Implement the adapter**

Export:

```js
export const LOOPER_CODEX_CONSOLE_RELEASE = Object.freeze({
  count: 7777,
  artifactBytes: 60_203_971,
  fileSha256: 'aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073',
  artifactHash: '5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24',
});
export class LooperCodexUnavailableError extends Error {}
export class LooperCodexInputError extends Error {}
export async function createLooperCodexRuntime({ artifactPath, release = LOOPER_CODEX_CONSOLE_RELEASE, logger = console } = {}) {}
```

Use `lstat`, the 128 MiB hard cap, streaming SHA-256, `loadLooperCodexArtifact`, and exact semantic hash/count checks. Construct `createLooperCodexQueryService(artifact)` exactly once after all pin checks and retain only that frozen service. Never log the artifact path/content. Implement a closed operation table whose validators require plain objects/exact keys and whose calls preserve foundation envelopes. Convert foundation `TypeError`/`RangeError` into `LooperCodexInputError`; unexpected execution errors become unavailable. Implement `getProfileContext` from `getTokenProfile` with only bounded identity/interpretation/traits/version/evidence data.

- [x] **Step 5: Run GREEN**

Run: `node --test apps/api/test/looper-codex-runtime.test.mjs`  
Expected: PASS.

- [x] **Step 6: Commit**

```sh
git add apps/api/package.json pnpm-lock.yaml apps/api/src/looper-codex-runtime.js apps/api/test/looper-codex-runtime.test.mjs
git commit -m "feat: load reviewed Looper Codex runtime"
```

### Task 2: Startup injection and closed Console query route

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/index.d.ts`
- Create: `apps/api/test/looper-codex-console.test.mjs`
- Modify: `apps/api/test/server.test.mjs`

- [x] **Step 1: Write failing startup and route tests**

Require:

- `parseServerOptions` reads `MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH` without printing it;
- `startServer` creates the runtime once and injects it;
- invalid/missing artifact leaves health/discovery/owned-agent routes healthy;
- `POST /api/multipass/console/codex/query` requires the exact top-level keys `input,operation,selectedTokenId` (no extras), trusted origin, session, CSRF, 16 KiB cap, and owner authorization for `selectedTokenId` but not runtime activation;
- response equals the exact adapter envelope;
- unavailable → `503 codex_unavailable`; adapter input error → `400 invalid_codex_query`; auth/ownership keep existing `401/403` shapes;
- fixed-window limits are exactly 120 per authenticated wallet/selected-token per minute and 1,200 total per minute, with bounded `429` responses;
- safe query logs contain operation, selected token ID, status, duration, schema/hash prefix, and error class only—never artifact paths/content, lore, traits, cookies, prompts, or owner addresses.

- [x] **Step 2: Run RED**

Run: `node --test apps/api/test/looper-codex-console.test.mjs apps/api/test/server.test.mjs`  
Expected: FAIL on missing option/context/route.

- [x] **Step 3: Implement server injection**

Parse and pass `looperCodexArtifactPath`. In `startServer`, create the optional runtime before `apiFactory` and emit one structured safe startup event containing availability, schema, artifact-hash prefix, count, load milliseconds, and RSS delta—never path/content/token data. Close no resources because the adapter is immutable. Add `looperCodexRuntime` injection support for tests.

- [x] **Step 4: Implement the route**

Add dedicated constants/limiters and handler. Use:

```js
const session = requireConsoleSession(request, context, { requireCsrf: true });
assertTrustedOrigin(request, context);
const body = await readBoundedJsonBody(request, CONSOLE_CODEX_REQUEST_MAX_BYTES);
const selectedTokenId = normalizeLooperTokenId(body.selectedTokenId);
await authorizeConsoleLooper({ tokenId: selectedTokenId, wallet: session.wallet, context });
return jsonResponse(context.looperCodexRuntime.query(body.operation, body.input));
```

Map only typed adapter errors; never expose raw loader errors.

- [x] **Step 5: Run GREEN and API regression**

Run:

```sh
node --test apps/api/test/looper-codex-console.test.mjs apps/api/test/server.test.mjs
node --test apps/api/test/*.test.mjs
```

Require both commands to PASS.

- [x] **Step 6: Commit**

```sh
git add apps/api/src/server.js apps/api/src/index.js apps/api/src/index.d.ts apps/api/test/looper-codex-console.test.mjs apps/api/test/server.test.mjs
git commit -m "feat: expose authenticated Looper Codex queries"
```

---

## Chunk 2: Console selection state and Codex workspace

### Task 3: Closed browser client and stale-response-safe state

**Files:**
- Create: `apps/web/src/console-codex-api.js`
- Create: `apps/web/test/console-codex-api.test.mjs`
- Modify: `apps/web/src/console-agent-api.js` only to re-export the dedicated Codex client through the existing injected `claimApi` test seam; all request construction stays in `console-codex-api.js`.
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/console-looper-selection.test.mjs`

- [x] **Step 1: Write failing client/state tests**

Test exact request bodies and credentials/CSRF. The client validates only the closed outer envelope keys and expected operation/hash format before returning JSON. State tests require selection to:

- update selected ID and default to `codex`;
- load profile/explanation/similarity concurrently;
- not call activation;
- ignore responses after wallet generation, selection ID, or Codex request ID changes;
- reuse session-memory cache only when selected ID and artifact hash match;
- clear cache on session reset;
- expose explicit retry without activation.

- [x] **Step 2: Run RED**

Run: `node --test apps/web/test/console-codex-api.test.mjs apps/web/test/console-looper-selection.test.mjs apps/web/test/app.test.mjs`  
Expected: FAIL on missing client and current select-and-activate behavior.

- [x] **Step 3: Implement the browser client**

Export `queryConsoleCodex({ apiBase, selectedTokenId, operation, input, csrfToken, fetchImpl })` and `loadConsoleCodexBundle(...)`. Bundle loading performs the three closed calls with `Promise.all`, then requires identical artifact hash/Codex version across envelopes.

- [x] **Step 4: Split selection from activation**

Replace `selectAndActivateConsoleAgent` with focused transitions:

- `selectConsoleAgentById`: selection, wallet/Codex loads, preference, inactive thread;
- `activateSelectedConsoleAgent`: existing activation/recovery logic;
- `retryConsoleCodex`: selection-preserving reload;
- existing activation retry delegates only to activation.

Allow `consoleWorkspaceView` values `chat|wallet|multipass|codex`. Default-last-selection selects only. Preserve wallet-work guards and existing async context checks.

- [x] **Step 5: Run GREEN and selection regressions**

Run the focused command from Step 2 plus:

```sh
node --test apps/web/test/console-integration-regression.test.mjs apps/web/test/console-agent-gallery.test.mjs
```

Require PASS.

- [x] **Step 6: Commit**

```sh
git add apps/web/src/console-codex-api.js apps/web/src/console-agent-api.js apps/web/src/app.js apps/web/test/console-codex-api.test.mjs apps/web/test/app.test.mjs apps/web/test/console-looper-selection.test.mjs apps/web/test/console-integration-regression.test.mjs apps/web/test/console-agent-gallery.test.mjs
git commit -m "feat: separate Looper selection from chat activation"
```

### Task 4: Compact responsive Codex workspace

**Files:**
- Create: `apps/web/src/console-codex.js`
- Create: `apps/web/test/console-codex.test.mjs`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/console-wallet-workspace-browser.test.mjs`

- [x] **Step 1: Write literal rendering tests**

Require four mutually exclusive workspace buttons, pre-activation Codex availability, and exact ready-state sections: identity proof, five collapsed drawers, frequency/ppm, recommendation status, and top-ten similar items. Test loading, unavailable, error/retry, empty similar, XSS escaping, absence of `enabled`, and no artifact path/URL/bytes. At 390px require no horizontal overflow and reachable drawer summaries.

- [x] **Step 2: Run RED**

Run: `node --test apps/web/test/console-codex.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/console-wallet-workspace-browser.test.mjs`  
Expected: FAIL because Codex workspace/nav do not exist.

- [x] **Step 3: Implement state normalization and renderer**

`console-codex.js` accepts only the three expected envelopes with one hash/version/token ID and returns safe view data. Render a compact header, proof line, recommended skill families, and drawers for Visual traits, Personality, Lore, Rarity, and Similar Loopers. Rarity is frequency only—never a synthetic rank.

- [x] **Step 4: Integrate workspace and activation gate**

Add Codex nav buttons to desktop/mobile. `renderConsolePrimaryWorkspace` chooses Codex without requiring activation. Chat renders the explicit activation gate while inactive. Activation success switches to Chat; failure/retry leaves Codex and selection usable.

- [x] **Step 5: Add responsive styles**

Reuse existing panel/drawer tokens. Use a compact responsive facts grid, wrapping trait chips, fixed loading height, and mobile single-column drawers. Do not add a modal or new page.

- [x] **Step 6: Run GREEN and full web suite**

Run focused tests, then `pnpm --filter @helixa/multipass-web test` or `node --test apps/web/test/*.test.mjs`. Require PASS.

- [x] **Step 7: Commit**

```sh
git add apps/web/src/console-codex.js apps/web/src/multipass-console.js apps/web/src/styles.css apps/web/test/console-codex.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/console-wallet-workspace-browser.test.mjs
git commit -m "feat: add verified Codex Console workspace"
```

---

## Chunk 3: Codex-grounded activated chat and release proof

### Task 5: Ground selected Looper identity in verified Codex

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/agent-runtime/index.js`
- Modify: `apps/api/src/bankr-llm/index.js`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`
- Modify: `apps/api/test/looper-codex-console.test.mjs`

- [x] **Step 1: Write failing prompt/context tests**

Require the message handler to fetch `getProfileContext(selectedTokenId)` only after owner authorization and activation. Assert the model receives bounded Codex identity/traits/version/evidence, recommended-not-enabled skills, and the instruction forbidding invented collection facts. Assert no owner address, source path, postings, full artifact, or `enabled` key enters the prompt. Unavailable Codex keeps activated chat functional with the existing canonical persona and a no-collection-claims instruction.

- [x] **Step 2: Run RED**

Run: `node --test --test-name-pattern='Codex|codex' apps/api/test/console-agent-runtime.test.mjs apps/api/test/looper-codex-console.test.mjs`  
Expected: FAIL because runtime context is not injected.

- [x] **Step 3: Inject bounded context**

After activation check, request the adapter projection and pass it as `codexContext` into `handleMessage`. Validate/freeze again at the runtime boundary. Merge into `createRuntimeProfile` without mutating canonical onchain identity. Update the Bankr system prompt with the trusted-data and no-invention language.

- [x] **Step 4: Run GREEN and persona regressions**

Run focused tests plus `node --test apps/api/test/looper-persona.test.mjs apps/api/test/bankr-llm.test.mjs`. Require PASS.

- [x] **Step 5: Commit**

```sh
git add apps/api/src/index.js apps/api/src/agent-runtime/index.js apps/api/src/bankr-llm/index.js apps/api/test/console-agent-runtime.test.mjs apps/api/test/looper-codex-console.test.mjs
git commit -m "feat: ground Looper chat in verified Codex"
```

### Task 6: Deterministic all-seven collection reads in chat

**Files:**
- Create: `apps/api/src/console-codex-read.js`
- Modify: `apps/api/src/agent-runtime/index.js`
- Modify: `apps/api/src/console-skill-catalog.js`
- Create: `apps/api/test/console-codex-read.test.mjs`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`
- Modify: `apps/api/test/console-skill-catalog.test.mjs`

- [x] **Step 1: Write parser/executor RED tests**

Cover every canonical slash command and locked natural-language family, `mine/this Looper` resolution, all defaults/caps, exact traits with spaces, unknown traits, conflicting IDs, prompt injection, write-like language, compound clauses, and malformed syntax. Recognized reads must call the adapter exactly once and the model zero times; unrecognized input must call neither executor nor formatter.

- [x] **Step 2: Run RED**

Run: `node --test --test-name-pattern='Codex|codex' apps/api/test/console-codex-read.test.mjs apps/api/test/console-agent-runtime.test.mjs`  
Expected: FAIL on missing resolver/executor.

- [x] **Step 3: Implement the closed resolver/executor**

Export `resolveConsoleCodexIntent(message,{selectedTokenId})`, `executeConsoleCodexIntent(intent,{runtime})`, and `formatConsoleCodexResult(envelope)`. Keep parsing independent from the existing Bankr/Helixa resolver. Format bounded deterministic prose by operation and include artifact hash prefix/evidence counts without token lore dumps.

- [x] **Step 4: Integrate before model generation**

In `handleMessage`, resolve Codex first, then existing read skills, then the model. A Codex hit creates/persists the assistant message with `skillRefs:['codex']`, returns top-level `codex: envelope`, and skips model generation. Add `codex` to the catalog with only `read_verified_looper_codex` enabled when runtime status is available.

- [x] **Step 5: Run GREEN and complete API suite**

Run focused tests and `node --test apps/api/test/*.test.mjs`. Require PASS.

- [x] **Step 6: Commit**

```sh
git add apps/api/src/console-codex-read.js apps/api/src/agent-runtime/index.js apps/api/src/console-skill-catalog.js apps/api/test/console-codex-read.test.mjs apps/api/test/console-agent-runtime.test.mjs apps/api/test/console-skill-catalog.test.mjs
git commit -m "feat: answer Console Codex reads deterministically"
```

### Task 7: Full artifact proof, responsive smoke, docs, and deployment gate

**Files:**
- Modify: `docs/loopers/looper-codex-artifact.md`
- Modify: this plan's checkboxes
- Deployment files only after inspecting current production service/static configuration.

- [x] **Step 1: Run sequential repository gates**

```sh
pnpm --filter @helixa/loopers-codex test
node --test apps/api/test/*.test.mjs
node --test apps/web/test/*.test.mjs
LOOPER_CODEX_ARTIFACT=/home/ubuntu/.openclaw/workspace/tmp/looper-codex-v1.json pnpm loopers:codex:prove
pnpm --filter @helixa/multipass-web build
git diff --check
```

Require all PASS and exact artifact hash `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`.

- [x] **Step 2: Run exact safety scans**

```sh
! git grep -n '@helixa/loopers-codex' -- apps/web
! grep -RInE 'looper-codex-v1|MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH|/home/|/tmp/' apps/web/dist
! git grep -nE '(^|[^[:alnum:]_])(owner|private|enabled)([^[:alnum:]_]|$)' -- apps/api/src/looper-codex-runtime.js apps/web/src/console-codex.js
! git ls-files | grep -E '(^|/)(metadata|codex)/[0-9]+\.json$|(^|/)looper-codex-v1\.json$'
! git diff --name-only accf39c..HEAD | grep -E '(^|/)(metadata|codex)/[0-9]+\.json$|(^|/)looper-codex-v1\.json$'
! git status --short | grep -E '__pycache__|\.pyc$'
git diff --check
```

Expected: each negated scan emits nothing and exits zero; `git diff --check` emits nothing. The first source scan intentionally permits the API workspace dependency and forbids it only in browser source.

- [x] **Step 3: Add and run deterministic desktop/mobile browser smoke**

Create `apps/web/scripts/smoke-looper-codex-console.mjs`. It launches the built bundle through an ephemeral loopback server mounted at `/multipass/`, injects only mock authenticated roster/Codex responses, and checks at 1440×1000 and 390×844: selection does not activate; Codex panel/five drawers render; Chat shows activation gate; activation enables identity chat and `/codex summary`; four workspaces are mutually exclusive; `document.body.scrollWidth <= window.innerWidth`; browser console/page errors are empty. Run from the package owning Playwright:

```sh
cd apps/web
CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-looper-codex-console.mjs --dist ./dist --output /home/ubuntu/.openclaw/workspace/tmp/looper-codex-console-smoke
```

Expected final line: `codex-console-smoke=pass desktop=pass mobile=pass overflow=0 errors=0`. Inspect both saved screenshots before proceeding.

- [x] **Step 4: Commit implementation documentation**

Document environment variable, pinned hashes, API request schemas, UI state behavior, deterministic commands, failure modes, and proof commands. Mark completed plan steps.

```sh
git add docs/loopers/looper-codex-artifact.md docs/superpowers/plans/2026-09-30-looper-codex-console.md
git commit -m "docs: document live Looper Codex Console"
```

- [ ] **Step 5: Approval checkpoint for external publication**

Present the complete local test/build/smoke evidence and exact HEAD. Ask for push approval only. If push is not approved, stop with the verified local commit. After a successful push and unrouted canary, separately ask for approval to run a rollback-armed live rehearsal; that approval must explicitly cover the temporary API/static swap plus the holder's wallet sign-in, Looper activation, identity question, and `/codex summary` message. After the rehearsal is restored and verified, separately ask for final production-promotion approval. Missing later approvals do not block or undo the approved push.

- [ ] **Step 6: Push the purpose-specific branch after approval**

Run the proven GitHub-auth procedure, then:

```sh
git push --dry-run origin HEAD:refs/heads/feature/looper-codex-console
git push origin HEAD:refs/heads/feature/looper-codex-console
test "$(git rev-parse HEAD)" = "$(git ls-remote --heads origin refs/heads/feature/looper-codex-console | awk '{print $1}')"
```

Expected: non-force update and exact local/remote SHA equality.

- [ ] **Step 7: Prepare exact immutable production candidate without routing traffic**

The routed unit is `multipass-api-xmtp-holder-proof.service` on `127.0.0.1:8792`; nginx is `/etc/nginx/sites-enabled/helixa.xyz`; its release override is `/etc/systemd/system/multipass-api-xmtp-holder-proof.service.d/20-release.conf`; static root is `/var/www/helixa.xyz/multipass/`. Reconfirm those facts immediately before rollout.

```sh
set -Eeuo pipefail
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
RELEASE="/home/ubuntu/releases/multipass-$SHORT"
ARTIFACT_SRC=/home/ubuntu/.openclaw/workspace/tmp/looper-codex-v1.json
git worktree add --detach "$RELEASE" "$SHA"
cd "$RELEASE"
pnpm install --offline --frozen-lockfile
mkdir -p runtime
install -m 0644 "$ARTIFACT_SRC" runtime/looper-codex-v1.json
printf '%s  %s\n' aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073 runtime/looper-codex-v1.json | sha256sum -c -
LOOPER_CODEX_ARTIFACT="$RELEASE/runtime/looper-codex-v1.json" pnpm loopers:codex:prove
node --input-type=module -e "await import('./apps/api/src/server.js'); await import('./apps/web/src/console-codex.js')"
pnpm web:build
```

Expected: frozen install, hash `OK`, full proof hash `5a776e6c…62f24`, imports succeed, canonical build succeeds.

Implement and review `apps/api/scripts/run-looper-codex-console-canary.sh`. It accepts `--release`, `--port`, and `--state-dir`, sources `/etc/default/multipass-api` and `/etc/default/multipass-api-xmtp-holder-proof` without echo, rejects an occupied port, and launches from the exact release with XMTP/Bankr disabled and the release artifact path set. Run:

```sh
STATE=/home/ubuntu/.openclaw/workspace/tmp/looper-codex-console-canary-$SHORT
apps/api/scripts/run-looper-codex-console-canary.sh --release "$RELEASE" --port 8794 --state-dir "$STATE"
PID=$(cat "$STATE/pid")
test "$(readlink -f "/proc/$PID/cwd")" = "$RELEASE"
curl -fsS -o "$STATE/nonce.json" -w '%{http_code}' -H 'Origin: https://helixa.xyz' -H 'Content-Type: application/json' --data '{"wallet":"0x0000000000000000000000000000000000000001"}' http://127.0.0.1:8794/api/multipass/console/session/nonce | grep -x 200
curl -sS -o "$STATE/codex-unauth.json" -w '%{http_code}' -H 'Origin: https://helixa.xyz' -H 'Content-Type: application/json' --data '{"selectedTokenId":"3802","operation":"getCollectionSummary","input":{}}' http://127.0.0.1:8794/api/multipass/console/codex/query | grep -x 401
sleep 60
kill -0 "$PID"
! grep -Ei 'error|exception|unhandled' "$STATE/stderr.log"
```

Expected: exact cwd, `200`, `401`, stable PID, safe Codex-ready hash/count telemetry, and empty error scan. Do not change nginx. Stop this canary before production promotion.

Implement `scripts/promote-looper-codex-console.sh` with `set -Eeuo pipefail`, explicit `INT=130`/`TERM=143`, and an `ERR` rollback trap. It accepts `--release`, `--artifact`, `--unit`, `--static-root`, and `--backup-root`. Before mutation it copies the full static tree and requires an empty `rsync -ainc --delete` diff; copies the current drop-in and service-specific EnvironmentFile with SHA manifests; records prior PID/cwd/restarts/static hashes; and prepares a sibling temporary drop-in followed by fsync and atomic privileged install.

The rollback trap restores static bytes with `rsync -a --delete`, atomically restores the prior drop-in, daemon-reloads/restarts the prior unit, and requires prior cwd, direct/public nonce `200`, prior static hashes, and empty backup diff. Add `--dry-run` to perform all validation/backups and print only `promotion-preflight=pass`. Add `--rehearsal`, which performs the candidate swap under traps, waits for browser evidence, then always restores and prints `rehearsal-restored=verified`; add `--promote --rehearsal-proof <file>`, which refuses promotion unless the proof matches the candidate SHA/artifact/static hashes. Run dry-run before asking for rehearsal approval.

- [ ] **Step 8: Run approved rollback rehearsal and authenticated proof**

After explicit rehearsal/action approval, run the promotion script with `--rehearsal`. While the candidate is temporarily live, invoke the `authenticated-browser-capture` workflow against `https://helixa.xyz/multipass/console?codex=$SHORT` using the holder's existing connected browser profile. The approved actions are limited to wallet sign-in, selected-Looper pre-activation Codex query, Looper activation, one identity question, and one `/codex summary` message; no wallet transaction or write skill is allowed. Record `$BACKUP/rehearsal-proof.json` with route, UTC time, candidate SHA, selected token ID, artifact hash, built/static/fetched hashes, HTTP statuses, four workspace selectors, desktop/mobile viewport and scroll widths, console-error count, and screenshot paths. Require query/activation/messages `200`, artifact match, four mutually exclusive workspaces, no overflow, and zero console errors.

The rehearsal must then restore the prior API/static bytes unconditionally and prove prior cwd, direct/public nonce `200`, prior static hashes, and empty backup diff. Present the proof plus `rehearsal-restored=verified`, then obtain separate final production-promotion approval.

- [ ] **Step 9: Promote production only after explicit final approval**

After final promotion approval, run:

```sh
BACKUP=/home/ubuntu/backups/multipass-codex-console-$(date -u +%Y%m%dT%H%M%SZ)
sudo scripts/promote-looper-codex-console.sh --promote --rehearsal-proof "$BACKUP/rehearsal-proof.json" --release "$RELEASE" --artifact "$RELEASE/runtime/looper-codex-v1.json" --unit multipass-api-xmtp-holder-proof.service --static-root /var/www/helixa.xyz/multipass --backup-root "$BACKUP"
```

The script atomically installs only `20-release.conf` with candidate `WorkingDirectory` and artifact environment; runs `systemd-analyze verify`, daemon-reload, and restart; waits for port 8792; requires a new stable PID, exact cwd, `NRestarts=0`, safe hash/count telemetry, and direct/public nonce `200`; publishes with `rsync -a --delete`; verifies built/installed/fetched asset hashes; and disarms rollback only after automated gates pass.

After final promotion, rerun only non-mutating live checks: asset/hash equality, direct/public nonce `200`, authenticated Codex profile read `200` through the existing session, four workspace selectors, desktop/mobile overflow, and zero console errors. Do not send another activation or chat message. Never export cookies, CSRF values, or a wallet key.

Inspect `journalctl -u multipass-api-xmtp-holder-proof.service --since <promotion-time>` for zero new warnings/errors and no token content. If any final gate fails, run `sudo scripts/promote-looper-codex-console.sh --rollback --backup-root "$BACKUP"` and require final `rollback=verified`. Keep both releases and backup until accepted.

- [ ] **Step 10: Final checkpoint**

Report pushed branch/SHA, deployed release/SHA, artifact hash, test totals, live proof, rollback location, and any remaining RESTAP/GitHub-cleanup work. Do not delete or rename remote branches.

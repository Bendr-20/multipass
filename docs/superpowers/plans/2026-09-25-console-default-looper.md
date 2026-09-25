# Console Default Looper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-open the last-used, otherwise activated, otherwise first owned Looper after Console sign-in while keeping both roster drawers closed by default.

**Architecture:** Add one pure client module for canonical token values, versioned local preference storage, bounded Blockscout V2 activation discovery, and priority resolution. Integrate it with the existing roster/activation request guards in `app.js`; render two native-details drawers from explicit in-memory state in `multipass-console.js`. Existing runtime and Looper-wallet controllers remain authoritative.

**Tech Stack:** ES modules, viem, Vite, Node test runner, JSDOM, Playwright/Chromium.

---

## Chunk 1: Selection primitives

### Task 1: Canonical values, preference storage, and priority resolver

**Files:**
- Create: `apps/web/src/console-looper-selection.js`
- Create: `apps/web/test/console-looper-selection.test.mjs`
- Modify: `apps/web/src/console-agent-gallery.js`
- Modify: `apps/web/test/console-agent-gallery.test.mjs`

- [ ] Write failing table tests for strict wallet/token normalization, bigint token comparison, canonical numeric roster ordering, valid remembered selection, activated fallback, first-owned fallback, zero-owned result, corrupt/wrong-version storage, cross-wallet isolation, and storage exceptions.
- [ ] Run `node --test apps/web/test/console-looper-selection.test.mjs`; expect missing-module failure.
- [ ] Export `normalizeConsoleWalletKey`, `normalizeLooperTokenId`, `compareLooperTokenIds`, and `resolveDefaultLooperTokenId` from the new module. Accept token IDs `1..7777` with no leading zeroes; sort a copied roster into canonical numeric token-ID order before applying remembered → activated → first priority, without mutating the source.
- [ ] Export `LAST_LOOPER_STORAGE_KEY = 'multipass.console.lastLooperByWallet.v1'`, `readLastLooperForWallet`, and `writeLastLooperForWallet`. Accept only `{schemaVersion:1,selections:{...}}`; preserve other valid wallet entries and fail closed.
- [ ] Import the shared comparator into `console-agent-gallery.js` so gallery and selection use one token ordering rule.
- [ ] Run `node --test apps/web/test/console-looper-selection.test.mjs apps/web/test/console-agent-gallery.test.mjs`; expect PASS.
- [ ] Commit with explicit paths:

```bash
git add apps/web/src/console-looper-selection.js apps/web/src/console-agent-gallery.js apps/web/test/console-looper-selection.test.mjs apps/web/test/console-agent-gallery.test.mjs
git commit -m 'feat: resolve default Console Looper'
```

### Task 2: Complete-or-fallback activated-wallet discovery

**Files:**
- Modify: `apps/web/src/console-looper-selection.js`
- Modify: `apps/web/test/console-looper-selection.test.mjs`

- [ ] Write failing injected-fetch tests covering the exact V2 cursor endpoint, `credentials: 'omit'`, exact top-level page keys, 50-row limit, registry address, generic row/hash/topic/data shapes, newest-to-oldest row order, deployment-block stop, well-formed unrelated event skip, topic-0 validation, released salt/chain/account validation, strict cursor scalars/order, response byte limit, 16-page limit, timeout/cancellation, and exact/conflicting duplicate identities.
- [ ] Run `node --test apps/web/test/console-looper-selection.test.mjs --test-name-pattern='released wallet'`; expect FAIL.
- [ ] Import `ACCOUNT_SALT`, `BASE_CHAIN_ID`, `ERC6551_REGISTRY`, `LOOPERS_COLLECTION`, `RELEASED_ACCOUNT_IMPLEMENTATION`, and `deriveLooperAccount` from `looper-agent-wallet.js`; do not duplicate pinned addresses.
- [ ] Export `loadReleasedLooperTokenIds({fetchImpl=fetch,signal,timeoutMs=4000,maxPages=16,maxPageBytes=1048576})`. Parse bounded text before JSON; follow only validated descending cursors; return `{status:'available',tokenIds}` only after complete traversal to predeployment/no-next, otherwise `{status:'unavailable',tokenIds:new Set()}`.
- [ ] Run the selection tests; expect PASS.
- [ ] Commit with explicit paths:

```bash
git add apps/web/src/console-looper-selection.js apps/web/test/console-looper-selection.test.mjs
git commit -m 'feat: discover activated Looper wallets'
```

## Chunk 2: Console behavior

### Task 3: Auto-select and remember the current Looper

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] Write failing integration tests for last-used → activated → first priority, stale remembered fallback, unavailable discovery fallback, current-selection and remembered-selection fast paths that do not await discovery, refresh preservation, wallet isolation, current-success preference write, and no write after failed/superseded/wrong-thread/wrong-wallet activation. Capture every intermediate root render and prove a loaded multi-Looper gallery with no selected room is never rendered between ownership completion and automatic opening. Add explicit spies proving automatic opening never calls `signMessage`, `sendTransaction`, `prepareActivation`, `submitPrepared`, or any wallet deployment method.
- [ ] Inject `releasedLooperLoader` and `consolePreferenceStorage` through `createApp`; tests must not call live Blockscout or global storage. Import `normalizeConsoleWalletKey` from the shared module, replace every Console wallet-boundary/context comparison in `app.js`, and delete the local permissive `normalizeConsoleWallet` helper so there is exactly one normalizer.
- [ ] Run focused tests with `node --test apps/web/test/app.test.mjs --test-name-pattern='default Looper|last used|activated Looper'`; expect FAIL.
- [ ] In `refreshConsoleOwnedAgents`, capture wallet/session/roster request and create a request-scoped `AbortController`; start roster and activation discovery together; preserve a still-owned current selection immediately; otherwise use a valid remembered selection immediately; only then await discovery for activated → first fallback. Verify captured context, put the roster into state without rendering, then call `selectAndActivateConsoleAgent`. Abort discovery on either fast path, wallet/account change, logout, session reset, superseding refresh, or authorization failure; also retain existing request-ID ignore checks.
- [ ] After `/agent/activate` succeeds, write preference only after the existing `isCurrentConsoleAsyncContext` check (including `consoleThreadGeneration`) still matches token and wallet. Do not add another epoch.
- [ ] Run focused app tests; expect PASS.
- [ ] Commit with explicit paths:

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m 'feat: auto-open the preferred Looper'
```

### Task 4: Closed, persistent roster drawers

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/console-agent-gallery-browser.test.mjs`

- [ ] Write failing tests proving the main **My Loopers** drawer stays above the active room/wallet, both drawers default closed, selected summary/count are correct, ordinary rerenders preserve explicit opens, successful selection closes both, explicit account change and logout reset both, fresh initialization resets both, roster failure opens only main, and the expanded drawer retains the complete searchable gallery.
- [ ] Run the exact red-step command:

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs --test-name-pattern='roster drawer|My Loopers|My agents|account change|logout'
```

Expected: FAIL on absent drawer state/rendering.
- [ ] Add `consoleMainRosterOpen` and `consoleSidebarRosterOpen` state. Native `toggle` handlers update state without rerender. Preserve on ordinary renders; reset on successful selection/account change/logout/fresh load; open main only for roster errors.
- [ ] Refactor `renderConsolePrimaryWorkspace` to prepend the authenticated main roster drawer before room/wallet content. Pass explicit open state to both `<details>` elements and retain the existing complete gallery as the main body.
- [ ] Reuse existing drawer styles; add only bounded primary-column and responsive selectors needed for 44px targets and no overflow.
- [ ] Run `node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs` and `CHROMIUM_PATH=/snap/bin/chromium node --test apps/web/test/console-agent-gallery-browser.test.mjs`; expect PASS.
- [ ] Commit with explicit paths:

```bash
git add apps/web/src/app.js apps/web/src/multipass-console.js apps/web/src/styles.css apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs apps/web/test/console-agent-gallery-browser.test.mjs
git commit -m 'feat: collapse Console Looper rosters'
```

## Chunk 3: Verification and rollout

### Task 5: Prove and deploy

**Files:**
- Modify source/tests only for a verified in-scope defect.
- Modify: `/home/ubuntu/.openclaw/workspace/memory/2026-09-25.md` after successful release.

- [ ] Run exact syntax and whitespace checks:

```bash
node --check apps/web/src/console-looper-selection.js
node --check apps/web/src/console-agent-gallery.js
node --check apps/web/src/app.js
node --check apps/web/src/multipass-console.js
git diff --check
```

Expected: all exit 0.

- [ ] Run `pnpm --filter @helixa/multipass-web test`; expect full PASS.
- [ ] Run the production build from repository root with `pnpm web:build`; expect `/multipass/assets/` URLs and successful Vite/static post-build scripts.
- [ ] Inspect `git status --short`, `git diff --check`, and `git log --oneline -10`; only known untracked dependency links may remain.
- [ ] Create `/tmp/deploy-console-default-looper.sh` with the literal script below, inspect it, then execute it from this reviewed worktree. It creates and verifies the backup, installs rollback traps, publishes, and leaves traps armed until later smoke approval:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
COMMIT="$(git rev-parse --short=12 HEAD)"
LIVE=/var/www/helixa.xyz/multipass
DIST="$PWD/apps/web/dist"
BACKUP="/home/ubuntu/backups/multipass-before-default-looper-${COMMIT}-${STAMP}"
RESTORING=0
verify_same() { test -z "$(rsync -ainc --delete "$1/" "$2/")"; }
restore() {
  local status="$1"
  if (( RESTORING == 0 )); then
    RESTORING=1
    rsync -a --delete "$BACKUP/" "$LIVE/"
    verify_same "$BACKUP" "$LIVE"
  fi
  exit "$status"
}
trap 's=$?; restore "$s"' ERR
trap 'restore 130' INT
trap 'restore 143' TERM
mkdir -p /home/ubuntu/backups
cp -a "$LIVE" "$BACKUP"
verify_same "$LIVE" "$BACKUP"
rsync -a --delete "$DIST/" "$LIVE/"
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const dist = join(process.cwd(), 'apps/web/dist');
const live = '/var/www/helixa.xyz/multipass';
const digest = (value) => createHash('sha256').update(value).digest('hex');
for (const name of await readdir(join(dist, 'assets'))) {
  if (!/\.(?:js|css)$/.test(name)) continue;
  const [built, installed] = await Promise.all([readFile(join(dist, 'assets', name)), readFile(join(live, 'assets', name))]);
  if (digest(built) !== digest(installed)) throw new Error(`installed hash mismatch: ${name}`);
}
NODE
APPROVE=/tmp/multipass-default-looper-approve
rm -f "$APPROVE"
printf '%s\n' "$BACKUP" > /tmp/multipass-default-looper-backup
printf '%s\n' "$COMMIT" > /tmp/multipass-default-looper-commit
printf '%s\n' "$$" > /tmp/multipass-default-looper-deploy-pid
while [[ ! -e "$APPROVE" ]]; do sleep 5; done
trap - ERR INT TERM
exit 0
```

Run with a PTY so the armed process remains controllable:

```bash
bash /tmp/deploy-console-default-looper.sh
```

- [ ] In a separate shell, set `COMMIT=$(cat /tmp/multipass-default-looper-commit)`. Locate the built JS asset with `grep -Rl 'multipass.console.lastLooperByWallet.v1' apps/web/dist/assets`, require exactly one path, fetch `https://helixa.xyz/multipass/${ASSET#apps/web/dist/}?verify=$COMMIT` with `curl -fsS`, and require `sha256sum` of fetched bytes, built bytes, and `/var/www/helixa.xyz/multipass/${ASSET#apps/web/dist/}` to match.
- [ ] Follow the `authenticated-browser-capture` skill at `/home/ubuntu/.openclaw/agents/main/agent/workshop-skills/authenticated-browser-capture/SKILL.md` from `apps/web`: authenticate outside the browser, inject only the session cookie/CSRF token, and run Playwright on desktop `1440x1000` and mobile `390x844` against `https://helixa.xyz/multipass/console?verify=$COMMIT`. Require selected Looper room/wallet content, closed main/sidebar `<details>`, complete gallery after opening, working search/sort/switch, 44px controls, no horizontal overflow, and no extra signature/transaction request. Save and inspect screenshots.
- [ ] Verify `https://api.helixa.xyz/multipass/console?verify=<commit>` names the same JS/CSS assets and passes the same static selector/hash checks; do not restart the API.
- [ ] If any live gate fails, run `kill -TERM "$(cat /tmp/multipass-default-looper-deploy-pid)"`, wait for the deploy shell to exit, and require an empty `rsync -ainc --delete "$(cat /tmp/multipass-default-looper-backup)/" /var/www/helixa.xyz/multipass/` before reporting failure. After all automated gates and screenshot inspection pass, disarm cleanly with `touch /tmp/multipass-default-looper-approve`, wait for the deploy shell to exit 0, and re-run the installed/public hash checks.
- [ ] Append release commit, backup path, live asset hashes, and verification evidence to `/home/ubuntu/.openclaw/workspace/memory/2026-09-25.md` with the required project tag.

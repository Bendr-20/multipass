# Multipass Console Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved compact expandable Multipass drawer, identity/copy/contrast fixes, Looper #614 Cred fallback, owner identity, scrollable chat, and role-correct avatars to the live Console.

**Architecture:** Keep display-only normalization in focused web helpers, leave API proof gates unchanged, and derive UI state from the authenticated wallet plus selected Looper. Resolve ENS profile data asynchronously with wallet/session guards, then decorate the rendered snapshot so persisted XMTP history remains untouched.

**Tech Stack:** Vanilla JavaScript ES modules, viem mainnet ENS client, Node test runner + jsdom, Vite, existing Multipass static deployment.

---

## Chunk 1: Public owner identity and agent normalization

### Task 1: Add a bounded ENS owner-profile helper

**Files:**
- Create: `apps/web/src/console-owner-profile.js`
- Create: `apps/web/test/console-owner-profile.test.mjs`

- [ ] **Step 1: Write failing tests**

Cover:
- reverse ENS name + avatar success;
- no-name and transport-failure fallback to the full checksum wallet address;
- HTTPS avatar acceptance and `http:`, `data:`, `javascript:`, and malformed URL rejection;
- dependency injection of `getEnsName`/`getEnsAvatar` so tests never make network calls.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test apps/web/test/console-owner-profile.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal helper**

Export:

```js
export async function resolveConsoleOwnerProfile(address, {
  getEnsName = defaultGetEnsName,
  getEnsAvatar = defaultGetEnsAvatar,
} = {})

export function safeConsoleAvatarUrl(value)
```

Return `{ address, displayName, ensName, avatarUrl }`. Use viem `createPublicClient` on mainnet with the same public RPC fallback pattern already used by `looper-allowlist.js`. ENS errors return the wallet fallback and never reject the Console flow.

- [ ] **Step 4: Run focused tests**

Run the Task 1 test command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/console-owner-profile.js apps/web/test/console-owner-profile.test.mjs
git commit -m "feat: resolve Console owner profiles"
```

### Task 2: Normalize Looper #614 Cred and role avatars in the Console snapshot

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Test: `apps/web/test/multipass-console.test.mjs`

- [ ] **Step 1: Write failing snapshot/renderer tests**

Prove:
- Looper #614 with null score and `Cred pending` becomes score/label 65;
- a finite score wins and repairs an absent/pending label to `Cred <score>`;
- a non-pending label without a numeric score is preserved without inventing a number;
- non-614 pending agents remain pending;
- owner display prefers ENS and otherwise uses the full wallet, not a shortened label;
- human messages receive owner profile label/avatar and agent messages receive selected Looper name/image even when persisted messages contain stale avatars;
- unsafe avatar URLs are omitted.

- [ ] **Step 2: Run focused test and verify failure**

```bash
node --test apps/web/test/multipass-console.test.mjs
```

Expected: new assertions FAIL.

- [ ] **Step 3: Implement snapshot normalization**

Add small pure helpers in `multipass-console.js` for:
- `normalizeConsoleCred(agent)` implementing the four explicit precedence branches from the spec;
- owner label selection from `state.consoleOwnerProfile` and authenticated wallet;
- role-based message decoration with `safeConsoleAvatarUrl`.

Do not mutate API records or persisted thread messages. Carry selected-agent wallet/owner, token, ERC-8004, Cred, and existing evidence checks into the Multipass drawer model.

- [ ] **Step 4: Run focused tests**

Run the Task 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/multipass-console.js apps/web/test/multipass-console.test.mjs
git commit -m "feat: normalize Console identity display"
```

## Chunk 2: Console rendering and lifecycle

### Task 3: Replace the proof rail with the expandable Multipass drawer and fix copy

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing renderer tests**

Assert:
- a closed `<details class="console-multipass-drawer">` appears above chat;
- its summary keeps `Verified runtime proof` and available proof values visible;
- its expanded body contains only available public identity/wallet facts and existing evidence-gated proof details;
- `Agent name` replaces `Console name` in visible Console UI and form accessibility labels;
- identity Temper copy does not contain `review-only`, while separate execution/proposal safety copy remains;
- the two removed instructional sentences are absent.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
```

Expected: new assertions FAIL.

- [ ] **Step 3: Implement the drawer and copy changes**

Refactor `renderSuitePanel` into a closed-by-default Multipass `<details>` summary/body. Reuse `renderSuiteCheck` and existing proof checks without weakening their gates. Add identity and wallet facts from the snapshot. Rename alias copy and remove only the requested Temper/default sidebar sentences.

- [ ] **Step 4: Run focused tests**

Run the Task 3 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/multipass-console.js apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
git commit -m "feat: compact Console Multipass drawer"
```

### Task 4: Integrate owner profile lifecycle with race guards

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

Using an injected owner-profile resolver, prove:
- authenticated wallet connection starts a non-blocking profile lookup;
- a matching wallet/session applies the result;
- disconnect, address change, session clear, and new authentication clear old profile state;
- a late result for an old wallet or generation is discarded;
- ENS failure does not block roster loading or authenticated Console use.

- [ ] **Step 2: Run focused test and verify failure**

```bash
node --test apps/web/test/app.test.mjs
```

Expected: new lifecycle assertions FAIL.

- [ ] **Step 3: Implement guarded lookup state**

Import `resolveConsoleOwnerProfile`, add injectable `consoleOwnerProfileResolver`, store `consoleOwnerProfile`, and capture normalized wallet + `consoleSessionGeneration` before lookup. Apply only when both still match. Clear profile in `clearConsoleSessionState` and wallet-boundary resets.

- [ ] **Step 4: Run focused tests**

Run the Task 4 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "feat: bind owner profile to Console session"
```

### Task 5: Bound the chat viewport and preserve interaction state

**Files:**
- Modify: `apps/web/src/console-agent-thread.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing DOM behavior tests**

Prove:
- `.console-thread-messages` is the dedicated scroll viewport and the composer is its sibling;
- first room open and successful local send request newest-message scrolling;
- ordered message identity prefers `xmtpMessageId`, then `id`, then a deterministic role + sender + text + timestamp fallback;
- incoming append exists only when the room key is unchanged and the prior ordered identity list is a strict prefix of the next list, and it scrolls only when the prior viewport is within 48px of bottom;
- replacements, reorders, unrelated rerenders, and above-bottom readers restore the prior absolute `scrollTop`;
- composer DOM value, focus, `selectionStart`, `selectionEnd`, and `selectionDirection` survive rerenders, while an unfocused composer stays unfocused;
- image markup contains both image and deterministic initials fallback, rejects unsafe URLs, and the image error handler reveals initials without retrying.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
```

Expected: new assertions FAIL.

- [ ] **Step 3: Implement viewport and interaction restoration**

Add a stable room/conversation key and ordered message identities where each key prefers `xmtpMessageId`, then `id`, then `role + senderLabel + text + createdAt/timestamp`. Immediately before `root.innerHTML`, capture that list, timeline `scrollTop`, `scrollHeight`, `clientHeight`, and the room key plus composer DOM value/focus/selection/direction. After render: reset to newest on room-key change or an explicit successful-local-send marker; classify incoming append only when the old identity list is a strict prefix of the new list, then use `scrollHeight - scrollTop - clientHeight <= 48` to decide newest versus restoring prior absolute `scrollTop`; replacements, reorders, and unrelated same-room rerenders restore prior `scrollTop`. Restore the textarea value and selection and call `focus({ preventScroll: true })` only if it was previously active. Render avatar image and initials together; bind a one-shot `error` listener that removes/hides the failed image and reveals initials.

- [ ] **Step 4: Add responsive styles**

Give `.console-thread-messages` a bounded `clamp(...)`/`max-height`, `overflow-y: auto`, stable scrollbar gutter, and mobile-safe overscroll behavior. Keep the composer outside this element. Add explicit light-on-dark selectors for Current room and My agents drawer labels, hints, stats, options, cards, and expanded text.

- [ ] **Step 5: Run focused tests**

Run the Task 5 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/console-agent-thread.js apps/web/src/app.js apps/web/src/styles.css apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
git commit -m "feat: polish Console chat interactions"
```

## Chunk 3: Verification, deployment, and push

### Task 6: Verify the complete web change

**Files:**
- Verify all modified files

- [ ] **Step 1: Run syntax and focused tests**

```bash
node --check apps/web/src/console-owner-profile.js
node --check apps/web/src/multipass-console.js
node --check apps/web/src/console-agent-thread.js
node --check apps/web/src/app.js
node --test apps/web/test/console-owner-profile.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run the complete web test suite**

```bash
pnpm --filter @helixa/multipass-web test
```

Expected: all pass.

- [ ] **Step 3: Build production assets and inspect diffs**

```bash
pnpm web:build
git diff --check
git status --short
```

Expected: build succeeds, diff check is clean, only intended source/test/spec/plan files are modified.

- [ ] **Step 4: Run desktop and mobile browser checks**

Capture authenticated or deterministic Console states at 1280×720 and 390×844. Verify:
- drawer closed density and expanded contents;
- Current room/My agents contrast;
- Looper and owner avatars;
- bounded chat scrolling;
- composer reachability and no horizontal overflow.

- [ ] **Step 5: Fix any regression test-first and rerun the affected verification**

Expected: no unresolved regression remains.

### Task 7: Deploy, smoke-test, and push

**Files:**
- Deploy `apps/web/dist/` to `/var/www/helixa.xyz/multipass/`
- Backup under `/home/ubuntu/backups/`

Quigley's current request explicitly approves this Console static deployment and GitHub branch push. It does not approve API/service configuration changes, service restarts, onchain writes, or unrelated publication.

- [ ] **Step 1: Create and verify a reversible timestamped backup**

```bash
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/home/ubuntu/backups/multipass-web-pre-console-polish-$stamp"
mkdir -p "$backup"
rsync -a /var/www/helixa.xyz/multipass/ "$backup/"
test -s "$backup/index.html"
printf '%s\n' "$backup" > /tmp/multipass-console-polish-backup-path
```

Expected: backup `index.html` exists and the exact path is retained for rollback.

- [ ] **Step 2: Deploy with automatic rollback on failed live smoke**

```bash
set -euo pipefail
backup=$(cat /tmp/multipass-console-polish-backup-path)
live=/var/www/helixa.xyz/multipass
stamp=$(date -u +%s)
rollback() {
  rsync -a --delete "$backup/" "$live/"
  cmp "$backup/index.html" "$live/index.html"
}
deploy_complete=0
on_failure() {
  rc=$?
  if [ "$deploy_complete" -ne 1 ]; then rollback || true; fi
  exit "$rc"
}
trap on_failure ERR INT TERM
rsync -a --delete apps/web/dist/ "$live/"
cmp apps/web/dist/index.html "$live/index.html"
curl -fsS --retry 3 --retry-delay 1 -o /tmp/live-console.html "https://helixa.xyz/multipass/console?v=$stamp"
main_js=$(grep -o 'assets/index-[^" ]*\.js' /tmp/live-console.html | head -1)
main_css=$(grep -o 'assets/index-[^" ]*\.css' /tmp/live-console.html | head -1)
test -n "$main_js"
test -n "$main_css"
for asset in "$main_js" "$main_css"; do
  test -s "apps/web/dist/$asset"
  cmp "apps/web/dist/$asset" "$live/$asset"
  curl -fsS -o "/tmp/$(basename "$asset")" "https://helixa.xyz/multipass/$asset?v=$stamp"
  test "$(sha256sum "apps/web/dist/$asset" | awk '{print $1}')" = "$(sha256sum "/tmp/$(basename "$asset")" | awk '{print $1}')"
done
deploy_complete=1
trap - ERR INT TERM
printf 'backup=%s\njs=%s\ncss=%s\n' "$backup" "$main_js" "$main_css"
```

Expected: deployed files byte-match the build, cache-busted public JS/CSS hashes match the build, and any failure/interruption restores and verifies the backup before exiting. This static-only deployment does not restart services or alter API/nginx configuration.

- [ ] **Step 3: Repeat the desktop/mobile live visual smoke**

Reload `backup=$(cat /tmp/multipass-console-polish-backup-path)`, then use 1280×720 and 390×844. If either smoke finds broken layout, unreadable text, broken avatars, missing composer, or horizontal overflow, run `rsync -a --delete "$backup/" /var/www/helixa.xyz/multipass/ && cmp "$backup/index.html" /var/www/helixa.xyz/multipass/index.html` before fixing source.

- [ ] **Step 4: Commit any final verified source changes**

```bash
git add apps/web/src apps/web/test docs/superpowers/specs/2026-09-19-console-polish-design.md docs/superpowers/plans/2026-09-19-console-polish.md
git commit -m "feat: polish Multipass Console"
```

Skip this commit if all implementation work is already committed and the worktree is clean.

- [ ] **Step 5: Push with the existing secret-safe Bendr-20 `GIT_ASKPASS` credential path**

Create a mode-700 temporary helper that reads the authenticated GitHub URL from `/home/ubuntu/helixa/.git/config` at runtime and returns only the requested username or password to Git. Never print the source URL or credential. Then run:

```bash
set -euo pipefail
helper=$(mktemp /tmp/multipass-askpass.XXXXXX)
trap 'rm -f "$helper"' EXIT
cat > "$helper" <<'PY'
#!/usr/bin/env python3
import configparser, sys
from urllib.parse import unquote, urlsplit
cfg = configparser.RawConfigParser()
cfg.read('/home/ubuntu/helixa/.git/config')
url = next((cfg.get(section, 'url') for section in cfg.sections()
            if section.startswith('remote ') and cfg.has_option(section, 'url')
            and urlsplit(cfg.get(section, 'url')).hostname == 'github.com'
            and (urlsplit(cfg.get(section, 'url')).username or urlsplit(cfg.get(section, 'url')).password)), '')
if not url: raise SystemExit(1)
parts = urlsplit(url)
username = unquote(parts.username or '')
password = unquote(parts.password or '')
prompt = ' '.join(sys.argv[1:]).lower()
print((username if password else 'x-access-token') if 'username' in prompt else (password or username))
PY
chmod 700 "$helper"
branch=submission/bankr-runtime-clean-2026-09-19
GIT_ASKPASS="$helper" GIT_TERMINAL_PROMPT=0 git push --set-upstream https://github.com/Bendr-20/multipass.git "$branch"
local_sha=$(git rev-parse HEAD)
remote_sha=$(GIT_ASKPASS="$helper" GIT_TERMINAL_PROMPT=0 git ls-remote --heads https://github.com/Bendr-20/multipass.git "$branch" | awk '{print $1}')
test -n "$remote_sha"
test "$local_sha" = "$remote_sha"
printf 'local=%s\nremote=%s\n' "$local_sha" "$remote_sha"
```

Expected: push succeeds and local/remote SHA match exactly.

- [ ] **Step 6: Report concise evidence**

Report test/build totals, live route status, deployed behavior, commit/remote SHA, and any remaining user-only wallet proof.

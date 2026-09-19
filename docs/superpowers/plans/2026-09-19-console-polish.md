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
- a real numeric #614 score and label win;
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
- `applyTemporaryCredFallback(agent)`;
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
- room open, successful send, and genuinely new messages request newest-message scrolling;
- unrelated rerenders and intentional above-bottom reading positions do not force scroll;
- composer focus, draft, `selectionStart`, and `selectionEnd` survive rerenders;
- image markup contains both image and deterministic initials fallback, rejects unsafe URLs, and the image error handler reveals initials without retrying.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
```

Expected: new assertions FAIL.

- [ ] **Step 3: Implement viewport and interaction restoration**

Add a message-scroll marker/count to the thread snapshot, capture viewport proximity-to-bottom plus composer focus/selection before root replacement, and restore after render. Scroll only for the specified room/message transitions or when already near bottom. Render avatar image and initials together; bind a one-shot `error` listener that removes/hides the failed image and reveals initials.

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
pnpm --filter @multipass/web test
```

Expected: all pass.

- [ ] **Step 3: Build production assets and inspect diffs**

```bash
pnpm --filter @multipass/web build
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
- Deploy built `apps/web/dist` through the repository's existing static deployment path

- [ ] **Step 1: Create a reversible timestamped backup of the current live static Console**

Expected: backup path is recorded outside the web root.

- [ ] **Step 2: Deploy the verified production build using the existing Multipass static deployment procedure**

Do not replace unrelated API/service configuration.

- [ ] **Step 3: Verify live assets and Console route**

Check `/multipass/console` and its JS/CSS assets return 200, then repeat the desktop/mobile visual smoke for the live route.

- [ ] **Step 4: Commit any final verified source changes**

```bash
git add apps/web/src apps/web/test docs/superpowers/specs/2026-09-19-console-polish-design.md docs/superpowers/plans/2026-09-19-console-polish.md
git commit -m "feat: polish Multipass Console"
```

Skip this commit if all implementation work is already committed and the worktree is clean.

- [ ] **Step 5: Push with the existing secret-safe Bendr-20 `GIT_ASKPASS` credential path**

Push `submission/bankr-runtime-clean-2026-09-19`, then prove local HEAD equals the remote branch SHA without printing credentials.

- [ ] **Step 6: Report concise evidence**

Report test/build totals, live route status, deployed behavior, commit/remote SHA, and any remaining user-only wallet proof.

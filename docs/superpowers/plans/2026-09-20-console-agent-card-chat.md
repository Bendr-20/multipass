# Console Agent Card and Private Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active agent unmistakable in the Console while removing the duplicate chat portrait and leaving the Verified Runtime/ticker area unchanged.

**Architecture:** Reuse the existing normalized `identityCard` and active-room `agentThread.agentName` data. Change only serverless render markup and final CSS overrides; preserve ownership, activation, XMTP, Bankr, Sibyl, and runtime-proof behavior.

**Tech Stack:** Vanilla JavaScript rendering, CSS Grid, JSDOM/node:test, Vite, Playwright visual smoke.

---

## Chunk 1: Rendering and regression tests

### Task 1: Add failing render and DOM tests

**Files:**
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Add renderer assertions**

Assert the rendered Console contains `Bendr 2.0 Private Chat`, renders `Agent Private Chat` before any selection, omits `.console-thread-avatar-chat`, renders the identity portrait before the name/body, does not apply `console-identity-card-compact`, shows the active agent name in the closed Agents drawer summary instead of the roster count, preserves `Verified runtime proof`, and contains none of `$CRED`, `$BANKR`, or `$DRB`.

- [ ] **Step 2: Add selected-name DOM assertion**

For a loaded selected agent, assert the `select[data-action="select-console-agent"]` selected option text equals the active agent name and the control has readable foreground styling through the final sidebar CSS rule.

- [ ] **Step 3: Add image-failure and CSS assertions**

Assert the identity portrait image uses the existing `data-console-avatar-image` fallback contract, a failed image reveals initials, the portrait retains `min(100%, 252px)` and `aspect-ratio: 1`, and the compact 68px class no longer appears in rendered markup.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
```

Expected: failures for the old compact identity class, duplicate chat avatar, old chat title, and missing identity fallback markup.

### Task 2: Implement the minimal renderer and CSS changes

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/console-agent-thread.js`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Restore the visual-first identity card**

Replace `console-identity-card-compact` with `console-identity-card-featured`. Render an empty-alt image using `data-console-avatar-image` plus a hidden initials fallback in the same portrait container; render initials directly when no image exists.

- [ ] **Step 2: Make the active selector name explicit and readable**

Change `buildAgentOptionLabel(agent)` to return only the selected agent's display name; Cred and canonical identity remain in the visible identity card. In `renderMultipassConsole`, set the closed Agents drawer `stat` to `snapshot.session.activeAgentLabel` whenever an active agent exists, falling back to `rosterStat` only without a selection. Add a final sidebar selector rule that sets the native select foreground to `#f8f3ec` and its option foreground/background to readable light-on-dark values without changing native selection behavior.

- [ ] **Step 3: Simplify and retitle the chat header**

Remove `renderAvatar(...)` from `.console-thread-chat-head`. Set the heading to `${selectedAgentName} Private Chat`, with `Agent Private Chat` before selection, and make the header a one-column text layout. Preserve the existing selection/activation state model: selector, identity, title, and retry state all use `consoleSelectedAgentId` immediately.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the implementation**

```bash
git add apps/web/src/multipass-console.js apps/web/src/console-agent-thread.js apps/web/src/styles.css apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs apps/web/test/mobile-layout.test.mjs
git commit -m "fix: restore prominent Console agent identity"
```

## Chunk 2: Verification and release

### Task 3: Run regression and production checks

**Files:**
- Verify: `apps/web/src/*.js`
- Verify: `apps/web/test/*.test.mjs`

- [ ] **Step 1: Run Console regression tests**

```bash
node --test apps/web/test/console-owner-profile.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs apps/web/test/app.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax and diff checks**

```bash
node --check apps/web/src/multipass-console.js
node --check apps/web/src/console-agent-thread.js
git diff --check
```

Expected: zero errors.

- [ ] **Step 3: Build production assets**

```bash
pnpm web:build
```

Expected: Vite exits 0 and writes `apps/web/dist`.

- [ ] **Step 4: Capture desktop and mobile visual smoke screenshots**

Serve the production bundle locally, open `/multipass/console?mock=looper`, and verify: large left portrait above visible `Brok`, no chat-header portrait, `Brok Private Chat`, readable selected option, unchanged runtime drawer.

### Task 4: Deploy, verify, and push

**Files:**
- Deploy: `apps/web/dist/` to `/var/www/helixa.xyz/multipass/`

- [ ] **Step 1: Create a timestamped full backup and deploy**

Use a self-contained script with explicit `ERR`, `INT`, and `TERM` exit codes. On failure, restore the full backup tree and verify the restored tree by checksums; do not mask rollback failure.

- [ ] **Step 2: Verify live assets**

Fetch the live Console HTML and referenced JS/CSS with cache busting, compare their SHA-256 hashes with `apps/web/dist`, and run a live screenshot/text smoke.

- [ ] **Step 3: Push and verify remote SHA**

Push `submission/bankr-runtime-clean-2026-09-19`, then compare local HEAD with `git ls-remote`.

- [ ] **Step 4: Report the exact commit, tests, deployment hash proof, and the intentionally deferred ticker/runtime redesign.**

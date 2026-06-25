# Multipass Change Review Ledger Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a readable Recent Changes / Review Queue ledger under the Owner & Custody Snapshot in the Multipass V0 web prototype.

**Architecture:** Keep the ledger as display-only card metadata normalized in `content.js` and rendered in `app.js`. Use static fixture rows for the hidden prototype, with safe fallbacks so cards without explicit rows do not break.

**Tech Stack:** Plain JS modules, Vite, jsdom/node:test, CSS.

---

## Chunk 1: Web model and rendering

### Task 1: Add content model tests

**Files:**
- Modify: `apps/web/test/content.test.mjs`
- Modify: `apps/web/src/content.js`

- [ ] Write a failing test that `createAgentCarousel()` exposes a `changeReviewLedger` with title `Change + Review Ledger` and rows containing event/source/impact/review state.
- [ ] Run `pnpm --filter @helixa/multipass-web test -- apps/web/test/content.test.mjs` and confirm RED because no ledger is exported.
- [ ] Add `createChangeReviewLedger(card)` and attach it to normalized carousel cards.
- [ ] Run the targeted test and confirm GREEN.

### Task 2: Add UI tests and renderer

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/static-demo-data.js`

- [ ] Write a failing app test proving the selected card renders the ledger under `.owner-snapshot` and before `.transfer-preview`, with no executable controls.
- [ ] Run targeted app test and confirm RED.
- [ ] Add fixture rows for Bendr and Helixa Swarm.
- [ ] Render a `.change-review-ledger` section with timeline/review rows only; no buttons.
- [ ] Add responsive styling.
- [ ] Run targeted app test and confirm GREEN.

### Task 3: Verification and deployment

**Files:**
- Build output: `apps/web/dist/**`
- Deploy artifact: `/home/ubuntu/helixa/docs/multipass/**`

- [ ] Run `pnpm test`.
- [ ] Run `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`.
- [ ] Run wording/em dash checks and `git diff --check`.
- [ ] Commit and push Multipass changes.
- [ ] Copy fresh `apps/web/dist` to Helixa `docs/multipass`, commit/push Helixa artifact, and deploy to `/var/www/helixa.xyz/multipass/`.
- [ ] Smoke live `/multipass/?api=not-a-url` on mobile width and verify the ledger appears, layout stays warm, no raw fragment IDs appear, and no `/multipass-api` is used.

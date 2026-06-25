# Multipass Resolver Aura Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Multipass resolver feel product-ready with example chips, better match selection, a clearer share affordance, and a read-only Agent Aura placeholder visual.

**Architecture:** Reuse the existing live resolver and mapping boundaries. Add a whitelisted `visualIdentity` model in `apps/web/src/live-helixa-resolver.js`, render it from `apps/web/src/app.js`, and style it in `apps/web/src/styles.css`. No backend or write flows.

**Tech Stack:** Vite web app, vanilla JS renderer, Node test runner, jsdom tests, Playwright smoke.

---

## Chunk 1: Resolver Chips and Match Picker Polish

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`

- [ ] Write failing tests that example chips render and resolving a chip uses the same live resolver path.
- [ ] Write failing test that ambiguous lookup results render as selectable result cards.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement chip rendering and click handlers in `app.js`.
- [ ] Add focused CSS for chip row and match cards.
- [ ] Run targeted tests and confirm pass.

## Chunk 2: Agent Aura Placeholder Visual

**Files:**
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/live-helixa-resolver.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`

- [ ] Write failing mapper test for default `visualIdentity.source === 'aura'`.
- [ ] Write failing render test for Agent Aura placeholder and future NFT/custom copy.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement deterministic Aura model from public fields only.
- [ ] Render Aura visual near the live listing/profile area.
- [ ] Style Aura as a premium placeholder PFP tile.
- [ ] Run targeted tests and confirm pass.

## Chunk 3: Verification and Deploy

**Files:**
- Build output: `apps/web/dist/*`
- Deployment target: `/var/www/helixa.xyz/multipass/`

- [ ] Run `pnpm test` and expect all tests passing.
- [ ] Run `git diff --check`.
- [ ] Run `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`.
- [ ] Copy `apps/web/dist/.` to `/var/www/helixa.xyz/multipass/`.
- [ ] Smoke live `/multipass/`, `?agent=Quigbot`, and ambiguous lookup.
- [ ] Browser-smoke mobile and capture screenshots.
- [ ] Commit and push implementation.

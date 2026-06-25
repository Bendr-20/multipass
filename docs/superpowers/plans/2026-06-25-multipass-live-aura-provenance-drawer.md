# Multipass Live Aura Provenance Drawer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a display-only live Agent Aura provenance drawer under the Aura marketplace panel.

**Architecture:** Attach `provenanceDrawer` to the existing `visualIdentity` model created by the live Helixa resolver. Render it immediately after `renderAgentAura(data.visualIdentity)` with a focused renderer that only outputs safe public facts and safe links.

**Tech Stack:** Vanilla JS renderer, CSS, Node test runner, Vite build, static artifact deployment to Helixa.

---

## File map

- `apps/web/src/live-helixa-resolver.js` creates the `visualIdentity.provenanceDrawer` model for live Helixa agents.
- `apps/web/src/app.js` renders the drawer and enforces safe link behavior.
- `apps/web/src/styles.css` styles the drawer for desktop and mobile.
- `apps/web/test/live-helixa-resolver.test.mjs` covers mapper output for token `1`.
- `apps/web/test/app.test.mjs` covers render order, missing drawer behavior, optional rows, unsafe links, and token `81` UI.
- `docs/superpowers/specs/2026-06-25-multipass-live-aura-proof-drawer-design.md` documents the approved design.

---

## Chunk 1: Model and render tests

### Task 1: Add failing mapper test

**Files:**
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`

- [x] Add assertions to the existing live mapper test that `data.visualIdentity.provenanceDrawer` exists for token `1`.
- [x] Assert required facts include Helixa ID `8453:1`, AgentDNA token ID `1`, Chain `Base (8453)`, contract `0x2e3B541C59D38b84E3Bc54e977200230A204Fe60`, metadata source `https://api.helixa.xyz/api/v2/metadata/1`, Aura image source `https://api.helixa.xyz/api/v2/aura/1.png`, API source `https://api.helixa.xyz/api/v2/agent/1`, owner if fixture provides one, and Cred if numeric.
- [x] Assert links include Metadata JSON, Aura image, Helixa profile, OpenSea item, and safe explorer link when present.
- [x] Run: `pnpm test -- apps/web/test/live-helixa-resolver.test.mjs`
- [x] Expected before implementation: fail because `provenanceDrawer` is undefined.

### Task 2: Add failing render tests

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [x] Extend the live Agent Aura UI test to include a `visualIdentity.provenanceDrawer` fixture for token `81`.
- [x] Assert `.aura-provenance-drawer` renders directly after `.aura-card` and before `.marketplace-listing`.
- [x] Assert visible text includes Agent Aura Provenance, Helixa ID `8453:81`, AgentDNA token ID `81`, Base (8453), contract, owner, metadata source, Aura image source, API source, OpenSea item, and display-only safety note.
- [x] Add a test where `visualIdentity` has no `provenanceDrawer`; assert no drawer and no crash.
- [x] Add a test where optional fact/link values are empty; assert empty rows are not rendered.
- [x] Add a test where links include `javascript:`, `ftp:`, malformed URLs, and credential-bearing HTTPS; assert they are not rendered as anchors, while a normal HTTPS link is rendered with `target="_blank"` and `rel="noopener noreferrer"`.
- [x] Run: `pnpm test -- apps/web/test/app.test.mjs`
- [x] Expected before implementation: fail because the drawer renderer does not exist.

---

## Chunk 2: Implementation

### Task 3: Build provenance model

**Files:**
- Modify: `apps/web/src/live-helixa-resolver.js`

- [x] Add constants for Base chain, Helixa V2 contract, metadata base, aura base, OpenSea asset base.
- [x] Add `createAuraProvenanceDrawer(agent, { tokenId, credTier, profileUrl })`.
- [x] Return required facts and links from the design spec.
- [x] Omit optional owner/Cred/framework rows when values are absent.
- [x] Attach the result as `provenanceDrawer` in `createAgentAuraVisual`.
- [x] Run mapper test and confirm it passes.

### Task 4: Render provenance drawer safely

**Files:**
- Modify: `apps/web/src/app.js`

- [x] Add `${renderAgentAuraProvenanceDrawer(data.visualIdentity?.provenanceDrawer)}` immediately after `renderAgentAura(data.visualIdentity)`.
- [x] Implement `renderAgentAuraProvenanceDrawer(drawer)` with a labeled `<section class="aura-provenance-drawer">`.
- [x] Render non-empty facts only.
- [x] Render safe links only.
- [x] Tighten URL safety so links with username/password credentials are not anchors.
- [x] Preserve `target="_blank"` and `rel="noopener noreferrer"` on external anchors.
- [x] Run app render tests and confirm they pass.

### Task 5: Style drawer

**Files:**
- Modify: `apps/web/src/styles.css`

- [x] Add desktop styles for `.aura-provenance-drawer`, `.aura-provenance-copy`, `.aura-provenance-grid`, `.aura-provenance-fact`, `.aura-provenance-links`, `.aura-provenance-note`.
- [x] Match warm paper/card styling and keep the drawer visually subordinate to the Aura panel.
- [x] Add mobile styles so facts and links stack cleanly and long values wrap.
- [x] Run targeted app tests again.

---

## Chunk 3: Verification and deployment

### Task 6: Full source verification

**Files:**
- All modified source/test/spec/plan files

- [x] Run: `pnpm test`
- [x] Expected: all tests pass.
- [x] Run: `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- [x] Expected: Vite build succeeds and generated assets reference `/multipass/`.
- [x] Run: `git diff --check`
- [x] Expected: no whitespace errors.

### Task 7: Source commit and push

**Files:**
- Stage only relevant Multipass files.

- [x] Run `git status --short` and confirm only intended files plus known unrelated untracked plan draft are present.
- [x] Commit with message: `Add Agent Aura provenance drawer`.
- [x] Push `Bendr-20/multipass` main.

### Task 8: Deploy static Helixa artifact

**Files:**
- Generated: `apps/web/dist/**`
- Helixa artifact: `docs/multipass/**`
- Live directory: `/var/www/helixa.xyz/multipass/**`

- [x] Copy `apps/web/dist/.` to `/var/www/helixa.xyz/multipass/`.
- [x] Use a clean temp clone of `Bendr-20/helixa` to update `docs/multipass/**` from `apps/web/dist`.
- [x] Commit with message: `Deploy Multipass Aura provenance drawer`.
- [x] Push Helixa main.

### Task 9: Live smoke

**Files:**
- Screenshot artifact under `/home/ubuntu/.openclaw/workspace/`

- [x] Fetch `https://helixa.xyz/multipass/?agent=81` and confirm HTML points at new assets.
- [x] Fetch live JS and confirm it contains `aura-provenance-drawer`.
- [x] Browser smoke `https://helixa.xyz/multipass/?agent=81` and assert real Aura image loads, drawer renders, old unsafe overclaiming copy is absent, and no console errors occur.
- [x] Save screenshot `multipass-aura-provenance-live-mobile.png`.
- [x] Append memory note with commits and verification evidence.

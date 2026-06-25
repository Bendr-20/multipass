# Multipass OpenSea-Style Aura Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the live Multipass Agent Aura section feel like an OpenSea item page with a larger visual and no explanatory placeholder copy.

**Architecture:** Keep the existing `renderAgentAura` component, but change its markup from an explainer card into a marketplace-style asset panel. Update CSS to make the Aura image the dominant square visual, with concise item metadata/chips beside it and a stacked mobile layout.

**Tech Stack:** Vanilla JS renderer, CSS, Node test runner, Vite build.

---

## Chunk 1: Aura item panel

### Task 1: Lock expected UI behavior in tests

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [x] Update the Aura render test to expect OpenSea-style item markup.
- [x] Assert the real Aura image still renders from `https://api.helixa.xyz/api/v2/aura/81.png`.
- [x] Assert old explainer copy is absent: `Default visual identity`, `Default Helixa Agent Aura`, and `agent NFT, collection NFT, or custom visual`.
- [x] Assert the card exposes marketplace/item classes used by CSS.
- [x] Run: `pnpm test -- apps/web/test/app.test.mjs`

### Task 2: Update Aura renderer markup

**Files:**
- Modify: `apps/web/src/app.js`

- [x] Keep `renderAgentAura(visualIdentity)` as the only rendering boundary.
- [x] Change the section aria label to a marketplace asset visual label.
- [x] Render the image inside a larger asset frame.
- [x] Replace the `Default visual identity` heading and summary paragraph with concise item UI: label/name/chips only.
- [x] Preserve safe HTTPS image handling and fallback initials.

### Task 3: Update responsive OpenSea-style CSS

**Files:**
- Modify: `apps/web/src/styles.css`

- [x] Make `.aura-card` a two-column asset panel with the visual at roughly 40-50% width.
- [x] Increase `.aura-orb` to a large square visual with cleaner marketplace framing.
- [x] Remove visual treatment that makes it feel like a small placeholder/explainer.
- [x] Add mobile rules so the image stacks full-width above metadata.

### Task 4: Verify and ship

**Files:**
- Test: `apps/web/test/app.test.mjs`
- Test: full project tests/build

- [x] Run targeted app test.
- [x] Run full `pnpm test`.
- [x] Run `pnpm web:build`.
- [x] Run `git diff --check`.
- [x] Inspect or screenshot live/local UI.
- [x] Commit and push only relevant files, leaving unrelated untracked files untouched.

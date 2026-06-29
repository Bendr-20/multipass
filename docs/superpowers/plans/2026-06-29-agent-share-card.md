# Agent Share Card Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the profile aura card read as the specific agent, add a share icon, and provide per-agent social preview cards with the actual agent image/name.

**Architecture:** Keep the profile UI static/client-side, but make shared URLs crawler-friendly by adding static per-agent share routes under `apps/web/public/share/<agent>/index.html`. Each share route carries OG/Twitter metadata for a generated PNG and redirects humans back to `/multipass/?agent=<agent>`. The aura card share icon uses those share routes.

**Tech Stack:** Vite static web app, Node test runner, static HTML/PNG public assets, shell image tooling for preview generation.

---

## Chunk 1: Profile aura card copy and share action

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/app.test.mjs`

- [ ] Add failing tests that a resolved profile aura card title is the agent name, not “Helixa agent auras”.
- [ ] Add failing tests that the aura card contains one corner share link/icon pointed at `/multipass/share/<token-or-agent>/`.
- [ ] Implement minimal UI changes in `renderAgentAura()` and its caller.
- [ ] Run focused tests until green.

## Chunk 2: Static social preview routes and images

**Files:**
- Create: `apps/web/public/share/1/index.html`
- Create: `apps/web/public/share/81/index.html`
- Create: `apps/web/public/share/1.png`
- Create: `apps/web/public/share/81.png`
- Test: `apps/web/test/share-preview.test.mjs`

- [ ] Add failing tests for Bendr and Quigbot share route metadata.
- [ ] Generate 1200x630 preview PNGs using the actual aura/PFP images and agent names.
- [ ] Add static share HTML with OG/Twitter metadata and human redirect to profile URL.
- [ ] Run share-preview tests until green.

## Chunk 3: Verify and ship

- [ ] Run `pnpm test`.
- [ ] Run `MULTIPASS_BASE=/multipass/ pnpm web:build`.
- [ ] Deploy with `rsync -av --delete apps/web/dist/ /var/www/helixa.xyz/multipass/`.
- [ ] Verify live bundle/assets and pushed commit.

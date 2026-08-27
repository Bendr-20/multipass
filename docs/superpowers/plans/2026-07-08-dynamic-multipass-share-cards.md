# Dynamic Multipass Share Cards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved Multipass profiles automatically produce crawler-friendly share cards without manually generating static files per profile.

**Architecture:** Add live API share routes that render safe OG/Twitter HTML and a deterministic SVG image from saved Multipass profile data. Update web share URLs to point at those dynamic share pages for saved profiles, while leaving existing static generated cards intact for legacy token-specific shares.

**Tech Stack:** Node HTTP API, SQLite saved records, existing node:test suites, Vite web bundle.

---

## Chunk 1: Dynamic Share API

### Task 1: Share HTML route

**Files:**
- Modify: `apps/api/src/index.js`
- Test: `apps/api/test/api-routes.test.mjs`

- [ ] Write a failing API route test for `GET /api/multipass/{id}/share` returning HTML with profile-specific title, description, canonical URL, OG/Twitter tags, and image URL.
- [ ] Run `pnpm exec node --test apps/api/test/api-routes.test.mjs` and verify the test fails with route not found.
- [ ] Implement the route using saved profile data only, with HTML escaping and no private fields.
- [ ] Run the test and verify it passes.

### Task 2: Share SVG image route

**Files:**
- Modify: `apps/api/src/index.js`
- Test: `apps/api/test/api-routes.test.mjs`

- [ ] Write a failing API route test for `GET /api/multipass/{id}/share.svg` returning `image/svg+xml` with 1200x630 dimensions and profile text.
- [ ] Run the route test and verify failure.
- [ ] Implement a lightweight SVG renderer from saved profile display name, subject type, tags, and avatar URL if safely usable.
- [ ] Run the route test and verify pass.

## Chunk 2: Web Share URL Behavior

### Task 3: Saved profile share URLs point to dynamic share pages

**Files:**
- Modify: `apps/web/src/api.js`
- Test: `apps/web/test/api.test.mjs`

- [ ] Write a failing web API normalization test proving hydrated saved ACK uses `/multipass-api/api/multipass/ack-19125/share` as the public share URL.
- [ ] Run the focused web test and verify failure.
- [ ] Update saved-profile share URL normalization to prefer dynamic share URLs for saved profiles and keep activation previews on activation query paths.
- [ ] Run focused tests and verify pass.

## Chunk 3: Verification and Deploy

- [ ] Run `pnpm test`.
- [ ] Run `MULTIPASS_BASE=/multipass/ pnpm web:build`.
- [ ] Deploy web dist to `/var/www/helixa.xyz/multipass/` if web changed.
- [ ] Restart `multipass-api.service`.
- [ ] Smoke `https://helixa.xyz/multipass-api/api/multipass/ack-19125/share` and `share.svg`.
- [ ] Update memory and commit/push source changes.

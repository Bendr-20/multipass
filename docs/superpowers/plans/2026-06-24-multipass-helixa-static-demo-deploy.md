# Multipass Helixa Static Demo Deploy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Protocol Artifact Multipass demo at `https://helixa.xyz/multipass/` as a static GitHub Pages route without replacing the Helixa homepage.

**Architecture:** Add a sanitized bundled public API-shaped Bendr demo document set to `apps/web`, and route `/multipass/` static page loads to that bundle unless a safe `?api=` override is provided. Build the web app with Vite base `/multipass/`, copy the build output into `helixa/docs/multipass/`, and commit only the intended route files in the Helixa repo.

**Tech Stack:** Node 22, pnpm, Vite, jsdom, built-in `node:test`, GitHub Pages from `Bendr-20/helixa` `docs/`.

---

## Task 1: Static fixture fallback

**Files:**
- Modify: `apps/web/src/api.js`
- Create: `apps/web/src/static-demo-data.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/api.test.mjs`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/wording.test.mjs`

- [ ] Write failing tests for `/multipass/` static mode, safe `?api=` override preserving API mode, no `/multipass-api` fetch in static mode, and static labels.
- [ ] Add sanitized public API-shaped static data.
- [ ] Add static mode loader and source labels.
- [ ] Run targeted web tests until green.

## Task 2: Build base and deployment artifacts

**Files:**
- Modify: `apps/web/vite.config.js`
- Modify: `apps/web/test/api.test.mjs` or add build config assertion test if useful.
- Create/update: `docs/superpowers/plans/2026-06-24-multipass-helixa-static-demo-deploy.md`

- [ ] Make Vite base configurable via `MULTIPASS_BASE`, default `/`.
- [ ] Verify `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build` emits `/multipass/assets/...` paths.
- [ ] Run full Multipass test/build gates.

## Task 3: Copy to Helixa docs and verify static preview

**Files:**
- Modify only: `/home/ubuntu/helixa/docs/multipass/**`
- Do not stage: `/home/ubuntu/helixa/api/v2-server.js`, `.gitmodules`, `foundry.lock`

- [ ] Remove/recreate `helixa/docs/multipass/` from Multipass build output.
- [ ] Serve `/home/ubuntu/helixa/docs` locally and verify `/multipass/` loads.
- [ ] Verify built index has `/multipass/assets/` paths, no root `/assets/` paths, and rendered app does not call `/multipass-api`.
- [ ] Commit and push Multipass implementation.
- [ ] Commit and push Helixa docs route only.
- [ ] Verify remote commits and, if available, live `https://helixa.xyz/multipass/`.

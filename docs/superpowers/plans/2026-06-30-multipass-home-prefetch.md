# Multipass Home Prefetch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prefetch visible Multipass homepage agent profiles so taps can reuse cached live data instead of waiting on a fresh request.

**Architecture:** Keep this client-only and display-only. Add a small in-memory resolver cache inside `createApp`, preload numeric homepage cards after the static homepage renders, and make `resolveLiveAgent()` serve cached records immediately when available. Failed/invalid prefetches stay silent and never change UI state.

**Tech Stack:** Vanilla JS app code, Node test runner with JSDOM, Vite static build.

---

## Chunk 1: Homepage profile prefetch/cache

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

### Task 1: Add regression coverage

- [x] Add a test proving homepage startup silently prefetches visible numeric profile cards.
- [x] Add a test proving clicking a prefetched card renders the profile from cache immediately and does not call `loadLiveDemo` again.
- [x] Run focused tests and confirm they fail before implementation.

### Task 2: Implement minimal cache

- [x] Add an in-memory `Map` in `createApp` keyed by trimmed resolver input.
- [x] Cache successful `loadLiveDemo` + `overlaySavedProfileVisual` results.
- [x] Add silent homepage prefetch after the static homepage renders.
- [x] When resolving, if cached data exists, render profile synchronously from cache and skip the loading state.

### Task 3: Verify and deploy

- [x] Run focused tests.
- [x] Run `pnpm test && MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build && git diff --check`.
- [x] Deploy `apps/web/dist/` to `/var/www/helixa.xyz/multipass/`.
- [x] Live smoke the click path.
- [x] Commit and push.

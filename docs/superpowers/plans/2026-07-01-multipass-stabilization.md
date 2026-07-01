# Multipass Stabilization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the public Multipass API documentation with the implemented routes and add a concise live status reference for operators.

**Architecture:** Keep this as a small stabilization pass. The API already serves the routes; the source update advertises them in discovery/OpenAPI, and docs explain which routes are canonical versus compatibility aliases.

**Tech Stack:** Node.js `node:test`, Multipass API source in `apps/api/src/index.js`, Markdown docs under `docs/` and `apps/api/README.md`.

---

## Chunk 1: API discovery consistency

**Files:**
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/src/index.js`

- [x] **Step 1: Write failing coverage**
  - Assert discovery advertises `card`, `agent_card`, and `changes`.
  - Assert OpenAPI advertises `/.well-known/helixa-multipass.json`, `/api/multipass/{id}/card`, `/api/multipass/{id}/agent-card`, and `/api/multipass/{id}/changes`.

- [x] **Step 2: Run focused test red**
  - Run: `node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'serves public Multipass discovery alias and OpenAPI document'`
  - Expected: fail on missing discovery `card`.

- [x] **Step 3: Update API documents**
  - Add route pointers to `createDiscoveryDocument()`.
  - Add missing public paths to `createOpenApiDocument()`.
  - Add `card` and `changes` to per-profile route objects.

- [x] **Step 4: Run focused test green**
  - Run same focused command.
  - Expected: pass.

## Chunk 2: Operator docs

**Files:**
- Modify: `apps/api/README.md`
- Create: `docs/live-status.md`
- Create: `docs/live-smoke-checklist.md`

- [x] **Step 1: Clarify route canon**
  - Explain `/api/multipass/{id}/agent-card` is canonical.
  - Explain `/api/multipass/{id}/card` is a compatibility alias.

- [x] **Step 2: Add live status doc**
  - State what is live in V0.
  - State what is display-only.
  - State what is not live yet.

- [x] **Step 3: Add smoke checklist**
  - Include exact local and live commands.
  - Cover discovery, OpenAPI, resolve, search, profile, fragments, card, standards, x402, receipts, changes, and web page.

## Chunk 3: Verification

**Files:**
- Verify repository state and tests.

- [x] **Step 1: Run API focused test**
  - `node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'serves public Multipass discovery alias and OpenAPI document'`

- [x] **Step 2: Run full Multipass test suite**
  - `pnpm test`

- [x] **Step 3: Run production web build**
  - `MULTIPASS_BASE=/multipass/ pnpm web:build`

- [x] **Step 4: Run live smoke commands from `docs/live-smoke-checklist.md`**

- [ ] **Step 5: Commit**
  - Commit message: `Stabilize Multipass public API docs`

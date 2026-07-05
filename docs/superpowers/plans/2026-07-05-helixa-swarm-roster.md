# Helixa Swarm Roster Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the existing Helixa Swarm card to use the approved five-agent public roster and remove internal/test identity mentions from public/demo surfaces.

**Architecture:** Keep the existing static data and renderer shape. Update fixtures/tests first, then update `static-demo-data.js` and any label mapping needed for public text.

**Tech Stack:** Node 22, pnpm, node:test, Vite web app.

---

## Chunk 1: Swarm roster data and tests

### Task 1: Update tests for public swarm roster

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/content.test.mjs`

- [ ] Write failing tests asserting the Helixa Swarm card shows five members and the roster names/roles: Bendr 2.0, Quigbot, Helixa, Phantom Relay, Nox.
- [ ] Update tests so default public/demo UI text does not mention internal/test identities.
- [ ] Run focused tests and confirm they fail before implementation.

### Task 2: Update static demo data

**Files:**
- Modify: `apps/web/src/static-demo-data.js`
- Modify if needed: `apps/web/src/content.js`

- [ ] Remove internal/test identity public card/fragments from demo data.
- [ ] Update Helixa Swarm `members` to 5.
- [ ] Replace roster with the approved five-agent public roster and roles.
- [ ] Update swarm fragment public copy to name the approved public roster.
- [ ] Keep custody/permission/transfer text display-only and avoid implying execution, mutation, private access, or custody transfer.
- [ ] Run focused tests and confirm they pass.

### Task 3: Full verification and deploy

**Files:**
- Build output only.

- [ ] Run `pnpm test`.
- [ ] Run `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`.
- [ ] Run `git diff --check`.
- [ ] Commit implementation.
- [ ] Deploy to `/var/www/helixa.xyz/multipass/` with rsync if verification passes.
- [ ] Smoke-check the live Multipass page for the Helixa Swarm roster.

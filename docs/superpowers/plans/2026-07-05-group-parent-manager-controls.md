# Group Parent Manager Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let saved swarm/collection parent Multipass records use the existing safe manager claim/edit controls with group-specific copy and tests.

**Architecture:** Reuse the existing saved-record claim/session/profile/fragment/tool APIs. Add tests proving group parent records can be claimed and safely edited while imported roster/policy/Cred fragments stay read-only unless manager-owned. Update web copy/rendering so group routes show a group-aware Owner Command Center instead of agent-only management language.

**Tech Stack:** Node test runner, React-free DOM rendering in `apps/web/src/app.js`, Multipass API route tests in `apps/api/test/api-routes.test.mjs`, SQLite saved-record store.

---

## Files

- Modify: `apps/api/test/api-routes.test.mjs` - add group saved-record claim/session/edit regression coverage.
- Modify: `apps/web/test/app.test.mjs` - add group parent Owner Command Center UI coverage.
- Modify: `apps/web/src/app.js` - adjust Owner Command Center labels/copy for group parent profiles without changing backend trust semantics.
- Optional modify: `apps/api/src/index.js` or `apps/api/src/saved-records.js` only if API test exposes a real group-record gap.

## Chunk 1: API regression coverage

### Task 1: Prove group parent claims use existing manager session safely

- [ ] **Step 1: Write failing test**
  - In `apps/api/test/api-routes.test.mjs`, create/save a group activation record through the existing group route, request manual review for the saved group slug, approve it with admin secret, verify an approved manager session can update safe public profile fields, and assert imported roster fragments remain read-only.
  - Expected assertions:
    - claim status becomes `claim_pending`, then `claimed_review_approved`.
    - manager session cookie + CSRF enables `PATCH /api/multipass/:group/profile` for display/summary/avatar/tags only.
    - `PATCH /api/multipass/:group/fragments/:importedRosterId` returns forbidden/read-only.
    - response copy does not contain custody/tool/credential/payment overclaims.

- [ ] **Step 2: Run the focused API test red**
  - Run: `node --test apps/api/test/api-routes.test.mjs --test-name-pattern "group parent manager"`
  - Expected: fail only on missing behavior/copy if there is a real gap.

- [ ] **Step 3: Implement minimal backend fix if needed**
  - Prefer no backend changes if generic saved-record code already handles groups.
  - If needed, adjust only the narrow route/store guard exposed by the test.

- [ ] **Step 4: Run focused API test green**
  - Run: `node --test apps/api/test/api-routes.test.mjs --test-name-pattern "group parent manager"`
  - Expected: pass.

## Chunk 2: Web group Owner Command Center

### Task 2: Group-specific management UI

- [ ] **Step 1: Write failing web test**
  - In `apps/web/test/app.test.mjs`, load `https://helixa.xyz/multipass/helixa-collection-9c41a2?api=https://api.example.test` using `savedGroupProfileFetch`.
  - Assert the management drawer contains one `.claim-management-panel` / Owner Command Center.
  - Assert copy says parent/group metadata controls, roster/policy/public proof, and source-owner or manual review.
  - Assert copy does not say `public agent profile` and does not include forbidden overclaim language.

- [ ] **Step 2: Run focused web test red**
  - Run: `node --test apps/web/test/app.test.mjs --test-name-pattern "group parent owner command"`
  - Expected: fail on generic agent/saved-profile management copy if not already compliant.

- [ ] **Step 3: Implement minimal UI copy branching**
  - In `apps/web/src/app.js`, teach `renderClaimManagementPanel`, `getOwnerCommandNextAction`, and the edit-form helper text to derive `subject_type`.
  - For `swarm`/`collection`, say `parent Multipass`, `group metadata`, `roster/policy/public proof fragments`, and keep the same safety denial language.
  - Do not add new write capabilities.

- [ ] **Step 4: Run focused web test green**
  - Run: `node --test apps/web/test/app.test.mjs --test-name-pattern "group parent owner command"`
  - Expected: pass.

## Chunk 3: Verification and deploy

### Task 3: Full gates and live smoke

- [ ] **Step 1: Run focused existing claim/group suites**
  - Run: `node --test apps/api/test/api-routes.test.mjs --test-name-pattern "claim|manager|group"`
  - Run: `node --test apps/web/test/app.test.mjs --test-name-pattern "claim|manager|group|Owner Command"`

- [ ] **Step 2: Run full repo tests**
  - Run: `pnpm test`
  - Expected: all pass.

- [ ] **Step 3: Build web**
  - Run: `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
  - Expected: production bundle builds.

- [ ] **Step 4: Static diff hygiene**
  - Run: `git diff --check`
  - Expected: no whitespace errors.

- [ ] **Step 5: Commit**
  - Run: `git add apps/api/test/api-routes.test.mjs apps/web/test/app.test.mjs apps/web/src/app.js docs/superpowers/plans/2026-07-05-group-parent-manager-controls.md`
  - Run: `git commit -m "Add group parent manager controls"`

- [ ] **Step 6: Deploy**
  - Restart `multipass-api.service` only if API code changed.
  - Rebuild and rsync web bundle to `/var/www/helixa.xyz/multipass/` if web code changed.

- [ ] **Step 7: Smoke live Helixa Swarm**
  - Fetch `https://helixa.xyz/multipass-api/api/multipass/helixa-swarm-6a1ea1c2`.
  - Fetch `https://helixa.xyz/multipass-api/api/multipass/helixa-swarm-6a1ea1c2/fragments`.
  - Fetch `https://helixa.xyz/multipass/helixa-swarm-6a1ea1c2`.
  - Verify no forbidden copy: custody transfer, private credential access, executes tools, payment-based trust, authority over members.

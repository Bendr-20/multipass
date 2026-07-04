# Multipass Owner Command Center V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn the saved Multipass profile experience into a real owner-facing product layer with a unified command center, smoother activation preview, public agent gallery, and safer import wizard.

**Architecture:** Keep this as a frontend-first product slice on the existing saved Multipass APIs. Add small, testable rendering helpers instead of expanding `app.js` further where practical, and preserve all safety boundaries: no tool execution, no custody transfer, no credential release, no paid x402 calls, and no public posting.

**Tech Stack:** Vanilla ESM JavaScript, Node test runner, JSDOM, Vite build, existing Multipass API/client helpers.

---

## Chunk 1: Owner Command Center Snapshot

**Files:**
- Create: `apps/web/src/command-center.js`
- Create: `apps/web/test/command-center.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`

### Task 1: Command center snapshot helper

- [x] **Step 1: Write the failing test**

Create `apps/web/test/command-center.test.mjs` with tests for:
- `createOwnerCommandCenterSnapshot(data, state)` counts public tools, x402 tools, public routes, receipts/change entries, and active warnings.
- Private/gated/hidden tools and routes are ignored.
- Output labels stay safety-scoped and never imply tool execution, custody transfer, credentials, paid settlement, or ownership transfer.

- [x] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/command-center.test.mjs
```

Expected: FAIL because `apps/web/src/command-center.js` does not exist yet.

- [x] **Step 3: Implement minimal helper and renderer**

Create `apps/web/src/command-center.js` exporting:
- `createOwnerCommandCenterSnapshot(data = {}, state = {})`
- `renderOwnerCommandCenterSnapshot(snapshot = {})`

The renderer should show:
- owner status and visibility
- public tools and x402 count
- public routes count
- recent receipts/change count
- next best action
- safety note: display/discovery controls only

- [x] **Step 4: Verify GREEN**

Run:

```bash
node --test apps/web/test/command-center.test.mjs
```

Expected: PASS.

### Task 2: Integrate snapshot into saved profile owner panel

- [x] **Step 1: Write failing app test**

Add/extend `apps/web/test/app.test.mjs` to assert direct saved slug route renders:
- `.owner-command-metrics`
- `Public tools`
- `x402 cards`
- `Public routes`
- `Recent receipts`
- safety copy without overclaims

- [x] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "owner command center"
```

Expected: FAIL because the metrics panel is not rendered yet.

- [x] **Step 3: Integrate**

Import the new helper/renderer in `apps/web/src/app.js` and replace the narrow `renderOwnerDashboardPanel` contents with the richer snapshot plus existing recent change details as needed.

- [x] **Step 4: Verify GREEN**

Run the same app test command. Expected: PASS.

---

## Chunk 2: Smoother Activate-any-agent Flow

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/styles.css`

### Task 3: Activation preview card

- [x] **Step 1: Write failing test**

Add an app test for a loaded live agent preview before activation:
- renders `.activation-preview-panel`
- shows resolved AgentDNA ID/token ID
- shows a stable profile candidate/share path
- names what activation will create
- repeats that no custody, credentials, approvals, or authority change happens

- [x] **Step 2: Verify RED**

Run targeted app test and confirm failure due to missing preview panel.

- [x] **Step 3: Implement minimal preview renderer**

Add a small `renderActivationPreviewPanel(state, activationState)` in `app.js`, render it next to `renderSavePanel(state)` for live loaded unsaved profiles, and keep direct saved profiles from showing an activation preview.

- [x] **Step 4: Verify GREEN**

Run the targeted app test. Expected: PASS.

---

## Chunk 3: Public Agent Gallery

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/styles.css`

### Task 4: Gallery cards with product context

- [x] **Step 1: Write failing test**

Add an app test for product home:
- renders `.public-agent-gallery`
- each card links safely to `/multipass/?agent=<id>` when available
- cards show Cred, custody/source, proof summary, and open-profile action
- no stale Helixa profile routes or unsafe links render

- [x] **Step 2: Verify RED**

Run targeted app test and confirm failure due to missing gallery.

- [x] **Step 3: Implement gallery section**

Render a public gallery below the visual strip or system panel using `createAgentCarousel(data)`. Reuse existing safe route helpers and event binding through `data-action="resolve-home-profile"`.

- [x] **Step 4: Verify GREEN**

Run targeted app test. Expected: PASS.

---

## Chunk 4: Import Wizard Polish

**Files:**
- Modify: `apps/web/src/tool-manager.js`
- Modify: `apps/web/test/tool-manager.test.mjs`
- Modify: `apps/web/src/styles.css`

### Task 5: Safer import wizard shell

- [x] **Step 1: Write failing test**

Extend `apps/web/test/tool-manager.test.mjs` for editable tool registry:
- renders `.tool-import-wizard`
- shows step labels: Source, Metadata, Review
- Bankr x402 service is the active import source
- OpenSea manifest and Helixa API imports are visible as display-only/upcoming options, not executable buttons
- existing Bankr form still compacts to the same API input shape

- [x] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/tool-manager.test.mjs --test-name-pattern "import wizard"
```

Expected: FAIL because wizard markup is not present.

- [x] **Step 3: Implement minimal wizard markup**

Wrap the existing Bankr import form with a wizard shell, add read-only source options, and keep the existing `data-action="import-bankr-tool"` form behavior unchanged.

- [x] **Step 4: Verify GREEN**

Run targeted tool-manager test. Expected: PASS.

---

## Chunk 5: Full Verification and Commit

**Files:**
- Modify: source/tests above only
- Leave untracked announcement/planning drafts out of commit unless intentionally requested

### Task 6: Verification

- [x] Run focused tests:

```bash
node --test apps/web/test/command-center.test.mjs apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs
```

- [x] Run full suite:

```bash
pnpm test
```

- [x] Run build:

```bash
MULTIPASS_BASE=/multipass/ pnpm web:build
```

- [x] Check whitespace:

```bash
git diff --check
```

- [x] Check risky wording:

```bash
grep -RInE "execute tool|access granted|credentials released|buy trust|trust purchased|custody transferred|transfer ownership|grant permissions" apps/web/src apps/web/test apps/api/src apps/api/test packages docs || true
```

### Task 7: Commit

- [x] Review diff:

```bash
git status --short
git diff -- apps/web/src apps/web/test docs/superpowers/plans/2026-07-04-multipass-owner-command-center-v2.md
```

- [x] Commit only this branch work:

```bash
git add apps/web/src/command-center.js apps/web/src/app.js apps/web/src/tool-manager.js apps/web/src/styles.css apps/web/test/command-center.test.mjs apps/web/test/app.test.mjs apps/web/test/tool-manager.test.mjs docs/superpowers/plans/2026-07-04-multipass-owner-command-center-v2.md
git commit -m "Build Multipass owner command center v2"
```

Do not deploy in this branch without explicit approval.

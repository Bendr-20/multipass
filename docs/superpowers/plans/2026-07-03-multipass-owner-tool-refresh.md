# Multipass Owner Tool Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only Multipass Tool Registry refresh action that checks public-safe discovery metadata without calling or paying for tools.

**Architecture:** Add a focused API refresh helper that updates existing `tool_manifest` fragments, expose it through a tool-scoped manager-session POST route, then wire the web Tool Registry panel with refresh controls and state merging. Keep the action area generic so future add/edit/remove actions can reuse the same card controls and API route family.

**Tech Stack:** Node.js ESM, Multipass saved-record store, native fetch, React-free DOM rendering modules, node:test, Vite build.

---

## File Structure

- Create: `apps/api/src/tool-refresh.js`
  - Pure refresh behavior for one tool fragment. Validates public HTTPS URLs, probes endpoint/manifest with bounded fetch, maps outcomes to `verified`/`stale`/`disputed`, and returns updated fragment plus summary.
- Create: `apps/api/test/tool-refresh.test.mjs`
  - Unit tests for 402 challenge success, 2xx success, timeout/failure stale behavior, and unsafe URL disputed behavior.
- Modify: `apps/api/src/saved-records.js`
  - Add `refreshTool(identifier, fragmentId, context)` method. Persist updated fragment, append change log/audit event, return profile/fragments/tools/agent card/x402 data as existing mutations do where available.
- Modify: `apps/api/src/index.js`
  - Add `POST /api/multipass/:id/tools/:fragmentId/refresh`; require manager session + CSRF; map errors safely.
- Modify: `apps/api/test/api-routes.test.mjs`
  - Add integration tests for auth requirement, successful Bankr 402 refresh, stale failure, unknown fragment, and public filtering unchanged.
- Modify: `apps/web/src/saved-multipass-api.js`
  - Add `refreshMultipassTool({ id, fragmentId, apiBase, csrfToken, fetchImpl })`.
- Modify: `apps/web/src/tool-manager.js`
  - Render owner-only action rows, bind refresh clicks, add refresh state merge helpers.
- Modify: `apps/web/src/app.js`
  - Wire refresh handler into existing claim API/state pattern.
- Modify: `apps/web/test/tool-manager.test.mjs`
  - Add UI/control and state merge tests.
- Modify: `apps/web/test/app.test.mjs` or `apps/web/test/saved-multipass-api.test.mjs`
  - Add API client and app handler coverage if existing tests make this cheap.

## Chunk 1: API refresh unit

### Task 1: Tool refresh helper

**Files:**
- Create: `apps/api/src/tool-refresh.js`
- Create: `apps/api/test/tool-refresh.test.mjs`

- [ ] **Step 1: Write failing tests for refresh outcome mapping**

Add tests covering:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshToolFragment } from '../src/tool-refresh.js';

function makeTool(overrides = {}, refOverrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: 'frag_tool_bankr_lookup',
    multipass_id: 'mp_test',
    fragment_type: 'tool_manifest',
    status: 'pending',
    assurance_level: 'issuer_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'registry_import', source_id: 'bankr_x402_cloud:lookup', issuer: 'bankr_x402_cloud', observed_at: '2026-07-03T00:00:00.000Z', reference_url: 'https://x402.example.test/lookup' },
    public_value: 'Lookup tool.',
    tool_manifest_ref: {
      tool_id: 'lookup',
      registry: 'bankr_x402_cloud',
      name: 'lookup',
      description: 'Lookup tool.',
      endpoint_url: 'https://x402.example.test/lookup',
      manifest_url: null,
      manifest_hash: null,
      creator_address: null,
      pricing: { model: 'fixed', amount: '0.01', asset: 'USDC', chain_id: 8453 },
      access: { summary: 'x402 access.', requires_owner_approval: false },
      schemas: { input_summary: 'id', output_summary: 'profile' },
      verifiability: { tier: 'provider_verified', summary: 'Imported.' },
      last_checked_at: '2026-07-03T00:00:00.000Z',
      ...refOverrides,
    },
    created_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

test('refreshToolFragment treats Bankr 402 challenge as verified reachability', async () => {
  const result = await refreshToolFragment(makeTool(), {
    now: '2026-07-03T03:30:00.000Z',
    fetchImpl: async () => new Response(JSON.stringify({ accepts: [{ network: 'eip155:8453', maxAmountRequired: '10000' }] }), { status: 402 }),
  });

  assert.equal(result.fragment.status, 'verified');
  assert.equal(result.fragment.tool_manifest_ref.last_checked_at, '2026-07-03T03:30:00.000Z');
  assert.match(result.refresh.summary, /reachable/i);
});
```

Also add tests for 2xx endpoint + manifest, 500 stale, timeout stale, and unsafe non-HTTPS URL disputed.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-api test -- tool-refresh
```

Expected: fail because `apps/api/src/tool-refresh.js` does not exist.

- [ ] **Step 3: Implement minimal helper**

Create `apps/api/src/tool-refresh.js` with:

- `refreshToolFragment(fragment, { fetchImpl = fetch, now = new Date().toISOString(), timeoutMs = 5000 } = {})`
- URL validation using `new URL()` and HTTPS-only.
- `probeUrl(url, { fetchImpl, timeoutMs })` that tries `HEAD`, falls back to `GET` on 405/501 or network method issues, and uses `AbortSignal.timeout(timeoutMs)` when available.
- `classifyProbe()` mapping:
  - 2xx -> reachable
  - 402 with JSON-ish challenge or any 402 from `bankr_x402_cloud` -> reachable
  - timeout/network/4xx/5xx -> stale
- public-safe summaries capped to about 180 chars.
- preserve all descriptive fields; only update status, `updated_at`, `source.observed_at`, and `tool_manifest_ref.last_checked_at`.

- [ ] **Step 4: Run unit tests**

Run:

```bash
node --test apps/api/test/tool-refresh.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit API helper**

```bash
git add apps/api/src/tool-refresh.js apps/api/test/tool-refresh.test.mjs
git commit -m "Add Multipass tool refresh helper"
```

## Chunk 2: Saved-record mutation and API route

### Task 2: Persist refreshed tool fragments

**Files:**
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Write failing integration tests**

Add tests near the existing `manager session imports Bankr service configs into tools x402 and agent card` test:

- Missing manager session on `POST /api/multipass/bendr-2-1/tools/frag_tool_bankr_lookup/refresh` returns 401/403.
- Valid session + fake fetch 402 updates tool status to `verified` and `last_checked_at`.
- Failed fake fetch keeps the tool and marks `stale`.
- Unknown fragment returns 404.
- Non-tool fragment returns 404 or invalid request without modifying records.

Use existing helpers for sessions, headers, and `createMultipassApi`. If `fetchImpl` is not injectable yet, plan to add it to `createMultipassApi` context for tool refresh only.

- [ ] **Step 2: Run failing route tests**

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "tool.*refresh|Bankr service"
```

Expected: fail because route/method does not exist.

- [ ] **Step 3: Add saved-record method**

In `apps/api/src/saved-records.js`:

- import `refreshToolFragment`.
- add `refreshTool(identifier, fragmentId, context = {})` to the saved-records API object.
- require saved profile and actor wallet.
- find fragment by `fragment_id`.
- require `fragment_type === 'tool_manifest'` and non-revoked active status.
- call `refreshToolFragment(fragment, { fetchImpl: context.fetchImpl, now })`.
- replace fragment in array and persist via `writeFragmentMutation`.
- change-log message: `Tool service refreshed: ${name}.`
- audit type: `tool_refreshed` with actor wallet, fragment ID, tool ID, registry, status.
- return `readToolImportResult(...)` plus `refresh` summary. If agent card/x402 return shape is cheap and already available, include it; otherwise keep existing mutation response shape consistent with import.

- [ ] **Step 4: Add API route**

In `apps/api/src/index.js`:

- route in `handlePostRequest` before `tools/import`:
  `parts[2] && parts[3] === 'tools' && parts[4] && parts[5] === 'refresh' && parts.length === 6`
- implement `handleRefreshTool(request, identifier, fragmentId, context)`.
- require manager session exactly like imports.
- call `context.savedRecords.refreshTool(profile.multipass_id, fragmentId, { actorWallet: session.manager_wallet, fetchImpl: context.fetchImpl })`.
- return JSON `{ schema_version: '0.1.0', ...refreshed }`.
- map errors using `mapToolMutationError` or extend `mapToolImportError`.

- [ ] **Step 5: Run route tests**

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "tool.*refresh|Bankr service"
```

Expected: pass.

- [ ] **Step 6: Commit API route**

```bash
git add apps/api/src/index.js apps/api/src/saved-records.js apps/api/test/api-routes.test.mjs
git commit -m "Add Multipass tool refresh route"
```

## Chunk 3: Web API client and Tool Registry UI

### Task 3: Owner-only refresh controls

**Files:**
- Modify: `apps/web/src/saved-multipass-api.js`
- Modify: `apps/web/src/tool-manager.js`
- Modify: `apps/web/test/tool-manager.test.mjs`
- Modify: `apps/web/test/saved-multipass-api.test.mjs`

- [ ] **Step 1: Write failing frontend tests**

Add tests that assert:

- `renderToolRegistryManagerPanel(state, { canEdit: true })` renders `Refresh status` for public tool cards.
- `renderPublicToolsPanel(data)` does not render `Refresh status`.
- `bindToolManager` calls `handlers.refreshTool` with the clicked form/button event or fragment ID.
- `mergeToolRefreshState(current, result, patch)` updates `data.fragments`, `data.tools`, and status fields.
- `refreshMultipassTool` POSTs to `/api/multipass/:id/tools/:fragmentId/refresh` with CSRF.

- [ ] **Step 2: Run failing frontend tests**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs
```

Expected: fail because refresh functions/controls do not exist.

- [ ] **Step 3: Implement API client**

In `apps/web/src/saved-multipass-api.js` add:

```js
export async function refreshMultipassTool({ id, fragmentId, apiBase, csrfToken, fetchImpl = fetch } = {}) {
  const safeId = requireMultipassIdentifier(id);
  const safeFragmentId = requireFragmentIdentifier(fragmentId);
  return requestSavedJson({
    apiBase,
    path: `/api/multipass/${encodeURIComponent(safeId)}/tools/${encodeURIComponent(safeFragmentId)}/refresh`,
    method: 'POST',
    body: {},
    csrfToken,
    fetchImpl,
    errorPrefix: 'Tool refresh failed',
  });
}
```

- [ ] **Step 4: Implement UI controls**

In `apps/web/src/tool-manager.js`:

- export `mergeToolRefreshState`.
- update `TOOL_STATUS_MESSAGES` with `tool_refreshed`.
- add action row to each managed card when `canEdit` is true.
- action uses `data-action="refresh-tool"` and `data-fragment-id="..."`.
- disable button when `state.toolStatus === 'refreshing_tool' && state.toolActiveFragmentId === fragmentId`.
- keep public card renderer unchanged or add a wrapper so public output never gets owner controls.

- [ ] **Step 5: Run frontend tests**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs
```

Expected: pass.

- [ ] **Step 6: Commit web client/UI**

```bash
git add apps/web/src/saved-multipass-api.js apps/web/src/tool-manager.js apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs
git commit -m "Add Multipass tool refresh controls"
```

## Chunk 4: App wiring and full verification

### Task 4: Wire refresh into app state

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs` if coverage is practical.

- [ ] **Step 1: Write failing app wiring test**

Add or extend an app test to prove clicking refresh calls `claimApi.refreshMultipassTool` and updates state on success. If app test setup is too heavy, cover the handler through exported helpers and rely on `tool-manager.test.mjs` for DOM binding.

- [ ] **Step 2: Run failing app test**

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "tool.*refresh"
```

Expected: fail until handler is wired.

- [ ] **Step 3: Wire app handler**

In `apps/web/src/app.js`:

- import `refreshMultipassTool` and `mergeToolRefreshState`.
- add `refreshToolMetadata(eventOrFragmentId)` near `importBankrToolMetadata`.
- determine fragment ID from `event.currentTarget.dataset.fragmentId` or submitted element.
- require saved ID and `claimCsrfToken` like import.
- set `toolStatus: 'refreshing_tool'`, `toolActiveFragmentId: fragmentId`, clear `toolError`.
- call `claimApi.refreshMultipassTool`.
- merge result with `mergeToolRefreshState` and set `toolStatus: 'tool_refreshed'`.
- on error, set `toolStatus: 'error'`, safe error message, preserve active fragment ID.
- add handler to `handlers` object and `bindToolManager` call.
- update `clearedRouteState` or equivalent cleared tool state only if needed.

- [ ] **Step 4: Run app tests**

```bash
node --test apps/web/test/app.test.mjs apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs
```

Expected: pass.

- [ ] **Step 5: Full verification**

Run:

```bash
pnpm test
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: all tests pass and web build succeeds.

- [ ] **Step 6: Commit app wiring**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "Wire Multipass tool refresh actions"
```

## Chunk 5: Deploy readiness only

### Task 5: Final review and deploy gate

**Files:**
- Modify: `docs/live-status.md` only if the feature is deployed.
- Modify: `docs/live-smoke-checklist.md` only if smoke steps need updating.

- [ ] **Step 1: Inspect final diff**

```bash
git status --short
git log --oneline -8
git diff origin/main...HEAD --stat
```

Expected: only spec/plan/tool-refresh feature files changed.

- [ ] **Step 2: Local smoke API route with test server if practical**

Use existing fixture server or API tests rather than live mutation if possible. Do not mutate live SQLite until deploy approval.

- [ ] **Step 3: Ask for deploy approval**

Do not deploy to `/var/www/helixa.xyz/multipass/` or restart `multipass-api.service` without explicit approval.

- [ ] **Step 4: After approval, deploy and smoke**

Commands will depend on current package scripts, but baseline gates are:

```bash
pnpm install --frozen-lockfile
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
# backup live dist and sqlite before copying/restarting
```

Smoke live:

```bash
curl -sS -o /tmp/multipass-tools.json -w '%{http_code}\n' https://helixa.xyz/api/multipass/bendr-2-1/tools
curl -sS -o /tmp/multipass-page.html -w '%{http_code}\n' https://helixa.xyz/multipass/bendr-2-1
```

Expected: 200 responses; owner refresh controls require an authenticated owner session and should not appear in public HTML/API.

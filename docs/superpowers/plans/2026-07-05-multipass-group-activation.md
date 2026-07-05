# Multipass Group Activation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable V0 flow that activates a public parent Multipass for a swarm or collection from existing Helixa AgentDNA member records.

**Architecture:** Add a focused API builder/router for group activation, persist the generated bundle through the existing saved-record store, then add a small web helper and homepage panel for preview/save. Keep group activation as public metadata only: no onchain writes, no wallet signing, no x402 payment calls, no tool execution, no custody transfer, and no private credential access.

**Tech Stack:** Node ESM, vanilla browser ESM, Node test runner, JSDOM, Vite, SQLite saved-record store, existing `@helixa/multipass-sdk` schema assertions.

---

## File Structure

- Create `apps/api/src/group-activation.js` - normalize group inputs, resolve members, build saved-record bundles, and map resolver errors.
- Create `apps/api/test/group-activation.test.mjs` - unit coverage for normalization, member resolution, record building, x401 output shape, IDs, duplicate policy, and errors.
- Modify `apps/api/src/index.js` - add `POST /api/multipass/groups/preview` and `POST /api/multipass/groups`, preserving existing route style and JSON error responses.
- Modify `apps/api/test/api-routes.test.mjs` - route-level preview/save/existing/x401 coverage.
- Create `apps/web/src/group-activation.js` - web-only payload normalization and render helpers for panel, preview, success, and error states.
- Create `apps/web/test/group-activation.test.mjs` - unit coverage for payload construction and render helpers.
- Modify `apps/web/src/saved-multipass-api.js` - add `previewGroupMultipass` and `saveGroupMultipass` client calls.
- Modify `apps/web/test/saved-multipass-api.test.mjs` - client call coverage.
- Modify `apps/web/src/app.js` - state wiring, event handlers, and homepage/profile integration only.
- Modify `apps/web/test/app.test.mjs` - integration tests for homepage panel, preview/save flows, safety copy, and saved group rendering.
- Modify `apps/web/src/styles.css` - minimal styles reusing existing panel/card patterns.
- Modify `apps/api/src/index.js` OpenAPI/docs helpers for `/api/openapi.json`; add other API docs only if grep shows they are manually maintained in this repo.

---

## Chunk 1: API Group Activation Builder

### Task 1: Red tests for API builder boundaries

**Files:**
- Create: `apps/api/test/group-activation.test.mjs`
- Create later: `apps/api/src/group-activation.js`

- [ ] **Step 1: Write failing normalization tests**

Add tests that import `normalizeGroupActivationInput` and assert:
- accepts `swarm` and `collection`
- rejects any other subject type with code `invalid_group_activation`
- trims display name, summary, and shared policy note
- enforces display name 3 to 120 chars, summary max 500 chars, shared policy note max 500 chars
- pins the public API request keys: `subject_type`, `display_name`, `summary`, `member_ids`, and `shared_policy_note`
- parses `member_ids` from arrays and from comma/newline strings, accepting `1` and `8453:1`
- rejects fewer than 2, more than 24, invalid IDs, token `0`, and duplicate normalized canonical IDs

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/api/test/group-activation.test.mjs --test-name-pattern "normalize"
```

Expected: FAIL because `apps/api/src/group-activation.js` does not exist.

- [ ] **Step 3: Implement minimal normalization**

Create `apps/api/src/group-activation.js` exporting:

```js
export class GroupActivationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'GroupActivationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeGroupActivationInput(input = {}) {
  // Read snake_case public API keys.
  // Return { subjectType, displayName, baseSlug, summary, sharedPolicyNote, members }
  // members: [{ tokenId: '1', canonicalId: '8453:1' }]
}
```

Use explicit constants: `MIN_MEMBERS = 2`, `MAX_MEMBERS = 24`, `DISPLAY_NAME_MAX = 120`, `SUMMARY_MAX = 500`, `POLICY_NOTE_MAX = 500`, `CHAIN_ID = 8453`.

- [ ] **Step 4: Verify GREEN**

Run the same command. Expected: PASS.

### Task 2: Red tests for member resolution and stable member summaries

**Files:**
- Modify: `apps/api/test/group-activation.test.mjs`
- Modify: `apps/api/src/group-activation.js`

- [ ] **Step 1: Write failing resolver tests**

Add fake activation records and assert `resolveGroupMembers(normalized, activationService)`:
- calls activation service with each normalized `tokenId` string in roster order, not client raw input and not canonical IDs
- returns `memberSummaries` with stable fields: `name`, `token_id`, `canonical_id`, `cred_score`, `cred_tier`, `source_status`, `profile_url`
- returns `source_status: resolved` for success
- preserves member order
- maps missing members to `group_member_not_found` status 404
- maps rate limits to `group_member_rate_limited` status 429
- maps unavailable resolver errors to `group_member_resolution_unavailable` status 503

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/api/test/group-activation.test.mjs --test-name-pattern "resolve"
```

Expected: FAIL because resolver exports are missing or incomplete.

- [ ] **Step 3: Implement resolver**

Export:

```js
export async function resolveGroupMembers(normalized, activationService) {
  // Resolve each normalized member with activationService(member.tokenId).
  // Return { records, memberSummaries }.
}
```

Do not return partial success for failed members. Throw `GroupActivationError` with the mapped code/status.

- [ ] **Step 4: Verify GREEN**

Run the same command. Expected: PASS.

### Task 3: Red tests for saved-record bundle generation

**Files:**
- Modify: `apps/api/test/group-activation.test.mjs`
- Modify: `apps/api/src/group-activation.js`

- [ ] **Step 1: Write failing builder tests**

Assert `buildGroupActivationRecord(normalized, resolved, { observedAt })`:
- returns `source.sourceType = multipass_group`
- computes fingerprint as first 8 lowercase hex chars of SHA-256 over `subjectType|baseSlug|canonicalId1,canonicalId2,...`
- produces `multipass_id = mp_group_<subject>_<fingerprint>` and `slug = <truncated-base-slug>-<fingerprint>` satisfying the existing slug schema
- same roster plus different base slug produces a different `multipass_id`
- wrapper fields are deterministic and persistence-ready: `source.sourceType`, `source.canonicalId`, `source.tokenId`, `sourceContext.activation`, `sourceContext.sourceSnapshot`, and `change`
- `source.canonicalId` includes subject type, base slug, and ordered member canonical IDs; `source.tokenId` is `null`
- `sourceContext.activation` includes `state: saved_unclaimed`, `origin: group_activation`, `originSource: multipass_group_builder`, `sourceType: multipass_group`, `canonicalId`, and `savedAt`
- `sourceContext.sourceSnapshot` includes subject type, display name, summary, shared policy note, fingerprint, and member summaries
- output is compatible with `createSqliteSavedRecords().saveActivatedRecord(record)`
- output passes `assertMultipassProfile`, `assertIdentityFragment`, `assertAgentCard`, `assertStandardsProfile`, `assertX401Manifest` after deriving x401, `assertX402Manifest`, and receipt assertions if receipts exist
- creates public roster, shared policy, aggregate Cred, standards, and x401 fragments
- x401 fragment has `status: pending`, `verification_ref.verification_type = x401_group_authority`, `verification_ref.result = inconclusive`, full `x401_proof_ref`, issuer `helixa`, requirement `group_authority`, claim types `delegated_authority` and `group_membership`, current headers, `required_before_payment: true`, and `private_credential_state = not_exposed`
- derived x401 manifest has `x401_supported: true`, trusted issuer `helixa`, proof requirement `group_authority`, and route policy requiring x401 before high-trust or paid action

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/api/test/group-activation.test.mjs --test-name-pattern "build"
```

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement builder and preview function**

Export:

```js
export function buildGroupActivationRecord(normalized, resolved, options = {}) {}
export async function createGroupActivationPreview(input, { activationService, observedAt } = {}) {}
```

Use SHA-256 hex fingerprint length 8; truncate base slug so `<base-slug>-<fingerprint>` is under the schema max. Build explicit profile/fragments/card/standards/source shapes from the spec before returning: roster custody fragment, shared policy endpoint fragment, aggregate Cred risk fragment, member standard_ref fragments, x401 verification_result fragment, approval-required group agent card, group standards profile, empty x402 manifest, empty receipts, and initial change entry. Use `assert*` functions before returning the bundle.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test apps/api/test/group-activation.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit API builder**

```bash
git add apps/api/src/group-activation.js apps/api/test/group-activation.test.mjs
git commit -m "Add Multipass group activation builder"
```

---

## Chunk 2: API Routes and Persistence

### Task 4: Red tests for group preview and save routes

**Files:**
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify later: `apps/api/src/index.js`

- [ ] **Step 1: Write failing route tests**

Add route tests using fake `activationService` and in-memory saved records:
- `POST /api/multipass/groups/preview` returns 200, `state: group_preview`, record bundle, and stable `members`
- validation error returns 400 with `{ schema_version, error: { code, message, details } }`
- unresolved member returns 404 `group_member_not_found`
- rate-limited member resolution returns 429 `group_member_rate_limited` through the route layer
- unavailable member resolution returns 503 `group_member_resolution_unavailable` through the route layer
- `POST /api/multipass/groups` ignores any client-supplied `record`, `preview`, `members`, `slug`, or `multipass_id` fields and rebuilds server-side from the public payload
- `POST /api/multipass/groups` returns 201, `state: saved_group_unclaimed`, `created: true`, `multipass_id`, `slug`, `sharePath`, and profile
- second save of same normalized payload returns 200, `state: saved_group_existing`, `created: false`, and the existing `multipass_id`
- unrelated existing slug collision retries once with `<base-slug>-<fingerprint>-group`
- second unrelated slug collision returns 409 `group_slug_conflict` as structured JSON instead of leaking SQLite uniqueness text
- saved group `/api/multipass/<slug>/x401` returns `x401_supported: true`, trusted issuer `helixa`, and requirement `group_authority`

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "group"
```

Expected: FAIL because routes do not exist.

### Task 5: Implement routes and save behavior

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Import group activation helpers**

Import `GroupActivationError` and `createGroupActivationPreview` in `apps/api/src/index.js`.

- [ ] **Step 2: Add route branches**

In `handlePostRequest`, before generic saved-record branches, add:
- `parts[2] === 'groups' && parts[3] === 'preview' && parts.length === 4`
- `parts[2] === 'groups' && parts.length === 3`

- [ ] **Step 3: Implement `handleGroupPreview`**

Read JSON, require `context.activationService`, call `createGroupActivationPreview`, return `{ schema_version: '0.1.0', state: 'group_preview', record, members }`.

- [ ] **Step 4: Implement `handleSaveGroupMultipass`**

Require both `context.activationService` and `context.savedRecords`, rebuild preview server-side, call `savedRecords.saveActivatedRecord(record)`, return 201 for created and 200 for existing with `saved_group_unclaimed` or `saved_group_existing`, always including `multipass_id`, `slug`, `profile`, and `sharePath`. Ignore client-supplied preview/record/member summary fields.

- [ ] **Step 5: Add error mapping**

Update request error handling so `GroupActivationError` maps to its status/code/details using existing `errorResponse` style, including route-level 429 and 503. Do not leak raw resolver or SQLite errors; slug collision failures become 409 `group_slug_conflict`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "group"
```

Expected: PASS.

- [ ] **Step 7: Focused API verification**

Run:

```bash
node --test apps/api/test/group-activation.test.mjs apps/api/test/api-routes.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit API routes**

```bash
git add apps/api/src/index.js apps/api/test/api-routes.test.mjs
git commit -m "Add Multipass group activation routes"
```

---

## Chunk 3: Web Client and UI

### Task 6: Red tests for web group activation helpers

**Files:**
- Create: `apps/web/test/group-activation.test.mjs`
- Create later: `apps/web/src/group-activation.js`

- [ ] **Step 1: Write failing helper tests**

Assert:
- `normalizeGroupMemberInput('1, 81\n1066')` returns `['1', '81', '1066']`
- `createGroupActivationPayload(new FormData(form))` returns `subject_type`, `display_name`, `summary`, `shared_policy_note`, and `member_ids`
- `renderGroupActivationPanel(state)` includes `Activate collection or swarm`, required fields for subject type, display name, summary, member IDs, shared policy note, action label `Preview group Multipass`, disabled/hidden save affordance until preview, safety copy, and no forbidden authority claims
- `renderGroupActivationPreview(preview)` renders proposed parent profile name, group type, member names, token IDs, Cred context, and safety copy
- `renderGroupActivationSuccess(result)` renders share path, a safe link to `/multipass/<slug>`, and unclaimed management copy
- `renderGroupActivationError(error)` handles structured API errors
- helper render output contains no emojis and does not introduce broad visual redesign copy

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/group-activation.test.mjs
```

Expected: FAIL because helper file is missing.

- [ ] **Step 3: Implement helper file**

Create `apps/web/src/group-activation.js` with only pure helpers. Reuse local `escapeHtml`/`escapeAttribute` helpers inside this file rather than importing from `app.js`.

- [ ] **Step 4: Verify GREEN**

Run the same command. Expected: PASS.

### Task 7: Client API calls

**Files:**
- Modify: `apps/web/src/saved-multipass-api.js`
- Modify: `apps/web/test/saved-multipass-api.test.mjs`

- [ ] **Step 1: Write failing client tests**

Assert `previewGroupMultipass(payload, { apiBase, fetchImpl })` posts JSON to `/api/multipass/groups/preview`, and `saveGroupMultipass` posts to `/api/multipass/groups`. Cover non-OK structured API errors.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/saved-multipass-api.test.mjs --test-name-pattern "group"
```

Expected: FAIL because exports are missing.

- [ ] **Step 3: Implement client exports**

Add functions that reuse the existing `SavedMultipassError` pattern and response handling.

- [ ] **Step 4: Verify GREEN**

Run the same command. Expected: PASS.

### Task 8: Homepage integration and saved group rendering

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing app tests**

Add tests that:
- homepage renders `Activate collection or swarm` with subject type, display name, summary, member IDs, shared policy note, `Preview group Multipass`, and `Activate group Multipass` labels
- submitting preview calls the client and renders proposed parent profile name plus member summaries
- structured API validation errors render as blocking user-facing errors
- reset action clears preview/result/error state back to idle without navigating
- save action calls save client and renders deterministic share path plus a safe link to `/multipass/<slug>`
- saved group profile route uses a fixture with `subject_type: swarm` or `collection` and roster fragments, then renders parent Multipass language and roster/member context, not agent-only copy
- safety wording scan does not imply custody transfer, tool execution, private credential access, payment execution, or payment-proves-trust

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "group activation"
```

Expected: FAIL until integration exists.

- [ ] **Step 3: Wire app state and events**

In `apps/web/src/app.js`:
- import group render helpers and client calls
- initialize `state.groupActivation = { status: 'idle', input: {}, preview: null, result: null, error: null }`
- render the panel near `renderLiveResolver`
- add event handlers for `data-action="preview-group-multipass"`, `data-action="save-group-multipass"`, and `data-action="reset-group-multipass"`
- render structured errors through `renderGroupActivationError` and preserve form input after failures
- render success with a safe same-site link to `/multipass/<slug>` only when slug passes the same safe-path rules used elsewhere
- keep saved group route rendering based on `profile.subject_type` and member/roster fragments

- [ ] **Step 4: Add minimal CSS**

Use existing panel/card class patterns. Avoid broad redesign.

- [ ] **Step 5: Verify GREEN**

Run the same app test command. Expected: PASS.

- [ ] **Step 6: Focused web verification**

Run:

```bash
node --test apps/web/test/group-activation.test.mjs apps/web/test/saved-multipass-api.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit web UI**

```bash
git add apps/web/src/group-activation.js apps/web/test/group-activation.test.mjs apps/web/src/saved-multipass-api.js apps/web/test/saved-multipass-api.test.mjs apps/web/src/app.js apps/web/test/app.test.mjs apps/web/src/styles.css
git commit -m "Add Multipass group activation UI"
```

---

## Chunk 4: Docs, Full Verification, Deploy

### Task 9: Docs and OpenAPI alignment

**Files:**
- Modify: `apps/api/src/index.js` for manual `/api/openapi.json` route docs
- Inspect/modify only if needed: `apps/api/README.md`, `docs/live-status.md`, `docs/live-smoke-checklist.md`, other static docs files found by grep

- [ ] **Step 1: Inspect current API docs source**

Run:

```bash
grep -R "api/multipass.*openapi\|groups/preview\|x401" -n apps/api docs packages | sed -n '1,220p'
```

Expected: identify whether route docs are manual/static.

- [ ] **Step 2: Add docs only where maintained manually**

Add `POST /api/multipass/groups/preview` and `POST /api/multipass/groups` to the manual OpenAPI object in `apps/api/src/index.js`. If other docs are manual, add concise group activation route docs, safety boundaries, and smoke steps. Do not invent generated docs.

- [ ] **Step 3: Commit docs if changed**

```bash
git add <changed-doc-files>
git commit -m "Document Multipass group activation routes"
```

Skip commit if no docs changed.

- [ ] **Step 4: Verify OpenAPI/docs include group routes**

Run:

```bash
node -e "import('./apps/api/src/index.js').then(() => console.log('index imports'))"
grep -n "groups/preview\|/api/multipass/groups" apps/api/src/index.js docs/live-smoke-checklist.md docs/live-status.md apps/api/README.md 2>/dev/null | sed -n '1,120p'
```

Expected: `apps/api/src/index.js` contains both `POST /api/multipass/groups/preview` and `POST /api/multipass/groups` in the OpenAPI route map.

### Task 10: Full verification

**Files:** all changed files

- [ ] **Step 1: Run diff check**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 2: Run focused tests**

```bash
node --test apps/api/test/group-activation.test.mjs apps/api/test/api-routes.test.mjs apps/web/test/group-activation.test.mjs apps/web/test/saved-multipass-api.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run production web build**

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: PASS with only existing Privy/Rollup warnings.

- [ ] **Step 5: Run forbidden wording scan**

```bash
grep -RIn "transfers custody\|executes tools\|releases credentials\|payment proves trust\|buys trust" apps/api/src apps/web/src docs | sed -n '1,120p'
```

Expected: no unsafe affirmative claims. Negated safety copy is okay if context is clear.

### Task 11: Review before deploy

**Files:** changed source/tests/docs

- [ ] **Step 1: Request code review**

Dispatch a code-review subagent with the spec path, plan path, and changed file list. Ask it to verify safety boundaries, schema validity, route behavior, saved group rendering, x401 output, and tests.

- [ ] **Step 2: Fix review findings**

If issues are found, patch and re-review until clear or explain disagreement.

- [ ] **Step 3: Commit fixes**

Commit any review fixes separately.

- [ ] **Step 4: Rerun full verification after review fixes**

Repeat Task 10 completely after the final review fix commit: `git diff --check`, focused tests, `pnpm test`, production web build, and wording scan. Do not deploy on pre-review verification if any review fix changed source, tests, docs, or build output.

### Task 12: Deploy after verification

**Files:** live deploy target `/var/www/helixa.xyz/multipass`, API service `multipass-api.service`

- [ ] **Step 1: Confirm deploy approval is covered**

User already asked `get it done`; treat this as approval for this Multipass public site/API change. Do not move funds or perform onchain writes.

- [ ] **Step 2: Back up live web**

```bash
backup="/home/ubuntu/backups/helixa-multipass-group-activation-$(date -u +%Y%m%dT%H%M%SZ).tgz"
tar -C /var/www/helixa.xyz -czf "$backup" multipass
printf '%s\n' "$backup"
```

Expected: backup path printed.

- [ ] **Step 3: Deploy web dist**

```bash
rsync -a --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: no rsync errors.

- [ ] **Step 4: Restart API service**

```bash
sudo systemctl restart multipass-api.service
sudo systemctl is-active multipass-api.service
```

Expected: `active`.

- [ ] **Step 5: Live smoke checks**

Run read-only smoke checks:

```bash
curl -fsS https://helixa.xyz/multipass/ >/tmp/multipass-home.html
grep -q "Activate collection or swarm" /tmp/multipass-home.html
curl -fsS https://helixa.xyz/multipass/bendr-2-1 >/dev/null
curl -fsS https://helixa.xyz/multipass/swarm/helixa >/dev/null
curl -fsS https://helixa.xyz/api/multipass/bendr-2-1/x401 >/dev/null
curl -fsS https://helixa.xyz/api/openapi.json | grep -q "/api/multipass/groups/preview"
curl -fsS https://helixa.xyz/api/openapi.json | grep -q "/api/multipass/groups"
```

Expected: all commands exit 0. If static HTML does not include client-rendered text, verify the live JS asset contains group activation copy instead. Use `https://helixa.xyz/api/...` as the canonical live API path.

- [ ] **Step 6: Final push and update**

```bash
git status --short
git push
```

Expected: changed commits pushed; only intentionally untracked docs remain. Then give a terse completion update with verification evidence and live route.

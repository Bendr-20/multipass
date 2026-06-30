# Multipass Profile Routes Manager Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish claimed profile editing and add a safe public routes manager backed by endpoint fragments.

**Architecture:** Keep profile edits on the existing manager-session `PATCH /api/multipass/:id/profile` path. Treat routes as manager-created `endpoint` identity fragments, with `endpoint_ref.url` as the canonical route URL and API convenience `reference_url` persisted only as `source.reference_url`. Add focused web route-manager helpers instead of bloating the generic fragment manager.

**Tech Stack:** Node 22, `node:test`, SQLite saved-record store, vanilla JS web app, Vite static build.

---

## File Structure

- Modify: `apps/api/src/saved-records.js`
  - Server-side public profile change labels.
  - Endpoint route duplicate-ID validation.
  - Route-friendly change-log messages.
  - Endpoint route `reference_url` mirroring into `source.reference_url` only.
- Modify: `apps/api/test/claim-manage.test.mjs`
  - Store-level red/green coverage for profile image labels and endpoint route rules.
- Create: `apps/web/src/route-manager.js`
  - Public route extraction, sorting, labels, route ID generation, route card rendering, claimed-manager route forms, form compaction, event binding.
- Create: `apps/web/test/route-manager.test.mjs`
  - Unit tests for route manager rendering, ordering, ID collision behavior, 80-char truncation, form compaction, and event binding.
- Modify: `apps/web/src/fragment-manager.js`
  - Keep generic proof manager for wallet/social/standard/attestation only.
  - Remove endpoint-specific create/edit UI from this generic surface.
- Modify: `apps/web/test/fragment-manager.test.mjs`
  - Update generic fragment manager tests after endpoint UI moves to route manager.
- Modify: `apps/web/src/app.js`
  - Import route manager helpers.
  - Render public route cards on profile pages.
  - Render route manager inside claimed saved-profile management.
  - Bind route manager create/update/revoke events to existing fragment mutation handlers.
  - Polish profile editor copy: `Profile image URL` plus safety helper.
- Modify: `apps/web/test/app.test.mjs`
  - Integration coverage for claimed editor polish, public routes panel, route mutation flow, and no executable/control wording.
- Modify: `apps/web/src/styles.css`
  - Route cards and route manager layout.
- Modify: `apps/web/test/wording.test.mjs`
  - Extend blocked-copy coverage if new route copy requires it.

---

## Chunk 1: Server profile labels and endpoint route rules

### Task 1: Make public profile change logs user-facing

**Files:**
- Modify: `apps/api/test/claim-manage.test.mjs`
- Modify: `apps/api/src/saved-records.js`

- [x] **Step 1: Write the failing store test**

Add or update `manager public profile edits are allowlisted and logged` in `apps/api/test/claim-manage.test.mjs` so it asserts profile-image wording:

```js
assert.match(
  store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message,
  /Public profile updated: display name, summary, profile image, tags\./,
);
```

Also add a single-field case and HTTPS-only profile image validation:

```js
store.updatePublicProfile('bendr-2-1', {
  avatar_url: 'https://assets.example.test/bendr-v2.png',
}, { actorWallet: OWNER, now: '2026-06-27T00:07:00.000Z' });
assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Public profile updated: profile image\./);

const cleared = store.updatePublicProfile('bendr-2-1', {
  avatar_url: '',
}, { actorWallet: OWNER, now: '2026-06-27T00:08:00.000Z' });
assert.equal(cleared.profile.discovery_profile.avatar_url, null);

assert.throws(
  () => store.updatePublicProfile('bendr-2-1', {
    avatar_url: 'http://assets.example.test/not-safe.png',
  }, { actorWallet: OWNER, now: '2026-06-27T00:09:00.000Z' }),
  /avatar_url|profile image|https/i,
);
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test apps/api/test/claim-manage.test.mjs --test-name-pattern "public profile edits"
```

Expected: FAIL because change-log messages still use internal names like `display_name` and `avatar_url`, and profile image URL validation still accepts non-HTTPS URLs if the current code uses generic URL parsing.

- [x] **Step 3: Implement field label formatting**

In `apps/api/src/saved-records.js`, keep `avatar_url` normalized to either `null` or a safe HTTPS URL. If the existing code uses generic URL parsing, change the `avatar_url` branch in `normalizePublicProfileEdits()` so `null`/empty string clears the image and any non-empty value must pass HTTPS-only validation.

Then add a small helper near `normalizePublicProfileEdits()`:

```js
const PUBLIC_PROFILE_FIELD_LABELS = new Map([
  ['display_name', 'display name'],
  ['summary', 'summary'],
  ['avatar_url', 'profile image'],
  ['tags', 'tags'],
  ['visibility', 'visibility'],
]);

function formatPublicProfileFieldList(fields) {
  return fields.map((field) => PUBLIC_PROFILE_FIELD_LABELS.get(field) ?? field).join(', ');
}
```

Change the `appendChangeLog()` call in `updatePublicProfile()` from:

```js
appendChangeLog(db, profile.multipass_id, `Public profile updated: ${changedFields.join(', ')}.`, now);
```

to:

```js
appendChangeLog(db, profile.multipass_id, `Public profile updated: ${formatPublicProfileFieldList(changedFields)}.`, now);
```

Keep `changedFields` returned from the API as internal field names.

- [x] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
node --test apps/api/test/claim-manage.test.mjs --test-name-pattern "public profile edits"
```

Expected: PASS.

### Task 2: Enforce endpoint route identity rules in the store

**Files:**
- Modify: `apps/api/test/claim-manage.test.mjs`
- Modify: `apps/api/src/saved-records.js`

- [x] **Step 1: Write failing endpoint route tests**

Add a new test named `manager endpoint routes use canonical endpoint url and route-safe constraints` in `apps/api/test/claim-manage.test.mjs`:

```js
function makeImportedEndpointFragment(overrides = {}) {
  return {
    schema_version: '0.1.0',
    fragment_id: overrides.fragment_id ?? 'frag_imported_endpoint_profile',
    multipass_id: overrides.multipass_id ?? 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'verified',
    assurance_level: 'platform_verified',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: {
      source_type: 'registry_import',
      source_id: 'helixa-api:endpoint:profile',
      issuer: 'Helixa',
      observed_at: NOW,
      reference_url: 'https://api.helixa.xyz/api/v2/agent/1',
    },
    public_value: 'Imported profile API route.',
    endpoint_ref: { endpoint_id: 'profile', url: 'https://api.helixa.xyz/api/v2/agent/1', protocol: 'api' },
    created_at: NOW,
    updated_at: NOW,
  };
}

test('manager endpoint routes use canonical endpoint url and route-safe constraints', () => {
  const store = makeStore();
  const created = store.createPublicFragment('bendr-2-1', {
    fragment_type: 'endpoint',
    public_value: 'Primary public profile',
    reference_url: 'https://ignored.example.test/proof',
    endpoint_ref: { endpoint_id: 'profile', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
  }, { actorWallet: OWNER, now: '2026-06-27T00:10:00.000Z' });

  assert.equal(created.fragment.endpoint_ref.url, 'https://helixa.xyz/multipass/bendr-2-1');
  assert.equal(created.fragment.source.reference_url, 'https://helixa.xyz/multipass/bendr-2-1');
  assert.equal(created.fragment.reference_url, undefined);
  assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Public route added: Primary public profile\./);

  const updated = store.updatePublicFragment('bendr-2-1', created.fragment.fragment_id, {
    public_value: 'Primary public route',
    reference_url: 'https://ignored.example.test/updated-proof',
    endpoint_ref: { endpoint_id: 'profile-main', url: 'https://helixa.xyz/multipass/bendr-2-1?route=main', protocol: 'web' },
  }, { actorWallet: OWNER, now: '2026-06-27T00:15:00.000Z' });

  assert.equal(updated.fragment.endpoint_ref.url, 'https://helixa.xyz/multipass/bendr-2-1?route=main');
  assert.equal(updated.fragment.source.reference_url, 'https://helixa.xyz/multipass/bendr-2-1?route=main');
  assert.equal(updated.fragment.reference_url, undefined);
  assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Public route updated: Primary public route\./);

  const revoked = store.revokePublicFragment('bendr-2-1', created.fragment.fragment_id, { actorWallet: OWNER, now: '2026-06-27T00:20:00.000Z' });
  assert.equal(revoked.fragment.status, 'revoked');
  assert.match(store.getChangeLog('mp_helixa_agent_1').entries.at(-1).message, /Public route revoked: Primary public route\./);

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Duplicate profile',
      endpoint_ref: { endpoint_id: 'profile-main', url: 'https://helixa.xyz/other', protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /endpoint ID|duplicate/i,
  );

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Missing endpoint URL',
      endpoint_ref: { endpoint_id: 'missing-url', protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /endpoint_ref\.url|https|required/i,
  );

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Null endpoint URL',
      endpoint_ref: { endpoint_id: 'null-url', url: null, protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /endpoint_ref\.url|https|required/i,
  );

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Unsafe endpoint URL',
      endpoint_ref: { endpoint_id: 'unsafe-url', url: 'http://helixa.xyz/not-safe', protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /endpoint_ref\.url|https/i,
  );

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Manager verified route',
      status: 'verified',
      endpoint_ref: { endpoint_id: 'manager-verified', url: 'https://helixa.xyz/multipass/bendr-2-1/verified', protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /status|verified|not allowed/i,
  );

  assert.throws(
    () => store.updatePublicFragment('bendr-2-1', created.fragment.fragment_id, { status: 'verified' }, { actorWallet: OWNER, now: NOW }),
    /status|verified|not allowed/i,
  );
});

test('manager endpoint route IDs cannot collide with imported endpoint routes', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord({ fragments: [makeImportedEndpointFragment()] }));

  assert.throws(
    () => store.createPublicFragment('bendr-2-1', {
      fragment_type: 'endpoint',
      public_value: 'Manager profile route',
      endpoint_ref: { endpoint_id: 'profile', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    }, { actorWallet: OWNER, now: NOW }),
    /endpoint ID|duplicate/i,
  );
});
```

- [x] **Step 2: Run the focused route test and confirm it fails**

Run:

```bash
node --test apps/api/test/claim-manage.test.mjs --test-name-pattern "endpoint routes"
```

Expected: FAIL because duplicate endpoint IDs are not rejected, missing/unsafe endpoint URLs may still be accepted, manager-created endpoint status may still accept `verified`, and endpoint change messages still say `Public fragment added: endpoint`.

- [x] **Step 3: Implement endpoint route helpers in `saved-records.js`**

Add helpers near the fragment mutation functions:

```js
function isEndpointFragment(fragment) {
  return fragment?.fragment_type === 'endpoint';
}

function assertEndpointRouteRef(fragment) {
  if (!isEndpointFragment(fragment)) return;
  if (!fragment.endpoint_ref?.endpoint_id) throw new TypeError('endpoint_ref.endpoint_id is required for endpoint routes.');
  if (!fragment.endpoint_ref?.url) throw new TypeError('endpoint_ref.url is required for endpoint routes.');
  parseHttpsUrl(fragment.endpoint_ref.url, 'endpoint_ref.url');
}

function assertUniqueEndpointId(fragments, candidate, currentFragmentId = null) {
  if (!isEndpointFragment(candidate)) return;
  assertEndpointRouteRef(candidate);
  const candidateId = candidate.endpoint_ref.endpoint_id;
  const collision = fragments.find((fragment) => (
    fragment.fragment_id !== currentFragmentId
    && fragment.fragment_type === 'endpoint'
    && fragment.endpoint_ref?.endpoint_id === candidateId
  ));
  if (collision) throw new TypeError(`endpoint_ref.endpoint_id duplicates an existing endpoint route: ${candidateId}`);
}

function mirrorEndpointReferenceUrl(fragment) {
  if (!isEndpointFragment(fragment)) return fragment;
  return {
    ...fragment,
    source: {
      ...fragment.source,
      reference_url: fragment.endpoint_ref.url,
    },
  };
}

function routeChangeLabel(fragment) {
  if (fragment?.fragment_type !== 'endpoint') return fragment?.fragment_type ?? 'fragment';
  return fragment.public_value ?? fragment.endpoint_ref?.endpoint_id ?? 'route';
}

function fragmentChangeMessage(action, fragment) {
  if (fragment?.fragment_type === 'endpoint') return `Public route ${action}: ${routeChangeLabel(fragment)}.`;
  return `Public fragment ${action}: ${fragment.fragment_type}.`;
}
```

Use `assertEndpointRouteRef()` and `mirrorEndpointReferenceUrl()` after `normalizeManagerFragmentInput()` and `normalizeManagerFragmentPatch()` for endpoint fragments, so every endpoint route has a canonical HTTPS `endpoint_ref.url`. Use `assertUniqueEndpointId()`:

- before create, against the existing bundle fragments,
- before update, against all bundle fragments excluding the current fragment ID.

Use `fragmentChangeMessage('added'|'updated'|'revoked', fragment)` for change-log messages. For revoke, build the message from the revoked endpoint fragment after status update so the route label still comes from `public_value`.

Do not persist any top-level `reference_url` field.

- [x] **Step 4: Run focused API/store tests**

Run:

```bash
node --test apps/api/test/claim-manage.test.mjs --test-name-pattern "endpoint routes|fragment mutations|public profile edits"
```

Expected: PASS.

- [x] **Step 5: Run all API tests**

Run:

```bash
node --test apps/api/test/*.test.mjs
```

Expected: PASS.

- [x] **Step 6: Commit Chunk 1**

```bash
git add apps/api/src/saved-records.js apps/api/test/claim-manage.test.mjs
git commit -m "Harden Multipass public route fragments"
```

---

## Chunk 2: Web route manager helpers and profile editor polish

### Task 3: Add route manager unit helpers and tests

**Files:**
- Create: `apps/web/src/route-manager.js`
- Create: `apps/web/test/route-manager.test.mjs`

- [x] **Step 1: Write failing route-manager tests**

Create `apps/web/test/route-manager.test.mjs` with tests for:

```js
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  bindRouteManager,
  compactRouteInput,
  compactRoutePatch,
  createUniqueRouteId,
  getPublicRouteFragments,
  renderPublicRoutesManagerPanel,
  renderPublicRoutesPanel,
} from '../src/route-manager.js';
```

Cover these cases:

- `createUniqueRouteId('Primary public profile', [])` returns `primary-public-profile`.
- collision with `primary-public-profile` returns `primary-public-profile-2`.
- route ID collisions count imported read-only endpoint IDs as unavailable.
- a 79+ character base truncates before appending `-2` and final length is `<= 80`.
- endpoint routes sort manager-created non-revoked routes first by `updated_at`, then imported non-revoked routes, then revoked routes.
- sort fallback uses `created_at`, then `source.observed_at`, then a stable `fragment_id` tie-breaker when `updated_at` is missing.
- the first eligible sorted route renders with a `Primary route` label/class, and if it is revoked the next eligible route becomes primary.
- rendered public route cards use `endpoint_ref.url`, not `source.reference_url`.
- unsafe route URLs such as `javascript:alert(1)`, `data:text/html,...`, or plain `http://` render as text or are omitted, never as anchor `href` values.
- route card text includes `Recheck on owner change` for `pause_on_transfer`, not `transfer` wording.
- manager panel shows imported endpoint routes as read-only.
- compact create input sets `fragment_type: 'endpoint'`, mirrors `reference_url` from `endpoint_url`, and sets `endpoint_ref`.
- compact patch keeps existing route ID unless an advanced `endpoint_id` input is present.
- binding dispatches create/update/revoke route handlers.

- [x] **Step 2: Run the new tests and confirm they fail**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs
```

Expected: FAIL because `apps/web/src/route-manager.js` does not exist.

- [x] **Step 3: Implement `apps/web/src/route-manager.js`**

Create the module with these exports:

```js
export function getPublicRouteFragments(dataOrFragments) { /* endpoint filter + deterministic sort */ }
export function createUniqueRouteId(label, existingIds = []) { /* slug + collision + 80-char suffix truncation */ }
export function renderPublicRoutesPanel(data) { /* public route cards */ }
export function renderPublicRoutesManagerPanel(state) { /* claimed manager create/edit/revoke */ }
export function compactRouteInput(formData, existingRoutes = []) { /* endpoint create payload */ }
export function compactRoutePatch(formData, currentRoute) { /* endpoint patch payload */ }
export function bindRouteManager(root, handlers = {}) { /* submit/click handlers */ }
```

Implementation notes:

- Route source is endpoint fragments: `fragment.fragment_type === 'endpoint' && fragment.endpoint_ref?.url`.
- Editable route: `source.source_type === 'owner_submission' && source.issuer === null`.
- Public link source: `endpoint_ref.url` only.
- Link safety: only render an `<a href>` when `endpoint_ref.url` parses as `https:`. For unsafe, missing, or non-HTTPS URLs, render the route URL as inert text or omit it; never fall back to `source.reference_url`.
- Primary rendering: after deterministic sorting, mark the first non-revoked manager-created endpoint route as primary; if none exists, mark the first non-revoked imported endpoint route as primary. Render `Primary route` as a label and add a class such as `primary` for styling.
- Create payload shape:

```js
{
  fragment_type: 'endpoint',
  public_value: routeLabel,
  reference_url: routeUrl,
  proof_reference: proofNote,
  transfer_policy: 'pause_on_transfer',
  endpoint_ref: { endpoint_id: routeId, url: routeUrl, protocol: routeType }
}
```

- Patch payload shape should include `public_value`, `reference_url`, `proof_reference`, `status`, `transfer_policy`, and `endpoint_ref`.
- Status select for manager-created routes must only include `pending`, `stale`, `disputed`, `revoked`.
- Public status labels: `pending` -> `Review required`, `verified` -> `Verified reference`, `stale` -> `Recheck needed`, `disputed` -> `Disputed`, `historical` -> `Historical reference`, `revoked` -> `Revoked`.
- Review behavior labels: `pause_on_transfer` -> `Recheck on owner change`, `reverify_on_transfer` -> `Reverify on owner change`, `historical_on_transfer` -> `Keep historical on owner change`, `never_transfer` -> `Do not carry forward on owner change`.
- Do not render product-visible transfer wording.

- [x] **Step 4: Run route-manager tests and confirm they pass**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs
```

Expected: PASS.

### Task 4: Move endpoint UI out of the generic fragment manager

**Files:**
- Modify: `apps/web/src/fragment-manager.js`
- Modify: `apps/web/test/fragment-manager.test.mjs`

- [x] **Step 1: Update the failing generic fragment-manager tests**

In `apps/web/test/fragment-manager.test.mjs`:

- remove expectations for endpoint fields in the generic create form,
- update `renderFragmentTypeSelect()` expectations so it no longer includes `endpoint`,
- keep `compactFragmentPatch()` endpoint behavior only if existing endpoint edit forms still need backward compatibility; otherwise move endpoint compaction coverage to `route-manager.test.mjs`,
- assert the generic panel copy still covers wallet, social, standard, and attestation fragments.

- [x] **Step 2: Run fragment-manager tests and confirm they fail**

Run:

```bash
node --test apps/web/test/fragment-manager.test.mjs
```

Expected: FAIL until endpoint UI is removed from the generic renderer.

- [x] **Step 3: Update `apps/web/src/fragment-manager.js`**

Change generic fragment manager behavior:

- `renderFragmentTypeSelect()` options: `wallet`, `social`, `standard_ref`, `attestation`.
- Remove endpoint-only create fields from `renderCreateFragmentForm()`.
- Remove endpoint edit fields from generic `renderManagedFragmentEditForm()` or leave them unreachable for endpoint fragments because endpoint fragments are rendered by route manager.
- Update copy from `endpoint` to `public proof references` so routes are not duplicated.
- Keep exported compaction functions stable unless app integration no longer uses them for endpoints.

- [x] **Step 4: Run fragment-manager tests and route-manager tests**

Run:

```bash
node --test apps/web/test/fragment-manager.test.mjs apps/web/test/route-manager.test.mjs
```

Expected: PASS.

### Task 5: Integrate route panels and profile editor polish into the app

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Write failing app integration tests**

Add tests in `apps/web/test/app.test.mjs` for:

1. Claimed saved profile editor shows `Profile image URL` and helper copy:

```js
assert.match(form.textContent, /Edit public profile/);
assert.match(form.textContent, /Safe public fields for the saved Multipass profile\./);
assert.match(form.textContent, /Profile image URL/);
assert.match(form.textContent, /Updates the public Multipass visual only/);
assert.doesNotMatch(form.textContent, /Avatar URL/);
```

2. Saved profile with endpoint fragments renders a `Public routes` panel before dense proof drawers and links to `endpoint_ref.url`.
3. Claimed route manager creates an endpoint route through existing `createPublicFragment` handler payload.
4. Imported endpoint route appears read-only in route manager.
5. Route-card and route-manager text does not match `/execute|approve|connect|authorize|grant tool access|release credentials|credential release|tool control|transfer|transfer behavior|transfer authority|activate tools/i`, scoped to route DOM to avoid unrelated wallet/session false positives.

- [x] **Step 2: Run focused app tests and confirm they fail**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "Profile image URL|Public routes|route manager"
```

Expected: FAIL because the app has no route manager panel and the editor still says `Avatar URL`.

- [x] **Step 3: Import and render route panels in `app.js`**

Import from `./route-manager.js`:

```js
import { bindRouteManager, compactRouteInput, compactRoutePatch, renderPublicRoutesManagerPanel, renderPublicRoutesPanel } from './route-manager.js';
```

Update profile rendering:

- In the profile page layout, render `renderPublicRoutesPanel(data)` below the visual/summary area and before `renderProfileDetailDrawers()`.
- In `renderClaimManagementPanel(state)`, render `renderPublicRoutesManagerPanel(state)` when `canEdit` is true, before or after the generic `renderFragmentManagerPanel(state)`.
- In `bindProfileEvents()`, call `bindRouteManager(root, { createRoute, updateRoute, revokeRoute })`, where handlers reuse the existing fragment mutation functions.
- Add wrapper handlers in `createApp()`:
  - `createPublicRoute(event)` -> `compactRouteInput(new FormData(event.currentTarget), state.data?.fragments?.fragments)` -> `claimApi.createMultipassFragment()`.
  - `updatePublicRoute(event)` -> `compactRoutePatch(new FormData(event.currentTarget), current route)` -> `claimApi.updateMultipassFragment()`.
  - `revokePublicRoute(event)` can call the same revoke path as fragments.

Keep route errors in `state.fragmentError`/`state.fragmentStatus` unless a small `routeError` state is clearly cleaner.

- [x] **Step 4: Polish profile edit copy**

In `renderPublicProfileEditForm()`:

- change heading to `Edit public profile`,
- add subcopy `Safe public fields for the saved Multipass profile.`,
- change label from `Avatar URL` to `Profile image URL`,
- add helper text below the input:

```html
<p class="field-help">Updates the public Multipass visual only. It does not change custody, tools, credentials, ownership, or the source AgentDNA record.</p>
```

- [x] **Step 5: Add route styles**

In `apps/web/src/styles.css`, add styles for:

- `.public-routes-panel`
- `.public-route-card`
- `.route-manager-panel`
- `.route-create-form`
- `.managed-route-card`
- `.route-edit-form`
- `.field-help`

Follow the current warm Multipass card aesthetic and existing form styling. No emojis.

- [x] **Step 6: Run focused web tests**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs apps/web/test/fragment-manager.test.mjs apps/web/test/app.test.mjs --test-name-pattern "Profile image URL|Public routes|route manager|Fragment manager|route"
```

Expected: PASS.

- [x] **Step 7: Commit Chunk 2**

```bash
git add apps/web/src/route-manager.js apps/web/test/route-manager.test.mjs apps/web/src/fragment-manager.js apps/web/test/fragment-manager.test.mjs apps/web/src/app.js apps/web/test/app.test.mjs apps/web/src/styles.css
git commit -m "Add Multipass public routes manager"
```

---

## Chunk 3: Full verification, deploy, and source sync

### Task 6: Full test and wording gate

**Files:**
- Modify if needed: `apps/web/test/wording.test.mjs`

- [x] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS with all repository tests green.

- [x] **Step 2: Run web build**

Run:

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: PASS and produce `apps/web/dist`.

- [x] **Step 3: Run whitespace gate**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 4: Run mandatory route wording scan**

Update `apps/web/test/wording.test.mjs` or add a targeted route-manager wording assertion so route cards and route manager copy reject these banned control phrases:

```text
execute route
approve route
connect
authorize route
grant tool access
release credentials
credential release
tool control
transfer
transfer behavior
transfer authority
activate tools
```

Run:

```bash
node --test apps/web/test/wording.test.mjs apps/web/test/route-manager.test.mjs
```

Expected: PASS. Scope bare `connect` and `transfer` checks to route-card and route-manager DOM so wallet/session copy does not false-positive. Route UI may contain safe labels like `Recheck on owner change`, but route-card/manager copy must not include route execution, connection, authorization, credential, tool-control, or transfer claims.

### Task 7: Deploy web bundle and live smoke

**Files:**
- Deploy artifact: `apps/web/dist/` -> `/var/www/helixa.xyz/multipass/`

- [x] **Step 1: Deploy static bundle**

Run:

```bash
rsync -av --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: deployed asset list includes the new hashed `index-*.js` and `index-*.css`.

- [x] **Step 2: Smoke live HTML and fetch referenced assets**

Run:

```bash
assets=$(curl -fsSL https://helixa.xyz/multipass/ | grep -Eo 'assets/index-[^" ]+\.(js|css)' | sort -u)
printf '%s\n' "$assets"
for asset in $assets; do
  curl -fsSI "https://helixa.xyz/multipass/$asset" | head -1 | grep -q '200'
done
```

Expected: output lists current hashed JS/CSS assets, and every referenced asset returns HTTP 200.

- [x] **Step 3: Smoke saved profile and manager surface in browser**

Use headless Chromium or the existing smoke pattern to open this exact saved profile URL:

```text
https://helixa.xyz/multipass/bendr-2-1
```

Assert from the live DOM:

- `.multipass-profile-page` exists,
- `.claim-management-panel` exists for the saved profile manager surface,
- if endpoint fragments are present, `.public-routes-panel` exists and each route card link `href` comes from its `endpoint_ref.url`,
- route card copy avoids `/execute|approve|connect|authorize|grant tool access|tool control|credential release|release credentials|transfer|transfer behavior|transfer authority|activate tools/i`, scoped to `.public-route-card` / route-manager DOM rather than the whole page,
- profile image URL still controls the visual when present.

If `bendr-2-1` has no endpoint fragments in live data, record that route-card live rendering was covered by tests and smoke only the saved-profile manager surface plus public profile render. Do not fabricate live route data.

- [x] **Step 4: Smoke unsafe route URL handling before deploy finalization**

Before treating the deployment as complete, run a public-render smoke against a test fixture page in the built app if available, or a local JSDOM/browser smoke, with a route fragment whose `endpoint_ref.url` is unsafe or missing. Assert unsafe route URLs are not linked in rendered route cards.

If no live saved profile contains an unsafe route, do not mutate live data just to create one. Rely on the route-manager unit test for unsafe route rendering and record live unsafe-route smoke as not applicable.

- [x] **Step 5: Smoke manager error boundaries if API/session access is available**

If a live manager session is not available, do not fake one. Instead smoke public read behavior and rely on API tests for manager writes.

If a manager session is available, verify:

- adding a route with non-HTTPS URL is rejected,
- adding a route with duplicate route ID is rejected,
- existing route cards remain visible after failed save.

### Task 8: Final commit, push, and memory

**Files:**
- Modify: `/home/ubuntu/.openclaw/workspace/memory/2026-06-30.md`

- [x] **Step 1: Check status**

Run:

```bash
git status --short
```

Expected: only intended files are modified.

- [ ] **Step 2: Commit any verification/deploy source changes after Chunk 2**

If wording tests, smoke scripts, styles, or implementation files changed after the Chunk 2 commit, run this exact add command for the known plan files and intended source/test/style paths:

```bash
git add   apps/api/src/saved-records.js   apps/api/test/claim-manage.test.mjs   apps/web/src/route-manager.js   apps/web/test/route-manager.test.mjs   apps/web/src/fragment-manager.js   apps/web/test/fragment-manager.test.mjs   apps/web/src/app.js   apps/web/test/app.test.mjs   apps/web/src/styles.css   apps/web/test/wording.test.mjs   docs/superpowers/specs/2026-06-30-multipass-profile-routes-manager-design.md   docs/superpowers/plans/2026-06-30-multipass-profile-routes-manager.md
git commit -m "Polish Multipass route manager verification"
```

If `git status --short` shows no source/test/style/doc changes, skip this commit and state that no post-Chunk-2 source commit was needed.

- [ ] **Step 3: Push**

Run:

```bash
git push
```

Expected: push to `Bendr-20/multipass` main succeeds.

- [ ] **Step 4: Append memory note**

Append one concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-30.md` with:

- pushed commit hash,
- deployed asset hash,
- tests/build run,
- live smoke result,
- any known blocker or omitted live manager-session smoke.

- [ ] **Step 5: Final user update**

Send a terse update:

```text
Shipped. Profile image copy is cleaned up, public route cards are live, and claimed managers have the route manager foundation. Tests/build/live public smoke passed. Pushed <hash>. <Manager-session smoke note if unavailable.>
```

Do not paste full logs unless asked.

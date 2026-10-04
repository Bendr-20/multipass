# RESTAP Network Console UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a polished, accessible fifth **Network / RESTAP** Console workspace for the selected Looper without changing RESTAP protocol, API, privacy, authorization, quota, or rollout behavior.

**Architecture:** Keep the existing strict RESTAP API client and normalized owner projection. Move rendering into a dedicated Network workspace, add a bounded selected-Looper UI draft/mutation projection in the existing app state, and style the semantic renderer with scoped Console CSS. Treat the six existing uncommitted UI/test files as an incoming partial implementation: preserve them, test them, and bring them into conformance rather than replacing them wholesale.

**Tech Stack:** Node.js 24 ESM, vanilla DOM render functions, JSDOM/node:test, Vite, Playwright Core/Chromium, existing Multipass Console CSS.

**Design:** `docs/superpowers/specs/2026-10-03-restap-network-console-ui-design.md`

---

## File map and current baseline

### Existing partial implementation to preserve and finish

The incoming draft is still changing and must be inventoried at execution start rather than assumed to be a fixed six-file patch. At the latest inspection it included tracked edits to `apps/web/src/app.js`, `apps/web/src/console-restap-network.js`, `apps/web/src/multipass-console.js`, `apps/web/src/styles.css`, `apps/web/scripts/smoke-looper-codex-console.mjs`, and three web tests, plus an untracked `apps/web/test/console-restap-network-browser.test.mjs`. Preserve every tracked and untracked incoming path; do not reset, clean, or replace it wholesale.

The incoming focused aggregate was green at **280/280**, but passing draft tests do not establish design conformance. Known gaps include total status precedence, neutral unavailable copy, exact privacy language, bounded draft state, retry identity, failure transitions, focus restoration, and deterministic visual proof. Reconcile whatever is present at execution time against the approved spec.

### Files to add or modify

- Modify: `apps/web/src/console-restap-network.js` — total status projection, neutral unavailable rendering, semantic cards, exact privacy copy, stable draft rendering.
- Modify: `apps/web/src/multipass-console.js` — fifth navigation item, accessible status label, Network/Multipass separation.
- Modify: `apps/web/src/app.js` — process-local drafts, stable intent idempotency, one-mutation lock, stale selection/session clearing, logical focus restoration.
- Modify: `apps/web/src/styles.css` — scoped Network workspace layout, switches, chips, fields, statuses, mobile layout, focus, reduced motion.
- Modify: `apps/web/test/console-restap-network.test.mjs` — exhaustive pure-state/render/accessibility tests.
- Modify: `apps/web/test/multipass-console.test.mjs` — fifth-workspace and navigation semantics.
- Modify: `apps/web/test/app.test.mjs` — draft, retry identity, mutation, stale boundary, and focus behavior.
- Create: `apps/web/scripts/smoke-restap-network-console.mjs` — built-bundle desktop/390px/320px visual and interaction proof.
- Modify: `apps/web/package.json` — add the bounded smoke command.

### Explicit non-changes

Do not modify the RESTAP server, schemas, browser API request bodies, policy maxima, topic taxonomy, grant/relay code, rollout gates, or production configuration. Do not add storage for drafts or transcripts. Do not deploy or push.

## Chunk 1: State, navigation, and mutation correctness

### Task 1: Reconcile the incoming partial draft and lock the fifth-workspace contract

**Files:**
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/console-restap-network.test.mjs`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/console-restap-network.js`

- [ ] **Step 1: Save and identify the incoming draft without resetting it**

Run:

```bash
set -euo pipefail
SNAPSHOT=/tmp/restap-network-console-ui-incoming
rm -rf "$SNAPSHOT"
mkdir -p "$SNAPSHOT"
git status --porcelain=v1 -uall > "$SNAPSHOT/status.txt"
git diff --binary --no-ext-diff > "$SNAPSHOT/unstaged.patch"
git diff --cached --binary --no-ext-diff > "$SNAPSHOT/staged.patch"
git ls-files --others --exclude-standard -z > "$SNAPSHOT/untracked.zlist"
if test -s "$SNAPSHOT/untracked.zlist"; then
  tar --null -T "$SNAPSHOT/untracked.zlist" -cf "$SNAPSHOT/untracked.tar"
  xargs -0 -r sha256sum < "$SNAPSHOT/untracked.zlist" > "$SNAPSHOT/untracked.sha256"
else
  : > "$SNAPSHOT/untracked.tar"
  : > "$SNAPSHOT/untracked.sha256"
fi
sha256sum "$SNAPSHOT/status.txt" "$SNAPSHOT/unstaged.patch" "$SNAPSHOT/staged.patch" "$SNAPSHOT/untracked.tar" | tee "$SNAPSHOT/digests.sha256"
cat "$SNAPSHOT/status.txt"
git diff --check
git diff --cached --check
```

Expected: the manifest names every tracked and untracked incoming path, the staged patch, unstaged patch, and untracked archive hashes are persisted in `$SNAPSHOT/digests.sha256` outside the repository, and `git diff --check` passes. Compare the manifest with this plan's file map and explicitly account for any new path before editing. Do not run checkout/reset/clean. Do not commit unrelated incoming artifacts merely because they appear in the manifest.

- [ ] **Step 2: Add RED navigation tests for all five workspace destinations**

In `apps/web/test/multipass-console.test.mjs`, require both desktop and mobile navigation to contain exactly:

```js
assert.deepEqual(
  [...nav.querySelectorAll('[data-console-view]')].map((button) => button.dataset.consoleView),
  ['chat', 'codex', 'wallet', 'multipass', 'network'],
);
assert.equal(nav.querySelector('[data-console-view="network"] span')?.textContent, 'Network');
assert.match(nav.querySelector('[data-console-view="network"] small')?.textContent ?? '', /RESTAP/);
```

Also render `workspaceView: 'multipass'` and `workspaceView: 'network'` separately. Assert Multipass has no `.console-restap-network`, Network has exactly one, and only one visible nav item has `aria-current="page"`.

- [ ] **Step 3: Add RED total status-precedence tests**

In `apps/web/test/console-restap-network.test.mjs`, replace the four-state-only test with table-driven coverage:

```js
const cases = [
  [{ selectedTokenId: null, status: 'idle', policy: null }, 'select', 'Select Looper'],
  [{ selectedTokenId: '1', status: 'idle', policy: null }, 'checking', 'Checking'],
  [{ selectedTokenId: '1', status: 'loading', policy: null }, 'checking', 'Checking'],
  [{ ...ready, status: 'saving', mutationKind: 'policy' }, 'updating', 'Updating'],
  [{ ...ready, status: 'conflict' }, 'review', 'Review'],
  [{ ...ready, status: 'error' }, 'error', 'Error'],
  [{ selectedTokenId: '1', status: 'unavailable', policy: null }, 'unavailable', 'Unavailable'],
  [{ ...ready, policy: { ...ready.policy, networkEnabled: true, leaseStatus: 'active', eligibilityStatus: 'eligible' } }, 'active', 'Active'],
  [{ ...ready, policy: { ...ready.policy, networkEnabled: true, leaseStatus: 'unavailable' } }, 'paused', 'Paused'],
  [{ ...ready, policy: { ...ready.policy, networkEnabled: false, leaseStatus: 'active', eligibilityStatus: 'eligible' } }, 'ready', 'Ready'],
  [{ ...ready, policy: { ...ready.policy, networkEnabled: false, leaseStatus: 'inactive' } }, 'locked', 'Locked'],
];
for (const [state, key, label] of cases) {
  assert.deepEqual(getConsoleRestapNetworkStatus(state), { key, label });
}
```

Add cross-product coverage for `networkEnabled × eligibilityStatus × leaseStatus` so every normalized settled combination reaches Active, Paused, Ready, or Locked under the approved precedence.

- [ ] **Step 4: Run the tests and verify RED for missing transient states**

Run:

```bash
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/multipass-console.test.mjs
```

Expected: FAIL because the incoming `getConsoleRestapNetworkStatus` only returns Locked/Ready/Active/Paused and does not prioritize checking/updating/review/error/unavailable.

- [ ] **Step 5: Implement the total status projection and navigation semantics**

In `apps/web/src/console-restap-network.js`, implement precedence in one pure function. Return only closed objects:

```js
const NETWORK_STATUS = Object.freeze({
  select: Object.freeze({ key: 'select', label: 'Select Looper' }),
  checking: Object.freeze({ key: 'checking', label: 'Checking' }),
  updating: Object.freeze({ key: 'updating', label: 'Updating' }),
  review: Object.freeze({ key: 'review', label: 'Review' }),
  error: Object.freeze({ key: 'error', label: 'Error' }),
  unavailable: Object.freeze({ key: 'unavailable', label: 'Unavailable' }),
  active: Object.freeze({ key: 'active', label: 'Active' }),
  paused: Object.freeze({ key: 'paused', label: 'Paused' }),
  ready: Object.freeze({ key: 'ready', label: 'Ready' }),
  locked: Object.freeze({ key: 'locked', label: 'Locked' }),
});

export function getConsoleRestapNetworkStatus(state = {}) {
  if (!state.selectedTokenId) return NETWORK_STATUS.select;
  if (['idle', 'loading'].includes(state.status)) return NETWORK_STATUS.checking;
  if (state.status === 'saving' || state.mutationKind) return NETWORK_STATUS.updating;
  if (state.status === 'conflict') return NETWORK_STATUS.review;
  if (state.status === 'error') return NETWORK_STATUS.error;
  if (state.status === 'unavailable' || !state.policy) return NETWORK_STATUS.unavailable;
  const usable = state.policy.eligibilityStatus === 'eligible' && state.policy.leaseStatus === 'active';
  if (state.policy.networkEnabled) return usable ? NETWORK_STATUS.active : NETWORK_STATUS.paused;
  return usable ? NETWORK_STATUS.ready : NETWORK_STATUS.locked;
}
```

In `apps/web/src/multipass-console.js`, keep visible text and `aria-label` synchronized with this projection. Disable Network only when no Looper is selected, not merely because RESTAP is unavailable.

- [ ] **Step 6: Add RED unavailable-state tests**

In renderer tests, require 404 and 503 states to contain `Network participation is unavailable`, contain no policy/intent form, and contain no installation or root-cause claim. Keep an ordinary non-404/503 load error distinct and require a Retry button.

- [ ] **Step 7: Run the unavailable-state tests and verify RED**

Run:

```bash
node --test --test-name-pattern='unavailable|404|503' apps/web/test/console-restap-network.test.mjs
```

Expected: FAIL because the incoming locked branch claims a specific installation/rollout cause.

- [ ] **Step 8: Implement neutral unavailable copy**

Render:

```html
<strong>Network participation is unavailable</strong>
<span>Network controls cannot be used for this Looper right now.</span>
```

Do not infer cause from HTTP status. Preserve the distinct ordinary-error Retry branch.

- [ ] **Step 9: Run focused tests and commit the contract slice**

Run:

```bash
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/multipass-console.test.mjs
git diff --check
```

Expected: PASS; prohibited wording absent.

Commit:

```bash
git add apps/web/src/console-restap-network.js apps/web/src/multipass-console.js \
  apps/web/test/console-restap-network.test.mjs apps/web/test/multipass-console.test.mjs
git commit -m "feat: add dedicated RESTAP Network workspace"
```

### Task 2: Add bounded drafts, stable retry identity, and one-mutation semantics

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/console-restap-network.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/console-restap-network.js`

- [ ] **Step 1: Add RED tests for typed, bounded policy and intent drafts**

In `apps/web/test/app.test.mjs`, submit policy and intent forms through the real DOM fixture. Make each API call reject after recording the request and assert rerendered fields retain the submitted normalized values. Assert the state uses `policyDraft` and `intentDraft`, has no legacy `draft` key, and never writes drafts to localStorage/sessionStorage.

Use the actual public selection API and authority boundaries:

```js
await app.selectConsoleAgentById('812');
assert.equal(root.querySelector('[name="peer_token_ids"]')?.value, '');
walletClient.setSnapshot({ connected: false, address: null, label: null }, { notify: true });
await flushAsyncEvents();
assert.equal(root.querySelector('.console-restap-network'), null);
```

Also exercise the existing 401/403 session-invalidation path. Do not use `resetConsoleSession()` as an authority boundary: it intentionally hides local chat while preserving authenticated RESTAP state.

Require these exact in-memory bounds:

- `policyDraft`: three booleans; three bounded integers; at most six closed topics; at most 256 canonical allow IDs; at most 256 canonical block IDs; canonical UTC mute time or null.
- `intentDraft`: at most 256 canonical peer IDs; one closed topic; `once|daily`; one canonical UTC run time.
- Raw peer/allow/block text: `maxlength=2048`; reject input beyond 2048 before any draft write or API call.
- `message`: null or bounded 256-character product copy selected by code, never raw server text.

Test unknown keys, 257 IDs, duplicate IDs, IDs above 7777, and >2048 raw characters. Expected: no state write, no request, bounded validation copy.

- [ ] **Step 2: Add RED tests for stable intent retry idempotency**

Inject a deterministic key factory into `createApp`:

```js
const issued = [];
const restapIdempotencyKeyFactory = () => {
  const key = 'intent-retry-' + String(issued.length + 1).padStart(16, '0');
  issued.push(key);
  return key;
};
```

Test:

1. First valid submit fails after the fixture records the request.
2. Unchanged retry sends the exact same `idempotency_key`.
3. Equivalent normalized input—peer order and surrounding whitespace only—reuses the key because the API-normalized peer list is sorted.
4. Each substantive change to peer set, topic, cadence, or canonical run time independently produces a new key.
5. A successful submit clears the typed draft, fingerprint, and key; the next new intent gets another key.
6. Looper change, disconnected/different-wallet event, and 401/403 invalidation clear all three.

Duplicate submission while pending must record one API call and one key-factory call.

- [ ] **Step 3: Add RED tests for all four mutation transitions**

Table-drive `policy`, `intent`, `cancel`, and `stop`. Every save/plan/cancel/stop control must carry `data-restap-mutation`. While any action is pending:

```js
assert.equal(root.querySelector('.console-restap-network')?.dataset.mutationKind, kind);
assert.equal(root.querySelectorAll('[data-restap-mutation]:not(:disabled)').length, 0);
```

For each kind prove a rapid repeat records one request. Prove completion after A→B, disconnected/different wallet, or 401/403 invalidation cannot reload A or overwrite B.

Add failure assertions:

- ordinary failure atomically clears `mutationKind`, releases the in-memory controller lock, projects **Error**, and permits one retry;
- 409 atomically clears `mutationKind`, projects **Review**, retains the canonical projection and matching draft, blocks resave, and exposes only Refresh;
- Refresh enters Checking, successful refresh replaces canonical state and clears the stale draft/key, and failed refresh never returns to Updating;
- successful policy save clears `policyDraft`;
- successful intent creation clears `intentDraft`, fingerprint, and key;
- successful cancel uses only returned normalized state;
- successful stop clears both drafts and keys.

- [ ] **Step 4: Run the draft/mutation tests and verify RED**

Run only:

```bash
node --test --test-name-pattern='RESTAP' apps/web/test/app.test.mjs
node --test apps/web/test/console-restap-network.test.mjs
```

Expected: FAIL because the incoming draft has one unbounded `draft` field, creates a fresh random key per submit, lacks action-specific transitions, and has no mutation markers.

- [ ] **Step 5: Implement typed draft normalization and remove the legacy field**

Extend the initial Network UI state with exactly:

```js
{
  policyDraft: null,
  intentDraft: null,
  intentDraftFingerprint: null,
  intentIdempotencyKey: null,
  mutationKind: null, // policy | intent | cancel | stop
  message: null,
}
```

Delete every read/write of the incoming legacy `draft` key. Add pure normalizers in `console-restap-network.js` that accept only the typed fields and exact caps above, return frozen values, and reject oversized/unknown input before state storage. Reuse the same closed topics, canonical token rules, integer maxima, and canonical-time rules as the API contract; do not export or weaken API validators.

`createInitialConsoleRestapNetworkState`, selection clearing, disconnected/different-wallet handling, and 401/403 invalidation must reset these fields. Preserve policy/intent drafts only across ordinary matching-token mutation failure.

Add `data-restap-mutation="policy|intent|cancel|stop"` to the four action types in `console-restap-network.js` now, before this task's green gate.

- [ ] **Step 6: Implement atomic mutation transition helpers**

Keep state transitions in pure helpers rather than scattered object spreads:

```js
export function beginConsoleRestapNetworkMutation(state, input) { /* validate token/kind; set saving+kind atomically */ }
export function failConsoleRestapNetworkMutation(state, input) { /* clear kind; project conflict/error; preserve bounded matching draft */ }
export function resolveConsoleRestapNetworkMutation(state, input) { /* clear kind/message and only the successful action's drafts */ }
```

The failure path must make controls and the lock agree. For policy, intent, cancel, and stop, conditionally clear `consoleRestapNetworkMutationAbortController` if it is still the matching controller **before** rendering the next state; in that same transition set `mutationKind:null` with `status:'conflict'|'error'`. Keep `finally` as an idempotent fallback only. The immediate failure→retry test for each mutation kind must prove the retry dispatches rather than being silently blocked. Never let stale `mutationKind` outrank Review/Error in navigation.

- [ ] **Step 7: Implement stable identity from exact API-normalized values**

Add optional `restapIdempotencyKeyFactory = createConsoleRestapIntentKey` to `createApp`. The default uses `globalThis.crypto.randomUUID()` when available and an existing bounded random fallback; output must satisfy the identifier grammar.

Normalize peer IDs to canonical sorted unique strings before computing:

```js
const normalizedIntent = { peer_token_ids, topic, cadence, run_at };
const fingerprint = JSON.stringify(normalizedIntent);
const sameDraft = state.consoleRestapNetwork.intentDraftFingerprint === fingerprint;
const idempotencyKey = sameDraft && state.consoleRestapNetwork.intentIdempotencyKey
  ? state.consoleRestapNetwork.intentIdempotencyKey
  : restapIdempotencyKeyFactory();
```

The stored fingerprint must represent the exact four normalized values passed to `createIntent`; append only `idempotency_key` for the API request. A substantive input/change event invalidates the key only when its normalized fingerprint changes. Invalid input never rotates a key because it never enters state. Do not change `console-restap-network-api.js` or its request schema.

- [ ] **Step 8: Run mutation tests and verify PASS**

Run:

```bash
node --test --test-name-pattern='RESTAP' apps/web/test/app.test.mjs
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/console-restap-network-api.test.mjs
```

Expected: PASS for bounded drafts, equivalent-input key reuse, substantive edits, all four locks, failure release, conflict refresh, and stale authority boundaries.

- [ ] **Step 9: Add RED privacy-copy tests**

Require separate assertions for provider processing, no Helixa transcript persistence, process-memory live text, and durable bounded non-content accounting. The test must fail if copy collapses these into “memory only.”

- [ ] **Step 10: Run the privacy test and verify RED**

```bash
node --test --test-name-pattern='privacy|transcript' apps/web/test/console-restap-network.test.mjs
```

Expected: FAIL against the incoming abbreviated copy.

- [ ] **Step 11: Implement exact privacy meaning**

Render:

```text
Pilot conversations are processed by the model provider but are not stored as transcripts by Helixa. Active text is held in process memory for the live conversation; Helixa retains bounded non-content accounting such as status, timestamps, keyed hashes, and usage.
```

Do not add transcript data, provider payloads, or accounting identifiers to the projection.

- [ ] **Step 12: Run focused tests and commit mutation correctness**

```bash
node --test --test-name-pattern='RESTAP' apps/web/test/app.test.mjs
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/console-restap-network-api.test.mjs
git diff --check
```

Expected: PASS, including ambiguous-failure retry identity and exact privacy semantics.

Commit:

```bash
git add apps/web/src/app.js apps/web/src/console-restap-network.js \
  apps/web/test/app.test.mjs apps/web/test/console-restap-network.test.mjs
git commit -m "feat: preserve safe RESTAP Network drafts"
```

### Task 3: Preserve logical focus across Network rerenders

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/console-restap-network.js`
- Modify: `apps/web/src/multipass-console.js`

- [ ] **Step 1: Add RED focus-restoration tests**

Use JSDOM's active element with stable scoped keys. Cover:

- clicking the sidebar or mobile Network nav leaves focus on that same rendered nav placement after the workspace rerender;
- Save start and ordinary failure restore focus to Save;
- conflict focuses a `tabindex="-1"` alert and places Refresh next in DOM/tab order;
- Refresh focus intent survives the intermediate Checking skeleton and, after success, focuses the Network heading;
- Retry focus intent survives intermediate loading and returns to Retry if loading fails;
- successful cancel focuses Scheduled work when its button disappears;
- successful stop focuses the Network heading;
- Looper/session changes clear pending focus intent so it cannot land in another Looper's workspace.

- [ ] **Step 2: Run RED focus tests**

```bash
node --test --test-name-pattern='RESTAP.*focus|focus.*RESTAP' apps/web/test/app.test.mjs
```

Expected: FAIL because existing interaction restoration covers only the thread/composer and the incoming renderer lacks complete targets.

- [ ] **Step 3: Add scoped nav and workspace focus keys**

In `multipass-console.js`, distinguish duplicate desktop/mobile nav nodes:

```html
<button data-restap-focus-key="nav-network-sidebar" ...>…</button>
<button data-restap-focus-key="nav-network-mobile" ...>…</button>
```

In `console-restap-network.js`, add stable logical keys that contain no private identifier:

```html
<h2 data-restap-focus-key="heading">…</h2>
<button data-restap-focus-key="save">Save network settings</button>
<div data-restap-focus-key="conflict" role="alert">…</div>
<button data-restap-focus-key="refresh">Refresh</button>
<button data-restap-focus-key="retry">Retry</button>
<section data-restap-focus-key="scheduled">…</section>
```

Cancel buttons use a bounded visible ordinal such as `cancel-0`, never a durable intent ID in the focus key. Scheduled/heading/alert targets become programmatically focusable only when selected: add `tabindex="-1"`, focus, then remove it on blur.

- [ ] **Step 4: Extend the existing interaction snapshot narrowly**

Do not add a competing global focus system. Extend `captureConsoleInteractionState` with:

```js
network: active?.matches?.('[data-restap-focus-key]')
  ? { key: active.dataset.restapFocusKey }
  : { key: null },
```

`restoreConsoleInteractionState` restores a surviving exact key with `preventScroll:true`. This covers ordinary rerenders and the duplicated nav placements because their keys are distinct.

- [ ] **Step 5: Add one persistent post-action focus intent**

Add a process-local closure value such as:

```js
let consoleRestapFocusIntent = null; // { tokenId, sessionGeneration, key, phase }
```

Set it before Refresh, Retry, Cancel, and Stop. It must survive intermediate loading/checking renders, apply only when token and session generation still match, and clear only after the target is focused or the authority/selection boundary changes. Do not store it in local/session storage or expose it in DOM/state.

Use final targets:

- Refresh success → `heading`;
- Refresh conflict/error → `refresh` or `conflict` as specified;
- Retry error → `retry`;
- Cancel success → `scheduled`;
- Stop success → `heading`.

- [ ] **Step 6: Run focus and aggregate tests, then commit**

```bash
node --test --test-name-pattern='RESTAP' apps/web/test/app.test.mjs
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/multipass-console.test.mjs
git diff --check
```

Expected: PASS, including intermediate-loading and stale-boundary focus cases.

Commit:

```bash
git add apps/web/src/app.js apps/web/src/console-restap-network.js apps/web/src/multipass-console.js \
  apps/web/test/app.test.mjs
git commit -m "fix: preserve RESTAP Network focus"
```

## Chunk 2: Visual system, browser proof, and release-quality verification

### Task 4: Add the scoped responsive visual system

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/console-restap-network.js`
- Test: `apps/web/test/console-restap-network.test.mjs`

- [ ] **Step 1: Add RED semantic-class and control tests**

Require the renderer to expose scoped classes for readiness, cards, permissions, limits, topic chips, planner, scheduled work, advanced controls, privacy, and danger zone. Assert switches/topics remain native checkboxes, details/summary remain native expandable controls, field labels are associated, and every mutation control carries `data-restap-mutation`.

Require canonical DOM order:

```js
assert.deepEqual(
  [...workspace.querySelectorAll('[data-restap-section]')].map((node) => node.dataset.restapSection),
  ['readiness', 'permissions', 'limits-topics', 'plan', 'scheduled', 'advanced', 'privacy', 'danger'],
);
```

- [ ] **Step 2: Run RED renderer tests**

Run:

```bash
node --test apps/web/test/console-restap-network.test.mjs
```

Expected: FAIL for any missing mutation markers, exact privacy semantics, or label association.

- [ ] **Step 3: Add scoped Console CSS without changing DOM order**

Add one documented `/* RESTAP Network workspace */` block near existing workspace styles. Use CSS grid areas for desktop but no CSS `order` and no duplicate controls. Required structure:

```css
.console-restap-network-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.92fr);
  grid-template-areas:
    "readiness readiness"
    "permissions limits"
    "plan scheduled"
    "advanced privacy"
    "danger danger";
  gap: 14px;
  min-width: 0;
  color: #f8f3ec;
}
.console-restap-readiness { grid-area: readiness; }
.console-restap-permissions { grid-area: permissions; }
.console-restap-limits { grid-area: limits; }
.console-restap-plan { grid-area: plan; }
.console-restap-scheduled { grid-area: scheduled; }
.console-restap-advanced { grid-area: advanced; }
.console-restap-privacy { grid-area: privacy; }
.console-restap-danger { grid-area: danger; }
```

Style native controls rather than replacing them. Use a visually-hidden checkbox only when its label/switch remains keyboard reachable and its focus ring is visible on the styled track. Give buttons, summaries, inputs, selects, and chip labels at least 44px touch height.

Update `.console-workspace-nav` so five destinations fit the existing sidebar and mobile surfaces without truncating **Network**, **RESTAP**, or status text. Do not hide the textual status in favor of color. The desktop grid must remain row-major with canonical DOM/tab order: permissions → limits → plan → scheduled → advanced → privacy. Add a browser assertion that these section bounding boxes follow that same visual progression; focus must never jump to a visually earlier row.

- [ ] **Step 4: Add narrow and reduced-motion rules**

At the existing Console mobile breakpoint, use one column and direct DOM order:

```css
@media (max-width: 760px) {
  .console-restap-network-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "readiness" "permissions" "limits" "plan" "scheduled" "advanced" "privacy" "danger";
  }
}
@media (prefers-reduced-motion: reduce) {
  .console-restap-network-workspace *,
  .console-network-nav * { transition: none !important; animation: none !important; }
}
```

Ensure long UTC dates, token lists, and status text use `overflow-wrap:anywhere` where needed. At 320px, no fixed child width may force horizontal scrolling.

- [ ] **Step 5: Run renderer tests and build**

Run:

```bash
node --test apps/web/test/console-restap-network.test.mjs apps/web/test/multipass-console.test.mjs
pnpm web:build
git diff --check
```

Expected: PASS; Vite production build succeeds.

- [ ] **Step 6: Commit the visual slice**

```bash
git add apps/web/src/styles.css apps/web/src/console-restap-network.js apps/web/test/console-restap-network.test.mjs
git commit -m "style: polish RESTAP Network workspace"
```

### Task 5: Add deterministic desktop/mobile browser proof

**Files:**
- Create: `apps/web/scripts/smoke-restap-network-console.mjs`
- Modify: `apps/web/scripts/smoke-looper-codex-console.mjs` — preserve and verify its incoming five-workspace navigation change.
- Modify/adopt: `apps/web/test/console-restap-network-browser.test.mjs` — preserve its viewport proof and replace cause-claiming unavailable assertions.
- Modify: `apps/web/package.json`
- Test: built `apps/web/dist`

- [ ] **Step 1: Create a built-bundle Playwright smoke harness**

Follow `apps/web/scripts/smoke-looper-codex-console.mjs` for server lifecycle, browser errors, and screenshots, and preserve that incoming script's five-workspace loop/count. Serve only the fresh `dist` at the exact route `/multipass/console?mock=looper`. Adopt the incoming `apps/web/test/console-restap-network-browser.test.mjs` rather than leaving it untracked; update its locked-state assertion to neutral 404/503 semantics.

Mock and assert all six owner contracts for token 812:

1. `GET /api/multipass/console/restap-network/812/policy` → exact schema-valid policy envelope.
2. `PUT /api/multipass/console/restap-network/812/policy` → assert exact policy body, `content-type: application/json`, and presence—not value logging—of `x-csrf-token`; return policy envelope.
3. `GET /api/multipass/console/restap-network/812/intents` → exact list envelope.
4. `POST /api/multipass/console/restap-network/812/intents` → assert exact normalized intent body plus idempotency key and mutation headers; return single-intent envelope.
5. `DELETE /api/multipass/console/restap-network/812/intents/intent-browser-proof-000000000000001` → assert `{ expected_policy_version: 4 }` and mutation headers; return single cancelled-intent envelope.
6. `POST /api/multipass/console/restap-network/812/stop` → assert `{ expected_policy_version: 4 }` and mutation headers; return stopped policy envelope.

Use explicit scenario state: the first selected PUT returns 409; separate policy GET scenarios return 404 and 503; ordinary successful GET/PUT/POST/DELETE responses use only the exact normalized shapes from `console-restap-network-api.js`. Assert `accept: application/json` on every request and no CSRF header on GET. Never log header values, credentials, cookies, or response canaries.

Exercise viewports:

```js
const viewports = [
  { name: 'desktop', width: 1440, height: 1200 },
  { name: 'mobile', width: 390, height: 1000 },
  { name: 'narrow', width: 320, height: 900 },
];
```

- [ ] **Step 2: Prove layout and navigation invariants**

For every viewport:

- select mock Looper #812;
- assert five visible workspace buttons and one current page;
- open Multipass and prove no RESTAP panel;
- open Network and prove selected token, readiness, permissions, limits, planner, scheduled work, privacy, advanced, and danger sections;
- assert `document.documentElement.scrollWidth <= innerWidth` and every Network card's right edge is within the viewport;
- assert all visible interactive Network controls have both dimensions at least 44px, except native inline text links not introduced by this work;
- tab through controls and assert focus remains visible and follows DOM order;
- capture full-page PNGs under an ignored output directory.

- [ ] **Step 3: Prove interaction and unavailable states**

With the exact mocks above:

- save policy and assert the exact current request body;
- dispatch one introduction POST, record its body, and hold the route pending;
- while that first request is still pending, repeat submit and assert only one POST was dispatched;
- then abort the held first route as a transport failure;
- retry unchanged after the failure settles and assert the second dispatched POST reuses the first body's idempotency key;
- edit one substantive field, submit again, and assert a new key;
- cancel one pending intent;
- open Danger zone and stop only after mocked confirm;
- return 409 from the configured PUT and assert conflict focus/Refresh;
- return 404 and 503 from separate policy GET scenarios and assert neutral unavailable copy with zero mutation controls;
- inject unique high-entropy canaries into sanitized server-error and wrong-owner response fixtures; assert none appears in rendered text, HTML attributes, page errors, console output, request logs, or storage;
- capture sorted localStorage/sessionStorage key+value snapshots before RESTAP interaction and after every scenario; require exact equality so existing Console preference entries are allowed but RESTAP adds or changes nothing.

The script must print bounded pass/fail counts only—never request headers, cookie values, response bodies containing canaries, or storage values.

- [ ] **Step 4: Add the package command**

In `apps/web/package.json`:

```json
"smoke:restap-network-console": "CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-restap-network-console.mjs"
```

- [ ] **Step 5: Run, inspect, and commit browser proof**

Run:

```bash
pnpm web:build
pnpm --filter @helixa/multipass-web smoke:restap-network-console -- \
  --dist ./dist --output ./tmp/restap-network-console-smoke
```

Expected final line:

```text
restap-network-console-smoke=pass desktop=pass mobile=pass narrow=pass overflow=0 errors=0
```

Load all three images with the image inspection tool. Reject clipped controls, weak contrast, misleading status, raw browser styling, awkward empty space, or mobile overflow; revise CSS and rerun until clean.

Commit only source/script/package changes, not screenshots:

```bash
git add apps/web/scripts/smoke-restap-network-console.mjs \
  apps/web/scripts/smoke-looper-codex-console.mjs \
  apps/web/test/console-restap-network-browser.test.mjs apps/web/package.json
git commit -m "test: prove RESTAP Network workspace in browsers"
```

### Task 6: Run privacy, regression, and final review gates

**Files:**
- Modify only if a test exposes a defect in the files above.
- Evidence: ignored temporary output only.

- [ ] **Step 1: Run the focused RESTAP web suite**

```bash
node --test \
  apps/web/test/console-restap-network-api.test.mjs \
  apps/web/test/console-restap-network.test.mjs \
  apps/web/test/multipass-console.test.mjs \
  apps/web/test/app.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run full web and production build gates**

```bash
pnpm --filter @helixa/multipass-web test
pnpm web:build
git diff --check
```

Expected: all web tests pass and production build exits 0.

- [ ] **Step 3: Re-run RESTAP isolation/privacy scans**

Run the exact API and scanner gates:

```bash
node --test apps/api/test/restap-network-*.test.mjs
node --test apps/api/test/*.test.mjs
pnpm --filter @helixa/multipass-web test
pnpm web:build
pnpm --filter @helixa/multipass-web smoke:restap-network-console -- \
  --dist ./dist --output ./tmp/restap-network-console-smoke
git grep -n -E 'grant|signature|cookie|csrf|operation_id|lease_id|message_body|transcript' \
  -- apps/web/src/console-restap-network.js \
     apps/web/scripts/smoke-restap-network-console.mjs \
     apps/web/test/console-restap-network-browser.test.mjs
```

Expected: both focused and full API suites pass, the full web suite/build pass, and browser output reports unchanged storage plus zero canary hits across DOM text, attributes, console/page errors, request metadata, and storage keys/values. Review every grep hit manually; permitted explanatory copy and test-only field names are not equivalent to rendering a secret. Record the reviewed hit list and why each hit is safe. Prove no other-owner policy, message/transcript content, activation ID, lease ID, operation ID, wallet secret, or injected canary is exposed or persisted.

- [ ] **Step 4: Request two-stage code review**

Use @superpowers:requesting-code-review. First request a spec-compliance review against `docs/superpowers/specs/2026-10-03-restap-network-console-ui-design.md`; fix every issue and re-run focused tests. Then request a code-quality review; fix every blocking issue and re-run focused plus browser proof.

- [ ] **Step 5: Verify final repository state and commit any review fixes**

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: no uncommitted source/test changes. If review fixes exist:

```bash
git add apps/web/src/app.js apps/web/src/console-restap-network.js \
  apps/web/src/multipass-console.js apps/web/src/styles.css \
  apps/web/test/app.test.mjs apps/web/test/console-restap-network.test.mjs \
  apps/web/test/multipass-console.test.mjs apps/web/test/console-restap-network-browser.test.mjs \
  apps/web/scripts/smoke-restap-network-console.mjs \
  apps/web/scripts/smoke-looper-codex-console.mjs apps/web/package.json
git commit -m "fix: complete RESTAP Network workspace review"
```

- [ ] **Step 6: Produce the completion evidence and stop before release mutation**

Report:

- final commit SHA and clean-worktree proof;
- focused/full test counts;
- production build result;
- browser smoke final line and inspected screenshot paths;
- exact privacy/isolation scan result;
- confirmation that the Network tab is separate from Multipass;
- confirmation that no backend, gate, deployment, systemd, nginx, push, or live Looper state changed.

Do not deploy or enable any RESTAP phase. Live Phase 0 remains a separate explicit approval boundary.

## Completion checklist

- [ ] The rejected nickname appears nowhere in tracked working-tree content.
- [ ] Console has exactly five mutually exclusive workspaces, including Network / RESTAP.
- [ ] Multipass contains no RESTAP controls.
- [ ] Navigation status uses total precedence and textual accessible labels.
- [ ] 404/503 copy is neutral and exposes no mutation control.
- [ ] The canonical DOM/focus order matches the approved mobile sequence.
- [ ] Native switches, chips, details, labels, live regions, focus states, and 44px targets pass.
- [ ] Policy and intent drafts are process-local, selected-Looper scoped, and clear at authority boundaries.
- [ ] Unchanged intent retries reuse one idempotency key after ambiguous failure; substantive edits invalidate it.
- [ ] One RESTAP mutation may be in flight; stale results cannot cross Looper/session boundaries.
- [ ] Privacy copy distinguishes provider processing, process-memory text, no Helixa transcript persistence, and durable bounded non-content accounting.
- [ ] Desktop, 390px, and 320px browser proof is inspected with zero overflow/errors.
- [ ] Focused/full web, build, RESTAP isolation, and privacy gates pass.
- [ ] Worktree is clean and work stops before any live mutation.

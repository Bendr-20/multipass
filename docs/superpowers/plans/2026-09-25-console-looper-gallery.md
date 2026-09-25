# Console Owned-Looper Gallery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first-sign-in Looper chooser with a complete, searchable, sortable, accessible marketplace-style gallery that never silently caps the owned roster and links to the verified OpenSea collection.

**Architecture:** Keep the existing authenticated `/api/loopers/owned` and agent activation paths. Add a small pure gallery-model module for filtering and sorting, render the gallery from the existing Console snapshot, and extend existing request-generation checks so stale roster responses cannot commit after refreshes or wallet changes. The API remains fail-closed against onchain `balanceOf` and gains explicit multi-page/many-agent regression coverage.

**Tech Stack:** Vanilla ES modules, server-rendered template strings, DOM event binding, Node test runner, jsdom, viem, Vite CSS/build pipeline.

**Source design:** `docs/superpowers/specs/2026-09-25-console-looper-gallery-design.md`

---

## File map

- Create `apps/web/src/console-agent-gallery.js`: pure query/sort/filter model; no DOM or network access.
- Create `apps/web/test/console-agent-gallery.test.mjs`: focused gallery-model tests, including 7,777 entries.
- Modify `apps/web/src/multipass-console.js`: gallery snapshot fields, semantic markup, ARIA/status/focus hooks, OpenSea link.
- Modify `apps/web/src/app.js`: gallery state, controls, refresh action, stale-response request ID, focus restoration.
- Modify `apps/web/src/styles.css`: internal scroll container, exact responsive breakpoints, card layout, focus/touch sizing.
- Modify `apps/web/test/multipass-console.test.mjs`: renderer states, card count, labels, accessibility, marketplace URL.
- Modify `apps/web/test/app.test.mjs`: interactions, refresh races, wallet changes, activation failure focus.
- Create `apps/web/test/console-agent-gallery-browser.test.mjs`: full-DOM 7,777-card and measured responsive browser gate using `playwright-core` with `/snap/bin/chromium`.
- Modify `apps/api/test/loopers-owned-agents.test.mjs`: Blockscout pagination and >10 endpoint response.

## Chunk 1: Pure gallery model and renderer

### Task 1: Add deterministic search and sorting

**Files:**
- Create: `apps/web/src/console-agent-gallery.js`
- Create: `apps/web/test/console-agent-gallery.test.mjs`

- [ ] **Step 1: Write failing tests for the default and all four sort modes**

Test `createConsoleAgentGalleryModel({ agents, query, sort })` with token IDs `10`, `2`, `30` and mixed-case names. Assert the default is numeric token ascending and explicit modes are `token-desc`, `name-asc`, and `name-desc`.

- [ ] **Step 2: Write failing tests for name/token search and filtered-empty state**

Assert case-insensitive name search, token substring search, source-array immutability, and `{ emptyKind: 'filtered' }` when a nonempty roster has zero matches.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `node --test apps/web/test/console-agent-gallery.test.mjs`

Expected: FAIL because `console-agent-gallery.js` does not exist.

- [ ] **Step 4: Implement the pure model**

Export constants for the four sort values and implement a model shaped like:

```js
{
  total: source.length,
  visible: filteredAndSorted,
  query: normalizedQuery,
  sort: normalizedSort,
  emptyKind: source.length === 0 ? 'owned' : filteredAndSorted.length === 0 ? 'filtered' : null,
}
```

Copy before sorting; compare token IDs numerically with stable name/token tie-breakers.

- [ ] **Step 5: Add the 7,777-entry no-truncation test**

Generate tokens `1..7777`, assert `total === 7777`, `visible.length === 7777`, the first/last token under both numeric directions, deterministic keyboard/document order, and a search hit near the tail.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `node --test apps/web/test/console-agent-gallery.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit the pure model**

```bash
git add apps/web/src/console-agent-gallery.js apps/web/test/console-agent-gallery.test.mjs
git commit -m "feat: add complete Looper gallery model"
```

### Task 2: Render the semantic gallery and truthful states

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/test/multipass-console.test.mjs`

- [ ] **Step 1: Write failing renderer tests**

Add tests asserting:

- 24 agents produce 24 `.console-agent-gallery-card` articles and 24 uniquely named `Open … Looper #…` buttons.
- Success renders exactly `All 24 Loopers loaded`.
- Loading and error states contain no success count/completion text.
- Owned-empty and filtered-empty are distinct; filtered-empty preserves total and includes `Clear search`.
- Artwork alt text includes display name and token ID; verification is visible text.
- The gallery heading exists and can receive temporary programmatic focus.
- The OpenSea link is exactly `https://opensea.io/collection/loopers-639312714`, opens `_blank`, and has `rel="noopener noreferrer"`.

- [ ] **Step 2: Run the renderer tests and verify RED**

Run: `node --test apps/web/test/multipass-console.test.mjs`

Expected: new gallery assertions fail against the current onboarding cards.

- [ ] **Step 3: Extend the Console snapshot and primary-workspace routing**

Import the pure gallery model. Add normalized `galleryQuery`, `gallerySort`, `galleryModel`, truthful roster status, completion copy, and disabled/busy state without changing room or wallet snapshot semantics. Route every authenticated, unselected state—loading, loaded/nonempty, loaded/empty, and roster error—to the gallery; do not fall through to the thread workspace merely because `needsAgentSelection` is false.

- [ ] **Step 4: Replace onboarding card markup with gallery markup**

Render:

- labelled section and heading
- search input and four-option sort select
- polite live status region and `aria-busy`
- scroll-region card grid
- owned-empty, filtered-empty, loading, and error/retry states
- refresh and verified OpenSea actions

Keep `data-action="activate-console-room"` and `data-token-id` so the existing activation path remains authoritative.

- [ ] **Step 5: Run the renderer tests and verify GREEN**

Run: `node --test apps/web/test/multipass-console.test.mjs`

Expected: all existing and new renderer tests pass.

- [ ] **Step 6: Commit the renderer**

```bash
git add apps/web/src/multipass-console.js apps/web/test/multipass-console.test.mjs
git commit -m "feat: render owned Looper gallery"
```

## Chunk 2: App interactions and race safety

### Task 3: Bind gallery controls and stale-response protection

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing interaction tests**

Add tests that type a query, choose each sort option, clear search, refresh ownership, and open an agent beyond position ten. Assert search/sort do not mutate the source roster.

- [ ] **Step 2: Write failing race tests**

Use deferred fetch promises to prove:

- refresh request 2 resolves before request 1 and remains authoritative
- wallet B authenticates before wallet A's request resolves and only wallet B's roster is shown
- stale success/error responses do not change cards, status, announcements, or focus

- [ ] **Step 3: Write failing focus and wallet-operation-lock tests**

Assert:

- explicit refresh success temporarily gives the heading `tabindex="-1"`, focuses it, and removes the attribute on blur
- explicit retry failure focuses the alert
- activation failure rolls back the pending selection, re-renders the gallery, re-queries the triggering `Open` button by token ID, and restores focus to that new DOM node
- `Refresh ownership` is disabled and ignored while wallet work is `prepared`, `submitted`, or `uncertain`

- [ ] **Step 4: Run the app tests and verify RED**

Run:

```bash
node --test --test-name-pattern='dedicated Console|Console' apps/web/test/app.test.mjs
```

Expected: new actions, request ID, wallet-operation lock, rollback, and focus semantics are absent.

- [ ] **Step 5: Add gallery state and events**

Add initial/reset state:

```js
consoleAgentGallery: { query: '', sort: 'token-asc' },
consoleOwnedAgentsRequestId: 0,
```

Bind `input`/`change`/click events for query, sort, clear, and refresh. Re-render locally for query/sort without refetching.

- [ ] **Step 6: Harden `refreshConsoleOwnedAgents`**

Increment and capture a request ID before each request. Commit loading/success/error only when both request ID and normalized authenticated wallet still match. Wallet/session resets increment the ID and clear roster state.

- [ ] **Step 7: Implement focus transitions and refresh locking without duplicate activation paths**

Track the reason and token ID for explicit refresh, retry, and card activation rather than retaining stale DOM nodes. On activation failure, restore the prior unselected state, re-render the gallery, query `[data-action="activate-console-room"][data-token-id="…"]`, and focus it. Use one-shot blur cleanup for temporary heading tabindex; do not steal focus on initial automatic load. Disable and ignore refresh when `hasNonterminalLooperWalletWork` is true.

- [ ] **Step 8: Run the focused app tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='dedicated Console|Console' apps/web/test/app.test.mjs
node --test apps/web/test/multipass-console.test.mjs apps/web/test/console-agent-gallery.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit app behavior**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "feat: make Looper gallery interactive and race-safe"
```

### Task 4: Add responsive Console styling

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/multipass-console.test.mjs`

- [ ] **Step 1: Add failing structural style assertions**

Assert the source contains the named gallery classes, `max-height: min(70vh, 720px)`, `overflow-y: auto`, 44px minimum interactive targets, and media rules at 1120px, 760px, and 480px.

- [ ] **Step 2: Implement the gallery styles**

Use the existing Inter/system inheritance and current Console palette. Apply four/three/two/one columns at the approved breakpoints, card `min-width: 0`, safe text wrapping, lazy-image sizing, visible focus, and no horizontal overflow.

- [ ] **Step 3: Run focused renderer/style tests**

Run: `node --test apps/web/test/multipass-console.test.mjs`

Expected: all tests pass.

- [ ] **Step 4: Commit styling**

```bash
git add apps/web/src/styles.css apps/web/test/multipass-console.test.mjs
git commit -m "style: add responsive Console Looper gallery"
```

## Chunk 3: Complete-roster API proof and release verification

### Task 5: Lock API pagination and >10 behavior

**Files:**
- Modify: `apps/api/test/loopers-owned-agents.test.mjs`

- [ ] **Step 1: Add a two-page Blockscout characterization test**

Return page 1 with ten token IDs plus `next_page_params`, then page 2 with the remainder. Assert both requests preserve `holder_address_hash`, all token IDs are returned, and the ownerOf fallback is not invoked.

- [ ] **Step 2: Add an authenticated endpoint test with more than ten agents**

Return 24 agents from the injected loader and assert `/api/loopers/owned` responds with all 24 in order.

- [ ] **Step 3: Run the API characterization tests**

Run: `node --test apps/api/test/loopers-owned-agents.test.mjs`

Expected: tests pass with the existing fail-closed loader. If either characterization fails, preserve the failing evidence, make only the minimal loader correction, and rerun.

- [ ] **Step 4: Commit API proof**

```bash
git add apps/api/src/loopers-owned-agents.js apps/api/test/loopers-owned-agents.test.mjs
git commit -m "test: prove complete owned Looper rosters"
```

### Task 6: Run full-DOM, regression, build, and visual gates

**Files:**
- Create: `apps/web/test/console-agent-gallery-browser.test.mjs`
- Modify only if a verified regression requires a fix.

- [ ] **Step 1: Run focused gallery/Console/API tests**

```bash
node --test apps/web/test/console-agent-gallery.test.mjs
node --test apps/web/test/multipass-console.test.mjs
node --test apps/api/test/loopers-owned-agents.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Add and run the full-DOM browser gate**

Serve `renderMultipassConsole` output plus `styles.css` from a local HTTP server inside `console-agent-gallery-browser.test.mjs`, then launch `playwright-core` with `CHROMIUM_PATH=/snap/bin/chromium`. Require a 100-agent owner-scale gallery to become interactive within two seconds. Separately, with 7,777 synthetic agents, assert all card articles and activation buttons exist in DOM order and tail search remains selectable without coupling that extreme completeness proof to a host-load-sensitive wall-clock threshold. At widths `320`, `479`, `480`, `759`, `760`, `1119`, and `1120`, measure `scrollWidth <= clientWidth`, expected column count, and every gallery control/button rectangle at least 44px in both dimensions.

Run:

```bash
CHROMIUM_PATH=/snap/bin/chromium node --test apps/web/test/console-agent-gallery-browser.test.mjs
```

Expected: all browser measurements pass.

- [ ] **Step 3: Run the affected web integration slice and remaining web tests**

Run:

```bash
node --test --test-name-pattern='dedicated Console|Console' apps/web/test/app.test.mjs
for file in apps/web/test/*.test.mjs; do
  case "$file" in
    *app.test.mjs|*console-agent-gallery-browser.test.mjs) continue ;;
  esac
  node --test "$file" || exit 1
done
```

Expected: every command exits 0; record exact counts.

- [ ] **Step 4: Run the production build sequentially with bounded heap**

Use the established sequence:

```bash
MULTIPASS_BASE=/multipass/ VITE_PRIVY_APP_ID=cmlv6ibdm00350el2jsm8m8s6 \
  node --max-old-space-size=1152 apps/web/node_modules/vite/bin/vite.js build
node apps/web/scripts/write-allowlist-entry.mjs
node apps/web/scripts/build-activate-looper-3802.mjs --dist
node apps/web/scripts/build-looper-multipass-profiles.mjs --dist
```

Expected: Vite and all post-build scripts exit 0.

- [ ] **Step 5: Capture desktop and mobile screenshots**

Extend the browser gate to write success screenshots at 1440px and 480px plus loading, filtered-empty, owned-empty, and error screenshots. The automated width measurements already cover all seven breakpoint boundaries; inspect the captures for existing font stack and visual hierarchy.

Run:

```bash
CAPTURE_GALLERY=1 CHROMIUM_PATH=/snap/bin/chromium node --test apps/web/test/console-agent-gallery-browser.test.mjs
```

Expected: test exits 0 and writes the named captures under `/home/ubuntu/.openclaw/workspace/`.

- [ ] **Step 6: Run final repository checks**

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only intended source/test changes and pre-existing untracked dependency links remain.

- [ ] **Step 7: Perform direct code review before deployment**

Review the final commit range directly in the main session because subagents are disabled. Resolve verified issues and rerun the smallest affected gate.

- [ ] **Step 8: Present screenshots and proof; do not deploy without approval**

Report exact test/build evidence, attach desktop/mobile captures, name any environment-only limitations, and wait for explicit deployment approval.

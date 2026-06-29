# Multipass Profile Organization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize resolved/saved Multipass profile pages so the profile visual leads, homepage activation/example chunks are removed, and secondary details live in collapsible drawers.

**Architecture:** Add a distinct resolved/saved profile-page render path inside `apps/web/src/app.js` rather than reusing the homepage stack. Keep the homepage unchanged. Keep resolver loading/error/ambiguous-match states on the existing resolver-visible shell until a profile is successfully resolved, so validation and retry UX does not disappear. Reuse existing section renderers by wrapping them in native `<details>` drawers where possible, and synthesize a visual card if `data.visualIdentity` is absent.

**Tech Stack:** Vanilla JS renderer, CSS, Node test runner with JSDOM, Vite build.

---

## File Structure

- Modify `apps/web/src/app.js`
  - Add `isResolvedProfileView(state)`, `renderProfilePage(root, state, handlers)`, `renderProfileVisual(data, selectedAgent)`, selected-agent derivation, and drawer helpers.
  - Use `renderProfilePage()` only for successful loaded/saved/static profile views. Keep current resolver-visible shell for `resolverStatus === 'loading'`, `resolverStatus === 'error'`, and ambiguous lookup states.
  - Keep `renderProductHome()` and homepage activation unchanged.
  - Reuse existing renderers where possible: `renderAgentAura`, `renderAgentAuraProvenanceDrawer`, `renderMarketplaceListing`, `renderFragmentTrustMap`, `renderProofRow`, `renderSharePanel`, `renderActivationSummary`, `renderSavePanel`, `renderClaimManagementPanel`.
- Modify `apps/web/src/styles.css`
  - Add `.multipass-profile-page`, `.profile-detail-drawers`, `.profile-detail-drawer`, `.profile-detail-drawer-body`, and fallback visual styles if needed.
  - Ensure mobile stays single-column and nested old sections do not create excessive margins inside drawers.
- Modify `apps/web/test/app.test.mjs`
  - Add regression tests for profile-only structure, resolver transitional states, selected agent derivation, fallback visual, exact drawer titles/defaults, and JSON toggles inside drawers.
  - Update stale tests that expected homepage education cards/default activation chunks on resolved profile pages.
- Modify `apps/web/test/mobile-layout.test.mjs`
  - Add CSS assertions for profile layout/drawers.

## Chunk 1: Profile render path and structure tests

### Task 1: Add failing tests for profile page organization

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing resolved-profile tests**

For `/multipass/?agent=81` after live data resolves, assert:

```js
const profile = root.querySelector('.multipass-profile-page');
assert.ok(profile);
assert.ok(profile.querySelector(':scope > .aura-card'));
assert.equal(profile.querySelector('.live-resolver'), null);
assert.equal(profile.querySelector('.profile-gallery'), null);
assert.equal(profile.querySelector('.homepage-hero'), null);
assert.equal(profile.querySelectorAll('.profile-detail-drawer').length >= 5, true);
assert.deepEqual([...profile.querySelectorAll('.profile-detail-drawer summary span')].map((node) => node.textContent), [
  'Share and status',
  'Ownership and management',
  'Visual provenance',
  'Trust context',
  'Public proof fragments',
  'Proof ledger',
]);
assert.match(profile.querySelector('.profile-detail-drawers')?.textContent ?? '', /Proof ledger/);
```

- [ ] **Step 2: Write failing saved/static profile tests**

For an existing saved/static profile route, assert:

```js
assert.equal(root.querySelector('.multipass-profile-page .live-resolver'), null);
assert.equal(root.querySelector('.multipass-profile-page .profile-gallery'), null);
assert.ok(root.querySelector('.multipass-profile-page > .aura-card'));
```

- [ ] **Step 3: Write resolver transitional-state tests**

For invalid input, ambiguous lookup, and loading states, assert the resolver still renders and the profile-first layout does not replace it:

```js
assert.ok(root.querySelector('.live-resolver'));
assert.equal(root.querySelector('.multipass-profile-page'), null);
```

- [ ] **Step 4: Write fallback visual and selected-agent tests**

When `data.visualIdentity` is absent, profile view must still start with an `.aura-card` derived from selected/profile data. Quigbot live data must not show Bendr as the leading card:

```js
assert.ok(root.querySelector('.multipass-profile-page > .aura-card'));
assert.match(root.querySelector('.aura-card')?.textContent ?? '', /Quigbot/);
assert.doesNotMatch(root.querySelector('.aura-card')?.textContent ?? '', /Bendr 2\.0/);
```

- [ ] **Step 5: Run tests to verify they fail**

Run:

```bash
node --test apps/web/test/app.test.mjs
```

Expected: FAIL because profile pages still render homepage hero, resolver, gallery, and no profile drawers.

### Task 2: Implement separate profile renderer

**Files:**
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Gate the profile-first renderer**

Add `isResolvedProfileView(state)`:

- Return `false` for `pageKind === 'product_home'`.
- Return `false` for `resolverStatus === 'loading'`, `resolverStatus === 'error'`, or non-empty `lookupMatches`.
- Return `true` for successful loaded profiles, saved profiles, and static profile records.

Change `render()` so:
- `product_home` still calls `renderProductHome()`.
- `isResolvedProfileView(state)` calls `renderProfilePage(root, state, handlers)`.
- Transitional/error states use the existing legacy profile shell until resolved.

- [ ] **Step 2: Add selected-agent derivation**

Add helper that prefers live/profile identity over `state.selectedAgentCard`:

- If `data.resolver.tokenId` or `data.profile.token_id` exists, match `agentCarousel.cards` by token id.
- Else match by `data.profile.display_name` or `data.liveProfilePage.headline` prefix.
- Else fall back to `agentCarousel.cards[state.selectedAgentCard]`.

This prevents Quigbot profiles from showing Bendr after removing gallery controls.

- [ ] **Step 3: Add fallback profile visual**

Add `renderProfileVisual(data, selectedAgent)`:

- If `renderAgentAura(data.visualIdentity)` returns content, use it.
- Else synthesize a `visualIdentity` object from selected agent/profile:
  - `source: 'helixa_aura'`
  - `label: selectedAgent.name` or `profile.display_name` or `Multipass visual`
  - `initials` from display name
  - `tone` from selected agent cred tier/status if available
  - chips from selected agent `helixaId`, `credLabel`, `verifiedLabel`, `custody` when available
- Return `renderAgentAura(syntheticVisualIdentity)`.

- [ ] **Step 4: Add `renderProfilePage()`**

Render:

1. `renderRecordHeader(headerMeta)`
2. `<main class="multipass-profile-page">`
3. `renderProfileVisual(data, selectedAgent)` first
4. `renderProfileDetailDrawers(...)`
5. footer note

Do not render in the profile-first path:
- `renderHomepageHero(...)`
- `renderLiveResolver(...)`
- `renderAgentCarousel(...)`

- [ ] **Step 5: Preserve event bindings**

Extract shared bindings if useful. Ensure profile-first page still binds:
- `[data-action="toggle-json"]`
- save/claim/manual review/profile edit/logout/fragment manager
- reset static demo only if button exists
- lookup-match handlers only if rendered in legacy transitional shell

- [ ] **Step 6: Run tests**

Run:

```bash
node --test apps/web/test/app.test.mjs
```

Expected: profile organization tests pass, existing profile behavior tests either pass or expose stale expectations to update.

## Chunk 2: Collapsible detail drawers

### Task 3: Add drawer helper and wrap secondary sections

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add drawer tests for exact content**

Tests must assert:
- Exact drawer titles are present.
- Most drawers are collapsed by default; choose at most one open default.
- No duplicate `Proof ledger` section outside drawers.
- Existing JSON toggle works inside the `Proof ledger` drawer.

- [ ] **Step 2: Add helper**

```js
function renderProfileDrawer(title, subtitle, html, options = {}) {
  if (!String(html ?? '').trim()) return '';
  const open = options.open ? ' open' : '';
  return `
    <details class="profile-detail-drawer"${open}>
      <summary><span>${escapeHtml(title)}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}</summary>
      <div class="profile-detail-drawer-body">${html}</div>
    </details>
  `;
}
```

- [ ] **Step 3: Add `renderProfileDetailDrawers()`**

Wrap these sections:
- `Share and status`: `renderSharePanel`, `renderSavePanel`, `renderActivationSummary`
- `Ownership and management`: `renderClaimManagementPanel`
- `Visual provenance`: `renderAgentAuraProvenanceDrawer`
- `Trust context`: `renderMarketplaceListing`
- `Public proof fragments`: `renderFragmentTrustMap`
- `Proof ledger`: ledger title + proof rows

Open at most one drawer by default, preferably `Share and status` only if it contains meaningful saved/activated status. Keep secondary details collapsed.

- [ ] **Step 4: Keep proof JSON toggles working inside drawers**

The existing `[data-action="toggle-json"]` binding must still work after wrapping.

- [ ] **Step 5: Run tests**

Run:

```bash
node --test apps/web/test/app.test.mjs
```

Expected: PASS.

## Chunk 3: Styling and deployment

### Task 4: Style profile-first layout

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Add CSS**

Add styles for:

```css
.multipass-profile-page { display: grid; gap: 20px; }
.multipass-profile-page > .aura-card { margin-top: 0; }
.profile-detail-drawers { display: grid; gap: 12px; }
.profile-detail-drawer { border: 1px solid var(--line); background: rgba(255,250,241,.72); }
.profile-detail-drawer summary { cursor: pointer; display: flex; justify-content: space-between; gap: 16px; padding: 18px 20px; }
.profile-detail-drawer-body { border-top: 1px solid var(--soft-line); padding: 0 20px 20px; }
```

Normalize nested section margins inside drawer bodies so old full-width cards do not create huge vertical gaps.

- [ ] **Step 2: Add CSS regression assertions**

Assert `.multipass-profile-page`, `.profile-detail-drawers`, and `.profile-detail-drawer summary` exist.

- [ ] **Step 3: Run focused tests**

```bash
node --test apps/web/test/app.test.mjs apps/web/test/mobile-layout.test.mjs
```

Expected: PASS.

### Task 5: Full verification, deploy, commit, push

**Files:**
- Commit all modified files.

- [ ] **Step 1: Full test/build**

```bash
pnpm test && MULTIPASS_BASE=/multipass/ pnpm web:build
```

Expected: tests pass, build exits 0.

- [ ] **Step 2: Deploy after tests pass**

```bash
rsync -av --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: rsync exits 0.

- [ ] **Step 3: Verify live bundle**

Fetch `https://helixa.xyz/multipass/?v=<commit-or-temp>` and confirm live JS/CSS include:
- `multipass-profile-page`
- `profile-detail-drawer`
- `brand-logo-link` still intact
- no resolved profile page main body includes `Activate a live agent record`

- [ ] **Step 4: Commit and push**

```bash
git add apps/web/src/app.js apps/web/src/styles.css apps/web/test/app.test.mjs apps/web/test/mobile-layout.test.mjs docs/superpowers/plans/2026-06-29-multipass-profile-organization.md
git commit -m "Reorganize Multipass profile pages"
git push
```

Expected: main pushed.

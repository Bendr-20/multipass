# Optional Marketplace Connections Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition marketplace presence as an optional Marketplace Connections slot available on every Multipass profile, with no default OKX/OpenSea claims.

**Architecture:** Keep the existing `marketplacePresence` data model and renderer helpers, but change user-facing copy to Marketplace Connections and render a neutral empty state whenever no valid records exist. Remove the seeded OKX.AI demo record; valid records from OKX.AI, OpenSea, Bankr, ACP, or direct x402 still render as source-referenced public metadata cards.

**Tech Stack:** Node test runner, jsdom, string-rendered Multipass web app, Vite static build.

---

## Chunk 1: Marketplace Connections UI

### File structure

- Modify: `apps/web/src/app.js`
  - Keep `renderMarketplacePresencePanel(data)` for compatibility.
  - Change user-facing copy from Marketplace Presence to Marketplace Connections.
  - Render the panel even when there are no valid marketplace records, using neutral empty-state copy.
  - Preserve existing card rendering, safe links, service payment modes, status/provenance, and platform-verified guardrails.
- Modify: `apps/web/src/static-demo-data.js`
  - Remove the seeded OKX.AI `marketplacePresence` record.
- Modify: `apps/web/test/app.test.mjs`
  - Update existing Marketplace Presence tests to Marketplace Connections behavior.
  - Add tests for empty state on any profile, static swarm route, and OpenSea-style optional card.
  - Extend safety scans to reject registration/integration/x401 overclaims.
- Modify: `docs/superpowers/specs/2026-07-05-multipass-marketplace-presence-design.md`
  - Already updated and committed in this branch. Include in final push.

### Task 1: Update tests first

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add a failing no-record empty-state test**

Add near the current marketplace presence tests:

```js
test('profile Trust context renders Marketplace Connections empty state without records', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = { ...sampleData() };
  delete data.marketplacePresence;

  await createApp({ root, loadDemo: async () => data }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /No marketplace connections published yet/);
  assert.match(panel.textContent, /OKX\.AI/);
  assert.match(panel.textContent, /OpenSea/);
  assert.match(panel.textContent, /Bankr/);
  assert.match(panel.textContent, /ACP/);
  assert.match(panel.textContent, /direct x402/);
  assert.equal(panel.querySelector('.marketplace-presence-card'), null);
  assert.doesNotMatch(panel.textContent, /CertiK Security APIs/);
  assert.doesNotMatch(panel.textContent, /X Layer 196/);
});
```

Expected initial failure: `.marketplace-presence-panel` is missing when no records exist.

- [ ] **Step 2: Update static swarm test to expect empty state, not seeded OKX**

Replace `static Multipass profile includes OKX-style marketplace presence metadata` with:

```js
test('static swarm profile renders empty Marketplace Connections without seeded OKX claim', async () => {
  const root = setupDom('https://helixa.xyz/multipass/swarm/helixa');

  await createApp({ root, prefetchProfiles: false }).start();

  const trustDrawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = trustDrawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /No marketplace connections published yet/);
  assert.equal(panel.querySelector('.marketplace-presence-card'), null);
  assert.doesNotMatch(panel.textContent, /CertiK Security APIs/);
  assert.doesNotMatch(panel.textContent, /X Layer 196/);
  assert.doesNotMatch(panel.textContent, /registered on OKX/i);
  assert.doesNotMatch(panel.textContent, /official OKX integration/i);
});
```

- [ ] **Step 3: Update valid card test labels**

In `profile Trust context renders marketplace presence cards from public metadata`:

- Rename test to `profile Trust context renders Marketplace Connections cards from public metadata`.
- Change assertion from `/Marketplace Presence/` to `/Marketplace Connections/`.
- Keep existing OKX fixture assertions because this test uses injected data and proves valid optional records still render.

- [ ] **Step 4: Update empty data/coexistence test**

In `marketplace presence skips empty data while preserving routes and legacy marketplace listing`:

- Rename to `marketplace connections render empty state while preserving routes and legacy marketplace listing`.
- Change expectation from no `.marketplace-presence-panel` to panel exists with empty state.
- Continue asserting `.public-routes-panel` and `.marketplace-listing` exist.

Expected panel assertions:

```js
const panel = trustDrawer.querySelector('.marketplace-presence-panel');
assert.ok(panel);
assert.match(panel.textContent, /No marketplace connections published yet/);
assert.equal(panel.querySelector('.marketplace-presence-card'), null);
```

- [ ] **Step 5: Add OpenSea-style optional connection test**

Add:

```js
test('OpenSea-style marketplace connection renders as optional public metadata only', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    marketplacePresence: [{
      marketplace: 'OpenSea',
      listingId: 'base:0x2e3B541C59D38b84E3Bc54e977200230A204Fe60:81',
      profileUrl: 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81',
      status: 'manager_supplied',
      source: {
        label: 'OpenSea public item',
        url: 'https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81',
        checkedAt: '2026-07-06T00:00:00Z',
        provenance: 'source-referenced listing',
      },
      services: [{ name: 'Public agent tool manifest', paymentMode: 'metadata only' }],
      paymentRails: ['metadata only'],
      reputation: {},
      proof: { assurance: 'public_metadata', fragmentIds: [] },
    }],
  };

  await createApp({ root, loadDemo: async () => data }).start();

  const panel = root.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Connections/);
  assert.match(panel.textContent, /OpenSea/);
  assert.match(panel.textContent, /Manager supplied/);
  assert.match(panel.textContent, /Public agent tool manifest/);
  assert.match(panel.textContent, /metadata only/);
  assert.doesNotMatch(panel.textContent, /official OpenSea integration/i);
  assert.doesNotMatch(panel.textContent, /registered on OpenSea/i);
  const link = panel.querySelector('a[href="https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/81"]');
  assert.ok(link);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.match(link.getAttribute('rel') ?? '', /noopener/);
  assert.match(link.getAttribute('rel') ?? '', /noreferrer/);
});
```

- [ ] **Step 6: Extend safety wording scan**

In the marketplace safety scan, include:

```js
'official opensea integration',
'registered on okx',
'registered on opensea',
'collects x401 proof',
'requires identity proof',
```

- [ ] **Step 7: Run focused tests and verify RED**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "marketplace presence|Marketplace Connections|OpenSea-style|static swarm profile renders empty"
```

Expected: failing tests because renderer still hides panel for empty records, uses old Marketplace Presence copy, and static data still contains OKX.AI.

### Task 2: Implement renderer and data changes

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/static-demo-data.js`

- [ ] **Step 1: Render empty Marketplace Connections panel**

In `renderMarketplacePresencePanel(data)`, replace the early return:

```js
if (!cards.length) return '';
```

with HTML for an empty-state section. Keep the same `.marketplace-presence-panel` class.

Desired structure:

```js
if (!cards.length) {
  return `
    <section class="marketplace-presence-panel" aria-label="Marketplace Connections">
      <div class="marketplace-presence-heading">
        <p class="card-label">Marketplace Connections</p>
        <h3>Optional marketplace context.</h3>
        <p>No marketplace connections published yet.</p>
      </div>
      <p class="marketplace-presence-empty">Agents can optionally add source-referenced public listings from OKX.AI, OpenSea, Bankr, ACP, direct x402 services, or other marketplaces. Empty means no public connection is published here; it does not imply absence elsewhere.</p>
      <p class="marketplace-presence-safety">Optional public marketplace metadata only. Viewing does not execute marketplace actions, change authority, call tools, release credentials, collect x401 proof, or prove trust by payment alone.</p>
    </section>
  `;
}
```

- [ ] **Step 2: Update non-empty section copy**

In the non-empty return:

- Change `aria-label="Marketplace Presence"` to `aria-label="Marketplace Connections"`.
- Change label text to `Marketplace Connections`.
- Change heading to `Optional marketplace context.`.
- Change intro copy to mention optional public marketplace metadata.
- Update safety copy to include `collect x401 proof` in the negated phrase.

Allowed copy:

```txt
Optional public marketplace metadata for portable trust context. These references do not execute marketplace actions or prove trust by payment alone.
```

Safety copy:

```txt
Optional public marketplace metadata only. Viewing does not execute marketplace actions, change authority, call tools, release credentials, collect x401 proof, or prove trust by payment alone.
```

- [ ] **Step 3: Remove seeded OKX.AI static record**

In `apps/web/src/static-demo-data.js`, delete the root-level `marketplacePresence` array that contains `OKX.AI`, `1965`, `CertiK Security APIs`, and `X Layer 196`.

Important: after deletion, keep the root object valid JavaScript. The property before `marketplacePresence` likely needs no trailing comma if it becomes the last property.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "marketplace presence|Marketplace Connections|OpenSea-style|static swarm profile renders empty"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add apps/web/src/app.js apps/web/src/static-demo-data.js apps/web/test/app.test.mjs docs/superpowers/specs/2026-07-05-multipass-marketplace-presence-design.md
git commit -m "Make marketplace connections optional"
```

### Task 3: Verify, deploy, and smoke

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run:

```bash
git diff --check HEAD~1..HEAD
pnpm test
pnpm web:build
```

Expected:
- `git diff --check` exits 0.
- `pnpm test` passes.
- `pnpm web:build` exits 0 with only existing Privy/Rollup warnings.

- [ ] **Step 2: Deploy verified bundle**

Run:

```bash
rsync -a apps/web/dist/ /var/www/helixa.xyz/multipass/
```

- [ ] **Step 3: Live smoke**

Run:

```bash
main_js=$(grep -o 'assets/index-[^" ]*\.js' /var/www/helixa.xyz/multipass/index.html | tail -1)
main_css=$(grep -o 'assets/index-[^" ]*\.css' /var/www/helixa.xyz/multipass/index.html | tail -1)
curl -fsSL https://helixa.xyz/multipass/ -o /tmp/multipass-home.html
curl -fsSL https://helixa.xyz/multipass/agents -o /tmp/multipass-agents.html
curl -fsSL https://helixa.xyz/multipass/swarm/helixa -o /tmp/multipass-swarm.html
curl -fsSL 'https://helixa.xyz/multipass/?agent=1' -o /tmp/multipass-agent1.html
curl -fsSL "https://helixa.xyz/multipass/$main_js" -o /tmp/multipass-connections.js
curl -fsSL "https://helixa.xyz/multipass/$main_css" -o /tmp/multipass-connections.css
grep -q 'Marketplace Connections' /tmp/multipass-connections.js
grep -q 'No marketplace connections published yet' /tmp/multipass-connections.js
grep -q 'marketplace-presence-panel' /tmp/multipass-connections.css
! grep -qi 'CertiK Security APIs\|X Layer 196\|official OKX integration\|official OpenSea integration\|registered on OKX\|registered on OpenSea\|payment proves trust\|private credentials available\|acts on behalf\|executes tools\|custody transfer\|authority over marketplace account' /tmp/multipass-connections.js
```

Expected: all checks pass.

- [ ] **Step 4: Push source and sync primary checkout**

Run:

```bash
git push origin HEAD:main
git -C /home/ubuntu/multipass pull --ff-only
```

If primary checkout has unrelated untracked docs, do not touch them unless they block the pull. If the updated spec file blocks as an untracked duplicate, compare it byte-for-byte with committed content before moving only that duplicate aside.

- [ ] **Step 5: Update daily memory**

Append a concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-07-06.md` with commit hash, verification, deployed assets, and live smoke result.

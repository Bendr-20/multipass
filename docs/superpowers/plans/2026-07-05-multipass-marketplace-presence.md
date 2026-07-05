# Multipass Marketplace Presence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-agnostic Marketplace Presence cards to Multipass profile Trust context, seeded with OKX.AI-style public metadata.

**Architecture:** Keep marketplace presence as profile-level public display metadata, separate from tool execution and payment flows. Add a focused renderer in `apps/web/src/app.js`, seed generic `marketplacePresence` demo data in `apps/web/src/static-demo-data.js`, and prove behavior through web tests in `apps/web/test/app.test.mjs`.

**Tech Stack:** React-free string-rendered web app, Node test runner, jsdom, Vite, existing Multipass static data model.

---

## Chunk 1: Marketplace Presence Cards

### File structure

- Modify: `apps/web/src/app.js`
  - Add `renderMarketplacePresencePanel(data)` and small helper functions near existing `renderMarketplaceListing()` helpers.
  - Integrate the panel into the profile Trust context drawer between public routes and existing `marketplaceListing`.
  - Reuse existing `renderSafeLink()` and `isRenderablePublicUrl()` for URL safety.
- Modify: `apps/web/src/static-demo-data.js`
  - Add one generic `marketplacePresence` array to the static demo data, using OKX.AI-style public metadata.
  - Include X Layer chain id `196` as marketplace/payment-chain context, not as AgentDNA custody chain.
- Modify: `apps/web/test/app.test.mjs`
  - Add failing tests before implementation.
  - Cover rendering, safe links, empty state, existing panel coexistence, platform-verified guardrails, and forbidden copy.
- Modify: `apps/web/src/styles.css`
  - Add minimal card styles aligned with existing Trust context panels.

### Task 1: Add marketplace presence rendering tests first

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write a failing Trust context render test**

Add a test near the existing Trust context/profile drawer tests:

```js
test('profile Trust context renders marketplace presence cards from public metadata', async () => {
  const data = {
    ...sampleData(),
    marketplacePresence: [{
      marketplace: 'OKX.AI',
      listingId: '1965',
      profileUrl: 'https://www.okx.ai/agents/1965',
      title: 'CertiK on OKX.AI',
      summary: 'Public marketplace metadata for portable trust context.',
      status: 'public_import',
      source: {
        label: 'OKX.AI public listing',
        url: 'https://www.okx.ai/agents/1965',
        checkedAt: '2026-07-05T21:45:02Z',
      },
      services: [{
        name: 'CertiK Security APIs',
        price: '0.001 USDT',
        paymentMode: 'x402 marketplace checkout',
        endpointUrl: 'https://skills-for-okx.certik.com/api/services',
      }],
      reputation: {
        score: '5.0',
        positiveRate: '100%',
        soldCount: 53,
        reviewCount: 1,
      },
      paymentRails: ['USDT', 'x402', 'X Layer 196'],
      proof: { assurance: 'public_metadata', fragmentIds: [] },
    }],
  };
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root, loadDemo: async () => data }).start();

  const profile = root.querySelector('.multipass-profile-page');
  const drawer = profileDrawerByTitle(profile, 'Trust context');
  assert.ok(drawer);
  const panel = drawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Marketplace Presence/);
  assert.match(panel.textContent, /OKX\.AI/);
  assert.match(panel.textContent, /1965/);
  assert.match(panel.textContent, /CertiK Security APIs/);
  assert.match(panel.textContent, /0\.001 USDT/);
  assert.match(panel.textContent, /x402 marketplace checkout/);
  assert.match(panel.textContent, /X Layer 196/);
  assert.match(panel.textContent, /5\.0/);
  assert.match(panel.textContent, /100%/);
  assert.match(panel.textContent, /53 sold/);
  assert.match(panel.textContent, /1 review/);
  assert.match(panel.textContent, /2026-07-05T21:45:02Z/);
  assert.match(panel.textContent, /public marketplace metadata/i);
  assert.match(panel.textContent, /does not execute marketplace actions/i);
  assert.match(panel.textContent, /does not prove trust by payment alone/i);
});
```

- [ ] **Step 2: Write a failing safe-link test**

Add this test near the new render test:

```js
test('marketplace presence links only render safe public URLs', async () => {
  const data = {
    ...sampleData(),
    marketplacePresence: [{
      marketplace: 'Unsafe Market',
      listingId: 'bad-1',
      profileUrl: 'javascript:alert(1)',
      title: 'Unsafe listing',
      source: { label: 'Unsafe source', url: 'https://example.com/source', checkedAt: '2026-07-05T00:00:00Z' },
      services: [{ name: 'Unsafe service', endpointUrl: 'https://user:pass@example.com/private' }],
      reputation: {},
      paymentRails: [],
      proof: { assurance: 'public_metadata', fragmentIds: [] },
    }],
  };
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root, loadDemo: async () => data }).start();

  const panel = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')
    .querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.equal(panel.querySelector('a[href="javascript:alert(1)"]'), null);
  assert.equal(panel.querySelector('a[href="https://user:pass@example.com/private"]'), null);
  const sourceLink = panel.querySelector('a[href="https://example.com/source"]');
  assert.ok(sourceLink);
  assert.equal(sourceLink.getAttribute('target'), '_blank');
  assert.equal(sourceLink.getAttribute('rel'), 'noopener noreferrer');
});
```

- [ ] **Step 3: Write a failing empty-state/coexistence test**

Add this test near the new render tests:

```js
test('marketplace presence skips empty data while preserving routes and legacy marketplace listing', async () => {
  const data = {
    ...sampleData(),
    marketplacePresence: [],
    marketplaceListing: {
      title: 'Legacy compatibility listing',
      summary: 'Existing compatibility panel still renders.',
      score: { tier: 'Preferred', label: 'Cred 80' },
      identity: { helixaId: '8453:1', framework: 'OpenClaw', verifiedLabel: 'Verified', sourceLabel: 'Helixa' },
      routes: [{ label: 'Profile', value: 'Multipass profile', url: 'https://helixa.xyz/multipass/bendr-2-1' }],
      paymentReferences: [{ value: 'USDC metadata', source: 'Bankr' }],
      proof: { publicFragmentCount: 7, verifiedSignalCount: 4, reviewRequiredCount: 1 },
    },
  };
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root, loadDemo: async () => data }).start();

  const drawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  assert.ok(drawer);
  assert.equal(drawer.querySelector('.marketplace-presence-panel'), null);
  assert.ok(drawer.querySelector('.marketplace-listing'));
  assert.match(drawer.textContent, /Legacy compatibility listing/);
  assert.match(drawer.textContent, /Public routes|No public routes are published yet/);
});
```

- [ ] **Step 4: Write a failing `platform_verified` provenance guard test**

Add a test proving `platform verified` only renders when the entry has both `proof.assurance: 'platform_verified'` and a concrete verified source URL:

```js
test('marketplace presence only renders platform verified with verified source evidence', async () => {
  const data = {
    ...sampleData(),
    marketplacePresence: [
      {
        marketplace: 'Claimed Market',
        listingId: 'claim-only',
        title: 'Claimed platform verification without evidence',
        status: 'platform_verified',
        source: { label: 'Claimed source' },
        proof: { assurance: 'platform_verified', fragmentIds: [] },
      },
      {
        marketplace: 'Verified Market',
        listingId: 'verified-1',
        title: 'Verified source-backed listing',
        status: 'platform_verified',
        source: { label: 'Verified source', url: 'https://example.com/verified', checkedAt: '2026-07-05T00:00:00Z' },
        proof: { assurance: 'platform_verified', fragmentIds: [] },
      },
    ],
  };
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root, loadDemo: async () => data }).start();

  const cards = [...profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context')
    .querySelectorAll('.marketplace-presence-card')];
  assert.equal(cards.length, 2);
  assert.doesNotMatch(cards[0].textContent, /Platform verified source/);
  assert.match(cards[0].textContent, /Public metadata/);
  assert.match(cards[1].textContent, /Platform verified source/);
});
```

- [ ] **Step 5: Write or extend a safety wording scan**

Add or extend a test to ensure marketplace presence does not introduce forbidden claims:

```js
test('marketplace presence safety copy avoids authority payment and credential overclaims', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const text = root.textContent;
  assert.doesNotMatch(text, /payment proves trust|private credentials available|acts on behalf|executes tools|custody transfer|authority over marketplace account|official OKX integration/i);
});
```

- [ ] **Step 6: Run focused tests and verify RED**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "marketplace presence|Trust context renders marketplace"
```

Expected: at least the new marketplace presence tests fail because `.marketplace-presence-panel` does not exist yet.

### Task 2: Implement marketplace presence renderer

**Files:**
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Add `renderMarketplacePresencePanel(data)` near `renderMarketplaceListing()`**

Add this implementation, adjusting only if existing helper names require it:

```js
function renderMarketplacePresencePanel(data) {
  const entries = Array.isArray(data?.marketplacePresence)
    ? data.marketplacePresence.filter(isRenderableMarketplacePresence)
    : [];
  if (!entries.length) return '';

  return `
    <section class="marketplace-presence-panel" aria-label="Marketplace presence">
      <div class="marketplace-presence-head">
        <p class="card-label">Marketplace Presence</p>
        <h3>Agent commerce surfaces</h3>
        <p>Public marketplace metadata for portable trust context. These references do not execute marketplace actions or prove trust by payment alone.</p>
      </div>
      <div class="marketplace-presence-grid">
        ${entries.map(renderMarketplacePresenceCard).join('')}
      </div>
    </section>
  `;
}

function isRenderableMarketplacePresence(entry) {
  return Boolean(entry && (entry.marketplace || entry.title || entry.profileUrl || entry.listingId));
}

function renderMarketplacePresenceCard(entry) {
  const reputation = entry?.reputation ?? {};
  const source = entry?.source ?? {};
  const services = Array.isArray(entry?.services) ? entry.services : [];
  const rails = Array.isArray(entry?.paymentRails) ? entry.paymentRails : [];
  const rawStatus = entry?.status ?? 'public_metadata';
  const rawAssurance = entry?.proof?.assurance ?? rawStatus;
  const hasVerifiedSource = rawAssurance === 'platform_verified' && source?.url && isRenderablePublicUrl(source.url);
  const status = hasVerifiedSource ? rawStatus : (rawStatus === 'platform_verified' ? 'public_metadata' : rawStatus);
  const assurance = hasVerifiedSource ? rawAssurance : (rawAssurance === 'platform_verified' ? 'public_metadata' : rawAssurance);
  const statusLabel = hasVerifiedSource ? 'Platform verified source' : formatDisplayLabel(assurance);

  return `
    <article class="marketplace-presence-card">
      <div class="marketplace-presence-card-head">
        <span>${escapeHtml(entry?.marketplace ?? 'Marketplace')}</span>
        <strong>${escapeHtml(entry?.title ?? entry?.marketplace ?? 'Marketplace listing')}</strong>
      </div>
      <p>${escapeHtml(entry?.summary ?? 'Public marketplace metadata for portable trust context.')}</p>
      <div class="marketplace-presence-facts">
        ${renderListingFact({ label: 'Listing ID', value: entry?.listingId ?? 'Not published' })}
        ${renderListingFact({ label: 'Status', value: formatDisplayLabel(status) })}
        ${renderListingFact({ label: 'Assurance', value: statusLabel })}
        ${renderListingFact({ label: 'Score', value: reputation.score ?? 'Not published' })}
        ${renderListingFact({ label: 'Positive', value: reputation.positiveRate ?? 'Not published' })}
        ${renderListingFact({ label: 'Sold', value: reputation.soldCount == null ? 'Not published' : `${reputation.soldCount} sold` })}
        ${renderListingFact({ label: 'Reviews', value: reputation.reviewCount == null ? 'Not published' : `${reputation.reviewCount} review${Number(reputation.reviewCount) === 1 ? '' : 's'}` })}
        ${renderListingFact({ label: 'Checked', value: source.checkedAt ?? 'Not published' })}
      </div>
      ${renderMarketplacePresenceServices(services)}
      ${rails.length ? `<div class="marketplace-presence-rails">${rails.map((rail) => `<span>${escapeHtml(rail)}</span>`).join('')}</div>` : ''}
      <div class="marketplace-presence-links">
        <span>${renderSafeLink('Profile', entry?.profileUrl)}</span>
        ${source.url ? `<span>${renderSafeLink(source.label ?? 'Source', source.url)}</span>` : ''}
      </div>
      <p class="marketplace-presence-safety">Public marketplace metadata only. Viewing does not execute marketplace actions, change authority, call tools, release credentials, or prove trust by payment alone.</p>
    </article>
  `;
}

function renderMarketplacePresenceServices(services) {
  if (!services.length) return '<div class="marketplace-presence-services"><span>No public services published</span></div>';
  return `
    <div class="marketplace-presence-services">
      ${services.map((service) => `
        <article>
          <strong>${escapeHtml(service?.name ?? 'Service')}</strong>
          <span>${escapeHtml([service?.price, service?.paymentMode].filter(Boolean).join(' · ') || 'Pricing not published')}</span>
          ${service?.endpointUrl ? `<span>${renderSafeLink('Endpoint metadata', service.endpointUrl)}</span>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}
```

- [ ] **Step 2: Integrate into Trust context drawer**

Find:

```js
const publicRoutes = renderPublicRoutesPanel(data);
const trustContext = [publicRoutes, renderMarketplaceListing(data.marketplaceListing)].filter(Boolean).join('') || renderProfileInfoPanel(
```

Replace with:

```js
const publicRoutes = renderPublicRoutesPanel(data);
const marketplacePresence = renderMarketplacePresencePanel(data);
const trustContext = [publicRoutes, marketplacePresence, renderMarketplaceListing(data.marketplaceListing)].filter(Boolean).join('') || renderProfileInfoPanel(
```

- [ ] **Step 3: Run focused tests and verify GREEN for renderer behavior**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "marketplace presence|Trust context renders marketplace"
```

Expected: marketplace presence tests pass. If the safety scan fails, fix copy only, not test expectations.

### Task 3: Seed static OKX.AI-style demo data

**Files:**
- Modify: `apps/web/src/static-demo-data.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add failing static data test**

Add a test that uses the real static loader path, not injected `sampleData()`:

```js
test('static Multipass profile includes OKX-style marketplace presence metadata', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({ root }).start();

  const drawer = profileDrawerByTitle(root.querySelector('.multipass-profile-page'), 'Trust context');
  const panel = drawer.querySelector('.marketplace-presence-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /OKX\.AI/);
  assert.match(panel.textContent, /X Layer 196/);
  assert.match(panel.textContent, /public marketplace metadata/i);
  assert.doesNotMatch(panel.textContent, /official OKX integration/i);
});
```

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "static Multipass profile includes OKX-style"
```

Expected: FAIL because static data has no `marketplacePresence` yet.

- [ ] **Step 2: Add `marketplacePresence` to static demo root object**

In `apps/web/src/static-demo-data.js`, add a top-level sibling near existing `marketplaceListing`, `tools`, or profile-level display metadata:

```js
"marketplacePresence": [
  {
    "marketplace": "OKX.AI",
    "listingId": "1965",
    "profileUrl": "https://www.okx.ai/agents/1965",
    "title": "OKX.AI public listing reference",
    "summary": "Source-referenced OKX.AI public marketplace metadata showing how Multipass can follow an agent across commerce surfaces.",
    "status": "public_import",
    "source": {
      "label": "OKX.AI public listing",
      "url": "https://www.okx.ai/agents/1965",
      "checkedAt": "2026-07-05T21:45:02Z"
    },
    "services": [
      {
        "name": "CertiK Security APIs",
        "price": "0.001 USDT",
        "paymentMode": "x402 marketplace checkout",
        "endpointUrl": "https://skills-for-okx.certik.com/api/services"
      }
    ],
    "reputation": {
      "score": "5.0",
      "positiveRate": "100%",
      "soldCount": 53,
      "reviewCount": 1
    },
    "paymentRails": ["USDT", "x402", "X Layer 196"],
    "proof": {
      "assurance": "public_metadata",
      "fragmentIds": []
    }
  }
]
```

Important: do not use `platform_verified` for this seeded entry. The spec reviewer explicitly warned that `platform_verified` should only render when backed by a real verified source.

- [ ] **Step 3: Run static data test and verify GREEN**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "static Multipass profile includes OKX-style"
```

Expected: PASS.

### Task 4: Style marketplace presence cards without changing layout architecture

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add minimal styles near existing `.marketplace-listing` styles**

Add CSS for:

```css
.marketplace-presence-panel {}
.marketplace-presence-head {}
.marketplace-presence-grid {}
.marketplace-presence-card {}
.marketplace-presence-card-head {}
.marketplace-presence-facts {}
.marketplace-presence-services {}
.marketplace-presence-rails {}
.marketplace-presence-links {}
.marketplace-presence-safety {}
```

Keep visual language consistent with `.marketplace-listing`, `.listing-fact`, and `.public-tools-panel`. Do not introduce new colors or a new page layout.

- [ ] **Step 2: Run focused route tests**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "marketplace presence|static Multipass profile includes OKX-style|Trust context"
```

Expected: PASS.

### Task 5: Full verification, deploy, and commit

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: all tests pass. Current baseline after recent work is 451 tests; count may increase with new tests.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm web:build
```

Expected: exit 0. Existing Vite/Rollup/Privy chunk warnings may appear and are acceptable if unchanged.

- [ ] **Step 3: Deploy verified static bundle**

Run:

```bash
rsync -a apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: command exits 0 and preserves existing share card assets.

- [ ] **Step 4: Smoke live routes and wording**

Run:

```bash
main_js=$(grep -o 'assets/index-[^" ]*\.js' /var/www/helixa.xyz/multipass/index.html | head -1)
curl -fsSL https://helixa.xyz/multipass/ -o /tmp/multipass-home.html
curl -fsSL "https://helixa.xyz/multipass/$main_js" -o /tmp/multipass-marketplace.js
grep -q 'Marketplace Presence' /tmp/multipass-marketplace.js
grep -q 'OKX.AI' /tmp/multipass-marketplace.js
grep -q 'X Layer 196' /tmp/multipass-marketplace.js
! grep -qi 'official OKX integration\|payment proves trust\|private credentials available\|acts on behalf\|executes tools\|custody transfer\|authority over marketplace account' /tmp/multipass-marketplace.js
```

Expected: all checks pass.

- [ ] **Step 5: Commit and push implementation**

Run:

```bash
git status --short
git add apps/web/src/app.js apps/web/src/static-demo-data.js apps/web/src/styles.css apps/web/test/app.test.mjs
git commit -m "Add marketplace presence cards"
git push
```

Expected: commit only includes scoped marketplace presence implementation files. Pre-existing untracked docs should remain untouched unless explicitly requested.

- [ ] **Step 6: Update daily memory**

Append a concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-07-05.md` with commit hash, verification commands, and live smoke result.

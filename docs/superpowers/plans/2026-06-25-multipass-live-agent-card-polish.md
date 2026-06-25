# Multipass Live Agent Card Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a marketplace-style live listing panel for resolved Helixa AgentDNA records while preserving static `/multipass/` behavior and read-only constraints.

**Architecture:** Extend the live Helixa adapter with a normalized `marketplaceListing` model, then render that model through a dedicated UI section between the resolver and existing carousel. Keep raw API fields isolated in the adapter, escape all UI output, allowlist public links and payment references, and add mobile CSS regression coverage before visual styling.

**Tech Stack:** Vanilla ES modules, Vite, Node test runner, public Helixa API fixture JSON, static GitHub Pages artifact copied into Helixa deployment.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-06-25-multipass-live-agent-card-polish-design.md`
- Existing live adapter: `apps/web/src/live-helixa-resolver.js`
- Existing renderer: `apps/web/src/app.js`
- Existing CSS: `apps/web/src/styles.css`
- Existing tests: `apps/web/test/live-helixa-resolver.test.mjs`, `apps/web/test/app.test.mjs`, `apps/web/test/mobile-layout.test.mjs`, `apps/web/test/wording.test.mjs`

## File Structure

- Modify `apps/web/src/live-helixa-resolver.js`
  - Add exported `createLiveMarketplaceListing(agent, tokenId, fragments, profileUrl)`.
  - Add small helpers for listing-safe values, proof counts, public route normalization, public payment reference normalization, and safe public URL normalization.
  - Keep raw Helixa API access contained here.

- Modify `apps/web/src/app.js`
  - Add `renderMarketplaceListing(listing)` and supporting render helpers.
  - Render the listing after `renderLiveResolver(state)` only when `data.marketplaceListing` exists.
  - Add link rendering that accepts already-normalized safe URLs only.

- Modify `apps/web/src/styles.css`
  - Add marketplace listing card styles.
  - Add mobile single-column overrides inside the existing 700px breakpoint.

- Modify `apps/web/test/live-helixa-resolver.test.mjs`
  - Add mapper tests for Bendr 2.0, Quigbot, missing optional fields, safe links, payment references, and private-looking fields.

- Create `apps/web/test/fixtures/helixa-agent-81.json`
  - Store a sanitized public fixture for Quigbot based on the live public API response.

- Modify `apps/web/test/app.test.mjs`
  - Add UI tests proving resolved live data renders the listing and no executable controls.

- Modify `apps/web/test/mobile-layout.test.mjs`
  - Add CSS regression test for listing single-column mobile behavior.

- Modify `apps/web/test/wording.test.mjs`
  - Ensure new source/spec/plan files remain covered by wording gate if the test uses an allowlist.

---

## Chunk 1: Live Marketplace Listing Model

### Task 1: Add mapper tests for Bendr live listing

**Files:**
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Read fixture: `apps/web/test/fixtures/helixa-agent-1.json`

- [ ] **Step 1: Write the failing test**

Add imports if needed:

```js
import agentOneFixture from './fixtures/helixa-agent-1.json' with { type: 'json' };
import { createLiveMarketplaceListing, mapHelixaAgentToMultipassDemo } from '../src/live-helixa-resolver.js';
```

Add a test like:

```js
test('createLiveMarketplaceListing maps Bendr into a marketplace listing', () => {
  const mapped = mapHelixaAgentToMultipassDemo(agentOneFixture);
  const listing = mapped.marketplaceListing;

  assert.equal(listing.title, 'Verified agent listing for Bendr 2.0');
  assert.equal(listing.identity.helixaId, '8453:1');
  assert.equal(listing.identity.framework, 'openclaw');
  assert.equal(listing.score.label, 'Cred 80');
  assert.equal(listing.score.tier, 'Preferred');
  assert.equal(listing.facts.some((fact) => fact.label === 'Owner' && fact.value === '0x27E3...91Ea'), true);
  assert.equal(listing.routes.some((route) => route.label === 'Web' && route.url === 'https://helixa.xyz/agent/1'), true);
  assert.equal(listing.routes.some((route) => route.label === 'MCP' && route.url === 'https://api.helixa.xyz/api/mcp'), true);
  assert.equal(listing.paymentReferences.some((payment) => payment.value === 'USDC'), true);
  assert.equal(listing.paymentReferences.some((payment) => payment.value === 'CRED'), true);
  assert.equal(listing.links.some((link) => link.label === 'Explorer' && link.url?.includes('basescan.org')), true);
  assert.equal(listing.proof.privateCredentialState, 'No secrets or private credentials exposed');
  assert.equal(Number.isInteger(listing.proof.publicFragmentCount), true);
  assert.ok(listing.proof.publicFragmentCount >= 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL because `marketplaceListing` or `createLiveMarketplaceListing` does not exist.

- [ ] **Step 3: Implement minimal mapper shape**

In `apps/web/src/live-helixa-resolver.js`:

- Export `createLiveMarketplaceListing`.
- In `mapHelixaAgentToMultipassDemo`, after fragments are created, include:

```js
const marketplaceListing = createLiveMarketplaceListing(agent, tokenId, fragments, profileUrl);
```

Return it beside `agentCards`:

```js
marketplaceListing,
```

Initial implementation outline:

```js
export function createLiveMarketplaceListing(agent, tokenId, fragments, profileUrl) {
  const displayName = agent?.name || `Agent #${tokenId}`;
  const credValue = hasNumericCred(agent?.credScore) ? Number(agent.credScore) : null;
  const helixaId = `${HELIXA_CHAIN_ID}:${tokenId}`;
  const routes = createPublicRoutes(agent);
  const paymentReferences = createPaymentReferences(agent);

  return {
    title: `${agent?.verified ? 'Verified' : 'Unverified'} agent listing for ${displayName}`,
    subtitle: `${helixaId} · ${agent?.framework ?? agent?.metadata?.framework ?? 'unknown'}`,
    summary: createListingSummary(agent),
    identity: {
      name: displayName,
      helixaId,
      tokenId: String(tokenId),
      framework: agent?.framework ?? agent?.metadata?.framework ?? 'unknown',
      verifiedLabel: agent?.verified ? 'Verified AgentDNA' : 'Unverified AgentDNA',
      sourceLabel: 'Live Helixa API',
    },
    score: {
      label: credValue === null ? 'Cred pending' : `Cred ${credValue}`,
      tier: credValue === null ? 'Unrated' : formatCredTier(credValue),
      value: credValue,
      tone: credValue >= 80 ? 'preferred' : credValue >= 65 ? 'prime' : 'standard',
    },
    badges: createListingBadges(agent),
    facts: createListingFacts(agent, tokenId),
    routes,
    paymentReferences,
    proof: createListingProof(fragments),
    links: createListingLinks(agent, profileUrl),
    safetyNote: 'Public routes and proof are visible; authority and private credentials stay protected.',
  };
}
```

- [ ] **Step 4: Add helper implementations**

Keep helpers small and allowlisted:

```js
function createListingFacts(agent, tokenId) {
  return [
    { label: 'Owner', value: shortAddress(agent?.owner) ?? 'Owner not published' },
    { label: 'Operator', value: shortAddress(agent?.operator) ?? 'Not delegated' },
    { label: 'Token ID', value: String(tokenId) },
    { label: 'Generation', value: stringifyOptional(agent?.generation, 'Not published') },
    { label: 'Version', value: stringifyOptional(agent?.version, 'Not published') },
    { label: 'Points', value: stringifyOptional(agent?.points, 'Not published') },
  ];
}

function createListingProof(fragments) {
  return {
    publicFragmentCount: fragments.length,
    verifiedSignalCount: fragments.filter((fragment) => fragment.status === 'verified').length,
    reviewRequiredCount: fragments.filter((fragment) => ['pending', 'stale'].includes(fragment.status)).length,
    privateCredentialState: 'No secrets or private credentials exposed',
  };
}

function createListingSummary(agent) {
  const categories = agent?.metadata?.serviceCategories ?? [];
  const skills = agent?.skills ?? [];
  const domains = agent?.domains ?? [];
  const descriptors = [...categories, ...skills, ...domains].filter(Boolean).slice(0, 3);
  if (descriptors.length) return `Live AgentDNA record packaged for marketplaces: ${descriptors.join(', ')}.`;
  return 'Live AgentDNA record with public trust, route, and ownership context.';
}

function createListingBadges(agent) {
  return [
    { label: agent?.verified ? 'Verified AgentDNA' : 'Unverified AgentDNA', tone: agent?.verified ? 'verified' : 'review' },
    ...(agent?.soulbound ? [{ label: 'Soulbound', tone: 'neutral' }] : []),
    ...(agent?.metadata?.openToWork ? [{ label: 'Open to work', tone: 'verified' }] : []),
    { label: formatLabel(agent?.framework ?? agent?.metadata?.framework ?? 'unknown'), tone: 'neutral' },
    { label: 'Base', tone: 'neutral' },
  ];
}

function createListingLinks(agent, profileUrl) {
  return [
    profileUrl ? { label: 'Profile', url: safePublicUrl(profileUrl), kind: 'profile' } : null,
    agent?.explorer ? { label: 'Explorer', url: safePublicUrl(agent.explorer), kind: 'explorer' } : null,
  ].filter((link) => link?.url);
}

function stringifyOptional(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS for the new Bendr listing test and existing adapter tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Add live marketplace listing mapper"
```

### Task 2: Add Quigbot fixture and mapper coverage

**Files:**
- Create: `apps/web/test/fixtures/helixa-agent-81.json`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`

- [ ] **Step 1: Create fixture from public API sample**

Create `apps/web/test/fixtures/helixa-agent-81.json` with sanitized public fields only:

```json
{
  "tokenId": 81,
  "agentAddress": "0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4",
  "name": "Quigbot",
  "framework": "openclaw",
  "mintedAt": "2026-02-19T02:48:37.000Z",
  "verified": true,
  "soulbound": true,
  "mintOrigin": "OWNER",
  "generation": 0,
  "version": 0,
  "mutationCount": 0,
  "points": 510,
  "credScore": 75,
  "owner": "0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4",
  "operator": null,
  "socials": { "x": "@quigleynft" },
  "skills": [],
  "domains": [],
  "services": {
    "web": { "url": "https://helixa.xyz/agent/81" },
    "mcp": { "url": "https://api.helixa.xyz/api/mcp" },
    "a2a": { "url": "https://api.helixa.xyz/api/a2a" }
  },
  "metadata": {
    "entityType": "agent",
    "principalType": "agent",
    "openToWork": true,
    "preferredCommunicationChannels": ["web", "mcp", "a2a"],
    "acceptedPayments": [],
    "serviceCategories": [],
    "framework": "openclaw"
  },
  "linkedToken": null,
  "traits": [],
  "explorer": "https://basescan.org/token/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60?a=81"
}
```

- [ ] **Step 2: Write failing Quigbot test**

Add:

```js
import quigbotFixture from './fixtures/helixa-agent-81.json' with { type: 'json' };

test('createLiveMarketplaceListing maps Quigbot with no payment references', () => {
  const listing = mapHelixaAgentToMultipassDemo(quigbotFixture).marketplaceListing;

  assert.equal(listing.title, 'Verified agent listing for Quigbot');
  assert.equal(listing.identity.helixaId, '8453:81');
  assert.equal(listing.score.label, 'Cred 75');
  assert.equal(listing.score.tier, 'Prime');
  assert.equal(listing.paymentReferences.length, 0);
  assert.equal(listing.routes.some((route) => route.label === 'X' && route.value === '@quigleynft'), true);
  assert.equal(listing.routes.some((route) => route.label === 'A2A'), true);
});
```

- [ ] **Step 3: Run test to verify it fails if mapper lacks X/no-payment behavior**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL until routes/payment fallback behavior is complete.

- [ ] **Step 4: Complete route and payment reference helpers**

Implement safe route and payment helpers. These helpers are required by Task 1, so if they were not added there, add them before expecting Task 2 to pass:

```js
function createPublicRoutes(agent) {
  const routes = [];
  for (const [service, config] of Object.entries(agent?.services ?? {})) {
    const routeValue = config?.url ?? config?.handle;
    if (!routeValue) continue;
    routes.push({
      label: formatLabel(service),
      value: String(routeValue),
      url: safePublicUrl(routeValue),
      kind: 'service',
    });
  }
  for (const [network, value] of Object.entries(agent?.socials ?? {})) {
    if (!value) continue;
    routes.push({ label: formatLabel(network), value: String(value), url: socialUrl(network, value), kind: 'social' });
  }
  return routes;
}

function safePublicUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function socialUrl(network, value) {
  const handle = String(value).trim();
  if (!handle) return null;
  const direct = safePublicUrl(handle);
  if (direct) return direct;
  const clean = handle.replace(/^@/, '');
  if (String(network).toLowerCase() === 'x') return `https://x.com/${encodeURIComponent(clean)}`;
  if (String(network).toLowerCase() === 'github' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) return `https://github.com/${clean}`;
  if (String(network).toLowerCase() === 'website') return safePublicUrl(handle);
  return null;
}

function createPaymentReferences(agent) {
  const references = [];
  for (const asset of agent?.metadata?.acceptedPayments ?? []) {
    references.push({ label: 'Accepted reference', value: String(asset).toUpperCase(), chainId: HELIXA_CHAIN_ID, source: 'Helixa metadata' });
  }
  if (agent?.linkedToken?.symbol) {
    references.push({ label: 'Linked token', value: String(agent.linkedToken.symbol).toUpperCase(), chainId: HELIXA_CHAIN_ID, source: 'Helixa linked token' });
  }
  return dedupePaymentReferences(references);
}

function dedupePaymentReferences(references) {
  const seen = new Set();
  return references.filter((reference) => {
    const key = `${reference.label}:${reference.value}:${reference.chainId}:${reference.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs apps/web/test/fixtures/helixa-agent-81.json
git commit -m "Cover live marketplace listing variants"
```

### Task 3: Add privacy and unsafe URL mapper tests

**Files:**
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify: `apps/web/src/live-helixa-resolver.js`

- [ ] **Step 1: Write failing tests for unsafe links and secret-bearing fields**

Add:

```js
test('marketplace listing omits unsafe URLs and secret-bearing fields', () => {
  const agent = {
    tokenId: 999,
    name: 'Unsafe Test',
    credScore: 50,
    verified: true,
    owner: '0x0000000000000000000000000000000000000001',
    services: {
      web: { url: 'javascript:alert(1)' },
      file: { url: 'file:///etc/passwd' },
      safe: { url: 'https://example.com/agent' }
    },
    metadata: {
      acceptedPayments: ['usdc'],
      accessToken: 'do-not-render',
      sessionToken: 'do-not-render'
    },
    private_api_key: 'do-not-render',
    hiddenCredential: 'do-not-render',
    secret: 'do-not-render'
  };

  const mapped = mapHelixaAgentToMultipassDemo(agent);
  const serialized = JSON.stringify(mapped.marketplaceListing);

  assert.equal(serialized.includes('do-not-render'), false);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.value === 'https://example.com/agent' && route.url === 'https://example.com/agent'), true);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.url?.startsWith('javascript:')), false);
  assert.equal(mapped.marketplaceListing.routes.some((route) => route.url?.startsWith('file:')), false);
});
```

- [ ] **Step 2: Run test to verify it fails if unsafe URL helper is incomplete**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL until unsafe URL normalization is implemented.

- [ ] **Step 3: Verify or strengthen safe URL helpers**

`safePublicUrl` and `socialUrl` should already exist from Task 2. Confirm they reject non-http protocols and malformed URLs. If they do not, update them so:

- `https:` and `http:` return normalized URL strings.
- `javascript:`, `data:`, `file:`, malformed URLs, and protocol-relative surprises return `null`.
- Social handles become known safe public URLs only for allowlisted networks such as X and GitHub.

Do not scan raw unknown fields. Only map explicit allowlisted fields.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Harden live listing public field mapping"
```

---

## Chunk 2: Marketplace Listing Renderer

### Task 4: Add UI test for listing render

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Write failing UI test**

Find the existing resolver UI test and add a case with a `loadLiveDemo` stub returning data from `mapHelixaAgentToMultipassDemo(agentOneFixture)`.

Test expectations:

```js
assert.match(root.innerHTML, /Marketplace listing preview/);
assert.match(root.innerHTML, /Verified agent listing for Bendr 2\.0/);
assert.match(root.innerHTML, /Cred 80/);
assert.match(root.innerHTML, /Preferred/);
assert.match(root.innerHTML, /Live Helixa API/);
assert.match(root.innerHTML, /No secrets or private credentials exposed/);
assert.doesNotMatch(root.innerHTML, /instant approval|instant transfer|instant claim|checkout|credential release/i);
const listing = root.querySelector('.marketplace-listing');
assert.ok(listing);
assert.equal(listing.querySelector('button'), null);
assert.equal(listing.querySelector('form'), null);
assert.equal(listing.querySelector('[data-action]'), null);
```

Add a second UI boundary test with a deliberately unsafe listing URL:

```js
test('marketplace listing renderer does not link unsafe URLs', async () => {
  const root = setupDom();
  const data = sampleData();
  data.marketplaceListing = {
    title: 'Verified agent listing for Safe Test',
    summary: 'Safe renderer boundary test.',
    identity: { verifiedLabel: 'Verified AgentDNA' },
    score: { tier: 'Qualified', label: 'Cred 50' },
    badges: [],
    facts: [],
    routes: [{ label: 'Unsafe', value: 'javascript:alert(1)', url: 'javascript:alert(1)', kind: 'service' }],
    paymentReferences: [],
    proof: { publicFragmentCount: 0, verifiedSignalCount: 0, reviewRequiredCount: 0, privateCredentialState: 'No secrets or private credentials exposed' },
    links: [{ label: 'Unsafe link', url: 'javascript:alert(1)' }],
    safetyNote: 'Display only.',
  };
  const app = createApp({ root, loadDemo: async () => data });
  await app.start();

  assert.equal(root.querySelector('.marketplace-listing a[href^="javascript:"]'), null);
  assert.match(root.querySelector('.marketplace-listing').textContent, /Unsafe/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: FAIL because no listing renderer exists.

- [ ] **Step 3: Implement renderer placement**

In `apps/web/src/app.js`, add after resolver:

```js
${renderLiveResolver(state)}
${renderMarketplaceListing(data.marketplaceListing)}
```

Add renderer outline:

```js
function renderMarketplaceListing(listing) {
  if (!listing) return '';
  return `
    <section class="marketplace-listing" aria-labelledby="marketplace-listing-title">
      <div class="listing-head">
        <p class="card-label">Marketplace listing preview</p>
        <h2 id="marketplace-listing-title">${escapeHtml(listing.title)}</h2>
        <p>${escapeHtml(listing.summary)}</p>
        <div class="listing-badges">${listing.badges.map(renderListingBadge).join('')}</div>
      </div>
      <div class="listing-score">
        <span>${escapeHtml(listing.score.tier)}</span>
        <strong>${escapeHtml(listing.score.label)}</strong>
        <p>${escapeHtml(listing.identity.verifiedLabel)}</p>
      </div>
      <div class="listing-facts">${listing.facts.map((fact) => renderListingFact(fact)).join('')}</div>
      ${renderListingRoutes(listing.routes)}
      ${renderListingPayments(listing.paymentReferences)}
      ${renderListingProofStrip(listing.proof)}
      ${renderListingLinks(listing.links)}
      <p class="listing-safety-note">${escapeHtml(listing.safetyNote)}</p>
    </section>
  `;
}
```

- [ ] **Step 4: Add escaped helper renderers**

Add helpers:

```js
function renderListingBadge(badge) {
  return `<span class="listing-badge tone-${escapeHtml(badge.tone ?? 'neutral')}">${escapeHtml(badge.label)}</span>`;
}

function renderListingFact(fact) {
  return `<article><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></article>`;
}
```

Add complete route, payment, proof, and link renderers:

```js
function renderListingRoutes(routes = []) {
  if (!routes.length) return '<section class="listing-routes"><article><span>Routes</span><strong>No public service routes published</strong></article></section>';
  return `<section class="listing-routes">${routes.map((route) => `
    <article>
      <span>${escapeHtml(route.label)}</span>
      <strong>${renderSafeLink(route.value, route.url)}</strong>
    </article>
  `).join('')}</section>`;
}

function renderListingPayments(payments = []) {
  if (!payments.length) return '<div class="listing-payments"><span class="listing-payment">No public payment references published</span></div>';
  return `<div class="listing-payments">${payments.map((payment) => `<span class="listing-payment">${escapeHtml(payment.value)} · ${escapeHtml(payment.source)}</span>`).join('')}</div>`;
}

function renderListingProofStrip(proof) {
  if (!proof) return '';
  return `<section class="listing-proof-strip">
    ${renderListingFact({ label: 'Public proof', value: `${proof.publicFragmentCount} fragments` })}
    ${renderListingFact({ label: 'Verified signals', value: String(proof.verifiedSignalCount) })}
    ${renderListingFact({ label: 'Review queue', value: String(proof.reviewRequiredCount) })}
    ${renderListingFact({ label: 'Private access', value: proof.privateCredentialState })}
  </section>`;
}

function renderListingLinks(links = []) {
  if (!links.length) return '';
  return `<div class="listing-links">${links.map((link) => `<span class="listing-link">${renderSafeLink(link.label, link.url)}</span>`).join('')}</div>`;
}

function renderSafeLink(label, url) {
  if (!isRenderablePublicUrl(url)) return `<span>${escapeHtml(label)}</span>`;
  return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function isRenderablePublicUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(String(url));
    return ['https:', 'http:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

Only pass URLs normalized by the adapter, and keep the renderer guard as a second boundary.

- [ ] **Step 5: Run UI test to verify it passes**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "Render live marketplace listing"
```

### Task 5: Add static-default UI regression

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add test that static page does not require listing**

Add or extend the existing static test:

```js
test('static demo does not require marketplace listing data', async () => {
  const root = setupDom();
  const app = createApp({ root, loadDemo: async () => sampleData() });
  await app.start();

  assert.doesNotMatch(root.innerHTML, /Marketplace listing preview/);
  assert.match(root.innerHTML, /Agent cards that lead with trust/);
});
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit if this required changes**

```bash
git add apps/web/test/app.test.mjs
git commit -m "Cover static listing fallback"
```

Skip commit if the test was already covered and no file changed.

---

## Chunk 3: Styling and Mobile Polish

### Task 6: Add CSS regression for listing mobile layout

**Files:**
- Modify: `apps/web/test/mobile-layout.test.mjs`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing CSS test**

Add:

```js
test('mobile marketplace listing stays single-column without overflow-prone grids', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));

  assert.match(css, /\.marketplace-listing\s*\{/);
  assert.match(css, /\.listing-facts\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(mobileBlock, /\.marketplace-listing\s*\{[^}]*padding:\s*16px;/s);
  assert.match(mobileBlock, /\.listing-facts\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileBlock, /\.listing-routes\s*\{[^}]*grid-template-columns:\s*1fr;/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/mobile-layout.test.mjs
```

Expected: FAIL because listing CSS does not exist.

- [ ] **Step 3: Add desktop/tablet CSS**

In `apps/web/src/styles.css`, near card/listing sections:

```css
.marketplace-listing {
  margin: 28px 0;
  border: 1px solid var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  padding: 24px;
}

.listing-head {
  display: grid;
  gap: 10px;
}

.listing-head h2 {
  font-size: clamp(2.3rem, 5vw, 4.8rem);
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.listing-badges,
.listing-links,
.listing-payments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.listing-badge,
.listing-link,
.listing-payment {
  border: 1px solid var(--line);
  background: var(--paper-soft);
  padding: 8px 10px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.listing-score {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  padding: 18px;
}

.listing-score strong {
  display: block;
  font-size: clamp(2rem, 4vw, 4rem);
  line-height: 0.95;
}

.listing-facts,
.listing-proof-strip,
.listing-routes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
}
```

Keep values readable and aligned with existing styles.

- [ ] **Step 4: Add mobile CSS**

Inside existing `@media (max-width: 700px)`:

```css
.marketplace-listing {
  margin: 22px 0;
  padding: 16px;
}

.listing-head h2 {
  font-size: clamp(2rem, 8.5vw, 2.8rem);
  line-height: 1;
}

.listing-facts,
.listing-proof-strip,
.listing-routes {
  grid-template-columns: 1fr;
}

.listing-score strong {
  font-size: 34px;
}
```

- [ ] **Step 5: Run CSS test to verify it passes**

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/mobile-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles.css apps/web/test/mobile-layout.test.mjs
git commit -m "Style live marketplace listing"
```

### Task 7: Visual smoke locally

**Files:**
- No source changes unless visual smoke exposes a bug.

- [ ] **Step 1: Build with deployment base**

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: Vite build passes and outputs `apps/web/dist`.

- [ ] **Step 2: Serve built artifact under `/multipass/`**

```bash
rm -rf /tmp/multipass-live-card-polish-serve
mkdir -p /tmp/multipass-live-card-polish-serve
ln -s /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-change-review-ledger/apps/web/dist /tmp/multipass-live-card-polish-serve/multipass
python3 -m http.server 46117 --bind 127.0.0.1 --directory /tmp/multipass-live-card-polish-serve
```

Use background process management and stop this server when done.

- [ ] **Step 3: Browser metric check at mobile width**

Use `playwright-core` with `/usr/bin/chromium-browser`:

```bash
node - <<'NODE'
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:46117/multipass/?agent=1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-live-card-polish-mobile-local.png', fullPage: true });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    listing: document.querySelector('.marketplace-listing')?.innerText.slice(0, 300),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.equal(metrics.overflow, 0);
  assert.match(metrics.listing ?? '', /Bendr 2\.0/);
  assert.match(metrics.listing ?? '', /Cred 80/);
  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
})();
NODE
```

Expected:

- `overflow` is `0`.
- `.marketplace-listing` exists.
- Listing text includes Bendr 2.0 and Cred 80.

- [ ] **Step 4: Screenshot top mobile section**

Save:

```text
/home/ubuntu/.openclaw/workspace/multipass-live-card-polish-mobile-local.png
```

Inspect visually or with the image tool. If the listing looks cramped, fix CSS with a new failing mobile test first.

---

## Chunk 4: Wording, Full Verification, Deploy

### Task 8: Extend wording gate if needed

**Files:**
- Modify: `apps/web/test/wording.test.mjs` only if it uses an explicit file allowlist.

- [ ] **Step 1: Inspect wording test coverage**

```bash
sed -n '1,220p' apps/web/test/wording.test.mjs
```

Expected: Identify whether new source/spec/plan files are already included.

- [ ] **Step 2: Add coverage if needed**

The source files are already covered. If the test uses explicit docs paths, add the new spec and plan with the existing `join(repoRoot, ...)` pattern:

```js
join(repoRoot, 'docs/superpowers/specs/2026-06-25-multipass-live-agent-card-polish-design.md'),
join(repoRoot, 'docs/superpowers/plans/2026-06-25-multipass-live-agent-card-polish.md'),
```

- [ ] **Step 3: Run wording test**

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/wording.test.mjs
```

Expected: PASS with no blocked wording.

- [ ] **Step 4: Commit if changed**

```bash
git add apps/web/test/wording.test.mjs
git commit -m "Cover live listing wording"
```

### Task 9: Full local verification

**Files:**
- No source changes unless tests fail.

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass. Record the pass count.

- [ ] **Step 2: Run production build**

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: build passes.

- [ ] **Step 3: Run whitespace check**

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 4: Inspect git status**

```bash
git status --short --branch
```

Expected: only intentional committed changes or a clean working tree.

### Task 10: Push source and deploy Helixa artifact

**Files:**
- Source repo: `/home/ubuntu/.config/superpowers/worktrees/multipass/multipass-change-review-ledger`
- Artifact repo: `/home/ubuntu/helixa/docs/multipass/`
- Live deploy dir: `/var/www/helixa.xyz/multipass/`

- [ ] **Step 1: Push Multipass source**

```bash
git push origin HEAD:main
```

Expected: fast-forward push succeeds. Do not force-push. If rejected, fetch and verify ancestry before pushing.

- [ ] **Step 2: Copy build into Helixa artifact and live dir**

```bash
rm -rf /home/ubuntu/helixa/docs/multipass/* /var/www/helixa.xyz/multipass/*
cp -a apps/web/dist/. /home/ubuntu/helixa/docs/multipass/
cp -a apps/web/dist/. /var/www/helixa.xyz/multipass/
```

- [ ] **Step 3: Commit Helixa artifact**

```bash
git -C /home/ubuntu/helixa diff --check -- docs/multipass
git -C /home/ubuntu/helixa add docs/multipass
git -C /home/ubuntu/helixa commit -m "Add Multipass live listing artifact"
git -C /home/ubuntu/helixa push origin main
```

Expected: artifact commit and push succeed. Leave unrelated `/home/ubuntu/helixa/.gitmodules` and `/home/ubuntu/helixa/foundry.lock` untouched.

### Task 11: Live smoke and memory update

**Files:**
- Append: `/home/ubuntu/.openclaw/workspace/memory/2026-06-25.md`

- [ ] **Step 1: HTTP smoke live URLs**

```bash
curl -sSI https://helixa.xyz/multipass/ | sed -n '1,8p'
curl -sSI 'https://helixa.xyz/multipass/?agent=1' | sed -n '1,8p'
curl -sSI 'https://helixa.xyz/multipass/?agent=81' | sed -n '1,8p'
```

Expected: all return `HTTP/1.1 200 OK`.

- [ ] **Step 2: Live asset and text smoke**

```bash
curl -fsSL https://helixa.xyz/multipass/ | grep -o '/multipass/assets/[^" ]*' | sort
curl -fsSL https://helixa.xyz/multipass/ | grep -qv '/multipass-api'
curl -fsSL 'https://helixa.xyz/multipass/?agent=1' | grep -q 'multipass/assets'
```

Expected: current JS and CSS asset refs exist, and deployed HTML does not contain `/multipass-api`.

- [ ] **Step 3: Production mobile browser smoke**

Run this exact production browser smoke:

```bash
node - <<'NODE'
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const cases = [
  ['https://helixa.xyz/multipass/?agent=1', 'Cred 80', '/home/ubuntu/.openclaw/workspace/multipass-live-card-polish-agent-1-mobile.png'],
  ['https://helixa.xyz/multipass/?agent=81', 'Cred 75', '/home/ubuntu/.openclaw/workspace/multipass-live-card-polish-agent-81-mobile.png'],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', headless: true });
  for (const [url, expectedCred, screenshotPath] of cases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      listing: document.querySelector('.marketplace-listing')?.innerText ?? '',
      executableControlText: /instant approval|instant transfer|instant claim|checkout|credential release/i.test(document.querySelector('.marketplace-listing')?.innerText ?? ''),
    }));
    assert.equal(metrics.scrollWidth, metrics.innerWidth);
    assert.match(metrics.listing, /Marketplace listing preview/);
    assert.match(metrics.listing, new RegExp(expectedCred));
    assert.equal(metrics.executableControlText, false);
    console.log(url, JSON.stringify(metrics, null, 2));
    await page.close();
  }
  await browser.close();
})();
NODE
```

Expected: command exits 0 and saves both screenshots.

- [ ] **Step 4: Append memory note**

Record:

- Multipass source commit.
- Helixa artifact commit.
- Test pass count.
- Build result.
- Live smoke result.
- Screenshot paths.
- Confirmation that `.gitmodules` and `foundry.lock` were left untouched.

- [ ] **Step 5: Final response**

Report concise evidence:

- What changed.
- Commits.
- Verification.
- Live URLs.
- Screenshot attachments with `MEDIA:` lines if useful.

Do not claim completion until all verification above has passed.

# Multipass Activated Loopers Marketplace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/multipass/loopers` page that joins verified released-V1 Looper activations with live OpenSea listings and links users to Multipass profiles and OpenSea items.

**Architecture:** A bounded server-side OpenSea adapter publishes a normalized cached listings feed without exposing credentials. The browser reuses the existing released-wallet event verifier, joins activated token IDs to listing records, and renders a read-only responsive marketplace view. CRED and Season filters remain out of the first release until canonical sources exist.

**Tech Stack:** Node.js 24, native fetch, OpenSea API v2, Base ERC-6551 registry evidence, vanilla JavaScript DOM rendering, CSS, Node test runner, jsdom, Vite/pnpm.

---

## File map

- Create `apps/api/src/looper-marketplace.js`: bounded OpenSea pagination, normalization, deduplication, caching, stale fallback.
- Create `apps/api/test/looper-marketplace.test.mjs`: adapter and cache behavior.
- Modify `apps/api/src/index.js`: public read-only marketplace route and dependency injection.
- Modify `apps/api/src/server.js`: production OpenSea key/config loader wiring.
- Modify `apps/api/test/api-routes.test.mjs` and `apps/api/test/server.test.mjs`: route/server contracts, option parsing, and credential non-disclosure.
- Create `apps/web/src/looper-marketplace.js`: browser API loader, joined view model, filtering and sorting helpers.
- Create `apps/web/test/looper-marketplace.test.mjs`: web model and client tests.
- Modify `apps/web/src/app.js`: page kind, startup load, retry/filter handlers, renderer, navigation, metadata.
- Modify `apps/web/src/styles.css`: responsive marketplace layout and states.
- Modify `apps/web/test/app.test.mjs`: route, cards, controls, failure and retry behavior.
- Modify `docs/loopers/README.md`: public route and source-of-truth notes.

## Chunk 1: Normalized marketplace data boundary

### Task 1: OpenSea listings adapter

**Files:**
- Create: `apps/api/src/looper-marketplace.js`
- Test: `apps/api/test/looper-marketplace.test.mjs`

- [ ] **Step 1: Write failing normalization tests**

Cover exact Base contract matching; ERC-721 quantity-one offers; active, started, unexpired orders; pinned native ETH/Base WETH consideration addresses and item types; rejection of mixed/malformed consideration; token ID bounds; locally derived URLs; lowest-order deduplication; cursor pagination; repeated/oversized cursor rejection; per-page and cumulative byte/page bounds; timeout/abort behavior; malformed top-level pages; and deterministic sort order.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test apps/api/test/looper-marketplace.test.mjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the bounded adapter**

Export constants for the pinned collection/slug and `createLooperMarketplaceListingsLoader(options)`. The returned loader emits only:

`{ schema_version, collection, contract, status, observed_at, listings: [{ token_id, price: { currency, amount, base_units, decimals }, item_url }] }`.

Use integer/base-unit comparison for price ordering; never compare floating-point prices.

- [ ] **Step 4: Add cache and stale-fallback tests**

Assert one upstream scan within a 60-second fresh TTL, coalescing concurrent loads, `fresh|stale` status, stale fallback only for a previously valid snapshot no older than five minutes, rejection after the max-stale TTL, and explicit rejection when no snapshot exists.

- [ ] **Step 5: Run focused tests**

Run: `node --test apps/api/test/looper-marketplace.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add apps/api/src/looper-marketplace.js apps/api/test/looper-marketplace.test.mjs && git commit -m "feat: normalize Looper marketplace listings"`

### Task 2: Public API route and production wiring

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write failing API contract tests**

Inject a fake `looperMarketplaceListingsLoader`; assert unauthenticated GET success, the exact public response, `cache-control: no-store`, unsupported method rejection, safe 503 response when unavailable, and absence of API keys/upstream bodies in responses or logs.

- [ ] **Step 2: Run focused route tests and confirm failure**

Run: `node --test apps/api/test/api-routes.test.mjs --test-name-pattern="Looper marketplace"`
Expected: FAIL with route not found.

- [ ] **Step 3: Add dependency injection and route**

Add the loader to `createMultipassApi` context. Handle only exact `GET /api/loopers/marketplace/listings`; map adapter-unavailable errors to a stable `marketplace_unavailable` response without leaking upstream bodies or credentials.

- [ ] **Step 4: Wire the production loader**

Read the OpenSea key through the existing reviewed config reader. Extend `parseServerOptions` with tests for the existing `LOOPERS_SALES_OPENSEA_CONFIG_PATH` override, default to `$HOME/.config/opensea/config.json`, construct one cached loader at server startup, and never log the path contents or key.

- [ ] **Step 5: Test server wiring**

Assert that a server with an injected loader serves the route and closes normally; configuration failures leave the route safely unavailable rather than crashing unrelated Multipass routes.

- [ ] **Step 6: Run API tests**

Run: `node --test apps/api/test/looper-marketplace.test.mjs apps/api/test/api-routes.test.mjs apps/api/test/server.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

`git add apps/api/src/index.js apps/api/src/server.js apps/api/test/api-routes.test.mjs apps/api/test/server.test.mjs && git commit -m "feat: expose activated Looper listing feed"`

## Chunk 2: Multipass marketplace experience

### Task 3: Browser marketplace model and client

**Files:**
- Create: `apps/web/src/looper-marketplace.js`
- Test: `apps/web/test/looper-marketplace.test.mjs`

- [ ] **Step 1: Write failing client/model tests**

Cover `getApiBaseFromLocation()` URL construction with the `/multipass-api` default, response validation, activation/listing joins, the pinned Helixa image base, marketplace-backed `/multipass/loopers/<tokenId>` detail URLs for non-3802 tokens, locally derived OpenSea URLs, all-versus-listed filtering, token search, token sort, price sort, and absence of invented CRED/Season fields.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test apps/web/test/looper-marketplace.test.mjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal web module**

Export `loadLooperMarketplaceListings`, `createActivatedLooperMarketplace`, and `filterActivatedLooperMarketplace`. Keep numeric token IDs normalized as decimal strings and prices as base-unit strings until display formatting.

- [ ] **Step 4: Run focused tests**

Run: `node --test apps/web/test/looper-marketplace.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add apps/web/src/looper-marketplace.js apps/web/test/looper-marketplace.test.mjs && git commit -m "feat: model activated Looper marketplace"`

### Task 4: Route, rendering, controls, and resilient states

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing route/render tests**

At `/multipass/loopers`, assert the dedicated page kind, header/nav entry, loading state, summary metrics, default listed-only view, activation badge, price, lazy pinned image, marketplace-backed profile link, external OpenSea link, and no wallet-connect/purchase action. At `/multipass/loopers/492`, assert a valid first-party Looper detail page without invoking the AgentDNA resolver.

- [ ] **Step 2: Write failing interaction tests**

Assert all-activated/listed toggles, token search, sort controls, empty state, unavailable activation state, unavailable listing state, stale notice, and retry behavior.

- [ ] **Step 3: Run focused DOM tests and confirm failure**

Run: `node --test apps/web/test/app.test.mjs --test-name-pattern="activated Looper marketplace"`
Expected: FAIL because the route is not implemented.

- [ ] **Step 4: Add page state and startup loading**

Add `loopers_marketplace` and `looper_marketplace_detail` page detection and state. Inject marketplace loaders through `createApp` for deterministic tests. Load activation evidence and listing data in parallel; do not render a partial activation roster as authoritative. Add bounded retry and request-generation guards.

- [ ] **Step 5: Render the page and bind controls**

Render summary, controls, cards, source/freshness text, retry and empty states. Add the site-menu link. CRED tier and Season eligibility must not be shown as facts until canonical fields are available.

- [ ] **Step 6: Add responsive styles**

Use the existing Multipass visual language, accessible focus states, a dense responsive grid, image aspect-ratio reservation, and reduced-motion compatibility.

- [ ] **Step 7: Run focused web tests**

Run: `node --test apps/web/test/looper-marketplace.test.mjs apps/web/test/app.test.mjs --test-name-pattern="marketplace|Multipass navigation"`
Expected: PASS.

- [ ] **Step 8: Commit**

`git add apps/web/src/app.js apps/web/src/styles.css apps/web/test/app.test.mjs && git commit -m "feat: add activated Loopers marketplace page"`

## Chunk 3: Integration proof and documentation

### Task 5: Build, smoke test, and document

**Files:**
- Modify: `docs/loopers/README.md`

- [ ] **Step 1: Document the route and trust boundaries**

Document activation source, listing source, refresh behavior, and the fact that OpenSea executes purchases while Multipass is discovery-only.

- [ ] **Step 2: Run focused regression tests**

Run: `node --test apps/api/test/looper-marketplace.test.mjs apps/api/test/api-routes.test.mjs apps/api/test/server.test.mjs apps/web/test/looper-marketplace.test.mjs apps/web/test/app.test.mjs`
Expected: PASS.

- [ ] **Step 3: Build the production web app**

Run: `pnpm web:build`
Expected: Vite build succeeds with the Multipass base path.

- [ ] **Step 4: Run the full repository test suite**

Run: `pnpm test`
Expected: PASS, or document unrelated pre-existing failures with exact commands and evidence.

- [ ] **Step 5: Run a local API/browser smoke check**

Start an isolated local API/web pair, load `/multipass/loopers`, verify a current activated count, current listed count/floor, image loading, filter controls, profile links, and OpenSea links. Capture a screenshot if browser tooling is available.

- [ ] **Step 6: Review diff and security properties**

Confirm no API key or key-file contents in responses, web assets, or logs; no write/purchase calls; no arbitrary external image URLs; no upstream item URLs; no fabricated CRED/Season claims; a valid non-3802 Multipass detail route; and no unrelated file changes.

- [ ] **Step 7: Commit**

`git add docs/loopers/README.md && git commit -m "docs: document activated Looper marketplace"`

# Multipass Looper CRED Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace every user-facing Looper CRED placeholder or locally derived number in Multipass with one validated, authoritative, server-fetched Looper CRED object.

**Architecture:** The Multipass API will call the canonical Helixa endpoint only after the existing authenticated ownership loader has resolved and authorized each Looper. A focused client will bound the request, validate the complete subject and every displayed field, normalize successful responses, and return typed fail-closed errors; a request-scoped enricher will apply bounded concurrency and deduplicate canonical subjects. The browser will receive the normalized object only through the existing same-origin `/api/loopers/owned` response and render score, coverage, and freshness without deriving CRED from owner activity or token-specific fallback values.

**Tech Stack:** Node.js ESM, native `fetch`/`AbortController`, native `node:test`, existing Multipass HTTP API, Vite, JSDOM, Playwright Core/Chromium, CSS.

---

## Chunk 1: Server-side contract and API integration

### Task 1: Add the canonical CRED client and normalizer

**Files:**
- Create: `apps/api/src/looper-cred-client.js`
- Create: `apps/api/test/looper-cred-client.test.mjs`
- Reference only: `/home/ubuntu/.openclaw/worktrees/15b7eef5dfd557b3/looper-cred-service/api/routes/looper-cred.js`
- Reference only: `/home/ubuntu/.openclaw/worktrees/15b7eef5dfd557b3/looper-cred-service/api/services/looper-cred.js`

- [x] **Step 1: Write failing client contract tests**

Cover the exact request path `GET /api/v2/cred/erc8004/8453/:agentId`, canonical registry query, timeout abort, stable HTTP/unavailable errors, ID/token collision rejection, chain/registry/collection mismatch rejection, score and evidence-coverage bounds, freshness consistency, timestamp/methodology validation, fresh acceptance, and explicitly stale acceptance.

Use the normalized shape:

```js
{
  score: 40,
  tier: 'MARGINAL',
  coverage: {
    score: 45,
    label: 'PARTIAL',
    present: ['binding', 'metadata'],
    missing: ['continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'],
  },
  freshness: {
    status: 'fresh',
    stale: false,
    cached: false,
    ageSeconds: 0,
    maxAgeSeconds: 300,
    staleIfErrorSeconds: 86400,
  },
  methodologyVersion: 'looper-cred-v1',
  computedAt: '2026-09-26T22:00:00.000Z',
  updatedAt: '2026-09-26T22:00:00.000Z',
  status: 'available',
}
```

- [x] **Step 2: Prove RED**

Run:

```bash
node --test apps/api/test/looper-cred-client.test.mjs
```

Expected: FAIL because `apps/api/src/looper-cred-client.js` does not exist.

- [x] **Step 3: Implement the minimal strict client**

Export:

```js
export const CANONICAL_ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
export const LOOPERS_MAINNET_COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const DEFAULT_LOOPER_CRED_API_BASE_URL = 'https://api.helixa.xyz';
export class LooperCredClientError extends Error { /* stable code/status/cause */ }
export function normalizeCanonicalLooperCred(payload, expectedSubject) { /* fail closed */ }
export function createLooperCredClient({ baseUrl, fetchImpl, timeoutMs } = {}) { /* getCred */ }
```

Validation requirements:

- requested and returned chain ID must be `8453`;
- returned registry and collection must equal the canonical addresses case-insensitively;
- returned `agentId` and `looperTokenId` must exactly equal the requested canonical values;
- score and coverage are integers from 0 through 100;
- tier is one of `JUNK`, `MARGINAL`, `QUALIFIED`, `PRIME`, `PREFERRED`;
- coverage label is one of `THIN`, `PARTIAL`, `GOOD`, `STRONG`;
- coverage evidence keys are allowlisted, unique, disjoint, and complete;
- freshness booleans and status agree, age values are nonnegative integers, and stale metadata is preserved;
- methodology and timestamps are valid and bounded;
- untrusted strings are never copied into display fields without validation.

- [x] **Step 4: Prove GREEN**

Run the Task 1 test command and expect all tests to pass.

### Task 2: Enrich authorized owned Loopers with bounded, deduplicated reads

**Files:**
- Modify: `apps/api/src/looper-cred-client.js`
- Modify: `apps/api/test/looper-cred-client.test.mjs`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/loopers-owned-agents.test.mjs`

- [x] **Step 1: Write failing enrichment tests**

Cover:

- enrichment begins only after the existing authenticated ownership loader returns;
- owner changes do not affect the canonical CRED request or result;
- missing ERC-8004 identity produces normalized `status: 'unavailable'` and no upstream call;
- typed timeout/unavailable errors produce no score;
- duplicate canonical subjects trigger one upstream call per response;
- multiple distinct Loopers respect a fixed concurrency ceiling;
- each API card has `cred`, while compatibility `credScore` and `credLabel` are derived only from validated canonical `cred`;
- stale snapshots retain the numeric score but are labeled stale;
- no owner wallet balance, activity, socials, or reputation is passed into the client.

- [x] **Step 2: Prove RED**

Run:

```bash
node --test apps/api/test/looper-cred-client.test.mjs apps/api/test/loopers-owned-agents.test.mjs
```

Expected: FAIL because the request-scoped enricher and route plumbing do not exist.

- [x] **Step 3: Implement minimal enrichment and API plumbing**

Add a request-scoped `enrichOwnedLoopersWithCred` helper that accepts already-authorized Looper cards, uses a concurrency limit of four, deduplicates by canonical chain/identity/token subject, and converts typed failures to:

```js
{
  score: null,
  tier: null,
  coverage: null,
  freshness: null,
  methodologyVersion: null,
  computedAt: null,
  updatedAt: null,
  status: 'unavailable',
  error: { code: 'upstream_timeout' }
}
```

Wrap `loopersOwnedAgentLoader` inside `createMultipassApi` only when a CRED client or configured CRED base URL is supplied. Preserve dependency injection and perform no CRED call before the ownership loader succeeds.

- [x] **Step 4: Prove GREEN**

Run the Task 2 test command and expect all tests to pass.

### Task 3: Add production-safe configuration without secrets

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/README.md`

- [x] **Step 1: Write failing configuration tests**

Assert:

- `MULTIPASS_LOOPER_CRED_API_BASE_URL` defaults to `https://api.helixa.xyz`;
- `MULTIPASS_LOOPER_CRED_TIMEOUT_MS` is a validated positive integer with a bounded default;
- `MULTIPASS_LOOPER_CRED_CONCURRENCY` is validated and capped;
- `startServer` passes configuration into the API factory;
- no credential or browser-exposed environment variable is added.

- [x] **Step 2: Prove RED**

Run:

```bash
node --test apps/api/test/server.test.mjs
```

Expected: FAIL on missing CRED configuration fields.

- [x] **Step 3: Add configuration and documentation**

Parse the three server-only settings, pass them to `createMultipassApi`, and document the same-origin browser boundary and credential-free upstream call.

- [x] **Step 4: Prove GREEN**

Run the Task 3 test command and expect all tests to pass.

---

## Chunk 2: Browser model and compact rendering

### Task 4: Normalize the same canonical object in the browser model

**Files:**
- Modify: `apps/web/src/loopers-console-agents.js`
- Modify: `apps/web/test/console-agent-api.test.mjs`

- [x] **Step 1: Write failing browser-model tests**

Assert fresh, stale, unavailable, and malformed payload behavior; verify `credScore` is derived only from a valid available/stale canonical object; verify no browser request targets `api.helixa.xyz` or `/api/v2/agent/:id/cred`.

- [x] **Step 2: Prove RED**

Run:

```bash
node --test apps/web/test/console-agent-api.test.mjs
```

Expected: FAIL because browser mapping still trusts ambiguous `credScore`/`credLabel` fields.

- [x] **Step 3: Implement minimal browser mapping**

Preserve `agent.cred` as the source of truth, derive compact labels from it, and map absent/invalid data to Pending or Unavailable without inventing a number.

- [x] **Step 4: Prove GREEN**

Run the Task 4 test command and expect all tests to pass.

### Task 5: Render score, coverage, freshness, and fail-closed states

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/console-agent-gallery-browser.test.mjs`

- [x] **Step 1: Write failing UI/model tests**

Cover:

- owned roster card fresh score plus coverage;
- active Console identity data with score/tier, evidence coverage, and freshness;
- stale score explicitly labeled stale;
- Pending/Unavailable without a number;
- HTML escaping for all rendered labels and reason text;
- transfer/owner variation leaves displayed canonical CRED unchanged;
- removal of the Looper `614 -> Cred 65` branch;
- desktop/mobile CRED rendering with no horizontal overflow.

- [x] **Step 2: Prove RED**

Run:

```bash
node --test apps/web/test/multipass-console.test.mjs apps/web/test/console-agent-gallery-browser.test.mjs
```

Expected: FAIL on the new coverage/freshness assertions and the old #614 fallback expectation.

- [x] **Step 3: Implement minimal compact UI**

Pass the normalized `cred` object through roster cards, active identity summary, stats, identity data, and thread context. Render compact coverage and freshness lines using the existing typography, drawers, card grid, and responsive breakpoints. Do not alter wallet execution, approval, signing, or unrelated Console layout.

- [x] **Step 4: Prove GREEN**

Run the Task 5 test command and expect all tests to pass.

### Task 6: Add a production-like same-origin browser smoke

**Files:**
- Create: `apps/web/test/looper-cred-browser.test.mjs`

- [x] **Step 1: Write the browser test**

Serve a production-like page with mocked same-origin `/api/loopers/owned` data containing a validated authoritative CRED response. In Chromium, assert fresh and stale text, coverage, escaped malicious strings, desktop/mobile fit, and zero document/card overflow.

- [x] **Step 2: Prove RED then GREEN**

Run before and after the rendering implementation:

```bash
CHROMIUM_PATH=/snap/bin/chromium node --test apps/web/test/looper-cred-browser.test.mjs
```

Expected final result: PASS at desktop and mobile viewports.

---

## Chunk 3: Regression proof and local commit

### Task 7: Prove no legacy Looper CRED fallback remains and run release gates

**Files:**
- Modify if needed: tests and documentation named above only

- [x] **Step 1: Run focused CRED suites**

```bash
node --test \
  apps/api/test/looper-cred-client.test.mjs \
  apps/api/test/loopers-owned-agents.test.mjs \
  apps/api/test/server.test.mjs \
  apps/web/test/console-agent-api.test.mjs \
  apps/web/test/multipass-console.test.mjs \
  apps/web/test/console-agent-gallery-browser.test.mjs \
  apps/web/test/looper-cred-browser.test.mjs
```

Expected: all pass.

- [x] **Step 2: Scan forbidden fallback and endpoint patterns**

```bash
git grep -n -E "tokenId.*614.*cred|cred.*614.*65|/api/v2/agent/.*/cred" -- apps/api/src apps/web/src apps/api/test apps/web/test
git grep -n "api.helixa.xyz/api/v2/cred" -- apps/web/src
```

Expected: no user-facing token-614 numeric fallback, no legacy ERC-8004-to-Helixa-ID endpoint call, and no direct browser-to-CRED call.

- [x] **Step 3: Run full relevant suites and build**

```bash
node --test apps/api/test/*.test.mjs
node --test apps/web/test/*.test.mjs
pnpm web:build
node --check apps/api/src/looper-cred-client.js
node --check apps/api/src/index.js
node --check apps/api/src/server.js
node --check apps/web/src/loopers-console-agents.js
node --check apps/web/src/multipass-console.js
git diff --check
```

Expected: all tests pass, Vite build succeeds, syntax checks are silent, and `git diff --check` is clean.

- [x] **Step 4: Inspect the final diff and repository state**

```bash
git status --short
git diff --stat
git diff -- apps/api apps/web docs/superpowers/plans/2026-09-26-multipass-looper-cred-integration.md
```

Confirm there are no changes in the backend source repository, no deployment/config mutations, and no tracked `node_modules` content.

- [x] **Step 5: Commit locally**

```bash
git add apps/api apps/web docs/superpowers/plans/2026-09-26-multipass-looper-cred-integration.md
git commit -m "feat: wire canonical Looper CRED into Multipass"
```

- [x] **Step 6: Report evidence**

Report the plan path, local commit SHA, changed files, exact test counts/results, browser smoke and overflow results, screenshots if captured, and the remaining deployment step: set/confirm the server-only CRED API base URL if overriding the production-safe default, then deploy API and static assets in a separately approved release.

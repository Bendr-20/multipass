# Multipass Story Proof Web Demo Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local one-page Multipass web demo that presents Bendr 2.0 as a profile command center with live API proof cards underneath.

**Architecture:** Use a minimal Vite app in `apps/web` with no UI framework. Fetch the existing local API through a Vite proxy at `/multipass-api`, render product-friendly summaries, and let users expand JSON proof cards.

**Tech Stack:** Node 20+ ESM, Vite, jsdom, built-in `node:test`, existing Multipass local API server.

---

## File Structure

- Create `apps/web/package.json`: workspace package metadata, dev/build/preview/test scripts, Vite/jsdom dev dependencies.
- Create `apps/web/index.html`: Vite entry document with `#app` mount.
- Create `apps/web/vite.config.js`: proxy `/multipass-api` to `http://127.0.0.1:8787` and strip the prefix.
- Create `apps/web/src/content.js`: static copy, Bendr subject metadata, and summary helpers.
- Create `apps/web/src/api.js`: URL builders, safe API base parsing, fetch helpers, and normalized `loadMultipassDemo`.
- Create `apps/web/src/app.js`: framework-free renderer, loading/error states, command center, story cards, proof cards, JSON toggles.
- Create `apps/web/src/main.js`: CSS import and app mount.
- Create `apps/web/src/styles.css`: responsive dark product-demo styling.
- Create `apps/web/test/api.test.mjs`: API helper tests.
- Create `apps/web/test/content.test.mjs`: content and summary helper tests.
- Create `apps/web/test/app.test.mjs`: jsdom rendering, loading, error, proof card, JSON toggle, and private-fragment absence tests.
- Modify root `package.json`: add `web:dev`, `web:build`, and `demo:bendr` scripts.
- Remove `apps/web/.gitkeep` once real files exist.

## Chunk 1: API and content foundations

### Task 1: Write failing API helper tests

**Files:**
- Create: `apps/web/test/api.test.mjs`
- Later create: `apps/web/src/api.js`
- Later create: `apps/web/package.json`

- [ ] **Step 1: Create `apps/web/package.json` with test script and dependencies**

```json
{
  "name": "@helixa/multipass-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1 --port 4173",
    "test": "node --test test/*.test.mjs"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create failing `apps/web/test/api.test.mjs`**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDemoRoutes,
  getApiBaseFromLocation,
  loadJson,
  loadMultipassDemo,
} from '../src/api.js';

const subject = { slug: 'bendr-2', receiptId: 'receipt_bendr_lookup' };

test('buildDemoRoutes creates proxied routes for every proof document', () => {
  assert.deepEqual(buildDemoRoutes('/multipass-api', subject), {
    profile: '/multipass-api/api/multipass/bendr-2',
    fragments: '/multipass-api/api/multipass/bendr-2/fragments',
    card: '/multipass-api/api/multipass/bendr-2/agent-card',
    standards: '/multipass-api/api/multipass/bendr-2/standards',
    x402: '/multipass-api/api/multipass/bendr-2/x402',
    receipt: '/multipass-api/api/multipass/bendr-2/receipts/receipt_bendr_lookup',
  });
});

test('getApiBaseFromLocation accepts only safe http URLs and falls back otherwise', () => {
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/')), '/multipass-api');
  assert.equal(
    getApiBaseFromLocation(new URL('http://local.test/?api=http://127.0.0.1:9999/')),
    'http://127.0.0.1:9999',
  );
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=https://api.example.test/base/')), 'https://api.example.test/base');
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=javascript:alert(1)')), '/multipass-api');
  assert.equal(getApiBaseFromLocation(new URL('http://local.test/?api=not-a-url')), '/multipass-api');
});

test('loadJson throws clear errors for failed routes and invalid JSON', async () => {
  await assert.rejects(
    () => loadJson('/bad-route', async () => ({ ok: false, status: 404, text: async () => 'missing' })),
    /GET \/bad-route failed with 404/,
  );

  await assert.rejects(
    () => loadJson('/invalid-json', async () => ({ ok: true, status: 200, text: async () => '{' })),
    /API returned invalid JSON for \/invalid-json/,
  );
});

test('loadMultipassDemo fetches every document and returns normalized data', async () => {
  const calls = [];
  const payloads = {
    '/multipass-api/api/multipass/bendr-2': { multipass_id: 'mp_bendr_2' },
    '/multipass-api/api/multipass/bendr-2/fragments': { fragments: [] },
    '/multipass-api/api/multipass/bendr-2/agent-card': { name: 'Bendr 2.0' },
    '/multipass-api/api/multipass/bendr-2/standards': { standard_refs: [] },
    '/multipass-api/api/multipass/bendr-2/x402': { endpoints: [] },
    '/multipass-api/api/multipass/bendr-2/receipts/receipt_bendr_lookup': { receipt_id: 'receipt_bendr_lookup' },
  };

  const data = await loadMultipassDemo({
    apiBase: '/multipass-api',
    subject,
    fetchImpl: async (route) => {
      calls.push(route);
      return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
    },
  });

  assert.deepEqual(calls, Object.keys(payloads));
  assert.equal(data.profile.multipass_id, 'mp_bendr_2');
  assert.equal(data.receipt.receipt_id, 'receipt_bendr_lookup');
});
```

- [ ] **Step 3: Run API tests and confirm they fail on missing `src/api.js`**

Run:

```bash
cd /home/ubuntu/multipass
pnpm install >/dev/null
pnpm --filter @helixa/multipass-web test -- test/api.test.mjs
```

Expected: FAIL with module not found for `../src/api.js`.

### Task 2: Implement API helpers

**Files:**
- Create: `apps/web/src/api.js`

- [ ] **Step 1: Create `apps/web/src/api.js`**

```js
const DEFAULT_API_BASE = '/multipass-api';

export function getApiBaseFromLocation(locationUrl) {
  const raw = locationUrl.searchParams.get('api');
  if (!raw) return DEFAULT_API_BASE;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_API_BASE;
    return stripTrailingSlash(parsed.toString());
  } catch {
    return DEFAULT_API_BASE;
  }
}

export function buildDemoRoutes(apiBase, subject) {
  const base = stripTrailingSlash(apiBase || DEFAULT_API_BASE);
  const root = `${base}/api/multipass/${encodeURIComponent(subject.slug)}`;
  return {
    profile: root,
    fragments: `${root}/fragments`,
    card: `${root}/agent-card`,
    standards: `${root}/standards`,
    x402: `${root}/x402`,
    receipt: `${root}/receipts/${encodeURIComponent(subject.receiptId)}`,
  };
}

export async function loadJson(route, fetchImpl = fetch) {
  const response = await fetchImpl(route);
  if (!response.ok) {
    throw new Error(`GET ${route} failed with ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`API returned invalid JSON for ${route}: ${error.message}`);
  }
}

export async function loadMultipassDemo({ apiBase = DEFAULT_API_BASE, subject, fetchImpl = fetch }) {
  const routes = buildDemoRoutes(apiBase, subject);
  const [profile, fragments, card, standards, x402, receipt] = await Promise.all([
    loadJson(routes.profile, fetchImpl),
    loadJson(routes.fragments, fetchImpl),
    loadJson(routes.card, fetchImpl),
    loadJson(routes.standards, fetchImpl),
    loadJson(routes.x402, fetchImpl),
    loadJson(routes.receipt, fetchImpl),
  ]);

  return { profile, fragments, card, standards, x402, receipt, routes };
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
```

- [ ] **Step 2: Run API helper tests until green**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test -- test/api.test.mjs
```

Expected: PASS.

### Task 3: Write failing content tests

**Files:**
- Create: `apps/web/test/content.test.mjs`
- Later create: `apps/web/src/content.js`

- [ ] **Step 1: Create `apps/web/test/content.test.mjs`**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO_SUBJECT,
  createProofCards,
  createStoryCards,
  summarizeProfile,
} from '../src/content.js';

test('DEMO_SUBJECT contains Bendr V0 metadata', () => {
  assert.equal(DEMO_SUBJECT.slug, 'bendr-2');
  assert.equal(DEMO_SUBJECT.receiptId, 'receipt_bendr_lookup');
  assert.equal(DEMO_SUBJECT.label, 'Bendr 2.0');
});

test('summary helpers produce display strings from fixture-shaped documents', () => {
  const summary = summarizeProfile({
    display_name: 'Bendr 2.0',
    status: 'link_ready',
    subject_type: 'agent',
    cred_summary: { trust_state: 'building' },
  });

  assert.match(summary, /Bendr 2\.0/);
  assert.match(summary, /link_ready/);
  assert.match(summary, /building/);
});

test('story and proof cards cover the intended demo sections', () => {
  const data = {
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    fragments: { fragments: [{ fragment_id: 'frag_public', visibility: 'public' }] },
    card: { capabilities: [{}], service_endpoints: [{}] },
    standards: { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    x402: { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  };

  assert.deepEqual(createStoryCards(data).map((card) => card.title), [
    'Identity Graph',
    'Standards Spine',
    'Access and Receipts',
  ]);
  assert.deepEqual(createProofCards(data).map((card) => card.title), [
    'Profile',
    'Public Fragments',
    'Agent Card',
    'Standards',
    'x402',
    'Receipt',
  ]);
});

test('proof card summaries do not include private fragment ids', () => {
  const cards = createProofCards({
    profile: { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    fragments: { fragments: [{ fragment_id: 'frag_public', visibility: 'public' }] },
    card: { capabilities: [], service_endpoints: [] },
    standards: { standard_refs: [] },
    x402: { endpoints: [] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled' },
  });

  assert.equal(JSON.stringify(cards).includes('frag_bendr_private_placeholder'), false);
});
```

- [ ] **Step 2: Run content tests and confirm they fail on missing `content.js`**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test -- test/content.test.mjs
```

Expected: FAIL with module not found for `../src/content.js`.

### Task 4: Implement content helpers

**Files:**
- Create: `apps/web/src/content.js`

- [ ] **Step 1: Create `apps/web/src/content.js`**

```js
export const DEMO_SUBJECT = {
  label: 'Bendr 2.0',
  slug: 'bendr-2',
  receiptId: 'receipt_bendr_lookup',
};

export const HERO_COPY = {
  eyebrow: 'MULTIPASS DEMO',
  headline: 'Portable identity and trust profiles for agents.',
  body: 'Multipass connects identity fragments, standards, work history, access rails, and trust evidence into one readable agent profile.',
  note: 'Running against the local Multipass API.',
};

export function summarizeProfile(profile) {
  return `${profile.display_name} is a ${profile.subject_type} profile with status ${profile.status} and trust state ${profile.cred_summary?.trust_state ?? 'none'}.`;
}

export function createStoryCards(data) {
  return [
    {
      title: 'Identity Graph',
      label: `${data.fragments.fragments.length} public fragments`,
      body: 'Profile data and public identity fragments make the agent legible without exposing private records.',
    },
    {
      title: 'Standards Spine',
      label: `${data.standards.standard_refs.length} standard refs`,
      body: formatStandards(data.standards.standard_refs),
    },
    {
      title: 'Access and Receipts',
      label: `${data.x402.endpoints.length} x402 endpoint`,
      body: `Endpoint access can produce receipt evidence. Latest receipt status: ${data.receipt.status}.`,
    },
  ];
}

export function createProofCards(data) {
  return [
    {
      title: 'Profile',
      status: data.profile.status,
      summary: summarizeProfile(data.profile),
      json: data.profile,
    },
    {
      title: 'Public Fragments',
      status: `${data.fragments.fragments.length} public`,
      summary: data.fragments.fragments.map((fragment) => fragment.fragment_id).join(', ') || 'No public fragments returned.',
      json: data.fragments,
    },
    {
      title: 'Agent Card',
      status: `${data.card.capabilities.length} capabilities`,
      summary: `${data.card.service_endpoints.length} service endpoint records available.`,
      json: data.card,
    },
    {
      title: 'Standards',
      status: `${data.standards.standard_refs.length} refs`,
      summary: formatStandards(data.standards.standard_refs),
      json: data.standards,
    },
    {
      title: 'x402',
      status: `${data.x402.endpoints.length} endpoints`,
      summary: data.x402.endpoints.map((endpoint) => `${endpoint.endpoint_id} accepts ${endpoint.asset}`).join(', ') || 'No endpoints returned.',
      json: data.x402,
    },
    {
      title: 'Receipt',
      status: data.receipt.status,
      summary: `${data.receipt.receipt_id} records a ${data.receipt.response_class ?? 'unknown'} response.`,
      json: data.receipt,
    },
  ];
}

function formatStandards(standardRefs) {
  return standardRefs.map((ref) => `${ref.standard_id}: ${ref.status}`).join(', ') || 'No standard refs returned.';
}
```

- [ ] **Step 2: Run content tests until green**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test -- test/content.test.mjs
```

Expected: PASS.

## Chunk 2: App rendering and UI

### Task 5: Write failing app rendering tests

**Files:**
- Create: `apps/web/test/app.test.mjs`
- Later create: `apps/web/src/app.js`

- [ ] **Step 1: Create `apps/web/test/app.test.mjs`**

```js
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';

function sampleData() {
  return {
    profile: {
      display_name: 'Bendr 2.0',
      status: 'link_ready',
      subject_type: 'agent',
      cred_summary: { trust_state: 'building' },
    },
    fragments: { fragments: [{ fragment_id: 'frag_bendr_profile', visibility: 'public' }] },
    card: { capabilities: [{}], service_endpoints: [{}] },
    standards: { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    x402: { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    receipt: { receipt_id: 'receipt_bendr_lookup', status: 'settled', response_class: 'success' },
    routes: {},
  };
}

function setupDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', { url });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  return dom.window.document.querySelector('#app');
}

test('initial render shows loading state then Bendr command center', async () => {
  const root = setupDom();
  let resolveLoad;
  const app = createApp({
    root,
    loadDemo: () => new Promise((resolve) => { resolveLoad = resolve; }),
  });

  const ready = app.start();
  assert.match(root.textContent, /Loading Bendr 2\.0/);

  resolveLoad(sampleData());
  await ready;

  assert.match(root.textContent, /Portable identity and trust profiles for agents/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /link_ready/);
  assert.match(root.textContent, /Identity Graph/);
});

test('proof cards render all six document types and JSON toggles work', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  for (const title of ['Profile', 'Public Fragments', 'Agent Card', 'Standards', 'x402', 'Receipt']) {
    assert.match(root.textContent, new RegExp(title));
  }

  assert.equal(root.querySelector('pre'), null);
  root.querySelector('[data-action="toggle-json"]').click();
  assert.match(root.querySelector('pre').textContent, /Bendr 2\.0/);
});

test('default loader uses safe api query override from window location', async () => {
  const root = setupDom('http://localhost/?api=http://127.0.0.1:9999/');
  const calls = [];
  const payloads = {
    'http://127.0.0.1:9999/api/multipass/bendr-2': { display_name: 'Bendr 2.0', status: 'link_ready', subject_type: 'agent', cred_summary: { trust_state: 'building' } },
    'http://127.0.0.1:9999/api/multipass/bendr-2/fragments': { fragments: [{ fragment_id: 'frag_bendr_profile', visibility: 'public' }] },
    'http://127.0.0.1:9999/api/multipass/bendr-2/agent-card': { capabilities: [{}], service_endpoints: [{}] },
    'http://127.0.0.1:9999/api/multipass/bendr-2/standards': { standard_refs: [{ standard_id: 'ERC-8004', status: 'adapter_ready' }] },
    'http://127.0.0.1:9999/api/multipass/bendr-2/x402': { endpoints: [{ endpoint_id: 'lookup', asset: 'CRED' }] },
    'http://127.0.0.1:9999/api/multipass/bendr-2/receipts/receipt_bendr_lookup': { receipt_id: 'receipt_bendr_lookup', status: 'settled', response_class: 'success' },
  };

  globalThis.fetch = async (route) => {
    calls.push(route);
    return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
  };

  try {
    await createApp({ root }).start();
  } finally {
    delete globalThis.fetch;
  }

  assert.ok(calls.every((route) => route.startsWith('http://127.0.0.1:9999/')));
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('API failure renders setup message', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => { throw new Error('GET /multipass-api failed with 502'); } }).start();

  assert.match(root.textContent, /Could not load Multipass API data/);
  assert.match(root.textContent, /pnpm api:bendr/);
  assert.match(root.textContent, /GET \/multipass-api failed with 502/);
});

test('private fragment ids are absent from rendered HTML', async () => {
  const root = setupDom();
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  assert.equal(root.innerHTML.includes('frag_bendr_private_placeholder'), false);
});
```

- [ ] **Step 2: Run app tests and confirm they fail on missing `app.js`**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test -- test/app.test.mjs
```

Expected: FAIL with module not found for `../src/app.js`.

### Task 6: Implement app renderer

**Files:**
- Create: `apps/web/src/app.js`

- [ ] **Step 1: Create `apps/web/src/app.js`**

```js
import { getApiBaseFromLocation, loadMultipassDemo } from './api.js';
import { createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY } from './content.js';

export function createApp({ root, loadDemo = defaultLoadDemo }) {
  let state = { expandedCard: null };

  async function start() {
    renderLoading(root);
    try {
      const data = await loadDemo();
      state = { ...state, data };
      render(root, state);
    } catch (error) {
      renderError(root, error);
    }
  }

  return { start };
}

function defaultLoadDemo() {
  return loadMultipassDemo({
    apiBase: getApiBaseFromLocation(new URL(window.location.href)),
    subject: DEMO_SUBJECT,
  });
}

function renderLoading(root) {
  root.innerHTML = `<section class="shell"><p class="eyebrow">${HERO_COPY.eyebrow}</p><h1>Loading Bendr 2.0...</h1></section>`;
}

function renderError(root, error) {
  root.innerHTML = `
    <section class="shell error-shell">
      <p class="eyebrow">MULTIPASS DEMO</p>
      <h1>Could not load Multipass API data.</h1>
      <p>Run <code>pnpm api:bendr</code> in the Multipass repo, then reload this page.</p>
      <pre>${escapeHtml(error.message)}</pre>
    </section>
  `;
}

function render(root, state) {
  const { data } = state;
  const storyCards = createStoryCards(data);
  const proofCards = createProofCards(data);
  root.innerHTML = `
    <div class="shell">
      <nav class="nav"><strong>MULTIPASS</strong><span>Local API demo</span></nav>
      <section class="hero">
        <div>
          <p class="eyebrow">${HERO_COPY.eyebrow}</p>
          <h1>${HERO_COPY.headline}</h1>
          <p class="hero-copy">${HERO_COPY.body}</p>
          <p class="note">${HERO_COPY.note}</p>
        </div>
        <aside class="command-card">
          <p class="eyebrow">Profile Command Center</p>
          <h2>${escapeHtml(data.profile.display_name)}</h2>
          <dl>
            <div><dt>Status</dt><dd>${escapeHtml(data.profile.status)}</dd></div>
            <div><dt>Subject</dt><dd>${escapeHtml(data.profile.subject_type)}</dd></div>
            <div><dt>Trust</dt><dd>${escapeHtml(data.profile.cred_summary?.trust_state ?? 'none')}</dd></div>
            <div><dt>API</dt><dd>local</dd></div>
          </dl>
        </aside>
      </section>
      <section class="story-grid">${storyCards.map(renderStoryCard).join('')}</section>
      <section class="proof-grid">${proofCards.map((card, index) => renderProofCard(card, index, state.expandedCard)).join('')}</section>
      <footer>This is a local development demo. It does not include auth, persistence, contract reads, or payment settlement.</footer>
    </div>
  `;

  root.querySelectorAll('[data-action="toggle-json"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cardIndex = Number(button.dataset.index);
      state.expandedCard = state.expandedCard === cardIndex ? null : cardIndex;
      render(root, state);
    });
  });
}

function renderStoryCard(card) {
  return `
    <article class="story-card">
      <p class="card-label">${escapeHtml(card.label)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </article>
  `;
}

function renderProofCard(card, index, expandedCard) {
  const expanded = expandedCard === index;
  return `
    <article class="proof-card">
      <div class="proof-head"><h3>${escapeHtml(card.title)}</h3><span>${escapeHtml(card.status)}</span></div>
      <p>${escapeHtml(card.summary)}</p>
      <button data-action="toggle-json" data-index="${index}">${expanded ? 'Hide JSON' : 'Show JSON'}</button>
      ${expanded ? `<pre>${escapeHtml(JSON.stringify(card.json, null, 2))}</pre>` : ''}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

- [ ] **Step 2: Run app tests until green**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test -- test/app.test.mjs
```

Expected: PASS.

## Chunk 3: Vite shell, styling, scripts, and verification

### Task 7: Add Vite shell and styling

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.js`
- Create: `apps/web/src/main.js`
- Create: `apps/web/src/styles.css`
- Modify: `package.json`
- Delete: `apps/web/.gitkeep`

- [ ] **Step 1: Create Vite shell files**

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Multipass Demo</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`apps/web/vite.config.js`:

```js
import { defineConfig } from 'vite';

const apiTarget = process.env.MULTIPASS_API_TARGET || 'http://127.0.0.1:8787';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/multipass-api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/multipass-api/, ''),
      },
    },
  },
});
```

`apps/web/src/main.js`:

```js
import './styles.css';
import { createApp } from './app.js';

createApp({ root: document.querySelector('#app') }).start();
```

- [ ] **Step 2: Create `apps/web/src/styles.css`**

Use responsive dark styling with:

- `:root` CSS variables for `--bg`, `--panel`, `--mint`, `--lavender`, `--blue`, `--text`, `--muted`.
- `.shell` max width around 1180px.
- `.hero` two-column desktop, one-column mobile.
- `.command-card`, `.story-card`, `.proof-card` rounded panels with subtle borders/glow.
- `pre` blocks scroll horizontally.
- No emojis.

- [ ] **Step 3: Add root scripts and remove `.gitkeep`**

Modify root `package.json` scripts:

```json
{
  "web:dev": "pnpm --filter @helixa/multipass-web dev",
  "web:build": "pnpm --filter @helixa/multipass-web build",
  "demo:bendr": "pnpm api:bendr"
}
```

Keep existing scripts. Delete `apps/web/.gitkeep`.

### Task 8: Full verification and smoke checks

**Files:**
- No file changes unless verification catches issues.

- [ ] **Step 1: Run targeted web tests and build**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test
pnpm --filter @helixa/multipass-web build
```

Expected: tests pass and Vite builds `apps/web/dist`. Confirm `apps/web/dist/index.html` exists and at least one JS asset exists under `apps/web/dist/assets`.

- [ ] **Step 2: Run full repo verification**

Run:

```bash
cd /home/ubuntu/multipass
pnpm test
python3 - <<'PY'
from pathlib import Path
terms = [
    'pass' + 'port',
    'Multi ' + 'Pass',
    '.' + 'agent',
    'Legen' + 'dary',
    'buy ' + 'reputation',
    'purchase ' + 'reputation',
    'human-owned, ' + 'agent-managed',
]
roots = ['README.md', 'docs', 'apps', 'packages', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
for root in roots:
    p = Path(root)
    files = [p] if p.is_file() else [x for x in p.rglob('*') if x.is_file() and 'dist' not in x.parts]
    for file in files:
        text = file.read_text(errors='ignore')
        for term in terms:
            if term in text:
                raise SystemExit(f'forbidden wording {term!r} in {file}')
        if chr(8212) in text:
            raise SystemExit(f'em dash in {file}')
print('wording gate passed')
PY
git diff --check -- apps/web package.json pnpm-lock.yaml docs/superpowers/plans
python3 - <<'PY'
import json
from pathlib import Path
for p in ['package.json','apps/api/package.json','apps/web/package.json','packages/types/package.json','packages/sdk/package.json']:
    json.loads(Path(p).read_text())
print('package json valid')
PY
```

Expected: all gates pass.

- [ ] **Step 3: Run local browser smoke with API and Vite**

Run:

```bash
cd /home/ubuntu/multipass
API_PID=''
WEB_PID=''
cleanup() {
  if [ -n "${WEB_PID:-}" ]; then kill -- -"$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null || true; fi
  if [ -n "${API_PID:-}" ]; then kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
setsid bash -lc 'PORT=8788 pnpm api:bendr' > /tmp/multipass-api-smoke.log 2>&1 &
API_PID=$!
setsid bash -lc 'MULTIPASS_API_TARGET=http://127.0.0.1:8788 pnpm --filter @helixa/multipass-web exec vite --host 127.0.0.1 --port 5173 --strictPort' > /tmp/multipass-web-smoke.log 2>&1 &
WEB_PID=$!
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5173/ >/tmp/multipass-web-page.html 2>/dev/null && curl -fsS http://127.0.0.1:5173/multipass-api/api/multipass/bendr-2 >/tmp/multipass-web-proxy.json 2>/dev/null; then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 20 ]; then
    echo 'API log:'; cat /tmp/multipass-api-smoke.log || true
    echo 'Web log:'; cat /tmp/multipass-web-smoke.log || true
    exit 1
  fi
done
curl -fsS http://127.0.0.1:5173/multipass-api/api/multipass/bendr-2/fragments >/tmp/multipass-web-fragments.json
python3 - <<'PY'
import json
from pathlib import Path
html=Path('/tmp/multipass-web-page.html').read_text()
profile=json.loads(Path('/tmp/multipass-web-proxy.json').read_text())
fragments=json.loads(Path('/tmp/multipass-web-fragments.json').read_text())
assert '<main id="app"></main>' in html
assert profile['multipass_id'] == 'mp_bendr_2'
assert all(f['visibility'] == 'public' for f in fragments['fragments'])
assert all(f['fragment_id'] != 'frag_bendr_private_placeholder' for f in fragments['fragments'])
assert Path('apps/web/dist/index.html').exists()
assert any(Path('apps/web/dist/assets').glob('*.js'))
print('web smoke passed')
PY
```

Expected: `web smoke passed`. Do not leave background processes running.

### Task 9: Commit, push, and record memory

**Files:**
- Modify: `/home/ubuntu/.openclaw/workspace/memory/2026-06-24.md` after push.

- [ ] **Step 1: Inspect diff scope**

Run:

```bash
cd /home/ubuntu/multipass
git status --short
git diff --stat
```

Expected: changes limited to `apps/web`, root `package.json`, lockfile, and plan/spec docs.

- [ ] **Step 2: Commit implementation plan and web demo**

Preferred commits:

```bash
cd /home/ubuntu/multipass
git add docs/superpowers/plans/2026-06-24-multipass-story-proof-web-demo.md
git commit -m "Add Multipass web demo plan"
git add apps/web package.json pnpm-lock.yaml
git commit -m "Add Multipass web demo"
```

- [ ] **Step 3: Push and verify remote**

Use the existing token push helper pattern, then verify:

```bash
cd /home/ubuntu/multipass
git fetch origin main --quiet
printf 'local='; git rev-parse HEAD
printf 'origin='; git rev-parse origin/main
printf 'status='; git status --short | wc -l
```

Expected: local equals origin and status is `0`.

- [ ] **Step 4: Record memory note**

Append a concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-24.md` with commit hash, what shipped, review fixes, verification, and next intended step.

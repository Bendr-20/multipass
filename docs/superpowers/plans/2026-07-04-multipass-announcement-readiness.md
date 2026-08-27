# Multipass Announcement Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Multipass build announcement-ready in 3-4 days by aligning the live product with the Activate Multipass spec, tightening public docs/API copy, and producing verified launch proof links.

**Architecture:** Keep the current shipped architecture: static Vite web app, Multipass API service, SQLite saved records, canonical hydrated resolver, manager sessions, fragment/routes/tools modules. This plan avoids new custody, payment, onchain, or private-data systems; it polishes naming, activation flow, docs, and launch evidence around features already built.

**Tech Stack:** Node.js ESM, Vite, React/Privy wallet integration, `node --test`, SQLite via existing saved-record store, nginx-served static web, `multipass-api.service`.

---

## Current Build Comparison

### Already strong enough for announcements

- Canonical hydrated reads exist and power saved profiles, live activation previews, tools, route metadata, and activation state.
- Saved Multipass records are durable and idempotent by Helixa AgentDNA source identity.
- Claim management exists through source-owner wallet proof and manual review, protected by manager session cookies plus CSRF.
- Public profile editing, public fragments, public routes, Bankr tool import, tool refresh, public tool cards, x402 manifest, agent card, standards profile, receipts, changes, share cards, and discovery docs exist.
- Live Bendr profile resolves: `https://helixa.xyz/multipass/bendr-2-1`.
- Live tools endpoint reports two public tool cards for Bendr.
- Baseline verification on 2026-07-04 passed: `pnpm test` = `373/373`; `pnpm web:build` passed with existing third-party Privy/Rollup warnings.

### Gaps before announcements

- User-facing activation still leaks old save language in `apps/web/src/save-panel.js` and related tests.
- API handler internals and error copy still say save in `apps/api/src/index.js` even though the write action now means Activate Multipass.
- Docs still use broad `display-only` and `save a public display-only Multipass record` language in places superseded by the 2026-07-03 activation spec.
- The launch story needs a concise proof pack: what is live, what URLs verify it, what is intentionally not live, and exact announcement-safe wording.
- Need final smoke checklist that proves lookup remains read-only, activation is explicit, public links work, manager controls stay protected, and no payment/onchain action is introduced.

## File Structure

### Web activation flow

- Modify: `apps/web/src/save-panel.js`
  - Responsibility: render the explicit public activation CTA and post-activation claim guidance.
  - Keep share-path safety helpers here.
  - Rename exported render function only if all imports/tests are updated in the same task.

- Modify: `apps/web/src/app.js`
  - Responsibility: bind activation action, apply saved activation result to app state, render claim-management anchor, keep old public lookup read-only.
  - Avoid broad refactors. Internal state names may stay `saveStatus` for a transitional slice if user-facing copy and tests are clean.

- Modify: `apps/web/src/saved-multipass-api.js`
  - Responsibility: client helper for the existing `POST /api/multipass` write route.
  - Add activation-named wrapper while keeping the old export if other tests depend on it.

- Test: `apps/web/test/app.test.mjs`
  - Responsibility: DOM and app-flow regression tests for activation copy, no old public save CTA, success state, and claim-management guidance.

- Test: `apps/web/test/saved-multipass-api.test.mjs`
  - Responsibility: client helper behavior for activation write and error handling.

- Test: `apps/web/test/wording.test.mjs`
  - Responsibility: blocked public copy scan. Add the new activation wording guard here.

### API activation naming and docs

- Modify: `apps/api/src/index.js`
  - Responsibility: public API routes and OpenAPI/discovery metadata.
  - Keep `POST /api/multipass` for compatibility, but rename handler/error copy to activation where user-visible.

- Modify: `apps/api/README.md`
  - Responsibility: developer-facing API usage summary.

- Modify: `docs/live-status.md`
  - Responsibility: operator-facing current truth for what live Multipass does.

- Modify: `docs/live-smoke-checklist.md`
  - Responsibility: release verification checklist.

- Test: `apps/api/test/api-routes.test.mjs`
  - Responsibility: API activation response behavior and route non-mutation regressions.

### Announcement proof pack

- Create: `docs/announcements/2026-07-multipass-announcement-pack.md`
  - Responsibility: concise public-facing announcement bullets, demo links, proof links, not-live-yet boundaries, and internal launch checklist.
  - This is a draft source for team review, not an automatic public post.

- Modify: `README.md`
  - Responsibility: short current-status pointer to live Multipass and API docs if stale.

---

## Chunk 1: Activation Language and Flow Polish

### Task 1: Web tests for Activate Multipass copy

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/wording.test.mjs`

- [ ] **Step 1: Add a failing DOM test that live lookup renders Activate Multipass, not Save Multipass**

Add or update an app test near the existing activation/save tests:

```js
test('live activation preview renders Activate Multipass and no legacy Save CTA', async () => {
  const root = document.createElement('div');
  const app = createApp({
    root,
    loadLiveDemo: async () => buildHydratedPreview({ tokenId: '1' }),
    saveMultipass: async () => ({
      state: 'saved_unclaimed',
      sharePath: '/multipass/bendr-2-1',
      profile: { slug: 'bendr-2-1', multipass_id: 'mp_helixa_agent_1' },
    }),
  });

  await app.resolveLiveAgent('1');

  assert.match(root.textContent, /Activate Multipass/);
  assert.doesNotMatch(root.textContent, /Save Multipass/);
});
```

If the local helper name differs, use the existing fixture/helper already used by nearby resolver tests instead of creating a new global fixture.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/app.test.mjs --test-name-pattern 'Activate Multipass|Save CTA'
```

Expected: FAIL because `apps/web/src/save-panel.js` still renders `Save Multipass`.

- [ ] **Step 3: Add a wording guard for public legacy save copy**

In `apps/web/test/wording.test.mjs`, add a scan that allows legacy references only inside archived specs/plans, not runtime source:

```js
test('runtime web copy uses Activate Multipass instead of legacy Save Multipass', async () => {
  const files = await collectFiles(new URL('../src/', import.meta.url));
  const offenders = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    if (/Save Multipass|Saving\.\.\.|Saved Multipass|Could not save Multipass/i.test(text)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
```

Use the existing file-collection helper in `wording.test.mjs` if one already exists.

- [ ] **Step 4: Run the wording test and confirm it fails**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/wording.test.mjs
```

Expected: FAIL listing `apps/web/src/save-panel.js`.

- [ ] **Step 5: Commit the red tests**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web/test/app.test.mjs apps/web/test/wording.test.mjs
git commit -m "test: cover Multipass activation wording"
```

### Task 2: Replace public Save Multipass UI with Activate Multipass

**Files:**
- Modify: `apps/web/src/save-panel.js`
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Update `apps/web/src/save-panel.js` with activation copy**

Replace the current `renderSavePanel` implementation with:

```js
export function renderSavePanel(state) {
  if (state.resolverStatus !== 'loaded') return '';
  const disabled = state.saveStatus === 'saving' ? 'disabled' : '';
  const label = state.saveStatus === 'saving' ? 'Activating...' : 'Activate Multipass';
  const share = state.savedSharePath && isSafeMultipassSharePath(state.savedSharePath)
    ? `<p class="save-share-path">${escapeHtml(state.savedSharePath)}</p>`
    : '';
  const success = state.saveStatus === 'saved'
    ? `<p class="save-message">Activated Multipass. Stable public profile is ready to share.</p>${share}<p class="save-message muted">Unclaimed Multipass. Claim management when ready.</p><a class="claim-management-link" href="#claim-management">Claim management</a>`
    : '';
  const error = state.saveStatus === 'error'
    ? `<p class="save-message error">Could not activate Multipass. Try again. ${escapeHtml(state.saveError ?? '')}</p>`
    : '';
  return `<section class="save-panel" aria-label="Activate Multipass"><button type="button" data-action="activate-multipass" ${disabled}>${label}</button><p>Activation creates or opens a stable public trust profile. Claim management comes next.</p>${success}${error}</section>`;
}
```

Keep the function name `renderSavePanel` for this slice unless all callers are renamed in the same commit. The public behavior matters more than a noisy internal rename.

- [ ] **Step 2: Bind the new action while keeping one-release backward compatibility**

In `apps/web/src/app.js`, update event binding near the existing save action:

```js
root.querySelector('[data-action="activate-multipass"]')?.addEventListener('click', () => handlers.saveCurrentMultipass?.());
root.querySelector('[data-action="save-multipass"]')?.addEventListener('click', () => handlers.saveCurrentMultipass?.());
```

The legacy selector can stay for one release to avoid brittle tests or cached HTML edge cases, but no source should render a visible `save-multipass` button after Task 2.

- [ ] **Step 3: Add an anchor to claim management**

In `renderClaimManagementPanel`, add `id="claim-management"` to the owner command center section:

```js
<section id="claim-management" class="owner-command-center claim-management-panel" aria-label="Owner Command Center">
```

- [ ] **Step 4: Run focused activation tests**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/app.test.mjs --test-name-pattern 'Activate Multipass|Save CTA|Claim management'
node --test apps/web/test/wording.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the UI fix**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web/src/save-panel.js apps/web/src/app.js apps/web/test/app.test.mjs apps/web/test/wording.test.mjs
git commit -m "fix: align Multipass activation copy"
```

### Task 3: Activation client helper naming without breaking compatibility

**Files:**
- Modify: `apps/web/src/saved-multipass-api.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/saved-multipass-api.test.mjs`

- [ ] **Step 1: Add a failing helper test for activation naming**

Add a test that imports `activateMultipass` and verifies it posts to the existing route:

```js
test('activateMultipass posts agent input to the existing Multipass write route', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
      schema_version: '0.1.0',
      state: 'saved_unclaimed',
      sharePath: '/multipass/bendr-2-1',
      profile: { multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1' },
    }, 201);
  };

  const result = await activateMultipass({ agent: '1', apiBase: 'https://helixa.xyz/api', fetchImpl });

  assert.equal(calls[0].url, 'https://helixa.xyz/api/multipass');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).agent, '1');
  assert.equal(result.sharePath, '/multipass/bendr-2-1');
});
```

Use existing `jsonResponse` helper if available.

- [ ] **Step 2: Run the helper test and confirm it fails**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/saved-multipass-api.test.mjs --test-name-pattern 'activateMultipass'
```

Expected: FAIL because `activateMultipass` is not exported yet.

- [ ] **Step 3: Add `activateMultipass` as the primary export**

In `apps/web/src/saved-multipass-api.js`:

```js
export async function activateMultipass(options) {
  return saveActivatedMultipass(options);
}
```

If `saveActivatedMultipass` is currently declared as an exported function, keep it as a compatibility alias and update imports in `apps/web/src/app.js` only if the diff stays small:

```js
import { activateMultipass, /* existing imports */ } from './saved-multipass-api.js';

function defaultSaveMultipass({ agent, fetchImpl }) {
  return activateMultipass({ agent, apiBase: getApiBaseFromLocation(new URL(window.location.href)), fetchImpl });
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/saved-multipass-api.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the helper rename alias**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web/src/saved-multipass-api.js apps/web/src/app.js apps/web/test/saved-multipass-api.test.mjs
git commit -m "refactor: expose Multipass activation client helper"
```

---

## Chunk 2: API and Documentation Alignment

### Task 4: API handler copy says activate, not save

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Add or update API tests for activation wording and idempotent states**

In `apps/api/test/api-routes.test.mjs`, ensure coverage includes:

```js
test('POST /api/multipass activates or returns an existing saved profile', async () => {
  const first = await requestJson(app, '/api/multipass', {
    method: 'POST',
    body: { agent: '1' },
  });
  const second = await requestJson(app, '/api/multipass', {
    method: 'POST',
    body: { agent: '1' },
  });

  assert.equal(first.status, 201);
  assert.equal(first.body.state, 'saved_unclaimed');
  assert.equal(second.status, 200);
  assert.equal(second.body.state, 'saved_existing');
  assert.equal(second.body.sharePath, first.body.sharePath);
});

test('POST /api/multipass missing agent uses activation error copy', async () => {
  const res = await requestJson(app, '/api/multipass', { method: 'POST', body: {} });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /agent to activate/i);
  assert.doesNotMatch(res.body.error.message, /agent to save/i);
});
```

Use the existing request helper and error shape in the file.

- [ ] **Step 2: Run the focused API test and confirm the error-copy test fails if needed**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'activates|activation error copy'
```

Expected: FAIL if error copy still says `Provide agent to save.`

- [ ] **Step 3: Rename handler internals and error copy**

In `apps/api/src/index.js`:

```js
if (parts.length === 2) {
  if (!context.activationService) {
    return errorResponse(503, 'not_configured', 'Multipass activation is not configured.');
  }
  return handleActivateMultipass(request, context);
}
```

Replace `handleSaveMultipass` with:

```js
async function handleActivateMultipass(request, { savedRecords, activationService }) {
  if (!savedRecords) {
    return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
  }

  const body = await readJsonBody(request);
  const agent = String(body.agent ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to activate.');
  const record = await activationService(agent);
  const saved = savedRecords.saveActivatedRecord(record);
  return jsonResponse({
    schema_version: '0.1.0',
    state: saved.created ? 'saved_unclaimed' : 'saved_existing',
    created: saved.created,
    multipass_id: saved.profile.multipass_id,
    slug: saved.profile.slug,
    profile: saved.profile,
    sharePath: `/multipass/${encodeURIComponent(saved.profile.slug)}`,
  }, saved.created ? 201 : 200);
}
```

Do not change the route path in this task.

- [ ] **Step 4: Run focused API tests**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'activates|activation error copy|activation preview|canonical'
```

Expected: PASS.

- [ ] **Step 5: Commit the API naming fix**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/api/src/index.js apps/api/test/api-routes.test.mjs
git commit -m "fix: use activation language in Multipass API"
```

### Task 5: Update live docs for the announcement story

**Files:**
- Modify: `apps/api/README.md`
- Modify: `docs/live-status.md`
- Modify: `docs/live-smoke-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Update API README route descriptions**

Replace broad save/display-only wording with:

```md
This server exposes public Multipass trust profile data. Public reads expose only public fragments and discovery metadata. Manager-protected routes can update safe public profile metadata after wallet proof or review approval. They do not transfer custody, reveal private fields, mutate runtime routes, grant tool access, or make payments and receipts count as trust.

- `POST /api/multipass` explicitly activates a stable public Multipass profile from a supported source identity. Current production activation source: Helixa AgentDNA.
```

- [ ] **Step 2: Update `docs/live-status.md` current capability section**

Use this wording:

```md
Multipass V0 can:

- Show an activation preview from a live Helixa AgentDNA record without saving anything on page view.
- Activate a stable public Multipass profile from live public AgentDNA data through an explicit user action.
- Resolve profiles by stable slug, Multipass ID, and supported source identifiers.
- Return public profile JSON, public fragments, public tool cards, agent cards, standards profiles, x402 metadata, receipt collections, and change logs.
- Import matching Base ERC-8004 identities as public `standard_ref` fragments.
- Support owner-wallet and review-approved manager claim states for saved records.
- Let verified managers edit allowlisted public profile fields, visibility, manager-created public fragments/routes, and public tool discovery metadata.
- Keep source imports, Cred context, custody labels, route metadata, tool metadata, and manager edits separate.
```

Keep the safety boundary explicit and narrow:

```md
The live API is public-profile and manager-metadata only. It does not transfer wallet custody, reveal private fields or credentials, grant tool access, execute tools, make payments, edit Helixa AgentDNA source records, or change Cred authority.
```

- [ ] **Step 3: Update smoke checklist with announcement gates**

Add a section:

```md
## Announcement readiness smoke

- `GET /multipass/` returns 200 and homepage copy includes `Activate Multipass`.
- `GET /multipass/?agent=1` returns 200 and does not create a new saved record by page view alone.
- `GET /api/resolve?agent=1` returns canonical hydrated JSON with expected activation state.
- `POST /api/multipass` is the only activation write path in this release.
- Public `/tools`, `/agent-card`, `/x402`, `/standards`, `/changes` routes return 200 for the Bendr profile.
- Public viewers never see owner refresh controls.
- Manager tool refresh requires session cookie and CSRF.
- No smoke step performs x402 payment, onchain writes, custody transfer, or tool execution.
```

- [ ] **Step 4: Run doc wording scan**

Run:

```bash
cd /home/ubuntu/multipass
grep -RInE 'Save Multipass|save a public display-only|read-only public profile|display-only Multipass' README.md apps/api/README.md docs/live-status.md docs/live-smoke-checklist.md apps/web/src apps/api/src || true
```

Expected: no hits in runtime source or current docs, except deliberately quoted legacy specs if included outside this command.

- [ ] **Step 5: Commit docs alignment**

Run:

```bash
cd /home/ubuntu/multipass
git add README.md apps/api/README.md docs/live-status.md docs/live-smoke-checklist.md
git commit -m "docs: align Multipass activation status"
```

---

## Chunk 3: Announcement Proof Pack and Live Verification

### Task 6: Create internal announcement pack

**Files:**
- Create: `docs/announcements/2026-07-multipass-announcement-pack.md`

- [ ] **Step 1: Create announcement directory**

Run:

```bash
cd /home/ubuntu/multipass
mkdir -p docs/announcements
```

- [ ] **Step 2: Write the announcement pack**

Create `docs/announcements/2026-07-multipass-announcement-pack.md`:

```md
# Multipass Announcement Pack - July 2026 Draft

## One-liner

Multipass turns a live agent identity into a public trust profile that humans can review and agents can read.

## What is live

- Activate a Helixa AgentDNA record into a stable Multipass profile.
- Public profile pages with source identity evidence, owner/custody context, Cred context, public proof fragments, public routes, and public tool cards.
- Canonical agent-readable API routes: profile JSON, fragments, tools, agent card, standards, x402, receipts, and change history.
- Claim management for safe public profile edits after source-owner wallet proof or manual review approval.
- Bankr x402 and OpenSea-style tool registry metadata as public discovery cards.

## Proof links

- Product home: https://helixa.xyz/multipass/
- Bendr profile: https://helixa.xyz/multipass/bendr-2-1
- Live AgentDNA lookup: https://helixa.xyz/multipass/?agent=1
- Public profile JSON: https://helixa.xyz/api/multipass/bendr-2-1
- Public tool cards: https://helixa.xyz/api/multipass/bendr-2-1/tools
- Agent card: https://helixa.xyz/api/multipass/bendr-2-1/agent-card
- x402 manifest: https://helixa.xyz/api/multipass/bendr-2-1/x402
- Discovery document: https://helixa.xyz/.well-known/multipass.json

## Safe wording

- Multipass is a public trust profile and identity graph for agents.
- Activation creates or opens a stable public profile from source evidence.
- Claim management unlocks safe public metadata edits only.
- Tool cards are discovery metadata. They do not execute tools or reveal credentials.
- Payments and receipts do not buy trust.

## Do not claim yet

- Do not claim native Multipass contracts are live.
- Do not claim custody transfer execution is live.
- Do not claim private or gated field marketplaces are live.
- Do not claim automated runtime handoff is live.
- Do not claim Synagent outcome fragments are live.
- Do not claim advanced cryptographic or selective-disclosure proofs are live.
- Do not claim tool cards execute tools or grant access.

## Announcement sequence

### Day 1

Ship activation wording, docs alignment, and smoke checklist.

### Day 2

Verify live proof links, refresh public tool metadata where manager session is available, and pick 2-3 showcase profiles.

### Day 3

Prepare social/thread copy, screenshots, and a short API/developer post.

### Day 4

Post announcement after final smoke passes and team approves exact wording.
```

- [ ] **Step 3: Check for forbidden public claims**

Run:

```bash
cd /home/ubuntu/multipass
grep -RInE 'custody transfer is live|executes tools|buys trust|native Multipass contracts are live|private marketplace is live|Synagent outcome fragments are live' docs/announcements/2026-07-multipass-announcement-pack.md && exit 1 || true
```

Expected: command exits 0.

- [ ] **Step 4: Commit announcement pack**

Run:

```bash
cd /home/ubuntu/multipass
git add docs/announcements/2026-07-multipass-announcement-pack.md
git commit -m "docs: draft Multipass announcement pack"
```

### Task 7: Full verification before deploy

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full tests**

Run:

```bash
cd /home/ubuntu/multipass
pnpm test
```

Expected: all tests pass. Current baseline before this plan was `373/373`.

- [ ] **Step 2: Run production build**

Run:

```bash
cd /home/ubuntu/multipass
pnpm web:build
```

Expected: build passes. Existing Privy/Rollup PURE and chunk-size warnings are acceptable if unchanged.

- [ ] **Step 3: Check generated bundle copy**

Run:

```bash
cd /home/ubuntu/multipass
grep -R "Save Multipass" apps/web/dist && exit 1 || true
grep -R "Activate Multipass" apps/web/dist >/dev/null
```

Expected: no `Save Multipass`; `Activate Multipass` present.

- [ ] **Step 4: Check git diff hygiene**

Run:

```bash
cd /home/ubuntu/multipass
git diff --check
git status --short
```

Expected: `git diff --check` has no output. `git status --short` is clean after commits.

### Task 8: Deploy after approval and smoke live

**Files:**
- Built static files under `apps/web/dist/`.
- Live static root: `/var/www/helixa.xyz/multipass/`.
- Live API service: `multipass-api.service`.

- [ ] **Step 1: Ask for deploy approval**

Say exactly what will happen:

```text
Ready to deploy Multipass announcement-readiness changes. This will push GitHub main, back up current live static files, rebuild web, copy apps/web/dist to /var/www/helixa.xyz/multipass/, restart multipass-api.service only if API/docs route output changed, and run live read-only smokes. No funds, x402 payments, onchain writes, custody transfers, or tool executions.
```

Do not deploy without approval.

- [ ] **Step 2: Push main after approval**

Run:

```bash
cd /home/ubuntu/multipass
git push origin main
```

Expected: push succeeds.

- [ ] **Step 3: Back up live static files**

Run:

```bash
backup="/home/ubuntu/backups/helixa-multipass-announcement-ready-$(date -u +%Y%m%dT%H%M%SZ).tgz"
tar -czf "$backup" -C /var/www/helixa.xyz multipass
printf 'backup=%s\n' "$backup"
```

Expected: backup path printed.

- [ ] **Step 4: Build and deploy static web**

Run:

```bash
cd /home/ubuntu/multipass
pnpm web:build
rsync -a --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: build passes and files sync.

- [ ] **Step 5: Restart API only if runtime API files changed**

If `apps/api/src/index.js` or API docs output changed and live API process needs refresh:

```bash
sudo systemctl restart multipass-api.service
sudo systemctl is-active multipass-api.service
```

Expected: `active`.

- [ ] **Step 6: Live read-only smoke**

Run:

```bash
node <<'NODE'
const urls = [
  'https://helixa.xyz/multipass/',
  'https://helixa.xyz/multipass/?agent=1',
  'https://helixa.xyz/multipass/bendr-2-1',
  'https://helixa.xyz/api/resolve?agent=1',
  'https://helixa.xyz/api/multipass/bendr-2-1',
  'https://helixa.xyz/api/multipass/bendr-2-1/tools',
  'https://helixa.xyz/api/multipass/bendr-2-1/agent-card',
  'https://helixa.xyz/api/multipass/bendr-2-1/x402',
  'https://helixa.xyz/.well-known/multipass.json'
];
for (const url of urls) {
  const res = await fetch(url, { headers: { 'user-agent': 'OpenClaw Multipass announcement smoke' } });
  console.log(res.status, url);
  if (!res.ok) process.exitCode = 1;
}
NODE
```

Expected: every route returns 200.

- [ ] **Step 7: Live bundle wording smoke**

Run:

```bash
node <<'NODE'
const html = await (await fetch('https://helixa.xyz/multipass/?agent=1')).text();
const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => new URL(m[1], 'https://helixa.xyz/multipass/').href);
let js = '';
for (const asset of assets) js += await (await fetch(asset)).text();
if (js.includes('Save Multipass')) throw new Error('Legacy Save Multipass copy found in live bundle.');
if (!js.includes('Activate Multipass')) throw new Error('Activate Multipass copy missing from live bundle.');
console.log('live activation copy ok');
NODE
```

Expected: `live activation copy ok`.

- [ ] **Step 8: Commit/record live result**

Update `docs/live-status.md` date if not already updated, and add a short memory note in the workspace daily memory file after deploy.

Run:

```bash
cd /home/ubuntu/multipass
git status --short
```

Expected: clean unless only daily memory outside repo changed.

---

## 3-4 Day Execution Schedule

### Day 1: Product language and docs alignment

- Execute Chunk 1 and Chunk 2.
- Goal: public UI and API/docs no longer leak old save/display-only framing.
- Verification: focused tests, full `pnpm test`, `pnpm web:build`.

### Day 2: Live deployment and proof links

- Execute deploy after approval.
- Smoke live URLs and bundle copy.
- Refresh public tool metadata only if a manager session is available and the action is approved. Do not call paid tools or send x402 payments.
- Pick 2-3 showcase profiles for screenshots and links. Any new live activation records require explicit approval because they create public profile records.

### Day 3: Announcement materials

- Finalize `docs/announcements/2026-07-multipass-announcement-pack.md`.
- Prepare concise social copy and a developer/API post draft.
- Capture screenshots directly if requested, but do not ask Quigley to use local browser companions or visual tooling.

### Day 4: Final smoke and announcement

- Re-run live smoke checklist.
- Confirm no claims overreach current live capability.
- Publish only after team approves exact copy and destination.

## Scope Boundaries

- No funds moved.
- No x402 paid calls.
- No onchain writes.
- No custody transfer.
- No private credentials or hidden fields.
- No automatic activation on lookup, prefetch, bot crawl, or share render.
- No new Multipass-native contract work in this sprint.
- No broad Synagent or marketplace claims until those systems are actually live.

## Final Verification Command Set

Run before any success claim:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/app.test.mjs --test-name-pattern 'Activate Multipass|Save CTA|Claim management'
node --test apps/web/test/saved-multipass-api.test.mjs
node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'activates|activation error copy|activation preview|canonical'
node --test apps/web/test/wording.test.mjs
pnpm test
pnpm web:build
git diff --check
git status --short
```

Expected:

- Focused tests pass.
- Full test suite passes.
- Build passes with only existing third-party warnings.
- No whitespace errors.
- Worktree clean after commits.


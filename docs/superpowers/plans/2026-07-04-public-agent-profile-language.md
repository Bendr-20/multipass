# Public Agent Profile Language Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Multipass as a clear public agent profile surface and make its agent-readable discovery endpoints self-explanatory.

**Architecture:** Keep product behavior unchanged. Update API discovery documents and fallback agent-card metadata in `apps/api/src/index.js`, then align web copy constants/rendered strings in `apps/web/src/*`. Tests lock the language boundary so future changes do not drift back to trust-profile headlines or null machine-readable summaries.

**Tech Stack:** Node 22, native `node:test`, Vite web build, Multipass API route factory.

---

## File Structure

- Modify: `apps/api/src/index.js` - discovery document, OpenAPI descriptions, and safe agent-card fallback decoration.
- Modify: `apps/api/test/api-routes.test.mjs` - API contract tests for discovery/OpenAPI/agent-card fallbacks.
- Modify: `apps/web/src/content.js` - homepage copy, clarity sections, carousel labels, story/proof wording.
- Modify: `apps/web/src/live-helixa-resolver.js` - live resolver labels and marketplace compatibility wording.
- Modify: `apps/web/src/app.js` - rendered footer, ownership drawer, system panel, activation preview copy, aura label if needed.
- Modify: `apps/web/src/activation.js` - default Bendr public-profile activation summary.
- Modify: `apps/web/src/save-panel.js` - activation success copy.
- Modify: `apps/web/test/content.test.mjs` - web copy contract tests.
- Modify: `apps/web/test/live-helixa-resolver.test.mjs` - live resolver copy contract tests.
- Modify as needed: `apps/web/test/app.test.mjs`, `apps/web/test/wording.test.mjs` - update exact wording assertions while preserving safety constraints.
- Modify: `docs/live-status.md` - operator-facing note that Multipass is framed as a public agent profile with trust context.

## Chunk 1: API agent discovery clarity

### Task 1: Discovery document contract

**Files:**
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Write failing tests**

Add assertions in `serves public Multipass discovery alias and OpenAPI document`:

```js
assert.equal(discovery.body.name, 'Helixa Multipass');
assert.match(discovery.body.description, /public agent profile/i);
assert.equal(discovery.body.primary_phrase, 'public agent profile');
assert.equal(discovery.body.routes.profile, 'https://multipass.example.test/api/multipass/{id}');
assert.equal(discovery.body.routes.openapi, 'https://multipass.example.test/api/openapi.json');
assert.equal(discovery.body.start_here.resolve, 'https://multipass.example.test/api/resolve?agent={input}');
assert.equal(discovery.body.start_here.agent_card, 'https://multipass.example.test/api/multipass/{id}/agent-card');
assert.equal(discovery.body.example_profile.id, 'bendr-2-1');
assert.match(discovery.body.agent_instructions[0], /resolve/i);
assert.match(discovery.body.boundaries.join(' '), /does not execute tools/i);
```

Also assert OpenAPI description uses public agent profile language:

```js
assert.match(openapi.body.info.description, /public agent profile/i);
assert.match(openapi.body.paths['/api/multipass/{id}/agent-card'].get.description, /machine-readable/i);
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- apps/api/test/api-routes.test.mjs`
Expected: FAIL because fields/descriptions are missing.

- [ ] **Step 3: Implement discovery/OpenAPI copy**

Update `createDiscoveryDocument(baseUrl)` to include the new fields below without replacing or removing the existing `routes` object or any existing route templates:

```js
name: 'Helixa Multipass',
description: 'Public agent profile discovery for Multipass identities, proof fragments, tool metadata, x402 metadata, receipts, and change history.',
purpose: 'Help humans and agents resolve a public agent profile and inspect the public evidence around it.',
primary_phrase: 'public agent profile',
start_here: {
  resolve: `${baseUrl}/api/resolve?agent={input}`,
  profile: `${baseUrl}/api/multipass/{id}`,
  hydrated: `${baseUrl}/api/multipass/{id}/hydrated`,
  agent_card: `${baseUrl}/api/multipass/{id}/agent-card`,
},
example_profile: {
  id: 'bendr-2-1',
  profile: `${baseUrl}/api/multipass/bendr-2-1`,
  agent_card: `${baseUrl}/api/multipass/bendr-2-1/agent-card`,
  hydrated: `${baseUrl}/api/multipass/bendr-2-1/hydrated`,
},
agent_instructions: [
  'Resolve unknown input with /api/resolve?agent={input}.',
  'Fetch /api/multipass/{id}/agent-card for a compact machine-readable summary.',
  'Fetch /api/multipass/{id}/hydrated when you need profile, public fragments, tools, standards, x402, receipts, and changes together.',
],
boundaries: [
  'Viewing a Multipass profile does not execute tools.',
  'Viewing a Multipass profile does not transfer custody or ownership.',
  'Public metadata does not expose private credentials or grant approvals.',
  'Payments, receipts, and CRED are trust context, not trust purchased by payment.',
],
```

Update OpenAPI descriptions in `createOpenApiDocument` accordingly.

- [ ] **Step 4: Run focused API test**

Run: `pnpm test -- apps/api/test/api-routes.test.mjs`
Expected: PASS.

### Task 2: Agent-card fallback contract

**Files:**
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Write failing tests**

In the saved/live agent-card route tests, assert Bendr card includes non-null discovery aids:

```js
assert.match(body.summary, /public agent profile/i);
assert.ok(Array.isArray(body.links));
assert.equal(body.links.some((link) => link.rel === 'profile'), true);
assert.equal(body.links.some((link) => link.rel === 'hydrated'), true);
assert.ok(Array.isArray(body.services));
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- apps/api/test/api-routes.test.mjs`
Expected: FAIL because fallback summary/links/services are null/missing for the current live card.

- [ ] **Step 3: Implement safe decoration**

Add a small helper near `createProfileRoutes`:

```js
function decorateAgentCardForDiscovery(card, profile, baseUrl) {
  if (!card || !profile) return card;
  const displayName = profile.display_name ?? profile.name ?? profile.source ?? profile.slug ?? profile.multipass_id ?? 'This agent';
  const routes = createProfileRoutes(baseUrl, profile.slug ?? profile.multipass_id);
  const requiredLinks = [
    { rel: 'profile', href: routes.profile },
    { rel: 'hydrated', href: routes.hydrated },
    { rel: 'tools', href: routes.tools },
    { rel: 'x402', href: routes.x402 },
    { rel: 'receipts', href: routes.receipts },
    { rel: 'changes', href: routes.changes },
  ];
  const existingLinks = Array.isArray(card.links) ? card.links : [];
  const links = [
    ...existingLinks,
    ...requiredLinks.filter((required) => !existingLinks.some((link) => link?.rel === required.rel)),
  ];
  return {
    ...card,
    summary: card.summary ?? `${displayName} public agent profile. Includes public identity, proof, tool, x402, receipt, and change context when available.`,
    services: Array.isArray(card.services) ? card.services : [],
    links,
    boundaries: Array.isArray(card.boundaries) ? card.boundaries : [
      'Public agent-card metadata does not execute tools, transfer custody, expose private credentials, or grant approvals.',
    ],
  };
}
```

Apply it only at API response time for `/agent-card` and `/card`, preserving persisted stored card data.

- [ ] **Step 4: Run focused API test**

Run: `pnpm test -- apps/api/test/api-routes.test.mjs`
Expected: PASS.

## Chunk 2: Human-facing web copy

### Task 3: Web copy contract

**Files:**
- Modify: `apps/web/test/content.test.mjs`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify as needed: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing tests**

Update copy assertions to prefer public agent profile:

```js
assert.match(HERO_COPY.headline, /public agent profiles/i);
assert.doesNotMatch(HERO_COPY.headline, /trust profiles/i);
assert.match(V01_COPY.productSentence, /public agent profile/i);
assert.match(combined, /public agent profile/i);
assert.match(combined, /trust context/i);
assert.equal(carousel.title, 'Example public agent profiles.');
```

Update live resolver expectations:

```js
assert.equal(data.modeLabel, 'Live Public Agent Profile');
assert.equal(data.liveProfilePage.prototypeLabel, 'Live public agent profile');
assert.match(data.liveProfilePage.body, /public agent profile/i);
assert.match(data.liveProfilePage.recordIntro, /public AgentDNA profile/i);
assert.equal(listing.title, 'Bendr 2.0 public agent profile');
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test -- apps/web/test/content.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/web/test/app.test.mjs`
Expected: FAIL on old trust-profile language.

- [ ] **Step 3: Implement copy changes**

Update source strings:
- `apps/web/src/content.js`
  - `V01_COPY.productSentence`
  - `HERO_COPY.headline/body`
  - `createClaritySections()`
  - `createAgentCarousel()` title/body
  - story/proof helper language where it uses profile category language.
- `apps/web/src/live-helixa-resolver.js`
  - `modeLabel`
  - `liveProfilePage.prototypeLabel/audience/body/note/recordIntro`
  - marketplace listing title and summary.
- `apps/web/src/app.js`
  - footer copy
  - claim management fallback
  - what-it-does panel headline/body
  - activation preview title.
- `apps/web/src/activation.js`
  - default preview summary.
- `apps/web/src/save-panel.js`
  - success message.

Preserve safety meaning but reduce repeated defensive phrasing.

- [ ] **Step 4: Run focused web tests**

Run: `pnpm test -- apps/web/test/content.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/web/test/app.test.mjs apps/web/test/wording.test.mjs`
Expected: PASS.

## Chunk 3: Docs and final verification

### Task 4: Docs alignment

**Files:**
- Modify: `docs/live-status.md`

- [ ] **Step 1: Update wording**

Add a short status note:

```md
Language frame: Multipass is a public agent profile. CRED, proof fragments, x402 metadata, receipts, routes, and change history are trust context inside that profile; viewing them does not grant authority or execute tools.
```

- [ ] **Step 2: Inspect docs diff**

Run: `git diff -- docs/live-status.md`
Expected: only wording/status note changes.

### Task 5: Final verification

- [ ] **Step 1: Run full tests**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `pnpm web:build`
Expected: Vite build succeeds with `/multipass/` base.

- [ ] **Step 3: Inspect final diff**

Run: `git diff --stat && git diff --check`
Expected: no whitespace errors, changes limited to planned files.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.js apps/api/test/api-routes.test.mjs apps/web/src/content.js apps/web/src/live-helixa-resolver.js apps/web/src/app.js apps/web/src/activation.js apps/web/src/save-panel.js apps/web/test/content.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/web/test/app.test.mjs apps/web/test/wording.test.mjs docs/live-status.md docs/superpowers/specs/2026-07-04-public-agent-profile-language-design.md docs/superpowers/plans/2026-07-04-public-agent-profile-language.md
git commit -m "Clarify Multipass public agent profile language"
```

- [ ] **Step 5: Deployment handoff**

Do not deploy unless explicitly approved or existing project convention allows this specific site update. If deployed, run live smoke:

```bash
curl -sS https://helixa.xyz/.well-known/multipass.json | jq '{name,description,primary_phrase,start_here,example_profile,boundaries}'
curl -sS https://helixa.xyz/api/openapi.json | jq '.info'
curl -sS https://helixa.xyz/api/multipass/bendr-2-1/agent-card | jq '{name,summary,links,services,boundaries}'
curl -I https://helixa.xyz/multipass/
```

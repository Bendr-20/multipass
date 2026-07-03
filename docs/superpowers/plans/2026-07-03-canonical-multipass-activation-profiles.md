# Canonical Multipass Activation Profiles Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first canonical Multipass profile slice: Helixa AgentDNA source resolution returns one hydrated owner-managed profile document, and the web app uses it for saved profiles and `?agent=` profile views.

**Architecture:** Add a focused API hydrator that normalizes Helixa AgentDNA source IDs, resolves saved records by source, builds one public-safe hydrated response, and returns activation previews without mutating state. Then add a web loader that consumes the hydrated shape, removes the client-side saved-tool overlay path for canonical results, and updates public copy from broad read-only/display-only language to activation/management language.

**Tech Stack:** Node.js ESM, native Request/Response, SQLite-backed Multipass saved records, node:test, DOM rendering modules, Vite build.

---

## Scope

This plan implements the **first shippable slice** from:

- Spec: `docs/superpowers/specs/2026-07-03-canonical-multipass-activation-profile-design.md`

Included:

- Canonical hydrated API response for Helixa AgentDNA source identities.
- New route: `GET /api/multipass/resolve?source=helixa-agentdna:8453:<tokenId>`.
- New route: `GET /api/multipass/:id/hydrated` for saved profiles.
- Backward-compatible upgrade of existing `GET /api/resolve?agent=<input>`.
- Web data loader for canonical hydrated responses.
- Saved slug routes and numeric `?agent=` routes use the canonical hydrated response.
- Public copy cleanup away from broad `read-only` / `display-only` framing.
- Tests proving saved public tools show through canonical source lookups.

Deferred:

- ERC-8004 activation writes.
- Agent NFT / Agent Aura activation writes.
- Onchain registrations.
- Tool execution.
- x402 payment calls.
- Secret storage.
- Materializing records just because someone viewed a profile.

## File Structure

- Create: `apps/api/src/canonical-profile.js`
  - Normalize Helixa AgentDNA source inputs.
  - Resolve saved records by source.
  - Build canonical hydrated profile responses from a `sourceStore`.
  - Build activation preview responses from unsaved activation records.
  - Keep compatibility aliases for existing `/api/resolve` clients.

- Create: `apps/api/test/canonical-profile.test.mjs`
  - Unit tests for source normalization and pure response builder behavior.

- Modify: `apps/api/src/index.js`
  - Add `/api/multipass/resolve?source=...` route.
  - Add `/api/multipass/:id/hydrated` public read route.
  - Refactor existing `handleResolve()` to call the canonical hydrator and preserve old `state`, `source`, and `save_url` fields.

- Modify: `apps/api/test/api-routes.test.mjs`
  - Add route-level tests for canonical source lookups, saved slug hydration, activation preview no-write behavior, hidden tool filtering, and old `/api/resolve?agent=` compatibility.

- Modify: `apps/web/src/api.js`
  - Add canonical route builders and `loadHydratedMultipassDemo()`.
  - Normalize hydrated API documents into the existing app data shape.
  - Make `loadSavedMultipassDemo()` prefer `/hydrated` with fallback to old companion reads.

- Modify: `apps/web/src/app.js`
  - Default live agent loading uses the canonical API for Helixa token/canonical ID inputs.
  - Keep client-side live resolver as fallback for name searches and API-missing cases.
  - Skip `overlaySavedProfileVisual()` when data came from the canonical API.
  - Replace broad `display-only` / `read-only` public copy with activation/management/source-evidence copy.

- Modify: `apps/web/src/save-panel.js`
  - Replace saved-profile success copy that calls unclaimed records `display-only`.

- Modify: `apps/web/src/route-manager.js`
  - Replace broad public route-card `display-only` copy with public profile reference copy.

- Modify: `apps/web/src/live-helixa-resolver.js`
  - Accept explicit `helixa-agentdna:8453:<tokenId>` input where useful.
  - Preserve legacy `8453:<tokenId>` and token-only behavior.
  - Do not make this module responsible for saved tool hydration anymore.

- Modify: `apps/web/test/api.test.mjs`
  - Add route-builder and hydrated-loader tests.
  - Add fallback coverage for older companion endpoints.

- Modify: `apps/web/test/app.test.mjs`
  - Add DOM/app integration coverage that `?agent=1` loads canonical API data and renders saved public tools.
  - Add copy guard for activation/management wording.

- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
  - Add explicit Helixa AgentDNA source parsing coverage if parser changes.

- Modify: `apps/api/src/activation-records.js`
  - Replace broad API metadata copy that calls saved records `display-only`.

## Chunk 1: API canonical hydrator

### Task 1: Unit-test source normalization and response building

**Files:**
- Create: `apps/api/test/canonical-profile.test.mjs`
- Create: `apps/api/src/canonical-profile.js`

- [ ] **Step 1: Write failing source normalization tests**

Create `apps/api/test/canonical-profile.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHydratedProfileResponse,
  normalizeMultipassSourceInput,
} from '../src/canonical-profile.js';

test('normalizeMultipassSourceInput accepts Helixa AgentDNA shorthand and explicit source ids', () => {
  assert.deepEqual(normalizeMultipassSourceInput('1'), {
    kind: 'helixa_agentdna',
    sourceType: 'helixa_agent',
    canonicalId: 'helixa-agentdna:8453:1',
    legacyCanonicalId: '8453:1',
    chainId: 8453,
    tokenId: '1',
  });
  assert.equal(normalizeMultipassSourceInput('8453:1').canonicalId, 'helixa-agentdna:8453:1');
  assert.equal(normalizeMultipassSourceInput('helixa-agentdna:8453:1').legacyCanonicalId, '8453:1');
});

test('normalizeMultipassSourceInput rejects unsupported source shapes', () => {
  assert.throws(() => normalizeMultipassSourceInput(''), /source/i);
  assert.throws(() => normalizeMultipassSourceInput('8453:0'), /token/i);
  assert.throws(() => normalizeMultipassSourceInput('1:1'), /Base Helixa/i);
  assert.throws(() => normalizeMultipassSourceInput('erc8004:eip155:8453:0xabc:1'), /not supported/i);
  assert.throws(() => normalizeMultipassSourceInput('agent-nft:eip155:8453:0xabc:1'), /not supported/i);
});
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run:

```bash
node --test apps/api/test/canonical-profile.test.mjs
```

Expected: FAIL because `apps/api/src/canonical-profile.js` does not exist.

- [ ] **Step 3: Implement source normalization only**

Create `apps/api/src/canonical-profile.js` with minimal exports:

```js
const HELIXA_CHAIN_ID = 8453;
const HELIXA_SOURCE_TYPE = 'helixa_agent';

export function normalizeMultipassSourceInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new TypeError('Provide a source identity to resolve.');

  const explicit = raw.match(/^helixa-agentdna:(\d+):(\d+)$/);
  const legacy = raw.match(/^(\d+):(\d+)$/);
  const tokenOnly = raw.match(/^\d+$/);

  let chainId;
  let tokenId;
  if (explicit) {
    chainId = Number(explicit[1]);
    tokenId = explicit[2];
  } else if (legacy) {
    chainId = Number(legacy[1]);
    tokenId = legacy[2];
  } else if (tokenOnly) {
    chainId = HELIXA_CHAIN_ID;
    tokenId = raw;
  } else if (/^(erc8004|agent-nft|agent-aura):/.test(raw)) {
    throw new TypeError('That source identity type is not supported in this implementation slice.');
  } else {
    throw new TypeError('Use a Helixa AgentDNA token ID, 8453:<tokenId>, or helixa-agentdna:8453:<tokenId>.');
  }

  if (chainId !== HELIXA_CHAIN_ID) throw new TypeError('This slice supports Base Helixa AgentDNA records only. Use chain 8453.');
  if (!/^\d+$/.test(tokenId) || tokenId === '0') throw new TypeError('Use a positive Helixa AgentDNA token ID.');

  return {
    kind: 'helixa_agentdna',
    sourceType: HELIXA_SOURCE_TYPE,
    canonicalId: `helixa-agentdna:${HELIXA_CHAIN_ID}:${tokenId}`,
    legacyCanonicalId: `${HELIXA_CHAIN_ID}:${tokenId}`,
    chainId: HELIXA_CHAIN_ID,
    tokenId,
  };
}

export function buildHydratedProfileResponse() {
  throw new Error('buildHydratedProfileResponse is not implemented yet.');
}
```

- [ ] **Step 4: Run source normalization tests**

Run:

```bash
node --test apps/api/test/canonical-profile.test.mjs --test-name-pattern normalizeMultipassSourceInput
```

Expected: PASS for normalization tests.

- [ ] **Step 5: Add failing hydrated response builder test**

Append to `apps/api/test/canonical-profile.test.mjs`:

```js
function makeSourceStore() {
  return {
    getPublicFragments: () => [{ fragment_id: 'frag_public', visibility: 'public' }],
    getTools: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', summary: { total: 1 }, tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup' }] }),
    getAgentCard: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0' }),
    getStandardsProfile: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] }),
    getX402Manifest: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] }),
    getReceiptFragments: () => [],
    getChangeLog: () => ({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Activated.' }] }),
    getSourceContext: () => ({ activation: { sourceType: 'helixa_agent', canonicalId: '8453:1', tokenId: '1' } }),
  };
}

test('buildHydratedProfileResponse returns one canonical public-safe document', () => {
  const profile = {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    slug: 'bendr-2-1',
    display_name: 'Bendr 2.0',
    owner_summary: { owner_state: 'unclaimed', verification_status: 'none' },
    updated_at: '2026-07-03T00:00:00.000Z',
  };

  const hydrated = buildHydratedProfileResponse({
    mode: 'activated',
    profile,
    sourceStore: makeSourceStore(),
    sourceIdentity: normalizeMultipassSourceInput('helixa-agentdna:8453:1'),
    baseUrl: 'https://multipass.example.test',
  });

  assert.equal(hydrated.schema_version, '0.1.0');
  assert.equal(hydrated.mode, 'activated');
  assert.equal(hydrated.source_identity.kind, 'helixa_agentdna');
  assert.equal(hydrated.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(hydrated.source_identity.legacy_canonical_id, '8453:1');
  assert.equal(hydrated.profile.slug, 'bendr-2-1');
  assert.equal(hydrated.fragments.fragments.length, 1);
  assert.equal(hydrated.tools.tools[0].tool_id, 'agent-lookup');
  assert.equal(hydrated.agent_card.name, 'Bendr 2.0');
  assert.equal(hydrated.activation.state, 'activated');
  assert.equal(hydrated.activation.manager_state, 'none');
  assert.equal(hydrated.routes_meta.public_profile, '/multipass/bendr-2-1');
  assert.equal(hydrated.routes.profile, 'https://multipass.example.test/api/multipass/bendr-2-1');
});

test('buildHydratedProfileResponse keeps activation previews on the agent query share path', () => {
  const profile = {
    schema_version: '0.1.0',
    multipass_id: 'mp_helixa_agent_1',
    slug: 'bendr-2-1',
    display_name: 'Bendr 2.0',
    owner_summary: { owner_state: 'unclaimed', verification_status: 'none' },
    updated_at: '2026-07-03T00:00:00.000Z',
  };

  const hydrated = buildHydratedProfileResponse({
    mode: 'activation_preview',
    profile,
    sourceStore: makeSourceStore(),
    sourceIdentity: normalizeMultipassSourceInput('1'),
    baseUrl: 'https://multipass.example.test',
  });

  assert.equal(hydrated.state, 'activated_unsaved');
  assert.equal(hydrated.activation.state, 'not_activated');
  assert.equal(hydrated.activation.claim_url, null);
  assert.equal(hydrated.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(hydrated.routes_meta.activate, '/multipass/?agent=1');
  assert.equal(hydrated.routes.profile, undefined);
  assert.equal(hydrated.routes.fragments, undefined);
  assert.equal(hydrated.routes.save, 'https://multipass.example.test/api/multipass');
  assert.equal(JSON.stringify(hydrated.routes).includes('/api/multipass/bendr-2-1'), false);
});

test('buildHydratedProfileResponse requires explicit source identity', () => {
  assert.throws(() => buildHydratedProfileResponse({
    mode: 'saved',
    profile: { schema_version: '0.1.0', multipass_id: 'mp_1', slug: 'agent-1', display_name: 'Agent 1' },
    sourceStore: makeSourceStore(),
    baseUrl: 'https://multipass.example.test',
  }), /sourceIdentity/);
});
```

- [ ] **Step 6: Run the builder test and verify it fails**

Run:

```bash
node --test apps/api/test/canonical-profile.test.mjs --test-name-pattern buildHydratedProfileResponse
```

Expected: FAIL because builder throws.

- [ ] **Step 7: Implement `buildHydratedProfileResponse()`**

Add helpers in `apps/api/src/canonical-profile.js`:

```js
export function buildHydratedProfileResponse({ mode, profile, sourceStore, sourceIdentity, baseUrl, activation = {} }) {
  if (!profile) throw new TypeError('Hydrated profile response requires profile.');
  if (!sourceStore) throw new TypeError('Hydrated profile response requires sourceStore.');
  if (!sourceIdentity) throw new TypeError('Hydrated profile response requires sourceIdentity.');
  const multipassId = profile.multipass_id;
  const source = sourceIdentity;
  const publicFragments = sourceStore.getPublicFragments?.(multipassId) ?? [];
  const tools = sourceStore.getTools?.(multipassId) ?? { schema_version: profile.schema_version, multipass_id: multipassId, summary: { total: 0 }, tools: [] };
  const agentCard = sourceStore.getAgentCard?.(multipassId, { baseUrl }) ?? null;
  const standards = sourceStore.getStandardsProfile?.(multipassId) ?? null;
  const x402 = sourceStore.getX402Manifest?.(multipassId) ?? null;
  const receipts = sourceStore.getReceiptFragments?.(multipassId) ?? [];
  const changes = sourceStore.getChangeLog?.(multipassId) ?? { schema_version: profile.schema_version, multipass_id: multipassId, entries: [] };
  const ownerState = String(profile.owner_summary?.owner_state ?? '').toLowerCase();

  return {
    schema_version: profile.schema_version ?? '0.1.0',
    mode,
    state: mode === 'activated' || mode === 'saved' ? 'saved_record' : 'activated_unsaved',
    source_identity: {
      kind: source.kind,
      canonical_id: source.canonicalId,
      legacy_canonical_id: source.legacyCanonicalId,
      chain_id: source.chainId,
      token_id: source.tokenId,
      verification_state: mode === 'activation_preview' ? 'imported_unverified' : 'source_verified',
    },
    profile,
    fragments: { schema_version: profile.schema_version ?? '0.1.0', multipass_id: multipassId, fragments: publicFragments },
    agent_card: agentCard,
    card: agentCard,
    standards,
    x402,
    receipts: { schema_version: profile.schema_version ?? '0.1.0', multipass_id: multipassId, receipts },
    tools,
    changes,
    activation: {
      state: activation.state ?? (mode === 'activation_preview' ? 'not_activated' : mode === 'saved' ? 'saved_record' : 'activated'),
      manager_state: activation.manager_state ?? (ownerState === 'claimed' ? 'owner_verified' : 'none'),
      claim_url: mode === 'activation_preview' ? null : `/multipass/${encodeURIComponent(profile.slug)}`,
    },
    routes: mode === 'activation_preview'
      ? createActivationPreviewRoutes(baseUrl, source)
      : createHydratedRoutes(baseUrl, profile.slug),
    routes_meta: {
      public_profile: mode === 'activation_preview' ? `/multipass/?agent=${encodeURIComponent(source.tokenId)}` : `/multipass/${encodeURIComponent(profile.slug)}`,
      activate: `/multipass/?agent=${encodeURIComponent(source.tokenId)}`,
    },
  };
}
```

Implement `createHydratedRoutes()` locally or export it if tests need it. Keep URL construction consistent with existing `createProfileRoutes()` in `index.js`.

Also implement `createActivationPreviewRoutes(baseUrl, source)` for unsaved previews. It must expose only non-saved actions, for example:

```js
function createActivationPreviewRoutes(baseUrl, source) {
  const root = stripTrailingSlash(baseUrl ?? '');
  return {
    resolve: `${root}/api/multipass/resolve?source=${encodeURIComponent(source.canonicalId)}`,
    save: `${root}/api/multipass`,
  };
}
```

Do not include saved companion routes like `profile`, `fragments`, `tools`, `changes`, or `/api/multipass/:slug` in activation-preview responses.

- [ ] **Step 8: Run canonical unit tests**

Run:

```bash
node --test apps/api/test/canonical-profile.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit the canonical helper**

```bash
git add apps/api/src/canonical-profile.js apps/api/test/canonical-profile.test.mjs
git commit -m "Add canonical Multipass profile hydrator"
```

## Chunk 2: Canonical API routes

### Task 2: Route canonical source and saved hydrated reads

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Write failing route tests for canonical source hydration**

In `apps/api/test/api-routes.test.mjs`, add a helper near `makeSavedRecord()`:

```js
function makeSavedRecordWithPublicTool() {
  const record = makeSavedRecord();
  return {
    ...record,
    fragments: [
      ...record.fragments,
      makeToolFragment({
        fragment_id: 'frag_tool_agent_lookup',
        multipass_id: record.profile.multipass_id,
      }, {
        tool_id: 'agent-lookup',
        name: 'Agent lookup',
        endpoint_url: 'https://api.example.test/tools/agent-lookup',
        manifest_url: 'https://api.example.test/tools/agent-lookup/manifest.json',
      }),
      makeToolFragment({
        fragment_id: 'frag_tool_hidden_lookup',
        multipass_id: record.profile.multipass_id,
        visibility: 'hidden',
      }, {
        tool_id: 'hidden-lookup',
        name: 'Hidden lookup',
        endpoint_url: 'https://api.example.test/tools/hidden-lookup',
      }),
    ],
  };
}

function makeCanonicalApi() {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  return createMultipassApi({
    store: createFixtureStore(),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      assert.equal(input, '1');
      return makeSavedRecordWithPublicTool();
    },
  });
}
```

Add tests:

```js
test('GET /api/multipass/resolve hydrates saved Helixa AgentDNA profiles with public tools', async () => {
  const api = makeCanonicalApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const result = await requestJson(api, '/api/multipass/resolve?source=helixa-agentdna:8453:1');

  assert.equal(result.response.status, 200);
  assert.equal(result.body.mode, 'activated');
  assert.equal(result.body.state, 'saved_record');
  assert.equal(result.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(result.body.source_identity.legacy_canonical_id, '8453:1');
  assert.equal(result.body.profile.slug, 'bendr-2-1');
  assert.deepEqual(result.body.tools.tools.map((tool) => tool.tool_id), ['agent-lookup']);
  assert.equal(JSON.stringify(result.body).includes('hidden-lookup'), false);
  assert.equal(result.body.routes_meta.public_profile, '/multipass/bendr-2-1');
});

test('GET /api/multipass/:id/hydrated returns the same public tools as source hydration', async () => {
  const api = makeCanonicalApi();
  await postJson(api, '/api/multipass', { agent: '1' });

  const hydrated = await requestJson(api, '/api/multipass/bendr-2-1/hydrated');

  assert.equal(hydrated.response.status, 200);
  assert.equal(hydrated.body.mode, 'saved');
  assert.equal(hydrated.body.profile.slug, 'bendr-2-1');
  assert.deepEqual(hydrated.body.tools.tools.map((tool) => tool.tool_id), ['agent-lookup']);
});
```

- [ ] **Step 2: Write failing activation preview no-write route test**

Add:

```js
test('GET /api/multipass/resolve returns activation preview without saving unactivated sources', async () => {
  const api = makeCanonicalApi();

  const preview = await requestJson(api, '/api/multipass/resolve?source=helixa-agentdna:8453:1');
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.mode, 'activation_preview');
  assert.equal(preview.body.state, 'activated_unsaved');
  assert.equal(preview.body.activation.state, 'not_activated');
  assert.equal(preview.body.activation.claim_url, null);
  assert.equal(preview.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(preview.body.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(preview.body.routes.profile, undefined);
  assert.equal(preview.body.routes.tools, undefined);
  assert.equal(preview.body.routes.save, 'https://multipass.example.test/api/multipass');
  assert.equal(JSON.stringify(preview.body.routes).includes('/api/multipass/bendr-2-1'), false);
  assert.equal(preview.body.save_url, 'https://multipass.example.test/api/multipass');

  const savedRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(savedRead.response.status, 404);
});
```

- [ ] **Step 3: Update existing `/api/resolve?agent=` compatibility test expectations**

Modify existing test `resolves saved records and live activation previews through public resolver endpoint` so old callers still work but numeric/source-shaped inputs find saved records by source after activation:

```js
assert.equal(saved.body.state, 'saved_record');
assert.equal(saved.body.mode, 'saved');
assert.equal(saved.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');

const bySource = await requestJson(api, '/api/resolve?agent=1');
assert.equal(bySource.response.status, 200);
assert.equal(bySource.body.state, 'saved_record');
assert.equal(bySource.body.mode, 'activated');
assert.equal(bySource.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
assert.equal(bySource.body.profile.slug, 'bendr-2-1');
assert.equal(bySource.body.routes.profile, 'https://multipass.example.test/api/multipass/bendr-2-1');

const byExplicitSource = await requestJson(api, '/api/resolve?agent=helixa-agentdna:8453:1');
assert.equal(byExplicitSource.response.status, 200);
assert.equal(byExplicitSource.body.state, 'saved_record');
assert.equal(byExplicitSource.body.mode, 'activated');
assert.equal(byExplicitSource.body.profile.slug, 'bendr-2-1');
```

Add a separate no-save compatibility test for live activation previews:

```js
test('legacy /api/resolve numeric agent returns activation preview before save', async () => {
  const api = makeCanonicalApi();

  const live = await requestJson(api, '/api/resolve?agent=1');

  assert.equal(live.response.status, 200);
  assert.equal(live.body.state, 'activated_unsaved');
  assert.equal(live.body.mode, 'activation_preview');
  assert.equal(live.body.source.canonicalId, '8453:1');
  assert.equal(live.body.source_identity.canonical_id, 'helixa-agentdna:8453:1');
  assert.equal(live.body.routes_meta.public_profile, '/multipass/?agent=1');
  assert.equal(live.body.save_url, 'https://multipass.example.test/api/multipass');
});
```

- [ ] **Step 4: Run route tests and verify they fail**

Run:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "canonical|hydrated|resolver endpoint|activation preview"
```

Expected: FAIL because routes are not wired.

- [ ] **Step 5: Wire canonical routes in `apps/api/src/index.js`**

Import the new helper:

```js
import {
  buildHydratedProfileResponse,
  normalizeMultipassSourceInput,
} from './canonical-profile.js';
```

In GET routing, before the old `/api/resolve` branch, add:

```js
if (parts[0] === 'api' && parts[1] === 'multipass' && parts[2] === 'resolve') {
  return await handleCanonicalResolve(url, context);
}
```

In `handlePublicRead()`, before companion resources:

```js
if (readParts.resource === 'hydrated' && !readParts.resourceId) {
  return jsonResponse(buildHydratedProfileResponse({
    mode: 'saved',
    profile,
    sourceStore,
    sourceIdentity: inferHelixaSourceIdentityFromSaved(profile, sourceStore),
    baseUrl: normalizedBaseUrl,
  }));
}
```

Add `handleCanonicalResolve()` plus a shared `resolveCanonicalSource()` helper so `/api/multipass/resolve?source=` and legacy `/api/resolve?agent=` cannot drift:

```js
async function handleCanonicalResolve(url, context) {
  const sourceRaw = String(url.searchParams.get('source') ?? '').trim();
  if (!sourceRaw) throw new ApiInputError('invalid_request', 'Provide source to resolve.');
  return jsonResponse(await resolveCanonicalSource(sourceRaw, context));
}

async function resolveCanonicalSource(sourceRaw, context) {
  const sourceIdentity = normalizeMultipassSourceInput(sourceRaw);

  const existing = context.savedRecords?.resolveBySource?.(sourceIdentity.sourceType, sourceIdentity.legacyCanonicalId)
    ?? context.savedRecords?.resolveBySource?.(sourceIdentity.sourceType, sourceIdentity.canonicalId)
    ?? null;
  if (existing) {
    return buildHydratedProfileResponse({
      mode: 'activated',
      profile: existing.profile,
      sourceStore: context.savedRecords,
      sourceIdentity,
      baseUrl: context.normalizedBaseUrl,
    });
  }

  if (!context.activationService) {
    throw new ApiNotFoundError(`Multipass source not found: ${sourceRaw}`);
  }

  try {
    const record = await context.activationService(sourceIdentity.tokenId);
    return {
      ...buildHydratedProfileResponse({
        mode: 'activation_preview',
        profile: record.profile,
        sourceStore: createRecordSourceStore(record),
        sourceIdentity,
        baseUrl: context.normalizedBaseUrl,
        activation: { state: 'not_activated', manager_state: 'none', claim_url: null },
      }),
      source: record.source,
      save_url: `${context.normalizedBaseUrl}/api/multipass`,
    };
  } catch (error) {
    throw new ApiNotFoundError(`Multipass source not found: ${sourceRaw}`);
  }
}
```

Implement small local helpers if needed:

- `createRecordSourceStore(record)` adapts unsaved activation record arrays into the methods expected by `buildHydratedProfileResponse()`.
- `inferHelixaSourceIdentityFromSaved(profile, sourceStore)` reads `sourceStore.getSourceContext?.(multipassId)?.activation?.canonicalId` and normalizes it, falling back to token inferred from `mp_helixa_agent_<token>` or slug only if needed.
- Saved-source lookup must check both the current legacy stored ID (`8453:<tokenId>`) and the explicit external ID (`helixa-agentdna:8453:<tokenId>`) so this slice remains compatible before and after a future source-ID migration.

Refactor old `handleResolve(url, context)` to call a shared helper rather than duplicating behavior:

- If `agent` is a saved slug/id, resolve it as a saved profile and return `mode: 'saved'`.
- If `agent` is source-shaped (`1`, `8453:1`, or `helixa-agentdna:8453:1`), call the same canonical source resolver used by `/api/multipass/resolve?source=...`.
- If the source-shaped agent already has a saved record, return `state: 'saved_record'` and `mode: 'activated'`.
- If the source-shaped agent is not saved, return `state: 'activated_unsaved'` and `mode: 'activation_preview'`.

For compatibility, old `/api/resolve?agent=1` must still accept `agent`, not `source`. Preserve old fields where they are meaningful:

- `state` on every response.
- `source` and `save_url` on unsaved activation previews.
- `routes` on saved records.

Do not remove old `/api/resolve` from discovery/openapi in this slice. If updating discovery/OpenAPI is cheap, add `/api/multipass/resolve` and `/api/multipass/{id}/hydrated` there too, but do not let docs work expand scope.

- [ ] **Step 6: Run focused API tests**

Run:

```bash
node --test apps/api/test/canonical-profile.test.mjs apps/api/test/api-routes.test.mjs --test-name-pattern "canonical|hydrated|resolver endpoint|activation preview|POST /api/multipass saves"
```

Expected: PASS.

- [ ] **Step 7: Run all API tests**

Run:

```bash
node --test apps/api/test/*.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit API routes**

```bash
git add apps/api/src/index.js apps/api/test/api-routes.test.mjs
git commit -m "Expose canonical Multipass hydrated profiles"
```

## Chunk 3: Web canonical loader and route consolidation

### Task 3: Add web hydrated loader

**Files:**
- Modify: `apps/web/src/api.js`
- Modify: `apps/web/test/api.test.mjs`

- [ ] **Step 1: Write failing route-builder and loader tests**

In `apps/web/test/api.test.mjs`, import new functions:

```js
import {
  buildCanonicalResolveRoute,
  buildHydratedSavedRoute,
  loadHydratedMultipassDemo,
} from '../src/api.js';
```

Add tests:

```js
test('buildCanonicalResolveRoute creates explicit source resolver route', () => {
  assert.equal(
    buildCanonicalResolveRoute('/multipass-api', 'helixa-agentdna:8453:1'),
    '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
  );
});

test('buildHydratedSavedRoute creates saved hydrated route', () => {
  assert.equal(
    buildHydratedSavedRoute('/multipass-api', 'bendr-2-1'),
    '/multipass-api/api/multipass/bendr-2-1/hydrated',
  );
});

test('loadHydratedMultipassDemo normalizes canonical API data into app shape', async () => {
  const calls = [];
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activated',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup' }] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
    fetchImpl: async (route) => {
      calls.push(route);
      return { ok: true, status: 200, text: async () => JSON.stringify(hydrated) };
    },
  });

  assert.deepEqual(calls, ['/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1']);
  assert.equal(data.profile.slug, 'bendr-2-1');
  assert.equal(data.card.name, 'Bendr 2.0');
  assert.equal(data.tools.tools[0].tool_id, 'agent-lookup');
  assert.equal(data.sourceLabel, 'Helixa AgentDNA source');
  assert.equal(data.modeLabel, 'Activated Multipass');
  assert.equal(data.activation.state, 'activated');
  assert.equal(data.resolver.tokenId, '1');
  assert.equal(data.resolver.canonicalId, '8453:1');
  assert.equal(data.resolver.sourceCanonicalId, 'helixa-agentdna:8453:1');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/bendr-2-1');
  assert.equal(data.canonicalHydrated, true);
});

test('loadHydratedMultipassDemo preserves saved-profile activation semantics', async () => {
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'saved',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/bendr-2-1/hydrated',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(hydrated) }),
  });

  assert.equal(data.modeLabel, 'Saved Multipass');
  assert.equal(data.activation.state, 'saved_record');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/bendr-2-1');
});

test('loadHydratedMultipassDemo keeps activation preview share path on agent query', async () => {
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activation_preview',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'not_activated', manager_state: 'none', claim_url: null },
    routes_meta: { public_profile: '/multipass/?agent=1', activate: '/multipass/?agent=1' },
  };

  const data = await loadHydratedMultipassDemo({
    route: '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(hydrated) }),
  });

  assert.equal(data.modeLabel, 'Activation Preview');
  assert.equal(data.activation.state, 'not_activated');
  assert.equal(data.liveProfilePage.sharePath, '/multipass/?agent=1');
});
```

- [ ] **Step 2: Add fallback behavior to every existing saved-loader mock, then add the explicit fallback test**

First update every existing `loadSavedMultipassDemo` companion-read mock in `apps/web/test/api.test.mjs` so `/hydrated` returns 404 before companion payload lookup. This includes:

- `loadSavedMultipassDemo fetches saved profile public tools with companion documents`
- `loadSavedMultipassDemo reports saved tools fetch failures like other strict companions`
- any other test in this file that calls `loadSavedMultipassDemo()` with a mock companion route map

For each mock, add the branch before `payloads[route]` lookup or route-specific companion logic:

```js
if (String(route).endsWith('/hydrated')) {
  return { ok: false, status: 404, text: async () => 'missing' };
}
```

Then modify the existing `loadSavedMultipassDemo fetches saved profile public tools with companion documents` test or add a new one:

```js
test('loadSavedMultipassDemo falls back to companion documents when hydrated route is missing', async () => {
  const calls = [];
  const payloads = {
    '/multipass-api/api/multipass/bendr-2-1': { multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Saved Bendr' },
    '/multipass-api/api/multipass/bendr-2-1/fragments': { multipass_id: 'mp_helixa_agent_1', fragments: [] },
    '/multipass-api/api/multipass/bendr-2-1/card': { multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' },
    '/multipass-api/api/multipass/bendr-2-1/standards': { standard_refs: [] },
    '/multipass-api/api/multipass/bendr-2-1/x402': { endpoints: [] },
    '/multipass-api/api/multipass/bendr-2-1/tools': { multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'bendr-lookup', name: 'Bendr lookup' }] },
    '/multipass-api/api/multipass/bendr-2-1/changes': { entries: [] },
  };

  const data = await loadSavedMultipassDemo({
    apiBase: '/multipass-api',
    slug: 'bendr-2-1',
    fetchImpl: async (route) => {
      calls.push(route);
      if (String(route).endsWith('/hydrated')) return { ok: false, status: 404, text: async () => 'missing' };
      return { ok: true, status: 200, text: async () => JSON.stringify(payloads[route]) };
    },
  });

  assert.equal(calls[0], '/multipass-api/api/multipass/bendr-2-1/hydrated');
  assert.equal(data.tools.tools[0].tool_id, 'bendr-lookup');
  assert.equal(data.canonicalHydrated, false);
});
```

- [ ] **Step 3: Run web API tests and verify they fail**

Run:

```bash
node --test apps/web/test/api.test.mjs --test-name-pattern "Hydrated|canonical|loadSavedMultipassDemo"
```

Expected: FAIL because functions are missing and saved loader does not try `/hydrated`.

- [ ] **Step 4: Implement route builders and loader**

In `apps/web/src/api.js`, add:

```js
export function normalizeHelixaAgentDnaSource(input) {
  const raw = String(input ?? '').trim();
  if (/^helixa-agentdna:8453:\d+$/.test(raw)) return raw;
  const legacy = raw.match(/^8453:(\d+)$/);
  if (legacy) return `helixa-agentdna:8453:${legacy[1]}`;
  if (/^\d+$/.test(raw) && raw !== '0') return `helixa-agentdna:8453:${raw}`;
  return null;
}

export function buildCanonicalResolveRoute(apiBase, source) {
  const base = stripTrailingSlash(apiBase || DEFAULT_API_BASE);
  return `${base}/api/multipass/resolve?source=${encodeURIComponent(source)}`;
}

export function buildHydratedSavedRoute(apiBase, slug) {
  const base = stripTrailingSlash(apiBase || DEFAULT_API_BASE);
  return `${base}/api/multipass/${encodeURIComponent(slug)}/hydrated`;
}

export async function loadHydratedMultipassDemo({ route, fetchImpl = fetch }) {
  const hydrated = await loadJson(route, fetchImpl);
  return normalizeHydratedMultipassDemo(hydrated, { route });
}
```

Add `normalizeHydratedMultipassDemo(hydrated)` that returns the current app shape:

- `profile`
- `fragments`
- `card: hydrated.agent_card ?? hydrated.card`
- `standards`
- `x402`
- `tools`
- `changes`
- `receipt` fallback document as current saved loader does
- `activation`: preserve preview/activated states, but force `activation.state = 'saved_record'` when `hydrated.mode === 'saved'` so existing saved-profile UI semantics keep working
- `routes`
- `resolver`: map `source_identity.token_id` to `resolver.tokenId`, `source_identity.legacy_canonical_id` to `resolver.canonicalId`, and `source_identity.canonical_id` to `resolver.sourceCanonicalId`
- `modeLabel`: `Activated Multipass` for `mode === 'activated'`, `Activation Preview` for preview, `Saved Multipass` for saved
- `sourceLabel`: `Helixa AgentDNA source`
- `agentCards`: reuse `createSavedAgentCard()`
- `liveProfilePage.headline`, `headerMeta`, `sharePath`; for `activation_preview`, use `/multipass/?agent=<tokenId>` and never the unsaved slug
- `canonicalHydrated: true`

Update `loadSavedMultipassDemo()` to:

1. Try the hydrated route first using a status-aware helper, not plain `loadJson()`. The helper must expose HTTP status so fallback only happens on 404.
2. If `/hydrated` returns 404, fall back to current companion document logic.
3. Set `canonicalHydrated: false` on fallback data.
4. Preserve strict failures for non-404 hydrated errors and existing companion failures.

- [ ] **Step 5: Run web API tests**

Run:

```bash
node --test apps/web/test/api.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit web loader**

```bash
git add apps/web/src/api.js apps/web/test/api.test.mjs
git commit -m "Load canonical hydrated Multipass profiles on web"
```

### Task 4: Use canonical loader in app live profile flow

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/save-panel.js`
- Modify: `apps/web/src/route-manager.js`
- Modify: `apps/web/src/live-helixa-resolver.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify: `apps/api/src/activation-records.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Write failing app test for `?agent=1` canonical load with tools**

In `apps/web/test/app.test.mjs`, add a test near existing resolver/live profile tests:

```js
test('agent query loads canonical hydrated profile and renders saved public tools', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  const calls = [];
  const hydrated = {
    schema_version: '0.1.0',
    mode: 'activated',
    source_identity: { kind: 'helixa_agentdna', canonical_id: 'helixa-agentdna:8453:1', legacy_canonical_id: '8453:1', token_id: '1' },
    profile: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', slug: 'bendr-2-1', display_name: 'Bendr 2.0', discovery_profile: { summary: 'Activated agent.', tags: [], visibility: 'public' }, owner_summary: { owner_state: 'unclaimed' }, updated_at: '2026-07-03T00:00:00Z' },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [] },
    agent_card: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', name: 'Bendr 2.0', service_endpoints: [] },
    standards: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', standard_refs: [] },
    x402: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', endpoints: [] },
    tools: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', tools: [{ tool_id: 'agent-lookup', name: 'Agent lookup', description: 'Lookup this agent.' }] },
    changes: { schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', entries: [] },
    activation: { state: 'activated', manager_state: 'none' },
    routes_meta: { public_profile: '/multipass/bendr-2-1', activate: '/multipass/?agent=1' },
  };

  const app = createApp({
    root,
    loadDemo: async () => sampleData(),
    fetchImpl: async (route) => {
      calls.push(String(route));
      if (String(route).includes('/api/multipass/resolve?source=')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(hydrated) };
      }
      throw new Error(`unexpected route ${route}`);
    },
    prefetchProfiles: false,
  });

  await app.start();
  await flushAsyncEvents(20);

  assert.equal(calls.some((route) => route === '/multipass-api/api/multipass/resolve?source=helixa-agentdna%3A8453%3A1'), true);
  assert.match(root.textContent, /Agent lookup/);
  assert.doesNotMatch(root.textContent, /display-only/i);
});
```

This test deliberately injects `loadDemo: async () => sampleData()` so the initial page load does not hit the fetch mock before the `?agent=1` resolver path runs.

- [ ] **Step 2: Add parser test if changing live resolver parser**

In `apps/web/test/live-helixa-resolver.test.mjs`:

```js
test('parseHelixaResolverInput accepts explicit Helixa AgentDNA source ids', () => {
  assert.deepEqual(parseHelixaResolverInput('helixa-agentdna:8453:1'), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
});
```

- [ ] **Step 3: Run focused web tests and verify they fail**

Run:

```bash
node --test apps/web/test/app.test.mjs apps/web/test/live-helixa-resolver.test.mjs --test-name-pattern "canonical hydrated|explicit Helixa"
```

Expected: FAIL because app still defaults to `loadLiveHelixaMultipass()` and parser rejects explicit source IDs.

- [ ] **Step 4: Wire default canonical live loader**

In `apps/web/src/app.js`, change imports:

```js
import { buildSavedRoutes, getApiBaseFromLocation, getSavedSlugFromLocation, getWritableApiBaseFromLocation, loadCanonicalHelixaMultipass, loadJson, loadMultipassDemo, loadSavedMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
```

Change `createApp()` default handling from parameter default to an explicit local closure. Replace the current function signature and insert `activeLoadLiveDemo` immediately after `activeWalletClient`:

```js
export function createApp({ root, loadDemo, loadLiveDemo, saveMultipass = defaultSaveMultipass, claimApi = defaultClaimApi, walletClient, walletSigner, fetchImpl, prefetchProfiles } = {}) {
  if (!root) throw new Error('createApp requires a root element');

  const activeWalletClient = walletClient ?? (walletSigner ? createLegacyWalletClient(walletSigner) : createInjectedWalletClient());
  const activeLoadLiveDemo = loadLiveDemo ?? ((input) => defaultLoadLiveProfile(input, { fetchImpl }));
  const liveProfileCache = new Map();
  const liveProfileInFlight = new Map();
  const shouldPrefetchProfiles = prefetchProfiles ?? !loadDemo;
```

The current code already has `activeWalletClient`, `liveProfileCache`, `liveProfileInFlight`, and `shouldPrefetchProfiles`; do not duplicate those declarations. Move them into this exact order while adding `activeLoadLiveDemo`.

In `resolveLiveAgent()` replace:

```js
const liveData = await loadLiveDemo(liveProfileKey);
hydratedLiveData = await overlaySavedProfileVisual(liveData, { fetchImpl });
```

with:

```js
const liveData = await activeLoadLiveDemo(liveProfileKey);
hydratedLiveData = liveData?.canonicalHydrated ? liveData : await overlaySavedProfileVisual(liveData, { fetchImpl });
```

In `loadAndCacheLiveProfile()` make the same replacement so homepage prefetch does not call the removed/defaulted `loadLiveDemo` binding:

```js
const request = activeLoadLiveDemo(key)
  .then((liveData) => liveData?.canonicalHydrated ? liveData : overlaySavedProfileVisual(liveData, { fetchImpl }))
  .then((hydratedLiveData) => {
    setCachedLiveProfile(key, hydratedLiveData);
    return hydratedLiveData;
  })
  .finally(() => {
    liveProfileInFlight.delete(key);
  });
```

Add below `defaultLoadDemo()`:

```js
async function defaultLoadLiveProfile(input, { fetchImpl } = {}) {
  const locationUrl = new URL(window.location.href);
  const apiBase = getApiBaseFromLocation(locationUrl);
  try {
    return await loadCanonicalHelixaMultipass({ apiBase, input, fetchImpl });
  } catch (error) {
    // Keep name search and older local dev API behavior working. Canonical numeric/source inputs should fail loudly only when fallback also fails.
    return loadLiveHelixaMultipass(input, fetchImpl);
  }
}
```

In `apps/web/src/api.js`, implement `loadCanonicalHelixaMultipass()`:

```js
export async function loadCanonicalHelixaMultipass({ apiBase = DEFAULT_API_BASE, input, fetchImpl = fetch }) {
  const source = normalizeHelixaAgentDnaSource(input);
  if (!source) throw new Error('Canonical API supports Helixa token IDs only; falling back to live resolver.');
  return loadHydratedMultipassDemo({ route: buildCanonicalResolveRoute(apiBase, source), fetchImpl });
}
```

In `apps/web/src/live-helixa-resolver.js`, update `parseHelixaResolverInput()` to accept `helixa-agentdna:8453:<tokenId>` and return the existing legacy shape `{ chainId: 8453, tokenId, canonicalId: '8453:<tokenId>' }`.

- [ ] **Step 5: Replace broad public copy**

Replace broad product-facing `display-only`, `Display only`, and `read-only public profile` copy. Keep exact edit-boundary labels where the meaning is specifically about non-editable imported fragments/routes.

In `apps/web/src/app.js`, replace these strings:

- `Display-only Multipass profile. It does not execute approvals, change authority, expose private credentials, or alter live routes.`
  - with `Public trust profile. Viewing cannot execute approvals, change authority, expose private credentials, or alter live routes.`
- `Display-only visual context. This does not grant ownership, custody, approvals, or route authority.`
  - with `Public visual context. Viewing does not grant ownership, custody, approvals, or route authority.`
- `Live record activated into a display-only Multipass. No approvals or authority changes.`
  - with `Live source resolved into an activation preview. No approvals, custody, or authority changes.`
- `No management controls are available for this public view. Multipass is display-only here and cannot transfer custody, expose private credentials, or change live routes.`
  - with `Public visitors can inspect this trust profile only. Management requires source-owner proof; viewing cannot transfer custody, expose private credentials, or change live routes.`
- `Display-only authority context`
  - with `Source-owner authority context`
- `Display-only settings for the public Multipass. Visibility affects public search and discovery, not custody, tools, credentials, or ownership.`
  - with `Public profile settings for the Multipass. Visibility affects public search and discovery, not custody, tools, credentials, or ownership.`
- `Public AgentDNA profile prepared for read-only marketplace discovery.`
  - with `Public AgentDNA source evidence prepared for marketplace discovery.`
- `Display only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.`
  - with `Public inspection only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.`

In `apps/web/src/live-helixa-resolver.js`, replace these strings:

- ``Read-only live Helixa API data for ${displayName}.``
  - with ``Public Helixa API source evidence for ${displayName}.``
- `Live AgentDNA trust profile assembled from public Helixa API signals. Display only; authority and private credentials stay protected.`
  - with `Live AgentDNA trust profile assembled from public Helixa API signals. Viewing does not grant authority, and private credentials stay protected.`
- `Display only. Public provenance does not grant authority, verify private credentials, or expose secrets.`
  - with `Public provenance context. Viewing does not grant authority, verify private credentials, or expose secrets.`
- `Read-only public profile`
  - with `Public inspection profile`
- `Display only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.`
  - with `Public inspection only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.`
- ``Read-only public AgentDNA trust profile prepared for directories, builders, and marketplace compatibility: ${descriptors.join(', ')}.``
  - with ``Public AgentDNA trust profile prepared for directories, builders, and marketplace compatibility: ${descriptors.join(', ')}.``
- `Read-only public AgentDNA trust profile with route, custody, and ownership context for marketplace compatibility.`
  - with `Public AgentDNA trust profile with route, custody, and ownership context for marketplace compatibility.`

In `apps/web/src/save-panel.js`, replace:

- `Saved, unclaimed display-only Multipass.`
  - with `Saved, unclaimed Multipass. Claim management when ready.`

In `apps/web/src/route-manager.js`, replace:

- `Display-only route cards for public profile references. Private credentials stay hidden.`
  - with `Public route cards for profile references. Private credentials stay hidden.`

In `apps/api/src/activation-records.js`, replace:

- `Display only; owner, tools, payments, and private credentials are not claimed by this save.`
  - with `Source evidence only; owner, tools, payments, and private credentials are not claimed by this save.`
- `Saved records are display-only until ownership and management rights are verified.`
  - with `Saved records are unclaimed until ownership and management rights are verified.`

In `apps/api/src/index.js` discovery/OpenAPI copy, replace broad `display-only Multipass identity and trust profile API` language with:

- `Public Multipass identity and trust profile API. Payments and receipts do not buy trust.`

Do not change precise manager/editing copy like `Imported routes are read-only here`, `Imported proof stays read-only`, `Imported fragment. Read-only here.`, or API error mapping for imported/read-only fragment edits. Those are exact edit-boundary labels and are allowed.

Update existing `apps/web/test/app.test.mjs` fetch fixtures so saved-route tests still exercise fallback companion reads after `loadSavedMultipassDemo()` starts probing `/hydrated` first. At the top of `savedProfileFetch()`, `savedQuigbotFetch()`, and any other saved-profile fetch helper that expects companion reads, add:

```js
if (String(url).endsWith('/hydrated')) {
  return new Response('missing', { status: 404 });
}
```

Do not add this to the new canonical-hydrated test fetch mock; that one must return the hydrated document. Also update old app-test assertions that expected broad `display-only`, `Display only`, `read-only public profile`, or `read-only marketplace` copy so they assert the new public inspection / source evidence wording instead.

- [ ] **Step 6: Run focused app tests**

Run:

```bash
node --test apps/web/test/app.test.mjs apps/web/test/api.test.mjs apps/web/test/live-helixa-resolver.test.mjs --test-name-pattern "canonical hydrated|explicit Helixa|Hydrated|canonical|agent query"
```

Expected: PASS.

- [ ] **Step 7: Run all web tests**

Run:

```bash
node --test apps/web/test/*.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit web consolidation**

```bash
git add apps/web/src/api.js apps/web/src/app.js apps/web/src/save-panel.js apps/web/src/route-manager.js apps/web/src/live-helixa-resolver.js apps/web/test/api.test.mjs apps/web/test/app.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/api/src/activation-records.js apps/api/src/index.js
git commit -m "Use canonical Multipass profiles in web views"
```

## Chunk 4: Final verification and production-readiness checks

### Task 5: Full local verification

**Files:**
- No source files expected unless verification reveals a bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production web build**

Run:

```bash
pnpm web:build
```

Expected: Vite build passes.

- [ ] **Step 3: Check whitespace and obvious copy regressions**

Run:

```bash
git diff --check
grep -RInEi "display[- ]only|display only|read[- ]only marketplace|read[- ]only live|read[- ]only public" apps/web/src apps/api/src || true
grep -RInEi "read[- ]only" apps/web/src apps/api/src | grep -Ev "Imported routes are read-only here|Imported route cards are read-only|Imported proof stays read-only|Imported route\. Read-only here|Imported fragment\. Read-only here|Imported fragments are read-only|read-only\|not editable\|imported|not editable|Read-only'}</span>" || true
grep -RIn "Legendary\|Multi Pass\|passpor[t]" apps/web/src apps/api/src docs/superpowers/specs || true
```

Expected:

- `git diff --check` has no output.
- First grep has no broad display-only / display only / read-only public-profile copy.
- Second grep has no read-only copy except exact edit-boundary labels for imported non-editable data.
- Third grep has no forbidden product wording in source/spec files. The plan file is excluded to avoid self-matching the guard command.

- [ ] **Step 4: Inspect route list expectations**

Run:

```bash
grep -RIn "api/multipass/resolve\|/hydrated\|/api/resolve" apps/api/src apps/api/test apps/web/src apps/web/test | head -80
```

Expected:

- New canonical routes are present.
- Existing `/api/resolve` compatibility route remains present.
- Web calls `/api/multipass/resolve?source=` for canonical numeric agent lookups.

- [ ] **Step 5: Commit final fixes if any**

If verification required changes:

```bash
git add <changed-files>
git commit -m "Stabilize canonical Multipass profile hydration"
```

If no changes were needed, do not create an empty commit.

### Task 6: Live smoke before deployment decision

**Files:**
- No source files expected.

- [ ] **Step 1: Start or use local API smoke if needed**

If implementation changed API route behavior enough to warrant a local smoke, run the API in a background terminal:

```bash
pnpm api:bendr
```

Then smoke with:

```bash
curl -fsS 'http://127.0.0.1:3000/api/multipass/resolve?source=helixa-agentdna:8453:1' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log(j.mode, j.source_identity?.canonical_id, j.profile?.slug, j.tools?.tools?.length ?? 0)})"
```

Expected: mode/source/profile/tools print without JSON errors. Adjust port only if `apps/api/src/server.js` uses a different configured port in this repo.

- [ ] **Step 2: Prepare deploy note, but do not deploy automatically**

Summarize:

- Commit range.
- Tests passed.
- Build passed.
- Routes changed.
- Whether live deployment is recommended.

Do not deploy production unless Quigley explicitly asks after reviewing the implementation result.

## Acceptance Criteria

- `GET /api/multipass/resolve?source=helixa-agentdna:8453:1` returns one hydrated document.
- Hydrated source lookup includes saved public tool cards for activated profiles.
- Hidden/private tools and private fragments do not appear in canonical public reads.
- `GET /api/multipass/bendr-2-1/hydrated` returns equivalent saved public data.
- `GET /api/resolve?agent=1` still works for old callers and includes canonical fields.
- Activation preview does not write a DB row.
- `/multipass/?agent=1` loads canonical data and no longer needs a client-side saved-tools overlay for numeric agent lookups.
- Saved slug routes prefer canonical hydrated API and fall back to old companion routes for compatibility.
- Public copy says activation/source-owner/managed profile instead of broad read-only/display-only framing.
- `pnpm test` passes.
- `pnpm web:build` passes.

## Notes for implementer

- Keep this slice Helixa-only. Do not sneak in ERC-8004 or NFT activation writes.
- Existing saved records store Helixa source as `sourceType: 'helixa_agent'` and `canonicalId: '8453:<tokenId>'`. The new external canonical ID is `helixa-agentdna:8453:<tokenId>`. Normalize at the API boundary; do not require a DB migration for this slice.
- Treat source metadata as untrusted text. Do not render raw HTML from API responses.
- Do not call paid tools, x402 endpoints, Bankr writes, onchain writes, or OpenSea writes.
- Public routes are inspection only. Management still requires the existing claim/session/CSRF flow.
- Prefer small commits exactly at chunk boundaries.

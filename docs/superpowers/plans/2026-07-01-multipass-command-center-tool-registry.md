# Multipass Command Center Tool Registry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Owner Command Center and Tool Registry Cards foundation so Multipass can display and manage public routes, Bankr x402 services, OpenSea-style tool manifests, schemas, pricing/access, verifiability notes, receipts, and changes without granting execution or custody authority.

**Architecture:** Keep public display data in identity fragments. Endpoint fragments remain route references; new `tool_manifest_ref` data on `tool_manifest` fragments becomes the normalized tool/service read model. Public `/tools`, agent-card, and x402 outputs derive from saved public fragments; manager writes use session/CSRF-protected routes with strict validation and status-based revocation.

**Tech Stack:** Node 22, native `node:test`, jsdom, Vite web app, SQLite saved-record store, JSON Schema contracts in `packages/types`, SDK validators in `packages/sdk`, Multipass API in `apps/api`, browser DOM modules in `apps/web`.

---

## Scope Check

The approved spec covers a broad product direction. Execute it in dependent slices:

1. Owner Command Center UI only.
2. Tool manifest schema/read model and public `/tools` API.
3. Public profile tool cards and derived agent-card/x402 summaries.
4. Bankr-style x402 service import.
5. OpenSea-style manifest import with SSRF-safe server fetch.

Do not skip to external manifest fetching before the local read model is proven.

---

## File Structure

- Modify: `packages/types/schemas/identity-fragment.schema.json`
  - Add `tool_manifest_ref` schema for normalized tool/service cards.
- Inspect: `packages/types/src/index.d.ts`
  - Update only if existing declarations enumerate concrete identity fragment fields. If it only exports generic schema names, leave unchanged and note that no declaration update was needed.
- Modify: `packages/types/test/schema-contract.test.mjs`
  - Assert schema exposes `tool_manifest_ref` and validation fixtures work.
- Modify: `packages/sdk/test/sdk-validation.test.mjs`
  - Validate a sample `tool_manifest` fragment.
- Create: `apps/api/src/tool-manifest.js`
  - Normalize and summarize tool manifest fragments.
  - Derive public tools response, x402 manifest endpoints, and agent-card service summaries.
  - Validate Bankr-style service config and OpenSea-style manifest metadata.
- Create later: `apps/api/src/manifest-fetcher.js`
  - SSRF-safe manifest fetch helper for OpenSea-style import.
- Modify: `apps/api/src/index.js`
  - Add public `GET /api/multipass/{id}/tools`.
  - Add manager routes for tool import, patch, and status-based revoke.
  - Update discovery/OpenAPI docs.
- Modify: `apps/api/src/saved-records.js`
  - Add saved-record helpers for public tools and tool mutations.
  - Derive x402/agent-card from tool fragments after mutations.
- Test: `apps/api/test/fragment-manager.test.mjs` or `apps/api/test/api-routes.test.mjs`
  - Verify generic fragment manager rejects `tool_manifest` writes so tool cards cannot bypass tool-specific validation.
- Create: `apps/web/src/tool-manager.js`
  - Render public tool cards and claimed manager import/revoke UI.
  - Compact client-side Bankr/OpenSea import forms.
  - Keep copy display-only and non-executing.
- Modify: `apps/web/src/app.js`
  - Render Owner Command Center.
  - Render public Tools and Services drawer.
  - Bind tool manager handlers.
- Modify: `apps/web/src/saved-multipass-api.js`
  - Add `getMultipassTools`, `importMultipassTool`, `updateMultipassTool`, and `revokeMultipassTool` client helpers.
- Modify: `apps/web/src/api.js`
  - Fetch `/tools` when loading saved profiles.
- Modify: `apps/web/src/styles.css`
  - Add command center and tool card styling.
- Tests:
  - `apps/web/test/app.test.mjs`
  - `apps/web/test/tool-manager.test.mjs`
  - `apps/web/test/saved-multipass-api.test.mjs`
  - `apps/api/test/api-routes.test.mjs`
  - `apps/api/test/saved-records.test.mjs`
  - `apps/api/test/tool-manifest.test.mjs`

---

## Chunk 1: Owner Command Center UI

### Task 1: Add failing web tests for the Command Center layout

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add test asserting claimed controls render as one command center**

Append a test near existing claim-management tests:

```js
test('claimed saved profile renders one owner command center in product order', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const app = createApp({ root, fetchImpl: savedProfileFetch, walletClient: connectedWalletClient(), walletSigner: validWalletSigner() });
  await app.load();
  await app.claimWithWallet();

  const commandCenter = root.querySelector('.owner-command-center');
  assert.ok(commandCenter, 'expected owner command center');
  assert.match(commandCenter.textContent, /Owner Command Center/);
  assert.match(commandCenter.textContent, /What you control/);
  assert.match(commandCenter.textContent, /Next best action/);

  const sections = [...commandCenter.querySelectorAll('[data-command-section]')].map((node) => node.dataset.commandSection);
  assert.deepEqual(sections.slice(0, 5), ['overview', 'profile', 'routes', 'tools', 'fragments']);
});
```

Use existing helper patterns in the file for wallet claim tests. If helper names differ, adapt to the actual local helpers instead of adding duplicate fixture logic.

- [ ] **Step 2: Add test for safety copy**

```js
test('owner command center safety copy does not imply execution or custody authority', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const app = createApp({ root, fetchImpl: savedProfileFetch, walletClient: connectedWalletClient(), walletSigner: validWalletSigner() });
  await app.load();
  await app.claimWithWallet();

  const text = root.querySelector('.owner-command-center')?.textContent ?? '';
  assert.match(text, /public metadata/i);
  assert.match(text, /does not transfer custody/i);
  assert.doesNotMatch(text, /execute tool|grant tools|release credentials|buy trust/i);
});
```

- [ ] **Step 3: Run focused app tests and confirm failure**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern='owner command center|claimed saved profile renders one owner command center'
```

Expected: FAIL because `.owner-command-center` and command sections do not exist yet.

### Task 2: Implement Owner Command Center renderer

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace `renderClaimManagementPanel` shell with command center**

In `apps/web/src/app.js`, keep the existing function name for call-site compatibility, but make it render a command center wrapper:

```js
function renderClaimManagementPanel(state) {
  if (!isSavedManageRecord(state)) return '';
  const profile = state.data?.profile ?? state.savedProfile ?? {};
  const ownerSummary = profile.owner_summary ?? {};
  const status = state.claimStatus ?? ownerSummary.verification_status ?? ownerSummary.owner_state ?? 'unclaimed';
  const canEdit = Boolean(state.claimCsrfToken);
  const claimButtonLabel = getClaimButtonLabel(state);
  const walletUnconfigured = state.walletSnapshot?.configured === false;

  return `
    <section class="owner-command-center" aria-label="Owner Command Center">
      <div class="owner-command-overview" data-command-section="overview">
        <p class="card-label">Owner Command Center</p>
        <h2>Manage public Multipass metadata.</h2>
        <p>Safe controls for profile, routes, tools, services, and public proof. This does not transfer custody, grant tools, release credentials, or change the source AgentDNA record.</p>
        <dl class="owner-command-facts">
          <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
          <div><dt>Visibility</dt><dd>${escapeHtml(ownerSummary.visibility ?? 'public')}</dd></div>
          <div><dt>Verification</dt><dd>${escapeHtml(ownerSummary.verification_status ?? 'none')}</dd></div>
        </dl>
        <div class="owner-command-next"><strong>Next best action</strong><span>${escapeHtml(getOwnerNextAction({ canEdit, status, walletUnconfigured }))}</span></div>
        <div class="owner-command-control-note"><strong>What you control</strong><span>Public display fields, public routes, public tool/service metadata, and manager-created public fragments.</span></div>
        ${ownerSummary.summary ? `<p class="resolver-message">${escapeHtml(ownerSummary.summary)}</p>` : ''}
        ${walletUnconfigured ? '<p class="resolver-message error">Wallet login is not configured for this build.</p>' : ''}
        ${state.claimError ? `<p class="resolver-message error">${escapeHtml(state.claimError)}</p>` : ''}
      </div>
      ${canEdit ? '' : renderClaimUnlockPanel({ state, claimButtonLabel, walletUnconfigured })}
      ${renderOwnerDashboardPanel(profile, state)}
      <div data-command-section="profile">${canEdit ? renderPublicProfileEditForm(profile, state) : ''}</div>
      <div data-command-section="routes">${canEdit ? renderPublicRoutesManagerPanel(state) : renderPublicRoutesPanel(state.data)}</div>
      <div data-command-section="tools">${renderCommandCenterToolsPlaceholder(state)}</div>
      <div data-command-section="fragments">${canEdit ? renderFragmentManagerPanel(state) : ''}</div>
    </section>
  `;
}
```

- [ ] **Step 2: Add helper functions below `renderClaimManagementPanel`**

```js
function getOwnerNextAction({ canEdit, status, walletUnconfigured }) {
  if (walletUnconfigured) return 'Configure wallet login before manager actions.';
  if (!canEdit) return 'Verify owner wallet or request manager review to unlock public metadata controls.';
  if (/pending|unclaimed/i.test(String(status))) return 'Review public fields, then publish routes and tool cards.';
  return 'Keep public profile, routes, tools, and fragments current.';
}

function renderClaimUnlockPanel({ state, claimButtonLabel, walletUnconfigured }) {
  return `
    <div class="claim-management-actions owner-command-unlock">
      <button type="button" data-action="claim-with-wallet" ${state.claimStatus === 'signing' || walletUnconfigured ? 'disabled' : ''}>${escapeHtml(claimButtonLabel)}</button>
      <form class="manual-review-form" data-action="submit-manual-review">
        <label><span>Manager wallet for review</span><input name="proposedManagerWallet" placeholder="0x..." autocomplete="off" /></label>
        <label><span>Contact route</span><input name="contactRoute" placeholder="agentmail:team@example.test" autocomplete="off" /></label>
        <label><span>Review note</span><textarea name="note" rows="2" placeholder="Why this wallet should manage public fields"></textarea></label>
        <button type="submit">Request manual review</button>
      </form>
    </div>
  `;
}

function renderCommandCenterToolsPlaceholder() {
  return `
    <section class="tool-manager-panel" aria-label="Tools and services">
      <div class="tool-manager-copy">
        <p class="card-label">Tools and services</p>
        <h3>Tool registry cards are next.</h3>
        <p>Public metadata for Bankr x402 services and registry-backed tool manifests. Tool cards describe discovery data only. They do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.</p>
      </div>
    </section>
  `;
}
```

- [ ] **Step 3: Preserve event binding**

Keep existing `data-action` attributes for claim, manual review, profile update, logout, fragment manager, and route manager. Do not rename actions in this chunk.

- [ ] **Step 4: Add minimal CSS**

In `apps/web/src/styles.css`, add focused styles near owner/claim styles:

```css
.owner-command-center {
  display: grid;
  gap: 1rem;
}

.owner-command-overview,
.owner-command-unlock,
.tool-manager-panel {
  border: 1px solid rgba(180, 144, 255, 0.22);
  border-radius: 24px;
  padding: 1rem;
  background: rgba(10, 10, 20, 0.72);
}

.owner-command-facts {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin: 1rem 0;
}

.owner-command-facts div,
.owner-command-next,
.owner-command-control-note {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
}

.owner-command-facts dt,
.owner-command-next strong,
.owner-command-control-note strong {
  display: block;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

No emojis. No em dash.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern='owner command center|claimed saved profile renders one owner command center'
```

Expected: PASS.

- [ ] **Step 6: Run web wording/style tests**

Run:

```bash
node --test apps/web/test/wording.test.mjs apps/web/test/style-direction.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit chunk 1**

```bash
git add apps/web/src/app.js apps/web/src/styles.css apps/web/test/app.test.mjs
git commit -m "Polish Multipass owner command center"
```

---

## Chunk 2: Tool manifest schema and read model

### Task 3: Add schema support for `tool_manifest_ref`

**Files:**
- Modify: `packages/types/schemas/identity-fragment.schema.json`
- Modify: `docs/schemas/identity-fragment.schema.json`
- Inspect: `packages/types/src/index.d.ts`
- Modify if needed: `packages/types/src/index.d.ts`
- Modify: `packages/types/test/schema-contract.test.mjs`
- Modify: `packages/sdk/test/sdk-validation.test.mjs`

- [ ] **Step 1: Add failing schema contract test**

In `packages/types/test/schema-contract.test.mjs`, add:

```js
test('identity fragment schema exposes normalized tool manifest references', () => {
  assert.ok(identityFragmentSchema.properties.tool_manifest_ref);
  assert.deepEqual(identityFragmentSchema.properties.tool_manifest_ref.type, ['object', 'null']);
});
```

- [ ] **Step 2: Add failing SDK validation sample**

In `packages/sdk/test/sdk-validation.test.mjs`, add a valid `tool_manifest` fragment fixture:

```js
const toolManifestFragment = {
  schema_version: '0.1.0',
  fragment_id: 'frag_tool_bendr_lookup',
  multipass_id: 'mp_bendr_2',
  fragment_type: 'tool_manifest',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  transfer_policy: 'pause_on_transfer',
  source: {
    source_type: 'owner_submission',
    source_id: 'manager:tool_bendr_lookup',
    issuer: null,
    observed_at: '2026-07-01T00:00:00.000Z',
    reference_url: 'https://helixa.xyz/api/multipass/bendr-2-1/tools',
  },
  public_value: 'Bendr agent lookup service.',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  tool_manifest_ref: {
    tool_id: 'agent-lookup',
    registry: 'bankr_x402_cloud',
    name: 'Agent lookup',
    description: 'Lookup public AgentDNA profile context.',
    endpoint_url: 'https://api.bankr.bot/x402/helixa/agent-lookup',
    manifest_url: 'https://api.bankr.bot/x402/helixa/agent-lookup/schema',
    manifest_hash: null,
    creator_address: null,
    pricing: { model: 'free', amount: '0.00', asset: 'USDC', chain_id: 8453 },
    access: { summary: 'Public x402 endpoint.', requires_owner_approval: false },
    schemas: { input_summary: 'id: AgentDNA token ID', output_summary: 'public profile context' },
    verifiability: { tier: 'self-attested', summary: 'Imported from public Bankr x402 service metadata.' },
    last_checked_at: '2026-07-01T00:00:00.000Z',
  },
};

assert.doesNotThrow(() => assertIdentityFragment(toolManifestFragment));
```

- [ ] **Step 3: Run schema tests and confirm failure**

```bash
node --test packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs
```

Expected: FAIL because `tool_manifest_ref` is missing.

- [ ] **Step 4: Inspect TypeScript declarations**

Open `packages/types/src/index.d.ts`.

If the file enumerates concrete identity fragment fields, add `tool_manifest_ref` type hints there. If it only exports schema names or broad JSON values, do not modify it. Record the result in the task notes before commit.

- [ ] **Step 5: Add schema property in both schema copies**

Add `tool_manifest_ref` to both:

- `packages/types/schemas/identity-fragment.schema.json`
- `docs/schemas/identity-fragment.schema.json`

Shape:

```json
"tool_manifest_ref": {
  "type": ["object", "null"],
  "description": "Tool/service manifest fields for tool_manifest fragments.",
  "additionalProperties": false,
  "required": [
    "tool_id",
    "registry",
    "name",
    "description",
    "endpoint_url",
    "pricing",
    "access",
    "schemas",
    "verifiability"
  ],
  "properties": {
    "tool_id": { "type": "string", "minLength": 1, "maxLength": 128 },
    "registry": {
      "type": "string",
      "enum": ["bankr_x402_cloud", "opensea_agent_tool_registry", "helixa_api", "owner_submitted", "unknown"]
    },
    "name": { "type": "string", "minLength": 1, "maxLength": 128 },
    "description": { "type": "string", "minLength": 1, "maxLength": 500 },
    "endpoint_url": { "type": "string", "format": "uri" },
    "manifest_url": { "type": ["string", "null"], "format": "uri" },
    "manifest_hash": { "type": ["string", "null"], "maxLength": 128 },
    "creator_address": { "type": ["string", "null"], "pattern": "^0x[0-9a-f]{40}$" },
    "pricing": {
      "type": "object",
      "additionalProperties": false,
      "required": ["model", "amount", "asset", "chain_id"],
      "properties": {
        "model": { "type": "string", "enum": ["free", "fixed", "metered", "unknown"] },
        "amount": { "type": ["string", "null"], "pattern": "^[0-9]+(\\.[0-9]+)?$" },
        "asset": { "type": ["string", "null"], "maxLength": 32 },
        "chain_id": { "type": ["integer", "null"], "minimum": 1 }
      }
    },
    "access": {
      "type": "object",
      "additionalProperties": false,
      "required": ["summary", "requires_owner_approval"],
      "properties": {
        "summary": { "type": ["string", "null"], "maxLength": 500 },
        "requires_owner_approval": { "type": ["boolean", "null"] }
      }
    },
    "schemas": {
      "type": "object",
      "additionalProperties": false,
      "required": ["input_summary", "output_summary"],
      "properties": {
        "input_summary": { "type": ["string", "null"], "maxLength": 500 },
        "output_summary": { "type": ["string", "null"], "maxLength": 500 }
      }
    },
    "verifiability": {
      "type": "object",
      "additionalProperties": false,
      "required": ["tier", "summary"],
      "properties": {
        "tier": { "type": ["string", "null"], "maxLength": 80 },
        "summary": { "type": ["string", "null"], "maxLength": 500 }
      }
    },
    "last_checked_at": { "type": ["string", "null"], "format": "date-time" }
  }
}
```

- [ ] **Step 6: Run schema tests**

```bash
node --test packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs
```

Expected: PASS.

### Task 4: Add API tool read-model helpers

**Files:**
- Create: `apps/api/src/tool-manifest.js`
- Create: `apps/api/test/tool-manifest.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `apps/api/test/tool-manifest.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveAgentCardServiceUpdates,
  deriveX402ManifestFromTools,
  getPublicToolFragments,
  normalizeToolManifestFragment,
  summarizeToolsResponse,
} from '../src/tool-manifest.js';

const BASE_TOOL = {
  schema_version: '0.1.0',
  fragment_id: 'frag_tool_lookup',
  multipass_id: 'mp_bendr_2',
  fragment_type: 'tool_manifest',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  transfer_policy: 'pause_on_transfer',
  source: { source_type: 'owner_submission', source_id: 'manager:tool_lookup', issuer: null, observed_at: '2026-07-01T00:00:00.000Z' },
  public_value: 'Lookup service',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  tool_manifest_ref: {
    tool_id: 'agent-lookup',
    registry: 'bankr_x402_cloud',
    name: 'Agent lookup',
    description: 'Lookup public AgentDNA profile context.',
    endpoint_url: 'https://api.bankr.bot/x402/helixa/agent-lookup',
    manifest_url: 'https://api.bankr.bot/x402/helixa/agent-lookup/schema',
    manifest_hash: null,
    creator_address: null,
    pricing: { model: 'free', amount: '0.00', asset: 'USDC', chain_id: 8453 },
    access: { summary: 'Public x402 endpoint.', requires_owner_approval: false },
    schemas: { input_summary: 'id: AgentDNA token ID', output_summary: 'public profile context' },
    verifiability: { tier: 'self-attested', summary: 'Imported from public Bankr x402 service metadata.' },
    last_checked_at: '2026-07-01T00:00:00.000Z',
  },
};

test('getPublicToolFragments returns only public non-hidden tool fragments', () => {
  const tools = getPublicToolFragments([
    BASE_TOOL,
    { ...BASE_TOOL, fragment_id: 'frag_tool_private', visibility: 'private' },
    { ...BASE_TOOL, fragment_id: 'frag_tool_route', fragment_type: 'endpoint' },
  ]);
  assert.deepEqual(tools.map((tool) => tool.fragment_id), ['frag_tool_lookup']);
});

test('summarizeToolsResponse returns normalized public tool cards', () => {
  const response = summarizeToolsResponse('mp_bendr_2', [BASE_TOOL]);
  assert.equal(response.schema_version, '0.1.0');
  assert.equal(response.summary.total, 1);
  assert.equal(response.summary.x402_count, 1);
  assert.equal(response.tools[0].name, 'Agent lookup');
  assert.equal(response.tools[0].pricing.asset, 'USDC');
});

test('deriveX402ManifestFromTools includes only active x402 tools', () => {
  const manifest = deriveX402ManifestFromTools('mp_bendr_2', [
    BASE_TOOL,
    { ...BASE_TOOL, fragment_id: 'frag_tool_revoked', status: 'revoked', tool_manifest_ref: { ...BASE_TOOL.tool_manifest_ref, tool_id: 'revoked' } },
    { ...BASE_TOOL, fragment_id: 'frag_tool_opensea', tool_manifest_ref: { ...BASE_TOOL.tool_manifest_ref, registry: 'opensea_agent_tool_registry', tool_id: 'search', pricing: { model: 'unknown', amount: null, asset: null, chain_id: null } } },
  ]);
  assert.equal(manifest.multipass_id, 'mp_bendr_2');
  assert.deepEqual(manifest.endpoints.map((endpoint) => endpoint.endpoint_id), ['agent-lookup']);
});

test('normalizeToolManifestFragment rejects unsafe URLs and malformed creator addresses', () => {
  assert.throws(() => normalizeToolManifestFragment({ ...BASE_TOOL, tool_manifest_ref: { ...BASE_TOOL.tool_manifest_ref, endpoint_url: 'http://example.test' } }), /https/i);
  assert.throws(() => normalizeToolManifestFragment({ ...BASE_TOOL, tool_manifest_ref: { ...BASE_TOOL.tool_manifest_ref, creator_address: '0xABC' } }), /creator/i);
});
```

- [ ] **Step 2: Run test and confirm failure**

```bash
node --test apps/api/test/tool-manifest.test.mjs
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement `apps/api/src/tool-manifest.js`**

Implement exports:

```js
import { assertIdentityFragment, assertX402Manifest } from '@helixa/multipass-sdk';

const X402_REGISTRIES = new Set(['bankr_x402_cloud']);
const ACTIVE_STATUSES = new Set(['pending', 'verified', 'stale', 'disputed']);

export function getPublicToolFragments(fragments = []) {
  return fragments
    .filter((fragment) => fragment?.fragment_type === 'tool_manifest')
    .filter((fragment) => fragment?.visibility === 'public')
    .filter((fragment) => fragment?.tool_manifest_ref)
    .map(normalizeToolManifestFragment)
    .toSorted((left, right) => String(left.updated_at ?? '').localeCompare(String(right.updated_at ?? '')) * -1);
}

export function normalizeToolManifestFragment(fragment) {
  const normalized = assertIdentityFragment(fragment);
  if (normalized.fragment_type !== 'tool_manifest') throw new TypeError('fragment_type must be tool_manifest.');
  const ref = normalized.tool_manifest_ref;
  if (!ref) throw new TypeError('tool_manifest_ref is required.');
  assertHttpsUrl(ref.endpoint_url, 'tool_manifest_ref.endpoint_url');
  if (ref.manifest_url) assertHttpsUrl(ref.manifest_url, 'tool_manifest_ref.manifest_url');
  if (ref.creator_address && !/^0x[0-9a-f]{40}$/.test(ref.creator_address)) throw new TypeError('tool_manifest_ref.creator_address must be lowercase 0x address.');
  return normalized;
}

export function summarizeToolsResponse(multipassId, fragments = []) {
  const tools = getPublicToolFragments(fragments).map(toolCardFromFragment);
  return {
    schema_version: '0.1.0',
    multipass_id: multipassId,
    tools,
    summary: {
      total: tools.length,
      x402_count: tools.filter((tool) => X402_REGISTRIES.has(tool.registry)).length,
      verified_count: tools.filter((tool) => tool.status === 'verified').length,
      stale_count: tools.filter((tool) => tool.status === 'stale').length,
    },
  };
}

export function deriveX402ManifestFromTools(multipassId, fragments = []) {
  const endpoints = getPublicToolFragments(fragments)
    .filter((fragment) => ACTIVE_STATUSES.has(fragment.status))
    .filter((fragment) => X402_REGISTRIES.has(fragment.tool_manifest_ref.registry))
    .map((fragment) => {
      const ref = fragment.tool_manifest_ref;
      return {
        endpoint_id: ref.tool_id,
        url: ref.endpoint_url,
        method: 'GET',
        description: ref.description,
        price: { amount: ref.pricing.amount ?? '0', decimals: 6 },
        asset: ref.pricing.asset ?? 'USDC',
        chain_id: ref.pricing.chain_id ?? 8453,
        provider: 'bankr_x402_cloud',
        settlement_reference_policy: 'receipt_fragment',
        rate_limit: { requests: 0, window_seconds: 60 },
        visibility: fragment.visibility === 'public' ? 'public' : 'gated',
        requires_owner_approval: ref.access.requires_owner_approval ?? true,
      };
    });
  return assertX402Manifest({ schema_version: '0.1.0', multipass_id: multipassId, endpoints });
}

export function deriveAgentCardServiceUpdates(agentCard, fragments = [], baseUrl = '') {
  const tools = getPublicToolFragments(fragments).filter((fragment) => ACTIVE_STATUSES.has(fragment.status));
  const service_endpoints = tools.map((fragment) => ({
    endpoint_id: fragment.tool_manifest_ref.tool_id,
    url: fragment.tool_manifest_ref.endpoint_url,
    protocol: fragment.tool_manifest_ref.registry === 'bankr_x402_cloud' ? 'x402' : 'api',
    description: fragment.tool_manifest_ref.description,
  }));
  const accepted_assets = [...new Set(tools.map((fragment) => fragment.tool_manifest_ref.pricing.asset).filter(Boolean))];
  return {
    ...agentCard,
    capabilities: [...(agentCard.capabilities ?? []), ...tools.map((fragment) => fragment.tool_manifest_ref.name)].filter(Boolean),
    service_endpoints,
    x402_manifest_url: service_endpoints.some((endpoint) => endpoint.protocol === 'x402') && baseUrl ? `${baseUrl}/api/multipass/${encodeURIComponent(agentCard.multipass_id)}/x402` : agentCard.x402_manifest_url,
    accepted_assets,
  };
}

function toolCardFromFragment(fragment) {
  const ref = fragment.tool_manifest_ref;
  return {
    fragment_id: fragment.fragment_id,
    status: fragment.status,
    assurance_level: fragment.assurance_level,
    visibility: fragment.visibility,
    updated_at: fragment.updated_at,
    tool_id: ref.tool_id,
    registry: ref.registry,
    name: ref.name,
    description: ref.description,
    endpoint_url: ref.endpoint_url,
    manifest_url: ref.manifest_url ?? null,
    manifest_hash: ref.manifest_hash ?? null,
    creator_address: ref.creator_address ?? null,
    pricing: ref.pricing,
    access: ref.access,
    schemas: ref.schemas,
    verifiability: ref.verifiability,
    last_checked_at: ref.last_checked_at ?? null,
  };
}

function assertHttpsUrl(value, field) {
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new TypeError(`${field} must be a valid URL.`); }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
}
```

Adjust method/rate-limit defaults later when service metadata provides them.

- [ ] **Step 5: Run focused tests**

```bash
node --test apps/api/test/tool-manifest.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run schema + API tests**

```bash
node --test packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs apps/api/test/tool-manifest.test.mjs
```

Expected: PASS.

### Task 4.5: Guard generic fragment manager from tool manifest bypass

**Files:**
- Modify: `apps/api/test/fragment-manager.test.mjs` or `apps/api/test/api-routes.test.mjs`
- Modify only if failing: `apps/api/src/fragment-manager.js`

- [ ] **Step 1: Add failing or protective test**

Add a test proving generic manager-created fragments cannot use `fragment_type: 'tool_manifest'`. If testing at the normalizer level, call `normalizeManagerFragmentInput({ fragment_type: 'tool_manifest', ... })` and assert it throws. If testing at API level, POST `/api/multipass/{id}/fragments` with a manager session and assert 400.

Expected error should mention that `tool_manifest` is not allowed through generic fragment management.

- [ ] **Step 2: Run test before implementation**

```bash
node --test apps/api/test/fragment-manager.test.mjs --test-name-pattern='tool_manifest|tool manifest'
```

Expected: PASS if existing code already blocks it, or FAIL if the bypass exists.

- [ ] **Step 3: Fix only if the test fails**

If it fails, keep `tool_manifest` out of `MANAGER_FRAGMENT_TYPES` in `apps/api/src/fragment-manager.js`. Tool cards must be created only through tool-specific routes.

- [ ] **Step 4: Re-run focused test**

```bash
node --test apps/api/test/fragment-manager.test.mjs --test-name-pattern='tool_manifest|tool manifest'
```

Expected: PASS.

- [ ] **Step 7: Commit chunk 2**

```bash
git add packages/types/schemas/identity-fragment.schema.json docs/schemas/identity-fragment.schema.json packages/types/src/index.d.ts packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs apps/api/src/tool-manifest.js apps/api/test/tool-manifest.test.mjs
git commit -m "Add Multipass tool manifest read model"
```

---

## Chunk 3: Public `/tools`, x402, and agent-card derivation

### Task 5: Add public tools API route

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `docs/live-status.md`
- Modify: `apps/api/README.md`

- [ ] **Step 1: Add failing API route test**

In `apps/api/test/api-routes.test.mjs`, add a store fixture with one public tool and one private tool. Assert:

```js
const toolsResponse = await api.handleRequest(new Request('https://helixa.test/api/multipass/demo-agent/tools'));
assert.equal(toolsResponse.status, 200);
const body = await toolsResponse.json();
assert.equal(body.summary.total, 1);
assert.equal(body.tools[0].tool_id, 'agent-lookup');
assert.doesNotMatch(JSON.stringify(body), /private-tool-secret/);
```

- [ ] **Step 2: Run test and confirm failure**

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern='tools'
```

Expected: FAIL with route not found.

- [ ] **Step 3: Add store helper**

In `createMemoryStore`, add:

```js
getPublicTools(multipassId) {
  return summarizeToolsResponse(multipassId, fragmentsByProfile.get(multipassId) ?? []);
}
```

Import `summarizeToolsResponse` from `./tool-manifest.js`.

- [ ] **Step 4: Add public route handler**

In `handlePublicRead`, before `agent-card`:

```js
if (readParts.resource === 'tools' && !readParts.resourceId) {
  return jsonResponse(sourceStore.getPublicTools?.(profile.multipass_id) ?? summarizeToolsResponse(profile.multipass_id, sourceStore.getPublicFragments(profile.multipass_id)));
}
```

- [ ] **Step 5: Add discovery and OpenAPI route**

In `createDiscoveryDocument`, add:

```js
tools: `${baseUrl}/api/multipass/{id}/tools`,
```

In `createOpenApiDocument.paths`, add `/api/multipass/{id}/tools` with summary `Fetch public tool and service cards`.

- [ ] **Step 6: Add saved-record helper**

In `createSqliteSavedRecords` returned object, add `getPublicTools(multipassId)` using bundle fragments and `summarizeToolsResponse`.

- [ ] **Step 7: Run focused tests**

```bash
node --test apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs
```

Expected: PASS.

### Task 6: Derive x402 and agent-card from tool fragments

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/test/saved-records.test.mjs`

- [ ] **Step 1: Add failing x402 derivation test**

Assert that `GET /api/multipass/{id}/x402` includes public active Bankr tool cards and excludes revoked/non-x402 tool cards.

- [ ] **Step 2: Add failing agent-card derivation test**

Assert that `GET /api/multipass/{id}/agent-card` includes service endpoint summaries and `x402_manifest_url` once x402 tools exist.

- [ ] **Step 3: Run derivation tests and confirm failure**

```bash
node --test apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs --test-name-pattern='x402|agent-card|tool'
```

Expected: FAIL because derivation from tool fragments is not implemented yet.

- [ ] **Step 4: Implement derivation in read path**

When a source store supports saved records, derive at read time from bundle fragments. For memory store, derive from fixture fragments.

Use helpers:

```js
deriveX402ManifestFromTools(profile.multipass_id, allFragments)
deriveAgentCardServiceUpdates(agentCard, allFragments, normalizedBaseUrl)
```

Keep original persisted documents as fallback when no tool fragments exist.

- [ ] **Step 4: Run focused tests**

```bash
node --test apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs apps/api/test/tool-manifest.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit chunk 3**

```bash
git add apps/api/src/index.js apps/api/src/saved-records.js apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs apps/api/README.md docs/live-status.md
git commit -m "Expose Multipass public tool cards"
```

---

## Chunk 4: Web public tool cards

### Task 7: Fetch and render public tools

**Files:**
- Create: `apps/web/src/tool-manager.js`
- Create: `apps/web/test/tool-manager.test.mjs`
- Modify: `apps/web/src/api.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add tool-manager render tests**

Create `apps/web/test/tool-manager.test.mjs` with tests for:

- Bankr x402 card renders name, endpoint, price, schema summary.
- OpenSea-style card renders creator address and verifiability.
- Safety copy does not imply execution or access grant.
- Private/gated tools are not rendered when absent from public API.

- [ ] **Step 2: Run tool-manager render tests and confirm failure**

```bash
node --test apps/web/test/tool-manager.test.mjs
```

Expected: FAIL because `apps/web/src/tool-manager.js` does not exist yet.

- [ ] **Step 3: Implement `renderPublicToolsPanel(data)`**

In `apps/web/src/tool-manager.js`:

```js
export function renderPublicToolsPanel(data = {}) {
  const tools = Array.isArray(data.tools?.tools) ? data.tools.tools : [];
  if (!tools.length) return '';
  return `
    <section class="public-tools-panel" aria-label="Tools and services">
      <div class="tool-manager-copy">
        <p class="card-label">Tools and services</p>
        <h3>Public tool registry cards.</h3>
        <p>Discovery metadata only. These cards do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.</p>
      </div>
      <div class="public-tool-list">
        ${tools.map(renderPublicToolCard).join('')}
      </div>
    </section>
  `;
}
```

Implement `renderPublicToolCard(tool)` with escaped fields and simple labels.

- [ ] **Step 4: Fetch tools in saved profile API loading**

In `apps/web/src/api.js`, add `/tools` fetch beside fragments/card/standards/x402/changes for saved records. Store result as `data.tools`.

- [ ] **Step 5: Render tools on profile page**

In `renderProfileDetailDrawers`, add:

```js
const publicTools = renderPublicToolsPanel(data);
```

Then include a drawer:

```js
${renderProfileDrawer('Tools and services', 'Registry-backed public capabilities', publicTools || renderProfileInfoPanel('Tools and services', 'No public tool cards are published for this profile yet.'))}
```

- [ ] **Step 6: Keep command center placeholder compatible**

Replace placeholder contents with `renderPublicToolsPanel(state.data)` when not claimed, and later with manager controls when claimed.

- [ ] **Step 7: Run focused web tests**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs apps/web/test/api.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit chunk 4**

```bash
git add apps/web/src/tool-manager.js apps/web/src/api.js apps/web/src/app.js apps/web/src/styles.css apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs apps/web/test/api.test.mjs
git commit -m "Render Multipass public tool cards"
```

---

## Chunk 5: Bankr-style x402 import

### Task 8: Normalize Bankr x402 service config

**Files:**
- Modify: `apps/api/src/tool-manifest.js`
- Modify: `apps/api/test/tool-manifest.test.mjs`

- [ ] **Step 1: Add failing Bankr config normalization test**

Use local `bankr.x402.json` shape:

```js
const config = {
  network: 'base',
  currency: 'USDC',
  services: {
    'cred-report': {
      price: '1.00',
      description: 'Helixa AgentDNA cred report.',
      methods: ['GET'],
      schema: { queryParams: { id: 'number - AgentDNA token ID' }, output: { score: 'number' } },
    },
  },
};
const fragment = normalizeBankrServiceTool({ multipassId: 'mp_bendr_2', serviceName: 'cred-report', service: config.services['cred-report'], network: config.network, currency: config.currency, endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report', now: '2026-07-01T00:00:00.000Z' });
assert.equal(fragment.fragment_type, 'tool_manifest');
assert.equal(fragment.tool_manifest_ref.registry, 'bankr_x402_cloud');
assert.equal(fragment.tool_manifest_ref.pricing.amount, '1.00');
```

- [ ] **Step 2: Run Bankr normalization test and confirm failure**

```bash
node --test apps/api/test/tool-manifest.test.mjs --test-name-pattern='Bankr|bankr'
```

Expected: FAIL because `normalizeBankrServiceTool` is not implemented yet.

- [ ] **Step 3: Implement `normalizeBankrServiceTool`**

Rules:

- `serviceName` becomes `tool_id`.
- `description` is bounded and safe.
- `endpointUrl` must be HTTPS.
- `network: base` maps to `chain_id: 8453`.
- `currency` maps to asset.
- `price === '0.00'` maps pricing model `free`; otherwise `fixed`.
- Input/output schema summaries are compact strings, not raw unlimited JSON.

- [ ] **Step 5: Run tests**

```bash
node --test apps/api/test/tool-manifest.test.mjs
```

Expected: PASS.

### Task 9: Add manager import API for Bankr-style metadata

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/api/test/api-routes.test.mjs`
- Modify: `apps/api/test/saved-records.test.mjs`

- [ ] **Step 1: Add failing API tests**

Tests:

- Missing manager session rejects `POST /api/multipass/{id}/tools/import`.
- Valid manager session imports Bankr service config and returns updated tools.
- Duplicate `tool_id` rejects with product-readable error.
- Imported tool appears in `/tools`, `/x402`, and `/agent-card`.

- [ ] **Step 2: Run import route tests and confirm failure**

```bash
node --test apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs --test-name-pattern='tool|Bankr|import'
```

Expected: FAIL because tool import route and saved-record mutation are not implemented yet.

- [ ] **Step 3: Implement saved-record mutation**

Add `importBankrTool(multipassId, input, { actorWallet })`:

- Normalize to `tool_manifest` fragment.
- Reject duplicate active tool IDs.
- Append fragment to saved bundle.
- Update public fragment summary.
- Append change log: `Tool service imported: {name}.`
- Audit event type: `tool_imported`.

- [ ] **Step 4: Add route**

In `handlePostRequest`:

```js
if (parts[2] && parts[3] === 'tools' && parts[4] === 'import' && parts.length === 5) {
  return handleImportTool(request, parts[2], context);
}
```

Input shape:

```json
{
  "source": "bankr_x402_cloud",
  "serviceName": "cred-report",
  "endpointUrl": "https://api.bankr.bot/x402/helixa/cred-report",
  "service": { ... },
  "network": "base",
  "currency": "USDC"
}
```

- [ ] **Step 5: Run focused API tests**

```bash
node --test apps/api/test/tool-manifest.test.mjs apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs
```

Expected: PASS.

### Task 10: Add web manager import UI for Bankr x402 service cards

**Files:**
- Modify: `apps/web/src/tool-manager.js`
- Modify: `apps/web/src/saved-multipass-api.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/tool-manager.test.mjs`
- Modify: `apps/web/test/saved-multipass-api.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add client API tests**

Assert `importMultipassTool` sends `POST /api/multipass/{id}/tools/import` with CSRF token.

- [ ] **Step 2: Add tool manager form tests**

Assert Bankr import form compacts fields to the route input shape and rejects non-HTTPS endpoint URLs client-side.

- [ ] **Step 3: Run web/client import tests and confirm failure**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs apps/web/test/app.test.mjs --test-name-pattern='Bankr|tool import|importMultipassTool'
```

Expected: FAIL because Bankr tool import UI, client helper, and app handlers are not implemented yet.

- [ ] **Step 4: Implement form and handlers**

Add form fields:

- service name,
- endpoint URL,
- price,
- asset,
- method,
- input summary,
- output summary,
- description.

Keep first UI simple. Do not deploy to Bankr.

- [ ] **Step 5: Wire `createApp` state**

Add `toolStatus`, `toolError`, and `toolActiveFragmentId`. Mutations should not clear profile/route data on failure.

- [ ] **Step 6: Run web tests**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit chunk 5**

```bash
git add apps/api/src/tool-manifest.js apps/api/src/index.js apps/api/src/saved-records.js apps/api/test/tool-manifest.test.mjs apps/api/test/api-routes.test.mjs apps/api/test/saved-records.test.mjs apps/web/src/tool-manager.js apps/web/src/saved-multipass-api.js apps/web/src/app.js apps/web/test/tool-manager.test.mjs apps/web/test/saved-multipass-api.test.mjs apps/web/test/app.test.mjs
git commit -m "Import Bankr x402 services into Multipass"
```

---

## Chunk 6: OpenSea-style manifest import with SSRF-safe fetch

### Task 11: Add SSRF-safe manifest fetcher

**Files:**
- Create: `apps/api/src/manifest-fetcher.js`
- Create: `apps/api/test/manifest-fetcher.test.mjs`

- [ ] **Step 1: Add tests for unsafe URLs**

Tests must cover:

- `http://` rejected.
- `https://user:pass@example.com` rejected.
- `https://127.0.0.1/tool.json` rejected.
- `https://localhost/tool.json` rejected.
- private IPv4 and IPv6 ranges rejected.
- redirect to private IP rejected.
- oversized JSON rejected.
- non-JSON content type rejected.
- over-deep object rejected.

- [ ] **Step 2: Run fetcher tests and confirm failure**

```bash
node --test apps/api/test/manifest-fetcher.test.mjs
```

Expected: FAIL because `apps/api/src/manifest-fetcher.js` does not exist yet.

- [ ] **Step 3: Implement fetcher boundaries**

Implement exported `fetchPublicJsonManifest(url, { fetchImpl, resolveHostname, timeoutMs = 5000, maxBytes = 131072, maxRedirects = 1 })`.

Rules:

- Parse URL.
- Require protocol `https:`.
- Reject username/password.
- Reject explicit non-443 port unless allowlisted by parameter.
- Resolve host with injected `resolveHostname` for tests.
- Reject private/loopback/link-local/multicast/metadata ranges.
- Fetch with no credentials or auth headers.
- Follow at most one safe redirect manually.
- Check content type includes `application/json` or `+json`.
- Read bounded bytes.
- Parse JSON.
- Enforce depth/key/array limits.

- [ ] **Step 4: Run fetcher tests**

```bash
node --test apps/api/test/manifest-fetcher.test.mjs
```

Expected: PASS.

### Task 12: Normalize OpenSea-style manifest metadata

**Files:**
- Modify: `apps/api/src/tool-manifest.js`
- Modify: `apps/api/test/tool-manifest.test.mjs`

- [ ] **Step 1: Add tests**

OpenSea-style manifest sample:

```json
{
  "type": "https://opensea.io/schemas/agent-tool/v1",
  "name": "NFT Search",
  "description": "Search collection listings.",
  "endpoint": "https://opensea.io/api/search",
  "inputs": { "type": "object", "properties": { "query": { "type": "string" } } },
  "outputs": { "type": "object" },
  "creatorAddress": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "pricing": { "model": "unknown" },
  "verifiability": { "tier": "self-attested", "execution": "hosted" }
}
```

Assert normalized fragment stores registry `opensea_agent_tool_registry`, endpoint URL, creator address, input/output summaries, and verifiability summary.

- [ ] **Step 2: Run registry manifest normalizer test and confirm failure**

```bash
node --test apps/api/test/tool-manifest.test.mjs --test-name-pattern='OpenSea|registry manifest'
```

Expected: FAIL because `normalizeRegistryManifestTool` is not implemented yet.

- [ ] **Step 3: Implement normalizer**

Export `normalizeRegistryManifestTool({ multipassId, manifestUrl, manifest, registry, now })`.

Do not verify onchain hash in this chunk. Mark assurance `self_attested` and status `pending` unless caller supplies verified registry proof.

- [ ] **Step 4: Run tests**

```bash
node --test apps/api/test/tool-manifest.test.mjs
```

Expected: PASS.

### Task 13: Add manifest import route and web UI

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/web/src/tool-manager.js`
- Modify: `apps/web/src/saved-multipass-api.js`
- Modify tests from prior chunks.

- [ ] **Step 1: Add failing route tests**

`POST /api/multipass/{id}/tools/import` with:

```json
{
  "source": "opensea_agent_tool_registry",
  "manifestUrl": "https://tools.example/.well-known/ai-tool/search.json"
}
```

Use injected `manifestFetcher` in API context to avoid live network calls.

- [ ] **Step 2: Run manifest import route tests and confirm failure**

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern='manifest|opensea|registry'
```

Expected: FAIL because manifest import route is not implemented yet.

- [ ] **Step 3: Implement API path**

If `source === 'opensea_agent_tool_registry'`, fetch manifest via `fetchPublicJsonManifest`, normalize, save tool fragment, append change log.

- [ ] **Step 4: Add failing web import form tests**

Add tests in `apps/web/test/tool-manager.test.mjs` and `apps/web/test/app.test.mjs` for:

- registry manifest URL form validation rejects non-HTTPS URLs,
- valid manifest URL submits `source: 'opensea_agent_tool_registry'`,
- API failure leaves existing tool cards visible and shows a tool-manager error.

- [ ] **Step 5: Run web import form tests and confirm failure**

```bash
node --test apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs --test-name-pattern='manifest|registry|OpenSea|opensea'
```

Expected: FAIL because registry manifest import UI is not implemented yet.

- [ ] **Step 6: Add web import form**

Keep it simple:

- manifest URL,
- registry select,
- optional note.

- [ ] **Step 4: Run tests**

```bash
node --test apps/api/test/manifest-fetcher.test.mjs apps/api/test/tool-manifest.test.mjs apps/api/test/api-routes.test.mjs apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit chunk 6**

```bash
git add apps/api/src/manifest-fetcher.js apps/api/src/tool-manifest.js apps/api/src/index.js apps/api/src/saved-records.js apps/api/test/manifest-fetcher.test.mjs apps/api/test/tool-manifest.test.mjs apps/api/test/api-routes.test.mjs apps/web/src/tool-manager.js apps/web/src/saved-multipass-api.js apps/web/src/app.js apps/web/test/tool-manager.test.mjs apps/web/test/app.test.mjs
git commit -m "Import registry tool manifests into Multipass"
```

---

## Chunk 7: Deployment, live Bendr example, and verification

### Human approval gate before live actions

Stop after Chunk 6 local verification and ask for explicit approval before any of these actions:

- modifying live saved-record data,
- deploying to `/var/www/helixa.xyz/multipass/`,
- restarting `multipass-api.service`,
- pushing `main`,
- calling any live paid or external service.

The approval request must list the exact commands or script path that will run. Do not treat earlier approval for development as approval for live deploy or push.

### Task 14: Prepare Bendr tool-card seed script, but do not run without approval

**Files:**
- Create: `scripts/seed-bendr-tool-cards.mjs`
- Read input config: `/home/ubuntu/.openclaw/workspace/bankr.x402.json`
- Target live DB only after approval: `/var/lib/helixa/multipass.sqlite`

- [ ] **Step 1: Create a dry-run first script**

The script must default to dry-run mode and print the fragments it would add for:

- `agent-lookup` free.
- `cred-report` paid.

It must skip mutation-style services (`agent-update`, `soul-lock`, `soul-share`, `mint`) until ownership/write semantics are reviewed.

- [ ] **Step 2: Test script against a temporary SQLite copy**

Create a temporary DB copy in `/tmp`, run the script there, and verify `/tools`, `/x402`, and `/agent-card` through a local API server before touching live data.

- [ ] **Step 3: Stop for human approval before live DB write**

Ask explicitly before running the script against `/var/lib/helixa/multipass.sqlite`. Include exact command.

- [ ] **Step 4: Verify live APIs after approved live seed**

```bash
curl -s https://helixa.xyz/api/multipass/bendr-2-1/tools | jq '.summary, .tools[].tool_id'
curl -s https://helixa.xyz/api/multipass/bendr-2-1/x402 | jq '.endpoints[].endpoint_id'
curl -s https://helixa.xyz/api/multipass/bendr-2-1/agent-card | jq '.service_endpoints'
```

Expected:

- `/tools` includes `agent-lookup` and `cred-report`.
- `/x402` includes Bankr x402 tools only.
- `/agent-card` includes service endpoint summaries.

### Task 15: Full local verification, then live deploy only after approval

- [ ] **Step 1: Run full tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

```bash
MULTIPASS_BASE=/multipass/ pnpm web:build
```

Expected: build exits 0.

- [ ] **Step 3: Check whitespace**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Stop for human approval before deploy**

Show the exact deploy command and ask for approval. Do not deploy from the plan without that approval.

- [ ] **Step 5: Deploy web bundle after approval**

```bash
rsync -a --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Only run after tests/build pass and explicit approval.

- [ ] **Step 6: Restart API if server code changed, after approval**

Use the existing service:

```bash
systemctl --user restart multipass-api.service
```

If this requires elevated permissions or fails, surface the blocker.

- [ ] **Step 7: Live smoke**

```bash
curl -sI https://helixa.xyz/multipass/ | head
curl -s https://helixa.xyz/api/multipass/bendr-2-1/tools | jq '.summary'
curl -s https://helixa.xyz/api/multipass/bendr-2-1/x402 | jq '.endpoints | length'
```

Use browser smoke for `/multipass/?agent=1` and `/multipass/?agent=81` to confirm no visual regressions.

- [ ] **Step 8: Stop for human approval before push**

Show `git log --oneline -5`, `git status --short`, and the exact push command. Ask for approval before pushing.

- [ ] **Step 9: Final commit/push after approval**

```bash
git status --short
git push origin main
```

Only push after clean status, passing tests, build, and live smoke.

---

## Risk Notes

- Do not treat Bankr service import as Bankr deployment control.
- Do not call paid endpoints during tests.
- Do not fetch arbitrary manifests without SSRF hardening.
- Do not expose gated/private/hidden tool cards on public APIs.
- Do not include mutation-style Helixa services in the first public Bendr demo unless their authority story is reviewed.
- Do not claim OpenSea registry verification until onchain hash/creator checks are actually implemented.

---

## Completion Criteria

- Owner Command Center is live and keeps current claim/profile/route/fragment behavior working.
- `/api/multipass/{id}/tools` returns public normalized tool cards only.
- Public profiles show Tools and Services cards.
- x402 manifests derive from active public Bankr x402 service cards.
- Agent cards summarize active public tool/service endpoints.
- Bankr x402 services can be imported as metadata without deploying or executing them.
- OpenSea-style manifests can be imported only through SSRF-safe server fetch.
- Full tests, production build, diff check, and live smoke pass.

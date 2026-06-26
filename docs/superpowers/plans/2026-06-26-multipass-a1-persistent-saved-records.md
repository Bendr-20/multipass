# Multipass A1 Persistent Saved Records Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user activate a live agent record, save it as a persistent Multipass record, and share a stable saved profile URL.

**Architecture:** Add an API-local saved-record repository backed by SQLite, expose preview-only activate and save endpoints, then wire the web app to show a `Save Multipass` action after live activation. A1 deliberately stops before wallet claim/session auth and dashboard editing; those are A2/A3.

**Tech Stack:** Node 22 ESM, `node:sqlite`, Web Fetch API `Request`/`Response`, Vite web app, Node test runner, JSDOM.

---

## Scope

Build A1 only:

- Persistent saved Multipass records.
- Idempotent save by source canonical ID.
- Stable public saved URL.
- Public API reads for saved records.
- Web `Save Multipass` flow after live Activate.
- Change log entry for initial save.

Do not build in A1:

- Wallet claim.
- Manager sessions.
- CSRF/session auth.
- Owner dashboard editing.
- Manual review.
- NFT collection directory.
- SDK publishing or OpenAPI hardening.
- Contract writes, custody changes, tool permissions, or secrets.

## Plan review corrections that must be preserved

These are non-negotiable A1 implementation constraints:

- Because A1 uses `node:sqlite`, update the root `package.json` engines from Node 20-compatible to Node 22-compatible in Task 1, or choose a non-experimental SQLite dependency instead. This plan uses Node 22 and `node:sqlite`.
- Persist sanitized source context at save time. Use a focused `source_context_json` column or equivalent containing:
  - `activation`: `{ state, origin, originSource, sourceType, canonicalId, tokenId, savedAt }`
  - `sourceSnapshot`: sanitized public source fields needed for later source-context/claim flows. Keep public identifiers like `tokenId`; block private-looking credential fields such as `privateKey`, `secret`, `password`, `credential`, and auth bearer tokens.
- API A1 accepts only token ID or canonical Base ID. Name lookup remains client-side resolver behavior; the web save call must send the resolved token ID, not the original name.
- Keep current `/agent-card` route and add `/card` as an alias for saved/public records because the MVP spec uses `/card`.
- Define and handle `ApiInputError` explicitly so bad JSON and bad requests return structured `400` responses, not thrown `500`s.
- `server.js` must forward request headers and body into the Fetch `Request` for POST. Direct route tests are not enough.
- Web saved URLs must support `/multipass/:slug` in `isSafeSharePath`, `syncShareUrl`, and share panel rendering.
- Split save rendering/client concerns out of `apps/web/src/app.js` where practical. Do not make the already-large app file carry all save UI logic.
- Final smoke must restart the API with the same SQLite DB and assert saved reads survive restart.

## Relevant spec

`docs/superpowers/specs/2026-06-26-multipass-mvp-a-b-c-design.md`

A1 maps to rollout item:

> A1 - Persistent saved records: API storage, Save Multipass from live Activate, Stable public saved profile URL.

## File map

Create:

- `apps/api/src/saved-records.js`
  - SQLite repository for saved Multipass documents, source indexes, change logs, and schema-shaped public reads.

- `apps/api/src/activation-records.js`
  - API-side resolver/save mapper. Converts a live public Helixa source record into persisted profile/card/fragments/standards/x402/receipt documents.

- `apps/api/test/saved-records.test.mjs`
  - Repository tests.

- `apps/api/test/activation-records.test.mjs`
  - Mapper and source validation tests.

- `apps/web/src/saved-multipass-api.js`
  - Browser API client for saving activated records.

- `apps/web/src/save-panel.js`
  - Focused save-panel renderer and saved-share-path helpers to keep `app.js` from growing further.

- `apps/web/test/saved-multipass-api.test.mjs`
  - Browser API client tests.

Modify:

- `apps/api/src/index.js`
  - Add POST route handling and saved-record store integration while preserving existing fixture GET behavior.

- `apps/api/src/server.js`
  - Add `MULTIPASS_DB_PATH` support for persistent saved records.

- `apps/api/test/api-routes.test.mjs`
  - Add activate/save/read route coverage.

- `apps/api/test/server.test.mjs`
  - Add server option parsing for database path.

- `apps/web/src/app.js`
  - Add save state, save handler, button, success/error copy, and stable saved share URL.

- `apps/web/src/styles.css`
  - Add compact save status styles if existing button/message styles are not enough.

- `apps/web/test/app.test.mjs`
  - Add rendered save-flow tests.

- `docs/v0-scope.md`
  - Mark persistent saved records as underway or included in A1.

- `package.json`
  - Raise Node engine to Node 22-compatible if it currently allows Node 20.

---

## Chunk 1: API persistence and source mapping

### Task 1: Add SQLite saved-record repository

**Files:**
- Create: `apps/api/src/saved-records.js`
- Create: `apps/api/test/saved-records.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/test/saved-records.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSqliteSavedRecords } from '../src/saved-records.js';

function makeSavedRecord(overrides = {}) {
  const now = '2026-06-26T20:00:00.000Z';
  return {
    source: {
      sourceType: 'helixa_agent',
      canonicalId: overrides.canonicalId ?? '8453:1',
      tokenId: overrides.tokenId ?? '1',
    },
    sourceContext: {
      activation: {
        state: 'saved_unclaimed',
        origin: 'live_agent_record',
        originSource: 'trusted_resolver_metadata',
        sourceType: 'helixa_agent',
        canonicalId: overrides.canonicalId ?? '8453:1',
        tokenId: overrides.tokenId ?? '1',
        savedAt: now,
      },
      sourceSnapshot: {
        name: overrides.displayName ?? 'Bendr 2.0',
        tokenId: overrides.tokenId ?? '1',
        owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        privateKey: 'must-not-persist',
      },
    },
    profile: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      subject_type: 'agent',
      display_name: overrides.displayName ?? 'Bendr 2.0',
      slug: overrides.slug ?? 'bendr-2',
      status: 'active',
      owner_summary: { owner_state: 'unclaimed', verification_status: 'none', visibility: 'public' },
      custody_epoch: null,
      public_fragments: [],
      cred_summary: { trust_state: 'none', attestation_count: 0, receipt_count: 0, last_updated_at: now },
      discovery_profile: { summary: 'Saved from a public live source record.', tags: ['helixa'], visibility: 'public' },
      standards_profile: { standards_profile_id: 'sp_helixa_agent_1', supported_standard_ids: ['ERC-8004'], last_verified_at: null },
      payment_profile: { accepted_assets: [], x402_manifest_url: null, paid_endpoints_enabled: false },
      updated_at: now,
    },
    fragments: [
      {
        schema_version: '0.1.0',
        fragment_id: 'saved_public_wallet',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        fragment_type: 'wallet',
        status: 'pending',
        assurance_level: 'self_attested',
        visibility: 'public',
        transfer_policy: 'reverify_on_transfer',
        source: { source_type: 'helixa_api', source_id: '8453:1', issuer: null, observed_at: now },
        created_at: now,
        updated_at: now,
      },
      {
        schema_version: '0.1.0',
        fragment_id: 'saved_private_note',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        fragment_type: 'attestation',
        status: 'pending',
        assurance_level: 'self_attested',
        visibility: 'private',
        transfer_policy: 'non_transferable',
        source: { source_type: 'internal', source_id: 'private', issuer: null, observed_at: now },
        created_at: now,
        updated_at: now,
      },
    ],
    agentCard: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      name: overrides.displayName ?? 'Bendr 2.0',
      subject_type: 'agent',
      capabilities: [],
      message_routes: [],
      service_endpoints: [],
      x402_manifest_url: null,
      accepted_assets: [],
      trust_summary: { identity_status: 'unverified', assurance_level: 'unverified', last_updated_at: null },
      rate_limits: { requests: 0, window_seconds: 60 },
      contact_policy: { mode: 'approval_required', requires_owner_approval: true },
      standards_refs: [],
    },
    standardsProfile: {
      schema_version: '0.1.0',
      standards_profile_id: 'sp_helixa_agent_1',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      primary_refs: {},
      standard_refs: [],
      compatibility_summary: {
        identity_bound: false,
        owner_verified: false,
        risk_checked: false,
        tools_verified: false,
        work_attested: false,
        trust_updated: false,
      },
      adapter_versions: {},
      last_verified_at: null,
    },
    x402Manifest: {
      schema_version: '0.1.0',
      multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
      endpoints: [],
    },
    receipts: [
      {
        schema_version: '0.1.0',
        receipt_id: 'saved_receipt_1',
        multipass_id: overrides.multipassId ?? 'mp_helixa_agent_1',
        endpoint_id: 'save',
        provider: 'helixa_api',
        amount: '0',
        asset: 'CRED',
        chain_id: 8453,
        status: 'settled',
        created_at: now,
        response_class: 'success',
      },
    ],
    change: {
      change_id: 'change_initial_save',
      message: 'Multipass saved from live public source record.',
      created_at: now,
    },
  };
}

test('createSqliteSavedRecords saves and resolves by id slug and source', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const saved = store.saveActivatedRecord(makeSavedRecord());

  assert.equal(saved.created, true);
  assert.equal(saved.profile.multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.resolveProfile('mp_helixa_agent_1').slug, 'bendr-2');
  assert.equal(store.resolveProfile('bendr-2').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.resolveBySource('helixa_agent', '8453:1').profile.slug, 'bendr-2');
  assert.equal(store.getChangeLog('mp_helixa_agent_1').entries.length, 1);
});


test('saved repository returns public document bundle and sanitized source context', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  store.saveActivatedRecord(makeSavedRecord());

  assert.equal(store.getAgentCard('mp_helixa_agent_1').name, 'Bendr 2.0');
  assert.deepEqual(store.getPublicFragments('mp_helixa_agent_1').map((fragment) => fragment.fragment_id), ['saved_public_wallet']);
  assert.equal(store.getStandardsProfile('mp_helixa_agent_1').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.getX402Manifest('mp_helixa_agent_1').multipass_id, 'mp_helixa_agent_1');
  assert.equal(store.getReceiptFragment('mp_helixa_agent_1', 'saved_receipt_1').receipt_id, 'saved_receipt_1');
  assert.equal(store.getReceiptFragment('mp_helixa_agent_1', 'missing'), null);
  const sourceContext = store.getSourceContext('mp_helixa_agent_1');
  assert.equal(sourceContext.activation.canonicalId, '8453:1');
  assert.equal(sourceContext.sourceSnapshot.owner, '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal('privateKey' in sourceContext.sourceSnapshot, false);
});

test('saveActivatedRecord validates source and change metadata', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), source: { sourceType: '', canonicalId: '8453:1' } }), /sourceType/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), source: { sourceType: 'helixa_agent', canonicalId: '' } }), /canonicalId/);
  assert.throws(() => store.saveActivatedRecord({ ...makeSavedRecord(), change: null }), /change/);
});

test('saveActivatedRecord is idempotent by source canonical id', () => {
  const store = createSqliteSavedRecords({ databasePath: ':memory:' });
  const first = store.saveActivatedRecord(makeSavedRecord());
  const second = store.saveActivatedRecord(makeSavedRecord({ displayName: 'Renamed later' }));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.profile.display_name, 'Bendr 2.0');
  assert.equal(store.getChangeLog('mp_helixa_agent_1').entries.length, 1);
});

test('file-backed store persists after reopening', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-saved-'));
  const databasePath = path.join(dir, 'multipass.sqlite');
  try {
    createSqliteSavedRecords({ databasePath }).saveActivatedRecord(makeSavedRecord());
    const reopened = createSqliteSavedRecords({ databasePath });
    assert.equal(reopened.resolveProfile('bendr-2').multipass_id, 'mp_helixa_agent_1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run repository tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/saved-records.test.mjs
```

Expected: FAIL with module not found for `../src/saved-records.js`.

- [ ] **Step 3: Implement SQLite repository**

Create `apps/api/src/saved-records.js`:

```js
import { DatabaseSync } from 'node:sqlite';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

export function createSqliteSavedRecords({ databasePath = ':memory:' } = {}) {
  const db = new DatabaseSync(databasePath);
  initialize(db);

  return {
    saveActivatedRecord(record) {
      const normalized = normalizeSavedRecord(record);
      const existing = resolveBySource(db, normalized.source.sourceType, normalized.source.canonicalId);
      if (existing) return { ...existing, created: false };

      const now = new Date().toISOString();
      db.prepare(`INSERT INTO saved_records (
        multipass_id, slug, source_type, source_canonical_id, source_token_id,
        profile_json, fragments_json, agent_card_json, standards_json, x402_json, receipts_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        normalized.profile.multipass_id,
        normalized.profile.slug,
        normalized.source.sourceType,
        normalized.source.canonicalId,
        normalized.source.tokenId ?? null,
        JSON.stringify(normalized.profile),
        JSON.stringify(normalized.fragments),
        JSON.stringify(normalized.agentCard),
        JSON.stringify(normalized.standardsProfile),
        JSON.stringify(normalized.x402Manifest),
        JSON.stringify(normalized.receipts),
        now,
        now,
      );

      db.prepare(`INSERT INTO change_log_entries (multipass_id, change_id, message, created_at)
        VALUES (?, ?, ?, ?)`).run(
        normalized.profile.multipass_id,
        normalized.change.change_id,
        normalized.change.message,
        normalized.change.created_at,
      );

      return { ...readBundleById(db, normalized.profile.multipass_id), created: true };
    },

    resolveProfile(identifier) {
      return readProfile(db, identifier);
    },

    resolveBySource(sourceType, canonicalId) {
      return resolveBySource(db, sourceType, canonicalId);
    },

    getPublicFragments(multipassId) {
      return readBundleById(db, multipassId)?.fragments.filter((fragment) => fragment.visibility === 'public') ?? [];
    },

    getAgentCard(multipassId) {
      return readBundleById(db, multipassId)?.agentCard ?? null;
    },

    getStandardsProfile(multipassId) {
      return readBundleById(db, multipassId)?.standardsProfile ?? null;
    },

    getX402Manifest(multipassId) {
      return readBundleById(db, multipassId)?.x402Manifest ?? null;
    },

    getReceiptFragment(multipassId, receiptId) {
      return readBundleById(db, multipassId)?.receipts.find((receipt) => receipt.receipt_id === receiptId) ?? null;
    },

    getChangeLog(multipassId) {
      const rows = db.prepare(`SELECT change_id, message, created_at FROM change_log_entries WHERE multipass_id = ? ORDER BY rowid ASC`).all(multipassId);
      return { schema_version: '0.1.0', multipass_id: multipassId, entries: rows };
    },
  };
}

function initialize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_records (
      multipass_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      source_canonical_id TEXT NOT NULL,
      source_token_id TEXT,
      profile_json TEXT NOT NULL,
      fragments_json TEXT NOT NULL,
      agent_card_json TEXT NOT NULL,
      standards_json TEXT NOT NULL,
      x402_json TEXT NOT NULL,
      receipts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_type, source_canonical_id)
    );
    CREATE TABLE IF NOT EXISTS change_log_entries (
      multipass_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function normalizeSavedRecord(record) {
  return {
    source: {
      sourceType: String(record?.source?.sourceType ?? '').trim(),
      canonicalId: String(record?.source?.canonicalId ?? '').trim(),
      tokenId: record?.source?.tokenId ? String(record.source.tokenId) : null,
    },
    profile: assertMultipassProfile(record.profile),
    fragments: (record.fragments ?? []).map(assertIdentityFragment),
    agentCard: assertAgentCard(record.agentCard),
    standardsProfile: assertStandardsProfile(record.standardsProfile),
    x402Manifest: assertX402Manifest(record.x402Manifest),
    receipts: (record.receipts ?? []).map(assertReceiptFragment),
    change: record.change,
  };
}
```

Then add helper functions used above:

```js
function readProfile(db, identifier) {
  const row = db.prepare(`SELECT profile_json FROM saved_records WHERE multipass_id = ? OR slug = ?`).get(identifier, identifier);
  return row ? JSON.parse(row.profile_json) : null;
}

function resolveBySource(db, sourceType, canonicalId) {
  const row = db.prepare(`SELECT multipass_id FROM saved_records WHERE source_type = ? AND source_canonical_id = ?`).get(sourceType, canonicalId);
  return row ? readBundleById(db, row.multipass_id) : null;
}

function readBundleById(db, multipassId) {
  const row = db.prepare(`SELECT * FROM saved_records WHERE multipass_id = ?`).get(multipassId);
  if (!row) return null;
  return {
    profile: JSON.parse(row.profile_json),
    fragments: JSON.parse(row.fragments_json),
    agentCard: JSON.parse(row.agent_card_json),
    standardsProfile: JSON.parse(row.standards_json),
    x402Manifest: JSON.parse(row.x402_json),
    receipts: JSON.parse(row.receipts_json),
  };
}
```

Add `source_context_json TEXT NOT NULL` to `saved_records`, persist `JSON.stringify(normalized.sourceContext)`, and expose:

```js
getSourceContext(multipassId) {
  return readSourceContext(db, multipassId);
}
```

`readSourceContext` must parse `source_context_json` by `multipass_id` and return `null` when missing.

Add `sanitizeSourceSnapshot(snapshot)` that allowlists public source fields only. It must not persist fields named like `privateKey`, `secret`, `token`, `password`, or `credential`.

Add validation at the top of `normalizeSavedRecord` so empty `sourceType`, empty `canonicalId`, missing `sourceContext.activation`, missing `sourceContext.sourceSnapshot`, or missing `change` throw clear `TypeError`s.

Update `package.json` engines to require Node 22-compatible runtime for `node:sqlite`, for example `>=22.5.0` if the file currently allows Node 20.

- [ ] **Step 4: Run repository tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/saved-records.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit repository**

Run:

```bash
cd /home/ubuntu/multipass
git add package.json apps/api/src/saved-records.js apps/api/test/saved-records.test.mjs
git commit -m "Add saved Multipass record repository"
```

### Task 2: Add API-side activation-to-record mapper

**Files:**
- Create: `apps/api/src/activation-records.js`
- Create: `apps/api/test/activation-records.test.mjs`

- [ ] **Step 1: Write failing mapper tests**

Create `apps/api/test/activation-records.test.mjs` with tests for:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAgentCard,
  assertMultipassProfile,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import { buildSavedRecordFromHelixaAgent, parseActivationInput } from '../src/activation-records.js';

test('parseActivationInput accepts token and canonical Base ids', () => {
  assert.deepEqual(parseActivationInput('1'), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
  assert.deepEqual(parseActivationInput('8453:81'), { chainId: 8453, tokenId: '81', canonicalId: '8453:81' });
});

test('parseActivationInput rejects unsupported or ambiguous input', () => {
  assert.throws(() => parseActivationInput('1.2'), /Use a token ID/);
  assert.throws(() => parseActivationInput('1:2'), /Base/);
  assert.throws(() => parseActivationInput('Quigbot'), /Use a token ID/);
});

test('buildSavedRecordFromHelixaAgent creates schema-shaped public documents', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '1',
    name: 'Bendr 2.0',
    owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    verified: true,
    credScore: 82,
    framework: 'OpenClaw',
    mintedAt: '2026-02-17T00:00:00.000Z',
  }, { observedAt: '2026-06-26T20:00:00.000Z' });

  assert.equal(record.source.canonicalId, '8453:1');
  assert.equal(record.profile.status, 'active');
  assert.equal(record.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(record.profile.owner_summary.verification_status, 'none');
  assert.equal(record.profile.display_name, 'Bendr 2.0');
  assert.match(record.profile.slug, /^bendr-2/);
  assert.equal(record.agentCard.name, 'Bendr 2.0');
  assert.equal(record.change.message, 'Multipass saved from live public source record.');
  assert.equal(record.sourceContext.activation.canonicalId, '8453:1');
  assert.equal(record.sourceContext.activation.state, 'saved_unclaimed');
  assert.equal(record.sourceContext.sourceSnapshot.owner, '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal(record.sourceContext.sourceSnapshot.privateKey, undefined);
  assertAgentCard(record.agentCard);
  assertMultipassProfile(record.profile);
  assertStandardsProfile(record.standardsProfile);
  assertX402Manifest(record.x402Manifest);
});

test('saved record remains unclaimed even when live source publishes an owner', () => {
  const record = buildSavedRecordFromHelixaAgent({ tokenId: '1', name: 'Bendr 2.0', owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });
  assert.equal(record.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(record.profile.owner_summary.verification_status, 'none');
});
```

- [ ] **Step 2: Run mapper tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/activation-records.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement mapper**

Create `apps/api/src/activation-records.js`:

- Export `parseActivationInput(input)`.
- Export `fetchHelixaAgent(tokenId, fetchImpl = fetch)`.
- Export `buildSavedRecordFromHelixaAgent(agent, options = {})`.
- Export `activateHelixaRecord(input, { fetchImpl, observedAt } = {})`.

Implementation rules:

- Support only positive token IDs and `8453:<tokenId>`.
- Do not support name search in API A1. Web can still resolve names client-side before save by sending `state.data.resolver.tokenId`, not the original name input.
- Build schema-shaped public documents only and validate them with SDK assertions in tests.
- Include `sourceContext.activation` and sanitized `sourceContext.sourceSnapshot` in every saved record.
- Saved profile owner state is `unclaimed`, even if source owner exists. Source owner can appear as a public fragment, but it does not grant Multipass management yet.
- Use deterministic IDs:
  - `multipass_id`: `mp_helixa_agent_${tokenId}`
  - slug: slugified display name with token suffix, for example `bendr-2-1`
  - source canonical ID: `8453:${tokenId}`
- Include sanitized source context in the saved repository as `source_context_json`; public profile reads must not dump raw source.
- Implement `slugifyDisplayName(name, tokenId)` as lower-case alphanumeric words joined by hyphens plus token suffix.
- Implement `sanitizeSourceSnapshot(agent)` with an allowlist: `tokenId`, `name`, `owner`, `verified`, `credScore`, `framework`, `mintedAt`, and public service/social fields. Do not use a broad substring ban that removes public `tokenId`.
- Create a public owner wallet fragment if `agent.owner` exists, but keep profile claim state unclaimed.
- Do not include private-looking fields from the live source in source snapshots or public JSON.

- [ ] **Step 4: Run mapper tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/activation-records.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit mapper**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/api/src/activation-records.js apps/api/test/activation-records.test.mjs
git commit -m "Map live Helixa records to saved Multipass documents"
```

---

## Chunk 2: API routes and server config

### Task 3: Add preview-only activate and save routes

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Write failing API route tests**

In `apps/api/test/api-routes.test.mjs`, add tests that create an API with a saved store and fake activation service. Define a local `makeSavedRecord()` helper in this test file with slug `bendr-2-1` so expected share paths are deterministic:

```js
import { createSqliteSavedRecords } from '../src/saved-records.js';

function makeSaveApi() {
  const savedRecords = createSqliteSavedRecords({ databasePath: ':memory:' });
  return createMultipassApi({
    store: createMemoryStore({ profiles: [profile], fragments: [publicFragment], agentCards: [agentCard], standardsProfiles: [standardsProfile], x402Manifests: [x402Manifest], receiptFragments: [receipt] }),
    savedRecords,
    baseUrl: 'https://multipass.example.test',
    activationService: async (input) => {
      assert.equal(input, '1');
      return makeSavedRecord();
    },
  });
}
```

Add route tests:

- `POST /api/multipass/activate` returns preview JSON and does not persist.
- `POST /api/multipass` saves, returns `201`, `created: true`, `profile`, and `sharePath: /multipass/bendr-2-1`.
- Repeating `POST /api/multipass` returns `200`, `created: false`.
- `GET /api/multipass/:slug` resolves saved record and includes `multipass_id` and `slug`.
- `GET /api/multipass/:slug/card` and `/agent-card` both return the saved card.
- `GET /api/multipass/:slug/fragments` returns saved public fragments, not fixture fragments.
- `GET /api/multipass/:id/changes` returns initial save change log.
- Bad JSON returns `400 invalid_json`.
- Missing `agent` returns `400 invalid_request`.

Use helper:

```js
async function postJson(api, path, body) {
  const response = await api.handleRequest(new Request(`https://multipass.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}
```

- [ ] **Step 2: Run API route tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/api-routes.test.mjs
```

Expected: FAIL because current API rejects non-GET.

- [ ] **Step 3: Implement routes**

In `apps/api/src/index.js`:

- Keep existing GET routes working.
- Change method dispatch:
  - GET uses existing public read handler.
  - POST handles only `/api/multipass/activate` and `/api/multipass`.
  - Other methods return 405.
- Accept optional `savedRecords` and `activationService` in `createMultipassApi`.
- If POST save/preview is called without an `activationService`, return structured `503 not_configured`.
- Public reads should check saved records first, then fixture store, so a saved slug works.
- Add `GET /api/multipass/:id/changes` when `savedRecords.getChangeLog` exists.

Define `ApiInputError` and catch it in POST handlers so invalid input maps to `400`:

```js
class ApiInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiInputError';
    this.code = code;
  }
}
```

Body parsing helper:

```js
async function readJsonBody(request) {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiInputError('invalid_json', 'Request body must be valid JSON.');
  }
}
```

Preview route:

```js
async function handleActivatePreview(request, activationService) {
  const body = await readJsonBody(request);
  const agent = String(body.agent ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to activate.');
  const record = await activationService(agent);
  return jsonResponse({
    schema_version: '0.1.0',
    state: 'activated_unsaved',
    profile: record.profile,
    source: record.source,
  });
}
```

Save route:

```js
async function handleSaveMultipass(request, { savedRecords, activationService }) {
  if (!savedRecords) return errorResponse(503, 'not_configured', 'Saved Multipass records are not configured.');
  const body = await readJsonBody(request);
  const agent = String(body.agent ?? '').trim();
  if (!agent) throw new ApiInputError('invalid_request', 'Provide agent to save.');
  const record = await activationService(agent);
  const saved = savedRecords.saveActivatedRecord(record);
  return jsonResponse({
    schema_version: '0.1.0',
    state: saved.created ? 'saved_unclaimed' : 'saved_existing',
    created: saved.created,
    profile: saved.profile,
    sharePath: `/multipass/${encodeURIComponent(saved.profile.slug)}`,
  }, saved.created ? 201 : 200);
}
```

- [ ] **Step 4: Run API route tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/api-routes.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit API routes**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/api/src/index.js apps/api/test/api-routes.test.mjs
git commit -m "Add saved Multipass API routes"
```

### Task 4: Add server database path configuration

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write failing server config tests**

In `apps/api/test/server.test.mjs`, add assertions:

```js
assert.equal(parseServerOptions([], { MULTIPASS_DB_PATH: '/tmp/multipass.sqlite' }).databasePath, '/tmp/multipass.sqlite');
assert.equal(parseServerOptions(['--database', '/tmp/cli.sqlite'], {}).databasePath, '/tmp/cli.sqlite');
```

Add a start-server test with a temp database that posts `/api/multipass` through the real HTTP server. This test must fail before implementation because `server.js` currently does not forward request headers/body into the Fetch `Request`.

The test should:

- Start the server with temp `databasePath` and injected fake `activationService` option.
- POST JSON `{ "agent": "1" }` to `/api/multipass` with `fetch`.
- Assert status `201`, `created: true`, and stable slug.
- GET the saved slug through the same server and assert it resolves.

- [ ] **Step 2: Run server tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/server.test.mjs
```

Expected: FAIL because database path parsing does not exist.

- [ ] **Step 3: Implement database config**

In `apps/api/src/server.js`:

- Add `databasePath` to parsed options from `MULTIPASS_DB_PATH` or `--database`.
- Accept optional `savedRecords` and `activationService` in `startServer(options)` for tests.
- If `databasePath` is present and `savedRecords` is not injected, create `savedRecords = createSqliteSavedRecords({ databasePath })`.
- Pass `savedRecords` and default `activationService: activateHelixaRecord` into `createMultipassApi`.
- Forward request method, headers, and body from `http.IncomingMessage` into the Fetch `Request`. For GET/HEAD, do not attach a body. For POST, pass `body: req` and `duplex: 'half'` if Node requires it.
- Keep fixture store for existing fixture routes.
- Log database path at startup if configured.

- [ ] **Step 4: Run server tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/server.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit server config**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/api/src/server.js apps/api/test/server.test.mjs
git commit -m "Configure persistent Multipass API storage"
```

---

## Chunk 3: Web save flow

### Task 5: Add browser save API client

**Files:**
- Create: `apps/web/src/saved-multipass-api.js`
- Create: `apps/web/test/saved-multipass-api.test.mjs`

- [ ] **Step 1: Write failing API client tests**

Create `apps/web/test/saved-multipass-api.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { saveActivatedMultipass } from '../src/saved-multipass-api.js';

test('saveActivatedMultipass posts agent input and returns saved payload', async () => {
  const calls = [];
  const result = await saveActivatedMultipass({
    agent: '1',
    apiBase: 'https://api.example.test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls[0].url, 'https://api.example.test/api/multipass');
  assert.equal(JSON.parse(calls[0].init.body).agent, '1');
  assert.equal(result.sharePath, '/multipass/bendr-2-1');
});

test('saveActivatedMultipass preserves absolute API base paths', async () => {
  const calls = [];
  await saveActivatedMultipass({
    agent: '1',
    apiBase: 'https://api.example.test/base',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), { status: 201 });
    },
  });
  assert.equal(calls[0].url, 'https://api.example.test/base/api/multipass');
});

test('saveActivatedMultipass supports relative API bases', async () => {
  const calls = [];
  await saveActivatedMultipass({
    agent: '1',
    apiBase: '/multipass-api',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), { status: 201 });
    },
  });
  assert.equal(calls[0].url, '/multipass-api/api/multipass');
});

test('saveActivatedMultipass throws useful API errors', async () => {
  await assert.rejects(
    () => saveActivatedMultipass({
      agent: '1',
      apiBase: 'https://api.example.test',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Nope.' } }), { status: 400 }),
    }),
    /Nope/,
  );
});
```

- [ ] **Step 2: Run API client tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/saved-multipass-api.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement API client**

Create `apps/web/src/saved-multipass-api.js`:

```js
export class SavedMultipassError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SavedMultipassError';
    this.details = details;
  }
}

export async function saveActivatedMultipass({ agent, apiBase = window.location.origin, fetchImpl = fetch } = {}) {
  const trimmed = String(agent ?? '').trim();
  if (!trimmed) throw new SavedMultipassError('Activate a live record before saving.');
  const url = joinApiPath(apiBase, '/api/multipass');
  const response = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ agent: trimmed }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SavedMultipassError(body?.error?.message ?? `Save failed with ${response.status}`, { status: response.status, body });
  }
  return body;
}

function joinApiPath(apiBase, path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (/^https?:\/\//i.test(String(apiBase))) return new URL(cleanPath, stripTrailingSlash(apiBase)).toString();
  return `${stripTrailingSlash(apiBase || '')}${cleanPath}`;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}
```

Use `joinApiPath(apiBase, '/api/multipass')` so relative dev/proxy API bases and absolute base paths keep working.

- [ ] **Step 4: Run API client tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/web/test/saved-multipass-api.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit API client**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web/src/saved-multipass-api.js apps/web/test/saved-multipass-api.test.mjs
git commit -m "Add saved Multipass web API client"
```

### Task 6: Add Save Multipass UI after live activation

**Files:**
- Create: `apps/web/src/save-panel.js`
- Modify: `apps/web/src/api.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing rendered save-flow tests**

In `apps/web/test/app.test.mjs`, update app factory usage so tests can inject `saveMultipass` when needed. Add tests:

```js
test('live activated page saves with resolved token id and updates share panel', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=Quigbot');
  const liveData = {
    ...sampleData(),
    sourceLabel: 'live Helixa API',
    resolver: { canonicalId: '8453:1', tokenId: '1' },
    liveProfilePage: { headline: 'Bendr Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
  };
  const saves = [];

  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => liveData,
    saveMultipass: async ({ agent }) => {
      saves.push(agent);
      return { created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } };
    },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  const button = [...root.querySelectorAll('button')].find((node) => node.textContent === 'Save Multipass');
  assert.ok(button);
  button.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(saves, ['1']);
  assert.match(root.textContent, /Saved Multipass/);
  assert.match(root.textContent, /\/multipass\/bendr-2-1/);
  assert.equal(new URL(window.location.href).pathname, '/multipass/bendr-2-1');
});


test('direct saved slug route loads saved Multipass from API instead of static preview', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const fetches = [];
  await createApp({
    root,
    fetchImpl: async (url) => {
      fetches.push(url);
      if (String(url).endsWith('/api/multipass/bendr-2-1')) {
        return new Response(JSON.stringify({ ...sampleData().profile, display_name: 'Saved Bendr', slug: 'bendr-2-1', multipass_id: 'mp_helixa_agent_1', status: 'active' }), { status: 200 });
      }
      if (String(url).endsWith('/fragments')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', fragments: [] }), { status: 200 });
      if (String(url).endsWith('/card') || String(url).endsWith('/agent-card')) return new Response(JSON.stringify({ ...sampleData().card, multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' }), { status: 200 });
      if (String(url).endsWith('/standards')) return new Response(JSON.stringify(sampleData().standards), { status: 200 });
      if (String(url).endsWith('/x402')) return new Response(JSON.stringify(sampleData().x402), { status: 200 });
      if (String(url).endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', entries: [{ message: 'Multipass saved from live public source record.' }] }), { status: 200 });
      throw new Error(`Unexpected URL ${url}`);
    },
  }).start();

  assert.match(root.textContent, /Saved Bendr/);
  assert.match(root.textContent, /Saved Multipass/);
  assert.doesNotMatch(root.textContent, /Preview Multipass/);
  assert.ok(fetches.some((url) => String(url).includes('/api/multipass/bendr-2-1')));
});

test('save error does not update stable URL or claim success', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=1');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => ({
      ...sampleData(),
      sourceLabel: 'live Helixa API',
      resolver: { canonicalId: '8453:1', tokenId: '1' },
      liveProfilePage: { headline: 'Bendr Multipass', headerMeta: 'Live profile · 8453:1', sharePath: '/multipass/?agent=1' },
    }),
    saveMultipass: async () => { throw new Error('Save API unavailable.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();
  [...root.querySelectorAll('button')].find((node) => node.textContent === 'Save Multipass').click();
  await Promise.resolve();
  await Promise.resolve();
  assert.match(root.textContent, /Save API unavailable/);
  assert.doesNotMatch(root.textContent, /Saved Multipass/);
  assert.equal(window.location.href, 'https://helixa.xyz/multipass/?agent=1');
});

test('static preview does not show Save Multipass action', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();
  assert.doesNotMatch(root.textContent, /Save Multipass/);
});
```

Also add focused assertions for `isSafeMultipassSharePath` in the same app test file or a small `save-panel.test.mjs`:

- accepts `/multipass/`
- accepts `/multipass/?agent=1`
- accepts `/multipass/bendr-2-1`
- rejects `https://evil.test/multipass/bendr-2-1`
- rejects `/multipass/a%2Fb`
- rejects `/multipass/../admin`
- rejects `/multipass/?agent=Quigbot`

- [ ] **Step 2: Run app tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/app.test.mjs
```

Expected: FAIL because save UI does not exist.

- [ ] **Step 3: Implement save state and rendering**

Create `apps/web/src/save-panel.js` for focused helpers:

- `isSafeMultipassSharePath(sharePath)` accepts `/multipass/`, `/multipass/?agent=<id>`, and `/multipass/<safe-slug>`.
  - Safe slug regex: `^[a-z0-9][a-z0-9-]{1,80}$`.
  - Reject off-origin URLs, encoded slashes, `..`, extra path segments, javascript/data URLs, and non-numeric `agent` query values.
- `getAbsoluteShareUrl(sharePath)` returns a Helixa absolute URL.
- `renderSavePanel(state)` returns markup:

```js
export function renderSavePanel(state) {
  if (state.resolverStatus !== 'loaded') return '';
  const disabled = state.saveStatus === 'saving' ? 'disabled' : '';
  const label = state.saveStatus === 'saving' ? 'Saving...' : 'Save Multipass';
  const success = state.saveStatus === 'saved'
    ? '<p class="save-message">Saved Multipass. Stable public profile is ready to share. Saved, unclaimed display-only Multipass.</p>'
    : '';
  const error = state.saveStatus === 'error'
    ? `<p class="save-message error">${escapeHtml(state.saveError ?? 'Could not save Multipass. Try again.')}</p>`
    : '';
  return `<section class="save-panel" aria-label="Save Multipass"><button type="button" data-action="save-multipass" ${disabled}>${label}</button><p>Claim management comes next.</p>${success}${error}</section>`;
}
```

The actual implementation can import or localize `escapeHtml`, but it must escape error text.

In `apps/web/src/api.js`:

- Add `getSavedSlugFromLocation(locationUrl)` that returns a safe slug when pathname is `/multipass/<slug>`, otherwise `null`.
- Add `loadSavedMultipassDemo({ apiBase, slug, fetchImpl })` that fetches profile, fragments, card via `/card`, standards, x402, and changes. It should return the current app data shape with `sourceLabel: 'saved Multipass API'`, `modeLabel: 'Saved Multipass'`, `liveProfilePage.sharePath: /multipass/<slug>`, and a no-receipt placeholder when receipts are not present.
- Update `shouldUseStaticDemo(locationUrl)` so `/multipass/<slug>` does not force static preview when a safe slug is present.

In `apps/web/src/app.js`:

- Accept optional `fetchImpl = fetch` in `createApp` and pass it to saved-route loading.
- Import `saveActivatedMultipass`.
- Import save panel helpers from `./save-panel.js`.
- Extend `createApp` signature:

```js
export function createApp({ root, loadDemo = defaultLoadDemo, loadLiveDemo = loadLiveHelixaMultipass, saveMultipass = defaultSaveMultipass } = {})
```

- Add state fields:

```js
saveStatus: null,
saveError: null,
savedSharePath: null,
savedProfile: null,
```

- Define `defaultSaveMultipass({ agent })` that calls `saveActivatedMultipass({ agent, apiBase: getApiBaseFromLocation(new URL(window.location.href)) })` so `?api=` override and relative API bases keep working.
- In `defaultLoadDemo`, if `getSavedSlugFromLocation(locationUrl)` returns a slug, call `loadSavedMultipassDemo({ apiBase, slug, fetchImpl })` instead of static demo.
- Replace or delegate existing share path safety helpers so saved slug paths `/multipass/:slug` are accepted.
- Reset save fields on new live resolve and static reset.
- Add `saveCurrentMultipass()` handler:

```js
async function saveCurrentMultipass() {
  if (state.resolverStatus !== 'loaded') return;
  const agent = state.data?.resolver?.tokenId;
  if (!agent) {
    state = { ...state, saveStatus: 'error', saveError: 'Resolved token ID is required before saving.' };
    render(root, state, handlers);
    return;
  }
  state = { ...state, saveStatus: 'saving', saveError: null };
  render(root, state, handlers);
  try {
    const saved = await saveMultipass({ agent });
    state = {
      ...state,
      saveStatus: 'saved',
      saveError: null,
      savedSharePath: saved.sharePath,
      savedProfile: saved.profile,
      data: {
        ...state.data,
        liveProfilePage: {
          ...state.data.liveProfilePage,
          sharePath: saved.sharePath,
          headerMeta: `Saved Multipass · ${saved.profile?.slug ?? 'persistent profile'}`,
        },
      },
    };
    syncShareUrl(saved.sharePath);
    render(root, state, handlers);
  } catch (error) {
    state = { ...state, saveStatus: 'error', saveError: error.message };
    render(root, state, handlers);
  }
}
```

- Add handler to `handlers`.
- Add `renderSavePanel(state)` after activation summary or inside share panel area.
- Show Save button only when `resolverStatus === 'loaded'`.
- Wire `[data-action="save-multipass"]` click events to `handlers.saveCurrentMultipass` after render.
- Copy:
  - Button: `Save Multipass`
  - Saving: `Saving...`
  - Success: `Saved Multipass. Stable public profile is ready to share.`
  - Existing record: same success copy is fine.
  - Error: `Could not save Multipass. Try again.` plus API message.
- Do not show claim/edit controls in A1. Optional text: `Claim management comes next.`

- [ ] **Step 4: Add minimal styles**

In `apps/web/src/styles.css`, add `.save-panel`, `.save-message`, and `.save-message.error` using existing `resolver-message` visual language. Keep it compact.

- [ ] **Step 5: Run app tests to verify GREEN**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit web save UI**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web/src/api.js apps/web/src/app.js apps/web/src/save-panel.js apps/web/src/styles.css apps/web/test/app.test.mjs
git commit -m "Add saved Multipass web flow"
```

---

## Chunk 4: Docs, verification, deploy prep

### Task 7: Update docs for A1 saved records

**Files:**
- Modify: `docs/v0-scope.md`
- Modify: `apps/api/README.md`

- [ ] **Step 1: Write docs update**

Update docs to explain:

- `POST /api/multipass/activate` is preview-only.
- `POST /api/multipass` is the only public save path.
- `MULTIPASS_DB_PATH` enables persistent saved records.
- A1 records are public/display-only and unclaimed.
- Claim/manage/edit is A2/A3, not A1.

- [ ] **Step 2: Run docs copy scan**

Run:

```bash
cd /home/ubuntu/multipass
python3 - <<'PY'
from pathlib import Path
blocked_terms = [
    'Multi' + ' Pass',
    'pass' + 'port',
    'transfer' + ' ownership',
    'move' + ' tools',
    'move' + ' secrets',
    'grant' + ' permissions',
    'created' + ' ERC-8004',
]
for p in [Path('docs/v0-scope.md'), Path('apps/api/README.md')]:
    text = p.read_text()
    for bad in blocked_terms:
        if bad.lower() in text.lower():
            raise SystemExit(f'{p}: blocked copy hit')
print('docs copy scan ok')
PY
```

Expected: `docs copy scan ok`.

- [ ] **Step 3: Commit docs**

Run:

```bash
cd /home/ubuntu/multipass
git add docs/v0-scope.md apps/api/README.md
git commit -m "Document saved Multipass records"
```

### Task 8: Full verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run full tests**

Run:

```bash
cd /home/ubuntu/multipass
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run web build**

Run:

```bash
cd /home/ubuntu/multipass
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Run diff check**

Run:

```bash
cd /home/ubuntu/multipass
BASE_SHA="$(git merge-base HEAD origin/main || git rev-list --max-parents=0 HEAD)"
git diff --check "$BASE_SHA"..HEAD
```

Expected: no output, exit 0.

- [ ] **Step 4: Run A1 smoke script**

Run a local API smoke with temp SQLite DB. The smoke must save once, stop the API, restart with the same DB, then prove the saved profile, card, fragments, and change log still read back.

Use this inline shell script with these exact assertions:

1. Start API with `MULTIPASS_DB_PATH=$DB`.
2. POST `{ "agent": "1" }` to `/api/multipass`.
3. Assert first save returns `created === true`, non-empty `multipass_id`, non-empty `slug`, and `sharePath === /multipass/<slug>`.
4. POST the same body again and assert `created === false` and the same slug.
5. Stop the API.
6. Restart API with the same DB path.
7. GET `/api/multipass/<slug>` and assert matching `multipass_id` and `slug`.
8. GET `/api/multipass/<slug>/card` and assert matching `multipass_id`.
9. GET `/api/multipass/<slug>/fragments` and assert matching `multipass_id` and public-only fragments.
10. GET `/api/multipass/<slug>/changes` and assert at least one entry.
11. Print `persistent smoke ok <multipass_id> <slug>` only after every assertion passes.

Expected:

- API starts twice with the same `MULTIPASS_DB_PATH`.
- First save returns `created true`.
- Duplicate save returns `created false`.
- After restart, saved profile, card, fragments, and change log all read back and assertions pass.
- Output includes `persistent smoke ok`.

- [ ] **Step 5: Record result in memory**

Append a short line to `/home/ubuntu/.openclaw/workspace/memory/2026-06-26.md` with commits and verification results.

- [ ] **Step 6: Stop for deployment decision**

A1 introduces a persistent API server requirement. Do not deploy to live static web root as if persistence works until the API runtime path is selected:

- Option 1: run Multipass API as its own service and point web to it.
- Option 2: add Multipass routes to existing `api.helixa.xyz` service.
- Option 3: keep A1 local/staging until A2 auth is ready.

Report status and recommend Option 1 unless infra constraints say otherwise.

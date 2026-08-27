# Multipass Marketplace Editor Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let claimed Multipass managers add, edit, retire, and URL-prefill display-only Marketplace Connections stored as public identity fragments.

**Architecture:** Store each Marketplace Connection as an owner-submitted public `attestation` fragment with a structured `marketplace_ref`. The backend owns normalization, status derivation, source date handling, and read-model derivation; the frontend owns draft parsing, manager forms, localized mutation state, and public card rendering from fragment-derived data before legacy explicit data.

**Tech Stack:** Node 22, pnpm workspaces, node:test, jsdom, string-rendered Multipass web app, SQLite saved records, JSON Schema, `@helixa/multipass-sdk` validation, Vite static build.

---

## Chunk 1: Backend schema, fragment normalization, and saved read model

### Required skills

- Use @test-driven-development for every implementation task.
- Use @systematic-debugging before fixing any unexpected failure.
- Use @verification-before-completion before claiming done.
- If using subagents, use @subagent-driven-development for execution.

### File structure

- Modify: `docs/schemas/identity-fragment.schema.json`
  - Add optional public `marketplace_ref` object shape.
  - Keep `additionalProperties: false` and bounded fields.
- Modify: `packages/types/schemas/identity-fragment.schema.json`
  - Keep packaged schema byte-for-byte in sync with docs schema.
- Modify: `packages/types/test/schema-contract.test.mjs`
  - Assert schema exposes `marketplace_ref` and docs/package sync remains valid.
- Modify: `packages/sdk/test/sdk-validation.test.mjs`
  - Assert `assertIdentityFragment()` accepts valid marketplace refs and rejects invalid shapes.
- Modify: `apps/api/src/fragment-manager.js`
  - Normalize and validate `marketplace_ref` on manager create/update.
  - Derive top-level lifecycle status from `marketplace_ref.status`.
  - Enforce `attestation`, public visibility, `self_attested`, and `historical_on_transfer` for Marketplace Connections.
  - Block generic top-level-only edits to existing Marketplace Connection fragments for all top-level-only fields: `status`, `reference_url`, `transfer_policy`, `public_value`, `proof_reference`, and `endpoint_ref` unless a complete replacement `marketplace_ref` is included.
  - Clear `marketplace_ref.source_checked_at` on update when the complete replacement sends blank source date.
- Create: `apps/api/src/marketplace-presence.js`
  - Derive public `marketplacePresence` entries from public fragments.
  - Own saved API URL normalization and de-dupe rules so `index.js` and hydrated responses cannot diverge.
- Modify: `apps/api/src/saved-records.js`
  - Preserve existing saved-record methods.
  - Add Marketplace Connection change-log messages.
  - Use shared derivation helper when saved record bundles need marketplace presence.
- Modify: `apps/api/src/canonical-profile.js`
  - Include derived `marketplacePresence` in hydrated saved responses.
- Modify: `apps/api/src/index.js`
  - Return derived `marketplacePresence` on saved reads and hydrated reads using shared derivation.
- Modify: `apps/api/test/api-routes.test.mjs`
  - Add API create/update/revoke/read/validation tests.

### Data contract notes

- Backing fragment create payload from the web manager:

```json
{
  "fragment_type": "attestation",
  "public_value": "Marketplace connection: Helixa agent profile on Bankr. Public marketplace listing for Helixa services.",
  "reference_url": "https://bankr.bot/agents/helixa",
  "transfer_policy": "historical_on_transfer",
  "marketplace_ref": {
    "marketplace": "Bankr",
    "profile_url": "https://bankr.bot/agents/helixa",
    "title": "Helixa agent profile",
    "summary": "Public marketplace listing for Helixa services.",
    "listing_id": "helixa",
    "status": "manager_supplied"
  }
}
```

- Backing fragment update payload replaces the full previous `marketplace_ref`; it is not a deep merge.
- The web manager must not send top-level `status` for Marketplace Connection create/update.
- Backend status derivation table:

```js
const MARKETPLACE_DISPLAY_STATUS_TO_FRAGMENT_STATUS = {
  manager_supplied: 'pending',
  public_import: 'pending',
  pending: 'pending',
  stale: 'stale',
  disputed: 'disputed',
};
```

- Blank `source_checked_at` behavior:
  - On create: omit `marketplace_ref.source_checked_at`.
  - On update: because the payload replaces the full `marketplace_ref`, a blank date must result in no `source_checked_at` on the saved `marketplace_ref`. Do not carry the old date forward.

### Task 1: Schema and SDK recognition

**Files:**
- Modify: `docs/schemas/identity-fragment.schema.json`
- Modify: `packages/types/schemas/identity-fragment.schema.json`
- Modify: `packages/types/test/schema-contract.test.mjs`
- Modify: `packages/sdk/test/sdk-validation.test.mjs`

- [ ] **Step 1: Write failing schema tests**

Add to `packages/types/test/schema-contract.test.mjs`:

```js
test('identity fragments expose bounded marketplace connection references', () => {
  const ref = identityFragmentSchema.properties.marketplace_ref;
  assert.ok(ref);
  assert.deepEqual(ref.type, ['object', 'null']);
  assert.equal(ref.additionalProperties, false);
  assert.deepEqual(ref.properties.status.enum, ['manager_supplied', 'public_import', 'pending', 'stale', 'disputed']);
  assert.equal(ref.properties.services.maxItems, 8);
  assert.equal(ref.properties.payment_rails.maxItems, 8);
  assert.equal(ref.properties.facts.maxItems, 8);
});
```

Add to `packages/sdk/test/sdk-validation.test.mjs` near identity-fragment tests:

```js
const marketplaceFragment = {
  ...identityFragment,
  fragment_id: 'frag_marketplace_bankr',
  fragment_type: 'attestation',
  status: 'pending',
  assurance_level: 'self_attested',
  transfer_policy: 'historical_on_transfer',
  source: {
    source_type: 'owner_submission',
    source_id: 'manager:frag_marketplace_bankr',
    issuer: null,
    observed_at: '2026-07-06T00:00:00Z',
    reference_url: 'https://bankr.bot/agents/helixa',
  },
  public_value: 'Marketplace connection: Helixa agent profile on Bankr. Public marketplace listing for Helixa services.',
  marketplace_ref: {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    title: 'Helixa agent profile',
    summary: 'Public marketplace listing for Helixa services.',
    listing_id: 'helixa',
    status: 'manager_supplied',
    source_checked_at: '2026-07-06T00:00:00.000Z',
    services: [{ name: 'Deep CRED report', price: '$1 USDC', payment_mode: 'x402', endpoint_url: 'https://api.example.test/service' }],
    payment_rails: [{ asset: 'USDC', mode: 'x402', chain: 'Base' }],
    reputation: { score: '95', positive_rate: '99%', sold_count: '12', review_count: '8' },
    facts: [{ label: 'Source', value: 'Manager supplied public listing' }],
  },
};

test('identity fragment validation accepts marketplace connection refs', () => {
  assert.equal(validateIdentityFragment(marketplaceFragment).ok, true);
  assert.doesNotThrow(() => assertIdentityFragment(marketplaceFragment));
});

test('identity fragment validation rejects malformed marketplace connection refs', () => {
  const invalid = {
    ...marketplaceFragment,
    marketplace_ref: { ...marketplaceFragment.marketplace_ref, services: Array.from({ length: 9 }, (_, index) => ({ name: `Service ${index}` })) },
  };
  assert.equal(validateIdentityFragment(invalid).ok, false);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm test:types
node --test packages/sdk/test/sdk-validation.test.mjs --test-name-pattern marketplace
```

Expected: FAIL because `marketplace_ref` is not in the schema.

- [ ] **Step 3: Add schema shape**

Add this property to both `docs/schemas/identity-fragment.schema.json` and `packages/types/schemas/identity-fragment.schema.json`:

```json
"marketplace_ref": {
  "type": ["object", "null"],
  "description": "Display-only public marketplace connection metadata for manager-supplied attestation fragments.",
  "additionalProperties": false,
  "required": ["marketplace", "profile_url", "title", "summary", "status"],
  "properties": {
    "marketplace": { "type": "string", "minLength": 1, "maxLength": 80 },
    "profile_url": { "type": "string", "format": "uri", "maxLength": 500 },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "summary": { "type": "string", "minLength": 1, "maxLength": 500 },
    "listing_id": { "type": "string", "maxLength": 120 },
    "status": { "type": "string", "enum": ["manager_supplied", "public_import", "pending", "stale", "disputed"] },
    "source_checked_at": { "type": "string", "format": "date-time" },
    "services": {
      "type": "array",
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string", "maxLength": 120 },
          "price": { "type": "string", "maxLength": 80 },
          "payment_mode": { "type": "string", "maxLength": 80 },
          "endpoint_url": { "type": "string", "format": "uri", "maxLength": 500 }
        }
      }
    },
    "payment_rails": {
      "type": "array",
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "asset": { "type": "string", "maxLength": 80 },
          "mode": { "type": "string", "maxLength": 80 },
          "chain": { "type": "string", "maxLength": 80 }
        }
      }
    },
    "reputation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "score": { "type": "string", "maxLength": 80 },
        "positive_rate": { "type": "string", "maxLength": 80 },
        "sold_count": { "type": "string", "maxLength": 80 },
        "review_count": { "type": "string", "maxLength": 80 }
      }
    },
    "facts": {
      "type": "array",
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "label": { "type": "string", "maxLength": 80 },
          "value": { "type": "string", "maxLength": 160 }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm test:types
node --test packages/sdk/test/sdk-validation.test.mjs --test-name-pattern marketplace
```

Expected: PASS.

- [ ] **Step 5: Commit schema work**

```bash
git add docs/schemas/identity-fragment.schema.json packages/types/schemas/identity-fragment.schema.json packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs
git commit -m "feat: add marketplace ref schema"
```

### Task 2: Backend marketplace fragment normalization and API reads

**Files:**
- Modify: `apps/api/src/fragment-manager.js`
- Create: `apps/api/src/marketplace-presence.js`
- Modify: `apps/api/src/saved-records.js`
- Modify: `apps/api/src/canonical-profile.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Write failing API tests**

Add tests near existing fragment write-route tests in `apps/api/test/api-routes.test.mjs`:

```js
function marketplaceRef(overrides = {}) {
  return {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    title: 'Helixa agent profile',
    summary: 'Public marketplace listing for Helixa services.',
    listing_id: 'helixa',
    status: 'manager_supplied',
    services: [{ name: 'Deep CRED report', price: '$1 USDC', payment_mode: 'x402', endpoint_url: 'https://api.example.test/service' }],
    payment_rails: [{ asset: 'USDC', mode: 'x402', chain: 'Base' }],
    facts: [{ label: 'Source', value: 'Manager supplied public listing' }],
    ...overrides,
  };
}

function marketplacePayload(ref = marketplaceRef()) {
  return {
    fragment_type: 'attestation',
    public_value: `Marketplace connection: ${ref.title} on ${ref.marketplace}. ${ref.summary}`,
    reference_url: ref.profile_url,
    transfer_policy: 'historical_on_transfer',
    marketplace_ref: ref,
  };
}

test('manager session creates updates and retires Marketplace Connection fragments', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);

  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({ source_checked_at: '2026-07-06' })), headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.fragment_type, 'attestation');
  assert.equal(created.body.fragment.status, 'pending');
  assert.equal(created.body.fragment.assurance_level, 'self_attested');
  assert.equal(created.body.fragment.visibility, 'public');
  assert.equal(created.body.fragment.transfer_policy, 'historical_on_transfer');
  assert.equal(created.body.fragment.source.issuer, null);
  assert.equal(created.body.fragment.source.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(created.body.fragment.marketplace_ref.source_checked_at, '2026-07-06T00:00:00.000Z');

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(publicRead.body.multipass_id, 'mp_helixa_agent_1');
  assert.equal(publicRead.body.profile, undefined);
  assert.deepEqual(publicRead.body.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);

  const hydrated = await requestJson(api, '/api/multipass/bendr-2-1/hydrated');
  assert.deepEqual(hydrated.body.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);
  assert.deepEqual(hydrated.body.profile.marketplacePresence.map((entry) => [entry.marketplace, entry.profileUrl]), [['Bankr', 'https://bankr.bot/agents/helixa']]);

  const updatedRef = marketplaceRef({ title: 'Updated title', summary: 'Updated summary.', status: 'stale', source_checked_at: '' });
  const updated = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}`, marketplacePayload(updatedRef), headers);
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.fragment.status, 'stale');
  assert.equal(updated.body.fragment.marketplace_ref.title, 'Updated title');
  assert.equal(Object.hasOwn(updated.body.fragment.marketplace_ref, 'source_checked_at'), false);

  const revoked = await postJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}/revoke`, {}, headers);
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.fragment.status, 'revoked');

  const afterRevoke = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(afterRevoke.body.marketplacePresence.some((entry) => entry.fragmentId === created.body.fragment.fragment_id), false);

  const changes = await requestJson(api, '/api/multipass/bendr-2-1/changes');
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection added: Bankr\./);
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection updated: Bankr\./);
  assert.match(changes.body.entries.map((entry) => entry.message).join('\n'), /Marketplace connection retired: Bankr\./);
});

test('Marketplace Connection fragment writes reject unsafe and generic top-level-only edits', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(), headers);
  const fragmentId = created.body.fragment.fragment_id;

  const cases = [
    ['non-https', marketplacePayload(marketplaceRef({ profile_url: 'http://bankr.bot/agents/helixa' }))],
    ['credentials', marketplacePayload(marketplaceRef({ profile_url: 'https://user:pass@bankr.bot/agents/helixa' }))],
    ['mismatched reference url', { ...marketplacePayload(), reference_url: 'https://bankr.bot/agents/not-helixa' }],
    ['service non-https endpoint', marketplacePayload(marketplaceRef({ services: [{ name: 'Bad service', endpoint_url: 'http://api.example.test/service' }] }))],
    ['service credentialed endpoint', marketplacePayload(marketplaceRef({ services: [{ name: 'Bad service', endpoint_url: 'https://user:pass@api.example.test/service' }] }))],
    ['unsafe text', marketplacePayload(marketplaceRef({ summary: '<img onerror=alert(1)>' }))],
    ['wrong type', { ...marketplacePayload(), fragment_type: 'wallet' }],
    ['verified display status', marketplacePayload(marketplaceRef({ status: 'verified' }))],
    ['platform verified display status', marketplacePayload(marketplaceRef({ status: 'platform_verified' }))],
    ['future source checked', marketplacePayload(marketplaceRef({ source_checked_at: '2999-01-01T00:00:00.000Z' }))],
    ['invalid source checked', marketplacePayload(marketplaceRef({ source_checked_at: 'not a date' }))],
  ];

  for (const [, payload] of cases) {
    const result = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', payload, headers);
    assert.equal(result.response.status, 400);
  }

  const patchMismatch = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${fragmentId}`, {
    ...marketplacePayload(),
    reference_url: 'https://bankr.bot/agents/not-helixa',
  }, headers);
  assert.equal(patchMismatch.response.status, 400);

  for (const patch of [
    { status: 'stale' },
    { reference_url: 'https://bankr.bot/agents/other' },
    { transfer_policy: 'never_transfer' },
    { public_value: 'Generic edit' },
    { proof_reference: 'Generic proof' },
    { endpoint_ref: { endpoint_id: 'bad', url: 'https://example.test', protocol: 'web' } },
  ]) {
    const result = await patchJsonWithHeaders(api, `/api/multipass/bendr-2-1/fragments/${fragmentId}`, patch, headers);
    assert.equal(result.response.status, 403);
  }
});
```

Add one bounded-array assertion:

```js
test('Marketplace Connection normalization bounds optional row arrays', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({
    services: Array.from({ length: 12 }, (_, index) => ({ name: `Service ${index}` })),
    payment_rails: Array.from({ length: 12 }, (_, index) => ({ asset: `Asset ${index}` })),
    facts: Array.from({ length: 12 }, (_, index) => ({ label: `Fact ${index}`, value: 'Public value' })),
  })), headers);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.fragment.marketplace_ref.services.length, 8);
  assert.equal(created.body.fragment.marketplace_ref.payment_rails.length, 8);
  assert.equal(created.body.fragment.marketplace_ref.facts.length, 8);
});

test('saved API de-dupes Marketplace Connections by normalized profile URL', async () => {
  const api = makeClaimApi();
  const { headers } = await createOwnerSession(api);
  const first = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(marketplaceRef({ title: 'First Bankr listing' })), headers);
  assert.equal(first.response.status, 201);
  const duplicate = marketplaceRef({
    profile_url: 'https://bankr.bot/agents/helixa/',
    title: 'Duplicate Bankr listing',
  });
  const second = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', marketplacePayload(duplicate), headers);
  assert.equal(second.response.status, 201);

  const publicRead = await requestJson(api, '/api/multipass/bendr-2-1');
  assert.equal(publicRead.body.marketplacePresence.length, 1);
  assert.equal(publicRead.body.marketplacePresence[0].title, 'First Bankr listing');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "Marketplace Connection"
```

Expected: FAIL because `marketplace_ref` is rejected and public `marketplacePresence` is not derived.

- [ ] **Step 3: Implement marketplace normalization**

In `apps/api/src/fragment-manager.js`:

- Add `marketplace_ref` to allowed create and update fields.
- Export helper functions if needed by read-model derivation:
  - `normalizeMarketplaceRef(input, { now, forUpdate })`
  - `deriveMarketplaceFragmentStatus(displayStatus)`
  - `isMarketplaceConnectionFragment(fragment)`
- Add credential rejection to URL parsing:

```js
function parseHttpsUrl(raw, field) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${field} must use https.`);
  if (parsed.username || parsed.password) throw new TypeError(`${field} must not include credentials.`);
  parsed.hash = '';
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}
```

- Normalize `source_checked_at` with request clock:

```js
function normalizeMarketplaceSourceCheckedAt(value, { now, omitBlank = true } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') return omitBlank ? null : null;
  const raw = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new TypeError('source_checked_at must be a valid date.');
  const requestClock = new Date(now ?? Date.now()).getTime();
  if (date.getTime() > requestClock + 5 * 60 * 1000) throw new TypeError('source_checked_at cannot be in the future.');
  return date.toISOString();
}
```

- Normalize every public URL with the same credential-free HTTPS parser:
  - `marketplace_ref.profile_url`
  - top-level `reference_url`
  - every non-empty `marketplace_ref.services[].endpoint_url`
- Build marketplace fragments by validating equality first, then deriving fields:

```js
if (marketplaceRef) {
  if (fragmentType !== 'attestation') throw new TypeError('marketplace_ref is only allowed for attestation fragments.');
  const referenceUrl = normalizeRequiredHttpsUrl(input.reference_url, 'reference_url');
  if (referenceUrl !== marketplaceRef.profile_url) {
    throw new TypeError('reference_url must match marketplace_ref.profile_url.');
  }
  fragment.status = deriveMarketplaceFragmentStatus(marketplaceRef.status);
  fragment.transfer_policy = 'historical_on_transfer';
  fragment.assurance_level = 'self_attested';
  fragment.source.reference_url = marketplaceRef.profile_url;
  fragment.marketplace_ref = marketplaceRef;
}
```

- In `normalizeManagerFragmentPatch()`, if `existing.marketplace_ref` exists and `patch.marketplace_ref` is absent, reject any top-level-only patch with message `Marketplace Connection fragments must be edited through Marketplace Connections.` This must cover every generic field: `status`, `reference_url`, `transfer_policy`, `public_value`, `proof_reference`, and `endpoint_ref`.
- If `patch.marketplace_ref` exists, require it to be complete, normalize it, normalize top-level `reference_url`, require exact equality with `marketplace_ref.profile_url`, derive top-level status, force transfer policy, force source reference URL, and replace the full prior `marketplace_ref`. Blank `source_checked_at` is omitted from the replacement object.

- [ ] **Step 4: Implement derived read model**

Create `apps/api/src/marketplace-presence.js` so API read-model logic stays out of already-large route/store files:

```js
export function deriveMarketplacePresenceFromFragments(fragments = []) {
  const entries = [];
  const seen = new Set();
  for (const fragment of fragments) {
    const ref = fragment?.marketplace_ref;
    if (!ref || fragment.visibility !== 'public' || fragment.status === 'revoked') continue;
    if (!hasText(ref.marketplace) || !hasText(ref.profile_url) || !hasText(ref.title) || !hasText(ref.summary)) continue;
    const profileUrl = normalizeMarketplacePresenceUrl(ref.profile_url);
    if (!profileUrl) continue;
    const key = marketplacePresenceKey({ profileUrl, marketplace: ref.marketplace, listingId: ref.listing_id, fragmentId: fragment.fragment_id });
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      fragmentId: fragment.fragment_id,
      marketplace: String(ref.marketplace).trim(),
      listingId: String(ref.listing_id ?? '').trim(),
      profileUrl,
      title: String(ref.title).trim(),
      summary: String(ref.summary).trim(),
      status: String(ref.status ?? fragment.status ?? '').trim(),
      services: normalizeMarketplaceServices(ref.services),
      paymentRails: Array.isArray(ref.payment_rails) ? ref.payment_rails : [],
      reputation: isPlainObject(ref.reputation) ? ref.reputation : {},
      facts: Array.isArray(ref.facts) ? ref.facts : [],
      source: {
        label: marketplaceSourceLabel(ref.status),
        url: profileUrl || normalizeMarketplacePresenceUrl(fragment.source?.reference_url) || '',
        checkedAt: String(ref.source_checked_at ?? fragment.source?.observed_at ?? '').trim(),
        provenance: marketplaceSourceProvenance(ref.status),
      },
      proof: {
        assurance: String(fragment.assurance_level ?? '').trim(),
        fragmentId: fragment.fragment_id,
        sourceType: String(fragment.source?.source_type ?? '').trim(),
      },
    });
  }
  return entries;
}

export function normalizeMarketplacePresenceUrl(value) {
  if (!hasText(value)) return '';
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
}

export function marketplacePresenceKey({ profileUrl, marketplace, listingId, fragmentId }) {
  const normalizedUrl = normalizeMarketplacePresenceUrl(profileUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  const market = String(marketplace ?? '').trim().toLowerCase();
  const listing = String(listingId ?? '').trim().toLowerCase();
  if (market && listing) return `listing:${market}:${listing}`;
  return `fragment:${String(fragmentId ?? '').trim()}`;
}
```

Also implement the small local helpers used above: `hasText`, `isPlainObject`, `normalizeMarketplaceServices`, `marketplaceSourceLabel`, and `marketplaceSourceProvenance`. `normalizeMarketplaceServices()` must map `endpoint_url` to `endpointUrl` only when the endpoint URL is normalized HTTPS and credential-free; invalid service endpoint URLs should have already been rejected on writes, but malformed historical data must not leak unsafe links.

Use this helper when returning saved profiles without changing existing response shape:

```js
function decorateProfileWithMarketplacePresence(profile, sourceStore) {
  const fragments = sourceStore.getPublicFragments?.(profile.multipass_id) ?? [];
  const derived = deriveMarketplacePresenceFromFragments(fragments);
  const fallback = Array.isArray(profile?.marketplacePresence) ? profile.marketplacePresence : [];
  const marketplacePresence = derived.length ? derived : fallback;
  return marketplacePresence.length ? { ...profile, marketplacePresence } : profile;
}
```

For bare `GET /api/multipass/:id`, keep returning the profile object directly; add `marketplacePresence` as a top-level profile property on that same object, not inside a new `{ profile }` wrapper. For `GET /api/multipass/:id/hydrated`, return top-level `marketplacePresence` on the hydrated envelope and mirror the same derived list under `profile.marketplacePresence`. If old fixture/static profile-level marketplace data exists, leave it alone only when no fragment-derived entries exist; fragment-derived entries must win.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern "Marketplace Connection"
pnpm test:types
node --test packages/sdk/test/sdk-validation.test.mjs --test-name-pattern marketplace
```

Expected: PASS.

- [ ] **Step 6: Commit backend work**

```bash
git add apps/api/src/fragment-manager.js apps/api/src/marketplace-presence.js apps/api/src/saved-records.js apps/api/src/canonical-profile.js apps/api/src/index.js apps/api/test/api-routes.test.mjs
git commit -m "feat: store marketplace connections as fragments"
```

## Chunk 2: Frontend manager, public renderer, and verification

### File structure

- Create: `apps/web/src/marketplace-connection-manager.js`
  - Pure URL draft parser.
  - Pure form compaction helpers.
  - Manager panel render/bind functions.
- Modify: `apps/web/src/fragment-manager.js`
  - Hide Marketplace Connection fragments from generic edit forms or show read-only handoff copy.
- Create: `apps/web/src/marketplace-presence.js`
  - Derive, normalize, and de-dupe public Marketplace Connections entries from fragments plus legacy explicit data.
  - Keep this logic out of `app.js`, which is already large.
- Create: `apps/web/test/marketplace-presence.test.mjs`
  - Focused public renderer data-helper coverage for derived-first ordering, malformed skips, and de-dupe.
- Modify: `apps/web/src/app.js`
  - Import and mount Marketplace Connections manager panel after routes and before generic fragments.
  - Add create/update/retire handlers and localized marketplace mutation state.
  - Import `getMarketplacePresenceEntries` from the focused helper module and keep string rendering in `app.js`.
- Modify: `apps/web/src/saved-multipass-api.js`
  - No new endpoints expected. Only adjust if tests show helper signatures need shared fetch/error behavior.
- Modify: `apps/web/test/fragment-manager.test.mjs`
  - Assert generic manager delegates Marketplace Connection fragments.
- Create: `apps/web/test/marketplace-connection-manager.test.mjs`
  - Unit coverage for URL importer, form compaction, rendering, and bind handlers.
- Modify: `apps/web/test/app.test.mjs`
  - Integration coverage for manager create/update/retire and public card rendering from helper-normalized data.
- Modify: `apps/web/test/wording.test.mjs`
  - Include new manager module and guard against forbidden trust, execution, custody, payment, credential, wallet, and partnership claims.

### Task 3: Frontend URL importer and manager module

**Files:**
- Create: `apps/web/src/marketplace-connection-manager.js`
- Create: `apps/web/test/marketplace-connection-manager.test.mjs`

- [ ] **Step 1: Write failing unit tests**

Create `apps/web/test/marketplace-connection-manager.test.mjs` with tests for:

```js
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  bindMarketplaceConnectionManager,
  compactMarketplaceConnectionInput,
  compactMarketplaceConnectionPatch,
  createMarketplaceDraftFromUrl,
  renderMarketplaceConnectionManagerPanel,
} from '../src/marketplace-connection-manager.js';

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main id="app">${html}</main>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document.querySelector('#app');
}

test('createMarketplaceDraftFromUrl parses required examples and host fallbacks without network calls', () => {
  assert.deepEqual(createMarketplaceDraftFromUrl('https://bankr.bot/agents/helixa').draft, {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    listing_id: 'helixa',
    title: 'helixa',
    summary: '',
    status: 'public_import',
  });
  assert.deepEqual(createMarketplaceDraftFromUrl('https://www.okx.ai/agent/WorldCupCaller/?ref=mp#top').draft, {
    marketplace: 'OKX.AI',
    profile_url: 'https://www.okx.ai/agent/WorldCupCaller?ref=mp',
    listing_id: 'WorldCupCaller',
    title: 'WorldCupCaller',
    summary: '',
    status: 'public_import',
  });
  assert.deepEqual(createMarketplaceDraftFromUrl('https://agentgram.xyz/').draft, {
    marketplace: 'AgentGram',
    profile_url: 'https://agentgram.xyz/',
    listing_id: '',
    title: 'AgentGram',
    summary: '',
    status: 'public_import',
  });
  assert.equal(createMarketplaceDraftFromUrl('https://market.example.test/listings/alpha-1/').draft.marketplace, 'Market Example Test');
  assert.equal(createMarketplaceDraftFromUrl('https://market.example.test/listings/%E0%A4%A').draft.listing_id, '');
});

test('createMarketplaceDraftFromUrl rejects invalid unsafe and credentialed URLs', () => {
  assert.equal(createMarketplaceDraftFromUrl('not a url').error, 'Marketplace URL must be a valid URL.');
  assert.equal(createMarketplaceDraftFromUrl('http://bankr.bot/agents/helixa').error, 'Marketplace URL must use https.');
  assert.equal(createMarketplaceDraftFromUrl('https://user:pass@bankr.bot/agents/helixa').error, 'Marketplace URL must not include credentials.');
});

test('URL paste prefill populates fields locally without fetch', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network must not be called'); };
  try {
    const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [] } } }));
    bindMarketplaceConnectionManager(root, {});
    root.querySelector('input[name="marketplace_url_import"]').value = 'https://bankr.bot/agents/helixa';
    root.querySelector('[data-action="prefill-marketplace-url"]').click();
    assert.equal(root.querySelector('input[name="marketplace"]').value, 'Bankr');
    assert.equal(root.querySelector('input[name="profile_url"]').value, 'https://bankr.bot/agents/helixa');
    assert.equal(root.querySelector('input[name="listing_id"]').value, 'helixa');
    assert.equal(root.querySelector('input[name="title"]').value, 'helixa');
    assert.equal(root.querySelector('select[name="status"]').value, 'public_import');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('compactMarketplaceConnectionInput builds complete create payload without top-level status', () => {
  const form = setup(`
    <form>
      <input name="marketplace" value="Bankr" />
      <input name="profile_url" value="https://bankr.bot/agents/helixa" />
      <input name="title" value="Helixa agent profile" />
      <textarea name="summary">Public marketplace listing for Helixa services.</textarea>
      <input name="listing_id" value="helixa" />
      <select name="status"><option value="manager_supplied" selected>manager_supplied</option></select>
      <input name="source_checked_at" value="2026-07-06" />
      <input name="service_name" value="Deep CRED report" />
      <input name="service_price" value="$1 USDC" />
      <input name="service_payment_mode" value="x402" />
      <input name="service_endpoint_url" value="https://api.example.test/service" />
    </form>
  `).querySelector('form');
  const payload = compactMarketplaceConnectionInput(new window.FormData(form));
  assert.equal(payload.fragment_type, 'attestation');
  assert.equal(payload.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(payload.transfer_policy, 'historical_on_transfer');
  assert.equal(payload.status, undefined);
  assert.equal(payload.marketplace_ref.marketplace, 'Bankr');
  assert.equal(payload.marketplace_ref.status, 'manager_supplied');
  assert.equal(payload.marketplace_ref.source_checked_at, '2026-07-06');
});

test('compactMarketplaceConnectionPatch replaces marketplace_ref without fragment_type or top-level status', () => {
  const form = setup(`
    <form>
      <input name="marketplace" value="Bankr" />
      <input name="profile_url" value="https://bankr.bot/agents/helixa" />
      <input name="title" value="Updated title" />
      <textarea name="summary">Updated summary.</textarea>
      <select name="status"><option value="stale" selected>stale</option></select>
      <input name="source_checked_at" value="" />
    </form>
  `).querySelector('form');
  const payload = compactMarketplaceConnectionPatch(new window.FormData(form), {});
  assert.equal(payload.fragment_type, undefined);
  assert.equal(payload.status, undefined);
  assert.equal(payload.reference_url, 'https://bankr.bot/agents/helixa');
  assert.equal(payload.marketplace_ref.status, 'stale');
  assert.equal(Object.hasOwn(payload.marketplace_ref, 'source_checked_at'), false);
});

test('status select exposes only manager display statuses and defaults manual drafts to manager supplied', () => {
  const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [] } } }));
  const select = root.querySelector('select[name="status"]');
  const options = [...select.options].map((option) => option.value);
  assert.deepEqual(options, ['manager_supplied', 'public_import', 'pending', 'stale', 'disputed']);
  assert.equal(select.value, 'manager_supplied');
  assert.equal(options.includes('verified'), false);
  assert.equal(options.includes('platform_verified'), false);
  assert.equal(options.includes('revoked'), false);
});

test('render and bind Marketplace Connections manager dispatch create update and retire', () => {
  const fragment = {
    fragment_id: 'frag_marketplace_bankr',
    fragment_type: 'attestation',
    status: 'pending',
    visibility: 'public',
    source: { source_type: 'owner_submission', issuer: null },
    marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa', summary: 'Summary.', status: 'manager_supplied' },
  };
  const root = setup(renderMarketplaceConnectionManagerPanel({ data: { fragments: { fragments: [fragment] } } }));
  const calls = [];
  bindMarketplaceConnectionManager(root, {
    createMarketplaceConnection: (event) => calls.push(['create', event.currentTarget.dataset.action]),
    updateMarketplaceConnection: (event) => calls.push(['update', event.currentTarget.dataset.fragmentId]),
    retireMarketplaceConnection: (event) => calls.push(['retire', event.currentTarget.dataset.fragmentId]),
  });
  root.querySelector('[data-action="create-marketplace-connection"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="update-marketplace-connection"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="retire-marketplace-connection"]').click();
  assert.deepEqual(calls, [['create', 'create-marketplace-connection'], ['update', 'frag_marketplace_bankr'], ['retire', 'frag_marketplace_bankr']]);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test apps/web/test/marketplace-connection-manager.test.mjs
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement pure importer and compaction helpers**

In `apps/web/src/marketplace-connection-manager.js` implement:

```js
const KNOWN_MARKETPLACE_HOSTS = [
  [/^(.*\.)?bankr\.bot$/, 'Bankr'],
  [/^(.*\.)?okx\.ai$/, 'OKX.AI'],
  [/^(social\.)?moltx\.io$|^(.*\.)?moltx\.io$/, 'MoltX'],
  [/^(.*\.)?agentgram\.xyz$/, 'AgentGram'],
  [/^(.*\.)?virtuals\.io$/, 'Virtuals'],
  [/^(.*\.)?opensea\.io$/, 'OpenSea'],
];

export function createMarketplaceDraftFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? '').trim());
  } catch {
    return { draft: null, error: 'Marketplace URL must be a valid URL.' };
  }
  if (parsed.protocol !== 'https:') return { draft: null, error: 'Marketplace URL must use https.' };
  if (parsed.username || parsed.password) return { draft: null, error: 'Marketplace URL must not include credentials.' };
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  const listingId = extractListingId(parsed.pathname);
  const marketplace = marketplaceLabelForHost(parsed.hostname);
  return {
    draft: {
      marketplace,
      profile_url: parsed.toString(),
      listing_id: listingId,
      title: listingId || marketplace,
      summary: '',
      status: 'public_import',
    },
    error: null,
  };
}
```

Also implement:

- `compactMarketplaceConnectionInput(formData)` for creates. It returns a complete payload with `fragment_type: 'attestation'`, `reference_url` equal to `marketplace_ref.profile_url`, generated `public_value`, `transfer_policy: 'historical_on_transfer'`, and no top-level `status`.
- `compactMarketplaceConnectionPatch(formData, current)` for updates. It returns a complete replacement payload with `reference_url`, generated `public_value`, `transfer_policy: 'historical_on_transfer'`, and `marketplace_ref`, but it must omit `fragment_type` and top-level `status`.
- `mergeMarketplaceConnectionMutationState(current, result, patch)` mirroring `mergeFragmentMutationState()`: merge returned `profile` and `fragments` into `current.data` without touching route, tool, generic fragment, claim, or wallet state.

Manual forms default `marketplace_ref.status` to `manager_supplied`. URL-prefilled forms default it to `public_import`. If the manager changes the display status selector, use that selected value.

- [ ] **Step 4: Implement render and bind functions**

Render requirements:

- Heading `Marketplace Connections`.
- Safety copy exactly includes: `Display-only public metadata. Multipass does not execute marketplace tasks, collect credentials, enforce payment, transfer custody, or grant tools.`
- Add form with URL paste field named `marketplace_url_import`, a local button `data-action="prefill-marketplace-url"`, editable manual fields, row inputs for services, rails, reputation, facts, and display status select.
- The display status select must contain only `manager_supplied`, `public_import`, `pending`, `stale`, and `disputed`. Do not render `verified`, `platform_verified`, or `revoked` as options.
- Existing owner-submitted Marketplace Connection fragments render edit forms.
- Imported or platform-created Marketplace Connection fragments render read-only with `Imported Marketplace Connection. Read-only here.`
- Retired or revoked fragments are not shown in active edit list, but can be counted if useful.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
node --test apps/web/test/marketplace-connection-manager.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit frontend module work**

```bash
git add apps/web/src/marketplace-connection-manager.js apps/web/test/marketplace-connection-manager.test.mjs
git commit -m "feat: add marketplace connection manager module"
```

### Task 4: Frontend dashboard integration and generic fragment guard

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/marketplace-connection-manager.js`
- Modify: `apps/web/src/fragment-manager.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/fragment-manager.test.mjs`
- Modify: `apps/web/test/wording.test.mjs`

- [ ] **Step 1: Write failing integration tests**

In `apps/web/test/fragment-manager.test.mjs`, add:

```js
test('generic fragment manager delegates Marketplace Connection fragments instead of rendering generic edit controls', () => {
  const marketplaceFragment = {
    ...OWNER_FRAGMENT,
    fragment_id: 'frag_marketplace_bankr',
    fragment_type: 'attestation',
    marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa', summary: 'Summary.', status: 'manager_supplied' },
  };
  const root = setup(renderFragmentManagerPanel({ data: { fragments: { fragments: [marketplaceFragment, OWNER_FRAGMENT] } } }));
  assert.equal(root.querySelector('[data-fragment-id="frag_marketplace_bankr"] [data-action="update-public-fragment"]'), null);
  assert.match(root.textContent, /Edit this in Marketplace Connections\./);
  assert.equal(root.querySelectorAll('[data-action="update-public-fragment"]').length, 1);
});
```

In `apps/web/test/app.test.mjs`, add concrete claimed-manager tests using the existing jsdom helpers. Add this local helper near other claimed-manager helpers:

```js
async function renderClaimedMarketplaceManager({ initialFragments = [], claimApiOverrides = {} } = {}) {
  const calls = [];
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const profile = {
    ...sampleData().profile,
    slug: 'bendr-2-1',
    owner_summary: { owner_state: 'claimed', verification_status: 'verified', visibility: 'public' },
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile }),
    createMultipassFragment: async (input) => {
      calls.push(['create', input]);
      const fragment = { fragment_id: 'frag_marketplace_bankr', fragment_type: 'attestation', status: 'pending', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: input.fragment.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment, ...initialFragments] }, profile };
    },
    updateMultipassFragment: async (input) => {
      calls.push(['update', input]);
      const fragment = { fragment_id: input.fragmentId, fragment_type: 'attestation', status: 'stale', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: input.patch.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment] }, profile };
    },
    revokeMultipassFragment: async (input) => {
      calls.push(['revoke', input]);
      const fragment = { fragment_id: input.fragmentId, fragment_type: 'attestation', status: 'revoked', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: initialFragments[0]?.marketplace_ref };
      return { fragment, fragments: { fragments: [fragment] }, profile };
    },
    ...claimApiOverrides,
  };
  const fetchImpl = async (url) => {
    const body = sampleData();
    body.profile = profile;
    body.fragments = { fragments: initialFragments };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await createApp({ root, claimApi, walletSigner: async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' }), fetchImpl }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();
  return { root, calls };
}
```

Add publish/update/retire tests:

```js
test('claimed manager publishes Marketplace Connection with structured fragment payload', async () => {
  const { root, calls } = await renderClaimedMarketplaceManager();
  const form = root.querySelector('[data-action="create-marketplace-connection"]');
  form.querySelector('input[name="marketplace"]').value = 'Bankr';
  form.querySelector('input[name="profile_url"]').value = 'https://bankr.bot/agents/helixa';
  form.querySelector('input[name="title"]').value = 'Helixa agent profile';
  form.querySelector('textarea[name="summary"]').value = 'Public marketplace listing for Helixa services.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  const payload = calls.find(([kind]) => kind === 'create')[1].fragment;
  assert.equal(payload.fragment_type, 'attestation');
  assert.equal(payload.status, undefined);
  assert.equal(payload.transfer_policy, 'historical_on_transfer');
  assert.equal(payload.marketplace_ref.marketplace, 'Bankr');
  assert.match(root.querySelector('.marketplace-connection-manager-panel').textContent, /Marketplace connection saved|published/i);
});

test('claimed manager updates and retires existing Marketplace Connection', async () => {
  const fragment = { fragment_id: 'frag_marketplace_bankr', fragment_type: 'attestation', status: 'pending', visibility: 'public', source: { source_type: 'owner_submission', issuer: null }, marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa', summary: 'Summary.', status: 'manager_supplied' } };
  const { root, calls } = await renderClaimedMarketplaceManager({ initialFragments: [fragment] });
  const form = root.querySelector('[data-action="update-marketplace-connection"][data-fragment-id="frag_marketplace_bankr"]');
  form.querySelector('input[name="title"]').value = 'Updated title';
  form.querySelector('select[name="status"]').value = 'stale';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  const update = calls.find(([kind]) => kind === 'update')[1];
  assert.equal(update.patch.fragment_type, undefined);
  assert.equal(update.patch.status, undefined);
  assert.equal(update.patch.marketplace_ref.title, 'Updated title');
  root.querySelector('[data-action="retire-marketplace-connection"][data-fragment-id="frag_marketplace_bankr"]').click();
  await flushAsyncEvents();
  assert.equal(calls.find(([kind]) => kind === 'revoke')[1].fragmentId, 'frag_marketplace_bankr');
});

test('Marketplace Connection write errors stay localized to the marketplace panel', async () => {
  const { root } = await renderClaimedMarketplaceManager({ claimApiOverrides: { createMultipassFragment: async () => { throw new Error('Marketplace API failed.'); } } });
  const form = root.querySelector('[data-action="create-marketplace-connection"]');
  form.querySelector('input[name="marketplace"]').value = 'Bankr';
  form.querySelector('input[name="profile_url"]').value = 'https://bankr.bot/agents/helixa';
  form.querySelector('input[name="title"]').value = 'Helixa agent profile';
  form.querySelector('textarea[name="summary"]').value = 'Public marketplace listing for Helixa services.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();
  assert.match(root.querySelector('.marketplace-connection-manager-panel').textContent, /Marketplace API failed/);
  assert.equal(root.querySelector('.route-manager-panel .resolver-message.error'), null);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test apps/web/test/fragment-manager.test.mjs --test-name-pattern Marketplace
node --test apps/web/test/app.test.mjs --test-name-pattern "Marketplace Connection"
```

Expected: FAIL because panel is not mounted and generic manager still exposes marketplace fragments.

- [ ] **Step 3: Integrate manager state and handlers**

In `apps/web/src/app.js`:

- Import manager functions:

```js
import { bindMarketplaceConnectionManager, compactMarketplaceConnectionInput, compactMarketplaceConnectionPatch, mergeMarketplaceConnectionMutationState, renderMarketplaceConnectionManagerPanel } from './marketplace-connection-manager.js';
```

- Add state keys:

```js
marketplaceStatus: null,
marketplaceError: null,
marketplaceActiveFragmentId: null,
```

- Add handlers:

```js
async function createMarketplaceConnection(event) {
  const id = getManageIdentifier(state);
  const csrfToken = state.claimCsrfToken;
  if (!id || !csrfToken) return;
  let fragment;
  try {
    fragment = compactMarketplaceConnectionInput(createFormData(event?.currentTarget));
  } catch (error) {
    setMarketplaceMutationError(error);
    return;
  }
  await mutateMarketplaceConnection({
    status: 'creating_marketplace_connection',
    successStatus: 'marketplace_connection_created',
    operation: ({ apiBase }) => claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl }),
  });
}

async function updateMarketplaceConnection(event) {
  const id = getManageIdentifier(state);
  const fragmentId = event?.currentTarget?.dataset.fragmentId;
  const csrfToken = state.claimCsrfToken;
  if (!id || !fragmentId || !csrfToken) return;
  const current = (state.data?.fragments?.fragments ?? []).find((fragment) => fragment.fragment_id === fragmentId) ?? {};
  let patch;
  try {
    patch = compactMarketplaceConnectionPatch(createFormData(event.currentTarget), current);
  } catch (error) {
    setMarketplaceMutationError(error, fragmentId);
    return;
  }
  await mutateMarketplaceConnection({
    status: 'updating_marketplace_connection',
    successStatus: 'marketplace_connection_updated',
    activeFragmentId: fragmentId,
    operation: ({ apiBase }) => claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl }),
  });
}

async function retireMarketplaceConnection(event) {
  const id = getManageIdentifier(state);
  const fragmentId = event?.currentTarget?.dataset.fragmentId;
  const csrfToken = state.claimCsrfToken;
  if (!id || !fragmentId || !csrfToken) return;
  await mutateMarketplaceConnection({
    status: 'retiring_marketplace_connection',
    successStatus: 'marketplace_connection_retired',
    activeFragmentId: fragmentId,
    operation: ({ apiBase }) => claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl }),
  });
}
```

- Add `setMarketplaceMutationError()` and `mutateMarketplaceConnection()` exactly scoped to marketplace state:

```js
function setMarketplaceMutationError(error, activeFragmentId = null) {
  state = {
    ...state,
    marketplaceStatus: 'error',
    marketplaceError: error.message,
    marketplaceActiveFragmentId: activeFragmentId,
  };
  render(root, state, handlers);
}

async function mutateMarketplaceConnection({ status, successStatus, activeFragmentId = null, operation }) {
  state = { ...state, marketplaceStatus: status, marketplaceError: null, marketplaceActiveFragmentId: activeFragmentId };
  render(root, state, handlers);
  try {
    const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
    const result = await operation({ apiBase });
    state = mergeMarketplaceConnectionMutationState(state, result, {
      marketplaceStatus: successStatus,
      marketplaceError: null,
      marketplaceActiveFragmentId: activeFragmentId,
    });
    render(root, state, handlers);
  } catch (error) {
    setMarketplaceMutationError(error, activeFragmentId);
  }
}
```
- Add handlers to the `handlers` object and bind during `render()` alongside route, tool, and fragment managers.
- Mount panel after routes and before generic fragments:

```js
${canEdit ? `<section class="owner-command-section" data-command-section="marketplace-connections" aria-label="Marketplace Connections controls">${renderMarketplaceConnectionManagerPanel(state)}</section>` : ''}
```

- [ ] **Step 4: Guard generic fragment manager**

In `apps/web/src/fragment-manager.js`:

```js
function isMarketplaceConnectionFragment(fragment) {
  return Boolean(fragment?.marketplace_ref);
}
```

Then in `renderManagedFragment(fragment, state)`, set:

```js
const marketplaceConnection = isMarketplaceConnectionFragment(fragment);
const editable = !marketplaceConnection && fragment.source?.source_type === 'owner_submission' && fragment.source?.issuer === null;
```

Render handoff copy for marketplace fragments:

```js
${marketplaceConnection ? '<p class="resolver-message">Edit this in Marketplace Connections.</p>' : editable ? renderManagedFragmentEditForm(fragment, state) : '<p class="resolver-message">Imported fragment. Read-only here.</p>'}
```

- [ ] **Step 5: Extend wording scan**

Include `apps/web/src/marketplace-connection-manager.js` in the wording scan. Add marketplace-specific blocked patterns against the new Marketplace Connections source files only, not the whole existing app claim/login copy:

```js
const marketplaceCopyFiles = [
  join(webRoot, 'src/marketplace-connection-manager.js'),
  join(webRoot, 'src/marketplace-presence.js'),
];
const blockedMarketplacePhrases = [
  /official integration/i,
  /payment verified/i,
  /trusted seller/i,
  /verified marketplace account/i,
  /execute service/i,
  /connect wallet/i,
];
```

Then add a test that scans only `marketplaceCopyFiles` for `blockedMarketplacePhrases`. Keep current no emoji and no em dash checks passing.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
node --test apps/web/test/marketplace-connection-manager.test.mjs
node --test apps/web/test/fragment-manager.test.mjs --test-name-pattern Marketplace
node --test apps/web/test/app.test.mjs --test-name-pattern "Marketplace Connection"
node --test apps/web/test/wording.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit dashboard integration**

```bash
git add apps/web/src/app.js apps/web/src/marketplace-connection-manager.js apps/web/src/fragment-manager.js apps/web/test/app.test.mjs apps/web/test/fragment-manager.test.mjs apps/web/test/wording.test.mjs
git commit -m "feat: wire marketplace connection manager"
```

### Task 5: Public renderer fragment derivation and de-dupe

**Files:**
- Create: `apps/web/src/marketplace-presence.js`
- Create: `apps/web/test/marketplace-presence.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing focused helper tests**

Create `apps/web/test/marketplace-presence.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { getMarketplacePresenceEntries, normalizeMarketplaceProfileUrlForKey } from '../src/marketplace-presence.js';

const MARKETPLACE_FRAGMENT = {
  fragment_id: 'frag_marketplace_bankr',
  fragment_type: 'attestation',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  source: { source_type: 'owner_submission', issuer: null, observed_at: '2026-07-06T00:00:00.000Z', reference_url: 'https://bankr.bot/agents/helixa' },
  marketplace_ref: {
    marketplace: 'Bankr',
    profile_url: 'https://bankr.bot/agents/helixa',
    title: 'Helixa agent profile',
    summary: 'Public marketplace listing for Helixa services.',
    listing_id: 'helixa',
    status: 'manager_supplied',
    services: [{ name: 'Deep CRED report', endpoint_url: 'https://api.example.test/service' }],
  },
};

test('getMarketplacePresenceEntries derives fragment entries before explicit data and de-dupes by URL', () => {
  const entries = getMarketplacePresenceEntries({
    fragments: { fragments: [MARKETPLACE_FRAGMENT] },
    marketplacePresence: [{ marketplace: 'Bankr', profileUrl: 'https://bankr.bot/agents/helixa/', title: 'Old explicit', summary: 'Old summary.', status: 'public_import' }],
    profile: { marketplacePresence: [{ marketplace: 'Bankr', listingId: 'helixa', title: 'Old profile explicit', summary: 'Old summary.' }] },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Helixa agent profile');
  assert.equal(entries[0].services[0].endpointUrl, 'https://api.example.test/service');
  assert.equal(entries[0].source.label, 'Manager supplied source');
  assert.equal(entries[0].proof.fragmentId, 'frag_marketplace_bankr');
});

test('getMarketplacePresenceEntries skips each malformed revoked hidden and unsafe marketplace fragment', () => {
  const invalidCases = [
    ['revoked', { status: 'revoked' }],
    ['hidden', { visibility: 'hidden' }],
    ['unsafe', { marketplace_ref: { ...MARKETPLACE_FRAGMENT.marketplace_ref, profile_url: 'javascript:alert(1)' } }],
    ['missing-summary', { marketplace_ref: { ...MARKETPLACE_FRAGMENT.marketplace_ref, profile_url: 'https://bankr.bot/agents/missing-summary', summary: '' } }],
  ];

  for (const [fragmentId, overrides] of invalidCases) {
    const fragment = {
      ...MARKETPLACE_FRAGMENT,
      fragment_id: fragmentId,
      marketplace_ref: {
        ...MARKETPLACE_FRAGMENT.marketplace_ref,
        profile_url: `https://bankr.bot/agents/${fragmentId}`,
      },
      ...overrides,
    };
    const entries = getMarketplacePresenceEntries({ fragments: { fragments: [fragment] } });
    assert.deepEqual(entries, [], `${fragmentId} should be skipped`);
  }

  const valid = getMarketplacePresenceEntries({ fragments: { fragments: [{ ...MARKETPLACE_FRAGMENT, fragment_id: 'good' }] } });
  assert.deepEqual(valid.map((entry) => entry.fragmentId), ['good']);
});

test('normalizeMarketplaceProfileUrlForKey removes hash lowercases host and trims one trailing slash', () => {
  assert.equal(
    normalizeMarketplaceProfileUrlForKey('https://BANKR.bot/agents/helixa/#top'),
    'https://bankr.bot/agents/helixa',
  );
  assert.equal(normalizeMarketplaceProfileUrlForKey('https://user:pass@bankr.bot/agents/helixa'), '');
});
```

- [ ] **Step 2: Write failing app rendering smoke tests**

Keep app-level assertions small so `app.test.mjs` does not absorb the helper test matrix. Add near existing Marketplace Connections public-card tests:

```js
test('public renderer renders derived Marketplace Connection title and summary', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1');
  const data = {
    ...sampleData(),
    fragments: { fragments: [{
      fragment_id: 'frag_marketplace_bankr',
      fragment_type: 'attestation',
      status: 'pending',
      assurance_level: 'self_attested',
      visibility: 'public',
      source: { source_type: 'owner_submission', issuer: null, observed_at: '2026-07-06T00:00:00.000Z', reference_url: 'https://bankr.bot/agents/helixa' },
      marketplace_ref: { marketplace: 'Bankr', profile_url: 'https://bankr.bot/agents/helixa', title: 'Helixa agent profile', summary: 'Public marketplace listing for Helixa services.', listing_id: 'helixa', status: 'manager_supplied' },
    }] },
    marketplacePresence: [{ marketplace: 'Bankr', profileUrl: 'https://bankr.bot/agents/helixa/', title: 'Old explicit', summary: 'Old summary.', status: 'public_import' }],
  };
  await createApp({ root, loadDemo: async () => data }).start();
  const panel = root.querySelector('.marketplace-presence-panel');
  assert.match(panel.textContent, /Helixa agent profile/);
  assert.match(panel.textContent, /Public marketplace listing for Helixa services/);
  assert.doesNotMatch(panel.textContent, /Old explicit/);
  assert.equal(panel.querySelectorAll('.marketplace-presence-card').length, 1);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test apps/web/test/marketplace-presence.test.mjs
node --test apps/web/test/app.test.mjs --test-name-pattern "public renderer renders derived Marketplace"
```

Expected: FAIL because the helper module does not exist and `app.js` still uses local explicit-only marketplace entry helpers.

- [ ] **Step 4: Implement focused helper module and slim app integration**

Create `apps/web/src/marketplace-presence.js` with pure helpers:

```js
export function getMarketplacePresenceEntries(data) {
  const candidates = [
    ...deriveMarketplacePresenceEntriesFromFragments(data?.fragments?.fragments),
    ...(Array.isArray(data?.marketplacePresence) ? data.marketplacePresence : []),
    ...(Array.isArray(data?.profile?.marketplacePresence) ? data.profile.marketplacePresence : []),
  ];
  const seen = new Set();
  const entries = [];
  for (const entry of candidates) {
    const normalized = normalizeMarketplacePresenceEntry(entry);
    if (!normalized) continue;
    const key = getMarketplacePresenceDedupeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(normalized);
  }
  return entries;
}

export function normalizeMarketplaceProfileUrlForKey(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? '').trim());
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
}
```

Move existing `normalizeMarketplacePresenceEntry()`, service/payment/reputation/fact helpers, and de-dupe support from `app.js` into this module. Add the fragment derivation rules from the spec:

- skip non-public, revoked, malformed, missing required fields, and non-renderable profile URLs
- map `endpoint_url` to `endpointUrl`
- map source labels and provenance from display status
- use normalized profile URL key first, then lowercase marketplace/listing ID, then `fragment:{fragmentId}`

In `apps/web/src/app.js`, import only:

```js
import { getMarketplacePresenceEntries } from './marketplace-presence.js';
```

Keep the HTML rendering functions in `app.js`, but update `renderMarketplacePresenceCard()` to render `card.title` and `card.summary` when present while preserving older records that only have marketplace, listing ID, services, rails, or reputation facts.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
node --test apps/web/test/marketplace-presence.test.mjs
node --test apps/web/test/app.test.mjs --test-name-pattern "Marketplace Connection|marketplace"
```

Expected: PASS.

- [ ] **Step 6: Commit renderer work**

```bash
git add apps/web/src/marketplace-presence.js apps/web/src/app.js apps/web/test/marketplace-presence.test.mjs apps/web/test/app.test.mjs
git commit -m "feat: derive marketplace cards from fragments"
```

### Task 6: Full verification and deployment readiness

**Files:**
- Any files changed above.
- Do not deploy unless explicitly asked after verification.

- [ ] **Step 1: Run complete test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run web build**

```bash
pnpm web:build
```

Expected: PASS and Vite build completes.

- [ ] **Step 3: Run required local smoke**

Use a local served build or existing dev harness. This is required before claiming completion. Record the observed result for each flow in the implementation summary.

Expected smoke outputs:

- Claimed manager dashboard renders `Marketplace Connections` after public routes and before generic fragments.
- Pasting `https://bankr.bot/agents/helixa` prefills marketplace `Bankr`, listing ID `helixa`, title `helixa`, profile URL `https://bankr.bot/agents/helixa`, and display status `public_import` without network requests.
- Publishing a reviewed draft creates an `attestation` fragment with `marketplace_ref` and no top-level `status` in the request payload.
- Public profile renders a Marketplace Connections card with the saved title, summary, source, and profile link.
- Retiring the fragment sets lifecycle status `revoked` and the public card is hidden after refresh.

- [ ] **Step 4: Check copy boundaries**

Run source-only grep so wording tests do not match their own forbidden regex literals:

```bash
grep -R "official integration\|payment verified\|trusted seller\|verified marketplace account\|execute service\|connect wallet" apps/web/src/marketplace-connection-manager.js apps/web/src/marketplace-presence.js
```

Expected: no matches.

- [ ] **Step 5: Final git status**

```bash
git status --short
```

Expected: clean except intentionally untracked docs the team already knows about.

- [ ] **Step 6: Final commit if verification caused small fixups**

If any fixes were needed after full verification, stage only files touched by this implementation plan:

```bash
git add docs/schemas/identity-fragment.schema.json packages/types/schemas/identity-fragment.schema.json packages/types/test/schema-contract.test.mjs packages/sdk/test/sdk-validation.test.mjs apps/api/src/fragment-manager.js apps/api/src/marketplace-presence.js apps/api/src/saved-records.js apps/api/src/canonical-profile.js apps/api/src/index.js apps/api/test/api-routes.test.mjs apps/web/src/marketplace-connection-manager.js apps/web/src/marketplace-presence.js apps/web/src/fragment-manager.js apps/web/src/app.js apps/web/test/marketplace-connection-manager.test.mjs apps/web/test/marketplace-presence.test.mjs apps/web/test/fragment-manager.test.mjs apps/web/test/app.test.mjs apps/web/test/wording.test.mjs
git commit -m "fix: finalize marketplace connection editor"
```

### Acceptance checklist

- [ ] Claimed managers can paste a marketplace URL, review/edit the draft, publish it, and see a public card after saved data refresh.
- [ ] Claimed managers can edit and retire manager-created Marketplace Connections.
- [ ] Marketplace Connections persist as public `attestation` identity fragments with `marketplace_ref`.
- [ ] Backend derives top-level lifecycle status from display status and blocks manager-set `verified` or `platform_verified`.
- [ ] Backend rejects all unsafe URLs, embedded credentials, unsafe text, invalid dates, and future `source_checked_at` values.
- [ ] Blank `source_checked_at` on update clears the prior date instead of carrying it forward.
- [ ] Generic fragment manager cannot mutate Marketplace Connection fragments through top-level-only controls.
- [ ] Public card rendering derives fragment-backed entries first and de-dupes over explicit demo/fixture data.
- [ ] Revoked Marketplace Connection fragments stay hidden publicly.
- [ ] Copy remains display-only and makes no official partnership, trust, execution, custody, payment, credential, wallet, or tool-grant claims.
- [ ] `pnpm test` passes.
- [ ] `pnpm web:build` passes.

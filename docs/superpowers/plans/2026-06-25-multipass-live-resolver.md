# Multipass Live Resolver Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only live Helixa AgentDNA resolver to the Multipass V0 web prototype for token IDs like `1` and canonical Helixa IDs like `8453:1`.

**Architecture:** Keep `/multipass/` static by default, then add a client-only resolver path that validates deterministic IDs, fetches the public Helixa API, maps the response into the existing Multipass demo shape, and reuses the current card/proof/custody/ledger/transfer UI. Put parsing, fetching, and mapping in a focused adapter module so `app.js` stays responsible for rendering and UI state only.

**Tech Stack:** JavaScript modules, Vite, Node test runner, jsdom, public Helixa API `https://api.helixa.xyz/api/v2/agent/:tokenId`.

---

## Source Spec

- `docs/superpowers/specs/2026-06-25-multipass-live-resolver-design.md`

## File Structure

- Create: `apps/web/src/live-helixa-resolver.js`
  - Owns resolver input parsing, typed resolver errors, public Helixa API fetch, API response mapping, and the high-level `loadLiveHelixaMultipass()` coordinator.
  - Must not import DOM APIs or mutate `STATIC_DEMO_DATA`.
- Create: `apps/web/test/live-helixa-resolver.test.mjs`
  - Unit tests for parser, fetcher, mapper, privacy filtering expectations, string-safe token IDs, and coordinator behavior.
- Create: `apps/web/test/fixtures/helixa-agent-1.json`
  - Concrete Bendr-like public API fixture based on the live `agent/1` response.
- Modify: `apps/web/src/app.js`
  - Adds resolver UI state, resolver form, optional `?agent=` auto-resolve, duplicate-submit guard, stale-response guard, static reset, and data source note rendering.
- Modify: `apps/web/src/styles.css`
  - Adds compact resolver bar, error/loading status, and responsive styling while preserving the warm Multipass palette.
- Modify: `apps/web/test/app.test.mjs`
  - Adds DOM/UI tests for default static mode, manual resolve, canonical resolve, invalid input, unsupported chain, API error, duplicate-submit guard, stale response handling, and reset.
- Inspect only unless needed: `apps/web/test/content.test.mjs`, `apps/web/test/wording.test.mjs`, `apps/web/src/api.js`, `apps/web/src/content.js`.

---

## Chunk 1: Resolver Adapter

### Task 1: Add parser and typed errors

**Files:**
- Create: `apps/web/src/live-helixa-resolver.js`
- Test: `apps/web/test/live-helixa-resolver.test.mjs`

- [ ] **Step 1: Write parser failure tests**

Add tests like:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { HelixaResolverError, parseHelixaResolverInput } from '../src/live-helixa-resolver.js';

test('parseHelixaResolverInput accepts token id and canonical Base Helixa id', () => {
  assert.deepEqual(parseHelixaResolverInput('1'), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
  assert.deepEqual(parseHelixaResolverInput(' 8453:1 '), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
});

test('parseHelixaResolverInput keeps large token ids as strings', () => {
  const parsed = parseHelixaResolverInput('8453:900719925474099312345');
  assert.equal(parsed.tokenId, '900719925474099312345');
  assert.equal(typeof parsed.tokenId, 'string');
});

test('parseHelixaResolverInput rejects empty unsupported and fuzzy inputs', () => {
  assert.throws(() => parseHelixaResolverInput(''), (error) => error instanceof HelixaResolverError && error.code === 'empty_input');
  assert.throws(() => parseHelixaResolverInput('0'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('8453:0'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1.2'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('-1'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('Bendr'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('@BendrAI_eth'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('https://helixa.xyz/agent/1'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1abc'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1:2:3'), (error) => error instanceof HelixaResolverError && error.code === 'invalid_format');
  assert.throws(() => parseHelixaResolverInput('1:1'), (error) => error instanceof HelixaResolverError && error.code === 'unsupported_chain');
});
```

- [ ] **Step 2: Run the parser tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL because `apps/web/src/live-helixa-resolver.js` does not exist or exports are missing.

- [ ] **Step 3: Implement parser and error class**

Create `apps/web/src/live-helixa-resolver.js` with:

```js
const HELIXA_CHAIN_ID = 8453;

export class HelixaResolverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HelixaResolverError';
    this.code = code;
    this.details = details;
  }
}

export function parseHelixaResolverInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new HelixaResolverError('empty_input', 'Enter a Helixa token ID or Helixa ID.');
  }

  if (/^\d+$/.test(raw)) {
    if (!isPositiveTokenId(raw)) {
      throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
    }
    return { chainId: HELIXA_CHAIN_ID, tokenId: raw, canonicalId: `${HELIXA_CHAIN_ID}:${raw}` };
  }

  const canonical = raw.match(/^(\d+):(\d+)$/);
  if (!canonical) {
    throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
  }

  const chainId = Number(canonical[1]);
  if (chainId !== HELIXA_CHAIN_ID) {
    throw new HelixaResolverError('unsupported_chain', 'V0 supports Base Helixa AgentDNA records only.', { chainId });
  }

  const tokenId = canonical[2];
  if (!isPositiveTokenId(tokenId)) {
    throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.');
  }

  return { chainId, tokenId, canonicalId: `${HELIXA_CHAIN_ID}:${tokenId}` };
}

function isPositiveTokenId(value) {
  return /^\d+$/.test(value) && !/^0+$/.test(value);
}
```

- [ ] **Step 4: Run parser tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS for the parser tests added so far.

- [ ] **Step 5: Commit parser**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Add Helixa resolver input parser"
```

### Task 2: Add public Helixa fetcher

**Files:**
- Modify: `apps/web/src/live-helixa-resolver.js`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`

- [ ] **Step 1: Write fetcher tests**

Add tests like:

```js
import { fetchHelixaAgent } from '../src/live-helixa-resolver.js';

test('fetchHelixaAgent requests the public Helixa API without private headers', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ tokenId: 1, name: 'Bendr 2.0' }) };
  };

  const agent = await fetchHelixaAgent('1', fetchImpl);

  assert.equal(agent.name, 'Bendr 2.0');
  assert.equal(calls[0].url, 'https://api.helixa.xyz/api/v2/agent/1');
  assert.equal(calls[0].options?.credentials, 'omit');
  assert.deepEqual(Object.keys(calls[0].options?.headers ?? {}), ['Accept']);
});

test('fetchHelixaAgent handles 404 and 429 responses as typed errors', async () => {
  await assert.rejects(
    () => fetchHelixaAgent('999999', async () => ({ ok: false, status: 404, headers: new Map(), text: async () => 'not found' })),
    (error) => error instanceof HelixaResolverError && error.code === 'not_found',
  );

  await assert.rejects(
    () => fetchHelixaAgent('1', async () => ({ ok: false, status: 429, headers: { get: () => '12' }, text: async () => 'rate limited' })),
    (error) => error instanceof HelixaResolverError && error.code === 'rate_limited' && error.details.retryAfter === '12',
  );
});

test('fetchHelixaAgent handles network failures and invalid JSON', async () => {
  await assert.rejects(
    () => fetchHelixaAgent('1', async () => { throw new Error('offline'); }),
    (error) => error instanceof HelixaResolverError && error.code === 'network_error',
  );

  await assert.rejects(
    () => fetchHelixaAgent('1', async () => ({ ok: true, status: 200, text: async () => '{bad json' })),
    (error) => error instanceof HelixaResolverError && error.code === 'invalid_json',
  );
});
```

- [ ] **Step 2: Run fetcher tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL because `fetchHelixaAgent` is missing.

- [ ] **Step 3: Implement fetcher**

Add to `apps/web/src/live-helixa-resolver.js`:

```js
const HELIXA_AGENT_API_BASE = 'https://api.helixa.xyz/api/v2/agent';

export async function fetchHelixaAgent(tokenId, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${HELIXA_AGENT_API_BASE}/${encodeURIComponent(tokenId)}`, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new HelixaResolverError('network_error', 'Could not reach the Helixa API. Static demo is still available.', { cause: error.message });
  }

  if (!response.ok) {
    if (response.status === 404) throw new HelixaResolverError('not_found', 'No Helixa agent found for that ID.');
    if (response.status === 429) throw new HelixaResolverError('rate_limited', 'Helixa API is rate-limiting requests. Try again shortly.', { retryAfter: response.headers?.get?.('Retry-After') ?? null });
    throw new HelixaResolverError('http_error', `GET Helixa agent failed with ${response.status}`, { status: response.status });
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HelixaResolverError('invalid_json', 'Helixa returned a response this prototype cannot read yet.', { cause: error.message });
  }
}
```

- [ ] **Step 4: Run fetcher tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS for parser and fetcher tests.

- [ ] **Step 5: Commit fetcher**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Add Helixa public agent fetcher"
```

### Task 3: Add Bendr fixture and mapper tests

**Files:**
- Create: `apps/web/test/fixtures/helixa-agent-1.json`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify: `apps/web/src/live-helixa-resolver.js`

- [ ] **Step 1: Create the concrete fixture**

Create `apps/web/test/fixtures/helixa-agent-1.json` from the public live response shape:

```json
{
  "tokenId": 1,
  "agentAddress": "0xD31fCdb0432D3C9BF9d98643F69C7edd690E48E8",
  "name": "Bendr 2.0",
  "framework": "openclaw",
  "mintedAt": "2026-02-17T03:48:11.000Z",
  "verified": true,
  "soulbound": true,
  "mintOrigin": "AGENT_SIWA",
  "generation": 0,
  "version": 1,
  "mutationCount": 0,
  "points": 426,
  "credScore": 80,
  "owner": "0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea",
  "operator": null,
  "socials": {
    "x": "@BendrAI_eth",
    "github": "Bendr-20/helixa",
    "website": "https://helixa.xyz",
    "telegram": "@bendr2bot"
  },
  "skills": ["identity", "routing", "trust infrastructure"],
  "domains": ["ai agents", "onchain identity", "reputation"],
  "services": {
    "web": { "url": "https://helixa.xyz/agent/1" },
    "telegram": { "handle": "@bendr2bot" },
    "mcp": { "url": "https://api.helixa.xyz/api/mcp" },
    "a2a": { "url": "https://api.helixa.xyz/api/a2a" }
  },
  "metadata": {
    "entityType": "agent",
    "principalType": "agent",
    "openToWork": true,
    "preferredCommunicationChannels": ["telegram", "web", "mcp", "a2a"],
    "acceptedPayments": ["usdc", "cred"],
    "serviceCategories": ["operator-support", "ai-consulting", "automation"],
    "organization": "Helixa",
    "framework": "openclaw"
  },
  "linkedToken": {
    "contractAddress": "0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3",
    "symbol": "CRED",
    "name": "Helixa Cred",
    "chain": "base"
  },
  "traits": [
    { "name": "Builder", "category": "role", "addedAt": "2026-02-17T03:52:37.000Z" },
    { "name": "ERC-8004", "category": "standard", "addedAt": "2026-02-17T03:52:55.000Z" },
    { "name": "Base Native", "category": "chain", "addedAt": "2026-02-17T03:52:59.000Z" }
  ],
  "explorer": "https://basescan.org/token/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60?a=1"
}
```

- [ ] **Step 2: Write mapper tests**

Add tests like:

```js
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapHelixaAgentToMultipassDemo } from '../src/live-helixa-resolver.js';

const testRoot = dirname(fileURLToPath(import.meta.url));

async function bendrFixture() {
  return JSON.parse(await readFile(join(testRoot, 'fixtures/helixa-agent-1.json'), 'utf8'));
}

test('mapHelixaAgentToMultipassDemo maps Bendr public API data into Multipass display shape', async () => {
  const data = mapHelixaAgentToMultipassDemo(await bendrFixture());

  assert.equal(data.modeLabel, 'Live Resolver');
  assert.equal(data.sourceLabel, 'live Helixa API');
  assert.equal(data.profile.display_name, 'Bendr 2.0');
  assert.equal(data.profile.slug, 'helixa-agent-1');
  assert.equal(data.profile.multipass_id, 'mp_helixa_agent_1');
  assert.equal(data.agentCards[0].helixaId, '8453:1');
  assert.equal(data.agentCards[0].credScore, 80);
  assert.equal(data.agentCards[0].credTier, 'Preferred');
  assert.equal(data.agentCards[0].ownerSnapshot.owner, '0x27E3...C91E');
  assert.equal(data.agentCards[0].ownerSnapshot.operator, 'Not delegated');
  assert.match(data.agentCards[0].ownerSnapshot.note, /without executing approvals or transferring authority/i);
  assert.ok(data.agentCards[0].changeReviewLedger.length >= 4);
  assert.match(JSON.stringify(data.agentCards[0].changeReviewLedger), /Live profile fetched/);
  assert.equal(data.agentCards[0].transferPreview.claimAction, 'No transfer detected');
  assert.match(data.receipt.status, /none|unattached|not_attached/);
});

test('mapHelixaAgentToMultipassDemo creates public readable fragments without private leaks or fake receipts', async () => {
  const fixture = await bendrFixture();
  fixture.private_api_key = 'secret';
  fixture.hiddenCredential = 'secret';

  const data = mapHelixaAgentToMultipassDemo(fixture);
  const rendered = JSON.stringify(data);

  assert.equal(rendered.includes('secret'), false);
  assert.ok(data.fragments.fragments.every((fragment) => fragment.visibility === 'public'));
  assert.deepEqual(data.agentCards[0].proofFragmentIds, data.fragments.fragments.map((fragment) => fragment.fragment_id));
  assert.match(data.fragments.fragments.map((fragment) => fragment.public_value).join(' '), /Cred score 80/);
  assert.match(data.fragments.fragments.map((fragment) => fragment.public_value).join(' '), /X handle @BendrAI_eth/);
  assert.doesNotMatch(data.receipt.receipt_id, /receipt_bendr_lookup/);
});

test('mapHelixaAgentToMultipassDemo handles missing optional public fields', () => {
  const data = mapHelixaAgentToMultipassDemo({ tokenId: '81', name: 'Quigbot', verified: true, credScore: 75, services: {}, socials: {}, operator: null, linkedToken: null, traits: null });

  assert.equal(data.profile.display_name, 'Quigbot');
  assert.equal(data.agentCards[0].framework, 'unknown');
  assert.equal(data.agentCards[0].profileUrl, 'https://helixa.xyz/agent/81');
  assert.equal(data.agentCards[0].ownerSnapshot.operator, 'Not delegated');
  assert.equal(data.x402.endpoints.length, 0);
});
```

- [ ] **Step 3: Run mapper tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL because `mapHelixaAgentToMultipassDemo` is missing.

- [ ] **Step 4: Implement mapper helpers**

Add focused helpers in `apps/web/src/live-helixa-resolver.js`:

```js
const CONTRACT_ADDRESS = '0x2e3B541C59D38b84E3Bc54e977200230A204Fe60';

export function mapHelixaAgentToMultipassDemo(agent) {
  const tokenId = String(agent?.tokenId ?? '').trim() || 'unknown';
  const displayName = agent?.name || `Agent #${tokenId}`;
  const multipassId = `mp_helixa_agent_${tokenId}`;
  const profileUrl = agent?.services?.web?.url ?? `https://helixa.xyz/agent/${encodeURIComponent(tokenId)}`;
  const fragments = createLiveFragments(agent, tokenId, multipassId);
  const credTier = formatCredTier(agent?.credScore);
  const acceptedPayments = normalizeAcceptedPayments(agent);

  const agentCard = {
    name: displayName,
    tokenId,
    helixaId: `${HELIXA_CHAIN_ID}:${tokenId}`,
    framework: agent?.framework ?? agent?.metadata?.framework ?? 'unknown',
    credScore: Number.isFinite(agent?.credScore) ? agent.credScore : null,
    credTier,
    verified: Boolean(agent?.verified),
    profileUrl,
    proofFragmentIds: fragments.map((fragment) => fragment.fragment_id),
    ownerSnapshot: createLiveOwnerSnapshot(agent),
    changeReviewLedger: createLiveChangeLedger(agent),
    transferPreview: createLiveTransferPreview(agent),
  };

  return {
    modeLabel: 'Live Resolver',
    sourceLabel: 'live Helixa API',
    heroNote: `Read-only live Helixa API data for ${displayName}.`,
    profile: {
      schema_version: '0.1.0',
      multipass_id: multipassId,
      subject_type: 'agent',
      display_name: displayName,
      slug: `helixa-agent-${tokenId}`,
      status: 'live_resolved',
      owner_summary: { owner_state: agent?.owner ? 'observed' : 'not_published', verification_status: agent?.verified ? 'verified' : 'unverified', visibility: 'public', summary: 'Public owner state observed from the live Helixa API.' },
      custody_epoch: null,
      public_fragments: fragments.map(({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at }) => ({ fragment_id, fragment_type, status, assurance_level, visibility, updated_at })),
      cred_summary: { trust_state: Number.isFinite(agent?.credScore) ? 'established' : 'pending', attestation_count: fragments.filter((fragment) => fragment.fragment_type === 'attestation').length, receipt_count: 0, last_updated_at: new Date().toISOString(), public_note: Number.isFinite(agent?.credScore) ? `Cred score ${agent.credScore} imported from Helixa API. Cred is a signal, not something bought or raised by payment.` : 'No live Cred score published by the Helixa API.' },
      discovery_profile: { summary: `${displayName} resolved from the live Helixa API as AgentDNA token #${tokenId}.`, tags: compact(['helixa', 'multipass', agent?.framework]), avatar_url: null, visibility: 'public' },
      standards_profile: { standards_profile_id: `sp_helixa_agent_${tokenId}`, supported_standard_ids: extractStandards(agent), last_verified_at: null },
      payment_profile: { accepted_assets: acceptedPayments.map((asset) => ({ asset: asset.toUpperCase(), chain_id: HELIXA_CHAIN_ID })), x402_manifest_url: null, paid_endpoints_enabled: false },
      updated_at: new Date().toISOString(),
    },
    fragments: { subject_id: `helixa-agent-${tokenId}`, fragments },
    card: createLiveAgentCardDocument(agent, tokenId, profileUrl),
    agentCards: [agentCard],
    standards: { standard_refs: extractStandards(agent).map((standard) => ({ standard_id: standard, status: 'referenced' })) },
    x402: { endpoints: acceptedPayments.map((asset) => ({ endpoint_id: 'live-profile-reference', asset: asset.toUpperCase(), route: profileUrl, status: 'planned' })) },
    receipt: { receipt_id: `no_live_receipt_${tokenId}`, status: 'not_attached', response_class: null, redaction_note: 'No live receipt attached to this public Helixa API record.' },
    routes: { profile: `https://api.helixa.xyz/api/v2/agent/${encodeURIComponent(tokenId)}` },
  };
}
```

Add the helper implementations in the same file with these exact responsibilities and output shapes:

```js
function createLiveFragments(agent, tokenId, multipassId) {
  const observedAt = agent?.mintedAt ?? new Date().toISOString();
  const fragments = [];

  fragments.push(createFragment({
    fragment_id: `frag_live_${tokenId}_identity`,
    multipass_id: multipassId,
    fragment_type: 'attestation',
    status: agent?.verified ? 'verified' : 'pending',
    assurance_level: agent?.verified ? 'onchain_verified' : 'platform_verified',
    transfer_policy: 'historical_on_transfer',
    source_type: agent?.explorer ? 'contract_read' : 'platform_check',
    observed_at: observedAt,
    reference_url: agent?.explorer ?? `https://helixa.xyz/agent/${encodeURIComponent(tokenId)}`,
    public_value: `Helixa AgentDNA token #${tokenId}${agent?.mintOrigin ? ` minted from ${agent.mintOrigin}` : ''}.`,
  }));

  if (hasNumericCred(agent?.credScore)) {
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_cred`,
      multipass_id: multipassId,
      fragment_type: 'risk_summary',
      status: 'verified',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'registry_import',
      observed_at: observedAt,
      reference_url: `https://api.helixa.xyz/api/v2/agent/${encodeURIComponent(tokenId)}`,
      public_value: `Cred score ${agent.credScore}, ${formatCredTier(agent.credScore)} tier, imported from Helixa API.`,
    }));
  }

  for (const [network, value] of Object.entries(agent?.socials ?? {})) {
    if (!value) continue;
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_social_${safeKey(network)}`,
      multipass_id: multipassId,
      fragment_type: 'social',
      status: agent?.verified ? 'verified' : 'pending',
      assurance_level: 'platform_verified',
      transfer_policy: 'reverify_on_transfer',
      source_type: 'platform_check',
      observed_at: observedAt,
      reference_url: `https://api.helixa.xyz/api/v2/agent/${encodeURIComponent(tokenId)}`,
      public_value: `${formatLabel(network)} handle ${value} imported from Helixa API.`,
    }));
  }

  for (const [service, config] of Object.entries(agent?.services ?? {})) {
    const route = config?.url ?? config?.handle;
    if (!route) continue;
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_service_${safeKey(service)}`,
      multipass_id: multipassId,
      fragment_type: 'endpoint',
      status: 'pending',
      assurance_level: 'self_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'platform_check',
      observed_at: observedAt,
      reference_url: `https://api.helixa.xyz/api/v2/agent/${encodeURIComponent(tokenId)}`,
      public_value: `${formatLabel(service)} service route published by Helixa API.`,
      endpoint_ref: { endpoint_id: safeKey(service), url: route, protocol: service },
    }));
  }

  for (const standard of extractStandards(agent)) {
    fragments.push(createFragment({
      fragment_id: `frag_live_${tokenId}_standard_${safeKey(standard)}`,
      multipass_id: multipassId,
      fragment_type: 'standard_ref',
      status: 'stale',
      assurance_level: 'issuer_attested',
      transfer_policy: 'pause_on_transfer',
      source_type: 'issuer_attestation',
      observed_at: observedAt,
      reference_url: `https://api.helixa.xyz/api/v2/agent/${encodeURIComponent(tokenId)}`,
      public_value: `${standard} appears in public Helixa traits or metadata and needs a fresh adapter check before stronger claims.`,
    }));
  }

  return fragments;
}

function createFragment({ fragment_id, multipass_id, fragment_type, status, assurance_level, transfer_policy, source_type, observed_at, reference_url, public_value, endpoint_ref = undefined }) {
  return {
    schema_version: '0.1.0',
    fragment_id,
    multipass_id,
    fragment_type,
    status,
    assurance_level,
    visibility: 'public',
    transfer_policy,
    source: { source_type, source_id: fragment_id, issuer: 'Helixa', observed_at, reference_url },
    public_value,
    proof_reference: reference_url,
    created_at: observed_at,
    updated_at: observed_at,
    ...(status === 'verified' ? { verified_at: observed_at } : {}),
    ...(endpoint_ref ? { endpoint_ref } : {}),
  };
}

function createLiveOwnerSnapshot(agent) {
  return {
    owner: shortAddress(agent?.owner) ?? 'Owner not published',
    operator: shortAddress(agent?.operator) ?? 'Not delegated',
    custodyEpoch: 'Live API observation',
    permissionState: 'Read-only public profile',
    visibility: 'Public profile, private credentials hidden',
    recentChange: 'Live profile fetched',
    reviewAction: 'Review live identity fields',
    note: 'State reference only. Multipass shows ownership, custody, visibility, and review context without executing approvals or transferring authority.',
  };
}

function createLiveChangeLedger(agent) {
  const rows = [
    { event: 'Live profile fetched', source: 'Helixa API', impact: 'Public profile refreshed', reviewState: 'Verified' },
    { event: 'Owner observed', source: 'Helixa API', impact: agent?.owner ? 'Owner field published' : 'Owner not published', reviewState: agent?.owner ? 'Verified' : 'Review required' },
    { event: 'Private credentials hidden', source: 'Private vault', impact: 'No secrets or private credentials exposed', reviewState: 'No public action' },
  ];
  if (hasNumericCred(agent?.credScore)) rows.splice(1, 0, { event: 'Cred imported', source: 'Helixa API', impact: `Cred score ${agent.credScore} displayed as context`, reviewState: 'Verified' });
  if (Object.keys(agent?.services ?? {}).length) rows.push({ event: 'Services reviewed', source: 'Helixa API', impact: 'Public routes shown as references only', reviewState: 'Review required' });
  return rows;
}

function createLiveTransferPreview(agent) {
  return {
    currentOwner: shortAddress(agent?.owner) ?? 'Owner not published',
    custodyEpoch: 'Live API observation',
    claimAction: 'No transfer detected',
    permissionsState: 'Read-only public profile',
    toolAction: 'Reverify tools before active use',
    privateAccessAction: 'Rotate private access on custody change',
    historyState: 'Public history preserved',
    credContinuity: 'Cred continues with ownership-change context if custody changes.',
    note: 'Transfer state preview preserves public history but does not transfer secrets, private credentials, or active authority.',
  };
}

function createLiveAgentCardDocument(agent, tokenId, profileUrl) {
  return {
    schema_version: '0.1.0',
    agent_id: `${HELIXA_CHAIN_ID}:${tokenId}`,
    name: agent?.name ?? `Agent #${tokenId}`,
    capabilities: [...(agent?.skills ?? []), ...(agent?.domains ?? [])].map((name) => ({ name })),
    service_endpoints: Object.entries(agent?.services ?? {}).map(([id, config]) => ({ endpoint_id: safeKey(id), url: config?.url ?? config?.handle ?? profileUrl, protocol: id })),
    trust_summary: { identity_status: agent?.verified ? 'verified' : 'pending', assurance_level: agent?.verified ? 'onchain_verified' : 'platform_verified', cred_score: hasNumericCred(agent?.credScore) ? agent.credScore : null },
    profile_url: profileUrl,
  };
}

function formatCredTier(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'Unrated';
  if (value >= 80) return 'Preferred';
  if (value >= 65) return 'Prime';
  if (value >= 50) return 'Qualified';
  if (value >= 30) return 'Marginal';
  return 'Junk';
}

function hasNumericCred(score) {
  return Number.isFinite(Number(score));
}

function shortAddress(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(address ?? ''))) return null;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function extractStandards(agent) {
  const candidates = [...(agent?.traits ?? []), ...(agent?.skills ?? []), ...(agent?.domains ?? [])]
    .map((item) => typeof item === 'string' ? item : item?.name)
    .filter(Boolean);
  return [...new Set(candidates.filter((value) => /^ERC-\d+/i.test(value)).map((value) => value.toUpperCase()))];
}

function normalizeAcceptedPayments(agent) {
  return [...new Set([...(agent?.metadata?.acceptedPayments ?? []), agent?.linkedToken?.symbol].filter(Boolean).map((asset) => String(asset).toLowerCase()))];
}

function compact(items) {
  return items.filter(Boolean);
}

function safeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function formatLabel(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/\w/g, (letter) => letter.toUpperCase());
}
```

Do not include private-looking keys from the raw API response in any returned JSON. Since the mapper builds output from allowlisted fields, the safest path is to never spread `agent` into output.

- [ ] **Step 5: Run mapper tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS for parser, fetcher, and mapper tests.

- [ ] **Step 6: Commit mapper**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs apps/web/test/fixtures/helixa-agent-1.json
git commit -m "Map Helixa agents into Multipass records"
```

### Task 4: Add high-level live loader

**Files:**
- Modify: `apps/web/src/live-helixa-resolver.js`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`

- [ ] **Step 1: Write coordinator tests**

Add tests like:

```js
import { loadLiveHelixaMultipass } from '../src/live-helixa-resolver.js';

test('loadLiveHelixaMultipass parses fetches and maps live agent data', async () => {
  const calls = [];
  const data = await loadLiveHelixaMultipass('8453:1', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify(await bendrFixture()) };
  });

  assert.equal(calls[0].url, 'https://api.helixa.xyz/api/v2/agent/1');
  assert.equal(data.profile.display_name, 'Bendr 2.0');
  assert.equal(data.resolver?.canonicalId, '8453:1');
});

test('loadLiveHelixaMultipass rejects invalid input before fetch', async () => {
  let called = false;
  await assert.rejects(
    () => loadLiveHelixaMultipass('Bendr', async () => { called = true; }),
    (error) => error instanceof HelixaResolverError && error.code === 'invalid_format',
  );
  assert.equal(called, false);
});

test('loadLiveHelixaMultipass rejects unsupported chains before fetch', async () => {
  let called = false;
  await assert.rejects(
    () => loadLiveHelixaMultipass('1:1', async () => { called = true; }),
    (error) => error instanceof HelixaResolverError && error.code === 'unsupported_chain',
  );
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run coordinator tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: FAIL because `loadLiveHelixaMultipass` is missing.

- [ ] **Step 3: Implement coordinator**

Add:

```js
export async function loadLiveHelixaMultipass(input, fetchImpl = fetch) {
  const parsed = parseHelixaResolverInput(input);
  const agent = await fetchHelixaAgent(parsed.tokenId, fetchImpl);
  return {
    ...mapHelixaAgentToMultipassDemo(agent),
    resolver: parsed,
  };
}
```

- [ ] **Step 4: Run all resolver adapter tests**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/live-helixa-resolver.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit coordinator**

```bash
git add apps/web/src/live-helixa-resolver.js apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Add live Helixa Multipass loader"
```

---

## Chunk 2: Resolver UI

### Task 5: Add resolver UI render and static note override

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write UI render tests**

Add tests like:

```js
test('resolver bar renders without changing default static data', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => sampleData() }).start();

  const resolver = root.querySelector('.live-resolver');
  assert.ok(resolver);
  assert.match(resolver.textContent, /Resolve live Helixa agent/);
  assert.match(resolver.textContent, /Try 1 or 8453:1/);
  assert.match(resolver.textContent, /Name and slug search is coming later/);
  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /local API/);
});

test('render uses live hero note when data supplies one', async () => {
  const data = { ...sampleData(), heroNote: 'Read-only live Helixa API data for Bendr 2.0.', sourceLabel: 'live Helixa API' };
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({ root, loadDemo: async () => data }).start();

  assert.match(root.textContent, /Read-only live Helixa API data for Bendr 2\.0/);
  assert.doesNotMatch(root.textContent, /public fixture data/);
});
```

- [ ] **Step 2: Run UI render tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: FAIL because resolver UI and hero note override are missing.

- [ ] **Step 3: Implement static resolver render**

In `apps/web/src/app.js`:

- Import `loadLiveHelixaMultipass` and `HelixaResolverError` from `./live-helixa-resolver.js`.
- Expand state to include:

```js
let state = {
  expandedCard: null,
  selectedAgentCard: 0,
  resolverInput: '',
  resolverStatus: null,
  resolverError: null,
  resolverRequestId: 0,
  resolverInFlightInput: null,
  retryUntil: 0,
};
```

- Render resolver markup before the agent carousel:

```js
${renderLiveResolver(state)}
```

- Add `renderLiveResolver(state)` returning:

```js
function renderLiveResolver(state) {
  return `
    <section class="live-resolver" aria-label="Resolve live Helixa agent">
      <form data-action="resolve-live-agent">
        <div>
          <p class="card-label">Resolve live Helixa agent</p>
          <h2>Read a live AgentDNA record.</h2>
          <p>Try <code>1</code> or <code>8453:1</code>. Name and slug search is coming later.</p>
        </div>
        <label>
          <span>Helixa ID</span>
          <input name="agent" value="${escapeAttribute(state.resolverInput ?? '')}" placeholder="1 or 8453:1" autocomplete="off" />
        </label>
        <button type="submit" ${isRetryBlocked(state) ? 'disabled' : ''}>${state.resolverStatus === 'loading' ? 'Resolving...' : 'Resolve'}</button>
        <button type="button" data-action="reset-static-demo">Static demo</button>
      </form>
      ${state.resolverError ? `<p class="resolver-message error">${escapeHtml(state.resolverError)}</p>` : ''}
      ${state.retryMessage ? `<p class="resolver-message error">${escapeHtml(state.retryMessage)}</p>` : ''}
      ${state.resolverStatus === 'loaded' ? '<p class="resolver-message">Live Helixa API data loaded. Display only, no approvals or authority changes.</p>' : ''}
    </section>
  `;
}
```

- Add `escapeAttribute(value)` that calls `escapeHtml(value).replace(/"/g, '&quot;')` or equivalent.
- Add `isRetryBlocked(state)` that returns `state.retryUntil > Date.now()`.
- Do not disable the submit button merely because `resolverStatus === 'loading'`; the duplicate guard should ignore exact duplicate submits while still allowing changed input to supersede an older request.
- Change hero note render from `${HERO_COPY.note}` to `${escapeHtml(data.heroNote ?? HERO_COPY.note)}`.

- [ ] **Step 4: Add resolver styles**

In `apps/web/src/styles.css`, add compact warm styles:

```css
.live-resolver {
  margin: 28px 0;
  border: 1px solid var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  padding: 22px;
}

.live-resolver form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 260px) auto auto;
  gap: 14px;
  align-items: end;
}

.live-resolver h2 { margin-bottom: 8px; }
.live-resolver p { margin-bottom: 0; color: var(--muted); line-height: 1.5; }
.live-resolver label span { display: block; margin-bottom: 8px; color: var(--muted); font-size: 11px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
.live-resolver input { width: 100%; border: 1px solid var(--line); background: var(--paper-soft); color: var(--ink); padding: 12px; font: inherit; }
.live-resolver button { border: 1px solid var(--ink); background: var(--ink); color: var(--paper); padding: 12px 14px; font-weight: 900; }
.live-resolver button[type="button"] { background: var(--paper); color: var(--ink); }
.live-resolver button:disabled { opacity: 0.55; cursor: not-allowed; }
.resolver-message { margin: 14px 0 0; color: var(--green); font-weight: 800; }
.resolver-message.error { color: #8a3a28; }
```

Add a responsive rule inside the existing `@media (max-width: 900px)` block:

```css
.live-resolver form { grid-template-columns: 1fr; }
```

- [ ] **Step 5: Run UI render tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: PASS for existing tests plus new render tests.

- [ ] **Step 6: Commit resolver render**

```bash
git add apps/web/src/app.js apps/web/src/styles.css apps/web/test/app.test.mjs
git commit -m "Add Multipass live resolver UI"
```

### Task 6: Wire manual resolver submit and static reset

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write manual resolve tests**

Add tests like:

```js
test('resolver submit loads live data and updates source label', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver', heroNote: 'Read-only live Helixa API data for Live Bendr.' };
  const calls = [];
  const app = createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); return liveData; },
  });

  await app.start();
  root.querySelector('.live-resolver input').value = '8453:1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['8453:1']);
  assert.match(root.textContent, /Live Bendr/);
  assert.match(root.textContent, /live Helixa API/);
  assert.match(root.textContent, /Live Helixa API data loaded/);
});

test('static demo button restores bundled fixture after live resolve', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const liveData = { ...sampleData(), profile: { ...sampleData().profile, display_name: 'Live Bendr' }, sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver' };
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => liveData }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  root.querySelector('[data-action="reset-static-demo"]').click();

  assert.match(root.textContent, /Bendr 2\.0/);
  assert.match(root.textContent, /local API/);
});


test('static demo reset invalidates an in-flight live resolver response', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolveLive;
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => new Promise((resolve) => { resolveLive = resolve; }),
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="reset-static-demo"]').click();
  resolveLive({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Late Live Bendr' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();

  assert.doesNotMatch(root.textContent, /Late Live Bendr/);
  assert.match(root.textContent, /local API/);
});
```

- [ ] **Step 2: Run manual resolve tests and verify they fail**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: FAIL because submit/reset handlers are not wired.

- [ ] **Step 3: Implement injected live loader and event handlers**

In `createApp`, accept new dependencies:

```js
export function createApp({ root, loadDemo = defaultLoadDemo, loadLiveDemo = loadLiveHelixaMultipass }) {
```

Store initial static data after `loadDemo()`:

```js
const data = await loadDemo();
state = { ...state, data, staticData: data };
```

Add `resolveLiveAgent(input)` inside `createApp`:

```js
async function resolveLiveAgent(input) {
  const trimmed = input.trim();
  state = { ...state, resolverInput: input, resolverStatus: 'loading', resolverError: null, retryMessage: null, resolverInFlightInput: trimmed, resolverRequestId: state.resolverRequestId + 1 };
  const requestId = state.resolverRequestId;
  render(root, state);

  try {
    const liveData = await loadLiveDemo(trimmed);
    if (requestId !== state.resolverRequestId) return;
    state = { ...state, data: liveData, resolverStatus: 'loaded', resolverError: null, retryUntil: 0, retryMessage: null, selectedAgentCard: 0, expandedCard: null, resolverInFlightInput: null };
    render(root, state);
  } catch (error) {
    if (requestId !== state.resolverRequestId) return;
    const retryState = retryStateFromError(error);
    state = { ...state, resolverStatus: 'error', resolverError: userResolverMessage(error), resolverInFlightInput: null, retryUntil: retryState.retryUntil, retryMessage: retryState.retryMessage };
    render(root, state);
  }
}
```

Add `resetStaticDemo()`:

```js
function resetStaticDemo() {
  state = { ...state, data: state.staticData, selectedAgentCard: 0, expandedCard: null, resolverInput: '', resolverStatus: null, resolverError: null, resolverInFlightInput: null, resolverRequestId: state.resolverRequestId + 1, retryUntil: 0, retryMessage: null };
  render(root, state);
}
```

Add event listeners after the existing card/json listeners:

```js
root.querySelector('[data-action="resolve-live-agent"]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.agent?.value ?? '';
  if (isRetryBlocked(state)) return;
  if (state.resolverStatus === 'loading' && input.trim() === state.resolverInFlightInput) return;
  resolveLiveAgent(input);
});

root.querySelector('[data-action="reset-static-demo"]')?.addEventListener('click', resetStaticDemo);
```

Implement `userResolverMessage(error)`:

```js
function userResolverMessage(error) {
  if (error instanceof HelixaResolverError) return error.message;
  return 'Could not reach the Helixa API. Static demo is still available.';
}
```

Implement `retryStateFromError(error, nowMs = Date.now())` so 429 responses with numeric `details.retryAfter` return both `retryUntil` and a user message like `Try again in 12 seconds.`. Store both values in state during the catch path.

- [ ] **Step 4: Run manual resolve tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: PASS for manual resolve and reset.

- [ ] **Step 5: Commit manual resolver behavior**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "Wire Multipass live resolver submit"
```

### Task 7: Add validation errors, duplicate-submit guard, stale response guard, and auto-resolve query

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write error and concurrency UI tests**

Import `HelixaResolverError` in `apps/web/test/app.test.mjs` for typed injected failures, then add tests like:

```js
test('resolver invalid input shows validation error and keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); },
  }).start();

  root.querySelector('.live-resolver input').value = 'Bendr';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Use a token ID like 1 or a Helixa ID like 8453:1/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('resolver unsupported chain shows Base-only error and keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('unsupported_chain', 'V0 supports Base Helixa AgentDNA records only.'); },
  }).start();

  root.querySelector('.live-resolver input').value = '1:1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /V0 supports Base Helixa AgentDNA records only/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('resolver API error keeps static data available', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('not_found', 'No Helixa agent found for that ID.'); },
  }).start();

  root.querySelector('.live-resolver input').value = '999999';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /No Helixa agent found for that ID/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('resolver rate limit disables retry during Retry-After window', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async () => { throw new HelixaResolverError('rate_limited', 'Helixa API is rate-limiting requests. Try again shortly.', { retryAfter: '12' }); },
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(root.querySelector('.live-resolver button[type="submit"]').disabled, true);
  assert.match(root.textContent, /Try again in 12 seconds/);
});

test('resolver disables duplicate submit while matching request is in flight', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  let resolveLive;
  let calls = 0;
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async () => { calls += 1; return new Promise((resolve) => { resolveLive = resolve; }); } }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(calls, 1);
  assert.equal(root.querySelector('.live-resolver button[type="submit"]').textContent, 'Resolving...');

  resolveLive(sampleData());
  await Promise.resolve();
  await Promise.resolve();
});


test('changed input can supersede an older in-flight resolver request through the real UI', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const calls = [];
  const resolvers = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => new Promise((resolve) => { calls.push(input); resolvers.push(resolve); }),
  }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(root.querySelector('.live-resolver button[type="submit"]').disabled, false);
  root.querySelector('.live-resolver input').value = '81';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, ['1', '81']);
  resolvers[1]({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Quigbot Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();
  assert.match(root.textContent, /Quigbot Live/);
});

test('newer resolver response supersedes older response', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const resolvers = [];
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async (input) => new Promise((resolve) => resolvers.push({ input, resolve })) }).start();

  root.querySelector('.live-resolver input').value = '1';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('.live-resolver input').value = '81';
  root.querySelector('.live-resolver form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  resolvers[1].resolve({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Quigbot Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();
  resolvers[0].resolve({ ...sampleData(), profile: { ...sampleData().profile, display_name: 'Old Bendr Live' }, sourceLabel: 'live Helixa API' });
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.textContent, /Quigbot Live/);
  assert.doesNotMatch(root.textContent, /Old Bendr Live/);
});

test('agent query auto-resolves live record after static load', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=8453:1');
  const calls = [];
  await createApp({ root, loadDemo: async () => sampleData(), loadLiveDemo: async (input) => { calls.push(input); return { ...sampleData(), sourceLabel: 'live Helixa API', modeLabel: 'Live Resolver' }; } }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['8453:1']);
  assert.match(root.textContent, /live Helixa API/);
});


test('empty agent query shows the same empty-input validation error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); throw new HelixaResolverError('empty_input', 'Enter a Helixa token ID or Helixa ID.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['']);
  assert.match(root.textContent, /Enter a Helixa token ID or Helixa ID/);
  assert.match(root.textContent, /Bendr 2\.0/);
});

test('invalid agent query shows the same format validation error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/?agent=Bendr');
  const calls = [];
  await createApp({
    root,
    loadDemo: async () => sampleData(),
    loadLiveDemo: async (input) => { calls.push(input); throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); },
  }).start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['Bendr']);
  assert.match(root.textContent, /Use a token ID like 1 or a Helixa ID like 8453:1/);
});
```

If the first invalid-input test can be more precise by importing `HelixaResolverError` and making the injected `loadLiveDemo` throw it, do that instead:

```js
loadLiveDemo: async () => { throw new HelixaResolverError('invalid_format', 'Use a token ID like 1 or a Helixa ID like 8453:1.'); }
```

- [ ] **Step 2: Run tests and verify they fail where behavior is missing**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: FAIL for auto-resolve and any missing guard behavior.

- [ ] **Step 3: Implement duplicate, retry, reset, and stale guards completely**

Update submit listener so exact duplicate in-flight submissions return before calling `resolveLiveAgent`. Ensure different input during in-flight increments `resolverRequestId` and can supersede old response.

Also implement the 429 retry window:

```js
function retryStateFromError(error, nowMs = Date.now()) {
  if (!(error instanceof HelixaResolverError) || error.code !== 'rate_limited') return { retryUntil: 0, retryMessage: null };
  const seconds = Number(error.details?.retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0) return { retryUntil: 0, retryMessage: null };
  return { retryUntil: nowMs + seconds * 1000, retryMessage: `Try again in ${seconds} seconds.` };
}
```

Use `state.retryUntil > Date.now()` to disable the submit button and to ignore submits while the retry window is active. Render `state.retryMessage` next to the rate-limit error when present. Do not use loading state as the disabled condition; loading should change the button label, while submit handling decides whether the current input is an exact duplicate or a superseding request.

Static reset must increment `resolverRequestId`, clear `retryUntil`, and clear `retryMessage` so a late live response cannot overwrite the restored static demo.

- [ ] **Step 4: Implement query auto-resolve**

In `start()` after rendering static data:

```js
const queryInput = getResolverQueryInput();
if (queryInput !== null) await resolveLiveAgent(queryInput);
```

Add:

```js
function getResolverQueryInput() {
  if (typeof window === 'undefined') return null;
  const locationUrl = new URL(window.location.href);
  return locationUrl.searchParams.get('agent');
}
```

Do not auto-resolve `?api=`. The existing static behavior must remain unchanged unless `agent` is present.

- [ ] **Step 5: Run app tests and verify they pass**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit resolver guard and query behavior**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs
git commit -m "Add live resolver query and request guards"
```

---

## Chunk 3: Verification and Deployment

### Task 8: Add wording and static route regression coverage if needed

**Files:**
- Inspect: `apps/web/test/wording.test.mjs`
- Modify only if needed: `apps/web/test/wording.test.mjs`, `apps/web/test/app.test.mjs`, `apps/web/test/live-helixa-resolver.test.mjs`

- [ ] **Step 1: Inspect wording gate coverage**

Run:

```bash
sed -n '1,220p' apps/web/test/wording.test.mjs
```

Expected: wording gate already scans `apps/web/src/*.js`, styles, specs, and relevant docs. If it does not include `apps/web/src/live-helixa-resolver.js`, add it.

- [ ] **Step 2: Add static default route regression coverage if missing**

If `apps/web/test/app.test.mjs` does not already prove this after the resolver changes, add a test like:

```js
test('static /multipass/ default uses bundled data without local API fetch', async () => {
  const root = setupDom('https://helixa.xyz/multipass/');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    await createApp({ root }).start();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.some((url) => url.includes('/multipass-api')), false);
  assert.match(root.textContent, /Static Demo|bundled fixture/);
  assert.match(root.textContent, /Resolve live Helixa agent/);
});
```

Expected: the deployed route remains static by default and does not make a local `/multipass-api` request unless a non-static route or explicit API override is used.

- [ ] **Step 3: Add explicit blocked-copy assertions if missing**

If needed, add assertions that source and rendered UI do not contain:

- travel-document metaphor wording
- split spelling of Multipass
- sixth/top-tier trust wording
- reputation-purchase phrasing
- em dash character
- emoji
- executable-control copy like `Approve now`, `Transfer now`, `Claim now`, `Pay now`, `Release credentials`

- [ ] **Step 4: Run wording and resolver tests**

Run:

```bash
pnpm --filter @helixa/multipass-web test -- apps/web/test/wording.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit any wording or route regression updates**

If files changed:

```bash
git add apps/web/test/wording.test.mjs apps/web/test/app.test.mjs apps/web/test/live-helixa-resolver.test.mjs
git commit -m "Tighten live resolver regression coverage"
```

If no changes, do not create an empty commit.


### Task 9: Full verification in Multipass repo

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: all tests pass. Record the final test count.

- [ ] **Step 2: Run static deployment build**

Run:

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: Vite build succeeds and emits `apps/web/dist` assets.

- [ ] **Step 3: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Run custom wording gate**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const files = [
  'apps/web/src/content.js',
  'apps/web/src/app.js',
  'apps/web/src/api.js',
  'apps/web/src/live-helixa-resolver.js',
  'apps/web/src/static-demo-data.js',
  'apps/web/src/styles.css',
  'apps/web/test/app.test.mjs',
  'apps/web/test/content.test.mjs',
  'apps/web/test/live-helixa-resolver.test.mjs',
  'docs/superpowers/specs/2026-06-25-multipass-live-resolver-design.md',
  'docs/superpowers/plans/2026-06-25-multipass-live-resolver.md',
];
const banned = ['pass' + 'port','Multi' + ' Pass','.agent','Legend' + 'ary','buy reput' + 'ation','purchase reput' + 'ation','on-' + 'chain','Approve now','Transfer now','Pay now','Release credentials'];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const term of banned) {
    if (text.includes(term)) throw new Error(`${file} contains ${term}`);
  }
  if (text.includes(String.fromCharCode(8212))) throw new Error(`${file} contains em dash`);
  if (/[\u{1F300}-\u{1FAFF}]/u.test(text)) throw new Error(`${file} contains emoji`);
}
console.log('wording gate passed');
NODE
```

Expected: `wording gate passed`.

- [ ] **Step 5: Live API smoke check**

Run:

```bash
curl -fsSI https://api.helixa.xyz/api/v2/agent/1 | sed -n '1,30p'
curl -fsSL https://api.helixa.xyz/api/v2/agent/1 | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const j=JSON.parse(s); if(j.tokenId!==1 || j.name!=='Bendr 2.0') process.exit(1); console.log(`${j.name} ${j.tokenId}`)})"
```

Expected: headers include `HTTP/1.1 200 OK` and `Access-Control-Allow-Origin: *`; JSON check prints `Bendr 2.0 1`.

- [ ] **Step 6: Commit final verification-only updates if any**

If verification required small fixes, commit them. Otherwise no commit.

### Task 10: Push Multipass and deploy Helixa artifact

**Files:**
- Multipass repo: push current branch to `origin main`.
- Helixa repo: update `docs/multipass/` built assets only.
- Live folder: `/var/www/helixa.xyz/multipass/`.

- [ ] **Step 1: Push Multipass work**

Run from Multipass worktree:

```bash
git status --short --branch
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

Expected: push succeeds. If `merge-base` fails, stop and rebase/merge carefully before pushing.

- [ ] **Step 2: Copy built web artifact into Helixa repo**

Run:

```bash
rsync -a --delete /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-change-review-ledger/apps/web/dist/ /home/ubuntu/helixa/docs/multipass/
```

- [ ] **Step 3: Inspect Helixa diff**

Run:

```bash
git -C /home/ubuntu/helixa status --short --branch
git -C /home/ubuntu/helixa diff --stat -- docs/multipass
```

Expected: only `docs/multipass/index.html` and hashed assets under `docs/multipass/assets` change. Existing unrelated dirt such as `.gitmodules` and `foundry.lock` must remain untouched.

- [ ] **Step 4: Commit and push Helixa artifact**

Run:

```bash
cd /home/ubuntu/helixa
git add docs/multipass/index.html docs/multipass/assets
git commit -m "Add Multipass live resolver"
git push
```

Expected: commit and push succeed.

- [ ] **Step 5: Deploy live folder**

Run:

```bash
rsync -a --delete /home/ubuntu/helixa/docs/multipass/ /var/www/helixa.xyz/multipass/
```

Expected: live folder contains current `index.html` and current hashed JS/CSS assets.

### Task 11: Live smoke and evidence

**Files:**
- No source changes expected.

- [ ] **Step 1: Static route HTTP and asset smoke**

Run:

```bash
set -euo pipefail
url='https://helixa.xyz/multipass/'
html=$(mktemp)
headers=$(mktemp)
curl -fsSL -D "$headers" "$url" -o "$html"
printf 'HTTP status: '; awk 'tolower($0) ~ /^http\// {code=$2} END {print code}' "$headers"
asset_js=$(grep -o 'assets/[^" ]*\.js' "$html" | head -1)
asset_css=$(grep -o 'assets/[^" ]*\.css' "$html" | head -1)
echo "JS asset: $asset_js"
echo "CSS asset: $asset_css"
curl -fsSI "https://helixa.xyz/multipass/$asset_js" | awk 'tolower($0) ~ /^http\// {code=$2} END {print "JS status: " code}'
curl -fsSI "https://helixa.xyz/multipass/$asset_css" | awk 'tolower($0) ~ /^http\// {code=$2} END {print "CSS status: " code}'
curl -fsSL "https://helixa.xyz/multipass/$asset_js" | grep -q 'Resolve live Helixa agent'
echo 'live bundle contains resolver copy'
rm -f "$html" "$headers"
```

Expected: page, JS, and CSS all return 200, and bundle contains resolver copy. This step alone does not prove runtime network behavior; Step 3 covers that when a browser harness is available, and Task 8 covers it with automated DOM regression tests.

- [ ] **Step 2: Live resolver API smoke**

Run:

```bash
curl -fsSL 'https://api.helixa.xyz/api/v2/agent/1' | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const j=JSON.parse(s); if(j.name!=='Bendr 2.0'||j.tokenId!==1) process.exit(1); console.log('live resolver source ok')})"
```

Expected: `live resolver source ok`.

- [ ] **Step 3: Runtime network smoke for static default**

If Playwright, Puppeteer, or another real browser harness is available, run a browser smoke that observes network requests:

- Open `https://helixa.xyz/multipass/`.
- Capture all request URLs while the page loads.
- Assert no request URL contains `/multipass-api`.
- Confirm static demo content renders before any resolver input.
- Enter `8453:1`.
- Submit resolver.
- Confirm source label shows `live Helixa API`.
- Confirm `Bendr 2.0`, `8453:1`, `Cred 80`, `Owner & Custody Snapshot`, `Change + Review Ledger`, `Transfer State Preview`, and `No live receipt attached` are visible.
- Confirm unsupported input such as `1:1` shows Base-only error.
- Confirm no default UI shows raw private fields or executable controls.

If no browser harness is available, state that limitation clearly in the final report and cite the DOM-level regression from Task 8 plus the HTTP/API smoke from Steps 1 and 2. Do not claim a browser-level no-`/multipass-api` smoke was run if it was not.

- [ ] **Step 4: Final status capture**

Run:

```bash
printf 'multipass: '; git -C /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-change-review-ledger status --short --branch
printf 'helixa: '; git -C /home/ubuntu/helixa status --short --branch
printf '\nlatest multipass: '; git -C /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-change-review-ledger log --oneline -1
printf 'latest helixa: '; git -C /home/ubuntu/helixa log --oneline -1
```

Expected: Multipass clean and tracking `origin/main`; Helixa may still show unrelated `.gitmodules` and `foundry.lock` only. Record final commit hashes.

- [ ] **Step 5: Update memory**

Append a concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-25.md` with:

- Multipass commit hash.
- Helixa artifact commit hash.
- What changed.
- Verification commands and counts.
- Live smoke result.
- Any unrelated dirt left untouched.

---

## Handoff Notes

- Static `/multipass/` must remain static by default. Do not accidentally revive default `/multipass-api` calls on the deployed route.
- The resolver is read-only. Avoid controls or language that looks like approval, claim, transfer, payment, or credential release.
- Keep token IDs string-safe from parser through API URL construction.
- Do not implement name, handle, slug, or fuzzy search in this slice.
- Do not spread raw Helixa API objects into rendered JSON. Build a normalized output from allowlisted public fields.
- If implementation needs a simpler mapper than the example code, keep the same external behavior and tests. YAGNI beats cleverness.

# Multipass V0 Tightening and Profile Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-center Multipass around portable agent trust profiles while preserving live Helixa Aura/provenance work, then harden Bendr profile fallback so lore/personality do not disappear under bounded read failures.

**Architecture:** Multipass web changes stay in the existing renderer/data mapper/test structure. API hardening should be applied from a clean Helixa clone or branch and should prefer bounded reads plus safe public fallback over unbounded slow calls. Deployment should use clean artifacts and avoid dirty live checkouts.

**Tech Stack:** Vite/vanilla JS, Node test runner, jsdom, pnpm, Express API, ethers v6, GitHub Pages-style static artifact under Helixa `docs/multipass`.

---

## Chunk 1: Multipass V0 tightening

### Task 1: Add failing copy and safety tests

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/live-helixa-resolver.test.mjs`
- Modify: `apps/web/test/wording.test.mjs`

- [ ] **Step 1: Add app render expectations for trust-profile framing**

Add assertions that rendered live pages include:

```js
assert.match(root.textContent, /portable agent trust profile/i);
assert.match(root.textContent, /display-only provenance/i);
assert.match(root.textContent, /marketplace compatibility/i);
assert.doesNotMatch(root.textContent, /marketplace listing preview/i);
```

Also assert fragment cards include a source field:

```js
const fragmentCard = root.querySelector('.fragment-card');
assert.match(fragmentCard.textContent, /Source/i);
```

- [ ] **Step 2: Add live mapper expectations**

In resolver tests, expect live profile copy to prefer trust-profile framing:

```js
assert.equal(data.liveProfilePage.prototypeLabel, 'Live trust profile');
assert.match(data.liveProfilePage.audience, /agent builders/i);
assert.match(data.liveProfilePage.body, /portable agent trust profile/i);
assert.match(data.marketplaceListing.title, /Trust profile/i);
assert.match(data.marketplaceListing.summary, /marketplace compatibility/i);
```

- [ ] **Step 3: Tighten wording gate**

Add disallowed overclaim/action phrases:

```js
/Marketplace listing preview/i
/instant approval/i
/instant transfer/i
/claim now/i
/transfer now/i
/approve now/i
/unlock secrets/i
```

Allow `marketplace compatibility` and `marketplace display` as secondary context.

- [ ] **Step 4: Run tests and verify red**

Run:

```bash
pnpm test
```

Expected: FAIL on missing trust-profile copy/source field and old marketplace preview labels.

### Task 2: Update Multipass app copy and fragment scan model

**Files:**
- Modify: `apps/web/src/content.js`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/live-helixa-resolver.js`

- [ ] **Step 1: Update content framing**

Prefer the product sentence:

```text
Multipass is a portable trust profile for agents, combining identity, public proof, standards support, custody context, and access receipts into one inspectable record.
```

Move marketplaces to secondary language:

```text
Marketplace compatibility is one use case; the record remains a read-only trust profile.
```

- [ ] **Step 2: Rename live profile labels in `live-helixa-resolver.js`**

Change live profile fields:

```js
modeLabel: 'Live Trust Profile'
prototypeLabel: 'Live trust profile'
audience: 'Public trust, route, custody, and proof context for agent builders, directories, and marketplace compatibility.'
body: `Portable agent trust profile for ${displayName} with public identity, custody context, routes, and proof inspection.`
recordIntro: 'Live AgentDNA trust profile assembled from public Helixa API signals. Display only; authority and private credentials stay protected.'
```

- [ ] **Step 3: Soften marketplace listing model copy**

Keep function names for minimal churn, but change UI-facing copy:

```js
title: `${displayName} trust profile`
subtitle: 'Marketplace compatibility context'
summary: 'Read-only public AgentDNA trust profile prepared for directories, builders, and marketplace display.'
safetyNote: 'Display only. Marketplace compatibility does not execute listings, authority changes, payments, or credential release.'
```

- [ ] **Step 4: Update renderer labels**

In `renderMarketplaceListing`, change:

```html
<p class="card-label">Trust profile context</p>
<section class="marketplace-listing" aria-label="Trust profile marketplace compatibility context">
```

In `renderAgentAura`, change aria label to:

```text
Agent Aura visual for trust profile
```

- [ ] **Step 5: Add Source to fragment cards**

In `createFragmentTrustMap` or card normalization, derive source label from `fragment.source.source_type` and `fragment.source.issuer`.

Render it in `renderFragmentCard` after Transfer:

```html
<div><dt>Source</dt><dd>${escapeHtml(card.sourceLabel)}</dd></div>
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
pnpm test -- apps/web/test/app.test.mjs apps/web/test/live-helixa-resolver.test.mjs apps/web/test/wording.test.mjs
```

Expected: PASS.

### Task 3: Update docs for accepted resolver/Aura reality

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/v0-scope.md`
- Modify: `docs/superpowers/specs/2026-06-24-multipass-v0-product-slice-design.md`

- [ ] **Step 1: Add V0 note for limited live Helixa resolver**

Document token ID, canonical `8453:<tokenId>`, and limited name/handle lookup. Explicitly say this is not broad search/ranking.

- [ ] **Step 2: Add Aura provenance note**

Document source:

```text
https://api.helixa.xyz/api/v2/aura/{tokenId}.png
```

Say it is display-only public visual provenance, not ownership authority or private credential proof.

- [ ] **Step 3: Add marketplace compatibility boundary**

State marketplace display is compatibility context, not native marketplace launch or automated listing controls.

### Task 4: Verify and commit Multipass tightening

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
git diff --check
```

Expected: tests pass, build passes, diff check clean.

- [ ] **Step 2: Commit**

Run:

```bash
git add apps/web/src apps/web/test docs/roadmap.md docs/v0-scope.md docs/superpowers/specs/2026-06-24-multipass-v0-product-slice-design.md docs/superpowers/plans/2026-06-25-multipass-v0-tightening-and-profile-hardening.md
git commit -m "Tighten Multipass V0 trust profile framing"
```

---

## Chunk 2: Bendr profile fallback hardening

### Task 5: Prepare clean Helixa work area

**Files:**
- Work outside dirty live trees. Use a temp clone such as `/tmp/helixa-profile-hardening`.

- [ ] **Step 1: Clone clean remote main**

Run:

```bash
rm -rf /tmp/helixa-profile-hardening
git clone https://github.com/Bendr-20/helixa.git /tmp/helixa-profile-hardening
cd /tmp/helixa-profile-hardening
git checkout main
```

Expected: clean tree at remote main.

### Task 6: Add API formatter/fallback tests

**Files:**
- Create: `api/services/public-agent-format.test.js` or nearest existing API test path
- Modify/Create: helper module only if needed, e.g. `api/services/public-agent-format.js`

- [ ] **Step 1: Extract or add pure helper tests**

Test normalized tuple behavior:

```js
assert.deepEqual(formatNarrativeTuple(['origin', 'mission', 'lore', 'manifesto']), {
  origin: 'origin', mission: 'mission', lore: 'lore', manifesto: 'manifesto'
});
```

Test named-key behavior:

```js
assert.deepEqual(formatNarrativeTuple({ origin: 'origin', mission: 'mission', lore: 'lore', manifesto: 'manifesto' }), {...});
```

Test Bendr fallback:

```js
const agent = mergePublicAgentFallback({ tokenId: 1, narrative: null, personality: null, traits: [] });
assert.equal(agent.narrative.origin.includes('bootstrap script'), true);
assert.equal(agent.personality.autonomyLevel, 9);
assert.equal(agent.traits.some(t => t.name === 'Helixa Lead Agent'), true);
```

- [ ] **Step 2: Run test and verify red**

Run from `api/` or repo root using Node test runner, matching existing test conventions.

Expected: FAIL because helper/fallback does not exist.

### Task 7: Implement bounded fallback helper

**Files:**
- Modify: `api/v2-server.js`
- Optional create: `api/services/public-agent-format.js`

- [ ] **Step 1: Add tuple formatters**

Implement:

```js
function formatPersonalityTuple(value) { ... }
function formatNarrativeTuple(value) { ... }
```

They should read named keys first, then numeric indexes, trim empty all-null objects to null, and preserve numeric risk/autonomy fields.

- [ ] **Step 2: Add tracked public fallback for token #1**

Add public-only Bendr fallback constants near formatter code or helper module:

- narrative: canonical onchain fields
- personality: canonical onchain fields
- traits: safe public core traits

- [ ] **Step 3: Merge fallback only when missing**

Implement:

```js
function mergePublicAgentFallback(agent) {
  if (Number(agent.tokenId) !== 1) return agent;
  return {
    ...agent,
    personality: agent.personality || BENDR_PUBLIC_FALLBACK.personality,
    narrative: agent.narrative || BENDR_PUBLIC_FALLBACK.narrative,
    traits: mergeTraits(agent.traits, BENDR_PUBLIC_FALLBACK.traits),
  };
}
```

- [ ] **Step 4: Use helper in public profile paths**

Apply before returning from `formatAgentPublicFast` and other `/api/v2/agent/:id` formatter paths used by public response/card metadata, without making reads unbounded.

### Task 8: Verify and commit API hardening

- [ ] **Step 1: Run tests**

Run relevant API tests, e.g.:

```bash
cd api
node --test services/*.test.js middleware/*.test.js
```

Expected: PASS.

- [ ] **Step 2: Smoke local helper if full server tests are unavailable**

Run a Node one-liner/import that proves token #1 fallback returns narrative/personality.

- [ ] **Step 3: Commit clean clone**

Run:

```bash
git add api/v2-server.js api/services/public-agent-format.js api/services/public-agent-format.test.js
git commit -m "Harden Bendr public profile fallback"
```

---

## Chunk 3: Deployment and live verification

### Task 9: Deploy Multipass artifact cleanly

**Files:**
- Built artifact: `/home/ubuntu/multipass/apps/web/dist/**`
- Helixa artifact path: `docs/multipass/**`

- [ ] **Step 1: Build Multipass**

Run:

```bash
cd /home/ubuntu/multipass
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

- [ ] **Step 2: Copy to live static path**

Run:

```bash
rsync -a --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

- [ ] **Step 3: Commit artifact from clean Helixa clone**

Use a clean clone of `Bendr-20/helixa`, copy `apps/web/dist` into `docs/multipass`, commit:

```bash
git add docs/multipass
git commit -m "Tighten Multipass V0 trust profile artifact"
git push origin main
```

### Task 10: Deploy API hardening safely

- [ ] **Step 1: Push API hardening commit**

Push clean Helixa branch/main only after confirming it includes current remote main.

- [ ] **Step 2: Apply to live API checkout**

Patch `/home/ubuntu/.openclaw/workspace/agentdna` carefully or pull the clean commit if safe. Do not stage unrelated dirty files.

- [ ] **Step 3: Restart API service if code changed**

Run service restart only if needed and permitted.

### Task 11: Live smoke

- [ ] **Step 1: Multipass smoke**

Run:

```bash
curl -fsS https://helixa.xyz/multipass/ >/tmp/multipass.html
curl -fsS https://helixa.xyz/multipass/?agent=1 >/tmp/multipass-agent1.html
```

Verify bundle contains trust-profile framing and provenance drawer.

- [ ] **Step 2: API smoke**

Run:

```bash
curl -fsS https://api.helixa.xyz/api/v2/agent/1 | node -e '...'
```

Expected: Bendr has 4 narrative fields, 6 personality fields, and core traits.

- [ ] **Step 3: Final memory note**

Append commits, deploy status, and verification evidence to `memory/YYYY-MM-DD.md`.

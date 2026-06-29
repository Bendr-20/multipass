# Multipass Holder Editable Visuals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let claimed Multipass managers control the public profile avatar/visual while preserving safe provenance and preparing NFT-backed visual activation.

**Architecture:** Treat the editable `profile.discovery_profile.avatar_url` as the current public PFP override for saved/claimed Multipass profiles. Keep Helixa aura as the fallback visual and record NFT-based images as public provenance fragments before adding full asset-picker UX. No custody or route authority changes happen from visual edits.

**Tech Stack:** Node 22, `node:test`, Multipass API (`apps/api`), Multipass web (`apps/web`), SQLite saved records, existing manager claim/session flow.

---

## File Structure

- Modify: `apps/web/src/app.js`
  - `createProfileVisualIdentity()` should prefer holder-editable avatar URLs when present.
  - Provenance drawer should explain whether the visual came from manager profile metadata or Helixa aura fallback.
- Modify: `apps/web/test/app.test.mjs` or nearest existing profile-render test file
  - Add regression that a saved profile with `discovery_profile.avatar_url` renders that image instead of the Helixa aura URL.
- Modify: `apps/api/src/saved-records.js`
  - Keep `avatar_url` manager-editable and audit logged. Tighten to public HTTP(S) only if needed.
- Modify: `apps/api/test/claim-manage.test.mjs`
  - Keep coverage that claimed managers can update `avatar_url` and unsafe URLs are rejected.
- Modify: live saved Quigbot record through the existing manager-safe update path or a controlled DB migration script
  - Set Quigbot saved profile avatar to Based Nakamigos #2432 image as temporary Phase 0 seed.
- Optional later create: `apps/api/src/visual-assets.js`
  - Normalize NFT visual references and public image URLs when the asset picker grows beyond a plain URL field.

---

## Chunk 1: Phase 0 - Temporary Nakamigo Visual Override

### Task 1: Make holder avatar URL control the visual card

**Files:**
- Modify: `apps/web/src/app.js`
- Test: `apps/web/test/app.test.mjs` or current profile page test file

- [x] **Step 1: Write the failing test**

Add a saved-profile rendering test with a profile like:

```js
const savedProfile = {
  profile: {
    display_name: 'Quigbot',
    discovery_profile: {
      avatar_url: 'https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432',
      summary: 'Saved profile',
      tags: ['quigbot'],
    },
    cred_summary: { trust_state: 'building' },
  },
  resolver: { tokenId: '81', canonicalId: '8453:81' },
};
```

Assert the rendered aura card image `src` is the Nakamigo URL and does not use `https://api.helixa.xyz/api/v2/aura/81.png`.

- [x] **Step 2: Run the failing test**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "avatar"
```

Expected: FAIL because `createProfileVisualIdentity()` still prefers `selectedAgent.visual.imageUrl` or Helixa aura fallback.

Result: failed red with Quigbot still rendering `https://api.helixa.xyz/api/v2/aura/81.png`.

- [x] **Step 3: Implement the minimal visual override**

In `createProfileVisualIdentity()`:

```js
const managerAvatarUrl = safeHttpsUrl(
  data.profile?.discovery_profile?.avatar_url ?? data.profile?.avatar_url
);
const imageUrl = managerAvatarUrl
  ?? selectedAgent?.visual?.imageUrl
  ?? (/^\d+$/.test(String(tokenId ?? '')) ? `https://api.helixa.xyz/api/v2/aura/${tokenId}.png` : null);
```

Set provenance facts:

```js
{ label: 'Visual source', value: managerAvatarUrl ? 'Manager public avatar URL' : tokenId ? `Helixa aura route for token ${tokenId}` : 'Generated fallback initials' }
```

- [x] **Step 4: Run focused tests**

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "avatar|profile"
```

Expected: PASS.

Result: focused saved-profile avatar regression passed.

- [x] **Step 5: Seed Quigbot saved profile with Nakamigo #2432**

Use the existing public profile manager update path if Quigbot is claimed and a manager session is available. If not, use a small controlled DB script that calls the saved-record store method with Quigbot source-owner wallet context.

Temporary image URL:

```text
https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432
```

NFT provenance:

```text
Base chain ID: 8453
Contract: 0xb3663f1c1b7d7b3ae45c031abd4c3cb13f8ee984
Token ID: 2432
Owner at verification: 0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4
Metadata: https://app.bueno.art/api/contract/Ia3GzhM3pj8XHudcPtJry/chain/8453/metadata/2432
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app.js apps/web/test/app.test.mjs docs/superpowers/plans/2026-06-29-multipass-holder-editable-visuals.md
git commit -m "Use editable avatars for Multipass visuals"
```

---

## Chunk 2: Phase 1 - Polished Holder PFP Control

### Task 2: Make the owner editor language match the product

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing copy/UI test**

Assert the owner editor label says `Profile image URL` or `PFP URL`, not generic `Avatar URL`, and includes helper text that this changes the public visual only.

- [ ] **Step 2: Implement copy and helper text**

Change the edit form label:

```html
<label><span>Profile image URL</span><input name="avatar_url" ... /></label>
<p class="field-help">Updates the public Multipass visual. It does not change custody, tools, credentials, or the source AgentDNA record.</p>
```

- [ ] **Step 3: Verify**

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "profile image|owner dashboard"
```

Expected: PASS.

---

## Chunk 3: Phase 2 - NFT-backed Visual References

### Task 3: Add public NFT visual provenance fragments

**Files:**
- Modify: `apps/api/src/fragment-manager.js`
- Modify: `apps/api/src/saved-records.js`
- Test: `apps/api/test/claim-manage.test.mjs`

- [ ] **Step 1: Write failing API test**

A claimed manager can add a public `collection` or `attestation` fragment describing an NFT-backed visual:

```js
{
  fragment_type: 'collection',
  public_value: 'Based Nakamigos #2432 used as profile visual.',
  proof_reference: 'eip155:8453:0xb3663f1c1b7d7b3ae45c031abd4c3cb13f8ee984:2432'
}
```

- [ ] **Step 2: Implement minimal allowed fragment shape**

Keep it display-only. Do not imply asset custody unless verified by contract read.

- [ ] **Step 3: Verify**

```bash
node --test apps/api/test/claim-manage.test.mjs --test-name-pattern "fragment|visual"
```

Expected: PASS.

---

## Chunk 4: Phase 3 - Asset Picker UX

### Task 4: Add a simple manager visual picker

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing UI test**

For claimed profiles, owner dashboard shows visual options:

- Current profile image URL
- Helixa aura fallback
- NFT image URL input
- Clear override

- [ ] **Step 2: Implement small UX without upload storage**

Use existing `avatar_url` field for save. Do not add uploads yet.

- [ ] **Step 3: Verify**

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "visual picker|profile image"
```

Expected: PASS.

---

## Chunk 5: Phase 4 - Uploads Later, Not Now

### Task 5: Defer uploads until storage policy exists

**Files:**
- Modify: `docs/v0-scope.md`
- Optional create: `docs/specs/multipass-visual-storage.md`

- [ ] **Step 1: Document out-of-scope upload risk**

Explicitly defer arbitrary image upload until moderation, storage limits, MIME validation, and removal policy exist.

- [ ] **Step 2: Verify docs wording**

```bash
grep -RIn "profile image\|avatar_url\|upload" docs apps/api/README.md
```

Expected: docs say URL-based visual edits are in scope; uploads are deferred.

---

## Final Verification

Run:

```bash
node --test apps/api/test/activation-records.test.mjs
node --test apps/api/test/claim-manage.test.mjs
node --test apps/web/test/app.test.mjs
pnpm test
MULTIPASS_BASE=/multipass/ pnpm web:build
git diff --check
```

Expected:

- All tests pass.
- Build succeeds.
- No private manager data leaks into public profile JSON.
- Public visual uses `discovery_profile.avatar_url` when present.
- Helixa aura remains fallback.
- Visual edits remain display-only and cannot imply custody or route authority.

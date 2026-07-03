# Helixa AgentDNA Hybrid Activation Design

## Summary

Turn Helixa AgentDNA activation into an intentional hybrid flow:

1. Public lookup stays read-through and never creates records.
2. The user clicks **Activate Multipass** to create or resolve a stable saved profile.
3. The saved profile starts unclaimed.
4. The UI immediately guides the source owner into the existing claim-management flow.
5. Owner-only controls remain hidden until claim verification succeeds.

This keeps the product story clear: viewing an agent does not mutate state, activation is explicit, and management authority is separate from public identity display.

## Current State

The backend already has most primitives:

- `POST /api/multipass/activate` previews a Helixa AgentDNA activation without saving.
- `POST /api/multipass` saves an activated Helixa AgentDNA record through `activationService` and `savedRecords.saveActivatedRecord()`.
- Saved records are idempotent by source identity.
- Saved profile claim routes already support owner wallet proof and manual review.
- Canonical hydrated reads now return saved profiles, activation previews, tools, route metadata, and activation state.

The product gap is naming and flow. The web UI still exposes the old **Save Multipass** panel after live lookup. It should become a first-class activation step with claim guidance.

## Goals

- Replace the user-facing **Save Multipass** concept with **Activate Multipass** for Helixa AgentDNA source records.
- Keep all source lookup and `?agent=` page views non-mutating.
- On activation, create or resolve one stable saved Multipass profile.
- Preserve idempotency: activating the same Helixa AgentDNA source returns the existing saved profile instead of duplicating records.
- After activation, guide the user toward **Claim management**.
- Keep owner-only controls hidden until source-owner wallet verification or manual review approval succeeds.
- Make the saved result clearly unclaimed until claim verification completes.
- Keep this slice Helixa AgentDNA-only.

## Non-Goals

- No ERC-8004 activation writes in this slice.
- No Agent NFT or Agent Aura activation writes in this slice.
- No onchain writes.
- No OpenSea writes.
- No x402 payments or paid external calls.
- No client-side authority shortcuts.
- No claim verification changes unless a small copy or routing adjustment is required.
- No automatic activation during lookup, prefetch, share rendering, or bot crawling.

## Product Language

Use these public terms:

- **Activate Multipass** for the explicit create/save action.
- **Activation Preview** for read-through unsaved lookup state.
- **Activated Multipass** for a stable saved profile created from a source record.
- **Claim management** for the next step after activation.
- **Unclaimed** until wallet/manual verification succeeds.

Avoid:

- **Save Multipass** as the primary public action.
- Broad **display-only** or **read-only public profile** language.
- Any copy implying activation grants custody, wallet ownership, tool authority, payment authority, private credentials, or live route control.

## User Flow

### 1. Lookup

A user opens `/multipass/?agent=1` or enters a Helixa AgentDNA source ID.

The app loads canonical hydrated data through the existing read-through API.

If no saved profile exists, the page shows an **Activation Preview**. It may show public source evidence, but it must not claim a saved profile exists.

### 2. Activate

The user clicks **Activate Multipass**.

The app calls the existing save endpoint with the source token ID. The endpoint creates or resolves the saved profile.

Expected response:

- `state: "saved_unclaimed"` for a newly created profile.
- `state: "saved_existing"` for an already activated source.
- `sharePath` points to the stable saved route.
- `profile` contains the saved public profile.

The app updates the URL/share path to the saved profile route.

### 3. Claim management

After activation succeeds, the UI shows a clear next step:

- Primary next action: **Claim management**.
- Supporting copy: connect the source owner wallet or request manual review.
- Safety copy: claiming management enables public profile edits, not custody transfer, private credentials, live route authority, or payment authority.

If the saved profile is already claim-verified, the app can show the owner command center as it does today.

### 4. Repeat activation

If another user activates the same source later, the backend returns the existing saved profile. The UI should say the Multipass is already activated and show the stable profile route plus claim guidance.

## API Design

### Keep existing write endpoint

Use the existing `POST /api/multipass` endpoint for this slice. Rename the client abstraction and UI copy, not the API route.

Reason: this avoids extra backend surface area while the semantic product shift happens in the web app. The endpoint already performs activation-save behavior and is source-idempotent.

### Optional response normalization

If needed, add or normalize response fields so the web flow can avoid inference:

```json
{
  "schema_version": "0.1.0",
  "state": "saved_unclaimed",
  "created": true,
  "multipass_id": "mp_helixa_agent_1",
  "slug": "bendr-2-1",
  "profile": {},
  "sharePath": "/multipass/bendr-2-1",
  "activation": {
    "state": "saved_record",
    "manager_state": "none",
    "claim_url": "/multipass/bendr-2-1"
  }
}
```

Only add this if tests show the current shape is not enough. Do not break existing callers that consume the current `POST /api/multipass` response.

### CSRF and origin safety

Activation writes must keep the existing trusted-origin protection behavior. If current activation save writes lack an origin gate, add it before exposing the flow more prominently.

The flow must remain safe against crawler activation. GET routes, homepage prefetch, share-card fetches, and canonical reads must never write.

## Web Design

### Rename save panel

Refactor the current save panel into an activation panel:

- Component/function names can change from save-oriented to activation-oriented where practical.
- User-visible label becomes **Activate Multipass**.
- Loading label becomes **Activating...**.
- Success copy distinguishes new vs existing saved profiles.
- Error copy says activation failed, not save failed.

### Activation panel states

- Hidden unless a live source profile is loaded and activation is meaningful.
- Disabled while activating.
- Success for new profile: “Activated Multipass. Stable profile is ready.”
- Success for existing profile: “Multipass already activated. Stable profile is ready.”
- Follow-up: “Claim management when ready.”

### Claim guidance

After activation, render claim guidance close to the success state and reuse the existing claim UI when possible.

Do not show owner command center controls unless the existing claim/session state authorizes them.

### URL behavior

- Before activation: `/multipass/?agent=1` remains an activation preview route.
- After activation success: route/share state updates to `/multipass/<slug>`.
- The canonical hydrated API should continue to produce saved profile links once the profile exists.

## Data Flow

1. `defaultLoadLiveProfile()` reads canonical hydrated source data.
2. Unsaved previews render activation CTA.
3. CTA calls renamed web client wrapper, internally still using `POST /api/multipass`.
4. API activates/saves idempotently by Helixa AgentDNA source.
5. Web merges saved profile response into current state.
6. Web syncs share URL to stable saved path.
7. Web exposes claim-management guidance, then existing claim routes handle verification.

## Security and Trust Boundaries

- Activation is not ownership.
- Claiming management is not custody transfer.
- Public profile edits are not live Helixa source edits.
- Tool cards and routes remain public metadata until verified through existing manager controls.
- Wallet verification remains server-side.
- Manual review remains explicit and auditable.
- No private credentials are exposed or inferred.
- No owner controls on unclaimed public profiles.

## Implementation Planning Notes

During implementation planning, explicitly verify whether the current `POST /api/multipass` response reliably distinguishes newly created vs already existing activations through `state` and `created`. If not, normalize the response without breaking existing callers.

Also choose the exact claim-management affordance before coding. Preferred default: after activation success, show a primary **Claim management** button that scrolls/focuses the existing claim panel on the saved profile page, reusing the existing wallet/manual-review claim components instead of adding a parallel claim flow.

## Testing Plan

### API tests

- `POST /api/multipass` creates an unclaimed saved profile from Helixa AgentDNA input.
- Repeated activation returns existing saved profile with no duplicate row.
- Invalid source input is rejected.
- Unsupported source types remain rejected.
- Activation write does not run for GET canonical resolve, saved hydrated reads, or share routes.
- Trusted-origin behavior is covered if activation writes require origin checks.

### Web tests

- `?agent=1` preview renders **Activate Multipass**, not **Save Multipass**.
- Clicking **Activate Multipass** calls the write client with the resolved token ID.
- Successful new activation updates share path to `/multipass/<slug>`.
- Existing activation shows “already activated” style copy.
- Activation success shows claim-management guidance.
- Owner-only controls remain hidden before claim verification.
- Activation errors show safe user-facing copy.
- Broad `display-only` and `read-only public` copy stays absent.

### Regression tests

- Canonical read-through still shows saved public tools for Bendr.
- Activation preview keeps `/multipass/?agent=1` before save.
- Saved slug route still uses hydrated profile data.
- Homepage/static load does not call activation writes.

## Rollout

1. Implement behind existing `/multipass/` app behavior, no feature flag needed.
2. Run full web and API test suites.
3. Build production web bundle.
4. Deploy web and restart API only if backend behavior changes.
5. Smoke live:
   - `/multipass/?agent=1` renders activation flow.
   - Existing saved Bendr profile still resolves canonical saved data.
   - Public tools still render.
   - Claim controls remain gated.
   - No accidental duplicate saved record is created for Bendr.

## Acceptance Criteria

- Public lookup remains read-only in the operational sense: no writes on page view.
- **Activate Multipass** is the primary explicit write action for Helixa AgentDNA sources.
- Activation returns or creates a stable saved profile route.
- Re-activating the same source is idempotent.
- Post-activation UI clearly guides to claim management.
- Unclaimed profiles do not show owner-only controls.
- Existing claim verification and manager-session rules remain server-authoritative.
- No broad display-only/read-only public wording returns.
- Full tests and production build pass before deploy.

# Multipass Group Activation Design

## Goal

Build the first durable "Activate collection/swarm" product slice for Multipass.

A user should be able to create a public parent Multipass for a swarm or collection from existing Helixa AgentDNA records. The output should be a shareable Multipass profile with a member roster, shared policy context, public fragments, agent-card metadata, standards references, and an x401 authority manifest.

This is the next step after the Helixa Swarm card: make the pattern reusable instead of a one-off static profile.

## Scope

### Included

- Add a public activation path for group subjects: `swarm` and `collection`.
- Let the user enter a display name, subject type, summary, shared policy note, and member AgentDNA token IDs.
- Resolve member IDs through the existing read-only Helixa AgentDNA activation path.
- Generate a preview before saving.
- Save a durable public group Multipass record in the existing saved-record store.
- Render saved group profiles through existing `/multipass/<slug>` routes.
- Expose public companion endpoints already supported by saved records: profile, fragments, agent card, standards, x401, x402, receipts, and changes.
- Keep all copy clear that this creates public identity and authority metadata only.

### Not included

- No onchain writes.
- No minting.
- No wallet signing requirement for creation.
- No x402 payment call.
- No tool execution.
- No custody transfer.
- No private credential access.
- No contract-wide NFT holder indexing in this slice.
- No external swarm hosting claim.

## Approach Options

### Option A: Static UI demo only

Create a form that renders a local preview but does not save anything.

- Pros: fastest, very low risk.
- Cons: not a product wedge. It cannot produce durable links or API surfaces.

### Option B: Durable manual group activation

Create a real API and UI path that resolves listed AgentDNA IDs, builds a parent Multipass record, and saves it to SQLite.

- Pros: real product, shareable, testable, deployable, and reusable for Helixa plus outside groups.
- Cons: requires careful validation and saved-record builder work.

### Option C: Automated collection importer

Accept a contract address or external collection slug, crawl holder/member data, and build a parent Multipass automatically.

- Pros: flashiest demo.
- Cons: too much surface area now: indexing, rate limits, stale ownership, external API failures, and collection semantics.

## Decision

Use Option B.

The V0 should make the Helixa Swarm pattern repeatable while staying inside safe public metadata. A user supplies the roster. The system resolves each member against existing AgentDNA records and publishes a parent group Multipass. Automated NFT collection indexing can come later once the group record shape is proven.

## Public User Experience

Add a new section on the Multipass homepage near the existing live resolver:

- Label: `Activate collection or swarm`
- Fields:
  - Subject type: `swarm` or `collection`
  - Display name
  - Summary
  - Member AgentDNA IDs, one per line or comma-separated
  - Shared policy note
- Primary action: `Preview group Multipass`
- Preview state:
  - Shows the proposed parent profile name and type.
  - Shows resolved members with name, token ID, Cred context if available, and source status.
  - Shows unresolved or invalid members as blocking errors.
  - Shows safety copy: public profile metadata only, no custody, no tools, no credentials, no payment execution.
- Save action: `Activate group Multipass`
- Success state:
  - Shows the share path `/multipass/<slug>`.
  - Shows unclaimed management status.
  - Links to the saved parent Multipass profile.

The UI should reuse existing rendering style, buttons, resolver messaging, and card/detail language. It should not add emojis or broad visual redesign.

## API Design

Add two endpoints under the existing Multipass API router:

### `POST /api/multipass/groups/preview`

Creates a validated, unsaved group activation preview.

Request body:

```json
{
  "subject_type": "swarm",
  "display_name": "Helixa Swarm",
  "summary": "Public parent Multipass for the core Helixa agent team.",
  "member_ids": ["1", "81", "1066"],
  "shared_policy_note": "Owner approval required for shared routes and public tool policy changes."
}
```

Response body:

```json
{
  "schema_version": "0.1.0",
  "state": "group_preview",
  "record": {
    "source": {},
    "profile": {},
    "fragments": [],
    "agentCard": {},
    "standardsProfile": {},
    "x402Manifest": {},
    "receipts": []
  },
  "members": []
}
```

### `POST /api/multipass/groups`

Creates or returns a durable saved group Multipass record.

Response body mirrors existing save semantics:

```json
{
  "schema_version": "0.1.0",
  "state": "saved_group_unclaimed",
  "created": true,
  "multipass_id": "mp_group_helixa_swarm",
  "slug": "helixa-swarm",
  "profile": {},
  "sharePath": "/multipass/helixa-swarm"
}
```

## Server Architecture

Create `apps/api/src/group-activation.js` with small exported units:

- `normalizeGroupActivationInput(input)`
  - Validates subject type, display name, summary, member IDs, and policy note.
  - Accepts only `swarm` or `collection`.
  - Normalizes IDs to Base AgentDNA token IDs or `8453:<token>` canonical IDs.
  - Enforces a practical V0 member limit of 2 to 24 records.

- `resolveGroupMembers(input, activationService)`
  - Calls the existing read-only activation service for each member.
  - Uses member profile/card/source data from the returned records.
  - Fails the preview if any member cannot resolve.
  - Deduplicates members by canonical ID.

- `buildGroupActivationRecord(normalizedInput, resolvedMembers, options)`
  - Produces the same saved-record bundle shape used by `saveActivatedRecord`.
  - Uses `source.sourceType = "multipass_group"`.
  - Uses a deterministic source canonical ID from subject type, normalized slug, and member canonical IDs.
  - Creates a stable `multipass_id` and slug.
  - Creates fragments for roster, shared policy, aggregate Cred context, standards references, and x401 authority metadata.
  - Creates an agent card for the parent group with approval-required contact policy.
  - Creates a standards profile with member `ERC-8004` refs where available.
  - Creates an empty x402 manifest unless public tool metadata is added later.
  - Creates an initial change-log entry.

- `createGroupActivationPreview(input, options)`
  - Normalizes, resolves, builds, and returns the unsaved record plus member summaries.

`apps/api/src/index.js` should route the two new endpoints and pass the existing activation service and saved records. The existing saved-record store can persist the record without a new table because the bundle matches the current shape.

## Data Model

The saved parent profile should use existing schemas:

- `profile.subject_type`: `swarm` or `collection`
- `profile.status`: `active`
- `owner_summary.owner_state`: `unclaimed`
- `owner_summary.verification_status`: `none`
- `owner_summary.visibility`: `public`
- `cred_summary`: aggregate public context only, not a new trust score
- `payment_profile.paid_endpoints_enabled`: `false`
- `sourceContext.activation.sourceType`: `multipass_group`

Fragments:

- Roster fragment:
  - `fragment_type`: `custody_record`
  - `status`: `verified` if all members resolved from Helixa public source
  - `assurance_level`: `platform_verified`
  - `public_value`: readable roster summary
  - `transfer_policy`: `pause_on_transfer`
- Shared policy fragment:
  - `fragment_type`: `endpoint`
  - `status`: `pending`
  - `assurance_level`: `self_attested`
  - `public_value`: shared policy note
  - `endpoint_ref.protocol`: `api`
- Aggregate Cred fragment:
  - `fragment_type`: `risk_summary`
  - `status`: `verified` when at least one public Cred score exists
  - `assurance_level`: `platform_verified`
  - `public_value`: aggregate context without claiming payments buy trust
- Standards fragments:
  - `fragment_type`: `standard_ref`
  - One public reference per resolved member when the source record includes ERC-8004 context.
- x401 fragment:
  - `fragment_type`: `verification_result`
  - Explains required human or owner authorization for group-level authority.

The saved profile must not expose raw `frag_...` IDs in default human copy. IDs may remain in JSON and explicit proof views.

## Web Architecture

Create `apps/web/src/group-activation.js` with small helpers:

- `normalizeGroupMemberInput(text)`
- `createGroupActivationPayload(formData)`
- `renderGroupActivationPanel(state)`
- `renderGroupActivationPreview(preview)`
- `renderGroupActivationSuccess(result)`

Extend `apps/web/src/saved-multipass-api.js` with:

- `previewGroupMultipass(payload, options)`
- `saveGroupMultipass(payload, options)`

Extend `apps/web/src/app.js` only for state wiring and event handlers:

- form submit for preview
- save preview action
- reset/error state
- safe navigation to the saved group route

Use existing CSS patterns for panels, resolver messages, cards, and owner safety copy.

## Error Handling

Validation errors should be clear and user-facing:

- Missing display name.
- Invalid subject type.
- Fewer than 2 members.
- More than 24 members.
- Invalid member ID format.
- Duplicate member IDs.
- Member not found in Helixa AgentDNA.
- Helixa API rate-limited or unavailable.
- Save conflict should return the existing saved group profile where possible.

Failures must not create partial saved records.

## Testing

Use TDD before implementation.

API tests:

- `normalizeGroupActivationInput` accepts swarm and collection.
- Invalid subject type fails.
- Member IDs normalize and dedupe.
- Preview resolves members through a fake activation service.
- Preview fails if one member fails.
- Build output passes SDK assertions for profile, fragments, agent card, standards, x402, and receipts.
- Save endpoint creates a durable group record.
- Re-saving the same normalized group returns the existing record.
- x401 endpoint works for saved group records.

Web tests:

- Homepage renders `Activate collection or swarm`.
- Form builds the expected payload from comma and newline member input.
- Preview renders member names, token IDs, group type, and safety copy.
- Invalid input renders a useful error.
- Save success renders `/multipass/<slug>`.
- Saved group profile route renders as a parent Multipass, not an agent profile.
- No copy implies custody transfer, tool execution, private credential access, or payment execution.

Verification before completion:

- `git diff --check`
- focused API and web tests for group activation
- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`

If deployed, live smoke:

- `/multipass/` loads.
- New group activation panel is present.
- Existing Bendr and Helixa Swarm routes still load.
- A saved group route loads if a test-safe profile is created or a fixture route exists.
- API docs and OpenAPI include the new group endpoints if the route docs are generated/static in this repo.

## Rollout

1. Implement and verify locally in a branch or worktree.
2. Keep deployment separate from implementation unless explicitly approved in the same flow.
3. If deployed, back up `/var/www/helixa.xyz/multipass` before rsync.
4. Restart `multipass-api.service` only if API code changes are deployed.
5. Smoke-check live web and API after deploy.

## Safety Boundaries

The feature creates public metadata only. It must not imply that a group Multipass owns its member agents, can act for them, can execute their tools, or can inherit trust from payment activity. Member AgentDNA, ownership, custody, credentials, Cred context, and permissions remain separate unless future verified authority flows say otherwise.

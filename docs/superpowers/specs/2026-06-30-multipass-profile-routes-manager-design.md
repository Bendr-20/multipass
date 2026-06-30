# Multipass Profile and Routes Manager Design

## Decision

Ship the next Multipass owner-management slice in two linked phases:

1. **Profile editor polish**: make the existing claimed-manager editor read like a real product surface, especially around profile image and public visual changes.
2. **Public routes manager foundation**: let claimed managers publish and maintain safe public route cards, starting from the existing endpoint fragment system rather than creating a separate authority layer.

This keeps the slice useful without implying route execution, tool grants, custody movement, secret access, or transfer authority.

## Product goal

A claimed Multipass manager should be able to make the public profile more useful after claiming it:

- set the public profile image URL,
- update core profile copy,
- publish a primary public route,
- add or revise public endpoint routes,
- see recent public changes in the owner dashboard,
- show those routes on the public profile as readable route cards.

The product promise is: **manage what the public can read and verify, not what the agent can execute.**

## Current baseline

Already shipped or present in code:

- Saved public Multipass profiles.
- Owner-wallet and manual-review claim management.
- Scoped manager sessions with CSRF for public profile edits.
- Existing editable fields: `display_name`, `summary`, `avatar_url`, `tags`, and `visibility`.
- Existing public fragment manager with endpoint fragments.
- Existing endpoint fragment fields: public value, reference URL, proof note, endpoint ID, endpoint URL, endpoint protocol.
- Public change log and owner dashboard.
- Holder-editable avatar rendering for saved profile visuals.

This design should reuse those surfaces instead of building a parallel dashboard.

## Non-goals

Do not add:

- contract writes,
- custody or ownership transfer,
- tool approval controls,
- route execution buttons,
- private credential or secret release,
- payment enforcement,
- agent runtime authentication,
- bulk endpoint management,
- route health checks,
- admin review UI.

The UI copy must keep saying that these are public profile and route references only.

## Phase 1: Profile editor polish

### UI changes

Update the existing claimed saved-profile editor:

- Rename **Avatar URL** to **Profile image URL**.
- Add helper text under the field:
  - `Updates the public Multipass visual only. It does not change custody, tools, credentials, ownership, or the source AgentDNA record.`
- Keep display name, summary, tags, and visibility in the same form.
- Make the form heading more explicit:
  - `Edit public profile`
  - `Safe public fields for the saved Multipass profile.`

### Data behavior

No new field is required for the profile image polish. Continue using:

- `profile.discovery_profile.avatar_url`

Validation stays server-side:

- only HTTPS or empty/null for `avatar_url`,
- bounded strings for display name and summary,
- bounded tag list,
- allowed visibility enum.

### Change log behavior

After save, the owner dashboard should make the change understandable:

- if only `avatar_url` changed, show a human-readable message such as `Public profile updated: profile image.`
- if multiple fields changed, continue showing the changed fields but prefer product labels over internal names:
  - `display_name` -> `display name`
  - `avatar_url` -> `profile image`
  - `summary` -> `summary`
  - `tags` -> `tags`
  - `visibility` -> `visibility`

This can be implemented either by changing the server change-log message or by formatting known field names in the UI. Server-side formatting is preferred so API consumers get the same readable messages.

## Phase 2: Public routes manager foundation

### Core model

Treat public routes as endpoint identity fragments.

Use existing manager-created endpoint fragments as the canonical route store:

```json
{
  "fragment_type": "endpoint",
  "public_value": "Primary public profile",
  "source": {
    "source_type": "owner_submission",
    "source_id": "manager:route_profile",
    "issuer": null,
    "observed_at": "2026-06-30T00:00:00.000Z",
    "reference_url": "https://helixa.xyz/multipass/bendr-2-1"
  },
  "proof_reference": "Manager-published public route",
  "endpoint_ref": {
    "endpoint_id": "profile",
    "url": "https://helixa.xyz/multipass/bendr-2-1",
    "protocol": "web"
  },
  "status": "pending",
  "transfer_policy": "pause_on_transfer"
}
```

Do not add an unconstrained `routes` object to the profile schema yet. The profile already summarizes public fragments, and endpoint fragments already have validation, audit, and manager-session protection.

### Primary route semantics

A saved Multipass can have many public endpoint fragments, but the route manager should make one route visually primary.

Primary route rules for this slice:

- The primary route is the first non-revoked manager-created endpoint route in display order.
- New route creation can mark a route as primary by putting it first in the client-side list after save; no new persisted `primary` field is added yet.
- If the current primary route is revoked, the next non-revoked endpoint route becomes primary automatically.
- Imported read-only endpoint fragments can appear in the route list but do not become primary unless there are no manager-created endpoint routes.
- Route display order is deterministic: manager-created non-revoked routes by newest timestamp first, then imported non-revoked routes, then revoked routes. Use `updated_at` when present, then `created_at`, then `source.observed_at`, and finally the stored fragment order as a stable tie-breaker.
- Future schema work may add an explicit primary marker, but this slice does not need one.

This gives the product a primary route without introducing ordering tables or schema changes.

### Route URL source of truth

For endpoint routes, `endpoint_ref.url` is canonical.

Rules:

- Manager UI writes the route URL into `endpoint_ref.url`.
- The manager/API convenience input may accept `reference_url`, but the persisted fragment shape stores it as `source.reference_url`; do not persist a top-level `reference_url` property.
- For this slice, the convenience `reference_url` input should mirror `endpoint_ref.url` for manager-created endpoint routes unless a later advanced proof/reference flow is added.
- Public route cards render links from `endpoint_ref.url`, not `source.reference_url`.
- Server validation rejects endpoint fragments without a safe HTTPS `endpoint_ref.url`.
- If an existing endpoint fragment has a missing or divergent `source.reference_url`, implementation should not fail rendering; it should still use `endpoint_ref.url` for the route card.

### Route types

Expose a product-friendly route type selector in the manager UI while storing it as `endpoint_ref.protocol`.

Initial types:

- `web` -> Web
- `api` -> API
- `mcp` -> MCP
- `a2a` -> A2A reference
- `x402` -> x402

### Route statuses

Use the existing fragment status enum, but do not let managers self-claim verification.

Public labels:

- `pending` -> Review required
- `verified` -> Verified reference
- `stale` -> Recheck needed
- `disputed` -> Disputed
- `historical` -> Historical reference
- `revoked` -> Revoked

Manager-created routes:

- default to `pending`,
- can be edited only to `pending`, `stale`, `disputed`, or `revoked`,
- cannot be set to `verified` by the manager UI,
- must not be labeled `Active` unless a later trusted verifier exists.

Imported endpoint fragments may render `verified` when that status came from a trusted source record, but they stay read-only in the route manager.

### Route ID constraints and collisions

Route IDs are stored as `endpoint_ref.endpoint_id` and should be stable enough for editing.

Rules:

- Generate a default route ID from the route label by lowercasing, trimming, replacing whitespace with `-`, removing unsupported characters, and falling back to `route` if empty.
- Allowed characters must match the server token validator: letters, numbers, `.`, `_`, `:`, and `-`.
- Maximum length is 80 characters.
- If the generated ID collides with any existing endpoint fragment on the same Multipass, append `-2`, `-3`, and so on until unique.
- When appending a suffix would exceed 80 characters, truncate the base ID first so the final suffixed ID is 80 characters or fewer. For example, reserve the suffix length, trim trailing separators, then append `-2`.
- Collisions with imported read-only endpoint IDs still count. Do not overwrite imported routes.
- If a manager edits a route label, keep the existing endpoint ID unless they explicitly edit the advanced Route ID field.
- Server validation remains authoritative and rejects unsupported or duplicate IDs if the client misses a collision.

### Manager UI changes

Replace the generic endpoint create/edit experience with a clearer **Public routes** section for endpoint fragments. Keep the generic fragment manager for wallet, social, standard, and attestation fragments.

For this slice, the route manager should support:

- add route,
- edit manager-created route,
- revoke route,
- list existing endpoint fragments,
- preserve imported endpoint fragments as read-only.

Fields:

- Route label: maps to `public_value`.
- Route URL: maps to `endpoint_ref.url`; the API convenience `reference_url` input mirrors it and persists under `source.reference_url` for this slice.
- Route type: maps to `endpoint_ref.protocol`.
- Route ID: generated from label or editable advanced field, stored as `endpoint_ref.endpoint_id`.
- Status: maps to fragment status, with manager choices limited to `pending`, `stale`, `disputed`, and `revoked`.
- Review behavior: stored as `transfer_policy`, default `pause_on_transfer`, but rendered with non-transfer copy such as `Recheck on owner change`.
- Proof note: optional.

Default route ID should be generated client-side from the route label when the user does not provide one. The server remains authoritative and validates both `endpoint_ref.endpoint_id` shape and uniqueness for endpoint fragments on the same Multipass.

### Public profile UI changes

Render endpoint fragments as route cards in the profile page.

Placement:

Render a dedicated `Public routes` panel in the profile page below the visual/summary area and above dense proof sections. It should be readable without opening JSON. Do not hide the first route only inside a drawer.

Each route card shows:

- label,
- type,
- status label,
- URL as a safe external link,
- review behavior or proof note if present, using labels like `Recheck on owner change` rather than transfer wording.

Route cards must not include:

- execute,
- approve,
- connect,
- authorize,
- transfer,
- credential release,
- tool control.

Unsafe URLs should render as text or be omitted as links. Server validation should reject unsafe manager-created route URLs.

### API and store behavior

The existing fragment manager API can remain the write boundary:

- `POST /api/multipass/:id/fragments`
- `PATCH /api/multipass/:id/fragments/:fragmentId`
- revoke route through the existing revoke endpoint

No new route-specific API is needed for this slice unless implementation proves the generic fragment API makes the UI too tangled.

Server responsibilities:

- validate endpoint fragments are public,
- require HTTPS endpoint URLs,
- use `endpoint_ref.url` as the canonical route URL,
- mirror API input `reference_url` from `endpoint_ref.url` for this slice and persist it as `source.reference_url`,
- reject unexpected fields,
- reject duplicate endpoint IDs on the same Multipass,
- keep imported fragments read-only,
- prevent manager-created routes from self-setting `verified`,
- write public change log entries with route-friendly messages,
- keep audit events server-only.

Suggested change messages:

- `Public route added: <label>.`
- `Public route updated: <label>.`
- `Public route revoked: <label>.`

If the generic fragment mutation path currently logs `Public fragment updated`, add a route-specific label only when `fragment_type === 'endpoint'`.

## Data flow

### Profile image edit

1. Claimed manager opens saved Multipass profile.
2. Manager signs or already has a manager session.
3. UI shows `Edit public profile` form.
4. Manager changes `Profile image URL`.
5. Web sends `PATCH /api/multipass/:id/profile` with `avatar_url` and CSRF token.
6. API validates the manager session and URL.
7. API updates `profile.discovery_profile.avatar_url`.
8. API writes public change log and server audit.
9. Web merges returned profile and rerenders visual card from the profile image URL.

### Public route add/edit

1. Claimed manager opens saved Multipass profile.
2. UI shows `Public routes` section.
3. Manager adds route label, URL, type, optional proof note.
4. Web generates a unique route ID from the label and sends an endpoint fragment create request with CSRF token.
5. API validates endpoint fragment shape, unique endpoint ID, and HTTPS route.
6. API creates owner-submitted endpoint fragment with `endpoint_ref.url` as the canonical route URL and updates public fragment summary.
7. API writes public change log and server audit.
8. Web merges returned fragments and renders the route card.

## Error handling

Profile editor errors:

- unsafe profile image URL -> inline error near the claim management panel,
- unsupported visibility -> inline error,
- missing/expired manager session -> inline error and keep existing profile visible,
- CSRF or origin rejection -> inline error with no state mutation.

Route manager errors:

- missing label -> inline route error,
- invalid or non-HTTPS URL -> inline route error,
- unsupported type -> inline route error,
- duplicate route ID -> inline route error and keep the attempted form values,
- unsupported route ID characters -> inline route error,
- manager attempt to mark a route verified -> inline route error,
- imported/read-only route edit -> inline route error,
- expired session -> inline error and preserve route list.

Failed preflight or save must not clear existing public fields or routes.

## Testing plan

### API/store tests

Add or update tests in `apps/api/test/claim-manage.test.mjs` and route tests:

- profile update accepts `avatar_url` and logs `profile image` label,
- profile update rejects unsafe profile image URL,
- manager-created endpoint fragment can be added as a public route,
- route creation rejects non-HTTPS endpoint URL,
- route creation rejects duplicate endpoint IDs, including collisions with imported routes,
- manager-created route cannot be created or updated with `verified` status,
- route update writes route-friendly change log,
- imported endpoint fragments remain read-only,
- route revoke updates fragments and change log.

### Web tests

Add or update tests in `apps/web/test/app.test.mjs`:

- claimed profile editor labels `Profile image URL` and includes safety helper copy,
- saving profile image updates rendered visual,
- claimed profile shows `Public routes` manager section,
- adding an endpoint route renders a public route card,
- generated route IDs avoid collisions with existing endpoint fragments,
- generated route IDs truncate before suffixing when the base ID is near the 80-character limit,
- imported endpoint route displays read-only,
- route cards have safe links and no executable/control wording,
- route manager errors render inline without losing existing routes.

### Wording tests

Update blocked-copy scan if needed. New UI must avoid overclaims such as:

- execute route,
- approve route,
- grant tool access,
- transfer authority,
- release credentials,
- activate tools.

## Deployment and smoke

Run before completion:

- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- `git diff --check`

Live smoke after deploy:

- saved public profile returns HTTP 200,
- claimed-manager panel still renders for a saved profile,
- public route card renders from an endpoint fragment,
- unsafe route URLs are not linked,
- public profile image still controls the visual,
- no executable route/control language appears on the page.

## Open decisions for later

- whether public routes should become a first-class profile schema field in a future schema version,
- whether verified route health checks should exist,
- whether route provenance should support signed manifests,
- whether route manager should eventually support bulk routes,
- whether x402 paid endpoints should integrate with route cards once payment enforcement is real.

These are deliberately deferred. This slice is the safe public route reference foundation.

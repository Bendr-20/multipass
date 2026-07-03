# Multipass Owner Tool Registry Refresh Design

## Decision

Build option 2 now: an owner-facing Tool Registry panel that shows the existing normalized tool cards and lets a manager refresh their status metadata.

Keep the boundaries shaped so option 3 can add full add/edit/remove later without replacing the model. The refresh slice should use the same tool identity, validation, status, and mutation surfaces that future editing will use.

## Product goal

A claimed Multipass manager should be able to open the Owner Command Center and answer:

- Which tools are attached to this Multipass?
- Which registry or source published each tool?
- What endpoint, manifest, price, access rule, schema summary, and verification note are public?
- Is the source reachable right now?
- When was the tool last checked?
- Did the refresh change status without exposing credentials or executing the tool?

Public viewers keep the existing public tool cards. Owner-only refresh controls never appear on the public profile.

## Scope

### In this slice

- Add owner-only refresh controls to the existing Tool Registry panel.
- Add a manager-session API route to refresh one tool card.
- Refresh only public-safe discovery metadata:
  - endpoint reachability,
  - manifest reachability when a manifest URL exists,
  - status,
  - `last_checked_at`,
  - bounded validation or error summary.
- Keep normalized tool records compatible with future add/edit/remove.
- Add tests for API authorization, refresh behavior, UI rendering, and state merging.

### Explicit non-goals

- Do not call paid tools.
- Do not perform x402 payments.
- Do not deploy, pause, resume, or delete Bankr services.
- Do not register or update OpenSea tools onchain.
- Do not store secrets.
- Do not reveal API keys, bearer tokens, private headers, or wallet keys.
- Do not allow arbitrary raw manifest blobs in saved public records.
- Do not add full add/edit/remove UI in this slice.

## User experience

### Owner Command Center

The Tools section becomes a manager surface when a valid claim session exists.

For each tool card, show the existing public metadata plus an owner-only action row:

- Refresh status button.
- Last checked timestamp.
- Status label.
- Short source check result.
- Copy that says refresh checks discovery metadata only and does not call or pay for the tool.

Button states:

- `Refresh status` when idle.
- `Refreshing...` while the request is in flight.
- Success message after refresh.
- Error message when refresh fails, without leaking internal details.

Public users still see the current public cards only.

### Future option 3 flexibility

The UI should render tool actions through a small action area per card, not hardcoded around refresh forever. Future actions can slot into the same action area:

- edit metadata,
- add manifest,
- hide/unhide,
- revoke,
- import additional source data.

The refresh route should use a tool-scoped API path so edit/delete can follow the same pattern later.

## API design

Add a manager-session route:

`POST /api/multipass/:id/tools/:fragmentId/refresh`

Requirements:

- Requires the same manager session cookie and CSRF header used by profile, route, fragment, and tool import mutations.
- Looks up the saved Multipass by slug or ID.
- Finds an active `tool_manifest` fragment by `fragment_id`.
- Refuses private session-less access with 401 or 403 following existing mutation conventions.
- Does not accept arbitrary endpoint overrides in the refresh request body.
- Does not call paid endpoints or send x402 payment headers.
- Returns the refreshed profile, fragments, tools summary, agent card, x402 manifest, and changes in the same shape as existing mutations where practical.

Suggested response includes:

```json
{
  "schema_version": "0.1.0",
  "profile": {},
  "fragments": [],
  "tools": {},
  "agent_card": {},
  "x402": {},
  "changes": [],
  "refresh": {
    "fragment_id": "frag_tool_bankr_agent_lookup",
    "status": "verified",
    "checked_at": "2026-07-03T03:17:00.000Z",
    "summary": "Endpoint reachable. Manifest not published."
  }
}
```

## Refresh behavior

Create a focused refresh unit in the API layer, for example `tool-refresh.js`.

Inputs:

- current tool fragment,
- fetch implementation,
- current timestamp.

Outputs:

- updated identity fragment,
- public-safe refresh summary.

Rules:

- Validate endpoint and manifest URLs with existing HTTPS safety rules.
- Use bounded timeouts.
- Prefer `HEAD` for simple reachability, falling back to `GET` only when needed.
- For Bankr x402 endpoints, a 402 challenge means the endpoint is reachable and should generally map to `verified` if the challenge is structurally valid.
- For free HTTPS endpoints, 2xx means reachable.
- For OpenSea-style tool manifests, manifest URL 2xx plus endpoint reachable means verified.
- 4xx/5xx or timeout maps to `stale`, not deleted.
- Invalid saved URLs map to `disputed` or `stale` with a bounded summary.
- Preserve owner-entered descriptive fields unless refreshed public metadata safely improves them.
- Update `tool_manifest_ref.last_checked_at` and fragment `updated_at`.
- Append a change-log event through existing saved-record mutation plumbing.

Status mapping:

- `verified`: public discovery endpoint is reachable or valid challenge is returned.
- `stale`: endpoint/manifest check failed or timed out.
- `disputed`: saved metadata is structurally unsafe or contradictory.
- `revoked` and `historical`: not set by refresh in this slice.

## Frontend design

Extend `tool-manager.js` without making it a giant editor.

New frontend functions should stay small and testable:

- render manager action row for each tool,
- compact refresh request target from `fragment_id`,
- merge refresh mutation state,
- bind refresh submit/click handlers.

State additions:

- `toolRefreshingFragmentId`, or reuse `toolActiveFragmentId`,
- `toolStatus` values like `refreshing_tool` and `tool_refreshed`,
- `toolError` for public-safe error copy.

`app.js` should wire refresh through the existing `defaultClaimApi` pattern, similar to `importMultipassTool`.

`saved-multipass-api.js` should expose:

`refreshMultipassTool({ id, fragmentId, apiBase, csrfToken, fetchImpl })`

## Data model

No schema migration should be required.

Use the existing `tool_manifest` identity fragment and `tool_manifest_ref` fields:

- `status`,
- `updated_at`,
- `tool_manifest_ref.last_checked_at`,
- `source.observed_at`, when appropriate.

To support future option 3, avoid putting refresh-only fields at top level. If a result summary needs persistence, store only bounded public-safe text in existing source or change-log records, not as an unbounded raw response.

## Error handling

- Network timeouts should not fail the whole profile read.
- Refresh mutation failures should leave the old tool card intact.
- API responses must never echo secret headers, request internals, stack traces, API keys, or private provider payloads.
- Duplicate clicks should be disabled client-side while a refresh is in flight.
- If the tool no longer exists, return 404 with a stable error code.
- If the session is missing or CSRF is wrong, use existing auth errors.

## Tests

API tests:

- Refresh requires manager session and CSRF.
- Refreshing a Bankr x402 endpoint that returns 402 marks the tool verified and updates `last_checked_at`.
- Refreshing a timeout or failed endpoint marks the tool stale without deleting it.
- Refresh refuses unknown or non-tool fragments.
- Public `/tools` output still filters private/gated/hidden tools.

Frontend unit tests:

- Owner Tool Registry renders refresh controls only when editable.
- Public Tool Registry does not render refresh controls.
- Refresh click calls the claim API with the correct `fragment_id`.
- Refresh success merges returned tools/fragments/profile into state.
- Refresh error displays safe copy.

Build gates:

- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- Live smoke only after deploy approval.

## Acceptance criteria

- Claimed owner sees refresh controls for existing tool cards.
- Public viewers do not see owner refresh controls.
- Refresh does not call paid tools or send payment proofs.
- Bankr 402 challenge counts as reachable discovery metadata.
- OpenSea manifest/endpoint checks can mark tool cards verified when reachable.
- Failed checks mark stale and preserve the card.
- The implementation leaves a clear path for add/edit/remove actions using the same tool-scoped action area and API route family.

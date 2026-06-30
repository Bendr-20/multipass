# Multipass Route Manager Live Polish Design

## Decision

Polish the claimed public route manager so it is safe to demo as a real manager surface. This slice improves client-side validation, route-scoped save states, failed-session handling, and route type helper copy while continuing to use the existing manager-session and public fragment write APIs.

Do not add route health checks, route execution, tool access, credential release, custody movement, or new authority semantics. Route cards stay public display references only.

## Product goal

A claimed Multipass manager should be able to add, edit, and retire public route cards with clear feedback before and after each write. If a write fails because the URL is unsafe, the route ID collides, or the manager session is missing or expired, the existing route cards should remain visible and the error should appear inside the route manager.

The product promise is: manage public route references, not runtime permissions.

## Current baseline

Already shipped:

- `apps/web/src/route-manager.js` renders public route cards and a claimed route manager.
- Route writes reuse existing `createMultipassFragment`, `updateMultipassFragment`, and `revokeMultipassFragment` client APIs.
- API write endpoints require a manager-session cookie and CSRF token.
- Server-side endpoint fragment validation rejects missing or non-HTTPS `endpoint_ref.url`, duplicate endpoint IDs, imported read-only route edits, and manager-created `verified` status.
- Public route cards render links from canonical `endpoint_ref.url` only.
- Generic fragment manager no longer owns endpoint route creation UI.

This slice should not create a parallel route API or schema.

## Non-goals

Do not add:

- live route probing or uptime checks,
- route execution buttons,
- connect or authorize flows,
- tool grants,
- credential or secret release,
- custody or ownership changes,
- payment enforcement,
- admin review tooling,
- bulk route management,
- persisted `primary` field.

## UX behavior

### Route-scoped state

Add route-specific state to the app alongside existing fragment state:

- `routeStatus`: null, `creating_route`, `route_created`, `updating_route`, `route_updated`, `retiring_route`, `route_retired`, or `error`.
- `routeError`: route manager error text or null.
- `routeActiveFragmentId`: optional fragment ID for update and retire operations.

Route manager errors and success copy render inside `.route-manager-panel`. Generic public proof fragment errors remain inside the fragment manager.

### Route manager validation

Before calling the API, validate create and update route form data in `route-manager.js`.

Create validation:

- Route label is required after trimming.
- Route URL is required.
- Route URL must parse as HTTPS.
- Route ID must be present after generation.
- Route ID must use the server-compatible token shape: letters, numbers, `.`, `_`, `:`, and `-`.
- Route ID must be 80 characters or fewer.
- Route ID must be unique across all existing endpoint fragments for that Multipass, including imported read-only routes.
- Route type must be one of `web`, `api`, `mcp`, `a2a`, or `x402`.

Update validation:

- Same label, URL, route ID, and route type validation as create.
- Existing route ID is kept unless the advanced Route ID field is edited.
- Duplicate checks must exclude the current route's own `fragment_id`, so saving an unchanged route ID does not false-fail.
- A route cannot be updated if it is imported/read-only. The UI should already prevent this, but helper validation should fail safely if called directly.
- Status must be one of `pending`, `stale`, `disputed`, or `revoked` for manager-created routes.

Validation errors should throw normal `Error` instances with product-readable messages such as:

- `Route label is required.`
- `Route URL must be an HTTPS URL.`
- `Route ID already exists on this Multipass.`
- `Imported routes are read-only here.`

### Failed writes

If create, update, or retire fails:

- Keep existing route cards and forms rendered.
- Do not clear the manager session in state unless the user explicitly signs out.
- Show the API/client error in `.route-manager-panel`.
- Keep public profile data unchanged.
- Keep the claimed manager controls visible when the CSRF token is still present.

If the API returns a missing or expired manager-session error, show the error in the route manager and leave the claim panel intact. A later slice can add a dedicated re-auth button; this slice can rely on the existing claim/sign-out controls.

### Pending and success copy

Use route-specific button labels:

- Create idle: `Publish route`
- Create pending: `Publishing...`
- Update idle: `Save route`
- Update pending for active route: `Saving...`
- Retire idle: `Retire route`
- Retire pending for active route: `Retiring...`

Route manager status copy:

- Create success: `Public route published.`
- Update success: `Public route saved.`
- Retire success: `Public route retired.`

Do not use copy that implies route execution, connection, authorization, credential release, tool control, custody transfer, or ownership transfer.

### Route type helper copy

Render route type labels and helper text without implying execution:

- `web`: `Web reference`
- `api`: `API reference`
- `mcp`: `MCP reference`
- `a2a`: `A2A reference`
- `x402`: `x402 reference`

A short helper below the type selector should say:

`Classifies the public reference only. It does not test, call, or authorize the route.`

If this helper trips wording gates because of `authorize`, rewrite as:

`Classifies the public reference only. It does not test, call, or grant access to the route.`

Prefer the second version in product UI to avoid unsafe authorization language.

## Component and module changes

### `apps/web/src/route-manager.js`

Add or update exports:

- `validateRouteInput(input, existingRoutes)`
- `validateRoutePatch(patch, currentRoute, existingRoutes)`
- `compactRouteInput(formData, existingRoutes)` should validate before returning payload.
- `compactRoutePatch(formData, currentRoute, existingRoutes)` should validate before returning payload.
- `renderPublicRoutesManagerPanel(state)` should read `state.routeStatus`, `state.routeError`, and `state.routeActiveFragmentId` for button labels and route-scoped messages.

Keep the module focused on route form rendering, compaction, validation, route sorting, and safe public route cards.

### `apps/web/src/app.js`

Update route handlers to use route-specific mutation state:

- `createPublicRoute(event)` uses `compactRouteInput(formData, getPublicRouteFragments(state.data))`.
- `updatePublicRoute(event)` uses `compactRoutePatch(formData, currentRoute, getPublicRouteFragments(state.data))`.
- `revokePublicRoute(event)` uses route-specific status and active fragment ID.
- Add `mutatePublicRoute()` parallel to `mutatePublicFragment()`.

`mutatePublicRoute()` should merge successful API results with `mergeFragmentMutationState()` so public route cards update in the same way they do today. On failure it should set `routeStatus: 'error'` and `routeError` without clearing existing route data.

Route handlers should catch synchronous validation errors from `compactRouteInput()` and `compactRoutePatch()` before starting a network mutation. Those errors should set `routeStatus: 'error'`, set `routeError` to the validation message, keep existing route data intact, and re-render the route manager without calling the API.

### `apps/web/src/styles.css`

Add minimal styles for route-scoped helper and state copy:

- `.route-field-helper`
- `.route-manager-status`
- active route pending state if needed

Follow the current Multipass card aesthetic. No emoji.

### API code

No new API endpoint is required. Existing server validation should stay authoritative. Add API tests only if a missing session, expired session, duplicate route ID, or invalid URL case is not already covered clearly enough.

## Error handling

Client validation catches obvious form errors before the request. Server validation remains authoritative for race conditions and tampered clients.

Expected handling:

- Invalid HTTPS URL: client rejects before write; API still rejects if reached.
- Duplicate route ID: client rejects when known; API rejects if race or hidden data causes collision.
- Imported route update: UI read-only, helper rejects if called directly, API rejects if reached.
- Missing or expired manager session: API returns error, UI shows route-scoped error and keeps cards visible.
- Failed retire: route remains visible with old status.

## Testing plan

### Route manager unit tests

Add coverage for:

- create rejects empty label,
- create rejects empty URL,
- create rejects `http:` and `javascript:` URLs,
- create rejects duplicate route IDs including imported routes,
- create accepts valid HTTPS routes and route type labels,
- update keeps existing route ID when advanced field is unchanged,
- update rejects unsupported status,
- imported route patch validation rejects direct helper calls,
- route manager panel shows route-specific success/error copy,
- pending buttons disable or relabel only the active operation.

### App integration tests

Add coverage for:

- route create validation error appears without calling `claimApi.createMultipassFragment`,
- route update API failure leaves existing route cards visible,
- route retire API failure leaves existing route cards visible,
- missing/expired manager-session error appears inside route manager while the claim panel remains visible,
- route operations use `routeStatus`/`routeError`, not generic fragment manager errors.

### API tests

Confirm or add focused tests for:

- missing manager-session cookie rejects route create/update/revoke,
- invalid CSRF rejects route create/update/revoke,
- duplicate endpoint ID rejects create/update,
- non-HTTPS endpoint URL rejects create/update.

### Full verification

Run:

```bash
node --test apps/web/test/route-manager.test.mjs
node --test apps/web/test/app.test.mjs --test-name-pattern "route"
node --test apps/api/test/*.test.mjs
pnpm test
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
git diff --check
node --test apps/web/test/wording.test.mjs apps/web/test/route-manager.test.mjs
```

## Deploy and smoke

Deploy `apps/web/dist/` to `/var/www/helixa.xyz/multipass/` after build.

Smoke:

- live HTML references the new JS and CSS assets,
- referenced assets return HTTP 200,
- `https://helixa.xyz/multipass/bendr-2-1` renders `.multipass-profile-page`, `.claim-management-panel`, and `.public-routes-panel`,
- live route cards contain only safe HTTPS links from `endpoint_ref.url`,
- route-card and route-manager DOM avoids blocked control wording.

If a live manager session is unavailable, do not fake one or mutate live data. Record that manager write behavior was covered by unit/API/app tests.

## Success criteria

- Route manager validation prevents obvious unsafe writes before network calls.
- Server validation remains authoritative.
- Route errors and successes render inside the route manager.
- Failed route writes do not hide or erase existing route cards.
- Imported endpoint routes remain read-only.
- No UI copy implies execution, connection, authorization, secret release, tool control, custody changes, or ownership changes.
- Full tests, build, wording gate, and live public smoke pass before push.

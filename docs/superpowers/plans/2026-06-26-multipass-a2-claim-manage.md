# Multipass A2 Claim/Manage Implementation Plan

## Goal

Ship the A2 slice of MVP A: saved Multipass records can be claimed for public metadata management, edited through a scoped wallet session, and protected by nonce/signature verification, CSRF, origin checks, and server-side audit/change logs.

This slice must preserve A1 live persistence and public display behavior.

## Guardrails

- Use the approved spec: `docs/superpowers/specs/2026-06-26-multipass-mvp-a-b-c-design.md`.
- Do not implement SDK publishing, OpenAPI hardening, collection pages, NFT token preview, or trusted NFT adapter ingestion.
- Do not claim asset transfer, custody transfer, tool movement, secret movement, permission grants, payment-as-trust, or current NFT binding.
- Claim management means safe public Multipass metadata only.
- `claimed_verified_owner` is reserved for matching public owner-wallet signature proof.
- Manual review approval is `claimed_review_approved`; it still requires the approved manager wallet to sign before edits.
- Keep private/system audit data out of public profile responses.

## Current code map

- API boundary: `apps/api/src/index.js`
  - Routes public GETs and A1 POST save/activate.
  - Needs new claim/session/profile PATCH/admin routes.
- Persistent store: `apps/api/src/saved-records.js`
  - Owns SQLite schema and saved-record reads.
  - Needs claim nonce, claim request, manager session, audit, profile edit methods.
- API server: `apps/api/src/server.js`
  - Needs env/config for `MULTIPASS_ALLOWED_ORIGINS`, `MULTIPASS_ADMIN_SECRET`, and secure cookie behavior.
- Activation mapping: `apps/api/src/activation-records.js`
  - Already stores public owner in sanitized `sourceContext.sourceSnapshot.owner` and creates public owner wallet fragment.
- API tests:
  - `apps/api/test/saved-records.test.mjs`
  - `apps/api/test/api-routes.test.mjs`
  - `apps/api/test/server.test.mjs`
- Web API helpers:
  - `apps/web/src/api.js`
  - `apps/web/src/saved-multipass-api.js`
  - Add claim/profile helper functions without localStorage auth tokens.
- Web UI:
  - `apps/web/src/app.js`
  - `apps/web/src/styles.css`
  - Add saved-profile claim panel and owner dashboard lite.
- Web tests:
  - `apps/web/test/saved-multipass-api.test.mjs`
  - `apps/web/test/app.test.mjs`
  - `apps/web/test/wording.test.mjs`

## Data model changes

Add SQLite tables in `apps/api/src/saved-records.js`:

1. `claim_nonces`
   - nonce ID, nonce value/hash, multipass ID, purpose, message, issued/expires/used timestamps.
2. `claim_requests`
   - claim ID, multipass ID, proof type, proposed manager wallet, contact route, note, status, created/updated/approved timestamps.
3. `manager_sessions`
   - session hash, multipass ID, manager wallet, claim status/source, issued/expires/revoked timestamps, CSRF hash.
4. `audit_events`
   - server-only operational events.

Extend `saved_records` behavior without breaking existing DBs:

- Keep `profile_json` as the public schema-compatible profile.
- Apply safe public edits directly to allowed schema fields only:
  - `display_name`
  - `discovery_profile.summary`
  - `discovery_profile.avatar_url`
  - `discovery_profile.tags`
- Keep owner/source/cred/trust/custody/token fields immutable from manager edits.

## API route work

### Public/claim routes

- `POST /api/multipass/:id/claim/nonce`
  - Resolve saved record by slug or ID.
  - Create short-lived nonce and plain signing message including Multipass ID, source canonical ID, domain, nonce, issued time, expiry, and warning.
  - Return message and expiry. Do not create a session.

- `POST /api/multipass/:id/claim/verify`
  - Modes:
    - `wallet_signature`: verify signature, consume nonce, check wallet eligibility.
      - If wallet matches public source owner: set `claimed_verified_owner`, create manager session, return CSRF token and public profile.
      - If wallet matches an approved manual review request: set/use `claimed_review_approved`, create manager session, return CSRF token and public profile.
      - Otherwise reject and keep record unclaimed/pending.
    - `manual_review`: validate proposed manager wallet/contact/note, create pending request, mark public profile pending, no session.
  - Writes public change log entries and server-only audit events.

### Manager routes

- `PATCH /api/multipass/:id/profile`
  - Require valid manager session cookie scoped to the same Multipass ID.
  - Require valid `x-csrf-token`.
  - Reject unexpected `Origin`/`Referer` if present.
  - Allow only safe profile fields.
  - Write public change log and server-only audit event.

- `POST /api/multipass/:id/session/logout`
  - Require session cookie if present.
  - Revoke scoped session and clear cookie.

### Admin path

- `POST /api/admin/multipass/:id/claims/:claimId/approve`
  - Require `x-admin-secret` matching server config.
  - Approve pending manual review claim.
  - Mark profile as `claimed_review_approved`/review-approved summary, not owner-wallet verified.
  - Do not create edit access; approved manager wallet still must sign nonce.
  - Write server audit and public change log.

## Signature verification

- Add a small production Ethereum personal-sign verifier dependency if needed.
- Keep verifier injectable in tests so route tests are deterministic.
- Normalize wallet addresses case-insensitively.
- Never treat a connected wallet address alone as authorization.

## Web work

- Add claim/manage API helpers in `apps/web/src/saved-multipass-api.js`:
  - `requestClaimNonce`
  - `verifyClaimSignature`
  - `requestManualReview`
  - `patchPublicProfile`
  - `logoutManagerSession`
- Add a wallet adapter using `window.ethereum` only when present:
  - request account
  - `personal_sign` exact server message
- Add saved-profile claim panel in `apps/web/src/app.js`:
  - visible only for saved Multipass records.
  - wallet proof path.
  - manual review pending path.
  - owner dashboard lite after session creation.
- Add dashboard lite editor:
  - display name
  - summary
  - avatar URL
  - comma-separated tags
  - danger-zone copy: authority, tools, credentials, custody are not managed here yet.

## TDD checkpoints

1. Repository tests first:
   - nonce creation/expiration/consumption.
   - manual review request creation.
   - admin approval updates claim state without owner-verified label.
   - manager session create/validate/revoke.
   - safe profile edit allowlist and blocked field rejection.
2. API route tests:
   - nonce message shape.
   - owner-wallet proof creates session, Set-Cookie, CSRF token.
   - mismatched wallet rejected.
   - manual review pending has no session.
   - approved review wallet can later create session.
   - missing/expired/wrong-scope/CSRF-invalid/unexpected-origin edits rejected.
   - allowed edit updates public profile and change log.
3. Web helper tests:
   - correct endpoints, credentials, CSRF header, JSON errors.
4. Web app tests:
   - saved unclaimed profile shows claim management copy.
   - wallet verified session shows dashboard lite and safe editor.
   - manual review pending does not unlock editor.
   - forbidden copy scan remains clean.

## Verification gates

Before claiming completion:

- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- copy scan for the blocked product/custody/terminology phrase list from project memory.
- live smoke after deploy:
  - service active
  - nginx active
  - `POST /api/multipass/:id/claim/nonce`
  - manual review pending route
  - profile PATCH rejection without session
  - existing saved public URL still returns HTTP 200

## Implementation order

1. Add failing repository tests.
2. Implement store schema/methods.
3. Add failing API route tests.
4. Implement claim/session/admin/profile routes.
5. Add web helper tests and helpers.
6. Add web claim panel/dashboard lite tests and UI.
7. Run full verification.
8. Merge into `/home/ubuntu/multipass`, push, deploy API/web, smoke live.
9. Append deployment note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-26.md`.

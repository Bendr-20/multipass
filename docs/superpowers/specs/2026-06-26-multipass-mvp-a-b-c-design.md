# Multipass MVP A-B-C Design

## Decision

Build the Multipass MVP in this order:

1. **A - User MVP:** Activate a live agent, save a persistent Multipass record, claim/manage basic public fields, and share the profile.
2. **B - Developer/API MVP:** expose stable read APIs, schemas, SDK helpers, and partner documentation around those saved records.
3. **C - NFT Collection MVP:** add collection pages and NFT Activate flows once trusted adapter metadata can identify NFT-origin activations.

A is the first implementation target. B and C are designed now so A does not paint us into a corner.

## Product wedge

The MVP promise is:

> Activate any supported public agent record into a persistent Multipass you can claim, manage, and share.

This is not a custody transfer product yet. It is not a tool/secret handoff product yet. It is a safe public identity and trust profile layer that can later support stronger authority, payments, NFT collection flows, and runtime handoff.

## Current baseline

Already shipped:

- Static Multipass public app at `/multipass/`.
- Live Helixa resolver for token IDs, canonical IDs, and supported names.
- Activate language in the public UI.
- Activation summary that distinguishes preview vs live activated state.
- Conservative `Activated from NFT` gate based only on trusted resolver metadata.
- Shareable `?agent=` URLs.
- Display-only framing with no approvals, authority changes, private credential exposure, contract writes, or route mutation.

## MVP A - User MVP

### Goal

Let a real user create and manage a durable Multipass profile from a live public agent record.

A user should be able to:

1. Open `/multipass/`.
2. Enter an AgentDNA ID, ERC-8004-style ID, token ID, or supported agent name.
3. Activate a live public record.
4. Save it as a persistent Multipass record.
5. Claim management rights for that Multipass when they can prove control.
6. Edit safe public display fields.
7. Share the stable Multipass URL.

### Non-goals for A

- No contract writes.
- No wallet custody changes.
- No transfer execution.
- No tool permissions.
- No secret movement.
- No private memory unlock.
- No marketplace listing execution.
- No paid endpoint enforcement.
- No claim that NFT activation binds to an existing ERC-8004 identity.

### User states

A Multipass can be:

- `preview`: bundled demo or unsaved live resolve.
- `activated_unsaved`: live public record resolved in the browser, not persisted.
- `saved_unclaimed`: persistent public Multipass exists, but no verified manager is attached.
- `claim_pending`: someone requested management rights and must complete review or proof.
- `claimed_verified_owner`: manager proved control with a matching owner-wallet signature.
- `claimed_review_approved`: manager was approved through manual/admin review without owner-wallet proof.
- `claimed_admin_seeded`: admin-created or team-seeded MVP record.
- `archived`: hidden from default discovery but still resolvable by direct admin tools.

Public copy must make clear that claim status is management of the Multipass record, not transfer of the underlying agent, wallet, NFT, tools, or authority.

### Claim model

The MVP claim grants permission to manage public Multipass metadata only.

Accepted proof paths for A:

1. **Owner wallet match:** if the live Helixa record exposes a public owner wallet, the claimant signs a message with that wallet.
2. **Admin seeded claim:** admin assigns management for early team/demo records.
3. **Manual review request:** claimant submits a public note, contact route, and proposed manager wallet for review when source-owner wallet proof is unavailable.

The claim message should include:

- Multipass ID.
- Source canonical ID.
- Domain, for example `helixa.xyz`.
- Nonce.
- Issued time and expiration.
- Plain warning that signing does not transfer funds, assets, tools, credentials, or ownership.

Rejected or expired claims leave the record public and unclaimed.

Manual review in A means request creation and pending-state display only. Approval can be handled by a small admin script or protected admin endpoint, but a full reviewer UI is not part of A. Admin seeded claims are limited to early team/demo records and must write an audit event.

Manual review must still bind management to a wallet. A review request includes a proposed manager wallet. If approved, the claim status becomes `claimed_review_approved`, but edit access still requires that proposed manager wallet to sign a manager-session nonce. Review approval never creates an owner-wallet verified claim and never grants editing from contact-route proof alone.

### Manager auth model

Use wallet-session auth for A.

Flow:

1. Server creates a short-lived claim nonce.
2. User signs the claim message with the public owner wallet.
3. Server verifies the signature and claim eligibility.
4. Server returns the CSRF token in the verified response body and creates an HTTP-only manager session scoped to that Multipass ID.
5. Manager-only edits require that session and are rejected when the session is missing, expired, revoked, scoped to another Multipass, missing a valid CSRF token, or sent from an unexpected origin.

Session rules:

- Use secure HTTP-only cookies in production.
- Set `SameSite=Lax` by default, or `SameSite=Strict` if the dashboard does not need cross-site return flows.
- Require CSRF protection for every cookie-authenticated write route.
- Verify `Origin` or `Referer` on manager write routes and reject unexpected origins.
- Store only session ID, Multipass ID, manager wallet, issued time, expiration, CSRF secret/token hash, and revocation state server-side.
- Default session lifetime should be short, for example 24 hours, and renewable by re-signing.
- Do not use localStorage for auth tokens.
- Do not treat a connected wallet alone as authorization. The server must verify the signed nonce.

Manual review requests do not create a manager session. Approved manual review claims require a later signature from the approved proposed manager wallet before any scoped manager session is created. Admin seeded claims may create or mark a manager session only through the explicit admin path.

### Minimal admin/review path for A

A does not need a full admin dashboard.

Implement one minimal operational path:

- `POST /api/admin/multipass/:id/claims/:claimId/approve` behind server-side admin auth, or
- a local operator script that approves a pending claim by ID.

Either path must:

- require an admin secret or server-local execution context,
- write a server-only audit event,
- write a public change log entry such as `Management claim approved`,
- mark the claim as `claimed_admin_seeded`, `claimed_review_approved`, or `claimed_verified_owner` according to proof type,
- reserve `claimed_verified_owner` for matching owner-wallet signature proof only,
- for `claimed_review_approved`, record the approved proposed manager wallet and require that wallet to sign before creating an edit session,
- never modify source ownership, custody, tools, secrets, or permissions.

### Persistent record shape

Store each saved Multipass as a server-side record with these logical sections:

- `multipassId`: stable internal ID.
- `slug`: shareable public slug.
- `subject`: type, display name, source IDs, and canonical IDs.
- `activation`: source type, resolver metadata, activation state, and trusted origin fields.
- `sourceSnapshot`: sanitized public live resolver output at save time.
- `publicProfile`: editable safe fields such as headline, description, avatar URL, website, socials, tags, and display preferences.
- `claim`: claim status, manager wallet hash/public address where appropriate, proposed manager wallet for manual review, proof type, verified time, review state, and whether the claim was wallet-verified or review-approved.
- `visibility`: public fields enabled or hidden.
- `changeLog`: append-only user-visible changes.
- `systemAudit`: server-only operational audit events.
- `createdAt` and `updatedAt`.

Do not store private keys, API tokens, wallet signatures beyond what is needed for verification audit, hidden credentials, or private memory.

### Storage choice

Use a simple persistent API store for MVP A.

Recommended implementation path:

- Start with SQLite for production-like persistence and easy backups.
- Keep a repository interface so tests can use an in-memory store.
- Avoid introducing a complex ORM until needed.

Core tables or equivalent collections:

- `multipass_records`
- `claim_nonces`
- `claim_requests`
- `change_log_entries`
- `audit_events`
- `manager_sessions`

### Public routes

Add public read routes for A:

- `POST /api/multipass/activate`
  - Preview-only.
  - Input: resolver input.
  - Output: sanitized activated preview, with clear saved/unsaved state.
  - Must not persist records or create claims.

- `POST /api/multipass`
  - The only public save path for A.
  - Input: resolver input plus the latest activation preview metadata needed for idempotency checks.
  - Server re-resolves or verifies source data before saving. Do not trust client-submitted source facts.
  - Saves a live activated record as a persistent Multipass.
  - Idempotent by canonical source ID unless explicitly forked by admin.

- `GET /api/multipass/:slugOrId`
  - Returns public Multipass profile JSON.
  - Response must include canonical `multipassId` and `slug` so claim/dashboard routes never depend on ambiguous display URLs.

- `GET /api/multipass/:slugOrId/card`
  - Returns agent-card shaped public card.

- `GET /api/multipass/:slugOrId/fragments`
  - Returns public fragments only.

- `POST /api/multipass/:id/claim/nonce`
  - Creates a short-lived claim nonce.

- `POST /api/multipass/:id/claim/verify`
  - Verifies wallet signature or creates a manual review request with proposed manager wallet.
  - For successful wallet verification, returns a CSRF token in the response body and sets the HTTP-only manager session cookie.
  - For approved manual review claims, only the approved proposed manager wallet can later sign to create the manager session.

- `PATCH /api/multipass/:id/profile`
  - Manager-session-only safe public profile edits.
  - Reject if the HTTP-only manager session is missing, expired, revoked, scoped to another Multipass, missing a valid CSRF token, or sent from an unexpected origin.

- `POST /api/multipass/:id/session/logout`
  - Revokes the current manager session for that Multipass.

- `GET /api/multipass/:id/changes`
  - Public change log.

### Web flow

A1 public Activate save flow:

1. User resolves live record.
2. Activation summary appears.
3. Button appears: `Save Multipass`.
4. Saving creates a stable URL, for example `/multipass/bendr-2` or `/multipass/mp_...`.
5. Share panel uses the stable URL instead of only `?agent=`.

A2 claim flow:

1. Saved unclaimed profile shows `Claim management`.
2. User chooses wallet proof or review request.
3. Wallet proof signs a clear non-transaction message.
4. Verified owner reaches owner dashboard lite after wallet proof creates a scoped manager session.
5. Manual review shows pending status and does not unlock editing while pending.
6. If manual review is approved, the approved proposed manager wallet must sign before dashboard editing unlocks. The profile is labeled review-approved, not wallet-verified owner.

A3 owner dashboard lite:

- Public profile summary.
- Source record summary.
- Claim status.
- Safe public field editor.
- Visibility toggles for optional public fields.
- Change log.
- Danger-zone copy that says authority, tools, credentials, and custody are not managed here yet.

### Editable fields in A

Allowed:

- Display name override.
- Headline.
- Short description.
- Avatar/image URL if safe.
- Website URL if safe.
- Public social links if safe.
- Tags/domains.
- Public contact route.
- Featured source/proof ordering.

Blocked:

- Owner wallet edits.
- Custody status edits.
- Cred score edits.
- Trust tier edits.
- Verified flag edits.
- Contract address edits.
- Token ID edits.
- Private fragments.
- Tool permissions.
- Payment settlement claims.

### A success criteria

- A live record can be activated and saved as a persistent Multipass.
- Saved profile has a stable public URL.
- Unclaimed vs claimed state is visible.
- Claim proof can verify a matching owner wallet or create a pending review request.
- Claimed manager can edit only safe public fields.
- Change log records every save and edit.
- Public API returns sanitized profile/card/fragments for saved records.
- Static preview and unsaved Activate flow still work.
- No public copy implies custody transfer, asset transfer, tool transfer, secret transfer, permission grant, or current NFT binding to an existing identity.

## Scope boundary after A

B and C are non-blocking for A. A should create data boundaries that B and C can reuse, but implementation plans for A must not include SDK publishing, OpenAPI hardening, collection directory work, NFT token preview, or trusted NFT adapter ingestion unless explicitly promoted into a later A sub-slice.

## MVP B - Developer/API MVP

### Goal

Make saved Multipass records useful to agents, apps, and partners without scraping the web UI.

### API surface

Stabilize public read endpoints:

- `GET /api/multipass/:id`
- `GET /api/multipass/:id/card`
- `GET /api/multipass/:id/fragments`
- `GET /api/multipass/:id/standards`
- `GET /api/multipass/:id/x402`
- `GET /api/multipass/:id/receipts`
- `GET /.well-known/multipass.json`
- `GET /api/openapi.json`

Add resolver endpoints:

- `GET /api/resolve?agent=<input>`
- `GET /api/search?q=<name>` for exact or conservative prefix matches only.

Search should not become ranking or discovery marketplace in B.

### SDK

Add SDK helpers:

- `resolveMultipass(input)`
- `getMultipassProfile(id)`
- `getAgentCard(id)`
- `getPublicFragments(id)`
- `validateMultipassProfile(data)`
- `isClaimed(profile)`
- `getActivationSummary(profile)`

### Documentation

Ship:

- OpenAPI spec.
- Quickstart for agents.
- Quickstart for web apps.
- Example JSON responses.
- Copy rules for partners.
- Trust boundary guide.

### B success criteria

- A partner can resolve and render a saved Multipass from API docs alone.
- Agent-readable JSON validates against versioned schemas.
- SDK helpers pass schema tests.
- Public API never exposes private fields.
- Docs explain that payments and receipts do not buy trust.

## MVP C - NFT Collection MVP

### Goal

Add a collection-focused Activate path for NFT-backed agents while preserving honest adapter behavior.

### Collection directory

Add collection records with:

- Collection name.
- Chain.
- Contract address.
- Verification status.
- Adapter support status.
- Example token IDs.
- Public metadata source.
- Supported Activate behavior.
- Warning or note if collection is community-added or unverified.

### NFT Activate flow

The NFT flow can support:

- Collection page.
- Token lookup.
- NFT metadata preview.
- Adapter metadata check.
- Activate into Multipass.
- Saved Multipass link.

The UI may say `Activated from NFT` only when trusted resolver metadata proves:

```js
activation.origin === 'nft_adapter_new_erc8004'
activation.originSource === 'trusted_resolver_metadata'
```

Current adapter behavior must be framed as creating a new ERC-8004 identity. Binding NFTs to an existing identity remains future-facing until the adapter supports and proves it.

### C non-goals

- No full marketplace.
- No auction/listing execution.
- No custody transfer.
- No royalty management.
- No claim that NFT ownership automatically grants Multipass management rights unless verified by the claim flow.
- No broad collection indexing without verification status.

### C success criteria

- A verified collection page can explain how Activate works.
- A token can be previewed and activated through trusted adapter metadata.
- NFT-origin labels are never inferred from token or collection fields alone.
- Community/unverified collections are clearly marked.
- Saved Multipass records from NFT Activate use the same A and B data model.

## Architecture

### Components

1. **Resolver service**
   - Accepts supported inputs.
   - Fetches public live source data.
   - Normalizes source records.
   - Produces activation state.

2. **Multipass repository**
   - Persists saved records.
   - Enforces uniqueness and slug rules.
   - Provides sanitized public reads.
   - Supports tests with in-memory storage.

3. **Claim service**
   - Creates claim nonces.
   - Verifies wallet signatures.
   - Creates manual review requests.
   - Creates scoped manager sessions after verified proof.
   - Updates claim state only after proof.

4. **Manager session service**
   - Issues, validates, renews, and revokes short-lived manager sessions.
   - Stores sessions server-side.
   - Scopes every session to a single Multipass ID and manager wallet.

5. **Profile management service**
   - Validates safe editable fields.
   - Applies manager edits.
   - Writes change log entries.

6. **Public API**
   - Serves profile/card/fragments/standards/x402/receipt data.
   - Applies privacy filtering.
   - Adds CORS and cache headers for public reads.

7. **Web app**
   - Activate/save/share flow.
   - Claim flow.
   - Owner dashboard lite.
   - Public profile rendering.

8. **Collection adapter layer**
   - Added in C.
   - Reads trusted NFT adapter metadata.
   - Produces collection and token activation context.

### Data flow for A

```text
User input
  -> resolver validation
  -> public Helixa/API fetch
  -> normalized activation preview
  -> user saves Multipass
  -> persistent record created
  -> stable public URL returned
  -> optional claim flow
  -> dashboard edits safe public fields
  -> public profile/API reflect saved record plus source context
```

### Trust boundaries

- Source data is public evidence, not absolute truth.
- Claim proof controls profile management only.
- Owner wallet match does not move the underlying asset.
- Editable profile fields are user-authored metadata and should be labeled or distinguishable from source facts.
- Cred, ownership, verification, and activation origin fields should come from source or trusted services only.

## Error handling

- Resolver validation errors do not create records.
- Source fetch failures keep the current preview and show a clear retryable error.
- Save failures do not claim activation succeeded.
- Duplicate save returns the existing Multipass record unless admin explicitly forks.
- Claim nonce expiration requires a new nonce.
- Signature mismatch leaves the record unclaimed.
- Verified source-owner wallet signature creates a scoped manager session.
- Approved manual review plus approved manager-wallet signature creates a scoped manager session labeled review-approved.
- Expired, revoked, wrong-scope, CSRF-invalid, or unexpected-origin manager sessions cannot edit profile fields.
- Manual review creates pending state, not edit access.
- Manual review approval alone does not create edit access without the proposed manager wallet signature.
- Unsafe profile field input returns field-specific validation errors.
- API reads of archived/private records return stable 404 or limited public state according to visibility policy.

## Security and privacy

- Do not store secrets.
- Do not expose private fragments.
- Do not trust client-submitted source facts.
- Verify signatures server-side.
- Use short-lived claim nonces.
- Use server-side manager sessions with HTTP-only cookies.
- Protect cookie-authenticated write routes with CSRF tokens and Origin/Referer checks.
- Rate-limit claim and save endpoints.
- Sanitize URLs before rendering.
- Keep admin seeded claims auditable.
- Keep public change logs separate from server-only audit logs.

## Copy rules

Use:

- `Activate`
- `Multipass`
- `AgentDNA profile`
- `display-only`
- `public source record`
- `claim management`
- `owner dashboard lite`

Avoid implying:

- asset transfer
- custody transfer
- tool movement
- secret movement
- permission grant
- current NFT binding to an existing ERC-8004 identity
- payment as reputation

## Testing plan

A tests:

- Resolver still supports current live Activate behavior.
- Save creates persistent record.
- Duplicate save returns existing record.
- Stable slug routes render saved profile.
- Claim nonce creation and expiration.
- Matching owner wallet signature verifies claim and creates scoped manager session with returned CSRF token.
- Mismatched wallet signature fails.
- Manual review creates pending state only and stores a proposed manager wallet.
- Admin approval path can approve a pending claim and writes audit/change-log entries without labeling review-only claims as wallet-verified owners.
- Approved manual review requires the proposed manager wallet to sign before edit access is created.
- Expired, revoked, missing, wrong-scope, CSRF-invalid, or unexpected-origin manager sessions cannot edit.
- Manager can edit allowed fields.
- Manager cannot edit source facts or trust fields.
- Public API filters private/system fields.
- Public slug reads return canonical `multipassId` and `slug` for claim/dashboard routes.
- Change log records save, claim, and edit events.
- Static preview remains available.

B tests:

- Public endpoints validate against schemas.
- SDK helper tests cover resolve, fetch, validate, and activation summary.
- OpenAPI examples match actual responses.
- CORS behavior is correct for public reads.
- Private fields never appear in public JSON.

C tests:

- Collection pages show verification status.
- Trusted NFT adapter metadata produces NFT-origin label.
- Untrusted NFT-looking data does not produce NFT-origin label.
- Current adapter copy says new ERC-8004 identity, not existing-identity binding.
- Community collection status is visible.

## Rollout plan

1. **A1 - Persistent saved records**
   - API storage.
   - Save Multipass from live Activate.
   - Stable public saved profile URL.

2. **A2 - Claim flow**
   - Nonce endpoint.
   - Wallet proof verification.
   - Manual review request state.

3. **A3 - Owner dashboard lite**
   - Safe field edits.
   - Visibility controls.
   - Change log.

4. **A4 - Public polish**
   - Saved share URLs.
   - Empty/error states.
   - Copy hardening.
   - Deployment smoke tests.

5. **B1 - Public API hardening**
   - Versioned routes.
   - OpenAPI.
   - Schema validation.

6. **B2 - SDK and docs**
   - SDK helpers.
   - Partner quickstarts.
   - Examples.

7. **C1 - Collection directory**
   - Curated collection records.
   - Verification labels.
   - Collection pages.

8. **C2 - NFT Activate**
   - Trusted adapter metadata ingestion.
   - Token preview.
   - Save to same Multipass model.

## MVP done definition

The MVP is complete when:

- A user can activate, save, claim, edit safe public fields, and share a Multipass.
- Developers can resolve and read the saved Multipass via public API and SDK helpers.
- NFT collections have a verified directory and at least one honest NFT Activate path using trusted metadata.
- Tests and live smoke checks prove public pages and APIs avoid custody, transfer, permission, secret, reputation-purchase, and unsupported NFT binding overclaims.

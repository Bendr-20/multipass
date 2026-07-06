# Multipass Marketplace Connections Editor and URL Import Design

## Status

Approved for implementation planning.

## Goal

Give claimed Multipass managers a safe way to publish, edit, and retire optional Marketplace Connections from the manager dashboard. The first version supports both manual entry and paste-URL prefill, but publishing always requires manager review.

## User-facing behavior

### Manager entry point

Add a claimed-manager panel near the existing public route and fragment management controls:

- Heading: `Marketplace Connections`
- Primary action: `Add marketplace connection`
- Safety copy: `Display-only public metadata. Multipass does not execute marketplace tasks, collect credentials, enforce payment, transfer custody, or grant tools.`

The panel is visible only after a valid manager session is present, following the same claimed profile rules used by current manager controls.

### Add flow

1. Manager opens the add form.
2. Manager may paste a public marketplace URL.
3. The UI creates a local draft from the URL only:
   - profile URL
   - marketplace label from a known host map or cleaned hostname fallback
   - possible listing ID from the last meaningful path segment
4. Manager edits the draft manually.
5. Manager clicks publish.
6. The public Marketplace Connections card appears after the saved record refreshes.

The importer does not fetch remote pages in this slice. It parses the URL client-side and never follows links, calls marketplaces, signs requests, pays x402 invoices, or uses API keys.

### URL draft rules

`createMarketplaceDraftFromUrl(url)` is a pure function. It returns `{ draft, error }`, never performs network requests, and never mutates saved profile state.

For valid HTTPS URLs:

- Normalize `profile_url` with the platform `URL` parser.
- Reject URLs with embedded credentials. If `username` or `password` is present after parsing, return error `Marketplace URL must not include credentials.`
- Remove the URL hash.
- Preserve query parameters.
- Lowercase the hostname.
- Remove a trailing slash unless the path is `/`.
- Set `status` to `public_import`.
- Set `marketplace` from the known host map below, or from the fallback rule.
- Set `listing_id` from the last non-empty path segment after URL decoding. If percent-decoding fails, ignore that segment and continue without a listing ID. Ignore the segment if it contains unsafe public text or exceeds 120 characters.
- Set `title` to the listing ID when present, otherwise the marketplace label.
- Leave `summary`, services, payment rails, reputation, facts, and source checked date blank for manager review.

Known host map:

| Host match | Marketplace label |
| --- | --- |
| `bankr.bot` or `*.bankr.bot` | `Bankr` |
| `okx.ai` or `*.okx.ai` | `OKX.AI` |
| `social.moltx.io`, `moltx.io`, or `*.moltx.io` | `MoltX` |
| `agentgram.xyz` or `*.agentgram.xyz` | `AgentGram` |
| `virtuals.io` or `*.virtuals.io` | `Virtuals` |
| `opensea.io` or `*.opensea.io` | `OpenSea` |

Fallback marketplace label rule:

1. Start with the lowercase hostname without leading `www.`.
2. Drop one final suffix if it is one of `com`, `org`, `net`, `ai`, `io`, `xyz`, `bot`, `gg`, or `app`.
3. Replace dots and hyphens with spaces.
4. Title-case each word.
5. If the result is empty, use the cleaned hostname.

Importer examples:

| Input URL | Result |
| --- | --- |
| `https://bankr.bot/agents/helixa` | marketplace `Bankr`, profile URL `https://bankr.bot/agents/helixa`, listing ID `helixa`, title `helixa`, status `public_import` |
| `https://www.okx.ai/agent/WorldCupCaller/?ref=mp#top` | marketplace `OKX.AI`, profile URL `https://www.okx.ai/agent/WorldCupCaller?ref=mp`, listing ID `WorldCupCaller`, title `WorldCupCaller`, status `public_import` |
| `https://market.example.test/listings/alpha-1/` | marketplace `Market Example Test`, profile URL `https://market.example.test/listings/alpha-1`, listing ID `alpha-1`, title `alpha-1`, status `public_import` |
| `https://agentgram.xyz/` | marketplace `AgentGram`, profile URL `https://agentgram.xyz/`, listing ID blank, title `AgentGram`, status `public_import` |
| `http://bankr.bot/agents/helixa` | error `Marketplace URL must use https.` |
| `https://user:pass@bankr.bot/agents/helixa` | error `Marketplace URL must not include credentials.` |
| `not a url` | error `Marketplace URL must be a valid URL.` |

### Editable fields

Required:

- Marketplace name
- Public profile/listing URL
- Display title or short listing label
- Summary

Optional:

- Listing ID
- Services, up to 8 rows
  - name
  - price label
  - payment mode
  - endpoint URL
- Payment rails, up to 8 rows
  - asset
  - mode
  - chain
- Reputation facts, up to 4 named fields
  - score
  - positive rate
  - sold count
  - review count
- Provenance facts, up to 8 rows
  - label
  - value
- Source checked date
- Display status, stored as `marketplace_ref.status`

Allowed display statuses:

- `manager_supplied`
- `public_import`
- `pending`
- `stale`
- `disputed`

Do not expose `verified` or `platform_verified` as manager-selectable statuses. Stronger statuses require a separate platform check design.

Display status and fragment lifecycle status are separate fields:

| `marketplace_ref.status` | Fragment `status` | Notes |
| --- | --- | --- |
| `manager_supplied` | `pending` | Default for manual drafts. |
| `public_import` | `pending` | Default for URL-prefilled drafts after manager review. |
| `pending` | `pending` | Explicit review-pending display. |
| `stale` | `stale` | Public card may render stale context. |
| `disputed` | `disputed` | Public card may render disputed context. |

`revoked` is not a display status. Retire uses the revoke endpoint, sets the fragment status to `revoked`, and hides the public card.

### Edit flow

Existing owner-submitted Marketplace Connections can be edited from the same panel. Edits update the backing manager-created fragment and refresh the public card.

Imported or platform-created records remain read-only in this panel unless they use the manager-owned source shape described below.

### Retire flow

Retire uses the existing fragment revoke behavior:

- Set the backing fragment status to `revoked`.
- Hide revoked records from the public Marketplace Connections panel.
- Preserve audit and change history.
- Do not physically delete the fragment from history.

## Data model

### Backing record

Each manager-created Marketplace Connection is stored as one public identity fragment.

Fragment shape:

- `fragment_type`: `attestation`
- `status`: lifecycle status derived from `marketplace_ref.status`; one of `pending`, `stale`, `disputed`, or `revoked`
- `assurance_level`: `self_attested`
- `visibility`: `public`
- `transfer_policy`: `historical_on_transfer`
- `source.source_type`: `owner_submission`
- `source.issuer`: `null`
- `source.reference_url`: marketplace profile/listing URL
- `public_value`: human summary for generic proof views
- `marketplace_ref`: structured public Marketplace Connection metadata

`marketplace_ref` is a new optional identity fragment field. It is allowed only on `attestation` fragments in manager writes for this slice.

Status derivation happens in the backend. Create and update payloads from the Marketplace Connections manager do not send a top-level `status`. The backend sets top-level fragment `status` from `marketplace_ref.status` using the table above. Generic fragment management may still send top-level `status` for non-marketplace fragments.

### `marketplace_ref` contract

```json
{
  "marketplace": "Bankr",
  "profile_url": "https://bankr.bot/agents/helixa",
  "title": "Helixa agent profile",
  "summary": "Public marketplace listing for Helixa services.",
  "listing_id": "helixa",
  "status": "manager_supplied",
  "source_checked_at": "2026-07-06T00:00:00.000Z",
  "services": [
    {
      "name": "Deep CRED report",
      "price": "$1 USDC",
      "payment_mode": "x402",
      "endpoint_url": "https://api.example.test/service"
    }
  ],
  "payment_rails": [
    {
      "asset": "USDC",
      "mode": "x402",
      "chain": "Base"
    }
  ],
  "reputation": {
    "score": "",
    "positive_rate": "",
    "sold_count": "",
    "review_count": ""
  },
  "facts": [
    {
      "label": "Source",
      "value": "Manager supplied public listing"
    }
  ]
}
```

### Validation rules

- All URLs must be valid HTTPS URLs.
- All public URLs, including profile/source URLs and service endpoint URLs, must reject embedded credentials. If `username` or `password` is present after parsing, reject the URL rather than stripping it.
- Text fields are trimmed and rejected if they contain obvious unsafe public content such as angle brackets, `javascript:`, `data:`, `file:`, or inline event handler patterns.
- `source_checked_at` accepts blank, `YYYY-MM-DD`, or a valid ISO-8601 date-time string.
- `YYYY-MM-DD` is normalized to `YYYY-MM-DDT00:00:00.000Z`.
- ISO date-times are normalized to UTC ISO strings.
- Invalid dates are rejected with `source_checked_at must be a valid date.`
- Future dates later than the request clock plus five minutes are rejected with `source_checked_at cannot be in the future.`
- Blank `source_checked_at` is omitted on create and clears `marketplace_ref.source_checked_at` on update.
- Field limits:
  - marketplace: 80 chars
  - title: 120 chars
  - summary: 500 chars
  - listing ID: 120 chars
  - service name: 120 chars
  - price label, payment mode, asset, chain: 80 chars
  - fact label: 80 chars
  - fact value: 160 chars
- Arrays are bounded to the row limits listed above.
- Empty optional rows are dropped.
- At least one renderable detail beyond marketplace name must exist: profile URL, listing ID, service, payment rail, reputation fact, provenance fact, status, or source checked date.
- Manager writes cannot set `assurance_level`, `verified_at`, `verifier`, platform issuer fields, private visibility, gated visibility, custody fields, wallet signing fields, tool grants, or execution authority.

## Backend design

### Payload contracts

Create payload sent by the Marketplace Connections manager:

```json
{
  "fragment_type": "attestation",
  "public_value": "Marketplace connection: Helixa agent profile on Bankr. Public marketplace listing for Helixa services.",
  "reference_url": "https://bankr.bot/agents/helixa",
  "transfer_policy": "historical_on_transfer",
  "marketplace_ref": {
    "marketplace": "Bankr",
    "profile_url": "https://bankr.bot/agents/helixa",
    "title": "Helixa agent profile",
    "summary": "Public marketplace listing for Helixa services.",
    "listing_id": "helixa",
    "status": "manager_supplied"
  }
}
```

Update payload sent by the Marketplace Connections manager:

```json
{
  "public_value": "Marketplace connection: Updated title on Bankr. Updated summary.",
  "reference_url": "https://bankr.bot/agents/helixa",
  "transfer_policy": "historical_on_transfer",
  "marketplace_ref": {
    "marketplace": "Bankr",
    "profile_url": "https://bankr.bot/agents/helixa",
    "title": "Updated title",
    "summary": "Updated summary.",
    "listing_id": "helixa",
    "status": "stale"
  }
}
```

Payload rules:

- `profile_url` and top-level `reference_url` must be the same normalized HTTPS URL.
- `public_value` is generated as `Marketplace connection: {title} on {marketplace}. {summary}` and is capped at 1000 characters by existing fragment rules.
- `marketplace_ref` updates replace the whole previous `marketplace_ref`; they are not deep-merged.
- Create and update omit top-level `status`; the backend derives it from `marketplace_ref.status`.
- Create and update always send `transfer_policy: historical_on_transfer` for Marketplace Connections.
- Retire sends no marketplace payload. It calls `revokeMultipassFragment(id, fragmentId)`.

### Fragment normalization

Extend `apps/api/src/fragment-manager.js`:

- Accept `marketplace_ref` on create and update for `attestation` fragments.
- Reject `marketplace_ref` on all other fragment types.
- Normalize it with the validation rules above.
- Require top-level `reference_url` to equal normalized `marketplace_ref.profile_url` when `marketplace_ref` is present.
- Derive top-level fragment status from `marketplace_ref.status`.
- Keep assurance as `self_attested`.
- Keep transfer policy for Marketplace Connections as `historical_on_transfer`.
- For existing fragments that already have `marketplace_ref`, reject top-level-only updates to `status`, `reference_url`, or `transfer_policy` unless the same request also sends a complete replacement `marketplace_ref` and passes the derivation rules above.
- Generic fragment management may update non-marketplace owner-submitted fragments, but must not mutate Marketplace Connection fragments through generic top-level controls.

### Schema and SDK

Update the identity fragment schema and SDK validation so `marketplace_ref` is recognized as an optional object. The field remains public-safe and bounded. No other fragment type changes are required.

### Saved records

Reuse existing methods:

- `createPublicFragment`
- `updatePublicFragment`
- `revokePublicFragment`

No new write table is needed. No marketplace-specific payment, wallet, crawler, or task route is introduced.

Audit events can continue to use the existing public fragment event types. The change message should mention Marketplace Connection when `marketplace_ref` is present, for example:

- `Marketplace connection added: Bankr.`
- `Marketplace connection updated: Bankr.`
- `Marketplace connection retired: Bankr.`

### Public API response

When reading saved Multipass records, derive `marketplacePresence` from public fragments with `marketplace_ref`:

- Include only `visibility: public`.
- Skip `status: revoked`.
- Skip malformed or incomplete refs.
- Map fragment assurance into `proof.assurance`.
- Map `source.reference_url` and `source.observed_at` into source metadata when the ref omits them.
- Return the derived, de-duped list at top-level `marketplacePresence`.
- Also mirror it under `profile.marketplacePresence` only when the response already emits profile-level marketplace data for backward compatibility.
- Use the same normalization and de-dupe rules specified in Public renderer integration so API and frontend output do not diverge.

Existing fixture or static `marketplacePresence` data may remain for demos, but saved manager-created records should come from fragments.

## Frontend design

### New module

Add `apps/web/src/marketplace-connection-manager.js` with pure helpers plus render/bind functions:

- `createMarketplaceDraftFromUrl(url)`
- `compactMarketplaceConnectionInput(formData)`
- `compactMarketplaceConnectionPatch(formData, current)`
- `renderMarketplaceConnectionManagerPanel(state)`
- `bindMarketplaceConnectionManager(root, handlers)`

The module should not perform network requests.

`compactMarketplaceConnectionInput(formData)` returns the create payload shown above. It builds a complete normalized `marketplace_ref`, not a partial patch. `compactMarketplaceConnectionPatch(formData, current)` returns the update payload shown above and also replaces the full previous `marketplace_ref`.

For manual forms that did not start from URL prefill, default `marketplace_ref.status` to `manager_supplied`. For URL-prefilled forms, default it to `public_import`. If the manager changes the display status selector, use the selected value.

### Generic fragment manager interaction

Marketplace Connection fragments must be hidden from the generic fragment manager edit forms or shown as read-only with a handoff message: `Edit this in Marketplace Connections.` This prevents a manager from changing top-level attestation fields without updating the structured Marketplace Connection metadata.

The Marketplace Connections panel is the only frontend path that edits fragments containing `marketplace_ref`.

### Dashboard integration

In the claimed profile dashboard:

- Render the Marketplace Connections manager panel after route management and before generic fragment management, or in the same trust/profile management area.
- Use existing saved API functions:
  - publish calls `createMultipassFragment`
  - save calls `updateMultipassFragment`
  - retire calls `revokeMultipassFragment`
- Store async status and errors separately from route and generic fragment manager state so failures are localized.

### Public renderer integration

Update `getMarketplacePresenceEntries(data)` to combine entries in this order:

1. derived entries from `data.fragments.fragments` with `marketplace_ref`
2. explicit `data.marketplacePresence` entries
3. explicit `data.profile.marketplacePresence` entries

Derived entry mapping:

| Entry field | Source |
| --- | --- |
| `fragmentId` | `fragment.fragment_id` |
| `marketplace` | `marketplace_ref.marketplace` |
| `listingId` | `marketplace_ref.listing_id` |
| `profileUrl` | `marketplace_ref.profile_url` |
| `title` | `marketplace_ref.title` |
| `summary` | `marketplace_ref.summary` |
| `status` | `marketplace_ref.status`, falling back to `fragment.status` |
| `services` | `marketplace_ref.services`, preserving `endpoint_url` as `endpointUrl` for render helpers |
| `paymentRails` | `marketplace_ref.payment_rails` |
| `reputation` | `marketplace_ref.reputation` |
| `facts` | `marketplace_ref.facts` |
| `source.label` | `Manager supplied source` for `manager_supplied`, `Public import source` for `public_import`, otherwise `Source` |
| `source.url` | `marketplace_ref.profile_url`, falling back to `fragment.source.reference_url` |
| `source.checkedAt` | `marketplace_ref.source_checked_at`, falling back to `fragment.source.observed_at` |
| `source.provenance` | `Manager supplied public metadata` for `manager_supplied`, `Public URL prefill reviewed by manager` for `public_import`, otherwise `Public marketplace metadata` |
| `proof.assurance` | `fragment.assurance_level` |
| `proof.fragmentId` | `fragment.fragment_id` |
| `proof.sourceType` | `fragment.source.source_type` |

Skip derived entries when:

- `fragment.visibility` is not `public`
- `fragment.status` is `revoked`
- `fragment.marketplace_ref` is missing or malformed
- required `marketplace`, `profile_url`, `title`, or `summary` is missing after normalization
- `profile_url` is not a renderable HTTPS URL

De-dupe rules:

1. Build a key from normalized profile URL when present.
2. Otherwise build a key from lowercase marketplace plus lowercase listing ID.
3. Otherwise use `fragment:{fragmentId}` for derived entries.
4. Normalize profile URLs by parsing as URL, lowercasing the hostname, removing the hash, removing one trailing slash unless the path is `/`, and serializing with the platform URL parser.
5. Keep the first entry for each key. Because derived entries are first, non-revoked fragment-derived entries win over explicit demo or fixture data for the same listing.

The public card should display title and summary if present, but continue rendering older records that only have marketplace, listing ID, services, payment rails, or reputation facts.

### Copy boundaries

Avoid wording that implies an official partnership or verified marketplace integration. Use phrases like:

- `Manager supplied`
- `Public import`
- `Display-only marketplace metadata`
- `Source checked`

Avoid phrases like:

- `official integration`
- `payment verified`
- `trusted seller`
- `verified marketplace account`
- `execute service`
- `connect wallet`

## Security and safety boundaries

This slice must not add:

- payments
- wallet signing
- custody or ownership changes
- escrow
- credential collection
- private keys or API key fields
- route execution
- tool execution
- tool grants
- onchain writes
- external crawler or authenticated scraping
- admin review tooling
- platform verification claims

The URL paste importer is only a convenience for starting a draft. It does not turn a pasted listing into trusted proof.

## Error states

Show inline errors for:

- invalid URL
- non-HTTPS URL
- unsafe text
- missing required marketplace name
- missing required profile URL
- missing required title or summary
- manager session expired
- API write failure

Do not clear the draft on failed publish or failed save.

## Tests

### API tests

Add focused coverage for:

- create public attestation with valid `marketplace_ref`
- update marketplace ref fields
- revoke hides from derived public presence
- reject non-HTTPS URLs
- reject URLs with embedded credentials
- reject unsafe text
- reject `marketplace_ref` on non-attestation fragments
- reject manager-set `verified` or `platform_verified` status
- reject top-level-only status, reference URL, or transfer policy patches on existing Marketplace Connection fragments
- normalize date-only and ISO `source_checked_at` values
- reject invalid and future `source_checked_at` values
- drop over-limit array rows beyond the specified maximums
- clear `source_checked_at` when update payload sends it blank
- preserve manager source, public visibility, self-attested assurance, and historical transfer policy

### Web tests

Add focused coverage for:

- paste URL creates a draft without network calls
- known host prefill and unknown HTTPS host fallback
- importer examples for trailing slash, query, hash, nested path, invalid URL, non-HTTPS URL, credentialed URL, and failed percent decoding
- manual publish calls `createMultipassFragment` with `fragment_type: attestation` and `marketplace_ref`
- edit calls `updateMultipassFragment` with `marketplace_ref`
- retire calls `revokeMultipassFragment`
- generic fragment manager hides or delegates marketplace fragments instead of offering generic edits
- public renderer derives cards from marketplace fragments
- de-dupe prefers fragment-derived entries over explicit demo data for the same normalized profile URL
- malformed marketplace refs are skipped
- unsafe URLs do not render as links
- empty state still renders when no records exist
- forbidden wording is absent from manager and public copy

### Verification commands

Run before claiming implementation complete:

```bash
pnpm test
pnpm web:build
```

Then smoke the live or local static bundle for:

- claimed manager dashboard renders the panel
- public profile renders saved Marketplace Connections
- revoked records stay hidden

## Acceptance criteria

- A claimed manager can paste a marketplace URL, review/edit the draft, publish it, and see a public Marketplace Connections card.
- A claimed manager can edit or retire manager-created Marketplace Connections.
- Marketplace Connections persist as public identity fragments, not a separate hidden store.
- Public cards are display-only and make no trust, payment, execution, or custody claims.
- Existing Marketplace Connections rendering remains backward compatible.
- Full tests and web build pass before deployment.

# Multipass Command Center and Tool Registry Cards Design

## Decision

Change the next Multipass slice from narrow x402 service cards to a broader **Owner Command Center plus Tool Registry Cards** surface.

Multipass should be the canonical trust/profile layer that sits above Bankr x402 services, OpenSea-style agent tool registries, public route references, receipts, schemas, pricing, access rules, and verifiability claims.

x402 becomes one payment and access mode inside a larger tool/service registry model. It should not be the whole category.

## Why the plan changed

Two external surfaces now matter to the product direction:

1. **Bankr Console and Bankr x402 Cloud**
   - Agents can publish and manage paid API services.
   - The Bankr CLI already exposes `bankr x402 init`, `add`, `configure`, `deploy`, `list`, `schema`, `call`, `pause`, `resume`, `delete`, and `revenue`.
   - Local Helixa planning already has `bankr.x402.json` with candidate services such as `agent-lookup`, `cred-report`, `agent-update`, `soul-lock`, `soul-share`, and `mint`.

2. **OpenSea-style Agent Tool Registry**
   - Tool discovery is moving toward manifest-backed registries with HTTPS endpoints, JSON Schema inputs/outputs, creator binding, pricing/access hints, verifiability metadata, and onchain commitments.
   - This overlaps directly with Multipass route metadata, fragment provenance, standards references, and trust summaries.

The right product move is to make Multipass the place where an agent's tools and services are explained, verified, priced, linked, and audited across registries.

## Product goal

A claimed Multipass manager should be able to answer:

- What public profile fields do I control?
- Which public routes point to this agent?
- Which tools and services can another agent discover?
- Which registry published each tool?
- What schema does the tool accept and return?
- What payment or access rule applies?
- Who created or operates the tool?
- What verifiability evidence exists?
- What receipts or changes prove recent activity?

The public viewer should understand the same information without seeing private credentials, secrets, wallet keys, runtime permissions, or hidden fields.

## Current baseline

Already live or present in code:

- Saved public Multipass records.
- Owner-wallet and manual-review manager claims.
- Scoped manager sessions with CSRF tokens.
- Public profile editing for display name, summary, profile image URL, tags, and visibility.
- Public endpoint route cards backed by endpoint identity fragments.
- Public route manager with route validation and safe HTTPS URLs.
- Public fragments, standards profile, agent card, x402 manifest, receipts, and change-log endpoints.
- Identity fragment schema already includes `endpoint` and `tool_manifest` fragment types.
- Endpoint fragments already support `endpoint_ref.manifest_url`.
- Current live x402 manifests return a valid empty manifest for saved records.

## Non-goals

Do not add in this slice:

- Bankr deployment automation from Multipass.
- OpenSea onchain tool registration from Multipass.
- Custody transfer.
- Tool execution buttons.
- Private credential release.
- Secret storage.
- Wallet key management.
- Payment settlement enforcement.
- Trust-score increases from payment alone.
- Admin review queues.
- Runtime permission grants.

The first product promise is still display, discovery, provenance, and review. Execution and settlement stay with the source systems.

## User experience

### Owner Command Center

Replace the stacked claim/edit/routes/fragments feel with one coherent owner surface.

Top section:

- Claim state.
- Manager session state.
- Visibility.
- Verification status.
- Source owner summary.
- Custody and transfer boundary note.
- Suggested next action.

Sections inside the command center:

1. **Profile**
   - Edit public display fields.
   - Keep the profile image helper copy that says visual edits do not change custody, tools, credentials, ownership, or source AgentDNA data.

2. **Routes**
   - Manage public display routes.
   - Routes remain simple endpoint references.
   - Route manager keeps existing safety copy and validation.

3. **Tools and services**
   - Import or publish tool/service cards.
   - Show Bankr x402 services and OpenSea-style manifest tools in one normalized list.
   - Each card is public unless the manager explicitly marks it gated or private later.

4. **Fragments**
   - Keep generic public proof fragment management.
   - Move it below profile, routes, and tools so the primary product path is clearer.

5. **Recent changes**
   - Show profile edits, route edits, tool imports, service status changes, manifest refreshes, and receipt attachments.

### Tool Registry Cards

Each card should show:

- Tool or service name.
- Source registry: Bankr x402 Cloud, OpenSea Agent Tool Registry, Helixa API, owner-submitted, or unknown.
- Endpoint URL.
- Manifest URL when present.
- Input schema summary.
- Output schema summary.
- Pricing summary.
- Access rule summary.
- Creator/operator proof.
- Verifiability tier or note.
- Status: pending, verified, stale, disputed, revoked, or historical.
- Last checked timestamp.
- Receipt count if receipts exist.

Visibility follows the existing identity fragment visibility model. A tool card is backed by a `tool_manifest` fragment, and that fragment's `visibility` controls where it appears:

- `public`: visible on public profile and public `/tools` API.
- `gated`: hidden from public `/tools` in this slice unless a later authorized/gated read path is added.
- `private`: manager/internal only.
- `hidden`: not discoverable through public or manager-facing normal reads except safety/recovery tooling.

The first import UI should default new tool cards to `public`, but the public API must filter by visibility. Do not return gated, private, or hidden tool card data from public reads.

Copy boundary:

- `Tool cards describe public discovery metadata. They do not call the tool, grant access, release credentials, transfer custody, or prove trust by payment alone.`

### Import paths

Offer three manager actions:

1. **Add public service URL**
   - For simple API, web, MCP, A2A, or x402 routes.
   - Reuses endpoint fragments and existing route validation.

2. **Import Bankr x402 service**
   - Accept a Bankr service URL or schema URL.
   - Fetch public schema metadata when available.
   - Store the normalized service as a tool card and, when appropriate, as an x402 manifest endpoint.
   - Do not deploy, pause, resume, or delete the Bankr service from Multipass in this slice.

3. **Import tool manifest**
   - Accept a manifest URL and optional registry/tool identifier.
   - Validate HTTPS.
   - Validate endpoint and manifest origin relationship where registry rules require it.
   - Validate creator address format when supplied.
   - Store manifest hash or content hash if supplied.
   - Store bounded schema summaries for display.
   - Keep raw manifest details bounded and public-safe.

## Data model

### Endpoint fragments stay route references

Endpoint fragments remain the canonical public route store.

Use endpoint fragments for:

- web profile links,
- API references,
- MCP references,
- A2A references,
- x402 endpoint references.

`endpoint_ref.url` remains the canonical route URL.

`endpoint_ref.manifest_url` can point to an x402 schema, OpenSea-style tool manifest, MCP manifest, A2A card, or similar public manifest.

### Tool manifest fragments become service/tool records

Use `fragment_type: "tool_manifest"` for normalized tool/service cards.

The parent identity fragment carries canonical lifecycle fields:

- `visibility`
- `status`
- `assurance_level`
- `transfer_policy`
- `source`
- `created_at`
- `updated_at`

The normalized `tool_manifest_ref` stores tool-specific fields only. Do not duplicate fragment visibility or status inside `tool_manifest_ref` unless a later schema version needs source-specific sub-status.

Add a schema extension for `tool_manifest_ref` on identity fragments:

```json
{
  "tool_id": "string",
  "registry": "bankr_x402_cloud | opensea_agent_tool_registry | helixa_api | owner_submitted | unknown",
  "name": "string",
  "description": "string",
  "endpoint_url": "https://...",
  "manifest_url": "https://...",
  "manifest_hash": "string | null",
  "creator_address": "0x... | null",
  "pricing": {
    "model": "free | fixed | metered | unknown",
    "amount": "string | null",
    "asset": "string | null",
    "chain_id": "number | null"
  },
  "access": {
    "summary": "string | null",
    "requires_owner_approval": "boolean | null"
  },
  "schemas": {
    "input_summary": "string | null",
    "output_summary": "string | null"
  },
  "verifiability": {
    "tier": "string | null",
    "summary": "string | null"
  },
  "last_checked_at": "date-time | null"
}
```

Keep this normalized. Do not persist unlimited raw manifests in public records.

### x402 manifest generation

The public `GET /api/multipass/{id}/x402` route should be derived from saved tool manifest fragments whose registry or endpoint protocol is x402.

Rules:

- Bankr x402 services populate x402 manifest endpoints.
- Non-x402 tools do not appear in the x402 manifest.
- Payment metadata is not trust metadata.
- Receipt fragments can link to x402 services but do not increase Cred by themselves.

### Agent card generation

The public agent card should summarize active public tools/services:

- capability labels from tool names and descriptions,
- service endpoints from endpoint and tool manifest fragments,
- `x402_manifest_url` when x402 services exist,
- accepted assets from x402 service cards,
- contact policy unchanged unless owner approval policy is explicitly set.

### Standards profile

The standards profile should include registry references without overclaiming authority.

- Bankr x402 Cloud reference: paid endpoint and receipt source.
- OpenSea Agent Tool Registry reference: tool manifest and creator-binding source.
- ERC-8257 or other standard IDs should only be named when the final standard identifier is confirmed.

## API design

### Public reads

Add one normalized read route:

- `GET /api/multipass/{id}/tools`

Response:

```json
{
  "schema_version": "0.1.0",
  "multipass_id": "mp_...",
  "tools": [],
  "summary": {
    "total": 0,
    "x402_count": 0,
    "verified_count": 0,
    "stale_count": 0
  }
}
```

Existing public routes remain:

- `/api/multipass/{id}/fragments`
- `/api/multipass/{id}/agent-card`
- `/api/multipass/{id}/x402`
- `/api/multipass/{id}/receipts`
- `/api/multipass/{id}/changes`

### Manager writes

Prefer the existing manager-session boundary, but add tool-specific validation.

Manager routes:

- `POST /api/multipass/{id}/tools/import`
- `PATCH /api/multipass/{id}/tools/{fragment_id}`
- `POST /api/multipass/{id}/tools/{fragment_id}/revoke`

The import route should fetch and validate public manifests server-side. The generic fragment API should remain the fallback for advanced/internal use, but the UI should call the tool-specific routes so validation errors are product-readable.

Do not hard-delete tool fragments in V0. Revoke by setting fragment `status` to `revoked`, appending change history, and excluding revoked tools from active x402 and agent-card derivations. Historical public reads may still show revoked public tools when the UI explicitly includes historical records.

### Validation

Client and server should reject:

- non-HTTPS endpoint URLs,
- non-HTTPS manifest URLs,
- unsafe schemes such as `javascript:`, `data:`, `file:`, and `http:`,
- unbounded schemas,
- malformed creator addresses,
- unsupported registry strings,
- tool IDs that collide inside the same Multipass,
- private-looking secrets in public fields,
- manager attempts to mark self-submitted tools as verified without a platform or registry proof.

Server validation remains authoritative.

### Server-side manifest fetch safety

Manifest import requires server-side fetch hardening. HTTPS validation alone is not enough.

Server fetch rules:

- Only fetch `https://` URLs.
- Reject URLs with usernames, passwords, non-default ports unless explicitly allowlisted, or unsafe schemes.
- Resolve DNS and reject private, loopback, link-local, multicast, localhost, and metadata-service IP ranges before connecting.
- Re-check the final resolved address after redirects.
- Allow at most one redirect by default, and only to another safe `https://` URL.
- Use short connection and response timeouts.
- Enforce a small response size cap before parsing.
- Accept only JSON content types for manifest imports unless a specific registry adapter documents another content type.
- Enforce JSON parse depth, object key count, array length, and schema-node limits before normalization.
- Do not send manager cookies, Authorization headers, internal headers, or ambient credentials to fetched manifest URLs.
- Do not fetch from RFC1918/private infrastructure even if the manager submits the URL.

If any fetch safety check fails, reject the import, leave existing tool cards untouched, and show a product-readable error.

## Bankr Console integration

First slice:

- Import Bankr x402 service metadata from a public Bankr endpoint/schema URL or a local `bankr.x402.json` style config.
- Show service price, asset, method, schema summary, and revenue/receipt placeholders when known.
- Populate the Multipass x402 manifest from saved Bankr service cards.

Later slice:

- Sync against Bankr Console APIs if they expose account-authenticated service metadata.
- Show live revenue, pause state, deployed URL, and endpoint status.
- Keep write operations such as deploy, pause, resume, and delete in Bankr Console unless explicitly authorized for Multipass.

## OpenSea Agent Tool Registry integration

First slice:

- Import a public manifest URL.
- Store normalized manifest fields.
- Show endpoint, inputs, outputs, creator address, access hints, pricing hints, and verifiability hints.
- Store an onchain registry reference only if a registry/tool ID is supplied and verified.

Later slice:

- Resolve onchain tool config by registry and tool ID.
- Verify manifest hash against onchain commitment.
- Verify creator address against onchain creator.
- Surface origin-binding and creator-binding status as separate verification results.

## Error handling

- If manifest fetch fails, show the failed URL and keep existing tool cards visible.
- If schema parsing fails, store nothing and show a product-readable error.
- If a manifest is too large, reject it with a bounded-size error.
- If a registry check is stale or unavailable, allow a pending self-attested card but label it clearly.
- If x402 derivation fails, keep the profile live and return an empty x402 endpoint list with an internal change/error note for managers.

## Testing plan

### Unit tests

- Tool manifest normalization accepts valid Bankr-style service config.
- Tool manifest normalization accepts OpenSea-style manifest fields.
- Validation rejects non-HTTPS endpoint and manifest URLs.
- Validation rejects malformed creator addresses.
- Validation rejects duplicate tool IDs.
- Validation bounds schema summaries.
- x402 manifest derivation includes only x402 tool cards.
- Agent card derivation includes public active tools.

### API tests

- `GET /api/multipass/{id}/tools` returns normalized public tools.
- Tool import requires manager session and CSRF token.
- Tool import rejects invalid manifest URLs.
- Tool import rejects SSRF-shaped manifest URLs, unsafe redirects, private IP targets, oversized responses, non-JSON content types, and over-deep schemas.
- Tool import keeps existing tools on failure.
- Tool revoke uses status-based revocation and updates tools, x402 manifest, agent card, and change history.
- Public fragments do not expose private/gated tool data.

### Web tests

- Owner Command Center renders profile, routes, tools, fragments, and changes in a clear order.
- Tool cards render Bankr x402 service details.
- Tool cards render OpenSea-style manifest details.
- Import errors appear inside the tool manager and do not clear route/profile state.
- Public profile shows tool/service cards without manager controls.
- No UI copy implies execution, custody transfer, credential release, or trust purchase.

### Build and smoke

- Full `pnpm test`.
- `MULTIPASS_BASE=/multipass/ pnpm web:build`.
- Live smoke for `/multipass/`, `/multipass/?agent=1`, `/multipass/?agent=81`, `/api/multipass/{id}/tools`, `/api/multipass/{id}/x402`, and `/api/multipass/{id}/agent-card`.

## Recommended implementation order

1. Refactor the claimed manager UI into Owner Command Center without changing data behavior.
2. Add tool manifest schema and read-model helpers.
3. Add public tool/service cards from static and saved fragments.
4. Add `GET /api/multipass/{id}/tools`.
5. Add manager import for Bankr-style x402 service metadata.
6. Derive x402 manifest and agent-card service summaries from tool fragments.
7. Add OpenSea-style manifest import validation.
8. Deploy Bendr as the canonical example with Helixa service cards.

## Open decisions

- Whether the first manager import should accept local `bankr.x402.json` only, public Bankr service URLs only, or both.
- Whether OpenSea registry verification should be pending/self-attested in V0 or blocked until onchain lookup is implemented.
- Whether x402 services should default to USDC, $CRED preferred, or source-provided asset only.
- Whether tool/service cards should appear on the main public profile by default or inside a collapsed `Tools and services` drawer.

## Success criteria

- A claimed manager sees one coherent command center instead of scattered controls.
- A public Multipass can show normalized tool/service cards from Bankr x402 and OpenSea-style manifests.
- The x402 manifest is no longer always empty when x402 service cards exist.
- The agent card summarizes active public tools and service endpoints.
- Payment metadata stays separate from trust, Cred, custody, and ownership.
- No private credentials, secrets, runtime permissions, or custody powers are exposed or implied.

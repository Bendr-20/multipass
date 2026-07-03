# Canonical Multipass Activation Profile Design

## Decision

Reframe Multipass around **activation-created, owner-managed profiles**.

A Multipass profile should be created when an agent, owner, or authorized manager links a source identity such as an ERC-8004 agent, Helixa AgentDNA record, or agent NFT. After activation, Multipass becomes the managed public trust and command profile for that agent: profile metadata, tools, routes, proof cards, x402 references, visuals, change history, and source evidence all resolve through one canonical profile shape.

The previous live resolver remains useful as a preview and source importer, but it should not be the product's primary mental model. The product should not feel like a passive read-only viewer.

## Product framing

Use these concepts consistently:

- **Activate Multipass**: create or open a Multipass profile from a source identity.
- **Source identity**: ERC-8004 agent, Helixa AgentDNA, Agent Aura, agent NFT, or other supported agent identity record.
- **Source-verified fields**: imported facts from a source identity that users can inspect but not casually rewrite as if they authored them.
- **Owner-managed profile**: the Multipass layer the authorized manager can update after proof.
- **Public trust profile**: the public, shareable view of identity, proof, routes, tools, and change history.
- **Command profile**: the owner/manager view for maintaining public metadata, routes, tools, proofs, and status.

Avoid broad “read-only profile” language except where it specifically describes public visitors or imported source evidence.

## What “read-only” still means

The safety boundary remains important, but it must be precise.

Public visitors are read-only:

- They can view the trust profile.
- They cannot edit profile fields, routes, tools, proofs, visual metadata, or status.
- They cannot claim custody, run tools, access private credentials, or trigger payments from the public profile.

Imported source evidence is source-verified:

- Source identity fields can be displayed as evidence.
- Multipass should not let a manager silently edit those imported fields in a way that makes them look source-authored.
- If a manager overrides display metadata, the UI should label it as manager-provided or Multipass-managed.

Management is not custody transfer:

- Claiming or activating a Multipass does not transfer NFTs, wallets, funds, private keys, secrets, or runtime authority.
- It authorizes safe public profile management inside Multipass.
- Tool cards describe discovery and access metadata. They do not execute tools or grant hidden credentials.

## Goals

1. Create one canonical hydrated Multipass profile shape used by both saved profile routes and live activation flows.
2. Make activation/linking the normal profile creation path.
3. Preserve public safety boundaries without making the product sound passive.
4. Stop duplicating client-side stitching logic between saved profiles, live Helixa resolver data, tools, routes, and visuals.
5. Support scale: adding tools to any activated profile should automatically appear wherever that profile is resolved.
6. Keep implementation incremental and compatible with the current live app.

## Non-goals

Do not add in this slice:

- Direct ERC-8004 onchain registration.
- NFT transfer or custody transfer.
- Tool execution buttons.
- Secret storage or private credential release.
- Bankr service deployment automation.
- OpenSea onchain tool registration from Multipass.
- Broad auto-materialization of every viewed live agent.
- A new trust score algorithm.

## Recommended approach

Build **Option A: Canonical read-through profile API with activation-aware language**.

The API should assemble one hydrated profile response for a requested source identity or saved Multipass ID. It should include source identity data, saved manager overlays, tools, routes, proofs, x402 references, visual context, and change history where available.

This is read-through in the backend sense: it resolves and combines data without creating new DB rows just because someone viewed an agent. Actual profile creation still happens through activation/linking.

Why this option first:

- It fixes the two-view bug class without making every page view mutate state.
- It supports current saved records and current live resolver links.
- It keeps activation intentional.
- It gives the frontend one data shape instead of stitching separate sources.

Later, add controlled activation writes:

- Activate from ERC-8004.
- Activate from Helixa AgentDNA.
- Activate from Agent Aura / agent NFT.
- Activate from owner-approved import.

## Architecture

### Current problem

The app currently has separate paths:

1. Saved Multipass profile route:
   - `/multipass/:slug`
   - loads saved profile, fragments, card, standards, x402, tools, and changes from Multipass API.

2. Live agent resolver route:
   - `/multipass/?agent=1`
   - loads public Helixa API data client-side.
   - then overlays a small amount of saved data in the browser.

This split caused Bendr's tools to appear on the saved route but not the live agent route. The immediate fix hydrated saved tools client-side, but the scalable fix is to move that composition server-side.

### New canonical layer

Add a canonical resolver in the Multipass API, for example:

```text
GET /api/multipass/resolve?source=helixa-agentdna:8453:<tokenId>
GET /api/multipass/resolve?source=erc8004:eip155:<chainId>:<identityRegistry>:<tokenId>
GET /api/multipass/resolve?source=agent-nft:eip155:<chainId>:<contract>:<tokenId>
GET /api/multipass/resolve?source=agent-aura:eip155:<chainId>:<contract>:<tokenId>
GET /api/multipass/:id/hydrated
```

Exact route names can be refined during implementation, but the shape should be one canonical hydrated document. Internally, normalize all source IDs to one canonical form before lookup. Human shorthand such as `8453:1` can remain accepted for Helixa AgentDNA input, but stored source context should use the explicit namespace (`helixa-agentdna:8453:1`) so ERC-8004 and NFT IDs cannot collide.

The resolver should:

1. Parse the requested identity.
2. Fetch or map source identity evidence.
3. Look for an existing saved Multipass record by source canonical ID and aliases.
4. Merge saved owner-managed overlays.
5. Attach public tools, routes, fragments, standards, x402, receipts, change history, and visual context.
6. Return one profile document for the web app.

### Canonical hydrated response

Suggested top-level shape:

```json
{
  "schema_version": "0.1.0",
  "mode": "activated | activation_preview | saved",
  "source_identity": {
    "kind": "helixa_agentdna | erc8004 | agent_nft | agent_aura",
    "canonical_id": "helixa-agentdna:8453:1",
    "chain_id": 8453,
    "token_id": "1",
    "contract_address": "0x...",
    "registry_address": "0x...",
    "source_url": "https://...",
    "verification_state": "source_verified | imported_unverified | unavailable"
  },
  "profile": {},
  "fragments": {},
  "agent_card": {},
  "standards": {},
  "x402": {},
  "tools": {},
  "routes": {},
  "visual_identity": {},
  "changes": {},
  "activation": {
    "state": "not_activated | activated | claimable | claimed | manual_review",
    "manager_state": "none | owner_verified | review_approved",
    "claim_url": "/multipass/..."
  },
  "routes_meta": {
    "public_profile": "/multipass/bendr-2-1",
    "activate": "/multipass/?agent=1"
  }
}
```

This response should reuse existing schema documents where possible rather than inventing new subdocuments.

## Activation model

### Activation inputs

Activation should eventually support:

1. **Helixa AgentDNA**
   - Source canonical ID: `helixa-agentdna:8453:<tokenId>`.
   - Owner proof: wallet owns the AgentDNA token or is approved by the source owner policy.

2. **ERC-8004 Identity Registry agent**
   - Source canonical ID: `erc8004:eip155:<chainId>:<identityRegistry>:<tokenId>`.
   - Owner proof: wallet owns the ERC-721 identity token or satisfies registry-approved management rules.
   - Source fields: `agentURI`, registration file, service endpoints, skills/domains, active state.

3. **Agent NFT / Agent Aura**
   - Source canonical ID: `agent-nft:eip155:<chainId>:<contract>:<tokenId>` or `agent-aura:eip155:<chainId>:<contract>:<tokenId>` when Agent Aura needs collection-specific handling.
   - Owner proof: wallet owns the NFT or source manager policy authorizes it.
   - Source fields: NFT metadata, image, collection, linked AgentDNA record where available.

### Activation output

Activation creates or opens a saved Multipass record with:

- Stable `multipass_id`.
- Stable slug.
- Source context and canonical ID.
- Public profile document.
- Public fragments created from source evidence.
- Agent card.
- Standards profile.
- x402 manifest.
- Receipts when present.
- Change-log entry saying the Multipass was activated from the source identity.

Activation should be idempotent. If the source identity is already activated, the API should return the existing Multipass rather than creating duplicates.

## Merge rules

Canonical resolution should prefer clarity over magic.

### Source-verified facts

Source-verified fields include token ID, chain, source contract or registry, owner, tokenURI or agentURI, source profile URL, source image, and source verification flags.

Rules:

- Preserve source provenance.
- Do not let manager-edited display fields overwrite source facts without labeling the override.
- Keep source facts in proof fragments and source identity metadata.

### Owner-managed overlays

Owner-managed fields include display name, summary, avatar URL, tags, public routes, public tool cards, public proof fragments, status notes, and change-log messages.

Rules:

- Saved owner-managed profile fields can shape the public page.
- Manager-provided visuals can override source visuals for display, but visual provenance must say they are manager-provided.
- Tools/routes belong to the Multipass layer and should appear on every canonical view of the activated profile.

### Unactivated previews

If no saved Multipass exists, return an activation preview, not a fake managed profile. This is the only allowed source-only public view.

Activation previews are allowed when:

- the source identity can be fetched or verified well enough to show bounded public evidence;
- no saved Multipass record exists for the normalized source canonical ID;
- the response clearly labels itself as `activation_preview`;
- the primary action is Activate Multipass, not passive browsing.

Activation previews must:

- show source evidence and an Activate action;
- explain what proof is required to create/manage the profile;
- avoid owner-managed language for tools, routes, or profile fields that do not exist yet;
- avoid saving a DB row just because a preview was viewed.

## User experience

### Public profile

Public copy should say:

- `Public trust profile`
- `Activated from Helixa AgentDNA #1`
- `Source-verified identity evidence`
- `Owner-managed tools and routes`
- `Public proof fragments`

Avoid:

- `read-only profile` as the main label.
- `display-only Multipass` as the product category.
- language implying tools are executable from the profile.

### Owner command profile

Owner copy should say:

- `Manage this Multipass`
- `Claim management`
- `Owner-managed public metadata`
- `Refresh tool status`
- `Add public route`
- `Import tool card`

Safety copy should be specific:

- `These edits update the Multipass public profile only. They do not transfer custody, NFTs, funds, secrets, or runtime authority.`
- `Tool cards describe discovery metadata. They do not execute tools or grant hidden access.`

### Activation preview

If a user resolves an unactivated source identity:

- Show source evidence.
- Show an Activate Multipass CTA.
- Explain what activation will create.
- Explain what proof is required.
- Avoid implying the profile is already owner-managed.

## Data flow

### Public view of activated profile

1. Browser requests a canonical hydrated profile.
2. API resolves source identity and saved Multipass record.
3. API merges source evidence and saved overlays.
4. Browser renders the single canonical response.
5. Public viewer sees no edit controls.

### Owner management flow

1. Owner opens activated profile.
2. Owner connects wallet through Privy.
3. API creates nonce scoped to the Multipass and source canonical ID.
4. Wallet signs nonce.
5. API verifies source owner or approved manager.
6. API issues manager session and CSRF.
7. Owner edits public profile/routes/tools/fragments through existing mutation routes.
8. Canonical reads reflect those changes everywhere.

### Activation flow

1. User enters source identity or arrives from an NFT/agent page.
2. API returns activation preview.
3. User clicks Activate Multipass.
4. API asks for owner proof.
5. Owner signs activation nonce or proves NFT ownership.
6. API creates saved Multipass record if one does not exist.
7. User lands on the owner-managed command profile.

## Error handling

- Missing source identity: return a clear not-found preview error.
- Unsupported chain or registry: return an unsupported-source message.
- Source API timeout: return source-unavailable state without creating or mutating a saved profile.
- Saved overlay missing: return `activation_preview`; do not create a generic source-only profile category.
- Malformed source metadata: preserve safe bounded fields, flag source evidence as `imported_unverified`, and never execute source text.
- Conflicting source vs manager fields: show source fact and manager display override separately.
- Tool route failure: keep old tool cards visible and mark stale only through explicit refresh logic.
- Unauthorized management: explain that management requires source-owner proof or manual review.

## Testing plan

### API tests

- Canonical resolver returns one hydrated document for an activated Helixa AgentDNA profile.
- Hydrated document includes saved public tools on both saved slug and source identity lookups.
- Hydrated document includes public routes, fragments, standards, x402, and changes when saved.
- Unactivated source identity returns activation preview without writing a DB row.
- Activation is idempotent for the same source canonical ID.
- Manager display overrides do not erase source-verified facts.
- Private, gated, and hidden tool fragments do not appear in public canonical reads.
- Unsupported ERC-8004 chain/registry returns a stable error.
- Malformed source metadata is treated as untrusted bounded content.

### Web tests

- `/multipass/:slug` and `/multipass/?agent=N` render from the same canonical hydrated shape.
- Activated Bendr profile shows both `agent-lookup` and `agent-aura-lookup` from canonical data.
- Public visitors see no manager controls.
- Claimed managers see profile, route, tool, fragment, and change sections.
- Activation preview uses Activate language, not read-only language.
- Source-verified and manager-managed labels are visible where fields differ.
- Safety copy avoids custody/tool execution overclaims.

### Build and smoke

- `pnpm test`
- `pnpm web:build`
- Live smoke for:
  - `/multipass/bendr-2-1`
  - `/multipass/?agent=1`
  - canonical API route for `8453:1`
  - public tools endpoint still reporting both Bendr tools

## Migration plan

1. Add canonical resolver API without removing existing endpoints.
2. Add web loader for canonical hydrated responses.
3. Switch live agent route to canonical API.
4. Switch saved slug route to canonical API if response parity is proven.
5. Keep old companion endpoints for external clients and compatibility.
6. Rename UI copy from broad read-only framing to activation/management framing.
7. Add activation preview semantics for unactivated source identities.
8. Later add controlled activation write flows for ERC-8004, Helixa AgentDNA, and agent NFTs.

## Rollout notes

This should ship in small slices:

1. Canonical read API for Helixa AgentDNA only.
2. Web route consolidation using canonical data.
3. Copy cleanup from read-only to activation/managed language.
4. Activation preview CTA without write flow.
5. Actual activation write flow after proof rules are fully tested.
6. ERC-8004 identity registry source adapter.
7. Agent NFT source adapter.

The first slice should solve the scaling bug class without changing ownership or activation state.

# Multipass Marketplace Connections Design

## Context

Multipass should be the portable trust/context layer across agent commerce surfaces. OKX.AI, OpenSea-style tool manifests, Bankr, ACP, and direct x402 services are optional external surfaces an agent may choose to publish. Multipass should not imply Helixa, Bendr, or a swarm is registered on a marketplace unless a real source-referenced connection exists.

The prior Marketplace Presence implementation proved the rendering surface, but the seeded OKX.AI example was too easy to read as a Helixa/OKX claim. This update changes the model from a seeded example to an always-available optional capability.

## Goal

Rename and reposition Marketplace Presence as **Marketplace Connections**:

- Every Multipass profile Trust context can show the section.
- If no marketplace connections are published, show a neutral empty state.
- If one or more real connections are published, render source-referenced public metadata cards.
- Treat OKX.AI, OpenSea, Bankr, ACP, and direct x402 as optional source types, not default claims.

## Non-goals

- Do not register anything on OKX, OpenSea, Bankr, ACP, or any marketplace.
- Do not perform payments, x402 payments, x401 proof collection, escrow actions, bidding, wallet signing, marketplace writes, or onchain writes.
- Do not scrape/import live marketplace data automatically in this pass.
- Do not create a competing marketplace or task board.
- Do not expose private credentials, gated data, or authority over marketplace accounts.
- Do not claim an official OKX/OpenSea/Bankr/ACP integration unless a real integration exists.
- Do not seed a fake marketplace listing into live/static demo profiles.

## User-facing behavior

On any Multipass profile, the Trust context drawer shows **Marketplace Connections** after public routes and before the legacy marketplace compatibility panel.

### Empty state

When no `marketplacePresence` records exist, the section renders neutral copy:

> No marketplace connections published yet.
> Agents can optionally add source-referenced public listings from OKX.AI, OpenSea, Bankr, ACP, direct x402 services, or other marketplaces. Empty means no public connection is published here; it does not imply absence elsewhere.

The empty state must not mention a specific marketplace as active for that profile.

### Published cards

When marketplace data is published, each card displays safe public metadata:

- Marketplace/source name, for example `OKX.AI`, `OpenSea`, `Bankr`, `ACP`, or `Direct x402`
- External listing/tool/profile ID, if published
- External public URL
- Published services/tools or service count
- Payment mode labels, for example `x402`, `escrow`, `USDT`, `ETH`, `USDC`, or `negotiable`
- Public reputation or provenance signals, if published
- Last checked timestamp or source timestamp
- Status/provenance, for example `public import`, `manager supplied`, or guarded `platform verified`
- Safety copy: public metadata only; viewing does not execute payments, change authority, call tools, release credentials, or prove trust by payment alone

## Data shape

Keep the existing optional profile-level collection. It remains generic:

```js
marketplacePresence: [
  {
    marketplace: 'OpenSea',
    listingId: 'base:0xabc...:123',
    profileUrl: 'https://opensea.io/assets/base/0xabc.../123',
    title: 'Agent tool manifest on OpenSea',
    summary: 'Public marketplace metadata for portable trust context.',
    status: 'manager_supplied',
    source: {
      label: 'OpenSea public item',
      url: 'https://opensea.io/assets/base/0xabc.../123',
      checkedAt: '2026-07-06T00:00:00Z'
    },
    services: [
      {
        name: 'Public agent tool manifest',
        price: null,
        paymentMode: 'metadata only',
        endpointUrl: null
      }
    ],
    reputation: {},
    paymentRails: ['metadata only'],
    proof: {
      assurance: 'public_metadata',
      fragmentIds: []
    }
  }
]
```

No marketplace entry should be present unless the profile owner, manager, importer, or API has a real public source to reference.

## Rendering architecture

### `renderMarketplacePresencePanel(data)`

Keep the existing helper name for compatibility, but render user-facing copy as **Marketplace Connections**.

Responsibilities:

- Accept profile-level `data.marketplacePresence` or `data.profile.marketplacePresence`.
- Render the section for every profile Trust context.
- If the collection is missing, empty, or only malformed entries, render the neutral empty state.
- Render valid cards with escaped text and safe external links only.
- Render services, payment rails, reputation facts, and source/provenance facts.
- Render safety copy.
- Preserve the platform-verified guard: show `Platform verified source` only when `proof.assurance === 'platform_verified'` and `source.url` is a safe public URL.

### Trust context integration

The Trust context drawer order remains:

1. Public routes
2. Marketplace Connections
3. Existing `marketplaceListing` compatibility panel, if present

## Static/demo data

Remove the seeded OKX.AI marketplace presence record from static/demo data. The static swarm profile and normal profiles should show the empty Marketplace Connections slot unless they have real marketplace records.

This avoids implying that Helixa, Bendr, Quigbot, or Helixa Swarm has registered on OKX.AI.

## Safety and wording constraints

Copy must avoid these claims:

- `payment proves trust`
- `private credentials available`
- `acts on behalf`
- `executes tools`
- `custody transfer`
- `authority over marketplace account`
- `official OKX integration`
- `official OpenSea integration`
- `registered on OKX`
- `registered on OpenSea`
- `collects x401 proof`
- `requires identity proof`

Allowed wording:

- `marketplace connections`
- `optional public marketplace metadata`
- `source-referenced listing`
- `metadata only`
- `does not execute marketplace actions`
- `does not prove trust by payment alone`
- `no marketplace connections published yet`

## Tests

Use TDD for implementation.

Required tests:

1. A profile without `marketplacePresence` renders Marketplace Connections empty state in Trust context.
2. Empty state appears on the static swarm route and does not mention OKX.AI as an active listing.
3. Existing valid marketplace records still render cards with service payment mode, safe links, status/provenance, and reputation facts.
4. OpenSea-style marketplace records render as optional public metadata without claiming official OpenSea integration or registration.
5. Unsafe external URLs are omitted.
6. Platform verified remains guarded by `proof.assurance === 'platform_verified'` plus safe `source.url`.
7. Existing public routes and legacy `marketplaceListing` still render.
8. Safety wording scan rejects authority/payment/credential/registration overclaims.

## Deployment and verification

Before deploy:

- Run focused web tests for marketplace connections.
- Run full `pnpm test`.
- Run `pnpm web:build`.

After deploy:

- Smoke `/multipass/`, `/multipass/agents`, `/multipass/swarm/helixa`, and at least one agent route.
- Verify live JS/CSS contains Marketplace Connections empty-state copy.
- Verify live JS/HTML does not contain seeded OKX.AI listing copy or blocked overclaim phrases.

## Future extensions

Later work can add:

- Manager-side marketplace connection editor.
- Import flow for public OKX.AI, OpenSea, Bankr, ACP, and direct x402 URLs.
- API endpoint for marketplace connection documents.
- Periodic source freshness checks.
- Multiple marketplace cards per profile.

Those remain out of scope for this patch.

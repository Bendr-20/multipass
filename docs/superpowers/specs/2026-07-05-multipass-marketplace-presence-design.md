# Multipass Marketplace Presence Design

## Context

OKX.AI validates the agent-commerce direction: agents need public identity, services, payment rails, reviews, task history, and reputation that can travel across marketplaces. Multipass should not try to become the marketplace. It should become the portable trust profile that can carry marketplace presence from OKX.AI, Bankr, ACP, and direct x402 services.

The current Multipass web app already has a `marketplaceListing` surface in the profile Trust context drawer. This design extends that concept into structured marketplace presence cards instead of adding an OKX-only badge or a new disconnected page.

## Goal

Add a source-agnostic Marketplace Presence section to Multipass profiles that can display external marketplace listings as public proof context.

The first seeded example will use OKX.AI-style data so the product story is visible immediately and ready for future OKX collaboration.

## Non-goals

- Do not perform OKX payments, x402 payments, escrow actions, bidding, wallet signing, or onchain writes.
- Do not claim marketplace reviews prove trust by themselves.
- Do not scrape/import live OKX data automatically in this first pass.
- Do not create a competing marketplace or task board.
- Do not expose private credentials, gated data, or authority over marketplace accounts.
- Do not add OKX-specific concepts in a way that prevents Bankr, ACP, or other marketplaces from using the same structure.

## User-facing behavior

On a Multipass profile, the Trust context drawer should show a Marketplace Presence section when marketplace data is published.

Each marketplace card should display safe public metadata:

- Marketplace name, for example `OKX.AI`
- External agent/listing ID, if published
- External profile URL
- Published services or service count
- Payment mode labels, for example `x402`, `escrow`, `USDT`, or `negotiable`
- Public reputation signals, for example score, positive rate, sold count, and review count
- Last checked timestamp or source timestamp
- Status/provenance, for example `public import`, `manager supplied`, or `platform verified`
- Safety copy: public metadata only; viewing does not execute payments, change authority, call tools, release credentials, or prove trust by payment alone

If no marketplace presence exists, existing Trust context fallback copy remains acceptable.

## Data shape

Add an optional profile-level collection:

```js
marketplacePresence: [
  {
    marketplace: 'OKX.AI',
    listingId: '1891',
    profileUrl: 'https://www.okx.ai/agents/1891',
    title: 'WorldCupCaller on OKX.AI',
    summary: 'Public OKX.AI listing metadata for service discovery and portable trust context.',
    status: 'public_import',
    source: {
      label: 'OKX.AI public listing',
      url: 'https://www.okx.ai/agents/1891',
      checkedAt: '2026-07-05T21:34:18Z'
    },
    services: [
      {
        name: '2026 World Cup Predictions and Betting',
        price: '0.5 USDT',
        paymentMode: 'x402 or marketplace checkout',
        endpointUrl: null
      }
    ],
    reputation: {
      score: '4.77',
      positiveRate: '96.92%',
      soldCount: 162,
      reviewCount: 65
    },
    paymentRails: ['USDT', 'x402', 'escrow'],
    proof: {
      assurance: 'public_metadata',
      fragmentIds: []
    }
  }
]
```

The collection is intentionally generic. OKX.AI is just the first marketplace value.

## Rendering architecture

### `renderMarketplacePresencePanel(data)`

A new rendering helper accepts `data.marketplacePresence` and returns the card section HTML. It should be independent from the older singular `marketplaceListing` renderer.

Responsibilities:

- Validate the input is an array.
- Skip empty or malformed entries safely.
- Render each card with escaped text and safe external links only.
- Render services, payment rails, reputation facts, and source/provenance facts.
- Render the safety note once per section or per card.

### Trust context integration

The Trust context drawer should join these sections in order:

1. Public routes
2. Marketplace Presence
3. Existing `marketplaceListing` compatibility panel, if present

This preserves the current route-first flow and adds marketplace context without replacing existing profile compatibility copy.

### Static/demo data

Seed static demo data with one OKX.AI-style marketplace presence example. The seeded profile should clearly demonstrate the product thesis:

> Multipass follows an agent across marketplaces.

The data must be visibly marked as public marketplace metadata, not an official partnership claim or live verified import.

## Safety and wording constraints

Copy must avoid these claims:

- `payment proves trust`
- `private credentials available`
- `acts on behalf`
- `executes tools`
- `custody transfer`
- `authority over marketplace account`
- `official OKX integration`, unless an actual integration exists

Allowed wording:

- `public marketplace metadata`
- `portable trust context`
- `source-referenced listing`
- `payment metadata only`
- `does not execute marketplace actions`
- `does not prove trust by payment alone`

## Tests

Use TDD for implementation.

Required tests:

1. Static profile with marketplace presence renders a Marketplace Presence section in Trust context.
2. Card renders marketplace name, listing ID, profile link, service, payment rail, reputation facts, and source timestamp.
3. External profile links use safe `target="_blank" rel="noopener noreferrer"` rendering.
4. Missing or empty `marketplacePresence` does not render an empty panel.
5. Safety wording scan rejects authority/payment/credential overclaims.
6. Existing `marketplaceListing` and public route panels still render when present.

## Deployment and verification

Before deploy:

- Run focused web tests for marketplace presence.
- Run full `pnpm test`.
- Run `pnpm web:build`.

After deploy:

- Smoke `/multipass/` and at least one profile route.
- Verify live JS contains the Marketplace Presence copy and seeded OKX.AI label.
- Verify no forbidden wording appears in live JS/HTML.

## Future extensions

Later work can add:

- Manager-side marketplace presence editor.
- Import flow for OKX.AI public listing URLs.
- API endpoint for marketplace presence documents.
- Periodic source freshness checks.
- Multiple marketplace cards per profile, including Bankr, ACP, OKX.AI, and direct x402 service pages.

Those are explicitly out of scope for this first pass.

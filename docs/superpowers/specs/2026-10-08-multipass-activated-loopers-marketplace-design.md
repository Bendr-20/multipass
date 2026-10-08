# Multipass Activated Loopers Marketplace Design

**Date:** 2026-10-08
**Status:** Approved

## Goal

Add a public discovery surface at `/multipass/loopers` where collectors can browse released-wallet Loopers, see which are actively listed on OpenSea, compare prices, and open either the Multipass profile or the OpenSea item page.

## Product boundaries

- Multipass is the canonical home for Looper identity, activation, CRED, and marketplace context.
- OpenSea remains the transaction venue. This feature never executes purchases, requests wallet signatures, or proxies orders.
- Released ERC-6551 account creation is the activation source of truth.
- OpenSea active listings are the price/listing source of truth.
- The first release exposes activation and listing state. CRED-tier and Season-eligibility controls appear only when canonical data exists; the UI must not infer or fabricate either status.

## User experience

The page opens at `https://helixa.xyz/multipass/loopers` and defaults to **Listed activated** so the immediately purchasable inventory is visible. It displays:

- activated count;
- listed activated count;
- activated floor price;
- freshness timestamp;
- cards with token image, token number, activation badge, listing price/status, a marketplace-backed Multipass Looper detail link, and OpenSea item link.

The route family includes `/multipass/loopers/<tokenId>` so every displayed non-3802 token has a valid first-party Multipass detail page. The detail page uses the same verified activation/listing snapshot and never routes Looper token IDs through the unrelated AgentDNA resolver.

Controls support:

- **All activated** versus **Listed activated**;
- token ID search;
- token ID ascending/descending;
- price low/high for listed inventory.

The page uses responsive lazy-loaded images and explicit loading, stale, unavailable, empty, and retry states.

## Data architecture

### Activation

Reuse the existing bounded `loadReleasedLooperTokenIds` verifier in the web app. It validates ERC-6551 registry events against the pinned Base chain, Loopers collection, released V1 implementation, salt, derived account, pagination order, response size, and timeout.

### Listings

Add a server-side cached OpenSea reader. The OpenSea API key never reaches the browser. The reader:

- paginates the collection best-listings endpoint;
- accepts only active, started, unexpired ERC-721 quantity-one listings for the pinned Loopers contract;
- validates native ETH and Base WETH by pinned consideration token address and item type, never by an untrusted symbol alone;
- derives item URLs locally and discards all upstream URLs;
- normalizes exact base-unit prices and rejects malformed or mixed consideration;
- deduplicates multiple orders per token to the cheapest active listing;
- bounds request duration, cursor size, pages, per-page bytes, and cumulative bytes;
- caches fresh results for 60 seconds, permits stale fallback for at most 5 minutes, and exposes `fresh|stale` status;
- emits no seller/private credential data.

Expose the normalized feed as public read-only `GET /api/loopers/marketplace/listings`.

### Browser join

The browser joins verified activated token IDs with normalized listing records. Every activated token gets the repository-established pinned image URL `https://helixa.xyz/loopers/images/<tokenId>.png`, a marketplace-backed Multipass detail URL `/multipass/loopers/<tokenId>`, and a locally derived OpenSea item URL. Unlisted tokens remain discoverable in **All activated** mode. Marketplace fetches use `getApiBaseFromLocation()` and therefore default to the existing `/multipass-api` production boundary.

## Security and failure behavior

- No OpenSea API key or raw upstream payload is returned.
- No arbitrary contract, collection, host, or image URL is accepted from users/upstream data.
- Invalid listing rows are ignored; malformed top-level pages, repeated/oversized cursors, timeouts, oversized cumulative payloads, and transport failures fail closed.
- API responses use `cache-control: no-store`; browser/CDN caches cannot extend stale inventory beyond the server’s five-minute bound.
- Server configuration may reference the existing OpenSea key file path, but keys and upstream error bodies never appear in API responses, static assets, or logs.
- OpenSea failure never converts an unlisted token into a listed token.
- If activation verification is unavailable, the page does not show an incomplete activation roster as authoritative.
- External item links use `noopener noreferrer`.
- CRED and Season status are omitted until canonical sources are wired.

## Delivery

Implement in an isolated feature branch, with unit tests for normalization/cache/error behavior, API contract tests, DOM route/filter tests, web build verification, and a local browser/API smoke check before deployment.

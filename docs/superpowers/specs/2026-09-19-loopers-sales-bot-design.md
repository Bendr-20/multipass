# Loopers OpenSea Sales Bot Design

**Date:** 2026-09-19  
**Status:** Approved in Fool Spectrum  
**Scope:** Convert the production Loopers mint-activity service into a sales-only OpenSea alert bot with grouped sweeps and premium treatment for sales at or above 1.25× floor.

## Decisions

- Monitor OpenSea sales for collection slug `loopers-639312714` on Base.
- Use OpenSea Stream for low-latency sale events and OpenSea REST events for startup/reconnect reconciliation.
- Use OpenSea collection stats as the floor-price source.
- Post every new sale, grouping all items from the same transaction into one sweep card.
- Treat a sale as premium at `sale unit price >= floor × 1.25`.
- Treat ETH and WETH as equivalent for the premium comparison.
- Use a distinct premium Telegram card rather than multiple celebration tiers.
- Disable the production primary-mint lane; do not repost historical sales during migration.

## Existing Context

The current production unit, `loopers-mint-activity-bot.service`, runs `apps/api/scripts/run-loopers-activity-bot.js --mints --no-sales`. The shared activity module already has Telegram delivery, image fallback, persistent seen-state, and legacy Reservoir sale normalization. Reservoir's configured Base host no longer resolves, while live OpenSea REST probes for the Loopers collection return sale events and a current floor price. The server already has an OpenSea API key in `~/.config/opensea/config.json`.

The repository has substantial unrelated work in progress. The implementation must isolate new sales-bot files and make only narrow shared-helper exports where necessary.

## Non-goals

- Monitoring non-OpenSea marketplaces.
- Posting listings, bids, offers, transfers, or mints.
- Executing trades or signing transactions.
- Backfilling old sales into Telegram.
- Fabricating a public sale to test the bot.
- Adding premium tiers beyond the approved 1.25× threshold.

## Architecture

### 1. Sales orchestrator

Add a sales-only module and runner rather than expanding the existing mint loop:

- `apps/api/src/loopers-sales-bot.js`
- `apps/api/scripts/run-loopers-sales-bot.js`
- `apps/api/test/loopers-sales-bot.test.mjs`

The module owns configuration, OpenSea Stream subscription, REST reconciliation, sweep buffering, floor annotation, dedupe, and Telegram card formatting. It may reuse narrowly exported Telegram and JSON-state helpers from `loopers-activity-bot.js`; mint polling behavior stays unchanged and dormant.

### 2. OpenSea Stream source

Use `OpenSeaStreamClient` from `@opensea/sdk/stream` and subscribe with `onItemSold('loopers-639312714', handler)`.

The stream is the low-latency path. It automatically reconnects and resubscribes, but OpenSea documents it as best-effort with no missed-event replay. Stream payloads therefore enter the same normalization and dedupe path as REST, never a separate posting path.

Handlers must catch and report their own failures so one malformed event cannot terminate the stream.

### 3. OpenSea REST reconciliation

Use these authenticated read-only endpoints:

- `GET /api/v2/events/collection/loopers-639312714?event_type=sale&after=<timestamp>&limit=200`
- `GET /api/v2/collections/loopers-639312714/stats`

REST runs during startup and periodically while the stream is active. It is the completeness layer for startup races, reconnect gaps, dropped WebSocket messages, and process restarts. Follow the `next` cursor until the checkpoint is reached or no page remains.

### 4. Startup ordering and first-run baseline

1. Record `startedAt` before opening the stream.
2. Subscribe to the stream and buffer normalized events without posting.
3. Load persisted seen IDs and `saleEventTimestamp`.
4. If no sales checkpoint exists, fetch current REST sales, mark only events older than `startedAt` as baseline, and post no history.
5. If a checkpoint exists, fetch REST sales after that timestamp.
6. Merge REST results with the stream buffer, sort by event timestamp, dedupe, and process.
7. Enter steady state: stream events flow into the grouping buffer while periodic REST reconciliation repairs gaps.

This ordering prevents both historical spam and a startup blind spot.

## Canonical Sale Model

Normalize both OpenSea payload shapes into:

```js
{
  id,                 // transaction + token ID + order hash fallback
  transactionHash,
  orderHash,
  eventTimestamp,
  tokenId,
  tokenName,
  tokenUrl,
  imageUrl,
  seller,
  buyer,
  quantity,
  paymentQuantityRaw,
  paymentDecimals,
  paymentSymbol,
  unitPrice,
  totalPrice
}
```

Reject events unless all of the following hold:

- event is a sale;
- chain is Base;
- NFT contract matches the canonical Loopers contract;
- token ID and transaction hash are present;
- payment quantity and decimals produce a finite positive price.

The stable dedupe ID is based on transaction hash and token ID, with order hash only as a fallback discriminator. This lets a Stream event and its REST copy collapse into one sale.

## Sweep Grouping

Buffer sales by transaction hash for five seconds. On flush:

- one item becomes an individual sale card;
- multiple items become one sweep card;
- compute total paid and average price per Looper;
- sort and dedupe token IDs;
- use the first valid token image as card art;
- use the transaction and collection links for proof.

If duplicate Stream/REST copies arrive before flush, they merge. If a late duplicate arrives after flush, persistent seen-state suppresses it.

## Floor and Premium Rules

Fetch the collection floor from OpenSea stats and cache it for at most 30 seconds. Attach the floor snapshot when a sale group flushes.

A premium card is valid only when:

- floor is positive;
- sale and floor currencies are comparable;
- the individual unit price, or sweep average price per Looper, is at least `floor × 1.25`.

Normalize ETH and WETH into one comparison family. Do not compare other symbols. If floor retrieval fails, is zero, is stale beyond the cache window, or uses an incompatible symbol, post a normal sale card without a premium label.

The premium multiplier is configurable as `LOOPERS_SALES_PREMIUM_MULTIPLIER`, defaulting to `1.25`.

## Telegram Cards

### Normal individual sale

- Heading: `Looper sold`
- Looper name and ID
- Sale price
- Floor snapshot
- Marketplace: OpenSea
- Seller and buyer short addresses
- OpenSea item link and Basescan transaction link
- Looper image, with the existing logo/text fallback behavior

### Premium individual sale

- Heading: `🔥 ABOVE-FLOOR LOOPER SALE 🔥`
- All normal fields
- Floor snapshot
- Sale/floor multiplier
- Percentage over floor

### Sweep

- Heading: `Looper sweep` or `🔥 ABOVE-FLOOR LOOPER SWEEP 🔥`
- Count and sorted token IDs
- Total paid
- Average paid per Looper
- Floor snapshot
- Multiplier and premium percentage when eligible
- OpenSea collection link and Basescan transaction link
- First valid Looper image

Escape all external text and attributes before rendering Telegram HTML. Keep captions below Telegram's photo-caption limit; fall back to a concise token range for long sweep lists.

## State and Idempotency

Use a separate production state file, `/var/lib/helixa/loopers-sales-seen.json`, with:

- bounded recent seen IDs;
- `saleEventTimestamp` checkpoint;
- schema version and update timestamp.

Persist state atomically. Advance the checkpoint only after all events through that timestamp have either posted successfully, been identified as duplicates, or received a permanent Telegram failure. Do not mark transient delivery failures seen.

## Error Handling

- **Stream disconnect:** rely on SDK backoff/resubscribe; periodic REST reconciliation fills the gap.
- **Malformed event:** log a safe summary and skip only that event.
- **OpenSea REST transient failure:** retain checkpoint and retry with bounded backoff; stream remains active.
- **OpenSea authentication failure:** fail readiness and keep systemd restarting with a clear secret-free error.
- **Floor lookup failure:** post normal cards without a premium claim.
- **Telegram transient failure:** retain the event for retry.
- **Telegram permanent chat failure:** record the event as skipped to avoid an infinite crash loop and emit a clear operational error.
- **Image failure:** use the existing Loopers logo, then text-only fallback.

Logs must never include the Telegram token or OpenSea API key.

## Secret Handling

Read the OpenSea API key from the existing local JSON config path, configurable with `LOOPERS_SALES_OPENSEA_CONFIG_PATH` and defaulting to `~/.config/opensea/config.json`. Do not copy the key into source, the systemd unit, docs, process arguments, or logs.

Tighten the existing config file to owner-only read/write (`0600`) during rollout.

## Service Rollout

Create `loopers-sales-bot.service` with:

- working directory `/home/ubuntu/multipass`;
- the existing Telegram environment file;
- collection slug, canonical contract, target chat, state path, threshold, and timing as non-secret environment values;
- `ExecStart` pointing to the sales-only runner;
- restart-on-failure behavior.

Rollout sequence:

1. Save a timestamped copy of the existing mint unit.
2. Run focused tests and syntax checks.
3. Run a live read-only OpenSea dry-run with isolated temporary state and no Telegram post.
4. Start the new sales unit while the old mint unit is stopped to avoid duplicate Telegram ownership concerns.
5. Verify stream subscription, REST reconciliation, state creation, floor retrieval, stable PID, and clean logs.
6. Disable the old mint unit only after the sales unit is healthy.

Rollback stops/disables the sales unit, restores/enables the old mint unit, and leaves the new sales state intact for diagnosis.

## Tests

Add focused coverage for:

1. REST sale normalization.
2. Stream sale normalization.
3. Stream/REST dedupe for the same transaction and token.
4. Contract, chain, and malformed-payment rejection.
5. ETH/WETH price normalization.
6. Exact 1.25× premium boundary and below-threshold behavior.
7. Currency mismatch and unavailable-floor fail-closed behavior.
8. Five-second same-transaction sweep grouping.
9. Sweep total, average, sorted token list, and first-image selection.
10. Premium sweep classification by average price per Looper.
11. First-run baseline without historical posts.
12. Startup merge of buffered stream events and REST events.
13. Periodic REST reconciliation after a simulated stream gap.
14. Atomic state persistence and restart dedupe.
15. Transient versus permanent Telegram failure behavior.
16. Normal, premium, and sweep Telegram HTML escaping and caption limits.
17. Image, logo, and text fallback behavior.
18. Config parsing without secret leakage.

Run the existing Loopers activity-bot suite as a regression check so dormant mint behavior remains intact.

## Acceptance Criteria

The conversion is complete when:

- the focused sales and existing activity suites pass;
- the OpenSea REST probe returns current Loopers sales and floor data;
- the production service has a stable PID and clean logs;
- Stream subscription and periodic REST reconciliation are both observed live;
- the first production start does not repost historical sales;
- primary-mint posts stop;
- the next organic sale produces exactly one normal, premium, or grouped sweep card using the approved rules.

Deployment health can be proven before the next sale. End-to-end content proof remains pending until an organic sale occurs; do not fabricate one in the public channel.

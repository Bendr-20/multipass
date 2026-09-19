# Loopers OpenSea Sales Bot Design

**Date:** 2026-09-19  
**Status:** Approved in Fool Spectrum; implementation-readiness fixes incorporated
**Scope:** Convert the production Loopers mint-activity service into a sales-only OpenSea alert bot with grouped sweeps and premium treatment for sales at or above 1.25× floor.

## Decisions

- Monitor OpenSea sales for collection slug `loopers-639312714` on Base.
- Use OpenSea Stream for low-latency sale events and OpenSea REST events for startup/reconnect reconciliation.
- Use OpenSea collection stats as the floor-price source.
- Post every new sale, grouping all items from the same transaction into one sweep card.
- Treat a sale as premium at `sale unit price >= floor × 1.25`.
- Treat Base ETH and WETH as the same comparison family.
- Use a distinct premium Telegram card rather than multiple celebration tiers.
- Disable the production primary-mint lane; do not repost historical sales during migration.

## Existing Context

The current production unit, `loopers-mint-activity-bot.service`, runs `apps/api/scripts/run-loopers-activity-bot.js --mints --no-sales`. The shared activity module already has Telegram delivery, image fallback, persistent seen-state, and legacy Reservoir sale normalization. Reservoir's configured Base host no longer resolves, while live OpenSea REST probes for the Loopers collection return sale events and a current floor price. The server already has an OpenSea API key in `~/.config/opensea/config.json`.

Live inspection confirms that OpenSea returns one ERC-721 sale event per Looper, with an item-level payment amount, and that sweep items share a transaction hash. This makes transaction-level grouping and exact summation possible.

The repository has substantial unrelated work in progress. The implementation must isolate new sales-bot files and make only narrow shared-helper exports where necessary.

## Non-goals

- Monitoring non-OpenSea marketplaces.
- Posting listings, bids, offers, transfers, or mints.
- Executing trades or signing transactions.
- Backfilling old sales into Telegram.
- Fabricating a public sale to test the bot.
- Adding premium tiers beyond the approved 1.25× threshold.
- Promising exactly-once Telegram delivery, which Telegram cannot provide transactionally with local state.

## Architecture

### 1. Sales orchestrator

Add a sales-only module and runner rather than expanding the existing mint loop:

- `apps/api/src/loopers-sales-bot.js`
- `apps/api/scripts/run-loopers-sales-bot.js`
- `apps/api/test/loopers-sales-bot.test.mjs`

The module owns configuration, OpenSea Stream subscription, REST reconciliation, sweep buffering, floor annotation, dedupe, and Telegram card formatting. It may reuse narrowly exported Telegram and state primitives from `loopers-activity-bot.js`; mint polling behavior stays unchanged and dormant.

All state changes run through one serialized processing queue. Stream callbacks, REST results, sweep timers, Telegram delivery, checkpoint changes, and atomic state writes never mutate shared state concurrently. REST reconciliation is coalesced so only one run can be queued or active. An in-memory in-flight ID set prevents duplicate work before persistent state catches up.

### 2. OpenSea Stream source

Add `@opensea/sdk` to `apps/api/package.json` and the pnpm lockfile. Use `OpenSeaStreamClient` from `@opensea/sdk/stream` and subscribe with `onItemSold('loopers-639312714', handler)`.

The stream is the low-latency path. It automatically reconnects and resubscribes, but OpenSea documents it as best-effort with no missed-event replay. Stream payloads therefore enter the same normalization, queue, grouping, and dedupe path as REST; they never use a separate posting path.

Handlers catch and safely summarize their own failures so one malformed event cannot terminate the stream.

### 3. OpenSea REST reconciliation

Use these authenticated read-only endpoints:

- `GET /api/v2/events/collection/loopers-639312714?event_type=sale&after=<overlap-start>&limit=200`
- `GET /api/v2/collections/loopers-639312714/stats`

REST runs during startup, before each sweep finalization, and every 30 seconds while the stream is active. It repairs startup races, reconnect gaps, dropped WebSocket messages, and process restarts.

Each reconciliation queries from `max(0, restWatermark - 120 seconds)`, follows every `next` cursor, normalizes all pages, and relies on stable seen IDs to absorb the overlap. The two-minute overlap handles second-level timestamp collisions, the exclusive `after` filter, and late-indexed events. Keep seen IDs for at least 24 hours and at most 10,000 entries, comfortably longer than the overlap.

Advance `restWatermark` only after a complete paginated reconciliation and successful processing of every retryable event in that window. If REST pagination, Telegram delivery, or state persistence fails transiently, retain the old watermark and replay the overlap later.

### 4. Durable startup baseline and handoff

First run:

1. Load state through the serialized queue.
2. If `baselineCutoff` is absent, set it to the current Unix second and atomically persist it before opening Stream or delivering anything.
3. Open the Stream subscription in startup-buffer mode.
4. Reconcile REST from `baselineCutoff - 120 seconds` through all pages.
5. Mark events older than `baselineCutoff` as historical baseline without posting. Treat events at or after the cutoff as new; this intentionally favors a possible one-second edge repost over losing a real sale.
6. Merge the REST events and startup Stream buffer by stable ID and transaction, sort by event timestamp, and persist pending groups.
7. While holding the processing queue, drain any Stream events that arrived during reconciliation, atomically persist the baseline IDs, pending groups, and initial watermark, then switch to steady-state mode.

If the process crashes after step 2, the durable cutoff survives and the next run still treats sales at or after that cutoff as new. If it crashes during the handoff, persisted pending groups and the REST overlap reconstruct the same work.

Subsequent runs load `restWatermark`, pending groups, delivered transaction records, and seen IDs, open Stream in buffer mode, perform an overlap reconciliation, merge/drain under the queue, persist, and enter steady state.

The service emits a secret-free `ready` log only after authenticated REST reconciliation succeeds, the durable baseline/handoff is complete, the floor endpoint has been read successfully, and the Stream subscription is active.

## Canonical Sale Model

Normalize both OpenSea payload shapes into:

```js
{
  id,                    // transaction hash + token ID; order hash fallback
  transactionHash,
  orderHash,
  eventTimestamp,
  tokenId,
  tokenName,
  imageUrl,
  seller,
  buyer,
  quantity,              // must equal 1 for Loopers ERC-721
  paymentQuantityRaw,    // BigInt-compatible decimal string
  paymentDecimals,
  paymentSymbol,
  paymentTokenAddress
}
```

Reject events unless all of the following hold:

- event is a sale;
- chain is Base;
- NFT contract matches the canonical Loopers contract;
- token ID and transaction hash are present;
- quantity equals one;
- payment quantity is a positive integer string;
- payment decimals are a bounded non-negative integer.

Construct OpenSea item and Basescan transaction links from the validated canonical contract, token ID, and transaction hash. Do not trust payload links.

The stable dedupe ID is transaction hash plus token ID, with order hash only as a fallback discriminator. This collapses a Stream event and its REST copy into one sale.

## Exact Price and Premium Math

Never use JavaScript `Number` for money or the premium boundary.

- Parse event payment quantities as `BigInt` in their declared decimals.
- Parse the floor response's decimal representation into fixed 18-decimal integer units.
- Normalize Base native ETH (`0x000…0000`) and canonical WETH (`0x4200…0006`) into the same 18-decimal comparison family.
- Sum compatible sweep items in integer units.
- Compare the exact 1.25× boundary with integer cross multiplication: `unitPrice18 × 100 >= floor18 × 125`.
- Format display values from integer units, trimming insignificant zeros.

For one item, use that item's exact price. For a compatible-currency sweep, use the exact total divided by item count as a rational average; perform threshold comparison by cross multiplication without rounding. If a transaction contains incompatible payment families, keep one grouped card with totals separated by symbol/address, omit average and premium claims, and log the anomaly safely.

Fetch the collection floor from OpenSea stats and cache it for at most 30 seconds. A premium card is valid only when the floor is positive, fresh, and in the ETH/WETH family. On floor failure, zero floor, stale cache, or incompatible currency, post a normal card without a premium claim.

`LOOPERS_SALES_PREMIUM_MULTIPLIER` defaults to `1.25` and is parsed into an exact rational, not a float.

## Sweep Grouping and Late Siblings

Persist pending groups keyed by transaction hash.

- Start a group when the first item arrives.
- Deduplicate items by stable sale ID.
- Set a quiet deadline eight seconds after the most recent sibling and a hard deadline thirty seconds after the first sibling.
- Before finalization, request and await one coalesced REST overlap reconciliation for the group's timestamp; extend the quiet deadline if new siblings appear.
- Finalize after the quiet deadline following that reconciliation, or at the hard deadline if OpenSea remains delayed.

On finalization:

- one item becomes an individual sale card;
- multiple items become one sweep card;
- total and rational average use exact compatible-currency arithmetic;
- token IDs are sorted numerically and deduplicated;
- the first trusted image is card art;
- canonical collection and transaction links provide proof.

Persist a delivered transaction record for 24 hours containing its items, Telegram message ID, delivery mode (`photo` or `text`), and last rendered caption. If a late sibling appears after finalization, merge it and edit the existing Telegram message with `editMessageCaption` or `editMessageText`; never emit a second public card for the same transaction. Retry transient edit failures without marking the new item seen. If Telegram reports a permanent non-editable-message condition, retain the event and emit an operational error for manual repair rather than silently posting a duplicate.

Persist pending groups after each accepted event so a service restart during the debounce window can resume them. Startup REST overlap fills any siblings missed before the restart.

## Telegram Cards

### Normal individual sale

- Heading: `Looper sold`
- Looper name and ID
- Sale price
- Floor snapshot when fresh/comparable
- Marketplace: OpenSea
- Seller and buyer short addresses
- Canonical OpenSea item and Basescan transaction links
- Trusted Looper image, with Loopers-logo and text fallbacks

### Premium individual sale

- Heading: `🔥 ABOVE-FLOOR LOOPER SALE 🔥`
- All normal fields
- Floor snapshot
- Exact sale/floor multiplier formatted for display
- Percentage over floor

### Sweep

- Heading: `Looper sweep` or `🔥 ABOVE-FLOOR LOOPER SWEEP 🔥`
- Count and sorted token IDs
- Exact total paid
- Rational average paid per Looper when currencies are compatible
- Floor snapshot
- Multiplier and premium percentage when eligible
- Canonical OpenSea collection and Basescan transaction links
- First trusted Looper image

Escape all external text and attributes before rendering Telegram HTML. Keep photo captions below Telegram's 1,024-character limit and text below its 4,096-character limit; use a concise token range for long sweeps.

Telegram delivery is **at least once**, not exactly once. Persist the delivered state immediately after Telegram returns an accepted message ID. A process crash in that narrow interval can repost one card; the message includes a canonical transaction link so duplicates are recognizable. Persisting before send would create the worse failure mode of silently missing a sale.

## Image Safety

Do not server-side `HEAD` or fetch arbitrary metadata image URLs.

Allow remote card images only from explicitly trusted HTTPS hosts returned by OpenSea or Helixa (`helixa.xyz`, its approved subdomains, and OpenSea's `seadn.io` image CDN subdomains). Reject credentials, non-HTTPS schemes, IP literals, private/link-local targets, and all other hosts. Send trusted URLs directly to Telegram; if Telegram rejects one, retry with the fixed canonical Loopers logo, then text only.

## State and Idempotency

Use `/var/lib/helixa/loopers-sales-seen.json`, owned by the service user with mode `0600`, containing:

- `baselineCutoff`;
- `restWatermark`;
- recent seen sale IDs with timestamps;
- persisted pending transaction groups;
- delivered transaction records used for late-sibling edits;
- schema version and update timestamp.

Persist state with a same-directory temporary file, `fsync`, atomic rename, and serialized writes. Retain seen IDs and delivered transaction records for at least the two-minute overlap horizon; the production target is 24 hours with bounded entry counts.

Mark a sale ID seen only after its group is delivered and persisted, identified as an already-delivered duplicate, included in a successfully persisted late-sibling edit, or skipped for an event-specific non-retryable content defect after every safe fallback fails.

## Error Handling

- **Stream disconnect:** SDK backoff/resubscribe; periodic REST overlap fills the gap.
- **Malformed event:** log a secret-free stable ID/reason and skip only that event.
- **OpenSea 429 or transient REST failure:** honor `Retry-After` when present, otherwise use bounded exponential backoff with jitter; retain watermark.
- **OpenSea authentication failure:** fail readiness and exit for systemd restart with a secret-redacted error.
- **Floor lookup failure:** post normal cards without a premium claim after a fresh-floor attempt fails.
- **Telegram transient failure:** retain event/group and retry.
- **Telegram bot authorization, missing-chat, or chat-permission failure:** exit with state/checkpoint retained; do not mark events seen.
- **Telegram event-specific formatting/media failure:** exhaust trusted-image, logo, and text fallbacks; only then skip that content-specific event and record the safe reason.
- **Late-sibling edit failure:** retain the sibling and retry editing; do not post a second card.

Logs must never include the Telegram token, OpenSea API key, authenticated URLs, request headers, or raw response bodies that may echo credentials.

## Secret Handling

Read the OpenSea API key from the existing local JSON config path, configurable with `LOOPERS_SALES_OPENSEA_CONFIG_PATH` and defaulting to `~/.config/opensea/config.json`. Do not copy the key into source, the systemd unit, docs, process arguments, URLs printed to logs, or journal output.

Tighten the existing config file from its current group-readable mode to owner-only read/write (`0600`) during rollout. Create the sales state directory/file with owner `ubuntu` and restrictive directory/file permissions.

## Service Rollout

Create `loopers-sales-bot.service` with:

- `Wants=network-online.target` and `After=network-online.target`;
- working directory `/home/ubuntu/multipass`;
- the existing Telegram environment file;
- collection slug, canonical contract, target chat, state path, threshold, and timing as non-secret environment values;
- `ExecStart` pointing to the sales-only runner;
- restart-on-failure behavior.

Rollout sequence:

1. Save the current old-unit definition and enabled/active state as rollback evidence; do not modify its file.
2. Add `@opensea/sdk`, update `pnpm-lock.yaml`, and verify the stream subpath imports under Node 24.
3. Run focused tests, the existing Loopers activity regression suite, syntax checks, and diff checks.
4. Tighten OpenSea config permissions and create the sales state path with correct ownership/modes.
5. Run a live read-only OpenSea dry-run with isolated temporary state and no Telegram post.
6. Stop the still-enabled old mint unit.
7. Install the new unit, run `systemctl daemon-reload`, and start it **without enabling it**.
8. Verify the explicit ready log, authenticated REST reconciliation, durable baseline, floor retrieval, Stream subscription, stable PID, state permissions, and clean secret-redacted logs.
9. Disable the old unit, enable the already-running new unit, and verify the resulting enabled/active states. This avoids dual startup after reboot.

Rollback stops/disables the sales unit, enables and starts the unchanged old mint unit, runs `daemon-reload` only if a unit file changed, and leaves the new sales state intact for diagnosis.

## Tests

Add focused coverage for:

1. REST sale normalization.
2. Stream sale normalization.
3. Stream/REST dedupe for the same transaction and token.
4. Contract, chain, ERC-721 quantity, and malformed-payment rejection.
5. Canonical link construction and unsafe payload-link rejection.
6. ETH/WETH address-family normalization.
7. Exact 1.25× boundary, below-threshold behavior, and decimal precision.
8. Currency mismatch and unavailable/stale-floor fail-closed behavior.
9. Multi-item sweep exact total, rational average, sorted IDs, and first trusted image.
10. Eight-second debounce, thirty-second hard deadline, and pre-finalization REST reconciliation.
11. Delayed sibling editing of the existing Telegram card without a second post.
12. Mixed-currency sweep behavior.
13. First-run durable cutoff and no historical posts.
14. Crash recovery immediately after cutoff persistence.
15. Atomic startup merge of buffered Stream and REST events.
16. Same-second and late-indexed events across a two-minute overlap.
17. Multi-page REST cursors and watermark advancement only after complete success.
18. Concurrent Stream/REST arrivals through the serialized queue and in-flight dedupe.
19. Periodic REST reconciliation after a simulated Stream gap.
20. Persisted unflushed sweep recovery after service restart.
21. Atomic `fsync`/rename state persistence and restart dedupe.
22. At-least-once crash window documentation test or invariant.
23. Telegram transient, configuration/auth, content-specific, and late-edit failures.
24. OpenSea 429 `Retry-After`, backoff, and authentication failure behavior.
25. Secret-redacted errors and logs.
26. Normal, premium, and sweep Telegram HTML escaping and caption limits.
27. Unsafe image host, IP literal, and redirect-free behavior plus logo/text fallbacks.
28. Config parsing without secret leakage.

Run the existing Loopers activity-bot suite as a regression check so dormant mint behavior remains intact.

## Acceptance Criteria

The conversion is complete when:

- the focused sales and existing activity suites pass;
- the OpenSea REST probe returns current Loopers sales and floor data;
- first-run and restart probes create a durable cutoff/watermark without historical posts;
- the production service has a stable PID and clean secret-redacted logs;
- the ready log proves REST reconciliation, floor retrieval, durable state, and Stream subscription;
- systemd shows the old mint unit disabled/inactive and the sales unit enabled/active;
- primary-mint posts stop;
- the next organic sale produces one normal, premium, or grouped sweep card using the approved rules;
- any late sweep sibling updates that same card rather than creating a second post.

Deployment health can be proven before the next sale. End-to-end content proof remains pending until an organic sale occurs; do not fabricate one in the public channel.

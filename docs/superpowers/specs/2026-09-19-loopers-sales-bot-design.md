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

A single serialized mutation queue owns all in-memory state and state-file writes. Stream ingestion, application of completed REST snapshots, group mutation, Telegram results, and checkpoint changes enter that queue. An in-memory in-flight ID set prevents duplicate work before persistent state catches up.

Network I/O is coordinated outside the mutation queue to avoid deadlock:

1. `scheduleReconciliation(reason)` coalesces concurrent requests into one promise.
2. It briefly enqueues a snapshot operation to read `restWatermark` and choose a fixed reconciliation upper bound.
3. It performs all REST page fetches outside the queue.
4. It enqueues one atomic apply operation that normalizes the complete snapshot, merges events, persists state, and advances the watermark.

A sweep timer never awaits reconciliation while holding the queue. Its outside-queue coordinator first awaits `scheduleReconciliation`, then enqueues finalization. Stream callbacks can continue enqueueing into the startup or steady-state ingress buffer while network reads are active.

### 2. OpenSea Stream source

Use Node 24's global `WebSocket` and OpenSea's documented Phoenix protocol directly so readiness can be tied to the server's subscription acknowledgement. No additional Stream SDK dependency is required.

- Connect to `wss://stream-api.opensea.io/socket/websocket?token=<API_KEY>&vsn=2.0.0` without ever logging the authenticated URL.
- Join `collection:loopers-639312714` with a `phx_join` frame.
- Do not declare the Stream ready until the matching `phx_reply` returns `status: "ok"`.
- Accept only `item_sold` events from the joined topic.
- Send a heartbeat every 30 seconds and require its acknowledgement before the next heartbeat deadline.
- On join rejection, missed heartbeat, socket close, or parse failure, reconnect with bounded exponential backoff and rejoin.

The stream is the low-latency path, but OpenSea documents it as best-effort with no replay. Stream payloads therefore enter the same normalization, mutation queue, grouping, and dedupe path as REST; they never use a separate posting path. Handlers safely summarize malformed events so one bad payload cannot terminate the connection.

### 3. OpenSea REST reconciliation and watermark

Use these authenticated read-only endpoints:

- `GET /api/v2/events/collection/loopers-639312714?event_type=sale&after=<overlap-start>&before=<upper-bound>&limit=200`
- `GET /api/v2/collections/loopers-639312714/stats`

REST runs during startup, before each sweep finalization, and every 30 seconds while the stream is active. It repairs startup races, reconnect gaps, dropped WebSocket messages, and process restarts.

For each reconciliation:

1. Snapshot `previousWatermark` and choose `upperBound = max(previousWatermark, floor(now / 1000) - 2)`. On first run initialize `previousWatermark = baselineCutoff`; therefore the bound can never move backward.
2. Query `after = max(0, previousWatermark - 120)` and `before = upperBound`, following every `next` cursor.
3. If OpenSea unexpectedly returns an event newer than `upperBound`, place it in normal ingress but exclude it from this snapshot's completion/advancement decision.
4. Permanently apply the persisted `baselineCutoff`: every event with `eventTimestamp < baselineCutoff` is historical and can never post, even if indexed for the first time on a later restart.
5. Apply all in-range pages atomically through the mutation queue. Events may become seen, delivered, baseline-filtered, persisted pending groups, or persisted retry records.
6. Advance `restWatermark` to the already-clamped `upperBound` only after every page succeeded and every retryable in-range event is durably represented in one of those states. A successful empty result advances to that same clamped value.
7. On pagination, processing, or state-write failure, retain `previousWatermark` and replay the overlap later.

Persisted pending groups and retry records do not block advancement because they are durable independent work items. An event that failed before durable persistence does block it. Stable sale IDs are retained for seven days and capped at 50,000 entries, far beyond the overlap horizon.

### 4. Durable startup baseline and handoff

First run:

1. Load state through the mutation queue.
2. If `baselineCutoff` is absent, set it to the current Unix second and atomically persist it before opening Stream or delivering anything.
3. Open Stream in startup-buffer mode and wait for the acknowledged collection join.
4. Run the bounded REST reconciliation above, starting from `baselineCutoff - 120`.
5. Permanently baseline-filter events older than `baselineCutoff`. Treat events at or after the cutoff as new; this intentionally favors a possible one-second edge repost over losing a real sale.
6. The reconciliation apply operation merges REST events with the current startup buffer by stable ID/transaction, persists pending groups and the initial watermark, then flips `ingressMode` to steady state in that same queued mutation.
7. Stream callbacks queued after the flip use steady-state ingestion; callbacks queued before it are part of the startup buffer. Queue ordering makes the handoff atomic without awaiting network work inside the queue.

If the process crashes after step 2, the durable cutoff survives and the next run still treats sales at or after that cutoff as new. If it crashes during handoff, persisted pending groups and the REST overlap reconstruct the same work.

Subsequent runs load `restWatermark`, pending groups, retry records, delivered transaction records, tombstones, and seen IDs; open Stream in buffer mode; receive an acknowledged join; reconcile the overlap; atomically merge/flip; and enter steady state. `baselineCutoff` remains a permanent filter on every run.

The service emits a secret-free `ready` log only after the Stream join acknowledgement, authenticated REST reconciliation, durable handoff, and a successful floor read. A connection attempt or unacknowledged subscription is not ready.

## Canonical Sale Model

Normalize both OpenSea payload shapes into:

```js
{
  id,                    // transaction hash + token ID
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

Normalize timestamps before validation:

- REST `event_timestamp` must be an integer Unix-second value.
- Stream `payload.event_timestamp` must be an RFC 3339 string with an explicit `Z` or numeric offset; parse it to milliseconds and floor to Unix seconds.
- Reject invalid dates, fractions that cannot parse, negative values, and timestamps more than five minutes in the future.
- All baseline, watermark, ordering, grouping, and freshness comparisons use the normalized integer seconds.

Reject events unless all of the following hold:

- event is a sale;
- chain is Base;
- NFT contract matches the canonical Loopers contract;
- token ID and transaction hash are present;
- timestamp normalization succeeds;
- quantity equals one;
- payment quantity is a positive integer string;
- payment decimals are a bounded non-negative integer.

Construct OpenSea item and Basescan transaction links from the validated canonical contract, token ID, and transaction hash. Do not trust payload links.

The stable dedupe ID is exactly lowercased transaction hash plus normalized token ID. `orderHash` is retained only as provenance and never changes identity. This collapses a Stream event and its REST copy into one sale, even if one source omits or disagrees on order hash.

## Exact Price and Premium Math

Never materialize money or the premium boundary as JavaScript `Number`.

- Parse the OpenSea stats body with `lossless-json` so `total.floor_price` retains its original decimal lexeme; add that package to `apps/api/package.json` and the pnpm lockfile.
- Accept a floor lexeme only when it matches `^(?:0|[1-9]\d{0,30})(?:\.\d{1,36})?$`; reject signs, exponents, leading zeros, and values outside those digit bounds. This intentionally fails closed if OpenSea changes numeric representation.
- Read `total.floor_price_symbol`, trim and uppercase it, and accept only exact `ETH` or `WETH`, both mapped to the Base ETH/WETH comparison family. Missing or any other symbol disables premium classification.
- Accept payment quantities containing 1–96 decimal digits and payment decimals from 0 through 36; reject signs, exponents, fractions in the raw quantity, and values outside those bounds.
- Represent every amount as an exact rational `{ numerator: BigInt, scale: 10n ** decimals }`; decimals above 18 are preserved, never truncated.
- Base native ETH is exactly `0x0000000000000000000000000000000000000000`; canonical Base WETH is exactly `0x4200000000000000000000000000000000000006`. Those two addresses form one comparison family.
- Sum compatible sweep items by scaling to the largest declared decimal count in that family, bounded at 36.
- Format price and average displays by exact long division to at most eight fractional digits, round half-up at the ninth digit, and trim insignificant trailing zeros.
- Format the sale/floor multiplier to two fractional digits and percentage-over-floor to one fractional digit, both with exact integer half-up rounding. Classification always uses unrounded rationals; displayed values never feed decisions.

Parse `LOOPERS_SALES_PREMIUM_MULTIPLIER` as a decimal string with at most six fractional digits and a configured range of `1` through `100`. Reduce it to `{ numerator, denominator }`; the default `1.25` becomes `5/4`. For a compatible-currency sweep, compare without division or rounding:

`totalNumerator × floorScale × multiplierDenominator >= floorNumerator × multiplierNumerator × paymentScale × itemCount`

The single-item case uses `itemCount = 1`. The implementation uses the configured rational everywhere; it must not hardcode `100/125`.

If a transaction contains incompatible payment families, keep one grouped card with totals separated by symbol/address, omit average and premium claims, and log the anomaly safely.

Fetch the collection floor and `floor_price_symbol` from OpenSea stats and cache the validated pair for at most 30 seconds. A premium card is valid only when the losslessly parsed floor is positive, fresh, and its accepted symbol maps to the ETH/WETH family. On grammar failure, exponent notation, missing/unknown symbol, zero floor, stale cache, or incompatible currency, post a normal card without a premium claim.

## Sweep Grouping and Late Siblings

Persist pending groups keyed by transaction hash.

- Start a group when the first item arrives.
- Deduplicate items by stable sale ID.
- Set a quiet deadline eight seconds after the most recent sibling and a hard deadline thirty seconds after the first sibling.
- Before finalization, request and await a coalesced REST overlap reconciliation whose returned `upperBound` is strictly greater than the greatest `eventTimestamp` currently in the group; extend the quiet deadline if new siblings appear.
- If the coalesced promise was created with a stale bound (`upperBound <= groupTimestamp`), await its completion, then request a fresh reconciliation after the coalescer clears. Do not finalize on that stale result.
- Finalize after the quiet deadline and a sufficiently fresh reconciliation, or at the thirty-second hard deadline after one best-effort fresh request. The hard deadline is the only exception to the freshness requirement.

On finalization:

- one item becomes an individual sale card;
- multiple items become one sweep card;
- total and rational average use exact compatible-currency arithmetic;
- token IDs are sorted numerically and deduplicated;
- the first trusted image is card art;
- canonical collection and transaction links provide proof.

Persist the full delivered transaction record for 30 days, including its items, original floor snapshot, Telegram message ID, delivery mode (`photo` or `text`), and last rendered caption. Retain a compact transaction-hash tombstone indefinitely after the full record expires; tombstones prevent a second public card even for an extremely late index.

If a late sibling appears while the full record exists, merge it and edit the existing Telegram message with `editMessageCaption` or `editMessageText`. Recompute the card against the **original floor snapshot** so a historical sale is never reclassified using today's floor. Retry transient edit failures without marking the new item seen, and pin any record with an unresolved edit so retention cannot remove it. If Telegram permanently cannot edit or find the old message, keep the record pinned, preserve the sibling as unresolved, and emit an operational repair alert; never emit a second public card for that transaction.

If only a compact tombstone remains, suppress a second post and emit an operational alert that the expired full record prevents automatic repair. This bounds stored card detail while preserving the no-second-card guarantee.

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

Do not server-side `HEAD`, follow redirects, or fetch metadata image URLs.

A candidate image passes only when WHATWG `URL` parsing shows all of the following:

- protocol is exactly `https:`;
- username and password are empty;
- no explicit non-default port remains;
- hostname is lowercase ASCII with no trailing dot and no `xn--` label;
- `net.isIP(hostname) === 0`;
- hostname is exactly `helixa.xyz`, or it has a non-empty label prefix and ends at the label boundary `.seadn.io` (for example `i2c.seadn.io`, never `evilseadn.io`).

No other Helixa subdomain or image host is implicitly approved. The fixed fallback is exactly `https://helixa.xyz/multipass/loopers-logo.png`.

Submit the direct allowlisted URL to Telegram without any local preflight. If Telegram rejects it, retry the fixed logo, then text only. “Redirect-free” means the bot itself makes no request to the image URL and therefore follows no redirect; tests assert zero local image fetches and reject hostname/credential/port/IDN/IP/trailing-dot bypasses before Telegram submission.

## State and Idempotency

Use `/var/lib/helixa/loopers-sales-seen.json`, owned by the service user with mode `0600`, containing:

- permanent `baselineCutoff`;
- `restWatermark`;
- recent seen sale IDs with timestamps;
- persisted pending transaction groups and retry records;
- full delivered transaction records used for late-sibling edits;
- compact delivered transaction tombstones;
- schema version and update timestamp.

Persist state with a same-directory temporary file, file `fsync`, atomic rename, and parent-directory `fsync`, all through serialized mutation-queue writes. Retain seen IDs for seven days/50,000 entries, full delivered records for 30 days unless pinned by unresolved edits, and compact tombstones indefinitely.

Mark a sale ID seen only after its group is delivered and persisted, identified as an already-delivered duplicate, included in a successfully persisted late-sibling edit, or skipped for an event-specific non-retryable content defect after every safe fallback fails. If Telegram accepts a message but the following state write fails, leave the event unseen and terminate/retry; the documented at-least-once tradeoff permits a duplicate rather than a silent loss.

## Error Handling

- **Stream disconnect/join/heartbeat failure:** reconnect and rejoin with bounded exponential backoff; readiness becomes false until a new acknowledged join; REST overlap fills the gap.
- **Malformed event:** log a secret-free stable ID/reason and skip only that event.
- **OpenSea 429:** honor numeric Telegram/OpenSea `Retry-After`/`retry_after` bounds when present; otherwise use bounded exponential backoff with jitter; retain watermark.
- **OpenSea network timeout, 5xx, or transient parse failure:** retry with bounded backoff and retain watermark.
- **OpenSea 401/403:** fail readiness and exit for systemd restart with a secret-redacted error.
- **Floor lookup failure:** post normal cards without a premium claim after a fresh-floor attempt fails.
- **Telegram network timeout, 5xx, or 429:** retain event/group, honor bounded `retry_after`, and retry.
- **Telegram 401, 403, `chat not found`, `bot was kicked`, or insufficient-rights errors:** treat as fatal configuration/authorization failure; exit with state/checkpoint retained and do not mark events seen.
- **Telegram known media/content 400:** on remote-media errors try the fixed logo; on caption length/entity/parse errors regenerate a concise escaped caption; then try text. Only a known event-specific content rejection after all safe fallbacks may be skipped and marked with a safe reason.
- **Telegram edit `message is not modified`:** treat as successful idempotent edit and persist the sibling seen.
- **Telegram edit `message to edit not found` or `message can't be edited`:** pin the unresolved record, retain the sibling unseen, and raise an operational repair alert without a second post.
- **Unknown OpenSea or Telegram error:** default to retry/no watermark advancement/no seen mark.
- **Accepted Telegram send followed by state-write failure:** fail the processing turn and retry later; a duplicate is explicitly possible under at-least-once delivery.

Logs must never include the Telegram token, OpenSea API key, authenticated URLs, request headers, or raw response bodies that may echo credentials.

## Secret Handling

Read the OpenSea API key from the existing local JSON config path. The production unit sets `LOOPERS_SALES_OPENSEA_CONFIG_PATH=/home/ubuntu/.config/opensea/config.json` explicitly; interactive runs may derive the same path from `os.homedir()`. Do not copy the key into source, the systemd unit, docs, process arguments, authenticated URLs printed to logs, or journal output.

Tighten the existing config file from its current group-readable mode to owner-only read/write (`0600`) during rollout. Create the sales state directory/file with owner `ubuntu` and restrictive directory/file permissions.

## Service Rollout

Create `loopers-sales-bot.service` with:

- `Wants=network-online.target` and `After=network-online.target`;
- `User=ubuntu`, `WorkingDirectory=/home/ubuntu/multipass`, `Environment=HOME=/home/ubuntu`, and `UMask=0077`;
- the existing Telegram environment file;
- absolute `LOOPERS_SALES_OPENSEA_CONFIG_PATH=/home/ubuntu/.config/opensea/config.json`;
- collection slug, canonical contract, target chat, state path, threshold, and timing as non-secret environment values;
- `ExecStart` pointing to the sales-only runner;
- restart-on-failure behavior.

Rollout sequence:

1. Save the current old-unit definition and enabled/active state as rollback evidence; do not modify its file.
2. Add `lossless-json`, update `pnpm-lock.yaml`, and verify the direct Phoenix Stream client under Node 24's global `WebSocket`.
3. Run focused tests, the existing Loopers activity regression suite, syntax checks, and diff checks.
4. Tighten OpenSea config permissions and create the sales state path with correct ownership/modes.
5. Run a live read-only OpenSea dry-run with isolated temporary state and no Telegram post.
6. Stop the still-enabled old mint unit.
7. Install the new unit, run `systemctl daemon-reload`, and start it **without enabling it**.
8. Require a fresh explicit ready log proving the acknowledged `phx_reply` join, authenticated bounded REST reconciliation, durable baseline/watermark, and successful floor read; then verify stable PID, state permissions, and clean secret-redacted logs.
9. If any check after step 6 fails, immediately stop the new unit and restart the still-enabled old unit before further diagnosis.
10. Only after every check passes, disable the old unit, enable the already-running new unit, and verify the resulting enabled/active states. This avoids dual startup after reboot.

Rollback stops/disables the sales unit, enables and starts the unchanged old mint unit, runs `daemon-reload` only if a unit file changed, and leaves the new sales state intact for diagnosis. A failed rollout must prove the old unit is active again before reporting the rollback complete.

## Tests

Add focused coverage for:

1. REST sale normalization, including integer Unix-second timestamps.
2. Phoenix Stream join acknowledgement and RFC 3339 timestamp normalization with floor-to-second behavior.
3. Invalid, negative, timezone-less, and future timestamp rejection at baseline/watermark boundaries.
4. Stream/REST dedupe for the same transaction and token, including differing/missing order hashes.
5. Contract, chain, ERC-721 quantity, and malformed-payment rejection.
6. Canonical link construction and unsafe payload-link rejection.
7. Full native ETH/WETH address-family normalization.
8. Lossless floor parsing with no `Number` conversion.
9. Floor grammar bounds, exponent rejection, and exact case-normalized `ETH`/`WETH` symbol mapping.
10. Exact default 1.25× boundary and below-threshold behavior.
11. Non-default rational multipliers and decimals above 18 without truncation.
12. Raw digit/decimal/multiplier bound rejection.
13. Deterministic half-up display rounding for price, non-terminating averages, multiplier, and percentage while classification remains exact.
14. Currency mismatch and unavailable/stale-floor fail-closed behavior.
15. Multi-item sweep exact total, rational average comparison, sorted IDs, and first trusted image.
16. Eight-second debounce, thirty-second hard deadline, and pre-finalization REST reconciliation.
17. Stale coalesced reconciliation (`upperBound <= groupTimestamp`) forces a fresh run before non-hard-deadline finalization.
18. Delayed sibling editing of the existing Telegram card against the original floor snapshot.
19. Mixed-currency sweep behavior.
20. First-run watermark initialization, durable cutoff, and no historical posts.
21. Crash recovery immediately after cutoff persistence.
22. Permanent pre-cutoff filtering of a newly indexed event on a later restart.
23. Atomic startup merge/ingress-mode flip for buffered Stream and REST events.
24. Same-second and late-indexed events across the overlap.
25. Multi-page REST cursors, clamped fixed `before` upper bound, and exclusion of newer events.
26. Empty-page advancement to the same clamped bound and no advancement on partial/failing pages.
27. Durable pending/retry records allowing watermark advancement.
28. Concurrent Stream/REST arrivals, in-flight dedupe, and explicit queue/reconciliation deadlock prevention.
29. Periodic REST reconciliation after a simulated Stream gap.
30. Persisted unflushed sweep recovery after service restart.
31. Atomic file/directory `fsync` plus rename and restart dedupe.
32. Telegram send accepted followed by state-write failure, proving the intentional duplicate-risk path.
33. Telegram network/5xx/429, authorization/chat, known content/media 400, unknown-error, idempotent-edit, and non-editable-message classifications.
34. Unresolved late-edit records remain pinned across retention; expired full records leave suppressing tombstones.
35. OpenSea 429 `Retry-After`, transient backoff, and authentication failure behavior.
36. Secret-redacted errors and logs.
37. Normal, premium, and sweep Telegram HTML escaping and caption limits.
38. Exact image-host allowlist and bypasses: sibling suffix, trailing dot, credentials, ports, IDN, IPv4/IPv6, and non-HTTPS.
39. Redirect-free behavior: zero local image fetches, direct trusted URL only, logo/text fallbacks.
40. Heartbeat/join failure removes readiness; acknowledged rejoin restores it.
41. Ready log gating on join acknowledgement, complete REST reconciliation, durable state, and floor read.
42. Failed post-stop rollout immediately restores the old unit in the deployment harness/runbook check.
43. Config parsing and absolute production paths without secret leakage.

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

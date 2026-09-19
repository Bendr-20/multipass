# Loopers OpenSea Sales Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production Loopers primary-mint notifier with a durable OpenSea sales bot that posts one Telegram card per transaction, groups sweeps, and highlights sales averaging at least 1.25× the fresh floor.

**Architecture:** Add a self-contained sales-bot subsystem instead of modifying the dirty legacy activity module. Pure modules own exact rational money, event normalization, and card rendering; adapters own durable state, OpenSea REST/Phoenix Stream, and Telegram; one orchestrator serializes mutations while REST/network I/O runs outside its queue. The runner exposes a no-post probe, while a repository-owned systemd unit supports an approval-free rollback to the unchanged mint unit.

**Tech Stack:** Node.js 24 ESM, `node:test`, global `fetch`/`WebSocket`, `lossless-json`, OpenSea REST v2 + Phoenix Stream protocol, Telegram Bot API, systemd.

**Design source:** `docs/superpowers/specs/2026-09-19-loopers-sales-bot-design.md`

---

## File Map

**Create**

- `apps/api/src/loopers-sales/money.js` — lossless decimal parsing, rational comparison, exact summation, deterministic display rounding.
- `apps/api/src/loopers-sales/normalize.js` — REST/Stream normalization, canonical identity/links, timestamp validation, image allowlist.
- `apps/api/src/loopers-sales/state.js` — state schema, pruning, atomic file+directory fsync persistence.
- `apps/api/src/loopers-sales/opensea.js` — API-key loading, bounded paginated REST snapshots, stats parsing, direct Phoenix Stream client.
- `apps/api/src/loopers-sales/telegram.js` — Telegram HTML cards, send/edit fallbacks, error classification.
- `apps/api/src/loopers-sales-bot.js` — configuration, serialized queue, startup baseline, reconciliation, grouping, retry/readiness lifecycle.
- `apps/api/scripts/run-loopers-sales-bot.js` — CLI, signal handling, probe mode, secret-free fatal reporting.
- `apps/api/test/loopers-sales-money.test.mjs` — exact-money unit tests.
- `apps/api/test/loopers-sales-normalize.test.mjs` — normalization/security unit tests.
- `apps/api/test/loopers-sales-state.test.mjs` — persistence/recovery tests.
- `apps/api/test/loopers-sales-opensea.test.mjs` — pagination, floor, Stream protocol, backoff tests.
- `apps/api/test/loopers-sales-telegram.test.mjs` — cards, limits, fallbacks, error classes.
- `apps/api/test/loopers-sales-bot.test.mjs` — queue, baseline, reconciliation, grouping, restart, readiness integration tests.
- `deploy/systemd/loopers-sales-bot.service` — production unit template.
- `deploy/systemd/loopers-sales-bot-rollout.sh` — deterministic start/verify/cutover/rollback helper with no secret output.

**Modify**

- `apps/api/package.json` — add `lossless-json` and `loopers:sales-bot` script.
- `pnpm-lock.yaml` — lock dependency.

**Do not modify**

- `apps/api/src/loopers-activity-bot.js`
- `apps/api/scripts/run-loopers-activity-bot.js`
- `apps/api/test/loopers-activity-bot.test.mjs`
- `/etc/systemd/system/loopers-mint-activity-bot.service`

This avoids overlapping the repository's existing uncommitted mint-bot work.

---

## Chunk 1: Pure Domain and Delivery Boundaries

### Task 1: Add exact-money primitives

**Files:**
- Create: `apps/api/src/loopers-sales/money.js`
- Create: `apps/api/test/loopers-sales-money.test.mjs`

- [ ] **Step 1: Write failing tests for complete money APIs**

Use one exact value shape everywhere:

```js
// Exact decimal/rational value. `scale` is the denominator.
{ numerator: 88n, scale: 10000n }
```

Cover these exact exports and return shapes:

```js
parseBoundedDecimal('0.0088', { maxIntegerDigits: 30, maxFractionDigits: 36 })
// => { numerator: 88n, scale: 10000n }

parsePaymentAmount({ quantity: '6100000000000000', decimals: 18 })
// => { numerator: 6100000000000000n, scale: 10n ** 18n }

parseMultiplier('1.25')
// => { numerator: 5n, denominator: 4n }

sumRationals([
  { numerator: 61n, scale: 10000n },
  { numerator: 53n, scale: 10000n },
])
// => { numerator: 114n, scale: 10000n }

averageRational({ numerator: 1n, scale: 1n }, 3n)
// => { numerator: 1n, scale: 3n }

ratioRational(
  { numerator: 15n, scale: 10n },
  { numerator: 1n, scale: 1n },
)
// => { numerator: 3n, scale: 2n }

isAverageAtOrAboveThreshold({ total, itemCount: 10n, floor, multiplier })
formatRational(value, { maxFractionDigits: 8 })
formatRatio(value, { fractionDigits: 2 })
formatPercentOverFloor(value, { fractionDigits: 1 })
```

Tests must reject zero/negative payment quantities, signs, exponent notation, leading-zero integers, >96 payment digits, >36 decimals, multiplier fractions beyond six digits, and multipliers below 1 or above 100. Include exact 1 and 100 multiplier boundaries, a non-default `1.375` multiplier, decimals above 18, an exact threshold boundary, one raw unit below, mixed-scale summation, a repeating average, negative percentage rejection, and half-up display ties.

- [ ] **Step 2: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-money.test.mjs
```

Expected: FAIL because module/exports do not exist.

- [ ] **Step 3: Implement the minimal pure module**

Use only `BigInt`. Reduce ratios with `gcd`, sum by least sufficient common decimal scale, and compare sweep averages by cross multiplication:

```js
const left = total.numerator * floor.scale * multiplier.denominator;
const right = floor.numerator * multiplier.numerator * total.scale * itemCount;
return left >= right;
```

Implement display rounding with integer quotient/remainder and half-up rounding; never convert money to `Number`.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
node --test apps/api/test/loopers-sales-money.test.mjs
```

Expected: all money tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/loopers-sales/money.js apps/api/test/loopers-sales-money.test.mjs
git commit -m "feat: add exact Loopers sale math"
```

### Task 2: Normalize OpenSea sales and validate links/images

**Files:**
- Create: `apps/api/src/loopers-sales/normalize.js`
- Create: `apps/api/test/loopers-sales-normalize.test.mjs`

- [ ] **Step 1: Write REST and Stream fixtures as tests**

REST fixture fields:

```js
{
  event_type: 'sale', chain: 'base', event_timestamp: 1789777003,
  transaction: '0x…64hex', order_hash: '0x…64hex', quantity: 1,
  buyer: '0x…', seller: '0x…',
  payment: { quantity: '11500000000000000', decimals: 18, symbol: 'ETH', token_address: ZERO },
  nft: { contract: LOOPERS, identifier: '6366', name: 'Looper #6366', display_image_url: 'https://i2c.seadn.io/…' }
}
```

Stream fixture fields:

```js
{
  event_type: 'item_sold',
  payload: {
    item: { nft_id: `base/${LOOPERS}/6366`, metadata: { name: 'Looper #6366', image_url: 'https://i2c.seadn.io/…' } },
    transaction: { hash: '0x…64hex' }, order_hash: '0x…64hex', quantity: 1,
    maker: { address: seller }, taker: { address: buyer },
    payment_token: { address: ZERO, decimals: 18, symbol: 'ETH' },
    sale_price: '11500000000000000', event_timestamp: '2026-09-19T00:16:43.999Z'
  }
}
```

Assert both normalize to the same lowercased `transactionHash:tokenId` ID despite differing/missing `orderHash`.

- [ ] **Step 2: Add rejection/security tests**

Cover wrong chain/contract, quantity != 1, malformed hashes/token IDs/payment, REST timestamp non-integer, Stream RFC3339 without zone, future >5 minutes, floor/baseline boundary flooring, canonical OpenSea/Basescan URL construction, and image host bypasses (`evilseadn.io`, trailing dot, credentials, port, `xn--`, IPv4/IPv6, HTTP).

Add explicit payment-family tests. Only exact Base native ETH address `0x0000000000000000000000000000000000000000` and canonical Base WETH `0x4200000000000000000000000000000000000006`, paired with case-normalized `ETH`/`WETH`, map to `base-eth`; a misleading ETH symbol on any other token address is incompatible and disables premium classification.

- [ ] **Step 3: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-normalize.test.mjs
```

- [ ] **Step 4: Implement normalizers and allowlist**

Export:

```js
normalizeRestSale(event, config)
normalizeStreamSale(event, config)
normalizeEventTimestamp(value, { source, nowSeconds })
canonicalSaleId(transactionHash, tokenId)
classifyPaymentFamily({ tokenAddress, symbol }) // 'base-eth' or null
buildOpenSeaItemUrl({ chain: 'base', contract, tokenId })
buildBasescanTxUrl(transactionHash)
isTrustedImageUrl(url)
```

Use exact `helixa.xyz` and label-boundary `.seadn.io`; no local image fetch.

- [ ] **Step 5: Run and commit**

```bash
node --test apps/api/test/loopers-sales-normalize.test.mjs
git add apps/api/src/loopers-sales/normalize.js apps/api/test/loopers-sales-normalize.test.mjs
git commit -m "feat: normalize OpenSea Looper sales"
```

### Task 3: Render and deliver Telegram cards

**Files:**
- Create: `apps/api/src/loopers-sales/telegram.js`
- Create: `apps/api/test/loopers-sales-telegram.test.mjs`

- [ ] **Step 1: Write failing rendering tests**

Test normal, premium, sweep, and premium-sweep cards; seller/buyer shortening; exact total/average/floor/multiplier text; sorted token IDs; original-floor late edit; HTML escaping; 1,024 photo caption and 4,096 text limits.

- [ ] **Step 2: Write failing transport/failure tests**

Test remote trusted photo → fixed logo → text fallbacks; return `{ messageId, mode }`; `editMessageCaption`/`editMessageText`; 429 `retry_after`; network/5xx retry; auth/chat fatal; known media/content 400 fallbacks; `message is not modified` success; non-editable/not-found unresolved; unknown retry.

- [ ] **Step 3: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-telegram.test.mjs
```

- [ ] **Step 4: Implement card and Telegram adapter**

Export:

```js
renderSaleCard(group, { floorSnapshot, multiplier })
sendSaleCard({ fetchImpl, botToken, chatId, card })
editSaleCard({ fetchImpl, botToken, chatId, messageId, mode, card })
classifyTelegramError({ status, description, parameters })
```

Never include the bot token in thrown/logged messages. Use POST JSON only to `https://api.telegram.org/bot${token}/${method}`.

- [ ] **Step 5: Run and commit**

```bash
node --test apps/api/test/loopers-sales-telegram.test.mjs
git add apps/api/src/loopers-sales/telegram.js apps/api/test/loopers-sales-telegram.test.mjs
git commit -m "feat: add Loopers sale Telegram cards"
```

---

## Chunk 2: Durable Sources and State Machine

### Task 4: Build durable sales state

**Files:**
- Create: `apps/api/src/loopers-sales/state.js`
- Create: `apps/api/test/loopers-sales-state.test.mjs`

- [ ] **Step 1: Write failing schema and persistence tests**

Test a default state, permanent `baselineCutoff`, `restWatermark`, seen IDs, pending/retry groups, delivered records, pinned unresolved edits, compact tombstones, JSON serialization of BigInt-compatible strings, seven-day/50k seen pruning, and no tombstone pruning. When an unpinned delivered record crosses 30 days, pruning must replace it with an indefinite compact transaction tombstone in the same saved state; pinned unresolved records never expire.

- [ ] **Step 2: Write failure-injection tests**

Inject file-open/write/file-fsync/rename/directory-fsync failures. For every failure before rename, verify the original target remains unchanged and valid. For parent-directory fsync failure after rename, verify the renamed target already contains a complete valid new state while the durability failure is still surfaced to the caller. Test safe temp cleanup, restart load of unflushed groups, and corrupt JSON fail-fast (never silently baseline over corruption).

- [ ] **Step 3: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-state.test.mjs
```

- [ ] **Step 4: Implement state helpers**

Export:

```js
createDefaultSalesState({ baselineCutoff })
loadSalesState({ statePath, nowSeconds })
pruneSalesState(state, { nowSeconds })
saveSalesStateAtomic({ statePath, state, fsImpl })
```

Write same-directory temp file with `0600`, sync file, rename, sync parent directory.

- [ ] **Step 5: Run and commit**

```bash
node --test apps/api/test/loopers-sales-state.test.mjs
git add apps/api/src/loopers-sales/state.js apps/api/test/loopers-sales-state.test.mjs
git commit -m "feat: persist Loopers sales state atomically"
```

### Task 5: Add bounded OpenSea REST and lossless floor reads

**Files:**
- Create: `apps/api/src/loopers-sales/opensea.js`
- Create: `apps/api/test/loopers-sales-opensea.test.mjs`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing key/floor tests**

Test `readOpenSeaApiKey('/path/config.json')` reads only non-empty `api_key`, rejects missing/malformed files without echoing values, and `fetchOpenSeaFloor` parses the raw response losslessly, accepts bounded decimal + ETH/WETH symbol, rejects exponent/unknown/missing/zero values.

- [ ] **Step 2: Write failing REST snapshot tests**

Test URL query includes repeated/encoded `event_type=sale`, fixed `after`, fixed `before`, `limit=200`; all cursors are followed; empty pages succeed; response events above bound are separated; 429 honors `Retry-After`; network/5xx retries; 401/403 are fatal; no headers/keys appear in errors.

- [ ] **Step 3: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-opensea.test.mjs
```

- [ ] **Step 4: Add the parser dependency and implement REST/floor functions**

Run:

```bash
pnpm --filter @helixa/multipass-api add lossless-json
```

Expected: only Task 5 owns the `lossless-json` package/lock changes because this adapter is its first user.

Export:

```js
readOpenSeaApiKey(configPath)
fetchOpenSeaSalesSnapshot({ fetchImpl, apiKey, slug, after, before, retry })
fetchOpenSeaFloor({ fetchImpl, apiKey, slug, nowSeconds })
classifyOpenSeaError(response)
```

Return `{ events, upperBound }` only after complete pagination; do not expose a meaningless `next: null`. Cursor values are opaque and must be copied exactly into the next request.

- [ ] **Step 5: Run and commit REST adapter**

```bash
node --test apps/api/test/loopers-sales-opensea.test.mjs
git add apps/api/package.json pnpm-lock.yaml apps/api/src/loopers-sales/opensea.js apps/api/test/loopers-sales-opensea.test.mjs
git commit -m "feat: reconcile Loopers OpenSea sales"
```

### Task 6: Add acknowledged Phoenix Stream client

**Files:**
- Modify: `apps/api/src/loopers-sales/opensea.js`
- Modify: `apps/api/test/loopers-sales-opensea.test.mjs`

- [ ] **Step 1: Add fake-WebSocket protocol tests**

Assert endpoint token is never passed to logger or error text; join frame is `[joinRef, ref, 'collection:loopers-639312714', 'phx_join', {}]`; only a matching `phx_reply {status:'ok'}` resolves the initial `start()` and makes ready; a join error/10-second timeout rejects the current `start()` attempt without leaking the URL; `item_sold` events reach the handler; malformed/wrong-topic frames do not; heartbeat is sent at 30 seconds and must receive a matching reply; close/missed heartbeat clears readiness and starts exactly one bounded reconnect/rejoin loop; `stop()` cancels a pending start/reconnect and settles all promises.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test --test-name-pattern='Phoenix|Stream|heartbeat' apps/api/test/loopers-sales-opensea.test.mjs
```

- [ ] **Step 3: Implement the client**

Export:

```js
createOpenSeaPhoenixStream({
  apiKey, slug, WebSocketImpl = WebSocket, timers, logger,
  onSale, onReadyChange,
}) // => { start(): Promise<void>, stop(): Promise<void>, isReady() }
```

Parse only array frames `[join_ref, ref, topic, event, payload]`. Resolve `start()` after acknowledged join. Make `stop()` cancel timers/reconnect and close cleanly.

- [ ] **Step 4: Run full adapter suite and commit**

```bash
node --test apps/api/test/loopers-sales-opensea.test.mjs
git add apps/api/src/loopers-sales/opensea.js apps/api/test/loopers-sales-opensea.test.mjs
git commit -m "feat: stream Loopers OpenSea sales"
```

### Task 7: Implement the serialized orchestrator

**Files:**
- Create: `apps/api/src/loopers-sales-bot.js`
- Create: `apps/api/test/loopers-sales-bot.test.mjs`

- [ ] **Step 1: Write config/startup tests**

Test defaults and env/flag overrides; first run persists `baselineCutoff` and initializes `restWatermark` before Stream; pre-cutoff is permanently filtered; at/after cutoff is pending; startup Stream/REST merge flips ingress mode atomically; restart restores pending/retry/tombstone state; corrupt state fails readiness.

- [ ] **Step 2: Write reconciliation/queue tests**

Use fake clocks/adapters to test clamped `upperBound`, two-minute overlap, complete-pagination-only advancement, empty-page advancement, newer-than-bound ingress, pending/retry durability allowing advancement, no advancement on state failure, coalesced one-run behavior, and no queue deadlock while Stream arrives during REST.

- [ ] **Step 3: Write grouping/delivery tests**

Test eight-second quiet/30-second hard deadline; stale coalesced result forces a fresh snapshot; same-transaction dedupe/group; exact total/average premium; mixed-currency normal group; state persisted before watermark; Telegram accepted then state failure leaves unseen/duplicate-risk; restart resumes unflushed group; late sibling edits same message with original floor; unresolved edit pins record; tombstone suppresses a second card.

- [ ] **Step 4: Run tests and confirm RED**

```bash
node --test apps/api/test/loopers-sales-bot.test.mjs
```

- [ ] **Step 5: Implement options and queue**

Export:

```js
parseLoopersSalesBotOptions(argv, env)
createSerializedQueue()
createLoopersSalesBot(dependencies)
```

`createLoopersSalesBot` returns:

```js
{
  start(), stop(), probe(),
  scheduleReconciliation(reason), ingestStreamEvent(event),
  isReady(), getStatus()
}
```

No queued function may await a reconciliation that later needs the same queue. The external coordinator snapshots/fetches/applies; sweep coordinator reconciles first, then queues finalize.

- [ ] **Step 6: Implement startup, grouping, delivery, and readiness**

Emit `loopers-sales-bot ready` only when join is acknowledged, first bounded reconciliation + durable handoff succeed, and floor read succeeds. On Stream disconnect set readiness false but continue periodic REST; on fatal OpenSea/Telegram configuration error reject/exit with state unchanged.

- [ ] **Step 7: Run integration and regression suites; commit**

```bash
node --test \
  apps/api/test/loopers-sales-money.test.mjs \
  apps/api/test/loopers-sales-normalize.test.mjs \
  apps/api/test/loopers-sales-state.test.mjs \
  apps/api/test/loopers-sales-opensea.test.mjs \
  apps/api/test/loopers-sales-telegram.test.mjs \
  apps/api/test/loopers-sales-bot.test.mjs
node --test apps/api/test/loopers-activity-bot.test.mjs
git add apps/api/src/loopers-sales-bot.js apps/api/test/loopers-sales-bot.test.mjs
git commit -m "feat: orchestrate durable Loopers sale alerts"
```

---

## Chunk 3: Runner, Rollout, and Production Proof

### Task 8: Add CLI runner and no-post live probe

**Files:**
- Create: `apps/api/scripts/run-loopers-sales-bot.js`
- Modify: `apps/api/package.json`
- Modify: `apps/api/test/loopers-sales-bot.test.mjs`

- [ ] **Step 1: Add runner tests**

Test `--help`, `--probe`, `--state-path`, `--no-images`, SIGTERM cleanup, missing config, secret-redacted fatal output, and probe semantics: acknowledged Stream + REST/floor + isolated baseline state + zero Telegram calls + clean exit.

- [ ] **Step 2: Run and confirm RED**

```bash
node --test --test-name-pattern='runner|probe|signal|config' apps/api/test/loopers-sales-bot.test.mjs
```

- [ ] **Step 3: Implement runner**

Runner loads `/home/ubuntu/.config/opensea/config.json` through the adapter, creates dependencies, logs structured secret-free status, and shuts down on SIGINT/SIGTERM. Add package script:

```json
"loopers:sales-bot": "node scripts/run-loopers-sales-bot.js"
```

- [ ] **Step 4: Test and commit**

```bash
node --check apps/api/scripts/run-loopers-sales-bot.js
node --check apps/api/src/loopers-sales-bot.js
node --test apps/api/test/loopers-sales-bot.test.mjs
git add apps/api/package.json apps/api/scripts/run-loopers-sales-bot.js apps/api/test/loopers-sales-bot.test.mjs
git commit -m "feat: run and probe Loopers sales bot"
```

### Task 9: Add systemd unit and rollback-safe rollout helper

**Files:**
- Create: `deploy/systemd/loopers-sales-bot.service`
- Create: `deploy/systemd/loopers-sales-bot-rollout.sh`
- Create: `apps/api/test/loopers-sales-rollout.test.mjs`

- [ ] **Step 1: Write static and behavioral rollout tests**

Assert unit contains `Wants/After=network-online.target`, `User=ubuntu`, `WorkingDirectory=/home/ubuntu/multipass`, `HOME=/home/ubuntu`, `UMask=0077`, existing Telegram env file, absolute OpenSea config path, canonical slug/contract/chat/state/threshold, exact `Restart=on-failure`, and sales runner.

Assert rollout helper: records old states/unit text; chmods OpenSea config 0600; creates `/var/lib/helixa` 0700 **without creating or truncating the state file**; preserves any existing state; stops old but does not disable it before verification; installs/daemon-reloads/starts new without enabling; waits for a fresh ready journal line + stable active PID + valid bot-created state file; restores old immediately on any failure; enables new/disables old only after proof; never prints env/key/token.

Build a mocked command harness by prepending a temporary directory of fake `systemctl`, `journalctl`, `install`, `cp`, `chmod`, `sleep`, and `stat` executables to `PATH`. Inject failures after old-stop, unit install, daemon-reload, new-start, readiness check, old-disable, and new-enable. For every point, assert the new unit ends stopped/disabled and the old unit active/enabled. Run the helper under `ERR`, `INT`, and `TERM` paths and assert the same rollback invariants.

- [ ] **Step 2: Run and confirm RED**

```bash
node --test apps/api/test/loopers-sales-rollout.test.mjs
```

- [ ] **Step 3: Implement unit/helper**

The helper accepts `--probe-only` and `--install`. Use `set -Eeuo pipefail`; install rollback traps for `ERR`, `INT`, and `TERM` immediately before stopping the old unit; clear them only after enabled/active cutover proof. Rollback must best-effort stop+disable new, enable+start old, and verify old active/enabled. Do not create the state file, write/source secrets, or print command traces containing environment values.

- [ ] **Step 4: Run tests, shell syntax, and commit**

```bash
node --test apps/api/test/loopers-sales-rollout.test.mjs
bash -n deploy/systemd/loopers-sales-bot-rollout.sh
git add deploy/systemd/loopers-sales-bot.service deploy/systemd/loopers-sales-bot-rollout.sh apps/api/test/loopers-sales-rollout.test.mjs
git commit -m "ops: deploy Loopers sales bot safely"
```

### Task 10: Final branch verification and review

**Files:** all files above.

- [ ] **Step 1: Run targeted suites**

```bash
node --test apps/api/test/loopers-sales-*.test.mjs apps/api/test/loopers-activity-bot.test.mjs
```

Expected: all PASS, no skipped tests unless explicitly documented.

- [ ] **Step 2: Run repository suite and static checks**

```bash
pnpm test
node --check apps/api/src/loopers-sales-bot.js
node --check apps/api/scripts/run-loopers-sales-bot.js
bash -n deploy/systemd/loopers-sales-bot-rollout.sh
git diff --check main...HEAD
git status --short
```

Expected: full PASS; only intended files tracked; worktree clean after final commit.

- [ ] **Step 3: Run read-only live probe**

```bash
probe_state=$(mktemp)
rm -f "$probe_state"
pnpm --filter @helixa/multipass-api loopers:sales-bot -- \
  --probe \
  --state-path "$probe_state" \
  --opensea-config-path /home/ubuntu/.config/opensea/config.json
```

Expected: acknowledged join, paginated REST reconciliation, valid floor symbol/value, durable isolated baseline, `ready`, no Telegram request, clean exit. Remove the temporary state afterward.

- [ ] **Step 4: Request code review and address findings**

Use `superpowers:requesting-code-review` against `main...HEAD`. Fix High/Medium findings test-first and repeat until approved.

- [ ] **Step 5: Commit final fixes**

```bash
git add <only intended paths>
git commit -m "fix: address Loopers sales bot review"
```

Skip this commit if no review fixes exist.

### Task 11: Integrate into the dirty production checkout without overwriting unrelated work

**Source worktree:** `/home/ubuntu/.config/superpowers/worktrees/multipass/feature-loopers-sales-bot`

**Production checkout:** `/home/ubuntu/multipass`

- [ ] **Step 1: Snapshot both repositories and production service state**

```bash
git -C /home/ubuntu/multipass status --short > /tmp/loopers-sales-main-status.before
git -C "$WORKTREE" log --oneline main..HEAD > /tmp/loopers-sales-branch-commits
systemctl cat loopers-mint-activity-bot.service > /tmp/loopers-mint-unit.before
systemctl is-active loopers-mint-activity-bot.service > /tmp/loopers-mint-active.before
systemctl is-enabled loopers-mint-activity-bot.service > /tmp/loopers-mint-enabled.before
```

- [ ] **Step 2: Copy only new self-contained files**

Copy `apps/api/src/loopers-sales/**`, `apps/api/src/loopers-sales-bot.js`, runner, sales tests, and `deploy/systemd/**` from the worktree. Do not overwrite the three dirty mint-bot files.

- [ ] **Step 3: Merge dependency/script hunks carefully**

Add only `lossless-json` and `loopers:sales-bot` to the already-modified production `apps/api/package.json`, then run:

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

Inspect `git diff -- apps/api/package.json pnpm-lock.yaml` and confirm pre-existing unrelated hunks remain intact.

- [ ] **Step 4: Re-run production-checkout tests**

```bash
node --test apps/api/test/loopers-sales-*.test.mjs apps/api/test/loopers-activity-bot.test.mjs
pnpm test
```

Expected: sales tests and the existing dirty-tree mint regression suite PASS.

### Task 12: Cut over production and verify rollback posture

- [ ] **Step 1: Tighten files and run isolated probe**

```bash
chmod 600 /home/ubuntu/.config/opensea/config.json
sudo install -d -o ubuntu -g ubuntu -m 0700 /var/lib/helixa
sudo -u ubuntu node apps/api/scripts/run-loopers-sales-bot.js \
  --probe \
  --state-path /tmp/loopers-sales-probe.json \
  --opensea-config-path /home/ubuntu/.config/opensea/config.json
```

Expected: `ready`; no Telegram post.

- [ ] **Step 2: Run guarded install/cutover**

```bash
sudo bash deploy/systemd/loopers-sales-bot-rollout.sh --install
```

Expected: old unit stops but remains enabled through verification; new unit starts without enablement; fresh ready proof succeeds; only then old becomes disabled and new enabled. Any failed verification restores old active state automatically.

- [ ] **Step 3: Verify the live service**

```bash
systemctl is-active loopers-sales-bot.service
systemctl is-enabled loopers-sales-bot.service
systemctl is-active loopers-mint-activity-bot.service || true
systemctl is-enabled loopers-mint-activity-bot.service || true
systemctl show loopers-sales-bot.service -p MainPID -p NRestarts -p ActiveEnterTimestamp
journalctl -u loopers-sales-bot.service --since '-10 min' --no-pager
stat -c '%a %U:%G %n' /home/ubuntu/.config/opensea/config.json /var/lib/helixa /var/lib/helixa/loopers-sales-seen.json
```

Expected: sales active/enabled; mint inactive/disabled; stable nonzero PID; zero unexpected restarts; acknowledged Stream + REST/floor + ready log; restrictive modes; no secrets.

- [ ] **Step 4: Observe one reconciliation interval**

Wait at least 35 seconds, then verify PID unchanged, a second REST reconciliation completed, and no historical Telegram posts occurred. Do not fabricate a sale.

- [ ] **Step 5: Report bounded completion**

Report deployment and readiness proof as complete. State explicitly that final public card content proof remains pending until the next organic OpenSea sale; verify that sale when it naturally arrives.

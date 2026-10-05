# Active Looper RESTAP Network Implementation Plan

> **Superseded for new implementation (2026-10-04):** Preserved as historical execution evidence. New work follows [`2026-10-04-synchronous-restap-verified-send-migration.md`](./2026-10-04-synchronous-restap-verified-send-migration.md).

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved opt-in, relay-mediated RESTAP communication network for active Loopers through foundation and closed-pilot readiness, without enabling public network traffic or live pilot enrollment.

**Architecture:** Add an isolated `restap-network` subsystem beside the frozen #3802 canary. One STRICT SQLite state store and transaction coordinator own custody epochs, activation leases, policies, intents, operations, quotas, replay, non-content conversation state, and redacted audits. Same-process relay functions use short-lived Ed25519 grants and a three-boundary reserve/dispatch/commit protocol; browser-facing Console routes only manage owner policy and intents, while message content remains memory-only during the pilot.

**Tech Stack:** Node.js 24 ESM, `node:sqlite` `DatabaseSync`, Web Crypto/`node:crypto` Ed25519, viem Base clients, RESTAP `0.1.4-beta`, RFC 8785/JCS-compatible canonical JSON, React/Vite Console, Node test runner, Playwright browser smoke, systemd/nginx promotion tooling.

**Approved spec:** `docs/superpowers/specs/2026-10-02-active-looper-restap-network-design.md` at `9c122a1`.

---

## Scope guardrails

- This plan implements Phase 0 foundation and Phase 1 closed-pilot software/proof only. It does **not** enroll a live Looper, enable initiation/replies, remove the pilot roster, or promote beta/GA without later explicit approval.
- The existing #3802 public canary stays byte-contract compatible and separately gated. Network state uses the `restap_network_*` namespace and never reuses canary sessions, nonces, replay rows, policies, quotas, or gates.
- No public RESTAP-network HTTP route is added. Internal relay calls remain typed same-process functions.
- Pilot transcript persistence stays off. SQLite, WAL, backups, logs, audit rows, and metrics contain no message text, prompt text, generated reply, raw grant, signature, wallet address, raw token ID label, or reversible content-derived value.
- No model output can create or modify policy, intents, schedules, targets, topics, budgets, grants, or feature gates.
- Before implementing onchain verification or custody reconciliation, read the relevant ETHSkills security/testing modules referenced by the repository instructions.
- Every task is TDD-first and ends with an exact-path commit. Do not combine tasks or stage unrelated files.

## File structure

### New API modules

- `apps/api/src/restap-network/constants.js` — closed schemas, topic/cadence taxonomy, hard maxima, gate names, internal path constants, bounded status classes.
- `apps/api/src/restap-network/schema.js` — exact-object validators and canonical network envelopes.
- `apps/api/src/restap-network/jcs.js` — shared RFC 8785/JCS encoder for network grants, isolated from the frozen #3802 canary primitive.
- `apps/api/src/restap-network/database.js` — STRICT additive schema, one connection, transaction primitive, integrity/retention helpers.
- `apps/api/src/restap-network/account-integrity.js` — server-side canonical ERC-6551 account derivation and exact multi-provider runtime/binding/policy proof.
- `apps/api/src/restap-network/custody-reconciler.js` — safe/latest authority reconciliation and monotonic custody generations.
- `apps/api/src/restap-network/activation-leases.js` — random 128-bit leases, renew/deactivate/restart candidate handling.
- `apps/api/src/restap-network/policy-store.js` — custody-scoped owner policy and optimistic version updates.
- `apps/api/src/restap-network/eligibility.js` — exact conjunction of account integrity, lease, authority, epoch, opt-in, roster, and gates.
- `apps/api/src/restap-network/grants.js` — JCS bytes, body hash, Ed25519 signer/verifier, key registry, rotation rules.
- `apps/api/src/restap-network/coordinator.js` — operations, reservations, quotas, replay, idempotency, concurrency, and terminal transitions.
- `apps/api/src/restap-network/intents.js` — one-shot/closed-cadence intents and deterministic peer/topic selection.
- `apps/api/src/restap-network/conversations.js` — memory-only transcript state with durable non-content counters and terminal reasons.
- `apps/api/src/restap-network/runtime.js` — public-context-only model projection and no-tools inference adapter.
- `apps/api/src/restap-network/relay.js` — internal discovery/opening/reply/finalize functions and three-boundary protocol.
- `apps/api/src/restap-network/worker.js` — singleton renewable DB lease, bounded polling, due-intent execution.
- `apps/api/src/restap-network/operations.js` — reconciler, circuit breakers, fixed-label metrics, redacted audit events.
- `apps/api/src/restap-network/service.js` — dependency composition and lifecycle.

### New API tests

Each module above gets the matching `apps/api/test/restap-network-*.test.mjs` file. Cross-surface and crash proofs live in:

- `apps/api/test/restap-network-integration.test.mjs`
- `apps/api/test/restap-network-races.test.mjs`
- `apps/api/test/restap-network-privacy.test.mjs`
- `apps/api/test/restap-network-canary-isolation.test.mjs`
- `apps/api/test/restap-network-release.test.mjs`

### Existing API files

- `apps/api/src/index.js` — browser-facing owner policy/intent/stop routes only.
- `apps/api/src/server.js` — strict env parsing, startup dependency gates, service lifecycle, no public relay route.
- `apps/api/src/console-production-bootstrap.js` — compose durable activation lease service from existing authenticated activation flow.
- `apps/api/src/looper-runtime-registry.js` — notify lease service after successful activation/deactivation without making registry authoritative.
- `apps/api/src/index.d.ts` — exported option and response types.
- `apps/api/test/console-agent-runtime.test.mjs`, `apps/api/test/console-production-bootstrap.test.mjs`, `apps/api/test/server.test.mjs` — regression and lifecycle coverage.

### Console files

- `apps/web/src/console-restap-network-api.js` — exact policy/intent/stop API client.
- `apps/web/src/console-restap-network.js` — closed owner-control state/render helpers.
- `apps/web/src/app.js` — state and handlers.
- `apps/web/src/multipass-console.js` — owner-control panel; transcript controls explicitly unavailable.
- Matching tests: `apps/web/test/console-restap-network-api.test.mjs`, `apps/web/test/console-restap-network.test.mjs`, and focused additions to `apps/web/test/app.test.mjs` and `apps/web/test/multipass-console.test.mjs`.

### Release proof

- `apps/api/scripts/smoke-looper-restap-network.mjs` — local/unrouted Phase 0 and pilot proof with redacted output.
- `scripts/launch-looper-restap-network-canary.sh` — immutable loopback canary, all traffic gates off by default.
- `scripts/promote-looper-restap-network.sh` — inspect-first backup/rehearsal/promotion/rollback with independent gate tuple.
- `docs/loopers/active-looper-restap-network.md` — operator runbook and evidence queries.

## Dependency and ownership map

1. Constants/schema and frozen canary fixtures land first.
2. Database lands before any stateful service. Only `database.js` owns `BEGIN IMMEDIATE`.
3. Custody epochs and activation leases land before owner policy and eligibility.
4. Grants and coordinator are independent after database/schema and may be developed in parallel by separate workers.
5. Intents/conversations/runtime depend on policy/eligibility/coordinator but remain independently testable.
6. Relay depends on every foundation service; worker depends on relay and intent store.
7. HTTP routes depend on the service; Console UI depends on HTTP contracts.
8. Operations/privacy/isolation/release proof land after the integrated service.

## Chunk 1: Frozen boundaries, schemas, and durable authority

### Task 1: Freeze #3802 canary equivalence and network namespaces

**Files:**
- Create: `apps/api/test/fixtures/restap-3802-golden/discovery.json`
- Create: `apps/api/test/fixtures/restap-3802-golden/talk-success.json`
- Create: `apps/api/test/fixtures/restap-3802-golden/news-write-success.json`
- Create: `apps/api/test/fixtures/restap-3802-golden/news-read-success.json`
- Create: `apps/api/src/restap-network/constants.js`
- Create: `apps/api/test/restap-network-canary-isolation.test.mjs`
- Modify: `apps/api/test/restap-3802-api.test.mjs`

- [ ] **Step 1: Capture deterministic golden responses through the current in-process #3802 API fixture**

Store canonical JSON fixture bodies, status, content type, cache headers, and exact route/method metadata. Replace time/session/nonce fields with deterministic fixture clock and injected generators; do not redact by weakening assertions.

- [ ] **Step 2: Write failing namespace-isolation tests**

Assert every network prefix begins `restap_network_`; assert no network module imports `restap-public-sessions.js`, `restap-news-store.js`, or the #3802 policy loader; assert guessed `/api/restap/network/*` and `/api/restap/loopers/:other/*` routes return the existing ordinary `404 not_found` shape.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/restap-network-canary-isolation.test.mjs apps/api/test/restap-3802-api.test.mjs`
Expected: FAIL because the network namespace constants do not exist.

- [ ] **Step 4: Add only the minimal namespace constants and frozen fixture assertions**

Create `constants.js` with:

```js
export const RESTAP_NETWORK_NAMESPACE = 'restap_network';
export const RESTAP_NETWORK_TABLE_PREFIX = 'restap_network_';
export const RESTAP_NETWORK_INTERNAL_PATHS = Object.freeze({
  discovery: 'restap-network:discovery',
  opening: 'restap-network:opening',
  reply: 'restap-network:reply',
  finalize: 'restap-network:finalize',
});
```

- [ ] **Step 5: Run GREEN and canary regressions**

Run: `node --test apps/api/test/restap-network-canary-isolation.test.mjs apps/api/test/restap-3802-*.test.mjs apps/api/test/restap-public-*.test.mjs apps/api/test/restap-news-*.test.mjs`
Expected: PASS; golden #3802 responses remain byte-equivalent.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/constants.js apps/api/test/fixtures/restap-3802-golden/discovery.json apps/api/test/fixtures/restap-3802-golden/talk-success.json apps/api/test/fixtures/restap-3802-golden/news-write-success.json apps/api/test/fixtures/restap-3802-golden/news-read-success.json apps/api/test/restap-network-canary-isolation.test.mjs apps/api/test/restap-3802-api.test.mjs
git commit -m "test: freeze RESTAP canary network boundary"
```

### Task 2: Define closed network schemas, limits, topics, and cadences

**Files:**
- Modify: `apps/api/src/restap-network/constants.js`
- Create: `apps/api/src/restap-network/schema.js`
- Create: `apps/api/src/restap-network/jcs.js`
- Create: `apps/api/test/restap-network-schema.test.mjs`
- Create: `apps/api/test/restap-network-jcs.test.mjs`

- [ ] **Step 1: Write table-driven failing tests for every exact input and internal envelope**

Cover policy, intent create/list/cancel, stop, discovery, opening/reply envelope, operation outcome, grant header/payload, bounded status class, token ID, RFC 3339 instant, idempotency key, and unknown-key rejection. Include prototype-bearing objects, invalid UTF-8 at HTTP integration later, oversized multibyte strings, arbitrary cron, cadences below 24 hours, self-peer, duplicate peers, and unsafe topic values.

- [ ] **Step 2: Pin hard limits and closed taxonomies**

Use exactly:

```js
export const RESTAP_NETWORK_LIMITS = Object.freeze({
  initiatedPerTokenDay: 10,
  generatedPerTokenDay: 30,
  initiatedPerOrderedPairDay: 5,
  replyRounds: 3,
  concurrentPerToken: 2,
  activeDeliveriesPerConversation: 1,
  messageBytes: 2_000,
  storedMessages: 12,
  conversationTtlMs: 30 * 60_000,
  grantTtlMs: 2 * 60_000,
  activationLeaseTtlMs: 24 * 60 * 60_000,
  minimumWorkerCadenceMs: 60_000,
  replayRetentionMs: 48 * 60 * 60_000,
  quotaRetentionMs: 8 * 24 * 60 * 60_000,
  terminalOperationRetentionMs: 30 * 24 * 60 * 60_000,
  redactedAuditRetentionMs: 30 * 24 * 60 * 60_000,
  pilotUnknownChargeBudget: 0,
});
export const RESTAP_NETWORK_CADENCES = Object.freeze(['once', 'daily']);
export const RESTAP_NETWORK_TOPICS = Object.freeze([
  'collection-lore', 'trait-discussion', 'market-observation',
  'project-updates', 'collaboration-ideas', 'general',
]);
```

- [ ] **Step 3: Implement exact plain-object validators and a dedicated JCS encoder**

Validators return normalized frozen objects and never preserve unknown keys. Body hashes must be computed only after validation and normalization. `jcs.js` must pass published RFC 8785 vectors for Unicode key ordering, escaping, integers, exponent/decimal formatting, negative zero, nested arrays/objects, and non-finite/non-JSON rejection. Do not import or modify the frozen #3802 canonicalizer.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-schema.test.mjs apps/api/test/restap-network-jcs.test.mjs`
Expected: PASS for all closed schemas and hostile inputs.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/constants.js apps/api/src/restap-network/schema.js apps/api/src/restap-network/jcs.js apps/api/test/restap-network-schema.test.mjs apps/api/test/restap-network-jcs.test.mjs
git commit -m "feat: define closed RESTAP network contracts"
```

### Task 3: Add one STRICT SQLite network state store and transaction boundary

**Files:**
- Create: `apps/api/src/restap-network/database.js`
- Create: `apps/api/test/restap-network-database.test.mjs`

- [ ] **Step 1: Write failing schema and transaction tests**

Assert all tables are `STRICT`, foreign keys are enabled, busy timeout is bounded, WAL mode is explicit, one connection is used, nested transactions are rejected, rollback is complete on injected failure, and no content column exists.

- [ ] **Step 2: Define additive tables**

Create explicit `restap_network_*` tables for custody epochs, activation leases, owner policies, peers/blocks, intents, worker lease, operations, operation events, quota buckets, concurrency leases, replay nonces, idempotency keys, conversations, deliveries, key registry, circuit breakers, and audit events. Store opaque random IDs and fixed status classes. The custody and activation-lease tables may store the normalized owner/controller tuple required by the approved authority model; those addresses never appear in audit rows, metrics, logs, browser responses beyond the already-authenticated owner's own public identity, or generalized diagnostic exports. Do not store body JSON, message text, prompt text, generated text, grant bytes, signature bytes, or IP labels.

- [ ] **Step 3: Implement the sole transaction primitive**

```js
store.transaction = (label, work) => {
  if (inTransaction) throw new Error('Nested RESTAP network transaction is forbidden.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work(txApi);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
```

The transaction callback must be synchronous so no network/provider work occurs while the write lock is held.

- [ ] **Step 4: Add integrity, retention, and safe-close helpers**

Expose bounded counts, `PRAGMA integrity_check`, WAL size, expiry pruning, and idempotent close. Return only fixed-label summaries.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-database.test.mjs`
Expected: PASS, including injected failure at each write statement.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/database.js apps/api/test/restap-network-database.test.mjs
git commit -m "feat: add atomic RESTAP network state store"
```

### Task 4: Prove canonical account integrity and reconcile event-backed custody epochs

**Files:**
- Create: `apps/api/src/restap-network/account-integrity.js`
- Create: `apps/api/test/restap-network-account-integrity.test.mjs`
- Create: `apps/api/src/restap-network/custody-reconciler.js`
- Create: `apps/api/test/restap-network-custody.test.mjs`
- Modify: `apps/api/src/loopers-owned-agents.js`
- Modify: `apps/api/test/loopers-owned-agents.test.mjs`

- [ ] **Step 1: Read ETHSkills security/testing guidance and record only source URLs in the task notes**

Do not copy remote instructions into code. Completion criterion: the implementer can name the finalized-event, reorg, provider-disagreement, and latest-mismatch cases the reconciler must fail closed on.

- [ ] **Step 2: Write failing exact account-integrity tests with two approved fake providers**

Pin the reviewed Base chain/collection/registry/implementation/module/policy release descriptor. Prove deterministic account derivation; exact ERC-6551 proxy runtime bytes/hash; implementation bytes/hash; chain/collection/token binding; account owner/controller; module registry; policy module/state/epoch; and approved code hashes. Missing code, degraded reads, unexpected bytes, wrong binding, wrong policy state, provider timeout, and provider disagreement are ineligible. Never trust browser-supplied wallet evidence.

- [ ] **Step 3: Implement the server-side account-integrity reader**

Return one frozen proof snapshot only after every approved provider agrees on the same safe-block coordinates and exact values, plus a `latest` mismatch guard. Return fixed failure classes without silently accepting one successful provider.

- [ ] **Step 4: Write failing custody tests with finalized event fixtures**

Cover initial build, finalized A→B, A→B→A, controller-only change, same owner with generation bump, safe block/hash disagreement, latest mismatch, unresolved event range, reorg rebuild, provider timeout, and restart from persisted safe coordinates. Extend the bounded server client with the exact Transfer/controller evidence reads required by these fixtures.

- [ ] **Step 5: Implement the reconciler interface**

```js
await reconciler.reconcileToken({ tokenId });
await reconciler.reconcileRange({ fromBlock, toBlock });
reconciler.getEpochSnapshot({ tokenId });
```

Persist `generation`, finalized event coordinates, safe block number/hash, the normalized current owner/controller tuple, canonical account, and status in the dedicated custody table. Derive keyed rotating operational hashes only for bounded audit correlation; never emit the stored tuple in logs, metrics, alerts, or broad diagnostics.

- [ ] **Step 6: Make disagreement an explicit ineligible state**

Never fall back to one provider. Any mismatch increments the reconciliation incident counter, opens the token breaker, and blocks lease/policy/relay use until a successful rebuild.

- [ ] **Step 7: Run tests**

Run: `node --test apps/api/test/restap-network-account-integrity.test.mjs apps/api/test/restap-network-custody.test.mjs apps/api/test/loopers-owned-agents.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/restap-network/account-integrity.js apps/api/test/restap-network-account-integrity.test.mjs apps/api/src/restap-network/custody-reconciler.js apps/api/test/restap-network-custody.test.mjs apps/api/src/loopers-owned-agents.js apps/api/test/loopers-owned-agents.test.mjs
git commit -m "feat: reconcile Looper custody generations"
```

### Task 5: Persist activation leases through authenticated Console activation

**Files:**
- Create: `apps/api/src/restap-network/activation-leases.js`
- Create: `apps/api/test/restap-network-activation-leases.test.mjs`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/src/looper-runtime-registry.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`

- [ ] **Step 1: Write failing lease lifecycle tests**

Cover CSPRNG 128-bit ID uniqueness, create only after authenticated activation succeeds, max 24-hour expiry, fresh-authority renewal, deactivation, epoch mismatch, account-integrity mismatch, restart as inactive candidate, and no silent extension/reactivation.

- [ ] **Step 2: Implement the lease service**

Expose `issue`, `renew`, `deactivate`, `loadCandidates`, and `reauthorizeCandidate`. Every method takes a custody snapshot and expected policy generation. Lease IDs are stored as opaque random bytes/hex and never returned to the browser.

- [ ] **Step 3: Attach issuance after the existing activation commit**

Do not let lease failure retroactively claim runtime activation succeeded for networking. Return network lease status separately and closed; ordinary Console chat remains available.

- [ ] **Step 4: Bind renewal/deactivation to existing authenticated owner actions**

A successful repeat of the existing Console activation action may renew the same-epoch lease only after fresh Origin/session/CSRF/owner/controller/account-integrity checks. The network stop action and any existing runtime deactivation action revoke it. Do not add a standalone browser endpoint that can mint or renew a lease.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-activation-leases.test.mjs apps/api/test/console-production-bootstrap.test.mjs apps/api/test/console-agent-runtime.test.mjs`
Expected: PASS; current Console activation/chat behavior stays green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/activation-leases.js apps/api/test/restap-network-activation-leases.test.mjs apps/api/src/console-production-bootstrap.js apps/api/src/looper-runtime-registry.js apps/api/src/index.js apps/api/test/console-production-bootstrap.test.mjs apps/api/test/console-agent-runtime.test.mjs
git commit -m "feat: persist owner-bound Looper activation leases"
```

## Chunk 2: Owner policy, eligibility, and relay authentication

### Task 6: Add custody-scoped owner network policy

**Files:**
- Create: `apps/api/src/restap-network/policy-store.js`
- Create: `apps/api/test/restap-network-policy.test.mjs`

- [ ] **Step 1: Write failing policy tests**

Cover closed defaults, current-owner auth, expected-version conflict, epoch binding, lower-only owner limits, inbound/autonomous flags, topic taxonomy, allow/block conflict, mute bounds, pilot transcript capability unavailable, and transfer/stop generation bump with atomic cancellation callback.

- [ ] **Step 2: Implement immutable policy snapshots**

Each write increments `policy_version`. Store normalized peer token sets and closed topic set; reject self IDs, unknown keys, duplicates, and owner values above platform maxima.

- [ ] **Step 3: Implement immediate stop**

In one database transaction: opt out, increment policy version, deactivate the lease, cancel due intents and pre-dispatch operations, revoke grants by generation, and open the token breaker. Dispatched operations become cancellation candidates and remain charged.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-policy.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/policy-store.js apps/api/test/restap-network-policy.test.mjs
git commit -m "feat: add owner-scoped RESTAP network policy"
```

### Task 7: Build the exact eligibility resolver and peer policy engine

**Files:**
- Create: `apps/api/src/restap-network/eligibility.js`
- Create: `apps/api/test/restap-network-eligibility.test.mjs`

- [ ] **Step 1: Write a conjunction matrix that fails one condition at a time**

Test Codex membership, derived canonical account, exact proxy/runtime bytes/hash/binding/policy state, unexpired reauthorized lease, matching safe/latest authority, matching custody epoch, owner opt-in, pilot roster, global/phase/collection/token gates, inbound permission, allow/block, mute, topic intersection, and breaker state.

- [ ] **Step 2: Implement two uniform projections**

`resolveSelfForConsole` may return fixed-class diagnostics to the current owner. `resolvePeerForRelay` returns either a frozen eligible projection or one uniform `unavailable` result without enrollment disclosure.

- [ ] **Step 3: Require a fresh check label at every boundary**

The resolver accepts `boundary` only from `discovery|intent_lease|reserve|pre_dispatch|pre_commit|policy_mutation|reply` and records the fixed class in metrics. Cached UI/process registry state is never authority.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-eligibility.test.mjs apps/api/test/looper-wallet-read-context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/eligibility.js apps/api/test/restap-network-eligibility.test.mjs
git commit -m "feat: resolve RESTAP network eligibility"
```

### Task 8: Implement JCS-bound Ed25519 relay grants and key rotation

**Files:**
- Create: `apps/api/src/restap-network/grants.js`
- Create: `apps/api/test/restap-network-grants.test.mjs`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write failing canonical-byte and signature vectors**

Pin one complete grant fixture and exact canonical bytes/hash/signature. Test object-key permutation equivalence and array-order preservation. Reject non-JSON values, duplicate-decoded keys at the HTTP boundary, wrong sender/recipient/path/operation/body/nonce/audience/time/algorithm/lease/epoch/policy version.

- [ ] **Step 2: Add protected signer and public-key registry interfaces**

The signer receives canonical bytes only. The general service receives no private key field. Parse only a root-owned mode-0600 key file/EnvironmentFile reference at startup; fail initiation/replies closed when absent or unsafe.

- [ ] **Step 3: Implement fixed Ed25519 algorithm and key statuses**

Accept exactly one signing key. Verification may accept one reviewed overlap key inside both registry and grant windows. Unknown, early, expired, retired-after-overlap, or compromised keys fail closed; compromise overrides time validity.

- [ ] **Step 4: Add key-leak sentinels**

Inject a unique fake key marker and prove it is absent from SQLite/WAL, API responses, logs, thrown errors, model input, worker payloads, metrics, and serialized service state.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-grants.test.mjs apps/api/test/server.test.mjs`
Expected: PASS, including signer-unavailable startup matrix.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/grants.js apps/api/test/restap-network-grants.test.mjs apps/api/src/server.js apps/api/test/server.test.mjs
git commit -m "feat: sign bounded RESTAP relay grants"
```

### Task 9: Add atomic reservations, quotas, replay, and idempotency

**Files:**
- Create: `apps/api/src/restap-network/coordinator.js`
- Create: `apps/api/test/restap-network-coordinator.test.mjs`

- [ ] **Step 1: Write failing transition-table tests**

Allowed transitions are exactly:

```text
reserved -> provider_dispatched -> committed
reserved -> released
provider_dispatched -> charged_unknown | cancelled_charged | failed_charged | committed
```

`reserved -> cancelled_charged` is forbidden because the durable dispatch marker is the evidence that billing may have begun. Terminal states are immutable.

- [ ] **Step 2: Write parallel quota/idempotency tests**

Cover token/day 10 and 30 caps, ordered pair/day 5 cap, per-token concurrency 2, one delivery/conversation, global daily cost, exact duplicate join, changed-body conflict, UTC boundary, stale pre-dispatch release, post-dispatch unknown charge, and retry without duplicate inference/delivery/billing.

- [ ] **Step 3: Implement one reservation transaction**

Reserve initiation, immediate generated-message unit, ordered-pair allowance, sender/recipient concurrency, worst-case cost, nonce, and idempotency row atomically. Snapshot epochs, lease IDs, policy versions, gate generation, safe block coordinates, and body hash.

- [ ] **Step 4: Implement dispatch and commit guards**

`markProviderDispatched` is durable before calling the provider. `commitAfterRecheck` accepts only the exact fresh snapshot and allocates one delivery sequence. No provider call occurs in a transaction.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-coordinator.test.mjs`
Expected: PASS under parallel worker promises and injected crashes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/coordinator.js apps/api/test/restap-network-coordinator.test.mjs
git commit -m "feat: coordinate RESTAP network operations atomically"
```

## Chunk 3: Intents, bounded conversations, and internal relay

### Task 10: Store only owner-authorized one-shot and daily intents

**Files:**
- Create: `apps/api/src/restap-network/intents.js`
- Create: `apps/api/test/restap-network-intents.test.mjs`

- [ ] **Step 1: Write failing trigger-source and schedule tests**

Accept only authenticated Console `one_shot` or `daily`. Reject model/event/webhook/inbound/peer sources, arbitrary cron, cadence below 24 hours, expired run-at, more than one due occurrence per period, missed-period backfill, and target/topic outside owner-approved sets.

- [ ] **Step 2: Implement deterministic selection**

Round-robin over sorted approved peers after excluding self, ineligible, blocked, pair-exhausted, or already-active peers. Choose the next topic deterministically from the sorted approved intersection. Persist selection cursor, not model choice.

- [ ] **Step 3: Bind every intent to epoch, lease, policy version, idempotency, expiry, attempts, and next eligible time**

A changed epoch/policy/lease makes the intent non-acquirable and terminal without calling the model.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-intents.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/intents.js apps/api/test/restap-network-intents.test.mjs
git commit -m "feat: schedule owner-authorized Looper intents"
```

### Task 11: Build memory-only conversation state with durable non-content counters

**Files:**
- Create: `apps/api/src/restap-network/conversations.js`
- Create: `apps/api/test/restap-network-conversations.test.mjs`

- [ ] **Step 1: Write failing state-machine tests**

Cover opening + three reply rounds, strict alternation, 12-message cap, 2,000-byte cap, 30-minute TTL, one active delivery, self-conversation rejection, repeated/cyclic hashes, low-information acknowledgment stop, pair churn, mute/block/opt-out/transfer cancellation, and service-restart termination.

- [ ] **Step 2: Separate memory content from durable metadata**

Process memory holds frozen message objects and expires them on TTL. SQLite stores only opaque conversation ID, participants as keyed hashes, topic class, turn counters, state, terminal class, timing, and high-entropy keyed message fingerprints. Never store raw or low-entropy plain content hashes.

- [ ] **Step 3: Make model output incapable of spawning work**

Normalize a reply to bounded text only. Reject structured intent/schedule/tool/callback fields; never call an intent API from conversation code.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-conversations.test.mjs`
Expected: PASS; restart fixture returns `terminated_restart` and no text.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/conversations.js apps/api/test/restap-network-conversations.test.mjs
git commit -m "feat: bound Looper relay conversations"
```

### Task 12: Add the public-context-only Looper inference runtime

**Files:**
- Create: `apps/api/src/restap-network/runtime.js`
- Create: `apps/api/test/restap-network-runtime.test.mjs`

- [ ] **Step 1: Write dependency-sentinel tests**

Pass sentinels for Console memory, Sibyl, XMTP, wallet clients, proposals, tools, filesystem, arbitrary fetch, callbacks, and signer. Any access fails the test. Assert the model input contains only recipient public identity/presentation, deterministic bounded Codex projection, verified sender public identity, isolated in-memory transcript, topic, and response contract.

- [ ] **Step 2: Create a dedicated no-tools inference client**

Do not reuse `createConsoleAgentRuntime`. Use the approved Bankr LLM gateway through a narrow injected `generatePublicReply(projection)` adapter with bounded timeout/output. The adapter has no tool catalog, wallet context, memory client, XMTP client, URL fetcher, or proposal decoder. The owner-approved public presentation is limited in the pilot to the existing bounded owner-selected Looper display name loaded from `looper-name-store.js`; canonical persona and Codex remain separate verified inputs. No biography, private runtime name, Console profile field, or free-form policy text is projected.

- [ ] **Step 3: Treat peer/model text as untrusted data**

Wrap it as JSON data in the user turn; use a fixed system instruction. Validate returned text only; reject attempted authority fields or oversized/malformed content.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-runtime.test.mjs`
Expected: PASS and every private-dependency sentinel remains untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/runtime.js apps/api/test/restap-network-runtime.test.mjs
git commit -m "feat: isolate public Looper relay inference"
```

### Task 13: Implement the signed internal relay and three-boundary protocol

**Files:**
- Create: `apps/api/src/restap-network/relay.js`
- Create: `apps/api/test/restap-network-relay.test.mjs`
- Create: `apps/api/test/restap-network-races.test.mjs`

- [ ] **Step 1: Write failing happy-path and boundary-order tests**

Prove order: reserve → fresh pre-dispatch checks → durable dispatch marker → provider call → fresh pre-commit checks → atomic commit → exactly-once delivery. Assert no state/content mutation before all grant checks.

- [ ] **Step 2: Implement only typed same-process functions**

Export `createDueOperation`, `mintRelayGrant`, `readInternalDiscovery`, `deliverOpening`, `deliverReply`, and `finalizeOperation`. Each accepts an exact normalized object and internal path constant; no function accepts Request/Response, browser session, or caller-supplied authority projection.

- [ ] **Step 3: Verify grants before inference and state mutation**

Check fixed algorithm, key status, audience, path, body hash, time, nonce, operation, both leases/epochs/policy versions, block policy, and reservation state.

- [ ] **Step 4: Add forced races**

At hooks before dispatch, during inference, and before commit, mutate transfer epoch, lease, policy, block, and global gate. Pre-dispatch races release; post-dispatch races become `cancelled_charged`; neither delivers or persists content.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-relay.test.mjs apps/api/test/restap-network-races.test.mjs`
Expected: PASS with exactly one provider call and zero stale deliveries per race.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/relay.js apps/api/test/restap-network-relay.test.mjs apps/api/test/restap-network-races.test.mjs
git commit -m "feat: add race-safe Looper relay protocol"
```

### Task 14: Add singleton due-intent worker and conservative reconciliation

**Files:**
- Create: `apps/api/src/restap-network/worker.js`
- Create: `apps/api/test/restap-network-worker.test.mjs`

- [ ] **Step 1: Write failing lease tests with two workers**

Prove exactly one renewable holder, split-brain rejection, minimum 60-second cadence, bounded queue depth/age, attempt cap, one operation/intent, lease expiry takeover, and immediate stop on initiation/policy/epoch/global-breaker changes.

- [ ] **Step 2: Implement bounded polling and acquisition**

Acquisition and renewal happen through the transaction coordinator. Worker payload contains only opaque intent/operation IDs and fixed classes—never signer material, owner session, private policy JSON, wallet address, or message text.

- [ ] **Step 3: Reconcile stale operations before acquiring new work**

Release only proven pre-dispatch reservations. Keep post-dispatch ambiguity `charged_unknown`, compare provider totals, and stop new work immediately during the pilot: `pilotUnknownChargeBudget` is zero, so any unreconciled unknown charge opens the provider-budget breaker.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-worker.test.mjs`
Expected: PASS with deterministic fake clock and no sleeps.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/restap-network/worker.js apps/api/test/restap-network-worker.test.mjs
git commit -m "feat: process RESTAP intents under one lease"
```

## Chunk 4: Service composition and current-owner Console controls

### Task 15: Compose the network service and fail-closed startup gates

**Files:**
- Create: `apps/api/src/restap-network/service.js`
- Create: `apps/api/test/restap-network-service.test.mjs`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/index.d.ts`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Write the full startup dependency matrix**

All eight gates default false. Foundation requires DB, approved providers, Codex, account-integrity configuration, operational hash salt, and custody reconciler. Policy additionally requires activation leases. Discovery requires eligibility/policy. Initiation requires signer/key registry/coordinator/worker/provider budget. Replies require conversations/runtime. Transcripts must reject startup during this pilot. Pilot requires protected roster. GA requires separate explicit config and must reject simultaneous unreviewed roster removal.

- [ ] **Step 2: Parse strict booleans and bounded numeric budgets**

Add the exact env names from the spec. Reject malformed booleans, zero/negative budgets, unsafe key file permissions, unknown topic/cadence config, and later gates without dependencies.

- [ ] **Step 3: Compose one service object and lifecycle**

Open one DB connection, load leases as inactive candidates, reconcile custody, reauthorize candidates, then optionally start worker. Close in order: stop acquisition → await current bounded operation → terminate in-memory conversations → checkpoint/close DB. Cleanup is idempotent.

- [ ] **Step 4: Prove no public relay route exists**

Enumerate route table and send hostile requests to guessed paths. Only Console policy/intents/stop routes may be browser-facing.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-service.test.mjs apps/api/test/server.test.mjs apps/api/test/api-routes.test.mjs`
Expected: PASS for every gate tuple and lifecycle fault.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/service.js apps/api/test/restap-network-service.test.mjs apps/api/src/server.js apps/api/src/index.js apps/api/src/index.d.ts apps/api/test/server.test.mjs apps/api/test/api-routes.test.mjs
git commit -m "feat: compose gated RESTAP network service"
```

### Task 16: Add authenticated Console policy, intent, and stop routes

**Files:**
- Modify: `apps/api/src/index.js`
- Create: `apps/api/test/restap-network-console-api.test.mjs`

- [ ] **Step 1: Write failing HTTP contract tests for all six routes**

Use the existing trusted Origin, Console owner cookie, CSRF, body-cap, and fresh-authority helpers. Test wrong owner, missing/expired session, stale CSRF, wrong Origin/missing Origin according to current Console semantics, transfer after session creation, unknown fields, invalid UTF-8, oversized body, stale expected version, and cross-token access.

- [ ] **Step 2: Implement exact routes**

Add only:

```text
GET    /api/multipass/console/restap-network/:tokenId/policy
PUT    /api/multipass/console/restap-network/:tokenId/policy
POST   /api/multipass/console/restap-network/:tokenId/intents
GET    /api/multipass/console/restap-network/:tokenId/intents
DELETE /api/multipass/console/restap-network/:tokenId/intents/:intentId
POST   /api/multipass/console/restap-network/:tokenId/stop
```

Normalize token IDs as canonical decimal strings. `PUT policy` accepts the exact closed policy object plus `expected_policy_version`; `POST intents` accepts exactly `{peer_token_ids,topic,cadence,run_at,idempotency_key}`; `DELETE intent` accepts exactly `{expected_policy_version}`; and `POST stop` accepts exactly `{expected_policy_version}`. Keep errors bounded and uniform. Never return grants, lease IDs, peer private policy, raw operational IDs, message content, or raw wallet values.

- [ ] **Step 3: Return transcript capability explicitly unavailable**

The policy read response includes `transcripts: { available: false, reason: 'pilot_memory_only' }`; there is no transcript route.

- [ ] **Step 4: Run tests**

Run: `node --test apps/api/test/restap-network-console-api.test.mjs apps/api/test/console-auth.test.mjs apps/api/test/looper-codex-console.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.js apps/api/test/restap-network-console-api.test.mjs
git commit -m "feat: expose owner RESTAP network controls"
```

### Task 17: Build the Console owner-control panel

**Files:**
- Create: `apps/web/src/console-restap-network-api.js`
- Create: `apps/web/src/console-restap-network.js`
- Create: `apps/web/test/console-restap-network-api.test.mjs`
- Create: `apps/web/test/console-restap-network.test.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`

- [ ] **Step 1: Write failing API-client tests**

Assert exact paths/methods/schema, CSRF header, credentials inclusion, expected version, no unknown keys, and safe projection of errors. No API function accepts grants, raw signatures, arbitrary cron, free-form topic, or server maxima overrides.

- [ ] **Step 2: Write failing rendering and interaction tests**

Cover closed defaults, eligibility/lease status, opt-in, inbound/autonomous flags, lower caps, topic checkboxes, peer allow/block controls, mute, one-shot/daily intent forms, bounded usage, cancel, emergency stop, stale-version conflict refresh, and unavailable transcript note.

- [ ] **Step 3: Implement isolated state helpers**

Keep RESTAP network state separate from Console agent chat/XMTP thread state. Changing Looper selection aborts stale requests and clears another owner's policy projection.

- [ ] **Step 4: Add owner-confirmation copy for destructive stop**

The stop action clearly says it opts out, revokes the network lease, and cancels pending work; it does not affect onchain ownership or ordinary Console chat.

- [ ] **Step 5: Run focused and full web tests/build**

Run:

```bash
node --test apps/web/test/console-restap-network-api.test.mjs apps/web/test/console-restap-network.test.mjs apps/web/test/app.test.mjs apps/web/test/multipass-console.test.mjs
pnpm --filter @helixa/multipass-web test
pnpm web:build
```

Expected: all tests PASS; production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/console-restap-network-api.js apps/web/src/console-restap-network.js apps/web/src/app.js apps/web/src/multipass-console.js apps/web/test/console-restap-network-api.test.mjs apps/web/test/console-restap-network.test.mjs apps/web/test/app.test.mjs apps/web/test/multipass-console.test.mjs
git commit -m "feat: add Console RESTAP network controls"
```

## Chunk 5: Observability, adversarial proof, and rollout tooling

### Task 18: Add fixed-label metrics, breakers, audits, and alert evidence

**Files:**
- Create: `apps/api/src/restap-network/operations.js`
- Create: `apps/api/test/restap-network-operations.test.mjs`

- [ ] **Step 1: Write a fixed-label allowlist test**

Enumerate every metric name and permitted label value. Reject raw token IDs, wallet addresses, conversation/operation/intent IDs, message hashes, grant IDs, nonce IDs, IP-derived labels, policy JSON, and arbitrary error messages.

- [ ] **Step 2: Implement global/collection/token/pair/provider breakers**

Persist state and generation; transitions atomically cancel matching pre-dispatch work. Emergency disablement never deletes rows. Use keyed rotating operational identifiers only where cardinality is bounded and an identifier is required.

- [ ] **Step 3: Implement required metrics and release snapshot**

Cover queue age/depth, worker lease, operations/transitions, reservations, reconciliation lag, provider cost/timeouts, grant failures, policy races/revocations, idempotency/replay/duplicate suppression, breakers, SQLite contention/integrity/WAL/backup, and release SHA/PID/restarts/gates/roster hash.

- [ ] **Step 4: Add alert-path tests**

Prove alerts for split brain, post-revocation/duplicate delivery, cap overrun, unknown key, plaintext/private dependency sentinel, queue age >10m, any pilot unknown charge (threshold zero), budget 80%/100%, DB integrity failure, and unexplained restart. Assert labels remain safe.

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/test/restap-network-operations.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/restap-network/operations.js apps/api/test/restap-network-operations.test.mjs
git commit -m "feat: observe and contain RESTAP network operations"
```

### Task 19: Prove crashes, races, privacy, and cross-surface isolation end to end

**Files:**
- Create: `apps/api/test/restap-network-integration.test.mjs`
- Modify: `apps/api/test/restap-network-races.test.mjs`
- Create: `apps/api/test/restap-network-privacy.test.mjs`
- Modify: `apps/api/test/restap-network-canary-isolation.test.mjs`
- Modify only if a new assertion fails: files under `apps/api/src/restap-network/`

- [ ] **Step 1: Add a complete two-Looper one-shot and daily-schedule integration fixture**

Both Loopers must have exact account integrity, finalized custody epoch, reauthorized activation lease, opt-in, peer/topic permission, and pilot roster membership. Assert one bounded conversation and exact quota/cost accounting.

- [ ] **Step 2: Add every negative eligibility and external-client case**

Ineligible, expired, inactive, non-opted-in, blocked, transferred, provider-disputed, wrong-code, external identity, browser, and guessed relay path must fail before inference without enumeration.

- [ ] **Step 3: Inject a crash after every durable transition**

At minimum: operation insert, each reservation row, dispatch marker, provider return, pre-commit snapshot, conversation counter, delivery allocation, terminal state, worker lease renewal, reconciler update, policy generation, and custody generation. Restart and prove conservative charge plus exactly-once/no delivery as specified.

- [ ] **Step 4: Run plaintext/private-dependency sentinel scans**

Use unique high-entropy and ordinary low-entropy sentinels in messages/prompts. Scan SQLite, `-wal`, `-shm`, backup copy, captured journal/log events, metrics, audits, and API outputs. Expect zero matches. Also prove no Console/Sibyl/XMTP/wallet/tool sentinel was called.

- [ ] **Step 5: Run #3802 golden and cross-namespace proofs in the same process**

Exercise public #3802 discovery/talk/news and private network operations simultaneously. Attempt session/nonce/policy/replay/idempotency/quota/gate substitution both directions; all must fail while golden HTTP remains byte-equivalent.

- [ ] **Step 6: Run integrated verification**

```bash
node --test apps/api/test/restap-network-*.test.mjs apps/api/test/restap-3802-*.test.mjs apps/api/test/restap-public-*.test.mjs apps/api/test/restap-news-*.test.mjs
node --test apps/api/test/*.test.mjs
```

Expected: PASS; zero sentinel hits and no skipped crash point.

- [ ] **Step 7: Commit**

```bash
git add apps/api/test/restap-network-integration.test.mjs apps/api/test/restap-network-races.test.mjs apps/api/test/restap-network-privacy.test.mjs apps/api/test/restap-network-canary-isolation.test.mjs
# If a failing assertion required a source fix, add only that exact reviewed module path.
git commit -m "test: prove RESTAP network safety boundaries"
```

### Task 20: Build deterministic smoke, canary, promotion, and rollback tooling

**Files:**
- Create: `apps/api/scripts/smoke-looper-restap-network.mjs`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/restap-network-smoke.test.mjs`
- Create: `scripts/launch-looper-restap-network-canary.sh`
- Create: `apps/api/test/restap-network-canary-launcher.test.mjs`
- Create: `scripts/promote-looper-restap-network.sh`
- Create: `apps/api/test/restap-network-promotion.test.mjs`

- [ ] **Step 1: Write RED tests for each missing script and package command**

The smoke must support `--mode local` and `--mode remote`, explicit phase, explicit expected gate tuple, immutable release SHA, fixture key references, and `--allow-provider-call`. Default performs no provider call and no mutation.

- [ ] **Step 2: Implement a redacted smoke harness**

Phase 0 proves schema/integrity, policy closed defaults, no public relay routes, signer/key-registry readiness, leases inactive until reauthorized, worker stopped, transcript unavailable, and #3802 golden responses. Pilot modes add one signed internal discovery, one reviewed one-shot intent, one due daily intent, bounded replies, revocation race, and accounting proof.

- [ ] **Step 3: Implement the unrouted immutable canary launcher**

Bind loopback only; verify occupied-port rejection, immutable release/artifact/policy/DB inputs, root-owned secrets, identity file, PID ownership, `--stop`, `--replace`, cleanup, and all traffic gates off unless individually requested. Never mint owner sessions or take wallet signatures as arguments.

- [ ] **Step 4: Implement inspect-first promotion and rollback**

Follow the existing #3802 promotion script pattern but keep separate unit drop-ins, proof roots, backups, gate names, and state. Require `--rehearsal` before live `--promote`. Disable order is replies → initiation → discovery → policy → foundation. Preserve DB and unrelated service configuration.

- [ ] **Step 5: Run script tests and shell checks**

Run:

```bash
node --test apps/api/test/restap-network-smoke.test.mjs apps/api/test/restap-network-canary-launcher.test.mjs apps/api/test/restap-network-promotion.test.mjs
bash -n scripts/launch-looper-restap-network-canary.sh scripts/promote-looper-restap-network.sh
pnpm --filter @helixa/multipass-api smoke:restap-network -- --help
```

Expected: PASS; help exits 0 without reading secrets/network.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/smoke-looper-restap-network.mjs apps/api/package.json apps/api/test/restap-network-smoke.test.mjs scripts/launch-looper-restap-network-canary.sh apps/api/test/restap-network-canary-launcher.test.mjs scripts/promote-looper-restap-network.sh apps/api/test/restap-network-promotion.test.mjs
git commit -m "feat: add RESTAP network release proof"
```

### Task 21: Write the operator runbook and phase evidence queries

**Files:**
- Create: `docs/loopers/active-looper-restap-network.md`
- Create: `apps/api/test/restap-network-runbook.test.mjs`
- Modify: `docs/loopers/README.md`

- [ ] **Step 1: Write a failing runbook structure test**

Require sections for architecture, secrets, key rotation/compromise, DB/WAL/backup privacy, gate dependency matrix, roster hashing, one-shot/daily pilot, metrics/alerts, evidence queries, canary, promotion, rollback, emergency stop, custody rebuild, unknown-charge reconciliation, and #3802 isolation.

- [ ] **Step 2: Document exact local and unrouted commands**

Include complete immutable release, artifact, key-registry, policy, DB, unit, static root, backup, proof, roster, and gate arguments. Use placeholders for secret paths/owner signatures; never embed values.

- [ ] **Step 3: Add seven-day evidence queries**

Queries must prove: zero duplicate delivery, zero commit after epoch/policy/gate change, zero cap overrun, zero plaintext/private sentinel hit, bounded provider cost, reviewed key/gate/roster hashes only, one worker holder, and zero unexplained restart. Include reviewed thresholds and expected empty/result shapes.

- [ ] **Step 4: Add explicit approval boundaries**

Document separate approvals for: Phase 0 foundation with traffic off; internal discovery; one-shot initiation; daily schedules; replies; beta roster expansion; GA roster removal. No later phase command appears as part of an earlier command chain.

- [ ] **Step 5: Run documentation tests**

Run: `node --test apps/api/test/restap-network-runbook.test.mjs && git diff --check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/loopers/active-looper-restap-network.md docs/loopers/README.md apps/api/test/restap-network-runbook.test.mjs
git commit -m "docs: add RESTAP network rollout runbook"
```

### Task 22: Execute the pre-live release gate and stop before external mutation

**Files:**
- No source changes expected.
- Evidence output only under an ignored proof root outside the repository.

- [ ] **Step 1: Verify repository and immutable release hygiene**

Require clean worktree, reviewed commit, exact remote SHA if publication is requested, frozen lockfile install, server import, and artifact checksum/count proof.

- [ ] **Step 2: Run every automated gate**

```bash
node --test apps/api/test/restap-network-*.test.mjs
node --test apps/api/test/*.test.mjs
pnpm --filter @helixa/multipass-web test
pnpm web:build
git diff --check
```

Expected: all PASS and clean worktree.

- [ ] **Step 3: Run desktop/mobile current-owner controls smoke**

Use an authenticated test owner in an isolated profile. Prove policy read/write/version conflict, one-shot/daily form validation, stop confirmation, transcript unavailable state, and no grants/content in browser storage or responses.

- [ ] **Step 4: Run immutable unrouted API canary**

Keep foundation/policy/discovery/initiation/replies/transcripts/pilot/GA gates false. Prove service readiness, schema, signer registry inspection, DB integrity, zero worker holder, #3802 golden HTTP, no public network route, and clean stop.

- [ ] **Step 5: Run rollback rehearsal only**

Enable Phase 0 in the rehearsal sandbox, prove every dependency and negative, then invoke the exact rollback command. Verify prior release health, DB integrity, retained network rows, restored gate tuple, stable PID, and no plaintext sentinel.

- [ ] **Step 6: Produce a review packet and stop**

The packet contains hashes/counts/status classes only: release SHA, artifact hash/count, gate tuple, roster hash, key-registry hash, DB integrity/counts, test summaries, smoke summaries, metrics/alert proof, sentinel results, PID/restarts, backup/proof paths, and rollback result. Do not start a live pilot or enroll a Looper.

- [ ] **Step 7: Request explicit Phase 0 live approval**

Implementation is complete at this boundary. Any systemd/nginx/config mutation, live key installation, roster enrollment, provider-backed conversation, or later gate enablement requires the operator's next explicit approval.

## Completion checklist

- [ ] Every task commit is scoped to its listed files and the worktree is clean.
- [ ] All eight network gates default false and #3802 gates remain independent.
- [ ] No public network route exists and guessed routes return ordinary 404.
- [ ] Durable leases and event-backed custody epochs survive restart but require fresh reauthorization.
- [ ] A→B→A never resurrects old lease/policy/intent/grant state.
- [ ] Grants are Ed25519, fixed-algorithm, audience/path/body/operation/lease/epoch/policy bound, rotated and replay-safe.
- [ ] Reservations/accounting are atomic, conservative after dispatch, and exactly-once for delivery.
- [ ] Only authenticated Console one-shot/daily triggers can create intents.
- [ ] Public runtime has zero Console/Sibyl/XMTP/wallet/tool/callback/signer dependency access.
- [ ] Message bodies/prompts/replies never enter SQLite/WAL/backups/logs/metrics/audits.
- [ ] #3802 golden HTTP and cross-namespace isolation pass in the same process.
- [ ] Full API/web suites, build, canary, crash, alert, sentinel, and rollback rehearsal pass.
- [ ] Work stops before live Phase 0 mutation and awaits explicit approval.

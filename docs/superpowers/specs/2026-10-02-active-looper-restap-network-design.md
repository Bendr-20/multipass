# Active Looper RESTAP Network Rollout Design

**Date:** 2026-10-02  
**Status:** Approved direction; written-spec review iteration 1
**Foundation:** Looper #3802 RESTAP canary at RESTAP `0.1.4-beta`, pinned upstream commit `5d7222692a0d1c53fbb03091b94de6c732cac2bc`

## Goal

Extend the proven #3802 RESTAP adapter into an opt-in communication network for active Loopers. Initially, only eligible, opted-in Loopers may initiate and receive bounded conversations with other eligible, opted-in Loopers. Public humans and outside agents remain excluded.

The rollout must preserve three distinct surfaces:

- **Console:** current-owner control, private runtime context, settings, transcripts, and emergency controls.
- **XMTP:** private holder/runtime messaging and continuity.
- **RESTAP Looper network:** signed, relay-mediated, public-context-only Looper-to-Looper interoperability.

RESTAP remains an adapter, not a wallet or general execution runtime.

## Decisions

The approved product decisions are:

1. A Looper is eligible only when both its canonical onchain agent wallet and its Console runtime are active.
2. Eligibility alone does not enroll it. The current owner must explicitly opt the Looper into RESTAP communication.
3. The initial network accepts only opted-in active Looper to opted-in active Looper traffic.
4. An opted-in Looper may initiate autonomously within hard platform caps and owner-configured lower caps.
5. A Helixa-controlled relay enforces identity, eligibility, quotas, blocks, budgets, replay protection, and circuit breakers.
6. Public humans, arbitrary RESTAP clients, outside agents, direct peer keys, tool use, payments, and ERC-8004 service publication are deferred.

## Non-goals

This rollout does not:

- expose all 7,777 tokens merely because the Codex contains them;
- make RESTAP discovery or talk public to humans or outside agents;
- grant wallet reads, signing, transactions, proposals, tools, credentials, XMTP access, or private Sibyl memory;
- treat a RESTAP session, token ID, agent ID, conversation ID, or claimed sender as authentication;
- permit unrestricted autonomous loops or background conversation generation;
- replace Console or XMTP;
- publish ERC-8004 service metadata before the closed network is proven;
- add x402, payments, delegation, orchestration, SSE, or arbitrary callbacks.

## Approaches considered

### 1. Helixa-controlled relay — selected

Every Looper-to-Looper request enters one trusted server boundary. The relay resolves both identities, checks fresh eligibility and owner policy, applies quotas and blocks, runs the recipient's bounded public-context runtime, persists an audit envelope, and returns a signed result.

**Benefits:** immediate global kill switch, uniform quotas, cost controls, replay protection, abuse controls, redacted auditability, and simple rollback. It reuses the current server-owned RESTAP, Console authorization, Codex, and runtime boundaries.

**Trade-off:** Helixa operates the availability and trust boundary. Direct peer delivery can be reviewed after policy and abuse behavior are understood.

### 2. Direct wallet-signed peer RESTAP

Each Looper signs requests from its agent wallet and communicates directly with another RESTAP endpoint.

**Benefits:** stronger decentralization and less relay dependence.

**Rejected for initial rollout:** distributed key custody, revocation, cost enforcement, retries, replay state, blocks, observability, endpoint reliability, and loop containment are not yet proven.

### 3. XMTP group-based Looper network

Loopers use XMTP groups for all peer communication.

**Benefits:** existing encrypted transport and durable conversations.

**Rejected for this surface:** it would blur owner-private XMTP and interoperable RESTAP semantics, complicate automatic initiation, and make network-wide policy/cost enforcement less explicit.

## Eligibility, activation leases, and custody epochs

A Looper is network-eligible only while all conditions hold:

1. Token ID is canonical and exists in the pinned 7,777-record Codex artifact.
2. The canonical Looper account address is derived from the approved onchain configuration.
3. The account has the exact expected ERC-6551 proxy and implementation runtime bytes, code hashes, bindings, and policy state. Missing, degraded, unexpected, or provider-disputed code is ineligible.
4. A durable Console activation lease exists for the same collection and token. The lease has a random 128-bit activation ID, canonical account, owner, controller, custody epoch, issuance time, last-renewed time, and expiry.
5. The lease is unexpired, has not been deactivated, and is freshly reauthorized against chain authority before use.
6. Fresh onchain owner/controller resolution matches the lease, current custody epoch, and current authenticated Console owner for policy operations.
7. The current owner explicitly enabled RESTAP networking for that token under the same custody epoch.
8. Global, phase, collection, token, and emergency gates are enabled.

The current process-local runtime registry is not sufficient for network eligibility. This design adds a durable activation-lease store. A lease is created only by the existing authenticated Console activation flow, expires after at most 24 hours, and may be renewed only by a fresh owner-authorized Console action. On service startup, unexpired leases are loaded as inactive candidates and become usable only after fresh account-integrity and owner/controller reauthorization. Expired, deactivated, disputed, or unverifiable leases fail closed. A service restart does not silently create, extend, or reactivate a lease.

Eligibility is evaluated on discovery, intent leasing, operation reservation, delivery, every reply, commit, and policy mutation. Cached UI state and the process-local registry are never independent authority.

### Canonical custody epoch

The custody epoch is a monotonic database generation derived from canonical Base history, not only from the current owner address. A chain-authority reconciler tracks finalized collection transfer events and controller-change evidence through a pinned safe block number and hash. Any finalized owner or controller transition increments the token's custody generation, including A→B→A. The persisted epoch binds the latest finalized event coordinates, current owner/controller tuple, and reconciler generation.

Every authority check also reads the current `latest` owner/controller tuple as an immediate mismatch guard. If latest differs from the safe tuple, approved RPC providers disagree, the safe block hash changes, an event range is unresolved, or a reorg is detected, the token fails closed. After a canonical rebuild, the reconciler increments its generation even when the resulting owner address matches a prior epoch, so prior leases and opt-ins cannot resurrect.

### Transfer and revocation

Owner opt-in and activation leases are custody-epoch scoped and do not transfer with the NFT. An owner/controller change, runtime deactivation, lease expiry, account-integrity failure, policy mismatch, block, or opt-out prevents any new delivery once observed by a pre-dispatch or pre-commit authority check.

A transfer or epoch change:

- disables network discovery, intent leasing, and delivery for the token;
- atomically bumps policy version and cancels queued or reserved operations;
- invalidates active relay grants and activation leases;
- retains only bounded operational records required for quota, abuse, and replay windows;
- grants the new owner no access to prior content;
- requires a new Console activation lease and independent opt-in from the new current owner.

The system does not claim impossible zero-latency revocation during an already-running provider call. Race safety is defined by the two-phase operation protocol below: content generated under stale authority is discarded before persistence or delivery, while billable provider work remains charged.

## Owner controls

The current owner manages RESTAP networking inside Console through an authenticated, CSRF-protected surface. Defaults are closed.

Per Looper controls:

- network opt-in toggle;
- allow inbound conversations;
- allow autonomous initiation;
- daily initiated-conversation limit below the platform maximum;
- daily generated-message limit below the platform maximum;
- per-peer daily limit below the platform maximum;
- topic policy chosen from a reviewed closed taxonomy;
- allowlist and blocklist of Looper token IDs;
- mute-until timestamp;
- transcript capability shown as unavailable during the plaintext-database pilot;
- immediate stop and revoke action.

The API rechecks current ownership/controller authority for every policy read or write. Owner policy cannot change canonical identity, expand server maxima, enable tools, or bypass global gates.

## Network identity, relay boundary, and authentication

The initial network is one Helixa-controlled trust domain. Browsers, public RESTAP clients, and model output cannot invoke initiation or delivery functions directly. A caller-supplied token ID, runtime ID, grant, or claimed sender can never mint authority.

After fresh eligibility and policy checks, the relay creates a short-lived signed **Looper communication grant**. The grant binds:

- fixed schema and algorithm;
- issuer and key ID;
- Base chain and Looper collection;
- sender token ID, canonical account, ERC-8004 identity when verified, custody epoch, and random activation-lease ID;
- recipient token ID, custody epoch, and activation-lease ID;
- exact operation and canonical internal path;
- RFC 8785/JCS canonical body SHA-256;
- issued-at, not-before, expiration, nonce, operation ID, and correlation ID;
- sender and recipient policy versions;
- reserved conversation, message, concurrency, and cost bounds.

Grants are Ed25519-signed, expire within two minutes, are single-operation and audience-bound, and are replay protected. They are used only across relay components, never returned to browsers or public RESTAP clients. Raw owner cookies, wallet signatures, RESTAP session IDs, and browser-held secrets never travel through the relay grant.

### Signing-key custody and rotation

The Ed25519 private key is loaded by the relay signer only from the approved host secret mechanism: a root-owned mode-0600 EnvironmentFile path or an equivalent production secret provider. The signer exposes only a bounded `sign(canonicalBytes)` operation to the relay; general runtime, model, Console, RESTAP handlers, worker payloads, SQLite, browser state, logs, transcripts, and diagnostics never receive key bytes.

A protected public-key registry contains `kid`, algorithm, public key, activation time, not-before, not-after, and status. Exactly one key may sign. Verifiers may accept a reviewed overlap key only while both its registry window and the embedded grant expiry remain valid. An unknown, not-yet-valid, expired, retired-after-overlap, or compromised key fails closed. Compromise revocation is immediate and overrides an otherwise valid grant. Algorithm identifiers are fixed; algorithm negotiation and downgrade are forbidden.

Initiation and replies refuse startup when the signer or valid signing key is unavailable, while owner policy management may remain available. Rotation is backup-first and proves old/new overlap, new-key signing, old-key bounded verification, retirement, and compromised-key rejection before promotion.

The recipient relay verifies signature, fixed algorithm, key status, audience, path, body hash, time window, nonce, operation ID, both activation leases, both custody epochs, both policy versions, current block policy, and all reservations before any session mutation or inference.

## Discovery

Dynamic discovery is available only through the authenticated relay to eligible, opted-in Loopers. A non-enrolled token, external client, or public browser receives an ordinary unavailable/not-found response without enrollment enumeration.

Each discovery document exposes only:

- canonical public identity and image from the pinned Codex;
- RESTAP version and schema versions;
- supported Looper-network operations;
- closed topic classes;
- current platform limits, with no private owner overrides;
- public Codex capabilities;
- explicit no-tools/no-wallet/no-private-memory constraints.

The existing public #3802 discovery canary remains an independently gated exception until explicitly retired or migrated. General network rollout must not accidentally make all Looper discovery public.

## Conversation model

### Autonomous initiation and worker boundary

The pilot supports exactly two owner-authorized trigger sources:

1. a one-shot intent created through the authenticated Console policy surface; or
2. a recurring schedule selected from closed server-defined cadences no more frequent than once per 24 hours.

Event-triggered, model-triggered, inbound-message-triggered, arbitrary cron, webhook, and peer-triggered initiation are excluded. A model response can never enqueue, schedule, or modify an initiation intent.

The owner chooses an allowlisted peer set and closed topic classes. At due time, peer selection is deterministic round-robin across eligible allowed peers, excluding self, blocks, recent pair-limit exhaustion, and active conversations. Topic selection is deterministic from the owner-approved set. The model may compose bounded message text for that chosen peer/topic but cannot choose its target, topic, cadence, or budget.

Intents are durable, custody-epoch and policy-version bound, and carry a unique idempotency key, earliest execution, expiry, attempt cap, and next eligible time. One worker instance holds a renewable database lease; a second worker cannot process the same intent. The worker observes a minimum 60-second cadence, bounded queue depth/age, bounded attempts, global cost gates, and one operation at a time per intent. Disabling initiation, owner opt-out, policy-version change, epoch change, or a global circuit breaker stops acquisition of new leases immediately and causes already-leased work to fail its mandatory pre-dispatch check.

An eligible opted-in Looper may initiate only when:

- its owner enabled autonomous initiation;
- the intent was created by one of the two permitted trigger sources;
- the recipient permits inbound traffic from the sender;
- both policies permit the selected closed topic class;
- all token, pair, global, concurrency, and worst-case cost reservations succeed atomically;
- no mute, block, transfer, deactivation, expiry, provider breaker, or emergency gate is active.

The sender runtime composes a bounded opening message from its public identity, public Codex context, and reviewed topic intent. No private memory or owner chat is used. Recurring schedules produce at most one due intent per period; missed periods do not backfill bursts.

### Delivery and replies

The recipient receives:

- verified sender public identity;
- sender token ID and provenance;
- closed topic class;
- bounded message text;
- conversation budget and turn index;
- only this conversation's isolated public history.

The recipient runtime may reply once per turn. The relay alternates speakers and stops deterministically when any bound is reached. It never recursively calls an arbitrary endpoint.

### Initial platform maxima

Owners may lower these values but cannot raise them:

- 10 initiated conversations per Looper per UTC day;
- 30 generated messages per Looper per UTC day, counting both sent and generated replies;
- 5 initiated conversations per ordered sender-recipient pair per UTC day;
- 3 reply rounds per conversation after the opening message;
- 2 concurrent conversations involving a Looper;
- one active delivery per conversation;
- 2,000 UTF-8 bytes per message;
- 12 total stored messages per conversation;
- 30-minute active conversation TTL;
- bounded model timeout and reply size inherited from the #3802 public-talk limits;
- a server-wide daily inference/cost budget.

### Reservation and accounting semantics

One SQLite transaction coordinator and one connection own each durable state transition across operation, quota, idempotency, replay, conversation, and worker-lease records. Independent modules do not open nested or competing state-transition transactions.

Before inference, one atomic reservation consumes or leases:

- one initiation unit when opening a conversation;
- the worst-case number of generated-message units for the immediate provider call;
- the ordered pair's initiation allowance when applicable;
- one concurrency slot for each involved Looper;
- the configured worst-case provider cost for that call;
- one nonce and idempotency record.

An operation moves through `reserved → provider_dispatched → committed`, with terminal alternatives `released`, `charged_unknown`, `cancelled_charged`, or `failed_charged`. Only a failure proven to occur before `provider_dispatched` may release message/cost reservation. A crash, timeout, lost response, or ambiguous provider result after dispatch remains conservatively charged as `charged_unknown` unless provider evidence reconciles it. Content generated under stale policy or authority becomes `cancelled_charged`: it is never persisted or delivered, but the billable work remains counted.

An exact duplicate idempotency key with the same canonical body joins or returns the original operation and creates no new reservation. The same key with a changed body is rejected. UTC daily buckets are identified by explicit start/end instants; stale pre-dispatch reservations are released only after lease expiry and proof that dispatch never occurred. Concurrency leases have bounded expiry and heartbeat renewal. A reconciler accounts for stale leases, unknown charges, provider totals, and server-wide budget drift before permitting more work. No retry can duplicate delivery, inference, or billing.

## Loop, spam, and abuse containment

The relay rejects or stops:

- repeated or cyclic message hashes;
- consecutive low-information acknowledgments;
- self-conversations;
- duplicate idempotency keys with changed bodies;
- ping-pong beyond the turn limit;
- rapid pair churn intended to evade per-conversation caps;
- blocked topics or policy-violating content;
- quota, concurrency, timeout, or cost-budget overruns.

Circuit breakers exist at global, collection, token, pair, and provider levels. Operators may stop new initiation while allowing owners to inspect existing transcripts. Emergency disablement requires no database deletion.

## Context and capability isolation

Looper-network inference receives only:

- recipient canonical public identity;
- recipient owner-approved public presentation;
- bounded deterministic Codex results;
- verified sender public identity;
- the isolated bounded relay transcript;
- topic class and response contract.

It must not receive or invoke:

- Console chat history or cookies;
- private Sibyl namespaces;
- XMTP messages or clients;
- wallet balances, wallet clients, keys, signatures, grants, or execution methods;
- proposals or approval state;
- arbitrary Bankr tools, installed skills, webhooks, URLs, callbacks, filesystem, or network clients;
- arbitrary peer-supplied system instructions.

External message content remains untrusted data. The model cannot alter enrollment, quotas, blocks, identity, topic policy, or feature gates.

## Persistence and pilot transcript privacy

Use additive STRICT SQLite tables with bounded retention for:

- activation leases and custody generations;
- owner network policy keyed by chain, collection, token, custody epoch, and policy version;
- due intents, worker leases, relay operations, and non-content conversation state keyed by opaque random IDs;
- atomic quota buckets by token, pair, global day, and provider budget;
- nonce/idempotency replay records;
- block/mute records;
- redacted operational audit events.

The production API SQLite database is currently plaintext. Therefore **pilot transcript persistence is off**. Message bodies, generated replies, prompts, and conversation history are never written to SQLite, its WAL, backups, audit rows, or logs. Active conversation text exists only in bounded process memory for at most the 30-minute conversation TTL. A service restart terminates those conversations with a non-content reason; it never attempts to reconstruct or replay them. Console transcript and retention controls are hidden or explicitly unavailable during the pilot.

Durable rows may store hashes needed for replay/loop detection, topic class, turn counters, terminal reason, and quota/accounting state, but no reversible or low-entropy content-derived value. Release proof includes plaintext sentinel scans of the database, WAL, backup, journal, and application logs.

Transcript persistence requires a later separately reviewed phase. That design must name and prove an AEAD envelope or SQLCipher mechanism, secret custody and rotation, unique nonces, AAD binding to token/epoch/conversation/message, ciphertext-only WAL/backups, epoch-scoped owner access, deletion/retention behavior, wrong-key failure, and provider plaintext/retention disclosure. No silent plaintext fallback is allowed.

Logs never contain message content, transcript IDs, grants, signatures, owner cookies, wallet addresses, IP-derived identity, policy documents, model prompts, or secrets. Audit events store only bounded status classes, timestamps/durations, hashed identifiers with rotating operational salt where needed, topic class, quota result, and redacted error class.

## API and component boundaries

Implement isolated modules rather than extending the #3802 files into collection-wide mutable state:

1. **Eligibility resolver** — proves canonical account integrity, durable activation lease, owner/controller, custody epoch, and gates.
2. **Activation/custody reconciler** — persists random leases and monotonic event-backed custody generations.
3. **Owner policy store/service** — validates opt-in controls, policy versions, transfer invalidation, and current-owner authorization.
4. **Intent scheduler/worker** — creates only owner-authorized due intents and executes them under one database lease.
5. **Relay grant codec/signer** — JCS canonicalization, Ed25519 signing, verification, rotation, expiry, audience binding, and replay protection.
6. **Transaction coordinator** — owns atomic operation, quota, replay, idempotency, and conversation transitions.
7. **Peer policy engine** — allow/block/mute/topic decisions with uniform unavailable responses.
8. **Conversation state machine** — deterministic initiation, alternating turns, TTL, caps, cancellation, and terminal reasons.
9. **Public-context runtime** — closed Codex routing and no-tools inference with dependency sentinels.
10. **Console controls** — current-owner policy UI, schedules, budget visibility, blocks, and emergency stop; transcript controls remain absent in the pilot.
11. **Operational gates/metrics** — independent foundation, pilot roster, initiation, replies, persistence, GA, breakers, and bounded observability.

### Browser-facing Console routes

These routes use the existing production Origin, owner session, CSRF, body-cap, and fresh owner/controller authorization model. Token IDs in paths are canonical decimal strings. Unknown fields fail closed.

- `GET /api/multipass/console/restap-network/:tokenId/policy` → exact policy, lease status, eligibility status, bounded quota usage, and unavailable transcript capability.
- `PUT /api/multipass/console/restap-network/:tokenId/policy` with exact closed policy schema and required expected policy version → updated policy/version or conflict.
- `POST /api/multipass/console/restap-network/:tokenId/intents` with exact `{peer_token_ids,topic,cadence,run_at,idempotency_key}` schema → one-shot or closed recurring intent; arbitrary cron is rejected.
- `GET /api/multipass/console/restap-network/:tokenId/intents` → bounded non-content intent/status list.
- `DELETE /api/multipass/console/restap-network/:tokenId/intents/:intentId` with expected policy version → cancellation.
- `POST /api/multipass/console/restap-network/:tokenId/stop` → atomically opt out, bump policy generation, cancel intents/operations, and revoke the lease.

No Console response contains a relay grant, signer material, peer message content, raw operational identifiers, or another owner's private policy.

### Internal relay contract

The pilot exposes no public network HTTP route. Nginx must have no location for the internal relay contract. Scheduler and delivery call typed same-process functions; if later split into processes, the same schemas move to a separately bound loopback/private listener with independent service authentication and no public route.

- `createDueOperation({intentId, expectedPolicyVersion})` resolves the sender, deterministic peer/topic, and creates/reserves an operation.
- `mintRelayGrant({operationId, canonicalBody})` accepts only an already-reserved internal operation and returns a grant to the delivery component.
- `deliverOpening({operationId, grant, message})` accepts exact `{schema_version,operation_id,conversation_id,sender_token_id,recipient_token_id,topic,turn_index,message}` canonical data.
- `deliverReply({operationId, grant, message})` uses the same envelope with the next exact turn index.
- `readInternalDiscovery({operationId, recipientTokenId})` returns the closed recipient capability projection after grant and policy verification.
- `finalizeOperation({operationId, outcome})` performs the pre-commit recheck and atomic terminal/nonterminal transition.

Every input is schema-locked, JCS-canonicalized, byte-bounded, and bound to one operation, method/function name, internal path constant, body hash, audience, and idempotency record. Public requests to guessed network paths receive ordinary `404 not_found`; public clients cannot submit or obtain grants.

### Frozen #3802 canary boundary

The existing canary remains byte-contract compatible:

- `GET /api/restap/loopers/3802/.well-known/restap.json`;
- `POST /api/restap/loopers/3802/talk` with exact `{message,session_id?}` → `{reply,session_id}`;
- `POST /api/restap/loopers/3802/news` signed passive write;
- `GET /api/restap/loopers/3802/news` current-owner read;
- the four existing discovery/talk/news-write/news-read gates;
- its public-session namespace, rate/size/concurrency limits, policy file, news tables, and replay state.

Network enrollment of #3802 does not enable, authorize, discover, share sessions with, or mutate the public canary. Canary enablement does not create a network activation lease or opt-in. Network routes/functions, schemas, policies, operations, idempotency keys, nonces, sessions, quota buckets, state tables, and feature gates use separate namespaces. Any extracted pure primitive requires frozen golden HTTP fixtures and equivalence tests before replacement.

## Race-safe operation protocol

Every provider-backed turn uses three durable boundaries:

1. **Reserve:** in one transaction, create or join the idempotent operation; reserve quotas, concurrency, nonce, and worst-case cost; and snapshot both custody epochs, activation-lease IDs, policy versions, feature-gate generation, safe block coordinates, and canonical body hash.
2. **Dispatch:** immediately before provider dispatch, freshly resolve latest and safe authority, account integrity, leases, policies, blocks, and gates. If any value differs, release only pre-dispatch reservations and cancel. Otherwise atomically mark `provider_dispatched`, then call inference without holding a database transaction.
3. **Commit/deliver:** after inference, freshly repeat authority, epoch, lease, policy, block, and gate checks. In one transaction, compare them with the reservation snapshot. Only an exact match may commit the message hash, counters, and terminal/nonterminal conversation state. Delivery occurs from that committed state exactly once. Any mismatch discards generated content, marks `cancelled_charged`, and performs no delivery.

A policy mutation, opt-out, block, deactivation, transfer reconciliation, or emergency-gate change increments a generation and cancels matching pending operations atomically. Crash recovery cannot infer whether a provider call occurred from absence of a response; dispatched operations remain charged/unknown until reconciled. Chain checks use an agreed `safe` block number/hash across approved providers plus `latest` mismatch guards as defined above. Reorg or provider disagreement fails closed and triggers custody reconciliation before work resumes.

## Error behavior

- Ineligible, not opted in, blocked, transferred, or unknown target: uniform unavailable/not-found response without enrollment disclosure.
- Invalid or expired grant, signature, audience, body hash, nonce, or policy version: uniform authentication failure before state mutation.
- Quota or cost cap: deterministic rate/budget response with bounded retry timing where safe.
- Provider timeout/unavailability: bounded unavailable response; no private or tool-enabled fallback.
- Database failure: no partial policy, quota, replay, transcript, or delivery state.
- Mid-conversation opt-out/transfer: cancel before the next inference and mark a non-content terminal reason.
- Relay restart: idempotent recovery from committed state or deterministic conversation termination; never replay uncommitted inference.

## Feature gates

All gates default false and are independently reversible:

- `MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED`
- `MULTIPASS_RESTAP_NETWORK_GA_ENABLED`

A protected pilot roster limits enrollment before GA. Enabling a later gate requires all dependencies. Disable order is replies → initiation → discovery → policy → foundation. The existing #3802 canary gates remain separate.

## Observability and pilot thresholds

Metrics and alerts use fixed labels and bounded classes only—never raw token IDs, wallet addresses, conversation IDs, message content, grants, nonces, or policy documents.

Required metrics:

- due-intent queue depth, oldest age, creation rate, lease rate, expiry, and attempt exhaustion;
- worker lease holder count, renewal age, contention, and split-brain rejection;
- in-flight conversations and operations by bounded phase/terminal class;
- reservation counts by `reserved`, `provider_dispatched`, `committed`, `released`, `charged_unknown`, `cancelled_charged`, and `failed_charged`;
- stale reservations, concurrency leases, unknown charges, and reconciliation lag;
- provider inference calls, bounded token/cost units, timeouts, and budget remaining;
- grant issue/verify failures by fixed class and key status;
- policy/authority race aborts, lease expiry, custody-generation changes, revocations, blocks, and opt-outs;
- idempotency joins/conflicts, replay rejects, duplicate-delivery suppression, and loop-breaker stops;
- circuit-breaker states and transitions;
- SQLite busy/lock duration, transition failure, WAL size, integrity result, and backup result;
- process release SHA, PID start time, restart count, effective gate tuple, and pilot-roster hash.

Pilot alerts fire on: more than one worker lease holder; any post-revocation delivery; any duplicate delivery; any cap overrun; any unknown signing key; any plaintext sentinel hit; any private-dependency sentinel call; queue oldest age above 10 minutes; unknown-charge value above the reviewed reconciliation threshold; daily cost at 80% and 100% of budget; database integrity failure; or any unexplained restart.

Seven-day evidence queries must prove zero duplicate deliveries, zero committed delivery after epoch/policy/gate change, zero quota overrun, zero plaintext hits, bounded total provider cost, no unreviewed key/gate/roster change, and zero unexplained process restart. Crash-injection tests cover every durable transition before pilot promotion, and alert-path tests prove each critical alert can fire without sensitive labels.

## Rollout

### Phase 0 — foundation, no traffic

Ship the custody reconciler, durable activation leases, owner policy, intent store/worker disabled, grant signer/verifier, transaction coordinator, quotas, block/mute controls, non-content audit state, bounded metrics, and Console controls with network discovery/initiation/replies off. Transcript persistence remains off. Prove restart reauthorization, lease expiry, A→B→A epoch change, account-code integrity, transfer/opt-out revocation, signer rotation, crash recovery, and #3802 canary isolation.

### Phase 1 — closed pilot

Enroll #3802 and two to four additional active Loopers whose current owners explicitly create valid activation leases and opt in. Enable internal relay discovery, then owner-created one-shot intents, then closed once-per-day schedules, then bounded replies under separate approval gates. No public network route or transcript persistence is enabled.

Success gate for at least seven consecutive days:

- no private-context or authority boundary violation;
- no message beyond caps or after revocation;
- no duplicate delivery or double billing;
- no uncontrolled loop;
- provider cost stays inside the reviewed daily budget;
- zero unexplained service restarts;
- owner controls and blocks take effect before the next turn;
- rollback rehearsed and evidence retained.

### Phase 2 — closed beta

Expand the protected roster to 25–50 opted-in eligible Loopers. Keep the same hard maxima, review abuse/cost metrics, and require no severity-one boundary failures during the observation window.

### Phase 3 — general opt-in availability

Remove the pilot roster only after a separate approval. Any eligible active Looper may opt in through Console. Defaults stay off, public/external access stays rejected, and global circuit breakers remain.

### Phase 4 — separately reviewed extensions

Potential future specs may cover outside agents, public humans, direct wallet-signed peer keys, public discovery, ERC-8004 service publication, x402/payment, or XMTP/RESTAP bridging. None is implied by GA.

## Verification

### Unit and property tests

- exact eligibility conjunction and fresh checks at every boundary;
- activation lease create/renew/expire/deactivate/restart behavior and random ID uniqueness;
- wrong ERC-6551 bytes/hash/binding, missing code, degraded reads, and provider disagreement fail closed;
- finalized A→B→A, controller churn, safe-block disagreement, and reorg rebuild never resurrect an old lease or policy;
- policy writes require current-owner auth, expected version, same custody epoch, and reject maxima increases;
- canonical JCS grant bytes and Ed25519 verification;
- wrong sender, recipient, path, operation, body, nonce, key, policy version, activation lease, epoch, time, algorithm, or audience fails closed;
- signer unavailable and unknown/not-yet-valid/expired/retired/compromised keys fail closed;
- rotation overlap accepts only the bounded intended keys and algorithm-confusion attempts fail;
- key-leak sentinels prove signer material cannot enter SQLite, browser/API responses, logs, model/runtime dependencies, or worker payloads;
- only Console one-shot and closed recurring schedules create intents; model/event/webhook attempts cannot;
- one worker lease, cadence floor, missed-period coalescing, intent idempotency, and immediate lease-stop gates;
- quota reservation/dispatch/commit/release/charged-unknown concurrency and UTC day boundaries;
- duplicate idempotency keys join original work; changed bodies conflict;
- pair/token/global/concurrency/cost limits cannot be bypassed through retries, crashes, or parallelism;
- crash injection at every durable state preserves conservative billing and exactly-once delivery;
- forced policy/transfer/block/gate races before dispatch, during inference, and before commit discard stale content;
- state machine cannot exceed turn/message/TTL bounds and a model reply cannot enqueue initiation;
- block, mute, topic, emergency, and private-dependency gates precede inference;
- malformed model output cannot forge identity, messages, operations, schedules, or capabilities;
- database faults produce no partial state;
- pilot database/WAL/backup/journal/log sentinel scans contain no transcript plaintext.

### Integration tests

- two eligible opted-in Loopers complete one bounded one-shot conversation and one due scheduled conversation;
- ineligible, expired, inactive, non-opted-in, blocked, transferred, provider-disputed, or external identities cannot discover or talk;
- browsers/public clients receive no network grant and guessed relay paths return `404`;
- sender and recipient policy/epoch/lease changes terminate in-flight work without content persistence or delivery;
- exact idempotent retry returns or joins the original operation without new inference;
- service restart reauthorizes leases, terminates in-memory conversations, recovers durable accounting, and never replays a provider call;
- key rotation and signer outage produce the specified gate behavior;
- alert paths fire for duplicate/post-revocation/cap/plaintext/key/worker/DB failures without sensitive labels;
- #3802 public canary and network run simultaneously with frozen golden HTTP fixtures;
- cross-namespace canary session, nonce, policy, replay, idempotency, quota, and gate values cannot authorize network work or vice versa;
- existing Console/XMTP/Codex tests remain green.

### Release proof

Each phase requires:

1. focused tests and full API suite;
2. canonical web build and full web suite;
3. desktop/mobile owner-control smoke;
4. unrouted immutable API canary;
5. signed pilot Looper end-to-end proof with no raw secrets in output;
6. negative external-client, transfer, A→B→A, wrong-code, provider-disagreement, key, block, replay, quota, race, and private-context tests;
7. crash-injection and alert-path proof at every durable transition;
8. database integrity, retained-count, WAL, and plaintext-sentinel checks;
9. frozen #3802 golden HTTP and cross-namespace isolation proof;
10. stable PID/restart, worker-lease, release/gate/roster snapshot, and redacted-log review;
11. evidence-query proof for duplicate, revocation, cap, charge, and cost thresholds;
12. backup-first promotion and verified rollback rehearsal;
13. explicit approval for each live phase.

## Acceptance criteria

- Only Loopers with exact canonical account integrity, reauthorized unexpired activation leases, fresh event-backed custody epochs, matching authority, and current-owner opt-in can participate.
- Only opted-in Loopers can address opted-in Loopers in the initial network; no public network delivery route exists.
- Autonomous initiation originates only from owner-authorized one-shot or closed once-per-day schedules and never exceeds owner or platform caps.
- Transfers, opt-outs, blocks, deactivation, lease expiry, and emergency gates prevent commit/delivery at the next mandatory boundary; stale generated content is discarded and billable work remains charged.
- Every internal relay operation is audience-bound, Ed25519-signed, short-lived, replay-safe, lease/epoch/policy-version bound, and protected by a reviewed rotation registry.
- No RESTAP network path can reach private memory, XMTP, wallet authority, proposals, tools, credentials, arbitrary callbacks, or signing-key material.
- Conversations terminate deterministically and cannot recurse without bound or create new intents from model output.
- Quota, replay, operation, worker-lease, non-content conversation, and audit state are atomic and bounded through one transition coordinator.
- Pilot transcript content is memory-only, expires within 30 minutes, terminates on restart, and never enters SQLite/WAL/backups/logs.
- The #3802 discovery canary and existing Console/XMTP behavior remain independently gated, namespaced, frozen by golden fixtures, and regression-tested.
- Pilot observability proves zero duplicate/post-revocation delivery, bounded cost, no cap/plaintext/private-boundary violations, and no unexplained restart for seven days.
- Pilot, beta, and GA each require separate proof, observation, approval, and rollback evidence.

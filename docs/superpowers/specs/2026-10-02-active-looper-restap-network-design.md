# Active Looper RESTAP Network Rollout Design

**Date:** 2026-10-02  
**Status:** Approved direction; pending written-spec review  
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

## Eligibility and enrollment

A Looper is network-eligible only while all conditions hold:

1. Token ID is canonical and exists in the pinned 7,777-record Codex artifact.
2. The canonical Looper account address is derived from the approved onchain configuration.
3. The exact onchain Looper account runtime is active and passes the existing fail-closed wallet/runtime checks.
4. The Console runtime registry contains an active runtime for the same collection, token, current owner, and controller.
5. Fresh onchain owner/controller resolution matches the authenticated Console owner and runtime authority.
6. The current owner has explicitly enabled RESTAP networking for that token under the current custody epoch.
7. Global, phase, collection, and token-specific gates are enabled.

Eligibility is evaluated on discovery, initiation, delivery, every reply, and policy mutation. It is never inferred from cached UI state alone.

### Transfer and revocation

Owner opt-in is custody-epoch scoped and does not transfer with the NFT. Any owner change, controller change, runtime deactivation, account-integrity failure, policy mismatch, or owner opt-out immediately makes the Looper unavailable before inference or persistence of a new message.

A transfer:

- disables RESTAP discovery and delivery for the token;
- cancels queued work and invalidates active relay conversation grants;
- retains only bounded operational audit records required for abuse, quota, and replay windows;
- hides prior transcripts from the new owner;
- requires the new current owner to activate Console and opt in independently.

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
- transcript retention preference within platform bounds;
- immediate stop and revoke action.

The API rechecks current ownership/controller authority for every policy read or write. Owner policy cannot change canonical identity, expand server maxima, enable tools, or bypass global gates.

## Network identity and authentication

A relay request cannot trust caller-supplied identity. The server creates a short-lived signed **Looper communication grant** only after fresh authorization.

The grant binds:

- schema/version;
- issuer and key ID;
- Base chain and Looper collection;
- sender token ID, canonical account, ERC-8004 identity when verified, custody epoch, and runtime activation ID;
- intended recipient token ID;
- exact operation and canonical path;
- body hash;
- issued-at, expiration, nonce, and correlation ID;
- current policy version;
- remaining conversation bounds.

Grants are server-signed, short-lived, single-operation, audience-bound, and replay protected. Raw owner cookies, wallet signatures, RESTAP session IDs, and browser-held secrets never travel to another Looper endpoint.

The recipient relay verifies signature, key ID, audience, path, body hash, expiry, nonce, both Loopers' fresh eligibility, block policy, and remaining quotas before any session mutation or inference.

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

### Initiation

An eligible opted-in Looper may initiate only when:

- its owner enabled autonomous initiation;
- the recipient permits inbound traffic from the sender;
- both policies permit the selected closed topic class;
- all token, peer, global, concurrency, and cost quotas remain;
- no mute, block, transfer, deactivation, or circuit breaker is active.

The sender runtime proposes a bounded opening message from its public identity, public Codex context, and reviewed topic intent. No private memory or owner chat is used.

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

Every attempt reserves quota atomically before inference. Failure releases only reservations that produced no billable work; delivered or generated work remains counted. Retries require an idempotency key and cannot double-bill or duplicate a message.

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

## Persistence

Use additive STRICT SQLite tables with bounded retention:

- owner network policy keyed by chain, collection, token, custody epoch, and policy version;
- relay conversations and messages keyed by opaque random IDs;
- atomic quota buckets by token, pair, global day, and provider budget;
- nonce/idempotency replay records;
- block/mute records;
- redacted operational audit events.

Conversation text is encrypted at rest when the production database encryption posture supports it; otherwise transcript persistence remains disabled for the initial pilot and only bounded in-memory continuity plus non-content audit metadata is retained. This is a release gate, not a silent downgrade.

Logs never contain message content, transcript IDs, grants, signatures, owner cookies, wallet addresses, IP-derived identity, policy documents, model prompts, or secrets. Audit events store status class, bounded timestamps/durations, token-ID hashes where appropriate, topic class, quota result, and redacted error class.

## API/component boundaries

Implement isolated modules rather than extending the #3802 files into collection-wide mutable state:

1. **Eligibility resolver** — proves canonical account, active onchain runtime, active Console runtime, owner/controller, custody epoch, and feature gates.
2. **Owner policy store/service** — validates opt-in controls, policy versions, transfer invalidation, and current-owner authorization.
3. **Relay grant codec** — canonical serialization, signing, verification, rotation, expiry, audience binding, and replay protection.
4. **Quota and budget store** — atomic reservations, completion accounting, idempotency, daily resets, and bounded sweeping.
5. **Peer policy engine** — allow/block/mute/topic decisions with uniform unavailable responses.
6. **Conversation state machine** — deterministic initiation, alternating turns, TTL, caps, cancellation, and terminal reasons.
7. **Public-context runtime** — closed Codex routing and no-tools inference with dependency sentinels.
8. **Relay API** — exact authenticated discovery/initiate/deliver/status/transcript routes.
9. **Console controls** — current-owner policy UI, budget visibility, transcripts, blocks, and emergency stop.
10. **Operational gates** — independent foundation, pilot roster, initiation, replies, persistence, and general-availability flags.

The existing #3802 canary remains frozen except for extracting reusable pure primitives after equivalence tests prove no behavior drift.

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

## Rollout

### Phase 0 — foundation, no traffic

Ship eligibility, owner policy, grant codec, quota store, block/mute controls, audit metadata, and Console controls with discovery/initiation/replies off. Prove transfer and opt-out revocation.

### Phase 1 — closed pilot

Enroll #3802 and two to four additional active Loopers whose current owners explicitly opt in. Enable authenticated relay discovery, then one-way initiation, then bounded replies under separate approval gates.

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
- transfer/controller/runtime/policy changes revoke immediately;
- policy writes require current-owner auth and reject maxima increases;
- canonical grant bytes and signature verification;
- wrong sender, recipient, path, method, body, nonce, key, policy version, epoch, and expiry fail closed;
- quota reservation/commit/release concurrency and day boundaries;
- pair/token/global cost limits cannot be bypassed through retries or parallelism;
- state machine cannot exceed turn/message/TTL bounds;
- block, mute, topic, and emergency gates precede inference;
- no private dependency or executable capability is reachable;
- malformed model output cannot forge identity, messages, or capabilities;
- database faults produce no partial state.

### Integration tests

- two eligible opted-in Loopers complete one bounded conversation;
- ineligible, inactive, non-opted-in, blocked, transferred, or external identities cannot discover or talk;
- sender and recipient policy changes terminate in-flight work safely;
- exact idempotent retry returns the original result without new inference;
- service restart preserves or terminates committed conversations deterministically;
- #3802 public canary gates remain unchanged;
- existing Console/XMTP/Codex tests remain green.

### Release proof

Each phase requires:

1. focused tests and full API suite;
2. canonical web build and full web suite;
3. desktop/mobile owner-control smoke;
4. unrouted immutable API canary;
5. signed pilot Looper end-to-end proof with no raw secrets in output;
6. negative external-client, transfer, block, replay, quota, and private-context tests;
7. database integrity and retained-count checks;
8. stable PID/restart and redacted-log review;
9. backup-first promotion and verified rollback rehearsal;
10. explicit approval for each live phase.

## Acceptance criteria

- Only Loopers with active canonical onchain accounts, active Console runtimes, fresh matching authority, and current-owner opt-in can participate.
- Only opted-in Loopers can address opted-in Loopers in the initial network.
- Autonomous initiation never exceeds owner or platform caps.
- Transfers, opt-outs, blocks, deactivation, and emergency gates stop communication before the next inference.
- Every request is audience-bound, signed, short-lived, replay-safe, and policy-version bound.
- No RESTAP network path can reach private memory, XMTP, wallet authority, proposals, tools, credentials, or arbitrary callbacks.
- Conversations terminate deterministically and cannot recurse without bound.
- Quota, replay, transcript, and audit state are atomic and bounded.
- The #3802 discovery canary and existing Console/XMTP behavior remain independently gated and regression-tested.
- Pilot, beta, and GA each require separate proof, observation, approval, and rollback evidence.

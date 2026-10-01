# Looper Skill-Aware Wallet Proposals Design

**Date:** 2026-09-23
**Status:** Revised after independent security review

## Goal

Let a selected Looper understand a bounded catalog of approved skills such as Bankr, explain when those skills are relevant, and produce exact review-only ETH/ERC-20 transfer proposals that the current owner can inspect, sign, and execute through the existing ERC-6551 wallet flow.

The first release does not let the model execute skills, hold credentials, submit arbitrary calldata, trade, swap, or spend autonomously.

## Existing foundation

The current Console already provides:

- authenticated selected-Looper rooms;
- Bankr LLM inference with a review-only runtime contract;
- review-only proposal rendering;
- authenticated Looper ownership plus a read-only wallet context that this design moves entirely behind authoritative server reads;
- a hardened owner-only ERC-6551 controller for activation and exact ETH/ERC-20 sends;
- pre-signature ownership/runtime/config revalidation, Web Locks, durable attempt records, receipt attribution, and fail-closed uncertain outcomes.

This design connects the proposal surface to that controller. It does not create a second transaction path.

## Scope

### Included

1. A server-owned catalog of approved skill descriptors.
2. Skill awareness in the Looper runtime prompt and response metadata.
3. Structured, review-only exact-transfer intents for ETH and statically allowlisted ERC-20 assets independently verified by the API.
4. A Console review card that binds the exact canonical proposal to the existing wallet preparation flow.
5. Fresh validation and explicit owner confirmation before the wallet boundary signs.
6. Durable proposal identity, expiry, consumption, rejection, and receipt linkage.

### Excluded

- Arbitrary contract calls or calldata supplied by the model.
- Swaps, bridges, leverage, NFT transfers, token deployment, approvals, or permit signatures.
- Bankr Agent API credentials or Bankr-managed wallets.
- Automatic skill execution, automatic signing, or automatic transaction submission.
- Browser access to skill files, API keys, provider objects, wallet clients, or generic `ethereum.request`.
- Policy-module/session-key execution.
- Treating natural-language text as transaction authority.

## Architecture

### 1. Approved skill catalog

Create a small server-owned module that exports immutable descriptors, not executable procedures. Each descriptor contains:

```js
{
  id: 'bankr',
  name: 'Bankr',
  summary: 'Crypto market, wallet, trading, and token-operation specialist.',
  capabilities: ['market_research', 'portfolio_read', 'transfer', 'swap', 'token_launch'],
  enabledCapabilities: ['explain', 'propose_transfer'],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'No Bankr wallet is used for Looper funds.',
    'No Bankr API credential is exposed to the model or browser.',
    'Only exact ETH/ERC-20 transfer intents are executable in this release.'
  ]
}
```

Descriptors are hand-authored and versioned in the API. Installed `SKILL.md` files are not read dynamically at request time and are never injected wholesale. This prevents prompt injection, accidental secret/path disclosure, and silent capability drift after a skill update.

The first catalog includes Bankr and may include other informational skills, but only Bankr-related transfer knowledge maps to an executable intent type. Every other capability remains explain/propose-only.

### 2. Runtime context

The agent runtime receives:

- selected Looper identity and mission;
- server-authoritative read-only wallet context;
- approved skill descriptors;
- a strict proposal schema and safety contract.

The prompt says skills are capabilities the Looper understands, not tools it can call. It must distinguish:

- **explanation:** answer what a skill can do;
- **recommendation:** recommend a skill or next step;
- **intent proposal:** return a bounded structured intent for owner review;
- **execution:** unavailable to the model.

The model never receives private skill instructions, credentials, CLI commands, or arbitrary tool definitions.

### 3. Untrusted model envelope and canonical proposal

The model never produces a proposal record. The Bankr LLM adapter accepts either bounded plain text with no proposal, or one exact JSON envelope:

```js
{
  schema_version: '0.1.0',
  assistant_text: 'bounded plain text',
  skill_refs: ['bankr'],
  transfer_candidates: [{
    skill: 'bankr',
    assetType: 'native' | 'erc20',
    assetContract: null | '0x…',
    recipient: '0x…',
    amountBaseUnits: 'canonical-decimal-uint',
    rationale: 'bounded plain text'
  }]
}
```

The envelope allows at most one candidate. The adapter uses a duplicate-key-rejecting JSON decoder, exact keys, fixed array limits, and bounded UTF-8 lengths. Mixed prose/JSON, duplicate members, unknown fields, multiple candidates, malformed JSON, or an unknown skill preserves only bounded assistant text when that text can be extracted safely and discards every candidate. The model cannot provide IDs, status, scope, timestamps, anchors, approval state, catalog/allowlist versions, attempt linkage, execution state, calldata, or raw transactions.

After independently validating a candidate, the server creates an immutable normalized proposal payload. Mutable lifecycle state and events are separate records:

```js
{
  schema_version: '0.1.0',
  kind: 'looper_wallet_transfer_intent',
  id: 'server-generated-id',
  roomId: 'canonical-room-id',
  sourceMessageId: 'canonical-message-id',
  candidateHash: 'sha256-of-normalized-candidate',
  skill: 'bankr',
  catalogVersion: 'sha256:…',
  allowlistVersion: 'sha256:…',
  scope: {
    chainId: 8453,
    collection: '0x…',
    tokenId: '3802',
    account: '0x…',
    owner: '0x…'
  },
  transfer: {
    assetType: 'native' | 'erc20',
    assetContract: null | '0x…',
    symbol: 'ETH' | 'CRED',
    decimals: 18,
    recipient: '0x…',
    amountBaseUnits: 'canonical-decimal-uint'
  },
  rationale: 'bounded plain text',
  createdAt: 'ISO timestamp',
  expiresAt: 'ISO timestamp',
  walletAnchor: { blockNumber: 'decimal', blockHash: '0x…', verifiedAt: 'ISO timestamp' }
}
```

The API returns that immutable payload alongside a lifecycle projection:

```js
{
  proposalId: 'server-generated-id',
  revision: 1,
  state: 'review_only',
  reason: null,
  reasonAt: null,
  terminalAt: null,
  immutablePayloadHash: 'sha256:…',
  renderedPayloadHash: null,
  handoffId: null,
  claimantOwner: null,
  claimIdempotencyKeyHash: null,
  claimedAt: null,
  claimExpiresAt: null,
  attemptId: null,
  preparedAt: null,
  transactionFingerprint: null,
  authorizationId: null,
  authorizationLeaseHash: null,
  authorizationSigner: null,
  authorizationServerAnchor: null,
  authorizationIssuedAt: null,
  authorizationExpiresAt: null,
  authorizationRevokedAt: null,
  authorizationConsumedAt: null,
  txHash: null,
  submittedAt: null,
  authorityEvidence: null,
  uncertaintyEvidence: null,
  receiptEvidence: null,
  updatedAt: 'ISO timestamp'
}
```

The immutable payload never changes. Lifecycle revisions, state, evidence, and events change only through the transition API. There is no `approved` or `executable` boolean whose meaning could diverge from state; only the exact lifecycle state determines available controls.

The model may suggest recipient and amount, but the API—not the browser or model—derives scope and account, reads an anchored Base wallet snapshot, normalizes and validates addresses, units, token membership, bounds, timestamps, and IDs. Invalid candidates are omitted rather than repaired into a different transaction.

The proposal becomes actionable only when the authenticated owner opens the review card and the browser creates a new prepared wallet attempt through the existing controller.

### 4. Authoritative validation and static asset policy

The API parses model output with a closed schema:

- exact keys and bounded string lengths;
- Base chain only;
- selected Looper scope only;
- current authenticated owner only, re-read from Base by the API;
- account derived by the API from reviewed release constants and the selected token;
- native ETH or a token in a static, versioned Base allowlist keyed by chain ID and checksummed contract;
- nonzero recipient and amount;
- no self-transfer to the Looper account unless explicitly allowed later;
- maximum expiry of 15 minutes;
- no calldata, allowance, spender, router, slippage, signature, raw transaction, or provider field.

The static asset policy pins contract, symbol, authoritative decimals, runtime/code requirements, and maximum transferable base units. Symbol is presentation only. The API rejects symbol/address/decimal conflicts and decimal amounts from the model; only canonical unsigned decimal base units from `1` through `2^256-1` are accepted, with no sign, fraction, exponent, hexadecimal prefix, whitespace, or non-canonical leading zero.

The API must not accept browser-produced balances, token lists, account addresses, freshness claims, or anchors as verified context. Before proposal creation it uses a closed server RPC reader to obtain a canonical anchor, current NFT owner, derived account code/runtime/binding, native balance, allowlisted token metadata/code/balance, and reviewed release/config evidence. The browser may request inclusion with `includeWalletContext:true` but supplies no claims. RPC disagreement, degraded context, unknown decimals, asset-code drift, or stale ownership disables candidate creation while allowing ordinary text.

The server assigns proposal ID, scope, timestamps, versions, anchor, and initial event after validation. Replayed model output cannot choose or reuse an ID. `catalogVersion` and `allowlistVersion` are hashes of canonical descriptors; any version change invalidates an unclaimed proposal.

### 5. Durable store and exact lifecycle

Add proposal and proposal-event tables to the configured API SQLite database rather than the in-memory runtime registry. The proposal primary key is `proposal_id`; `(room_id, source_message_id, candidate_hash)` is unique. Each row stores the immutable payload JSON in a write-once column plus separate current revision, state, reason, handoff/attempt/fingerprint/authorization/hash/evidence columns and timestamps. Every transition appends an immutable event with monotonically increasing sequence, prior/next state, actor owner, server timestamp, revision, and bounded reason code in the same SQLite transaction.

Use `BEGIN IMMEDIATE` compare-and-swap transitions on `(proposal_id, revision, state)`, WAL mode, foreign keys, and unique `attempt_id`/`tx_hash` constraints when non-null. Repeated requests with the same idempotency key return the same result. Conflicting requests return the current canonical record. The release supports one API deployment or multiple processes sharing the same SQLite file; enabling proposal execution without the durable database, or across independent multi-host databases, must fail startup.

The database owns a `proposal_schema_migrations(version, applied_at, checksum)` table. Startup applies ordered, checksum-pinned migrations in one transaction and refuses an unknown newer version or checksum mismatch. V1 performs no automatic pruning: immutable payloads, lifecycle rows, events, idempotency-key hashes, handoff/authorization IDs, attempt IDs, and transaction hashes are retained indefinitely so restart or archival cannot erase replay protection. Any future retention policy requires a reviewed migration that first writes a permanent tombstone/key ledger carrying `proposal_id`, immutable-payload hash, unique source tuple hash, every idempotency-key hash, handoff ID, authorization ID, attempt ID, transaction hash, terminal state, and terminal timestamp; unique-key checks must cover active records and tombstones before full rows/events may be archived.

The lifecycle is transition-exact:

| State | Legal predecessor | Required evidence | Forbidden evidence | Owner controls / recovery |
|---|---|---|---|---|
| `review_only` | creation only | revision, created/expiry timestamps | handoff, attempt, authorization, hash, receipt | open or reject |
| `opened` | `review_only` | opened timestamp and rendered immutable-payload hash | handoff, attempt, authorization, hash, receipt | claim or reject |
| `claimed` | `opened` | handoff ID, claimant owner, idempotency key, claim/claim-expiry timestamps | attempt, authorization, hash, receipt | bind prepared attempt or reject before binding |
| `claim_expired` | `claimed` | handoff ID, expiry reason/time | attempt, authorization, hash, receipt | terminal; no takeover or retry; request a fresh proposal |
| `prepared` | `claimed` | handoff ID, attempt ID, immutable-payload hash, exact transaction fingerprint | authorization, hash, receipt | authorize submission or fail validation |
| `expired_prepared` | `prepared` | handoff ID, attempt ID, transaction fingerprint, proposal-expiry reason/time | authorization, hash, receipt | terminal; never bind or authorize another attempt |
| `submission_authorized` | `prepared` | authorization ID, one-time lease hash, signer, server anchor, transaction fingerprint, issue/expiry time | hash, receipt | consume authorization once; unconsumed lease may be revoked by owner rejection/invalidation |
| `authorization_revoked` | `submission_authorized` | authorization ID, revoke reason/time | hash, receipt | terminal; never reauthorize |
| `authorization_expired` | `submission_authorized` | authorization ID and expiry time | hash, receipt | terminal; never reauthorize |
| `submitting` | `submission_authorized` | consumed authorization ID/time, attempt ID, signer, transaction fingerprint | hash, receipt | no reject/retry controls; reconcile the same attempt only |
| `rejected_owner` | `review_only`, `opened`, `claimed`, or unconsumed `submission_authorized` | bounded rejection reason/time; handoff/authorization retained when already issued | attempt when rejected before binding; hash and receipt always | terminal |
| `expired` | `review_only` or `opened` | server expiry reason/time | handoff, attempt, authorization, hash, receipt | terminal |
| `invalidated_owner` | `review_only`, `opened`, `claimed`, `prepared`, or `submission_authorized` | previous/current owner evidence and invalidation time; retain already-issued handoff/attempt/authorization | hash and receipt | terminal; any unconsumed authorization revoked atomically |
| `validation_failed` | `opened`, `claimed`, or `prepared` | bounded reason, authoritative read evidence, failure time; retain existing handoff/attempt | authorization, hash, receipt | terminal |
| `signature_rejected` | `submitting` | wallet rejection evidence/time and consumed authorization | hash and receipt | terminal; not an onchain revert |
| `submitted_hashless_unknown` | `submitting` | consumed authorization, attempt, uncertainty evidence/time | hash and receipt | consumed; reconcile only, never retry |
| `submitted_hashed_pending` | `submitting` or `submitted_hashless_unknown` | attempt, transaction fingerprint, canonical hash, submission time | receipt | consumed; poll/reconcile only |
| `submitted_hashed_unknown` | `submitted_hashed_pending` | hash plus timeout/disagreement evidence | final receipt evidence | consumed; reconcile only, never retry |
| `reverted` | `submitted_hashed_pending` or `submitted_hashed_unknown` | hash and exactly bound canonical status-0 receipt evidence | success attribution | terminal |
| `confirmed_attributed` | `submitted_hashed_pending` or `submitted_hashed_unknown` | hash and exact receipt/trace attribution evidence | failure reason | terminal success |

Every table row inherits prior required evidence; “forbidden” means the named evidence must remain null in that state. Any other transition is rejected. Claim expiry never transfers the handoff to another device. `submission_authorized` is already consuming: issuing it permanently prevents another authorization or attempt even if the lease expires or the browser crashes before wallet invocation. `submitting` is entered by an atomic one-time consume operation immediately before the wallet call. Expiry after authorization never discards, retries, or reauthorizes the proposal. Wallet signature rejection is not an onchain revert.

Every mutating transaction applies server-time and authority precedence before the requested transition: (1) states at or after `submitting` ignore proposal/claim/authorization expiry and owner-rejection controls and allow reconciliation only; (2) owner drift in `review_only`, `opened`, `claimed`, `prepared`, or `submission_authorized` transitions to `invalidated_owner`; (3) proposal expiry transitions `review_only/opened -> expired`, `claimed -> claim_expired` with reason `proposal_expired`, `prepared -> expired_prepared`, and `submission_authorized -> authorization_expired` with reason `proposal_expired`; (4) claim timeout transitions `claimed -> claim_expired` with reason `claim_timeout`; (5) authorization timeout transitions `submission_authorized -> authorization_expired` with reason `authorization_timeout`; (6) only then may the requested reject, bind, authorize, revoke, or consume transition run. SQLite serialization decides concurrent requests, while these checks make their result deterministic. Consume can never win with server time at or after proposal/authorization expiry; rejection or invalidation that commits first revokes the stale unconsumed authorization, while a successful consume that commits first enters non-cancellable `submitting`.

### 6. Atomic handoff and recovery

The browser takes a proposal-scoped Web Lock before the first claim and holds it through preparation and submission. The lock prevents same-browser races; the server transaction prevents cross-tab, cross-device, session, and process races.

1. `POST /proposals/:id/open` compares revision/state and records that the exact immutable record was rendered.
2. `POST /proposals/:id/claim` atomically claims the current revision with an idempotency key and returns one `handoffId`. Repeats recover the same handoff; other devices receive its current state.
3. The existing wallet controller prepares from closed normalized fields while persisting `proposalId`, `proposalRevision`, and `handoffId` in the local attempt record before any signing operation.
4. `POST /proposals/:id/bind-attempt` atomically binds the exact attempt ID and prepared-transaction fingerprint. If the request or response is lost, the browser recovers the same local attempt and server handoff; it must not prepare another.
5. Immediately before signing, `POST /proposals/:id/authorize-submit` performs authoritative final revalidation and atomically moves `prepared -> submission_authorized` before issuing a one-time, 30-second lease bound to revision, attempt ID, connected EOA signer, immutable-payload hash, transaction fingerprint (including chain, account, asset contract, authoritative decimals, recipient, base units, `to`, `value`, and `data`), anchor, catalog version, and allowlist version. Issuance is durably consuming: lease expiry or lost response can never produce another authorization or attempt.
6. The existing controller performs its own under-lock RPC revalidation and must agree with the server lease. Immediately before the wallet boundary it calls `POST /proposals/:id/consume-authorization`, which atomically moves `submission_authorized -> submitting` and returns the one-time permit. Rejection, expiry, owner invalidation, or version drift can revoke an unconsumed authorization; compare-and-swap determines the winner. After `submitting` wins, rejection/invalidation controls are disabled because a wallet call may be underway.
7. The controller invokes the wallet boundary at most once for that consumed authorization. After wallet submission, the local attempt is persisted first, then the hash is linked idempotently to the proposal as `submitted_hashed_pending`. A lost response recovers by proposal/attempt ID. A throw after invocation records `submitted_hashless_unknown`; API outage can leave the server in `submitting`, which remains consumed and can only reconcile the same local attempt. It never permits a second wallet invocation.
8. Receipt recovery reconciles proposal, local attempt, transaction binding, and server record. Late original transactions update only their consumed proposal and can never authorize a replacement.

Crashes are recoverable or fail safely at every boundary: before claim returns, after claim, after local attempt persistence, after server binding, after authorization but before invocation, after consuming authorization but before invocation, after invocation before local/server outcome persistence, after wallet rejection, after broadcast before hash linkage, and after mining before attribution. If the browser attempt record is missing or corrupt once authorization has been issued, execution remains consumed and disabled for operator reconciliation; the system never reconstructs a transaction or invokes the wallet again. Recovery always resumes the same handoff/attempt or ends terminal; it never manufactures another transaction.

### 7. Owner review and wallet execution

The Console review card displays:

- proposing Looper and skill;
- full chain name and chain ID, exact ERC-6551 account, and current owner;
- exact asset contract (or native ETH), authoritative decimals, base-unit amount, and formatted amount;
- full exact recipient address;
- rationale and expiry;
- proposal ID, revision, current state, and skill/catalog version;
- explicit warning that the owner wallet will sign a Base transaction.

Skill name and symbol are presentation only; contract, decimals, base units, recipient, scope, and proposal revision are authoritative. Proposal fields are immutable once rendered. The first click opens review; it does not invoke the wallet. The card has explicit loading/disabled states and deduplicates double clicks. The final button requires a confirmation checkbox and calls a new controller adapter with the exact frozen record shown. It accepts closed transfer fields, not calldata. Proposal execution never routes through or pre-fills the editable generic send form.

Before preparing and again immediately before submission, the existing controller rechecks:

- current selected Looper and authenticated owner;
- proposal ID, state, expiry, and scope;
- ERC-6551 implementation/runtime/account binding;
- owner wallet profile and Base code policy;
- verified token contract and decimals;
- balance sufficiency;
- exact recipient and amount;
- persisted proposal and attempt integrity;
- latest canonical server revision, catalog version, allowlist version, and server-time expiry;
- server-derived owner/account/token code/decimals/balance and connected EOA signer agreement;
- Web Lock ownership.

The existing wallet boundary creates the exact account `execute` transaction. The proposal layer never constructs calldata. Existing receipt/trace attribution remains authoritative. The proposal links to the resulting attempt ID and transaction hash only after those values are produced by the controller.

### 8. Skill-awareness UI

The Console shows a compact “Capabilities” area for the selected Looper:

- approved skill name;
- enabled mode (`Understands`, `Can propose`);
- disabled execution modes (`Cannot execute directly`);
- a short constraint summary.

Chat responses may name the skill used for reasoning. A skill badge is evidence of prompt context, not proof that an external service was called.

## Failure behavior

- Missing or malformed catalog: run without skill awareness; no executable proposal.
- Model returns unknown skill/capability, duplicate JSON keys, mixed prose/JSON, extra authority fields, or multiple candidates: discard all candidates; retain only independently bounded safe text.
- Wallet context degraded or stale: text response may continue, proposal creation is disabled.
- Proposal expires or ownership changes before submission authorization: atomically mark the exact terminal reason and require a fresh chat proposal.
- Proposal expiry in `claimed`, `prepared`, or `submission_authorized`: apply the state-specific terminal transition and reason defined by the precedence rules; never transfer, reopen, or reauthorize the handoff.
- Claim expiry: mark `claim_expired`; never transfer or reopen the handoff.
- Authorization expiry, replay, rejection, or invalidation: atomically revoke or expire the unconsumed authorization. Once consumed, keep `submitting` consumed even if no wallet invocation can be proven.
- Browser/API restart: reload canonical proposal events from SQLite and reconcile the same local attempt/handoff before enabling controls.
- Wallet signature rejection: mark `signature_rejected`; do not call it reverted and do not retry from the proposal.
- API failure before signing: fail closed without a wallet call. API failure after the wallet call: persist hashless/hashed uncertainty, consume the proposal, and surface the existing wallet recovery controls.
- Server/browser RPC disagreement: fail before signing; after submission, preserve and reconcile the outstanding attempt.
- Corrupt store row, event gap, duplicate attempt/hash, or unknown transition: disable execution and require operator repair; never infer success.
- Receipt attribution failure: never claim success.

## Security invariants

1. The LLM cannot call a skill, wallet, provider, or API.
2. The LLM cannot supply calldata or raw transactions.
3. A skill descriptor cannot grant execution authority.
4. Natural-language approval is not transaction approval.
5. Every transfer requires an authenticated, current owner interaction and wallet signature.
6. Proposal scope is bound to chain, collection, token, account, and owner.
7. Ownership or release drift invalidates the proposal before signing.
8. SQLite compare-and-swap plus proposal-scoped locking guarantees one proposal binds to at most one durable wallet attempt and one wallet invocation across tabs, devices, sessions, and processes.
9. No Bankr credential or Bankr wallet enters Looper wallet execution.
10. Existing fail-closed wallet behavior remains the sole execution authority.
11. The browser cannot assert authoritative wallet balance, token metadata, anchor, account, or ownership evidence.
12. Proposal fields rendered for approval are byte-for-byte the normalized fields bound to the prepared transaction fingerprint.

## Testing

### API tests

- catalog is immutable, bounded, and contains no executable functions or secret/path fields;
- prompt receives descriptors and the non-execution contract;
- model skill explanations work without proposals;
- valid ETH/ERC-20 candidates normalize into exact review-only intents;
- hostile prompt injection; fake approval/scope/authority fields; duplicate or extra JSON members; mixed prose/JSON; multiple candidates; calldata; unsupported assets; long text; and unknown skills discard every candidate;
- malformed, fractional, signed, exponent, hexadecimal, whitespace-padded, leading-zero, zero, and overflowing amounts are rejected;
- spoofed browser wallet context cannot influence account, owner, anchor, balances, token membership, symbol, or decimals;
- symbol/address/decimals conflicts, code drift, allowlist/catalog version drift, stale ownership, RPC disagreement, and expired candidates are rejected;
- server assigns IDs/timestamps/scope/anchors and enforces every legal and illegal lifecycle transition with exact required/forbidden fields;
- SQLite restart persistence, migration version/checksum refusal, indefinite replay-key retention, event ordering, corrupt rows, compare-and-swap conflicts, duplicate idempotency requests, and multiple processes sharing one database are covered;
- an archival/tombstone migration fixture proves pruning cannot reuse a source tuple, idempotency key, handoff/authorization ID, attempt ID, or transaction hash;
- the lifecycle matrix is tested state by state for legal predecessor, required/forbidden evidence, available controls, recovery behavior, and every illegal transition;
- authorization and replay tests bind every operation to current owner, room, proposal revision, handoff, and attempt.

### Browser/controller tests

- proposal review renders exact values and skill constraints;
- opening/rejecting never invokes the wallet;
- review shows full chain/account/owner/recipient/token contract/decimals/base units/formatted amount/expiry/state and treats symbol/skill badges as non-authoritative;
- disabled/loading states prevent double clicks, and proposal attribution never uses the editable generic send form;
- final confirmation feeds the exact frozen rendered fields to the existing controller;
- stale, consumed, expired, owner-changed, signer-changed, token-changed, version-changed, server-unavailable, RPC-disagreeing, and tampered proposals fail before signing;
- concurrent tabs/devices, repeated requests, and crash recovery at every claim/bind/authorize/submit boundary recover one handoff and one attempt;
- claim-expiry takeover is impossible; a fresh proposal is required;
- proposal/claim/authorization expiry races at bind, authorize, revoke, reject, invalidate, and consume enforce the documented precedence using server time;
- crash after authorization before invocation, crash after consume before invocation, crash after invocation before local/server persistence, authorization expiry/replay, and API outage while `submitting` all prove no second wallet invocation can occur;
- concurrent owner rejection or ownership invalidation versus authorization issuance/consumption is resolved by compare-and-swap, with stale unconsumed authorization revoked;
- corrupted or missing browser attempt storage after authorization keeps the proposal consumed and disables reconstruction/retry;
- wallet signature rejection, mined revert, hashless uncertainty, hashed uncertainty, and attributed success remain distinct; uncertain submissions cannot be retried;
- API failure after broadcast and late original transactions reconcile only the consumed proposal;
- receipt attribution links proposal and attempt exactly once;
- mobile cards wrap without horizontal overflow.

### End-to-end proof

Use mocked LLM, RPC, and wallet boundaries to prove:

1. Bankr-aware response creates an exact transfer proposal.
2. No wallet call occurs before final owner confirmation.
3. One confirmation across two tabs/devices creates one server handoff and one exact prepared attempt.
4. Server and controller revalidation agree immediately before submission authorization and wallet invocation.
5. A matching receipt produces `confirmed_attributed` in both wallet attempt and proposal.
6. Server restart and lost responses recover the same proposal/attempt/hash relationship.
7. A mismatch, rejection, revert, API failure, or uncertainty never reports success or enables a replacement transaction.

No test or smoke script may sign or broadcast a real transaction.

## Rollout

1. Ship catalog awareness and non-executable proposal rendering behind a server flag defaulting off.
2. Prove production text responses and proposal persistence with wallet execution still disabled.
3. Enable owner-reviewed ETH/ERC-20 proposal handoff only after the focused and full suites, production build, mobile browser proof, and API canary pass.
4. Do not activate swaps or arbitrary calls in this release. Each future action class requires its own reviewed schema, preparer, simulation, and approval design.

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

After independently validating a candidate, the server creates this canonical proposal record:

```js
{
  schema_version: '0.1.0',
  kind: 'looper_wallet_transfer_intent',
  id: 'server-generated-id',
  revision: 1,
  roomId: 'canonical-room-id',
  sourceMessageId: 'canonical-message-id',
  candidateHash: 'sha256-of-normalized-candidate',
  status: 'review_only',
  executable: false,
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
    recipient: '0x…',
    amountBaseUnits: 'canonical-decimal-uint'
  },
  rationale: 'bounded plain text',
  createdAt: 'ISO timestamp',
  expiresAt: 'ISO timestamp',
  walletAnchor: { blockNumber: 'decimal', blockHash: '0x…', verifiedAt: 'ISO timestamp' },
  review: { required: true, approved: false },
  attemptId: null,
  txHash: null,
  execution: null,
  events: []
}
```

The model may suggest recipient and amount, but the API—not the browser or model—derives scope and account, reads an anchored Base wallet snapshot, normalizes and validates addresses, units, token membership, bounds, timestamps, and IDs. Invalid candidates are omitted rather than repaired into a different transaction.

The proposal remains `executable:false`. It becomes actionable only when the authenticated owner opens the review card and the browser creates a new prepared wallet attempt through the existing controller.

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

Add proposal and proposal-event tables to the configured API SQLite database rather than the in-memory runtime registry. The proposal primary key is `proposal_id`; `(room_id, source_message_id, candidate_hash)` is unique. Each row stores schema version, current revision, immutable normalized proposal JSON, state fields, optional handoff/attempt/hash fields, and created/updated/expiry timestamps. Every transition appends an immutable event with monotonically increasing sequence, prior/next state, actor owner, server timestamp, revision, and bounded reason code in the same SQLite transaction.

Use `BEGIN IMMEDIATE` compare-and-swap transitions on `(proposal_id, revision, state)`, WAL mode, foreign keys, and unique `attempt_id`/`tx_hash` constraints when non-null. Repeated requests with the same idempotency key return the same result. Conflicting requests return the current canonical record. The release supports one API deployment or multiple processes sharing the same SQLite file; enabling proposal execution without the durable database, or across independent multi-host databases, must fail startup.

States and required evidence are:

- `review_only`: no handoff, attempt, hash, or execution evidence; owner may open or reject.
- `opened`: no attempt/hash; exact immutable fields have been shown; owner may reject or claim.
- `rejected_owner`, `expired`, `invalidated_owner`, `validation_failed`, `signature_rejected`: terminal, no hash, reason and terminal timestamp required.
- `claimed`: `handoffId`, claimant owner, idempotency key, claim timestamp, and claim expiry required; no attempt/hash.
- `prepared`: handoff plus exact `attemptId` and prepared-transaction fingerprint required; no hash.
- `submitted_hashless_unknown`: handoff/attempt required, hash forbidden, uncertainty evidence required; consumed and never retryable.
- `submitted_hashed_unknown`: handoff/attempt/hash required, uncertainty evidence required; consumed and never retryable.
- `reverted`: handoff/attempt/hash and bound status-0 receipt evidence required.
- `confirmed_attributed`: handoff/attempt/hash and exact receipt/trace attribution evidence required.

`review_only`, `opened`, `claimed`, and `prepared` are nonterminal. All other states are terminal for creating a new wallet attempt. Expiry applies only before submission authorization; expiry after a wallet call never discards, retries, or reauthorizes the outstanding attempt. Wallet signature rejection is not an onchain revert.

### 6. Atomic handoff and recovery

The browser takes a proposal-scoped Web Lock before the first claim and holds it through preparation and submission. The lock prevents same-browser races; the server transaction prevents cross-tab, cross-device, session, and process races.

1. `POST /proposals/:id/open` compares revision/state and records that the exact immutable record was rendered.
2. `POST /proposals/:id/claim` atomically claims the current revision with an idempotency key and returns one `handoffId`. Repeats recover the same handoff; other devices receive its current state.
3. The existing wallet controller prepares from closed normalized fields while persisting `proposalId`, `proposalRevision`, and `handoffId` in the local attempt record before any signing operation.
4. `POST /proposals/:id/bind-attempt` atomically binds the exact attempt ID and prepared-transaction fingerprint. If the request or response is lost, the browser recovers the same local attempt and server handoff; it must not prepare another.
5. Immediately before signing, `POST /proposals/:id/authorize-submit` performs authoritative final revalidation and issues a one-time, 30-second submission lease bound to revision, attempt ID, signer, transaction fingerprint, anchor, catalog version, and allowlist version. API failure or disagreement stops before signing.
6. The existing controller performs its own under-lock RPC revalidation and must agree with the server lease before calling the wallet boundary.
7. After wallet submission, the local attempt is persisted first, then the hash is linked idempotently to the proposal. A lost response recovers by proposal/attempt ID. API failure after a wallet call produces the matching hashless/hashed uncertainty state and never permits a second attempt.
8. Receipt recovery reconciles proposal, local attempt, transaction binding, and server record. Late original transactions update only their consumed proposal and can never authorize a replacement.

Crashes are recoverable at every boundary: before claim returns, after claim, after local attempt persistence, after server binding, after submission authorization, after wallet rejection, after broadcast before hash linkage, and after mining before attribution. Recovery always resumes the same handoff/attempt or ends terminal; it never manufactures another transaction.

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
8. SQLite compare-and-swap plus proposal-scoped locking guarantees one proposal binds to at most one durable wallet attempt across tabs, devices, sessions, and processes.
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
- SQLite restart persistence, event ordering, corrupt rows, compare-and-swap conflicts, duplicate idempotency requests, and multiple processes sharing one database are covered;
- authorization and replay tests bind every operation to current owner, room, proposal revision, handoff, and attempt.

### Browser/controller tests

- proposal review renders exact values and skill constraints;
- opening/rejecting never invokes the wallet;
- review shows full chain/account/owner/recipient/token contract/decimals/base units/formatted amount/expiry/state and treats symbol/skill badges as non-authoritative;
- disabled/loading states prevent double clicks, and proposal attribution never uses the editable generic send form;
- final confirmation feeds the exact frozen rendered fields to the existing controller;
- stale, consumed, expired, owner-changed, signer-changed, token-changed, version-changed, server-unavailable, RPC-disagreeing, and tampered proposals fail before signing;
- concurrent tabs/devices, repeated requests, and crash recovery at every claim/bind/authorize/submit boundary recover one handoff and one attempt;
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

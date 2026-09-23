# Looper Skill-Aware Wallet Proposals Design

**Date:** 2026-09-23
**Status:** Draft for review

## Goal

Let a selected Looper understand a bounded catalog of approved skills such as Bankr, explain when those skills are relevant, and produce exact review-only ETH/ERC-20 transfer proposals that the current owner can inspect, sign, and execute through the existing ERC-6551 wallet flow.

The first release does not let the model execute skills, hold credentials, submit arbitrary calldata, trade, swap, or spend autonomously.

## Existing foundation

The current Console already provides:

- authenticated selected-Looper rooms;
- Bankr LLM inference with a review-only runtime contract;
- review-only proposal rendering;
- server-authoritative Looper ownership and wallet context;
- a hardened owner-only ERC-6551 controller for activation and exact ETH/ERC-20 sends;
- pre-signature ownership/runtime/config revalidation, Web Locks, durable attempt records, receipt attribution, and fail-closed uncertain outcomes.

This design connects the proposal surface to that controller. It does not create a second transaction path.

## Scope

### Included

1. A server-owned catalog of approved skill descriptors.
2. Skill awareness in the Looper runtime prompt and response metadata.
3. Structured, review-only exact-transfer intents for ETH and allowlisted ERC-20 assets already present in verified wallet context.
4. A Console review card that copies an approved intent into the existing wallet preparation flow.
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

### 3. Transfer intent contract

A model-produced executable candidate must match this exact public shape:

```js
{
  schema_version: '0.1.0',
  kind: 'looper_wallet_transfer_intent',
  id: 'server-generated-id',
  status: 'review_only',
  executable: false,
  skill: 'bankr',
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
  walletAnchor: { blockNumber: 'decimal', blockHash: '0x…' },
  review: { required: true, approved: false },
  execution: null
}
```

The model may suggest recipient and amount, but the API—not the model—normalizes and validates addresses, units, token membership, bounds, scope, timestamps, and IDs. Invalid candidates are omitted rather than repaired into a different transaction.

The proposal remains `executable:false`. It becomes actionable only when the authenticated owner opens the review card and the browser creates a new prepared wallet attempt through the existing controller.

### 4. API validation and persistence

The API parses model output with a closed schema:

- exact keys and bounded string lengths;
- Base chain only;
- selected Looper scope only;
- current authenticated owner only;
- native ETH or a token present in verified server wallet context;
- nonzero recipient and amount;
- no self-transfer to the Looper account unless explicitly allowed later;
- maximum expiry of 15 minutes;
- no calldata, allowance, spender, router, slippage, signature, raw transaction, or provider field.

The server assigns proposal ID and timestamps after validation. The room stores the immutable review proposal and its lifecycle events. Replayed model output cannot choose or reuse an ID.

Lifecycle:

`review_only -> opened -> rejected | expired | prepared -> submitted -> confirmed_attributed | uncertain`

Only the owner may open, reject, or execute. A proposal can produce at most one prepared wallet attempt. An uncertain submission permanently consumes the proposal until the owner resolves the existing attempt; it must never be retried from the proposal card.

### 5. Owner review and wallet execution

The Console review card displays:

- proposing Looper and skill;
- chain and exact wallet address;
- exact asset, base-unit amount plus formatted amount;
- exact recipient;
- rationale and expiry;
- explicit warning that the owner wallet will sign a Base transaction.

The first click opens review; it does not invoke the wallet. The final button requires a confirmation checkbox and calls a new controller adapter that accepts the closed transfer fields, not calldata.

Before preparing and again immediately before submission, the existing controller rechecks:

- current selected Looper and authenticated owner;
- proposal ID, state, expiry, and scope;
- ERC-6551 implementation/runtime/account binding;
- owner wallet profile and Base code policy;
- verified token contract and decimals;
- balance sufficiency;
- exact recipient and amount;
- persisted proposal and attempt integrity;
- Web Lock ownership.

The existing wallet boundary creates the exact account `execute` transaction. The proposal layer never constructs calldata. Existing receipt/trace attribution remains authoritative. The proposal links to the resulting attempt ID and transaction hash only after those values are produced by the controller.

### 6. Skill-awareness UI

The Console shows a compact “Capabilities” area for the selected Looper:

- approved skill name;
- enabled mode (`Understands`, `Can propose`);
- disabled execution modes (`Cannot execute directly`);
- a short constraint summary.

Chat responses may name the skill used for reasoning. A skill badge is evidence of prompt context, not proof that an external service was called.

## Failure behavior

- Missing or malformed catalog: run without skill awareness; no executable proposal.
- Model returns unknown skill/capability: omit the proposal and retain ordinary text.
- Wallet context degraded or stale: text response may continue, proposal creation is disabled.
- Proposal expires or ownership changes: mark terminal and require a fresh chat proposal.
- Browser reload: restore room proposal state and existing wallet attempt independently.
- Wallet rejection: mark proposal rejected by owner; no retry without a new explicit review.
- Hashless/hashed uncertainty: consume proposal and surface the existing wallet recovery controls.
- Receipt attribution failure: never claim success.

## Security invariants

1. The LLM cannot call a skill, wallet, provider, or API.
2. The LLM cannot supply calldata or raw transactions.
3. A skill descriptor cannot grant execution authority.
4. Natural-language approval is not transaction approval.
5. Every transfer requires an authenticated, current owner interaction and wallet signature.
6. Proposal scope is bound to chain, collection, token, account, and owner.
7. Ownership or release drift invalidates the proposal before signing.
8. One proposal creates at most one durable wallet attempt.
9. No Bankr credential or Bankr wallet enters Looper wallet execution.
10. Existing fail-closed wallet behavior remains the sole execution authority.

## Testing

### API tests

- catalog is immutable, bounded, and contains no executable functions or secret/path fields;
- prompt receives descriptors and the non-execution contract;
- model skill explanations work without proposals;
- valid ETH/ERC-20 candidates normalize into exact review-only intents;
- hostile/extra keys, calldata, unsupported assets, invalid amounts, long text, stale scope, and expired candidates are rejected;
- server assigns IDs/timestamps and enforces legal lifecycle transitions;
- authorization and replay tests bind every operation to current owner and room.

### Browser/controller tests

- proposal review renders exact values and skill constraints;
- opening/rejecting never invokes the wallet;
- final confirmation feeds closed fields to the existing controller;
- stale, consumed, expired, owner-changed, token-changed, and tampered proposals fail before signing;
- uncertain submissions cannot be retried;
- receipt attribution links proposal and attempt exactly once;
- mobile cards wrap without horizontal overflow.

### End-to-end proof

Use mocked LLM, RPC, and wallet boundaries to prove:

1. Bankr-aware response creates an exact transfer proposal.
2. No wallet call occurs before final owner confirmation.
3. One confirmation creates one exact prepared attempt.
4. Revalidation occurs before submission.
5. A matching receipt produces `confirmed_attributed` in both wallet attempt and proposal.
6. A mismatch, rejection, or uncertainty never reports success.

No test or smoke script may sign or broadcast a real transaction.

## Rollout

1. Ship catalog awareness and non-executable proposal rendering behind a server flag defaulting off.
2. Prove production text responses and proposal persistence with wallet execution still disabled.
3. Enable owner-reviewed ETH/ERC-20 proposal handoff only after the focused and full suites, production build, mobile browser proof, and API canary pass.
4. Do not activate swaps or arbitrary calls in this release. Each future action class requires its own reviewed schema, preparer, simulation, and approval design.

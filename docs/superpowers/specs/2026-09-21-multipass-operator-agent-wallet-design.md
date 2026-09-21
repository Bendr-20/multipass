# Multipass Operator-Activated Agent Wallet Design

**Date:** 2026-09-21  
**Status:** Proposed  
**Scope:** Multipass Console on Base

## Decision

Move Looper wallet activation into Multipass Console. The connected operator activates and controls the selected Looper's deterministic ERC-6551 wallet. The existing ERC-721T metadata and ERC-8004 identity/binding are immutable inputs and are never created, changed, or re-bound by this flow.

This design supersedes the standalone Looper #3802 public-profile implementation plan. That implementation remains undeployed and must not become a second product surface.

## Product Flow

1. The operator connects an Ethereum wallet to Multipass Console.
2. Multipass loads Loopers currently owned by that wallet.
3. The operator selects one Looper.
4. Directly under the selected agent name, Multipass derives and verifies its deterministic ERC-6551 account.
5. If the account is undeployed, Multipass shows **Activate agent wallet**.
6. The operator approves one Base transaction to the canonical ERC-6551 registry and pays gas.
7. Multipass verifies the canonical receipt, account-created event, and deployed runtime.
8. The activation control is replaced in place by the wallet panel.
9. If the Looper is transferred, ERC-6551 control follows the current ERC-721 owner; Multipass never maintains a separate ownership database.

Activation is per selected Looper. Batch activation is deferred.

## Existing Identity Is Untouched

Each Looper already has:

- ERC-721T agent metadata;
- a bound ERC-8004 identity;
- a deterministic ERC-6551 account address derived from collection configuration and token ID.

The activation transaction only calls the ERC-6551 registry's `createAccount` path. It must not call ERC-8004 registration, URI, ownership, controller, or binding mutations. All ERC-721T and ERC-8004 data is read-only context.

## Console Placement

The wallet surface lives inside the existing selected-agent identity card in the left sidebar, immediately below the agent name and role.

### Undeployed state

Show:

- deterministic wallet address;
- **Activate agent wallet**;
- a short note that the operator pays Base gas;
- readiness or failure status.

### Pending state

Replace the button with:

- wallet confirmation status;
- submitted transaction link when a trustworthy hash exists;
- explicit rejected, pending, or retryable states;
- no second submission while outcome is unknown.

### Active state

Replace activation UI with a compact wallet panel containing:

- wallet address, copy, Base explorer, and receive action;
- native ETH balance;
- ERC-20 balances with token contract identity;
- refresh;
- send ETH;
- send an ERC-20 already present in the wallet;
- recent verified transaction activity when available.

The panel must not expose arbitrary contract calls, token approvals, swaps, bridges, leverage, or DeFi automation in v1.

## Trust Boundaries

### Canonical collection configuration

Use one approved Base configuration for the Looper collection:

- chain ID;
- Looper ERC-721 contract;
- ERC-6551 registry;
- account implementation;
- salt;
- expected account-runtime construction and implementation identity.

Before enabling activation, Multipass confirms the collection's onchain getters match this configuration and confirms `ownerOf(tokenId)` is the currently authenticated operator wallet.

### Deterministic account

Derive the selected token's account locally and confirm it against both:

- the Looper contract's token-bound-account getter; and
- the ERC-6551 registry's account calculation.

Any disagreement disables writes.

### Activation transaction

Build one exact `createAccount(implementation,salt,chainId,tokenContract,tokenId)` transaction. Only `tokenId`, current owner, and derived account vary per selected Looper. The destination, selector, implementation, salt, chain, and token contract are fixed.

Before submission:

- require Base chain;
- re-read current owner;
- confirm the account has no code;
- simulate and estimate the exact transaction;
- display the estimated fee;
- invalidate readiness on wallet, chain, owner, or selected-agent change.

After submission, verify the canonical receipt, success status, exact account-created event, and deployed runtime before showing the wallet as active.

Unknown provider outcomes remain locked until chain state proves whether deployment occurred. Do not blindly resubmit.

## Operator Wallet Functions

All outgoing funds move through the ERC-6551 account's pinned `execute(address,uint256,bytes)` method (`0xb61d27f6`). The connected current Looper owner authorizes every operation. An EOA sends the transaction directly; a supported ERC-4337 smart wallet may wrap the same exact call in one attributable UserOperation.

### ETH send

Permit only:

- recipient address;
- positive amount no greater than the verified balance;
- zero calldata;
- the account implementation's ordinary call operation.

### ERC-20 send

Permit only a canonical `transfer(address,uint256)` call to a token contract already discovered in the wallet. Re-read token balance and decimals from Base RPC before confirmation. Treat names, symbols, logos, and indexer valuations as display-only untrusted metadata.

### Confirmation

Before opening the wallet signature, show:

- selected Looper;
- agent wallet;
- recipient;
- asset contract and symbol;
- exact base-unit and display amount;
- estimated gas;
- no claim that execution succeeded until a canonical receipt is verified.

No private key, session key, or unrestricted delegation is given to the Looper runtime.

## Wallet Read Skill

Every activated Looper receives read-only wallet context in its Multipass runtime:

- chain and wallet address;
- ETH balance;
- verified token balances;
- recent verified activity;
- last refresh time and data-source health.

This lets the agent answer questions such as "what is in my wallet?" The skill cannot sign, submit, approve, or mutate anything.

The runtime is bound to the selected Looper and invalidated when the operator wallet, selected Looper, or ownership changes.

## Bankr Skill

Bankr research is a separately gated server capability and remains disabled until a live capability test proves the read-only boundary. It uses a dedicated Bankr API key with Agent API access but no Wallet API write access, no trading wallet funds, and no Bankr wallet presented as the Looper wallet. The browser and Looper never receive the key.

The server facade permits only a fixed research request schema for prices, market research, and token analysis. It strips tool/function calls, transaction objects, signing requests, wallet provisioning, and payment methods; caps input/output size and duration; and returns labelled Bankr research text plus health metadata. It never receives a Bankr portfolio as the Looper portfolio. Looper portfolio commentary uses the verified Multipass wallet snapshot.

Bankr's embedded wallet must not become a second wallet for the Looper. Bankr write/trading access is deferred until Bankr exposes an unsigned proposal compatible with independent Multipass validation and ERC-6551 execution. Future trading is operator opt-in and approval-gated.

## Data Sources

- Base RPC is authoritative for ownership, account code, runtime, native balance, token balance, simulation, gas, and transaction receipts.
- A bounded indexer may discover token contracts and recent activity, but every spend-relevant amount is re-read from Base RPC.
- Bankr is authoritative only for its research response, never for wallet ownership or transaction completion.

All network requests use exact HTTPS origins, timeouts, response-size caps, strict schemas, and stale-request cancellation.

## Error Handling

- Wrong network: offer Base network switch; perform no write.
- Not current owner: disable activation and sends.
- Account already deployed: transition directly to wallet view after runtime verification.
- Ownership changes mid-flow: invalidate the operation and refresh the roster.
- User rejects signature: return to ready state; no transaction claim.
- Hashless provider error: lock submission and verify chain state before allowing retry.
- Receipt revert: show failure and preserve receipt link.
- RPC/indexer disagreement: fail closed for activation and sending; retain read-only UI with a degraded-data notice when safe.
- Token metadata failure: show verified contract address and raw balance, but disable sending that token. Sending requires canonical `decimals()` in the range 0–36 and a valid `balanceOf`; never invent symbol or decimals.
- Bankr unavailable: wallet functions remain available; research skill reports unavailable.

## Accessibility and Responsive Behavior

- Activation and wallet controls are keyboard reachable and have explicit labels.
- Pending, success, and error states use text, not color alone.
- Confirmation dialogs trap focus and return it to the initiating control.
- The sidebar wallet panel remains usable on mobile without horizontal scrolling.
- Long addresses wrap or truncate visually while copy preserves exact bytes.

## Testing

### Unit tests

- deterministic account derivation for several token IDs;
- exact activation calldata and fixed configuration;
- ownership and chain invalidation;
- ETH and ERC-20 transfer encoding;
- balance/decimals validation and hostile token metadata;
- activation and send state machines, including hashless outcomes;
- wallet context isolation between selected Loopers;
- Bankr read-only capability filtering.

### Integration tests

- disconnected → connected → selected Looper → activation button;
- activate → canonical receipt → wallet panel replacement;
- already deployed account opens wallet panel without submission;
- ETH and ERC-20 sends require owner confirmation and canonical receipt;
- wallet or NFT ownership change disables stale controls;
- agent can read wallet context but cannot invoke write methods;
- Bankr research failure does not break wallet functions.

### Browser tests

- exact left-sidebar placement under the agent name;
- keyboard and mobile behavior;
- no duplicate submission during pending/unknown outcomes;
- visible transaction links and truthful final states;
- no secret material in HTML, browser storage, logs, or network responses.

### Onchain release gate

Before production, activate one approved test Looper through the exact Console flow with the owner present. Verify the transaction on Base, the account-created event, deployed runtime, wallet panel, receive, one small ETH round trip, and one small ERC-20 round trip. No testnet substitute is treated as proof of Base mainnet behavior.

## Delivery Strategy

1. Replace the abandoned standalone-profile branch direction with this Console-centered design while retaining the old commits on a backup ref.
2. Add generic Looper account derivation and read APIs.
3. Add activation state machine and sidebar UI.
4. Add operator receive/send wallet functions.
5. Add agent wallet-read context.
6. Add server-side read-only Bankr research.
7. Run security, browser, and onchain release gates.

Deployment remains a separate approval-gated action.

## Normative Onchain Safety Addendum

### Pinned Base configuration

The generic flow retains the audited production pins and varies only token ID, current owner, and derived account:

- chain ID `8453`;
- Looper proxy `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`, 177-byte runtime SHA-256 `0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`, EIP-1967 implementation slot value `0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908`;
- Looper implementation `0x68F22e3563891167D37C86391c4a83449c83e908`, 23,210-byte runtime SHA-256 `0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`;
- ERC-6551 registry `0x000000006551c19487814612e58FE06813775758`, 571-byte runtime SHA-256 `0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56`;
- account implementation `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF`, 685-byte runtime SHA-256 `0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5`;
- salt `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`.

At one canonical block, before readiness, read the proxy code/slot, implementation code, registry code, the collection's registry/implementation/salt getters, `ownerOf(tokenId)`, `tokenBoundAccount(tokenId)`, and the registry-derived account. Require exact agreement. Repeat the complete anchored snapshot immediately before opening a wallet signature and at the receipt block. Any drift disables writes. A configuration change requires a reviewed pin update and deployment; there is no runtime auto-rollover.

Use only the three approved Base RPC origins from the audited activation transport. Require all three to agree on fixed-block hash and canonicality. State reads use EIP-1898 `{blockHash,requireCanonical:true}` where supported, with guarded same-hash fallback only as already tested by the audited transport. Preserve its HTTPS, redirect, timeout, body-size, route, and response-schema bounds.

### Purpose-built wallet boundary

Feature code never receives generic `ethereum.request` access. A dedicated boundary exposes only account discovery, Base switch, exact activation submission, exact ETH-send submission, and exact ERC-20-send submission after validation.

The only permitted transaction bodies are:

- activation: `to=registry`, `value=0`, exact `createAccount(implementation,salt,8453,loopers,tokenId)` calldata;
- ETH send: `to=agentAccount`, `value=0`, exact `execute(recipient,amount,0x)` calldata;
- ERC-20 send: `to=agentAccount`, `value=0`, exact `execute(token,0,transfer(recipient,amount))` calldata.

Immediately before any signature, atomically revalidate Base chain, selected token, connected signer, current `ownerOf`, account tuple/runtime, pinned configuration, spendable balance, and exact implementation; then simulate from the current owner and estimate gas. A wallet, chain, owner, agent, or configuration change invalidates the prepared transaction.

### Direct and ERC-4337 attribution

Direct transactions require exact chain, sender, destination, value, input, transaction/receipt hash and coordinates, exactly one expected event, and canonical post-state.

For supported Coinbase Base Account/ERC-4337 wrapping, carry forward the audited decoder and verifier:

- top-level destination is the pinned EntryPoint and value is zero;
- canonical `handleOps` decoding with bounded operation count and no trailing/overlapping bytes;
- exactly one selected UserOperation for the authenticated smart-wallet sender;
- empty `initCode` for an already-created operator wallet and empty `paymasterAndData` so operator-paid means no sponsor;
- exact wallet `execute` or one-item `executeBatch` envelope containing only the prepared call; replayable chain-ID-skipping selectors are forbidden;
- local UserOperation hash equals the EntryPoint's onchain `getUserOpHash` result;
- exactly one successful matching `UserOperationEvent` with matching sender, nonce, and hash;
- bounded `debug_traceTransaction` ancestry proves the selected operation executed the exact registry or agent-account call and emitted the receipt event at the same ordinal.

If a wallet cannot provide this attributable direct or ERC-4337 path, writes are disabled for that wallet while reads remain available.

### Durable operation state machines

Activation and send attempts use separate versioned stores keyed by `chainId:collection:tokenId:account:owner`, separate exclusive Web Lock names, strict schemas, read-back verification, and immutable histories. Web Locks unavailable means read-only mode.

Activation states are the generalized audited states: `prepared`, `submitted`, `uncertain_hashless`, `uncertain_hashed`, `confirmed_attributed`, `observed_unattributed`, `reverted`, and `retry_cancelled`. The transition reasons, ten-minute receipt deadline, two-minute confirmation deadline after receipt discovery, three-origin receipt equality, two-block confirmation depth, canonical revalidation, one guarded retry after an undeployed hashless outcome, retry supersession, late-original detection, and acknowledgment behavior carry forward from the audited #3802 tool. Reloaded `prepared`, corrupt storage, receipt timeout, configuration drift, reorg, or incomplete evidence fail closed. If an exact account appears without attributable creation evidence, record `observed_unattributed`; show the verified wallet read-only and do not claim which attempt created it.

Send attempts use `prepared`, `submitted`, `uncertain_hashless`, `uncertain_hashed`, `confirmed_attributed`, and `reverted`. They use the same receipt quorum, two-block confirmation, canonical revalidation, reload, cross-tab, and reorg handling. A hashless send has no automatic retry or balance-based success inference. It remains locked unless bounded discovery yields one unique transaction whose exact outer/direct or ERC-4337 envelope, account execution, receipt, and canonical post-state attribute it to the prepared send. Otherwise only a prominent unknown-outcome state is shown.

If another party deploys the exact account between preflight and submission, activation moves to `observed_unattributed`; incorrect code/runtime is a hard block. A prefunded undeployed deterministic address is allowed for activation but the balance is displayed and never treated as deployment proof.

### ERC-20 safety and success claims

A sendable token must have code and bounded canonical ABI responses: `decimals()` is 0–36, `balanceOf(account)` is one 32-byte word, and the selected amount does not exceed that value. Invalid/missing decimals or malformed balances disable send while retaining raw read-only display.

Simulation must return empty bytes or canonical ABI `true`; canonical `false`, malformed return data, or revert blocks submission. After a successful attributed account execution, verify the token call and canonical post-state. For standard tokens, matching `Transfer` evidence plus balance changes may be labelled confirmed. Fee-on-transfer, rebasing, or otherwise nonstandard results are labelled executed with observed balances, never as exact recipient delivery.

### Ownership transfer and private memory

Public Looper identity continuity remains token/identity scoped. Private thread history, drafts, wallet-operation state, and Sibyl memory are namespaced by chain, collection, token ID, and authenticated owner wallet. There is no implicit private-memory handoff.

On owner change, revoke the prior session, abort RPC/indexer/Bankr work, clear browser snapshots and drafts, disable pending controls, and require the new owner to authenticate. Tests must prove the old owner cannot send and cannot read the new owner's private context, while the new owner controls the ERC-6551 account through current onchain ownership.

## Authoritative Module Map

- `apps/web/src/looper-agent-wallet-config.js`: immutable Base pins and derivation helpers; no provider access.
- `apps/web/src/looper-agent-wallet-rpc.js`: closed read union, canonical anchors, receipts, traces, token reads.
- `apps/web/src/looper-agent-wallet-boundary.js`: purpose-built injected-wallet adapter; no generic request export.
- `apps/web/src/looper-agent-wallet-attempt-store.js`: separate activation/send durable schemas and legal transitions.
- `apps/web/src/looper-agent-wallet-controller.js`: preflight, activation, send, resume, revalidation, ownership invalidation.
- `apps/web/src/looper-agent-wallet-view.js`: snapshot construction and sidebar wallet panel.
- `apps/web/src/looper-agent-wallet-context.js`: owner-scoped read-only agent context.
- `apps/api/src/looper-bankr-research.*` or the repository's equivalent Console API module: disabled-by-default research-only facade after live boundary proof.
- `apps/web/src/multipass-console.js` and `apps/web/src/app.js`: placement and event wiring only.

The audited #3802 units are reference behavior, not copied token-specific constants. Generic modules separate `walletActivation`, `walletOperations`, `walletReadContext`, and optional `bankrResearch` state so selecting one Looper cannot leak another Looper's attempts, balances, or private context.

Permanent tests include EOA and ERC-4337 paths, nonempty paymaster rejection, direct/wrapped attribution, cross-tab/reload/storage corruption, receipt timeout/reorg, deployment races, prefunded undeployed accounts, configuration drift at every boundary, old-owner/new-owner transfer behavior, private-memory isolation, malicious token metadata/returns/decimals, provider redirects/caps/deadlines, and upstream-error/log secret leakage.
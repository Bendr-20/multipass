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

All outgoing funds move through the ERC-6551 account's existing execution method. The connected current Looper owner sends the outer transaction and signs every operation.

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

Bankr market research is enabled by default through a server-side read-only Bankr credential. The browser and Looper never receive the API key.

Allowed v1 capabilities:

- prices;
- market research;
- token analysis;
- non-transactional portfolio commentary using the Looper wallet snapshot supplied by Multipass.

Bankr's embedded wallet must not become a second wallet for the Looper. Bankr write/trading access is deferred until Bankr can produce a transaction proposal that Multipass validates and executes from the ERC-6551 wallet. Future trading is operator opt-in and approval-gated.

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
- Token metadata failure: show verified contract address and raw balance; never invent symbol or decimals.
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
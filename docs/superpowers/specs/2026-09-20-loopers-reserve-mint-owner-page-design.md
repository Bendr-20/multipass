# Loopers Reserve-Mint Owner Page Design

**Date:** 2026-09-20
**Status:** User-approved design

## Goal

Create a standalone, noindex owner page that lets the current Loopers contract owner reserve-mint 1–40 NFTs per transaction directly to the treasury Safe. The first intended action is a one-NFT test. The page never auto-submits a later batch and exposes no other contract write.

## Pinned production identities

- Chain: Base mainnet, chain ID `8453` (`0x2105`)
- Live proxy and transaction target: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Expected EIP-1967 implementation: `0x68F22e3563891167D37C86391c4a83449c83e908`
- Expected owner/sender: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Fixed NFT destination: `0xfA5c233683E4cE7cA6214E769Ae5F9D9e6Fa4483`
- Maximum team reserve: 337
- Current production baseline at design time: `reserveMinted() == 0`, `totalSupply() == 7440`
- Expected proxy SHA-256 bytecode hash: `6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`
- Expected implementation SHA-256 bytecode hash: `46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`
- Implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

The page must read these values from Base before enabling its only write. A mismatch fails closed.

## Chosen approach

Use a manual batch page modeled on the existing withdraw-only owner page. The destination is immutable. The user chooses an integer quantity from 1 through 40; the default is 1. Each click can create at most one wallet approval and one transaction. A later batch requires a fresh click after the previous receipt and post-state verification finish.

Live `eth_estimateGas` checks against the current proxy and owner succeeded for quantities through 40 to the Safe and reverted at 50 and above. The full 337 reserve therefore needs at least nine transactions: eight batches of 40 and one batch of 17, if the one-NFT test is not counted separately. After a one-NFT test, the remaining 336 can be completed as eight batches of 40 and one batch of 16.

Rejected approaches:

1. Automatic multi-transaction sequencing: still needs multiple wallet approvals and adds ordering and stale-state risk.
2. One transaction for all 337: the live contract rejects quantities above the supported batch size.
3. Editable destination: unnecessary authority and avoidable misdelivery risk.

## Page behavior

The page displays:

- Base network and connected wallet
- live proxy and implementation
- fixed Safe destination
- live `reserveMinted()`, `totalSupply()`, Safe `balanceOf()`, and calculated reserve remaining
- quantity input constrained to integers 1–40, defaulting to 1
- estimated token ID range derived from the current sequential supply, labeled as an estimate until confirmation
- a connect/switch-network button
- one `Reserve mint to Safe` button
- status and BaseScan receipt link

No external executable scripts, editable destination, transfer control, treasury control, upgrade control, metadata control, reveal control, pause control, or public-mint control are present.

## Exact write boundary

The only permitted transaction is the ABI encoding of:

```solidity
reserveMint(0xfA5c233683E4cE7cA6214E769Ae5F9D9e6Fa4483, quantity)
```

where `quantity` is the captured integer from 1 through 40.

At the provider boundary, the transaction must have exactly these semantic fields:

- `chainId`: `0x2105`
- `from`: expected owner
- `to`: live proxy
- `data`: exact `reserveMint(fixedSafe, capturedQuantity)` calldata
- `value`: `0x0`

Any extra or mismatched authority-bearing field fails closed before `eth_sendTransaction`.

## Pre-submit checks and sequencing

Before enabling mint:

1. Read proxy code, implementation slot and implementation code from Base.
2. Verify both pinned code hashes and implementation address.
3. Read owner, `reserveMinted()`, `totalSupply()`, and Safe `balanceOf()`.
4. Require the expected owner wallet on Base.
5. Require integer quantity 1–40 and `reserveMinted + quantity <= 337`.
6. Construct and verify the exact transaction allowlist.

On mint click:

1. Lock the form against duplicate submissions.
2. Capture quantity and wallet-generation state.
3. Re-run every chain, account, identity, code, owner, reserve, supply, destination-balance, and calldata check.
4. Run `eth_call` against the exact transaction on Base; a revert blocks sending.
5. Immediately re-run every mutable check after simulation and require no state drift.
6. Require the wallet-generation guard to remain unchanged.
7. Begin the single `eth_sendTransaction` request without an asynchronous gap.

`accountsChanged` or `chainChanged` invalidates readiness. Those events cannot unlock or start another send while a transaction is in flight.

## Receipt and post-state verification

After the wallet returns a transaction hash, the page exposes a BaseScan link and polls boundedly for both the transaction and receipt. It verifies:

- returned transaction `from`, `to`, `input`, `value`, and `chainId`
- receipt status is successful
- `reserveMinted()` increased by exactly the captured quantity
- `totalSupply()` increased by exactly the captured quantity
- Safe `balanceOf()` increased by exactly the captured quantity

Transient lookup failures retry within a bounded window. If submission occurred but verification is still pending, the page preserves the hash and reports pending instead of claiming success or allowing another mint. A reverted receipt or any field/state mismatch is a failure and never displays success.

## Testing

Focused tests must cover:

- standalone/noindex/no external script surface
- all pinned identities, code hashes, slot, Safe, and Base chain
- quantity defaults to 1; accepts integers 1–40; rejects zero, decimals, negatives, 41+, and reserve overflow
- wrong wallet, wrong chain, owner mismatch, implementation mismatch, either code-hash mismatch, and state-read failure
- exact calldata for quantities 1 and 40 and rejection of altered destination, quantity, proxy, sender, chain, or value
- simulation failure sends nothing
- post-simulation drift in chain, account, owner, reserve, supply, Safe balance, implementation, code hashes, destination, quantity, or transaction fields sends nothing
- wallet events and double clicks cannot create concurrent sends
- rejected wallet request does not claim submission
- successful receipt with exact reserve/supply/Safe-balance deltas
- mismatched transaction fields, reverted receipt, wrong deltas, and persistent lookup failure
- bounded retry with preserved pending hash
- provider method allowlists reject unexpected wallet and public RPC methods

Run the focused test file, the full web suite, build, static copy scan, a live no-wallet browser smoke test, and source/live/fetched hash comparison before handoff.

## Deployment and operator flow

Deploy under a dedicated route separate from the withdrawal page. The page itself never connects or submits without an explicit user click.

Operator sequence:

1. Connect owner wallet on Base.
2. Confirm the page shows the fixed Safe and expected contract identities.
3. Leave quantity at 1.
4. Review the wallet transaction: owner sender, proxy target, zero ETH value, and reserve-mint calldata.
5. Approve and wait for page verification.
6. Confirm the NFT appears in the Safe before selecting a later batch size.

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
- Maximum supply: 7,777
- Maximum team reserve (`TEAM_RESERVE_CAP`): 337
- Current production baseline at design time: `reserveMinted() == 0`, `totalSupply() == 7440`
- Expected proxy SHA-256 bytecode hash: `6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`
- Expected implementation SHA-256 bytecode hash: `46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`
- EIP-1967 implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
- Live Adapter8004 proxy: `0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27`
- Expected Adapter8004 implementation: `0x0f81bd4EDD4879734361A1A44460264CBf6F94c9`
- Adapter proxy SHA-256 bytecode hash: `a0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017`
- Adapter implementation SHA-256 bytecode hash: `550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be`
- Expected ERC-8004 Identity Registry proxy: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Expected Identity Registry implementation: `0x7274e874CA62410a93Bd8bf61c69d8045E399c02`
- Identity Registry proxy SHA-256 bytecode hash: `e3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85`
- Identity Registry implementation SHA-256 bytecode hash: `201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1`
- Expected agent URI base: `https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/`

The live Loopers implementation has immutable public constants for the adapter and expected registry. Each reserve mint first mints Loopers to the proxy, registers and binds one ERC-8004 identity per token through Adapter8004, then safe-transfers each Looper to the fixed Safe. The page must verify this full execution identity before enabling its only write and again at the receipt block. A mismatch fails closed.

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

Before enabling mint, obtain one canonical Base block number/hash and anchor every public RPC read to that same block. The snapshot must:

1. Read and hash Loopers proxy code, Loopers implementation slot/code, Adapter8004 proxy/implementation code, and Identity Registry proxy/implementation code.
2. Verify every pinned address and code hash, including `LIVE_ADAPTER()`, `EXPECTED_IDENTITY_REGISTRY()`, Adapter8004 `identityRegistry()`, and all three EIP-1967 implementation slots.
3. Read owner, `TEAM_RESERVE_CAP()`, `MAX_SUPPLY()`, `reserveMinted()`, `totalSupply()`, Safe `balanceOf()`, and `erc8004AgentBaseURI()`.
4. Require the pinned owner wallet on Base, the pinned agent URI base, integer quantity 1–40, `reserveMinted + quantity <= 337`, and `totalSupply + quantity <= 7777`.
5. Construct and verify the exact transaction allowlist.

On mint click:

1. Lock the form against duplicate submissions and persist the pending state key before provider submission.
2. Capture quantity, exact calldata, wallet-generation state, and the coherent preflight block/hash and values.
3. Re-run every chain, account, execution-identity, code, owner, reserve, supply, Safe-balance, Adapter8004, registry, URI-base, and calldata check in one block-anchored snapshot.
4. Run `eth_call` against the exact transaction at that same snapshot; a revert blocks sending.
5. Obtain a fresh canonical block and immediately repeat the coherent snapshot after simulation, requiring no relevant drift.
6. Require the wallet-generation guard to remain unchanged.
7. Begin the single `eth_sendTransaction` request without an asynchronous gap.

`accountsChanged` or `chainChanged` invalidates readiness. Those events cannot unlock or start another send while a transaction is in flight.

## Receipt and post-state verification

After the wallet returns a transaction hash, the page exposes a BaseScan link and persists a pending record keyed by chain, proxy, and owner. The record contains the hash, captured quantity, exact calldata, coherent preflight block/hash and values, submission time, and known nonce. Reloading the page restores the lock and resumes verification before any write can be enabled.

The page polls boundedly for both transaction and receipt, then requires:

- transaction hash and receipt `transactionHash` equal the wallet-returned hash
- normalized `from` and `to` equal the expected owner and Loopers proxy
- `input` byte-for-byte equals freshly encoded `reserveMint(fixedSafe, capturedQuantity)`
- `value` numerically equals zero and `chainId` is present and numerically equals 8453
- receipt status numerically equals 1
- transaction and receipt block hash, block number, and transaction index agree
- exactly one Loopers `ReserveMinted(fixedSafe, startTokenId, capturedQuantity)` log
- exactly `quantity` Loopers `Transfer(address(0), proxy, tokenId)` mint logs and exactly `quantity` Loopers `Transfer(proxy, fixedSafe, tokenId)` delivery logs, with no extra Loopers `Transfer` log in this receipt
- the confirmed token IDs are distinct and contiguous from `startTokenId`
- exactly one Loopers `ERC8004Bound(tokenId, agentId, fixedSafe, expectedAgentURI)` log per confirmed token, with distinct agent IDs

All post-state reads are anchored to the canonical receipt block/hash, preferably through EIP-1898 `{blockHash, requireCanonical: true}` with an explicit block-number/hash consistency fallback. At that block the page re-verifies every pinned proxy, implementation, adapter, registry, code hash, owner, constant, and URI-base value. For each confirmed token it verifies `ownerOf(tokenId) == fixedSafe`, `erc8004BoundByLooper(tokenId) == true`, `erc8004AgentIdByLooper(tokenId) == loggedAgentId`, `erc8004AgentURI(tokenId) == expectedAgentURI`, Adapter8004 `bindingOf(agentId)` matches the Loopers proxy/token ID, and `isController(agentId, fixedSafe) == true`.

Receipt-local logs and token-level reads are the attribution proof. Aggregate state is only a consistency check because unrelated activity can occur while the wallet is open: at the receipt block, `reserveMinted`, `totalSupply`, and Safe balance must each be at least their coherent preflight value plus the captured quantity. Unexpected same-receipt effects fail verification.

After a small confirmation depth, the page rechecks that the receipt block remains canonical before claiming success. Transient lookup failures, a reorg, unresolved replacement, missing evidence, or a successful but unreconciled receipt keep the persistent lock and report pending/uncertain. The lock clears automatically only after a canonical reverted receipt (no mint) or a canonical successful receipt with complete transaction/log/state verification. A timeout alone never clears it; a strongly warned manual recovery path is available only for a transaction proven dropped or replaced.

## Testing

Focused tests must cover:

- standalone/noindex/no external script surface
- all pinned Loopers, Adapter8004, Identity Registry, implementation, code-hash, URI-base, Safe, and Base identities
- quantity defaults to 1; accepts integers 1–40; rejects zero, decimals, negatives, 41+, reserve overflow, and max-supply overflow
- wrong wallet, wrong chain, owner mismatch, any proxy/implementation/address/hash mismatch, adapter-registry mismatch, URI-base drift, and state-read failure
- every preflight/post-simulation read is anchored to one canonical block
- exact calldata for quantities 1 and 40 and rejection of altered destination, quantity, proxy, sender, chain, or value
- simulation, adapter register, registry metadata, delivery, and controller-validation failures send nothing or revert atomically as appropriate
- post-simulation drift in chain, account, owner, reserve, supply, Safe balance, any implementation/code hash/config, destination, quantity, or transaction field sends nothing
- wallet events and double clicks cannot create concurrent sends
- rejected wallet request does not claim submission
- exact `ReserveMinted`, two-stage Loopers `Transfer`, and `ERC8004Bound` log attribution; missing, extra, duplicate, malformed, or noncontiguous evidence stays locked
- receipt-block token ownership, binding, URI, adapter binding, controller, and aggregate consistency checks
- public mint, Safe transfer, or another owner reserve mint before inclusion cannot create false attribution
- missing/malformed `chainId`, alternate encodings, mismatched transaction/receipt hashes or block coordinates, and reverted receipts
- canonical confirmation, simulated reorg, transient lookup retry, and successful-but-unreconciled outcomes
- reload/navigation/browser restart with unresolved, mined-unverified, reorged, dropped, replaced, reverted, and fully verified pending records; no second send until safe unlock
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

# Looper #3802 ERC-6551 Wallet Activation Pilot Design

**Date:** 2026-09-20  
**Status:** User-approved design

## Goal

Create a standalone, noindex owner page that lets the pinned Loopers collection-owner wallet sponsor exactly one ERC-6551 account deployment for Looper #3802 on Base. The page must prove that the resulting token-bound account is bound to Looper #3802 and controlled by its current NFT owner. It exposes no other write and cannot activate another token.

The pilot validates the production activation path before a separately designed and approved collection-wide rollout. Pilot success does not authorize later batches.

## Non-goals

The pilot does not:

- activate Multipass runtime, messaging, memory, Bankr, or XMTP;
- create, replace, transfer, or edit the existing ERC-8004 identity;
- mint, transfer, approve, fund, or airdrop any NFT, ERC-20, or ETH;
- change the Loopers proxy, implementation, owner, treasury, metadata, supply, royalties, or sale state;
- expose arbitrary calldata, token ID, target, sponsor, registry, implementation, salt, or chain inputs;
- automatically continue into collection-wide activation.

## Pinned production identities

### Chain and sponsor

- Chain: Base mainnet, chain ID `8453` (`0x2105`)
- Expected sponsor and connected wallet: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Sponsor balance at design time: approximately `0.086724768169849922 ETH`
- The sponsor is the current Loopers contract owner, but ERC-6551 account creation is permissionless; sponsorship does not grant control over the new account.

### Looper and holder

- Live Loopers proxy: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Expected EIP-1967 implementation: `0x68F22e3563891167D37C86391c4a83449c83e908`
- Pilot token ID: `3802`
- Expected current holder: `0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4`
- Expected deterministic token-bound account: `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38`
- Expected account state before activation: no runtime code and zero ETH balance
- Existing ERC-8004 identity: `90994`
- Expected Adapter8004 proxy: `0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27`
- The existing adapter binding must remain Loopers proxy + token ID `3802`, with the current holder recognized as controller.

### ERC-6551

- Canonical registry: `0x000000006551c19487814612e58FE06813775758`
- Account implementation: `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF`
- Salt: `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`
- `createAccount(address,bytes32,uint256,address,uint256)` selector: `0x8a54c52f`
- `ERC6551AccountCreated` topic: `0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722`
- Expected deployed Looper #3802 account runtime-code SHA-256: `f711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a`

### Executable-code identities

- Loopers proxy SHA-256: `6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`
- Loopers implementation SHA-256: `46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`
- ERC-6551 registry SHA-256: `d7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56`
- ERC-6551 account implementation SHA-256: `7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5`
- ERC-4337 EntryPoint v0.6: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- EntryPoint v0.6 SHA-256: `009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c`
- `UserOperationEvent` topic: `0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f`
- EIP-1967 implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

The page fails closed if any pinned address, code hash, implementation slot, configuration value, ownership value, account address, or ERC-8004 binding differs.

## Chosen approach

Build the pilot as a single-purpose static page modeled on the hardened Loopers owner tools. It uses public Base RPCs for reads and simulation, and an injected wallet only for connection, chain switching, and the single transaction request. It contains no private key, backend signer, external executable script, or mutable remote configuration.

The pilot sends `createAccount` directly to the ERC-6551 registry. Multicall3 and batching are intentionally absent from the pilot. Collection-wide inventory, batching, skip logic, fee controls, and receipts require a later design after the pilot is verified.

Rejected approaches:

1. Build the full batch system first: introduces unnecessary inventory, batching, recovery, and operational complexity before the production account path is proven.
2. Submit raw calldata manually: gives the operator less context and weaker pre/post verification.
3. Use the team Safe as sponsor: safer separation of duties but slower; the user chose the existing owner wallet for the pilot and collection rollout speed.

## Page behavior

The page displays:

- Base network and connected wallet;
- Looper #3802 and its current holder;
- live Loopers proxy and implementation;
- ERC-6551 registry, account implementation, and salt;
- expected token-bound account address;
- current deployment state and ETH balance of that account;
- existing ERC-8004 identity and controller status;
- fresh gas estimate and estimated fee;
- exact zero-ETH transaction semantics;
- activation status, transaction/BaseScan link, and recovery controls.

The page has only:

- `Connect / switch to Base`;
- `Activate wallet for Looper #3802`;
- a non-write `Resume verification` action when an attempt is pending or uncertain.

There is no editable token ID, address, contract, implementation, salt, chain, calldata, gas field, destination, or value.

## Exact write boundary

The only permitted semantic call is:

```solidity
ERC6551Registry.createAccount(
    0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF,
    0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee,
    8453,
    0x1649CD37f4748807b4882FC48765bA0B2aFfa94a,
    3802
)
```

The exact calldata is:

```text
0x8a54c52f0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bfff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda
```

Calldata Keccak-256: `0xa6b969253d21114fb839051bbdff1b46a66a0427e181eabee4bf0dd1ccf02def`.

At the wallet-provider boundary, the transaction must have exactly:

- `chainId`: `0x2105`
- `from`: expected sponsor
- `to`: canonical ERC-6551 registry
- `data`: exact calldata above
- `value`: `0x0`

Any additional key or mismatched value fails before `eth_sendTransaction`.

## Read and simulation boundary

Public RPC methods are allowlisted. The wallet provider is used only for `eth_chainId`, `eth_accounts`, `eth_requestAccounts`, `wallet_switchEthereumChain`, and `eth_sendTransaction`.

Before enabling the activation button, the page obtains one canonical Base block number/hash and anchors all reads to that block. It must:

1. Verify public RPC and connected-wallet chain IDs are Base.
2. Verify connected account and live Loopers `owner()` equal the pinned sponsor.
3. Verify Loopers proxy code, EIP-1967 implementation address/code, ERC-6551 registry code, account implementation code, and EntryPoint v0.6 code against pinned hashes.
4. Verify live Loopers `erc6551Registry()`, `erc6551Implementation()`, and `erc6551Salt()` against the pinned tuple.
5. Verify `ownerOf(3802)` equals the pinned current holder.
6. Verify `tokenBoundAccount(3802)` and the registry's `account(...)` both equal the pinned deterministic account.
7. Require the account address to have no runtime code before submission. If correct code already exists, disable submission and run completed-account verification instead.
8. Verify the expected account has zero ETH for the pilot baseline; a nonzero balance blocks the pilot for review rather than risking an unnoticed pre-funding assumption.
9. Verify ERC-8004 identity `90994`, adapter binding, and holder-controller status remain correct.
10. Construct and validate the exact five-key transaction object.
11. Run `eth_call` against the exact transaction at the anchored block and require the returned account address to equal the pinned account.
12. Run `eth_estimateGas`; at design time the direct call estimated `96,286` gas. Reject a missing result or an estimate above `150,000` gas.
13. Display the live fee estimate. The page never supplies or overrides wallet fee fields; the wallet presents final fees.

On activation click, repeat the complete block-anchored preflight, simulation, and gas check. Obtain a fresh canonical block and repeat the snapshot after simulation. Any relevant drift blocks sending.

`accountsChanged` and `chainChanged` immediately invalidate readiness. An in-memory mutex blocks double clicks and concurrent sends.

## Durable attempt and recovery

Immediately before invoking `eth_sendTransaction`, persist a `prepared` record in local storage containing:

- chain, sponsor, token ID, holder, account, registry, implementation, salt;
- exact five-key transaction and calldata hash;
- preflight block number/hash and pinned-state snapshot;
- estimated gas and fee data;
- wallet-generation counter and creation time;
- a unique attempt ID.

Call `eth_sendTransaction` immediately after persistence with no intervening await.

State transitions:

- `prepared`: provider invocation is imminent or its outcome is unknown;
- `submitted`: provider returned a syntactically valid transaction hash, which is persisted synchronously;
- `confirmed`: canonical receipt and full post-state verification succeeded;
- `reverted`: a canonical receipt proves failure;
- `uncertain`: transport failure, malformed/missing hash, reorg, or incomplete evidence.

Only explicit EIP-1193 rejection code `4001` clears `prepared` immediately. Other provider errors remain uncertain.

Account creation is deterministic and idempotent. For a pre-hash uncertain attempt, recovery first checks the expected account at a fresh canonical block:

- correct deployed code and full account/ownership verification allow recovery to mark the activation observed, clearly labeling transaction attribution unavailable;
- no code preserves the lock during a bounded wait;
- unexpected code or partial/mismatched state fails closed;
- a retry is never automatic and requires a separately warned operator action after the bounded wait.

This avoids relying on EOA nonce logic that is not authoritative for the sponsor's ERC-4337 smart-wallet path.

## Receipt and post-state verification

The page polls boundedly for the provider-returned transaction and receipt, displays a BaseScan link, and waits for three Base confirmations. It then requires the receipt block to remain canonical.

For a direct transaction, require:

- transaction hash and receipt hash equal the returned hash;
- `from`, `to`, input, value, and chain ID exactly match the approved transaction;
- receipt status is success.

For an ERC-4337-wrapped transaction, require:

- the mined transaction targets the pinned EntryPoint v0.6 with zero value and Base chain ID;
- the receipt contains a successful `UserOperationEvent` whose indexed sender is the pinned sponsor;
- EntryPoint code still matches the pinned hash;
- receipt status is success.

For both paths, require exactly one matching `ERC6551AccountCreated` event from the pinned registry with:

- account = expected token-bound account;
- implementation = pinned implementation;
- salt = pinned salt;
- chain ID = 8453;
- token contract = live Loopers proxy;
- token ID = 3802.

At the canonical receipt block, re-run all pinned proxy, implementation, registry, account-implementation, Loopers owner, ERC-6551 configuration, Looper holder, deterministic-account, and ERC-8004 binding checks. Then verify:

- account runtime code is byte-for-byte the expected 173-byte proxy code and has the pinned token-specific SHA-256;
- `token()` returns `(8453, Loopers proxy, 3802)`;
- `owner()` returns the current/pinned Looper holder;
- `state()` returns the expected initial state `0`;
- `isValidSigner(holder, 0x)` returns `0x523e3260`;
- account ETH balance is unchanged from the zero-ETH baseline;
- ERC-8004 identity `90994`, adapter binding, and controller remain unchanged.

Missing or conflicting evidence never claims success. A canonical reverted receipt clears the lock and reports that no wallet was deployed. Reorgs, transient RPC failures, successful receipts with incomplete evidence, or unexpected state preserve the lock for resume and investigation.

## Security properties

- The sponsor pays gas but never becomes the token-bound account owner.
- The Looper holder controls the account through the pinned account implementation's ownership resolution.
- The transaction carries zero ETH and cannot move NFTs, ERC-20s, or ETH.
- The page cannot construct another call or activate another token.
- Existing ERC-8004 identity and controller state are read and verified, never written.
- No private key, seed phrase, API key, or signing credential enters the page or repository.
- All success claims are based on canonical receipt evidence and receipt-block state, not optimistic UI state.

## Testing

Focused tests must cover:

- standalone/noindex/no external executable script surface;
- all pinned chain, sponsor, proxy, implementation, registry, implementation, salt, token, holder, account, EntryPoint, code hashes, event topics, selector, calldata, and calldata hash values;
- exact five-key zero-value transaction allowlist and rejection of any altered or additional field;
- wrong wallet, wrong chain, Loopers owner drift, holder transfer, deterministic-address mismatch, configuration drift, code-hash drift, ERC-8004 binding/controller drift, and RPC failure;
- active, inactive, unexpectedly funded, malformed-code, and wrong-code account states;
- block-anchored preflight, exact `eth_call` result, gas estimate, gas cap, post-simulation drift rejection, and wallet-generation races;
- double-click and account/chain-change handling;
- durable `prepared`, `submitted`, `confirmed`, `reverted`, and `uncertain` transitions across reloads;
- explicit rejection versus ambiguous provider failure;
- direct and ERC-4337 receipt verification, including expected sponsor `UserOperationEvent`;
- exact matching `ERC6551AccountCreated` evidence and rejection of missing, duplicate, malformed, or mismatched logs;
- canonical confirmation/reorg behavior;
- receipt-block account bytecode, `token()`, `owner()`, `state()`, `isValidSigner()`, balance, Loopers holder, and ERC-8004 invariants;
- idempotent pre-hash recovery without EOA nonce assumptions;
- public and wallet RPC method allowlists;
- absence of forbidden writes, targets, selectors, inputs, automatic retries, and batch behavior.

Run the focused page tests, full web test suite, production build, static source scan, and a no-wallet browser smoke test. Before deployment, repeat live read-only identity/hash/state verification. After deployment, compare local build, deployed asset, and fetched production hashes.

## Deployment and operator flow

Publish under a dedicated noindex route separate from withdrawal, reserve mint, and royalty tools. Back up the live destination before replacement. Deployment and verification do not initiate a transaction.

Operator sequence:

1. Open the pilot page and review the pinned Looper, holder, account, registry, implementation, and cost.
2. Connect the collection owner wallet and switch to Base.
3. Confirm the page reports the account as undeployed and every preflight check as valid.
4. Click `Activate wallet for Looper #3802`.
5. Review the wallet request: Base, zero ETH, canonical registry target, and one `createAccount` call for token `3802`.
6. Approve in the wallet.
7. Wait for canonical receipt and full post-state verification.
8. Independently confirm the account address, Looper holder control, and unchanged ERC-8004 identity.

Only after the pilot is verified may collection-wide activation be designed. That later design must include an exact active-wallet inventory, skip logic, batch sizing, per-batch simulation and approvals, fee ceilings, resumable receipts, and a separate user approval gate.
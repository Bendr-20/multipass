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
- Expected sponsor EIP-7702 designator: `0xef01007702cb554e6bfb442cb743a7df23154544a7176c`
- Expected sponsor EIP-7702 delegate: `0x7702cb554e6bFb442cb743A7dF23154544a7176C`
- Sponsor-context EIP-1967 implementation: `0x000100abaad02f1cfC8Bbe32bD5a564817339E72`
- Sponsor smart-wallet EntryPoint: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
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
- Expected Adapter8004 implementation: `0x0f81bd4EDD4879734361A1A44460264CBf6F94c9`
- Expected ERC-8004 Identity Registry proxy: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Expected Identity Registry implementation: `0x7274e874CA62410a93Bd8bf61c69d8045E399c02`
- Expected agent URI: `https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json`
- Loopers identity selectors: `erc8004BoundByLooper(uint256)` = `0x5adbbdce`, `erc8004AgentIdByLooper(uint256)` = `0x4c4a2696`, and `erc8004AgentURI(uint256)` = `0xf195e791`
- Adapter selectors: `identityRegistry()` = `0x134e18f4`, `bindingOf(uint256)` = `0x4d69ebc2`, and `isController(uint256,address)` = `0x158e711d`
- Identity Registry `ownerOf(uint256)` selector: `0x6352211e`
- The existing adapter binding must remain standard enum `0`, Loopers proxy, and token ID `3802`; the Identity Registry must report the adapter as identity `90994` owner, and the adapter must recognize the current Looper holder as controller.

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
- Adapter8004 proxy SHA-256: `a0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017`
- Adapter8004 implementation SHA-256: `550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be`
- Identity Registry proxy SHA-256: `e3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85`
- Identity Registry implementation SHA-256: `201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1`
- Sponsor EIP-7702 designator SHA-256: `e2b8058ebac7d6b7f1496596a6508894891adab1c1ef9712a4a5d50ff32e5267`
- Sponsor delegate SHA-256: `97497b31483a21567c1c520851c6e8e65e6ce906dc9236843668a21c3cd691e3`
- Sponsor smart-wallet implementation SHA-256: `a7dba5dc36ffc7d92796b2d17cd61f4e89d7ace44ff953def7e39e444c278bfa`
- ERC-4337 EntryPoint v0.6: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- EntryPoint v0.6 SHA-256: `009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c`
- `UserOperationEvent` topic: `0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f`
- EntryPoint v0.6 `handleOps` selector: `0x1fad948c`
- EntryPoint v0.6 `getUserOpHash` selector: `0xa6193531`
- Sponsor `execute` selector: `0xb61d27f6`
- Sponsor `executeBatch` selector: `0x34fcd5be`
- Forbidden replayable `executeWithoutChainIdValidation` selector: `0x2c2abd1e`
- EIP-1967 implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

The EIP-1967 slot is read at the Loopers proxy, Adapter proxy, Identity Registry proxy, and sponsor address. The sponsor address stores the Coinbase Smart Wallet implementation used through its EIP-7702 delegate. The page also calls sponsor `implementation()` and `entryPoint()` and requires the same pinned values.

The page fails closed if any pinned address, designator, delegate, code hash, implementation slot, configuration value, ownership value, account address, or ERC-8004 binding differs.

## Chosen approach

Build the pilot as a single-purpose static page modeled on the hardened Loopers owner tools. It uses public Base RPCs for reads and simulation, and an injected wallet only for connection, chain switching, and the single transaction request. It contains no private key, backend signer, external executable script, or mutable remote configuration.

The pilot sends `createAccount` directly to the ERC-6551 registry. Multicall3 and batching are intentionally absent from the pilot. Collection-wide inventory, batching, skip logic, fee controls, and receipts require a later design after the pilot is verified.

Rejected approaches:

1. Build the full batch system first: introduces unnecessary inventory, batching, recovery, and operational complexity before the production account path is proven.
2. Submit raw calldata manually: gives the operator less context and weaker pre/post verification.
3. Use the team Safe as sponsor: safer separation of duties but slower; the user chose the existing owner wallet for the pilot and collection rollout speed.

## Architecture boundaries

Publish the page at `/activate-looper-3802/`. Persist attempts only under the versioned local-storage key `loopers.walletActivation.8453.3802.v1`.

Keep the implementation split into independently testable units even if the shipped pilot remains one static document:

1. **Pinned identity and encoding unit:** owns constants, ABI selectors/topics, exact calldata, code hashes, and expected account runtime code. It has no RPC or DOM access.
2. **Public RPC unit:** exposes only allowlisted read/simulation methods, Base RPC failover, canonical-head acquisition, EIP-1898 block anchoring, and bounded polling. It never accesses the wallet provider.
3. **Snapshot validator:** converts raw reads into one coherent typed snapshot and validates every sponsor, Loopers, ERC-6551, ERC-8004, holder, and account invariant. It has no send capability.
4. **Wallet boundary:** exposes only connection, Base switching, wallet-state reads, and the exact five-key transaction request. It cannot accept caller-supplied transaction fields.
5. **Attempt store:** validates and persists the versioned state machine, rejects corrupt/foreign records, and performs no RPC or wallet operation.
6. **Receipt decoder/verifier:** decodes direct transactions, EntryPoint v0.6 `handleOps`, Coinbase Smart Wallet execution calldata, user-operation events, registry events, and receipt-block state. It cannot submit.
7. **Page controller/renderer:** sequences the units, owns mutex and wallet-generation state, and renders bounded status. It never constructs raw calldata itself.

An interface violation between these units fails closed. The controller may pass only validated immutable outputs from the encoding or snapshot units into the wallet boundary.

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
- a non-write `Resume verification` action when an attempt is pending or uncertain;
- a strongly warned `Retry activation` action that appears only for a hashless uncertain attempt after the exact recovery conditions below are satisfied.

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

The public RPC allowlist is exactly `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getStorageAt`, `eth_getBalance`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`. The wallet provider allowlist is exactly `eth_chainId`, `eth_accounts`, `eth_requestAccounts`, `wallet_switchEthereumChain`, and `eth_sendTransaction`. Any other method is rejected before reaching a provider.

Before enabling the activation button, the page obtains one canonical Base block number/hash and anchors all reads to that block. It must:

1. Verify public RPC and connected-wallet chain IDs are Base.
2. Verify connected account and live Loopers `owner()` equal the pinned sponsor.
3. Verify Loopers, Adapter8004, and Identity Registry proxy code, each proxy's EIP-1967 implementation address/code, ERC-6551 registry code, account implementation code, sponsor EIP-7702 designator/delegate/implementation, and EntryPoint v0.6 code against pinned hashes.
4. Verify live Loopers `erc6551Registry()`, `erc6551Implementation()`, and `erc6551Salt()` against the pinned tuple.
5. Verify `ownerOf(3802)` equals the pinned current holder.
6. Verify `tokenBoundAccount(3802)` and the registry's `account(...)` both equal the pinned deterministic account.
7. Require the account address to have no runtime code before submission. If correct code already exists, disable submission and run completed-account verification instead.
8. Verify the expected account has zero ETH for the pilot baseline; a nonzero balance blocks the pilot for review rather than risking an unnoticed pre-funding assumption.
9. Verify Loopers `erc8004BoundByLooper(3802) == true`, `erc8004AgentIdByLooper(3802) == 90994`, and `erc8004AgentURI(3802)` equals the pinned URI.
10. Verify Adapter8004 `identityRegistry()` equals the pinned Identity Registry; `bindingOf(90994)` decodes to standard enum `0`, the Loopers proxy, and token ID `3802`; and `isController(90994, holder) == true`.
11. Verify Identity Registry `ownerOf(90994)` equals the Adapter8004 proxy.
12. Verify sponsor `implementation()` and `entryPoint()` equal the pinned smart-wallet implementation and EntryPoint.
13. Construct and validate the exact five-key transaction object.
14. Run `eth_call` against the exact transaction at the anchored block and require the returned account address to equal the pinned account.
15. Run `eth_estimateGas`; at design time the direct call estimated `96,286` gas. Reject a missing result or an estimate above `150,000` gas.
16. Display the live fee estimate. The page never supplies or overrides wallet fee fields; the wallet presents final fees.

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
- `confirmed_attributed`: canonical receipt, exact-call attribution, and full post-state verification succeeded;
- `observed_unattributed`: the exact expected account deployment and every post-state invariant are canonical, but a transaction hash is unavailable, so the page does not claim which transaction deployed it;
- `reverted`: a canonical receipt proves failure;
- `uncertain`: transport failure, malformed/missing hash, reorg, or incomplete evidence;
- `superseded`: a hashless attempt was retained as history when the operator explicitly started one permitted retry.

Every persisted record carries schema version `1`, chain `8453`, token `3802`, and the pinned identity tuple. A record with invalid JSON, another schema/version/chain/token, impossible transition, missing required field, or mismatched pinned value is displayed as corrupt and blocks all writes. Terminal records remain visible until the operator acknowledges them; acknowledgment removes only `confirmed_attributed`, `observed_unattributed`, or `reverted` records.

Only explicit EIP-1193 rejection code `4001` clears `prepared` immediately. Other provider errors remain uncertain.

Account creation is deterministic and idempotent. For a pre-hash uncertain attempt, recovery first checks the expected account at a fresh canonical block:

- correct deployed code plus every receipt-block-independent account, holder, sponsor, ERC-6551, and ERC-8004 invariant transitions to `observed_unattributed` and permanently disables activation for token `3802`;
- no code before ten minutes from `createdAt` preserves `uncertain`, keeps writes locked, and exposes only `Resume verification`;
- unexpected code or partial/mismatched state preserves `uncertain` and fails closed for investigation;
- no code after ten minutes, a fresh complete preflight, unchanged zero balance, and no submitted hash may expose `Retry activation` with an explicit warning that a late original operation could still consume gas;
- retry requires a fresh user click and wallet confirmation, marks the old attempt `superseded`, links its ID into the new `prepared` record, and never runs automatically.

If an original operation lands before or after retry, deterministic `createAccount` remains state-idempotent: at most one account can exist at the pinned address. A retry that finds the account before provider invocation aborts and transitions to `observed_unattributed`. A retry receipt without an account-created event is not `confirmed_attributed`; if the exact account and all invariants are correct, it transitions to `observed_unattributed`, otherwise it stays `uncertain`. Duplicate gas spend is the only accepted retry risk; no duplicate account, asset movement, or authority change is possible.

This avoids relying on EOA nonce logic that is not authoritative for the sponsor's ERC-4337 smart-wallet path.

## Receipt and post-state verification

The page polls boundedly for the provider-returned transaction and receipt, displays a BaseScan link, and waits for three Base confirmations. It then requires the receipt block to remain canonical.

For a direct transaction, require:

- transaction hash and receipt hash equal the returned hash;
- `from`, `to`, input, value, and chain ID exactly match the approved transaction;
- receipt status is success.

For an ERC-4337-wrapped transaction, require:

- the mined transaction targets the pinned EntryPoint v0.6 with zero value, Base chain ID, and selector `handleOps` (`0x1fad948c`);
- decode the complete EntryPoint v0.6 `handleOps(UserOperation[],address)` calldata and reject malformed or trailing data;
- find exactly one user operation whose `sender` is the pinned sponsor, require empty `initCode`, and use pinned EntryPoint `getUserOpHash` at the canonical receipt block to calculate its user-operation hash;
- find exactly one successful `UserOperationEvent` with that calculated hash and pinned sponsor; reject duplicate sponsor operations or events;
- decode that user operation's `callData` against the pinned Coinbase Smart Wallet implementation ABI;
- accept only `execute(registry, 0, exactCreateAccountCalldata)` or `executeBatch([Call(registry, 0, exactCreateAccountCalldata)])` with exactly one call and no trailing data;
- reject `executeWithoutChainIdValidation`, any additional batch call, any nonzero inner value, alternate target, or alternate calldata;
- re-verify sponsor designator, delegate, sponsor-context implementation slot/code, `implementation()`, `entryPoint()`, and EntryPoint code at the receipt block;
- receipt status is success.

For both paths, `confirmed_attributed` requires exactly one matching `ERC6551AccountCreated` event from the pinned registry with:

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

Missing or conflicting evidence never claims attributed success. A canonical reverted receipt transitions to `reverted` only if the expected account remains undeployed at that canonical block; otherwise recovery uses `observed_unattributed` or stays uncertain. Reorgs, transient RPC failures, successful receipts with incomplete evidence, or unexpected state preserve the lock for resume and investigation.

## Security properties

- The sponsor pays gas but never becomes the token-bound account owner.
- The Looper holder controls the account through the pinned account implementation's ownership resolution.
- The transaction carries zero ETH and cannot move NFTs, ERC-20s, or ETH.
- The page cannot construct another call or activate another token.
- Existing ERC-8004 identity and controller state are read and verified, never written.
- No private key, seed phrase, API key, or signing credential enters the page or repository.
- Attributed success requires canonical receipt evidence and receipt-block state. `observed_unattributed` is a separate canonical state claim that explicitly makes no transaction-attribution claim.

## Testing

Focused tests must cover:

- standalone/noindex/no external executable script surface;
- all pinned chain, sponsor designator/delegate/implementation/EntryPoint, Loopers/Adapter/Identity Registry proxies and implementations, ERC-6551 registry/implementation/salt, token, holder, account, code hashes, event topics, selectors, calldata, and calldata hash values;
- exact five-key zero-value transaction allowlist and rejection of any altered or additional field;
- wrong wallet, wrong chain, Loopers owner drift, holder transfer, deterministic-address mismatch, configuration drift, sponsor delegation/implementation/EntryPoint drift, every proxy/implementation/code-hash drift, exact ERC-8004 URI/binding/controller/identity-owner drift, and RPC failure;
- active, inactive, unexpectedly funded, malformed-code, and wrong-code account states;
- block-anchored preflight, exact `eth_call` result, gas estimate, gas cap, post-simulation drift rejection, and wallet-generation races;
- double-click and account/chain-change handling;
- durable `prepared`, `submitted`, `confirmed_attributed`, `observed_unattributed`, `reverted`, `uncertain`, and `superseded` transitions across reloads, including corrupt, foreign-version, and impossible-transition records;
- explicit rejection versus ambiguous provider failure;
- direct and ERC-4337 receipt verification, including complete EntryPoint `handleOps` decoding, EntryPoint `getUserOpHash` correlation, exactly one expected sponsor `UserOperationEvent`, and exact sponsor `execute`/single-call `executeBatch` decoding;
- rejection of replayable execution, extra calls, bundled cross-attribution, duplicate sponsor operations/events, nonempty init code, alternate target/calldata, nonzero inner value, malformed ABI, and trailing data;
- exact matching `ERC6551AccountCreated` evidence and rejection of missing, duplicate, malformed, or mismatched logs;
- canonical confirmation/reorg behavior;
- receipt-block account bytecode, `token()`, `owner()`, `state()`, `isValidSigner()`, balance, Loopers holder, and ERC-8004 invariants;
- exact ten-minute hashless wait, non-write resume, explicit warned retry, supersession linkage, late-original races, retry receipts with no creation event, and idempotent recovery without EOA nonce assumptions;
- exact public and wallet RPC method allowlists;
- boundaries for pinned encoding, public RPC, snapshot validation, wallet invocation, attempt persistence, receipt verification, and page control;
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
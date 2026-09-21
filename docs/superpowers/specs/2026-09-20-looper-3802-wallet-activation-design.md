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

All bytecode hashes below are SHA-256 over the exact bytes returned by `eth_getCode` (the `0x` prefix is excluded). The values were re-verified read-only using the three-origin Base RPC allowlist at canonical block `51581194` (`0x313110a`), hash `0x2c3bcbd692401b6735fe410f7b9b78736c6850590f6b8f92133a8aa75e045397`, on 2026-09-21. These are runtime pinsets, not informational deployment notes: any later byte, slot, call-result, or address mismatch disables every write.

### Chain, Looper, and ERC-6551

- Chain: Base mainnet, chain ID `8453` (`0x2105`)
- Sponsor and required connected wallet: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Live Loopers proxy: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Loopers implementation: `0x68F22e3563891167D37C86391c4a83449c83e908`
- Pilot token ID: `3802`
- Required current holder: `0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4`
- Deterministic token-bound account: `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38`
- Required pre-activation account state: runtime code `0x` and ETH balance `0x0`
- Canonical ERC-6551 registry: `0x000000006551c19487814612e58FE06813775758`
- ERC-6551 account implementation: `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF`
- Salt: `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`
- `createAccount(address,bytes32,uint256,address,uint256)` selector: `0x8a54c52f`
- `ERC6551AccountCreated` topic: `0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722`
- Expected deployed Looper #3802 account runtime-code SHA-256: `0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a`

The sponsor is the current Loopers contract owner, but account creation is permissionless and the pinned ERC-6551 account resolves control from the current Looper holder. Paying gas does not grant the sponsor control.

### Adapter8004 and Identity Registry execution identities

- Existing ERC-8004 identity: `90994` (`0x16372`)
- Agent URI: `https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json`
- EIP-1967 implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

| Role | Address | Runtime bytes | Runtime SHA-256 | Raw EIP-1967 slot value |
|---|---|---:|---|---|
| Adapter8004 proxy | `0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27` | 163 | `0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017` | `0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9` |
| Adapter8004 implementation | `0x0f81bd4EDD4879734361A1A44460264CBf6F94c9` | 12,732 | `0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be` | n/a |
| Identity Registry proxy | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | 130 | `0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85` | `0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02` |
| Identity Registry implementation | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` | 14,474 | `0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1` | n/a |

The validator makes these exact block-anchored calls and compares both raw return bytes and strict ABI decoding:

```text
Adapter8004.identityRegistry()
  to:       0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27
  calldata: 0x134e18f4
  result:   0x0000000000000000000000008004a169fb4a3325136eb29fa0ceb6d2e539a432
  decode:   address 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432

Adapter8004.bindingOf(90994)
  to:       0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27
  calldata: 0x4d69ebc20000000000000000000000000000000000000000000000000000000000016372
  result:   0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda
  decode:   (uint8 standard,address tokenContract,uint256 tokenId) =
            (0,0x1649CD37f4748807b4882FC48765bA0B2aFfa94a,3802)

Adapter8004.isController(90994,0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4)
  to:       0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27
  calldata: 0x158e711d000000000000000000000000000000000000000000000000000000000001637200000000000000000000000017d7dfa154dc0828ade4115b9eb8a0a91c0fbde4
  result:   0x0000000000000000000000000000000000000000000000000000000000000001
  decode:   true

IdentityRegistry.ownerOf(90994)
  to:       0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
  calldata: 0x6352211e0000000000000000000000000000000000000000000000000000000000016372
  result:   0x000000000000000000000000270d25d2c59a8bca1b0f40ad95ff7806c0025c27
  decode:   address 0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27
```

The call target must be the proxy, never the implementation. The raw slot word must equal the pinned word; its low 20 bytes must equal the pinned implementation; proxy and implementation byte lengths and hashes must all match. A zero slot, noncanonical high bytes, upgraded implementation, changed proxy shell, call revert, malformed return, trailing return data, or decoded mismatch fails closed. The same checks run at preflight and the canonical receipt block.

### EIP-7702 sponsor execution identity

- `eth_getCode(sponsor)` must equal the exact 23-byte designator `0xef01007702cb554e6bfb442cb743a7df23154544a7176c`; bytes `0xef0100` are the designator prefix and the final 20 bytes decode to delegate `0x7702cb554e6bFb442cb743A7dF23154544a7176C`.
- Designator SHA-256: `0xe2b8058ebac7d6b7f1496596a6508894891adab1c1ef9712a4a5d50ff32e5267`
- Delegate runtime: 3,318 bytes at `0x7702cb554e6bFb442cb743A7dF23154544a7176C`; SHA-256 `0x97497b31483a21567c1c520851c6e8e65e6ce906dc9236843668a21c3cd691e3`
- Sponsor-context EIP-1967 raw slot: `0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72`
- Sponsor-context implementation: 18,002 bytes at `0x000100abaad02f1cfC8Bbe32bD5a564817339E72`; SHA-256 `0xa7dba5dc36ffc7d92796b2d17cd61f4e89d7ace44ff953def7e39e444c278bfa`
- EntryPoint v0.6: 23,689 bytes at `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`; SHA-256 `0x009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c`

The sponsor-context calls are exact:

```text
sponsor.implementation()
  to:       0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE
  calldata: 0x5c60da1b
  result:   0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72
  decode:   address 0x000100abaad02f1cfC8Bbe32bD5a564817339E72

sponsor.entryPoint()
  to:       0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE
  calldata: 0xb0d691fe
  result:   0x0000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d2789
  decode:   address 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
```

The page requires exact designator bytes, designator-derived delegate, delegate code, sponsor-context raw slot, implementation code, both call results, and EntryPoint code. It does not treat one check as a substitute for another. Any mismatch, upgrade, malformed return, or unavailable evidence disables submission and prevents attributed success.

### Remaining executable-code pinset

- Loopers proxy: 177 bytes; SHA-256 `0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`
- Loopers implementation raw EIP-1967 slot: `0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908`
- Loopers implementation: 23,210 bytes; SHA-256 `0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`
- ERC-6551 registry: 571 bytes; SHA-256 `0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56`
- ERC-6551 account implementation: 685 bytes; SHA-256 `0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5`
- `UserOperationEvent` topic: `0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f`
- EntryPoint v0.6 `handleOps` selector: `0x1fad948c`
- EntryPoint v0.6 `getUserOpHash` selector: `0xa6193531`
- Sponsor `execute` selector: `0xb61d27f6`
- Sponsor `executeBatch` selector: `0x34fcd5be`
- Forbidden replayable `executeWithoutChainIdValidation` selector: `0x2c2abd1e`
- Loopers identity selectors: `erc8004BoundByLooper(uint256)` = `0x5adbbdce`, `erc8004AgentIdByLooper(uint256)` = `0x4c4a2696`, and `erc8004AgentURI(uint256)` = `0xf195e791`

Every pin is mandatory. A proxy upgrade is not accepted merely because its interface still decodes; a code mismatch is not accepted because a slot still matches; and a successful call is not accepted from an unpinned target.

## Chosen approach

Build the pilot as a single-purpose static page modeled on the hardened Loopers owner tools. It uses public Base RPCs for reads and simulation, and an injected wallet only for connection, chain switching, and the single transaction request. It contains no private key, backend signer, external executable script, or mutable remote configuration.

The pilot sends `createAccount` directly to the ERC-6551 registry. Multicall3 and batching are intentionally absent from the pilot. Collection-wide inventory, batching, skip logic, fee controls, and receipts require a later design after the pilot is verified.

Rejected approaches:

1. Build the full batch system first: introduces unnecessary inventory, batching, recovery, and operational complexity before the production account path is proven.
2. Submit raw calldata manually: gives the operator less context and weaker pre/post verification.
3. Use the team Safe as sponsor: safer separation of duties but slower; the user chose the existing owner wallet for the pilot and collection rollout speed.

## Architecture boundaries

The only route is `/activate-looper-3802/`. The only browser storage key is `loopers.walletActivation.8453.3802.v1`; no cookie, IndexedDB, session-storage, alternate local-storage key, URL parameter, or remote configuration stores or overrides activation state.

Keep the implementation split into independently testable units even if the pilot ships as one static document:

1. **Pinset/encoding:** owns immutable addresses, raw slots, ABIs, selectors/topics, exact `createAccount` calldata and hashes, strict ABI encoders/decoders, and expected runtime code. It is pure and has no provider, storage, clock, or DOM access.
2. **Public RPC transport:** accepts only a typed request union from the controller, maps it to the exact origin/method/parameter allowlist below, performs failover and bounded polling, and returns raw JSON-RPC bytes. It never accesses `window.ethereum`, local storage, or ABI acceptance logic.
3. **Snapshot validator:** strictly decodes one block-anchored set of raw responses and either returns an immutable validated snapshot or one fail-closed error. It has no provider, storage, send, or DOM access.
4. **Wallet boundary:** wraps the injected provider and exposes only connect, chain check/switch, account read, and `sendPinnedActivation()`. That send method takes no transaction argument and constructs the exact five-key request internally from the pinset.
5. **Attempt store:** is the sole code allowed to access the one local-storage key. It validates the exact v1 schema and legal state graph, performs one atomic whole-record write per transition, and has no provider, ABI, wallet, or DOM access.
6. **Receipt/trace verifier:** strictly decodes transaction, receipt, EntryPoint v0.6, UserOperation, Coinbase Smart Wallet, registry-event, call-trace, and receipt-block snapshot evidence. It cannot fetch, persist, render, or submit.
7. **Controller/renderer:** owns the in-memory mutex, clock, wallet-generation counter, sequencing, and status text. It can call the six interfaces above but cannot call a provider or local storage directly, construct calldata, relax a validator, or accept user-supplied addresses/fields.

Only immutable validated outputs cross a boundary. Unknown object keys, ABI trailing bytes, unsupported variants, transport data passed directly to the wallet, or direct provider/storage access outside its owner unit are test failures and runtime fail-closed errors.

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
- a non-write `Resume verification` action for submitted or uncertain attempts;
- a strongly warned, one-time `Retry activation` action that appears only for an eligible original `uncertain_hashless` attempt.

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

Public JSON-RPC origins are exactly `https://mainnet.base.org`, `https://base.drpc.org`, and `https://base-rpc.publicnode.com`, with no credentials, query string, redirect target, runtime override, or user-supplied URL. Standard reads may fail over in that order. `debug_traceTransaction` routes only to `https://base.drpc.org`; the other two were verified not to expose it. Trace unavailability never weakens attribution.

The public method allowlist is exactly:

- normal reads: `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getStorageAt`, `eth_getBalance`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`;
- wrapped-receipt proof only: `debug_traceTransaction`, with parameters exactly `[transactionHash,{"tracer":"callTracer","timeout":"20s","tracerConfig":{"onlyTopCall":false,"withLog":true}}]`.

The injected wallet-provider allowlist is exactly `eth_chainId`, `eth_accounts`, `eth_requestAccounts`, `wallet_switchEthereumChain`, and `eth_sendTransaction`. The wallet boundary rejects every other method before provider invocation. Public RPC never sends; the wallet provider never supplies validation or receipt evidence.

Before enabling activation, obtain a canonical Base block number/hash, re-fetch that number to prove the hash is still canonical, and anchor state reads with EIP-1898 `{blockHash, requireCanonical: true}` where supported. A provider that lacks EIP-1898 may be used only after `eth_getBlockByNumber` immediately before and after the read batch returns the same pinned number/hash. Mixed-block or mixed-hash snapshots are invalid.

The snapshot must:

1. Verify public RPC and connected-wallet chain IDs are `0x2105`.
2. Verify connected account and live Loopers `owner()` equal the pinned sponsor.
3. Verify exact code bytes/length/hash and raw implementation-slot words for Loopers, Adapter8004, Identity Registry, sponsor designator/delegate/implementation, ERC-6551 registry/implementation, and EntryPoint as pinned above.
4. Verify live Loopers `erc6551Registry()`, `erc6551Implementation()`, and `erc6551Salt()` against the pinned tuple.
5. Verify `ownerOf(3802)` equals the pinned holder.
6. Verify `tokenBoundAccount(3802)` and registry `account(...)` both equal the pinned deterministic account.
7. Require account code `0x` and balance `0x0` before a send. Correct deployed code disables sending and enters completed-account verification; nonzero balance, malformed code, or wrong code blocks for investigation.
8. Verify Loopers `erc8004BoundByLooper(3802) == true`, `erc8004AgentIdByLooper(3802) == 90994`, and `erc8004AgentURI(3802)` equals the pinned URI.
9. Execute the four exact Adapter/Identity calls above and require the exact raw and decoded results.
10. Execute the two exact sponsor calls above and require the exact raw and decoded results.
11. Construct and validate the exact five-key transaction object.
12. Run `eth_call` against that transaction at the anchored block and require the sole 32-byte result to decode to the pinned account with no trailing data.
13. Run `eth_estimateGas`; at design time the direct call estimated `96,286` gas. Reject a missing result or an estimate above `150,000`.
14. Display `estimateGas * gasPrice` as a nonbinding estimate. Never add or override wallet fee fields.

On activation click, run the complete anchored preflight, simulation, and gas check again, then acquire a second fresh canonical block and repeat the complete snapshot. Any drift blocks sending. `accountsChanged` or `chainChanged` increments the wallet-generation counter, invalidates readiness, and leaves durable attempts locked for recovery. The in-memory mutex covers preflight through the durable provider outcome and blocks concurrent sends.

## Durable attempt and recovery

The local-storage value has this exact logical schema. JSON numbers are safe nonnegative integers; quantities and hashes are lowercase `0x` hex; addresses are checksum-normalized when displayed but lowercase in persisted comparison form. Unknown or missing keys are invalid.

```text
StoreV1 {
  schema: "loopers.walletActivation",
  version: 1,
  chainId: 8453,
  tokenId: "3802",
  activeAttemptId: UUID,                       // names the sole nonsuperseded attempt
  attempts: AttemptV1[1..2]                    // oldest first; two only after the single retry
}
AttemptV1 {
  id: UUID, retryOrdinal: 0 | 1,
  state: "prepared" | "submitted" | "uncertain_hashless" | "uncertain_hashed" |
         "confirmed_attributed" | "observed_unattributed" | "reverted" |
         "superseded" | "retry_cancelled",
  createdAtMs: integer, updatedAtMs: integer, waitUntilMs: integer, // createdAtMs + 600000
  walletGeneration: integer,
  supersedesId: UUID | null, supersededById: UUID | null,
  txHash: bytes32 | null,
  receipt: null | {
    blockNumber, blockHash, discoveredAtMs: integer,
    confirmationDeadlineMs: integer             // discoveredAtMs + 120000
  },
  observation: null | { blockNumber, blockHash, observedAtMs: integer },
  pinset: {
    sponsor, holder, account, loopers, registry, accountImplementation, salt,
    adapter, identityRegistry, identityId: "90994", sponsorDelegate,
    sponsorImplementation, entryPoint, calldataHash
  },
  transaction: { chainId: "0x2105", from, to, data, value: "0x0" },
  preflight: {
    blockNumber, blockHash, estimatedGas, gasPrice,
    accountCode: "0x", accountBalance: "0x0",
    loopersImplementationSlot, adapterImplementationSlot, identityImplementationSlot,
    sponsorDesignator, sponsorImplementationSlot,
    adapterIdentityRegistryResult, adapterBindingResult,
    adapterControllerResult, identityOwnerResult,
    sponsorImplementationResult, sponsorEntryPointResult,
    simulationResult
  },
  history: TransitionV1[1..12]
}
TransitionV1 { from: State | null, to: State, atMs: integer, reason: Reason }
State = the exact nine-value AttemptV1 state enum above
Reason = "activate" | "provider_hash" | "provider_rejected_retry" |
         "provider_ambiguous" | "reload_prepared" | "pre_send_observed" |
         "pre_send_inconclusive" | "receipt_attributed" |
         "state_observed_unattributed" | "receipt_reverted" |
         "receipt_timeout" | "confirmation_timeout" | "reorg" |
         "evidence_incomplete" | "retry_superseded"
```

Every `pinset`, `transaction`, and fixed raw `preflight` value must equal this specification; dynamic quantities must be canonical and internally consistent. `history[0]` must be `null -> prepared`; every later pair must be contiguous and legal below. `receipt` is required from the instant a receipt is found for any receipt-derived terminal state; `observation` is required for `observed_unattributed`, including when `txHash == null`. Other states use `null` unless evidence has already been discovered and retained. Invalid JSON, wrong schema/version/chain/token, more than two attempts, duplicate IDs, bad UUID/hash/quantity, unknown key, mismatched pin, impossible edge, broken supersession link, impossible receipt/observation combination, or an `activeAttemptId` that does not name the sole nonsuperseded attempt is **corrupt**. Corrupt storage is displayed, never auto-repaired or deleted, and blocks writes until the operator clears this site's browser data outside the page.

Immediately before `eth_sendTransaction`, write `prepared` synchronously and read it back byte-for-byte. Invoke the wallet on the next statement with no intervening `await`. If persistence or read-back fails, do not invoke the wallet. Persist a returned syntactically valid hash as `submitted` before starting any receipt request.

The complete state graph is:

- no record -> `prepared` on an explicit Activate click after fresh readiness;
- `prepared` -> `submitted` on a valid provider hash;
- original `prepared` -> no record only for explicit EIP-1193 rejection code `4001` in the same page lifetime;
- retry `prepared` -> `retry_cancelled` for explicit code `4001`; this durable state records that the single retry was consumed and remains write-locked;
- any `prepared` -> `uncertain_hashless` for every other provider error, malformed/missing hash, unload/reload, or wallet-generation race before a valid hash is returned; once a valid hash exists it must be persisted and cannot be discarded because the wallet generation changed;
- retry `prepared` -> `observed_unattributed` when the final pre-send check finds the correct deployed account and complete canonical state, or -> `uncertain_hashless` when that check is unavailable, conflicting, or finds unexpected state; neither edge invokes the wallet;
- `submitted` -> `confirmed_attributed`, `observed_unattributed`, `reverted`, or `uncertain_hashed` after receipt/recovery evaluation;
- `uncertain_hashed` -> `confirmed_attributed`, `observed_unattributed`, or `reverted` when later evidence becomes complete; it never becomes retry-eligible;
- `uncertain_hashless` -> `observed_unattributed` when complete canonical account state is observed;
- original `uncertain_hashless` -> `superseded` atomically with creation of retry `prepared` after all retry gates pass;
- `retryOrdinal == 1`, `retry_cancelled`, and retry `uncertain_hashless` can never be superseded, acknowledged away, or retried;
- terminal `confirmed_attributed`, `observed_unattributed`, or `reverted` -> no record only on explicit acknowledgment. Acknowledging `reverted` permits a later fresh Activate only because a canonical failure and undeployed account were proven; acknowledging either success state does not re-enable activation because live deployed-account preflight still blocks it.

`observed_unattributed` permits `txHash == null` and is the required hashless-observed state. Its required `observation` block anchors the exact canonical state used for the claim. It asserts only that the deterministic account and every receipt-independent invariant are canonical; it never attributes creation to an attempt. `superseded` is history-only and does not unlock writes while its linked retry is active. `retry_cancelled` is terminal and write-locked with no page control other than non-write inspection.

### Exact waits, controls, and locks

- After a valid hash, poll transaction and receipt every 2 seconds for 120 seconds, then every 10 seconds until 600 seconds after `createdAtMs`; no overlapping requests. After the deadline, query all three origins once; absence/incomplete evidence becomes `uncertain_hashed`.
- On finding a receipt, persist `receipt.blockNumber`, `receipt.blockHash`, `discoveredAtMs`, and `confirmationDeadlineMs = discoveredAtMs + 120000` before waiting. Poll the canonical head every 2 seconds only until that persisted deadline. Three confirmations means `head.number >= receipt.blockNumber + 2`; then re-fetch `receipt.blockNumber` and require its hash to equal `receipt.blockHash`. At the deadline make one final check; underconfirmation, timeout, or reorg becomes `uncertain_hashed` without resetting the deadline.
- `Resume verification` never writes onchain. It performs one immediate full recovery pass; if a known-hash attempt has no receipt and remains before its 600-second deadline, it resumes only that unused receipt-search time. If a persisted receipt remains before its confirmation deadline, it resumes only that unused confirmation time. At or after either applicable deadline it performs one pass and stops; an underconfirmed receipt remains `uncertain_hashed`.
- A hashless attempt remains write-locked before `waitUntilMs == createdAtMs + 600000`. At or after that exact instant, `Retry activation` appears only when `retryOrdinal == 0`, `txHash == null`, all three RPCs return Base chain ID, and they agree on one canonical block: read each latest height, choose the minimum, then require all three to return the same non-null hash for that exact height. Account code/balance must remain `0x`/`0x0` there and a new complete preflight/simulation must pass.
- Retry is one-time, explicit, and warned. On click, run another fresh complete snapshot. If the account already exists, transition the original to `observed_unattributed`, persist its observation block, and do not create a retry. Otherwise atomically mark it `superseded`, create the linked `retryOrdinal: 1` `prepared` attempt, and persist/read back. Then perform one final anchored account check: correct deployed account plus complete state -> retry `observed_unattributed`; unavailable/conflicting/unexpected evidence -> retry `uncertain_hashless`; only exact undeployed code/balance and unchanged pins proceed immediately to wallet invocation. A deployment in the remaining check-to-send race may waste retry gas but cannot create a second account.
- `Activate` is enabled only with no active record and an undeployed, fully valid snapshot. `Resume verification` is the only action for `submitted` or either uncertain state. `Retry activation` follows the gates above. All active, corrupt, success, and superseded-linked states hold the write lock. `reverted` holds it until acknowledgment.

If the late original lands before or after retry, deterministic `createAccount` allows only the pinned account. A retry receipt without a registry creation event, or a successful wrapped receipt lacking trace attribution, may become `observed_unattributed` only after full canonical account/post-state verification; otherwise it remains `uncertain_hashed`. Duplicate gas is the sole accepted race cost. No EOA nonce assumption is used for this ERC-4337 wallet.

## Receipt and post-state verification

Direct and wrapped verification begins only after the bounded receipt/confirmation rule above and uses the canonical receipt block for every state read. The transaction hash, transaction result, receipt hash, and requested hash must be identical; the receipt must have status success unless evaluating the explicit reverted branch.

For a direct transaction, require Base chain ID, `from`, `to`, input, and value to equal the exact five-key request. Because the top-level call itself is the one pinned registry call, exactly one matching registry event in that receipt is attributable to it.

For an ERC-4337-wrapped transaction:

1. Require top-level `to == EntryPoint`, value zero, Base chain ID, selector `0x1fad948c`, and strict full decoding as `handleOps(UserOperation[],address)` with no missing or trailing byte.
2. Decode every v0.6 `UserOperation` field. Require exactly one operation with `sender == sponsor`; require its `initCode == 0x`. Other senders may exist but can never satisfy attribution for this pilot.
3. Compute the selected operation's v0.6 userOpHash locally from all decoded fields, EntryPoint, and chain ID. Encode the same tuple with selector `0xa6193531`, call pinned EntryPoint `getUserOpHash(UserOperation)` at the canonical receipt block, and require the sole bytes32 result to equal the local hash.
4. Require exactly one EntryPoint `UserOperationEvent` whose indexed `userOpHash` and `sender` equal the selected operation, whose nonce equals the decoded nonce, and whose `success` is true. Duplicate sponsor operations, duplicate matching events, hash/nonce mismatch, or a failed event fails attribution.
5. Strictly decode only that selected operation's `callData` against the pinned smart-wallet ABI. Accept only `execute(registry,0,exactCreateAccountCalldata)` or `executeBatch([Call(registry,0,exactCreateAccountCalldata)])`. The array length must be one; target, value, and data must be exact; trailing data is forbidden. Reject `executeWithoutChainIdValidation`, alternate selectors, extra calls, and nonzero value.
6. Re-verify the complete sponsor designator/delegate/slot/implementation/call-result/EntryPoint pinset at the receipt block.
7. Fetch the fixed `callTracer` proof through the trace-only RPC route. Require the root to match the same transaction and EntryPoint input. Find exactly one successful EntryPoint-to-sponsor execution frame whose input equals the selected operation's complete `callData` and value is zero. Within that frame, permit only zero-value delegation plumbing through the pinned delegate/implementation before exactly one successful `CALL` to the pinned registry with the exact `createAccount` calldata and zero value; reject any additional wallet-envelope external call, create, target, data, or value.
8. Require the matching `ERC6551AccountCreated` log to appear in that exact registry call frame's `logs`, and require its address, topics, data, and trace `index` (normalized as a quantity) to equal the same receipt log and `logIndex`. The pinned registry code governs descendants of that frame; any second matching frame or event fails attribution.

Receipt logs alone do not identify which internal call emitted them in a multi-operation bundle. Therefore `confirmed_attributed` for a wrapped transaction **requires** the per-call trace with `withLog: true`; userOpHash and receipt-event correlation alone are insufficient. If the trace RPC is unavailable, omits per-frame logs, returns a different transaction shape, or cannot establish the exact frame ancestry, the page fails closed to `observed_unattributed` only when full canonical deployed-account state is independently proven; otherwise it remains `uncertain_hashed`. It never claims wrapped attribution from receipt position or log ordering.

For direct or trace-proven wrapped paths, `confirmed_attributed` also requires exactly one registry-frame `ERC6551AccountCreated` event decoding to:

- account `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38`;
- implementation `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF`;
- the pinned salt;
- chain ID `8453`;
- token contract `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`;
- token ID `3802`.

At the canonical receipt block, re-run every identity, code, slot, configuration, ownership, deterministic-address, sponsor, and ERC-8004 invariant from preflight, but not the send-readiness requirements for undeployed account code or simulation/gas. Replace those pre-activation checks with the following post-state requirements:

- account runtime code is byte-for-byte the expected 173-byte proxy code and has the pinned token-specific SHA-256;
- `token()` returns exactly `(8453, Loopers proxy, 3802)`;
- `owner()` returns the current/pinned Looper holder;
- `state()` returns `0`;
- `isValidSigner(holder,0x)` returns `0x523e3260`;
- account ETH balance remains `0x0`;
- ERC-8004 identity `90994`, URI, adapter binding, registry ownership, and controller remain exact.

A canonical reverted receipt becomes `reverted` only when the account is still undeployed and every pin remains exact. If the account exists, full canonical state may produce `observed_unattributed`; partial, conflicting, reorged, or unavailable evidence preserves the appropriate uncertain lock. On reload, receipt-derived terminal states recheck the persisted receipt block/hash; `observed_unattributed` rechecks its required observation block/hash and reruns the post-state at that canonical block before being trusted.

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
- the exact v1 storage schema and every legal/illegal transition among `prepared`, `submitted`, `uncertain_hashless`, `uncertain_hashed`, `confirmed_attributed`, `observed_unattributed`, `reverted`, `superseded`, and `retry_cancelled`, including receipt/observation anchors, persisted deadlines, reload normalization, corrupt records, and atomic supersession;
- explicit rejection versus ambiguous provider failure;
- direct and ERC-4337 receipt verification, including all-field `handleOps` decoding, local and onchain `getUserOpHash` equality, exactly one sponsor operation/event, exact sponsor `execute`/single-call `executeBatch` decoding, and fixed `callTracer` ancestry/log attribution;
- rejection of replayable execution, extra calls, bundled cross-attribution, duplicate sponsor operations/events, nonempty init code, alternate target/calldata, nonzero inner value, malformed ABI, trailing data, missing trace logs, wrong frame ancestry, and trace/receipt-log mismatch;
- exact matching `ERC6551AccountCreated` evidence and rejection of missing, duplicate, malformed, or mismatched logs;
- canonical confirmation/reorg behavior;
- receipt-block account bytecode, `token()`, `owner()`, `state()`, `isValidSigner()`, balance, Loopers holder, and ERC-8004 invariants;
- exact polling/confirmation bounds, ten-minute hashless wait, control visibility and write locks, one-time warned retry, supersession linkage, late-original races, retry receipts with no creation event, and recovery without EOA nonce assumptions;
- exact public RPC origins/routes/methods/trace parameters and exact wallet method allowlist;
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
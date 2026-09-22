# Permission-Ready Looper Account Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship and prove an immutable owner-only Looper ERC-6551 implementation with a disabled-by-default, registry-gated permission hook, without deploying or approving a production agent module.

**Architecture:** Add a direct immutable module registry that launches paused and empty, then bind the ERC-6551 account implementation to it through constructor-patched immutable runtime code. The account preserves direct owner execution and adds owner-selected policy hooks whose pre/post handshakes fail closed. Console/RPC surfaces expose policy status read-only; no keys, grants, deployment, or onchain writes are introduced.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin 4.x, ERC-6551 canonical proxies, ethers 6, solc-js, Ganache, Node test runner, viem, vanilla JS/CSS, Vite.

**Approved design:** `docs/superpowers/specs/2026-09-22-looper-permission-gated-tba-design.md` at `adab335`.

---

## Chunk 1: Onchain permission boundary

### Task 1: Immutable paused module registry

**Files:**
- Create: `packages/contracts/src/LooperAgentModuleRegistry.sol`
- Create: `packages/contracts/test/looper-agent-module-registry.test.mjs`

- [ ] **Step 1: Write failing registry surface and authorization tests**

Compile the production source plus fixtures for a dynamic-owner collection and inert module. Assert:

```js
assert.equal(await registry.globallyPaused(), true);
assert.equal(await registry.approvedModuleCodehash(module), ethers.ZeroHash);
await assert.rejects(registry.connect(stranger).approveModule(module, codehash));
await registry.connect(projectOwner).approveModule(module, codehash);
assert.equal(await registry.approvedModuleCodehash(module), codehash);
await collection.transferOwnership(nextOwner);
await assert.rejects(registry.connect(projectOwner).removeModule(module));
await registry.connect(nextOwner).removeModule(module);
```

Also cover zero collection, zero/EOA module, wrong expected codehash, pause/resume, removal, events, malformed `owner()` return data, reverted `owner()`, and absence of proxy/upgrade/delegatecall/admin execution surfaces.

- [ ] **Step 2: Run the registry test and verify RED**

Run: `node --test packages/contracts/test/looper-agent-module-registry.test.mjs`  
Expected: FAIL because `LooperAgentModuleRegistry.sol` does not exist.

- [ ] **Step 3: Implement the minimal registry**

Implement a constructor-pinned collection and exact surface:

```solidity
interface IProjectOwnedCollection { function owner() external view returns (address); }

contract LooperAgentModuleRegistry {
    address public immutable collection;
    bool public globallyPaused = true;
    mapping(address => bytes32) public approvedModuleCodehash;

    function setGlobalPause(bool paused) external;
    function approveModule(address module, bytes32 expectedCodehash) external;
    function removeModule(address module) external;
}
```

Use an exact 30,000-gas staticcall to `collection.owner()`, require exactly 32 bytes with a canonical nonzero address, compare to `msg.sender`, and emit `GlobalPauseChanged` and `ModuleApprovalChanged`. Approval requires deployed code and `extcodehash(module) == expectedCodehash`. Do not expose arbitrary calls, delegatecall, module selection, grant state, or spend authority.

- [ ] **Step 4: Run the registry test and verify GREEN**

Run: `node --test packages/contracts/test/looper-agent-module-registry.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit registry implementation**

```bash
git add packages/contracts/src/LooperAgentModuleRegistry.sol packages/contracts/test/looper-agent-module-registry.test.mjs
git commit -m "feat: add paused Looper module registry"
```

### Task 2: Registry-gated account policy hook

**Files:**
- Modify: `packages/contracts/src/LooperAgentAccount.sol`
- Modify: `packages/contracts/test/looper-agent-account.test.mjs`

- [ ] **Step 1: Extend fixtures and write failing policy tests**

Add fixture contracts implementing:

```solidity
interface ILooperAgentPolicy {
    function preAuthorizeAndConsume(address,address,uint256,address,uint256,bytes calldata) external returns (bytes4);
    function postValidate(address,address,uint256,address,uint256,bytes calldata,bytes calldata) external view returns (bytes4);
}
```

Create exact-good, wrong-magic, short-return, trailing-return, reverting, gas-burning, reentrant, and state-observing policies. Deploy the production module registry against `MockNFT`, approve only the exact-good mock, deploy `LooperAgentAccount(registry)`, and update canonical proxy creation.

Tests must prove:

- the account ABI adds `moduleRegistry`, `policyModule`, `policyModuleOwner`, `policyEpoch`, `setPolicyModule`, and `executeWithPolicy` only;
- standard `execute` remains owner-only and operation-zero-only;
- session keys remain invalid for EIP-1271 and ERC-6551 signer validation;
- only the current owner can set or clear a module;
- nonzero selection requires registry unpaused, approved exact codehash, and exact ERC-165 support;
- every successful set/clear/reselect increments `policyEpoch` and emits `PolicyModuleUpdated`;
- selection captures current owner;
- transfer disables policy execution before module/target calls;
- registry pause/removal and codehash mismatch disable execution;
- pre/post calls enforce exact 32-byte returns and exact magic;
- pre, target, and post reverts roll back policy accounting, target effects, and account state;
- reentrancy through owner and policy paths fails;
- target sees incremented account state and successful execution increments once;
- direct implementation, malformed proxy, wrong chain, burned token, and canonical-context tests remain green.

- [ ] **Step 2: Run the account test and verify RED**

Run: `node --test packages/contracts/test/looper-agent-account.test.mjs`  
Expected: FAIL on the new constructor/surface/policy assertions.

- [ ] **Step 3: Implement the exact account hook**

Add direct interfaces for the registry and policy. Constructor-pin the registry as an immutable after checking deployed code. Add:

```solidity
address public immutable moduleRegistry;
address public policyModule;
address public policyModuleOwner;
uint256 public policyEpoch;

function setPolicyModule(address module) external;
function executeWithPolicy(address to, uint256 value, bytes calldata data)
    external payable returns (bytes memory result);
```

Use one storage reentrancy guard shared by owner and policy execution. `setPolicyModule(0)` always clears. A nonzero module requires registry unpaused, exact pinned codehash, current `extcodehash`, and a 30,000-gas ERC-165 probe returning exactly ABI `true` for `type(ILooperAgentPolicy).interfaceId`.

For policy execution:

1. resolve current owner and require equality with `policyModuleOwner`;
2. recheck registry pause, approval, codehash, and interface;
3. call `preAuthorizeAndConsume` with 120,000 gas;
4. require exactly 32 return bytes and pre-selector magic;
5. increment/emit account state;
6. call target normally with no delegatecall;
7. staticcall `postValidate` with 60,000 gas;
8. require exactly 32 return bytes and post-selector magic;
9. bubble target/module revert bytes exactly where possible; otherwise use a typed fail-closed error.

Do not alter `owner()`, token context validation, EIP-1271, signer validation, or receive semantics beyond the shared reentrancy requirement.

- [ ] **Step 4: Run account and registry tests and verify GREEN**

Run:

```bash
node --test packages/contracts/test/looper-agent-account.test.mjs packages/contracts/test/looper-agent-module-registry.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit account hook**

```bash
git add packages/contracts/src/LooperAgentAccount.sol packages/contracts/test/looper-agent-account.test.mjs
git commit -m "feat: gate Looper account policy execution"
```

## Chunk 2: Deterministic release tooling

### Task 3: Two-contract deterministic preview

**Files:**
- Modify: `packages/contracts/scripts/deploy-looper-agent-account.js`
- Modify: `packages/contracts/test/looper-agent-account-deployment.test.mjs`
- Regenerate later only: `packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json`

- [ ] **Step 1: Write failing deterministic bundle tests**

Change compiler expectations from one artifact to `{ registry, account }`. Assert deterministic ABI/creation/runtime/hash output for both sources. Build a preview with deployer nonce `N` and prove:

```js
const registry = ethers.getCreateAddress({ from: DEPLOYER, nonce: N });
const account = ethers.getCreateAddress({ from: DEPLOYER, nonce: N + 1 });
```

Assert transaction 1 deploys `LooperAgentModuleRegistry(LOOPERS_COLLECTION)`, transaction 2 deploys `LooperAgentAccount(registry)`, and the separate owner config transaction points Loopers to the account implementation. Assert the registry expected runtime is patched with the collection immutable and the account expected runtime is patched separately with the implementation self-address and registry immutable. Reject overlapping/unknown immutable references.

- [ ] **Step 2: Run deployment tests and verify RED**

Run: `node --test packages/contracts/test/looper-agent-account-deployment.test.mjs`  
Expected: FAIL because the script only compiles/previews one contract.

- [ ] **Step 3: Implement deterministic bundle compilation**

Compile both production sources in one exact solc input. Include AST output, walk state-variable declarations, and map immutable declaration IDs to `collection`, `_implementation`, and `moduleRegistry`. Preserve per-immutable reference groups instead of replacing every immutable with one address.

Encode constructor arguments with `ethers.Interface`/`AbiCoder`; creation transaction data is bytecode concatenated with exact constructor encoding. Emit schema `2.0.0` with:

```js
{
  registryDeployment: { expectedAddress, expectedRuntimeBytecode, transaction },
  accountDeployment: { expectedAddress, expectedRuntimeBytecode, transaction },
  configUpdate: { expected, transaction }
}
```

`--artifact-only` emits the deterministic bundle without pretending constructor-patched runtime is final. `--preview` requires deployer, owner, and canonical decimal nonce. No private key, signer, RPC write, or broadcast path is added.

- [ ] **Step 4: Run deployment and contract tests and verify GREEN**

Run:

```bash
node --test packages/contracts/test/looper-agent-account-deployment.test.mjs
pnpm --filter @helixa/loopers-contracts test
```

Expected: PASS.

- [ ] **Step 5: Commit tooling**

```bash
git add packages/contracts/scripts/deploy-looper-agent-account.js packages/contracts/test/looper-agent-account-deployment.test.mjs
git commit -m "feat: preview paused Looper permission release"
```

## Chunk 3: Console and agent read-only evidence

### Task 4: Read and classify registry/policy state

**Files:**
- Modify: `apps/web/src/looper-agent-wallet.js`
- Modify: `apps/web/src/looper-agent-wallet-rpc.js`
- Modify: `apps/web/src/looper-agent-wallet-controller.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/test/looper-agent-wallet.test.mjs`
- Modify: `apps/web/test/looper-agent-wallet-rpc.test.mjs`
- Modify: `apps/web/test/looper-agent-wallet-controller.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`

- [ ] **Step 1: Write failing status/read tests**

Add ABI/constants for the account policy getters and registry read getters. Extend dual-origin fixtures and assert canonical snapshots contain:

```js
{
  moduleRegistry,
  registryPaused,
  policyModule,
  policyModuleOwner,
  policyEpoch,
  policyModuleApproved,
  policyModuleCodehashMatches
}
```

Require both RPC origins to agree at the same block anchor. Controller tests must classify owner-only, permission-hook-paused, module-blocked, ownership-mismatch, and active-policy states without enabling agent writes. Console tests must render the approved Multipass-styled status pill and details; no grant/key controls may exist.

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
node --test apps/web/test/looper-agent-wallet.test.mjs apps/web/test/looper-agent-wallet-rpc.test.mjs apps/web/test/looper-agent-wallet-controller.test.mjs apps/web/test/multipass-console.test.mjs
```

Expected: FAIL on missing policy fields/statuses.

- [ ] **Step 3: Implement fail-closed policy reads**

Read policy evidence only when the selected implementation matches the reviewed release and its runtime hash. Use exact ABI decoding and treat missing/malformed/disagreeing evidence as wallet-only blocked/read-only state. Do not fall back to latest-block mixing or single-origin evidence. Keep `createLooperAgentWalletController` owner-signing paths limited to activation and standard owner `execute`; do not add `executeWithPolicy` submission or any key material.

Update compact wallet copy to use `Owner controlled`, `Permission hook paused`, `Policy blocked`, or `Read-only`, preserving the Multipass styling already committed in `32145d4` and `323ee02`.

- [ ] **Step 4: Run focused web tests and verify GREEN**

Run the same four test files. Expected: PASS.

- [ ] **Step 5: Commit Console/RPC changes**

```bash
git add apps/web/src apps/web/test
git commit -m "feat: surface Looper permission status"
```

### Task 5: Extend safe agent wallet context

**Files:**
- Locate and modify the existing API wallet-context adapter under `apps/api/src/`
- Modify its matching test under `apps/api/test/`

- [ ] **Step 1: Locate the exact adapter and write failing context tests**

Run:

```bash
grep -RIn "nativeWei\|accountRuntimeSha256\|looperAgentWallet" apps/api/src apps/api/test
```

In the matching existing test, assert the agent context includes only canonical account, activation/owner status, balances, state, policy module, registry pause, approval, module-owner match, and policy epoch. Assert it excludes key material, signatures, grant calldata, private attempts, provider objects, and submit methods.

- [ ] **Step 2: Run the exact API test and verify RED**

Run the discovered `node --test apps/api/test/<exact-file>.test.mjs`.  
Expected: FAIL on missing policy evidence.

- [ ] **Step 3: Implement minimal read-only context fields**

Map only already-normalized wallet snapshot fields. Do not pass callbacks or raw RPC responses. Any contradictory evidence sets `canTransact: false` and an explicit reason.

- [ ] **Step 4: Run the exact API test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit agent context changes**

```bash
git add apps/api/src apps/api/test
git commit -m "feat: expose read-only Looper policy context"
```

## Chunk 4: Release verification without deployment

### Task 6: Regenerate unsigned artifacts and run all gates

**Files:**
- Regenerate: `packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json`
- Modify only if required by tested schema: related fixture/docs references

- [ ] **Step 1: Run local deterministic artifact generation**

Use a deliberately labeled preview nonce only after a fresh read-only Base preflight has confirmed deployer nonce and empty predicted addresses across both approved RPC origins. Do not broadcast. Regenerate the unsigned schema-2 artifact with the exact reviewed deployer, owner, and nonce.

- [ ] **Step 2: Prove artifact freshness**

Re-run generation to a temporary path and byte-compare normalized JSON with the tracked artifact. Assert both predicted addresses, constructor args, runtime hashes, transaction nonces, zero values, chain ID, and config calldata.

- [ ] **Step 3: Run focused and full verification**

```bash
pnpm --filter @helixa/loopers-contracts test
node --test apps/web/test/looper-agent-wallet.test.mjs apps/web/test/looper-agent-wallet-rpc.test.mjs apps/web/test/looper-agent-wallet-controller.test.mjs apps/web/test/multipass-console.test.mjs
pnpm test
pnpm web:build
git diff --check
```

Expected: all pass. Build warnings already present in third-party bundles are recorded but no new errors are accepted.

- [ ] **Step 4: Perform two-origin read-only preflight**

Verify Base chain ID, deployer nonce, no code at predicted registry/account addresses, current Loopers owner, current ERC-6551 registry/implementation/salt, and legacy-account inventory through both approved RPC origins. Require exact agreement at a common block anchor.

- [ ] **Step 5: Run independent code and release review**

Dispatch one code reviewer for contract/registry security and one release reviewer for artifact/UI fail-closed behavior. Fix every material finding and rerun affected gates.

- [ ] **Step 6: Commit the unsigned release artifact**

```bash
git add packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json
git commit -m "chore: stage paused Looper permission release"
```

Stop here. Deployment and `setERC6551Config` remain separate irreversible actions requiring fresh explicit approval with exact transaction previews.

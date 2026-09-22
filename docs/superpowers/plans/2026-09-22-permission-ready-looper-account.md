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
- the pre hook receives the original external caller as `sessionKey`, the module sees the TBA as `msg.sender`, and the hook receives the exact current owner, policy epoch, target, value, and calldata;
- the post hook receives those same exact fields plus byte-for-byte target return data;
- pre-hook, target, and post-hook custom revert bytes are bubbled exactly;
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

Deploy both generated creation transactions into a fresh local Ganache chain from the same deployer/nonce pair and compare `eth_getCode` at both predicted addresses byte-for-byte with the independently patched expected runtimes. This local execution proof is mandatory and must fail for missing, duplicate, out-of-range, wrong-length, or misidentified immutable reference groups.

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
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/looper-agent-wallet.test.mjs`
- Modify: `apps/web/test/looper-agent-wallet-rpc.test.mjs`
- Modify: `apps/web/test/looper-agent-wallet-controller.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write failing status/read tests**

Add ABI/constants for the account policy getters and registry read getters. Extend dual-origin fixtures and assert canonical snapshots contain:

```js
{
  moduleRegistry,
  implementationRuntimeSha256,
  moduleRegistryRuntimeSha256,
  registryPaused,
  policyModule,
  policyModuleOwner,
  policyEpoch,
  policyModuleApproved,
  policyModuleCodehashMatches
}
```

Require both RPC origins to fetch and agree on implementation code/hash and module-registry code/hash at the same block anchor; `accountRuntimeSha256` remains explicitly the 173-byte proxy hash and cannot substitute for implementation evidence. Controller tests must classify owner-only, permission-hook-paused, module-blocked, ownership-mismatch, and active-policy states without enabling agent writes. Console tests must render the approved Multipass-styled status pill and details; no grant/key controls may exist. App-level RED tests must cover clear/change transaction previews, explicit confirmation, immediate pre-sign drift rejection, and successful clearing while the registry is paused, the selected module is removed, or its codehash mismatches.

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
node --test apps/web/test/looper-agent-wallet.test.mjs apps/web/test/looper-agent-wallet-rpc.test.mjs apps/web/test/looper-agent-wallet-controller.test.mjs apps/web/test/multipass-console.test.mjs
```

Expected: FAIL on missing policy fields/statuses.

- [ ] **Step 3: Implement fail-closed policy reads**

Read policy evidence only when the selected implementation address and fetched implementation runtime hash match the reviewed release. Independently verify the immutable registry address, fetched registry runtime hash, and selected module runtime hash. Use exact ABI decoding and treat missing/malformed/disagreeing evidence as wallet-only blocked/read-only state. Do not fall back to latest-block mixing or single-origin evidence.

Keep `createLooperAgentWalletController` owner-signing paths limited to activation, standard owner `execute`, and the required owner recovery control `setPolicyModule`. Add exact clear/change previews only after a fresh same-block dual-origin check of owner, chain, canonical account, implementation/runtime, registry/runtime, registry pause, selected policy, policy owner, policy epoch, approval, and module codehash. Clearing uses `setPolicyModule(address(0))`; changing requires explicit owner confirmation and an approved exact-codehash module. Do not add `executeWithPolicy` submission, grants, or any key material.

Update compact wallet copy to use `Owner controlled`, `Permission hook paused`, `Policy blocked`, or `Read-only`, preserving the Multipass styling already committed in `32145d4` and `323ee02`.

- [ ] **Step 4: Run focused web tests and verify GREEN**

Run the same four test files. Expected: PASS.

- [ ] **Step 5: Commit Console/RPC changes**

```bash
git add apps/web/src/looper-agent-wallet.js apps/web/src/looper-agent-wallet-rpc.js apps/web/src/looper-agent-wallet-controller.js apps/web/src/multipass-console.js apps/web/src/app.js apps/web/test/looper-agent-wallet.test.mjs apps/web/test/looper-agent-wallet-rpc.test.mjs apps/web/test/looper-agent-wallet-controller.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
git commit -m "feat: surface Looper permission status"
```

### Task 5: Extend safe agent wallet context

**Files:**
- Modify: `apps/web/src/looper-agent-wallet-controller.js`
- Modify: `apps/web/src/console-agent-api.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/web/test/console-agent-api.test.mjs`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`

- [ ] **Step 1: Write failing context-producer and validator tests**

In `apps/web/test/console-agent-api.test.mjs` and `apps/api/test/console-agent-runtime.test.mjs`, assert the context produced by `createReadOnlyLooperWalletContext` and accepted by both validators includes only canonical account, activation/owner status, balances, state, implementation/runtime evidence, policy module, registry pause, approval, module-owner match, and policy epoch. Assert it excludes key material, signatures, grant calldata, private attempts, provider objects, and submit methods.

- [ ] **Step 2: Run the exact context tests and verify RED**

```bash
node --test apps/web/test/console-agent-api.test.mjs apps/api/test/console-agent-runtime.test.mjs
```

Expected: FAIL on missing policy evidence.

- [ ] **Step 3: Implement minimal read-only context fields**

Map only already-normalized wallet snapshot fields in `createReadOnlyLooperWalletContext`. Extend both the browser sender validator and API receiver validator with the exact same allowlisted plain-JSON shape. Do not pass callbacks or raw RPC responses. Any contradictory evidence sets `canTransact: false` and an explicit reason.

- [ ] **Step 4: Run the exact context tests and verify GREEN**

Run the same two exact test files. Expected: PASS.

- [ ] **Step 5: Commit agent context changes**

```bash
git add apps/web/src/looper-agent-wallet-controller.js apps/web/src/console-agent-api.js apps/api/src/index.js apps/web/test/console-agent-api.test.mjs apps/api/test/console-agent-runtime.test.mjs
git commit -m "feat: expose read-only Looper policy context"
```

## Chunk 4: Release verification without deployment

### Task 6: Regenerate unsigned artifacts and run all gates

**Files:**
- Regenerate: `packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json`
- Create: `packages/contracts/scripts/preflight-looper-agent-account.js`
- Create: `packages/contracts/test/looper-agent-account-preflight.test.mjs`
- Create: `packages/contracts/scripts/verify-looper-agent-account-release.js`
- Create: `packages/contracts/test/looper-agent-account-release.test.mjs`
- Modify after final prediction only: `apps/web/src/looper-agent-wallet.js`
- Modify after final prediction only: `apps/web/test/looper-agent-wallet.test.mjs`

- [ ] **Step 1: Implement and test an exact two-origin preflight command**

Create a read-only CLI with dependency-injected requester tests. It queries only `https://mainnet.base.org` and `https://base.drpc.org`, anchors read-only collection evidence to the lowest common block whose hashes agree, and at that exact block queries chain ID, current Loopers owner, current ERC-6551 registry/implementation/salt, and legacy account evidence. Separately query `eth_getTransactionCount(deployer, "pending")` from both origins immediately before predicting addresses, require exact agreement, then query code at both predicted registry/account addresses. It rejects origin disagreement, pending-nonce drift, missing results, noncanonical quantities/addresses, nonempty predicted addresses, or owner mismatch. The receipt contains canonical `owner` and decimal `pendingNonce` fields consumed directly by the preview CLI.

Run: `node --test packages/contracts/test/looper-agent-account-preflight.test.mjs`
Expected: PASS after observing RED before implementation.

- [ ] **Step 2: Run exact preflight and deterministic artifact generation**

```bash
node packages/contracts/scripts/preflight-looper-agent-account.js --deployer 0x339559A2d1CD15059365FC7bD36b3047BbA480E0 --output /tmp/looper-agent-preflight.json
node packages/contracts/scripts/deploy-looper-agent-account.js --preview --preflight /tmp/looper-agent-preflight.json --output packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json
```

The preview reads the owner and agreed pending nonce directly from the tested preflight receipt and verifies its deployer, chain, predicted addresses, and freshness. Neither command contains a signer or broadcast path.

- [ ] **Step 3: Prove artifact freshness and local runtime truth**

Implement a tested read-only release verifier that deploys both artifact creation transactions on fresh Ganache from the artifact's exact deployer/nonces and byte-compares actual `eth_getCode` with both expected runtimes. It also asserts predicted addresses, constructor args, runtime hashes, transaction nonces, zero values, chain ID, and config calldata.

Run the exact commands:

```bash
node packages/contracts/scripts/deploy-looper-agent-account.js --preview --preflight /tmp/looper-agent-preflight.json --output /tmp/looper-agent-account-base-mainnet.json
cmp packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json /tmp/looper-agent-account-base-mainnet.json
node packages/contracts/scripts/verify-looper-agent-account-release.js --artifact packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json
```

- [ ] **Step 4: Synchronize release constants from the final artifact**

Only now update `RELEASED_ACCOUNT_IMPLEMENTATION`, the implementation runtime SHA-256, the module-registry address/runtime SHA-256, and exact constant tests. Prove these values equal the tracked schema-2 artifact. No provisional nonce-derived value is accepted.

- [ ] **Step 5: Run focused and full verification**

```bash
pnpm --filter @helixa/loopers-contracts test
node --test packages/contracts/test/looper-agent-account-preflight.test.mjs packages/contracts/test/looper-agent-account-release.test.mjs
node --test apps/web/test/looper-agent-wallet.test.mjs apps/web/test/looper-agent-wallet-rpc.test.mjs apps/web/test/looper-agent-wallet-controller.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs
node --test apps/web/test/console-agent-api.test.mjs apps/api/test/console-agent-runtime.test.mjs
pnpm test
pnpm web:build
node --check packages/contracts/scripts/deploy-looper-agent-account.js
node --check packages/contracts/scripts/preflight-looper-agent-account.js
node --check packages/contracts/scripts/verify-looper-agent-account-release.js
node --check apps/web/src/looper-agent-wallet-rpc.js
node --check apps/web/src/looper-agent-wallet-controller.js
node --check apps/web/src/console-agent-api.js
node --check apps/api/src/index.js
git diff --check
git status --short
```

Expected: all pass. Build warnings already present in third-party bundles are recorded but no new errors are accepted. Status may contain only exact reviewed task paths and the pre-existing untracked owner-wallet plan; any other path blocks staging.

- [ ] **Step 6: Re-run two-origin preflight immediately before staging**

Repeat Step 2's preflight command and require the same chain, owner, nonce, block agreement, and empty predicted addresses. Any drift invalidates the tracked artifact and returns to Step 2.

- [ ] **Step 7: Run independent code and release review**

Dispatch one code reviewer for contract/registry security and one release reviewer for artifact/UI fail-closed behavior. Fix every material finding and rerun affected gates.

- [ ] **Step 8: Commit the unsigned release artifact and synchronized constants**

```bash
git add packages/contracts/deployment-prep/looper-agent-account-base-mainnet.json packages/contracts/scripts/preflight-looper-agent-account.js packages/contracts/test/looper-agent-account-preflight.test.mjs packages/contracts/scripts/verify-looper-agent-account-release.js packages/contracts/test/looper-agent-account-release.test.mjs apps/web/src/looper-agent-wallet.js apps/web/test/looper-agent-wallet.test.mjs
git commit -m "chore: stage paused Looper permission release"
```

- [ ] **Step 9: Prove clean tracked release state**

```bash
test -z "$(git status --porcelain --untracked-files=no)"
git status --short
```

The first command must succeed. The second may show only the pre-existing untracked owner-wallet plan; any tracked modification or additional untracked task artifact blocks completion.

Stop here. Deployment and `setERC6551Config` remain separate irreversible actions requiring fresh explicit approval with exact transaction previews.

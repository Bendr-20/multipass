# Looper Permission-Ready TBA Design

**Date:** 2026-09-22
**Status:** Revised after independent security review; implementation and deployment not yet approved
**Repository baseline:** `d525dcb`
**Chain:** Base mainnet (`8453`)
**Existing Loopers collection:** `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`

## 1. Decision

Keep the existing Loopers NFT contract, token supply, ownership, metadata, and collection address unchanged. Replace only its ERC-6551 account configuration after a separately reviewed release.

The new ERC-6551 implementation is an immutable owner-controlled wallet core with a disabled-by-default extension path for future constrained agent permissions. Every TBA launches owner-only. The current NFT owner remains root authority forever.

This release ships:

- the immutable account hook;
- an immutable module-approval registry controlled by the existing Loopers project owner;
- owner-only Console operation and read-only agent wallet context;
- tests proving the permission path with test-only modules.

This release does **not** approve a production policy module, create an agent key, or enable autonomous execution.

## 2. Why the production policy module is deferred

The existing Loopers ERC-721 exposes current `ownerOf(tokenId)` but no monotonic per-token transfer nonce. A TBA can therefore detect that ownership is currently different, but cannot distinguish:

1. owner A grants permission;
2. A transfers to B;
3. B transfers back to A without touching the TBA.

Without a transfer nonce, A's old owner-address-bound permission could match again after the round trip. An offchain indexer cannot be trusted for onchain spend authorization, and the ERC721C transfer-validator callback is declared `view`, so it cannot increment an onchain epoch.

Therefore the release remains owner-only and the production module registry remains empty and globally paused. Live agent grants require a separately reviewed monotonic ownership-epoch source. Acceptable future approaches include a collection upgrade that exposes a transfer nonce, a mandatory stateful transfer router, or a cryptographically verified ownership-history mechanism. None is silently introduced here.

This preserves the same future TBA address while refusing to ship a transfer-invalidation claim the unchanged collection cannot enforce.

## 3. Product progression

A Looper progresses through four explicit stages:

1. **Observe:** the agent reads public balances, assets, transaction evidence, ownership, and policy status.
2. **Propose:** the agent prepares a bounded action; the human owner reviews and signs.
3. **Constrained autonomy:** after the ownership-epoch problem is solved, the owner explicitly grants a protected session key narrow permissions through an approved immutable module.
4. **Expanded autonomy:** the owner deliberately increases scope or limits after reviewing the agent's performance and trust evidence.

No trust score automatically grants authority. Cred can establish eligibility only. Every grant requires a separate Looper-owner transaction.

## 4. Goals

- Preserve the existing Loopers collection unchanged.
- Make every newly configured ERC-6551 account executable by its current NFT owner.
- Keep the same new TBA address when an approved module is selected later.
- Let the owner clear a module instantly and return to owner-only operation.
- Prevent project governance from selecting modules for accounts or spending account funds.
- Keep agent session authority separate from EIP-1271 and ERC-6551 general signer validity.
- Fail closed on missing, stale, malformed, contradictory, unavailable, or unapproved evidence.
- Refuse production autonomous permissions until round-trip ownership invalidation is enforceable.

## 5. Non-goals

- Deploying a new Loopers NFT contract.
- Modifying Loopers transfer behavior in this release.
- Deploying or approving a production agent policy module in this release.
- Creating, funding, storing, displaying, or activating a live agent signing key.
- ERC-4337, paymasters, bundlers, sponsored gas, arbitrary DeFi calls, approvals, Permit, transferFrom, delegatecall, upgrades, or unrestricted plugins.
- Automatically migrating assets from legacy ERC-6551 addresses.
- Treating Cred, AgentDNA, or any offchain score as authorization by itself.

## 6. `LooperAgentModuleRegistry`

Deploy a direct, non-proxy, immutable-logic registry bound immutably to the existing Loopers collection.

Project-administration checks dynamically resolve the collection's current `owner()`. There is no second permanent project-admin key.

The registry exposes:

```solidity
function globallyPaused() external view returns (bool);
function approvedModuleCodehash(address module) external view returns (bytes32);
function setGlobalPause(bool paused) external;
function approveModule(address module, bytes32 expectedCodehash) external;
function removeModule(address module) external;
```

Rules:

- The registry deploys with `globallyPaused == true` and no approved modules.
- A module approval pins the module's current `extcodehash` exactly.
- Zero addresses, empty code, mismatched hashes, proxies, upgradeable modules, and unreviewed delegatecall behavior are rejected by the release process.
- The account checks both approval and current `extcodehash` on every policy execution.
- Removing a module or enabling global pause disables agent execution immediately.
- Registry actions cannot select a module for a TBA, create or alter a grant, call through a TBA, sign for a TBA, or move TBA assets.
- Resuming globally is a policy loosening and future production grants must require owner reconfirmation before execution resumes.

## 7. `LooperAgentAccount`

`LooperAgentAccount` remains the direct immutable implementation used by canonical ERC-6551 proxies. It preserves the proven canonical 173-byte proxy-context validation, dynamic NFT ownership, ERC-165, ERC-6551, EIP-1271 owner signatures, ETH receive, state counter, exact return data, exact revert bubbling, and operation-zero-only behavior at baseline `d525dcb`.

It adds:

```solidity
function policyModule() external view returns (address);
function policyModuleOwner() external view returns (address);
function policyEpoch() external view returns (uint256);
function setPolicyModule(address module) external;
function executeWithPolicy(address to, uint256 value, bytes calldata data)
    external
    payable
    returns (bytes memory result);
```

Rules:

- Standard `execute(address,uint256,bytes,uint8)` remains owner-only.
- `setPolicyModule` is owner-only.
- `address(0)` is always allowed and restores owner-only mode.
- A nonzero module must be approved by the immutable registry, have the pinned runtime codehash, and support the exact policy interface through ERC-165.
- Selecting a module captures the current NFT owner as `policyModuleOwner`.
- Every successful module change, including clearing and reselecting the same module, increments `policyEpoch` and emits `PolicyModuleUpdated`.
- `executeWithPolicy` requires: nonzero module; registry unpaused; module still approved; exact runtime codehash; current NFT owner equal to `policyModuleOwner`; supported interface; exact pre-authorization magic; and exact post-validation magic.
- When current ownership differs from `policyModuleOwner`, execution fails before calling the module or target.
- A reentrancy guard covers registry checks, module checks, target execution, post-validation, and state mutation.
- The account calls modules normally and never delegatecalls them.
- Owner and policy execution increment the same monotonic `state` exactly once on success.
- A target or post-validation revert rolls back spend accounting, target state, and account state.
- Direct implementation calls, malformed proxies, wrong-chain contexts, burned tokens, and noncanonical proxies remain inert.
- EIP-1271 and ERC-6551 `isValidSigner` remain owner-only. Session keys never become general-purpose account signers.

## 8. Exact module handshake

```solidity
interface ILooperAgentPolicy is IERC165 {
    function preAuthorizeAndConsume(
        address sessionKey,
        address owner,
        uint256 policyEpoch,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4);

    function postValidate(
        address sessionKey,
        address owner,
        uint256 policyEpoch,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata result
    ) external view returns (bytes4);
}
```

Constants:

```solidity
bytes4 constant PRE_AUTH_MAGIC = ILooperAgentPolicy.preAuthorizeAndConsume.selector;
bytes4 constant POST_AUTH_MAGIC = ILooperAgentPolicy.postValidate.selector;
bytes4 constant POLICY_INTERFACE_ID = type(ILooperAgentPolicy).interfaceId;
```

The account uses bounded low-level calls, requires exactly 32 return bytes, decodes the returned `bytes4`, and rejects wrong magic, trailing bytes, short returns, reverts, and gas exhaustion. `msg.sender` at each module call is the TBA. The session key is the original `executeWithPolicy` caller.

Release constants are fixed in code and tests:

- pre-authorization gas cap: `120_000`;
- post-validation gas cap: `60_000`;
- ERC-165 probe gas cap: `30_000`.

The target call receives remaining gas. A production module with larger requirements needs a new account release review rather than a silent limit change.

## 9. Release behavior

The production module registry is empty and paused. Therefore:

- owners can use standard account execution;
- no owner can select a production agent module;
- `executeWithPolicy` always fails closed;
- agents can observe and propose but cannot transact;
- the permission path can be tested with isolated test modules without enabling production authority.

No deployment, registry unpause, module approval, key creation, or grant occurs during implementation.

## 10. Future official policy requirements

A future `LooperAgentPolicy` must be a direct non-proxy contract with immutable logic and a pinned runtime hash. It is a separate design and deployment gate, but the following approved product requirements remain binding.

### 10.1 Ownership epoch

The module must consume a monotonic per-token ownership epoch that changes on every transfer, including A→B→A round trips. Current owner address alone is insufficient. Missing, stale, or contradictory epoch evidence denies execution.

### 10.2 Grant interface

V1 supports exactly one active session-key grant per TBA. Replacement revokes the previous grant atomically and increments a grant nonce.

```solidity
function setGrant(address account, GrantConfig calldata config) external;
function revokeGrant(address account) external;
function reconfirmGrant(address account, uint256 expectedLeniencyEpoch) external;
function grantOf(address account) external view returns (Grant memory);
```

For every mutation the module verifies:

- `msg.sender == account.owner()`;
- `account.policyModule() == address(this)`;
- current account policy epoch matches the supplied epoch;
- current monotonic ownership epoch matches the supplied epoch;
- account token context resolves to the existing Loopers collection and Base chain.

Grant fields include account, owner-at-grant, ownership epoch, policy epoch, grant nonce, session key, not-before, expiry, Cred requirement, recipient allowlist, asset allowlist, per-transaction limits, and UTC-day limits.

Revocation, replacement, expiry, ownership-epoch mismatch, module change, or policy loosening invalidates execution. Grant/revoke/reconfirm remain available while agent execution is globally paused so owners can recover.

Required events are `GrantSet`, `GrantRevoked`, `GrantReconfirmed`, `GrantConsumed`, `ProjectPolicyChanged`, and `GlobalPauseChanged` with indexed account and owner where applicable.

### 10.3 Cred

Cred remains optional policy, never immutable wallet logic.

The official module binds Cred to the Looper's existing ERC-8004 identity ID. The oracle interface is exact:

```solidity
interface ILooperCredOracle {
    function credScore(uint256 identityTokenId)
        external
        view
        returns (uint256 score, uint64 updatedAt);
}
```

Rules:

- maximum evidence age is `24 hours`;
- oracle staticcall gas cap is `50_000`;
- return data must be exactly 64 bytes;
- missing identity binding, future timestamps, stale timestamps, malformed data, revert, gas exhaustion, or score below threshold denies execution;
- enabling Cred or raising threshold tightens immediately;
- disabling Cred, lowering threshold, replacing/deprecating the oracle, or resuming after a project pause increments `leniencyEpoch`;
- grants accepted under an older leniency epoch remain paused until their Looper owner reconfirms;
- no Cred change creates a grant or expands scope.

### 10.4 V1 action boundary

Native asset:

- empty calldata;
- exact allowlisted recipient;
- per-transaction wei cap;
- per-UTC-day wei cap.

ERC-20 transfer:

- exact allowlisted token and recipient;
- exact `transfer(address,uint256)` selector;
- exactly 68 calldata bytes;
- outer value zero;
- per-transaction and per-UTC-day token-unit caps;
- post-validation accepts only empty return data or exactly 32-byte ABI `true`;
- ABI `false`, malformed length, noncanonical boolean, or target revert rejects and rolls back the entire transaction.

Forbidden: approvals, Permit, Permit2, transferFrom, NFT transfers, arbitrary calldata, contract creation, delegatecall, selfdestruct, batch calls, nested execution, and unknown token return conventions.

## 11. Console behavior

At launch Multipass remains owner-operated:

- The compact wallet card shows an explicit `Owner controlled`, `Read-only`, `Blocked`, or `Activation required` status.
- Wallet details expand to show address, assets, and owner actions using the existing Multipass visual system.
- Agents receive read-only context: canonical account, activation state, owner, balances, account state, selected module, registry pause, and module approval status.
- Agent context excludes keys, signatures, private attempts, raw grant calldata, and generic provider authority.
- Owner sends retain explicit confirmation and exact receipt attribution.
- Clearing or changing a module is an exact owner transaction preview.
- The UI does not present grant controls until a production module and ownership-epoch source pass separate review.

## 12. Deployment and migration

Account bytecode changes invalidate the unsigned deployment preview at `d525dcb`.

Before any release:

1. Recompile deterministically and regenerate account creation bytecode, immutable-patched runtime, hashes, predicted address, and unsigned deployment/config transactions.
2. Revalidate deployer nonce and empty code across two approved Base RPC origins.
3. Deploy and verify the immutable module registry in paused/empty state.
4. Deploy and verify the account implementation with the registry address pinned immutably.
5. Inventory every legacy account and asset balance; preserve legacy accounts as read-only evidence.
6. Present the existing Loopers owner with a separate exact `setERC6551Config` transaction.
7. Verify canonical post-state before publishing the Console configuration.

No onchain write occurs without a fresh, separate approval.

## 13. Required tests

### Account core

- Existing canonical proxy, interfaces, owner execution, ETH/ERC-20, dynamic ownership, EIP-1271, rollback, burned-token, malformed-context, and generated-binding tests remain green.
- Owner-only module changes; zero clearing; unapproved module; paused registry; codehash mismatch; unsupported ERC-165; policy epoch increments; same-module reselection; module-owner mismatch after transfer.
- Exact pre/post magic, exact return lengths, bounded gas, revert bubbling, target rollback, post-validation rollback, and reentrancy.
- Test-only policy path executes native and ERC-20 calls only when the mock authorizes them.
- Session keys remain invalid for EIP-1271 and `isValidSigner`.

### Registry

- Dynamic current Loopers project-owner authorization.
- Paused and empty initial state.
- Exact runtime hash approval, removal, pause, resume, and events.
- Project admin cannot select an account module or execute through an account.

### Console/API

- Readable Multipass-styled compact/expandable wallet states.
- Read-only agent context contains status but no secrets, attempts, calldata, or capabilities.
- Unsupported/paused/module-owner-mismatch states degrade only the wallet panel.
- Module controls require exact owner, chain, account, runtime, registry, and policy evidence immediately before signing.
- Ownership/config drift removes every write capability.
- Existing direct-owner send attribution remains exact.

### Release gates

- Focused contract, registry, controller, RPC, API-context, UI, and deployment-artifact tests.
- Full repository tests.
- Production web build.
- Deterministic artifact regeneration/freshness.
- Syntax checks, `git diff --check`, dual-origin read-only preflight, and clean tracked status.

## 14. Success criteria

The release is ready to stage only when:

- the immutable account supports an owner-selected, registry-approved module without approving any module by default;
- owner execution and instant module clearing are proven;
- unapproved, paused, transferred, malformed, or codehash-drifted module execution fails closed;
- the Console remains owner-only with no live agent keys or grant controls;
- agents can read and interpret wallet context but cannot sign or submit;
- the registry is deployed paused and empty;
- all focused, full-repository, build, artifact, and live read-only preflight gates pass;
- no onchain write has occurred without a fresh, separate approval.

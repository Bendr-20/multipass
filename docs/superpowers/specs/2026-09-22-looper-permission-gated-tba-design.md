# Looper Permission-Gated TBA Design

**Date:** 2026-09-22  
**Status:** Approved design; implementation and deployment not yet approved  
**Repository baseline:** `d525dcb`  
**Chain:** Base mainnet (`8453`)  
**Existing Loopers collection:** `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`

## 1. Decision

Keep the existing Loopers NFT contract, token supply, ownership, metadata, and collection address unchanged. Replace only its ERC-6551 account configuration after a separately reviewed release.

The new ERC-6551 implementation is an immutable wallet core with an optional external authorization module. Every TBA launches owner-only. The current NFT owner remains root authority forever. A Looper owner may later select an authorization module and explicitly grant a constrained agent session key without changing the TBA address.

The first release ships and tests the permission path but creates no live agent keys and enables no autonomous transaction authority.

## 2. Product model

A Looper progresses through four states:

1. **Observe:** the agent reads public balances, assets, transaction evidence, ownership, and policy status.
2. **Propose:** the agent prepares a bounded action; the human operator reviews and signs.
3. **Constrained autonomy:** the owner explicitly grants a protected agent session key narrowly scoped permissions.
4. **Expanded autonomy:** the owner deliberately increases scope or limits after reviewing the agent's performance and trust evidence.

No trust score automatically grants authority. A score can establish eligibility only. Every grant requires a separate Looper-owner transaction.

## 3. Goals

- Preserve the existing Loopers collection.
- Make each newly configured ERC-6551 account executable by its current NFT owner.
- Preserve the same new TBA address while progressing from owner-only to constrained agent autonomy.
- Let the owner disable agent authority instantly and return to owner-only operation.
- Let project governance configure the official Cred integration and pause official agent execution without gaining custody.
- Invalidate previous-owner permissions immediately after NFT transfer.
- Fail closed on missing, stale, malformed, contradictory, or unavailable policy evidence.
- Keep the agent's general message-signing authority separate from transaction-specific permission checks.

## 4. Non-goals

- Deploying a new Loopers NFT contract.
- Creating or funding live agent signing keys in this release.
- Granting autonomous authority at launch.
- ERC-4337, paymasters, account abstraction bundlers, or sponsored agent gas in this release.
- Arbitrary DeFi calls, token approvals, `transferFrom`, delegatecall, upgrades, plugins with implementation authority, or project-admin custody.
- Migrating assets automatically from legacy ERC-6551 addresses.
- Treating Cred, AgentDNA, or any offchain score as sufficient authorization by itself.

## 5. Contracts

### 5.1 `LooperAgentAccount`

`LooperAgentAccount` remains the immutable implementation used by canonical ERC-6551 proxies. It preserves the canonical 173-byte proxy-context validation, dynamic NFT ownership, ERC-165, ERC-6551, EIP-1271 owner signatures, ETH receive, state counter, exact return data, exact revert bubbling, and operation-zero-only behavior already proven at `d525dcb`.

It adds these account-scoped surfaces:

```solidity
function policyModule() external view returns (address);
function policyEpoch() external view returns (uint256);
function setPolicyModule(address module) external;
function executeWithPolicy(address to, uint256 value, bytes calldata data)
    external
    payable
    returns (bytes memory result);
```

Rules:

- Standard `execute(address,uint256,bytes,uint8)` remains owner-only.
- `setPolicyModule` is owner-only. `address(0)` is always allowed and restores owner-only mode.
- A nonzero module must contain code and support the exact policy-module interface.
- Every successful module change, including clearing and reselecting the same address, increments `policyEpoch` and emits an event.
- Old grants are keyed to the old epoch and never reactivate automatically.
- `executeWithPolicy` rejects when the module is zero, malformed, unsupported, paused, or returns anything other than the exact authorization magic value.
- The account calls the policy module normally; it never delegatecalls a module.
- The account passes the caller, target, value, calldata, current owner, and current policy epoch to the module's consume function.
- Authorization consumption and target execution occur in one transaction. Any target revert rolls back the module's spend accounting and the account state increment.
- Both owner and policy execution increment the same monotonic account `state` and emit `StateUpdated` before the target call.
- A reentrancy guard covers module validation and target execution.
- Direct implementation calls, malformed proxies, wrong-chain contexts, burned tokens, and noncanonical proxies remain inert.
- EIP-1271 and ERC-6551 `isValidSigner` remain owner-only. Agent session keys never become general-purpose account signers.

### 5.2 Policy interface

The immutable core depends only on a narrow interface:

```solidity
interface ILooperAgentPolicy {
    function authorizeAndConsume(
        address sessionKey,
        address owner,
        uint256 policyEpoch,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4 magicValue);
}
```

`msg.sender` is the TBA. The official module keys all data by `msg.sender`, the current owner, and the current policy epoch. Unsupported modules fail closed.

### 5.3 `LooperAgentPolicy`

`LooperAgentPolicy` is the official shared policy module. It has no ability to execute calls, transfer funds, alter account modules, sign messages, or configure a grant without the current Looper owner.

The module is bound immutably to:

- Base chain;
- the existing Loopers collection;
- the canonical account interface it validates.

Project-administration checks dynamically resolve the existing Loopers contract's current `owner()`. There is no second permanent project-admin key.

Project governance may:

- pause or resume all execution through the official module;
- configure whether Cred is required for newly issued official grants;
- configure the supported Cred oracle and minimum threshold;
- tighten global requirements immediately;
- deprecate an oracle;
- increment the leniency epoch when requirements are loosened.

Project governance cannot:

- create, alter, or revoke an individual owner's session-key grant;
- select a module for a TBA;
- call through a TBA;
- transfer or approve any TBA asset;
- validate a grant when the current Looper owner did not issue it.

### 5.4 Cred policy

Cred is an optional official-policy requirement, never an immutable wallet dependency.

- When global Cred gating is enabled, new official grants must require the configured Cred source and threshold.
- An owner may retain a stricter Cred requirement even when the project default is off.
- Oracle failure, malformed return data, stale evidence, unsupported identity binding, or a score below threshold denies execution.
- Disabling Cred, lowering the threshold, or otherwise loosening policy increments a `leniencyEpoch`.
- Existing grants whose accepted leniency epoch is older pause until their Looper owner explicitly reconfirms under the new policy.
- Tightening a threshold or pausing execution applies immediately and does not grant new authority.
- Cred changes never create a grant or expand target, selector, recipient, asset, amount, duration, or key scope.

## 6. Owner grants

Each official grant is scoped to:

- canonical TBA address;
- owner address at grant time;
- current account `policyEpoch`;
- current official-policy `leniencyEpoch`;
- one session-key address;
- not-before and expiry timestamps;
- native-asset rules;
- ERC-20 rules.

NFT transfer invalidates the grant immediately because `owner()` no longer equals the owner captured at grant time. The new owner must choose a module and issue a new grant.

The owner may revoke a grant or clear the account module at any time. Clearing the module is the fastest owner-only recovery path.

## 7. V1 autonomous action boundary

The first official policy supports measurable asset movement only.

### 7.1 Native asset

- Exact allowlisted recipient.
- Empty calldata.
- Per-transaction wei limit.
- Per-day wei limit using a deterministic UTC day bucket.
- Account balance never substitutes for permission evidence.

### 7.2 ERC-20 transfer

- Exact allowlisted token contract.
- Exact `transfer(address,uint256)` selector.
- Exact canonical calldata length and decoding; trailing bytes are rejected.
- Exact allowlisted recipient.
- Outer transaction value must be zero.
- Per-transaction token-unit limit.
- Per-day token-unit limit for that token.

### 7.3 Forbidden in V1

- `approve`, `increaseAllowance`, Permit, Permit2, `transferFrom`, NFT transfers, arbitrary calldata, contract creation, delegatecall, selfdestruct, batch calls, nested execution, and unknown token return conventions.
- Generic protocol calls require a separately designed and reviewed policy adapter. The immutable core need not change when such an adapter is added through a future official module.

## 8. Policy accounting and failure behavior

- Spend is keyed by TBA, owner-at-grant, policy epoch, session key, asset, and UTC day bucket.
- Spend is consumed before the target call and rolls back if the target call reverts.
- A successful policy execution increments both policy usage and TBA state exactly once.
- Expiry, grant mismatch, module mismatch, ownership change, policy pause, Cred failure, recipient mismatch, selector mismatch, malformed calldata, exceeded cap, or unsupported asset reverts before the target call.
- Module or oracle calls use bounded gas and exact return-length validation.
- No fallback from failed policy authorization to owner authorization is permitted.
- No balance delta, transfer event elsewhere, or later state inference can substitute for exact receipt attribution.

## 9. Console behavior

At launch, Multipass remains owner-operated:

- Agents receive read-only wallet context: canonical account address, activation state, owner, balances, account state, selected module, official-policy status, Cred requirement status, and whether a grant exists.
- Agent context excludes keys, signatures, raw grant-creation calldata, private attempts, and generic wallet/provider authority.
- Owner sends continue through the existing explicit confirmation and receipt-attribution flow.
- The wallet panel displays `Owner only`, `Permissioned`, `Policy paused`, `Grant expired`, `Reconfirmation required`, or `Unsupported module` without implying autonomous custody.
- Clearing or changing a module, issuing or revoking a grant, and reconfirming after a leniency change are explicit owner transactions with exact previews.
- This release does not generate, store, display, or activate a live session private key. Production signer custody is a separate design and approval gate.

## 10. Project controls

A separate project-owner surface may manage only the official policy's global settings:

- emergency pause/resume;
- Cred default on/off;
- oracle address;
- minimum score;
- policy/leniency version and affected-grant count.

Every action requires the current Loopers collection owner, an exact transaction preview, and canonical receipt verification. Loosening controls warn that affected grants will remain paused until owner reconfirmation.

## 11. Deployment and migration

No existing transaction preview from `d525dcb` remains valid after account bytecode changes.

Before release:

1. Recompile deterministically and regenerate creation bytecode, immutable-patched runtime, hashes, predicted address, and unsigned deployment/config transactions.
2. Revalidate deployer nonce and empty code across two approved Base RPC origins.
3. Deploy and verify the official policy module only if the release includes it; it remains powerless until selected by a TBA owner.
4. Deploy the account implementation and verify exact runtime bytes and hash.
5. Inventory every deployed legacy account and asset balance. Preserve legacy accounts as read-only evidence; do not claim automatic migration.
6. Present the existing Loopers owner with a separate exact `setERC6551Config` transaction.
7. Verify canonical post-state before publishing the new Console configuration.

No deployment, config update, key creation, or grant occurs during implementation.

## 12. Security invariants

- Existing Loopers NFT contract is never replaced.
- NFT owner can always execute directly and clear the policy module.
- Project governance cannot spend TBA funds.
- Session keys cannot produce general account signatures.
- Agent authority is never inferred from Cred alone.
- Ownership transfer invalidates old grants immediately.
- Policy loosening never silently broadens an existing grant.
- Project pause disables agent execution but never owner execution.
- Module replacement never reactivates stale grants.
- Unknown or malformed evidence always denies agent execution.
- No upgrade, beacon, UUPS, implementation admin, delegatecall authority, or unrestricted execution module exists in the immutable core.

## 13. Required tests

### Contract core

- Existing canonical proxy, interfaces, owner execution, ETH/ERC-20, ownership transfer, EIP-1271, rollback, burned-token, malformed-context, and generated-binding tests remain green.
- Module zero, unsupported module, non-owner module change, epoch increments, same-module reselection, stale grant, policy execution, state/event ordering, rollback, and reentrancy.
- Agent key remains invalid for EIP-1271 and `isValidSigner`.

### Official policy

- Current-owner-only grant/revoke/reconfirm.
- Old-owner rejection after transfer.
- Project-admin resolution through current Loopers `owner()`.
- Project pause and owner execution independence.
- Cred enabled/disabled, oracle failure, malformed/stale response, threshold boundary, tightening, loosening, and owner reconfirmation.
- Session expiry and future not-before time.
- Native recipient/per-transaction/day caps.
- ERC-20 token/recipient/selector/exact-length/per-transaction/day caps.
- Forbidden approval, Permit, transferFrom, NFT, arbitrary call, nested call, and nonzero outer value.
- Spend rollback on target revert and no duplicate consumption.

### Console/API

- Owner-only launch copy and controls.
- Read-only agent context includes status but no secrets, calldata, attempts, or capabilities.
- Unsupported/paused/expired/reconfirmation states degrade only the wallet panel.
- Module/grant controls require exact owner, chain, account, runtime, config, and policy evidence immediately before signing.
- Ownership transfer and config drift remove every write capability.
- Existing direct-owner send attribution remains exact.

### Release gates

- Focused contract, policy, deployment-artifact, controller, RPC, API-context, and UI tests.
- Full repository tests.
- Production web build.
- Deterministic artifact regeneration/freshness.
- Syntax checks, `git diff --check`, live dual-origin read-only preflight, and clean tracked status.

## 14. Success criteria

The release is ready to stage only when:

- the immutable TBA core supports owner-selected policy authorization without granting any policy by default;
- the official policy proves bounded native/ERC-20 session execution and every revocation/invalidation path;
- the Console remains owner-only without live agent keys;
- agents can read and interpret wallet/policy context but cannot sign or submit;
- project Cred settings are removable without changing TBA addresses and cannot silently weaken existing grants;
- all focused, full-repository, build, artifact, and live read-only preflight gates pass;
- no onchain write has occurred without a fresh, separate approval.

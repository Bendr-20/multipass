# Loopers Reserve-Mint Owner Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a noindex owner page that reserve-mints a user-selected batch of 1–40 Loopers directly to the pinned treasury Safe, with a one-NFT default and fail-closed transaction/receipt verification.

**Architecture:** Follow the existing standalone withdraw-owner-page pattern: one self-contained HTML document with no external executable assets, raw allowlisted JSON-RPC calls, an injected-wallet boundary, and focused JSDOM tests. Separate logical responsibilities inside the script—ABI encoding/decoding, canonical snapshots, exact transaction validation, durable attempt state, receipt attribution, and UI orchestration—without adding a build-time runtime dependency. Attribute success from receipt-local two-stage ERC-721 and Adapter8004 evidence, then verify all execution identities and token state at the canonical receipt block.

**Tech Stack:** Static HTML/CSS/JavaScript, EIP-1193 injected wallet, Base JSON-RPC with EIP-1898 block-hash reads, browser Web Crypto SHA-256, Node test runner, JSDOM, viem test helpers, existing static deployment workflow.

**Spec:** `docs/superpowers/specs/2026-09-20-loopers-reserve-mint-owner-page-design.md`

---

## File map

- Create `apps/web/owner-tools/reserve-mint-loopers/index.html` — standalone UI, pinned production identities, raw ABI/RPC helpers, coherent preflight, exact send, durable pending state, receipt verification, and recovery UI.
- Create `apps/web/test/reserve-mint-loopers-owner-page.test.mjs` — static-surface, RPC/wallet, state-machine, race, receipt-log, canonicality, and recovery tests.
- Modify `docs/superpowers/specs/2026-09-20-loopers-reserve-mint-owner-page-design.md` only if implementation discovers a verified production fact that contradicts the approved spec; otherwise leave it untouched.

No shared SPA source or API endpoint changes are required. The page must remain independent of authenticated Console state and must never expose another owner action.

## Chunk 1: Safe page, coherent preflight, and exact send boundary

### Task 1: Create the focused test harness and static security contract

**Files:**
- Create: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`
- Test: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Write failing static-surface tests**

Create the test file with production constants from the approved spec and tests that assert:

```js
const PAGE_PATH = new URL('../owner-tools/reserve-mint-loopers/index.html', import.meta.url);
const CHAIN_HEX = '0x2105';
const PROXY = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';
const SAFE = '0xfA5c233683E4cE7cA6214E769Ae5F9D9e6Fa4483';
const IMPLEMENTATION = '0x68F22e3563891167D37C86391c4a83449c83e908';
const ADAPTER = '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27';
const ADAPTER_IMPLEMENTATION = '0x0f81bd4EDD4879734361A1A44460264CBf6F94c9';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REGISTRY_IMPLEMENTATION = '0x7274e874CA62410a93Bd8bf61c69d8045E399c02';
const AGENT_BASE_URI = 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/';
const RESERVE_MINT_SELECTOR = '0xb0ea1802';
```

Required assertions:

```js
assert.match(document.querySelector('meta[name="robots"]').content, /noindex/i);
assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
assert.equal(document.querySelectorAll('input').length, 1);
assert.equal(document.querySelector('input').type, 'number');
assert.equal(document.querySelector('input').min, '1');
assert.equal(document.querySelector('input').max, '40');
assert.equal(document.querySelector('input').value, '1');
assert.equal(document.querySelectorAll('button').length, 3); // connect, mint, resume verification
```

Assert the source contains every pinned address/hash/selector/URI, contains one guarded `eth_sendTransaction` call site plus the method allowlist entry, and does not contain selectors for treasury, withdrawal, transfer, pause, metadata, ownership, or upgrade writes.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @helixa/multipass-web exec node --test test/reserve-mint-loopers-owner-page.test.mjs
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Create the minimal standalone page shell**

Create `apps/web/owner-tools/reserve-mint-loopers/index.html` with:

- `<meta name="robots" content="noindex, nofollow, noarchive">`
- a compact mobile-safe card matching the existing withdraw-owner page
- immutable displayed rows for network, wallet, Loopers proxy/implementation, Adapter8004, Identity Registry, fixed Safe, reserve minted/remaining, total supply, Safe Looper balance, estimated token range
- one numeric `#quantity` input (`min="1" max="40" step="1" value="1" inputmode="numeric"`)
- `#connect`, `#mint`, and `#resume` buttons
- `#status` and a hidden BaseScan `#transaction` link
- one inline script and no external executable asset

Add all pinned constants and exact frozen method allowlists. Start with write controls disabled and status `Verifying pinned production state…`.

- [ ] **Step 4: Run the focused test and verify the static contract passes**

Run the command from Step 2.

Expected: static tests PASS; dynamic tests are not written yet.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "test: define reserve mint owner page surface"
```

### Task 2: Add ABI helpers, quantity validation, and exact calldata tests

**Files:**
- Modify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Modify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Write failing encoding and quantity tests**

Test these inputs: `1`, `40`, `0`, `-1`, `1.5`, `41`, empty, `reserveMinted + quantity > 337`, and `totalSupply + quantity > 7777`.

For quantity 1, assert exact calldata:

```js
const expected = `0xb0ea1802${SAFE.slice(2).toLowerCase().padStart(64, '0')}${'1'.padStart(64, '0')}`;
```

For quantity 40, use `28` as the final uint256 word. Assert the outbound object has exactly the five keys `chainId`, `from`, `to`, `data`, and `value`; mutate each value and add one extra key to prove fail-closed rejection.

- [ ] **Step 2: Run the new tests and verify RED**

Expected: FAIL because quantity/calldata helpers are missing.

- [ ] **Step 3: Implement minimal helpers**

Add pure helpers inside the inline script:

```js
function parseQuantity(raw, snapshot) {
  if (!/^\d+$/.test(String(raw))) throw new Error('Quantity must be a whole number from 1 to 40.');
  const quantity = BigInt(raw);
  if (quantity < 1n || quantity > 40n) throw new Error('Quantity must be between 1 and 40.');
  if (snapshot.reserveMinted + quantity > 337n) throw new Error('Quantity exceeds the remaining team reserve.');
  if (snapshot.totalSupply + quantity > 7777n) throw new Error('Quantity exceeds maximum supply.');
  return quantity;
}

function uintWord(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function addressWord(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid address.');
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function encodeReserveMint(quantity) {
  return `${RESERVE_MINT_SELECTOR}${addressWord(FIXED_SAFE)}${uintWord(quantity)}`;
}

function makeTransaction(quantity) {
  return Object.freeze({
    chainId: CHAIN_HEX,
    from: EXPECTED_OWNER,
    to: LIVE_PROXY,
    data: encodeReserveMint(quantity),
    value: '0x0',
  });
}
```

Implement `assertExactTransaction` with exact-key-set and exact-value checks.

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: quantity and calldata tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "feat: encode exact Loopers reserve mints"
```

### Task 3: Build coherent canonical snapshots and readiness validation

**Files:**
- Modify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Modify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Extend the RPC mock and write failing readiness tests**

The mock must support only these public methods:

```js
[
  'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt',
  'eth_call', 'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
]
```

Use EIP-1898 `{ blockHash, requireCanonical: true }` tags for code/storage/call reads. Assert every read in one pass carries the same block hash. Add tests for wrong public RPC chain, wrong wallet chain/account, wrong Loopers/Adapter/Registry implementation address, each of six code-hash mismatches, wrong owner, wrong adapter/registry constants, wrong adapter registry, wrong caps, wrong base URI, read failure, and non-canonical block response. Every mismatch must disable `#mint` and send nothing.

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because coherent snapshots are missing.

- [ ] **Step 3: Implement public RPC and ABI decoders**

Implement:

- frozen public/wallet method allowlists
- `publicRpc(method, params)` and `walletRequest(method, params)`
- `decodeAddress`, `decodeUint`, `decodeBool`, and dynamic ABI string decoding
- browser SHA-256 code hashing
- `getCanonicalHead()` returning `{number, hash}` after verifying `eth_chainId == 0x2105`
- `readSnapshot()` using the head hash for all Loopers/Adapter/Registry code, slot, and calls
- `validateSnapshot(snapshot, wallet, quantity)`
- `renderSnapshot` and `refresh`

The snapshot contains all pinned identities plus `reserveMinted`, `totalSupply`, Safe `balanceOf`, `TEAM_RESERVE_CAP`, `MAX_SUPPLY`, and `erc8004AgentBaseURI`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Expected: coherent snapshot/readiness tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "feat: verify reserve mint execution identity"
```

## Chunk 2: Durable submission, receipt attribution, and deployment

### Task 4: Implement simulation, race closure, and durable attempt states

**Files:**
- Modify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Modify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Write failing state-machine and race tests**

Cover:

- two coherent snapshots around exact `eth_call`
- every post-simulation drift source sends nothing
- wallet `accountsChanged`/`chainChanged` during snapshots, nonce reads, and final synchronous guard sends nothing
- confirmed/pending owner nonce mismatch sends nothing
- no durable record exists on any locally proven pre-provider failure
- `prepared` is written synchronously immediately before `eth_sendTransaction`
- exact code `4001` clears `prepared`; text matching like “cancel” without code does not
- disconnect, timeout, malformed hash, and provider errors remain `uncertain`
- returned valid hash is persisted before any transaction lookup
- reload in `prepared`, `submitted`, and `uncertain` states restores the lock
- double click and wallet refresh cannot create a second send

Use a stable local-storage key such as:

```js
const ATTEMPT_KEY = `helixa:reserve-mint:${CHAIN_ID}:${LIVE_PROXY.toLowerCase()}:${EXPECTED_OWNER.toLowerCase()}`;
```

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because submission/state handling is missing.

- [ ] **Step 3: Implement the durable state machine**

Implement `loadAttempt`, `saveAttempt`, `clearAttempt`, `makeAttemptId`, `restoreAttempt`, and transitions for `prepared`, `submitted`, `uncertain`, `confirmed`, and `reverted`.

Implement mint sequencing exactly as approved:

1. acquire in-memory mutex
2. capture immutable quantity/transaction/generation
3. coherent preflight
4. exact `eth_call`
5. fresh coherent snapshot and no-drift comparison
6. confirmed/pending nonce equality
7. synchronous generation re-check
8. synchronous `prepared` persistence
9. immediate provider invocation with no await in between
10. hash format check and synchronous `submitted` persistence before lookup

Only `error.code === 4001` may clear a prepared attempt without chain reconciliation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Expected: submission and race tests PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "feat: persist reserve mint submission safety"
```

### Task 5: Verify exact receipt effects and canonical post-state

**Files:**
- Modify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Modify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Write failing receipt evidence tests**

Build mock receipts for quantity 1 and quantity 40. Require:

- exact transaction and receipt hash/block linkage, present Base chain ID, zero value, exact input
- exactly one `ReserveMinted(Safe,startTokenId,quantity)`
- exactly `quantity` `Transfer(0,proxy,tokenId)` logs
- exactly `quantity` `Transfer(proxy,Safe,tokenId)` logs
- no extra Loopers Transfer logs
- contiguous token IDs
- exactly one `ERC8004Bound(tokenId,agentId,Safe,expectedURI)` per token
- receipt-block EIP-1898 re-verification of every proxy/implementation/code/config/owner fact
- `ownerOf`, `erc8004BoundByLooper`, `erc8004AgentIdByLooper`, `erc8004AgentURI`, Adapter `bindingOf`, and `isController` for every token/agent
- aggregate state at least preflight + quantity
- three confirmations and final canonical hash check

Negative tests must cover missing/extra/duplicate/malformed logs, wrong sender/destination/ID/URI, transaction mismatch, null chain ID, reverted receipt, code/owner/config drift by receipt block, wrong owner/binding/controller, smaller aggregate state, confirmation exhaustion, reorg, and lookup exhaustion. Exhaustion or unreconciled success stays locked.

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because receipt parsing/canonical verification is missing.

- [ ] **Step 3: Implement receipt parsing and canonical verification**

Add the exact topics:

```js
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RESERVE_MINTED_TOPIC = '0x817373d73ac355e40750643a2bd4bf273950d1fc30533a38a26d4f980f4c3fcf';
const ERC8004_BOUND_TOPIC = '0xb8fcb17338a7efdcb1bd0559c53bc7d8564f98be519fd7bc8197390a57f198d8';
```

Implement strict topic/data word decoders, `parseReceiptEvidence`, `verifyTransactionEnvelope`, `verifyReceiptBlockSnapshot`, `verifyTokenBindings`, and `waitForCanonicalOutcome`.

Polling constants must be `120 × 3000ms` for transaction/receipt and `90 × 2000ms` for three confirmations. Tests override timers; runtime constants remain exact.

On full success, show the confirmed token range and BaseScan link, set `confirmed`, then clear the write lock and refresh. On a canonical revert, set `reverted`, then clear. Every ambiguous or inconsistent outcome persists `uncertain` and keeps mint disabled.

- [ ] **Step 4: Run focused tests and verify GREEN**

Expected: all receipt/canonical tests PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "feat: verify reserve mint receipt effects"
```

### Task 6: Implement safe no-hash recovery

**Files:**
- Modify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Modify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Write failing recovery tests**

Cover an `uncertain` record without a hash:

- exact sender+expected-nonce transaction found in canonical blocks → record hash and resume verification
- different canonical transaction consumes the nonce with a canonical receipt and non-mint calldata → permit strongly warned owner-confirmed clearing
- exact replacement calldata → verify as submitted, never clear
- pending-block exact transaction → remain locked and resume when hash is known
- no matching transaction or nonce movement without canonical replacement proof → remain locked
- any recovery RPC inconsistency/reorg → remain locked

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because recovery is missing.

- [ ] **Step 3: Implement bounded sender+nonce reconciliation**

Implement canonical full-block scanning from the persisted snapshot through the current recovery head and optional pending-block inspection. Compare sender, nonce, proxy, calldata, and value exactly. Never treat timeout, absence from one RPC response, or nonce movement alone as proof. `#resume` performs reads only; a separate explicit confirmation is required before clearing a proven non-mint replacement.

- [ ] **Step 4: Run focused tests and verify GREEN**

Expected: recovery tests PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "feat: reconcile ambiguous reserve mint attempts"
```

### Task 7: Full verification, independent review, deployment, and live proof

**Files:**
- Verify: `apps/web/owner-tools/reserve-mint-loopers/index.html`
- Verify: `apps/web/test/reserve-mint-loopers-owner-page.test.mjs`

- [ ] **Step 1: Run focused and full automated verification**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/reserve-mint-loopers-owner-page.test.mjs
pnpm --filter @helixa/multipass-web test
pnpm web:build
git diff --check
git status --short
```

Expected: all tests pass, build exits 0, diff check is clean, and only intended files/commits exist.

- [ ] **Step 2: Run static security scans**

Verify no secret-like values, external executable scripts, forbidden selectors/actions, editable destination, or unexpected generated files:

```bash
grep -nE '<script[^>]+src=|<iframe|<object|<embed|setTreasury|withdraw\(|upgradeTo|transferOwnership|safeTransferFrom' apps/web/owner-tools/reserve-mint-loopers/index.html
find . -type d -name __pycache__ -o -name '*.pyc'
```

Expected: grep has no forbidden runtime surface (documented selector names in explanatory copy must be absent too); no new Python cache artifact is tracked.

- [ ] **Step 3: Dispatch specification and quality reviewers**

Use a fresh reviewer for spec compliance, fix any issue, then use a fresh reviewer for code quality. Re-run focused/full tests after every fix.

- [ ] **Step 4: Commit final review fixes**

```bash
git add apps/web/owner-tools/reserve-mint-loopers/index.html apps/web/test/reserve-mint-loopers-owner-page.test.mjs
git commit -m "fix: harden reserve mint owner page"
```

Skip this commit if reviewers require no changes.

- [ ] **Step 5: Deploy with the existing static deployment procedure**

Follow `@multipass-static-deploy` to publish the page at a dedicated route such as:

```text
https://helixa.xyz/reserve-mint-loopers/
```

Do not connect a wallet or submit a transaction during deployment verification.

- [ ] **Step 6: Verify the live page without a wallet**

Use an incognito/no-extension browser context at mobile and desktop widths. Verify:

- HTTP 200 and no redirect to Console
- no external executable assets
- fixed Safe is visible
- quantity defaults to 1 and accepts only 1–40
- mint remains disabled without the expected wallet
- pinned production state loads from Base
- no console errors
- deployed source SHA-256 equals local source SHA-256

- [ ] **Step 7: Record final evidence and hand off the one-NFT test**

Report the live URL, focused/full test counts, commit SHA, deployed source hash, and that no wallet connection or transaction occurred. Give the operator flow: connect expected owner on Base, keep quantity at 1, review exact proxy/zero-value transaction, approve, wait for canonical verification, and confirm the Looper in the Safe before any later batch.

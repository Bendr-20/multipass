# Loopers Withdraw-Only Owner Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one owner-only browser page that can call only `withdraw()` on the live Loopers proxy and sends proceeds to the contract's unchanged treasury.

**Architecture:** Add one self-contained static HTML page with local CSS and JavaScript, no external executable dependencies, and a provider/RPC boundary that fail-closes unless every pinned Base-mainnet identity and transaction field matches. Add Node/jsdom tests that exercise static invariants and mocked wallet flows, then copy the reviewed artifact to a backed-up live route without initiating a transaction.

**Tech Stack:** Static HTML/CSS/JavaScript, EIP-1193 injected wallet, Base JSON-RPC, Node test runner, jsdom.

---

## Chunk 1: Build and verify the standalone artifact

### Task 1: Add failing static and browser-flow tests

**Files:**
- Create: `apps/web/test/withdraw-loopers-owner-page.test.mjs`
- Create later: `apps/web/owner-tools/withdraw-loopers/index.html`

- [ ] **Step 1: Write a failing test that loads the page source and asserts pinned values**

Assert the exact Base chain ID, proxy, owner, treasury, EIP-1967 slot, implementation address, both SHA-256 code identities, owner/treasury selectors, and `withdraw()` calldata.

- [ ] **Step 2: Assert the source omits every forbidden write**

Reject `setTreasury`, `reserveMint`, NFT transfer, ownership transfer, pause/unpause, sale/finalization, upgrade, arbitrary calldata inputs, and any external `<script src>`.

- [ ] **Step 3: Add failing jsdom wallet/RPC-flow tests before implementation**

Mock deterministic no-wallet, wrong-wallet, ready, account-change, chain-change, stale-balance, failed-simulation, rejected-signature, submitted, successful-receipt, reverted-receipt, and zero-balance responses. Require every failure state to produce zero sends.

- [ ] **Step 4: Add failing provider-boundary tests before implementation**

Require public Base RPC to allow only `eth_getBalance`, `eth_call`, `eth_getStorageAt`, `eth_getCode`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`. Require the injected wallet boundary to allow only `eth_chainId`, `eth_accounts`, `eth_requestAccounts`, `wallet_switchEthereumChain`, and `eth_sendTransaction`. Unexpected methods must throw and leave the send count at zero.

- [ ] **Step 5: Run the focused test and verify it fails because the page does not exist**

Run: `node --test apps/web/test/withdraw-loopers-owner-page.test.mjs`
Expected: FAIL with missing page source.

### Task 2: Implement the minimum page against the failing tests

**Files:**
- Create: `apps/web/owner-tools/withdraw-loopers/index.html`

- [ ] **Step 1: Adapt the proven old-contract owner page into a new isolated route**

Keep the UI to contract, balance, owner, treasury, implementation, connected wallet, Connect owner wallet, and Withdraw mint proceeds. Add `noindex,nofollow` and no external executable assets.

- [ ] **Step 2: Add exact Base read checks**

Use Base mainnet RPC for `eth_getBalance`, owner/treasury `eth_call`, EIP-1967 `eth_getStorageAt`, and proxy/implementation `eth_getCode`. Hash bytecode with browser `crypto.subtle.digest('SHA-256', ...)` and compare every identity to the spec.

- [ ] **Step 3: Add wallet readiness invalidation**

Connect through `window.ethereum`, require chain `0x2105` and expected owner, and clear readiness/re-read on `accountsChanged` and `chainChanged`.

- [ ] **Step 4: Add exact provider boundaries and send flow**

Reject any public-RPC or injected-wallet method outside the explicit method allowlists from Task 1. On click, disable the button; re-read every chain/account/contract identity and balance; construct immutable exact transaction `{from: expectedOwner, to: liveProxy, data: '0x3ccfd60b', value: '0x0'}`; validate each field; and require successful Base RPC `eth_call`.

Immediately after simulation and directly before `eth_sendTransaction`, re-read the injected chain and active account plus the Base contract balance. Re-run the exact transaction allowlist check. Abort if chain, account, balance, owner, treasury, identity, or transaction fields differ from the validated snapshot.

- [ ] **Step 5: Verify the receipt**

Poll Base RPC for transaction and receipt. Require matching from/to/input/value and receipt `status == '0x1'`; show a BaseScan link; refresh contract state; never report success from a hash alone.

- [ ] **Step 6: Run static tests**

Run: `node --test apps/web/test/withdraw-loopers-owner-page.test.mjs`
Expected: PASS.

### Task 3: Complete the TDD loop and run regressions

**Files:**
- Modify only if a demonstrated gap remains: `apps/web/test/withdraw-loopers-owner-page.test.mjs`
- Modify only to satisfy a failing test: `apps/web/owner-tools/withdraw-loopers/index.html`

- [ ] **Step 1: Confirm every prewritten mocked flow now passes**

Capture `eth_sendTransaction`; deep-compare the only successful transaction to the pinned tuple. Confirm account/chain invalidation, post-simulation rechecks, method allowlists, transaction/receipt verification, and all failure states send nothing.

- [ ] **Step 2: Run focused and web test suites**

Run: `node --test apps/web/test/withdraw-loopers-owner-page.test.mjs`
Expected: PASS.

Run: `pnpm --filter @helixa/multipass-web test`
Expected: PASS.

- [ ] **Step 3: Commit implementation and tests**

```bash
git add apps/web/owner-tools/withdraw-loopers/index.html apps/web/test/withdraw-loopers-owner-page.test.mjs
git commit -m "feat: add withdraw-only Loopers owner page"
```

## Chunk 2: Deploy without transacting

### Task 4: Back up and publish the exact reviewed page

**Files:**
- Source: `apps/web/owner-tools/withdraw-loopers/index.html`
- Deploy: `/var/www/helixa.xyz/withdraw-loopers/index.html`

- [ ] **Step 1: Record the source SHA-256**

Run: `sha256sum apps/web/owner-tools/withdraw-loopers/index.html`
Expected: one source artifact hash.

- [ ] **Step 2: Back up any existing live route**

Copy an existing route to `/home/ubuntu/backups/withdraw-loopers-pre-<UTC timestamp>/`; if absent, record that the destination was new.

- [ ] **Step 3: Install the artifact only**

Create the destination directory and install the exact reviewed HTML with mode `0644`. Do not connect a wallet or issue any write RPC.

- [ ] **Step 4: Verify source/live identity and public response**

Compare source and deployed SHA-256 hashes, fetch `https://helixa.xyz/withdraw-loopers/`, require HTTP 200, and assert fetched bytes hash to the same value.

- [ ] **Step 5: Run read-only live browser smoke**

Open the public page without a wallet, confirm owner/treasury/balance/implementation render, no browser errors occur, and the disabled withdrawal control cannot send.

### Task 5: Handoff to Quigley

- [ ] **Step 1: Re-read live onchain state**

Confirm live proxy balance, owner, treasury, implementation, and code identities still match immediately before handoff.

- [ ] **Step 2: Send Quigley the route and exact expected wallet/destination**

State that Quigley must connect `0x709D...44aE`, the contract will withdraw its full balance to that same existing treasury, and moving it to the Safe is a separate manual transfer.

- [ ] **Step 3: Stop before the irreversible action**

Do not click Connect, Withdraw, or approve any wallet request. Quigley alone performs and confirms the transaction.

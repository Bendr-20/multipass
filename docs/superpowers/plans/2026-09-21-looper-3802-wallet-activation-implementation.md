# Looper #3802 ERC-6551 Wallet Activation Pilot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, noindex owner page that lets only the pinned Loopers collection-owner wallet sponsor the one deterministic ERC-6551 account deployment for Looper #3802, then proves the canonical account state and transaction attribution without exposing any other write.

**Architecture:** Generate one self-contained static HTML document from focused plain-JavaScript units for the immutable pinset/encoding, bounded public RPC transport, snapshot validation, injected-wallet boundary, versioned attempt store, Web Locks/lease coordination, receipt/trace verification, and controller/renderer. The generated page contains one inline script and no external executable assets; unit sources remain separately testable, while all acceptance decisions fail closed on exact bytes, strict ABI decoding, canonical block evidence, durable state, and cross-tab serialization.

**Tech Stack:** Static HTML/CSS/JavaScript, EIP-1193 injected wallet, Base JSON-RPC and EIP-1898, Web Crypto SHA-256, pure browser Keccak-256, Web Locks, localStorage, Node.js test runner, JSDOM, Playwright Core, viem test oracles, pnpm/Vite production build.

---

**Approved spec:** `docs/superpowers/specs/2026-09-20-looper-3802-wallet-activation-design.md` at `48a3db8`

**Implementation constraints:** Follow `@test-driven-development` for each task, `@systematic-debugging` for unexpected failures, and `@verification-before-completion` before the final implementation claim. Keep deployment, production publishing, wallet connection, signature approval, transaction submission, and any other real onchain write out of this implementation. Tests and browser smoke must use mocks or a no-wallet context only.

**Step-size rule:** Treat every checkbox as one 2-5 minute action. Where a checkbox names a table of cases, add one row, run the stated focused command, and repeat before moving to the next row. Never implement a whole table before seeing its first expected RED failure, and never combine the focused commits named below.

## File map

### Production source and generated static route

- Create `apps/web/owner-tools/activate-looper-3802/index.template.html` - semantic UI, noindex/CSP metadata, immutable facts, buttons, status regions, and one inline-script marker.
- Create `apps/web/owner-tools/activate-looper-3802/src/00-namespace.js` - installs the non-writable internal namespace and shared deep-freeze/error utilities.
- Create `apps/web/owner-tools/activate-looper-3802/src/01-pinset-encoding.js` - immutable production pinset, strict hex/ABI primitives, pure SHA-256/Keccak helpers, exact calldata, transaction, future runtime, and v0.6 UserOperation hash encoding.
- Create `apps/web/owner-tools/activate-looper-3802/src/02-public-rpc-transport.js` - exact origin/method routing, timeouts, whole-batch failover, EIP-1898 capability handling, polling, and raw JSON-RPC evidence only.
- Create `apps/web/owner-tools/activate-looper-3802/src/03-snapshot-validator.js` - strict preflight/post-state decoding and immutable validated snapshots.
- Create `apps/web/owner-tools/activate-looper-3802/src/04-wallet-boundary.js` - the only injected-provider wrapper and argument-free `sendPinnedActivation()`.
- Create `apps/web/owner-tools/activate-looper-3802/src/05-attempt-store.js` - the only localStorage access, exact v1 schema/state graph validation, revisioned whole-record writes, and read-back verification.
- Create `apps/web/owner-tools/activate-looper-3802/src/06-cross-tab-coordinator.js` - the only Web Locks access, no-queue exclusive lock, 30-second lease, 5-second heartbeat, takeover, and lock-scoped mutation/submission orchestration.
- Create `apps/web/owner-tools/activate-looper-3802/src/07-receipt-trace-verifier.js` - strict direct/ERC-4337 transaction, receipt, UserOperation, event, trace, and receipt-block proof verification.
- Create `apps/web/owner-tools/activate-looper-3802/src/08-controller-renderer.js` - per-tab mutex, wallet generation, state sequencing, recovery/retry/acknowledgement controls, and text-only rendering.
- Create `apps/web/owner-tools/activate-looper-3802/src/09-bootstrap.js` - dependency wiring, event listeners, storage invalidation, and initial read-only refresh.
- Generate and commit `apps/web/owner-tools/activate-looper-3802/index.html` - exact deployable artifact with one inline script and no runtime imports.

### Build, scan, smoke, and tests

- Create `apps/web/scripts/build-activate-looper-3802.mjs` - deterministic concatenation into the template, `--check` freshness mode, and optional production-dist emission at `dist/activate-looper-3802/index.html`.
- Create `apps/web/scripts/scan-activate-looper-3802.mjs` - static boundary/URL/method/selector/secret scan over source and generated HTML.
- Create `apps/web/scripts/smoke-activate-looper-3802-no-wallet.mjs` - local Playwright smoke with no injected provider and no send-capable bridge.
- Modify `apps/web/package.json` - add focused build/scan/smoke scripts and emit the route after the existing Vite build.
- Create `apps/web/test/activate-looper-3802-fixture.mjs` - deterministic clocks, fetch/RPC fixtures, wallet mock, localStorage, Web Locks, trace/receipt builders, and generated-page loader.
- Create `apps/web/test/activate-looper-3802-pinset.test.mjs` - pure pinset, encoding, hashing, strict decoding, generated-artifact, and static-surface tests.
- Create `apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs` - transport routing, canonical anchoring, preflight, simulation, gas, and post-state tests.
- Create `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs` - exact store schema/state graph, lease/Web Locks, handoff, retry, acknowledgement, and reorg-transition tests.
- Create `apps/web/test/activate-looper-3802-receipt-trace.test.mjs` - direct and wrapped receipt attribution, UserOperation hashing, event/log-index, trace ancestry, and canonical post-state tests.
- Create `apps/web/test/activate-looper-3802-page.test.mjs` - controller/rendering, wallet races, controls, integration, no-wallet behavior, and forbidden-action tests.
- Create `apps/web/test/activate-looper-3802-scan.test.mjs` - isolated temporary-fixture tests proving each static scanner rejection.

The approved spec remains unchanged unless a separately reviewed, read-only production fact proves it wrong. Do not modify shared SPA routes, API services, contracts, deployment files, or any existing owner tool.

## Chunk 1: Deterministic artifact, pure pinset, and transport

### Task 1: Establish the generated noindex route and static contract

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/index.template.html`
- Create: `apps/web/owner-tools/activate-looper-3802/src/00-namespace.js`
- Create as explicit comment-only placeholders: `apps/web/owner-tools/activate-looper-3802/src/01-pinset-encoding.js` through `apps/web/owner-tools/activate-looper-3802/src/09-bootstrap.js`
- Create: `apps/web/scripts/build-activate-looper-3802.mjs`
- Modify: `apps/web/package.json`
- Create: `apps/web/test/activate-looper-3802-pinset.test.mjs`
- Generate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write the failing generated-artifact test**

Add a permanent test that requires `index.html` to exist, equal the builder's expected bytes, and contain the template's single `/*__ACTIVATE_LOOPER_3802_INLINE__*/` marker replacement. The test naturally fails before generation because `index.html` is absent; do not assert that absence as the desired final behavior.

- [ ] **Step 2: Run the artifact test and verify RED**

```bash
node --test --test-name-pattern="generated artifact" apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: FAIL at `generated artifact is current` because `index.html` and the builder do not exist.

- [ ] **Step 3: Write the failing static DOM contract test**

Require the final DOM to have:

```js
assert.match(document.querySelector('meta[name="robots"]').content, /noindex, nofollow, noarchive/i);
assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
assert.equal(document.scripts.length, 1);
assert.equal(document.querySelectorAll('input, textarea, select, [contenteditable="true"]').length, 0);
assert.deepEqual(
  [...document.querySelectorAll('button')].map(({ id }) => id),
  ['connect', 'activate', 'resume', 'retry', 'acknowledge'],
);
```

Require a restrictive meta CSP with only inline style/script and the three approved RPC origins in `connect-src`. Require exact immutable DOM IDs for `network`, `connected-wallet`, `sponsor`, `holder`, `loopers-proxy`, `loopers-implementation`, `registry`, `account-implementation`, `salt`, `account`, `account-deployment-state`, `account-balance`, `identity-id`, `identity-uri`, `identity-controller-status`, `estimated-gas`, `estimated-fee`, `transaction-semantics`, `status`, and `transaction`. `activate`, `resume`, `retry`, and `acknowledge` start disabled or hidden.

- [ ] **Step 4: Run the DOM test and verify RED**

Run:

```bash
node --test apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: FAIL at `static route exposes only the approved noindex surface` because the template/generated page do not exist.

- [ ] **Step 5: Create the template, namespace, and fixed source manifest**

Create all ten numbered source paths now. `01` through `09` contain only `// Implemented by Task N.` placeholders so the fixed manifest is valid from the first commit. The builder must use this exact ordered list, normalize LF line endings, reject missing/extra manifest files and a missing/duplicate marker, concatenate source bytes without minification or network access, and prepend `<!-- Generated by scripts/build-activate-looper-3802.mjs; edit template/src, not this file. -->`. `--check` compares expected bytes to committed `index.html` and exits nonzero on drift. `--dist` also writes `apps/web/dist/activate-looper-3802/index.html` after Vite has created `dist`.

- [ ] **Step 6: Add only the builder package command**

Do not add scan/smoke commands before their scripts exist. Add only:

```json
{
  "build:activate-looper-3802": "node scripts/build-activate-looper-3802.mjs"
}
```

Extend the existing `build` script only by appending `node scripts/build-activate-looper-3802.mjs --dist` after Vite and `write-allowlist-entry.mjs` complete. Do not alter existing build flags or routes.

- [ ] **Step 7: Generate and verify GREEN**

Run:

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test apps/web/test/activate-looper-3802-pinset.test.mjs
pnpm --filter @helixa/multipass-web exec node scripts/build-activate-looper-3802.mjs --check
```

Expected: builder exits 0; `generated artifact is current` and `static route exposes only the approved noindex surface` PASS; `--check` exits 0.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/web/package.json apps/web/scripts/build-activate-looper-3802.mjs apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-pinset.test.mjs
git commit -m "test: define Looper activation static route"
```

### Task 2: Implement the pure pinset, strict encoding, and cryptographic primitives

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/01-pinset-encoding.js`
- Modify: `apps/web/test/activate-looper-3802-pinset.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing pure-unit tests**

Load `00-namespace.js` and `01-pinset-encoding.js` in a fresh VM context. Use viem only as a test oracle. Assert every approved address, raw EIP-1967 word, byte length, SHA-256, selector, topic, exact raw return, URI, gas cap, RPC URL, storage key, and lock name.

The production pinset object must encode this complete execution inventory rather than reading values from DOM/storage/network configuration:

| Identity | Address | Bytes | SHA-256 | Raw implementation slot |
|---|---|---:|---|---|
| Loopers proxy | `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a` | 177 | `0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662` | `0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908` |
| Loopers implementation | `0x68F22e3563891167D37C86391c4a83449c83e908` | 23,210 | `0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec` | n/a |
| ERC-6551 registry | `0x000000006551c19487814612e58FE06813775758` | 571 | `0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56` | n/a |
| ERC-6551 implementation | `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF` | 685 | `0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5` | n/a |
| Adapter proxy | `0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27` | 163 | `0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017` | `0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9` |
| Adapter implementation | `0x0f81bd4EDD4879734361A1A44460264CBf6F94c9` | 12,732 | `0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be` | n/a |
| Identity Registry proxy | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | 130 | `0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85` | `0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02` |
| Identity Registry implementation | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` | 14,474 | `0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1` | n/a |
| Sponsor designator | `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE` | 23 | `0xe2b8058ebac7d6b7f1496596a6508894891adab1c1ef9712a4a5d50ff32e5267` | `0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72` |
| Sponsor delegate | `0x7702cb554e6bFb442cb743A7dF23154544a7176C` | 3,318 | `0x97497b31483a21567c1c520851c6e8e65e6ce906dc9236843668a21c3cd691e3` | n/a |
| Sponsor implementation | `0x000100abaad02f1cfC8Bbe32bD5a564817339E72` | 18,002 | `0xa7dba5dc36ffc7d92796b2d17cd61f4e89d7ace44ff953def7e39e444c278bfa` | n/a |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 23,689 | `0x009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c` | n/a |

Also pin chain `8453/0x2105`, holder `0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4`, account `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38`, salt `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`, identity `90994/0x16372`, URI `https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json`, sponsor designator bytes `0xef01007702cb554e6bfb442cb743a7df23154544a7176c`, EIP-1967 slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`, event topics from the spec, storage/lock names, gas cap `150000`, and all seven exact raw call results printed in the spec. Tests compare every raw return byte before decoding.

Pin these additional activation-critical calls as exact fixtures; concatenate the shown selector with the shown argument words and reject any raw byte difference or trailing byte:

```text
Loopers.owner():
  0x8da5cb5b -> 0x000000000000000000000000709d8d528d2c0c8a408107e74b38a01fa14e44ae
Loopers.erc6551Registry():
  0x056d5afe -> 0x000000000000000000000000000000006551c19487814612e58fe06813775758
Loopers.erc6551Implementation():
  0xb3dd12a2 -> 0x0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bf
Loopers.erc6551Salt():
  0x0df783f8 -> 0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee
Loopers.ownerOf(3802):
  0x6352211e || uint256(3802) -> 0x00000000000000000000000017d7dfa154dc0828ade4115b9eb8a0a91c0fbde4
Loopers.tokenBoundAccount(3802):
  0x0be76ed6 || uint256(3802) -> 0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38
Registry.account(implementation,salt,8453,Loopers,3802):
  0x246a0021 || addressWord(implementation) || salt || uint256(8453) || addressWord(Loopers) || uint256(3802)
  -> 0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38
Loopers.erc8004BoundByLooper(3802):
  0x5adbbdce || uint256(3802) -> 0x0000000000000000000000000000000000000000000000000000000000000001
Loopers.erc8004AgentIdByLooper(3802):
  0x4c4a2696 || uint256(3802) -> 0x0000000000000000000000000000000000000000000000000000000000016372
Loopers.erc8004AgentURI(3802):
  0xf195e791 || uint256(3802)
  -> 0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004968747470733a2f2f617277656176652e6e65742f7743304c364c525f494773535f53674151467253626e7a736a566741624f6c775a63565f6c6272705f76382f333830322e6a736f6e0000000000000000000000000000000000000000000000
```

Required exact encoding assertions include:

```js
const expectedCalldata = '0x8a54c52f0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bfff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda';
const expectedCalldataHash = '0xa6b969253d21114fb839051bbdff1b46a66a0427e181eabee4bf0dd1ccf02def';
const expectedRuntime = '0x363d3d373d3d363d731e3787bc9b2e6d7763de1dccf10e9d062f3b43bf5af43d82803e903d91602b57fd5bf3ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda';
```

Assert runtime length `173`, runtime SHA-256 `0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a`, and exact five-key transaction object ordered as `chainId`, `from`, `to`, `data`, `value`. Mutate each field and add each plausible extra field (`gas`, fee fields, nonce, access list) to prove rejection.

Test strict hex/quantity/address/bytes32/ABI decoders against uppercase, odd-length, noncanonical quantities, bad offsets, overlap, truncation, nonzero address high bytes, malformed bools, missing padding, and trailing bytes. Test pure Keccak-256 with empty bytes, `abc`, exact calldata, and randomized vectors against viem. Test local ERC-4337 v0.6 UserOperation hashing against viem ABI encoding and fixed fixtures.

- [ ] **Step 2: Run the pinset/codec tests and verify RED**

```bash
node --test --test-name-pattern="pinset|strict ABI|exact activation" apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: FAIL first at `pinset contains every approved execution identity` because `01-pinset-encoding.js` is still a placeholder.

- [ ] **Step 3: Implement the minimal pure unit**

The unit must have no DOM, provider, fetch, storage, clock, or lock access. Freeze the complete pinset and expose only pure functions. Include the exact selectors:

```text
owner 0x8da5cb5b; ownerOf 0x6352211e; erc6551Registry 0x056d5afe;
erc6551Implementation 0xb3dd12a2; erc6551Salt 0x0df783f8;
tokenBoundAccount 0x0be76ed6; registry.account 0x246a0021;
erc8004BoundByLooper 0x5adbbdce; erc8004AgentIdByLooper 0x4c4a2696;
erc8004AgentURI 0xf195e791; identityRegistry 0x134e18f4;
bindingOf 0x4d69ebc2; isController 0x158e711d; tokenURI 0xc87b56dd;
sponsor.implementation 0x5c60da1b; sponsor.entryPoint 0xb0d691fe;
account.token 0xfc0c546a; account.owner 0x8da5cb5b; account.state 0xc19d93fb;
account.isValidSigner 0x523e3260; execute 0xb61d27f6;
executeBatch 0x34fcd5be; forbidden replayable execute 0x2c2abd1e;
handleOps 0x1fad948c; getUserOpHash 0xa6193531; createAccount 0x8a54c52f
```

Implement local v0.6 hashing exactly as:

```text
packed = abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
  callGasLimit, verificationGasLimit, preVerificationGas,
  maxFeePerGas, maxPriorityFeePerGas, keccak256(paymasterAndData))
userOpHash = keccak256(abi.encode(keccak256(packed), entryPoint, 8453))
```

Do not add a runtime dependency or remote library. Treat Web Crypto SHA-256 as an injected pure dependency. Implement strict codecs first; leave Keccak/UserOperation helpers throwing `not implemented` for the next RED cycle.

- [ ] **Step 4: Regenerate and verify pinset/codec GREEN**

Run:

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="pinset|strict ABI|exact activation" apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: pinset, exact calldata/runtime/transaction, SHA-256, and strict ABI codec tests PASS.

- [ ] **Step 5: Commit the pure pinset/codec slice**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-pinset.test.mjs
git commit -m "feat: pin Looper activation encoding"
```

- [ ] **Step 6: Run the Keccak/UserOperation tests and verify RED**

```bash
node --test --test-name-pattern="Keccak|UserOperation" apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: FAIL at the first Keccak vector with `not implemented`.

- [ ] **Step 7: Implement pure Keccak-256 and exact v0.6 hashing**

Implement the permutation locally with fixed 64-bit round constants and rotations, then implement the exact packed formula above. The fixed UserOperation fixture must include nonempty dynamic byte fields and nonzero gas/fee fields; compare its local hash to both viem's ABI/Keccak oracle and a hard-coded expected bytes32 so the test does not depend only on a second implementation.

- [ ] **Step 8: Regenerate and verify cryptographic GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="Keccak|UserOperation" apps/web/test/activate-looper-3802-pinset.test.mjs
```

Expected: all Keccak and v0.6 UserOperation hashing tests PASS.

- [ ] **Step 9: Run the complete pinset file and commit the cryptographic slice**

```bash
node --test apps/web/test/activate-looper-3802-pinset.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-pinset.test.mjs
git commit -m "feat: hash wrapped activation operations"
```

Expected: the complete unfiltered pinset file PASSes before commit.

### Task 3: Implement the bounded public RPC transport

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/02-public-rpc-transport.js`
- Create: `apps/web/test/activate-looper-3802-fixture.mjs`
- Create: `apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing routing and bounds tests**

Create a typed request-kind fixture and assert exact routing:

- `mainnet.base.org`: chain, block, code, storage, balance, call, estimate, gas price, transaction, receipt.
- `base.drpc.org`: the same standard methods as bounded fallback plus the only trace route.
- `base-rpc.publicnode.com`: chain, block, transaction, and receipt only.
- `debug_traceTransaction` parameters exactly `[hash,{tracer:'callTracer',timeout:'20s',tracerConfig:{onlyTopCall:false,withLog:true}}]`.

Pin these production bounds: `STANDARD_TIMEOUT_MS = 10000`, `TRACE_TIMEOUT_MS = 25000`, `MAX_STANDARD_RESPONSE_BYTES = 1048576`, `MAX_TRACE_RESPONSE_BYTES = 4194304`, `MAX_HTTP_ATTEMPTS_PER_ORIGIN = 1`, and `RETRY_DELAYS_MS = []`. Standard state failover is one complete Mainnet batch followed by one complete dRPC batch only after network/abort, HTTP 429/5xx, JSON-RPC `-32005`/`-32016`, or a message matching `rate|limit|busy|capacity|temporar`; semantic errors fail immediately. There is no per-call retry and never a PublicNode state fallback.

The sole semantic-error downgrade is EIP-1898 capability detection: error code must be `-32602` or `-32000` and the message must match `blockHash|requireCanonical|EIP-1898|invalid argument.*object|cannot unmarshal.*object` case-insensitively. Only that pair permits same-origin number-tag fallback with before/after hash guards. Every other semantic error, including unknown block/canonicality failure, fails immediately. Add positive cases for each allowed phrase and negative near-misses.

The closed request union and parameter mapping is exact:

```text
chainId -> eth_chainId []
latestBlock -> eth_getBlockByNumber ["latest",false]
blockByNumber(number) -> eth_getBlockByNumber [canonicalQuantity(number),false]
code(address,blockRef) -> eth_getCode [address,blockRef]
storage(address,slot,blockRef) -> eth_getStorageAt [address,slot,blockRef]
balance(address,blockRef) -> eth_getBalance [address,blockRef]
call(transaction,blockRef) -> eth_call [transaction,blockRef]
estimate(transaction,blockRef) -> eth_estimateGas [transaction,blockRef]
gasPrice -> eth_gasPrice []
transaction(hash) -> eth_getTransactionByHash [hash]
receipt(hash) -> eth_getTransactionReceipt [hash]
trace(hash) -> debug_traceTransaction [hash,exactCallTracerOptions]
```

Reject unknown request keys. A success envelope has exactly `jsonrpc`, `id`, and `result`; an error envelope has exactly `jsonrpc`, `id`, and `error`, where error has integer `code`, string `message`, and optional `data`. Reject both/neither result/error, id mismatch, trailing non-JSON bytes, and oversized bodies.

Assert `redirect: 'error'`, no credentials/query strings, response URL equality, JSON-RPC id equality, strict `{jsonrpc:'2.0', id, result}` shape, response-size limit, request timeout, maximum attempts, no overlapping poll, and no retry for semantic RPC errors. Prove PublicNode can never serve code/storage/balance/call/estimate in this pilot.

Test head anchoring: fetch latest from all three, choose the minimum height, then require all three to return the same non-null hash for that exact number. Test one provider behind, hash disagreement, null block, wrong chain, timeout, redirect, 429/5xx bounded retry, and permanent failure.

Test whole-batch behavior: Mainnet either supplies the complete anchored state batch or the entire batch is discarded and rerun on dRPC. No snapshot may mix Mainnet and dRPC raw state. If EIP-1898 is unsupported, require same number/hash immediately before and after the complete batch. Never fall back one individual state read.

- [ ] **Step 2: Run routing/bounds tests and verify RED**

Run:

```bash
node --test apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: FAIL first at `routes each request kind to the exact approved origin/method/params` because the transport unit is a placeholder.

- [ ] **Step 3: Implement the transport with dependency injection**

Expose a factory receiving `fetch`, `AbortController`, timer functions, and monotonic clock. Accept only frozen request objects from a closed `kind` union. Return deep-frozen raw evidence annotated with origin and anchored block, but perform no ABI acceptance.

Use the exact constants/matrix above. A caller abort must stop all in-flight work. Never call `window.ethereum`, localStorage, or Web Locks. Implement routing/envelopes first; leave canonical-head and state-batch orchestration for the next RED cycle.

- [ ] **Step 4: Regenerate and verify routing/bounds GREEN**

Run:

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="routing|origin|envelope|timeout|response bytes" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: routing, method/parameter, envelope, origin, timeout, and byte-cap tests PASS.

- [ ] **Step 5: Commit the bounded transport slice**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-fixture.mjs apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
git commit -m "feat: bound Looper activation RPC routes"
```

- [ ] **Step 6: Run canonical head/state-batch tests and verify RED**

```bash
node --test --test-name-pattern="canonical head|whole state batch|EIP-1898" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: FAIL at `anchors the minimum three-origin height to one hash` because orchestration is not implemented.

- [ ] **Step 7: Implement canonical head and whole-batch failover**

Fetch all three latest blocks once, choose the minimum numeric height, and fetch that exact quantity from all three once. Require equal non-null number/hash. For state, first attempt the complete ordered request list on Mainnet using `{blockHash,requireCanonical:true}`. If the origin returns an unsupported-EIP-1898 semantic error, rerun the complete batch on that same origin with exact number/hash reads immediately before and after; do not mix modes. On an eligible transient failure discard the complete batch and repeat it on dRPC. PublicNode has no code path for state kinds.

- [ ] **Step 8: Regenerate and verify canonical GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="canonical head|whole state batch|EIP-1898" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: minimum-height/hash quorum, EIP-1898, guarded fallback, no mixed-origin batch, and PublicNode rejection tests PASS.

- [ ] **Step 9: Add chain-quorum and polling mechanics RED tests**

```bash
node --test --test-name-pattern="three-origin chain quorum|receipt poll generator|head poll generator|abort polling" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: FAIL first at `requires 0x2105 from all three origins` because chain quorum/poll generators are absent.

- [ ] **Step 10: Implement bounded non-overlapping poll generators**

Require all three `eth_chainId` results to equal `0x2105` before head selection. Transport owns only mechanics: `pollTransactionReceipt({hash,createdAtMs,signal})` is an async iterator yielding one frozen Mainnet/dRPC transaction+receipt evidence item at a time, immediately then after 2-second sleeps through 120 seconds and 10-second sleeps until 600 seconds; it never overlaps requests and abort stops the next request. `pollHeads({deadlineMs,signal})` yields one three-origin head set immediately then every 2 seconds without overlap until the fixed deadline. `finalReceiptQuorum(hash)` performs exactly one Mainnet/dRPC transaction+receipt read and one PublicNode receipt read. The controller owns when to stop, receipt/deadline persistence, state transitions, and coordinator-gated mutations.

- [ ] **Step 11: Regenerate and verify chain/poll GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="three-origin chain quorum|receipt poll generator|head poll generator|abort polling" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: wrong-chain, exact cadence, non-overlap, abort, deadline, and final-quorum mechanics PASS.

- [ ] **Step 12: Run the complete transport file and commit**

```bash
node --test apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-fixture.mjs apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
git commit -m "feat: anchor Looper activation RPC snapshots"
```

Expected: the complete unfiltered RPC/snapshot file PASSes before commit.

## Chunk 2: Snapshot validation and write boundaries

### Task 4: Validate the complete anchored preflight snapshot

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/03-snapshot-validator.js`
- Modify: `apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing preflight matrix tests**

Create one valid raw snapshot fixture at a single canonical block and table-driven mutations for every required invariant:

- public chain `0x2105`; connected sponsor and live Loopers owner equal `0x709D...44aE`;
- exact code bytes, lengths, SHA-256, raw EIP-1967 slots, low-20-byte implementation, and zero high bytes for Loopers, Adapter8004, Identity Registry, sponsor/delegate/implementation, registry/account implementation, and EntryPoint;
- exact sponsor 23-byte EIP-7702 designator/delegate, sponsor implementation/entryPoint raw results;
- exact Loopers ERC-6551 registry/implementation/salt calls;
- holder, `tokenBoundAccount(3802)`, and registry `account(...)`;
- pre-activation account code `0x` and balance `0x0`;
- exact Loopers ERC-8004 bound/id/URI and the five Adapter/Identity raw plus decoded call results;
- exact five-key transaction, `eth_call` sole 32-byte account result, estimate present and `<= 150000`, gas price present, and display fee multiplication.

Mutate every byte length/hash/slot/call, malformed result, trailing byte, owner/holder/account/config/URI/controller, account deployment/funding state, estimate `150001`, simulation, gas price, origin/block annotation, and pre/post guard hash. Each must return one fail-closed error and no partial validated object.

Add explicit account-state classifications: `undeployed_zero`, `deployed_exact`, `unexpected_funded`, `malformed_code`, `wrong_code`. Only `undeployed_zero` is send-ready; `deployed_exact` routes to post-state verification; all others block.

- [ ] **Step 2: Run the valid-snapshot test and verify RED**

```bash
node --test --test-name-pattern="validates anchored preflight" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: FAIL at `validates anchored preflight` because `03-snapshot-validator.js` is a placeholder.

- [ ] **Step 3: Implement the valid immutable snapshot path**

The validator accepts only the transport bundle and explicit wallet facts. Compare both raw bytes and decoded values, reject unknown object keys, require exact ABI lengths/padding, hash exact code bytes, and return a deeply frozen `ValidatedPreflight` only after all checks pass. Keep simulation and gas evidence in the returned object so `AttemptV1.preflight` can persist exact raw results. The display fee is informational only; do not construct fee fields. The unit has no fetch/provider/storage/clock/lock/DOM access.

- [ ] **Step 4: Regenerate and verify the valid path GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="validates anchored preflight" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: the exact fixture returns one frozen `ValidatedPreflight` and PASSes.

- [ ] **Step 5: Add drift rows one at a time and close each RED**

For each mutation listed in Step 1, add one row, run the command below, add only the strict comparison needed for that row, and rerun until it passes before adding the next row:

```bash
node --test --test-name-pattern="rejects preflight drift" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected per iteration: the new row first FAILs because the mutation was accepted, then PASSes with one fail-closed error and no partial snapshot.

- [ ] **Step 6: Add account classification/simulation/gas rows one at a time**

Use the same RED/GREEN loop for `undeployed_zero`, `deployed_exact`, funded, malformed/wrong code, exact simulation return, trailing simulation bytes, missing estimate, `150000`, `150001`, missing gas price, and fee multiplication:

```bash
node --test --test-name-pattern="classifies account|simulation|gas cap" apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
```

Expected: each new row first FAILs, then all classification/simulation/gas rows PASS.

- [ ] **Step 7: Regenerate, run the complete snapshot file, and commit Task 4**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs
git commit -m "feat: validate Looper activation snapshot"
```

Expected: the complete RPC/snapshot test file PASSes before the commit.

### Task 5: Enforce the injected-wallet boundary

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/04-wallet-boundary.js`
- Create: `apps/web/test/activate-looper-3802-page.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing wallet-boundary tests**

Assert the provider allowlist is exactly:

```js
['eth_chainId', 'eth_accounts', 'eth_requestAccounts', 'wallet_switchEthereumChain', 'eth_sendTransaction']
```

Prove connect, account read, chain read/switch, missing provider, wrong return shape, provider rejection, and event registration. Prove `sendPinnedActivation` takes zero arguments, performs no provider read and no await, reconstructs the exact transaction internally, and immediately invokes exactly:

```js
provider.request({ method: 'eth_sendTransaction', params: [EXACT_TRANSACTION] })
```

Passing any argument, changing any transaction field, or requesting any other method must throw before provider invocation. Public transport data must never be accepted as a transaction argument.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```bash
node --test --test-name-pattern="wallet boundary" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: FAIL first at `wallet boundary exposes only approved methods` because `04-wallet-boundary.js` is a placeholder.

- [ ] **Step 3: Implement the minimal boundary**

Inject the EIP-1193 provider into a factory. Expose only `hasProvider`, `readState`, `connectAndSwitch`, `onWalletChange`, and argument-free `sendPinnedActivation`. Keep `eth_sendTransaction` in this file only. Return the promise immediately so the controller can perform the synchronous prepared/send handoff.

- [ ] **Step 4: Regenerate and verify GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="wallet boundary" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: all boundary-only tests PASS; `sendPinnedActivation()` makes exactly one immediate provider call and no public-RPC test observes a wallet call. Defer final asynchronous wallet read, generation, prepared persistence, and integrated journal ordering to Task 8.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-page.test.mjs
git commit -m "feat: isolate Looper activation wallet boundary"
```

### Task 6: Implement the exact versioned attempt store

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/05-attempt-store.js`
- Create: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing schema and state-graph tests**

Encode the exact `StoreV1`, `AttemptV1`, receipt/observation, pinset, transaction, preflight, history, state, and reason definitions from the spec in fixture builders. Test every legal edge and table-test every illegal edge.

Required validation includes:

- one key only: `loopers.walletActivation.8453.3802.v1`;
- schema/version/chain/token fixed; unknown or missing keys rejected at every level;
- safe nonnegative integers, lowercase canonical hex quantities/hashes, strict UUIDs, lowercase persisted addresses;
- `attempts.length` 0 only for fresh Activate lease with null active ID, otherwise 1 or 2;
- unique IDs, retry ordinals 0/1, exact pinset/transaction, contiguous history with max 20 entries;
- evidence required/forbidden by state, persisted deadlines, active attempt, and bidirectional supersession links;
- revision starts at 1 and increments exactly once per whole-record write;
- invalid JSON/corruption blocks reads for mutation and is never repaired/deleted.

Test write/read-back mismatch, quota errors, concurrent overwrite simulation, repeated/decreasing/unsafe revision, and storage-event invalidation callback.

Encode this closed transition table, with every unlisted pair illegal:

| From | To/action | Reason | Required evidence/action |
|---|---|---|---|
| none | original `prepared` | `activate` | fresh validated preflight; history starts `null -> prepared` |
| `prepared` | `submitted` | `provider_hash` | valid lowercase bytes32 |
| original `prepared` | delete sole attempt/store | `provider_rejected_retry` is not used | same-lifetime exact EIP-1193 code `4001` only |
| retry `prepared` | `retry_cancelled` | `provider_rejected_retry` | retain both attempts and links; retry consumed |
| `prepared` | `uncertain_hashless` | `provider_ambiguous` or `reload_prepared` | no trusted hash |
| `submitted`/`uncertain_hashed` | `confirmed_attributed` | `receipt_attributed` | canonical receipt + registry log + full post-state |
| `submitted`/`uncertain_hashed` | `observed_unattributed` | `state_observed_unattributed` | canonical full post-state; receipt/trace insufficient |
| `submitted`/`uncertain_hashed` | `reverted` | `receipt_reverted` | canonical revert + exact undeployed/zero account + pins |
| `submitted` | `uncertain_hashed` | `receipt_timeout`, `confirmation_timeout`, `canonicality_lost`, or `evidence_incomplete` | hash retained |
| any `uncertain_hashless` | `observed_unattributed` | `state_observed_unattributed` | canonical full post-state, including an ambiguous retry |
| original `uncertain_hashless` | original `superseded` + retry `prepared` | `retry_superseded` + retry `activate` | one atomic revision and links |
| receipt terminal | `uncertain_hashed` | `canonicality_lost` or `evidence_incomplete` | terminal evidence lost |
| hashless observed terminal | `uncertain_hashless` | `canonicality_lost` or `evidence_incomplete` | observation/post-state lost |
| hashed observed terminal | `uncertain_hashed` | `canonicality_lost` or `evidence_incomplete` | observation/post-state lost |
| retry `reverted`/`retry_cancelled` | `observed_unattributed` | `late_original_observed` | late original exact full post-state |

Use `retryOrdinal`, evidence fields, supersession links, and acknowledgement rules to disambiguate rows. `prepared` has null receipt/observation/hash; `submitted` requires hash; `confirmed_attributed` requires canonical receipt and `registryLog`; `observed_unattributed` requires `observation`; `reverted` requires canonical receipt; `superseded` requires both links; `retry_cancelled` is terminal and retained.

Acknowledgement retains the complete store and only sets `acknowledgedAtMs` for `confirmed_attributed`, `observed_unattributed`, `retry_cancelled`, and every retryOrdinal `1` terminal, including retry `reverted`. It may delete only an isolated retryOrdinal `0` reverted attempt with one attempt, no links, canonical reverted receipt, and exact undeployed account.

- [ ] **Step 2: Run coordination tests and verify RED**

Run:

```bash
node --test --test-name-pattern="StoreV1|attempt transition|corrupt store|revision" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: FAIL first at `accepts the exact StoreV1 schema` because `05-attempt-store.js` is a placeholder.

- [ ] **Step 3: Implement synchronous validated writes**

The store factory receives a Storage-like object and owns every `getItem`, `setItem`, and `removeItem`. Expose read-only `read()` plus coordinator-only mutation methods that synchronously:

1. re-read and validate latest bytes;
2. apply one legal transition/lease mutation without dropping history;
3. increment revision exactly once;
4. write the complete canonical JSON record;
5. read back and require exact validated equality.

Do not catch corruption into `null`. Expose exactly three deletion-capable operations: `abandonFreshLease()` validates the current lease-only zero-attempt record and directly removes the key; `rejectOriginalPrepared4001()` validates the current leased sole original prepared attempt and directly removes the key in one synchronous outcome; and `acknowledgeIsolatedOriginalRevert()` validates then removes the one eligible nonempty terminal store. Never write a lease-cleared zero-attempt intermediate record, never split attempt/store deletion into two mutations, and retain every other store.

- [ ] **Step 4: Add one legal transition and one illegal transition at a time**

For each state/reason/evidence pair, add one fixture row, run the command below to see the new row fail, add only that edge to the transition table, and rerun to GREEN:

```bash
node --test --test-name-pattern="attempt transition" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected per row: one RED rejection/acceptance mismatch, then PASS with exact history `from/to/atMs/reason`, timestamps, active ID, links, and evidence.

- [ ] **Step 5: Regenerate and verify complete store GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="StoreV1|attempt transition|corrupt store|revision" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: schema, transition, corruption, revision, read-back, and three deletion-rule tests PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
git commit -m "feat: persist versioned activation attempts"
```

### Task 7: Serialize all mutation and submission with Web Locks and leases

**Files:**
- Create: `apps/web/owner-tools/activate-looper-3802/src/06-cross-tab-coordinator.js`
- Modify: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing two-tab and lease tests**

Use a deterministic fake LockManager and clock. Assert exact request:

```js
navigator.locks.request(
  'loopers.walletActivation.8453.3802.submit.v1',
  { mode: 'exclusive', ifAvailable: true },
  callback,
);
```

Cover unavailable API, throw, callback `null`, simultaneous Activate/Retry, no queued stale action, foreign unexpired lease, expiry without lock, expired takeover while locked, owner/lease rotation, 30,000 ms TTL, 5,000 ms heartbeat, throttled heartbeat while lock remains authoritative, crash/reload takeover, storage events, stale lease ID, stale revision, and read-back failure. Lock-unavailable/null/throw, foreign-lease, and stale-precondition failures produce zero store mutation and zero wallet invocation. Failures after lease installation may retain revisioned lease/heartbeat/crash evidence and must follow their exact cleanup/state rule.

Prove Activate and Retry hold one Web Lock through provider outcome and durable final mutation; the lock callback promise cannot resolve earlier. Heartbeats stop in `finally`. Resume and Acknowledge acquire it for each mutation. Normal completion clears only the lease after the durable outcome; a pre-prepared fresh Activate directly removes only the validated lease-only store.

- [ ] **Step 2: Run lock-acquisition tests and verify RED**

```bash
node --test --test-name-pattern="Web Lock|no queued|foreign lease" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: FAIL first at `requests the exact no-queue exclusive Web Lock` because `06-cross-tab-coordinator.js` is a placeholder.

- [ ] **Step 3: Implement coordinator-only mutation authority**

Create one in-memory `ownerTabId` from `crypto.randomUUID()`. Under the lock, always re-read current storage, validate foreign lease rules, install/take over lease, start heartbeat, and expose only purpose-specific callbacks (`activate`, `retry`, `resume`, `acknowledge`). The coordinator cannot construct calldata or call the provider directly; it receives a synchronous handoff callback from the controller.

- [ ] **Step 4: Verify lock/lease acquisition GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="Web Lock|no queued|foreign lease" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: exact lock request, unavailable/null/throw, no-queue, foreign lease, and locked takeover tests PASS.

- [ ] **Step 5: Add heartbeat/crash/stale-write cases one at a time**

Run each new row RED, implement only the lease heartbeat or revision guard it requires, then rerun GREEN:

```bash
node --test --test-name-pattern="heartbeat|crash takeover|stale write|storage event" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: all 30-second TTL, 5-second heartbeat, throttling, crash, lease-ID, revision, read-back, and storage-event rows PASS.

- [ ] **Step 6: Regenerate, run the complete coordination file, and commit Task 7**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
git commit -m "feat: serialize Looper activation tabs"
```

Expected: all store, deletion, read-back, lock, lease, heartbeat, crash, stale-write, and storage-event tests PASS before commit.

## Chunk 3: Durable handoff, receipt attribution, and recovery

### Task 8: Implement exact initial/retry handoffs and complete attempt transitions

**Files:**
- Create by replacing its Task 1 placeholder: `apps/web/owner-tools/activate-looper-3802/src/08-controller-renderer.js` (initial controller portion)
- Modify: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-page.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing handoff/state tests**

Instrument an ordered journal. For initial Activate require all async preflight/simulation/final anchored account checks to finish, then exactly consecutive synchronous events:

```text
store prepared whole-record write
store prepared read-back
wallet sendPinnedActivation invocation
first promise await
```

For Retry require final async eligibility/preflight/account check, then one synchronous write that marks original `superseded`, appends retry `prepared`, links both, read-backs, and immediately invokes the wallet.

Cover all approved outcomes: valid hash to `submitted`; initial code `4001` removes only the same-lifetime original; retry `4001` becomes durable `retry_cancelled`; any other error/malformed hash/reload/pre-hash generation race becomes `uncertain_hashless`; valid hash persists despite a generation change. Reloaded `prepared` becomes `uncertain_hashless` and never guesses invocation.

Test `waitUntilMs = createdAtMs + 600000`, exact three-origin quorum, retryOrdinal 0 only, one retry maximum, no automatic retry, deployed-account conversion to `observed_unattributed`, conflicting/unavailable evidence retaining uncertainty, and superseded/late-original rules.

- [ ] **Step 2: Run initial-handoff tests and verify RED**

```bash
node --test --test-name-pattern="prepared/send handoff|provider outcome" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: FAIL first at `invokes the wallet on the statement after prepared read-back` because the controller handoff is absent.

- [ ] **Step 3: Implement non-async handoff helpers**

The function that persists and invokes must not be `async`:

```js
function persistPreparedAndInvoke(writer, wallet, preparedDraft) {
  const stored = writer.commitPrepared(preparedDraft); // synchronous write plus read-back
  const sendPromise = wallet.sendPinnedActivation();   // next statement, no await between
  return Object.freeze({ stored, sendPromise });
}
```

Implement retry with the same non-async shape:

```js
function persistRetryAndInvoke(writer, wallet, originalId, retryDraft) {
  const stored = writer.commitRetryPrepared(originalId, retryDraft); // one revision: original uncertain_hashless only -> superseded reason retry_superseded, linked retry null -> prepared reason activate, activeAttemptId = retry.id
  const sendPromise = wallet.sendPinnedActivation();                 // next statement
  return Object.freeze({ stored, sendPromise });
}
```

`commitRetryPrepared` requires the original to be `uncertain_hashless`, retryOrdinal `0`, past `waitUntilMs`, hashless, and freshly proven eligible; it rejects `prepared` and every other state. It preserves all original history/evidence, sets both supersession links, appends the retry's `null -> prepared` transition at the same `atMs`, updates both `updatedAtMs`, and retains the current lease. Initial valid hash appends `provider_hash` and sets active original to submitted; initial `4001` validates the current lease and directly removes the key while the Web Lock is still held, then allows the lock callback to finish; retry `4001` appends `provider_rejected_retry`, leaves original superseded, keeps retry active/consumed, durably clears only the lease, then allows the lock callback to finish. Every ambiguous outcome appends `provider_ambiguous`; reload of prepared appends `reload_prepared`. Keep per-tab mutex/generation handling in the controller and route every durable mutation/provider send through the coordinator.

- [ ] **Step 4: Regenerate and verify initial-handoff GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="prepared/send handoff|provider outcome" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: consecutive journal ordering and provider hash/4001/ambiguous/reload outcomes PASS.

- [ ] **Step 5: Run retry-eligibility/handoff tests and close RED to GREEN**

```bash
node --test --test-name-pattern="retry eligibility|retry handoff|late original" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected before implementation: FAIL at `atomically supersedes original and prepares one retry`; after implementing the exact helper/rules above: all retry wait/quorum/one-time/cancel/revert/late-original rows PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-attempt-coordination.test.mjs apps/web/test/activate-looper-3802-page.test.mjs
git commit -m "feat: harden activation submission handoff"
```

### Task 9: Verify direct receipts and canonical post-state

**Files:**
- Create by replacing its placeholder: `apps/web/owner-tools/activate-looper-3802/src/07-receipt-trace-verifier.js`
- Modify: `apps/web/owner-tools/activate-looper-3802/src/08-controller-renderer.js` (poll/fetch/persist orchestration only)
- Create: `apps/web/test/activate-looper-3802-receipt-trace.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-fixture.mjs`
- Modify: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing direct-transaction tests**

Build strict transaction/receipt/event fixtures. Require requested hash, transaction hash, and receipt hash equality; canonical Base chain; exact direct `from/to/input/value`; status handling; exact receipt block coordinates; unique canonical receipt `logIndex` quantities; and exactly one registry-frame `ERC6551AccountCreated` event decoding to all six pinned values.

At the canonical receipt block, rerun every code, slot, configuration, ownership, deterministic-address, sponsor, and ERC-8004 invariant from preflight, but explicitly do not rerun undeployed-account readiness, simulation, estimate, gas-price, or fee checks. Replace those pre-send checks with exact 173-byte account runtime/hash, `token() == (8453,Loopers,3802)`, current/pinned `owner()`, `state() == 0`, `isValidSigner(holder,0x) == 0x523e3260`, zero balance, and unchanged ERC-8004 ID/URI/binding/owner/controller.

Test polling exactly: 2 seconds through 120 seconds, then 10 seconds until 600 seconds after `createdAtMs`, one final Mainnet/dRPC plus PublicNode receipt quorum, persisted receipt before confirmations, 2-second head polls only until `discoveredAtMs + 120000`, and three confirmations at `head >= receiptBlock + 2`. The deadline must never reset.

Negative cases include transaction mismatch, duplicate/missing event, malformed event, reverted with deployed account, incomplete post-state, reorg, confirmation timeout, receipt disappearance, and wrong receipt-array/log index evidence.

- [ ] **Step 2: Run receipt tests and verify RED**

Run:

```bash
node --test apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected: FAIL because verification is absent.

- [ ] **Step 3: Implement pure direct decoding and post-state request plans**

The verifier accepts already-fetched raw evidence and returns only `confirmed_attributed`, `observed_unattributed`, `reverted`, or the appropriate uncertain classification with required persisted evidence. It cannot fetch, persist, render, or submit. Its request-plan output is a closed list of typed transport requests. The controller executes polling/request plans, persists a discovered receipt and fixed confirmation deadline under the coordinator before any confirmation wait, then passes complete evidence back to the verifier.

A reverted receipt becomes `reverted` only when the account remains exactly undeployed/zero and every pin is exact. If exact post-state exists without attributable receipt evidence, return `observed_unattributed`; partial/conflicting evidence stays uncertain.

- [ ] **Step 4: Regenerate and verify direct decoding GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="direct transaction|registry event" apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected: exact direct envelope/event tests PASS; duplicate/malformed/mismatched evidence fails closed.

- [ ] **Step 5: Run polling/persistence tests and close RED to GREEN**

```bash
node --test --test-name-pattern="poll schedule|persists receipt|confirmation deadline|final receipt quorum" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected before controller orchestration: FAIL at `persists receipt before confirmation polling`; after implementation: exact 2s/10s/600s polling, fixed deadline, three confirmations, and final quorum tests PASS.

- [ ] **Step 6: Run post-state/reorg tests and close RED to GREEN**

```bash
node --test --test-name-pattern="receipt-block post-state|reverted receipt|canonicality" apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected before post-state classification: FAIL; after implementation: exact deployed post-state, reverted-only-if-undeployed, observed-unattributed, and uncertain classifications PASS.

- [ ] **Step 7: Commit Task 9**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test apps/web/test/activate-looper-3802-receipt-trace.test.mjs apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-fixture.mjs apps/web/test/activate-looper-3802-receipt-trace.test.mjs apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
git commit -m "feat: verify direct activation receipts"
```

Expected: both complete files PASS and all polling/persistence production/test changes are staged atomically.

### Task 10: Strictly attribute ERC-4337 wrapped transactions with trace proof

**Files:**
- Modify: `apps/web/owner-tools/activate-looper-3802/src/07-receipt-trace-verifier.js`
- Modify: `apps/web/test/activate-looper-3802-receipt-trace.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing wrapped-path tests**

Create ABI fixtures for top-level `chainId == 0x2105`, `to == EntryPoint`, value zero, successful receipt status, selector `0x1fad948c`, and strict full `handleOps(UserOperation[],address)` decoding with no trailing bytes. Require exactly one selected op with sender sponsor and empty `initCode`; unrelated senders are allowed but cannot satisfy attribution. Compute the local v0.6 userOpHash, encode that same selected tuple with selector `0xa6193531`, require the receipt-block call's sole exact 32-byte result to equal the local hash, require exactly one matching successful `UserOperationEvent` with hash/sender/nonce, and decode selected callData as exactly one of:

```text
execute(registry, 0, exactCreateAccountCalldata)
executeBatch([Call(registry, 0, exactCreateAccountCalldata)])
```

Test rejection of malformed offsets/lengths, alternate ABI variants, duplicate sponsor ops/events, failed event, hash/nonce mismatch, nonempty initCode, forbidden `0x2c2abd1e`, extra batch calls, alternate target/data, nonzero value, and trailing data.

Create dRPC callTracer fixtures. Require root transaction/EntryPoint input equality; exactly one successful EntryPoint-to-sponsor frame whose input is the selected complete callData and value zero; only zero-value sponsor/delegate/implementation plumbing on the selected ancestry; exactly one successful registry `CALL` with exact calldata/value; and matching event in that frame. Reject extra wallet-envelope external calls/create frames, wrong ancestry/type, error/revert, missing per-frame logs, duplicate matching frames, or unrelated bundle calls used as attribution.

Trace log `index` must be an integer receipt-array ordinal `n`; require `0 <= n < receipt.logs.length`, exact bytes at `receipt.logs[n]`, separately canonical/unique block-global `logIndex`, and persisted values. Test ordinal/logIndex conflation explicitly.

- [ ] **Step 2: Run wrapped ABI/hash/event tests and verify RED**

```bash
node --test --test-name-pattern="wrapped top-level|handleOps|userOpHash|UserOperationEvent|wallet callData" apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected: FAIL first at `strictly decodes one selected sponsor UserOperation` because wrapped decoding is absent.

- [ ] **Step 3: Implement strict wrapped attribution**

Use only the pure ABI/Keccak primitives from the pinset unit. Reverify sponsor designator/delegate/slot/implementation/calls/EntryPoint at the receipt block. If trace is absent/incomplete, attribution must fail; return `observed_unattributed` only when the full canonical account post-state is independently proven, otherwise `uncertain_hashed`. Add paired cases proving that valid top-level ABI/event/trace evidence plus valid full receipt-block post-state becomes `confirmed_attributed`, while the same attribution evidence plus missing/wrong/conflicting post-state becomes `uncertain_hashed` and never confirmed.

The selected operation's no-asset-movement proof is scoped only to its zero-value envelope. Do not claim anything about unrelated UserOperations in the same bundle.

- [ ] **Step 4: Regenerate and verify wrapped ABI/hash/event GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="wrapped top-level|handleOps|userOpHash|UserOperationEvent|wallet callData" apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected: valid wrapped ABI/hash/event fixtures PASS and every malformed/duplicate/replayable/extra-call fixture fails closed.

- [ ] **Step 5: Run trace ancestry/log-index tests and close RED to GREEN**

```bash
node --test --test-name-pattern="trace ancestry|receipt-array ordinal|logIndex|cross-attribution" apps/web/test/activate-looper-3802-receipt-trace.test.mjs
```

Expected before trace implementation: FAIL at `attributes the event to the selected registry frame`; after implementation: exact ancestry, zero-value, one registry call, per-frame log, ordinal, separate logIndex, and cross-attribution rejection tests PASS.

- [ ] **Step 6: Commit Task 10**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-receipt-trace.test.mjs
git commit -m "feat: prove wrapped activation attribution"
```

### Task 11: Complete resume, terminal revalidation, acknowledgement, and reorg behavior

**Files:**
- Modify: `apps/web/owner-tools/activate-looper-3802/src/08-controller-renderer.js`
- Modify: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-page.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-receipt-trace.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing recovery/reorg tests**

Cover Resume for submitted, uncertain, superseded-linked, and terminal attempts. Cover automatic terminal revalidation on load and manual Resume. Require exact transitions when canonical evidence disappears:

- receipt-derived terminal to `uncertain_hashed`;
- observed-unattributed with hash to `uncertain_hashed`;
- observed-unattributed without hash to `uncertain_hashless`;
- retry reverted/cancelled to observed-unattributed when a late original produces exact post-state.

Cover acknowledgement: first revalidate; set `acknowledgedAtMs` and retain full store for confirmed, observed, retry-cancelled, or any retryOrdinal 1 terminal. Delete only isolated original reverted with one attempt, no links, canonical reverted receipt, and exact undeployed account. A failed revalidation transitions uncertain and does not acknowledge.

- [ ] **Step 2: Run resume/reorg tests and verify RED**

```bash
node --test --test-name-pattern="Resume verification|terminal revalidation|reorg transition|late original" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: FAIL first at `automatically revalidates terminal evidence on load` because recovery orchestration is incomplete.

- [ ] **Step 3: Implement state-permitted controls only**

Resume never invokes the wallet. Retry is explicit, strongly warned, original-hashless-only, and one-time. Acknowledge never invokes the wallet. Every mutation runs through the coordinator under the Web Lock and fresh lease/store validation.

- [ ] **Step 4: Regenerate and verify resume/reorg GREEN**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="Resume verification|terminal revalidation|reorg transition|late original" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected: submitted/uncertain/superseded/terminal Resume, automatic load revalidation, each exact uncertain edge, and late-original tests PASS.

- [ ] **Step 5: Run acknowledgement tests and close RED to GREEN**

```bash
node --test --test-name-pattern="Acknowledge result|isolated original reverted" apps/web/test/activate-looper-3802-attempt-coordination.test.mjs
```

Expected before acknowledgement implementation: FAIL; after implementation: retained terminal records, one eligible deletion, failed-revalidation transition, and zero wallet calls PASS.

- [ ] **Step 6: Commit Task 11**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-attempt-coordination.test.mjs apps/web/test/activate-looper-3802-page.test.mjs apps/web/test/activate-looper-3802-receipt-trace.test.mjs
git commit -m "feat: recover Looper activation attempts"
```

## Chunk 4: Controller/rendering, adversarial integration, and verification

### Task 12: Finish controller, renderer, and bootstrap behavior

**Files:**
- Complete: `apps/web/owner-tools/activate-looper-3802/src/08-controller-renderer.js`
- Create by replacing its Task 1 placeholder: `apps/web/owner-tools/activate-looper-3802/src/09-bootstrap.js`
- Modify: `apps/web/owner-tools/activate-looper-3802/index.template.html`
- Modify: `apps/web/test/activate-looper-3802-page.test.mjs`
- Regenerate: `apps/web/owner-tools/activate-looper-3802/index.html`

- [ ] **Step 1: Write failing UI/integration tests**

Test initial read-only refresh, no wallet, wrong wallet, wrong chain, connect/switch, exact ready state, already-deployed exact state, every blocked account state, corrupt storage, no Web Locks, storage invalidation, and `accountsChanged`/`chainChanged` generation invalidation.

Assert control visibility exactly:

- Connect always available unless the tab mutex is busy.
- Activate only for no attempt + undeployed zero account + complete fresh preflight + expected wallet/Base + Web Locks available.
- Resume only for submitted, uncertain, superseded-linked, or terminal records.
- Retry only for eligible original `uncertain_hashless` after wait and fresh proof.
- Acknowledge only for eligible terminal records.

Assert text uses `textContent`, truncates provider errors, never injects HTML, displays exact addresses/semantics/gas/fee/account state/identity, links only to `https://basescan.org/tx/<hash>`, and never claims attributed success for observed-unattributed. Ensure no editable inputs or collection-wide/batch behavior.

Test double-click, wallet events during each async phase, storage event, lock loss, post-simulation drift, and stale refresh completion. Each sends at most once and stale results cannot re-enable controls.

- [ ] **Step 2: Run controller control-state tests and verify RED**

```bash
node --test --test-name-pattern="controller control state|wallet generation|stale refresh" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: FAIL first at `enables Activate only from exact readiness` because final controller state mapping is absent.

- [ ] **Step 3: Implement the controller state table and stale-generation guards**

Represent view state as one frozen object containing facts, status kind/text, busy flag, and five control `{visible,disabled}` pairs. Every async action captures refresh version and wallet generation; a mismatch may update durable evidence already returned by the wallet but cannot render readiness or invoke another send. The controller calls only injected unit interfaces.

- [ ] **Step 4: Verify controller GREEN and commit it**

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="controller control state|wallet generation|stale refresh" apps/web/test/activate-looper-3802-page.test.mjs
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-page.test.mjs
git commit -m "feat: control Looper activation states"
```

Expected: readiness, blocked states, account/chain/storage invalidation, double-click, and stale-generation tests PASS.

- [ ] **Step 5: Run rendering tests and verify RED**

```bash
node --test --test-name-pattern="renders activation facts|observed unattributed|safe status text" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: FAIL because exact DOM/status rendering is incomplete.

- [ ] **Step 6: Implement the renderer and verify GREEN**

Render all approved facts, deployment/balance/controller state, exact transaction semantics, gas/fee, distinct attributed/unattributed/reverted/uncertain wording, and control table. Use only `textContent`/safe attributes, cap error text at 600 characters, allow only `https://basescan.org/tx/<lowercase-bytes32>`, use no emoji/external assets, and keep the existing owner-tool mobile card pattern.

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="renders activation facts|observed unattributed|safe status text" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: all rendering/security/accessibility assertions PASS.

- [ ] **Step 7: Commit the renderer slice**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-page.test.mjs
git commit -m "feat: render Looper activation evidence"
```

- [ ] **Step 8: Run bootstrap/listener tests and verify RED**

```bash
node --test --test-name-pattern="bootstrap composition|registers listeners once|automatic terminal revalidation" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: FAIL because `09-bootstrap.js` remains a placeholder.

- [ ] **Step 9: Implement bootstrap and verify GREEN**

Bootstrap is the only composition root. It injects `fetch`, provider, storage, locks, crypto, clock, and DOM references into factories. The controller never directly calls those globals. Register wallet/storage listeners once and invalidate immediately. Automatic terminal revalidation performs no wallet prompt or onchain write, but if canonical evidence is lost it must acquire the Web Lock and persist the exact uncertain-state transition before rendering.

If automatic terminal revalidation cannot acquire the Web Lock because locks are unavailable, throw, return null, or a foreign lease blocks mutation, retain the prior durable record, render a read-only `Durable result could not be safely revalidated` status, disable Activate/Retry/Acknowledge, and expose only a later non-wallet Resume attempt. Never render the stale terminal record as currently trusted.

```bash
pnpm --filter @helixa/multipass-web build:activate-looper-3802
node --test --test-name-pattern="bootstrap composition|registers listeners once|automatic terminal revalidation" apps/web/test/activate-looper-3802-page.test.mjs
```

Expected: composition, one-time listeners, read-only evidence fetch, and lock-scoped durable terminal transition tests PASS.

- [ ] **Step 10: Commit the bootstrap slice**

```bash
git add apps/web/owner-tools/activate-looper-3802 apps/web/test/activate-looper-3802-page.test.mjs
git commit -m "feat: bootstrap Looper activation page"
```

### Task 13: Add the static boundary scanner and complete adversarial coverage

**Files:**
- Create: `apps/web/scripts/scan-activate-looper-3802.mjs`
- Create: `apps/web/test/activate-looper-3802-scan.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-pinset.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-attempt-coordination.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-receipt-trace.test.mjs`
- Modify: `apps/web/test/activate-looper-3802-page.test.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write failing scan assertions**

The scanner must parse the template/source/generated artifact and fail unless:

- generated bytes are current and exactly one inline script exists;
- URL literals are only the three RPC origins, exact Arweave URI, and BaseScan transaction prefix;
- `fetch` appears only in public transport/bootstrap injection;
- `window.ethereum`/provider request appears only in wallet boundary/bootstrap injection;
- `localStorage` appears only in attempt-store/bootstrap injection;
- `navigator.locks` appears only in coordinator/bootstrap injection;
- `eth_sendTransaction` appears only in the wallet method allowlist and guarded wallet boundary;
- trace method appears only in transport and dRPC route;
- forbidden write selectors/actions, remote scripts, dynamic URL/config inputs, cookies, IndexedDB, sessionStorage, alternate storage keys, private keys, mnemonics, API keys, and batch activation are absent;
- production source contains exactly the approved public/wallet methods, selectors, topics, addresses, and transaction fields.

Export `scanTree(root)` where `root` is exactly a copied `activate-looper-3802/` directory containing `index.template.html`, `index.html`, and `src/00...09`. Resolve the production root from `fileURLToPath(import.meta.url)` plus `../owner-tools/activate-looper-3802`, never from caller CWD. Guard CLI execution with `if (import.meta.url === pathToFileURL(process.argv[1]).href)`; CLI accepts no path argument. In `activate-looper-3802-scan.test.mjs`, create `mkdtemp()/activate-looper-3802`, recursively copy the approved route, inject one violation, call imported `scanTree(tempRoute)`, assert the named error, and remove the temp root in `afterEach`. Mutation files are exact: remote script/CSP in `index.template.html`; stale artifact in `index.html`; extra URL/secret/forbidden selector in `src/01-pinset-encoding.js`; misplaced `fetch` in `src/03-snapshot-validator.js`; provider request in `src/08-controller-renderer.js`; localStorage in `src/06-cross-tab-coordinator.js`; Web Locks in `src/05-attempt-store.js`; extra wallet method in `src/04-wallet-boundary.js`; alternate key in `src/05-attempt-store.js`; batch loop in `src/08-controller-renderer.js`. Add one child-process test that runs the CLI from repository root and `/tmp`, proving caller-CWD independence.

- [ ] **Step 2: Run scan tests and verify RED**

Run:

```bash
node --test apps/web/test/activate-looper-3802-scan.test.mjs
```

Expected: FAIL at `scanner accepts the approved source tree` because the scanner is absent.

- [ ] **Step 3: Implement the scanner and package command**

Implement exact allowlists with path-qualified findings and deterministic sorted output. Add `"check:activate-looper-3802": "node scripts/build-activate-looper-3802.mjs --check && node scripts/scan-activate-looper-3802.mjs"` only now that both scripts exist.

- [ ] **Step 4: Run scanner tests and verify GREEN**

```bash
node --test apps/web/test/activate-looper-3802-scan.test.mjs
pnpm --filter @helixa/multipass-web check:activate-looper-3802
```

Expected: approved tree PASSes; every one-violation temp fixture fails with its exact named reason; CLI exits 0 and prints the sorted approved inventory.

- [ ] **Step 5: Commit the scanner slice**

```bash
git add apps/web/package.json apps/web/scripts/scan-activate-looper-3802.mjs apps/web/test/activate-looper-3802-scan.test.mjs
git commit -m "test: scan activation security boundaries"
```

- [ ] **Step 6: Add remaining spec rows to their exact test files**

Map the approved testing section as follows, adding and running one table row at a time:

- `activate-looper-3802-pinset.test.mjs`: noindex/static surface, live/derived pinsets, runtime formula, exact transaction, forbidden writes/selectors/batching.
- `activate-looper-3802-rpc-snapshot.test.mjs`: all code/slot/config/owner/URI/controller/account states, block anchoring, `96,298` observation, gas cap, wallet-generation drift, origin routing, PublicNode historical rejection.
- `activate-looper-3802-attempt-coordination.test.mjs`: every Web Locks/lease/revision/read-back/storage-event/handoff/state/acknowledgement/reorg case.
- `activate-looper-3802-receipt-trace.test.mjs`: direct/wrapped envelopes, strict ABI, local/onchain hash, events, trace ancestry, ordinal/logIndex, replay/extra-call/cross-attribution, exact receipt-block post-state.
- `activate-looper-3802-page.test.mjs`: controller/rendering, no automatic retry, no editable inputs, scoped no-asset-movement wording, unrelated bundled operation disclaimer, and absence of collection-wide behavior.

```bash
node --test apps/web/test/activate-looper-3802-pinset.test.mjs apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs apps/web/test/activate-looper-3802-attempt-coordination.test.mjs apps/web/test/activate-looper-3802-receipt-trace.test.mjs apps/web/test/activate-looper-3802-page.test.mjs
```

Expected per new row: one RED failure before the smallest production/test-fixture correction, then GREEN. Final run PASSes every mapped file.

- [ ] **Step 7: Commit the completed adversarial matrix**

```bash
git add apps/web/test/activate-looper-3802-pinset.test.mjs apps/web/test/activate-looper-3802-rpc-snapshot.test.mjs apps/web/test/activate-looper-3802-attempt-coordination.test.mjs apps/web/test/activate-looper-3802-receipt-trace.test.mjs apps/web/test/activate-looper-3802-page.test.mjs apps/web/owner-tools/activate-looper-3802
git commit -m "test: complete activation adversarial matrix"
```

### Task 14: Add a no-wallet browser smoke test

**Files:**
- Create: `apps/web/scripts/smoke-activate-looper-3802-no-wallet.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Create a cleanup-safe smoke skeleton and package command**

Create the script with a top-level 90-second abort, `try/finally` browser/server cleanup, and an intentional `throw new Error('no-wallet smoke incomplete')` after one local page load. Add `"smoke:activate-looper-3802-no-wallet": "CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-activate-looper-3802-no-wallet.mjs"`. Resolve Chromium as `process.env.CHROMIUM_PATH || '/snap/bin/chromium'`, pass it as Playwright Core `executablePath`, and fail clearly if it is not executable.

- [ ] **Step 2: Run the skeleton and verify RED**

```bash
pnpm --filter @helixa/multipass-web smoke:activate-looper-3802-no-wallet
```

Expected: FAIL exactly with `no-wallet smoke incomplete`, while `finally` closes Chromium and the ephemeral server.

- [ ] **Step 3: Add hard no-send/readiness assertions and deterministic output**

Serve only `GET /activate-looper-3802/` plus an optional favicon 204; every other local request fails. Do not install `window.ethereum` or expose a wallet bridge. Allow external POST only to the three RPC origins, parse each JSON body against the closed matrix, and reject methods containing `send`, `sign`, `personal`, or `wallet_`.

Run `{width:1440,height:1000}` and `{width:390,height:844}`. Readiness is exact: wait up to 30 seconds until `#page-state[data-busy="false"]` and `#status` no longer contains `Verifying`, or until it contains the bounded RPC-unavailable status. Then assert HTTP 200, noindex, one inline script, fixed facts, disabled Activate, hidden transaction link, no page errors/horizontal overflow, and `localStorage.length === 0`. Print JSON with route, both viewport results, sorted public methods, `walletInjected:false`, `storageWrites:0`, and `sendCount:0`.

Ensure browser/server teardown in `finally`, enforce the exact timeouts above, commit no screenshots, and print JSON containing route, both viewport results, sorted public method inventory, `walletInjected:false`, `storageWrites:0`, and `sendCount:0`.

- [ ] **Step 4: Run smoke and verify GREEN**

```bash
pnpm --filter @helixa/multipass-web smoke:activate-looper-3802-no-wallet
```

Expected: exit 0 with `walletInjected:false`, `storageWrites:0`, `sendCount:0`, desktop/mobile checks true, and no page errors. A bounded public RPC outage may report read-only unavailable but must still keep Activate disabled and all three counts zero.

- [ ] **Step 5: Commit Task 14**

```bash
git add apps/web/package.json apps/web/scripts/smoke-activate-looper-3802-no-wallet.mjs
git commit -m "test: smoke activation page without wallet"
```

### Task 15: Run final verification and stop before deployment or any wallet action

**Files:**
- Verify: every production/test/build/scan/smoke file in this plan's file map
- Modify only if a reviewer supplies an evidenced finding: the exact planned production/test file named by that finding
- Do not modify: deployment targets, live web roots, contracts, secrets, wallet configuration, or the approved spec

- [ ] **Step 1: Prove committed artifact freshness before rebuilding**

```bash
pnpm --filter @helixa/multipass-web exec node scripts/build-activate-looper-3802.mjs --check
pnpm --filter @helixa/multipass-web build:activate-looper-3802
git diff --exit-code -- apps/web/owner-tools/activate-looper-3802/index.html
```

Expected: pre-build `--check` exits 0, rebuild exits 0, and rebuild creates no generated-page diff. A stale committed artifact fails before regeneration can hide it.

- [ ] **Step 2: Run focused and full automated tests**

```bash
node --test apps/web/test/activate-looper-3802-*.test.mjs
pnpm --filter @helixa/multipass-web test
```

Expected: every focused test and the full web suite PASS with zero failures/skips caused by this feature.

- [ ] **Step 3: Run production build, static scan, and no-wallet smoke**

```bash
pnpm web:build
pnpm --filter @helixa/multipass-web check:activate-looper-3802
pnpm --filter @helixa/multipass-web smoke:activate-looper-3802-no-wallet
```

Expected: production build exits 0 and contains `apps/web/dist/activate-looper-3802/index.html`; scanner exits 0; smoke reports no injected wallet and zero send/sign calls.

- [ ] **Step 4: Dispatch the spec-compliance review**

Use `@requesting-code-review` with this exact scope: `Compare every implementation file and named test against docs/superpowers/specs/2026-09-20-looper-3802-wallet-activation-design.md; do not edit; return APPROVED or numbered file:line blockers. Pay special attention to pinsets, RPC routing, prepared/send ordering, Web Locks/lease, state graph, wrapped trace attribution, and out-of-scope writes.`

Expected: `APPROVED`, or a finite numbered blocker list. For each blocker, add one reproducing focused test, run it RED, implement only that correction, rerun Steps 1-3, commit `fix: close activation spec review finding`, then rerun both the spec and security reviews so both approvals apply to the same new HEAD.

- [ ] **Step 5: Dispatch the code-quality/security review**

Use `@requesting-code-review` with this exact scope: `Review only the planned activation source/tests for boundary leaks, malformed ABI acceptance, unbounded work, stale-tab races, unsafe rendering, generated-artifact drift, and missing test coverage; do not expand product scope; return APPROVED or numbered file:line findings.`

Expected: `APPROVED`, or focused findings handled with the same one-test RED/GREEN loop and a `fix: harden activation implementation` commit. After any fix, rerun Steps 1-3 and redispatch both reviews from the new HEAD.

- [ ] **Step 6: Inspect final repository state**

```bash
git diff --check
git status --short
git log --oneline 48a3db8..HEAD
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const changed = execFileSync('git', ['diff','--name-only','48a3db8..HEAD'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
const exact = new Set(['apps/web/package.json','apps/web/scripts/build-activate-looper-3802.mjs','apps/web/scripts/scan-activate-looper-3802.mjs','apps/web/scripts/smoke-activate-looper-3802-no-wallet.mjs','docs/superpowers/plans/2026-09-21-looper-3802-wallet-activation-implementation.md']);
const allowed = (p) => exact.has(p) || p.startsWith('apps/web/owner-tools/activate-looper-3802/') || /^apps\/web\/test\/activate-looper-3802-(?:fixture\.mjs|(?:pinset|rpc-snapshot|attempt-coordination|receipt-trace|page|scan)\.test\.mjs)$/.test(p);
const bad = changed.filter((p) => !allowed(p));
if (bad.length) throw new Error(`Unexpected changed files:\n${bad.join('\n')}`);
console.log(JSON.stringify(changed, null, 2));
NODE
```

Expected: diff check is clean; changed-file allowlist passes; only planned source/test artifacts are present; commit history is focused; both reviews and all gates apply to this exact HEAD; no deployment/runtime side effects occurred.

- [ ] **Step 7: Record implementation evidence without deploying**

Report focused/full test counts, production-build result, scanner result, no-wallet smoke result, final commit hashes, and the explicit statement: no deployment, live wallet connection, signature, transaction, or onchain write was performed. Stop here. A separate explicit request and pre-deployment read-only pin revalidation are required before publishing, and a separate human wallet approval is required before the pilot transaction.

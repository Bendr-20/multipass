# Looper Multipass Wallet Profile Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, and deploy a read-only public Multipass profile for Looper #3802 at the immutable OpenSea-linked route, with block-anchored ERC-6551/ERC-8004 proof and honest live holdings.

**Architecture:** Generate a standalone, deterministic HTML profile from a frozen #3802 manifest and focused browser units rather than rebuilding the shared Multipass SPA. The runtime uses a closed Base JSON-RPC transport for current/historical proof, two exact Blockscout reads for holdings, strict pure verifiers, and a safe renderer. Exact Nginx locations serve both slashless and trailing-slash routes without redirect while a route-only deployment leaves `/multipass/index.html` untouched.

**Tech Stack:** Vanilla JavaScript, Node.js 24, `node:test`, JSDOM, Playwright Core/Chromium, Vite build pipeline, Base JSON-RPC, Base Blockscout API, Nginx.

**Authoritative design:** `docs/superpowers/specs/2026-09-21-looper-multipass-wallet-profile-design.md` at or after commit `758dd1ee2e15e504b3bca627803d43a97e39baa2`.

---

## File map

Create:

- `apps/web/public-profiles/loopers/manifests/3802.js` — deep-frozen public facts, code/slot pins, receipt coordinates, URLs, content.
- `apps/web/public-profiles/loopers/index.template.html` — semantic profile markup, static SEO, style/script markers, neutral initial state.
- `apps/web/public-profiles/loopers/src/00-namespace.js` — frozen namespace and fail-fast registration.
- `apps/web/public-profiles/loopers/src/01-manifest-codecs.js` — strict hex/address/ABI/SHA helpers and manifest validation.
- `apps/web/public-profiles/loopers/src/02-base-rpc.js` — closed RPC union, timeout, canonical block selection, whole-batch execution.
- `apps/web/public-profiles/loopers/src/03-proof-verifier.js` — pure current/historical ERC-6551/ERC-8004 verification.
- `apps/web/public-profiles/loopers/src/04-holdings.js` — two exact Blockscout reads and strict item parsing.
- `apps/web/public-profiles/loopers/src/05-renderer.js` — safe DOM rendering, copy action, status classes.
- `apps/web/public-profiles/loopers/src/06-bootstrap.js` — refresh generation, unit orchestration, newest-refresh wins.
- `apps/web/public-profiles/loopers/3802/index.html` — committed deterministic generated artifact.
- `apps/web/scripts/build-looper-multipass-profiles.mjs` — manifest validator, concatenator, CSP hash injection, source/dist writer/checker.
- `apps/web/scripts/scan-looper-multipass-profile.mjs` — static security and route-boundary scanner.
- `apps/web/scripts/smoke-looper-multipass-profile.mjs` — local/public desktop/mobile browser smoke and screenshots.
- `apps/web/test/looper-multipass-profile-manifest.test.mjs` — manifest, builder, SEO, CSP, route tests.
- `apps/web/test/looper-multipass-profile-rpc.test.mjs` — transport/canonical snapshot tests.
- `apps/web/test/looper-multipass-profile-proof.test.mjs` — strict current/historical proof tests.
- `apps/web/test/looper-multipass-profile-holdings.test.mjs` — Blockscout schema tests.
- `apps/web/test/looper-multipass-profile-page.test.mjs` — renderer/bootstrap/JSDOM tests.

Modify:

- `apps/web/package.json` — append profile builder after all existing build steps and add profile check/smoke scripts.
- `/etc/nginx/sites-enabled/helixa.xyz` — deployment-only exact route blocks, inserted before `location /multipass/` after backup.

Do not modify:

- shared `apps/web/src/app.js`, `apps/web/src/styles.css`, or Multipass SPA assets;
- Looper metadata or Arweave content;
- activation owner page behavior;
- contracts, APIs, wallets, or onchain state.

---

## Chunk 1: Deterministic profile artifact

### Task 1: Lock the manifest and generated-route contract

**Files:**
- Create: `apps/web/test/looper-multipass-profile-manifest.test.mjs`
- Create: `apps/web/public-profiles/loopers/manifests/3802.js`
- Create: `apps/web/public-profiles/loopers/src/00-namespace.js`
- Create: `apps/web/public-profiles/loopers/src/01-manifest-codecs.js`

- [ ] **Step 1: Write failing manifest tests**

Assert the module exposes one deep-frozen manifest and rejects changed/extra fields. Cover exact chain, token, account, holder-at-activation, runtime hash, identity ID, transaction/block/log coordinates, code-hash/slot table, canonical route, Blockscout URLs, final Arweave image URL, and neutral SEO text.

```js
assert.equal(manifest.chainId, 8453);
assert.equal(manifest.tokenId, '3802');
assert.equal(manifest.account.toLowerCase(), '0x88a30c57f5780f1a8112e6b486b5bfbe89ac9a38');
assert.equal(manifest.activation.transactionHash, '0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c');
assert.equal(manifest.activation.blockHash, '0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1');
assert.equal(manifest.profilePath, '/multipass/loopers/3802');
assert.equal(Object.isFrozen(manifest), true);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-manifest.test.mjs
```

Expected: FAIL because the manifest/codecs do not exist.

- [ ] **Step 3: Implement namespace, strict codecs, and exact manifest**

`manifests/3802.js` is an ESM build-time data module exporting one plain object. Browser source units are classic IIFEs and contain no `import`/`export`. The builder will import the ESM manifest, stable-serialize it, and synthesize one classic registration statement immediately after `01-manifest-codecs.js`:

```js
ns.MANIFEST = ns.validateManifest(<stable JSON literal>);
```

Use the approved spec and activation pinset as the only sources. Provide pure helpers with no DOM/network access:

```js
validateManifest(candidate) -> deeply frozen normalized manifest
hexToBytes(hex) -> Uint8Array
bytesToHex(bytes) -> lowercase 0x hex
addressWord(address) -> 64-char lowercase ABI word
decodeAddress(word) -> lowercase address or throw
uint256Word(value) -> 64-char word
sha256Hex(hex) -> Promise<0x hash>
```

Reject unknown keys, odd/non-lowercase byte strings, unsafe integers, noncanonical quantities, non-HTTPS URLs, route drift, and any source pin mismatch.

- [ ] **Step 4: Run tests and confirm GREEN**

Expected: all manifest tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public-profiles/loopers/manifests/3802.js apps/web/public-profiles/loopers/src/00-namespace.js apps/web/public-profiles/loopers/src/01-manifest-codecs.js apps/web/test/looper-multipass-profile-manifest.test.mjs
git commit -m "feat: pin Looper 3802 Multipass profile"
```

### Task 2: Generate one deterministic CSP-bound HTML artifact

**Files:**
- Create: `apps/web/public-profiles/loopers/index.template.html`
- Create: `apps/web/scripts/build-looper-multipass-profiles.mjs`
- Generate: `apps/web/public-profiles/loopers/3802/index.html`
- Modify: `apps/web/test/looper-multipass-profile-manifest.test.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Extend tests for the builder contract**

Assert:

- title is exactly `Looper #3802 Multipass | Helixa`;
- canonical is slashless `/multipass/loopers/3802`;
- robots is `index,follow` and no `noindex` appears;
- static description is neutral and does not contain `verified`;
- Open Graph, Twitter card, and JSON-LD fields are exact, neutral, and use the slashless canonical URL and pinned artwork;
- one literal inline `<style>` body and one generated inline `<script>` exist;
- an independently recomputed quoted Base64 CSP source (`'sha256-<base64>'`) authorizes each exact inline body after LF normalization and all substitutions;
- the browser script contains classic IIFEs plus one synthesized manifest registration between source units `01` and `02`, with no ESM syntax;
- the runtime manifest is recursively frozen and equals the build-time manifest;
- no remote scripts, forms, wallet controls, or unsafe inline event attributes exist;
- builder drift and `--dist` behavior are tested through exported pure builder functions in isolated temporary trees with unconditional cleanup, never by modifying the committed artifact;
- repeated generation is byte-identical, contains no CR bytes, and has exactly one final newline;
- `--dist` writes `dist/multipass/loopers/3802/index.html` into an existing temporary dist tree.

- [ ] **Step 2: Run tests and confirm RED**

Expected: FAIL because template/builder/artifact do not exist.

- [ ] **Step 3: Implement template and builder**

The template contains final literal CSS inside exactly one `<style>` element and only one runtime marker:

```html
<style>/* complete profile CSS lives here */</style>
<script>/* __PROFILE_RUNTIME__ */</script>
```

Create explicit valid placeholder units `02-base-rpc.js` through `06-bootstrap.js` now so the builder's fixed allowlist is final from this task onward. Each placeholder registers its final exported name but throws `Not implemented` when called; later tasks replace the file in place, run `--check` to prove artifact drift, regenerate, and commit the updated artifact with the source unit.

The builder must:

1. import and validate only `manifests/3802.js`;
2. evaluate activation `00-namespace.js` and `01-pinset-encoding.js` in an isolated Node VM with no DOM/network, then compare every shared address, salt, selector/topic, expected runtime byte, runtime length/hash, proxy/implementation byte length/hash/slot, and identity URI against the profile manifest;
3. validate the post-deployment receipt coordinates/event literal against the approved profile manifest fixture;
4. load classic source units `00` through `06` from one exact allowlist;
5. synthesize stable manifest registration after unit `01`;
6. replace the runtime marker exactly once;
7. normalize all substitutions and inline bodies to LF before hashing;
8. hash the exact final UTF-8 style/script element text with Node `crypto` and encode quoted Base64 CSP sources, never hex;
9. inject complete CSP from the spec;
10. normalize the final document to LF plus exactly one final newline;
11. expose pure build/check/write functions for hermetic temporary-tree tests and support CLI default, `--check`, and `--dist`;
12. refuse unknown flags/manifests, missing source units, unexpected template markers, or activation-pin divergence.

Update only the scripts that exist at this stage; scanner/smoke entries wait for Task 7:

```json
"build": "vite build && node scripts/write-allowlist-entry.mjs && node scripts/build-activate-looper-3802.mjs --dist && node scripts/build-looper-multipass-profiles.mjs --dist",
"build:looper-multipass-profile": "node scripts/build-looper-multipass-profiles.mjs"
```

- [ ] **Step 4: Generate and verify GREEN**

Run exactly:

```bash
node apps/web/scripts/build-looper-multipass-profiles.mjs
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-manifest.test.mjs
node --check apps/web/scripts/build-looper-multipass-profiles.mjs
for f in apps/web/public-profiles/loopers/src/*.js; do node --check "$f"; done
pnpm web:build
node apps/web/scripts/build-looper-multipass-profiles.mjs --check
test -f apps/web/dist/multipass/allowlist/index.html
test -f apps/web/dist/activate-looper-3802/index.html
test -f apps/web/dist/multipass/loopers/3802/index.html
git diff --check
```

Expected: focused tests report zero failures; production build succeeds with `/multipass/` base; all three generated routes survive the full build; freshness and diff checks pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/public-profiles/loopers/index.template.html apps/web/public-profiles/loopers/3802/index.html apps/web/public-profiles/loopers/src/02-base-rpc.js apps/web/public-profiles/loopers/src/03-proof-verifier.js apps/web/public-profiles/loopers/src/04-holdings.js apps/web/public-profiles/loopers/src/05-renderer.js apps/web/public-profiles/loopers/src/06-bootstrap.js apps/web/scripts/build-looper-multipass-profiles.mjs apps/web/test/looper-multipass-profile-manifest.test.mjs
git commit -m "feat: generate Looper Multipass profile"
```

---

## Chunk 2: Fail-closed current and historical proof

### Task 3: Implement the closed Base RPC transport

**Files:**
- Create: `apps/web/public-profiles/loopers/src/02-base-rpc.js`
- Create: `apps/web/test/looper-multipass-profile-rpc.test.mjs`

- [ ] **Step 1: Write failing transport tests**

Cover:

- the only public API is `createBaseRpcClient`; no generic `request(method,params)` is exported;
- the internal union admits only exact manifest-derived request variants for `eth_chainId`, block heads/by-number, each pinned code/slot/balance/call, pinned transaction, and pinned receipt;
- every POST has exact origin, method, headers/body, `redirect:'error'`, `credentials:'omit'`, and no cookies/query string;
- every state parameter is exactly `{blockHash:<selected-or-pinned-hash>,requireCanonical:true}`; missing/false `requireCanonical` is rejected;
- arbitrary target, calldata, slot, address, transaction hash, or block parameters cannot enter through callers;
- per-request default is 8 seconds, whole refresh default is 30 seconds, and each JSON body has a 1 MiB streaming hard limit including absent/false `Content-Length` and chunk overflow;
- latest head gap greater than 20 rejects;
- selected block hash/timestamp disagreement classifies mismatch;
- client-clock age/skew failure classifies unavailable;
- current and historical canonical blocks are confirmed by both origins before state reads;
- one failed state call discards the whole batch;
- fallback sequence is canonical confirmation → one-origin whole batch → discard → re-confirm identical block → retry whole batch on the other origin;
- origin block disagreement terminates as mismatch and never enters fallback;
- no partial evidence from different origins can form a complete batch;
- historical reads use the pinned block-hash object, never block number alone;
- exact request counts and origin order are asserted.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-rpc.test.mjs
```

Expected: FAIL because the placeholder RPC unit does not implement the client.

- [ ] **Step 3: Implement the transport boundary**

Expose only:

```js
createBaseRpcClient({ fetchImpl, clock, perRequestTimeoutMs = 8_000, refreshTimeoutMs = 30_000, maxBytes = 1_048_576 })
  .readCurrentEvidence(manifest)
  .readHistoricalEvidence(manifest)
```

Each method returns this recursively frozen discriminated shape. Reject unknown/missing keys recursively.

```js
{
  schema: 'looper.profile.rpc-evidence', version: 1,
  phase: 'current'|'historical',
  classification: 'complete'|'unavailable'|'mismatch',
  selectedBlock: null|{ number:Quantity, hash:Hash32, timestamp:Quantity },
  completeBatch: null|{ origin:RpcOrigin, responses:CurrentResponses|HistoricalResponses },
  attempts: [{
    origin:RpcOrigin,
    stage:'head'|'canonical'|'batch',
    outcome:'complete'|'unavailable'|'mismatch',
    code:'timeout'|'http'|'rpc'|'malformed'|'oversized'|'head_gap'|'block_disagreement'|'batch_failed'|null,
    observations:PartialCurrentResponses|PartialHistoricalResponses
  }]
}
```

Exact current response keys and raw types:

```js
CurrentResponses = {
  loopersProxyCode:HexData,
  loopersImplementationSlot:Word32,
  loopersImplementationCode:HexData,
  registryCode:HexData,
  accountImplementationCode:HexData,
  adapterProxyCode:HexData,
  adapterImplementationSlot:Word32,
  adapterImplementationCode:HexData,
  identityRegistryProxyCode:HexData,
  identityRegistryImplementationSlot:Word32,
  identityRegistryImplementationCode:HexData,
  accountCode:HexData,
  accountBalance:Quantity,
  accountTokenResult:HexData,
  accountOwnerResult:HexData,
  accountStateResult:HexData,
  accountValidSignerResult:HexData,
  loopersOwnerOfResult:HexData,
  loopersTokenBoundAccountResult:HexData,
  registryAccountResult:HexData,
  loopersErc8004BoundResult:HexData,
  loopersErc8004AgentIdResult:HexData,
  loopersErc8004AgentUriResult:HexData,
  adapterIdentityRegistryResult:HexData,
  adapterBindingResult:HexData,
  adapterIsControllerResult:HexData,
  identityRegistryOwnerOfResult:HexData,
  identityRegistryTokenUriResult:HexData
}
```

Exact historical response keys and raw types:

```js
HistoricalResponses = {
  transaction:RpcTransaction,
  receipt:RpcReceipt,
  accountCode:HexData,
  accountBalance:Quantity,
  accountTokenResult:HexData,
  accountOwnerResult:HexData,
  accountStateResult:HexData,
  accountValidSignerResult:HexData
}
```

`PartialCurrentResponses` and `PartialHistoricalResponses` allow any subset of only the corresponding exact keys and preserve only successful raw observations. `HexData` is lowercase even-length `0x` bytes; `Word32` is exactly 32 bytes; `Quantity` is canonical lowercase JSON-RPC quantity; `Hash32` is exactly 32 bytes; `Address` is lowercase 20-byte hex; `RpcOrigin` is exactly one approved origin. The transport normalizes external transaction/receipt objects to these exact no-extra-key evidence shapes:

```js
RpcTransaction = {
  hash:Hash32, chainId:Quantity, blockNumber:Quantity, blockHash:Hash32,
  transactionIndex:Quantity, from:Address, to:Address, value:Quantity, input:HexData
}
RpcReceipt = {
  transactionHash:Hash32, blockNumber:Quantity, blockHash:Hash32,
  transactionIndex:Quantity, status:Quantity,
  logs:[{
    address:Address, topics:[Hash32], data:HexData, logIndex:Quantity,
    transactionHash:Hash32, transactionIndex:Quantity,
    blockHash:Hash32, blockNumber:Quantity, removed:boolean
  }]
}
```

A receipt may contain at most 512 logs and each log at most 8 topics. Null transaction/receipt is forbidden in a complete historical batch and may appear only in a partial observation type `RpcTransaction|null` or `RpcReceipt|null`, where it forces a non-complete classification. External RPC fields not listed above are discarded before freezing evidence; unknown fields introduced inside normalized evidence are rejected by the verifier.

For `classification:'complete'`, `selectedBlock` and `completeBatch` are required and non-null, and `responses` has every phase key. For `unavailable` or `mismatch`, `completeBatch` is required null; `selectedBlock` may be null or exact, and at least one attempt code/outcome explains the classification. `completeBatch` is the only evidence eligible for `verified`. Attempt observations preserve authoritative disagreements for mismatch precedence but can never supply missing values to `completeBatch`. JSON-RPC errors, malformed envelopes, duplicate IDs, redirects, oversized JSON, and aborts fail closed.

- [ ] **Step 4: Run tests, prove generated drift, regenerate, and confirm GREEN**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-rpc.test.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check  # expected nonzero: generated artifact stale
node apps/web/scripts/build-looper-multipass-profiles.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check
```

Expected: RPC tests report zero failures; pre-regeneration freshness fails; post-regeneration freshness passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public-profiles/loopers/src/02-base-rpc.js apps/web/public-profiles/loopers/3802/index.html apps/web/test/looper-multipass-profile-rpc.test.mjs
git commit -m "feat: anchor Looper profile RPC evidence"
```

### Task 4: Verify current wallet/identity and historical activation evidence

**Files:**
- Create: `apps/web/public-profiles/loopers/src/03-proof-verifier.js`
- Create: `apps/web/test/looper-multipass-profile-proof.test.mjs`

- [ ] **Step 1: Build exact passing fixtures from captured evidence**

Fixture contains:

- current canonical block evidence;
- exact proxy/implementation code and slots;
- account code/balance/token/owner/state/signer result;
- Looper account and ERC-8004 calls;
- Adapter/Identity Registry calls;
- pinned historical block/transaction/receipt/event and receipt-block account state.

- [ ] **Step 2: Write mutation and schema tests, then confirm RED**

Reject unknown/missing evidence keys and test real `02-base-rpc.js` output, not only handcrafted fixtures. Mutate each independently: chain; selected block; missing/false `requireCanonical`; every proxy code, implementation slot, and implementation code pin; account runtime length/byte/hash; truncated/trailing/noncanonical ABI words; token chain/contract/ID; holder; valid nonzero current `state()`; signer magic; both account-derivation calls; every Looper ERC-8004 value; adapter registry and every binding tuple member/controller; Identity Registry owner/URI; every transaction/receipt coordinate/status; event address/count/index/each topic/each data word/removed; historical runtime/token tuple/owner/state/signer/balance.

Run:

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-proof.test.mjs
```

Expected: FAIL because the placeholder verifier does not implement strict verification.

Assert precedence:

```js
mismatch + timeout => mismatch
incomplete with no mismatch => unavailable
all exact => verified
```

- [ ] **Step 3: Implement pure verifier**

Expose:

```js
verifyLooperProfileProof({ manifest, currentEvidence, historicalEvidence })
```

Return exactly one recursively frozen discriminated result:

```js
// verified
{
  schema:'looper.profile.proof', version:1, classification:'verified',
  deployment:'verified', currentBinding:'verified', identityControl:'verified', historicalActivation:'verified',
  current:{ blockNumber, blockHash, blockTimestamp, holder, accountOwner, state, balance },
  activation:{ transactionHash, blockNumber, blockHash, blockTimestamp, logIndex },
  errors:[]
}
// unavailable or mismatch
{
  schema:'looper.profile.proof', version:1, classification:'unavailable'|'mismatch',
  deployment:'verified'|'unavailable'|'mismatch',
  currentBinding:'verified'|'unavailable'|'mismatch',
  identityControl:'verified'|'unavailable'|'mismatch',
  historicalActivation:'verified'|'unavailable'|'mismatch',
  current:null|{ blockNumber, blockHash, blockTimestamp, holder, accountOwner, state, balance },
  activation:null|{ transactionHash, blockNumber, blockHash, blockTimestamp, logIndex },
  errors:[{ code, section:'deployment'|'current_binding'|'identity_control'|'historical_activation', source:'transport'|'decode'|'pin', detail }]
}
```

The exact stable verifier error-code enum is:

```text
evidence_schema_invalid
transport_unavailable
chain_mismatch
block_mismatch
freshness_unavailable
code_mismatch
slot_mismatch
account_runtime_mismatch
abi_malformed
account_binding_mismatch
holder_mismatch
signer_mismatch
identity_binding_mismatch
identity_controller_mismatch
identity_uri_mismatch
transaction_mismatch
receipt_mismatch
event_mismatch
historical_state_mismatch
```

No other code is allowed. Cap `detail` to 160 safe characters. `verified` forbids null sections/errors, while non-verified outputs allow only fields backed by a complete batch. Never perform fetch, DOM, storage, clock, or fallback operations in the verifier.

- [ ] **Step 4: Run proof/transport tests, prove drift, regenerate, and confirm GREEN**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-rpc.test.mjs test/looper-multipass-profile-proof.test.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check  # expected nonzero before regeneration
node apps/web/scripts/build-looper-multipass-profiles.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check
```

Expected: both focused suites report zero failures and regenerated artifact is current.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public-profiles/loopers/src/03-proof-verifier.js apps/web/public-profiles/loopers/3802/index.html apps/web/test/looper-multipass-profile-proof.test.mjs
git commit -m "feat: verify Looper wallet profile proof"
```

---

## Chunk 3: Holdings and public presentation

### Task 5: Parse bounded Blockscout-indexed holdings

**Files:**
- Create: `apps/web/public-profiles/loopers/src/04-holdings.js`
- Create: `apps/web/test/looper-multipass-profile-holdings.test.mjs`

- [ ] **Step 1: Write failing parser/client tests**

Cover:

- exact `GET` ERC-20 and encoded ERC-721/ERC-1155 URLs with `redirect:'error'`, `credentials:'omit'`, no headers/cookies, and required 2xx JSON response;
- 10-second timeout and streaming 1 MiB hard cap when `Content-Length` is missing, false, accurate, or exceeded by chunks;
- required response fields `items`/`next_page_params`, extra response/item/token keys ignored, and `next_page_params` restricted to null or object without reading cursor members;
- arrays over 100 invalidate that section rather than truncate; valid output displays at most 12;
- exact nested/top-level field locations and 20-byte token addresses;
- name/symbol nullability and 80/24-character caps;
- ERC-20 `token_id`/`token_instance` null, canonical nonnegative `value`, decimal string in `0..255`;
- NFT type exact, decimal null or `"0"`, canonical token ID, positive top-level `value`, ignored null/object `token_instance`;
- ignored remote icon/metadata URLs;
- malformed fungible response leaves NFT status intact and vice versa;
- recursively frozen outputs and item arrays;
- malicious names/symbols/cursors cannot create URLs, markup, attributes, or handlers.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-holdings.test.mjs
```

Expected: FAIL because the placeholder holdings unit is not implemented.

- [ ] **Step 3: Implement holdings client**

Expose:

```js
createHoldingsClient({ fetchImpl, timeoutMs: 10_000, maxBytes: 1_048_576 })
  .load(manifest, nativeBalance)
```

Start both Blockscout requests independently of RPC. Return frozen:

```js
{
  nativeBalance: null|canonicalQuantity,
  fungible: { status:'loaded'|'unavailable', items, hasMore },
  nfts: { status:'loaded'|'unavailable', items, hasMore }
}
```

`nativeBalance` is merged later from the newest complete current snapshot; a proof/RPC failure leaves it null without discarding valid Blockscout sections. Use `BigInt` for raw balances and format without floating-point arithmetic.

- [ ] **Step 4: Run tests, prove drift, regenerate, and confirm GREEN**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-holdings.test.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check  # expected nonzero before regeneration
node apps/web/scripts/build-looper-multipass-profiles.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check
```

Expected: focused suite reports zero failures and regenerated artifact is current.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public-profiles/loopers/src/04-holdings.js apps/web/public-profiles/loopers/3802/index.html apps/web/test/looper-multipass-profile-holdings.test.mjs
git commit -m "feat: read Looper wallet holdings"
```

### Task 6: Render and bootstrap the public profile

**Files:**
- Create: `apps/web/public-profiles/loopers/src/05-renderer.js`
- Create: `apps/web/public-profiles/loopers/src/06-bootstrap.js`
- Create: `apps/web/test/looper-multipass-profile-page.test.mjs`
- Modify: `apps/web/public-profiles/loopers/index.template.html`
- Regenerate: `apps/web/public-profiles/loopers/3802/index.html`

- [ ] **Step 1: Write failing JSDOM page tests**

Assert:

- neutral initial `Checking onchain proof` state;
- `Wallet active` and `Verified` appear only for complete verified fixtures;
- mismatch/unavailable copy is distinct;
- immutable address/links and deterministic artwork fallback remain usable on proof/artwork failure;
- exact account, activation transaction/block/time, runtime/binding statuses, data-source labels, ERC-8004 identity/URI, registry/adapter links, holder/controller, current block, and injected-clock last-checked time render;
- ETH uses only current complete RPC balance;
- `Blockscout-indexed holdings`, `Token holdings unavailable`, `NFT holdings unavailable`, `No indexed assets yet`, `More holdings may exist`, and manifest-derived explorer links render under the exact conditions;
- proof failure does not discard valid holdings and holdings failure does not change proof status;
- all remote strings use `textContent` and malicious names/errors cannot create markup/attributes/URLs;
- every external `href` comes from the validated manifest and new contexts use `rel="noopener noreferrer"`;
- refresh A stale success, rejection, timeout, and `finally` paths cannot render after refresh B; every render path checks the generation;
- copy uses Clipboard API only from a user click; unavailable clipboard produces a status-announced non-editable failure and never creates a textarea/uses `execCommand`;
- semantic heading/list/button/link structure and live status regions exist;
- color-independent text statuses, mobile section order, address wrapping, focus styles, and reduced-motion CSS rules exist;
- no wallet provider, storage, cookie, service worker, form, or POST/write boundary exists.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-page.test.mjs
```

Expected: FAIL because renderer/bootstrap placeholders are not implemented.

- [ ] **Step 3: Implement renderer and bootstrap**

Renderer exposes:

```js
createProfileRenderer(document, manifest)
  .renderChecking()
  .renderResult({ proof, holdings, checkedAt })
  .renderFatal(message)
```

Bootstrap creates one refresh generation counter and injected clock. It starts current RPC, historical RPC, and both Blockscout requests concurrently with `Promise.allSettled`; merges native balance only after a complete newest current snapshot; preserves valid holdings when proof fails and valid proof when either holdings section fails; checks the active generation before every success, error, timeout, and `finally` render; and binds one read-only `Refresh proof` button. Use DOM creation and `textContent`; never `innerHTML` for remote values.

- [ ] **Step 4: Add responsive visual treatment in the template**

Use the established warm Multipass palette but keep CSS local. Desktop: art/profile and wallet/proof columns. Mobile: art, wallet, proof, identity, holdings. Add `overflow-wrap:anywhere`, reduced-motion rules, visible focus states, semantic `<section>` labels, and textual status indicators. Extend JSDOM/CSS assertions for semantic structure, mobile order tokens, focus declarations, reduced-motion media query, and address wrapping; reserve pixel overflow/section-order confirmation for Task 7 browser smoke.

- [ ] **Step 5: Regenerate, run tests, and commit**

```bash
node apps/web/scripts/build-looper-multipass-profiles.mjs --check  # expected nonzero before regeneration
node apps/web/scripts/build-looper-multipass-profiles.mjs
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-manifest.test.mjs test/looper-multipass-profile-rpc.test.mjs test/looper-multipass-profile-proof.test.mjs test/looper-multipass-profile-holdings.test.mjs test/looper-multipass-profile-page.test.mjs
node apps/web/scripts/build-looper-multipass-profiles.mjs --check
git add apps/web/public-profiles/loopers apps/web/test/looper-multipass-profile-page.test.mjs
git commit -m "feat: present Looper wallet Multipass profile"
```

Expected: pre-regeneration check fails, all five focused suites report zero failures, and final freshness passes.

---

## Chunk 4: Security gates, browser proof, and deployment

### Task 7: Add static scanner and desktop/mobile smoke

**Files:**
- Create: `apps/web/scripts/scan-looper-multipass-profile.mjs`
- Create: `apps/web/scripts/smoke-looper-multipass-profile.mjs`
- Modify: `apps/web/test/looper-multipass-profile-manifest.test.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write scanner regression tests**

Scanner must fail on:

- `window.ethereum`, `eth_sendTransaction`, signing/approval methods;
- `localStorage`, `sessionStorage`, IndexedDB, cookies, service workers;
- remote executable scripts/imports/eval/Function;
- unexpected fetch origins, methods, redirect modes, or URL construction;
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`;
- forms, editable address/token/RPC/calldata fields;
- missing/incorrect CSP hashes or route metadata;
- multiple/missing inline scripts;
- generated/source drift.

- [ ] **Step 2: Implement scanner and confirm mutation failures**

- [ ] **Step 3: Implement Playwright smoke**

Support:

```bash
node scripts/smoke-looper-multipass-profile.mjs --base-url http://127.0.0.1:4173
node scripts/smoke-looper-multipass-profile.mjs --base-url https://helixa.xyz
```

Inject a tripwire `window.ethereum` whose property access throws, intercept every request against an exact allowlist, and record cookie/storage mutations. For 1280×900 and 390×844 assert HTTP/page load, exact profile heading, canonical/OG/Twitter/JSON-LD and no `noindex`, no console/page/CSP errors, no horizontal overflow, correct mobile section order, visible focus behavior, no wallet dependency, no storage/cookie writes, verified live proof, empty holdings state, valid account/transaction links, and screenshots saved under a temporary artifact directory.

Add intercepted failure scenarios at one viewport:

- both RPC origins fail: immutable content/links remain, status is unavailable, never verified;
- origins disagree: mismatch, never verified;
- ERC-20 endpoint fails while NFT succeeds, and vice versa: independent unavailable labels;
- both Blockscout endpoints fail: never `No indexed assets yet`;
- stale refresh A resolves/rejects after refresh B: no stale DOM update.

Add the delayed package scripts now that files exist:

```json
"check:looper-multipass-profile": "node scripts/build-looper-multipass-profiles.mjs --check && node scripts/scan-looper-multipass-profile.mjs",
"smoke:looper-multipass-profile": "CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-looper-multipass-profile.mjs"
```

- [ ] **Step 4: Run focused/full gates**

```bash
pnpm --filter @helixa/multipass-web run check:looper-multipass-profile
pnpm --filter @helixa/multipass-web exec node --test test/looper-multipass-profile-manifest.test.mjs test/looper-multipass-profile-rpc.test.mjs test/looper-multipass-profile-proof.test.mjs test/looper-multipass-profile-holdings.test.mjs test/looper-multipass-profile-page.test.mjs
pnpm --filter @helixa/multipass-web test
pnpm web:build
pnpm --filter @helixa/multipass-web run check:looper-multipass-profile
for f in apps/web/public-profiles/loopers/src/*.js; do node --check "$f"; done
node --check apps/web/scripts/build-looper-multipass-profiles.mjs
node --check apps/web/scripts/scan-looper-multipass-profile.mjs
node --check apps/web/scripts/smoke-looper-multipass-profile.mjs
git diff --check
```

Serve the freshly produced `apps/web/dist` locally, run all successful/failure desktop/mobile smoke cases, and inspect both successful screenshots plus one unavailable-state screenshot.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/scan-looper-multipass-profile.mjs apps/web/scripts/smoke-looper-multipass-profile.mjs apps/web/test/looper-multipass-profile-manifest.test.mjs apps/web/package.json apps/web/public-profiles/loopers/3802/index.html
git commit -m "test: harden Looper Multipass profile"
```

### Task 8: Independent code review and final predeployment verification

**Files:**
- Review all changed profile files and exact package script change.

- [ ] **Step 1: Dispatch spec-compliance reviewer**

Give only the final spec path, plan path, commit range, and changed-file allowlist. Fix all blocking findings and re-review.

- [ ] **Step 2: Dispatch code-quality/security reviewer**

Focus on parser ambiguity, mixed-block evidence, CSP hash correctness, remote-data sinks, fetch bounds, race handling, and generated drift. Fix blocking findings and re-review.

- [ ] **Step 3: Re-run all focused and full gates from a clean worktree**

Record exact counts and build output. Require `git status --short` empty.

- [ ] **Step 4: Capture final live read-only predeployment evidence**

Using the production runtime/verifier or an equivalent fixture harness, confirm current account runtime, holder/controller, identity binding, activation receipt coordinates, zero/current balance, and Blockscout response status. No wallet or write call.

### Task 9: Install exact route, Nginx mapping, and verify production

**Files:**
- Install: `/var/www/helixa.xyz/multipass/loopers/3802/index.html`
- Modify: `/etc/nginx/sites-enabled/helixa.xyz` only after timestamped backup

- [ ] **Step 1: Prepare atomic rollback artifacts**

Before mutation record:

- whether `/var/www/helixa.xyz/multipass/loopers/3802/index.html` and each parent route directory exist;
- exact SHA-256 of any pre-existing route file;
- exact SHA-256 of `/etc/nginx/sites-enabled/helixa.xyz` and its timestamped backup;
- exact SHA-256 of `/var/www/helixa.xyz/multipass/index.html`;
- decoded HTTP body SHA-256, status, final URL, and headers for public `/multipass/`;
- a baseline browser load of `/multipass/` with no page/console error.

Record source profile SHA-256. Prepare temporary files on the same filesystem; do not overwrite `/multipass/index.html` or shared assets.

Implement deployment as one `set -Eeuo pipefail` shell transaction with `ERR`, `INT`, and `TERM` traps. The rollback handler restores Nginx byte-for-byte, restores a prior profile file or removes the newly created file and only newly created empty directories when the route was previously absent, runs `nginx -t`, reloads, verifies restored hashes/state, and rechecks prior public route behavior. Disarm traps only after every public hash/header/browser/SPA/final-state gate passes.

- [ ] **Step 2: Install the page atomically**

Create the route directory, install the generated artifact to a temp name with readable permissions, then rename into place. Verify installed hash equals source hash.

- [ ] **Step 3: Insert exact Nginx locations safely**

Re-read current config, insert the two approved exact locations immediately before `location /multipass/`, preserve all unrelated content, run:

```bash
sudo nginx -t
```

Only after success reload Nginx. Any later HTTP, header, hash, browser, SPA, or final onchain verification failure must invoke the same rollback handler, not merely report an error.

- [ ] **Step 4: Verify HTTP/security/routing**

For both slashless and trailing-slash URLs assert:

- HTTP 200 with no redirect;
- content type HTML;
- `Content-Security-Policy: frame-ancestors 'none'`;
- `X-Frame-Options: DENY`;
- canonical remains slashless;
- source, installed, and fetched body SHA-256 match after transport decoding;
- installed `/var/www/helixa.xyz/multipass/index.html` hash and decoded public `/multipass/` body hash/status/final URL equal the predeployment baseline;
- baseline browser smoke for generic `/multipass/` still has no page/console error;
- OpenSea metadata external URL still equals the slashless profile route.

- [ ] **Step 5: Run public desktop/mobile smoke and inspect screenshots**

Require live `Verified`, exact wallet/identity/transaction links, honest holdings state, exact canonical/OG metadata and no `noindex`, no console/CSP errors, no overflow, tripwire `window.ethereum` untouched, and only allowlisted network reads. Re-run the intercepted RPC/Blockscout failure cases against the installed artifact before disarming rollback.

- [ ] **Step 6: Run final read-only state check and report**

Record canonical block, account runtime hash, holder/controller, identity ID/binding, activation receipt/event, ETH balance, and Blockscout statuses. Report the public URL and proof links. No wallet connection or onchain transaction occurs.

---

## Completion checklist

- [ ] Final generated artifact and source are deterministic and current.
- [ ] Focused profile suites pass.
- [ ] Full web suite and production build pass.
- [ ] Static scanner approves.
- [ ] Local desktop/mobile smoke and screenshots pass.
- [ ] Spec/security and code-quality reviews approve.
- [ ] Exact route-only production install and Nginx test/reload succeed.
- [ ] Public slashless/trailing routes, CSP headers, hashes, and screenshots pass.
- [ ] Generic Multipass route remains unchanged.
- [ ] Final onchain proof is independently rechecked read-only.
- [ ] Worktree is clean and final commits are recorded.

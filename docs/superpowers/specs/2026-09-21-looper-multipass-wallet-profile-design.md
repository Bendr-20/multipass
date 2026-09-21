# Looper Multipass Wallet Profile Design

**Date:** 2026-09-21  
**Status:** User-approved direction; implementation pending

## Goal

Turn the existing immutable Looper metadata destination, `/multipass/loopers/3802`, into a real public Multipass profile that proves Looper #3802 has an activated ERC-6551 wallet. The page must be useful as the destination linked from OpenSea while remaining read-only, indexable, safe, and understandable to people who do not know ERC-6551.

Build the profile as the first instance of a reusable static Looper-profile generator. Each future Looper profile can supply a small immutable manifest and generate the same route structure without changing the main Multipass single-page application. Looper #3802 is the only profile deployed in this slice.

## Chosen approach

Generate a standalone Multipass-branded page at:

```text
https://helixa.xyz/multipass/loopers/3802
```

The page owns no wallet connection or write capability. It combines immutable identity facts with bounded live read-only evidence from Base RPC and Base Blockscout.

This approach is preferred because:

- the NFT metadata already points to the exact route;
- a dedicated static route avoids replacing or regressing the actively developed Multipass application bundle;
- deterministic generation keeps the committed source and deployed artifact auditable;
- the manifest/runtime split is reusable for later Loopers;
- live verification can fail closed without hiding the permanent identity card.

### Rejected alternatives

1. **Patch the main Multipass SPA now.** This would make the route feel native, but the live app currently includes parallel uncommitted runtime work in shared files. A full rebuild from an older clean branch risks removing production behavior unrelated to this profile.
2. **Hard-code a handwritten #3802 page.** Fastest, but it creates a dead-end implementation and duplicates the same facts across markup and scripts.
3. **Rely on OpenSea alone.** OpenSea is useful discovery, but its ERC-6551 presentation is not a dependable project-controlled profile or proof surface.

## Product role

- **Multipass is the canonical public profile.** It explains the Looper, wallet, controller, ERC-8004 identity, evidence, and holdings.
- **OpenSea is a discovery surface.** The NFT's existing `external_url` already points to the Multipass route. No metadata rewrite is required.
- **BaseScan and Blockscout are evidence links.** They remain secondary proof and portfolio sources, not the primary user experience.

## Page hierarchy

### 1. Hero identity card

Display:

- Looper artwork and name;
- `Looper #3802` and collection label;
- `Wallet active` only when live code and binding checks pass;
- concise description: `A Looper with its own onchain account`;
- current holder, shortened with a copy-safe full-address control;
- links to OpenSea and the NFT contract/token evidence.

The initial HTML includes the immutable name, image, route, token ID, and addresses so the page remains meaningful before JavaScript runs. Live claims begin in a neutral `Checking onchain proof` state.

### 2. Wallet card

Display:

- ERC-6551 account `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38`;
- Base network;
- deployment status;
- live ETH balance;
- live controller returned by `owner()`;
- BaseScan account link;
- successful activation transaction link;
- human explanation that control follows the current owner of Looper #3802.

### 3. Verified binding

Show a compact proof chain:

```text
Looper #3802
  -> ERC-6551 account on Base
  -> controlled by current Looper holder
  -> ERC-8004 identity #90994
```

Verification is one immutable, block-anchored snapshot rather than a mixture of latest-state calls. It requires all of:

- both RPC origins report chain ID `0x2105`;
- the selected origin returns a latest non-null block number/hash and the second origin independently returns the same hash for that number;
- every state read below is executed against the selected block hash with EIP-1898 `{blockHash, requireCanonical: true}`; if an origin cannot serve the complete batch at that hash, discard the whole batch and retry the whole batch on the other origin only after re-confirming that block hash;
- account runtime is exactly the expected 173-byte runtime and SHA-256;
- account `token()` returns exactly `(8453, Loopers contract, 3802)`;
- account `owner()` equals the exact result of `Loopers.ownerOf(3802)`;
- account `state()` returns exactly uint256 zero for this newly deployed account;
- account `isValidSigner(holder,emptyContext)` returns the exact ERC-6551 magic value pinned in the activation implementation;
- Loopers `tokenBoundAccount(3802)` and canonical registry `account(implementation,salt,8453,Loopers,3802)` both equal the pinned account;
- Loopers `erc8004BoundByLooper(3802)` is exactly true, `erc8004AgentIdByLooper(3802)` is exactly `90994`, and `erc8004AgentURI(3802)` is exactly the pinned URI;
- Adapter8004 `identityRegistry()` equals the pinned registry, `bindingOf(90994)` is exactly `(0,Loopers,3802)`, and `isController(90994,holder)` is exactly true;
- Identity Registry `ownerOf(90994)` equals Adapter8004 and `tokenURI(90994)` exactly equals the pinned URI;
- the pinned activation transaction and receipt share one hash and block coordinate, the receipt status is successful, the receipt block is canonical, and the receipt contains exactly one matching canonical `ERC6551AccountCreated` event with exact account, implementation, salt, chain, token contract, and token ID.

The verifier classifies evidence with strict precedence:

1. `mismatch` if any successfully returned authoritative value disagrees, if the two origins disagree on the selected block hash, or if transaction/receipt/event coordinates disagree;
2. `unavailable` only when no authoritative mismatch was observed but a required request timed out, reverted, returned malformed data, lacked archive/EIP-1898 support, or left the snapshot incomplete;
3. `verified` only when the complete batch and receipt proof pass.

A mismatch cannot be masked by a later timeout or fallback result. Any non-verified result removes `Wallet active` and `Verified`; the page shows `Proof mismatch` or `Proof unavailable` while leaving immutable addresses and explorer links visible.

### 4. Wallet holdings

Display three live groups:

- native ETH balance from Base RPC;
- indexed fungible-token balances from Base Blockscout;
- indexed NFT balances from Base Blockscout.

The page must label non-native holdings as `Blockscout-indexed holdings`, cap rendered items, validate every response field, and support pagination only through an explicit `View on Blockscout` link in this first slice. An empty Blockscout result renders `No indexed assets yet`, not a universal claim that no assets exist.

### 5. Agent identity

Display:

- ERC-8004 identity `#90994`;
- the exact Looper-bound identity URI;
- identity registry and adapter evidence links;
- current holder/controller status;
- public Looper personality summary from immutable metadata when the metadata fetch succeeds.

Metadata is content, not authority. It may supply artwork and descriptive text but cannot determine wallet verification.

### 6. Public proof

Show:

- activation transaction hash and BaseScan link;
- activation block/time when available;
- runtime verification result;
- binding verification result;
- data-source labels and last-checked time;
- `Refresh proof` as a read-only action.

No raw debug trace or full JSON is shown by default.

## Immutable profile manifest

Create one small manifest for Looper #3802 containing only pinned public facts:

- chain ID and chain label;
- Looper contract and token ID;
- artwork/metadata URI and canonical profile route;
- deterministic account;
- expected account implementation, salt, runtime bytes, and runtime SHA-256;
- ERC-8004 identity ID and registry/adapter addresses;
- activation transaction hash, canonical registry, event topic, and expected event values;
- explorer/OpenSea links.

The manifest is deep-frozen at runtime. Unknown fields fail generation. The generator must ensure every address, hash, URL, token ID, and route is canonical before producing the page.

## Runtime boundaries

Split the generated runtime into focused units:

1. **Manifest and strict codecs**
   - Validates and freezes immutable profile facts.
   - Owns address, quantity, ABI word, and runtime-hash helpers.

2. **Read-only Base client**
   - Accepts a closed typed request union for `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getBalance`, `eth_call`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt` only.
   - Selects one canonical block, confirms it across both origins, and executes one whole EIP-1898 state batch; it never mixes partial batches from different origins.
   - Uses bounded per-request and whole-refresh timeouts.
   - Never accesses `window.ethereum` and never sends a transaction.

3. **Wallet proof verifier**
   - Accepts raw evidence plus the immutable manifest; it performs no network I/O.
   - Strictly decodes code, binding, holder/controller, identity, transaction, receipt, and event evidence with no trailing ABI bytes.
   - Returns one immutable `verified`, `unavailable`, or `mismatch` result using the precedence defined above.

4. **Holdings client**
   - Reads only the exact Base Blockscout address/token endpoints.
   - Validates response shapes, caps item count, and never follows an arbitrary URL from a response.

5. **Renderer**
   - Uses DOM node creation and `textContent` for remote values.
   - Owns status updates, address copying, refresh, and safe external links.
   - Cannot perform RPC or portfolio fetches directly.

6. **Bootstrap**
   - Wires the four read-only units and performs one initial refresh.
   - Has no wallet, storage, analytics, cookie, or write boundary.

## Data sources

Exact public origins:

- Base RPC primary: `https://mainnet.base.org`
- Base RPC fallback: `https://base.drpc.org`
- Indexed holdings: `https://base.blockscout.com/api/v2/addresses/{account}/tokens`
- Address summary: `https://base.blockscout.com/api/v2/addresses/{account}`
- Immutable metadata: the pinned Arweave URI after exact-origin validation

Allowed JSON-RPC methods are exactly `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getBalance`, `eth_call`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`. Every request uses fixed parameters constructed from the manifest or selected block; the URL, method, address, block, and calldata are never supplied by query strings, storage, remote metadata, or DOM state.

All network reads use GET or JSON-RPC POST without credentials or cookies. RPC uses `redirect: "error"`; Blockscout and metadata redirects may be followed only when the final URL remains on an explicit allowlist. The holdings client accepts only the exact HTTPS Blockscout origin and path prefix. Remote images must resolve to an allowlisted Arweave gateway or an existing pinned Helixa asset URL.

## Routing and generation

Source layout:

```text
apps/web/public-profiles/loopers/
  manifests/3802.js
  index.template.html
  src/*.js
apps/web/scripts/build-looper-multipass-profiles.mjs
apps/web/test/looper-multipass-profile-*.test.mjs
```

The builder:

- validates the exact source manifest;
- concatenates the allowlisted runtime units in a fixed order;
- replaces one inline-script marker;
- emits deterministic LF output;
- writes the committed generated artifact for review;
- supports `--check` and `--dist` modes;
- places the production artifact at `dist/multipass/loopers/3802/index.html`.

Only the #3802 manifest is accepted in this release. Adding another Looper requires a separately reviewed manifest and generated artifact.

## Security and privacy

The public profile:

- has no wallet connect button;
- does not access an injected provider;
- cannot sign, send, approve, transfer, mint, or fund;
- does not use local storage, session storage, IndexedDB, cookies, service workers, or URL-supplied RPC endpoints;
- does not load remote executable scripts;
- does not render remote HTML;
- does not expose private API keys or use credentialed requests;
- uses a strict Content Security Policy compatible with its exact RPC, Blockscout, image, and explorer origins;
- includes no analytics in this slice.

The activation owner page remains separate and no longer acts as the public profile.

## Error handling

- **RPC unavailable or incomplete snapshot:** discard the whole attempted batch, keep immutable identity facts, mark live proof unavailable, and preserve explorer links.
- **RPC origins disagree on chain or canonical block:** classify as proof mismatch and do not retry into a verified state during that refresh.
- **Runtime mismatch:** show `Proof mismatch`, never `Wallet active` or `Verified`.
- **Holder/controller/identity mismatch:** show a controller or identity warning and no verified badge.
- **Receipt unavailable:** deployed state may be shown as `Observed onchain`, but not `Activation verified`.
- **Metadata unavailable:** show a deterministic initials/image fallback and keep proof operational.
- **Blockscout unavailable:** show `Holdings temporarily unavailable`; do not infer zero balances.
- **Malformed remote data:** reject the affected data source and render safe status copy.
- **Refresh race:** only the newest refresh may update the page.

## SEO and social sharing

The generated HTML includes:

- index/follow robots policy;
- canonical route;
- title `Looper #3802 Multipass | Helixa`;
- concise description mentioning the verified token-bound wallet;
- Open Graph and Twitter image/title/description;
- JSON-LD describing the public profile and canonical NFT/account references without inventing ownership claims.

## Accessibility and responsive behavior

- Use semantic headings, lists, links, buttons, and status regions.
- Every status has text; color is never the sole signal.
- Full addresses can wrap or copy without horizontal overflow.
- Desktop uses a two-column hero/wallet layout.
- Mobile stacks artwork, wallet, proof, identity, and holdings in that order.
- Respect reduced motion.

## Tests

### Pure and generation tests

- manifest accepts exact #3802 facts and rejects unknown or malformed fields;
- builder output is deterministic and current;
- generated artifact has one inline script and no remote executable code;
- scanner rejects wallet-provider access, send methods, storage, cookies, arbitrary fetch origins, unsafe DOM sinks, and unexpected forms/inputs;
- canonical-snapshot tests reject mixed blocks, changed hashes, origin disagreement, partial-batch fallback, wrong chain IDs, stale responses, and mismatch masking by transport failure;
- ABI/runtime/event verifiers accept pinned fixtures and reject mutated account, implementation, salt, chain, token, holder, account state, signer magic, receipt coordinates, code, URI, adapter binding, controller, and identity values;
- holdings parser validates and caps Blockscout data;
- route and metadata tags are exact.

### Browser tests

- local desktop and mobile render without overflow;
- live read-only proof resolves to verified on Base;
- account, controller, identity, receipt, and runtime values match the pinned deployment;
- wallet/provider remains absent and no write method is called;
- Blockscout empty state is honest;
- RPC and Blockscout failure states remain readable;
- screenshot inspection confirms usable hierarchy and no clipped addresses.

### Deployment verification

- back up the exact route before replacement;
- publish only `/multipass/loopers/3802/`;
- compare source, installed, and fetched SHA-256;
- verify HTTP 200, canonical/OG metadata, account/transaction links, CSP, and noindex absence;
- run public desktop/mobile smoke against live Base and Blockscout;
- confirm the OpenSea-linked external URL now opens the Looper profile rather than generic Multipass home;
- run a final read-only onchain state check;
- keep a tested rollback path.

## Success criteria

The work is complete when a visitor opening `https://helixa.xyz/multipass/loopers/3802` sees a polished Looper profile, a live verified ERC-6551 wallet status, current controller, ERC-8004 identity #90994, activation proof, live ETH balance, honest Blockscout-indexed holdings, and explorer/OpenSea links on desktop and mobile. The page must perform no wallet or onchain write and must fail closed on every verification mismatch.

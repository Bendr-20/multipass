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

Verification has separate current and historical anchors; neither mixes latest-state calls from different blocks.

The current snapshot requires all of:

- both RPC origins report chain ID `0x2105`;
- both origins return non-null latest blocks whose heights differ by at most 20 blocks;
- the lower height is selected, both origins return the same number/hash/timestamp for it, and its timestamp is not more than ten minutes behind or five minutes ahead of an injected client clock; a client-clock failure is `unavailable`, while origin disagreement is `mismatch`;
- every current state read below is executed against the selected block hash with EIP-1898 `{blockHash, requireCanonical: true}`; if an origin cannot serve the complete batch at that hash, discard the whole batch and retry the whole batch on the other origin only after re-confirming that block hash;
- Loopers proxy and implementation, ERC-6551 registry and account implementation, Adapter8004 proxy and implementation, and Identity Registry proxy and implementation have the exact code hashes and proxy slots pinned in the manifest;
- account runtime is exactly the expected 173-byte runtime and SHA-256;
- account `token()` returns exactly `(8453, Loopers contract, 3802)`;
- account `owner()` equals the exact result of `Loopers.ownerOf(3802)`;
- account `state()` is a canonical uint256 and is displayed as mutable account state; its current value is not required to remain zero;
- account `isValidSigner(holder,emptyContext)` returns the exact 32-byte value `0x523e326000000000000000000000000000000000000000000000000000000000`;
- Loopers `tokenBoundAccount(3802)` and canonical registry `account(implementation,salt,8453,Loopers,3802)` both equal the pinned account;
- Loopers `erc8004BoundByLooper(3802)` is exactly true, `erc8004AgentIdByLooper(3802)` is exactly `90994`, and `erc8004AgentURI(3802)` is exactly the pinned URI;
- Adapter8004 `identityRegistry()` equals the pinned registry, `bindingOf(90994)` is exactly `(0,Loopers,3802)`, and `isController(90994,holder)` is exactly true;
- Identity Registry `ownerOf(90994)` equals Adapter8004 and `tokenURI(90994)` exactly equals the pinned URI.

The historical activation snapshot uses the pinned transaction hash, block number, block hash, and holder `0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4`. Both origins must return that exact canonical block. Every historical code, slot, balance, and call read uses EIP-1898 `{blockHash:"0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1",requireCanonical:true}`; block-number-only reads are forbidden. The transaction and receipt must share the pinned hash, block hash, block number, and transaction index; receipt status must be `0x1`; and receipt log index `0x106` must be the sole registry creation event with the exact pinned address, topics, data, transaction hash, coordinates, and `removed:false`. Historical account runtime and `token()` must match the manifest; `owner()` must equal the pinned holder; `state()` must be exactly uint256 zero; `isValidSigner(pinnedHolder,emptyContext)` must return exactly `0x523e326000000000000000000000000000000000000000000000000000000000`; and the account balance must be exactly zero. `Activation verified` means only that this canonical transaction contains the exact ERC-6551 creation event and the created account had the exact post-state at that block. It does not claim who submitted, sponsored, or authorized the enclosing EntryPoint transaction, so direct-versus-bundled operator attribution is outside this public profile.

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

The holdings client makes two independent exact requests, each with a ten-second timeout and 1 MiB response limit:

```text
GET /api/v2/addresses/{account}/tokens?type=ERC-20
GET /api/v2/addresses/{account}/tokens?type=ERC-721%2CERC-1155
```

Each response must be an object containing `items` and `next_page_params`; extra response keys are ignored. `items` must be an array of at most 100 entries and each section renders at most 12. Every item must be an object with required fields at these exact locations: top-level `token`, `token_id`, `token_instance`, and `value`; nested `token.address_hash`, `token.type`, `token.name`, `token.symbol`, and `token.decimals`. Extra item/token fields are ignored.

For an `ERC-20` item: `token.type` is exactly `ERC-20`; `token.address_hash` is a 20-byte address; `token.name` and `token.symbol` are strings or null and are capped to 80 and 24 characters; `token.decimals` is a canonical decimal string whose integer is in `0..255`; top-level `token_id` and `token_instance` are null; and top-level `value` is a canonical nonnegative decimal integer string.

For an NFT item: `token.type` is exactly `ERC-721` or `ERC-1155`; `token.address_hash` is a 20-byte address; `token.name` and `token.symbol` follow the same nullable caps; `token.decimals` is null or the string `0`; top-level `token_id` is a canonical nonnegative decimal integer string; top-level `token_instance` may be null or an object but is ignored; and top-level `value` is the canonical positive decimal integer quantity displayed for that token ID (`1` for a normal ERC-721 holding, potentially greater for ERC-1155).

Remote icon or metadata URLs are ignored and never loaded. One malformed item invalidates only that endpoint's section, which renders `Token holdings unavailable` or `NFT holdings unavailable`; it never silently presents that section as complete. A non-null `next_page_params` may be an object of unknown server-owned cursor fields and produces `More holdings may exist` plus the explorer link; the client never reads or follows those cursor values.

The page labels non-native holdings as `Blockscout-indexed holdings`. Two empty valid first pages with null pagination render `No indexed assets yet`, not a universal claim that no assets exist.

### 5. Agent identity

Display:

- ERC-8004 identity `#90994`;
- the exact Looper-bound identity URI;
- identity registry and adapter evidence links;
- current holder/controller status;
- public Looper personality summary copied from the immutable metadata into the validated build-time manifest.

Metadata is content, not authority. There is no runtime metadata fetch. Manifest artwork and descriptive text cannot determine wallet verification.

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
- pinned artwork URL, descriptive metadata fields, metadata source URI, and canonical profile route;
- deterministic account;
- expected account implementation, salt, runtime bytes, and runtime SHA-256;
- exact proxy/implementation code hashes and EIP-1967 slot words needed by the live proof;
- ERC-8004 identity ID, URI, registry/adapter addresses, code hashes, and slots;
- activation transaction and canonical receipt/event coordinates;
- explorer/OpenSea links.

The manifest copies security-critical pins from the approved activation specification and the independently captured post-deployment receipt. It must include these exact post-deployment coordinates:

| Field | Exact value |
|---|---|
| Transaction | `0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c` |
| Block number | `0x3132ee6` |
| Block hash | `0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1` |
| Transaction index | `0x56` |
| Receipt status | `0x1` |
| Registry log index | `0x106` |
| Registry event topic | `0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722` |
| Event account | `0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38` |
| Event implementation | `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF` |
| Event salt | `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee` |
| Event chain/token | Base `8453`, Loopers `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`, token `3802` |

The current-proof pin table is exact:

| Identity | Runtime SHA-256 | EIP-1967 slot word when applicable |
|---|---|---|
| Looper #3802 account runtime | `0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a` | n/a |
| Loopers proxy | `0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662` | `0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908` |
| Loopers implementation | `0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec` | n/a |
| ERC-6551 registry | `0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56` | n/a |
| Account implementation | `0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5` | n/a |
| Adapter8004 proxy | `0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017` | `0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9` |
| Adapter8004 implementation | `0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be` | n/a |
| Identity Registry proxy | `0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85` | `0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02` |
| Identity Registry implementation | `0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1` | n/a |

Code byte lengths and exact runtime bytes remain copied from `2026-09-20-looper-3802-wallet-activation-design.md`; generation fails if that source and the manifest diverge. The manifest is deep-frozen at runtime. Unknown fields fail generation. The generator must ensure every address, hash, URL, token ID, and route is canonical before producing the page.

## Runtime boundaries

Split the generated runtime into focused units:

1. **Manifest and strict codecs**
   - Validates and freezes immutable profile facts.
   - Owns address, quantity, ABI word, and runtime-hash helpers.

2. **Read-only Base client**
   - Accepts a closed typed request union for `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getStorageAt`, `eth_getBalance`, `eth_call`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt` only.
   - Selects one canonical block, confirms it across both origins, and executes one whole EIP-1898 state batch; it never mixes partial batches from different origins.
   - Uses bounded per-request and whole-refresh timeouts.
   - Never accesses `window.ethereum` and never sends a transaction.

3. **Wallet proof verifier**
   - Accepts raw evidence plus the immutable manifest; it performs no network I/O.
   - Strictly decodes code, binding, holder/controller, identity, transaction, receipt, and event evidence with no trailing ABI bytes.
   - Returns one immutable `verified`, `unavailable`, or `mismatch` result using the precedence defined above.

4. **Holdings client**
   - Reads only the exact Base Blockscout token endpoint for the pinned account.
   - Owns the native-balance value supplied by the current Base snapshot and the validated Blockscout holdings result.
   - Validates response shapes and numeric domains, enforces byte/item/time caps, and never follows an arbitrary URL or pagination value from a response.

5. **Renderer**
   - Uses DOM node creation and `textContent` for remote values.
   - Owns status updates, address copying, refresh, and safe external links.
   - Cannot perform RPC or portfolio fetches directly.

6. **Bootstrap**
   - Wires the four read-only units and performs one initial refresh with an injected clock.
   - Uses only artwork and descriptive content already validated into the immutable manifest; it performs no runtime metadata fetch.
   - Has no wallet, storage, analytics, cookie, or write boundary.

## Data sources

Exact public origins:

- Base RPC primary: `https://mainnet.base.org`
- Base RPC fallback: `https://base.drpc.org`
- Fungible holdings: `https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-20`
- NFT holdings: `https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-721%2CERC-1155`
- Artwork: `https://3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq.arweave.net/3ZwkzgHeRr0Chw14FzKmwZf54fyHi6d0KVOZQprgq50`
- Metadata source reference only: `https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json`

Allowed JSON-RPC methods are exactly `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getStorageAt`, `eth_getBalance`, `eth_call`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`. Every request uses fixed parameters constructed from the manifest, the selected current block, or the pinned historical receipt coordinates; the URL, method, address, block, and calldata are never supplied by query strings, storage, remote metadata, or DOM state.

All runtime network reads use JSON-RPC POST or the two exact Blockscout GETs without credentials or cookies. RPC uses `redirect: "error"`; both Blockscout URLs are exact and use `redirect: "error"`. There is no runtime metadata request. The artwork and OG image use the exact final Arweave HTTPS URL above; CSP does not wildcard Arweave. `connect-src` is exactly the two RPC origins and Base Blockscout, while `img-src` is exactly `'self'` and the pinned artwork origin.

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
- writes the committed generated artifact at `apps/web/public-profiles/loopers/3802/index.html` for review;
- supports `--check` and `--dist` modes;
- writes `apps/web/dist/multipass/loopers/3802/index.html` in `--dist` mode.

The existing web build sequence remains intact and appends this generator: Vite first, then `write-allowlist-entry.mjs`, then the activation-page builder, then this profile builder. Vite therefore cannot clear any generated route after it is written, and the existing allowlist and activation artifacts remain generated. In production, the committed generated artifact maps directly to `/var/www/helixa.xyz/multipass/loopers/3802/index.html`; the route-only deploy copies that one file and does not replace `/multipass/index.html` or shared assets.

Nginx receives two exact locations before the general `/multipass/` fallback:

```nginx
location = /multipass/loopers/3802 {
    root /var/www/helixa.xyz;
    try_files /multipass/loopers/3802/index.html =404;
    add_header Content-Security-Policy "frame-ancestors 'none'" always;
    add_header X-Frame-Options "DENY" always;
}
location = /multipass/loopers/3802/ {
    root /var/www/helixa.xyz;
    try_files /multipass/loopers/3802/index.html =404;
    add_header Content-Security-Policy "frame-ancestors 'none'" always;
    add_header X-Frame-Options "DENY" always;
}
```

This preserves the immutable slashless metadata URL without redirect and makes the trailing-slash form equivalent. Deployment backs up the whole Nginx file, inserts only these exact blocks, runs `nginx -t`, reloads only after a successful test, and restores/retests/reloads the backup on any route failure.

Only the #3802 manifest and exact Nginx route are accepted in this release. Adding another Looper requires a separately reviewed manifest, generated artifact, and explicit exact route.

## Security and privacy

The public profile:

- has no wallet connect button;
- does not access an injected provider;
- cannot sign, send, approve, transfer, mint, or fund;
- does not use local storage, session storage, IndexedDB, cookies, service workers, or URL-supplied RPC endpoints;
- does not load remote executable scripts;
- does not render remote HTML;
- does not expose private API keys or use credentialed requests;
- owns every CSP directive except framing in an HTML `<meta http-equiv="Content-Security-Policy">`; the two exact Nginx locations add a separate `Content-Security-Policy: frame-ancestors 'none'` response header because browsers ignore `frame-ancestors` in meta-delivered policy, plus `X-Frame-Options: DENY` as legacy defense;
- contains exactly one inline `<style>` and one inline `<script>` with no style/script attributes; the builder computes SHA-256 source hashes for both and injects only those hashes into `style-src` and `script-src`;
- uses this complete meta-delivered directive model: `default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; script-src <generated-script-hash>; script-src-attr 'none'; style-src <generated-style-hash>; style-src-attr 'none'; connect-src https://mainnet.base.org https://base.drpc.org https://base.blockscout.com; img-src 'self' https://3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq.arweave.net; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; upgrade-insecure-requests`, combined with the exact Nginx framing policy above;
- includes no analytics in this slice.

The activation owner page remains separate and no longer acts as the public profile.

## Error handling

- **RPC unavailable or incomplete snapshot:** discard the whole attempted batch, keep immutable identity facts, mark live proof unavailable, and preserve explorer links.
- **RPC origins disagree on chain or canonical block:** classify as proof mismatch and do not retry into a verified state during that refresh.
- **Runtime mismatch:** show `Proof mismatch`, never `Wallet active` or `Verified`.
- **Holder/controller/identity mismatch:** show a controller or identity warning and no verified badge.
- **Receipt unavailable:** deployed state may be shown as `Observed onchain`, but not `Activation verified`.
- **Artwork unavailable:** show a deterministic initials fallback and keep proof operational; descriptive manifest content remains available without a metadata fetch.
- **Blockscout unavailable:** show `Holdings temporarily unavailable`; do not infer zero balances.
- **Malformed remote data:** reject the affected data source and render safe status copy.
- **Refresh race:** only the newest refresh may update the page.

## SEO and social sharing

The generated HTML includes:

- index/follow robots policy;
- canonical route;
- title `Looper #3802 Multipass | Helixa`;
- neutral description `Public onchain wallet and identity profile for Looper #3802` that does not claim runtime verification before JavaScript completes;
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
- builder output is deterministic and current, and recomputes exact CSP hashes when inline style or script bytes change;
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

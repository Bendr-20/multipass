# Loopers Build Task Index

This is the active implementation board for Loopers. It supersedes older launch plans and is for execution, not reopening locked decisions.

Last updated: 2026-09-06 19:35 UTC.

## Ground Rules

- Collection name is `Loopers`.
- Multipass is the dashboard, activation, and access layer around Loopers.
- Public pre-reveal surfaces must not show real approved Looper art, trait layers, or layer composites.
- Final collection art comes from the existing approved HashLips/layer-composite pipeline; do not reinvent the art direction, regenerate substitutes, or use ad hoc image generation for final collection assets.
- The allowlist page is registration only: logo, short copy, wallet/address form, and registration status.
- The Aug 23 `Multipass Loopers Seven Day Launch Implementation Plan` is historical reference only.

## Current Status

Done on `main`:

- Contract foundation: ERC-721C-compatible `ERC721AC`, ERC-2981, supply, reserve, allowlist/public mint caps, pause, withdraw, reveal offset.
- ERC-8048/ERC-721T metadata support with reserved agent keys.
- ERC-6551 token-bound account resolution support.
- Allowlist registration, snapshot export, Merkle proof generation, and proof API.
- Web helper for `GET /api/loopers/allowlist/proof?address=...`.
- Deployment/verification scripts and Base Sepolia/mainnet example configs.
- Public allowlist page live with no on-page Looper preview.
- Reverted the Looper status/art card in `7356294` because it leaked approved art before reveal.
- Safe batch import exists for late manual allowlist adds: dry-run manifest first, explicit `--apply` second, then export a new frozen snapshot.
- Sibyl cold-start verifier exists and can require the real bridge with fallback disabled for hackathon proof.

Fresh verification:

- `pnpm --filter @helixa/loopers-contracts test` passed `11/11`.
- `node --test apps/web/test/looper-mint.test.mjs apps/web/test/app.test.mjs` passed `177/177`.
- `https://helixa.xyz/mint?mint=sepolia` returned `200`.
- Proof API returned `eligible:true` for Bendr wallet and `eligible:false` for a control wallet against Merkle root `0xc221be679e91b1cd6d81af3fb5a8975d328eb7e42b936b4a1bb3e21b48c7e230`.
- Active rehearsal contract `0xd195ADC09A654d6A87319f9c6a2b3169b5A5ce16` is live on Base Sepolia with ERC-8004 binding configured and the 721C-compatible runtime onchain.
- `packages/contracts/deployments/base-sepolia.json` now tracks the active rehearsal deployment for script-based status checks.
- `verify:deployment` now accepts an explicit `sale.public_start` override so it stays usable after owner-driven public flips.
- Read-only verification and live rehearsal both passed after syncing local Sepolia config with the current onchain sale state.
- Browser-side mint smoke passed through the injected-wallet harness: UI showed `Mint + Adapter8004 bind confirmed` for tx `0x1a234925012ffcc6745428337a14466dc89c1616f64f482b5cae850238ca3d8f`, with screenshot proof at `/home/ubuntu/.openclaw/workspace/tmpshots/loopers-browser-mint-smoke-20260902T173747533Z.png`.

## Locked Launch Decisions

- Chain: Base mainnet.
- Rehearsal: Base Sepolia first.
- Max supply: 7,777.
- Team reserve: 337, inside the 7,777 cap.
- Mint window: 7 days, 7 hours, 7 minutes, 7 seconds.
- Allowlist phase: first 24 hours.
- Allowlist limit: 3 mints per wallet.
- Public limit: 10 mints per wallet.
- Payment: ETH on Base.
- Target pricing: about $20 public, about $10 allowlist; exact wei values set near launch.
- Reveal: placeholder during allowlist, final reveal at public mint open.
- Metadata storage: Arweave.
- Art pipeline: existing approved HashLips/layer-composite outputs, then `packages/loopers-metadata/` compiler/validator output uploaded to Arweave.
- Royalties: ERC-2981 at 5%, capped at 5%.
- ERC-721C: optional validator support is wired, but default launch posture keeps it inactive unless deliberately configured.
- ERC-6551: launch scope, rehearse before mainnet.
- Sibyl: parallel activation demo, not a mint-contract dependency.
- Launch shape for 9/10: compressed allowlist first, then same-day public flip; do not attempt true simultaneous allowlist-discount and public lanes without a contract change.

## Immediate Next Move

Extend the hidden Base Sepolia mint lane into a full `mint -> ERC-8004 bind -> holder transfer` rehearsal. Do not expose mint controls on normal `/allowlist` until that adapter-aware path and mainnet launch settings are verified.

Needed from Quigley/team:

- Fresh Base owner/admin wallet address: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`.
- Treasury/royalty receiver address: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`.
- Eligible allowlisted wallet connected in browser for one end-to-end Sepolia mint.

## Workstreams

### 1. Public Allowlist Page

Status: live and intentionally minimal.

Source:

- `apps/web/src/app.js`
- `apps/web/src/looper-allowlist.js`
- `apps/web/scripts/write-allowlist-entry.mjs`
- `apps/web/public/loopers-logo.png`
- `apps/web/public/loopers-allowlist-preview-20260826c.jpg`

Rules:

- Keep it as registration only.
- Do not add Looper art, cards, sample tokens, status panels, trait previews, or generated Looper-like placeholders.
- Social preview can use generic/logo-only assets, not approved Looper art.

Next tasks:

- Keep monitoring registration health.
- Enable Turnstile only if bot pressure needs it.
- Avoid changing the page unless registration breaks or copy needs a small correction.

### 2. Contract And Base Sepolia Rehearsal

Status: fresh Base Sepolia rehearsal contract deployed, configured with the frozen live allowlist Merkle root, updated for mint-time ERC-8004 binding, running the current 721C-compatible runtime onchain, and now exercised through both a real owner-path paid public mint plus withdraw smoke and a browser-side mint UI smoke.

Source:

- `packages/contracts/src/Loopers.sol`
- `packages/contracts/test/loopers.test.mjs`
- `packages/contracts/scripts/`
- `packages/contracts/config/`
- `docs/loopers/deployment-verification.md`

Current rehearsal:

- Contract: `0xd195ADC09A654d6A87319f9c6a2b3169b5A5ce16`.
- Deployer/temporary Sepolia owner: `0x339559A2d1CD15059365FC7bD36b3047BbA480E0`.
- Merkle root: `0xc221be679e91b1cd6d81af3fb5a8975d328eb7e42b936b4a1bb3e21b48c7e230`.
- Deploy tx: `0xb90eba5d6eba939fe2005ca656ed92e006e2e3c8810c650de38d5773d4305c63`.
- ERC-6551 config tx: `0xa3708f188fc65b870c7e919c2194089e31f9a5122f148d6e81c1ed59b84746f7`.
- ERC-8004 config tx: `0x5b05378e88cb465dc6b4774a78c7200f655d18548510cbbb997a1ddff32050a7`.
- Initial sale config tx: `0xa578ea61a203d28c4390ee021f8f346047689e13ceff460a679c534f0e7dd023`.
- Rehearsal sale reset tx: `0x51ac6d03e31d73af9fc1ef274c2d7a61bfa05f7d9a0b4f72b6528a85f5842f61`.
- Rehearsal public-open tx: `0x9904cb2db7f31d2f41e62bf9a28e5a2183a88875a757e636e724fcad8c667d09`.
- Rehearsal paid public mint tx: `0xdc38a88d6ebaf8f771f5cb0c4fb6ed50a5267aa472c309d6c6104b90cec9a89f`.
- Rehearsal withdraw tx: `0xa31a30c6bf9038ca8414e368376f568b47e21da12e60d6ce234874aca181abc1`.
- Current sale state: `public`.
- Current allowlist start: `1788369985` (`2026-09-02T17:26:25Z`).
- Current public start: `1788369992` (`2026-09-02T17:26:32Z`).
- Current total minted: `1`.
- Current remaining public supply: `7439`.
- Rehearsal Looper token `1` bound to ERC-8004 identity token `9157`; `tokenURI(1)` still returns the placeholder URI and `tokenBoundAccount(1)` resolved to `0xDff706FaF3de460A510D0c72C7227a73195DE4FD`.

Next tasks:

- If you want the exact allowlist-phase browser UX on the live Privy path, that needs a fresh Sepolia rehearsal contract/window because this rehearsal is already in public phase. Otherwise the meaningful browser mint gap is closed by the injected-wallet smoke harness.
- Keep launch posture flexible: do not rely on publicly announced timestamps; use the owner-controlled public flip path if the allowlist phase looks healthy and a faster public open is justified.

### 3. Mint Page

Status: hidden Base Sepolia rehearsal mint lane exists behind `?mint=sepolia`; keep the public `/allowlist` registration page mint-free until mainnet launch settings are verified.

Source:

- `docs/loopers/mint-site-requirements.md`
- `apps/web/src/looper-allowlist.js`
- `apps/web/src/looper-mint.js`

Build after:

- Base Sepolia rehearsal contract address and ABI are verified.
- Rehearsal proof API path is confirmed.

Next tasks:

- Use the new post-mint status handling to confirm the ERC-8004 bind leg on the upgraded Sepolia deployment.
- Exercise the hidden Sepolia mint lane in a browser with an eligible funded test wallet.
- Keep regular `/allowlist` registration smoke checks in every build/deploy pass.
- Swap to mainnet config only after final treasury/admin address verification and launch settings review.
- Support EOA, injected wallets, Coinbase Wallet, Coinbase smart wallets, and Privy address-only smart wallet state.
- Add full browser coverage for wrong chain, rejected transaction, insufficient ETH, sold out, ended, and proof unavailable states.

Rules:

- Do not use frontend guesses where contract reads are available.
- The normal `/allowlist` route stays registration-only unless a deliberate mint query/config is present.
- Do not make minted count the emotional center during allowlist.
- Do not show final Looper art before reveal.

### 4. Metadata And Reveal

Status: compiler/validator package exists, the documented CLI path is fixed, derived class-affinity coverage now fills the approved trait set, and an 8-token approved-export smoke passes when HashLips is pinned to Node 14. The remaining work is the full 7,777 generation plus reveal rehearsal and Arweave QA.

Source:

- `docs/loopers/metadata-reveal-checklist.md`
- `packages/loopers-metadata/`

Next tasks:

- Create rehearsal placeholder metadata and upload/check it.
- Run HashLips final generation from the approved export.
- Run `pnpm loopers:metadata` against HashLips `build/json` and `build/images`.
- Rehearse placeholder-to-final reveal on Base Sepolia.
- Record reveal offset, final base URI, and sample `tokenURI` outputs.
- Upload final art/metadata to Arweave only after validation passes.

Rules:

- Use the existing approved HashLips/layer-composite art output as the source of truth for final collection images.
- Do not reinvent the collection art, regenerate replacement Loopers, or use image generation as a shortcut for final assets.
- Local HashLips smoke/runtime is currently pinned through `npx -p node@14.18.2 -p npm@6 -c 'node index.js'` because the bundled `canvas@2.8.0` lane is not Node 22 compatible.
- Final art and metadata stay private until reveal QA.
- No public branded OpenSea test collection.
- Arweave uploads are immutable, so validation happens first.

### 5. Cred/Activation Status Layer

Status: concept approved; not launch-blocking for the mint contract; implementation not built.

Source:

- `docs/loopers/mint-site-requirements.md`
- future Multipass activation/profile code

Next tasks:

- Define the canonical Looper identity key for Cred: token contract plus token ID, ERC-6551 account, activation profile ID, or a stable combination.
- Define the signed Cred response schema.
- Build an adapter that reads token-bound account value and verified Cred score.
- Render status only on post-mint holder/dashboard/profile surfaces, not the pre-reveal allowlist page.

Rules:

- Cred scores must come from the real Cred oracle/API with verification.
- Static metadata and frontend text must not invent scores.
- Any live status display belongs in Multipass post-mint UI or optional `animation_url`, not the public allowlist page.

### 6. Sibyl Activation Demo

Status: demo spec exists; implementation not built.

Source:

- `docs/loopers/sibyl-activation-demo.md`

Next tasks:

- Confirm Sibyl API/integration path.
- Confirm XMTP SDK/inbox integration path.
- Choose a non-leaking demo fixture.
- Build activate + name flow.
- Add XMTP-backed agent thread inside Multipass Console.
- Add Sibyl memory save, recall, and search.
- Capture a fresh-session recall demo.
- Keep public Looper history token-scoped and private operator memory wallet-scoped.

Rules:

- XMTP is the message rail; Sibyl is the memory layer; Multipass is the identity/control surface.
- Sibyl demo can run in parallel.
- Sibyl must not bloat the mint contract or block Base Sepolia mint rehearsal.

## Build Order

1. Build metadata validator and reveal rehearsal.
2. Prepare final allowlist and mainnet deployment checklist.
3. Swap to final mainnet owner/treasury/prices only after the above is locked.
4. Build Cred/activation status layer after the mint path is stable.
5. Package Sibyl demo in parallel around the no-fallback cold-start recall proof.

## Mainnet Gate

No mainnet deploy until:

- Base Sepolia rehearsal passes end-to-end.
- Fresh owner/admin address is verified twice.
- Treasury/royalty receiver is verified twice.
- Exact ETH prices are set.
- Placeholder metadata URI is live and checked.
- Final allowlist Merkle root is frozen and backed up.
- Quigley's late address batch has been dry-run, reviewed, applied, exported, backed up, and matched to the mainnet deployment config root.
- Final art/metadata validator passes before Arweave upload.
- Mint page handles all required wallet, phase, proof, price, and failure states.

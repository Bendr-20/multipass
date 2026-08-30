# Loopers Build Task Index

This is the active implementation board for Loopers. It supersedes older launch plans and is for execution, not reopening locked decisions.

Last updated: 2026-08-28 18:00 UTC.

## Ground Rules

- Collection name is `Loopers`.
- Multipass is the dashboard, activation, and access layer around Loopers.
- Public pre-reveal surfaces must not show real approved Looper art, trait layers, or layer composites.
- Final collection art comes from the existing approved HashLips/layer-composite pipeline; do not reinvent the art direction, regenerate substitutes, or use ad hoc image generation for final collection assets.
- The allowlist page is registration only: logo, short copy, wallet/address form, and registration status.
- The Aug 23 `Multipass Loopers Seven Day Launch Implementation Plan` is historical reference only.

## Current Status

Done on `main`:

- Contract foundation: ERC-721A, ERC-2981, supply, reserve, allowlist/public mint caps, pause, withdraw, reveal offset.
- ERC-8048/ERC-721T metadata support with reserved agent keys.
- ERC-6551 token-bound account resolution support.
- Allowlist registration, snapshot export, Merkle proof generation, and proof API.
- Web helper for `GET /api/loopers/allowlist/proof?address=...`.
- Deployment/verification scripts and Base Sepolia/mainnet example configs.
- Public allowlist page live with no on-page Looper preview.
- Reverted the Looper status/art card in `7356294` because it leaked approved art before reveal.

Fresh verification:

- `pnpm test` passed 612/612.
- `pnpm web:build` passed.
- Focused web allowlist/mint tests passed 371/371.
- Base Sepolia deployment verification passed for fresh rehearsal contract `0x0a1C0bEd3E25E94046cB5e546164412dB20d4f2b`.
- Live deployed JS has no `approved-only-agent-14`, `looper-status`, or `loopers/approved` references.

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
- ERC-721C: not in v1.
- ERC-6551: launch scope, rehearse before mainnet.
- Sibyl: parallel activation demo, not a mint-contract dependency.

## Immediate Next Move

Exercise the hidden Base Sepolia mint lane with an eligible allowlisted wallet. Do not expose mint controls on normal `/allowlist` until mainnet launch settings are verified.

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

Status: fresh Base Sepolia rehearsal contract deployed and configured with the frozen live allowlist Merkle root.

Source:

- `packages/contracts/src/Loopers.sol`
- `packages/contracts/test/loopers.test.mjs`
- `packages/contracts/scripts/`
- `packages/contracts/config/`
- `docs/loopers/deployment-verification.md`

Current rehearsal:

- Contract: `0x0a1C0bEd3E25E94046cB5e546164412dB20d4f2b`.
- Deployer/temporary Sepolia owner: `0x339559A2d1CD15059365FC7bD36b3047BbA480E0`.
- Merkle root: `0x7708767dfca7691ceba909e8c050828f998a9c0bd69642d96e61dcd5efb0163c`.
- Deploy tx: `0x9cb346a7777dae5ad4fa504419e4e057cdda8237a84fc16c317f907eb0685a24`.
- ERC-6551 config tx: `0x4a81755ffa71515ae27a00fc9631c411ebbcb42575765181ebc0ca184684d1e4`.
- Sale config tx: `0xe00377155284b29b9f0ac3f3defe0814ce1e48acb314985a0589abe943c352d0`.

Next tasks:

- Exercise the hidden Sepolia mint lane in a browser with an eligible funded wallet.
- Verify placeholder `tokenURI`, ERC-721T owner bytes, token-bound account resolution, and withdraw after a successful mint.

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

Status: compiler/validator package exists; final 7,777 generation and full class-affinity map are not complete.

Source:

- `docs/loopers/metadata-reveal-checklist.md`
- `packages/loopers-metadata/`

Next tasks:

- Create rehearsal placeholder metadata and upload/check it.
- Complete `agent-class-model.json` class affinities for every non-`None` approved trait.
- Run HashLips final generation from the approved export.
- Run `pnpm loopers:metadata` against HashLips `build/json` and `build/images`.
- Rehearse placeholder-to-final reveal on Base Sepolia.
- Record reveal offset, final base URI, and sample `tokenURI` outputs.
- Upload final art/metadata to Arweave only after validation passes.

Rules:

- Use the existing approved HashLips/layer-composite art output as the source of truth for final collection images.
- Do not reinvent the collection art, regenerate replacement Loopers, or use image generation as a shortcut for final assets.
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

1. Gather rehearsal inputs.
2. Run Base Sepolia contract deployment and verification.
3. Create rehearsal allowlist snapshot and proof serving.
4. Build mint page against the verified rehearsal contract.
5. Build metadata validator and reveal rehearsal.
6. Prepare final allowlist and mainnet deployment checklist.
7. Build Cred/activation status layer after the mint path is stable.
8. Build Sibyl demo in parallel once integration access is ready.

## Mainnet Gate

No mainnet deploy until:

- Base Sepolia rehearsal passes end-to-end.
- Fresh owner/admin address is verified twice.
- Treasury/royalty receiver is verified twice.
- Exact ETH prices are set.
- Placeholder metadata URI is live and checked.
- Final allowlist Merkle root is frozen and backed up.
- Final art/metadata validator passes before Arweave upload.
- Mint page handles all required wallet, phase, proof, price, and failure states.

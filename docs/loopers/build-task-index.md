# Loopers Build Task Index

This is the active implementation board for Loopers. It supersedes older launch plans and is for execution, not reopening locked decisions.

Last updated: 2026-08-27 20:03 UTC.

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

- `pnpm test` passed 586/586.
- `pnpm web:build` passed.
- Focused web allowlist/share tests passed 173/173.
- Local Ganache deploy/verify smoke passed with ERC-6551 config and ERC-8048 checks.
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
- Art pipeline: existing approved HashLips/layer-composite outputs, then validated metadata/images uploaded to Arweave.
- Royalties: ERC-2981 at 5%, capped at 5%.
- ERC-721C: not in v1.
- ERC-6551: launch scope, rehearse before mainnet.
- Sibyl: parallel activation demo, not a mint-contract dependency.

## Immediate Next Move

Set up the Base Sepolia rehearsal inputs and run the rehearsal deployment. Do not build a larger mint UI or activation/status panel until the rehearsal contract path is proven.

Needed from Quigley/team:

- Fresh Base owner/admin wallet address.
- Treasury/royalty receiver address, likely the same fresh Base wallet.
- Base Sepolia RPC URL.
- Funded deployer key available in the deployment environment.
- Placeholder metadata URI for rehearsal.
- Test allowlist addresses for the rehearsal Merkle snapshot.
- ERC-6551 registry and account implementation addresses for Base Sepolia/mainnet, or confirmation to use the canonical known deployment if available.

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

Status: contract/tooling built locally; Base Sepolia rehearsal not started.

Source:

- `packages/contracts/src/Loopers.sol`
- `packages/contracts/test/loopers.test.mjs`
- `packages/contracts/scripts/`
- `packages/contracts/config/`
- `docs/loopers/deployment-verification.md`

Next tasks:

- Copy `packages/contracts/config/base-sepolia.example.json` to `base-sepolia.local.json`.
- Fill owner, treasury, prices, placeholder URI, sale timing, Merkle root, ERC-6551 registry, implementation, and salt.
- Generate a tiny rehearsal Merkle snapshot with `apps/api/scripts/export-loopers-allowlist.js`.
- Deploy to Base Sepolia with `packages/contracts/scripts/deploy-loopers.js`.
- Run `packages/contracts/scripts/verify-loopers-deployment.js`.
- Record contract address, deployment tx, config, and verification output.

Blocked by:

- Rehearsal inputs listed in `Immediate Next Move`.

### 3. Mint Page

Status: requirements exist; full mint transaction page not built.

Source:

- `docs/loopers/mint-site-requirements.md`
- `apps/web/src/looper-allowlist.js`

Build after:

- Base Sepolia rehearsal contract address and ABI are verified.
- Rehearsal proof API path is confirmed.

Next tasks:

- Build a contract-backed mint page for allowlist and public phases.
- Show phase, price, max per wallet, countdown, exact ETH needed, eligibility, remaining wallet mint count, and chain status.
- Use `getLooperAllowlistProof()` for allowlist mint proofs.
- Support EOA, injected wallets, Coinbase Wallet, Coinbase smart wallets, and Privy address-only smart wallet state.
- Test sale not started, allowlist eligible, allowlist ineligible, public, sold out, ended, wrong chain, rejected transaction, insufficient ETH, wallet cap reached, and proof unavailable.

Rules:

- Do not use frontend guesses where contract reads are available.
- Do not make minted count the emotional center during allowlist.
- Do not show final Looper art before reveal.

### 4. Metadata And Reveal

Status: checklist exists; validator/tooling not built.

Source:

- `docs/loopers/metadata-reveal-checklist.md`

Next tasks:

- Create rehearsal placeholder metadata and upload/check it.
- Build a local metadata validator for final token JSON, images, Agent Codex files, attributes, naming, Looper agent fields, duplicates, missing files, private paths, and placeholder leakage.
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
- Choose a non-leaking demo fixture.
- Build activate + name flow.
- Add Sibyl memory save, recall, and search.
- Capture a fresh-session recall demo.
- Keep public Looper history token-scoped and private operator memory wallet-scoped.

Rules:

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

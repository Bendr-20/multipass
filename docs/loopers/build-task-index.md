# Loopers Build Task Index

This is the implementation queue. The decisions are locked; this file is for build execution, not reopening launch planning.

Last updated: 2026-08-27 18:28 UTC.

## Current Snapshot

Shipped on `main`:

- `141fb29` - Loopers allowlist and contract foundation.
- `7de28c0` - Loopers deployment tooling.
- `b15d09b` - Loopers allowlist proof API.
- `84bc479` - Loopers proof lookup helper.

Fresh verification:

- `pnpm test` passed 586/586 after the ERC-8048/721T and ERC-6551 contract changes.
- `pnpm --filter @helixa/loopers-contracts compile` passed.
- Local Ganache deploy/verify smoke passed with ERC-6551 config and ERC-8048 checks.
- Focused API proof tests passed 24/24.
- Focused web Looper allowlist/proof tests passed 15/15.
- CLI snapshot export smoke passed.

## Prior Plan Status

The Aug 23 `Multipass Loopers Seven Day Launch Implementation Plan` is historical reference, not the active source of truth.

What carried forward:

- One collection with one launch surface.
- Allowlist capture before mint.
- Base mainnet with Base Sepolia rehearsal.
- Metadata, marketplace, mint UI, and activation handled around the core NFT.

What changed after later decisions:

- Collection name is `Loopers`, not `Multipass Loopers`.
- Max supply is 7,777 with 337 team reserve, not a fixed 777 collection.
- Mint is ETH-only in v1; x402 agent minting is deferred.
- ERC-6551/token-bound accounts were explicitly requested for launch in the Aug 23 plan and need a scoped implementation/rehearsal decision.
- No ERC-721C in v1.
- Reveal is placeholder during allowlist, then owner-controlled reveal at public mint.
- Sibyl activation demo is a parallel track, not a dependency of the mint contract.
- Activated Looper cards should show live agent status from real systems: activation state, ERC-6551 wallet value, and Cred oracle/API score.
- Holders/viewers must be able to toggle the live status HUD off when they want to see the clean Looper art.

Immediate launch path:

1. Stage Base Sepolia rehearsal inputs.
2. Run Base Sepolia deploy and verification.
3. Build mint page against the verified rehearsal contract.
4. Add oracle-backed agent status display to the Looper card/dashboard.
5. Build metadata validator and reveal rehearsal.
6. Build Sibyl activation demo without blocking the mint contract.

## Needed From Quigley Or Team

- Fresh Base owner/admin wallet address for rehearsal and later mainnet.
- Treasury/royalty receiver address, likely the same fresh Base wallet.
- Base Sepolia RPC and funded deployer key available in the deployment environment.
- Placeholder metadata URI for rehearsal.
- Test allowlist addresses for the rehearsal Merkle snapshot.
- Cred oracle/API endpoint, score payload shape, and verification/signature model for Looper agents.
- Sibyl API credentials or confirmed integration path.

## Track A: Loopers Launch Core

### 1. Contract

Status: draft exists; deployment tooling exists; ERC-8048/721T metadata and ERC-6551 launch resolution are implemented; Base Sepolia rehearsal not started.

Source:

- `packages/contracts/src/Loopers.sol`
- `packages/contracts/test/loopers.test.mjs`
- `packages/contracts/scripts/`
- `packages/contracts/config/`
- `docs/loopers/deployment-verification.md`

Next tasks:

- Copy `base-sepolia.example.json` to `base-sepolia.local.json` with rehearsal values.
- Generate a small rehearsal Merkle snapshot with `export-loopers-allowlist.js`.
- Deploy to Base Sepolia with `deploy-loopers.js`.
- Verify deployed reads with `verify-loopers-deployment.js` and Basescan.
- Run the full contract test suite before every deployment.

Blocked by:

- Fresh Base owner/admin address.
- Fresh treasury/royalty receiver address.
- Base Sepolia RPC and funded deployer key in env.
- Rehearsal placeholder URI.
- Rehearsal Merkle root.
- ERC-6551 registry and account implementation addresses for Base Sepolia/mainnet.

### 2. Mint Site

Status: requirements exist; proof client helper exists; page implementation not built.

Source:

- `docs/loopers/mint-site-requirements.md`
- current allowlist/proof helper: `apps/web/src/looper-allowlist.js`

Next tasks:

- Build one mint page for allowlist and public phases.
- Read sale state, prices, counts, wallet mint counts, reveal state, and remaining supply from contract.
- Use `getLooperAllowlistProof()` from wallet address lookup.
- Support EOA, injected wallets, Coinbase Wallet, Coinbase smart wallets, and Privy address-only smart wallet state.
- Render the clean static Looper image with a live app overlay for activated agent status: activation state, agent/profile name, ERC-6551 token-bound account, wallet value, Cred score/tier, and last scored timestamp.
- Add a clear `show status` / `hide status` control on Looper cards so holders can switch between the live agent HUD and clean art view.
- Remember the status visibility preference locally in the app without changing token metadata or ownership state.
- Keep marketplace `image` canonical and static; use app overlay and/or `animation_url` for live status so changing Cred/wallet data does not mutate final art.
- Read Cred from the Cred oracle/API only. Do not display user-provided or frontend-invented scores.
- Verify Cred response authenticity with the agreed oracle signature/proof before treating a score as trusted.
- Add tests for not started, allowlist eligible, allowlist ineligible, public, sold out, ended, wrong chain, rejected transaction, insufficient ETH, and wallet cap reached.
- Add tests for status overlay states: unactivated, activated with pending Cred, activated with verified Cred, stale Cred timestamp, missing wallet value, invalid Cred proof, HUD hidden, and HUD restored.

Blocked by:

- Contract ABI/address from Base Sepolia rehearsal.
- Base Sepolia rehearsal proof snapshot path.
- Final mint page deployment target.
- Cred oracle/API endpoint and signed response contract.
- Wallet value source for ERC-6551 token-bound accounts.

### 3. Allowlist And Merkle

Status: raw signup exists; Merkle snapshot/proof generation and proof API exist; final eligibility pipeline not frozen.

Source:

- `apps/api/src/allowlist-store.js`
- `apps/api/src/allowlist-snapshot.js`
- `apps/api/scripts/export-loopers-allowlist.js`
- `apps/api/scripts/backup-loopers-allowlist.js`

Next tasks:

- Create a tiny rehearsal allowlist snapshot for Base Sepolia.
- Export raw signup snapshot.
- Clean duplicates and obvious bad entries only.
- Freeze final allowlist file separately from public signup data.
- Generate Merkle tree and per-wallet proofs.
- Back up final allowlist, Merkle root, and proof bundle.
- Point `MULTIPASS_LOOPERS_ALLOWLIST_SNAPSHOT_PATH` at the frozen proof bundle.

Blocked by:

- Rehearsal wallet list.
- Final cleanup pass.
- Decision that allowlist has frozen.

### 4. Metadata And Reveal

Status: checklist exists, tooling not built.

Source:

- `docs/loopers/metadata-reveal-checklist.md`

Next tasks:

- Create placeholder metadata bundle and upload to Arweave.
- Build local validator for final token JSON, images, Codex files, attributes, Looper agent fields, and naming rules.
- Add `animation_url`/agent-dashboard metadata rules if live Looper cards are linked from token metadata.
- Add ERC-8048/721T Cred discovery metadata, likely `endpoint[cred]`, so agents can find the canonical Cred source.
- Validate no final JSON exposes private file paths or placeholder values.
- Upload final images, final token JSON, and Agent Codex JSON to Arweave only after validation passes.
- Rehearse placeholder-to-final reveal on Base Sepolia.
- Record reveal offset, final base URI, and post-reveal `tokenURI` samples.

Blocked by:

- Rehearsal placeholder asset/URI.
- Final art and metadata export.
- Final Agent Codex JSON shape.
- Final agent dashboard/`animation_url` route decision.
- Canonical Cred endpoint key and payload shape.

## Track B: Cred Oracle And Agent Status Layer

Status: concept approved by Quigley; implementation not built.

Launch rule:

- The permanent marketplace `image` remains the clean Looper art.
- Live status belongs in Multipass app overlays and optional `animation_url` agent cards.
- The live HUD is optional in the UI; holders/viewers can hide it to inspect the art without status labels.
- Cred scores must come from the real Cred oracle/API, with verification, not from static metadata or frontend text.

Next tasks:

- Define the Cred oracle/API lookup key for Loopers: ERC-6551 account address, AgentDNA/activation ID, token contract plus token ID, or a stable combination.
- Define the signed Cred response schema: score, tier, components, timestamp, freshness window, subject, issuer, signature/proof, and source URL.
- Build a small API/client adapter that reads token-bound account value and Cred score for a Looper.
- Render a compact HUD on the Looper card for `Active Agent`, Cred score/tier, wallet value, token-bound account, and last scored timestamp.
- Add a persistent local display toggle for clean art vs live status HUD.
- Render untrusted/stale states clearly: `Cred pending`, `Score stale`, or `Proof invalid`.
- Add `endpoint[cred]` to ERC-8048/721T metadata once the canonical endpoint is known.
- Consider `animation_url` for the richer live agent card with score breakdown/history, wallet holdings, attestations, Sibyl memory/activity, and agent endpoints.

Blocked by:

- Canonical Cred oracle/API endpoint for Loopers.
- Signed response/proof format.
- Final subject identity mapping between Looper token, ERC-6551 account, activation profile, and Cred score.
- Wallet value provider for Base token-bound accounts.

## Track C: Sibyl Activation Demo

Status: demo spec exists, implementation not built.

Source:

- `docs/loopers/sibyl-activation-demo.md`

Next tasks:

- Choose demo fixture, likely `Looper #1234` unless Quigley wants a named sample.
- Build a demo Looper profile inside Multipass.
- Add Activate flow with free first agent/profile name.
- Connect activated profile status to the live Looper card so activation state and Cred status can be shown together.
- Add Sibyl memory save, recall, and search path.
- Add fresh-session recall demo script.
- Keep public Looper history token-scoped and private memory wallet-scoped.
- Write README and demo capture checklist for hackathon submission.

Blocked by:

- Sibyl API credentials or integration path.
- Choice of demo Looper/profile fixture.

## Build Order

1. Finish contract deployment tooling and Base Sepolia deploy config.
2. Freeze a small test Merkle allowlist and wire proof serving.
3. Build mint page against Base Sepolia contract.
4. Build Cred oracle/API-backed agent status overlay for activated Loopers.
5. Build metadata validator and placeholder/final reveal rehearsal.
6. Build Sibyl demo in parallel once integration access is ready.
7. Only after rehearsal passes, set mainnet prices, treasury, final Merkle root, and deployment checklist.

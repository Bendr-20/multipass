# Loopers Build Task Index

This is the implementation queue. The decisions are locked; this file is for build execution, not reopening launch planning.

## Track A: Loopers Launch Core

### 1. Contract

Status: draft exists; deployment tooling exists.

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

- Fresh Base treasury/admin address.
- Exact launch-time ETH prices.
- Final Merkle root.
- Placeholder Arweave URI.

### 2. Mint Site

Status: requirements exist, page implementation not built.

Source:

- `docs/loopers/mint-site-requirements.md`
- current allowlist helper: `apps/web/src/looper-allowlist.js`

Next tasks:

- Build one mint page for allowlist and public phases.
- Read sale state, prices, counts, wallet mint counts, reveal state, and remaining supply from contract.
- Connect `GET /api/loopers/allowlist/proof?address=...` to wallet address lookup.
- Support EOA, injected wallets, Coinbase Wallet, Coinbase smart wallets, and Privy address-only smart wallet state.
- Add tests for not started, allowlist eligible, allowlist ineligible, public, sold out, ended, wrong chain, rejected transaction, insufficient ETH, and wallet cap reached.

Blocked by:

- Contract ABI/address from Base Sepolia rehearsal.
- Base Sepolia rehearsal proof snapshot path.

### 3. Allowlist And Merkle

Status: raw signup exists; Merkle snapshot/proof generation and proof API exist; final eligibility pipeline not frozen.

Source:

- `apps/api/src/allowlist-store.js`
- `apps/api/src/allowlist-snapshot.js`
- `apps/api/scripts/export-loopers-allowlist.js`
- `apps/api/scripts/backup-loopers-allowlist.js`

Next tasks:

- Export raw signup snapshot.
- Clean duplicates and obvious bad entries only.
- Freeze final allowlist file separately from public signup data.
- Generate Merkle tree and per-wallet proofs.
- Back up final allowlist, Merkle root, and proof bundle.
- Point `MULTIPASS_LOOPERS_ALLOWLIST_SNAPSHOT_PATH` at the frozen proof bundle.

Blocked by:

- Final cleanup pass.
- Decision that allowlist has frozen.

### 4. Metadata And Reveal

Status: checklist exists, tooling not built.

Source:

- `docs/loopers/metadata-reveal-checklist.md`

Next tasks:

- Create placeholder metadata bundle and upload to Arweave.
- Build local validator for final token JSON, images, Codex files, attributes, Looper agent fields, and naming rules.
- Validate no final JSON exposes private file paths or placeholder values.
- Upload final images, final token JSON, and Agent Codex JSON to Arweave only after validation passes.
- Rehearse placeholder-to-final reveal on Base Sepolia.
- Record reveal offset, final base URI, and post-reveal `tokenURI` samples.

Blocked by:

- Final art and metadata export.
- Final Agent Codex JSON shape.

## Track B: Sibyl Activation Demo

Status: demo spec exists, implementation not built.

Source:

- `docs/loopers/sibyl-activation-demo.md`

Next tasks:

- Build a demo Looper profile inside Multipass.
- Add Activate flow with free first agent/profile name.
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
4. Build metadata validator and placeholder/final reveal rehearsal.
5. Build Sibyl demo in parallel once integration access is ready.
6. Only after rehearsal passes, set mainnet prices, treasury, final Merkle root, and deployment checklist.

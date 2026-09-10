# Loopers Launch Checklist

Last verified: 2026-09-09 04:30 UTC.

This is the execution checklist for shipping Loopers. It tracks what is freshly verified now, what is still blocked, and the exact commands to re-run before each launch move.

## Freshly Verified Now

- [x] Contract suite passes on the current working tree: `pnpm --filter @helixa/loopers-contracts test` -> `11/11`.
- [x] Web mint and app suites pass on the current working tree: `node --test apps/web/test/looper-mint.test.mjs apps/web/test/app.test.mjs` -> `177/177`.
- [x] Hidden rehearsal mint route is live: `https://helixa.xyz/mint?mint=sepolia` returns `200`.
- [x] Proof API returns `eligible:true` for Bendr wallet `0xD31fCdb0432D3C9BF9d98643F69C7edd690E48E8`.
- [x] Proof API returns `eligible:false` for control wallet `0x0000000000000000000000000000000000000001`.
- [x] Active rehearsal deployment artifact now exists at `packages/contracts/deployments/base-sepolia.json`.
- [x] `verify:deployment` passes against the tracked artifact after syncing local config with the live sale state.
- [x] Funded Sepolia owner-path rehearsal completed: sale reset, public flip, paid mint, ERC-8004 bind, ERC-6551/TBA readback, and withdraw.
- [x] Browser-side mint UI proof completed through the injected-wallet smoke harness at `apps/web/looper-mint-browser-smoke.html` and `pnpm --dir apps/web run smoke:looper-mint-browser`.
- [x] Loopers metadata CLI accepts the documented `pnpm loopers:metadata -- ...` invocation again; metadata package tests pass: `6/6`.
- [x] Approved HashLips smoke generation works again when pinned to Node `14.18.2` via `npx -p node@14.18.2 -p npm@6 -c 'node index.js'`.
- [x] Final-mode metadata smoke compile passes against fresh approved-export HashLips output and writes bundle output to `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-smoke-20260902`.
- [x] Full approved-export HashLips render produced `7777` PNGs plus HashLips JSON under `/home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/`.
- [x] Deterministic collision repair rerendered `44` held-object/source-artifact conflicts by setting source layer `Patch Artifact` to `None`.
- [x] Full metadata compile produced `7777` token metadata JSON files and `7777` Agent Codex JSON files under `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/`.
- [x] Full generated JSON collision scan returned `badCount: 0`.
- [x] Full bundle preflight passed with `pnpm loopers:verify-bundle` and wrote `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/preflight-report.json`.
- [x] Private QA sample report/review page generated with `pnpm loopers:select-qa`.
- [x] Art QA accepted by Quigley on 2026-09-09: keep the current generated collection as-is, do not regenerate to recover lost traits, and do not remove the intentionally approved brand/meme/world traits.
- [x] Current live allowlist export reproduced 24,346 entries and Merkle root `0xc221be679e91b1cd6d81af3fb5a8975d328eb7e42b936b4a1bb3e21b48c7e230`.
- [x] Live proof API returns a Bendr eligible proof against that same root.
- [x] Public-safe placeholder metadata is ready at `artifacts/loopers-placeholder-mainnet/metadata.json`; live placeholder image returns `200` as PNG.
- [x] Allowlist batch import tooling dry-runs by default, rejects invalid/duplicate batch rows, reports already-existing addresses, and previews the post-merge Merkle root before `--apply`.
- [x] Sibyl cold-start proof command can require the real bridge with fallback disabled; latest local proof saved through `sibyl_memory` and recalled the saved Merkle launch preference with a fresh reader.
- [x] Lightweight rare-Artifact bounty settlement flow is documented and covered by `packages/loopers-metadata/test/loopers-bounties.test.mjs`.
- [x] Telegram-first Loopers NFT activity watcher is documented and covered by `apps/api/test/loopers-activity-bot.test.mjs`.

## 2026-09-10 Launch Shape

Use a compressed allowlist, not true simultaneous discount/public lanes.

- Open allowlist on 9/10 with the frozen Merkle root.
- Keep allowlist live for roughly 1-2 hours while monitoring API, proof, mint, and support pressure.
- Flip public the same day through the owner public-open path once allowlist minting is healthy.
- Reveal at public open.
- Do not rewrite the contract to keep allowlist discount minting live after public opens unless the team deliberately accepts a new contract/rehearsal cycle.

## Active Base Sepolia Rehearsal Snapshot

- Contract: `0xd195ADC09A654d6A87319f9c6a2b3169b5A5ce16`
- Owner: `0x339559A2d1CD15059365FC7bD36b3047BbA480E0`
- Treasury: `0x339559A2d1CD15059365FC7bD36b3047BbA480E0`
- Transfer validator: unset (`0x0000000000000000000000000000000000000000`)
- ERC-8048 support: `true`
- Base chain identifier: `0x000100000202210500`
- ERC-6551 registry: `0x000000006551c19487814612e58FE06813775758`
- ERC-6551 implementation: `0x02101dfB77FDE026414827Fdc604ddAF224F0921`
- ERC-8004 registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ERC-8004 agent base URI: `https://api.helixa.xyz/api/loopers/agents/`
- Merkle root: `0xc221be679e91b1cd6d81af3fb5a8975d328eb7e42b936b4a1bb3e21b48c7e230`
- Sale state at last check: `public`
- Allowlist start at last check: `1788369985` (`2026-09-02T17:26:25.000Z`)
- Public start at last check: `1788369992` (`2026-09-02T17:26:32.000Z`)
- Sale end at last check: `1789000412` (`2026-09-10T00:33:32.000Z`)
- Allowlist price: `1000000000000` wei
- Public price: `2000000000000` wei
- Total minted at last check: `1`
- Remaining public supply at last check: `7439`

## Fresh Rehearsal Receipts

- Sale reset tx: `0x51ac6d03e31d73af9fc1ef274c2d7a61bfa05f7d9a0b4f72b6528a85f5842f61`
- Public-open tx: `0x9904cb2db7f31d2f41e62bf9a28e5a2183a88875a757e636e724fcad8c667d09`
- Paid public mint tx: `0xdc38a88d6ebaf8f771f5cb0c4fb6ed50a5267aa472c309d6c6104b90cec9a89f`
- Withdraw tx: `0xa31a30c6bf9038ca8414e368376f568b47e21da12e60d6ce234874aca181abc1`
- Minted Looper token: `1`
- Bound ERC-8004 identity token: `9157`
- Holder: `0x339559A2d1CD15059365FC7bD36b3047BbA480E0`
- Placeholder `tokenURI(1)`: `ar://loopers-rehearsal-placeholder-2026-08-28/metadata.json`
- Token-bound account: `0xDff706FaF3de460A510D0c72C7227a73195DE4FD`
- ERC-8004 agent URI: `https://api.helixa.xyz/api/loopers/agents/1`
- Contract balance before withdraw: `2000000000000` wei
- Contract balance after withdraw: `0`

## Browser Mint Proof

- Harness entry: `apps/web/looper-mint-browser-smoke.html`
- Harness command: `pnpm --dir apps/web run smoke:looper-mint-browser`
- Browser-driven public mint tx: `0x1a234925012ffcc6745428337a14466dc89c1616f64f482b5cae850238ca3d8f`
- UI receipt text: `Mint + Adapter8004 bind confirmed: 0x1a23...3d8f. Looper #2 -> ERC-8004 #9158`
- Screenshot: `/home/ubuntu/.openclaw/workspace/tmpshots/loopers-browser-mint-smoke-20260902T173747533Z.png`
- Important nuance: this proves the browser UI and receipt rendering with the real app code plus an injected wallet harness. It is not the same as walking the live Privy modal on `helixa.xyz`.

## Immediate Fixes Before Claiming Rehearsal Is Fully Ready

- [x] Sync `packages/contracts/config/base-sepolia.local.json` to the latest rehearsal state after the paid public-mint smoke, including the shortened `sale.allowlist_start` and explicit `sale.public_start`.
- [x] Re-run `pnpm --filter @helixa/loopers-contracts run verify:deployment -- --config packages/contracts/config/base-sepolia.local.json --deployment packages/contracts/deployments/base-sepolia.json` after the sale-window override.
- [x] Keep using explicit `sale.public_start` in local configs whenever the owner shortens the default 24-hour public flip.

## Rehearsal Gates Still Open

- [x] Run one funded browser mint through the Sepolia mint UI.
- [x] Confirm the browser UI surfaces the `ERC8004Bound` receipt data after mint.
- [x] Verify `tokenURI(tokenId)` returns the placeholder URI before reveal.
- [x] Verify ERC-721T owner bytes and ERC-6551 token-bound account resolution after the rehearsal mint.
- [x] Verify `erc8004BoundByLooper(tokenId)`, `erc8004IdentityTokenIdByLooper(tokenId)`, and `erc8004AgentURI(tokenId)` onchain after the rehearsal mint.
- [x] Verify withdraw from the rehearsal contract after a paid mint.
- [ ] If launch posture changes, use the owner-side sale helper to either shorten `publicStart` or call `open-public` once allowlist is active.
- [ ] If you specifically want an allowlist-phase browser proof with an eligible wallet on the real production Privy path, that now requires a fresh Sepolia rehearsal contract/window because this rehearsal is already in public phase.

## Mainnet Gates Still Open

- [ ] Verify the final owner/admin wallet twice.
- [ ] Verify the final treasury/royalty receiver twice.
- [ ] Set exact mainnet allowlist/public prices from launch-time ETH/USD.
- [ ] Upload and verify the placeholder metadata URI.
- [ ] Freeze and back up the final mainnet Merkle root.
- [ ] Dry-run Quigley's extra address batch, review the import manifest, then apply and export a fresh final snapshot.
- [x] Inspect/sign off the private QA sample review page.
- [ ] Upload final images to Arweave, rerun metadata with the real image base URI, then upload final metadata/Codex only after the new preflight is clean.
- [ ] Swap the mint page from rehearsal config to mainnet config only after the items above are locked.
- [ ] Configure and smoke test the Telegram activity bot after the mainnet contract address and destination chat are final.
- [ ] Run full mainnet smoke with no reveal, no public claim copy drift, and no secret leakage.

## Commands

Re-run contract tests:

```bash
pnpm --filter @helixa/loopers-contracts test
```

Re-run web mint checks:

```bash
node --test apps/web/test/looper-mint.test.mjs apps/web/test/app.test.mjs
```

Run the browser-side smoke harness:

```bash
pnpm --dir apps/web run smoke:looper-mint-browser
```

Run the approved HashLips smoke under the pinned runtime:

```bash
npx -p node@14.18.2 -p npm@6 -c 'node index.js'
```

Run the Loopers metadata compiler against HashLips output:

```bash
pnpm loopers:metadata -- \
  --hashlips-json-dir /path/to/hashlips/build/json \
  --hashlips-images-dir /path/to/hashlips/build/images \
  --export-manifest-path /path/to/hashlips-engine-export-v01-manifest.json \
  --personality-matrix-path /path/to/trait-personality-matrix.json \
  --class-model-path /path/to/agent-class-model.json \
  --output-dir /private/final-loopers-metadata \
  --image-base-uri ar://FINAL_IMAGE_BUNDLE \
  --codex-base-uri ar://FINAL_METADATA_BUNDLE/codex \
  --external-url-base https://helixa.xyz/multipass/loopers \
  --expected-count 7777
```

Check deployment status against the tracked rehearsal artifact:

```bash
pnpm --filter @helixa/loopers-contracts run sale -- \
  --config packages/contracts/config/base-sepolia.local.json \
  --deployment packages/contracts/deployments/base-sepolia.json \
  status
```

Re-run deployment verification after any sale-window override:

```bash
pnpm --filter @helixa/loopers-contracts run verify:deployment -- \
  --config packages/contracts/config/base-sepolia.local.json \
  --deployment packages/contracts/deployments/base-sepolia.json
```

Open public mint early once allowlist is active and the owner approves:

```bash
LOOPERS_DEPLOYER_PRIVATE_KEY="$DEPLOYER_KEY" \
pnpm --filter @helixa/loopers-contracts run sale -- \
  --config packages/contracts/config/base-sepolia.local.json \
  --deployment packages/contracts/deployments/base-sepolia.json \
  open-public
```

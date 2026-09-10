# Loopers Launch Day Runbook

This is the shortest safe path for launch day. It assumes the current local prep has stayed green and does not reopen locked decisions.

## Current Green State

- Full art render exists: `/home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images/` with `7777` PNGs.
- Full HashLips JSON exists: `/home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/json/`.
- Full token metadata exists: `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/metadata/` with `7777` JSON files.
- Full Agent Codex exists: `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/codex/` with `7777` JSON files.
- Bundle preflight report: `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/preflight-report.json`.
- Private QA sample report: `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/qa-samples.json`.
- Private QA sample review page: `/home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/qa-samples.html`.
- Locked allowlist store: `/var/lib/helixa/multipass-loopers-allowlist.json` with `27002` entries.
- Locked allowlist snapshot: `/var/lib/helixa/multipass-loopers-allowlist-snapshot-20260910T2016Z.json`.
- Locked allowlist root: `0x24341b4d6325c0aae2dcada50a7f2d0b4b478ce9f78b285f8a55517824719a80`.
- Public-safe placeholder metadata file: `artifacts/loopers-placeholder-mainnet/metadata.json`.
- Public-safe placeholder image is live at `https://helixa.xyz/multipass/loopers-prereveal-placeholder.png`.

## Do Not Skip

- Do not deploy mainnet until Quigley explicitly says launch is approved.
- Do not publish final Looper art or final token metadata publicly before reveal approval.
- Do not use the staging `ar://loopers-full-...` URI labels as if they are real Arweave IDs.
- Do not change the final Merkle root after deploying sale config unless the team deliberately accepts a new config transaction before sale starts.
- Do not expose mint controls on `/allowlist`; mint belongs on `/mint`.
- Do not remove or rename the meme/brand-coded Looper trait values during launch prep. Quigley approved keeping them as intentional collection content; the public metadata category for the old source `Patch Artifact` layer is `Artifact`, and QA should focus on render defects, metadata correctness, and upload/reveal safety unless he changes that decision.
- Do not withdraw mainnet mint proceeds until reveal, marketplace/tokenURI smoke checks, support checks, and the agreed stability window pass. Keeping ETH in the contract preserves the simplest operational refund path if launch fails badly.

## Refund Contingency

The current contract has owner `withdraw()` but no buyer-initiated refund function. Refunds are therefore an operational fallback, not an automatic contract feature.

If launch goes badly:

1. Pause minting.
2. Do not withdraw proceeds.
3. Export mint events with buyer, token IDs, quantity, ETH paid, block/log order, and tx hash.
4. Reconcile the export against contract balance and marketplace-visible token state.
5. Manually refund buyers from the retained contract proceeds after the team approves the refund list.
6. Publish or retain an auditable refund report, depending on the support/comms plan.

Do not add burn/refund contract logic this late unless a real launch blocker forces a new contract cycle.

## Re-Run Local Preflight

```sh
pnpm loopers:verify-bundle -- \
  --metadata-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/metadata \
  --codex-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/codex \
  --images-dir /home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images \
  --expected-count 7777 \
  --report-path /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/preflight-report.json
```

Expected result:

- `Loopers bundle preflight passed for 7777 tokens`
- `Images: 8017945717 bytes across 1 dimension set(s)`
- image dimensions: `1024x1024` for all `7777`

## Refresh Private QA Samples

```sh
pnpm loopers:select-qa -- \
  --metadata-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/metadata \
  --images-dir /home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images \
  --output-path /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/qa-samples.json \
  --html-path /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/qa-samples.html \
  --sample-size 48
```

Inspect the private HTML review page locally only. Do not post sample art in public channels before reveal.

## Freeze Allowlist

Current locked state:

- Pre-lock backup: `/var/lib/helixa/backups/loopers-allowlist/20260910T201554Z-multipass-loopers-allowlist.json`.
- Applied batch manifest: `/home/ubuntu/.openclaw/workspace/tmp/loopers-allowlist-batches/2026-09-10-quigley-plus-based-cartel/apply-manifest.json`.
- Post-apply dry-run: `27002` old count, `2675` batch count, `0` added, `2675` skipped existing.
- Proof API snapshot path: `/var/lib/helixa/multipass-loopers-allowlist-snapshot-20260910T2016Z.json`.

If no late-address batch is needed, use the current final snapshot:

```sh
/var/lib/helixa/multipass-loopers-allowlist-snapshot-20260910T2016Z.json
```

If another late-address batch is needed, export the current final snapshot after applying:

```sh
pnpm --filter @helixa/multipass-api loopers:allowlist:export -- \
  --input /var/lib/helixa/multipass-loopers-allowlist.json \
  --output /secure/path/loopers-final-allowlist-snapshot.json
```

If Quigley provides a late-address batch, dry-run first, review the manifest, then apply and export a fresh snapshot:

```sh
pnpm --filter @helixa/multipass-api loopers:allowlist:import-batch -- \
  --store /var/lib/helixa/multipass-loopers-allowlist.json \
  --input /secure/path/late-addresses.txt \
  --manifest /secure/path/late-addresses-import-manifest.json
```

Only after review:

```sh
pnpm --filter @helixa/multipass-api loopers:allowlist:import-batch -- \
  --store /var/lib/helixa/multipass-loopers-allowlist.json \
  --input /secure/path/late-addresses.txt \
  --manifest /secure/path/late-addresses-import-manifest.json \
  --apply
```

## Upload Order

1. Upload `artifacts/loopers-placeholder-mainnet/metadata.json` and verify the returned placeholder metadata URI resolves to JSON with the live HTTPS placeholder image.
2. Upload final images from `/home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images/` only after private QA passes.
3. Re-run `pnpm loopers:verify-arweave-handoff` with the real placeholder URI, real image base URI, and the intended final metadata/Codex manifest root.
4. Re-run `pnpm loopers:metadata` with the real final image base URI and matching Codex base URI.
5. Upload final metadata and Codex output only after the new bundle preflight passes.
6. Use the final token metadata base URI as the contract reveal base URI.

The existing full metadata output proves the compiler and collection structure, but its `ar://loopers-full-...` bases are staging labels until real upload IDs exist.

The final metadata and Codex bases must share one Arweave manifest root:

- reveal base: `https://arweave.net/<FINAL_MANIFEST_TX_ID>/metadata/`
- Codex base: `https://arweave.net/<FINAL_MANIFEST_TX_ID>/codex`

If the uploader cannot pre-sign or otherwise give the final manifest ID before final JSON is written, stop and use an upload flow that can. Do not hand-edit 7,777 JSON files after upload.

## Dry-Run Arweave Handoff

Before any permanent upload, run this with real-looking dry-run IDs. After upload, run it again with the real returned IDs before Sepolia reveal:

```sh
pnpm loopers:verify-arweave-handoff -- \
  --hashlips-json-dir /home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/json \
  --hashlips-images-dir /home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images \
  --export-manifest-path /home/ubuntu/.openclaw/workspace/media/multipass-genesis/looper-bible-v0/hashlips-engine-export-v01/hashlips-engine-export-v01-manifest.json \
  --personality-matrix-path /home/ubuntu/.openclaw/workspace/docs/multipass/looper-bible/trait-personality-matrix.json \
  --class-model-path /home/ubuntu/.openclaw/workspace/docs/multipass/looper-bible/agent-class-model.json \
  --placeholder-metadata-path artifacts/loopers-placeholder-mainnet/metadata.json \
  --placeholder-token-uri https://arweave.net/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/metadata.json \
  --image-base-uri https://arweave.net/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --metadata-base-uri https://arweave.net/ccccccccccccccccccccccccccccccccccccccccccc/metadata/ \
  --codex-base-uri https://arweave.net/ccccccccccccccccccccccccccccccccccccccccccc/codex \
  --output-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-arweave-handoff-dry-run \
  --expected-count 7777 \
  --reveal-offset 5911 \
  --report-path /home/ubuntu/.openclaw/workspace/tmp/loopers-arweave-handoff-dry-run/report.json
```

Expected result:

- `Loopers Arweave handoff dry-run passed for 7777 tokens`
- `Sample tokenURI(1)` resolves under the final `/metadata/` base
- generated token JSON uses the real image base
- generated token JSON links to the matching `/codex/` base
- generated Codex JSON links back to the matching `/metadata/` base

## Mainnet Config Inputs

- Chain: Base mainnet, `8453`.
- Intended owner/admin: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`.
- Intended treasury/proceeds/royalty receiver: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`.
- ERC-8004 registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
- ERC-8004 agent base URI: `https://api.helixa.xyz/api/loopers/agents/`.
- ERC-6551 registry and implementation must be rechecked on Base mainnet before deploy.
- Exact allowlist/public prices should be set from launch-time ETH/USD, targeting about `$10` allowlist and `$20` public.
- Placeholder token URI must be the real uploaded placeholder metadata URI.
- Merkle root must be the final frozen snapshot root: `0x24341b4d6325c0aae2dcada50a7f2d0b4b478ce9f78b285f8a55517824719a80`.

## Launch Sequence

1. Verify owner/admin and treasury/royalty address twice.
2. Verify deployer has enough Base ETH for deploy, config, reveal, public flip, and emergency pause.
3. Upload and check placeholder metadata.
4. Confirm locked allowlist root `0x24341b4d6325c0aae2dcada50a7f2d0b4b478ce9f78b285f8a55517824719a80` is still the intended final root.
5. Set exact allowlist and public prices.
6. Prepare `packages/contracts/config/base-mainnet.local.json` from the example using only final values.
7. Deploy Loopers to Base mainnet with sale config.
8. Run deployment verification against the mainnet deployment artifact.
9. Swap `/mint` from rehearsal/draft to mainnet config.
10. Run web build, tests, and live smoke.
11. Open compressed allowlist window.
12. Monitor proof API, mint state, support issues, and contract reads.
13. Flip public once allowlist minting is healthy.
14. Reveal at public open with the final metadata base URI and recorded reveal offset.
15. Verify sample `tokenURI` outputs, image URLs, Codex URLs, ERC-6551 account reads, ERC-8004 binds, royalties, and Basescan display.
16. Hold proceeds in the contract until reveal/support smoke checks and the agreed stability window pass.

## Final Smoke Commands

```sh
pnpm --filter @helixa/loopers-contracts test
node --test apps/web/test/looper-mint.test.mjs apps/web/test/app.test.mjs
pnpm loopers:verify-bundle -- \
  --metadata-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/metadata \
  --codex-dir /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/codex \
  --images-dir /home/ubuntu/.openclaw/workspace/tmp/hashlips_art_engine/build/images \
  --expected-count 7777 \
  --report-path /home/ubuntu/.openclaw/workspace/tmp/loopers-metadata-full-20260904/preflight-report.json
pnpm web:build
```

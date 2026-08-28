# Loopers Metadata And Reveal Checklist

## Storage Model

- Placeholder metadata can be public on Arweave before mint.
- Final art and metadata stay private until right before reveal QA.
- Final upload target: Arweave.
- Arweave is immutable, so validate before upload.

## Art Source

- Final collection images come from the existing approved HashLips/layer-composite pipeline.
- Do not reinvent the art direction, regenerate substitute Loopers, or use ad hoc image generation for final collection assets.
- HashLips output and matching metadata are the source of truth for token images and traits.
- Arweave receives the validated final images, token JSON, and Agent Codex JSON after reveal QA passes.

## Token JSON Shape

Each token JSON should include normal NFT marketplace fields:

- `name`
- `description`
- `image`
- `external_url`
- `attributes`

Each token JSON should also include key Looper agent fields:

- `agent_class`
- `secondary_class`
- `voice`
- `risk_profile`
- `specialization`
- `activation_seed`
- `first_mission`
- `cred_evolution_hint`
- `trait_codex_version`
- `codex_uri`

`codex_uri` points to a richer Agent Codex JSON for long lore, scoring vector, class reasoning, activation prompt, first missions, and future Evolution hooks.

## Compiler Path

Use `packages/loopers-metadata/` after HashLips generation:

1. Run HashLips against the approved export to produce `build/images` and `build/json`.
2. Feed HashLips `build/json`, the approved export manifest, the trait personality matrix, and the agent class model into `pnpm loopers:metadata`.
3. Write final marketplace token JSON under `metadata/` and richer Agent Codex JSON under `codex/`.
4. Upload only the validated final images, token JSON, and Agent Codex JSON to Arweave.

The compiler uses the HashLips export manifest to canonicalize display names that HashLips sanitizes for filenames, such as `Right Facing Trucker Cap` back to `Right-Facing Trucker Cap` and numbered overlay filenames back to clean overlay names.

Example:

```sh
pnpm loopers:metadata -- \
  --hashlips-json-dir /private/hashlips/build/json \
  --hashlips-images-dir /private/hashlips/build/images \
  --export-manifest-path /private/hashlips-engine-export-v01-manifest.json \
  --personality-matrix-path /private/trait-personality-matrix.json \
  --class-model-path /private/agent-class-model.json \
  --output-dir /private/final-loopers-metadata \
  --image-base-uri ar://FINAL_IMAGE_BUNDLE \
  --codex-base-uri ar://FINAL_METADATA_BUNDLE/codex \
  --expected-count 7777
```

The compiler fails final mode unless every non-`None` approved trait has class affinities. Use `--allow-incomplete-class-affinities` only for local draft QA.

## Naming

- Collection: `Loopers`
- Canonical token metadata name: `Looper #<tokenId>`
- Agent/profile display name is chosen later in Multipass during activation.
- First agent/profile name is free with activation.
- Future profile renames cost `$CRED`.

## Reveal Timing

- Allowlist phase uses placeholder art/metadata.
- Public mint opens after 24 hours.
- Reveal happens at public mint open.
- Owner sets final base URI and reveal offset.
- Buyers should not be able to snipe a visible rare by token ID.

## Validation Before Arweave Upload

Run validation for:

- expected token count
- JSON parse
- required fields
- complete class affinities for every non-`None` approved trait
- image and trait mapping matches the approved HashLips output
- image URI presence
- `codex_uri` presence
- duplicate token names
- duplicate/missing image files
- duplicate/missing Codex files
- trait names and values
- marketplace-compatible attributes
- Looper agent fields
- rarity sanity
- no placeholder values in final JSON
- no private/unreleased file paths
- no `Multipass Looper` token names

## Base Sepolia Rehearsal

Do not create a public branded OpenSea test collection.

Rehearsal should:

- deploy a dummy/test collection on Base Sepolia
- mint test tokens from the mint site
- check `tokenURI` before reveal: placeholder JSON
- set final base URI and reveal offset
- check `tokenURI` after reveal: final JSON
- verify image URLs
- verify `codex_uri`
- verify attributes
- verify royalties
- verify wallet display where available
- verify Basescan reads

Skip OpenSea unless a marketplace-specific issue needs diagnosis.

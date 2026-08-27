# Loopers Metadata And Reveal Checklist

## Storage Model

- Placeholder metadata can be public on Arweave before mint.
- Final art and metadata stay private until right before reveal QA.
- Final upload target: Arweave.
- Arweave is immutable, so validate before upload.

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


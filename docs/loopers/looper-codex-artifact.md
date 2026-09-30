# Looper Codex artifact v1

The Looper Codex is a checksum-pinned, deterministic, read-only index for all 7,777 Loopers on Base. It has no network, model, wallet, owner, or database dependency. Runtime consumers load one verified local artifact and receive deeply frozen responses from seven closed queries.

## Collection and proof

- Chain: Base (8453)
- Contract: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Count: 7,777
- Artifact schema: `1.0.0`
- Compiler: `1.0.0`
- Fixed audit time: `2026-09-30T00:00:00.000Z`
- Semantic artifact hash: `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`
- Serialized artifact SHA-256: `aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073`
- Serialized artifact size: 60,203,971 bytes

The release and artifact were each built twice from the same bytes and compared byte-for-byte. The portable manifest is committed at [looper-codex-release-v1.json](./looper-codex-release-v1.json); the generated source tree and 60 MB runtime artifact are intentionally not committed.

## Pinned reviewed inputs

- Trait-personality matrix: `878e1aed5c653471d6fbde0fa9cadbcd171e25dadaa5439b8d7d530e566eda3d`
- Agent-class model: `0a718de556680c83e70416ab5f922a4f7d0c7440edd79c6f29bbd3c422990266`
- HashLips export manifest: `936ac18cbec6808664fee155d7a9c1c9b25265dc2c32e651c7ca979f7d8e55ce`
- Metadata aggregate: `a8e4970a8aeff51fe06a187656cd1c2d162afd0331e216d27a3c01b16c4aedde`
- Codex aggregate: `8cf666688e1841bce6f495111d243ff7b46f5d2a031ed9374577a2492867972c`

Aggregate hashes are SHA-256 over canonical JSON arrays of `[numericId, byteLength, fileSha256]`, ordered by numeric token ID.

## Portable release

The release contains only:

```text
release-manifest.json
metadata/1.json ... metadata/7777.json
codex/1.json ... codex/7777.json
sources/trait-personality-matrix.json
sources/agent-class-model.json
sources/hashlips-export-manifest.json
sources/collection-provenance.json
```

Materialization requires explicit local inputs and a fixed audit timestamp:

```sh
pnpm loopers:codex:materialize -- \
  --metadata-dir "$OPENCLAW_WORKSPACE/tmp/loopers-metadata-https-hotfix-20260912/metadata" \
  --codex-dir "$OPENCLAW_WORKSPACE/tmp/loopers-public-redeploy-stage-a-20260912/codex" \
  --trait-personality-matrix "$OPENCLAW_WORKSPACE/docs/multipass/looper-bible/trait-personality-matrix.json" \
  --agent-class-model "$OPENCLAW_WORKSPACE/docs/multipass/looper-bible/agent-class-model.json" \
  --hashlips-export-manifest "$OPENCLAW_WORKSPACE/media/multipass-genesis/looper-bible-v0/hashlips-engine-export-v01/hashlips-engine-export-v01-manifest.json" \
  --collection-provenance "$OPENCLAW_WORKSPACE/tmp/looper-codex-collection-provenance-v1.json" \
  --output-dir "$OPENCLAW_WORKSPACE/tmp/looper-codex-release-v1" \
  --chain-id 8453 \
  --collection 0x1649CD37f4748807b4882FC48765bA0B2aFfa94a \
  --compiler-version 1.0.0 \
  --audited-at 2026-09-30T00:00:00.000Z

pnpm loopers:codex -- \
  --release-dir "$OPENCLAW_WORKSPACE/tmp/looper-codex-release-v1" \
  --output "$OPENCLAW_WORKSPACE/tmp/looper-codex-v1.json"
```

Only relative paths enter the release manifest. Machine paths and the audit timestamp are excluded from the semantic artifact hash.

## Validation and safety

The materializer and loader fail closed:

- `lstat` requires regular, non-symlink files.
- IDs must be exactly contiguous `1..7777`; gaps and extra numbered files reject.
- Release manifest: 1 MiB maximum.
- Metadata: 64 KiB per file and 512 MiB aggregate.
- Codex: 128 KiB per file and 1 GiB aggregate.
- Source files: 4 MiB each.
- Runtime artifact: mandatory 128 MiB cap.
- All copied objects use closed key sets and bounded strings.
- Every duplicated metadata/Codex field, Arweave image identity, version, and cross-link is checked.
- Artifact loading recomputes trait frequencies, postings, exact stacks, source/version contracts, collection identity, coverage, and semantic hash.
- Outputs are deeply frozen.

## Deterministic math

- Frequency: `{ numerator: count, denominator: 7777 }`.
- PPM: `floor((count * 1_000_000 + denominator / 2) / denominator)`.
- Trait weight: `floor(7777 * 1_000_000 / traitCount)`.
- Similarity excludes the exact value `None` but preserves it as a collection fact.
- Weighted Jaccard retains integer intersection and union sums.
- Rankings compare fractions exactly with BigInt cross multiplication; ties use ascending numeric token ID.
- Public weights are base-10 integer strings; `scorePpm` uses integer floor division.
- Exact-stack keys hash canonical, lexicographically sorted `[type,value]` pairs.

## Seven closed queries

Every response is exactly:

```text
{ schemaVersion, artifactHash, codexVersion, operation, subjectIds, evidence, result }
```

The only operations are:

1. `getTokenProfile(tokenId)`
2. `explainTraits(tokenId)`
3. `compareTokens(leftTokenId, rightTokenId)`
4. `findByTraits(filters, cursor, limit)`
5. `findSimilar(tokenId, limit)`
6. `getTraitStats(traitType, value)`
7. `getCollectionSummary()`

Trait search uses exact strings, AND semantics, a maximum of 12 filters, a default limit of 25, and a maximum of 100. Cursors are canonical base64url objects bound to both artifact hash and canonical filter hash. Similarity defaults to 10 and caps at 25. Unknown fields, unknown traits, malformed/stale cursors, invalid IDs, regex-like input, and unsupported limits reject.

Evidence IDs are stable token, trait, or collection IDs. Canonical data is labeled `collection_fact`; personality, lore, class, and recommended skill families are labeled `codex_interpretation`. Skill families are recommendations only and never contain an `enabled` field.

## Loading and proof

```js
import {
  createLooperCodexQueryService,
  loadLooperCodexArtifact,
} from '@helixa/loopers-codex';

const artifact = await loadLooperCodexArtifact({ path: process.env.LOOPER_CODEX_ARTIFACT });
const codex = createLooperCodexQueryService(artifact);
const profile = codex.getTokenProfile(3802);
```

Run the complete local proof:

```sh
LOOPER_CODEX_ARTIFACT="$OPENCLAW_WORKSPACE/tmp/looper-codex-v1.json" \
  pnpm loopers:codex:prove
```

The proof loads and independently verifies all 7,777 tokens, exercises all seven operations for Looper #3802, checks pagination and hostile inputs, confirms recommendations are never enabled, and replaces `globalThis.fetch` with a rejecting sentinel. Expected output contains only count, schema, artifact hash, operation count, and `fetch=0`.

## Downstream boundary

Codex is a pure foundation, not an activation system. Downstream Console or RESTAP code may consume only the verified query service. It must not mutate the artifact, treat recommendations as enabled capabilities, infer ownership, perform wallet actions, or add network/model/database behavior to this package. RESTAP canary work remains separately gated to Looper #3802.

# Looper Codex Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a checksum-pinned, reproducible collection index and pure read-only query service for all 7,777 Loopers.

**Architecture:** Add a focused `@helixa/loopers-codex` package. A materializer creates a portable local release directory whose manifest pins every source; the compiler accepts only that release directory, validates all duplicated semantics, and emits a canonical artifact. The runtime independently recomputes every derived index and exposes seven closed bounded queries with no network, model, wallet, or database dependency.

**Tech Stack:** Node.js ESM, built-in `node:crypto` and `node:fs/promises`, Node test runner, pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-09-30-looper-codex-restap-canary-design.md`

---

## Locked contracts

### Portable release layout

A release directory contains only regular files/directories; symlinks are rejected:

- `release-manifest.json`
- `metadata/1.json` through `metadata/7777.json`
- `codex/1.json` through `codex/7777.json`
- `sources/trait-personality-matrix.json`
- `sources/agent-class-model.json`
- `sources/hashlips-export-manifest.json`
- `sources/collection-provenance.json`

`release-manifest.json` pins schema, chain ID `8453`, collection `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`, exact count `7777`, compiler version, relative component paths, each single-file SHA-256, aggregate hashes for numbered metadata/Codex files, and one explicit `auditedAt`. Aggregate hashes are SHA-256 over canonical JSON arrays of `[numericId, byteLength, fileSha256]`, sorted numerically. Paths and `auditedAt` are release evidence; no machine-specific source path enters the semantic artifact.

The first reviewed release is materialized from:

- current public metadata: `tmp/loopers-metadata-https-hotfix-20260912/metadata`;
- current immutable Codex: `tmp/loopers-public-redeploy-stage-a-20260912/codex`;
- trait matrix SHA-256 `878e1aed5c653471d6fbde0fa9cadbcd171e25dadaa5439b8d7d530e566eda3d`;
- class model SHA-256 `0a718de556680c83e70416ab5f922a4f7d0c7440edd79c6f29bbd3c422990266`;
- HashLips export manifest SHA-256 `936ac18cbec6808664fee155d7a9c1c9b25265dc2c32e651c7ca979f7d8e55ce`.

The materializer accepts those paths explicitly and copies verified bytes into the portable layout. Documentation gives both the exact first-release command and the path-independent layout contract.

### Input safety

Before parsing, use `lstat` and require regular non-symlink files. Caps:

- release manifest: 1 MiB;
- each metadata file: 64 KiB;
- each Codex file: 128 KiB;
- each source model/manifest/provenance file: 4 MiB;
- aggregate metadata bytes: 512 MiB;
- aggregate Codex bytes: 1 GiB;
- runtime artifact: mandatory 128 MiB cap.

Require only `1.json..7777.json`; extra numbered files, gaps, duplicates, malformed JSON, or changed hashes fail closed.

### Cross-document invariants

For every token, validate equality of token ID/name, visual traits, primary/secondary class, specialization, risk/autonomy values and labels, Codex and class-model versions, external URL, voice, activation seed, first mission(s), and schema version. Metadata derived attributes must equal the corresponding Codex fields. Metadata `Artifact` aliases only to Codex `Patch Artifact`.

Image identity is the immutable Arweave transaction ID. Accept only `ar://<43-char-id>` and `https://turbo-gateway.com/<43-char-id>`, normalize both to the ID, and require equality. Preserve the reviewed public metadata URL for display. Token metadata/Codex cross-links must match the release's reviewed bases or exact token suffix; never infer equivalence for arbitrary hosts.

### Deterministic math

- Trait frequency is stored exactly as `{ numerator: count, denominator: 7777 }`; display parts-per-million use half-up integer rounding: `floor((count * 1_000_000 + denominator / 2) / denominator)`.
- Similarity retains `None` traits for facts/exact stacks but excludes value exactly `None` from similarity candidates and weights.
- Inverse-frequency weight is integer fixed-point: `weightMicros = floor(collectionCount * 1_000_000 / traitCount)`.
- Exact-stack input is visual `[type,value]` pairs sorted by type then value, serialized with canonical JSON; stack key is SHA-256 of those bytes.
- Weighted Jaccard keeps integer intersection/union sums. Rankings compare fractions exactly using BigInt cross multiplication. Exposed `scorePpm = floor(intersectionWeight * 1_000_000 / unionWeight)`; ties sort by numeric token ID.

### Closed query contract

Seven operations only:

1. `getTokenProfile(tokenId)`
2. `explainTraits(tokenId)`
3. `compareTokens(leftTokenId, rightTokenId)`
4. `findByTraits(filters, cursor, limit)`
5. `findSimilar(tokenId, limit)`
6. `getTraitStats(traitType, value)`
7. `getCollectionSummary()`

Token IDs are integers `1..7777`. Trait strings are exact, trimmed, 1–96 characters; regex-like syntax has no special meaning and unknown values fail cleanly. Filters are arrays of 1–12 exact `{ type, value }` objects with no unknown keys. Search limit defaults to 25 and caps at 100; similarity defaults to 10 and caps at 25. Cursor is at most 512 characters and is base64url canonical JSON `{ v:1, artifactHash, filterHash, afterTokenId }`; a changed artifact/filter invalidates it.

Every response includes `schemaVersion`, `artifactHash`, `codexVersion`, `operation`, subject IDs, and evidence IDs. Evidence IDs are stable `token:<id>`, `trait:<first16(sha256(canonical [type,value]))>`, or `collection:<first16(artifactHash)>`. Canonical counts/traits are labeled `collection_fact`; class, personality, lore, and recommended skill families are labeled `codex_interpretation`. Deterministic class-to-skill recommendations live in a versioned static map, are returned as `recommended`, and never appear as enabled.

#### Exact query schemas

All request objects and result objects are closed: unknown keys reject. Strings below are non-empty and use the bounds above; integers are JSON-safe non-negative integers unless stated otherwise. Arrays are returned as fresh deeply frozen arrays. These shared shapes are literal:

- `Trait = { type:string, value:string }`. Trait arrays sort by `type`, then `value`, except profile/explanation arrays, which preserve the artifact's reviewed visual-layer order.
- `Frequency = { numerator:integer, denominator:7777, ppm:integer }`.
- `Evidence = { id:string, kind:'token'|'trait'|'collection', label:'collection_fact'|'codex_interpretation' }`. Evidence de-duplicates by `[id,label]` and sorts by `id`, then `label`.
- `Recommendation = { skillFamily:string, reason:string, sourceClass:string, mapVersion:string, status:'recommended' }`. No recommendation or response may contain an `enabled` key.
- Every call returns exactly `{ schemaVersion:'1.0.0', artifactHash:string, codexVersion:string, operation:string, subjectIds:integer[], evidence:Evidence[], result:object }`. `artifactHash` is lowercase 64-hex; `codexVersion` is the artifact's single trait-Codex version. `subjectIds` contains only explicit token arguments: one ID for profile/explanation/similarity, two in left/right order for comparison, and `[]` for search/stats/summary.

The seven exact request/result contracts are:

1. `getTokenProfile(tokenId)` where `tokenId` is the integer itself. `operation='getTokenProfile'`; `result` is exactly `{ identity:{ tokenId:integer, canonicalName:string, description:string, image:{ url:string, id:string }, externalUrl:string }, visualTraits:Trait[], interpretation:{ primaryClass:string, secondaryClass:string|null, specialization:string|null, risk:{ value:integer, label:string }, autonomy:{ value:integer, label:string }, voice:string, quirks:string[], communicationStyle:string[], values:string[], humor:string[], origin:string, missionBias:string, shortLore:string, longLore:string, activationSeed:string, firstMission:string, firstMissions:string[], recommendedSkills:Recommendation[] }, versions:{ traitCodexVersion:string, classModelVersion:string } }`.
2. `explainTraits(tokenId)`. `operation='explainTraits'`; `result` is exactly `{ tokenId:integer, traits:Array<{ type:string, value:string, frequency:Frequency, evidenceId:string, interpretation:{ archetype:string, role:string, narrativeSeed:string, voice:string, values:string, missionBias:string, riskDelta:integer, autonomyDelta:integer, label:'codex_interpretation' } }> }`. Signed `riskDelta`/`autonomyDelta` are the only integers here allowed below zero.
3. `compareTokens(leftTokenId,rightTokenId)`. IDs must differ. `operation='compareTokens'`; `result` is exactly `{ left:{ tokenId:integer, traits:Trait[] }, right:{ tokenId:integer, traits:Trait[] }, sharedTraits:Trait[], onlyLeft:Trait[], onlyRight:Trait[], sharedTraitCount:integer, unionTraitCount:integer }`. Set-derived arrays use canonical trait sort.
4. `findByTraits(filters,cursor,limit)`, where `filters` is the exact array shape already locked, `cursor` is `null` or the locked string, and `limit` is `undefined` or an integer. Filters are ANDed, duplicate pairs reject, and canonical filters sort by type/value before hashing. `operation='findByTraits'`; `result` is exactly `{ filters:Trait[], items:Array<{ tokenId:integer, canonicalName:string, matchedTraits:Trait[] }>, nextCursor:string|null }`. Items sort by ascending token ID; `nextCursor=null` is the only terminal value; the cursor binds `artifactHash`, canonical-filter hash, and the last returned token ID.
5. `findSimilar(tokenId,limit)`, where `limit` is `undefined` or an integer. `operation='findSimilar'`; `result` is exactly `{ tokenId:integer, items:Array<{ tokenId:integer, canonicalName:string, intersectionWeight:string, unionWeight:string, scorePpm:integer, sharedTraits:Trait[] }> }`. Weight sums are base-10 integer strings. Items sort by exact descending `intersectionWeight/unionWeight`, then ascending token ID; no self item; empty candidate union returns `[]`.
6. `getTraitStats(traitType,value)`, with both positional strings. `operation='getTraitStats'`; `result` is exactly `{ trait:Trait, frequency:Frequency, tokenIds:integer[] }`; token IDs sort ascending. Unknown trait type/value rejects rather than returning zero.
7. `getCollectionSummary()` takes no arguments. `operation='getCollectionSummary'`; `result` is exactly `{ collection:{ name:'Loopers', chainId:8453, contract:string, count:7777 }, versions:{ traitCodexVersion:string, classModelVersion:string, recommendationMapVersion:string }, traitTypes:Array<{ type:string, distinctValueCount:integer, values:Array<{ value:string, frequency:Frequency }> }> }`. Trait types and values sort lexicographically.

Envelope evidence is operation-specific but exact: profile includes one token fact, its trait facts, and one token interpretation entry; explanation includes its token fact plus each trait fact and trait interpretation entry; comparison includes both token facts and all union trait facts; search includes filter trait facts and returned token facts; similarity includes the subject/result token facts, shared trait facts, and subject/result token interpretation entries; trait stats includes its trait fact and collection fact; summary includes only the collection fact.

---

## Chunk 1: Deterministic artifact compiler

### File structure

- Create `packages/loopers-codex/package.json`: scripts and exports.
- Create `packages/loopers-codex/src/constants.js`: versions, limits, derived fields, and fixed-point constants.
- Create `packages/loopers-codex/src/canonical-json.js`: stable serializer/hash helpers.
- Create `packages/loopers-codex/src/safe-files.js`: lstat, byte caps, numbered-file enumeration, and hashing.
- Create `packages/loopers-codex/src/release-manifest.js`: portable release validation/materialization helpers.
- Create `packages/loopers-codex/src/normalize.js`: closed record validation.
- Create `packages/loopers-codex/src/skill-recommendations.js`: versioned class-to-skill recommendation map.
- Create `packages/loopers-codex/src/compiler.js`: artifact compilation and semantic revalidation.
- Create `packages/loopers-codex/src/index.js`: approved public exports.
- Create `packages/loopers-codex/scripts/materialize-looper-codex-release.js`.
- Create `packages/loopers-codex/scripts/build-looper-codex.js`.
- Create `packages/loopers-codex/test/fixtures.js`.
- Create `packages/loopers-codex/test/compiler.test.mjs`.
- Modify `package.json`: root materialize/build scripts.

### Task 1: Package skeleton and canonical serialization

**Files:** create `package.json`, `src/constants.js`, `src/canonical-json.js`, `src/index.js`, and `test/compiler.test.mjs` under `packages/loopers-codex`.

- [x] Write failing tests for stable object-key serialization, preserved array order, rejection of unsupported/non-finite/cyclic values, and equivalent SHA-256 hashes.
- [x] Run RED: `node --test --test-name-pattern='canonical JSON' packages/loopers-codex/test/compiler.test.mjs`.
- [x] Implement the package/constants/canonical serializer with `LOOPER_CODEX_SCHEMA_VERSION='1.0.0'` and the locked bounds above.
- [x] Run the same focused command; require PASS.
- [x] Commit: `feat: add canonical Looper Codex package`.

### Task 2: Safe portable release materialization

**Files:** create `src/safe-files.js`, `src/release-manifest.js`, `scripts/materialize-looper-codex-release.js`; modify tests/exports/scripts.

- [x] Write failing tests for the exact portable layout, source/component hashes, numeric aggregate hashes, regular-file/no-symlink policy, per-file/aggregate limits, contiguous IDs, extra numbered files, HTTP path refusal, fixed audit time, and atomic output-directory promotion.
- [x] Run RED: `node --test --test-name-pattern='release manifest|materializer|input bounds' packages/loopers-codex/test/compiler.test.mjs`.
- [x] Implement materialization from explicit local inputs. Copy through a sibling temporary directory, verify after copy, write canonical `release-manifest.json`, then rename atomically. Never print source content or credential-bearing paths.
- [x] Add package script `materialize` and root `loopers:codex:materialize`; test the literal pnpm `--` separator via `execFile('pnpm', ['loopers:codex:materialize','--',...])`.
- [x] Run package tests; require PASS.
- [x] Commit: `feat: pin portable Looper Codex releases`.

### Task 3: Normalize and cross-check release records

**Files:** create `src/normalize.js`, `src/skill-recommendations.js`, `test/fixtures.js`; modify exports/tests.

- [x] Write failing tests for every cross-document invariant in the locked contract, URI/Arweave equivalence, all mismatch classes, duplicate trait types/keys, maximum text lengths, closed copied fields, recommendation provenance, and absence of owner/private/source-path fields.
- [x] Run RED: `node --test --test-name-pattern='record|image identity|recommendation' packages/loopers-codex/test/compiler.test.mjs`.
- [x] Implement frozen normalized records: `{ tokenId, canonicalName, description, image, imageId, externalUrl, visualTraits, traitAtoms, classProfile, personality, lore, activation, recommendedSkills, versions }`.
- [x] Run the focused tests and complete compiler test file; require PASS.
- [x] Commit: `feat: validate Looper Codex release records`.

### Task 4: Compile and independently verify deterministic indexes

**Files:** create `src/compiler.js` and `scripts/build-looper-codex.js`; modify exports/tests/package/root scripts.

- [x] Write failing tests for contiguous coverage, exact frequencies, postings, exact stacks, locked integer weights, `None` policy, source hashes, collection contract/chain, version consistency, semantic hash stability, audit timestamp exclusion, and byte-identical output for identical release bytes.
- [x] Add corruption tests where postings/counts/stacks/weights/source hashes are altered and the embedded artifact hash is recomputed; independent semantic verification must still reject them.
- [x] Run RED: `node --test --test-name-pattern='compile|semantic verification|build CLI' packages/loopers-codex/test/compiler.test.mjs`.
- [x] Implement semantic payload `{ schemaVersion, collection, compilerVersion, sourceHashes, versions, count, tokens, traitStats, postings, exactStacks }`; wrap it as `{ semantic, audit:{ auditedAt, releaseManifestHash }, artifactHash }`. Hash only canonical `semantic`.
- [x] Implement `verifyLooperCodexArtifact` by rebuilding all derived structures from `semantic.tokens` and comparing canonical bytes, source/version contracts, count/coverage, and hash. Build CLI accepts only `--release-dir` and `--output`, writes atomically, re-reads under the 128 MiB cap, verifies semantically, and prints count/schema/hash.
- [x] Add root `loopers:codex` and test literal `pnpm loopers:codex -- --release-dir ... --output ...`.
- [x] Run `node --test packages/loopers-codex/test/compiler.test.mjs packages/loopers-metadata/test/loopers-metadata.test.mjs`; require PASS.
- [x] Commit: `feat: compile deterministic Looper Codex indexes`.

### Task 5: Materialize and prove the actual 7,777-token release

**Files:** create `docs/loopers/looper-codex-release-v1.json` containing the resulting portable manifest and reviewed source hashes; do not commit the 123+ MiB source tree or generated artifact.

- [x] Materialize `/home/ubuntu/.openclaw/workspace/tmp/looper-codex-release-v1` with explicit current metadata/Codex/model/export paths, chain/contract, compiler version, provenance JSON, and fixed `--audited-at 2026-09-30T00:00:00.000Z`.
- [x] Build `/home/ubuntu/.openclaw/workspace/tmp/looper-codex-v1.json`, requiring 7,777 records and a lowercase 64-character artifact hash.
- [x] Repeat materialization/build to `*-repeat`; require `cmp` and `sha256sum` equality for both portable manifests and artifacts.
- [x] Copy only the portable release manifest to `docs/loopers/looper-codex-release-v1.json`; verify it contains no machine-specific paths.
- [x] Run `git diff --check` and commit: `feat: prove complete Looper Codex artifact build`.

---

## Chunk 2: Pure query service

### File structure

- Create `packages/loopers-codex/src/loader.js`.
- Create `packages/loopers-codex/src/query-service.js`.
- Create `packages/loopers-codex/src/cursor.js`.
- Create `packages/loopers-codex/test/query-service.test.mjs`.
- Modify `packages/loopers-codex/src/index.js`.

### Task 6: Fail-closed artifact loader

- [x] Write failing tests for valid load, mandatory 128 MiB default cap, regular-file/no-symlink policy, unsupported schema, count/coverage drift, stale hash, hash-consistent semantic corruption of every derived index, malformed source hashes/versions, and deep immutability.
- [x] Run RED: `node --test --test-name-pattern='loader' packages/loopers-codex/test/query-service.test.mjs`.
- [x] Implement `loadLooperCodexArtifact({ path, expectedCount=7777 })` using the safe-file layer and `verifyLooperCodexArtifact`; build private maps only after complete verification.
- [x] Run `pnpm --filter @helixa/loopers-codex test`; require PASS.
- [x] Commit: `feat: load Looper Codex artifacts fail closed`.

### Task 7: Six non-similarity closed queries

- [x] Write literal deep-equality schema tests for the six locked non-similarity envelopes/results (all required keys, types, nesting, ordering, nullability, and rejection of every extra key), plus concrete caps, exact rational frequency/ppm, evidence labels, recommended-not-enabled skills, cursor artifact/filter binding, stale/malformed cursor rejection, and immutable outputs.
- [x] Run RED: `node --test --test-name-pattern='profile|trait|compare|search|summary|cursor' packages/loopers-codex/test/query-service.test.mjs`.
- [x] Implement `cursor.js` and the six operations other than `findSimilar` using the locked contract. `createLooperCodexQueryService` exposes only implemented methods at this commit.
- [x] Run the focused tests and full package suite; require PASS.
- [x] Commit: `feat: query Looper traits and comparisons`.

### Task 8: Seventh query — deterministic similar Loopers

- [x] Write literal deep-equality tests for the locked `findSimilar` envelope/result and weighted-Jaccard tests proving decimal-string weights, rare-trait weighting, exact fraction ordering, `None` exclusion, self exclusion, max limit 25, score ppm, numeric tie order, evidence ordering, and stable results after artifact reload.
- [x] Run RED: `node --test --test-name-pattern='similar' packages/loopers-codex/test/query-service.test.mjs`.
- [x] Implement candidate union from non-`None` postings and exact BigInt fraction comparison; add `findSimilar` as the seventh and final public operation.
- [x] Run Codex and metadata suites; require PASS.
- [x] Commit: `feat: find similar Loopers deterministically`.

---

## Chunk 3: Repository proof and downstream handoff

### File structure

- Create `packages/loopers-codex/scripts/prove-looper-codex.js`.
- Create `packages/loopers-codex/test/full-artifact-proof.test.mjs` (skips unless `LOOPER_CODEX_ARTIFACT` is set).
- Create `docs/loopers/looper-codex-artifact.md`.
- Modify package/root scripts and this plan's checkboxes.

### Task 9: Executable full-artifact proof

- [x] Write the proof test to load the environment-provided artifact, require 7,777 tokens, execute all seven operations including #3802 profile/explanation/similarity, compare #3802, exact trait search, trait stats, and collection summary, deep-validate every literal locked request/response schema against the full artifact, exercise terminal `nextCursor:null` and stale/filter-bound cursor rejection, reject hostile/unknown fields, prove recommendations never contain `enabled`, and prove `globalThis.fetch` is never called.
- [x] Add package script `prove` and root `loopers:codex:prove` invoking `scripts/prove-looper-codex.js`.
- [x] Run: `LOOPER_CODEX_ARTIFACT=/home/ubuntu/.openclaw/workspace/tmp/looper-codex-v1.json pnpm loopers:codex:prove`; require PASS with count/hash and no token content.
- [x] Run the same artifact through `LOOPER_CODEX_ARTIFACT=... node --test packages/loopers-codex/test/full-artifact-proof.test.mjs`; require PASS.
- [x] Commit: `test: prove full Looper Codex queries`.

### Task 10: Documentation and final gates

- [x] Document portable materialization, pinned hashes, artifact schema/hash behavior, safety caps, exact math, all seven query contracts, and downstream integration boundary in `docs/loopers/looper-codex-artifact.md`.
- [x] Run sequentially: Codex package tests; metadata package tests; `apps/api/test/looper-persona.test.mjs`; full-artifact proof; `git diff --check`.
- [x] Scan package source to require no HTTP fetch, wallet/model/database imports, owner fields, secret-like values, or machine paths; require no generated artifact/source tree is staged.
- [x] Mark completed plan steps and commit: `docs: document Looper Codex foundation`.

## Completion boundary

Complete only when the portable release and artifact rebuild byte-identically, all 7,777 records pass semantic validation, every closed query passes deterministic/adversarial tests, and the full #3802 proof runs without network access. API routes, inference, Console UI, RESTAP, deployment, and ERC-8004 writes remain separate plans.

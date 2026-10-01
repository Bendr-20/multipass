# Looper Codex and RESTAP Canary Design

**Date:** 2026-09-30
**Status:** Approved for implementation planning
**Canary:** Looper #3802
**RESTAP target:** `0.1.4-beta`, pinned to reviewed upstream commit `5d7222692a0d1c53fbb03091b94de6c732cac2bc`

## Goal

Give every Looper accurate collection-native intelligence while proving that one Looper can communicate with outside agents through a bounded RESTAP surface.

The vertical slice contains:

1. **Looper Codex:** a deterministic, versioned index for all 7,777 Loopers supporting factual trait explanation, rarity, comparison, search, similarity, and trait-derived identity.
2. **RESTAP canary:** public discovery and isolated conversation for Looper #3802, plus an authenticated passive news channel.

Identity and authority remain separate. Traits define identity and recommend skill families; they never enable tools, expose private context, or grant wallet permissions. The current owner controls mutable presentation, enabled functional skills, and communication policy.

## Principles

### Shared knowledge, individual identity

Every token uses the same collection-wide Codex. Its immutable identity profile is derived only from verified token metadata and the pinned Codex rules.

### Facts before interpretation

Canonical metadata, frequencies, counts, comparison results, and provenance come from deterministic code. The model may explain these results but may not invent them.

Responses distinguish:

- **Collection fact:** derived from the pinned collection snapshot.
- **Codex interpretation:** derived from the versioned personality matrix and class model.
- **Owner customization:** supplied by the current authorized owner.

### Traits do not grant authority

Classes and recommended skills are descriptive. Functional skills remain disabled until the owner explicitly enables them through an authenticated Console control. No trait or class grants credentials, wallet execution, private memory, or external write access.

### Public communication is isolated

RESTAP public conversation is not a Console session. It receives public identity and public Codex context only, uses a separate session/memory namespace, and cannot access owner chat history, private Sibyl memory, wallet context, proposals, XMTP, or controls.

## Existing foundation

The repository already has:

- a metadata compiler that emits visual traits, Codex atoms, class scores, personality, voice, mission, and Codex versions;
- a bounded server-side Looper persona loader;
- selected-Looper Console rooms and canonical owner/controller authorization;
- a server-owned skill catalog;
- Bankr and Helixa read-only boundaries;
- XMTP holder/runtime conversations;
- private Sibyl-backed runtime memory;
- review-only proposals and a hardened owner wallet boundary.

This design adds a collection index and RESTAP adapter. It does not replace XMTP or create another wallet path.

## Scope

### Included

- Reproducible checksum-pinned metadata and Codex snapshot for exactly 7,777 tokens.
- Collection-wide trait counts, frequencies, combination counts, and deterministic similarity.
- Token profile, trait explanation, comparison, exact trait search, and similar-Looper queries.
- Immutable trait identity plus a separate owner-customizable operational layer.
- Console Codex panel and bounded Codex-aware chat context.
- Trait-derived recommended skill families shown as recommendations only.
- RESTAP discovery, public `/talk`, owner-only `GET /news`, and allowlisted signed `POST /news` for #3802.
- Optional public session continuity with bounded TTL and isolated storage.
- Rate limits, replay protection, payload limits, feature gates, audit evidence, and rollback.

### Excluded

- RESTAP for all 7,777 tokens.
- Wallet reads/writes, proposal approval, activation, naming, signing, or transactions through RESTAP.
- Public access to Console sessions, XMTP threads, private Sibyl memory, or owner profile data.
- Automatic skill enablement from traits.
- Dynamic loading of installed `SKILL.md` files.
- RESTAP tool invocation, delegation, orchestration, x402, or payment.
- Public `GET /news`.
- Treating RESTAP `session_id` as authentication.
- Publishing the ERC-8004 service entry before the HTTP canary is proven.

## Identity model

### Immutable NFT core

Derived from the pinned snapshot and Codex rules:

- token and canonical collection identity;
- normalized visual traits;
- exact trait counts and percentages;
- primary and secondary class;
- specialization;
- communication style and voice seed;
- temperament, autonomy, and risk posture;
- values, narrative seeds, and mission biases;
- recommended skill families;
- Codex version, snapshot hash, and evidence references.

This core follows the NFT across transfer. A reviewed Codex release may recompute it; owner input and model output may not alter it.

### Owner-controlled operational layer

The current authorized owner may control:

- display name;
- public biography;
- preferred voice presentation;
- current mission;
- explicitly enabled functional skills;
- public conversation enabled/disabled;
- allowlisted RESTAP news senders.

Owner fields never overwrite canonical fields. APIs and UI return both layers with provenance. Ownership transfer preserves canonical identity while invalidating prior-owner private state and permissions according to the existing transfer policy.

## Codex artifact

### Inputs

Compilation consumes an immutable local snapshot, not live metadata requests:

- 7,777 canonical metadata documents;
- 7,777 per-token Codex documents;
- trait personality matrix;
- class model;
- export manifest and canonical aliases;
- bounded reviewed collection lore/provenance.

An import command may retrieve a release snapshot, but it must materialize and hash all files before compilation. Runtime never derives collection truth from mutable URLs.

### Manifest

The build emits:

- schema and Codex versions;
- exact token count;
- source hashes;
- compiler version;
- normalized artifact hash;
- audit timestamp excluded from the semantic hash.

Startup fails closed unless token IDs are exactly `1..7777`, all hashes match, the count is 7,777, and schemas are supported.

### Indexes

The normalized release contains:

- collection contract, chain, versions, trait totals, and reviewed lore;
- compact immutable token records;
- exact `trait type + value -> sorted token IDs` postings;
- per-token similarity inputs or deterministic precomputed neighbors.

### Rarity and similarity

V1 does not invent a proprietary aggregate rarity score. It reports auditable values:

- trait count and percentage of 7,777;
- rarest individual trait;
- exact visual-stack count;
- tokens sharing selected combinations.

Similarity uses a pinned weighted Jaccard calculation over normalized visual traits. Weights are inverse-frequency values from the same snapshot. Owner fields, generated prose, class labels, and market value do not affect similarity. Ties sort by numeric token ID.

## Codex query service

Create a pure read-only module exposing closed operations:

- `getTokenProfile(tokenId)`
- `explainTraits(tokenId)`
- `compareTokens(leftTokenId, rightTokenId)`
- `findByTraits(filters, cursor, limit)`
- `findSimilar(tokenId, limit)`
- `getTraitStats(traitType, value)`
- `getCollectionSummary()`

Rules:

- canonical token IDs from 1 through 7777;
- exact normalized trait names/values only;
- bounded limits, cursors, strings, and arrays;
- no caller regex, SQL, URL, path, or arbitrary expression;
- every result carries snapshot/Codex versions and evidence IDs;
- immutable plain-data output;
- no model, network, wallet, database-write, or credential dependency.

## Runtime integration

Codex-related messages are classified into a closed operation. The server executes the deterministic query and injects only its bounded result into inference.

The model receives:

- selected Looper public identity;
- exact query result and provenance labels;
- owner presentation fields permitted for that channel;
- a response contract keeping facts and interpretation distinct.

It never receives the full collection artifact, arbitrary source files, internal paths, dynamic skills, or credentials.

Supported intent classes include trait explanation, uniqueness, comparison, exact trait search, similar Loopers, personality/class interpretation, and skill-family recommendations.

Codex-aware replies return structured metadata beside text:

- operation;
- subject token IDs;
- snapshot hash and Codex version;
- evidence list;
- fact/interpretation labels;
- recommended skills marked separately from enabled skills.

Malformed model envelopes preserve safe bounded text only and discard structured claims.

## Console experience

The selected Looper gains a **Codex** surface containing:

- concise identity summary;
- normalized visual traits;
- exact trait frequencies;
- rarest trait and exact-stack count;
- class and specialization;
- interpretation disclosure;
- recommended skill cards;
- similar Loopers;
- Codex version and evidence affordance;
- suggested prompts sent through normal Console chat.

Skill cards distinguish:

1. **Innate identity** — descriptive and always present.
2. **Recommended** — suggested by Codex but disabled.
3. **Enabled** — explicitly enabled by the current owner and still governed by an independent server gate.

Mobile uses the existing selected-agent flow and stacked panels. The Codex surface must require no hover and introduce no horizontal scrolling.

## RESTAP canary

### Base URL

`https://helixa.xyz/multipass-api/api/restap/loopers/3802`

Protocol routes append to that base:

- `GET /.well-known/restap.json`
- `POST /talk`
- `GET /news`
- `POST /news`

RESTAP is an adapter over bounded identity/inference components, not another general runtime.

### Discovery

A static schema-validated document exposes:

- RESTAP version;
- public Looper identity/image;
- ERC-8004 reference when available;
- public Codex/conversation capabilities;
- exact paths, methods, schemas, payload limits, and rate limits;
- optional public-session behavior;
- authentication requirements for news methods;
- privacy and execution constraints;
- Codex snapshot/version.

It declares no tool execution capability.

### Public `POST /talk`

Closed input:

`{ message, session_id? }`

Unknown fields and control characters are rejected. Message size is bounded. Optional session IDs follow RESTAP shape and entropy requirements and provide continuity only.

The server creates or resolves a namespace scoped to protocol RESTAP, token #3802, and an unguessable public session. Public inference receives only #3802's immutable public identity, owner-approved public fields, public Codex results, and that session's public turns.

It cannot call owner reads, wallet proposals, activation/message handlers, XMTP, or private Sibyl. JSON ships first; SSE is deferred until JSON conformance is proven.

### Passive `/news`

The no-reply rule is structural: news handlers receive no inference or outbound-message dependency.

`GET /news`:

- existing authenticated Console owner session required;
- current #3802 owner/controller authority re-read;
- bounded pagination;
- no cross-token items.

`POST /news`:

- allowlisted external agent required;
- closed bounded item schema;
- signed request over method, canonical path, body hash, timestamp, and nonce;
- signer resolved to allowlisted identity and, when applicable, ERC-8004 controller;
- strict skew and one-time nonce replay protection;
- stores the item and returns acknowledgment only;
- never invokes inference, XMTP, webhook, or another RESTAP endpoint.

Authentication is application policy outside RESTAP and is declared in discovery. No API key appears in URLs or browser code.

### News store

Use the configured API SQLite database with additive migrations for sender identity, verified signer, canonical body/body hash, received time, optional opaque correlation ID, nonce hash, and replay expiry. Token ID is fixed to 3802 during the canary.

Writes are transactional with unique sender/nonce constraints. Payloads and retention are bounded; no raw secret is stored.

## Surface boundaries

| Surface | Audience | Context | Reply behavior | Authority |
|---|---|---|---|---|
| Console | Current owner | Private runtime, permitted wallet context, private memory | Interactive | Existing owner controls |
| XMTP | Current holder/runtime | Holder-bound thread and private memory | Interactive | Existing owner/controller checks |
| RESTAP `/talk` | Rate-limited public clients | Public identity, public Codex, isolated session | Interactive | None |
| RESTAP `/news` | Allowlisted writers / owner reader | Passive bounded items | Never replies | Store/read only |

Identifiers cannot cross namespaces to gain access.

## Security and failure behavior

Separate feature gates control Codex API, Console Codex UI, RESTAP discovery, public talk, news read, and news write. RESTAP refuses startup unless the canary token, stores, schemas, and policy initialize successfully.

Public talk uses per-IP and per-session token buckets, a global concurrency ceiling, timeout, output limit, and daily budget. Proxy identity is trusted only from the reviewed reverse-proxy boundary.

External content remains untrusted. Callers cannot select tools/internal routes. Public input cannot reach later owner prompts. Model output cannot alter identity, skills, allowlists, policy, or Codex records. Logs redact session IDs, cookies, signatures, and full messages.

Failures:

- invalid Codex artifact: Codex routes disabled; no guessed facts;
- unsupported query: bounded explanation without fabricated data;
- rate limit: `429`;
- invalid session: `400 invalid_session_id`;
- news auth failure: uniform `401/403` without signer enumeration;
- duplicate nonce: deterministic replay handling;
- provider timeout: bounded `503`, never private fallback;
- database failure: no partial news write or reply side effect.

## Data flow

### Build

1. Materialize reviewed metadata/Codex snapshot.
2. Verify all 7,777 contiguous IDs and source hashes.
3. Normalize aliases through existing compiler rules.
4. Compute postings, frequencies, identity projections, and similarity.
5. Emit canonical files and manifest.
6. Independently re-read and verify output.
7. Pin artifact hash in release configuration.

### Console query

1. Owner selects a Looper through existing auth.
2. API classifies a closed Codex operation.
3. Query service returns deterministic facts/evidence.
4. API sends bounded context to inference.
5. Decoder validates text and provenance.
6. Console renders answer and evidence.

### RESTAP talk

1. Apply body/rate/concurrency limits.
2. Validate closed request schema.
3. Create or resolve isolated public session.
4. Run closed public Codex routing.
5. Run public-only inference.
6. Validate and return RESTAP JSON.

### RESTAP news write

1. Validate path, content type, timestamp, nonce, body, and schema.
2. Verify signature and allowlist.
3. Atomically reserve nonce and store item.
4. Return acknowledgment without model, memory recall, outbound transport, or reply.

## Testing

### Artifact

- exactly 7,777 contiguous tokens;
- repeat builds produce identical semantic hash;
- source/alias drift fails;
- exact trait totals and percentages;
- deterministic similarity/tie order;
- malformed or oversized input fails closed;
- no secrets, private paths, or placeholders.

### Codex service

- all closed operations and bounds;
- unknown tokens/traits;
- exact comparisons/combinations;
- fact versus interpretation labeling;
- no model/network dependency;
- hostile filters cannot become regex, SQL, URLs, or paths.

### Console

- selected token receives only its verified profile;
- customization cannot overwrite canonical identity;
- recommendations do not enable skills;
- transfer invalidates owner-scoped state;
- malformed model output cannot create facts/capabilities;
- desktop/mobile accessibility and no overflow.

### RESTAP

- discovery conformance and base-path resolution;
- JSON talk with/without continuity;
- session entropy, isolation, TTL, and redaction;
- public talk cannot reach private memory, wallet, proposals, activation, XMTP, or owner reads;
- payload, injection, rate, timeout, and concurrency limits;
- signed news canonicalization, allowlist, skew, replay, and concurrency;
- news write has no inference/outbound dependency and never replies;
- news read repeats current owner authorization;
- transfer revokes prior-owner read access;
- database failure has no partial side effect.

### Release gate

Run sequentially:

1. focused tests;
2. full API suite;
3. canonical web build;
4. full web suite against fresh output;
5. desktop/mobile browser smoke;
6. RESTAP HTTP smoke and authorization negatives;
7. canary stability/log check.

## Rollout and rollback

1. Ship Codex artifact/query service with gates disabled.
2. Prove artifact/API in a release canary.
3. Enable authenticated Console Codex.
4. Enable RESTAP discovery for #3802.
5. Enable bounded JSON talk.
6. Enable signed news for one reviewed sender.
7. Enable owner news read.
8. Separately review ERC-8004 RESTAP service publication after HTTP proof.

Each gate disables independently without changing Console/XMTP. Previous API, web, database, and Codex releases remain restorable. Migrations are additive; rollback disables routes without discarding accepted news/replay records.

## Acceptance criteria

- Verified artifact contains all 7,777 Loopers and rebuilds identically.
- Every Looper has deterministic facts and trait statistics.
- Console explains, compares, searches, and finds similar Loopers with evidence.
- Canonical identity remains separate from owner operations.
- Skill recommendations never imply enablement.
- #3802 serves valid RESTAP discovery and bounded JSON talk.
- Public talk is isolated from owner memory, wallet context, proposals, XMTP, and controls.
- Signed news is replay-safe and never replies.
- Current owner authorization is required to read news.
- Full tests, build, mobile/desktop smoke, authorization negatives, and canary stability pass.

## Implementation slices

1. Snapshot and deterministic Codex artifact compiler.
2. Pure query service and evidence schemas.
3. Intent routing and inference envelope.
4. Console Codex panel and recommendation states.
5. RESTAP discovery for #3802.
6. Isolated public JSON talk and limits.
7. Signed passive news store and owner read.
8. Integrated security, browser, canary, and release gates.

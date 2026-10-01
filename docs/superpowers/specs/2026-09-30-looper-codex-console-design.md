# Looper Codex Console Integration Design

**Date:** 2026-09-30  
**Status:** Approved for implementation  
**Branch:** `feature/looper-codex-console`

## Goal

Make the verified Looper Codex visible and useful in the production Multipass Console without coupling it to RESTAP. A wallet owner can inspect the selected owned Looper before activation. Activated chat uses the same verified identity and can answer bounded collection questions through deterministic Codex queries. RESTAP later consumes this server-owned boundary rather than duplicating artifact logic.

## Locked product decisions

- The Console shows both a visible Codex panel and Codex-grounded chat.
- The panel is available after wallet authentication and ownership verification, before activation.
- Chat remains activation-gated.
- The panel is compact by default, with expandable traits, personality, lore, rarity, and similar-Looper sections.
- All seven Codex operations are available now. RESTAP is a later general-purpose coordination layer that may reuse them for discovery, groups, and news.
- The browser never downloads or parses the 60 MB artifact.

## Architecture

### Server-owned runtime

The API process owns one optional Codex runtime:

1. `server.js` reads `MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH`.
2. During bootstrap, a small API adapter calls `loadLooperCodexArtifact` and `createLooperCodexQueryService` from `@helixa/loopers-codex` exactly once.
3. Before loading, the adapter requires the reviewed release's serialized SHA-256 `aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073`; after loading it requires semantic artifact hash `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`. A different but internally coherent artifact is unavailable, not accepted.
4. A valid artifact produces one frozen runtime contract: `{ available:true, status, query(operation,input), getProfileContext(tokenId) }`. `status` is exactly `{ available:true, schemaVersion, artifactHash, codexVersion, count }`. `query` dispatches a closed operation; `getProfileContext` returns the bounded prompt projection described below.
5. An absent or invalid artifact produces `{ available:false, status:{ available:false, reason:'not_configured'|'invalid_artifact' }, query, getProfileContext }`; both methods throw a typed unavailable error. The API and existing Console continue running. The internal status drives chat capability registration; the authenticated query route communicates availability to the browser through success or stable `503 codex_unavailable` responses. There is no public status route.
6. The runtime artifact remains an external release file. It is not bundled into web assets, committed to Git, or returned wholesale by any route.

`apps/api` declares a workspace dependency on `@helixa/loopers-codex`. The Codex package remains pure and does not import API, Console, model, wallet, database, or RESTAP code.

### Authenticated API boundary

Add one closed dispatcher endpoint:

`POST /api/multipass/console/codex/query`

The request is exactly:

```json
{
  "selectedTokenId": "3802",
  "operation": "getTokenProfile",
  "input": { "tokenId": 3802 }
}
```

Rules:

- A valid Console session and CSRF token are mandatory.
- `selectedTokenId` must be a canonical ID and `loopersAuthorizer` must prove the authenticated wallet controls it. Activation is not required.
- `operation` is one of the seven exact Codex method names.
- `input` uses these exact closed schemas and positional mappings:
  - `getTokenProfile`: `{ tokenId:integer }` → `getTokenProfile(tokenId)`;
  - `explainTraits`: `{ tokenId:integer }` → `explainTraits(tokenId)`;
  - `compareTokens`: `{ leftTokenId:integer, rightTokenId:integer }` → `compareTokens(leftTokenId,rightTokenId)`;
  - `findByTraits`: `{ filters:Trait[], cursor?:string|null, limit?:integer }` → omitted cursor defaults to `null`, omitted limit to 25;
  - `findSimilar`: `{ tokenId:integer, limit?:integer }` → omitted limit defaults to 10;
  - `getTraitStats`: `{ traitType:string, value:string }` → `getTraitStats(traitType,value)`;
  - `getCollectionSummary`: `{}` → `getCollectionSummary()`.
- `Trait` is exactly `{ type:string, value:string }`; all integer/string/filter/cursor bounds are those already locked by the foundation. Optional keys may be omitted only where shown. Every other unknown or missing key rejects.
- `selectedTokenId` is the owner-authorized Console context, not an implicit query argument. Panel calls use that same token ID. Explicit collection chat commands may reference other valid public token IDs after the selected owned Looper establishes the authenticated context.
- The response returns the unchanged, deeply frozen Codex envelope as JSON. It retains `artifactHash`, `codexVersion`, subject IDs, and evidence labels.
- Request bodies, strings, arrays, limits, and cursors inherit the Codex bounds. The route uses a dedicated 16 KiB body cap, the existing trusted-origin/session/CSRF checks, and fixed-window limits of 120 queries per authenticated wallet/selected token per minute and 1,200 total queries per minute. It never invokes a model.

A thin API adapter maps closed request objects to positional service calls. It does not reproduce query math or reshape evidence.

### Console client and state

Add a dedicated client module that sends one operation at a time and validates the outer response before returning it. Browser state is keyed by `selectedTokenId + artifactHash` and has explicit states: `idle`, `loading`, `ready`, `unavailable`, and `error`.

Selection and activation become separate explicit states. Today selection immediately activates; this branch changes that state machine:

1. Selecting a roster/gallery Looper sets `consoleSelectedAgentId`, invalidates prior thread/Codex request IDs, closes roster drawers, loads its wallet and Codex, persists the last selection, and defaults the workspace to Codex. It does **not** call the activation endpoint.
2. The unactivated Chat workspace renders an “Activate chat” gate. Only that button calls the existing activation endpoint. Successful activation marks the selected thread active and opens Chat; failure leaves selection/Codex intact and exposes activation retry.
3. Reload/default-last-selection performs selection only. Switching Loopers resets the visible thread to inactive even if a server runtime for the old Looper still exists. Activation retry never changes selection. Codex retry never activates chat.
4. On selection, fetch `getTokenProfile`, `explainTraits`, and `findSimilar` concurrently for that selected token.
5. Discard late responses unless wallet session generation, selected token ID, and Codex request ID all still match.
6. Cache bounded responses in memory for the current authenticated session keyed by `selectedTokenId + artifactHash`; clear the cache on wallet/session change and never persist it in local storage.
7. Retry Codex only through an explicit user action after an error.

Trait stats are already present in explanations and are loaded on demand through `getTraitStats` only when the UI needs the complete matching-token list. Collection search/compare/summary remain available to chat and future UI controls without bloating the initial panel.

## Console UX

Add a fourth workspace tab named **Codex** beside Chat, Wallet, and Multipass. It is enabled whenever an owned Looper is selected and the wallet session is authenticated; activation state does not affect it.

The initial view contains:

- compact identity header: canonical name, primary/secondary class, specialization, risk, autonomy, and “Verified Codex” status;
- artifact proof line showing a shortened artifact hash and Codex version;
- collapsed drawers for:
  - **Visual traits** — reviewed order, exact frequency and ppm;
  - **Personality** — voice, values, communication style, humor, quirks, and mission bias;
  - **Lore** — origin, short/long lore, activation seed, and first mission(s);
  - **Rarity** — per-trait rational count and percentage, explicitly labeled collection facts rather than a synthetic rarity rank;
  - **Similar Loopers** — deterministic top ten with score ppm, shared traits, and token IDs.

Recommendations are labeled **Recommended skill families** and retain `status: recommended`; the UI never presents them as installed or enabled.

Loading uses fixed-height skeletons to avoid layout shift. An unavailable artifact shows “Codex unavailable” with no fabricated fallback. A failed request exposes a retry control and keeps Chat/Wallet/Multipass usable. Mobile uses the existing mutually exclusive workspace navigation and drawer styles; no modal or separate page is introduced.

## Chat grounding and collection queries

### Selected identity

On every activated message, the API retrieves `getTokenProfile(selectedTokenId)` from the in-memory service and projects a bounded read-only context into the runtime profile. This supersedes the narrower metadata persona when available while preserving the existing trusted-data rule: Codex text is descriptive evidence, never instructions.

The model prompt receives:

- canonical identity/class/specialization;
- bounded risk, autonomy, voice, values, communication style, humor, lore summary, mission bias, and first mission;
- visual traits and evidence labels;
- artifact hash and Codex version;
- recommended skill families explicitly marked recommended-not-enabled.

No postings, entire collection arrays, source paths, private data, owner address, or artifact bytes enter the prompt.

### Deterministic collection reads

Extend the existing closed read-intent architecture with a separate `codex` skill/intent resolver and executor. Explicit slash commands are canonical:

- `/codex profile 3802`
- `/codex explain 3802`
- `/codex compare 3802 614`
- `/codex find Background=Alpha [and Patch Artifact=Nyan Cat]`
- `/codex similar 3802 [limit 10]`
- `/codex stats Background=Alpha`
- `/codex summary`

A small closed natural-language grammar recognizes only these equivalent families: profile/explain for an explicit `#ID` or “mine/this Looper”; compare two explicit IDs; find one to twelve exact `type=value` pairs; similar to an explicit ID or the selected Looper with an optional integer limit; stats for one exact `type=value`; and collection summary. “Mine” and “this Looper” always resolve to `selectedTokenId`. Multiple unmatched clauses, missing trait delimiters, conflicting IDs, or any write-like language reject deterministic routing and fall through to grounded chat.

A recognized Codex read never calls the model. It executes before normal generation, formats a bounded deterministic assistant message, persists that message with `skillRefs:['codex']`, and returns the usual Console message result plus a top-level `codex` field containing the exact immutable envelope: `{ ...existingResult, codex: envelope }`. The model prompt explicitly forbids invented collection counts, rarity, comparisons, or similarity when no Codex envelope was executed. Ambiguous requests therefore receive ordinary identity-grounded prose without fabricated collection facts.

The Codex skill has no credentials, writes, wallet authority, installation behavior, or executable proposals. Its enabled capability is `read_verified_looper_codex` when and only when the adapter is available.

## Failure and safety behavior

- Missing path: Codex disabled, API remains healthy.
- Non-regular file, symlink, oversized file, malformed JSON, serialized SHA mismatch, semantic hash mismatch, stale hash, source/version drift, or derived-index corruption: adapter unavailable and no partial data exposed.
- Unauthenticated request: existing `401` session response.
- CSRF failure: existing `403` response.
- Selected token not wallet-controlled: `403` without indicating other ownership details.
- Invalid operation/input/cursor/limit/trait: bounded `400` response.
- Query service exception after bootstrap: bounded `503 codex_unavailable`; no fallback model guess.
- Client selection/session changes: stale response ignored.
- Logs contain operation, selected token ID, status, duration, schema/hash prefix, and error class only—never lore, traits, prompts, source paths, cookies, or artifact content.

## Testing

### Codex API adapter

- Loads a valid artifact once and exposes status metadata.
- Degrades on absent and every invalid artifact class.
- Dispatches all seven operations with exact closed inputs.
- Rejects unknown keys, invalid selected IDs, hostile traits/cursors, and over-limit values.
- Preserves exact envelope/evidence/hash fields.

### API routes and chat runtime

- Session and CSRF required.
- Ownership required but activation not required for query route.
- Chat still requires activation.
- Selected profile is projected into the runtime prompt without source paths, owner data, or enabled recommendations.
- Every recognized Codex command executes deterministically without calling the model.
- Ambiguous requests cannot manufacture stats/similarity claims.
- Missing/invalid Codex leaves non-Codex Console routes healthy.

### Web client/UI

- Late responses cannot cross wallet or token selection changes.
- Compact summary and all five drawers render exact data and evidence labels.
- Recommended skills never render as enabled.
- Loading, unavailable, error, retry, empty-similarity, and ready states render safely.
- Desktop and mobile expose four mutually exclusive workspaces without overflow.
- No artifact URL or artifact-sized payload reaches the browser.

### Final proof

- Full API and web suites.
- Existing wallet/persona/Console regression suites.
- Full 7,777-artifact proof for Looper #3802.
- Browser smoke test at desktop and 390px mobile.
- Production build and immutable release preflight.
- Live authenticated owner smoke: select owned Looper, view Codex before activation, activate, ask identity and collection questions, verify artifact hash/evidence, and confirm no regressions in Chat/Wallet/Multipass.

## Deployment and rollback

Deploy the API and web from one immutable commit/release with the verified artifact copied as a regular release file and `MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH` pointing to it. The release preflight requires byte size 60,203,971, serialized SHA-256 `aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073`, semantic hash `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`, count 7,777, and successful full proof. Startup records load duration and process RSS delta without artifact content or paths. Preflight imports and proof commands must run from that exact release working directory. Promote only after API health, static hashes, process stability, authenticated owner reads, and responsive screenshots pass.

Rollback restores the prior API service unit/environment and prior static asset set together. The artifact is additive and read-only; rollback performs no data migration. RESTAP and GitHub branch cleanup remain separate work.

## Non-goals

- No RESTAP implementation in this branch.
- No public unauthenticated Codex API.
- No browser-side artifact or query engine.
- No synthetic rarity score or rank.
- No wallet writes, skill installation, automatic activation, or recommendation enablement.
- No GitHub branch deletion or repository cleanup.

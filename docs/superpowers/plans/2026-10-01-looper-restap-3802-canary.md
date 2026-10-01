# Looper RESTAP #3802 Canary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a feature-gated RESTAP `0.1.4-beta` HTTP canary for Looper #3802 with public discovery and isolated JSON talk, replay-safe signed passive news writes, and current-owner-only news reads.

**Architecture:** Add one closed RESTAP adapter beside the existing Console/XMTP runtime, never through it. The adapter projects only the pinned Looper #3802 Codex canonical name/image plus the current owner/controller’s protected public policy into a dedicated bounded public-talk runtime; the current #3802 owner and ERC-8004 controller are re-resolved before every discovery, talk, and news-write request, and every owner read. Signed news binds sender ID and signer cryptographically and uses a separate additive SQLite store. Four independent off-by-default gates (discovery, talk, news write, news read) are wired at startup, with fail-closed dependency validation and rollback by gate disablement rather than data deletion.

**Tech Stack:** Node.js ESM, built-in `node:http`/`node:crypto`/`node:sqlite`, viem signature and Base reads, existing `@helixa/loopers-codex` runtime, Bankr LLM gateway, Node test runner, pnpm workspaces, bash release/smoke scripts.

**Design spec:** `docs/superpowers/specs/2026-09-30-looper-codex-restap-canary-design.md`  
**Starting point:** `caab626` (Codex foundation and Console integration are already live).  
**Protocol pin:** RESTAP `0.1.4-beta` at upstream commit `5d7222692a0d1c53fbb03091b94de6c732cac2bc` (`https://github.com/LiamVisionary/restap/tree/5d7222692a0d1c53fbb03091b94de6c732cac2bc`).

---

## Scope guardrails

- Implement only Looper #3802. Reject every other token at routing, policy, storage, and discovery boundaries.
- Do not modify, reactivate, or revisit the shelved ERC-6551 wallet issue or any wallet mutation/proposal path.
- Do not publish or change the ERC-8004 registration service entry in this plan. Discovery may report the already-known identity reference; service publication is a later, separately reviewed action after HTTP proof.
- Do not reuse Console sessions, runtime activation, Sibyl namespaces, XMTP threads, wallet context, proposals, enabled skills, installed `SKILL.md` files, or tool executors for public talk.
- Do not add RESTAP tool invocation, delegation, orchestration, SSE, x402, payments, public `GET /news`, or a browser-held sender secret.
- Treat RESTAP `session_id` only as a public continuity bearer. It never authenticates news or owner reads.
- Preserve all existing Console/XMTP/Codex behavior. Every RESTAP gate defaults false.

## File structure

- Create `apps/api/src/restap-3802-contracts.js`: protocol/source pins, canary route constants, exact schemas, canonical JSON, bounded request/response normalization, and discovery document builder.
- Create `apps/api/fixtures/restap/restap-0.1.4-beta-minimal.json`: checksum-pinned, provenance-bearing minimal upstream shape evidence; no upstream runtime code.
- Create `apps/api/test/restap-3802-contracts.test.mjs`: pinned RESTAP source/fixture checksums, emitted-shape compatibility, discovery/base-path resolution, exact keys, size/control-character bounds, and canonicalization tests.
- Create `apps/api/src/restap-public-sessions.js`: hashed in-memory session namespace for `restap:looper:3802`, mint/resolve, TTL, turn/history caps, and bounded eviction.
- Create `apps/api/test/restap-public-sessions.test.mjs`: entropy, isolation, expiry, eviction, redaction, and no-auth semantics.
- Create `apps/api/src/restap-public-talk.js`: closed Codex intent routing, public-only inference orchestration, timeout/output decoder, and a dedicated no-tools Bankr client.
- Create `apps/api/test/restap-public-talk.test.mjs`: deterministic Codex, isolated continuity, unsupported-query, provider-failure, and private-dependency sentinel tests.
- Create `apps/api/src/restap-3802-policy.js`: fail-closed current-owner/current-controller policy loader, Codex canonical-identity projection, owner-approved public presentation, allowlisted sender policy, and fresh authority resolution.
- Create `apps/api/fixtures/restap/looper-3802-policy.example.json`: non-secret example policy with no production sender/signature material.
- Create `apps/api/test/restap-3802-policy.test.mjs`: file safety/schema/canary/sender/controller validation.
- Create `apps/api/src/restap-news-auth.js`: canonical signed-request message, skew/nonce/header checks, allowlist lookup, EOA/EIP-1271 verification, and optional ERC-8004 current-controller verification.
- Create `apps/api/test/restap-news-auth.test.mjs`: canonicalization, tamper, skew, allowlist, smart-wallet, controller, and uniform-failure tests.
- Create `apps/api/src/restap-news-store.js`: additive STRICT SQLite tables, atomic nonce reservation/item insert, bounded owner pagination, retention, and lifecycle.
- Create `apps/api/test/restap-news-store.test.mjs`: migration, persistence, replay/concurrency, rollback, token isolation, pagination, and retention tests.
- Create `apps/api/test/restap-3802-api.test.mjs`: end-to-end route, gate, auth, rate, timeout, privacy, logging, and failure-mapping tests through `createMultipassApi`.
- Modify `apps/api/src/index.js`: route the exact RESTAP base, apply independent gates/limits, require fresh current-owner/controller policy authorization on discovery/talk/news write and fresh Console owner/controller auth for reads, and keep news handlers structurally inference/outbound-free.
- Modify `apps/api/src/index.d.ts`: declare the new injected policy, talk runtime, news store, controller verifier, feature gates, and bounded limit options.
- Modify `apps/api/src/server.js`: parse gates/config, sanitize proxy identity, initialize/validate RESTAP dependencies before listen, inject resources, and close the news store.
- Modify `apps/api/test/server.test.mjs`: defaults/config validation, trusted-proxy behavior, startup refusal, injection, and close tests.
- Modify `apps/api/README.md`: server-only RESTAP configuration and local proof commands.
- Create `apps/api/scripts/smoke-looper-restap-3802.mjs`: deterministic local/live HTTP conformance and authorization-negative smoke without printing secrets.
- Create `apps/api/test/restap-3802-smoke.test.mjs`: smoke CLI contract, local/remote behavior, negatives, and redaction tests.
- Create `apps/api/test/restap-3802-canary-launcher.test.mjs`: immutable-release launcher, gate-order, and containment tests.
- Create `apps/api/test/restap-3802-promotion.test.mjs`: inspect-first promotion, config merge, backup, and rollback tests.
- Create `apps/api/test/restap-3802-runbook.test.mjs`: documentation and exact release-command contract tests.
- Create `apps/api/scripts/run-looper-restap-3802-canary.sh`: exact-release unrouted launcher with protected policy/DB inputs and all gates disabled unless explicitly selected.
- Modify `apps/api/package.json`: named focused smoke command only; no new runtime package.
- Create `scripts/promote-looper-restap-3802.sh`: inspect-first, backup-first, approval-bounded gate promotion and verified rollback around the existing service.
- Create `docs/loopers/looper-restap-3802-canary.md`: contract, auth, limits, gates, evidence, rollout order, monitoring, and rollback runbook.

## Dependency and ownership map

- Tasks 1, 2, 3, and 5 are bounded modules. After Task 1 lands, Tasks 2 (sessions), 3 (policy/auth), and 5 (SQLite store) may be delegated independently, with at most one builder and one reviewer active at a time.
- Task 4 depends on Tasks 1–2 and the already-live Codex runtime. It must not wait on news work.
- Task 6 integrates discovery/talk; Task 7 adds news routes after Task 6 is green. No earlier task edits `apps/api/src/index.js` or `apps/api/src/server.js`, preventing overlapping ownership.
- Task 8 owns startup/resource wiring after Tasks 6–7; Task 9 then owns only proxy identity sanitization.
- Tasks 10–14 are sequential security, smoke, canary, promotion, and runbook/release gates. Do not start deployment work before all focused and full local gates pass.
- Each task ends in its own reviewable commit. Do not combine tasks or defer RED/GREEN verification to the end.

---

## Chunk 1: Closed protocol, sessions, and sender policy

### Task 1: Pin RESTAP contracts and generate bounded discovery

**Files:**
- Create: `apps/api/src/restap-3802-contracts.js`
- Create: `apps/api/fixtures/restap/restap-0.1.4-beta-minimal.json`
- Test: `apps/api/test/restap-3802-contracts.test.mjs`

- [ ] **Step 1: Write failing protocol-contract tests**

Import the missing module and assert these exported invariants:

```js
assert.equal(RESTAP_VERSION, '0.1.4-beta');
assert.equal(RESTAP_UPSTREAM_COMMIT, '5d7222692a0d1c53fbb03091b94de6c732cac2bc');
assert.equal(RESTAP_CANARY_TOKEN_ID, '3802');
assert.equal(RESTAP_BASE_PATH, '/api/restap/loopers/3802');
```

Pin and test the real upstream evidence, not a remembered shape:

- repository/commit: `https://github.com/LiamVisionary/restap/tree/5d7222692a0d1c53fbb03091b94de6c732cac2bc`;
- `README.md`: `https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/README.md`, SHA-256 `e94a4ea4b90417760019e314e9b03bf730c1ad519b4b9cbecab77b234f2a3943`;
- `src/types.ts`: `https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/src/types.ts`, SHA-256 `8f7ffe519b7a0cefb6265223ecded251ee3b2893051f37c3ebaedcd05ab8ee30`;
- `package.json`: `https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/package.json`, SHA-256 `d515f98219ec23bef95eccd507c87e88174201a8d7a4d44b666982f97b62bee6`; it declares version `0.1.4-beta` and license `MIT`. The pinned commit contains no `LICENSE`, `LICENSE.md`, or `COPYING` file, so record that fact rather than inventing license text.

Create the fixture with exactly these facts and minimal `RestapCatalog`, `TalkRequest`, `TalkResponse`, `NewsPostRequest`, and `NewsResponse` required/optional key lists transcribed from the pinned `src/types.ts`. Its exact pretty-printed bytes (including one trailing LF) must be SHA-256 `5df3a690efd6440ab7716cfe16356a7494a5d3fb1d0db50569f838f1a837953f` and 1,608 bytes. Its `_provenance` must include the three raw URLs/checksums above, `licenseDeclared: "MIT"`, `licenseEvidence: "package.json#license"`, `licenseFileAtCommit: false`, and `transcription: "independently-authored minimal conformance fixture; no upstream runtime code"`. Tests read the checked-in fixture bytes and fail on checksum, provenance, version, commit, shape-list, or license-evidence drift; they make no network request. The exact file is:

```json
{
  "_provenance": {
    "repository": "https://github.com/LiamVisionary/restap",
    "commit": "5d7222692a0d1c53fbb03091b94de6c732cac2bc",
    "version": "0.1.4-beta",
    "readmeUrl": "https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/README.md",
    "readmeSha256": "e94a4ea4b90417760019e314e9b03bf730c1ad519b4b9cbecab77b234f2a3943",
    "typesUrl": "https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/src/types.ts",
    "typesSha256": "8f7ffe519b7a0cefb6265223ecded251ee3b2893051f37c3ebaedcd05ab8ee30",
    "packageUrl": "https://raw.githubusercontent.com/LiamVisionary/restap/5d7222692a0d1c53fbb03091b94de6c732cac2bc/package.json",
    "packageSha256": "d515f98219ec23bef95eccd507c87e88174201a8d7a4d44b666982f97b62bee6",
    "licenseDeclared": "MIT",
    "licenseEvidence": "package.json#license",
    "licenseFileAtCommit": false,
    "transcription": "independently-authored minimal conformance fixture; no upstream runtime code"
  },
  "discovery": {
    "required": ["restap_version", "agent", "capabilities"],
    "agentRequired": ["name", "contact"],
    "capabilityRequired": ["id", "title", "method", "endpoint"]
  },
  "talk": {
    "requestRequired": ["message"],
    "requestOptional": ["session_id"],
    "responseRequired": ["reply"],
    "responseOptional": ["session_id", "suggested_actions"]
  },
  "news": {
    "postRequired": ["type"],
    "postOptional": ["from", "in_reply_to", "message", "data", "session_id"],
    "responseRequired": ["items"],
    "responseOptional": ["timestamp"]
  }
}
```

Cover:

- discovery resolves from public base `https://helixa.xyz/multipass-api` to exactly `https://helixa.xyz/multipass-api/api/restap/loopers/3802`, with capabilities at relative `/talk` and `/news` paths;
- agent data uses `identity.canonicalName` and `identity.image.url` from the verified Codex #3802 profile as the only name/image source and includes the required RESTAP public `contact`; all owner policy presentation, current ERC-8004 identity reference, and Codex schema/hash/version fields live only beneath one documented `x_helixa` extension object, and policy cannot override canonical name/image;
- each capability keeps only upstream `id`, `title`, `method`, and `endpoint` at its core; JSON formats, authentication requirements, schemas, payload limits, rate limits, and `sessions.supported: true` live only beneath a documented `x_helixa` extension object; no capability advertises streaming, tools, delegation, wallet, payments, Console, XMTP, or private memory;
- talk accepts exactly `{message, session_id?}`, rejects unknown keys/control characters, caps `message` at 2,000 UTF-8 bytes, and validates only server-minted base64url session IDs;
- news accepts exactly RESTAP-compatible `{type,message?,data?,in_reply_to?,session_id?}`, caps the canonical body at 16 KiB, limits strings/arrays/object depth, and rejects executable/prototype/sensitive keys;
- canonical JSON recursively sorts object keys, preserves array order, rejects non-JSON values/duplicate semantic fields, and produces stable UTF-8 bytes and SHA-256;
- talk output is exactly bounded upstream-compatible `{reply,session_id}`; owner news output keeps upstream `{items,timestamp}` plus optional documented `x_helixa_next_cursor`; write acknowledgment is the intentional documented Helixa extension `202 {x_helixa_accepted:true,x_helixa_item_id,x_helixa_received_at}` and contains no agent reply;
- every normalized object is plain immutable data and the discovery document validates against its own declared shapes;
- emitted discovery contains all pinned `RestapCatalog` required keys. Tests separately prove (a) the upstream-compatible core keys/types against the checked-in fixture and (b) an exact allowlist of namespaced Helixa extensions: discovery/agent/capability `x_helixa`, owner-news `x_helixa_next_cursor`, and the three `x_helixa_*` write-acknowledgment keys. No unnamespaced extra key is permitted, and the write acknowledgment is never described as an upstream response subset.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-3802-contracts.test.mjs`  
Expected: FAIL because `restap-3802-contracts.js` does not exist.

- [ ] **Step 3: Implement the minimum closed contract module**

Define these exact public limits and use them in both validation and discovery:

```js
export const RESTAP_LIMITS = Object.freeze({
  talkBodyBytes: 8 * 1024,
  talkMessageBytes: 2_000,
  talkReplyBytes: 4_096,
  newsBodyBytes: 16 * 1024,
  newsPageDefault: 20,
  newsPageMax: 50,
  signatureSkewSeconds: 300,
});
```

Build the canonical external path from the configured public base pathname; the signature path must be `/multipass-api/api/restap/loopers/3802/news` in production, never the internal proxy path guessed from headers. Parse the checksum-pinned fixture locally for tests and source constants, but do not fetch at runtime, add the upstream package, or copy its general-purpose server. Preserve the recorded upstream discrepancy that `src/server.ts` emits demo value `1.0`; conformance version comes from pinned README/package `0.1.4-beta`, while wire shapes come from pinned `src/types.ts`.

- [ ] **Step 4: Run GREEN**

Run: `node --test apps/api/test/restap-3802-contracts.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/restap-3802-contracts.js apps/api/fixtures/restap/restap-0.1.4-beta-minimal.json apps/api/test/restap-3802-contracts.test.mjs
git commit -m "feat: define RESTAP 3802 contracts"
```

### Task 2: Add bounded isolated public-session continuity

**Files:**
- Create: `apps/api/src/restap-public-sessions.js`
- Test: `apps/api/test/restap-public-sessions.test.mjs`

- [ ] **Step 1: Write failing session-store tests**

Exercise an injected clock and RNG. Require:

- server-minted IDs use 32 random bytes (at least 256 bits) encoded base64url without padding;
- the raw ID is never retained unhashed; it is returned in each protocol response as RESTAP continuity requires, while only SHA-256 is retained as the map key and logs/status never expose it;
- namespace is fixed internally to `restap:looper:3802`; callers cannot provide protocol, token, owner, wallet, agent, or memory namespaces;
- resolve accepts only a previously minted, unexpired ID; malformed/unknown/expired IDs become `invalid_session_id` rather than creating a chosen namespace;
- 30-minute sliding TTL, at most 12 turns (24 messages), 2,000 bytes per user turn, 4,096 bytes per assistant turn, and 10,000 live sessions;
- oldest-expiry eviction is bounded; expired entries are swept; returned histories are cloned/frozen;
- two sessions cannot observe each other's turns and restart creates an empty store;
- no cookie, signature, wallet, owner, IP, Console/XMTP identifier, or arbitrary metadata can be stored.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-public-sessions.test.mjs`  
Expected: FAIL because the session module does not exist.

- [ ] **Step 3: Implement the bounded in-memory store**

Export only:

```js
export function createRestapPublicSessionStore({ now, randomBytesImpl, ttlMs, maxSessions } = {}) {
  return { create(), resolve(sessionId), appendTurn(sessionId, { user, assistant }), close() };
}
```

Use hashed lookup keys and a bounded insertion/expiry structure. `close()` clears all public turns. Do not use Sibyl, SQLite, the Console runtime registry, or the Console auth store.

- [ ] **Step 4: Run GREEN**

Run: `node --test apps/api/test/restap-public-sessions.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/restap-public-sessions.js apps/api/test/restap-public-sessions.test.mjs
git commit -m "feat: isolate RESTAP public sessions"
```

### Task 3: Load public policy and authenticate allowlisted news senders

**Files:**
- Create: `apps/api/src/restap-3802-policy.js`
- Create: `apps/api/src/restap-news-auth.js`
- Create: `apps/api/fixtures/restap/looper-3802-policy.example.json`
- Test: `apps/api/test/restap-3802-policy.test.mjs`
- Test: `apps/api/test/restap-news-auth.test.mjs`

- [ ] **Step 1: Write failing policy-loader tests**

Require `loadRestap3802Policy({policyPath})` to reject absent, symlinked, non-regular, group/world-writable, oversized (>64 KiB), malformed, unknown-key, wrong-token/chain/collection/registry, invalid authority address/agent ID, duplicate-sender, and empty-required-public-profile files. The accepted root is exact (example addresses are intentionally non-production):

```json
{
  "schemaVersion": "1.0.0",
  "tokenId": "3802",
  "authority": {
    "chainId": 8453,
    "collection": "0x1649CD37f4748807b4882FC48765bA0B2aFfa94a",
    "owner": "0x1111111111111111111111111111111111111111",
    "erc8004Registry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    "erc8004AgentId": "1",
    "controller": "0x1111111111111111111111111111111111111111"
  },
  "publicProfile": {
    "displayName": "Owner-approved bounded public name",
    "publicConversationEnabled": true,
    "biography": "Owner-approved bounded public text",
    "mission": "Owner-approved bounded public text",
    "voicePresentation": "Owner-approved bounded public text"
  },
  "newsSenders": []
}
```

The protected production policy must pin the owner and ERC-8004 controller observed during owner review. A fresh injected authority resolver returns exact `{chainId,contract,tokenId,owner,erc8004AgentId,controller,controllerVerified}`. `authorizeRestap3802Policy` must re-read it, require every pinned authority field to match, require `controllerVerified === true`, and require `publicConversationEnabled === true`. It also reads the verified Codex profile for token `3802` and constructs canonical identity only from `identity.canonicalName` and `identity.image.url`; the owner policy cannot supply or override either. Authority mismatch/transfer/disabled policy is a typed not-authorized result; chain/Codex outage is a typed unavailable result. Freeze results and never log addresses, the path, or document.

A sender entry is exact `{id,kind,enabled,signer,erc8004?}`; normalize `id` with Unicode NFKC plus ASCII lowercase and require `^[a-z0-9][a-z0-9._:-]{0,127}$`; reject duplicates after normalization. `enabled` is boolean and must be true at authentication time; `kind` is `evm` or `erc8004`; signer is checksum-normalized; ERC-8004 entries require Base chain `8453`, the canonical registry, and a positive agent ID. Tests must model owner/controller A at load, then transfer owner, controller, or both to B: stale A policy fails closed immediately, no prior-owner public presentation is returned, and only a separately reviewed/reloaded B policy can re-enable public surfaces. `publicConversationEnabled: false` also fails closed without affecting owner news reads.

- [ ] **Step 2: Write failing signature/authentication tests**

Use a real local viem account plus injected smart-wallet/controller verifiers. Require headers:

- `x-restap-sender`
- `x-restap-signer`
- `x-restap-timestamp` (Unix seconds)
- `x-restap-nonce` (base64url, 22–128 chars)
- `x-restap-signature`

The exact signed message is:

```text
RESTAP-SIGNATURE-V1
POST
/multipass-api/api/restap/loopers/3802/news
<normalized sender id>
<lowercase normalized signer address>
<lowercase canonical-body sha256>
<decimal timestamp>
<nonce>
```

Test valid EOA and EIP-1271 paths, body/key-order equivalence after canonicalization, and failures for method/path/body/timestamp/nonce/sender/signer/signature tampering, skew beyond ±300 seconds, unknown/disabled sender, signer mismatch, non-Base ERC-8004 metadata, and an ERC-8004 signer no longer returned by the current controller resolver. Add sender-swap and cross-ID replay cases where two allowlist IDs intentionally share one signer: a signature for normalized ID A must fail under ID B, changing only case/Unicode cannot create a second identity, and a captured signature/nonce/body cannot be replayed across IDs. Assert the exact signed bytes include normalized ID and normalized signer before cryptographic verification, and that the verified/recovered EOA or verified EIP-1271 contract equals that bound signer. All unknown-sender, signer, signature, and controller failures must map to one external `403 sender_not_authorized` shape with no enumeration detail. Missing/malformed auth headers map to one `401 authentication_required` shape.

- [ ] **Step 3: Run RED**

Run:

```sh
node --test apps/api/test/restap-3802-policy.test.mjs apps/api/test/restap-news-auth.test.mjs
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement policy and authentication**

Do not use the existing boolean-only `verifyEthereumPersonalSignature` wrapper here because it collapses EIP-1271/RPC outages into an invalid signature. Implement a RESTAP verifier in this module that returns `valid`, `invalid`, or throws a typed dependency-unavailable error: verify EOAs locally with viem first, then use an injected Base client for EIP-1271 and preserve RPC/provider failures for bounded 503 mapping. Resolve and normalize the sender ID from the server-owned allowlist before constructing signed bytes, bind both normalized sender ID and lowercase normalized signer in the message, require the cryptographically verified/recovered signer to equal that address, and for `erc8004` entries re-read the sender’s current controller through an injected bounded Base resolver before accepting. This sender-controller check is in addition to the fresh Looper #3802 owner/controller policy check performed by the route. Return normalized sender ID, verified checksum signer, canonical body, body hash, nonce hash, correlation ID (normalized `session_id`, if present), received time, and replay expiry; return neither raw nonce nor signature.

The example fixture must contain no real production sender, key, signature, cookie, or secret.

- [ ] **Step 5: Run GREEN**

Run:

```sh
node --test apps/api/test/restap-3802-policy.test.mjs apps/api/test/restap-news-auth.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/restap-3802-policy.js apps/api/src/restap-news-auth.js apps/api/fixtures/restap/looper-3802-policy.example.json apps/api/test/restap-3802-policy.test.mjs apps/api/test/restap-news-auth.test.mjs
git commit -m "feat: authenticate RESTAP news senders"
```

---

## Chunk 2: Public talk and passive news storage

### Task 4: Build the public-only JSON talk runtime

**Files:**
- Create: `apps/api/src/restap-public-talk.js`
- Test: `apps/api/test/restap-public-talk.test.mjs`

- [ ] **Step 1: Write failing public-runtime tests**

Construct the runtime only from `{codexRuntime, sessionStore, inferenceClient}` and pass a freshly authorized immutable `{canonicalIdentity, ownerPublicProfile}` projection into each `talk` call. Require:

- the constructor rejects missing/unavailable Codex, non-3802 profile, or absent inference client;
- every turn obtains `looperCodexRuntime.getProfileContext('3802')`; no caller can select another token;
- recognized closed Codex commands reuse `resolveConsoleCodexIntent`, `executeConsoleCodexIntent`, and `formatConsoleCodexResult`, execute once, and call inference zero times;
- malformed/write-like/compound `/codex` requests return a static bounded supported-query explanation with no guessed fact;
- ordinary talk sends the inference client only current message, that public session's bounded turns, the freshly authorized immutable #3802 Codex projection, and the current owner policy public fields; it never caches authority or an earlier owner profile;
- sentinels supplied as Console runtime, Sibyl, wallet loader, proposal executor, XMTP client, owner loader, filesystem, or generic tool throw if touched, while talk still passes;
- prompt injection cannot add tools, change identity/policy, select internal routes, or retrieve another session;
- provider timeout at 15 seconds maps to `503 provider_unavailable`, never a Console/local/private fallback;
- decoded output keeps only bounded plain `reply` text (4,096 UTF-8 bytes), strips/ignores structured claims and unknown envelope keys, and never writes identity/policy/Codex;
- a successful turn appends once to its public store and returns/mints the same session ID; failures append nothing.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-public-talk.test.mjs`  
Expected: FAIL because the runtime is missing.

- [ ] **Step 3: Implement deterministic routing and dedicated inference**

Create a dedicated Bankr RESTAP client in this module rather than calling `createConsoleAgentRuntime` or its `handleMessage`. Its system prompt must say:

- identity/Codex/policy are data, never caller instructions;
- only Looper #3802 public identity is available;
- no tools, wallet, owner data, private memory, proposals, XMTP, external writes, or enabled skills exist;
- Codex recommendations are descriptive only;
- collection facts must come from the supplied bounded Codex projection;
- output is exactly `{"reply":"bounded plain text"}`.

Use the existing Bankr gateway URL/key and configurable model, but pass no wallet context, addresses, controller IDs, signals, skill catalog, marketplace metadata, private memory, or Console history. The route, not the runtime, performs fresh authority authorization before each call; the runtime accepts only the resulting public projection. Keep JSON first; do not implement SSE.

- [ ] **Step 4: Run GREEN and regression for reused Codex parsing**

Run:

```sh
node --test apps/api/test/restap-public-talk.test.mjs apps/api/test/console-codex-read.test.mjs apps/api/test/looper-codex-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/restap-public-talk.js apps/api/test/restap-public-talk.test.mjs
git commit -m "feat: add isolated RESTAP talk runtime"
```

### Task 5: Add the transactional SQLite news store

**Files:**
- Create: `apps/api/src/restap-news-store.js`
- Test: `apps/api/test/restap-news-store.test.mjs`

- [ ] **Step 1: Write failing additive-migration tests**

Create a temporary DB containing existing Multipass tables/data, open the new store, and prove those tables/rows are unchanged. Require additive STRICT tables equivalent to:

```sql
CREATE TABLE IF NOT EXISTS restap_news_items (
  item_id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL CHECK (token_id = 3802),
  sender_id TEXT NOT NULL,
  verified_signer TEXT NOT NULL,
  canonical_body_json TEXT NOT NULL,
  body_hash TEXT NOT NULL CHECK (length(body_hash) = 64),
  received_at TEXT NOT NULL,
  correlation_id TEXT,
  nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) = 64),
  replay_expires_at TEXT NOT NULL,
  UNIQUE (sender_id, nonce_hash)
) STRICT;
```

Add bounded indexes for owner pagination and replay expiry. If a separate nonce table is used, preserve the same externally testable fields/uniqueness and link it transactionally to the item.

- [ ] **Step 2: Write failing transactional behavior tests**

Require:

- `accept(item)` performs `BEGIN IMMEDIATE` → reserve nonce → insert item → `COMMIT`;
- duplicate sender/nonce returns one deterministic replay error, including two store handles racing on the same file;
- injected failure after nonce reservation rolls back both nonce and item, and retry succeeds once;
- canonical body/hash/signer/sender/times/correlation persist; raw nonce/signature/secret never persist;
- token ID is fixed internally to 3802 and cannot be selected by input;
- `list({cursor,limit})` uses opaque base64url cursors, default 20/max 50, newest-first deterministic ordering, and never crosses token IDs;
- reopen preserves rows; malformed legacy schema fails startup rather than silently replacing it;
- retention is bounded to 30 days/10,000 items, but no cleanup removes a nonce before its replay expiry;
- database busy/corrupt/write errors leave no partial item and expose no SQL/path details;
- `close()` is idempotent.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/restap-news-store.test.mjs`  
Expected: FAIL because the store is missing.

- [ ] **Step 4: Implement the minimum store**

Use `DatabaseSync`, prepared statements, explicit transactions, and normalized plain-data return values following existing `saved-records.js` patterns. Do not add RESTAP tables to `saved-records.js`; the store owns only its additive tables while sharing the configured `MULTIPASS_DB_PATH` file.

- [ ] **Step 5: Run GREEN**

Run: `node --test apps/api/test/restap-news-store.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/restap-news-store.js apps/api/test/restap-news-store.test.mjs
git commit -m "feat: persist passive RESTAP news"
```

---

## Chunk 3: HTTP integration and fail-closed feature gates

### Task 6: Route feature-gated discovery and public talk

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/index.d.ts`
- Create: `apps/api/test/restap-3802-api.test.mjs`

- [ ] **Step 1: Write failing exact-route and independent-gate tests**

Create `createMultipassApi` with injected deterministic policy/talk dependencies. Cover only:

- `GET /api/restap/loopers/3802/.well-known/restap.json`
- `POST /api/restap/loopers/3802/talk`

Require each disabled gate to return the same ordinary `404 not_found` as an absent route. Test token `3801`, `3803`, encoded aliases, trailing segments, query strings where disallowed, and unsupported methods. Enabling discovery must not enable talk, and enabling talk must not enable discovery or either news method.

- [ ] **Step 2: Add failing discovery/talk behavior tests**

Require:

- discovery content is deterministic and schema-valid, but every request first executes the fresh #3802 authority-policy resolver; use `Cache-Control: no-store` so an intermediary cannot continue serving prior-owner policy after transfer; it emits the exact public base and active availability without probing unrelated private dependencies;
- talk reads capped raw bytes, fatally decodes UTF-8, uses `parseStrictJsonObject`, requires `application/json`, exact request keys, and no control characters;
- talk always returns JSON even for `Accept: text/event-stream`;
- session errors are `400 invalid_session_id`; per-IP 20/minute, per-session 10/minute, global concurrency 4, and global 10,000/day budget return bounded `429` plus `Retry-After`;
- owner/controller A can discover and talk only while fresh authority matches the protected A policy and `publicConversationEnabled` is true; after resolver transfer to B (owner only, controller only, or both), discovery and talk fail closed before discovery construction/session mutation/model calls, stale A fields are never emitted, and only a reviewed B policy reload can restore them; authority mismatch/disabled policy maps to ordinary `404 not_found`, while chain/Codex unavailability maps to bounded `503`;
- timeout/unavailable is bounded `503` with no private fallback;
- logs include only event, status, duration, token `3802`, and bounded error class—never client identity, owner/controller address, session/message/reply, cookie, signature, policy data, or prompt.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/restap-3802-api.test.mjs`  
Expected: FAIL because discovery/talk routes and injected options are absent.

- [ ] **Step 4: Implement only discovery/talk routing**

Recognize the exact base before generic Multipass routing. Add only `restapDiscoveryEnabled`, `restapTalkEnabled`, `restap3802Policy`, `restap3802AuthorityResolver`, and `restapTalkRuntime` to context/types. Discovery orders gate → route/method → fresh policy/owner/controller/Codex authorization → build no-store response. Talk orders gate → route/method → raw limits/strict schema → fresh policy/owner/controller/Codex authorization → rate/concurrency → one runtime call with the authorized public projection → normalized response. Never cache an authorization result across requests. Use only the RESTAP-specific client IP produced by the server sanitizer.

- [ ] **Step 5: Run GREEN and focused regressions**

```sh
node --test apps/api/test/restap-3802-api.test.mjs apps/api/test/restap-public-talk.test.mjs apps/api/test/restap-3802-contracts.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/index.js apps/api/src/index.d.ts apps/api/test/restap-3802-api.test.mjs
git commit -m "feat: expose RESTAP 3802 discovery and talk"
```

### Task 7: Route passive news write and current-owner news read

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/index.d.ts`
- Modify: `apps/api/test/restap-3802-api.test.mjs`

- [ ] **Step 1: Add failing exact news-route and gate tests**

Cover only `GET /api/restap/loopers/3802/news` and `POST /api/restap/loopers/3802/news`. Require independent read/write gates, ordinary 404s while disabled, wrong-token/method/path rejection, and no effect on discovery/talk gates.

- [ ] **Step 2: Add failing passive write tests**

Require POST content type, capped raw bytes, fatal UTF-8, `parseStrictJsonObject`, exact schema, and canonicalization before auth. After strict body parsing but before sender auth/storage, execute a fresh #3802 owner/controller/Codex policy authorization. Require canonical sender auth before storage; typed EIP-1271/controller/provider outages → bounded 503; invalid auth → uniform 401/403; replay → deterministic 409; DB failure → bounded 503; success → one acknowledgment. Inject throwing inference/XMTP/webhook/talk clients and require zero calls on every path. Model owner/controller A then transfer to B: stale A policy or `publicConversationEnabled: false` returns ordinary `404 not_found`, calls neither sender verifier nor store, and a prior-owner policy can never authorize a post-transfer write.

- [ ] **Step 3: Add failing current-owner read tests**

Require a session issued by the same process’s existing Console auth store only after the existing `POST /api/multipass/console/session/nonce` → owner wallet signs the exact challenge → `POST /api/multipass/console/session/verify` flow succeeds through the configured signature verifier. Production uses the normal Console cookie; the unrouted loopback canary performs that same flow against its own process and never mints, imports, copies, or trusts a wallet/cookie/session from a file. Preserve current origin behavior: missing `Origin` succeeds for non-browser clients; a present untrusted origin fails. Before each list call execute `authorizeConsoleLooper({ tokenId: '3802', wallet: session.wallet, context })`. No CSRF is required for GET. Cover missing/revoked session, invalid/missing/wrong-wallet signature, non-owner/controller, chain outage, transfer revocation between pages (prior-owner session fails immediately, current-owner freshly signature-verified same-process session succeeds), exact `cursor,limit`, and no cross-token rows. Assert no owner-auth state file or Console session exists before successful signature verification.

- [ ] **Step 4: Run RED**

Run: `node --test apps/api/test/restap-3802-api.test.mjs`  
Expected: existing discovery/talk cases PASS and new news cases FAIL.

- [ ] **Step 5: Implement only news routing**

Add `restapNewsWriteEnabled`, `restapNewsReadEnabled`, `restapNewsStore`, and `restapNewsAuthenticator` to context/types; reuse the fresh `restap3802AuthorityResolver` for POST. Order POST gate → route/method → strict body/canonicalization → fresh Looper owner/controller policy authorization → bound sender authentication → atomic store write. The POST handler must not receive or reference inference, talk, XMTP, webhooks, Console runtime, memory, or outbound transport. The GET handler must reauthorize the same-process Console session before every store read.

- [ ] **Step 6: Run GREEN and full API regression**

```sh
node --test apps/api/test/restap-3802-api.test.mjs apps/api/test/restap-news-auth.test.mjs apps/api/test/restap-news-store.test.mjs
node --test apps/api/test/*.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add apps/api/src/index.js apps/api/src/index.d.ts apps/api/test/restap-3802-api.test.mjs
git commit -m "feat: expose passive RESTAP news"
```

### Task 8: Wire fail-closed startup validation and resource lifecycle

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write failing server-option tests**

Require false defaults and strict boolean parsing for `MULTIPASS_RESTAP_DISCOVERY_ENABLED`, `MULTIPASS_RESTAP_TALK_ENABLED`, `MULTIPASS_RESTAP_NEWS_WRITE_ENABLED`, and `MULTIPASS_RESTAP_NEWS_READ_ENABLED`. Parse server-only policy path and bounded talk model/timeout/concurrency/rate overrides without logging policy/key/allowlist/DB paths. A Bankr key alone never enables talk. Do not add any canary-only session mint/bootstrap option: loopback canary owner authentication must traverse the existing same-process Console nonce/verify HTTP flow and configured signature verifier.

- [ ] **Step 2: Write failing dependency-matrix and close tests**

Before listen, require:

- discovery → valid current-owner/current-controller #3802 policy + available pinned Codex + authority resolver;
- talk → discovery dependencies + dedicated inference client + public sessions;
- news write → current-owner/current-controller policy + authority resolver + persistent DB + news store + enabled sender policy + signature/controller verifier;
- news read → persistent DB + news store + same-process Console auth/current-owner authorizer only, independent of public-profile/sender policy;
- any initialization/schema failure rejects startup and closes already-created resources;
- all gates false preserves current startup with no RESTAP policy/DB/LLM;
- normal close shuts sessions/news once in safe order;
- no startup option, launcher input, state file, policy owner value, or authority resolver result can create a Console session; only successful signature verification through the existing nonce/verify flow can do so, and failed/missing/wrong-wallet signatures leave both session store and owner-auth state absent.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/server.test.mjs`  
Expected: FAIL on missing RESTAP options/composition/lifecycle.

- [ ] **Step 4: Implement startup composition**

Initialize only dependencies required by enabled gates, perform a startup authority/Codex warm-check without caching its authorization result, inject the resolver and resources explicitly into `apiFactory`, and listen last. Every request still performs the fresh check required above. Reuse the existing Console nonce/verify handlers and injected `consoleAuthStore` unchanged for same-process canary owner authentication; never add a direct session creation path. Keep Console/Sibyl/XMTP/wallet dependencies out of public talk. Startup logs contain only gate booleans, token `3802`, enabled sender count when write is enabled, and Codex hash prefix when discovery/talk is enabled.

- [ ] **Step 5: Run GREEN and API regressions**

```sh
node --test apps/api/test/server.test.mjs apps/api/test/restap-3802-api.test.mjs
node --test apps/api/test/*.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/server.js apps/api/test/server.test.mjs
git commit -m "feat: gate RESTAP 3802 startup"
```

### Task 9: Sanitize reverse-proxy client identity

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write failing proxy-boundary tests**

Add false-default parsing for `MULTIPASS_RESTAP_TRUST_LOOPBACK_PROXY`. At `http.createServer`, delete any inbound `x-multipass-client-ip`. With trust false, ignore forwarded headers and use `req.socket.remoteAddress`. With trust true, accept Cloudflare/real/forwarded identity only from a loopback TCP peer, validate exactly one IP, and inject one internal header. Non-loopback peers cannot spoof it. Logs contain neither IP nor an IP-derived hash/HMAC.

- [ ] **Step 2: Run RED**

Run: `node --test --test-name-pattern='proxy|forwarded|client identity' apps/api/test/server.test.mjs`  
Expected: FAIL on missing sanitizer/config.

- [ ] **Step 3: Implement the sanitizer**

Keep the internal header unavailable to external callers and use it only as an in-memory RESTAP quota key. Do not change existing non-RESTAP rate-limit semantics in this slice.

- [ ] **Step 4: Run GREEN and route regression**

```sh
node --test --test-name-pattern='proxy|forwarded|client identity' apps/api/test/server.test.mjs
node --test apps/api/test/server.test.mjs apps/api/test/restap-3802-api.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/server.js apps/api/test/server.test.mjs
git commit -m "fix: trust RESTAP proxy identity explicitly"
```

---

## Chunk 4: Integrated security proof and deployment verification

### Task 10: Prove cross-surface isolation and failure behavior

**Files:**
- Modify: `apps/api/test/restap-3802-contracts.test.mjs`
- Modify: `apps/api/test/restap-public-sessions.test.mjs`
- Modify: `apps/api/test/restap-public-talk.test.mjs`
- Modify: `apps/api/test/restap-3802-policy.test.mjs`
- Modify: `apps/api/test/restap-news-auth.test.mjs`
- Modify: `apps/api/test/restap-news-store.test.mjs`
- Modify: `apps/api/test/restap-3802-api.test.mjs`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-3802-contracts.js`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-public-sessions.js`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-public-talk.js`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-3802-policy.js`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-news-auth.js`
- Modify only if a new failing assertion requires it: `apps/api/src/restap-news-store.js`
- Modify only if a new failing assertion requires it: `apps/api/src/index.js`
- Modify only if a new failing assertion requires it: `apps/api/src/server.js`

- [ ] **Step 1: Add failing hostile-input and namespace matrix tests**

Add table-driven cases for oversized UTF-8, invalid UTF-8, duplicate/unknown fields, null prototypes, `__proto__`/constructor keys, control characters, regex/SQL/URL/path-shaped Codex filters, prompt injection, encoded route separators, bad content types, malformed cursor/session/header values, stale/future timestamps, nonce reuse, simultaneous duplicate writes, normalized sender swaps, and same-signer cross-ID replay.

For every public-talk case, instrument these private surfaces and require zero calls: `consoleAuthStore.validateSession`, `consoleRuntimeRegistry`, `consoleAgentRuntime`, Sibyl, wallet loader, proposal/activation handlers, XMTP, saved records, news store, sender auth, and outbound transports other than the dedicated LLM request. For every news-write case, require zero talk/model/outbound calls. For news read, require a same-process Console session plus a fresh owner/controller call and nothing else. Add a stateful A→B transfer matrix at request boundaries: discovery, talk, and write make one fresh public-policy authority call per request and stop before content/model/sender/store work on stale A; news read rejects A’s session and accepts only a newly issued B session after fresh authorization.

- [ ] **Step 2: Run the matrix RED**

Run:

```sh
node --test apps/api/test/restap-3802-api.test.mjs apps/api/test/restap-public-talk.test.mjs apps/api/test/restap-3802-policy.test.mjs apps/api/test/restap-news-auth.test.mjs apps/api/test/restap-news-store.test.mjs
```

Expected: at least one new assertion fails before hardening.

- [ ] **Step 3: Apply only the minimum hardening**

Change the owning RESTAP modules only. Preserve error-class rules:

- invalid body/session/cursor → 400;
- missing auth → uniform 401;
- unknown sender signer/signature/sender-controller or Console reader owner/controller → uniform 403; stale/disabled public owner policy on discovery/talk/news write → ordinary 404;
- replay → deterministic 409;
- size → 413;
- quota → 429 with `Retry-After`;
- provider/chain/database unavailable → bounded 503;
- no raw dependency error, SQL, RPC URL, path, content, identity enumeration, or private fallback.

- [ ] **Step 4: Run integrated GREEN and secret scans**

Run:

```sh
node --test apps/api/test/restap-*.test.mjs
node --test apps/api/test/*.test.mjs
! git grep -nE '(private.?key|x-restap-signature).*(0x[a-fA-F0-9]{64}|=.{16,})' -- apps/api docs scripts
! git grep -nE 'RESTAP.*(Sibyl|walletContext|proposal|xmtpClient|consoleAgentRuntime)' -- apps/api/src/restap-*.js
git diff --check
```

Expected: tests PASS; negated scans and diff check emit nothing.

- [ ] **Step 5: Commit**

```sh
git add apps/api/test/restap-3802-contracts.test.mjs apps/api/test/restap-public-sessions.test.mjs apps/api/test/restap-public-talk.test.mjs apps/api/test/restap-3802-policy.test.mjs apps/api/test/restap-news-auth.test.mjs apps/api/test/restap-news-store.test.mjs apps/api/test/restap-3802-api.test.mjs apps/api/src/restap-3802-contracts.js apps/api/src/restap-public-sessions.js apps/api/src/restap-public-talk.js apps/api/src/restap-3802-policy.js apps/api/src/restap-news-auth.js apps/api/src/restap-news-store.js apps/api/src/index.js apps/api/src/server.js
git commit -m "test: prove RESTAP 3802 isolation"
```

### Task 11: Build the deterministic RESTAP HTTP smoke harness

**Files:**
- Create: `apps/api/scripts/smoke-looper-restap-3802.mjs`
- Create: `apps/api/test/restap-3802-smoke.test.mjs`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write failing smoke CLI tests**

Test that remote/live mode requires `--base-url` and never infers production; local mode starts an ephemeral loopback server and uses its returned URL. Every invocation requires both `--phase <discovery|talk|news-write|news-read>` and `--expected-gates <csv>`. Accept only the exact cumulative pairings `discovery` → `discovery`, `talk` → `discovery,talk`, `news-write` → `discovery,talk,news-write`, and `news-read` → `discovery,talk,news-write,news-read`; reject reordering, omissions, extras, duplicates, or a discovery document whose advertised availability differs. With mock HTTP responses, run enabled checks and assert ordinary 404 for disabled surfaces; require discovery path/version/source validation, talk without/with continuity, exactly one signed write in the `news-write` phase, positive owner read in local/loopback-canary modes, public-read/unsigned/replay/wrong-token/prior-owner negatives, and total redaction of key/signature/nonce/session/cookie/body on failures. `--allow-write` is mandatory only for `--phase news-write`; remote `news-read` rejects signer input and `--allow-write`, requires `--reuse-write-proof <mode-0600-file>` from phase 3, confirms that exact item through GET, and sends only a deliberately unsigned POST that must return uniform 401 to prove the cumulative write route remains enabled without mutating state. Local `news-read` may create one ephemeral fixture item inside its temporary server without external signer authority. Loopback remote `news-read` additionally requires signature-derived `--owner-auth-state`; HTTPS live mode must reject canary auth-state and may use `--expect-owner-auth-required` to prove the enabled route returns uniform unauthenticated 401 without claiming a positive owner read; its phase output is `news-read=auth-required`. All modes reject raw `--cookie`/cookie environment input. Require phase-aware final output, for example:

```text
restap-3802-smoke=pass phase=talk expected-gates=discovery,talk discovery=pass talk=pass continuity=pass news-write=disabled news-read=disabled negatives=pass
```

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-3802-smoke.test.mjs`  
Expected: FAIL because the smoke script does not exist.

- [ ] **Step 3: Implement the smoke CLI**

Use an ephemeral signer/policy and same-process in-memory Console auth only in local mode. Remote `news-write` reads a preconfigured protected signer through `RESTAP_NEWS_SIGNER_KEY` without printing or persisting it, refuses signed writes unless `--allow-write` is explicit, and atomically records only `{schemaVersion,kind,baseUrl,itemId,bodyHash,receivedAt}` in `--write-proof-state` mode 0600 after success. Remote `news-read` opens that proof no-follow, verifies ownership/mode/base/item, performs no signed write, and uses only the non-mutating auth-negative POST described above.

For canary owner reads, implement two explicit nonce/verify helper operations in this CLI, not a bootstrap: `--owner-auth-challenge-out <file> --owner-wallet <address>` calls the canary’s existing Console nonce endpoint and writes the exact signable challenge plus wallet/base/PID binding to a mode-0600 file; after the actual owner signs that exact challenge outside the process, `--owner-auth-verify <challenge-file> --owner-signature-file <file> --owner-auth-state <file>` calls the same canary process’s existing Console verify endpoint, accepts state only from a successful configured signature verification for the challenge wallet, and atomically stores the returned canary-local cookie binding. Missing/invalid/wrong-wallet/replayed signatures create neither a Console session nor an owner-auth state file. Delete the signature file and challenge after successful verification. For reads, open owner state no-follow, require a regular mode-0600 file owned by the invoking user, exact kind `restap-3802-canary-console-session`, matching loopback base URL and live PID, then send only the contained canary-local cookie to that process. Never accept or reuse a production cookie. Accept one exact base URL; redact all request headers/bodies and auth-state/proof/challenge contents in errors.

- [ ] **Step 4: Run GREEN**

```sh
node --test apps/api/test/restap-3802-smoke.test.mjs
node apps/api/scripts/smoke-looper-restap-3802.mjs --help
```

Expected: PASS; help exits zero without network.

- [ ] **Step 5: Commit**

```sh
git add apps/api/scripts/smoke-looper-restap-3802.mjs apps/api/test/restap-3802-smoke.test.mjs apps/api/package.json
git commit -m "test: add RESTAP 3802 HTTP smoke"
```

### Task 12: Add the unrouted immutable-release canary launcher

**Files:**
- Create: `apps/api/scripts/run-looper-restap-3802-canary.sh`
- Create: `apps/api/test/restap-3802-canary-launcher.test.mjs`

- [ ] **Step 1: Write failing launcher tests**

Using temporary release/state/policy/artifact/DB fixtures, require exact release path, non-symlink pinned Codex artifact, protected policy, copied non-production DB, free loopback port, PID/log state directory, no environment dump, and cleanup on failure/signal. Require all gates off by default and accept each explicit gate flag independently; rollout ordering belongs to the runbook, not configuration coupling. Test `--stop` and `--replace`: validate recorded PID, start time, command/release/port/state ownership before signaling; TERM and wait boundedly; fail rather than start if identity or stop verification fails; remove stale signature-derived owner-auth state only after verified exit; `--replace` is exactly verified stop followed by start. Assert the launcher has no wallet/session/cookie/signature input and cannot create an owner session or owner-auth state. Before the nonce/verify helper succeeds, and after any missing/invalid/wrong-wallet/replayed signature, both same-process Console session lookup and owner-auth state-file existence must remain false. Assert no nginx/systemd/static/production-DB/ERC-8004 mutation command exists.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-3802-canary-launcher.test.mjs`  
Expected: FAIL because the launcher does not exist.

- [ ] **Step 3: Implement the launcher**

Follow `run-looper-codex-console-canary.sh` process/PID protections but add explicit `--policy`, `--database`, `--bankr-env`, `--stop`, `--replace`, and independent `--enable-discovery`, `--enable-talk`, `--enable-news-write`, and `--enable-news-read` flags. Run only on loopback. For talk, require `--bankr-env` to be a no-follow regular root-owned mode-0600 file so `sudo` can read it; parse lines with `IFS= read -r` and a strict whitelist of exactly one `BANKR_API_KEY` plus optional one `BANKR_MODEL`, reject unknown/duplicate keys, shell syntax, control characters, expansions, overlong values, and invalid model characters, then export only those two values. Never `source`, `.`, `eval`, or print the file.

The launcher never accepts wallet, signature, cookie, session, challenge, or owner-auth-state input and never creates a Console session. When news-read is enabled it only exposes the existing Console nonce/verify endpoints on the same loopback process. The smoke helper in Task 11 performs the real owner-signature handshake and may write `$STATE/owner-auth.json` only after HTTP verification succeeds; the launcher records no auth content and merely revokes the stopped process and removes that fixed file after verified stop/replace. Tests prove state absence before successful verify, invalid/wrong-wallet/replayed-signature rejection, same-process validation, wrong PID/base/mode/owner rejection, prior-owner failure after transfer, cleanup, and total redaction.

- [ ] **Step 4: Run GREEN**

```sh
node --test apps/api/test/restap-3802-canary-launcher.test.mjs
bash -n apps/api/scripts/run-looper-restap-3802-canary.sh
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/api/scripts/run-looper-restap-3802-canary.sh apps/api/test/restap-3802-canary-launcher.test.mjs
git commit -m "ops: add RESTAP 3802 canary launcher"
```

### Task 13: Add inspect-first promotion and verified rollback tooling

**Files:**
- Create: `scripts/promote-looper-restap-3802.sh`
- Create: `apps/api/test/restap-3802-promotion.test.mjs`

- [ ] **Step 1: Write failing promotion/rollback tests**

Use injected command/state fixtures—never real systemd/nginx—to prove `--dry-run`, `--rehearsal`, `--promote`, and `--rollback`. Require inspection before mutation; exact-unit/path mismatch abort; SQLite backup API plus `PRAGMA integrity_check`; hashes for current config/release/static/DB; merged environment/drop-in edits preserving unrelated keys; rollback traps on ERR/INT/TERM; prior working directory/PID/restart/health restoration; retained accepted RESTAP items/nonces; and no table drop/data delete/ERC-8004 publication/Gateway operation.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-3802-promotion.test.mjs`  
Expected: FAIL because the promotion script does not exist.

- [ ] **Step 3: Implement the minimum promotion script**

Support one phase per invocation: `discovery`, `talk`, `news-write`, or `news-read`. Require exact `--release`, `--artifact`, `--policy`, `--database`, `--unit`, `--static-root`, `--backup-root`, and `--proof-root` arguments for dry-run/rehearsal/promotion; write redacted preflight, mutation, restart, health, and rollback evidence only beneath the no-symlink proof root. Before writes, inspect the actual service unit, drop-ins, environment files, nginx route, working directory, DB path, static root, and restart count; abort on drift. Back up before staging, merge only intended keys, arm rollback before restart, verify post-restart state/health, and retain DB rows on rollback.

- [ ] **Step 4: Run GREEN**

```sh
node --test apps/api/test/restap-3802-promotion.test.mjs
bash -n scripts/promote-looper-restap-3802.sh
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add scripts/promote-looper-restap-3802.sh apps/api/test/restap-3802-promotion.test.mjs
git commit -m "ops: gate RESTAP 3802 promotion"
```

### Task 14: Document and execute release gates, canary, and rollback rehearsal

**Files:**
- Create: `docs/loopers/looper-restap-3802-canary.md`
- Modify: `apps/api/README.md`
- Create: `apps/api/test/restap-3802-runbook.test.mjs`

- [ ] **Step 1: Write failing runbook-contract tests**

Require the docs to contain exact base/routes, RESTAP version/upstream commit/raw source URLs/checksums/minimal-fixture checksum/license provenance, #3802/Codex hashes, current owner/controller policy binding, canonical Codex name/image source, owner display/public-conversation policy, fresh-authority and transfer behavior, request/response/sender+signer signature rules, session-not-auth disclosure, limits, safe logs, retention/schema, four independent gate dependency matrix, rollout/rollback order, backup/restore evidence, and explicit SSE/ERC-8004-publication deferral. Require executable command blocks for every local/unrouted/rehearsal/rollback gate below, exact cumulative `--phase`/`--expected-gates` smoke invocations, `--allow-write`, protected same-process canary owner auth, verified `--replace`/`--stop`, and whitelist-parsed sudo-safe Bankr environment input.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/restap-3802-runbook.test.mjs`  
Expected: FAIL because the runbook does not exist.

- [ ] **Step 3: Write the runbook and README**

Document enable order discovery → JSON talk → one reviewed sender write → owner read; each canary phase replaces the prior process with cumulative flags and proves expected disabled/enabled surfaces. Document rollback order news read → news write → talk → discovery. Record that rollback never drops RESTAP tables or accepted replay records, never copies a production Console cookie into canary state, and never publishes ERC-8004 metadata.

- [ ] **Step 4: Run GREEN and commit docs**

```sh
node --test apps/api/test/restap-3802-runbook.test.mjs
git diff --check
git add docs/loopers/looper-restap-3802-canary.md apps/api/README.md apps/api/test/restap-3802-runbook.test.mjs
git commit -m "docs: add RESTAP 3802 release runbook"
```

- [ ] **Step 5: Run the required sequential local release gate**

```sh
# 1 focused tests
node --test apps/api/test/restap-*.test.mjs apps/api/test/server.test.mjs
# 2 full API
node --test apps/api/test/*.test.mjs
# prove the already-live pinned Codex artifact
LOOPER_CODEX_ARTIFACT="${LOOPER_CODEX_ARTIFACT:?set reviewed artifact path}" pnpm loopers:codex:prove
# 3 canonical web build (Vite empties its configured outDir)
pnpm web:build
# 4 full web suite against fresh output
node --test apps/web/test/*.test.mjs
# 5 desktop/mobile browser smoke
cd apps/web
CHROMIUM_PATH=/snap/bin/chromium node scripts/smoke-looper-codex-console.mjs --dist ./dist --output /home/ubuntu/.openclaw/workspace/tmp/looper-restap-3802-web-smoke
cd ../..
# 6 local RESTAP HTTP smoke + authorization negatives
pnpm --filter @helixa/multipass-api smoke:restap-3802 -- --mode local --phase news-read --expected-gates discovery,talk,news-write,news-read
# repository hygiene
git diff --check
git status --short
```

Require all PASS, exact artifact hash `5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24`, clean desktop/mobile/overflow/errors, and only intended files.

- [ ] **Step 6: Prepare and prove the immutable unrouted canary**

After push approval, run exactly:

```sh
set -Eeuo pipefail
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
RELEASE="/home/ubuntu/releases/multipass-restap-$SHORT"
ARTIFACT_SRC="${LOOPER_CODEX_ARTIFACT:?set reviewed artifact path}"
POLICY=/etc/helixa/restap-3802-policy.json
BANKR_ENV=/etc/helixa/restap-3802-bankr.env
CANARY_DB=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-canary.sqlite
STATE=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-canary-state
OWNER_AUTH_STATE="$STATE/owner-auth.json"
OWNER_AUTH_CHALLENGE="$STATE/owner-auth-challenge.json"
OWNER_SIGNATURE_FILE="$STATE/owner-auth-signature.txt"
WRITE_PROOF_STATE="$STATE/news-write-proof.json"
OWNER_WALLET="${OWNER_WALLET:?set current #3802 owner wallet}"
BASE=http://127.0.0.1:8793/api/restap/loopers/3802
git worktree add --detach "$RELEASE" "$SHA"
cd "$RELEASE"
pnpm install --offline --frozen-lockfile
mkdir -p runtime
install -m 0644 "$ARTIFACT_SRC" runtime/looper-codex-v1.json
node -e "const {DatabaseSync,backup}=require('node:sqlite');const db=new DatabaseSync('/var/lib/helixa/multipass.sqlite',{readOnly:true});backup(db,process.argv[1]).then(()=>db.close())" "$CANARY_DB"

# Phase 1: discovery only.
sudo apps/api/scripts/run-looper-restap-3802-canary.sh --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --enable-discovery
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --phase discovery --expected-gates discovery

# Phase 2: verified stop/replace, then cumulative discovery + talk.
sudo apps/api/scripts/run-looper-restap-3802-canary.sh --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --phase talk --expected-gates discovery,talk

# Phase 3: verified stop/replace, then cumulative discovery + talk + one reviewed write.
sudo apps/api/scripts/run-looper-restap-3802-canary.sh --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk --enable-news-write
RESTAP_NEWS_SIGNER_KEY="${RESTAP_NEWS_SIGNER_KEY:?export reviewed canary sender key}" node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --phase news-write --expected-gates discovery,talk,news-write --allow-write --write-proof-state "$WRITE_PROOF_STATE"

# Phase 4: verified stop/replace, then all cumulative gates. No second signed write.
sudo apps/api/scripts/run-looper-restap-3802-canary.sh --replace --release "$RELEASE" --port 8793 --state-dir "$STATE" --policy "$POLICY" --database "$CANARY_DB" --bankr-env "$BANKR_ENV" --enable-discovery --enable-talk --enable-news-write --enable-news-read

# Real same-process Console auth: request challenge, sign it with the current owner wallet, then verify.
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --owner-wallet "$OWNER_WALLET" --owner-auth-challenge-out "$OWNER_AUTH_CHALLENGE"
printf 'Sign the exact challenge in %s with %s and save only the signature to %s, mode 0600; then continue after explicit owner approval.\n' "$OWNER_AUTH_CHALLENGE" "$OWNER_WALLET" "$OWNER_SIGNATURE_FILE"
test -f "$OWNER_SIGNATURE_FILE" && test "$(stat -c %a "$OWNER_SIGNATURE_FILE")" = 600
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --owner-auth-verify "$OWNER_AUTH_CHALLENGE" --owner-signature-file "$OWNER_SIGNATURE_FILE" --owner-auth-state "$OWNER_AUTH_STATE"

node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$BASE" --phase news-read --expected-gates discovery,talk,news-write,news-read --reuse-write-proof "$WRITE_PROOF_STATE" --owner-auth-state "$OWNER_AUTH_STATE"

# Stability window, then verified stop. No canary process or auth state may remain.
sleep 900
sudo apps/api/scripts/run-looper-restap-3802-canary.sh --stop --state-dir "$STATE"
```

Preconditions: `POLICY` pins the freshly reviewed current #3802 owner/controller; `BANKR_ENV` is the reviewed root-owned mode-0600 two-key whitelist file; `RESTAP_NEWS_SIGNER_KEY` belongs to the reviewed allowlisted canary sender and is present only for phase 3. Phase 4 reuses the phase-3 write proof and performs no signed mutation. Expected outputs are phase-aware (`canary=ready gates=<cumulative-list>` and matching `restap-3802-smoke=pass phase=<phase> expected-gates=<cumulative-list> ...`), disabled surfaces return expected 404s, each `--replace` reports verified prior stop before ready, the 15-minute final phase is alive with zero unplanned restarts/stable memory/concurrency/no 5xx burst/no sensitive logs, and `--stop` reports `canary=stopped auth-state=removed`.

- [ ] **Step 7: Rehearse promotion and explicit rollback before live enablement**

```sh
BACKUP=/home/ubuntu/backups/restap-3802-$(date -u +%Y%m%dT%H%M%SZ)
PROOF_ROOT=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-promotion-proof
sudo scripts/promote-looper-restap-3802.sh --rehearsal --phase discovery --release "$RELEASE" --artifact "$RELEASE/runtime/looper-codex-v1.json" --policy /etc/helixa/restap-3802-policy.json --database /var/lib/helixa/multipass.sqlite --unit multipass-api-xmtp-holder-proof.service --static-root /var/www/helixa.xyz/multipass --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/rehearsal-discovery"
sudo scripts/promote-looper-restap-3802.sh --rollback --unit multipass-api-xmtp-holder-proof.service --static-root /var/www/helixa.xyz/multipass --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/rollback"
```

Expected: `rehearsal-restored=verified`, then `rollback=verified prior-health=pass retained-restap-rows=pass`.

- [ ] **Step 8: Obtain separate live approvals and promote one phase at a time**

Obtain separate explicit approval before each command block below. Each block contains the complete promotion invocation and its matching smoke; after each, verify PID/restart count/health and review the redacted phase proof before requesting the next approval. The news-write block also needs separate approval for the one live signed write; news-read reuses that item and never signs or mutates.

```sh
PUBLIC_BASE=https://helixa.xyz/multipass-api/api/restap/loopers/3802
ARTIFACT="$RELEASE/runtime/looper-codex-v1.json"
POLICY=/etc/helixa/restap-3802-policy.json
PROD_DB=/var/lib/helixa/multipass.sqlite
UNIT=multipass-api-xmtp-holder-proof.service
STATIC_ROOT=/var/www/helixa.xyz/multipass
BACKUP=/home/ubuntu/backups/restap-3802-live-$(date -u +%Y%m%dT%H%M%SZ)
PROOF_ROOT=/home/ubuntu/.openclaw/workspace/tmp/restap-3802-live-proof
WRITE_PROOF_STATE="$PROOF_ROOT/live-news-write-proof.json"

# APPROVAL BOUNDARY 1 — enable discovery, then prove discovery only.
sudo scripts/promote-looper-restap-3802.sh --promote --phase discovery --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/discovery"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase discovery --expected-gates discovery

# APPROVAL BOUNDARY 2 — enable talk cumulatively, then prove discovery + talk.
sudo scripts/promote-looper-restap-3802.sh --promote --phase talk --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/talk"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase talk --expected-gates discovery,talk

# APPROVAL BOUNDARY 3 — enable news write, then perform the one approved signed write.
sudo scripts/promote-looper-restap-3802.sh --promote --phase news-write --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/news-write"
RESTAP_NEWS_SIGNER_KEY="${RESTAP_NEWS_SIGNER_KEY:?export reviewed live sender key}" node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase news-write --expected-gates discovery,talk,news-write --allow-write --write-proof-state "$WRITE_PROOF_STATE"

# APPROVAL BOUNDARY 4 — enable owner read; reuse phase-3 item and send only an unsigned POST negative.
sudo scripts/promote-looper-restap-3802.sh --promote --phase news-read --release "$RELEASE" --artifact "$ARTIFACT" --policy "$POLICY" --database "$PROD_DB" --unit "$UNIT" --static-root "$STATIC_ROOT" --backup-root "$BACKUP" --proof-root "$PROOF_ROOT/news-read"
node apps/api/scripts/smoke-looper-restap-3802.mjs --mode remote --base-url "$PUBLIC_BASE" --phase news-read --expected-gates discovery,talk,news-write,news-read --reuse-write-proof "$WRITE_PROOF_STATE" --expect-owner-auth-required
```

The final command proves that anonymous GET is rejected, the phase-3 item proof is retained, and unsigned POST is rejected on the enabled live write route; it performs no write. Complete the separately approved positive owner read of that exact phase-3 item through the existing Console nonce/verify login in the same production process; do not export, copy, or pass its cookie to the smoke CLI. On failure disable that gate; if health does not recover, run the exact rollback command above. Do not publish the ERC-8004 service entry.

---

## Completion checklist

- [ ] RESTAP discovery is pinned to the full upstream commit plus checksum-verified minimal fixture/source/license provenance, emitted-shape-compatible, schema-valid, and resolves from the exact production base.
- [ ] Codex alone supplies canonical #3802 name/image; current owner policy supplies only display/public-conversation/presentation fields; discovery, talk, and every news write freshly match current owner/controller and fail closed immediately after transfer.
- [ ] Public JSON talk is #3802-only, bounded, rate/concurrency/budget limited, and isolated from every unrelated private surface.
- [ ] Public sessions are unguessable, TTL-bounded, isolated, redacted, and never treated as authentication.
- [ ] Signed news canonicalization binds normalized sender ID and verified signer; sender-swap, cross-ID replay, allowlist, skew, controller, replay, transaction, and concurrency tests pass.
- [ ] News writes are structurally passive: no inference, XMTP, webhook, RESTAP callback, or reply.
- [ ] News reads require a same-process Console session created only by the existing nonce/owner-signature/verify flow plus a fresh #3802 owner/controller check on every request; no bootstrap/mint path exists, canary state is absent until signature verification succeeds, and no production cookie is reused.
- [ ] SQLite changes are additive; rollback retains accepted items and replay records.
- [ ] Four gates default off and independently disable without changing Console, XMTP, Codex, or wallet behavior.
- [ ] Phase/expected-gate smoke output is exact, the sole remote signed write occurs in the news-write phase with `--allow-write`, news-read reuses its proof and performs only a non-mutating auth-negative POST, launcher replacement/stops are verified, and Bankr key/model input is sudo-safe whitelist parsed without sourcing.
- [ ] Exact cumulative discovery → talk → news-write → news-read canary commands, focused API, full API, fresh web build, full web, desktop/mobile, HTTP smoke, transfer/authorization negatives, and stability checks pass sequentially.
- [ ] Rollback is rehearsed and verified before live enablement.
- [ ] ERC-6551 wallet work is untouched and ERC-8004 service publication remains deferred.

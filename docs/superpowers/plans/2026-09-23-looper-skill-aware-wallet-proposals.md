# Looper Skill-Aware Wallet Proposals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the selected Looper bounded knowledge of approved skills such as Bankr and let it create exact, review-only Base ETH/CRED transfer proposals that only the authenticated current owner can execute through the existing hardened ERC-6551 controller.

**Architecture:** Keep skill awareness, proposal authority, and wallet execution separate. The API owns a frozen skill catalog, a strict LLM response decoder, authoritative Base reads, and a durable SQLite proposal state machine; the browser renders immutable server proposals and can only hand exact normalized transfer fields to the existing wallet controller after a one-shot server authorization. Ship behind a default-off flag and complete the non-executable proposal slice before connecting any wallet boundary.

**Tech Stack:** Node.js 24 ESM, Bankr LLM Gateway, `node:sqlite`, viem, Vite, vanilla DOM rendering, Node test runner, existing Multipass Console and Looper wallet modules.

**Approved design:** `docs/superpowers/specs/2026-09-23-looper-skill-aware-wallet-proposals-design.md` at rebased commit `ebc0ee8` (same reviewed content as original `1436661`).

**Base:** deployed Console commit `bbec681` plus the four reviewed design commits.

**Non-negotiable gates:**

- Keep `MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED` default-off.
- Never expose `SKILL.md`, paths, credentials, Bankr Agent API, generic provider calls, raw calldata, arbitrary contracts, swaps, approvals, permits, or autonomous execution.
- Never trust browser-supplied ownership, account, asset, balance, anchor, decimals, proposal state, or authorization evidence.
- No real signing, transaction broadcast, service restart, production config change, or deployment is part of this plan.
- Preserve the current EOA-only write gate and all existing uncertain-outcome behavior.
- Stop after a failing baseline or unexpected authority expansion; do not weaken a guard to make a test pass.

---

## File Structure

### New API units

- `apps/api/src/console-skill-catalog.js` — frozen, versioned public skill descriptors only.
- `apps/api/src/strict-json-envelope.js` — bounded duplicate-key-rejecting JSON object decoder.
- `apps/api/src/console-transfer-candidate.js` — closed LLM envelope/candidate normalization; no authority fields.
- `apps/api/src/console-wallet-policy.js` — Base/Loopers/release pins plus the ETH/CRED allowlist and version hashes.
- `apps/api/src/console-wallet-reader.js` — closed server RPC reader for anchored owner/account/runtime/balance evidence.
- `apps/api/src/console-proposal-store.js` — SQLite migrations, immutable payloads, lifecycle events, CAS/idempotency, permanent replay keys.
- `apps/api/src/console-proposal-service.js` — proposal creation, authoritative revalidation, state transitions, and route-facing errors.

### New browser unit

- `apps/web/src/console-wallet-proposals.js` — canonical proposal validation, frozen review view-models, and no-calldata handoff fields.

### Modified boundaries

- `apps/api/src/bankr-llm/index.js` — send bounded skill context and decode the exact response envelope.
- `apps/api/src/agent-runtime/index.js` — collect normalized candidates; stop deriving transfer authority from text.
- `apps/api/src/index.js` — server-authoritative message context and authenticated proposal lifecycle routes.
- `apps/api/src/server.js` and `apps/api/src/console-production-bootstrap.js` — default-off feature wiring and durable store/reader composition.
- `apps/api/src/saved-records.js` — no proposal tables; retain current profile responsibility unchanged.
- `apps/web/src/console-agent-api.js` — remove browser wallet claims from message requests and add proposal lifecycle clients.
- `apps/web/src/console-agent-thread.js` — render immutable skill and transfer review cards.
- `apps/web/src/multipass-console.js` — expose capabilities and proposal lifecycle state in the snapshot.
- `apps/web/src/looper-agent-wallet-controller.js` — proposal-bound preparation and durable attempt linkage; no server state ownership.
- `apps/web/src/app.js` — review/reject/claim/bind/authorize/consume/reconcile orchestration.
- `apps/web/src/styles.css` — responsive review cards, loading/disabled/focus/error states.

### Focused tests

- `apps/api/test/console-skill-catalog.test.mjs`
- `apps/api/test/strict-json-envelope.test.mjs`
- `apps/api/test/console-transfer-candidate.test.mjs`
- `apps/api/test/console-wallet-policy.test.mjs`
- `apps/api/test/console-wallet-reader.test.mjs`
- `apps/api/test/console-proposal-store.test.mjs`
- `apps/api/test/console-proposal-service.test.mjs`
- Modify `apps/api/test/bankr-llm.test.mjs`
- Modify `apps/api/test/console-agent-runtime.test.mjs`
- `apps/web/test/console-wallet-proposals.test.mjs`
- Modify `apps/web/test/console-agent-api.test.mjs`
- Modify `apps/web/test/console-agent-thread.test.mjs`
- Modify `apps/web/test/multipass-console.test.mjs`
- Modify `apps/web/test/looper-agent-wallet-controller.test.mjs`
- Modify `apps/web/test/app.test.mjs`
- Modify `apps/web/test/mobile-layout.test.mjs`

---

## Chunk 1: Skill Awareness and Non-Executable Proposal Slice

### Task 1: Add the frozen skill catalog

**Files:**
- Create: `apps/api/src/console-skill-catalog.js`
- Create: `apps/api/test/console-skill-catalog.test.mjs`

- [ ] **Step 1: Write the failing catalog tests**

Test exact Bankr descriptor keys, recursive freezing, stable canonical SHA-256 version, and absence of functions, paths, commands, URLs containing credentials, or secret-like fields. Pin UTF-8 limits: skill ID 32 bytes, name 64, summary 320, at most 8 capabilities of 48 bytes, and at most 8 constraints of 160 bytes.

```js
const catalog = getConsoleSkillCatalog();
assert.deepEqual(Object.keys(catalog.skills[0]).sort(), [
  'capabilities', 'constraints', 'credentialAccess', 'enabledCapabilities',
  'execution', 'id', 'name', 'summary',
].sort());
assert.equal(catalog.skills[0].id, 'bankr');
assert.deepEqual(catalog.skills[0].enabledCapabilities, ['explain', 'propose_transfer']);
assert.equal(catalog.skills[0].credentialAccess, false);
assert.match(catalog.version, /^sha256:[a-f0-9]{64}$/);
assert.equal(Object.isFrozen(catalog.skills[0].constraints), true);
```

- [ ] **Step 2: Run the focused test and capture RED**

Run: `node --test apps/api/test/console-skill-catalog.test.mjs`

Expected: FAIL because `console-skill-catalog.js` does not exist.

- [ ] **Step 3: Implement the minimal catalog**

Export `getConsoleSkillCatalog()` and `getConsoleSkillCatalogPromptProjection()`. Canonicalize with sorted keys before hashing; return recursively frozen plain JSON. Include Bankr’s descriptive capabilities (`market_research`, `portfolio_read`, `transfer`, `swap`, `token_launch`) while enabling only `explain` and `propose_transfer`. The prompt projection is constructed from the closed server constant, not an argument, request body, installed skill, filesystem path, or environment value.

- [ ] **Step 4: Run GREEN and boundary scan**

Run: `node --test apps/api/test/console-skill-catalog.test.mjs`

Expected: PASS with no executable values or secret/path fields. Tests also prove the exact prompt projection cannot contain request input, API keys, arbitrary descriptor fields, CLI text, or `SKILL.md` content.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/console-skill-catalog.js apps/api/test/console-skill-catalog.test.mjs
git commit -m "feat: add bounded Console skill catalog"
```

### Task 2: Decode the Bankr envelope without duplicate-key ambiguity

**Files:**
- Create: `apps/api/src/strict-json-envelope.js`
- Create: `apps/api/src/console-transfer-candidate.js`
- Create: `apps/api/test/strict-json-envelope.test.mjs`
- Create: `apps/api/test/console-transfer-candidate.test.mjs`

- [ ] **Step 1: Write RED tests for strict JSON decoding**

Cover duplicate keys at every nesting level, escaped-equivalent duplicate keys, accessors/prototypes, mixed prose plus JSON, trailing bytes, depth/byte/member limits, multibyte overflow, arrays with holes, and valid escaped strings. Reject decoded keys named `__proto__`, `constructor`, or `prototype`; the decoder must return recursively frozen plain JSON only.

```js
assert.throws(() => parseStrictJsonObject('{"assistant_text":"a","assistant_text":"b"}'), /duplicate/i);
assert.throws(() => parseStrictJsonObject('prefix {"schema_version":"0.1.0"}'), /exact json/i);
assert.deepEqual(parseStrictJsonObject('{"a":{"b":1}}'), { a: { b: 1 } });
```

- [ ] **Step 2: Run strict decoder RED**

Run: `node --test apps/api/test/strict-json-envelope.test.mjs`

Expected: FAIL because the strict decoder is missing.

- [ ] **Step 3: Implement a bounded lexical duplicate-key check, then `JSON.parse`**

Track object frames, decoded string keys, arrays, escapes, and nesting. Reject duplicate decoded keys and forbidden prototype keys before calling `JSON.parse`; cap input at 16 KiB measured with `Buffer.byteLength(value, 'utf8')`, depth at 12, object members at 64, and arrays at 8. Accept only string input containing one JSON object with outer whitespace; non-string input is invalid and never coerced.

- [ ] **Step 4: Write candidate schema RED tests**

Accept one exact envelope:

```js
{
  schema_version: '0.1.0',
  assistant_text: 'Send 0.01 ETH to the treasury after review.',
  skill_refs: ['bankr'],
  transfer_candidates: [{
    skill: 'bankr',
    assetType: 'native',
    assetContract: null,
    recipient: '0x1111111111111111111111111111111111111111',
    amountBaseUnits: '10000000000000000',
    rationale: 'Owner-requested treasury funding.',
  }],
}
```

Reject unknown keys, more than one candidate, fake IDs/status/scope/approval/execution, calldata, router/spender/slippage, signed/fractional/exponent/hex/leading-zero/zero/greater-than-uint256 amounts, the zero recipient, unsupported skills, duplicate or unknown `skill_refs`, native candidates with a contract, contract candidates without a contract, and overlong text. Pin UTF-8 limits: `assistant_text` and malformed fallback text 4,096 bytes, `rationale` 512, skill IDs 32, at most 4 unique skill references, and exactly 0 or 1 transfer candidate. Malformed string content becomes trimmed raw fallback text truncated on a valid UTF-8 boundary with zero skill refs/candidates; empty or non-string content becomes empty text with zero skill refs/candidates.

- [ ] **Step 5: Implement candidate normalization**

Export `decodeConsoleLlmEnvelope(content, { catalog })`. Return recursively frozen `{ text, skillRefs, transferCandidates }`; use viem `getAddress`, canonical positive uint256 decimal validation, exact key sets, and closed cross-field rules. Never assign proposal identity, authority, lifecycle state, or scope here.

- [ ] **Step 6: Run focused GREEN**

Run:

```bash
node --test \
  apps/api/test/strict-json-envelope.test.mjs \
  apps/api/test/console-transfer-candidate.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/strict-json-envelope.js apps/api/src/console-transfer-candidate.js apps/api/test/strict-json-envelope.test.mjs apps/api/test/console-transfer-candidate.test.mjs
git commit -m "feat: validate Console transfer candidates"
```

### Task 3: Make Bankr skill-aware without granting tools

**Files:**
- Modify: `apps/api/src/bankr-llm/index.js`
- Modify: `apps/api/src/agent-runtime/index.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/src/xmtp-worker/index.js`
- Modify: `apps/api/src/index.d.ts`
- Modify: `apps/api/test/bankr-llm.test.mjs`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`
- Modify: `apps/api/test/xmtp-worker.test.mjs`

- [ ] **Step 1: Write Bankr prompt, provenance, and default-off RED tests**

Assert the skill-aware system-prompt section equals the server-owned catalog projection byte-for-byte and says descriptors are knowledge, not callable tools. Prove wallet/message request input, browser fields, API keys, filesystem paths, CLI text, arbitrary descriptor fields, and `SKILL.md` content cannot enter it. Assert the request asks for the exact envelope and the adapter returns normalized `transferCandidates`; malformed content returns text with no candidates.

Add default-off tests proving prompts, API responses, capability metadata, candidates, runtime behavior, and XMTP worker behavior remain byte-for-byte unchanged unless `MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED=true`. Reject malformed flag values. Bankr chat remains controlled independently by its existing flag.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test \
  apps/api/test/bankr-llm.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/server.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs \
  apps/api/test/xmtp-worker.test.mjs
```

Expected: FAIL on missing feature flag, skill context, candidate handling, and provenance.

- [ ] **Step 3: Extend the Bankr adapter behind the default-off flag**

Add `MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED` to server/bootstrap/worker composition with a default of false. When false, do not construct, inject, return, or render catalog/candidate data. When true, pass only the internally constructed prompt projection to `generate`, request one exact JSON envelope, decode only the message content, and return:

```js
{ provider: 'bankr_llm_gateway', text, skillRefs, transferCandidates }
```

Do not accept skill descriptors from the browser or runtime caller and do not dynamically read installed skill files. Do not add Bankr Agent API, CLI, function-calling tools, credentials, or execution methods.

- [ ] **Step 4: Preserve candidate provenance outside legacy proposals**

Keep the existing watch/research proposal path unchanged. Collect candidate arrays from participant responses separately as `proposalCandidates`; candidates must never enter the legacy `proposals` array. Bind each candidate to the published agent message ID, participant ID, bounded `skillRefs`, and deterministic source ordinal returned by that exact participant response. Test multi-participant responses and preserve this provenance for Chunk 2's unique source tuple. Do not mark candidates executable or assign chain/account/owner/decimals/expiry/revision/lifecycle scope in the runtime.

Return capability metadata and `proposalCandidates` as separate response fields only when enabled. Skill badges describe catalog knowledge; they must not claim Bankr executed a tool or transaction.

- [ ] **Step 5: Run GREEN and complete API regressions**

Run:

```bash
node --test \
  apps/api/test/console-skill-catalog.test.mjs \
  apps/api/test/strict-json-envelope.test.mjs \
  apps/api/test/console-transfer-candidate.test.mjs \
  apps/api/test/bankr-llm.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/server.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs \
  apps/api/test/xmtp-worker.test.mjs
node --test "apps/api/test/*.test.mjs"
```

Expected: PASS; legacy watch proposals remain review-only, and flag-off behavior is unchanged across secure activation, production bootstrap, and the XMTP worker.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bankr-llm/index.js apps/api/src/agent-runtime/index.js apps/api/src/index.js apps/api/src/server.js apps/api/src/console-production-bootstrap.js apps/api/src/xmtp-worker/index.js apps/api/src/index.d.ts apps/api/test/bankr-llm.test.mjs apps/api/test/console-agent-runtime.test.mjs apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs apps/api/test/xmtp-worker.test.mjs
git commit -m "feat: make Console inference skill aware"
```

### Task 4: Render the non-executable proposal and capability slice

**Files:**
- Create: `apps/web/src/console-wallet-proposals.js`
- Create: `apps/web/test/console-wallet-proposals.test.mjs`
- Create: `apps/web/test/console-agent-thread.test.mjs`
- Create: `apps/web/scripts/smoke-console-skill-proposal.mjs`
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/console-agent-thread.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Write candidate-surface and data-flow RED tests**

Render only an `Unverified transfer suggestion — awaiting server verification` surface containing the model-supplied asset type/contract, recipient, base-unit amount, rationale, skill badge, participant, and source message reference. Never add chain, account, owner, decimals, formatted amount, expiry, revision, or lifecycle state from browser state. Assert the new candidate surface has no proposal control, submit button, editable field, calldata, provider, generic wallet-form prefill, or data/action linkage.

Add app-state tests proving capability metadata and candidates survive the API-to-thread path without entering `proposals`, preserve multi-participant provenance, and are absent when the feature is off.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test \
  apps/web/test/console-wallet-proposals.test.mjs \
  apps/web/test/console-agent-thread.test.mjs \
  apps/web/test/app.test.mjs \
  apps/web/test/multipass-console.test.mjs \
  apps/web/test/mobile-layout.test.mjs
```

Expected: FAIL because the candidate/capability data flow and safe suggestion surface are absent.

- [ ] **Step 3: Implement frozen unverified-candidate view models**

Validate candidate view models with exact keys, provenance, UTF-8 limits, and recursively frozen output. Do not infer authoritative wallet fields or accept lifecycle authority from browser state, DOM fields, or data attributes.

- [ ] **Step 4: Preserve and render capabilities and candidates**

Update `app.js` to retain the API's separate capabilities and `proposalCandidates` fields instead of dropping them. Show `Understands`, `Can propose`, and `Cannot execute directly` only when the feature-enabled response contains those fields. Render each candidate beside its matching published agent message as `Unverified transfer suggestion — awaiting server verification`; no owner action appears. Skill badges indicate bounded catalog knowledge, not that Bankr called a tool.

- [ ] **Step 5: Add scoped responsive styles and real viewport checks**

Use existing warm Console variables. Keep assertions scoped to the new candidate/capability surface because the surrounding Console legitimately contains existing generic wallet forms. Ensure full-address break opportunities and no candidate-surface controls.

Add `smoke-console-skill-proposal.mjs` using the existing Playwright/Chromium pattern and deterministic Console mock state. At 320, 390, and 768 px, assert `scrollWidth <= clientWidth`, the full recipient/contract remain readable, and no candidate control or wallet-form prefill linkage exists.

- [ ] **Step 6: Run Chunk 1 GREEN**

Run the complete API suite from Task 3 plus the five browser tests above.

Expected: PASS.

- [ ] **Step 7: Run the web suite, build, and browser smoke**

```bash
node --test "apps/web/test/*.test.mjs"
NODE_OPTIONS=--max-old-space-size=1280 pnpm web:build
CHROMIUM_PATH=/snap/bin/chromium node apps/web/scripts/smoke-console-skill-proposal.mjs
```

Expected: all web tests pass; the build emits `dist/index.html`, `dist/console/index.html`, and hashed assets; real 320/390/768 px checks have no horizontal overflow.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/console-wallet-proposals.js apps/web/src/app.js apps/web/src/console-agent-thread.js apps/web/src/multipass-console.js apps/web/src/styles.css apps/web/scripts/smoke-console-skill-proposal.mjs apps/web/test/console-wallet-proposals.test.mjs apps/web/test/console-agent-thread.test.mjs apps/web/test/app.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
git commit -m "feat: render skill-aware transfer proposals"
```

---

## Chunk 2: Authoritative Wallet Evidence and Durable Proposal State

### Task 5: Pin the server wallet policy and asset allowlist

**Files:**
- Create: `apps/api/src/console-wallet-policy.js`
- Create: `apps/api/test/console-wallet-policy.test.mjs`
- Modify: `apps/web/test/looper-agent-wallet.test.mjs`

- [ ] **Step 1: Write policy RED tests**

Pin every authority-bearing release value used by the hardened reader: Base chain ID `8453`; Loopers proxy `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`, runtime length `177`, and SHA-256 `0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`; collection implementation `0x68f22e3563891167d37c86391c4a83449c83e908`, runtime length `23210`, and SHA-256 `0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`; canonical ERC-6551 registry `0x000000006551c19487814612e58FE06813775758`, runtime length `571`, and SHA-256 `0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56`; collection getters `erc6551Registry` = canonical registry, `erc6551Implementation` = legacy implementation `0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF`, and `erc6551Salt` = `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`; legacy `tokenBoundAccount(tokenId)` must equal deterministic registry derivation with those getter values; released executable implementation `0xf192f350427c8F58bC28e78b1e6Af164279F486e`; executable account runtime length `6096` and SHA-256 `0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c`; policy module registry `0x4e4df0DEa80e389802f819D95AAEe4CB004D3E1a`, runtime length `1234`, and runtime SHA-256 `0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb`.

Pin native ETH at 18 decimals with a conservative V1 maximum of `250000000000000000` base units. Pin CRED contract `0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3`, 18 authoritative decimals, deployed runtime length `10143`, runtime SHA-256 `0xf2127e5735da92360dab1141c47ec73737d639c25b56c1107d7ebec29dd66390`, and V1 maximum `100000000000000000000000` base units. Compare API pins against browser exports to prevent drift.

Assert the canonical allowlist hash includes chain; collection proxy/implementation addresses and runtime lengths/hashes; canonical registry address/runtime length/hash; exact collection getter values and legacy derivation rule; executable implementation/runtime length/hash; module-registry address/runtime length/hash; and each asset type/contract/decimals/code requirement/maximum. Symbol and display labels remain presentation-only and are excluded from authority.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/console-wallet-policy.test.mjs apps/web/test/looper-agent-wallet.test.mjs`

Expected: FAIL because API policy and complete release/asset pins are absent.

- [ ] **Step 3: Implement the static policy**

Export recursively frozen release and asset records plus `getConsoleWalletPolicyVersions()`. Canonicalize every authority-bearing field before hashing. No caller, environment variable, browser value, symbol, or model output may extend or override the closed policy.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test apps/api/test/console-wallet-policy.test.mjs apps/web/test/looper-agent-wallet.test.mjs
git add apps/api/src/console-wallet-policy.js apps/api/test/console-wallet-policy.test.mjs apps/web/test/looper-agent-wallet.test.mjs
git commit -m "feat: pin Console wallet proposal policy"
```

### Task 6: Add the closed server-authoritative wallet reader

**Files:**
- Create: `apps/api/src/console-wallet-reader.js`
- Create: `apps/api/test/console-wallet-reader.test.mjs`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`

- [ ] **Step 1: Write reader and server-configuration RED tests**

Require exactly three distinct configured HTTPS Base RPC origins with no URL credentials, fragments, duplicates, or non-Base chain identity. Name and test the server options `consoleProposalRpcPrimaryUrl`, `consoleProposalRpcSecondaryUrl`, and `consoleProposalRpcTertiaryUrl`, mapped only from `MULTIPASS_CONSOLE_PROPOSAL_RPC_PRIMARY_URL`, `MULTIPASS_CONSOLE_PROPOSAL_RPC_SECONDARY_URL`, and `MULTIPASS_CONSOLE_PROPOSAL_RPC_TERTIARY_URL`. Parse and validate them before constructing the reader; missing, malformed, duplicate, or partial configuration leaves proposal creation unavailable while ordinary chat remains text-only.

For every read, require all three origins to report chain ID `8453`, latest-head numbers within 6 blocks, and the same finalized anchor block number/hash/timestamp no older than 10 minutes. At that exact anchor require identical results from all origins for NFT owner, owner EOA code profile, Loopers proxy runtime, EIP-1967 implementation slot/address/runtime, collection ERC-6551 getter values, legacy `tokenBoundAccount` plus registry derivation, canonical registry runtime, executable registry-derived account, executable account implementation/runtime/canonical token binding, policy-module registry runtime length/hash, ETH balance, CRED runtime length/hash, CRED decimals, and CRED balance. Cover malformed/oversized RPC results, timeouts, unsupported anchored reads, unknown decimals, code/release drift, owner drift, stale anchor, and every origin disagreement. Never fall back to one or two origins.

Pin operational limits: each JSON-RPC response at most 262,144 bytes, each origin request timeout 4,000 ms, one complete unanimous read deadline 12,000 ms, request concurrency at most 3, and frozen evidence JSON at most 65,536 UTF-8 bytes. Tests exercise exact-boundary acceptance and one-unit-over rejection.

Assert a closed high-level API with no generic request export and add bootstrap/resource-closure tests proving failed startup and normal shutdown release every constructed dependency.

- [ ] **Step 2: Run RED before implementation**

Run:

```bash
node --test \
  apps/api/test/console-wallet-reader.test.mjs \
  apps/api/test/server.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs
```

Expected: FAIL because the reader, strict three-origin option validation, and cleanup behavior are absent.

- [ ] **Step 3: Implement unanimous anchored read-only plans**

Reuse the reviewed web reader’s canonical encoders/decoders as behavior, not browser objects. Freeze typed requests before I/O, use the static policy, cap each response and total operation time, and return one recursively frozen evidence object containing the common anchor and unanimous values. Use finalized block-number reads only after all three origins agree on its hash; reject any origin that cannot perform the anchored read. Never accept account, owner, balance, token list, code, anchor, decimals, or freshness from the caller.

- [ ] **Step 4: Wire server options without enabling proposals**

Add the three explicit server RPC URL options to `server.js` and production-bootstrap composition, with deterministic cleanup of every constructed reader/dependency. Missing or incomplete reader configuration keeps the Chunk 1 flag effectively unavailable; lifecycle routes remain unavailable and ordinary chat continues unchanged.

- [ ] **Step 5: Run focused GREEN and commit**

```bash
node --test \
  apps/api/test/console-wallet-reader.test.mjs \
  apps/api/test/server.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs
git add apps/api/src/console-wallet-reader.js apps/api/test/console-wallet-reader.test.mjs apps/api/src/server.js apps/api/src/console-production-bootstrap.js apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs
git commit -m "feat: add authoritative Console wallet reads"
```

### Task 7: Build the durable SQLite proposal store

**Files:**
- Create: `apps/api/src/console-proposal-store.js`
- Create: `apps/api/test/console-proposal-store.test.mjs`
- Create: `apps/api/test/fixtures/console-proposal-store-worker.mjs`

- [ ] **Step 1: Write migration, integrity, and archival RED tests**

Test `proposal_schema_migrations`, write-once immutable payload rows, lifecycle rows, immutable events, and permanent replay-key ledgers. Verify WAL and foreign keys are enabled on every connection; checksum mismatch and unknown newer versions refuse startup; restart persistence and clean close succeed; and V1 performs no automatic pruning.

Use a future archival/tombstone migration fixture that copies `proposal_id`, immutable-payload hash, the exact source tuple fields (`room_id`, `source_message_id`, `participant_id`, `proposing_looper_token_id`, `source_ordinal`, canonical bounded `skill_refs`, `candidate_hash`) and their canonical source-tuple hash, every idempotency-key hash, handoff/authorization/attempt IDs, transaction hash, terminal state, and terminal timestamp before deleting full rows/events. Prove active records plus tombstones jointly prevent reuse.

- [ ] **Step 2: Write lifecycle, timing, and multi-process RED tests**

Exercise every legal predecessor and reject every unlisted edge for:

`review_only`, `opened`, `claimed`, `claim_expired`, `prepared`, `expired_prepared`, `submission_authorized`, `authorization_revoked`, `authorization_expired`, `submitting`, `rejected_owner`, `expired`, `invalidated_owner`, `validation_failed`, `signature_rejected`, `submitted_hashless_unknown`, `submitted_hashed_pending`, `submitted_hashed_unknown`, `reverted`, `confirmed_attributed`.

Pin proposal TTL to 15 minutes, claim TTL to 2 minutes, and authorization lease TTL to 30 seconds. Treat `serverTime >= expiry` as expired. Test every precedence race and exactly one revision/event increment per successful transition.

Pin SQLite busy timeout to 2,000 ms, immutable payload JSON to 32,768 UTF-8 bytes, each evidence blob to 65,536 bytes, bounded reason codes to 64 bytes, and normalized idempotency request/result JSON to 16,384/65,536 bytes. Test exact-boundary acceptance and one-unit-over rejection.

First open two independent `DatabaseSync` connections to one temporary file in one process. Then use `child_process.fork()` with `apps/api/test/fixtures/console-proposal-store-worker.mjs` to race two separate Node processes against the same file through an IPC start barrier. Race identical and conflicting CAS/idempotency operations under `BEGIN IMMEDIATE`; cover the exact 2,000 ms busy timeout, lock contention, one-winner behavior, rollback, process exit/restart, and shared-file replay protection. An exact idempotent replay returns its stored original result without a new revision/event; a different key, stale revision, or conflicting body returns the current canonical record without being misreported as the original replay.

Assert immutable-payload hashes, event continuity and payload hashes, required/forbidden state evidence, permanent unique source/idempotency/handoff/authorization/attempt/hash keys, and deterministic server-time precedence at the database boundary. Corrupt payloads, checksum drift, event gaps/reordering, or state/evidence mismatch must mark the record execution-disabled and prevent further authority-bearing transitions.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/console-proposal-store.test.mjs`

Expected: FAIL because the store, integrity verifier, tombstone fixture, and multi-connection semantics are absent.

- [ ] **Step 4: Implement migrations and transactional store**

Use one dedicated `DatabaseSync` connection per store instance against the configured API database, `BEGIN IMMEDIATE`, the exact 2,000 ms busy timeout, explicit rollback, checksum-pinned migrations, bounded normalized JSON read-back, integrity verification on every authoritative load, and idempotent close. Keep all V1 records indefinitely; the archival fixture is test-only proof of the required future migration shape.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test apps/api/test/console-proposal-store.test.mjs
git add apps/api/src/console-proposal-store.js apps/api/test/console-proposal-store.test.mjs apps/api/test/fixtures/console-proposal-store-worker.mjs
git commit -m "feat: persist Console wallet proposals"
```

### Task 8: Create canonical proposals and authenticated lifecycle routes

**Files:**
- Create: `apps/api/src/console-proposal-service.js`
- Create: `apps/api/test/console-proposal-service.test.mjs`
- Modify: `apps/api/src/agent-runtime/index.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`

- [ ] **Step 1: Write proposal-creation and provenance RED tests**

Consume only server-internal normalized candidates no more than 2 minutes after the participant response was published. Persist these exact immutable provenance fields: `roomId`, `sourceMessageId`, `participantId`, `proposingLooperTokenId`, `sourceOrdinal`, canonical unique bounded `skillRefs`, `candidateHash`, and `publishedAt`. Define `sourceTupleHash` as SHA-256 of sorted-key canonical JSON containing exactly `roomId`, `sourceMessageId`, `participantId`, `proposingLooperTokenId`, `sourceOrdinal`, `skillRefs`, and `candidateHash`. Given that tuple, assert the service re-authorizes current ownership, reads unanimous authoritative evidence, validates policy/asset/balance and per-asset maximum, assigns ID/scope/server times/versions/anchor, and persists one immutable proposal plus initial event. The database uniqueness check and future tombstone ledger both use this exact hash and fields.

Reject absent or forged provenance, spoofed browser context, self-transfer, insufficient balance, amount over policy maximum, unsupported asset, stale owner, release/code/version drift, RPC disagreement, candidate context at `serverTime >= publishedAt + 2 minutes`, and any replayed source tuple.

- [ ] **Step 2: Write lifecycle route, authorization-binding, and negative-auth RED tests**

Add authenticated CSRF-protected POST routes:

- `/api/multipass/console/proposals/:id/open`
- `/reject`
- `/claim`
- `/bind-attempt`
- `/authorize-submit`
- `/consume-authorization`
- `/outcome`

Add authenticated GET `/api/multipass/console/proposals/:id`. Pin request bodies to 16,384 UTF-8 bytes, canonical route responses to 131,072 bytes, evidence bodies to 65,536 bytes, idempotency keys to 128 bytes before hashing, and IDs/fingerprints/hashes to their exact encoded lengths. Test exact-boundary acceptance and one-unit-over rejection.

Define and test this per-route binding matrix; every named field is compared to the canonical record rather than trusted from the caller:

- `GET`: authenticated wallet, room, selected Looper token, and current authoritative owner.
- `open`: proposal ID/revision, room/token, immutable-payload hash, and idempotency key.
- `reject`: all `open` bindings plus the existing handoff and/or authorization ID when the current state has one, and a bounded reason code.
- `claim`: all `open` bindings; returns exactly one handoff ID for the winning idempotency request.
- `bind-attempt`: proposal/revision, immutable-payload hash, room/token, owner, handoff ID, attempt ID, and exact transaction fingerprint.
- `authorize-submit`: all bind bindings plus connected signer; server re-derives and compares the transaction fingerprint.
- `consume-authorization`: all authorize bindings plus authorization ID and a 32-byte opaque one-time lease secret; compare its SHA-256 hash in constant time.
- `outcome`: proposal/revision, immutable-payload hash, room/token, owner/signer, handoff/attempt/authorization IDs, transaction fingerprint, normalized outcome-evidence hash, and transaction hash when present.

For every route, add negative tests changing each applicable matrix field one at a time. Also reject absent, expired, or revoked sessions; unauthorized GET; missing/invalid CSRF; wrong idempotency key; malformed or oversized bodies; and missing/contradictory outcome evidence. Bind every mutation to the authenticated owner and apply authoritative owner-drift/time precedence before its requested transition.

Pin exact replay semantics: an identical idempotency key plus identical normalized request returns the stored original response; a different key/body or stale revision returns the current canonical record with an explicit conflict code. Test every proposal/claim/authorization expiry boundary at `serverTime >= expiry`, all precedence races, and one revision/event increment only for the winning mutation.

For the closed authorize path, derive the transaction fingerprint from the immutable proposal and static policy—never caller calldata—and bind signer, proposal revision, immutable-payload hash, handoff/attempt IDs, chain, account, asset contract, authoritative decimals, recipient, base units, exact `to`/`value`/`data`, common anchor, catalog version, and allowlist version. Generate the 32-byte lease secret with a cryptographic RNG, return it exactly once from the winning authorization response, persist only its SHA-256 hash, never log or replay the plaintext, and compare the presented secret hash in constant time at consume. Persist only the closed fingerprint/evidence required by the design; no route exposes generic transaction construction authority.

- [ ] **Step 3: Run RED before implementation**

Run:

```bash
node --test \
  apps/api/test/console-proposal-service.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/server.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs
```

Expected: FAIL on missing service, strict provenance, route authorization, lifecycle semantics, and cleanup behavior.

- [ ] **Step 4: Implement proposal creation and message-route integration**

Remove browser `walletContext` as authoritative input. After inference publishes a participant response, call the proposal service only when the feature flag, durable store, closed policy, unanimous server reader, and proposal service are all ready. Ordinary text remains available on candidate rejection or wallet-read degradation. Return catalog capabilities and canonical proposals separately, each retaining the exact source-message/participant provenance.

When the flag is off or any dependency is missing, behavior remains text-only and lifecycle routes are unavailable. Bootstrap failure closes every dependency opened before the failure.

- [ ] **Step 5: Implement authenticated lifecycle routes and final revalidation**

Use server time, revision CAS, the exact per-route binding matrix, the exact precedence matrix, and authoritative ownership checks on every applicable mutation. `authorize-submit` performs final unanimous reads and transitions durably before returning the one-time 30-second lease secret exactly once. `consume-authorization` hashes and constant-time-compares the presented secret, then atomically destroys its usability while transitioning once to non-cancellable `submitting`; no expired, mismatched, replayed, or revoked lease reaches a wallet boundary. Route responses contain bounded canonical proposal/lease metadata only—no wallet/provider object, signing method, broadcast method, raw transaction, arbitrary calldata, or generic RPC authority. Chunk 2 performs no wallet invocation.

- [ ] **Step 6: Run GREEN, closure checks, and the complete API suite**

```bash
node --test \
  apps/api/test/console-skill-catalog.test.mjs \
  apps/api/test/strict-json-envelope.test.mjs \
  apps/api/test/console-transfer-candidate.test.mjs \
  apps/api/test/console-wallet-policy.test.mjs \
  apps/api/test/console-wallet-reader.test.mjs \
  apps/api/test/console-proposal-store.test.mjs \
  apps/api/test/console-proposal-service.test.mjs \
  apps/api/test/bankr-llm.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs \
  apps/api/test/server.test.mjs
node --test "apps/api/test/*.test.mjs"
```

Expected: PASS. Flag-off and missing-dependency cases remain text-only with routes unavailable; resource closure is verified; no test crosses a wallet/provider, signing, broadcast, or generic transaction boundary.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/console-proposal-service.js apps/api/src/agent-runtime/index.js apps/api/src/index.js apps/api/src/server.js apps/api/src/console-production-bootstrap.js apps/api/test/console-proposal-service.test.mjs apps/api/test/console-agent-runtime.test.mjs apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs
git commit -m "feat: create canonical Console wallet proposals"
```

---

## Chunk 3: Owner Review and One-Shot ERC-6551 Handoff

### Task 9: Add closed proposal lifecycle clients

**Files:**
- Modify: `apps/web/src/console-agent-api.js`
- Modify: `apps/web/test/console-agent-api.test.mjs`

- [ ] **Step 1: Write RED tests**

Assert message requests no longer send browser wallet context. Add exact clients for get/open/reject/claim/bind/authorize/consume/outcome with cookie credentials, CSRF on writes, proposal/revision/idempotency fields, and no generic path or transaction input.

- [ ] **Step 2: Run RED**

Run: `node --test apps/web/test/console-agent-api.test.mjs`

Expected: FAIL on old wallet-context body and missing proposal methods.

- [ ] **Step 3: Implement closed methods and run GREEN**

Run: `node --test apps/web/test/console-agent-api.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/console-agent-api.js apps/web/test/console-agent-api.test.mjs
git commit -m "feat: add Console proposal lifecycle client"
```

### Task 10: Bind proposal identity to wallet attempts

**Files:**
- Modify: `apps/web/src/looper-agent-wallet-controller.js`
- Modify: `apps/web/test/looper-agent-wallet-controller.test.mjs`

- [ ] **Step 1: Write proposal-bound preparation RED tests**

Add `prepareProposalTransfer({ proposalId, proposalRevision, handoffId, immutablePayloadHash, transfer })`. Assert it accepts only native/CRED closed fields, uses current selected owner/account, persists linkage before returning, includes authoritative decimals in the semantic fingerprint, and cannot be reconstructed from malformed/missing local storage.

- [ ] **Step 2: Write one-shot submission RED tests**

Extend `submitPrepared` with `beforeWalletBoundary({ attempt, transactionFingerprint })`. It must run inside the existing Web Lock after current RPC and wallet-chain checks, immediately before `submitTransaction`; a missing/revoked/expired/mismatched server permit prevents the wallet call. Assert one callback and one wallet invocation maximum.

- [ ] **Step 3: Run RED**

Run: `node --test apps/web/test/looper-agent-wallet-controller.test.mjs`

Expected: FAIL on missing proposal methods/linkage.

- [ ] **Step 4: Implement attempt schema upgrade**

Add optional proposal linkage only to send attempts. Preserve old attempts as read-only/invalidated according to existing migration behavior. Never store server credentials or generic calldata authority.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test apps/web/test/looper-agent-wallet-controller.test.mjs
git add apps/web/src/looper-agent-wallet-controller.js apps/web/test/looper-agent-wallet-controller.test.mjs
git commit -m "feat: bind proposals to Looper wallet attempts"
```

### Task 11: Implement immutable owner review controls

**Files:**
- Modify: `apps/web/src/console-agent-thread.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/console-agent-thread.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Write RED tests for exact controls**

`review_only` exposes Open/Reject; `opened` exposes one explicit checkbox and Prepare; `claimed/prepared/submission_authorized/submitting` disables duplicate controls and shows exact state; uncertainty/revert/success show recovery evidence. No editable recipient/asset/amount fields appear in proposal cards.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test \
  apps/web/test/console-agent-thread.test.mjs \
  apps/web/test/multipass-console.test.mjs \
  apps/web/test/mobile-layout.test.mjs
```

Expected: FAIL on missing lifecycle actions.

- [ ] **Step 3: Implement semantic controls**

Use full addresses and base units, `<button type="button">`, associated checkbox labels, `aria-live` state, visible focus, and disabled/loading/double-click guards. Skill/symbol remain badges only.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test apps/web/test/console-agent-thread.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
git add apps/web/src/console-agent-thread.js apps/web/src/multipass-console.js apps/web/src/styles.css apps/web/test/console-agent-thread.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
git commit -m "feat: add immutable wallet proposal review"
```

### Task 12: Orchestrate claim, prepare, authorize, consume, and reconcile

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/src/console-wallet-proposals.js`
- Modify: `apps/web/test/console-wallet-proposals.test.mjs`

- [ ] **Step 1: Write end-to-end browser RED tests**

Use injected API/controller/wallet fixtures to prove:

1. Open/reject never calls the wallet.
2. Confirm acquires a proposal-scoped Web Lock, claims once, prepares once, binds once, authorizes once, consumes once, then invokes the wallet once.
3. Two tabs/devices and duplicate clicks recover one handoff/attempt.
4. Claim/proposal/authorization expiry races follow server state.
5. API failure before consume signs nothing.
6. Crash after authorization or consume never authorizes another invocation.
7. Signature rejection, hashless uncertainty, hashed pending/unknown, reverted, and confirmed-attributed remain distinct.
8. Late original transactions reconcile only the consumed proposal.
9. Missing/corrupt local attempt after authorization disables retry/reconstruction.

- [ ] **Step 2: Run RED**

Run: `node --test apps/web/test/console-wallet-proposals.test.mjs apps/web/test/app.test.mjs`

Expected: FAIL on missing orchestration.

- [ ] **Step 3: Implement handlers and recovery**

Add handlers to the existing single `handlers` map and event binder. Use proposal ID/revision from frozen state, secure random idempotency keys, the server lifecycle client, and the controller’s final callback. Persist local attempt first; report outcome idempotently. On disagreement, refresh canonical server state and never synthesize success.

- [ ] **Step 4: Run GREEN and complete web suite**

```bash
node --test apps/web/test/console-wallet-proposals.test.mjs apps/web/test/app.test.mjs
node --test "apps/web/test/*.test.mjs"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app.js apps/web/src/console-wallet-proposals.js apps/web/test/app.test.mjs apps/web/test/console-wallet-proposals.test.mjs
git commit -m "feat: execute owner-approved wallet proposals"
```

---

## Chunk 4: Rollout Gates and Proof

### Task 13: Complete production dependency gating

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`
- Modify: `apps/api/src/index.d.ts`

- [ ] **Step 1: Write RED configuration tests**

Retain Chunk 1's proven default-off and malformed-boolean behavior. Add tests that an explicit enable cannot start without the durable database, authoritative reader, frozen skill catalog, and proposal service. Bankr chat remains independently controlled by its existing flag.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs`

- [ ] **Step 3: Implement composition and startup refusal**

Compose the Chunk 1 flag with the completed durable dependencies and refuse incomplete enabled startup. Keep production disabled in repository/runtime config. Do not edit `/etc/default`, systemd, nginx, or live services.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs
git add apps/api/src/server.js apps/api/src/console-production-bootstrap.js apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs apps/api/src/index.d.ts
git commit -m "feat: gate Console wallet proposals"
```

### Task 14: Add one mocked full-stack acceptance test

**Files:**
- Create: `apps/api/test/console-skill-wallet-flow.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Build deterministic fixtures**

Use mocked Bankr response, three RPC origins, authenticated owner, SQLite file, browser API boundary, wallet controller, transaction hash, receipt, and trace. No network, signing, or real transaction.

- [ ] **Step 2: Prove the complete happy path**

Bankr-aware candidate → canonical proposal → exact rendered record → one owner confirmation → one prepared attempt → one consumed authorization → one wallet invocation → exact attributed receipt.

- [ ] **Step 3: Prove hostile/recovery paths**

Prompt injection, duplicate JSON, spoofed browser context, ownership drift, balance drift, API outage, double click, second device, server restart, corrupt storage, late receipt, and transaction mismatch must never create a second attempt or report false success.

- [ ] **Step 4: Run acceptance GREEN and commit**

```bash
node --test apps/api/test/console-skill-wallet-flow.test.mjs apps/web/test/app.test.mjs
git add apps/api/test/console-skill-wallet-flow.test.mjs apps/web/test/app.test.mjs
git commit -m "test: prove skill-aware wallet proposal flow"
```

### Task 15: Final verification and deployment-readiness report

**Files:**
- Modify only if verification finds a defect.

- [ ] **Step 1: Run syntax checks**

```bash
node --check apps/api/src/console-skill-catalog.js
node --check apps/api/src/strict-json-envelope.js
node --check apps/api/src/console-transfer-candidate.js
node --check apps/api/src/console-wallet-policy.js
node --check apps/api/src/console-wallet-reader.js
node --check apps/api/src/console-proposal-store.js
node --check apps/api/src/console-proposal-service.js
node --check apps/web/src/console-wallet-proposals.js
```

Expected: all exit 0.

- [ ] **Step 2: Run focused security suites**

Run every new/modified API and web test named in this plan.

Expected: all pass, zero skipped authority tests.

- [ ] **Step 3: Run full repository test suite**

Run: `pnpm test`

Expected: all tests pass; record exact count and duration.

- [ ] **Step 4: Run production build with bounded heap**

Run: `NODE_OPTIONS=--max-old-space-size=1280 pnpm web:build`

Expected: build succeeds and produces all current route entries.

- [ ] **Step 5: Verify diff and boundaries**

```bash
git diff --check
git status --short
git log --oneline bbec681..HEAD
```

Scan for `eth_sendTransaction`, generic `.request`, `calldata`, `BANKR_API_KEY`, `BANKR_LLM_KEY`, `SKILL.md`, and proposal execution flags. Every occurrence must belong to an already-approved boundary or a test asserting exclusion.

- [ ] **Step 6: Mobile UI proof**

Render the proposal states at 320, 390, 768, and desktop widths. Verify zero horizontal overflow, full-address readability, keyboard focus, disabled/loading controls, and no editable proposal fields. Save screenshots outside tracked source unless explicitly requested.

- [ ] **Step 7: Produce readiness report**

Report commits, files, RED/GREEN evidence, full suite count, build result, feature flag state, and explicit statement: no deploy, restart, config mutation, signing, broadcast, or production enablement occurred.

---

## Execution Order

1. Complete and review Chunk 1; it must produce a useful non-executable skill-aware proposal slice.
2. Complete and review Chunk 2; do not expose owner controls before authoritative reads and durable state pass.
3. Complete and review Chunk 3; do not invoke the wallet without the consumed server authorization and existing controller checks.
4. Complete and review Chunk 4; leave the production flag off.
5. Production rollout, API restart, GitHub push, and any live wallet transaction require their normal separate gates.

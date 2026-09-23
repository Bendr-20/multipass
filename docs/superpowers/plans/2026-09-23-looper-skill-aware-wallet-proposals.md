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

Test exact Bankr descriptor keys, recursive freezing, stable canonical SHA-256 version, bounded strings/arrays, and absence of functions, paths, commands, URLs containing credentials, or secret-like fields.

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

Export `getConsoleSkillCatalog()` and `getConsoleSkillCatalogPromptProjection()`. Canonicalize with sorted keys before hashing; return recursively frozen plain JSON. Include Bankr’s descriptive capabilities (`market_research`, `portfolio_read`, `transfer`, `swap`, `token_launch`) while enabling only `explain` and `propose_transfer`.

- [ ] **Step 4: Run GREEN and boundary scan**

Run: `node --test apps/api/test/console-skill-catalog.test.mjs`

Expected: PASS with no executable values or secret/path fields.

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

Cover duplicate keys at every nesting level, accessors/prototypes, mixed prose plus JSON, trailing bytes, depth/byte/member limits, arrays with holes, and valid escaped strings. The decoder must return plain JSON only.

```js
assert.throws(() => parseStrictJsonObject('{"assistant_text":"a","assistant_text":"b"}'), /duplicate/i);
assert.throws(() => parseStrictJsonObject('prefix {"schema_version":"0.1.0"}'), /exact json/i);
assert.deepEqual(parseStrictJsonObject('{"a":{"b":1}}'), { a: { b: 1 } });
```

- [ ] **Step 2: Run strict decoder RED**

Run: `node --test apps/api/test/strict-json-envelope.test.mjs`

Expected: FAIL because the strict decoder is missing.

- [ ] **Step 3: Implement a bounded lexical duplicate-key check, then `JSON.parse`**

Track object frames, decoded string keys, arrays, escapes, and nesting. Reject duplicate decoded keys before calling `JSON.parse`; cap input at 16 KiB, depth at 12, object members at 64, and arrays at 8.

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

Reject unknown keys, more than one candidate, fake IDs/status/scope/approval/execution, calldata, router/spender/slippage, signed/fractional/exponent/hex/leading-zero/overflow amounts, unsupported skills, and overlong text. Mixed/malformed output returns bounded text only and zero candidates.

- [ ] **Step 5: Implement candidate normalization**

Export `decodeConsoleLlmEnvelope(content, { catalog })`. Return `{ text, skillRefs, transferCandidates }`; use viem `getAddress`, canonical unsigned decimal validation, exact key sets, and frozen output. Never assign proposal identity or scope here.

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
- Modify: `apps/api/test/bankr-llm.test.mjs`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`

- [ ] **Step 1: Write Bankr prompt and response RED tests**

Assert the system prompt receives only the catalog projection and says descriptors are knowledge, not callable tools. Assert the request asks for the exact envelope and the adapter returns normalized `transferCandidates`; malformed content returns text with no candidates.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/bankr-llm.test.mjs apps/api/test/console-agent-runtime.test.mjs`

Expected: FAIL on missing skill context/candidate handling.

- [ ] **Step 3: Extend the Bankr adapter**

Pass `skills` to `generate`, include the catalog projection in the trusted system prompt, request one exact JSON envelope, decode only the message content, and return:

```js
{ provider: 'bankr_llm_gateway', text, skillRefs, transferCandidates }
```

Do not add Bankr Agent API, CLI, function-calling tools, credentials, or execution methods.

- [ ] **Step 4: Replace text-derived transfer proposals**

Keep the existing watch/research proposal path unchanged. Collect candidate arrays from participant responses separately as `proposalCandidates`; do not mark them executable and do not assign scope in the runtime.

- [ ] **Step 5: Run GREEN and regressions**

Run:

```bash
node --test \
  apps/api/test/console-skill-catalog.test.mjs \
  apps/api/test/strict-json-envelope.test.mjs \
  apps/api/test/console-transfer-candidate.test.mjs \
  apps/api/test/bankr-llm.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs
```

Expected: PASS; legacy watch proposals remain review-only.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bankr-llm/index.js apps/api/src/agent-runtime/index.js apps/api/test/bankr-llm.test.mjs apps/api/test/console-agent-runtime.test.mjs
git commit -m "feat: make Console inference skill aware"
```

### Task 4: Render the non-executable proposal and capability slice

**Files:**
- Create: `apps/web/src/console-wallet-proposals.js`
- Create: `apps/web/test/console-wallet-proposals.test.mjs`
- Modify: `apps/web/src/console-agent-thread.js`
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/console-agent-thread.test.mjs`
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Write review-card RED tests**

Render exact full chain/account/owner/recipient/token contract/decimals/base units/formatted amount/expiry/state fields. Treat skill and symbol as presentation only. Assert there is no submit button, editable form, calldata, provider, or generic send-field prefill in Chunk 1.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test \
  apps/web/test/console-wallet-proposals.test.mjs \
  apps/web/test/console-agent-thread.test.mjs \
  apps/web/test/multipass-console.test.mjs \
  apps/web/test/mobile-layout.test.mjs
```

Expected: FAIL because canonical transfer cards/capabilities are absent.

- [ ] **Step 3: Implement frozen browser view-model validation**

Validate canonical server proposal payloads with exact keys and frozen output. Do not accept lifecycle authority from DOM fields or data attributes.

- [ ] **Step 4: Render capabilities and non-executable review cards**

Show `Understands`, `Can propose`, and `Cannot execute directly`. Render transfer candidates as “Awaiting server verification” until Chunk 2 creates a canonical proposal; no owner action appears yet.

- [ ] **Step 5: Add responsive/accessibility styles**

Use existing warm Console variables. Ensure 320/390/768 px wrapping, full-address break opportunities, visible keyboard focus, minimum 44 px future controls, and no horizontal overflow.

- [ ] **Step 6: Run Chunk 1 GREEN**

Run the API tests from Task 3 plus the four browser tests above.

Expected: PASS.

- [ ] **Step 7: Run the web suite and build**

```bash
node --test "apps/web/test/*.test.mjs"
NODE_OPTIONS=--max-old-space-size=1280 pnpm web:build
```

Expected: all web tests pass; build emits `dist/index.html`, `dist/console/index.html`, and hashed assets.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/console-wallet-proposals.js apps/web/src/console-agent-thread.js apps/web/src/multipass-console.js apps/web/src/styles.css apps/web/test/console-wallet-proposals.test.mjs apps/web/test/console-agent-thread.test.mjs apps/web/test/multipass-console.test.mjs apps/web/test/mobile-layout.test.mjs
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

Pin Base `8453`, Loopers `0x1649…94a`, ERC-6551 registry, released implementation/runtime SHA-256, salt, module registry/runtime SHA-256, native ETH decimals, and CRED `0xAB3f…7Ba3`/18 decimals. Compare API pins against browser exports to prevent drift. Assert canonical catalog/allowlist hashes.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/console-wallet-policy.test.mjs apps/web/test/looper-agent-wallet.test.mjs`

Expected: FAIL because API policy is absent.

- [ ] **Step 3: Implement the static policy**

Export immutable release and asset records plus `getConsoleWalletPolicyVersions()`. Symbol remains presentation-only; address, decimals, runtime and hashes are authoritative.

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
- Modify: `apps/api/test/server.test.mjs`

- [ ] **Step 1: Write reader RED tests with injected RPC clients**

Cover three-origin Base chain/head quorum, anchored owner, derived account, implementation/runtime, canonical account binding, ETH balance, CRED code/decimals/balance, unknown decimals, code drift, owner drift, origin disagreement, timeout, and stale anchor. Assert a closed high-level API with no generic request export.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/console-wallet-reader.test.mjs`

Expected: FAIL because the server reader is absent.

- [ ] **Step 3: Implement read-only typed RPC plans**

Reuse the reviewed web reader’s canonical encoders/decoders as behavior, not browser objects. Freeze typed requests before I/O, use the static policy, cap response bytes/time, and return one frozen evidence object. Never accept account, balance, token list, anchor, or decimals from the caller.

- [ ] **Step 4: Wire server options without enabling proposals**

Add explicit server RPC URL options. Missing or incomplete reader config keeps skill-proposal creation unavailable; ordinary chat continues.

- [ ] **Step 5: Run focused GREEN and commit**

```bash
node --test apps/api/test/console-wallet-reader.test.mjs apps/api/test/server.test.mjs
git add apps/api/src/console-wallet-reader.js apps/api/test/console-wallet-reader.test.mjs apps/api/src/server.js apps/api/test/server.test.mjs
git commit -m "feat: add authoritative Console wallet reads"
```

### Task 7: Build the durable SQLite proposal store

**Files:**
- Create: `apps/api/src/console-proposal-store.js`
- Create: `apps/api/test/console-proposal-store.test.mjs`

- [ ] **Step 1: Write migration and schema RED tests**

Test `proposal_schema_migrations`, immutable payload rows, lifecycle rows, events, permanent replay keys, WAL/foreign keys, checksum mismatch refusal, unknown newer version refusal, restart persistence, and no automatic pruning.

- [ ] **Step 2: Write lifecycle RED tests**

Exercise every legal predecessor and reject every unlisted edge for:

`review_only`, `opened`, `claimed`, `claim_expired`, `prepared`, `expired_prepared`, `submission_authorized`, `authorization_revoked`, `authorization_expired`, `submitting`, `rejected_owner`, `expired`, `invalidated_owner`, `validation_failed`, `signature_rejected`, `submitted_hashless_unknown`, `submitted_hashed_pending`, `submitted_hashed_unknown`, `reverted`, `confirmed_attributed`.

Assert required/forbidden evidence, revision CAS, exact event sequence, idempotent repeats, permanent unique source/idempotency/handoff/authorization/attempt/hash keys, and deterministic server-time precedence.

- [ ] **Step 3: Run RED**

Run: `node --test apps/api/test/console-proposal-store.test.mjs`

Expected: FAIL because the store is absent.

- [ ] **Step 4: Implement migrations and transactional store**

Use a dedicated `DatabaseSync` connection to the configured API database, `BEGIN IMMEDIATE`, explicit rollback, checksum-pinned migrations, and exact normalized JSON read-back. Keep all V1 records indefinitely.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test apps/api/test/console-proposal-store.test.mjs
git add apps/api/src/console-proposal-store.js apps/api/test/console-proposal-store.test.mjs
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
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`

- [ ] **Step 1: Write proposal-creation RED tests**

Given a normalized candidate, assert the API re-authorizes current ownership, reads authoritative evidence, validates policy/asset/balance, assigns ID/scope/time/versions/anchor, hashes the candidate, and persists one immutable proposal. Reject spoofed browser context, self-transfer, insufficient balance, unsupported asset, stale owner, release drift, RPC disagreement, and replayed source tuple.

- [ ] **Step 2: Write lifecycle route RED tests**

Add authenticated CSRF-protected POST routes:

- `/api/multipass/console/proposals/:id/open`
- `/reject`
- `/claim`
- `/bind-attempt`
- `/authorize-submit`
- `/consume-authorization`
- `/outcome`

Add authenticated GET `/api/multipass/console/proposals/:id`. Bind every route to session wallet, room, selected token, revision, and idempotency key. Return current canonical state on idempotent replay/conflict.

- [ ] **Step 3: Run RED**

Run:

```bash
node --test \
  apps/api/test/console-proposal-service.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/console-production-bootstrap.test.mjs
```

Expected: FAIL on missing service/routes.

- [ ] **Step 4: Implement proposal creation and message-route integration**

Remove browser `walletContext` as authoritative input. After inference returns candidates, call the proposal service only when the feature flag, durable store, and server reader are all ready. Ordinary text remains available on candidate rejection or wallet-read degradation. Return catalog capabilities and canonical proposals separately.

- [ ] **Step 5: Implement lifecycle routes and final revalidation**

Use server time and the exact precedence matrix. `authorize-submit` transitions durably before returning a lease. `consume-authorization` transitions to non-cancellable `submitting`; no expired/revoked lease reaches the browser wallet boundary.

- [ ] **Step 6: Run GREEN and API suite**

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
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/console-proposal-service.js apps/api/src/agent-runtime/index.js apps/api/src/index.js apps/api/src/server.js apps/api/src/console-production-bootstrap.js apps/api/test/console-proposal-service.test.mjs apps/api/test/console-agent-runtime.test.mjs apps/api/test/console-production-bootstrap.test.mjs
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

### Task 13: Wire the default-off production flag

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Modify: `apps/api/test/server.test.mjs`
- Modify: `apps/api/test/console-production-bootstrap.test.mjs`
- Modify: `apps/api/src/index.d.ts`

- [ ] **Step 1: Write RED configuration tests**

Assert the flag defaults false, rejects malformed booleans, and cannot enable without durable database + authoritative reader + skill catalog + proposal service. Bankr chat remains independently controlled by its existing flag.

- [ ] **Step 2: Run RED**

Run: `node --test apps/api/test/server.test.mjs apps/api/test/console-production-bootstrap.test.mjs`

- [ ] **Step 3: Implement composition and startup refusal**

Add `MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED`. Keep production disabled in repository/runtime config. Do not edit `/etc/default`, systemd, nginx, or live services.

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

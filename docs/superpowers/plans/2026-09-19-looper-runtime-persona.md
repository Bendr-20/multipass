# Looper Runtime Persona Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground every Bankr-powered Console Looper in its canonical token personality and Looper-scoped Sibyl continuity.

**Architecture:** Normalize trusted token metadata into a bounded server-side persona snapshot only after ownership/controller authorization. Carry that snapshot through the canonical runtime profile and render it into the Bankr system prompt while preserving review-only permissions and safe fallback behavior.

**Tech Stack:** Node.js ESM, native `fetch`, Bankr OpenAI-compatible chat completions, Sibyl memory adapter, Node test runner.

---

## Chunk 1: Canonical persona path and prompt grounding

### Task 1: Normalize trusted Looper persona metadata

**Files:**
- Create: `apps/api/src/looper-persona.js`
- Create: `apps/api/test/looper-persona.test.mjs`
- Modify: `apps/api/src/console-production-bootstrap.js`
- Test: `apps/api/test/console-production-bootstrap.test.mjs`

- [ ] Write failing tests proving Looper #614-style metadata normalizes into bounded `canonicalName`, `agentClass`, `specialization`, `riskProfile`, `autonomy`, `voice`, `firstMission`, and `codexVersion` fields; malformed/missing metadata returns `null`.
- [ ] Run `node --test apps/api/test/looper-persona.test.mjs` and confirm failure before implementation.
- [ ] Implement `normalizeLooperPersona` and `createLooperPersonaLoader` with HTTPS trusted-base fetch, trimming, length bounds, and null fallback.
- [ ] Wire the loader into the production `authorizeLooper` wrapper so persona hydration occurs only after `authorizeLooperControl` succeeds.
- [ ] Run focused persona/bootstrap tests and confirm pass.

### Task 2: Preserve persona in the canonical runtime profile

**Files:**
- Modify: `apps/api/src/agent-runtime/index.js:185-230`
- Modify: `apps/api/test/console-agent-runtime.test.mjs`

- [ ] Add a failing test proving `createRuntimeProfile` retains server-derived persona fields alongside the canonical Looper/ERC-8004 root identity and stable Sibyl namespace.
- [ ] Run the focused test and confirm the persona assertion fails.
- [ ] Add a bounded `profile.persona` projection from `canonicalIdentity.persona`; do not read persona from browser request fields.
- [ ] Add an API regression test showing a client-supplied `body.persona` is ignored in favor of the authorizer's canonical persona.
- [ ] Run `node --test apps/api/test/console-agent-runtime.test.mjs` and confirm pass.

### Task 3: Ground Bankr generations in identity, voice, and continuity

**Files:**
- Modify: `apps/api/src/bankr-llm/index.js:55-82`
- Modify: `apps/api/test/bankr-llm.test.mjs`

- [ ] Add a failing request-capture test asserting the Bankr system prompt contains Looper identity, class, specialization, risk, autonomy, voice, first mission, Sibyl continuity guidance, and review-only safety guidance.
- [ ] Assert the prompt tells the model not to claim it has no personality or that every session starts fresh when canonical persona/continuity are provided.
- [ ] Run `node --test apps/api/test/bankr-llm.test.mjs` and confirm failure.
- [ ] Implement the minimal structured persona section in `buildSystemPrompt`, using bounded labels and retaining existing review-only constraints.
- [ ] Run focused Bankr/runtime tests and confirm pass.

### Task 4: Verify, deploy, and prove Looper #614 behavior

**Files:**
- Modify only if a defect is found during verification.

- [ ] Run focused API tests for persona, Bankr, runtime, bootstrap, API routes, and Looper ownership.
- [ ] Run the complete API test suite, syntax checks, `git diff --check`, and secret/generated-file scans.
- [ ] Restart only `multipass-api-xmtp-holder-proof.service`, then verify active state, zero restarts, and public nonce/authorization behavior.
- [ ] Issue an authenticated live request through the existing safe proof harness for Looper #614 asking `Who are you?`; verify the response identifies as Looper #614, uses the Trader/Broker market-making persona, recognizes Sibyl continuity, and preserves review-only execution.
- [ ] Commit only the verified persona implementation/tests, push the submission branch, and report the exact commit plus any remaining browser-side XMTP blocker separately.

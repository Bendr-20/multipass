# Multipass Console Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Multipass Console into a wallet-signed control surface where a Looper can be activated into a hosted, XMTP-addressable, Sibyl-backed agent.

**Architecture:** Multipass remains the identity/control layer. XMTP carries wallet-native human-agent messages, Sibyl stores and recalls durable private memory, and a hosted Node/TypeScript agent worker loads the selected Looper activation profile before calling an LLM through the Bankr LLM Gateway when enabled. The Console renders the agent thread, memory-backed briefings, signal modules, missions, and review-only proposals.

**Tech Stack:** Multipass API/web monorepo, Node 22, Vite, Privy wallet auth, viem, XMTP SDK, Sibyl Memory API, Bankr LLM Gateway, existing Multipass saved-record store.

---

## Timing

Do not wait passively for the hackathon window.

Work now:

- Lock architecture and product plan.
- Confirm XMTP and Sibyl SDK/API details.
- Prepare non-leaking demo fixtures.
- Build UI shell and local interfaces where they do not depend on judged integration.
- Keep the Loopers mint/mainnet launch path separate.

Work during Sep 1-10 hackathon window:

- Land the load-bearing Sibyl memory integration.
- Land the XMTP-backed agent thread.
- Record a fresh-session recall demo.
- Publish the repo/submission assets required by the hackathon.

Reason: the hackathon gate is that Sibyl Memory does real work in the submitted build. Prepping now is fine; the demo must clearly show fresh-session recall powered by Sibyl, not prewritten copy.

## Product Boundary

V1 should not host one server per Looper and should not create funded autonomous trading wallets.

V1 does:

- Verify wallet ownership of a Looper or use a non-leaking demo fixture.
- Activate a Looper into a Multipass agent profile.
- Give that profile an XMTP messaging identity.
- Let the human chat with the agent inside Multipass Console.
- Persist durable memory through Sibyl.
- Route Looper inference through Bankr LLM Gateway when configured and funded.
- Generate briefings and review-only proposals from remembered goals plus signal data.

V1 does not:

- Execute trades.
- Transfer custody.
- Store private keys in the browser.
- Put Sibyl, XMTP, LLM config, or autonomous logic into the NFT mint contract.
- Promise external partner integrations until their APIs/contracts are verified.

## Inference Model

Use Bankr LLM Gateway as the preferred inference provider for Looper agent runtime.

Why Bankr fits:

- It gives holders a clear utility story: Looper activation includes sponsored/free inference while credits last.
- It aligns with existing Helixa/Bankr ecosystem positioning.
- It provides one gateway for Claude, Gemini, GPT, and other models.
- It gives usage/cost tracking per request.
- It keeps model/provider choice behind a Multipass runtime boundary instead of hardcoding one vendor into the Console.

Runtime rule:

- The browser never receives the Bankr API key.
- The hosted agent worker calls `https://llm.bankr.bot`.
- The worker should support `BANKR_LLM_KEY` or `BANKR_API_KEY` from server env.
- Real Bankr calls are behind `MULTIPASS_AGENT_BANKR_LLM_ENABLED=1`; the default route uses the local adapter so an unsigned public Console request cannot drain sponsored inference credits.
- If Bankr LLM Gateway is not configured or returns a credit/permission failure, the runtime should show a clear unavailable state or use an explicitly configured fallback provider for development only.
- Holder-facing copy can say "included agent inference" only when quota, funding, and eligibility are actually enforced.

Possible holder utility:

- Each activated Looper gets a daily/monthly sponsored inference allowance.
- Heavy usage can later require `$CRED`, top-up, staking, or paid plans.
- Mission/proposal generation can consume quota separately from ordinary chat.
- Bankr cost tracking becomes an admin/operator metric in Multipass Console.

## Hosting And Cost Model

V1 source of the agent worker:

- Build it ourselves as a small Node service inside the existing Multipass API codebase, or as a sibling `multipass-agent-worker` systemd service on the same host.
- Start with one shared worker for all activated Loopers.
- Route each message by activation profile ID instead of launching one process/server per Looper.
- Split it into a separate service later only when message volume, uptime isolation, or queueing pressure requires it.

Known current hosting baseline:

- Multipass API already runs as a Node systemd service on `127.0.0.1:8788`.
- First worker can reuse this host and database path, so early hosting cost should be close to zero beyond existing server load.

Cost buckets:

- **Hosting:** near-zero for V1 if the existing server handles it; later maybe a small VPS/service upgrade.
- **Bankr LLM:** paid from Bankr LLM credits. The configured gateway currently has credits, but holder-facing free inference still needs quotas.
- **XMTP:** usage-based USDC message fees. XMTP docs estimate roughly `$5 per 100,000 messages`, plus app-chain/gas reserve considerations.
- **Sibyl:** depends on their API/plan/hackathon access; verify before promising production economics.
- **Signal data:** mocked/light live feeds for V1; paid data APIs only after the demo proves useful.

Guardrail:

- Never expose the Bankr key, XMTP agent key material, Sibyl credentials, or funded wallets in the browser.
- The first demo can sponsor inference centrally, but production needs per-holder/per-Looper rate limits before marketing "included inference."

## File Structure

- Modify: `docs/loopers/sibyl-activation-demo.md`
  - Keep the hackathon story and XMTP/Sibyl communication model current.
- Modify: `docs/loopers/build-task-index.md`
  - Track activation demo implementation tasks.
- Create: `apps/api/src/agent-runtime/`
  - Hosted agent runtime boundary, profile loading, LLM orchestration, memory extraction, signal context.
- Create: `apps/api/src/sibyl-memory/`
  - Sibyl client interface, namespace construction, save/recall/search adapters, test doubles.
- Create: `apps/api/src/xmtp-agent/`
  - XMTP inbox/client wrapper, message listener, send/reply helpers, test doubles.
- Create: `apps/api/src/console-agent-routes.js`
  - API routes for activation status, agent thread bootstrap, mission/proposal state, and local smoke hooks.
- Modify: `apps/api/src/index.js`
  - Wire new routes behind explicit configuration flags.
- Create: `apps/api/test/console-agent-runtime.test.mjs`
  - Runtime tests with fake LLM, fake Sibyl, fake XMTP.
- Create: `apps/api/test/sibyl-memory.test.mjs`
  - Namespace and memory adapter tests.
- Create: `apps/api/test/xmtp-agent.test.mjs`
  - Messaging adapter tests.
- Modify: `apps/web/src/multipass-console.js`
  - Add Agent Thread, Missions, Signals, Memory, and Proposal panels to the existing Console.
- Create: `apps/web/src/console-agent-thread.js`
  - Thread rendering, composer state, message/proposal UI helpers.
- Modify: `apps/web/test/multipass-console.test.mjs`
  - Assert the Console renders the agent thread and review-only proposal model.
- Modify: `apps/web/test/app.test.mjs`
  - Route-level smoke coverage.

## Task 1: Confirm SDK/API Integration Paths

- [ ] **Step 1: Inspect XMTP SDK docs and examples**

Run:

```bash
pnpm view @xmtp/node-sdk version
pnpm view @xmtp/browser-sdk version
```

Expected: versions resolve without install.

- [ ] **Step 2: Verify Bankr LLM Gateway access**

Run:

```bash
bankr llm models
bankr llm credits
```

Expected: gateway returns available models and a positive credit balance. If access is beta-gated, record the exact blocker and use a local fake LLM adapter until access is enabled.

- [ ] **Step 3: Inspect Sibyl Memory API docs**

Find required auth, endpoints, SDK package, namespace model, and rate limits.

Expected: document the exact save, recall, and search calls before implementation.

- [ ] **Step 4: Record integration notes**

Update `docs/loopers/sibyl-activation-demo.md` with concrete XMTP, Sibyl, and Bankr LLM Gateway API choices.

## Task 2: Define The Activation Runtime Model

- [ ] **Step 1: Write tests for activation profile shape**

Test that an activated Looper profile can carry:

- token contract
- token ID
- owner wallet
- agent display name
- XMTP inbox reference
- Sibyl memory namespace
- risk posture
- mission list
- proposal list

- [ ] **Step 2: Implement minimal runtime profile helpers**

Create helpers under `apps/api/src/agent-runtime/` for loading a runtime profile from a saved Multipass record or demo fixture.

- [ ] **Step 3: Run API tests**

Run:

```bash
node --test apps/api/test/console-agent-runtime.test.mjs
```

Expected: new profile tests pass.

## Task 3: Add Sibyl Memory Adapter

- [ ] **Step 1: Write fake-client tests first**

Test:

- namespace includes wallet + Looper token ID + activation ID
- durable preferences can be saved
- recall returns relevant prior context
- search can filter by mission/watchlist terms

- [ ] **Step 2: Implement adapter interface**

Create:

- `saveMemory(input)`
- `recallMemory(input)`
- `searchMemory(input)`
- `extractDurableMemoryFromMessage(message)`

- [ ] **Step 3: Add real Sibyl client behind env config**

Only enable real API calls when Sibyl credentials are configured.

Expected fallback: demo/test mode uses fake memory store and clearly marks itself as local.

## Task 4: Add XMTP Agent Messaging Adapter

- [ ] **Step 1: Write messaging tests with fake XMTP client**

Test:

- can open or identify an agent thread
- can receive a human message
- can send a Looper reply
- does not expose or require trading wallet keys

- [ ] **Step 2: Implement XMTP wrapper**

Create a server-side wrapper for:

- agent inbox initialization
- thread lookup
- message receive
- message send

- [ ] **Step 3: Add config guardrails**

Require explicit env vars for real XMTP mode. Keep local demo mode available for UI/test work.

## Task 5: Build Hosted Agent Runtime Loop

- [ ] **Step 1: Write end-to-end fake runtime test**

Input:

```text
Watch NVDAx, Base agent tokens, and vaults. Keep risk medium or lower.
```

Expected:

- message is received
- durable watchlist/risk memory is saved
- memory is recalled
- LLM prompt includes Looper identity, memory, missions, and signals
- response is sent through XMTP adapter
- review-only proposal can be produced

- [ ] **Step 2: Implement runtime orchestrator**

Runtime order:

1. Load activation profile.
2. Receive message.
3. Recall Sibyl memory.
4. Pull signal context.
5. Build LLM prompt.
6. Generate response through Bankr LLM Gateway when configured.
7. Extract durable memory.
8. Save memory to Sibyl.
9. Send response through XMTP.
10. Emit mission/proposal updates.

- [ ] **Step 3: Keep proposal execution disabled**

Proposal objects should be review-only in V1.

## Task 6: Integrate Agent Thread Into Console

- [ ] **Step 1: Write renderer tests**

Assert Console renders:

- selected Looper/agent identity
- embedded Agent Thread
- message composer
- memory status
- mission cards
- signal cards
- review-only proposal cards

- [ ] **Step 2: Implement UI components**

Add `apps/web/src/console-agent-thread.js` and wire it into `multipass-console.js`.

- [ ] **Step 3: Add empty/loading/error states**

States:

- wallet not connected
- no Looper selected
- Looper not activated
- XMTP unavailable
- Sibyl unavailable
- runtime unavailable

## Task 7: Demo Fresh-Session Recall

- [ ] **Step 1: Create a non-leaking demo Looper fixture**

Use placeholder art/profile data. Do not expose unrevealed Looper assets.

- [ ] **Step 2: Run first session**

Save a watchlist, risk preference, and mission through the agent thread.

- [ ] **Step 3: Restart browser/session**

Reconnect wallet and reopen the same Looper.

- [ ] **Step 4: Verify recall**

Expected: the agent references the saved watchlist/risk preference through Sibyl recall and uses it in a new signal briefing.

## Task 8: Hackathon Submission Prep

- [ ] **Step 1: Add README section**

Explain:

- what Multipass Console is
- how Sibyl Memory is load-bearing
- where XMTP is used
- what partner stacks do real work
- what is demo-only vs production-ready

- [ ] **Step 2: Record 2-5 minute demo**

Required scene:

- wallet sign-in
- activate Looper
- chat through agent thread
- save memory
- cold restart
- recall memory
- signal briefing
- review-only proposal

- [ ] **Step 3: Final verification**

Run:

```bash
pnpm test
pnpm web:build
```

Expected: all tests and build pass.

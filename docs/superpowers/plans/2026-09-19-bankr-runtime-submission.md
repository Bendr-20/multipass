# Bankr RUNTIME Submission Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a polished, production-backed Multipass Console submission that a remote judge can understand in under three minutes without weakening holder authorization.

**Architecture:** Keep the authenticated Console and API authority boundaries unchanged. Refine the existing Console renderer/state flow into a chat-first journey, add a static public `/multipass/runtime` judge packet driven by one structured evidence source, and generate public documentation from that source. Capture production proof separately through the authenticated holder flow; never use mock state as live evidence.

**Tech Stack:** Vanilla ES modules, Vite, Node.js test runner, Puppeteer/Chromium capture, existing Multipass API, Bankr LLM Gateway, XMTP, Sibyl, ERC-8004, nginx/static deployment.

---

## File Map

**Create**
- `apps/web/src/runtime-submission-data.js` — single public source for submission copy, proof cards, links, safety boundaries, and artifact metadata.
- `apps/web/src/runtime-submission.js` — pure renderer for the public judge packet.
- `apps/web/test/runtime-submission.test.mjs` — judge-route renderer, copy, safety, and link tests.
- `apps/web/scripts/generate-runtime-artifact-manifest.mjs` — deterministic Markdown generator from the structured data source.
- `apps/web/scripts/capture-bankr-runtime-submission.mjs` — authenticated production capture verifier and artifact writer.
- `apps/web/test/runtime-submission-capture.test.mjs` — production-origin, prohibited-marker, and redaction tests.
- `docs/hackathon/bankr-runtime-artifact-manifest.md` — generated public artifact inventory.
- `docs/hackathon/bankr-runtime-submission.md` — final reusable submission payload and pitches.
- `apps/web/public/runtime/demo.mp4` — deliberately promoted public primary recording after redaction review.
- `apps/web/public/runtime/demo-30s.mp4` — deliberately promoted public short cut.
- `apps/web/public/runtime/console-desktop.png` — reviewed 1280×720 production screenshot.
- `apps/web/public/runtime/console-mobile.png` — reviewed 390×844 production screenshot.
- `apps/web/public/runtime/runtime-proof.png` — reviewed production evidence frame.

**Modify**
- `apps/web/src/multipass-console.js` — chat-first hierarchy, proof gating, compact identity/roster drawers, clear states.
- `apps/web/src/console-agent-thread.js` — mission/composer state copy and safe recovery wording where needed.
- `apps/web/src/app.js` — runtime page kind/route, single-owned-Looper auto-selection preservation rules, page rendering and metadata.
- `apps/web/src/styles.css` — dominant chat layout, compact proof rail, responsive single-column mobile behavior.
- `apps/web/scripts/write-allowlist-entry.mjs` — emit `dist/runtime/index.html` with dedicated canonical/social metadata.
- `apps/web/package.json` — manifest generation and authenticated capture commands.
- `apps/web/test/multipass-console.test.mjs` — proof-label gates, hierarchy, state copy, hidden detail, stale-copy removal.
- `apps/web/test/app.test.mjs` — route behavior, wallet/session selection clearing, single-agent selection, runtime page.
- `apps/web/test/build-config.test.mjs` — runtime static output and metadata.
- `docs/hackathon/bankr-runtime-console-demo.md` — reconcile with verified production Bankr/XMTP/Sibyl proof.
- `README.md` and `docs/loopers/README.md` — remove local-only/pending claims and link the judge packet.

**Do not modify**
- Wallet-signature, CSRF, ownership, ERC-8004 controller, XMTP participant, or proposal-execution authority rules except to add tests proving existing behavior.
- Contract state, Looper assets, payout code, mint code, or unrelated sales-bot work.

---

## Task 0: Lock the official form, branch, and authority regressions

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-bankr-runtime-submission-design.md`
- Modify: `docs/superpowers/plans/2026-09-19-bankr-runtime-submission.md`
- Inspect only: current Git history/index/worktree and existing authorization tests.

- [ ] Record `https://runtime.nyc/submit`, the **2026-09-20 04:00 UTC** cutoff, online recorded-demo requirement, public-link/no-upload rule, and all confirmed limits before writing final media/copy.
- [ ] Freeze `/home/ubuntu/multipass` on `submission/bankr-runtime-2026-09-19` at `f29eb1c`; its seven inherited sales-bot/media commits are excluded from the submission.
- [ ] Create `/home/ubuntu/multipass-bankr-submit` on `submission/bankr-runtime-clean-2026-09-19` directly from `origin/main`; do not cherry-pick the seven ahead commits. Port only reviewed Console foundation and submission paths, selecting mixed-file hunks and regenerating the lockfile from selected manifests.
- [ ] Record the exact staged-path allowlist before the first commit. Use `git add -p` for mixed files and inspect `git diff --cached --name-status` plus `git diff --cached` before every commit.
- [ ] Run the existing authority baseline exactly:
  `node --test apps/api/test/console-auth.test.mjs apps/api/test/console-production-bootstrap.test.mjs apps/api/test/console-agent-runtime.test.mjs apps/api/test/loopers-owned-agents.test.mjs apps/api/test/secure-looper-activation.test.mjs apps/api/test/bankr-llm.test.mjs apps/api/test/sibyl-memory.test.mjs apps/api/test/xmtp-agent.test.mjs apps/api/test/xmtp-worker.test.mjs apps/web/test/console-agent-api.test.mjs apps/web/test/xmtp-wallet-registration.test.mjs`.
- [ ] Preserve or add explicit assertions for one-time signed challenge, HttpOnly session, CSRF write protection, server-derived wallet/token/agent/thread/conversation IDs, fresh `ownerOf` and ERC-8004 controller authorization, canonical conversation binding, one XMTP database owner, Sibyl wallet-agent namespace isolation, server-only Bankr credentials, unrelated-wallet `403`, unauthenticated `401`, and non-executable review-only proposals.

## Chunk 1: Console Judge Journey

### Task 1: Lock proof-label and hierarchy behavior with failing tests

**Files:**
- Modify: `apps/web/test/multipass-console.test.mjs`
- Modify: `apps/web/test/app.test.mjs`

- [ ] Add a renderer test where no runtime evidence exists; assert `Bankr gateway`, `XMTP live`, and `Sibyl memory` are absent while `Review-only` and ERC-8004 appear only with their minimum evidence.
- [ ] Add a renderer test with `inferenceProvider: bankr_llm_gateway`, `transport: xmtp_group`, a non-empty server conversation, `memoryProvider: sibyl_memory`, numeric ERC-8004 ID, and `executionMode: review_only`; assert the five proof labels appear in a full-width drawer above both Console panels.
- [ ] Add a single-owned-Looper app test; after authenticated roster load, assert the sole token is selected automatically and its canonical room is opened without another selector click.
- [ ] Add wallet-change/logout tests; assert selected token, thread, room, and private memory state clear.
- [ ] Add one failing test per state: wallet connecting, challenge signing, owned-Looper loading, holder XMTP setup, canonical room opening, mission sending, Bankr waiting, Sibyl saving, Sibyl recalling, cancellation, authorization failure, transport failure, and retry.
- [ ] After each test addition, run the named test with `node --test --test-name-pattern='<exact test name>' <test file>` and require an assertion failure caused by missing copy/markup—not a syntax or setup error—before changing production code.
- [ ] Add markup assertions that identity detail and roster are collapsed secondary drawers and chat/composer remain primary.
- [ ] Add a stale-copy scan rejecting live-mint, generic admin-dashboard, and unproven provider language.
- [ ] For each behavior, implement only the smallest snapshot/controller/markup change that makes its named test pass, rerun that named test, then rerun `node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs` before moving to the next behavior.
- [ ] Make a commit-sized checkpoint after proof gating, after selection/session boundaries, and after responsive hierarchy; do not batch unrelated behavior into one opaque diff.

### Task 2: Implement the minimal chat-first Console snapshot and renderer

**Files:**
- Modify: `apps/web/src/multipass-console.js`
- Modify: `apps/web/src/console-agent-thread.js`

- [ ] Add explicit evidence booleans derived only from returned runtime fields:
  - Bankr: `inferenceProvider === 'bankr_llm_gateway'`.
  - XMTP: `transport === 'xmtp_group'` plus a non-empty server-bound conversation.
  - Sibyl: `memoryProvider === 'sibyl_memory'`; show saved and recalled counts separately.
  - ERC-8004: canonical numeric agent ID exists on the selected owned-agent record.
  - Review-only: runtime execution mode is `review_only` and proposals remain non-executable.
- [ ] Render a compact full-width proof drawer immediately above the two-panel Console grid, with only evidence-supported labels.
- [ ] Keep the identity card compact: image, name, Looper token ID, ERC-8004 ID; move dossier, participants, rename, and technical context into closed drawers.
- [ ] Make the mission composer and conversation the dominant content.
- [ ] Replace raw/internal state labels with short recovery copy and one primary action per state.
- [ ] Ensure errors contain no raw provider payloads or private identifiers.
- [ ] Run the focused tests and make them pass.

### Task 3: Enforce selection/session boundaries in the app controller

**Files:**
- Modify: `apps/web/src/app.js`
- Test: `apps/web/test/app.test.mjs`

- [ ] Auto-select the sole freshly confirmed owned Looper after authenticated roster load.
- [ ] Preserve a selection only for the same authenticated wallet/session and only while that token remains in the fresh roster.
- [ ] Clear selection, canonical room, messages, proposals, and private memory when wallet/session changes or ownership disappears.
- [ ] Do not create a room or show XMTP live until the server returns a canonical non-empty conversation.
- [ ] Run the focused app tests and make them pass.

### Task 4: Implement responsive chat-first styling

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/multipass-console.test.mjs`

- [ ] Desktop: restrained identity rail and dominant conversation column at 1280×720.
- [ ] Mobile: single-column conversation-first layout at 390×844, compact proof chips, optional identity drawer, reachable composer, no horizontal overflow.
- [ ] Reduce visual weight of roster/dossier drawers and remove redundant status blocks.
- [ ] Keep visible keyboard focus and disabled/loading states.
- [ ] Run Console tests; then capture local 1280×720 and 390×844 screenshots as development diagnostics only.
- [ ] After deployment, retain production screenshots at both sizes and record checks for `document.body.scrollWidth <= window.innerWidth`, complete image loads, reachable composer/primary action, no clipped controls, correct chat-first hierarchy, and zero browser console errors.

---

## Chunk 2: Public Judge Packet

### Task 5: Create structured public submission data and renderer tests

**Files:**
- Create: `apps/web/src/runtime-submission-data.js`
- Create: `apps/web/src/runtime-submission.js`
- Create: `apps/web/test/runtime-submission.test.mjs`

- [ ] Write failing tests for the exact content order: thesis, demo CTA, Console/repository links, six-part runtime rail, authority boundary, three proof cards, architecture, verification, safety, documents/source.
- [ ] Test that the page clearly says live Console use requires Looper ownership.
- [ ] Test that public data contains no cookies, CSRF values, credentials, private memory, raw XMTP IDs, inbox IDs, participant mappings, or local database paths.
- [ ] Test that public proof labels are explicit summaries, not fabricated live status.
- [ ] Implement the static data and pure renderer to pass the tests.

### Task 6: Route and build `/multipass/runtime`

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/scripts/write-allowlist-entry.mjs`
- Modify: `apps/web/test/app.test.mjs`
- Modify: `apps/web/test/build-config.test.mjs`

- [ ] Add `MULTIPASS_RUNTIME_PATH` and a `runtime` page kind before generic profile matching.
- [ ] Render the judge packet without authenticated API calls or wallet prompts.
- [ ] Set dedicated document title, description, canonical URL, Open Graph, and X metadata.
- [ ] Emit `apps/web/dist/runtime/index.html` during `pnpm web:build`.
- [ ] Add route/build tests and verify the static output contains the dedicated metadata.

### Task 7: Generate the public artifact manifest

**Files:**
- Create: `apps/web/scripts/generate-runtime-artifact-manifest.mjs`
- Modify: `apps/web/package.json`
- Create: `docs/hackathon/bankr-runtime-artifact-manifest.md`
- Test: `apps/web/test/runtime-submission.test.mjs`

- [ ] Generate Markdown deterministically from `runtime-submission-data.js`.
- [ ] Include artifact path/URL, public/private status, source evidence, verification command, and final URL where known.
- [ ] Fail generation if a public artifact contains prohibited private fields.
- [ ] Run generation twice and assert no diff.

---

## Chunk 3: Proof, Docs, Deployment, Submission

### Task 8: Reconcile public documentation and submission copy

**Files:**
- Modify: `docs/hackathon/bankr-runtime-console-demo.md`
- Create: `docs/hackathon/bankr-runtime-submission.md`
- Modify: `README.md`
- Modify: `docs/loopers/README.md`

- [ ] Replace pending/local-only Bankr and XMTP claims with the verified production state and capture date.
- [ ] State the authority boundary precisely: scoped room replies may publish through the authorized XMTP room; onchain, asset-moving, administrative, public, and proposal execution actions require holder review/signature.
- [ ] Add title, one-line summary, 100-word description, long description, problem, solution, Bankr role, architecture, live state, safety model, demo instructions, links, screenshot captions, and 30-second/two-minute pitches.
- [ ] Validate project name (120), summary (2,000), project/video/repository URLs (2,048), submitter name (120), email (254), X handle (15 excluding optional `@`), and optional team members (1,000) against the confirmed `https://runtime.nyc/submit` limits.

### Task 9: Verify and deploy the candidate Console and judge packet

**Files:** no production edits unless a failing check proves a defect.

- [ ] Run the exact authority regression command from Task 0 plus `node --test apps/web/test/multipass-console.test.mjs apps/web/test/app.test.mjs apps/web/test/runtime-submission.test.mjs apps/web/test/runtime-submission-capture.test.mjs apps/web/test/build-config.test.mjs`.
- [ ] Run `pnpm test`, `git diff --check`, syntax checks, cache/private-file scan, and secret-pattern scan; record exact results.
- [ ] This sprint is static-web-only unless a separately failing authorization/runtime test proves an API defect. Do not restart or reroute the API for Console layout, judge packet, docs, or media changes.
- [ ] Build with `MULTIPASS_BASE=/multipass/ VITE_PRIVY_APP_ID=cmlv6ibdm00350el2jsm8m8s6 pnpm --filter @helixa/multipass-web build`; verify `dist/console/index.html`, `dist/runtime/index.html`, the public wallet config, a unique submission marker in generated assets, and `/multipass/assets/` entry paths.
- [ ] Create `/home/ubuntu/backups/multipass-<UTC timestamp>/` by copying `/var/www/helixa.xyz/multipass/`, verify the backup, then publish only `apps/web/dist/` with `rsync -a --delete apps/web/dist/ /var/www/helixa.xyz/multipass/`.
- [ ] Roll back any failed live gate with `rsync -a --delete /home/ubuntu/backups/multipass-<UTC timestamp>/ /var/www/helixa.xyz/multipass/`; record the exact backup path and hashes privately.
- [ ] Verify the candidate Console and runtime routes return `200`, load all required assets, show no browser errors, and have no overflow at 1280×720 or 390×844.

### Task 10: Capture authenticated production proof, promote media, and deploy the final packet

**Files:**
- Create: `apps/web/scripts/capture-bankr-runtime-submission.mjs`
- Create: `apps/web/test/runtime-submission-capture.test.mjs`
- Modify: `apps/web/package.json`
- Promote only after review: `apps/web/public/runtime/*`

- [ ] Write failing tests for production-origin enforcement, prohibited `mock`/`fixture`/`local_bankr_adapter`/`xmtp_local` markers, required evidence labels, and redaction.
- [ ] Use the host-side signer entry point `apps/web/scripts/capture-bankr-runtime-submission.mjs` with non-secret inputs `CONSOLE_CAPTURE_URL=https://helixa.xyz/multipass/console`, `CONSOLE_API_BASE=https://helixa.xyz/multipass-api`, `CONSOLE_HOLDER_CONFIG=/home/ubuntu/.config/helixa/bendr-wallet.json`, `CONSOLE_TOKEN_ID=2431`, and `CHROMIUM_PATH=/snap/bin/chromium`. The mode-600 holder config is read only by the Node host process and must never be copied, overwritten, logged, passed in argv, or imported into browser JavaScript.
- [ ] In the host process, request `/api/multipass/console/session/nonce`, sign the returned challenge with the verified holder account loaded from the config, call `/api/multipass/console/session/verify`, and retain the returned session cookie and CSRF token in memory only. Do not print or serialize the key, cookie, signature, challenge, or CSRF token.
- [ ] Create a temporary harness under the mode-700 private output directory that imports production UI code, supplies only a connected non-signing wallet snapshot, proxies production API requests with the production Origin, injects the in-memory session cookie through the browser context and CSRF token through an initialization script, and exposes no signer or signing callback to the page. Delete the harness, browser context, cookies, and session artifacts after capture.
- [ ] Write raw output only under `/home/ubuntu/private/bankr-runtime-submission/<UTC timestamp>/` with mode `0700`. Redacted JSON may contain only production origin, public token/agent IDs, provider/transport/memory/execution labels, timestamp, screenshot basenames, and pass/fail checks; reject cookies, authorization, CSRF, private keys, signatures, signer material, inbox/participant maps, database paths, and raw conversation/message IDs.
- [ ] On the deployed candidate, select Looper #2431, send the approved mission, capture Bankr/XMTP/Sibyl/Review-only evidence, destroy the browser/session context, authenticate a fresh context through the same host-only flow, and prove recall.
- [ ] Render the 2–3 minute MP4 and 30-second cut privately; inspect every frame. Promote only approved redacted assets to `apps/web/public/runtime/` as `demo.mp4`, `demo-30s.mp4`, `console-desktop.png`, `console-mobile.png`, and `runtime-proof.png`.
- [ ] Rebuild and redeploy the static bundle with the Task 9 backup/rollback procedure. Require `200`, expected MIME, nonzero size, and matching SHA-256 for every public media URL under `https://helixa.xyz/multipass/runtime/`.

### Task 11: Final verification, commit, and push

**Files:** deliberate staged subset in `/home/ubuntu/multipass-bankr-submit` only.

- [ ] Execute the authenticated production mission, fresh-session Sibyl recall, XMTP delivery, unrelated-wallet `403`, unauthenticated `401`, deployed desktop/mobile layout, asset, and browser-console checks; inspect service logs for new warnings/errors.
- [ ] Exclude caches, private capture output, databases, secrets, unrelated Loopers contract/mint/sales work, and generated private evidence.
- [ ] Inspect staged names/content and run secret scans before each commit.
- [ ] Commit the approved design, plan, Console UX, judge packet, proof tooling, promoted public media, and submission docs in reviewable commits on `submission/bankr-runtime-clean-2026-09-19`.
- [ ] Verify effective GitHub identity and push the clean branch without force. Do not submit the external form yet.

### Task 12: Reconcile final evidence and obtain submission approval

**Files:**
- Modify: `apps/web/src/runtime-submission-data.js`
- Regenerate: `docs/hackathon/bankr-runtime-artifact-manifest.md`
- Modify: `docs/hackathon/bankr-runtime-console-demo.md`
- Modify: `docs/hackathon/bankr-runtime-submission.md`

- [ ] Insert actual public media URLs, exact pushed commit/branch, focused/full test counts, build result, deployment timestamp, route checks, authenticated Bankr/XMTP/Sibyl summaries, `401`/`403` safety results, and rollback reference.
- [ ] Regenerate the manifest twice and require the second generation to produce no diff; rerun packet/build/capture tests, rebuild, redeploy, and reverify every public link and hash.
- [ ] Validate exact form values against `https://runtime.nyc/submit` and verify Console, packet, repository, video, screenshots, and documentation return `200` without authentication and expose no private fields.
- [ ] Present the complete irreversible form payload to Quigley for explicit approval. Only after approval, submit once and retain the resulting public project link plus the self-contained bundle.

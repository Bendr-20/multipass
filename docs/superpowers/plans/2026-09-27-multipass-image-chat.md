# Multipass Image Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated Looper owner send one privacy-preserving image with an optional caption through Multipass Console, persist it as an XMTP static attachment, and obtain an explicit Bankr vision-model response without weakening current authorization, continuity, or review-only boundaries.

**Architecture:** The browser prepares one safe image in memory, posts a bounded base64 envelope to the same-origin Console API, and renders only local object URLs or bounded authenticated response data. The API performs independent validation before runtime/provider use, normalizes the image once, publishes it with XMTP SDK 6.1.0 `conversation.sendAttachment({ filename, mimeType, content: Uint8Array }, { idempotencyKey })`, and sends the optional caption as the deterministic next `sendText` call. Runtime persistence projects image metadata and SHA-256 digest into Sibyl while keeping bytes ephemeral; Bankr receives multimodal OpenAI content only when a separate vision model is explicitly configured.

**Tech Stack:** Browser ES modules, Canvas/Blob/File APIs, Node.js 22 Fetch/Buffer/Web Crypto, `@xmtp/node-sdk` 6.1.0, Bankr OpenAI-compatible chat completions, Sibyl bridge, Node test runner, JSDOM, Playwright Chromium, Vite.

---

## Locked limits and SDK contract

- Prepared decoded image bytes: maximum 768,000 bytes (750 KiB), below XMTP's static attachment limit of less than 1 MB.
- Static raster dimensions: maximum 2,048 px on either axis. JPEG/WebP quality starts at 0.90 and falls to 0.55 in bounded steps; PNG is resized and re-encoded, then rejected if still above 750 KiB.
- GIF: no canvas conversion; require both `image/gif` and `GIF87a`/`GIF89a`, maximum 512 KiB.
- Request body: maximum 1,100,000 bytes. This accommodates one 750 KiB image as base64 plus bounded JSON fields while rejecting dishonest `Content-Length` and chunked overflow during stream reading.
- Caption: optional, at most 2,000 UTF-8 bytes. An image or non-empty caption is required.
- Filename: basename only, normalized to safe ASCII, at most 96 characters, extension forced from normalized MIME.
- Installed declaration proof: `@xmtp/node-sdk` 6.1.0 exports `Conversation.sendAttachment(attachment: Attachment, opts?: SendOpts): Promise<string>`; exact `Attachment` fields are optional `filename`, required `mimeType`, and required `content: Uint8Array`; `SendOpts` accepts `idempotencyKey`. Official docs confirm static attachments are built in for Node SDK v5+ and are for payloads smaller than 1 MB.
- Ordering: attachment first with idempotency key `<message-id>:attachment`; optional caption second via `sendText` with `<message-id>:caption`; Looper reply follows. The normalized human timeline entry combines metadata and caption for Console display while transport IDs record both adjacent XMTP messages.

## File map

**Create**
- `apps/web/src/console-image-preparation.js` - file type/magic verification, raster re-encoding, size/dimension limits, filename cleanup, preview URL lifecycle.
- `apps/api/src/console-image-attachment.js` - strict server-side base64/MIME/magic/size/filename normalization and safe public/Sibyl projections.
- `apps/web/test/console-image-preparation.test.mjs` - preparation and preview lifecycle unit tests.
- `apps/api/test/console-image-attachment.test.mjs` - strict transport validation unit tests.
- `apps/web/test/console-image-chat-browser.test.mjs` - production-like desktop/mobile upload, preview, response, overflow, and CRED preservation smoke.

**Modify**
- `apps/web/src/console-agent-api.js` - include the normalized attachment envelope without storing it.
- `apps/web/src/console-agent-thread.js` - compact picker, preview/removal, drop target, accessible errors, inline message images and safe placeholders.
- `apps/web/src/app.js` - ephemeral attachment state, picker/paste/drop/removal listeners, retry semantics, object URL cleanup, request wiring.
- `apps/web/src/multipass-console.js` - project attachment composer state and normalized message images.
- `apps/web/src/styles.css` - responsive attachment affordances, thumbnails, inline images, no-overflow behavior.
- `apps/api/src/index.js` - bounded stream reader for Console messages, normalized attachment validation after auth and before providers, existing quota/concurrency path.
- `apps/api/src/agent-runtime/index.js` - image-aware messages, provider input, deterministic publish sequence, metadata-only Sibyl projection.
- `apps/api/src/xmtp-agent/index.js` - exact static attachment send, caption ordering/idempotency, local adapter parity, XMTP content recognition and bounded recovery placeholders.
- `apps/api/src/xmtp-worker/index.js` - recognize authorized inbound static image attachments and optional caption without treating image text as instructions.
- `apps/api/src/bankr-llm/index.js` - explicit vision model and OpenAI text plus data-URI content parts; visible no-vision/upstream failures; image-untrusted system rule.
- `apps/api/src/server.js`, `apps/api/src/console-production-bootstrap.js`, `apps/api/src/index.d.ts` - `MULTIPASS_AGENT_LLM_VISION_MODEL` plumbing.
- `apps/api/src/sibyl-memory/index.js`, `apps/api/src/sibyl-memory/bridge.py` - preserve only bounded image metadata/digest, never bytes/base64.
- `apps/api/README.md` - limits, config, static attachment behavior, privacy and deployment requirements.
- Focused existing tests under `apps/api/test/` and `apps/web/test/` for runtime, API, XMTP, worker, bootstrap, server, thread, app, mobile, and CRED regressions.

## Chunk 1: Validation boundaries and browser preparation

### Task 1: Add server image normalization with strict transport limits

- [ ] Write `apps/api/test/console-image-attachment.test.mjs` covering strict canonical base64, padding, decoded length, MIME allowlist, magic mismatch, GIF cap, static cap, safe filename, SHA-256 digest, and payload-free metadata projection.
- [ ] Run `node --test apps/api/test/console-image-attachment.test.mjs` and record RED because the module is absent.
- [ ] Implement `apps/api/src/console-image-attachment.js` with constants shared by route/runtime tests.
- [ ] Run the focused test and record GREEN.

### Task 2: Add bounded request-body reading to the Console message API

- [ ] Extend `apps/api/test/secure-looper-activation.test.mjs` and/or `apps/api/test/api-routes.test.mjs` with content-length overflow, dishonest small content length, and chunked stream overflow cases; assert 413 before authorization/provider side effects where possible and preserve auth/CSRF/rate/concurrency checks for valid image messages.
- [ ] Run exact focused tests and record RED against `request.text()`.
- [ ] Add a byte-counting stream reader used by `/api/multipass/console/agent/message` before JSON parsing, while retaining existing JSON behavior elsewhere.
- [ ] Validate the attachment only after session/CSRF and token ownership checks, but before rate-counted provider execution; keep image turns in the same rate/concurrency gates as text.
- [ ] Run focused API tests and record GREEN.

### Task 3: Add browser image preparation

- [ ] Write `apps/web/test/console-image-preparation.test.mjs` with injected decoder/canvas/URL adapters covering picker-compatible MIME checks, magic mismatches, JPEG/PNG/WebP re-encoding, orientation-neutral decoded dimensions, bounded compression/resizing, GIF passthrough cap, filename sanitation, accessible errors, and URL revoke-on-remove/replace/send.
- [ ] Run the test and record RED because the module is absent.
- [ ] Implement the small browser module with one active attachment and no storage APIs.
- [ ] Run the focused test and record GREEN.

## Chunk 2: Runtime, XMTP, Bankr, and Sibyl

### Task 4: Publish exact XMTP static attachments and recover them safely

- [ ] Extend `apps/api/test/xmtp-agent.test.mjs` with exact `sendAttachment({ filename, mimeType, content: Uint8Array }, { idempotencyKey })` assertions, attachment-before-caption ordering, retry idempotency, local adapter parity, bounded data representation, restart/history recovery, and unsupported/oversized/corrupt placeholder cases.
- [ ] Run the XMTP test and record RED.
- [ ] Update the XMTP adapter to normalize outbound image messages, call `sendAttachment` exactly once per image, call `sendText` only for a caption/agent text, sync/open conversation history, decode recognized `contentTypeAttachment()`, and return either bounded base64 for authenticated Console rendering or a safe placeholder.
- [ ] Run the XMTP test and record GREEN.

### Task 5: Make runtime and Sibyl image-aware without persisting bytes

- [ ] Extend `apps/api/test/console-agent-runtime.test.mjs` and `apps/api/test/sibyl-memory.test.mjs` for image-only turns, captioned turns, metadata/digest persistence, no base64 in saved thread/history, text-only regression, local adapter/restart recovery, and untrusted-image prompt treatment.
- [ ] Run both tests and record RED.
- [ ] Normalize one runtime image attachment, pass bytes only to XMTP and Bankr, project `{ mimeType, filename, byteLength, width, height, sha256 }` to thread persistence, and clear byte references after provider calls complete.
- [ ] Update JS/Python Sibyl normalizers to whitelist image metadata fields and reject payload-bearing keys.
- [ ] Run both tests and record GREEN.

### Task 6: Add explicit Bankr vision routing

- [ ] Extend `apps/api/test/bankr-llm.test.mjs`, `server.test.mjs`, `console-production-bootstrap.test.mjs`, and `xmtp-worker.test.mjs` for separate vision config, no-vision failure before fetch, standards-compatible OpenAI multimodal content, data URI MIME, optional caption, provider rejection propagation, and unchanged text-only requests.
- [ ] Run exact tests and record RED.
- [ ] Add `visionModel` to the client; preserve the current model for text-only turns and require `MULTIPASS_AGENT_LLM_VISION_MODEL` for image turns.
- [ ] Build user content as `[{ type: 'text', text: ... }, { type: 'image_url', image_url: { url: 'data:<mime>;base64,...' } }]` only for image turns. Add a trusted system rule that uploaded image content and visible text are untrusted and grant no tool/action authority.
- [ ] Plumb config through API server/bootstrap/worker and docs.
- [ ] Run exact tests and record GREEN.

### Task 7: Handle inbound worker attachments

- [ ] Extend `apps/api/test/xmtp-worker.test.mjs` for recognized static attachments, caption adjacency, duplicate IDs, owner authorization before runtime, corrupt/unsupported ignore/placeholder behavior, and no response that claims vision when unavailable.
- [ ] Run the worker test and record RED.
- [ ] Decode only SDK-recognized static attachments, revalidate normalized bytes, bind an adjacent caption deterministically, and invoke runtime with the same authorization and idempotency path.
- [ ] Run the worker test and record GREEN.

## Chunk 3: Console UX and rendering

### Task 8: Extend request client and composer interactions

- [ ] Extend `apps/web/test/console-agent-api.test.mjs` for exact attachment envelope and text-only byte-for-byte request regression.
- [ ] Extend `apps/web/test/app.test.mjs` for picker, paste, drag/drop, replacement/removal, one-file rejection, keyboard activation, send/retry preservation, success cleanup, no localStorage/sessionStorage writes, auth failure, and caption-only behavior.
- [ ] Run exact tests and record RED.
- [ ] Wire ephemeral prepared attachment state through app handlers and `sendConsoleAgentMessage`; bind `change`, `paste`, `dragover`, `drop`, remove, and preview cleanup listeners without expanding persistent state.
- [ ] Run exact tests and record GREEN.

### Task 9: Render accessible previews, inline images, and placeholders

- [ ] Extend `apps/web/test/console-agent-thread.test.mjs`, `multipass-console.test.mjs`, and `mobile-layout.test.mjs` for escaped captions/filenames, meaningful alt text, safe data-image sources only, placeholder rendering, disabled/sending states, no overflow, and unchanged CRED cards.
- [ ] Run exact tests and record RED.
- [ ] Add compact attachment button, hidden file input, drop target state, thumbnail/remove control, live error region, and inline image figure. Keep optional caption in the existing textarea and preserve the current send button/layout.
- [ ] Add responsive CSS using bounded block sizes, `max-width: 100%`, `object-fit: contain`, wrapping metadata, and mobile stacking.
- [ ] Run exact tests and record GREEN.

## Chunk 4: Integration, hardening, and proof

### Task 10: Run focused and complete suites

- [ ] Run all new/focused API tests and all new/focused web tests.
- [ ] Run `pnpm --filter @helixa/multipass-api test` if available, otherwise `node --test apps/api/test/*.test.mjs`.
- [ ] Run `pnpm --filter @helixa/multipass-web test`.
- [ ] Fix only evidenced regressions and rerun to GREEN.

### Task 11: Build and production-like Chromium smoke

- [ ] Create the browser smoke fixture/test with authenticated same-origin API mocks, a real generated JPEG/PNG fixture, inline preview, mocked Looper visual response, retry path, CRED visibility, console/page error capture, broken-image checks, and document/card overflow checks.
- [ ] Run at 1440x1000 and 390x844 using installed Chromium.
- [ ] Save desktop/mobile screenshots under an ignored temporary artifacts directory and report paths without committing them unless the repository already tracks test artifacts.
- [ ] Run `pnpm web:build`, Node syntax checks for changed JS/MJS, Python compile for the bridge, and `git diff --check`.

### Task 12: Final review and local commit

- [ ] Inspect `git diff --stat`, full changed-file diff, and `git status --short`; confirm no `node_modules`, image payload fixtures, secrets, generated `dist`, or screenshots are staged.
- [ ] Confirm no deployment, push, publication, remote storage, or live configuration mutation occurred.
- [ ] Commit locally with `feat: add private image chat for Loopers`.
- [ ] Report plan path, local commit SHA, changed files, exact suite/build/smoke results, screenshot paths, and required deployment config (`MULTIPASS_AGENT_LLM_VISION_MODEL` plus existing Bankr/XMTP settings).

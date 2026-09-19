# Bankr RUNTIME Remote Submission Design

Date: 2026-09-19
Project: Multipass Console
Submission title: **Multipass Console: Wallet-Owned Agent Runtime**

## Context

RUNTIME: Build + Demo Day is hosted by Bankr + Propaganda on 2026-09-19. This is a remote submission. The production Console is already live at `https://helixa.xyz/multipass/console` and has verified holder authentication, canonical Looper ownership and ERC-8004 controller checks, live XMTP group transport, Sibyl memory, Bankr LLM Gateway inference, and review-only proposals.

The submission sprint must package and prove that system. It must not expand into a new product or add speculative autonomy.

## Product Thesis

Multipass Console turns a wallet-owned Looper into a usable agent identity.

- The Looper NFT is the owned identity.
- ERC-8004 is the canonical agent identity binding.
- The connected wallet is the operator boundary.
- XMTP is the message rail.
- Sibyl stores and recalls private operator memory.
- Bankr provides server-side inference.
- The Console can publish scoped conversational replies over the authorized XMTP room. Onchain writes, asset movement, administrative changes, public posting, and proposal execution remain behind holder review and signature.

The submission must show a real agent runtime without claiming custody, autonomous trading, or unsupervised asset movement.

## Goals

1. Give a remote judge a complete understanding of the product in under three minutes.
2. Prove one real production flow for Looper #2431 and ERC-8004 identity #89144.
3. Make the Bankr integration visible and technically credible.
4. Provide a public judge packet that works even when the judge does not own a Looper.
5. Publish enough code and documentation for technical review without exposing credentials, private memory, or unrevealed assets.
6. Leave the live Console stable and preserve rollback paths.

## Non-Goals

- No new autonomous execution, trading, transfer, payout, or publishing capability.
- No public bypass of wallet ownership or controller authorization.
- No public mock mode presented as a live runtime.
- No new launchpad, marketplace, custody, or RESTAP work.
- No broad visual redesign of the Console.
- No changes to Looper contract state or holder assets.
- No post-launch growth work until the submission package is complete.

## Chosen Approach

Use a judge-first submission package rather than a feature-first sprint or a video-only submission.

The package has five independently understandable units:

1. **Live Console** proves the real holder experience.
2. **Judge packet** explains the product and links every proof artifact.
3. **Demo video** makes the full authenticated flow accessible to judges without a Looper.
4. **Technical proof bundle** documents tests, live evidence, architecture, and safety boundaries.
5. **Submission payload** supplies polished title, description, pitch, screenshots, links, and concise answers.

The live product remains wallet-gated. The judge packet and video remove judge friction without weakening authorization.

## Judge Journey

### Public judge packet

Publish a dedicated route at:

`https://helixa.xyz/multipass/runtime`

The page must be readable without a wallet and contain, in this order:

1. Submission title and one-sentence thesis.
2. Primary action: watch the two-minute demo.
3. Secondary actions: open the live Console and view the public repository.
4. A six-part runtime rail: Looper NFT, ERC-8004, wallet, XMTP, Sibyl, Bankr.
5. The review-only authority boundary.
6. Three proof cards: live Bankr response, fresh-session Sibyl recall, XMTP delivery.
7. A short architecture flow.
8. Technical verification and safety notes.
9. Links to the detailed submission document and source.

The page must state that the Console requires ownership of a Looper for live use. It must not invite a judge to connect a wallet if the judge cannot complete the flow.

### Two-minute demo

Use the controlled holder wallet for Looper #2431 without exposing signing material to browser code.

The video flow is:

1. Open Multipass Console and authenticate the holder wallet.
2. Load the wallet-owned Looper roster.
3. Open Looper #2431 and show ERC-8004 identity #89144.
4. Send: `Track Bankr and Base agent opportunities. Remember that every outside action stays review-only. Brief me and queue any proposal for approval.`
5. Show a response labeled `Bankr gateway` and transport labeled `XMTP live`.
6. Show the saved mission, Sibyl memory cue, and review-only proposal.
7. Start a fresh authenticated Console session and show recall.
8. Close on the authority boundary: the agent can reply inside the authorized XMTP room, remember, brief, and propose, but the holder reviews and signs every onchain, asset-moving, administrative, or public action.

Produce a 2 to 3 minute primary video and a 30-second cut using the same evidence. Do not fabricate UI state or label a local adapter as live.

### Live Console

The live Console keeps its current secure boundaries:

- Signed wallet challenge and HttpOnly session.
- CSRF protection on writes.
- Server-derived canonical Looper, ERC-8004, participant, thread, and conversation identifiers.
- Fresh `ownerOf` and Adapter8004 controller checks before scoped operations.
- One integrated XMTP client and database owner.
- Sibyl namespace scoped to authenticated operator and canonical agent identity.
- Bankr credential held server-side only.
- Review-only execution and proposals.

Submission work includes a focused Console UX pass. It must not weaken these boundaries.

## Focused Console UX Pass

The live runtime is technically strong, but the current Console journey is too dense for a remote judge. Improve the existing surface without rebuilding the design system.

### Primary journey

Make this sequence visually dominant:

1. Connect and authenticate the holder wallet.
2. Load and select a wallet-owned Looper.
3. Open its room.
4. Send the first mission.
5. Read the Bankr-backed response, memory cue, and review-only proposal.

When the wallet owns one Looper, select it automatically after the authenticated roster loads. When several are owned, keep the selector simple and preserve the active choice only while the same authenticated wallet and session remain active and the token remains in the freshly confirmed owned roster. Clear the selection, room, and private memory view when the wallet changes, the session ends, or ownership is no longer confirmed.

### Information hierarchy

- Keep the chat room as the largest and clearest surface.
- Put compact `Bankr gateway`, `XMTP live`, `Sibyl memory`, `ERC-8004`, and `Review-only` proof above the fold once evidence exists.
- Collapse secondary identity detail, room participants, and technical context behind optional drawers.
- Remove mint-era copy, repeated explanations, and controls unrelated to the judge journey.
- Keep the Looper image, name, token ID, and ERC-8004 ID visible without dominating the conversation.
- Use one obvious primary action per state.

### State clarity

Provide explicit, non-technical states for:

- connecting the wallet;
- signing the Console challenge;
- loading owned Loopers;
- setting up the holder XMTP inbox;
- opening the canonical room;
- sending a mission;
- waiting for Bankr;
- saving or recalling Sibyl memory;
- cancellation, authorization failure, transport failure, and retry.

Never display `XMTP live` before a real conversation exists or `Bankr gateway` before returned evidence names the provider. Errors must explain the safe recovery action and must not leak raw provider errors.

Use this evidence-to-label table in implementation and tests:

| Label | Minimum returned evidence |
|---|---|
| `Bankr gateway` | An agent response reports `inferenceProvider: bankr_llm_gateway` |
| `XMTP live` | The active canonical thread reports `transport: xmtp_group` and a non-empty server-bound conversation exists |
| `Sibyl memory` | Runtime memory reports `provider: sibyl_memory`; saved or recalled counts are shown separately |
| `ERC-8004` | The active owned-agent record contains the canonical numeric agent ID returned by the authorized server flow |
| `Review-only` | Runtime execution mode is `review_only` and every returned proposal is non-executable without review |

### Responsive behavior

- Desktop uses a restrained identity sidebar and a dominant chat column.
- Mobile uses a single-column chat-first layout, compact proof rail, optional identity drawer, and a composer that remains reachable without horizontal overflow.
- The primary demo must remain readable at 1280x720 and 390x844.

### UX verification

Add focused tests for the single-owned-Looper selection path, proof-label gating, loading and recovery copy, hidden secondary detail, removal of stale mint copy, and mobile structure. Capture desktop and mobile screenshots after deployment and inspect them for overflow, broken images, clipped actions, and confusing hierarchy.

## Judge Packet Implementation

Implement the judge packet as a normal Multipass SPA route, not a separate application.

- Add `apps/web/src/runtime-submission.js` as a self-contained renderer for the public packet.
- Add `apps/web/src/runtime-submission-data.js` as the single structured source for public proof cards, labels, links, and evidence summaries.
- Generate or reconcile `docs/hackathon/bankr-runtime-artifact-manifest.md` from that structured source through a deterministic script so the page and Markdown cannot drift.
- Route `/multipass/runtime` to a `runtime` page kind from `apps/web/src/app.js`.
- Extend `apps/web/scripts/write-allowlist-entry.mjs` to emit `dist/runtime/index.html` with dedicated title, description, canonical URL, Open Graph, and X card metadata.
- Keep the packet data static and public. It must not call authenticated Console endpoints or expose private runtime state.
- Add focused route, copy, link, metadata, and build-output tests under `apps/web/test/`.
- Deploy the generated static route through the existing Multipass static deployment path so ownership and rollback remain unchanged.

The packet may link to the live Console, repository, video, and public proof document. Its proof cards consume an explicit public artifact manifest rather than reading live authenticated data.

## Artifact Manifest and Evidence Policy

Add `docs/hackathon/bankr-runtime-artifact-manifest.md`. Each deliverable records:

- artifact name;
- repository path or external host;
- public or private status;
- source evidence;
- verification command;
- final public URL when applicable.

Public evidence is limited to:

- chain ID and public contract addresses;
- Looper token ID and ERC-8004 agent ID;
- public provider labels such as `bankr_llm_gateway`, `xmtp_group`, and `sibyl_memory`;
- review-only status;
- public route status codes;
- aggregate test and build results;
- deliberate demo prompt and response excerpts approved for the submission;
- public repository commit identifiers.

Do not publish session cookies, CSRF values, credentials, private keys, raw environment values, full XMTP conversation or message IDs, inbox IDs, private participant mappings, database paths, or memory outside the deliberate demo prompt. Full identifiers needed for operational verification stay in the private run log and are summarized publicly as pass or fail.

## Technical Proof Bundle

Update `docs/hackathon/bankr-runtime-console-demo.md` so it reflects the completed production proof from 2026-09-18 instead of listing Bankr and XMTP as pending.

The proof bundle must include:

- Public Console and judge packet URLs.
- Public repository URL and exact submission commit.
- Architecture summary.
- Focused test command and fresh result.
- Full workspace test result.
- Production web build result.
- Public route status checks.
- Holder-authenticated Bankr proof summary.
- Fresh-session Sibyl recall summary.
- XMTP delivery evidence summarized as pass or fail, with full conversation, message, inbox, and participant identifiers withheld from the judge packet.
- Unrelated-wallet `403` and unauthenticated `401` safety evidence.
- Explicit review-only and no-custody statements.
- Rollback reference.

Evidence may include public transaction, token, contract, and agent identifiers. It must exclude private keys, API keys, session cookies, CSRF tokens, private memory content beyond the deliberate demo prompt, and raw environment values.

Reconcile both `README.md` and `docs/loopers/README.md` with the verified production state. They must no longer describe the Console as local-only or production runtime handoff as future work.

## Authenticated Capture Procedure

The existing `capture-sibyl-console-demo.mjs` uses `?mock=looper` and cannot be used as evidence of the live Bankr runtime.

Add a separate `capture-bankr-runtime-submission.mjs` procedure that:

1. Uses the authenticated browser capture pattern so signing material stays outside browser code.
2. Navigates to the production Console URL without a `mock` or `fixture` query.
3. Authenticates the controlled holder and selects Looper #2431.
4. Sends the approved demo mission through the live API.
5. Captures the Bankr response, XMTP transport label, Sibyl memory cue, review-only proposal, and fresh-session recall.
6. Writes screenshots, a redacted proof JSON file, and the primary MP4 to a timestamped private output directory.
7. Fails unless the captured page proves the production origin, canonical token and agent IDs, `Bankr gateway`, `XMTP live`, `Sibyl memory`, and `Review-only`.
8. Fails if the page or URL contains `mock`, `fixture`, `local_bankr_adapter`, or `xmtp_local`.

Add tests for the capture verifier and redaction logic. The capture script itself must never serialize wallet secrets, cookies, CSRF tokens, or raw XMTP identifiers into public artifacts.

## Submission Payload

Prepare a reusable Markdown submission file with:

- Title.
- One-line summary.
- 100-word description.
- Longer project description.
- Problem.
- Solution.
- Why Bankr matters.
- Technical architecture.
- What is live.
- Safety model.
- Demo instructions.
- Repository, live product, judge packet, and video links.
- Three screenshots with captions.
- 30-second and two-minute pitches.

Recommended one-line summary:

> Multipass Console turns a wallet-owned Looper into a memory-bearing Bankr agent that communicates over XMTP, remembers through Sibyl, and keeps every onchain, asset-moving, administrative, and public action behind holder review.

## External Submission Requirements

The official remote submission form is `https://runtime.nyc/submit`, linked from the event handbook at `https://runtime.nyc/handbook`. The live configuration endpoint at `https://runtime.nyc/api/config` confirmed submissions open on 2026-09-19 and an extended cutoff of **2026-09-20 00:00 EDT / 2026-09-20 04:00 UTC**. Late manual review is discretionary and must not be treated as an eligibility path.

Use `Recorded demo only (online submission)` and provide:

- project name, maximum 120 characters;
- project summary, maximum 2,000 characters;
- public project link, maximum 2,048 characters;
- submitter name, maximum 120 characters;
- contact email, maximum 254 characters;
- personal X handle, maximum 15 characters excluding an optional `@`;
- optional team members, maximum 1,000 characters;
- required public demo video link for online submissions, maximum 2,048 characters;
- optional public repository URL, maximum 2,048 characters;
- optional X project-post URL, maximum 2,048 characters and pointing to a status rather than a profile;
- optional sponsor-track selections; Bankr grand-prize consideration is automatic.

The form accepts public HTTP(S) links and no file uploads. Official guidance names Loom, YouTube, or an X post containing the recording. No duration, resolution, aspect ratio, or file-size constraint is published, but the recording must be viewable without signing into the submitter account. The judge packet is the Project link; a separate direct recording URL is the Demo video link.

Before declaring the package submitted:

1. Validate every prepared answer and URL against these limits.
2. Verify the judge packet and video are publicly viewable without authentication.
3. Record the final submitted values and timestamp privately; publication through the form makes project copy and links permanent/non-editable according to the handbook.
4. Obtain Quigley’s explicit approval immediately before the external form submission because it is public and effectively irreversible.

## Error and Fallback Behavior

- If the live authenticated flow fails during capture, stop and diagnose it. Do not replace the failed proof with a mock labeled as live.
- If Bankr is unavailable, retain the last verified evidence and clearly label any local fallback as `Local test adapter`.
- If XMTP is unavailable, do not label local thread transport as XMTP.
- If live motion capture cannot be completed safely, produce the required 2 to 3 minute evidence video from the latest verified authenticated production screenshots, redacted terminal evidence, and narrated architecture frames. Clearly label the capture time and limitation. A mock-only video does not satisfy readiness.
- If the judge packet video host is unavailable, provide a downloadable MP4 and repository-hosted fallback link.
- If a new deployment regresses production, use the documented static or API rollback rather than debugging in place under deadline pressure.

## Repository and Commit Strategy

The original dirty checkout at `/home/ubuntu/multipass` is on `submission/bankr-runtime-2026-09-19` at `f29eb1c`, seven unrelated Loopers sales-bot/media commits ahead of `origin/main`, with additional mixed Console and launch work. Those commits include public-safety and deploy-script concerns and must not be pushed as part of this submission.

Use one exact isolation path:

- Freeze the original mixed checkout except for exporting reviewed diffs.
- Create `submission/bankr-runtime-clean-2026-09-19` in `/home/ubuntu/multipass-bankr-submit` directly from `origin/main`.
- Do not cherry-pick the seven ahead commits.
- Port only reviewed Console/API foundation files and submission work. Apply mixed `app.js`, `styles.css`, app tests, build tests, Privy files, README, and lockfile changes by hunk; regenerate the lockfile from selected manifests.
- Do not discard, rewrite, reset, or revert the original checkout.
- Do not commit secrets, caches, databases, raw capture output, private proof files, unrevealed assets, mint/contract/activity-bot work, or sales-bot deployment material.
- Run secret scanning and inspect both staged names and staged content before every commit.
- Do not squash, rewrite, or force-push.
- Verify the effective GitHub identity before pushing the clean branch.

## Verification

### Automated

1. Focused Bankr, Console auth, owned-agent, runtime, XMTP, Sibyl, and web Console tests pass.
2. Full `pnpm test` passes.
3. `pnpm web:build` passes.
4. Authenticated capture verifier and redaction tests pass. The final capture passes its production-origin and no-mock assertions.
5. `git diff --check` passes.
6. Changed JavaScript and Python files pass syntax checks where applicable.
7. Staged content contains no secret patterns or generated cache files.

### Live

1. Judge packet, Console, video, screenshots, and repository links return `200`.
2. Desktop and mobile layouts have no overflow, broken images, or browser errors.
3. The controlled holder can authenticate, load Looper #2431, activate the runtime, send the demo mission, receive a Bankr-backed XMTP response, and recover memory in a fresh session.
4. An unrelated wallet remains forbidden and an unauthenticated request remains unauthorized.
5. Public labels show `Bankr gateway`, `XMTP live`, `Sibyl memory`, and `Review-only` only when supported by returned evidence.
6. Service logs remain free of new warnings and errors after the proof.

## Acceptance Criteria

The submission is ready when all of the following are true:

- A judge can understand the product from the public packet without owning a Looper.
- The primary video shows one coherent, real, production-backed story in under three minutes.
- The live Console still enforces holder authorization and review-only operation.
- Bankr, XMTP, Sibyl, ERC-8004, and the wallet boundary are visible and accurately described.
- Documentation matches the current production state.
- The relevant implementation and proof docs are committed and pushed to the public repository.
- All required tests, build, route, desktop, mobile, and live safety checks pass.
- Final submission copy and links have been checked against the official form, or Quigley has confirmed that the self-contained remote bundle is the submission mechanism.

## Delivery Order

1. Record the confirmed `https://runtime.nyc/submit` limits, the **2026-09-20 04:00 UTC** cutoff, and public video requirements in the artifact manifest before producing final media.
2. Create the clean `origin/main` worktree and port only the reviewed Console submission file set; leave the original mixed checkout untouched.
3. Update the public READMEs, hackathon proof document, structured public evidence source, generated artifact manifest, and submission payload.
4. Implement the focused Console UX pass across selection behavior, information hierarchy, existing drawers, responsive structure, state and recovery handling, copy, and focused tests. Refine existing components only; add no new design system or authorization path.
5. Build the public judge packet route and metadata from the structured evidence source.
6. Capture the authenticated live proof and produce both videos and screenshots within the form constraints.
7. Run automated and live verification.
8. Review the staged diff, commit the submission work, verify GitHub identity, and push.
9. Publish the final link bundle and submission copy for Quigley.

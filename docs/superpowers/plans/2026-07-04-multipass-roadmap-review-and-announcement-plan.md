# Multipass Roadmap Review and Announcement Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review the 2026-06-22 Multipass Premium Identity Stack roadmap against the current build and define a safe 3-4 day announcement plan.

**Architecture:** Treat the 2026-06-22 roadmap spec as the product North Star. Treat the current `/home/ubuntu/multipass` implementation as a V0 public trust profile and agent-readable API slice. Do not pull contracts, custody transfer, paid endpoint settlement, private data, Synagent outcomes, or runtime handoff into the announcement unless they are actually live.

**Tech Stack:** Vite web app, Node.js ESM API, SQLite saved records, `node --test`, Multipass schema packages, nginx-served static site, live API at `https://helixa.xyz/api`.

---

## Source reviewed

Primary roadmap doc:

- `https://github.com/Bendr-20/helixa/blob/main/docs/superpowers/specs/2026-06-22-multipass-roadmap-spec.md`
- Local mirror reviewed at `/home/ubuntu/.openclaw/workspace/docs/superpowers/specs/2026-06-22-multipass-roadmap-spec.md`

Current implementation docs reviewed:

- `/home/ubuntu/multipass/README.md`
- `/home/ubuntu/multipass/docs/product-spec.md`
- `/home/ubuntu/multipass/docs/roadmap.md`
- `/home/ubuntu/multipass/docs/v0-scope.md`
- `/home/ubuntu/multipass/docs/live-status.md`
- `/home/ubuntu/multipass/apps/api/README.md`

Current implementation inspected:

- API modules in `/home/ubuntu/multipass/apps/api/src/`
- Web modules in `/home/ubuntu/multipass/apps/web/src/`
- Schema packages in `/home/ubuntu/multipass/packages/types/`
- SDK package in `/home/ubuntu/multipass/packages/sdk/`

Live smoke evidence from 2026-07-04 UTC:

- `GET https://helixa.xyz/multipass/` returned 200
- `GET https://helixa.xyz/multipass/?agent=1` returned 200
- `GET https://helixa.xyz/multipass/bendr-2-1` returned 200
- `GET https://helixa.xyz/api/resolve?agent=1` returned 200 with `mode=activated`, `state=activated`, `tools=2`
- `GET https://helixa.xyz/api/multipass/bendr-2-1/fragments` returned 200 with 11 public fragments
- `GET https://helixa.xyz/api/multipass/bendr-2-1/tools` returned 200 with 2 tool cards
- `GET https://helixa.xyz/api/multipass/bendr-2-1/agent-card` returned 200 with 5 service endpoints and USDC accepted asset metadata
- `GET https://helixa.xyz/api/multipass/bendr-2-1/standards` returned 200 with 1 standard ref
- `GET https://helixa.xyz/api/multipass/bendr-2-1/x402` returned 200 with 1 endpoint
- `GET https://helixa.xyz/api/multipass/bendr-2-1/receipts` returned 200 with 0 receipts
- `GET https://helixa.xyz/api/multipass/bendr-2-1/changes` returned 200 with 13 changes
- `GET https://helixa.xyz/.well-known/multipass.json` returned 200 with 18 route entries

Baseline verification already run before this review:

- `pnpm test` passed `373/373`
- `pnpm web:build` passed with existing third-party Privy/Rollup warnings

---

## Roadmap thesis, in plain language

The 2026-06-22 doc says Multipass is not just a profile page, NFT marketplace, or ERC-8004 wrapper.

The core product is:

- a human-owned, agent-managed identity asset
- a premium identity graph
- a control room for humans
- a structured discovery, verification, communication, and payment profile for agents
- a fragment registry for source identities, wallets, socials, proofs, endpoints, tools, receipts, work, and custody context
- a standards spine that can map ERC-8004, ERC-8217, ERC-8126, ERC-8257, ERC-8183, ERC-721T, and ERC-8048 without making every standard a launch blocker

The most important guardrails:

- Authority is separate from identity.
- Payments do not buy trust.
- A transfer must not blindly transfer keys, secrets, runtime access, private memory, or payment authority.
- External standards and providers are indexed and explained, not magically controlled by Multipass.

## What is already built

### Product and profile surface

- Public Multipass homepage and profile routes exist.
- Stable saved profile route exists for Bendr: `/multipass/bendr-2-1`.
- Live AgentDNA lookup route exists: `/multipass/?agent=1`.
- Canonical hydrated resolver exists and unifies saved records, live activation previews, tools, routes, source context, activation state, and links.
- Share cards and generated preview images exist.

### Public identity graph

- Saved Multipass records exist in SQLite.
- Saved records are idempotent by source identity.
- Live Helixa AgentDNA records can be activated into durable profiles.
- Public fragments exist with status, assurance, visibility, transfer policy, issuer/source, timestamps, and metadata.
- Public fragments include live source evidence, wallets, risk summary, socials, endpoints, and tool manifests for Bendr.

### Owner and manager controls

- Source-owner wallet claim flow exists.
- Manual review claim flow exists.
- Manager sessions exist with cookie plus CSRF protection.
- Claimed managers can edit allowlisted public profile fields.
- Claimed managers can create, update, and revoke manager-created public fragments and public routes.
- Owner-only controls are protected from public viewers.

### Agent-readable surface

- Public profile JSON route exists.
- Public fragments route exists.
- Public tools route exists.
- Agent card route exists.
- Standards profile route exists.
- x402 manifest route exists.
- Receipts route exists.
- Change log route exists.
- Well-known discovery doc exists.
- SDK and schema packages exist.

### Tools and payment metadata

- Public tool registry cards exist.
- Bankr x402 service metadata can be imported as public discovery metadata.
- OpenSea-style tool registry metadata exists for Bendr.
- Tool refresh helper exists and can mark public metadata verified, stale, or updated without executing tools or paying x402.
- x402 manifest can be derived from public tool metadata.

### Standards spine, first slice

- ERC-8004 references are imported or exposed as standard refs where available.
- Standards profile exists with compatibility summary.
- Adapter-ready schema docs exist for additional standards.

## What is partially built

### Activation language and UX

The product now wants explicit **Activate Multipass** language. The current build already has activation concepts and some Activate copy, but runtime source still leaks old `Save Multipass` wording in:

- `apps/web/src/save-panel.js`
- `apps/web/src/api.js`
- `apps/web/src/activation.js`
- parts of `apps/web/src/app.js`
- API/docs wording around saved display profiles

This is the highest-value pre-announcement cleanup.

### Owner dashboard lite

Claim management and safe public edits are live, but the full dashboard from the roadmap is not. Missing or partial areas include:

- private/gated visibility management
- approval queues for agent-managed updates
- permission revoke surface beyond manager-created public metadata
- paid endpoint settings
- contract implementation version history

### Fragment linking

Fragments exist and are structured, but full linking is not complete. Current strongest links are Helixa AgentDNA, ERC-8004 refs, wallets, endpoints, tools, and selected socials. Still partial or missing:

- domain proof
- email proof
- Farcaster/GitHub linking as live flows
- ERC-8217 binding writes or confirmed live binding adapter
- ERC-8126 verification/risk provider integration
- ERC-8183 work/outcome integration
- ERC-721T/ERC-8048 live NFT metadata ingestion beyond planning/static support

### Payment and receipt layer

x402 metadata exists and Bankr x402 Cloud is integrated as discovery metadata. However:

- live Multipass x402 manifest is USDC metadata, not $CRED-first
- no live Multipass receipt fragments yet for Bendr
- no paid Multipass endpoint settlement loop is live through Multipass
- payment metadata is correctly kept separate from trust

### Custody and transfer

The model exists in docs and safety copy. Claim management explicitly says it does not transfer custody, tools, credentials, or ownership. But full custody epochs and transfer detection are not live.

### Swarm model

Swarm concepts and static/demo support exist in earlier product surface work, but durable live swarm Multipass is not ready to announce as shipped.

## What is missing from the roadmap

Do not claim these as live yet:

- Multipass-native upgradeable contracts
- UUPS registry, fragment, custody, permission, payment, verification, and swarm modules
- multisig/timelock upgrade governance for Multipass contracts
- live ERC-8217 binding writes
- live ERC-8126 risk or verification provider
- live ERC-8183/Synagent job, escrow, evaluator, or outcome fragments
- full custody transfer execution
- automatic permission pause/reverify after transfer
- private or gated data marketplace
- advanced proof providers such as World ID, zkEmail, Reclaim, zkTLS, or government ID selective disclosure
- $CRED-first paid Multipass endpoint settlement and receipt loop
- native marketplace rails
- runtime handoff, config export, signer reset, API key rotation, or redeploy flow
- generalized swarm profiles with shared policies and aggregate Cred context

## Announcement-safe claims for 3-4 days

Safe to say:

- Multipass is a public trust profile and identity graph for agents.
- Multipass turns live AgentDNA source evidence into a stable profile humans can review and agents can read.
- Bendr has a live Multipass profile with public fragments, tools, standards metadata, x402 metadata, and change history.
- Multipass exposes agent-readable APIs: profile JSON, fragments, tools, agent card, standards profile, x402 manifest, receipts, and changes.
- Claim management lets verified managers edit safe public metadata after wallet proof or review approval.
- Tool cards are public discovery metadata. They do not execute tools, grant hidden credentials, or transfer authority.
- Payments and receipts do not buy trust.
- Multipass is built on and around standards like ERC-8004. Do not say Helixa created ERC-8004.

Do not say:

- Multipass contracts are live.
- Multipass transfers custody.
- Buying or burning $CRED improves reputation.
- Tool cards execute tools or grant access.
- Synagent outcome fragments are live.
- Runtime handoff is live.
- Private/gated data marketplace is live.
- Full ERC-8217, ERC-8126, ERC-8257, ERC-8183, ERC-721T, or ERC-8048 production adapters are live.

## 3-4 day announcement plan

### Day 1: Fix language and docs

Goal: make the live product match the roadmap framing.

Tasks:

- [ ] Add tests proving live lookup shows `Activate Multipass`, not `Save Multipass`.
- [ ] Update `apps/web/src/save-panel.js` public copy from save language to activation language.
- [ ] Keep `POST /api/multipass` as the compatibility route, but change user-facing API errors and docs to activation language.
- [ ] Update `docs/live-status.md`, `apps/api/README.md`, and `docs/v0-scope.md` away from broad `display-only` framing toward `public trust profile` and `safe public metadata` framing.
- [ ] Add a wording guard so old `Save Multipass` CTA copy cannot return in runtime source.
- [ ] Run focused web/API wording tests.

### Day 2: Proof pack and live smoke

Goal: prove every announcement link works.

Tasks:

- [ ] Create `docs/announcements/2026-07-multipass-announcement-pack.md`.
- [ ] Include proof links for homepage, Bendr profile, live lookup, profile JSON, fragments, tools, agent card, standards, x402, receipts, changes, and well-known discovery.
- [ ] Run live read-only smoke against all proof links.
- [ ] Confirm public viewers do not see manager controls.
- [ ] Confirm manager routes require cookie plus CSRF.
- [ ] Do not do paid x402 calls, onchain writes, custody actions, or tool execution during smoke.

### Day 3: Showcase and copy

Goal: make announcement copy tight and not overclaimed.

Tasks:

- [ ] Pick Bendr as the primary showcase.
- [ ] Optionally pick one or two more showcase profiles only if they already exist or Quigley approves activating them.
- [ ] Draft announcement thread/post copy around `agent trust profile`, `identity graph`, `Activate Multipass`, and `agent-readable APIs`.
- [ ] Draft a developer/API post with direct endpoints.
- [ ] Capture screenshots directly if needed.
- [ ] Review copy against the do-not-claim list.

### Day 4: Final release check and announce

Goal: final smoke, then publish only approved copy.

Tasks:

- [ ] Run `pnpm test`.
- [ ] Run `pnpm web:build`.
- [ ] Run live smoke checklist.
- [ ] Check live bundle for `Activate Multipass` and absence of `Save Multipass` CTA.
- [ ] Confirm API docs and well-known routes are live.
- [ ] Get team approval on final public copy and destination.
- [ ] Publish only approved copy.

## Recommended next implementation slice

The best next slice is not contracts. It is announcement readiness:

1. Activation wording cleanup.
2. Docs/live-status cleanup.
3. Announcement proof pack.
4. Live smoke checklist.
5. Optional screenshot/copy pack.

This is small enough to ship in a day, low-risk, and directly supports a 3-4 day announcement window.

## Follow-up roadmap after announcement

After announcement, the next real product decisions are:

1. Choose $CRED mandatory vs preferred with USDC fallback for Helixa-hosted paid endpoints.
2. Decide default human-owner visibility.
3. Decide whether agent-managed updates auto-publish inside scope or require human approval.
4. Choose first human proof provider.
5. Choose first paid Multipass endpoint.
6. Decide whether Multipass-native contracts are a near-term build or still architecture-only.

My recommendation: do not start Multipass-native contracts until the public trust profile, activation, manager dashboard, and x402 receipt story are cleaner. Contracts too early would freeze product assumptions we are still learning.


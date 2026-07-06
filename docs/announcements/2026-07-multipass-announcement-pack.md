# Multipass Announcement Pack - July 2026 Draft

Purpose: give the team one safe source for announcement copy, proof links, and boundaries. This is a draft for review. It is not a public post and should not be published until the final deploy and smoke checks pass.

## One-line position

Multipass is a public trust profile and identity graph for agents: source evidence, proof fragments, tools, standards metadata, payment metadata, receipts, and change history in one agent-readable profile.

## Short public copy options

### Option A

Multipass turns live AgentDNA source evidence into a stable public trust profile that people can inspect and agents can read.

### Option B

Your agent should not be a loose handle, endpoint, and wallet scattered across apps. Multipass gives it one portable trust profile with proof fragments, tools, standards metadata, x402 metadata, and change history.

### Option C

Bendr's Multipass is live: a public trust profile with AgentDNA source evidence, public fragments, tools, standards metadata, x402 metadata, and agent-readable routes.

## Safe announcement bullets

Safe to say now:

- Multipass is a public trust profile and identity graph for agents.
- Multipass can resolve live Helixa AgentDNA records into activation previews.
- A live AgentDNA source can be activated into a stable public Multipass profile.
- Bendr has a live Multipass profile with public fragments, tools, Marketplace Connections, standards metadata, x402 metadata, and change history.
- Multipass exposes agent-readable routes for profile JSON, fragments, tools, agent cards, standards metadata, x402 metadata, receipts, and changes.
- Claim management lets verified managers edit safe public metadata after wallet proof or review approval.
- Tool cards and Marketplace Connections are public discovery metadata. They do not execute tools, grant credentials, verify payment, or transfer authority.
- Payment metadata and receipts do not buy trust.
- Multipass builds on agent standards including ERC-8004. Do not say Helixa created ERC-8004.

Do not say yet:

- Multipass-native contracts are live.
- Multipass transfers custody.
- Multipass can transfer or rotate wallets, signers, API keys, private memory, runtime permissions, or tool credentials.
- Multipass has live private or gated data marketplaces.
- Multipass has live Synagent outcome fragments.
- Multipass has live ERC-8217 binding writes, ERC-8126 verification providers, or ERC-8183 work attestations.
- Multipass has a live $CRED-first paid endpoint settlement and receipt loop.
- Multipass executes tools from public tool cards or Marketplace Connections.
- Marketplace Connections are official integrations, verified accounts, trust guarantees, or payment verification.

## Demo links

Use these after final deploy verification:

- Product home: https://helixa.xyz/multipass/
- Live activation preview: https://helixa.xyz/multipass/?agent=1
- Bendr stable profile: https://helixa.xyz/multipass/bendr-2-1
- Canonical discovery doc: https://helixa.xyz/.well-known/multipass.json
- OpenAPI: https://helixa.xyz/api/openapi.json

## Launch assets

Recommended first image:

- `docs/announcements/assets/2026-07-multipass/01-bendr-share-card.png`

Secondary proof images:

- `docs/announcements/assets/2026-07-multipass/02-bendr-profile-top.png`
- `docs/announcements/assets/2026-07-multipass/03-bendr-marketplace-connections.png`

Final release checklist and post copy:

- `docs/announcements/2026-07-multipass-release-checklist.md`

## API proof links

Read-only proof links for launch checks:

- Resolve Bendr: https://helixa.xyz/api/resolve?agent=1
- Profile JSON: https://helixa.xyz/api/multipass/bendr-2-1
- Public fragments: https://helixa.xyz/api/multipass/bendr-2-1/fragments
- Public tool cards: https://helixa.xyz/api/multipass/bendr-2-1/tools
- Marketplace Connections in profile JSON: https://helixa.xyz/api/multipass/bendr-2-1
- Marketplace Connection fragments: https://helixa.xyz/api/multipass/bendr-2-1/fragments
- Agent card: https://helixa.xyz/api/multipass/bendr-2-1/agent-card
- Standards profile: https://helixa.xyz/api/multipass/bendr-2-1/standards
- x402 metadata: https://helixa.xyz/api/multipass/bendr-2-1/x402
- Receipts: https://helixa.xyz/api/multipass/bendr-2-1/receipts
- Change history: https://helixa.xyz/api/multipass/bendr-2-1/changes

## Final pre-announcement checklist

Run this after deploy approval and before public posting:

- `pnpm test` passes.
- `pnpm web:build` passes.
- `git diff --check` is clean.
- No active runtime contains public legacy activation wording: `Save Multipass`, `Saved Multipass`, `Saving...`.
- Marketplace Connections use the required display-only safety boundary and do not claim official integration, verified accounts, payment verification, tool execution, credential access, or custody transfer.
- `https://helixa.xyz/multipass/` returns 200.
- `https://helixa.xyz/multipass/?agent=1` returns 200 and shows Activate Multipass.
- `https://helixa.xyz/multipass/bendr-2-1` returns 200 and shows Activated Multipass.
- `https://helixa.xyz/api/resolve?agent=1` returns 200.
- `https://helixa.xyz/api/multipass/bendr-2-1/tools` returns 200.
- `https://helixa.xyz/api/multipass/bendr-2-1` returns 200 and includes Bankr, OpenSea Tool Registry, and Direct x402 Marketplace Connections.
- `https://helixa.xyz/api/multipass/bendr-2-1/fragments` returns 200 and includes active public `marketplace_ref` fragments.
- `https://helixa.xyz/api/multipass/bendr-2-1/agent-card` returns 200.
- `https://helixa.xyz/.well-known/multipass.json` returns 200.
- No paid x402 call is made during smoke.
- No onchain write is made during smoke.
- No private key, secret, custody action, or wallet transfer is involved.

## Internal note

Announcement posture should be confident but narrow: ship the V0 identity/profile/API proof, not the full premium roadmap. The roadmap is still the North Star, but this announcement should celebrate what is live and verifiable today.

# Multipass Release Checklist - July 2026

Status: final pre-post pack for Quigley approval.

## Launch framing

Use this line as the anchor:

Agents now have public trust profiles.

The proof is Bendr's Multipass: AgentDNA source evidence, public fragments, tool cards, Marketplace Connections, standards metadata, x402 metadata, receipts, and change history in one public profile that people and agents can inspect.

## Recommended launch asset

Use this image first:

- `docs/announcements/assets/2026-07-multipass/01-bendr-share-card.png`

Secondary proof images:

- `docs/announcements/assets/2026-07-multipass/02-bendr-profile-top.png`
- `docs/announcements/assets/2026-07-multipass/03-bendr-marketplace-connections.png`

## Primary X post

Agents should not be loose handles, wallets, and endpoints scattered across the internet.

Multipass gives agents a public trust profile: AgentDNA source evidence, proof fragments, tool cards, Marketplace Connections, x402 metadata, and change history in one place.

Bendr's is live:
https://helixa.xyz/multipass/bendr-2-1

Suggested asset: `01-bendr-share-card.png`

## X thread

### Post 1

Agents should not be loose handles, wallets, and endpoints scattered across the internet.

Multipass gives agents a public trust profile: AgentDNA source evidence, proof fragments, tool cards, Marketplace Connections, x402 metadata, and change history in one place.

Bendr's is live:
https://helixa.xyz/multipass/bendr-2-1

Asset: `01-bendr-share-card.png`

### Post 2

Before you trust an agent, you should be able to inspect what it is, where its identity comes from, what public tools it claims, what marketplace references it exposes, and what changed over time.

That should be readable by people and by agents.

### Post 3

Multipass exposes public routes for:

- profile JSON
- fragments
- tools
- Marketplace Connections
- agent card
- standards metadata
- x402 metadata
- receipts
- change history

Start here:
https://helixa.xyz/multipass/

### Post 4

Important boundary: tool cards and Marketplace Connections are discovery metadata.

They do not execute tools, grant credentials, verify payment, transfer authority, or make payment metadata equal trust.

Multipass makes claims inspectable before anyone asks you to believe them.

### Post 5

This builds on AgentDNA, Helixa, x402, and emerging agent standards like ERC-8004.

We did not create every standard in the stack. We are building the profile layer that makes agent identity, evidence, tools, and history easier to inspect.

## Developer/API post

If your app, wallet, marketplace, or agent needs to inspect an agent before routing work to it, Multipass exposes the profile as public JSON.

Bendr proof links:

- Profile: https://helixa.xyz/api/multipass/bendr-2-1
- Fragments: https://helixa.xyz/api/multipass/bendr-2-1/fragments
- Tools: https://helixa.xyz/api/multipass/bendr-2-1/tools
- Agent card: https://helixa.xyz/api/multipass/bendr-2-1/agent-card
- Standards: https://helixa.xyz/api/multipass/bendr-2-1/standards
- x402: https://helixa.xyz/api/multipass/bendr-2-1/x402
- Changes: https://helixa.xyz/api/multipass/bendr-2-1/changes

## Team/Telegram post

Multipass is ready for announcement.

The clean frame is: agents now have public trust profiles.

Bendr is the proof profile: AgentDNA source evidence, public fragments, tool cards, Marketplace Connections, standards metadata, x402 metadata, receipts, and change history exposed through the site and API.

Main link:
https://helixa.xyz/multipass/bendr-2-1

Suggested image:
`docs/announcements/assets/2026-07-multipass/01-bendr-share-card.png`

## Proof links

Public web:

- Product home: https://helixa.xyz/multipass/
- Activation preview: https://helixa.xyz/multipass/?agent=1
- Bendr profile: https://helixa.xyz/multipass/bendr-2-1
- Discovery doc: https://helixa.xyz/.well-known/multipass.json
- OpenAPI: https://helixa.xyz/api/openapi.json

Public API:

- Resolve Bendr: https://helixa.xyz/api/resolve?agent=1
- Profile JSON: https://helixa.xyz/api/multipass/bendr-2-1
- Public fragments: https://helixa.xyz/api/multipass/bendr-2-1/fragments
- Public tools: https://helixa.xyz/api/multipass/bendr-2-1/tools
- Agent card: https://helixa.xyz/api/multipass/bendr-2-1/agent-card
- Standards: https://helixa.xyz/api/multipass/bendr-2-1/standards
- x402 metadata: https://helixa.xyz/api/multipass/bendr-2-1/x402
- Receipts: https://helixa.xyz/api/multipass/bendr-2-1/receipts
- Change history: https://helixa.xyz/api/multipass/bendr-2-1/changes

## Final go/no-go checklist

Run these immediately before posting:

- `pnpm test` passes.
- `pnpm web:build` passes.
- `git diff --check` is clean.
- `https://helixa.xyz/multipass/` returns 200.
- `https://helixa.xyz/multipass/?agent=1` returns 200.
- `https://helixa.xyz/multipass/bendr-2-1` returns 200.
- `https://helixa.xyz/api/multipass/bendr-2-1` returns 200 and includes Bankr, OpenSea Tool Registry, and Direct x402 Marketplace Connections.
- `https://helixa.xyz/api/multipass/bendr-2-1/fragments` returns 200 and includes active public `marketplace_ref` fragments.
- `https://helixa.xyz/.well-known/multipass.json` returns 200.
- No paid x402 call is made during smoke.
- No onchain write is made during smoke.
- No private key, secret, custody action, or wallet transfer is involved.

## Do-not-claim list

Do not claim:

- Multipass-native contracts are live.
- Multipass transfers custody.
- Multipass rotates wallets, signers, API keys, private memory, runtime permissions, or credentials.
- Multipass has live private marketplaces.
- Multipass has live Synagent outcome fragments.
- Multipass executes tools from public tool cards or Marketplace Connections.
- Marketplace Connections are official integrations, verified accounts, trust guarantees, or payment verification.
- Payment metadata or receipts buy trust.
- Helixa created ERC-8004.

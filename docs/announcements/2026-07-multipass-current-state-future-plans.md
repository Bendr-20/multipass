# Multipass Current State and Future Plans

Status: revised working draft for Quigley and team review. Do not post publicly until approved.

## Core frame

Agents now have public trust profiles.

Multipass V0 is live as a public agent profile and identity graph layer. It turns Helixa AgentDNA source evidence into a stable profile that humans can inspect and agents can read through structured API routes.

## X thread draft

### Post 1

Agents should not be scattered handles, wallets, and endpoints.

Multipass gives agents one public trust profile: source evidence, routes, tools, standards, x401/x402 metadata, receipts, and change history.

Bendr is live:
https://helixa.xyz/multipass/bendr-2-1

### Post 2

Current state: Multipass can resolve a live Helixa AgentDNA record, show an activation preview, and activate that source evidence into a durable public profile.

The profile is visible on the web and readable through API routes built for agents, apps, wallets, and marketplaces.

### Post 3

Bendr's Multipass currently exposes:

- public profile JSON
- public fragments
- Communication routes
- tool cards
- Marketplace Connections
- agent card
- standards metadata
- x401 proof metadata
- x402 payment metadata
- receipts
- change history

### Post 4

The API is live now.

Bendr proof routes include profile JSON, fragments, tools, agent card, standards metadata, x401, x402, receipts, and change history.

Start here:
https://helixa.xyz/api/multipass/bendr-2-1

### Post 5

The current profile keeps each part labeled.

Source evidence, Cred context, custody labels, public routes, Marketplace Connections, standards refs, and manager edits stay separate inside the profile instead of being flattened into one vague badge.

### Post 6

The current standards spine includes Helixa AgentDNA, x401, x402, ERC-8004 references, agent cards, and public discovery metadata.

The goal is practical: make the agent's identity, evidence, routes, payments, receipts, and history readable in one place.

### Post 7

Next up: agent NFT support.

Multipass will make NFT-backed agent identity easier to inspect by surfacing the collection, owner, linked agent record, public metadata, and evidence labels inside the same trust profile.

https://helixa.xyz/multipass/

## Shorter X thread option

### Post 1

Agents need more than a handle.

Multipass V0 is live as a public trust profile: AgentDNA source evidence, fragments, routes, tools, Marketplace Connections, standards metadata, x401/x402, receipts, and change history.

Bendr is live:
https://helixa.xyz/multipass/bendr-2-1

### Post 2

Current state: Multipass resolves a Helixa AgentDNA record, shows an activation preview, and activates that source evidence into a stable public profile.

That profile is readable by humans on the site and by agents through the API.

### Post 3

Bendr's live profile exposes profile JSON, fragments, Communication routes, tool cards, Marketplace Connections, agent card, standards metadata, x401, x402, receipts, and change history.

Start here:
https://helixa.xyz/multipass/bendr-2-1

### Post 4

Next: agent NFT support.

The goal: one public trust profile for agent identity, including NFT-backed agents, that other agents can actually use.

## Article draft

# Multipass: Public Trust Profiles for Agents

Agents are becoming easier to launch, but harder to inspect.

A real agent is not just a username. It can have a wallet, model endpoint, owner, operator, token, social account, public inbox, tool surface, marketplace listing, payment route, work history, receipts, and standards references. Those pieces usually live across different apps, chains, registries, APIs, and screenshots.

Multipass brings those pieces into one public trust profile: a durable identity graph that people and agents can read before they trust, route, hire, pay, list, or integrate with an agent.

Bendr's Multipass is live here:

https://helixa.xyz/multipass/bendr-2-1

## What Multipass is today

Multipass V0 is live as a public agent profile and identity graph layer.

The current version resolves a Helixa AgentDNA record, generates an activation preview, and activates that source evidence into a stable public Multipass profile. The profile is available through the web and through agent-readable API routes.

The live public surface includes:

- product home and activation flow at https://helixa.xyz/multipass/
- stable saved profiles like https://helixa.xyz/multipass/bendr-2-1
- public profile JSON
- public fragments
- public Communication routes
- public tool cards
- Marketplace Connections
- canonical agent cards
- standards metadata
- x401 proof metadata
- x402 payment metadata
- receipt fragments
- public change history
- discovery documents and OpenAPI metadata

That is the current state: Multipass makes agent identity, evidence, public routes, tools, standards, payments, receipts, and history readable in one place.

## Why this matters

The agent market is moving toward commerce, delegation, marketplaces, paid APIs, tool use, and autonomous routing.

Before another agent routes work to Bendr, before a marketplace lists an agent, before a user pays for an endpoint, or before an app integrates a service, there should be a readable profile that answers basic questions:

- What is this agent?
- Where did the identity come from?
- Who controls or manages the public profile?
- What public evidence supports the claims?
- Which public contact routes exist?
- What tools or services are listed?
- Which standards does it reference?
- What payment metadata is exposed?
- What receipts or history exist?
- What changed recently?

Multipass answers those questions through a public profile that humans can inspect and agents can parse.

## The current Bendr profile

Bendr's live Multipass is the first proof surface.

It combines AgentDNA source evidence, public fragments, Communication routes, public tool cards, Marketplace Connections, standards metadata, x401/x402 metadata, receipts, and change history into one inspectable profile.

Bendr's API routes are public and readable by agents:

- Profile: https://helixa.xyz/api/multipass/bendr-2-1
- Fragments: https://helixa.xyz/api/multipass/bendr-2-1/fragments
- Tools: https://helixa.xyz/api/multipass/bendr-2-1/tools
- Agent card: https://helixa.xyz/api/multipass/bendr-2-1/agent-card
- Standards: https://helixa.xyz/api/multipass/bendr-2-1/standards
- x401: https://helixa.xyz/api/multipass/bendr-2-1/x401
- x402: https://helixa.xyz/api/multipass/bendr-2-1/x402
- Receipts: https://helixa.xyz/api/multipass/bendr-2-1/receipts
- Changes: https://helixa.xyz/api/multipass/bendr-2-1/changes

This is the core product: a profile that is visible to humans and structured enough for agents, wallets, apps, marketplaces, and indexers to evaluate.

## The current standards spine

The current Multipass profile is built around a standards spine: Helixa AgentDNA, x401, x402, ERC-8004 references, agent cards, discovery metadata, public fragments, and receipts.

ERC-8004 is part of the live profile context. Multipass can bring matching identities into the profile as public standards references, then label custody and source context so the evidence stays understandable.

The pattern is simple: bring the evidence into the profile, label where it came from, and make it readable through the site and API.

## What comes next

The main next addition is support for agent NFTs.

That means Multipass can treat an agent NFT as another source of identity evidence: the NFT, its collection, owner, linked agent record, and public metadata can be surfaced inside the same trust profile instead of sitting off to the side.

The goal is not to turn every NFT into a vague badge. The goal is to make NFT-backed agent identity easier to inspect, easier to route to, and easier for other agents to understand.

Every agent should have a public trust profile that other agents can actually use.

A durable profile that connects identity, evidence, routes, standards, payments, receipts, and change history in one place.

That is Multipass.

## Proof links

Product home:
https://helixa.xyz/multipass/

Bendr profile:
https://helixa.xyz/multipass/bendr-2-1

Discovery document:
https://helixa.xyz/.well-known/multipass.json

OpenAPI:
https://helixa.xyz/api/openapi.json

## Safe one-liners

- Agents now have public trust profiles.
- Multipass turns agent identity fragments into one readable public profile.
- Multipass is the public trust profile layer for agent commerce.
- Multipass makes agent identity, evidence, routes, payments, receipts, and history readable in one place.

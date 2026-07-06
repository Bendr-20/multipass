# Multipass Launch Copy - July 2026

Status: draft for Quigley approval. Do not post publicly until the exact copy is approved.

## Recommended frame

Agents now have public trust profiles.

This is stronger than "Multipass is live" because it says what changed for the market: an agent can have one inspectable profile that humans and other agents can read.

## Primary X post

Agents should not be loose handles, wallets, and endpoints scattered across the internet.

Multipass gives agents a public trust profile: AgentDNA source evidence, proof fragments, tool cards, Marketplace Connections, x402 metadata, and change history in one place.

https://helixa.xyz/multipass/bendr-2-1

## X thread version

### Post 1

Agents should not be loose handles, wallets, and endpoints scattered across the internet.

Multipass gives agents a public trust profile: AgentDNA source evidence, proof fragments, tool cards, Marketplace Connections, x402 metadata, and change history in one place.

https://helixa.xyz/multipass/bendr-2-1

### Post 2

The point is simple: before you trust an agent, you should be able to inspect what it is, where its identity comes from, what public tools it claims, what standards metadata it exposes, and what changed over time.

That should be readable by people and by agents.

### Post 3

Multipass currently exposes public routes for:

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

Multipass is the public trust profile layer. It makes claims inspectable before anything asks you to believe them.

### Post 5

This builds on AgentDNA, Helixa, x402, and emerging agent standards like ERC-8004.

We did not create every standard in the stack. We are building the profile layer that makes agent identity, evidence, tools, and history easier to inspect.

## Short X post

Agents need more than a handle.

Multipass gives them a public trust profile: AgentDNA source evidence, proof fragments, tool cards, x402 metadata, receipts, and change history in one place.

Bendr's Multipass is live:
https://helixa.xyz/multipass/bendr-2-1

## Telegram/team version

Multipass is announcement-ready and live.

The clean framing: agents now have public trust profiles.

Bendr's profile is the proof: AgentDNA source evidence, public fragments, tool cards, standards metadata, x402 metadata, receipts, and change history all exposed through the site and API.

Main link:
https://helixa.xyz/multipass/bendr-2-1

Proof links:
https://helixa.xyz/multipass/
https://helixa.xyz/multipass/?agent=1
https://helixa.xyz/.well-known/multipass.json
https://helixa.xyz/api/multipass/bendr-2-1/tools

Safe boundary: public tool cards are discovery metadata only. They do not execute tools, transfer custody, grant credentials, or turn payment metadata into trust.

## Bankr/agent commerce angle

Agent commerce needs profiles people can inspect before they pay, route, hire, or integrate.

Multipass is that public trust profile layer for agents: identity source evidence, proof fragments, tools, standards metadata, x402 metadata, receipts, and change history in one place.

Bendr's profile is live:
https://helixa.xyz/multipass/bendr-2-1

## Developer/API angle

If your app, marketplace, wallet, or agent needs to inspect an agent before routing work to it, Multipass exposes the profile as public JSON.

Profile, fragments, tools, standards metadata, x402 metadata, receipts, and changes are all readable from the API.

Start with Bendr:
https://helixa.xyz/api/multipass/bendr-2-1

## Do-not-post claims

Do not claim these in announcement copy yet:

- Multipass-native contracts are live.
- Multipass transfers custody.
- Multipass rotates wallets, signers, API keys, private memory, runtime permissions, or credentials.
- Multipass has live private marketplaces.
- Multipass has live Synagent outcome fragments.
- Multipass executes tools from public tool cards or Marketplace Connections.
- Marketplace Connections are official integrations, verified accounts, trust guarantees, or payment verification.
- Payment metadata or receipts buy trust.

## Final pre-post check

Run read-only smoke before posting:

```bash
curl -fsS https://helixa.xyz/multipass/ >/dev/null
curl -fsS 'https://helixa.xyz/multipass/?agent=1' >/dev/null
curl -fsS https://helixa.xyz/multipass/bendr-2-1 >/dev/null
curl -fsS https://helixa.xyz/.well-known/multipass.json >/dev/null
curl -fsS https://helixa.xyz/api/multipass/bendr-2-1 >/dev/null
curl -fsS https://helixa.xyz/api/multipass/bendr-2-1/tools >/dev/null
curl -fsS https://helixa.xyz/api/multipass/bendr-2-1/agent-card >/dev/null
curl -fsS https://helixa.xyz/api/multipass/bendr-2-1/changes >/dev/null
```

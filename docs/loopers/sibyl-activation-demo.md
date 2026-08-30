# Sibyl Activation Demo

## Goal

Build a lightweight hackathon/demo track showing that a Looper can activate into a memory-bearing agent through Multipass.

This is separate from the mint contract. Sibyl is an activated-agent memory/tool layer, not launch-day NFT infrastructure.

## Hackathon Facts

From `https://hack.sibyllabs.org/`:

- Build window: Sep 1-10, 2026
- Registration closes: Aug 31, 23:59 UTC
- Prize pool: $10K USDC
- Sibyl Memory must be load-bearing
- Rubric includes memory as 40 points
- Submission needs public repo, README, 2-5 minute demo, a fresh-session recall moment, and two build-in-public posts
- Partner stacks can boost score up to x1.25

## Demo Name

Working title: `Looper Memory Activation`

## Demo Story

1. Holder activates `Looper #1234` in Multipass.
2. Holder names the agent for free.
3. Holder adds private operator memory through Sibyl.
4. Session is closed/reset.
5. Holder returns and the Looper recalls goals/preferences through Sibyl.
6. Demo shows public Looper history stays with the Looper while private operator memory stays wallet-scoped.

The fresh-session recall moment is the core proof.

## Communication Model

Use XMTP as the human-agent communication rail for the demo.

XMTP is the message transport, not the agent brain or memory system:

- Multipass owns identity, activation, control, and the Console UI.
- XMTP carries wallet-native messages between the human and the activated Looper agent.
- Sibyl stores and recalls durable private memory extracted from the conversation and mission state.
- Bankr LLM Gateway is the preferred inference provider for the hosted agent runtime when configured and funded.
- The agent runtime reads XMTP messages, recalls Sibyl memory, checks signal data, calls the LLM, and replies with briefings or review-only proposals.

Activated Looper flow:

1. Holder connects wallet in Multipass Console.
2. Holder activates a Looper and chooses its agent/profile name.
3. Multipass links the Looper activation profile to a Looper agent XMTP identity.
4. Console embeds the XMTP thread as the Looper's agent thread.
5. Holder sends commands or preferences through the Console thread.
6. Agent runtime receives the XMTP message, recalls Sibyl memory, and reads relevant signal data.
7. Agent runtime calls Bankr LLM Gateway to generate the response when enabled.
8. Agent replies through XMTP.
9. Console renders the reply, updates mission/proposal state, and saves durable memory back to Sibyl when appropriate.

The Console remains the primary human-facing surface, while XMTP makes the Looper reachable as a wallet-native agent outside the website.

## Inference Utility

Use Bankr LLM Gateway as the first-choice LLM provider for the demo runtime.

This makes the holder value prop concrete: activating a Looper can include sponsored agent inference instead of only static profile access. The API key and credit accounting stay server-side in the hosted worker; the browser only talks to Multipass. If the Bankr gateway is unavailable, the demo should degrade to a clearly labeled local/fallback mode rather than pretending Bankr inference is live.

## Public/Private Memory Split

Public Looper history belongs to the Looper:

- names
- classes
- missions
- achievements
- Cred changes
- public updates
- activation date

Private operator memory belongs to the wallet/operator:

- private chats
- private preferences
- private goals
- private notes
- private prior context

When a Looper is sold:

- new holder controls the Looper profile
- public history remains attached
- prior owner loses operation control
- prior owner private memory does not automatically transfer
- new holder starts new private memory

## Activation Scope For Demo

V1 activation creates:

- Looper profile page
- class + secondary class
- voice/personality seed
- specialization
- activation seed / first mission
- memory slot
- starting Cred state
- owner/operator wallet link
- XMTP-backed agent thread embedded in Multipass Console

Defer:

- swarm features
- token launch flow
- paid tool wallet
- autonomous spend
- advanced Evolution mechanics

## Naming

- NFT metadata name: `Looper #1234`
- First agent/profile name: chosen during activation in Multipass, free
- Later renames: paid in `$CRED`
- Name history stays attached to the public agent profile

## Technical Boundary

Track A, Loopers launch core:

- NFT contract spec
- mint site
- allowlist/Merkle flow
- reveal offset + Arweave metadata flow
- Base Sepolia rehearsal

Track B, Sibyl activation demo:

- demo Looper profile in Multipass
- activate + name agent
- XMTP human-agent messaging rail
- Sibyl memory save/recall/search
- fresh-session recall demo
- public/private memory split

Tracks share product story but should not technically block each other.

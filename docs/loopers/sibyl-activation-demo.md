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
- basic chat or command surface if infra is ready

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
- Sibyl memory save/recall/search
- fresh-session recall demo
- public/private memory split

Tracks share product story but should not technically block each other.


# Loopers Runtime Console — Bankr RUNTIME Submission

## Form-ready fields

**Project name:** Loopers Runtime Console

**One-line summary:** A wallet-owned Looper becomes a memory-bearing Bankr agent with XMTP messaging, Sibyl recall, ERC-8004 identity, and holder-reviewed actions.

**Project link:** https://helixa.xyz/multipass/runtime

**Live product:** https://helixa.xyz/multipass/console

**Repository:** https://github.com/Bendr-20/multipass

**Demo video:** https://helixa.xyz/multipass/runtime/loopers-runtime-console-demo.mp4 (46-second silent visual fallback; replace with the narrated capture if it is ready before submission.)

## 100-word description

Multipass Console turns a wallet-owned Looper into a usable agent runtime. The holder signs in, selects a Looper, and opens a canonical room bound to its existing ERC-8004 identity. Messages travel through XMTP, durable preferences are recalled and saved through Sibyl, and server-side inference is provided by Bankr LLM Gateway. The agent can monitor, remember, brief, and prepare proposals, but it cannot move assets, execute onchain actions, administer accounts, or publish externally without holder review. A production proof used Looper #2431 and ERC-8004 agent #89144; unauthorized and unauthenticated access remained blocked.

## Problem

Agent identity, communication, memory, and inference often live in separate products with no trustworthy operator boundary. That makes an NFT agent either decorative or dangerously overpowered.

## Solution

Multipass Console activates a wallet-owned Looper as one coherent runtime identity. The holder wallet establishes authority; ERC-8004 provides the canonical agent identity; XMTP carries the room; Bankr provides server-side inference; Sibyl supplies durable memory; and the Console keeps every external action review-only.

## Why Bankr matters

Bankr is the inference rail that turns the owned identity and remembered mission into a useful response. It stays server-side, is explicitly enabled, and is surfaced as `Bankr gateway` only when the returned response proves that provider path.

## Technical architecture

1. The holder signs a scoped Console challenge.
2. The API discovers candidate Loopers through a public holder index, then independently verifies current ERC-721 ownership and ERC-8004 controller authority on Base.
3. Activation opens the canonical XMTP room for that Looper runtime.
4. Sibyl recalls bounded durable context before inference.
5. Bankr LLM Gateway produces the agent response.
6. Sibyl saves bounded memory and the Console renders review-only proposals without execution authority.

## What is live

- Public Console and public judge packet.
- Holder-authenticated Looper discovery and activation.
- Existing ERC-8004 identity binding.
- XMTP group transport and fresh-session recovery.
- Sibyl recall and save.
- Bankr LLM Gateway inference.
- Review-only proposal and no-custody boundary.

## Safety model

- No signing material or provider credentials enter the browser bundle.
- Ownership and controller authority are refreshed onchain.
- Unauthenticated owned loading returns `401`.
- Unrelated signed wallets are rejected before runtime or memory access.
- The agent has no custody and cannot trade, transfer, administer, spend, or publish without holder review.
- Local adapters are never labeled as live Bankr or XMTP evidence.

## Demo instructions

1. Open https://helixa.xyz/multipass/console.
2. Connect a wallet that owns a Looper and sign the scoped Console message.
3. Select the Looper and open its canonical room.
4. Send: `Watch Loopers activity and Bankr/Base agent opportunities. Keep everything review-only.`
5. Point out the Bankr gateway, XMTP live, Sibyl memory, ERC-8004 identity, and Review-only proof labels.
6. Refresh into a fresh session and recover the same identity and durable mission context.

## Screenshot captions

1. **Operator boundary:** the connected holder wallet loads only its owned Loopers.
2. **Runtime proof:** the active room shows Bankr gateway, XMTP live, Sibyl memory, ERC-8004 identity, and Review-only evidence.
3. **Durable agent:** a fresh signed session recovers the same Looper room and remembered mission.

## 30-second pitch

Loopers are agent NFTs that become active runtime identities inside Multipass Console. A holder connects a wallet, selects a Looper, gives it a mission, and the Console binds that identity to Bankr inference, XMTP messaging, Sibyl memory, and review-only proposals. The important part is the boundary: the agent can remember, monitor, and recommend, but it cannot move assets or act externally without the holder.

## Two-minute pitch

This is Multipass Console, the operator surface for wallet-owned agent identities. The holder signs in and the API discovers the wallet’s Loopers, then independently verifies current ownership and ERC-8004 controller authority on Base. Selecting a Looper opens its canonical XMTP room. When the holder sends a mission, Sibyl recalls durable context, Bankr LLM Gateway produces the response, and bounded memory is saved for the next session. The proof rail only lights up when the response proves Bankr, XMTP, Sibyl, ERC-8004, and review-only status. The agent can brief and prepare proposals, but it has no custody and cannot execute externally. The NFT gives identity, Bankr gives runtime, XMTP gives communication, Sibyl gives memory, and the wallet keeps authority with the owner.

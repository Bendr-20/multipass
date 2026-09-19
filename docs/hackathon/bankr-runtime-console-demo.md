# Bankr Runtime Console Demo

Working title: **Loopers Runtime Console**

## Event

- Event: RUNTIME: Build + Demo Day
- Host: Bankr + Propaganda / Runtime Agent Week
- Date: 2026-09-19, 11:30am-7:30pm ET
- Venue: Brooklyn, NY, exact location visible to accepted guests
- Relevant supporters: Bankr, Base, Privy, Dynamic, Turnkey, Uniswap, Grok Bot, Filecoin

## Thesis

Multipass Console is where a Looper becomes a usable agent identity.

The NFT is the owned identity. The connected wallet is the operator boundary. Sibyl is durable memory. XMTP is the message rail. Bankr is the server-side inference/runtime rail. The Console ties those pieces together without giving the agent custody or unchecked transaction authority.

## Demo Scope

The hackathon demo should stay narrow and real:

1. Connect wallet in Multipass Console.
2. Load wallet-owned Loopers / Helixa agents.
3. Select a Looper and open its Console room.
4. Send a mission such as: `Watch Loopers mints, bounty combos, and Bankr/Base agent opportunities. Keep everything review-only.`
5. Show the runtime rail: wallet, selected agent, XMTP chat, Sibyl memory, Bankr runtime, Cred, review gate.
6. Show the response using the active server-side inference provider.
7. Show memory saved/recalled and a review-only proposal queued.
8. Close with the principle: the agent can brief and propose, but the human signs every external action.

## What Is Already Real

- Multipass Console route: `/multipass/console`
- Signed Console session endpoints: `/api/multipass/console/session/nonce` and `/verify`
- Authenticated Console agent APIs: `/api/multipass/console/agent/activate` and `/message`
- Runtime profile binding: Base chain + canonical Loopers contract + token ID + existing ERC-8004 identity
- Sibyl memory adapter with fallback-disabled proof path from the earlier hackathon work
- Review-only proposal model
- Multi-agent room model
- Bankr LLM Gateway adapter behind explicit server opt-in
- Bankr CLI/auth is configured locally with positive LLM credits
- Sprint 2 canonical XMTP transport, conversation binding, recovery, and inbound-worker path are implemented with deterministic injected-client end-to-end coverage

## Build Slice

V0 for this event is not a new app. It is a focused Console hardening pass:

- Make Bankr runtime visible in the Console rail.
- Keep gateway usage server-side only.
- Keep Bankr inference behind `MULTIPASS_AGENT_BANKR_LLM_ENABLED=1` until demo mode is deliberately enabled.
- Make idle Console state say `Bankr-ready`, and make proven gateway responses say `Bankr gateway`.
- Prepare a short demo script and fallback video.
- Keep launchpad/owner-dashboard work out of the headline.

## Safety Lines

- Do not expose Bankr API keys or LLM keys in the browser.
- Do not imply the agent has custody.
- Do not imply autonomous trades, transfers, or payouts.
- Every onchain/admin action remains review-only until a human signs.
- If live Bankr inference is disabled or unavailable, use the deterministic local adapter and say so clearly.
- If live XMTP is disabled or unavailable, do not present local transport as XMTP. The explicit test fallback must be labeled `Local test adapter`.
- Never authorize ownership, runtime, or Sibyl access from a wallet address supplied in a request body or query string.
- Re-check Looper ownership and Adapter8004 controller status before every agent-scoped operation.

## Prep Checklist

- [x] Verify Bankr CLI is installed.
- [x] Verify Bankr account/auth works without printing keys.
- [x] Verify positive Bankr LLM credits.
- [x] Show Bankr runtime state in Multipass Console.
- [x] Run a local live Bankr LLM Gateway smoke test through the Console adapter.
- [ ] Decide whether to enable live Bankr inference for the event server.
- [ ] Run a live Console message with Bankr gateway enabled in a safe environment.
- [ ] Record fallback video of the Console flow.
- [ ] Publish a short judge packet URL with thesis, repo, demo, and safety lines.
- [ ] Prepare 30-second and 2-minute verbal pitches.

## Sprint 2 XMTP Proof Status

Deterministic injected-client tests now prove the complete secure flow: the signed holder session selects the canonical Looper; hostile wallet/agent/participant/conversation/transport fields are ignored; holder and runtime messages receive XMTP conversation/message IDs; a fresh signed Console session reopens the server-bound conversation and Sibyl history; unrelated wallets receive `403` before XMTP or memory access; and the inbound handler authorizes the conversation + sender, recalls Sibyl, runs inference, publishes the reply, persists the thread, and prevents own/duplicate loops. Fresh verification on 2026-09-17 UTC passed the focused suite (230/230), full workspace suite (753/753), and production web build.

The live-only blocker is exact: this worktree has no approved production XMTP signer/database configuration, the production worker supervisor still needs to inject/share the API's canonical active-runtime registry and chain authorizer, and this sprint was not allowed to enable production services. No credential was requested, printed, or changed. See [Live XMTP Console Sprint 2](../loopers/live-xmtp-console-sprint-2.md).

## 30-Second Pitch

Loopers are agent NFTs that can become active runtime identities inside Multipass Console. A holder connects a wallet, selects a Looper, gives it a mission, and the Console binds that identity to memory, messaging, Bankr-backed inference, and review-only proposals. The important part is the boundary: the agent can remember and recommend, but it cannot move assets or execute externally without the human.

## 2-Minute Demo Script

1. "This is Multipass Console, the operator surface for wallet-owned agent identities."
2. Connect wallet and select a Looper.
3. "This rail shows the runtime: wallet, agent, XMTP chat, Sibyl memory, Bankr runtime, Cred, and approval mode."
4. Send: `Watch Loopers mints, combo bounties, and Bankr/Base agent opportunities. Keep actions review-only.`
5. Show the response and point at the inference provider.
6. Show memory saved/recalled.
7. Show the review-only proposal.
8. "The NFT gives identity, Bankr gives runtime, Sibyl gives memory, and the wallet keeps authority with the owner."

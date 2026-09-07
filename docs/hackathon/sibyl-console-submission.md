# Console + Sibyl Hackathon Submission

Working title: **Looper Memory Activation**

## Thesis

Multipass Console shows a Looper becoming a memory-bearing agent identity.

The judge-facing proof is intentionally narrow:

1. A holder selects an agent identity in the Console.
2. The holder sends an instruction that contains durable preferences.
3. The runtime extracts durable memory into a wallet + agent + activation namespace.
4. Sibyl stores that memory.
5. A fresh reader with fallback disabled recalls the memory from Sibyl.
6. The Console returns a review-only agent response and proposal.

This is not a mint-contract feature. Loopers minting and Sibyl activation are separate tracks.

## What Is Real

- `apps/api/src/sibyl-memory/` wraps the Sibyl bridge and can require the real bridge by setting `allowFallback: false`.
- `apps/api/scripts/prove-sibyl-cold-start.js` writes memory, creates a fresh reader, searches Sibyl, and exits nonzero unless the exact saved memory is recalled.
- `apps/api/src/agent-runtime/` binds wallet, agent ID, activation ID, thread ID, inference provider, and Sibyl namespace into a runtime profile.
- `apps/api/test/console-agent-runtime.test.mjs` proves memory extraction, recall across turns, review-only proposals, multi-agent rooms, and explicit Bankr Gateway opt-in.
- `apps/web/src/multipass-console.js` renders the Console surface with agent selection, Sibyl memory state, room/thread UI, review queue, missions, and connected wallet state.

## What Is Demo-Scoped

- The local thread transport is an XMTP-shaped demo transport unless the live XMTP worker is deliberately enabled.
- Bankr LLM Gateway is disabled by default for deterministic judging and must be explicitly enabled before any live gateway call.
- The demo must not imply private memory transfers with NFT ownership. Public Looper history is token-scoped; private operator memory is wallet/operator-scoped.

## Commands For Judges

Run the focused proof/test suite:

```bash
node --test \
  apps/api/test/sibyl-memory.test.mjs \
  apps/api/test/console-agent-runtime.test.mjs \
  apps/api/test/xmtp-worker.test.mjs \
  apps/web/test/multipass-console.test.mjs
```

Run the no-fallback Sibyl cold-start proof:

```bash
pnpm --filter @helixa/multipass-api sibyl:prove-cold-start -- \
  --namespace multipass:hackathon-proof:looper-1234:activation-20260907 \
  --message "Watchlist preference: remember that Looper #1234 tracks vault permissions and review-only capital access." \
  --query "vault permissions"
```

Expected shape:

```json
{
  "ok": true,
  "provider": "sibyl_memory",
  "matched": true
}
```

If the local Sibyl bridge is unavailable, the cold-start proof should fail instead of silently using local fallback.

Generate the local demo package:

```bash
pnpm --filter @helixa/multipass-web capture:sibyl-console-demo
```

The capture script starts the local Console mock, screenshots the review-only Looper room, runs the no-fallback Sibyl proof, renders a terminal proof frame, and exports an MP4. If `ELEVENLABS_API_KEY` is present in the environment or local ElevenLabs config, it adds voiceover audio.

Latest local proof on 2026-09-07:

- `ok: true`
- `provider: "sibyl_memory"`
- `namespace: "multipass:hackathon-proof:looper-1234:activation-20260907-0406"`
- `recalled_count: 1`
- `matched: true`

Latest local demo package on 2026-09-07:

- `video`: `/home/ubuntu/.openclaw/workspace/tmp/sibyl-console-demo-20260907T044521673Z/sibyl-console-demo.mp4`
- `duration`: 130 seconds
- `voiceover`: ElevenLabs generated
- `proof provider`: `sibyl_memory`
- `matched`: `true`

## Demo Video Script

Target length: 2-5 minutes.

1. Open with the claim: "Loopers are agent NFTs with identity, wallet, memory, and history."
2. Show the Multipass Console with a selected Looper agent.
3. Send a message such as: "Watch Base agent tokens and vault permissions. Keep risk medium or lower. Never execute without review."
4. Show the Console returning a review-only response and queued proposal.
5. Show memory cues saved under Sibyl memory.
6. Run the no-fallback cold-start proof in a fresh terminal.
7. Point at `provider: "sibyl_memory"` and `matched: true`.
8. Close with: "The NFT is the identity. The wallet is agency. Sibyl is memory. The rest happens onchain."

## Submission Checklist

- [ ] Public repo link ready.
- [x] README points judges to this document.
- [x] Focused tests pass.
- [x] No-fallback Sibyl proof passes with `provider: "sibyl_memory"`.
- [x] 2-5 minute demo video recorded.
- [x] Fresh-session recall moment appears in the video.
- [ ] Two build-in-public posts prepared.
- [ ] Submission copy avoids promising autonomous trading, returns, yield, or unmanaged capital movement.

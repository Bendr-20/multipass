# Live XMTP Console Sprint 2

## Result

Multipass Console now has a fail-closed XMTP transport boundary for canonical Looper runtimes.

- Production Console chat uses the existing `@xmtp/node-sdk` adapter only when `MULTIPASS_XMTP_ENABLED=1` and the host-owned XMTP configuration is available.
- Disabled or incomplete XMTP configuration no longer falls through to local output. Message publication fails closed.
- New group creation also fails closed if the authenticated holder cannot be added through XMTP. It never falls back to a self-only optimistic group.
- `createLocalXmtpAgentClient()` remains available only for explicit test/development injection and always reports `xmtp_local` / `local_xmtp_adapter`. The web UI labels it **Local test adapter**, never live XMTP.

## Canonical Conversation Authority

The browser supplies only `tokenId`, the holder-selected runtime name, and message text. It cannot select the wallet, ERC-8004 identity, participants, room, thread, conversation, or transport.

After the HttpOnly session and CSRF checks, the server re-reads:

1. `ownerOf(tokenId)` on Base chain `8453` at canonical Loopers `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`;
2. `erc8004AgentIdByLooper(tokenId)`; and
3. Adapter8004 `isController(agentId, authenticatedWallet)`.

The active runtime then derives:

- topic: `eip155:8453:<canonical-loopers-contract>:<tokenId>:erc8004:<agentId>:operator:<authenticated-wallet>`;
- thread: `xmtp:<topic>`;
- participants: canonical Looper runtime plus authenticated holder;
- Sibyl namespace: the same chain/contract/token/identity tuple; and
- conversation ID: only the server-held binding returned by the XMTP client.

A caller-provided conversation ID, room ID, thread ID, participant list, wallet, agent ID, or transport is ignored.

## Outbound and Recovery Flow

`POST /api/multipass/console/agent/activate` creates or reopens the holder-bound active runtime and returns recovered canonical thread + Sibyl state. A fresh signed Console session can select the same Looper and recover that state without sending a conversation ID.

`POST /api/multipass/console/agent/message` repeats session, CSRF, current owner, current controller, and active-runtime checks before any XMTP publish or memory access. It publishes the holder message and runtime reply through the configured XMTP adapter, then records:

- actual transport and adapter;
- canonical topic/thread;
- XMTP conversation ID;
- XMTP message IDs;
- canonical participants; and
- Sibyl-backed thread and durable memory.

An ownership transfer invalidates the prior holder runtime binding; a newly authorized holder does not inherit the old holder's XMTP conversation.

## Inbound Worker

The inbound handler now requires all of these injected dependencies before it will start:

- canonical active-runtime registry;
- fresh Looper `ownerOf` + Adapter8004 authorizer;
- XMTP conversation resolver; and
- Console runtime using the same XMTP publisher and Sibyl store.

For each inbound text message it:

1. rejects own messages, duplicate message IDs, missing IDs, and unknown conversation bindings;
2. resolves the sender wallet from authenticated XMTP conversation membership;
3. requires that wallet to match the bound holder;
4. repeats canonical chain ownership/controller authorization;
5. requires the still-active runtime/conversation binding;
6. recalls Sibyl and runs the enabled Bankr adapter or clearly labeled local inference adapter;
7. publishes only the runtime reply back through XMTP; and
8. persists inbound and reply message IDs in the canonical Sibyl thread.

Unknown conversations and unrelated senders are rejected before inference or memory access. Own-message and message-ID checks prevent response loops.

## Safety Boundary

- Proposals remain `review_only`.
- No execute method, custody permission, autonomous transaction route, RESTAP route, or `/news` route was added.
- Bankr remains server-side and separately opt-in through `MULTIPASS_AGENT_BANKR_LLM_ENABLED=1`.
- No deployment, service enablement, transaction, or secret mutation was performed.

## Deterministic Proof

Injected-client end-to-end tests prove:

- holder message + runtime reply publication with XMTP conversation/message IDs;
- canonical participant/topic derivation despite hostile caller fields;
- fresh signed-session recovery from server-held binding and Sibyl history;
- `403` for unrelated wallets before XMTP read/publish or memory access;
- inbound sender/conversation authorization, Sibyl recall, inference, reply publication, thread persistence, and loop prevention; and
- disabled/unconfigured production transport never silently becoming local output.

Fresh verification on 2026-09-17 UTC after the holder-membership fail-closed review:

- focused API/web/XMTP suite: **225/225 passed**;
- full workspace `pnpm test`: passed with zero failures;
- production `pnpm web:build`: completed successfully; only the existing dependency annotation, unresolved runtime asset, and chunk-size warnings were reported.

## Live-Only Blocker

A real production XMTP publish/consume proof was not run because this worktree does not have an approved production XMTP signer/database configuration and no production service may be enabled during this sprint. The standalone worker additionally needs the production process supervisor to inject/share the canonical active-runtime registry and authorizer used by the API. No credential was requested, printed, or changed.

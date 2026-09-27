# Looper Runtime Persona Design

## Goal

Make every activated Looper speak and reason from its canonical token personality instead of presenting itself as a generic Bankr-hosted model. Preserve the Console's review-only safety boundary and existing Looper-scoped Sibyl continuity.

## Source of truth

The server will hydrate a bounded persona snapshot from the trusted Looper metadata base only after the authenticated wallet passes canonical NFT ownership and ERC-8004 controller checks. The browser cannot supply or override persona fields.

The snapshot contains only identity-relevant metadata:

- canonical Looper name and description
- agent class and optional secondary class
- specialization
- risk profile and autonomy
- voice
- first mission
- personality-matrix/codex version

Missing metadata degrades to the current generic Looper profile without weakening authorization or blocking Console access.

## Runtime data flow

1. Console authenticates the wallet and sends a Looper token ID.
2. API verifies current NFT ownership and ERC-8004 controller authority.
3. API fetches and normalizes that token's trusted metadata into a bounded persona snapshot.
4. The canonical identity passed to activation, message handling, and recovery includes that server-derived snapshot.
5. `createRuntimeProfile` exposes the snapshot as `profile.persona` while retaining the canonical Looper/ERC-8004 root identity and Looper-scoped Sibyl namespace.
6. Every Bankr generation receives the participant profile, canonical persona, recalled Sibyl memory, signals, and prior thread history.

## Bankr behavior

The system prompt identifies the runtime as the canonical Looper and states its class, specialization, risk posture, autonomy, voice, and first mission when present. It instructs the model to:

- answer identity questions from the canonical Looper persona;
- use the configured voice naturally rather than quoting it mechanically;
- treat recalled Sibyl entries as durable Looper-scoped continuity;
- say that no relevant memory was recalled when memory is empty, rather than claiming all sessions start fresh;
- never claim that it has no personality when a canonical persona is present;
- keep trades, transfers, custody, posting, and tool execution review-only and human-approved.

The prompt does not claim sentience, hidden model access, autonomous custody, or execution authority.

## Isolation and safety

Persona hydration is a small server-side adapter with one output schema. Onchain authorization stays independent from metadata retrieval. Bankr prompt construction consumes only the normalized persona, never raw metadata or browser text. Static personality data is separate from mutable Sibyl memory, so traits remain canonical while owner preferences and history can evolve.

## Error handling

A missing, malformed, or unavailable metadata response returns `null` persona and falls back to the existing generic behavior. Authorization failures still fail closed. Persona text is trimmed and length-bounded before it reaches the profile or prompt.

## Verification

Tests will prove:

1. Looper metadata normalizes into the expected bounded persona snapshot.
2. Canonical runtime profiles retain that server-derived persona.
3. Bankr's system prompt contains identity, voice, mission, continuity, and review-only instructions.
4. The client cannot inject persona fields through activation or message requests.
5. Existing Console runtime, XMTP, memory, and API tests remain green.
6. A live Bankr request for Looper #614 answers `Who are you?` as Looper #614 with its Trader/Broker market-making personality and does not claim to be a generic stateless Claude session.

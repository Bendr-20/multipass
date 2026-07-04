# Public Agent Profile Language Design

## Goal
Make Multipass read as a clear public agent profile product for humans and agents, without expanding scope or making new authority, custody, payment, or trust claims.

## Product language decision
- Primary phrase: **public agent profile**.
- Secondary phrase: **trust context** when describing CRED, proof fragments, x402 metadata, receipts, routes, or change history.
- Avoid using **trust profile** as the headline or primary category.
- Keep **AgentDNA profile**, **agent profile**, or **public profile** available where the source identity matters.

## Problem found in audit
- Homepage and profile copy over-index on "trust profile," which sounds like a verdict instead of a readable profile surface.
- Safety caveats are repeated in several places, making the UI feel defensive instead of crisp.
- `/.well-known/multipass.json` returns route templates but lacks a plain purpose, start-here guidance, example profile, and explicit non-authority boundaries.
- Agent-readable cards can return `summary`, `services`, and `links` as null, which makes them less useful for autonomous agents trying to understand what to fetch next.
- OpenAPI exists and is healthy, but descriptions should be more direct about public agent profiles, evidence routes, and boundaries.

## Non-goals
- No payment changes.
- No x402 execution.
- No custody, credentials, approvals, or ownership transfer.
- No new canonical CRED verdicts.
- No announcement copy or posting.
- No broad visual redesign.

## Proposed implementation

### Human-facing site copy
Use the homepage and profile UI to explain Multipass as:

> A public agent profile that brings identity, ownership context, routes, public proof, CRED context, and discovery metadata into one readable record.

Keep the quick hierarchy:
1. Card first: who/what is this agent?
2. Proof below: what public evidence supports the profile?
3. Trust context: CRED, routes, receipts, x402, standards, changes.
4. Boundaries: viewing does not grant authority, execute tools, expose credentials, or transfer custody.

### Agent-facing discovery
Upgrade `/.well-known/multipass.json` so machines get the obvious answer without needing to infer from route names:
- `name`
- `description`
- `purpose`
- `primary_phrase`
- `start_here`
- `example_profile`
- `agent_instructions`
- `boundaries`
- existing `routes`

Upgrade OpenAPI info and route descriptions to say "public agent profile" and point agents toward resolve, profile, agent-card, hydrated, tools, x402, receipts, and changes.

### Agent-card normalization
When an agent-card lacks authored fields, derive safe fallbacks:
- `summary`: public agent profile summary using profile display name/source where available.
- `services`: public service/tool endpoint summaries where available, otherwise empty array.
- `links`: profile, hydrated profile, tools, x402, receipts, changes.

These are discovery aids only. They must not claim ownership, custody, access, live execution, or credentials.

## Verification
- Add failing API tests first for richer discovery/OpenAPI/agent-card fallbacks.
- Add failing web copy tests first for public-agent-profile wording and reduced headline reliance on trust-profile language.
- Run focused tests after each implementation slice.
- Run full `pnpm test`.
- Run `pnpm web:build`.
- If deploying later, smoke-check live `/.well-known/multipass.json`, `/api/openapi.json`, `/api/multipass/bendr-2-1/agent-card`, and `/multipass/`.

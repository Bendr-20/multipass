# Multipass Live Status

Last updated: 2026-07-01 UTC

This document is the operator-facing source of truth for what the current Multipass V0 surface does and does not do.

## Live surfaces

Public web:

- `https://helixa.xyz/multipass/` - product home and Activate flow
- `https://helixa.xyz/multipass/{slug}` - saved public profile route
- `https://helixa.xyz/multipass/?agent={input}` - live lookup and activation preview route

Public API:

- `GET /.well-known/helixa-multipass.json` - legacy Helixa discovery alias
- `GET /.well-known/multipass.json` - canonical Multipass discovery document
- `GET /api/openapi.json` - public OpenAPI document
- `GET /api/resolve?agent={input}` - resolve saved records or live activation previews
- `GET /api/search?q={query}` - conservative public search
- `POST /api/multipass/activate` - preview a live AgentDNA activation without saving it
- `POST /api/multipass` - save a public display-only Multipass record
- `GET /api/multipass/{id}` - public profile JSON
- `GET /api/v0/multipass/{id}` - versioned public profile alias
- `GET /api/multipass/{id}/fragments` - public fragments only
- `GET /api/multipass/{id}/tools` - public tool and service discovery cards only
- `GET /api/multipass/{id}/agent-card` - canonical agent-readable card
- `GET /api/multipass/{id}/card` - compatibility alias for the agent-readable card
- `GET /api/multipass/{id}/standards` - standards compatibility profile
- `GET /api/multipass/{id}/x402` - public x402 manifest
- `GET /api/multipass/{id}/receipts` - public receipt fragments
- `GET /api/multipass/{id}/receipts/{receipt_id}` - one public receipt fragment
- `GET /api/multipass/{id}/changes` - public change history for saved records when available

## Current V0 capability

Multipass V0 can:

- Activate a live Helixa AgentDNA record into a read-only preview.
- Save a durable public Multipass record from live public AgentDNA data.
- Resolve profiles by stable slug, Multipass ID, and supported source identifiers.
- Return public profile JSON, public fragments, public tool cards, agent cards, standards profiles, x402 metadata, receipt collections, and change logs.
- Import matching Base ERC-8004 identities as public `standard_ref` fragments.
- Support owner-wallet and review-approved manager claim states for saved records.
- Let verified managers edit allowlisted public profile fields and manager-created public fragments/routes.
- Keep source imports, Cred context, custody labels, route metadata, and manager edits separate.

## Safety boundary

The live API is public and display-only by default. It does not:

- Transfer wallet custody.
- Reveal private fields or credentials.
- Grant tool access or execute tools.
- Mutate runtime routes outside Multipass metadata.
- Make payments or receipts count as trust.
- Edit Helixa AgentDNA source records.
- Change Cred authority or reputation source data.

Manager routes are protected by session cookies and CSRF tokens. Public fragment reads return public fragments only.

## Canonical route notes

Use `/api/multipass/{id}/agent-card` as the canonical agent-card route.

Use `/api/multipass/{id}/card` only as a compatibility alias for older clients and docs.

Use `/.well-known/multipass.json` as the canonical discovery document.

Use `/.well-known/helixa-multipass.json` only as a legacy Helixa discovery alias.

## Not live yet

The current V0 does not include:

- Multipass-native contracts.
- Full custody transfer execution.
- Private or gated field marketplace.
- Automated runtime handoff.
- Paid endpoint settlement loop.
- Synagent outcome fragments.
- Advanced cryptographic or selective-disclosure proofs.
- Full swarm membership proofs.

## Related docs

- `docs/product-spec.md`
- `docs/v0-scope.md`
- `docs/roadmap.md`
- `docs/standards-spine.md`
- `apps/api/README.md`
- `docs/live-smoke-checklist.md`

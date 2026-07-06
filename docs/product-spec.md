# Product Spec

## Thesis

Multipass gives each subject an identity graph with trust context.

A subject can be an agent, human, swarm, collection, project, or organization. The graph connects ownership, operation, provenance, communication routes, permissions, endpoints, payments, proofs, receipts, standards references, and trust context in one durable profile.

## Primary users

- Owners who control identity, visibility, custody, and approvals.
- Operators who manage day-to-day configuration under delegated scopes.
- Agents that need structured identity, discovery, permissions, routes, and trust context.
- Apps/indexers that need stable schemas, references, and profile resolution.
- Verifiers/evaluators that issue proofs, attestations, scores, or validation results.

## Human surface

The human surface should answer:

- Who owns it.
- Who operates it.
- What it can do.
- Which permissions are active.
- Which proofs support its claims.
- What is public, gated, private, or hidden.
- What changed recently.
- What trust context is available for review.
- Which public contact and social routes are published for coordination.

## Agent surface

The agent surface should expose structured, machine-readable data:

- Canonical profile JSON.
- Agent card.
- Fragments.
- Ownership/custody state.
- Service endpoints.
- Public communication routes.
- x402 metadata.
- Tool schemas.
- Routes.
- Standards references.
- Attestations.
- Cred context.

## Core principles

### Owner control, delegated operation

Owners control the profile, visibility, and high-risk approvals. Operators and agents can act only inside explicit delegated scopes.

### Agents read structured data

Multipass should produce predictable JSON, cards, schemas, routes, references, and receipts so agents can discover and evaluate a subject without scraping a web page.

### Identity is fragmented by default

A real subject is made of fragments: wallets, domains, social accounts, public contact routes, proofs, endpoints, tool permissions, work history, attestations, receipts, and custody events. Multipass links those fragments without pretending they are all equally trusted.

### Authority is separate from identity

Identity can describe a subject. Authority decides who can act for it. Multipass must keep ownership, operation, runtime permissions, and custody state distinct.

### Payments do not buy trust

$CRED can power access, payment, settlement, discounts, dashboards, burns, and receipts. It must not be framed as buying or increasing reputation. Payment metadata can prove that a transaction happened, but trust requires separate evidence.

## Visibility model

### Public

Public data is visible to anyone and suitable for profile cards, discovery, indexers, and partner systems.

### Gated

Gated data requires token access, payment, relationship status, allowlist approval, or another explicit policy before release.

### Private

Private data is visible only to approved owners, operators, or internal systems with a clear need.

### Hidden

Hidden data is not discoverable through public or gated surfaces. It may exist only for safety, abuse review, recovery, or internal integrity checks.

## Non-goals

- Not just a marketplace.
- Not just a profile page.
- Not a way to pay for reputation.
- Not a blind transfer of keys, secrets, memory, or production authority.

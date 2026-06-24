# Multipass

Multipass is Helixa's portable identity and management layer for AI agents, projects, collections, organizations, and swarms.

## Why it exists

It gives every agent or coordinated system one structured profile for ownership, permissions, provenance, work history, endpoints, payments, and trust context. The same profile should be readable by people, agents, apps, indexers, and partner systems.

AI systems are moving across wallets, apps, chains, tools, owners, and collaborators. Multipass gives that movement a durable identity layer without forcing every integration to invent its own trust file.

## Core model

- Portable identity profile
- Owner control and delegated operation
- Fragmented identity graph
- Standards-readable trust context
- Transfer-aware custody
- Agent-readable discovery
- Payment and receipt metadata

## Repository layout

```text
apps/web              Public app, profiles, and dashboard
apps/api              API boundary
packages/contracts    Onchain control, binding, and registry modules
packages/sdk          TypeScript SDK for agents and developers
packages/types        Shared schemas and types
docs                  Product, architecture, and standards docs
infra                 Deployment notes
```

## Documentation

- [Product spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Identity graph](docs/identity-graph.md)
- [Standards spine](docs/standards-spine.md)
- [V0 scope](docs/v0-scope.md)
- [Roadmap](docs/roadmap.md)
- [Schemas](docs/schemas/README.md)
- [Security](SECURITY.md)
- [Infrastructure](infra/README.md)

## Status

Early foundation work. Public APIs, contracts, schemas, and deployment details will be documented as they land.

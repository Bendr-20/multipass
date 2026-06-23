# Multipass

Multipass is the premium identity stack for AI agents, human owners, projects, collections, and swarms.

Core thesis:

> Multipass is a human-owned, agent-managed identity asset.

Humans use Multipass to understand ownership, permissions, provenance, work history, trust context, and custody changes.

Agents use Multipass to discover profiles, verify control, find tools, route messages, inspect trust signals, and use payment endpoints.

## Repository status

Fresh build repo. Legacy Helixa, AgentDNA, Synagent, and CRED Exchange code should be imported intentionally, not copied wholesale.

## Initial structure

```text
apps/web              Public app, profiles, and dashboard
apps/api              API/server boundary if needed
packages/contracts    Upgradeable contract modules and tests
packages/sdk          TypeScript SDK for agents and developers
packages/types        Shared schemas and types
docs                  Product, architecture, and standards docs
infra                 Deployment and infrastructure notes
```

## Product language

Use current Multipass language:

- human-owned, agent-managed identity asset
- identity graph
- control surface
- standards profile
- custody epochs
- trust context

Avoid old travel-document framing.

## CI

GitHub Actions are deferred until the Bendr-20 auth/security pass because the current token cannot update workflow files.

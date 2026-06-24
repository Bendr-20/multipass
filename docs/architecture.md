# Architecture

## Layers

### Product surface

Owner and operator interfaces for profile review, identity fragments, visibility, permissions, custody state, payments, receipts, standards context, and recent changes.

### API boundary

The API exposes canonical profile JSON, discovery cards, graph resolution, fragment status, permissions, endpoint metadata, receipt references, and standards profiles.

### Shared schemas and SDK

Shared schemas and SDKs define the portable data contract for agents, apps, indexers, verifiers, evaluators, and partner systems.

### Onchain modules

Onchain modules anchor registry state, controller proofs, custody epochs, fragment references, and upgradeable control where durable guarantees are required.

### Indexer and resolver

The indexer reads onchain and offchain events, normalizes fragment state, builds queryable identity graphs, and resolves profiles for public and gated surfaces.

### Adapter layer

Adapters map external systems into Multipass fragments, references, and explanations without pretending external systems are native Multipass control planes.

### Paid endpoint layer

Planned paid endpoints will use Bankr x402 Cloud and related payment metadata to gate access, settle requests, expose receipts, and prefer $CRED where product policy requires it.

## System-of-record boundaries

| System | Boundary |
| --- | --- |
| Multipass registry | Source of native profile identifiers, owner binding references, status, and custody epoch pointers. |
| Fragment registry | Source of native fragment identifiers, fragment status, assurance level, visibility, and transfer policy. |
| API and indexer | Source of resolved read models, cached graph views, public cards, and query responses. |
| Bankr x402 Cloud | Source of paid endpoint access, payment events, settlement metadata, and receipt references. |
| ERC-8217 | External standard reference indexed for compatible identity, permission, or profile signals. |
| ERC-8004 | External standard reference indexed for agent identity, reputation, and validation context. |
| ERC-8126 | External standard reference indexed for verification and risk summaries. |
| ERC-8257 | External standard reference indexed for tool manifests, pricing, access rules, and verifiability. |
| ERC-8183 | External standard reference indexed for jobs, evaluator attestations, and outcome records. |
| ERC-721T / ERC-8048 | External NFT metadata reference indexed for compatible token metadata and discovery fields. |
| $CRED token | Source of token state used for access, payment, settlement, discounts, dashboards, burns, and receipts. |
| Proof providers | Source of issuer proofs, platform verifications, cryptographic attestations, and revocation status. |

## Upgradeable contract posture

- small modules
- UUPS where Helixa owns stateful contracts
- multisig admin
- timelock for routine upgrades
- emergency pause where required
- storage-layout checks
- initializer replay protection
- schema compatibility or versioning
- upgrade history surfaced to owners

## What should remain immutable

- Native Multipass identifiers after activation.
- Historical custody epoch records.
- Historical fragment records after revocation, dispute, or transfer.
- Receipt references once issued.
- Upgrade event history.
- Standards references attached to historical attestations.

## Adapter boundary rule

Multipass can index and explain external systems, but it must not claim to control systems it does not own.

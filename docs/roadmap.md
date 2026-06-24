# Roadmap

## Phase 0: Foundation

Build the public foundation for Multipass: product framing, architecture, identity graph, standards spine, v0 scope, roadmap, and schema planning contracts. Establish wording rules, local link checks, and verification gates.

Deferred: public UI, contracts, external registry adapters, paid endpoints, and production custody flows.

## Phase 1: Public identity surface

Build the public Multipass profile surface for agents, humans, swarms, collections, projects, and organizations. Include stable slugs, display names, profile status, public fragments, owner summaries, Cred summaries, discovery fields, and standards references.

Deferred: private profile fields, gated fields, owner dashboard editing, and automated discovery ranking.

## Phase 2: Fragment linking

Build identity fragments that can link wallets, social accounts, projects, collections, domains, attestations, receipts, and standards references to a Multipass. Each fragment should carry status, assurance level, visibility, transfer policy, source, and timestamps.

Deferred: issuer integrations, bulk imports, advanced dispute handling, and automated stale state detection.

## Phase 3: Owner dashboard

Build the owner dashboard for claiming, verifying, editing, and managing a Multipass. Include owner state, verification status, visibility controls, custody epoch display, fragment review, and safe change history.

Deferred: delegated admin roles, multi-owner policy, transfer execution, and custom organization workflows.

## Phase 4: Agent discovery and communication

Build discovery and communication primitives: agent cards, capabilities, message routes, service endpoints, contact policy, accepted assets, rate limits, and standards references. Keep public responses minimal by default and place private fields behind authorization or payment.

Deferred: ranking markets, inbox automation, peer messaging guarantees, and network-wide availability scoring.

## Phase 5: Upgradeable contracts

Build the contract path for upgradeable Multipass identity, custody, and fragment references. Define storage layout, upgrade controls, pause policy, event shape, and migration playbooks before deployment.

Deferred: production deployment, cross-chain mirrors, governance control, and marketplace settlement hooks.

## Phase 6: Bankr x402 Cloud and $CRED paid endpoints

Build the x402 manifest layer for paid endpoints, Bankr x402 Cloud provider records, accepted assets, rate limits, settlement reference policy, and receipt fragments. $CRED can support access, payment, settlement, discounts, dashboards, burns, and receipts.

Deferred: automatic endpoint publishing, recurring billing, provider failover, and any trust change that is not backed by verified outcomes, attestations, receipts, or history.

## Phase 7: Synagent standards layer

Build the Synagent standards layer as the Multipass work and outcome adapter path. This phase maps task intake, provider records, evaluator attestations, outcome proofs, and standards references into Multipass fragments without making Synagent the canonical identity system.

Normalize adapter fields, support states, assurance levels, and last verification timestamps for ERC-8217, ERC-8004, ERC-8126, ERC-8257, ERC-8183, ERC-721T, and ERC-8048.

Deferred: full registry indexing, chain-specific adapters, evaluator marketplaces, and standard-specific product automation.

## Phase 8: Custody and transfer

Build custody and transfer flows that preserve owner history, custody epoch, fragment transfer policy, stale state handling, and re-verification requirements. Transfers should not silently carry trust that depends on the prior owner.

Deferred: escrow, auctions, recovery flows, cross-chain custody transfer, and legal entity mapping.

## Phase 9: Swarm Multipass

Build swarm Multipass support for groups of agents, shared capabilities, member fragments, swarm-level contact policy, collective work history, and aggregate trust summaries.

Deferred: dynamic membership proofs, sub-swarm delegation, pooled custody, and automated swarm formation.

## Phase 10: Advanced proofs

Build advanced proof support for cryptographic fragments, issuer attestations, evaluator attestations, outcome proofs, receipt proofs, and selective disclosure. Hidden fields should prove eligibility without returning raw private content.

Deferred: zero-knowledge circuits, privacy-preserving ranking, external issuer networks, and formal proof audits.

## Phase 11: NFT and marketplace layer

Build NFT and marketplace compatibility using ERC-721T metadata, controller asset references, ownership labels, marketplace display fields, and transfer-aware trust summaries.

Deferred: marketplace launch, royalty policy, collection analytics, and automated listing controls.

## Phase 12: Runtime handoff

Build runtime handoff so a Multipass can guide agent deployment, endpoint routing, service discovery, custody checks, and tool access in live systems. Runtime consumers should read the public profile, agent card, x402 manifest, standards profile, and receipt fragments through versioned schemas.

Deferred: full autonomous operations, runtime provider selection, cross-runtime migration, and production SLA enforcement.

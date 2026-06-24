# V0 Scope

## Goal

Ship the Multipass foundation: a durable identity graph, public profile/card, owner dashboard lite, standards spine, discovery JSON, payment metadata, and transfer-aware custody model for agents and coordinated systems.

## Included in V0

- Multipass schema as identity graph
- standards spine model
- public profile/card
- owner dashboard lite
- identity fragment model
- core fragments list
- agent discovery JSON and agent card
- Bankr x402 Cloud endpoint plan with $CRED preferred as the planning default while final fallback policy remains open
- receipt fragments
- custody epoch model
- swarm parent profile lite

## Explicitly not in V0

- full native marketplace
- wallet custody
- generalized human social network
- full private data marketplace
- blind runtime transfer
- complex zk proof marketplace
- automated permissions without owner approvals

## Success criteria

- A subject can have a stable Multipass profile with required identity graph fields.
- Owners can review public data, linked fragments, custody state, visibility, and recent changes.
- Agents can fetch canonical profile JSON and an agent card.
- The standards spine can explain which external standards are referenced and what each one controls.
- Bankr x402 Cloud endpoint planning is represented with $CRED preferred where policy allows.
- Receipt fragments can be attached without treating payment as trust.
- Transfer rules pause or reverify authority before sensitive operation resumes.

## Open decisions

- $CRED mandatory vs preferred with fallback for Helixa-hosted paid endpoints
- default owner visibility
- agent-managed update approval policy
- first human proof provider
- first paid endpoint
- multisig and timelock policy

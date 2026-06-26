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
- A1 saved Multipass records for public, display-only profiles created from live AgentDNA data

## Explicitly not in V0

- full native marketplace
- wallet custody
- generalized human social network
- full private data marketplace
- claim, manage, or edit flows for saved records
- blind runtime transfer
- complex zk proof marketplace
- automated permissions without owner approvals

## Success criteria

- A subject can have a stable Multipass profile with required identity graph fields.
- A user can Activate a live AgentDNA record, save a persistent public Multipass record through `POST /api/multipass`, and share `/multipass/{slug}`.
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


## A1 saved records

A1 adds the first persistent user path: Activate a live agent, save the resulting public Multipass record, and share a stable profile URL.

Scope boundaries:

- `POST /api/multipass/activate` is preview-only. It builds a read-only Multipass response from live source data without saving it.
- `POST /api/multipass` is the public save path for A1.
- `MULTIPASS_DB_PATH` enables SQLite-backed saved records for the local server. Without it, saved records are not durable across process restarts.
- Saved A1 records are public, display-only, and unclaimed.
- Claim, manage, and edit flows belong to A2/A3, not A1.

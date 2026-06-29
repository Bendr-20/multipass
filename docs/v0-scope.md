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
- A2 source-owner and approved-manager claim sessions for saved records
- A2.1 public fragment management for claimed records
- A3 owner dashboard lite with visibility controls and recent changes

## Explicitly not in V0

- full native marketplace
- wallet custody
- generalized human social network
- full private data marketplace
- delegated admin roles or multi-owner policy
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


## A1/A2/A3 saved record path

A1 adds the first persistent user path: Activate a live agent, save the resulting public Multipass record, and share a stable profile URL.

Scope boundaries:

- `POST /api/multipass/activate` is preview-only. It builds a read-only Multipass response from live source data without saving it.
- `POST /api/multipass` is the public save path for A1.
- `MULTIPASS_DB_PATH` enables SQLite-backed saved records for the local server. Without it, saved records are not durable across process restarts.
- Saved records start as public display profiles and can be claimed by the source owner wallet or an approved manager.
- Claimed records can edit allowlisted public profile fields, visibility, and manager-created public fragments.
- Owner dashboard lite shows owner state, verification, visibility, and recent changes.
- Claim and manager sessions do not transfer custody, grant tools, expose credentials, or edit Cred/reputation authority.

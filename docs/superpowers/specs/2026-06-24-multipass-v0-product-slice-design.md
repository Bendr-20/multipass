# Multipass V0 Product Slice Spec

## Purpose
Define the next buildable Multipass milestone by reconciling the product spec, V0 scope, roadmap, and hidden prototype readiness notes.

The goal is not to make `/multipass/` discoverable. The goal is to decide the smallest coherent V0 slice that makes the prototype sharper and gives the team a concrete product direction.

## Current state
Multipass currently has:

- Public schema contracts for profiles, fragments, agent cards, standards profiles, x402 manifests, and receipt fragments.
- SDK validation and schema sync tests.
- A memory-backed local API with generic and Bendr fixture data.
- A framework-light web demo using the Protocol Artifact visual direction.
- A hidden nginx-served team-review route at `https://helixa.xyz/multipass/`.

The prototype works technically, but the product story is still too broad.

Unlinked is not access control: treat `/multipass/` as publicly accessible and keep secrets, private data, internal endpoints, auth material, live tokens, and unredacted proof data out of the route.

## Product decision
V0 should start with **agent builders** as the first audience.

Reasoning:

- Agent builders already understand identity, endpoints, standards, proof, and API surfaces.
- They are more likely to value canonical JSON and proof records than a broad consumer audience.
- This audience lets Multipass prove the core record model before adding collection, marketplace, swarm, or owner-dashboard complexity.
- It reduces the page from “everything Multipass may become” to “a trust profile an agent builder can inspect and integrate.”

Secondary audience, after V0.1: agent NFT collections and swarm operators.

## V0 product sentence
Working sentence:

```text
Multipass is a portable trust profile for agents, combining identity, public proof, standards support, and access receipts into one inspectable record.
```

Use this as working copy for the next prototype pass, not final brand copy.

## Roadmap reconciliation
The existing roadmap remains directionally useful, but it is too broad for the next milestone. V0 should be split into smaller slices.

### V0.1: Canonical agent trust profile
Primary goal: make one agent profile understandable to builders.

Includes:

- Agent-focused profile surface.
- Clear product sentence.
- Explicit real vs fixture vs planned labels.
- Public proof ledger with six document types.
- Canonical profile JSON and agent card framing.
- Standards spine explanation without implying live adapter deployment.
- Receipt evidence explanation without implying live settlement.

Defers:

- Owner dashboard.
- Editing.
- Auth.
- Contract reads.
- Paid endpoint settlement.
- Swarms.
- Collection activation flows.
- Marketplace display.

### V0.2: Identity fragments and verification states
Primary goal: show how fragments build trust without flattening every signal into one score.

Includes:

- Fragment type explanations.
- Status and assurance-level legend.
- Public, gated, private, and hidden visibility explanation.
- Better examples of verified, pending, stale, historical, and disputed states.
- Transfer policy explanation at the fragment level.

Defers:

- Issuer integrations.
- Bulk imports.
- Dispute workflows.
- Automated stale state detection.

### V0.3: Owner dashboard lite
Primary goal: let an owner understand what they control and what still needs approval.

Includes:

- Owner summary.
- Custody epoch summary.
- Editable-field plan.
- Visibility review plan.
- Recent change history design.

Defers:

- Delegated admin roles.
- Multi-owner policy.
- Transfer execution.
- Organization-specific workflows.

### V0.4: x402 and receipt evidence
Primary goal: prove access and settlement metadata can sit beside identity without becoming reputation.

Includes:

- x402 manifest explanation.
- Receipt fragment explanation.
- $CRED as preferred planning asset where policy allows.
- Clear statement that payments do not create trust by themselves.

Defers:

- Live settlement.
- Automatic endpoint publishing.
- Recurring billing.
- Provider failover.

### V0.5: Custody and transfer-aware trust
Primary goal: make transfer behavior legible before any high-risk authority moves.

Includes:

- Custody epoch states.
- Transfer-pending state.
- Reverification rules.
- Fragment transfer policy summaries.
- Clear separation between identity history and active authority.

Defers:

- Escrow.
- Auctions.
- Recovery flows.
- Cross-chain custody transfer.

### V0.6: Swarm and collection profile lite
Primary goal: extend the agent profile model to coordinated groups after the individual agent profile is clear.

Includes:

- Parent swarm or collection profile.
- Member roster concept.
- Shared capabilities concept.
- Aggregate trust summary concept.

Defers:

- Dynamic membership proofs.
- Pooled custody.
- Automated swarm formation.
- Marketplace automation.

## Next build target
The immediate next target is **V0.1: Canonical agent trust profile**.

This should improve the existing hidden `/multipass/` prototype, not replace it.

Required product changes:

1. Add an `Internal Prototype` label near the top.
2. Add the working product sentence.
3. Add a concise “What this record proves” section.
4. Add a concise “What is static demo data” note.
5. Add a concise “What is planned but not live” note.
6. Make the proof ledger explain why each document exists.
7. Make Standards and x402 sections avoid live-deployment implication.
8. Keep the page unlinked.

Required technical changes:

1. Preserve static fixture mode at `/multipass/`.
2. Preserve local API mode and safe `?api=` override.
3. Preserve private-fragment filtering.
4. Preserve JSON toggles.
5. Preserve wording gates.
6. Add tests for the new real vs fixture vs planned copy.

## Data story for V0.1
The Bendr fixture should be treated as a safe demonstration record.

It may show:

- A draft or link-ready agent profile.
- Public identity fragments.
- Standards reference states.
- Sample x402 route metadata.
- Sample receipt evidence.

It must not show:

- Private data.
- Internal endpoints.
- Auth material.
- Live tokens.
- Production settlement claims.
- Unredacted proof data.
- Claims that unsupported integrations are live.

## Product boundaries
Multipass should be explained as the profile and trust object layer.

Working model:

- Helixa is the identity layer.
- Multipass is the portable trust profile surface.
- AgentDNA is the protocol record model.
- Cred is a trust score and evidence layer that can appear inside or beside Multipass.

Avoid making Multipass sound like only a score, only a profile page, only a marketplace, or only an NFT tool.

## Success criteria for V0.1
V0.1 is complete when:

- A builder can read the page and explain Multipass in one sentence.
- The first audience is clearly agent builders.
- The page clearly labels static fixture data.
- The page clearly separates implemented behavior from planned behavior.
- The proof ledger explains why each API document exists.
- No private data or internal-only claims appear in HTML or expanded JSON.
- Tests, build, and wording gates pass.
- The route remains unlinked unless the team separately approves broader discovery.

## Non-goals
- No homepage navigation.
- No promotional copy.
- No backend production deployment.
- No auth.
- No wallet connection.
- No contract reads.
- No owner dashboard implementation.
- No paid settlement implementation.
- No collection or swarm implementation.

## Open decisions
These do not block V0.1, but should be resolved before V0.2 or V0.3:

- Whether $CRED is mandatory or preferred with fallback for Helixa-hosted paid endpoints.
- Default owner visibility.
- Agent-managed update approval policy.
- First human proof provider.
- First paid endpoint.
- Multisig and timelock policy.

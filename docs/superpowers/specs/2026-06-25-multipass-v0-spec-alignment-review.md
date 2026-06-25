# Multipass V0 Spec Alignment Review

## Verdict

The prototype is directionally right, but it started drifting from a clean V0 product surface into a roadmap collage. The strongest path is to keep the card-first, proof-below interaction and tighten language so Multipass reads as a portable identity and trust profile, not an operational control plane.

## Spec anchors

From `docs/product-spec.md`, Multipass should answer who owns it, who operates it, what it can do, which permissions are active, which proofs support claims, what visibility applies, what changed recently, and what trust context is available.

From `docs/v0-scope.md`, V0 includes public profile/card, owner dashboard lite, identity fragments, discovery JSON, receipt fragments, custody epoch model, transfer-aware custody, and swarm parent profile lite.

From `docs/roadmap.md`, custody and transfer are Phase 8 and swarm Multipass is Phase 9. V0 may preview these through custody epoch and swarm parent profile lite, but should not make them feel like fully executable product flows.

## Keep

- Product-led hero and warm visual direction.
- Agent card carousel above proof.
- Selected proof following the selected card.
- Helixa Swarm as a V0 swarm parent profile lite.
- Transfer-aware custody language that preserves public history and pauses or reverifies authority.
- Machine-readable JSON and proof ledger for developer confidence.
- Explicit separation between Cred context, receipts, and trust.

## Cut or tighten

- Do not add another claim-flow stepper yet. It would overbuild Phase 8 before V0 is crisp.
- Rename `Shared controls` to `Policy references` so Multipass does not imply it directly executes tool permissions.
- Rename `Claim swarm` to claim-state language such as `New owner claim required`.
- Rename `Transfer / Claim Preview` to `Transfer State Preview` so it reads as profile state, not an active transaction wizard.
- Collapse the visible taxonomy wall behind a proof vocabulary disclosure.
- Remove the global public-fragment count from the story card, because it conflicts visually with selected proof counts like `3 public` for Helixa Swarm.

## Defer

- Full claim/transfer stepper.
- Executable transfer actions.
- Runtime tool authorization.
- Dynamic swarm membership proofs.
- Marketplace or NFT sale flows.

## Recommended next slice

Perform a V0 tightening pass only:

1. Change overreaching control/action labels to state/reference labels.
2. Collapse proof legends by default.
3. Replace global fragment-count copy with selected-proof copy.
4. Preserve all existing data/schema coverage and static route behavior.
5. Re-run full tests, static build, mobile smoke, and live smoke.

Success means the prototype still demonstrates agents, swarms, proof, custody, and transfer policy, but no longer feels like Multipass is already a full governance or transfer execution system.

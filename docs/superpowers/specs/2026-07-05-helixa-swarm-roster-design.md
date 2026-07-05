# Helixa Swarm Roster Design

## Goal
Upgrade the existing Helixa Swarm Multipass card into a credible parent Multipass for the core Helixa agent team, using named AgentDNA identities that read like a real operating swarm.

## Decision
Use the existing `Helixa Swarm` card and keep its parent identity stable:

- Name: `Helixa Swarm`
- Helixa ID: `8453:swarm:helixa`
- Subject type: `swarm`
- Role: `Parent Multipass`

Do not create a second swarm or fake collection record for this slice.

## Visible roster
The public roster should contain five named agents:

- `Bendr 2.0` #1 - Lead Agent / Trust Router
- `Quigbot` #81 - Product / Strategy Agent
- `Helixa` #1066 - Protocol / Identity Agent
- `Phantom Relay` #1058 - Routing / Relay Agent
- `Nox` #1059 - Ops / Safety Agent

The card should feel like a team profile, not a test fixture.

## Product copy
The swarm card should explain that it is the parent Multipass for Helixa's core agent team. It should make three points clearly:

1. The parent Multipass groups the roster into one public swarm record.
2. Each agent keeps its own AgentDNA, Cred context, ownership, and permissions.
3. Shared controls are display-only public context for routes, tools, owner approval labels, and transfer-aware review status. They do not grant authority, execute tools, transfer custody, or expose private credentials.

Use concise copy. Do not expose raw `frag_...` identifiers in default visible text. Opt-in proof/debug/JSON payload views may retain stable fragment identifiers for machine readability, but card titles, roster copy, and default human text must use readable labels.

## Data model changes
Update the static demo/profile data for the existing swarm card:

- Increase `members` from `3` to `5`.
- Replace the roster with the five named agents above.
- Add role descriptions where the existing renderer can display them cleanly.
- Keep `credScore` and `credTier` as the parent swarm's aggregate context unless the product explicitly recalculates it later.
- Preserve existing custody, transfer, owner review, and shared-control fields only as display-only public context. Avoid copy that implies this slice performs custody actions, permission changes, route execution, or private access changes.

If the homepage/gallery, fragments, card fixtures, tests, or public copy show an internal/test identity that is not part of this public product story, remove or replace that public mention rather than explaining why it is not in the swarm.

## Non-goals
- No new minting.
- No wallet signing.
- No x402 payment handling.
- No custody transfer.
- No permission mutation or route execution.
- No private credential access.
- No dynamic collection import flow in this slice.
- No new external swarm host claim.
- No change to the x401/x402 distinction: x401 remains identity/authority proof metadata; x402 remains payment metadata.

## Testing
Add or update tests before implementation so they fail against the current roster and pass only after the new public roster is present.

Coverage should verify:

- Helixa Swarm displays five members.
- The visible roster includes Bendr 2.0, Quigbot, Helixa, Phantom Relay, and Nox.
- The roles render with the intended labels.
- Raw fragment IDs are not rendered in default swarm text; stable IDs may remain inside explicit proof/debug/JSON views.
- Existing parent swarm controls and aggregate Cred context still render as display-only public context.
- No public/default UI or public copy mentions internal/test identities that are not in the approved visible roster.

## Verification
Before claiming completion, run:

- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- `git diff --check`

If deployed, smoke-check:

- `https://helixa.xyz/multipass/`
- the public Helixa Swarm card on mobile and desktop

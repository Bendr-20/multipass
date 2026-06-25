# Multipass V0 Tightening and Profile Hardening Design

## Goal

Make the current Multipass prototype feel like a portable agent trust profile, not a marketplace, transfer wizard, or operational control plane. Keep the useful live Helixa work from today, but tighten copy and structure so V0 stays aligned with the product spec and roadmap.

This pass also hardens Bendr profile data so lore and personality do not disappear when fast onchain detail reads time out.

## Product position

Primary sentence:

```text
Multipass is a portable trust profile for agents, combining identity, public proof, standards support, custody context, and access receipts into one inspectable record.
```

The live Aura and marketplace-style panels should support this story. They should not become the story.

## Scope

### In scope

1. Re-center the web prototype around portable trust profile language.
2. Keep live Helixa resolver, `?agent=` links, name lookup, real Aura images, and provenance drawer.
3. Rename or soften marketplace-forward language where it overpowers the trust-profile purpose.
4. Improve V0.2 proof-state clarity for fragments: status, assurance, visibility, transfer policy, and source.
5. Update docs so accepted resolver reality is explicit: limited Helixa token/name lookup exists, not broad search or ranking.
6. Update docs so real Helixa Aura provenance is documented as display-only public provenance.
7. Harden Bendr token #1 API profile fallback so narrative/personality can survive bounded read failures.
8. Preserve all safety boundaries: no wallet controls, no claim execution, no transfer execution, no payment settlement, no private credential release.

### Out of scope

- New wallet connect or auth.
- Real owner dashboard editing.
- Transfer or claim execution.
- Paid endpoint settlement.
- Marketplace listing actions.
- Dynamic swarm membership proofs.
- Broad directory ranking or fuzzy search.

## Multipass web changes

### Hero and live profile framing

The hero should make the trust-profile purpose obvious before users see Aura or marketplace visuals. Live agent pages should read as live profiles with public provenance, not marketplace listing pages.

Keep share links and live labels, but prefer:

- `Live trust profile`
- `Portable agent record`
- `Public proof context`
- `Agent Aura visual`
- `Display-only provenance`

Avoid making `marketplace` the dominant label. Marketplace compatibility can appear as a secondary use case.

### Aura panel

Keep the real Aura image source:

```text
https://api.helixa.xyz/api/v2/aura/{tokenId}.png
```

Keep the OpenSea-style visual scale because it helps the NFT/visual context, but label it as an Agent Aura visual inside the trust profile.

The provenance drawer stays immediately under the Aura panel. It remains display-only and must say it does not grant authority, verify private credentials, or expose secrets.

### Fragment clarity

The fragment section should be easier to scan:

- Each fragment card should show status, assurance, visibility, transfer policy, and source in a consistent order.
- Add one concise helper sentence explaining that fragments are signals with different trust strength, not equal proof.
- Keep legends collapsed by default.
- Use state language, not action language.

### Owner, custody, change, and transfer previews

Keep these as read-only state sections. They should answer what changed, who controls what, and what would need review. They must not read like executable flows.

Preferred wording:

- `State reference`
- `Review required`
- `Authority paused until reverified`
- `Transfer policy`
- `Owner-controlled approval required`

Avoid:

- `Execute`
- `Approve now`
- `Claim now`
- `Transfer now`
- `Unlock secrets`

## Documentation changes

Update the relevant spec and roadmap notes to say:

1. V0.1 remains canonical agent trust profile.
2. The prototype now includes limited live Helixa resolution by token ID and simple name/handle lookup.
3. Name lookup is exact or limited directory lookup, not ranking, marketplace search, or generalized discovery.
4. Agent Aura provenance is public visual provenance and not an authority or credential proof.
5. Marketplace display is compatibility context, not a native marketplace launch.
6. Bendr lore fallback hardening is required because public profile stability matters for trust-profile continuity.

## Bendr profile hardening

Current issue: live `/api/v2/agent/1` can return `narrative: null` and `personality: null` when bounded onchain reads time out and local fallback lacks those fields.

Desired behavior:

- Formatting helpers should normalize ethers tuple responses using numeric indexes and named keys.
- If onchain detail reads fail, token #1 should have a tracked fallback for narrative/personality/core traits.
- Fallback should be safe public data only.
- API should still prefer fresh onchain data when available.
- The endpoint should keep bounded response behavior, not return to unbounded slow reads.

Implementation should happen in a clean Helixa clone or branch so existing dirty live checkouts are not used as deploy bases.

## Testing

Multipass tests should cover:

- Hero/product copy centered on portable trust profile.
- Marketplace copy is secondary and read-only.
- Fragment cards expose status, assurance, visibility, transfer policy, and source.
- Aura provenance drawer remains display-only and uses safe links.
- Wording gate rejects executable claim/transfer/payment language.
- Live resolver behavior remains intact.

Helixa/API tests or smoke scripts should cover:

- Formatting narrative/personality from ethers tuple-style results.
- Fallback for token #1 when `getNarrative` or `getPersonality` returns null.
- Live smoke for `/api/v2/agent/1` returning Bendr narrative/personality.

## Deployment and verification

1. Run Multipass tests and build.
2. Deploy `/multipass/` artifact to `helixa.xyz` from a clean artifact path.
3. Smoke `https://helixa.xyz/multipass/` and `https://helixa.xyz/multipass/?agent=1`.
4. Verify live bundle contains tightened copy and still contains Aura provenance.
5. Apply API hardening from clean Helixa/AgentDNA branch.
6. Smoke `https://api.helixa.xyz/api/v2/agent/1` for Bendr narrative/personality.

## Success criteria

- A builder can describe Multipass as a portable agent trust profile after reading the first screen.
- Aura and marketplace visuals feel like evidence/context, not the product category.
- Transfer and owner sections are clearly state previews, not executable flows.
- Fragment trust states are easier to scan.
- Bendr lore/personality remains present even under bounded read fallback.
- Tests, build, diff check, and live smoke pass.

# Multipass True Homepage Design

## Problem

The current `/multipass/` route still reads like a Bendr profile demo with explanatory product copy around it. That makes Multipass feel like a single example record instead of a product with its own homepage, story, and visual identity.

The next pass should make `/multipass/` a true Multipass homepage. Bendr, Quigbot, and other sample/live records should appear as example trust profiles inside the product, not as the page frame.

## Goal

Ship a homepage that answers quickly:

- What is Multipass?
- Who is it for?
- What does a Multipass profile look like?
- Why do profiles need trust context, custody state, proof, routes, and visuals?
- How can someone inspect a live Helixa AgentDNA record?

## Homepage hierarchy

1. **Product hero**
   - Lead with Multipass as the homepage subject.
   - Use a headline about portable trust profiles for agents, humans, swarms, collections, projects, organizations, and AI-native systems.
   - Include concise supporting copy.
   - Include primary CTA to resolve a live agent and secondary CTA to inspect the example gallery/proof.
   - Do not lead with Bendr-specific fields, receipt IDs, raw slugs, or a record sheet.

2. **Visual profile gallery**
   - Replace the text-heavy carousel feel with visual cards.
   - Cards should show an Aura/image/visual frame, name, role/type, Cred summary, separate trust state, verification, custody hint, and a short proof summary.
   - Bendr and Quigbot can be featured examples, but the gallery should also make room for human, swarm, collection, project, and organization-style Multipass subjects.
   - Selected card can still drive deeper proof sections, but the first read must be visual and product-like.

3. **Live resolver feature**
   - Keep the live Helixa resolver, but frame it as a homepage feature: "Inspect a live AgentDNA profile".
   - The resolved result can take over a feature panel or selected gallery card, not the whole homepage identity.
   - URL deep links like `?agent=81` should still resolve live data and show the live profile context.

4. **How Multipass works**
   - Replace the current explanatory blocks with a short three-step product narrative:
     1. Identify the subject.
     2. Attach public proof and custody context.
     3. Let apps and agents read the trust profile safely, with marketplace compatibility as a secondary integration context.
   - Keep this concise and lower than the visual gallery.

5. **Proof and trust inspection**
   - Keep proof map and proof ledger, but position them as deeper inspection for the selected example/live profile.
   - Do not let raw proof infrastructure dominate the homepage above the fold.

## Visual card requirements

Each gallery card should include:

- Visual asset or generated fallback frame.
- Subject name.
- Subject type/role.
- Cred label or payment/access context, clearly separate from trust state.
- Verified/unverified state.
- Custody/owner/operator hint.
- Public proof count or proof summary.
- Visual tone tied to trust state/type.

Cards should not be plain text tabs. They need to feel like product objects.

## Copy guardrails

Use:

- "agent trust profile"
- "identity graph"
- "public proof"
- "custody context"
- "discovery profile"
- "marketplace compatibility" only as secondary language

Avoid:

- Making Multipass sound like only Bendr's page.
- Making marketplace the primary product.
- Executable claims like claim now, buy, transfer now, approve now, or unlock secrets.
- Raw protocol fields above the fold.
- Emoji and em dashes.

## Implementation shape

- Add homepage-specific content builders in `apps/web/src/content.js`.
- Refactor `render()` in `apps/web/src/app.js` so homepage sections are explicit:
  - header
  - product hero
  - resolver strip/feature
  - visual profile gallery
  - selected profile detail/proof
  - how-it-works
  - proof ledger
- Reuse existing data mapping where possible.
- Extend agent card models with `visualIdentity`, `visualTone`, `proofSummary`, and CTA/detail copy.
- Keep existing resolver, provenance drawer, marketplace compatibility context, and proof filtering behavior unless tests require focused adjustments.

## Tests

Add or update tests to prove:

- Homepage hero is Multipass-first and does not lead with Bendr record-sheet language.
- Bendr appears as an example/profile card, not the entire page identity.
- Visual cards render image/fallback frames, separate trust state and Cred/access context, custody, and proof summary.
- Homepage renders only public fields, not gated, private, or hidden data.
- Homepage avoids emoji, em dashes, raw protocol fields above the fold, and executable claim, buy, transfer, approve, or unlock language.
- Resolver still works for `1`, `81`, `Bendr`, `Quigbot`, and `?agent=81`.
- Proof map still follows the selected visual card.
- Blocked marketplace/action language remains absent.

## Acceptance criteria

- `/multipass/` reads as a true homepage within the first screen.
- Cards in the carousel/gallery have strong visuals and profile-object feel.
- Bendr is clearly an example, not the page wrapper.
- Existing live resolver behavior stays intact.
- Humans and organizations are represented in the product framing even if the first bundled example set remains AgentDNA-heavy.
- Tests and build pass.

# Multipass What It Does Card Design

## Goal
Update the homepage “What it does” card from a sparse stat panel into a stronger compact system-map explainer. It should combine high-level product copy with a clear visual structure inspired by the provided Multipass Identity Stack image, without becoming a dense whitepaper diagram.

## Approved Direction
Use a compact system-map card between a mini diagram and a full system map.

### Content
- Keep the card label: “What it does”.
- Headline: “Multipass turns scattered agent identity into one readable trust profile.”
- Body: explain that Multipass connects identity, ownership, permissions, endpoints, proof, work history, and Cred context into one portable profile humans and agents can verify.

### Visual Structure
Render three connected zones:
1. **Identity inputs**
   - AgentDNA
   - Owner wallet
   - Manager agent
   - Endpoints
   - NFT provenance
2. **Multipass**
   - Human-owned
   - Agent-managed
   - Standards-readable
3. **Usable profile**
   - Public proof
   - Permissions
   - Work routes
   - Trust context
   - Shareable profile

### Bottom Protocol Strip
Use small chips for:
- ERC-8004
- AgentDNA
- Cred
- x402
- MCP/A2A

Do not include Wiretap or ClawBank for now.

## Layout
- Replace the current four-stat `.homepage-proof-grid` with a diagram-style block inside `.homepage-proof-panel`.
- Keep the panel below the hero, matching the current homepage order.
- Preserve the existing visual language: paper background, bordered cards, muted gradients, uppercase labels, and strong dark Multipass center block.
- Make the system map responsive. On desktop it can use a three-column layout. On mobile it should stack vertically while preserving the flow.

## Behavior
- Display-only only. No links, wallet actions, approvals, transfers, claims, or executable controls.
- The card should not expose private data or imply live authority changes.
- The explainer should stay public-facing and avoid overclaiming standards support beyond readable/profile context.

## Tests
- Add/update render tests asserting the new headline, three zones, approved chips, and absence of Wiretap/ClawBank.
- Update mobile/layout tests to assert the diagram stacks cleanly and does not retain the old four-stat grid requirement.
- Run focused app/mobile tests, full test suite, build, deploy, and verify live JS/CSS.

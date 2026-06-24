# Multipass Product Readiness Spec

## Purpose
Define what must be true before Multipass moves from hidden prototype to a discoverable product surface.

The current `/multipass/` route is a working artifact demo. It is useful for internal review, but it does not yet explain the product clearly enough to make the route discoverable.

## Current state
- Live hidden route: `https://helixa.xyz/multipass/`
- Status: internal prototype only
- Data mode: bundled static Bendr fixture
- Design mode: Protocol Artifact direction
- Discovery: none planned

## Core problem
The prototype shows a record, proof ledger, standards references, and receipt evidence, but it does not yet answer the most important product questions:

1. What is Multipass in one sentence?
2. Who is it for first?
3. What pain does it solve now?
4. What is live today versus simulated fixture data?
5. Why should an agent builder, collection, marketplace, or infra partner care?

Until those answers are crisp, the page should stay unlinked. Unlinked is not access control: treat `/multipass/` as publicly accessible and keep secrets, private user data, internal endpoints, auth material, live tokens, and unredacted proof data out of the route.

## Positioning work required

### One-sentence definition
Draft and approve one plain-English line that can sit above any technical explanation.

Candidate direction:

```text
Multipass is a portable trust profile for agents, bundling identity, public proof, standards support, and access receipts into one inspectable record.
```

This is a draft, not approved final copy.

### First audience decision
Choose one first audience for the next version. Do not try to speak to everyone at once.

Options:

1. Agent builders
   - Need: prove what an agent is, supports, and has done.
   - Benefit: easiest technical buyer to understand proof records.

2. Agent NFT collections
   - Need: activate and manage fleets of agent identities.
   - Benefit: strongest Helixa narrative tie, but requires clearer collection and transfer flows.

3. Marketplaces and directories
   - Need: trust metadata for listed agents.
   - Benefit: practical distribution angle, but requires API credibility.

4. Infra partners
   - Need: standards-compatible identity and proof layer.
   - Benefit: aligns with ERC-8004 and x402 story, but can become too abstract.

Recommendation for next iteration: agent builders first, with collection support as the second story.

## Demo clarity requirements
The prototype must clearly separate:

- Real implemented behavior.
- Static fixture data.
- Planned protocol behavior.
- Future integrations.

Required labels or sections:

- `Internal Prototype` or equivalent team-review label while hidden.
- `Static Demo` for bundled fixture mode.
- A concise explanation of why the proof ledger matters.
- A clear note that there is no live auth, settlement, contract read, or editing in this route.

## Product story gaps
Before broader discovery, resolve these gaps:

### 1. Multipass versus Helixa
Explain the relationship without making the product hierarchy muddy.

Working model:
- Helixa is the identity layer.
- Multipass is the portable agent trust profile surface.
- AgentDNA is the protocol record model.
- Cred is the trust score/evidence layer.

### 2. Multipass versus Cred
Avoid making Multipass sound like a score product. Multipass should feel like the container for identity and proof, while Cred is one trust signal inside or beside it.

### 3. Static proof versus live proof
Make it obvious when users are looking at demonstration data.

### 4. Agent transfer and swarms
These are promising directions, but not required for the first public page. Mention only after the core record story is clear.

### 5. Standards claims
Avoid implying unsupported chain indexing, live settlement, or production attestations. Standards references should be framed as compatibility direction unless verified live.

## UX readiness checklist
Before making `/multipass/` discoverable:

- Mobile layout reviewed on narrow width.
- JSON toggles are understandable to non-developers.
- Hero copy explains the product without relying on insider terms.
- Fixture labels are visible enough that nobody mistakes the route for production data.
- No private data or internal-only claims appear in expanded JSON.
- Page has a clear next action only if the team wants one.

## Prototype discovery gates
Keep the route unlinked unless all gates pass and the team separately approves broader discovery:

1. Product sentence approved.
2. First audience approved.
3. Demo claims reviewed.
4. Mobile and copy pass complete.
5. Team explicitly approves making the page discoverable.

## Non-goals
- No backend implementation.
- No new auth flow.
- No wallet connection.
- No contract reads.
- No promotional copy.
- No homepage nav.
- No broader discovery plan.

## Acceptance criteria
This readiness spec is useful when it gives the team a clear checklist for why `/multipass/` is hidden today and what needs to improve before it becomes discoverable.

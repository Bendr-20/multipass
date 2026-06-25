# Multipass Live Agent Card Polish Design

## Decision

Polish the live Helixa resolver result so it feels like a marketplace-ready agent listing with a little product-demo impact. The live card should answer the first marketplace questions quickly: who is this agent, what trust signals does it carry, what routes can a buyer or integrator inspect, what proof backs the listing, and what authority is not being transferred or executed here.

The slice stays read-only. It does not add wallet connection, claim, transfer, payment execution, approval controls, private credential release, name search, slug search, fuzzy search, or a backend service.

## Goals

- Make `https://helixa.xyz/multipass/?agent=1` and `https://helixa.xyz/multipass/?agent=81` feel like real marketplace listing pages, not just raw resolver output.
- Keep the current resolver input scope: token IDs and canonical Base Helixa IDs only.
- Preserve static `/multipass/` behavior by default.
- Put marketplace-useful live data near the top: name, Helixa ID, Cred, tier, verification, framework, owner summary, services, channels, payment references, proof count, profile link, and explorer link.
- Add enough visual punch that a user understands Multipass as the agent listing trust layer.
- Keep all authority-changing concepts display-only and clearly separated from active controls.

## Non-goals

- No marketplace transactions.
- No bidding, purchasing, listing creation, escrow, checkout, or payment settlement.
- No claim flow.
- No transfer execution.
- No wallet auth.
- No private credential unlock.
- No public rendering of raw private-looking fields if the API later returns them.
- No new API endpoint.
- No name, slug, URL, or fuzzy search.
- No new chain support beyond Base Helixa AgentDNA records.

## User experience

When the page is loaded without `?agent=`, it keeps the static prototype experience.

When a live agent is resolved, the page should show a new marketplace-style live listing panel near the top, after the resolver and before the existing agent card carousel. This panel is the first product read. The existing carousel, owner snapshot, change ledger, transfer state preview, proof map, and proof ledger remain below it as deeper inspection layers.

The listing panel should feel like an agent marketplace card expanded into a detail view:

- Left side: agent identity, primary score, trust badges, and a short listing summary.
- Right side: route and proof facts that marketplaces care about.
- Bottom or side strip: public service routes and profile/explorer links.

The visible hierarchy should be:

1. Hero and resolver.
2. Live marketplace listing panel.
3. Existing agent card carousel and selected card detail.
4. Owner & Custody Snapshot.
5. Change + Review Ledger.
6. Transfer State Preview.
7. Proof inspection sections.

The listing panel appears only when mapped data includes a live listing model. Static fixture data can remain unchanged unless adding a fixture listing makes tests clearer.

## Listing content

The live marketplace listing should be generated from normalized public fields, not raw object spreading.

Recommended displayed fields:

- Agent name, for example `Bendr 2.0` or `Quigbot`.
- Helixa ID, for example `8453:1`.
- Token ID.
- Framework, for example `openclaw`.
- Cred label and tier, for example `Cred 80` and `Preferred`.
- Verification state, for example `Verified AgentDNA` or `Unverified AgentDNA`.
- Owner short address if published.
- Operator short address if published, otherwise `Not delegated`.
- Open-to-work state when `metadata.openToWork` is present.
- Public channels from `socials` and `metadata.preferredCommunicationChannels`.
- Public service routes from `services`, such as web, telegram, MCP, and A2A.
- Accepted payment references from `metadata.acceptedPayments` and linked token fields, displayed as references only.
- Public proof count and verified signal count.
- Source label, for example `Live Helixa API`.
- Profile URL and explorer URL when present.

Optional listing summary:

- Use a short safe summary from whitelisted fields only.
- Prefer service categories, skills, domains, framework, and organization.
- Do not render long raw personality, narrative, lore, or unexpected freeform API blobs directly in the listing panel.
- If no useful summary exists, fall back to a clear default such as `Live AgentDNA record with public trust, route, and ownership context.`

## Copy direction

The copy should sound like a marketplace trust read, not an internal debug tool.

Suggested section label:

`Marketplace listing preview`

Suggested heading pattern:

`Verified agent listing for Bendr 2.0`

Suggested summary pattern:

`A live Helixa AgentDNA record packaged for marketplaces, app directories, and agent stores. Public routes and proof are visible; authority and private credentials stay protected.`

Suggested proof strip labels:

- `Identity`
- `Cred`
- `Routes`
- `Owner`
- `Proof`

Forbidden or risky phrasing:

- Do not say or imply that reputation can be bought.
- Do not use travel-document metaphors for the profile.
- Do not split the Multipass name into two words.
- Do not introduce agent-name suffix syntax that belongs to deferred naming work.
- Do not add a sixth trust tier.
- Do not use instant authority labels for approval, transfer, claim, checkout, or credential release.
- Use the one-word form for onchain if that concept is needed.

## Visual direction

Keep the warm Multipass palette and editorial card style. The listing should look more premium than the current selected card, but it should not become a separate visual system.

Recommended visual structure:

- A large bordered `live-listing` card using the existing paper, ink, line, green, and shadow tokens.
- A compact marketplace badge row across the top.
- One high-impact Cred block, using tier and score as the focal point.
- A clean route grid with public route labels and safe outbound links.
- A proof summary strip with counts and states.
- Mobile layout must be single-column with no horizontal page overflow.

The little product-demo impact should come from hierarchy and polish, not animation or gimmicks.

## Data model

Add a normalized optional model to the mapped Multipass data shape:

```js
marketplaceListing: {
  title,
  subtitle,
  summary,
  identity: {
    name,
    helixaId,
    tokenId,
    framework,
    verifiedLabel,
    sourceLabel,
  },
  score: {
    label,
    tier,
    value,
    tone,
  },
  badges: [
    { label, tone }
  ],
  facts: [
    { label, value, tone }
  ],
  routes: [
    { label, value, url, kind }
  ],
  paymentReferences: [
    { label, value, chainId, source }
  ],
  proof: {
    publicFragmentCount,
    verifiedSignalCount,
    reviewRequiredCount,
    privateCredentialState,
  },
  links: [
    { label, url, kind }
  ],
  safetyNote,
}
```

This model should be produced by the live Helixa adapter and consumed by a dedicated renderer. It should not require the UI to know raw Helixa API field names.

## Mapping rules

Create a focused mapper, for example `createLiveMarketplaceListing(agent, tokenId, fragments, profileUrl)`, called from `mapHelixaAgentToMultipassDemo(agent)`.

Mapping details:

- `title` should include the agent name.
- `subtitle` should include Helixa ID and framework.
- `score.value` uses `credScore` only when numeric.
- `score.tier` must use the existing five-tier model: Junk, Marginal, Qualified, Prime, Preferred.
- `badges` may include verified state, soulbound state, open-to-work state, framework, and Base.
- `facts` should include owner, operator, token ID, generation, version, points, and source when present.
- `routes` should include public service and social routes only.
- `paymentReferences` should include public accepted-payment and linked-token references only, for example USDC on Base or CRED linked-token context when published by the API. These are listing references, not payment execution controls.
- `links` should include public profile and explorer links only.
- `proof.publicFragmentCount` comes from public fragments created by the mapper.
- `proof.verifiedSignalCount` counts fragments with `status: verified`.
- `proof.reviewRequiredCount` counts pending or stale fragments.
- `privateCredentialState` should be explicit, for example `No secrets or private credentials exposed`.
- Unknown or empty fields should degrade to clear fallback text, not blank holes.

## Rendering design

Add a renderer such as `renderMarketplaceListing(listing)` in `apps/web/src/app.js`.

Placement:

- Render after `renderLiveResolver(state)`.
- Render only when `data.marketplaceListing` is present.

Rendering behavior:

- Use links only for safe public URLs.
- Safe public URLs must use `https:` or `http:`. Reject or render as plain text for `javascript:`, `data:`, `file:`, malformed URLs, or protocol-relative surprises.
- Handle-only values such as Telegram or X handles should render as text unless the mapper creates a known safe public URL.
- External links should not look like execution controls and should use `target="_blank"` with `rel="noopener noreferrer"` if they open a new tab.
- Labels and values must be escaped.
- Long handles, URLs, and addresses must wrap cleanly.
- The section should be independently understandable without opening proof JSON.

Suggested classes:

- `.marketplace-listing`
- `.listing-head`
- `.listing-score`
- `.listing-badges`
- `.listing-facts`
- `.listing-routes`
- `.listing-proof-strip`
- `.listing-link`

## Error handling and empty states

Existing resolver errors stay unchanged.

For listing-specific missing data:

- Missing owner: `Owner not published`.
- Missing operator: `Not delegated`.
- Missing Cred: `Cred pending` and `Unrated`.
- No services: `No public service routes published`.
- No payment references: `No public payment references published`.
- Payment references should render in their own listing row or strip, not inside service routes.
- No explorer: omit the explorer link.
- No profile URL: omit the profile link or show a non-link fallback.

Do not fail the resolver because listing enrichment fields are missing.

## Privacy and safety

- Use only public Helixa API fields already fetched by the resolver.
- Do not send cookies, credentials, wallet signatures, payment proofs, or private headers.
- Do not render raw unknown objects into listing HTML.
- Do not render fields with suspicious secret-bearing names such as private keys, hidden credentials, secrets, auth tokens, session tokens, access tokens, passwords, or similar private-looking keys.
- Public AgentDNA token IDs, NFT token IDs, linked token symbols, linked token contract references, and accepted payment references may be displayed when they come from explicitly mapped public API fields.
- Do not add controls that execute approval, transfer, claim, checkout, payment, or credential release.
- Keep transfer language contextual and read-only.

## Accessibility

- The listing card should have a clear heading.
- Badge text must not be color-only.
- Links need descriptive labels.
- The proof strip should use readable text, not icons only.
- Mobile hit targets for links should be comfortable.
- Horizontal scrolling should not appear on the page at 390px width.

## Testing plan

Unit tests:

- `createLiveMarketplaceListing` maps Bendr 2.0 into a marketplace-ready listing with name, `8453:1`, `Cred 80`, `Preferred`, `openclaw`, owner short address, routes, `paymentReferences`, profile link, explorer link, and proof counts.
- The same mapper handles Quigbot with `8453:81`, `Cred 75`, `Prime`, public X route, web, MCP, A2A, and no payment references.
- Missing optional fields degrade to readable fallbacks.
- Suspicious secret-bearing fields are not rendered or included in the listing model.
- Public token identifiers and linked token/payment references remain allowed only through explicit public mappers.
- Cred tier remains five-tier only.

UI tests:

- Live resolver render shows the marketplace listing after a successful resolve.
- Static `/multipass/` without a live agent does not fetch live data and does not require the listing model.
- The listing includes safe public links and does not render executable action controls.
- Unsafe URLs render as plain text or are omitted.
- The listing is escaped and does not spread raw API JSON.
- Mobile CSS keeps the listing single-column with no desktop grid squeezing.

Wording tests:

- No blocked wording covered by the existing wording gate, including travel-document metaphors, split Multipass spelling, deferred naming syntax, sixth-tier trust wording, reputation-purchase phrasing, hyphenated onchain spelling, or executable authority labels.
- Keep `Multipass` one word.
- Keep `onchain` one word if used.

Verification commands:

```bash
pnpm test
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
git diff --check
```

Browser and live smoke after deployment:

- `https://helixa.xyz/multipass/` remains static by default.
- `https://helixa.xyz/multipass/?agent=1` renders the marketplace listing for Bendr 2.0.
- `https://helixa.xyz/multipass/?agent=81` renders the marketplace listing for Quigbot.
- Mobile viewport at 390px has no horizontal overflow.
- No `/multipass-api` appears in deployed HTML or live resolver flow.

## Implementation boundaries

Files likely involved:

- `apps/web/src/live-helixa-resolver.js`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/live-helixa-resolver.test.mjs`
- `apps/web/test/app.test.mjs`
- `apps/web/test/mobile-layout.test.mjs`
- `apps/web/test/wording.test.mjs`
- `apps/web/test/fixtures/helixa-agent-1.json`

Keep the slice focused on the live listing surface. Do not refactor unrelated proof sections, static fixture content, local API server behavior, or deployment flow unless a test proves the listing needs it.

## Acceptance criteria

- A live resolved agent has a marketplace-style listing panel above deeper proof sections.
- Bendr 2.0 and Quigbot both render clean listing states from the public Helixa API.
- The listing makes Cred, verification, framework, owner, services, routes, public links, and proof counts easy to scan.
- The listing contains no execution controls.
- Static `/multipass/` behavior remains unchanged.
- Mobile layout is polished and overflow-free.
- Tests, build, wording checks, and live smoke pass before completion is claimed.

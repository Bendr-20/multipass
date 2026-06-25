# Multipass Live Aura Provenance Drawer Design

## Goal

Add a live Agent Aura provenance drawer directly under the OpenSea-style Aura panel so users can inspect the public data that connects the visual to the resolved Helixa AgentDNA record.

## User outcome

On `https://helixa.xyz/multipass/?agent=81`, the Aura should not just look good. It should answer: which AgentDNA token is this, where did the image come from, what public contract/API fields back the display, who is the API-reported owner, and where can a user inspect the public record externally.

## Identity terms

- **Helixa ID**: canonical display ID in the form `8453:<tokenId>`, where `8453` is Base mainnet.
- **AgentDNA token ID**: the numeric token ID inside the live Helixa V2 contract, e.g. `81` for Quigbot.
- **Resolver input**: a user may enter `81`, `8453:81`, or a supported name lookup such as `Quigbot`; the drawer must render the resolved AgentDNA token ID, not the raw input.
- **Example tests**: token `1` may be used for Bendr mapper tests; token `81` may be used for Quigbot UI tests. They are separate live records and must not be conflated.

## Recommended approach

Attach a small `provenanceDrawer` model to the existing live `visualIdentity` object. Render it immediately after `renderAgentAura(data.visualIdentity)` through a new `renderAgentAuraProvenanceDrawer(visualIdentity.provenanceDrawer)` function.

This keeps the Aura as the visual boundary and avoids mixing provenance-specific rows into the broader marketplace listing preview.

## Data model

For live Helixa records, `visualIdentity.provenanceDrawer` should include:

- `title` (required): `Agent Aura Provenance`
- `summary` (required): concise display-only note, using language such as `Public Helixa API-reported provenance for this AgentDNA visual.`
- `facts` (array): rows with `{ label, value }`; omit rows with empty values
- `links` (array): rows with `{ label, url }`; render only safe public URLs
- `safetyNote` (required): short note that the drawer is display-only and does not grant authority, verify private credentials, or expose secrets

Required live facts:

- Helixa ID: `8453:<tokenId>`
- AgentDNA token ID: `<tokenId>`
- Chain: `Base (8453)`
- Contract: `0x2e3B541C59D38b84E3Bc54e977200230A204Fe60`
- Metadata source: `https://api.helixa.xyz/api/v2/metadata/<tokenId>`
- Aura image source: `https://api.helixa.xyz/api/v2/aura/<tokenId>.png`
- API source: `https://api.helixa.xyz/api/v2/agent/<tokenId>`

Optional live facts:

- Owner: `shortAddress(agent.owner)` if valid, otherwise omit
- Cred: `Cred <score> · <tier>` if numeric, otherwise omit
- Framework: framework from live API if present, otherwise omit

Links:

- Metadata JSON: `https://api.helixa.xyz/api/v2/metadata/<tokenId>`
- Aura image: `https://api.helixa.xyz/api/v2/aura/<tokenId>.png`
- Helixa profile: `https://helixa.xyz/agent/<tokenId>` or live profile URL when safe
- OpenSea item: `https://opensea.io/assets/base/0x2e3B541C59D38b84E3Bc54e977200230A204Fe60/<tokenId>`
- BaseScan/explorer: live API `agent.explorer` when safe, otherwise omit

## Wording constraints

Use `provenance`, `public source`, `API-reported`, or `public record` language. Do not imply cryptographic proof, final OpenSea indexing, or independent onchain verification unless the implementation actually performs those checks.

Allowed examples:

- `Public Helixa API-reported provenance for this AgentDNA visual.`
- `Display only. Public provenance does not grant authority or expose private credentials.`

Avoid:

- `Verified ownership proof` unless independently verified onchain
- `OpenSea verified` unless confirmed by OpenSea
- `This proves ownership` unless contract ownership is read directly and checked

## Rendering

The drawer should sit directly below the Aura item panel and before the marketplace listing preview.

Desktop:

- compact provenance header on the left
- dense facts/links on the right
- feels like item provenance, not another marketing section

Mobile:

- one-column stacked facts
- long URLs/addresses wrap safely
- links remain tappable and obvious

Accessibility:

- Use a section with an accessible label or heading.
- Facts must have visible labels and values.
- Link text must be meaningful, e.g. `Metadata JSON`, not raw `click here`.
- Links must be keyboard/tap friendly.

## Link safety

- Parse each URL before rendering.
- Render only `http:` or `https:` URLs.
- Do not render URLs containing username/password credentials.
- External links must use `target="_blank"` and `rel="noopener noreferrer"`.
- Malformed, credential-bearing, or non-http links must be omitted, not rendered as anchors.

## Safety and scope

- Do not add claim, transfer, approval, payment, wallet, or credential-release controls.
- Keep private credentials hidden.
- Do not claim OpenSea indexing or ownership beyond public links and public API fields.

## Test plan

- App render test: live profile renders `.aura-provenance-drawer` directly after `.aura-card` and before `.marketplace-listing`.
- App render test: drawer shows Helixa ID, AgentDNA token ID, Base chain, contract, owner when present, metadata source, Aura image source, API source, OpenSea link, and safety note.
- App render test: no `provenanceDrawer` hides the drawer and does not crash.
- App render test: missing optional facts/links produce no empty rows.
- App render test: malformed, credential-bearing, and non-http links are not rendered as anchors.
- Resolver mapper test: live Helixa data maps token `1` with correct API/image/metadata/OpenSea URLs and does not confuse it with token `81`.
- Existing full test suite and Vite build must pass.
- Live smoke after deploy must confirm the live bundle contains `aura-provenance-drawer` and `https://helixa.xyz/multipass/?agent=81` renders the drawer with the real Aura image.

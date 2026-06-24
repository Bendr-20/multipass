# Multipass Protocol Artifact Visual Redesign

## Purpose

Redesign the first Multipass web demo around a clean, protocol-native visual identity inspired by Normies: restrained, artifact-like, structured, and credible.

The current `apps/web` demo proves the data flow. It should no longer drive the final visual language. This redesign should make Multipass feel like an agent's official trust object: inspectable, composable, durable, and calm.

## Decision

Use the **Protocol Artifact** direction.

This direction borrows from Normies without copying its collectible/art style:

- Monochrome restraint.
- Off-white and charcoal base palette.
- Thin borders and structured cards.
- Strong typographic identity.
- Technical proof sections that feel like a record, not a dashboard.
- Minimal accent color used only for state or verification.

Rejected as primary directions:

- **Soft Premium Profile**: clean, but too consumer-wallet and too soft for Multipass.
- **Operator Terminal**: credible, but too developer-heavy and not ownable enough.
- **Activation Portal**: strong onboarding energy, but too close to AgentKey and too action-first for the main identity surface.
- **Institutional Trust Terminal**: serious, but slightly too finance/institutional. Useful only as secondary influence.

## Goals

- Give Multipass a distinct visual language separate from the existing Helixa holographic look.
- Replace neon/glass styling with a restrained artifact/spec-sheet system.
- Make Bendr 2.0 feel like a verifiable record, not a generic profile card.
- Keep proof data visible and close to the story.
- Preserve all existing data behavior and tests.
- Keep the V0 framework-light: plain DOM, Vite, jsdom.
- Make future pages easy to extend with the same design language.

## Non-goals

- No new product features.
- No auth.
- No wallet connection.
- No DB.
- No production deployment.
- No contract reads.
- No profile editing.
- No x402 settlement.
- No animated art system.
- No collectible framing.
- No pixel art dependency.

## Visual principles

### 1. Record over dashboard

The page should look like a formal record of an agent identity. Avoid dashboard widgets that feel generic. Sections should read like an inspectable trust object.

### 2. Restraint over glow

Use light, space, typography, and borders before gradients or effects. Avoid neon, holographic glass, heavy blur, and cyberpunk glow.

### 3. Proof as structure

Proof should not feel like decoration. Fragments, standards, x402, and receipts should appear as structured record fields, ledger rows, or spec blocks.

### 4. Technical but readable

Use monospace only for record IDs, routes, status values, and JSON/proof details. Product copy should use a clean readable sans.

### 5. One accent with meaning

Accent color should indicate verification/state, not visual excitement. Use it sparingly.

## Palette

Primary palette:

```text
canvas:     #f4efe6  warm off-white
paper:      #fffaf1  record sheet surface
ink:        #191b1c  primary text
charcoal:   #303331  secondary dark
muted:      #626761  body/supporting text
line:       #d4ccbf  borders/dividers
soft-line:  #e4ddd2  subtle borders
```

Accent options:

```text
verified-green: #2f7d55
protocol-blue:  #365f7d
brass:          #9a7630
```

Recommendation for V0:

- Use **protocol-blue** for links, active states, and selected record markers.
- Use **verified-green** only for passed/filtered/settled statuses.
- Use **brass** only if the page needs a warmer premium note, not as the main accent.

## Typography

Use system fonts for V0 to avoid new font loading complexity.

Recommended stack:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Display treatment:

- Use uppercase sparingly for section labels and record stamps.
- Use bold, narrow-feeling layout through letter spacing and weight, not a hard-to-read novelty font.
- Use large, confident headings, but avoid all-caps body copy.
- Main hero headline should use heavier weight, tighter tracking, and a more compressed rhythm than the current rounded/glassy demo.
- Body copy should stay sentence case, medium width, and visibly calmer than the current high-glow dashboard style.
- Field labels should use small uppercase with wider tracking; field values should use larger text or monospace so the record/spec feel is obvious.

Monospace treatment:

```css
font-family: "SFMono-Regular", Consolas, "Liberation Mono", ui-monospace, monospace;
```

Use monospace for:

- `mp_bendr_2`
- `bendr-2`
- `link_ready`
- route paths
- receipt IDs
- JSON blocks

## Page structure

### 1. Header

Minimal record-header style.

Content:

- Brand: `Multipass`
- Small label: `Protocol Artifact`
- Right side: `Local API Demo`

Visual treatment:

- No glowing logo.
- Use a simple square/record mark or typographic wordmark.
- Thin bottom border or open whitespace.

### 2. Hero record

The hero should present Multipass as the identity record layer.

Copy direction:

```text
Eyebrow: MULTIPASS RECORD
Headline: Verifiable identity records for autonomous agents.
Body: Multipass turns agent identity, public proof, standards, and access receipts into one portable trust object.
Note: Local demo reading the Bendr 2.0 fixture.
```

Avoid overclaiming production status.

### 3. Bendr record sheet

Replace the existing glass command card with a record sheet.

Fields:

- Record: `mp_bendr_2`
- Subject: `agent`
- Slug: `bendr-2`
- Status: `link_ready`
- Trust state from fixture
- Receipt: `receipt_bendr_lookup`
- Source: local API

Visual treatment:

- Off-white sheet surface.
- Thin border.
- Grid cells.
- Small labels in uppercase.
- Values in larger text or monospace.
- A small stamp area for `PUBLIC PROOF ONLY` or `LOCAL DEMO`.

### 4. Story/proof sections

Keep the three current story concepts, but redesign them as formal sections:

1. **Identity Graph**
   - Explain public fragments.
   - Show count and filtered status.

2. **Standards Spine**
   - Show ERC references and adapter state.
   - Avoid implying unsupported chains or live indexing.

3. **Access and Receipts**
   - Show x402 route and receipt evidence.
   - Do not imply live settlement.

Visual treatment:

- Thin-bordered rows or blocks.
- Numbered sections.
- Low-saturation status tags.
- No glossy cards.

### 5. Proof ledger

The current proof cards should become a ledger/spec table.

Rows:

- Profile
- Public Fragments
- Agent Card
- Standards
- x402
- Receipt

Each row should include:

- Document name.
- Status/count.
- One-line summary.
- Button to show/hide JSON.

JSON expansion:

- Keep the existing toggle behavior.
- Use a bordered monospace block.
- Preserve defensive filtering so private fragment IDs never render.

## Component changes

### `src/content.js`

Keep behavior. Adjust copy to match Protocol Artifact language.

Important:

- Keep Bendr-only V0.
- Keep defensive public-fragment filtering.
- Do not introduce new API requirements.

### `src/app.js`

Change markup structure only where needed for the new visual hierarchy.

Required classes/concepts:

- `.record-shell`
- `.record-header`
- `.hero-record`
- `.record-sheet`
- `.field-grid`
- `.story-records`
- `.proof-ledger`
- `.ledger-row`
- `.json-panel`

No framework migration.

### `src/styles.css`

Replace current dark holographic styling with the Protocol Artifact system.

Remove or avoid:

- Holographic gradients.
- Mint/lavender/blue/pink palette.
- Glassmorphism.
- Heavy glow shadows.
- Cyberpunk dashboard feel.

Add:

- Warm off-white canvas.
- Charcoal ink.
- Thin borders.
- Record sheet/grid layout.
- Low-saturation status colors.
- Better light-mode contrast.
- Responsive single-column mobile layout.

## Behavior requirements

Behavior must remain unchanged unless explicitly listed here.

Required behavior:

- Load Bendr demo data from `/multipass-api` by default.
- Support safe `?api=` override exactly as current implementation does.
- Render loading state.
- Render API error/setup state.
- Render all six proof document types.
- Toggle JSON open and closed.
- Never render private fragment IDs, even if the API response unexpectedly includes one.

## Testing requirements

Existing web tests should continue to pass, with updates for new copy/classes where needed.

Add or preserve coverage for:

- Initial loading state.
- Successful Bendr render.
- Record sheet fields render.
- All six proof ledger rows render.
- JSON toggle opens and closes.
- Safe `?api=` override is honored.
- API error state gives setup instruction.
- Private fragment IDs do not render in summaries or JSON.
- New copy does not include forbidden wording.

## Accessibility requirements

- Text contrast should be readable on off-white surfaces.
- Buttons must have visible focus states.
- JSON toggles should use real `button` elements.
- The proof ledger should not rely on color alone for status.
- Mobile layout should remain readable at narrow widths.

## Copy constraints

Do not use:

- travel-document metaphors for agent identity
- split spelling of the product name
- dotted-name product references from older roadmap language
- six-tier trust language
- reputation-purchase phrasing
- old human/agent ownership framing
- em dashes
- emojis

Required wording gate:

- Check new web copy and docs changed by this redesign.
- Build the banned string list in the test script by concatenating safe fragments, so the spec and source do not contain the blocked phrases literally.
- Test for these exact patterns assembled from fragments:
  - `pass` + `port`
  - `Multi ` + `Pass`
  - `.` + `agent`
  - `Legen` + `dary`
  - `buy ` + `reputation`
  - `purchase ` + `reputation`
  - `human-owned, ` + `agent-managed`
- Test for em dash by checking character code `8212`.
- Test web-facing files for emoji ranges unless inside tooling-only fixtures.

Preferred terms:

- `record`
- `trust object`
- `agent profile`
- `AgentDNA profile` only when referring to Helixa/AgentDNA specifically
- `public proof`
- `verification state`
- `receipt evidence`
- `standards reference`

## Open questions

No blocker for V0.

Optional later decisions:

- Whether to commission or choose a real display font.
- Whether Multipass gets a dedicated mark based on a record/square/grid motif.
- Whether the main site should use light mode, dark mode, or both.
- Whether activation flows later borrow more from AgentKey.

## Acceptance criteria

The redesign is complete when:

- `apps/web` visually matches the Protocol Artifact direction.
- Existing data behavior is preserved.
- Web tests pass.
- Full repo tests pass.
- Vite build passes.
- Local smoke through API and Vite proxy passes.
- Wording gate passes.
- Work is committed and pushed.

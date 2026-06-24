# Multipass Story + Proof Web Demo Design

## Purpose

Build the first web/demo surface for Multipass: a one-page hybrid demo that explains the product clearly and proves the local API works with real data.

The page should use a **Profile Command Center + Story Proof** direction. The first impression should feel like a polished Bendr 2.0 command center, then the proof cards underneath should show the live API data. It should answer two questions quickly:

1. What is Multipass?
2. Can I see the actual profile, fragments, standards, x402, and receipt data behind it?

## Current state

The repo already has:

- `@helixa/multipass-types`: public schema contracts.
- `@helixa/multipass-sdk`: validators and JSON/file loaders.
- `@helixa/multipass-api`: memory-backed API route boundary.
- Local API server scripts:
  - `pnpm api:generic`
  - `pnpm api:bendr`
- Validated generic and Bendr fixture sets.
- API routes:
  - `/.well-known/helixa-multipass.json`
  - `/api/multipass/{id}`
  - `/api/multipass/{id}/fragments`
  - `/api/multipass/{id}/agent-card`
  - `/api/multipass/{id}/standards`
  - `/api/multipass/{id}/x402`
  - `/api/multipass/{id}/receipts/{receipt_id}`

`apps/web` is currently empty except for `.gitkeep`.

## Decision

Use **Profile Command Center + Story Proof**.

This combines the strongest parts of the visual options:

- Profile Command Center supplies the interface: Bendr 2.0 gets a polished identity, trust, standards, and API readout surface.
- Story Proof supplies the flow: explain what Multipass does first, then show expandable API proof underneath.

Rejected option:

- API Explorer Split View: useful for builders later, but too raw for a first impression.

## Goals

- Create a minimal runnable web app in `apps/web`.
- Explain Multipass in plain language above the fold.
- Show Bendr 2.0 as the primary V0 demo subject.
- Fetch live data from the local API server through a Vite development proxy.
- Show product-friendly summaries and expandable JSON proof.
- Keep private fragments hidden by relying on the filtered `/fragments` route.
- Keep the app dependency-light and easy to replace later.

## Non-goals

- No production deployment.
- No wallet connection.
- No auth.
- No database.
- No contract reads.
- No x402 settlement.
- No profile editing.
- No generated avatars or heavy visual system.
- No claim that Bendr has a fully live production Multipass identity.

## Proposed commands

Root scripts:

```json
{
  "web:dev": "pnpm --filter @helixa/multipass-web dev",
  "web:build": "pnpm --filter @helixa/multipass-web build",
  "demo:bendr": "pnpm api:bendr"
}
```

Web package scripts:

```json
{
  "dev": "vite --host 127.0.0.1 --port 5173",
  "build": "vite build",
  "preview": "vite preview --host 127.0.0.1 --port 4173",
  "test": "node --test test/*.test.mjs"
}
```

Package metadata:

```json
{
  "name": "@helixa/multipass-web",
  "type": "module",
  "private": true,
  "devDependencies": {
    "vite": "latest",
    "jsdom": "latest"
  }
}
```

Use Vite and jsdom only. Do not add React or a component framework for V0.

The first implementation should run the API and web app as separate processes. Do not add process orchestration yet.

For V0, run `pnpm api:bendr` in one terminal and `pnpm web:dev` in another. The web app targets the Bendr fixture only. Do not include a two-subject selector until the API supports serving multiple fixture subjects at once.

## Web app structure

```text
apps/web/
  index.html
  package.json
  vite.config.js
  src/
    api.js
    app.js
    content.js
    main.js
    styles.css
  test/
    api.test.mjs
    app.test.mjs
    content.test.mjs
```

### `src/content.js`

Responsibilities:

- Store static copy and fixture metadata.
- Define the V0 demo subject:
  - Bendr: slug `bendr-2`, receipt `receipt_bendr_lookup`.
- Keep generic fixture metadata out of the first UI until the API can serve multiple subjects together.
- Provide summary helpers that convert API documents into short display text.

### `src/api.js`

Responsibilities:

- Build route URLs from a configurable API base URL.
- Fetch profile, fragments, agent card, standards, x402 manifest, and receipt.
- Return one normalized object for the selected subject.
- Fail with clear errors when a request fails.

Default browser API base path:

```text
/multipass-api
```

`apps/web/vite.config.js` should proxy `/multipass-api` to `http://127.0.0.1:8787` and strip the prefix. This avoids browser CORS problems during local development without changing the API server.

Allow direct API override with query parameter for advanced local testing:

```text
?api=http://127.0.0.1:9999
```

Safe parsing rules for `?api=`:

- Accept only `http:` and `https:` URLs.
- Reject invalid URLs.
- Strip trailing slashes.
- Fall back to `/multipass-api` when the value is missing or invalid.
- Do not execute or inject the value into HTML.

### `src/app.js`

Responsibilities:

- Render the one-page app into a supplied root element.
- Render the Bendr 2.0 command center.
- Show loading and error states.
- Render summary cards and expandable JSON sections.
- Keep rendering framework-free for V0.

### `src/main.js`

Responsibilities:

- Import CSS.
- Mount the app into `#app`.

### `src/styles.css`

Responsibilities:

- Dark, clean product-demo styling.
- No emojis.
- No huge design system.
- Use CSS variables for palette.
- Responsive single-column mobile layout.

## Page layout

### 1. Hero and command center

Content:

- Eyebrow: `MULTIPASS DEMO`
- Headline: `Portable identity and trust profiles for agents.`
- Body: `Multipass connects identity fragments, standards, work history, access rails, and trust evidence into one readable agent profile.`
- Primary note: `Running against the local Multipass API.`

Right-side Bendr command card:

- Name: `Bendr 2.0`
- Status from profile, expected `link_ready`.
- Subject type from profile, expected `agent`.
- Trust state from profile.
- Local API health indicator.

### 2. Story cards

Three cards:

- `Identity graph`: profile plus public fragments.
- `Standards spine`: ERC-8004, ERC-8217, ERC-8257, and adapter status.
- `Access and receipts`: x402 manifest plus receipt fragment.

### 3. Proof grid

Six proof cards:

- Profile
- Public Fragments
- Agent Card
- Standards
- x402
- Receipt

Each proof card includes:

- Human-readable summary.
- Status pill.
- `Show JSON` toggle.
- Preformatted JSON when expanded.

### 4. Footer note

Content:

`This is a local development demo. It does not include auth, persistence, contract reads, or payment settlement.`

## Data flow

1. User loads web app.
2. App reads `api` query parameter or uses `/multipass-api` through the Vite proxy.
3. App loads Bendr subject metadata: slug `bendr-2`, receipt `receipt_bendr_lookup`.
4. App fetches all six API documents for Bendr.
5. App renders the command center, story cards, and proof cards.

## Error handling

- API offline: show a clear setup message with the command to run:
  - `pnpm api:bendr`
- Vite proxy offline or misconfigured: show the failing proxied route and remind the user that `pnpm api:bendr` must be running.
- Route error: show the failed route and status code.
- Invalid JSON response: show `API returned invalid JSON`.
- Partial failure: fail the selected subject load as a whole for V0. Do not render stale partial data.

## Testing plan

Use TDD.

### API helper tests

- URL builder creates correct proxied routes for profile, fragments, agent card, standards, x402, and receipt.
- Query API base override accepts only safe `http:` and `https:` URLs.
- Invalid query API values fall back to `/multipass-api`.
- Failed fetch returns a clear error containing route and status code.

### Content/helper tests

- Demo subject registry contains Bendr V0 metadata.
- Summary helpers produce non-empty display strings for fixture-shaped documents.
- Private fragment ids do not appear when rendering the fragments returned by the API fixture.

### App rendering tests

Use `jsdom` with Node test.

- Initial render shows loading state.
- Successful load renders the Bendr command center.
- Proof cards render all six document types.
- JSON toggles expand and collapse card JSON.
- API failure renders the setup/error message.
- Private fragment ids are absent from rendered HTML.

### Build and smoke checks

- `pnpm --filter @helixa/multipass-web test` passes.
- `pnpm --filter @helixa/multipass-web build` passes.
- Root `pnpm test` still passes.
- Wording gates pass:
  - no forbidden old product terms
  - no em dashes
- Local smoke:
  - start `pnpm api:bendr`
  - start `pnpm web:dev`
  - fetch the Vite page
  - fetch a proxied API route through Vite
  - verify built HTML/JS exists after build

## Future path

After this demo works locally:

- Add screenshots or a hosted preview.
- Add a richer visual identity.
- Add a proper developer API explorer mode.
- Connect to hosted API infrastructure.
- Add profile editing only after auth and persistence exist.

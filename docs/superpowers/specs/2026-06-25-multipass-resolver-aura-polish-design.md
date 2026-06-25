# Multipass Resolver and Agent Aura Polish Design

## Decision

Polish the live Multipass resolver so it feels like a usable product surface, not a hidden debug input. Add example lookup chips, improve ambiguous match selection, make the resolved share URL more visible, and introduce Agent Aura as the default visual identity placeholder for live agent profiles.

The slice remains read-only. It does not add wallet auth, claim, transfer, payment execution, NFT ownership checks, upload flows, custom image persistence, private credential release, or backend services.

## Goals

- Make `/multipass/` invite the user to resolve a live Helixa agent by token ID, name, or handle.
- Let users click examples such as `Bendr`, `Quigbot`, and `81` instead of typing from scratch.
- Make ambiguous lookup results feel like clean selectable agent cards.
- Make the clean share path visible after a live profile resolves.
- Show an Agent Aura visual as the default placeholder PFP/agent identity image when no explicit visual is selected.
- Make future visual replacement obvious without implementing it: Aura can later be switched to an agent NFT, collection NFT, or custom brand art.

## Non-goals

- No fuzzy search beyond the existing exact/partial directory lookup.
- No new API endpoint.
- No write operation to Helixa, Multipass, wallets, NFTs, or storage.
- No NFT import, upload, mint, claim, transfer, or verification flow.
- No private field rendering.
- No change to static `/multipass/` default behavior except cosmetic resolver affordances.

## User experience

### Resolver examples

The resolver should display a short helper row of example chips near the input:

- `Bendr`
- `Quigbot`
- `81`

Clicking a chip fills/resolves that value through the same resolver path as manual submit. It should respect the existing loading, duplicate-submit, retry, and clean URL behavior.

### Ambiguous matches

When a query matches multiple agents, show a compact picker with card-like buttons. Each result should include:

- agent name
- Helixa ID
- framework
- Cred score or pending state
- verification state

Clicking a match resolves the token ID and updates the URL to `/multipass/?agent=<tokenId>`.

### Share affordance

When a live profile is loaded, the existing share path should become easier to see. It can remain a link, but should read as a small share pill or callout near the live profile hero/resolver area. It should only use safe `/multipass/?agent=<id>` paths.

### Agent Aura placeholder

Live agent profiles should show a visual identity tile near the top. For this slice, the tile is generated locally from public normalized agent fields, not fetched from a new image service.

The default source is:

- `visualSource: aura`
- label: `Agent Aura placeholder`

The Aura should feel like a generated identity mark for the agent. It can use deterministic gradients, rings, initials, or trust-state styling derived from safe public fields such as name, token ID, framework, Cred score, and verification state.

Copy should clarify future flexibility without implying an active feature:

`Default Aura visual. Owners can later bind an agent NFT, collection NFT, or custom visual.`

Future visual source model:

- `aura` - generated default visual identity
- `nft` - owner-selected NFT representation
- `custom` - owner-selected brand art

Only `aura` is implemented in this slice.

## Data flow

- Existing live resolver parses numeric IDs, canonical Base Helixa IDs, names, and handles.
- Directory lookup still reads `https://api.helixa.xyz/api/v2/agents?limit=100` without credentials or private headers.
- Agent detail lookup still reads `https://api.helixa.xyz/api/v2/agent/:id` without credentials or private headers.
- The mapper creates a read-only visual identity model from whitelisted public fields.
- The renderer displays the visual model if present.

## Error handling

- Invalid input, unsupported chain, API failure, rate-limit handling, duplicate submit protection, and stale request invalidation remain unchanged.
- Example chips use the same resolver path and therefore inherit the same errors.
- Ambiguous lookup keeps the static demo visible while showing the match picker.
- Aura rendering must tolerate missing name, Cred, framework, owner, and verification fields.

## Testing

Add tests before implementation for:

- resolver example chips render and resolve through the existing flow
- ambiguous match picker uses selectable card-like results
- live mapped agent data includes an `aura` visual source by default
- live render shows the Agent Aura placeholder and future NFT/custom visual copy
- static `/multipass/` remains usable without API calls
- safe share path remains constrained to `/multipass/`

Run:

- `pnpm test`
- `git diff --check`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`
- live HTTP smoke for `/multipass/`, `?agent=Quigbot`, and ambiguous lookup
- browser smoke for mobile view

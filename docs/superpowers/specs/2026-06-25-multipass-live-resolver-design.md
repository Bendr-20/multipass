# Multipass Live Resolver V0 Design

## Decision

Build the next V0 slice as a read-only live resolver for Helixa AgentDNA records. The resolver accepts a token ID or canonical Helixa ID, fetches the live Helixa API record, maps it into the existing Multipass card and proof shape, and displays it in the current prototype without adding execution, claim, transfer, or search flows.

Approved input scope:

- `1`
- `8453:1`

Deferred future step:

- Name and slug search, such as `Bendr` or `Quigbot`, stays out of this slice. The UI may say that name and slug search is coming later, but must not implement fuzzy search or fake search results.

## Goals

- Turn the static prototype into a resolver that can show real Helixa agents.
- Keep the existing card-first, proof-below product story.
- Preserve the static bundled demo as the default experience at `/multipass/`.
- Avoid any claim that Multipass executes transfers, approvals, permissions, payments, or ownership changes in this slice.
- Keep the implementation small enough for one development plan.

## Non-goals

- No name search, slug search, fuzzy search, or discovery ranking.
- No wallet connection.
- No ownership claim flow.
- No transfer execution.
- No private credential unlock.
- No local `/multipass-api` dependency for the static deployed page.
- No new backend service.

## User experience

The page keeps the current static demo by default. A compact resolver bar appears near the top of the product surface with copy like:

> Resolve live Helixa agent

The input helper says:

> Try `1` or `8453:1`. Name and slug search is coming later.

When a user resolves a valid record, the page displays the live agent through the same sections already used by the prototype:

1. Multipass card
2. Selected proof
3. Owner & Custody Snapshot
4. Change + Review Ledger
5. Transfer State Preview
6. Proof ledger and JSON

The source label changes from bundled fixture to live Helixa API. The static demo remains reachable by clearing the resolved agent or loading `/multipass/` without a resolver query.

## Resolver input rules

Create a small parser unit that accepts only deterministic IDs.

Valid forms:

- Plain token ID: `1`
- Canonical Helixa ID: `8453:1`

Rules:

- Trim surrounding whitespace.
- Token ID must be a base-10 positive integer string. Keep the validated token ID as a string until display or URL encoding so JavaScript number precision cannot corrupt large IDs.
- Canonical ID must be `chainId:tokenId`.
- Chain ID `8453` is supported for V0.
- Any other chain returns a clear unsupported-chain error.
- Empty input returns a validation error without making a network request.
- Names, handles, slugs, URLs, decimals, negative numbers, and mixed text are rejected in V0.

Error copy should be plain and useful:

- Empty: `Enter a Helixa token ID or Helixa ID.`
- Bad format: `Use a token ID like 1 or a Helixa ID like 8453:1.`
- Unsupported chain: `V0 supports Base Helixa AgentDNA records only.`

## Data source

Use the existing public Helixa API:

```text
GET https://api.helixa.xyz/api/v2/agent/:tokenId
```

Live check confirmed:

- The endpoint returns JSON for token `1` and token `81`.
- CORS allows browser GET requests with `Access-Control-Allow-Origin: *`.
- Responses include rate-limit headers.

The client must treat this API as public read-only data. Do not send credentials, wallet signatures, payment proofs, cookies, or private headers.

## Data mapping design

Add a dedicated adapter unit that converts the live Helixa agent response into the same presentation shape used by `loadStaticMultipassDemo`.

Suggested units:

1. `parseHelixaResolverInput(input)`
   - Input: raw user string.
   - Output: `{ chainId: 8453, tokenId }` or a typed validation error. `tokenId` stays a validated string.

2. `fetchHelixaAgent(tokenId, fetchImpl)`
   - Input: parsed token ID string.
   - Output: raw Helixa agent JSON.
   - Handles HTTP status errors, invalid JSON, and network failures.

3. `mapHelixaAgentToMultipassDemo(agent)`
   - Input: raw Helixa agent JSON.
   - Output: existing Multipass demo data shape.
   - Keeps raw API details behind normalized profile, fragments, card, standards, x402, owner snapshot, change ledger, and transfer state fields.

4. `loadLiveHelixaMultipass(input, fetchImpl)`
   - Input: raw resolver input.
   - Output: fully mapped display data plus route/source metadata.
   - Coordinates parser, fetcher, and mapper.

The adapter must not mutate `STATIC_DEMO_DATA`.

## Mapping rules

Profile:

- `display_name` uses `agent.name`, falling back to `Agent #tokenId`.
- `slug` should be stable and token based, for example `helixa-agent-1`.
- `multipass_id` should be stable and token based, for example `mp_helixa_agent_1`.
- `subject_type` is `agent`.
- `status` reflects live availability, not ownership authority.
- Cred summary uses `credScore` when present and keeps payment separate from trust.

Card:

- Name, token ID, Helixa ID, framework, Cred score, Cred tier, verified state, and profile URL map directly where available.
- Framework falls back to `unknown` only if the API omits it.
- Profile URL prefers `services.web.url`, then `https://helixa.xyz/agent/:tokenId`.
- Proof fragment IDs must never render as default user-facing titles.

Fragments:

- Create public fragments only from public API fields.
- Identity fragment from token ID, contract explorer, mint origin, and verified state.
- Cred fragment from `credScore` and tier.
- Social fragment from public socials when present.
- Service fragment from public service endpoints when present.
- Trait or standards fragment from traits and domains when useful.
- Every fragment includes visibility, status, assurance level, source, public value, timestamps where available, and transfer policy.

Owner & Custody Snapshot:

- Owner uses `agent.owner` when present.
- Operator uses `agent.operator` when present, otherwise `Not delegated`.
- Permission state remains display-only, for example `Read-only public profile`.
- Review action can be `Live API refresh` or `Review live identity fields`.
- The note must say this view does not approve, execute, or transfer authority.

Change + Review Ledger:

- Include a small live-review set generated from the API response.
- Useful rows include live profile fetched, Cred imported, owner observed, services reviewed, and private credentials hidden.
- Rows are state references only. No buttons, no fake actions, and no executable language.

Transfer State Preview:

- Keep the existing transfer-aware custody model.
- For a live agent, show that public history can remain attached while active authority and private credentials require reapproval or rotation.
- Do not imply a transfer happened unless the live API exposes such a fact.

Standards, x402, and receipt cards:

- Standards should summarize visible standards traits or known Helixa support without claiming a live adapter is fully verified unless supported by the API field.
- x402 should summarize accepted payments from public metadata and linked token fields. $CRED can be shown as accepted or linked where the API says so, but not as a trust purchase.
- Receipt should not invent a payment receipt. If no receipt exists in the live API, render a clear no-receipt state such as `No live receipt attached`.

## Routing and state

Default route:

- `/multipass/` loads bundled static data and makes no local `/multipass-api` request.

Resolver submit:

- The resolver fetches `https://api.helixa.xyz/api/v2/agent/:tokenId` after valid input.
- While a request is in flight, disable duplicate submits for the same input and show a small loading state.
- A newer submit should supersede an older response if users change input quickly.
- The UI updates in place with live data.
- The source label should make the live source obvious.

Optional deep link:

- `/multipass/?agent=1` and `/multipass/?agent=8453:1` may auto-resolve the live agent.
- Invalid query input should show the same resolver validation errors.
- `/multipass/` with no `agent` query remains static.

Static reset:

- Provide a low-key way to return to the bundled fixture, such as a `Back to static demo` text button.
- This control only changes client-side display state.

## Error handling

Network failure:

- Show: `Could not reach the Helixa API. Static demo is still available.`
- Keep the previous successful display if one exists.

404 or missing record:

- Show: `No Helixa agent found for that ID.`
- Do not create a fake profile.

429 rate limit:

- Show: `Helixa API is rate-limiting requests. Try again shortly.`
- Respect `Retry-After` if present for disabling rapid retries. Disable submit during the retry window and show retry timing when practical.

Malformed API response:

- Show: `Helixa returned a response this prototype cannot read yet.`
- Keep diagnostic details out of default user-facing copy.

Unsupported chain:

- Show the unsupported-chain copy before any network request.

## Privacy and safety

- Only use public Helixa API data.
- Do not request private fields.
- Do not expose raw private fields if the API later adds them.
- Reuse the existing privacy filter for rendered JSON.
- Do not render private keys, hidden credentials, wallet signatures, tokens, or payment proofs.
- Do not add controls that look like approval, transfer, payment, claim, or credential release actions.

## Visual and copy constraints

- Preserve the warm Multipass visual direction.
- No emojis.
- No em dashes.
- Use `Multipass` as one word.
- Use `onchain` as one word.
- Avoid travel-document metaphors.
- Avoid six-tier trust wording.
- Avoid any wording that suggests buying reputation.

## Tests

Parser tests:

- Accepts `1`.
- Accepts `8453:1`.
- Trims whitespace.
- Rejects empty input.
- Rejects unsupported chains.
- Rejects names, slugs, URLs, negative numbers, decimals, and mixed text.

Fetcher tests:

- Builds the exact Helixa API URL.
- Handles HTTP errors.
- Handles invalid JSON.
- Handles network errors.
- Does not send credentials or payment headers.

Mapper tests:

- Include a concrete Bendr-like API fixture based on the live public `agent/1` response so mapper expectations are grounded.
- Maps Bendr-like API records into profile, card, fragments, owner snapshot, change ledger, transfer preview, standards, x402, and receipt display data.
- Handles missing socials, missing services, null operator, null linked token, and null personality fields.
- Does not convert payment metadata into trust claims.
- Does not leak private or unknown private-looking fields into rendered JSON.

UI tests:

- Static `/multipass/` still renders bundled fixture by default.
- Resolver bar accepts token ID and canonical Helixa ID.
- Duplicate submits are disabled while a matching request is in flight.
- Successful resolve updates the displayed card and source label.
- Invalid input shows validation errors without fetch.
- Unsupported chain shows unsupported-chain error without fetch.
- API errors keep the static demo available.
- Default UI does not render raw fragment IDs as primary labels.
- No executable-control copy is introduced.

Build and smoke tests:

- Full `pnpm test` passes.
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build` passes.
- `git diff --check` passes.
- Wording gate passes.
- Live smoke confirms `/multipass/` returns 200, assets return 200, and bundled static mode still loads without local `/multipass-api`.
- Live resolver smoke confirms `https://api.helixa.xyz/api/v2/agent/1` is reachable from browser-compatible CORS headers or an equivalent fetch-level check.

## Acceptance criteria

- A user can enter `1` and see a live Bendr 2.0 Multipass view.
- A user can enter `8453:1` and see the same live Bendr 2.0 Multipass view.
- Unsupported chains fail before fetch.
- Name and slug search is clearly marked as future, not implemented.
- Static demo remains the default and remains available after errors.
- No local `/multipass-api` request is made by default on the deployed static route.
- Live data uses existing presentation sections instead of adding a new wall of raw API output.
- Public API fields are normalized into readable proof cards.
- No private fields or fake receipts are displayed.
- No execution, approval, claim, transfer, payment, or credential controls are added.

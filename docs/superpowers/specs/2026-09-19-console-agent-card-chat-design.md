# Console Agent Card and Private Chat Design

## Scope

Improve the current Multipass Console without changing the Verified Runtime drawer or adding token tickers in this pass.

## Approved outcomes

1. The selected-agent control visibly shows the active agent name, with a readable placeholder only when no agent is selected.
2. The left agent panel shows one large, prominent agent portrait above the name and metadata. It uses the agent's safe image when available and an initials fallback when it is not.
3. The chat header removes its duplicate agent portrait.
4. The chat title is dynamic: `<Agent name> Private Chat`, falling back to `Agent Private Chat` only before an agent is available.
5. The left agent panel and right chat panel start on the same row and share the same top edge at desktop widths. Mobile remains single-column.
6. Existing wallet ownership, agent selection, room activation, XMTP, Bankr, Sibyl, local message hiding, and approval boundaries are unchanged.

## Layout

Keep the existing Console page hierarchy and Verified Runtime drawer unchanged. The always-visible sidebar structure remains: Console header, selected-agent identity card, Session drawer, Agents drawer. The selector stays inside the Agents drawer, but its closed drawer summary continues to show the active agent name, while opening the drawer exposes the native selector with the selected option text.

The selected-agent identity card becomes visual-first: one square portrait block appears above the wallet/name information, followed by the existing role, agent name, room label, token/Cred metadata, and drawers. At desktop widths above 1100px, the portrait is centered at `min(100%, 252px)` with a 1:1 aspect ratio. The sidebar and main column retain their current shared top row. Below 1100px, they stack in existing DOM order, with the chat/main column followed by the sidebar; no additional reordering is introduced in this pass.

The right chat panel keeps its existing timeline and composer but uses a text-only header with no portrait.

## Data and fallbacks

- The native selector's visible label remains `Choose agent`; its selected option/display value is `agent.name`.
- The identity card and chat title use the currently selected agent, matching the existing Console selection model. They update immediately when selection starts and remain on that agent if activation needs retry, so the retry state, selector, identity, and chat title stay consistent.
- Chat title: `<selected agent name> Private Chat`; fallback before selection: `Agent Private Chat`.
- Portrait source: the safe HTTPS/IPFS-resolved image already present on the normalized active-agent snapshot; unsafe URLs are rejected.
- The identity portrait image is decorative (`alt=""`) because the adjacent visible heading carries the agent name. It renders an escaped initials fallback in the same container; the existing one-shot `data-console-avatar-image` error handler removes a failed image and reveals that fallback.
- No new network requests or token-market integrations are introduced.

## Accessibility and responsive behavior

- Preserve the visible `Choose agent` label and native `select` semantics.
- Keep the active agent name as visible text beneath the portrait and in the text-only chat heading.
- The chat heading remains present if images are unavailable or fail.
- Desktop retains the current two-column grid at widths above 1100px; narrower viewports retain the current single-column ordering.

## Deferred areas

- Do not move or redesign the Verified Runtime drawer.
- Do not add `$CRED`, `$BANKR`, `$DRB`, token selectors, market data, or token presentation.
- Do not change the current grid column placement as part of the deferred runtime/ticker layout.

## Verification

- Snapshot tests assert `Brok Private Chat`, `Agent Private Chat` before activation, no `.console-thread-avatar-chat` in the chat header, visual-first identity-card portrait markup, the visible active name, and selected option text.
- DOM tests assert the native selector's selected option text is the active agent name.
- Image-error tests assert a failed identity portrait is removed and its initials fallback is revealed once.
- CSS tests assert the identity portrait is square and capped at 252px, the compact 68px override is no longer applied, and the 1100px grid breakpoint remains unchanged.
- Regression assertions confirm `Verified runtime proof` remains rendered and no `$CRED`, `$BANKR`, or `$DRB` text is introduced.
- Existing Console integration tests cover room activation, chat sends, local hiding, wallet changes, and owner identity.
- Run Console regression tests, syntax checks, production build, live asset hash verification, and desktop/mobile visual screenshots before completion.

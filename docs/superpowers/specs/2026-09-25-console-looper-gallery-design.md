# Multipass Console Owned-Looper Gallery Design

**Date:** 2026-09-25
**Status:** Approved direction, implementation pending

## Goal

Replace the first-sign-in Looper chooser with a marketplace-style, scrollable gallery that makes every wallet-owned Looper visible and easy to open. Prevent any partial roster—especially an apparent ten-item cap—from being presented as complete. Give owners a clear path to acquire additional Loopers.

## Chosen direction

Use a full-height gallery in the Console's main workspace. This is preferable to a horizontal carousel, which would hide inventory behind sideways scrolling, and to classic pagination, which would make roster completeness less obvious.

The gallery keeps the existing Multipass Console shell and visual language. It does not become a separate marketplace product. All headings, labels, controls, and card copy inherit the Console's existing Inter/system font stack and existing monospace button treatment; no serif or marketplace-specific font is introduced.

## User experience

### Entry

After wallet authentication:

- One owned Looper continues to open automatically.
- Two or more owned Loopers open the gallery.
- No owned Loopers opens an empty gallery state with a marketplace link.
- The existing sidebar remains visible and summarizes ownership and selection state.

### Gallery header

Show:

- `Choose your Looper`
- Search by Looper name or token ID
- A sort select defaulting to `Token ID: low to high`, with explicit alternatives `Token ID: high to low`, `Name: A to Z`, and `Name: Z to A`; there is no separate direction toggle
- The exact completion indicator `All {N} Loopers loaded` only after the authenticated API returns a successfully reconciled roster

During loading, show `Loading all owned Loopers` with neither a numeric count nor the completion indicator. During empty ownership success, show `No owned Loopers found`. When a nonempty roster has no search matches, keep `All {N} Loopers loaded` visible and show the distinct filtered state `No Loopers match “{query}”` with a `Clear search` button. During errors, suppress both count and completion text so stale or partial data cannot look authoritative.

Search and sorting are client-side because the owned roster is bounded by the 7,777-token collection and already returned in one authenticated response.

### Gallery cards

Each card is a semantic `<article>` with an accessible heading and contains:

- Looper artwork with alt text `{display name}, Looper #{token ID}`; the initials fallback exposes the same accessible name
- Token ID
- Display name
- Primary role/class
- Cred label when present
- Verification state as visible text, not color alone
- One primary button named `Open {display name}, Looper #{token ID}`

Images remain lazy-loaded. Selecting a card uses the existing activation path and opens that Looper's room, identity, memory, and wallet together.

### Scrolling and responsive behavior

The gallery body scrolls vertically inside the main Console workspace with `max-height: min(70vh, 720px)` and `overflow-y: auto`. Header controls remain above the scrolling region and the footer remains below it.

- `>= 1120px`: four columns
- `760px–1119px`: three columns
- `480px–759px`: two columns
- `< 480px`: one column
- The gallery and page use no horizontal scrolling at widths from 320px upward
- Interactive controls have a minimum 44-by-44-pixel target
- Keyboard users tab through search, sort, cards, refresh, and marketplace link in document order; no offscreen focus trap is introduced

### Acquisition and refresh actions

The footer contains:

- `Refresh ownership` to rerun the authenticated Base ownership scan
- `Browse Loopers on OpenSea` as an external link to the verified collection page at `https://opensea.io/collection/loopers-639312714`

The external link opens in a new tab and uses `rel="noopener noreferrer"`. It never implies an official OpenSea integration or an available listing.

## Complete-roster guarantee

The existing API loader reads onchain `balanceOf`, discovers token IDs through Blockscout with pagination, falls back to a bounded `ownerOf` scan, and throws if the discovered count does not equal the onchain balance. It already has a many-agent test with 45 owned Loopers.

The gallery will preserve this fail-closed behavior:

1. The UI increments a roster request ID, enters a loading state, clears stale cards, sets the gallery region `aria-busy="true"`, and announces `Loading all owned Loopers` through a polite live region.
2. The authenticated `/api/loopers/owned` request runs the ownership reconciliation.
3. A response may commit only when its request ID and normalized authenticated wallet still match current state. Wallet/account changes invalidate prior requests and clear their roster immediately.
4. A successful response is treated as complete because the API refuses mismatched counts. The UI announces and displays exactly `All {N} Loopers loaded`, then moves focus to the gallery heading only when the load followed an explicit retry or refresh. Immediately before focus, the heading receives temporary `tabindex="-1"`; a one-shot `blur` handler removes that attribute so it never enters normal tab order.
5. The UI renders every returned agent; it must not slice, paginate, truncate, or cap at ten.
6. If reconciliation fails, the gallery shows an alert and retry action rather than cards, a count, or a completion badge. Focus moves to the alert after an explicit retry failure.
7. Activation errors keep the reconciled gallery mounted, announce the error with `role="alert"`, and return focus to the failed card's `Open` button.

A new browser-level regression test will render more than ten agents and assert that every card is present and selectable. A separate race test resolves older refresh and prior-wallet requests last and proves that neither can replace current ownership state.

## Components and boundaries

### `multipass-console.js`

- Expand the onboarding renderer into the gallery markup.
- Keep card rendering pure and based on the normalized snapshot.
- Expose roster status, count, search text, sort mode, and completion state to the renderer.

### `app.js`

- Store gallery search and sort state plus a monotonic roster request ID.
- Bind search, sort, refresh, and activation events.
- Discard responses whose request ID or normalized authenticated wallet no longer matches current state.
- Reuse `refreshConsoleOwnedAgents` and `selectAndActivateConsoleAgent`; no second ownership or activation path is introduced.

### `styles.css`

- Add the internal scrolling region and responsive card grid.
- Reuse current Console colors, borders, spacing, and typography.
- Preserve visible focus states and minimum touch targets.

### API ownership loader

- Preserve the existing all-owned reconciliation and fallback scan.
- Add coverage proving indexer pagination beyond its first page and a response containing more than ten agents.
- Do not weaken the current balance mismatch error.

## Error handling

- Loading: skeleton/card placeholders, `aria-busy="true"`, and live `Loading all owned Loopers` copy; no count or completion state.
- Empty: announce that no owned Loopers were found and show the marketplace CTA.
- API or ownership mismatch: no cards from the failed request, a `role="alert"` error, and `Retry ownership scan`.
- Broken artwork: retain the existing initials fallback and accessible Looper name.
- Agent activation failure: keep the gallery available, announce the recoverable error, and restore focus to the triggering button.
- Refresh during wallet work: preserve the current nonterminal-operation lock so selection cannot switch mid-operation.
- Stale responses: ignore them without changing current loading, success, error, focus, or announcement state.

## Testing

### API

- Indexer pagination returns all pages when ownership exceeds one page.
- A wallet with more than ten Loopers returns the full roster.
- A balance/result mismatch fails closed.

### Renderer and app

- More than ten agents produce the same number of gallery cards.
- A synthetic 7,777-agent roster is fully rendered without truncation or virtualization; search and sort return correct results, keyboard order remains deterministic, and the headless-browser gallery becomes interactive within five seconds on the existing constrained CI runner.
- Search matches names and token IDs without mutating the source roster; a zero-match query shows the filtered-empty state while preserving the reconciled total.
- Sort defaults to token ID ascending and each of the four explicit sort options changes visual order only.
- Every visible card activates the correct token ID.
- Loading, owned-empty, filtered-empty, error, and retry states expose the specified text, ARIA state, announcements, and focus transitions.
- Programmatic heading focus adds temporary `tabindex="-1"` and removes it on blur.
- Older request and prior-wallet responses cannot replace the current roster.
- Breakpoint tests cover 320px, 479px, 480px, 759px, 760px, 1119px, and 1120px with no horizontal overflow and 44-pixel minimum targets.
- The marketplace link has the approved destination and safe external-link attributes.
- Existing wallet authentication, single-agent auto-open, room, and wallet tests remain green.

### Visual verification

Capture desktop and mobile gallery states and check:

- count/completion text appears only for reconciled success
- internal vertical scrolling uses the specified height bound
- no horizontal overflow occurs at the tested breakpoints
- visible focus and 44-pixel targets work with keyboard and touch
- the layout uses the existing Console font stack and remains recognizably Multipass Console

## Non-goals

- Building an in-Console NFT marketplace
- Showing prices, bids, or listing availability
- Infinite scrolling from a third-party marketplace
- Creating a second ownership index
- Changing Looper activation, wallet permissions, or transaction controls

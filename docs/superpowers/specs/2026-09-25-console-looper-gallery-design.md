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
- The complete owned count, such as `24 Loopers`
- A truthful completion state only after the API returns a reconciled roster
- Search by Looper name or token ID
- Sort by token ID or name

Search and sorting are client-side because the owned roster is bounded by the 7,777-token collection and already returned in one authenticated response.

### Gallery cards

Each card contains:

- Looper artwork
- Token ID
- Display name
- Primary role/class
- Cred label when present
- Verification state
- One primary `Open agent` action

Images remain lazy-loaded. Selecting a card uses the existing activation path and opens that Looper's room, identity, memory, and wallet together.

### Scrolling and responsive behavior

The gallery body scrolls vertically inside the main Console workspace while the header, controls, roster count, and footer remain easy to find.

- Desktop: four-column grid where space permits
- Tablet: three or two columns
- Mobile: two columns, reducing to one only on very narrow screens
- No horizontal page overflow
- Keyboard users can tab through controls and cards in document order

### Acquisition and refresh actions

The footer contains:

- `Refresh ownership` to rerun the authenticated Base ownership scan
- `Browse Loopers on OpenSea` as an external link to the verified collection page at `https://opensea.io/collection/loopers-639312714`

The external link opens in a new tab and uses `rel="noopener noreferrer"`. It never implies an official OpenSea integration or an available listing.

## Complete-roster guarantee

The existing API loader reads onchain `balanceOf`, discovers token IDs through Blockscout with pagination, falls back to a bounded `ownerOf` scan, and throws if the discovered count does not equal the onchain balance. It already has a many-agent test with 45 owned Loopers.

The gallery will preserve this fail-closed behavior:

1. The UI enters a loading state and clears stale cards.
2. The authenticated `/api/loopers/owned` request runs the ownership reconciliation.
3. A successful response is treated as complete because the API refuses mismatched counts.
4. The UI renders every returned agent; it must not slice, paginate, truncate, or cap at ten.
5. If reconciliation fails, the gallery shows an error and retry action rather than a partial roster or a `complete` badge.

A new browser-level regression test will render more than ten agents and assert that every card is present and selectable.

## Components and boundaries

### `multipass-console.js`

- Expand the onboarding renderer into the gallery markup.
- Keep card rendering pure and based on the normalized snapshot.
- Expose roster status, count, search text, sort mode, and completion state to the renderer.

### `app.js`

- Store gallery search and sort state.
- Bind search, sort, refresh, and activation events.
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

- Loading: skeleton/card placeholders and `Loading all owned Loopers` copy.
- Empty: explain that no owned Loopers were found and show the marketplace CTA.
- API or ownership mismatch: no cards from the failed request, a concise error, and `Retry ownership scan`.
- Broken artwork: retain the existing initials/fallback treatment.
- Agent activation failure: keep the gallery available and show the existing recoverable activation error.
- Refresh during wallet work: preserve the current nonterminal-operation lock so selection cannot switch mid-operation.

## Testing

### API

- Indexer pagination returns all pages when ownership exceeds one page.
- A wallet with more than ten Loopers returns the full roster.
- A balance/result mismatch fails closed.

### Renderer and app

- More than ten agents produce the same number of gallery cards.
- Search matches names and token IDs without mutating the source roster.
- Sort changes visual order only.
- Every visible card activates the correct token ID.
- Loading, empty, error, and retry states are truthful.
- The marketplace link has the approved destination and safe external-link attributes.
- Existing wallet authentication, single-agent auto-open, room, and wallet tests remain green.

### Visual verification

Capture desktop and mobile gallery states and check:

- all count and completion labels are visible
- internal vertical scrolling works
- no horizontal overflow occurs
- focus and touch targets are usable
- the layout remains recognizably Multipass Console

## Non-goals

- Building an in-Console NFT marketplace
- Showing prices, bids, or listing availability
- Infinite scrolling from a third-party marketplace
- Creating a second ownership index
- Changing Looper activation, wallet permissions, or transaction controls

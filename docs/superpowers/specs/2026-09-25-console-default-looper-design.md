# Console Default Looper and Closed Roster Design

**Date:** 2026-09-25  
**Status:** Revised draft under review

**Scope:** Multipass Console web client only

## Goal

After an authenticated wallet's owned-Looper roster loads, immediately open one valid owned Looper while keeping the complete roster behind closed drawers by default. Remove the dead-end first screen without signing, submitting, or activating an onchain wallet automatically.

## Current Behavior

- The Console preserves an in-memory selection while the page remains open.
- A roster containing exactly one Looper auto-selects and opens it.
- A roster containing two or more Loopers clears selection and renders the complete gallery in the main workspace.
- The sidebar **My agents** drawer opens whenever selection is required.
- The selected Looper is not remembered across a fresh page load.

## Approved Behavior

### Selection priority

Once authentication and ownership discovery succeed, choose exactly one Looper in this order:

1. The last successfully opened Looper for the same authenticated wallet, if that token is still present in the fresh owned roster.
2. The first owned Looper, in the existing canonical token-ID sort order, whose released executable wallet has an `ERC6551AccountCreated` event.
3. The first Looper in the fresh owned roster.

If the wallet owns no Loopers, select nothing. A stale remembered token is discarded for selection purposes and must never bypass the fresh ownership result.

### What “last used” means

Persist a token ID only after `/api/multipass/console/agent/activate` succeeds for that token **and** the response still belongs to the current authenticated wallet, session generation, activation request ID, and selected token. A superseded response must not write preference state.

Use local-storage key `multipass.console.lastLooperByWallet.v1` with this exact JSON shape:

```json
{"schemaVersion":1,"selections":{"0xnormalizedwallet":"3802"}}
```

Wallet keys are lowercase `0x` plus 40 hexadecimal characters. Token values are canonical positive base-10 integers with no leading zeroes. A small pure selection module exports the one wallet normalizer, token-ID normalizer, and bigint comparator used by storage, event decoding, selection resolution, and gallery token sorting. Never persist a pending or failed selection. Corrupt, non-object, wrong-version, noncanonical, or unavailable storage fails closed to the remaining priority rules. Preserve valid entries for other wallets when updating one wallet.

### Activated-wallet discovery

Fetch the public released-wallet creation set in parallel with the owned roster from:

`https://base.blockscout.com/api?module=logs&action=getLogs&fromBlock=51658273&toBlock=latest&address=0x000000006551c19487814612e58FE06813775758&topic0=0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722&topic1=0x000000000000000000000000f192f350427c8f58bc28e78b1e6af164279f486e&topic2=0x0000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a&topic0_1_opr=and&topic0_2_opr=and&topic1_2_opr=and&page={page}&offset=1000`

The pins are:

- Base chain ID: `8453`;
- registry: `0x000000006551c19487814612e58FE06813775758`;
- event topic: `ERC6551AccountCreated(address,address,bytes32,uint256,address,uint256)` = `0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722`;
- released implementation: `0xf192f350427c8F58bC28e78b1e6Af164279F486e`;
- released salt: `0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee`;
- Loopers collection: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`;
- from block: `51658273`, the released implementation deployment block.

Request anonymous JSON with `credentials: 'omit'`, a four-second total `AbortController` deadline, and the current session's cancellation signal. Read at most 4 MiB per page. Use `offset=1000`, request pages 1 through 8 sequentially, and stop after the first page containing fewer than 1,000 rows. Eight pages cover the collection's hard maximum of 7,777 token IDs. If page 8 still contains 1,000 rows, any page is oversized/malformed, Blockscout reports an error other than its explicit no-logs result, or the response is truncated, return an unavailable result rather than a partial set.

A successful page has top-level `status: "1"`, `message: "OK"`, and a `result` array. The explicit Blockscout no-logs response is accepted as an empty set only on page 1. Every log must have exactly four topics matching the pinned event, implementation, and collection. Its data must be exactly three ABI words: account address, salt, and chain ID. Accept a row only when:

- topic 3 is a canonical positive token ID from 1 through 7,777;
- data salt equals the released salt;
- data chain ID equals `8453`;
- data account equals the deterministic released ERC-6551 address derived from the pinned registry, implementation, salt, chain, collection, and token ID.

Any malformed row makes the whole lookup unavailable. Deduplicate exact repeated rows; reject conflicting duplicates. Intersect the complete validated set with the freshly authenticated owned roster before ranking.

This lookup is an optional UX hint, not authorization evidence. Timeout, rate limiting, cancellation, malformed data, or network failure falls back to the first owned Looper. Existing owner/controller checks and the Looper wallet controller remain authoritative after selection.

### Automatic opening

After choosing a token, run the existing `selectAndActivateConsoleAgent` path. This opens the runtime room and loads read-only wallet state. It must not:

- request another signature;
- submit an onchain transaction;
- deploy or activate an ERC-6551 account;
- grant agent spending authority;
- persist the selection before runtime activation succeeds.

If automatic runtime opening fails, keep the selected Looper visible, show the existing retry/error state, and do not overwrite a prior last-used preference.

## Roster Drawers

### Main workspace

Replace the always-expanded preselection gallery with a native `<details>` drawer using the existing Console drawer visual language. It exists only while no Looper runtime is selected: loading, ownership error, empty ownership, and the brief preselection state. After automatic or manual selection, the existing primary renderer replaces it with the room or wallet workspace; the complete roster remains available through the sidebar drawer.

Its summary shows:

- title: **My Loopers**;
- count/status chip: `N owned`, `Loading`, `Retry`, or `None`;
- **Choose a Looper to continue** when a loaded roster awaits selection.

Opening the drawer reveals the existing search, sorting, complete semantic gallery, refresh action, empty states, and OpenSea link unchanged. An ownership-load error sets the main drawer open so the retry action is visible; this is an error recovery state, not the default.

### Sidebar

The existing sidebar **My agents** drawer is closed on fresh page load and after every successful selection. Its resting summary shows the selected Looper display name and token ID when one is loaded, otherwise the roster count/status. Opening it reveals the existing selector and roster cards.

Track the main and sidebar `<details>` state in separate in-memory booleans. A native `toggle` handler updates the corresponding boolean. Search, sort, refresh, naming, and other ordinary root rerenders preserve the current in-memory value so an expanded drawer remains usable. Do not write drawer state to local storage or session storage. Reset both booleans to `false` on fresh initialization, wallet/account change, logout, and successful selection; set the main boolean to `true` only for actionable roster-error recovery.

## Component Boundaries

1. **Last-used selection store**
   - Reads and writes only the wallet-to-token preference map.
   - Accepts normalized wallet and canonical positive token ID values.
   - Has no rendering, network, or activation responsibilities.

2. **Released-wallet event loader**
   - Fetches, paginates, bounds, decodes, and validates the exact public Blockscout contract above.
   - Returns `{ status: 'available', tokenIds: Set<string> }` only for a complete response, otherwise `{ status: 'unavailable', tokenIds: Set() }`.
   - Has no ownership or authorization role.

3. **Default-selection resolver**
   - Pure function receiving fresh owned agents, remembered token ID, and activated token set.
   - Returns the selected token ID according to the approved priority or `null`.

4. **Roster drawer rendering**
   - Uses the resolved snapshot plus the two in-memory drawer booleans.
   - Emits native toggle actions but owns no persistence or selection logic.
   - Keeps existing gallery controls and roster content intact.

5. **Existing activation and wallet controllers**
   - Continue to own runtime activation, authoritative chain verification, wallet reads, and all transaction safety behavior.

## State and Concurrency

- After session authentication, capture the normalized wallet, session generation, roster request ID, and a new default-selection epoch. Start owned-roster and activated-wallet discovery together.
- Await the owned roster first. Do not render the full loaded roster with no selection while automatic resolution is pending; keep the compact main summary in `Loading` state to prevent a gallery flash.
- If a remembered token is present in the fresh roster, increment the selection epoch, cancel or ignore activated-wallet discovery, commit the roster and selection in one state update, and open it immediately.
- Otherwise await activated-wallet discovery until its four-second total deadline. On available completion, use the first activated owned token; on unavailable completion, use the first owned token. Commit roster and selection together, then call the existing activation path.
- Every automatic commit and every preference write must still match the captured wallet, session generation, roster request ID, selection epoch, activation request ID, and selected token. Any mismatch discards the result.
- The loaded roster is not interactive before the automatic decision commits, so there is no manual-selection race during discovery. After commit, a manual selection increments the selection epoch and activation request ID; late automatic or activation results cannot replace it or write preference state.
- A manual roster refresh preserves the current selection if it remains owned. It runs default resolution only when the current selection is absent from the fresh roster.
- Wallet disconnect, account change, logout, or authorization failure aborts the event fetch, increments the selection epoch, and clears in-memory selection through the existing session reset path. The per-wallet last-used preference may remain locally because it is revalidated against ownership on the next sign-in.

## Error Handling

- Local-storage read/write failures do not block sign-in or selection.
- Activated-wallet discovery failures, incomplete pagination, validation failures, cancellation, and timeout return `unavailable` and fall back to the first owned Looper; a partial activation set is never used.
- Owned-roster failures remain explicit and actionable; no stale roster or remembered selection is rendered as owned.
- Runtime activation failures keep existing retry behavior and do not persist a new preference.
- Wallet-state read failures keep the selected runtime available while the wallet panel reports its existing degraded/error state.

## Accessibility and Responsive Behavior

- Use native `<details>/<summary>` semantics and existing focus-visible styling.
- Keep summary controls at least 44 by 44 CSS pixels.
- Preserve gallery keyboard order, accessible card names, and responsive 1/2/3/4-column breakpoints when expanded.
- Do not move focus into a closed drawer. On an explicit refresh failure, focus the visible error only if the drawer is opened for recovery.

## Verification

Add focused tests proving:

- valid last-used selection wins;
- stale or corrupt stored selection is ignored;
- activated owned Looper wins when no valid last-used value exists;
- first owned Looper wins when activation discovery is empty or unavailable;
- zero-owned and roster-error states never invent a selection;
- preference is written only after successful runtime activation whose wallet/session/selection/request context is still current;
- account switching cannot reuse another wallet's selection;
- exact storage schema/version validation and preservation of other-wallet entries;
- event rows with the wrong salt, chain ID, account, topics, token range, page shape, or pagination completeness make discovery unavailable;
- activation discovery obeys its four-second deadline, eight-request maximum, response-size bound, and cancellation signal;
- both roster drawers are closed by default and expose correct summary text;
- drawer toggle state survives ordinary root rerenders but resets on successful selection, account change, logout, and fresh load;
- expanding preserves all search, sort, complete-gallery, empty, refresh, and error behavior;
- automatic opening never invokes wallet signing or transaction submission;
- desktop and mobile browser checks pass without overflow and retain 44-pixel controls.

Run focused Console unit/browser tests, the full web test suite, the production build, syntax checks, and `git diff --check`. Deploy static assets with the existing rollback-safe procedure, then verify the live page starts with a selected Looper and closed roster drawer on desktop and mobile. If the implementation adds no server endpoint, the API process must remain uninterrupted.

## Non-goals

- Promising or displaying a token drop or activation reward.
- Automatically deploying a Looper wallet.
- Changing runtime activation semantics, ownership authorization, wallet permissions, or transaction flows.
- Synchronizing last-used choice across browsers or devices.
- Persisting drawer expansion state.

# Console Default Looper and Closed Roster Design

**Date:** 2026-09-25  
**Status:** Approved for planning  
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

Persist a token ID only after `/api/multipass/console/agent/activate` succeeds for that token. Store the preference in browser local storage under a versioned Console key, keyed by the normalized authenticated wallet address. Never persist a pending or failed selection. Corrupt, non-object, noncanonical, or unavailable storage fails closed to the remaining priority rules.

### Activated-wallet discovery

Fetch the public released-wallet creation set in parallel with the owned roster, using the proven CORS-enabled Base Blockscout logs endpoint and these pinned filters:

- registry: `0x000000006551c19487814612e58FE06813775758`
- event: `ERC6551AccountCreated(address,address,bytes32,uint256,address,uint256)`
- released implementation: `0xf192f350427c8F58bC28e78b1e6Af164279F486e`
- Loopers collection: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- from block: `51658273`, the released implementation deployment block

Decode only indexed canonical positive token IDs. Intersect that set with the freshly authenticated owned roster before ranking. This lookup is an optional UX hint, not authorization evidence: malformed responses, timeout, rate limiting, or network failure silently fall back to the first owned Looper. Existing owner/controller checks and the Looper wallet controller remain authoritative after selection.

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

Replace the always-expanded first-visit gallery with a native `<details>` drawer using the existing Console drawer visual language. It is closed by default during loading and normal empty-selection states.

Its summary shows:

- title: **My Loopers**;
- count/status chip: `N owned`, `Loading`, `Retry`, or `None`;
- selected context when available: Looper display name and token ID;
- otherwise: **Choose a Looper to continue**.

Opening the drawer reveals the existing search, sorting, complete semantic gallery, refresh action, empty states, and OpenSea link unchanged. An ownership-load error may open the drawer so the retry action is visible; this is an error recovery state, not the default.

### Sidebar

The existing sidebar **My agents** drawer is always rendered closed initially. Its resting summary shows the selected Looper when one is loaded, otherwise the roster count/status. Opening it reveals the existing selector and roster cards. A successful selection rerenders it closed.

Do not persist drawer open/closed state across renders or page loads.

## Component Boundaries

1. **Last-used selection store**
   - Reads and writes only the wallet-to-token preference map.
   - Accepts normalized wallet and canonical positive token ID values.
   - Has no rendering, network, or activation responsibilities.

2. **Released-wallet event loader**
   - Fetches and validates the bounded public Blockscout response.
   - Returns a set of token IDs or an empty set on an availability failure.
   - Has no ownership or authorization role.

3. **Default-selection resolver**
   - Pure function receiving fresh owned agents, remembered token ID, and activated token set.
   - Returns the selected token ID according to the approved priority or `null`.

4. **Roster drawer rendering**
   - Uses the resolved snapshot only.
   - Keeps existing gallery controls and roster content intact.

5. **Existing activation and wallet controllers**
   - Continue to own runtime activation, authoritative chain verification, wallet reads, and all transaction safety behavior.

## State and Concurrency

- Start owned-roster and activated-wallet discovery together after session authentication.
- Preserve the existing session generation and roster request IDs; late results from an old wallet/session must be ignored.
- Never use a remembered token until it is found in the current roster.
- A manual selection made while asynchronous work is in flight wins over an older automatic result.
- Wallet disconnect, account change, logout, or authorization failure clears in-memory selection through the existing session reset path. The per-wallet last-used preference may remain locally because it is revalidated against ownership on the next sign-in.

## Error Handling

- Local-storage read/write failures do not block sign-in or selection.
- Activated-wallet discovery failures fall back to the first owned Looper.
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
- preference is written only after successful runtime activation;
- account switching cannot reuse another wallet's selection;
- both roster drawers are closed by default and expose correct summary text;
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

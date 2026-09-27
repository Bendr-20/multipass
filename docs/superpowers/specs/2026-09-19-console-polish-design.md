# Multipass Console Polish Design

## Goal

Tighten the live Console for the RUNTIME submission without changing its safety model or transport behavior. Preserve the current proof language, make the selected agent feel like a real wallet-owning Looper, and remove low-value instructional copy.

## Approved interface

### Expandable Multipass drawer

Replace the large always-open `Verified runtime proof` rail above chat with one compact, closed-by-default drawer. Its summary keeps the title and verified proof values readable across one line. Expanding it reveals:

- the existing evidence-gated Bankr, XMTP, Sibyl, ERC-8004, and execution checks;
- canonical Multipass identity values already present in the selected agent snapshot;
- the selected agent wallet/owner value, preferring a resolved ENS name and falling back to the full wallet address;
- token ID, ERC-8004 ID, Cred score, and other bounded public identity facts already available to the Console.

The drawer must not invent proof. Existing evidence gates remain unchanged, and unavailable values are omitted rather than presented as verified.

### Identity and sidebar copy

- Rename every Console-facing `Console name` field and drawer label to `Agent name`.
- Normalize Cred with this exact precedence: (1) when a finite numeric `credScore` exists, preserve it and preserve a non-pending `credLabel` or synthesize `Cred <score>`; (2) when no numeric score exists but a non-pending label exists, preserve that label and do not invent a number; (3) only when token #614 has neither a numeric score nor a non-pending label, set score 65 and label `Cred 65`; (4) every other pending agent stays pending.
- Remove `review-only` wording from the identity Temper value/body and its default personality copy. Do not remove the separate runtime safety or execution proof boundary.
- Replace `Authenticated user` or equivalent owner/operator labels with the resolved ENS name when available, otherwise the full connected owner wallet address.
- Remove `Agent selection lives under My agents.` from Current room.
- Remove `The Console only loads real Loopers owned by the connected wallet.` from My agents.
- Correct Current room and My agents drawer text colors so summary hints, stats, and expanded copy remain readable in the live theme.

### XMTP chat viewport and avatars

- Give the message timeline a bounded responsive height with its own vertical scroll instead of allowing every message to expand the full page.
- Keep the room header, drawer, and composer outside the scrolling timeline so the input remains reachable.
- Before a full-root rerender, capture the room/conversation key, message identity/count, timeline `scrollTop`, `scrollHeight`, and `clientHeight`. Treat the reader as near-bottom only when `scrollHeight - scrollTop - clientHeight <= 48` pixels.
- On first room open and after a successful locally authored send, scroll to the newest message. For a genuinely new incoming message, scroll to newest only when the prior viewport was near-bottom; otherwise restore the prior absolute `scrollTop`. For unrelated rerenders in the same room, always restore the prior `scrollTop`. A room-key change resets to newest.
- Before `root.innerHTML` replacement, capture the composer DOM value, whether its textarea is `document.activeElement`, `selectionStart`, `selectionEnd`, and `selectionDirection`. After replacement, restore the value and selection; call `focus({ preventScroll: true })` only when it was previously focused. Timeline restoration runs without focusing any element.
- Preserve mobile page scrolling while confining long conversation history to the message viewport.
- Agent messages use the selected Looper's canonical image URL.
- Human messages use the connected owner's ENS avatar when resolvable.
- Resolve ENS name and avatar on Ethereum mainnet after wallet connection without blocking authentication, roster loading, activation, or send.
- Guard ENS lookups with the authenticated wallet and Console session generation. Discard a late result after disconnect, address change, or session reset, and clear the prior owner's public profile immediately at that boundary.
- If ENS lookup fails, fall back to the full wallet address for the label and deterministic initials for the avatar.
- Normalize both existing and newly returned messages at render/snapshot time so prior messages receive the current role-based avatar without rewriting persisted XMTP history; role-derived avatars override stale message avatar fields.
- Accept only safe HTTPS image URLs in rendered avatar fields. If an actual image load fails, hide/remove the failed image and reveal the deterministic initials fallback without retry loops.

## Data flow

1. Wallet connection establishes the authenticated wallet address as it does today.
2. A non-blocking owner-profile lookup resolves reverse ENS name and ENS avatar; state stores only public display values.
3. Owned Looper loading keeps the canonical Looper image and applies the #614 temporary Cred fallback only when Cred is absent.
4. The Console snapshot combines selected-agent facts, owner profile, and evidence-gated runtime checks.
5. The renderer applies agent/human labels and avatars by message role before producing chat markup.

ENS failure is cosmetic and must never fail the Console session. No signing material, provider credentials, or private Sibyl content enters the drawer.

## Verification

- Renderer tests prove the proof rail is a closed expandable drawer and that expansion contains only available Multipass facts and evidence.
- Tests prove `Agent name` replaces `Console name` and both removed instructional sentences are absent.
- Tests prove all four Cred precedence branches: numeric score wins and repairs a pending label, label-only trust is preserved, #614 receives 65 only when both sources are absent/pending, and non-614 agents remain pending.
- Tests prove Temper omits `review-only` while the execution safety boundary remains elsewhere.
- Tests prove owner display prefers ENS and falls back to the full wallet address.
- Tests prove the message timeline uses a bounded scroll viewport, keeps the composer outside it, applies the 48-pixel near-bottom rule, always advances on first room open/local send, advances incoming messages only near-bottom, preserves absolute `scrollTop` when reading older messages, and does not break mobile page scrolling.
- Tests prove full-root rerenders capture/restore composer DOM value, focus, selection start/end/direction, only refocus a previously focused composer, and never let timeline restoration steal focus.
- Tests prove ENS results are discarded after wallet/session changes and cleared at wallet boundaries.
- Tests prove agent and human messages receive Looper and ENS avatars, unsafe URL schemes are rejected, stale message avatars are overridden by role, and failed image loads reveal deterministic initials.
- Run focused Console tests, the complete web test suite, production build, syntax checks, and `git diff --check`.
- Inspect desktop and mobile Console screenshots for drawer density, contrast, avatar cropping, overflow, and composer reachability before deployment.

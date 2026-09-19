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
- Give Looper #614 a temporary Cred score of 65, matching Quigbot, only when the live record has no real Cred score. A real score always wins.
- Remove `review-only` wording from the identity Temper value/body and its default personality copy. Do not remove the separate runtime safety or execution proof boundary.
- Replace `Authenticated user` or equivalent owner/operator labels with the resolved ENS name when available, otherwise the full connected owner wallet address.
- Remove `Agent selection lives under My agents.` from Current room.
- Remove `The Console only loads real Loopers owned by the connected wallet.` from My agents.
- Correct Current room and My agents drawer text colors so summary hints, stats, and expanded copy remain readable in the live theme.

### XMTP chat avatars

- Agent messages use the selected Looper's canonical image URL.
- Human messages use the connected owner's ENS avatar when resolvable.
- Resolve ENS name and avatar on Ethereum mainnet after wallet connection without blocking authentication, roster loading, activation, or send.
- If ENS lookup or image loading fails, fall back to the full wallet address for the label and deterministic initials for the avatar.
- Normalize both existing and newly returned messages at render/snapshot time so prior messages receive the correct role-based avatar without rewriting persisted XMTP history.
- Accept only safe HTTPS image URLs in rendered avatar fields.

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
- Tests prove Looper #614 receives Cred 65 only when its real Cred value is missing.
- Tests prove Temper omits `review-only` while the execution safety boundary remains elsewhere.
- Tests prove owner display prefers ENS and falls back to the full wallet address.
- Tests prove agent and human messages receive Looper and ENS avatars, with safe fallbacks.
- Run focused Console tests, the complete web test suite, production build, syntax checks, and `git diff --check`.
- Inspect desktop and mobile Console screenshots for drawer density, contrast, avatar cropping, overflow, and composer reachability before deployment.

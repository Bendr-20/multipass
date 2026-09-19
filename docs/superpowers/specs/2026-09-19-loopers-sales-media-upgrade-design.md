# Loopers Sales Media Upgrade Design

**Date:** 2026-09-19
**Status:** Approved in Telegram by the requester

## Goal

Make each individual sale alert display the exact Looper sold, and make every multi-item sweep alert use Epifani's approved sweeping animation without adding extra Telegram posts.

## Approved Asset

The approved source is:

- source: `/home/ubuntu/.openclaw/workspace/media/generated/epifani-looper-sweep.gif`
- repository destination: `apps/web/public/loopers-sweep.gif`
- built destination: `apps/web/dist/loopers-sweep.gif`
- live destination: `/var/www/helixa.xyz/multipass/loopers-sweep.gif`
- public URL and default `LOOPERS_SALES_SWEEP_ANIMATION_URL`: `https://helixa.xyz/multipass/loopers-sweep.gif`
- SHA-256: `19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572`
- MIME: `image/gif`
- dimensions: `720x900`
- size: `2,234,613` bytes, safely below Telegram Bot API's animation upload limit

The implementation and rollout must fail closed if the source, built file, or deployed file does not match that checksum.

## Design

### Individual sales

For a one-item sale, derive the primary image directly from the validated numeric token ID:

`https://helixa.xyz/loopers/images/<tokenId>.png`

This deterministic canonical route eliminates metadata identity ambiguity and guarantees that Looper `N` cannot select another token's image. Do not fetch metadata or the image from the bot process. Submit the URL directly to Telegram.

Fallback order is:

1. deterministic canonical Looper image;
2. trusted OpenSea event image for the same normalized sale;
3. Loopers logo;
4. text-only alert.

Telegram media rejection must not delay or suppress the sale alert.

### Sweeps

For a sale group containing two or more items, use Telegram `sendAnimation` with the approved sweep GIF and the existing caption. Keep token IDs, item count, totals, floor comparison, premium treatment, OpenSea collection link, and Basescan transaction link in that one post.

Fallback order is:

1. approved sweep animation;
2. deterministic canonical image for the first sorted token ID in the group;
3. trusted OpenSea image for that same item;
4. Loopers logo;
5. text-only alert.

### Late siblings and one-post behavior

Persist delivery mode as `animation`, `photo`, or `text`.

- Delivered animation that gains another sibling: use `editMessageCaption`.
- Delivered photo that changes from one item to a sweep: attempt `editMessageMedia` with `InputMediaAnimation` and the updated caption. On success, persist mode `animation` for the same message ID.
- If that animation media edit is rejected, keep the existing photo and update its caption with `editMessageCaption`; do not delete or create another post.
- Delivered text that gains a sibling: use `editMessageText`; Telegram text messages cannot be converted to media without creating a second post.

This preserves one Telegram message per transaction while making a late-discovered sweep animated whenever Telegram permits the in-place media transition.

## Components

- `loopers-sales/telegram.js`: build deterministic Looper image URLs, choose animation for sweeps, execute ordered animation/photo/text fallbacks, and support late `photo -> animation` media edits.
- `loopers-sales-bot.js`: pass the configured sweep animation URL into rendered cards and persist returned delivery-mode transitions.
- runner/systemd configuration: expose `LOOPERS_SALES_SWEEP_ANIMATION_URL` as a non-secret setting with the approved public URL as default.
- `apps/web/public/loopers-sweep.gif`: approved immutable source asset for the web build.

## Media Safety

Keep the established trusted-image validation for OpenSea event images. Deterministic Looper URLs must be constructed only from normalized numeric token IDs and the exact fixed origin/path prefix `https://helixa.xyz/loopers/images/`. The sweep animation must equal the exact configured HTTPS URL on `helixa.xyz`; reject credentials, ports, IP literals, non-HTTPS schemes, and lookalike hosts.

The bot does not fetch, preflight, or follow redirects for sale images or the sweep animation. Telegram fetches the submitted media. Existing media-class errors trigger only the documented fallback chain. Never log secrets, raw response bodies, or rejected untrusted URLs.

## Error Handling

- Canonical Looper-image rejection falls back to the trusted OpenSea event image.
- Sweep-animation rejection falls through to photo and then text without losing the sale.
- A rejected late `photo -> animation` edit keeps the existing photo and updates its caption.
- Retryable Telegram/network errors retain existing retry behavior.
- Fatal Telegram authorization/configuration errors remain fatal.
- Content errors retain concise-caption and text fallbacks.

## Testing

Add focused tests proving:

- a single sale submits the deterministic image matching the normalized token ID before the OpenSea image;
- invalid token IDs cannot construct canonical image URLs;
- a sweep uses `sendAnimation` with the exact approved URL and unchanged caption data;
- animation rejection falls back in order to the first sorted Looper's canonical image, its trusted OpenSea image, the logo, and text;
- late sweep conversion uses `editMessageMedia`, persists `animation` mode on success, and falls back to an in-place caption edit on media rejection;
- existing animation, photo, and text edits use the correct Telegram methods;
- untrusted media URLs are never submitted;
- existing money, grouping, state, OpenSea, activity-bot, and rollout tests remain green.

## Rollout and Rollback

Work in an isolated clean worktree so the dirty production checkout cannot leak unrelated changes into the build. Copy the approved GIF into the repository, build the web app there, and verify the source and built asset checksum, MIME, dimensions, and size.

Before changing production:

1. Generate an exact deployment manifest from the reviewed diff. It must list every production path that will be overwritten or created, including bot source, configuration/unit files, repository asset files, built asset files, and the live GIF.
2. Create a timestamped rollback directory outside the repository. For every manifest path, record whether it existed; copy existing files byte-for-byte with mode/owner metadata, and record newly created paths for deletion on rollback. Back up the installed systemd unit separately and record the service's active/enabled state and PID.
3. Copy only the reviewed manifest files into `/home/ubuntu/multipass` without disturbing unrelated dirty files.
4. Install the verified built GIF at `/var/www/helixa.xyz/multipass/loopers-sweep.gif` with the same bytes/checksum.
5. Verify the public URL returns HTTP 200, `Content-Type: image/gif`, the expected content length, and the expected downloaded checksum.
6. Run focused sales suites, the Loopers activity regression suite, syntax checks, and a live no-post OpenSea probe.
7. Install the reviewed unit, daemon-reload, and restart `loopers-sales-bot.service` once.
8. Verify active/enabled state, stable nonzero PID, no restart-count growth, readiness in the journal, unchanged durable state ownership/mode, and no test Telegram post.

If file copy, asset verification, tests, probe, unit installation, restart, or readiness fails, stop the new process, restore every pre-existing manifest path with its prior bytes/mode/owner, delete every manifest path that did not previously exist (including the live GIF when appropriate), restore the prior unit, daemon-reload, and restore the prior service active/enabled state exactly. If it was previously active, prove readiness and a stable nonzero PID; otherwise prove it inactive. Independently prove its enabled/disabled state matches the recorded prior state before reporting the rollout blocked. Keep the rollback directory until final verification succeeds.

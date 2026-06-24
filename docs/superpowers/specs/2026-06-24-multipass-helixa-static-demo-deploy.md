# Multipass Internal Prototype Deploy Spec

## Goal
Host the current Multipass Protocol Artifact demo at `https://helixa.xyz/multipass/` as an unlinked team-review prototype.

This is not ready for broader discovery.

## Deployment shape
- Build the Multipass web app as a static bundle.
- Copy the built files into `Bendr-20/helixa` under `docs/multipass/` so the route is tracked in Git.
- Copy the same built files into the live nginx static root at `/var/www/helixa.xyz/multipass/`, because live `helixa.xyz` is served by nginx from `/var/www/helixa.xyz`.
- Keep `helixa.xyz` root unchanged.
- Keep `api.helixa.xyz` unchanged.
- Do not require Cloudflare quick tunnels.
- Do not add discoverability paths or promotional copy.

## Source of truth notes
The Helixa repo commit is the historical deploy artifact, but it is not enough to update live `helixa.xyz` by itself.

Current live path:

```text
/var/www/helixa.xyz/multipass/
```

Current tracked repo path:

```text
/home/ubuntu/helixa/docs/multipass/
```

Any future deploy must verify both Git state and nginx-served live files.

## Runtime data
The `/multipass/` prototype must not require a live Multipass API server. It should load a bundled Bendr fixture when running as a static page, while preserving local dev behavior:
- local dev keeps `/multipass-api` loading and safe `?api=` override;
- static prototype mode uses bundled public API-shaped fixture data;
- JSON toggles, private field redaction, wording guard, and error/setup state remain covered by tests.

## Prototype status
This route is intentionally unlinked and should stay that way until product readiness improves.

Treat `/multipass/` as publicly accessible despite being unlinked. Do not include secrets, private user data, internal endpoints, auth material, live tokens, or unredacted proof data.

Do not treat this route as ready for broader discovery until a separate product readiness review says:
- the one-sentence Multipass positioning is clear;
- the first audience is chosen;
- the demo explains what is real, what is fixture data, and what is future intent;
- the page has been reviewed for mobile, copy, privacy, and claims;
- the team approves making it discoverable.

## Scope
In scope:
- Minimal static fixture loader for the web app.
- Sanitized public fixture documents that mirror API responses, not raw fixture source files.
- Vite base/path support for `/multipass/`.
- Build/deploy copy into `helixa/docs/multipass/`.
- Build/deploy copy into `/var/www/helixa.xyz/multipass/` for the live nginx site.
- Static mode copy labels the source accurately instead of calling bundled data a local API.
- Tests for static fixture fallback and `/multipass/` build assumptions.
- Verification against local static preview and live nginx route.

Out of scope:
- Replacing the Helixa homepage.
- Adding navigation or public links.
- Writing promotional posts.
- Deploying a new backend.
- Wallet/auth/contract reads.
- DNS changes.
- Editing unrelated dirty Helixa repo files.

## Safety constraints
- Do not stage or modify existing unrelated Helixa changes: `api/v2-server.js`, `.gitmodules`, or `foundry.lock`.
- Stage only files related to `docs/multipass/` and any explicit docs/spec files created for this work.
- Keep public-facing copy clean: no travel-document metaphor, no split Multipass spelling, no old dotted-name roadmap wording, no six-tier trust wording, no reputation-purchase phrasing, no old human/agent ownership framing, no em dashes, no emojis.
- Keep private or sensitive data out of bundled fixtures.
- Static JSON must remain public API-shaped and sanitized.

## Success criteria
- `https://helixa.xyz/multipass/` serves the Protocol Artifact prototype from nginx.
- Local verification can preview the static route from the Helixa `docs/` root and see the hero, proof ledger, `mp_bendr_2`, and Source field.
- Live verification confirms `/multipass/` asset paths return 200, do not point to root `/assets/`, and do not require `/multipass-api`.
- Static mode labels bundled fixture data accurately, for example `Static Demo` and `Source: bundled fixture`, while local dev can keep local API wording.
- Multipass tests/build pass.
- Helixa worktree still contains only pre-existing unrelated dirty files plus the intended `docs/multipass/` deployment before commit.

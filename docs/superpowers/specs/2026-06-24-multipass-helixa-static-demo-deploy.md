# Multipass Helixa Static Demo Deploy Spec

## Goal
Publish the current Multipass Protocol Artifact demo at `https://helixa.xyz/multipass/` without replacing the Helixa homepage.

## Deployment shape
- Build the Multipass web app as a static bundle.
- Copy the built files into `Bendr-20/helixa` under `docs/multipass/`, because `helixa.xyz` is served from the Helixa repo `docs/` folder through GitHub Pages.
- Keep `helixa.xyz` root unchanged.
- Keep `api.helixa.xyz` unchanged.
- Do not require Cloudflare quick tunnels.

## Runtime data
The public `/multipass/` demo must not require a live Multipass API server. It should load a bundled Bendr fixture when running as a static page, while preserving the current local dev behavior:
- local dev keeps `/multipass-api` loading and safe `?api=` override;
- public static deployment can use bundled fixture data;
- JSON toggles, private field redaction, wording guard, and error/setup state remain covered by tests.

## Scope
In scope:
- Minimal static fixture loader for the web app.
- Vite base/path support for `/multipass/`.
- Build/deploy copy into `helixa/docs/multipass/`.
- Tests for static fixture fallback and `/multipass/` build assumptions.
- Verification against local static preview.

Out of scope:
- Replacing the Helixa homepage.
- Deploying a new backend.
- Wallet/auth/contract reads.
- DNS changes.
- Editing unrelated dirty Helixa repo files.

## Safety constraints
- Do not stage or modify existing unrelated Helixa changes: `api/v2-server.js`, `.gitmodules`, or `foundry.lock`.
- Stage only files related to `docs/multipass/` and any explicit docs/spec files created for this work.
- Keep public copy clean: no travel-document metaphor, no split Multipass spelling, no old dotted-name roadmap wording, no six-tier trust wording, no reputation-purchase phrasing, no old human/agent ownership framing, no em dashes, no emojis.

## Success criteria
- `https://helixa.xyz/multipass/` serves the Protocol Artifact demo after GitHub Pages updates.
- Local verification can preview the static route and see the hero, proof ledger, `mp_bendr_2`, and Source field.
- Multipass tests/build pass.
- Helixa worktree still contains only pre-existing unrelated dirty files plus the intended `docs/multipass/` deployment before commit.

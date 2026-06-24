# Multipass Local API Server Design

## Purpose

Add a small runnable local API server for the Multipass repo so future web/UI work can hit real HTTP routes instead of importing the route core directly.

This is a local development layer only. It is not a production deployment, persistence layer, auth system, indexer, or payment settlement service.

## Current state

The repo already has:

- `@helixa/multipass-types`: schema contracts, enum exports, and schema registry.
- `@helixa/multipass-sdk`: validators, assert helpers, JSON parsers, and file loaders.
- `@helixa/multipass-api`: memory-backed API boundary with `createMemoryStore` and `createMultipassApi`.
- Tests covering profile lookup, public fragment filtering, agent card, standards, x402, receipts, well-known discovery, and structured errors.

The missing piece is a small executable HTTP wrapper plus fixture data.

## Goals

- Provide a local HTTP server that wraps the existing `createMultipassApi` boundary.
- Support two fixture sets:
  - `generic`: public-neutral sample data.
  - `bendr`: realistic internal demo data for Helixa/Multipass work.
- Make local startup one command.
- Keep fixture data validated through the SDK before it can be served.
- Keep the implementation dependency-light and easy to replace with a real host later.

## Non-goals

- No database.
- No auth.
- No private data serving.
- No x402 payment challenge or settlement.
- No deployment service.
- No web UI.
- No contract reads.
- No indexing.

## Proposed commands

Root scripts:

```json
{
  "api:generic": "pnpm --filter @helixa/multipass-api start --fixture generic",
  "api:bendr": "pnpm --filter @helixa/multipass-api start --fixture bendr"
}
```

API package scripts:

```json
{
  "start": "node src/server.js"
}
```

Supported CLI flags:

- `--fixture generic` or `--fixture bendr`, default `generic`.
- `--port 8787`, default `8787`.
- `--host 127.0.0.1`, default `127.0.0.1`.

Environment overrides:

- `MULTIPASS_FIXTURE`
- `PORT`
- `HOST`

CLI flags should win over environment values.

## Fixture layout

```text
apps/api/fixtures/
  generic/
    profile.json
    fragments.json
    agent-card.json
    standards-profile.json
    x402-manifest.json
    receipts.json
  bendr/
    profile.json
    fragments.json
    agent-card.json
    standards-profile.json
    x402-manifest.json
    receipts.json
```

Each fixture file maps directly to one schema family:

- `profile.json`: one Multipass profile.
- `fragments.json`: array of identity fragments.
- `agent-card.json`: one agent card.
- `standards-profile.json`: one standards profile.
- `x402-manifest.json`: one x402 manifest.
- `receipts.json`: array of receipt fragments.

The fixture loader should validate all files by constructing a `createMemoryStore` input. If any file is invalid, startup fails with a clear error and the server does not listen.

## Generic fixture

The generic fixture should be safe and public-neutral:

- `multipass_id`: `mp_demo_agent`
- `slug`: `demo-agent`
- display name: `Demo Agent`
- subject type: `agent`
- status: `draft`
- owner state: `unclaimed`
- public fragment examples:
  - wallet fragment
  - endpoint fragment
  - standards reference fragment
- one private fragment to prove public filtering still works.
- x402 manifest with a sample CRED endpoint.
- one receipt fragment using response class `success`.

## Bendr fixture

The Bendr fixture should be realistic but still safe for a public repo:

- `multipass_id`: `mp_bendr_2`
- `slug`: `bendr-2`
- display name: `Bendr 2.0`
- subject type: `agent`
- status: `draft` or `link_ready`, not claiming production activation.
- discovery summary should describe Bendr as a Helixa/Multipass demo agent.
- public fragments can include:
  - public profile fragment
  - public endpoint fragment
  - public standards reference fragment
  - public x402 route fragment
- include one private placeholder fragment that contains no secret value and only demonstrates redaction/filtering behavior.
- standards profile should include ERC-8004 as an adapter/reference state, not a claim of full live Multipass identity.
- x402 manifest should use sample URLs under localhost or example domains, not real paid infrastructure.

## HTTP behavior

The local server should pass every request into `api.handleRequest(request)` from `createMultipassApi` and write back:

- status code
- response headers
- response body

It should support JSON responses only for now.

Required manual smoke URLs:

- `GET http://127.0.0.1:8787/.well-known/helixa-multipass.json`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent/fragments`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent/agent-card`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent/standards`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent/x402`
- `GET http://127.0.0.1:8787/api/multipass/demo-agent/receipts/receipt_demo_lookup`

The Bendr script should serve the same route pattern under `bendr-2`, with `receipt_bendr_lookup` as the first receipt fixture.

## Components

### `apps/api/src/fixtures.js`

Responsibilities:

- Resolve fixture name to directory.
- Load JSON files.
- Normalize file contents into memory store input.
- Validate through `createMemoryStore`.
- Return `{ store, fixtureName }`.

Public interface:

```js
loadFixtureStore({ fixture = 'generic' })
```

### `apps/api/src/server.js`

Responsibilities:

- Parse CLI flags and environment defaults.
- Load fixture store.
- Create API boundary with `createMultipassApi`.
- Pass `createMultipassApi` a `baseUrl` derived from the active host and port. For ephemeral-port tests, derive the final base URL after the server is listening.
- Start Node HTTP server.
- Convert Node requests into Web `Request` objects.
- Convert Web `Response` objects into Node responses.
- Print local server URL and active fixture.

Public interface:

```js
parseServerOptions(argv, env)
startServer(options)
```

When executed directly, it should start the server.

## Error handling

- Unknown fixture name: fail startup with a clear message.
- Invalid fixture JSON: fail startup with the file path and parse error.
- Schema-invalid fixture: fail startup with the schema name and validation path.
- Unsupported route: existing API boundary returns structured 404 JSON.
- Unsupported method: existing API boundary returns structured 405 JSON.
- Port already in use: let Node surface the listen error and exit non-zero.

## Testing plan

Write tests first.

Fixture tests:

- `loadFixtureStore({ fixture: 'generic' })` returns a store that resolves `demo-agent`.
- `loadFixtureStore({ fixture: 'bendr' })` returns a store that resolves `bendr-2`.
- Public fragments route excludes private fixture fragments.
- Unknown fixture name rejects with a useful error.
- Invalid JSON fixture files reject with the fixture path and parse context.
- Schema-invalid fixture files reject with the schema name and validation path.

Server tests:

- `parseServerOptions` respects defaults.
- CLI flags override environment values.
- `startServer` can serve the well-known route and profile route on an ephemeral port.
- Server can be closed cleanly after tests.

Root verification:

- `pnpm test` passes.
- Banned wording and em dash gates pass.
- Package JSON files parse.
- `git diff --check` passes.

## Future path

This local server gives the web app and future demos a real API target. Later work can replace the memory store with persistence, add auth, connect an indexer, connect Bankr/x402 infrastructure, and deploy an HTTP host without changing the core route contract.

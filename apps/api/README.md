# Multipass API

Memory-backed API boundary primitives for Multipass profiles and agent-readable documents.

This is not a hosted production server. It is the route and response core that future API deployments can wrap with HTTP hosting, persistence, auth, indexing, and x402 settlement.

## Current routes

- `GET /.well-known/helixa-multipass.json`
- `GET /api/multipass/{id}`
- `GET /api/multipass/{id}/fragments`
- `GET /api/multipass/{id}/agent-card`
- `GET /api/multipass/{id}/standards`
- `GET /api/multipass/{id}/x402`
- `GET /api/multipass/{id}/receipts/{receipt_id}`

The memory store validates all supplied documents with `@helixa/multipass-sdk` before serving them. Fragment responses return public fragments only.

## Local server

Run a public-neutral fixture:

```bash
pnpm api:generic
```

Run the Bendr demo fixture:

```bash
pnpm api:bendr
```

Default URL: `http://127.0.0.1:8787`.

Useful routes:

- `GET /.well-known/helixa-multipass.json`
- `GET /api/multipass/demo-agent`
- `GET /api/multipass/demo-agent/fragments`
- `GET /api/multipass/demo-agent/agent-card`
- `GET /api/multipass/demo-agent/standards`
- `GET /api/multipass/demo-agent/x402`
- `GET /api/multipass/demo-agent/receipts/receipt_demo_lookup`
Bendr fixture routes use the same pattern with `bendr-2`:

- `GET /api/multipass/bendr-2`
- `GET /api/multipass/bendr-2/fragments`
- `GET /api/multipass/bendr-2/agent-card`
- `GET /api/multipass/bendr-2/standards`
- `GET /api/multipass/bendr-2/x402`
- `GET /api/multipass/bendr-2/receipts/receipt_bendr_lookup`

This server is local development only. It has no database, auth, deployment service, or payment settlement.

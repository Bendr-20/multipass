# Multipass API

API boundary primitives for Multipass profiles, agent-readable documents, A1 saved public records, and B1/B2 developer reads.

This server exposes public display-only Multipass data. It does not transfer custody, reveal private fields, mutate routes, grant tool access, or make payments and receipts count as trust.

## Current routes

Discovery and developer surface:

- `GET /.well-known/helixa-multipass.json`
- `GET /.well-known/multipass.json`
- `GET /api/openapi.json`
- `GET /api/resolve?agent={input}`
- `GET /api/search?q={query}`

Activation and saved records:

- `POST /api/multipass/activate` preview a live AgentDNA activation without saving it
- `POST /api/multipass` save a public display-only Multipass record

Public profile reads:

- `GET /api/multipass/{id}`
- `GET /api/v0/multipass/{id}`
- `GET /api/multipass/{id}/fragments`
- `GET /api/multipass/{id}/card`
- `GET /api/multipass/{id}/agent-card`
- `GET /api/multipass/{id}/standards`
- `GET /api/multipass/{id}/x402`
- `GET /api/multipass/{id}/receipts`
- `GET /api/multipass/{id}/receipts/{receipt_id}`
- `GET /api/multipass/{id}/changes`

Manager routes are session and CSRF protected. Public fragment responses return public fragments only. Saved records are public display records until a claim flow verifies a manager.

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

Advertise a production URL while listening locally:

```bash
MULTIPASS_PUBLIC_BASE_URL=https://helixa.xyz pnpm api:bendr
```

Enable persistent saved records with SQLite:

```bash
MULTIPASS_DB_PATH=/tmp/multipass.sqlite pnpm api:bendr
```

You can also pass `--database /tmp/multipass.sqlite` and `--public-base-url https://helixa.xyz` to the server CLI.

Useful routes:

- `GET /.well-known/multipass.json`
- `GET /api/openapi.json`
- `GET /api/resolve?agent=demo-agent`
- `GET /api/search?q=demo`
- `GET /api/multipass/demo-agent`
- `GET /api/multipass/demo-agent/fragments`
- `GET /api/multipass/demo-agent/card`
- `GET /api/multipass/demo-agent/agent-card`
- `GET /api/multipass/demo-agent/standards`
- `GET /api/multipass/demo-agent/x402`
- `GET /api/multipass/demo-agent/receipts`
- `GET /api/multipass/demo-agent/receipts/receipt_demo_lookup`
- `GET /api/multipass/demo-agent/changes`

Bendr fixture routes use the same pattern with `bendr-2`.

Save a persistent public record after previewing or activating a live source record:

```bash
curl -s http://127.0.0.1:8787/api/multipass \
  -H 'content-type: application/json' \
  -d '{"agent":"1"}'
```

`POST /api/multipass/activate` is preview-only. `POST /api/multipass` is the public save path in A1.

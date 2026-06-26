# Multipass API

API boundary primitives for Multipass profiles, agent-readable documents, and A1 saved public records.

This is not a hosted production server. It is the route and response core that future API deployments can wrap with managed hosting, auth, indexing, and x402 settlement.

## Current routes

- `GET /.well-known/helixa-multipass.json`
- `POST /api/multipass/activate` preview a live AgentDNA activation without saving it
- `POST /api/multipass` save a public display-only Multipass record
- `GET /api/multipass/{id}`
- `GET /api/multipass/{id}/fragments`
- `GET /api/multipass/{id}/card`
- `GET /api/multipass/{id}/agent-card`
- `GET /api/multipass/{id}/standards`
- `GET /api/multipass/{id}/x402`
- `GET /api/multipass/{id}/receipts/{receipt_id}`
- `GET /api/multipass/{id}/changes`

The fixture store validates supplied documents with `@helixa/multipass-sdk` before serving them. Fragment responses return public fragments only. Saved A1 records are public, display-only, and unclaimed.

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

Enable persistent saved records with SQLite:

```bash
MULTIPASS_DB_PATH=/tmp/multipass.sqlite pnpm api:bendr
```

You can also pass `--database /tmp/multipass.sqlite` to the server CLI. `MULTIPASS_DB_PATH` is what makes saved records durable for local development.

Useful routes:

- `GET /.well-known/helixa-multipass.json`
- `GET /api/multipass/demo-agent`
- `GET /api/multipass/demo-agent/fragments`
- `GET /api/multipass/demo-agent/card`
- `GET /api/multipass/demo-agent/agent-card`
- `GET /api/multipass/demo-agent/standards`
- `GET /api/multipass/demo-agent/x402`
- `GET /api/multipass/demo-agent/receipts/receipt_demo_lookup`
- `GET /api/multipass/demo-agent/changes`
Bendr fixture routes use the same pattern with `bendr-2`:

- `GET /api/multipass/bendr-2`
- `GET /api/multipass/bendr-2/fragments`
- `GET /api/multipass/bendr-2/card`
- `GET /api/multipass/bendr-2/agent-card`
- `GET /api/multipass/bendr-2/standards`
- `GET /api/multipass/bendr-2/x402`
- `GET /api/multipass/bendr-2/receipts/receipt_bendr_lookup`
- `GET /api/multipass/bendr-2/changes`

Save a persistent public record after previewing or activating a live source record:

```bash
curl -s http://127.0.0.1:8787/api/multipass \
  -H 'content-type: application/json' \
  -d '{"agent":"1"}'
```

`POST /api/multipass/activate` is preview-only. `POST /api/multipass` is the only public save path in A1.

This server is local development only. A1 persistence stores public display records when a database path is configured. It does not provide auth, claim management, edit controls, deployment service, or payment settlement.

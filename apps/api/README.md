# Multipass API

API boundary primitives for Multipass profiles, agent-readable documents, A1 saved public records, and B1/B2 developer reads.

This server exposes public Multipass activation, profile, and discovery data. It does not transfer custody, reveal private fields, mutate live runtime routes, grant tool access, or make payments and receipts count as trust.

## Current routes

Discovery and developer surface:

- `GET /.well-known/helixa-multipass.json`
- `GET /.well-known/multipass.json`
- `GET /api/openapi.json`
- `GET /api/resolve?agent={input}`
- `GET /api/search?q={query}`

Activation and saved records:

- `POST /api/multipass/activate` preview a live AgentDNA activation without saving it
- `POST /api/multipass` activate and persist a public Multipass record

Public profile reads:

- `GET /api/multipass/{id}`
- `GET /api/v0/multipass/{id}`
- `GET /api/multipass/{id}/fragments`
- `GET /api/multipass/{id}/tools` public tool and service cards
- `GET /api/multipass/{id}/agent-card` canonical agent-readable card
- `GET /api/multipass/{id}/card` compatibility alias for the agent-readable card
- `GET /api/multipass/{id}/standards`
- `GET /api/multipass/{id}/x402`
- `GET /api/multipass/{id}/receipts`
- `GET /api/multipass/{id}/receipts/{receipt_id}`
- `GET /api/multipass/{id}/changes`

Manager routes are session and CSRF protected. Public fragment responses return public fragments only. Public tool cards are discovery metadata only, not tool execution, credentials, payments, or access grants. Activated records are public trust profiles until a claim flow verifies a manager.

Canonical route notes:

- Use `/.well-known/multipass.json` as the canonical discovery document. `/.well-known/helixa-multipass.json` remains a legacy alias.
- Use `/api/multipass/{id}/agent-card` as the canonical agent-readable card route. `/api/multipass/{id}/card` remains a compatibility alias.
- Public `/changes` responses expose saved-record change history only when available.

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
- `GET /api/multipass/demo-agent/tools`
- `GET /api/multipass/demo-agent/agent-card`
- `GET /api/multipass/demo-agent/card` compatibility alias
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

## Live operator docs

- `docs/live-status.md` describes the current V0 public surface and safety boundary.
- `docs/live-smoke-checklist.md` contains copy-paste local and live smoke checks.

## ERC-8004 import

Activation checks the canonical Base ERC-8004 Identity Registry for identities already held by the live Helixa agent owner, agent address, or configured platform wallets. Matching identities are imported as public `standard_ref` fragments and reflected in the standards profile.

Custody labels:

- `agent_owned` - held by the agent custody wallet or an AGENT_SIWA source owner
- `owner_owned` - held by the public Helixa source owner
- `platform_held_mirror` - held by a configured Helixa/platform wallet
- `candidate_match` - metadata matched, but custody could not be classified

Optional environment:

```bash
MULTIPASS_ERC8004_PLATFORM_WALLETS=0x...,0x...
MULTIPASS_ERC8004_REGISTRY_ADDRESS=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
MULTIPASS_ERC8004_BLOCKSCOUT_API=https://base.blockscout.com/api
BASE_RPC_URL=https://mainnet.base.org
```

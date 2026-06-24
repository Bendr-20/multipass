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

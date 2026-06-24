# Schemas

## Status

These schemas are public planning contracts until implementation lands. They define the intended response shapes for Multipass profiles, identity fragments, agent cards, standards profiles, x402 manifests, and receipt fragments.

They are not a claim that every endpoint, adapter, contract, or payment flow is live.

## Versioning

Every response includes `schema_version`. Breaking changes require a new version. Non-breaking additions should preserve existing fields, meanings, and enum values.

Consumers should reject responses with an unsupported major version and should treat missing required fields as invalid.

## Redaction and visibility

Public responses return public fields by default. Gated/private fields require authorization or payment. Hidden fields never return raw content.

Visibility states should be preserved in responses so clients can distinguish public data from gated, private, and hidden records. Redacted summaries may describe status, assurance level, or eligibility without exposing raw private content.

## Schema index

- `multipass-profile.schema.json`: public Multipass profile response.
- `identity-fragment.schema.json`: linked identity, source, proof, receipt, or standards fragment.
- `agent-card.schema.json`: discovery and communication card for a Multipass subject.
- `standards-profile.schema.json`: standards references, adapter status, and compatibility summary.
- `x402-manifest.schema.json`: paid endpoint manifest for x402-compatible access.
- `receipt-fragment.schema.json`: settlement and response-class receipt fragment without raw payloads.

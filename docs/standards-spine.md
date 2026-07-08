# Standards Spine

## Role

The standards spine defines how Multipass connects portable identity, ownership, tool access, work records, risk context, and Cred trust signals to external standards. It is implementation direction for adapters and product surfaces, not a claim that every adapter is deployed.

Multipass stays the product layer. The standards below are reference layers used when a chain, contract, registry, or partner can support them with verifiable records.

## Spine map

- ERC-8217: control/binding bridge between a controller asset and ERC-8004 identity.
- ERC-8004: public agent identity, reputation, validation, and registration references.
- ERC-8126: verification and risk summaries.
- ERC-8257: tool manifests, pricing, access rules, origin/creator binding, verifiability.
- ERC-8183: jobs, evaluator attestations, outcome records.
- ERC-721T: agent-oriented NFT metadata profile.
- ERC-8048: token metadata key/value interface.

## Launch compatibility matrix

| Standard | Launch role | Initial support | Deferred work |
| --- | --- | --- | --- |
| ERC-8217 | Bind a Multipass or linked controller asset to an ERC-8004 identity where available. | Adapter target for control and binding references. | Chain-specific contract reads, owner checks, and revocation handling. |
| ERC-8004 | Expose public agent identity, registration metadata, reputation references, and validation references. | Base identity registry source import and primary identity/trust reference target. | Multi-registry coverage, reputation registry import, validation registry import, and validator indexing. |
| ERC-8126 | Add verification and risk summaries. | Risk and verification summary reference target. | Source scoring, stale state handling, and product risk labels. |
| ERC-8257 | Expose tool manifests, pricing, access rules, origin/creator binding, and verifiability. | Tool manifest and paid access reference target. | Endpoint attestation, access proofs, and x402 settlement joins. |
| ERC-8183 | Record jobs, evaluator attestations, and outcome records. | Work and evaluator attestation reference target. | Job lifecycle ingestion, evaluator quality checks, and outcome proof indexing. |
| ERC-721T | Describe agent-oriented NFT metadata. | NFT metadata compatibility target. | Marketplace display, metadata refresh, and controller asset binding. |
| ERC-8048 | Provide token metadata key/value references. | Token metadata compatibility target. | Token metadata sync, field mapping, and consumer cache policy. |

## Control and trust flow

1. Owner controls the Multipass.
2. Multipass or linked controller asset binds to ERC-8004 through ERC-8217 where available.
3. ERC-8004 exposes public agent identity, registration metadata, reputation, and validation references.
4. ERC-8126 adds verification and risk context.
5. ERC-8257 exposes tool access, manifests, and pricing where tools are standardized.
6. ERC-8183 records jobs, evaluator attestations, and outcome proofs where work is standardized.
7. Cred consumes verified outcomes, attestations, receipts, and history. $CRED can pay for access and settlement, but cannot be exchanged for reputation, trust, or verification.

## Adapter rules

Every standards adapter must expose the same minimum reference shape so product code can compare sources without hiding uncertainty.

Required adapter fields:

- `standard_id`: canonical standard name, such as `ERC-8004`.
- `status`: current adapter support state for the record.
- `chain_id`: chain where the referenced record is expected or observed.
- `contract_address`: contract address when the reference is onchain.
- `record_id`: registry id, token id, job id, fragment id, or other standard-specific record key.
- `adapter_version`: version of the Multipass adapter that produced the reference.
- `last_verified_at`: timestamp for the latest successful verification pass.
- `assurance_level`: confidence level derived from source quality and verification method.

Adapter behavior rules:

- Do not convert a missing external record into a passing trust signal.
- Preserve stale, disputed, revoked, and imported-unverified states instead of flattening them into active states.
- Keep source references separate from product labels.
- Treat payments and receipts as evidence of access or settlement, not as direct trust creation.
- Prefer additive adapters. A new standard should add a reference layer without breaking existing Multipass profiles.

## Product labels

Product labels are user-facing summaries derived from adapter state, ownership checks, and verification history.

- Identity bound
- Owner verified
- Risk checked
- Tools verified
- Work attested
- Trust updated

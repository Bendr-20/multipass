# Standards Spine

Multipass is the product surface. The standards spine is the composability layer underneath it.

## Standards map

| Layer | Standard | Role |
| --- | --- | --- |
| Root control and binding | ERC-8217 | Binds an ERC-8004 agent identity to an external NFT or tokenized controller. |
| Public agent identity | ERC-8004 | Provides agent identity, reputation, validation, and registration metadata. |
| Verification and risk | ERC-8126 | Provides verification types and risk context for ERC-8004 agents. |
| Tools and access | ERC-8257 | Provides tool registry records, manifests, pricing, access rules, and verifiability. |
| Jobs and outcomes | ERC-8183 | Provides job escrow, provider submission, evaluator attestation, and outcome records. |
| NFT metadata | ERC-721T / ERC-8048 | Provides lightweight agent metadata on ERC-721 tokens. |

Support is adapter-based so emerging standards can evolve without forcing Multipass core rewrites.

## Plain-language labels

For product surfaces, standards support should collapse into simple status labels:

- Identity bound
- Owner verified
- Risk checked
- Tools verified
- Work attested
- Trust updated

Developer and agent-facing outputs can expose exact standard IDs, contract addresses, record IDs, manifest hashes, and verification timestamps.

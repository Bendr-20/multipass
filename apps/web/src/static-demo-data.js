export const STATIC_DEMO_DATA = {
  "modeLabel": "Static Demo",
  "sourceLabel": "bundled fixture",
  "profile": {
    "schema_version": "0.1.0",
    "multipass_id": "mp_bendr_2",
    "subject_type": "agent",
    "display_name": "Bendr 2.0",
    "slug": "bendr-2",
    "status": "link_ready",
    "owner_summary": {
      "owner_state": "unclaimed",
      "verification_status": "none",
      "visibility": "public",
      "summary": "Demo ownership state for public static preview."
    },
    "custody_epoch": null,
    "public_fragments": [
      {
        "fragment_id": "frag_bendr_profile",
        "fragment_type": "attestation",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "fragment_id": "frag_bendr_endpoint",
        "fragment_type": "endpoint",
        "status": "pending",
        "assurance_level": "self_attested",
        "visibility": "public",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "fragment_id": "frag_bendr_standard_ref",
        "fragment_type": "standard_ref",
        "status": "stale",
        "assurance_level": "issuer_attested",
        "visibility": "public",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "fragment_id": "frag_bendr_receipt_history",
        "fragment_type": "receipt",
        "status": "historical",
        "assurance_level": "issuer_attested",
        "visibility": "public",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "fragment_id": "frag_bendr_route_dispute",
        "fragment_type": "verification_result",
        "status": "disputed",
        "assurance_level": "unverified",
        "visibility": "public",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "fragment_id": "frag_bendr_helixa_identity",
        "fragment_type": "attestation",
        "status": "verified",
        "assurance_level": "onchain_verified",
        "visibility": "public",
        "updated_at": "2026-06-24T22:49:52Z"
      },
      {
        "fragment_id": "frag_bendr_cred_score",
        "fragment_type": "risk_summary",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "updated_at": "2026-06-24T22:49:52Z"
      },
      {
        "fragment_id": "frag_bendr_social_x",
        "fragment_type": "social",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "updated_at": "2026-06-24T22:49:52Z"
      }
    ],
    "cred_summary": {
      "trust_state": "established",
      "attestation_count": 4,
      "receipt_count": 1,
      "last_updated_at": "2026-06-24T22:49:52Z",
      "public_note": "Cred score 80 imported from Helixa API. Cred is a signal, not something bought or raised by payment."
    },
    "discovery_profile": {
      "summary": "Bendr 2.0 is the Helixa lead agent with AgentDNA token #1, imported Cred context, public routes, and machine-readable Multipass records.",
      "tags": [
        "bendr",
        "helixa",
        "multipass"
      ],
      "avatar_url": null,
      "visibility": "public"
    },
    "standards_profile": {
      "standards_profile_id": "sp_bendr_2",
      "supported_standard_ids": [
        "ERC-8004",
        "ERC-8217",
        "ERC-8126",
        "ERC-8257",
        "ERC-8183"
      ],
      "last_verified_at": null
    },
    "payment_profile": {
      "accepted_assets": [
        {
          "asset": "CRED",
          "chain_id": 8453
        }
      ],
      "x402_manifest_url": "/multipass/static/x402-manifest.json",
      "paid_endpoints_enabled": false
    },
    "updated_at": "2026-06-24T22:49:52Z"
  },
  "fragments": {
    "subject_id": "bendr-2",
    "fragments": [
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_profile",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "attestation",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "historical_on_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "bendr_profile",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T00:00:00Z",
          "reference_url": null
        },
        "public_value": "Bendr 2.0 profile claim checked by the Helixa fixture.",
        "proof_reference": "fixture:profile-check",
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z",
        "verified_at": "2026-06-24T00:00:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_endpoint",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "endpoint",
        "status": "pending",
        "assurance_level": "self_attested",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "owner_submission",
          "source_id": "bendr_endpoint",
          "issuer": null,
          "observed_at": "2026-06-24T00:00:00Z",
          "reference_url": null
        },
        "public_value": "Bendr local API endpoint awaiting live verification.",
        "proof_reference": null,
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z",
        "endpoint_ref": {
          "endpoint_id": "lookup",
          "url": "/multipass/",
          "protocol": "api",
          "manifest_url": "/multipass/static/x402-manifest.json"
        }
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_standard_ref",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "standard_ref",
        "status": "stale",
        "assurance_level": "issuer_attested",
        "visibility": "public",
        "transfer_policy": "pause_on_transfer",
        "source": {
          "source_type": "issuer_attestation",
          "source_id": "bendr_standard",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T00:00:00Z",
          "reference_url": null
        },
        "public_value": "ERC-8004 adapter reference that needs a fresh check before stronger claims.",
        "proof_reference": "fixture:standard-ref",
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z",
        "verified_at": "2026-06-24T00:00:00Z",
        "expires_at": "2026-06-25T00:00:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_receipt_history",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "receipt",
        "status": "historical",
        "assurance_level": "issuer_attested",
        "visibility": "public",
        "transfer_policy": "historical_on_transfer",
        "source": {
          "source_type": "payment_receipt",
          "source_id": "bendr_receipt",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T00:00:00Z",
          "reference_url": null
        },
        "public_value": "Receipt evidence retained as history; it does not create trust by itself.",
        "proof_reference": "receipt_bendr_lookup",
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_route_dispute",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "verification_result",
        "status": "disputed",
        "assurance_level": "unverified",
        "visibility": "public",
        "transfer_policy": "never_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "bendr_route_dispute",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T00:00:00Z",
          "reference_url": null
        },
        "public_value": "Route claim intentionally marked disputed in the fixture.",
        "proof_reference": "fixture:route-dispute",
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z",
        "verification_ref": {
          "verification_type": "route_review",
          "result": "inconclusive",
          "issuer": "Helixa",
          "risk_level": "medium",
          "score": null
        }
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_helixa_identity",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "attestation",
        "status": "verified",
        "assurance_level": "onchain_verified",
        "visibility": "public",
        "transfer_policy": "historical_on_transfer",
        "source": {
          "source_type": "contract_read",
          "source_id": "helixa_agentdna_1",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T22:49:52Z",
          "reference_url": "https://api.helixa.xyz/api/v2/agent/1"
        },
        "public_value": "Helixa AgentDNA token #1 on Base, contract 0x2e3B541C59D38b84E3Bc54e977200230A204Fe60.",
        "proof_reference": "base:8453:0x2e3B541C59D38b84E3Bc54e977200230A204Fe60:1",
        "created_at": "2026-06-24T22:49:52Z",
        "updated_at": "2026-06-24T22:49:52Z",
        "verified_at": "2026-06-24T22:49:52Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_cred_score",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "risk_summary",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "registry_import",
          "source_id": "helixa_cred_score_1",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T22:49:52Z",
          "reference_url": "https://api.helixa.xyz/api/v2/agent/1"
        },
        "public_value": "Cred score 80, Preferred tier, imported from Helixa API.",
        "proof_reference": "helixa-api:agent:1:credScore",
        "created_at": "2026-06-24T22:49:52Z",
        "updated_at": "2026-06-24T22:49:52Z",
        "verified_at": "2026-06-24T22:49:52Z",
        "verification_ref": {
          "verification_type": "cred_import",
          "result": "passed",
          "issuer": "Helixa",
          "risk_level": "low",
          "score": 80
        }
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_bendr_social_x",
        "multipass_id": "mp_bendr_2",
        "fragment_type": "social",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "bendr_x_handle",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T22:49:52Z",
          "reference_url": "https://api.helixa.xyz/api/v2/agent/1"
        },
        "public_value": "X handle @BendrAI_eth imported from Helixa API.",
        "proof_reference": "helixa-api:agent:1:socials.x",
        "created_at": "2026-06-24T22:49:52Z",
        "updated_at": "2026-06-24T22:49:52Z",
        "verified_at": "2026-06-24T22:49:52Z"
      }
    ]
  },
  "card": {
    "schema_version": "0.1.0",
    "multipass_id": "mp_bendr_2",
    "name": "Bendr 2.0",
    "subject_type": "agent",
    "capabilities": [
      {
        "capability_id": "profile_lookup",
        "label": "Profile lookup",
        "description": "Read public Multipass profile data from the static preview.",
        "visibility": "public"
      },
      {
        "capability_id": "agent_card_resolution",
        "label": "Agent card resolution",
        "description": "Resolve compact agent card fields for discovery and trust checks.",
        "visibility": "public"
      }
    ],
    "message_routes": [
      {
        "route_id": "web_profile",
        "channel": "api",
        "address": "https://helixa.xyz/agent/1",
        "visibility": "public"
      },
      {
        "route_id": "telegram",
        "channel": "chat",
        "address": "@bendr2bot",
        "visibility": "public"
      }
    ],
    "service_endpoints": [
      {
        "endpoint_id": "helixa_profile",
        "url": "https://api.helixa.xyz/api/v2/agent/1",
        "description": "Public Helixa AgentDNA profile for Bendr 2.0.",
        "visibility": "public"
      },
      {
        "endpoint_id": "multipass_preview",
        "url": "https://helixa.xyz/multipass/",
        "description": "Hidden Multipass prototype preview.",
        "visibility": "public"
      }
    ],
    "x402_manifest_url": "/multipass/static/x402-manifest.json",
    "accepted_assets": [
      {
        "asset": "CRED",
        "chain_id": 8453
      }
    ],
    "trust_summary": {
      "identity_status": "verified",
      "assurance_level": "onchain_verified",
      "last_updated_at": "2026-06-24T22:49:52Z"
    },
    "rate_limits": {
      "requests": 60,
      "window_seconds": 60,
      "burst": 10
    },
    "contact_policy": {
      "mode": "approval_required",
      "requires_owner_approval": true,
      "policy_note": "Static demo only."
    },
    "standards_refs": [
      {
        "standard_id": "ERC-8004",
        "support_status": "adapter_ready",
        "record_id": null
      },
      {
        "standard_id": "ERC-8217",
        "support_status": "pending",
        "record_id": null
      }
    ]
  },
  "standards": {
    "schema_version": "0.1.0",
    "standards_profile_id": "sp_bendr_2",
    "multipass_id": "mp_bendr_2",
    "primary_refs": {
      "erc8004_identity": null,
      "controller_asset": null,
      "x402_manifest": "mp_bendr_2:x402"
    },
    "standard_refs": [
      {
        "standard_id": "ERC-8004",
        "status": "adapter_ready",
        "chain_id": 8453,
        "contract_address": null,
        "record_id": null,
        "adapter_version": "0.1.0",
        "last_verified_at": null,
        "assurance_level": "unverified"
      },
      {
        "standard_id": "ERC-8217",
        "status": "pending",
        "chain_id": 8453,
        "contract_address": null,
        "record_id": null,
        "adapter_version": "0.1.0",
        "last_verified_at": null,
        "assurance_level": "unverified"
      },
      {
        "standard_id": "ERC-8257",
        "status": "pending",
        "chain_id": null,
        "contract_address": null,
        "record_id": null,
        "adapter_version": "0.1.0",
        "last_verified_at": null,
        "assurance_level": "unverified"
      }
    ],
    "compatibility_summary": {
      "identity_bound": false,
      "owner_verified": false,
      "risk_checked": false,
      "tools_verified": false,
      "work_attested": false,
      "trust_updated": false
    },
    "adapter_versions": {
      "ERC-8004": "0.1.0",
      "ERC-8217": "0.1.0",
      "ERC-8257": "0.1.0"
    },
    "last_verified_at": null
  },
  "x402": {
    "schema_version": "0.1.0",
    "multipass_id": "mp_bendr_2",
    "endpoints": [
      {
        "endpoint_id": "lookup",
        "url": "/multipass/",
        "method": "GET",
        "description": "Sample CRED-gated profile lookup route for public static preview.",
        "price": {
          "amount": "1",
          "decimals": 18
        },
        "asset": "CRED",
        "chain_id": 8453,
        "provider": "bankr_x402_cloud",
        "settlement_reference_policy": "provider_receipt",
        "rate_limit": {
          "requests": 10,
          "window_seconds": 60,
          "burst": 2
        },
        "visibility": "public",
        "requires_owner_approval": false
      }
    ]
  },
  "receipt": {
    "schema_version": "0.1.0",
    "receipt_id": "receipt_bendr_lookup",
    "multipass_id": "mp_bendr_2",
    "endpoint_id": "lookup",
    "provider": "bankr_x402_cloud",
    "amount": "1",
    "asset": "CRED",
    "chain_id": 8453,
    "status": "settled",
    "created_at": "2026-06-24T00:00:00Z",
    "response_class": "success",
    "settlement_reference": null,
    "redaction_note": "Sample public static receipt. No private request or response payload is included."
  },
  "routes": {},
  "agentCards": [
    {
      "name": "Bendr 2.0",
      "tokenId": 1,
      "helixaId": "8453:1",
      "framework": "openclaw",
      "credScore": 80,
      "credTier": "Preferred",
      "verified": true,
      "profileUrl": "https://helixa.xyz/agent/1"
    },
    {
      "name": "Quigbot",
      "tokenId": 81,
      "helixaId": "8453:81",
      "framework": "openclaw",
      "credScore": 75,
      "credTier": "Prime",
      "verified": true,
      "profileUrl": "https://helixa.xyz/agent/81"
    },
    {
      "name": "E2ETest",
      "tokenId": 0,
      "helixaId": "8453:0",
      "framework": "openclaw",
      "credScore": 41,
      "credTier": "Marginal",
      "verified": false,
      "profileUrl": "https://helixa.xyz/agent/0"
    }
  ]
};

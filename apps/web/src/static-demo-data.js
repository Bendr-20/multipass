export const STATIC_DEMO_DATA = {
  "modeLabel": "Bendr 2.0 Public Profile",
  "sourceLabel": "Bendr public profile",
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
      "summary": "Public ownership state for this Multipass profile."
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
        "public_value": "Bendr 2.0 profile claim checked by the Helixa record.",
        "proof_reference": "record:profile-check",
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
        "proof_reference": "record:standard-ref",
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
        "public_value": "Route claim intentionally marked disputed in the record.",
        "proof_reference": "record:route-dispute",
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
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_quigbot_identity",
        "multipass_id": "mp_quigbot",
        "fragment_type": "attestation",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "historical_on_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "quigbot_identity",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:50:00Z",
          "reference_url": "https://helixa.xyz/agent/81"
        },
        "public_value": "Quigbot identity checked by the Helixa record.",
        "proof_reference": "record:quigbot-identity",
        "created_at": "2026-06-24T23:50:00Z",
        "updated_at": "2026-06-24T23:50:00Z",
        "verified_at": "2026-06-24T23:50:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_quigbot_cred",
        "multipass_id": "mp_quigbot",
        "fragment_type": "risk_summary",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "registry_import",
          "source_id": "quigbot_cred",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:50:00Z",
          "reference_url": "https://helixa.xyz/agent/81"
        },
        "public_value": "Quigbot Cred score 75, Prime tier.",
        "proof_reference": "record:quigbot-cred",
        "created_at": "2026-06-24T23:50:00Z",
        "updated_at": "2026-06-24T23:50:00Z",
        "verified_at": "2026-06-24T23:50:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_e2etest_identity",
        "multipass_id": "mp_e2etest",
        "fragment_type": "attestation",
        "status": "pending",
        "assurance_level": "self_attested",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "owner_submission",
          "source_id": "e2etest_identity",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:50:00Z",
          "reference_url": "https://helixa.xyz/agent/0"
        },
        "public_value": "E2ETest is a low-assurance test record.",
        "proof_reference": "record:e2etest-identity",
        "created_at": "2026-06-24T23:50:00Z",
        "updated_at": "2026-06-24T23:50:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_e2etest_cred",
        "multipass_id": "mp_e2etest",
        "fragment_type": "risk_summary",
        "status": "disputed",
        "assurance_level": "unverified",
        "visibility": "public",
        "transfer_policy": "never_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "e2etest_cred",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:50:00Z",
          "reference_url": "https://helixa.xyz/agent/0"
        },
        "public_value": "Lower trust context for a test agent.",
        "proof_reference": "record:e2etest-cred",
        "created_at": "2026-06-24T23:50:00Z",
        "updated_at": "2026-06-24T23:50:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_helixa_swarm_roster",
        "multipass_id": "mp_helixa_swarm",
        "fragment_type": "custody_record",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "pause_on_transfer",
        "source": {
          "source_type": "platform_check",
          "source_id": "helixa_swarm_roster",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:38:00Z",
          "reference_url": "https://helixa.xyz/multipass/"
        },
        "public_value": "Parent Multipass manages Bendr, Quigbot, and E2ETest agents as one collection roster.",
        "proof_reference": "record:helixa-swarm-roster",
        "created_at": "2026-06-24T23:38:00Z",
        "updated_at": "2026-06-24T23:38:00Z",
        "verified_at": "2026-06-24T23:38:00Z"
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_helixa_swarm_tools",
        "multipass_id": "mp_helixa_swarm",
        "fragment_type": "endpoint",
        "status": "pending",
        "assurance_level": "self_attested",
        "visibility": "public",
        "transfer_policy": "pause_on_transfer",
        "source": {
          "source_type": "owner_submission",
          "source_id": "helixa_swarm_tools",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:38:00Z",
          "reference_url": "https://helixa.xyz/multipass/"
        },
        "public_value": "Shared tool policy context for routes, permissions, and approvals across the swarm.",
        "proof_reference": "record:helixa-swarm-tools",
        "created_at": "2026-06-24T23:38:00Z",
        "updated_at": "2026-06-24T23:38:00Z",
        "endpoint_ref": {
          "endpoint_id": "swarm_policy",
          "url": "https://helixa.xyz/multipass/",
          "protocol": "api",
          "manifest_url": "/multipass/static/x402-manifest.json"
        }
      },
      {
        "schema_version": "0.1.0",
        "fragment_id": "frag_helixa_swarm_cred",
        "multipass_id": "mp_helixa_swarm",
        "fragment_type": "risk_summary",
        "status": "verified",
        "assurance_level": "platform_verified",
        "visibility": "public",
        "transfer_policy": "reverify_on_transfer",
        "source": {
          "source_type": "registry_import",
          "source_id": "helixa_swarm_cred",
          "issuer": "Helixa",
          "observed_at": "2026-06-24T23:38:00Z",
          "reference_url": "https://helixa.xyz/multipass/"
        },
        "public_value": "Aggregate Cred context summarizes the roster without erasing each agent's individual profile.",
        "proof_reference": "record:helixa-swarm-cred",
        "created_at": "2026-06-24T23:38:00Z",
        "updated_at": "2026-06-24T23:38:00Z",
        "verified_at": "2026-06-24T23:38:00Z",
        "verification_ref": {
          "verification_type": "swarm_cred_summary",
          "result": "passed",
          "issuer": "Helixa",
          "risk_level": "medium",
          "score": 78
        }

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
        "description": "Read public Multipass profile data from the Bendr profile.",
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
        "description": "Public Multipass profile record.",
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
      "policy_note": "Bendr public profile only."
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
        "description": "CRED-gated profile lookup route for a public Multipass profile.",
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
    "redaction_note": "Public receipt record. No private request or response payload is included."
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
      "profileUrl": "https://helixa.xyz/agent/1",
      "proofFragmentIds": ["frag_bendr_profile", "frag_bendr_endpoint", "frag_bendr_standard_ref", "frag_bendr_receipt_history", "frag_bendr_route_dispute", "frag_bendr_helixa_identity", "frag_bendr_cred_score"],
      "ownerSnapshot": {
        "owner": "0x3395...480E0",
        "operator": "Bendr runtime",
        "custodyEpoch": "Epoch 01",
        "permissionState": "Active owner-approved routes",
        "visibility": "Public profile, private credentials hidden",
        "recentChange": "Cred import refreshed",
        "reviewAction": "Review stale standards reference"
      },
      "changeReviewLedger": [
        { "event": "Cred import refreshed", "source": "Helixa API", "impact": "Cred context updated", "reviewState": "Verified" },
        { "event": "Standards reference stale", "source": "Standards profile", "impact": "Adapter claim needs a fresh check", "reviewState": "Reverify" },
        { "event": "Private credentials hidden", "source": "Private vault", "impact": "No public data exposed", "reviewState": "No public action" }
      ]
    },
    {
      "name": "Quigbot",
      "tokenId": 81,
      "helixaId": "8453:81",
      "framework": "openclaw",
      "credScore": 75,
      "credTier": "Prime",
      "verified": true,
      "profileUrl": "https://helixa.xyz/agent/81",
      "visual": {
        "imageUrl": "https://assets.bueno.art/images/3b04f823-b7a8-4965-b61e-8fe8a5d82bde/default/2432",
        "label": "Nakamigo #2432 visual identity",
        "tone": "prime"
      },
      "proofFragmentIds": ["frag_quigbot_identity", "frag_quigbot_cred"],
      "ownerSnapshot": {
        "owner": "0x17d7...bDe4",
        "operator": "Quigbot runtime",
        "custodyEpoch": "Epoch 01",
        "permissionState": "Active owner-approved routes",
        "visibility": "Public profile, private credentials hidden",
        "recentChange": "Identity and Cred context imported",
        "reviewAction": "No public review action"
      },
      "changeReviewLedger": [
        { "event": "Identity context imported", "source": "Helixa record", "impact": "Agent card updated", "reviewState": "Verified" },
        { "event": "Cred import refreshed", "source": "Helixa API", "impact": "Cred context updated", "reviewState": "Verified" },
        { "event": "Private credentials hidden", "source": "Private vault", "impact": "No public data exposed", "reviewState": "No public action" }
      ]
    },
    {
      "name": "E2ETest",
      "tokenId": 0,
      "helixaId": "8453:0",
      "framework": "openclaw",
      "credScore": 41,
      "credTier": "Marginal",
      "verified": false,
      "profileUrl": "https://helixa.xyz/agent/0",
      "proofFragmentIds": ["frag_e2etest_identity", "frag_e2etest_cred"],
      "ownerSnapshot": {
        "owner": "Owner pending",
        "operator": "Helixa record",
        "custodyEpoch": "Draft epoch",
        "permissionState": "Review required before active routes",
        "visibility": "Public test profile",
        "recentChange": "Low-assurance test record imported",
        "reviewAction": "Verify owner before production use"
      },
      "changeReviewLedger": [
        { "event": "Low-assurance test record imported", "source": "Helixa record", "impact": "Routes remain inactive", "reviewState": "Review required" },
        { "event": "Owner verification missing", "source": "Owner registry", "impact": "Production use blocked", "reviewState": "Reverify" },
        { "event": "Private credentials hidden", "source": "Private vault", "impact": "No public data exposed", "reviewState": "No public action" }
      ]
    },
    {
      "name": "Helixa Swarm",
      "tokenId": "swarm:helixa",
      "helixaId": "8453:swarm:helixa",
      "framework": "multi-agent",
      "credScore": 78,
      "credTier": "Prime",
      "verified": true,
      "profileUrl": "https://helixa.xyz/swarm/helixa",
      "subjectType": "swarm",
      "members": 3,
      "role": "Parent Multipass",
      "custody": "Custody epoch ready",
      "proofFragmentIds": ["frag_helixa_swarm_roster", "frag_helixa_swarm_tools", "frag_helixa_swarm_cred"],
      "roster": [
        { "name": "Bendr 2.0", "role": "Lead agent" },
        { "name": "Quigbot", "role": "Product agent" },
        { "name": "E2ETest", "role": "Test agent" }
      ],
      "sharedControls": ["Tool approval policy", "Route policy reference", "Owner approval required"],
      "aggregateCred": "Cred 78 Prime summarizes the roster without replacing individual agent scores.",
      "transferBehavior": "Permissions pause and tool routes reverify when custody changes.",
      "transferPreview": {
        "currentOwner": "0x3395...480E0",
        "custodyEpoch": "Epoch 03",
        "claimAction": "New owner claim required",
        "permissionsState": "Permissions paused",
        "toolAction": "Reverify shared tools",
        "privateAccessAction": "Rotate private access",
        "historyState": "History preserved",
        "credContinuity": "Cred continues with ownership-change context."
      },
      "ownerSnapshot": {
        "owner": "0x3395...480E0",
        "operator": "Helixa ops",
        "custodyEpoch": "Epoch 03",
        "permissionState": "Paused until owner review",
        "visibility": "Public profile, gated private data",
        "recentChange": "Transfer detected 2026-06-24",
        "reviewAction": "Reverify routes before resume"
      },
      "changeReviewLedger": [
        { "event": "Cred import refreshed", "source": "Helixa API", "impact": "Aggregate Cred context updated", "reviewState": "Verified" },
        { "event": "Transfer detected", "source": "Owner registry", "impact": "Permissions paused", "reviewState": "Review required" },
        { "event": "Shared route policy changed", "source": "Policy reference", "impact": "Routes paused for recheck", "reviewState": "Paused" },
        { "event": "Standards reference stale", "source": "Standards profile", "impact": "Adapter claim needs a fresh check", "reviewState": "Reverify" },
        { "event": "Private credentials hidden", "source": "Private vault", "impact": "No secrets or private credentials exposed", "reviewState": "No public action" }
      ]
    }
  ]
};

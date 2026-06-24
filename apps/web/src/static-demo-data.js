export const STATIC_DEMO_DATA = {
  modeLabel: 'Static Demo',
  sourceLabel: 'bundled fixture',
  profile: {
    schema_version: '0.1.0',
    multipass_id: 'mp_bendr_2',
    subject_type: 'agent',
    display_name: 'Bendr 2.0',
    slug: 'bendr-2',
    status: 'link_ready',
    owner_summary: {
      owner_state: 'unclaimed',
      verification_status: 'none',
      visibility: 'public',
      summary: 'Demo ownership state for public static preview.',
    },
    custody_epoch: null,
    public_fragments: [
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
          }
    ],

    cred_summary: {
      trust_state: 'none',
      attestation_count: 0,
      receipt_count: 1,
      last_updated_at: null,
      public_note: 'Sample public static data only.',
    },
    discovery_profile: {
      summary: 'Bendr 2.0 is a Helixa and Multipass demo agent for public preview and integration testing.',
      tags: ['bendr', 'helixa', 'multipass'],
      avatar_url: null,
      visibility: 'public',
    },
    standards_profile: {
      standards_profile_id: 'sp_bendr_2',
      supported_standard_ids: ['ERC-8004', 'ERC-8217', 'ERC-8126', 'ERC-8257', 'ERC-8183'],
      last_verified_at: null,
    },
    payment_profile: {
      accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
      x402_manifest_url: '/multipass/static/x402-manifest.json',
      paid_endpoints_enabled: false,
    },
    updated_at: '2026-06-24T00:00:00Z',
  },
  fragments: {
    subject_id: 'bendr-2',
    fragments: [
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
          }
    ],

  },
  card: {
    schema_version: '0.1.0',
    multipass_id: 'mp_bendr_2',
    name: 'Bendr 2.0',
    subject_type: 'agent',
    capabilities: [
      {
        capability_id: 'profile_lookup',
        label: 'Profile lookup',
        description: 'Read public Multipass profile data from the static preview.',
        visibility: 'public',
      },
    ],
    message_routes: [
      {
        route_id: 'static_demo',
        channel: 'web',
        address: '/multipass/',
        visibility: 'public',
      },
    ],
    service_endpoints: [
      {
        endpoint_id: 'lookup',
        url: '/multipass/',
        description: 'Static public profile preview.',
        visibility: 'public',
      },
    ],
    x402_manifest_url: '/multipass/static/x402-manifest.json',
    accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
    trust_summary: {
      identity_status: 'unverified',
      assurance_level: 'unverified',
      last_updated_at: null,
    },
    rate_limits: {
      requests: 60,
      window_seconds: 60,
      burst: 10,
    },
    contact_policy: {
      mode: 'approval_required',
      requires_owner_approval: true,
      policy_note: 'Static demo only.',
    },
    standards_refs: [
      { standard_id: 'ERC-8004', support_status: 'adapter_ready', record_id: null },
      { standard_id: 'ERC-8217', support_status: 'pending', record_id: null },
    ],
  },
  standards: {
    schema_version: '0.1.0',
    standards_profile_id: 'sp_bendr_2',
    multipass_id: 'mp_bendr_2',
    primary_refs: {
      erc8004_identity: null,
      controller_asset: null,
      x402_manifest: 'mp_bendr_2:x402',
    },
    standard_refs: [
      {
        standard_id: 'ERC-8004',
        status: 'adapter_ready',
        chain_id: 8453,
        contract_address: null,
        record_id: null,
        adapter_version: '0.1.0',
        last_verified_at: null,
        assurance_level: 'unverified',
      },
      {
        standard_id: 'ERC-8217',
        status: 'pending',
        chain_id: 8453,
        contract_address: null,
        record_id: null,
        adapter_version: '0.1.0',
        last_verified_at: null,
        assurance_level: 'unverified',
      },
      {
        standard_id: 'ERC-8257',
        status: 'pending',
        chain_id: null,
        contract_address: null,
        record_id: null,
        adapter_version: '0.1.0',
        last_verified_at: null,
        assurance_level: 'unverified',
      },
    ],
    compatibility_summary: {
      identity_bound: false,
      owner_verified: false,
      risk_checked: false,
      tools_verified: false,
      work_attested: false,
      trust_updated: false,
    },
    adapter_versions: {
      'ERC-8004': '0.1.0',
      'ERC-8217': '0.1.0',
      'ERC-8257': '0.1.0',
    },
    last_verified_at: null,
  },
  x402: {
    schema_version: '0.1.0',
    multipass_id: 'mp_bendr_2',
    endpoints: [
      {
        endpoint_id: 'lookup',
        url: '/multipass/',
        method: 'GET',
        description: 'Sample CRED-gated profile lookup route for public static preview.',
        price: {
          amount: '1',
          decimals: 18,
        },
        asset: 'CRED',
        chain_id: 8453,
        provider: 'bankr_x402_cloud',
        settlement_reference_policy: 'provider_receipt',
        rate_limit: {
          requests: 10,
          window_seconds: 60,
          burst: 2,
        },
        visibility: 'public',
        requires_owner_approval: false,
      },
    ],
  },
  receipt: {
    schema_version: '0.1.0',
    receipt_id: 'receipt_bendr_lookup',
    multipass_id: 'mp_bendr_2',
    endpoint_id: 'lookup',
    provider: 'bankr_x402_cloud',
    amount: '1',
    asset: 'CRED',
    chain_id: 8453,
    status: 'settled',
    created_at: '2026-06-24T00:00:00Z',
    response_class: 'success',
    settlement_reference: null,
    redaction_note: 'Sample public static receipt. No private request or response payload is included.',
  },
  routes: {},
};

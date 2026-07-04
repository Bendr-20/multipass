const SCHEMA_VERSION = '0.1.0';
const X401_HEADERS = {
  request: 'PROOF-REQUEST',
  response: 'PROOF-RESPONSE',
  result: 'PROOF-RESULT',
};
const DEFAULT_BOUNDARY = 'Public x401 metadata does not expose private credentials or imply a commercial relationship with any issuer.';

export function createHelixaX401CompatibilityManifest(multipassId, options = {}) {
  const displayName = String(options.displayName ?? 'this Multipass profile').trim() || 'this Multipass profile';
  return {
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    x401_supported: true,
    proof_challenge_protocol: 'x401',
    current_header_names: X401_HEADERS,
    trusted_issuers: [
      {
        issuer_id: 'helixa',
        name: 'Helixa',
        status: 'supported',
        reference_url: 'https://helixa.xyz',
      },
    ],
    proof_requirements: [
      {
        requirement_id: 'human_authorization',
        description: `x401-compatible public identity or delegated-authority proof metadata for ${displayName}. No private credential material is exposed.`,
        credential_format: 'openid4vp',
        claim_types: ['personhood', 'delegated_authority'],
        assurance_level: 'issuer_attested',
        accepted_issuers: ['helixa'],
        required_before_payment: true,
        visibility: 'public',
      },
    ],
    route_policies: [
      {
        route_id: 'lookup',
        x401_required: true,
        x402_after_x401: true,
        scope: 'Satisfy identity or delegated-authority proof before high-trust or paid Multipass agent actions.',
      },
    ],
    boundaries: [DEFAULT_BOUNDARY],
  };
}

export function deriveX401ManifestFromFragments(multipassId, fragments = []) {
  const publicX401Fragments = (fragments ?? [])
    .filter((fragment) => fragment?.visibility === 'public')
    .filter((fragment) => fragment?.x401_proof_ref?.protocol === 'x401');

  const trustedIssuers = deriveTrustedIssuers(publicX401Fragments);
  const proofRequirements = publicX401Fragments.map((fragment) => createProofRequirement(fragment));
  const routePolicies = publicX401Fragments.map((fragment) => createRoutePolicy(fragment));

  return {
    schema_version: SCHEMA_VERSION,
    multipass_id: multipassId,
    x401_supported: proofRequirements.length > 0,
    proof_challenge_protocol: 'x401',
    current_header_names: X401_HEADERS,
    trusted_issuers: trustedIssuers,
    proof_requirements: proofRequirements,
    route_policies: routePolicies,
    boundaries: [DEFAULT_BOUNDARY],
  };
}

function deriveTrustedIssuers(fragments) {
  const issuers = new Map();
  for (const fragment of fragments) {
    const ref = fragment.x401_proof_ref ?? {};
    const issuerId = normalizeIssuerId(ref.issuer_id ?? fragment.source?.issuer ?? 'unknown');
    if (issuers.has(issuerId)) continue;
    issuers.set(issuerId, {
      issuer_id: issuerId,
      name: String(ref.issuer_name ?? fragment.source?.issuer ?? issuerId).trim() || issuerId,
      status: fragment.status === 'verified' ? 'supported' : 'planned',
      reference_url: fragment.source?.reference_url ?? null,
    });
  }
  return [...issuers.values()];
}

function createProofRequirement(fragment) {
  const ref = fragment.x401_proof_ref ?? {};
  const issuerId = normalizeIssuerId(ref.issuer_id ?? fragment.source?.issuer ?? 'unknown');
  return {
    requirement_id: String(ref.requirement_id ?? fragment.fragment_id ?? 'x401_proof').trim(),
    description: String(fragment.public_value ?? 'x401-compatible public proof metadata for route-level identity or delegated authority.').trim(),
    credential_format: normalizeCredentialFormat(ref.credential_format),
    claim_types: normalizeStringList(ref.claim_types, ['delegated_authority']),
    assurance_level: fragment.assurance_level ?? 'issuer_attested',
    accepted_issuers: [issuerId],
    required_before_payment: ref.required_before_payment ?? true,
    visibility: fragment.visibility === 'gated' ? 'gated' : 'public',
  };
}

function createRoutePolicy(fragment) {
  const ref = fragment.x401_proof_ref ?? {};
  return {
    route_id: String(ref.route_id ?? ref.requirement_id ?? fragment.fragment_id ?? 'x401_proof').trim(),
    x401_required: true,
    x402_after_x401: ref.required_before_payment ?? true,
    scope: String(ref.scope ?? 'x401 proof should be satisfied before high-trust or paid agent action.').trim(),
  };
}

function normalizeIssuerId(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function normalizeCredentialFormat(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['openid4vp', 'w3c_vc', 'proof_satisfaction_token'].includes(normalized) ? normalized : 'unknown';
}

function normalizeStringList(value, fallback) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map((item) => String(item ?? '').trim()).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

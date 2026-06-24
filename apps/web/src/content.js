export const DEMO_SUBJECT = {
  label: 'Bendr 2.0',
  slug: 'bendr-2',
  receiptId: 'receipt_bendr_lookup',
};

export const HERO_COPY = {
  eyebrow: 'MULTIPASS RECORD',
  headline: 'Verifiable identity records for autonomous agents.',
  body: 'Multipass turns agent identity, public proof, standards, and access receipts into one portable trust object.',
  note: 'Local demo reading the Bendr 2.0 fixture.',
};

export function summarizeProfile(profile) {
  return `${profile.display_name} is a ${profile.subject_type} profile with status ${profile.status} and trust state ${profile.cred_summary?.trust_state ?? 'none'}.`;
}

export function createStoryCards(data) {
  const publicFragments = filterPublicFragments(data.fragments);

  return [
    {
      title: 'Identity Graph',
      label: `${publicFragments.length} public fragments`,
      body: 'Public fragments make the agent legible without exposing private records.',
    },
    {
      title: 'Standards Spine',
      label: `${data.standards.standard_refs.length} standard refs`,
      body: 'Standards references sit directly inside the profile record instead of living as loose claims.',
    },
    {
      title: 'Access and Receipts',
      label: `${data.x402.endpoints.length} x402 endpoint`,
      body: 'Endpoint access can produce receipt evidence, kept close to the identity object.',
    },
  ];
}

export function createProofCards(data) {
  const publicFragments = filterPublicFragments(data.fragments);
  const publicFragmentDocument = createPublicFragmentDocument(data.fragments, publicFragments);

  return [
    {
      title: 'Profile',
      status: data.profile.status,
      summary: summarizeProfile(data.profile),
      json: redactPrivateData(data.profile),
    },
    {
      title: 'Public Fragments',
      status: `${publicFragments.length} public`,
      summary: publicFragments.map((fragment) => fragment.fragment_id).join(', ') || 'No public fragments returned.',
      json: publicFragmentDocument,
    },
    {
      title: 'Agent Card',
      status: `${data.card.capabilities.length} capabilities`,
      summary: `${data.card.service_endpoints.length} service endpoint records available.`,
      json: redactPrivateData(data.card),
    },
    {
      title: 'Standards',
      status: `${data.standards.standard_refs.length} refs`,
      summary: formatStandards(data.standards.standard_refs),
      json: redactPrivateData(data.standards),
    },
    {
      title: 'x402',
      status: `${data.x402.endpoints.length} endpoints`,
      summary: data.x402.endpoints.map((endpoint) => `${endpoint.endpoint_id} accepts ${endpoint.asset}`).join(', ') || 'No endpoints returned.',
      json: redactPrivateData(data.x402),
    },
    {
      title: 'Receipt',
      status: data.receipt.status,
      summary: `${data.receipt.receipt_id} records a ${data.receipt.response_class ?? 'unknown'} response.`,
      json: redactPrivateData(data.receipt),
    },
  ];
}


function createPublicFragmentDocument(fragmentDocument, publicFragments) {
  const publicDocument = { fragments: redactPrivateData(publicFragments) };
  for (const key of ['multipass_id', 'profile_id', 'subject_id', 'schema_version']) {
    if (fragmentDocument[key] !== undefined) publicDocument[key] = fragmentDocument[key];
  }
  return publicDocument;
}

function redactPrivateData(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => redactPrivateData(item))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') return value;
  if (value.visibility === 'private') return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateKey(key))
      .map(([key, item]) => [key, redactPrivateData(item)])
      .filter(([, item]) => item !== undefined),
  );
}

function isPrivateKey(key) {
  const normalized = key.toLowerCase();
  return normalized.startsWith('private') || normalized.includes('_private');
}

function filterPublicFragments(fragmentDocument) {
  return (fragmentDocument.fragments ?? []).filter((fragment) => fragment.visibility === 'public');
}

function formatStandards(standardRefs) {
  return standardRefs.map((ref) => `${ref.standard_id}: ${ref.status}`).join(', ') || 'No standard refs returned.';
}

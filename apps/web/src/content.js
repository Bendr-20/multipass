export const DEMO_SUBJECT = {
  label: 'Bendr 2.0',
  slug: 'bendr-2',
  receiptId: 'receipt_bendr_lookup',
};

export const HERO_COPY = {
  eyebrow: 'MULTIPASS DEMO',
  headline: 'Portable identity and trust profiles for agents.',
  body: 'Multipass connects identity fragments, standards, work history, access rails, and trust evidence into one readable agent profile.',
  note: 'Running against the local Multipass API.',
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
      body: 'Profile data and public identity fragments make the agent legible without exposing private records.',
    },
    {
      title: 'Standards Spine',
      label: `${data.standards.standard_refs.length} standard refs`,
      body: formatStandards(data.standards.standard_refs),
    },
    {
      title: 'Access and Receipts',
      label: `${data.x402.endpoints.length} x402 endpoint`,
      body: `Endpoint access can produce receipt evidence. Latest receipt status: ${data.receipt.status}.`,
    },
  ];
}

export function createProofCards(data) {
  const publicFragments = filterPublicFragments(data.fragments);
  const publicFragmentDocument = {
    ...data.fragments,
    fragments: publicFragments,
  };

  return [
    {
      title: 'Profile',
      status: data.profile.status,
      summary: summarizeProfile(data.profile),
      json: data.profile,
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
      json: data.card,
    },
    {
      title: 'Standards',
      status: `${data.standards.standard_refs.length} refs`,
      summary: formatStandards(data.standards.standard_refs),
      json: data.standards,
    },
    {
      title: 'x402',
      status: `${data.x402.endpoints.length} endpoints`,
      summary: data.x402.endpoints.map((endpoint) => `${endpoint.endpoint_id} accepts ${endpoint.asset}`).join(', ') || 'No endpoints returned.',
      json: data.x402,
    },
    {
      title: 'Receipt',
      status: data.receipt.status,
      summary: `${data.receipt.receipt_id} records a ${data.receipt.response_class ?? 'unknown'} response.`,
      json: data.receipt,
    },
  ];
}

function filterPublicFragments(fragmentDocument) {
  return (fragmentDocument.fragments ?? []).filter((fragment) => fragment.visibility === 'public');
}

function formatStandards(standardRefs) {
  return standardRefs.map((ref) => `${ref.standard_id}: ${ref.status}`).join(', ') || 'No standard refs returned.';
}

export const DEMO_SUBJECT = {
  label: 'Bendr 2.0',
  slug: 'bendr-2',
  receiptId: 'receipt_bendr_lookup',
};

export const V01_COPY = {
  prototypeLabel: 'Internal Prototype',
  audience: 'Built first for agent builders inspecting identity, proof, standards, and access records.',
  productSentence: 'Multipass is a portable trust profile for agents, combining identity, public proof, standards support, and access receipts into one inspectable record.',
};

export const HERO_COPY = {
  eyebrow: 'MULTIPASS RECORD',
  headline: 'Portable trust profiles for agents.',
  body: V01_COPY.productSentence,
  note: 'Internal prototype reading the Bendr 2.0 fixture.',
};

export function createClaritySections() {
  return [
    {
      title: 'What this record proves',
      body: 'This record shows how an agent profile can bundle identity, public proof, standards references, endpoint metadata, and access receipts in one inspectable shape.',
    },
    {
      title: 'What is static demo data',
      body: 'This page uses a safe Bendr fixture so the route can be reviewed with no live auth, no live API, no contract read, and no live settlement service.',
    },
    {
      title: 'What is planned but not live',
      body: 'Owner editing, live verification, contract reads, paid settlement, custody flows, collection support, and swarm support are planned later slices, not live behavior here.',
    },
  ];
}

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
      why: 'The profile is the canonical summary agents, apps, and builders can resolve first.',
      json: redactPrivateData(data.profile),
    },
    {
      title: 'Public Fragments',
      status: `${publicFragments.length} public`,
      summary: publicFragments.map((fragment) => fragment.fragment_id).join(', ') || 'No public fragments returned.',
      why: 'Fragments show the public pieces that support the profile without exposing private records.',
      json: publicFragmentDocument,
    },
    {
      title: 'Agent Card',
      status: `${data.card.capabilities.length} capabilities`,
      summary: `${data.card.service_endpoints.length} service endpoint records available.`,
      why: 'The agent card gives machines a compact view of capabilities, routes, endpoints, and trust context.',
      json: redactPrivateData(data.card),
    },
    {
      title: 'Standards',
      status: `${data.standards.standard_refs.length} refs`,
      summary: formatStandards(data.standards.standard_refs),
      why: 'Standards references show compatibility targets and adapter state without claiming every adapter is live.',
      json: redactPrivateData(data.standards),
    },
    {
      title: 'x402',
      status: `${data.x402.endpoints.length} endpoints`,
      summary: data.x402.endpoints.map((endpoint) => `${endpoint.endpoint_id} accepts ${endpoint.asset}`).join(', ') || 'No endpoints returned.',
      why: 'x402 metadata explains planned access rails and accepted assets without implying live settlement here.',
      json: redactPrivateData(data.x402),
    },
    {
      title: 'Receipt',
      status: data.receipt.status,
      summary: `${data.receipt.receipt_id} records a ${data.receipt.response_class ?? 'unknown'} response.`,
      why: 'Receipt evidence records that an access event can be attached to the profile without becoming trust by itself.',
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

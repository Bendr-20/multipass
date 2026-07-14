export const DEMO_SUBJECT = {
  label: 'Bendr 2.0',
  slug: 'bendr-2',
  receiptId: 'receipt_bendr_lookup',
};

export const V01_COPY = {
  prototypeLabel: '',
  audience: 'Built first for agent builders and agent teams; marketplace compatibility is a secondary display use case.',
  productSentence: 'Multipass is a portable public agent profile combining identity, public proof, standards support, custody context, and access receipts into one inspectable record.',
};


export const V02_COPY = {
  title: 'Inspect proof',
  eyebrow: 'PROOF LAYER',
  body: 'Open the proof when a card needs verification. Each signal keeps its own visibility, source, assurance level, and transfer rule.',
};

export const FRAGMENT_LEGENDS = {
  fragmentType: {
    endpoint: 'Endpoint fragments describe routes, protocols, manifests, and access surfaces an agent may expose.',
    attestation: 'Attestation fragments describe claims or checks from an owner, platform, issuer, or verifier.',
    receipt: 'Receipt fragments describe access or payment evidence without making that evidence trust by itself.',
    standard_ref: 'Standard reference fragments connect the profile to external standards without implying every adapter is live.',
    verification_result: 'Verification result fragments record review outcomes, risk context, or disputed checks.',
    custody_record: 'Custody record fragments describe owner or controller epochs without transferring private authority.',
    risk_summary: 'Risk summary fragments carry imported Cred or safety context without collapsing identity into a single score.',
    social: 'Social fragments connect public handles to an agent profile through a named source or verification path.',
  },
  visibility: {
    public: 'Visible to anyone and safe for profile cards, indexers, and partner systems.',
    gated: 'Released only after token, payment, relationship, or allowlist policy is satisfied.',
    private: 'Visible only to approved owners, operators, or internal systems with a clear need.',
    hidden: 'Not discoverable through public or gated surfaces, reserved for safety or integrity review.',
  },
  status: {
    verified: 'Checked by a platform, issuer, contract read, or other explicit verification path.',
    pending: 'Submitted or referenced, but still waiting for review or a stronger proof source.',
    stale: 'Previously useful, but old enough that builders should request a fresh check.',
    historical: 'Kept as provenance or prior evidence, not treated as active authority.',
    disputed: 'Flagged for review because the claim, source, or interpretation is contested.',
  },
  assurance: {
    unverified: 'Unverified means the fragment has no stronger source than a raw claim or placeholder.',
    self_attested: 'Self attested means the owner or agent supplied the claim without outside verification.',
    platform_verified: 'Platform verified means Helixa or another platform checked the fragment through a defined process.',
    cryptographic: 'Cryptographic means the fragment is backed by a signature, hash, or comparable cryptographic proof.',
    issuer_attested: 'Issuer attested means a named issuer supplied or signed the supporting evidence.',
    onchain_verified: 'Onchain verified means the fragment was checked against a chain record or contract read.',
  },
  transferPolicy: {
    reverify_on_transfer: 'Reverify on transfer means a new owner must confirm the fragment before it is treated as current.',
    pause_on_transfer: 'Pause on transfer means active authority should stop until the new owner or operator approves it.',
    historical_on_transfer: 'Historical on transfer means provenance stays visible, but it does not grant active authority.',
    never_transfer: 'Never transfer means the fragment is bound to the prior controller or context and must not move.',
  },
};


export function createAgentCarousel(data) {
  const fallback = {
    name: data.profile.display_name,
    tokenId: data.profile.slug ?? data.profile.multipass_id,
    helixaId: data.profile.slug ?? data.profile.multipass_id,
    framework: 'unknown',
    credScore: null,
    credTier: data.profile.cred_summary?.trust_state ?? 'none',
    verified: data.card.trust_summary?.identity_status === 'verified',
    profileUrl: null,
  };

  const cards = (data['agentCards']?.length ? data['agentCards'] : [fallback]).map((card) => ({
    name: card.name,
    tokenId: card.tokenId,
    helixaId: card.helixaId ?? String(card.tokenId ?? card.name),
    framework: card.framework ?? 'unknown',
    credScore: card.credScore ?? null,
    credTier: card.credTier ?? 'Unrated',
    credLabel: card.credScore === null || card.credScore === undefined ? 'Cred pending' : `Cred ${card.credScore}`,
    verified: Boolean(card.verified),
    verifiedLabel: card.verified ? 'verified' : 'unverified',
    profileUrl: card.profileUrl ?? null,
    subjectLabel: card.subjectType ?? 'agent',
    memberLabel: formatMemberLabel(card.members),
    role: card.role ?? defaultRoleForCard(card),
    custody: card.custody ?? 'Owner verified',
    detailMode: card.subjectType === 'swarm' ? 'swarm' : 'agent',
    roster: Array.isArray(card.roster) ? card.roster.map((member) => ({
      name: member.name,
      role: member.role ?? 'Member agent',
    })) : [],
    sharedControls: normalizePolicyReferences(card.sharedControls),
    aggregateCred: card.aggregateCred ?? null,
    transferBehavior: card.transferBehavior ?? null,
    ownerSnapshot: createOwnerCustodySnapshot(card),
    changeReviewLedger: createChangeReviewLedger(card),
    transferPreview: normalizeTransferPreview(card.transferPreview, card),
    proofFragmentIds: Array.isArray(card.proofFragmentIds) ? card.proofFragmentIds : [],
    intuition: normalizeIntuitionContext(card.intuition),
    visual: createProfileCardVisual(card),
    proofSummary: card.proofSummary ?? createProfileProofSummary(card),
  }));

  return {
    eyebrow: 'PROFILE GALLERY',
    title: 'Example public agent profiles.',
    body: 'Each card gives agents, humans, organizations, swarms, apps, and directories a quick read on identity, framework, profile route, and public proof. Trust state and Cred context stay secondary for verification.',
    cards,
  };
}

function normalizeIntuitionContext(intuition) {
  if (!intuition || typeof intuition !== 'object') return null;
  const status = String(intuition.status ?? '').trim();
  const fallbackLabel = status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  const label = String(intuition.label ?? fallbackLabel).trim();
  if (!status && !label) return null;
  return {
    status: status || null,
    label: label || null,
    canonicalAgentId: intuition.canonicalAgentId ?? null,
    resolverUrl: intuition.resolverUrl ?? intuition.resolver ?? null,
    note: intuition.note ?? null,
  };
}

export function createFragmentTrustMap(data, selectedAgent = null) {
  const fragments = selectPublicFragments(data.fragments, selectedAgent);
  return {
    title: V02_COPY.title,
    eyebrow: V02_COPY.eyebrow,
    body: V02_COPY.body,
    cards: fragments.map(createFragmentCard),
    legends: FRAGMENT_LEGENDS,
    emptyPrivateNote: 'Private and hidden fragments are not rendered in this public profile.',
  };
}

function createFragmentCard(fragment) {
  const typeLabel = formatEnumLabel(fragment.fragment_type);
  const protocol = fragment.endpoint_ref?.protocol ? `${fragment.endpoint_ref.protocol} ` : '';
  const source = fragment.source?.source_type ? formatEnumLabel(fragment.source.source_type) : 'Unknown source';
  const issuer = fragment.source?.issuer ? ` by ${fragment.source.issuer}` : '';
  const publicValue = fragment.public_value ?? 'No public value returned.';

  return {
    id: fragment.fragment_id,
    title: formatFragmentTitle(fragment),
    type: fragment.fragment_type,
    typeLabel,
    status: fragment.status,
    statusLabel: formatEnumLabel(fragment.status),
    statusExplanation: FRAGMENT_LEGENDS.status[fragment.status] ?? 'Status explanation unavailable.',
    assurance: fragment.assurance_level,
    assuranceLabel: formatEnumLabel(fragment.assurance_level),
    assuranceExplanation: FRAGMENT_LEGENDS.assurance[fragment.assurance_level] ?? 'Assurance explanation unavailable.',
    visibility: fragment.visibility,
    visibilityExplanation: FRAGMENT_LEGENDS.visibility[fragment.visibility] ?? 'Visibility explanation unavailable.',
    transferPolicy: fragment.transfer_policy,
    transferPolicyLabel: formatEnumLabel(fragment.transfer_policy),
    transferPolicyExplanation: FRAGMENT_LEGENDS.transferPolicy[fragment.transfer_policy] ?? 'Transfer policy explanation unavailable.',
    sourceLabel: `${source}${issuer}`,
    summary: createFragmentSummary(fragment, { typeLabel, protocol, source, issuer, publicValue }),
    publicValue,
  };
}

function createFragmentSummary(fragment, context) {
  const { typeLabel, protocol, source, issuer, publicValue } = context;
  const sourceLabel = `${source}${issuer}`;
  const defaultSource = fragment.endpoint_ref
    ? `${typeLabel} for ${protocol}endpoint from ${sourceLabel}.`
    : `${typeLabel} from ${sourceLabel}.`;
  const lowerPublicValue = publicValue.toLowerCase();

  if (lowerPublicValue.includes('intuition graph')) {
    return `Intuition graph status for this Multipass. It checks whether this agent has an ERC-8004 reputation record on Intuition. ${publicValue}`;
  }

  switch (fragment.fragment_type) {
    case 'risk_summary':
      return `Cred and risk context for this Multipass. ${publicValue}`;
    case 'social':
      return `Public social or contact route connected to this Multipass. ${publicValue}`;
    case 'attestation':
      return `Identity or claim check for this Multipass. ${publicValue}`;
    case 'endpoint':
      return `Callable ${protocol || ''}endpoint or service route for this Multipass. ${publicValue}`;
    case 'standard_ref':
      return `External standard or reputation reference for this Multipass. ${publicValue}`;
    case 'custody_record':
      return `Owner, operator, or roster context for this Multipass. ${publicValue}`;
    case 'receipt':
      return `Access or payment receipt connected to this Multipass. ${publicValue}`;
    case 'verification_result':
      return `Review outcome or dispute context for this Multipass. ${publicValue}`;
    default:
      return publicValue === 'No public value returned.' ? defaultSource : `${defaultSource} ${publicValue}`;
  }
}


export function createChangeReviewLedger(card) {
  const rows = normalizeChangeReviewRows(card.changeReviewLedger);
  if (rows.length === 0) return null;

  return {
    title: 'Change + Review Ledger',
    eyebrow: 'RECENT CHANGES / REVIEW QUEUE',
    rows,
    note: 'Readable state only. Multipass shows change history, source, impact, and review state without executing approvals or transferring authority.',
  };
}

function normalizeChangeReviewRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      event: row.event ?? 'Change recorded',
      source: row.source ?? 'Source not published',
      impact: row.impact ?? 'Impact not published',
      reviewState: row.reviewState ?? row.state ?? 'Review state not published',
      tone: normalizeLedgerTone(row.reviewState ?? row.state),
    }));
}

function normalizeLedgerTone(state) {
  const normalized = String(state ?? '').toLowerCase();
  if (normalized.includes('verified')) return 'verified';
  if (normalized.includes('required') || normalized.includes('reverify')) return 'review';
  if (normalized.includes('paused')) return 'paused';
  if (normalized.includes('no public action')) return 'neutral';
  return 'neutral';
}


export function createOwnerCustodySnapshot(card) {
  const snapshot = card.ownerSnapshot ?? {};
  return {
    title: 'Owner & Custody Snapshot',
    owner: snapshot.owner ?? 'Owner not published',
    operator: snapshot.operator ?? (card.subjectType === 'swarm' ? 'Operator not published' : 'Agent operator not published'),
    custodyEpoch: snapshot.custodyEpoch ?? card.custody ?? 'Custody epoch pending',
    permissionState: snapshot.permissionState ?? 'Permission state not published',
    visibility: snapshot.visibility ?? 'Public profile only',
    recentChange: snapshot.recentChange ?? 'No recent public change',
    reviewAction: snapshot.reviewAction ?? 'No public review action',
    note: snapshot.note ?? 'State reference only. Multipass shows ownership, custody, visibility, and review context without executing approvals or transferring authority.',
  };
}

function normalizeTransferPreview(preview, card) {

  if (!preview) return null;

  return {
    title: 'Ownership State',
    currentOwner: preview.currentOwner ?? 'Owner pending',
    custodyEpoch: preview.custodyEpoch ?? card.custody ?? 'Custody epoch pending',
    claimAction: normalizeClaimAction(preview.claimAction),
    permissionsState: preview.permissionsState ?? 'Permissions paused',
    toolAction: preview.toolAction ?? 'Reverify tools',
    privateAccessAction: preview.privateAccessAction ?? 'Rotate private access',
    historyState: preview.historyState ?? 'History preserved',
    credContinuity: preview.credContinuity ?? 'Cred continues with ownership-change context.',
    note: preview.note ?? 'Ownership state preserves public history but does not transfer secrets, private credentials, or active authority.',
  };
}

function normalizePolicyReferences(controls) {
  if (!Array.isArray(controls)) return [];
  const labels = {
    'Tool approvals': 'Tool approval policy',
    'Route policy': 'Route policy reference',
    'Owner approval': 'Owner approval required',
  };
  return controls.map((control) => labels[control] ?? control);
}

function normalizeClaimAction(action) {
  if (!action || action === 'Claim swarm' || action === 'Claim agent') return 'New owner claim required';
  return action;
}

function defaultRoleForCard(card) {
  if (String(card.tokenId) === '1' || /bendr/i.test(card.name ?? '')) return 'Lead agent';
  if (String(card.tokenId) === '81' || /quigbot/i.test(card.name ?? '')) return 'Product agent';
  if (card.subjectType === 'swarm') return 'Parent Multipass';
  return 'Agent profile';
}

function createProfileCardVisual(card) {
  const tokenId = card.tokenId;
  const isNumericToken = /^\d+$/.test(String(tokenId ?? ''));
  const type = card.visual?.type ?? card.subjectType ?? 'agent';
  const tone = card.visual?.tone ?? (type === 'swarm'
    ? 'swarm'
    : card.verified
      ? String(card.credTier ?? 'verified').toLowerCase()
      : 'review');
  const explicitImageUrl = safeProfileVisualUrl(
    card.visual?.imageUrl
    ?? card.visual?.image_url
    ?? card.avatarUrl
    ?? card.avatar_url
    ?? card.discovery_profile?.avatar_url,
  );
  return {
    type,
    tone,
    initials: card.visual?.initials ?? initialsForName(card.name),
    imageUrl: explicitImageUrl ?? (isNumericToken ? `https://api.helixa.xyz/api/v2/aura/${tokenId}.png` : null),
    label: card.visual?.label ?? `${card.name} visual identity`,
  };
}

function safeProfileVisualUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function initialsForName(name) {
  const words = String(name ?? 'MP').split(/\s+/).filter(Boolean);
  if (!words.length) return 'MP';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || 'MP';
}

function createProfileProofSummary(card) {
  const count = Array.isArray(card.proofFragmentIds) ? card.proofFragmentIds.length : 0;
  const label = count === 1 ? 'public proof signal' : 'public proof signals';
  return count > 0 ? `${count} ${label}` : 'Proof pending';
}

function formatMemberLabel(members) {
  if (members === null || members === undefined) return '1 agent';
  return `${members} ${Number(members) === 1 ? 'agent' : 'agents'}`;
}

function formatFragmentTitle(fragment) {
  const known = {
    frag_bendr_profile: 'Bendr profile check',
    frag_bendr_endpoint: 'Bendr API route',
    frag_bendr_standard_ref: 'Standards reference',
    frag_bendr_receipt_history: 'Receipt history',
    frag_bendr_route_dispute: 'Route review flag',
    frag_bendr_helixa_identity: 'Helixa AgentDNA identity',
    frag_bendr_cred_score: 'Cred score import',
    frag_bendr_social_x: 'Social handle check',
    frag_quigbot_identity: 'Quigbot identity',
    frag_quigbot_cred: 'Quigbot Cred context',
    frag_helixa_swarm_roster: 'Swarm roster',
    frag_helixa_swarm_tools: 'Shared tool policy',
    frag_helixa_swarm_cred: 'Aggregate Cred context',
  };
  if (known[fragment.fragment_id]) return known[fragment.fragment_id];
  return formatEnumLabel(fragment.fragment_type);
}

function formatEnumLabel(value) {
  const parts = String(value ?? 'unknown').split('_').filter(Boolean);
  if (parts.length === 0) return 'Unknown';
  return [parts[0].charAt(0).toUpperCase() + parts[0].slice(1), ...parts.slice(1)].join(' ');
}

export const HERO_COPY = {
  eyebrow: 'MULTIPASS',
  headline: 'Portable public agent profiles for AI-native systems.',
  body: 'Multipass gives agents, humans, swarms, collections, projects, organizations, and AI-native systems a visual identity graph where a public agent profile combines identity, ownership and custody context, routes, public proof, Cred trust context, and discovery metadata.',
  note: 'Built from Helixa AgentDNA examples and live resolver data.',
};

export function createClaritySections() {
  return [
    {
      title: 'What is Multipass?',
      body: 'Multipass is a portable public agent profile for agents, humans, swarms, collections, projects, organizations, apps, directories, and marketplace display surfaces that need to decide who they are dealing with.',
    },
    {
      title: 'What the card shows',
      body: 'The card gives the fast read: name, Helixa ID, public agent profile route, verified status, framework, and secondary trust context such as trust state and Cred context.',
    },
    {
      title: 'What proof adds',
      body: 'Proof records explain where the public agent profile comes from without making raw protocol details the first thing people see.',
    },
  ];
}

export function summarizeProfile(profile) {
  return `${profile.display_name} is a ${profile.subject_type} profile with status ${profile.status} and trust state ${profile.cred_summary?.trust_state ?? 'none'}.`;
}

export function createStoryCards(data) {
  const publicFragments = filterPublicFragments(data.fragments);
  const x401 = normalizeX401Manifest(data.x401);

  return [
    {
      title: 'Card first',
      label: 'Fast read',
      body: 'Name, Helixa ID, Cred, framework, and profile route should be understandable at a glance.',
    },
    {
      title: 'Proof below',
      label: 'Selected proof',
      body: 'Fragments explain why the selected card should be trusted without dumping raw protocol detail up front.',
    },
    {
      title: 'Portable by design',
      label: x401.x401_supported ? `x401 + ${data.x402.endpoints.length} x402 endpoint` : `${data.x402.endpoints.length} x402 endpoint`,
      body: x401.x401_supported
        ? 'Apps can read the same public agent profile across discovery, identity proof, access, settlement, and custody flows.'
        : 'Apps can read the same public agent profile across discovery, access, settlement, and custody flows.',
    },
  ];
}

export function createProofCards(data, selectedAgent = null) {
  const publicFragments = selectPublicFragments(data.fragments, selectedAgent);
  const publicFragmentDocument = createPublicFragmentDocument(data.fragments, publicFragments);
  const x401 = normalizeX401Manifest(data.x401);

  return [
    {
      title: 'Profile',
      status: data.profile.status,
      summary: summarizeProfile(data.profile),
      why: 'The public agent profile is the canonical summary agents, apps, and builders can resolve first.',
      json: redactPrivateData(data.profile),
    },
    {
      title: 'Public Fragments',
      status: `${publicFragments.length} public`,
      summary: publicFragments.length ? `${publicFragments.length} readable proof signals for ${selectedAgent?.name ?? data.profile.display_name}.` : `No public fragments returned for ${selectedAgent?.name ?? data.profile.display_name}.`,
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
      title: 'x401',
      status: x401.x401_supported ? `${x401.proof_requirements.length} requirements` : 'not required',
      summary: formatX401Requirements(x401),
      why: 'x401 metadata explains identity or authority proof requirements without exposing private credentials or implying any issuer relationship.',
      json: redactPrivateData(x401),
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
      why: 'Receipt evidence records that an access event can be attached to the public agent profile without becoming trust by itself.',
      json: redactPrivateData(data.receipt),
    },
  ];
}


function normalizeX401Manifest(x401) {
  return {
    x401_supported: Boolean(x401?.x401_supported),
    proof_requirements: Array.isArray(x401?.proof_requirements) ? x401.proof_requirements : [],
    ...(x401 && typeof x401 === 'object' ? x401 : {}),
  };
}

function formatX401Requirements(x401) {
  if (!x401.x401_supported) return 'No x401 proof requirement published.';
  return x401.proof_requirements
    .map((requirement) => requirement.description || requirement.requirement_id)
    .filter(Boolean)
    .join(', ') || 'x401 proof challenge metadata is published.';
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
  if (isNonPublicVisibility(value.visibility)) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateKey(key))
      .map(([key, item]) => [key, redactPrivateData(item)])
      .filter(([, item]) => item !== undefined),
  );
}

function isNonPublicVisibility(visibility) {
  return ['private', 'hidden', 'gated'].includes(String(visibility ?? '').toLowerCase());
}

function isPrivateKey(key) {
  const normalized = key.toLowerCase();
  return normalized.startsWith('private')
    || normalized.startsWith('hidden')
    || normalized.startsWith('gated')
    || normalized.includes('_private')
    || normalized.includes('_hidden')
    || normalized.includes('_gated');
}

function selectPublicFragments(fragmentDocument, selectedAgent) {
  const publicFragments = filterPublicFragments(fragmentDocument);
  const selectedIds = selectedAgent?.proofFragmentIds;
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return publicFragments;

  const byId = new Map(publicFragments.map((fragment) => [fragment.fragment_id, fragment]));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function filterPublicFragments(fragmentDocument) {
  return (fragmentDocument.fragments ?? []).filter((fragment) => fragment.visibility === 'public');
}

function formatStandards(standardRefs) {
  return standardRefs.map((ref) => `${ref.standard_id}: ${ref.status}`).join(', ') || 'No standard refs returned.';
}

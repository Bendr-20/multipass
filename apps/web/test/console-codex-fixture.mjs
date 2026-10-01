export const CODEX_HASH = 'a'.repeat(64);

export function codexEnvelope(operation, result, overrides = {}) {
  const evidenceByOperation = {
    getTokenProfile: [
      { id: 'token:617', kind: 'token', label: 'codex_interpretation' },
      { id: 'token:617', kind: 'token', label: 'collection_fact' },
    ],
    explainTraits: [
      { id: 'token:617', kind: 'token', label: 'collection_fact' },
      { id: 'trait:artifact', kind: 'trait', label: 'codex_interpretation' },
      { id: 'trait:artifact', kind: 'trait', label: 'collection_fact' },
      { id: 'trait:background', kind: 'trait', label: 'codex_interpretation' },
      { id: 'trait:background', kind: 'trait', label: 'collection_fact' },
    ],
    findSimilar: [
      { id: 'token:617', kind: 'token', label: 'codex_interpretation' },
      { id: 'token:617', kind: 'token', label: 'collection_fact' },
      { id: 'token:700', kind: 'token', label: 'codex_interpretation' },
      { id: 'token:700', kind: 'token', label: 'collection_fact' },
      { id: 'trait:background', kind: 'trait', label: 'collection_fact' },
    ],
  };
  return {
    schemaVersion: '1.0.0', artifactHash: CODEX_HASH, codexVersion: 'traits-v1', operation,
    subjectIds: [617], evidence: evidenceByOperation[operation], result, ...overrides,
  };
}

export function canonicalCodexReadyState(overrides = {}) {
  const explainedTraits = [
    {
      type: 'Background', value: 'Nebula', frequency: { numerator: 4, denominator: 7777, ppm: 514 }, evidenceId: 'trait:background',
      interpretation: { archetype: 'signal watcher', role: 'worldview', narrativeSeed: 'maps faint signals', voice: 'precise', values: 'evidence', missionBias: 'trace signal', riskDelta: 1, autonomyDelta: 0, label: 'codex_interpretation' },
    },
    {
      type: 'Artifact', value: 'Nyan Cat', frequency: { numerator: 21, denominator: 7777, ppm: 2700 }, evidenceId: 'trait:artifact',
      interpretation: { archetype: 'internet fossil', role: 'cultural anchor', narrativeSeed: 'carries meme velocity', voice: 'dry', values: 'receipts', missionBias: 'preserve proof', riskDelta: 0, autonomyDelta: 1, label: 'codex_interpretation' },
    },
  ];
  const similar = Array.from({ length: 10 }, (_, index) => {
    const tokenId = index + 700;
    return { tokenId, canonicalName: 'Looper #' + tokenId, intersectionWeight: '12', unionWeight: '20', scorePpm: 600000, sharedTraits: [{ type: 'Background', value: 'Nebula' }] };
  });
  return {
    status: 'ready', selectedTokenId: '617', artifactHash: CODEX_HASH, codexVersion: 'traits-v1',
    profile: codexEnvelope('getTokenProfile', {
      identity: { tokenId: 617, canonicalName: 'Looper #617', description: 'Verified Looper.', image: { url: 'https://turbo-gateway.com/example', id: 'example' }, externalUrl: 'https://helixa.xyz/multipass/loopers/617' },
      visualTraits: explainedTraits.map(({ type, value }) => ({ type, value })),
      interpretation: {
        primaryClass: 'Researcher / Archivist', secondaryClass: 'Builder / Engineer', specialization: 'signal cartographer',
        risk: { value: 4, label: 'Balanced' }, autonomy: { value: 6, label: 'Guided' }, voice: 'Precise',
        quirks: ['Maps every signal'], communicationStyle: ['Short and clear'], values: ['Evidence'], humor: ['Dry'],
        origin: 'Forged in the archive', missionBias: 'Trace signal', shortLore: 'Keeps the receipts.', longLore: 'A longer verified story.',
        activationSeed: '674e832692e7a526177d9cdd7bf67eb6', firstMission: 'Map the signal', firstMissions: ['Map the signal', 'Index the archive'],
        recommendedSkills: [
          { skillFamily: 'research', reason: 'Collects evidence.', sourceClass: 'Researcher / Archivist', mapVersion: 'looper-skill-map-v01', status: 'recommended' },
          { skillFamily: 'knowledge-management', reason: 'Preserves context.', sourceClass: 'Researcher / Archivist', mapVersion: 'looper-skill-map-v01', status: 'recommended' },
        ],
      },
      versions: { traitCodexVersion: 'traits-v1', classModelVersion: 'classes-v1' },
    }),
    explanation: codexEnvelope('explainTraits', { tokenId: 617, traits: explainedTraits }),
    similarity: codexEnvelope('findSimilar', { tokenId: 617, items: similar }),
    ...overrides,
  };
}

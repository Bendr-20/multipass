import {
  LOOPER_CODEX_COMPILER_VERSION,
  LOOPER_CODEX_SCHEMA_VERSION,
  LOOPER_SKILL_RECOMMENDATION_MAP_VERSION,
  buildDerivedIndexes,
  canonicalJsonHash,
  normalizeLooperRecord,
} from '../src/index.js';

export function createLooperRecordFixture(tokenId = 1) {
  const canonicalName = `Looper #${tokenId}`;
  const imageId = '7lVgX4TEaRLBUSOe2uPNCmrMn-VROeHW9CeS2porrzM';
  const externalUrl = `https://helixa.xyz/multipass/loopers/${tokenId}`;
  const visualTraits = [
    ['Background', 'Swarm Command Halo'],
    ['Patch Artifact', 'Nyan Cat'],
  ];
  const traitAtoms = visualTraits.map(([layer, trait], index) => ({
    id: index === 0 ? '8c0469b43e6bff21' : 'a9f663f1c821897d',
    key: `${layer}::${trait}`,
    layer,
    trait,
    archetype: index === 0 ? 'operator systems' : 'internet fossil',
    role: index === 0 ? 'worldview' : 'cultural anchor',
    narrative_seed: index === 0 ? 'came up inside the command halo' : 'carries old meme velocity',
    voice: index === 0 ? 'short and technical' : 'internet fossil badge logic',
    values: index === 0 ? 'routing discipline' : 'visible receipts',
    mission_bias: index === 0 ? 'route noisy work' : 'preserve cultural proof',
    risk_delta: index,
    autonomy_delta: 1 - index,
  }));

  return {
    metadata: {
      name: canonicalName,
      description: 'A Looper agent seed generated from the approved pipeline.',
      image: `https://turbo-gateway.com/${imageId}`,
      external_url: externalUrl,
      attributes: [
        { trait_type: 'Background', value: 'Swarm Command Halo' },
        { trait_type: 'Artifact', value: 'Nyan Cat' },
        { trait_type: 'Agent Class', value: 'Trader / Broker' },
        { trait_type: 'Secondary Class', value: 'Builder / Engineer' },
        { trait_type: 'Specialization', value: 'dealflow operator' },
        { trait_type: 'Risk', value: 'Balanced' },
        { trait_type: 'Autonomy', value: 'Guided' },
        { trait_type: 'Codex Version', value: 'looper-trait-personality-matrix-v02' },
      ],
      agent_class: 'Trader / Broker',
      secondary_class: 'Builder / Engineer',
      voice: 'short and technical',
      risk_profile: 'Balanced',
      specialization: 'dealflow operator',
      activation_seed: '674e832692e7a526177d9cdd7bf67eb6',
      first_mission: 'route capital',
      cred_evolution_hint: 'Cred powers Looper Evolution after mint.',
      trait_codex_version: 'looper-trait-personality-matrix-v02',
      codex_uri: `ar://wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/${tokenId}.json`,
      compiler: 'HashLips Art Engine + Helixa Loopers metadata compiler',
    },
    codex: {
      schema_version: '0.1.0',
      token_id: tokenId,
      name: canonicalName,
      collection: 'Loopers',
      token_uri_name: canonicalName,
      image: `ar://${imageId}`,
      external_url: externalUrl,
      token_metadata_uri: `https://helixa.xyz/.well-known/loopers/metadata/${tokenId}.json`,
      trait_codex_version: 'looper-trait-personality-matrix-v02',
      class_model_version: 'looper-agent-class-model-v01',
      selected_visual_traits: visualTraits.map(([layer, trait]) => ({
        layer,
        trait,
        key: `${layer}::${trait}`,
        applied_weight: null,
      })),
      trait_atoms: traitAtoms,
      class_scores: {
        ceo_operator: 1,
        mercenary_fixer: 2,
        trader_broker: 9,
        builder_engineer: 8,
        creator_propagandist: 0,
        researcher_archivist: 1,
        seer_signal_hunter: 0,
        diplomat_connector: 0,
      },
      agent_class: 'Trader / Broker',
      secondary_class: 'Builder / Engineer',
      specialization: 'dealflow operator',
      personality: {
        quirks: ['defaults to operator systems'],
        communication_style: ['short and technical'],
        values: ['routing discipline'],
        humor: ['internet fossil'],
        voice: 'short and technical',
        risk_tolerance: 5,
        risk_profile: 'Balanced',
        autonomy_level: 4,
        autonomy_profile: 'Guided',
      },
      lore: {
        origin: 'came up inside the command halo',
        mission_bias: 'route noisy work',
        short_lore: `${canonicalName} routes noisy work.`,
        long_lore: `${canonicalName} resolves as a Trader / Broker with a Builder / Engineer secondary lane.`,
      },
      activation: {
        activation_seed: '674e832692e7a526177d9cdd7bf67eb6',
        first_mission: 'route capital',
        first_missions: ['price an opportunity', 'route capital'],
        activation_prompt: `You are ${canonicalName}.`,
        cred_evolution_hint: 'Cred powers Looper Evolution after mint.',
      },
      provenance: {
        source_compiler: 'HashLips Art Engine',
        hashlips_dna: '4e042bca74fcdf411020eec265f2e6228006b1c1',
        hashlips_edition: tokenId,
        generated_at: '2026-09-12T01:26:00.000Z',
      },
    },
  };
}

export function cloneFixture(value) {
  return structuredClone(value);
}

export function createTestArtifact() {
  const traits = [
    [['Background', 'Alpha'], ['Patch Artifact', 'Nyan Cat']],
    [['Background', 'Alpha'], ['Patch Artifact', 'None']],
    [['Background', 'Beta'], ['Patch Artifact', 'None']],
  ];
  const tokens = traits.map((tokenTraits, tokenIndex) => {
    const tokenId = tokenIndex + 1;
    const fixture = createLooperRecordFixture(tokenId);
    tokenTraits.forEach(([type, value], index) => {
      fixture.metadata.attributes[index] = {
        trait_type: type === 'Patch Artifact' ? 'Artifact' : type,
        value,
      };
      fixture.codex.selected_visual_traits[index] = {
        layer: type,
        trait: value,
        key: `${type}::${value}`,
        applied_weight: null,
      };
      Object.assign(fixture.codex.trait_atoms[index], {
        id: `${tokenId.toString(16).padStart(8, '0')}${index.toString(16).padStart(8, '0')}`,
        key: `${type}::${value}`,
        layer: type,
        trait: value,
      });
    });
    return normalizeLooperRecord({ tokenId, ...fixture });
  });
  const semantic = {
    schemaVersion: LOOPER_CODEX_SCHEMA_VERSION,
    collection: {
      name: 'Loopers',
      chainId: 8453,
      contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
      count: 3,
    },
    compilerVersion: LOOPER_CODEX_COMPILER_VERSION,
    sourceHashes: {
      traitPersonalityMatrix: '1'.repeat(64),
      agentClassModel: '2'.repeat(64),
      hashlipsExportManifest: '3'.repeat(64),
      collectionProvenance: '4'.repeat(64),
    },
    versions: {
      traitCodexVersion: 'looper-trait-personality-matrix-v02',
      classModelVersion: 'looper-agent-class-model-v01',
      recommendationMapVersion: LOOPER_SKILL_RECOMMENDATION_MAP_VERSION,
      hashlipsExportVersion: 'hashlips-engine-export-v01',
      collectionProvenanceVersion: 'loopers-provenance-v01',
    },
    count: 3,
    tokens,
    ...buildDerivedIndexes(tokens, 3),
  };
  return structuredClone({
    semantic,
    audit: {
      auditedAt: '2026-09-30T00:00:00.000Z',
      releaseManifestHash: 'a'.repeat(64),
    },
    artifactHash: canonicalJsonHash(semantic),
  });
}

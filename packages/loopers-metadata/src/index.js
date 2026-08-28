import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const LOOPERS_METADATA_SCHEMA_VERSION = '0.1.0';
export const DEFAULT_TRAIT_CODEX_VERSION = 'looper-trait-personality-matrix-v01';
export const DEFAULT_COLLECTION_NAME = 'Loopers';

const REQUIRED_TOKEN_FIELDS = [
  'name',
  'description',
  'image',
  'external_url',
  'attributes',
  'agent_class',
  'secondary_class',
  'voice',
  'risk_profile',
  'specialization',
  'activation_seed',
  'first_mission',
  'cred_evolution_hint',
  'trait_codex_version',
  'codex_uri',
];

const HASHLIPS_PRIVATE_PATTERNS = [
  /\/home\//i,
  /file:\/\//i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /REPLACE_WITH/i,
  /NewUriToReplace/i,
  /placeholder/i,
];

export class LooperMetadataError extends Error {
  constructor(message, issues = []) {
    super(issues.length ? `${message}\n${issues.map((issue) => `- ${issue}`).join('\n')}` : message);
    this.name = 'LooperMetadataError';
    this.issues = issues;
  }
}

export async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new LooperMetadataError(`Could not read JSON: ${filePath}`, [error.message]);
  }
}

export async function readHashlipsMetadataDir(jsonDir) {
  if (!jsonDir) throw new TypeError('readHashlipsMetadataDir requires jsonDir');
  const files = (await readdir(jsonDir))
    .filter((file) => /^\d+\.json$/.test(file))
    .sort((a, b) => Number(a.replace('.json', '')) - Number(b.replace('.json', '')));

  const items = [];
  for (const file of files) {
    items.push(await readJsonFile(join(jsonDir, file)));
  }
  return items;
}

export function createManifestTraitResolver(exportManifest = null) {
  const aliasByLayerValue = new Map();
  const exported = Array.isArray(exportManifest?.exported) ? exportManifest.exported : [];

  for (const entry of exported) {
    if (!entry?.layer || !entry?.trait) continue;
    const canonical = {
      key: `${entry.layer}::${entry.trait}`,
      layer: entry.layer,
      trait: entry.trait,
      applied_weight: Number(entry.applied_weight ?? 0) || null,
    };
    aliasByLayerValue.set(`${entry.layer}::${entry.trait}`, canonical);

    const fileTrait = cleanHashlipsTraitNameFromPath(entry.path);
    if (fileTrait) {
      aliasByLayerValue.set(`${entry.layer}::${fileTrait}`, canonical);
    }
  }

  return {
    resolve(layer, value) {
      return aliasByLayerValue.get(`${layer}::${value}`) ?? {
        key: `${layer}::${value}`,
        layer,
        trait: value,
        applied_weight: null,
      };
    },
  };
}

export function compileLooperMetadataItems(hashlipsItems, options = {}) {
  const {
    personalityMatrix,
    classModel,
    exportManifest = null,
    imageBaseUri,
    codexBaseUri,
    externalUrlBase = 'https://helixa.xyz/multipass/loopers',
    description = 'A Looper agent seed generated from the approved HashLips layer-composite pipeline.',
    collectionName = DEFAULT_COLLECTION_NAME,
    traitCodexVersion = personalityMatrix?.version ?? DEFAULT_TRAIT_CODEX_VERSION,
    generatedAt = new Date().toISOString(),
    expectedCount = null,
    requireCompleteClassAffinities = true,
  } = options;

  assertObject(personalityMatrix, 'personalityMatrix');
  assertObject(classModel, 'classModel');
  assertPublicAssetBaseUri(imageBaseUri, 'imageBaseUri');
  assertPublicAssetBaseUri(codexBaseUri, 'codexBaseUri');
  assertHttpBaseUri(externalUrlBase, 'externalUrlBase');

  if (!Array.isArray(hashlipsItems) || hashlipsItems.length === 0) {
    throw new LooperMetadataError('HashLips metadata input is empty');
  }
  if (expectedCount !== null && hashlipsItems.length !== Number(expectedCount)) {
    throw new LooperMetadataError('HashLips metadata count mismatch', [
      `expected ${expectedCount}, found ${hashlipsItems.length}`,
    ]);
  }

  const atomByKey = createAtomMap(personalityMatrix);
  const classLabels = Object.fromEntries(Object.entries(classModel.classes ?? {}).map(([key, value]) => [key, value.label ?? key]));
  const affinityMap = classModel.trait_affinities ?? classModel.trait_affinity_examples ?? {};
  const classCompletenessIssues = validateClassAffinityCoverage(atomByKey, affinityMap);
  if (requireCompleteClassAffinities && classCompletenessIssues.length) {
    throw new LooperMetadataError('Class affinity map is incomplete for final Looper metadata', classCompletenessIssues);
  }

  const resolver = createManifestTraitResolver(exportManifest);
  const seenEditions = new Set();
  const tokens = [];
  const codex = [];

  for (const item of hashlipsItems) {
    const edition = normalizeEdition(item);
    if (seenEditions.has(edition)) {
      throw new LooperMetadataError('Duplicate HashLips edition', [`edition ${edition}`]);
    }
    seenEditions.add(edition);

    const selectedTraits = normalizeSelectedTraits(item, resolver);
    const traitIssues = validateSelectedTraits(selectedTraits, atomByKey);
    if (traitIssues.length) {
      throw new LooperMetadataError(`Invalid trait stack for edition ${edition}`, traitIssues);
    }

    const atoms = selectedTraits.map((trait) => atomByKey.get(trait.key));
    const classProfile = scoreClassProfile(selectedTraits, affinityMap, classModel, classLabels);
    const personality = composePersonality(selectedTraits, atoms);
    const activationSeed = createActivationSeed({ edition, dna: item.dna, selectedTraits, traitCodexVersion });
    const firstMission = chooseFirstMission(classProfile.agent_class_key, classModel, activationSeed);
    const codexFile = `${edition}.json`;
    const tokenName = `Looper #${edition}`;
    const tokenImage = joinUri(imageBaseUri, `${edition}.png`);
    const codexUri = joinUri(codexBaseUri, codexFile);
    const externalUrl = joinUri(externalUrlBase, String(edition));

    const token = {
      name: tokenName,
      description,
      image: tokenImage,
      external_url: externalUrl,
      attributes: [
        ...selectedTraits.map((trait) => ({
          trait_type: trait.layer,
          value: trait.trait,
        })),
        { trait_type: 'Agent Class', value: classProfile.agent_class },
        ...(classProfile.secondary_class ? [{ trait_type: 'Secondary Class', value: classProfile.secondary_class }] : []),
        { trait_type: 'Specialization', value: classProfile.specialization },
        { trait_type: 'Risk', value: personality.risk_profile },
        { trait_type: 'Autonomy', value: personality.autonomy_profile },
        { trait_type: 'Codex Version', value: traitCodexVersion },
      ],
      agent_class: classProfile.agent_class,
      secondary_class: classProfile.secondary_class,
      voice: personality.voice,
      risk_profile: personality.risk_profile,
      specialization: classProfile.specialization,
      activation_seed: activationSeed,
      first_mission: firstMission,
      cred_evolution_hint: 'Cred powers Looper Evolution after mint.',
      trait_codex_version: traitCodexVersion,
      codex_uri: codexUri,
      compiler: 'HashLips Art Engine + Helixa Loopers metadata compiler',
    };

    const codexDocument = {
      schema_version: LOOPERS_METADATA_SCHEMA_VERSION,
      token_id: edition,
      name: tokenName,
      collection: collectionName,
      token_uri_name: tokenName,
      image: tokenImage,
      external_url: externalUrl,
      token_metadata_uri: joinUri(codexBaseUri.replace(/\/codex\/?$/i, '/metadata'), `${edition}.json`),
      trait_codex_version: traitCodexVersion,
      class_model_version: classModel.version ?? null,
      selected_visual_traits: selectedTraits.map((trait) => ({
        layer: trait.layer,
        trait: trait.trait,
        key: trait.key,
        applied_weight: trait.applied_weight,
      })),
      trait_atoms: atoms.map((atom) => ({
        id: atom.id,
        key: atom.key,
        layer: atom.layer,
        trait: atom.trait,
        archetype: atom.archetype,
        role: atom.role,
        narrative_seed: atom.narrative_seed,
        voice: atom.voice,
        values: atom.values,
        mission_bias: atom.mission_bias,
        risk_delta: atom.risk_delta,
        autonomy_delta: atom.autonomy_delta,
      })),
      class_scores: classProfile.class_scores,
      agent_class: classProfile.agent_class,
      secondary_class: classProfile.secondary_class,
      specialization: classProfile.specialization,
      personality: {
        quirks: personality.quirks,
        communication_style: personality.communication_style,
        values: personality.values,
        humor: personality.humor,
        voice: personality.voice,
        risk_tolerance: personality.risk_tolerance,
        risk_profile: personality.risk_profile,
        autonomy_level: personality.autonomy_level,
        autonomy_profile: personality.autonomy_profile,
      },
      lore: {
        origin: personality.origin,
        mission_bias: personality.mission_bias,
        short_lore: `${tokenName} is ${personality.origin}. ${personality.mission_bias}.`,
        long_lore: buildLongLore(tokenName, selectedTraits, atoms, classProfile),
      },
      activation: {
        activation_seed: activationSeed,
        first_mission: firstMission,
        first_missions: classModel.classes?.[classProfile.agent_class_key]?.first_missions ?? [firstMission],
        activation_prompt: buildActivationPrompt(tokenName, classProfile, personality),
        cred_evolution_hint: token.cred_evolution_hint,
      },
      provenance: {
        source_compiler: item.compiler ?? 'HashLips Art Engine',
        hashlips_dna: item.dna ?? null,
        hashlips_edition: edition,
        generated_at: generatedAt,
      },
    };

    tokens.push(token);
    codex.push(codexDocument);
  }

  const bundle = {
    schema_version: LOOPERS_METADATA_SCHEMA_VERSION,
    generated_at: generatedAt,
    collection: collectionName,
    count: tokens.length,
    token_metadata: tokens,
    agent_codex: codex,
  };
  const validation = validateLooperMetadataBundle(bundle);
  if (!validation.ok) {
    throw new LooperMetadataError('Compiled Looper metadata failed validation', validation.issues);
  }
  return bundle;
}

export async function compileLooperMetadataFromDirs(options = {}) {
  const {
    hashlipsJsonDir,
    personalityMatrixPath,
    classModelPath,
    exportManifestPath = null,
  } = options;

  const [hashlipsItems, personalityMatrix, classModel, exportManifest] = await Promise.all([
    readHashlipsMetadataDir(hashlipsJsonDir),
    readJsonFile(personalityMatrixPath),
    readJsonFile(classModelPath),
    exportManifestPath ? readJsonFile(exportManifestPath) : null,
  ]);

  return compileLooperMetadataItems(hashlipsItems, {
    ...options,
    personalityMatrix,
    classModel,
    exportManifest,
  });
}

export function validateLooperMetadataBundle(bundle) {
  const issues = [];
  if (!bundle || typeof bundle !== 'object') issues.push('bundle must be an object');
  const tokens = bundle?.token_metadata;
  const codex = bundle?.agent_codex;
  if (!Array.isArray(tokens) || tokens.length === 0) issues.push('token_metadata must be a non-empty array');
  if (!Array.isArray(codex) || codex.length !== tokens?.length) issues.push('agent_codex must match token_metadata length');
  if (issues.length) return { ok: false, issues };

  const seenNames = new Set();
  const seenImages = new Set();
  const seenCodex = new Set();
  for (const token of tokens) {
    for (const field of REQUIRED_TOKEN_FIELDS) {
      if (!(field in token)) issues.push(`${token.name ?? 'token'} missing ${field}`);
    }
    if (!/^Looper #\d+$/.test(token.name ?? '')) issues.push(`invalid token name: ${token.name}`);
    if (/Multipass Looper/i.test(token.name ?? '')) issues.push(`old collection name leaked into ${token.name}`);
    if (seenNames.has(token.name)) issues.push(`duplicate token name ${token.name}`);
    seenNames.add(token.name);
    if (seenImages.has(token.image)) issues.push(`duplicate image URI ${token.image}`);
    seenImages.add(token.image);
    if (seenCodex.has(token.codex_uri)) issues.push(`duplicate codex URI ${token.codex_uri}`);
    seenCodex.add(token.codex_uri);
    if (!Array.isArray(token.attributes) || token.attributes.length === 0) issues.push(`${token.name} has no attributes`);
    const serialized = JSON.stringify(token);
    for (const pattern of HASHLIPS_PRIVATE_PATTERNS) {
      if (pattern.test(serialized)) issues.push(`${token.name} contains private, placeholder, or local value matching ${pattern}`);
    }
  }

  const tokenById = new Map(tokens.map((token) => [Number(token.name.replace('Looper #', '')), token]));
  for (const doc of codex) {
    const token = tokenById.get(doc.token_id);
    if (!token) {
      issues.push(`codex token_id ${doc.token_id} has no token metadata`);
      continue;
    }
    if (doc.name !== token.name) issues.push(`${token.name} codex name mismatch`);
    if (doc.image !== token.image) issues.push(`${token.name} codex image mismatch`);
    if (doc.agent_class !== token.agent_class) issues.push(`${token.name} codex class mismatch`);
    if (!Array.isArray(doc.selected_visual_traits) || !doc.selected_visual_traits.length) issues.push(`${token.name} codex missing selected traits`);
    if (!Array.isArray(doc.trait_atoms) || doc.trait_atoms.length !== doc.selected_visual_traits?.length) issues.push(`${token.name} codex trait atom mismatch`);
    const serialized = JSON.stringify(doc);
    for (const pattern of HASHLIPS_PRIVATE_PATTERNS) {
      if (pattern.test(serialized)) issues.push(`${token.name} codex contains private, placeholder, or local value matching ${pattern}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

export async function validateImageFilesForBundle(bundle, imagesDir) {
  if (!imagesDir) return { ok: true, issues: [] };
  const issues = [];
  for (const token of bundle.token_metadata ?? []) {
    const tokenId = Number(token.name.replace('Looper #', ''));
    const imagePath = join(imagesDir, `${tokenId}.png`);
    try {
      const info = await stat(imagePath);
      if (!info.isFile()) issues.push(`${imagePath} is not a file`);
    } catch {
      issues.push(`missing image file ${imagePath}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export async function writeLooperMetadataBundle(bundle, outputDir) {
  if (!outputDir) throw new TypeError('writeLooperMetadataBundle requires outputDir');
  const tokenDir = join(outputDir, 'metadata');
  const codexDir = join(outputDir, 'codex');
  await mkdir(tokenDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });

  for (const token of bundle.token_metadata) {
    const tokenId = Number(token.name.replace('Looper #', ''));
    await writeJson(join(tokenDir, `${tokenId}.json`), token);
  }
  for (const doc of bundle.agent_codex) {
    await writeJson(join(codexDir, `${doc.token_id}.json`), doc);
  }
  await writeJson(join(outputDir, 'manifest.json'), {
    schema_version: bundle.schema_version,
    generated_at: bundle.generated_at,
    collection: bundle.collection,
    count: bundle.count,
    token_metadata_dir: 'metadata',
    agent_codex_dir: 'codex',
  });
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertPublicAssetBaseUri(value, name) {
  if (!value || !/^(https:\/\/|ipfs:\/\/|ar:\/\/|arweave:\/\/)/i.test(value)) {
    throw new TypeError(`${name} must use https://, ipfs://, ar://, or arweave://`);
  }
  assertNoPrivatePattern(value, name);
}

function assertHttpBaseUri(value, name) {
  if (!value || !/^https:\/\//i.test(value)) {
    throw new TypeError(`${name} must use https://`);
  }
  assertNoPrivatePattern(value, name);
}

function assertNoPrivatePattern(value, name) {
  for (const pattern of HASHLIPS_PRIVATE_PATTERNS) {
    if (pattern.test(String(value))) throw new TypeError(`${name} contains disallowed value matching ${pattern}`);
  }
}

function cleanHashlipsTraitNameFromPath(filePath) {
  if (!filePath) return null;
  const file = basename(filePath);
  if (!file.toLowerCase().endsWith('.png')) return null;
  return file.slice(0, -4).split('#').shift();
}

function createAtomMap(personalityMatrix) {
  if (!Array.isArray(personalityMatrix.traits)) {
    throw new LooperMetadataError('personalityMatrix.traits must be an array');
  }
  const atomByKey = new Map();
  const issues = [];
  for (const atom of personalityMatrix.traits) {
    if (!atom?.key) {
      issues.push('personality atom missing key');
      continue;
    }
    if (atomByKey.has(atom.key)) issues.push(`duplicate personality atom ${atom.key}`);
    atomByKey.set(atom.key, atom);
  }
  if (issues.length) throw new LooperMetadataError('Invalid personality matrix', issues);
  return atomByKey;
}

function validateClassAffinityCoverage(atomByKey, affinityMap) {
  const issues = [];
  for (const [key, atom] of atomByKey) {
    if (atom.trait === 'None') continue;
    if (!affinityMap[key]?.classes || Object.keys(affinityMap[key].classes).length === 0) {
      issues.push(`missing class affinity for ${key}`);
    }
  }
  return issues;
}

function normalizeEdition(item) {
  const edition = Number(item?.edition);
  if (!Number.isInteger(edition) || edition <= 0) {
    throw new LooperMetadataError('HashLips item has invalid edition', [String(item?.edition)]);
  }
  return edition;
}

function normalizeSelectedTraits(item, resolver) {
  if (!Array.isArray(item?.attributes) || item.attributes.length === 0) {
    throw new LooperMetadataError(`HashLips edition ${item?.edition ?? '?'} has no attributes`);
  }
  return item.attributes.map((attribute) => {
    const layer = String(attribute?.trait_type ?? '').trim();
    const value = String(attribute?.value ?? '').trim();
    if (!layer || !value) {
      throw new LooperMetadataError(`HashLips edition ${item.edition} has an empty trait`, [JSON.stringify(attribute)]);
    }
    return resolver.resolve(layer, value);
  });
}

function validateSelectedTraits(selectedTraits, atomByKey) {
  const issues = [];
  const seenLayers = new Set();
  for (const trait of selectedTraits) {
    if (seenLayers.has(trait.layer)) issues.push(`duplicate layer ${trait.layer}`);
    seenLayers.add(trait.layer);
    if (!atomByKey.has(trait.key)) issues.push(`missing personality atom for ${trait.key}`);
  }
  const heldObject = selectedTraits.find((trait) => trait.layer === 'Held Object')?.trait ?? 'None';
  const patchArtifact = selectedTraits.find((trait) => trait.layer === 'Patch Artifact')?.trait ?? 'None';
  if (heldObject !== 'None' && patchArtifact !== 'None') {
    issues.push(`Held Object '${heldObject}' cannot combine with Patch Artifact '${patchArtifact}'`);
  }
  return issues;
}

function scoreClassProfile(selectedTraits, affinityMap, classModel, classLabels) {
  const classes = Object.keys(classModel.classes ?? {});
  const scores = Object.fromEntries(classes.map((key) => [key, 0]));
  let specialization = null;
  let specializationScore = -1;

  for (const trait of selectedTraits) {
    const affinity = affinityMap[trait.key];
    if (!affinity?.classes) continue;
    const layerWeight = Number(classModel.layer_influence?.[trait.layer] ?? 1);
    for (const [classKey, value] of Object.entries(affinity.classes)) {
      if (!(classKey in scores)) continue;
      const contribution = Number(value) * layerWeight;
      scores[classKey] += contribution;
      if (affinity.specialization && contribution > specializationScore) {
        specialization = affinity.specialization;
        specializationScore = contribution;
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [dominantKey, dominantScore] = sorted[0] ?? [];
  if (!dominantKey || dominantScore <= 0) {
    throw new LooperMetadataError('Could not assign an agent class', ['selected traits have no class affinity scores']);
  }
  const [secondaryKey, secondaryScore] = sorted[1] ?? [null, 0];
  const secondaryClass = secondaryKey && secondaryScore >= dominantScore * 0.6 ? classLabels[secondaryKey] : null;
  return {
    agent_class_key: dominantKey,
    agent_class: classLabels[dominantKey],
    secondary_class_key: secondaryClass ? secondaryKey : null,
    secondary_class: secondaryClass,
    specialization: specialization ?? classModel.classes?.[dominantKey]?.common_read ?? classLabels[dominantKey],
    class_scores: scores,
  };
}

function composePersonality(selectedTraits, atoms) {
  const byLayer = new Map(selectedTraits.map((trait, index) => [trait.layer, { trait, atom: atoms[index] }]));
  const nonNoneOptional = selectedTraits
    .map((trait, index) => ({ trait, atom: atoms[index] }))
    .filter(({ trait }) => ['Eyewear', 'Held Object', 'Foreground Scraps', 'Patch Artifact', 'Overlay'].includes(trait.layer) && trait.trait !== 'None');

  const riskTolerance = clamp(5 + atoms.reduce((sum, atom) => sum + Number(atom.risk_delta ?? 0), 0), 1, 10);
  const autonomyLevel = clamp(5 + atoms.reduce((sum, atom) => sum + Number(atom.autonomy_delta ?? 0), 0), 1, 10);
  const communicationParts = [
    byLayer.get('Mouth')?.atom?.voice,
    byLayer.get('Eyes')?.atom?.voice,
    byLayer.get('Eyewear')?.trait?.trait !== 'None' ? byLayer.get('Eyewear')?.atom?.voice : null,
  ].filter(Boolean);

  return {
    quirks: [
      byLayer.get('Head Layer')?.atom?.quirk,
      byLayer.get('Mouth')?.atom?.quirk,
      ...nonNoneOptional.map(({ atom }) => atom.quirk),
    ].filter(Boolean),
    communication_style: communicationParts,
    values: [
      byLayer.get('Background')?.atom?.values,
      byLayer.get('Outfit')?.atom?.values,
      byLayer.get('Skin')?.atom?.values,
    ].filter(Boolean),
    humor: [
      byLayer.get('Mouth')?.atom?.archetype,
      byLayer.get('Overlay')?.trait?.trait !== 'None' ? byLayer.get('Overlay')?.atom?.archetype : null,
      byLayer.get('Patch Artifact')?.trait?.trait !== 'None' ? byLayer.get('Patch Artifact')?.atom?.archetype : null,
    ].filter(Boolean),
    voice: byLayer.get('Mouth')?.atom?.voice ?? byLayer.get('Eyes')?.atom?.voice ?? 'deadpan and direct',
    origin: byLayer.get('Background')?.atom?.narrative_seed ?? 'came out of the Loopers layer stack',
    mission_bias: byLayer.get('Outfit')?.atom?.mission_bias ?? byLayer.get('Background')?.atom?.mission_bias ?? 'turn the visual stack into useful agent behavior',
    risk_tolerance: riskTolerance,
    risk_profile: labelRisk(riskTolerance),
    autonomy_level: autonomyLevel,
    autonomy_profile: labelAutonomy(autonomyLevel),
  };
}

function chooseFirstMission(classKey, classModel, activationSeed) {
  const missions = classModel.classes?.[classKey]?.first_missions ?? [];
  if (!missions.length) return 'activate in Multipass';
  const index = Number.parseInt(activationSeed.slice(0, 8), 16) % missions.length;
  return missions[index];
}

function createActivationSeed({ edition, dna, selectedTraits, traitCodexVersion }) {
  const stack = selectedTraits.map((trait) => trait.key).join('|');
  return createHash('sha256')
    .update(`${edition}:${dna ?? ''}:${traitCodexVersion}:${stack}`)
    .digest('hex')
    .slice(0, 32);
}

function buildLongLore(tokenName, selectedTraits, atoms, classProfile) {
  const stack = selectedTraits
    .map((trait) => `${trait.layer}: ${trait.trait}`)
    .join('; ');
  const seeds = atoms
    .map((atom) => atom.narrative_seed)
    .filter(Boolean)
    .slice(0, 6)
    .join('. ');
  return `${tokenName} resolves as ${classProfile.agent_class}${classProfile.secondary_class ? ` with a ${classProfile.secondary_class} secondary lane` : ''}. Trait stack: ${stack}. ${seeds}.`;
}

function buildActivationPrompt(tokenName, classProfile, personality) {
  return [
    `You are ${tokenName}, a ${classProfile.agent_class} Looper with ${classProfile.specialization} bias.`,
    `Voice: ${personality.voice}.`,
    `Start from the holder's instructions, preserve provenance, and turn your trait stack into useful work inside Multipass.`,
  ].join(' ');
}

function labelRisk(value) {
  if (value <= 3) return 'Cautious';
  if (value <= 6) return 'Disciplined';
  if (value <= 8) return 'Aggressive';
  return 'Hazardous';
}

function labelAutonomy(value) {
  if (value <= 3) return 'Low';
  if (value <= 6) return 'Moderate';
  if (value <= 8) return 'High';
  return 'Extreme';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function joinUri(base, part) {
  return `${String(base).replace(/\/+$/, '')}/${String(part).replace(/^\/+/, '')}`;
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

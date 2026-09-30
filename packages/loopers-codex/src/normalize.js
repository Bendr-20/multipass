import { LOOPER_CODEX_COLLECTION, LOOPER_CODEX_LIMITS } from './constants.js';
import { getRecommendedSkills } from './skill-recommendations.js';

export const LOOPER_SOURCE_CODEX_SCHEMA_VERSION = '0.1.0';

const METADATA_KEYS = ['activation_seed', 'agent_class', 'attributes', 'codex_uri', 'compiler', 'cred_evolution_hint', 'description', 'external_url', 'first_mission', 'image', 'name', 'risk_profile', 'secondary_class', 'specialization', 'trait_codex_version', 'voice'];
const CODEX_KEYS = ['activation', 'agent_class', 'class_model_version', 'class_scores', 'collection', 'external_url', 'image', 'lore', 'name', 'personality', 'provenance', 'schema_version', 'secondary_class', 'selected_visual_traits', 'specialization', 'token_id', 'token_metadata_uri', 'token_uri_name', 'trait_atoms', 'trait_codex_version'];
const CLASS_SCORE_KEYS = ['builder_engineer', 'ceo_operator', 'creator_propagandist', 'diplomat_connector', 'mercenary_fixer', 'researcher_archivist', 'seer_signal_hunter', 'trader_broker'];
const DERIVED_TYPES = new Set(['Agent Class', 'Secondary Class', 'Specialization', 'Risk', 'Autonomy', 'Codex Version']);
const ARWEAVE_ID = '[A-Za-z0-9_-]{43}';
const ARWEAVE_URI = new RegExp(`^ar://(${ARWEAVE_ID})$`);
const TURBO_URI = new RegExp(`^https://turbo-gateway\.com/(${ARWEAVE_ID})$`);
const CODEX_URI = new RegExp(`^ar://${ARWEAVE_ID}/([1-9][0-9]*)[.]json$`);
const HEX_16 = /^[0-9a-f]{16}$/;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_40 = /^[0-9a-f]{40}$/;

export function normalizeLooperRecord({ tokenId, metadata, codex }) {
  requireTokenId(tokenId);
  requireObject(metadata, 'metadata');
  requireObject(codex, 'Codex');
  requireExactKeys(metadata, METADATA_KEYS, 'metadata');
  requireExactKeys(codex, CODEX_KEYS, 'Codex');
  validateMetadata(metadata);
  validateCodex(codex);

  equal(codex.schema_version, LOOPER_SOURCE_CODEX_SCHEMA_VERSION, 'source schema version');
  equal(codex.token_id, tokenId, 'token ID');
  const canonicalName = `Looper #${tokenId}`;
  equal(metadata.name, canonicalName, 'canonical name');
  equal(codex.name, canonicalName, 'Codex name');
  equal(codex.token_uri_name, canonicalName, 'token URI name');
  equal(codex.collection, LOOPER_CODEX_COLLECTION.name, 'collection');

  const metadataImageId = normalizeImageIdentity(metadata.image, 'metadata image');
  const codexImageId = normalizeImageIdentity(codex.image, 'Codex image');
  equal(metadataImageId, codexImageId, 'image identity');

  const expectedExternalUrl = `https://helixa.xyz/multipass/loopers/${tokenId}`;
  equal(metadata.external_url, expectedExternalUrl, 'metadata external URL');
  equal(codex.external_url, expectedExternalUrl, 'external URL');
  requireTokenLink(metadata.codex_uri, CODEX_URI, tokenId, 'Codex link');
  equal(codex.token_metadata_uri, `https://helixa.xyz/.well-known/loopers/metadata/${tokenId}.json`, 'metadata link');

  const attributes = normalizeMetadataAttributes(metadata.attributes);
  const selected = normalizeSelectedTraits(codex.selected_visual_traits);
  const visualAttributes = attributes.filter(({ type }) => !DERIVED_TYPES.has(type));
  equal(visualAttributes.length, selected.length, 'visual trait count');
  for (let index = 0; index < selected.length; index += 1) {
    const actual = visualAttributes[index];
    const expected = selected[index];
    equal(actual.type, expected.type, `visual trait type at index ${index}`);
    equal(actual.value, expected.value, `visual trait value at index ${index}`);
  }
  const traitAtoms = normalizeTraitAtoms(codex.trait_atoms, selected);

  equal(metadata.agent_class, codex.agent_class, 'primary class');
  equal(metadata.secondary_class, codex.secondary_class, 'secondary class');
  equal(metadata.specialization, codex.specialization, 'specialization');
  equal(metadata.risk_profile, codex.personality.risk_profile, 'risk label');
  equal(metadata.voice, codex.personality.voice, 'voice');
  equal(metadata.activation_seed, codex.activation.activation_seed, 'activation seed');
  equal(metadata.first_mission, codex.activation.first_mission, 'first mission');
  equal(metadata.cred_evolution_hint, codex.activation.cred_evolution_hint, 'Cred evolution hint');
  equal(metadata.trait_codex_version, codex.trait_codex_version, 'Codex version');
  if (!codex.activation.first_missions.includes(codex.activation.first_mission)) {
    throw new Error('first missions must contain first mission');
  }

  requireAttribute(attributes, 'Agent Class', codex.agent_class);
  if (codex.secondary_class === null) rejectAttribute(attributes, 'Secondary Class');
  else requireAttribute(attributes, 'Secondary Class', codex.secondary_class);
  requireAttribute(attributes, 'Specialization', codex.specialization);
  requireAttribute(attributes, 'Risk', codex.personality.risk_profile);
  requireAttribute(attributes, 'Autonomy', codex.personality.autonomy_profile);
  requireAttribute(attributes, 'Codex Version', codex.trait_codex_version);

  const record = {
    tokenId,
    canonicalName,
    description: metadata.description,
    image: metadata.image,
    imageId: metadataImageId,
    externalUrl: metadata.external_url,
    visualTraits: selected.map(({ type, value }) => ({ type, value })),
    traitAtoms,
    classProfile: {
      primaryClass: codex.agent_class,
      secondaryClass: codex.secondary_class,
      specialization: codex.specialization,
      classScores: camelClassScores(codex.class_scores),
      risk: { value: codex.personality.risk_tolerance, label: codex.personality.risk_profile },
      autonomy: { value: codex.personality.autonomy_level, label: codex.personality.autonomy_profile },
    },
    personality: {
      quirks: [...codex.personality.quirks],
      communicationStyle: [...codex.personality.communication_style],
      values: [...codex.personality.values],
      humor: [...codex.personality.humor],
      voice: codex.personality.voice,
    },
    lore: {
      origin: codex.lore.origin,
      missionBias: codex.lore.mission_bias,
      shortLore: codex.lore.short_lore,
      longLore: codex.lore.long_lore,
    },
    activation: {
      activationSeed: codex.activation.activation_seed,
      firstMission: codex.activation.first_mission,
      firstMissions: [...codex.activation.first_missions],
    },
    recommendedSkills: getRecommendedSkills(codex.agent_class),
    versions: {
      sourceSchemaVersion: codex.schema_version,
      traitCodexVersion: codex.trait_codex_version,
      classModelVersion: codex.class_model_version,
    },
  };
  return deepFreeze(record);
}

export function normalizeImageIdentity(value, label = 'image') {
  requireString(value, label, 256);
  const match = ARWEAVE_URI.exec(value) ?? TURBO_URI.exec(value);
  if (!match) throw new TypeError(`${label} must be ar://<43-char-id> or https://turbo-gateway.com/<43-char-id>`);
  return match[1];
}

function validateMetadata(value) {
  requireString(value.name, 'metadata name', 128);
  requireString(value.description, 'metadata description', 1024);
  requireString(value.image, 'metadata image', 256);
  requireString(value.external_url, 'metadata external URL', 512);
  requireArray(value.attributes, 'metadata attributes', 1, 64);
  for (const [index, attribute] of value.attributes.entries()) {
    requireObject(attribute, `metadata attribute ${index}`);
    requireExactKeys(attribute, ['trait_type', 'value'], `metadata attribute ${index}`);
    requireTraitString(attribute.trait_type, `metadata attribute ${index} type`);
    requireTraitString(attribute.value, `metadata attribute ${index} value`);
  }
  requireString(value.agent_class, 'metadata primary class', 96);
  requireNullableString(value.secondary_class, 'metadata secondary class', 96);
  requireString(value.voice, 'metadata voice', 256);
  requireString(value.risk_profile, 'metadata risk profile', 96);
  requireString(value.specialization, 'metadata specialization', 256);
  requireString(value.activation_seed, 'metadata activation seed', 128);
  if (!HEX_32.test(value.activation_seed)) throw new TypeError('metadata activation seed must be lowercase 32-hex');
  requireString(value.first_mission, 'metadata first mission', 256);
  requireString(value.cred_evolution_hint, 'metadata Cred evolution hint', 512);
  requireString(value.trait_codex_version, 'metadata Codex version', 128);
  requireString(value.codex_uri, 'metadata Codex URI', 512);
  requireString(value.compiler, 'metadata compiler', 256);
}

function validateCodex(value) {
  requireString(value.schema_version, 'source schema version', 32);
  requireTokenId(value.token_id);
  requireString(value.name, 'Codex name', 128);
  requireString(value.collection, 'Codex collection', 64);
  requireString(value.token_uri_name, 'token URI name', 128);
  requireString(value.image, 'Codex image', 256);
  requireString(value.external_url, 'Codex external URL', 512);
  requireString(value.token_metadata_uri, 'token metadata URI', 512);
  requireString(value.trait_codex_version, 'trait Codex version', 128);
  requireString(value.class_model_version, 'class model version', 128);

  requireArray(value.selected_visual_traits, 'selected visual traits', 1, 32);
  for (const [index, trait] of value.selected_visual_traits.entries()) {
    requireObject(trait, `selected visual trait ${index}`);
    requireExactKeys(trait, ['applied_weight', 'key', 'layer', 'trait'], `selected visual trait ${index}`);
    requireTraitString(trait.layer, `selected visual trait ${index} layer`);
    requireTraitString(trait.trait, `selected visual trait ${index} value`);
    requireString(trait.key, `selected visual trait ${index} key`, 196);
    if (trait.applied_weight !== null && (!Number.isFinite(trait.applied_weight) || trait.applied_weight < 0)) {
      throw new TypeError(`selected visual trait ${index} applied_weight must be null or non-negative finite number`);
    }
  }

  requireArray(value.trait_atoms, 'trait atoms', 1, 32);
  for (const [index, atom] of value.trait_atoms.entries()) validateTraitAtom(atom, index);

  requireObject(value.class_scores, 'class scores');
  requireExactKeys(value.class_scores, CLASS_SCORE_KEYS, 'class scores');
  for (const [key, score] of Object.entries(value.class_scores)) requireInteger(score, `class score ${key}`, 0, Number.MAX_SAFE_INTEGER);
  requireString(value.agent_class, 'primary class', 96);
  requireNullableString(value.secondary_class, 'secondary class', 96);
  requireString(value.specialization, 'specialization', 256);

  requireObject(value.personality, 'personality');
  requireExactKeys(value.personality, ['autonomy_level', 'autonomy_profile', 'communication_style', 'humor', 'quirks', 'risk_profile', 'risk_tolerance', 'values', 'voice'], 'personality');
  requireStringArray(value.personality.quirks, 'personality quirks', 16, 256);
  requireStringArray(value.personality.communication_style, 'communication style', 16, 256);
  requireStringArray(value.personality.values, 'personality values', 16, 256);
  requireStringArray(value.personality.humor, 'personality humor', 16, 256);
  requireString(value.personality.voice, 'personality voice', 256);
  requireInteger(value.personality.risk_tolerance, 'risk tolerance', 0, 10);
  requireString(value.personality.risk_profile, 'risk profile', 96);
  requireInteger(value.personality.autonomy_level, 'autonomy level', 0, 10);
  requireString(value.personality.autonomy_profile, 'autonomy profile', 96);

  requireObject(value.lore, 'lore');
  requireExactKeys(value.lore, ['long_lore', 'mission_bias', 'origin', 'short_lore'], 'lore');
  requireString(value.lore.origin, 'lore origin', 1024);
  requireString(value.lore.mission_bias, 'lore mission bias', 1024);
  requireString(value.lore.short_lore, 'short lore', 1024);
  requireString(value.lore.long_lore, 'long lore', 4096);

  requireObject(value.activation, 'activation');
  requireExactKeys(value.activation, ['activation_prompt', 'activation_seed', 'cred_evolution_hint', 'first_mission', 'first_missions'], 'activation');
  requireString(value.activation.activation_seed, 'activation seed', 128);
  if (!HEX_32.test(value.activation.activation_seed)) throw new TypeError('activation seed must be lowercase 32-hex');
  requireString(value.activation.first_mission, 'first mission', 256);
  requireStringArray(value.activation.first_missions, 'first missions', 16, 256);
  requireString(value.activation.activation_prompt, 'activation prompt', 1024);
  requireString(value.activation.cred_evolution_hint, 'Cred evolution hint', 512);

  requireObject(value.provenance, 'provenance');
  requireExactKeys(value.provenance, ['generated_at', 'hashlips_dna', 'hashlips_edition', 'source_compiler'], 'provenance');
  requireString(value.provenance.source_compiler, 'source compiler', 256);
  requireString(value.provenance.hashlips_dna, 'HashLips DNA', 64);
  if (!HEX_40.test(value.provenance.hashlips_dna)) throw new TypeError('HashLips DNA must be lowercase 40-hex');
  requireTokenId(value.provenance.hashlips_edition);
  requireCanonicalTimestamp(value.provenance.generated_at, 'generated_at');
}

function normalizeMetadataAttributes(attributes) {
  const seen = new Set();
  return attributes.map(({ trait_type: rawType, value }) => {
    const type = rawType === 'Artifact' ? 'Patch Artifact' : rawType;
    if (seen.has(type)) throw new Error(`duplicate metadata trait type: ${type}`);
    seen.add(type);
    return { type, value };
  });
}

function normalizeSelectedTraits(selected) {
  const keys = new Set();
  const layers = new Set();
  return selected.map(({ layer, trait, key }) => {
    equal(key, `${layer}::${trait}`, 'selected trait key');
    if (keys.has(key)) throw new Error(`duplicate selected trait key: ${key}`);
    if (layers.has(layer)) throw new Error(`duplicate selected trait layer: ${layer}`);
    keys.add(key);
    layers.add(layer);
    return { type: layer, value: trait, key };
  });
}

function normalizeTraitAtoms(atoms, selected) {
  equal(atoms.length, selected.length, 'trait atom count');
  const ids = new Set();
  const keys = new Set();
  return atoms.map((atom, index) => {
    const trait = selected[index];
    equal(atom.key, trait.key, `trait atom key at index ${index}`);
    equal(atom.layer, trait.type, `trait atom layer at index ${index}`);
    equal(atom.trait, trait.value, `trait atom value at index ${index}`);
    if (ids.has(atom.id)) throw new Error(`duplicate trait atom id: ${atom.id}`);
    if (keys.has(atom.key)) throw new Error(`duplicate trait atom key: ${atom.key}`);
    ids.add(atom.id);
    keys.add(atom.key);
    return {
      id: atom.id,
      type: atom.layer,
      value: atom.trait,
      archetype: atom.archetype,
      role: atom.role,
      narrativeSeed: atom.narrative_seed,
      voice: atom.voice,
      values: atom.values,
      missionBias: atom.mission_bias,
      riskDelta: atom.risk_delta,
      autonomyDelta: atom.autonomy_delta,
    };
  });
}

function validateTraitAtom(atom, index) {
  requireObject(atom, `trait atom ${index}`);
  requireExactKeys(atom, ['archetype', 'autonomy_delta', 'id', 'key', 'layer', 'mission_bias', 'narrative_seed', 'risk_delta', 'role', 'trait', 'values', 'voice'], `trait atom ${index}`);
  requireString(atom.id, `trait atom ${index} id`, 16);
  if (!HEX_16.test(atom.id)) throw new TypeError(`trait atom ${index} id must be lowercase 16-hex`);
  requireString(atom.key, `trait atom ${index} key`, 196);
  requireTraitString(atom.layer, `trait atom ${index} layer`);
  requireTraitString(atom.trait, `trait atom ${index} value`);
  for (const field of ['archetype', 'role', 'narrative_seed', 'voice', 'values', 'mission_bias']) requireString(atom[field], `trait atom ${index} ${field}`, 1024);
  requireInteger(atom.risk_delta, `trait atom ${index} risk delta`, -10, 10);
  requireInteger(atom.autonomy_delta, `trait atom ${index} autonomy delta`, -10, 10);
}

function camelClassScores(scores) {
  return {
    ceoOperator: scores.ceo_operator,
    mercenaryFixer: scores.mercenary_fixer,
    traderBroker: scores.trader_broker,
    builderEngineer: scores.builder_engineer,
    creatorPropagandist: scores.creator_propagandist,
    researcherArchivist: scores.researcher_archivist,
    seerSignalHunter: scores.seer_signal_hunter,
    diplomatConnector: scores.diplomat_connector,
  };
}

function requireAttribute(attributes, type, expected) {
  const found = attributes.find((attribute) => attribute.type === type);
  if (!found) throw new Error(`missing metadata attribute: ${type}`);
  equal(found.value, expected, `metadata attribute ${type}`);
}

function rejectAttribute(attributes, type) {
  if (attributes.some((attribute) => attribute.type === type)) throw new Error(`unexpected metadata attribute: ${type}`);
}

function requireTokenLink(value, pattern, tokenId, label) {
  requireString(value, label, 512);
  const match = pattern.exec(value);
  if (!match || Number(match[1]) !== tokenId) throw new Error(`${label} must end in the exact token suffix /${tokenId}.json`);
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
}

function requireArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new TypeError(`${label} must contain ${min}..${max} items`);
}

function requireStringArray(value, label, maxItems, maxLength) {
  requireArray(value, label, 1, maxItems);
  for (const [index, item] of value.entries()) requireString(item, `${label}[${index}]`, maxLength);
}

function requireTraitString(value, label) {
  requireString(value, label, LOOPER_CODEX_LIMITS.traitStringMaxLength, LOOPER_CODEX_LIMITS.traitStringMinLength);
}

function requireString(value, label, max, min = 1) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < min || value.length > max) throw new TypeError(`${label} must be a trimmed string of length ${min}..${max}`);
}

function requireNullableString(value, label, max) {
  if (value !== null) requireString(value, label, max);
}

function requireInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} must be an integer from ${min} to ${max}`);
}

function requireTokenId(value) {
  requireInteger(value, 'token ID', 1, LOOPER_CODEX_COLLECTION.count);
}

function requireCanonicalTimestamp(value, label) {
  requireString(value, label, 64);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`);
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

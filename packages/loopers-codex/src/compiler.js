import { join } from 'node:path';

import { canonicalJsonHash, canonicalJsonStringify } from './canonical-json.js';
import {
  LOOPER_CODEX_COLLECTION,
  LOOPER_CODEX_COMPILER_VERSION,
  LOOPER_CODEX_FIXED_POINT_SCALE,
  LOOPER_CODEX_LIMITS,
  LOOPER_CODEX_SCHEMA_VERSION,
} from './constants.js';
import { normalizeLooperRecord } from './normalize.js';
import { verifyLooperCodexRelease } from './release-manifest.js';
import { readRegularFile } from './safe-files.js';
import { LOOPER_SKILL_RECOMMENDATION_MAP_VERSION } from './skill-recommendations.js';

const HASH = /^[0-9a-f]{64}$/;
const SOURCE_KEYS = Object.freeze([
  'agentClassModel',
  'collectionProvenance',
  'hashlipsExportManifest',
  'traitPersonalityMatrix',
]);
const VERSION_KEYS = Object.freeze([
  'classModelVersion',
  'collectionProvenanceVersion',
  'hashlipsExportVersion',
  'recommendationMapVersion',
  'traitCodexVersion',
]);
const ARTIFACT_KEYS = Object.freeze(['artifactHash', 'audit', 'semantic']);
const AUDIT_KEYS = Object.freeze(['auditedAt', 'releaseManifestHash']);
const SEMANTIC_KEYS = Object.freeze([
  'collection', 'compilerVersion', 'count', 'exactStacks', 'postings',
  'schemaVersion', 'sourceHashes', 'tokens', 'traitStats', 'versions',
]);
const TOKEN_KEYS = Object.freeze([
  'activation', 'canonicalName', 'classProfile', 'description', 'externalUrl',
  'image', 'imageId', 'lore', 'personality', 'recommendedSkills', 'tokenId',
  'traitAtoms', 'versions', 'visualTraits',
]);

export async function compileLooperCodexArtifact({
  releaseDir,
  expectedCount = LOOPER_CODEX_COLLECTION.count,
} = {}) {
  requireExpectedCount(expectedCount);
  const manifest = await verifyLooperCodexRelease({ releaseDir });
  requireReleaseContract(manifest, expectedCount);

  const sources = await readReleaseSources(releaseDir, manifest);
  const tokens = [];
  for (let tokenId = 1; tokenId <= expectedCount; tokenId += 1) {
    const metadata = await readJson(join(releaseDir, 'metadata', `${tokenId}.json`), LOOPER_CODEX_LIMITS.metadataFileBytes, `metadata ${tokenId}`);
    const codex = await readJson(join(releaseDir, 'codex', `${tokenId}.json`), LOOPER_CODEX_LIMITS.codexFileBytes, `Codex ${tokenId}`);
    tokens.push(normalizeLooperRecord({ tokenId, metadata, codex }));
  }

  const versions = inferVersions(tokens, sources);
  const sourceHashes = sourceHashesFromManifest(manifest);
  const derived = buildDerivedIndexes(tokens, expectedCount);
  const semantic = {
    schemaVersion: LOOPER_CODEX_SCHEMA_VERSION,
    collection: {
      name: LOOPER_CODEX_COLLECTION.name,
      chainId: manifest.chainId,
      contract: manifest.collection,
      count: expectedCount,
    },
    compilerVersion: manifest.compilerVersion,
    sourceHashes,
    versions,
    count: expectedCount,
    tokens,
    ...derived,
  };
  const artifact = {
    semantic,
    audit: {
      auditedAt: manifest.auditedAt,
      releaseManifestHash: canonicalJsonHash(manifest),
    },
    artifactHash: canonicalJsonHash(semantic),
  };
  verifyLooperCodexArtifact(artifact, { expectedCount, expectedSourceHashes: sourceHashes });
  return artifact;
}

export function verifyLooperCodexArtifact(artifact, {
  expectedCount = LOOPER_CODEX_COLLECTION.count,
  expectedSourceHashes,
} = {}) {
  requireExpectedCount(expectedCount);
  requirePlainObject(artifact, 'artifact');
  requireExactKeys(artifact, ARTIFACT_KEYS, 'artifact');
  requirePlainObject(artifact.semantic, 'artifact semantic');
  requireExactKeys(artifact.semantic, SEMANTIC_KEYS, 'artifact semantic');
  requirePlainObject(artifact.audit, 'artifact audit');
  requireExactKeys(artifact.audit, AUDIT_KEYS, 'artifact audit');
  requireHash(artifact.artifactHash, 'artifact hash');
  if (canonicalJsonHash(artifact.semantic) !== artifact.artifactHash) throw new Error('artifact hash mismatch');

  const semantic = artifact.semantic;
  if (semantic.schemaVersion !== LOOPER_CODEX_SCHEMA_VERSION) throw new Error('unsupported artifact schema version');
  if (semantic.compilerVersion !== LOOPER_CODEX_COMPILER_VERSION) throw new Error('unsupported compiler version');
  if (semantic.count !== expectedCount) throw new Error('artifact count mismatch');
  requirePlainObject(semantic.collection, 'artifact collection');
  requireExactKeys(semantic.collection, ['chainId', 'contract', 'count', 'name'], 'artifact collection');
  const expectedCollection = {
    name: LOOPER_CODEX_COLLECTION.name,
    chainId: LOOPER_CODEX_COLLECTION.chainId,
    contract: LOOPER_CODEX_COLLECTION.contract,
    count: expectedCount,
  };
  requireCanonicalEqual(semantic.collection, expectedCollection, 'collection contract');

  validateSourceHashes(semantic.sourceHashes, expectedSourceHashes);
  validateVersions(semantic.versions);
  validateTokens(semantic.tokens, expectedCount, semantic.versions);
  const rebuilt = buildDerivedIndexes(semantic.tokens, expectedCount);
  requireCanonicalEqual(semantic.traitStats, rebuilt.traitStats, 'trait stats semantic verification');
  requireCanonicalEqual(semantic.postings, rebuilt.postings, 'postings semantic verification');
  requireCanonicalEqual(semantic.exactStacks, rebuilt.exactStacks, 'exact stacks semantic verification');

  requireCanonicalTimestamp(artifact.audit.auditedAt, 'audit timestamp');
  requireHash(artifact.audit.releaseManifestHash, 'release manifest hash');
  return true;
}

export function serializeLooperCodexArtifact(artifact) {
  return `${canonicalJsonStringify(artifact)}\n`;
}

export function buildDerivedIndexes(tokens, collectionCount) {
  requireExpectedCount(collectionCount);
  const postingsMap = new Map();
  const stacksMap = new Map();
  for (const token of tokens) {
    for (const trait of token.visualTraits) {
      const mapKey = canonicalJsonStringify([trait.type, trait.value]);
      let entry = postingsMap.get(mapKey);
      if (!entry) {
        entry = { type: trait.type, value: trait.value, tokenIds: [] };
        postingsMap.set(mapKey, entry);
      }
      entry.tokenIds.push(token.tokenId);
    }
    const pairs = token.visualTraits
      .map(({ type, value }) => [type, value])
      .sort(comparePair);
    const stackKey = canonicalJsonHash(pairs);
    let stack = stacksMap.get(stackKey);
    if (!stack) {
      stack = { key: stackKey, tokenIds: [] };
      stacksMap.set(stackKey, stack);
    }
    stack.tokenIds.push(token.tokenId);
  }

  const postings = [...postingsMap.values()]
    .sort(compareTraitEntry)
    .map(({ type, value, tokenIds }) => ({ type, value, tokenIds }));
  const traitStats = postings.map(({ type, value, tokenIds }) => ({
    type,
    value,
    count: tokenIds.length,
    weightMicros: Math.floor((collectionCount * LOOPER_CODEX_FIXED_POINT_SCALE) / tokenIds.length),
    similarityEligible: value !== 'None',
  }));
  const exactStacks = [...stacksMap.values()].sort((left, right) => compareText(left.key, right.key));
  return { traitStats, postings, exactStacks };
}

function inferVersions(tokens, sources) {
  const traitCodexVersion = tokens[0]?.versions.traitCodexVersion;
  const classModelVersion = tokens[0]?.versions.classModelVersion;
  if (sources.traitPersonalityMatrix.version !== traitCodexVersion) throw new Error('trait matrix version mismatch');
  if (sources.agentClassModel.version !== classModelVersion) throw new Error('class model version mismatch');
  for (const token of tokens) {
    if (token.versions.traitCodexVersion !== traitCodexVersion) throw new Error('trait Codex version drift');
    if (token.versions.classModelVersion !== classModelVersion) throw new Error('class model version drift');
  }
  return {
    traitCodexVersion,
    classModelVersion,
    recommendationMapVersion: LOOPER_SKILL_RECOMMENDATION_MAP_VERSION,
    hashlipsExportVersion: requireVersion(sources.hashlipsExportManifest.version, 'HashLips export version'),
    collectionProvenanceVersion: requireVersion(sources.collectionProvenance.version, 'collection provenance version'),
  };
}

async function readReleaseSources(releaseDir, manifest) {
  const sources = {};
  for (const key of SOURCE_KEYS) {
    sources[key] = await readJson(
      join(releaseDir, manifest.components[key].path),
      LOOPER_CODEX_LIMITS.sourceFileBytes,
      key,
    );
    requirePlainObject(sources[key], key);
  }
  return sources;
}

function sourceHashesFromManifest(manifest) {
  return {
    traitPersonalityMatrix: manifest.components.traitPersonalityMatrix.sha256,
    agentClassModel: manifest.components.agentClassModel.sha256,
    hashlipsExportManifest: manifest.components.hashlipsExportManifest.sha256,
    collectionProvenance: manifest.components.collectionProvenance.sha256,
  };
}

async function readJson(path, maxBytes, label) {
  const bytes = await readRegularFile(path, { maxBytes, label });
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new SyntaxError(`malformed JSON in ${label}: ${error.message}`);
  }
}

function requireReleaseContract(manifest, expectedCount) {
  if (manifest.schemaVersion !== LOOPER_CODEX_SCHEMA_VERSION) throw new Error('release schema mismatch');
  if (manifest.compilerVersion !== LOOPER_CODEX_COMPILER_VERSION) throw new Error('release compiler version mismatch');
  if (manifest.chainId !== LOOPER_CODEX_COLLECTION.chainId) throw new Error('release chain mismatch');
  if (manifest.collection !== LOOPER_CODEX_COLLECTION.contract) throw new Error('release collection mismatch');
  if (manifest.count !== expectedCount) throw new Error('release count mismatch');
}

function validateSourceHashes(sourceHashes, expected) {
  requirePlainObject(sourceHashes, 'source hashes');
  requireExactKeys(sourceHashes, SOURCE_KEYS, 'source hashes');
  for (const [key, value] of Object.entries(sourceHashes)) requireHash(value, `source hash ${key}`);
  if (expected !== undefined) requireCanonicalEqual(sourceHashes, expected, 'source hash evidence');
}

function validateVersions(versions) {
  requirePlainObject(versions, 'versions');
  requireExactKeys(versions, VERSION_KEYS, 'versions');
  for (const [key, value] of Object.entries(versions)) requireVersion(value, key);
  if (versions.recommendationMapVersion !== LOOPER_SKILL_RECOMMENDATION_MAP_VERSION) throw new Error('recommendation map version mismatch');
}

function validateTokens(tokens, expectedCount, versions) {
  if (!Array.isArray(tokens) || tokens.length !== expectedCount) throw new Error('token coverage mismatch');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    requirePlainObject(token, `token ${index + 1}`);
    requireExactKeys(token, TOKEN_KEYS, `token ${index + 1}`);
    if (token.tokenId !== index + 1) throw new Error('token IDs must be contiguous and numerically ordered');
    if (token.canonicalName !== `Looper #${token.tokenId}`) throw new Error('artifact token name mismatch');
    if (!Array.isArray(token.visualTraits) || token.visualTraits.length === 0) throw new Error('artifact token visual traits missing');
    const seenTypes = new Set();
    for (const trait of token.visualTraits) {
      requirePlainObject(trait, 'artifact trait');
      requireExactKeys(trait, ['type', 'value'], 'artifact trait');
      requireBoundedText(trait.type, 'artifact trait type', 96);
      requireBoundedText(trait.value, 'artifact trait value', 96);
      if (seenTypes.has(trait.type)) throw new Error('duplicate artifact trait type');
      seenTypes.add(trait.type);
    }
    requirePlainObject(token.versions, 'token versions');
    if (token.versions.traitCodexVersion !== versions.traitCodexVersion) throw new Error('token trait Codex version mismatch');
    if (token.versions.classModelVersion !== versions.classModelVersion) throw new Error('token class model version mismatch');
    if (!Array.isArray(token.recommendedSkills)) throw new Error('token recommendations missing');
    for (const recommendation of token.recommendedSkills) {
      if (recommendation.mapVersion !== versions.recommendationMapVersion || recommendation.status !== 'recommended' || Object.hasOwn(recommendation, 'enabled')) {
        throw new Error('token recommendation contract mismatch');
      }
    }
  }
}

function requireExpectedCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > LOOPER_CODEX_COLLECTION.count) throw new TypeError('expectedCount must be a valid collection count');
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} has unknown or missing fields`);
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) throw new TypeError(`${label} must be lowercase 64-hex`);
}

function requireVersion(value, label) {
  requireBoundedText(value, label, 128);
  return value;
}

function requireBoundedText(value, label, max) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > max) throw new TypeError(`${label} must be a bounded trimmed string`);
}

function requireCanonicalTimestamp(value, label) {
  requireBoundedText(value, label, 64);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`);
}

function requireCanonicalEqual(actual, expected, label) {
  if (canonicalJsonStringify(actual) !== canonicalJsonStringify(expected)) throw new Error(`${label} mismatch`);
}

function compareTraitEntry(left, right) {
  return compareText(left.type, right.type) || compareText(left.value, right.value);
}

function comparePair(left, right) {
  return compareText(left[0], right[0]) || compareText(left[1], right[1]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

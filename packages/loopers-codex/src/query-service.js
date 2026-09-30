import { canonicalJsonHash, canonicalJsonStringify } from './canonical-json.js';
import { verifyLooperCodexArtifact } from './compiler.js';
import { LOOPER_CODEX_LIMITS, LOOPER_CODEX_SCHEMA_VERSION } from './constants.js';
import { createCursor, parseCursor } from './cursor.js';

export function createLooperCodexQueryService(artifact, { expectedCount = artifact?.semantic?.count } = {}) {
  verifyLooperCodexArtifact(artifact, { expectedCount });
  const { semantic, artifactHash } = artifact;
  const tokenById = new Map(semantic.tokens.map((token) => [token.tokenId, token]));
  const statsByKey = new Map(semantic.traitStats.map((entry) => [traitKey(entry), entry]));
  const postingsByKey = new Map(semantic.postings.map((entry) => [traitKey(entry), entry.tokenIds]));
  const codexVersion = semantic.versions.traitCodexVersion;

  function getTokenProfile(tokenId) {
    const token = requireToken(tokenId);
    const result = {
      identity: {
        tokenId,
        canonicalName: token.canonicalName,
        description: token.description,
        image: { url: token.image, id: token.imageId },
        externalUrl: token.externalUrl,
      },
      visualTraits: cloneTraits(token.visualTraits),
      interpretation: {
        primaryClass: token.classProfile.primaryClass,
        secondaryClass: token.classProfile.secondaryClass,
        specialization: token.classProfile.specialization,
        risk: clone(token.classProfile.risk),
        autonomy: clone(token.classProfile.autonomy),
        voice: token.personality.voice,
        quirks: [...token.personality.quirks],
        communicationStyle: [...token.personality.communicationStyle],
        values: [...token.personality.values],
        humor: [...token.personality.humor],
        origin: token.lore.origin,
        missionBias: token.lore.missionBias,
        shortLore: token.lore.shortLore,
        longLore: token.lore.longLore,
        activationSeed: token.activation.activationSeed,
        firstMission: token.activation.firstMission,
        firstMissions: [...token.activation.firstMissions],
        recommendedSkills: clone(token.recommendedSkills),
      },
      versions: {
        traitCodexVersion: token.versions.traitCodexVersion,
        classModelVersion: token.versions.classModelVersion,
      },
    };
    const evidence = [tokenEvidence(tokenId, 'collection_fact'), tokenEvidence(tokenId, 'codex_interpretation')];
    for (const trait of token.visualTraits) evidence.push(traitEvidence(trait, 'collection_fact'));
    return envelope('getTokenProfile', [tokenId], evidence, result);
  }

  function explainTraits(tokenId) {
    const token = requireToken(tokenId);
    const traits = token.visualTraits.map((trait, index) => {
      const stat = requireTrait(trait.type, trait.value);
      const atom = token.traitAtoms[index];
      return {
        type: trait.type,
        value: trait.value,
        frequency: frequency(stat.count),
        evidenceId: traitEvidenceId(trait),
        interpretation: {
          archetype: atom.archetype,
          role: atom.role,
          narrativeSeed: atom.narrativeSeed,
          voice: atom.voice,
          values: atom.values,
          missionBias: atom.missionBias,
          riskDelta: atom.riskDelta,
          autonomyDelta: atom.autonomyDelta,
          label: 'codex_interpretation',
        },
      };
    });
    const evidence = [tokenEvidence(tokenId, 'collection_fact')];
    for (const trait of token.visualTraits) {
      evidence.push(traitEvidence(trait, 'collection_fact'));
      evidence.push(traitEvidence(trait, 'codex_interpretation'));
    }
    return envelope('explainTraits', [tokenId], evidence, { tokenId, traits });
  }

  function compareTokens(leftTokenId, rightTokenId) {
    const left = requireToken(leftTokenId);
    const right = requireToken(rightTokenId);
    if (leftTokenId === rightTokenId) throw new RangeError('token IDs must differ');
    const leftMap = new Map(left.visualTraits.map((trait) => [traitKey(trait), trait]));
    const rightMap = new Map(right.visualTraits.map((trait) => [traitKey(trait), trait]));
    const sharedTraits = sortTraits([...leftMap].filter(([key]) => rightMap.has(key)).map(([, trait]) => trait));
    const onlyLeft = sortTraits([...leftMap].filter(([key]) => !rightMap.has(key)).map(([, trait]) => trait));
    const onlyRight = sortTraits([...rightMap].filter(([key]) => !leftMap.has(key)).map(([, trait]) => trait));
    const union = sortTraits([...leftMap.values(), ...onlyRight]);
    const evidence = [tokenEvidence(leftTokenId, 'collection_fact'), tokenEvidence(rightTokenId, 'collection_fact')];
    for (const trait of union) evidence.push(traitEvidence(trait, 'collection_fact'));
    return envelope('compareTokens', [leftTokenId, rightTokenId], evidence, {
      left: { tokenId: leftTokenId, traits: cloneTraits(left.visualTraits) },
      right: { tokenId: rightTokenId, traits: cloneTraits(right.visualTraits) },
      sharedTraits,
      onlyLeft,
      onlyRight,
      sharedTraitCount: sharedTraits.length,
      unionTraitCount: union.length,
    });
  }

  function findByTraits(filters, cursor = null, limit = LOOPER_CODEX_LIMITS.searchDefaultLimit) {
    const canonicalFilters = normalizeFilters(filters);
    requireLimit(limit, LOOPER_CODEX_LIMITS.searchMaxLimit, 'search limit');
    const afterTokenId = cursor === null ? 0 : parseCursor(cursor, { artifactHash, filters: canonicalFilters });
    const candidateSets = canonicalFilters.map((trait) => {
      requireTrait(trait.type, trait.value);
      return new Set(postingsByKey.get(traitKey(trait)));
    });
    const matching = semantic.tokens
      .filter(({ tokenId }) => tokenId > afterTokenId && candidateSets.every((set) => set.has(tokenId)));
    const page = matching.slice(0, limit);
    const hasMore = matching.length > page.length;
    const items = page.map((token) => ({
      tokenId: token.tokenId,
      canonicalName: token.canonicalName,
      matchedTraits: cloneTraits(canonicalFilters),
    }));
    const nextCursor = hasMore ? createCursor({ artifactHash, filters: canonicalFilters, afterTokenId: page.at(-1).tokenId }) : null;
    const evidence = canonicalFilters.map((trait) => traitEvidence(trait, 'collection_fact'));
    for (const token of page) evidence.push(tokenEvidence(token.tokenId, 'collection_fact'));
    return envelope('findByTraits', [], evidence, { filters: cloneTraits(canonicalFilters), items, nextCursor });
  }

  function getTraitStats(traitType, value) {
    requireTraitString(traitType, 'trait type');
    requireTraitString(value, 'trait value');
    const stat = requireTrait(traitType, value);
    const trait = { type: traitType, value };
    return envelope('getTraitStats', [], [
      traitEvidence(trait, 'collection_fact'),
      collectionEvidence(),
    ], {
      trait,
      frequency: frequency(stat.count),
      tokenIds: [...postingsByKey.get(traitKey(trait))],
    });
  }

  function getCollectionSummary() {
    if (arguments.length !== 0) throw new TypeError('getCollectionSummary accepts no arguments');
    const grouped = new Map();
    for (const stat of semantic.traitStats) {
      if (!grouped.has(stat.type)) grouped.set(stat.type, []);
      grouped.get(stat.type).push({ value: stat.value, frequency: frequency(stat.count) });
    }
    const traitTypes = [...grouped]
      .sort(([left], [right]) => compareText(left, right))
      .map(([type, values]) => ({
        type,
        distinctValueCount: values.length,
        values: values.sort((left, right) => compareText(left.value, right.value)),
      }));
    return envelope('getCollectionSummary', [], [collectionEvidence()], {
      collection: clone(semantic.collection),
      versions: {
        traitCodexVersion: semantic.versions.traitCodexVersion,
        classModelVersion: semantic.versions.classModelVersion,
        recommendationMapVersion: semantic.versions.recommendationMapVersion,
      },
      traitTypes,
    });
  }

  function envelope(operation, subjectIds, evidence, result) {
    return deepFreeze({
      schemaVersion: LOOPER_CODEX_SCHEMA_VERSION,
      artifactHash,
      codexVersion,
      operation,
      subjectIds,
      evidence: dedupeEvidence(evidence),
      result,
    });
  }

  function requireToken(tokenId) {
    if (!Number.isSafeInteger(tokenId) || !tokenById.has(tokenId)) throw new RangeError('token ID is outside the artifact');
    return tokenById.get(tokenId);
  }

  function requireTrait(type, value) {
    const stat = statsByKey.get(traitKey({ type, value }));
    if (!stat) throw new RangeError(`unknown trait: ${type}::${value}`);
    return stat;
  }

  function frequency(count) {
    return {
      numerator: count,
      denominator: semantic.count,
      ppm: Math.floor((count * 1_000_000 + semantic.count / 2) / semantic.count),
    };
  }

  function collectionEvidence() {
    return { id: `collection:${artifactHash.slice(0, 16)}`, kind: 'collection', label: 'collection_fact' };
  }

  return Object.freeze({ getTokenProfile, explainTraits, compareTokens, findByTraits, getTraitStats, getCollectionSummary });
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters) || filters.length < LOOPER_CODEX_LIMITS.filterMinItems || filters.length > LOOPER_CODEX_LIMITS.filterMaxItems) throw new TypeError('filters must contain 1..12 traits');
  const seen = new Set();
  const result = filters.map((filter) => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter) || Object.keys(filter).sort().join(',') !== 'type,value') throw new TypeError('filter has unknown or missing fields');
    requireTraitString(filter.type, 'filter type');
    requireTraitString(filter.value, 'filter value');
    const trait = { type: filter.type, value: filter.value };
    const key = traitKey(trait);
    if (seen.has(key)) throw new TypeError('duplicate filter trait');
    seen.add(key);
    return trait;
  });
  return sortTraits(result);
}

function requireLimit(limit, max, label) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) throw new RangeError(`${label} must be from 1 to ${max}`);
}

function requireTraitString(value, label) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > LOOPER_CODEX_LIMITS.traitStringMaxLength) throw new TypeError(`${label} must be a bounded exact string`);
}

function traitKey({ type, value }) {
  return canonicalJsonStringify([type, value]);
}

function traitEvidenceId(trait) {
  return `trait:${canonicalJsonHash([trait.type, trait.value]).slice(0, 16)}`;
}

function traitEvidence(trait, label) {
  return { id: traitEvidenceId(trait), kind: 'trait', label };
}

function tokenEvidence(tokenId, label) {
  return { id: `token:${tokenId}`, kind: 'token', label };
}

function dedupeEvidence(evidence) {
  const map = new Map();
  for (const item of evidence) map.set(`${item.id}|${item.label}`, item);
  return [...map.values()].sort((left, right) => compareText(left.id, right.id) || compareText(left.label, right.label));
}

function cloneTraits(traits) {
  return traits.map(({ type, value }) => ({ type, value }));
}

function sortTraits(traits) {
  return cloneTraits(traits).sort((left, right) => compareText(left.type, right.type) || compareText(left.value, right.value));
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

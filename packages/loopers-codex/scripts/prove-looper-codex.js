#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  createCursor,
  createLooperCodexQueryService,
  loadLooperCodexArtifact,
  parseCursor,
} from '../src/index.js';

const TOKEN_ID = 3802;
const ENVELOPE_KEYS = ['schemaVersion', 'artifactHash', 'codexVersion', 'operation', 'subjectIds', 'evidence', 'result'];
const OPERATION_RESULT_KEYS = Object.freeze({
  getTokenProfile: ['identity', 'visualTraits', 'interpretation', 'versions'],
  explainTraits: ['tokenId', 'traits'],
  compareTokens: ['left', 'right', 'sharedTraits', 'onlyLeft', 'onlyRight', 'sharedTraitCount', 'unionTraitCount'],
  findByTraits: ['filters', 'items', 'nextCursor'],
  findSimilar: ['tokenId', 'items'],
  getTraitStats: ['trait', 'frequency', 'tokenIds'],
  getCollectionSummary: ['collection', 'versions', 'traitTypes'],
});

export async function proveLooperCodexArtifact(path) {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('network access is forbidden during Looper Codex proof');
  };
  try {
    const artifact = await loadLooperCodexArtifact({ path });
    assert.equal(artifact.semantic.count, 7777);
    const service = createLooperCodexQueryService(artifact);
    assert.deepEqual(Object.keys(service), [
      'getTokenProfile', 'explainTraits', 'compareTokens', 'findByTraits',
      'findSimilar', 'getTraitStats', 'getCollectionSummary',
    ]);

    const profile = service.getTokenProfile(TOKEN_ID);
    validateEnvelope(profile, 'getTokenProfile', [TOKEN_ID]);
    assert.equal(profile.result.identity.tokenId, TOKEN_ID);
    assert.equal(profile.result.identity.canonicalName, `Looper #${TOKEN_ID}`);
    assert.deepEqual(Object.keys(profile.result.identity), ['tokenId', 'canonicalName', 'description', 'image', 'externalUrl']);
    assert.deepEqual(Object.keys(profile.result.identity.image), ['url', 'id']);
    assert.deepEqual(Object.keys(profile.result.interpretation), [
      'primaryClass', 'secondaryClass', 'specialization', 'risk', 'autonomy', 'voice',
      'quirks', 'communicationStyle', 'values', 'humor', 'origin', 'missionBias',
      'shortLore', 'longLore', 'activationSeed', 'firstMission', 'firstMissions',
      'recommendedSkills',
    ]);
    for (const recommendation of profile.result.interpretation.recommendedSkills) {
      assert.deepEqual(Object.keys(recommendation).sort(), ['mapVersion', 'reason', 'skillFamily', 'sourceClass', 'status']);
      assert.equal(recommendation.status, 'recommended');
      assert.equal(Object.hasOwn(recommendation, 'enabled'), false);
    }
    assert.equal(JSON.stringify(profile).includes('enabled'), false);

    const explanation = service.explainTraits(TOKEN_ID);
    validateEnvelope(explanation, 'explainTraits', [TOKEN_ID]);
    assert.equal(explanation.result.tokenId, TOKEN_ID);
    assert.equal(explanation.result.traits.length, profile.result.visualTraits.length);
    for (const trait of explanation.result.traits) {
      assert.deepEqual(Object.keys(trait), ['type', 'value', 'frequency', 'evidenceId', 'interpretation']);
      validateFrequency(trait.frequency, 7777);
      assert.equal(trait.interpretation.label, 'codex_interpretation');
    }

    const compareTokenId = TOKEN_ID === 1 ? 2 : 1;
    const comparison = service.compareTokens(TOKEN_ID, compareTokenId);
    validateEnvelope(comparison, 'compareTokens', [TOKEN_ID, compareTokenId]);
    assert.equal(comparison.result.left.tokenId, TOKEN_ID);
    assert.equal(comparison.result.right.tokenId, compareTokenId);
    assert.equal(comparison.result.unionTraitCount, comparison.result.sharedTraitCount + comparison.result.onlyLeft.length + comparison.result.onlyRight.length);

    const filters = [profile.result.visualTraits[0]];
    const firstSearch = service.findByTraits(filters, null, 1);
    validateEnvelope(firstSearch, 'findByTraits', []);
    assert.equal(firstSearch.result.items.length, 1);
    assert.equal(typeof firstSearch.result.nextCursor === 'string' || firstSearch.result.nextCursor === null, true);
    let page = firstSearch;
    let pages = 1;
    while (page.result.nextCursor !== null) {
      page = service.findByTraits(filters, page.result.nextCursor, 100);
      validateEnvelope(page, 'findByTraits', []);
      pages += 1;
      assert.ok(pages <= 7778);
    }
    assert.equal(page.result.nextCursor, null);
    if (firstSearch.result.nextCursor !== null) {
      const alternate = profile.result.visualTraits.find((trait) => trait.type !== filters[0].type) ?? { type: filters[0].type, value: 'Unknown' };
      assert.throws(() => service.findByTraits([alternate], firstSearch.result.nextCursor, 1), /cursor|unknown trait/i);
    }
    assert.throws(() => service.findByTraits([{ ...filters[0], extra: true }]), /unknown/i);
    assert.throws(() => service.findByTraits([{ type: filters[0].type, value: '.*' }]), /unknown trait/i);

    const similarity = service.findSimilar(TOKEN_ID, 10);
    validateEnvelope(similarity, 'findSimilar', [TOKEN_ID]);
    assert.equal(similarity.result.tokenId, TOKEN_ID);
    assert.equal(similarity.result.items.some((item) => item.tokenId === TOKEN_ID), false);
    for (const item of similarity.result.items) {
      assert.deepEqual(Object.keys(item), ['tokenId', 'canonicalName', 'intersectionWeight', 'unionWeight', 'scorePpm', 'sharedTraits']);
      assert.match(item.intersectionWeight, /^\d+$/);
      assert.match(item.unionWeight, /^\d+$/);
      assert.equal(item.sharedTraits.some(({ value }) => value === 'None'), false);
    }

    const traitStats = service.getTraitStats(filters[0].type, filters[0].value);
    validateEnvelope(traitStats, 'getTraitStats', []);
    validateFrequency(traitStats.result.frequency, 7777);
    assert.equal(traitStats.result.tokenIds.includes(TOKEN_ID), true);

    const summary = service.getCollectionSummary();
    validateEnvelope(summary, 'getCollectionSummary', []);
    assert.deepEqual(summary.result.collection, {
      name: 'Loopers',
      chainId: 8453,
      contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
      count: 7777,
    });

    const proofCursor = createCursor({ artifactHash: artifact.artifactHash, filters, afterTokenId: TOKEN_ID });
    assert.equal(parseCursor(proofCursor, { artifactHash: artifact.artifactHash, filters }), TOKEN_ID);
    assert.throws(() => parseCursor(proofCursor, { artifactHash: '0'.repeat(64), filters }), /cursor/i);
    assert.throws(() => parseCursor(`${proofCursor}x`, { artifactHash: artifact.artifactHash, filters }), /cursor/i);
    assert.equal(fetchCalls, 0);

    return Object.freeze({
      count: artifact.semantic.count,
      schemaVersion: artifact.semantic.schemaVersion,
      artifactHash: artifact.artifactHash,
      tokenId: TOKEN_ID,
      operationCount: 7,
      fetchCalls,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function validateEnvelope(response, operation, subjectIds) {
  assert.deepEqual(Object.keys(response), ENVELOPE_KEYS);
  assert.equal(response.schemaVersion, '1.0.0');
  assert.match(response.artifactHash, /^[0-9a-f]{64}$/);
  assert.equal(typeof response.codexVersion, 'string');
  assert.equal(response.operation, operation);
  assert.deepEqual(response.subjectIds, subjectIds);
  assert.deepEqual(Object.keys(response.result), OPERATION_RESULT_KEYS[operation]);
  assert.ok(Object.isFrozen(response));
  for (const evidence of response.evidence) {
    assert.deepEqual(Object.keys(evidence), ['id', 'kind', 'label']);
    assert.match(evidence.kind, /^(token|trait|collection)$/);
    assert.match(evidence.label, /^(collection_fact|codex_interpretation)$/);
  }
  const sortedEvidence = [...response.evidence].sort((left, right) => {
    if (left.id !== right.id) return left.id < right.id ? -1 : 1;
    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
  });
  assert.deepEqual(response.evidence, sortedEvidence);
}

function validateFrequency(frequency, denominator) {
  assert.deepEqual(Object.keys(frequency), ['numerator', 'denominator', 'ppm']);
  assert.equal(frequency.denominator, denominator);
  assert.equal(frequency.ppm, Math.floor((frequency.numerator * 1_000_000 + denominator / 2) / denominator));
}

async function main() {
  const path = process.env.LOOPER_CODEX_ARTIFACT;
  if (!path) throw new Error('LOOPER_CODEX_ARTIFACT is required');
  const result = await proveLooperCodexArtifact(path);
  process.stdout.write(`count=${result.count} schema=${result.schemaVersion} hash=${result.artifactHash} operations=${result.operationCount} fetch=${result.fetchCalls}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

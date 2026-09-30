import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LOOPER_CODEX_LIMITS,
  canonicalJsonHash,
  createLooperCodexQueryService,
  loadLooperCodexArtifact,
} from '../src/index.js';
import { createTestArtifact } from './fixtures.js';

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'loopers-codex-query-test-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeArtifact(path, artifact) {
  await writeFile(path, `${JSON.stringify(artifact)}\n`);
}

test('loader accepts a semantically valid artifact and deeply freezes it', async () => {
  await withTempDirectory(async (root) => {
    const path = join(root, 'artifact.json');
    await writeArtifact(path, createTestArtifact());
    const loaded = await loadLooperCodexArtifact({ path, expectedCount: 3 });
    assert.equal(loaded.semantic.count, 3);
    assert.ok(Object.isFrozen(loaded));
    assert.ok(Object.isFrozen(loaded.semantic));
    assert.ok(Object.isFrozen(loaded.semantic.tokens));
    assert.ok(Object.isFrozen(loaded.semantic.tokens[0].visualTraits[0]));
    assert.throws(() => loaded.semantic.tokens.push({}), TypeError);
  });
});

test('loader enforces the mandatory artifact cap and regular no-symlink policy', async () => {
  await withTempDirectory(async (root) => {
    const oversized = join(root, 'oversized.json');
    await writeFile(oversized, '');
    await truncate(oversized, LOOPER_CODEX_LIMITS.artifactBytes + 1);
    await assert.rejects(loadLooperCodexArtifact({ path: oversized, expectedCount: 3 }), /byte limit/i);

    const target = join(root, 'target.json');
    const link = join(root, 'artifact-link.json');
    await writeArtifact(target, createTestArtifact());
    await symlink(target, link);
    await assert.rejects(loadLooperCodexArtifact({ path: link, expectedCount: 3 }), /non-symlink/i);
  });
});

test('loader rejects unsupported schema, coverage drift, stale hash, and unknown fields', async () => {
  await withTempDirectory(async (root) => {
    const mutations = [
      { recompute: true, mutate: (x) => { x.semantic.schemaVersion = '9.9.9'; } },
      { recompute: true, mutate: (x) => { x.semantic.count = 2; } },
      { recompute: false, mutate: (x) => { x.semantic.tokens[0].canonicalName = 'Changed'; } },
      { recompute: true, mutate: (x) => { x.semantic.extra = true; } },
    ];
    for (const [index, { recompute, mutate }] of mutations.entries()) {
      const artifact = createTestArtifact();
      mutate(artifact);
      if (recompute) artifact.artifactHash = canonicalJsonHash(artifact.semantic);
      const path = join(root, `invalid-${index}.json`);
      await writeArtifact(path, artifact);
      await assert.rejects(loadLooperCodexArtifact({ path, expectedCount: 3 }));
    }
  });
});

test('loader rejects hash-consistent semantic corruption of every derived index', async () => {
  await withTempDirectory(async (root) => {
    const mutations = [
      (x) => { x.semantic.traitStats[0].count += 1; },
      (x) => { x.semantic.traitStats[0].weightMicros += 1; },
      (x) => { x.semantic.postings[0].tokenIds = [1]; },
      (x) => { x.semantic.exactStacks[0].tokenIds.push(3); },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const artifact = createTestArtifact();
      mutate(artifact);
      artifact.artifactHash = canonicalJsonHash(artifact.semantic);
      const path = join(root, `corrupt-${index}.json`);
      await writeArtifact(path, artifact);
      await assert.rejects(loadLooperCodexArtifact({ path, expectedCount: 3 }), /semantic verification/i);
    }
  });
});

test('loader rejects malformed source hashes and versions with a recomputed artifact hash', async () => {
  await withTempDirectory(async (root) => {
    const mutations = [
      (x) => { x.semantic.sourceHashes.traitPersonalityMatrix = 'not-a-hash'; },
      (x) => { x.semantic.versions.traitCodexVersion = ''; },
      (x) => { x.semantic.versions.recommendationMapVersion = 'other'; },
      (x) => { x.semantic.tokens[0].versions.classModelVersion = 'other'; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const artifact = createTestArtifact();
      mutate(artifact);
      artifact.artifactHash = canonicalJsonHash(artifact.semantic);
      const path = join(root, `bad-evidence-${index}.json`);
      await writeArtifact(path, artifact);
      await assert.rejects(loadLooperCodexArtifact({ path, expectedCount: 3 }));
    }
  });
});

function createService() {
  return createLooperCodexQueryService(createTestArtifact(), { expectedCount: 3 });
}

test('profile returns the exact closed envelope with facts and interpretations', () => {
  const response = createService().getTokenProfile(1);
  assert.deepEqual(Object.keys(response), ['schemaVersion', 'artifactHash', 'codexVersion', 'operation', 'subjectIds', 'evidence', 'result']);
  assert.equal(response.schemaVersion, '1.0.0');
  assert.equal(response.operation, 'getTokenProfile');
  assert.deepEqual(response.subjectIds, [1]);
  assert.deepEqual(Object.keys(response.result), ['identity', 'visualTraits', 'interpretation', 'versions']);
  assert.deepEqual(Object.keys(response.result.identity), ['tokenId', 'canonicalName', 'description', 'image', 'externalUrl']);
  assert.deepEqual(Object.keys(response.result.interpretation), ['primaryClass', 'secondaryClass', 'specialization', 'risk', 'autonomy', 'voice', 'quirks', 'communicationStyle', 'values', 'humor', 'origin', 'missionBias', 'shortLore', 'longLore', 'activationSeed', 'firstMission', 'firstMissions', 'recommendedSkills']);
  assert.equal(response.result.interpretation.recommendedSkills.every((item) => item.status === 'recommended' && !Object.hasOwn(item, 'enabled')), true);
  assert.ok(Object.isFrozen(response));
  assert.throws(() => response.evidence.push({}), TypeError);
});

test('trait explanation returns exact rational frequency and interpretation evidence', () => {
  const response = createService().explainTraits(1);
  assert.equal(response.operation, 'explainTraits');
  assert.deepEqual(Object.keys(response.result), ['tokenId', 'traits']);
  assert.deepEqual(response.result.traits[0].frequency, { numerator: 2, denominator: 3, ppm: 666667 });
  assert.deepEqual(Object.keys(response.result.traits[0]), ['type', 'value', 'frequency', 'evidenceId', 'interpretation']);
  assert.equal(response.result.traits[0].interpretation.label, 'codex_interpretation');
});

test('compare returns canonically sorted set differences and rejects identical IDs', () => {
  const response = createService().compareTokens(1, 2);
  assert.equal(response.operation, 'compareTokens');
  assert.deepEqual(response.subjectIds, [1, 2]);
  assert.deepEqual(response.result.sharedTraits, [{ type: 'Background', value: 'Alpha' }]);
  assert.deepEqual(response.result.onlyLeft, [{ type: 'Patch Artifact', value: 'Nyan Cat' }]);
  assert.deepEqual(response.result.onlyRight, [{ type: 'Patch Artifact', value: 'None' }]);
  assert.equal(response.result.sharedTraitCount, 1);
  assert.equal(response.result.unionTraitCount, 3);
  assert.throws(() => createService().compareTokens(1, 1), /differ/i);
});

test('trait search is exact, bounded, cursor-bound, and terminal with null', () => {
  const service = createService();
  const first = service.findByTraits([{ type: 'Background', value: 'Alpha' }], null, 1);
  assert.equal(first.operation, 'findByTraits');
  assert.deepEqual(first.subjectIds, []);
  assert.deepEqual(first.result.items.map(({ tokenId }) => tokenId), [1]);
  assert.equal(typeof first.result.nextCursor, 'string');
  const second = service.findByTraits([{ value: 'Alpha', type: 'Background' }], first.result.nextCursor, 1);
  assert.deepEqual(second.result.items.map(({ tokenId }) => tokenId), [2]);
  assert.equal(second.result.nextCursor, null);
  assert.throws(() => service.findByTraits([{ type: 'Background', value: 'Beta' }], first.result.nextCursor, 1), /cursor/i);
  assert.throws(() => service.findByTraits([{ type: 'Background', value: 'Alpha', extra: true }]), /unknown/i);
  assert.throws(() => service.findByTraits([{ type: 'Unknown', value: 'Alpha' }]), /unknown trait/i);
  assert.throws(() => service.findByTraits([{ type: 'Background', value: 'Alpha' }], null, 101), /limit/i);
});

test('trait stats and collection summary use exact closed schemas and ordering', () => {
  const service = createService();
  const stats = service.getTraitStats('Background', 'Alpha');
  assert.deepEqual(stats.result, {
    trait: { type: 'Background', value: 'Alpha' },
    frequency: { numerator: 2, denominator: 3, ppm: 666667 },
    tokenIds: [1, 2],
  });
  assert.throws(() => service.getTraitStats('Background', 'Unknown'), /unknown trait/i);
  const summary = service.getCollectionSummary();
  assert.equal(summary.operation, 'getCollectionSummary');
  assert.deepEqual(summary.subjectIds, []);
  assert.deepEqual(summary.result.collection, {
    name: 'Loopers', chainId: 8453, contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', count: 3,
  });
  assert.deepEqual(summary.result.traitTypes.map(({ type }) => type), ['Background', 'Patch Artifact']);
  assert.deepEqual(summary.result.traitTypes[0].values.map(({ value }) => value), ['Alpha', 'Beta']);
});

test('query service rejects invalid IDs and exposes only implemented methods', () => {
  const service = createService();
  assert.deepEqual(Object.keys(service), ['getTokenProfile', 'explainTraits', 'compareTokens', 'findByTraits', 'getTraitStats', 'getCollectionSummary']);
  for (const tokenId of [0, 4, 1.5, '1']) assert.throws(() => service.getTokenProfile(tokenId), /token ID/i);
  assert.throws(() => service.getCollectionSummary('extra'), /arguments/i);
});

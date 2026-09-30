import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LOOPER_CODEX_LIMITS,
  canonicalJsonHash,
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

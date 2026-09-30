import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import * as codex from '../src/index.js';
import { cloneFixture, createLooperRecordFixture } from './fixtures.js';

const {
  canonicalJsonHash,
  canonicalJsonStringify,
  inspectNumberedJsonDirectory,
  materializeLooperCodexRelease,
  readRegularFile,
  verifyLooperCodexRelease,
} = codex;

const execFile = promisify(execFileCallback);
const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const repositoryRoot = resolve(packageRoot, '../..');

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'loopers-codex-test-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function createMaterializerInputs(root, count = 3) {
  const metadataDir = join(root, 'inputs', 'metadata');
  const codexDir = join(root, 'inputs', 'codex');
  await mkdir(metadataDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });

  for (let id = 1; id <= count; id += 1) {
    await writeJson(join(metadataDir, `${id}.json`), { id, kind: 'metadata' });
    await writeJson(join(codexDir, `${id}.json`), { id, kind: 'codex' });
  }

  const sources = {
    traitPersonalityMatrixPath: join(root, 'inputs', 'trait-personality-matrix.json'),
    agentClassModelPath: join(root, 'inputs', 'agent-class-model.json'),
    hashlipsExportManifestPath: join(root, 'inputs', 'hashlips-export-manifest.json'),
    collectionProvenancePath: join(root, 'inputs', 'collection-provenance.json'),
  };
  await writeJson(sources.traitPersonalityMatrixPath, { matrix: 'v1' });
  await writeJson(sources.agentClassModelPath, { classes: ['A', 'B'] });
  await writeJson(sources.hashlipsExportManifestPath, { export: 'reviewed' });
  await writeJson(sources.collectionProvenancePath, { provenance: 'reviewed' });

  return { metadataDir, codexDir, ...sources };
}

function materializerOptions(root, inputs, overrides = {}) {
  return {
    ...inputs,
    outputDir: join(root, 'release'),
    auditedAt: '2026-09-30T00:00:00.000Z',
    chainId: 8453,
    collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
    count: 3,
    compilerVersion: '1.0.0',
    ...overrides,
  };
}

async function listTree(root, relative = '') {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    paths.push(entry.isDirectory() ? `${child}/` : child);
    if (entry.isDirectory()) paths.push(...await listTree(root, child));
  }
  return paths;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('canonical JSON package exposes the locked foundation constants', () => {
  assert.equal(codex.LOOPER_CODEX_SCHEMA_VERSION, '1.0.0');
  assert.equal(codex.LOOPER_CODEX_COMPILER_VERSION, '1.0.0');
  assert.deepEqual(codex.LOOPER_CODEX_COLLECTION, {
    name: 'Loopers',
    chainId: 8453,
    contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
    count: 7777,
  });
  assert.deepEqual(codex.LOOPER_CODEX_LIMITS, {
    releaseManifestBytes: 1 * 1024 * 1024,
    metadataFileBytes: 64 * 1024,
    codexFileBytes: 128 * 1024,
    sourceFileBytes: 4 * 1024 * 1024,
    metadataAggregateBytes: 512 * 1024 * 1024,
    codexAggregateBytes: 1024 * 1024 * 1024,
    artifactBytes: 128 * 1024 * 1024,
    traitStringMinLength: 1,
    traitStringMaxLength: 96,
    filterMinItems: 1,
    filterMaxItems: 12,
    searchDefaultLimit: 25,
    searchMaxLimit: 100,
    similarityDefaultLimit: 10,
    similarityMaxLimit: 25,
    cursorMaxLength: 512,
  });
  assert.deepEqual(codex.LOOPER_CODEX_DERIVED_TRAIT_TYPES, [
    'Agent Class',
    'Secondary Class',
    'Specialization',
    'Risk',
    'Autonomy',
  ]);
  assert.equal(codex.LOOPER_CODEX_FIXED_POINT_SCALE, 1_000_000);
});

test('canonical JSON sorts object keys recursively while preserving array order', () => {
  const value = {
    zebra: 1,
    alpha: {
      y: true,
      x: null,
    },
    items: [
      { second: 2, first: 1 },
      'tail',
    ],
  };

  assert.equal(
    canonicalJsonStringify(value),
    '{"alpha":{"x":null,"y":true},"items":[{"first":1,"second":2},"tail"],"zebra":1}',
  );
});

test('canonical JSON preserves array order', () => {
  assert.equal(canonicalJsonStringify([3, 1, 2]), '[3,1,2]');
  assert.notEqual(canonicalJsonStringify([3, 1, 2]), canonicalJsonStringify([1, 2, 3]));
});

test('canonical JSON rejects unsupported values', () => {
  for (const value of [undefined, 1n, Symbol('unsupported'), () => {}]) {
    assert.throws(() => canonicalJsonStringify(value), TypeError);
  }

  assert.throws(() => canonicalJsonStringify({ nested: undefined }), TypeError);
  assert.throws(() => canonicalJsonStringify([1, undefined]), TypeError);
  assert.throws(() => canonicalJsonStringify(new Date(0)), TypeError);
  assert.throws(() => canonicalJsonStringify([1, , 3]), TypeError);
});

test('canonical JSON rejects non-finite numbers', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalJsonStringify(value), /finite/);
  }
});

test('canonical JSON rejects cyclic values', () => {
  const value = { name: 'cycle' };
  value.self = value;

  assert.throws(() => canonicalJsonStringify(value), /cyclic/);
});

test('canonical JSON hashes equivalent values identically with SHA-256', () => {
  const left = { beta: [2, 1], alpha: { enabled: true } };
  const right = { alpha: { enabled: true }, beta: [2, 1] };

  assert.equal(canonicalJsonHash(left), canonicalJsonHash(right));
  assert.match(canonicalJsonHash(left), /^[0-9a-f]{64}$/);
  assert.notEqual(canonicalJsonHash(left), canonicalJsonHash({ ...right, beta: [1, 2] }));
});

test('release manifest materializer creates the exact portable layout and pins every component', async () => {
  await withTempDirectory(async (root) => {
    const inputs = await createMaterializerInputs(root);
    const options = materializerOptions(root, inputs);
    const manifest = await materializeLooperCodexRelease(options);

    assert.deepEqual(await listTree(options.outputDir), [
      'codex/',
      'codex/1.json',
      'codex/2.json',
      'codex/3.json',
      'metadata/',
      'metadata/1.json',
      'metadata/2.json',
      'metadata/3.json',
      'release-manifest.json',
      'sources/',
      'sources/agent-class-model.json',
      'sources/collection-provenance.json',
      'sources/hashlips-export-manifest.json',
      'sources/trait-personality-matrix.json',
    ]);

    const metadataEntries = [];
    const codexEntries = [];
    for (let id = 1; id <= 3; id += 1) {
      const metadata = await readFile(join(inputs.metadataDir, `${id}.json`));
      const codexFile = await readFile(join(inputs.codexDir, `${id}.json`));
      metadataEntries.push([id, metadata.byteLength, sha256(metadata)]);
      codexEntries.push([id, codexFile.byteLength, sha256(codexFile)]);
    }

    assert.deepEqual(manifest, {
      auditedAt: '2026-09-30T00:00:00.000Z',
      chainId: 8453,
      collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
      compilerVersion: '1.0.0',
      components: {
        agentClassModel: {
          byteLength: Buffer.byteLength(JSON.stringify({ classes: ['A', 'B'] })),
          path: 'sources/agent-class-model.json',
          sha256: sha256(JSON.stringify({ classes: ['A', 'B'] })),
        },
        codex: {
          byteLength: codexEntries.reduce((sum, entry) => sum + entry[1], 0),
          count: 3,
          path: 'codex',
          sha256: canonicalJsonHash(codexEntries),
        },
        collectionProvenance: {
          byteLength: Buffer.byteLength(JSON.stringify({ provenance: 'reviewed' })),
          path: 'sources/collection-provenance.json',
          sha256: sha256(JSON.stringify({ provenance: 'reviewed' })),
        },
        hashlipsExportManifest: {
          byteLength: Buffer.byteLength(JSON.stringify({ export: 'reviewed' })),
          path: 'sources/hashlips-export-manifest.json',
          sha256: sha256(JSON.stringify({ export: 'reviewed' })),
        },
        metadata: {
          byteLength: metadataEntries.reduce((sum, entry) => sum + entry[1], 0),
          count: 3,
          path: 'metadata',
          sha256: canonicalJsonHash(metadataEntries),
        },
        traitPersonalityMatrix: {
          byteLength: Buffer.byteLength(JSON.stringify({ matrix: 'v1' })),
          path: 'sources/trait-personality-matrix.json',
          sha256: sha256(JSON.stringify({ matrix: 'v1' })),
        },
      },
      count: 3,
      schemaVersion: '1.0.0',
    });

    const manifestBytes = await readFile(join(options.outputDir, 'release-manifest.json'), 'utf8');
    assert.equal(manifestBytes, `${canonicalJsonStringify(manifest)}\n`);
    assert.deepEqual(await verifyLooperCodexRelease({ releaseDir: options.outputDir }), manifest);
  });
});

test('release manifest numeric aggregate hashes use numeric ID order', async () => {
  await withTempDirectory(async (root) => {
    const directory = join(root, 'numbered # local path');
    await mkdir(directory);
    for (const id of [10, 2, 1, 9, 8, 7, 6, 5, 4, 3]) {
      await writeJson(join(directory, `${id}.json`), { id });
    }

    const inspected = await inspectNumberedJsonDirectory({
      directory,
      count: 10,
      perFileBytes: 1024,
      aggregateBytes: 10 * 1024,
    });
    assert.deepEqual(inspected.entries.map(([id]) => id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(inspected.sha256, canonicalJsonHash(inspected.entries));
  });
});

test('input bounds require regular non-symlink files', async () => {
  await withTempDirectory(async (root) => {
    const file = join(root, 'source.json');
    const link = join(root, 'source-link.json');
    await writeJson(file, { safe: true });
    await symlink(file, link);

    assert.deepEqual(await readRegularFile(file, { maxBytes: 1024 }), Buffer.from('{"safe":true}'));
    await assert.rejects(readRegularFile(link, { maxBytes: 1024 }), /regular non-symlink file/);
    await assert.rejects(readRegularFile(root, { maxBytes: 1024 }), /regular non-symlink file/);
  });
});

test('input bounds enforce per-file and aggregate byte limits', async () => {
  await withTempDirectory(async (root) => {
    const directory = join(root, 'numbered');
    await mkdir(directory);
    await writeFile(join(directory, '1.json'), '{"long":"value"}');
    await writeFile(join(directory, '2.json'), '{}');

    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 2, perFileBytes: 4, aggregateBytes: 100 }),
      /per-file byte limit/,
    );
    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 2, perFileBytes: 100, aggregateBytes: 10 }),
      /aggregate byte limit/,
    );
  });
});

test('release manifest rejects gaps, extra numbered files, malformed JSON, and symlink entries', async () => {
  await withTempDirectory(async (root) => {
    const directory = join(root, 'numbered');
    await mkdir(directory);
    await writeJson(join(directory, '1.json'), { id: 1 });
    await writeJson(join(directory, '3.json'), { id: 3 });
    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 3, perFileBytes: 1024, aggregateBytes: 4096 }),
      /missing numbered file 2.json/,
    );

    await writeJson(join(directory, '2.json'), { id: 2 });
    await writeJson(join(directory, '4.json'), { id: 4 });
    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 3, perFileBytes: 1024, aggregateBytes: 4096 }),
      /unexpected numbered file 4.json/,
    );

    await rm(join(directory, '4.json'));
    await writeFile(join(directory, '2.json'), '{bad json');
    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 3, perFileBytes: 1024, aggregateBytes: 4096 }),
      /malformed JSON in 2.json/,
    );

    await rm(join(directory, '2.json'));
    await symlink(join(directory, '1.json'), join(directory, '2.json'));
    await assert.rejects(
      inspectNumberedJsonDirectory({ directory, count: 3, perFileBytes: 1024, aggregateBytes: 4096 }),
      /regular non-symlink file/,
    );
  });
});

test('materializer refuses HTTP input and output paths without network access', async () => {
  await withTempDirectory(async (root) => {
    const inputs = await createMaterializerInputs(root);
    for (const override of [
      { metadataDir: 'https://example.test/metadata' },
      { codexDir: 'http://example.test/codex' },
      { traitPersonalityMatrixPath: 'https://example.test/matrix.json' },
      { outputDir: 'http://example.test/release' },
    ]) {
      await assert.rejects(
        materializeLooperCodexRelease(materializerOptions(root, inputs, override)),
        /local filesystem path/,
      );
    }
  });
});

test('release manifest requires and preserves an exact fixed audit time', async () => {
  await withTempDirectory(async (root) => {
    const inputs = await createMaterializerInputs(root);
    await assert.rejects(
      materializeLooperCodexRelease(materializerOptions(root, inputs, { auditedAt: undefined })),
      /auditedAt is required/,
    );
    await assert.rejects(
      materializeLooperCodexRelease(materializerOptions(root, inputs, { auditedAt: '2026-09-30' })),
      /canonical ISO-8601/,
    );
    const auditedAt = '2025-01-02T03:04:05.678Z';
    const manifest = await materializeLooperCodexRelease(
      materializerOptions(root, inputs, { auditedAt }),
    );
    assert.equal(manifest.auditedAt, auditedAt);
  });
});

test('materializer promotes a verified sibling temporary directory atomically', async () => {
  await withTempDirectory(async (root) => {
    const inputs = await createMaterializerInputs(root);
    const outputDir = join(root, 'published', 'release');
    const options = materializerOptions(root, inputs, { outputDir });
    await writeJson(join(inputs.metadataDir, '2.json'), { broken: undefined });
    await writeFile(join(inputs.metadataDir, '2.json'), '{broken');

    await assert.rejects(materializeLooperCodexRelease(options), /malformed JSON/);
    await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
    const siblingsAfterFailure = await readdir(dirname(outputDir)).catch(() => []);
    assert.deepEqual(siblingsAfterFailure, []);

    await writeJson(join(inputs.metadataDir, '2.json'), { id: 2, kind: 'metadata' });
    await materializeLooperCodexRelease(options);
    assert.equal((await lstat(outputDir)).isDirectory(), true);
    assert.deepEqual(await readdir(dirname(outputDir)), ['release']);
    await assert.rejects(materializeLooperCodexRelease(options), /output directory already exists/);
  });
});

test('release manifest verifier rejects altered bytes and extra portable files', async () => {
  await withTempDirectory(async (root) => {
    const inputs = await createMaterializerInputs(root);
    const options = materializerOptions(root, inputs);
    await materializeLooperCodexRelease(options);
    await writeJson(join(options.outputDir, 'metadata', '2.json'), { altered: true });
    await assert.rejects(
      verifyLooperCodexRelease({ releaseDir: options.outputDir }),
      /metadata component hash mismatch/,
    );

    await rm(options.outputDir, { recursive: true });
    await materializeLooperCodexRelease(options);
    await writeJson(join(options.outputDir, 'metadata', 'extra.json'), {});
    await assert.rejects(
      verifyLooperCodexRelease({ releaseDir: options.outputDir }),
      /unexpected entry extra.json/,
    );
  });
});

test('materializer root script accepts the literal pnpm -- separator', async () => {
  const { stdout, stderr } = await execFile(
    'pnpm',
    ['loopers:codex:materialize', '--', '--help'],
    { cwd: repositoryRoot, timeout: 30_000 },
  );
  assert.match(stdout, /materialize-looper-codex-release/);
  assert.equal(stderr, '');
});

test('record normalization cross-checks every duplicated field and freezes a closed record', () => {
  const fixture = createLooperRecordFixture();
  const record = codex.normalizeLooperRecord({ tokenId: 1, ...fixture });

  assert.deepEqual(Object.keys(record), [
    'tokenId', 'canonicalName', 'description', 'image', 'imageId', 'externalUrl',
    'visualTraits', 'traitAtoms', 'classProfile', 'personality', 'lore',
    'activation', 'recommendedSkills', 'versions',
  ]);
  assert.equal(record.tokenId, 1);
  assert.equal(record.imageId, '7lVgX4TEaRLBUSOe2uPNCmrMn-VROeHW9CeS2porrzM');
  assert.deepEqual(record.visualTraits, [
    { type: 'Background', value: 'Swarm Command Halo' },
    { type: 'Patch Artifact', value: 'Nyan Cat' },
  ]);
  assert.equal(record.classProfile.risk.value, 5);
  assert.equal(record.classProfile.risk.label, 'Balanced');
  assert.equal(record.classProfile.autonomy.value, 4);
  assert.equal(record.classProfile.autonomy.label, 'Guided');
  assert.equal(record.recommendedSkills[0].sourceClass, 'Trader / Broker');
  assert.equal(record.recommendedSkills[0].mapVersion, codex.LOOPER_SKILL_RECOMMENDATION_MAP_VERSION);
  assert.equal(record.recommendedSkills[0].status, 'recommended');
  assert.equal(JSON.stringify(record).includes('enabled'), false);
  assert.equal(JSON.stringify(record).includes('/home/'), false);
  assert.equal(JSON.stringify(record).includes('owner'), false);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.visualTraits));
  assert.ok(Object.isFrozen(record.traitAtoms[0]));
  assert.throws(() => record.visualTraits.push({ type: 'X', value: 'Y' }), TypeError);
});

test('image identity accepts reviewed Arweave and Turbo forms and rejects every other form', () => {
  const fixture = createLooperRecordFixture();
  assert.doesNotThrow(() => codex.normalizeLooperRecord({ tokenId: 1, ...fixture }));

  const swapped = cloneFixture(fixture);
  swapped.metadata.image = swapped.codex.image;
  swapped.codex.image = fixture.metadata.image;
  assert.doesNotThrow(() => codex.normalizeLooperRecord({ tokenId: 1, ...swapped }));

  for (const image of [
    'https://arweave.net/7lVgX4TEaRLBUSOe2uPNCmrMn-VROeHW9CeS2porrzM',
    'https://turbo-gateway.com/not-a-transaction',
    'ipfs://7lVgX4TEaRLBUSOe2uPNCmrMn-VROeHW9CeS2porrzM',
  ]) {
    const changed = cloneFixture(fixture);
    changed.metadata.image = image;
    assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...changed }), /image/i);
  }

  const mismatch = cloneFixture(fixture);
  mismatch.codex.image = 'ar://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...mismatch }), /image identity/i);
});

test('record normalization rejects all duplicated-field mismatch classes', () => {
  const cases = [
    ['token ID', (x) => { x.codex.token_id = 2; }],
    ['canonical name', (x) => { x.metadata.name = 'Looper #2'; }],
    ['token URI name', (x) => { x.codex.token_uri_name = 'Looper #2'; }],
    ['visual trait', (x) => { x.metadata.attributes[0].value = 'Other'; }],
    ['trait atom', (x) => { x.codex.trait_atoms[0].key = 'Background::Other'; }],
    ['primary class', (x) => { x.metadata.agent_class = 'Builder / Engineer'; }],
    ['secondary class', (x) => { x.metadata.secondary_class = null; }],
    ['specialization', (x) => { x.metadata.specialization = 'other'; }],
    ['risk label', (x) => { x.metadata.risk_profile = 'Other'; }],
    ['autonomy label', (x) => { x.metadata.attributes[6].value = 'Other'; }],
    ['Codex version', (x) => { x.metadata.trait_codex_version = 'other'; }],
    ['external URL', (x) => { x.metadata.external_url = 'https://example.com/1'; }],
    ['voice', (x) => { x.metadata.voice = 'other'; }],
    ['activation seed', (x) => { x.metadata.activation_seed = 'other'; }],
    ['first mission', (x) => { x.metadata.first_mission = 'other'; }],
    ['Cred evolution hint', (x) => { x.metadata.cred_evolution_hint = 'other'; }],
    ['source schema', (x) => { x.codex.schema_version = '9.9.9'; }],
    ['Codex link', (x) => { x.metadata.codex_uri = x.metadata.codex_uri.replace('/1.json', '/2.json'); }],
    ['metadata link', (x) => { x.codex.token_metadata_uri = x.codex.token_metadata_uri.replace('/1.json', '/2.json'); }],
  ];

  for (const [label, mutate] of cases) {
    const fixture = cloneFixture(createLooperRecordFixture());
    mutate(fixture);
    assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...fixture }), Error, label);
  }
});

test('record normalization rejects duplicate trait types and keys', () => {
  const duplicateMetadata = createLooperRecordFixture();
  duplicateMetadata.metadata.attributes.push({ trait_type: 'Background', value: 'Other' });
  assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...duplicateMetadata }), /duplicate metadata trait type/i);

  const duplicateSelected = createLooperRecordFixture();
  duplicateSelected.codex.selected_visual_traits[1] = { ...duplicateSelected.codex.selected_visual_traits[0] };
  assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...duplicateSelected }), /duplicate selected trait key/i);

  const duplicateAtom = createLooperRecordFixture();
  duplicateAtom.codex.trait_atoms[1].id = duplicateAtom.codex.trait_atoms[0].id;
  assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...duplicateAtom }), /duplicate trait atom id/i);
});

test('record normalization enforces closed fields and maximum text lengths', () => {
  for (const mutate of [
    (x) => { x.metadata.owner = '0xprivate'; },
    (x) => { x.codex.private_memory = 'secret'; },
    (x) => { x.codex.personality.extra = true; },
    (x) => { x.codex.selected_visual_traits[0].source_path = '/home/private/file.png'; },
    (x) => { x.codex.activation.first_missions.push('x'.repeat(257)); },
    (x) => { x.codex.lore.long_lore = 'x'.repeat(4097); },
    (x) => { x.codex.selected_visual_traits[0].trait = 'x'.repeat(97); },
  ]) {
    const fixture = cloneFixture(createLooperRecordFixture());
    mutate(fixture);
    assert.throws(() => codex.normalizeLooperRecord({ tokenId: 1, ...fixture }));
  }
});

test('recommendations are deterministic, provenance-labeled, and never enabled', () => {
  const first = codex.getRecommendedSkills('Trader / Broker');
  const second = codex.getRecommendedSkills('Trader / Broker');
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.ok(first.length > 0);
  for (const recommendation of first) {
    assert.deepEqual(Object.keys(recommendation), [
      'skillFamily', 'reason', 'sourceClass', 'mapVersion', 'status',
    ]);
    assert.equal(recommendation.sourceClass, 'Trader / Broker');
    assert.equal(recommendation.status, 'recommended');
    assert.equal(Object.hasOwn(recommendation, 'enabled'), false);
    assert.ok(Object.isFrozen(recommendation));
  }
  assert.throws(() => codex.getRecommendedSkills('Unknown Class'), /unknown class/i);
});

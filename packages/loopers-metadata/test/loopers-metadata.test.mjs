import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LooperMetadataError,
  compileLooperMetadataItems,
  compileLooperMetadataFromDirs,
  validateLooperMetadataBundle,
  writeLooperMetadataBundle,
} from '../src/index.js';

test('compileLooperMetadataItems canonicalizes HashLips filename values through the export manifest', () => {
  const bundle = compileLooperMetadataItems([hashlipsItem()], {
    personalityMatrix: fixturePersonalityMatrix(),
    classModel: fixtureClassModel(),
    exportManifest: fixtureExportManifest(),
    imageBaseUri: 'ar://images',
    codexBaseUri: 'ar://metadata/codex',
    externalUrlBase: 'https://helixa.xyz/multipass/loopers',
    generatedAt: '2026-08-27T00:00:00.000Z',
  });

  assert.equal(bundle.count, 1);
  const token = bundle.token_metadata[0];
  assert.equal(token.name, 'Looper #1');
  assert.equal(token.image, 'ar://images/1.png');
  assert.equal(token.codex_uri, 'ar://metadata/codex/1.json');
  assert.equal(token.agent_class, 'Builder / Engineer');
  assert.equal(token.secondary_class, 'CEO / Operator');
  assert.equal(token.attributes.some((attribute) => attribute.trait_type === 'Head Layer' && attribute.value === 'Right-Facing Trucker Cap'), true);
  assert.equal(token.attributes.some((attribute) => attribute.trait_type === 'Overlay' && attribute.value === 'Acid Rainbow Burst'), true);
  assert.equal(JSON.stringify(token).includes('Multipass Looper'), false);

  const codex = bundle.agent_codex[0];
  assert.equal(codex.name, token.name);
  assert.equal(codex.selected_visual_traits.some((trait) => trait.key === 'Head Layer::Right-Facing Trucker Cap'), true);
  assert.equal(codex.trait_atoms.length, codex.selected_visual_traits.length);
  assert.equal(validateLooperMetadataBundle(bundle).ok, true);
});

test('compileLooperMetadataItems fails final mode when class affinities are incomplete', () => {
  const model = fixtureClassModel();
  delete model.trait_affinities['Background::Agent Ops Cockpit'];

  assert.throws(
    () => compileLooperMetadataItems([hashlipsItem()], {
      personalityMatrix: fixturePersonalityMatrix(),
      classModel: model,
      exportManifest: fixtureExportManifest(),
      imageBaseUri: 'ar://images',
      codexBaseUri: 'ar://metadata/codex',
      externalUrlBase: 'https://helixa.xyz/multipass/loopers',
    }),
    (error) => error instanceof LooperMetadataError && /missing class affinity/.test(error.message),
  );
});

test('compileLooperMetadataItems rejects held-object and patch-artifact collisions', () => {
  const item = hashlipsItem();
  item.attributes = item.attributes.map((attribute) => {
    if (attribute.trait_type === 'Held Object') return { trait_type: 'Held Object', value: 'OpenClaw Terminal' };
    if (attribute.trait_type === 'Patch Artifact') return { trait_type: 'Patch Artifact', value: 'Nyan Cat' };
    return attribute;
  });

  assert.throws(
    () => compileLooperMetadataItems([item], {
      personalityMatrix: fixturePersonalityMatrix(),
      classModel: fixtureClassModel(),
      exportManifest: fixtureExportManifest(),
      imageBaseUri: 'ar://images',
      codexBaseUri: 'ar://metadata/codex',
      externalUrlBase: 'https://helixa.xyz/multipass/loopers',
    }),
    (error) => error instanceof LooperMetadataError && /cannot combine/.test(error.message),
  );
});

test('compileLooperMetadataFromDirs writes token metadata and Agent Codex output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loopers-metadata-'));
  const jsonDir = path.join(dir, 'hashlips-json');
  const outputDir = path.join(dir, 'final');
  await writeJson(path.join(jsonDir, '1.json'), hashlipsItem());
  await writeJson(path.join(dir, 'matrix.json'), fixturePersonalityMatrix());
  await writeJson(path.join(dir, 'classes.json'), fixtureClassModel());
  await writeJson(path.join(dir, 'manifest.json'), fixtureExportManifest());

  const bundle = await compileLooperMetadataFromDirs({
    hashlipsJsonDir: jsonDir,
    personalityMatrixPath: path.join(dir, 'matrix.json'),
    classModelPath: path.join(dir, 'classes.json'),
    exportManifestPath: path.join(dir, 'manifest.json'),
    imageBaseUri: 'ar://images',
    codexBaseUri: 'ar://metadata/codex',
    externalUrlBase: 'https://helixa.xyz/multipass/loopers',
    generatedAt: '2026-08-27T00:00:00.000Z',
  });

  await writeLooperMetadataBundle(bundle, outputDir);
  const token = JSON.parse(await readFile(path.join(outputDir, 'metadata/1.json'), 'utf8'));
  const codex = JSON.parse(await readFile(path.join(outputDir, 'codex/1.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));

  assert.equal(token.name, 'Looper #1');
  assert.equal(codex.token_id, 1);
  assert.equal(manifest.count, 1);
});

function hashlipsItem() {
  return {
    dna: 'example-dna',
    name: 'Looper #1',
    description: 'HashLips output',
    image: 'ipfs://example/1.png',
    edition: 1,
    date: 1770000000000,
    attributes: [
      { trait_type: 'Background', value: 'Agent Ops Cockpit' },
      { trait_type: 'Outfit', value: 'OpenClaw Hoodie' },
      { trait_type: 'Skin', value: 'Machine' },
      { trait_type: 'Eyes', value: 'Robot Eyes' },
      { trait_type: 'Mouth', value: 'Tape Mouth' },
      { trait_type: 'Head Layer', value: 'Right Facing Trucker Cap' },
      { trait_type: 'Eyewear', value: 'None' },
      { trait_type: 'Held Object', value: 'None' },
      { trait_type: 'Foreground Scraps', value: 'None' },
      { trait_type: 'Patch Artifact', value: 'None' },
      { trait_type: 'Overlay', value: '01 acid rainbow burst' },
    ],
    compiler: 'HashLips Art Engine',
  };
}

function fixtureExportManifest() {
  return {
    exported: fixturePersonalityMatrix().traits.map((atom) => ({
      layer: atom.layer,
      trait: atom.trait,
      path: `layers/${atom.layer}/${filenameForTrait(atom.trait)}#1.png`,
      applied_weight: 1,
    })),
  };
}

function filenameForTrait(trait) {
  if (trait === 'Right-Facing Trucker Cap') return 'Right Facing Trucker Cap';
  if (trait === 'Acid Rainbow Burst') return '01 acid rainbow burst';
  return trait;
}

function fixtureClassModel() {
  const classes = {
    ceo_operator: {
      label: 'CEO / Operator',
      common_read: 'operator',
      first_missions: ['route a task'],
    },
    builder_engineer: {
      label: 'Builder / Engineer',
      common_read: 'builder',
      first_missions: ['wire a tool', 'debug a workflow'],
    },
    seer_signal_hunter: {
      label: 'Seer / Signal Hunter',
      common_read: 'signal hunter',
      first_missions: ['watch anomalies'],
    },
  };
  return {
    version: 'fixture-class-model',
    classes,
    layer_influence: {
      Background: 3,
      Outfit: 5,
      Skin: 3,
      Eyes: 2,
      Mouth: 1,
      'Head Layer': 2,
      Eyewear: 1,
      'Held Object': 4,
      'Foreground Scraps': 1,
      'Patch Artifact': 1,
      Overlay: 2,
    },
    trait_affinities: Object.fromEntries(fixturePersonalityMatrix().traits
      .filter((atom) => atom.trait !== 'None')
      .map((atom) => [atom.key, affinityForAtom(atom)])),
  };
}

function affinityForAtom(atom) {
  if (atom.key === 'Outfit::OpenClaw Hoodie') return { classes: { builder_engineer: 4, ceo_operator: 2 }, specialization: 'agent operator' };
  if (atom.key === 'Skin::Machine') return { classes: { builder_engineer: 3, ceo_operator: 1 }, specialization: 'cold runtime' };
  if (atom.key === 'Eyes::Robot Eyes') return { classes: { builder_engineer: 2 }, specialization: 'state reader' };
  if (atom.key === 'Head Layer::Right-Facing Trucker Cap') return { classes: { ceo_operator: 8, builder_engineer: 1 }, specialization: 'parking-lot operator' };
  if (atom.key === 'Overlay::Acid Rainbow Burst') return { classes: { seer_signal_hunter: 1 }, specialization: 'acid burst' };
  if (atom.key === 'Held Object::OpenClaw Terminal') return { classes: { builder_engineer: 4 }, specialization: 'terminal jockey' };
  if (atom.key === 'Patch Artifact::Nyan Cat') return { classes: { seer_signal_hunter: 1 }, specialization: 'internet fossil' };
  return { classes: { builder_engineer: 1 } };
}

function fixturePersonalityMatrix() {
  const layers = [
    ['Background', 'Agent Ops Cockpit'],
    ['Outfit', 'OpenClaw Hoodie'],
    ['Skin', 'Machine'],
    ['Eyes', 'Robot Eyes'],
    ['Mouth', 'Tape Mouth'],
    ['Head Layer', 'Right-Facing Trucker Cap'],
    ['Eyewear', 'None'],
    ['Held Object', 'None'],
    ['Held Object', 'OpenClaw Terminal'],
    ['Foreground Scraps', 'None'],
    ['Patch Artifact', 'None'],
    ['Patch Artifact', 'Nyan Cat'],
    ['Overlay', 'Acid Rainbow Burst'],
  ];
  return {
    version: 'fixture-trait-matrix',
    traits: layers.map(([layer, trait], index) => ({
      key: `${layer}::${trait}`,
      id: `atom-${index}`,
      layer,
      trait,
      role: 'fixture role',
      layer_summary: 'Fixture summary.',
      applied_weight: 1,
      archetype: trait === 'None' ? 'bare read' : `${trait.toLowerCase()} archetype`,
      narrative_seed: `came up through ${trait.toLowerCase()}`,
      voice: `${trait.toLowerCase()} voice`,
      values: `${trait.toLowerCase()} values`,
      mission_bias: `${trait.toLowerCase()} mission`,
      quirk: `${trait.toLowerCase()} quirk`,
      prompt_tags: [trait.toLowerCase().replaceAll(' ', '-')],
      risk_delta: trait === 'Acid Rainbow Burst' ? 2 : 0,
      autonomy_delta: trait === 'OpenClaw Hoodie' ? 2 : 0,
    })),
  };
}

async function writeJson(filePath, value) {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(filePath), { recursive: true }));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

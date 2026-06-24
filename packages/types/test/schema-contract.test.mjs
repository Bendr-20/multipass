import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assuranceLevels,
  fragmentStatuses,
  fragmentTypes,
  schemaRegistry,
  standardStatuses,
  subjectTypes,
  visibilityLevels,
} from '../src/index.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '../../..');

const agentCardSchema = require('../schemas/agent-card.schema.json');
const identityFragmentSchema = require('../schemas/identity-fragment.schema.json');
const multipassProfileSchema = require('../schemas/multipass-profile.schema.json');
const receiptFragmentSchema = require('../schemas/receipt-fragment.schema.json');
const standardsProfileSchema = require('../schemas/standards-profile.schema.json');
const x402ManifestSchema = require('../schemas/x402-manifest.schema.json');

const expectedSchemas = [
  ['multipass-profile', multipassProfileSchema],
  ['identity-fragment', identityFragmentSchema],
  ['agent-card', agentCardSchema],
  ['standards-profile', standardsProfileSchema],
  ['x402-manifest', x402ManifestSchema],
  ['receipt-fragment', receiptFragmentSchema],
];

async function readDocsSchema(name) {
  const raw = await readFile(path.join(repoRoot, 'docs/schemas', `${name}.schema.json`), 'utf8');
  return JSON.parse(raw);
}

test('package registry exposes every public Multipass schema', () => {
  assert.equal(schemaRegistry.length, expectedSchemas.length);
  assert.deepEqual(
    schemaRegistry.map((entry) => entry.name).sort(),
    expectedSchemas.map(([name]) => name).sort(),
  );

  for (const [name, schema] of expectedSchemas) {
    const entry = schemaRegistry.find((item) => item.name === name);
    assert.ok(entry, `missing registry entry for ${name}`);
    assert.equal(entry.id, schema.$id);
    assert.equal(entry.title, schema.title);
    assert.equal(entry.schema, schema);
  }
});

test('packaged schemas stay in sync with docs schemas', async () => {
  for (const [name, schema] of expectedSchemas) {
    assert.deepEqual(schema, await readDocsSchema(name));
  }
});

test('shared enum exports match schema contracts', () => {
  assert.deepEqual(subjectTypes, ['agent', 'human', 'swarm', 'collection', 'project', 'organization']);
  assert.deepEqual(fragmentStatuses, ['pending', 'verified', 'stale', 'revoked', 'disputed', 'historical']);
  assert.deepEqual(assuranceLevels, [
    'unverified',
    'self_attested',
    'platform_verified',
    'cryptographic',
    'issuer_attested',
    'onchain_verified',
  ]);
  assert.deepEqual(visibilityLevels, ['public', 'gated', 'private', 'hidden']);

  assert.deepEqual(
    multipassProfileSchema.properties.subject_type.enum,
    subjectTypes,
  );
  assert.deepEqual(
    identityFragmentSchema.properties.status.enum,
    fragmentStatuses,
  );
  assert.deepEqual(
    identityFragmentSchema.properties.assurance_level.enum,
    assuranceLevels,
  );
  assert.deepEqual(
    identityFragmentSchema.properties.visibility.enum,
    visibilityLevels,
  );
});

test('standards adapter statuses preserve non-happy-path states', () => {
  assert.deepEqual(standardStatuses, [
    'active',
    'adapter_ready',
    'pending',
    'stale',
    'disputed',
    'revoked',
    'unsupported',
    'imported_unverified',
  ]);

  assert.deepEqual(
    standardsProfileSchema.properties.standard_refs.items.properties.status.enum,
    standardStatuses,
  );
});

test('draft profiles can omit verified custody until activation', () => {
  const custodyEpoch = multipassProfileSchema.properties.custody_epoch;
  assert.ok(custodyEpoch.anyOf.some((branch) => branch.type === 'null'));
  assert.ok(custodyEpoch.anyOf.some((branch) => branch.type === 'object'));
});

test('identity fragments have direct shapes for endpoint, custody, and verification records', () => {
  assert.ok(fragmentTypes.includes('endpoint'));
  assert.ok(fragmentTypes.includes('custody_record'));
  assert.ok(fragmentTypes.includes('verification_result'));

  assert.deepEqual(identityFragmentSchema.properties.fragment_type.enum, fragmentTypes);
  assert.ok(identityFragmentSchema.properties.endpoint_ref);
  assert.ok(identityFragmentSchema.properties.custody_ref);
  assert.ok(identityFragmentSchema.properties.verification_ref);
  assert.ok(identityFragmentSchema.properties.verified_at);
  assert.ok(identityFragmentSchema.properties.revoked_at);
  assert.ok(identityFragmentSchema.properties.expires_at);
});

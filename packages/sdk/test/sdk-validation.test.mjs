import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MultipassValidationError,
  assertMultipassProfile,
  getSchema,
  loadAgentCardFromFile,
  loadIdentityFragmentFromFile,
  loadMultipassProfileFromFile,
  loadReceiptFragmentFromFile,
  loadStandardsProfileFromFile,
  loadX402ManifestFromFile,
  parseAgentCardJson,
  parseIdentityFragmentJson,
  parseMultipassProfileJson,
  parseReceiptFragmentJson,
  parseStandardsProfileJson,
  parseX402ManifestJson,
  validateAgentCard,
  validateIdentityFragment,
  validateMultipassProfile,
  validateReceiptFragment,
  validateStandardsProfile,
  validateX402Manifest,
} from '../src/index.js';

const profile = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  subject_type: 'agent',
  display_name: 'Bendr 2.0',
  slug: 'bendr-2',
  status: 'draft',
  owner_summary: {
    owner_state: 'unclaimed',
    verification_status: 'none',
    visibility: 'public',
  },
  custody_epoch: null,
  public_fragments: [],
  cred_summary: {
    trust_state: 'none',
    attestation_count: 0,
    receipt_count: 0,
    last_updated_at: null,
  },
  discovery_profile: {
    summary: 'A Multipass profile used for SDK tests.',
    tags: ['test'],
    visibility: 'public',
  },
  standards_profile: {
    standards_profile_id: 'sp_bendr',
    supported_standard_ids: ['ERC-8004'],
    last_verified_at: null,
  },
  payment_profile: {
    accepted_assets: [{ asset: 'CRED', chain_id: 8453 }],
    x402_manifest_url: null,
    paid_endpoints_enabled: false,
  },
  updated_at: '2026-06-24T00:00:00Z',
};

const identityFragment = {
  schema_version: '0.1.0',
  fragment_id: 'frag_wallet',
  multipass_id: 'mp_bendr',
  fragment_type: 'wallet',
  status: 'pending',
  assurance_level: 'unverified',
  visibility: 'public',
  transfer_policy: 'reverify_on_transfer',
  source: {
    source_type: 'owner_submission',
    source_id: 'submission_1',
    issuer: null,
    observed_at: '2026-06-24T00:00:00Z',
  },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
};

const agentCard = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  name: 'Bendr 2.0',
  subject_type: 'agent',
  capabilities: [],
  message_routes: [],
  service_endpoints: [],
  x402_manifest_url: null,
  accepted_assets: [],
  trust_summary: {
    identity_status: 'unverified',
    assurance_level: 'unverified',
    last_updated_at: null,
  },
  rate_limits: {
    requests: 0,
    window_seconds: 60,
  },
  contact_policy: {
    mode: 'approval_required',
    requires_owner_approval: true,
  },
  standards_refs: [],
};

const standardsProfile = {
  schema_version: '0.1.0',
  standards_profile_id: 'sp_bendr',
  multipass_id: 'mp_bendr',
  primary_refs: {},
  standard_refs: [
    {
      standard_id: 'ERC-8004',
      status: 'stale',
      chain_id: 8453,
      contract_address: null,
      record_id: '1',
      adapter_version: '0.1.0',
      last_verified_at: null,
      assurance_level: 'unverified',
    },
  ],
  compatibility_summary: {
    identity_bound: false,
    owner_verified: false,
    risk_checked: false,
    tools_verified: false,
    work_attested: false,
    trust_updated: false,
  },
  adapter_versions: { 'ERC-8004': '0.1.0' },
  last_verified_at: null,
};

const x402Manifest = {
  schema_version: '0.1.0',
  multipass_id: 'mp_bendr',
  endpoints: [
    {
      endpoint_id: 'lookup',
      url: 'https://api.example.test/multipass/mp_bendr',
      method: 'GET',
      description: 'Lookup profile.',
      price: { amount: '1', decimals: 18 },
      asset: 'CRED',
      chain_id: 8453,
      provider: 'bankr_x402_cloud',
      settlement_reference_policy: 'provider_receipt',
      rate_limit: { requests: 10, window_seconds: 60 },
      visibility: 'public',
      requires_owner_approval: false,
    },
  ],
};

const receiptFragment = {
  schema_version: '0.1.0',
  receipt_id: 'receipt_1',
  multipass_id: 'mp_bendr',
  endpoint_id: 'lookup',
  provider: 'bankr_x402_cloud',
  amount: '1',
  asset: 'CRED',
  chain_id: 8453,
  status: 'settled',
  created_at: '2026-06-24T00:00:00Z',
  response_class: 'success',
};

const cases = [
  ['multipass-profile', profile, validateMultipassProfile, parseMultipassProfileJson, loadMultipassProfileFromFile],
  ['identity-fragment', identityFragment, validateIdentityFragment, parseIdentityFragmentJson, loadIdentityFragmentFromFile],
  ['agent-card', agentCard, validateAgentCard, parseAgentCardJson, loadAgentCardFromFile],
  ['standards-profile', standardsProfile, validateStandardsProfile, parseStandardsProfileJson, loadStandardsProfileFromFile],
  ['x402-manifest', x402Manifest, validateX402Manifest, parseX402ManifestJson, loadX402ManifestFromFile],
  ['receipt-fragment', receiptFragment, validateReceiptFragment, parseReceiptFragmentJson, loadReceiptFragmentFromFile],
];

test('getSchema returns public schema objects by name', () => {
  const schema = getSchema('multipass-profile');
  assert.equal(schema.title, 'Multipass Profile');
  assert.equal(schema.$id, 'https://schemas.helixa.ai/multipass/multipass-profile.schema.json');
  assert.equal(getSchema('missing-schema'), null);
});

test('validators accept minimal valid Multipass documents', () => {
  for (const [name, sample, validate] of cases) {
    const result = validate(sample);
    assert.equal(result.ok, true, `${name} should validate`);
    assert.deepEqual(result.errors, []);
    assert.equal(result.value, sample);
  }
});

test('validators return useful path errors for invalid documents', () => {
  const invalid = { ...profile, subject_type: 'robot' };
  const result = validateMultipassProfile(invalid);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'subject_type');
  assert.match(result.errors[0].message, /expected one of/);
});

test('assert helpers throw typed validation errors', () => {
  const invalid = { ...profile };
  delete invalid.schema_version;

  assert.throws(
    () => assertMultipassProfile(invalid),
    (error) => {
      assert.ok(error instanceof MultipassValidationError);
      assert.equal(error.schemaName, 'multipass-profile');
      assert.equal(error.errors[0].path, 'schema_version');
      return true;
    },
  );
});

test('JSON parsers validate every public document shape', () => {
  for (const [name, sample, , parseJson] of cases) {
    assert.deepEqual(parseJson(JSON.stringify(sample)), sample, `${name} should parse`);
  }
});

test('JSON parser errors include parse context', () => {
  assert.throws(
    () => parseMultipassProfileJson('{'),
    (error) => {
      assert.ok(error instanceof MultipassValidationError);
      assert.equal(error.schemaName, 'multipass-profile');
      assert.equal(error.errors[0].path, '$');
      assert.match(error.errors[0].message, /invalid JSON/);
      return true;
    },
  );
});

test('file loaders read and validate every public document shape', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multipass-sdk-'));

  try {
    for (const [name, sample, , , loadFromFile] of cases) {
      const file = path.join(dir, `${name}.json`);
      await writeFile(file, JSON.stringify(sample), 'utf8');
      assert.deepEqual(await loadFromFile(file), sample, `${name} should load`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Keep readFile imported intentionally covered by the file loader behavior above.
void readFile;

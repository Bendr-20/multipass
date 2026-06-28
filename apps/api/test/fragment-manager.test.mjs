import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertManagerEditableFragment,
  normalizeManagerFragmentInput,
  normalizeManagerFragmentPatch,
  summarizePublicFragments,
} from '../src/fragment-manager.js';

const NOW = '2026-06-27T00:10:00.000Z';
const MP = 'mp_helixa_agent_1';
const OWNER = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

function fakeRandomHex() {
  let count = 0;
  return () => `fixed${++count}`;
}

function makeManagerFragment(overrides = {}) {
  return normalizeManagerFragmentInput({
    fragment_type: 'wallet',
    public_value: OWNER,
    ...overrides,
  }, { multipassId: MP, now: NOW, randomHex: fakeRandomHex() });
}

test('normalizes manager wallet fragments with lowercase stored wallet and public issuer null', () => {
  const fragment = makeManagerFragment({ reference_url: 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });

  assert.equal(fragment.fragment_id, 'frag_manager_wallet_fixed1');
  assert.equal(fragment.public_value, OWNER.toLowerCase());
  assert.equal(fragment.fragment_type, 'wallet');
  assert.equal(fragment.status, 'pending');
  assert.equal(fragment.assurance_level, 'self_attested');
  assert.equal(fragment.visibility, 'public');
  assert.equal(fragment.transfer_policy, 'reverify_on_transfer');
  assert.equal(fragment.source.source_type, 'owner_submission');
  assert.equal(fragment.source.source_id, 'manager:frag_manager_wallet_fixed1');
  assert.equal(fragment.source.issuer, null);
  assert.equal(fragment.source.reference_url, 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
});

test('normalizes endpoint fragments and rejects endpoint refs for non-endpoint fragments', () => {
  const fragment = makeManagerFragment({
    fragment_type: 'endpoint',
    public_value: 'Public profile JSON endpoint.',
    endpoint_ref: {
      endpoint_id: 'profile-json',
      url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1',
      protocol: 'api',
      manifest_url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1/x402',
    },
  });

  assert.equal(fragment.transfer_policy, 'pause_on_transfer');
  assert.equal(fragment.endpoint_ref.endpoint_id, 'profile-json');
  assert.equal(fragment.endpoint_ref.protocol, 'api');
  assert.throws(
    () => makeManagerFragment({ endpoint_ref: { endpoint_id: 'not-wallet', url: 'https://example.test', protocol: 'api' } }),
    /endpoint_ref is only allowed for endpoint fragments/,
  );
});

test('rejects blocked types non-public visibility unsafe strings and non-https urls', () => {
  assert.throws(() => makeManagerFragment({ fragment_type: 'risk_summary', public_value: 'Cred 999' }), /not allowed/);
  assert.throws(() => makeManagerFragment({ visibility: 'private' }), /public/);
  assert.throws(() => makeManagerFragment({ public_value: '<script>alert(1)</script>' }), /unsafe/);
  assert.throws(() => makeManagerFragment({ reference_url: 'http://example.test' }), /https/);
  assert.throws(() => makeManagerFragment({ fragment_type: 'endpoint', endpoint_ref: { endpoint_id: 'bad', url: 'http://example.test', protocol: 'api' } }), /https/);
});

test('normalizes safe patch fields and lowercases wallet patch values', () => {
  const existing = makeManagerFragment();
  const patched = normalizeManagerFragmentPatch(existing, {
    public_value: OWNER,
    reference_url: 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    proof_reference: 'owner note',
    status: 'stale',
    transfer_policy: 'historical_on_transfer',
  }, { now: '2026-06-27T00:15:00.000Z' });

  assert.equal(patched.public_value, OWNER.toLowerCase());
  assert.equal(patched.source.reference_url, 'https://basescan.org/address/0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal(patched.proof_reference, 'owner note');
  assert.equal(patched.status, 'stale');
  assert.equal(patched.transfer_policy, 'historical_on_transfer');
  assert.equal(patched.updated_at, '2026-06-27T00:15:00.000Z');
});

test('rejects imported fragments as read-only and summarizes public fragments for profiles', () => {
  const editable = makeManagerFragment();
  const imported = {
    ...editable,
    fragment_id: 'frag_imported_cred',
    fragment_type: 'risk_summary',
    source: { source_type: 'registry_import', source_id: 'helixa-api:cred:1', issuer: 'Helixa', observed_at: NOW },
  };

  assert.doesNotThrow(() => assertManagerEditableFragment(editable));
  assert.throws(() => assertManagerEditableFragment(imported), /read-only|not editable/i);
  assert.deepEqual(summarizePublicFragments([editable, { ...editable, fragment_id: 'private', visibility: 'private' }]), [{
    fragment_id: editable.fragment_id,
    fragment_type: editable.fragment_type,
    status: editable.status,
    assurance_level: editable.assurance_level,
    visibility: editable.visibility,
    updated_at: editable.updated_at,
  }]);
});

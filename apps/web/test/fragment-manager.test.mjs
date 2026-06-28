import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  bindFragmentManager,
  compactFragmentInput,
  compactFragmentPatch,
  mergeFragmentMutationState,
  renderFragmentManagerPanel,
} from '../src/fragment-manager.js';

const OWNER_FRAGMENT = {
  schema_version: '0.1.0',
  fragment_id: 'frag_manager_wallet_1',
  multipass_id: 'mp_helixa_agent_1',
  fragment_type: 'wallet',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  transfer_policy: 'reverify_on_transfer',
  source: { source_type: 'owner_submission', source_id: 'manager:wallet:1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
  public_value: '0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
  proof_reference: 'owner note',
  created_at: '2026-06-27T00:10:00.000Z',
  updated_at: '2026-06-27T00:10:00.000Z',
};

const IMPORTED_FRAGMENT = {
  ...OWNER_FRAGMENT,
  fragment_id: 'frag_imported_cred',
  fragment_type: 'risk_summary',
  status: 'verified',
  assurance_level: 'platform_verified',
  source: { source_type: 'registry_import', source_id: 'helixa-api:cred:1', issuer: 'Helixa', observed_at: '2026-06-27T00:10:00.000Z' },
  public_value: 'Cred context imported from Helixa API.',
};

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main id="app">${html}</main>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document.querySelector('#app');
}

test('renderFragmentManagerPanel exposes public-only safety copy editable fields and imported read-only rows', () => {
  const root = setup(renderFragmentManagerPanel({
    data: { fragments: { fragments: [OWNER_FRAGMENT, IMPORTED_FRAGMENT] } },
    fragmentError: 'Fragment update failed.',
  }));

  const panel = root.querySelector('.fragment-manager-panel');
  assert.ok(panel);
  assert.match(panel.textContent, /Public fragments only/i);
  assert.match(panel.textContent, /Does not edit Cred score/i);
  assert.match(panel.textContent, /Fragment update failed/);

  const createForm = root.querySelector('[data-action="create-public-fragment"]');
  assert.ok(createForm.querySelector('select[name="fragment_type"]'));
  assert.ok(createForm.querySelector('input[name="reference_url"]'));
  assert.ok(createForm.querySelector('input[name="proof_reference"]'));
  assert.ok(createForm.querySelector('[data-endpoint-fields]'));

  const editForm = root.querySelector('[data-action="update-public-fragment"]');
  assert.equal(editForm.dataset.fragmentId, 'frag_manager_wallet_1');
  assert.ok(editForm.querySelector('input[name="public_value"]'));
  assert.ok(editForm.querySelector('input[name="reference_url"]'));
  assert.ok(editForm.querySelector('input[name="proof_reference"]'));
  assert.ok(editForm.querySelector('select[name="status"]'));
  assert.ok(editForm.querySelector('select[name="transfer_policy"]'));
  assert.equal(root.querySelectorAll('[data-action="update-public-fragment"]').length, 1);
  assert.match(panel.textContent, /Imported fragment. Read-only here./);
});

test('compactFragmentInput includes endpoint_ref only for endpoint fragments', () => {
  const form = setup(`
    <form>
      <select name="fragment_type"><option value="endpoint" selected>endpoint</option></select>
      <input name="public_value" value="Profile JSON endpoint" />
      <input name="reference_url" value="https://helixa.xyz/multipass/bendr-2-1" />
      <input name="proof_reference" value="owner note" />
      <select name="transfer_policy"><option value="pause_on_transfer" selected>pause_on_transfer</option></select>
      <input name="endpoint_id" value="profile-json" />
      <input name="endpoint_url" value="https://helixa.xyz/multipass-api/api/multipass/bendr-2-1" />
      <select name="endpoint_protocol"><option value="api" selected>api</option></select>
    </form>
  `).querySelector('form');
  const formData = new window.FormData(form);

  assert.deepEqual(compactFragmentInput(formData), {
    fragment_type: 'endpoint',
    public_value: 'Profile JSON endpoint',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1',
    proof_reference: 'owner note',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: {
      endpoint_id: 'profile-json',
      url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1',
      protocol: 'api',
    },
  });

  form.querySelector('select[name="fragment_type"]').value = 'wallet';
  assert.equal(compactFragmentInput(new window.FormData(form)).endpoint_ref, undefined);
});

test('compactFragmentPatch covers all safe update fields', () => {
  const form = setup(`
    <form>
      <input name="public_value" value="Primary public wallet" />
      <input name="reference_url" value="https://basescan.org/address/0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea" />
      <input name="proof_reference" value="owner note" />
      <select name="status"><option value="stale" selected>stale</option></select>
      <select name="transfer_policy"><option value="pause_on_transfer" selected>pause_on_transfer</option></select>
      <input name="endpoint_id" value="profile-json" />
      <input name="endpoint_url" value="https://helixa.xyz/multipass-api/api/multipass/bendr-2-1" />
      <select name="endpoint_protocol"><option value="api" selected>api</option></select>
    </form>
  `).querySelector('form');

  assert.deepEqual(compactFragmentPatch(new window.FormData(form)), {
    public_value: 'Primary public wallet',
    reference_url: 'https://basescan.org/address/0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea',
    proof_reference: 'owner note',
    status: 'stale',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: {
      endpoint_id: 'profile-json',
      url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1',
      protocol: 'api',
    },
  });
});

test('bindFragmentManager dispatches create update revoke and toggles endpoint fields', () => {
  const root = setup(renderFragmentManagerPanel({ data: { fragments: { fragments: [OWNER_FRAGMENT] } } }));
  const calls = [];
  bindFragmentManager(root, {
    createPublicFragment: (event) => calls.push(['create', event.currentTarget.dataset.action]),
    updatePublicFragment: (event) => calls.push(['update', event.currentTarget.dataset.fragmentId]),
    revokePublicFragment: (event) => calls.push(['revoke', event.currentTarget.dataset.fragmentId]),
  });

  const typeSelect = root.querySelector('[data-action="create-public-fragment"] select[name="fragment_type"]');
  const endpointFields = root.querySelector('[data-endpoint-fields]');
  assert.equal(endpointFields.hidden, true);
  typeSelect.value = 'endpoint';
  typeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(endpointFields.hidden, false);

  root.querySelector('[data-action="create-public-fragment"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="update-public-fragment"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="revoke-public-fragment"]').click();

  assert.deepEqual(calls, [
    ['create', 'create-public-fragment'],
    ['update', 'frag_manager_wallet_1'],
    ['revoke', 'frag_manager_wallet_1'],
  ]);
});

test('mergeFragmentMutationState updates profile and fragments without losing claim state', () => {
  const current = { claimCsrfToken: 'csrf-1', data: { profile: { slug: 'bendr-2-1', display_name: 'Bendr' }, fragments: { fragments: [] } } };
  const next = mergeFragmentMutationState(current, {
    profile: { slug: 'bendr-2-1', display_name: 'Bendr', public_fragments: [{ fragment_id: 'frag_1' }] },
    fragments: { schema_version: '0.1.0', multipass_id: 'mp_1', fragments: [OWNER_FRAGMENT] },
  }, { fragmentStatus: 'fragment_created' });

  assert.equal(next.claimCsrfToken, 'csrf-1');
  assert.equal(next.fragmentStatus, 'fragment_created');
  assert.deepEqual(next.data.profile.public_fragments, [{ fragment_id: 'frag_1' }]);
  assert.deepEqual(next.data.fragments.fragments, [OWNER_FRAGMENT]);
});

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  bindRouteManager,
  compactRouteInput,
  compactRoutePatch,
  createUniqueRouteId,
  getPublicRouteFragments,
  renderPublicRoutesManagerPanel,
  renderPublicRoutesPanel,
  validateRouteInput,
  validateRoutePatch,
} from '../src/route-manager.js';

const OWNER_ROUTE = {
  schema_version: '0.1.0',
  fragment_id: 'frag_manager_profile',
  multipass_id: 'mp_helixa_agent_1',
  fragment_type: 'endpoint',
  status: 'pending',
  assurance_level: 'self_attested',
  visibility: 'public',
  transfer_policy: 'pause_on_transfer',
  source: { source_type: 'owner_submission', source_id: 'manager:route:1', issuer: null, observed_at: '2026-06-26T23:50:00.000Z', reference_url: 'https://ignored.example.test/proof' },
  public_value: 'Primary public profile',
  endpoint_ref: { endpoint_id: 'primary-public-profile', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
  created_at: '2026-06-27T00:05:00.000Z',
  updated_at: '2026-06-27T00:10:00.000Z',
};

const IMPORTED_ROUTE = {
  ...OWNER_ROUTE,
  fragment_id: 'frag_imported_profile',
  status: 'verified',
  assurance_level: 'platform_verified',
  transfer_policy: 'reverify_on_transfer',
  source: { source_type: 'registry_import', source_id: 'helixa-api:endpoint:1', issuer: 'Helixa', observed_at: '2026-06-27T00:12:00.000Z', reference_url: 'https://api.helixa.xyz/api/v2/agent/1' },
  public_value: 'Imported API profile',
  endpoint_ref: { endpoint_id: 'imported-profile', url: 'https://api.helixa.xyz/api/v2/agent/1', protocol: 'api' },
  created_at: '2026-06-27T00:06:00.000Z',
  updated_at: '2026-06-27T00:06:00.000Z',
};

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main id="app">${html}</main>`, { url: 'https://helixa.xyz/multipass/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document.querySelector('#app');
}

test('createUniqueRouteId creates route-safe IDs with collision suffixes and truncation', () => {
  assert.equal(createUniqueRouteId('Primary public profile', []), 'primary-public-profile');
  assert.equal(createUniqueRouteId('Primary public profile', ['primary-public-profile']), 'primary-public-profile-2');
  assert.equal(createUniqueRouteId('Primary public profile', [IMPORTED_ROUTE]), 'primary-public-profile');
  assert.equal(createUniqueRouteId('Imported profile', [IMPORTED_ROUTE]), 'imported-profile-2');

  const long = createUniqueRouteId('A'.repeat(100), ['a'.repeat(80)]);
  assert.equal(long.endsWith('-2'), true);
  assert.equal(long.length <= 80, true);
});

test('getPublicRouteFragments orders manager routes imported routes then revoked routes with stable fallbacks', () => {
  const revoked = { ...OWNER_ROUTE, fragment_id: 'frag_revoked', status: 'revoked', updated_at: '2026-06-27T01:00:01.000Z', endpoint_ref: { endpoint_id: 'revoked', url: 'https://helixa.xyz/revoked', protocol: 'web' } };
  const olderOwner = { ...OWNER_ROUTE, fragment_id: 'frag_owner_old', updated_at: '2026-06-27T00:06:00.000Z', endpoint_ref: { endpoint_id: 'old', url: 'https://helixa.xyz/old', protocol: 'web' } };
  const fallbackA = { ...IMPORTED_ROUTE, fragment_id: 'frag_a', updated_at: undefined, created_at: undefined, source: { ...IMPORTED_ROUTE.source, observed_at: '2026-06-26T23:55:00.000Z' }, endpoint_ref: { endpoint_id: 'a', url: 'https://helixa.xyz/a', protocol: 'web' } };
  const fallbackB = { ...IMPORTED_ROUTE, fragment_id: 'frag_b', updated_at: undefined, created_at: undefined, source: { ...IMPORTED_ROUTE.source, observed_at: '2026-06-26T23:55:00.000Z' }, endpoint_ref: { endpoint_id: 'b', url: 'https://helixa.xyz/b', protocol: 'web' } };
  const hidden = { ...OWNER_ROUTE, fragment_id: 'frag_hidden', visibility: 'hidden', endpoint_ref: { endpoint_id: 'hidden', url: 'https://helixa.xyz/hidden', protocol: 'web' } };
  const missingUrl = { ...OWNER_ROUTE, fragment_id: 'frag_missing_url', endpoint_ref: { endpoint_id: 'missing', protocol: 'web' } };

  assert.deepEqual(
    getPublicRouteFragments({ fragments: { fragments: [revoked, IMPORTED_ROUTE, fallbackB, hidden, missingUrl, olderOwner, OWNER_ROUTE, fallbackA] } }).map((route) => route.fragment_id),
    ['frag_manager_profile', 'frag_owner_old', 'frag_imported_profile', 'frag_a', 'frag_b', 'frag_revoked'],
  );
});

test('renderPublicRoutesPanel uses endpoint_ref URL primary labels and safe inert URLs', () => {
  const unsafe = {
    ...OWNER_ROUTE,
    fragment_id: 'frag_unsafe',
    status: 'stale',
    endpoint_ref: { endpoint_id: 'unsafe', url: 'javascript:alert(1)', protocol: 'web' },
    source: { ...OWNER_ROUTE.source, reference_url: 'https://assets.example.test/not-canonical' },
    public_value: 'Unsafe legacy route',
    updated_at: '2026-06-27T00:07:00.000Z',
  };
  const root = setup(renderPublicRoutesPanel({ fragments: { fragments: [unsafe, OWNER_ROUTE] } }));
  const panel = root.querySelector('.public-routes-panel');
  assert.ok(panel);
  assert.equal(panel.querySelector('.public-route-card.primary strong')?.textContent, 'Primary public profile');
  assert.match(panel.textContent, /Primary route/);
  assert.match(panel.textContent, /Recheck on owner change/);
  assert.equal(panel.querySelector('a')?.getAttribute('href'), 'https://helixa.xyz/multipass/bendr-2-1');
  assert.equal(panel.querySelector('a[href^="javascript:"]'), null);
  assert.equal(panel.innerHTML.includes('https://assets.example.test/not-canonical'), false);
  assert.doesNotMatch(panel.textContent, /execute|approve|connect|authorize|grant tool access|release credentials|credential release|tool control|transfer|activate tools/i);
});

test('renderPublicRoutesPanel promotes next eligible route when the newest route is revoked', () => {
  const revoked = { ...OWNER_ROUTE, fragment_id: 'frag_revoked', status: 'revoked', updated_at: '2026-06-27T01:00:01.000Z', endpoint_ref: { endpoint_id: 'revoked', url: 'https://helixa.xyz/revoked', protocol: 'web' } };
  const root = setup(renderPublicRoutesPanel({ fragments: { fragments: [revoked, IMPORTED_ROUTE] } }));
  assert.equal(root.querySelector('.public-route-card.primary')?.dataset.fragmentId, 'frag_imported_profile');
});

test('renderPublicRoutesManagerPanel marks imported routes read-only and exposes safe edit forms', () => {
  const root = setup(renderPublicRoutesManagerPanel({ data: { fragments: { fragments: [OWNER_ROUTE, IMPORTED_ROUTE] } } }));
  const panel = root.querySelector('.route-manager-panel');
  assert.ok(panel);
  assert.ok(panel.querySelector('[data-action="create-public-route"]'));
  assert.equal(panel.querySelectorAll('[data-action="update-public-route"]').length, 1);
  assert.match(panel.textContent, /Imported route\. Read-only here\./);
  assert.match(panel.textContent, /Review behavior/);
  assert.doesNotMatch(panel.textContent, /execute|approve|connect|authorize|grant tool access|release credentials|credential release|tool control|transfer|activate tools/i);
});

test('validateRouteInput rejects unsafe route create values before API writes', () => {
  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: '',
    endpoint_ref: { endpoint_id: 'empty-label', url: 'https://helixa.xyz/a', protocol: 'web' },
  }, []), /Route label is required/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Missing URL',
    endpoint_ref: { endpoint_id: 'missing-url', url: '', protocol: 'web' },
  }, []), /HTTPS URL/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'HTTP URL',
    endpoint_ref: { endpoint_id: 'http-url', url: 'http://example.test/not-safe', protocol: 'web' },
  }, []), /HTTPS URL/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Unsafe URL',
    endpoint_ref: { endpoint_id: 'unsafe-url', url: 'javascript:alert(1)', protocol: 'web' },
  }, []), /HTTPS URL/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Duplicate route',
    endpoint_ref: { endpoint_id: 'imported-profile', url: 'https://helixa.xyz/a', protocol: 'web' },
  }, [IMPORTED_ROUTE]), /already exists/);

  assert.deepEqual(validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Valid route',
    endpoint_ref: { endpoint_id: 'valid-route', url: 'https://helixa.xyz/a', protocol: 'mcp' },
  }, []), {
    fragment_type: 'endpoint',
    public_value: 'Valid route',
    endpoint_ref: { endpoint_id: 'valid-route', url: 'https://helixa.xyz/a', protocol: 'mcp' },
  });

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Bad ID',
    endpoint_ref: { endpoint_id: 'bad id', url: 'https://helixa.xyz/a', protocol: 'web' },
  }, []), /Route ID/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Spaced ID',
    endpoint_ref: { endpoint_id: ' spaced-route ', url: 'https://helixa.xyz/a', protocol: 'web' },
  }, []), /Route ID/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Bad protocol',
    endpoint_ref: { endpoint_id: 'bad-protocol', url: 'https://helixa.xyz/a', protocol: 'ftp' },
  }, []), /Route type/);

  assert.throws(() => validateRouteInput({
    fragment_type: 'endpoint',
    public_value: 'Spaced protocol',
    endpoint_ref: { endpoint_id: 'spaced-protocol', url: 'https://helixa.xyz/a', protocol: ' web ' },
  }, []), /Route type/);
});

test('validateRoutePatch excludes current route from duplicate checks and rejects read-only routes', () => {
  assert.doesNotThrow(() => validateRoutePatch({
    public_value: 'Primary public profile',
    endpoint_ref: { endpoint_id: 'primary-public-profile', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    status: 'pending',
  }, OWNER_ROUTE, [OWNER_ROUTE, IMPORTED_ROUTE]));

  assert.throws(() => validateRoutePatch({
    public_value: 'Collision',
    endpoint_ref: { endpoint_id: 'imported-profile', url: 'https://helixa.xyz/a', protocol: 'web' },
    status: 'pending',
  }, OWNER_ROUTE, [OWNER_ROUTE, IMPORTED_ROUTE]), /already exists/);

  assert.throws(() => validateRoutePatch({
    public_value: 'Imported edit',
    endpoint_ref: { endpoint_id: 'imported-profile', url: 'https://api.helixa.xyz/api/v2/agent/1', protocol: 'api' },
    status: 'pending',
  }, IMPORTED_ROUTE, [OWNER_ROUTE, IMPORTED_ROUTE]), /Imported routes are read-only/);

  assert.throws(() => validateRoutePatch({
    public_value: 'Verified self-claim',
    endpoint_ref: { endpoint_id: 'primary-public-profile', url: 'https://helixa.xyz/a', protocol: 'web' },
    status: 'verified',
  }, OWNER_ROUTE, [OWNER_ROUTE]), /Route status/);
});

test('renderPublicRoutesManagerPanel renders route scoped messages and active pending labels', () => {
  const creating = setup(renderPublicRoutesManagerPanel({
    data: { fragments: { fragments: [OWNER_ROUTE] } },
    routeStatus: 'creating_route',
  }));
  assert.match(creating.textContent, /Publishing/);

  const error = setup(renderPublicRoutesManagerPanel({
    data: { fragments: { fragments: [OWNER_ROUTE] } },
    routeStatus: 'error',
    routeError: 'Route URL must be an HTTPS URL.',
  }));
  assert.match(error.querySelector('.route-manager-panel')?.textContent ?? '', /Route URL must be an HTTPS URL/);

  const updated = setup(renderPublicRoutesManagerPanel({
    data: { fragments: { fragments: [OWNER_ROUTE] } },
    routeStatus: 'route_updated',
    routeActiveFragmentId: OWNER_ROUTE.fragment_id,
  }));
  assert.match(updated.querySelector('.route-manager-status')?.textContent ?? '', /Public route saved/);

  const saving = setup(renderPublicRoutesManagerPanel({
    data: { fragments: { fragments: [OWNER_ROUTE, { ...OWNER_ROUTE, fragment_id: 'frag_manager_route_2', endpoint_ref: { endpoint_id: 'second-route', url: 'https://helixa.xyz/second', protocol: 'web' }, updated_at: '2026-06-27T00:08:00.000Z' }] } },
    routeStatus: 'updating_route',
    routeActiveFragmentId: OWNER_ROUTE.fragment_id,
  }));
  assert.match(saving.querySelector('[data-fragment-id="frag_manager_profile"] [data-action="update-public-route"] button[type="submit"]')?.textContent ?? '', /Updating/);
  assert.equal(saving.querySelector('[data-fragment-id="frag_manager_profile"] [data-action="update-public-route"] button[type="submit"]')?.disabled, true);
  assert.equal(saving.querySelector('[data-fragment-id="frag_manager_route_2"] [data-action="update-public-route"] button[type="submit"]')?.textContent, 'Save route');

  const retiring = setup(renderPublicRoutesManagerPanel({
    data: { fragments: { fragments: [OWNER_ROUTE, { ...OWNER_ROUTE, fragment_id: 'frag_manager_route_2', endpoint_ref: { endpoint_id: 'second-route', url: 'https://helixa.xyz/second', protocol: 'web' }, updated_at: '2026-06-27T00:08:00.000Z' }] } },
    routeStatus: 'retiring_route',
    routeActiveFragmentId: OWNER_ROUTE.fragment_id,
  }));
  assert.match(retiring.querySelector('[data-fragment-id="frag_manager_profile"] [data-action="revoke-public-route"]')?.textContent ?? '', /Retiring/);
  assert.equal(retiring.querySelector('[data-fragment-id="frag_manager_profile"] [data-action="revoke-public-route"]')?.disabled, true);
  assert.equal(retiring.querySelector('[data-fragment-id="frag_manager_route_2"] [data-action="revoke-public-route"]')?.textContent, 'Retire route');
  assert.equal(retiring.querySelector('[data-fragment-id="frag_manager_route_2"] [data-action="revoke-public-route"]')?.disabled, false);

  assert.match(creating.querySelector('select[name="route_type"]')?.textContent ?? '', /Web reference/);
  assert.match(creating.querySelector('.route-field-helper')?.textContent ?? '', /Classifies the public reference only/);
  assert.doesNotMatch(creating.querySelector('.route-field-helper')?.textContent ?? '', /authorize|execute|connect|credential/i);
});

test('compactRouteInput and compactRoutePatch build endpoint fragment payloads', () => {
  const form = setup(`
    <form>
      <input name="route_label" value="Primary public profile" />
      <input name="route_url" value="https://helixa.xyz/multipass/bendr-2-1" />
      <input name="proof_reference" value="owner note" />
      <select name="route_type"><option value="web" selected>web</option></select>
    </form>
  `).querySelector('form');

  assert.deepEqual(compactRouteInput(new window.FormData(form), [OWNER_ROUTE]), {
    fragment_type: 'endpoint',
    public_value: 'Primary public profile',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1',
    proof_reference: 'owner note',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: { endpoint_id: 'primary-public-profile-2', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
  });

  const patchForm = setup(`
    <form>
      <input name="route_label" value="Primary public route" />
      <input name="route_url" value="https://helixa.xyz/multipass/bendr-2-1?route=main" />
      <select name="status"><option value="stale" selected>stale</option></select>
      <select name="transfer_policy"><option value="pause_on_transfer" selected>Recheck on owner change</option></select>
      <select name="route_type"><option value="api" selected>api</option></select>
    </form>
  `).querySelector('form');

  assert.deepEqual(compactRoutePatch(new window.FormData(patchForm), OWNER_ROUTE), {
    public_value: 'Primary public route',
    reference_url: 'https://helixa.xyz/multipass/bendr-2-1?route=main',
    status: 'stale',
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: { endpoint_id: 'primary-public-profile', url: 'https://helixa.xyz/multipass/bendr-2-1?route=main', protocol: 'api' },
  });
});

test('bindRouteManager dispatches create update and revoke handlers', () => {
  const root = setup(renderPublicRoutesManagerPanel({ data: { fragments: { fragments: [OWNER_ROUTE] } } }));
  const calls = [];
  bindRouteManager(root, {
    createRoute: (event) => calls.push(['create', event.currentTarget.dataset.action]),
    updateRoute: (event) => calls.push(['update', event.currentTarget.dataset.fragmentId]),
    revokeRoute: (event) => calls.push(['revoke', event.currentTarget.dataset.fragmentId]),
  });

  root.querySelector('[data-action="create-public-route"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="update-public-route"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  root.querySelector('[data-action="revoke-public-route"]').click();

  assert.deepEqual(calls, [
    ['create', 'create-public-route'],
    ['update', 'frag_manager_profile'],
    ['revoke', 'frag_manager_profile'],
  ]);
});

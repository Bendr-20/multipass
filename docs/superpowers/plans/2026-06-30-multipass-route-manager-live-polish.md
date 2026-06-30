# Multipass Route Manager Live Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the claimed Multipass public route manager demo-ready with route-scoped validation, save states, and failure handling.

**Architecture:** Keep endpoint fragments as the canonical public route store. `route-manager.js` owns route rendering, form compaction, and validation; `app.js` owns manager-session mutations and route-scoped state; the API remains the authoritative validation boundary. No new schema, route health service, execution path, or authority model is added.

**Tech Stack:** Plain browser DOM modules, jsdom tests with `node --test`, Vite build, existing Multipass API and SQLite saved-record store.

---

## File Structure

- Modify `apps/web/src/route-manager.js`: route form validation, route type labels/helper copy, route-scoped status/error rendering, pending button labels.
- Modify `apps/web/src/app.js`: route-specific mutation state, synchronous validation error handling, route mutation wrapper, state resets.
- Modify `apps/web/src/styles.css`: small route status/helper styles.
- Modify `apps/web/test/route-manager.test.mjs`: unit coverage for route validation, route status/error rendering, pending labels, read-only validation.
- Modify `apps/web/test/app.test.mjs`: integration coverage for route validation errors, API failures, and manager-session failures keeping route cards visible.
- Modify `apps/api/test/api-routes.test.mjs` only if focused route write coverage is missing after inspection.
- Modify this plan file during execution to check off completed steps.
- Append `/home/ubuntu/.openclaw/workspace/memory/2026-06-30.md` after deploy and push.

---

## Chunk 1: Route manager validation and local UI states

### Task 1: Add failing route-manager validation tests

**Files:**
- Modify: `apps/web/test/route-manager.test.mjs`

- [ ] **Step 1: Import new validation helpers**

Update the import list:

```js
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
```

- [ ] **Step 2: Add failing validation tests**

Append these tests near the compaction tests:

```js
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
    public_value: 'Bad protocol',
    endpoint_ref: { endpoint_id: 'bad-protocol', url: 'https://helixa.xyz/a', protocol: 'ftp' },
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
```

- [ ] **Step 3: Add failing render state tests**

Append:

```js
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
  assert.match(saving.querySelector('[data-fragment-id="frag_manager_profile"] [data-action="update-public-route"] button[type="submit"]')?.textContent ?? '', /Saving/);
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
```

- [ ] **Step 4: Run route-manager tests and confirm failure**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs
```

Expected: FAIL because `validateRouteInput` and `validateRoutePatch` are not exported and route-scoped render states are not implemented.

### Task 2: Implement route-manager validation and state rendering

**Files:**
- Modify: `apps/web/src/route-manager.js`
- Modify: `apps/web/test/route-manager.test.mjs`

- [ ] **Step 1: Add validation constants and helpers**

Add near the top of `apps/web/src/route-manager.js`:

```js
const ROUTE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const ROUTE_STATUS_MESSAGES = new Map([
  ['route_created', 'Public route published.'],
  ['route_updated', 'Public route saved.'],
  ['route_retired', 'Public route retired.'],
]);

const ROUTE_PROTOCOL_LABELS = new Map([
  ['web', 'Web reference'],
  ['api', 'API reference'],
  ['mcp', 'MCP reference'],
  ['a2a', 'A2A reference'],
  ['x402', 'x402 reference'],
]);
```

- [ ] **Step 2: Export validation helpers**

Add below `createUniqueRouteId()`:

```js
export function validateRouteInput(input = {}, existingRoutes = []) {
  const label = String(input.public_value ?? '').trim();
  if (!label) throw new Error('Route label is required.');
  const endpointRef = input.endpoint_ref ?? {};
  const routeUrl = String(endpointRef.url ?? '').trim();
  if (!safeHttpsUrl(routeUrl)) throw new Error('Route URL must be an HTTPS URL.');
  validateRouteId(endpointRef.endpoint_id);
  validateRouteProtocol(endpointRef.protocol);
  assertUniqueRouteIdForRoutes(endpointRef.endpoint_id, existingRoutes);
  return input;
}

export function validateRoutePatch(patch = {}, currentRoute = {}, existingRoutes = []) {
  if (!isManagerRoute(currentRoute)) throw new Error('Imported routes are read-only here.');
  const label = String(patch.public_value ?? '').trim();
  if (!label) throw new Error('Route label is required.');
  const endpointRef = patch.endpoint_ref ?? {};
  const routeUrl = String(endpointRef.url ?? '').trim();
  if (!safeHttpsUrl(routeUrl)) throw new Error('Route URL must be an HTTPS URL.');
  validateRouteId(endpointRef.endpoint_id);
  validateRouteProtocol(endpointRef.protocol);
  assertUniqueRouteIdForRoutes(endpointRef.endpoint_id, existingRoutes, currentRoute.fragment_id);
  if (patch.status && !ROUTE_STATUSES.includes(patch.status)) throw new Error('Route status is not available for manager-created routes.');
  return patch;
}

function validateRouteId(value) {
  const routeId = String(value ?? '').trim();
  if (!routeId) throw new Error('Route ID is required.');
  if (!ROUTE_ID_PATTERN.test(routeId)) throw new Error('Route ID can use letters, numbers, dots, underscores, colons, and hyphens only.');
}

function validateRouteProtocol(value) {
  const protocol = String(value ?? '').trim();
  if (!ROUTE_PROTOCOLS.includes(protocol)) throw new Error('Route type is not available.');
}

function assertUniqueRouteIdForRoutes(routeId, existingRoutes = [], currentFragmentId = null) {
  const candidate = String(routeId ?? '').trim();
  const collision = existingRoutes.find((route) => (
    route?.fragment_id !== currentFragmentId
    && route?.fragment_type === 'endpoint'
    && route?.endpoint_ref?.endpoint_id === candidate
  ));
  if (collision) throw new Error('Route ID already exists on this Multipass.');
}
```

- [ ] **Step 3: Wire validation into compaction**

Change the end of `compactRouteInput()` from `return input;` to:

```js
  return validateRouteInput(input, existingRoutes);
```

Change `compactRoutePatch()` to this full shape:

```js
export function compactRoutePatch(formData, currentRoute = {}, existingRoutes = []) {
  const routeLabel = getFormValue(formData, 'route_label') || getFormValue(formData, 'public_value');
  const routeUrl = getFormValue(formData, 'route_url') || getFormValue(formData, 'endpoint_url') || getFormValue(formData, 'reference_url') || currentRoute.endpoint_ref?.url;
  const proofNote = getFormValue(formData, 'proof_reference');
  const status = getFormValue(formData, 'status');
  const reviewPolicy = getFormValue(formData, 'transfer_policy') || currentRoute.transfer_policy || 'pause_on_transfer';
  const protocol = getFormValue(formData, 'route_type') || getFormValue(formData, 'endpoint_protocol') || currentRoute.endpoint_ref?.protocol || 'web';
  const routeId = getFormValue(formData, 'endpoint_id') || currentRoute.endpoint_ref?.endpoint_id;

  const patch = {
    public_value: routeLabel || currentRoute.public_value || '',
    reference_url: routeUrl,
    transfer_policy: reviewPolicy,
    endpoint_ref: { endpoint_id: routeId, url: routeUrl, protocol },
  };
  if (proofNote) patch.proof_reference = proofNote;
  if (status) patch.status = status;
  return validateRoutePatch(patch, currentRoute, existingRoutes);
}
```

- [ ] **Step 4: Add route scoped message rendering**

Inside `renderPublicRoutesManagerPanel(state = {})`, replace the existing inline route-manager error rendering with one helper call:

```js
        ${renderRouteManagerStatus(state)}
```

Add helper:

```js
function renderRouteManagerStatus(state = {}) {
  if (state.routeError) return `<p class="route-manager-status resolver-message error">${escapeHtml(state.routeError)}</p>`;
  const message = ROUTE_STATUS_MESSAGES.get(state.routeStatus);
  return message ? `<p class="route-manager-status resolver-message">${escapeHtml(message)}</p>` : '';
}
```

Remove the current inline route-manager error line:

```js
        ${state.fragmentError ? `<p class="resolver-message error">${escapeHtml(state.fragmentError)}</p>` : ''}
```

Leave `fragmentError` for the generic fragment manager only so route errors cannot duplicate or leak into generic proof-fragment UI.

- [ ] **Step 5: Add route-specific pending labels**

In `renderCreateRouteForm()`, replace the button label logic with:

```js
const creating = state.routeStatus === 'creating_route';
```

and:

```html
<button type="submit" ${creating ? 'disabled' : ''}>${creating ? 'Publishing...' : 'Publish route'}</button>
```

In `renderRouteEditForm()`, add:

```js
const updating = state.routeStatus === 'updating_route' && state.routeActiveFragmentId === route.fragment_id;
const retiring = state.routeStatus === 'retiring_route' && state.routeActiveFragmentId === route.fragment_id;
```

Use labels:

```html
<button type="submit" ${updating ? 'disabled' : ''}>${updating ? 'Saving...' : 'Save route'}</button>
<button class="secondary-button" type="button" data-action="revoke-public-route" data-fragment-id="${escapeAttribute(route.fragment_id ?? '')}" ${route.status === 'revoked' || retiring ? 'disabled' : ''}>${retiring ? 'Retiring...' : 'Retire route'}</button>
```

- [ ] **Step 6: Render route type labels and helper copy**

Change `renderRouteProtocolSelect()` to render labels:

```js
function renderRouteProtocolSelect(selected = 'web') {
  return `<select name="route_type">${ROUTE_PROTOCOLS.map((protocol) => `<option value="${protocol}" ${protocol === selected ? 'selected' : ''}>${escapeHtml(ROUTE_PROTOCOL_LABELS.get(protocol) ?? protocol)}</option>`).join('')}</select>`;
}
```

Add below each route type selector in create and edit forms:

```html
<p class="route-field-helper">Classifies the public reference only. It does not test, call, or grant access to the route.</p>
```

- [ ] **Step 7: Run route-manager tests**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Run wording gate for route copy**

Run:

```bash
node --test apps/web/test/wording.test.mjs apps/web/test/route-manager.test.mjs
```

Expected: PASS with no blocked UI wording.

---

## Chunk 2: App route mutation state and failure handling

### Task 3: Add failing app integration tests for route-scoped errors

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Add invalid route create test**

Append near the existing claimed route manager test:

```js
test('claimed route manager shows validation errors without calling route create API', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    createMultipassFragment: async () => { calls.push('create'); throw new Error('should not call create'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const createForm = root.querySelector('[data-action="create-public-route"]');
  createForm.querySelector('input[name="route_label"]').value = 'Bad route';
  createForm.querySelector('input[name="route_url"]').value = 'http://example.test/not-safe';
  createForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  const routePanel = root.querySelector('.route-manager-panel');
  assert.match(routePanel.textContent, /Route URL must be an HTTPS URL/);
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});
```

- [ ] **Step 2: Add failed route update test**

Append:

```js
test('failed route update keeps existing route cards visible and shows route error', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const route = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const fetchWithRoute = async (url) => {
    const value = String(url);
    if (value.endsWith('/api/multipass/bendr-2-1')) {
      return new Response(JSON.stringify({
        ...sampleData().profile,
        display_name: 'Saved Bendr',
        slug: 'bendr-2-1',
        multipass_id: 'mp_helixa_agent_1',
        status: 'active',
        owner_summary: { owner_state: 'unclaimed', verification_status: 'unclaimed', summary: 'Saved display-only profile. Management is unclaimed.' },
      }), { status: 200 });
    }
    if (value.endsWith('/fragments')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [route] }), { status: 200 });
    return savedProfileFetch(url);
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    updateMultipassFragment: async () => { throw new Error('Manager session expired.'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: fetchWithRoute }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  const editForm = root.querySelector('[data-action="update-public-route"]');
  editForm.querySelector('input[name="route_label"]').value = 'Primary profile route';
  editForm.querySelector('input[name="route_url"]').value = 'https://helixa.xyz/multipass/bendr-2-1?route=main';
  editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushAsyncEvents();

  assert.match(root.querySelector('.route-manager-panel').textContent, /Manager session expired/);
  assert.match(root.querySelector('.public-routes-panel').textContent, /Primary profile route/);
  assert.ok(root.querySelector('[data-action="update-public-route"]'));
  assert.ok(root.querySelector('.claim-management-panel'));
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});
```

- [ ] **Step 3: Add failed route retire test**

Append:

```js
test('failed route retire keeps route visible with old status', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const route = {
    schema_version: '0.1.0',
    fragment_id: 'frag_manager_route_1',
    multipass_id: 'mp_helixa_agent_1',
    fragment_type: 'endpoint',
    status: 'pending',
    assurance_level: 'self_attested',
    visibility: 'public',
    transfer_policy: 'pause_on_transfer',
    source: { source_type: 'owner_submission', source_id: 'manager:frag_manager_route_1', issuer: null, observed_at: '2026-06-27T00:10:00.000Z' },
    public_value: 'Primary profile route',
    endpoint_ref: { endpoint_id: 'primary-profile-route', url: 'https://helixa.xyz/multipass/bendr-2-1', protocol: 'web' },
    created_at: '2026-06-27T00:10:00.000Z',
    updated_at: '2026-06-27T00:10:00.000Z',
  };
  const fetchWithRoute = async (url) => {
    const value = String(url);
    if (value.endsWith('/api/multipass/bendr-2-1')) {
      return new Response(JSON.stringify({
        ...sampleData().profile,
        display_name: 'Saved Bendr',
        slug: 'bendr-2-1',
        multipass_id: 'mp_helixa_agent_1',
        status: 'active',
        owner_summary: { owner_state: 'unclaimed', verification_status: 'unclaimed', summary: 'Saved display-only profile. Management is unclaimed.' },
      }), { status: 200 });
    }
    if (value.endsWith('/fragments')) return new Response(JSON.stringify({ schema_version: '0.1.0', multipass_id: 'mp_helixa_agent_1', fragments: [route] }), { status: 200 });
    return savedProfileFetch(url);
  };
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
    revokeMultipassFragment: async () => { throw new Error('Manager session cookie is required.'); },
  };
  const walletSigner = async () => ({ wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' });

  await createApp({ root, claimApi, walletSigner, fetchImpl: fetchWithRoute }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await flushAsyncEvents();

  root.querySelector('[data-action="revoke-public-route"]').click();
  await flushAsyncEvents();

  assert.match(root.querySelector('.route-manager-panel').textContent, /Manager session cookie is required/);
  assert.match(root.querySelector('.public-route-card').textContent, /Review required/);
  assert.match(root.querySelector('.public-route-card').textContent, /Primary profile route/);
  assert.equal(root.querySelector('.fragment-manager-panel .resolver-message.error'), null);
});
```

- [ ] **Step 4: Run focused app tests and confirm failure**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "route manager|route update|route retire|validation errors"
```

Expected: FAIL because route handlers still use generic fragment state and do not catch synchronous validation errors route-locally.

### Task 4: Implement route-scoped app mutation state

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add route state to initial state and resets**

Add to the initial `state` object:

```js
routeStatus: null,
routeError: null,
routeActiveFragmentId: null,
```

Add a small helper near other state helpers:

```js
function clearedRouteState() {
  return { routeStatus: null, routeError: null, routeActiveFragmentId: null };
}
```

When resetting profile/session-related state in `resolveLiveAgent()`, `resetStaticDemo()`, `saveCurrentMultipass()` success paths, `claimWithWallet()` transitions, `submitManualReview()` transitions, and `logoutManagerSession()`, clear route state with:

```js
...clearedRouteState(),
```

Do not clear route data on failed route mutations.

- [ ] **Step 2: Catch create route validation errors**

Update `createPublicRoute(event)`:

```js
async function createPublicRoute(event) {
  const id = getManageIdentifier(state);
  const csrfToken = state.claimCsrfToken;
  if (!id || !csrfToken) return;
  let fragment;
  try {
    fragment = compactRouteInput(createFormData(event?.currentTarget), getPublicRouteFragments(state.data));
  } catch (error) {
    setRouteMutationError(error);
    return;
  }
  await mutatePublicRoute({
    status: 'creating_route',
    successStatus: 'route_created',
    operation: ({ apiBase }) => claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl }),
  });
}
```

- [ ] **Step 3: Catch update route validation errors**

Update `updatePublicRoute(event)`:

```js
async function updatePublicRoute(event) {
  const id = getManageIdentifier(state);
  const fragmentId = event?.currentTarget?.dataset.fragmentId;
  const csrfToken = state.claimCsrfToken;
  if (!id || !fragmentId || !csrfToken) return;
  const routes = getPublicRouteFragments(state.data);
  const currentRoute = routes.find((route) => route.fragment_id === fragmentId) ?? {};
  let patch;
  try {
    patch = compactRoutePatch(createFormData(event.currentTarget), currentRoute, routes);
  } catch (error) {
    setRouteMutationError(error, fragmentId);
    return;
  }
  await mutatePublicRoute({
    status: 'updating_route',
    successStatus: 'route_updated',
    activeFragmentId: fragmentId,
    operation: ({ apiBase }) => claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl }),
  });
}
```

- [ ] **Step 4: Use route-specific retire mutation**

Replace `revokePublicRoute()` with:

```js
async function revokePublicRoute(event) {
  const id = getManageIdentifier(state);
  const fragmentId = event?.currentTarget?.dataset.fragmentId;
  const csrfToken = state.claimCsrfToken;
  if (!id || !fragmentId || !csrfToken) return;
  await mutatePublicRoute({
    status: 'retiring_route',
    successStatus: 'route_retired',
    activeFragmentId: fragmentId,
    operation: ({ apiBase }) => claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl }),
  });
}
```

- [ ] **Step 5: Add route mutation helpers**

Add near `mutatePublicFragment()`:

```js
function setRouteMutationError(error, activeFragmentId = null) {
  state = {
    ...state,
    routeStatus: 'error',
    routeError: error.message,
    routeActiveFragmentId: activeFragmentId,
  };
  render(root, state, handlers);
}

async function mutatePublicRoute({ status, successStatus, activeFragmentId = null, operation }) {
  state = { ...state, routeStatus: status, routeError: null, routeActiveFragmentId: activeFragmentId };
  render(root, state, handlers);
  try {
    const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
    const result = await operation({ apiBase });
    state = mergeFragmentMutationState(state, result, {
      routeStatus: successStatus,
      routeError: null,
      routeActiveFragmentId: activeFragmentId,
    });
    render(root, state, handlers);
  } catch (error) {
    state = { ...state, routeStatus: 'error', routeError: error.message, routeActiveFragmentId: activeFragmentId };
    render(root, state, handlers);
  }
}
```

- [ ] **Step 6: Keep fragment mutation state separate**

Ensure `mutatePublicFragment()` still uses only `fragmentStatus` and `fragmentError`. Route writes must not set `fragmentError`, and generic fragment writes must not set `routeError`.

- [ ] **Step 7: Add route styles**

Add to `apps/web/src/styles.css` near existing route manager styles:

```css
.route-field-helper {
  margin: -0.35rem 0 0;
  color: var(--muted);
  font-size: 0.84rem;
}

.route-manager-status {
  margin: 0.65rem 0 0;
}
```

Adjust selectors if existing spacing needs tighter fit.

- [ ] **Step 8: Run focused app tests**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "route manager|route update|route retire|validation errors"
```

Expected: PASS.

- [ ] **Step 9: Run route and app tests together**

Run:

```bash
node --test apps/web/test/route-manager.test.mjs apps/web/test/app.test.mjs --test-name-pattern "route"
```

Expected: PASS.

- [ ] **Step 10: Commit Chunk 1 and Chunk 2 together**

Run:

```bash
git add apps/web/src/route-manager.js apps/web/src/app.js apps/web/src/styles.css apps/web/test/route-manager.test.mjs apps/web/test/app.test.mjs docs/superpowers/plans/2026-06-30-multipass-route-manager-live-polish.md
git commit -m "Polish Multipass route manager state"
```

---

## Chunk 3: API coverage, full verification, deploy, and push

### Task 5: Confirm API write boundary coverage

**Files:**
- Inspect: `apps/api/test/api-routes.test.mjs`
- Modify only if needed: `apps/api/test/api-routes.test.mjs`

- [ ] **Step 1: Inspect existing API fragment write tests**

Run:

```bash
grep -n "fragment write routes enforce" -A90 apps/api/test/api-routes.test.mjs
grep -n "duplicate" apps/api/test/claim-manage.test.mjs apps/api/test/api-routes.test.mjs
```

Expected: existing coverage includes missing session, bad CSRF, bad origin, unsafe endpoint URL, imported read-only edit/revoke, and duplicate endpoint IDs in store/API tests. If route-specific update/revoke or duplicate update coverage is missing, add Step 2.

- [ ] **Step 2: Add focused route API boundary tests when coverage is missing**

If inspection finds only generic fragment coverage, add a route-specific API test to `apps/api/test/api-routes.test.mjs` so create, update, and revoke boundaries are explicit:

```js
test('route fragment writes enforce manager session csrf duplicate ids and https URLs through API', async () => {
  const api = makeClaimApi();
  const { headers, cookie, csrfToken } = await createOwnerSession(api);

  const created = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Primary route boundary test.',
    endpoint_ref: { endpoint_id: 'route-boundary', url: 'https://helixa.xyz/route-boundary', protocol: 'web' },
  }, headers);
  assert.equal(created.response.status, 201);
  const routePath = `/api/multipass/bendr-2-1/fragments/${created.body.fragment.fragment_id}`;

  const missingCreateSession = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Missing session route.',
    endpoint_ref: { endpoint_id: 'missing-session-route', url: 'https://helixa.xyz/missing-session-route', protocol: 'web' },
  }, { origin: 'https://multipass.example.test', 'x-csrf-token': csrfToken });
  assert.equal(missingCreateSession.response.status, 401);

  const badCreateCsrf = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Bad CSRF route.',
    endpoint_ref: { endpoint_id: 'bad-csrf-route', url: 'https://helixa.xyz/bad-csrf-route', protocol: 'web' },
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': 'bad' });
  assert.equal(badCreateCsrf.response.status, 403);

  const unsafeCreate = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Unsafe create route.',
    endpoint_ref: { endpoint_id: 'unsafe-create-route', url: 'http://example.test/not-safe', protocol: 'web' },
  }, headers);
  assert.equal(unsafeCreate.response.status, 400);

  const duplicateCreate = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Duplicate create route.',
    endpoint_ref: { endpoint_id: 'route-boundary', url: 'https://helixa.xyz/duplicate-create', protocol: 'web' },
  }, headers);
  assert.equal(duplicateCreate.response.status, 400);

  const missingUpdateSession = await patchJsonWithHeaders(api, routePath, {
    endpoint_ref: { endpoint_id: 'route-boundary', url: 'https://helixa.xyz/no-session-update', protocol: 'web' },
  }, { origin: 'https://multipass.example.test', 'x-csrf-token': csrfToken });
  assert.equal(missingUpdateSession.response.status, 401);

  const badUpdateCsrf = await patchJsonWithHeaders(api, routePath, {
    endpoint_ref: { endpoint_id: 'route-boundary', url: 'https://helixa.xyz/bad-csrf-update', protocol: 'web' },
  }, { origin: 'https://multipass.example.test', cookie, 'x-csrf-token': 'bad' });
  assert.equal(badUpdateCsrf.response.status, 403);

  const unsafeUpdate = await patchJsonWithHeaders(api, routePath, {
    endpoint_ref: { endpoint_id: 'route-boundary', url: 'http://example.test/not-safe-update', protocol: 'web' },
  }, headers);
  assert.equal(unsafeUpdate.response.status, 400);

  const second = await postJsonWithHeaders(api, '/api/multipass/bendr-2-1/fragments', {
    fragment_type: 'endpoint',
    public_value: 'Second route boundary test.',
    endpoint_ref: { endpoint_id: 'route-boundary-second', url: 'https://helixa.xyz/route-boundary-second', protocol: 'web' },
  }, headers);
  assert.equal(second.response.status, 201);

  const duplicateUpdate = await patchJsonWithHeaders(api, `${routePath}`, {
    endpoint_ref: { endpoint_id: 'route-boundary-second', url: 'https://helixa.xyz/duplicate-update', protocol: 'web' },
  }, headers);
  assert.equal(duplicateUpdate.response.status, 400);

  const missingRevokeSession = await postJsonWithHeaders(api, `${routePath}/revoke`, {}, {
    origin: 'https://multipass.example.test',
    'x-csrf-token': csrfToken,
  });
  assert.equal(missingRevokeSession.response.status, 401);

  const badRevokeCsrf = await postJsonWithHeaders(api, `${routePath}/revoke`, {}, {
    origin: 'https://multipass.example.test',
    cookie,
    'x-csrf-token': 'bad',
  });
  assert.equal(badRevokeCsrf.response.status, 403);
});
```

If all route-specific coverage already exists, do not add redundant tests.

- [ ] **Step 3: Run API tests**

Run:

```bash
node --test apps/api/test/*.test.mjs
```

Expected: PASS.

### Task 6: Full verification and deploy

**Files:**
- Source/test files from chunks 1 and 2
- Deploy artifact: `apps/web/dist/` to `/var/www/helixa.xyz/multipass/`

- [ ] **Step 1: Run route wording gate**

Run:

```bash
node --test apps/web/test/wording.test.mjs apps/web/test/route-manager.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS with 0 failures.

- [ ] **Step 3: Run production build**

Run:

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: PASS and produce new `apps/web/dist/assets/index-*.js` and `index-*.css`.

- [ ] **Step 4: Run whitespace gate**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Deploy static bundle**

Run:

```bash
rsync -av --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: deployed asset list includes the new hashed JS and CSS assets.

- [ ] **Step 6: Smoke live HTML assets**

Run:

```bash
set -euo pipefail
local_assets=$(grep -Eo 'assets/index-[^" ]+\.(js|css)' apps/web/dist/index.html | sort -u)
live_assets=$(curl -fsSL https://helixa.xyz/multipass/ | grep -Eo 'assets/index-[^" ]+\.(js|css)' | sort -u)
printf 'local assets:\n%s\n' "$local_assets"
printf 'live assets:\n%s\n' "$live_assets"
test "$local_assets" = "$live_assets"
for asset in $live_assets; do
  curl -fsSI "https://helixa.xyz/multipass/$asset" | head -1 | grep -q '200'
done
```

Expected: local `apps/web/dist/index.html` assets exactly match live HTML assets, every referenced asset returns HTTP 200, and command exits 0.

- [ ] **Step 7: Smoke live public route DOM**

Run from `apps/web` so `playwright-core` resolves:

```bash
node --input-type=module <<'JS'
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/snap/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('https://helixa.xyz/multipass/bendr-2-1', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.multipass-profile-page', { timeout: 30000 });
const result = await page.evaluate(() => {
  const routeNodes = [...document.querySelectorAll('.public-route-card, .route-manager-panel')];
  const blocked = /execute|approve|connect|authorize|grant tool access|tool control|credential release|release credentials|transfer|transfer behavior|transfer authority|activate tools/i;
  const routeText = routeNodes.map((node) => node.textContent || '').join('\n');
  const links = [...document.querySelectorAll('.public-route-card a')].map((link) => link.href);
  return {
    profilePage: !!document.querySelector('.multipass-profile-page'),
    claimPanel: !!document.querySelector('.claim-management-panel'),
    routePanel: !!document.querySelector('.public-routes-panel'),
    routeCardCount: document.querySelectorAll('.public-route-card').length,
    blockedCopy: blocked.test(routeText),
    unsafeLinks: links.filter((href) => !href.startsWith('https://')),
    links,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.profilePage || !result.claimPanel || !result.routePanel || result.routeCardCount === 0 || result.blockedCopy || result.unsafeLinks.length) process.exit(1);
JS
```

Expected: JSON reports profile page, claim panel, route panel, at least one route card, no blocked copy, and zero unsafe links.

- [ ] **Step 8: Record live manager-session write smoke status**

If no live manager session is available, do not mutate live data. Record: live manager write smoke unavailable; route write behavior covered by route-manager unit tests, app integration tests, and API tests.

### Task 7: Commit, push, and memory

**Files:**
- Modify: `/home/ubuntu/.openclaw/workspace/memory/2026-06-30.md`

- [ ] **Step 1: Check status**

Run:

```bash
git status --short
```

Expected: only intended source/test/style/plan files are modified.

- [ ] **Step 2: Commit any remaining verification changes**

If Chunk 3 changed tests or plan checkboxes after the Chunk 1/2 commit, run:

```bash
git add apps/api/test/api-routes.test.mjs apps/web/src/route-manager.js apps/web/src/app.js apps/web/src/styles.css apps/web/test/route-manager.test.mjs apps/web/test/app.test.mjs docs/superpowers/plans/2026-06-30-multipass-route-manager-live-polish.md
git commit -m "Verify Multipass route manager polish"
```

If no source/test/style/plan changes remain, skip this commit.

- [ ] **Step 3: Push**

Run:

```bash
git push
```

Expected: push to `Bendr-20/multipass` main succeeds.

- [ ] **Step 4: Append memory note**

Append one concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-30.md` with:

- pushed commit hash or hashes,
- deployed JS/CSS asset hashes,
- tests/build run,
- live smoke result,
- live manager-session write smoke status.

- [ ] **Step 5: Final update**

Send a terse update, replacing `<hash>` with the actual pushed commit hash:

```text
Shipped. Route manager now catches bad route data before writes, shows route-scoped save/error states, keeps route cards visible after failed writes, and preserves imported routes as read-only. Tests/build/live public smoke passed. Pushed <hash>. Live manager write smoke was unavailable, covered by unit/app/API tests.
```

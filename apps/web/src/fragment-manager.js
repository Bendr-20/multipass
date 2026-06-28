export function renderFragmentManagerPanel(state = {}) {
  const fragments = Array.isArray(state.data?.fragments?.fragments) ? state.data.fragments.fragments : [];
  return `
    <section class="fragment-manager-panel" aria-label="Fragment manager">
      <div class="fragment-manager-copy">
        <p class="card-label">Fragment manager</p>
        <h3>Manage public fragments.</h3>
        <p>Public fragments only. Does not edit Cred score, grant tools, transfer custody, expose credentials, or change live authority.</p>
        ${state.fragmentError ? `<p class="resolver-message error">${escapeHtml(state.fragmentError)}</p>` : ''}
      </div>
      ${renderCreateFragmentForm(state)}
      <div class="managed-fragment-list">
        ${fragments.length ? fragments.map((fragment) => renderManagedFragment(fragment, state)).join('') : '<p class="resolver-message">No public fragments saved yet.</p>'}
      </div>
    </section>
  `;
}

export function bindFragmentManager(root, handlers = {}) {
  root.querySelector('[data-action="create-public-fragment"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.createPublicFragment?.(event);
  });

  root.querySelectorAll('[data-action="update-public-fragment"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.updatePublicFragment?.(event);
    });
  });

  root.querySelectorAll('[data-action="revoke-public-fragment"]').forEach((button) => {
    button.addEventListener('click', (event) => handlers.revokePublicFragment?.(event));
  });

  root.querySelector('[data-action="create-public-fragment"] select[name="fragment_type"]')?.addEventListener('change', (event) => {
    const fields = root.querySelector('[data-endpoint-fields]');
    if (fields) fields.hidden = event.currentTarget.value !== 'endpoint';
  });
}

export function mergeFragmentMutationState(current, result, patch = {}) {
  const nextProfile = result?.profile ? { ...current.data.profile, ...result.profile } : current.data.profile;
  return {
    ...current,
    ...patch,
    data: {
      ...current.data,
      profile: nextProfile,
      fragments: result?.fragments ?? current.data.fragments,
    },
  };
}

export function compactFragmentInput(formData) {
  const fragment = compactFragmentPatch(formData);
  const fragmentType = String(formData.get('fragment_type') ?? '').trim();
  if (fragmentType) fragment.fragment_type = fragmentType;
  if (fragmentType !== 'endpoint') delete fragment.endpoint_ref;
  return fragment;
}

export function compactFragmentPatch(formData) {
  const patch = {};
  for (const key of ['public_value', 'reference_url', 'proof_reference', 'status', 'transfer_policy']) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) patch[key] = value;
  }
  addEndpointRefFromFormData(patch, formData);
  return patch;
}

function addEndpointRefFromFormData(target, formData) {
  const endpointUrl = String(formData.get('endpoint_url') ?? '').trim();
  const endpointId = String(formData.get('endpoint_id') ?? '').trim();
  const endpointProtocol = String(formData.get('endpoint_protocol') ?? '').trim();
  if (endpointUrl && endpointId && endpointProtocol) {
    target.endpoint_ref = { endpoint_id: endpointId, url: endpointUrl, protocol: endpointProtocol };
  }
}

function renderCreateFragmentForm(state) {
  return `
    <form class="fragment-create-form" data-action="create-public-fragment">
      <label><span>Fragment type</span>${renderFragmentTypeSelect()}</label>
      <label><span>Public value</span><input name="public_value" /></label>
      <label><span>Reference URL</span><input name="reference_url" /></label>
      <label><span>Proof reference</span><input name="proof_reference" /></label>
      <label><span>Transfer policy</span>${renderTransferPolicySelect()}</label>
      <div class="endpoint-fields" data-endpoint-fields hidden>
        <label><span>Endpoint ID</span><input name="endpoint_id" /></label>
        <label><span>Endpoint URL</span><input name="endpoint_url" /></label>
        <label><span>Endpoint protocol</span>${renderEndpointProtocolSelect()}</label>
      </div>
      <button type="submit" ${state.fragmentStatus === 'creating_fragment' ? 'disabled' : ''}>${state.fragmentStatus === 'creating_fragment' ? 'Adding...' : 'Add public fragment'}</button>
    </form>
  `;
}

function renderManagedFragment(fragment, state) {
  const editable = fragment.source?.source_type === 'owner_submission' && fragment.source?.issuer === null;
  return `
    <article class="managed-fragment-card ${editable ? 'editable' : 'readonly'}">
      <div>
        <strong>${escapeHtml(fragment.fragment_type)}</strong>
        <span>${escapeHtml(fragment.status)} · ${escapeHtml(fragment.assurance_level)} · ${escapeHtml(fragment.transfer_policy)}</span>
        <p>${escapeHtml(fragment.public_value ?? 'No public value')}</p>
      </div>
      ${editable ? renderManagedFragmentEditForm(fragment, state) : '<p class="resolver-message">Imported fragment. Read-only here.</p>'}
    </article>
  `;
}

function renderManagedFragmentEditForm(fragment, state) {
  return `
    <form class="fragment-edit-form" data-action="update-public-fragment" data-fragment-id="${escapeAttribute(fragment.fragment_id)}">
      <label><span>Public value</span><input name="public_value" value="${escapeAttribute(fragment.public_value ?? '')}" /></label>
      <label><span>Reference URL</span><input name="reference_url" value="${escapeAttribute(fragment.reference_url ?? fragment.source?.reference_url ?? '')}" /></label>
      <label><span>Proof reference</span><input name="proof_reference" value="${escapeAttribute(fragment.proof_reference ?? '')}" /></label>
      <label><span>Status</span>${renderStatusSelect(fragment.status)}</label>
      <label><span>Transfer policy</span>${renderTransferPolicySelect(fragment.transfer_policy)}</label>
      ${fragment.fragment_type === 'endpoint' ? renderEndpointEditFields(fragment) : ''}
      <button type="submit" ${state.fragmentStatus === 'updating_fragment' ? 'disabled' : ''}>Save fragment</button>
      <button type="button" data-action="revoke-public-fragment" data-fragment-id="${escapeAttribute(fragment.fragment_id)}" ${fragment.status === 'revoked' ? 'disabled' : ''}>Revoke</button>
    </form>
  `;
}

function renderEndpointEditFields(fragment) {
  const endpoint = fragment.endpoint_ref ?? {};
  return `
    <div class="endpoint-fields">
      <label><span>Endpoint ID</span><input name="endpoint_id" value="${escapeAttribute(endpoint.endpoint_id ?? '')}" /></label>
      <label><span>Endpoint URL</span><input name="endpoint_url" value="${escapeAttribute(endpoint.url ?? '')}" /></label>
      <label><span>Endpoint protocol</span>${renderEndpointProtocolSelect(endpoint.protocol)}</label>
    </div>
  `;
}

function renderFragmentTypeSelect() {
  return '<select name="fragment_type"><option value="wallet">wallet</option><option value="social">social</option><option value="endpoint">endpoint</option><option value="standard_ref">standard_ref</option><option value="attestation">attestation</option></select>';
}

function renderStatusSelect(selected = 'pending') {
  return `<select name="status">${['pending', 'stale', 'disputed', 'revoked'].map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`).join('')}</select>`;
}

function renderTransferPolicySelect(selected = '') {
  return `<select name="transfer_policy"><option value=""></option>${['reverify_on_transfer', 'pause_on_transfer', 'historical_on_transfer', 'never_transfer'].map((policy) => `<option value="${policy}" ${policy === selected ? 'selected' : ''}>${policy}</option>`).join('')}</select>`;
}

function renderEndpointProtocolSelect(selected = 'api') {
  return `<select name="endpoint_protocol">${['api', 'web', 'mcp', 'a2a', 'x402'].map((protocol) => `<option value="${protocol}" ${protocol === selected ? 'selected' : ''}>${protocol}</option>`).join('')}</select>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

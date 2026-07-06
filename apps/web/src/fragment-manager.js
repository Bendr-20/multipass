export function renderFragmentManagerPanel(state = {}) {
  const fragments = Array.isArray(state.data?.fragments?.fragments) ? state.data.fragments.fragments : [];
  return `
    <section class="fragment-manager-panel" aria-label="Fragment manager">
      <div class="fragment-manager-copy">
        <p class="card-label">Fragment manager</p>
        <h3>Publish public proof.</h3>
        <p>Safe public edits for wallet, social, standard, and attestation fragments. Routes have their own public route manager. Does not edit Cred score, grant tools, transfer custody, expose credentials, or change live authority.</p>
        <div class="fragment-safety-strip" aria-label="Fragment manager boundaries">
          <span>Safe public edits</span>
          <span>Private data stays private</span>
          <span>Imported proof stays read-only</span>
        </div>
        ${state.fragmentError ? `<p class="resolver-message error">${escapeHtml(state.fragmentError)}</p>` : ''}
      </div>
      ${renderCreateFragmentForm(state)}
      <div class="managed-fragment-toolbar">
        <strong>${fragments.length} public fragment${fragments.length === 1 ? '' : 's'}</strong>
        <span>Owner-submitted rows can be edited. Imported rows are preserved as evidence.</span>
      </div>
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
  return fragment;
}

export function compactFragmentPatch(formData) {
  const patch = {};
  for (const key of ['public_value', 'reference_url', 'proof_reference', 'status', 'transfer_policy']) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) patch[key] = value;
  }
  return patch;
}

function renderCreateFragmentForm(state) {
  return `
    <form class="fragment-create-form" data-action="create-public-fragment">
      <div class="fragment-form-heading">
        <strong>Add public proof</strong>
        <span>Use this for things people should be able to verify from the public profile.</span>
      </div>
      <label><span>Type</span>${renderFragmentTypeSelect()}</label>
      <label><span>Public value</span><input name="public_value" placeholder="Public wallet, handle, standard reference, or attestation summary" /></label>
      <label><span>Reference URL</span><input name="reference_url" placeholder="https://..." /></label>
      <label><span>Proof note</span><input name="proof_reference" placeholder="Optional context for the manager/audit trail" /></label>
      <label><span>Transfer behavior</span>${renderTransferPolicySelect()}</label>
      <button type="submit" ${state.fragmentStatus === 'creating_fragment' ? 'disabled' : ''}>${state.fragmentStatus === 'creating_fragment' ? 'Adding...' : 'Publish fragment'}</button>
    </form>
  `;
}

function renderManagedFragment(fragment, state) {
  const marketplaceConnection = isMarketplaceConnectionFragment(fragment);
  const editable = !marketplaceConnection && fragment.source?.source_type === 'owner_submission' && fragment.source?.issuer === null;
  return `
    <article class="managed-fragment-card ${editable ? 'editable' : 'readonly'}" data-fragment-id="${escapeAttribute(fragment.fragment_id)}">
      <div class="managed-fragment-summary">
        <div class="managed-fragment-title"><strong>${escapeHtml(formatFragmentType(fragment.fragment_type))}</strong><span>${editable ? 'Editable' : 'Read-only'}</span></div>
        <span>${escapeHtml(fragment.status)} · ${escapeHtml(fragment.assurance_level)} · ${escapeHtml(formatTransferPolicy(fragment.transfer_policy))}</span>
        <p>${escapeHtml(fragment.public_value ?? 'No public value')}</p>
      </div>
      ${marketplaceConnection ? '<p class="resolver-message">Edit this in Marketplace Connections.</p>' : editable ? renderManagedFragmentEditForm(fragment, state) : '<p class="resolver-message">Imported fragment. Read-only here.</p>'}
    </article>
  `;
}

function isMarketplaceConnectionFragment(fragment) {
  return Boolean(fragment?.marketplace_ref);
}

function renderManagedFragmentEditForm(fragment, state) {
  return `
    <form class="fragment-edit-form" data-action="update-public-fragment" data-fragment-id="${escapeAttribute(fragment.fragment_id)}">
      <label><span>Public value</span><input name="public_value" value="${escapeAttribute(fragment.public_value ?? '')}" /></label>
      <label><span>Reference URL</span><input name="reference_url" value="${escapeAttribute(fragment.reference_url ?? fragment.source?.reference_url ?? '')}" /></label>
      <label><span>Proof note</span><input name="proof_reference" value="${escapeAttribute(fragment.proof_reference ?? '')}" /></label>
      <label><span>Status</span>${renderStatusSelect(fragment.status)}</label>
      <label><span>Transfer policy</span>${renderTransferPolicySelect(fragment.transfer_policy)}</label>
      <div class="fragment-edit-actions">
        <button type="submit" ${state.fragmentStatus === 'updating_fragment' ? 'disabled' : ''}>Save changes</button>
        <button class="secondary-button" type="button" data-action="revoke-public-fragment" data-fragment-id="${escapeAttribute(fragment.fragment_id)}" ${fragment.status === 'revoked' ? 'disabled' : ''}>Revoke proof</button>
      </div>
    </form>
  `;
}

function renderFragmentTypeSelect() {
  return '<select name="fragment_type"><option value="wallet">wallet</option><option value="social">social</option><option value="standard_ref">standard_ref</option><option value="attestation">attestation</option></select>';
}

function formatFragmentType(type) {
  return String(type ?? '').replaceAll('_', ' ');
}

function formatTransferPolicy(policy) {
  return String(policy ?? 'no transfer behavior set').replaceAll('_', ' ');
}

function renderStatusSelect(selected = 'pending') {
  return `<select name="status">${['pending', 'stale', 'disputed', 'revoked'].map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`).join('')}</select>`;
}

function renderTransferPolicySelect(selected = '') {
  return `<select name="transfer_policy"><option value=""></option>${['reverify_on_transfer', 'pause_on_transfer', 'historical_on_transfer', 'never_transfer'].map((policy) => `<option value="${policy}" ${policy === selected ? 'selected' : ''}>${policy}</option>`).join('')}</select>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

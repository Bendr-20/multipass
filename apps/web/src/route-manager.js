const ROUTE_STATUSES = ['pending', 'stale', 'disputed', 'revoked'];
const ROUTE_PROTOCOLS = ['web', 'api', 'mcp', 'a2a', 'x402'];
const ROUTE_REVIEW_POLICIES = ['pause_on_transfer', 'reverify_on_transfer', 'historical_on_transfer', 'never_transfer'];

const STATUS_LABELS = new Map([
  ['pending', 'Review required'],
  ['verified', 'Verified reference'],
  ['stale', 'Recheck needed'],
  ['disputed', 'Disputed'],
  ['historical', 'Historical reference'],
  ['revoked', 'Revoked'],
]);

const REVIEW_LABELS = new Map([
  ['pause_on_transfer', 'Recheck on owner change'],
  ['reverify_on_transfer', 'Reverify on owner change'],
  ['historical_on_transfer', 'Keep historical on owner change'],
  ['never_transfer', 'Do not carry forward on owner change'],
]);

export function getPublicRouteFragments(dataOrFragments) {
  const fragments = Array.isArray(dataOrFragments)
    ? dataOrFragments
    : (Array.isArray(dataOrFragments?.fragments?.fragments) ? dataOrFragments.fragments.fragments : []);

  return fragments
    .filter((fragment) => fragment?.visibility === 'public')
    .filter((fragment) => fragment?.fragment_type === 'endpoint')
    .filter((fragment) => String(fragment?.endpoint_ref?.url ?? '').trim())
    .toSorted(compareRouteFragments);
}

export function createUniqueRouteId(label, existingIds = []) {
  const used = new Set(existingIds.map(routeIdFromEntry).filter(Boolean));
  const base = slugRouteId(label) || 'route';
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(0, 80 - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Could not create a unique route ID.');
}

export function renderPublicRoutesPanel(data) {
  const routes = getPublicRouteFragments(data);
  if (!routes.length) return '';
  const primaryId = getPrimaryRouteId(routes);
  return `
    <section class="public-routes-panel" aria-label="Public routes">
      <div class="public-routes-heading">
        <p class="card-label">Public routes</p>
        <h3>Published reference routes.</h3>
        <p>Display-only route cards for public profile references. Private credentials stay hidden.</p>
      </div>
      <div class="public-route-list">
        ${routes.map((route) => renderPublicRouteCard(route, { primary: route.fragment_id === primaryId })).join('')}
      </div>
    </section>
  `;
}

export function renderPublicRoutesManagerPanel(state = {}) {
  const routes = getPublicRouteFragments(state.data ?? {});
  return `
    <section class="route-manager-panel" aria-label="Public route manager">
      <div class="route-manager-copy">
        <p class="card-label">Public route manager</p>
        <h3>Publish public route cards.</h3>
        <p>Safe display references for the saved Multipass profile. Route cards do not grant tools, credentials, custody, or ownership.</p>
        ${state.fragmentError ? `<p class="resolver-message error">${escapeHtml(state.fragmentError)}</p>` : ''}
      </div>
      ${renderCreateRouteForm(state, routes)}
      <div class="managed-route-toolbar">
        <strong>${routes.length} public route${routes.length === 1 ? '' : 's'}</strong>
        <span>Owner-submitted route cards can be edited. Imported route cards are read-only.</span>
      </div>
      <div class="managed-route-list">
        ${routes.length ? routes.map((route) => renderManagedRouteCard(route, state)).join('') : '<p class="resolver-message">No public routes saved yet.</p>'}
      </div>
    </section>
  `;
}

export function compactRouteInput(formData, existingRoutes = []) {
  const routeLabel = getFormValue(formData, 'route_label') || getFormValue(formData, 'public_value');
  const routeUrl = getFormValue(formData, 'route_url') || getFormValue(formData, 'endpoint_url') || getFormValue(formData, 'reference_url');
  const proofNote = getFormValue(formData, 'proof_reference');
  const protocol = getFormValue(formData, 'route_type') || getFormValue(formData, 'endpoint_protocol') || 'web';
  const routeId = getFormValue(formData, 'endpoint_id') || createUniqueRouteId(routeLabel, existingRoutes);
  const input = {
    fragment_type: 'endpoint',
    public_value: routeLabel,
    reference_url: routeUrl,
    transfer_policy: 'pause_on_transfer',
    endpoint_ref: { endpoint_id: routeId, url: routeUrl, protocol },
  };
  if (proofNote) input.proof_reference = proofNote;
  return input;
}

export function compactRoutePatch(formData, currentRoute = {}) {
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
  return patch;
}

export function bindRouteManager(root, handlers = {}) {
  root.querySelector('[data-action="create-public-route"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.createRoute?.(event);
  });

  root.querySelectorAll('[data-action="update-public-route"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.updateRoute?.(event);
    });
  });

  root.querySelectorAll('[data-action="revoke-public-route"]').forEach((button) => {
    button.addEventListener('click', (event) => handlers.revokeRoute?.(event));
  });
}

function compareRouteFragments(left, right) {
  const leftRank = routeGroupRank(left);
  const rightRank = routeGroupRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftTime = routeSortTime(left);
  const rightTime = routeSortTime(right);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(left.fragment_id ?? '').localeCompare(String(right.fragment_id ?? ''));
}

function routeGroupRank(route) {
  if (route.status === 'revoked') return 2;
  return isManagerRoute(route) ? 0 : 1;
}

function routeSortTime(route) {
  const value = route.updated_at ?? route.created_at ?? route.source?.observed_at ?? '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function getPrimaryRouteId(routes) {
  return routes.find((route) => route.status !== 'revoked')?.fragment_id ?? null;
}

function renderPublicRouteCard(route, { primary = false } = {}) {
  const url = String(route.endpoint_ref?.url ?? '').trim();
  const safeUrl = safeHttpsUrl(url);
  const title = route.public_value || route.endpoint_ref?.endpoint_id || 'Public route';
  return `
    <article class="public-route-card ${primary ? 'primary' : ''}" data-fragment-id="${escapeAttribute(route.fragment_id ?? '')}">
      <div class="public-route-card-heading">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(statusLabel(route.status))}</span>
        ${primary ? '<em>Primary route</em>' : ''}
      </div>
      <p>${escapeHtml(reviewLabel(route.transfer_policy))}</p>
      ${safeUrl ? `<a href="${escapeAttribute(safeUrl)}" rel="noreferrer">${escapeHtml(safeUrl)}</a>` : (url ? `<span class="route-url inert">${escapeHtml(url)}</span>` : '<span class="route-url inert">No public URL published.</span>')}
      ${route.proof_reference ? `<small>${escapeHtml(route.proof_reference)}</small>` : ''}
    </article>
  `;
}

function renderCreateRouteForm(state, routes) {
  return `
    <form class="route-create-form" data-action="create-public-route">
      <div class="fragment-form-heading">
        <strong>Add public route</strong>
        <span>Create a display reference from a safe HTTPS URL.</span>
      </div>
      <label><span>Route label</span><input name="route_label" placeholder="Primary public profile" /></label>
      <label><span>Route URL</span><input name="route_url" placeholder="https://helixa.xyz/multipass/..." /></label>
      <label><span>Proof note</span><input name="proof_reference" placeholder="Optional public context" /></label>
      <label><span>Route type</span>${renderRouteProtocolSelect()}</label>
      <label><span>Route ID</span><input name="endpoint_id" placeholder="${escapeAttribute(createUniqueRouteId('Primary public profile', routes))}" /></label>
      <button type="submit" ${state.fragmentStatus === 'creating_fragment' ? 'disabled' : ''}>${state.fragmentStatus === 'creating_fragment' ? 'Adding...' : 'Publish route'}</button>
    </form>
  `;
}

function renderManagedRouteCard(route, state) {
  const editable = isManagerRoute(route);
  return `
    <article class="managed-route-card ${editable ? 'editable' : 'readonly'}" data-fragment-id="${escapeAttribute(route.fragment_id ?? '')}">
      ${renderPublicRouteCard(route)}
      ${editable ? renderRouteEditForm(route, state) : '<p class="resolver-message">Imported route. Read-only here.</p>'}
    </article>
  `;
}

function renderRouteEditForm(route, state) {
  return `
    <form class="route-edit-form" data-action="update-public-route" data-fragment-id="${escapeAttribute(route.fragment_id ?? '')}">
      <label><span>Route label</span><input name="route_label" value="${escapeAttribute(route.public_value ?? '')}" /></label>
      <label><span>Route URL</span><input name="route_url" value="${escapeAttribute(route.endpoint_ref?.url ?? '')}" /></label>
      <label><span>Proof note</span><input name="proof_reference" value="${escapeAttribute(route.proof_reference ?? '')}" /></label>
      <label><span>Status</span>${renderRouteStatusSelect(route.status)}</label>
      <label><span>Review behavior</span>${renderReviewPolicySelect(route.transfer_policy)}</label>
      <label><span>Route ID</span><input name="endpoint_id" value="${escapeAttribute(route.endpoint_ref?.endpoint_id ?? '')}" /></label>
      <label><span>Route type</span>${renderRouteProtocolSelect(route.endpoint_ref?.protocol)}</label>
      <div class="fragment-edit-actions">
        <button type="submit" ${state.fragmentStatus === 'updating_fragment' ? 'disabled' : ''}>Save route</button>
        <button class="secondary-button" type="button" data-action="revoke-public-route" data-fragment-id="${escapeAttribute(route.fragment_id ?? '')}" ${route.status === 'revoked' ? 'disabled' : ''}>Retire route</button>
      </div>
    </form>
  `;
}

function renderRouteStatusSelect(selected = 'pending') {
  return `<select name="status">${ROUTE_STATUSES.map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select>`;
}

function renderReviewPolicySelect(selected = 'pause_on_transfer') {
  return `<select name="transfer_policy">${ROUTE_REVIEW_POLICIES.map((policy) => `<option value="${policy}" ${policy === selected ? 'selected' : ''}>${reviewLabel(policy)}</option>`).join('')}</select>`;
}

function renderRouteProtocolSelect(selected = 'web') {
  return `<select name="route_type">${ROUTE_PROTOCOLS.map((protocol) => `<option value="${protocol}" ${protocol === selected ? 'selected' : ''}>${protocol}</option>`).join('')}</select>`;
}

function isManagerRoute(route) {
  return route?.source?.source_type === 'owner_submission' && route?.source?.issuer === null;
}

function routeIdFromEntry(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.endpoint_ref?.endpoint_id ?? entry?.endpoint_id ?? null;
}

function slugRouteId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function statusLabel(status) {
  return STATUS_LABELS.get(status) ?? String(status ?? 'Review required');
}

function reviewLabel(policy) {
  return REVIEW_LABELS.get(policy) ?? 'Recheck on owner change';
}

function getFormValue(formData, key) {
  return String(formData.get(key) ?? '').trim();
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

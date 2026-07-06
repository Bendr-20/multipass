const MARKETPLACE_DISPLAY_STATUSES = ['manager_supplied', 'public_import', 'pending', 'stale', 'disputed'];
const MAX_ROW_COUNT = 8;

const KNOWN_MARKETPLACE_HOSTS = [
  [/^(.*\.)?bankr\.bot$/, 'Bankr'],
  [/^(.*\.)?okx\.ai$/, 'OKX.AI'],
  [/^(social\.)?moltx\.io$|^(.*\.)?moltx\.io$/, 'MoltX'],
  [/^(.*\.)?agentgram\.xyz$/, 'AgentGram'],
  [/^(.*\.)?virtuals\.io$/, 'Virtuals'],
  [/^(.*\.)?opensea\.io$/, 'OpenSea'],
];

export function createMarketplaceDraftFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? '').trim());
  } catch {
    return { draft: null, error: 'Marketplace URL must be a valid URL.' };
  }
  if (parsed.protocol !== 'https:') return { draft: null, error: 'Marketplace URL must use https.' };
  if (parsed.username || parsed.password) return { draft: null, error: 'Marketplace URL must not include credentials.' };
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  const listingId = extractListingId(parsed.pathname);
  const marketplace = marketplaceLabelForHost(parsed.hostname);
  return {
    draft: {
      marketplace,
      profile_url: parsed.toString(),
      listing_id: listingId,
      title: listingId || marketplace,
      summary: '',
      status: 'public_import',
    },
    error: null,
  };
}

export function compactMarketplaceConnectionInput(formData) {
  const marketplaceRef = compactMarketplaceRef(formData, {}, 'manager_supplied');
  return {
    fragment_type: 'attestation',
    public_value: buildMarketplacePublicValue(marketplaceRef),
    reference_url: marketplaceRef.profile_url,
    transfer_policy: 'historical_on_transfer',
    marketplace_ref: marketplaceRef,
  };
}

export function compactMarketplaceConnectionPatch(formData, current = {}) {
  const marketplaceRef = compactMarketplaceRef(formData, current, current?.marketplace_ref?.status || 'manager_supplied');
  return {
    public_value: buildMarketplacePublicValue(marketplaceRef),
    reference_url: marketplaceRef.profile_url,
    transfer_policy: 'historical_on_transfer',
    marketplace_ref: marketplaceRef,
  };
}

export function mergeMarketplaceConnectionMutationState(current, result, patch = {}) {
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

export function renderMarketplaceConnectionManagerPanel(state = {}) {
  const marketplaceFragments = getMarketplaceConnectionFragments(state.data);
  const activeFragments = marketplaceFragments.filter((fragment) => !isRetiredMarketplaceFragment(fragment));
  const hiddenCount = marketplaceFragments.length - activeFragments.length;

  return `
    <section class="marketplace-connection-manager-panel" aria-label="Marketplace Connections">
      <div class="marketplace-connection-manager-copy">
        <p class="card-label">Marketplace Connections</p>
        <h3>Marketplace Connections</h3>
        <p>Display-only public metadata. Multipass does not execute marketplace tasks, collect credentials, enforce payment, transfer custody, or grant tools.</p>
        ${state.marketplaceConnectionError ? `<p class="resolver-message error">${escapeHtml(state.marketplaceConnectionError)}</p>` : ''}
      </div>
      ${renderCreateMarketplaceConnectionForm(state)}
      <div class="marketplace-connection-toolbar">
        <strong>${activeFragments.length} active Marketplace Connection${activeFragments.length === 1 ? '' : 's'}</strong>
        <span>Owner-submitted connections can be edited. Imported connections stay display-only evidence.${hiddenCount ? ` ${hiddenCount} retired or revoked hidden.` : ''}</span>
      </div>
      <div class="marketplace-connection-list">
        ${activeFragments.length ? activeFragments.map((fragment) => renderManagedMarketplaceConnection(fragment, state)).join('') : '<p class="resolver-message">No marketplace connections published yet.</p>'}
      </div>
    </section>
  `;
}

export function bindMarketplaceConnectionManager(root, handlers = {}) {
  root.querySelector('[data-action="prefill-marketplace-url"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    prefillMarketplaceConnectionForm(event.currentTarget.closest('form') ?? root);
  });

  root.querySelector('[data-action="create-marketplace-connection"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.createMarketplaceConnection?.(event);
  });

  root.querySelectorAll('[data-action="update-marketplace-connection"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.updateMarketplaceConnection?.(event);
    });
  });

  root.querySelectorAll('[data-action="retire-marketplace-connection"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      handlers.retireMarketplaceConnection?.(event);
    });
  });
}

function compactMarketplaceRef(formData, current = {}, defaultStatus = 'manager_supplied') {
  const currentRef = current?.marketplace_ref ?? current ?? {};
  const marketplace = getFormValue(formData, 'marketplace', currentRef.marketplace);
  const profileUrl = normalizePublicHttpsUrl(getFormValue(formData, 'profile_url', currentRef.profile_url));
  const listingId = getFormValue(formData, 'listing_id', currentRef.listing_id);
  const title = getFormValue(formData, 'title', currentRef.title) || listingId || marketplace;
  const summary = getFormValue(formData, 'summary', currentRef.summary ?? '');
  const status = compactMarketplaceStatus(formData, currentRef, defaultStatus);
  const sourceCheckedAt = getFormValue(formData, 'source_checked_at');
  const services = compactRows(formData, [
    ['name', 'service_name'],
    ['price', 'service_price'],
    ['payment_mode', 'service_payment_mode'],
    ['endpoint_url', 'service_endpoint_url', normalizePublicHttpsUrl],
  ]);
  const paymentRails = compactRows(formData, [
    ['asset', 'payment_rail_asset'],
    ['mode', 'payment_rail_mode'],
    ['chain', 'payment_rail_chain'],
  ]);
  const facts = compactRows(formData, [
    ['label', 'fact_label'],
    ['value', 'fact_value'],
  ]);
  const reputation = compactReputation(formData);

  const marketplaceRef = {
    marketplace,
    profile_url: profileUrl,
    title,
    summary,
    status,
  };
  if (listingId) marketplaceRef.listing_id = listingId;
  if (sourceCheckedAt) marketplaceRef.source_checked_at = sourceCheckedAt;
  if (services.length) marketplaceRef.services = services;
  if (paymentRails.length) marketplaceRef.payment_rails = paymentRails;
  if (Object.keys(reputation).length) marketplaceRef.reputation = reputation;
  if (facts.length) marketplaceRef.facts = facts;
  return marketplaceRef;
}

function compactMarketplaceStatus(formData, currentRef, defaultStatus) {
  const selectedStatus = getFormValue(formData, 'status');
  if (MARKETPLACE_DISPLAY_STATUSES.includes(selectedStatus)) return selectedStatus;

  const statusDefault = getFormValue(formData, 'marketplace_status_default');
  if (MARKETPLACE_DISPLAY_STATUSES.includes(statusDefault)) return statusDefault;

  const currentStatus = String(currentRef?.status ?? '').trim();
  if (MARKETPLACE_DISPLAY_STATUSES.includes(currentStatus)) return currentStatus;

  if (getFormValue(formData, 'marketplace_url_import')) return 'public_import';
  return MARKETPLACE_DISPLAY_STATUSES.includes(defaultStatus) ? defaultStatus : 'manager_supplied';
}

function compactRows(formData, fieldDefinitions) {
  const columns = fieldDefinitions.map(([key, name, transform]) => ({
    key,
    transform,
    values: formData.getAll(name).map((value) => String(value ?? '').trim()),
  }));
  const rowCount = Math.min(MAX_ROW_COUNT, Math.max(0, ...columns.map((column) => column.values.length)));
  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = {};
    for (const column of columns) {
      const value = column.values[index] ?? '';
      const normalized = value && typeof column.transform === 'function' ? column.transform(value) : value;
      if (normalized) row[column.key] = normalized;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function compactReputation(formData) {
  const reputation = {};
  for (const key of ['score', 'positive_rate', 'sold_count', 'review_count']) {
    const value = getFormValue(formData, `reputation_${key}`);
    if (value) reputation[key] = value;
  }
  return reputation;
}

function buildMarketplacePublicValue(ref) {
  const marketplace = ref.marketplace || 'Marketplace';
  const title = ref.title || ref.listing_id || marketplace;
  const summary = ref.summary ? ` ${ref.summary}` : '';
  return truncate(`Marketplace connection: ${title} on ${marketplace}.${summary}`, 1000);
}

function prefillMarketplaceConnectionForm(form) {
  const input = form.querySelector('input[name="marketplace_url_import"]');
  const { draft, error } = createMarketplaceDraftFromUrl(input?.value ?? '');
  const message = form.querySelector('[data-marketplace-url-message]');
  if (message) message.textContent = error ?? '';
  if (!draft) return;
  setFieldValue(form, 'marketplace', draft.marketplace);
  setFieldValue(form, 'profile_url', draft.profile_url);
  setFieldValue(form, 'listing_id', draft.listing_id);
  setFieldValue(form, 'title', draft.title);
  setFieldValue(form, 'summary', draft.summary);
  setFieldValue(form, 'status', draft.status);
  setFieldValue(form, 'marketplace_status_default', draft.status);
}

function setFieldValue(root, name, value) {
  const field = root.querySelector(`[name="${name}"]`);
  if (field) field.value = value;
}

function getMarketplaceConnectionFragments(data = {}) {
  const fragments = Array.isArray(data?.fragments?.fragments) ? data.fragments.fragments : [];
  return fragments.filter((fragment) => fragment?.marketplace_ref && typeof fragment.marketplace_ref === 'object');
}

function isRetiredMarketplaceFragment(fragment) {
  const fragmentStatus = String(fragment?.status ?? '').toLowerCase();
  const displayStatus = String(fragment?.marketplace_ref?.status ?? '').toLowerCase();
  return ['revoked', 'retired'].includes(fragmentStatus) || ['revoked', 'retired'].includes(displayStatus);
}

function renderCreateMarketplaceConnectionForm(state) {
  const creating = state.marketplaceConnectionStatus === 'creating_marketplace_connection';
  return `
    <form class="marketplace-connection-create-form" data-action="create-marketplace-connection">
      <div class="marketplace-connection-form-heading">
        <strong>Add marketplace connection</strong>
        <span>Paste a public marketplace URL to prefill fields locally, then review before publishing.</span>
      </div>
      <div class="marketplace-url-import-row">
        <label><span>Paste public marketplace URL</span><input name="marketplace_url_import" placeholder="https://marketplace.example/agent/name" /></label>
        <button class="secondary-button" type="button" data-action="prefill-marketplace-url">Prefill from URL</button>
      </div>
      <p class="resolver-message" data-marketplace-url-message></p>
      ${renderMarketplaceConnectionFields({}, { status: 'manager_supplied', includeStatusDefault: true })}
      <button type="submit" ${creating ? 'disabled' : ''}>${creating ? 'Adding...' : 'Add marketplace connection'}</button>
    </form>
  `;
}

function renderManagedMarketplaceConnection(fragment, state) {
  const ref = fragment.marketplace_ref ?? {};
  const editable = fragment.source?.source_type === 'owner_submission' && fragment.source?.issuer === null;
  return `
    <article class="marketplace-connection-card ${editable ? 'editable' : 'readonly'}">
      <div class="marketplace-connection-summary">
        <div class="marketplace-connection-title"><strong>${escapeHtml(ref.title || ref.marketplace || 'Marketplace Connection')}</strong><span>${editable ? 'Editable' : 'Read-only'}</span></div>
        <span>${escapeHtml(ref.marketplace ?? 'Marketplace')} · ${escapeHtml(ref.status ?? fragment.status ?? 'pending')}</span>
        <p>${escapeHtml(ref.summary || ref.profile_url || 'Display-only public marketplace metadata.')}</p>
      </div>
      ${editable ? renderMarketplaceConnectionEditForm(fragment, state) : '<p class="resolver-message">Imported Marketplace Connection. Read-only here.</p>'}
    </article>
  `;
}

function renderMarketplaceConnectionEditForm(fragment, state) {
  const ref = fragment.marketplace_ref ?? {};
  const updating = state.marketplaceConnectionStatus === 'updating_marketplace_connection' && state.marketplaceConnectionActiveFragmentId === fragment.fragment_id;
  return `
    <form class="marketplace-connection-edit-form" data-action="update-marketplace-connection" data-fragment-id="${escapeAttribute(fragment.fragment_id)}">
      ${renderMarketplaceConnectionFields(ref, { status: ref.status ?? 'manager_supplied' })}
      <div class="marketplace-connection-edit-actions">
        <button type="submit" ${updating ? 'disabled' : ''}>${updating ? 'Saving...' : 'Save marketplace connection'}</button>
        <button class="secondary-button" type="button" data-action="retire-marketplace-connection" data-fragment-id="${escapeAttribute(fragment.fragment_id)}">Retire connection</button>
      </div>
    </form>
  `;
}

function renderMarketplaceConnectionFields(ref = {}, { status = 'manager_supplied', includeStatusDefault = false } = {}) {
  return `
    <div class="marketplace-connection-field-grid">
      ${includeStatusDefault ? '<input type="hidden" name="marketplace_status_default" value="manager_supplied" />' : ''}
      <label><span>Marketplace</span><input name="marketplace" value="${escapeAttribute(ref.marketplace ?? '')}" placeholder="Bankr" /></label>
      <label><span>Public profile URL</span><input name="profile_url" value="${escapeAttribute(ref.profile_url ?? '')}" placeholder="https://..." /></label>
      <label><span>Listing ID</span><input name="listing_id" value="${escapeAttribute(ref.listing_id ?? '')}" placeholder="Optional public listing ID" /></label>
      <label><span>Display title</span><input name="title" value="${escapeAttribute(ref.title ?? '')}" placeholder="Public marketplace listing title" /></label>
      <label class="wide-field"><span>Summary</span><textarea name="summary" placeholder="Short public summary">${escapeHtml(ref.summary ?? '')}</textarea></label>
      <label><span>Source checked date</span><input name="source_checked_at" value="${escapeAttribute(ref.source_checked_at ?? '')}" placeholder="YYYY-MM-DD" /></label>
      <label><span>Display status</span>${renderMarketplaceStatusSelect(status)}</label>
    </div>
    ${renderServiceRows(ref.services)}
    ${renderPaymentRailRows(ref.payment_rails)}
    ${renderReputationFields(ref.reputation)}
    ${renderFactRows(ref.facts)}
  `;
}

function renderServiceRows(services = []) {
  const rows = normalizedRows(services, { name: '', price: '', payment_mode: '', endpoint_url: '' });
  return `
    <fieldset class="marketplace-connection-row-group">
      <legend>Services</legend>
      ${rows.map((service) => `
        <div class="marketplace-connection-row">
          <input name="service_name" value="${escapeAttribute(service.name ?? '')}" placeholder="Service name" />
          <input name="service_price" value="${escapeAttribute(service.price ?? '')}" placeholder="Price label" />
          <input name="service_payment_mode" value="${escapeAttribute(service.payment_mode ?? '')}" placeholder="Payment mode" />
          <input name="service_endpoint_url" value="${escapeAttribute(service.endpoint_url ?? '')}" placeholder="https://api.example/service" />
        </div>
      `).join('')}
    </fieldset>
  `;
}

function renderPaymentRailRows(paymentRails = []) {
  const rows = normalizedRows(paymentRails, { asset: '', mode: '', chain: '' });
  return `
    <fieldset class="marketplace-connection-row-group">
      <legend>Payment rails</legend>
      ${rows.map((rail) => `
        <div class="marketplace-connection-row">
          <input name="payment_rail_asset" value="${escapeAttribute(rail.asset ?? '')}" placeholder="Asset" />
          <input name="payment_rail_mode" value="${escapeAttribute(rail.mode ?? '')}" placeholder="Mode" />
          <input name="payment_rail_chain" value="${escapeAttribute(rail.chain ?? '')}" placeholder="Chain" />
        </div>
      `).join('')}
    </fieldset>
  `;
}

function renderReputationFields(reputation = {}) {
  return `
    <fieldset class="marketplace-connection-row-group">
      <legend>Reputation</legend>
      <div class="marketplace-connection-row">
        <input name="reputation_score" value="${escapeAttribute(reputation.score ?? '')}" placeholder="Score" />
        <input name="reputation_positive_rate" value="${escapeAttribute(reputation.positive_rate ?? '')}" placeholder="Positive rate" />
        <input name="reputation_sold_count" value="${escapeAttribute(reputation.sold_count ?? '')}" placeholder="Sold count" />
        <input name="reputation_review_count" value="${escapeAttribute(reputation.review_count ?? '')}" placeholder="Review count" />
      </div>
    </fieldset>
  `;
}

function renderFactRows(facts = []) {
  const rows = normalizedRows(facts, { label: '', value: '' });
  return `
    <fieldset class="marketplace-connection-row-group">
      <legend>Facts</legend>
      ${rows.map((fact) => `
        <div class="marketplace-connection-row">
          <input name="fact_label" value="${escapeAttribute(fact.label ?? '')}" placeholder="Fact label" />
          <input name="fact_value" value="${escapeAttribute(fact.value ?? '')}" placeholder="Fact value" />
        </div>
      `).join('')}
    </fieldset>
  `;
}

function normalizedRows(rows, emptyRow) {
  const normalized = Array.isArray(rows) ? rows.slice(0, MAX_ROW_COUNT) : [];
  return normalized.length ? normalized : [emptyRow];
}

function renderMarketplaceStatusSelect(selected = 'manager_supplied') {
  const safeSelected = MARKETPLACE_DISPLAY_STATUSES.includes(selected) ? selected : 'manager_supplied';
  return `<select name="status">${MARKETPLACE_DISPLAY_STATUSES.map((status) => `<option value="${status}" ${status === safeSelected ? 'selected' : ''}>${status}</option>`).join('')}</select>`;
}

function extractListingId(pathname) {
  const segments = String(pathname ?? '').split('/').filter(Boolean);
  if (!segments.length) return '';
  try {
    return decodeURIComponent(segments.at(-1) ?? '').trim();
  } catch {
    return '';
  }
}

function marketplaceLabelForHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  for (const [pattern, label] of KNOWN_MARKETPLACE_HOSTS) {
    if (pattern.test(host)) return label;
  }
  const cleaned = host.replace(/^www\./, '');
  return cleaned
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Marketplace';
}

function normalizePublicHttpsUrl(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return rawValue;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return rawValue;
  }
}

function getFormValue(formData, name, fallback = '') {
  if (!formData.has(name)) return String(fallback ?? '').trim();
  return String(formData.get(name) ?? '').trim();
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

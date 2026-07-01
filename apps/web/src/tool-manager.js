const SAFETY_COPY = 'Discovery metadata only. These cards do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.';
const BANKR_SOURCE = 'bankr_x402_cloud';
const BANKR_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const TOOL_STATUS_MESSAGES = new Map([
  ['tool_imported', 'Tool service imported.'],
]);

export function renderPublicToolsPanel(data = {}) {
  const tools = getPublicTools(data);
  if (!tools.length) return '';

  return `
    <section class="public-tools-panel" aria-label="Tools and services">
      <div class="tool-manager-copy">
        <p class="card-label">Tools and services</p>
        <h3>Public tool registry cards.</h3>
        <p>${escapeHtml(SAFETY_COPY)}</p>
      </div>
      <div class="public-tool-list">
        ${tools.map(renderPublicToolCard).join('')}
      </div>
    </section>
  `;
}

export function renderToolRegistryManagerPanel(state = {}, { canEdit = Boolean(state.claimCsrfToken) } = {}) {
  const tools = getPublicTools(state.data);
  const publicTools = renderPublicToolsPanel(state.data);
  if (!canEdit) {
    return `
      <section class="tool-manager-panel" data-command-section="tools" aria-label="Tool registry metadata">
        ${publicTools || renderToolRegistryPlaceholder()}
      </section>
    `;
  }

  return `
    <section class="tool-manager-panel" data-command-section="tools" aria-label="Tool registry metadata">
      <div class="tool-manager-copy">
        <p class="card-label">Tools</p>
        <h3>Import Bankr x402 service metadata.</h3>
        <p>${escapeHtml(SAFETY_COPY)}</p>
        ${renderToolManagerStatus(state)}
      </div>
      ${renderBankrImportForm(state)}
      <div class="managed-tool-toolbar">
        <strong>${tools.length} public tool${tools.length === 1 ? '' : 's'}</strong>
        <span>Imported cards are display and discovery metadata only.</span>
      </div>
      ${publicTools || '<p class="resolver-message">No public tool cards are published for this profile yet.</p>'}
    </section>
  `;
}

export function bindToolManager(root, handlers = {}) {
  root.querySelector('[data-action="import-bankr-tool"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.importBankrTool?.(event);
  });
}

export function compactBankrToolImportInput(formData) {
  const serviceName = getFormValue(formData, 'serviceName');
  if (!serviceName) throw new Error('Service name is required.');

  const endpointUrl = getFormValue(formData, 'endpointUrl');
  if (!safeHttpsUrl(endpointUrl)) throw new Error('Endpoint URL must be an HTTPS URL.');

  const method = normalizeMethod(getFormValue(formData, 'method') || 'GET');
  const inputSummary = getFormValue(formData, 'inputSummary');
  const outputSummary = getFormValue(formData, 'outputSummary');
  const schema = {};
  if (inputSummary) schema.input = inputSummary;
  if (outputSummary) schema.output = outputSummary;

  return {
    source: BANKR_SOURCE,
    serviceName,
    endpointUrl: safeHttpsUrl(endpointUrl),
    network: getFormValue(formData, 'network') || 'base',
    currency: getFormValue(formData, 'asset') || 'USDC',
    service: {
      price: getFormValue(formData, 'price') || '0.00',
      description: getFormValue(formData, 'description'),
      methods: [method],
      schema,
    },
  };
}

export function mergeToolImportState(current, result, patch = {}) {
  const nextProfile = result?.profile ? { ...current.data.profile, ...result.profile } : current.data.profile;
  return {
    ...current,
    ...patch,
    data: {
      ...current.data,
      profile: nextProfile,
      fragments: result?.fragments ?? current.data.fragments,
      tools: result?.tools ?? current.data.tools,
    },
  };
}

export function getPublicTools(data = {}) {
  const collection = Array.isArray(data?.tools?.tools)
    ? data.tools.tools
    : (Array.isArray(data?.tools) ? data.tools : []);
  return collection.filter((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const visibility = String(tool.visibility ?? 'public').toLowerCase();
    return !['private', 'gated', 'hidden'].includes(visibility);
  });
}

function renderToolRegistryPlaceholder() {
  return `
    <div>
      <p class="card-label">Tools</p>
      <h3>Tool registry cards are next.</h3>
      <p>These future cards are discovery metadata only. They do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.</p>
    </div>
  `;
}

function renderToolManagerStatus(state = {}) {
  if (state.toolError) return `<p class="tool-manager-status resolver-message error">${escapeHtml(state.toolError)}</p>`;
  const message = TOOL_STATUS_MESSAGES.get(state.toolStatus);
  return message ? `<p class="tool-manager-status resolver-message">${escapeHtml(message)}</p>` : '';
}

function renderBankrImportForm(state = {}) {
  const importing = state.toolStatus === 'importing_tool';
  return `
    <form class="bankr-tool-import-form" data-action="import-bankr-tool">
      <div class="fragment-form-heading">
        <strong>Import Bankr x402 service</strong>
        <span>Create a public tool card from service metadata. This does not call or deploy the service.</span>
      </div>
      <input type="hidden" name="network" value="base" />
      <label><span>Service name</span><input name="serviceName" placeholder="cred-report" /></label>
      <label><span>Endpoint URL</span><input name="endpointUrl" placeholder="https://api.bankr.bot/x402/helixa/cred-report" /></label>
      <label><span>Price</span><input name="price" placeholder="1.00" inputmode="decimal" /></label>
      <label><span>Asset</span><input name="asset" placeholder="USDC" value="USDC" /></label>
      <label><span>Method</span>${renderMethodSelect()}</label>
      <label><span>Input summary</span><input name="inputSummary" placeholder="id: number - AgentDNA token ID" /></label>
      <label><span>Output summary</span><input name="outputSummary" placeholder="score: number" /></label>
      <label><span>Description</span><textarea name="description" rows="3" placeholder="Helixa AgentDNA cred report."></textarea></label>
      <p class="route-field-helper">Imports display metadata only. It does not execute tools, make Bankr calls, or grant access.</p>
      <button type="submit" ${importing ? 'disabled' : ''}>${importing ? 'Importing...' : 'Import service card'}</button>
    </form>
  `;
}

function renderMethodSelect(selected = 'GET') {
  return `<select name="method">${BANKR_METHODS.map((method) => `<option value="${method}" ${method === selected ? 'selected' : ''}>${method}</option>`).join('')}</select>`;
}

function normalizeMethod(value) {
  const method = String(value ?? '').trim().toUpperCase();
  if (!BANKR_METHODS.includes(method)) throw new Error('HTTP method is not supported for Bankr imports.');
  return method;
}

function getFormValue(formData, key) {
  return String(formData?.get(key) ?? '').trim();
}

function renderPublicToolCard(tool = {}) {
  const title = firstText(tool.name, tool.tool_id, 'Public tool card');
  const registry = formatToken(tool.registry);
  const status = formatToken(tool.status);
  const assurance = formatToken(tool.assurance_level);
  const endpoint = safeHttpsUrl(tool.endpoint_url);
  const manifest = safeHttpsUrl(tool.manifest_url);
  const verifiability = renderVerifiability(tool.verifiability);
  const schemaSummary = renderSchemaSummary(tool.schemas);
  const pricing = renderPricing(tool.pricing);

  return `
    <article class="public-tool-card" data-tool-id="${escapeAttribute(tool.tool_id ?? '')}">
      <div class="public-tool-card-heading">
        <div>
          <p class="card-label">${registry ? escapeHtml(registry) : 'Public registry card'}</p>
          <h4>${escapeHtml(title)}</h4>
        </div>
        <div class="public-tool-status">
          ${status ? `<span>${escapeHtml(status)}</span>` : ''}
          ${assurance ? `<span>${escapeHtml(assurance)}</span>` : ''}
        </div>
      </div>
      ${hasText(tool.description) ? `<p>${escapeHtml(tool.description)}</p>` : ''}
      <dl class="tool-card-meta">
        ${renderUrlRow('Endpoint', endpoint, 'No safe public endpoint URL published.')}
        ${manifest ? renderUrlRow('Manifest', manifest) : ''}
        ${hasText(tool.manifest_hash) ? renderMetaRow('Manifest hash', tool.manifest_hash) : ''}
        ${hasText(tool.creator_address) ? renderMetaRow('Creator', tool.creator_address) : ''}
        ${pricing}
        ${schemaSummary}
        ${verifiability}
        ${hasText(tool.last_checked_at) ? renderMetaRow('Last checked', tool.last_checked_at) : ''}
      </dl>
    </article>
  `;
}

function renderPricing(pricing = {}) {
  if (!pricing || typeof pricing !== 'object') return '';
  const parts = [];
  if (hasText(pricing.amount) && hasText(pricing.asset)) {
    parts.push(`${pricing.amount} ${pricing.asset}`);
  } else if (hasText(pricing.amount)) {
    parts.push(pricing.amount);
  } else if (hasText(pricing.asset)) {
    parts.push(pricing.asset);
  } else if (hasText(pricing.model)) {
    parts.push(pricing.model);
  }
  if (hasText(pricing.chain_id)) parts.push(`on chain ${pricing.chain_id}`);
  if (!parts.length) return '';
  return renderMetaRow('Pricing', parts.join(' '));
}

function renderSchemaSummary(schemas = {}) {
  if (!schemas || typeof schemas !== 'object') return '';
  return [
    hasText(schemas.input_summary) ? renderMetaRow('Input schema', schemas.input_summary) : '',
    hasText(schemas.output_summary) ? renderMetaRow('Output schema', schemas.output_summary) : '',
  ].join('');
}

function renderVerifiability(verifiability = {}) {
  if (!verifiability || typeof verifiability !== 'object') return '';
  const parts = [formatToken(verifiability.tier), verifiability.summary].filter(hasText);
  return parts.length ? renderMetaRow('Verifiability', parts.join(': ')) : '';
}

function renderUrlRow(label, safeUrl, emptyText = '') {
  if (!safeUrl) {
    return emptyText ? renderMetaRow(label, emptyText, { inert: true }) : '';
  }
  const text = formatSafeUrlText(safeUrl);
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd><a href="${escapeAttribute(safeUrl)}" rel="noreferrer">${escapeHtml(text)}</a></dd>
    </div>
  `;
}

function renderMetaRow(label, value, { inert = false } = {}) {
  return `
    <div class="${inert ? 'tool-card-meta-row inert' : 'tool-card-meta-row'}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatSafeUrlText(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return String(value ?? '');
  }
}

function firstText(...values) {
  return values.find(hasText) ?? '';
}

function hasText(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function formatToken(value) {
  return hasText(value) ? String(value).replaceAll('_', ' ') : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

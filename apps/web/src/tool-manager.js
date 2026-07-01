const SAFETY_COPY = 'Discovery metadata only. These cards do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.';

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

function getPublicTools(data = {}) {
  const collection = Array.isArray(data?.tools?.tools)
    ? data.tools.tools
    : (Array.isArray(data?.tools) ? data.tools : []);
  return collection.filter((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const visibility = String(tool.visibility ?? 'public').toLowerCase();
    return !['private', 'gated', 'hidden'].includes(visibility);
  });
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

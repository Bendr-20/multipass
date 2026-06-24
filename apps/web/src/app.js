import { getApiBaseFromLocation, loadMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
import { createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY } from './content.js';

export function createApp({ root, loadDemo = defaultLoadDemo }) {
  if (!root) throw new Error('createApp requires a root element');

  let state = { expandedCard: null };

  async function start() {
    renderLoading(root);
    try {
      const data = await loadDemo();
      state = { ...state, data };
      render(root, state);
    } catch (error) {
      renderError(root, error);
    }
  }

  return { start };
}

function defaultLoadDemo() {
  const locationUrl = new URL(window.location.href);
  if (shouldUseStaticDemo(locationUrl)) return loadStaticMultipassDemo();

  return loadMultipassDemo({
    apiBase: getApiBaseFromLocation(locationUrl),
    subject: DEMO_SUBJECT,
  });
}

function renderLoading(root) {
  root.innerHTML = `
    <section class="record-shell loading-shell">
      <p class="eyebrow">${HERO_COPY.eyebrow}</p>
      <h1>Loading Bendr 2.0...</h1>
    </section>
  `;
}

function renderError(root, error) {
  root.innerHTML = `
    <section class="record-shell error-shell">
      <p class="eyebrow">${HERO_COPY.eyebrow}</p>
      <h1>Could not load Multipass API data.</h1>
      <p>Run <code>pnpm api:bendr</code> in the Multipass repo, then reload this page.</p>
      <pre class="json-panel">${escapeHtml(error.message)}</pre>
    </section>
  `;
}

function render(root, state) {
  const { data } = state;
  const storyCards = createStoryCards(data);
  const proofCards = createProofCards(data);
  root.innerHTML = `
    <div class="record-shell">
      <header class="record-header">
        <div class="brand"><div class="mark" aria-hidden="true"></div><span>Multipass</span></div>
        <div class="header-meta"><span>Protocol Artifact</span><span>${escapeHtml(data.modeLabel ?? 'Local API Demo')}</span></div>
      </header>

      <section class="hero-record">
        <div>
          <p class="eyebrow">${HERO_COPY.eyebrow}</p>
          <h1>${HERO_COPY.headline}</h1>
          <p class="lead">${HERO_COPY.body}</p>
          <div class="note">${HERO_COPY.note}</div>
        </div>

        <article class="record-sheet">
          <div class="sheet-top">
            <div>
              <h2>${escapeHtml(data.profile.display_name)}</h2>
              <p>Agent profile with public identity fragments, standards references, x402 route metadata, and receipt evidence.</p>
            </div>
            <div class="stamp">Public proof only</div>
          </div>
          <div class="field-grid">
            ${renderField('Record', data.profile.multipass_id ?? DEMO_SUBJECT.slug)}
            ${renderField('Subject', data.profile.subject_type)}
            ${renderField('Slug', data.profile.slug ?? DEMO_SUBJECT.slug)}
            ${renderField('Status', data.profile.status, 'status')}
            ${renderField('Trust State', data.profile.cred_summary?.trust_state ?? 'none')}
            ${renderField('Source', data.sourceLabel ?? 'local API')}
            ${renderField('Receipt', data.receipt.receipt_id)}
          </div>
        </article>
      </section>

      <section class="story-records">${storyCards.map(renderStoryCard).join('')}</section>

      <section class="proof-ledger">
        <div class="ledger-title"><h2>Proof ledger</h2><span>Expandable API records</span></div>
        ${proofCards.map((card, index) => renderProofRow(card, index, state.expandedCard)).join('')}
      </section>

      <footer class="footer-note">This is a static public demo. It does not include auth, persistence, contract reads, or payment settlement.</footer>
    </div>
  `;

  root.querySelectorAll('[data-action="toggle-json"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cardIndex = Number(button.dataset.index);
      state.expandedCard = state.expandedCard === cardIndex ? null : cardIndex;
      render(root, state);
      root.querySelector(`[data-action="toggle-json"][data-index="${cardIndex}"]`)?.focus();
    });
  });
}

function renderField(label, value, className = '') {
  const extraClass = className ? ` ${className}` : '';
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong class="mono${extraClass}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderStoryCard(card, index) {
  return `
    <article class="story">
      <span class="story-num">${String(index + 1).padStart(2, '0')}</span>
      <p class="card-label">${escapeHtml(card.label)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </article>
  `;
}

function renderProofRow(card, index, expandedCard) {
  const expanded = expandedCard === index;
  return `
    <article class="ledger-entry">
      <div class="ledger-row">
        <div class="doc">${escapeHtml(card.title)}</div>
        <div class="badge ${getBadgeTone(card)}">${escapeHtml(card.status)}</div>
        <div class="summary">${escapeHtml(card.summary)}</div>
        <button data-action="toggle-json" data-index="${index}" aria-expanded="${expanded}" aria-controls="proof-json-${index}">${expanded ? 'Hide JSON' : 'Show JSON'}</button>
      </div>
      ${expanded ? `<pre id="proof-json-${index}" class="json-panel">${escapeHtml(JSON.stringify(card.json, null, 2))}</pre>` : ''}
    </article>
  `;
}


function getBadgeTone(card) {
  return ['settled', 'passed', 'filtered'].includes(String(card.status).toLowerCase()) ? 'verified' : 'neutral';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

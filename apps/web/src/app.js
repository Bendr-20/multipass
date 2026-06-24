import { getApiBaseFromLocation, loadMultipassDemo } from './api.js';
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
  return loadMultipassDemo({
    apiBase: getApiBaseFromLocation(new URL(window.location.href)),
    subject: DEMO_SUBJECT,
  });
}

function renderLoading(root) {
  root.innerHTML = `<section class="shell"><p class="eyebrow">${HERO_COPY.eyebrow}</p><h1>Loading Bendr 2.0...</h1></section>`;
}

function renderError(root, error) {
  root.innerHTML = `
    <section class="shell error-shell">
      <p class="eyebrow">MULTIPASS DEMO</p>
      <h1>Could not load Multipass API data.</h1>
      <p>Run <code>pnpm api:bendr</code> in the Multipass repo, then reload this page.</p>
      <pre>${escapeHtml(error.message)}</pre>
    </section>
  `;
}

function render(root, state) {
  const { data } = state;
  const storyCards = createStoryCards(data);
  const proofCards = createProofCards(data);
  root.innerHTML = `
    <div class="shell">
      <nav class="nav"><strong>MULTIPASS</strong><span>Local API demo</span></nav>
      <section class="hero">
        <div>
          <p class="eyebrow">${HERO_COPY.eyebrow}</p>
          <h1>${HERO_COPY.headline}</h1>
          <p class="hero-copy">${HERO_COPY.body}</p>
          <p class="note">${HERO_COPY.note}</p>
        </div>
        <aside class="command-card">
          <p class="eyebrow">Profile Command Center</p>
          <h2>${escapeHtml(data.profile.display_name)}</h2>
          <dl>
            <div><dt>Status</dt><dd>${escapeHtml(data.profile.status)}</dd></div>
            <div><dt>Subject</dt><dd>${escapeHtml(data.profile.subject_type)}</dd></div>
            <div><dt>Trust</dt><dd>${escapeHtml(data.profile.cred_summary?.trust_state ?? 'none')}</dd></div>
            <div><dt>API</dt><dd>local</dd></div>
          </dl>
        </aside>
      </section>
      <section class="story-grid">${storyCards.map(renderStoryCard).join('')}</section>
      <section class="proof-grid">${proofCards.map((card, index) => renderProofCard(card, index, state.expandedCard)).join('')}</section>
      <footer>This is a local development demo. It does not include auth, persistence, contract reads, or payment settlement.</footer>
    </div>
  `;

  root.querySelectorAll('[data-action="toggle-json"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cardIndex = Number(button.dataset.index);
      state.expandedCard = state.expandedCard === cardIndex ? null : cardIndex;
      render(root, state);
    });
  });
}

function renderStoryCard(card) {
  return `
    <article class="story-card">
      <p class="card-label">${escapeHtml(card.label)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </article>
  `;
}

function renderProofCard(card, index, expandedCard) {
  const expanded = expandedCard === index;
  return `
    <article class="proof-card">
      <div class="proof-head"><h3>${escapeHtml(card.title)}</h3><span>${escapeHtml(card.status)}</span></div>
      <p>${escapeHtml(card.summary)}</p>
      <button data-action="toggle-json" data-index="${index}">${expanded ? 'Hide JSON' : 'Show JSON'}</button>
      ${expanded ? `<pre>${escapeHtml(JSON.stringify(card.json, null, 2))}</pre>` : ''}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

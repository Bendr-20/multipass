import { getApiBaseFromLocation, loadMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
import { createAgentCarousel, createClaritySections, createFragmentTrustMap, createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY, V01_COPY } from './content.js';

export function createApp({ root, loadDemo = defaultLoadDemo }) {
  if (!root) throw new Error('createApp requires a root element');

  let state = { expandedCard: null, selectedAgentCard: 0 };

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
  const claritySections = createClaritySections(data);
  const agentCarousel = createAgentCarousel(data);
  const selectedAgent = agentCarousel.cards[state.selectedAgentCard] ?? agentCarousel.cards[0];
  const fragmentTrustMap = createFragmentTrustMap(data);
  const proofCards = createProofCards(data);
  root.innerHTML = `
    <div class="record-shell">
      <header class="record-header">
        <div class="brand"><div class="mark" aria-hidden="true"></div><span>Multipass</span></div>
        <div class="header-meta"><span>Hidden Prototype</span><span>${escapeHtml(data.modeLabel ?? 'Local API Demo')}</span></div>
      </header>

      <section class="hero-record">
        <div>
          <p class="eyebrow">${HERO_COPY.eyebrow}</p>
          <div class="prototype-ribbon">
            <span>${escapeHtml(V01_COPY.prototypeLabel)}</span>
            <span>${escapeHtml(V01_COPY.audience)}</span>
          </div>
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

      ${renderAgentCarousel(agentCarousel, selectedAgent, state.selectedAgentCard)}

      <section class="story-records">${storyCards.map(renderStoryCard).join('')}</section>

      <section class="clarity-grid">${claritySections.map(renderClarityCard).join('')}</section>

      ${renderFragmentTrustMap(fragmentTrustMap)}

      <section class="proof-ledger">
        <div class="ledger-title"><h2>Proof ledger</h2><span>Expandable API records</span></div>
        ${proofCards.map((card, index) => renderProofRow(card, index, state.expandedCard)).join('')}
      </section>

      <footer class="footer-note">This is a static public demo. It does not include auth, persistence, contract reads, or payment settlement.</footer>
    </div>
  `;

  root.querySelectorAll('[data-action="select-agent-card"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedAgentCard = Number(button.dataset.index);
      render(root, state);
      root.querySelector(`[data-action="select-agent-card"][data-index="${state.selectedAgentCard}"]`)?.focus();
    });
  });

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


function renderAgentCarousel(carousel, selectedAgent, selectedIndex) {
  return `
    <section class="card-carousel">
      <div class="card-carousel-head">
        <p class="eyebrow">${escapeHtml(carousel.eyebrow)}</p>
        <h2>${escapeHtml(carousel.title)}</h2>
        <p>${escapeHtml(carousel.body)}</p>
      </div>
      <div class="card-track" role="tablist" aria-label="Agent cards">
        ${carousel.cards.map((card, index) => renderAgentCardButton(card, index, selectedIndex)).join('')}
      </div>
      ${renderAgentCardDetail(selectedAgent)}
    </section>
  `;
}

function renderAgentCardButton(card, index, selectedIndex) {
  const selected = index === selectedIndex;
  return `
    <button class="card-button${selected ? ' selected' : ''}" data-action="select-agent-card" data-index="${index}" type="button" aria-selected="${selected}">
      <span class="card-name">${escapeHtml(card.name)}</span>
      <span>${escapeHtml(card.helixaId)}</span>
      <span>${escapeHtml(card.subjectLabel)} · ${escapeHtml(card.memberLabel)}</span>
      <span>${escapeHtml(card.role)}</span>
      <span>${escapeHtml(card.custody)}</span>
      <strong>${escapeHtml(card.credLabel)}</strong>
    </button>
  `;
}

function renderAgentCardDetail(card) {
  return `
    <article class="card-detail">
      <div>
        <p class="card-label">Selected agent card</p>
        <h3>${escapeHtml(card.name)}</h3>
        <p>Machine-readable identity card for routing, trust checks, roster context, and profile discovery.</p>
      </div>
      <div class="card-fields">
        ${renderField('Helixa ID', card.helixaId)}
        ${renderField('Framework', card.framework)}
        ${renderField('Cred', card.credScore === null ? card.credLabel : `${card.credLabel} (${card.credTier})`)}
        ${renderField('Identity', card.verifiedLabel)}
        ${renderField('Subject', card.subjectLabel)}
        ${renderField('Roster', card.memberLabel)}
        ${renderField('Role', card.role)}
        ${renderField('Custody', card.custody)}
        ${renderField('Profile', card.profileUrl ?? 'Not linked')}
      </div>
    </article>
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

function renderClarityCard(section) {
  return `
    <article class="clarity-card">
      <h3>${escapeHtml(section.title)}</h3>
      <p>${escapeHtml(section.body)}</p>
    </article>
  `;
}

function renderFragmentTrustMap(map) {
  return `
    <section class="fragment-map">
      <div class="fragment-map-head">
        <p class="eyebrow">${escapeHtml(map.eyebrow)}</p>
        <h2>${escapeHtml(map.title)}</h2>
        <p>${escapeHtml(map.body)}</p>
      </div>
      <div class="fragment-cards">
        ${map.cards.map(renderFragmentCard).join('')}
      </div>
      <div class="fragment-legend">
        ${renderLegendGroup('Fragment type legend', map.legends.fragmentType)}
        ${renderLegendGroup('Status legend', map.legends.status)}
        ${renderLegendGroup('Visibility legend', map.legends.visibility)}
        ${renderLegendGroup('Assurance legend', map.legends.assurance)}
        ${renderLegendGroup('Transfer policy', map.legends.transferPolicy)}
      </div>
      <p class="fragment-note">${escapeHtml(map.emptyPrivateNote)}</p>
    </section>
  `;
}

function renderFragmentCard(card) {
  return `
    <article class="fragment-card">
      <div class="fragment-card-top">
        <span class="fragment-type">${escapeHtml(card.typeLabel)}</span>
        <span class="fragment-status status-${escapeHtml(card.status)}">${escapeHtml(card.status)}</span>
      </div>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.summary)}</p>
      <dl>
        <div><dt>Assurance</dt><dd>${escapeHtml(card.assuranceLabel)}</dd></div>
        <div><dt>Visibility</dt><dd>${escapeHtml(card.visibility)}</dd></div>
        <div><dt>Transfer</dt><dd>${escapeHtml(card.transferPolicyLabel)}</dd></div>
      </dl>
      <p class="fragment-value">${escapeHtml(card.publicValue)}</p>
    </article>
  `;
}

function renderLegendGroup(title, entries) {
  return `
    <article>
      <h3>${escapeHtml(title)}</h3>
      ${Object.entries(entries).map(([key, value]) => `
        <div class="legend-row">
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(value)}</span>
        </div>
      `).join('')}
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
        <div class="summary">
          <span>${escapeHtml(card.summary)}</span>
          <span class="why">${escapeHtml(card.why)}</span>
        </div>
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

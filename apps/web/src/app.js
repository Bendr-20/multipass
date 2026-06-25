import { getApiBaseFromLocation, loadMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
import { HelixaResolverError, loadLiveHelixaMultipass } from './live-helixa-resolver.js';
import { createAgentCarousel, createClaritySections, createFragmentTrustMap, createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY, V01_COPY } from './content.js';

export function createApp({ root, loadDemo = defaultLoadDemo, loadLiveDemo = loadLiveHelixaMultipass }) {
  if (!root) throw new Error('createApp requires a root element');

  let state = {
    expandedCard: null,
    selectedAgentCard: 0,
    resolverInput: '',
    resolverStatus: null,
    resolverError: null,
    resolverRequestId: 0,
    resolverInFlightInput: null,
    retryUntil: 0,
    retryMessage: null,
    lookupMatches: [],
  };

  async function start() {
    renderLoading(root);
    try {
      const data = await loadDemo();
      state = { ...state, data, staticData: data };
      render(root, state, handlers);
      const resolverInput = getInitialResolverInput();
      if (resolverInput !== null) {
        resolveLiveAgent(resolverInput);
      }
    } catch (error) {
      renderError(root, error);
    }
  }

  async function resolveLiveAgent(input) {
    const trimmed = String(input ?? '').trim();
    state = {
      ...state,
      resolverInput: input,
      resolverStatus: 'loading',
      resolverError: null,
      retryMessage: null,
      resolverInFlightInput: trimmed,
      resolverRequestId: state.resolverRequestId + 1,
      lookupMatches: [],
    };
    const requestId = state.resolverRequestId;
    render(root, state, handlers);

    try {
      const liveData = await loadLiveDemo(trimmed);
      if (requestId !== state.resolverRequestId) return;
      state = {
        ...state,
        data: liveData,
        resolverStatus: 'loaded',
        resolverError: null,
        retryUntil: 0,
        retryMessage: null,
        selectedAgentCard: 0,
        expandedCard: null,
        resolverInFlightInput: null,
        lookupMatches: [],
      };
      syncShareUrl(liveData?.liveProfilePage?.sharePath);
      render(root, state, handlers);
    } catch (error) {
      if (requestId !== state.resolverRequestId) return;
      const retryState = retryStateFromError(error);
      state = {
        ...state,
        resolverStatus: 'error',
        resolverError: userResolverMessage(error),
        resolverInFlightInput: null,
        retryUntil: retryState.retryUntil,
        retryMessage: retryState.retryMessage,
        lookupMatches: lookupMatchesFromError(error),
      };
      render(root, state, handlers);
    }
  }

  function resetStaticDemo() {
    state = {
      ...state,
      data: state.staticData,
      selectedAgentCard: 0,
      expandedCard: null,
      resolverInput: '',
      resolverStatus: null,
      resolverError: null,
      resolverInFlightInput: null,
      resolverRequestId: state.resolverRequestId + 1,
      retryUntil: 0,
      retryMessage: null,
      lookupMatches: [],
    };
    clearShareUrl();
    render(root, state, handlers);
  }

  const handlers = { resolveLiveAgent, resetStaticDemo };

  return { start };
}

function getInitialResolverInput() {
  if (typeof window === 'undefined') return null;
  const locationUrl = new URL(window.location.href);
  if (!locationUrl.searchParams.has('agent')) return null;
  return locationUrl.searchParams.get('agent') ?? '';
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

function createHeroCopy(data) {
  const live = data.liveProfilePage ?? {};
  return {
    eyebrow: live.eyebrow ?? HERO_COPY.eyebrow,
    prototypeLabel: live.prototypeLabel ?? V01_COPY.prototypeLabel,
    audience: live.audience ?? V01_COPY.audience,
    headline: live.headline ?? HERO_COPY.headline,
    body: live.body ?? HERO_COPY.body,
    note: live.note ?? data.heroNote ?? HERO_COPY.note,
  };
}

function renderShareLink(sharePath) {
  if (!isSafeSharePath(sharePath)) return '';
  return ` <a class="share-link" href="${escapeAttribute(sharePath)}">${escapeHtml(sharePath)}</a>`;
}

function isSafeSharePath(sharePath) {
  if (!sharePath) return false;
  try {
    const parsed = new URL(String(sharePath), 'https://helixa.xyz');
    return parsed.origin === 'https://helixa.xyz' && parsed.pathname === '/multipass/' && /^\d+$/.test(parsed.searchParams.get('agent') ?? '');
  } catch {
    return false;
  }
}

function syncShareUrl(sharePath) {
  if (typeof window === 'undefined' || !isSafeSharePath(sharePath)) return;
  window.history.replaceState(null, '', sharePath);
}

function clearShareUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('agent');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function render(root, state, handlers = {}) {
  const { data } = state;
  const heroCopy = createHeroCopy(data);
  const storyCards = createStoryCards(data);
  const claritySections = createClaritySections(data);
  const agentCarousel = createAgentCarousel(data);
  const selectedAgent = agentCarousel.cards[state.selectedAgentCard] ?? agentCarousel.cards[0];
  const fragmentTrustMap = createFragmentTrustMap(data, selectedAgent);
  const proofCards = createProofCards(data, selectedAgent);
  root.innerHTML = `
    <div class="record-shell">
      <header class="record-header">
        <div class="brand"><div class="mark" aria-hidden="true"></div><span>Multipass</span></div>
        <div class="header-meta"><span>Hidden Prototype</span><span>${escapeHtml(data.liveProfilePage?.headerMeta ?? data.modeLabel ?? 'Local API Demo')}</span></div>
      </header>

      <section class="hero-record">
        <div>
          <p class="eyebrow">${escapeHtml(heroCopy.eyebrow)}</p>
          <div class="prototype-ribbon">
            <span>${escapeHtml(heroCopy.prototypeLabel)}</span>
            <span>${escapeHtml(heroCopy.audience)}</span>
          </div>
          <h1>${escapeHtml(heroCopy.headline)}</h1>
          <p class="lead">${escapeHtml(heroCopy.body)}</p>
          <div class="note">${escapeHtml(heroCopy.note)}${renderShareLink(data.liveProfilePage?.sharePath)}</div>
        </div>

        <article class="record-sheet">
          <div class="sheet-top">
            <div>
              <h2>${escapeHtml(data.profile.display_name)}</h2>
              <p>${escapeHtml(data.liveProfilePage?.recordIntro ?? 'Agent profile with public identity fragments, standards references, x402 route metadata, and receipt evidence.')}</p>
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

      ${renderLiveResolver(state)}

      ${renderAgentAura(data.visualIdentity)}

      ${renderAgentAuraProvenanceDrawer(data.visualIdentity?.provenanceDrawer)}

      ${renderMarketplaceListing(data.marketplaceListing)}

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
      render(root, state, handlers);
      root.querySelector(`[data-action="select-agent-card"][data-index="${state.selectedAgentCard}"]`)?.focus();
    });
  });

  root.querySelectorAll('[data-action="toggle-json"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cardIndex = Number(button.dataset.index);
      state.expandedCard = state.expandedCard === cardIndex ? null : cardIndex;
      render(root, state, handlers);
      root.querySelector(`[data-action="toggle-json"][data-index="${cardIndex}"]`)?.focus();
    });
  });

  root.querySelector('[data-action="resolve-live-agent"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector('input[name="agent"]')?.value ?? '';
    if (isRetryBlocked(state)) return;
    if (state.resolverStatus === 'loading' && input.trim() === state.resolverInFlightInput) return;
    handlers.resolveLiveAgent?.(input);
  });

  root.querySelector('[data-action="reset-static-demo"]')?.addEventListener('click', () => handlers.resetStaticDemo?.());
  root.querySelectorAll('[data-action="resolve-example-agent"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.getAttribute('data-agent') ?? ''));
  });
  root.querySelectorAll('[data-action="select-lookup-match"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.dataset.tokenId ?? ''));
  });
}


function renderLiveResolver(state) {
  return `
    <section class="live-resolver" aria-label="Resolve live Helixa agent">
      <form data-action="resolve-live-agent">
        <div>
          <p class="card-label">Resolve live Helixa agent</p>
          <h2>Read a live AgentDNA record.</h2>
          <p>Try <code>1</code>, <code>8453:1</code>, <code>Bendr 2.0</code>, or <code>Quigbot</code>.</p>
        </div>
        <label>
          <span>Helixa ID, name, or handle</span>
          <input name="agent" value="${escapeAttribute(state.resolverInput ?? '')}" placeholder="81, 8453:81, or Quigbot" autocomplete="off" />
        </label>
        <button type="submit" ${isRetryBlocked(state) ? 'disabled' : ''}>${state.resolverStatus === 'loading' ? 'Resolving...' : 'Resolve'}</button>
        <button type="button" data-action="reset-static-demo">Static demo</button>
      </form>
      ${state.resolverError ? `<p class="resolver-message error">${escapeHtml(state.resolverError)}</p>` : ''}
      ${state.retryMessage ? `<p class="resolver-message error">${escapeHtml(state.retryMessage)}</p>` : ''}
      ${renderResolverExamples()}
      ${renderLookupMatches(state.lookupMatches)}
      ${state.resolverStatus === 'loaded' ? '<p class="resolver-message">Live Helixa API data loaded. Display only, no approvals or authority changes.</p>' : ''}
    </section>
  `;
}

function renderResolverExamples() {
  const examples = ['Bendr', 'Quigbot', '81'];
  return `
    <div class="resolver-examples" aria-label="Example Helixa lookups">
      <span>Examples</span>
      ${examples.map((example) => `<button type="button" data-action="resolve-example-agent" data-agent="${escapeAttribute(example)}">${escapeHtml(example)}</button>`).join('')}
    </div>
  `;
}

function renderLookupMatches(matches = []) {
  if (!matches.length) return '';
  return `
    <div class="lookup-matches" aria-label="Matching Helixa agents">
      ${matches.map((match) => `
        <button class="lookup-match-card" type="button" data-action="select-lookup-match" data-token-id="${escapeAttribute(match.tokenId)}">
          <strong>${escapeHtml(match.name)}</strong>
          <span>${escapeHtml(match.helixaId)} · ${escapeHtml(match.framework ?? 'unknown')} · ${match.credScore === null || match.credScore === undefined ? 'Cred pending' : `Cred ${escapeHtml(match.credScore)}`}</span>
          <em>${match.verified ? 'Verified' : 'Unverified'}</em>
        </button>
      `).join('')}
    </div>
  `;
}

function isRetryBlocked(state) {
  return state.retryUntil > Date.now();
}

function lookupMatchesFromError(error) {
  if (!(error instanceof HelixaResolverError) || error.code !== 'ambiguous_lookup') return [];
  return Array.isArray(error.details?.matches) ? error.details.matches : [];
}

function userResolverMessage(error) {
  if (error instanceof HelixaResolverError) return error.message;
  return 'Could not reach the Helixa API. Static demo is still available.';
}

export function retryStateFromError(error, nowMs = Date.now()) {
  if (!(error instanceof HelixaResolverError) || error.code !== 'rate_limited') return { retryUntil: 0, retryMessage: null };
  const seconds = Number(error.details?.retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0) return { retryUntil: 0, retryMessage: null };
  return { retryUntil: nowMs + seconds * 1000, retryMessage: `Try again in ${seconds} seconds.` };
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



function safeHttpsUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function renderAgentAura(visualIdentity) {
  if (!visualIdentity || !['helixa_aura', 'aura'].includes(visualIdentity.source)) return '';
  const safeImageUrl = safeHttpsUrl(visualIdentity.imageUrl);
  const label = visualIdentity.label ?? 'Helixa Agent Aura';
  return `
    <section class="aura-card" data-visual-source="${escapeAttribute(visualIdentity.source)}" aria-label="Agent Aura marketplace visual">
      <div class="aura-asset-frame">
        <div class="aura-orb tone-${escapeAttribute(visualIdentity.tone ?? 'pending')}">
          ${safeImageUrl ? `<img src="${escapeAttribute(safeImageUrl)}" alt="${escapeAttribute(label)}" loading="lazy" />` : ''}
          <span>${escapeHtml(visualIdentity.initials ?? 'MP')}</span>
        </div>
      </div>
      <div class="aura-item-meta">
        <p class="card-label">Visual</p>
        <h2>${escapeHtml(label)}</h2>
        <div class="aura-chips" aria-label="Agent Aura traits">
          ${(visualIdentity.chips ?? []).map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderAgentAuraProvenanceDrawer(drawer) {
  if (!drawer) return '';
  const facts = (drawer.facts ?? []).filter((fact) => hasRenderableValue(fact?.label) && hasRenderableValue(fact?.value));
  const links = (drawer.links ?? []).filter((link) => hasRenderableValue(link?.label) && isRenderablePublicUrl(link?.url));
  return `
    <section class="aura-provenance-drawer" aria-labelledby="aura-provenance-title">
      <div class="aura-provenance-copy">
        <p class="card-label">Public provenance</p>
        <h2 id="aura-provenance-title">${escapeHtml(drawer.title ?? 'Agent Aura Provenance')}</h2>
        <p>${escapeHtml(drawer.summary ?? 'Public source data for this AgentDNA visual.')}</p>
      </div>
      <div class="aura-provenance-body">
        ${facts.length ? `<div class="aura-provenance-grid">${facts.map(renderProvenanceFact).join('')}</div>` : ''}
        ${links.length ? `<div class="aura-provenance-links" aria-label="Agent Aura provenance links">${links.map((link) => renderSafeLink(link.label, link.url)).join('')}</div>` : ''}
        ${hasRenderableValue(drawer.safetyNote) ? `<p class="aura-provenance-note">${escapeHtml(drawer.safetyNote)}</p>` : ''}
      </div>
    </section>
  `;
}

function renderProvenanceFact(fact) {
  return `
    <article class="aura-provenance-fact">
      <span>${escapeHtml(fact.label)}</span>
      <strong>${escapeHtml(fact.value)}</strong>
    </article>
  `;
}

function hasRenderableValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
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
      ${renderOwnerCustodySnapshot(selectedAgent.ownerSnapshot)}
      ${renderChangeReviewLedger(selectedAgent.changeReviewLedger)}
      ${renderTransferPreview(selectedAgent)}
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
  if (card.detailMode === 'swarm') return renderSwarmCardDetail(card);

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


function renderSwarmCardDetail(card) {
  return `
    <article class="card-detail swarm-detail">
      <div>
        <p class="card-label">Swarm detail</p>
        <h3>${escapeHtml(card.name)}</h3>
        <p>Parent Multipass for a collection of agents with shared routes, custody context, and proof that still preserves each member profile.</p>
      </div>
      <div class="swarm-panels">
        <section class="swarm-panel">
          <h4>Roster</h4>
          ${card.roster.map((member) => `
            <div class="swarm-row">
              <strong>${escapeHtml(member.name)}</strong>
              <span>${escapeHtml(member.role)}</span>
            </div>
          `).join('')}
        </section>
        <section class="swarm-panel">
          <h4>Policy references</h4>
          ${card.sharedControls.map((control) => `<span class="control-chip">${escapeHtml(control)}</span>`).join('')}
        </section>
        <section class="swarm-panel wide">
          <h4>Aggregate Cred</h4>
          <p>${escapeHtml(card.aggregateCred ?? `${card.credLabel} (${card.credTier}) gives context only; member scores remain separate.`)}</p>
        </section>
        <section class="swarm-panel wide">
          <h4>Transfer behavior</h4>
          <p>${escapeHtml(card.transferBehavior ?? 'Permissions pause and active routes reverify when custody changes.')}</p>
        </section>
        <section class="swarm-panel wide">
          <h4>Summary</h4>
          <div class="card-fields swarm-fields">
            ${renderField('Helixa ID', card.helixaId)}
            ${renderField('Roster', card.memberLabel)}
            ${renderField('Role', card.role)}
            ${renderField('Custody', card.custody)}
          </div>
        </section>
      </div>
    </article>
  `;
}


function renderOwnerCustodySnapshot(snapshot) {
  if (!snapshot) return '';
  return `
    <section class="owner-snapshot">
      <div class="owner-snapshot-copy">
        <p class="card-label">${escapeHtml(snapshot.title)}</p>
        <h3>${escapeHtml(snapshot.permissionState)}</h3>
        <p>${escapeHtml(snapshot.note)}</p>
      </div>
      <div class="owner-snapshot-grid">
        ${renderSnapshotField('Owner', snapshot.owner)}
        ${renderSnapshotField('Operator', snapshot.operator)}
        ${renderSnapshotField('Custody epoch', snapshot.custodyEpoch)}
        ${renderSnapshotField('Visibility', snapshot.visibility)}
        ${renderSnapshotField('Recent change', snapshot.recentChange)}
        ${renderSnapshotField('Review action', snapshot.reviewAction)}
      </div>
    </section>
  `;
}

function renderSnapshotField(label, value) {
  return `
    <article class="owner-snapshot-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderChangeReviewLedger(ledger) {
  if (!ledger) return '';
  return `
    <section class="change-review-ledger">
      <div class="change-review-head">
        <p class="card-label">${escapeHtml(ledger.eyebrow)}</p>
        <h3>${escapeHtml(ledger.title)}</h3>
        <p>${escapeHtml(ledger.note)}</p>
      </div>
      <div class="change-review-rows">
        ${ledger.rows.map(renderChangeReviewRow).join('')}
      </div>
    </section>
  `;
}

function renderChangeReviewRow(row) {
  return `
    <article class="change-review-row tone-${escapeHtml(row.tone)}">
      <div>
        <span>Change</span>
        <strong>${escapeHtml(row.event)}</strong>
      </div>
      <div>
        <span>Source</span>
        <strong>${escapeHtml(row.source)}</strong>
      </div>
      <div>
        <span>Impact</span>
        <strong>${escapeHtml(row.impact)}</strong>
      </div>
      <div>
        <span>Review</span>
        <strong>${escapeHtml(row.reviewState)}</strong>
      </div>
    </article>
  `;
}


function renderTransferPreview(card) {

  if (!card.transferPreview) return '';
  const preview = card.transferPreview;
  return `
    <section class="transfer-preview">
      <div class="transfer-copy">
        <p class="card-label">${escapeHtml(preview.title)}</p>
        <h3>${escapeHtml(preview.claimAction)}</h3>
        <p>${escapeHtml(preview.note)}</p>
      </div>
      <div class="transfer-steps">
        ${renderTransferStep('Current owner', preview.currentOwner)}
        ${renderTransferStep('Custody epoch', preview.custodyEpoch)}
        ${renderTransferStep('Permissions', preview.permissionsState)}
        ${renderTransferStep('Tools', preview.toolAction)}
        ${renderTransferStep('Private access', preview.privateAccessAction)}
        ${renderTransferStep('History', preview.historyState)}
        ${renderTransferStep('Cred', preview.credContinuity)}
      </div>
    </section>
  `;
}

function renderTransferStep(label, value) {
  return `
    <article class="transfer-step">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderMarketplaceListing(listing) {
  if (!listing) return '';
  return `
    <section class="marketplace-listing" aria-label="Marketplace listing preview">
      <div class="listing-shell">
        <div class="listing-copy">
          <p class="card-label">Marketplace listing preview</p>
          <h2>${escapeHtml(listing.title ?? 'Agent listing')}</h2>
          <p>${escapeHtml(listing.summary ?? 'Public AgentDNA profile prepared for read-only marketplace discovery.')}</p>
          ${listing.subtitle ? `<span class="listing-subtitle">${escapeHtml(listing.subtitle)}</span>` : ''}
        </div>
        <div class="listing-score">
          <span>${escapeHtml(listing.score?.tier ?? 'Unrated')}</span>
          <strong>${escapeHtml(listing.score?.label ?? 'Cred pending')}</strong>
        </div>
      </div>
      <div class="listing-badges">${(listing.badges ?? []).map(renderListingBadge).join('')}</div>
      <section class="listing-identity">
        ${renderListingFact({ label: 'Helixa ID', value: listing.identity?.helixaId ?? 'Not published' })}
        ${renderListingFact({ label: 'Framework', value: listing.identity?.framework ?? 'unknown' })}
        ${renderListingFact({ label: 'Identity', value: listing.identity?.verifiedLabel ?? 'Unverified AgentDNA' })}
        ${renderListingFact({ label: 'Source', value: listing.identity?.sourceLabel ?? 'Live Helixa API' })}
        ${(listing.facts ?? []).map(renderListingFact).join('')}
      </section>
      <section class="listing-sections">
        <article class="listing-section">
          <h3>Public routes</h3>
          ${renderListingRoutes(listing.routes)}
        </article>
        <article class="listing-section">
          <h3>Payment references</h3>
          ${renderListingPayments(listing.paymentReferences)}
        </article>
      </section>
      ${renderListingProofStrip(listing.proof)}
      ${renderListingLinks(listing.links)}
      <p class="listing-safety">${escapeHtml(listing.safetyNote ?? 'Display only. No authority changes are available from this listing.')}</p>
    </section>
  `;
}

function renderListingBadge(badge) {
  return `<span class="listing-badge tone-${escapeAttribute(badge?.tone ?? 'neutral')}">${escapeHtml(badge?.label ?? '')}</span>`;
}

function renderListingFact(fact) {
  return `
    <article class="listing-fact">
      <span>${escapeHtml(fact?.label ?? '')}</span>
      <strong>${escapeHtml(fact?.value ?? 'Not published')}</strong>
    </article>
  `;
}

function renderListingRoutes(routes = []) {
  if (!routes.length) {
    return '<div class="listing-routes"><article><span>Routes</span><strong>No public service routes published</strong></article></div>';
  }
  return `<div class="listing-routes">${routes.map((route) => `
    <article>
      <span>${escapeHtml(route?.label ?? 'Route')}</span>
      <strong>${renderSafeLink(route?.value ?? '', route?.url)}</strong>
    </article>
  `).join('')}</div>`;
}

function renderListingPayments(payments = []) {
  if (!payments.length) return '<div class="listing-payments"><span class="listing-payment">No public payment references published</span></div>';
  return `<div class="listing-payments">${payments.map((payment) => `<span class="listing-payment">${escapeHtml(payment?.value ?? '')}${payment?.source ? ` · ${escapeHtml(payment.source)}` : ''}</span>`).join('')}</div>`;
}

function renderListingProofStrip(proof) {
  if (!proof) return '';
  return `<section class="listing-proof-strip">
    ${renderListingFact({ label: 'Public proof', value: `${proof.publicFragmentCount ?? 0} fragments` })}
    ${renderListingFact({ label: 'Verified signals', value: proof.verifiedSignalCount ?? 0 })}
    ${renderListingFact({ label: 'Review queue', value: proof.reviewRequiredCount ?? 0 })}
    ${renderListingFact({ label: 'Private access', value: proof.privateCredentialState ?? 'No secrets or private credentials exposed' })}
  </section>`;
}

function renderListingLinks(links = []) {
  if (!links.length) return '';
  return `<div class="listing-links">${links.map((link) => `<span class="listing-link">${renderSafeLink(link?.label ?? 'Link', link?.url)}</span>`).join('')}</div>`;
}

function renderSafeLink(label, url) {
  if (!isRenderablePublicUrl(url)) return `<span>${escapeHtml(label)}</span>`;
  return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function isRenderablePublicUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(String(url));
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
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
      <details class="fragment-legend">
        <summary>Proof vocabulary</summary>
        ${renderLegendGroup('Fragment type legend', map.legends.fragmentType)}
        ${renderLegendGroup('Status legend', map.legends.status)}
        ${renderLegendGroup('Visibility legend', map.legends.visibility)}
        ${renderLegendGroup('Assurance legend', map.legends.assurance)}
        ${renderLegendGroup('Transfer policy', map.legends.transferPolicy)}
      </details>
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

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

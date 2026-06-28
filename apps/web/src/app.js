import { getActivationState } from './activation.js';
import { getApiBaseFromLocation, getSavedSlugFromLocation, getWritableApiBaseFromLocation, loadMultipassDemo, loadSavedMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
import { HelixaResolverError, loadLiveHelixaMultipass } from './live-helixa-resolver.js';
import { createClaimNonce, createMultipassFragment, logoutMultipassSession, revokeMultipassFragment, saveActivatedMultipass, submitManualReviewClaim, updateMultipassFragment, updateMultipassProfile, verifyClaimSignature } from './saved-multipass-api.js';
import { bindFragmentManager, compactFragmentInput, compactFragmentPatch, mergeFragmentMutationState, renderFragmentManagerPanel } from './fragment-manager.js';
import { createInjectedWalletClient, createLegacyWalletClient, getWalletErrorMessage } from './wallet-client.js';
import { getAbsoluteShareUrl, getSafeMultipassSharePath, isSafeMultipassSharePath, renderSavePanel } from './save-panel.js';
import { createAgentCarousel, createClaritySections, createFragmentTrustMap, createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY, V01_COPY } from './content.js';

export function createApp({ root, loadDemo, loadLiveDemo = loadLiveHelixaMultipass, saveMultipass = defaultSaveMultipass, claimApi = defaultClaimApi, walletClient, walletSigner, fetchImpl } = {}) {
  if (!root) throw new Error('createApp requires a root element');

  const activeWalletClient = walletClient ?? (walletSigner ? createLegacyWalletClient(walletSigner) : createInjectedWalletClient());

  let state = {
    pageKind: getInitialPageKind(),
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
    saveStatus: null,
    saveError: null,
    savedSharePath: null,
    savedProfile: null,
    claimStatus: null,
    claimError: null,
    claimCsrfToken: null,
    claimSessionStatus: null,
    walletSnapshot: activeWalletClient.getSnapshot(),
  };
  const loadInitialDemo = loadDemo ?? (() => defaultLoadDemo({ fetchImpl }));

  async function start() {
    activeWalletClient.subscribe?.(() => {
      state = { ...state, walletSnapshot: activeWalletClient.getSnapshot() };
      if (state.data) render(root, state, handlers);
    });
    renderLoading(root);
    try {
      const data = await loadInitialDemo();
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
      pageKind: 'profile',
      resolverInput: input,
      resolverStatus: 'loading',
      resolverError: null,
      retryMessage: null,
      resolverInFlightInput: trimmed,
      resolverRequestId: state.resolverRequestId + 1,
      lookupMatches: [],
      saveStatus: null,
      saveError: null,
      savedSharePath: null,
      savedProfile: null,
      claimStatus: null,
      claimError: null,
      claimCsrfToken: null,
      claimSessionStatus: null,
    };
    const requestId = state.resolverRequestId;
    render(root, state, handlers);

    try {
      const liveData = await loadLiveDemo(trimmed);
      if (requestId !== state.resolverRequestId) return;
      state = {
        ...state,
        pageKind: 'profile',
        data: liveData,
        resolverStatus: 'loaded',
        resolverError: null,
        retryUntil: 0,
        retryMessage: null,
        selectedAgentCard: 0,
        expandedCard: null,
        resolverInFlightInput: null,
        lookupMatches: [],
        saveStatus: null,
        saveError: null,
        savedSharePath: null,
        savedProfile: null,
      };
      syncShareUrl(liveData?.liveProfilePage?.sharePath);
      render(root, state, handlers);
    } catch (error) {
      if (requestId !== state.resolverRequestId) return;
      const retryState = retryStateFromError(error);
      state = {
        ...state,
        data: state.staticData ?? state.data,
        selectedAgentCard: 0,
        expandedCard: null,
        resolverStatus: 'error',
        resolverError: userResolverMessage(error),
        resolverInFlightInput: null,
        retryUntil: retryState.retryUntil,
        retryMessage: retryState.retryMessage,
        lookupMatches: lookupMatchesFromError(error),
        saveStatus: null,
        saveError: null,
        savedSharePath: null,
        savedProfile: null,
      };
      clearShareUrl();
      render(root, state, handlers);
    }
  }

  function resetStaticDemo() {
    state = {
      ...state,
      pageKind: getInitialPageKind(),
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
      saveStatus: null,
      saveError: null,
      savedSharePath: null,
      savedProfile: null,
      claimStatus: null,
      claimError: null,
      claimCsrfToken: null,
      claimSessionStatus: null,
    };
    clearShareUrl();
    render(root, state, handlers);
  }

  async function saveCurrentMultipass() {
    if (state.resolverStatus !== 'loaded') return;
    const agent = state.data?.resolver?.tokenId;
    if (!agent) {
      state = { ...state, saveStatus: 'error', saveError: 'Resolved token ID is required before saving.' };
      render(root, state, handlers);
      return;
    }
    state = { ...state, saveStatus: 'saving', saveError: null };
    render(root, state, handlers);
    try {
      const saved = await saveMultipass({ agent, fetchImpl });
      state = {
        ...state,
        saveStatus: 'saved',
        saveError: null,
        savedSharePath: saved.sharePath,
        savedProfile: saved.profile,
        data: {
          ...state.data,
          liveProfilePage: {
            ...state.data.liveProfilePage,
            sharePath: saved.sharePath,
            headerMeta: `Saved Multipass · ${saved.profile?.slug ?? 'persistent profile'}`,
          },
        },
      };
      syncShareUrl(saved.sharePath);
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, saveStatus: 'error', saveError: error.message };
      render(root, state, handlers);
    }
  }

  async function claimWithWallet() {
    const id = getManageIdentifier(state);
    if (!id) return;
    state = { ...state, claimStatus: 'signing', claimError: null };
    render(root, state, handlers);

    try {
      let walletSnapshot = activeWalletClient.getSnapshot();
      state = { ...state, walletSnapshot };
      if (walletSnapshot.configured === false) throw new Error('Wallet login is not configured for this build.');
      if (walletSnapshot.ready === false) throw new Error('Wallet options are still loading.');
      if (!walletSnapshot.connected) {
        await activeWalletClient.connect();
        walletSnapshot = activeWalletClient.getSnapshot();
        state = { ...state, walletSnapshot };
      }
      if (!walletSnapshot.connected) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
    } catch (error) {
      renderClaimFailure(getWalletErrorMessage(error));
      return;
    }

    const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
    let nonce;
    try {
      nonce = await claimApi.createClaimNonce({ id, apiBase, fetchImpl });
    } catch (error) {
      renderClaimFailure(getClaimApiErrorMessage(error));
      return;
    }

    let signed;
    try {
      signed = await activeWalletClient.signMessage(nonce.message);
    } catch (error) {
      renderClaimFailure(getWalletErrorMessage(error));
      return;
    }

    try {
      const verified = await claimApi.verifyClaimSignature({
        id,
        apiBase,
        wallet: signed.wallet,
        nonce: nonce.nonce,
        signature: signed.signature,
        fetchImpl,
      });
      state = mergeClaimProfileState(state, verified, {
        claimStatus: verified.claim_status ?? 'claimed',
        claimCsrfToken: verified.csrfToken ?? null,
        claimError: null,
        claimSessionStatus: 'active',
      });
      render(root, state, handlers);
    } catch (error) {
      renderClaimFailure(getClaimApiErrorMessage(error));
    }
  }

  function renderClaimFailure(claimError) {
    state = { ...state, claimStatus: 'error', claimError };
    render(root, state, handlers);
  }

  async function submitManualReview(event) {
    const id = getManageIdentifier(state);
    if (!id) return;
    const form = event?.currentTarget;
    const formData = createFormData(form);
    state = { ...state, claimStatus: 'submitting_review', claimError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await claimApi.submitManualReviewClaim({
        id,
        apiBase,
        proposedManagerWallet: formData.get('proposedManagerWallet'),
        contactRoute: formData.get('contactRoute'),
        note: formData.get('note'),
        fetchImpl,
      });
      state = mergeClaimProfileState(state, result, {
        claimStatus: result.claim_status ?? 'claim_pending',
        claimError: null,
      });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, claimStatus: 'error', claimError: error.message };
      render(root, state, handlers);
    }
  }

  async function updatePublicProfile(event) {
    const id = getManageIdentifier(state);
    if (!id || !state.claimCsrfToken) return;
    const form = event?.currentTarget;
    const formData = createFormData(form);
    const patch = compactProfilePatch({
      display_name: formData.get('display_name'),
      summary: formData.get('summary'),
      avatar_url: formData.get('avatar_url'),
      tags: formData.get('tags'),
    });
    state = { ...state, claimStatus: 'updating_profile', claimError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const updated = await claimApi.updateMultipassProfile({ id, apiBase, csrfToken: state.claimCsrfToken, patch, fetchImpl });
      state = mergeClaimProfileState(state, updated, {
        claimStatus: 'profile_updated',
        claimError: null,
      });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, claimStatus: 'error', claimError: error.message };
      render(root, state, handlers);
    }
  }

  async function createPublicFragment(event) {
    const id = getManageIdentifier(state);
    const csrfToken = state.claimCsrfToken;
    if (!id || !csrfToken) return;
    const fragment = compactFragmentInput(createFormData(event?.currentTarget));
    state = { ...state, fragmentStatus: 'creating_fragment', fragmentError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl });
      state = mergeFragmentMutationState(state, result, { fragmentStatus: 'fragment_created', fragmentError: null });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, fragmentStatus: 'error', fragmentError: error.message };
      render(root, state, handlers);
    }
  }

  async function updatePublicFragment(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    const patch = compactFragmentPatch(createFormData(event.currentTarget));
    state = { ...state, fragmentStatus: 'updating_fragment', fragmentError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl });
      state = mergeFragmentMutationState(state, result, { fragmentStatus: 'fragment_updated', fragmentError: null });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, fragmentStatus: 'error', fragmentError: error.message };
      render(root, state, handlers);
    }
  }

  async function revokePublicFragment(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    state = { ...state, fragmentStatus: 'revoking_fragment', fragmentError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl });
      state = mergeFragmentMutationState(state, result, { fragmentStatus: 'fragment_revoked', fragmentError: null });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, fragmentStatus: 'error', fragmentError: error.message };
      render(root, state, handlers);
    }
  }

  async function logoutManagerSession() {
    const id = getManageIdentifier(state);
    if (!id) return;
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      await claimApi.logoutMultipassSession?.({ id, apiBase, csrfToken: state.claimCsrfToken, fetchImpl });
    } finally {
      state = { ...state, claimCsrfToken: null, claimSessionStatus: null, claimStatus: 'signed_out' };
      render(root, state, handlers);
    }
  }

  const handlers = { resolveLiveAgent, resetStaticDemo, saveCurrentMultipass, claimWithWallet, submitManualReview, updatePublicProfile, createPublicFragment, updatePublicFragment, revokePublicFragment, logoutManagerSession };

  return { start };
}

function getInitialResolverInput() {
  if (typeof window === 'undefined') return null;
  const locationUrl = new URL(window.location.href);
  if (!locationUrl.searchParams.has('agent')) return null;
  return locationUrl.searchParams.get('agent') ?? '';
}

function getInitialPageKind() {
  if (typeof window === 'undefined') return 'profile';
  const locationUrl = new URL(window.location.href);
  if (getSavedSlugFromLocation(locationUrl)) return 'profile';
  if (locationUrl.searchParams.has('agent')) return 'profile';
  return locationUrl.pathname === '/multipass' || locationUrl.pathname === '/multipass/' ? 'product_home' : 'profile';
}

function defaultLoadDemo({ fetchImpl } = {}) {
  const locationUrl = new URL(window.location.href);
  const apiBase = getApiBaseFromLocation(locationUrl);
  const savedSlug = getSavedSlugFromLocation(locationUrl);
  if (savedSlug) return loadSavedMultipassDemo({ apiBase, slug: savedSlug, fetchImpl });
  if (shouldUseStaticDemo(locationUrl)) return loadStaticMultipassDemo();

  return loadMultipassDemo({
    apiBase,
    subject: DEMO_SUBJECT,
    fetchImpl,
  });
}

function defaultSaveMultipass({ agent, fetchImpl } = {}) {
  return saveActivatedMultipass({ agent, apiBase: getApiBaseFromLocation(new URL(window.location.href)), fetchImpl });
}

const defaultClaimApi = {
  createClaimNonce,
  verifyClaimSignature,
  submitManualReviewClaim,
  updateMultipassProfile,
  createMultipassFragment,
  updateMultipassFragment,
  revokeMultipassFragment,
  logoutMultipassSession,
};

function getManageIdentifier(state) {
  return state.savedProfile?.slug ?? state.data?.profile?.slug ?? state.data?.profile?.multipass_id ?? null;
}

function isWrongWalletClaimError(error) {
  const details = error?.details ?? {};
  const bodyError = details.body?.error ?? {};
  return error?.name === 'SavedMultipassError'
    && [401, 403].includes(details.status)
    && ['forbidden', 'unauthorized'].includes(bodyError.code)
    && /not eligible to manage this Multipass record/i.test(bodyError.message ?? error?.message ?? '');
}

function getClaimApiErrorMessage(error) {
  if (isWrongWalletClaimError(error)) {
    return 'That wallet cannot manage this Multipass. Connect the source owner wallet or request manual review.';
  }
  return error?.message || 'Claim request failed. Nothing was changed.';
}

function isSavedManageRecord(state) {
  return Boolean(state.savedProfile?.slug || state.data?.activation?.state === 'saved_record' || state.data?.modeLabel === 'Saved Multipass');
}

function mergeClaimProfileState(current, result, patch = {}) {
  const nextProfile = result?.profile ? { ...current.data.profile, ...result.profile } : current.data.profile;
  return {
    ...current,
    ...patch,
    data: {
      ...current.data,
      profile: nextProfile,
      liveProfilePage: current.data.liveProfilePage ? {
        ...current.data.liveProfilePage,
        headline: `${nextProfile.display_name ?? current.data.liveProfilePage.headline ?? 'Saved'} Multipass`,
      } : current.data.liveProfilePage,
    },
  };
}

function createFormData(form) {
  const FormDataCtor = form?.ownerDocument?.defaultView?.FormData ?? FormData;
  return form ? new FormDataCtor(form) : new FormDataCtor();
}

function compactProfilePatch(input) {
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    if (key === 'tags') {
      const tags = normalized.split(',').map((tag) => tag.trim()).filter(Boolean);
      if (tags.length) patch.tags = tags;
    } else {
      patch[key] = normalized;
    }
  }
  return patch;
}

function renderLoading(root) {
  root.innerHTML = `
    <section class="record-shell loading-shell">
      <p class="eyebrow">${HERO_COPY.eyebrow}</p>
      <h1>Loading Multipass...</h1>
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
  if (!isSafeMultipassSharePath(sharePath)) return '';
  return ` <a class="share-link" href="${escapeAttribute(sharePath)}">${escapeHtml(sharePath)}</a>`;
}


function syncShareUrl(sharePath) {
  if (typeof window === 'undefined' || !isSafeMultipassSharePath(sharePath)) return;
  window.history.replaceState(null, '', getSafeMultipassSharePath(sharePath));
}

function clearShareUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('agent');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function render(root, state, handlers = {}) {
  const { data } = state;
  if (state.pageKind === 'product_home') {
    renderProductHome(root, state, handlers);
    return;
  }
  const heroCopy = createHeroCopy(data);
  const agentCarousel = createAgentCarousel(data);
  const selectedAgent = agentCarousel.cards[state.selectedAgentCard] ?? agentCarousel.cards[0];
  const activationState = getActivationState(data, state);
  const fragmentTrustMap = createFragmentTrustMap(data, selectedAgent);
  const proofCards = createProofCards(data, selectedAgent);
  root.innerHTML = `
    <div class="record-shell">
      <header class="record-header">
        <div class="brand"><img class="brand-logo" src="/multipass/helixa-logo.png" alt="" aria-hidden="true"><span>Multipass</span></div>
        <div class="header-meta"><span>${escapeHtml(data.liveProfilePage?.headerMeta ?? data.sourceLabel ?? 'Multipass')}</span></div>
      </header>

      ${renderHomepageHero(heroCopy, data, agentCarousel)}

      ${renderLiveResolver(state)}

      ${renderActivationSummary(activationState)}

      ${renderSavePanel(state)}

      ${renderClaimManagementPanel(state)}

      ${renderSharePanel(data, heroCopy)}

      ${renderAgentCarousel(agentCarousel, selectedAgent, state.selectedAgentCard)}

      ${renderAgentAura(data.visualIdentity)}

      ${renderAgentAuraProvenanceDrawer(data.visualIdentity?.provenanceDrawer)}

      ${renderMarketplaceListing(data.marketplaceListing)}

      ${renderFragmentTrustMap(fragmentTrustMap)}

      <section class="proof-ledger">
        <div class="ledger-title"><h2>Proof ledger</h2><span>Expandable API records</span></div>
        ${proofCards.map((card, index) => renderProofRow(card, index, state.expandedCard)).join('')}
      </section>

      <footer class="footer-note">${escapeHtml(['activated', 'saved'].includes(activationState.kind)
        ? 'Display-only Multipass profile. It does not execute approvals, change authority, expose private credentials, or alter live routes.'
        : 'This is a public Multipass profile. Wallet claims, saved records, and live route updates require activation.'
      )}</footer>
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

  root.querySelector('[data-action="save-multipass"]')?.addEventListener('click', () => handlers.saveCurrentMultipass?.());
  root.querySelector('[data-action="claim-with-wallet"]')?.addEventListener('click', () => handlers.claimWithWallet?.());
  root.querySelector('[data-action="submit-manual-review"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.submitManualReview?.(event);
  });
  root.querySelector('[data-action="update-public-profile"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.updatePublicProfile?.(event);
  });
  root.querySelector('[data-action="logout-manager-session"]')?.addEventListener('click', () => handlers.logoutManagerSession?.());
  bindFragmentManager(root, handlers);
  root.querySelector('[data-action="reset-static-demo"]')?.addEventListener('click', () => handlers.resetStaticDemo?.());
  root.querySelectorAll('[data-action="resolve-example-agent"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.getAttribute('data-agent') ?? ''));
  });
  root.querySelectorAll('[data-action="select-lookup-match"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.dataset.tokenId ?? ''));
  });
}

function renderProductHome(root, state, handlers = {}) {
  const data = state.data;
  const proofCount = countPublicProofSignals(data);
  const agentCarousel = createAgentCarousel(data);
  root.innerHTML = `
    <div class="record-shell product-home-shell">
      <header class="record-header">
        <div class="brand"><img class="brand-logo" src="/multipass/helixa-logo.png" alt="" aria-hidden="true"><span>Multipass</span></div>
        <div class="header-meta"><span>Agent identity layer</span></div>
      </header>

      <section class="product-hero">
        <div class="product-hero-copy">
          <p class="eyebrow">Helixa Multipass</p>
          <h1>Portable identity profiles for agents.</h1>
          <p class="lead">Multipass turns agent records into shareable profiles with public proof, ownership context, routes, and update history.</p>
          <div class="homepage-actions">
            <a href="#agent-visuals" class="homepage-action primary">View agents</a>
            <a href="#live-resolver" class="homepage-action">Activate an agent</a>
          </div>
        </div>
        <aside class="homepage-proof-panel" aria-label="Multipass product summary">
          <p class="card-label">What it does</p>
          <h2>One readable profile for identity, proof, custody context, and endpoints.</h2>
          <div class="homepage-proof-grid">
            ${renderHeroStat('Example profile', 'Bendr 2.0')}
            ${renderHeroStat('Public proof signals', proofCount)}
            ${renderHeroStat('Manager edits', 'Claim-gated')}
            ${renderHeroStat('Private data', 'Not exposed')}
          </div>
        </aside>
      </section>

      ${renderAgentVisualStrip(agentCarousel, state.selectedAgentCard)}
      ${renderLiveResolver(state, { showResetButton: false })}
    </div>
  `;

  bindProductHomeEvents(root, handlers, state);
}

function renderAgentVisualStrip(carousel, selectedIndex) {
  const activeIndex = Math.max(0, Math.min(selectedIndex, carousel.cards.length - 1));

  return `
    <section id="agent-visuals" class="profile-gallery card-carousel profile-visual-strip" aria-label="Agent examples">
      <div class="card-carousel-head">
        <p class="eyebrow">${escapeHtml(carousel.eyebrow)}</p>
        <h2>${escapeHtml(carousel.title)}</h2>
        <p>${escapeHtml(carousel.body)}</p>
      </div>
      <div class="card-track" aria-label="Swipe through agent Multipass profiles">
        ${carousel.cards.map((card, index) => renderAgentVisualProfileLink(card, index, activeIndex)).join('')}
      </div>
    </section>
  `;
}

function renderAgentVisualProfileLink(card, index, selectedIndex) {
  const selected = index === selectedIndex;
  const href = getHomepageMultipassProfileHref(card);
  const imageUrl = safeHttpsUrl(card.visual?.imageUrl);
  const label = card.visual?.label ?? `${card.name} visual identity`;
  return `
    <a class="profile-card card-button visual-profile-link${selected ? ' selected' : ''}" href="${escapeAttribute(href)}" aria-label="Open ${escapeAttribute(card.name)} Multipass profile"${selected ? ' aria-current="true"' : ''}>
      <span class="profile-card-visual tone-${escapeAttribute(card.visual?.tone ?? 'neutral')}" aria-label="${escapeAttribute(label)}">
        ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(label)}" loading="eager" decoding="async" data-visual-card-image="true" />` : ''}
        <span>${escapeHtml(card.visual?.initials ?? 'MP')}</span>
      </span>
      <span class="profile-card-copy">
        <span class="card-name">${escapeHtml(card.name)}</span>
        <span>${escapeHtml(card.role)} · ${escapeHtml(card.memberLabel)}</span>
        <span>${escapeHtml(card.helixaId)}</span>
        <span>${escapeHtml(card.custody)}</span>
        <span>${escapeHtml(card.proofSummary)}</span>
        <strong>${escapeHtml(card.credLabel)} · ${escapeHtml(card.verifiedLabel)}</strong>
      </span>
    </a>
  `;
}

function getHomepageMultipassProfileHref(card) {
  const tokenId = String(card.tokenId ?? '').trim();
  if (/^\d+$/.test(tokenId)) return `/multipass/?agent=${encodeURIComponent(tokenId)}`;

  const helixaId = String(card.helixaId ?? '').trim();
  if (/^\d+:\d+$/.test(helixaId)) return `/multipass/?agent=${encodeURIComponent(helixaId)}`;

  if (card.profileUrl) {
    try {
      const parsed = new URL(String(card.profileUrl), 'https://helixa.xyz');
      const sharePath = `${parsed.pathname}${parsed.search}`;
      if (isSafeMultipassSharePath(sharePath)) return sharePath;
    } catch {
      // Fall through to the Multipass home rather than leaking old Helixa profile routes.
    }
  }

  return '/multipass/';
}

function bindProductHomeEvents(root, handlers, state) {
  root.querySelector('[data-action="resolve-live-agent"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector('input[name="agent"]')?.value ?? '';
    if (isRetryBlocked(state)) return;
    if (state.resolverStatus === 'loading' && input.trim() === state.resolverInFlightInput) return;
    handlers.resolveLiveAgent?.(input);
  });
  root.querySelectorAll('[data-action="resolve-example-agent"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.getAttribute('data-agent') ?? ''));
  });
  bindVisualImageFallbacks(root);
  root.querySelectorAll('[data-action="select-agent-card"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedAgentCard = Number(button.dataset.index);
      renderProductHome(root, state, handlers);
      root.querySelector(`[data-action="select-agent-card"][data-index="${state.selectedAgentCard}"]`)?.focus();
    });
  });
  root.querySelectorAll('[data-action="select-lookup-match"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.dataset.tokenId ?? ''));
  });
}

function bindVisualImageFallbacks(root) {
  root.querySelectorAll('img[data-visual-card-image="true"]').forEach((image) => {
    const markFailed = () => {
      image.hidden = true;
      image.closest('.profile-card-visual')?.classList.add('image-failed');
    };
    if (image.complete && image.naturalWidth === 0) markFailed();
    image.addEventListener('error', markFailed, { once: true });
  });
}

function renderHomepageHero(heroCopy, data, agentCarousel) {
  const profileCount = agentCarousel.cards.length;
  const proofCount = countPublicProofSignals(data);
  return `
    <section class="homepage-hero">
      <div class="homepage-hero-copy">
        <p class="eyebrow">${escapeHtml(heroCopy.eyebrow)}</p>
        <div class="prototype-ribbon">
          ${heroCopy.prototypeLabel ? `<span>${escapeHtml(heroCopy.prototypeLabel)}</span>` : ''}
          <span>${escapeHtml(heroCopy.audience)}</span>
        </div>
        <h1>${escapeHtml(heroCopy.headline)}</h1>
        <p class="lead">${escapeHtml(heroCopy.body)}</p>
        <div class="homepage-actions">
          <a href="#live-resolver" class="homepage-action primary">Activate Multipass</a>
          <a href="#profile-gallery" class="homepage-action">View example profiles</a>
        </div>
        <div class="note">${escapeHtml(heroCopy.note)}${renderShareLink(data.liveProfilePage?.sharePath)}</div>
      </div>
      <aside class="homepage-proof-panel" aria-label="Multipass profile ingredients">
        <p class="card-label">Trust profile stack</p>
        <h2>Identity, custody, proof, routes, and visual context in one readable profile.</h2>
        <div class="homepage-proof-grid">
          ${renderHeroStat('Profiles', profileCount)}
          ${renderHeroStat('Public proof', proofCount)}
          ${renderHeroStat('Profile source', data.sourceLabel ?? 'Bendr 2.0 Public Profile')}
          ${renderHeroStat('Primary use', 'Discovery')}
        </div>
      </aside>
    </section>
  `;
}

function countPublicProofSignals(data) {
  return Array.isArray(data.fragments?.fragments)
    ? data.fragments.fragments.filter((fragment) => fragment.visibility === 'public').length
    : 0;
}

function renderHeroStat(label, value) {
  return `
    <article class="homepage-proof-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderSharePanel(data, heroCopy) {
  const shareUrl = getAbsoluteShareUrl(data.liveProfilePage?.sharePath);
  const title = String(data.liveProfilePage?.headline ?? heroCopy.headline ?? 'Multipass').replace(/[.!?]+$/u, '');
  return `
    <section class="share-panel" aria-label="Share Multipass profile">
      <div>
        <p class="card-label">Share this Multipass</p>
        <h2>Portable Agent Identity</h2>
        <p>${escapeHtml(title)}. Identity, proof, custody, Cred, and discovery context for agents and AI-native systems.</p>
      </div>
      <div class="share-copy-card" aria-label="Multipass share URL">
        <span>Share URL</span>
        <code class="share-url">${escapeHtml(shareUrl)}</code>
        <small class="share-hint">Tap and hold to copy</small>
      </div>
    </section>
  `;
}

function renderLiveResolver(state, options = {}) {
  const showResetButton = options.showResetButton !== false;
  return `
    <section id="live-resolver" class="live-resolver" aria-label="Activate a live agent record">
      <form data-action="resolve-live-agent">
        <div>
          <p class="card-label">Activate a live agent record</p>
          <h2>Build a Multipass from live AgentDNA data.</h2>
          <p>Enter an AgentDNA ID, ERC-8004-style ID, token ID, or agent name. Try <code>1</code>, <code>8453:1</code>, <code>Bendr 2.0</code>, or <code>Quigbot</code>.</p>
        </div>
        <label>
          <span>AgentDNA ID, ERC-8004-style ID, token ID, or agent name</span>
          <input name="agent" value="${escapeAttribute(state.resolverInput ?? '')}" placeholder="81, 8453:81, or Quigbot" autocomplete="off" />
        </label>
        <button type="submit" ${isRetryBlocked(state) ? 'disabled' : ''}>${state.resolverStatus === 'loading' ? 'Activating...' : 'Activate Multipass'}</button>
        ${showResetButton ? '<button type="button" data-action="reset-static-demo">Back to Multipass home</button>' : ''}
      </form>
      ${state.resolverError ? `<p class="resolver-message error">${escapeHtml(state.resolverError)}</p>` : ''}
      ${state.retryMessage ? `<p class="resolver-message error">${escapeHtml(state.retryMessage)}</p>` : ''}
      ${renderResolverExamples()}
      ${renderLookupMatches(state.lookupMatches)}
      ${state.resolverStatus === 'loaded' ? '<p class="resolver-message">Live record activated into a display-only Multipass. No approvals or authority changes.</p>' : ''}
    </section>
  `;
}

function getClaimButtonLabel(state) {
  const snapshot = state.walletSnapshot ?? {};
  if (state.claimStatus === 'signing') return 'Waiting for signature...';
  if (snapshot.configured === false) return 'Wallet login not configured';
  if (snapshot.ready === false) return 'Loading wallet options...';
  if (snapshot.connected && snapshot.label) return `Sign owner claim with ${snapshot.label}`;
  return snapshot.connectLabel ?? 'Connect wallet to claim';
}

function renderClaimManagementPanel(state) {
  if (!isSavedManageRecord(state)) return '';
  const profile = state.data?.profile ?? state.savedProfile ?? {};
  const ownerSummary = profile.owner_summary ?? {};
  const status = state.claimStatus ?? ownerSummary.verification_status ?? ownerSummary.owner_state ?? 'unclaimed';
  const canEdit = Boolean(state.claimCsrfToken);
  const claimButtonLabel = getClaimButtonLabel(state);
  const walletUnconfigured = state.walletSnapshot?.configured === false;
  return `
    <section class="claim-management-panel" aria-label="Claim management">
      <div class="claim-management-copy">
        <p class="card-label">Claim management</p>
        <h2>Manage safe public profile fields.</h2>
        <p>Owner-wallet verification or manual review can unlock public profile edits only. This does not transfer custody, tools, credentials, or ownership.</p>
        <div class="claim-status-row">
          <span>Status</span>
          <strong>${escapeHtml(status)}</strong>
        </div>
        ${ownerSummary.summary ? `<p class="resolver-message">${escapeHtml(ownerSummary.summary)}</p>` : ''}
        ${walletUnconfigured ? '<p class="resolver-message error">Wallet login is not configured for this build.</p>' : ''}
        ${state.claimError ? `<p class="resolver-message error">${escapeHtml(state.claimError)}</p>` : ''}
      </div>
      <div class="claim-management-actions">
        <button type="button" data-action="claim-with-wallet" ${state.claimStatus === 'signing' || walletUnconfigured ? 'disabled' : ''}>${escapeHtml(claimButtonLabel)}</button>
        <form class="manual-review-form" data-action="submit-manual-review">
          <label><span>Manager wallet for review</span><input name="proposedManagerWallet" placeholder="0x..." autocomplete="off" /></label>
          <label><span>Contact route</span><input name="contactRoute" placeholder="agentmail:team@example.test" autocomplete="off" /></label>
          <label><span>Review note</span><textarea name="note" rows="2" placeholder="Why this wallet should manage public fields"></textarea></label>
          <button type="submit">Request manual review</button>
        </form>
      </div>
      ${canEdit ? renderPublicProfileEditForm(profile, state) : ''}
      ${canEdit ? renderFragmentManagerPanel(state) : ''}
    </section>
  `;
}

function renderPublicProfileEditForm(profile, state) {
  const discovery = profile.discovery_profile ?? {};
  const summary = profile.summary ?? discovery.summary ?? '';
  const avatarUrl = profile.avatar_url ?? discovery.avatar_url ?? '';
  const tags = Array.isArray(profile.tags) ? profile.tags : (Array.isArray(discovery.tags) ? discovery.tags : []);
  return `
    <form class="public-profile-edit-form" data-action="update-public-profile" aria-label="Edit public Multipass profile">
      <p class="card-label">Public profile editor</p>
      <label><span>Display name</span><input name="display_name" value="${escapeAttribute(profile.display_name ?? '')}" /></label>
      <label><span>Summary</span><textarea name="summary" rows="3">${escapeHtml(summary)}</textarea></label>
      <label><span>Avatar URL</span><input name="avatar_url" value="${escapeAttribute(avatarUrl)}" /></label>
      <label><span>Tags</span><input name="tags" value="${escapeAttribute(tags.join(', '))}" /></label>
      <div class="profile-edit-actions">
        <button type="submit" ${state.claimStatus === 'updating_profile' ? 'disabled' : ''}>${state.claimStatus === 'updating_profile' ? 'Saving...' : 'Save public edits'}</button>
        <button type="button" data-action="logout-manager-session">Sign out</button>
      </div>
    </form>
  `;
}

function renderActivationSummary(activationState) {
  const resolved = activationState.resolvedId ? `<span>${escapeHtml(activationState.resolvedId)}</span>` : '';
  const futureBindNote = activationState.showFutureBindNote
    ? '<p class="activation-bind-note">Today, NFT activation creates a new ERC-8004 identity. Binding NFTs to an existing identity is planned for a later adapter release.</p>'
    : '';

  return `
    <section class="activation-summary ${escapeAttribute(activationState.kind)}" aria-label="Multipass activation state">
      <div>
        <p class="card-label">Agent Activation</p>
        <h2>${escapeHtml(activationState.title)}</h2>
        <p>${escapeHtml(activationState.summary)}</p>
      </div>
      <div class="activation-facts" aria-label="Activation facts">
        <strong>${escapeHtml(activationState.subject)}</strong>
        ${resolved}
        <em>${escapeHtml(activationState.originLabel)}</em>
        <small>${escapeHtml(activationState.sourceLabel)}</small>
      </div>
      ${futureBindNote}
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
  return 'Could not reach the Helixa API. Bendr public profile is still available.';
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
    <section class="aura-card" data-visual-source="${escapeAttribute(visualIdentity.source)}" aria-label="Agent Aura visual for trust profile">
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
    <section id="profile-gallery" class="profile-gallery card-carousel">
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
    <button class="profile-card card-button${selected ? ' selected' : ''}" data-action="select-agent-card" data-index="${index}" type="button" aria-selected="${selected}">
      <span class="profile-card-visual tone-${escapeAttribute(card.visual?.tone ?? 'neutral')}" aria-label="${escapeAttribute(card.visual?.label ?? `${card.name} visual identity`)}">
        ${card.visual?.imageUrl ? `<img src="${escapeAttribute(card.visual.imageUrl)}" alt="${escapeAttribute(card.visual.label)}" loading="lazy" />` : ''}
        <span>${escapeHtml(card.visual?.initials ?? 'MP')}</span>
      </span>
      <span class="profile-card-copy">
        <span class="card-name">${escapeHtml(card.name)}</span>
        <span>${escapeHtml(card.role)} · ${escapeHtml(card.memberLabel)}</span>
        <span>${escapeHtml(card.helixaId)}</span>
        <span>${escapeHtml(card.custody)}</span>
        <span>${escapeHtml(card.proofSummary)}</span>
        <strong>${escapeHtml(card.credLabel)} · ${escapeHtml(card.verifiedLabel)}</strong>
      </span>
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
    <section class="marketplace-listing" aria-label="Trust profile marketplace compatibility context">
      <div class="listing-shell">
        <div class="listing-copy">
          <p class="card-label">Trust profile context</p>
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
      <p class="listing-safety">${escapeHtml(listing.safetyNote ?? 'Display only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.')}</p>
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
        <div><dt>Source</dt><dd>${escapeHtml(card.sourceLabel ?? 'Unknown source')}</dd></div>
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

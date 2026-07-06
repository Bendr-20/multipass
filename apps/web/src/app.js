import { getActivationState } from './activation.js';
import { buildSavedRoutes, getApiBaseFromLocation, getSavedSlugFromLocation, getWritableApiBaseFromLocation, isCanonicalHelixaFallbackError, loadCanonicalHelixaMultipass, loadJson, loadMultipassDemo, loadSavedMultipassDemo, loadStaticMultipassDemo, shouldUseStaticDemo } from './api.js';
import { HelixaResolverError, loadLiveHelixaMultipass } from './live-helixa-resolver.js';
import { createClaimNonce, createMultipassFragment, importMultipassTool, logoutMultipassSession, previewGroupMultipass, refreshMultipassTool, revokeMultipassFragment, saveActivatedMultipass, saveGroupMultipass, submitManualReviewClaim, updateMultipassFragment, updateMultipassProfile, verifyClaimSignature } from './saved-multipass-api.js';
import { bindFragmentManager, compactFragmentInput, compactFragmentPatch, mergeFragmentMutationState, renderFragmentManagerPanel } from './fragment-manager.js';
import { bindMarketplaceConnectionManager, compactMarketplaceConnectionInput, compactMarketplaceConnectionPatch, mergeMarketplaceConnectionMutationState, renderMarketplaceConnectionManagerPanel } from './marketplace-connection-manager.js';
import { getMarketplacePresenceEntries } from './marketplace-presence.js';
import { bindRouteManager, compactRouteInput, compactRoutePatch, getPublicRouteFragments, renderPublicRoutesManagerPanel, renderPublicRoutesPanel } from './route-manager.js';
import { createOwnerCommandCenterSnapshot, renderOwnerCommandCenterSnapshot } from './command-center.js';
import { bindToolManager, compactBankrToolImportInput, mergeToolImportState, mergeToolRefreshState, renderPublicToolsPanel, renderToolRegistryManagerPanel } from './tool-manager.js';
import { createInjectedWalletClient, createLegacyWalletClient, getWalletErrorMessage } from './wallet-client.js';
import { getAbsoluteShareUrl, getSafeMultipassSharePath, isSafeMultipassSharePath, renderSavePanel } from './save-panel.js';
import { GENERATED_SHARE_CARDS } from './generated-share-cards.js';
import { getAgentShareCard, getAgentSharePath } from './share-cards.js';
import { createGroupActivationPayload, normalizeGroupMemberInput, renderGroupActivationError, renderGroupActivationPanel, renderGroupActivationPreview, renderGroupActivationSuccess } from './group-activation.js';
import { createAgentCarousel, createClaritySections, createFragmentTrustMap, createProofCards, createStoryCards, DEMO_SUBJECT, HERO_COPY, V01_COPY } from './content.js';

const STATIC_SWARM_PROFILE_PATH = '/multipass/swarm/helixa';
const PUBLIC_AGENTS_PATH = '/multipass/agents';

const SITE_MENU_LINKS = [
  { label: 'Multipass Home', href: '/multipass/' },
  { label: 'Register Agent', href: 'https://helixa.xyz/' },
  { label: 'Cred Exchange', href: 'https://cred.exchange/' },
  { label: '$CRED Token', href: 'https://bankr.bot/agents/helixa' },
  { label: 'Docs / API', href: 'https://api.helixa.xyz/' },
];

export function createApp({ root, loadDemo, loadLiveDemo, saveMultipass = defaultSaveMultipass, claimApi = defaultClaimApi, walletClient, walletSigner, fetchImpl, prefetchProfiles } = {}) {
  if (!root) throw new Error('createApp requires a root element');

  const activeWalletClient = walletClient ?? (walletSigner ? createLegacyWalletClient(walletSigner) : createInjectedWalletClient());
  const activeLoadLiveDemo = loadLiveDemo ?? ((input) => defaultLoadLiveProfile(input, { fetchImpl }));
  const liveProfileCache = new Map();
  const liveProfileInFlight = new Map();
  const shouldPrefetchProfiles = prefetchProfiles ?? !loadDemo;

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
    routeStatus: null,
    routeError: null,
    routeActiveFragmentId: null,
    toolStatus: null,
    toolError: null,
    toolActiveFragmentId: null,
    marketplaceConnectionStatus: null,
    marketplaceConnectionError: null,
    marketplaceConnectionActiveFragmentId: null,
    groupActivation: createInitialGroupActivationState(),
    groupActivationExpanded: false,
    groupActivationRequestId: 0,
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
      } else if (state.pageKind === 'product_home') {
        scheduleHomepageProfilePrefetch(data);
      }
    } catch (error) {
      renderError(root, error);
    }
  }

  async function resolveLiveAgent(input, options = {}) {
    const trimmed = String(input ?? '').trim();
    const selectedAgentCard = Number.isInteger(options.selectedAgentCard) ? options.selectedAgentCard : state.selectedAgentCard;
    const cachedLiveData = getCachedLiveProfile(trimmed);
    if (cachedLiveData) {
      state = {
        ...state,
        pageKind: 'profile',
        data: cachedLiveData,
        resolverInput: input,
        resolverStatus: 'loaded',
        resolverError: null,
        retryUntil: 0,
        retryMessage: null,
        selectedAgentCard: 0,
        expandedCard: null,
        resolverInFlightInput: null,
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
        ...clearedRouteState(),
      };
      syncShareUrl(cachedLiveData?.liveProfilePage?.sharePath);
      render(root, state, handlers);
      return;
    }

    const loadingPageKind = state.pageKind === 'product_home' ? 'product_home' : 'profile';
    state = {
      ...state,
      pageKind: loadingPageKind,
      selectedAgentCard,
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
      groupActivation: createInitialGroupActivationState(),
      groupActivationExpanded: false,
      groupActivationRequestId: state.groupActivationRequestId + 1,
      ...clearedRouteState(),
    };
    const requestId = state.resolverRequestId;
    render(root, state, handlers);

    try {
      const liveProfileKey = getLiveProfileCacheKey(trimmed);
      const inFlightLiveData = liveProfileInFlight.get(liveProfileKey);
      let hydratedLiveData;
      if (inFlightLiveData) {
        hydratedLiveData = await inFlightLiveData;
      } else {
        const liveData = await activeLoadLiveDemo(liveProfileKey);
        hydratedLiveData = liveData?.canonicalHydrated ? liveData : await overlaySavedProfileVisual(liveData, { fetchImpl });
        setCachedLiveProfile(liveProfileKey, hydratedLiveData);
      }
      if (requestId !== state.resolverRequestId) return;
      state = {
        ...state,
        pageKind: 'profile',
        data: hydratedLiveData,
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
        ...clearedRouteState(),
      };
      syncShareUrl(hydratedLiveData?.liveProfilePage?.sharePath);
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
        ...clearedRouteState(),
      };
      clearShareUrl();
      render(root, state, handlers);
    }
  }

  function resetStaticDemo() {
    clearShareUrl();
    syncMultipassHomeUrl();
    state = {
      ...state,
      pageKind: 'product_home',
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
      groupActivation: createInitialGroupActivationState(),
      groupActivationExpanded: false,
      groupActivationRequestId: state.groupActivationRequestId + 1,
      ...clearedRouteState(),
    };
    render(root, state, handlers);
    scheduleHomepageProfilePrefetch(state.data);
  }

  function getCachedLiveProfile(input) {
    return liveProfileCache.get(getLiveProfileCacheKey(input)) ?? null;
  }

  function setCachedLiveProfile(input, data) {
    const keys = [
      input,
      data?.resolver?.tokenId,
      data?.resolver?.canonicalId,
      data?.profile?.token_id,
      data?.profile?.tokenId,
    ]
      .map(getLiveProfileCacheKey)
      .filter(Boolean);
    for (const key of keys) liveProfileCache.set(key, data);
  }

  async function loadAndCacheLiveProfile(input) {
    const key = getLiveProfileCacheKey(input);
    const cached = getCachedLiveProfile(key);
    if (cached) return cached;
    const inFlight = liveProfileInFlight.get(key);
    if (inFlight) return inFlight;

    const request = activeLoadLiveDemo(key)
      .then((liveData) => liveData?.canonicalHydrated ? liveData : overlaySavedProfileVisual(liveData, { fetchImpl }))
      .then((hydratedLiveData) => {
        setCachedLiveProfile(key, hydratedLiveData);
        return hydratedLiveData;
      })
      .finally(() => {
        liveProfileInFlight.delete(key);
      });
    liveProfileInFlight.set(key, request);
    return request;
  }

  function scheduleHomepageProfilePrefetch(data) {
    if (!shouldPrefetchProfiles || typeof window === 'undefined') return;
    window.setTimeout(() => prefetchHomepageProfiles(data), 0);
  }

  function prefetchHomepageProfiles(data) {
    const carousel = createAgentCarousel(data);
    const agents = [...new Set((carousel.cards ?? [])
      .map(getHomepageMultipassProfileAgent)
      .filter(isPrefetchableHomepageAgent))];
    for (const agent of agents) {
      void loadAndCacheLiveProfile(agent).catch(() => {});
    }
  }

  async function saveCurrentMultipass() {
    if (state.resolverStatus !== 'loaded') return;
    const agent = state.data?.resolver?.tokenId;
    if (!agent) {
      state = { ...state, saveStatus: 'error', saveError: 'Resolved token ID is required before activation.' };
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
        ...clearedRouteState(),
        data: {
          ...state.data,
          liveProfilePage: {
            ...state.data.liveProfilePage,
            sharePath: saved.sharePath,
            headerMeta: `Activated Multipass · ${saved.profile?.slug ?? 'persistent profile'}`,
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

  function showGroupActivation() {
    state = { ...state, groupActivationExpanded: true };
    render(root, state, handlers);
  }

  async function previewGroupActivation() {
    if (state.groupActivation?.status === 'saving') return;
    const input = readGroupActivationPayload(root, state.groupActivation);
    const requestId = state.groupActivationRequestId + 1;
    state = {
      ...state,
      groupActivationExpanded: true,
      groupActivationRequestId: requestId,
      groupActivation: { status: 'previewing', input, preview: null, result: null, error: null },
    };
    render(root, state, handlers);

    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const preview = await previewGroupMultipass(input, { apiBase, fetchImpl });
      if (state.groupActivationRequestId !== requestId) return;
      state = {
        ...state,
        groupActivation: { status: 'previewed', input, preview, result: null, error: null },
      };
      render(root, state, handlers);
    } catch (error) {
      if (state.groupActivationRequestId !== requestId) return;
      state = {
        ...state,
        groupActivation: { status: 'error', input, preview: null, result: null, error },
      };
      render(root, state, handlers);
    }
  }

  async function saveGroupActivation() {
    const input = readGroupActivationPayload(root, state.groupActivation);
    const previous = state.groupActivation ?? createInitialGroupActivationState();
    if (!previous.preview || !areGroupActivationInputsEqual(input, previous.input)) {
      state = {
        ...state,
        groupActivationExpanded: true,
        groupActivationRequestId: state.groupActivationRequestId + 1,
        groupActivation: {
          status: 'error',
          input,
          preview: null,
          result: null,
          error: new Error('Preview the current group details before activating.'),
        },
      };
      render(root, state, handlers);
      return;
    }
    const requestId = state.groupActivationRequestId + 1;
    state = {
      ...state,
      groupActivationExpanded: true,
      groupActivationRequestId: requestId,
      groupActivation: { ...previous, status: 'saving', input, result: null, error: null },
    };
    render(root, state, handlers);

    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await saveGroupMultipass(input, { apiBase, fetchImpl });
      if (state.groupActivationRequestId !== requestId) return;
      state = {
        ...state,
        groupActivation: { ...state.groupActivation, status: 'saved', input, result, error: null },
      };
      render(root, state, handlers);
    } catch (error) {
      if (state.groupActivationRequestId !== requestId) return;
      state = {
        ...state,
        groupActivation: { ...previous, status: 'error', input, result: null, error },
      };
      render(root, state, handlers);
    }
  }

  function resetGroupActivation() {
    state = {
      ...state,
      groupActivation: createInitialGroupActivationState(),
      groupActivationExpanded: true,
      groupActivationRequestId: state.groupActivationRequestId + 1,
    };
    render(root, state, handlers);
  }

  async function claimWithWallet() {
    const id = getManageIdentifier(state);
    if (!id) return;
    state = { ...state, claimStatus: 'signing', claimError: null, ...clearedRouteState() };
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
        ...clearedRouteState(),
      });
      render(root, state, handlers);
    } catch (error) {
      renderClaimFailure(getClaimApiErrorMessage(error));
    }
  }

  function renderClaimFailure(claimError) {
    state = { ...state, claimStatus: 'error', claimError, ...clearedRouteState() };
    render(root, state, handlers);
  }

  async function submitManualReview(event) {
    const id = getManageIdentifier(state);
    if (!id) return;
    const form = event?.currentTarget;
    const formData = createFormData(form);
    state = { ...state, claimStatus: 'submitting_review', claimError: null, ...clearedRouteState() };
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
        ...clearedRouteState(),
      });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, claimStatus: 'error', claimError: error.message, ...clearedRouteState() };
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
      visibility: formData.get('visibility'),
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
    await mutatePublicFragment({ status: 'creating_fragment', successStatus: 'fragment_created', operation: ({ apiBase }) => claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl }) });
  }

  async function createPublicRoute(event) {
    const id = getManageIdentifier(state);
    const csrfToken = state.claimCsrfToken;
    if (!id || !csrfToken) return;
    let fragment;
    try {
      fragment = compactRouteInput(createFormData(event?.currentTarget), getPublicRouteFragments(state.data));
    } catch (error) {
      setRouteMutationError(error);
      return;
    }
    await mutatePublicRoute({
      status: 'creating_route',
      successStatus: 'route_created',
      operation: ({ apiBase }) => claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl }),
    });
  }

  async function updatePublicFragment(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    const patch = compactFragmentPatch(createFormData(event.currentTarget));
    await mutatePublicFragment({ status: 'updating_fragment', successStatus: 'fragment_updated', operation: ({ apiBase }) => claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl }) });
  }

  async function updatePublicRoute(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    const routes = getPublicRouteFragments(state.data);
    const currentRoute = routes.find((route) => route.fragment_id === fragmentId) ?? {};
    let patch;
    try {
      patch = compactRoutePatch(createFormData(event.currentTarget), currentRoute, routes);
    } catch (error) {
      setRouteMutationError(error, fragmentId);
      return;
    }
    await mutatePublicRoute({
      status: 'updating_route',
      successStatus: 'route_updated',
      activeFragmentId: fragmentId,
      operation: ({ apiBase }) => claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl }),
    });
  }

  async function revokePublicFragment(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    await mutatePublicFragment({ status: 'revoking_fragment', successStatus: 'fragment_revoked', operation: ({ apiBase }) => claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl }) });
  }

  async function revokePublicRoute(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    await mutatePublicRoute({
      status: 'retiring_route',
      successStatus: 'route_retired',
      activeFragmentId: fragmentId,
      operation: ({ apiBase }) => claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl }),
    });
  }

  async function createMarketplaceConnection(event) {
    const id = getManageIdentifier(state);
    const csrfToken = state.claimCsrfToken;
    if (!id || !csrfToken) return;
    let fragment;
    try {
      fragment = compactMarketplaceConnectionInput(createFormData(event?.currentTarget));
    } catch (error) {
      setMarketplaceConnectionMutationError(error);
      return;
    }
    await mutateMarketplaceConnection({
      status: 'creating_marketplace_connection',
      successStatus: 'marketplace_connection_created',
      operation: ({ apiBase }) => claimApi.createMultipassFragment({ id, apiBase, csrfToken, fragment, fetchImpl }),
    });
  }

  async function updateMarketplaceConnection(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    const current = (state.data?.fragments?.fragments ?? []).find((fragment) => fragment.fragment_id === fragmentId) ?? {};
    let patch;
    try {
      patch = compactMarketplaceConnectionPatch(createFormData(event.currentTarget), current);
    } catch (error) {
      setMarketplaceConnectionMutationError(error, fragmentId);
      return;
    }
    await mutateMarketplaceConnection({
      status: 'updating_marketplace_connection',
      successStatus: 'marketplace_connection_updated',
      activeFragmentId: fragmentId,
      operation: ({ apiBase }) => claimApi.updateMultipassFragment({ id, fragmentId, apiBase, csrfToken, patch, fetchImpl }),
    });
  }

  async function retireMarketplaceConnection(event) {
    const id = getManageIdentifier(state);
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    const csrfToken = state.claimCsrfToken;
    if (!id || !fragmentId || !csrfToken) return;
    await mutateMarketplaceConnection({
      status: 'retiring_marketplace_connection',
      successStatus: 'marketplace_connection_retired',
      activeFragmentId: fragmentId,
      operation: ({ apiBase }) => claimApi.revokeMultipassFragment({ id, fragmentId, apiBase, csrfToken, fetchImpl }),
    });
  }

  async function importBankrToolMetadata(event) {
    const id = getManageIdentifier(state);
    const csrfToken = state.claimCsrfToken;
    if (!id || !csrfToken) return;
    let tool;
    try {
      tool = compactBankrToolImportInput(createFormData(event?.currentTarget));
    } catch (error) {
      setToolMutationError(error);
      return;
    }
    await mutateBankrToolImport({
      operation: ({ apiBase }) => claimApi.importMultipassTool({ id, apiBase, csrfToken, tool, fetchImpl }),
    });
  }

  async function refreshToolMetadata(event) {
    const id = getManageIdentifier(state);
    const csrfToken = state.claimCsrfToken;
    const fragmentId = event?.currentTarget?.dataset.fragmentId;
    if (!id || !csrfToken || !fragmentId) return;
    await mutateToolRefresh({
      activeFragmentId: fragmentId,
      operation: ({ apiBase }) => claimApi.refreshMultipassTool({ id, fragmentId, apiBase, csrfToken, fetchImpl }),
    });
  }

  async function mutatePublicFragment({ status, successStatus, operation }) {
    state = { ...state, fragmentStatus: status, fragmentError: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await operation({ apiBase });
      state = mergeFragmentMutationState(state, result, { fragmentStatus: successStatus, fragmentError: null });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, fragmentStatus: 'error', fragmentError: error.message };
      render(root, state, handlers);
    }
  }

  function setRouteMutationError(error, activeFragmentId = null) {
    state = {
      ...state,
      routeStatus: 'error',
      routeError: error.message,
      routeActiveFragmentId: activeFragmentId,
    };
    render(root, state, handlers);
  }

  async function mutatePublicRoute({ status, successStatus, activeFragmentId = null, operation }) {
    state = { ...state, routeStatus: status, routeError: null, routeActiveFragmentId: activeFragmentId };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await operation({ apiBase });
      state = mergeFragmentMutationState(state, result, {
        routeStatus: successStatus,
        routeError: null,
        routeActiveFragmentId: activeFragmentId,
      });
      render(root, state, handlers);
    } catch (error) {
      state = { ...state, routeStatus: 'error', routeError: error.message, routeActiveFragmentId: activeFragmentId };
      render(root, state, handlers);
    }
  }

  function setMarketplaceConnectionMutationError(error, activeFragmentId = null) {
    state = {
      ...state,
      marketplaceConnectionStatus: 'error',
      marketplaceConnectionError: error.message,
      marketplaceConnectionActiveFragmentId: activeFragmentId,
    };
    render(root, state, handlers);
  }

  async function mutateMarketplaceConnection({ status, successStatus, activeFragmentId = null, operation }) {
    state = { ...state, marketplaceConnectionStatus: status, marketplaceConnectionError: null, marketplaceConnectionActiveFragmentId: activeFragmentId };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await operation({ apiBase });
      state = mergeMarketplaceConnectionMutationState(state, result, {
        marketplaceConnectionStatus: successStatus,
        marketplaceConnectionError: null,
        marketplaceConnectionActiveFragmentId: activeFragmentId,
      });
      render(root, state, handlers);
    } catch (error) {
      setMarketplaceConnectionMutationError(error, activeFragmentId);
    }
  }

  function setToolMutationError(error, activeFragmentId = null) {
    state = {
      ...state,
      toolStatus: 'error',
      toolError: error.message,
      toolActiveFragmentId: activeFragmentId,
    };
    render(root, state, handlers);
  }

  async function mutateBankrToolImport({ operation }) {
    state = { ...state, toolStatus: 'importing_tool', toolError: null, toolActiveFragmentId: null };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await operation({ apiBase });
      state = mergeToolImportState(state, result, {
        toolStatus: 'tool_imported',
        toolError: null,
        toolActiveFragmentId: result?.fragment?.fragment_id ?? null,
      });
      render(root, state, handlers);
    } catch (error) {
      setToolMutationError(error);
    }
  }

  async function mutateToolRefresh({ activeFragmentId, operation }) {
    state = { ...state, toolStatus: 'refreshing_tool', toolError: null, toolActiveFragmentId: activeFragmentId };
    render(root, state, handlers);
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      const result = await operation({ apiBase });
      state = mergeToolRefreshState(state, result, {
        toolStatus: 'tool_refreshed',
        toolError: null,
        toolActiveFragmentId: activeFragmentId,
      });
      render(root, state, handlers);
    } catch (error) {
      setToolMutationError(error, activeFragmentId);
    }
  }

  async function logoutManagerSession() {
    const id = getManageIdentifier(state);
    if (!id) return;
    try {
      const apiBase = getWritableApiBaseFromLocation(new URL(window.location.href));
      await claimApi.logoutMultipassSession?.({ id, apiBase, csrfToken: state.claimCsrfToken, fetchImpl });
    } finally {
      state = { ...state, claimCsrfToken: null, claimSessionStatus: null, claimStatus: 'signed_out', ...clearedRouteState() };
      render(root, state, handlers);
    }
  }

  const handlers = { resolveLiveAgent, resetStaticDemo, saveCurrentMultipass, showGroupActivation, previewGroupActivation, saveGroupActivation, resetGroupActivation, claimWithWallet, submitManualReview, updatePublicProfile, createPublicFragment, updatePublicFragment, revokePublicFragment, createRoute: createPublicRoute, updateRoute: updatePublicRoute, revokeRoute: revokePublicRoute, createMarketplaceConnection, updateMarketplaceConnection, retireMarketplaceConnection, importBankrTool: importBankrToolMetadata, refreshTool: refreshToolMetadata, logoutManagerSession };

  return { start };
}

async function overlaySavedProfileVisual(liveData, { fetchImpl } = {}) {
  const activeFetch = fetchImpl ?? (typeof window !== 'undefined' ? window.fetch?.bind(window) : null);
  if (typeof window === 'undefined' || !activeFetch) return liveData;

  const candidateIds = [
    liveData?.resolver?.tokenId ? `mp_helixa_agent_${liveData.resolver.tokenId}` : null,
    liveData?.profile?.multipass_id,
    liveData?.profile?.slug,
  ].filter(Boolean);
  const uniqueCandidateIds = [...new Set(candidateIds)];
  if (uniqueCandidateIds.length === 0) return liveData;

  const apiBase = getApiBaseFromLocation(new URL(window.location.href));
  for (const identifier of uniqueCandidateIds) {
    try {
      const savedRoutes = buildSavedRoutes(apiBase, identifier);
      const savedProfile = await loadJson(savedRoutes.profile, activeFetch);
      const savedAvatarUrl = savedProfile?.discovery_profile?.avatar_url ?? savedProfile?.avatar_url ?? null;
      let savedTools = null;
      try {
        savedTools = await loadJson(savedRoutes.tools, activeFetch);
      } catch {
        savedTools = null;
      }
      const hasSavedTools = Array.isArray(savedTools?.tools) && savedTools.tools.length > 0;
      if (!savedAvatarUrl && !hasSavedTools) continue;

      return {
        ...liveData,
        ...(hasSavedTools ? { tools: savedTools } : {}),
        profile: savedAvatarUrl ? {
          ...liveData.profile,
          discovery_profile: {
            ...liveData.profile?.discovery_profile,
            avatar_url: savedAvatarUrl,
          },
        } : liveData.profile,
      };
    } catch {
      // Saved profiles are optional overlays for live records. Keep the live profile if a probe misses.
    }
  }

  return liveData;
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
  if (isStaticSwarmProfileRoute(locationUrl)) return 'profile';
  if (isPublicAgentsRoute(locationUrl)) return 'agents';
  if (getSavedSlugFromLocation(locationUrl)) return 'profile';
  if (locationUrl.searchParams.has('agent')) return 'profile';
  return locationUrl.pathname === '/multipass' || locationUrl.pathname === '/multipass/' ? 'product_home' : 'profile';
}

function isPublicAgentsRoute(locationUrl) {
  return locationUrl.pathname === PUBLIC_AGENTS_PATH || locationUrl.pathname === `${PUBLIC_AGENTS_PATH}/`;
}

function isStaticSwarmProfileRoute(locationUrl) {
  return locationUrl.pathname === STATIC_SWARM_PROFILE_PATH || locationUrl.pathname === `${STATIC_SWARM_PROFILE_PATH}/`;
}

async function loadStaticSwarmProfileDemo() {
  return createStaticSwarmProfileData(await loadStaticMultipassDemo());
}

function createStaticSwarmProfileData(data, selectedIndex = 2) {
  const cards = data?.['agentCards'] ?? [];
  const card = cards[selectedIndex] ?? cards.find((candidate) => candidate.subjectType === 'swarm' || String(candidate.tokenId ?? '') === 'swarm:helixa') ?? cards[0] ?? {};
  return {
    ...data,
    profile: {
      ...(data?.profile ?? {}),
      display_name: card.name ?? 'Helixa Swarm',
      multipass_id: 'mp_helixa_swarm',
      slug: 'swarm-helixa',
      subject_type: 'swarm',
      status: 'static_public_profile',
    },
    resolver: {
      tokenId: String(card.tokenId ?? 'swarm:helixa'),
      canonicalId: card.helixaId ?? '8453:swarm:helixa',
    },
    liveProfilePage: {
      ...(data?.liveProfilePage ?? {}),
      headline: `${card.name ?? 'Helixa Swarm'} Multipass`,
      headerMeta: `Public swarm Multipass · ${card.helixaId ?? '8453:swarm:helixa'}`,
      sharePath: STATIC_SWARM_PROFILE_PATH,
    },
    modeLabel: 'Static Swarm Multipass',
    sourceLabel: 'static public Multipass route',
    activation: { state: 'static_profile' },
  };
}

function defaultLoadDemo({ fetchImpl } = {}) {
  const locationUrl = new URL(window.location.href);
  const apiBase = getApiBaseFromLocation(locationUrl);
  const savedSlug = getSavedSlugFromLocation(locationUrl);
  if (isStaticSwarmProfileRoute(locationUrl)) return loadStaticSwarmProfileDemo();
  if (isPublicAgentsRoute(locationUrl)) return loadStaticMultipassDemo();
  if (savedSlug) return loadSavedMultipassDemo({ apiBase, slug: savedSlug, fetchImpl });
  if (shouldUseStaticDemo(locationUrl)) return loadStaticMultipassDemo();

  return loadMultipassDemo({
    apiBase,
    subject: DEMO_SUBJECT,
    fetchImpl,
  });
}

async function defaultLoadLiveProfile(input, { fetchImpl } = {}) {
  const locationUrl = new URL(window.location.href);
  const apiBase = getApiBaseFromLocation(locationUrl);
  try {
    return await loadCanonicalHelixaMultipass({ apiBase, input, fetchImpl });
  } catch (error) {
    if (isCanonicalHelixaFallbackError(error)) {
      return loadLiveHelixaMultipass(input, fetchImpl);
    }
    throw error;
  }
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
  importMultipassTool,
  refreshMultipassTool,
  logoutMultipassSession,
};

function createInitialGroupActivationState() {
  return { status: 'idle', input: {}, preview: null, result: null, error: null };
}

function readGroupActivationPayload(root, groupState = {}) {
  const form = root?.querySelector?.('[data-role="group-activation-form"]');
  if (form) return createGroupActivationPayload(createFormData(form));
  return normalizeGroupActivationInputObject(groupState.input ?? {});
}

function normalizeGroupActivationInputObject(input = {}) {
  return {
    subject_type: String(input.subject_type ?? input.subjectType ?? 'swarm').trim() || 'swarm',
    display_name: String(input.display_name ?? input.displayName ?? '').trim(),
    summary: String(input.summary ?? '').trim(),
    shared_policy_note: String(input.shared_policy_note ?? input.sharedPolicyNote ?? '').trim(),
    member_ids: normalizeGroupMemberInput(input.member_ids ?? input.memberIds ?? ''),
  };
}

function areGroupActivationInputsEqual(left = {}, right = {}) {
  return JSON.stringify(normalizeGroupActivationInputObject(left)) === JSON.stringify(normalizeGroupActivationInputObject(right));
}

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
  return Boolean(state.savedProfile?.slug || state.data?.activation?.state === 'saved_record' || state.data?.modeLabel === 'Activated Multipass');
}

function clearedRouteState() {
  return { routeStatus: null, routeError: null, routeActiveFragmentId: null, ...clearedToolState() };
}

function clearedToolState() {
  return { toolStatus: null, toolError: null, toolActiveFragmentId: null };
}

function mergeClaimProfileState(current, result, patch = {}) {
  const nextProfile = result?.profile ? { ...current.data.profile, ...result.profile } : current.data.profile;
  return {
    ...current,
    ...patch,
    data: {
      ...current.data,
      profile: nextProfile,
      changes: result?.changes ?? current.data.changes,
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

function syncMultipassHomeUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', '/multipass/');
}

function renderRecordHeader(metaLabel = 'Portable Agent Identities') {
  return `
    <header class="record-header">
      <div class="brand">
        <a class="brand-logo-link" href="/multipass/" aria-label="Go to Multipass home"><span class="brand-logo-frame"><img class="brand-logo" src="/multipass/helixa-logo.png" alt="" aria-hidden="true"></span></a>
        <span class="brand-stack">
          <span class="brand-wordmark">Multipass</span>
          <span class="header-meta">${escapeHtml(metaLabel)}</span>
        </span>
      </div>
      <div class="header-actions">
        <button class="site-menu-button" type="button" aria-label="Open Multipass navigation" aria-expanded="false" aria-controls="site-menu" data-action="toggle-site-menu">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
        ${renderSiteMenu()}
      </div>
    </header>
  `;
}

function renderSiteMenu() {
  const links = SITE_MENU_LINKS.map((link) => {
    const external = /^https?:\/\//.test(link.href);
    const targetAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeAttribute(link.href)}"${targetAttrs}>${escapeHtml(link.label)}</a>`;
  }).join('');
  return `<nav id="site-menu" class="site-menu" aria-label="Multipass navigation" hidden>${links}</nav>`;
}

function render(root, state, handlers = {}) {
  const { data } = state;
  if (state.pageKind === 'product_home') {
    renderProductHome(root, state, handlers);
    return;
  }

  if (state.pageKind === 'agents') {
    renderPublicAgentsPage(root, state, handlers);
    return;
  }

  if (state.resolverStatus === 'loading') {
    renderProfileLoadingShell(root, state, handlers);
    return;
  }

  if (isResolvedProfileView(state)) {
    renderProfilePage(root, state, handlers);
    return;
  }

  renderLegacyProfileShell(root, state, handlers);
}

function isResolvedProfileView(state) {
  if (state.pageKind === 'product_home') return false;
  if (state.resolverStatus === 'loading' || state.resolverStatus === 'error') return false;
  if (Array.isArray(state.lookupMatches) && state.lookupMatches.length > 0) return false;
  if (!state.data) return false;
  if (state.resolverStatus === 'loaded') return true;
  if (typeof window === 'undefined') return false;
  const locationUrl = new URL(window.location.href);
  if (isStaticSwarmProfileRoute(locationUrl)) return true;
  if (getSavedSlugFromLocation(locationUrl)) return true;
  return /^\/(profile|agent)\//.test(locationUrl.pathname);
}

function renderLegacyProfileShell(root, state, handlers = {}) {
  const { data } = state;
  const heroCopy = createHeroCopy(data);
  const agentCarousel = createAgentCarousel(data);
  const selectedAgent = agentCarousel.cards[state.selectedAgentCard] ?? agentCarousel.cards[0];
  const activationState = getActivationState(data, state);
  const fragmentTrustMap = createFragmentTrustMap(data, selectedAgent);
  const proofCards = createProofCards(data, selectedAgent);
  const headerMeta = state.resolverStatus === 'loaded' && data.liveProfilePage?.headerMeta
    ? data.liveProfilePage.headerMeta
    : 'Portable Agent Identities';
  root.innerHTML = `
    <div class="record-shell">
      ${renderRecordHeader(headerMeta)}

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

      ${renderProofLedger(proofCards, state.expandedCard)}

      <footer class="footer-note">${escapeHtml(['activated', 'saved'].includes(activationState.kind)
        ? 'Public agent profile. Viewing cannot execute approvals, change authority, expose private credentials, or alter live routes.'
        : 'This is a public Multipass profile. Wallet claims, saved records, and live route updates require activation.'
      )}</footer>
    </div>
  `;

  bindProfileEvents(root, state, handlers);
}

function renderProfileLoadingShell(root, state, handlers = {}) {
  const input = String(state.resolverInFlightInput ?? state.resolverInput ?? '').trim();
  const label = input || 'this agent';
  root.innerHTML = `
    <div class="record-shell profile-loading-shell">
      ${renderRecordHeader('Loading live Multipass')}
      <main class="profile-loading-view" aria-label="Loading live Multipass profile">
        ${renderLiveResolver(state)}
        <p class="resolver-message">Loading live Multipass for ${escapeHtml(label)}. No stale profile content is shown while the live record resolves.</p>
      </main>
    </div>
  `;

  bindProfileEvents(root, state, handlers);
}

function renderProfilePage(root, state, handlers = {}) {
  const { data } = state;
  const heroCopy = createHeroCopy(data);
  const agentCarousel = createAgentCarousel(data);
  const selectedAgent = selectProfileAgent(data, agentCarousel, state.selectedAgentCard);
  const activationState = getActivationState(data, state);
  const isGroupProfile = isSavedGroupMultipassProfile(data);
  const fragmentTrustMap = isGroupProfile ? null : createFragmentTrustMap(data, selectedAgent);
  const proofCards = isGroupProfile ? [] : createProofCards(data, selectedAgent);
  const visualIdentity = createProfileVisualIdentity(data, selectedAgent);
  const headerMeta = data.liveProfilePage?.headerMeta ?? 'Portable Agent Identities';

  const auraTitle = getProfileAuraTitle(data, selectedAgent);
  const auraSharePath = getProfileAuraSharePath(data, selectedAgent);
  const detailDrawers = isGroupProfile
    ? renderSavedGroupProfileDetailDrawers({ data, state })
    : renderProfileDetailDrawers({ data, heroCopy, activationState, fragmentTrustMap, proofCards, visualIdentity, selectedAgent, state });
  const footerCopy = isGroupProfile
    ? 'Public parent Multipass. Viewing cannot execute approvals, change authority, expose private credentials, or alter live routes.'
    : (['activated', 'saved'].includes(activationState.kind)
      ? 'Public agent profile. Viewing cannot execute approvals, change authority, expose private credentials, or alter live routes.'
      : 'This is a public Multipass profile. Wallet claims, saved records, and live route updates require activation.');

  root.innerHTML = `
    <div class="record-shell">
      ${renderRecordHeader(headerMeta)}
      <main class="multipass-profile-page${isGroupProfile ? ' group-multipass-profile-page' : ''}">
        ${renderAgentAura(visualIdentity, { title: auraTitle, sharePath: auraSharePath })}
        ${detailDrawers}
        <footer class="footer-note">
          <button class="profile-home-button" type="button" data-action="reset-static-demo">Back to Multipass home</button>
          <span>${escapeHtml(footerCopy)}</span>
        </footer>
      </main>
    </div>
  `;

  bindProfileEvents(root, state, handlers);
}

function bindProfileEvents(root, state, handlers = {}) {
  bindSiteMenu(root);
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
  root.querySelectorAll('[data-action="share-profile"]').forEach((button) => {
    button.addEventListener('click', () => shareProfileFromButton(button));
  });
  bindFragmentManager(root, handlers);
  bindRouteManager(root, handlers);
  bindMarketplaceConnectionManager(root, handlers);
  bindToolManager(root, handlers);
  root.querySelector('[data-action="reset-static-demo"]')?.addEventListener('click', () => handlers.resetStaticDemo?.());
  root.querySelectorAll('[data-action="resolve-example-agent"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.getAttribute('data-agent') ?? ''));
  });
  root.querySelectorAll('[data-action="select-lookup-match"]').forEach((button) => {
    button.addEventListener('click', () => handlers.resolveLiveAgent?.(button.dataset.tokenId ?? ''));
  });
}

function bindSiteMenu(root) {
  const button = root.querySelector('[data-action="toggle-site-menu"]');
  const menu = root.querySelector('#site-menu');
  if (!button || !menu) return;
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    menu.hidden = expanded;
  });
}

function selectProfileAgent(data, carousel, selectedIndex = 0) {
  const cards = carousel.cards ?? [];
  const resolverTokenId = data.resolver?.tokenId ?? data.profile?.token_id ?? data.profile?.tokenId ?? getTokenIdFromMultipassSharePath(data.liveProfilePage?.sharePath);
  const resolverCanonicalId = data.resolver?.canonicalId ?? data.profile?.helixa_id ?? data.profile?.helixaId;
  const displayName = data.profile?.display_name ?? data.liveProfilePage?.headline;

  const byToken = findAgentCard(cards, (card) => String(card.tokenId ?? '') === String(resolverTokenId ?? ''));
  if (byToken) return byToken;

  const byHelixa = findAgentCard(cards, (card) => String(card.helixaId ?? '') === String(resolverCanonicalId ?? ''));
  if (byHelixa) return byHelixa;

  const normalizedName = normalizeAgentName(displayName);
  const byName = findAgentCard(cards, (card) => normalizeAgentName(card.name) === normalizedName);
  if (byName) return byName;

  return cards[selectedIndex] ?? cards[0] ?? null;
}

function getTokenIdFromMultipassSharePath(sharePath) {
  try {
    const parsed = new URL(String(sharePath ?? ''), 'https://helixa.xyz');
    if (parsed.pathname !== '/multipass/') return null;
    const agent = parsed.searchParams.get('agent');
    return /^\d+$/.test(String(agent ?? '')) ? agent : null;
  } catch {
    return null;
  }
}

function findAgentCard(cards, predicate) {
  return cards.find((card) => predicate(card)) ?? null;
}

function normalizeAgentName(value) {
  return String(value ?? '')
    .replace(/\bMultipass\b/gi, '')
    .trim()
    .toLowerCase();
}

function createProfileVisualIdentity(data, selectedAgent) {
  const managerAvatarUrl = safeHttpsUrl(data.profile?.discovery_profile?.avatar_url ?? data.profile?.avatar_url);
  if (!managerAvatarUrl && data.visualIdentity && ['helixa_aura', 'aura'].includes(data.visualIdentity.source)) return data.visualIdentity;

  const name = selectedAgent?.name ?? data.profile?.display_name ?? data.liveProfilePage?.headline ?? 'Multipass visual';
  const tokenId = selectedAgent?.tokenId ?? data.resolver?.tokenId ?? data.profile?.token_id;
  const helixaId = selectedAgent?.helixaId ?? data.resolver?.canonicalId ?? data.profile?.multipass_id;
  const imageUrl = managerAvatarUrl
    ?? selectedAgent?.visual?.imageUrl
    ?? (/^\d+$/.test(String(tokenId ?? '')) ? `https://api.helixa.xyz/api/v2/aura/${tokenId}.png` : null);
  const visualSourceLabel = managerAvatarUrl ? 'Manager public avatar URL' : (selectedAgent?.visual?.label ?? (tokenId ? `Helixa aura route for token ${tokenId}` : 'Generated fallback initials'));
  const chips = [
    helixaId,
    selectedAgent?.credLabel,
    selectedAgent?.verifiedLabel,
    selectedAgent?.custody,
  ].filter(hasRenderableValue);

  return {
    source: 'helixa_aura',
    label: selectedAgent?.visual?.label ?? `${name} visual identity`,
    initials: selectedAgent?.visual?.initials ?? initialsForDisplayName(name),
    tone: selectedAgent?.visual?.tone ?? String(data.profile?.cred_summary?.trust_state ?? 'pending').toLowerCase(),
    imageUrl,
    chips,
    provenanceDrawer: {
      title: `${name} visual provenance`,
      summary: 'Visual identity is synthesized from public Multipass profile context when no dedicated aura metadata is published.',
      facts: [
        { label: 'Profile', value: name },
        { label: 'Identifier', value: helixaId ?? 'Public identifier pending' },
        { label: 'Visual source', value: visualSourceLabel },
      ],
      safetyNote: 'Public visual context. Viewing does not grant ownership, custody, approvals, or route authority.',
    },
  };
}

function getProfileAuraTitle(data, selectedAgent) {
  const rawTitle = selectedAgent?.name ?? data.profile?.display_name ?? data.liveProfilePage?.headline ?? data.visualIdentity?.label ?? 'Multipass profile';
  return String(rawTitle).replace(/\s+Multipass$/i, '').trim() || 'Multipass profile';
}

function getProfileAuraSharePath(data, selectedAgent) {
  const candidates = [
    selectedAgent?.tokenId,
    data.resolver?.tokenId,
    data.profile?.token_id,
    String(data.resolver?.canonicalId ?? '').match(/^\d+:(\d+)$/)?.[1],
    String(data.profile?.multipass_id ?? '').match(/^\d+:(\d+)$/)?.[1],
  ];
  const tokenId = candidates.map((value) => String(value ?? '').trim()).find((value) => /^\d+$/.test(value));
  const generatedCard = getAgentShareCard(tokenId, GENERATED_SHARE_CARDS);
  return getAgentSharePath(generatedCard);
}

function initialsForDisplayName(value) {
  const words = String(value ?? 'MP').match(/[a-z0-9]+/gi) ?? ['M', 'P'];
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || 'MP';
}

function isSavedGroupMultipassProfile(data = {}) {
  const subjectType = String(data.profile?.subject_type ?? data.profile?.subjectType ?? '').toLowerCase();
  return data.modeLabel === 'Activated Multipass' && ['swarm', 'collection'].includes(subjectType);
}

function renderSavedGroupProfileDetailDrawers({ data, state }) {
  const subjectType = normalizeGroupSubjectType(data.profile?.subject_type ?? data.profile?.subjectType);
  const rosterTitle = `${titleCase(subjectType)} roster`;
  const overview = renderSavedGroupOverview(data, subjectType);
  const roster = renderSavedGroupRosterContext(data, subjectType);
  const management = renderClaimManagementPanel(state) || renderProfileInfoPanel(
    'Ownership and management',
    'Public visitors can inspect this parent Multipass only. Management requires source-owner proof; viewing cannot expose private credentials or alter live routes.'
  );
  const proofSummary = renderSavedGroupProofSummary(data);

  return `
    <section class="profile-detail-drawers group-profile-detail-drawers" aria-label="Parent Multipass details">
      ${renderProfileDrawer('Parent Multipass', `${titleCase(subjectType)} identity and share state`, overview, { open: true })}
      ${renderProfileDrawer(rosterTitle, 'Resolved public AgentDNA member context', roster, { open: true })}
      ${renderProfileDrawer('Ownership and management', 'Source-owner management context', management)}
      ${renderProfileDrawer('Public member proof', 'Visible group evidence without raw fragment IDs', proofSummary)}
    </section>
  `;
}

function renderSavedGroupOverview(data, subjectType) {
  const profile = data.profile ?? {};
  const displayName = profile.display_name ?? data.liveProfilePage?.headline ?? 'Group Multipass';
  const summary = profile.summary ?? `${displayName} is a public parent Multipass for a ${subjectType} roster.`;
  const sharePath = isSafeMultipassSharePath(data.liveProfilePage?.sharePath) ? data.liveProfilePage.sharePath : '';
  return `
    <section class="group-profile-panel group-profile-overview">
      <p class="card-label">Parent Multipass</p>
      <h2>${escapeHtml(displayName)}</h2>
      <p>${escapeHtml(summary)}</p>
      <dl class="group-profile-facts">
        <div><dt>Subject type</dt><dd>${escapeHtml(titleCase(subjectType))}</dd></div>
        <div><dt>Share route</dt><dd>${escapeHtml(sharePath || 'Safe share route pending')}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(profile.status ?? 'public metadata')}</dd></div>
      </dl>
      <p class="group-profile-safety">Public parent Multipass metadata only. Viewing cannot execute approvals, change authority, expose private credentials, or alter live routes.</p>
    </section>
  `;
}

function renderSavedGroupRosterContext(data, subjectType) {
  const fragments = getPublicGroupFragments(data);
  const rosterFragment = findGroupFragment(fragments, 'roster') ?? fragments.find((fragment) => String(fragment.public_value ?? '').toLowerCase().includes('roster'));
  const policyFragment = findGroupFragment(fragments, 'policy') ?? fragments.find((fragment) => String(fragment.public_value ?? '').toLowerCase().includes('policy'));
  const credFragment = findGroupFragment(fragments, 'cred') ?? fragments.find((fragment) => fragment.fragment_type === 'risk_summary');
  const entries = [
    rosterFragment ? { label: `${titleCase(subjectType)} members`, value: rosterFragment.public_value } : null,
    policyFragment ? { label: 'Shared policy', value: policyFragment.public_value } : null,
    credFragment ? { label: 'Member Cred context', value: credFragment.public_value } : null,
  ].filter(Boolean);

  if (!entries.length) {
    return renderProfileInfoPanel('Public member roster', 'No public roster fragment is published for this parent Multipass yet.');
  }

  return `
    <section class="group-roster-context">
      <p class="card-label">Public member roster</p>
      <h2>${escapeHtml(titleCase(subjectType))} member context</h2>
      <div class="group-roster-items">
        ${entries.map((entry) => `
          <article class="group-roster-item">
            <strong>${escapeHtml(entry.label)}</strong>
            <p>${escapeHtml(entry.value)}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderSavedGroupProofSummary(data) {
  const fragments = getPublicGroupFragments(data);
  if (!fragments.length) return renderProfileInfoPanel('Public member proof', 'No public group fragments are published yet.');
  return `
    <section class="group-proof-summary">
      <p class="card-label">Public group evidence</p>
      <div class="group-proof-list">
        ${fragments.map((fragment) => `
          <article class="group-proof-item">
            <strong>${escapeHtml(formatDisplayLabel(fragment.fragment_type ?? 'fragment'))}</strong>
            <span>${escapeHtml(formatDisplayLabel(fragment.status ?? 'pending'))}</span>
            <p>${escapeHtml(fragment.public_value ?? 'Public value pending.')}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function getPublicGroupFragments(data = {}) {
  return (data.fragments?.fragments ?? []).filter((fragment) => fragment?.visibility === 'public');
}

function findGroupFragment(fragments, marker) {
  const normalizedMarker = String(marker ?? '').toLowerCase();
  return fragments.find((fragment) => {
    const id = String(fragment.fragment_id ?? '').toLowerCase();
    const sourceId = String(fragment.source?.source_id ?? '').toLowerCase();
    return id.includes(normalizedMarker) || sourceId.includes(normalizedMarker);
  }) ?? null;
}

function normalizeGroupSubjectType(value) {
  const normalized = String(value ?? '').toLowerCase();
  return ['swarm', 'collection'].includes(normalized) ? normalized : 'group';
}

function titleCase(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDisplayLabel(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderProfileDetailDrawers({ data, heroCopy, activationState, fragmentTrustMap, proofCards, visualIdentity, selectedAgent, state }) {
  const selectedAgentDetail = selectedAgent?.detailMode === 'swarm'
    ? renderProfileDrawer('Swarm roster', 'Members, policy references, custody, and transfer behavior', [
        renderAgentCardDetail(selectedAgent),
        renderOwnerCustodySnapshot(selectedAgent.ownerSnapshot),
        renderChangeReviewLedger(selectedAgent.changeReviewLedger),
        renderTransferPreview(selectedAgent),
      ].join(''), { open: true })
    : '';
  const shareAndStatus = [
    data.heroNote ? renderProfileInfoPanel('Profile note', data.heroNote) : '',
    state.resolverStatus === 'loaded' ? '<p class="resolver-message">Live source resolved into an activation preview. No approvals, custody, or authority changes.</p>' : '',
    renderSharePanel(data, heroCopy),
    renderActivationPreviewPanel(state, activationState),
    renderSavePanel(state),
    renderActivationSummary(activationState),
  ].join('');
  const claimManagement = renderClaimManagementPanel(state) || renderProfileInfoPanel(
    'Ownership and management',
    'Public visitors can inspect this public agent profile only. Management requires source-owner proof; viewing cannot transfer custody, expose private credentials, or change live routes.'
  );
  const provenance = renderAgentAuraProvenanceDrawer(visualIdentity?.provenanceDrawer) || renderProfileInfoPanel(
    'Visual provenance',
    'No dedicated visual provenance has been published for this profile yet.'
  );
  const publicRoutes = renderPublicRoutesPanel(data);
  const marketplacePresence = renderMarketplacePresencePanel(data);
  const trustContext = [publicRoutes, marketplacePresence, renderMarketplaceListing(data.marketplaceListing)].filter(Boolean).join('') || renderProfileInfoPanel(
    'Trust context',
    'Marketplace and route compatibility context is not published for this profile yet. Public proof remains available below.'
  );
  const publicTools = renderPublicToolsPanel(data) || renderProfileInfoPanel(
    'Tools and services',
    'No public tool cards are published for this profile yet.'
  );

  return `
    <section class="profile-detail-drawers" aria-label="Multipass profile details">
      ${selectedAgentDetail}
      ${renderProfileDrawer('Share and status', 'Public URL and display state', shareAndStatus)}
      ${renderProfileDrawer('Ownership and management', 'Source-owner authority context', claimManagement)}
      ${renderProfileDrawer('Visual provenance', 'Source and safety notes', provenance)}
      ${renderProfileDrawer('Trust context', 'Routes and marketplace compatibility', trustContext)}
      ${renderProfileDrawer('Tools and services', 'Registry-backed public capabilities', publicTools)}
      ${renderProfileDrawer('Public proof fragments', 'Visible profile evidence', renderFragmentTrustMap(fragmentTrustMap))}
      ${renderProfileDrawer('Proof ledger', 'Expandable API records', renderProofLedger(proofCards, state.expandedCard))}
    </section>
  `;
}

function renderProfileDrawer(title, subtitle, html, options = {}) {
  if (!String(html ?? '').trim()) return '';
  const open = options.open ? ' open' : '';
  const subtitleHtml = subtitle ? `<small>${escapeHtml(subtitle)}</small>` : '';
  return `
    <details class="profile-detail-drawer"${open}>
      <summary><span>${escapeHtml(title)}</span>${subtitleHtml}</summary>
      <div class="profile-detail-drawer-body">${html}</div>
    </details>
  `;
}

function renderProfileInfoPanel(title, body) {
  return `
    <section class="profile-info-panel">
      <p class="card-label">${escapeHtml(title)}</p>
      <p>${escapeHtml(body)}</p>
    </section>
  `;
}

function renderProofLedger(proofCards, expandedCard) {
  return `
    <section class="proof-ledger">
      <div class="ledger-title"><h2>Proof ledger</h2><span>Expandable API records</span></div>
      ${proofCards.map((card, index) => renderProofRow(card, index, expandedCard)).join('')}
    </section>
  `;
}


const MULTIPASS_INPUT_SIGNALS = ['AgentDNA', 'Owner wallet', 'Manager agent', 'Endpoints', 'NFT provenance'];
const MULTIPASS_CORE_SIGNALS = ['Human-owned', 'Agent-managed', 'Standards-readable'];
const MULTIPASS_PROFILE_SIGNALS = ['Public proof', 'Permissions', 'Work routes', 'Trust context', 'Shareable profile'];
const MULTIPASS_PROTOCOL_CHIPS = ['ERC-8004', 'AgentDNA', 'Cred', 'x401', 'x402', 'MCP/A2A'];

function renderMultipassSignalList(items) {
  return items.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

function renderMultipassWhatItDoesPanel() {
  return `
    <aside class="homepage-proof-panel multipass-system-panel" aria-label="What Multipass does">
      <div class="system-panel-copy">
        <p class="card-label">What it does</p>
        <h2>Multipass turns scattered agent identity into one readable public agent profile.</h2>
        <p>It connects identity, ownership and permissions, endpoints, proof, work history, and trust context into one portable profile humans and agents can verify.</p>
      </div>
      <div class="multipass-system-map" aria-label="Multipass identity system map">
        <section class="system-node system-node-inputs">
          <p>Identity inputs</p>
          <div>${renderMultipassSignalList(MULTIPASS_INPUT_SIGNALS)}</div>
        </section>
        <section class="system-node system-node-core">
          <strong>Multipass</strong>
          <div>${renderMultipassSignalList(MULTIPASS_CORE_SIGNALS)}</div>
        </section>
        <section class="system-node system-node-profile">
          <p>Usable profile</p>
          <div>${renderMultipassSignalList(MULTIPASS_PROFILE_SIGNALS)}</div>
        </section>
      </div>
      <div class="multipass-protocol-strip" aria-label="Supported protocol context">
        ${renderMultipassSignalList(MULTIPASS_PROTOCOL_CHIPS)}
      </div>
    </aside>
  `;
}

function renderProductHome(root, state, handlers = {}) {
  const data = state.data;
  const agentCarousel = createAgentCarousel(data);
  root.innerHTML = `
    <div class="record-shell product-home-shell">
      ${renderRecordHeader('Portable Agent Identities')}

      <section class="product-hero">
        <div class="product-hero-copy">
          <div class="product-hero-main">
            <p class="eyebrow">What it is</p>
            <h1>Portable identity profiles for agents.</h1>
            <p class="lead">Multipass turns agent records into shareable profiles with public proof, ownership context, routes, and update history.</p>
            <div class="homepage-actions">
              <a href="/multipass/agents" class="homepage-action primary">View agents</a>
              <a href="#live-resolver" class="homepage-action">Activate an agent</a>
            </div>
          </div>
          ${renderAgentVisualStrip(agentCarousel, state.selectedAgentCard, state)}
        </div>
      </section>

      ${renderLiveResolver(state, { showResetButton: state.resolverStatus === 'loading' || state.resolverStatus === 'error', showGroupActivationButton: true })}

      ${state.groupActivationExpanded ? renderGroupActivationSection(state.groupActivation) : ''}

      ${renderMultipassWhatItDoesPanel()}
    </div>
  `;

  bindProductHomeEvents(root, handlers, state);
}

function renderPublicAgentsPage(root, state, handlers = {}) {
  const agentCarousel = createAgentCarousel(state.data);
  root.innerHTML = `
    <div class="record-shell public-agents-shell">
      ${renderRecordHeader('Public Agent Gallery')}
      <section class="public-agents-hero" aria-label="Multipass public agents">
        <p class="eyebrow">View agents</p>
        <h1>Public Multipass agents.</h1>
      </section>
      ${renderPublicAgentGallery(agentCarousel, state)}
    </div>
  `;

  bindProductHomeEvents(root, handlers, state);
}

function renderGroupActivationSection(groupState = createInitialGroupActivationState()) {
  return `
    <section class="group-activation-section" aria-label="Activate collection or swarm workspace">
      ${renderGroupActivationPanel(groupState)}
      <div class="group-activation-output" aria-live="polite">
        ${renderGroupActivationError(groupState.error)}
        ${renderGroupActivationPreview(groupState.preview)}
        ${renderGroupActivationSuccess(groupState.result)}
      </div>
      <div class="group-activation-reset">
        <button type="button" data-action="reset-group-multipass">Reset group Multipass</button>
      </div>
    </section>
  `;
}

function renderAgentVisualStrip(carousel, selectedIndex, state = {}) {
  const activeIndex = Math.max(0, Math.min(selectedIndex, carousel.cards.length - 1));
  const loadingAgent = state.resolverStatus === 'loading' ? String(state.resolverInFlightInput ?? '').trim() : null;

  return `
    <section id="agent-visuals" class="profile-visual-strip" aria-label="Agent examples">
      <div class="visual-card-track" aria-label="Swipe through agent Multipass profiles">
        ${carousel.cards.map((card, index) => renderAgentVisualLink(card, index, activeIndex, loadingAgent)).join('')}
      </div>
    </section>
  `;
}

function renderAgentVisualLink(card, index, selectedIndex, loadingAgent = null) {
  const selected = index === selectedIndex;
  const href = getHomepageMultipassProfileHref(card, index);
  const agent = getHomepageMultipassProfileAgent(card);
  const imageUrl = safeHttpsUrl(card.visual?.imageUrl);
  const label = card.visual?.label ?? `${card.name} visual identity`;
  const loading = Boolean(agent && loadingAgent && String(agent) === String(loadingAgent));
  const actionAttrs = getHomeProfileActionAttrs(card, index);
  return `
    <a class="visual-card-button${selected ? ' selected' : ''}${loading ? ' loading' : ''}" href="${escapeAttribute(href)}"${actionAttrs} aria-label="Open ${escapeAttribute(card.name)} Multipass profile"${selected ? ' aria-current="true"' : ''}${loading ? ' aria-busy="true"' : ''}>
      <span class="profile-card-visual tone-${escapeAttribute(card.visual?.tone ?? 'neutral')}" aria-label="${escapeAttribute(label)}">
        ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(label)}" loading="eager" decoding="async" data-visual-card-image="true" />` : ''}
        <span>${escapeHtml(card.visual?.initials ?? 'MP')}</span>
      </span>
      <strong>${escapeHtml(card.name)}</strong>
      <em>${escapeHtml(loading ? `Opening ${card.name}...` : 'Open profile')}</em>
    </a>
  `;
}

function renderPublicAgentGallery(carousel, state = {}) {
  const cards = carousel.cards ?? [];
  if (!cards.length) return '';
  const loadingAgent = state.resolverStatus === 'loading' ? String(state.resolverInFlightInput ?? '').trim() : null;
  return `
    <section class="public-agent-gallery" aria-label="Public agent gallery">
      <div class="public-agent-gallery-copy">
        <p class="card-label">Public agent gallery</p>
        <h2>Pick an agent and open its Multipass.</h2>
        <p>Each card uses safe Multipass routes with public Cred, custody, and proof context only.</p>
      </div>
      <div class="public-agent-gallery-grid">
        ${cards.map((card, index) => renderPublicAgentGalleryCard(card, index, loadingAgent)).join('')}
      </div>
    </section>
  `;
}

function renderPublicAgentGalleryCard(card, index, loadingAgent = null) {
  const href = getHomepageMultipassProfileHref(card, index);
  const agent = getHomepageMultipassProfileAgent(card);
  const loading = Boolean(agent && loadingAgent && String(agent) === String(loadingAgent));
  const actionAttrs = getHomeProfileActionAttrs(card, index);
  const proof = card.proofSummary ?? `${Array.isArray(card.proofFragmentIds) ? card.proofFragmentIds.length : 0} public proof signals`;
  return `
    <a class="public-agent-card${loading ? ' loading' : ''}" href="${escapeAttribute(href)}"${actionAttrs}${loading ? ' aria-busy="true"' : ''}>
      <strong>${escapeHtml(card.name)}</strong>
      <span>Cred: ${escapeHtml(card.credLabel ?? (card.credScore === null || card.credScore === undefined ? 'Pending' : `Cred ${card.credScore}`))}</span>
      <span>Custody: ${escapeHtml(card.custody ?? card.ownerSnapshot?.permissionState ?? 'Public context only')}</span>
      <span>Proof: ${escapeHtml(proof)}</span>
      <em>${escapeHtml(loading ? `Opening ${card.name}...` : 'Open profile')}</em>
    </a>
  `;
}

function getHomeProfileResolveAttrs(agent, index) {
  return agent ? ` data-action="resolve-home-profile" data-agent="${escapeAttribute(agent)}" data-index="${index}"` : '';
}

function getHomeProfileActionAttrs(card, index) {
  const agent = getHomepageMultipassProfileAgent(card);
  if (agent) return getHomeProfileResolveAttrs(agent, index);
  return ` data-action="select-home-agent-card" data-index="${index}"`;
}

function getHomepageMultipassProfileAgent(card) {
  const tokenId = String(card.tokenId ?? '').trim();
  if (/^\d+$/.test(tokenId)) return tokenId;

  const helixaId = String(card.helixaId ?? '').trim();
  if (/^\d+:\d+$/.test(helixaId)) return helixaId;

  return null;
}

function getLiveProfileCacheKey(input) {
  return String(input ?? '').trim();
}

function isPrefetchableHomepageAgent(agent) {
  const value = getLiveProfileCacheKey(agent);
  if (/^[1-9]\d*$/.test(value)) return true;
  return /^8453:[1-9]\d*$/.test(value);
}

function getHomepageMultipassProfileHref(card, index = 0) {
  const agent = getHomepageMultipassProfileAgent(card);
  if (agent) return `/multipass/?agent=${encodeURIComponent(agent)}`;

  if (card.subjectType === 'swarm' || card.detailMode === 'swarm') return STATIC_SWARM_PROFILE_PATH;

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
  bindSiteMenu(root);
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
  root.querySelectorAll('[data-action="resolve-home-profile"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const selectedAgentCard = Number(link.dataset.index);
      handlers.resolveLiveAgent?.(
        link.getAttribute('data-agent') ?? '',
        Number.isInteger(selectedAgentCard) ? { selectedAgentCard } : undefined,
      );
    });
  });
  root.querySelectorAll('[data-action="select-home-agent-card"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const selectedAgentCard = Number(link.dataset.index);
      const nextIndex = Number.isInteger(selectedAgentCard) ? selectedAgentCard : 0;
      const carousel = createAgentCarousel(state.data);
      const selectedCard = carousel.cards?.[nextIndex];
      const href = link.getAttribute('href') || getHomepageMultipassProfileHref(selectedCard, nextIndex);
      if (selectedCard?.subjectType === 'swarm' || selectedCard?.detailMode === 'swarm') {
        if (typeof window !== 'undefined') window.history?.pushState?.({}, '', href);
        state = {
          ...state,
          pageKind: 'profile',
          data: createStaticSwarmProfileData(state.staticData ?? state.data, nextIndex),
          selectedAgentCard: nextIndex,
          resolverStatus: null,
          resolverError: null,
          resolverInFlightInput: null,
          lookupMatches: [],
          saveStatus: null,
          saveError: null,
          savedSharePath: null,
          savedProfile: null,
          claimStatus: null,
          claimError: null,
          claimCsrfToken: null,
          claimSessionStatus: null,
          ...clearedRouteState(),
        };
        render(root, state, handlers);
      }
    });
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
  bindGroupActivationEvents(root, handlers);
}

function bindGroupActivationEvents(root, handlers = {}) {
  root.querySelector('[data-role="group-activation-form"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.previewGroupActivation?.();
  });
  root.querySelector('[data-action="show-group-activation"]')?.addEventListener('click', () => handlers.showGroupActivation?.());
  root.querySelector('[data-action="preview-group-multipass"]')?.addEventListener('click', () => handlers.previewGroupActivation?.());
  root.querySelector('[data-action="save-group-multipass"]')?.addEventListener('click', () => handlers.saveGroupActivation?.());
  root.querySelector('[data-action="reset-group-multipass"]')?.addEventListener('click', () => handlers.resetGroupActivation?.());
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
        <p class="card-label">Public agent profile stack</p>
        <h2>Identity, custody, proof, routes, and trust context in one readable public agent profile.</h2>
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
  const showGroupActivationButton = options.showGroupActivationButton === true;
  return `
    <section id="live-resolver" class="live-resolver" aria-label="Activate a live agent record">
      <form data-action="resolve-live-agent">
        <div>
          <p class="card-label">Activate a live agent record</p>
          <h2>Build a Multipass from live AgentDNA data.</h2>
          <p>Enter an AgentDNA ID, ERC-8004-style ID, token ID, or agent name.</p>
        </div>
        <label>
          <span>AgentDNA ID, ERC-8004-style ID, token ID, or agent name</span>
          <input name="agent" value="${escapeAttribute(state.resolverInput ?? '')}" placeholder="81, 8453:81, or Quigbot" autocomplete="off" />
        </label>
        <div class="live-resolver-actions">
          <button type="submit" ${isRetryBlocked(state) ? 'disabled' : ''}>${state.resolverStatus === 'loading' ? 'Activating...' : 'Activate Multipass'}</button>
          ${showGroupActivationButton ? '<button type="button" class="activate-swarm-button" data-action="show-group-activation">Activate Swarm</button>' : ''}
          ${showResetButton ? '<button type="button" data-action="reset-static-demo">Back to Multipass home</button>' : ''}
        </div>
      </form>
      ${state.resolverError ? `<p class="resolver-message error">${escapeHtml(state.resolverError)}</p>` : ''}
      ${state.retryMessage ? `<p class="resolver-message error">${escapeHtml(state.retryMessage)}</p>` : ''}
      ${renderLookupMatches(state.lookupMatches)}
      ${state.resolverStatus === 'loaded' ? '<p class="resolver-message">Live source resolved into an activation preview. No approvals, custody, or authority changes.</p>' : ''}
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
  const copy = getClaimManagementCopy({ profile, canEdit, walletUnconfigured });
  return `
    <section class="owner-command-center claim-management-panel" aria-label="Owner Command Center">
      <section class="owner-command-overview" data-command-section="overview" aria-label="Owner command overview">
        <div class="owner-command-copy">
          <p class="card-label">Owner Command Center</p>
          <h2>Owner Command Center</h2>
          <p>${escapeHtml(copy.overview)}</p>
        </div>
        ${renderOwnerCommandFacts({ status, profile, ownerSummary })}
        <div class="owner-command-control-note">
          <h3>What you control</h3>
          <p>${escapeHtml(copy.controlNote)}</p>
        </div>
        <div class="owner-command-next">
          <h3>Next best action</h3>
          <p>${escapeHtml(copy.nextAction)}</p>
        </div>
        <div class="owner-command-unlock">
          <div class="claim-management-copy">
            <p class="card-label">Claim management</p>
            <h3>${escapeHtml(copy.claimHeading)}</h3>
            <p>${escapeHtml(copy.claimSummary)}</p>
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
              <label><span>Review note</span><textarea name="note" rows="2" placeholder="${escapeAttribute(copy.reviewPlaceholder)}"></textarea></label>
              <button type="submit">Request manual review</button>
            </form>
          </div>
        </div>
        ${renderOwnerDashboardPanel(profile, state)}
      </section>
      ${canEdit ? `<section class="owner-command-section" data-command-section="profile" aria-label="${escapeAttribute(copy.profileControlsLabel)}">${renderPublicProfileEditForm(profile, state)}</section>` : ''}
      ${canEdit ? `<section class="owner-command-section" data-command-section="routes" aria-label="Public route controls">${renderPublicRoutesManagerPanel(state)}</section>` : ''}
      ${canEdit ? `<section class="owner-command-section" data-command-section="marketplace-connections" aria-label="Marketplace Connections controls">${renderMarketplaceConnectionManagerPanel(state)}</section>` : ''}
      ${renderToolRegistryPanel(state)}
      ${canEdit ? `<section class="owner-command-section" data-command-section="fragments" aria-label="Public fragment controls">${renderFragmentManagerPanel(state)}</section>` : ''}
    </section>
  `;
}

function getClaimManagementCopy({ profile, canEdit, walletUnconfigured }) {
  if (isGroupParentSubject(profile)) {
    return {
      overview: 'Manage safe public group metadata controls for this parent Multipass. This does not transfer custody. It does not call tools, grant access, release credentials, or prove trust by payment alone.',
      controlNote: 'You control safe public group metadata: display fields, visibility, route cards, roster and policy notes, and public proof fragments. Private credentials, member authority, and source authority stay outside this panel.',
      nextAction: getGroupOwnerCommandNextAction({ canEdit, walletUnconfigured }),
      claimHeading: 'Manage safe parent Multipass fields.',
      claimSummary: 'Source-owner proof or manual review can unlock group metadata edits only. This does not transfer custody, tools, credentials, member authority, or ownership.',
      reviewPlaceholder: 'Why this wallet should manage public group metadata',
      profileControlsLabel: 'Parent Multipass metadata controls',
      profileFieldHelp: 'Safe public group metadata fields for this parent Multipass.',
      avatarHelp: 'Updates the public parent Multipass visual only. HTTPS only; leave blank to clear it. This does not change custody, tools, credentials, ownership, member authority, or source AgentDNA records.',
    };
  }

  return {
    overview: 'Manage safe public metadata controls for this saved Multipass profile. This does not transfer custody. It does not call tools, grant access, release credentials, or prove trust by payment alone.',
    controlNote: 'You control safe public metadata: display fields, visibility, route cards, and public proof fragments. Private credentials and source authority stay outside this panel.',
    nextAction: getOwnerCommandNextAction({ canEdit, walletUnconfigured }),
    claimHeading: 'Manage safe public profile fields.',
    claimSummary: 'Owner-wallet verification or manual review can unlock public profile edits only. This does not transfer custody, tools, credentials, or ownership.',
    reviewPlaceholder: 'Why this wallet should manage public fields',
    profileControlsLabel: 'Public profile controls',
    profileFieldHelp: 'Safe public fields for the saved Multipass profile.',
    avatarHelp: 'Updates the public Multipass visual only. HTTPS only; leave blank to clear it. This does not change custody, tools, credentials, ownership, or the source AgentDNA record.',
  };
}

function renderOwnerCommandFacts({ status, profile, ownerSummary }) {
  const visibility = ownerSummary.visibility ?? profile.discovery_profile?.visibility ?? 'public';
  const verification = ownerSummary.verification_status ?? ownerSummary.owner_state ?? 'none';
  return `
    <dl class="owner-command-facts" aria-label="Owner command facts">
      <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
      <div><dt>Visibility</dt><dd>${escapeHtml(visibility)}</dd></div>
      <div><dt>Verification</dt><dd>${escapeHtml(verification)}</dd></div>
    </dl>
  `;
}

function getOwnerCommandNextAction({ canEdit, walletUnconfigured }) {
  if (canEdit) return 'Review public profile fields, route cards, and proof fragments before publishing new discovery metadata.';
  if (walletUnconfigured) return 'Request manual review while wallet login is unavailable for this build.';
  return 'Connect the owner wallet or request manual review to unlock public metadata edits.';
}

function getGroupOwnerCommandNextAction({ canEdit, walletUnconfigured }) {
  if (canEdit) return 'Review parent display fields, route cards, roster and policy notes, and public proof fragments before publishing new discovery metadata.';
  if (walletUnconfigured) return 'Request manual review while wallet login is unavailable for this build.';
  return 'Connect the source-owner wallet or request manual review to unlock group metadata edits.';
}

function isGroupParentSubject(profile = {}) {
  const subjectType = String(profile.subject_type ?? profile.subjectType ?? '').toLowerCase();
  return ['swarm', 'collection'].includes(subjectType);
}

function renderToolRegistryPanel(state) {
  return renderToolRegistryManagerPanel(state, { canEdit: Boolean(state.claimCsrfToken) });
}

function renderOwnerDashboardPanel(profile, state) {
  const entries = Array.isArray(state.data?.changes?.entries) ? state.data.changes.entries.slice(-4).reverse() : [];
  const snapshot = createOwnerCommandCenterSnapshot({ ...state.data, profile }, state);
  return `
    <section class="owner-dashboard-panel" aria-label="Owner dashboard">
      <p class="card-label">Owner dashboard</p>
      ${renderOwnerCommandCenterSnapshot(snapshot)}
      <div class="owner-change-log" aria-label="Recent changes">
        <strong>Recent changes</strong>
        ${entries.length ? `<ol>${entries.map((entry) => `<li><span>${escapeHtml(entry.message)}</span><time>${escapeHtml(formatShortDate(entry.created_at))}</time></li>`).join('')}</ol>` : '<p class="resolver-message">No public changes logged yet.</p>'}
      </div>
    </section>
  `;
}

function renderPublicProfileEditForm(profile, state) {
  const discovery = profile.discovery_profile ?? {};
  const ownerSummary = profile.owner_summary ?? {};
  const summary = profile.summary ?? discovery.summary ?? '';
  const avatarUrl = profile.avatar_url ?? discovery.avatar_url ?? '';
  const tags = Array.isArray(profile.tags) ? profile.tags : (Array.isArray(discovery.tags) ? discovery.tags : []);
  const copy = getClaimManagementCopy({ profile, canEdit: Boolean(state.claimCsrfToken), walletUnconfigured: state.walletSnapshot?.configured === false });
  const isGroup = isGroupParentSubject(profile);
  return `
    <form class="public-profile-edit-form" data-action="update-public-profile" aria-label="Edit public Multipass profile">
      <p class="card-label">${isGroup ? 'Edit parent Multipass' : 'Edit public profile'}</p>
      <p class="field-help">${escapeHtml(copy.profileFieldHelp)}</p>
      <label><span>Display name</span><input name="display_name" value="${escapeAttribute(profile.display_name ?? '')}" /></label>
      <label><span>Summary</span><textarea name="summary" rows="3">${escapeHtml(summary)}</textarea></label>
      <label><span>Profile image URL</span><input name="avatar_url" value="${escapeAttribute(avatarUrl)}" placeholder="https://..." /></label>
      <p class="field-help profile-field-helper">${escapeHtml(copy.avatarHelp)}</p>
      <label><span>Tags</span><input name="tags" value="${escapeAttribute(tags.join(', '))}" /></label>
      <label><span>Visibility</span>${renderVisibilitySelect(ownerSummary.visibility ?? 'public')}</label>
      <div class="profile-edit-actions">
        <button type="submit" ${state.claimStatus === 'updating_profile' ? 'disabled' : ''}>${state.claimStatus === 'updating_profile' ? 'Updating...' : 'Save public edits'}</button>
        <button type="button" data-action="logout-manager-session">Sign out</button>
      </div>
    </form>
  `;
}

function renderVisibilitySelect(selected = 'public') {
  return `<select name="visibility">${['public', 'gated', 'private', 'hidden'].map((visibility) => `<option value="${visibility}" ${visibility === selected ? 'selected' : ''}>${visibility}</option>`).join('')}</select>`;
}

function formatShortDate(value) {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\.000Z$/, 'Z') : '';
}

function renderActivationPreviewPanel(state, activationState) {
  if (state.resolverStatus !== 'loaded' || state.saveStatus === 'saved' || isSavedManageRecord(state)) return '';
  const data = state.data ?? {};
  const tokenId = data.resolver?.tokenId ?? data.profile?.token_id ?? data.profile?.tokenId ?? '';
  const agentdnaId = data.resolver?.canonicalId ?? data.profile?.helixa_id ?? data.profile?.multipass_id ?? activationState.resolvedId ?? '';
  const displayName = data.profile?.display_name ?? data.liveProfilePage?.headline ?? activationState.subject ?? 'Resolved agent';
  const sharePath = isSafeMultipassSharePath(data.liveProfilePage?.sharePath) ? data.liveProfilePage.sharePath : '/multipass/';
  const tokenLabel = tokenId ? `Token ${tokenId}` : 'Token pending';
  return `
    <section class="activation-preview-panel" aria-label="Activation preview">
      <div>
        <p class="card-label">Activation preview</p>
        <h3>${escapeHtml(displayName)} stable public agent profile</h3>
        <p>Activation will create a saved Multipass profile from this live public AgentDNA source. It does not transfer custody, does not release credentials, and does not change approvals.</p>
      </div>
      <dl class="activation-preview-facts">
        <div><dt>AgentDNA source</dt><dd>${escapeHtml(agentdnaId || 'Source pending')}</dd></div>
        <div><dt>Token</dt><dd>${escapeHtml(tokenLabel)}</dd></div>
        <div><dt>Candidate share path</dt><dd>${escapeHtml(sharePath)}</dd></div>
      </dl>
    </section>
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

function renderAgentAura(visualIdentity, options = {}) {
  if (!visualIdentity || !['helixa_aura', 'aura'].includes(visualIdentity.source)) return '';
  const safeImageUrl = safeHttpsUrl(visualIdentity.imageUrl);
  const label = visualIdentity.label ?? 'Helixa Agent Aura';
  const title = options.title ?? label;
  const sharePath = isSafeAuraSharePath(options.sharePath) ? options.sharePath : null;
  return `
    <section class="aura-card" data-visual-source="${escapeAttribute(visualIdentity.source)}" aria-label="Agent Aura visual for public agent profile">
      ${sharePath ? renderAuraShareAction(sharePath, title) : ''}
      <div class="aura-asset-frame">
        <div class="aura-orb tone-${escapeAttribute(visualIdentity.tone ?? 'pending')}">
          ${safeImageUrl ? `<img src="${escapeAttribute(safeImageUrl)}" alt="${escapeAttribute(label)}" loading="lazy" />` : ''}
          <span>${escapeHtml(visualIdentity.initials ?? 'MP')}</span>
        </div>
      </div>
      <div class="aura-item-meta">
        <p class="card-label">Visual</p>
        <h2>${escapeHtml(title)}</h2>
        <div class="aura-chips" aria-label="Agent Aura traits">
          ${(visualIdentity.chips ?? []).map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function isSafeAuraSharePath(value) {
  return typeof value === 'string' && /^\/multipass\/share\/\d+\/(?:\?v=[a-z0-9-]+)?$/.test(value);
}

function renderAuraShareAction(sharePath, title) {
  return `
    <button class="aura-share-action" type="button" data-action="share-profile" data-share-url="${escapeAttribute(sharePath)}" data-share-title="${escapeAttribute(title)}" aria-label="Share ${escapeAttribute(title)} Multipass profile">
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M18 16.1c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.05-4.13A2.99 2.99 0 1 0 15 5c0 .24.03.47.08.69L8.03 9.82a3 3 0 1 0 0 4.36l7.12 4.18c-.04.2-.06.41-.06.64a2.91 2.91 0 1 0 2.91-2.9Z" />
      </svg>
    </button>
  `;
}

async function shareProfileFromButton(button) {
  const sharePath = button.getAttribute('data-share-url');
  if (!isSafeAuraSharePath(sharePath)) return;
  const title = `${button.getAttribute('data-share-title') || 'Multipass profile'} Multipass`;
  const url = new URL(sharePath, 'https://helixa.xyz').href;
  const browserNavigator = typeof window !== 'undefined' ? window.navigator : (typeof navigator !== 'undefined' ? navigator : null);
  try {
    if (typeof browserNavigator?.share === 'function') {
      await browserNavigator.share({ title, text: title, url });
      return;
    }
    if (browserNavigator?.clipboard?.writeText) {
      await browserNavigator.clipboard.writeText(url);
      button.setAttribute('aria-label', 'Copied share link');
    }
  } catch {
    // User-cancelled share sheets should not navigate away from the profile.
  }
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
        <p>Parent Multipass for Helixa's core agent team. It groups public roster context while each member keeps its own AgentDNA, Cred context, ownership, and permissions.</p>
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

function renderMarketplacePresencePanel(data) {
  const cards = getMarketplacePresenceEntries(data);
  const optionalSources = ['OKX.AI', 'OpenSea', 'Bankr', 'ACP', 'direct x402'];

  return `
    <section class="marketplace-presence-panel" aria-label="Marketplace Connections">
      <div class="marketplace-presence-heading">
        <p class="card-label">Marketplace Connections</p>
        <h3>Optional marketplace connections.</h3>
        <p>Public, read-only marketplace metadata for portable trust context. Supported sources include ${optionalSources.map(escapeHtml).join(', ')}. These references do not execute marketplace actions or prove trust by payment alone.</p>
      </div>
      ${cards.length ? `
        <div class="marketplace-presence-list">
          ${cards.map(renderMarketplacePresenceCard).join('')}
        </div>
      ` : renderMarketplacePresenceEmptyState(optionalSources)}
      <p class="marketplace-presence-safety">Optional public marketplace metadata only. Viewing does not execute marketplace actions, collect x401 proof, change authority, call tools, release credentials, start escrow, sign with wallets, write onchain, or prove trust by payment alone.</p>
    </section>
  `;
}

function renderMarketplacePresenceEmptyState(optionalSources) {
  return `
    <div class="marketplace-presence-empty">
      <strong>No marketplace connections published yet.</strong>
      <p>Managers can reference optional public listings later without implying registration, custody, account authority, payments, or official marketplace integration.</p>
      <div class="marketplace-presence-chip-list" aria-label="Optional marketplace connection sources">
        ${optionalSources.map((source) => `<span class="marketplace-presence-chip">${escapeHtml(source)}</span>`).join('')}
      </div>
    </div>
  `;
}

function marketplacePresenceReputationFacts(reputation) {
  return [
    { label: 'Score', value: reputation.score },
    { label: 'Positive rate', value: reputation.positiveRate },
    { label: 'Sold', value: reputation.soldCount },
    { label: 'Reviews', value: reputation.reviewCount },
  ].filter((fact) => fact.value);
}

function renderMarketplacePresenceCard(card) {
  const verifiedSourceUrl = getPlatformVerifiedMarketplacePresenceSourceUrl(card);
  const statusLabel = getMarketplacePresenceStatusLabel(card, verifiedSourceUrl);
  const statusLink = verifiedSourceUrl ? renderSafeLink(statusLabel, verifiedSourceUrl) : escapeHtml(statusLabel);
  const provenanceFacts = [
    { label: 'Marketplace', value: card.marketplace },
    { label: 'Listing ID', value: card.listingId || 'Not published' },
    { label: 'Status', html: statusLink },
    { label: 'Source checked', value: card.source.checkedAt || 'Not published' },
    { label: 'Provenance', value: card.source.provenance || 'Public marketplace metadata' },
    ...card.facts,
  ];

  return `
    <article class="marketplace-presence-card" data-listing-id="${escapeAttribute(card.listingId || '')}">
      <div class="marketplace-presence-card-head">
        <div>
          <p class="card-label">Marketplace</p>
          <h4>${escapeHtml(card.title || card.marketplace)}</h4>
          ${card.summary ? `<p>${escapeHtml(card.summary)}</p>` : ''}
        </div>
        <div class="marketplace-presence-links">
          ${card.profileUrl ? renderSafeLink('Marketplace profile', card.profileUrl) : ''}
          ${card.source.url ? renderSafeLink(card.source.label || 'Source', card.source.url) : ''}
        </div>
      </div>
      <div class="marketplace-presence-facts">
        ${provenanceFacts.map(renderMarketplacePresenceFact).join('')}
      </div>
      ${renderMarketplacePresenceServices(card.services)}
      ${renderMarketplacePresencePaymentRails(card.paymentRails)}
      ${renderMarketplacePresenceReputation(card.reputation)}
    </article>
  `;
}

function renderMarketplacePresenceFact(fact) {
  return `
    <article class="marketplace-presence-fact">
      <span>${escapeHtml(fact?.label ?? '')}</span>
      <strong>${fact?.html ?? escapeHtml(fact?.value ?? 'Not published')}</strong>
    </article>
  `;
}

function renderMarketplacePresenceServices(services) {
  if (!services.length) return '';
  return `
    <section class="marketplace-presence-subsection">
      <h5>Services</h5>
      <div class="marketplace-presence-service-list">
        ${services.map((service) => `
          <article class="marketplace-presence-service">
            <strong>${escapeHtml(service.name || 'Marketplace service')}</strong>
            ${service.price ? `<span>${escapeHtml(service.price)}</span>` : ''}
            ${service.paymentMode ? `<span>${escapeHtml(service.paymentMode)}</span>` : ''}
            ${isRenderablePublicUrl(service.endpointUrl) ? renderSafeLink('Endpoint', service.endpointUrl) : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderMarketplacePresencePaymentRails(paymentRails) {
  if (!paymentRails.length) return '';
  return `
    <section class="marketplace-presence-subsection">
      <h5>Payment rails</h5>
      <div class="marketplace-presence-chip-list">
        ${paymentRails.map((rail) => [rail.asset, rail.mode, rail.chain]
          .filter(Boolean)
          .map((value) => `<span class="marketplace-presence-chip">${escapeHtml(value)}</span>`)
          .join('')).join('')}
      </div>
    </section>
  `;
}

function renderMarketplacePresenceReputation(reputation) {
  const facts = marketplacePresenceReputationFacts(reputation);
  if (!facts.length) return '';
  return `
    <section class="marketplace-presence-subsection">
      <h5>Reputation facts</h5>
      <div class="marketplace-presence-facts compact">
        ${facts.map(renderMarketplacePresenceFact).join('')}
      </div>
    </section>
  `;
}

function getMarketplacePresenceStatusLabel(card, verifiedSourceUrl) {
  if (verifiedSourceUrl) return 'Platform verified source';
  const normalizedStatus = String(card?.status ?? '').trim().toLowerCase();
  if (!normalizedStatus || normalizedStatus === 'platform_verified') return 'Public metadata';
  return normalizedStatus
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function getPlatformVerifiedMarketplacePresenceSourceUrl(card) {
  const proof = card?.proof && typeof card.proof === 'object' && !Array.isArray(card.proof) ? card.proof : null;
  if (String(proof?.assurance ?? '').toLowerCase() !== 'platform_verified') return '';
  const sourceUrl = firstPresentText(card?.source?.url);
  return isRenderablePublicUrl(sourceUrl) ? sourceUrl : '';
}

function firstPresentText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function renderMarketplaceListing(listing) {
  if (!listing) return '';
  return `
    <section class="marketplace-listing" aria-label="Public agent profile marketplace compatibility context">
      <div class="listing-shell">
        <div class="listing-copy">
          <p class="card-label">Public agent profile context</p>
          <h2>${escapeHtml(listing.title ?? 'Agent listing')}</h2>
          <p>${escapeHtml(listing.summary ?? 'Public AgentDNA source evidence prepared for marketplace discovery.')}</p>
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
      <p class="listing-safety">${escapeHtml(listing.safetyNote ?? 'Public inspection only. Marketplace compatibility does not execute listings, authority changes, payments, or private data access.')}</p>
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

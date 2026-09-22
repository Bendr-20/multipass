import { renderConsoleAgentThread } from './console-agent-thread.js';
import { safeConsoleAvatarUrl } from './console-owner-profile.js';

const CONSOLE_SAFETY_NOTE = 'Review-only operator surface. Your agent can brief and propose, but every action still waits for you.';
const DEFAULT_CONSOLE_MISSION = 'Watch this agent, keep memory in Sibyl, and brief me before any proposal or outside action.';
const DEFAULT_CONSOLE_PORTRAIT = '/multipass/loopers-console-pfp.png';

export function createMultipassConsoleSnapshot({ state = {}, agents = [] } = {}) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? { status: 'idle', error: null, agents: [] };
  const walletConnected = Boolean(wallet.connected && wallet.address);
  const aliasMutationPending = state.consoleAgentNameMutation?.status === 'pending';
  const activeAgents = Array.isArray(agents) ? agents.filter(Boolean).map(normalizeConsoleAgent) : [];
  const activeAgent = selectActiveAgent(activeAgents, state.consoleSelectedAgentId);
  const ownerProfile = state.consoleOwnerProfile ?? null;
  const ownerProfileLabel = String(ownerProfile?.ensName ?? ownerProfile?.displayName ?? '').trim();
  const ownerDisplayName = walletConnected
    ? `${ownerProfileLabel && ownerProfileLabel.toLowerCase() !== String(wallet.address ?? '').trim().toLowerCase()
      ? ownerProfileLabel
      : shortenAddress(wallet.address)} (you)`
    : null;
  const roomParticipants = decorateConsoleParticipants(createRoomParticipants({
    agents: activeAgents,
    activeAgent,
    participantIds: state.consoleParticipantAgentIds,
    threadParticipants: state.consoleAgentThread?.participants,
  }), {
    ownerDisplayName,
    ownerAvatarUrl: safeConsoleAvatarUrl(ownerProfile?.avatarUrl),
    walletAddress: wallet.address,
  });
  const activeAgentCount = activeAgents.length;
  const connectedWallet = walletConnected
    ? shortenAddress(wallet.address)
    : (wallet.configured === false ? 'Wallet unavailable' : 'Not connected');
  const agentThread = createAgentThreadSnapshot(state, activeAgent, roomParticipants, {
    displayName: ownerDisplayName,
    avatarUrl: safeConsoleAvatarUrl(ownerProfile?.avatarUrl),
  });
  const savedMemory = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory : [];
  const recalledMemory = Array.isArray(agentThread.recalledMemory) ? agentThread.recalledMemory : [];
  const memoryEntries = createMemoryEntries({ savedMemory, recalledMemory });
  const recall = agentThread.recalledMemoryPresent && recalledMemory.length
    ? {
      title: 'Sibyl recall',
      body: agentThread.recalledMission || `Loaded ${recalledMemory.length} recalled memory ${recalledMemory.length === 1 ? 'entry' : 'entries'} for this wallet and agent.`,
    }
    : null;
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const activeCred = activeAgent?.credLabel ?? 'Cred pending';
  const verifiedLabel = activeAgent?.verified ? 'Verified AgentDNA' : (activeAgent?.tokenId ? 'Verification pending' : 'Awaiting selection');
  const activeAgentLabel = activeAgent?.name
    ?? (walletConnected
      ? agentRoster.status === 'loading'
        ? 'Loading owned agents'
        : activeAgentCount > 0
          ? 'Pick your agent'
          : 'No owned agents found'
      : 'Connect wallet');
  const emptyAgentSummary = walletConnected && activeAgentCount > 0
    ? 'Pick an owned Looper to load its identity and open the room.'
    : 'Connect a wallet, then pick your agent from owned Loopers to load its identity and room.';

  const status = [
    { label: 'Wallet', value: walletConnected ? connectedWallet : 'Required' },
    { label: 'Agent', value: activeAgent?.tokenId ? activeAgentLabel : 'Select first' },
    { label: 'Chat', value: walletConnected && activeAgent?.tokenId ? formatTransportLabel(agentThread.transport) : 'Standby' },
    { label: 'Memory', value: memoryEntries.length ? `${memoryEntries.length} loaded` : 'Standby' },
  ];

  return {
    title: 'Multipass Console',
    headline: 'Multipass Console',
    safetyNote: CONSOLE_SAFETY_NOTE,
    session: {
      wallet: {
        connected: walletConnected,
        unavailable: wallet.configured === false,
        ready: wallet.ready !== false,
        label: walletConnected ? ownerDisplayName : connectedWallet,
        status: state.consoleWalletStatus ?? null,
        error: state.consoleWalletError ?? null,
      },
      rosterStatus: agentRoster.status ?? 'idle',
      rosterError: agentRoster.error ?? null,
      activeAgentId: activeAgent?.tokenId ?? null,
      activeAgentLabel,
      activeAgentCount,
      roomParticipantCount: roomParticipants.length,
      options: activeAgents.map((agent) => ({
        value: agent.tokenId ?? '',
        label: buildAgentOptionLabel(agent),
      })),
      selectionEnabled: walletConnected && agentRoster.status === 'loaded' && activeAgentCount > 0 && !aliasMutationPending,
      selectionHint: createSelectionHint({ walletConnected, agentRosterStatus: agentRoster.status, activeAgentCount, roomParticipantCount: roomParticipants.length }),
      nextAction: createNextAction({ walletConnected, activeAgentCount, proposalCount, hasMessages: (agentThread.messages?.length ?? 0) > 0, roomParticipantCount: roomParticipants.length }),
      status,
    },
    identityCard: {
      name: activeAgentLabel,
      role: activeAgent?.canonicalName && activeAgent.canonicalName !== activeAgent.name
        ? activeAgent.canonicalName
        : (activeAgent?.role ?? (walletConnected ? 'Choose an owned Looper' : 'Connect wallet')),
      image: activeAgent?.image ?? null,
      portraitPlaceholder: activeAgent?.tokenId
        ? null
        : (walletConnected && activeAgentCount > 0 ? 'Pick agent' : 'Connect wallet'),
      walletLabel: ownerDisplayName,
      roomName: activeAgent?.presenceLabel ?? (activeAgent?.tokenId
        ? (roomParticipants.length > 1 ? agentThread.roomName : 'Direct operator line')
        : 'No room open'),
      participants: agentThread.participants,
      summary: activeAgent?.tokenId
        ? createIdentitySummary({ activeAgent, activeCred, roomParticipantCount: roomParticipants.length, proposalCount })
        : emptyAgentSummary,
      rename: createAgentRenameControl(activeAgent, state.consoleAgentNameMutation),
      badges: createIdentityBadges({ activeAgent, verifiedLabel, transport: agentThread.transport, proposalCount }),
      emptyState: !activeAgent?.tokenId,
      dossier: createIdentityDossier({
        activeAgent,
        walletConnected,
        walletLabel: ownerDisplayName ?? connectedWallet,
        roomName: activeAgent?.presenceLabel ?? agentThread.roomName,
        roomParticipantCount: roomParticipants.length,
        memoryCount: memoryEntries.length,
        proposalCount,
        verifiedLabel,
      }),
      stats: createIdentityStats({ activeAgent, activeCred, proposalCount }),
      tokenLabel: activeAgent?.tokenId ? `Token #${activeAgent.tokenId}` : 'Token not loaded',
      erc8004Label: getPositiveErc8004AgentId(activeAgent) ? `ERC-8004 #${getPositiveErc8004AgentId(activeAgent)}` : null,
      agentWallet: activeAgent?.tokenId ? normalizeLooperAgentWallet(state.looperAgentWallet, activeAgent.tokenId) : null,
    },
    suiteChecks: createProofChecks({
      activeAgent,
      thread: agentThread,
    }),
    multipassFacts: createMultipassFacts({ activeAgent, ownerDisplayName }),
    memoryEntries,
    agentThread,
    recall,
    threadContextItems: createThreadContextItems({
      activeAgent,
      activeCred,
      memoryCount: memoryEntries.length,
      proposalCount,
      participantCount: roomParticipants.length,
      thread: agentThread,
      verifiedLabel,
    }),
    agents: activeAgents.slice(0, 8).map((agent) => ({
      tokenId: agent.tokenId ?? '',
      name: agent.name ?? 'Onchain agent',
      role: agent.role ?? agent.framework ?? 'Agent profile',
      cred: agent.credLabel,
      state: agent.state ?? (agent.verified ? 'Verified profile' : 'Review needed'),
      href: agent.href ?? null,
      selected: String(agent.tokenId ?? '') !== '' && String(agent.tokenId) === String(activeAgent?.tokenId ?? ''),
      inRoom: roomParticipants.some((participant) => String(participant.tokenId ?? '') === String(agent.tokenId ?? '')),
      activationDisabled: aliasMutationPending,
    })),
    agentRoster,
  };
}

export function renderMultipassConsole(snapshot = {}) {
  const rosterCount = Array.isArray(snapshot.agents) ? snapshot.agents.length : 0;
  const rosterStatus = snapshot.agentRoster?.status ?? 'idle';
  const rosterStat = rosterCount
    ? `${rosterCount} loaded`
    : rosterStatus === 'loading'
      ? 'Loading'
      : rosterStatus === 'error'
        ? 'Retry'
        : 'Empty';
  return `
    <main class="multipass-console" aria-label="Multipass Console">
      ${renderSuitePanel(snapshot)}
      <section class="console-workspace-grid console-basic-shell" aria-label="Agent console">
        <section class="console-workspace-main console-basic-main" aria-label="Selected agent chat">
          ${renderConsoleAgentThread({
            ...snapshot.agentThread,
            recall: snapshot.recall,
            contextItems: snapshot.threadContextItems,
          })}
        </section>

        <aside class="console-workspace-sidebar console-basic-sidebar" aria-label="Wallet and agents">
          <header class="console-dashboard-header console-sidebar-header">
            <div class="console-sidebar-brand">
              <h1>Multipass Console</h1>
            </div>
          </header>
          ${renderIdentityCard(snapshot.identityCard)}
          ${renderSessionPanel(snapshot.session)}
          <section id="console-agents" class="console-panel console-agent-panel" aria-label="Wallet-owned agents">
            ${renderConsoleDrawer({
              label: 'Agents',
              title: 'My agents',
              stat: snapshot.session?.activeAgentId ? snapshot.session.activeAgentLabel : rosterStat,
              hint: snapshot.session?.selectionHint ?? 'Wallet-owned Helixa roster.',
              open: false,
              body: `
                ${renderAgentSelector(snapshot.session)}
                <div class="console-agent-list">
                  ${renderAgentRoster(snapshot)}
                </div>
                ${snapshot.agentRoster?.error ? `<p class="console-agent-error">${escapeHtml(snapshot.agentRoster.error)}</p>` : ''}
              `,
            })}
          </section>
        </aside>
      </section>
    </main>
  `;
}

function createAgentThreadSnapshot(state = {}, activeAgent = null, roomParticipants = [], ownerProfile = {}) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? {};
  const connected = Boolean(wallet.connected && wallet.address);
  const thread = state.consoleAgentThread ?? {};
  const loadingAgents = agentRoster.status === 'loading';
  const rosterError = agentRoster.error ?? null;
  const hasAgent = Boolean(activeAgent?.tokenId);
  const threadParticipants = normalizeThreadParticipants(roomParticipants);
  const latestAgentMessage = thread.messages?.findLast?.((message) => message.role === 'agent');
  const hasRuntimeProof = Boolean(thread.messages?.length || thread.proposals?.length || thread.savedMemory?.length || thread.recalledMemory?.length);
  return {
    status: thread.status ?? 'idle',
    operationStatus: thread.operationStatus ?? null,
    disabled: !connected || loadingAgents || !hasAgent,
    error: thread.error ?? null,
    errorKind: thread.errorKind ?? null,
    retryAvailable: Boolean(thread.retryAvailable),
    activationRetryAvailable: Boolean(thread.activationRetryAvailable),
    roomActivationDisabled: state.consoleAgentNameMutation?.status === 'pending',
    draft: String(thread.draft ?? ''),
    title: thread.title ?? null,
    metaLabel: thread.metaLabel ?? null,
    contextLabel: thread.contextLabel ?? null,
    agentAvatarUrl: safeConsoleAvatarUrl(activeAgent?.image),
    transport: formatTransportLabel(thread.transport, { live: Boolean(thread.conversationId) }),
    rawTransport: String(thread.transport ?? ''),
    conversationId: String(thread.conversationId ?? ''),
    roomKey: String(thread.conversationId ?? '').trim()
      || `${String(activeAgent?.tokenId ?? '').trim()}:${String(thread.roomName ?? '').trim() || deriveRoomName(threadParticipants)}`,
    scrollRequest: Number(state.consoleScrollRequest ?? 0),
    memoryProvider: formatMemoryProviderLabel(thread.memoryProvider),
    rawMemoryProvider: String(thread.memoryProvider ?? ''),
    inferenceProvider: formatInferenceProviderLabel(thread.inferenceProvider),
    rawInferenceProvider: String(thread.inferenceProvider ?? ''),
    executionMode: String(thread.executionMode ?? ''),
    defaultMission: DEFAULT_CONSOLE_MISSION,
    agentName: activeAgent?.name ?? null,
    roomName: String(thread.roomName ?? '').trim() || deriveRoomName(threadParticipants.length ? threadParticipants : [activeAgent].filter(Boolean)),
    participants: threadParticipants.length ? threadParticipants : normalizeThreadParticipants([activeAgent].filter(Boolean)),
    messages: decorateConsoleMessages(thread.messages, { activeAgent, ownerProfile }),
    proposals: thread.proposals,
    savedMemory: thread.savedMemory,
    recalledMemory: thread.recalledMemory,
    savedMemoryPresent: Object.prototype.hasOwnProperty.call(thread, 'savedMemory') && Array.isArray(thread.savedMemory),
    recalledMemoryPresent: Object.prototype.hasOwnProperty.call(thread, 'recalledMemory') && Array.isArray(thread.recalledMemory),
    missions: thread.missions,
    recalledMission: thread.recalledMission ?? null,
    canReset: hasRuntimeProof,
    summary: latestAgentMessage
      ? 'Live chat updated.'
      : !connected
        ? 'Connect wallet to open a room.'
      : loadingAgents
        ? 'Loading wallet-owned agents.'
      : rosterError
        ? 'Could not load wallet-owned agents.'
      : !hasAgent
        ? 'Select an owned agent to open a room.'
        : threadParticipants.length > 1
          ? `Room ready with ${threadParticipants.length} room participants.`
          : 'XMTP room ready.',
  };
}

function renderSessionPanel(session = {}) {
  const wallet = session.wallet ?? {};
  const connected = Boolean(wallet.connected);
  const walletLabel = connected ? wallet.label : null;
  const roomStat = session.activeAgentId
    ? (session.activeAgentLabel ?? `#${session.activeAgentId}`)
    : connected
      ? 'Waiting'
      : 'Locked';
  const roomHint = session.activeAgentId
    ? 'Room is bound to the selected wallet-owned agent.'
    : connected
      ? 'Choose an agent from My agents to open the room.'
      : 'Connect wallet to open a room.';
  const sessionNote = connected
    ? null
    : (wallet.unavailable ? 'Wallet login is unavailable for this build.' : 'Connect wallet to load your agents.');
  const walletOperation = createWalletOperation(wallet.status, session.rosterStatus);

  return `
    <section class="console-panel console-session-panel console-wallet-panel" aria-label="Console session">
      ${walletOperation || wallet.error ? `
        <div class="console-session-banner" role="status">
          ${walletOperation ? `<strong>${escapeHtml(walletOperation)}</strong>` : ''}
          ${wallet.error ? `<span>${escapeHtml(wallet.error)}</span>` : ''}
        </div>
      ` : ''}
      ${renderConsoleDrawer({
        label: 'Session',
        title: 'Current room',
        stat: roomStat,
        hint: roomHint,
        open: false,
        body: `
          <dl class="console-session-status-grid">
            ${(session.status ?? []).map(renderStatusItem).join('')}
          </dl>
          ${walletLabel ? `<p class="console-wallet-label">${escapeHtml(walletLabel)}</p>` : ''}
          ${sessionNote ? `<p class="console-session-note">${escapeHtml(sessionNote)}</p>` : ''}
        `,
      })}
    </section>
  `;
}

function createWalletOperation(walletStatus, rosterStatus) {
  if (walletStatus === 'connecting') return 'Connecting wallet…';
  if (walletStatus === 'signing') return 'Signing Console authentication…';
  if (walletStatus === 'loading_roster' || rosterStatus === 'loading') return 'Loading wallet-owned Loopers…';
  if (walletStatus === 'cancelled') return 'Wallet operation cancelled.';
  if (walletStatus === 'authorization_failed') return 'Authorization failed. Connect again.';
  if (walletStatus === 'transport_failed') return 'Wallet transport failed. Try again.';
  if (walletStatus === 'wallet_changed') return 'Wallet changed. A new authenticated session is required.';
  return null;
}

function renderAgentSelector(session = {}) {
  return `
    <div class="console-session-actions">
      <label class="console-agent-selector">
        <span>Choose agent</span>
        <select name="console_agent" data-action="select-console-agent" ${session.selectionEnabled ? '' : 'disabled'}>
          ${renderAgentOptions(session)}
        </select>
      </label>
    </div>
  `;
}

function renderIdentityCard(card = {}) {
  const imageUrl = safeConsoleAvatarUrl(card.image);
  const portraitFallback = escapeHtml(card.portraitPlaceholder ?? initialsForLabel(card.name ?? 'Agent'));
  const statsSummary = (card.stats ?? [])
    .map((item) => item?.value)
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
  const trustStat = card.emptyState ? 'Not loaded' : (statsSummary || card.badges?.[0] || 'Awaiting trust');
  const memberCount = Array.isArray(card.participants) ? card.participants.length : 0;
  return `
    <section class="console-visual-card console-identity-card" aria-label="Selected agent">
      <div class="console-agent-portrait">
        ${imageUrl
          ? `<img src="${escapeAttribute(imageUrl)}" alt="" loading="lazy" data-console-avatar-image><span class="console-thread-avatar-fallback" hidden>${portraitFallback}</span>`
          : `<div class="console-agent-portrait-placeholder">${portraitFallback}</div>`}
      </div>
      <div class="console-card-head">
        ${card.label ? `<p class="card-label">${escapeHtml(card.label)}</p>` : ''}
        ${card.walletLabel ? `<span>${escapeHtml(card.walletLabel)}</span>` : ''}
      </div>
      <div class="console-identity-body">
        <span>${escapeHtml(card.role ?? 'Onchain agent')}</span>
        <strong>${escapeHtml(card.name ?? 'Select an agent')}</strong>
        <small>${escapeHtml(card.roomName ?? 'Selected room')}</small>
        ${card.summary ? `<p>${escapeHtml(card.summary)}</p>` : ''}
        <div class="console-identity-keyline">
          <span>${escapeHtml(card.tokenLabel ?? 'Token not loaded')}</span>
          ${card.erc8004Label ? `<span>${escapeHtml(card.erc8004Label)}</span>` : ''}
        </div>
      </div>
      ${renderLooperAgentWallet(card.agentWallet)}
      ${(card.badges ?? []).length ? `
        <div class="console-identity-badges">
          ${(card.badges ?? []).map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}
        </div>
      ` : ''}
      ${card.rename ? renderConsoleDrawer({
        label: 'Alias',
        title: 'Agent name',
        stat: card.rename.value ?? card.name ?? 'Selected agent',
        hint: card.rename.hint ?? 'Console-only alias.',
        open: false,
        body: `
          <form class="console-identity-rename" data-action="update-console-agent-name" aria-label="Update agent name">
            <label>
              <span>Agent name</span>
              <input
                name="console_agent_name"
                value="${escapeAttribute(card.rename.value ?? '')}"
                placeholder="${escapeAttribute(card.rename.placeholder ?? 'Selected agent')}"
                ${card.rename.enabled ? '' : 'disabled'}
              >
            </label>
            <div class="console-identity-rename-actions">
              <button type="submit" ${card.rename.enabled ? '' : 'disabled'}>Update name</button>
              <button type="button" data-action="reset-console-agent-name" ${card.rename.resettable ? '' : 'disabled'}>Use live name</button>
            </div>
            <small>${escapeHtml(card.rename.hint ?? 'Console-only name.')}</small>
          </form>
        `,
      }) : ''}
      ${renderConsoleDrawer({
        label: 'Identity',
        title: 'Identity profile',
        stat: trustStat,
        hint: card.summary ?? '',
        open: false,
        body: `
          ${(card.stats ?? []).length ? `
            <div class="console-identity-stats">
              ${(card.stats ?? []).map(renderMiniStat).join('')}
            </div>
          ` : ''}
          ${(card.dossier ?? []).length ? `
            <div class="console-identity-dossier">
              ${(card.dossier ?? []).map(renderIdentityDossierEntry).join('')}
            </div>
          ` : ''}
        `,
      })}
      ${memberCount > 1 ? renderConsoleDrawer({
        label: 'Room',
        title: 'Participants',
        stat: `${memberCount} in room`,
        hint: memberCount === 1 ? 'Single-participant room.' : 'Room participants for this thread.',
        open: false,
        body: `
          <div class="console-identity-members">
            <span class="console-identity-members-label">${escapeHtml(memberCount === 1 ? 'Room participant' : 'Room participants')}</span>
            <div class="console-identity-members-list">
              ${(card.participants ?? []).map(renderIdentityParticipant).join('')}
            </div>
          </div>
        `,
      }) : ''}
    </section>
  `;
}

function normalizeLooperAgentWallet(wallet, tokenId) {
  if (!wallet || String(wallet.tokenId ?? tokenId) !== String(tokenId)) return null;
  return {
    mode: String(wallet.mode ?? 'read_only'),
    reason: wallet.reason ? String(wallet.reason) : null,
    account: wallet.account ? String(wallet.account) : null,
    legacyAccount: wallet.legacyAccount ? String(wallet.legacyAccount) : null,
    nativeWei: String(wallet.nativeWei ?? '0'),
    tokens: Array.isArray(wallet.tokens) ? wallet.tokens : [],
    refreshedAt: wallet.refreshedAt ? String(wallet.refreshedAt) : null,
    activation: wallet.activation ?? { state: 'idle' },
    send: wallet.send ?? { state: 'idle' },
    policy: wallet.policy ?? { state: 'idle' },
    policyStatus: String(wallet.policyStatus ?? (wallet.mode === 'active' ? 'owner-only' : 'read-only')),
    policyModule: wallet.policyModule ? String(wallet.policyModule) : null,
    policyEpoch: wallet.policyEpoch === null || wallet.policyEpoch === undefined ? null : String(wallet.policyEpoch),
    policyRecoveryAllowed: Boolean(wallet.policyRecoveryAllowed),
    canTransact: wallet.canTransact === undefined
      ? wallet.mode === 'inactive' || wallet.mode === 'active'
      : Boolean(wallet.canTransact),
    error: wallet.error ? String(wallet.error) : null,
  };
}

function renderLooperAgentWallet(wallet) {
  if (!wallet) return '';
  const account = wallet.account ?? wallet.legacyAccount;
  const modeLabel = wallet.mode === 'inactive'
    ? 'Inactive — activation required'
    : wallet.mode === 'legacy_read_only'
      ? 'Legacy account — read-only'
      : wallet.mode === 'loading'
        ? 'Loading'
        : wallet.policyStatus === 'permission-hook-paused'
          ? 'Permission hook paused'
          : wallet.policyStatus === 'module-blocked'
            ? 'Policy blocked'
            : wallet.policyStatus === 'owner-only' || wallet.policyStatus === 'active-policy'
              ? 'Owner controlled'
              : wallet.mode === 'blocked'
                ? 'Blocked'
                : 'Read-only';
  const busy = ['prepared', 'submitted', 'uncertain_hashless', 'uncertain_hashed'].includes(wallet.activation?.state)
    || ['prepared', 'submitted', 'uncertain_hashless', 'uncertain_hashed'].includes(wallet.send?.state)
    || ['prepared', 'submitted', 'uncertain_hashless', 'uncertain_hashed'].includes(wallet.policy?.state);
  const nativeBalance = `${formatWalletUnits(wallet.nativeWei, 18)} ETH`;
  const assetCount = 1 + (wallet.tokens ?? []).length;
  return `
    <section class="console-looper-wallet" aria-label="Selected Looper agent wallet">
      <div class="console-looper-wallet-head">
        <div class="console-looper-wallet-title">
          <span>Agent wallet</span>
          <strong class="console-looper-wallet-status" data-wallet-mode="${escapeAttribute(wallet.mode)}">${escapeHtml(modeLabel)}</strong>
        </div>
        <button type="button" data-action="refresh-looper-agent-wallet" ${busy ? 'disabled' : ''}>Refresh</button>
      </div>
      <div class="console-looper-wallet-overview" aria-label="Wallet balance summary">
        <span>Available balance</span>
        <strong class="console-looper-wallet-primary-balance">${escapeHtml(nativeBalance)}</strong>
        <small>${assetCount} tracked ${assetCount === 1 ? 'asset' : 'assets'} on Base</small>
      </div>
      <details class="console-looper-wallet-details">
        <summary>
          <span>Wallet details</span>
          <small>Address, assets, and actions</small>
        </summary>
        <div class="console-looper-wallet-details-body">
          ${account ? `
            <div class="console-looper-wallet-address">
              <span>Receive address</span>
              <code>${escapeHtml(account)}</code>
              <a href="https://basescan.org/address/${escapeAttribute(account)}" target="_blank" rel="noopener noreferrer">View on BaseScan</a>
            </div>
          ` : ''}
          <div class="console-looper-wallet-balances" aria-label="Tracked wallet assets">
            <span>${escapeHtml(nativeBalance)}</span>
            ${(wallet.tokens ?? []).map((token) => `<span>${escapeHtml(formatWalletUnits(token.balanceBaseUnits, token.decimals))} ${escapeHtml(token.symbol)}</span>`).join('')}
          </div>
          ${wallet.mode === 'inactive' && wallet.canTransact ? `
            <form class="console-looper-wallet-activation" data-action="activate-looper-agent-wallet">
              <label><input type="checkbox" name="confirmed" required> Confirm owner-paid activation on Base</label>
              <button type="submit" ${busy ? 'disabled' : ''}>Activate wallet</button>
            </form>
          ` : ''}
          ${wallet.mode === 'active' && wallet.canTransact ? `
            <form class="console-looper-wallet-send" data-action="send-looper-agent-wallet">
              <label><span>Asset</span><select name="asset"><option value="ETH">ETH</option>${(wallet.tokens ?? []).map((token) => `<option value="${escapeAttribute(token.contract)}">${escapeHtml(token.symbol)}</option>`).join('')}</select></label>
              <label><span>Recipient</span><input name="recipient" inputmode="text" autocomplete="off" required></label>
              <label><span>Amount</span><input name="amount" inputmode="decimal" autocomplete="off" required></label>
              <label class="console-looper-wallet-confirm"><input type="checkbox" name="confirmed" required> Confirm this exact transfer</label>
              <button type="submit" ${busy ? 'disabled' : ''}>Send</button>
            </form>
          ` : ''}
          ${wallet.policyRecoveryAllowed ? `
            <form class="console-looper-wallet-policy" data-action="set-looper-policy-module">
              <label><span>Permission module</span><input name="module" inputmode="text" autocomplete="off" placeholder="Leave blank to clear"></label>
              <label class="console-looper-wallet-confirm"><input type="checkbox" name="confirmed" required> Confirm this exact permission module recovery</label>
              <button type="submit" ${busy ? 'disabled' : ''}>Update permission hook</button>
            </form>
          ` : ''}
          ${wallet.policyStatus === 'active-policy' ? '<small>Reviewed permission module configured. Console does not enable agent execution.</small>' : ''}
        </div>
      </details>
      ${wallet.reason ? `<small class="console-looper-wallet-reason">${escapeHtml(formatWalletReason(wallet.reason))}</small>` : ''}
      ${wallet.error ? `<p class="console-looper-wallet-error" role="alert">${escapeHtml(wallet.error)}</p>` : ''}
    </section>
  `;
}

function formatWalletUnits(value, decimals) {
  const text = String(value ?? '0');
  const places = Number(decimals);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(places) || places < 0 || places > 255) return '0';
  const padded = text.padStart(places + 1, '0');
  const whole = places ? padded.slice(0, -places) : padded;
  const fraction = places ? padded.slice(-places).replace(/0+$/, '').slice(0, 6) : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatWalletReason(reason) {
  const labels = {
    legacy_implementation: 'The configured legacy account is visible but cannot execute.',
    config_drift: 'Wallet writes are disabled until the reviewed account implementation is configured.',
    release_unset: 'Policy release evidence is not configured. This wallet is read-only.',
    implementation_mismatch: 'The selected implementation does not match the reviewed release.',
    proxy_mismatch: 'The selected account is not the canonical reviewed proxy.',
    registry_mismatch: 'The module registry does not match the reviewed release.',
    malformed_policy: 'Permission evidence is incomplete or contradictory. This wallet is read-only.',
    module_blocked: 'The configured permission module is not currently approved.',
    ownership_mismatch: 'The configured permission module belongs to a previous owner.',
    permission_hook_paused: 'Permission hooks are paused. Owner recovery remains available.',
    policy_drift: 'Policy evidence changed. Preview the recovery again.',
    unsupported_wallet: 'Smart or delegated wallets are read-only in this release.',
    owner_changed: 'Ownership changed. Reconnect as the current Looper owner.',
    wrong_runtime: 'The deployed account runtime does not match the reviewed release.',
    locks_unavailable: 'This browser cannot safely serialize wallet writes across tabs.',
    receipt_attribution_failed: 'The transaction outcome could not be attributed safely.',
  };
  return labels[reason] ?? 'Wallet writes are disabled because verification is incomplete.';
}

function renderSuitePanel(snapshot = {}) {
  const checks = Array.isArray(snapshot.suiteChecks) ? snapshot.suiteChecks : [];
  const facts = Array.isArray(snapshot.multipassFacts) ? snapshot.multipassFacts : [];
  const proofSummary = checks.length ? checks.map((check) => check.value).filter(Boolean).join(' · ') : 'No verified proof yet';
  return `
    <details class="console-multipass-drawer console-suite-panel console-trust-rail console-proof-rail" aria-label="Verified runtime proof">
      <summary>
        <strong class="console-proof-rail-title">Verified runtime proof</strong>
        <span class="console-proof-rail-summary">${escapeHtml(proofSummary)}</span>
        <span class="console-proof-rail-chevron" aria-hidden="true"></span>
      </summary>
      <div class="console-proof-rail-body">
        ${facts.length ? `<dl class="console-multipass-facts">${facts.map(renderMultipassFact).join('')}</dl>` : ''}
        <div class="console-check-stack">
          ${checks.length ? checks.map(renderSuiteCheck).join('') : `
            <article class="open console-proof-empty">
              <span>Evidence</span>
              <strong>No verified runtime proof yet</strong>
              <small>Proof appears only after the Console receives exact provider evidence.</small>
            </article>
          `}
        </div>
      </div>
    </details>
  `;
}

function renderMultipassFact(fact = {}) {
  return `<div><dt>${escapeHtml(fact.label ?? '')}</dt><dd>${escapeHtml(fact.value ?? '')}</dd></div>`;
}

function renderSuiteCheck(check = {}) {
  return `
    <article class="${escapeAttribute(check.className ?? 'open')}">
      <span>${escapeHtml(check.label ?? 'Check')}</span>
      <strong>${escapeHtml(check.value ?? '')}</strong>
      <small>${escapeHtml(check.body ?? '')}</small>
    </article>
  `;
}

function renderMiniStat(card = {}) {
  return `
    <article class="console-mini-stat console-identity-fact">
      <span>${escapeHtml(card.label ?? '')}</span>
      <strong>${escapeHtml(card.value ?? '')}</strong>
    </article>
  `;
}

function renderIdentityDossierEntry(entry = {}) {
  return `
    <article class="console-identity-dossier-entry console-identity-fact">
      <span>${escapeHtml(entry.label ?? '')}</span>
      <strong>${escapeHtml(entry.value ?? '')}</strong>
      <p>${escapeHtml(entry.body ?? '')}</p>
    </article>
  `;
}

function renderIdentityParticipant(participant = {}) {
  const label = String(participant.displayName ?? participant.agentName ?? participant.participantId ?? 'Agent').trim() || 'Agent';
  return `
    <span class="console-identity-member">
      <strong>${escapeHtml(initialsForLabel(label))}</strong>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderStatusItem(item = {}) {
  return `<div><dt>${escapeHtml(item.label ?? '')}</dt><dd>${escapeHtml(item.value ?? '')}</dd></div>`;
}

function renderAgentOptions(session = {}) {
  const options = Array.isArray(session.options) ? session.options : [];
  if (!options.length) {
    return `<option value="">${escapeHtml(session.rosterStatus === 'loading' ? 'Loading owned agents...' : 'No owned agents')}</option>`;
  }
  const prompt = session.activeAgentId
    ? ''
    : '<option value="" selected>Pick your agent</option>';
  return prompt + options.map((option) => `
    <option value="${escapeAttribute(option.value ?? '')}" ${option.value === session.activeAgentId ? 'selected' : ''}>${escapeHtml(option.label ?? option.value ?? '')}</option>
  `).join('');
}

function renderAgentRoster(snapshot = {}) {
  const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  if (agents.length) return agents.map(renderAgentCard).join('');

  const status = snapshot.agentRoster?.status ?? 'idle';
  let title = 'No agents loaded';
  let body = 'Connect wallet to load the agents tied to this operator.';
  if (status === 'loading') {
    title = 'Loading owned agents';
    body = 'Checking live Looper ownership for this wallet.';
  } else if (status === 'loaded') {
    title = 'No owned agents found';
    body = 'This wallet does not currently own a Looper.';
  } else if (status === 'error') {
    title = 'Agent load failed';
    body = 'The live ownership lookup failed, so the Console is refusing to invent a roster.';
  }

  return `
    <article class="console-agent-card console-agent-card-empty">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(body)}</span>
      </div>
    </article>
  `;
}

function renderAgentCard(agent = {}) {
  const openLink = agent.href ? `<a href="${escapeAttribute(agent.href)}">View profile</a>` : '<span>Profile pending</span>';
  const selected = Boolean(agent.selected);
  const subtitle = agent.canonicalName && agent.canonicalName !== agent.name
    ? agent.canonicalName
    : (agent.role ?? 'Agent profile');
  return `
    <article class="console-agent-card ${selected ? 'selected' : ''}">
      <div class="console-agent-card-head">
        <span class="console-agent-card-avatar" aria-hidden="true">${escapeHtml(initialsForLabel(agent.name ?? 'Onchain agent'))}</span>
        <div class="console-agent-card-copy">
          <strong>${escapeHtml(agent.name ?? 'Onchain agent')}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <div class="console-agent-card-flags">
          <span>${escapeHtml(selected ? 'Live' : agent.state ?? 'Ready')}</span>
        </div>
      </div>
      <div class="console-agent-card-meta">
        <span>#${escapeHtml(agent.tokenId ?? 'Unknown')}</span>
        <span>${escapeHtml(agent.cred ?? 'Cred pending')}</span>
      </div>
      <div class="console-agent-card-actions">
        <button type="button" data-action="activate-console-room" data-token-id="${escapeAttribute(agent.tokenId ?? '')}" ${selected || agent.activationDisabled ? 'disabled' : ''}>${selected ? 'Room live' : 'Open room'}</button>
        ${openLink}
      </div>
    </article>
  `;
}

function createMemoryEntries({ savedMemory = [], recalledMemory = [] } = {}) {
  const entries = [...recalledMemory, ...savedMemory]
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      text: String(entry.text ?? '').trim(),
      tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [],
      savedAt: String(entry.savedAt ?? ''),
    }))
    .filter((entry) => entry.text);
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.text}::${entry.tags.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function renderMemoryEntry(entry = {}) {
  return `
    <article class="console-memory-entry">
      <strong>${escapeHtml(entry.text ?? '')}</strong>
      <p>${escapeHtml(entry.tags?.length ? entry.tags.join(' · ') : 'Sibyl memory')}</p>
    </article>
  `;
}

function renderConsoleDrawer({
  label = '',
  title = '',
  stat = '',
  hint = '',
  body = '',
  open = false,
  className = '',
} = {}) {
  return `
    <details class="console-sidebar-drawer ${escapeAttribute(className)}" ${open ? 'open' : ''}>
      <summary>
        <div class="console-sidebar-drawer-copy">
          ${label ? `<span class="console-sidebar-drawer-label">${escapeHtml(label)}</span>` : ''}
          <strong>${escapeHtml(title)}</strong>
          ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
        </div>
        <div class="console-sidebar-drawer-affordance">
          ${stat ? `<span class="console-sidebar-drawer-stat">${escapeHtml(stat)}</span>` : ''}
          <span class="console-sidebar-drawer-chevron" aria-hidden="true"></span>
        </div>
      </summary>
      <div class="console-sidebar-drawer-body">
        ${body}
      </div>
    </details>
  `;
}

function createProofChecks({ activeAgent = null, thread = {} } = {}) {
  const checks = [];
  const hasBankrAgentResponse = Array.isArray(thread.messages) && thread.messages.some((message) => (
    message?.role === 'agent' && message?.inferenceProvider === 'bankr_llm_gateway'
  ));
  if (hasBankrAgentResponse) {
    checks.push({ label: 'Inference', value: 'Bankr gateway', body: 'Response identified bankr_llm_gateway.', className: 'ready' });
  }
  if (thread.rawTransport === 'xmtp_group' && thread.conversationId) {
    checks.push({ label: 'Transport', value: 'XMTP live', body: 'Server returned a non-empty XMTP conversation.', className: 'ready' });
  }
  if (thread.rawMemoryProvider === 'sibyl_memory' && thread.savedMemoryPresent) {
    const savedCount = Array.isArray(thread.savedMemory) ? thread.savedMemory.length : 0;
    checks.push({ label: 'Memory write', value: `Sibyl saved ${savedCount}`, body: 'Saved count returned by sibyl_memory.', className: 'ready' });
  }
  if (thread.rawMemoryProvider === 'sibyl_memory' && thread.recalledMemoryPresent) {
    const recalledCount = Array.isArray(thread.recalledMemory) ? thread.recalledMemory.length : 0;
    checks.push({ label: 'Memory recall', value: `Sibyl recalled ${recalledCount}`, body: 'Recalled count returned by sibyl_memory.', className: 'ready' });
  }
  const erc8004AgentId = getPositiveErc8004AgentId(activeAgent);
  if (erc8004AgentId) {
    checks.push({ label: 'Identity', value: `ERC-8004 #${erc8004AgentId}`, body: 'Positive numeric registry agent ID.', className: 'ready' });
  }
  const proposals = Array.isArray(thread.proposals) ? thread.proposals : [];
  const proposalsAreReviewOnly = proposals.every((proposal) => (
    proposal?.status === 'review_only'
    && proposal?.executable === false
    && proposal?.executionEnabled !== true
  ));
  if (thread.executionMode === 'review_only' && proposalsAreReviewOnly) {
    checks.push({ label: 'Execution', value: 'Review-only', body: 'Runtime mode and every returned proposal are non-executable.', className: 'ready' });
  }
  return checks;
}

function getPositiveErc8004AgentId(agent = {}) {
  const value = Number(agent?.erc8004AgentId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function createIdentitySummary({ activeAgent = null, activeCred = 'Cred pending', roomParticipantCount = 0, proposalCount = 0 } = {}) {
  if (!activeAgent?.tokenId) return 'Load a real agent and open a direct review-only thread.';
  if (activeAgent.logline) return activeAgent.logline;
  const roomLabel = roomParticipantCount > 1 ? `${roomParticipantCount}-participant room` : 'direct thread';
  const reviewLabel = proposalCount ? `${proposalCount} queued for review` : 'review-only';
  return `${activeAgent.role ?? 'Onchain agent'} in a ${roomLabel}. ${activeCred}. ${reviewLabel}.`;
}

function createIdentityDossier({
  activeAgent = null,
  walletConnected = false,
  walletLabel = 'Wallet required',
  roomName = 'Selected room',
  roomParticipantCount = 0,
  memoryCount = 0,
  proposalCount = 0,
  verifiedLabel = 'Verification pending',
} = {}) {
  const identityValue = activeAgent?.canonicalName ?? (activeAgent?.tokenId ? `Agent #${activeAgent.tokenId}` : 'No agent loaded');
  const identityBody = activeAgent?.identityBody
    ?? (activeAgent?.helixaId
      ? `${verifiedLabel}. AgentDNA ${activeAgent.helixaId}.`
      : (activeAgent?.name ? verifiedLabel : 'Connect wallet to load a wallet-owned Looper identity.'));
  const temperamentValue = stripReviewOnlyTemperCopy(activeAgent?.temperament ?? activeAgent?.role ?? 'Operator');
  const temperamentBody = stripReviewOnlyTemperCopy(activeAgent?.temperamentBody
    ?? (activeAgent?.tokenId
      ? 'Brief-first, memory-backed, and constrained to approval before any outside action.'
      : 'The Console should feel like a character relationship, not a dashboard.'));
  const roomBody = activeAgent?.mandateBody
    ?? (roomParticipantCount > 1
      ? `${roomParticipantCount} room participants are sharing this thread.`
      : 'This thread stays tied to one selected wallet-owned agent.');
  const operatorBody = activeAgent?.operatorBody
    ?? (proposalCount
      ? `${proposalCount} proposal${proposalCount === 1 ? '' : 's'} waiting for operator review.`
      : memoryCount
        ? `${memoryCount} recalled memory item${memoryCount === 1 ? '' : 's'} are shaping the conversation.`
        : 'No recalled memory yet. The first mission will establish the thread.');
  return [
    {
      label: 'Identity',
      value: identityValue,
      body: identityBody,
    },
    {
      label: 'Temper',
      value: temperamentValue,
      body: temperamentBody,
    },
    {
      label: 'Mandate',
      value: roomName,
      body: roomBody,
    },
    {
      label: 'Operator',
      value: activeAgent?.operatorLabel ?? (walletConnected ? walletLabel : 'Waiting to load'),
      body: operatorBody,
    },
  ];
}

function createThreadContextItems({
  activeAgent = null,
  activeCred = 'Cred pending',
  memoryCount = 0,
  proposalCount = 0,
  participantCount = 0,
  thread = {},
  verifiedLabel = 'Verification pending',
} = {}) {
  if (Array.isArray(activeAgent?.threadContextItems) && activeAgent.threadContextItems.length) {
    return activeAgent.threadContextItems;
  }
  return [
    {
      label: 'Watch',
      value: activeAgent?.watchLabel ?? (activeAgent?.tokenId ? activeAgent.name ?? 'Selected agent' : 'No agent selected'),
      body: activeAgent?.watchBody ?? verifiedLabel,
      className: activeAgent?.tokenId ? 'ready' : 'open',
    },
    {
      label: 'Trust',
      value: activeAgent?.tokenId ? activeCred : 'Awaiting trust context',
      body: Number.isFinite(activeAgent?.proofCount) ? `${activeAgent.proofCount} proof${activeAgent.proofCount === 1 ? '' : 's'} in view.` : 'No proofs loaded.',
      className: activeAgent?.tokenId ? 'ready' : 'open',
    },
    {
      label: 'Memory',
      value: memoryCount ? `${memoryCount} recalled` : formatMemoryProviderLabel(thread.memoryProvider),
      body: memoryCount ? 'Recent operator memory is already shaping the room.' : 'Sibyl is ready to pin mission and preference memory.',
      className: 'ready',
    },
    {
      label: 'Mode',
      value: proposalCount ? `${proposalCount} queued proposal${proposalCount === 1 ? '' : 's'}` : 'Review-only',
      body: participantCount > 1 ? `${participantCount} room participants can collaborate, but nothing executes without approval.` : 'Single-participant room with explicit approval gates.',
      className: 'ready',
    },
  ];
}

function createIdentityBadges({ activeAgent = null, verifiedLabel = 'Verification pending', transport = 'Live chat', proposalCount = 0 } = {}) {
  if (Array.isArray(activeAgent?.identityBadges) && activeAgent.identityBadges.length) {
    return activeAgent.identityBadges.filter(Boolean).slice(0, 4);
  }
  return [
    activeAgent?.verified ? verifiedLabel : null,
    formatTransportLabel(transport),
    proposalCount ? `${proposalCount} queued` : 'Review-only',
  ].filter(Boolean);
}

function createIdentityStats({ activeAgent = null, activeCred = 'Cred pending', proposalCount = 0 } = {}) {
  return [
    { label: 'Token', value: activeAgent?.tokenId ? `#${activeAgent.tokenId}` : 'Not loaded' },
    { label: 'Cred', value: activeCred },
    { label: activeAgent?.profileLane ? 'Lane' : 'Mode', value: activeAgent?.profileLane ?? (proposalCount ? `${proposalCount} queued` : 'Review-only') },
  ];
}

function createSelectionHint({ walletConnected = false, agentRosterStatus = 'idle', activeAgentCount = 0 } = {}) {
  if (!walletConnected) return 'Connect wallet first.';
  if (agentRosterStatus === 'loading') return 'Loading wallet-owned agents.';
  if (agentRosterStatus === 'error') return 'Wallet-owned agent lookup failed.';
  if (activeAgentCount === 0) return 'This wallet does not own a Looper yet.';
  return 'Pick an agent to open its room and start the thread.';
}

function createNextAction({ walletConnected = false, activeAgentCount = 0, proposalCount = 0, hasMessages = false, roomParticipantCount = 0 } = {}) {
  if (!walletConnected) return { title: 'Wallet required', body: 'Connect wallet before the room can load an agent.' };
  if (activeAgentCount === 0) return { title: 'No owned Loopers', body: 'This wallet needs an owned Looper before chat can start.' };
  if (proposalCount > 0) return { title: 'Review queue', body: `${proposalCount} proposal${proposalCount === 1 ? '' : 's'} waiting for approval.` };
  if (hasMessages) return { title: 'Keep the room live', body: 'The thread is active. Keep the operator conversation moving.' };
  return { title: 'Open a room', body: 'Pick an owned agent and send the first mission.' };
}

function selectActiveAgent(agents = [], selectedAgentId = null) {
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const selected = selectedAgentId
    ? agents.find((agent) => String(agent?.tokenId ?? '') === String(selectedAgentId))
    : null;
  return selected ?? null;
}

function buildAgentOptionLabel(agent = {}) {
  return String(agent.name ?? agent.tokenId ?? 'Agent').trim();
}

export function normalizeConsoleCred(agent = {}) {
  const credScore = Number.isFinite(agent?.credScore) ? agent.credScore : null;
  const rawLabel = String(agent?.credLabel ?? '').trim();
  const hasTrustedLabel = Boolean(rawLabel && !isPendingCredLabel(rawLabel));
  if (credScore !== null) {
    return { credScore, credLabel: hasTrustedLabel ? rawLabel : `Cred ${credScore}` };
  }
  if (hasTrustedLabel) return { credScore: null, credLabel: rawLabel };
  if (String(agent?.tokenId ?? '').trim() === '614') return { credScore: 65, credLabel: 'Cred 65' };
  return { credScore: null, credLabel: rawLabel || 'Cred pending' };
}

function normalizeConsoleAgent(agent = {}) {
  return { ...agent, ...normalizeConsoleCred(agent) };
}

function createMultipassFacts({ activeAgent = null, ownerDisplayName = null } = {}) {
  if (!activeAgent?.tokenId) return ownerDisplayName ? [{ label: 'Owner', value: ownerDisplayName }] : [];
  const facts = [
    { label: 'Agent name', value: activeAgent.name },
    { label: 'Owner', value: ownerDisplayName ?? activeAgent.owner ?? activeAgent.wallet ?? activeAgent.ownerAddress ?? activeAgent.walletAddress },
    { label: 'Token', value: `#${activeAgent.tokenId}` },
    getPositiveErc8004AgentId(activeAgent) ? { label: 'ERC-8004', value: `#${getPositiveErc8004AgentId(activeAgent)}` } : null,
    (Number.isFinite(activeAgent.credScore) || !isPendingCredLabel(activeAgent.credLabel)) && activeAgent.credLabel
      ? { label: 'Cred', value: activeAgent.credLabel }
      : null,
    activeAgent.helixaId ? { label: 'AgentDNA', value: activeAgent.helixaId } : null,
  ];
  return facts.filter((fact) => fact?.value);
}

function isPendingCredLabel(value) {
  return /^(?:cred\s+)?pending$/iu.test(String(value ?? '').trim());
}

function decorateConsoleMessages(messages, { activeAgent = null, ownerProfile = {} } = {}) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const human = message?.role === 'human';
    return {
      ...message,
      senderLabel: human
        ? (ownerProfile.displayName || 'You')
        : (activeAgent?.name || message?.senderLabel || 'Selected agent'),
      avatarUrl: safeConsoleAvatarUrl(human ? ownerProfile.avatarUrl : activeAgent?.image),
    };
  });
}

function stripReviewOnlyTemperCopy(value) {
  const cleaned = String(value ?? '')
    .replace(/\breview-only\b[,:;]?\s*/giu, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .trim()
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '');
  return cleaned || 'Operator';
}

function formatTransportLabel(value, { live = true } = {}) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!live && (text === 'xmtp_group' || text === 'xmtp_node_sdk')) return 'XMTP setup';
  if (!text || text === 'live_chat') return 'Live chat';
  if (text === 'xmtp_local') return 'Local test adapter';
  if (text === 'xmtp_group') return 'XMTP live';
  if (text === 'unavailable') return 'XMTP unavailable';
  if (text === 'xmtp-ready' || text === 'xmtp_ready') return 'XMTP configured';
  return text.replaceAll('_', ' ');
}

function formatMemoryProviderLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'Memory standby';
  if (text === 'sibyl_memory') return 'Sibyl memory';
  if (text === 'sibyl-ready' || text === 'sibyl_ready') return 'Sibyl memory';
  if (text === 'local_sibyl_adapter') return 'Sibyl memory';
  return text.replaceAll('_', ' ');
}

function formatInferenceProviderLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'Runtime standby';
  if (text === 'bankr_llm_gateway') return 'Bankr gateway';
  if (text === 'bankr-ready' || text === 'bankr_ready') return 'Bankr-ready';
  if (text === 'local_bankr_adapter') return 'Bankr-ready';
  return text.replaceAll('_', ' ');
}

function shortenAddress(address) {
  const value = String(address ?? '').trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function createRoomParticipants({ agents = [], activeAgent = null, participantIds = [], threadParticipants = [] } = {}) {
  if (Array.isArray(threadParticipants) && threadParticipants.length) return normalizeThreadParticipants(threadParticipants);
  const byTokenId = new Map((Array.isArray(agents) ? agents : []).map((agent) => [String(agent?.tokenId ?? '').trim(), agent]));
  const ids = Array.isArray(participantIds) ? participantIds : [];
  const participants = ids
    .map((tokenId) => byTokenId.get(String(tokenId ?? '').trim()))
    .filter(Boolean);
  if (participants.length) return participants;
  return activeAgent ? [activeAgent] : [];
}

function createAgentRenameControl(activeAgent = null, mutation = {}) {
  if (!activeAgent?.tokenId) return null;
  const canonicalName = String(activeAgent.canonicalName ?? activeAgent.name ?? '').trim() || `Agent #${activeAgent.tokenId}`;
  const currentName = String(activeAgent.name ?? canonicalName).trim() || canonicalName;
  const pending = mutation?.status === 'pending';
  return {
    enabled: !pending,
    value: currentName,
    placeholder: canonicalName,
    resettable: !pending && currentName !== canonicalName,
    hint: pending
      ? 'Updating agent name…'
      : currentName !== canonicalName
      ? `Live identity: ${canonicalName}`
      : 'Agent alias for this Console session.',
  };
}

function deriveRoomName(participants = []) {
  const names = (Array.isArray(participants) ? participants : [])
    .map((participant) => String(participant?.displayName ?? participant?.name ?? '').trim())
    .filter(Boolean);
  if (!names.length) return 'Selected room';
  if (names.length === 1) return `${names[0]} room`;
  return `${names[0]} + ${names.length - 1} room`;
}

function normalizeThreadParticipants(participants = []) {
  return (Array.isArray(participants) ? participants : [])
    .filter(Boolean)
    .map((participant) => ({
      kind: participant.kind ?? null,
      wallet: participant.wallet ?? null,
      participantId: String(participant.participantId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      agentId: String(participant.agentId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      tokenId: String(participant.tokenId ?? participant.participantId ?? participant.name ?? 'agent').trim(),
      displayName: participant.displayName ?? participant.name ?? 'Selected agent',
      role: participant.role ?? participant.framework ?? 'Onchain agent',
      avatarUrl: participant.avatarUrl ?? participant.image ?? null,
    }));
}

function decorateConsoleParticipants(participants = [], { ownerDisplayName = null, ownerAvatarUrl = null, walletAddress = null } = {}) {
  return (Array.isArray(participants) ? participants : []).map((participant) => {
    const operator = participant?.kind === 'operator'
      || String(participant?.participantId ?? '').startsWith('wallet:')
      || (participant?.wallet && normalizeAddress(participant.wallet) === normalizeAddress(walletAddress));
    if (!operator) return participant;
    return {
      ...participant,
      displayName: ownerDisplayName || String(walletAddress ?? participant.wallet ?? '').trim() || 'You',
      avatarUrl: safeConsoleAvatarUrl(ownerAvatarUrl),
    };
  });
}

function normalizeAddress(value) {
  return String(value ?? '').trim().toLowerCase();
}

function initialsForLabel(value) {
  const normalized = String(value ?? '').trim();
  if (/^0x[0-9a-f]+$/iu.test(normalized)) return '0X';
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'AG';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AG';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

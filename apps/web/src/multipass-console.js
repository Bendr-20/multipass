import { renderConsoleAgentThread } from './console-agent-thread.js';

const CONSOLE_SAFETY_NOTE = 'Review-only operator surface. Your agent can brief and propose, but every action still waits for you.';
const DEFAULT_CONSOLE_MISSION = 'Watch this agent, keep memory in Sibyl, and brief me before any proposal or outside action.';

export function createMultipassConsoleSnapshot({ state = {}, agents = [] } = {}) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? { status: 'idle', error: null, agents: [] };
  const walletConnected = Boolean(wallet.connected && wallet.address);
  const activeAgents = Array.isArray(agents) ? agents.filter(Boolean) : [];
  const activeAgent = selectActiveAgent(activeAgents, state.consoleSelectedAgentId);
  const roomParticipants = createRoomParticipants({
    agents: activeAgents,
    activeAgent,
    participantIds: state.consoleParticipantAgentIds,
    threadParticipants: state.consoleAgentThread?.participants,
  });
  const activeAgentCount = activeAgents.length;
  const connectedWallet = walletConnected
    ? shortenAddress(wallet.address)
    : (wallet.configured === false ? 'Wallet unavailable' : 'Not connected');
  const agentThread = createAgentThreadSnapshot(state, activeAgent, roomParticipants);
  const savedMemory = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory : [];
  const recalledMemory = Array.isArray(agentThread.recalledMemory) ? agentThread.recalledMemory : [];
  const memoryEntries = createMemoryEntries({ savedMemory, recalledMemory });
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const activeScore = normalizeCredScore(activeAgent?.credScore);
  const activeCred = activeAgent?.credLabel ?? (activeScore === null ? 'Cred pending' : `Cred ${activeScore}`);
  const activeAgentLabel = activeAgent?.name
    ?? (walletConnected
      ? agentRoster.status === 'loading'
        ? 'Loading owned agents'
        : 'No owned agents found'
      : 'Select an agent');

  const status = [
    { label: 'Wallet', value: walletConnected ? connectedWallet : 'Required' },
    { label: 'Agent', value: activeAgent?.tokenId ? activeAgentLabel : 'Select first' },
    { label: 'Chat', value: walletConnected && activeAgent?.tokenId ? (roomParticipants.length > 1 ? 'XMTP room' : 'XMTP ready') : 'Standby' },
    { label: 'Memory', value: memoryEntries.length ? `${memoryEntries.length} recalled` : 'Sibyl ready' },
  ];

  return {
    title: 'Multipass Console',
    kicker: 'Agent Workspace',
    headline: 'Multipass Console',
    lead: 'A simple wallet-owned chat workspace for Helixa agents, with XMTP rooms, Sibyl memory, and review-only approvals.',
    safetyNote: CONSOLE_SAFETY_NOTE,
    session: {
      wallet: {
        connected: walletConnected,
        unavailable: wallet.configured === false,
        ready: wallet.ready !== false,
        label: walletConnected ? (wallet.label ?? connectedWallet) : connectedWallet,
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
      selectionEnabled: walletConnected && agentRoster.status === 'loaded' && activeAgentCount > 0,
      selectionHint: createSelectionHint({ walletConnected, agentRosterStatus: agentRoster.status, activeAgentCount, roomParticipantCount: roomParticipants.length }),
      nextAction: createNextAction({ walletConnected, activeAgentCount, proposalCount, hasMessages: (agentThread.messages?.length ?? 0) > 0, roomParticipantCount: roomParticipants.length }),
      status,
    },
    identityCard: {
      label: 'Active room',
      name: activeAgentLabel,
      role: activeAgent?.role ?? 'Onchain agent',
      image: activeAgent?.image ?? '/multipass/og-bendr-profile-capture.png',
      walletLabel: walletConnected ? connectedWallet : 'Wallet required',
      roomName: agentThread.roomName,
      participants: agentThread.participants,
      stats: [
        { label: 'Cred', value: activeCred },
        { label: 'Proof', value: Number.isFinite(activeAgent?.proofCount) ? `${activeAgent.proofCount}` : '0' },
        { label: 'Routes', value: Number.isFinite(activeAgent?.routeCount) ? `${activeAgent.routeCount}` : '0' },
        { label: 'Standards', value: Number.isFinite(activeAgent?.standardsCount) ? `${activeAgent.standardsCount}` : '0' },
      ],
    },
    suiteChecks: createSuiteChecks({
      walletConnected,
      activeAgent,
      activeCred,
      memoryCount: memoryEntries.length,
      proposalCount,
      transport: agentThread.transport,
      memoryProvider: agentThread.memoryProvider,
      roomParticipantCount: roomParticipants.length,
    }),
    memoryEntries,
    agentThread,
    recall: {
      title: agentThread.sessionReset ? 'Session recall' : 'Sibyl recall',
      body: agentThread.recalledMission || (memoryEntries.length ? 'Recent memory is loaded for this wallet and selected agent.' : 'No recalled memory yet for this wallet-agent pair.'),
    },
    agents: activeAgents.slice(0, 8).map((agent) => ({
      tokenId: agent.tokenId ?? '',
      name: agent.name ?? 'Onchain agent',
      role: agent.role ?? agent.framework ?? 'Agent profile',
      cred: agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`),
      state: agent.state ?? (agent.verified ? 'Verified profile' : 'Review needed'),
      href: agent.href ?? null,
      selected: String(agent.tokenId ?? '') !== '' && String(agent.tokenId) === String(activeAgent?.tokenId ?? ''),
      inRoom: roomParticipants.some((participant) => String(participant.tokenId ?? '') === String(agent.tokenId ?? '')),
    })),
    agentRoster,
  };
}

export function renderMultipassConsole(snapshot = {}) {
  return `
    <main class="multipass-console" aria-label="Multipass Console">
      <section class="console-workspace-grid console-trust-stage" aria-label="Agent manager suite">
        <aside class="console-workspace-sidebar" aria-label="Workspace sidebar">
          <section class="console-dashboard-header console-sidebar-header" aria-label="Workspace">
            <div class="console-sidebar-brand">
              <p class="eyebrow">${escapeHtml(snapshot.kicker ?? 'Agent Workspace')}</p>
              <h1>${escapeHtml(snapshot.headline ?? 'Multipass Console')}</h1>
              <p class="lead">${escapeHtml(snapshot.lead ?? '')}</p>
            </div>
            <div class="console-sidebar-header-meta">
              <span class="console-sidebar-badge">Review only</span>
              <span class="console-sidebar-room">${escapeHtml(snapshot.agentThread?.roomName ?? 'Selected agent room')}</span>
              <p class="console-safety-note">${escapeHtml(snapshot.safetyNote ?? CONSOLE_SAFETY_NOTE)}</p>
            </div>
          </section>
          ${renderSessionPanel(snapshot.session)}
          <section id="console-agents" class="console-panel console-agent-panel" aria-label="Wallet-owned agents">
            <div class="console-panel-heading">
              <p class="card-label">Rooms</p>
              <h2>Owned agents</h2>
              <p>Pick the primary room, then add or remove other wallet-owned agents from the same chat.</p>
            </div>
            <div class="console-agent-list">
              ${renderAgentRoster(snapshot)}
            </div>
            <p class="console-agent-note">The Console only loads real Helixa agents owned by the connected wallet.</p>
            ${snapshot.agentRoster?.error ? `<p class="console-agent-error">${escapeHtml(snapshot.agentRoster.error)}</p>` : ''}
          </section>
          ${renderIdentityCard(snapshot.identityCard)}
          ${renderSuitePanel(snapshot)}
          <section class="console-panel console-recall-panel" aria-label="Sibyl recall">
            <div class="console-panel-heading">
              <p class="card-label">Pinned memory</p>
              <h2>${escapeHtml(snapshot.recall?.title ?? 'Sibyl recall')}</h2>
              <p>${escapeHtml(snapshot.recall?.body ?? '')}</p>
            </div>
          </section>
        </aside>

        <section class="console-workspace-main" aria-label="Live chat workspace">
          ${renderConsoleAgentThread({
            ...snapshot.agentThread,
            recall: snapshot.recall,
            contextItems: snapshot.suiteChecks,
          })}
        </section>
      </section>
    </main>
  `;
}

function createAgentThreadSnapshot(state = {}, activeAgent = null, roomParticipants = []) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? {};
  const connected = Boolean(wallet.connected && wallet.address);
  const thread = state.consoleAgentThread ?? {};
  const loadingAgents = agentRoster.status === 'loading';
  const rosterError = agentRoster.error ?? null;
  const hasAgent = Boolean(activeAgent?.tokenId);
  const threadParticipants = Array.isArray(thread.participants) && thread.participants.length
    ? thread.participants.filter(Boolean)
    : normalizeThreadParticipants(roomParticipants);
  const latestAgentMessage = thread.messages?.findLast?.((message) => message.role === 'agent');
  const hasRuntimeProof = Boolean(thread.messages?.length || thread.proposals?.length || thread.savedMemory?.length || thread.recalledMemory?.length);
  return {
    status: thread.status ?? 'idle',
    disabled: !connected || loadingAgents || !hasAgent,
    error: thread.error ?? null,
    transport: formatTransportLabel(thread.transport),
    memoryProvider: formatMemoryProviderLabel(thread.memoryProvider),
    inferenceProvider: formatInferenceProviderLabel(thread.inferenceProvider),
    approvalMode: 'Review-only',
    defaultMission: DEFAULT_CONSOLE_MISSION,
    agentName: activeAgent?.name ?? 'Selected agent',
    roomName: String(thread.roomName ?? '').trim() || deriveRoomName(threadParticipants.length ? threadParticipants : [activeAgent].filter(Boolean)),
    participants: threadParticipants.length ? threadParticipants : normalizeThreadParticipants([activeAgent].filter(Boolean)),
    messages: thread.messages,
    proposals: thread.proposals,
    savedMemory: thread.savedMemory,
    recalledMemory: thread.recalledMemory,
    missions: thread.missions,
    sessionReset: Boolean(thread.sessionReset),
    recalledMission: thread.recalledMission ?? null,
    canReset: hasRuntimeProof,
    summary: latestAgentMessage
      ? 'Live chat updated.'
      : thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
      : !connected
        ? 'Connect a wallet to open a room.'
      : loadingAgents
        ? 'Loading wallet-owned agents.'
      : rosterError
        ? 'Could not load wallet-owned agents.'
      : !hasAgent
        ? 'Select an owned agent to open a room.'
        : threadParticipants.length > 1
          ? `Room ready with ${threadParticipants.length} participating agents.`
          : 'XMTP room ready.',
  };
}

function renderSessionPanel(session = {}) {
  const wallet = session.wallet ?? {};
  const connecting = wallet.status === 'connecting';
  const connected = Boolean(wallet.connected);
  const unavailable = Boolean(wallet.unavailable);
  const ready = wallet.ready !== false;
  const buttonLabel = connecting
    ? 'Connecting...'
    : connected
      ? 'Reconnect'
      : 'Connect wallet';

  return `
    <section class="console-panel console-session-panel console-wallet-panel" aria-label="Manager session">
      <div class="console-panel-heading">
        <p class="card-label">Session</p>
        <h2>Open a wallet-owned room</h2>
        <p>${escapeHtml(session.nextAction?.body ?? 'Connect your wallet to begin.')}</p>
      </div>
      <strong class="console-session-callout">${escapeHtml(session.nextAction?.title ?? 'Connect wallet')}</strong>
      <dl class="console-status-strip">
        ${(session.status ?? []).map(renderStatusItem).join('')}
      </dl>
      <div class="console-session-actions">
        <button type="button" data-action="connect-console-wallet" ${connecting || unavailable || !ready ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>
        <label class="console-agent-selector">
          <span>Select primary agent</span>
          <select name="console_agent" data-action="select-console-agent" ${session.selectionEnabled ? '' : 'disabled'}>
            ${renderAgentOptions(session)}
          </select>
        </label>
      </div>
      <p class="console-session-note">${escapeHtml(session.selectionHint ?? '')}</p>
      ${wallet.error ? `<p class="console-wallet-error">${escapeHtml(wallet.error)}</p>` : ''}
    </section>
  `;
}

function renderIdentityCard(card = {}) {
  const participants = Array.isArray(card.participants) ? card.participants.filter(Boolean) : [];
  return `
    <section class="console-visual-card console-identity-card" aria-label="Selected agent">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(card.label ?? 'Selected agent')}</p>
        <span>${escapeHtml(card.walletLabel ?? 'Wallet required')}</span>
      </div>
      <div class="console-identity-overview">
        <div class="console-agent-portrait">
          <img src="${escapeAttribute(card.image ?? '/multipass/og-bendr-profile-capture.png')}" alt="${escapeAttribute(card.name ?? 'Agent profile')}" loading="lazy">
        </div>
        <div class="console-identity-body">
          <span>${escapeHtml(card.role ?? 'Onchain agent')}</span>
          <strong>${escapeHtml(card.name ?? 'Select an agent')}</strong>
          <small>${escapeHtml(card.roomName ?? 'Selected room')}</small>
        </div>
      </div>
      <div class="console-identity-stats">
        ${(card.stats ?? []).map(renderMiniStat).join('')}
      </div>
      ${participants.length ? `
        <div class="console-identity-members">
          <span class="console-identity-members-label">In this room</span>
          <div class="console-identity-members-list">
            ${participants.map(renderIdentityParticipant).join('')}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function renderSuitePanel(snapshot = {}) {
  return `
    <section class="console-panel console-suite-panel console-trust-rail" aria-label="Live suite">
      <div class="console-panel-heading">
        <p class="card-label">Context</p>
        <h2>Room context</h2>
        <p>What this room knows now and what still waits for approval.</p>
      </div>
      <div class="console-check-stack">
        ${(snapshot.suiteChecks ?? []).map(renderSuiteCheck).join('')}
      </div>
      <div class="console-memory-list console-memory-log">
        ${(snapshot.memoryEntries ?? []).map(renderMemoryEntry).join('') || `
          <article class="console-memory-empty">
            <strong>Sibyl memory is ready</strong>
            <p>Send a mission or preference and this room will store it against the wallet and selected agent.</p>
          </article>
        `}
      </div>
    </section>
  `;
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
    <article class="console-mini-stat">
      <span>${escapeHtml(card.label ?? '')}</span>
      <strong>${escapeHtml(card.value ?? '')}</strong>
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
  return options.map((option) => `
    <option value="${escapeAttribute(option.value ?? '')}" ${option.value === session.activeAgentId ? 'selected' : ''}>${escapeHtml(option.label ?? option.value ?? '')}</option>
  `).join('');
}

function renderAgentRoster(snapshot = {}) {
  const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  if (agents.length) return agents.map(renderAgentCard).join('');

  const status = snapshot.agentRoster?.status ?? 'idle';
  let title = 'Connect a wallet';
  let body = 'The Console only loads real Helixa agents owned by the connected wallet.';
  if (status === 'loading') {
    title = 'Loading owned agents';
    body = 'Checking the live Helixa directory for agents owned by this wallet.';
  } else if (status === 'loaded') {
    title = 'No owned agents found';
    body = 'This wallet does not currently own a live Helixa agent record.';
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
  const inRoom = Boolean(agent.inRoom);
  return `
    <article class="console-agent-card ${selected ? 'selected' : ''} ${inRoom ? 'in-room' : ''}">
      <div class="console-agent-card-head">
        <div>
          <strong>${escapeHtml(agent.name ?? 'Onchain agent')}</strong>
          <span>${escapeHtml(agent.role ?? 'Agent profile')}</span>
        </div>
        <div class="console-agent-card-flags">
          ${selected ? '<span>Primary</span>' : ''}
          ${inRoom && !selected ? '<span>In room</span>' : ''}
        </div>
      </div>
      <dl>
        <div><dt>Token</dt><dd>${escapeHtml(agent.tokenId ?? 'Unknown')}</dd></div>
        <div><dt>Cred</dt><dd>${escapeHtml(agent.cred ?? 'Cred pending')}</dd></div>
        <div><dt>State</dt><dd>${escapeHtml(agent.state ?? 'Review needed')}</dd></div>
      </dl>
      <div class="console-agent-card-actions">
        <button type="button" data-action="activate-console-room" data-token-id="${escapeAttribute(agent.tokenId ?? '')}" ${selected ? 'disabled' : ''}>${selected ? 'Primary room' : 'Make primary'}</button>
        <button type="button" data-action="toggle-console-agent-room" data-token-id="${escapeAttribute(agent.tokenId ?? '')}" ${selected ? 'disabled' : ''}>${selected ? 'Primary agent' : (inRoom ? 'Remove from room' : 'Add to room')}</button>
      </div>
      ${openLink}
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

function createSuiteChecks({
  walletConnected = false,
  activeAgent = null,
  activeCred = 'Cred pending',
  memoryCount = 0,
  proposalCount = 0,
  transport = 'Live chat',
  memoryProvider = 'Sibyl memory',
  roomParticipantCount = 0,
} = {}) {
  return [
    {
      label: 'Wallet',
      value: walletConnected ? 'Connected' : 'Required',
      body: 'Session stays bound to the connected wallet.',
      className: walletConnected ? 'ready' : 'open',
    },
    {
      label: 'Selected agent',
      value: activeAgent?.tokenId ? `#${activeAgent.tokenId}` : 'Required',
      body: activeAgent?.name ?? 'Choose one owned agent to manage.',
      className: activeAgent?.tokenId ? 'ready' : 'open',
    },
    {
      label: 'Chat',
      value: transport,
      body: roomParticipantCount > 1
        ? `${roomParticipantCount} wallet-owned agents are active in this room.`
        : 'Live manager chat for the selected agent.',
      className: activeAgent?.tokenId ? 'ready' : 'open',
    },
    {
      label: 'Memory',
      value: memoryProvider,
      body: memoryCount ? `${memoryCount} recalled item${memoryCount === 1 ? '' : 's'} loaded.` : 'No recalled memory yet.',
      className: 'ready',
    },
    {
      label: 'Cred',
      value: activeCred,
      body: 'Current trust layer snapshot for the selected agent.',
      className: activeAgent?.tokenId ? 'ready' : 'open',
    },
    {
      label: 'Approval',
      value: proposalCount ? `${proposalCount} queued` : 'Review-only',
      body: 'No external action executes without approval.',
      className: 'ready',
    },
  ];
}

function createSelectionHint({ walletConnected = false, agentRosterStatus = 'idle', activeAgentCount = 0 } = {}) {
  if (!walletConnected) return 'Connect wallet first.';
  if (agentRosterStatus === 'loading') return 'Loading wallet-owned agents.';
  if (agentRosterStatus === 'error') return 'Wallet-owned agent lookup failed.';
  if (activeAgentCount === 0) return 'This wallet does not own a live Helixa agent record yet.';
  return 'Pick a primary agent, then add other wallet-owned agents.';
}

function createNextAction({ walletConnected = false, activeAgentCount = 0, proposalCount = 0, hasMessages = false, roomParticipantCount = 0 } = {}) {
  if (!walletConnected) return { title: 'Connect wallet', body: 'Link the controlling wallet before the room can load an agent.' };
  if (activeAgentCount === 0) return { title: 'No owned agents', body: 'This wallet needs a live Helixa agent record before chat can start.' };
  if (proposalCount > 0) return { title: 'Review queue', body: `${proposalCount} proposal${proposalCount === 1 ? '' : 's'} waiting for approval.` };
  if (roomParticipantCount > 1 && !hasMessages) return { title: 'Start room chat', body: 'Multiple agents are in the room. Send the first message and let them answer together.' };
  if (hasMessages) return { title: 'Keep chatting', body: 'The room is live. Keep the thread moving.' };
  return { title: 'Start live chat', body: 'Pick a primary owned agent and send the first mission.' };
}

function selectActiveAgent(agents = [], selectedAgentId = null) {
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const selected = selectedAgentId
    ? agents.find((agent) => String(agent?.tokenId ?? '') === String(selectedAgentId))
    : null;
  return selected ?? agents[0] ?? null;
}

function buildAgentOptionLabel(agent = {}) {
  const name = String(agent.name ?? agent.tokenId ?? 'Agent').trim();
  const cred = agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`);
  return `${name} · ${cred}`;
}

function normalizeCredScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatTransportLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'live_chat') return 'Live chat';
  if (text === 'xmtp_local') return 'XMTP room';
  if (text === 'xmtp_group') return 'XMTP group';
  if (text === 'xmtp-ready' || text === 'xmtp_ready') return 'XMTP ready';
  return text.replaceAll('_', ' ');
}

function formatMemoryProviderLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'sibyl_memory') return 'Sibyl memory';
  if (text === 'sibyl-ready' || text === 'sibyl_ready') return 'Sibyl memory';
  if (text === 'local_sibyl_adapter') return 'Sibyl memory';
  return text.replaceAll('_', ' ');
}

function formatInferenceProviderLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'bankr_llm_gateway') return 'Bankr gateway';
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
  if (Array.isArray(threadParticipants) && threadParticipants.length) return threadParticipants.filter(Boolean);
  const byTokenId = new Map((Array.isArray(agents) ? agents : []).map((agent) => [String(agent?.tokenId ?? '').trim(), agent]));
  const ids = Array.isArray(participantIds) ? participantIds : [];
  const participants = ids
    .map((tokenId) => byTokenId.get(String(tokenId ?? '').trim()))
    .filter(Boolean);
  if (participants.length) return participants;
  return activeAgent ? [activeAgent] : [];
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
      participantId: String(participant.participantId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      agentId: String(participant.agentId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      tokenId: String(participant.tokenId ?? participant.participantId ?? participant.name ?? 'agent').trim(),
      displayName: participant.displayName ?? participant.name ?? 'Selected agent',
      role: participant.role ?? participant.framework ?? 'Onchain agent',
    }));
}

function initialsForLabel(value) {
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

import { renderConsoleAgentThread } from './console-agent-thread.js';

const CONSOLE_SAFETY_NOTE = 'Review-only operator surface. Your agent can brief and propose, but every action still waits for you.';
const DEFAULT_CONSOLE_MISSION = 'Watch this agent, keep memory in Sibyl, and brief me before any proposal or outside action.';
const DEFAULT_CONSOLE_PORTRAIT = '/multipass/loopers-console-pfp.png';

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
  const verifiedLabel = activeAgent?.verified ? 'Verified AgentDNA' : (activeAgent?.tokenId ? 'Verification pending' : 'Awaiting selection');
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
    headline: 'Multipass Console',
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
      name: activeAgentLabel,
      role: activeAgent?.canonicalName && activeAgent.canonicalName !== activeAgent.name
        ? activeAgent.canonicalName
        : (activeAgent?.role ?? 'Onchain agent'),
      image: activeAgent?.image ?? DEFAULT_CONSOLE_PORTRAIT,
      walletLabel: walletConnected ? connectedWallet : null,
      roomName: activeAgent?.presenceLabel ?? (roomParticipants.length > 1 ? agentThread.roomName : 'Direct operator line'),
      participants: agentThread.participants,
      summary: createIdentitySummary({ activeAgent, activeCred, roomParticipantCount: roomParticipants.length, proposalCount }),
      rename: createAgentRenameControl(activeAgent),
      badges: createIdentityBadges({ activeAgent, verifiedLabel, transport: agentThread.transport, proposalCount }),
      dossier: createIdentityDossier({
        activeAgent,
        walletConnected,
        walletLabel: connectedWallet,
        roomName: activeAgent?.presenceLabel ?? agentThread.roomName,
        roomParticipantCount: roomParticipants.length,
        memoryCount: memoryEntries.length,
        proposalCount,
        verifiedLabel,
      }),
      stats: createIdentityStats({ activeAgent, activeCred, proposalCount }),
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
      <section class="console-workspace-grid console-basic-shell" aria-label="Agent console">
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
              stat: rosterStat,
              hint: snapshot.session?.selectionHint ?? 'Wallet-owned Helixa roster.',
              open: false,
              body: `
                <div class="console-agent-list">
                  ${renderAgentRoster(snapshot)}
                </div>
                <p class="console-agent-note">The Console only loads real Helixa agents owned by the connected wallet.</p>
                ${snapshot.agentRoster?.error ? `<p class="console-agent-error">${escapeHtml(snapshot.agentRoster.error)}</p>` : ''}
              `,
            })}
          </section>
        </aside>

        <section class="console-workspace-main console-basic-main" aria-label="Selected agent chat">
          ${renderConsoleAgentThread({
            ...snapshot.agentThread,
            recall: snapshot.recall,
            contextItems: snapshot.threadContextItems,
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
    title: thread.title ?? null,
    metaLabel: thread.metaLabel ?? null,
    contextLabel: thread.contextLabel ?? null,
    agentAvatarUrl: activeAgent?.image ?? null,
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
        ? 'Connect wallet to open a room.'
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
  const connected = Boolean(wallet.connected);
  const walletLabel = connected ? wallet.label : null;
  const sessionNote = connected
    ? (session.selectionHint ?? '')
    : (wallet.unavailable ? 'Wallet login is unavailable for this build.' : 'Connect wallet to load your agents.');

  return `
    <section class="console-panel console-session-panel console-wallet-panel" aria-label="Console session">
      ${renderConsoleDrawer({
        label: 'Session',
        title: 'Active agent',
        stat: session.activeAgentLabel ?? 'Select an agent',
        hint: session.selectionHint ?? '',
        open: false,
        body: `
          <div class="console-session-actions">
            <label class="console-agent-selector">
              <span>Active agent</span>
              <select name="console_agent" data-action="select-console-agent" ${session.selectionEnabled ? '' : 'disabled'}>
                ${renderAgentOptions(session)}
              </select>
            </label>
          </div>
          ${walletLabel ? `<p class="console-wallet-label">${escapeHtml(walletLabel)}</p>` : ''}
          ${sessionNote ? `<p class="console-session-note">${escapeHtml(sessionNote)}</p>` : ''}
          ${wallet.error ? `<p class="console-wallet-error">${escapeHtml(wallet.error)}</p>` : ''}
        `,
      })}
    </section>
  `;
}

function renderIdentityCard(card = {}) {
  const statsSummary = (card.stats ?? [])
    .map((item) => item?.value)
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
  const trustStat = statsSummary || card.badges?.[0] || 'Awaiting trust';
  const memberCount = Array.isArray(card.participants) ? card.participants.length : 0;
  return `
    <section class="console-visual-card console-identity-card" aria-label="Selected agent">
      <div class="console-agent-portrait">
        <img src="${escapeAttribute(card.image ?? DEFAULT_CONSOLE_PORTRAIT)}" alt="${escapeAttribute(card.name ?? 'Agent profile')}" loading="lazy">
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
      </div>
      ${(card.badges ?? []).length ? `
        <div class="console-identity-badges">
          ${(card.badges ?? []).map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}
        </div>
      ` : ''}
      ${card.rename ? renderConsoleDrawer({
        label: 'Alias',
        title: 'Console name',
        stat: card.rename.value ?? card.name ?? 'Selected agent',
        hint: card.rename.hint ?? 'Console-only alias.',
        open: false,
        body: `
          <form class="console-identity-rename" data-action="update-console-agent-name" aria-label="Update console agent name">
            <label>
              <span>Console name</span>
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
        hint: memberCount === 1 ? 'Single-agent room.' : 'Room participants for this thread.',
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
  return options.map((option) => `
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
        <button type="button" data-action="activate-console-room" data-token-id="${escapeAttribute(agent.tokenId ?? '')}" ${selected ? 'disabled' : ''}>${selected ? 'Room live' : 'Open room'}</button>
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

function createIdentitySummary({ activeAgent = null, activeCred = 'Cred pending', roomParticipantCount = 0, proposalCount = 0 } = {}) {
  if (!activeAgent?.tokenId) return 'Load a real agent and open a direct review-only thread.';
  if (activeAgent.logline) return activeAgent.logline;
  const roomLabel = roomParticipantCount > 1 ? `${roomParticipantCount}-agent room` : 'direct thread';
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
      : (activeAgent?.name ? verifiedLabel : 'Connect wallet to load a wallet-owned Helixa identity.'));
  const temperamentValue = activeAgent?.temperament ?? activeAgent?.role ?? 'Review-only operator';
  const temperamentBody = activeAgent?.temperamentBody
    ?? (activeAgent?.tokenId
      ? 'Brief-first, memory-backed, and constrained to approval before any outside action.'
      : 'The Console should feel like a character relationship, not a dashboard.');
  const roomBody = activeAgent?.mandateBody
    ?? (roomParticipantCount > 1
      ? `${roomParticipantCount} wallet-owned agents are sharing this thread.`
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
      body: participantCount > 1 ? `${participantCount} agents can collaborate, but nothing executes without approval.` : 'Single-agent room with explicit approval gates.',
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
  if (activeAgentCount === 0) return 'This wallet does not own a live Helixa agent record yet.';
  return 'Pick an agent to open its room and start the thread.';
}

function createNextAction({ walletConnected = false, activeAgentCount = 0, proposalCount = 0, hasMessages = false, roomParticipantCount = 0 } = {}) {
  if (!walletConnected) return { title: 'Wallet required', body: 'Connect wallet before the room can load an agent.' };
  if (activeAgentCount === 0) return { title: 'No owned agents', body: 'This wallet needs a live Helixa agent record before chat can start.' };
  if (proposalCount > 0) return { title: 'Review queue', body: `${proposalCount} proposal${proposalCount === 1 ? '' : 's'} waiting for approval.` };
  if (hasMessages) return { title: 'Keep the room live', body: 'The thread is active. Keep the operator conversation moving.' };
  return { title: 'Open a room', body: 'Pick an owned agent and send the first mission.' };
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
  const identity = agent.canonicalName && agent.canonicalName !== name
    ? `${name} · ${agent.canonicalName}`
    : name;
  const cred = agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`);
  return `${identity} · ${cred}`;
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
  if (Array.isArray(threadParticipants) && threadParticipants.length) return normalizeThreadParticipants(threadParticipants);
  const byTokenId = new Map((Array.isArray(agents) ? agents : []).map((agent) => [String(agent?.tokenId ?? '').trim(), agent]));
  const ids = Array.isArray(participantIds) ? participantIds : [];
  const participants = ids
    .map((tokenId) => byTokenId.get(String(tokenId ?? '').trim()))
    .filter(Boolean);
  if (participants.length) return participants;
  return activeAgent ? [activeAgent] : [];
}

function createAgentRenameControl(activeAgent = null) {
  if (!activeAgent?.tokenId) return null;
  const canonicalName = String(activeAgent.canonicalName ?? activeAgent.name ?? '').trim() || `Agent #${activeAgent.tokenId}`;
  const currentName = String(activeAgent.name ?? canonicalName).trim() || canonicalName;
  return {
    enabled: true,
    value: currentName,
    placeholder: canonicalName,
    resettable: currentName !== canonicalName,
    hint: currentName !== canonicalName
      ? `Live identity: ${canonicalName}`
      : 'Console-only alias for this selected agent.',
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
      participantId: String(participant.participantId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      agentId: String(participant.agentId ?? participant.tokenId ?? participant.name ?? 'agent').trim(),
      tokenId: String(participant.tokenId ?? participant.participantId ?? participant.name ?? 'agent').trim(),
      displayName: participant.displayName ?? participant.name ?? 'Selected agent',
      role: participant.role ?? participant.framework ?? 'Onchain agent',
      avatarUrl: participant.avatarUrl ?? participant.image ?? null,
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

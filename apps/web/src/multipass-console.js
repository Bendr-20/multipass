import { renderConsoleAgentThread } from './console-agent-thread.js';

const CONSOLE_SAFETY_NOTE = 'Your agent can brief and propose. You approve every action. No trades, custody transfer, or tool authority.';

const DEFAULT_MEMORY_CELLS = [
  {
    label: 'Onchain identity',
    value: 'Owner + agent record',
  },
  {
    label: 'Private memory',
    value: 'Wallet-scoped recall',
  },
  {
    label: 'Approval gate',
    value: 'Human review queue',
  },
];

const DEFAULT_MISSION_LANES = [
  {
    title: 'Connect',
    status: 'Wallet',
    body: 'Link the wallet that controls the session.',
  },
  {
    title: 'Load agent',
    status: 'Agent',
    body: 'Choose the onchain agent profile.',
  },
  {
    title: 'Assign mission',
    status: 'Mission',
    body: 'Tell it what to watch and prepare.',
  },
  {
    title: 'Review',
    status: 'Proposal',
    body: 'Approve or reject proposals yourself.',
  },
];

const DEFAULT_CONSOLE_MISSION = 'Watch this agent\'s Cred tier, public proof, route health, and mission changes. Brief me first; keep every action for my approval.';

const FLOW_STEPS = [
  { key: 'wallet', label: 'Wallet' },
  { key: 'agent', label: 'Agent' },
  { key: 'mission', label: 'Mission' },
  { key: 'memory', label: 'Memory' },
  { key: 'briefing', label: 'Briefing' },
  { key: 'proposal', label: 'Proposal' },
];

const TRUST_TIERS = [
  { label: 'Preferred', range: '91-100' },
  { label: 'Prime', range: '76-90' },
  { label: 'Qualified', range: '51-75' },
  { label: 'Marginal', range: '26-50' },
  { label: 'Junk', range: '0-25' },
];

const TRUST_GRAPH_SUPPORT_LAYOUT = [
  { key: 'wallet', x: 45, y: 55, size: 'support-large' },
  { key: 'identity', x: 50, y: 42, size: 'support-medium' },
  { key: 'intuition', x: 58, y: 49, size: 'support-medium' },
  { key: 'proof', x: 57, y: 60, size: 'support-large' },
  { key: 'review', x: 43, y: 64, size: 'support-medium' },
];

const TRUST_GRAPH_AGENT_LAYOUT = [
  { x: 34, y: 26, size: 'agent-medium' },
  { x: 44, y: 20, size: 'agent-medium' },
  { x: 55, y: 19, size: 'agent-medium' },
  { x: 66, y: 24, size: 'agent-medium' },
  { x: 74, y: 33, size: 'agent-small' },
  { x: 78, y: 45, size: 'agent-medium' },
  { x: 76, y: 57, size: 'agent-small' },
  { x: 70, y: 69, size: 'agent-medium' },
  { x: 60, y: 76, size: 'agent-small' },
  { x: 48, y: 78, size: 'agent-medium' },
  { x: 36, y: 74, size: 'agent-medium' },
  { x: 27, y: 66, size: 'agent-small' },
  { x: 22, y: 54, size: 'agent-medium' },
  { x: 22, y: 41, size: 'agent-small' },
  { x: 26, y: 30, size: 'agent-medium' },
];

const TRUST_GRAPH_GUIDE_DOT_LAYOUT = [
  { x: 30, y: 18, size: 'sm' },
  { x: 39, y: 15, size: 'sm' },
  { x: 50, y: 14, size: 'md' },
  { x: 61, y: 15, size: 'sm' },
  { x: 70, y: 19, size: 'sm' },
  { x: 77, y: 27, size: 'sm' },
  { x: 82, y: 39, size: 'md' },
  { x: 83, y: 52, size: 'sm' },
  { x: 78, y: 64, size: 'sm' },
  { x: 69, y: 74, size: 'md' },
  { x: 58, y: 81, size: 'sm' },
  { x: 46, y: 83, size: 'sm' },
  { x: 34, y: 80, size: 'md' },
  { x: 24, y: 72, size: 'sm' },
  { x: 17, y: 61, size: 'sm' },
  { x: 15, y: 48, size: 'md' },
  { x: 17, y: 35, size: 'sm' },
  { x: 23, y: 24, size: 'sm' },
];

export function createMultipassConsoleSnapshot({ data = {}, state = {}, agents = [] } = {}) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? { status: 'idle', error: null, agents: [] };
  const walletConnected = Boolean(wallet.connected && wallet.address);
  const activeAgents = Array.isArray(agents) ? agents.filter(Boolean) : [];
  const activeAgent = activeAgents[0] ?? {};
  const activeAgentCount = activeAgents.length;
  const publicProofCount = Number.isFinite(activeAgent.proofCount) ? activeAgent.proofCount : 0;
  const connectedWallet = walletConnected
    ? shortenAddress(wallet.address)
    : (wallet.configured === false ? 'Wallet unavailable' : 'Not connected');

  const agentThread = createAgentThreadSnapshot(state);
  const flowState = createFlowState({ walletConnected, agentThread });
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const routeCount = Number.isFinite(activeAgent.routeCount) ? activeAgent.routeCount : 0;
  const standardsCount = Number.isFinite(activeAgent.standardsCount) ? activeAgent.standardsCount : 0;
  const activeAgentLabel = activeAgent.name
    ?? (walletConnected
      ? agentRoster.status === 'loading'
        ? 'Loading owned agents'
        : 'No owned agents found'
      : 'Agent slot');
  const activeScore = normalizeCredScore(activeAgent.credScore);
  const activeTier = getCredTier(activeScore);
  const activeCred = activeAgent.credLabel ?? (activeScore === null ? 'Cred pending' : `Cred ${activeScore}`);
  const nextAction = createNextAction({
    walletConnected,
    agentThread,
    proposalCount,
    activeAgentCount,
    agentRosterStatus: agentRoster.status,
  });
  const trustGraph = createTrustGraphModel({
    walletConnected,
    connectedWallet,
    agentRosterStatus: agentRoster.status,
    activeAgents,
    activeAgent,
    activeAgentLabel,
    activeCred,
    activeTier,
    agentThread,
    publicProofCount,
    savedMemoryCount,
    proposalCount,
    routeCount,
    standardsCount,
    activeAgentCount,
  });
  const signalModules = createSignalModules({
    walletConnected,
    connectedWallet,
    activeCred,
    activeTier,
    routeCount,
    standardsCount,
    publicProofCount,
    savedMemoryCount,
    proposalCount,
  });

  return {
    title: 'Multipass Console',
    kicker: 'Console',
    headline: 'Multipass Console',
    lead: 'One Cred graph for one onchain agent: identity, proof, memory, and human approval.',
    safetyNote: CONSOLE_SAFETY_NOTE,
    defaultMission: DEFAULT_CONSOLE_MISSION,
    nextAction,
    wallet: {
      connected: walletConnected,
      unavailable: wallet.configured === false,
      ready: wallet.ready !== false,
      label: walletConnected ? (wallet.label ?? shortenAddress(wallet.address)) : connectedWallet,
      status: state.consoleWalletStatus ?? null,
      error: state.consoleWalletError ?? null,
    },
    status: [
      { label: 'Wallet', value: walletConnected ? connectedWallet : 'Required' },
      { label: 'Agents', value: walletConnected ? formatOwnedAgentStatus(activeAgentCount, agentRoster.status) : 'Connect first' },
      { label: 'Cred', value: activeCred },
      { label: 'Approval', value: 'Human review' },
    ],
    flowSteps: FLOW_STEPS.map((step) => ({
      ...step,
      state: flowState[step.key] ? 'done' : 'open',
    })),
    identityCard: {
      label: 'Your agent',
      name: activeAgentLabel,
      role: activeAgent.role ?? 'Onchain agent',
      image: activeAgent.image ?? '/multipass/og-bendr-profile-capture.png',
      walletLabel: walletConnected ? connectedWallet : 'Wallet required',
      walletConnected,
      wallet: {
        connected: walletConnected,
        unavailable: wallet.configured === false,
        ready: wallet.ready !== false,
        label: walletConnected ? (wallet.label ?? shortenAddress(wallet.address)) : connectedWallet,
        status: state.consoleWalletStatus ?? null,
        error: state.consoleWalletError ?? null,
      },
      stats: [
        { label: 'Cred', value: activeCred },
        { label: 'State', value: activeAgentCount ? 'Active' : (walletConnected ? 'No owned agent' : 'Standby') },
        { label: 'Memory', value: savedMemoryCount || 'Ready' },
      ],
    },
    trustGraph,
    signalChart: {
      label: 'Graph checks',
      title: 'Trust checks',
      state: proposalCount ? `${proposalCount} review queued` : `${signalModules.length} tracked`,
      lanes: signalModules,
    },
    operatorSlot: {
      label: walletConnected ? activeAgentLabel : 'Agent slot',
      state: activeAgentCount ? 'Active' : 'Inactive',
      copy: activeAgentCount
        ? 'Identity attached.'
        : walletConnected
          ? 'No wallet-owned agent loaded yet.'
          : 'Wallet required.',
    },
    agents: activeAgents.slice(0, 5).map((agent) => ({
      name: agent.name ?? 'Onchain agent',
      role: agent.role ?? agent.framework ?? 'Agent profile',
      cred: agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`),
      state: agent.state ?? (agent.verified ? 'Verified profile' : 'Review needed'),
      href: agent.href ?? null,
    })),
    agentRoster,
    memoryCells: DEFAULT_MEMORY_CELLS,
    missionLanes: DEFAULT_MISSION_LANES,
    signalModules,
    agentThread,
    recall: {
      title: agentThread.sessionReset ? 'Session reset' : 'Recall',
      body: agentThread.recalledMission || 'No recalled mission yet.',
    },
  };
}

export function renderMultipassConsole(snapshot = {}) {
  return `
    <main class="multipass-console" aria-label="Multipass Console">
      <section class="console-dashboard-header">
        <div>
          <p class="eyebrow">${escapeHtml(snapshot.kicker ?? 'Console')}</p>
          <h1>${escapeHtml(snapshot.headline ?? 'Multipass Console')}</h1>
          <p class="lead">${escapeHtml(snapshot.lead ?? '')}</p>
        </div>
        <p class="console-safety-note">${escapeHtml(snapshot.safetyNote ?? CONSOLE_SAFETY_NOTE)}</p>
      </section>

      <section class="console-trust-stage" aria-label="Console trust graph">
        ${renderTrustGraphCard(snapshot.trustGraph)}
        <aside class="console-trust-rail" aria-label="Console controls">
          ${renderNextAction(snapshot.nextAction, snapshot.wallet)}
          <dl class="console-status-strip">
            ${(snapshot.status ?? []).map(renderStatusItem).join('')}
          </dl>
        </aside>
      </section>

      ${renderConsoleAgentThread(snapshot.agentThread)}

      <section class="console-support-grid" aria-label="Console supporting context">
        ${renderIdentityCard(snapshot.identityCard)}
        <div class="console-panel">
          <div class="console-panel-heading">
            <p class="card-label">Memory</p>
            <h2>What it remembers</h2>
          </div>
          <div class="console-memory-list">
            ${(snapshot.memoryCells ?? []).map(renderMemoryCell).join('')}
          </div>
        </div>
        <div class="console-panel">
          <div class="console-panel-heading">
            <p class="card-label">Missions</p>
            <h2>Mission lanes</h2>
          </div>
          <div class="console-mission-list">
            ${(snapshot.missionLanes ?? []).map(renderMissionLane).join('')}
          </div>
        </div>
      </section>

      <section class="console-panel console-recall-panel" aria-label="Hackathon recall demo">
        <div>
          <p class="card-label">Recall</p>
          <h2>${escapeHtml(snapshot.recall?.title ?? 'Fresh-session recall')}</h2>
          <p>${escapeHtml(snapshot.recall?.body ?? '')}</p>
        </div>
      </section>

      <section id="console-agents" class="console-panel console-agent-panel" aria-label="Onchain agents">
        <div class="console-panel-heading">
          <p class="card-label">Agents</p>
          <h2>Wallet-owned agents</h2>
        </div>
        <div class="console-agent-list">
          ${renderAgentRoster(snapshot)}
        </div>
        ${snapshot.agentRoster?.error ? `<p class="console-agent-error">${escapeHtml(snapshot.agentRoster.error)}</p>` : ''}
      </section>
    </main>
  `;
}

function createAgentThreadSnapshot(state = {}) {
  const wallet = state.walletSnapshot ?? {};
  const agentRoster = state.consoleOwnedAgents ?? {};
  const connected = Boolean(wallet.connected && wallet.address);
  const ownedAgents = Array.isArray(agentRoster.agents) ? agentRoster.agents.length : 0;
  const thread = state.consoleAgentThread ?? {};
  const latestAgentMessage = thread.messages?.findLast?.((message) => message.role === 'agent');
  const hasRuntimeProof = Boolean(thread.messages?.length || thread.proposals?.length || thread.savedMemory?.length);
  const loadingAgents = agentRoster.status === 'loading';
  const rosterError = agentRoster.error ?? null;
  return {
    status: thread.status ?? 'idle',
    disabled: !connected || loadingAgents || ownedAgents === 0,
    error: thread.error ?? null,
    transport: thread.transport ?? 'XMTP-ready',
    memoryProvider: thread.memoryProvider ?? 'Sibyl-ready',
    inferenceProvider: thread.inferenceProvider ?? 'Bankr-ready',
    defaultMission: DEFAULT_CONSOLE_MISSION,
    messages: thread.messages,
    proposals: thread.proposals,
    savedMemory: thread.savedMemory,
    recalledMemory: thread.recalledMemory,
    missions: thread.missions,
    sessionReset: Boolean(thread.sessionReset),
    recalledMission: thread.recalledMission ?? null,
    canReset: hasRuntimeProof,
    summary: latestAgentMessage
      ? 'Saved. Proposal queue updated.'
      : thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
      : !connected
        ? 'Wallet required.'
      : loadingAgents
        ? 'Loading wallet-owned agents.'
      : rosterError
        ? 'Could not load wallet-owned agents.'
      : ownedAgents === 0
        ? 'No Helixa agents found for this wallet.'
        : 'Ready for mission input.',
  };
}

function createFlowState({ walletConnected, agentThread }) {
  const messageCount = Array.isArray(agentThread.messages) ? agentThread.messages.length : 0;
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  const recalledMemoryCount = Array.isArray(agentThread.recalledMemory) ? agentThread.recalledMemory.length : 0;
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const hasAgentBriefing = agentThread.messages?.some?.((message) => message.role === 'agent');
  return {
    wallet: walletConnected,
    agent: walletConnected && !agentThread.disabled,
    mission: messageCount > 0 || savedMemoryCount > 0,
    memory: savedMemoryCount > 0,
    briefing: Boolean(hasAgentBriefing || agentThread.sessionReset || recalledMemoryCount > 0),
    proposal: proposalCount > 0,
  };
}

function renderFlowPanel(steps = []) {
  return `
    <section class="console-flow-panel" aria-label="Console flow">
      <p class="card-label">Flow</p>
      <ol>
        ${steps.map(renderFlowStep).join('')}
      </ol>
    </section>
  `;
}

function renderFlowStep(step = {}) {
  return `
    <li class="${step.state === 'done' ? 'done' : 'open'}">
      <strong>${escapeHtml(step.label ?? '')}</strong>
      <span>${escapeHtml(step.state === 'done' ? 'Done' : 'Open')}</span>
    </li>
  `;
}

function renderNextAction(action = {}, wallet = {}) {
  const connecting = wallet.status === 'connecting';
  const unavailable = Boolean(wallet.unavailable);
  const ready = wallet.ready !== false;
  const connected = Boolean(wallet.connected);
  const buttonLabel = connecting
    ? 'Connecting...'
    : connected
      ? 'Reconnect'
      : 'Connect wallet';
  return `
    <section class="console-next-action" aria-label="Next action">
      <p class="card-label">Next</p>
      <strong>${escapeHtml(action.title ?? 'Connect wallet')}</strong>
      <span>${escapeHtml(action.body ?? 'Start the operator session.')}</span>
      ${connected || action.title === 'Connect wallet'
        ? `<button type="button" data-action="connect-console-wallet" ${connecting || unavailable || !ready ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>`
        : ''}
    </section>
  `;
}

function renderIdentityCard(card = {}) {
  return `
    <section class="console-visual-card console-identity-card" aria-label="Agent identity card">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(card.label ?? 'Agent identity')}</p>
        <span>${escapeHtml(card.walletLabel ?? 'Wallet required')}</span>
      </div>
      <div class="console-agent-portrait">
        <img src="${escapeAttribute(card.image ?? '/multipass/og-bendr-profile-capture.png')}" alt="${escapeAttribute(card.name ?? 'Agent profile')}" loading="lazy">
      </div>
      <div class="console-identity-body">
        <span>${escapeHtml(card.role ?? 'Onchain operator')}</span>
        <strong>${escapeHtml(card.name ?? 'Agent slot')}</strong>
        <div class="console-identity-stats">
          ${(card.stats ?? []).map(renderDashboardCard).join('')}
        </div>
        ${renderWalletPanel(card.wallet)}
      </div>
    </section>
  `;
}

function renderDashboardCard(card = {}) {
  return `
    <article class="console-mini-stat">
      <span>${escapeHtml(card.label ?? '')}</span>
      <strong>${escapeHtml(card.value ?? '')}</strong>
    </article>
  `;
}

function renderTrustGraphCard(graph = {}) {
  const nodes = graph.nodes ?? [];
  const tiers = graph.tiers ?? TRUST_TIERS;
  const markers = graph.markers ?? [];
  const guideDots = graph.guideDots ?? [];
  return `
    <section class="console-visual-card console-trust-graph-card" aria-label="Trust graph">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(graph.label ?? 'Trust graph')}</p>
        <span>${escapeHtml(graph.state ?? 'Awaiting wallet')}</span>
      </div>
      <div class="console-tier-strip" aria-label="Cred tier rings">
        ${tiers.map((tier) => `
          <span class="tier-${escapeAttribute(slugifyLabel(tier.label))} ${tier.active ? 'active' : ''}">
            <strong>${escapeHtml(tier.label)}</strong>
            ${escapeHtml(tier.range)}
          </span>
        `).join('')}
      </div>
      <div class="console-graph-visual">
        <div class="console-graph-halo" aria-hidden="true"></div>
        <div class="console-graph-halo-core" aria-hidden="true"></div>
        ${tiers.map((tier, index) => `<div class="console-graph-ring ring-${index + 1} ${tier.active ? 'active' : ''}"></div>`).join('')}
        ${guideDots.map((dot) => `
          <i class="console-graph-guide-dot size-${escapeAttribute(dot.size ?? 'sm')}" style="left: ${escapeAttribute(String(dot.x ?? 50))}%; top: ${escapeAttribute(String(dot.y ?? 50))}%;"></i>
        `).join('')}
        <div class="console-graph-core">
          <span>Cred</span>
          <strong>${escapeHtml(shortenLabel(graph.center ?? 'Agent'))}</strong>
        </div>
        ${markers.map((marker) => `
          <div class="console-graph-marker ${escapeAttribute(marker.className ?? 'tone-neutral')} ${escapeAttribute(marker.size ?? 'agent-small')} ${marker.image ? 'has-image' : 'has-label'}" style="left: ${escapeAttribute(String(marker.x ?? 50))}%; top: ${escapeAttribute(String(marker.y ?? 50))}%;" title="${escapeAttribute(marker.title ?? marker.label ?? '')}">
            ${marker.image
              ? `<img src="${escapeAttribute(marker.image)}" alt="${escapeAttribute(marker.title ?? marker.label ?? 'Agent marker')}" loading="lazy">`
              : `<span>${escapeHtml(marker.label ?? '')}</span>`}
          </div>
        `).join('')}
      </div>
      ${graph.summary ? `<p class="console-graph-summary">${escapeHtml(graph.summary)}</p>` : ''}
      <div class="console-graph-list" aria-label="Trust graph edges">
        ${nodes.map((node) => `
          <article>
            <span>${escapeHtml(node.label ?? node.edgeLabel ?? '')}</span>
            <strong>${escapeHtml(node.state ?? '')}</strong>
            <small>${escapeHtml(node.edgeLabel ?? '')}</small>
          </article>
        `).join('')}
      </div>
      ${graph.credSummary ? `<p class="console-cred-summary">${escapeHtml(graph.credSummary)}</p>` : ''}
    </section>
  `;
}

function renderSignalChartCard(chart = {}) {
  const lanes = chart.lanes ?? [];
  return `
    <section class="console-visual-card console-signal-chart-card" aria-label="Trust graph checks">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(chart.label ?? 'Graph checks')}</p>
        <span>${escapeHtml(chart.state ?? 'Watching')}</span>
      </div>
      <div class="console-check-stack">
        ${lanes.map((lane, index) => `
          <article class="${escapeAttribute(lane.className ?? 'open')}" style="--bar: ${escapeAttribute(String(Math.min(96, 36 + index * 9)))}%;">
            <span>${escapeHtml(lane.title ?? 'Check')}</span>
            <strong>${escapeHtml(lane.status ?? 'Watch')}</strong>
            <small>${escapeHtml(lane.body ?? '')}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderOperatorSlot(slot = {}) {
  return `
    <section class="console-operator-slot" aria-label="Agent slot">
      <span>${escapeHtml(slot.state ?? 'Unactivated')}</span>
      <strong>${escapeHtml(slot.label ?? 'Onchain Agent Slot')}</strong>
      <p>${escapeHtml(slot.copy ?? '')}</p>
    </section>
  `;
}

function renderWalletPanel(wallet = {}) {
  const connecting = wallet.status === 'connecting';
  const connected = Boolean(wallet.connected);
  const unavailable = Boolean(wallet.unavailable);
  const ready = wallet.ready !== false;
  const label = wallet.label ?? (unavailable ? 'Wallet unavailable' : 'Not connected');
  const buttonLabel = connecting
    ? 'Connecting...'
    : connected
      ? 'Reconnect'
      : 'Connect wallet';

  return `
    <section class="console-wallet-panel" aria-label="Wallet identity">
      <div>
        <p class="card-label">Wallet identity</p>
        <strong>${escapeHtml(label)}</strong>
        <p>${connected ? 'Connected' : 'Required'}</p>
      </div>
      <button type="button" data-action="connect-console-wallet" ${connecting || unavailable || !ready ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>
      ${wallet.error ? `<p class="console-wallet-error">${escapeHtml(wallet.error)}</p>` : ''}
    </section>
  `;
}

function renderStatusItem(item = {}) {
  return `<div><dt>${escapeHtml(item.label ?? '')}</dt><dd>${escapeHtml(item.value ?? '')}</dd></div>`;
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
  const openLink = agent.href ? `<a href="${escapeAttribute(agent.href)}">Open profile</a>` : '<span>Profile pending</span>';
  return `
    <article class="console-agent-card">
      <div>
        <strong>${escapeHtml(agent.name ?? 'Onchain agent')}</strong>
        <span>${escapeHtml(agent.role ?? 'Agent profile')}</span>
      </div>
      <dl>
        <div><dt>Cred</dt><dd>${escapeHtml(agent.cred ?? 'Cred pending')}</dd></div>
        <div><dt>State</dt><dd>${escapeHtml(agent.state ?? 'Review needed')}</dd></div>
      </dl>
      ${openLink}
    </article>
  `;
}

function renderMemoryCell(cell = {}) {
  return `
    <article>
      <strong>${escapeHtml(cell.label ?? 'Memory')}</strong>
      <p>${escapeHtml(cell.value ?? '')}</p>
    </article>
  `;
}

function renderMissionLane(lane = {}) {
  return `
    <article>
      <span>${escapeHtml(lane.status ?? 'Queued')}</span>
      <strong>${escapeHtml(lane.title ?? 'Mission')}</strong>
      <p>${escapeHtml(lane.body ?? '')}</p>
    </article>
  `;
}

function renderSignalModule(signal = {}) {
  return `
    <article>
      <span>${escapeHtml(signal.status ?? 'Watch')}</span>
      <strong>${escapeHtml(signal.title ?? 'Signal')}</strong>
      <p>${escapeHtml(signal.body ?? '')}</p>
    </article>
  `;
}

function countPublicFragments(data = {}) {
  return Array.isArray(data.fragments?.fragments)
    ? data.fragments.fragments.filter((fragment) => fragment?.visibility === 'public').length
    : 0;
}

function createNextAction({ walletConnected = false, agentThread = {}, proposalCount = 0, activeAgentCount = 0, agentRosterStatus = 'idle' } = {}) {
  const messageCount = Array.isArray(agentThread.messages) ? agentThread.messages.length : 0;
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  if (!walletConnected) {
    return {
      title: 'Connect wallet',
      body: 'Agent identity, memory, and review state stay tied to your wallet.',
    };
  }
  if (agentRosterStatus === 'loading') {
    return {
      title: 'Loading agents',
      body: 'Checking the live Helixa directory for wallet-owned agents.',
    };
  }
  if (agentRosterStatus === 'error') {
    return {
      title: 'Retry agent load',
      body: 'Live ownership lookup failed, so the Console is not showing a synthetic roster.',
    };
  }
  if (activeAgentCount === 0) {
    return {
      title: 'No owned agents',
      body: 'This wallet needs a real Helixa agent record before the Console can attach a mission.',
    };
  }
  if (proposalCount > 0) {
    return {
      title: 'Review proposal',
      body: `${proposalCount} proposal${proposalCount === 1 ? '' : 's'} waiting for human approval.`,
    };
  }
  if (messageCount > 0 || savedMemoryCount > 0) {
    return {
      title: 'Keep watching',
      body: 'Mission memory is saved; trust checks shape the next briefing.',
    };
  }
  return {
    title: 'Save mission',
    body: 'Tell the agent what to watch before it prepares a briefing.',
  };
}

function createTrustGraphModel({
  walletConnected = false,
  connectedWallet = 'Not connected',
  agentRosterStatus = 'idle',
  activeAgents = [],
  activeAgent = {},
  activeAgentLabel = 'Agent slot',
  activeCred = 'Cred pending',
  activeTier = null,
  agentThread = {},
  publicProofCount = 0,
  savedMemoryCount = 0,
  proposalCount = 0,
  routeCount = 0,
  standardsCount = 0,
  activeAgentCount = 0,
} = {}) {
  const proofState = publicProofCount === 1 ? '1 live signal' : `${publicProofCount} live signals`;
  const ownerState = walletConnected
    ? `Bound ${connectedWallet}`
    : 'Awaiting wallet';
  const agentDnaState = activeAgent.helixaId
    ?? (walletConnected ? 'No owned agent' : 'Connect wallet');
  const intuitionState = formatIntuitionState(activeAgent.intuition);
  const memoryState = savedMemoryCount
    ? `${savedMemoryCount} saved`
    : 'Memory ready';
  const reviewState = proposalCount
    ? `${proposalCount} queued`
    : 'Human approval';
  const nodes = [
    { key: 'wallet', label: 'Wallet', edgeLabel: 'owner / wallet', state: ownerState, visualState: ownerState, className: walletConnected ? 'ready orbit-wallet' : 'open orbit-wallet' },
    { key: 'identity', label: 'AgentDNA', edgeLabel: 'identity anchor', state: agentDnaState, visualState: agentDnaState, className: 'standard orbit-identity' },
    { key: 'intuition', label: 'Intuition', edgeLabel: 'graph proof', state: intuitionState, visualState: intuitionState, className: intuitionState === 'Not published' ? 'open orbit-intuition' : 'proof orbit-intuition' },
    { key: 'proof', label: 'Proof', edgeLabel: 'public proof', state: proofState, visualState: `${publicProofCount} proof`, className: publicProofCount ? 'proof orbit-proof' : 'open orbit-proof' },
    { key: 'review', label: 'Review', edgeLabel: 'human approval', state: 'Human approves actions', visualState: 'Review-only', className: 'review orbit-review' },
  ];
  const tiers = TRUST_TIERS.map((tier) => ({
    ...tier,
    active: tier.label === activeTier,
  }));
  const { markers, guideDots } = createTrustGraphField({ activeAgents, nodes });
  const summary = !walletConnected
    ? 'Connect a wallet to load real owned agents into the graph.'
    : agentRosterStatus === 'loading'
      ? 'Loading real wallet-owned agents from the live Helixa directory.'
      : activeAgentCount === 0
        ? 'No live wallet-owned agents were found, so the Console is not inventing halo members.'
        : activeAgentCount === 1
          ? 'Live wallet-owned field. The halo shows the connected wallet and the active agent only.'
          : `Live wallet-owned field. The halo only shows agents owned by this wallet (${activeAgentCount} loaded).`;

  return {
    label: 'Trust Graph v2',
    center: activeAgentLabel,
    state: activeTier ? `Cred ring: ${activeTier}` : 'Awaiting score',
    summary,
    nodes,
    markers,
    guideDots,
    tiers,
    activeTier,
    credSummary: activeTier ? `Cred tier: ${activeTier} (${getCredTierRange(activeTier)}). Memory informs briefings; actions still wait for you.` : null,
  };
}

function createTrustGraphField({ activeAgents = [], nodes = [] } = {}) {
  const nodeMap = new Map(nodes.map((node) => [node.key, node]));
  const supportMarkers = TRUST_GRAPH_SUPPORT_LAYOUT.map((slot, index) => {
    const node = nodeMap.get(slot.key);
    return {
      ...slot,
      label: getSupportGlyph(slot.key),
      title: node?.label ?? slot.key,
      className: `support-marker ${pickGraphTone(index)}`,
    };
  });
  const roster = expandGraphRoster(activeAgents, TRUST_GRAPH_AGENT_LAYOUT.length);
  const agentMarkers = roster.map((agent, index) => {
    const slot = TRUST_GRAPH_AGENT_LAYOUT[index] ?? TRUST_GRAPH_AGENT_LAYOUT[TRUST_GRAPH_AGENT_LAYOUT.length - 1];
    return {
      ...slot,
      label: getGraphMarkerLabel(agent.name ?? `Agent ${index + 1}`),
      image: agent.image ?? null,
      title: agent.name
        ? `${agent.name}${agent.credScore === null || agent.credScore === undefined ? '' : ` · Cred ${agent.credScore}`}`
        : `Agent ${index + 1}`,
      className: `agent-marker ${pickGraphTone(index + supportMarkers.length)}`,
    };
  });

  return {
    markers: [...agentMarkers, ...supportMarkers],
    guideDots: TRUST_GRAPH_GUIDE_DOT_LAYOUT.map((dot) => ({ ...dot })),
  };
}

function expandGraphRoster(agents = [], count = 0) {
  const roster = agents.filter(Boolean);
  if (!roster.length || count <= 0) return [];
  return roster.slice(0, count);
}

function getSupportGlyph(key) {
  if (key === 'wallet') return 'W';
  if (key === 'identity') return 'ID';
  if (key === 'intuition') return 'IX';
  if (key === 'proof') return 'PF';
  if (key === 'review') return 'RV';
  return 'AG';
}

function getGraphMarkerLabel(value) {
  const parts = String(value ?? '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'AG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function pickGraphTone(index = 0) {
  return ['tone-gold', 'tone-emerald', 'tone-violet', 'tone-rose', 'tone-sky'][index % 5];
}

function createSignalModules({
  walletConnected = false,
  connectedWallet = 'Not connected',
  activeCred = 'Cred pending',
  activeTier = null,
  routeCount = 0,
  standardsCount = 0,
  publicProofCount = 0,
  savedMemoryCount = 0,
  proposalCount = 0,
} = {}) {
  return [
    {
      title: 'Identity proof',
      status: standardsCount ? `${standardsCount} standards` : 'Pending',
      body: publicProofCount ? `${publicProofCount} public proof fragments` : 'No public proof loaded',
      className: publicProofCount ? 'ready' : 'open',
    },
    {
      title: 'Owner wallet',
      status: walletConnected ? connectedWallet : 'Required',
      body: 'Controls the console session scope',
      className: walletConnected ? 'ready' : 'open',
    },
    {
      title: 'Public routes',
      status: routeCount ? `${routeCount} routes` : 'None',
      body: 'Contact, service, and discovery endpoints',
      className: routeCount ? 'ready' : 'open',
    },
    {
      title: 'Cred tier',
      status: activeTier ?? 'Pending',
      body: activeCred,
      className: activeTier ? 'ready' : 'open',
    },
    {
      title: 'Memory',
      status: savedMemoryCount ? `${savedMemoryCount} saved` : 'Ready',
      body: 'Private recall for this wallet and mission',
      className: savedMemoryCount ? 'ready' : 'open',
    },
    {
      title: 'Approval gate',
      status: proposalCount ? `${proposalCount} queued` : 'Human review',
      body: 'Briefs and proposals wait for approval',
      className: proposalCount ? 'ready' : 'open',
    },
  ];
}

function shortenAddress(address) {
  const value = String(address ?? '').trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function countStandards(data = {}) {
  const profileStandards = data.profile?.standards_profile?.supported_standard_ids;
  if (Array.isArray(profileStandards)) return profileStandards.filter(Boolean).length;
  const standardRefs = data.standards?.standard_refs;
  if (Array.isArray(standardRefs)) return standardRefs.filter(Boolean).length;
  const cardStandards = data.card?.standards_refs;
  if (Array.isArray(cardStandards)) return cardStandards.filter(Boolean).length;
  return 0;
}

function firstStandardId(data = {}) {
  return data.profile?.standards_profile?.supported_standard_ids?.find(Boolean)
    ?? data.standards?.standard_refs?.find((standard) => standard?.standard_id)?.standard_id
    ?? data.card?.standards_refs?.find((standard) => standard?.standard_id)?.standard_id
    ?? null;
}

function countPublicRoutes(data = {}) {
  const card = data.card ?? {};
  const messageRoutes = Array.isArray(card.message_routes)
    ? card.message_routes.filter((route) => route?.visibility !== 'private').length
    : 0;
  const endpoints = Array.isArray(card.service_endpoints)
    ? card.service_endpoints.filter((endpoint) => endpoint?.visibility !== 'private').length
    : 0;
  const routeFragments = Array.isArray(data.fragments?.fragments)
    ? data.fragments.fragments.filter((fragment) => fragment?.visibility === 'public' && fragment?.fragment_type === 'endpoint').length
    : 0;
  return messageRoutes + endpoints + routeFragments;
}

function formatIntuitionState(intuition) {
  if (!intuition || typeof intuition !== 'object') return 'Not published';
  const label = String(intuition.label ?? intuition.status ?? '').trim();
  const canonical = String(intuition.canonicalAgentId ?? '').trim();
  const shortLabel = label || 'Published';
  return canonical ? `${shortLabel} ${canonical}` : shortLabel;
}

function formatGraphState(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatOwnedAgentStatus(count, status) {
  if (status === 'loading') return 'Loading...';
  if (status === 'error') return 'Lookup failed';
  if (count === 0) return '0 owned';
  return `${count} owned`;
}

function normalizeCredScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getCredTier(score) {
  if (score === null) return null;
  if (score >= 91) return 'Preferred';
  if (score >= 76) return 'Prime';
  if (score >= 51) return 'Qualified';
  if (score >= 26) return 'Marginal';
  return 'Junk';
}

function getCredTierRange(tierLabel) {
  return TRUST_TIERS.find((tier) => tier.label === tierLabel)?.range ?? '';
}

function shortenLabel(value) {
  const text = String(value ?? '').trim();
  if (text.length <= 12) return text;
  return text.slice(0, 12);
}

function shortenGraphNodeState(value) {
  const text = String(value ?? '').trim();
  if (text.length <= 16) return text;
  return `${text.slice(0, 15)}...`;
}

function slugifyLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'value';
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

import { renderConsoleAgentThread } from './console-agent-thread.js';

const CONSOLE_SAFETY_NOTE = 'Review-only console. No trades. No custody transfer. No tool authority.';

const DEFAULT_MEMORY_CELLS = [
  {
    label: 'Identity anchor',
    value: 'AgentDNA + owner',
  },
  {
    label: 'Private recall',
    value: 'Sibyl memory',
  },
  {
    label: 'Decision gate',
    value: 'Review queue',
  },
];

const DEFAULT_MISSION_LANES = [
  {
    title: 'Connect',
    status: 'Wallet',
    body: 'Scope the operator.',
  },
  {
    title: 'Brief',
    status: 'Mission',
    body: 'Save the mandate.',
  },
  {
    title: 'Approve',
    status: 'Proposal',
    body: 'Keep execution separate.',
  },
];

const DEFAULT_SIGNAL_MODULES = [
  {
    title: 'Tokenized equities',
    status: '+12.4%',
    body: 'NVDAx / AAPLx',
  },
  {
    title: 'Vaults',
    status: '3 routes',
    body: 'Yield / custody / risk',
  },
  {
    title: 'Agent assets',
    status: '+7.8%',
    body: 'Base agents / $CRED',
  },
];

const DEFAULT_CONSOLE_MISSION = 'Track tokenized equities, vaults, Base agent assets, and $CRED. Review-only proposals.';

const FLOW_STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'activation', label: 'Activation' },
  { key: 'mission', label: 'Mission' },
  { key: 'memory', label: 'Memory' },
  { key: 'recall', label: 'Recall' },
  { key: 'briefing', label: 'Brief' },
  { key: 'proposal', label: 'Proposal' },
];

const TRUST_TIERS = [
  { label: 'Preferred', range: '91-100' },
  { label: 'Prime', range: '76-90' },
  { label: 'Qualified', range: '51-75' },
  { label: 'Marginal', range: '26-50' },
  { label: 'Junk', range: '0-25' },
];

export function createMultipassConsoleSnapshot({ data = {}, state = {}, agents = [] } = {}) {
  const profile = data.profile ?? {};
  const wallet = state.walletSnapshot ?? {};
  const walletConnected = Boolean(wallet.connected && wallet.address);
  const publicProofCount = countPublicFragments(data);
  const activeAgents = agents.length ? agents : createFallbackAgents(data);
  const connectedWallet = walletConnected
    ? shortenAddress(wallet.address)
    : (wallet.configured === false ? 'Wallet unavailable' : 'Not connected');

  const agentThread = createAgentThreadSnapshot(state);
  const flowState = createFlowState({ walletConnected, agentThread });
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const activeAgentLabel = activeAgents[0]?.name ?? profile.display_name ?? 'Agent slot';
  const activeAgent = activeAgents[0] ?? {};
  const activeScore = normalizeCredScore(activeAgent.credScore ?? profile.cred_summary?.score);
  const activeTier = getCredTier(activeScore);
  const activeCred = activeAgent.credLabel ?? (activeScore === null ? 'Cred pending' : `Cred ${activeScore}`);
  const nextAction = createNextAction({ walletConnected, agentThread, proposalCount });
  const trustGraph = createTrustGraphModel({
    data,
    walletConnected,
    connectedWallet,
    activeAgent,
    activeAgentLabel,
    activeCred,
    activeTier,
    agentThread,
    publicProofCount,
    savedMemoryCount,
    proposalCount,
  });

  return {
    title: 'Multipass Console',
    kicker: 'Console',
    headline: 'Multipass Console',
    lead: 'Operator identity, mission memory, live signals, and review-only proposals in one wallet-scoped command room.',
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
      { label: 'Agents visible', value: activeAgents.length || 0 },
      { label: 'Public proof', value: publicProofCount },
      { label: 'Mode', value: 'Human review' },
    ],
    flowSteps: FLOW_STEPS.map((step) => ({
      ...step,
      state: flowState[step.key] ? 'done' : 'open',
    })),
    identityCard: {
      label: 'Operator status',
      name: activeAgentLabel,
      role: activeAgent.role ?? profile.subject_type ?? 'Onchain operator',
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
        { label: 'State', value: walletConnected ? 'Active' : 'Standby' },
        { label: 'Memory', value: savedMemoryCount || 'Ready' },
      ],
    },
    trustGraph,
    signalChart: {
      label: 'Signal card',
      title: 'Mission watch',
      state: proposalCount ? `${proposalCount} review queued` : 'Watching',
      points: [28, 44, 38, 61, 56, 73, 68, 84],
      lanes: DEFAULT_SIGNAL_MODULES,
    },
    operatorSlot: {
      label: walletConnected ? activeAgentLabel : 'Operator slot',
      state: walletConnected ? 'Active' : 'Inactive',
      copy: walletConnected
        ? 'Identity attached.'
        : 'Wallet required.',
    },
    agents: activeAgents.slice(0, 5).map((agent) => ({
      name: agent.name ?? profile.display_name ?? 'Onchain agent',
      role: agent.role ?? agent.framework ?? 'Agent profile',
      cred: agent.credLabel ?? (agent.credScore === null || agent.credScore === undefined ? 'Cred pending' : `Cred ${agent.credScore}`),
      state: agent.verified ? 'Verified profile' : 'Review needed',
      href: agent.href ?? null,
    })),
    memoryCells: DEFAULT_MEMORY_CELLS,
    missionLanes: DEFAULT_MISSION_LANES,
    signalModules: DEFAULT_SIGNAL_MODULES,
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

      <section class="console-command-strip" aria-label="Console status">
        ${renderNextAction(snapshot.nextAction)}
        <dl class="console-status-strip">
          ${(snapshot.status ?? []).map(renderStatusItem).join('')}
        </dl>
        ${renderFlowPanel(snapshot.flowSteps)}
      </section>

      <section class="console-control-grid" aria-label="Console controls">
        ${renderIdentityCard(snapshot.identityCard)}
        ${renderTrustGraphCard(snapshot.trustGraph)}
        ${renderSignalChartCard(snapshot.signalChart)}
      </section>

      ${renderConsoleAgentThread(snapshot.agentThread)}

      <section class="console-grid" aria-label="Console operating layers">
        <div class="console-panel">
          <div class="console-panel-heading">
            <p class="card-label">Memory</p>
            <h2>Memory state</h2>
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

      <section id="console-signals" class="console-panel console-signals-panel" aria-label="Market and agent signals">
        <div class="console-panel-heading">
          <p class="card-label">Signals</p>
          <h2>Signal lanes</h2>
        </div>
        <div class="console-signal-grid">
          ${(snapshot.signalModules ?? []).map(renderSignalModule).join('')}
        </div>
      </section>

      <section id="console-agents" class="console-panel console-agent-panel" aria-label="Onchain agents">
        <div class="console-panel-heading">
          <p class="card-label">Agents</p>
          <h2>Agent records</h2>
        </div>
        <div class="console-agent-list">
          ${(snapshot.agents ?? []).map(renderAgentCard).join('')}
        </div>
      </section>
    </main>
  `;
}

function createAgentThreadSnapshot(state = {}) {
  const wallet = state.walletSnapshot ?? {};
  const connected = Boolean(wallet.connected && wallet.address);
  const thread = state.consoleAgentThread ?? {};
  const latestAgentMessage = thread.messages?.findLast?.((message) => message.role === 'agent');
  const hasRuntimeProof = Boolean(thread.messages?.length || thread.proposals?.length || thread.savedMemory?.length);
  return {
    status: thread.status ?? 'idle',
    disabled: !connected,
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
      : connected
        ? 'Ready for mission input.'
        : 'Wallet required.',
  };
}

function createFlowState({ walletConnected, agentThread }) {
  const messageCount = Array.isArray(agentThread.messages) ? agentThread.messages.length : 0;
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  const recalledMemoryCount = Array.isArray(agentThread.recalledMemory) ? agentThread.recalledMemory.length : 0;
  const proposalCount = Array.isArray(agentThread.proposals) ? agentThread.proposals.length : 0;
  const hasAgentBriefing = agentThread.messages?.some?.((message) => message.role === 'agent');
  return {
    identity: walletConnected,
    activation: walletConnected,
    mission: messageCount > 0 || savedMemoryCount > 0,
    memory: savedMemoryCount > 0,
    recall: Boolean(agentThread.sessionReset || recalledMemoryCount > 0),
    briefing: Boolean(hasAgentBriefing),
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

function renderNextAction(action = {}) {
  return `
    <section class="console-next-action" aria-label="Next action">
      <p class="card-label">Next</p>
      <strong>${escapeHtml(action.title ?? 'Connect wallet')}</strong>
      <span>${escapeHtml(action.body ?? 'Start the operator session.')}</span>
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
  const edges = graph.edges ?? [];
  return `
    <section class="console-visual-card console-trust-graph-card" aria-label="Trust graph">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(graph.label ?? 'Trust graph')}</p>
        <span>${escapeHtml(graph.state ?? 'Awaiting wallet')}</span>
      </div>
      <div class="console-graph-visual">
        <svg class="console-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${edges.map((edge) => `
            <line x1="50" y1="50" x2="${escapeAttribute(edge.x)}" y2="${escapeAttribute(edge.y)}"></line>
          `).join('')}
        </svg>
        <div class="console-graph-core">
          <span>Profile</span>
          <strong>${escapeHtml(shortenLabel(graph.center ?? 'Agent'))}</strong>
        </div>
        ${nodes.map((node) => `
          <article class="console-graph-node ${escapeAttribute(node.className ?? 'open')}" style="--x: ${escapeAttribute(node.x)}%; --y: ${escapeAttribute(node.y)}%;">
            <span>${escapeHtml(node.label ?? '')}</span>
            <strong>${escapeHtml(node.state ?? '')}</strong>
          </article>
        `).join('')}
      </div>
      <div class="console-graph-list" aria-label="Trust graph edges">
        ${nodes.map((node) => `
          <article>
            <span>${escapeHtml(node.edgeLabel ?? node.label ?? '')}</span>
            <strong>${escapeHtml(node.state ?? '')}</strong>
          </article>
        `).join('')}
      </div>
      ${graph.credSummary ? `<p class="console-cred-summary">${escapeHtml(graph.credSummary)}</p>` : ''}
    </section>
  `;
}

function renderSignalChartCard(chart = {}) {
  const points = chart.points ?? [];
  const lanes = chart.lanes ?? [];
  const markerStyle = (value, index) => `left: ${Math.max(4, Math.min(96, 8 + index * 12.5))}%; bottom: ${Math.max(12, Math.min(88, Number(value) || 0))}%;`;

  return `
    <section class="console-visual-card console-signal-chart-card" aria-label="Signal chart">
      <div class="console-card-head">
        <p class="card-label">${escapeHtml(chart.label ?? 'Signal chart')}</p>
        <span>${escapeHtml(chart.state ?? 'Watching')}</span>
      </div>
      <div class="console-chart-visual" aria-hidden="true">
        <div class="console-chart-grid"></div>
        <div class="console-chart-line"></div>
        ${points.map((point, index) => `<i style="${escapeAttribute(markerStyle(point, index))}"></i>`).join('')}
      </div>
      <div class="console-chart-lanes">
        ${lanes.map((lane, index) => `
          <article style="--bar: ${escapeAttribute(String(Math.min(96, 42 + index * 17)))}%;">
            <span>${escapeHtml(lane.title ?? 'Signal')}</span>
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
      : ready
        ? 'Connect wallet'
        : 'Loading wallet...';

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

function createFallbackAgents(data = {}) {
  const card = data.card ?? {};
  const profile = data.profile ?? {};
  const name = card.name ?? profile.display_name;
  if (!name) return [];
  return [{
    name,
    role: profile.subject_type ?? 'agent',
    credScore: profile.cred_summary?.score ?? null,
    verified: card.trust_summary?.identity_status === 'verified',
  }];
}

function createNextAction({ walletConnected = false, agentThread = {}, proposalCount = 0 } = {}) {
  const messageCount = Array.isArray(agentThread.messages) ? agentThread.messages.length : 0;
  const savedMemoryCount = Array.isArray(agentThread.savedMemory) ? agentThread.savedMemory.length : 0;
  if (!walletConnected) {
    return {
      title: 'Connect wallet',
      body: 'Operator, memory, and mission state stay wallet-scoped.',
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
      body: 'Mission memory is saved; new signals feed the next briefing.',
    };
  }
  return {
    title: 'Save mission',
    body: 'Tell the operator what to watch before it prepares proposals.',
  };
}

function createTrustGraphModel({
  data = {},
  walletConnected = false,
  connectedWallet = 'Not connected',
  activeAgent = {},
  activeAgentLabel = 'Agent slot',
  activeCred = 'Cred pending',
  activeTier = null,
  agentThread = {},
  publicProofCount = 0,
  savedMemoryCount = 0,
  proposalCount = 0,
} = {}) {
  const profile = data.profile ?? {};
  const card = data.card ?? {};
  const standardsCount = countStandards(data);
  const routeCount = countPublicRoutes(data);
  const proofState = publicProofCount === 1 ? '1 public fragment' : `${publicProofCount} public fragments`;
  const ownerState = walletConnected
    ? `Bound ${connectedWallet}`
    : formatGraphState(profile.owner_summary?.owner_state ?? 'unclaimed');
  const agentDnaState = activeAgent.helixaId
    ?? (activeAgent.tokenId === null || activeAgent.tokenId === undefined ? null : `8453:${activeAgent.tokenId}`)
    ?? firstStandardId(data)
    ?? 'ERC-8004 ready';
  const intuitionState = formatIntuitionState(activeAgent.intuition ?? card.intuition);
  const credState = activeTier ? `${activeCred} / ${activeTier}` : activeCred;
  const memoryState = savedMemoryCount
    ? `${savedMemoryCount} Sibyl saved`
    : (agentThread.memoryProvider ?? 'Sibyl-ready');
  const reviewState = proposalCount
    ? `${proposalCount} queued`
    : 'Review-only';
  const routeState = routeCount
    ? `${routeCount} public route${routeCount === 1 ? '' : 's'}`
    : 'No public routes';
  const standardsState = standardsCount
    ? `${standardsCount} standard${standardsCount === 1 ? '' : 's'}`
    : agentDnaState;

  const nodes = [
    { key: 'owner', label: 'Owner', edgeLabel: 'owner / wallet', state: ownerState, x: 16, y: 22, className: walletConnected ? 'ready' : 'open' },
    { key: 'agentdna', label: 'AgentDNA', edgeLabel: 'identity anchor', state: agentDnaState, x: 50, y: 12, className: 'standard' },
    { key: 'cred', label: 'Cred', edgeLabel: 'trust score', state: credState, x: 84, y: 22, className: 'cred' },
    { key: 'intuition', label: 'Intuition', edgeLabel: 'identity graph', state: intuitionState, x: 84, y: 48, className: intuitionState === 'Not published' ? 'open' : 'proof' },
    { key: 'routes', label: 'Routes', edgeLabel: 'public routes', state: routeState, x: 78, y: 76, className: routeCount ? 'route' : 'open' },
    { key: 'memory', label: 'Memory', edgeLabel: 'private recall', state: memoryState, x: 50, y: 88, className: savedMemoryCount ? 'ready' : 'runtime' },
    { key: 'review', label: 'Review', edgeLabel: 'proposal gate', state: reviewState, x: 22, y: 76, className: proposalCount ? 'ready' : 'review' },
    { key: 'proof', label: 'Public proof', edgeLabel: 'public proof', state: proofState, x: 16, y: 48, className: publicProofCount ? 'proof' : 'open' },
  ];

  return {
    label: 'Trust Graph v2',
    center: activeAgentLabel,
    state: `${proofState} / ${standardsState}`,
    nodes,
    edges: nodes.map((node) => ({
      x: node.x,
      y: node.y,
      label: node.edgeLabel,
      labelX: midpoint(50, node.x),
      labelY: midpoint(50, node.y),
    })),
    activeTier,
    credSummary: activeTier ? `Cred tier: ${activeTier} (${getCredTierRange(activeTier)}). Confidence signal only; approvals stay human-gated.` : null,
  };
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

function midpoint(a, b) {
  return String(Math.round((Number(a) + Number(b)) / 2));
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

import { renderConsoleAgentThread } from './console-agent-thread.js';

const CONSOLE_SAFETY_NOTE = 'Read, recall, and proposal surface only. Multipass Console does not place trades, transfer custody, release credentials, or grant tool authority from this view.';

const DEFAULT_MEMORY_CELLS = [
  {
    label: 'Identity',
    value: 'Wallet, AgentDNA, and public proof context stay attached to the selected onchain agent.',
  },
  {
    label: 'Recall',
    value: 'Session notes, user preferences, tracked assets, and prior recommendations return when the agent resumes.',
  },
  {
    label: 'Outcomes',
    value: 'Completed missions and result receipts feed the next recommendation instead of disappearing into chat history.',
  },
];

const DEFAULT_MISSION_LANES = [
  {
    title: 'Activate',
    status: 'Ready',
    body: 'Turn a public agent record into a managed Multipass profile with owner-safe metadata controls.',
  },
  {
    title: 'Research',
    status: 'Queued',
    body: 'Assign market, vault, token, route, or partner diligence work to the selected agent.',
  },
  {
    title: 'Review',
    status: 'Human gate',
    body: 'Inspect agent rationale, memory context, public proofs, and proposed next action before anything leaves the console.',
  },
];

const DEFAULT_SIGNAL_MODULES = [
  {
    title: 'Tokenized equities',
    status: 'Watch',
    body: 'Track names like NVDAx or AAPLx as remembered watchlist items, not one-off prompts.',
  },
  {
    title: 'Vaults',
    status: 'Compare',
    body: 'Compare vault thesis, custody notes, yield claims, and remembered risk preferences before a proposal is drafted.',
  },
  {
    title: 'Agent assets',
    status: 'Route',
    body: 'Monitor onchain agent tokens, LPs, and marketplace signals alongside the agent identity record.',
  },
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

  return {
    title: 'Multipass Console',
    kicker: 'Onchain agent operations',
    headline: 'Human-facing control for agents that remember.',
    lead: 'A focused Multipass surface for wallet identity, persistent memory, missions, signals, and human-reviewed onchain action proposals.',
    safetyNote: CONSOLE_SAFETY_NOTE,
    wallet: {
      connected: walletConnected,
      unavailable: wallet.configured === false,
      ready: wallet.ready !== false,
      label: walletConnected ? (wallet.label ?? shortenAddress(wallet.address)) : connectedWallet,
      status: state.consoleWalletStatus ?? null,
      error: state.consoleWalletError ?? null,
    },
    status: [
      { label: 'Wallet', value: connectedWallet },
      { label: 'Agents', value: activeAgents.length || 0 },
      { label: 'Public proof', value: publicProofCount },
      { label: 'Mode', value: 'Human review' },
    ],
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
    agentThread: createAgentThreadSnapshot(state),
    recall: {
      title: 'Fresh-session recall',
      body: 'The demo should restart cold, reconnect the wallet, and show the selected agent still knows what it was tracking, why it mattered, and what the next human-reviewed move should be.',
    },
  };
}

export function renderMultipassConsole(snapshot = {}) {
  return `
    <main class="multipass-console" aria-label="Multipass Console">
      <section class="console-hero">
        <div class="console-hero-copy">
          <p class="eyebrow">${escapeHtml(snapshot.kicker ?? 'Onchain agent operations')}</p>
          <h1>${escapeHtml(snapshot.headline ?? 'Human-facing control for agents that remember.')}</h1>
          <p class="lead">${escapeHtml(snapshot.lead ?? '')}</p>
          <div class="homepage-actions console-actions">
            <a href="#console-agents" class="homepage-action primary">View agents</a>
            <a href="#console-signals" class="homepage-action">Open signals</a>
          </div>
        </div>
        <div class="console-identity-stack">
          ${renderWalletPanel(snapshot.wallet)}
          <dl class="console-status-grid" aria-label="Console status">
            ${(snapshot.status ?? []).map(renderStatusItem).join('')}
          </dl>
        </div>
      </section>

      <section id="console-agents" class="console-panel console-agent-panel" aria-label="Onchain agents">
        <div class="console-panel-heading">
          <p class="card-label">Agents</p>
          <h2>Operate from the agent record.</h2>
          <p>Pick the agent, inspect its public profile context, then use memory and mission state to decide what happens next.</p>
        </div>
        <div class="console-agent-list">
          ${(snapshot.agents ?? []).map(renderAgentCard).join('')}
        </div>
      </section>

      ${renderConsoleAgentThread(snapshot.agentThread)}

      <section class="console-grid" aria-label="Console operating layers">
        <div class="console-panel">
          <div class="console-panel-heading">
            <p class="card-label">Memory</p>
            <h2>Context survives the session.</h2>
          </div>
          <div class="console-memory-list">
            ${(snapshot.memoryCells ?? []).map(renderMemoryCell).join('')}
          </div>
        </div>
        <div class="console-panel">
          <div class="console-panel-heading">
            <p class="card-label">Missions</p>
            <h2>Work gets assigned, tracked, and reviewed.</h2>
          </div>
          <div class="console-mission-list">
            ${(snapshot.missionLanes ?? []).map(renderMissionLane).join('')}
          </div>
        </div>
      </section>

      <section id="console-signals" class="console-panel console-signals-panel" aria-label="Market and agent signals">
        <div class="console-panel-heading">
          <p class="card-label">Signals</p>
          <h2>Market interfaces without making the console a trading app.</h2>
          <p>Signals are remembered watchlists, briefs, risk notes, and human-confirmed action proposals for onchain agents.</p>
        </div>
        <div class="console-signal-grid">
          ${(snapshot.signalModules ?? []).map(renderSignalModule).join('')}
        </div>
      </section>

      <section class="console-panel console-recall-panel" aria-label="Hackathon recall demo">
        <div>
          <p class="card-label">Hackathon proof</p>
          <h2>${escapeHtml(snapshot.recall?.title ?? 'Fresh-session recall')}</h2>
          <p>${escapeHtml(snapshot.recall?.body ?? '')}</p>
        </div>
        <p class="console-safety-note">${escapeHtml(snapshot.safetyNote ?? CONSOLE_SAFETY_NOTE)}</p>
      </section>
    </main>
  `;
}

function createAgentThreadSnapshot(state = {}) {
  const wallet = state.walletSnapshot ?? {};
  const connected = Boolean(wallet.connected && wallet.address);
  const thread = state.consoleAgentThread ?? {};
  const latestAgentMessage = thread.messages?.findLast?.((message) => message.role === 'agent');
  return {
    status: thread.status ?? 'idle',
    disabled: !connected,
    error: thread.error ?? null,
    transport: thread.transport ?? 'XMTP-ready',
    memoryProvider: thread.memoryProvider ?? 'Sibyl-ready',
    inferenceProvider: thread.inferenceProvider ?? 'Bankr-ready',
    messages: thread.messages,
    proposals: thread.proposals,
    summary: latestAgentMessage
      ? 'The hosted worker answered with Looper context, memory state, and review-only action rules.'
      : connected
        ? 'Send a message to the hosted worker. The response path is Bankr-ready and the memory path is Sibyl-ready.'
        : 'Connect a wallet to unlock the agent thread.',
  };
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
        <p>${connected ? 'Operator context is attached to this wallet for the current Console session.' : 'No operator wallet is attached to this Console session.'}</p>
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

function shortenAddress(address) {
  const value = String(address ?? '').trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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

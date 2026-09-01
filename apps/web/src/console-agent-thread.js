export function renderConsoleAgentThread(thread = {}) {
  const participants = Array.isArray(thread.participants) ? thread.participants.filter(Boolean) : [];
  const contextItems = Array.isArray(thread.contextItems) ? thread.contextItems.filter(Boolean).slice(0, 6) : [];
  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : [{
      role: 'agent',
      text: thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
        : (thread.summary ?? 'Connect a wallet to start.'),
      transport: thread.transport ?? 'xmtp_local',
      senderLabel: participants[0]?.displayName ?? thread.agentName ?? 'Selected agent',
    }];
  const proposals = Array.isArray(thread.proposals) ? thread.proposals : [];
  const sending = thread.status === 'sending';
  const disabled = Boolean(thread.disabled || sending);
  const agentName = thread.agentName ?? 'Selected agent';
  const roomName = String(thread.roomName ?? '').trim() || `${agentName} room`;
  const roomSummary = createRoomSummary(messages, proposals);
  const participantSummary = createParticipantSummary(participants);
  const recall = thread.recall ?? null;

  return `
    <section class="console-panel console-agent-thread-panel" aria-label="Live agent chat">
      <header class="console-thread-shell-header">
        <div class="console-thread-shell-heading">
          <p class="card-label">Agent room</p>
          <div class="console-thread-title-row">
            <span class="console-thread-title-mark" aria-hidden="true">#</span>
            <h2>${escapeHtml(roomName)}</h2>
          </div>
          <p>${escapeHtml(thread.summary ?? 'Live chat ready.')}</p>
        </div>
        <div class="console-thread-shell-meta" aria-label="Room summary">
          <strong>${escapeHtml(agentName)}</strong>
          <span>${escapeHtml(roomSummary)}</span>
        </div>
      </header>
      ${participants.length ? `
        <div class="console-thread-members" aria-label="Room participants">
          <span class="console-thread-members-label">${escapeHtml(participantSummary)}</span>
          <div class="console-thread-member-list">
            ${participants.map(renderParticipantPill).join('')}
          </div>
        </div>
      ` : ''}
      ${contextItems.length ? `
        <div class="console-thread-context" aria-label="Room context">
          ${contextItems.map(renderContextItem).join('')}
        </div>
      ` : ''}
      ${recall?.body ? `
        <section class="console-thread-recall" aria-label="${escapeAttribute(recall.title ?? 'Sibyl recall')}">
          <span>${escapeHtml(recall.title ?? 'Sibyl recall')}</span>
          <p>${escapeHtml(recall.body)}</p>
        </section>
      ` : ''}
      <div class="console-thread-status" aria-label="Agent runtime status">
        <div class="console-thread-status-row">
          ${renderStatusPill('Chat', thread.transport ?? 'Live chat')}
          ${renderStatusPill('Memory', thread.memoryProvider ?? 'Sibyl memory')}
          ${renderStatusPill('Inference', thread.inferenceProvider ?? 'Bankr-ready')}
          ${renderStatusPill('Mode', thread.approvalMode ?? 'Review-only')}
        </div>
      </div>
      <div class="console-thread-daybreak" aria-hidden="true"><span>Today</span></div>
      <div class="console-thread-messages">
        ${messages.map((message) => renderThreadMessage(message, agentName)).join('')}
      </div>
      ${proposals.length ? `
        <div class="console-proposal-list" aria-label="Review-only proposals">
          <div class="console-thread-daybreak"><span>Queued proposals</span></div>
          ${proposals.map(renderProposal).join('')}
        </div>
      ` : ''}
      <form class="console-thread-composer" data-action="send-console-agent-message">
        <label class="console-thread-composer-label">
          <span>Message room</span>
        </label>
        <div class="console-thread-composer-shell">
          <textarea name="message" rows="4" placeholder="${escapeAttribute(thread.defaultMission ?? 'Tell the selected agent what to watch, remember, or brief you on.')}" ${disabled ? 'disabled' : ''}></textarea>
          <div class="console-thread-actions">
            <small class="console-thread-actions-note">Review-only. Nothing executes without your approval.</small>
            <button type="button" data-action="reset-console-session" ${thread.canReset ? '' : 'disabled'}>Reset chat</button>
            <button type="submit" ${disabled ? 'disabled' : ''}>${sending ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      </form>
      ${thread.error ? `<p class="console-thread-error">${escapeHtml(thread.error)}</p>` : ''}
    </section>
  `;
}

function renderStatusPill(label, value) {
  return `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`;
}

function renderContextItem(item = {}) {
  return `
    <article class="${escapeAttribute(item.className ?? 'open')}">
      <span>${escapeHtml(item.label ?? 'Context')}</span>
      <strong>${escapeHtml(item.value ?? '')}</strong>
      <small>${escapeHtml(item.body ?? '')}</small>
    </article>
  `;
}

function renderThreadMessage(message = {}, agentName = 'Selected agent') {
  const role = message.role === 'human'
    ? 'You'
    : (String(message.senderLabel ?? '').trim() || agentName);
  const avatar = message.role === 'human' ? 'YU' : initialsForLabel(role);
  return `
    <article class="console-thread-message ${message.role === 'human' ? 'human' : 'agent'}">
      <div class="console-thread-avatar" aria-hidden="true">${escapeHtml(avatar)}</div>
      <div class="console-thread-entry">
        <span class="console-thread-meta">
          <strong class="console-thread-role">${escapeHtml(role)}</strong>
          <small>${escapeHtml(formatTransportLabel(message.transport))}</small>
        </span>
        <p>${escapeHtml(message.text ?? '')}</p>
      </div>
    </article>
  `;
}

function renderParticipantPill(participant = {}) {
  const label = String(participant.displayName ?? participant.agentName ?? participant.participantId ?? 'Agent').trim() || 'Agent';
  return `
    <span class="console-thread-member-pill">
      <strong>${escapeHtml(initialsForLabel(label))}</strong>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderProposal(proposal = {}) {
  return `
    <article class="console-proposal-card">
      <span>${escapeHtml(proposal.status ?? 'review_only')}</span>
      <strong>${escapeHtml(proposal.title ?? 'Review-only proposal')}</strong>
      <p>${escapeHtml(proposal.action ?? '')}</p>
      <small>${escapeHtml(proposal.risk ?? 'No transaction authority is attached.')}</small>
    </article>
  `;
}

function formatTransportLabel(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'live_chat') return 'live chat';
  if (text === 'console') return 'live chat';
  if (text === 'xmtp_local') return 'xmtp room';
  if (text === 'xmtp_group') return 'xmtp group';
  if (text === 'xmtp-ready' || text === 'xmtp_ready') return 'xmtp ready';
  return text.replaceAll('_', ' ');
}

function createRoomSummary(messages = [], proposals = []) {
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  const proposalCount = Array.isArray(proposals) ? proposals.length : 0;
  if (!messageCount && !proposalCount) return 'Fresh room';
  if (messageCount && proposalCount) return `${messageCount} messages, ${proposalCount} queued`;
  if (messageCount) return `${messageCount} messages`;
  return `${proposalCount} queued`;
}

function createParticipantSummary(participants = []) {
  const count = Array.isArray(participants) ? participants.length : 0;
  if (!count) return 'No agents in room';
  if (count === 1) return '1 agent in room';
  return `${count} agents in room`;
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

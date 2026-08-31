export function renderConsoleAgentThread(thread = {}) {
  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : [{
      role: 'agent',
      text: thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
        : (thread.summary ?? 'Connect a wallet to start.'),
      transport: 'live_chat',
    }];
  const proposals = Array.isArray(thread.proposals) ? thread.proposals : [];
  const sending = thread.status === 'sending';
  const disabled = Boolean(thread.disabled || sending);

  return `
    <section class="console-panel console-agent-thread-panel" aria-label="Live agent chat">
      <div class="console-panel-heading">
        <p class="card-label">Chat</p>
        <h2>${escapeHtml(thread.agentName ?? 'Selected agent')} chat</h2>
        <p>${escapeHtml(thread.summary ?? 'Live chat ready.')}</p>
      </div>
      <div class="console-thread-status" aria-label="Agent runtime status">
        ${renderStatusPill('Chat', thread.transport ?? 'Live chat')}
        ${renderStatusPill('Memory', thread.memoryProvider ?? 'Sibyl memory')}
        ${renderStatusPill('Inference', thread.inferenceProvider ?? 'Bankr-ready')}
        ${renderStatusPill('Mode', thread.approvalMode ?? 'Review-only')}
      </div>
      <div class="console-thread-messages">
        ${messages.map(renderThreadMessage).join('')}
      </div>
      <form class="console-thread-composer" data-action="send-console-agent-message">
        <label>
          <span>Message</span>
          <textarea name="message" rows="3" placeholder="${escapeAttribute(thread.defaultMission ?? 'Tell the selected agent what to watch, remember, or brief you on.')}" ${disabled ? 'disabled' : ''}></textarea>
        </label>
        <div class="console-thread-actions">
          <button type="submit" ${disabled ? 'disabled' : ''}>${sending ? 'Sending...' : 'Send'}</button>
          <button type="button" data-action="reset-console-session" ${thread.canReset ? '' : 'disabled'}>Reset chat</button>
        </div>
      </form>
      ${thread.error ? `<p class="console-thread-error">${escapeHtml(thread.error)}</p>` : ''}
      ${proposals.length ? `
        <div class="console-proposal-list" aria-label="Review-only proposals">
          ${proposals.map(renderProposal).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderStatusPill(label, value) {
  return `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`;
}

function renderThreadMessage(message = {}) {
  const role = message.role === 'human' ? 'You' : 'Agent';
  return `
    <article class="console-thread-message ${message.role === 'human' ? 'human' : 'agent'}">
      <span>${escapeHtml(role)} · ${escapeHtml(formatTransportLabel(message.transport))}</span>
      <p>${escapeHtml(message.text ?? '')}</p>
    </article>
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
  if (text === 'xmtp-ready' || text === 'xmtp_ready') return 'xmtp ready';
  return text.replaceAll('_', ' ');
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

export function renderConsoleAgentThread(thread = {}) {
  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : [{
      role: 'agent',
      text: thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
        : 'Wallet required.',
      transport: 'console',
    }];
  const proposals = Array.isArray(thread.proposals) ? thread.proposals : [];
  const sending = thread.status === 'sending';
  const disabled = Boolean(thread.disabled || sending);

  return `
    <section class="console-panel console-agent-thread-panel" aria-label="Agent thread">
      <div class="console-panel-heading">
        <p class="card-label">Mission</p>
        <h2>Agent mission</h2>
        <p>${escapeHtml(thread.summary ?? 'Ready for mission input.')}</p>
      </div>
      <div class="console-thread-status" aria-label="Agent runtime status">
        ${renderStatusPill('Transport', thread.transport ?? 'XMTP-ready')}
        ${renderStatusPill('Memory', thread.memoryProvider ?? 'Sibyl-ready')}
        ${renderStatusPill('Inference', thread.inferenceProvider ?? 'Bankr-ready')}
      </div>
      <div class="console-thread-messages">
        ${messages.map(renderThreadMessage).join('')}
      </div>
      <form class="console-thread-composer" data-action="send-console-agent-message">
        <label>
          <span>Message</span>
          <textarea name="message" rows="3" placeholder="${escapeAttribute(thread.defaultMission ?? 'Track tokenized equities, vault opportunities, and agent-asset signals. Brief me first; keep every action for my approval.')}" ${disabled ? 'disabled' : ''}></textarea>
        </label>
        <div class="console-thread-actions">
          <button type="submit" ${disabled ? 'disabled' : ''}>${sending ? 'Saving...' : 'Save mission'}</button>
          <button type="button" data-action="reset-console-session" ${thread.canReset ? '' : 'disabled'}>Reset session</button>
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
  const role = message.role === 'human' ? 'Human' : 'Agent';
  return `
    <article class="console-thread-message ${message.role === 'human' ? 'human' : 'agent'}">
      <span>${escapeHtml(role)} - ${escapeHtml(message.transport ?? 'console')}</span>
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

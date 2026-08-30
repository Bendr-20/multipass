export function renderConsoleAgentThread(thread = {}) {
  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : [{
      role: 'agent',
      text: 'Connect a wallet, activate a Looper, and this thread becomes the agent inbox.',
      transport: 'console',
    }];
  const proposals = Array.isArray(thread.proposals) ? thread.proposals : [];
  const sending = thread.status === 'sending';
  const disabled = Boolean(thread.disabled || sending);

  return `
    <section class="console-panel console-agent-thread-panel" aria-label="Agent thread">
      <div class="console-panel-heading">
        <p class="card-label">Agent Thread</p>
        <h2>Message the activated Looper.</h2>
        <p>${escapeHtml(thread.summary ?? 'Console chat routes to the hosted agent worker. XMTP is the message rail, Sibyl is memory, and Bankr powers inference when configured.')}</p>
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
          <textarea name="message" rows="3" placeholder="Ask the Looper to track a market, remember a preference, or draft a review-only proposal." ${disabled ? 'disabled' : ''}></textarea>
        </label>
        <button type="submit" ${disabled ? 'disabled' : ''}>${sending ? 'Sending...' : 'Send to agent'}</button>
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
  const role = message.role === 'human' ? 'Human' : 'Looper';
  return `
    <article class="console-thread-message ${message.role === 'human' ? 'human' : 'agent'}">
      <span>${escapeHtml(role)} · ${escapeHtml(message.transport ?? 'console')}</span>
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

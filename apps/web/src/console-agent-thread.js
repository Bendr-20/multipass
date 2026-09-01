export function renderConsoleAgentThread(thread = {}) {
  const participants = Array.isArray(thread.participants) ? thread.participants.filter(Boolean) : [];
  const contextItems = Array.isArray(thread.contextItems) ? thread.contextItems.filter(Boolean).slice(0, 6) : [];
  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : [{
      role: 'agent',
      text: thread.sessionReset && thread.recalledMission
        ? thread.recalledMission
        : (thread.summary ?? 'Use the header button to start.'),
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
  const memoryCueCount = (Array.isArray(thread.savedMemory) ? thread.savedMemory.length : 0) + (Array.isArray(thread.recalledMemory) ? thread.recalledMemory.length : 0);
  const linkStatus = disabled ? 'Standby' : 'Channel open';
  const contextSummary = createContextSummary(contextItems);
  const roomNotes = [
    participants.length > 1 ? `${participants.length} agents in room.` : 'One agent in room.',
    memoryCueCount ? `${memoryCueCount} memory cue${memoryCueCount === 1 ? '' : 's'} loaded.` : 'Sibyl memory standing by.',
    contextSummary,
  ].filter(Boolean).join(' ');
  const timeline = createTimeline({
    messages,
    proposals,
    recall,
    savedMemory: thread.savedMemory,
    recalledMemory: thread.recalledMemory,
    missions: thread.missions,
  });

  return `
    <section class="console-panel console-agent-thread-panel" aria-label="Live agent chat">
      <header class="console-thread-shell-header">
        <div class="console-thread-shell-heading">
          <p class="card-label">Operator room</p>
          <div class="console-thread-chat-head">
            <div class="console-thread-avatar console-thread-avatar-chat" aria-hidden="true">${escapeHtml(initialsForLabel(agentName))}</div>
            <div class="console-thread-chat-copy">
              <h2>${escapeHtml(agentName)}</h2>
              <p>${escapeHtml(thread.summary ?? 'Live chat ready.')}</p>
            </div>
          </div>
        </div>
        <div class="console-thread-shell-meta" aria-label="Room summary">
          <strong>${escapeHtml(`#${roomName}`)}</strong>
          <span>${escapeHtml(`${linkStatus} · ${roomSummary}`)}</span>
        </div>
      </header>
      <section class="console-thread-toolbar" aria-label="Chat room controls">
        ${participants.length ? `
          <div class="console-thread-members" aria-label="Room participants">
            <span class="console-thread-members-label">${escapeHtml(participantSummary)}</span>
            <div class="console-thread-member-list">
              ${participants.map(renderParticipantPill).join('')}
            </div>
          </div>
        ` : ''}
        ${roomNotes ? `
          <div class="console-thread-context-summary">
            <span>Room notes</span>
            <p>${escapeHtml(roomNotes)}</p>
          </div>
        ` : ''}
      </section>
      <div class="console-thread-daybreak" aria-hidden="true"><span>Today</span></div>
      <div class="console-thread-messages">
        ${timeline.map((item) => renderTimelineItem(item, agentName)).join('')}
      </div>
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

function renderTimelineItem(item = {}, agentName = 'Selected agent') {
  if (item.type === 'divider') {
    return `<div class="console-thread-daybreak console-thread-daybreak-inline"><span>${escapeHtml(item.label ?? 'Queued proposals')}</span></div>`;
  }
  if (item.type === 'activity') {
    return renderThreadActivity(item.activity);
  }
  if (item.type === 'proposal') {
    return renderInlineProposal(item.proposal);
  }
  return renderThreadMessage(item.message, agentName);
}

function renderThreadMessage(message = {}, agentName = 'Selected agent') {
  const role = message.role === 'human'
    ? 'You'
    : (String(message.senderLabel ?? '').trim() || agentName);
  const avatar = message.role === 'human' ? 'OP' : initialsForLabel(role);
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

function renderInlineProposal(proposal = {}) {
  return `
    <article class="console-thread-proposal">
      <div class="console-thread-avatar console-thread-avatar-proposal" aria-hidden="true">RV</div>
      <div class="console-thread-entry console-thread-proposal-entry">
        <span class="console-thread-meta">
          <strong class="console-thread-role">Review gate</strong>
          <small>${escapeHtml(formatProposalStatus(proposal.status))}</small>
        </span>
        <strong class="console-thread-proposal-title">${escapeHtml(proposal.title ?? 'Review-only proposal')}</strong>
        <p>${escapeHtml(proposal.action ?? '')}</p>
        <small>${escapeHtml(proposal.risk ?? 'No transaction authority is attached.')}</small>
      </div>
    </article>
  `;
}

function renderThreadActivity(activity = {}) {
  return `
    <article class="console-thread-activity console-thread-activity-${escapeAttribute(activity.tone ?? 'room')}">
      <div class="console-thread-avatar console-thread-avatar-activity" aria-hidden="true">${escapeHtml(activity.badge ?? 'RM')}</div>
      <div class="console-thread-entry console-thread-activity-entry">
        <span class="console-thread-meta">
          <strong class="console-thread-role">${escapeHtml(activity.label ?? 'Room activity')}</strong>
          <small>${escapeHtml(activity.meta ?? 'room state')}</small>
        </span>
        <strong class="console-thread-activity-title">${escapeHtml(activity.title ?? 'Room state updated')}</strong>
        <p>${escapeHtml(activity.body ?? '')}</p>
        ${activity.detail ? `<small>${escapeHtml(activity.detail)}</small>` : ''}
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

function createTimeline({
  messages = [],
  proposals = [],
  recall = null,
  savedMemory = [],
  recalledMemory = [],
  missions = [],
} = {}) {
  const timeline = [];
  const roomActivity = createRoomActivity({
    recall,
    savedMemory,
    recalledMemory,
    missions,
  });
  if (roomActivity.length) {
    timeline.push({ type: 'divider', label: 'Room notes' });
    for (const activity of roomActivity) {
      timeline.push({ type: 'activity', activity });
    }
  }
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeProposals = Array.isArray(proposals) ? proposals : [];
  for (const message of safeMessages) {
    timeline.push({ type: 'message', message });
  }
  if (safeProposals.length) {
    timeline.push({ type: 'divider', label: safeMessages.length || roomActivity.length ? 'Review queue' : 'Queued proposals' });
    for (const proposal of safeProposals) {
      timeline.push({ type: 'proposal', proposal });
    }
  }
  return timeline;
}

function createRoomActivity({ recall = null, savedMemory = [], recalledMemory = [], missions = [] } = {}) {
  const items = [];
  if (recall?.body) {
    items.push({
      tone: 'recall',
      badge: 'SB',
      label: recall.title ?? 'Sibyl recall',
      meta: 'session boot',
      title: 'Prior room memory loaded',
      body: recall.body,
    });
  }

  const memoryActivity = createCombinedMemoryActivity({
    recalledMemory,
    savedMemory,
  });
  if (memoryActivity) {
    items.push(memoryActivity);
  }

  const mission = Array.isArray(missions) ? missions.find(Boolean) : null;
  if (mission?.summary) {
    items.push({
      tone: 'mission',
      badge: 'MS',
      label: 'Mission active',
      meta: formatProposalStatus(mission.status ?? 'active'),
      title: mission.title ?? 'Active mission',
      body: mission.summary,
    });
  }

  return items.slice(0, 5);
}

function createCombinedMemoryActivity({ recalledMemory = [], savedMemory = [] } = {}) {
  const recalled = normalizeMemoryEntries(recalledMemory);
  const saved = normalizeMemoryEntries(savedMemory);
  const total = recalled.length + saved.length;
  if (!total) return null;

  const highlights = [...recalled, ...saved]
    .slice(0, 2)
    .map((entry) => entry.text)
    .filter(Boolean);
  const body = highlights.length
    ? highlights.join(' ')
    : 'Recent operator memory is loaded into this room.';
  const meta = [
    recalled.length ? `${recalled.length} recalled` : null,
    saved.length ? `${saved.length} pinned` : null,
  ].filter(Boolean).join(' · ');

  return {
    tone: 'memory',
    badge: 'SB',
    label: 'Memory loaded',
    meta: meta || 'sibyl',
    title: total === 1 ? '1 memory cue ready' : `${total} memory cues ready`,
    body,
    detail: buildMemoryTagDetail([...recalled, ...saved]),
  };
}

function createContextSummary(items = []) {
  const text = (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const label = String(item.label ?? '').trim();
      const value = String(item.value ?? '').trim();
      if (!label && !value) return null;
      return `${label}: ${value}`.trim();
    })
    .filter(Boolean);
  return text.length ? text.join(' · ') : '';
}

function normalizeMemoryEntries(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const text = String(entry.text ?? '').trim();
      const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean).map((tag) => String(tag).trim()) : [];
      if (!text) return null;
      const key = `${text}::${tags.join(',')}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { text, tags };
    })
    .filter(Boolean);
}

function buildMemoryTagDetail(entries = []) {
  const tags = [...new Set(
    (Array.isArray(entries) ? entries : [])
      .flatMap((entry) => Array.isArray(entry.tags) ? entry.tags : [])
      .map((tag) => String(tag).trim())
      .filter(Boolean),
  )];
  return tags.length ? `Tags: ${tags.map(formatTagLabel).join(' · ')}` : '';
}

function formatProposalStatus(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'review-only';
  if (text === 'review_only') return 'review-only';
  return text.replaceAll('_', ' ');
}

function formatTagLabel(value) {
  return String(value ?? '')
    .trim()
    .replaceAll(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

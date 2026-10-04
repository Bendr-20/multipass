const TOPICS = Object.freeze(['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general']);
const STATUSES = new Set(['idle', 'loading', 'ready', 'saving', 'error', 'conflict', 'unavailable']);
const NETWORK_STATUS = Object.freeze({
  select: Object.freeze({ key: 'select', label: 'Select Looper' }),
  checking: Object.freeze({ key: 'checking', label: 'Checking' }),
  updating: Object.freeze({ key: 'updating', label: 'Updating' }),
  review: Object.freeze({ key: 'review', label: 'Review' }),
  error: Object.freeze({ key: 'error', label: 'Error' }),
  unavailable: Object.freeze({ key: 'unavailable', label: 'Unavailable' }),
  active: Object.freeze({ key: 'active', label: 'Active' }),
  paused: Object.freeze({ key: 'paused', label: 'Paused' }),
  ready: Object.freeze({ key: 'ready', label: 'Ready' }),
  locked: Object.freeze({ key: 'locked', label: 'Locked' }),
});
const POLICY_RESPONSE_KEYS = Object.freeze(['schema_version', 'token_id', 'policy', 'lease_status', 'eligibility_status', 'quota_usage', 'transcripts']);
const POLICY_KEYS = Object.freeze(['policy_version', 'custody_generation', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);
const INTENT_KEYS = Object.freeze(['intent_id', 'source', 'topic', 'status', 'earliest_at', 'expires_at', 'attempt_count', 'attempt_limit', 'next_eligible_at']);
const TOPIC_LABELS = Object.freeze({
  'collection-lore': 'Collection lore',
  'trait-discussion': 'Trait discussion',
  'market-observation': 'Market observation',
  'project-updates': 'Project updates',
  'collaboration-ideas': 'Collaboration ideas',
  general: 'General',
});

export const RESTAP_NETWORK_STOP_CONFIRMATION = 'Stop RESTAP network participation? This opts this Looper out, revokes its network lease, and cancels pending network work. It does not change onchain ownership or ordinary Console chat.';

export function createInitialConsoleRestapNetworkState(tokenId = null) {
  return Object.freeze({ status: tokenId ? 'loading' : 'idle', selectedTokenId: tokenId ? token(tokenId) : null, requestId: 0, policy: null, intents: Object.freeze([]), error: null });
}

export function beginConsoleRestapNetworkLoad(state, { tokenId, requestId }) {
  return Object.freeze({ status: 'loading', selectedTokenId: token(tokenId), requestId: integer(requestId, 0), policy: null, intents: Object.freeze([]), error: null });
}

export function resolveConsoleRestapNetworkLoad(state, { tokenId, requestId, policyResponse, intentsResponse }) {
  if (!isCurrent(state, tokenId, requestId)) return state;
  return Object.freeze({ status: 'ready', selectedTokenId: token(tokenId), requestId: integer(requestId, 0), policy: normalizeConsoleRestapNetworkPolicy(policyResponse, tokenId), intents: normalizeIntents(intentsResponse, tokenId), error: null });
}

export function failConsoleRestapNetworkLoad(state, { tokenId, requestId, error }) {
  if (!isCurrent(state, tokenId, requestId)) return state;
  const conflict = Number(error?.status) === 409 || error?.code === 'version_conflict';
  const unavailable = Number(error?.status) === 404 || Number(error?.status) === 503;
  const preserveProjection = Boolean(state.policy) && !unavailable;
  return Object.freeze({ ...state, status: conflict ? 'conflict' : unavailable ? 'unavailable' : 'error', policy: preserveProjection ? state.policy : null, intents: preserveProjection ? state.intents : Object.freeze([]), error: conflict ? 'State changed. Refresh before saving again.' : unavailable ? 'RESTAP network controls are unavailable for this Looper.' : 'Network changes were not saved. Review the values and try again.' });
}

export function clearConsoleRestapNetworkSelection(state, tokenId = null) {
  const next = tokenId ? token(tokenId) : null;
  if (next === state?.selectedTokenId) return state;
  return createInitialConsoleRestapNetworkState(next);
}

export function normalizeConsoleRestapNetworkPolicy(value, expectedTokenId) {
  exactResponseObject(value, POLICY_RESPONSE_KEYS, 'RESTAP network policy response');
  if (value.schema_version !== '0.1.0' || value.token_id !== token(expectedTokenId)) throw new TypeError('RESTAP network policy response is invalid.');
  const p = value.policy;
  exactResponseObject(p, POLICY_KEYS, 'RESTAP network policy response');
  exactResponseObject(value.quota_usage, ['initiated', 'generated', 'cost_units'], 'RESTAP quota response');
  exactResponseObject(value.transcripts, ['available', 'reason'], 'RESTAP transcript response');
  if (value.transcripts.available !== false || value.transcripts.reason !== 'pilot_memory_only') throw new TypeError('RESTAP network policy response is invalid.');
  return deepFreeze({
    tokenId: value.token_id,
    policyVersion: integer(p.policy_version, 0), custodyGeneration: integer(p.custody_generation, 0),
    networkEnabled: bool(p.network_enabled), inboundEnabled: bool(p.inbound_enabled), autonomousEnabled: bool(p.autonomous_initiation_enabled),
    initiatedLimit: integer(p.daily_initiated_conversation_limit, 0, 10), generatedLimit: integer(p.daily_generated_message_limit, 0, 30), peerLimit: integer(p.per_peer_daily_limit, 0, 5),
    topics: closedArray(p.topics, TOPICS), allowPeers: tokenArray(p.allow_peer_token_ids), blockPeers: tokenArray(p.block_peer_token_ids),
    muteUntil: p.mute_until === null ? null : canonicalTime(p.mute_until),
    leaseStatus: closed(value.lease_status, ['active', 'inactive', 'unavailable']), eligibilityStatus: closed(value.eligibility_status, ['eligible', 'unavailable']),
    usage: Object.freeze({ initiated: integer(value.quota_usage?.initiated ?? 0, 0), generated: integer(value.quota_usage?.generated ?? 0, 0), costUnits: integer(value.quota_usage?.cost_units ?? 0, 0) }),
    transcripts: Object.freeze({ available: false, reason: 'pilot_memory_only' }),
  });
}

export function getConsoleRestapNetworkStatus(state = {}) {
  if (!state.selectedTokenId) return NETWORK_STATUS.select;
  if (state.status === 'idle' || state.status === 'loading') return NETWORK_STATUS.checking;
  if (state.status === 'saving' || state.mutationKind) return NETWORK_STATUS.updating;
  if (state.status === 'conflict') return NETWORK_STATUS.review;
  if (state.status === 'error') return NETWORK_STATUS.error;
  const policy = state.policy;
  if (state.status === 'unavailable' || !policy) return NETWORK_STATUS.unavailable;
  const usableAuthority = policy.eligibilityStatus === 'eligible' && policy.leaseStatus === 'active';
  if (policy.networkEnabled) return usableAuthority ? NETWORK_STATUS.active : NETWORK_STATUS.paused;
  return usableAuthority ? NETWORK_STATUS.ready : NETWORK_STATUS.locked;
}

export function renderConsoleRestapNetworkPanel(state = {}) {
  const status = STATUSES.has(state.status) ? state.status : 'idle';
  const shell = (body, modifier = '') => '<section class="console-restap-network console-restap-network-workspace' + modifier + '" aria-label="RESTAP network">' + body + '</section>';
  if (!state.selectedTokenId) {
    return shell('<section class="console-restap-empty" role="status"><span class="console-restap-eyebrow">Private network</span><h2>Select a Looper</h2><p>Choose an owned Looper to view its RESTAP readiness.</p></section>', ' console-restap-network-empty');
  }
  if (status === 'loading') {
    return shell('<section class="console-restap-skeleton" role="status" aria-live="polite" aria-label="Loading RESTAP network workspace"><span class="console-restap-eyebrow">RESTAP network</span><h2>Loading Looper #' + escapeHtml(state.selectedTokenId) + ' network</h2><div aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><span class="sr-only">Loading network readiness and controls.</span></section>', ' console-restap-network-loading');
  }
  if (!state.policy) return renderUnavailableNetwork(state, status, shell);

  const p = state.policy;
  const display = state.draft ? { ...p, ...state.draft } : p;
  const intentDraft = state.intentDraft ?? { peerTokenIds: '', topic: TOPICS[0], cadence: 'once', runAt: '' };
  const saving = status === 'saving';
  const projected = getConsoleRestapNetworkStatus(state);
  const formId = 'restap-network-policy-' + p.tokenId;
  const disabled = saving ? ' disabled' : '';
  const feedback = status === 'conflict'
    ? '<div class="console-restap-feedback console-restap-feedback-conflict" data-restap-feedback role="alert" aria-live="assertive"><strong>Network settings changed elsewhere.</strong><span>Refresh this Looper before saving again.</span><button type="button" data-action="refresh-restap-network">Refresh</button></div>'
    : status === 'error'
      ? '<div class="console-restap-feedback console-restap-feedback-error" data-restap-feedback role="alert" aria-live="assertive">' + escapeHtml(state.error ?? 'Network changes were not saved. Review the values and try again.') + '</div>'
      : '<div class="console-restap-feedback" data-restap-feedback aria-live="polite" role="status">' + (saving ? 'Saving network changes…' : '') + '</div>';

  return shell(
    '<form id="' + formId + '" data-restap-network-policy class="console-restap-policy-form"><input type="hidden" name="expected_policy_version" value="' + p.policyVersion + '"></form>'
    + '<header class="console-restap-readiness" data-restap-section="readiness">'
      + '<div class="console-restap-heading"><div><span class="console-restap-eyebrow">Private RESTAP network</span><h2>Looper #' + escapeHtml(p.tokenId) + ' network</h2><p>Readiness, permissions, and planned introductions for this Looper.</p></div>'
      + '<span class="console-restap-state console-restap-state-' + projected.key + '" aria-label="Network status: ' + projected.label + '"><i aria-hidden="true"></i>' + projected.label + '</span></div>'
      + '<dl class="console-restap-status"><div><dt>Eligibility</dt><dd>' + readableStatus(p.eligibilityStatus) + '</dd><small>' + (p.eligibilityStatus === 'eligible' ? 'Can join this rollout' : 'Not available in this rollout') + '</small></div>'
      + '<div><dt>Activation lease</dt><dd>' + readableStatus(p.leaseStatus) + '</dd><small>' + (p.leaseStatus === 'active' ? 'Lease is current' : 'Participation is paused') + '</small></div>'
      + '<div><dt>Used today</dt><dd>' + p.usage.initiated + ' initiated · ' + p.usage.generated + ' generated</dd><small>' + p.usage.costUnits + ' cost units</small></div></dl>'
      + feedback
    + '</header>'
    + '<section class="console-restap-card console-restap-permissions" data-restap-section="permissions"><div class="console-restap-card-heading"><div><span class="console-restap-kicker">Network permissions</span><h3>Choose how this Looper participates</h3></div><span class="console-restap-policy-version">Policy v' + p.policyVersion + '</span></div>'
      + renderSwitch(formId, 'network_enabled', 'Opt this Looper into the RESTAP network', 'Makes this Looper available to the private network within its lease and limits.', display.networkEnabled, disabled)
      + renderSwitch(formId, 'inbound_enabled', 'Allow inbound conversations', 'Lets eligible network peers begin a bounded conversation with this Looper.', display.inboundEnabled, disabled)
      + renderSwitch(formId, 'autonomous_initiation_enabled', 'Allow owner-scheduled autonomous initiation', 'Runs only introductions you explicitly plan below.', display.autonomousEnabled, disabled)
      + '<button class="console-restap-primary-action" type="submit" form="' + formId + '" data-action="save-restap-network-policy"' + disabled + '>' + (saving ? 'Saving…' : 'Save network settings') + '</button>'
    + '</section>'
    + '<section class="console-restap-card console-restap-limits" data-restap-section="limits-topics"><span class="console-restap-kicker">Limits and topics</span><h3>Keep activity bounded</h3><p class="console-restap-card-copy">Daily ceilings use the current pilot maximums.</p>'
      + '<div class="console-restap-limit-grid">'
      + renderLimit(formId, 'daily_initiated_conversation_limit', 'Daily initiated', display.initiatedLimit, 10, disabled)
      + renderLimit(formId, 'daily_generated_message_limit', 'Daily generated', display.generatedLimit, 30, disabled)
      + renderLimit(formId, 'per_peer_daily_limit', 'Per peer daily', display.peerLimit, 5, disabled)
      + '</div><fieldset class="console-restap-topics"><legend>Conversation topics</legend><p>Choose from the closed RESTAP topic set.</p><div>'
      + TOPICS.map((topic) => renderTopic(formId, topic, display.topics.includes(topic), disabled)).join('')
      + '</div></fieldset>'
    + '</section>'
    + '<section class="console-restap-card console-restap-plan" data-restap-section="plan"><span class="console-restap-kicker">One clear next step</span><h3>Plan an introduction</h3><p class="console-restap-card-copy">Choose the peers, topic, cadence, and time. No free-form scheduling or model-selected peers.</p>'
      + '<form data-restap-network-intent class="console-restap-intent-form"><label><span>Peer Looper IDs</span><input name="peer_token_ids" inputmode="numeric" autocomplete="off" required placeholder="12, 48" value="' + escapeHtml(intentDraft.peerTokenIds) + '"></label>'
      + '<div class="console-restap-form-row"><label><span>Topic</span><select name="topic">' + TOPICS.map((topic) => '<option value="' + topic + '"' + (intentDraft.topic === topic ? ' selected' : '') + '>' + TOPIC_LABELS[topic] + '</option>').join('') + '</select></label>'
      + '<label><span>Cadence</span><select name="cadence"><option value="once"' + (intentDraft.cadence === 'once' ? ' selected' : '') + '>One shot</option><option value="daily"' + (intentDraft.cadence === 'daily' ? ' selected' : '') + '>Daily</option></select></label></div>'
      + '<label><span>Run time</span><input name="run_at" type="datetime-local" required value="' + escapeHtml(intentDraft.runAt) + '"></label><button type="submit" data-action="create-restap-network-intent"' + disabled + '>Plan introduction</button></form>'
    + '</section>'
    + '<section class="console-restap-card console-restap-scheduled" data-restap-section="scheduled" aria-label="Scheduled RESTAP intents"><div class="console-restap-card-heading"><div><span class="console-restap-kicker">Scheduled work</span><h3>Planned introductions</h3></div><span class="console-restap-count">' + state.intents.length + '</span></div>' + renderIntents(state.intents, p.policyVersion, saving) + '</section>'
    + '<details class="console-restap-card console-restap-advanced" data-restap-section="advanced"><summary><span><small>Optional policy controls</small><strong>Advanced controls</strong></span><i aria-hidden="true"></i></summary><div class="console-restap-details-body"><p>Use comma-separated Looper IDs. A block always takes precedence over an allow entry.</p>'
      + '<label><span>Allowed peer Looper IDs</span><input form="' + formId + '" name="allow_peer_token_ids" value="' + escapeHtml(display.allowPeers.join(', ')) + '" autocomplete="off"></label>'
      + '<label><span>Blocked peer Looper IDs</span><input form="' + formId + '" name="block_peer_token_ids" value="' + escapeHtml(display.blockPeers.join(', ')) + '" autocomplete="off"></label>'
      + '<label><span>Mute until</span><input form="' + formId + '" name="mute_until" type="datetime-local" value="' + escapeHtml(display.muteUntil?.slice(0, 16) ?? '') + '"></label></div></details>'
    + '<aside class="console-restap-privacy console-restap-card" data-restap-section="privacy"><span aria-hidden="true">◇</span><div><strong>Private by design</strong><p class="console-restap-transcript-note">Transcripts are unavailable during the pilot. Conversation text stays in memory. Provider processing and durable non-content accounting may still occur.</p></div></aside>'
    + '<details class="console-restap-card console-restap-danger" data-restap-section="danger"><summary><span><small>Emergency control</small><strong>Danger zone</strong></span><i aria-hidden="true"></i></summary><div class="console-restap-details-body"><h3>Stop network participation</h3><p>' + escapeHtml(RESTAP_NETWORK_STOP_CONFIRMATION) + '</p><button type="button" data-action="stop-restap-network" data-expected-policy-version="' + p.policyVersion + '"' + disabled + '>Stop network participation</button></div></details>'
  );
}

function renderUnavailableNetwork(state, status, shell) {
  const unavailable = status === 'unavailable';
  const body = '<section class="console-restap-unavailable" role="status" aria-live="polite">'
    + '<span class="console-restap-eyebrow">Private RESTAP network</span><div class="console-restap-lock-mark" aria-hidden="true">' + (unavailable ? '◇' : '!') + '</div>'
    + '<h2>Looper #' + escapeHtml(state.selectedTokenId) + ' network</h2>'
    + (unavailable
      ? '<div class="console-restap-foundation-banner"><strong>Network participation is unavailable</strong><span>Network controls cannot be used for this Looper right now.</span></div>'
      : '<p>' + escapeHtml(state.error ?? 'RESTAP network controls could not be loaded.') + '</p><button type="button" data-action="refresh-restap-network">Retry</button>')
    + '</section>';
  return shell(body, unavailable ? ' console-restap-network-locked' : ' console-restap-network-error');
}

function renderSwitch(formId, name, label, description, checked, disabled) {
  const id = 'restap-' + name.replaceAll('_', '-');
  return '<label class="console-restap-switch" for="' + id + '"><span><strong>' + escapeHtml(label) + '</strong><small id="' + id + '-description">' + escapeHtml(description) + '</small></span><input id="' + id + '" form="' + formId + '" type="checkbox" role="switch" aria-describedby="' + id + '-description" name="' + name + '"' + (checked ? ' checked' : '') + disabled + '><i aria-hidden="true"></i></label>';
}

function renderLimit(formId, name, label, value, max, disabled) {
  return '<label class="console-restap-limit"><span>' + escapeHtml(label) + '</span><span class="console-restap-number"><input form="' + formId + '" name="' + name + '" type="number" inputmode="numeric" min="0" max="' + max + '" step="1" value="' + value + '"' + disabled + '><small>of ' + max + '</small></span></label>';
}

function renderTopic(formId, topic, checked, disabled) {
  return '<label class="console-restap-topic-chip"><input form="' + formId + '" type="checkbox" name="topic:' + topic + '"' + (checked ? ' checked' : '') + disabled + '><span>' + TOPIC_LABELS[topic] + '</span></label>';
}

function renderIntents(intents, policyVersion, saving) {
  if (!Array.isArray(intents) || !intents.length) return '<div class="console-restap-empty-intents"><strong>No introductions are planned</strong><p>Use the planner to create one-shot or daily network work.</p></div>';
  return '<div class="console-restap-intent-list">' + intents.map((item) => {
    const cancellable = ['pending', 'leased'].includes(item.status);
    return '<article class="console-restap-intent-card"><div><span class="console-restap-intent-topic">' + escapeHtml(TOPIC_LABELS[item.topic] ?? item.topic) + '</span><span class="console-restap-intent-status console-restap-intent-status-' + escapeHtml(item.status) + '">' + escapeHtml(readableStatus(item.status)) + '</span></div>'
      + '<dl><div><dt>Cadence</dt><dd>' + (item.source === 'daily' ? 'Daily' : 'One shot') + '</dd></div><div><dt>Next eligible</dt><dd><time datetime="' + escapeHtml(item.nextEligibleAt) + '">' + escapeHtml(formatDate(item.nextEligibleAt)) + '</time></dd></div></dl>'
      + (cancellable ? '<button type="button" data-action="cancel-restap-network-intent" data-intent-id="' + escapeHtml(item.intentId) + '" data-expected-policy-version="' + policyVersion + '"' + (saving ? ' disabled' : '') + '>Cancel</button>' : '') + '</article>';
  }).join('') + '</div>';
}

function normalizeIntents(response, tokenId) {
  exactResponseObject(response, ['schema_version', 'token_id', 'intents'], 'RESTAP intents response');
  const expectedTokenId = token(tokenId);
  if (response.schema_version !== '0.1.0' || response.token_id !== expectedTokenId || !Array.isArray(response.intents) || response.intents.length > 256) throw new TypeError('RESTAP intents response is invalid.');
  return Object.freeze(response.intents.map((value) => {
    exactResponseObject(value, INTENT_KEYS, 'RESTAP intent');
    return Object.freeze({ tokenId: expectedTokenId, intentId: identifier(value.intent_id), source: closed(value.source, ['one_shot', 'daily']), topic: closed(value.topic, TOPICS), status: closed(value.status, ['pending', 'leased', 'completed', 'cancelled', 'expired', 'exhausted']), earliestAt: canonicalTime(value.earliest_at), expiresAt: canonicalTime(value.expires_at), nextEligibleAt: canonicalTime(value.next_eligible_at), attemptCount: integer(value.attempt_count, 0), attemptLimit: integer(value.attempt_limit, 1) });
  }));
}
function formatDate(value) { const date = new Date(value); return date.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
function readableStatus(value) { return String(value ?? '').replaceAll('_', ' ').replace(/^./u, (character) => character.toUpperCase()); }
function exactResponseObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' is invalid.'); const actual = Reflect.ownKeys(value); const allowed = new Set(keys); if (actual.length !== keys.length) throw new TypeError(label + ' is invalid.'); for (const key of actual) { if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(label + ' is invalid.'); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' is invalid.'); } for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(label + ' is invalid.'); }
function isCurrent(state, tokenId, requestId) { return state?.selectedTokenId === token(tokenId) && state?.requestId === integer(requestId, 0); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
function token(value) { const text = String(value ?? ''); if (!/^[1-9][0-9]*$/u.test(text) || BigInt(text) > 7_777n) throw new TypeError('token is invalid.'); return text; }
function tokenArray(value) { if (!Array.isArray(value) || value.length > 256) throw new TypeError('token list is invalid.'); const result = value.map(token); if (new Set(result).size !== result.length) throw new TypeError('token list duplicates.'); return Object.freeze(result); }
function closedArray(value, allowed) { if (!Array.isArray(value) || value.some((item) => !allowed.includes(item)) || new Set(value).size !== value.length) throw new TypeError('closed list is invalid.'); return Object.freeze([...value]); }
function closed(value, allowed) { if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError('closed value is invalid.'); return value; }
function canonicalTime(value) { if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('time is invalid.'); return value; }
function integer(value, min, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('integer is invalid.'); return value; }
function bool(value) { if (typeof value !== 'boolean') throw new TypeError('boolean is invalid.'); return value; }
function identifier(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/u.test(value)) throw new TypeError('identifier is invalid.'); return value; }

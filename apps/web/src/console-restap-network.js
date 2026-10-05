const TOPICS = Object.freeze(['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general']);
const STATUSES = new Set(['idle', 'loading', 'ready', 'saving', 'error', 'conflict', 'unavailable']);
const TOPIC_LABELS = Object.freeze({ 'collection-lore': 'Collection lore', 'trait-discussion': 'Trait discussion', 'market-observation': 'Market observation', 'project-updates': 'Project updates', 'collaboration-ideas': 'Collaboration ideas', general: 'General' });
const POLICY_RESPONSE_KEYS = Object.freeze(['schema_version', 'token_id', 'policy', 'lease_status', 'eligibility_status', 'quota_usage', 'transcripts']);
const POLICY_KEYS = Object.freeze(['policy_version', 'custody_generation', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);

export const RESTAP_NETWORK_STOP_CONFIRMATION = 'Stop RESTAP network participation? This opts this Looper out and blocks new synchronous sends. It does not change onchain ownership or ordinary Console chat.';

export function createInitialConsoleRestapNetworkState(tokenId = null) {
  return Object.freeze({ status: tokenId ? 'loading' : 'idle', selectedTokenId: tokenId ? token(tokenId) : null, requestId: 0, policy: null, error: null, policyDraft: null, sendDraft: null, sendDraftFingerprint: null, sendIdempotencyKey: null, sendResult: null, mutationKind: null, message: null });
}

export function normalizeConsoleRestapNetworkPolicyDraft(value) {
  exactDraftObject(value, ['networkEnabled', 'inboundEnabled', 'initiatedLimit', 'generatedLimit', 'peerLimit', 'topics', 'allowPeers', 'blockPeers', 'muteUntil'], 'policy draft');
  const draft = { networkEnabled: bool(value.networkEnabled), inboundEnabled: bool(value.inboundEnabled), initiatedLimit: integer(value.initiatedLimit, 0, 10), generatedLimit: integer(value.generatedLimit, 0, 30), peerLimit: integer(value.peerLimit, 0, 5), topics: closedArray(value.topics, TOPICS), allowPeers: tokenArray(value.allowPeers), blockPeers: tokenArray(value.blockPeers), muteUntil: value.muteUntil === null ? null : canonicalTime(value.muteUntil) };
  if (draft.allowPeers.some((item) => draft.blockPeers.includes(item))) throw new TypeError('policy draft peers overlap.');
  return deepFreeze(draft);
}

export function normalizeConsoleRestapNetworkSendDraft(value) {
  exactDraftObject(value, ['recipientTokenId', 'topic'], 'send draft');
  return deepFreeze({ recipientTokenId: token(value.recipientTokenId), topic: closed(value.topic, TOPICS) });
}

export function getConsoleRestapNetworkSendFingerprint(draft) {
  const normalized = normalizeConsoleRestapNetworkSendDraft(draft);
  return JSON.stringify({ recipient_token_id: normalized.recipientTokenId, topic: normalized.topic });
}

export function beginConsoleRestapNetworkLoad(state, { tokenId, requestId }) {
  return Object.freeze({ ...createInitialConsoleRestapNetworkState(tokenId), status: 'loading', requestId: integer(requestId, 0), sendDraft: state?.selectedTokenId === String(tokenId) ? state.sendDraft ?? null : null, sendDraftFingerprint: state?.selectedTokenId === String(tokenId) ? state.sendDraftFingerprint ?? null : null, sendIdempotencyKey: state?.selectedTokenId === String(tokenId) ? state.sendIdempotencyKey ?? null : null, sendResult: state?.selectedTokenId === String(tokenId) ? state.sendResult ?? null : null });
}

export function resolveConsoleRestapNetworkLoad(state, { tokenId, requestId, policyResponse }) {
  if (!isCurrent(state, tokenId, requestId)) return state;
  return Object.freeze({ ...state, status: 'ready', policy: normalizeConsoleRestapNetworkPolicy(policyResponse, tokenId), error: null, mutationKind: null });
}

export function failConsoleRestapNetworkLoad(state, { tokenId, requestId, error, preserveProjection = false }) {
  if (!isCurrent(state, tokenId, requestId)) return state;
  const conflict = Number(error?.status) === 409 || error?.code === 'version_conflict' || error?.code === 'idempotency_conflict';
  const unavailable = (Number(error?.status) === 404 || Number(error?.status) === 503) && !preserveProjection;
  const keepProjection = Boolean(state.policy) && (preserveProjection || !unavailable);
  return Object.freeze({ ...state, status: conflict ? 'conflict' : unavailable ? 'unavailable' : 'error', policy: keepProjection ? state.policy : null, error: conflict ? 'State changed. Refresh before trying again.' : unavailable ? 'RESTAP network controls are unavailable for this Looper.' : 'The network action did not complete. Review the values and try again.', mutationKind: null });
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
  exactResponseObject(p, POLICY_KEYS, 'RESTAP network policy response'); exactResponseObject(value.quota_usage, ['initiated', 'generated', 'cost_units'], 'RESTAP quota response'); exactResponseObject(value.transcripts, ['available', 'reason'], 'RESTAP transcript response');
  if (value.transcripts.available !== false || value.transcripts.reason !== 'pilot_memory_only') throw new TypeError('RESTAP network policy response is invalid.');
  return deepFreeze({ tokenId: value.token_id, policyVersion: integer(p.policy_version, 0), custodyGeneration: integer(p.custody_generation, 0), networkEnabled: bool(p.network_enabled), inboundEnabled: bool(p.inbound_enabled), initiatedLimit: integer(p.daily_initiated_conversation_limit, 0, 10), generatedLimit: integer(p.daily_generated_message_limit, 0, 30), peerLimit: integer(p.per_peer_daily_limit, 0, 5), topics: closedArray(p.topics, TOPICS), allowPeers: tokenArray(p.allow_peer_token_ids), blockPeers: tokenArray(p.block_peer_token_ids), muteUntil: p.mute_until === null ? null : canonicalTime(p.mute_until), eligibilityStatus: closed(value.eligibility_status, ['eligible', 'unavailable']), usage: Object.freeze({ initiated: integer(value.quota_usage?.initiated ?? 0, 0), generated: integer(value.quota_usage?.generated ?? 0, 0), costUnits: integer(value.quota_usage?.cost_units ?? 0, 0) }), transcripts: Object.freeze({ available: false, reason: 'pilot_memory_only' }) });
}

export function getConsoleRestapNetworkStatus(state = {}) {
  if (!state.selectedTokenId) return { key: 'select', label: 'Select Looper' };
  if (state.status === 'idle' || state.status === 'loading') return { key: 'checking', label: 'Checking' };
  if (state.status === 'saving' || state.mutationKind) return { key: 'updating', label: state.mutationKind === 'send' ? 'Sending' : 'Updating' };
  if (state.status === 'conflict') return { key: 'review', label: 'Review' };
  if (state.status === 'error') return { key: 'error', label: 'Error' };
  if (state.status === 'unavailable' || !state.policy) return { key: 'unavailable', label: 'Unavailable' };
  if (state.policy.networkEnabled) return state.policy.eligibilityStatus === 'eligible' ? { key: 'active', label: 'Ready' } : { key: 'paused', label: 'Paused' };
  return state.policy.eligibilityStatus === 'eligible' ? { key: 'ready', label: 'Opted out' } : { key: 'locked', label: 'Locked' };
}

export function renderConsoleRestapNetworkPanel(state = {}) {
  const status = STATUSES.has(state.status) ? state.status : 'idle';
  const shell = (body, modifier = '') => '<section class="console-restap-network console-restap-network-workspace' + modifier + '" aria-label="RESTAP network">' + body + '</section>';
  if (!state.selectedTokenId) return shell('<section class="console-restap-empty" role="status"><span class="console-restap-eyebrow">Private network</span><h2>Select a Looper</h2><p>Choose an owned Looper to view its RESTAP readiness.</p></section>', ' console-restap-network-empty');
  if (status === 'loading') return shell('<section class="console-restap-skeleton" role="status" aria-live="polite" aria-label="Loading RESTAP network workspace"><span class="console-restap-eyebrow">RESTAP network</span><h2>Loading Looper #' + escapeHtml(state.selectedTokenId) + ' network</h2><div aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></section>', ' console-restap-network-loading');
  if (!state.policy) return renderUnavailableNetwork(state, status, shell);

  const p = state.policy; const display = state.policyDraft ? { ...p, ...state.policyDraft } : p; const saving = status === 'saving'; const projected = getConsoleRestapNetworkStatus(state); const formId = 'restap-network-policy-' + p.tokenId; const disabled = saving ? ' disabled' : '';
  const send = state.sendDraft ?? { recipientTokenId: '', topic: p.topics[0] ?? 'general' };
  const canSend = p.networkEnabled && p.eligibilityStatus === 'eligible' && !saving;
  const sendDisabled = canSend ? '' : ' disabled';
  const feedback = status === 'conflict' ? '<div class="console-restap-feedback console-restap-feedback-conflict" data-restap-feedback role="alert" aria-live="assertive"><strong>Network state changed.</strong><button type="button" data-action="refresh-restap-network">Refresh</button></div>' : status === 'error' ? '<div class="console-restap-feedback console-restap-feedback-error" data-restap-feedback role="alert" aria-live="assertive">' + escapeHtml(state.error ?? 'The network action did not complete.') + '</div>' : '<div class="console-restap-feedback" data-restap-feedback aria-live="polite" role="status">' + (saving ? (state.mutationKind === 'send' ? 'Sending one verified introduction…' : 'Saving network settings…') : '') + '</div>';

  return shell('<form id="' + formId + '" data-restap-network-policy class="console-restap-policy-form"><input type="hidden" name="expected_policy_version" value="' + p.policyVersion + '"></form>'
    + '<header class="console-restap-readiness" data-restap-section="readiness"><div class="console-restap-heading"><div><span class="console-restap-eyebrow">Private RESTAP network</span><h2>Looper #' + escapeHtml(p.tokenId) + ' network</h2><p>One owner-approved, synchronous Looper-to-Looper send.</p></div><span class="console-restap-state console-restap-state-' + projected.key + '" aria-label="Network status: ' + projected.label + '"><i aria-hidden="true"></i>' + projected.label + '</span></div><dl class="console-restap-status"><div><dt>Custody</dt><dd>' + (p.eligibilityStatus === 'eligible' ? 'Verified' : 'Unavailable') + '</dd><small>Checked again before every send</small></div><div><dt>Mode</dt><dd>Synchronous</dd><small>No background queue</small></div><div><dt>Used today</dt><dd>' + p.usage.initiated + ' initiated · ' + p.usage.generated + ' generated</dd><small>' + p.usage.costUnits + ' cost units</small></div></dl>' + feedback + '</header>'
    + '<section class="console-restap-card console-restap-permissions" data-restap-section="permissions"><div class="console-restap-card-heading"><div><span class="console-restap-kicker">Network permissions</span><h3>Owner controls</h3></div><span class="console-restap-policy-version">Policy v' + p.policyVersion + '</span></div>' + renderSwitch(formId, 'network_enabled', 'Opt this Looper into verified sends', 'Allows bounded sends only after both owners explicitly allow the peer and topic.', display.networkEnabled, disabled) + renderSwitch(formId, 'inbound_enabled', 'Allow inbound verified sends', 'Allows explicitly approved peers to address this Looper.', display.inboundEnabled, disabled) + '<button class="console-restap-primary-action" type="submit" form="' + formId + '" data-action="save-restap-network-policy"' + disabled + '>' + (saving && state.mutationKind === 'policy' ? 'Saving…' : 'Save network settings') + '</button></section>'
    + '<section class="console-restap-card console-restap-limits" data-restap-section="limits-topics"><span class="console-restap-kicker">Limits and topics</span><h3>Keep every send bounded</h3><div class="console-restap-limit-grid">' + renderLimit(formId, 'daily_initiated_conversation_limit', 'Daily initiated', display.initiatedLimit, 10, disabled) + renderLimit(formId, 'daily_generated_message_limit', 'Daily generated', display.generatedLimit, 30, disabled) + renderLimit(formId, 'per_peer_daily_limit', 'Per peer daily', display.peerLimit, 5, disabled) + '</div><fieldset class="console-restap-topics"><legend>Allowed topics</legend><div>' + TOPICS.map((topic) => renderTopic(formId, topic, display.topics.includes(topic), disabled)).join('') + '</div></fieldset></section>'
    + '<section class="console-restap-card console-restap-plan console-restap-send" data-restap-section="send"><span class="console-restap-kicker">Verified send</span><h3>Send one introduction now</h3><p class="console-restap-card-copy">The sender writes one bounded opening; the recipient returns one bounded reply. No autonomous loop follows.</p><form data-restap-network-send class="console-restap-intent-form"><label><span>Recipient Looper ID</span><input name="recipient_token_id" inputmode="numeric" autocomplete="off" required maxlength="4" value="' + escapeHtml(send.recipientTokenId) + '"' + sendDisabled + '></label><label><span>Topic</span><select name="topic"' + sendDisabled + '>' + TOPICS.map((topic) => '<option value="' + topic + '"' + (send.topic === topic ? ' selected' : '') + '>' + TOPIC_LABELS[topic] + '</option>').join('') + '</select></label><button type="submit" data-action="send-restap-network-talk"' + sendDisabled + '>' + (saving && state.mutationKind === 'send' ? 'Sending…' : 'Send verified introduction') + '</button></form>' + renderSendResult(state.sendResult) + '</section>'
    + '<details class="console-restap-card console-restap-advanced" data-restap-section="advanced"><summary><span><small>Optional policy controls</small><strong>Advanced controls</strong></span><i aria-hidden="true"></i></summary><div class="console-restap-details-body"><p>Both Loopers must allow each other. A block always wins.</p><label><span>Allowed peer Looper IDs</span><input form="' + formId + '" name="allow_peer_token_ids" maxlength="2048" value="' + escapeHtml(display.allowPeers.join(', ')) + '" autocomplete="off"></label><label><span>Blocked peer Looper IDs</span><input form="' + formId + '" name="block_peer_token_ids" maxlength="2048" value="' + escapeHtml(display.blockPeers.join(', ')) + '" autocomplete="off"></label><label><span>Mute until</span><input form="' + formId + '" name="mute_until" type="datetime-local" value="' + escapeHtml(display.muteUntil?.slice(0, 16) ?? '') + '"></label></div></details>'
    + '<aside class="console-restap-privacy console-restap-card" data-restap-section="privacy"><span aria-hidden="true">◇</span><div><strong>Private by design</strong><p class="console-restap-transcript-note">Helixa stores no message, reply, session, prompt, or transcript text. Only bounded status, hashes, timestamps, policy/custody versions, and provider usage are retained.</p></div></aside>'
    + '<details class="console-restap-card console-restap-danger" data-restap-section="danger"><summary><span><small>Emergency control</small><strong>Danger zone</strong></span><i aria-hidden="true"></i></summary><div class="console-restap-details-body"><h3>Stop network participation</h3><p>' + escapeHtml(RESTAP_NETWORK_STOP_CONFIRMATION) + '</p><button type="button" data-action="stop-restap-network"' + disabled + '>Stop network participation</button></div></details>');
}

function renderSendResult(result) {
  if (!result) return '<div class="console-restap-send-result" data-restap-send-result aria-live="polite"></div>';
  const status = String(result.status ?? '');
  if (status === 'committed' && result.reply) return '<div class="console-restap-send-result console-restap-send-success" data-restap-send-result role="status"><strong>Reply from Looper #' + escapeHtml(result.recipient_token_id) + '</strong><p>' + escapeHtml(result.reply) + '</p></div>';
  if (status === 'committed') return '<div class="console-restap-send-result console-restap-send-success" data-restap-send-result role="status"><strong>Already delivered</strong><p>This idempotent replay did not regenerate or retain the plaintext reply.</p></div>';
  if (status === 'processing') return '<div class="console-restap-send-result" data-restap-send-result role="status"><strong>Sending in background…</strong><p>Custody checks and both Looper replies are still running. Keep this screen open.</p></div>';
  if (status === 'charged_unknown') return '<div class="console-restap-send-result console-restap-send-warning" data-restap-send-result role="alert"><strong>Delivery outcome unknown</strong><p>The provider may have charged this send. It will not be retried automatically.</p></div>';
  if (status === 'cancelled_charged') return '<div class="console-restap-send-result console-restap-send-warning" data-restap-send-result role="alert"><strong>Authority changed before commit</strong><p>The send was cancelled after provider work and will not be retried automatically.</p></div>';
  return '<div class="console-restap-send-result" data-restap-send-result role="status"><strong>Send accepted</strong><p>Operation ' + escapeHtml(result.operation_id ?? '') + ' is ' + escapeHtml(status.replaceAll('_', ' ')) + '.</p></div>';
}

function renderUnavailableNetwork(state, status, shell) {
  if (status !== 'unavailable') return shell('<section class="console-restap-unavailable" role="alert"><span class="console-restap-eyebrow">Private RESTAP network</span><h2>Looper #' + escapeHtml(state.selectedTokenId) + ' network</h2><p>' + escapeHtml(state.error ?? 'RESTAP network controls could not be loaded.') + '</p><button type="button" data-action="refresh-restap-network">Retry</button></section>', ' console-restap-network-error');
  return shell('<header class="console-restap-readiness" data-restap-section="readiness"><div class="console-restap-heading"><div><span class="console-restap-eyebrow">Private RESTAP network</span><h2>Looper #' + escapeHtml(state.selectedTokenId) + ' network</h2><p>One synchronous verified send at a time.</p></div><span class="console-restap-state console-restap-state-unavailable">Unavailable</span></div></header><section class="console-restap-card console-restap-permissions" data-restap-section="permissions"><h3>Owner controls</h3><p><strong>Network participation is unavailable.</strong> Read-only preview until this Looper can participate.</p></section><section class="console-restap-card console-restap-limits" data-restap-section="limits-topics"><h3>Bounded policy</h3><p>Peer, topic, and daily limits are enforced before provider dispatch.</p></section><section class="console-restap-card console-restap-plan" data-restap-section="send"><h3>Send one introduction now</h3><input disabled aria-disabled="true" placeholder="Recipient Looper ID"><button disabled aria-disabled="true">Send verified introduction</button></section><aside class="console-restap-privacy console-restap-card" data-restap-section="privacy"><strong>Private by design</strong><p>No plaintext transcript or session is stored.</p></aside>', ' console-restap-network-preview');
}

function renderSwitch(formId, name, label, description, checked, disabled) { const id = 'restap-' + name.replaceAll('_', '-'); return '<label class="console-restap-switch" for="' + id + '"><span><strong>' + escapeHtml(label) + '</strong><small id="' + id + '-description">' + escapeHtml(description) + '</small></span><input id="' + id + '" form="' + escapeHtml(formId) + '" type="checkbox" role="switch" aria-describedby="' + id + '-description" name="' + name + '"' + (checked ? ' checked' : '') + disabled + '><i aria-hidden="true"></i></label>'; }
function renderLimit(formId, name, label, value, max, disabled) { return '<label class="console-restap-limit"><span>' + escapeHtml(label) + '</span><span class="console-restap-number"><input form="' + escapeHtml(formId) + '" name="' + name + '" type="number" min="0" max="' + max + '" step="1" value="' + value + '"' + disabled + '><small>of ' + max + '</small></span></label>'; }
function renderTopic(formId, topic, checked, disabled) { return '<label class="console-restap-topic-chip"><input form="' + escapeHtml(formId) + '" type="checkbox" name="topic:' + topic + '"' + (checked ? ' checked' : '') + disabled + '><span>' + TOPIC_LABELS[topic] + '</span></label>'; }
function exactResponseObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' is invalid.'); const actual = Reflect.ownKeys(value); const allowed = new Set(keys); if (actual.length !== keys.length) throw new TypeError(label + ' is invalid.'); for (const key of actual) { if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(label + ' is invalid.'); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' is invalid.'); } }
function isCurrent(state, tokenId, requestId) { return state?.selectedTokenId === token(tokenId) && state?.requestId === integer(requestId, 0); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
function token(value) { const text = String(value ?? ''); if (!/^[1-9][0-9]*$/u.test(text) || BigInt(text) > 7_777n) throw new TypeError('token is invalid.'); return text; }
function tokenArray(value) { if (!Array.isArray(value) || value.length > 256) throw new TypeError('token list is invalid.'); const result = value.map(token); if (new Set(result).size !== result.length) throw new TypeError('token list duplicates.'); return Object.freeze(result.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)); }
function exactDraftObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new TypeError(label + ' is invalid.'); }
function closedArray(value, allowed) { if (!Array.isArray(value) || value.some((item) => !allowed.includes(item)) || new Set(value).size !== value.length) throw new TypeError('closed list is invalid.'); return Object.freeze([...value]); }
function closed(value, allowed) { if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError('closed value is invalid.'); return value; }
function canonicalTime(value) { if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('time is invalid.'); return value; }
function integer(value, min, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('integer is invalid.'); return value; }
function bool(value) { if (typeof value !== 'boolean') throw new TypeError('boolean is invalid.'); return value; }

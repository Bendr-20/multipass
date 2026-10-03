const TOPICS = Object.freeze(['collection-lore', 'trait-discussion', 'market-observation', 'project-updates', 'collaboration-ideas', 'general']);
const STATUSES = new Set(['idle', 'loading', 'ready', 'saving', 'error', 'conflict', 'unavailable']);
const POLICY_RESPONSE_KEYS = Object.freeze(['schema_version', 'token_id', 'policy', 'lease_status', 'eligibility_status', 'quota_usage', 'transcripts']);
const POLICY_KEYS = Object.freeze(['policy_version', 'custody_generation', 'network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled', 'daily_initiated_conversation_limit', 'daily_generated_message_limit', 'per_peer_daily_limit', 'topics', 'allow_peer_token_ids', 'block_peer_token_ids', 'mute_until']);
const INTENT_KEYS = Object.freeze(['intent_id', 'source', 'topic', 'status', 'earliest_at', 'expires_at', 'attempt_count', 'attempt_limit', 'next_eligible_at']);

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
  return Object.freeze({ ...state, status: conflict ? 'conflict' : unavailable ? 'unavailable' : 'error', policy: conflict ? state.policy : null, intents: conflict ? state.intents : Object.freeze([]), error: conflict ? 'State changed. Refresh before saving again.' : unavailable ? 'RESTAP network controls are unavailable for this Looper.' : 'RESTAP network controls could not be loaded.' });
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

export function renderConsoleRestapNetworkPanel(state = {}) {
  const status = STATUSES.has(state.status) ? state.status : 'idle';
  if (!state.selectedTokenId) return '<section class="console-restap-network" aria-label="RESTAP network"><p>Select a Looper to manage its network policy.</p></section>';
  if (status === 'loading') return '<section class="console-restap-network" aria-label="RESTAP network"><p>Loading RESTAP network controls...</p></section>';
  if (!state.policy) return '<section class="console-restap-network" aria-label="RESTAP network"><p role="status">' + escapeHtml(state.error ?? 'RESTAP network controls are unavailable.') + '</p>' + (status === 'conflict' ? '<button type="button" data-action="refresh-restap-network">Refresh</button>' : '') + '</section>';
  const p = state.policy;
  return '<section class="console-restap-network" aria-label="RESTAP network">'
    + '<header><h2>RESTAP network</h2><p>Owner controls for Looper #' + escapeHtml(p.tokenId) + '.</p></header>'
    + '<dl class="console-restap-status"><div><dt>Eligibility</dt><dd>' + escapeHtml(p.eligibilityStatus) + '</dd></div><div><dt>Lease</dt><dd>' + escapeHtml(p.leaseStatus) + '</dd></div><div><dt>Usage</dt><dd>' + p.usage.initiated + ' initiated · ' + p.usage.generated + ' generated · ' + p.usage.costUnits + ' cost units</dd></div></dl>'
    + (status === 'conflict' ? '<p role="alert">State changed. Refresh before saving again.</p><button type="button" data-action="refresh-restap-network">Refresh</button>' : '')
    + '<form data-restap-network-policy><input type="hidden" name="expected_policy_version" value="' + p.policyVersion + '">'
    + checkbox('network_enabled', 'Opt this Looper into RESTAP network', p.networkEnabled)
    + checkbox('inbound_enabled', 'Allow inbound conversations', p.inboundEnabled)
    + checkbox('autonomous_initiation_enabled', 'Allow owner-scheduled autonomous initiation', p.autonomousEnabled)
    + '<label>Daily initiated limit <input name="daily_initiated_conversation_limit" type="number" min="0" max="10" value="' + p.initiatedLimit + '"></label>'
    + '<label>Daily generated limit <input name="daily_generated_message_limit" type="number" min="0" max="30" value="' + p.generatedLimit + '"></label>'
    + '<label>Per-peer daily limit <input name="per_peer_daily_limit" type="number" min="0" max="5" value="' + p.peerLimit + '"></label>'
    + '<fieldset><legend>Topics</legend>' + TOPICS.map((topic) => checkbox('topic:' + topic, topic, p.topics.includes(topic))).join('') + '</fieldset>'
    + '<label>Allowed peer token IDs <input name="allow_peer_token_ids" value="' + escapeHtml(p.allowPeers.join(', ')) + '"></label>'
    + '<label>Blocked peer token IDs <input name="block_peer_token_ids" value="' + escapeHtml(p.blockPeers.join(', ')) + '"></label>'
    + '<label>Mute until <input name="mute_until" type="datetime-local" value="' + escapeHtml(p.muteUntil?.slice(0, 16) ?? '') + '"></label>'
    + '<button type="submit" data-action="save-restap-network-policy">Save network policy</button></form>'
    + '<form data-restap-network-intent><h3>Schedule conversation</h3><label>Peer token IDs <input name="peer_token_ids" required></label><label>Topic <select name="topic">' + TOPICS.map((topic) => '<option value="' + topic + '">' + topic + '</option>').join('') + '</select></label><label>Cadence <select name="cadence"><option value="once">One shot</option><option value="daily">Daily</option></select></label><label>Run at <input name="run_at" type="datetime-local" required></label><button type="submit" data-action="create-restap-network-intent">Create intent</button></form>'
    + '<section aria-label="Scheduled RESTAP intents"><h3>Scheduled work</h3>' + renderIntents(state.intents, p.policyVersion) + '</section>'
    + '<p class="console-restap-transcript-note">Transcripts are unavailable during the pilot. Active text stays in memory only.</p>'
    + '<section class="console-restap-stop"><h3>Emergency stop</h3><p>' + escapeHtml(RESTAP_NETWORK_STOP_CONFIRMATION) + '</p><button type="button" data-action="stop-restap-network" data-expected-policy-version="' + p.policyVersion + '">Stop network participation</button></section></section>';
}

function renderIntents(intents, policyVersion) { if (!Array.isArray(intents) || !intents.length) return '<p>No scheduled RESTAP work.</p>'; return '<ul>' + intents.map((item) => '<li><strong>' + escapeHtml(item.topic) + '</strong> · ' + escapeHtml(item.source) + ' · ' + escapeHtml(item.status) + ' <time>' + escapeHtml(item.nextEligibleAt) + '</time>' + (['pending', 'leased'].includes(item.status) ? ' <button type="button" data-action="cancel-restap-network-intent" data-intent-id="' + escapeHtml(item.intentId) + '" data-expected-policy-version="' + policyVersion + '">Cancel</button>' : '') + '</li>').join('') + '</ul>'; }
function normalizeIntents(response, tokenId) {
  exactResponseObject(response, ['schema_version', 'token_id', 'intents'], 'RESTAP intents response');
  const expectedTokenId = token(tokenId);
  if (response.schema_version !== '0.1.0' || response.token_id !== expectedTokenId || !Array.isArray(response.intents) || response.intents.length > 256) throw new TypeError('RESTAP intents response is invalid.');
  return Object.freeze(response.intents.map((value) => {
    exactResponseObject(value, INTENT_KEYS, 'RESTAP intent');
    return Object.freeze({ tokenId: expectedTokenId, intentId: identifier(value.intent_id), source: closed(value.source, ['one_shot', 'daily']), topic: closed(value.topic, TOPICS), status: closed(value.status, ['pending', 'leased', 'completed', 'cancelled', 'expired', 'exhausted']), earliestAt: canonicalTime(value.earliest_at), expiresAt: canonicalTime(value.expires_at), nextEligibleAt: canonicalTime(value.next_eligible_at), attemptCount: integer(value.attempt_count, 0), attemptLimit: integer(value.attempt_limit, 1) });
  }));
}
function exactResponseObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' is invalid.'); const actual = Reflect.ownKeys(value); const allowed = new Set(keys); if (actual.length !== keys.length) throw new TypeError(label + ' is invalid.'); for (const key of actual) { if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(label + ' is invalid.'); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' is invalid.'); } for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(label + ' is invalid.'); }
function isCurrent(state, tokenId, requestId) { return state?.selectedTokenId === token(tokenId) && state?.requestId === integer(requestId, 0); }
function checkbox(name, label, checked) { return '<label><input type="checkbox" name="' + escapeHtml(name) + '"' + (checked ? ' checked' : '') + '> ' + escapeHtml(label) + '</label>'; }
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

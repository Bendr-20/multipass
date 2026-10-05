import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { RESTAP_NETWORK_STOP_CONFIRMATION, beginConsoleRestapNetworkLoad, clearConsoleRestapNetworkSelection, createInitialConsoleRestapNetworkState, failConsoleRestapNetworkLoad, getConsoleRestapNetworkSendFingerprint, getConsoleRestapNetworkStatus, normalizeConsoleRestapNetworkSendDraft, renderConsoleRestapNetworkPanel, resolveConsoleRestapNetworkLoad } from '../src/console-restap-network.js';

function response(patch = {}) { return { schema_version: '0.1.0', token_id: '617', policy: { policy_version: 3, custody_generation: 7, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['3802'], block_peer_token_ids: [], mute_until: null, ...patch }, lease_status: 'inactive', eligibility_status: 'eligible', quota_usage: { initiated: 1, generated: 2, cost_units: 3 }, transcripts: { available: false, reason: 'pilot_memory_only' } }; }
function ready() { const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '617', requestId: 1 }); return resolveConsoleRestapNetworkLoad(loading, { tokenId: '617', requestId: 1, policyResponse: response() }); }
function render(state) { return new JSDOM('<main>' + renderConsoleRestapNetworkPanel(state) + '</main>').window.document.querySelector('main'); }
function result(patch = {}) { return { schema_version: '0.1.0', operation_id: 'vs_' + 'a'.repeat(48), status: 'committed', sender_token_id: '617', recipient_token_id: '3802', topic: 'general', opening_sha256: 'a'.repeat(64), reply_sha256: 'b'.repeat(64), usage: { sender: null, recipient: null }, replayed: false, reply: 'Bounded response.', ...patch }; }

test('ready panel keeps policy controls and replaces scheduler with one synchronous send', () => {
  const root = render(ready());
  assert.ok(root.querySelector('[data-restap-network-policy]'));
  assert.ok(root.querySelector('[name="network_enabled"]'));
  assert.ok(root.querySelector('[name="inbound_enabled"]'));
  assert.equal(root.querySelector('[name="autonomous_initiation_enabled"]'), null);
  assert.ok(root.querySelector('[data-restap-network-send]'));
  assert.ok(root.querySelector('[name="recipient_token_id"]'));
  assert.equal(root.querySelectorAll('[name="topic"] option').length, 6);
  assert.equal(root.querySelector('[data-action="send-restap-network-talk"]')?.textContent.trim(), 'Send verified introduction');
  assert.equal(root.querySelector('[name="cadence"]'), null);
  assert.equal(root.querySelector('[name="run_at"]'), null);
  assert.equal(root.querySelector('[data-action="cancel-restap-network-intent"]'), null);
  assert.doesNotMatch(root.textContent, /schedule|worker queue|planned introductions/i);
});

test('workspace preserves semantic mobile order and five-workspace-compatible root selectors', () => {
  const root = render(ready());
  const workspace = root.querySelector('.console-restap-network-workspace');
  assert.ok(workspace);
  assert.deepEqual([...workspace.querySelectorAll('[data-restap-section]')].map((node) => node.dataset.restapSection), ['readiness', 'permissions', 'limits-topics', 'send', 'advanced', 'privacy', 'danger']);
  assert.equal(workspace.querySelector('[data-restap-section="advanced"]')?.tagName, 'DETAILS');
  assert.equal(workspace.querySelector('[data-restap-section="danger"]')?.tagName, 'DETAILS');
  assert.match(workspace.textContent, /synchronous/i);
  assert.match(workspace.textContent, /No autonomous loop/i);
});

test('send draft is strict and fingerprint changes only with recipient or topic', () => {
  const draft = normalizeConsoleRestapNetworkSendDraft({ recipientTokenId: '3802', topic: 'general' });
  assert.deepEqual(draft, { recipientTokenId: '3802', topic: 'general' });
  assert.equal(getConsoleRestapNetworkSendFingerprint(draft), getConsoleRestapNetworkSendFingerprint({ ...draft }));
  assert.notEqual(getConsoleRestapNetworkSendFingerprint(draft), getConsoleRestapNetworkSendFingerprint({ ...draft, topic: 'project-updates' }));
  assert.throws(() => normalizeConsoleRestapNetworkSendDraft({ recipientTokenId: '03802', topic: 'general' }), /token/i);
  assert.throws(() => normalizeConsoleRestapNetworkSendDraft({ recipientTokenId: '3802', topic: 'anything' }), /closed/i);
});

test('result surface distinguishes reply, replay, charged unknown, and revoked authority without exposing plaintext on replay', () => {
  let root = render({ ...ready(), sendResult: result() });
  assert.match(root.querySelector('[data-restap-send-result]')?.textContent ?? '', /Bounded response/);
  root = render({ ...ready(), sendResult: result({ replayed: true, reply: undefined }) });
  assert.match(root.querySelector('[data-restap-send-result]')?.textContent ?? '', /Already delivered.*did not regenerate/s);
  root = render({ ...ready(), sendResult: result({ status: 'charged_unknown', reply: undefined, reason: 'recipient_transport_ambiguous' }) });
  assert.match(root.querySelector('[data-restap-send-result]')?.textContent ?? '', /outcome unknown.*not be retried automatically/s);
  root = render({ ...ready(), sendResult: result({ status: 'cancelled_charged', reply: undefined, reason: 'authority_revoked' }) });
  assert.match(root.querySelector('[data-restap-send-result]')?.textContent ?? '', /Authority changed.*not be retried automatically/s);
});

test('privacy and stop copy describe the actual synchronous boundary', () => {
  const root = render(ready());
  const privacy = root.querySelector('.console-restap-transcript-note')?.textContent ?? '';
  for (const term of ['message', 'reply', 'session', 'prompt', 'transcript', 'hashes']) assert.match(privacy, new RegExp(term, 'i'));
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /blocks new synchronous sends/i);
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /does not change onchain ownership or ordinary Console chat/i);
  assert.doesNotMatch(RESTAP_NETWORK_STOP_CONFIRMATION, /lease|pending work/i);
});

test('selection changes clear owner projection and unavailable preview exposes no mutation action', () => {
  const changed = clearConsoleRestapNetworkSelection(ready(), '3802');
  assert.equal(changed.policy, null);
  assert.equal(changed.sendResult, null);
  const unavailable = failConsoleRestapNetworkLoad(beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '617', requestId: 2 }), { tokenId: '617', requestId: 2, error: { status: 404 } });
  const root = render(unavailable);
  assert.match(root.textContent, /Read-only/i);
  assert.equal(root.querySelector('form'), null);
  assert.equal(root.querySelector('[data-action]'), null);
  assert.equal([...root.querySelectorAll('input, button')].every((control) => control.disabled), true);
});

test('status no longer depends on a legacy activation lease', () => {
  const state = ready();
  assert.deepEqual(getConsoleRestapNetworkStatus(state), { key: 'active', label: 'Ready' });
  assert.deepEqual(getConsoleRestapNetworkStatus({ ...state, mutationKind: 'send' }), { key: 'updating', label: 'Sending' });
  assert.deepEqual(getConsoleRestapNetworkStatus({ ...state, policy: { ...state.policy, networkEnabled: false } }), { key: 'ready', label: 'Opted out' });
});

test('policy normalization remains exact and fail-closed', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '617', requestId: 3 });
  for (const policyResponse of [{ ...response(), wallet: 'PRIVATE' }, { ...response(), policy: { ...response().policy, grant: 'PRIVATE' } }, { ...response(), token_id: '3802' }]) {
    assert.throws(() => resolveConsoleRestapNetworkLoad(loading, { tokenId: '617', requestId: 3, policyResponse }), /invalid/i);
  }
});

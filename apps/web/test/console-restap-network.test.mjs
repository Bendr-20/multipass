import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { RESTAP_NETWORK_STOP_CONFIRMATION, beginConsoleRestapNetworkLoad, clearConsoleRestapNetworkSelection, createInitialConsoleRestapNetworkState, failConsoleRestapNetworkLoad, renderConsoleRestapNetworkPanel, resolveConsoleRestapNetworkLoad } from '../src/console-restap-network.js';

function response(patch = {}) {
  return { schema_version: '0.1.0', token_id: '1', policy: { policy_version: 3, custody_generation: 7, network_enabled: false, inbound_enabled: false, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 0, daily_generated_message_limit: 0, per_peer_daily_limit: 0, topics: [], allow_peer_token_ids: [], block_peer_token_ids: [], mute_until: null, ...patch }, lease_status: 'inactive', eligibility_status: 'eligible', quota_usage: { initiated: 1, generated: 2, cost_units: 3 }, transcripts: { available: false, reason: 'pilot_memory_only' } };
}
function intents() { return { schema_version: '0.1.0', token_id: '1', intents: [{ intent_id: 'intent-panel-000000000000000000001', source: 'daily', topic: 'general', status: 'pending', earliest_at: '2026-10-03T00:00:00.000Z', expires_at: '2026-10-04T00:00:00.000Z', attempt_count: 0, attempt_limit: 3, next_eligible_at: '2026-10-03T00:00:00.000Z' }] }; }
function render(state) { return new JSDOM('<main>' + renderConsoleRestapNetworkPanel(state) + '</main>').window.document.querySelector('main'); }

test('closed defaults and owner statuses normalize without chat or transcript state', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 1 });
  const ready = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 1, policyResponse: response(), intentsResponse: { schema_version: '0.1.0', token_id: '1', intents: [] } });
  assert.equal(ready.policy.networkEnabled, false);
  assert.equal(ready.policy.inboundEnabled, false);
  assert.equal(ready.policy.autonomousEnabled, false);
  assert.deepEqual(ready.policy.transcripts, { available: false, reason: 'pilot_memory_only' });
  assert.equal(Object.hasOwn(ready, 'messages'), false);
});

test('panel renders flags lower caps topics peers mute intents usage cancellation and transcript note', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 2 });
  const state = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 2, policyResponse: response({ network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: true, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['2'], mute_until: '2026-10-03T00:00:00.000Z' }), intentsResponse: intents() });
  const root = render(state);
  assert.equal(root.querySelector('[name="network_enabled"]').checked, true);
  assert.equal(root.querySelector('[name="inbound_enabled"]').checked, true);
  assert.equal(root.querySelector('[name="autonomous_initiation_enabled"]').checked, true);
  assert.equal(root.querySelector('[name="daily_initiated_conversation_limit"]').max, '10');
  assert.equal(root.querySelector('[name="daily_generated_message_limit"]').max, '30');
  assert.equal(root.querySelector('[name="per_peer_daily_limit"]').max, '5');
  assert.equal(root.querySelectorAll('[name^="topic:"]').length, 6);
  assert.equal(root.querySelector('[name="allow_peer_token_ids"]').value, '2');
  assert.ok(root.querySelector('[name="block_peer_token_ids"]'));
  assert.ok(root.querySelector('[name="mute_until"]'));
  assert.equal(root.querySelectorAll('[name="cadence"] option').length, 2);
  assert.match(root.textContent, /1 initiated.*2 generated.*3 cost units/s);
  assert.ok(root.querySelector('[data-action="cancel-restap-network-intent"]'));
  assert.match(root.textContent, /Transcripts are unavailable during the pilot/i);
});

test('emergency stop copy states exact destructive and non-destructive boundaries', () => {
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /opts this Looper out/i);
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /revokes its network lease/i);
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /cancels pending network work/i);
  assert.match(RESTAP_NETWORK_STOP_CONFIRMATION, /does not change onchain ownership or ordinary Console chat/i);
});

test('selection change clears another owner projection and ignores stale responses', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 4 });
  const ready = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 4, policyResponse: response(), intentsResponse: intents() });
  const changed = clearConsoleRestapNetworkSelection(ready, '2');
  assert.equal(changed.selectedTokenId, '2');
  assert.equal(changed.policy, null);
  assert.deepEqual(changed.intents, []);
  const stale = resolveConsoleRestapNetworkLoad(changed, { tokenId: '1', requestId: 4, policyResponse: response(), intentsResponse: intents() });
  assert.equal(stale, changed);
});

test('version conflicts retain projection and render refresh action', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 5 });
  const ready = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 5, policyResponse: response(), intentsResponse: intents() });
  const conflict = failConsoleRestapNetworkLoad(ready, { tokenId: '1', requestId: 5, error: { status: 409, code: 'version_conflict' } });
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.policy, ready.policy);
  assert.ok(render(conflict).querySelector('[data-action="refresh-restap-network"]'));
});

test('policy normalization rejects wrong versions and unknown top-level or nested fields', () => {
  const invalid = [
    { ...response(), schema_version: '0.2.0' },
    { ...response(), wallet: 'PRIVATE' },
    { ...response(), policy: { ...response().policy, grant: 'PRIVATE' } },
    { ...response(), quota_usage: { ...response().quota_usage, raw_cost: 99 } },
    { ...response(), transcripts: { ...response().transcripts, url: 'https://private.test' } },
  ];
  for (const policyResponse of invalid) {
    const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 6 });
    assert.throws(() => resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 6, policyResponse, intentsResponse: { schema_version: '0.1.0', token_id: '1', intents: [] } }), /invalid/i);
  }
});

test('intent envelopes and entries require exact schemas and selected token binding', () => {
  const valid = intents();
  const invalid = [
    { ...valid, schema_version: '0.2.0' },
    { ...valid, token_id: '2' },
    { ...valid, private: 'PRIVATE' },
    { ...valid, intents: [{ ...valid.intents[0], operation_id: 'PRIVATE' }] },
  ];
  for (const intentsResponse of invalid) {
    const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 7 });
    assert.throws(() => resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 7, policyResponse: response(), intentsResponse }), /invalid/i);
  }
});

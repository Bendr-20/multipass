import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { RESTAP_NETWORK_STOP_CONFIRMATION, beginConsoleRestapNetworkLoad, clearConsoleRestapNetworkSelection, createInitialConsoleRestapNetworkState, failConsoleRestapNetworkLoad, getConsoleRestapNetworkStatus, renderConsoleRestapNetworkPanel, resolveConsoleRestapNetworkLoad } from '../src/console-restap-network.js';

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
  assert.match(root.textContent, /processed by the model provider/i);
  assert.match(root.textContent, /not stored as transcripts by Helixa/i);
  assert.match(root.textContent, /held in process memory/i);
  assert.match(root.textContent, /bounded non-content accounting/i);
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

test('Network workspace renders semantic sections in the approved mobile order', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 8 });
  const state = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 8, policyResponse: response({ network_enabled: true, topics: ['general'] }), intentsResponse: intents() });
  const root = render(state);
  const workspace = root.querySelector('.console-restap-network-workspace');
  assert.ok(workspace);
  assert.match(workspace.querySelector('h2')?.textContent ?? '', /Looper #1 network/i);
  assert.deepEqual([...workspace.querySelectorAll('[data-restap-section]')].map((node) => node.dataset.restapSection), [
    'readiness', 'permissions', 'limits-topics', 'plan', 'scheduled', 'advanced', 'privacy', 'danger',
  ]);
  assert.equal(workspace.querySelector('[data-restap-section="advanced"]')?.tagName, 'DETAILS');
  assert.equal(workspace.querySelector('[data-restap-section="danger"]')?.tagName, 'DETAILS');
  assert.equal(workspace.querySelector('[data-restap-section="advanced"]')?.open, false);
  assert.equal(workspace.querySelector('[data-restap-section="danger"]')?.open, false);
  assert.match(workspace.querySelector('[data-restap-section="plan"] h3')?.textContent ?? '', /Plan an introduction/i);
  assert.equal(workspace.querySelector('[data-action="create-restap-network-intent"]')?.textContent.trim(), 'Plan introduction');
  assert.equal(workspace.querySelector('[data-action="save-restap-network-policy"]')?.textContent.trim(), 'Save network settings');
  assert.equal(workspace.querySelectorAll('.console-restap-intent-card').length, 1);
  assert.doesNotMatch(workspace.textContent, /intent-panel-/);
  assert.match(workspace.querySelector('.console-restap-transcript-note')?.textContent ?? '', /processed by the model provider/i);
  assert.match(workspace.querySelector('.console-restap-transcript-note')?.textContent ?? '', /not stored as transcripts by Helixa/i);
  assert.match(workspace.querySelector('.console-restap-transcript-note')?.textContent ?? '', /held in process memory/i);
  assert.match(workspace.querySelector('.console-restap-transcript-note')?.textContent ?? '', /bounded non-content accounting/i);
});

test('native switches chips limits and live regions remain accessible and contract compatible', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 9 });
  const state = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 9, policyResponse: response(), intentsResponse: { schema_version: '0.1.0', token_id: '1', intents: [] } });
  const root = render(state);
  for (const name of ['network_enabled', 'inbound_enabled', 'autonomous_initiation_enabled']) {
    const input = root.querySelector('[name="' + name + '"]');
    assert.equal(input?.type, 'checkbox');
    assert.equal(input?.getAttribute('role'), 'switch');
    assert.ok(input?.getAttribute('aria-describedby'));
  }
  assert.equal(root.querySelectorAll('.console-restap-topic-chip input[type="checkbox"][name^="topic:"]').length, 6);
  assert.equal(root.querySelector('[name="daily_initiated_conversation_limit"]')?.max, '10');
  assert.equal(root.querySelector('[name="daily_generated_message_limit"]')?.max, '30');
  assert.equal(root.querySelector('[name="per_peer_daily_limit"]')?.max, '5');
  assert.equal(root.querySelector('[data-restap-feedback]')?.getAttribute('aria-live'), 'polite');
  assert.match(root.querySelector('[aria-label="Scheduled RESTAP intents"]')?.textContent ?? '', /No introductions are planned/i);
});

test('navigation status applies every transient precedence row before settled policy state', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 10 });
  const ready = resolveConsoleRestapNetworkLoad(loading, {
    tokenId: '1',
    requestId: 10,
    policyResponse: { ...response({ network_enabled: true }), lease_status: 'active' },
    intentsResponse: { schema_version: '0.1.0', token_id: '1', intents: [] },
  });
  const cases = [
    [{ ...ready, selectedTokenId: null, status: 'saving', mutationKind: 'policy' }, 'select', 'Select Looper'],
    [{ ...ready, status: 'idle', mutationKind: 'policy' }, 'checking', 'Checking'],
    [{ ...ready, status: 'loading', mutationKind: 'policy' }, 'checking', 'Checking'],
    [{ ...ready, status: 'saving' }, 'updating', 'Updating'],
    [{ ...ready, mutationKind: 'intent' }, 'updating', 'Updating'],
    [{ ...ready, status: 'conflict' }, 'review', 'Review'],
    [{ ...ready, status: 'error' }, 'error', 'Error'],
    [{ ...ready, status: 'unavailable', policy: null }, 'unavailable', 'Unavailable'],
    [{ ...ready, policy: null }, 'unavailable', 'Unavailable'],
  ];

  for (const [state, key, label] of cases) {
    assert.deepEqual(getConsoleRestapNetworkStatus(state), { key, label });
  }
});

test('navigation status covers the normalized settled network authority cross-product', () => {
  const eligibilityStatuses = ['eligible', 'unavailable'];
  const leaseStatuses = ['active', 'inactive', 'unavailable'];

  for (const networkEnabled of [false, true]) {
    for (const eligibilityStatus of eligibilityStatuses) {
      for (const leaseStatus of leaseStatuses) {
        const usable = eligibilityStatus === 'eligible' && leaseStatus === 'active';
        const expected = networkEnabled
          ? usable ? { key: 'active', label: 'Active' } : { key: 'paused', label: 'Paused' }
          : usable ? { key: 'ready', label: 'Ready' } : { key: 'locked', label: 'Locked' };
        const state = {
          selectedTokenId: '1',
          status: 'ready',
          policy: { networkEnabled, eligibilityStatus, leaseStatus },
        };
        assert.deepEqual(
          getConsoleRestapNetworkStatus(state),
          expected,
          JSON.stringify({ networkEnabled, eligibilityStatus, leaseStatus }),
        );
      }
    }
  }
});

test('loading and neutral 404 or 503 states never expose network mutation controls', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 12 });
  const loadingRoot = render(loading);
  assert.ok(loadingRoot.querySelector('.console-restap-skeleton[role="status"]'));
  assert.equal(loadingRoot.querySelector('form'), null);

  for (const status of [404, 503]) {
    const unavailable = failConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 12, error: { status } });
    const unavailableRoot = render(unavailable);
    assert.match(unavailableRoot.textContent, /Network participation is unavailable/i);
    assert.match(unavailableRoot.textContent, /Read-only preview/i);
    assert.match(unavailableRoot.textContent, /Network permissions/i);
    assert.match(unavailableRoot.textContent, /Activity limits/i);
    assert.match(unavailableRoot.textContent, /Plan an introduction/i);
    assert.doesNotMatch(unavailableRoot.textContent, /foundation|install|root cause/i);
    assert.equal(unavailableRoot.querySelectorAll('[data-restap-section]').length, 5);
    assert.ok(unavailableRoot.querySelectorAll('input, select').length >= 10);
    assert.equal([...unavailableRoot.querySelectorAll('input, select')].every((control) => control.disabled), true);
    assert.equal(unavailableRoot.querySelector('[data-restap-network-policy]'), null);
    assert.equal(unavailableRoot.querySelector('[data-restap-network-intent]'), null);
    assert.equal(unavailableRoot.querySelector('[data-action]'), null);
    assert.equal(unavailableRoot.querySelector('form, button'), null);
  }
});

test('ordinary load errors remain distinct and offer Retry', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 14 });
  const failed = failConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 14, error: { status: 500 } });
  const root = render(failed);

  assert.deepEqual(getConsoleRestapNetworkStatus(failed), { key: 'error', label: 'Error' });
  assert.doesNotMatch(root.textContent, /Network participation is unavailable/i);
  assert.equal(root.querySelector('[data-action="refresh-restap-network"]')?.textContent.trim(), 'Retry');
  assert.equal(root.querySelector('[data-restap-network-policy]'), null);
});

test('saving state disables duplicate mutations without changing form names', () => {
  const loading = beginConsoleRestapNetworkLoad(createInitialConsoleRestapNetworkState(), { tokenId: '1', requestId: 13 });
  const ready = resolveConsoleRestapNetworkLoad(loading, { tokenId: '1', requestId: 13, policyResponse: response(), intentsResponse: intents() });
  const root = render({ ...ready, status: 'saving' });
  assert.equal(root.querySelector('[data-action="save-restap-network-policy"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="create-restap-network-intent"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="cancel-restap-network-intent"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="save-restap-network-policy"]')?.textContent.trim(), 'Saving…');
});

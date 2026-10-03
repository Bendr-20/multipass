import assert from 'node:assert/strict';
import test from 'node:test';

import { ConsoleRestapNetworkApiError, createConsoleRestapNetworkApi } from '../src/console-restap-network-api.js';

function policy() { return { expected_policy_version: 3, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['2'], block_peer_token_ids: [], mute_until: null }; }
function intent() { return { peer_token_ids: ['2'], topic: 'general', cadence: 'once', run_at: '2026-10-03T00:00:00.000Z', idempotency_key: 'intent-client-00000000000000000001' }; }
function policyResponse(tokenId = '1') { return { schema_version: '0.1.0', token_id: tokenId, policy: { policy_version: 3, custody_generation: 7, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['2'], block_peer_token_ids: [], mute_until: null }, lease_status: 'active', eligibility_status: 'eligible', quota_usage: { initiated: 1, generated: 2, cost_units: 3 }, transcripts: { available: false, reason: 'pilot_memory_only' } }; }
function projectedIntent() { return { intent_id: 'intent-client-00000000000000000001', source: 'one_shot', topic: 'general', status: 'pending', earliest_at: '2026-10-03T00:00:00.000Z', expires_at: '2026-10-04T00:00:00.000Z', attempt_count: 0, attempt_limit: 3, next_eligible_at: '2026-10-03T00:00:00.000Z' }; }
function responseFor(url, method) {
  if (url.endsWith('/policy') || url.endsWith('/stop')) return policyResponse();
  if (method === 'GET') return { schema_version: '0.1.0', token_id: '1', intents: [projectedIntent()] };
  return { schema_version: '0.1.0', token_id: '1', intent: projectedIntent() };
}

function fixture({ status = 200, response } = {}) {
  const calls = [];
  const api = createConsoleRestapNetworkApi({ apiBase: 'https://api.example.test/', fetchImpl: async (url, init) => { calls.push({ url, init }); const payload = typeof response === 'function' ? response(url, init) : response ?? responseFor(url, init.method); return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); } });
  return { api, calls };
}

test('all six methods use exact paths methods credentials and CSRF', async () => {
  const f = fixture();
  await f.api.getPolicy({ tokenId: '1' });
  await f.api.putPolicy({ tokenId: '1', csrfToken: 'csrf', policy: policy() });
  await f.api.createIntent({ tokenId: '1', csrfToken: 'csrf', intent: intent() });
  await f.api.listIntents({ tokenId: '1' });
  await f.api.deleteIntent({ tokenId: '1', intentId: 'intent-client-00000000000000000001', expectedPolicyVersion: 3, csrfToken: 'csrf' });
  await f.api.stop({ tokenId: '1', expectedPolicyVersion: 3, csrfToken: 'csrf' });
  assert.deepEqual(f.calls.map(({ url, init }) => [url, init.method]), [
    ['https://api.example.test/api/multipass/console/restap-network/1/policy', 'GET'],
    ['https://api.example.test/api/multipass/console/restap-network/1/policy', 'PUT'],
    ['https://api.example.test/api/multipass/console/restap-network/1/intents', 'POST'],
    ['https://api.example.test/api/multipass/console/restap-network/1/intents', 'GET'],
    ['https://api.example.test/api/multipass/console/restap-network/1/intents/intent-client-00000000000000000001', 'DELETE'],
    ['https://api.example.test/api/multipass/console/restap-network/1/stop', 'POST'],
  ]);
  assert.equal(f.calls.every(({ init }) => init.credentials === 'include'), true);
  assert.equal(f.calls.filter(({ init }) => init.method !== 'GET').every(({ init }) => init.headers['x-csrf-token'] === 'csrf'), true);
  assert.deepEqual(JSON.parse(f.calls[4].init.body), { expected_policy_version: 3 });
  assert.deepEqual(JSON.parse(f.calls[5].init.body), { expected_policy_version: 3 });
});

test('client rejects authority fields arbitrary cron topics and maxima overrides before fetch', async () => {
  const f = fixture();
  for (const [method, input] of [
    ['getPolicy', { tokenId: '1', grant: 'x' }],
    ['putPolicy', { tokenId: '1', csrfToken: 'x', policy: { ...policy(), signature: 'x' } }],
    ['createIntent', { tokenId: '1', csrfToken: 'x', intent: { ...intent(), cron: '* * * * *' } }],
    ['createIntent', { tokenId: '1', csrfToken: 'x', intent: { ...intent(), topic: 'free-form' } }],
    ['createIntent', { tokenId: '1', csrfToken: 'x', intent: { ...intent(), max_cost: 999 } }],
  ]) assert.throws(() => f.api[method](input), /unknown|invalid/i);
  assert.equal(f.calls.length, 0);
});

test('policy caps are lower-only and canonical aliases fail closed', () => {
  const f = fixture();
  assert.throws(() => f.api.putPolicy({ tokenId: '1', csrfToken: 'x', policy: { ...policy(), daily_generated_message_limit: 31 } }), /bounds/i);
  assert.throws(() => f.api.getPolicy({ tokenId: '01' }), /canonical/i);
  assert.throws(() => f.api.createIntent({ tokenId: '1', csrfToken: 'x', intent: { ...intent(), cadence: 'weekly' } }), /invalid/i);
});

test('errors expose only bounded status and code projections', async () => {
  const f = fixture({ status: 409, response: { error: { code: 'version_conflict', message: 'PRIVATE DATABASE TEXT', grant: 'PRIVATE' } } });
  await assert.rejects(() => f.api.stop({ tokenId: '1', expectedPolicyVersion: 3, csrfToken: 'x' }), (error) => {
    assert.equal(error instanceof ConsoleRestapNetworkApiError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'version_conflict');
    assert.equal(error.message.includes('PRIVATE'), false);
    assert.equal(Object.hasOwn(error, 'grant'), false);
    return true;
  });
});

test('all responses require the exact schema version fields and selected token binding', async () => {
  const cases = [
    ['getPolicy', { tokenId: '1' }, { ...policyResponse(), schema_version: '0.2.0' }],
    ['putPolicy', { tokenId: '1', csrfToken: 'csrf', policy: policy() }, { ...policyResponse(), private_key: 'PRIVATE' }],
    ['stop', { tokenId: '1', csrfToken: 'csrf', expectedPolicyVersion: 3 }, { ...policyResponse(), policy: { ...policyResponse().policy, grant: 'PRIVATE' } }],
    ['listIntents', { tokenId: '1' }, { schema_version: '0.1.0', token_id: '2', intents: [projectedIntent()] }],
    ['createIntent', { tokenId: '1', csrfToken: 'csrf', intent: intent() }, { schema_version: '0.1.0', token_id: '1', intent: { ...projectedIntent(), operation_id: 'PRIVATE' } }],
    ['deleteIntent', { tokenId: '1', csrfToken: 'csrf', intentId: 'intent-client-00000000000000000001', expectedPolicyVersion: 3 }, { schema_version: '0.1.0', token_id: '1', intent: { ...projectedIntent(), attempt_limit: 0 } }],
  ];
  for (const [method, input, response] of cases) {
    const f = fixture({ response });
    await assert.rejects(() => f.api[method](input), (error) => error instanceof ConsoleRestapNetworkApiError && error.code === 'invalid_response');
  }
});

test('transport exceptions are projected without retaining private messages or fields', async () => {
  const transportError = Object.assign(new Error('PRIVATE upstream hostname and wallet'), { wallet: 'PRIVATE', response: { grant: 'PRIVATE' } });
  const api = createConsoleRestapNetworkApi({ fetchImpl: async () => { throw transportError; } });
  await assert.rejects(() => api.getPolicy({ tokenId: '1' }), (error) => {
    assert.equal(error instanceof ConsoleRestapNetworkApiError, true);
    assert.equal(error.status, 0);
    assert.equal(error.code, 'restap_network_unavailable');
    assert.equal(error.message.includes('PRIVATE'), false);
    assert.equal(Object.hasOwn(error, 'wallet'), false);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
});

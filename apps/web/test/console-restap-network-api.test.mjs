import assert from 'node:assert/strict';
import test from 'node:test';

import { ConsoleRestapNetworkApiError, createConsoleRestapNetworkApi } from '../src/console-restap-network-api.js';

function policy() { return { expected_policy_version: 3, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['2'], block_peer_token_ids: [], mute_until: null }; }
function intent() { return { peer_token_ids: ['2'], topic: 'general', cadence: 'once', run_at: '2026-10-03T00:00:00.000Z', idempotency_key: 'intent-client-00000000000000000001' }; }

function fixture({ status = 200, response = { ok: true } } = {}) {
  const calls = [];
  const api = createConsoleRestapNetworkApi({ apiBase: 'https://api.example.test/', fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } }); } });
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

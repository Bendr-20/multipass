import assert from 'node:assert/strict';
import test from 'node:test';

import { ConsoleRestapNetworkApiError, createConsoleRestapNetworkApi } from '../src/console-restap-network-api.js';

function policy() { return { expected_policy_version: 3, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['3802'], block_peer_token_ids: [], mute_until: null }; }
function policyResponse(tokenId = '617') { return { schema_version: '0.1.0', token_id: tokenId, policy: { policy_version: 3, custody_generation: 7, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['3802'], block_peer_token_ids: [], mute_until: null }, lease_status: 'inactive', eligibility_status: 'eligible', quota_usage: { initiated: 1, generated: 2, cost_units: 3 }, transcripts: { available: false, reason: 'pilot_memory_only' } }; }
function talkResponse(patch = {}) { return { schema_version: '0.1.0', operation_id: 'vs_' + 'a'.repeat(48), status: 'committed', sender_token_id: '617', recipient_token_id: '3802', topic: 'general', opening_sha256: 'a'.repeat(64), reply_sha256: 'b'.repeat(64), usage: { sender: { input_tokens: 5, output_tokens: 3, total_tokens: 8 }, recipient: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } }, replayed: false, reply: 'One bounded reply.', ...patch }; }
function fixture({ status = 200, response } = {}) { const calls = []; const api = createConsoleRestapNetworkApi({ apiBase: 'https://api.example.test/', fetchImpl: async (url, init) => { calls.push({ url, init }); const payload = typeof response === 'function' ? response(url, init) : response ?? (url.endsWith('/talk') ? talkResponse() : policyResponse()); return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); } }); return { api, calls }; }

test('client exposes policy, synchronous talk, and stop only through exact credentialed routes', async () => {
  const f = fixture();
  await f.api.getPolicy({ tokenId: '617' });
  await f.api.putPolicy({ tokenId: '617', csrfToken: 'csrf', policy: policy() });
  const sent = await f.api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0001' });
  await f.api.stop({ tokenId: '617', expectedPolicyVersion: 3, csrfToken: 'csrf' });
  assert.equal(sent.reply, 'One bounded reply.');
  assert.deepEqual(f.calls.map(({ url, init }) => [url, init.method]), [
    ['https://api.example.test/api/multipass/console/restap-network/617/policy', 'GET'],
    ['https://api.example.test/api/multipass/console/restap-network/617/policy', 'PUT'],
    ['https://api.example.test/api/multipass/console/restap-network/617/talk', 'POST'],
    ['https://api.example.test/api/multipass/console/restap-network/617/stop', 'POST'],
  ]);
  assert.equal(f.calls.every(({ init }) => init.credentials === 'include'), true);
  assert.deepEqual(JSON.parse(f.calls[2].init.body), { recipient_token_id: '3802', topic: 'general', idempotency_key: 'console-send-0001' });
});

test('talk accepts a terminal cancelled 409 projection but not an error envelope', async () => {
  let f = fixture({ status: 409, response: talkResponse({ status: 'cancelled_charged', reason: 'authority_revoked', reply: undefined }) });
  const cancelled = await f.api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0002' });
  assert.equal(cancelled.status, 'cancelled_charged');
  f = fixture({ status: 409, response: { error: { code: 'idempotency_conflict' } } });
  await assert.rejects(() => f.api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0002' }), (error) => error instanceof ConsoleRestapNetworkApiError && error.code === 'idempotency_conflict');
});

test('talk is exact, bounded, peer-separated, and closed-topic before fetch', () => {
  const f = fixture();
  for (const input of [
    { tokenId: '617', csrfToken: 'x', recipientTokenId: '617', topic: 'general', idempotencyKey: 'console-send-0003' },
    { tokenId: '617', csrfToken: 'x', recipientTokenId: '3802', topic: 'free-form', idempotencyKey: 'console-send-0003' },
    { tokenId: '617', csrfToken: 'x', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'short' },
    { tokenId: '617', csrfToken: 'x', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0003', message: 'forbidden' },
  ]) assert.throws(() => f.api.sendTalk(input), /invalid|differ|unknown/i);
  assert.equal(f.calls.length, 0);
});

test('replay metadata cannot smuggle or invent a plaintext reply', async () => {
  const invalid = [
    talkResponse({ replayed: true }),
    talkResponse({ status: 'charged_unknown' }),
    talkResponse({ reply: 'x'.repeat(4097) }),
    { ...talkResponse(), private_session: 'forbidden' },
  ];
  for (const response of invalid) {
    const f = fixture({ response });
    await assert.rejects(() => f.api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0004' }), (error) => error.code === 'invalid_response');
  }
  const replay = fixture({ response: talkResponse({ replayed: true, reply: undefined }) });
  assert.equal(Object.hasOwn(await replay.api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0004' }), 'reply'), false);
});

test('default path uses the deployed Multipass prefix and transport errors stay redacted', async () => {
  const calls = [];
  const api = createConsoleRestapNetworkApi({ fetchImpl: async (url, init) => { calls.push({ url, init }); if (calls.length === 1) return new Response(JSON.stringify(policyResponse('617')), { status: 200 }); throw Object.assign(new Error('PRIVATE wallet'), { wallet: 'PRIVATE' }); } });
  await api.getPolicy({ tokenId: '617' });
  assert.equal(calls[0].url, '/multipass-api/api/multipass/console/restap-network/617/policy');
  await assert.rejects(() => api.sendTalk({ tokenId: '617', csrfToken: 'csrf', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'console-send-0005' }), (error) => error.status === 0 && !error.message.includes('PRIVATE') && !Object.hasOwn(error, 'wallet'));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { LOOPERS_MAINNET_CONTRACT } from '../src/loopers-owned-agents.js';

const BASE = 'https://multipass.example.test';
const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const COOKIE = 'multipass_console=session-valid';
const CSRF = 'csrf-valid';
const INTENT_ID = 'intent-console-000000000000000000001';

function policy(version = 3) {
  return {
    policyVersion: version, custodyGeneration: 7, networkEnabled: true, inboundEnabled: true,
    autonomousEnabled: true, initiatedDailyLimit: 5, generatedDailyLimit: 10, peerDailyLimit: 2,
    topics: ['general'], allowTokenIds: ['2'], blockTokenIds: [], muteUntil: null,
  };
}
function intent(status = 'pending') {
  return { intentId: INTENT_ID, source: 'one_shot', topic: 'general', status, earliestAt: Date.UTC(2026, 9, 3), expiresAt: Date.UTC(2026, 9, 4), attemptCount: 0, attemptLimit: 3, nextEligibleAt: Date.UTC(2026, 9, 3) };
}
function policyBody(patch = {}) {
  return { expected_policy_version: 3, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: true, daily_initiated_conversation_limit: 5, daily_generated_message_limit: 10, per_peer_daily_limit: 2, topics: ['general'], allow_peer_token_ids: ['2'], block_peer_token_ids: [], mute_until: null, ...patch };
}
function intentBody(patch = {}) {
  return { peer_token_ids: ['2'], topic: 'general', cadence: 'once', run_at: '2026-10-03T00:00:00.000Z', idempotency_key: 'console-idempotency-000000000000001', ...patch };
}

function fixture({ gates = { policy: true, initiation: true }, sessionState = 'valid' } = {}) {
  const calls = [];
  let owner = WALLET;
  let conflict = false;
  const service = {
    status: { enabled: true, gates },
    async getPolicy(input) { calls.push(['getPolicy', input]); return { policy: policy(), leaseStatus: 'active', eligibilityStatus: 'eligible', quotaUsage: { initiated: 1, generated: 2, costUnits: 3 }, wallet: 'PRIVATE', leaseId: 'PRIVATE' }; },
    async putPolicy(input) { calls.push(['putPolicy', input]); if (conflict) throw new Error('policy version conflict'); return { policy: policy(4), leaseStatus: 'active', eligibilityStatus: 'eligible', quotaUsage: {} }; },
    async createIntent(input) { calls.push(['createIntent', input]); return { ...intent(), operationId: 'PRIVATE', message: 'PRIVATE' }; },
    async listIntents(input) { calls.push(['listIntents', input]); return [{ ...intent(), grant: 'PRIVATE', wallet: 'PRIVATE' }]; },
    async deleteIntent(input) { calls.push(['deleteIntent', input]); return intent('cancelled'); },
    async stop(input) { calls.push(['stop', input]); return { policy: { ...policy(4), networkEnabled: false, inboundEnabled: false, autonomousEnabled: false, initiatedDailyLimit: 0, generatedDailyLimit: 0, peerDailyLimit: 0, topics: [], allowTokenIds: [], blockTokenIds: [] }, leaseStatus: 'inactive', eligibilityStatus: 'unavailable', quotaUsage: {} }; },
  };
  const consoleAuthStore = {
    validateSession({ sessionId, csrfToken, requireCsrf }) {
      if (sessionState === 'expired') throw new Error('Session expired.');
      if (sessionId !== 'session-valid') throw new Error('Invalid session.');
      if (requireCsrf && csrfToken !== CSRF) throw new Error('Invalid CSRF token.');
      return { wallet: WALLET };
    },
  };
  const api = createMultipassApi({
    store: createMemoryStore(), baseUrl: BASE, allowedOrigins: [BASE], consoleAuthStore,
    loopersOwnedAgentLoader: async () => [],
    loopersAuthorizer: async ({ tokenId, wallet }) => ({ chainId: 8453, contract: LOOPERS_MAINNET_CONTRACT, tokenId, owner, controller: wallet, controllerVerified: true, erc8004AgentId: tokenId }),
    restapNetworkService: service,
  });
  return { api, service, calls, setOwner: (value) => { owner = value; }, setConflict: (value) => { conflict = value; } };
}

async function request(api, path, { method = 'GET', body, origin = BASE, cookie = COOKIE, csrf = CSRF, bytes } = {}) {
  const headers = {};
  if (origin !== null) headers.origin = origin;
  if (cookie !== null) headers.cookie = cookie;
  if (csrf !== null) headers['x-csrf-token'] = csrf;
  if (body !== undefined || bytes !== undefined) headers['content-type'] = 'application/json';
  const response = await api.handleRequest(new Request(BASE + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), ...(bytes !== undefined ? { body: bytes } : {}) }));
  return { response, body: await response.json() };
}

test('all six owner routes use exact schemas and return redacted bounded projections', async () => {
  const f = fixture();
  const policyRead = await request(f.api, '/api/multipass/console/restap-network/1/policy');
  assert.equal(policyRead.response.status, 200);
  assert.deepEqual(policyRead.body.transcripts, { available: false, reason: 'pilot_memory_only' });

  const policyWrite = await request(f.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', body: policyBody() });
  assert.equal(policyWrite.response.status, 200);
  assert.equal(policyWrite.body.policy.policy_version, 4);

  const created = await request(f.api, '/api/multipass/console/restap-network/1/intents', { method: 'POST', body: intentBody() });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.intent.intent_id, INTENT_ID);

  const listed = await request(f.api, '/api/multipass/console/restap-network/1/intents');
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.intents.length, 1);

  const deleted = await request(f.api, '/api/multipass/console/restap-network/1/intents/' + INTENT_ID, { method: 'DELETE', body: { expected_policy_version: 3 } });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.intent.status, 'cancelled');

  const stopped = await request(f.api, '/api/multipass/console/restap-network/1/stop', { method: 'POST', body: { expected_policy_version: 3 } });
  assert.equal(stopped.response.status, 200);
  assert.equal(stopped.body.policy.network_enabled, false);

  const serialized = JSON.stringify([policyRead.body, policyWrite.body, created.body, listed.body, deleted.body, stopped.body]);
  assert.doesNotMatch(serialized, /PRIVATE|"wallet"|"grant"|"lease_id"|"operation_id"|"message":/i);
  assert.deepEqual(f.calls.map(([name]) => name), ['getPolicy', 'putPolicy', 'createIntent', 'listIntents', 'deleteIntent', 'stop']);
  for (const [, call] of f.calls) assert.equal(Object.hasOwn(call, 'wallet'), false);
});

test('routes enforce session, CSRF, Origin, fresh owner, and cross-token authorization', async () => {
  const missing = fixture();
  assert.equal((await request(missing.api, '/api/multipass/console/restap-network/1/policy', { cookie: null })).response.status, 401);
  assert.equal((await request(missing.api, '/api/multipass/console/restap-network/1/policy', { origin: null })).response.status, 200);
  assert.equal((await request(missing.api, '/api/multipass/console/restap-network/1/policy', { origin: 'https://evil.test' })).response.status, 403);
  assert.equal((await request(missing.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', body: policyBody(), csrf: 'bad' })).response.status, 403);
  assert.equal((await request(fixture({ sessionState: 'expired' }).api, '/api/multipass/console/restap-network/1/policy')).response.status, 403);

  const transferred = fixture();
  transferred.setOwner(OTHER);
  assert.equal((await request(transferred.api, '/api/multipass/console/restap-network/1/policy')).response.status, 403);
  assert.equal((await request(transferred.api, '/api/multipass/console/restap-network/2/policy')).response.status, 403);
});

test('canonical token, exact fields, stale versions, UTF-8, and body cap fail closed', async () => {
  const f = fixture();
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/01/policy')).response.status, 400);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', body: { ...policyBody(), callback: 'https://private.test' } })).response.status, 400);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/intents', { method: 'POST', body: { ...intentBody(), cron: '* * * * *' } })).response.status, 400);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/intents/' + INTENT_ID, { method: 'DELETE', body: { expected_policy_version: 3, operation_id: 'private' } })).response.status, 400);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/stop', { method: 'POST', body: { expected_policy_version: 3, reason: 'x' } })).response.status, 400);
  f.setConflict(true);
  const conflict = await request(f.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', body: policyBody() });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, 'version_conflict');
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', bytes: Uint8Array.from([0xff]) })).response.status, 400);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/1/policy', { method: 'PUT', bytes: new TextEncoder().encode(JSON.stringify({ value: 'x'.repeat(17_000) })) })).response.status, 413);
});

test('disabled gates return ordinary 404 without touching owner or service methods', async () => {
  const f = fixture({ gates: { policy: false, initiation: false } });
  const result = await request(f.api, '/api/multipass/console/restap-network/1/policy', { cookie: null, origin: null });
  assert.equal(result.response.status, 404);
  assert.equal((await request(f.api, '/api/multipass/console/restap-network/not-a-token/policy', { cookie: null, origin: null })).response.status, 404);
  assert.equal(f.calls.length, 0);
});

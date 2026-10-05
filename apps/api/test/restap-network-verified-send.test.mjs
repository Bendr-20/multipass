import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { LOOPERS_MAINNET_CONTRACT } from '../src/loopers-owned-agents.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapVerifiedSendService, createSameProcessRestapTalkTransport } from '../src/restap-network/verified-send.js';

const BASE = 'https://multipass.example.test';
const COLLECTION = LOOPERS_MAINNET_CONTRACT;
const OWNER = '0x1111111111111111111111111111111111111111';
const ACCOUNT_1 = '0x2222222222222222222222222222222222222222';
const ACCOUNT_2 = '0x3333333333333333333333333333333333333333';
const COOKIE = 'multipass_console=session-valid';
const CSRF = 'csrf-valid';
const NOW = Date.UTC(2026, 9, 4, 12);

function snapshot(tokenId, account) {
  return Object.freeze({
    chainId: 8453,
    collection: COLLECTION,
    tokenId,
    generation: 1,
    canonicalAccount: account,
    owner: OWNER,
    controller: OWNER,
    safeBlockNumber: 100,
    safeBlockHash: '0x' + 'a'.repeat(64),
    status: 'ready',
  });
}

function policy(tokenId, patch = {}) {
  const peer = tokenId === '1' ? '2' : '1';
  return Object.freeze({
    policyVersion: 1,
    custodyGeneration: 1,
    networkEnabled: true,
    inboundEnabled: true,
    autonomousEnabled: false,
    initiatedDailyLimit: 5,
    generatedDailyLimit: 10,
    peerDailyLimit: 3,
    topics: Object.freeze(['general']),
    allowTokenIds: Object.freeze([peer]),
    blockTokenIds: Object.freeze([]),
    muteUntil: null,
    transcriptCapability: 'unavailable',
    ...patch,
  });
}

async function fixture({ openingError = null, talkError = null } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-verified-send-'));
  const store = createRestapNetworkDatabase({ filename: join(directory, 'network.sqlite') });
  const snapshots = new Map([
    ['1', snapshot('1', ACCOUNT_1)],
    ['2', snapshot('2', ACCOUNT_2)],
  ]);
  store.transaction('seed_verified_send', (tx) => {
    for (const value of snapshots.values()) tx.run(
      'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [value.chainId, value.collection, value.tokenId, value.generation, value.canonicalAccount, value.owner, value.controller, value.safeBlockNumber, value.safeBlockHash.slice(2), 99, 0, value.status, NOW],
    );
  });
  const policies = new Map([['1', policy('1')], ['2', policy('2')]]);
  const calls = { reconcile: [], policy: [], codex: [], opening: [], talk: [] };
  const custodyReconciler = {
    async reconcileToken({ tokenId }) {
      calls.reconcile.push(tokenId);
      const value = snapshots.get(tokenId);
      return value ? { eligible: true, status: 'ready', generation: value.generation } : { eligible: false, status: 'provider_unavailable', generation: null };
    },
    getEpochSnapshot({ tokenId }) { return snapshots.get(tokenId) ?? null; },
  };
  const policyReader = {
    get({ custody }) { calls.policy.push(custody.tokenId); return policies.get(custody.tokenId); },
  };
  const codexRuntime = {
    available: true,
    getProfileContext(tokenId) { calls.codex.push(String(tokenId)); return { identity: { tokenId: String(tokenId), canonicalName: 'Looper #' + tokenId }, public: true }; },
  };
  const openingRuntime = {
    async generate(input) {
      calls.opening.push(input);
      if (openingError) throw openingError;
      return { message: 'Hello from Looper #1 about general.', usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } };
    },
  };
  const recipientTransport = {
    async talk(input) {
      calls.talk.push(input);
      if (talkError) throw talkError;
      return { reply: 'Hello back from Looper #2.', session_id: 'session-public-1', usage: { input_tokens: 13, output_tokens: 5, total_tokens: 18 } };
    },
  };
  const service = createRestapVerifiedSendService({
    store, custodyReconciler, policyReader, codexRuntime, openingRuntime, recipientTransport,
    now: () => NOW,
    emergencyStop: () => false,
  });
  return {
    directory, store, snapshots, policies, calls, custodyReconciler, service,
    input: { senderTokenId: '1', recipientTokenId: '2', topic: 'general', idempotencyKey: 'send-once-0001', owner: OWNER },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

test('verified send succeeds with one provider request per side and persists metadata/hashes only', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const result = await f.service.send(f.input);
  assert.equal(result.status, 'committed');
  assert.equal(result.reply, 'Hello back from Looper #2.');
  assert.deepEqual(f.calls.reconcile.sort(), ['1', '2']);
  assert.equal(f.calls.opening.length, 1);
  assert.equal(f.calls.talk.length, 1);
  assert.deepEqual(f.calls.codex.sort(), ['1', '2']);
  const row = f.store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [result.operationId]);
  assert.equal(row.status, 'committed');
  assert.match(row.opening_digest, /^[0-9a-f]{64}$/u);
  assert.match(row.reply_digest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(row), /Hello from|Hello back|session-public/iu);
  const columns = f.store.readAll('PRAGMA table_info(restap_network_verified_sends)').map((item) => item.name);
  assert.equal(columns.some((name) => /message|reply_text|prompt|transcript|body_json/iu.test(name)), false);
});

test('custody reconciliation is serialized across sender and recipient', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  let active = 0;
  let maxActive = 0;
  const order = [];
  const custodyReconciler = {
    async reconcileToken({ tokenId }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push('start:' + tokenId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('end:' + tokenId);
      active -= 1;
      return { eligible: true, status: 'ready', generation: 1 };
    },
    getEpochSnapshot({ tokenId }) { return f.snapshots.get(tokenId); },
  };
  const service = createRestapVerifiedSendService({
    store: f.store,
    custodyReconciler,
    policyReader: { get({ custody }) { return f.policies.get(custody.tokenId); } },
    codexRuntime: { available: true, getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId) } }; } },
    openingRuntime: { async generate() { return { message: 'serialized opening', usage: null }; } },
    recipientTransport: { async talk() { return { reply: 'serialized reply', usage: null }; } },
    now: () => NOW,
  });
  const result = await service.send({ ...f.input, idempotencyKey: 'send-serial-0001' });
  assert.equal(result.status, 'committed');
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['start:1', 'end:1', 'start:2', 'end:2']);
});

test('mutual policy, explicit peer allowlists, and custody are fail-closed before dispatch', async (t) => {
  const denied = await fixture(); t.after(() => denied.close());
  denied.policies.set('2', policy('2', { inboundEnabled: false }));
  await assert.rejects(() => denied.service.send(denied.input), (error) => error.code === 'mutual_policy_denied');
  assert.equal(denied.calls.opening.length, 0);
  assert.equal(denied.calls.talk.length, 0);
  assert.equal(denied.store.readOne('SELECT count(*) AS count FROM restap_network_verified_sends').count, 0);

  const custody = await fixture(); t.after(() => custody.close());
  custody.snapshots.delete('2');
  await assert.rejects(() => custody.service.send(custody.input), (error) => error.code === 'custody_unavailable');
  assert.equal(custody.calls.opening.length, 0);
  assert.equal(custody.calls.talk.length, 0);
});

test('idempotent replay is side-effect free and body-changing key reuse conflicts', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const first = await f.service.send(f.input);
  const replay = await f.service.send(f.input);
  assert.equal(replay.operationId, first.operationId);
  assert.equal(replay.status, 'committed');
  assert.equal(replay.replayed, true);
  assert.equal(Object.hasOwn(replay, 'reply'), false);
  assert.equal(f.calls.opening.length, 1);
  assert.equal(f.calls.talk.length, 1);
  await assert.rejects(
    () => f.service.send({ ...f.input, topic: 'project-updates' }),
    (error) => error.code === 'idempotency_conflict',
  );
  assert.equal(f.calls.opening.length, 1);
  assert.equal(f.calls.talk.length, 1);
});

test('a durable reserved row is resumed exactly once instead of remaining stuck', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const originalTransaction = f.store.transaction;
  let interrupted = true;
  const store = Object.freeze({
    ...f.store,
    transaction(label, work) {
      const result = originalTransaction(label, work);
      if (label === 'verified_send_reserve' && interrupted) {
        interrupted = false;
        throw new Error('simulated process interruption after durable reservation');
      }
      return result;
    },
  });
  const service = createRestapVerifiedSendService({
    store,
    custodyReconciler: f.custodyReconciler,
    policyReader: { get({ custody }) { return f.policies.get(custody.tokenId); } },
    codexRuntime: { available: true, getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId) } }; } },
    openingRuntime: { async generate() { f.calls.opening.push(true); return { message: 'resumed opening', usage: null }; } },
    recipientTransport: { async talk() { f.calls.talk.push(true); return { reply: 'resumed reply', usage: null }; } },
    now: () => NOW,
  });
  await assert.rejects(() => service.send({ ...f.input, idempotencyKey: 'send-resume-0001' }), /simulated process interruption/u);
  const result = await service.send({ ...f.input, idempotencyKey: 'send-resume-0001' });
  assert.equal(result.status, 'committed');
  assert.equal(f.calls.opening.length, 1);
  assert.equal(f.calls.talk.length, 1);
});

test('final custody/policy generation revocation cancels charged work without committing plaintext', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const originalTalk = f.calls.talk;
  const service = createRestapVerifiedSendService({
    store: f.store,
    custodyReconciler: f.custodyReconciler,
    policyReader: { get({ custody }) { return f.policies.get(custody.tokenId); } },
    codexRuntime: { available: true, getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId) } }; } },
    openingRuntime: { async generate() { return { message: 'revocable opening', usage: null }; } },
    recipientTransport: { async talk(input) { originalTalk.push(input); f.policies.set('2', policy('2', { policyVersion: 2, inboundEnabled: false })); return { reply: 'must not commit', session_id: 'private', usage: null }; } },
    now: () => NOW,
    emergencyStop: () => false,
  });
  const result = await service.send({ ...f.input, idempotencyKey: 'send-revoked-0001' });
  assert.equal(result.status, 'cancelled_charged');
  assert.equal(result.reason, 'authority_revoked');
  assert.equal(Object.hasOwn(result, 'reply'), false);
  const row = f.store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [result.operationId]);
  assert.equal(row.status, 'cancelled_charged');
  assert.doesNotMatch(JSON.stringify(row), /revocable opening|must not commit|private/iu);
});

test('ambiguous provider outcome becomes charged_unknown and is never retried', async (t) => {
  const f = await fixture({ openingError: new Error('timeout after dispatch') }); t.after(() => f.close());
  const first = await f.service.send({ ...f.input, idempotencyKey: 'send-unknown-0001' });
  assert.equal(first.status, 'charged_unknown');
  assert.equal(first.reason, 'sender_provider_ambiguous');
  assert.equal(f.calls.opening.length, 1);
  assert.equal(f.calls.talk.length, 0);
  const replay = await f.service.send({ ...f.input, idempotencyKey: 'send-unknown-0001' });
  assert.equal(replay.status, 'charged_unknown');
  assert.equal(replay.replayed, true);
  assert.equal(f.calls.opening.length, 1);
});

test('owner talk route uses Console auth/CSRF, exact input, and never calls legacy worker/grant/lease path', async () => {
  const calls = [];
  const legacy = {
    status: { enabled: true, gates: { policy: true, initiation: true } },
    async getPolicy() { throw new Error('legacy policy called'); },
    async createIntent() { throw new Error('legacy intent called'); },
  };
  const verified = {
    async send(input) { calls.push(input); return { schemaVersion: '0.1.0', operationId: 'op-' + 'a'.repeat(29), status: 'committed', senderTokenId: '1', recipientTokenId: '2', topic: 'general', openingDigest: 'a'.repeat(64), replyDigest: 'b'.repeat(64), usage: { sender: null, recipient: null }, replayed: false, reply: 'bounded reply' }; },
  };
  const api = createMultipassApi({
    store: createMemoryStore(), baseUrl: BASE, allowedOrigins: [BASE],
    consoleAuthStore: { validateSession({ sessionId, csrfToken, requireCsrf }) { assert.equal(sessionId, 'session-valid'); if (requireCsrf && csrfToken !== CSRF) throw new Error('bad csrf'); return { wallet: OWNER }; } },
    loopersOwnedAgentLoader: async () => [],
    loopersAuthorizer: async ({ tokenId, wallet }) => ({ chainId: 8453, contract: COLLECTION, tokenId, owner: wallet, controller: wallet, controllerVerified: true, erc8004AgentId: tokenId }),
    restapNetworkService: legacy,
    restapVerifiedSendService: verified,
  });
  const request = async (body, csrf = CSRF) => {
    const response = await api.handleRequest(new Request(BASE + '/api/multipass/console/restap-network/1/talk', { method: 'POST', headers: { origin: BASE, cookie: COOKIE, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { response, body: await response.json() };
  };
  const success = await request({ recipient_token_id: '2', topic: 'general', idempotency_key: 'route-send-0001' });
  assert.equal(success.response.status, 200);
  assert.equal(success.body.reply, 'bounded reply');
  assert.deepEqual(calls, [{ senderTokenId: '1', recipientTokenId: '2', topic: 'general', idempotencyKey: 'route-send-0001', owner: OWNER }]);
  assert.equal((await request({ recipient_token_id: '2', topic: 'general', idempotency_key: 'route-send-0002' }, 'bad')).response.status, 403);
  assert.equal((await request({ recipient_token_id: '2', topic: 'general', idempotency_key: 'route-send-0003', message: 'forbidden' })).response.status, 400);
  assert.equal(calls.length, 1);
});

test('verified-send core imports no legacy worker, grant, lease, intent, conversation, relay, or coordinator modules', async () => {
  const source = await readFile(new URL('../src/restap-network/verified-send.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(?:activation-leases|worker|grants|intents|conversations|relay|coordinator)\.js['"]/u);
});

test('same-process transport invokes the recipient generic talk runtime directly once', async () => {
  const calls = [];
  const runtime = { async talk(input) { calls.push(input); return { reply: 'direct reply' }; } };
  const transport = createSameProcessRestapTalkTransport({
    resolveRuntime: async ({ tokenId }) => { assert.equal(tokenId, '2'); return runtime; },
    resolvePublicProjection: async ({ tokenId }) => ({ tokenId, public: true }),
  });
  const result = await transport.talk({ recipientTokenId: '2', message: 'direct opening' });
  assert.deepEqual(result, { reply: 'direct reply' });
  assert.deepEqual(calls, [{ message: 'direct opening', publicProjection: { tokenId: '2', public: true }, stateless: true }]);
});

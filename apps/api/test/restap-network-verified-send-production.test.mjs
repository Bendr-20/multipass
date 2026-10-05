import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createMultipassApi } from '../src/index.js';
import { createRestapPublicTalkRuntime } from '../src/restap-public-talk.js';
import { parseServerOptions, startServer } from '../src/server.js';
import { createRestapNetworkVerifiedOpeningRuntime } from '../src/restap-network/bankr-provider.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkPolicyStore } from '../src/restap-network/policy-store.js';
import { parseRestapNetworkProductionConfig } from '../src/restap-network/production.js';
import { composeRestapVerifiedSendProduction } from '../src/restap-network/verified-send-production.js';
import { rehearseRestapVerifiedSend } from '../src/restap-network/verified-send-rehearsal.js';

const NOW = Date.UTC(2026, 9, 5, 1);
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x1111111111111111111111111111111111111111';
const ACCOUNTS = Object.freeze({ '617': '0x2222222222222222222222222222222222222222', '3802': '0x3333333333333333333333333333333333333333' });
const OPENING = 'PHASE_B_OPENING_SENTINEL_7f3719';
const REPLY = 'PHASE_B_REPLY_SENTINEL_891da2';

function seed(store) {
  store.transaction('phase_b_seed', (tx) => {
    for (const tokenId of ['617', '3802']) {
      const peer = tokenId === '617' ? '3802' : '617';
      tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, COLLECTION, tokenId, 1, ACCOUNTS[tokenId], OWNER, OWNER, 100, 'a'.repeat(64), 99, 0, 'ready', NOW]);
      tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 0, 5, 10, 3, 32, NULL, ?, ?)', [8453, COLLECTION, tokenId, 1, 1, NOW, NOW]);
      tx.run("INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, 'allow')", [8453, COLLECTION, tokenId, 1, 1, peer]);
    }
  });
}

function snapshots() {
  return new Map(['617', '3802'].map((tokenId) => [tokenId, Object.freeze({ chainId: 8453, collection: COLLECTION, tokenId, generation: 1, canonicalAccount: ACCOUNTS[tokenId], owner: OWNER, controller: OWNER, safeBlockNumber: 100, safeBlockHash: '0x' + 'a'.repeat(64), status: 'ready' })]));
}

function response(content, usage = { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }) {
  return { ok: true, headers: { get(name) { return name.toLowerCase() === 'x-privacy-tier' ? 'zdr' : null; } }, async json() { return { choices: [{ message: { content } }], usage }; } };
}

function publicProjection() {
  return Object.freeze({
    canonicalIdentity: Object.freeze({ canonicalName: 'Looper #3802', imageUrl: 'https://example.test/3802.png' }),
    ownerPublicProfile: Object.freeze({ displayName: 'Looper #3802', publicConversationEnabled: true, biography: 'Public biography.', mission: 'Public mission.', voicePresentation: 'Concise.' }),
  });
}

function makeComposition({ store, emergencyStop = false, openingFetch, recipientFetch, sessionCalls = [] }) {
  const values = snapshots();
  const custodyReconciler = Object.freeze({
    async reconcileToken({ tokenId }) { return values.has(tokenId) ? { eligible: true, status: 'ready', generation: 1 } : { eligible: false, status: 'missing' }; },
    getEpochSnapshot({ tokenId }) { return values.get(tokenId) ?? null; },
  });
  const policyReader = createRestapNetworkPolicyStore({ store, now: () => NOW, tokenScopeDigest: () => '0'.repeat(64) });
  const codexRuntime = Object.freeze({ available: true, status: Object.freeze({ available: true, artifactHash: 'b'.repeat(64), count: 7777 }), getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId), canonicalName: 'Looper #' + tokenId } }; }, query() { return []; } });
  const openingRuntime = createRestapNetworkVerifiedOpeningRuntime({ apiKey: 'test-key', model: 'pinned-test-model', timeoutMs: 1_000, fetchImpl: openingFetch });
  const recipientRuntime = createRestapPublicTalkRuntime({
    codexRuntime,
    sessionStore: { create() { sessionCalls.push('create'); throw new Error('session create forbidden'); }, resolve() { sessionCalls.push('resolve'); throw new Error('session resolve forbidden'); }, appendTurn() { sessionCalls.push('append'); throw new Error('session append forbidden'); } },
    inferenceClient: { async generate() { return (await recipientFetch()).json().then((body) => ({ reply: body.choices[0].message.content, usage: { input_tokens: body.usage.prompt_tokens, output_tokens: body.usage.completion_tokens, total_tokens: body.usage.total_tokens } })); } },
  });
  return composeRestapVerifiedSendProduction({
    config: Object.freeze({ enabled: true, emergencyStop, recipientTokenIds: Object.freeze(['3802']) }),
    store,
    custodyReconciler,
    policyReader,
    codexRuntime,
    openingRuntime,
    recipientRuntimes: Object.freeze({ '3802': recipientRuntime }),
    resolvePublicProjection: async ({ tokenId }) => { assert.equal(tokenId, '3802'); return publicProjection(); },
    now: () => NOW,
  });
}

async function fileContains(filename, sentinel) {
  try { return (await readFile(filename)).includes(Buffer.from(sentinel)); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

test('verified opening normalizes provider line breaks into bounded plain text', async () => {
  const runtime = createRestapNetworkVerifiedOpeningRuntime({
    apiKey: '***', model: 'pinned-test-model', timeoutMs: 1_000,
    fetchImpl: async () => response('Hello, #2431.\n\nYour signal profile looks sharp.'),
  });
  const result = await runtime.generate({
    senderTokenId: '3802', recipientTokenId: '2431', topic: 'general', maxBytes: 2_000,
    senderCodex: { identity: { tokenId: '3802' } }, recipientCodex: { identity: { tokenId: '2431' } },
  });
  assert.equal(result.message, 'Hello, #2431. Your signal profile looks sharp.');
});

test('verified-send production config is dormant and emergency-stopped by default with exact parsing', () => {
  const dormant = parseRestapNetworkProductionConfig({});
  assert.deepEqual(dormant.verifiedSend, { enabled: false, emergencyStop: true, recipientTokenIds: [] });
  const dormantComposition = composeRestapVerifiedSendProduction({ config: dormant.verifiedSend });
  assert.equal(dormantComposition.service, null);
  assert.deepEqual(dormantComposition.status, dormant.verifiedSend);
  const enabled = parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED: 'true',
    MULTIPASS_RESTAP_VERIFIED_SEND_EMERGENCY_STOP: 'false',
    MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS: '3802',
  });
  assert.deepEqual(enabled.verifiedSend, { enabled: true, emergencyStop: false, recipientTokenIds: ['3802'] });
  assert.throws(() => parseRestapNetworkProductionConfig({ MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED: 'yes' }), /exact boolean/i);
  assert.throws(() => parseRestapNetworkProductionConfig({ MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS: '3802,3802' }), /duplicate|invalid/i);
});

test('production composition fails closed for missing dependencies and default emergency stop', async (t) => {
  const config = { enabled: true, emergencyStop: true, recipientTokenIds: ['3802'] };
  const storeDependency = { transaction() {}, readOne() {} };
  const custodyDependency = { async reconcileToken() {}, getEpochSnapshot() {} };
  const policyDependency = { get() {} };
  const codexDependency = { available: true, status: { available: true, artifactHash: 'a'.repeat(64) }, getProfileContext() {} };
  const openingDependency = { async generate() {} };
  assert.throws(() => composeRestapVerifiedSendProduction({ config }), /store/i);
  assert.throws(() => composeRestapVerifiedSendProduction({ config, store: storeDependency }), /custody/i);
  assert.throws(() => composeRestapVerifiedSendProduction({ config, store: storeDependency, custodyReconciler: custodyDependency }), /policy/i);
  assert.throws(() => composeRestapVerifiedSendProduction({ config, store: storeDependency, custodyReconciler: custodyDependency, policyReader: policyDependency, codexRuntime: { available: true, getProfileContext() {} } }), /pinned Codex/i);
  assert.throws(() => composeRestapVerifiedSendProduction({ config, store: storeDependency, custodyReconciler: custodyDependency, policyReader: policyDependency, codexRuntime: codexDependency }), /opening provider/i);
  assert.throws(() => composeRestapVerifiedSendProduction({ config, store: storeDependency, custodyReconciler: custodyDependency, policyReader: policyDependency, codexRuntime: codexDependency, openingRuntime: openingDependency }), /recipient runtimes/i);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-phase-b-stop-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createRestapNetworkDatabase({ filename: path.join(directory, 'network.sqlite') });
  t.after(() => store.close());
  seed(store);
  const composition = makeComposition({ store, emergencyStop: true, openingFetch: async () => response(OPENING), recipientFetch: async () => response(REPLY) });
  await assert.rejects(() => composition.service.send({ senderTokenId: '617', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'phase-b-stopped-0001', owner: OWNER }), (error) => error.code === 'emergency_stop');
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_verified_sends').count, 0);
});

test('production root constructs and injects the emergency-stopped verified-send service while legacy traffic stays off', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-phase-b-root-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const auditKeyPath = path.join(directory, 'audit.json');
  await writeFile(auditKeyPath, JSON.stringify({ schema_version: '1', key_id: 'phase-b-audit-v1', key_base64: Buffer.alloc(32, 0x2a).toString('base64') }), { mode: 0o600 });
  await chmod(auditKeyPath, 0o600);
  const env = {
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: path.join(directory, 'network.sqlite'),
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32),
    MULTIPASS_RESTAP_NETWORK_PROVIDER_TIMEOUT_MS: '30000',
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,drpc',
    MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE: auditKeyPath,
    MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED: 'true',
    MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS: '2431,3802',
    MULTIPASS_RESTAP_3802_POLICY_PATH: '/isolated/rehearsal-policy.json',
    BANKR_LLM_KEY: 'phase-b-test-key',
  };
  const publicClient = { async getChainId() { throw new Error('not called'); }, async getBlock() { throw new Error('not called'); }, async readContract() { throw new Error('not called'); }, async getBytecode() { throw new Error('not called'); }, async getLogs() { throw new Error('not called'); } };
  const codexRuntime = Object.freeze({ available: true, status: Object.freeze({ available: true, artifactHash: 'c'.repeat(64), count: 7777 }), getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId), canonicalName: 'Looper #' + tokenId, image: { url: 'https://example.test/' + tokenId + '.png' } } }; }, query() { return []; } });
  let injected = null;
  const server = await startServer({
    ...parseServerOptions([], env),
    port: 0,
    logger: { info() {}, warn() {}, error() {} },
    looperCodexRuntime: codexRuntime,
    loopersPublicClients: [publicClient, publicClient],
    restapPolicyLoader: async () => ({}),
    restapPolicyAuthorizer: async () => publicProjection(),
    restapAuthorityResolver: async () => ({}),
    restapTalkRuntime: Object.freeze({ async talk() { throw new Error('emergency stop must prevent recipient call'); } }),
    apiFactory(input) { injected = input.restapVerifiedSendService; return createMultipassApi(input); },
  });
  t.after(() => server.close());
  assert.equal(server.restapNetwork.status.gates.foundation, true);
  assert.equal(server.restapNetwork.status.gates.policy, true);
  for (const gate of ['discovery', 'initiation', 'replies', 'transcripts', 'pilot', 'ga']) assert.equal(server.restapNetwork.status.gates[gate], false);
  assert.equal(server.restapVerifiedSend, injected);
  assert.equal(typeof injected?.send, 'function');
  await assert.rejects(() => injected.send({ senderTokenId: '617', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'phase-b-root-stop-0001', owner: OWNER }), (error) => error.code === 'emergency_stop');
});

test('production composition makes one provider call per side, stays stateless, replays after restart, and persists no plaintext', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-phase-b-live-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'network.sqlite');
  let store = createRestapNetworkDatabase({ filename });
  seed(store);
  let openingCalls = 0;
  let recipientCalls = 0;
  const sessionCalls = [];
  const openingFetch = async () => { openingCalls += 1; return response(OPENING); };
  const recipientFetch = async () => { recipientCalls += 1; return response(REPLY); };
  let composition = makeComposition({ store, openingFetch, recipientFetch, sessionCalls });
  const input = { senderTokenId: '617', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'phase-b-restart-0001', owner: OWNER };
  const first = await composition.service.send(input);
  assert.equal(first.status, 'committed');
  assert.equal(first.reply, REPLY);
  assert.equal(openingCalls, 1);
  assert.equal(recipientCalls, 1);
  assert.deepEqual(sessionCalls, []);
  store.close();

  store = createRestapNetworkDatabase({ filename });
  t.after(() => store.close());
  composition = makeComposition({ store, openingFetch, recipientFetch, sessionCalls });
  const replay = await composition.service.send(input);
  assert.equal(replay.replayed, true);
  assert.equal(Object.hasOwn(replay, 'reply'), false);
  assert.equal(openingCalls, 1);
  assert.equal(recipientCalls, 1);
  store.checkpoint();
  for (const target of [filename, filename + '-wal', filename + '-shm']) {
    assert.equal(await fileContains(target, OPENING), false, target + ' leaked opening');
    assert.equal(await fileContains(target, REPLY), false, target + ' leaked reply');
  }
});

test('isolated rehearsal uses a SQLite backup copy, makes no live traffic, and leaves source unchanged', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-phase-b-rehearsal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source.sqlite');
  const sourceStore = createRestapNetworkDatabase({ filename: source });
  seed(sourceStore);
  sourceStore.checkpoint();
  sourceStore.close();
  const before = await readFile(source);
  let liveTrafficCalls = 0;
  const proof = await rehearseRestapVerifiedSend({
    sourceDatabasePath: source,
    input: { senderTokenId: '617', recipientTokenId: '3802', topic: 'general', idempotencyKey: 'phase-b-rehearsal-0001', owner: OWNER },
    openingText: OPENING,
    replyText: REPLY,
    now: () => NOW,
    onNetworkAttempt() { liveTrafficCalls += 1; },
  });
  assert.equal(proof.status, 'committed');
  assert.equal(proof.replayStatus, 'committed');
  assert.equal(proof.replayed, true);
  assert.equal(proof.plaintextFree, true);
  assert.equal(proof.sourceUnchanged, true);
  assert.equal(liveTrafficCalls, 0);
  assert.deepEqual(await readFile(source), before);
  await assert.rejects(() => stat(proof.temporaryDirectory), /ENOENT/u);
});

test('production verified-send composition imports and calls no legacy worker, lease, grant, intent, conversation, relay, or coordinator', async () => {
  const source = await readFile(new URL('../src/restap-network/verified-send-production.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:activation-leases|worker|grants|intents|conversations|relay|coordinator).js/u);
});

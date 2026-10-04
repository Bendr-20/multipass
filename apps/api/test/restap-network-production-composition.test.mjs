import assert from 'node:assert/strict';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseServerOptions, startServer } from '../src/server.js';
import { createRestapNetworkProductionFoundation, parseRestapNetworkProductionConfig } from '../src/restap-network/production.js';
import { composeRestapNetworkProductionPolicy } from '../src/restap-network/production-composition.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkPublicKeyRegistry } from '../src/restap-network/grants.js';
import { parseRestapNetworkServiceConfig, startRestapNetworkService } from '../src/restap-network/service.js';

test('production traffic config is collection-wide owner opt-in and protected relay files stay pinned', () => {
  const parsed = parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'tenderly,blast',
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '3802,617',
    MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE: '/run/restap/audit.json',
    MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE: '/run/restap/keys.json',
    MULTIPASS_RESTAP_NETWORK_SIGNER_FILE: '/run/restap/signer.json',
    MULTIPASS_RESTAP_NETWORK_MAX_FINALIZED_HEAD_SKEW: '2',
  });
  assert.deepEqual(parsed.providerIds, ['blast', 'tenderly']);
  assert.deepEqual(parsed.tokenIds, ['617', '3802']);
  assert.equal(parsed.keyRegistryFile, '/run/restap/keys.json');
  assert.equal(parsed.signerFile, '/run/restap/signer.json');
  assert.equal(parsed.maxFinalizedHeadSkew, 2);
  const collectionWide = parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,tenderly',
  });
  assert.deepEqual(collectionWide.tokenIds, []);
  assert.deepEqual(parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '99,42',
  }).tokenIds, ['42', '99']);
  assert.throws(() => parseRestapNetworkProductionConfig({ MULTIPASS_RESTAP_NETWORK_MAX_FINALIZED_HEAD_SKEW: '3' }), /finalized.*skew|must equal 2/i);
});

test('production server composes Phase 0 RESTAP foundation from reviewed configuration without dependency injection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-composition-'));
  const databasePath = path.join(directory, 'network.sqlite');
  const auditKeyPath = path.join(directory, 'audit-key.json');
  await writeFile(auditKeyPath, JSON.stringify({
    schema_version: '1',
    key_id: 'phase0-audit-v1',
    key_base64: Buffer.alloc(32, 0x5a).toString('base64'),
  }), { mode: 0o600 });
  await chmod(auditKeyPath, 0o600);

  const parsed = parseServerOptions([], {
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: databasePath,
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32),
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,tenderly',
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '617,3802',
    MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE: auditKeyPath,
  });
  const server = await startServer({
    ...parsed,
    port: 0,
    logger: { info() {}, warn() {}, error() {} },
    looperCodexRuntime: Object.freeze({
      available: true,
      status: Object.freeze({ available: true, artifactHash: 'a'.repeat(64), count: 7777 }),
      getProfileContext() { throw new Error('traffic is disabled'); },
      query() { throw new Error('traffic is disabled'); },
    }),
  });
  try {
    assert.equal(server.restapNetwork.status.enabled, true);
    assert.deepEqual(server.restapNetwork.status.gates, {
      foundation: true,
      policy: false,
      discovery: false,
      initiation: false,
      replies: false,
      transcripts: false,
      pilot: false,
      ga: false,
    });
    assert.equal((await fetch(server.url + '/restap-network/relay')).status, 404);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});


test('production environment boots the holder policy slice and fails closed without concrete dependencies', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-policy-bootstrap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const auditKeyPath = path.join(directory, 'audit-key.json');
  await writeFile(auditKeyPath, JSON.stringify({
    schema_version: '1',
    key_id: 'holder-policy-audit-v1',
    key_base64: Buffer.alloc(32, 0x4b).toString('base64'),
  }), { mode: 0o600 });
  await chmod(auditKeyPath, 0o600);
  const env = {
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: path.join(directory, 'network.sqlite'),
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 'p'.repeat(32),
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,tenderly',
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '617,3802',
    MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE: auditKeyPath,
  };
  const publicClient = {
    async getChainId() { throw new Error('authority reads are not expected without persisted candidates'); },
    async getBlock() { throw new Error('authority reads are not expected without persisted candidates'); },
    async readContract() { throw new Error('authority reads are not expected without persisted candidates'); },
    async getBytecode() { throw new Error('authority reads are not expected without persisted candidates'); },
    async getLogs() { throw new Error('authority reads are not expected without persisted candidates'); },
  };
  const codexRuntime = Object.freeze({
    available: true,
    status: Object.freeze({ available: true, artifactHash: 'b'.repeat(64), count: 7777 }),
    getProfileContext() { throw new Error('traffic is disabled'); },
    query() { throw new Error('traffic is disabled'); },
  });
  const server = await startServer({
    ...parseServerOptions([], env),
    port: 0,
    logger: { info() {}, warn() {}, error() {} },
    looperCodexRuntime: codexRuntime,
    loopersPublicClients: [publicClient, publicClient],
  });
  try {
    assert.deepEqual(server.restapNetwork.status.gates, {
      foundation: true,
      policy: true,
      discovery: false,
      initiation: false,
      replies: false,
      transcripts: false,
      pilot: false,
      ga: false,
    });
    assert.equal(typeof server.restapNetwork.getPolicy, 'function');
    assert.equal(typeof server.restapNetwork.createIntent, 'function');
    assert.equal((await fetch(server.url + '/restap-network/relay')).status, 404);
  } finally {
    await server.close();
  }

  await assert.rejects(() => startServer({
    ...parseServerOptions([], { ...env, MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: undefined }),
    port: 0,
    logger: { info() {}, warn() {}, error() {} },
    looperCodexRuntime: codexRuntime,
    loopersPublicClients: [publicClient, publicClient],
  }), /exact reviewed Base providers/i);
  await assert.rejects(() => startServer({
    ...parseServerOptions([], { ...env, MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: path.join(directory, 'missing-codex.sqlite') }),
    port: 0,
    logger: { info() {}, warn() {}, error() {} },
    looperCodexRuntime: Object.freeze({ available: false, status: Object.freeze({ available: false }) }),
    loopersPublicClients: [publicClient, publicClient],
  }), /available Codex/i);
});

test('production composition rejects non-reviewed providers and signed traffic gates', async () => {
  assert.throws(
    () => parseServerOptions([], {
      MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
      MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'https://rpc.example',
    }),
    /exact reviewed provider set/i,
  );
  const signedConfig = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED: 'true',
  });
  assert.throws(
    () => composeRestapNetworkProductionPolicy({
      config: signedConfig, productionConfig: { tokenIds: ['617', '3802'] }, store: {},
      custodyReconciler: {}, accountReader: {}, providers: [], codexRuntime: {},
    }),
    /signed traffic production composition is unavailable/i,
  );
});

test('production composition rejects every partial signed pilot gate tuple', () => {
  for (const gates of [
    { pilot: true },
    { policy: true, pilot: true },
    { policy: true, discovery: true, initiation: true, replies: true },
  ]) {
    const config = parseRestapNetworkServiceConfig({
      MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
      MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: String(gates.policy ?? false),
      MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED: String(gates.discovery ?? false),
      MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED: String(gates.initiation ?? false),
      MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED: String(gates.replies ?? false),
      MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED: String(gates.pilot ?? false),
      MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '617,3802',
      MULTIPASS_RESTAP_NETWORK_CADENCES: 'once',
    });
    assert.throws(() => composeRestapNetworkProductionPolicy({
      config,
      productionConfig: { tokenIds: ['617', '3802'] },
      store: {},
      custodyReconciler: {},
      accountReader: {},
      providers: [],
      codexRuntime: {},
    }), /reviewed owner-opt-in gate tuple/i);
  }
});

test('production policy composition lets the current holder opt in and refresh persisted state while traffic stays off', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-policy-'));
  const filename = path.join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const now = Date.UTC(2026, 9, 4, 16);
  const collection = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
  const owner = '0x1111111111111111111111111111111111111111';
  const controller = owner;
  const account = '0x2222222222222222222222222222222222222222';
  const custody = Object.freeze({ chainId: 8453, collection, tokenId: '617', generation: 1, canonicalAccount: account, owner, controller, safeBlockNumber: 100, safeBlockHash: '0x' + 'a'.repeat(64), status: 'ready' });
  store.transaction('seed_policy_composition', (tx) => {
    tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, collection, '617', 1, account, owner, controller, 100, 'a'.repeat(64), 100, 0, 'ready', now]);
    tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['1'.repeat(32), 8453, collection, '617', 1, account, owner, controller, now - 1_000, now - 500, now + 60_000, 'active']);
  });
  const config = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: filename,
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32),
  });
  const custodyReconciler = { async reconcileToken() { return { eligible: true }; }, getEpochSnapshot() { return custody; } };
  const accountReader = { async read() { return { eligible: true, status: 'ready' }; } };
  const composition = composeRestapNetworkProductionPolicy({
    config, productionConfig: { tokenIds: ['617', '3802'] }, store, custodyReconciler, accountReader,
    providers: [{ approved: true }], codexRuntime: { available: true }, now: () => now,
  });
  const service = await startRestapNetworkService({ config, dependencies: composition.dependencies });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  const identity = { owner };
  const initial = await service.getPolicy({ tokenId: '617', identity });
  assert.equal(initial.policy.policyVersion, 0);
  assert.equal(initial.policy.networkEnabled, false);
  const saved = await service.putPolicy({ tokenId: '617', identity, input: {
    expected_policy_version: 0, network_enabled: true, inbound_enabled: true, autonomous_initiation_enabled: false,
    daily_initiated_conversation_limit: 0, daily_generated_message_limit: 0, per_peer_daily_limit: 0,
    topics: ['general'], allow_peer_token_ids: ['3802'], block_peer_token_ids: [], mute_until: null,
  } });
  assert.equal(saved.policyVersion, 1);
  assert.equal(saved.networkEnabled, true);
  const refreshed = await service.getPolicy({ tokenId: '617', identity });
  assert.equal(refreshed.policy.policyVersion, 1);
  assert.equal(refreshed.policy.networkEnabled, true);
  assert.equal(refreshed.policy.inboundEnabled, true);
  assert.deepEqual(service.status.gates, { foundation: true, policy: true, discovery: false, initiation: false, replies: false, transcripts: false, pilot: false, ga: false });
});

test('production composes the signed owner-opt-in network while schedules and transcripts stay unavailable', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-pilot-'));
  const filename = path.join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  const now = Date.UTC(2026, 9, 4, 16, 47);
  const collection = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
  const owner = '0x1111111111111111111111111111111111111111';
  const account = '0x2222222222222222222222222222222222222222';
  const custody = Object.freeze({ chainId: 8453, collection, tokenId: '617', generation: 1, canonicalAccount: account, owner, controller: owner, safeBlockNumber: 100, safeBlockHash: '0x' + 'a'.repeat(64), status: 'ready' });
  store.transaction('seed_signed_pilot', (tx) => {
    tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, collection, '617', 1, account, owner, owner, 100, 'a'.repeat(64), 100, 0, 'ready', now]);
    tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['1'.repeat(32), 8453, collection, '617', 1, account, owner, owner, now - 1_000, now - 500, now + 60_000, 'active']);
    tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, collection, '617', 1, 1, 1, 1, 1, 1, 3, 1, 32, null, now, now]);
    tx.run("INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, 'allow')", [8453, collection, '617', 1, 1, '3802']);
    tx.run('INSERT INTO restap_network_intents (intent_id, chain_id, collection, token_id, custody_generation, activation_lease_id, policy_version, source, topic, peer_set_digest, selection_cursor, idempotency_key, earliest_at, expires_at, attempt_count, attempt_limit, next_eligible_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['orphaned-leased-intent-000001', 8453, collection, '617', 1, '1'.repeat(32), 1, 'one_shot', 'general', 'f'.repeat(64), 1, 'orphaned-idempotency-key-000001', now, now + 60_000, 1, 1, now, 'leased', now, now]);
  });
  const config = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '617,3802', MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: filename,
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32), MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT: '10',
    MULTIPASS_RESTAP_NETWORK_CADENCES: 'once',
  });
  const composition = composeRestapNetworkProductionPolicy({
    config, productionConfig: { tokenIds: ['617', '3802'] }, store,
    custodyReconciler: { async reconcileToken() { return { eligible: true }; }, getEpochSnapshot() { return custody; } },
    accountReader: { async read() { return { eligible: true, status: 'ready' }; } }, providers: [{ approved: true }],
    codexRuntime: { available: true, getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId), canonicalName: 'Looper #' + tokenId } }; } },
    signer: { keyId: 'pilot-signing-key-0000000000000001', async sign() { return Buffer.alloc(64); } },
    keyRegistry: { get() { return null; } },
    bankrGateway: { async generatePublicReply() { return 'Bounded public reply.'; }, async readUsageTotals() { return { totalRequests: 0 }; } },
    now: () => now,
  });
  assert.equal(store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', ['orphaned-leased-intent-000001']).status, 'exhausted');
  for (const [dependency, method] of [['eligibility', 'resolvePeerForRelay'], ['coordinator', 'reserve'], ['conversations', 'close'], ['runtime', 'generate'], ['relay', 'createDueOperation'], ['providerBudget', 'read'], ['worker', 'start']]) {
    assert.equal(typeof composition.dependencies[dependency]?.[method], 'function', dependency + '.' + method);
  }
  const service = await startRestapNetworkService({ config, dependencies: composition.dependencies });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(service.status.gates, { foundation: true, policy: true, discovery: true, initiation: true, replies: true, transcripts: false, pilot: true, ga: false });
  await assert.rejects(() => service.createIntent({ tokenId: '617', identity: { owner }, input: { peer_token_ids: ['3802'], topic: 'general', cadence: 'daily', run_at: new Date(now).toISOString(), idempotency_key: 'daily-is-forbidden-in-this-pilot-0001' } }), /daily|schedule|one-shot/i);
  await assert.rejects(() => service.createIntent({ tokenId: '617', identity: { owner }, input: { peer_token_ids: ['3802'], topic: 'general', cadence: 'once', run_at: new Date(now + 5 * 60_000).toISOString(), idempotency_key: 'future-schedule-is-forbidden-000001' } }), /schedule|immediate|one-shot/i);
  assert.equal(store.readOne("SELECT count(*) AS count FROM restap_network_intents WHERE source = 'daily'").count, 0);
  assert.equal(service.status.transcriptCapability, 'unavailable');
});

test('production foundation loads protected traffic files and fails closed when a traffic prerequisite is absent', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-files-'));
  const auditKeyPath = path.join(directory, 'audit.json');
  await writeFile(auditKeyPath, JSON.stringify({ schema_version: '1', key_id: 'pilot-audit-v1', key_base64: Buffer.alloc(32, 0x39).toString('base64') }), { mode: 0o600 });
  await chmod(auditKeyPath, 0o600);
  const config = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '617,3802', MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: path.join(directory, 'network.sqlite'),
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32), MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT: '10', MULTIPASS_RESTAP_NETWORK_CADENCES: 'once',
  });
  const productionConfig = { providerIds: ['blast', 'tenderly'], tokenIds: ['617', '3802'], auditKeyFile: auditKeyPath, keyRegistryFile: '/run/restap/keys.json', signerFile: '/run/restap/signer.json', maxFinalizedHeadSkew: 2 };
  const loaded = [];
  const signer = Object.freeze({ keyId: 'pilot-signing-key-0000000000000001', async sign() { return Buffer.alloc(64); } });
  const keyRegistry = Object.freeze({ get(key) { return key === signer.keyId ? { status: 'signing' } : null; } });
  const publicClient = { async getChainId() { throw new Error('not called'); }, async getBlock() { throw new Error('not called'); }, async readContract() { throw new Error('not called'); }, async getBytecode() { throw new Error('not called'); }, async getLogs() { throw new Error('not called'); } };
  const foundation = await createRestapNetworkProductionFoundation({
    config, productionConfig, codexRuntime: { available: true, getProfileContext() { return { identity: { tokenId: '617', canonicalName: 'Looper #617' } }; } },
    publicClients: [publicClient, publicClient], bankrLlmKey: 'bankr-llm-key', bankrReadonlyApiKey: 'bankr-read-key', bankrModel: 'pilot-model', fetchImpl: async () => { throw new Error('not called at startup'); },
    keyRegistryLoader: async ({ filePath }) => { loaded.push(['registry', filePath]); return keyRegistry; },
    signerLoader: async ({ filePath }) => { loaded.push(['signer', filePath]); return signer; },
  });
  t.after(async () => { await foundation.closeOnStartupFailure(); await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(loaded, [['registry', '/run/restap/keys.json'], ['signer', '/run/restap/signer.json']]);
  assert.equal(foundation.dependencies.signer, signer);
  assert.equal(foundation.dependencies.keyRegistry, keyRegistry);
  assert.equal(typeof foundation.dependencies.runtime.generate, 'function');
  await assert.rejects(() => createRestapNetworkProductionFoundation({
    config, productionConfig, codexRuntime: { available: true }, publicClients: [publicClient, publicClient],
    bankrLlmKey: 'bankr-llm-key', bankrReadonlyApiKey: 'bankr-read-key', keyRegistryLoader: async () => ({ get() { return null; } }), signerLoader: async () => signer,
  }), /signer.*registry|signing key/i);
  await assert.rejects(() => createRestapNetworkProductionFoundation({
    config, productionConfig: { ...productionConfig, signerFile: null }, codexRuntime: { available: true }, publicClients: [publicClient, publicClient],
    bankrLlmKey: 'bankr-llm-key', bankrReadonlyApiKey: 'bankr-read-key', keyRegistryLoader: async () => keyRegistry, signerLoader: async () => signer,
  }), /signer.*file|protected.*signer/i);
});

test('production worker supports mutually opted-in directions while preserving bounded canary accounting', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'restap-production-e2e-'));
  const filename = path.join(directory, 'network.sqlite');
  const store = createRestapNetworkDatabase({ filename });
  let now = Date.UTC(2026, 9, 4, 16, 47, 45);
  const collection = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
  const owner = '0x1111111111111111111111111111111111111111';
  const blockHash = '0x' + 'a'.repeat(64);
  const accounts = { '617': '0x2222222222222222222222222222222222222222', '3802': '0x3333333333333333333333333333333333333333' };
  const snapshots = {};
  store.transaction('seed_production_e2e', (tx) => {
    for (const tokenId of ['617', '3802']) {
      const peer = tokenId === '617' ? '3802' : '617';
      const leaseId = tokenId.padEnd(32, tokenId.at(-1));
      snapshots[tokenId] = Object.freeze({ chainId: 8453, collection, tokenId, generation: 1, canonicalAccount: accounts[tokenId], owner, controller: owner, safeBlockNumber: 100, safeBlockHash: blockHash, status: 'ready' });
      tx.run('INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, collection, tokenId, 1, accounts[tokenId], owner, owner, 100, blockHash.slice(2), 100, 0, 'ready', now]);
      tx.run('INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [leaseId, 8453, collection, tokenId, 1, accounts[tokenId], owner, owner, now - 1_000, now - 500, now + 10 * 60_000, 'active']);
      tx.run('INSERT INTO restap_network_owner_policies (chain_id, collection, token_id, custody_generation, policy_version, network_enabled, inbound_enabled, autonomous_enabled, initiated_daily_limit, generated_daily_limit, peer_daily_limit, topic_mask, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [8453, collection, tokenId, 1, 1, 1, 1, 1, 2, 3, 2, 32, null, now, now]);
      tx.run("INSERT INTO restap_network_policy_peers (chain_id, collection, token_id, custody_generation, policy_version, peer_token_id, relation) VALUES (?, ?, ?, ?, ?, ?, 'allow')", [8453, collection, tokenId, 1, 1, peer]);
    }
  });
  const config = parseRestapNetworkServiceConfig({
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED: 'true', MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER: '617,3802', MULTIPASS_RESTAP_NETWORK_DATABASE_PATH: filename,
    MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT: 's'.repeat(32), MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT: '10', MULTIPASS_RESTAP_NETWORK_CADENCES: 'once',
  });
  const accountReader = { async read({ tokenId }) { const custody = snapshots[tokenId]; return { eligible: true, status: 'ready', proof: { chainId: 8453, collection, tokenId, account: custody.canonicalAccount, owner, controller: owner, safeBlock: { number: 100, hash: blockHash }, latest: { owner, controller: owner } } }; } };
  const custodyReconciler = { async reconcileToken() { return { eligible: true }; }, getEpochSnapshot({ tokenId }) { return snapshots[tokenId]; } };
  const privateKey = createPrivateKey({ key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
  const publicKey = Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  const keyId = 'pilot-signing-key-0000000000000001';
  const signer = Object.freeze({ keyId, async sign(bytes) { return cryptoSign(null, bytes, privateKey); } });
  const seconds = Math.floor(now / 1_000);
  const keyRegistry = createRestapNetworkPublicKeyRegistry({ keys: [{ keyId, algorithm: 'Ed25519', publicKey, activatesAt: seconds - 10, notBefore: seconds - 10, notAfter: seconds + 10_000, status: 'signing' }] });
  let providerRequests = 0;
  const composition = composeRestapNetworkProductionPolicy({
    config, productionConfig: { tokenIds: ['617', '3802'] }, store, custodyReconciler, accountReader, providers: [{ approved: true }],
    codexRuntime: { available: true, getProfileContext(tokenId) { return { identity: { tokenId: String(tokenId), canonicalName: 'Looper #' + tokenId } }; } },
    signer, keyRegistry, bankrGateway: { async generatePublicReply() { providerRequests += 1; return 'One bounded private reply.'; }, async readUsageTotals() { return { totalRequests: providerRequests }; } }, now: () => now,
  });
  const service = await startRestapNetworkService({ config, dependencies: composition.dependencies });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  const intent = await service.createIntent({ tokenId: '617', identity: { owner }, input: { peer_token_ids: ['3802'], topic: 'general', cadence: 'once', run_at: new Date(Math.floor(now / 60_000) * 60_000).toISOString(), idempotency_key: 'production-e2e-one-shot-0000000001' } });
  now += 1_000;
  const poll = await composition.dependencies.worker.pollNow();
  assert.equal(poll.processed, 1);
  assert.equal(providerRequests, 1);
  assert.equal(store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', [intent.intentId]).status, 'completed');
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_operations WHERE status = ?', ['committed']).count, 1);
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_deliveries WHERE status = ?', ['delivered']).count, 1);
  const operationConversation = store.readOne('SELECT conversation_id FROM restap_network_deliveries LIMIT 1').conversation_id;
  assert.equal(store.readOne('SELECT count(*) AS count FROM restap_network_conversations').count, 1);
  assert.equal(store.readOne('SELECT turn_count FROM restap_network_conversations WHERE conversation_id = ?', [operationConversation]).turn_count, 2);

  const reverse = await service.createIntent({ tokenId: '3802', identity: { owner }, input: { peer_token_ids: ['617'], topic: 'general', cadence: 'once', run_at: new Date(Math.floor(now / 60_000) * 60_000).toISOString(), idempotency_key: 'production-e2e-reverse-opt-in-0001' } });
  now += 60_000;
  assert.equal((await composition.dependencies.worker.pollNow()).processed, 1);
  assert.equal(store.readOne('SELECT status FROM restap_network_intents WHERE intent_id = ?', [reverse.intentId]).status, 'completed');
  assert.equal(providerRequests, 2);
  assert.equal(store.readOne("SELECT count(*) AS count FROM restap_network_operations WHERE operation_kind = 'opening'").count, 2);
});

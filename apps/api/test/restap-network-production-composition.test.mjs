import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseServerOptions, startServer } from '../src/server.js';
import { parseRestapNetworkProductionConfig } from '../src/restap-network/production.js';
import { composeRestapNetworkProductionPolicy } from '../src/restap-network/production-composition.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { parseRestapNetworkServiceConfig, startRestapNetworkService } from '../src/restap-network/service.js';

test('production traffic config is pinned to the #617 and #3802 private pilot and protected relay files', () => {
  const parsed = parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'drpc,blast',
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '3802,617',
    MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE: '/run/restap/audit.json',
    MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE: '/run/restap/keys.json',
    MULTIPASS_RESTAP_NETWORK_SIGNER_FILE: '/run/restap/signer.json',
  });
  assert.deepEqual(parsed.providerIds, ['blast', 'drpc']);
  assert.deepEqual(parsed.tokenIds, ['617', '3802']);
  assert.equal(parsed.keyRegistryFile, '/run/restap/keys.json');
  assert.equal(parsed.signerFile, '/run/restap/signer.json');
  assert.throws(() => parseRestapNetworkProductionConfig({
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,drpc',
    MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS: '617,3802,4000',
  }), /exact.*617.*3802|pilot roster/i);
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
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'blast,drpc',
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

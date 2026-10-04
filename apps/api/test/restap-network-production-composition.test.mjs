import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseServerOptions, startServer } from '../src/server.js';

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
    MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'base-official,drpc',
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


test('production composition rejects non-reviewed providers and names unsupported later gates', async () => {
  assert.throws(
    () => parseServerOptions([], {
      MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
      MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS: 'https://rpc.example',
    }),
    /exact reviewed provider set/i,
  );
  const parsed = parseServerOptions([], {
    MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED: 'true',
    MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED: 'true',
  });
  await assert.rejects(
    startServer({
      ...parsed,
      port: 0,
      logger: { info() {}, warn() {}, error() {} },
      looperCodexRuntime: { available: true, status: { available: true } },
    }),
    /production composition is unavailable for gate: policy/i,
  );
});

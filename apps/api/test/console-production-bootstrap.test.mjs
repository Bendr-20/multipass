import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertConsoleXmtpConfiguration,
  createConsoleProductionBootstrap,
} from '../src/console-production-bootstrap.js';

const WALLET_KEY = `0x${'11'.repeat(32)}`;
const DB_ENCRYPTION_KEY = `0x${'22'.repeat(32)}`;
const ENABLED_OPTIONS = {
  consoleXmtpEnabled: true,
  consoleXmtpEnv: 'production',
  consoleXmtpWalletKey: WALLET_KEY,
  consoleXmtpDbPath: '/var/lib/multipass/xmtp.db3',
  consoleXmtpDbEncryptionKey: DB_ENCRYPTION_KEY,
};

function createFactoryHarness(events = []) {
  const counts = new Map();
  const count = (name) => counts.set(name, (counts.get(name) ?? 0) + 1);
  const publicClients = [{ id: 'base-client-a' }, { id: 'base-client-b' }];
  const runtimeRegistry = { id: 'runtime-registry' };
  const memoryClient = { provider: 'fake_sibyl' };
  const nodeClient = {
    inboxId: 'agent-inbox',
    async close() { events.push('xmtp.close'); },
  };
  const publishingClient = { provider: 'xmtp_node_sdk', transport: 'xmtp_group' };
  const runtime = { id: 'console-runtime', async handleMessage() {} };
  const worker = { async stop() { events.push('worker.stop'); } };
  const ownedAgentLoader = async () => [];
  const llmClient = { provider: 'fake_bankr' };
  const calls = {};

  return {
    counts,
    objects: {
      publicClients,
      runtimeRegistry,
      memoryClient,
      nodeClient,
      publishingClient,
      runtime,
      worker,
      ownedAgentLoader,
      llmClient,
    },
    calls,
    factories: {
      createLoopersPublicClients(input) {
        count('publicClients');
        calls.publicClients = input;
        return publicClients;
      },
      createLoopersOwnedAgentLoader(input) {
        count('ownedAgentLoader');
        calls.ownedAgentLoader = input;
        return ownedAgentLoader;
      },
      authorizeLooperControl(input) {
        count('authorizeLooperControl');
        calls.authorizeLooperControl = input;
        return Promise.resolve({ controllerVerified: true });
      },
      createLooperRuntimeRegistry() {
        count('runtimeRegistry');
        return runtimeRegistry;
      },
      createSibylMemoryStore() {
        count('memoryClient');
        return memoryClient;
      },
      createDeferredXmtpAgentClient(input) {
        count('deferredPublisher');
        calls.deferredPublisher = input;
        return { provider: 'xmtp_disabled', transport: 'unavailable' };
      },
      async createXmtpNodeClient(input) {
        count('nodeClient');
        calls.nodeClient = input;
        return nodeClient;
      },
      async createNodeXmtpAgentClient(input) {
        count('publishingClient');
        calls.publishingClient = input;
        return publishingClient;
      },
      createBankrLlmClient(input) {
        count('bankrLlmClient');
        calls.bankrLlmClient = input;
        return llmClient;
      },
      createConsoleAgentRuntime(input) {
        count('runtime');
        calls.runtime = input;
        return runtime;
      },
      async startConsoleXmtpWorker(input) {
        count('worker');
        calls.worker = input;
        return worker;
      },
    },
  };
}

function countOf(harness, name) {
  return harness.counts.get(name) ?? 0;
}

test('enabled production bootstrap creates one shared Console/XMTP object graph', async () => {
  const harness = createFactoryHarness();
  const bootstrap = await createConsoleProductionBootstrap(ENABLED_OPTIONS, harness.factories);

  assert.equal(countOf(harness, 'publicClients'), 1);
  assert.equal(countOf(harness, 'ownedAgentLoader'), 1);
  assert.equal(countOf(harness, 'runtimeRegistry'), 1);
  assert.equal(countOf(harness, 'memoryClient'), 1);
  assert.equal(countOf(harness, 'nodeClient'), 1);
  assert.equal(countOf(harness, 'publishingClient'), 1);
  assert.equal(countOf(harness, 'runtime'), 1);
  assert.equal(countOf(harness, 'worker'), 1);
  assert.equal(countOf(harness, 'deferredPublisher'), 0);
  assert.equal(countOf(harness, 'bankrLlmClient'), 0);

  assert.strictEqual(harness.calls.ownedAgentLoader.publicClients, harness.objects.publicClients);
  assert.strictEqual(harness.calls.publishingClient.client, harness.objects.nodeClient);
  assert.strictEqual(harness.calls.runtime.memoryClient, harness.objects.memoryClient);
  assert.strictEqual(harness.calls.runtime.xmtpClient, harness.objects.publishingClient);
  assert.strictEqual(harness.calls.worker.client, harness.objects.nodeClient);
  assert.strictEqual(harness.calls.worker.xmtpClient, harness.objects.publishingClient);
  assert.strictEqual(harness.calls.worker.runtime, harness.objects.runtime);
  assert.strictEqual(harness.calls.worker.runtimeRegistry, harness.objects.runtimeRegistry);
  assert.strictEqual(harness.calls.worker.authorizeLooper, bootstrap.authorizeLooper);

  assert.strictEqual(bootstrap.publicClients, harness.objects.publicClients);
  assert.strictEqual(bootstrap.runtimeRegistry, harness.objects.runtimeRegistry);
  assert.strictEqual(bootstrap.memoryClient, harness.objects.memoryClient);
  assert.strictEqual(bootstrap.nodeClient, harness.objects.nodeClient);
  assert.strictEqual(bootstrap.publishingClient, harness.objects.publishingClient);
  assert.strictEqual(bootstrap.runtime, harness.objects.runtime);
  assert.strictEqual(bootstrap.worker, harness.objects.worker);

  await bootstrap.authorizeLooper({ tokenId: '617', wallet: '0x1234567890abcdef1234567890abcdef12345678' });
  assert.equal(countOf(harness, 'authorizeLooperControl'), 1);
  assert.strictEqual(harness.calls.authorizeLooperControl.publicClients, harness.objects.publicClients);
});

test('production bootstrap stays XMTP-disabled by default and starts no Node client or worker', async () => {
  const harness = createFactoryHarness();
  const bootstrap = await createConsoleProductionBootstrap({}, harness.factories);

  assert.equal(bootstrap.xmtpEnabled, false);
  assert.equal(bootstrap.nodeClient, null);
  assert.equal(bootstrap.worker, null);
  assert.equal(countOf(harness, 'deferredPublisher'), 1);
  assert.equal(countOf(harness, 'nodeClient'), 0);
  assert.equal(countOf(harness, 'publishingClient'), 0);
  assert.equal(countOf(harness, 'worker'), 0);
  assert.equal(countOf(harness, 'bankrLlmClient'), 0);
  assert.equal(harness.calls.deferredPublisher.enabled, false);
  assert.equal(harness.calls.runtime.xmtpClient.transport, 'unavailable');
});

test('enabled production bootstrap rejects incomplete signer/database/encryption configuration before factories run', async (t) => {
  for (const [name, patch, message] of [
    ['signer', { consoleXmtpWalletKey: null }, /MULTIPASS_XMTP_WALLET_KEY/],
    ['signer shape', { consoleXmtpWalletKey: 'not-a-private-key' }, /32-byte hex private key/],
    ['database', { consoleXmtpDbPath: null }, /MULTIPASS_XMTP_DB_PATH/],
    ['encryption', { consoleXmtpDbEncryptionKey: null }, /MULTIPASS_XMTP_DB_ENCRYPTION_KEY/],
    ['encryption shape', { consoleXmtpDbEncryptionKey: 'short' }, /32-byte encryption key/],
  ]) {
    await t.test(name, async () => {
      const harness = createFactoryHarness();
      await assert.rejects(
        () => createConsoleProductionBootstrap({ ...ENABLED_OPTIONS, ...patch }, harness.factories),
        message,
      );
      assert.equal(harness.counts.size, 0);
    });
  }
});

test('Bankr construction is independent and occurs only behind its explicit flag', async () => {
  const disabledHarness = createFactoryHarness();
  await createConsoleProductionBootstrap({ consoleAgentBankrLlmEnabled: false }, disabledHarness.factories);
  assert.equal(countOf(disabledHarness, 'bankrLlmClient'), 0);
  assert.equal(disabledHarness.calls.runtime.llmClient, undefined);

  const enabledHarness = createFactoryHarness();
  await createConsoleProductionBootstrap({
    consoleAgentBankrLlmEnabled: true,
    bankrLlmKey: 'injected-test-reference',
    bankrLlmModel: 'fake-model',
  }, enabledHarness.factories);
  assert.equal(countOf(enabledHarness, 'bankrLlmClient'), 1);
  assert.strictEqual(enabledHarness.calls.runtime.llmClient, enabledHarness.objects.llmClient);
});

test('XMTP worker and client cleanup are idempotent and remain separately ordered by the server', async () => {
  const events = [];
  const harness = createFactoryHarness(events);
  const bootstrap = await createConsoleProductionBootstrap(ENABLED_OPTIONS, harness.factories);

  await bootstrap.stopWorker();
  await bootstrap.stopWorker();
  events.push('http.close');
  await bootstrap.closeClient();
  await bootstrap.closeClient();

  assert.deepEqual(events, ['worker.stop', 'http.close', 'xmtp.close']);
});

test('XMTP configuration assertion returns normalized complete configuration', () => {
  assert.deepEqual(assertConsoleXmtpConfiguration(ENABLED_OPTIONS), {
    walletKey: WALLET_KEY,
    dbPath: '/var/lib/multipass/xmtp.db3',
    dbEncryptionKey: DB_ENCRYPTION_KEY,
  });
  assert.equal(
    assertConsoleXmtpConfiguration({
      ...ENABLED_OPTIONS,
      consoleXmtpWalletKey: '11'.repeat(32),
    }).walletKey,
    WALLET_KEY,
  );
});

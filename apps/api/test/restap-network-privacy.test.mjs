import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkConversations } from '../src/restap-network/conversations.js';
import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import { createRestapNetworkRuntime } from '../src/restap-network/runtime.js';

const HIGH = 'HIGH-ENTROPY-7f94c13e-dd7a-46ef-a928-2f6a06a88419';
const LOW = 'ordinary-private-message';
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';

async function collectFiles(paths) {
  const chunks = [];
  for (const path of paths) {
    try { chunks.push(await readFile(path)); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return Buffer.concat(chunks);
}

function assertNoSentinels(value, label) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  assert.equal(bytes.includes(Buffer.from(HIGH)), false, label + ' contains high-entropy sentinel');
  assert.equal(bytes.includes(Buffer.from(LOW)), false, label + ' contains low-entropy sentinel');
}

test('message sentinels never enter SQLite WAL SHM backup logs metrics audits or API outputs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'restap-network-privacy-'));
  const filename = join(directory, 'network.sqlite');
  const backup = join(directory, 'backup');
  await mkdir(backup);
  const store = createRestapNetworkDatabase({ filename });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  let sequence = 0;
  const conversations = createRestapNetworkConversations({ store, fingerprintKey: Buffer.alloc(32, 7), now: () => 1_000, createId: (kind) => kind + '-' + String(++sequence).padStart(24, '0') });
  const opened = conversations.open({ senderTokenId: '1', recipientTokenId: '2', topic: 'general', opening: HIGH });
  const delivery = conversations.beginDelivery({ conversationId: opened.conversationId, speaker: 'recipient' });
  conversations.commitDelivery({ conversationId: opened.conversationId, deliveryId: delivery.deliveryId, output: LOW });

  for (const suffix of ['', '-wal', '-shm']) {
    try { await copyFile(filename + suffix, join(backup, 'network.sqlite' + suffix)); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const liveBytes = await collectFiles([filename, filename + '-wal', filename + '-shm']);
  const backupNames = await readdir(backup);
  const backupBytes = await collectFiles(backupNames.map((name) => join(backup, name)));
  assertNoSentinels(liveBytes, 'live database');
  assertNoSentinels(backupBytes, 'backup copy');

  const logs = [{ event: 'conversation', status: 'active' }];
  const metrics = [{ name: 'restap_operations_total', labels: { kind: 'opening', status: 'committed' }, value: 1 }];
  const audits = store.readAll('SELECT event_class, status_class, subject_digest, topic_class, duration_bucket FROM restap_network_audit_events');
  const apiOutputs = [{ status: 'delivered', transcriptCapability: 'unavailable' }];
  for (const [label, sink] of Object.entries({ logs, metrics, audits, apiOutputs })) assertNoSentinels(sink, label);
});

test('public runtime constructor rejects Console Sibyl XMTP wallet and tool dependencies without touching them', async () => {
  let privateCalls = 0;
  const forbidden = new Proxy(function forbiddenDependency() {}, { apply() { privateCalls += 1; throw new Error('private dependency called'); }, get() { privateCalls += 1; throw new Error('private dependency read'); } });
  const base = {
    generatePublicReply: async () => 'safe public reply',
    readPublicCodex: async ({ tokenId }) => ({ identity: { tokenId }, public: true }),
    readPublicDisplayName: async () => 'Public Looper',
    timeoutMs: 100,
  };
  for (const key of ['consoleRuntime', 'sibyl', 'xmtp', 'wallet', 'tools', 'callback', 'signer']) {
    assert.throws(() => createRestapNetworkRuntime({ ...base, [key]: forbidden }), /exact|unknown/i, key);
  }
  assert.equal(privateCalls, 0);

  const runtime = createRestapNetworkRuntime(base);
  const output = await runtime.generate({
    senderIdentity: { chainId: 8453, collection: COLLECTION, tokenId: '1', canonicalAccount: '0x1111111111111111111111111111111111111111' },
    recipientIdentity: { chainId: 8453, collection: COLLECTION, tokenId: '2', canonicalAccount: '0x2222222222222222222222222222222222222222' },
    topic: 'general',
    transcript: [{ speaker: 'sender', text: HIGH + ' ' + LOW, turnIndex: 0, createdAt: 1 }],
  });
  assert.equal(output, 'safe public reply');
  assert.equal(privateCalls, 0);
  assertNoSentinels({ status: 'ok', output }, 'runtime API output');
});

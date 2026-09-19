import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildSibylMemoryNamespace,
  createLocalSibylMemoryStore,
  createSibylMemoryStore,
  extractDurableMemoryFromMessage,
} from '../src/sibyl-memory/index.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const execFileAsync = promisify(execFile);

test('Sibyl namespace scopes memory by wallet, agent, and activation', () => {
  assert.equal(
    buildSibylMemoryNamespace({
      wallet: WALLET,
      agentId: 'Looper #1234',
      activationId: 'Activation 1234',
    }),
    'multipass:0x1234567890abcdef1234567890abcdef12345678:looper-1234:activation-1234',
  );
});

test('local Sibyl adapter recalls recent memory and searches mission terms', async () => {
  const memory = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:45:00.000Z' });
  const namespace = buildSibylMemoryNamespace({
    wallet: WALLET,
    agentId: 'looper-1234',
    activationId: 'activation-1234',
  });

  await memory.saveMemory({ namespace, text: 'Watchlist preference: monitor NVDAx.', tags: ['watchlist', 'mission'] });
  await memory.saveMemory({ namespace, text: 'Risk preference: medium risk.', tags: ['risk', 'preference'] });

  const recalled = await memory.recallMemory({ namespace });
  const searched = await memory.searchMemory({ namespace, query: 'watchlist' });

  assert.equal(recalled.length, 2);
  assert.equal(recalled[0].tags[0], 'risk');
  assert.equal(searched.length, 1);
  assert.match(searched[0].text, /NVDAx/);
});

test('durable memory extraction keeps watchlist, risk, and constraints separate', () => {
  const extracted = extractDurableMemoryFromMessage('Track vaults, keep risk low, and never execute trades.');

  assert.deepEqual(extracted.map((item) => item.tags[0]), ['watchlist', 'risk', 'constraint']);
});

test('durable memory extraction does not treat avoided high-risk entries as a high-risk preference', () => {
  const extracted = extractDurableMemoryFromMessage('Watch agent assets and avoid high-risk entries.');

  assert.deepEqual(extracted.map((item) => item.tags[0]), ['watchlist', 'constraint']);
  assert.doesNotMatch(extracted.map((item) => item.text).join('\n'), /Risk preference: high risk/);
});

test('Sibyl bridge preserves canonical XMTP message evidence in thread records', async () => {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("multipass_sibyl_bridge", ${JSON.stringify(new URL('../src/sibyl-memory/bridge.py', import.meta.url).pathname)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.normalize_thread_message({
  "id": "xmtp-message-1",
  "role": "agent",
  "text": "Live XMTP reply.",
  "sentAt": "2026-09-17T20:45:00.000Z",
  "transport": "xmtp_group",
  "senderLabel": "Bendr",
  "participantId": "erc8004:89144",
  "conversationId": "conversation-2431",
  "xmtpMessageId": "xmtp-message-1",
  "inferenceProvider": "local_bankr_adapter",
})))
`;
  const { stdout } = await execFileAsync('/home/ubuntu/.openclaw/sibyl-venv/bin/python', ['-c', script]);
  const record = JSON.parse(stdout);

  assert.equal(record.id, 'xmtp-message-1');
  assert.equal(record.senderLabel, 'Bendr');
  assert.equal(record.participantId, 'erc8004:89144');
  assert.equal(record.conversationId, 'conversation-2431');
  assert.equal(record.xmtpMessageId, 'xmtp-message-1');
  assert.equal(record.inferenceProvider, 'local_bankr_adapter');
});

test('Sibyl memory store can require the real bridge instead of silently falling back', async () => {
  const memory = createSibylMemoryStore({
    pythonBin: '/tmp/missing-sibyl-python',
    allowFallback: false,
  });

  await assert.rejects(
    () => memory.saveMemory({
      namespace: 'multipass:test-wallet:test-agent:test-activation',
      text: 'Watchlist preference: prove real Sibyl recall.',
      tags: ['watchlist'],
    }),
    /missing-sibyl-python|ENOENT|Sibyl bridge unavailable/i,
  );
});

test('prove-sibyl-cold-start script fails when the required bridge is unavailable', async () => {
  let error;
  try {
    await execFileAsync('node', [
      'apps/api/scripts/prove-sibyl-cold-start.js',
      '--namespace',
      'multipass:test-wallet:test-agent:test-activation',
      '--message',
      'Watchlist preference: prove real Sibyl recall.',
      '--query',
      'watchlist',
      '--python-bin',
      '/tmp/missing-sibyl-python',
    ], { cwd: process.cwd() });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error);
  assert.match(error.stderr, /missing-sibyl-python|ENOENT|Sibyl bridge unavailable/i);
});

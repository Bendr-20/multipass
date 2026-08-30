import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSibylMemoryNamespace,
  createLocalSibylMemoryStore,
  extractDurableMemoryFromMessage,
} from '../src/sibyl-memory/index.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

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

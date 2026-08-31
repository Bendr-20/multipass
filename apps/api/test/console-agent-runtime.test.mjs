import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleAgentRuntime, createRuntimeProfile } from '../src/agent-runtime/index.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { buildSibylMemoryNamespace, createLocalSibylMemoryStore, extractDurableMemoryFromMessage } from '../src/sibyl-memory/index.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

test('runtime profile binds the selected agent to live chat, Bankr, and Sibyl namespace', () => {
  const profile = createRuntimeProfile({
    wallet: WALLET,
    agentId: 'looper-1234',
    activationId: 'activation-looper-1234',
    tokenId: '1234',
    agentName: 'Signal Looper',
  });

  assert.equal(profile.displayName, 'Signal Looper');
  assert.equal(profile.rootIdentity.ownerWallet, WALLET);
  assert.equal(profile.rootIdentity.tokenId, '1234');
  assert.equal(profile.chat.threadId, 'console:looper-1234');
  assert.equal(profile.inference.provider, 'bankr_llm_gateway');
  assert.equal(profile.memoryNamespace, 'multipass:0x1234567890abcdef1234567890abcdef12345678:looper-1234:activation-looper-1234');
  assert.equal(profile.permissions.trading, 'review_only');
});

test('local Sibyl adapter saves and recalls durable watchlist memory', async () => {
  const memory = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' });
  const namespace = buildSibylMemoryNamespace({
    wallet: WALLET,
    agentId: 'looper-1234',
    activationId: 'activation-looper-1234',
  });
  const extracted = extractDurableMemoryFromMessage('Watch NVDAx and Base agent tokens. Keep risk medium or lower.');

  assert.equal(extracted.length, 2);
  for (const item of extracted) {
    await memory.saveMemory({ namespace, ...item });
  }

  const recalled = await memory.recallMemory({ namespace });
  assert.equal(recalled.length, 2);
  assert.match(recalled.map((entry) => entry.text).join('\n'), /Watchlist preference/);
  assert.match(recalled.map((entry) => entry.text).join('\n'), /Risk preference/);
});

test('console agent runtime receives a message, saves memory, and emits review-only proposal', async () => {
  const runtime = createConsoleAgentRuntime({
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ profile, message, memory, signals }) {
        assert.equal(profile.displayName, 'Agent #1234');
        assert.match(message, /NVDAx/);
        assert.equal(memory.length, 0);
        assert.equal(signals[0].title, 'Manager suite');
        return { provider: 'fake_bankr', text: 'Saved. I will monitor those lanes and keep proposals review-only.' };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Watch NVDAx, Base agent tokens, and vaults. Keep risk medium or lower.',
  });

  assert.equal(result.mode, 'console_agent_runtime');
  assert.equal(result.thread.transport, 'live_chat');
  assert.equal(result.thread.messages.at(-1).inferenceProvider, 'fake_bankr');
  assert.equal(result.memory.saved.length, 2);
  assert.equal(result.missions[0].status, 'active');
  assert.equal(result.proposals[0].status, 'review_only');
  assert.match(result.proposals[0].risk, /No transaction authority/);
});

test('console agent runtime appends only new thread messages between turns', async () => {
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' });
  const runtime = createConsoleAgentRuntime({
    memoryClient,
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ message }) {
        return { provider: 'fake_bankr', text: `Replying to: ${message}` };
      },
    },
  });

  const first = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Watch NVDAx.',
  });
  const second = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Review the last update.',
  });

  assert.equal(first.thread.messages.length, 2);
  assert.equal(second.thread.messages.length, 4);
  assert.deepEqual(
    second.thread.messages.map((entry) => entry.text),
    [
      'Watch NVDAx.',
      'Replying to: Watch NVDAx.',
      'Review the last update.',
      'Replying to: Review the last update.',
    ],
  );
});

test('POST /api/multipass/console/agent/message returns runtime thread payload', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    consoleAgentRuntime: createConsoleAgentRuntime({
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
      now: () => '2026-08-30T01:30:00.000Z',
      llmClient: {
        async generate() {
          return { provider: 'fake_bankr', text: 'Online. Memory saved and proposal ready for review.' };
        },
      },
    }),
  });

  const response = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/agent/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: WALLET,
      agentId: 'looper-1234',
      message: 'Track Base agent tokens, keep risk medium, and avoid high-risk entries.',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profile.agentId, 'looper-1234');
  assert.match(body.thread.messages.at(-1).text, /Online/);
  assert.equal(body.memory.saved.length, 3);
  assert.equal(body.proposals[0].status, 'review_only');
});

test('Bankr key does not call the gateway unless Console inference is explicitly enabled', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    bankrLlmKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('Bankr gateway should not be called by default.');
    },
  });

  const response = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/agent/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: WALLET,
      agentId: 'looper-1234',
      message: 'Watch Base agent tokens.',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'local_bankr_adapter');
});

test('Bankr gateway adapter is used only after explicit Console inference opt-in', async () => {
  let gatewayCalled = false;
  const api = createMultipassApi({
    store: createMemoryStore(),
    bankrLlmKey: 'test-key',
    bankrLlmModel: 'test-model',
    consoleAgentBankrLlmEnabled: true,
    fetchImpl: async (url, init = {}) => {
      gatewayCalled = true;
      assert.equal(url, 'https://llm.bankr.bot/v1/chat/completions');
      assert.equal(init.headers['x-api-key'], 'test-key');
      assert.equal(JSON.parse(init.body).model, 'test-model');
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Bankr gateway response.' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const response = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/agent/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: WALLET,
      agentId: 'looper-1234',
      message: 'Watch Base agent tokens.',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(gatewayCalled, true);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'bankr_llm_gateway');
  assert.match(body.thread.messages.at(-1).text, /Bankr gateway response/);
});

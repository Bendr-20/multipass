import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleAgentRuntime, createRuntimeProfile } from '../src/agent-runtime/index.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { createLooperRuntimeRegistry } from '../src/looper-runtime-registry.js';
import { buildSibylMemoryNamespace, createLocalSibylMemoryStore, extractDurableMemoryFromMessage } from '../src/sibyl-memory/index.js';
import { createLocalXmtpAgentClient } from '../src/xmtp-agent/index.js';
import { createMultipassConsoleSnapshot } from '../../web/src/multipass-console.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const CONSOLE_IDENTITY = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '1234',
  erc8004AgentId: '87069',
  owner: WALLET,
  controllerVerified: true,
};

function createLegacyAuthorizedOptions() {
  const consoleRuntimeRegistry = createLooperRuntimeRegistry();
  consoleRuntimeRegistry.activate({ identity: CONSOLE_IDENTITY, runtimeName: 'Agent #1234' });
  return {
    consoleAuthStore: { validateSession: () => ({ wallet: WALLET }) },
    consoleRuntimeRegistry,
    loopersAuthorizer: async () => CONSOLE_IDENTITY,
  };
}

function secureConsoleRequest(body, path = '/api/multipass/console/agent/message') {
  return new Request(`https://helixa.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'multipass_console=test-session',
      'x-csrf-token': 'test-csrf',
    },
    body: JSON.stringify({ ...body, tokenId: '1234' }),
  });
}

function hasFrontendReviewOnlyProof(payload = {}) {
  const agent = { tokenId: '1234', name: 'Agent #1234', verified: true };
  const snapshot = createMultipassConsoleSnapshot({
    agents: [agent],
    state: {
      walletSnapshot: { connected: true, address: WALLET },
      consoleOwnedAgents: { status: 'loaded', agents: [agent] },
      consoleSelectedAgentId: '1234',
      consoleAgentThread: {
        ...(payload.thread ?? {}),
        proposals: payload.proposals,
        executionMode: payload.executionMode,
        memoryProvider: payload.memory?.provider,
        ...(Array.isArray(payload.memory?.saved) ? { savedMemory: payload.memory.saved } : {}),
        ...(Array.isArray(payload.memory?.recalled) ? { recalledMemory: payload.memory.recalled } : {}),
      },
    },
  });
  return snapshot.suiteChecks.some((check) => check.value === 'Review-only');
}

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
    xmtpClient: createLocalXmtpAgentClient(),
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
  assert.equal(result.thread.transport, 'xmtp_local');
  assert.equal(result.thread.messages.at(-1).inferenceProvider, 'fake_bankr');
  assert.equal(result.memory.saved.length, 2);
  assert.equal(result.missions[0].status, 'active');
  assert.equal(result.executionMode, 'review_only');
  assert.equal(result.proposals[0].status, 'review_only');
  assert.equal(result.proposals[0].executable, false);
  assert.match(result.proposals[0].risk, /No transaction authority/);
});

test('real activation response drives the frontend Review-only proof gate', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient: createLocalXmtpAgentClient(),
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    }),
  });

  const response = await api.handleRequest(secureConsoleRequest(
    { runtimeName: 'Agent #1234' },
    '/api/multipass/console/agent/activate',
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.executionMode, 'review_only');
  assert.equal(hasFrontendReviewOnlyProof(body), true);
});

test('console agent runtime lets multiple agents participate in one room', async () => {
  const runtime = createConsoleAgentRuntime({
    xmtpClient: createLocalXmtpAgentClient(),
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ participant, room, message }) {
        return {
          provider: 'fake_bankr',
          text: `${participant.displayName} replying in ${room.name}: ${message}`,
        };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: '1',
    tokenId: '1',
    agentName: 'Bendr 2.0',
    roomName: 'Bendr 2.0 + 1 room',
    participants: [
      { tokenId: '1', agentId: '1', displayName: 'Bendr 2.0', role: 'Lead agent' },
      { tokenId: '7', agentId: '7', displayName: 'Wallet Seven', role: 'Ops agent' },
    ],
    message: 'Review route health.',
  });

  assert.equal(result.room.name, 'Bendr 2.0 + 1 room');
  assert.equal(result.room.participants.length, 2);
  assert.equal(result.thread.transport, 'xmtp_local');
  assert.equal(result.thread.messages.length, 3);
  assert.deepEqual(
    result.thread.messages.filter((entry) => entry.role === 'agent').map((entry) => entry.senderLabel),
    ['Bendr 2.0', 'Wallet Seven'],
  );
  assert.match(result.proposals[0].action, /monitoring together/i);
});

test('console agent runtime appends only new thread messages between turns', async () => {
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' });
  const runtime = createConsoleAgentRuntime({
    xmtpClient: createLocalXmtpAgentClient(),
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
  assert.equal(second.memory.recalled.length, 1);
  assert.match(second.memory.recalled[0].text, /Watchlist preference: Watch NVDAx\./);
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
    ...createLegacyAuthorizedOptions(),
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient: createLocalXmtpAgentClient(),
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
      now: () => '2026-08-30T01:30:00.000Z',
      llmClient: {
        async generate() {
          return { provider: 'fake_bankr', text: 'Online. Memory saved and proposal ready for review.' };
        },
      },
    }),
  });

  const response = await api.handleRequest(secureConsoleRequest({
    message: 'Track Base agent tokens, keep risk medium, and avoid high-risk entries.',
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profile.agentId, '87069');
  assert.match(body.thread.messages.at(-1).text, /Online/);
  assert.equal(body.memory.saved.length, 3);
  assert.equal(body.executionMode, 'review_only');
  assert.equal(body.proposals[0].status, 'review_only');
  assert.equal(body.proposals[0].executable, false);
  assert.equal(hasFrontendReviewOnlyProof(body), true);
});

test('Bankr key does not call the gateway unless Console inference is explicitly enabled', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleXmtpClient: createLocalXmtpAgentClient(),
    bankrLlmKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('Bankr gateway should not be called by default.');
    },
  });

  const response = await api.handleRequest(secureConsoleRequest({ message: 'Watch Base agent tokens.' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'local_bankr_adapter');
});

test('Bankr gateway adapter is used only after explicit Console inference opt-in', async () => {
  let gatewayCalled = false;
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleXmtpClient: createLocalXmtpAgentClient(),
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

  const response = await api.handleRequest(secureConsoleRequest({ message: 'Watch Base agent tokens.' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(gatewayCalled, true);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'bankr_llm_gateway');
  assert.match(body.thread.messages.at(-1).text, /Bankr gateway response/);
});

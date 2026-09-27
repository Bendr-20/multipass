import assert from 'node:assert/strict';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import { createConsoleAgentRuntime } from '../src/agent-runtime/index.js';
import { createConsoleAuthStore } from '../src/console-auth.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { LOOPERS_MAINNET_CONTRACT } from '../src/loopers-owned-agents.js';
import { createLooperRuntimeRegistry } from '../src/looper-runtime-registry.js';
import { createLocalSibylMemoryStore } from '../src/sibyl-memory/index.js';
import { createEthereumPersonalSignatureVerifier } from '../src/signature-verifier.js';
import { createLocalXmtpAgentClient } from '../src/xmtp-agent/index.js';

const holder = privateKeyToAccount('0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c');
const stranger = privateKeyToAccount('0x8b3a350cf5c34c9194ca3a545d53b5575c6f5f9f5b3f91d5b13cfb0bc9cf4f8b');
const verifier = createEthereumPersonalSignatureVerifier({ client: null });
const identity = {
  chainId: 8453,
  contract: LOOPERS_MAINNET_CONTRACT,
  adapter: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27',
  tokenId: '617',
  owner: holder.address,
  erc8004AgentId: '87069',
  controllerVerified: true,
};

async function authenticate(api, account) {
  const nonceResponse = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/session/nonce', {
    method: 'POST',
    headers: { origin: 'https://helixa.test', 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: account.address }),
  }));
  assert.equal(nonceResponse.status, 200);
  const challenge = await nonceResponse.json();
  const signature = await account.signMessage({ message: challenge.message });
  const verifyResponse = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/session/verify', {
    method: 'POST',
    headers: { origin: 'https://helixa.test', 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: account.address, nonce: challenge.nonce, signature }),
  }));
  assert.equal(verifyResponse.status, 200);
  const body = await verifyResponse.json();
  return {
    cookie: verifyResponse.headers.get('set-cookie').split(';')[0],
    csrfToken: body.csrfToken,
  };
}

function secureRequest(url, session, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      origin: 'https://helixa.test',
      cookie: session.cookie,
      ...(body ? { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('authenticated holder owns, activates, names, chats through Bankr, and recalls Sibyl memory in a fresh session', async () => {
  const authorizerCalls = [];
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-09-17T03:45:00.000Z' });
  const api = createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.test',
    allowedOrigins: ['https://helixa.test'],
    signatureVerifier: verifier,
    consoleAuthStore: createConsoleAuthStore(),
    consoleRuntimeRegistry: createLooperRuntimeRegistry(),
    loopersOwnedAgentLoader: async ({ address }) => address === holder.address.toLowerCase()
      ? [{ ...identity, name: 'Looper #617', canonicalName: 'Looper #617' }]
      : [],
    loopersAuthorizer: async ({ tokenId, wallet }) => {
      authorizerCalls.push({ tokenId, wallet });
      if (wallet !== holder.address.toLowerCase()) {
        const error = new Error('Authenticated wallet does not own this Looper.');
        error.code = 'forbidden';
        throw error;
      }
      return { ...identity, owner: holder.address.toLowerCase() };
    },
    consoleAgentRuntime: createConsoleAgentRuntime({
      memoryClient,
      xmtpClient: createLocalXmtpAgentClient({ now: () => '2026-09-17T03:45:00.000Z' }),
      now: () => '2026-09-17T03:45:00.000Z',
      llmClient: {
        async generate({ profile }) {
          assert.equal(profile.agentId, '87069');
          return { provider: 'bankr_llm_gateway', text: 'Bankr: mission saved for review.' };
        },
      },
    }),
  });

  const firstSession = await authenticate(api, holder);
  const ownedResponse = await api.handleRequest(secureRequest('https://helixa.test/api/loopers/owned', firstSession));
  const owned = await ownedResponse.json();
  assert.equal(ownedResponse.status, 200);
  assert.equal(owned.owner, holder.address.toLowerCase());
  assert.equal(owned.agents[0].tokenId, '617');
  assert.equal(owned.agents[0].erc8004AgentId, '87069');

  const activationResponse = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/activate', firstSession, {
    method: 'POST',
    body: { tokenId: '617', runtimeName: 'Bendr Looper' },
  }));
  const activation = await activationResponse.json();
  assert.equal(activationResponse.status, 200);
  assert.equal(activation.runtime.runtimeName, 'Bendr Looper');
  assert.equal(activation.runtime.identity.erc8004AgentId, '87069');
  assert.equal(activation.runtime.permissions.execution, 'review_only');

  const messageResponse = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/message', firstSession, {
    method: 'POST',
    body: {
      tokenId: '617',
      wallet: stranger.address,
      agentId: 'attacker-selected-id',
      message: 'Watch Base agent opportunities. Keep risk medium.',
    },
  }));
  const message = await messageResponse.json();
  assert.equal(messageResponse.status, 200);
  assert.equal(message.profile.agentId, '87069');
  assert.equal(message.profile.rootIdentity.tokenId, '617');
  assert.equal(message.profile.rootIdentity.ownerWallet, holder.address.toLowerCase());
  assert.equal(message.thread.messages.at(-1).inferenceProvider, 'bankr_llm_gateway');
  assert.match(message.thread.messages.at(-1).text, /^Bankr:/);
  assert.equal(message.proposals.every((proposal) => proposal.status === 'review_only'), true);
  assert.equal(message.proposals.every((proposal) => proposal.execute === undefined), true);
  assert.match(message.memory.namespace, /^multipass:eip155:8453:0x1649cd37/);
  assert.match(message.memory.namespace, new RegExp(`:owner:${holder.address.toLowerCase()}$`, 'i'));

  const freshSession = await authenticate(api, holder);
  const recallResponse = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/message', freshSession, {
    method: 'POST',
    body: { tokenId: '617', message: 'What do you remember?' },
  }));
  const recalled = await recallResponse.json();
  assert.equal(recallResponse.status, 200);
  assert.match(recalled.memory.recalled.map((entry) => entry.text).join('\n'), /Watchlist preference/);
  assert.equal(authorizerCalls.every((call) => call.tokenId === '617' && call.wallet === holder.address.toLowerCase()), true);
});

test('unrelated authenticated wallets receive 403 before runtime, Bankr, or memory access', async () => {
  let runtimeCalled = false;
  const api = createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.test',
    allowedOrigins: ['https://helixa.test'],
    signatureVerifier: verifier,
    consoleAuthStore: createConsoleAuthStore(),
    consoleRuntimeRegistry: createLooperRuntimeRegistry(),
    loopersOwnedAgentLoader: async () => [],
    loopersAuthorizer: async () => {
      const error = new Error('Authenticated wallet does not own this Looper.');
      error.code = 'forbidden';
      throw error;
    },
    consoleAgentRuntime: {
      async handleMessage() {
        runtimeCalled = true;
        throw new Error('must not run');
      },
    },
  });
  const session = await authenticate(api, stranger);

  for (const path of ['activate', 'message']) {
    const response = await api.handleRequest(secureRequest(`https://helixa.test/api/multipass/console/agent/${path}`, session, {
      method: 'POST',
      body: { tokenId: '617', runtimeName: 'Stolen', message: 'Read memory.' },
    }));
    assert.equal(response.status, 403);
  }
  assert.equal(runtimeCalled, false);
});

test('Console agent routes reject caller-supplied wallet access without a verified session', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    loopersOwnedAgentLoader: async () => [{ tokenId: '617' }],
  });
  const owned = await api.handleRequest(new Request(`https://helixa.test/api/loopers/owned?address=${holder.address}`));
  const message = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/agent/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: holder.address, tokenId: '617', message: 'steal' }),
  }));
  assert.equal(owned.status, 401);
  assert.equal(message.status, 401);
});

test('deterministic injected XMTP client publishes canonical thread state and reopens it in a fresh signed session', async () => {
  const publishes = [];
  const reads = [];
  const remote = new Map();
  const xmtpClient = {
    provider: 'xmtp_node_sdk',
    transport: 'xmtp_group',
    async publishRoomMessages(input) {
      publishes.push(structuredClone(input));
      const conversationId = input.conversationId ?? 'conversation-617';
      const prior = remote.get(input.threadId)?.messages ?? [];
      const messages = input.messages.map((message, index) => ({
        ...message,
        id: `xmtp-${prior.length + index + 1}`,
        xmtpMessageId: `xmtp-${prior.length + index + 1}`,
        conversationId,
        transport: 'xmtp_group',
      }));
      const thread = {
        threadId: input.threadId,
        topicId: input.topicId,
        conversationId,
        roomName: input.roomName,
        transport: 'xmtp_group',
        adapter: 'xmtp_node_sdk',
        participants: input.participants,
        messages: [...prior, ...messages],
      };
      remote.set(input.threadId, thread);
      return thread;
    },
    async getThread(input) {
      reads.push(structuredClone(input));
      return remote.get(input.threadId) ?? {
        ...input,
        transport: 'xmtp_group',
        adapter: 'xmtp_node_sdk',
        messages: [],
      };
    },
  };
  const runtimeRegistry = createLooperRuntimeRegistry();
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-09-17T04:40:00.000Z' });
  const api = createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.test',
    allowedOrigins: ['https://helixa.test'],
    signatureVerifier: verifier,
    consoleAuthStore: createConsoleAuthStore(),
    consoleRuntimeRegistry: runtimeRegistry,
    loopersOwnedAgentLoader: async () => [{ ...identity, name: 'Looper #617' }],
    loopersAuthorizer: async ({ tokenId, wallet }) => {
      if (tokenId !== '617' || wallet !== holder.address.toLowerCase()) {
        const error = new Error('Authenticated wallet does not own this Looper.');
        error.code = 'forbidden';
        throw error;
      }
      return { ...identity, owner: holder.address.toLowerCase() };
    },
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient,
      memoryClient,
      now: () => '2026-09-17T04:40:00.000Z',
      llmClient: { async generate() { return { provider: 'fake_bankr', text: 'Canonical reply.' }; } },
    }),
  });

  const firstSession = await authenticate(api, holder);
  await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/activate', firstSession, {
    method: 'POST',
    body: { tokenId: '617', runtimeName: 'Signal Looper', conversationId: 'attacker-conversation' },
  }));
  const sentResponse = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/message', firstSession, {
    method: 'POST',
    body: {
      tokenId: '617',
      message: 'Watch Base. Keep risk medium.',
      wallet: stranger.address,
      agentId: '1',
      conversationId: 'attacker-conversation',
      threadId: 'attacker-thread',
      transport: 'local',
      participants: [{ wallet: stranger.address }],
    },
  }));
  const sent = await sentResponse.json();

  assert.equal(sentResponse.status, 200);
  assert.equal(publishes.length, 1);
  assert.match(publishes[0].threadId, /^xmtp:eip155:8453:0x1649cd37/);
  assert.equal(publishes[0].conversationId, null);
  assert.equal(publishes[0].participants.length, 2);
  assert.equal(publishes[0].participants[0].agentId, '87069');
  assert.equal(publishes[0].participants[1].wallet, holder.address.toLowerCase());
  assert.equal(sent.thread.transport, 'xmtp_group');
  assert.equal(sent.thread.conversationId, 'conversation-617');
  assert.equal(sent.thread.messages.every((message) => message.xmtpMessageId), true);
  assert.equal(sent.proposals.every((proposal) => proposal.status === 'review_only' && proposal.execute === undefined), true);

  const freshSession = await authenticate(api, holder);
  const reopenedResponse = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/activate', freshSession, {
    method: 'POST',
    body: {
      tokenId: '617',
      runtimeName: 'Signal Looper',
      conversationId: 'attacker-conversation',
      participants: [{ wallet: stranger.address }],
    },
  }));
  const reopened = await reopenedResponse.json();

  assert.equal(reopenedResponse.status, 200);
  assert.equal(reopened.thread.conversationId, 'conversation-617');
  assert.equal(reopened.thread.topicId, `${runtimeRegistry.get(identity).key}:operator:${holder.address.toLowerCase()}`);
  assert.match(reopened.thread.messages.map((message) => message.text).join('\n'), /Watch Base|Canonical reply/);
  assert.match(reopened.memory.recalled.map((entry) => entry.text).join('\n'), /Watchlist preference/);
  assert.equal(reads.at(-1).conversationId, 'conversation-617');
  assert.equal(reads.at(-1).conversationId === 'attacker-conversation', false);
});

test('unrelated wallet is forbidden before canonical XMTP thread read or Sibyl recall', async () => {
  let xmtpRead = false;
  let memoryRead = false;
  const api = createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.test',
    allowedOrigins: ['https://helixa.test'],
    signatureVerifier: verifier,
    consoleAuthStore: createConsoleAuthStore(),
    consoleRuntimeRegistry: createLooperRuntimeRegistry(),
    loopersOwnedAgentLoader: async () => [],
    loopersAuthorizer: async () => {
      const error = new Error('Authenticated wallet does not own this Looper.');
      error.code = 'forbidden';
      throw error;
    },
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient: {
        provider: 'xmtp_node_sdk',
        transport: 'xmtp_group',
        async getThread() { xmtpRead = true; return {}; },
        async publishRoomMessages() { throw new Error('must not publish'); },
      },
      memoryClient: {
        provider: 'test',
        async loadThread() { memoryRead = true; return []; },
        async recallMemory() { memoryRead = true; return []; },
        async searchMemory() { memoryRead = true; return []; },
        async saveMemory() { memoryRead = true; return null; },
        async appendThread() { memoryRead = true; return []; },
      },
    }),
  });
  const session = await authenticate(api, stranger);
  const response = await api.handleRequest(secureRequest('https://helixa.test/api/multipass/console/agent/activate', session, {
    method: 'POST', body: { tokenId: '617', conversationId: 'conversation-617' },
  }));

  assert.equal(response.status, 403);
  assert.equal(xmtpRead, false);
  assert.equal(memoryRead, false);
});

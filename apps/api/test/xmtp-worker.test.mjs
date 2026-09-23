import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleAgentRuntime } from '../src/agent-runtime/index.js';
import { buildCanonicalConsoleRoom, createLooperRuntimeRegistry } from '../src/looper-runtime-registry.js';
import { buildSibylMemoryNamespace, createLocalSibylMemoryStore } from '../src/sibyl-memory/index.js';
import {
  buildConsoleXmtpWorkerOptionsFromEnv,
  createConsoleXmtpMessageHandler,
  extractMessageText,
  resolveSenderWallet,
  startConsoleXmtpWorker,
} from '../src/xmtp-worker/index.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const IDENTITY = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '617',
  erc8004AgentId: '87069',
  owner: WALLET,
  controllerVerified: true,
};

function createBoundRuntimeRegistry() {
  const registry = createLooperRuntimeRegistry();
  const activation = registry.activate({ identity: IDENTITY, runtimeName: 'Signal Looper' });
  const room = buildCanonicalConsoleRoom({ activation });
  registry.bindConversation({
    identity: IDENTITY,
    conversationId: 'conversation-1',
    threadId: room.threadId,
    topicId: room.topicId,
    transport: 'xmtp_group',
  });
  return registry;
}

test('extractMessageText accepts XMTP text and fallback content', () => {
  assert.equal(extractMessageText({ content: '  Watch Base.  ' }), 'Watch Base.');
  assert.equal(extractMessageText({ content: { content: ' Reply text ' } }), 'Reply text');
  assert.equal(extractMessageText({ fallback: ' Fallback text ' }), 'Fallback text');
  assert.equal(extractMessageText({ content: { amount: '1' } }), '');
});

test('resolveSenderWallet reads the EVM identifier from conversation members', async () => {
  const conversation = {
    async members() {
      return [
        {
          inboxId: 'sender-inbox',
          accountIdentifiers: [
            { identifier: WALLET.toUpperCase(), identifierKind: 0 },
          ],
        },
      ];
    },
  };

  assert.equal(await resolveSenderWallet({ conversation, senderInboxId: 'sender-inbox' }), WALLET);
  assert.equal(await resolveSenderWallet({ conversation, senderInboxId: 'other-inbox' }), null);
});

test('XMTP worker handler routes a canonically bound inbound message into the Console runtime', async () => {
  const calls = [];
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async ({ tokenId, wallet }) => {
      assert.equal(tokenId, '617');
      assert.equal(wallet, WALLET);
      return IDENTITY;
    },
    getConversation: async (conversationId) => ({
      id: conversationId,
      async members() {
        return [{
          inboxId: 'human-inbox',
          accountIdentifiers: [{ identifier: WALLET, identifierKind: 0 }],
        }];
      },
    }),
    runtime: {
      async handleMessage(input) {
        calls.push(input);
        return { ok: true };
      },
    },
  });

  const result = await handler.handleMessage({
    id: 'xmtp-message-1',
    content: 'Watch Base agent tokens.',
    conversationId: 'conversation-1',
    senderInboxId: 'human-inbox',
  });

  assert.equal(result.processed, true);
  assert.equal(result.wallet, WALLET);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wallet, WALLET);
  assert.equal(calls[0].message, 'Watch Base agent tokens.');
  assert.equal(calls[0].canonicalConversationId, 'conversation-1');
  assert.match(calls[0].threadId, /^xmtp:eip155:8453:/);
  assert.equal(calls[0].inboundMessageId, 'xmtp-message-1');
  assert.equal(calls[0].publishHumanMessage, false);
  assert.equal(calls[0].agentId, '87069');
  assert.equal(calls[0].canonicalIdentity.tokenId, '617');
});

test('XMTP worker handler ignores own and non-text messages', async () => {
  let called = false;
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async () => IDENTITY,
    getConversation: async () => {
      called = true;
      return null;
    },
    runtime: {
      async handleMessage() {
        throw new Error('runtime should not be called');
      },
    },
  });

  assert.deepEqual(
    await handler.handleMessage({ content: 'hello', senderInboxId: 'agent-inbox', conversationId: 'conversation-1' }),
    { processed: false, reason: 'own_message' },
  );
  assert.deepEqual(
    await handler.handleMessage({ content: { amount: '1' }, senderInboxId: 'human-inbox', conversationId: 'conversation-1' }),
    { processed: false, reason: 'non_text_message' },
  );
  assert.equal(called, false);
});

test('XMTP worker rejects unknown conversations and unbound senders before runtime or memory access', async () => {
  let conversationRead = false;
  let authorized = false;
  let runtimeCalled = false;
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async () => { authorized = true; return IDENTITY; },
    getConversation: async () => { conversationRead = true; return null; },
    runtime: { async handleMessage() { runtimeCalled = true; } },
  });

  assert.deepEqual(await handler.handleMessage({
    id: 'unknown-1', content: 'steal memory', conversationId: 'unknown', senderInboxId: 'human-inbox',
  }), { processed: false, reason: 'unbound_conversation' });
  assert.equal(conversationRead, false);
  assert.equal(authorized, false);
  assert.equal(runtimeCalled, false);

  const unboundSender = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async () => { authorized = true; return IDENTITY; },
    getConversation: async () => ({ async members() { return []; } }),
    runtime: { async handleMessage() { runtimeCalled = true; } },
  });
  assert.deepEqual(await unboundSender.handleMessage({
    id: 'unknown-2', content: 'steal memory', conversationId: 'conversation-1', senderInboxId: 'stranger-inbox',
  }), { processed: false, reason: 'sender_wallet_unresolved' });
  assert.equal(authorized, false);
  assert.equal(runtimeCalled, false);
});

test('XMTP worker rechecks canonical authorization and deduplicates inbound message IDs', async () => {
  let runtimeCalls = 0;
  let authorizerCalls = 0;
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async ({ tokenId, wallet }) => {
      authorizerCalls += 1;
      assert.equal(tokenId, '617');
      assert.equal(wallet, WALLET);
      return IDENTITY;
    },
    getConversation: async () => ({
      async members() {
        return [{ inboxId: 'human-inbox', accountIdentifiers: [{ identifier: WALLET, identifierKind: 0 }] }];
      },
    }),
    runtime: { async handleMessage() { runtimeCalls += 1; return { ok: true }; } },
  });
  const message = { id: 'dedupe-1', content: 'remember this', conversationId: 'conversation-1', senderInboxId: 'human-inbox' };

  assert.equal((await handler.handleMessage(message)).processed, true);
  assert.deepEqual(await handler.handleMessage(message), { processed: false, reason: 'duplicate_message' });
  assert.equal(authorizerCalls, 1);
  assert.equal(runtimeCalls, 1);
});

test('XMTP worker requires a stable inbound message ID before authorization or inference', async () => {
  let authorized = false;
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async () => { authorized = true; return IDENTITY; },
    getConversation: async () => { throw new Error('conversation must not be read'); },
    runtime: { async handleMessage() { throw new Error('runtime must not run'); } },
  });

  assert.deepEqual(await handler.handleMessage({
    content: 'no stable id', conversationId: 'conversation-1', senderInboxId: 'human-inbox',
  }), { processed: false, reason: 'missing_message_id' });
  assert.equal(authorized, false);
});

test('Console runtime stores inbound XMTP human text without republishing it', async () => {
  const published = [];
  const runtime = createConsoleAgentRuntime({
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-09-01T00:45:00.000Z' }),
    now: () => '2026-09-01T00:45:00.000Z',
    xmtpClient: {
      provider: 'xmtp_node_sdk_worker',
      transport: 'xmtp_group',
      async publishRoomMessages(input) {
        published.push(input);
        return {
          threadId: input.threadId,
          conversationId: input.conversationId,
          roomName: input.roomName,
          transport: 'xmtp_group',
          adapter: 'xmtp_node_sdk_worker',
          participants: input.participants,
          messages: input.messages.map((message, index) => ({
            ...message,
            id: `published-${index}`,
            xmtpMessageId: `published-${index}`,
            conversationId: input.conversationId,
          })),
        };
      },
    },
    llmClient: {
      async generate() {
        return { provider: 'fake_bankr', text: 'Saved. I will keep this review-only.' };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    agentName: 'Signal Looper',
    message: 'Track Base agents.',
    conversationId: 'conversation-1',
    threadId: 'xmtp:conversation-1',
    inboundMessageId: 'incoming-1',
    publishHumanMessage: false,
  });

  assert.equal(published.length, 1);
  assert.deepEqual(published[0].messages.map((message) => message.role), ['agent']);
  assert.equal(published[0].conversationId, 'conversation-1');
  assert.equal(result.thread.messages.length, 2);
  assert.equal(result.thread.messages[0].role, 'human');
  assert.equal(result.thread.messages[0].xmtpMessageId, 'incoming-1');
  assert.equal(result.thread.messages[1].role, 'agent');
  assert.equal(result.thread.conversationId, 'conversation-1');
});

test('authorized inbound XMTP message recalls Sibyl, runs inference, publishes reply, and persists the thread', async () => {
  const published = [];
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-09-17T04:45:00.000Z' });
  const namespace = buildSibylMemoryNamespace({
    chainId: 8453,
    tokenContract: IDENTITY.contract,
    tokenId: IDENTITY.tokenId,
    identityAgentId: IDENTITY.erc8004AgentId,
    wallet: WALLET,
  });
  await memoryClient.saveMemory({ namespace, text: 'Prior mission: watch Base.', tags: ['mission'] });
  const runtime = createConsoleAgentRuntime({
    memoryClient,
    now: () => '2026-09-17T04:45:00.000Z',
    xmtpClient: {
      provider: 'xmtp_node_sdk',
      transport: 'xmtp_group',
      async publishRoomMessages(input) {
        published.push(input);
        return {
          ...input,
          conversationId: 'conversation-1',
          transport: 'xmtp_group',
          adapter: 'xmtp_node_sdk',
          messages: input.messages.map((message) => ({
            ...message,
            id: 'reply-xmtp-id',
            xmtpMessageId: 'reply-xmtp-id',
            conversationId: 'conversation-1',
          })),
        };
      },
    },
    llmClient: {
      async generate({ memory }) {
        assert.match(memory.map((entry) => entry.text).join('\n'), /Prior mission/);
        return { provider: 'fake_bankr', text: 'Inbound mission recalled and saved.' };
      },
    },
  });
  const handler = createConsoleXmtpMessageHandler({
    runtime,
    runtimeRegistry: createBoundRuntimeRegistry(),
    authorizeLooper: async () => IDENTITY,
    ownInboxId: 'agent-inbox',
    getConversation: async () => ({
      async members() {
        return [{ inboxId: 'human-inbox', accountIdentifiers: [{ identifier: WALLET, identifierKind: 0 }] }];
      },
    }),
  });

  const handled = await handler.handleMessage({
    id: 'incoming-xmtp-id',
    content: 'Track Loopers activity.',
    conversationId: 'conversation-1',
    senderInboxId: 'human-inbox',
  });
  const persisted = await memoryClient.loadThread({ namespace, limit: 5 });

  assert.equal(handled.processed, true);
  assert.equal(published.length, 1);
  assert.deepEqual(published[0].messages.map((message) => message.role), ['agent']);
  assert.equal(published[0].messages[0].text, 'Inbound mission recalled and saved.');
  assert.deepEqual(persisted.map((message) => message.xmtpMessageId), ['incoming-xmtp-id', 'reply-xmtp-id']);
});

test('worker env builder maps XMTP runtime defaults without enabling Bankr by accident', () => {
  const options = buildConsoleXmtpWorkerOptionsFromEnv({
    MULTIPASS_XMTP_ENV: 'dev',
    MULTIPASS_XMTP_WALLET_KEY: '0xkey',
    MULTIPASS_XMTP_AGENT_ID: '81',
    MULTIPASS_XMTP_AGENT_NAME: 'Quigbot',
  });

  assert.equal(options.env, 'dev');
  assert.equal(options.walletKey, '0xkey');
  assert.equal(options.consoleAgentBankrLlmEnabled, false);
  assert.equal(options.consoleSkillProposalsEnabled, false);
  assert.equal(options.defaults.agentId, '81');
  assert.equal(options.defaults.tokenId, '81');
  assert.equal(options.defaults.agentName, 'Quigbot');
});

test('worker env builder accepts only strict skill proposal booleans independently of Bankr chat', () => {
  const options = buildConsoleXmtpWorkerOptionsFromEnv({
    MULTIPASS_AGENT_BANKR_LLM_ENABLED: '0',
    MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED: 'yes',
  });
  assert.equal(options.consoleAgentBankrLlmEnabled, false);
  assert.equal(options.consoleSkillProposalsEnabled, true);
  assert.throws(
    () => buildConsoleXmtpWorkerOptionsFromEnv({ MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED: 'on' }),
    /Invalid boolean for MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED/,
  );
});

test('standalone XMTP worker runtime exposes skill metadata only when explicitly enabled', async () => {
  async function start(skillEnabled) {
    const stream = {
      async *[Symbol.asyncIterator]() {},
      async end() {},
    };
    const nodeClient = {
      inboxId: 'agent-inbox',
      conversations: {
        async syncAll() {},
        async sync() {},
        async streamAllMessages() { return stream; },
        async getConversationById() { return null; },
      },
    };
    return startConsoleXmtpWorker({
      client: nodeClient,
      xmtpClient: {
        provider: 'test_xmtp',
        transport: 'xmtp_group',
        async publishRoomMessages(input) {
          return { ...input, transport: 'xmtp_group', adapter: 'test_xmtp', messages: input.messages };
        },
      },
      runtimeRegistry: createLooperRuntimeRegistry(),
      authorizeLooper: async () => IDENTITY,
      consoleAgentBankrLlmEnabled: false,
      consoleSkillProposalsEnabled: skillEnabled,
      logger: { warn() {}, info() {}, error() {} },
    });
  }

  const disabled = await start(false);
  const disabledResult = await disabled.runtime.handleMessage({
    wallet: WALLET,
    agentId: '617',
    tokenId: '617',
    message: 'Status?',
  });
  assert.equal('capabilities' in disabledResult, false);
  assert.equal('proposalCandidates' in disabledResult, false);
  await disabled.stop();

  const enabled = await start(true);
  const enabledResult = await enabled.runtime.handleMessage({
    wallet: WALLET,
    agentId: '617',
    tokenId: '617',
    message: 'Status?',
  });
  assert.equal(enabledResult.capabilities.skills[0].id, 'bankr');
  assert.deepEqual(enabledResult.proposalCandidates, []);
  await enabled.stop();
});

test('worker consumes supplied Node, publisher, runtime, registry, and authorizer without owning a second client', async () => {
  const events = [];
  let releaseNext;
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() {
      return new Promise((resolve) => { releaseNext = resolve; });
    },
    async end() {
      events.push('stream.end');
      releaseNext?.({ done: true });
    },
  };
  const nodeClient = {
    inboxId: 'agent-inbox',
    conversations: {
      async syncAll() { events.push('syncAll'); },
      async sync() { events.push('sync'); },
      async streamAllMessages() {
        events.push('stream');
        return stream;
      },
      async getConversationById() { return null; },
    },
  };
  const publishingClient = { provider: 'fake_xmtp', transport: 'xmtp_group' };
  const runtime = { async handleMessage() { throw new Error('no messages expected'); } };
  const runtimeRegistry = createLooperRuntimeRegistry();
  const authorizeLooper = async () => IDENTITY;

  const worker = await startConsoleXmtpWorker({
    client: nodeClient,
    xmtpClient: publishingClient,
    runtime,
    runtimeRegistry,
    authorizeLooper,
    logger: { warn() {}, info() {}, error() {} },
  });

  assert.strictEqual(worker.client, nodeClient);
  assert.strictEqual(worker.xmtpClient, publishingClient);
  assert.strictEqual(worker.runtime, runtime);
  assert.deepEqual(events, ['syncAll', 'sync', 'stream']);

  await worker.stop();
  await worker.stop();
  assert.deepEqual(events, ['syncAll', 'sync', 'stream', 'stream.end']);
  await worker.done;
});

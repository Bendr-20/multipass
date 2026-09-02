import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleAgentRuntime } from '../src/agent-runtime/index.js';
import { createLocalSibylMemoryStore } from '../src/sibyl-memory/index.js';
import {
  buildConsoleXmtpWorkerOptionsFromEnv,
  createConsoleXmtpMessageHandler,
  extractMessageText,
  resolveSenderWallet,
} from '../src/xmtp-worker/index.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

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

test('XMTP worker handler routes inbound messages into the Console runtime', async () => {
  const calls = [];
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
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
    defaults: {
      agentId: 'looper-1234',
      tokenId: '1234',
      agentName: 'Signal Looper',
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
  assert.equal(calls[0].conversationId, 'conversation-1');
  assert.equal(calls[0].threadId, 'xmtp:conversation-1');
  assert.equal(calls[0].inboundMessageId, 'xmtp-message-1');
  assert.equal(calls[0].publishHumanMessage, false);
  assert.equal(calls[0].agentId, 'looper-1234');
});

test('XMTP worker handler ignores own and non-text messages', async () => {
  let called = false;
  const handler = createConsoleXmtpMessageHandler({
    ownInboxId: 'agent-inbox',
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
  assert.equal(options.defaults.agentId, '81');
  assert.equal(options.defaults.tokenId, '81');
  assert.equal(options.defaults.agentName, 'Quigbot');
});

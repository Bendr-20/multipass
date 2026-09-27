import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeferredXmtpAgentClient,
  createLocalXmtpAgentClient,
  createNodeXmtpAgentClient,
  normalizeDbEncryptionKey,
} from '../src/xmtp-agent/index.js';

test('XMTP transport is disabled by default and never silently falls back to local output', async () => {
  const xmtp = createDeferredXmtpAgentClient();

  assert.equal(xmtp.provider, 'xmtp_disabled');
  assert.equal(xmtp.transport, 'unavailable');
  await assert.rejects(
    () => xmtp.publishRoomMessages({ threadId: 'canonical-thread', messages: [{ role: 'human', text: 'hello' }] }),
    /XMTP transport is disabled/i,
  );
});

test('local XMTP adapter is available only through explicit test fallback and stays labeled local', async () => {
  const xmtp = createDeferredXmtpAgentClient({ localFallbackEnabled: true });
  const result = await xmtp.publishRoomMessages({
    threadId: 'canonical-thread',
    messages: [{ role: 'human', text: 'test only' }],
  });

  assert.equal(xmtp.provider, 'local_xmtp_adapter');
  assert.equal(result.transport, 'xmtp_local');
  assert.equal(result.adapter, 'local_xmtp_adapter');
});

test('explicit live XMTP enablement fails closed when wallet configuration is absent', async () => {
  const xmtp = createDeferredXmtpAgentClient({ enabled: true });

  assert.equal(xmtp.provider, 'xmtp_unconfigured');
  await assert.rejects(
    () => xmtp.getThread({ threadId: 'canonical-thread' }),
    /wallet configuration is unavailable/i,
  );
});

test('local XMTP adapter opens a room and appends ordered messages', async () => {
  const xmtp = createLocalXmtpAgentClient({ now: () => '2026-08-30T01:45:00.000Z' });
  const threadId = 'xmtp:looper-1234';

  const room = await xmtp.publishRoomMessages({
    threadId,
    roomName: 'Bendr 2.0 + 1 room',
    participants: [
      { tokenId: '1', agentId: '1', displayName: 'Bendr 2.0', role: 'Lead agent' },
      { tokenId: '7', agentId: '7', displayName: 'Wallet Seven', role: 'Ops agent' },
    ],
    messages: [
      {
        role: 'human',
        text: 'Watch Base agent tokens.',
        transport: 'console',
      },
      {
        role: 'agent',
        text: 'Saved. I will keep this review-only.',
        senderLabel: 'Wallet Seven',
        inferenceProvider: 'fake_bankr',
      },
    ],
  });
  const thread = await xmtp.getThread({ threadId });

  assert.equal(xmtp.provider, 'local_xmtp_adapter');
  assert.equal(thread.threadId, threadId);
  assert.equal(thread.roomName, 'Bendr 2.0 + 1 room');
  assert.equal(thread.participants.length, 2);
  assert.equal(thread.messages.length, 2);
  assert.equal(room.messages[0].id, 'xmtp_0');
  assert.equal(room.messages[0].transport, 'console');
  assert.equal(room.messages[1].id, 'xmtp_1');
  assert.equal(room.messages[1].senderLabel, 'Wallet Seven');
  assert.equal(room.messages[1].inferenceProvider, 'fake_bankr');
});

test('local XMTP adapter requires an explicit thread id', async () => {
  const xmtp = createLocalXmtpAgentClient();

  await assert.rejects(
    () => xmtp.publishRoomMessages({ messages: [{ role: 'agent', text: 'No thread.' }] }),
    /XMTP thread id is required/,
  );
});

test('node XMTP adapter can publish into an existing conversation', async () => {
  const sent = [];
  const conversation = {
    id: 'conversation-1',
    async sendText(text, options) {
      sent.push({ text, options });
      return `xmtp-message-${sent.length}`;
    },
  };
  const xmtp = await createNodeXmtpAgentClient({
    now: () => '2026-09-01T00:50:00.000Z',
    client: {
      conversations: {
        async sync() {},
        async getConversationById(conversationId) {
          return conversationId === conversation.id ? conversation : null;
        },
      },
    },
  });

  const room = await xmtp.publishRoomMessages({
    threadId: 'xmtp:conversation-1',
    conversationId: 'conversation-1',
    roomName: 'Quigbot ops',
    participants: [{ tokenId: '81', agentId: '81', displayName: 'Quigbot' }],
    messages: [{ role: 'agent', text: 'Saved. Review-only.', senderLabel: 'Quigbot' }],
  });

  assert.equal(xmtp.provider, 'xmtp_node_sdk');
  assert.equal(room.conversationId, 'conversation-1');
  assert.equal(room.messages.length, 1);
  assert.equal(room.messages[0].xmtpMessageId, 'xmtp-message-1');
  assert.deepEqual(sent, [{
    text: '[Quigbot] Saved. Review-only.',
    options: { idempotencyKey: 'xmtp_0' },
  }]);
});

test('node XMTP adapter fails closed when the authenticated holder cannot be added to a new group', async () => {
  let optimisticGroups = 0;
  const xmtp = await createNodeXmtpAgentClient({
    client: {
      conversations: {
        async createGroupWithIdentifiers() {
          throw new Error('holder is not reachable on XMTP');
        },
        createGroupOptimistic() {
          optimisticGroups += 1;
          return {
            id: 'self-only-group',
            async sendText() { return 'must-not-send'; },
          };
        },
      },
    },
  });

  await assert.rejects(
    () => xmtp.publishRoomMessages({
      threadId: 'xmtp:eip155:8453:loopers:617:erc8004:87069',
      topicId: 'eip155:8453:loopers:617:erc8004:87069',
      wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      roomName: 'Bendr Looper ops',
      participants: [{ participantId: 'erc8004:87069', agentId: '87069', tokenId: '617', displayName: 'Bendr Looper' }],
      messages: [{ role: 'human', text: 'Watch Loopers.' }],
    }),
    /holder is not reachable on XMTP/,
  );
  assert.equal(optimisticGroups, 0);
});

test('node XMTP adapter reopens a bound conversation from canonical thread state', async () => {
  const conversation = {
    id: 'conversation-617',
    async sendText() { return 'unused'; },
  };
  let reads = 0;
  const xmtp = await createNodeXmtpAgentClient({
    client: {
      conversations: {
        async sync() {},
        async getConversationById(conversationId) {
          reads += 1;
          return conversationId === conversation.id ? conversation : null;
        },
      },
    },
  });

  const thread = await xmtp.getThread({
    threadId: 'xmtp:eip155:8453:loopers:617:erc8004:87069',
    conversationId: 'conversation-617',
    roomName: 'Bendr Looper ops',
    participants: [{ participantId: 'erc8004:87069', agentId: '87069', tokenId: '617', displayName: 'Bendr Looper' }],
  });

  assert.equal(reads, 1);
  assert.equal(thread.conversationId, 'conversation-617');
  assert.equal(thread.transport, 'xmtp_group');
  assert.equal(thread.adapter, 'xmtp_node_sdk');
  assert.equal(thread.participants[0].agentId, '87069');
});

test('normalizeDbEncryptionKey accepts hex with or without 0x and plain text', () => {
  const plainHex = 'ab'.repeat(32);
  assert.deepEqual(normalizeDbEncryptionKey(plainHex), Buffer.from(plainHex, 'hex'));
  assert.deepEqual(normalizeDbEncryptionKey(`0x${plainHex}`), Buffer.from(plainHex, 'hex'));
  assert.deepEqual(normalizeDbEncryptionKey('multipass-worker-key'), Buffer.from('multipass-worker-key', 'utf8'));
});

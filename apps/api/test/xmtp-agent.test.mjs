import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalXmtpAgentClient } from '../src/xmtp-agent/index.js';

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

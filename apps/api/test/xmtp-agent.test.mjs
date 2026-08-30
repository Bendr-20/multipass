import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalXmtpAgentClient } from '../src/xmtp-agent/index.js';

test('local XMTP adapter opens a thread and appends ordered messages', async () => {
  const xmtp = createLocalXmtpAgentClient({ now: () => '2026-08-30T01:45:00.000Z' });
  const threadId = 'xmtp:looper-1234';

  const human = await xmtp.appendMessage({
    threadId,
    role: 'human',
    text: 'Watch Base agent tokens.',
    transport: 'console',
  });
  const agent = await xmtp.appendMessage({
    threadId,
    role: 'agent',
    text: 'Saved. I will keep this review-only.',
    inferenceProvider: 'fake_bankr',
  });
  const thread = await xmtp.getThread({ threadId });

  assert.equal(xmtp.provider, 'local_xmtp_adapter');
  assert.equal(thread.threadId, threadId);
  assert.equal(thread.messages.length, 2);
  assert.equal(human.id, 'xmtp_0');
  assert.equal(human.transport, 'console');
  assert.equal(agent.id, 'xmtp_1');
  assert.equal(agent.inferenceProvider, 'fake_bankr');
});

test('local XMTP adapter requires an explicit thread id', async () => {
  const xmtp = createLocalXmtpAgentClient();

  await assert.rejects(
    () => xmtp.appendMessage({ role: 'agent', text: 'No thread.' }),
    /XMTP thread id is required/,
  );
});

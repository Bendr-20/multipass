import assert from 'node:assert/strict';
import test from 'node:test';

import { createMultipassConsoleSnapshot } from '../src/multipass-console.js';

const AGENT = {
  tokenId: '612',
  name: 'Looper #612',
  canonicalName: 'Looper #612',
  erc8004AgentId: '89144',
};
const WALLET = '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4';

function snapshot(conversationId) {
  return createMultipassConsoleSnapshot({
    state: {
      walletSnapshot: { connected: true, address: WALLET },
      consoleOwnedAgents: { status: 'loaded', error: null, agents: [AGENT] },
      consoleSelectedAgentId: '612',
      consoleParticipantAgentIds: ['612'],
      consoleAgentThread: {
        status: 'idle',
        transport: 'xmtp_group',
        conversationId,
        messages: [],
        participants: [],
      },
    },
    agents: [AGENT],
  });
}

test('Console labels XMTP as setup until a real conversation exists', () => {
  assert.equal(snapshot(null).agentThread.transport, 'XMTP setup');
  assert.equal(snapshot('conversation-612').agentThread.transport, 'XMTP live');
});

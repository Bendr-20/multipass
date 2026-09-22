import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateConsoleAgent,
  authenticateConsoleSession,
  sendConsoleAgentMessage,
} from '../src/console-agent-api.js';
import { fetchOwnedLooperAgents } from '../src/loopers-console-agents.js';

const WALLET = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

test('Console client signs a server challenge and stores only returned CSRF session metadata', async () => {
  const calls = [];
  const result = await authenticateConsoleSession({
    apiBase: 'https://helixa.test',
    wallet: WALLET,
    signMessage: async (message) => {
      assert.match(message, /Authenticate this wallet/);
      return { wallet: WALLET, signature: '0xsigned' };
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/nonce')) return new Response(JSON.stringify({ nonce: 'nonce-1', message: 'Authenticate this wallet' }));
      return new Response(JSON.stringify({ wallet: WALLET.toLowerCase(), csrfToken: 'csrf-1' }));
    },
  });

  assert.equal(result.csrfToken, 'csrf-1');
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.init.credentials === 'include'), true);
});

test('owned loading and agent writes rely on cookie session instead of a wallet parameter', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/owned')) return new Response(JSON.stringify({ agents: [{ tokenId: '617', name: 'Looper #617' }] }));
    return new Response(JSON.stringify(url.endsWith('/activate')
      ? { runtime: { runtimeName: 'Bendr Looper' } }
      : { thread: { messages: [] }, memory: {}, proposals: [] }));
  };

  const owned = await fetchOwnedLooperAgents({ apiBase: 'https://helixa.test', fetchImpl });
  const activated = await activateConsoleAgent({
    apiBase: 'https://helixa.test', tokenId: '617', runtimeName: 'Bendr Looper', csrfToken: 'csrf-1', fetchImpl,
  });
  await sendConsoleAgentMessage({
    apiBase: 'https://helixa.test', tokenId: '617', message: 'Remember this.', csrfToken: 'csrf-1', fetchImpl,
  });

  assert.equal(owned[0].tokenId, '617');
  assert.equal(activated.runtime.runtimeName, 'Bendr Looper');
  assert.equal(calls[0].url, 'https://helixa.test/api/loopers/owned');
  assert.equal(JSON.parse(calls[1].init.body).wallet, undefined);
  assert.equal(JSON.parse(calls[2].init.body).wallet, undefined);
  assert.equal(calls[1].init.headers['x-csrf-token'], 'csrf-1');
  assert.equal(calls[2].init.headers['x-csrf-token'], 'csrf-1');
});

test('agent messages include only strict read-only owner-scoped wallet context', async () => {
  let body;
  const walletContext = {
    schema_version: '0.1.0',
    kind: 'looper_wallet_read_context',
    scope: {
      chainId: 8453,
      collection: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
      tokenId: '617',
      account: '0x1111111111111111111111111111111111111111',
      owner: WALLET,
    },
    native: { symbol: 'ETH', balanceWei: '1' },
    tokens: [],
    activity: [],
    refreshedAt: '2026-09-21T23:59:00.000Z',
    health: 'verified',
    capabilities: { read: true, sign: false, submit: false, approve: false },
  };
  await sendConsoleAgentMessage({
    apiBase: 'https://helixa.test', tokenId: '617', message: 'Wallet status?', csrfToken: 'csrf-1', walletContext,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ thread: { messages: [] } }));
    },
  });
  assert.deepEqual(body.walletContext, walletContext);
  assert.equal(JSON.stringify(body).includes('calldata'), false);

  await assert.rejects(sendConsoleAgentMessage({
    apiBase: 'https://helixa.test', tokenId: '617', message: 'Bad', csrfToken: 'csrf-1',
    walletContext: { ...walletContext, capabilities: { read: true, sign: false, submit: true, approve: false } },
    fetchImpl: async () => new Response('{}'),
  }), /read-only/i);
});

test('activation returns a canonical recovered XMTP thread without sending conversation authority', async () => {
  let activationBody;
  const activated = await activateConsoleAgent({
    apiBase: 'https://helixa.test',
    tokenId: '617',
    runtimeName: 'Bendr Looper',
    csrfToken: 'csrf-1',
    fetchImpl: async (_url, init) => {
      activationBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        runtime: { runtimeName: 'Bendr Looper' },
        thread: {
          transport: 'xmtp_group',
          conversationId: 'conversation-617',
          topicId: 'eip155:8453:loopers:617:erc8004:87069',
          messages: [{ id: 'xmtp-1', role: 'agent', text: 'Recovered.', xmtpMessageId: 'xmtp-1' }],
        },
        memory: { provider: 'sibyl_memory', recalled: [{ text: 'Prior mission.' }] },
      }));
    },
  });

  assert.equal(activationBody.conversationId, undefined);
  assert.equal(activated.thread.conversationId, 'conversation-617');
  assert.equal(activated.thread.messages[0].xmtpMessageId, 'xmtp-1');
  assert.equal(activated.memory.recalled[0].text, 'Prior mission.');
});

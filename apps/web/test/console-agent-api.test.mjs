import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateConsoleAgent,
  authenticateConsoleSession,
  sendConsoleAgentMessage,
  updateConsoleAgentName,
} from '../src/console-agent-api.js';
import { fetchOwnedLooperAgents } from '../src/loopers-console-agents.js';

const WALLET = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

test('Console client signs a server challenge and stores only returned CSRF session metadata', async () => {
  const calls = [];
  const stages = [];
  const result = await authenticateConsoleSession({
    apiBase: 'https://helixa.test',
    wallet: WALLET,
    onStage: (stage) => stages.push(stage),
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
  assert.deepEqual(stages, ['nonce', 'signature', 'session']);
});

test('owned loading and agent writes rely on cookie session instead of a wallet parameter', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/owned')) return new Response(JSON.stringify({ agents: [{ tokenId: '617', name: 'Looper #617' }] }));
    if (url.endsWith('/activate')) return new Response(JSON.stringify({ runtime: { runtimeName: 'Bendr Looper' } }));
    if (url.endsWith('/name')) return new Response(JSON.stringify({ tokenId: '617', name: 'Signal Loop', customName: 'Signal Loop' }));
    return new Response(JSON.stringify({ thread: { messages: [] }, memory: {}, proposals: [] }));
  };

  const owned = await fetchOwnedLooperAgents({ apiBase: 'https://helixa.test', fetchImpl });
  const activated = await activateConsoleAgent({
    apiBase: 'https://helixa.test', tokenId: '617', runtimeName: 'Bendr Looper', csrfToken: 'csrf-1', fetchImpl,
  });
  const renamed = await updateConsoleAgentName({
    apiBase: 'https://helixa.test', tokenId: '617', name: 'Signal Loop', csrfToken: 'csrf-1', fetchImpl,
  });
  await sendConsoleAgentMessage({
    apiBase: 'https://helixa.test', tokenId: '617', message: 'Remember this.', csrfToken: 'csrf-1', fetchImpl,
  });

  assert.equal(owned[0].tokenId, '617');
  assert.equal(activated.runtime.runtimeName, 'Bendr Looper');
  assert.equal(renamed.name, 'Signal Loop');
  assert.equal(calls[0].url, 'https://helixa.test/api/loopers/owned');
  assert.equal(JSON.parse(calls[1].init.body).wallet, undefined);
  assert.deepEqual(JSON.parse(calls[2].init.body), { tokenId: '617', name: 'Signal Loop' });
  assert.equal(calls[2].url, 'https://helixa.test/api/multipass/console/agent/name');
  assert.equal(JSON.parse(calls[3].init.body).wallet, undefined);
  assert.equal(calls[1].init.headers['x-csrf-token'], 'csrf-1');
  assert.equal(calls[2].init.headers['x-csrf-token'], 'csrf-1');
  assert.equal(calls[3].init.headers['x-csrf-token'], 'csrf-1');
});

test('owned Looper browser model keeps canonical stale CRED and ignores ambiguous legacy scores', async () => {
  const calls = [];
  const cred = {
    score: 40,
    tier: 'MARGINAL',
    coverage: {
      score: 45,
      label: 'PARTIAL',
      present: ['binding', 'metadata'],
      missing: ['continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'],
    },
    freshness: {
      status: 'stale',
      stale: true,
      cached: true,
      ageSeconds: 901,
      maxAgeSeconds: 300,
      staleIfErrorSeconds: 86400,
      reason: 'upstream_timeout',
    },
    methodologyVersion: 'looper-cred-v1',
    computedAt: '2026-09-26T22:00:00.000Z',
    updatedAt: '2026-09-26T22:00:00.000Z',
    status: 'stale',
  };
  const agents = await fetchOwnedLooperAgents({
    apiBase: 'https://helixa.test',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        agents: [
          { tokenId: '614', name: 'Looper #614', cred, credScore: 65, credLabel: 'Cred 65' },
          { tokenId: '615', name: 'Looper #615', cred: { ...cred, score: '<script>alert(1)</script>' }, credScore: 99, credLabel: 'Cred 99' },
          { tokenId: '616', name: 'Looper #616', credScore: 88, credLabel: 'Cred 88' },
        ],
      }));
    },
  });

  assert.deepEqual(calls, ['https://helixa.test/api/loopers/owned']);
  assert.deepEqual(agents[0].cred, cred);
  assert.equal(agents[0].credScore, 40);
  assert.equal(agents[0].credLabel, 'CRED 40 · MARGINAL · STALE');
  assert.equal(agents[1].cred.status, 'unavailable');
  assert.equal(agents[1].credScore, null);
  assert.equal(agents[1].credLabel, 'CRED unavailable');
  assert.equal(agents[2].cred.status, 'pending');
  assert.equal(agents[2].credScore, null);
  assert.equal(agents[2].credLabel, 'CRED pending');
  assert.equal(calls.some((url) => url.includes('api.helixa.xyz') || url.includes('/api/v2/agent/')), false);
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

test('Console client sends one prepared image with an optional caption through same-origin JSON', async () => {
  let request;
  await sendConsoleAgentMessage({
    apiBase: 'https://helixa.test',
    tokenId: '617',
    message: 'What is this?',
    csrfToken: 'csrf-1',
    clientMessageId: 'console_image_617_1',
    attachment: {
      kind: 'image', mimeType: 'image/png', filename: 'proof.png',
      base64: 'iVBORw0KGgo=', byteLength: 8, width: 12, height: 8,
    },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ thread: { messages: [] } }));
    },
  });
  assert.equal(request.url, 'https://helixa.test/api/multipass/console/agent/message');
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.body.message, 'What is this?');
  assert.equal(request.body.clientMessageId, 'console_image_617_1');
  assert.deepEqual(request.body.attachment, {
    kind: 'image', mimeType: 'image/png', filename: 'proof.png',
    base64: 'iVBORw0KGgo=', width: 12, height: 8,
  });
});

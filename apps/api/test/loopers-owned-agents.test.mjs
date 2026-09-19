import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { loadOwnedLooperAgents } from '../src/loopers-owned-agents.js';

const WALLET = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const OTHER_WALLET = '0x0000000000000000000000000000000000000001';
const AUTH_COOKIE = { cookie: 'multipass_console=test-session' };

function createOwnershipClient({ incomplete = false, owns617 = false } = {}) {
  return {
    async readContract({ functionName, args = [] }) {
      if (functionName === 'balanceOf') return 1n;
      if (functionName === 'totalMinted') return 617n;
      if (functionName === 'erc8004AgentIdByLooper') return args[0] === 617n ? 87069n : 0n;
      if (functionName === 'isController') return args[0] === 87069n && args[1].toLowerCase() === WALLET.toLowerCase();
      if (functionName === 'ownerOf') return args[0] === 617n && owns617 ? WALLET : OTHER_WALLET;
      throw new Error(`unexpected read ${functionName}`);
    },
    async multicall({ contracts }) {
      return contracts.map((contract, index) => {
        if (incomplete && index === 0) return { status: 'failure', error: new Error('dropped') };
        const tokenId = contract.args[0];
        return { status: 'success', result: tokenId === 617n && owns617 ? WALLET : OTHER_WALLET };
      });
    },
  };
}

test('owned Looper scan falls back after an RPC drops a chunk and resolves the canonical identity', async () => {
  const agents = await loadOwnedLooperAgents({
    address: WALLET,
    publicClients: [
      createOwnershipClient({ incomplete: true }),
      createOwnershipClient({ owns617: true }),
    ],
    fetchImpl: async () => new Response(JSON.stringify({ name: 'Looper #617', attributes: [] })),
  });

  assert.equal(agents.length, 1);
  assert.equal(agents[0].tokenId, '617');
  assert.equal(agents[0].erc8004AgentId, '87069');
  assert.equal(agents[0].controllerVerified, true);
});

test('owned Looper scan refuses silent empty success when balance and scan disagree', async () => {
  await assert.rejects(
    loadOwnedLooperAgents({
      address: WALLET,
      publicClients: [createOwnershipClient({ incomplete: true })],
      fetchImpl: async () => new Response('{}'),
    }),
    /ownership scan incomplete/i,
  );
});

test('GET /api/loopers/owned returns wallet-owned Looper agent cards', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    consoleAuthStore: { validateSession: () => ({ wallet: WALLET.toLowerCase() }) },
    loopersOwnedAgentLoader: async ({ address }) => {
      assert.equal(address, WALLET.toLowerCase());
      return [
        {
          tokenId: '617',
          name: 'Looper #617',
          canonicalName: 'Looper #617',
          owner: WALLET.toLowerCase(),
          image: 'https://helixa.xyz/loopers/images/617.png',
          role: 'Trader / Broker',
          verified: true,
          traits: {
            Class: 'Trader / Broker',
            'Secondary Class': 'Seer / Signal Hunter',
            Specialization: 'market making',
            Risk: 'Hazardous',
            Autonomy: 'Extreme',
          },
        },
      ];
    },
  });

  const response = await api.handleRequest(new Request('https://helixa.test/api/loopers/owned', { headers: AUTH_COOKIE }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.schema_version, '0.1.0');
  assert.equal(body.collection, 'loopers');
  assert.equal(body.owner, WALLET.toLowerCase());
  assert.equal(body.agents.length, 1);
  assert.equal(body.agents[0].tokenId, '617');
  assert.equal(body.agents[0].name, 'Looper #617');
  assert.equal(body.agents[0].role, 'Trader / Broker');
  assert.equal(body.agents[0].traits.Specialization, 'market making');
});

test('GET /api/loopers/owned rejects caller-supplied addresses without an authenticated session', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    loopersOwnedAgentLoader: async () => {
      throw new Error('loader should not be called');
    },
  });

  const response = await api.handleRequest(new Request(`https://helixa.test/api/loopers/owned?address=${WALLET}`));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'unauthorized');
});

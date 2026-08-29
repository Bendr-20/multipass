import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatEthFromWei,
  getLooperMintConfigFromLocation,
  loadLooperMintContractState,
  mintLoopers,
  normalizeMintQuantity,
} from '../src/looper-mint.js';

const ADDRESS = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const PROOF = '0x0000000000000000000000000000000000000000000000000000000000001234';
const REHEARSAL_MERKLE_ROOT = '0x7708767dfca7691ceba909e8c050828f998a9c0bd69642d96e61dcd5efb0163c';

test('getLooperMintConfigFromLocation keeps public allowlist registration mint-free by default', () => {
  assert.deepEqual(getLooperMintConfigFromLocation('https://helixa.xyz/allowlist'), { enabled: false });
  assert.deepEqual(getLooperMintConfigFromLocation('https://helixa.xyz/allowlist?mint=sepolia'), { enabled: false });
});

test('getLooperMintConfigFromLocation enables pending Base mainnet config on the mint route', () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint');
  assert.equal(config.enabled, true);
  assert.equal(config.mode, 'mainnet');
  assert.equal(config.chainId, 8453);
  assert.equal(config.contractAddress, null);
});

test('getLooperMintConfigFromLocation enables Base Sepolia rehearsal from query config', () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  assert.equal(config.enabled, true);
  assert.equal(config.mode, 'rehearsal');
  assert.equal(config.chainId, 84532);
  assert.equal(config.contractAddress, '0x0a1C0bEd3E25E94046cB5e546164412dB20d4f2b');
});

test('normalizeMintQuantity accepts only expected mint quantities', () => {
  assert.equal(normalizeMintQuantity('1'), 1);
  assert.equal(normalizeMintQuantity(10), 10);
  assert.throws(() => normalizeMintQuantity(0), /1 to 10/);
  assert.throws(() => normalizeMintQuantity(11), /1 to 10/);
});

test('formatEthFromWei trims noisy decimals', () => {
  assert.equal(formatEthFromWei(1_000_000_000_000n), '0.000001 ETH');
  assert.equal(formatEthFromWei(2_000_000_000_000_000n), '0.002 ETH');
});

test('loadLooperMintContractState reads contract facts and allowlist proof', async () => {
  const calls = [];
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  const publicClient = createPublicClientFixture();
  const state = await loadLooperMintContractState({
    config,
    address: ADDRESS.toLowerCase(),
    apiBase: '/multipass-api',
    publicClient,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ eligible: true, proof: [PROOF], merkle_root: REHEARSAL_MERKLE_ROOT }), { status: 200 });
    },
  });

  assert.equal(state.saleState, 'allowlist');
  assert.equal(state.address, ADDRESS);
  assert.equal(state.allowlistRemainingForWallet, 2n);
  assert.equal(state.publicRemainingForWallet, 9n);
  assert.equal(state.proof.eligible, true);
  assert.deepEqual(state.proof.proof, [PROOF]);
  assert.equal(calls[0], `/multipass-api/api/loopers/allowlist/proof?address=${encodeURIComponent(ADDRESS)}`);
});

test('mintLoopers switches chain and sends allowlist mint transaction', async () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  const publicClient = createPublicClientFixture();
  const requests = [];
  const walletClient = {
    getSnapshot: () => ({ connected: true, address: ADDRESS }),
    request: async (payload) => {
      requests.push(payload);
      if (payload.method === 'eth_chainId') return '0x1';
      if (payload.method === 'wallet_switchEthereumChain') return null;
      if (payload.method === 'eth_sendTransaction') return '0xmint';
      throw new Error(`Unexpected wallet method ${payload.method}`);
    },
  };

  const result = await mintLoopers({
    config,
    walletClient,
    quantity: 2,
    apiBase: '/multipass-api',
    publicClient,
    fetchImpl: async () => new Response(JSON.stringify({ eligible: true, proof: [PROOF], merkle_root: REHEARSAL_MERKLE_ROOT }), { status: 200 }),
  });

  assert.equal(result.hash, '0xmint');
  assert.deepEqual(requests.map((payload) => payload.method), ['eth_chainId', 'wallet_switchEthereumChain', 'eth_sendTransaction']);
  const transaction = requests.at(-1).params[0];
  assert.equal(transaction.from, ADDRESS);
  assert.equal(transaction.to, config.contractAddress);
  assert.equal(transaction.value, '0x1d1a94a2000');
  assert.match(transaction.data, /^0x/);
});

test('mintLoopers blocks allowlist mint when proof API says ineligible', async () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  await assert.rejects(
    mintLoopers({
      config,
      walletClient: {
        getSnapshot: () => ({ connected: true, address: ADDRESS }),
        request: async ({ method }) => method === 'eth_chainId' ? config.chainHex : null,
      },
      publicClient: createPublicClientFixture(),
      fetchImpl: async () => new Response(JSON.stringify({ eligible: false, proof: [], merkle_root: REHEARSAL_MERKLE_ROOT }), { status: 200 }),
    }),
    /not eligible/i,
  );
});

test('mintLoopers blocks allowlist mint when proof root does not match the contract', async () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  await assert.rejects(
    mintLoopers({
      config,
      walletClient: {
        getSnapshot: () => ({ connected: true, address: ADDRESS }),
        request: async ({ method }) => method === 'eth_chainId' ? config.chainHex : null,
      },
      publicClient: createPublicClientFixture(),
      fetchImpl: async () => new Response(JSON.stringify({
        eligible: true,
        proof: [PROOF],
        merkle_root: '0x5d357f2e2dff081f67c39d0209588fadc8038dfddd1783ce58bde6a8e77588ec',
      }), { status: 200 }),
    }),
    /does not match/i,
  );
});

test('mintLoopers blocks wallet cap overruns before sending transactions', async () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  const requests = [];
  await assert.rejects(
    mintLoopers({
      config,
      walletClient: {
        getSnapshot: () => ({ connected: true, address: ADDRESS }),
        request: async (payload) => {
          requests.push(payload);
          return payload.method === 'eth_chainId' ? config.chainHex : null;
        },
      },
      quantity: 2,
      publicClient: createPublicClientFixture({ allowlistMintedByWallet: 2n }),
      fetchImpl: async () => new Response(JSON.stringify({ eligible: true, proof: [PROOF], merkle_root: REHEARSAL_MERKLE_ROOT }), { status: 200 }),
    }),
    /cap reached/i,
  );
  assert.deepEqual(requests.map((payload) => payload.method), ['eth_chainId']);
});

test('mintLoopers reports reverted transaction receipts as failures', async () => {
  const config = getLooperMintConfigFromLocation('https://helixa.xyz/mint?mint=sepolia');
  await assert.rejects(
    mintLoopers({
      config,
      walletClient: {
        getSnapshot: () => ({ connected: true, address: ADDRESS }),
        request: async ({ method }) => {
          if (method === 'eth_chainId') return config.chainHex;
          if (method === 'eth_sendTransaction') return '0xmint';
          throw new Error(`Unexpected wallet method ${method}`);
        },
      },
      publicClient: createPublicClientFixture({}, { receiptStatus: 'reverted' }),
      fetchImpl: async () => new Response(JSON.stringify({ eligible: true, proof: [PROOF], merkle_root: REHEARSAL_MERKLE_ROOT }), { status: 200 }),
    }),
    /reverted/i,
  );
});

function createPublicClientFixture(overrides = {}, options = {}) {
  return {
    async readContract({ functionName }) {
      const values = {
        name: 'Loopers',
        symbol: 'LOOPER',
        saleState: 1,
        allowlistStart: 1787931008n,
        publicStart: 1788017408n,
        saleEnd: 1788561435n,
        allowlistPriceWei: 1_000_000_000_000n,
        publicPriceWei: 2_000_000_000_000n,
        merkleRoot: REHEARSAL_MERKLE_ROOT,
        totalMinted: 1n,
        remainingPublicSupply: 7439n,
        allowlistMintedByWallet: 1n,
        mintedByWallet: 1n,
        ...overrides,
      };
      if (!(functionName in values)) throw new Error(`Unexpected read ${functionName}`);
      return values[functionName];
    },
    async waitForTransactionReceipt({ hash }) {
      return { status: options.receiptStatus ?? 'success', blockNumber: 123n, transactionHash: hash };
    },
  };
}

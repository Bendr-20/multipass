import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { toFunctionSelector } from 'viem';

const PAGE_PATH = new URL('../owner-tools/withdraw-loopers/index.html', import.meta.url);
const CHAIN_ID = '0x2105';
const PROXY = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';
const IMPLEMENTATION = '0x68F22e3563891167D37C86391c4a83449c83e908';
const OWNER_SELECTOR = '0x8da5cb5b';
const TREASURY_SELECTOR = '0x61d027b3';
const WITHDRAW_SELECTOR = '0x3ccfd60b';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const PROXY_HASH = '6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662';
const IMPLEMENTATION_HASH = '46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const PUBLIC_METHODS = [
  'eth_getBalance',
  'eth_call',
  'eth_getStorageAt',
  'eth_getCode',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
];
const WALLET_METHODS = [
  'eth_chainId',
  'eth_accounts',
  'eth_requestAccounts',
  'wallet_switchEthereumChain',
  'eth_sendTransaction',
];

const addressWord = (address) => `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;
const implementationWord = addressWord(IMPLEMENTATION);
const hexBytes = (hex) => Uint8Array.from(hex.match(/../g).map((byte) => Number.parseInt(byte, 16))).buffer;

async function readPage() {
  return readFile(PAGE_PATH, 'utf8');
}

class MockEthereum {
  constructor({ account = OWNER, chainId = CHAIN_ID, sendError = null } = {}) {
    this.account = account;
    this.chainId = chainId;
    this.sendError = sendError;
    this.requests = [];
    this.listeners = new Map();
  }

  async request(payload) {
    this.requests.push(structuredClone(payload));
    if (!WALLET_METHODS.includes(payload.method)) throw new Error(`Unexpected wallet method ${payload.method}`);
    if (payload.method === 'eth_chainId') return this.chainId;
    if (payload.method === 'eth_accounts') return this.account ? [this.account] : [];
    if (payload.method === 'eth_requestAccounts') return this.account ? [this.account] : [];
    if (payload.method === 'wallet_switchEthereumChain') {
      assert.equal(payload.params?.[0]?.chainId, CHAIN_ID);
      this.chainId = CHAIN_ID;
      return null;
    }
    if (payload.method === 'eth_sendTransaction') {
      if (this.sendError) throw this.sendError;
      return TX_HASH;
    }
    throw new Error(`Unhandled wallet method ${payload.method}`);
  }

  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
  }

  emit(event, value) {
    if (event === 'accountsChanged') this.account = value[0] ?? null;
    if (event === 'chainChanged') this.chainId = value;
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

function createRpc(options = {}) {
  const state = {
    balanceResponses: [...(options.balanceResponses ?? ['0xde0b6b3a7640000'])],
    owner: options.owner ?? OWNER,
    treasury: options.treasury ?? OWNER,
    implementation: options.implementation ?? IMPLEMENTATION,
    simulationError: options.simulationError ?? null,
    receiptStatus: options.receiptStatus ?? '0x1',
    txOverrides: options.txOverrides ?? {},
    calls: [],
  };

  const fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    state.calls.push(structuredClone(payload));
    assert.ok(PUBLIC_METHODS.includes(payload.method), `Unexpected public RPC method ${payload.method}`);
    try {
      let result;
      if (payload.method === 'eth_getBalance') {
        result = state.balanceResponses.length > 1 ? state.balanceResponses.shift() : state.balanceResponses[0];
      } else if (payload.method === 'eth_call') {
        const tx = payload.params[0];
        if (tx.data === OWNER_SELECTOR) result = addressWord(state.owner);
        else if (tx.data === TREASURY_SELECTOR) result = addressWord(state.treasury);
        else if (tx.data === WITHDRAW_SELECTOR) {
          if (state.simulationError) throw state.simulationError;
          result = '0x';
        } else throw new Error(`Unexpected eth_call data ${tx.data}`);
      } else if (payload.method === 'eth_getStorageAt') {
        assert.deepEqual(payload.params, [PROXY, IMPLEMENTATION_SLOT, 'latest']);
        result = addressWord(state.implementation);
      } else if (payload.method === 'eth_getCode') {
        result = payload.params[0].toLowerCase() === PROXY.toLowerCase() ? '0x6001' : '0x6002';
      } else if (payload.method === 'eth_getTransactionByHash') {
        result = {
          hash: TX_HASH,
          from: OWNER,
          to: PROXY,
          input: WITHDRAW_SELECTOR,
          value: '0x0',
          ...state.txOverrides,
        };
      } else if (payload.method === 'eth_getTransactionReceipt') {
        result = { transactionHash: TX_HASH, status: state.receiptStatus };
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id,
        error: { code: -32000, message: error.message },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  };

  return { fetch, state };
}

async function openPage({ wallet = new MockEthereum(), rpcOptions = {}, noWallet = false } = {}) {
  const html = await readPage();
  const rpc = createRpc(rpcOptions);
  const dom = new JSDOM(html, {
    url: 'https://helixa.xyz/withdraw-loopers/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = rpc.fetch;
      if (!noWallet) window.ethereum = wallet;
      Object.defineProperty(window, 'crypto', {
        configurable: true,
        value: {
          subtle: {
            async digest(algorithm, bytes) {
              assert.equal(algorithm, 'SHA-256');
              const code = Buffer.from(bytes).toString('hex');
              if (code === '6001') return hexBytes(PROXY_HASH);
              if (code === '6002') return hexBytes(IMPLEMENTATION_HASH);
              throw new Error(`Unexpected digest input ${code}`);
            },
          },
        },
      });
    },
  });
  await waitFor(() => dom.window.document.querySelector('#page-state')?.dataset.busy === 'false');
  return { dom, document: dom.window.document, wallet, rpc };
}

async function waitFor(predicate, message = 'condition', timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function statusText(document) {
  return document.querySelector('#status').textContent.trim();
}

async function clickWithdraw(fixture) {
  fixture.document.querySelector('#withdraw').click();
  await waitFor(
    () => fixture.document.querySelector('#page-state').dataset.busy === 'false',
    'withdraw flow to finish',
  );
}

test('is a standalone noindex page with no external executable assets or editable fields', async () => {
  const html = await readPage();
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.match(document.querySelector('meta[name="robots"]').content, /noindex/i);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
  assert.equal(document.querySelectorAll('input, textarea, select, [contenteditable="true"]').length, 0);
  assert.equal(document.scripts.length, 1);
});

test('pins all chain, contract, selector, implementation, and code-hash identities', async () => {
  const html = await readPage();
  for (const value of [
    '8453', CHAIN_ID, PROXY, OWNER, OWNER_SELECTOR, TREASURY_SELECTOR, IMPLEMENTATION_SLOT,
    IMPLEMENTATION, PROXY_HASH, IMPLEMENTATION_HASH, WITHDRAW_SELECTOR,
  ]) assert.ok(html.includes(value), `missing pinned value ${value}`);
});

test('contains exact public and injected provider method allowlists', async () => {
  const html = await readPage();
  const publicMatch = html.match(/const PUBLIC_RPC_METHODS = Object\.freeze\((\[[^;]+\])\);/);
  const walletMatch = html.match(/const WALLET_METHODS = Object\.freeze\((\[[^;]+\])\);/);
  assert.ok(publicMatch, 'missing frozen public method allowlist');
  assert.ok(walletMatch, 'missing frozen wallet method allowlist');
  assert.deepEqual(JSON.parse(publicMatch[1].replaceAll("'", '"')), PUBLIC_METHODS);
  assert.deepEqual(JSON.parse(walletMatch[1].replaceAll("'", '"')), WALLET_METHODS);
});

test('pins the one immutable write tuple and excludes forbidden selectors and actions', async () => {
  const html = await readPage();
  assert.match(html, /const WITHDRAW_TX = Object\.freeze\(\{\s*from: EXPECTED_OWNER,\s*to: LIVE_PROXY,\s*data: WITHDRAW_SELECTOR,\s*value: '0x0',\s*\}\);/s);
  const forbiddenSignatures = [
    'setTreasury(address)', 'reserveMint(address,uint256)', 'transferFrom(address,address,uint256)',
    'safeTransferFrom(address,address,uint256)', 'transferOwnership(address)', 'renounceOwnership()',
    'pause()', 'unpause()', 'upgradeToAndCall(address,bytes)',
  ];
  for (const signature of forbiddenSignatures) {
    assert.ok(!html.toLowerCase().includes(toFunctionSelector(signature).toLowerCase()), `forbidden selector for ${signature}`);
  }
  assert.equal((html.match(/eth_sendTransaction/g) ?? []).length, 2, 'method should appear only in allowlist and guarded request');
});

test('shows a fail-closed no-wallet state without attempting a send', async () => {
  const fixture = await openPage({ noWallet: true });
  assert.match(statusText(fixture.document), /wallet.*not found/i);
  assert.equal(fixture.document.querySelector('#withdraw').disabled, true);
  assert.equal(fixture.rpc.state.calls.some(({ method }) => method === 'eth_sendTransaction'), false);
  fixture.dom.window.close();
});

test('keeps a wrong wallet disabled and displays the full mismatch', async () => {
  const wrong = '0x1111111111111111111111111111111111111111';
  const fixture = await openPage({ wallet: new MockEthereum({ account: wrong }) });
  assert.equal(fixture.document.querySelector('#withdraw').disabled, true);
  assert.match(statusText(fixture.document), new RegExp(wrong, 'i'));
  assert.match(statusText(fixture.document), new RegExp(OWNER, 'i'));
  assert.equal(fixture.wallet.requests.some(({ method }) => method === 'eth_sendTransaction'), false);
  fixture.dom.window.close();
});

test('enables only when the expected owner is on Base and every public check passes', async () => {
  const fixture = await openPage();
  assert.equal(fixture.document.querySelector('#withdraw').disabled, false);
  assert.match(statusText(fixture.document), /ready/i);
  assert.match(fixture.document.querySelector('#balance').textContent, /1 ETH/);
  assert.match(fixture.document.querySelector('#owner').textContent, new RegExp(OWNER, 'i'));
  assert.match(fixture.document.querySelector('#treasury').textContent, new RegExp(OWNER, 'i'));
  assert.match(fixture.document.querySelector('#implementation').textContent, new RegExp(IMPLEMENTATION, 'i'));
  fixture.dom.window.close();
});

test('account and chain events immediately invalidate readiness and re-run checks', async () => {
  const fixture = await openPage();
  const wrong = '0x2222222222222222222222222222222222222222';
  fixture.wallet.emit('accountsChanged', [wrong]);
  assert.equal(fixture.document.querySelector('#withdraw').disabled, true);
  await waitFor(() => statusText(fixture.document).toLowerCase().includes(wrong.toLowerCase()), 'account refresh');
  fixture.wallet.emit('chainChanged', '0x1');
  assert.equal(fixture.document.querySelector('#withdraw').disabled, true);
  await waitFor(() => /wrong network/i.test(statusText(fixture.document)), 'chain refresh');
  assert.equal(fixture.wallet.requests.some(({ method }) => method === 'eth_sendTransaction'), false);
  fixture.dom.window.close();
});

test('blocks a stale balance before simulation and sends nothing', async () => {
  const fixture = await openPage({ rpcOptions: { balanceResponses: ['0x1', '0x0'] } });
  await clickWithdraw(fixture);
  assert.match(statusText(fixture.document), /zero balance|no ETH/i);
  assert.equal(fixture.wallet.requests.some(({ method }) => method === 'eth_sendTransaction'), false);
  assert.equal(fixture.rpc.state.calls.filter(({ method, params }) => (
    method === 'eth_call' && params[0].data === WITHDRAW_SELECTOR
  )).length, 0);
  fixture.dom.window.close();
});

test('blocks a failed exact simulation and sends nothing', async () => {
  const fixture = await openPage({ rpcOptions: { simulationError: new Error('execution reverted') } });
  await clickWithdraw(fixture);
  assert.match(statusText(fixture.document), /simulation.*execution reverted/i);
  const simulation = fixture.rpc.state.calls.find(({ method, params }) => method === 'eth_call' && params[0].data === WITHDRAW_SELECTOR);
  assert.deepEqual(simulation.params[0], { from: OWNER, to: PROXY, data: WITHDRAW_SELECTOR, value: '0x0' });
  assert.equal(fixture.wallet.requests.some(({ method }) => method === 'eth_sendTransaction'), false);
  fixture.dom.window.close();
});

test('reports a rejected signature without a transaction hash or state change', async () => {
  const error = Object.assign(new Error('User rejected the request'), { code: 4001 });
  const fixture = await openPage({ wallet: new MockEthereum({ sendError: error }) });
  await clickWithdraw(fixture);
  assert.match(statusText(fixture.document), /rejected|cancelled/i);
  assert.equal(fixture.document.querySelector('#transaction').hidden, true);
  assert.equal(fixture.wallet.requests.filter(({ method }) => method === 'eth_sendTransaction').length, 1);
  fixture.dom.window.close();
});

test('sends only the exact immutable tuple and verifies a successful receipt', async () => {
  const fixture = await openPage();
  await clickWithdraw(fixture);
  const sends = fixture.wallet.requests.filter(({ method }) => method === 'eth_sendTransaction');
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0].params, [{ from: OWNER, to: PROXY, data: WITHDRAW_SELECTOR, value: '0x0' }]);
  assert.match(statusText(fixture.document), /withdrawal confirmed/i);
  const link = fixture.document.querySelector('#transaction');
  assert.equal(link.hidden, false);
  assert.equal(link.href, `https://basescan.org/tx/${TX_HASH}`);
  assert.ok(fixture.rpc.state.calls.some(({ method }) => method === 'eth_getTransactionByHash'));
  assert.ok(fixture.rpc.state.calls.some(({ method }) => method === 'eth_getTransactionReceipt'));
  fixture.dom.window.close();
});

test('treats a reverted receipt as failure and never reports success', async () => {
  const fixture = await openPage({ rpcOptions: { receiptStatus: '0x0' } });
  await clickWithdraw(fixture);
  assert.match(statusText(fixture.document), /reverted/i);
  assert.doesNotMatch(statusText(fixture.document), /confirmed/i);
  assert.equal(fixture.wallet.requests.filter(({ method }) => method === 'eth_sendTransaction').length, 1);
  fixture.dom.window.close();
});

test('keeps zero balance disabled with zero sends', async () => {
  const fixture = await openPage({ rpcOptions: { balanceResponses: ['0x0'] } });
  assert.equal(fixture.document.querySelector('#withdraw').disabled, true);
  assert.match(statusText(fixture.document), /zero balance|no ETH/i);
  fixture.document.querySelector('#withdraw').click();
  assert.equal(fixture.wallet.requests.some(({ method }) => method === 'eth_sendTransaction'), false);
  fixture.dom.window.close();
});

test('uses no unexpected wallet or public provider methods during connect, switching, and withdraw', async () => {
  const wallet = new MockEthereum({ chainId: '0x1' });
  const fixture = await openPage({ wallet });
  fixture.document.querySelector('#connect').click();
  await waitFor(() => fixture.document.querySelector('#withdraw').disabled === false, 'Base readiness after switch');
  await clickWithdraw(fixture);
  assert.ok(wallet.requests.every(({ method }) => WALLET_METHODS.includes(method)));
  assert.ok(fixture.rpc.state.calls.every(({ method }) => PUBLIC_METHODS.includes(method)));
  assert.ok(wallet.requests.some(({ method }) => method === 'wallet_switchEthereumChain'));
  fixture.dom.window.close();
});

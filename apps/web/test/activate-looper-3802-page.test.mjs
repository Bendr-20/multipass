import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { loadActivationUnits } from './activate-looper-3802-fixture.mjs';

const PAGE = new URL('../owner-tools/activate-looper-3802/index.html', import.meta.url);

async function unit() { return loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','04-wallet-boundary.js','05-attempt-store.js','06-cross-tab-coordinator.js','08-controller-renderer.js']); }

test('wallet boundary exposes only approved methods and sends the exact transaction synchronously', async () => {
  const ns = await unit(); const calls = [];
  const provider = { request(payload) { calls.push(payload); return payload.method === 'eth_sendTransaction' ? Promise.resolve(`0x${'ab'.repeat(32)}`) : Promise.resolve(payload.method === 'eth_chainId' ? '0x2105' : [ns.PINSET.identities.sponsor.address]); }, on() {} };
  const wallet = ns.createWalletBoundary(provider);
  assert.deepEqual(JSON.parse(JSON.stringify(ns.WALLET_METHODS)), ['eth_chainId','eth_accounts','eth_requestAccounts','wallet_switchEthereumChain','eth_sendTransaction']);
  const promise = wallet.sendPinnedActivation();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { method: 'eth_sendTransaction', params: [JSON.parse(JSON.stringify(ns.EXACT_TRANSACTION))] });
  assert.equal(await promise, `0x${'ab'.repeat(32)}`);
  assert.throws(() => wallet.sendPinnedActivation({}), /no arguments/i);
  assert.equal(calls.filter(({ method }) => method === 'eth_sendTransaction').length, 1);
});

test('wallet boundary handles no provider and Base switching without exposing generic request', async () => {
  const ns = await unit(); const absent = ns.createWalletBoundary(null);
  assert.deepEqual(JSON.parse(JSON.stringify(await absent.readState())), { chainId: null, account: null });
  await assert.rejects(absent.connectAndSwitch(), /not found/i);
  assert.equal(Object.hasOwn(absent, 'request'), false);
  const calls = []; let chain = '0x1';
  const wallet = ns.createWalletBoundary({ request: async ({ method, params }) => { calls.push({ method, params }); if (method === 'eth_requestAccounts') return [ns.PINSET.identities.sponsor.address]; if (method === 'wallet_switchEthereumChain') { chain = params[0].chainId; return null; } if (method === 'eth_chainId') return chain; return []; } });
  assert.equal((await wallet.connectAndSwitch()).chainId, '0x2105');
  assert.equal(calls.some(({ method }) => method === 'wallet_switchEthereumChain'), true);
});


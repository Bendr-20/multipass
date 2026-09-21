import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { loadActivationUnits } from './activate-looper-3802-fixture.mjs';

const PAGE = new URL('../owner-tools/activate-looper-3802/index.html', import.meta.url);

async function unit() { return loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','03-snapshot-validator.js','04-wallet-boundary.js','05-attempt-store.js','06-cross-tab-coordinator.js','08-controller-renderer.js']); }

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

test('prepared/send handoff invokes the wallet on the statement after synchronous read-back', async () => {
  const ns = await unit(); const journal = [];
  const context = { mutate(mutator) { journal.push('write'); const next = mutator({ activeAttemptId: null, attempts: [] }); journal.push('read-back'); return next; } };
  const wallet = { sendPinnedActivation() { journal.push('send'); return Promise.resolve('hash'); } };
  const draft = { id: 'draft' };
  const handoff = ns.persistPreparedAndInvoke(context, wallet, draft);
  journal.push('first-await'); await handoff.sendPromise;
  assert.deepEqual(journal, ['write','read-back','send','first-await']);
});

test('controller control state is fail closed', async () => {
  const ns = await unit();
  const locked = ns.deriveControls({ busy: false, walletReady: true, preflight: { sendReady: true }, store: null, locksAvailable: false });
  assert.equal(locked.activate.disabled, true);
  const ready = ns.deriveControls({ busy: false, walletReady: true, preflight: { sendReady: true }, store: null, locksAvailable: true });
  assert.equal(ready.activate.disabled, false);
  const durable = ns.deriveControls({ busy: false, walletReady: true, preflight: { sendReady: true }, store: { activeAttemptId: 'x', attempts: [{ id: 'x', state: 'submitted', retryOrdinal: 0 }] }, locksAvailable: true });
  assert.equal(durable.activate.disabled, true); assert.equal(durable.resume.visible, true);
});

test('generated page retains the exact closed UI and safe status rendering surface', async () => {
  const html = await readFile(PAGE, 'utf8'); const dom = new JSDOM(html); const { document } = dom.window;
  assert.ok(document.getElementById('page-state'));
  assert.equal(document.querySelectorAll('input,textarea,select,[contenteditable]').length, 0);
  assert.deepEqual([...document.querySelectorAll('button')].map(({ id }) => id), ['connect','activate','resume','retry','acknowledge']);
  assert.equal(document.querySelectorAll('script[src],iframe,object,embed').length, 0);
  assert.doesNotThrow(() => new Function(document.scripts[0].textContent));
});

test('retry handoff atomically supersedes one eligible original before wallet invocation', async () => {
  const ns = await unit(); const journal = []; const retry = { id: 'retry', createdAtMs: 700000, supersedesId: null };
  const original = { id: 'original', state: 'uncertain_hashless', retryOrdinal: 0, txHash: null, waitUntilMs: 600000, history: [], updatedAtMs: 0, supersededById: null };
  const context = { mutate(mutator) { journal.push('write'); const next = mutator({ activeAttemptId: 'original', attempts: [original] }); journal.push('read-back'); return next; } };
  const wallet = { sendPinnedActivation() { journal.push('send'); return Promise.resolve('hash'); } };
  const handoff = ns.persistRetryAndInvoke(context, wallet, original.id, retry); journal.push('await'); await handoff.sendPromise;
  assert.deepEqual(journal, ['write','read-back','send','await']);
  assert.equal(handoff.stored.attempts[0].state, 'superseded'); assert.equal(handoff.stored.attempts[1].supersedesId, 'original');
});

test('bootstrap is the sole composition root for browser capabilities', async () => {
  const ns = await loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','02-public-rpc-transport.js','03-snapshot-validator.js','04-wallet-boundary.js','05-attempt-store.js','06-cross-tab-coordinator.js','07-receipt-trace-verifier.js','08-controller-renderer.js','09-bootstrap.js']);
  assert.equal(typeof ns.bootstrap, 'function');
  const controllerSource = await readFile(new URL('../owner-tools/activate-looper-3802/src/08-controller-renderer.js', import.meta.url), 'utf8');
  for (const forbidden of ['window.ethereum','localStorage','navigator.locks']) assert.equal(controllerSource.includes(forbidden), false, forbidden);
});

test('controller freezes every literal typed RPC request before the transport boundary', async () => {
  const ns = await unit();
  let gasPriceRequest = null;
  const transport = {
    anchorCanonicalHead: async () => ({ number: '0x1', hash: `0x${'ab'.repeat(32)}` }),
    stateBatch: async () => ({ items: [] }),
    standard: async (request) => { gasPriceRequest = request; if (!Object.isFrozen(request)) throw new Error('RPC typed request must be frozen.'); return { result: '0x1' }; },
  };
  const rendered = [];
  const controller = ns.createController({
    transport,
    wallet: { hasProvider: false, readState: async () => ({ chainId: null, account: null }) },
    store: { read: () => null },
    coordinator: { available: false },
    renderer: { render: (view) => rendered.push(view) },
    crypto: { randomUUID: () => 'unused' },
    now: () => 0,
  });
  await controller.refresh();
  assert.equal(Object.isFrozen(gasPriceRequest), true);
  assert.match(rendered.at(-1).status, /Injected wallet not found/i);

  const source = await readFile(new URL('../owner-tools/activate-looper-3802/src/08-controller-renderer.js', import.meta.url), 'utf8');
  assert.equal(source.includes('transport.standard({'), false);
  assert.equal(source.includes("transport.request('https://base.drpc.org', {"), false);
  assert.match(source, /Object\.freeze\(\{ kind: 'trace', hash: attempt\.txHash \}\)/u);
});

test('page exposes no editable, automatic retry, or collection-wide activation behavior', async () => {
  const html = await readFile(PAGE, 'utf8');
  assert.equal(/setInterval\([^)]*(?:activate|retry|sendPinnedActivation)/isu.test(html), false);
  assert.equal(/activate all|collection-wide activation|batch activation/iu.test(html), false);
  assert.equal((html.match(/eth_sendTransaction/gu) || []).length, 2);
  const dom = new JSDOM(html); assert.equal(dom.window.document.querySelectorAll('input,textarea,select,[contenteditable]').length, 0);
});

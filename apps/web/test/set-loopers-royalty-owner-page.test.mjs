import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const PAGE_PATH = new URL('../owner-tools/set-loopers-royalty/index.html', import.meta.url);
const PROXY = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';
const SAFE = '0xfA5c233683E4cE7cA6214E769Ae5F9D9e6Fa4483';
const CALLDATA = '0x8dc251e3000000000000000000000000fa5c233683e4ce7ca6214e769ae5f9d9e6fa4483';

const readPage = () => readFile(PAGE_PATH, 'utf8');

test('is a standalone noindex page with one royalty write action', async () => {
  const html = await readPage();
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.match(document.querySelector('meta[name="robots"]').content, /noindex/i);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed, input').length, 0);
  assert.equal(document.querySelectorAll('button').length, 2);
  assert.match(document.querySelector('#set-royalty').textContent, /Set Safe as royalty wallet/i);
});

test('pins Base, owner, proxy, Safe, and exact setter calldata', async () => {
  const html = await readPage();
  for (const value of ['8453', '0x2105', PROXY, OWNER, SAFE, CALLDATA]) assert.ok(html.includes(value), `missing ${value}`);
});

test('permits only the exact zero-value royalty receiver transaction', async () => {
  const html = await readPage();
  assert.match(html, /const tx = Object\.freeze\(\{ chainId: CHAIN_HEX, from: EXPECTED_OWNER, to: LIVE_PROXY, data: SET_ROYALTY_CALLDATA, value: '0x0' \}\)/);
  assert.match(html, /walletRequest\('eth_sendTransaction', \[tx\]\)/);
  assert.equal((html.match(/eth_sendTransaction/g) ?? []).length, 2);
  for (const forbidden of ['setTreasury(address)', 'transferOwnership(address)', 'withdraw()', 'upgradeToAndCall(address,bytes)']) assert.equal(html.includes(forbidden), false);
});

test('simulates, revalidates, and verifies 5% royalty state after receipt', async () => {
  const html = await readPage();
  assert.match(html, /publicRpc\('eth_call', \[tx, 'latest'\]\)/);
  assert.match(html, /const finalState = await readState\(\)/);
  assert.match(html, /if \(!sameAddress\(verified\.royaltyReceiver, SAFE\) \|\| verified\.royaltyAmount !== ROYALTY_ON_ONE_ETH\)/);
  assert.match(html, /waitForReceipt\(hash\)/);
});

test('inline script parses as JavaScript', async () => {
  const html = await readPage();
  const dom = new JSDOM(html);
  assert.doesNotThrow(() => new Function(dom.window.document.scripts[0].textContent));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { toFunctionSelector } from 'viem';

const PAGE_PATH = new URL('../owner-tools/reserve-mint-loopers/index.html', import.meta.url);
const PROXY = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';
const SAFE = '0xfA5c233683E4cE7cA6214E769Ae5F9D9e6Fa4483';
const IMPLEMENTATION = '0x68F22e3563891167D37C86391c4a83449c83e908';
const ADAPTER = '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const RESERVE_SELECTOR = '0xb0ea1802';

const readPage = () => readFile(PAGE_PATH, 'utf8');

test('is a standalone noindex page with one constrained quantity input', async () => {
  const html = await readPage();
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.match(document.querySelector('meta[name="robots"]').content, /noindex/i);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
  assert.equal(document.scripts.length, 1);
  assert.equal(document.querySelectorAll('input').length, 1);
  const quantity = document.querySelector('#quantity');
  assert.equal(quantity.type, 'number');
  assert.equal(quantity.min, '1');
  assert.equal(quantity.max, '40');
  assert.equal(quantity.step, '1');
  assert.equal(quantity.value, '1');
});

test('pins the live owner, proxy, implementation, adapter, registry, and fixed Safe', async () => {
  const html = await readPage();
  for (const value of [
    '8453', '0x2105', PROXY, OWNER, SAFE, IMPLEMENTATION, ADAPTER, REGISTRY,
    '0x0f81bd4EDD4879734361A1A44460264CBf6F94c9',
    '0x7274e874CA62410a93Bd8bf61c69d8045E399c02',
    'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/',
  ]) assert.ok(html.includes(value), `missing pinned value ${value}`);
  assert.match(html, /Destination is immutable/i);
});

test('pins all six production code hashes and the EIP-1967 slot', async () => {
  const html = await readPage();
  for (const value of [
    '6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662',
    '46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec',
    'a0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017',
    '550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be',
    'e3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85',
    '201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1',
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  ]) assert.ok(html.includes(value), `missing production identity ${value}`);
});

test('contains only the reserve-mint owner write surface', async () => {
  const html = await readPage();
  assert.ok(html.includes(RESERVE_SELECTOR));
  assert.match(html, /Object\.freeze\(\{ chainId: CHAIN_HEX, from: EXPECTED_OWNER, to: LIVE_PROXY, data:/);
  assert.match(html, /const expectedKeys = \['chainId','data','from','to','value'\]\.sort\(\)/);
  const forbidden = [
    'withdraw()', 'setTreasury(address)', 'transferOwnership(address)', 'renounceOwnership()',
    'pause()', 'unpause()', 'upgradeToAndCall(address,bytes)', 'transferFrom(address,address,uint256)',
    'safeTransferFrom(address,address,uint256)',
  ];
  for (const signature of forbidden) {
    const selector = toFunctionSelector(signature).toLowerCase();
    assert.equal(html.toLowerCase().includes(selector), false, `forbidden selector for ${signature}`);
  }
  assert.equal((html.match(/eth_sendTransaction/g) ?? []).length, 2, 'send method appears only in the wallet allowlist and one guarded call');
});

test('uses explicit public and wallet RPC method allowlists', async () => {
  const html = await readPage();
  const publicMatch = html.match(/const PUBLIC_RPC_METHODS = Object\.freeze\((\[[^;]+\])\);/);
  const walletMatch = html.match(/const WALLET_METHODS = Object\.freeze\((\[[^;]+\])\);/);
  assert.ok(publicMatch);
  assert.ok(walletMatch);
  const publicMethods = JSON.parse(publicMatch[1].replaceAll("'", '"'));
  const walletMethods = JSON.parse(walletMatch[1].replaceAll("'", '"'));
  assert.deepEqual(publicMethods, ['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt']);
  assert.deepEqual(walletMethods, ['eth_chainId','eth_accounts','eth_requestAccounts','wallet_switchEthereumChain','eth_sendTransaction']);
});

test('verifies exact two-stage ERC-721 delivery and ERC-8004 binding evidence', async () => {
  const html = await readPage();
  for (const topic of [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    '0x817373d73ac355e40750643a2bd4bf273950d1fc30533a38a26d4f980f4c3fcf',
    '0xb8fcb17338a7efdcb1bd0559c53bc7d8564f98be519fd7bc8197390a57f198d8',
  ]) assert.ok(html.includes(topic));
  assert.match(html, /transfers\.length !== Number\(quantity\) \* 2/);
  assert.match(html, /bindings\.length !== Number\(quantity\)/);
  assert.match(html, /verifyTokenState\(evidence/);
});

test('persists ambiguous attempts and clears only explicit wallet rejection or verified outcomes', async () => {
  const html = await readPage();
  assert.ok(html.includes("const ATTEMPT_KEY = 'loopers.reserveMint.8453.v1'"));
  assert.match(html, /status: 'prepared'/);
  assert.match(html, /attempt\.status = 'submitted'/);
  assert.match(html, /attempt\.status = attempt\.hash \? 'submitted' : 'uncertain'/);
  assert.match(html, /error\?\.code === 4001/);
  assert.match(html, /Resume verification/);
});

test('inline script parses as JavaScript', async () => {
  const html = await readPage();
  const dom = new JSDOM(html);
  const source = dom.window.document.scripts[0].textContent;
  assert.doesNotThrow(() => new Function(source));
});

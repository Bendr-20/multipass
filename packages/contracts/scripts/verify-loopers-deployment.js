#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ethers } from 'ethers';

import { CONTRACT_ROOT, compileLoopers } from './lib/loopers-compiler.js';

const args = parseArgs(process.argv.slice(2));
if (!args.config || !args.deployment) {
  console.error('Usage: verify-loopers-deployment.js --config config.json --deployment deployments/base-sepolia.json [--rpc-url URL]');
  process.exit(1);
}

const config = await readJson(await resolveReadablePath(args.config));
const deployment = await readJson(await resolveReadablePath(args.deployment));
const rpcUrl = args.rpcUrl || process.env.LOOPERS_RPC_URL || config.rpc_url;
if (!rpcUrl) throw new Error('Missing RPC URL. Pass --rpc-url, LOOPERS_RPC_URL, or config.rpc_url.');
if (!ethers.isAddress(deployment.address)) throw new Error('Deployment file requires contract address');

const artifact = await compileLoopers();
const provider = new ethers.JsonRpcProvider(rpcUrl, Number(config.chain_id));
const network = await provider.getNetwork();
assertEqual(String(network.chainId), String(config.chain_id), 'chain id');

const contract = new ethers.Contract(deployment.address, artifact.abi, provider);
const checks = [];
await check('name', contract.name(), 'Loopers');
await check('symbol', contract.symbol(), 'LOOPER');
await check('owner', contract.owner(), config.owner);
await check('treasury', contract.treasury(), config.treasury);
await check('MAX_SUPPLY', contract.MAX_SUPPLY(), 7_777n);
await check('TEAM_RESERVE', contract.TEAM_RESERVE(), 337n);
await check('ALLOWLIST_WALLET_LIMIT', contract.ALLOWLIST_WALLET_LIMIT(), 3n);
await check('PUBLIC_WALLET_LIMIT', contract.PUBLIC_WALLET_LIMIT(), 10n);
await check('MAX_ROYALTY_BPS', contract.MAX_ROYALTY_BPS(), 500n);

const royalty = await contract.royaltyInfo(1, ethers.parseEther('1'));
assertAddressEqual(royalty[0], config.treasury, 'royalty receiver');
assertEqual(royalty[1].toString(), ethers.parseEther('0.05').toString(), 'royalty amount at 1 ETH sale');
checks.push('royalty');

const onchainAllowlistStart = await contract.allowlistStart();
if (config.sale?.allowlist_start && onchainAllowlistStart !== 0n) {
  const expected = normalizeSaleConfig(config.sale);
  assertEqual(onchainAllowlistStart.toString(), expected.allowlistStart.toString(), 'allowlistStart');
  checks.push('allowlistStart');
  await check('publicStart', contract.publicStart(), expected.allowlistStart + 86_400n);
  await check('saleEnd', contract.saleEnd(), expected.allowlistStart + 630_427n);
  await check('allowlistPriceWei', contract.allowlistPriceWei(), expected.allowlistPriceWei);
  await check('publicPriceWei', contract.publicPriceWei(), expected.publicPriceWei);
  await check('merkleRoot', contract.merkleRoot(), expected.merkleRoot);
} else if (config.sale?.allowlist_start) {
  checks.push('sale config not set');
}

console.log(JSON.stringify({
  ok: true,
  network: config.network,
  chain_id: Number(config.chain_id),
  address: deployment.address,
  checks,
  note: 'placeholder_token_uri is constructor-only until a token exists; verify by minting a rehearsal token before reveal.',
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') parsed.config = argv[++index];
    else if (arg === '--deployment') parsed.deployment = argv[++index];
    else if (arg === '--rpc-url') parsed.rpcUrl = argv[++index];
  }
  return parsed;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function resolveReadablePath(input) {
  const direct = resolve(input);
  if (await canRead(direct)) return direct;
  const prefix = 'packages/contracts/';
  if (input.startsWith(prefix)) {
    const packageRelative = resolve(CONTRACT_ROOT, input.slice(prefix.length));
    if (await canRead(packageRelative)) return packageRelative;
  }
  return direct;
}

async function canRead(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function check(label, actualPromise, expected) {
  const actual = await actualPromise;
  if (typeof expected === 'string' && ethers.isAddress(expected)) {
    assertAddressEqual(actual, expected, label);
  } else {
    assertEqual(actual.toString(), expected.toString(), label);
  }
  checks.push(label);
}

function assertAddressEqual(actual, expected, label) {
  assertEqual(ethers.getAddress(actual), ethers.getAddress(expected), label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function normalizeSaleConfig(sale = {}) {
  return {
    allowlistStart: parseSaleStart(sale.allowlist_start),
    allowlistPriceWei: parseWei(sale.allowlist_price_wei, 'sale.allowlist_price_wei'),
    publicPriceWei: parseWei(sale.public_price_wei, 'sale.public_price_wei'),
    merkleRoot: sale.merkle_root,
  };
}

function parseSaleStart(value) {
  if (Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return BigInt(Math.floor(timestamp / 1000));
  }
  throw new Error('sale.allowlist_start must be a unix timestamp or ISO date string');
}

function parseWei(value, label) {
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`${label} must be a wei integer string`);
}

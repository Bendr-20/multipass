#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ethers } from 'ethers';

import { CONTRACT_ROOT, compileLoopers } from './lib/loopers-compiler.js';

const args = parseArgs(process.argv.slice(2));
if (!args.config || !args.deployment) {
  console.error('Usage: manage-loopers-sale.js --config config.json --deployment deployment.json [status|open-public|set-public-start --timestamp <unix-or-iso>] [--rpc-url URL]');
  process.exit(1);
}

const action = args.action || 'status';
const config = await readJson(await resolveReadablePath(args.config));
const deployment = await readJson(await resolveReadablePath(args.deployment));
const rpcUrl = args.rpcUrl || process.env.LOOPERS_RPC_URL || config.rpc_url;
if (!rpcUrl) throw new Error('Missing RPC URL. Pass --rpc-url, LOOPERS_RPC_URL, or config.rpc_url.');
if (!ethers.isAddress(deployment.address)) throw new Error('Deployment file requires contract address');

const artifact = await compileLoopers();
const provider = new ethers.JsonRpcProvider(rpcUrl, Number(config.chain_id));
const network = await provider.getNetwork();
if (String(network.chainId) !== String(config.chain_id)) {
  throw new Error(`RPC chain id ${network.chainId} does not match config chain_id ${config.chain_id}`);
}

if (action === 'status') {
  const contract = new ethers.Contract(deployment.address, artifact.abi, provider);
  console.log(JSON.stringify(await readSaleStatus(contract, config), null, 2));
  process.exit(0);
}

const privateKey = process.env.LOOPERS_DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error('Missing LOOPERS_DEPLOYER_PRIVATE_KEY');
const signer = new ethers.NonceManager(new ethers.Wallet(privateKey, provider));
const contract = new ethers.Contract(deployment.address, artifact.abi, signer);

if (action === 'open-public') {
  const tx = await contract.openPublicMint();
  await tx.wait();
  console.log(JSON.stringify({
    ok: true,
    action,
    network: config.network,
    chain_id: Number(config.chain_id),
    address: deployment.address,
    tx_hash: tx.hash,
    status: await readSaleStatus(contract, config),
  }, null, 2));
  process.exit(0);
}

if (action === 'set-public-start') {
  const timestamp = parseTimestamp(args.timestamp);
  const tx = await contract.setPublicStart(timestamp);
  await tx.wait();
  console.log(JSON.stringify({
    ok: true,
    action,
    network: config.network,
    chain_id: Number(config.chain_id),
    address: deployment.address,
    public_start: timestamp.toString(),
    public_start_iso: formatTimestamp(timestamp),
    tx_hash: tx.hash,
    status: await readSaleStatus(contract, config),
  }, null, 2));
  process.exit(0);
}

throw new Error(`Unsupported action: ${action}`);

function parseArgs(argv) {
  const parsed = { action: 'status' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') parsed.config = argv[++index];
    else if (arg === '--deployment') parsed.deployment = argv[++index];
    else if (arg === '--rpc-url') parsed.rpcUrl = argv[++index];
    else if (arg === '--timestamp') parsed.timestamp = argv[++index];
    else if (!arg.startsWith('--')) parsed.action = arg;
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

async function readSaleStatus(contract, config) {
  const [
    saleState,
    allowlistStart,
    publicStart,
    saleEnd,
    allowlistPriceWei,
    publicPriceWei,
    merkleRoot,
    remainingPublicSupply,
    totalMinted,
    publicSupplyClosed,
  ] = await Promise.all([
    contract.saleState(),
    contract.allowlistStart(),
    contract.publicStart(),
    contract.saleEnd(),
    contract.allowlistPriceWei(),
    contract.publicPriceWei(),
    contract.merkleRoot(),
    contract.remainingPublicSupply(),
    contract.totalMinted(),
    contract.publicSupplyClosed(),
  ]);

  return {
    network: config.network,
    chain_id: Number(config.chain_id),
    address: await contract.getAddress(),
    sale_state: formatSaleState(saleState),
    allowlist_start: allowlistStart.toString(),
    allowlist_start_iso: formatTimestamp(allowlistStart),
    public_start: publicStart.toString(),
    public_start_iso: formatTimestamp(publicStart),
    sale_end: saleEnd.toString(),
    sale_end_iso: formatTimestamp(saleEnd),
    allowlist_price_wei: allowlistPriceWei.toString(),
    public_price_wei: publicPriceWei.toString(),
    merkle_root: merkleRoot,
    remaining_public_supply: remainingPublicSupply.toString(),
    total_minted: totalMinted.toString(),
    public_supply_closed: Boolean(publicSupplyClosed),
  };
}

function parseTimestamp(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return BigInt(Math.floor(timestamp / 1000));
  }
  throw new Error('--timestamp must be a unix timestamp or ISO date string');
}

function formatTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function formatSaleState(value) {
  return ['not_started', 'allowlist', 'public', 'ended'][Number(value)] ?? 'unknown';
}

#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ethers } from 'ethers';

import { CONTRACT_ROOT, compileLoopers } from './lib/loopers-compiler.js';

const args = parseArgs(process.argv.slice(2));
if (!args.config) {
  console.error('Usage: deploy-loopers.js --config packages/contracts/config/base-sepolia.example.json [--rpc-url URL] [--output path] [--configure-sale]');
  console.error('Requires LOOPERS_DEPLOYER_PRIVATE_KEY in the environment.');
  process.exit(1);
}

const config = await readJson(await resolveReadablePath(args.config));
const privateKey = process.env.LOOPERS_DEPLOYER_PRIVATE_KEY;
const rpcUrl = args.rpcUrl || process.env.LOOPERS_RPC_URL || config.rpc_url;
if (!privateKey) throw new Error('Missing LOOPERS_DEPLOYER_PRIVATE_KEY');
if (!rpcUrl) throw new Error('Missing RPC URL. Pass --rpc-url, LOOPERS_RPC_URL, or config.rpc_url.');

validateConfig(config, { requireSale: args.configureSale });

const artifact = await compileLoopers();
const provider = new ethers.JsonRpcProvider(rpcUrl, Number(config.chain_id));
const network = await provider.getNetwork();
if (Number(network.chainId) !== Number(config.chain_id)) {
  throw new Error(`RPC chain id ${network.chainId} does not match config chain_id ${config.chain_id}`);
}

const wallet = new ethers.Wallet(privateKey, provider);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(config.owner, config.treasury, config.placeholder_token_uri);
const deployTx = contract.deploymentTransaction();
await contract.waitForDeployment();

const address = await contract.getAddress();
const deployment = {
  schema_version: '0.1.0',
  network: config.network,
  chain_id: Number(config.chain_id),
  contract: 'Loopers',
  address,
  deployer: wallet.address,
  owner: config.owner,
  treasury: config.treasury,
  constructor_args: [
    config.owner,
    config.treasury,
    config.placeholder_token_uri,
  ],
  transactions: {
    deploy: deployTx?.hash ?? null,
    configure_sale: null,
  },
};

if (args.configureSale) {
  if (wallet.address.toLowerCase() !== config.owner.toLowerCase()) {
    throw new Error('--configure-sale requires the deployer key to match config.owner');
  }
  const sale = normalizeSaleConfig(config.sale);
  const tx = await contract.setSaleConfig(
    sale.allowlistStart,
    sale.allowlistPriceWei,
    sale.publicPriceWei,
    sale.merkleRoot,
  );
  await tx.wait();
  deployment.transactions.configure_sale = tx.hash;
}

const outputPath = args.output ? resolve(args.output) : resolve(CONTRACT_ROOT, 'deployments', `${config.network}.json`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(JSON.stringify({
  network: deployment.network,
  chain_id: deployment.chain_id,
  address: deployment.address,
  deploy_tx: deployment.transactions.deploy,
  configure_sale_tx: deployment.transactions.configure_sale,
  deployment: outputPath,
}, null, 2));

function parseArgs(argv) {
  const parsed = { configureSale: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') parsed.config = argv[++index];
    else if (arg === '--rpc-url') parsed.rpcUrl = argv[++index];
    else if (arg === '--output') parsed.output = argv[++index];
    else if (arg === '--configure-sale') parsed.configureSale = true;
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

function validateConfig(config, { requireSale = false } = {}) {
  if (!config.network || !Number.isInteger(Number(config.chain_id))) throw new Error('Config requires network and numeric chain_id');
  for (const key of ['owner', 'treasury']) {
    if (!ethers.isAddress(config[key])) throw new Error(`Config ${key} must be an EVM address`);
  }
  if (!config.placeholder_token_uri || typeof config.placeholder_token_uri !== 'string') {
    throw new Error('Config placeholder_token_uri is required');
  }
  if (requireSale) normalizeSaleConfig(config.sale);
}

function normalizeSaleConfig(sale = {}) {
  const allowlistStart = parseSaleStart(sale.allowlist_start);
  const allowlistPriceWei = parseWei(sale.allowlist_price_wei, 'sale.allowlist_price_wei');
  const publicPriceWei = parseWei(sale.public_price_wei, 'sale.public_price_wei');
  const merkleRoot = sale.merkle_root;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(merkleRoot ?? ''))) throw new Error('sale.merkle_root must be a bytes32 hex string');
  if (allowlistPriceWei <= 0n || publicPriceWei <= 0n || allowlistPriceWei > publicPriceWei) {
    throw new Error('Sale prices must be positive and allowlist must be <= public');
  }
  return { allowlistStart, allowlistPriceWei, publicPriceWei, merkleRoot };
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

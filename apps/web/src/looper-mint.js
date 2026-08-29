import { createPublicClient, encodeFunctionData, formatEther, getAddress, http, isAddress, parseAbi, toHex } from 'viem';
import { base, baseSepolia } from 'viem/chains';

import { getLooperAllowlistProof, normalizeLooperAllowlistAddress } from './looper-allowlist.js';

export const LOOPERS_REHEARSAL_CONTRACT = '0x0a1C0bEd3E25E94046cB5e546164412dB20d4f2b';
export const LOOPERS_MAINNET_TREASURY = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';

export const LOOPERS_MINT_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function saleState() view returns (uint8)',
  'function allowlistStart() view returns (uint64)',
  'function publicStart() view returns (uint64)',
  'function saleEnd() view returns (uint64)',
  'function allowlistPriceWei() view returns (uint256)',
  'function publicPriceWei() view returns (uint256)',
  'function merkleRoot() view returns (bytes32)',
  'function totalMinted() view returns (uint256)',
  'function remainingPublicSupply() view returns (uint256)',
  'function allowlistMintedByWallet(address) view returns (uint256)',
  'function mintedByWallet(address) view returns (uint256)',
  'function allowlistMint(uint256 quantity, bytes32[] proof) payable',
  'function publicMint(uint256 quantity) payable',
]);

const SALE_STATES = ['not_started', 'allowlist', 'public', 'ended'];
const DEFAULT_REHEARSAL_RPC = 'https://base-sepolia-rpc.publicnode.com';
const DEFAULT_MAINNET_RPC = 'https://mainnet.base.org';
const LOOPER_MINT_PATHS = new Set(['/mint', '/mint/', '/multipass/mint', '/multipass/mint/']);

export function getLooperMintConfigFromLocation(locationUrl) {
  const url = toUrl(locationUrl);
  const mode = String(url.searchParams.get('mint') ?? url.searchParams.get('loopers_mint') ?? '').trim().toLowerCase();
  const rehearsalRequested = ['sepolia', 'base-sepolia', 'rehearsal', 'testnet'].includes(mode);
  const mainnetRequested = ['mainnet', 'base'].includes(mode);
  const contractOverride = normalizeOptionalAddress(url.searchParams.get('contract') ?? url.searchParams.get('loopers_contract'));
  const mintRouteRequested = LOOPER_MINT_PATHS.has(url.pathname);

  if (!mintRouteRequested) {
    return { enabled: false };
  }

  if (mainnetRequested || (!rehearsalRequested && !contractOverride)) {
    return {
      enabled: true,
      mode: 'mainnet',
      label: 'Base mainnet',
      chain: base,
      chainId: base.id,
      chainHex: toHex(base.id),
      rpcUrl: url.searchParams.get('rpc') || DEFAULT_MAINNET_RPC,
      contractAddress: contractOverride ?? null,
      explorerBaseUrl: 'https://basescan.org',
    };
  }

  return {
    enabled: true,
    mode: 'rehearsal',
    label: 'Base Sepolia rehearsal',
    chain: baseSepolia,
    chainId: baseSepolia.id,
    chainHex: toHex(baseSepolia.id),
    rpcUrl: url.searchParams.get('rpc') || DEFAULT_REHEARSAL_RPC,
    contractAddress: contractOverride ?? LOOPERS_REHEARSAL_CONTRACT,
    explorerBaseUrl: 'https://sepolia.basescan.org',
  };
}

export function createLooperPublicClient(config) {
  if (!config?.enabled || !config.contractAddress) throw new Error('Loopers mint contract is not configured.');
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

export async function loadLooperMintContractState({
  config,
  address,
  apiBase = '/multipass-api',
  fetchImpl = fetch,
  publicClient = createLooperPublicClient(config),
} = {}) {
  if (!config?.enabled || !config.contractAddress) return { enabled: false };
  const normalizedAddress = normalizeOptionalAddress(address);
  const baseCalls = [
    read(publicClient, config, 'name'),
    read(publicClient, config, 'symbol'),
    read(publicClient, config, 'saleState'),
    read(publicClient, config, 'allowlistStart'),
    read(publicClient, config, 'publicStart'),
    read(publicClient, config, 'saleEnd'),
    read(publicClient, config, 'allowlistPriceWei'),
    read(publicClient, config, 'publicPriceWei'),
    read(publicClient, config, 'merkleRoot'),
    read(publicClient, config, 'totalMinted'),
    read(publicClient, config, 'remainingPublicSupply'),
  ];
  const walletCalls = normalizedAddress ? [
    read(publicClient, config, 'allowlistMintedByWallet', [normalizedAddress]),
    read(publicClient, config, 'mintedByWallet', [normalizedAddress]),
  ] : [Promise.resolve(null), Promise.resolve(null)];

  const [
    name,
    symbol,
    saleStateValue,
    allowlistStart,
    publicStart,
    saleEnd,
    allowlistPriceWei,
    publicPriceWei,
    merkleRoot,
    totalMinted,
    remainingPublicSupply,
    allowlistMintedByWallet,
    mintedByWallet,
  ] = await Promise.all([...baseCalls, ...walletCalls]);

  const saleState = normalizeSaleState(saleStateValue);
  const proof = normalizedAddress && saleState === 'allowlist'
    ? await loadAllowlistProof({ address: normalizedAddress, apiBase, fetchImpl, expectedMerkleRoot: merkleRoot })
    : { status: normalizedAddress ? 'not_required' : 'wallet_required', eligible: false, proof: [] };

  return normalizeLooperMintState({
    enabled: true,
    config,
    address: normalizedAddress,
    name,
    symbol,
    saleState,
    allowlistStart,
    publicStart,
    saleEnd,
    allowlistPriceWei,
    publicPriceWei,
    merkleRoot,
    totalMinted,
    remainingPublicSupply,
    allowlistMintedByWallet,
    mintedByWallet,
    proof,
  });
}

export async function mintLoopers({
  config,
  walletClient,
  quantity = 1,
  apiBase = '/multipass-api',
  fetchImpl = fetch,
  publicClient = createLooperPublicClient(config),
} = {}) {
  if (!config?.enabled || !config.contractAddress) throw new Error('Loopers mint contract is not configured.');
  if (!walletClient?.request) throw new Error('Connected wallet cannot submit transactions.');

  const snapshot = walletClient.getSnapshot?.() ?? {};
  const from = normalizeLooperAllowlistAddress(snapshot.address);
  const mintQuantity = normalizeMintQuantity(quantity);
  await ensureWalletChain({ walletClient, config });

  const contractState = await loadLooperMintContractState({ config, address: from, apiBase, fetchImpl, publicClient });
  const phase = contractState.saleState;
  let data;
  let value;

  if (phase === 'allowlist') {
    ensureMintCapacity(contractState.remainingPublicSupply, mintQuantity, 'Not enough Loopers remain.');
    ensureMintCapacity(contractState.allowlistRemainingForWallet, mintQuantity, 'Wallet allowlist mint cap reached.');
    if (contractState.proof?.status === 'error') {
      throw new Error(contractState.proof.error || 'Allowlist proof is unavailable.');
    }
    if (!contractState.proof?.eligible) throw new Error('This wallet is not eligible for allowlist mint.');
    data = encodeFunctionData({
      abi: LOOPERS_MINT_ABI,
      functionName: 'allowlistMint',
      args: [BigInt(mintQuantity), contractState.proof.proof ?? []],
    });
    value = BigInt(contractState.allowlistPriceWei) * BigInt(mintQuantity);
  } else if (phase === 'public') {
    ensureMintCapacity(contractState.remainingPublicSupply, mintQuantity, 'Not enough Loopers remain.');
    ensureMintCapacity(contractState.publicRemainingForWallet, mintQuantity, 'Wallet public mint cap reached.');
    data = encodeFunctionData({
      abi: LOOPERS_MINT_ABI,
      functionName: 'publicMint',
      args: [BigInt(mintQuantity)],
    });
    value = BigInt(contractState.publicPriceWei) * BigInt(mintQuantity);
  } else {
    throw new Error(`Mint is ${formatSaleState(phase).toLowerCase()}.`);
  }

  const hash = await walletClient.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: config.contractAddress, value: toHex(value), data }],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Mint transaction reverted.');
  return {
    hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber?.toString?.() ?? null,
    quantity: mintQuantity,
  };
}

export function normalizeMintQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error('Choose a mint quantity from 1 to 10.');
  }
  return quantity;
}

export function formatSaleState(value) {
  return {
    not_started: 'Not started',
    allowlist: 'Allowlist',
    public: 'Public',
    ended: 'Ended',
  }[String(value)] ?? 'Unknown';
}

export function formatEthFromWei(value) {
  try {
    return `${trimEth(formatEther(BigInt(value ?? 0)))} ETH`;
  } catch {
    return '0 ETH';
  }
}

export function formatMintTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Not set';
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getMintPhasePrice(state = {}) {
  if (state.saleState === 'allowlist') return state.allowlistPriceWei;
  if (state.saleState === 'public') return state.publicPriceWei;
  return 0n;
}

function normalizeLooperMintState(input) {
  const allowlistMinted = bigintOrNull(input.allowlistMintedByWallet);
  const minted = bigintOrNull(input.mintedByWallet);
  return {
    enabled: true,
    config: input.config,
    address: input.address,
    name: String(input.name ?? 'Loopers'),
    symbol: String(input.symbol ?? 'LOOPER'),
    saleState: input.saleState,
    allowlistStart: BigInt(input.allowlistStart ?? 0),
    publicStart: BigInt(input.publicStart ?? 0),
    saleEnd: BigInt(input.saleEnd ?? 0),
    allowlistPriceWei: BigInt(input.allowlistPriceWei ?? 0),
    publicPriceWei: BigInt(input.publicPriceWei ?? 0),
    merkleRoot: String(input.merkleRoot ?? ''),
    totalMinted: BigInt(input.totalMinted ?? 0),
    remainingPublicSupply: BigInt(input.remainingPublicSupply ?? 0),
    allowlistMintedByWallet: allowlistMinted,
    mintedByWallet: minted,
    allowlistRemainingForWallet: allowlistMinted === null ? null : maxBigInt(0n, 3n - allowlistMinted),
    publicRemainingForWallet: minted === null ? null : maxBigInt(0n, 10n - minted),
    proof: input.proof,
  };
}

async function loadAllowlistProof({ address, apiBase, fetchImpl, expectedMerkleRoot }) {
  try {
    const proof = await getLooperAllowlistProof({ address, apiBase, fetchImpl });
    if (!sameHex(proof.merkle_root, expectedMerkleRoot)) {
      throw new Error('Proof snapshot does not match the mint contract.');
    }
    return { status: 'loaded', eligible: Boolean(proof.eligible), proof: Array.isArray(proof.proof) ? proof.proof : [], response: proof };
  } catch (error) {
    return { status: 'error', eligible: false, proof: [], error: error.message };
  }
}

async function ensureWalletChain({ walletClient, config }) {
  const chainId = await walletClient.request({ method: 'eth_chainId' });
  if (String(chainId).toLowerCase() === config.chainHex.toLowerCase()) return;

  try {
    await walletClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.chainHex }] });
  } catch (error) {
    if (error?.code !== 4902 && error?.code !== '4902') throw error;
    await walletClient.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: config.chainHex,
        chainName: config.chain.name,
        nativeCurrency: config.chain.nativeCurrency,
        rpcUrls: [config.rpcUrl],
        blockExplorerUrls: [config.explorerBaseUrl],
      }],
    });
  }
}

function read(publicClient, config, functionName, args = []) {
  return publicClient.readContract({
    address: config.contractAddress,
    abi: LOOPERS_MINT_ABI,
    functionName,
    args,
  });
}

function normalizeSaleState(value) {
  return SALE_STATES[Number(value)] ?? 'unknown';
}

function normalizeOptionalAddress(value) {
  const raw = String(value ?? '').trim();
  return isAddress(raw) ? getAddress(raw) : null;
}

function bigintOrNull(value) {
  if (value == null) return null;
  return BigInt(value);
}

function maxBigInt(left, right) {
  return left > right ? left : right;
}

function sameHex(left, right) {
  return String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();
}

function ensureMintCapacity(remaining, quantity, message) {
  if (remaining !== null && remaining !== undefined && BigInt(remaining) < BigInt(quantity)) {
    throw new Error(message);
  }
}

function trimEth(value) {
  return value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

function toUrl(value) {
  if (value instanceof URL) return value;
  try {
    return new URL(String(value ?? 'https://helixa.xyz/allowlist'));
  } catch {
    return new URL('https://helixa.xyz/allowlist');
  }
}

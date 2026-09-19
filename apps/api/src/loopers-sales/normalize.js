import { isIP } from 'node:net';

const BASE_CHAIN = 'base';
const BASE_NATIVE_ETH = '0x0000000000000000000000000000000000000000';
const BASE_WETH = '0x4200000000000000000000000000000000000006';
const MAX_FUTURE_SECONDS = 5 * 60;
const MAX_UINT256 = (2n ** 256n) - 1n;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const TOKEN_ID_PATTERN = /^(?:0|[1-9]\d*|0+\d+)$/;
const PAYMENT_QUANTITY_PATTERN = /^[0-9]{1,96}$/;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

export function normalizeRestSale(event, config = {}) {
  if (!event || event.event_type !== 'sale' || normalizeChain(event.chain) !== BASE_CHAIN) return null;

  const contract = normalizeAddress(event.nft?.contract);
  const expectedContract = normalizeExpectedContract(config);
  if (!contract || !expectedContract || contract !== expectedContract) return null;

  return normalizeSale({
    transactionHash: event.transaction,
    orderHash: event.order_hash,
    eventTimestamp: normalizeEventTimestamp(event.event_timestamp, {
      source: 'rest',
      nowSeconds: config.nowSeconds,
    }),
    tokenId: event.nft?.identifier,
    tokenName: event.nft?.name,
    imageUrl: event.nft?.display_image_url,
    seller: event.seller,
    buyer: event.buyer,
    quantity: event.quantity,
    paymentQuantityRaw: event.payment?.quantity,
    paymentDecimals: event.payment?.decimals,
    paymentSymbol: event.payment?.symbol,
    paymentTokenAddress: event.payment?.token_address,
  });
}

export function normalizeStreamSale(event, config = {}) {
  if (!event || event.event_type !== 'item_sold') return null;

  const nftId = parseStreamNftId(event.payload?.item?.nft_id);
  const expectedContract = normalizeExpectedContract(config);
  if (!nftId || nftId.chain !== BASE_CHAIN || !expectedContract || nftId.contract !== expectedContract) return null;

  return normalizeSale({
    transactionHash: event.payload?.transaction?.hash,
    orderHash: event.payload?.order_hash,
    eventTimestamp: normalizeEventTimestamp(event.payload?.event_timestamp, {
      source: 'stream',
      nowSeconds: config.nowSeconds,
    }),
    tokenId: nftId.tokenId,
    tokenName: event.payload?.item?.metadata?.name,
    imageUrl: event.payload?.item?.metadata?.image_url,
    seller: event.payload?.maker?.address,
    buyer: event.payload?.taker?.address,
    quantity: event.payload?.quantity,
    paymentQuantityRaw: event.payload?.sale_price,
    paymentDecimals: event.payload?.payment_token?.decimals,
    paymentSymbol: event.payload?.payment_token?.symbol,
    paymentTokenAddress: event.payload?.payment_token?.address,
  });
}

export function normalizeEventTimestamp(value, { source, nowSeconds } = {}) {
  let timestamp;
  if (source === 'rest') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    timestamp = value;
  } else if (source === 'stream') {
    if (typeof value !== 'string') return null;
    const match = RFC3339_PATTERN.exec(value);
    if (!match || !hasValidDateParts(match)) return null;
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
    timestamp = Math.floor(milliseconds / 1000);
    if (timestamp <= 0) return null;
  } else {
    return null;
  }

  const now = nowSeconds === undefined ? Math.floor(Date.now() / 1000) : nowSeconds;
  if (!Number.isSafeInteger(now) || now < 0 || timestamp > now + MAX_FUTURE_SECONDS) return null;
  return timestamp;
}

export function canonicalSaleId(transactionHash, tokenId) {
  const hash = normalizeHash(transactionHash);
  const id = normalizeTokenId(tokenId);
  return hash && id !== null ? `${hash}:${id}` : null;
}

export function classifyPaymentFamily({ tokenAddress, symbol } = {}) {
  const address = normalizeAddress(tokenAddress);
  const normalizedSymbol = normalizeSymbol(symbol);
  if (address === BASE_NATIVE_ETH && normalizedSymbol === 'ETH') return 'base-eth';
  if (address === BASE_WETH && normalizedSymbol === 'WETH') return 'base-eth';
  return null;
}

export function buildOpenSeaItemUrl({ chain, contract, tokenId } = {}) {
  if (normalizeChain(chain) !== BASE_CHAIN) return null;
  const normalizedContract = normalizeAddress(contract);
  const normalizedTokenId = normalizeTokenId(tokenId);
  if (!normalizedContract || normalizedTokenId === null) return null;
  return `https://opensea.io/assets/base/${normalizedContract}/${normalizedTokenId}`;
}

export function buildBasescanTxUrl(transactionHash) {
  const hash = normalizeHash(transactionHash);
  return hash ? `https://basescan.org/tx/${hash}` : null;
}

export function isTrustedImageUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
  const hostname = parsed.hostname;
  if (!hostname || hostname !== hostname.toLowerCase() || hostname.endsWith('.') || isIP(hostname) !== 0) return false;
  if (hostname.split('.').some((label) => label.startsWith('xn--'))) return false;
  return hostname === 'helixa.xyz' || (hostname.endsWith('.seadn.io') && hostname.length > '.seadn.io'.length);
}

function normalizeSale(input) {
  const transactionHash = normalizeHash(input.transactionHash);
  const orderHash = input.orderHash == null ? null : normalizeHash(input.orderHash);
  const tokenId = normalizeTokenId(input.tokenId);
  const paymentQuantityRaw = normalizePaymentQuantity(input.paymentQuantityRaw);
  const paymentDecimals = normalizePaymentDecimals(input.paymentDecimals);
  const paymentSymbol = normalizeSymbol(input.paymentSymbol);
  const paymentTokenAddress = normalizeAddress(input.paymentTokenAddress);

  if (!transactionHash || (input.orderHash != null && !orderHash) || input.eventTimestamp === null) return null;
  if (tokenId === null || input.quantity !== 1) return null;
  if (!paymentQuantityRaw || paymentDecimals === null || !paymentSymbol || !paymentTokenAddress) return null;

  return {
    id: `${transactionHash}:${tokenId}`,
    transactionHash,
    orderHash,
    eventTimestamp: input.eventTimestamp,
    tokenId,
    tokenName: normalizeTokenName(input.tokenName, tokenId),
    imageUrl: isTrustedImageUrl(input.imageUrl) ? input.imageUrl : null,
    seller: normalizeAddress(input.seller),
    buyer: normalizeAddress(input.buyer),
    quantity: 1,
    paymentQuantityRaw,
    paymentDecimals,
    paymentSymbol,
    paymentTokenAddress,
  };
}

function normalizeExpectedContract(config) {
  return normalizeAddress(config.expectedContract ?? config.contract);
}

function normalizeChain(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function normalizeAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizeHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizeTokenId(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  const text = String(value);
  if (!TOKEN_ID_PATTERN.test(text)) return null;
  try {
    const tokenId = BigInt(text);
    return tokenId <= MAX_UINT256 ? tokenId.toString() : null;
  } catch {
    return null;
  }
}

function normalizePaymentQuantity(value) {
  if (typeof value !== 'string' || !PAYMENT_QUANTITY_PATTERN.test(value)) return null;
  if (value.length > 1 && value.startsWith('0')) return null;
  return BigInt(value) > 0n ? value : null;
}

function normalizePaymentDecimals(value) {
  return Number.isInteger(value) && value >= 0 && value <= 36 ? value : null;
}

function normalizeSymbol(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase();
  return symbol && symbol.length <= 32 ? symbol : null;
}

function normalizeTokenName(value, tokenId) {
  if (typeof value !== 'string') return `Looper #${tokenId}`;
  const name = value.trim();
  return name ? name.slice(0, 256) : `Looper #${tokenId}`;
}

function parseStreamNftId(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const chain = normalizeChain(parts[0]);
  const contract = normalizeAddress(parts[1]);
  const tokenId = normalizeTokenId(parts[2]);
  return chain && contract && tokenId !== null ? { chain, contract, tokenId } : null;
}

function hasValidDateParts(match) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;

  const zone = match[8];
  if (zone !== 'Z') {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return true;
}

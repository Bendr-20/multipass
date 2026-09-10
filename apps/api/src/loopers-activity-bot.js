import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RESERVOIR_BASE_URL = 'https://api-base.reservoir.tools';
const DEFAULT_EXPLORER_TX_BASE_URL = 'https://basescan.org/tx/';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_STATE_PATH = '/var/lib/multipass/loopers-activity-seen.json';
const DEFAULT_TOKEN_BASE_URL = 'https://helixa.xyz/multipass/loopers/';

export function parseLoopersActivityBotOptions(argv = [], env = process.env) {
  const options = {
    contract: env.LOOPERS_ACTIVITY_CONTRACT || env.LOOPERS_CONTRACT_ADDRESS || '',
    telegramBotToken: env.LOOPERS_ACTIVITY_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.LOOPERS_ACTIVITY_TELEGRAM_CHAT_ID || '',
    reservoirApiKey: env.LOOPERS_ACTIVITY_RESERVOIR_API_KEY || env.RESERVOIR_API_KEY || '',
    reservoirApiBaseUrl: normalizeBaseUrl(env.LOOPERS_ACTIVITY_RESERVOIR_API_BASE_URL || DEFAULT_RESERVOIR_BASE_URL),
    explorerTxBaseUrl: env.LOOPERS_ACTIVITY_EXPLORER_TX_BASE_URL || DEFAULT_EXPLORER_TX_BASE_URL,
    tokenBaseUrl: env.LOOPERS_ACTIVITY_TOKEN_BASE_URL || DEFAULT_TOKEN_BASE_URL,
    statePath: env.LOOPERS_ACTIVITY_STATE_PATH || DEFAULT_STATE_PATH,
    pollIntervalMs: parsePositiveInteger(env.LOOPERS_ACTIVITY_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS, 'LOOPERS_ACTIVITY_POLL_INTERVAL_MS'),
    once: parseBoolean(env.LOOPERS_ACTIVITY_ONCE) ?? false,
    dryRun: parseBoolean(env.LOOPERS_ACTIVITY_DRY_RUN) ?? false,
    sendImages: parseBoolean(env.LOOPERS_ACTIVITY_SEND_IMAGES) ?? true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contract') options.contract = argv[++index] || '';
    else if (arg === '--telegram-bot-token') options.telegramBotToken = argv[++index] || '';
    else if (arg === '--telegram-chat-id') options.telegramChatId = argv[++index] || '';
    else if (arg === '--reservoir-api-key') options.reservoirApiKey = argv[++index] || '';
    else if (arg === '--reservoir-api-base-url') options.reservoirApiBaseUrl = normalizeBaseUrl(argv[++index] || DEFAULT_RESERVOIR_BASE_URL);
    else if (arg === '--explorer-tx-base-url') options.explorerTxBaseUrl = argv[++index] || '';
    else if (arg === '--token-base-url') options.tokenBaseUrl = argv[++index] || '';
    else if (arg === '--state-path') options.statePath = argv[++index] || '';
    else if (arg === '--poll-interval-ms') options.pollIntervalMs = parsePositiveInteger(argv[++index], DEFAULT_POLL_INTERVAL_MS, '--poll-interval-ms');
    else if (arg === '--once') options.once = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-images') options.sendImages = false;
    else if (arg === '--help') options.help = true;
  }

  return options;
}

export async function runLoopersActivityBot(options = {}) {
  validateRequiredOptions(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const seenStore = options.seenStore ?? await createJsonSeenStore({ statePath: options.statePath });

  let keepRunning = true;
  while (keepRunning) {
    const result = await pollLoopersActivity({ ...options, seenStore, fetchImpl });
    if (options.once) return result;
    await sleep(options.pollIntervalMs);
  }
}

export async function pollLoopersActivity(options) {
  const sales = await fetchReservoirSales({
    fetchImpl: options.fetchImpl ?? fetch,
    apiBaseUrl: options.reservoirApiBaseUrl,
    apiKey: options.reservoirApiKey,
    contract: options.contract,
  });
  const activities = sales
    .map((sale) => normalizeReservoirSale(sale, {
      expectedContract: options.contract,
      explorerTxBaseUrl: options.explorerTxBaseUrl,
      tokenBaseUrl: options.tokenBaseUrl,
    }))
    .filter(Boolean)
    .sort(compareActivityAscending);

  const posted = [];
  for (const activity of activities) {
    if (options.seenStore.has(activity.id)) continue;
    if (options.dryRun) {
      posted.push({ activity, message: formatTelegramActivityMessage(activity) });
    } else {
      await sendTelegramActivity({
        fetchImpl: options.fetchImpl ?? fetch,
        botToken: options.telegramBotToken,
        chatId: options.telegramChatId,
        activity,
        sendImages: options.sendImages,
      });
      posted.push({ activity });
    }
    options.seenStore.mark(activity.id);
  }
  await options.seenStore.save();
  return { checked: activities.length, posted: posted.length, postedActivities: posted };
}

export async function fetchReservoirSales({ fetchImpl = fetch, apiBaseUrl, apiKey, contract }) {
  const url = new URL('/sales/v6', normalizeBaseUrl(apiBaseUrl));
  url.searchParams.set('contract', contract);
  url.searchParams.set('limit', '20');
  url.searchParams.set('sortBy', 'time');
  url.searchParams.set('includeTokenMetadata', 'true');

  const headers = { accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`Reservoir sales request failed: ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body.sales) ? body.sales : [];
}

export function normalizeReservoirSale(sale, {
  expectedContract = '',
  explorerTxBaseUrl = DEFAULT_EXPLORER_TX_BASE_URL,
  tokenBaseUrl = DEFAULT_TOKEN_BASE_URL,
} = {}) {
  const contract = String(sale?.token?.contract ?? sale?.contract ?? '').toLowerCase();
  if (expectedContract && contract !== String(expectedContract).toLowerCase()) return null;

  const tokenId = String(sale?.token?.tokenId ?? sale?.tokenId ?? '').trim();
  const txHash = String(sale?.txHash ?? sale?.transactionHash ?? sale?.tx_hash ?? '').trim();
  if (!tokenId || !txHash) return null;

  const id = String(sale?.id ?? `${txHash}:${tokenId}:${sale?.logIndex ?? sale?.orderSide ?? 'sale'}`).trim();
  const timestamp = Number(sale?.timestamp ?? sale?.createdAt ?? 0);
  const tokenName = normalizeText(sale?.token?.name) || `Looper #${tokenId}`;
  const marketplace = normalizeText(sale?.orderSource?.name) || normalizeText(sale?.source?.name) || 'Marketplace';
  const seller = normalizeText(sale?.from) || normalizeText(sale?.seller);
  const buyer = normalizeText(sale?.to) || normalizeText(sale?.buyer);
  const imageUrl = normalizeHttpsUrl(sale?.token?.image) || normalizeHttpsUrl(sale?.token?.imageSmall);

  return {
    id,
    kind: 'sale',
    tokenId,
    tokenName,
    imageUrl,
    seller,
    buyer,
    priceText: formatReservoirPrice(sale?.price),
    marketplace,
    txHash,
    txUrl: joinUrl(explorerTxBaseUrl, txHash),
    tokenUrl: joinUrl(tokenBaseUrl, tokenId),
    occurredAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
  };
}

export function formatTelegramActivityMessage(activity) {
  const lines = [
    'Looper sale',
    escapeTelegramHtml(activity.tokenName || `Looper #${activity.tokenId}`),
  ];
  if (activity.priceText) lines.push(`Price: ${escapeTelegramHtml(activity.priceText)}`);
  if (activity.marketplace) lines.push(`Marketplace: ${escapeTelegramHtml(activity.marketplace)}`);
  if (activity.seller) lines.push(`From: ${escapeTelegramHtml(shortAddress(activity.seller))}`);
  if (activity.buyer) lines.push(`To: ${escapeTelegramHtml(shortAddress(activity.buyer))}`);

  const links = [];
  if (activity.tokenUrl) links.push(`<a href="${escapeTelegramAttribute(activity.tokenUrl)}">View Looper</a>`);
  if (activity.txUrl) links.push(`<a href="${escapeTelegramAttribute(activity.txUrl)}">Tx</a>`);
  if (links.length) lines.push(links.join(' | '));

  return lines.join('\n');
}

export async function sendTelegramActivity({
  fetchImpl = fetch,
  botToken,
  chatId,
  activity,
  sendImages = true,
}) {
  const caption = formatTelegramActivityMessage(activity);
  if (sendImages && activity.imageUrl) {
    const photoResponse = await sendTelegramRequest({
      fetchImpl,
      botToken,
      method: 'sendPhoto',
      payload: {
        chat_id: chatId,
        photo: activity.imageUrl,
        caption,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      },
    });
    if (photoResponse.ok) return photoResponse;
  }

  return sendTelegramRequest({
    fetchImpl,
    botToken,
    method: 'sendMessage',
    payload: {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
  });
}

export async function sendTelegramRequest({ fetchImpl = fetch, botToken, method, payload }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status}`);
  }
  return response.json();
}

export async function createJsonSeenStore({ statePath = DEFAULT_STATE_PATH } = {}) {
  const seen = new Set();
  try {
    const body = JSON.parse(await readFile(statePath, 'utf8'));
    for (const id of Array.isArray(body.seen) ? body.seen : []) seen.add(String(id));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    has: (id) => seen.has(String(id)),
    mark: (id) => seen.add(String(id)),
    save: async () => {
      await mkdir(path.dirname(statePath), { recursive: true });
      await writeFile(statePath, `${JSON.stringify({
        schema_version: '0.1.0',
        updated_at: new Date().toISOString(),
        seen: [...seen].slice(-5_000),
      }, null, 2)}\n`, 'utf8');
    },
  };
}

function validateRequiredOptions(options) {
  const missing = [];
  if (!options.contract) missing.push('LOOPERS_ACTIVITY_CONTRACT');
  if (!options.dryRun && !options.telegramBotToken) missing.push('LOOPERS_ACTIVITY_TELEGRAM_BOT_TOKEN');
  if (!options.dryRun && !options.telegramChatId) missing.push('LOOPERS_ACTIVITY_TELEGRAM_CHAT_ID');
  if (missing.length) throw new Error(`Missing required Loopers activity bot config: ${missing.join(', ')}`);
}

function compareActivityAscending(left, right) {
  return String(left.occurredAt ?? '').localeCompare(String(right.occurredAt ?? ''))
    || String(left.id).localeCompare(String(right.id));
}

function formatReservoirPrice(price) {
  const native = Number(price?.amount?.native ?? price?.amount?.decimal ?? price?.amount?.raw);
  const symbol = normalizeText(price?.currency?.symbol) || 'ETH';
  const usd = Number(price?.amount?.usd);
  if (!Number.isFinite(native) || native <= 0) return '';
  const nativeText = Number.isInteger(native) ? String(native) : native.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (Number.isFinite(usd) && usd > 0) return `${nativeText} ${symbol} ($${usd.toFixed(2)})`;
  return `${nativeText} ${symbol}`;
}

function shortAddress(value) {
  const address = String(value ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function joinUrl(base, suffix) {
  if (!base || !suffix) return '';
  return `${String(base).replace(/\/+$/, '')}/${String(suffix).replace(/^\/+/, '')}`;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_RESERVOIR_BASE_URL).replace(/\/+$/, '');
}

function parsePositiveInteger(value, fallback, source) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid positive integer for ${source}: ${value}`);
  return parsed;
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())) return false;
  return null;
}

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeTelegramAttribute(value) {
  return escapeTelegramHtml(value).replaceAll('"', '&quot;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

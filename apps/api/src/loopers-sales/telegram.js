import {
  averageRational,
  formatPercentOverFloor,
  formatRatio,
  formatRational,
  isAverageAtOrAboveThreshold,
  parsePaymentAmount,
  ratioRational,
  sumRationals,
} from './money.js';
import { isTrustedImageUrl } from './normalize.js';

export const LOOPERS_LOGO_URL = 'https://helixa.xyz/multipass/loopers-logo.png';

const MAX_CAPTION_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;
const MAX_RETRY_ATTEMPTS = 3;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function boundedText(value, maxCharacters = 180) {
  const characters = [...String(value ?? '')];
  if (characters.length <= maxCharacters) return characters.join('');
  return `${characters.slice(0, Math.max(0, maxCharacters - 1)).join('')}…`;
}

function shortAddress(value) {
  const address = String(value ?? '');
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function compareTokenIds(left, right) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return left.localeCompare(right);
}

function tokenSummary(items, maxShown = 16) {
  const ids = [...new Set(items.map((entry) => String(entry.tokenId)))].sort(compareTokenIds);
  const shown = ids.slice(0, maxShown).map((id) => `#${boundedText(id, 40)}`);
  if (ids.length > maxShown) shown.push(`… +${ids.length - maxShown} more`);
  return shown.join(', ');
}

function exactPayment(item) {
  return parsePaymentAmount({
    quantity: item.paymentQuantityRaw,
    decimals: item.paymentDecimals,
  });
}

function floorValue(snapshot) {
  const value = snapshot?.value ?? snapshot?.amount ?? snapshot?.floor ?? null;
  if (!value || typeof value.numerator !== 'bigint') return null;
  const scale = value.scale ?? value.denominator;
  if (typeof scale !== 'bigint' || scale <= 0n || value.numerator <= 0n) return null;
  return { numerator: value.numerator, scale };
}

function paymentGroups(items) {
  const groups = new Map();
  for (const entry of items) {
    const symbol = String(entry.paymentSymbol || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const family = entry.paymentFamily || null;
    const key = family ? `family:${family}` : `asset:${String(entry.paymentTokenAddress || '')}:${symbol}`;
    const current = groups.get(key) ?? { family, symbol, values: [] };
    current.values.push(exactPayment(entry));
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({ ...group, total: sumRationals(group.values) }));
}

function compatibleFloor(floorSnapshot, paymentGroup) {
  const floor = floorValue(floorSnapshot);
  if (!floor || floorSnapshot?.fresh === false || !paymentGroup?.family) return null;
  const floorFamily = floorSnapshot.paymentFamily ?? floorSnapshot.family ?? 'base-eth';
  if (floorFamily !== paymentGroup.family) return null;
  return floor;
}

function safeLink(url, label) {
  const value = String(url ?? '');
  if (!value.startsWith('https://') || value.length > 700) return null;
  return `<a href="${escapeHtml(value)}">${escapeHtml(label)}</a>`;
}

function renderLines(group, { floorSnapshot, multiplier }, { concise = false } = {}) {
  const items = Array.isArray(group?.items) ? group.items : [];
  if (items.length === 0) throw new TypeError('Sale group must contain at least one item');

  const groups = paymentGroups(items);
  const oneCurrency = groups.length === 1;
  const paymentGroup = oneCurrency ? groups[0] : null;
  const floor = compatibleFloor(floorSnapshot, paymentGroup);
  const total = paymentGroup?.total ?? null;
  const itemCount = BigInt(items.length);
  const average = total ? averageRational(total, itemCount) : null;
  const premium = Boolean(floor && multiplier && isAverageAtOrAboveThreshold({
    total,
    itemCount,
    floor,
    multiplier,
  }));
  const sweep = items.length > 1;
  const heading = premium
    ? `🔥 ABOVE-FLOOR LOOPER ${sweep ? 'SWEEP' : 'SALE'} 🔥`
    : sweep ? 'Looper sweep' : 'Looper sold';
  const lines = [`<b>${heading}</b>`];

  if (sweep) {
    lines.push(`Loopers: ${items.length} (${escapeHtml(tokenSummary(items, concise ? 8 : 16))})`);
    if (oneCurrency) {
      lines.push(`Total: ${formatRational(total, { maxFractionDigits: 8 })} ${escapeHtml(paymentGroup.symbol)}`);
      lines.push(`Average: ${formatRational(average, { maxFractionDigits: 8 })} ${escapeHtml(paymentGroup.symbol)}`);
    } else {
      const totals = groups.map((entry) => `${formatRational(entry.total, { maxFractionDigits: 8 })} ${boundedText(entry.symbol, 20)}`);
      lines.push(`Totals: ${escapeHtml(totals.join('; '))}`);
    }
  } else {
    const sale = items[0];
    lines.push(escapeHtml(boundedText(sale.tokenName || `Looper #${sale.tokenId}`, concise ? 80 : 180)));
    lines.push(`Price: ${formatRational(total, { maxFractionDigits: 8 })} ${escapeHtml(paymentGroup.symbol)}`);
  }

  if (floor) {
    const floorSymbol = String(floorSnapshot?.symbol || paymentGroup.symbol).trim().toUpperCase();
    lines.push(`Floor: ${formatRational(floor, { maxFractionDigits: 8 })} ${escapeHtml(boundedText(floorSymbol, 20))}`);
    if (premium) {
      const ratio = ratioRational(average, floor);
      lines.push(`Multiplier: ${formatRatio(ratio, { fractionDigits: 2 })} floor`);
      lines.push(`Above floor: ${formatPercentOverFloor(ratio, { fractionDigits: 1 })}`);
    }
  }

  lines.push('Marketplace: OpenSea');
  if (!sweep && !concise) {
    lines.push(`Seller: ${escapeHtml(shortAddress(items[0].seller))}`);
    lines.push(`Buyer: ${escapeHtml(shortAddress(items[0].buyer))}`);
  }

  const first = items[0];
  const openSeaUrl = sweep
    ? group.openSeaCollectionUrl ?? group.collectionUrl ?? first.openSeaCollectionUrl
    : first.openSeaUrl ?? first.itemUrl;
  const transactionUrl = group.transactionUrl ?? first.transactionUrl;
  const links = [safeLink(openSeaUrl, sweep ? 'View collection' : 'View Looper'), safeLink(transactionUrl, 'Basescan')].filter(Boolean);
  if (links.length) lines.push(links.join(' · '));

  return { lines, premium };
}

function fitLines(lines, limit) {
  const accepted = [];
  let length = 0;
  for (const line of lines) {
    const separator = accepted.length ? 1 : 0;
    if (length + separator + line.length <= limit) {
      accepted.push(line);
      length += separator + line.length;
    }
  }
  return accepted.join('\n');
}

export function renderSaleCard(group, options = {}) {
  const full = renderLines(group, options);
  const concise = renderLines(group, options, { concise: true });
  let caption = fitLines(full.lines, MAX_CAPTION_LENGTH);
  const conciseCaption = fitLines(concise.lines, MAX_CAPTION_LENGTH);
  if (caption.length > MAX_CAPTION_LENGTH || caption.split('\n').length < 2) caption = conciseCaption;
  const text = fitLines(full.lines, MAX_TEXT_LENGTH);
  const conciseText = fitLines(concise.lines, MAX_TEXT_LENGTH);
  const candidate = group.items.find((entry) => isTrustedImageUrl(entry.imageUrl))?.imageUrl ?? null;

  return {
    caption,
    conciseCaption,
    text,
    conciseText,
    imageUrl: candidate,
    fallbackImageUrl: LOOPERS_LOGO_URL,
    premium: full.premium,
  };
}

function normalizedDescription(description) {
  return String(description ?? '').toLowerCase();
}

export function classifyTelegramError({ status = 0, description = '', parameters = {} } = {}) {
  const detail = normalizedDescription(description);
  if (detail.includes('message is not modified')) return { kind: 'not-modified' };
  if (detail.includes('message to edit not found') || detail.includes("message can't be edited") || detail.includes('message can\'t be edited')) {
    return { kind: 'unresolved-edit' };
  }
  if (status === 401 || status === 403 || detail.includes('chat not found') || detail.includes('bot was kicked') || detail.includes('not enough rights') || detail.includes('insufficient rights')) {
    return { kind: 'fatal' };
  }
  if (status === 429) {
    const raw = parameters?.retry_after;
    const seconds = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(60, Math.trunc(Number(raw)))) : undefined;
    return seconds === undefined ? { kind: 'retryable' } : { kind: 'retryable', retryAfterSeconds: seconds };
  }
  if (status >= 500 || status === 0) return { kind: 'retryable' };
  if (status === 400 && (
    detail.includes('failed to get http url content') ||
    detail.includes('wrong file identifier') ||
    detail.includes('wrong type of the web page content') ||
    detail.includes('failed to get http url') ||
    detail.includes('photo should be uploaded')
  )) return { kind: 'media' };
  if (status === 400 && (
    detail.includes('parse entities') ||
    detail.includes('caption is too long') ||
    detail.includes('message is too long') ||
    detail.includes('entity')
  )) return { kind: 'content' };
  return { kind: 'retryable' };
}

class TelegramDeliveryError extends Error {
  constructor(classification) {
    super(`Telegram request failed (${classification.kind})`);
    this.name = 'TelegramDeliveryError';
    this.classification = classification;
  }
}

function sleep(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function telegramRequest({ fetchImpl, botToken, method, payload }) {
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new TelegramDeliveryError({ kind: 'retryable' });
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (response.ok && body?.ok === true) return body.result;
  throw new TelegramDeliveryError(classifyTelegramError({
    status: response.status,
    description: body?.description,
    parameters: body?.parameters,
  }));
}

async function requestWithRetries(args) {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await telegramRequest(args);
    } catch (error) {
      const classification = error?.classification;
      if (classification?.kind !== 'retryable' || attempt === MAX_RETRY_ATTEMPTS - 1) throw error;
      const retryAfter = classification.retryAfterSeconds;
      const delayMs = retryAfter === undefined ? 0 : retryAfter * 1000;
      await sleep(delayMs);
    }
  }
  throw new TelegramDeliveryError({ kind: 'retryable' });
}

function messageIdFrom(result) {
  const messageId = result?.message_id;
  if (!Number.isInteger(messageId)) throw new TelegramDeliveryError({ kind: 'retryable' });
  return messageId;
}

export async function sendSaleCard({ fetchImpl = fetch, botToken, chatId, card }) {
  const photos = [...new Set([card.imageUrl, card.fallbackImageUrl ?? LOOPERS_LOGO_URL].filter(Boolean))];
  photoFallbacks: for (const photo of photos) {
    const captions = [...new Set([card.caption, card.conciseCaption].filter(Boolean))];
    for (let index = 0; index < captions.length; index += 1) {
      const caption = captions[index];
      try {
        const result = await requestWithRetries({
          fetchImpl,
          botToken,
          method: 'sendPhoto',
          payload: { chat_id: chatId, photo, caption, parse_mode: 'HTML' },
        });
        return { messageId: messageIdFrom(result), mode: 'photo' };
      } catch (error) {
        if (error?.classification?.kind === 'content') {
          if (index < captions.length - 1) continue;
          break photoFallbacks;
        }
        if (error?.classification?.kind === 'media') break;
        throw error;
      }
    }
  }

  for (const text of [...new Set([card.text, card.conciseText].filter(Boolean))]) {
    try {
      const result = await requestWithRetries({
        fetchImpl,
        botToken,
        method: 'sendMessage',
        payload: { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
      });
      return { messageId: messageIdFrom(result), mode: 'text' };
    } catch (error) {
      if (error?.classification?.kind === 'content' && text !== card.conciseText) continue;
      throw error;
    }
  }
  throw new TelegramDeliveryError({ kind: 'content' });
}

export async function editSaleCard({ fetchImpl = fetch, botToken, chatId, messageId, mode, card }) {
  if (mode !== 'photo' && mode !== 'text') throw new TypeError('Telegram delivery mode must be photo or text');
  const method = mode === 'photo' ? 'editMessageCaption' : 'editMessageText';
  const variants = mode === 'photo'
    ? [...new Set([card.caption, card.conciseCaption].filter(Boolean))]
    : [...new Set([card.text, card.conciseText].filter(Boolean))];

  for (const content of variants) {
    const payload = mode === 'photo'
      ? { chat_id: chatId, message_id: messageId, caption: content, parse_mode: 'HTML' }
      : { chat_id: chatId, message_id: messageId, text: content, parse_mode: 'HTML', disable_web_page_preview: true };
    try {
      await requestWithRetries({ fetchImpl, botToken, method, payload });
      return { messageId, mode };
    } catch (error) {
      if (error?.classification?.kind === 'not-modified') return { messageId, mode };
      if (error?.classification?.kind === 'content' && content !== variants.at(-1)) continue;
      throw error;
    }
  }
  throw new TelegramDeliveryError({ kind: 'content' });
}

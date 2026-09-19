import os from 'node:os';
import path from 'node:path';

import { parseBoundedDecimal, parseMultiplier } from './loopers-sales/money.js';
import {
  buildBasescanTxUrl,
  buildOpenSeaItemUrl,
  classifyPaymentFamily,
  normalizeRestSale as defaultNormalizeRestSale,
  normalizeStreamSale as defaultNormalizeStreamSale,
} from './loopers-sales/normalize.js';
import {
  createOpenSeaPhoenixStream,
  fetchOpenSeaFloor,
  fetchOpenSeaSalesSnapshot,
} from './loopers-sales/opensea.js';
import {
  loadSalesState,
  pruneSalesState,
  saveSalesStateAtomic,
} from './loopers-sales/state.js';
import {
  editSaleCard,
  renderSaleCard,
  sendSaleCard,
} from './loopers-sales/telegram.js';

const DEFAULT_COLLECTION_SLUG = 'loopers-639312714';
const DEFAULT_CONTRACT = '0x1649cd37f4748807b4882fc48765ba0b2affa94a';
const DEFAULT_STATE_PATH = '/var/lib/helixa/loopers-sales-seen.json';
const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;
const DEFAULT_QUIET_MS = 8_000;
const DEFAULT_HARD_DEADLINE_MS = 30_000;
const FLOOR_MAX_AGE_SECONDS = 30;
const OVERLAP_SECONDS = 120;

function positiveInteger(value, fallback, source) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${source} must be a positive integer`);
  return parsed;
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseLoopersSalesBotOptions(argv = [], env = process.env) {
  const home = env.HOME || os.homedir();
  const options = {
    collectionSlug: env.LOOPERS_SALES_COLLECTION_SLUG || DEFAULT_COLLECTION_SLUG,
    contract: String(env.LOOPERS_SALES_CONTRACT || DEFAULT_CONTRACT).toLowerCase(),
    telegramBotToken: env.LOOPERS_SALES_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.LOOPERS_SALES_TELEGRAM_CHAT_ID || '',
    openseaConfigPath: env.LOOPERS_SALES_OPENSEA_CONFIG_PATH || path.join(home, '.config/opensea/config.json'),
    statePath: env.LOOPERS_SALES_STATE_PATH || DEFAULT_STATE_PATH,
    premiumMultiplier: env.LOOPERS_SALES_PREMIUM_MULTIPLIER || '1.25',
    reconcileIntervalMs: positiveInteger(env.LOOPERS_SALES_RECONCILE_INTERVAL_MS, DEFAULT_RECONCILE_INTERVAL_MS, 'LOOPERS_SALES_RECONCILE_INTERVAL_MS'),
    quietMs: positiveInteger(env.LOOPERS_SALES_QUIET_MS, DEFAULT_QUIET_MS, 'LOOPERS_SALES_QUIET_MS'),
    hardDeadlineMs: positiveInteger(env.LOOPERS_SALES_HARD_DEADLINE_MS, DEFAULT_HARD_DEADLINE_MS, 'LOOPERS_SALES_HARD_DEADLINE_MS'),
    sendImages: true,
    probe: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--probe') options.probe = true;
    else if (flag === '--no-images') options.sendImages = false;
    else if (flag === '--state-path') options.statePath = takeValue(argv, index++, flag);
    else if (flag === '--contract') options.contract = takeValue(argv, index++, flag).toLowerCase();
    else if (flag === '--collection-slug') options.collectionSlug = takeValue(argv, index++, flag);
    else if (flag === '--opensea-config-path') options.openseaConfigPath = takeValue(argv, index++, flag);
    else if (flag === '--telegram-chat-id') options.telegramChatId = takeValue(argv, index++, flag);
    else if (flag === '--premium-multiplier') options.premiumMultiplier = takeValue(argv, index++, flag);
    else if (flag === '--reconcile-interval-ms') options.reconcileIntervalMs = positiveInteger(takeValue(argv, index++, flag), null, flag);
    else if (flag === '--quiet-ms') options.quietMs = positiveInteger(takeValue(argv, index++, flag), null, flag);
    else if (flag === '--hard-deadline-ms') options.hardDeadlineMs = positiveInteger(takeValue(argv, index++, flag), null, flag);
    else throw new Error(`Unknown Loopers sales bot option: ${flag}`);
  }

  parseMultiplier(options.premiumMultiplier);
  if (options.hardDeadlineMs < options.quietMs) {
    throw new Error('hard deadline must not be shorter than the quiet deadline');
  }
  return options;
}

export function createSerializedQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    enqueue(operation) {
      if (typeof operation !== 'function') return Promise.reject(new TypeError('queued operation must be a function'));
      pending += 1;
      const result = tail.then(operation);
      tail = result.catch(() => {}).finally(() => { pending -= 1; });
      return result;
    },
    onIdle() { return tail; },
    getPending() { return pending; },
  };
}

function clone(value) {
  return structuredClone(value);
}

function nowSeconds(now) {
  return Math.floor(now() / 1_000);
}

function eventTimestamp(group) {
  return Math.max(...group.items.map(item => item.eventTimestamp));
}

function normalizedSale(raw, normalizer, options, source) {
  let event = normalizer(raw, { expectedContract: options.contract, contract: options.contract, nowSeconds: nowSeconds(options.now) });
  if (!event && source === 'stream') {
    event = normalizer({ event_type: 'item_sold', payload: raw }, {
      expectedContract: options.contract,
      contract: options.contract,
      nowSeconds: nowSeconds(options.now),
    });
  }
  if (!event) return null;
  return {
    ...event,
    paymentFamily: classifyPaymentFamily({ tokenAddress: event.paymentTokenAddress, symbol: event.paymentSymbol }),
    openSeaUrl: buildOpenSeaItemUrl({ chain: 'base', contract: options.contract, tokenId: event.tokenId }),
    openSeaCollectionUrl: `https://opensea.io/collection/${encodeURIComponent(options.collectionSlug)}`,
    transactionUrl: buildBasescanTxUrl(event.transactionHash),
  };
}

function serializeFloor(raw) {
  if (!raw) return null;
  const parsed = parseBoundedDecimal(raw.floorLexeme, { maxIntegerDigits: 31, maxFractionDigits: 36 });
  if (parsed.numerator <= 0n) return null;
  return {
    floorLexeme: raw.floorLexeme,
    numerator: parsed.numerator.toString(),
    scale: parsed.scale.toString(),
    symbol: raw.symbol,
    paymentFamily: 'base-eth',
    fetchedAt: raw.fetchedAt,
  };
}

function materializeFloor(snapshot, currentSeconds = null) {
  if (!snapshot) return null;
  let numerator = snapshot.numerator ?? snapshot.value?.numerator;
  let scale = snapshot.scale ?? snapshot.value?.scale;
  if ((numerator === undefined || scale === undefined) && typeof snapshot.floorLexeme === 'string') {
    const parsed = parseBoundedDecimal(snapshot.floorLexeme, { maxIntegerDigits: 31, maxFractionDigits: 36 });
    numerator = parsed.numerator;
    scale = parsed.scale;
  }
  if (numerator === undefined || scale === undefined) return null;
  const fetchedAt = Number(snapshot.fetchedAt);
  const fresh = currentSeconds === null || (Number.isSafeInteger(fetchedAt) && currentSeconds - fetchedAt <= FLOOR_MAX_AGE_SECONDS);
  return {
    value: { numerator: BigInt(numerator), scale: BigInt(scale) },
    symbol: snapshot.symbol,
    paymentFamily: snapshot.paymentFamily,
    fetchedAt,
    fresh,
  };
}

function groupForCard(group, options) {
  return {
    ...group,
    openSeaCollectionUrl: `https://opensea.io/collection/${encodeURIComponent(options.collectionSlug)}`,
    transactionUrl: buildBasescanTxUrl(group.transactionHash),
  };
}

export function createLoopersSalesBot(dependencies = {}) {
  const defaultOptions = parseLoopersSalesBotOptions([], dependencies.env ?? {});
  const parsedOptions = dependencies.options
    ? { ...defaultOptions, ...dependencies.options }
    : parseLoopersSalesBotOptions([], dependencies.env ?? process.env);
  const clock = dependencies.now ?? (() => Date.now());
  const options = { ...parsedOptions, now: clock };
  const multiplier = parseMultiplier(options.premiumMultiplier ?? '1.25');
  const logger = dependencies.logger ?? console;
  const timers = dependencies.timers ?? globalThis;
  const queue = dependencies.queue ?? createSerializedQueue();
  const loadState = dependencies.loadState ?? dependencies.loadSalesState
    ?? (() => loadSalesState({ statePath: options.statePath, nowSeconds: nowSeconds(clock) }));
  const saveState = dependencies.saveState ?? dependencies.saveSalesState
    ?? (state => saveSalesStateAtomic({ statePath: options.statePath, state }));
  const fetchSnapshot = dependencies.fetchSnapshot ?? dependencies.fetchOpenSeaSalesSnapshot ?? (bounds => fetchOpenSeaSalesSnapshot({
    fetchImpl: dependencies.fetchImpl ?? fetch,
    apiKey: dependencies.apiKey,
    slug: options.collectionSlug,
    ...bounds,
  }));
  const fetchFloor = dependencies.fetchFloor ?? dependencies.fetchOpenSeaFloor ?? (() => fetchOpenSeaFloor({
    fetchImpl: dependencies.fetchImpl ?? fetch,
    apiKey: dependencies.apiKey,
    slug: options.collectionSlug,
    nowSeconds: nowSeconds(clock),
  }));
  const normalizeRestSale = dependencies.normalizeRestSale ?? defaultNormalizeRestSale;
  const normalizeStreamSale = dependencies.normalizeStreamSale ?? defaultNormalizeStreamSale;
  const renderCard = dependencies.renderCard ?? dependencies.renderSaleCard ?? renderSaleCard;
  const sendCard = dependencies.sendCard ?? dependencies.sendSaleCard ?? (args => sendSaleCard({
    fetchImpl: dependencies.fetchImpl ?? fetch,
    botToken: options.telegramBotToken,
    chatId: options.telegramChatId,
    ...args,
    card: options.sendImages ? args.card : { ...args.card, imageUrl: null, fallbackImageUrl: '' },
  }));
  const editCard = dependencies.editCard ?? dependencies.editSaleCard ?? (args => editSaleCard({
    fetchImpl: dependencies.fetchImpl ?? fetch,
    botToken: options.telegramBotToken,
    chatId: options.telegramChatId,
    ...args,
  }));

  let state = null;
  let stream = null;
  let started = false;
  let stopping = false;
  let startupComplete = false;
  let streamReady = false;
  let floorReady = false;
  let ingressMode = 'stopped';
  let floorCache = null;
  let reconciliationPromise = null;
  let periodicTimer = null;
  const groupTimers = new Map();
  const startupBuffer = new Map();

  const log = (level, message, detail) => {
    const method = typeof logger[level] === 'function' ? logger[level].bind(logger) : null;
    if (!method) return;
    if (detail === undefined) method(message);
    else method(message, detail);
  };

  const isReady = () => Boolean(started && !stopping && startupComplete && streamReady && floorReady);

  async function persist(candidate) {
    candidate.updatedAt = nowSeconds(clock);
    const pruned = pruneSalesState(candidate, { nowSeconds: candidate.updatedAt });
    await saveState(pruned);
    state = pruned;
    return state;
  }

  function rememberStartup(event) {
    const current = startupBuffer.get(event.id);
    if (!current) startupBuffer.set(event.id, event);
  }

  function makeGroup(event) {
    const arrivedAt = clock();
    return {
      transactionHash: event.transactionHash,
      items: [event],
      firstSeenAt: arrivedAt,
      lastSeenAt: arrivedAt,
      quietDeadline: arrivedAt + options.quietMs,
      hardDeadline: arrivedAt + options.hardDeadlineMs,
    };
  }

  async function applySale(candidate, event) {
    if (!event) return { changed: false };
    const seenAt = nowSeconds(clock);
    if (candidate.seenIds[event.id]) return { changed: false };
    if (event.eventTimestamp < candidate.baselineCutoff) {
      candidate.seenIds[event.id] = seenAt;
      return { changed: true };
    }

    const transactionHash = event.transactionHash;
    if (candidate.deliveredTombstones[transactionHash]) {
      candidate.seenIds[event.id] = seenAt;
      log('warn', 'Suppressed late Looper sale because only a delivery tombstone remains', { transactionHash });
      return { changed: true };
    }

    const delivered = candidate.deliveredTransactions[transactionHash];
    if (delivered) {
      if (delivered.items?.some(item => item.id === event.id)) {
        candidate.seenIds[event.id] = seenAt;
        return { changed: true };
      }
      const items = [...(delivered.items ?? []), event];
      const cardGroup = groupForCard({ transactionHash, items }, options);
      const originalFloor = materializeFloor(delivered.floorSnapshot);
      const card = renderCard(cardGroup, { floorSnapshot: originalFloor, multiplier });
      try {
        await editCard({
          messageId: delivered.messageId,
          mode: delivered.mode,
          card,
          group: { ...cardGroup, floorSnapshot: delivered.floorSnapshot },
          floorSnapshot: delivered.floorSnapshot,
        });
      } catch (error) {
        if (error?.classification?.kind === 'unresolved-edit') {
          delivered.pinned = true;
          delivered.unresolvedItems = [...(delivered.unresolvedItems ?? []), event];
          log('error', 'Looper sale requires manual Telegram message repair', { transactionHash });
          return { changed: true };
        }
        if (error?.classification?.kind === 'fatal') throw error;
        candidate.retryRecords[event.id] = {
          kind: 'late-edit', transactionHash, event, attempt: 1, retryAt: seenAt + 30,
        };
        return { changed: true };
      }
      delivered.items = items;
      delivered.lastCaption = card.caption ?? card.text ?? '';
      delivered.unresolvedItems = (delivered.unresolvedItems ?? []).filter(item => item.id !== event.id);
      delivered.pinned = delivered.unresolvedItems.length > 0;
      delete candidate.retryRecords[event.id];
      candidate.seenIds[event.id] = seenAt;
      return { changed: true };
    }

    const group = candidate.pendingGroups[transactionHash];
    if (!group) {
      candidate.pendingGroups[transactionHash] = makeGroup(event);
      return { changed: true, transactionHash };
    }
    if (group.items.some(item => item.id === event.id)) return { changed: false, transactionHash };
    group.items.push(event);
    group.lastSeenAt = clock();
    group.quietDeadline = Math.min(group.lastSeenAt + options.quietMs, group.hardDeadline);
    return { changed: true, transactionHash };
  }

  function clearGroupTimer(transactionHash) {
    const timer = groupTimers.get(transactionHash);
    if (timer !== undefined) timers.clearTimeout(timer);
    groupTimers.delete(transactionHash);
  }

  function scheduleGroup(transactionHash, minimumDelay = 0) {
    clearGroupTimer(transactionHash);
    const group = state?.pendingGroups?.[transactionHash];
    if (!group || stopping) return;
    const deadline = Math.min(group.quietDeadline, group.hardDeadline);
    const delay = Math.max(minimumDelay, deadline - clock(), 0);
    const timer = timers.setTimeout(() => {
      groupTimers.delete(transactionHash);
      coordinateFinalization(transactionHash).catch(error => {
        log('error', 'Looper sale group finalization failed', { message: String(error?.message ?? 'unknown failure') });
        if (!stopping && state?.pendingGroups?.[transactionHash]) scheduleGroup(transactionHash, 1_000);
      });
    }, delay);
    timer?.unref?.();
    groupTimers.set(transactionHash, timer);
  }

  function syncGroupTimers() {
    for (const transactionHash of groupTimers.keys()) {
      if (!state?.pendingGroups?.[transactionHash]) clearGroupTimer(transactionHash);
    }
    for (const transactionHash of Object.keys(state?.pendingGroups ?? {})) scheduleGroup(transactionHash);
  }

  async function ingestNormalized(event) {
    return queue.enqueue(async () => {
      if (!state || stopping) return false;
      if (ingressMode === 'startup') {
        rememberStartup(event);
        return true;
      }
      const candidate = clone(state);
      const result = await applySale(candidate, event);
      if (!result.changed) return false;
      await persist(candidate);
      if (result.transactionHash) scheduleGroup(result.transactionHash);
      return true;
    });
  }

  async function ingestStreamEvent(rawEvent) {
    let event;
    try {
      event = normalizedSale(rawEvent, normalizeStreamSale, options, 'stream');
    } catch {
      log('warn', 'Rejected malformed OpenSea Stream sale');
      return false;
    }
    if (!event) return false;
    return ingestNormalized(event);
  }

  async function applyReconciliation(snapshot, upperBound) {
    return queue.enqueue(async () => {
      if (!state || stopping) return { upperBound: state?.restWatermark ?? upperBound };
      const candidate = clone(state);
      const normalized = [];
      for (const rawEvent of snapshot.events ?? []) {
        try {
          const event = normalizedSale(rawEvent, normalizeRestSale, options, 'rest');
          if (event) normalized.push(event);
        } catch {
          log('warn', 'Rejected malformed OpenSea REST sale');
        }
      }
      for (const event of startupBuffer.values()) normalized.push(event);
      const unique = new Map(normalized.map(event => [event.id, event]));
      for (const event of unique.values()) await applySale(candidate, event);
      candidate.restWatermark = Math.max(candidate.restWatermark, upperBound);
      await persist(candidate);
      if (ingressMode === 'startup') {
        startupBuffer.clear();
        ingressMode = 'steady';
      }
      syncGroupTimers();
      return { upperBound, eventCount: unique.size };
    });
  }

  function scheduleReconciliation(reason = 'scheduled') {
    if (reconciliationPromise) return reconciliationPromise;
    const run = (async () => {
      const bounds = await queue.enqueue(async () => {
        if (!state) throw new Error('Loopers sales state is not loaded');
        const previousWatermark = state.restWatermark;
        const upperBound = Math.max(previousWatermark, nowSeconds(clock) - 2);
        return {
          previousWatermark,
          upperBound,
          after: Math.max(0, previousWatermark - OVERLAP_SECONDS),
          before: upperBound,
        };
      });
      const snapshot = await fetchSnapshot({ after: bounds.after, before: bounds.before, reason });
      const completedBound = Math.min(bounds.upperBound, Number.isSafeInteger(snapshot?.upperBound) ? snapshot.upperBound : bounds.upperBound);
      return applyReconciliation(snapshot, completedBound);
    })();
    reconciliationPromise = run.finally(() => {
      if (reconciliationPromise === wrapped) reconciliationPromise = null;
    });
    const wrapped = reconciliationPromise;
    return reconciliationPromise;
  }

  async function refreshFloor({ required = false } = {}) {
    const current = nowSeconds(clock);
    if (floorCache && current - floorCache.fetchedAt <= FLOOR_MAX_AGE_SECONDS) return floorCache;
    try {
      const fetched = await fetchFloor();
      floorCache = serializeFloor(fetched);
      if (!floorCache) throw new Error('OpenSea floor was unusable');
      floorReady = true;
      return floorCache;
    } catch (error) {
      if (required) {
        floorReady = false;
        throw error;
      }
      log('warn', 'OpenSea floor unavailable; sending a normal sale card');
      return null;
    }
  }

  async function coordinateFinalization(transactionHash) {
    let snapshot = await queue.enqueue(() => clone(state?.pendingGroups?.[transactionHash] ?? null));
    if (!snapshot || stopping) return;
    let hard = clock() >= snapshot.hardDeadline;
    let result;
    try {
      result = await scheduleReconciliation('sweep-finalization');
      if (!hard && result.upperBound <= eventTimestamp(snapshot)) {
        await Promise.resolve();
        result = await scheduleReconciliation('sweep-freshness');
        snapshot = await queue.enqueue(() => clone(state?.pendingGroups?.[transactionHash] ?? null));
        if (!snapshot) return;
        hard = clock() >= snapshot.hardDeadline;
        if (!hard && result.upperBound <= eventTimestamp(snapshot)) {
          scheduleGroup(transactionHash, 1_000);
          return;
        }
      }
    } catch (error) {
      hard = clock() >= snapshot.hardDeadline;
      if (!hard) throw error;
      log('warn', 'Finalizing Looper sale at hard deadline without fresh reconciliation');
    }

    snapshot = await queue.enqueue(() => clone(state?.pendingGroups?.[transactionHash] ?? null));
    if (!snapshot) return;
    hard = clock() >= snapshot.hardDeadline;
    if (!hard && clock() < snapshot.quietDeadline) {
      scheduleGroup(transactionHash);
      return;
    }
    const floor = await refreshFloor();
    await queue.enqueue(async () => {
      const current = state?.pendingGroups?.[transactionHash];
      if (!current) return;
      if (current.items.length !== snapshot.items.length || current.lastSeenAt !== snapshot.lastSeenAt) {
        scheduleGroup(transactionHash);
        return;
      }
      const candidate = clone(state);
      const group = candidate.pendingGroups[transactionHash];
      const floorSnapshot = materializeFloor(floor, nowSeconds(clock));
      const cardGroup = groupForCard(group, options);
      const card = renderCard(cardGroup, { floorSnapshot, multiplier });
      const delivery = await sendCard({ card, group: cardGroup, floorSnapshot });
      const deliveredAt = nowSeconds(clock);
      candidate.deliveredTransactions[transactionHash] = {
        transactionHash,
        deliveredAt,
        messageId: delivery.messageId,
        mode: delivery.mode,
        items: group.items,
        floorSnapshot: floor,
        lastCaption: card.caption ?? card.text ?? '',
        unresolvedItems: [],
        pinned: false,
      };
      candidate.deliveredTombstones[transactionHash] ??= { deliveredAt };
      for (const item of group.items) {
        candidate.seenIds[item.id] = deliveredAt;
        delete candidate.retryRecords[item.id];
      }
      delete candidate.pendingGroups[transactionHash];
      await persist(candidate);
      clearGroupTimer(transactionHash);
    });
  }

  function armPeriodicReconciliation() {
    if (periodicTimer !== null || stopping) return;
    periodicTimer = timers.setTimeout(() => {
      periodicTimer = null;
      if (stopping) return;
      scheduleReconciliation('periodic').catch(error => {
        log('warn', 'Periodic OpenSea reconciliation failed', { message: String(error?.message ?? 'unknown failure') });
      }).finally(armPeriodicReconciliation);
    }, options.reconcileIntervalMs);
    periodicTimer?.unref?.();
  }

  async function start() {
    if (started) return getStatus();
    stopping = false;
    startupComplete = false;
    floorReady = false;
    streamReady = false;
    ingressMode = 'startup';
    state = await loadState();
    await queue.enqueue(async () => persist(clone(state)));

    const createStream = dependencies.createStream ?? dependencies.createOpenSeaPhoenixStream ?? (args => createOpenSeaPhoenixStream({
      apiKey: dependencies.apiKey,
      slug: options.collectionSlug,
      WebSocketImpl: dependencies.WebSocketImpl,
      timers: dependencies.streamTimers,
      logger,
      ...args,
    }));
    stream = createStream({
      onSale: event => { ingestStreamEvent(event).catch(error => log('warn', 'OpenSea Stream sale ingestion failed', { message: String(error?.message ?? 'unknown failure') })); },
      onReadyChange: value => { streamReady = Boolean(value); },
    });
    try {
      await stream.start();
      streamReady = stream.isReady ? stream.isReady() : true;
      await scheduleReconciliation('startup');
      await refreshFloor({ required: true });
      started = true;
      startupComplete = true;
      syncGroupTimers();
      armPeriodicReconciliation();
      if (isReady()) log('info', 'loopers-sales-bot ready');
      return getStatus();
    } catch (error) {
      started = false;
      startupComplete = false;
      streamReady = false;
      if (stream) await stream.stop().catch(() => {});
      throw error;
    }
  }

  async function stop() {
    if (stopping) return;
    stopping = true;
    startupComplete = false;
    streamReady = false;
    if (periodicTimer !== null) timers.clearTimeout(periodicTimer);
    periodicTimer = null;
    for (const transactionHash of [...groupTimers.keys()]) clearGroupTimer(transactionHash);
    if (stream) await stream.stop();
    if (reconciliationPromise) await reconciliationPromise.catch(() => {});
    await queue.onIdle();
    started = false;
    ingressMode = 'stopped';
    stopping = false;
  }

  async function probe() {
    await start();
    const status = getStatus();
    await stop();
    return status;
  }

  function getStatus() {
    return {
      ready: isReady(),
      started,
      streamReady,
      floorReady,
      ingressMode,
      baselineCutoff: state?.baselineCutoff ?? null,
      restWatermark: state?.restWatermark ?? null,
      watermark: state?.restWatermark ?? null,
      pendingGroups: Object.keys(state?.pendingGroups ?? {}).length,
      retryRecords: Object.keys(state?.retryRecords ?? {}).length,
      deliveredTransactions: Object.keys(state?.deliveredTransactions ?? {}).length,
      queuePending: queue.getPending?.() ?? null,
    };
  }

  return {
    start,
    stop,
    probe,
    scheduleReconciliation,
    ingestStreamEvent,
    isReady,
    getStatus,
  };
}

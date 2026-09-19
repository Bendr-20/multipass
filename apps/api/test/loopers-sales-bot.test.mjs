import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createLoopersSalesBot,
  createSerializedQueue,
  parseLoopersSalesBotOptions,
} from '../src/loopers-sales-bot.js';
import { LOOPERS_SWEEP_ANIMATION_URL } from '../src/loopers-sales/telegram.js';

const CONTRACT = '0x1649cd37f4748807b4882fc48765ba0b2affa94a';
const TX = `0x${'a'.repeat(64)}`;

function sale(tokenId = '1', overrides = {}) {
  return {
    id: `${TX}:${tokenId}`,
    transactionHash: TX,
    orderHash: null,
    eventTimestamp: 1_000,
    tokenId,
    tokenName: `Looper #${tokenId}`,
    imageUrl: null,
    seller: `0x${'1'.repeat(40)}`,
    buyer: `0x${'2'.repeat(40)}`,
    quantity: 1,
    paymentQuantityRaw: '1500000000000000000',
    paymentDecimals: 18,
    paymentSymbol: 'ETH',
    paymentTokenAddress: `0x${'0'.repeat(40)}`,
    ...overrides,
  };
}

function defaultState(overrides = {}) {
  return {
    schemaVersion: 1,
    baselineCutoff: 1_000,
    restWatermark: 1_000,
    seenIds: {},
    pendingGroups: {},
    retryRecords: {},
    deliveredTransactions: {},
    deliveredTombstones: {},
    updatedAt: 1_000,
    ...overrides,
  };
}

function harness(overrides = {}) {
  let state = structuredClone(overrides.initialState ?? defaultState());
  const saves = [];
  const sent = [];
  const edited = [];
  let callbacks;
  const stream = {
    ready: true,
    async start() {
      if (overrides.onStreamStart) await overrides.onStreamStart(callbacks);
    },
    async stop() { this.ready = false; },
    isReady() { return this.ready; },
  };
  const dependencies = {
    options: {
      contract: CONTRACT,
      collectionSlug: 'loopers-639312714',
      telegramBotToken: 'telegram-secret',
      telegramChatId: '@theloopers',
      premiumMultiplier: '1.25',
      quietMs: 8,
      hardDeadlineMs: 30,
      reconcileIntervalMs: 60_000,
      ...overrides.options,
    },
    now: () => overrides.nowMs ?? 1_005_000,
    loadState: async () => structuredClone(state),
    saveState: async next => {
      if (overrides.saveState) await overrides.saveState(next, saves.length);
      state = structuredClone(next);
      saves.push(structuredClone(next));
    },
    fetchSnapshot: overrides.fetchSnapshot ?? (async ({ before }) => ({ events: [], upperBound: before })),
    fetchFloor: overrides.fetchFloor ?? (async () => ({ floorLexeme: '1', symbol: 'ETH', fetchedAt: 1_005 })),
    normalizeRestSale: overrides.normalizeRestSale ?? (event => event),
    normalizeStreamSale: overrides.normalizeStreamSale ?? (event => event),
    createStream: options => {
      callbacks = options;
      return stream;
    },
    renderCard: group => ({ caption: group.items.map(item => item.tokenId).join(','), text: 'card' }),
    sendCard: async args => {
      sent.push(args);
      return { messageId: sent.length, mode: 'text' };
    },
    editCard: async args => {
      edited.push(args);
      return { messageId: args.messageId, mode: args.mode };
    },
    logger: { info() {}, warn() {}, error() {} },
    ...overrides.dependencies,
  };
  const bot = createLoopersSalesBot(dependencies);
  return { bot, stream, sent, edited, saves, getState: () => state, getCallbacks: () => callbacks };
}

async function eventually(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail('condition was not reached before timeout');
}

test('parseLoopersSalesBotOptions provides production defaults and env/flag overrides', () => {
  const defaults = parseLoopersSalesBotOptions([], { HOME: '/home/test' });
  assert.equal(defaults.collectionSlug, 'loopers-639312714');
  assert.equal(defaults.contract, CONTRACT);
  assert.equal(defaults.openseaConfigPath, '/home/test/.config/opensea/config.json');
  assert.equal(defaults.statePath, '/var/lib/helixa/loopers-sales-seen.json');
  assert.equal(defaults.premiumMultiplier, '1.25');
  assert.equal(defaults.reconcileIntervalMs, 30_000);
  assert.equal(defaults.quietMs, 8_000);
  assert.equal(defaults.hardDeadlineMs, 30_000);
  assert.equal(defaults.sendImages, true);
  assert.equal(defaults.sweepAnimationUrl, LOOPERS_SWEEP_ANIMATION_URL);

  const configured = parseLoopersSalesBotOptions([
    '--probe', '--state-path', '/tmp/probe.json', '--no-images', '--premium-multiplier', '1.375',
  ], {
    HOME: '/h', LOOPERS_SALES_RECONCILE_INTERVAL_MS: '1234', LOOPERS_SALES_TELEGRAM_CHAT_ID: '-1001',
  });
  assert.equal(configured.probe, true);
  assert.equal(configured.statePath, '/tmp/probe.json');
  assert.equal(configured.sendImages, false);
  assert.equal(configured.premiumMultiplier, '1.375');
  assert.equal(configured.reconcileIntervalMs, 1234);
  assert.equal(configured.telegramChatId, '-1001');
  assert.equal(parseLoopersSalesBotOptions(['--', '--help'], { HOME: '/h' }).help, true);

  assert.equal(parseLoopersSalesBotOptions([], {
    HOME: '/h', LOOPERS_SALES_SWEEP_ANIMATION_URL: LOOPERS_SWEEP_ANIMATION_URL,
  }).sweepAnimationUrl, LOOPERS_SWEEP_ANIMATION_URL);
  assert.equal(parseLoopersSalesBotOptions([
    '--sweep-animation-url', LOOPERS_SWEEP_ANIMATION_URL,
  ], { HOME: '/h' }).sweepAnimationUrl, LOOPERS_SWEEP_ANIMATION_URL);
  assert.throws(
    () => parseLoopersSalesBotOptions([], {
      HOME: '/h', LOOPERS_SALES_SWEEP_ANIMATION_URL: 'https://example.com/not-loopers.gif',
    }),
    /sweep-animation URL/i,
  );
  assert.throws(
    () => parseLoopersSalesBotOptions(['--sweep-animation-url', 'javascript:alert(1)'], { HOME: '/h' }),
    /sweep-animation URL/i,
  );
});

test('serialized queue continues after rejection and never deadlocks later work', async () => {
  const queue = createSerializedQueue();
  const order = [];
  await assert.rejects(queue.enqueue(async () => { order.push(1); throw new Error('expected'); }), /expected/);
  assert.equal(await queue.enqueue(async () => { order.push(2); return 3; }), 3);
  await queue.onIdle();
  assert.deepEqual(order, [1, 2]);
});

test('startup persists the baseline before Stream and atomically merges Stream with REST', async () => {
  let savedBeforeStream = false;
  const h = harness({
    onStreamStart: async callbacks => {
      savedBeforeStream = h.saves.length > 0;
      callbacks.onSale(sale('1'));
    },
    fetchSnapshot: async ({ before }) => ({ events: [sale('2')], upperBound: before }),
  });
  await h.bot.start();
  assert.equal(savedBeforeStream, true);
  assert.equal(h.bot.isReady(), true);
  assert.equal(h.bot.getStatus().ingressMode, 'steady');
  assert.deepEqual(Object.keys(h.getState().pendingGroups), [TX]);
  assert.deepEqual(h.getState().pendingGroups[TX].items.map(item => item.tokenId).sort(), ['1', '2']);
  assert.ok(h.getState().restWatermark >= 1_003);
  await h.bot.stop();
});

test('permanent baseline filters old events while accepting the cutoff second', async () => {
  const h = harness({ fetchSnapshot: async ({ before }) => ({
    events: [sale('1', { eventTimestamp: 999 }), sale('2', { eventTimestamp: 1_000 })], upperBound: before,
  }) });
  await h.bot.start();
  assert.equal(h.getState().seenIds[`${TX}:1`], 1_005);
  assert.deepEqual(h.getState().pendingGroups[TX].items.map(item => item.tokenId), ['2']);
  await h.bot.stop();
});

test('reconciliation uses a two-minute overlap, fixed clamped bound, and advances on empty completion', async () => {
  const calls = [];
  const h = harness({
    initialState: defaultState({ restWatermark: 900 }),
    fetchSnapshot: async args => { calls.push(args); return { events: [], upperBound: args.before }; },
  });
  await h.bot.start();
  assert.equal(calls[0].after, 780);
  assert.equal(calls[0].before, 1_003);
  assert.equal(h.getState().restWatermark, 1_003);
  await h.bot.stop();
});

test('Stream can enter the mutation queue during REST without reconciliation deadlock', async () => {
  let h;
  let injected = false;
  h = harness({
    fetchSnapshot: async ({ before }) => {
      if (!injected) {
        injected = true;
        await h.bot.ingestStreamEvent(sale('9'));
      }
      return { events: [], upperBound: before };
    },
  });
  await h.bot.start();
  assert.equal(h.getState().pendingGroups[TX].items[0].tokenId, '9');
  await h.bot.stop();
});

test('failed durable reconciliation does not advance the in-memory watermark', async () => {
  const h = harness({ saveState: async (_next, index) => { if (index === 1) throw new Error('disk failed'); } });
  await assert.rejects(h.bot.start(), /disk failed/);
  assert.equal(h.bot.isReady(), false);
  assert.equal(h.getState().restWatermark, 1_000);
  await h.bot.stop();
});

test('quiet finalization groups a transaction, persists delivery, and prevents duplicate cards', async () => {
  const startedAt = Date.now();
  const h = harness({
    options: { quietMs: 5, hardDeadlineMs: 40 },
    dependencies: { now: () => 1_005_000 + (Date.now() - startedAt) },
  });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('2'));
  await h.bot.ingestStreamEvent(sale('1'));
  await eventually(() => h.sent.length === 1);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.getState().deliveredTransactions[TX].items.map(item => item.tokenId).sort(), ['1', '2']);
  assert.ok(h.getState().seenIds[`${TX}:1`]);
  await h.bot.ingestStreamEvent(sale('1'));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(h.sent.length, 1);
  await h.bot.stop();
});

test('rendering receives the configured sweep animation URL for initial and late sale cards', async () => {
  const renderOptions = [];
  const renderCard = (group, options) => {
    renderOptions.push(options);
    return { caption: group.items.map(item => item.tokenId).join(','), text: 'card' };
  };
  const startedAt = Date.now();
  const initial = harness({
    options: { quietMs: 5, hardDeadlineMs: 40 },
    dependencies: {
      now: () => 1_005_000 + (Date.now() - startedAt),
      renderCard,
    },
  });
  await initial.bot.start();
  await initial.bot.ingestStreamEvent(sale('1'));
  await eventually(() => initial.sent.length === 1);
  await initial.bot.stop();

  const delivered = {
    transactionHash: TX, deliveredAt: 1_000, messageId: 42, mode: 'text', items: [sale('1')],
    floorSnapshot: null, lastCaption: 'old', unresolvedItems: [], pinned: false,
  };
  const late = harness({
    initialState: defaultState({ deliveredTransactions: { [TX]: delivered } }),
    dependencies: { renderCard },
  });
  await late.bot.start();
  await late.bot.ingestStreamEvent(sale('2'));
  await late.bot.stop();

  assert.equal(renderOptions.length, 2);
  for (const options of renderOptions) {
    assert.deepEqual(Object.keys(options).sort(), ['floorSnapshot', 'multiplier', 'sweepAnimationUrl']);
    assert.equal(options.sweepAnimationUrl, LOOPERS_SWEEP_ANIMATION_URL);
  }
});

test('periodic REST reconciliation repairs a simulated Stream gap', async () => {
  let snapshots = 0;
  const h = harness({
    options: { reconcileIntervalMs: 5 },
    fetchSnapshot: async ({ before }) => {
      snapshots += 1;
      return { events: snapshots === 2 ? [sale('11')] : [], upperBound: before };
    },
  });
  await h.bot.start();
  await eventually(() => snapshots >= 2);
  assert.equal(h.getState().pendingGroups[TX].items[0].tokenId, '11');
  await h.bot.stop();
});

test('accepted Telegram send followed by state failure leaves the sale unseen for retry', async () => {
  const h = harness({
    options: { quietMs: 5, hardDeadlineMs: 40 },
    saveState: async candidate => {
      if (Object.keys(candidate.deliveredTransactions ?? {}).length > 0) throw new Error('disk failed after send');
    },
    dependencies: { now: () => Date.now() },
  });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('12'));
  await eventually(() => h.sent.length === 1);
  assert.equal(h.getState().seenIds[`${TX}:12`], undefined);
  assert.ok(h.getState().pendingGroups[TX]);
  await h.bot.stop();
});

test('a stale coalesced reconciliation is followed by a fresh one before quiet finalization', async () => {
  const bounds = [];
  let nowMs = 1_001_000;
  const h = harness({
    nowMs,
    options: { quietMs: 5, hardDeadlineMs: 100 },
    fetchSnapshot: async args => { bounds.push(args.before); nowMs += 3_000; return { events: [], upperBound: args.before }; },
    dependencies: { now: () => nowMs },
  });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('7', { eventTimestamp: 1_002 }));
  await eventually(() => h.sent.length === 1);
  assert.ok(bounds.some(bound => bound > 1_002));
  await h.bot.stop();
});

test('late siblings edit the existing message against the original floor and tombstones suppress reposts', async () => {
  const originalFloor = { value: { numerator: '1', scale: '1' }, symbol: 'ETH', paymentFamily: 'base-eth', fetchedAt: 1_000, fresh: true };
  const delivered = {
    transactionHash: TX, deliveredAt: 1_000, messageId: 42, mode: 'text', items: [sale('1')],
    floorSnapshot: originalFloor, lastCaption: 'old', unresolvedItems: [], pinned: false,
  };
  const h = harness({ initialState: defaultState({
    deliveredTransactions: { [TX]: delivered },
    deliveredTombstones: { [TX]: { deliveredAt: 1_000 } },
  }) });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('2'));
  assert.equal(h.edited.length, 1);
  assert.deepEqual(h.edited[0].group?.floorSnapshot ?? h.edited[0].floorSnapshot, originalFloor);
  assert.ok(h.getState().seenIds[`${TX}:2`]);
  await h.bot.stop();

  const tombstone = harness({ initialState: defaultState({ deliveredTombstones: { [TX]: { deliveredAt: 1 } } }) });
  await tombstone.bot.start();
  await tombstone.bot.ingestStreamEvent(sale('3'));
  assert.equal(tombstone.sent.length, 0);
  assert.ok(tombstone.getState().seenIds[`${TX}:3`]);
  await tombstone.bot.stop();
});

test('late photo-to-animation edits persist the returned Telegram delivery mode', async () => {
  const delivered = {
    transactionHash: TX, deliveredAt: 1_000, messageId: 42, mode: 'photo', items: [sale('1')],
    floorSnapshot: null, lastCaption: 'old', unresolvedItems: [], pinned: false,
  };
  const h = harness({
    initialState: defaultState({
      deliveredTransactions: { [TX]: delivered },
      deliveredTombstones: { [TX]: { deliveredAt: 1_000 } },
    }),
    dependencies: {
      renderCard: () => ({ caption: 'sweep', text: 'sweep', animationUrl: LOOPERS_SWEEP_ANIMATION_URL }),
      editCard: async args => ({ messageId: args.messageId, mode: 'animation' }),
    },
  });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('2'));
  assert.equal(h.getState().deliveredTransactions[TX].mode, 'animation');
  await h.bot.stop();
});

test('--no-images strips all initial media and prevents late photo-to-animation transitions', async () => {
  const mediaCard = {
    caption: 'sale',
    text: 'sale',
    animationUrl: LOOPERS_SWEEP_ANIMATION_URL,
    imageUrls: ['https://helixa.xyz/loopers/images/1.png'],
    imageUrl: 'https://helixa.xyz/loopers/images/1.png',
    fallbackImageUrl: 'https://helixa.xyz/multipass/loopers-logo.png',
  };
  const startedAt = Date.now();
  const initial = harness({
    options: { sendImages: false, quietMs: 5, hardDeadlineMs: 40 },
    dependencies: {
      now: () => 1_005_000 + (Date.now() - startedAt),
      renderCard: () => ({ ...mediaCard }),
    },
  });
  await initial.bot.start();
  await initial.bot.ingestStreamEvent(sale('1'));
  await eventually(() => initial.sent.length === 1);
  assert.equal(initial.sent[0].card.animationUrl, null);
  assert.deepEqual(initial.sent[0].card.imageUrls, []);
  assert.equal(initial.sent[0].card.imageUrl, null);
  assert.equal(initial.sent[0].card.fallbackImageUrl, '');
  await initial.bot.stop();

  const delivered = {
    transactionHash: TX, deliveredAt: 1_000, messageId: 42, mode: 'photo', items: [sale('1')],
    floorSnapshot: null, lastCaption: 'old', unresolvedItems: [], pinned: false,
  };
  const late = harness({
    options: { sendImages: false },
    initialState: defaultState({ deliveredTransactions: { [TX]: delivered } }),
    dependencies: { renderCard: () => ({ ...mediaCard }) },
  });
  await late.bot.start();
  await late.bot.ingestStreamEvent(sale('2'));
  assert.equal(late.edited[0].card.animationUrl, null);
  assert.equal(late.getState().deliveredTransactions[TX].mode, 'photo');
  await late.bot.stop();
});

test('unresolved late edits stay pinned and unseen for operational repair', async () => {
  const h = harness({
    initialState: defaultState({ deliveredTransactions: { [TX]: {
      transactionHash: TX, deliveredAt: 1_000, messageId: 42, mode: 'text', items: [sale('1')],
      floorSnapshot: null, lastCaption: 'old', unresolvedItems: [], pinned: false,
    } } }),
    dependencies: { editCard: async () => { throw Object.assign(new Error('cannot edit'), { classification: { kind: 'unresolved-edit' } }); } },
  });
  await h.bot.start();
  await h.bot.ingestStreamEvent(sale('2'));
  assert.equal(h.getState().deliveredTransactions[TX].pinned, true);
  assert.equal(h.getState().deliveredTransactions[TX].unresolvedItems.length, 1);
  assert.equal(h.getState().seenIds[`${TX}:2`], undefined);
  await h.bot.stop();
});

test('probe reaches readiness, performs no Telegram delivery, and shuts down cleanly', async () => {
  const h = harness();
  const status = await h.bot.probe();
  assert.equal(status.ready, true);
  assert.equal(h.sent.length, 0);
  assert.equal(h.stream.ready, false);
});

test('corrupt state prevents startup readiness', async () => {
  const h = harness({ dependencies: { loadState: async () => { throw new Error('corrupt state'); } } });
  await assert.rejects(h.bot.start(), /corrupt state/);
  assert.equal(h.bot.isReady(), false);
});

test('runner file exposes help without reading config and package script is registered', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['loopers:sales-bot'], 'node scripts/run-loopers-sales-bot.js');
  const runner = await import('../scripts/run-loopers-sales-bot.js');
  assert.equal(typeof runner.main, 'function');
  const output = [];
  const code = await runner.main({ argv: ['--help'], env: {}, stdout: text => output.push(text) });
  assert.equal(code, 0);
  assert.match(output.join('\n'), /--probe/);
  assert.match(output.join('\n'), /--sweep-animation-url/);
  assert.match(output.join('\n'), /LOOPERS_SALES_SWEEP_ANIMATION_URL/);
});

test('runner handles SIGTERM by stopping the bot before a clean exit', async () => {
  const runner = await import('../scripts/run-loopers-sales-bot.js');
  const processImpl = new EventEmitter();
  let stopped = false;
  const run = runner.main({
    argv: [],
    env: { HOME: '/tmp', TELEGRAM_BOT_TOKEN: 'token', LOOPERS_SALES_TELEGRAM_CHAT_ID: '@chat' },
    stdout() {},
    stderr() {},
    readApiKey: async () => 'key',
    makeBot: () => ({
      async start() {},
      async stop() { stopped = true; },
      getStatus: () => ({ ready: true }),
    }),
    processImpl,
  });
  await new Promise(resolve => setImmediate(resolve));
  processImpl.emit('SIGTERM');
  assert.equal(await run, 0);
  assert.equal(stopped, true);
});

test('runner reports missing config and redacts both provider secrets from fatal output', async () => {
  const runner = await import('../scripts/run-loopers-sales-bot.js');
  const missing = [];
  assert.equal(await runner.main({ argv: [], env: { HOME: '/tmp' }, stderr: line => missing.push(line) }), 1);
  assert.match(missing.join('\n'), /TELEGRAM/);

  const output = [];
  assert.equal(await runner.main({
    argv: ['--probe'],
    env: { HOME: '/tmp', TELEGRAM_BOT_TOKEN: 'telegram-secret' },
    stderr: line => output.push(line),
    readApiKey: async () => 'opensea-secret',
    makeBot: () => ({ probe: async () => { throw new Error('opensea-secret telegram-secret'); } }),
  }), 1);
  assert.doesNotMatch(output.join('\n'), /opensea-secret|telegram-secret/);
});

test('runner probe uses isolated state, redacts secrets, and makes zero Telegram calls', async () => {
  const runner = await import('../scripts/run-loopers-sales-bot.js');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'loopers-runner-test-'));
  try {
    let stopCalls = 0;
    let observedOptions;
    const logs = [];
    const code = await runner.main({
      argv: ['--probe', '--state-path', path.join(directory, 'must-not-use.json')],
      env: { HOME: directory, TELEGRAM_BOT_TOKEN: 'telegram-secret' },
      stdout: line => logs.push(line),
      stderr: line => logs.push(line),
      readApiKey: async () => 'opensea-secret',
      makeBot: dependencies => {
        observedOptions = dependencies.options;
        return { probe: async () => ({ ready: true, watermark: 10 }), stop: async () => { stopCalls += 1; } };
      },
    });
    assert.equal(code, 0);
    assert.equal(stopCalls, 0, 'probe owns its clean stop');
    assert.equal(observedOptions.statePath, path.join(directory, 'must-not-use.json'));
    assert.doesNotMatch(logs.join('\n'), /telegram-secret|opensea-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

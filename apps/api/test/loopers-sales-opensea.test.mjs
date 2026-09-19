import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  classifyOpenSeaError,
  createOpenSeaPhoenixStream,
  fetchOpenSeaFloor,
  fetchOpenSeaSalesSnapshot,
  readOpenSeaApiKey,
} from '../src/loopers-sales/opensea.js';

const jsonResponse = (body, status = 200, headers = {}) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', ...headers } },
);

test('readOpenSeaApiKey accepts only a non-empty api_key without leaking config values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opensea-key-'));
  const good = path.join(directory, 'good.json');
  await writeFile(good, JSON.stringify({ api_key: '  secret-value  ', ignored: 'x' }));
  assert.equal(await readOpenSeaApiKey(good), 'secret-value');

  for (const [name, body] of [
    ['empty.json', '{"api_key":"   "}'],
    ['wrong.json', '{"apiKey":"secret-value"}'],
    ['bad.json', '{"api_key":"secret-value"'],
  ]) {
    const file = path.join(directory, name);
    await writeFile(file, body);
    await assert.rejects(readOpenSeaApiKey(file), error => {
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    });
  }
  await assert.rejects(readOpenSeaApiKey(path.join(directory, 'missing.json')), /OpenSea API key config/i);
});

test('fetchOpenSeaFloor parses an exact bounded ETH or WETH decimal lexeme', async () => {
  for (const [lexeme, symbol] of [['0.123456789012345678901234567890123456', ' eth '], ['123', 'WETH']]) {
    const floor = await fetchOpenSeaFloor({
      fetchImpl: async () => jsonResponse(`{"total":{"floor_price":${lexeme},"floor_price_symbol":"${symbol}"}}`),
      apiKey: 'key', slug: 'loopers', nowSeconds: 1234,
    });
    assert.deepEqual(floor, { floorLexeme: lexeme, symbol: symbol.trim().toUpperCase(), fetchedAt: 1234 });
  }
});

test('fetchOpenSeaFloor retries a transient parse failure', async () => {
  const responses = [
    new Response('{bad json', { status: 200 }),
    jsonResponse('{"total":{"floor_price":0.25,"floor_price_symbol":"ETH"}}'),
  ];
  const delays = [];
  const floor = await fetchOpenSeaFloor({
    fetchImpl: async () => responses.shift(), apiKey: 'key', slug: 'loopers', nowSeconds: 3,
    retry: { maxAttempts: 2, baseDelayMs: 5, jitter: () => 0, sleep: async ms => delays.push(ms) },
  });
  assert.deepEqual(floor, { floorLexeme: '0.25', symbol: 'ETH', fetchedAt: 3 });
  assert.deepEqual(delays, [5]);
});

test('fetchOpenSeaFloor fails closed for invalid, zero, or incompatible floors', async () => {
  const invalidBodies = [
    '{"total":{"floor_price":1e-3,"floor_price_symbol":"ETH"}}',
    '{"total":{"floor_price":0,"floor_price_symbol":"ETH"}}',
    '{"total":{"floor_price":0.0,"floor_price_symbol":"ETH"}}',
    '{"total":{"floor_price":1.0,"floor_price_symbol":"USDC"}}',
    '{"total":{"floor_price":1.0}}',
    '{"total":{"floor_price":01.0,"floor_price_symbol":"ETH"}}',
    `{"total":{"floor_price":${'1'.repeat(32)},"floor_price_symbol":"ETH"}}`,
    `{"total":{"floor_price":1.${'1'.repeat(37)},"floor_price_symbol":"ETH"}}`,
  ];
  for (const body of invalidBodies) {
    await assert.rejects(fetchOpenSeaFloor({
      fetchImpl: async () => jsonResponse(body), apiKey: 'key', slug: 'loopers', nowSeconds: 1,
      retry: { maxAttempts: 1 },
    }), /floor|response/i);
  }
});

test('REST snapshot follows opaque cursors and preserves fixed bounds', async () => {
  const urls = [];
  const pages = [
    { asset_events: [{ id: 'one', event_timestamp: 20 }], next: 'opaque+/=? cursor' },
    { asset_events: [{ id: 'future', event_timestamp: 31 }], next: null },
  ];
  const result = await fetchOpenSeaSalesSnapshot({
    fetchImpl: async (url, init) => {
      urls.push({ url: new URL(url), init });
      return jsonResponse(pages.shift());
    },
    apiKey: 'top-secret', slug: 'loopers-639312714', after: 10, before: 30,
  });
  assert.deepEqual(result, { events: [{ id: 'one', event_timestamp: 20 }, { id: 'future', event_timestamp: 31 }], upperBound: 30 });
  assert.equal(urls.length, 2);
  for (const { url, init } of urls) {
    assert.equal(url.pathname, '/api/v2/events/collection/loopers-639312714');
    assert.deepEqual(url.searchParams.getAll('event_type'), ['sale']);
    assert.equal(url.searchParams.get('after'), '10');
    assert.equal(url.searchParams.get('before'), '30');
    assert.equal(url.searchParams.get('limit'), '200');
    assert.equal(init.headers['X-API-KEY'], 'top-secret');
  }
  assert.equal(urls[1].url.searchParams.get('next'), 'opaque+/=? cursor');
});

test('REST snapshot treats an empty completed page as success', async () => {
  const result = await fetchOpenSeaSalesSnapshot({
    fetchImpl: async () => jsonResponse({ asset_events: [], next: null }),
    apiKey: 'key', slug: 'loopers', after: 0, before: 5,
  });
  assert.deepEqual(result, { events: [], upperBound: 5 });
});

test('REST snapshot retries 429, network errors, and 5xx with bounded delays', async () => {
  const responses = [
    new TypeError('network unavailable'),
    jsonResponse({}, 500),
    jsonResponse({}, 429, { 'retry-after': '2' }),
    jsonResponse({ asset_events: [], next: null }),
  ];
  const delays = [];
  const result = await fetchOpenSeaSalesSnapshot({
    fetchImpl: async () => {
      const value = responses.shift();
      if (value instanceof Error) throw value;
      return value;
    },
    apiKey: 'secret-key', slug: 'loopers', after: 0, before: 9,
    retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 5_000, jitter: () => 0, sleep: async ms => delays.push(ms) },
  });
  assert.deepEqual(result, { events: [], upperBound: 9 });
  assert.deepEqual(delays, [10, 20, 2_000]);
});

test('REST snapshot retries a transient response parse failure without returning partial pages', async () => {
  const responses = [
    new Response('{bad json', { status: 200 }),
    jsonResponse({ asset_events: [{ id: 'ok' }], next: null }),
  ];
  const delays = [];
  const result = await fetchOpenSeaSalesSnapshot({
    fetchImpl: async () => responses.shift(),
    apiKey: 'key', slug: 'loopers', after: 0, before: 9,
    retry: { maxAttempts: 2, baseDelayMs: 7, jitter: () => 0, sleep: async ms => delays.push(ms) },
  });
  assert.deepEqual(result, { events: [{ id: 'ok' }], upperBound: 9 });
  assert.deepEqual(delays, [7]);
});

test('REST snapshot treats 401/403 as fatal and redacts credentials', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(fetchOpenSeaSalesSnapshot({
      fetchImpl: async () => jsonResponse({ key: 'secret-key' }, status),
      apiKey: 'secret-key', slug: 'loopers', after: 0, before: 9,
    }), error => {
      assert.equal(error.fatal, true);
      assert.doesNotMatch(error.message, /secret-key|X-API-KEY|authorization/i);
      return true;
    });
  }
});

test('classifyOpenSeaError honors numeric Retry-After and rejects unsafe bounds', () => {
  assert.deepEqual(classifyOpenSeaError(jsonResponse({}, 429, { 'retry-after': '4' })), {
    status: 429, fatal: false, retryable: true, retryAfterMs: 4_000,
  });
  assert.equal(classifyOpenSeaError(jsonResponse({}, 429, { 'retry-after': '999999' })).retryAfterMs, null);
  assert.equal(classifyOpenSeaError(jsonResponse({}, 400)).retryable, false);
});

class FakeTimers {
  constructor() { this.nextId = 1; this.tasks = new Map(); }
  setTimeout = (fn, delay) => { const id = this.nextId++; this.tasks.set(id, { fn, delay }); return id; };
  clearTimeout = id => this.tasks.delete(id);
  delays() { return [...this.tasks.values()].map(task => task.delay); }
  runDelay(delay) {
    const match = [...this.tasks].find(([, task]) => task.delay === delay);
    assert.ok(match, `missing timer at ${delay}ms; found ${this.delays()}`);
    this.tasks.delete(match[0]);
    match[1].fn();
  }
}

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  emit(name, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
  open() { this.readyState = FakeWebSocket.OPEN; this.emit('open'); }
  receive(frame) { this.emit('message', { data: JSON.stringify(frame) }); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit('close'); }
}

function streamFixture(overrides = {}) {
  FakeWebSocket.instances = [];
  const timers = new FakeTimers();
  const logs = [];
  const sales = [];
  const ready = [];
  const stream = createOpenSeaPhoenixStream({
    apiKey: 'stream-secret', slug: 'loopers-639312714', WebSocketImpl: FakeWebSocket,
    timers,
    logger: { info: value => logs.push(value), warn: value => logs.push(value), error: value => logs.push(value) },
    onSale: value => sales.push(value), onReadyChange: value => ready.push(value),
    ...overrides,
  });
  return { stream, timers, logs, sales, ready };
}

async function acknowledgeJoin(socket) {
  const join = socket.sent.find(frame => frame[3] === 'phx_join');
  assert.ok(join);
  socket.receive([join[0], join[1], join[2], 'phx_reply', { status: 'ok', response: {} }]);
  await Promise.resolve();
  return join;
}

test('Phoenix Stream start resolves only after the matching acknowledged join', async () => {
  const { stream, logs, ready } = streamFixture();
  let settled = false;
  const starting = stream.start().then(() => { settled = true; });
  const socket = FakeWebSocket.instances[0];
  assert.match(socket.url, /^wss:\/\/stream-api\.opensea\.io\/socket\/websocket\?/);
  socket.open();
  const join = socket.sent[0];
  assert.deepEqual(join.slice(2), ['collection:loopers-639312714', 'phx_join', {}]);
  assert.equal(settled, false);
  socket.receive([join[0], 'wrong-ref', join[2], 'phx_reply', { status: 'ok' }]);
  await Promise.resolve();
  assert.equal(settled, false);
  await acknowledgeJoin(socket);
  await starting;
  assert.equal(stream.isReady(), true);
  assert.deepEqual(ready, [true]);
  assert.doesNotMatch(JSON.stringify(logs), /stream-secret|socket\/websocket\?/);
  await stream.stop();
});

test('Phoenix Stream routes only valid joined-topic item_sold frames', async () => {
  const { stream, sales } = streamFixture();
  const starting = stream.start();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  const join = await acknowledgeJoin(socket);
  await starting;
  socket.receive([join[0], '9', join[2], 'item_sold', { id: 1 }]);
  socket.receive([join[0], '10', 'collection:wrong', 'item_sold', { id: 2 }]);
  socket.emit('message', { data: '{bad json' });
  socket.receive({ event: 'item_sold' });
  assert.deepEqual(sales, [{ id: 1 }]);
  await stream.stop();
});

test('Phoenix join rejection and timeout reject start without leaking authenticated URL', async () => {
  for (const mode of ['reject', 'timeout']) {
    const { stream, timers } = streamFixture();
    const starting = stream.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    const join = socket.sent[0];
    if (mode === 'reject') socket.receive([join[0], join[1], join[2], 'phx_reply', { status: 'error', response: { reason: 'no' } }]);
    else timers.runDelay(10_000);
    await assert.rejects(starting, error => {
      assert.doesNotMatch(error.message, /stream-secret|socket\/websocket\?/);
      return true;
    });
    await stream.stop();
  }
});

test('Phoenix heartbeat requires a matching reply before the next deadline', async () => {
  const { stream, timers, ready } = streamFixture();
  const starting = stream.start();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  await acknowledgeJoin(socket);
  await starting;
  timers.runDelay(30_000);
  const heartbeat = socket.sent.at(-1);
  assert.deepEqual(heartbeat.slice(2), ['phoenix', 'heartbeat', {}]);
  timers.runDelay(30_000);
  assert.equal(stream.isReady(), false);
  assert.deepEqual(ready, [true, false]);
  await stream.stop();
});

test('Phoenix close starts one bounded reconnect/rejoin loop and stop cancels it', async () => {
  const { stream, timers, ready } = streamFixture();
  const starting = stream.start();
  const first = FakeWebSocket.instances[0];
  first.open();
  await acknowledgeJoin(first);
  await starting;
  first.close();
  first.emit('close');
  assert.equal(stream.isReady(), false);
  assert.deepEqual(ready, [true, false]);
  assert.deepEqual(timers.delays(), [1_000]);
  timers.runDelay(1_000);
  assert.equal(FakeWebSocket.instances.length, 2);
  const second = FakeWebSocket.instances[1];
  second.open();
  await acknowledgeJoin(second);
  assert.equal(stream.isReady(), true);
  await stream.stop();
  assert.equal(timers.tasks.size, 0);
});

test('Phoenix stop cancels pending start and settles its promise', async () => {
  const { stream, timers } = streamFixture();
  const starting = stream.start();
  assert.equal(FakeWebSocket.instances.length, 1);
  await stream.stop();
  await assert.rejects(starting, /stopped/i);
  assert.equal(timers.tasks.size, 0);
  assert.equal(stream.isReady(), false);
});

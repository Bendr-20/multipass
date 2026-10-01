import assert from 'node:assert/strict';
import test from 'node:test';
import {
  block,
  createFakeTime,
  loadActivationUnits,
  makeRpcFetch,
  rpcResponse,
} from './activate-looper-3802-fixture.mjs';

const MAINNET = 'https://mainnet.base.org';
const DRPC = 'https://base.drpc.org';
const PUBLICNODE = 'https://base-rpc.publicnode.com';
const ADDRESS = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const HASH = `0x${'ab'.repeat(32)}`;
const BLOCK_REF = Object.freeze({ blockHash: HASH, requireCanonical: true });
const TRANSACTION = Object.freeze({ to: ADDRESS, data: '0x8da5cb5b' });

function createTransport(unit, fetch, extra = {}) {
  return unit.createPublicRpcTransport({
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    sleep: async () => {},
    now: () => 0,
    ...extra,
  });
}

test('routing maps each request kind to exact approved origin method and params', async () => {
  const unit = await loadActivationUnits();
  assert.deepEqual(JSON.parse(JSON.stringify(unit.ROUTE_MATRIX)), {
    [MAINNET]: ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt'],
    [DRPC]: ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt', 'trace'],
    [PUBLICNODE]: ['chainId', 'latestBlock', 'blockByNumber', 'transaction', 'receipt'],
  });
  const fixtures = [
    [{ kind: 'chainId' }, 'eth_chainId', []],
    [{ kind: 'latestBlock' }, 'eth_getBlockByNumber', ['latest', false]],
    [{ kind: 'blockByNumber', number: 26n }, 'eth_getBlockByNumber', ['0x1a', false]],
    [{ kind: 'code', address: ADDRESS, blockRef: BLOCK_REF }, 'eth_getCode', [ADDRESS, BLOCK_REF]],
    [{ kind: 'storage', address: ADDRESS, slot: `0x${'00'.repeat(32)}`, blockRef: BLOCK_REF }, 'eth_getStorageAt', [ADDRESS, `0x${'00'.repeat(32)}`, BLOCK_REF]],
    [{ kind: 'balance', address: ADDRESS, blockRef: BLOCK_REF }, 'eth_getBalance', [ADDRESS, BLOCK_REF]],
    [{ kind: 'call', transaction: TRANSACTION, blockRef: BLOCK_REF }, 'eth_call', [TRANSACTION, BLOCK_REF]],
    [{ kind: 'estimate', transaction: TRANSACTION, blockRef: BLOCK_REF }, 'eth_estimateGas', [TRANSACTION, BLOCK_REF]],
    [{ kind: 'gasPrice' }, 'eth_gasPrice', []],
    [{ kind: 'transaction', hash: HASH }, 'eth_getTransactionByHash', [HASH]],
    [{ kind: 'receipt', hash: HASH }, 'eth_getTransactionReceipt', [HASH]],
    [{ kind: 'trace', hash: HASH }, 'debug_traceTransaction', [HASH, { tracer: 'callTracer', timeout: '20s', tracerConfig: { onlyTopCall: false, withLog: true } }]],
  ];
  for (const [request, method, params] of fixtures) {
    assert.deepEqual(JSON.parse(JSON.stringify(unit.buildRpcRequest(request, 19))), { jsonrpc: '2.0', id: 19, method, params });
  }
  assert.throws(() => unit.buildRpcRequest({ kind: 'chainId', extra: true }, 1), /unknown|keys/i);
  assert.throws(() => unit.buildRpcRequest({ kind: 'nope' }, 1), /request kind/i);
});

test('public transport hides low-level request and generic state failover while retaining bounded reads and dRPC-only trace', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(({ body }) => body.method === 'debug_traceTransaction' ? { type: 'CALL' } : '0x1');
  const transport = createTransport(unit, fetch);

  assert.equal(transport.request, undefined);
  assert.equal(transport.standard, undefined);
  assert.equal(typeof transport.readNonState, 'function');
  assert.equal(typeof transport.traceTransaction, 'function');

  for (const request of [
    { kind: 'code', address: ADDRESS, blockRef: BLOCK_REF },
    { kind: 'storage', address: ADDRESS, slot: `0x${'00'.repeat(32)}`, blockRef: BLOCK_REF },
    { kind: 'balance', address: ADDRESS, blockRef: BLOCK_REF },
    { kind: 'call', transaction: TRANSACTION, blockRef: BLOCK_REF },
    { kind: 'estimate', transaction: TRANSACTION, blockRef: BLOCK_REF },
  ]) {
    await assert.rejects(transport.readNonState(Object.freeze(request)), /non-state|state request/i);
  }
  assert.equal(calls.length, 0);

  const gasPrice = await transport.readNonState(Object.freeze({ kind: 'gasPrice' }));
  assert.equal(gasPrice.origin, MAINNET);
  assert.equal(gasPrice.result, '0x1');
  const trace = await transport.traceTransaction(HASH);
  assert.equal(trace.origin, DRPC);
  assert.deepEqual(calls.map(({ url, body }) => [url, body.method]), [
    [MAINNET, 'eth_gasPrice'],
    [DRPC, 'debug_traceTransaction'],
  ]);
});

test('origin allowlist rejects forbidden routes before fetch', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => '0x');
  const transport = createTransport(unit, fetch);
  for (const kind of ['code', 'storage', 'balance', 'call', 'estimate', 'trace']) {
    const request = kind === 'code' ? { kind, address: ADDRESS, blockRef: BLOCK_REF }
      : kind === 'storage' ? { kind, address: ADDRESS, slot: `0x${'00'.repeat(32)}`, blockRef: BLOCK_REF }
        : kind === 'balance' ? { kind, address: ADDRESS, blockRef: BLOCK_REF }
          : ['call', 'estimate'].includes(kind) ? { kind, transaction: TRANSACTION, blockRef: BLOCK_REF }
            : { kind, hash: HASH };
    await assert.rejects(transport.readNonState(Object.freeze(request)), /state request/i);
  }
  assert.equal(calls.length, 0);
  await transport.traceTransaction(HASH);
  assert.deepEqual(calls.map(({ url, body }) => [url, body.method]), [[DRPC, 'debug_traceTransaction']]);
});

test('routing accepts only frozen typed request objects', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => '0x2105');
  const transport = createTransport(unit, fetch);
  await assert.rejects(transport.readNonState({ kind: 'chainId' }), /frozen/i);
  assert.equal(calls.length, 0);
  assert.equal((await transport.readNonState(Object.freeze({ kind: 'chainId' }))).result, '0x2105');
});

test('routing sends strict POST options without credentials redirects or query strings', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => '0x2105');
  const transport = createTransport(unit, fetch);
  const evidence = await transport.readNonState(Object.freeze({ kind: 'chainId' }));
  assert.equal(evidence.result, '0x2105');
  assert.equal(evidence.origin, MAINNET);
  assert.deepEqual(Object.keys(calls[0].options).sort(), ['body', 'credentials', 'headers', 'method', 'redirect', 'signal'].sort());
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.headers)), { 'content-type': 'application/json' });
  assert.equal(new URL(calls[0].url).search, '');
  assert.ok(Object.isFrozen(evidence));
});

test('canonical native trailing-slash response URLs are accepted without relaxing URL boundaries', async () => {
  const unit = await loadActivationUnits();
  const canonicalFetch = async (url, options) => rpcResponse(`${url}/`, {
    jsonrpc: '2.0',
    id: JSON.parse(options.body).id,
    result: '0x2105',
  });
  assert.equal(
    (await createTransport(unit, canonicalFetch).readNonState(Object.freeze({ kind: 'chainId' }))).result,
    '0x2105',
  );

  for (const overrides of [
    { url: `${MAINNET}/rpc` },
    { url: `${MAINNET}/?key=value` },
    { url: 'https://user:pass@mainnet.base.org/' },
    { url: `${DRPC}/` },
    { url: `${MAINNET}/`, redirected: true },
  ]) {
    const fetch = async (url, options) => rpcResponse(url, {
      jsonrpc: '2.0',
      id: JSON.parse(options.body).id,
      result: '0x2105',
    }, overrides);
    await assert.rejects(
      createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })),
      /redirect|URL/i,
    );
  }
});

test('redirects and response URL mismatches fail closed before body acceptance', async () => {
  const unit = await loadActivationUnits();
  for (const overrides of [
    { redirected: true },
    { url: `${MAINNET}/redirected` },
  ]) {
    const fetch = async (url, options) => rpcResponse(url, { jsonrpc: '2.0', id: JSON.parse(options.body).id, result: '0x2105' }, overrides);
    await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /redirect|URL/i);
  }
});

test('HTTP 429 and 5xx permit one whole-origin failover while 4xx fails immediately', async () => {
  const unit = await loadActivationUnits();
  for (const status of [429, 500, 503]) {
    const { fetch, calls } = makeRpcFetch(({ url }) => url === MAINNET
      ? rpcResponse(url, '', { ok: false, status })
      : '0x2105');
    assert.equal((await createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' }))).origin, DRPC);
    assert.deepEqual(calls.map(({ url }) => url), [MAINNET, DRPC]);
  }
  const { fetch, calls } = makeRpcFetch(({ url }) => rpcResponse(url, '', { ok: false, status: 400 }));
  await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /HTTP 400/i);
  assert.equal(calls.length, 1);
});

test('envelope validation rejects malformed JSON-RPC shapes and id mismatch', async () => {
  const unit = await loadActivationUnits();
  const cases = [
    ({ id }) => ({ jsonrpc: '2.0', id, result: '0x2105', extra: true }),
    ({ id }) => ({ jsonrpc: '2.0', id: id + 1, result: '0x2105' }),
    ({ id }) => ({ jsonrpc: '2.0', id }),
    ({ id }) => ({ jsonrpc: '2.0', id, result: 'x', error: { code: -1, message: 'x' } }),
    ({ id }) => ({ jsonrpc: '2.0', id, error: { code: '-1', message: 'x' } }),
    ({ id }) => ({ jsonrpc: '2.0', id, error: { code: -1, message: 'x', extra: true } }),
    () => '{"jsonrpc":"2.0"} trailing',
  ];
  for (const fixture of cases) {
    const fetch = async (url, options) => {
      const id = JSON.parse(options.body).id;
      const payload = fixture({ id });
      return rpcResponse(url, typeof payload === 'string' ? payload : JSON.stringify(payload));
    };
    await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /JSON|envelope|id|error/i);
  }
});

test('response bytes enforce exact standard and trace caps', async () => {
  const unit = await loadActivationUnits();
  assert.deepEqual(JSON.parse(JSON.stringify(unit.TRANSPORT_BOUNDS)), {
    STANDARD_TIMEOUT_MS: 10000,
    TRACE_TIMEOUT_MS: 25000,
    MAX_STANDARD_RESPONSE_BYTES: 1048576,
    MAX_TRACE_RESPONSE_BYTES: 4194304,
    MAX_HTTP_ATTEMPTS_PER_ORIGIN: 1,
    RETRY_DELAYS_MS: [],
    MAX_STATE_BATCH_REQUESTS: 64,
    MAX_STATE_PLAN_DEPTH: 8,
    MAX_STATE_PLAN_NODES: 1024,
    MAX_STATE_PLAN_STRING_CHARS: 262144,
  });
  const fetch = async (url, options) => rpcResponse(url, JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(options.body).id, result: '0x' }), {
    headers: { get: () => String(1048577) },
  });
  await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /response.*bytes|large/i);
  const traceFetch = async (url, options) => rpcResponse(url, 'x'.repeat(4194305), { headers: { get: () => String(4194305) } });
  await assert.rejects(createTransport(unit, traceFetch).traceTransaction(HASH), /response.*bytes|large/i);
});

test('content-length-less bodies are streamed and stopped at the byte cap', async () => {
  const unit = await loadActivationUnits();
  let cancelled = false;
  let reads = 0;
  const oversized = new Uint8Array(unit.TRANSPORT_BOUNDS.MAX_STANDARD_RESPONSE_BYTES + 1);
  const fetch = async (url) => ({
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => {
          reads += 1;
          return reads === 1 ? { done: false, value: oversized } : { done: true };
        },
        cancel: async () => { cancelled = true; },
        releaseLock: () => {},
      }),
    },
    text: async () => { throw new Error('must not buffer an unbounded response'); },
  });
  await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /response.*bytes|limit/i);
  assert.equal(reads, 1);
  assert.equal(cancelled, true);
});

test('trace timeout aborts one dRPC request with no HTTP retry', async () => {
  const unit = await loadActivationUnits();
  let attempts = 0;
  const fetch = async (_url, options) => {
    attempts += 1;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  };
  const timers = [];
  const transport = createTransport(unit, fetch, {
    setTimeout: (callback, milliseconds) => { timers.push(milliseconds); queueMicrotask(callback); return 1; },
    clearTimeout: () => {},
  });
  await assert.rejects(transport.traceTransaction(HASH), /timeout|abort/i);
  assert.deepEqual(timers, [25000]);
  assert.equal(attempts, 1);
});

test('timeout remains active through response body consumption', async () => {
  const unit = await loadActivationUnits();
  let fireTimer;
  let timerCleared = false;
  let bodyStarted = false;
  const fetch = async (url, options) => ({
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => '32' },
    text: async () => {
      bodyStarted = true;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    },
  });
  const transport = createTransport(unit, fetch, {
    setTimeout: (callback) => { fireTimer = callback; return 1; },
    clearTimeout: () => { timerCleared = true; },
  });
  const pending = transport.traceTransaction(HASH);
  while (!bodyStarted) await Promise.resolve();
  assert.equal(timerCleared, false, 'timeout must remain armed until the complete body is consumed');
  fireTimer();
  await assert.rejects(pending, /timeout|abort/i);
});

test('stream-body network abort remains eligible for one standard-origin failover', async () => {
  const unit = await loadActivationUnits();
  const timerCallbacks = [];
  let mainnetReadStarted = false;
  const calls = [];
  const fetch = async (url, options) => {
    calls.push(url);
    if (url === DRPC) return rpcResponse(url, { jsonrpc: '2.0', id: JSON.parse(options.body).id, result: '0x2105' });
    return {
      ok: true,
      status: 200,
      redirected: false,
      url,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () => {
            mainnetReadStarted = true;
            return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
          },
          releaseLock: () => {},
        }),
      },
    };
  };
  const transport = createTransport(unit, fetch, {
    setTimeout: (callback) => { timerCallbacks.push(callback); return timerCallbacks.length; },
    clearTimeout: () => {},
  });
  const pending = transport.readNonState(Object.freeze({ kind: 'chainId' }));
  while (!mainnetReadStarted) await Promise.resolve();
  timerCallbacks[0]();
  const result = await pending;
  assert.equal(result.origin, DRPC);
  assert.deepEqual(calls, [MAINNET, DRPC]);
});

test('semantic errors fail immediately while only bounded transient classes permit standard failover', async () => {
  const unit = await loadActivationUnits();
  for (const error of [
    { code: -32602, message: 'malformed input unrelated to EIP objects' },
    { code: -32000, message: 'unknown block' },
    { code: -32001, message: 'unauthorized request' },
  ]) {
    const { fetch, calls } = makeRpcFetch(() => ({ errorEnvelope: error }));
    await assert.rejects(createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' })), /RPC|input|block|unauthorized/i);
    assert.equal(calls.length, 1);
  }
  for (const error of [
    { code: -32005, message: 'request rejected' },
    { code: -32016, message: 'backend unavailable' },
    { code: -32000, message: 'temporarily busy' },
  ]) {
    const { fetch, calls } = makeRpcFetch(({ url }) => url === MAINNET ? { errorEnvelope: error } : '0x2105');
    const evidence = await createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' }));
    assert.equal(evidence.origin, DRPC);
    assert.deepEqual(calls.map(({ url }) => url), [MAINNET, DRPC]);
  }
});

test('EIP-1898 capability detection accepts only the exact code and phrase pair', async () => {
  const unit = await loadActivationUnits();
  for (const message of [
    'blockHash is not supported',
    'requireCanonical unsupported',
    'EIP-1898 unavailable',
    'invalid argument: expected object',
    'cannot unmarshal object into Go value',
  ]) {
    assert.equal(unit.isEip1898Unsupported({ code: -32602, message }), true, message);
    assert.equal(unit.isEip1898Unsupported({ code: -32000, message }), true, message);
  }
  for (const error of [
    { code: -32603, message: 'blockHash unsupported' },
    { code: -32602, message: 'unknown block' },
    { code: -32000, message: 'invalid argument string' },
    { code: -32000, message: 'cannot unmarshal number' },
  ]) assert.equal(unit.isEip1898Unsupported(error), false, error.message);
});

test('EIP-1898 unsupported classification excludes block lookup and canonicality failures', async () => {
  const unit = await loadActivationUnits();
  for (const message of [
    'blockHash object parameters are not supported',
    'provider does not support requireCanonical',
    'EIP-1898 is unavailable',
    'invalid argument 1: expected object block parameter',
    'cannot unmarshal object into Go value of type string',
  ]) {
    assert.equal(unit.isEip1898Unsupported({ code: -32000, message }), true, message);
  }
  for (const message of [
    'unknown blockHash',
    'blockHash not found',
    'blockHash object references a noncanonical block',
    'requireCanonical canonicality check failed',
    'unknown block for EIP-1898 object argument',
    'EIP-1898 unsupported because canonicality target was not-found',
  ]) {
    assert.equal(unit.isEip1898Unsupported({ code: -32000, message }), false, message);
  }
});

test('canonical head anchors the minimum three-provider height to one hash', async () => {
  const unit = await loadActivationUnits();
  const latest = new Map([[MAINNET, block(101)], [DRPC, block(100)], [PUBLICNODE, block(102)]]);
  const { fetch, calls } = makeRpcFetch(({ url, body }) => {
    if (body.method === 'eth_chainId') return '0x2105';
    if (body.params[0] === 'latest') return latest.get(url);
    return block(100);
  });
  const anchor = await createTransport(unit, fetch).anchorCanonicalHead();
  assert.deepEqual(JSON.parse(JSON.stringify(anchor)), { number: '0x64', hash: `0x${'11'.repeat(32)}` });
  assert.equal(calls.filter(({ body }) => body.method === 'eth_chainId').length, 3);
  assert.equal(calls.filter(({ body }) => body.params[0] === 'latest').length, 3);
  assert.deepEqual(calls.filter(({ body }) => body.params[0] === '0x64').map(({ url }) => url).sort(), [MAINNET, DRPC, PUBLICNODE].sort());
});

test('fixed block canonicality requires the same expected hash from all three origins', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => block(100, 'ab'));
  const transport = createTransport(unit, fetch);
  const verified = await transport.verifyCanonicalBlock('0x64', HASH);
  assert.equal(verified.hash, HASH); assert.equal(calls.length, 3);
  const mismatch = makeRpcFetch(({ url }) => block(100, url === PUBLICNODE ? 'cd' : 'ab'));
  await assert.rejects(createTransport(unit, mismatch.fetch).verifyCanonicalBlock('0x64', HASH), /quorum|hash/i);
});

test('canonical head rejects wrong chain behind null block and hash disagreement', async () => {
  const unit = await loadActivationUnits();
  const scenarios = [
    ({ url, body }) => body.method === 'eth_chainId' ? (url === DRPC ? '0x1' : '0x2105') : block(100),
    ({ body }) => body.method === 'eth_chainId' ? '0x2105' : body.params[0] === 'latest' ? block(100) : null,
    ({ url, body }) => body.method === 'eth_chainId' ? '0x2105' : body.params[0] === 'latest' ? block(url === DRPC ? 99 : 100) : block(99, url === PUBLICNODE ? '22' : '11'),
  ];
  for (const handler of scenarios) {
    const { fetch } = makeRpcFetch(handler);
    await assert.rejects(createTransport(unit, fetch).anchorCanonicalHead(), /chain|block|hash|canonical/i);
  }
});

test('stateBatch validates clones freezes and bounds its complete plan synchronously before I/O', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(({ body }) => body.method === 'eth_getCode' ? '0x1234' : '0x');
  const transport = createTransport(unit, fetch);
  const valid = { kind: 'code', address: ADDRESS };

  let rejectedPromise;
  assert.throws(() => {
    rejectedPromise = transport.stateBatch({ number: '0x64', hash: HASH }, [valid, { kind: 'nope' }]);
    rejectedPromise?.catch?.(() => {});
  }, /state batch|request kind|permitted/i);
  assert.equal(calls.length, 0, 'an invalid later entry must prevent all I/O');

  assert.equal(unit.TRANSPORT_BOUNDS.MAX_STATE_BATCH_REQUESTS, 64);
  assert.throws(() => {
    rejectedPromise = transport.stateBatch(
      { number: '0x64', hash: HASH },
      Array.from({ length: 65 }, () => ({ ...valid })),
    );
    rejectedPromise?.catch?.(() => {});
  }, /64|batch.*limit|too many/i);
  assert.equal(calls.length, 0, 'an oversized plan must prevent all I/O');

  const sparsePlan = [{ ...valid }];
  sparsePlan.length = 2;
  assert.throws(() => {
    rejectedPromise = transport.stateBatch({ number: '0x64', hash: HASH }, sparsePlan);
    rejectedPromise?.catch?.(() => {});
  }, /sparse|missing|state batch/i);
  assert.equal(calls.length, 0, 'a sparse plan must prevent all I/O');

  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let first = true;
  const plannedFetch = makeRpcFetch(async ({ body }) => {
    if (first) {
      first = false;
      await firstGate;
    }
    return body.method === 'eth_getCode' ? '0x1234' : '0x';
  });
  const mutableTransaction = { to: ADDRESS, data: '0x8da5cb5b' };
  const mutablePlan = [
    { kind: 'code', address: ADDRESS },
    { kind: 'call', transaction: mutableTransaction },
  ];
  const pending = createTransport(unit, plannedFetch.fetch).stateBatch({ number: '0x64', hash: HASH }, mutablePlan);
  mutablePlan[0].address = '0x0000000000000000000000000000000000000001';
  mutableTransaction.data = '0xdeadbeef';
  mutablePlan.push({ kind: 'balance', address: ADDRESS });
  assert.equal(Object.isFrozen(mutablePlan), false, 'caller-owned plan must not be frozen in place');
  assert.equal(Object.isFrozen(mutableTransaction), false, 'caller-owned transaction must not be frozen in place');
  releaseFirst();

  const evidence = await pending;
  assert.equal(evidence.items.length, 2);
  assert.deepEqual(plannedFetch.calls.map(({ body }) => body.method), ['eth_getCode', 'eth_call']);
  assert.equal(plannedFetch.calls[0].body.params[0], ADDRESS);
  assert.equal(plannedFetch.calls[1].body.params[0].data, '0x8da5cb5b');
  assert.ok(Object.isFrozen(evidence.items[1].params));
  assert.ok(Object.isFrozen(evidence.items[1].params[0]));
});

test('whole state batch uses one provider and discards partial Mainnet evidence before dRPC failover', async () => {
  const unit = await loadActivationUnits();
  let mainStateCalls = 0;
  const { fetch, calls } = makeRpcFetch(({ url, body }) => {
    if (url === MAINNET && ['eth_getCode', 'eth_getBalance'].includes(body.method)) {
      mainStateCalls += 1;
      if (mainStateCalls === 2) return rpcResponse(url, 'busy', { ok: false, status: 503 });
    }
    return body.method === 'eth_getCode' ? '0x1234' : '0x0';
  });
  const requests = [{ kind: 'code', address: ADDRESS }, { kind: 'balance', address: ADDRESS }];
  const evidence = await createTransport(unit, fetch).stateBatch({ number: '0x64', hash: HASH }, requests);
  assert.equal(evidence.origin, DRPC);
  assert.equal(evidence.items.length, 2);
  assert.deepEqual(calls.filter(({ body }) => body.method === 'eth_getCode').map(({ url }) => url), [MAINNET, DRPC]);
  assert.deepEqual(calls.filter(({ body }) => body.method === 'eth_getBalance').map(({ url }) => url), [MAINNET, DRPC]);
  assert.equal(calls.some(({ url }) => url === PUBLICNODE), false);
});

test('EIP-1898 whole state batch downgrades only to guarded same-provider number mode', async () => {
  const unit = await loadActivationUnits();
  let objectRejected = false;
  const { fetch, calls } = makeRpcFetch(({ body }) => {
    if (body.method === 'eth_getCode' && typeof body.params[1] === 'object') {
      objectRejected = true;
      return { errorEnvelope: { code: -32602, message: 'invalid argument: object blockHash unsupported' } };
    }
    if (body.method === 'eth_getBlockByNumber') return block(100, 'ab');
    if (body.method === 'eth_getCode') return '0x1234';
    if (body.method === 'eth_getBalance') return '0x0';
    throw new Error(`Unexpected ${body.method}`);
  });
  const evidence = await createTransport(unit, fetch).stateBatch({ number: '0x64', hash: HASH }, [
    { kind: 'code', address: ADDRESS },
    { kind: 'balance', address: ADDRESS },
  ]);
  assert.equal(objectRejected, true);
  assert.equal(evidence.origin, MAINNET);
  assert.equal(evidence.mode, 'number-guarded');
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getCode').length, 2);
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getBalance').length, 1);
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getBlockByNumber').length, 2);
  assert.ok(calls.filter(({ body }) => ['eth_getCode', 'eth_getBalance'].includes(body.method)).slice(1).every(({ body }) => body.params.at(-1) === '0x64'));
});

test('EIP-1898 guarded batch rejects changed before or after hash and never uses PublicNode state', async () => {
  const unit = await loadActivationUnits();
  let guards = 0;
  const { fetch, calls } = makeRpcFetch(({ url, body }) => {
    if (url === MAINNET && body.method === 'eth_getCode' && typeof body.params[1] === 'object') return { errorEnvelope: { code: -32000, message: 'EIP-1898 unavailable' } };
    if (body.method === 'eth_getBlockByNumber') {
      guards += 1;
      return block(100, guards === 2 ? 'cd' : 'ab');
    }
    return '0x';
  });
  await assert.rejects(createTransport(unit, fetch).stateBatch({ number: '0x64', hash: HASH }, [{ kind: 'code', address: ADDRESS }]), /guard|hash|canonical/i);
  assert.equal(calls.some(({ url, body }) => url === PUBLICNODE && body.method === 'eth_getCode'), false);
});

test('guarded number fallback rejects a mismatched before-guard hash', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(({ body }) => {
    if (body.method === 'eth_getCode' && typeof body.params[1] === 'object') {
      return { errorEnvelope: { code: -32000, message: 'EIP-1898 unavailable' } };
    }
    if (body.method === 'eth_getBlockByNumber') return block(100, 'cd');
    return '0x';
  });
  await assert.rejects(
    createTransport(unit, fetch).stateBatch({ number: '0x64', hash: HASH }, [{ kind: 'code', address: ADDRESS }]),
    /before-guard|hash|canonical/i,
  );
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getCode').length, 1);
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getBlockByNumber').length, 1);
});

test('partial EIP-1898 evidence is discarded before the complete guarded batch reruns', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(({ body }) => {
    if (body.method === 'eth_getBalance' && typeof body.params[1] === 'object') {
      return { errorEnvelope: { code: -32602, message: 'blockHash object unsupported' } };
    }
    if (body.method === 'eth_getBlockByNumber') return block(100, 'ab');
    if (body.method === 'eth_getCode') return '0x1234';
    if (body.method === 'eth_getBalance') return '0x0';
    throw new Error(`Unexpected ${body.method}`);
  });
  const result = await createTransport(unit, fetch).stateBatch({ number: '0x64', hash: HASH }, [
    { kind: 'code', address: ADDRESS },
    { kind: 'balance', address: ADDRESS },
  ]);
  assert.equal(result.mode, 'number-guarded');
  assert.deepEqual(calls.filter(({ body }) => body.method === 'eth_getCode').map(({ body }) => body.params[1]), [
    BLOCK_REF,
    '0x64',
  ]);
  assert.deepEqual(calls.filter(({ body }) => body.method === 'eth_getBalance').map(({ body }) => body.params[1]), [
    BLOCK_REF,
    '0x64',
  ]);
});

test('three-origin chain quorum requires 0x2105 from every origin', async () => {
  const unit = await loadActivationUnits();
  const { fetch } = makeRpcFetch(({ url }) => url === PUBLICNODE ? '0x1' : '0x2105');
  await assert.rejects(createTransport(unit, fetch).requireChainQuorum(), /0x2105|chain/i);
});

test('receipt poll generator uses exact cadence without overlap', async () => {
  const unit = await loadActivationUnits();
  const time = createFakeTime(0);
  let active = 0;
  let maximum = 0;
  const { fetch } = makeRpcFetch(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
    return null;
  });
  const iterator = createTransport(unit, fetch, { sleep: time.sleep, now: time.now }).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  await iterator.next();
  time.set(120000);
  await iterator.next();
  await iterator.next();
  assert.deepEqual(time.sleeps, [2000, 2000, 10000]);
  assert.equal(maximum, 1);
  await iterator.return();
});

test('receipt poll generator terminates before 600 seconds without a request at or after the deadline', async () => {
  const unit = await loadActivationUnits();
  const time = createFakeTime(0);
  const { fetch, calls } = makeRpcFetch(() => null);
  const observations = [];
  for await (const item of createTransport(unit, fetch, { sleep: time.sleep, now: time.now }).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })) {
    observations.push(item.observedAtMs);
  }
  assert.equal(observations.at(-1), 590000);
  assert.ok(observations.every((value) => value < 600000));
  assert.equal(calls.length, observations.length * 4);
  assert.deepEqual(time.sleeps.slice(0, 3), [2000, 2000, 2000]);
  assert.equal(time.sleeps.at(-1), 10000);
});

test('head poll generator stops at fixed deadline with exact two-second sleeps', async () => {
  const unit = await loadActivationUnits();
  const time = createFakeTime(0);
  const { fetch } = makeRpcFetch(() => block(100));
  const values = [];
  for await (const item of createTransport(unit, fetch, { sleep: time.sleep, now: time.now }).pollHeads({ deadlineMs: 4000 })) values.push(item);
  assert.equal(values.length, 2);
  assert.deepEqual(time.sleeps, [2000]);
});

test('receipt and head polling enforce shrinking fixed-deadline budgets after every RPC phase', async () => {
  const unit = await loadActivationUnits();

  let receiptNow = 599500;
  const receiptTimers = [];
  const receiptFetch = makeRpcFetch(() => {
    receiptNow += 200;
    return null;
  });
  const receiptTransport = createTransport(unit, receiptFetch.fetch, {
    now: () => receiptNow,
    setTimeout: (_callback, milliseconds) => { receiptTimers.push(milliseconds); return receiptTimers.length; },
    clearTimeout: () => {},
  });
  const receiptIterator = receiptTransport.pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
  assert.equal((await receiptIterator.next()).done, true);
  assert.deepEqual(receiptTimers, [500, 300, 100]);
  assert.deepEqual(receiptFetch.calls.map(({ url, body }) => [url, body.method]), [
    [MAINNET, 'eth_getTransactionByHash'],
    [MAINNET, 'eth_getTransactionReceipt'],
    [DRPC, 'eth_getTransactionByHash'],
  ]);

  let exactDeadlineNow = 599500;
  const exactDeadlineIncrements = [100, 100, 100, 200];
  const exactDeadlineFetch = makeRpcFetch(() => {
    exactDeadlineNow += exactDeadlineIncrements.shift();
    return null;
  });
  const exactDeadlineIterator = createTransport(unit, exactDeadlineFetch.fetch, {
    now: () => exactDeadlineNow,
  }).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
  assert.equal((await exactDeadlineIterator.next()).done, true, 'a cycle completing exactly at the deadline must not yield');
  assert.equal(exactDeadlineFetch.calls.length, 4);

  let headNow = 450;
  const headTimers = [];
  const headFetch = makeRpcFetch(() => {
    headNow += 75;
    return block(100);
  });
  const headTransport = createTransport(unit, headFetch.fetch, {
    now: () => headNow,
    setTimeout: (_callback, milliseconds) => { headTimers.push(milliseconds); return headTimers.length; },
    clearTimeout: () => {},
  });
  const headIterator = headTransport.pollHeads({ deadlineMs: 500 })[Symbol.asyncIterator]();
  assert.equal((await headIterator.next()).done, true);
  assert.deepEqual(headTimers, [50]);
  assert.equal(headFetch.calls.length, 1);
});

test('throttled sleeps cannot issue receipt or head requests after fixed deadlines', async () => {
  const unit = await loadActivationUnits();
  for (const kind of ['receipt', 'head']) {
    let now = 0;
    const { fetch, calls } = makeRpcFetch(() => kind === 'head' ? block(100) : null);
    const transport = createTransport(unit, fetch, {
      now: () => now,
      sleep: async () => { now = kind === 'head' ? 4001 : 600001; },
    });
    const iterator = kind === 'head'
      ? transport.pollHeads({ deadlineMs: 4000 })[Symbol.asyncIterator]()
      : transport.pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).done, false);
    const callsAtDeadline = calls.length;
    assert.equal((await iterator.next()).done, true);
    assert.equal(calls.length, callsAtDeadline, `${kind} poll issued a request after its deadline`);
  }
});

test('eligible transient poll-cycle failures continue on exact cadence while aborts and semantics propagate', async () => {
  const unit = await loadActivationUnits();

  for (const pollKind of ['receipt', 'head']) {
    const time = createFakeTime(0);
    let failed = false;
    const { fetch, calls } = makeRpcFetch(({ url }) => {
      if (!failed && url === MAINNET) {
        failed = true;
        time.set(750);
        return rpcResponse(url, '', { ok: false, status: 503 });
      }
      return pollKind === 'head' ? block(100) : null;
    });
    const transport = createTransport(unit, fetch, { now: time.now, sleep: time.sleep });
    const iterator = pollKind === 'head'
      ? transport.pollHeads({ deadlineMs: 10000 })[Symbol.asyncIterator]()
      : transport.pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
    const result = await iterator.next();
    assert.equal(result.done, false, `${pollKind} poll must recover from one eligible transient cycle`);
    assert.equal(result.value.observedAtMs, 2000);
    assert.deepEqual(time.sleeps, [1250]);
    assert.equal(calls.filter(({ url }) => url === MAINNET).length >= 2, true);
    await iterator.return();
  }

  const semantic = makeRpcFetch(() => ({ errorEnvelope: { code: -32000, message: 'unknown block' } }));
  const semanticIterator = createTransport(unit, semantic.fetch).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
  await assert.rejects(semanticIterator.next(), /unknown block/i);

  const controller = new AbortController();
  const abortReason = new Error('caller stopped polling');
  let requestStarted = false;
  const abortFetch = async (_url, options) => {
    requestStarted = true;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  };
  const abortIterator = createTransport(unit, abortFetch).pollTransactionReceipt({
    hash: HASH,
    createdAtMs: 0,
    signal: controller.signal,
  })[Symbol.asyncIterator]();
  const pending = abortIterator.next();
  while (!requestStarted) await Promise.resolve();
  controller.abort(abortReason);
  await assert.rejects(pending, (error) => error === abortReason);
});

test('abort polling stops before another public request', async () => {
  const unit = await loadActivationUnits();
  const controller = new AbortController();
  let sleeps = 0;
  const { fetch, calls } = makeRpcFetch(() => null);
  const transport = createTransport(unit, fetch, {
    now: () => 0,
    sleep: async () => { sleeps += 1; controller.abort(new DOMException('Aborted', 'AbortError')); },
  });
  const iterator = transport.pollTransactionReceipt({ hash: HASH, createdAtMs: 0, signal: controller.signal })[Symbol.asyncIterator]();
  await iterator.next();
  await assert.rejects(iterator.next(), /abort/i);
  assert.equal(sleeps, 1);
  assert.equal(calls.length, 4);
});

test('caller abort stops standard failover before another request', async () => {
  const unit = await loadActivationUnits();
  const controller = new AbortController();
  const { fetch, calls } = makeRpcFetch(() => '0x2105');
  controller.abort(new DOMException('Aborted', 'AbortError'));
  await assert.rejects(
    createTransport(unit, fetch).readNonState(Object.freeze({ kind: 'chainId' }), { signal: controller.signal }),
    /abort/i,
  );
  assert.equal(calls.length, 0);
});

test('final receipt quorum performs one Mainnet dRPC transaction-receipt pair and one PublicNode receipt', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => null);
  const result = await createTransport(unit, fetch).finalReceiptQuorum(HASH);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(calls.map(({ url, body }) => [url, body.method]), [
    [MAINNET, 'eth_getTransactionByHash'], [MAINNET, 'eth_getTransactionReceipt'],
    [DRPC, 'eth_getTransactionByHash'], [DRPC, 'eth_getTransactionReceipt'],
    [PUBLICNODE, 'eth_getTransactionReceipt'],
  ]);
});

test('polling never yields evidence stamped at its fixed deadline', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => null);
  const iterator = createTransport(unit, fetch, {
    now: () => (calls.length < 4 ? 599999 : 600000),
    sleep: async () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  }).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
  const result = await iterator.next();
  assert.equal(result.done, true);
});

test('poll cadence catch-up is constant-time after a huge or non-finite clock jump', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => null);
  for (const jumped of [10_000_000_000, Number.POSITIVE_INFINITY]) {
    let nowCalls = 0;
    const iterator = createTransport(unit, fetch, {
      now: () => (nowCalls++ === 0 ? 0 : jumped),
      sleep: async () => {},
    }).pollTransactionReceipt({ hash: HASH, createdAtMs: 0 })[Symbol.asyncIterator]();
    const result = await iterator.next();
    assert.equal(result.done, true);
    assert.ok(nowCalls < 20, `clock catch-up used ${nowCalls} now() calls`);
  }
  assert.equal(calls.length, 0);
});

test('classifies only exact undeployed and deployed activation account states', async () => {
  const unit = await loadActivationUnits(['00-namespace.js', '01-pinset-encoding.js', '03-snapshot-validator.js']);
  assert.equal(unit.classifyAccount('0x', '0x0'), 'undeployed_zero');
  assert.equal(unit.classifyAccount('0x', '0x1'), 'unexpected_funded');
  assert.equal(unit.classifyAccount(unit.EXPECTED_ACCOUNT_RUNTIME, '0x0'), 'deployed_exact');
  assert.equal(unit.classifyAccount(unit.EXPECTED_ACCOUNT_RUNTIME, '0x1'), 'unexpected_funded');
  assert.equal(unit.classifyAccount('0x1234', '0x0'), 'wrong_code');
  assert.equal(unit.classifyAccount('0x1', '0x0'), 'malformed_code');
});

test('preflight plan covers every pinned code slot call simulation gas and account read', async () => {
  const unit = await loadActivationUnits(['00-namespace.js', '01-pinset-encoding.js', '03-snapshot-validator.js']);
  const keys = unit.PREFLIGHT_PLAN.map(({ key }) => key);
  for (const name of Object.keys(unit.PINSET.identities)) assert.ok(keys.includes(`code:${name}`), `missing code:${name}`);
  for (const name of ['loopers','adapter','identityRegistry','sponsor']) assert.ok(keys.includes(`slot:${name}`));
  for (const name of Object.keys(unit.CALLS)) assert.ok(keys.includes(`call:${name}`));
  for (const key of ['accountCode','accountBalance','simulation','estimateGas']) assert.ok(keys.includes(key));
  assert.equal(keys.includes('gasPrice'), false, 'gas price is fetched separately because it is not block state');
  assert.ok(Object.isFrozen(unit.PREFLIGHT_PLAN));
});

test('snapshot validator rejects mixed-origin mismatched and unknown transport evidence', async () => {
  const unit = await loadActivationUnits(['00-namespace.js', '01-pinset-encoding.js', '03-snapshot-validator.js']);
  const plan = [{ key: 'code', request: { kind: 'code', address: ADDRESS } }];
  const bundle = { origin: MAINNET, mode: 'eip-1898', anchor: { number: '0x64', hash: HASH }, items: [{ origin: MAINNET, method: 'eth_getCode', params: [ADDRESS, { blockHash: HASH, requireCanonical: true }], result: '0x' }] };
  assert.equal(unit.validateBundleMetadata(bundle, plan), true);
  assert.throws(() => unit.validateBundleMetadata({ ...bundle, extra: true }, plan), /unknown|keys/i);
  assert.throws(() => unit.validateBundleMetadata({ ...bundle, items: [{ ...bundle.items[0], origin: DRPC }] }, plan), /mixed-origin|mismatched/i);
  assert.throws(() => unit.validateBundleMetadata({ ...bundle, items: [{ ...bundle.items[0], params: [ADDRESS, '0x64'] }] }, plan), /mixed-origin|mismatched/i);
});

test('receipt-block plans separate deployed account proofs from reverted undeployed proof', async () => {
  const unit = await loadActivationUnits(['00-namespace.js', '01-pinset-encoding.js', '03-snapshot-validator.js']);
  const keys = unit.POST_STATE_PLAN.map(({ key }) => key);
  assert.equal(keys.includes('simulation'), false); assert.equal(keys.includes('estimateGas'), false); assert.equal(keys.includes('gasPrice'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(keys.filter((key) => key.startsWith('account:')).sort())), ['account:owner','account:state','account:token','account:validSigner']);
  assert.equal(unit.REVERTED_STATE_PLAN.some(({ key }) => key.startsWith('account:')), false);
  assert.equal(unit.REVERTED_STATE_PLAN.includes(unit.POST_STATE_PLAN[0]), true);
  assert.equal(unit.ACCOUNT_CALLS.validSigner.data, `${unit.SELECTORS.accountIsValidSigner}${unit.addressWord(unit.PINSET.holder)}${unit.uint256Word(64)}${unit.uint256Word(0)}`);
});

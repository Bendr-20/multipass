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

test('origin allowlist rejects forbidden routes before fetch', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => '0x');
  const transport = createTransport(unit, fetch);
  for (const kind of ['code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'trace']) {
    const request = kind === 'code' ? { kind, address: ADDRESS, blockRef: BLOCK_REF }
      : kind === 'storage' ? { kind, address: ADDRESS, slot: `0x${'00'.repeat(32)}`, blockRef: BLOCK_REF }
        : kind === 'balance' ? { kind, address: ADDRESS, blockRef: BLOCK_REF }
          : ['call', 'estimate'].includes(kind) ? { kind, transaction: TRANSACTION, blockRef: BLOCK_REF }
            : kind === 'trace' ? { kind, hash: HASH } : { kind };
    await assert.rejects(transport.request(PUBLICNODE, request), /not permitted/i);
  }
  await assert.rejects(transport.request(MAINNET, { kind: 'trace', hash: HASH }), /not permitted/i);
  await assert.rejects(transport.request('https://example.com', { kind: 'chainId' }), /origin/i);
  assert.equal(calls.length, 0);
});

test('routing sends strict POST options without credentials redirects or query strings', async () => {
  const unit = await loadActivationUnits();
  const { fetch, calls } = makeRpcFetch(() => '0x2105');
  const transport = createTransport(unit, fetch);
  const evidence = await transport.request(MAINNET, { kind: 'chainId' });
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
    await assert.rejects(createTransport(unit, fetch).request(MAINNET, { kind: 'chainId' }), /JSON|envelope|id|error/i);
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
  });
  const fetch = async (url, options) => rpcResponse(url, JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(options.body).id, result: '0x' }), {
    headers: { get: () => String(1048577) },
  });
  await assert.rejects(createTransport(unit, fetch).request(MAINNET, { kind: 'chainId' }), /response.*bytes|large/i);
  const traceFetch = async (url, options) => rpcResponse(url, 'x'.repeat(4194305), { headers: { get: () => null } });
  await assert.rejects(createTransport(unit, traceFetch).request(DRPC, { kind: 'trace', hash: HASH }), /response.*bytes|large/i);
});

test('timeout aborts one request with no HTTP retry', async () => {
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
  await assert.rejects(transport.request(MAINNET, { kind: 'chainId' }), /timeout|abort/i);
  assert.deepEqual(timers, [10000]);
  assert.equal(attempts, 1);
});

test('semantic errors fail immediately while only bounded transient classes permit standard failover', async () => {
  const unit = await loadActivationUnits();
  for (const error of [
    { code: -32602, message: 'bad parameter unrelated to EIP objects' },
    { code: -32000, message: 'unknown block' },
    { code: -32001, message: 'rate limit' },
  ]) {
    const { fetch, calls } = makeRpcFetch(() => ({ errorEnvelope: error }));
    await assert.rejects(createTransport(unit, fetch).standard({ kind: 'chainId' }), /RPC|parameter|block|rate/i);
    assert.equal(calls.length, 1);
  }
  for (const error of [
    { code: -32005, message: 'request rejected' },
    { code: -32016, message: 'backend unavailable' },
    { code: -32000, message: 'temporarily busy' },
  ]) {
    const { fetch, calls } = makeRpcFetch(({ url }) => url === MAINNET ? { errorEnvelope: error } : '0x2105');
    const evidence = await createTransport(unit, fetch).standard({ kind: 'chainId' });
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


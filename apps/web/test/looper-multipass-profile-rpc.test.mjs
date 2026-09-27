import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const sourceRoot = path.join(webRoot, 'public-profiles/loopers/src');
const manifestModule = await import(pathToFileURL(path.join(webRoot, 'public-profiles/loopers/manifests/3802.js')));
const manifest = manifestModule.default;
const MAINNET = 'https://mainnet.base.org';
const DRPC = 'https://base.drpc.org';
const ORIGINS = [MAINNET, DRPC];
const BLOCK_NUMBER = '0x400';
const BLOCK_HASH = `0x${'ab'.repeat(32)}`;
const OTHER_HASH = `0x${'cd'.repeat(32)}`;
const BLOCK_TIMESTAMP = '0x6a000000';
const NOW_MS = Number(BigInt(BLOCK_TIMESTAMP)) * 1000 + 60_000;
const WORD_ZERO = `0x${'00'.repeat(32)}`;
const ACTIVATION_HOLDER = manifest.holderAtActivation.toLowerCase();
const HOLDER = '0x1111111111111111111111111111111111111111';
const holderWord = `0x${'00'.repeat(12)}${HOLDER.slice(2)}`;

let unitPromise;
async function loadUnit() {
  unitPromise ??= (async () => {
    for (const filename of ['00-namespace.js', '01-manifest-codecs.js']) {
      vm.runInThisContext(await readFile(path.join(sourceRoot, filename), 'utf8'), { filename });
    }
    const literal = JSON.stringify(manifest).replaceAll('<', '\\u003c');
    vm.runInThisContext(`LooperMultipassProfile.MANIFEST = LooperMultipassProfile.validateManifest(${literal}, ${JSON.stringify(manifestModule.MANIFEST_LOCK)});`);
    vm.runInThisContext(await readFile(path.join(sourceRoot, '02-base-rpc.js'), 'utf8'), { filename: '02-base-rpc.js' });
    return globalThis.LooperMultipassProfile;
  })();
  return unitPromise;
}

function block(number = BLOCK_NUMBER, hash = BLOCK_HASH, timestamp = BLOCK_TIMESTAMP) {
  return { number, hash, timestamp, ignored: 'discard me' };
}

function transaction(overrides = {}) {
  return {
    hash: manifest.activation.transactionHash,
    chainId: '0x2105',
    blockNumber: manifest.activation.blockNumber,
    blockHash: manifest.activation.blockHash,
    transactionIndex: manifest.activation.transactionIndex,
    from: manifest.holderAtActivation,
    to: manifest.erc6551.registry,
    value: '0x0',
    input: '0x1234',
    nonce: '0x1',
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    transactionHash: manifest.activation.transactionHash,
    blockNumber: manifest.activation.blockNumber,
    blockHash: manifest.activation.blockHash,
    transactionIndex: manifest.activation.transactionIndex,
    status: manifest.activation.receiptStatus,
    logs: [{
      address: manifest.activation.event.address,
      topics: [...manifest.activation.event.topics],
      data: manifest.activation.event.data,
      logIndex: manifest.activation.event.logIndex,
      transactionHash: manifest.activation.transactionHash,
      transactionIndex: manifest.activation.transactionIndex,
      blockHash: manifest.activation.blockHash,
      blockNumber: manifest.activation.blockNumber,
      removed: false,
      ignored: true,
    }],
    cumulativeGasUsed: '0x1',
    ...overrides,
  };
}

function stream(bytes, chunks = [bytes]) {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[index++] };
        },
        async cancel() {},
        releaseLock() {},
      };
    },
  };
}

function rpcResponse(url, payload, {
  status = 200,
  redirected = false,
  responseUrl = url,
  contentLength = 'auto',
  chunks,
  body = true,
} = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const bytes = new TextEncoder().encode(text);
  const lengthValue = contentLength === 'auto' ? String(bytes.byteLength) : contentLength;
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    url: responseUrl,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? lengthValue : null },
    body: body ? stream(bytes, chunks ?? [bytes]) : null,
    async text() { return text; },
  };
}

function stateResult(body) {
  if (body.method === 'eth_getCode') return '0x6000';
  if (body.method === 'eth_getStorageAt') return WORD_ZERO;
  if (body.method === 'eth_getBalance') return '0x0';
  if (body.method === 'eth_call') {
    const data = body.params[0].data;
    if (data.startsWith('0x6352211e')) return holderWord;
    return WORD_ZERO;
  }
  throw new Error(`No state fixture for ${body.method}`);
}

function defaultResult({ body }) {
  if (body.method === 'eth_chainId') return '0x2105';
  if (body.method === 'eth_getBlockByNumber') {
    if (body.params[0] === 'latest') return block();
    if (body.params[0] === manifest.activation.blockNumber) {
      return block(manifest.activation.blockNumber, manifest.activation.blockHash, '0x68cf0000');
    }
    return block(body.params[0]);
  }
  if (body.method === 'eth_getTransactionByHash') return transaction();
  if (body.method === 'eth_getTransactionReceipt') return receipt();
  return stateResult(body);
}

function makeFetch(responder = defaultResult, responseOptions = () => ({})) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const call = { url, options, body, index: calls.length };
    calls.push(call);
    const result = await responder(call, calls);
    if (result && result.__response) return result.value;
    const payload = result && result.__envelope ? result.value : { jsonrpc: '2.0', id: body.id, result };
    return rpcResponse(url, payload, responseOptions(call, calls));
  };
  return { calls, fetchImpl };
}

function customResponse(value) {
  return { __response: true, value };
}

function customEnvelope(value) {
  return { __envelope: true, value };
}

async function client(fetchImpl, overrides = {}) {
  const unit = await loadUnit();
  return unit.createBaseRpcClient({ fetchImpl, clock: () => NOW_MS, ...overrides });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozen(child, seen);
}

const CURRENT_KEYS = [
  'loopersProxyCode', 'loopersImplementationSlot', 'loopersImplementationCode',
  'registryCode', 'accountImplementationCode', 'adapterProxyCode',
  'adapterImplementationSlot', 'adapterImplementationCode', 'identityRegistryProxyCode',
  'identityRegistryImplementationSlot', 'identityRegistryImplementationCode', 'accountCode',
  'accountBalance', 'accountTokenResult', 'accountOwnerResult', 'accountStateResult',
  'accountValidSignerResult', 'loopersOwnerOfResult', 'loopersTokenBoundAccountResult',
  'registryAccountResult', 'loopersErc8004BoundResult', 'loopersErc8004AgentIdResult',
  'loopersErc8004AgentUriResult', 'adapterIdentityRegistryResult', 'adapterBindingResult',
  'adapterIsControllerResult', 'identityRegistryOwnerOfResult', 'identityRegistryTokenUriResult',
];

const HISTORICAL_KEYS = [
  'transaction', 'receipt', 'accountCode', 'accountBalance', 'accountTokenResult',
  'accountOwnerResult', 'accountStateResult', 'accountValidSignerResult',
];

function stateCalls(calls) {
  return calls.filter(({ body }) => ['eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_call'].includes(body.method));
}

function assertPostBoundary(call) {
  assert.ok(ORIGINS.includes(call.url));
  assert.equal(new URL(call.url).search, '');
  assert.deepEqual(Object.keys(call.options).sort(), ['body', 'credentials', 'headers', 'method', 'redirect', 'signal'].sort());
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.credentials, 'omit');
  assert.deepEqual(call.options.headers, { 'content-type': 'application/json' });
  assert.deepEqual(Object.keys(call.body).sort(), ['id', 'jsonrpc', 'method', 'params']);
  assert.equal(call.body.jsonrpc, '2.0');
  assert.ok(Number.isSafeInteger(call.body.id) && call.body.id > 0);
}

test('exports only the closed client factory and exposes only current/historical evidence reads', async () => {
  const unit = await loadUnit();
  assert.equal(typeof unit.createBaseRpcClient, 'function');
  assert.equal(unit.request, undefined);
  assert.equal(unit.buildRpcRequest, undefined);
  assert.equal(unit.RPC_ORIGINS, undefined);
  const { fetchImpl } = makeFetch();
  const rpc = unit.createBaseRpcClient({ fetchImpl, clock: () => NOW_MS });
  assert.deepEqual(Object.keys(rpc), ['readCurrentEvidence', 'readHistoricalEvidence']);
  assert.equal(rpc.request, undefined);
  assertFrozen(rpc);
  assert.throws(() => unit.createBaseRpcClient({ fetchImpl, clock: () => NOW_MS, origin: MAINNET }), /unknown|keys|config/iu);
  await assert.rejects(rpc.readCurrentEvidence(clone(manifest)), /manifest|registered|exact/iu);
});

test('current evidence uses exact POST boundaries, canonical hash objects, one origin, and exact frozen output', async () => {
  const { calls, fetchImpl } = makeFetch();
  const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.schema, 'looper.profile.rpc-evidence');
  assert.equal(evidence.version, 1);
  assert.equal(evidence.phase, 'current');
  assert.equal(evidence.classification, 'complete');
  assert.deepEqual(evidence.selectedBlock, { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP });
  assert.equal(evidence.completeBatch.origin, MAINNET);
  assert.deepEqual(Object.keys(evidence.completeBatch.responses), CURRENT_KEYS);
  assert.equal(evidence.completeBatch.responses.loopersOwnerOfResult, holderWord);
  assertFrozen(evidence);
  for (const call of calls) assertPostBoundary(call);
  assert.equal(calls.length, 34);
  assert.deepEqual(calls.slice(0, 6).map(({ url, body }) => [url, body.method, body.params[0]]), [
    [MAINNET, 'eth_chainId', undefined],
    [MAINNET, 'eth_getBlockByNumber', 'latest'],
    [DRPC, 'eth_chainId', undefined],
    [DRPC, 'eth_getBlockByNumber', 'latest'],
    [MAINNET, 'eth_getBlockByNumber', BLOCK_NUMBER],
    [DRPC, 'eth_getBlockByNumber', BLOCK_NUMBER],
  ]);
  for (const call of stateCalls(calls)) {
    const ref = call.body.method === 'eth_call' ? call.body.params[1]
      : call.body.method === 'eth_getStorageAt' ? call.body.params[2] : call.body.params[1];
    assert.deepEqual(ref, { blockHash: BLOCK_HASH, requireCanonical: true });
  }
  const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const storageCalls = calls.filter(({ body }) => body.method === 'eth_getStorageAt');
  assert.equal(storageCalls.length, 3);
  assert.ok(storageCalls.every(({ body }) => body.params[1] === implementationSlot));
  const approvedTargets = new Set([...Object.values(manifest.contracts).map(({ address }) => address), manifest.account]);
  for (const call of stateCalls(calls)) {
    const target = call.body.method === 'eth_call' ? call.body.params[0].to : call.body.params[0];
    assert.ok(approvedTargets.has(target), `unexpected state target ${target}`);
  }
  const signerCall = calls.find(({ body }) => body.method === 'eth_call' && body.params[0].data.startsWith('0x523e3260'));
  const controllerCall = calls.find(({ body }) => body.method === 'eth_call' && body.params[0].data.startsWith('0x158e711d'));
  assert.ok(signerCall);
  assert.ok(controllerCall);
  assert.match(signerCall.body.params[0].data, new RegExp(HOLDER.slice(2), 'u'));
  assert.match(controllerCall.body.params[0].data, new RegExp(HOLDER.slice(2), 'u'));
});

test('historical evidence pins the canonical block hash, transaction/receipt hash, normalizes fields, and discards extras', async () => {
  const { calls, fetchImpl } = makeFetch();
  const evidence = await (await client(fetchImpl)).readHistoricalEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'complete');
  assert.equal(evidence.phase, 'historical');
  assert.deepEqual(evidence.selectedBlock, {
    number: manifest.activation.blockNumber,
    hash: manifest.activation.blockHash,
    timestamp: '0x68cf0000',
  });
  assert.equal(evidence.completeBatch.origin, MAINNET);
  assert.deepEqual(Object.keys(evidence.completeBatch.responses), HISTORICAL_KEYS);
  assert.deepEqual(Object.keys(evidence.completeBatch.responses.transaction), [
    'hash', 'chainId', 'blockNumber', 'blockHash', 'transactionIndex', 'from', 'to', 'value', 'input',
  ]);
  assert.deepEqual(Object.keys(evidence.completeBatch.responses.receipt), [
    'transactionHash', 'blockNumber', 'blockHash', 'transactionIndex', 'status', 'logs',
  ]);
  assert.equal(evidence.completeBatch.responses.transaction.from, ACTIVATION_HOLDER);
  assert.equal(evidence.completeBatch.responses.receipt.logs[0].address, manifest.activation.event.address.toLowerCase());
  assert.equal(calls.length, 12);
  assert.deepEqual(calls.filter(({ body }) => ['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(body.method)).map(({ body }) => body.params), [
    [manifest.activation.transactionHash], [manifest.activation.transactionHash],
  ]);
  for (const call of stateCalls(calls)) {
    const ref = call.body.method === 'eth_call' ? call.body.params[1] : call.body.params[1];
    assert.deepEqual(ref, { blockHash: manifest.activation.blockHash, requireCanonical: true });
  }
  assertFrozen(evidence);
});

test('head gaps over twenty fail unavailable before canonical or state reads', async () => {
  const { calls, fetchImpl } = makeFetch(({ url, body }) => {
    if (body.method === 'eth_chainId') return '0x2105';
    if (body.method === 'eth_getBlockByNumber' && body.params[0] === 'latest') {
      return block(url === MAINNET ? '0x100' : '0x115');
    }
    return defaultResult({ url, body });
  });
  const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'unavailable');
  assert.equal(evidence.completeBatch, null);
  assert.equal(evidence.selectedBlock, null);
  assert.equal(evidence.attempts.at(-1).code, 'head_gap');
  assert.equal(stateCalls(calls).length, 0);
  assert.equal(calls.length, 4);
});

test('chain or canonical block disagreement is mismatch and never enters batch fallback', async () => {
  for (const mode of ['chain', 'hash', 'timestamp']) {
    const { calls, fetchImpl } = makeFetch(({ url, body }) => {
      if (mode === 'chain' && body.method === 'eth_chainId' && url === DRPC) return '0x1';
      if (body.method === 'eth_getBlockByNumber' && body.params[0] === BLOCK_NUMBER && url === DRPC) {
        if (mode === 'hash') return block(BLOCK_NUMBER, OTHER_HASH, BLOCK_TIMESTAMP);
        if (mode === 'timestamp') return block(BLOCK_NUMBER, BLOCK_HASH, '0x6a000001');
      }
      return defaultResult({ url, body });
    });
    const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
    assert.equal(evidence.classification, 'mismatch', mode);
    assert.equal(evidence.completeBatch, null, mode);
    assert.equal(evidence.attempts.at(-1).code, 'block_disagreement', mode);
    assert.equal(stateCalls(calls).length, 0, mode);
  }
});

test('stale, future, and invalid client clocks classify unavailable before state reads', async () => {
  for (const now of [Number(BigInt(BLOCK_TIMESTAMP)) * 1000 + 600_001, Number(BigInt(BLOCK_TIMESTAMP)) * 1000 - 300_001, Number.NaN]) {
    const { calls, fetchImpl } = makeFetch();
    const rpc = (await loadUnit()).createBaseRpcClient({ fetchImpl, clock: () => now });
    const evidence = await rpc.readCurrentEvidence((await loadUnit()).MANIFEST);
    assert.equal(evidence.classification, 'unavailable');
    assert.equal(evidence.completeBatch, null);
    assert.equal(stateCalls(calls).length, 0);
  }
});

test('failed primary batch is discarded, the exact block is re-confirmed, and a full batch retries on fallback', async () => {
  let primaryState = 0;
  const { calls, fetchImpl } = makeFetch((call) => {
    if (call.url === MAINNET && ['eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_call'].includes(call.body.method)) {
      primaryState += 1;
      if (primaryState === 3) throw new Error('primary unavailable');
    }
    return defaultResult(call);
  });
  const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'complete');
  assert.equal(evidence.completeBatch.origin, DRPC);
  assert.deepEqual(Object.keys(evidence.completeBatch.responses), CURRENT_KEYS);
  const batchAttempts = evidence.attempts.filter(({ stage }) => stage === 'batch');
  assert.equal(batchAttempts.length, 2);
  assert.equal(batchAttempts[0].origin, MAINNET);
  assert.equal(batchAttempts[0].outcome, 'unavailable');
  assert.equal(batchAttempts[0].code, 'batch_failed');
  assert.equal(Object.keys(batchAttempts[0].observations).length, 2);
  assert.equal(batchAttempts[1].origin, DRPC);
  assert.equal(batchAttempts[1].outcome, 'complete');
  const fallbackStart = calls.findIndex(({ url, body }, index) => index > 6 && url === DRPC && body.method === 'eth_getCode');
  assert.deepEqual(calls.slice(fallbackStart - 2, fallbackStart).map(({ url, body }) => [url, body.method, body.params[0]]), [
    [MAINNET, 'eth_getBlockByNumber', BLOCK_NUMBER],
    [DRPC, 'eth_getBlockByNumber', BLOCK_NUMBER],
  ]);
  assert.equal(stateCalls(calls).filter(({ url }) => url === DRPC).length, CURRENT_KEYS.length);
});

test('partial failures from both origins never merge into a complete batch', async () => {
  const seen = { [MAINNET]: 0, [DRPC]: 0 };
  const { fetchImpl } = makeFetch((call) => {
    if (['eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_call'].includes(call.body.method)) {
      seen[call.url] += 1;
      if ((call.url === MAINNET && seen[call.url] === 10) || (call.url === DRPC && seen[call.url] === 20)) throw new Error('batch failure');
    }
    return defaultResult(call);
  });
  const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'unavailable');
  assert.equal(evidence.completeBatch, null);
  const batches = evidence.attempts.filter(({ stage }) => stage === 'batch');
  assert.equal(batches.length, 2);
  assert.equal(Object.keys(batches[0].observations).length, 9);
  assert.equal(Object.keys(batches[1].observations).length, 19);
  assertFrozen(evidence);
});

test('fallback re-confirmation disagreement has mismatch precedence over batch unavailability', async () => {
  let primaryFailed = false;
  let canonicalReads = 0;
  const { fetchImpl } = makeFetch((call) => {
    if (call.body.method === 'eth_getBlockByNumber' && call.body.params[0] === BLOCK_NUMBER) {
      canonicalReads += 1;
      if (canonicalReads === 4) return block(BLOCK_NUMBER, OTHER_HASH, BLOCK_TIMESTAMP);
    }
    if (!primaryFailed && call.url === MAINNET && call.body.method === 'eth_getCode') {
      primaryFailed = true;
      throw new Error('primary unavailable');
    }
    return defaultResult(call);
  });
  const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'mismatch');
  assert.equal(evidence.completeBatch, null);
  assert.equal(evidence.attempts.at(-1).code, 'block_disagreement');
});

test('an authoritative pinned-block mismatch cannot be masked by a later origin timeout', async () => {
  const { calls, fetchImpl } = makeFetch((call) => {
    if (call.body.method === 'eth_getBlockByNumber' && call.body.params[0] === manifest.activation.blockNumber) {
      if (call.url === MAINNET) return block(manifest.activation.blockNumber, OTHER_HASH, '0x68cf0000');
      throw new Error('later origin unavailable');
    }
    return defaultResult(call);
  });
  const evidence = await (await client(fetchImpl)).readHistoricalEvidence((await loadUnit()).MANIFEST);
  assert.equal(evidence.classification, 'mismatch');
  assert.equal(evidence.completeBatch, null);
  assert.equal(evidence.attempts.at(-1).code, 'block_disagreement');
  assert.equal(calls.some(({ url, body }) => url === DRPC && body.method === 'eth_getBlockByNumber'), false);
});

test('historical null transaction/receipt and malformed receipt bounds cannot produce complete evidence', async () => {
  const cases = [
    ({ body }) => body.method === 'eth_getTransactionByHash' ? null : defaultResult({ body }),
    ({ body }) => body.method === 'eth_getTransactionReceipt' ? null : defaultResult({ body }),
    ({ body }) => body.method === 'eth_getTransactionReceipt' ? receipt({ logs: Array.from({ length: 513 }, () => receipt().logs[0]) }) : defaultResult({ body }),
    ({ body }) => body.method === 'eth_getTransactionReceipt' ? receipt({ logs: [{ ...receipt().logs[0], topics: Array.from({ length: 9 }, () => BLOCK_HASH) }] }) : defaultResult({ body }),
  ];
  for (const responder of cases) {
    const { fetchImpl } = makeFetch((call) => responder(call));
    const evidence = await (await client(fetchImpl)).readHistoricalEvidence((await loadUnit()).MANIFEST);
    assert.notEqual(evidence.classification, 'complete');
    assert.equal(evidence.completeBatch, null);
  }
});

test('streamed response limits cover absent, false, declared, and chunk-overflow Content-Length', async () => {
  {
    const { fetchImpl } = makeFetch(defaultResult, () => ({ contentLength: null }));
    const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
    assert.equal(evidence.classification, 'complete');
  }
  for (const options of [
    { contentLength: 'false' },
    { contentLength: '1048577' },
    { contentLength: null, chunks: [new Uint8Array(600_000), new Uint8Array(600_000)] },
  ]) {
    const { fetchImpl } = makeFetch(defaultResult, () => options);
    const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
    assert.equal(evidence.classification, 'unavailable');
    assert.equal(evidence.completeBatch, null);
    assert.ok(evidence.attempts.some(({ code }) => code === 'oversized' || code === 'malformed'));
  }
});

test('per-request timeout covers a response body that stalls after headers', async () => {
  const fetchImpl = async (url, options) => ({
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: () => new Promise(() => {}),
        cancel: async () => {},
        releaseLock: () => {},
      }),
    },
  });
  const rpc = await client(fetchImpl, { perRequestTimeoutMs: 5, refreshTimeoutMs: 50 });
  const evidence = await Promise.race([
    rpc.readCurrentEvidence((await loadUnit()).MANIFEST),
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('stalled body escaped request timeout')), 100)),
  ]);
  assert.equal(evidence.classification, 'unavailable');
  assert.ok(evidence.attempts.some(({ code }) => code === 'timeout'));
});

test('per-request and whole-refresh deadlines abort and classify unavailable', async () => {
  async function hangingFetch(url, options) {
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  }
  const perRequest = await (await client(hangingFetch, { perRequestTimeoutMs: 5, refreshTimeoutMs: 50 })).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(perRequest.classification, 'unavailable');
  assert.ok(perRequest.attempts.some(({ code }) => code === 'timeout'));

  const slowBodyFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x2105' });
    const bytes = new TextEncoder().encode(payload);
    let read = false;
    return {
      ok: true,
      status: 200,
      redirected: false,
      url,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          async read() {
            if (read) return { done: true, value: undefined };
            read = true;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { done: false, value: bytes };
          },
          async cancel() {},
          releaseLock() {},
        }),
      },
    };
  };
  const bodyTimeout = await (await client(slowBodyFetch, { perRequestTimeoutMs: 5, refreshTimeoutMs: 50 })).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(bodyTimeout.classification, 'unavailable');
  assert.ok(bodyTimeout.attempts.some(({ code }) => code === 'timeout'));

  const { fetchImpl } = makeFetch(async (call) => {
    await new Promise((resolve) => setTimeout(resolve, 4));
    return defaultResult(call);
  });
  const refresh = await (await client(fetchImpl, { perRequestTimeoutMs: 50, refreshTimeoutMs: 5 })).readCurrentEvidence((await loadUnit()).MANIFEST);
  assert.equal(refresh.classification, 'unavailable');
  assert.ok(refresh.attempts.some(({ code }) => code === 'timeout'));
});

test('HTTP, redirect, RPC-error, malformed envelope, and duplicate/wrong ids fail closed', async () => {
  const cases = [
    (url, body) => customResponse(rpcResponse(url, '', { status: 503 })),
    (url, body) => customResponse(rpcResponse(url, { jsonrpc: '2.0', id: body.id, result: '0x2105' }, { redirected: true })),
    (url, body) => customEnvelope({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'no' } }),
    (url, body) => customEnvelope({ jsonrpc: '2.0', id: body.id + 1, result: '0x2105' }),
    (url, body) => customEnvelope([{ jsonrpc: '2.0', id: body.id, result: '0x2105' }, { jsonrpc: '2.0', id: body.id, result: '0x2105' }]),
    (url, body) => customEnvelope({ jsonrpc: '2.0', id: body.id, result: '0x2105', extra: true }),
  ];
  for (const fixture of cases) {
    const { fetchImpl } = makeFetch(({ url, body }) => fixture(url, body));
    const evidence = await (await client(fetchImpl)).readCurrentEvidence((await loadUnit()).MANIFEST);
    assert.equal(evidence.completeBatch, null);
    assert.notEqual(evidence.classification, 'complete');
  }
});

test('callers cannot inject an origin, target, calldata, slot, transaction hash, or block reference', async () => {
  const unit = await loadUnit();
  const { calls, fetchImpl } = makeFetch();
  const rpc = unit.createBaseRpcClient({ fetchImpl, clock: () => NOW_MS });
  for (const extra of [
    { origin: 'https://evil.example' },
    { target: '0x0000000000000000000000000000000000000001' },
    { calldata: '0xdeadbeef' },
    { slot: OTHER_HASH },
    { transactionHash: OTHER_HASH },
    { blockHash: OTHER_HASH },
    { requireCanonical: false },
  ]) {
    await assert.rejects(rpc.readCurrentEvidence(unit.MANIFEST, extra), /argument|keys|options|exact/iu);
    await assert.rejects(rpc.readHistoricalEvidence(unit.MANIFEST, extra), /argument|keys|options|exact/iu);
  }
  assert.equal(calls.length, 0);
});

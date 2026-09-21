'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const MAINNET = 'https://mainnet.base.org';
  const DRPC = 'https://base.drpc.org';
  const PUBLICNODE = 'https://base-rpc.publicnode.com';
  const ORIGINS = Object.freeze([MAINNET, DRPC, PUBLICNODE]);
  const STANDARD_KINDS = Object.freeze(['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt']);
  const QUORUM_KINDS = Object.freeze(['chainId', 'latestBlock', 'blockByNumber', 'transaction', 'receipt']);
  const ROUTE_MATRIX = ns.deepFreeze({
    [MAINNET]: [...STANDARD_KINDS],
    [DRPC]: [...STANDARD_KINDS, 'trace'],
    [PUBLICNODE]: [...QUORUM_KINDS],
  });
  const TRANSPORT_BOUNDS = ns.deepFreeze({
    STANDARD_TIMEOUT_MS: 10000,
    TRACE_TIMEOUT_MS: 25000,
    MAX_STANDARD_RESPONSE_BYTES: 1048576,
    MAX_TRACE_RESPONSE_BYTES: 4194304,
    MAX_HTTP_ATTEMPTS_PER_ORIGIN: 1,
    RETRY_DELAYS_MS: [],
  });
  const TRACE_OPTIONS = ns.deepFreeze({ tracer: 'callTracer', timeout: '20s', tracerConfig: { onlyTopCall: false, withLog: true } });
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const BYTES32 = /^0x[0-9a-f]{64}$/u;

  class RpcTransportError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'RpcTransportError';
      Object.assign(this, details);
    }
  }

  function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    const keys = Object.keys(value);
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key)) || expected.some((key) => !Object.hasOwn(value, key))) {
      throw new TypeError(`${label} has unknown or missing keys.`);
    }
  }

  function requireAddress(value, label) {
    if (typeof value !== 'string' || !ADDRESS.test(value)) throw new TypeError(`${label} must be an address.`);
    return value;
  }

  function requireBytes32(value, label) {
    if (typeof value !== 'string' || !BYTES32.test(value)) throw new TypeError(`${label} must be lowercase bytes32.`);
    return value;
  }

  function validateBlockRef(value) {
    if (typeof value === 'string') {
      ns.parseQuantity(value);
      return value;
    }
    exactKeys(value, ['blockHash', 'requireCanonical'], 'blockRef');
    requireBytes32(value.blockHash, 'blockRef.blockHash');
    if (value.requireCanonical !== true) throw new TypeError('blockRef.requireCanonical must be true.');
    return value;
  }

  function buildRpcRequest(request, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('JSON-RPC id must be a positive safe integer.');
    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.kind !== 'string') throw new TypeError('Unknown RPC request kind.');
    let method;
    let params;
    switch (request.kind) {
      case 'chainId':
        exactKeys(request, ['kind'], 'chainId request'); method = 'eth_chainId'; params = []; break;
      case 'latestBlock':
        exactKeys(request, ['kind'], 'latestBlock request'); method = 'eth_getBlockByNumber'; params = ['latest', false]; break;
      case 'blockByNumber':
        exactKeys(request, ['kind', 'number'], 'blockByNumber request'); method = 'eth_getBlockByNumber'; params = [ns.canonicalQuantity(request.number), false]; break;
      case 'code':
        exactKeys(request, ['kind', 'address', 'blockRef'], 'code request'); method = 'eth_getCode'; params = [requireAddress(request.address, 'code address'), validateBlockRef(request.blockRef)]; break;
      case 'storage':
        exactKeys(request, ['kind', 'address', 'slot', 'blockRef'], 'storage request'); method = 'eth_getStorageAt'; params = [requireAddress(request.address, 'storage address'), requireBytes32(request.slot, 'storage slot'), validateBlockRef(request.blockRef)]; break;
      case 'balance':
        exactKeys(request, ['kind', 'address', 'blockRef'], 'balance request'); method = 'eth_getBalance'; params = [requireAddress(request.address, 'balance address'), validateBlockRef(request.blockRef)]; break;
      case 'call':
        exactKeys(request, ['kind', 'transaction', 'blockRef'], 'call request'); method = 'eth_call'; params = [request.transaction, validateBlockRef(request.blockRef)]; break;
      case 'estimate':
        exactKeys(request, ['kind', 'transaction', 'blockRef'], 'estimate request'); method = 'eth_estimateGas'; params = [request.transaction, validateBlockRef(request.blockRef)]; break;
      case 'gasPrice':
        exactKeys(request, ['kind'], 'gasPrice request'); method = 'eth_gasPrice'; params = []; break;
      case 'transaction':
        exactKeys(request, ['kind', 'hash'], 'transaction request'); method = 'eth_getTransactionByHash'; params = [requireBytes32(request.hash, 'transaction hash')]; break;
      case 'receipt':
        exactKeys(request, ['kind', 'hash'], 'receipt request'); method = 'eth_getTransactionReceipt'; params = [requireBytes32(request.hash, 'receipt hash')]; break;
      case 'trace':
        exactKeys(request, ['kind', 'hash'], 'trace request'); method = 'debug_traceTransaction'; params = [requireBytes32(request.hash, 'trace hash'), TRACE_OPTIONS]; break;
      default:
        throw new TypeError(`Unknown RPC request kind: ${request.kind}.`);
    }
    return ns.deepFreeze({ jsonrpc: '2.0', id, method, params });
  }

  function isEip1898Unsupported(error) {
    return Boolean(error && (error.code === -32602 || error.code === -32000)
      && typeof error.message === 'string'
      && /blockHash|requireCanonical|EIP-1898|invalid argument.*object|cannot unmarshal.*object/iu.test(error.message));
  }

  function isTransientRpcError(error) {
    return Boolean(error && (error.code === -32005 || error.code === -32016
      || (typeof error.message === 'string' && /rate|limit|busy|capacity|temporar/iu.test(error.message))));
  }

  function validateEnvelope(envelope, id) {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new RpcTransportError('Invalid JSON-RPC envelope.');
    const hasResult = Object.hasOwn(envelope, 'result');
    const hasError = Object.hasOwn(envelope, 'error');
    const expected = hasResult && !hasError ? ['jsonrpc', 'id', 'result'] : !hasResult && hasError ? ['jsonrpc', 'id', 'error'] : [];
    if (expected.length === 0) throw new RpcTransportError('JSON-RPC envelope must contain exactly one of result or error.');
    exactKeys(envelope, expected, 'JSON-RPC envelope');
    if (envelope.jsonrpc !== '2.0' || envelope.id !== id) throw new RpcTransportError('JSON-RPC envelope version or id mismatch.');
    if (hasError) {
      const errorKeys = Object.hasOwn(envelope.error ?? {}, 'data') ? ['code', 'message', 'data'] : ['code', 'message'];
      exactKeys(envelope.error, errorKeys, 'JSON-RPC error');
      if (!Number.isInteger(envelope.error.code) || typeof envelope.error.message !== 'string') throw new RpcTransportError('Malformed JSON-RPC error.');
      throw new RpcTransportError(`JSON-RPC error ${envelope.error.code}: ${envelope.error.message}`, {
        rpcError: ns.deepFreeze({ ...envelope.error }),
        transient: isTransientRpcError(envelope.error),
      });
    }
    return envelope.result;
  }

  function createPublicRpcTransport(dependencies) {
    exactKeys(dependencies, ['fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'sleep', 'now'], 'transport dependencies');
    const { fetch, AbortController: AbortControllerImpl, setTimeout: setTimer, clearTimeout: clearTimer, sleep, now } = dependencies;
    if (typeof fetch !== 'function' || typeof AbortControllerImpl !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function' || typeof sleep !== 'function' || typeof now !== 'function') {
      throw new TypeError('Transport dependencies must be functions.');
    }
    let nextId = 1;

    async function request(origin, typedRequest, options = {}) {
      if (!Object.isFrozen(typedRequest)) throw new RpcTransportError('RPC typed request must be frozen.');
      if (!ORIGINS.includes(origin)) throw new RpcTransportError('Unapproved RPC origin.');
      if (!ROUTE_MATRIX[origin].includes(typedRequest?.kind)) throw new RpcTransportError(`RPC request kind is not permitted for origin ${origin}.`);
      const body = buildRpcRequest(typedRequest, nextId);
      nextId += 1;
      const trace = typedRequest.kind === 'trace';
      const timeoutMs = trace ? TRANSPORT_BOUNDS.TRACE_TIMEOUT_MS : TRANSPORT_BOUNDS.STANDARD_TIMEOUT_MS;
      const maxBytes = trace ? TRANSPORT_BOUNDS.MAX_TRACE_RESPONSE_BYTES : TRANSPORT_BOUNDS.MAX_STANDARD_RESPONSE_BYTES;
      const controller = new AbortControllerImpl();
      const callerSignal = options.signal;
      if (callerSignal?.aborted) throw new RpcTransportError('RPC caller aborted.', { transient: false, cause: callerSignal.reason });
      const abortFromCaller = () => controller.abort(callerSignal.reason ?? new DOMException('Aborted', 'AbortError'));
      callerSignal?.addEventListener?.('abort', abortFromCaller, { once: true });
      const timer = setTimer(() => controller.abort(new Error(`RPC timeout after ${timeoutMs}ms.`)), timeoutMs);
      try {
        const response = await fetch(origin, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          redirect: 'error',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (response.url !== origin || response.redirected) throw new RpcTransportError('RPC redirect or response URL mismatch.');
        if (!response.ok) {
          const transient = response.status === 429 || response.status >= 500;
          throw new RpcTransportError(`RPC HTTP ${response.status}.`, { transient });
        }
        const declared = response.headers?.get?.('content-length');
        if (declared !== null && declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) throw new RpcTransportError('RPC response bytes exceed limit.');
        const text = await response.text();
        if (new TextEncoder().encode(text).length > maxBytes) throw new RpcTransportError('RPC response bytes exceed limit.');
        let envelope;
        try {
          envelope = JSON.parse(text);
        } catch {
          throw new RpcTransportError('Invalid JSON-RPC JSON response.');
        }
        const result = validateEnvelope(envelope, body.id);
        return ns.deepFreeze({ origin, method: body.method, params: body.params, result });
      } catch (error) {
        if (error instanceof RpcTransportError) throw error;
        const reason = controller.signal.aborted ? controller.signal.reason : error;
        throw new RpcTransportError(`RPC network/abort failure: ${reason?.message ?? String(reason)}`, { transient: true, cause: reason });
      } finally {
        clearTimer(timer);
        callerSignal?.removeEventListener?.('abort', abortFromCaller);
      }
    }

    async function standard(typedRequest, options = {}) {
      try {
        return await request(MAINNET, typedRequest, options);
      } catch (error) {
        if (!error?.transient || options.signal?.aborted) throw error;
        return request(DRPC, typedRequest, options);
      }
    }

    function validateBlock(result, expectedNumber = null) {
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new RpcTransportError('RPC returned a null or malformed block.');
      let number;
      try {
        number = ns.parseQuantity(result.number);
      } catch {
        throw new RpcTransportError('RPC block number is not canonical.');
      }
      if (expectedNumber !== null && number !== expectedNumber) throw new RpcTransportError('RPC block number does not match the canonical anchor.');
      requireBytes32(result.hash, 'block hash');
      return { number, numberHex: ns.canonicalQuantity(number), hash: result.hash };
    }

    async function assertChainQuorum(options = {}) {
      const evidence = await Promise.all(ORIGINS.map((origin) => request(origin, Object.freeze({ kind: 'chainId' }), options)));
      if (evidence.some((item) => item.result !== ns.PINSET.chainIdHex)) throw new RpcTransportError('Three-origin chain quorum must equal 0x2105.');
      return ns.deepFreeze({ chainId: ns.PINSET.chainIdHex, evidence });
    }

    async function anchorCanonicalHead(options = {}) {
      await assertChainQuorum(options);
      const latestEvidence = await Promise.all(ORIGINS.map((origin) => request(origin, Object.freeze({ kind: 'latestBlock' }), options)));
      const latest = latestEvidence.map((item) => validateBlock(item.result));
      const minimum = latest.reduce((value, item) => item.number < value ? item.number : value, latest[0].number);
      const exactEvidence = await Promise.all(ORIGINS.map((origin) => request(origin, Object.freeze({ kind: 'blockByNumber', number: minimum }), options)));
      const exact = exactEvidence.map((item) => validateBlock(item.result, minimum));
      if (exact.some((item) => item.hash !== exact[0].hash)) throw new RpcTransportError('Canonical block hash quorum disagreement.');
      return ns.deepFreeze({ number: ns.canonicalQuantity(minimum), hash: exact[0].hash });
    }

    function stateRequestWithBlockRef(template, blockRef) {
      if (!template || typeof template !== 'object' || Array.isArray(template)) throw new TypeError('State request template must be an object.');
      switch (template.kind) {
        case 'code': exactKeys(template, ['kind', 'address'], 'state code request'); return { ...template, blockRef };
        case 'storage': exactKeys(template, ['kind', 'address', 'slot'], 'state storage request'); return { ...template, blockRef };
        case 'balance': exactKeys(template, ['kind', 'address'], 'state balance request'); return { ...template, blockRef };
        case 'call': exactKeys(template, ['kind', 'transaction'], 'state call request'); return { ...template, blockRef };
        case 'estimate': exactKeys(template, ['kind', 'transaction'], 'state estimate request'); return { ...template, blockRef };
        default: throw new TypeError(`Request kind ${template.kind} is not permitted in a state batch.`);
      }
    }

    async function runStateRequests(origin, templates, blockRef, options) {
      const items = [];
      for (const template of templates) items.push(await request(origin, ns.deepFreeze(stateRequestWithBlockRef(template, blockRef)), options));
      return items;
    }

    async function guardedStateBatch(origin, anchor, templates, options) {
      const number = ns.parseQuantity(anchor.number);
      const before = validateBlock((await request(origin, Object.freeze({ kind: 'blockByNumber', number }), options)).result, number);
      if (before.hash !== anchor.hash) throw new RpcTransportError('State batch before-guard hash is not canonical.');
      const items = await runStateRequests(origin, templates, anchor.number, options);
      const after = validateBlock((await request(origin, Object.freeze({ kind: 'blockByNumber', number }), options)).result, number);
      if (after.hash !== anchor.hash) throw new RpcTransportError('State batch after-guard hash is not canonical.');
      return ns.deepFreeze({ origin, mode: 'number-guarded', anchor: { ...anchor }, items });
    }

    async function stateBatchAt(origin, anchor, templates, options) {
      try {
        const items = await runStateRequests(origin, templates, { blockHash: anchor.hash, requireCanonical: true }, options);
        return ns.deepFreeze({ origin, mode: 'eip-1898', anchor: { ...anchor }, items });
      } catch (error) {
        if (isEip1898Unsupported(error?.rpcError)) return guardedStateBatch(origin, anchor, templates, options);
        throw error;
      }
    }

    async function stateBatch(anchor, templates, options = {}) {
      exactKeys(anchor, ['number', 'hash'], 'state anchor');
      const number = ns.parseQuantity(anchor.number);
      requireBytes32(anchor.hash, 'state anchor hash');
      if (!Array.isArray(templates) || templates.length === 0) throw new TypeError('State batch must contain requests.');
      const canonicalAnchor = ns.deepFreeze({ number: ns.canonicalQuantity(number), hash: anchor.hash });
      try {
        return await stateBatchAt(MAINNET, canonicalAnchor, templates, options);
      } catch (error) {
        if (!error?.transient || options.signal?.aborted) throw error;
        return stateBatchAt(DRPC, canonicalAnchor, templates, options);
      }
    }

    function throwIfAborted(signal) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    async function transactionReceiptPair(origin, hash, signal) {
      const transaction = await request(origin, Object.freeze({ kind: 'transaction', hash }), { signal });
      const receipt = await request(origin, Object.freeze({ kind: 'receipt', hash }), { signal });
      return ns.deepFreeze({ origin, transaction, receipt });
    }

    async function* pollTransactionReceipt({ hash, createdAtMs, signal } = {}) {
      requireBytes32(hash, 'poll transaction hash');
      if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) throw new TypeError('createdAtMs must be a nonnegative safe integer.');
      let first = true;
      while (true) {
        throwIfAborted(signal);
        const elapsed = now() - createdAtMs;
        if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 600000) return;
        if (!first) {
          const delay = elapsed < 120000 ? 2000 : 10000;
          if (elapsed + delay > 600000) return;
          await sleep(delay, signal);
          throwIfAborted(signal);
        }
        first = false;
        const mainnet = await transactionReceiptPair(MAINNET, hash, signal);
        const drpc = await transactionReceiptPair(DRPC, hash, signal);
        yield ns.deepFreeze({ mainnet, drpc, observedAtMs: now() });
      }
    }

    async function* pollHeads({ deadlineMs, signal } = {}) {
      if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) throw new TypeError('deadlineMs must be a nonnegative safe integer.');
      let first = true;
      while (true) {
        throwIfAborted(signal);
        const current = now();
        if (!Number.isFinite(current) || current > deadlineMs) return;
        if (!first) {
          if (current + 2000 > deadlineMs) return;
          await sleep(2000, signal);
          throwIfAborted(signal);
        }
        first = false;
        const heads = await Promise.all(ORIGINS.map((origin) => request(origin, Object.freeze({ kind: 'latestBlock' }), { signal })));
        yield ns.deepFreeze({ observedAtMs: now(), heads });
        if (now() >= deadlineMs) return;
      }
    }

    async function finalReceiptQuorum(hash, options = {}) {
      requireBytes32(hash, 'final receipt hash');
      const mainnet = await transactionReceiptPair(MAINNET, hash, options.signal);
      const drpc = await transactionReceiptPair(DRPC, hash, options.signal);
      const publicNodeReceipt = await request(PUBLICNODE, Object.freeze({ kind: 'receipt', hash }), options);
      return ns.deepFreeze({ mainnet, drpc, publicNodeReceipt });
    }

    return ns.deepFreeze({
      request,
      standard,
      requireChainQuorum: assertChainQuorum,
      anchorCanonicalHead,
      stateBatch,
      pollTransactionReceipt,
      pollHeads,
      finalReceiptQuorum,
    });
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({
    ROUTE_MATRIX, TRANSPORT_BOUNDS, TRACE_OPTIONS, buildRpcRequest, isEip1898Unsupported,
    createPublicRpcTransport,
  }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

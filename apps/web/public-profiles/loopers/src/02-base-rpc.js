'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');
  if (Object.prototype.hasOwnProperty.call(ns, 'createBaseRpcClient')) throw new Error('createBaseRpcClient is already registered.');

  const MAINNET = 'https://mainnet.base.org';
  const DRPC = 'https://base.drpc.org';
  const ORIGINS = Object.freeze([MAINNET, DRPC]);
  const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const HEX_DATA = /^0x(?:[0-9a-f]{2})*$/u;
  const WORD32 = /^0x[0-9a-f]{64}$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const LOWER_ADDRESS = /^0x[0-9a-f]{40}$/u;
  const ANY_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const ALLOWED_CODES = Object.freeze([
    'timeout', 'http', 'rpc', 'malformed', 'oversized', 'head_gap', 'block_disagreement', 'batch_failed',
  ]);
  const CURRENT_RESPONSE_KEYS = Object.freeze([
    'loopersProxyCode', 'loopersImplementationSlot', 'loopersImplementationCode',
    'registryCode', 'accountImplementationCode', 'adapterProxyCode',
    'adapterImplementationSlot', 'adapterImplementationCode', 'identityRegistryProxyCode',
    'identityRegistryImplementationSlot', 'identityRegistryImplementationCode', 'accountCode',
    'accountBalance', 'accountTokenResult', 'accountOwnerResult', 'accountStateResult',
    'accountValidSignerResult', 'loopersOwnerOfResult', 'loopersTokenBoundAccountResult',
    'registryAccountResult', 'loopersErc8004BoundResult', 'loopersErc8004AgentIdResult',
    'loopersErc8004AgentUriResult', 'adapterIdentityRegistryResult', 'adapterBindingResult',
    'adapterIsControllerResult', 'identityRegistryOwnerOfResult', 'identityRegistryTokenUriResult',
  ]);
  const HISTORICAL_RESPONSE_KEYS = Object.freeze([
    'transaction', 'receipt', 'accountCode', 'accountBalance', 'accountTokenResult',
    'accountOwnerResult', 'accountStateResult', 'accountValidSignerResult',
  ]);

  class RpcBoundaryError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'RpcBoundaryError';
      this.code = ALLOWED_CODES.includes(code) ? code : 'malformed';
    }
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  }

  function exactKeys(value, expected, label) {
    if (!isPlainObject(value)) throw new TypeError(label + ' must be a plain object.');
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key)) || expected.some((key) => !Object.hasOwn(value, key))) {
      throw new TypeError(label + ' has unknown or missing keys.');
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError(label + ' must use own enumerable data properties.');
    }
  }

  function canonicalQuantity(value, label) {
    if (typeof value !== 'string' || !QUANTITY.test(value)) throw new RpcBoundaryError('malformed', label + ' must be a canonical lowercase quantity.');
    return value;
  }

  function hash32(value, label) {
    if (typeof value !== 'string' || !WORD32.test(value)) throw new RpcBoundaryError('malformed', label + ' must be a lowercase 32-byte hash.');
    return value;
  }

  function hexData(value, label) {
    if (typeof value !== 'string' || !HEX_DATA.test(value)) throw new RpcBoundaryError('malformed', label + ' must be lowercase even-length bytes.');
    return value;
  }

  function word32(value, label) {
    if (typeof value !== 'string' || !WORD32.test(value)) throw new RpcBoundaryError('malformed', label + ' must be exactly 32 bytes.');
    return value;
  }

  function normalizedAddress(value, label) {
    if (typeof value !== 'string' || !ANY_ADDRESS.test(value)) throw new RpcBoundaryError('malformed', label + ' must be a 20-byte address.');
    const lowered = value.toLowerCase();
    if (!LOWER_ADDRESS.test(lowered)) throw new RpcBoundaryError('malformed', label + ' must normalize to a lowercase address.');
    return lowered;
  }

  function freeze(value) {
    return ns.deepFreeze(value);
  }

  function quantityWord(value) {
    return ns.uint256Word(value);
  }

  function callTransaction(to, data) {
    return { to, data };
  }

  function blockReference(hash) {
    const reference = { blockHash: hash, requireCanonical: true };
    exactKeys(reference, ['blockHash', 'requireCanonical'], 'block reference');
    hash32(reference.blockHash, 'block reference hash');
    if (reference.requireCanonical !== true) throw new TypeError('block reference requireCanonical must be true.');
    return reference;
  }

  function normalizeBlock(value) {
    if (!isPlainObject(value)) throw new RpcBoundaryError('malformed', 'RPC block must be a non-null object.');
    return {
      number: canonicalQuantity(value.number, 'block number'),
      hash: hash32(value.hash, 'block hash'),
      timestamp: canonicalQuantity(value.timestamp, 'block timestamp'),
    };
  }

  function normalizeTransaction(value) {
    if (value === null) return null;
    if (!isPlainObject(value)) throw new RpcBoundaryError('malformed', 'RPC transaction must be a non-null object.');
    return {
      hash: hash32(value.hash, 'transaction hash'),
      chainId: canonicalQuantity(value.chainId, 'transaction chainId'),
      blockNumber: canonicalQuantity(value.blockNumber, 'transaction blockNumber'),
      blockHash: hash32(value.blockHash, 'transaction blockHash'),
      transactionIndex: canonicalQuantity(value.transactionIndex, 'transaction transactionIndex'),
      from: normalizedAddress(value.from, 'transaction from'),
      to: normalizedAddress(value.to, 'transaction to'),
      value: canonicalQuantity(value.value, 'transaction value'),
      input: hexData(value.input, 'transaction input'),
    };
  }

  function normalizeLog(value, index) {
    if (!isPlainObject(value)) throw new RpcBoundaryError('malformed', 'receipt log must be an object.');
    if (!Array.isArray(value.topics) || Object.getPrototypeOf(value.topics) !== Array.prototype || value.topics.length > 8) {
      throw new RpcBoundaryError('malformed', 'receipt log topics exceed their exact bound.');
    }
    for (let topicIndex = 0; topicIndex < value.topics.length; topicIndex += 1) {
      if (!Object.hasOwn(value.topics, topicIndex)) throw new RpcBoundaryError('malformed', 'receipt log topics may not be sparse.');
    }
    return {
      address: normalizedAddress(value.address, `receipt logs[${index}].address`),
      topics: value.topics.map((topic, topicIndex) => hash32(topic, `receipt logs[${index}].topics[${topicIndex}]`)),
      data: hexData(value.data, `receipt logs[${index}].data`),
      logIndex: canonicalQuantity(value.logIndex, `receipt logs[${index}].logIndex`),
      transactionHash: hash32(value.transactionHash, `receipt logs[${index}].transactionHash`),
      transactionIndex: canonicalQuantity(value.transactionIndex, `receipt logs[${index}].transactionIndex`),
      blockHash: hash32(value.blockHash, `receipt logs[${index}].blockHash`),
      blockNumber: canonicalQuantity(value.blockNumber, `receipt logs[${index}].blockNumber`),
      removed: (() => {
        if (typeof value.removed !== 'boolean') throw new RpcBoundaryError('malformed', `receipt logs[${index}].removed must be boolean.`);
        return value.removed;
      })(),
    };
  }

  function normalizeReceipt(value) {
    if (value === null) return null;
    if (!isPlainObject(value) || !Array.isArray(value.logs) || Object.getPrototypeOf(value.logs) !== Array.prototype || value.logs.length > 512) {
      throw new RpcBoundaryError('malformed', 'RPC receipt or logs are malformed or oversized.');
    }
    for (let index = 0; index < value.logs.length; index += 1) {
      if (!Object.hasOwn(value.logs, index)) throw new RpcBoundaryError('malformed', 'receipt logs may not be sparse.');
    }
    return {
      transactionHash: hash32(value.transactionHash, 'receipt transactionHash'),
      blockNumber: canonicalQuantity(value.blockNumber, 'receipt blockNumber'),
      blockHash: hash32(value.blockHash, 'receipt blockHash'),
      transactionIndex: canonicalQuantity(value.transactionIndex, 'receipt transactionIndex'),
      status: canonicalQuantity(value.status, 'receipt status'),
      logs: value.logs.map(normalizeLog),
    };
  }

  function classifyError(error) {
    if (error instanceof RpcBoundaryError) return error;
    if (error?.name === 'AbortError' || /abort|timeout/iu.test(error?.message ?? '')) return new RpcBoundaryError('timeout', 'RPC request timed out or was aborted.');
    return new RpcBoundaryError('http', 'RPC network request failed.');
  }

  async function readBoundedText(response, maxBytes) {
    const declared = response?.headers?.get?.('content-length');
    if (declared !== null && declared !== undefined) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) throw new RpcBoundaryError('malformed', 'RPC Content-Length is invalid.');
      if (BigInt(declared) > BigInt(maxBytes)) throw new RpcBoundaryError('oversized', 'RPC response exceeds the byte limit.');
    }
    if (!response?.body || typeof response.body.getReader !== 'function') {
      if (declared === null || declared === undefined) throw new RpcBoundaryError('malformed', 'Unstreamed RPC response has no trustworthy Content-Length.');
      const fallback = await response.text();
      if (new TextEncoder().encode(fallback).byteLength > maxBytes) throw new RpcBoundaryError('oversized', 'RPC response exceeds the byte limit.');
      return fallback;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let total = 0;
    let text = '';
    try {
      while (true) {
        const item = await reader.read();
        if (!item || typeof item.done !== 'boolean') throw new RpcBoundaryError('malformed', 'RPC response stream is malformed.');
        if (item.done) break;
        if (!(item.value instanceof Uint8Array)) throw new RpcBoundaryError('malformed', 'RPC response stream yielded non-bytes.');
        total += item.value.byteLength;
        if (total > maxBytes) {
          const cancellation = reader.cancel?.();
          cancellation?.catch?.(() => {});
          throw new RpcBoundaryError('oversized', 'RPC response exceeds the byte limit.');
        }
        try {
          text += decoder.decode(item.value, { stream: true });
        } catch {
          throw new RpcBoundaryError('malformed', 'RPC response is not valid UTF-8.');
        }
      }
      try {
        text += decoder.decode();
      } catch {
        throw new RpcBoundaryError('malformed', 'RPC response is not valid UTF-8.');
      }
      return text;
    } finally {
      reader.releaseLock?.();
    }
  }

  function parseEnvelope(text, id) {
    const idFields = text.match(/"id"\s*:/gu);
    if (!idFields || idFields.length !== 1) throw new RpcBoundaryError('malformed', 'JSON-RPC response must contain exactly one id field.');
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new RpcBoundaryError('malformed', 'RPC response is not valid JSON.');
    }
    if (!isPlainObject(envelope)) throw new RpcBoundaryError('malformed', 'JSON-RPC envelope must be one object.');
    const hasResult = Object.hasOwn(envelope, 'result');
    const hasError = Object.hasOwn(envelope, 'error');
    if (hasResult === hasError) throw new RpcBoundaryError('malformed', 'JSON-RPC envelope must contain exactly one result or error.');
    const keys = Object.keys(envelope);
    const expected = hasResult ? ['jsonrpc', 'id', 'result'] : ['jsonrpc', 'id', 'error'];
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) throw new RpcBoundaryError('malformed', 'JSON-RPC envelope keys are not exact.');
    if (envelope.jsonrpc !== '2.0' || envelope.id !== id) throw new RpcBoundaryError('malformed', 'JSON-RPC envelope version or id is wrong.');
    if (hasError) {
      if (!isPlainObject(envelope.error)) throw new RpcBoundaryError('malformed', 'JSON-RPC error is malformed.');
      const errorKeys = Object.keys(envelope.error);
      if (!errorKeys.includes('code') || !errorKeys.includes('message') || errorKeys.some((key) => !['code', 'message', 'data'].includes(key)) || !Number.isInteger(envelope.error.code) || typeof envelope.error.message !== 'string') {
        throw new RpcBoundaryError('malformed', 'JSON-RPC error is malformed.');
      }
      throw new RpcBoundaryError('rpc', 'JSON-RPC origin returned an error.');
    }
    return envelope.result;
  }

  function createBaseRpcClient(configuration) {
    if (arguments.length === 0) throw new TypeError('Not implemented without the required RPC client configuration.');
    if (!isPlainObject(configuration)) throw new TypeError('RPC client config must be a plain object.');
    const allowed = ['fetchImpl', 'clock', 'perRequestTimeoutMs', 'refreshTimeoutMs', 'maxBytes'];
    const keys = Reflect.ownKeys(configuration);
    if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key)) || !Object.hasOwn(configuration, 'fetchImpl') || !Object.hasOwn(configuration, 'clock')) {
      throw new TypeError('RPC client config has unknown or missing keys.');
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(configuration, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError('RPC client config must use own enumerable data properties.');
    }
    const fetchImpl = configuration.fetchImpl;
    const clock = configuration.clock;
    const perRequestTimeoutMs = configuration.perRequestTimeoutMs ?? 8_000;
    const refreshTimeoutMs = configuration.refreshTimeoutMs ?? 30_000;
    const maxBytes = configuration.maxBytes ?? 1_048_576;
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function.');
    if (!Number.isSafeInteger(perRequestTimeoutMs) || perRequestTimeoutMs <= 0) throw new TypeError('per-request timeout must be a positive safe integer.');
    if (!Number.isSafeInteger(refreshTimeoutMs) || refreshTimeoutMs <= 0) throw new TypeError('refresh timeout must be a positive safe integer.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes must be a positive safe integer.');

    let nextId = 1;

    function assertManifest(manifest) {
      if (!Object.hasOwn(ns, 'MANIFEST') || manifest !== ns.MANIFEST) throw new TypeError('RPC reads require the exact registered manifest.');
    }

    function assertNoAdditionalArguments(rest) {
      if (rest.length !== 0) throw new TypeError('RPC read arguments must be exact; options are forbidden.');
    }

    async function request(origin, method, params, normalize, deadlineMs) {
      if (!ORIGINS.includes(origin)) throw new RpcBoundaryError('malformed', 'Unapproved RPC origin.');
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) throw new RpcBoundaryError('timeout', 'Whole RPC refresh deadline elapsed.');
      const timeoutMs = Math.min(perRequestTimeoutMs, remaining);
      const controller = new AbortController();
      const timeoutError = new RpcBoundaryError('timeout', 'RPC request timed out.');
      let rejectTimer;
      const timeoutPromise = new Promise((resolve, reject) => { rejectTimer = reject; });
      const timer = setTimeout(() => {
        controller.abort(timeoutError);
        rejectTimer(timeoutError);
      }, timeoutMs);
      const body = { jsonrpc: '2.0', id: nextId, method, params };
      nextId += 1;
      try {
        let response;
        try {
          response = await Promise.race([
            Promise.resolve(fetchImpl(origin, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
              redirect: 'error',
              credentials: 'omit',
              signal: controller.signal,
            })),
            timeoutPromise,
          ]);
        } catch (error) {
          throw classifyError(error);
        }
        if (!response || response.redirected === true || (response.url !== origin && response.url !== origin + '/')) {
          throw new RpcBoundaryError('http', 'RPC redirect or response URL mismatch.');
        }
        if (response.ok !== true || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
          throw new RpcBoundaryError('http', 'RPC HTTP response was not successful.');
        }
        const text = await Promise.race([readBoundedText(response, maxBytes), timeoutPromise]);
        if (Date.now() >= deadlineMs) throw new RpcBoundaryError('timeout', 'Whole RPC refresh deadline elapsed.');
        const raw = parseEnvelope(text, body.id);
        return normalize(raw);
      } finally {
        clearTimeout(timer);
      }
    }

    function attempt(origin, stage, outcome, code, observations = {}) {
      return { origin, stage, outcome, code, observations };
    }

    function evidence(phase, classification, selectedBlock, completeBatch, attempts) {
      return freeze({
        schema: 'looper.profile.rpc-evidence',
        version: 1,
        phase,
        classification,
        selectedBlock,
        completeBatch,
        attempts,
      });
    }

    function currentHolderWord(observations) {
      try {
        return ns.addressWord(ns.decodeAddress(observations.loopersOwnerOfResult));
      } catch {
        throw new RpcBoundaryError('malformed', 'Current Looper holder result is not an exact ABI address.');
      }
    }

    function currentPlan(manifest, selectedHash) {
      const ref = () => blockReference(selectedHash);
      const tokenWord = quantityWord(manifest.tokenId);
      const identityWord = quantityWord(manifest.erc8004.identityId);
      const account = manifest.account;
      const contracts = manifest.contracts;
      const loopers = contracts.loopersProxy.address;
      const registry = manifest.erc6551.registry;
      const implementation = manifest.erc6551.implementation;
      const adapter = manifest.erc8004.adapter;
      const identityRegistry = manifest.erc8004.identityRegistry;
      const entries = [
        ['loopersProxyCode', 'eth_getCode', [loopers, ref()], (value) => hexData(value, 'loopers proxy code')],
        ['loopersImplementationSlot', 'eth_getStorageAt', [loopers, EIP1967_IMPLEMENTATION_SLOT, ref()], (value) => word32(value, 'loopers implementation slot')],
        ['loopersImplementationCode', 'eth_getCode', [contracts.loopersImplementation.address, ref()], (value) => hexData(value, 'loopers implementation code')],
        ['registryCode', 'eth_getCode', [registry, ref()], (value) => hexData(value, 'registry code')],
        ['accountImplementationCode', 'eth_getCode', [implementation, ref()], (value) => hexData(value, 'account implementation code')],
        ['adapterProxyCode', 'eth_getCode', [adapter, ref()], (value) => hexData(value, 'adapter proxy code')],
        ['adapterImplementationSlot', 'eth_getStorageAt', [adapter, EIP1967_IMPLEMENTATION_SLOT, ref()], (value) => word32(value, 'adapter implementation slot')],
        ['adapterImplementationCode', 'eth_getCode', [contracts.adapter8004Implementation.address, ref()], (value) => hexData(value, 'adapter implementation code')],
        ['identityRegistryProxyCode', 'eth_getCode', [identityRegistry, ref()], (value) => hexData(value, 'identity registry proxy code')],
        ['identityRegistryImplementationSlot', 'eth_getStorageAt', [identityRegistry, EIP1967_IMPLEMENTATION_SLOT, ref()], (value) => word32(value, 'identity registry implementation slot')],
        ['identityRegistryImplementationCode', 'eth_getCode', [contracts.identityRegistryImplementation.address, ref()], (value) => hexData(value, 'identity registry implementation code')],
        ['accountCode', 'eth_getCode', [account, ref()], (value) => hexData(value, 'account code')],
        ['accountBalance', 'eth_getBalance', [account, ref()], (value) => canonicalQuantity(value, 'account balance')],
        ['accountTokenResult', 'eth_call', [callTransaction(account, '0xfc0c546a'), ref()], (value) => hexData(value, 'account token result')],
        ['accountOwnerResult', 'eth_call', [callTransaction(account, '0x8da5cb5b'), ref()], (value) => hexData(value, 'account owner result')],
        ['accountStateResult', 'eth_call', [callTransaction(account, '0xc19d93fb'), ref()], (value) => hexData(value, 'account state result')],
        ['loopersOwnerOfResult', 'eth_call', [callTransaction(loopers, `0x6352211e${tokenWord}`), ref()], (value) => hexData(value, 'Looper owner result')],
        ['accountValidSignerResult', 'eth_call', (observations) => [callTransaction(account, `0x523e3260${currentHolderWord(observations)}${quantityWord(64)}${quantityWord(0)}`), ref()], (value) => hexData(value, 'account signer result')],
        ['loopersTokenBoundAccountResult', 'eth_call', [callTransaction(loopers, `0x0be76ed6${tokenWord}`), ref()], (value) => hexData(value, 'Looper account result')],
        ['registryAccountResult', 'eth_call', [callTransaction(registry, `0x246a0021${ns.addressWord(implementation)}${manifest.erc6551.salt.slice(2)}${quantityWord(manifest.chainId)}${ns.addressWord(loopers)}${tokenWord}`), ref()], (value) => hexData(value, 'registry account result')],
        ['loopersErc8004BoundResult', 'eth_call', [callTransaction(loopers, `0x5adbbdce${tokenWord}`), ref()], (value) => hexData(value, 'Looper identity-bound result')],
        ['loopersErc8004AgentIdResult', 'eth_call', [callTransaction(loopers, `0x4c4a2696${tokenWord}`), ref()], (value) => hexData(value, 'Looper identity id result')],
        ['loopersErc8004AgentUriResult', 'eth_call', [callTransaction(loopers, `0xf195e791${tokenWord}`), ref()], (value) => hexData(value, 'Looper identity URI result')],
        ['adapterIdentityRegistryResult', 'eth_call', [callTransaction(adapter, '0x134e18f4'), ref()], (value) => hexData(value, 'adapter registry result')],
        ['adapterBindingResult', 'eth_call', [callTransaction(adapter, `0x4d69ebc2${identityWord}`), ref()], (value) => hexData(value, 'adapter binding result')],
        ['adapterIsControllerResult', 'eth_call', (observations) => [callTransaction(adapter, `0x158e711d${identityWord}${currentHolderWord(observations)}`), ref()], (value) => hexData(value, 'adapter controller result')],
        ['identityRegistryOwnerOfResult', 'eth_call', [callTransaction(identityRegistry, `0x6352211e${identityWord}`), ref()], (value) => hexData(value, 'identity owner result')],
        ['identityRegistryTokenUriResult', 'eth_call', [callTransaction(identityRegistry, `0xc87b56dd${identityWord}`), ref()], (value) => hexData(value, 'identity URI result')],
      ];
      return entries.map(([key, method, params, normalize]) => ({ key, method, params, normalize }));
    }

    function historicalPlan(manifest) {
      const ref = () => blockReference(manifest.activation.blockHash);
      const account = manifest.account;
      const holder = ns.addressWord(manifest.holderAtActivation);
      return [
        ['transaction', 'eth_getTransactionByHash', [manifest.activation.transactionHash], normalizeTransaction],
        ['receipt', 'eth_getTransactionReceipt', [manifest.activation.transactionHash], normalizeReceipt],
        ['accountCode', 'eth_getCode', [account, ref()], (value) => hexData(value, 'historical account code')],
        ['accountBalance', 'eth_getBalance', [account, ref()], (value) => canonicalQuantity(value, 'historical account balance')],
        ['accountTokenResult', 'eth_call', [callTransaction(account, '0xfc0c546a'), ref()], (value) => hexData(value, 'historical account token result')],
        ['accountOwnerResult', 'eth_call', [callTransaction(account, '0x8da5cb5b'), ref()], (value) => hexData(value, 'historical account owner result')],
        ['accountStateResult', 'eth_call', [callTransaction(account, '0xc19d93fb'), ref()], (value) => hexData(value, 'historical account state result')],
        ['accountValidSignerResult', 'eth_call', [callTransaction(account, `0x523e3260${holder}${quantityWord(64)}${quantityWord(0)}`), ref()], (value) => hexData(value, 'historical account signer result')],
      ].map(([key, method, params, normalize]) => ({ key, method, params, normalize }));
    }

    async function runBatch(origin, phase, plan, deadlineMs) {
      const observations = {};
      try {
        for (const item of plan) {
          const params = typeof item.params === 'function' ? item.params(observations) : item.params;
          const normalized = await request(origin, item.method, params, item.normalize, deadlineMs);
          observations[item.key] = normalized;
          if ((item.key === 'transaction' || item.key === 'receipt') && normalized === null) {
            throw new RpcBoundaryError('malformed', item.key + ' may not be null in a complete batch.');
          }
        }
        const responseKeys = phase === 'current' ? CURRENT_RESPONSE_KEYS : HISTORICAL_RESPONSE_KEYS;
        const responses = Object.fromEntries(responseKeys.map((key) => {
          if (!Object.hasOwn(observations, key)) throw new RpcBoundaryError('batch_failed', `Complete batch is missing ${key}.`);
          return [key, observations[key]];
        }));
        return { complete: true, observations: responses };
      } catch (error) {
        return { complete: false, observations, error: classifyError(error) };
      }
    }

    async function confirmSelectedBlock(selectedBlock, deadlineMs, attempts) {
      const blocks = [];
      for (const origin of ORIGINS) {
        try {
          const candidate = await request(origin, 'eth_getBlockByNumber', [selectedBlock.number, false], normalizeBlock, deadlineMs);
          if (candidate.number !== selectedBlock.number || candidate.hash !== selectedBlock.hash || candidate.timestamp !== selectedBlock.timestamp) {
            attempts.push(attempt(origin, 'canonical', 'mismatch', 'block_disagreement', {}));
            return { classification: 'mismatch' };
          }
          blocks.push(candidate);
          attempts.push(attempt(origin, 'canonical', 'complete', null, {}));
        } catch (error) {
          const classified = classifyError(error);
          attempts.push(attempt(origin, 'canonical', 'unavailable', classified.code, {}));
          return { classification: 'unavailable' };
        }
      }
      if (blocks.some((candidate) => candidate.number !== selectedBlock.number || candidate.hash !== selectedBlock.hash || candidate.timestamp !== selectedBlock.timestamp)) {
        attempts.push(attempt(DRPC, 'canonical', 'mismatch', 'block_disagreement', {}));
        return { classification: 'mismatch' };
      }
      return { classification: 'complete' };
    }

    async function executeBatches(phase, manifest, selectedBlock, plan, deadlineMs, attempts) {
      const primary = await runBatch(MAINNET, phase, plan, deadlineMs);
      attempts.push(attempt(MAINNET, 'batch', primary.complete ? 'complete' : 'unavailable', primary.complete ? null : 'batch_failed', primary.observations));
      if (primary.complete) return evidence(phase, 'complete', selectedBlock, { origin: MAINNET, responses: primary.observations }, attempts);

      const reconfirmed = await confirmSelectedBlock(selectedBlock, deadlineMs, attempts);
      if (reconfirmed.classification !== 'complete') return evidence(phase, reconfirmed.classification, selectedBlock, null, attempts);

      const fallback = await runBatch(DRPC, phase, plan, deadlineMs);
      attempts.push(attempt(DRPC, 'batch', fallback.complete ? 'complete' : 'unavailable', fallback.complete ? null : 'batch_failed', fallback.observations));
      if (!fallback.complete) return evidence(phase, 'unavailable', selectedBlock, null, attempts);
      return evidence(phase, 'complete', selectedBlock, { origin: DRPC, responses: fallback.observations }, attempts);
    }

    async function readCurrentEvidence(manifest, ...rest) {
      assertNoAdditionalArguments(rest);
      assertManifest(manifest);
      const deadlineMs = Date.now() + refreshTimeoutMs;
      const attempts = [];
      const heads = [];
      const expectedChain = `0x${BigInt(manifest.chainId).toString(16)}`;
      for (const origin of ORIGINS) {
        try {
          const chainId = await request(origin, 'eth_chainId', [], (value) => canonicalQuantity(value, 'chain id'), deadlineMs);
          if (chainId !== expectedChain) {
            attempts.push(attempt(origin, 'head', 'mismatch', 'block_disagreement', {}));
            return evidence('current', 'mismatch', null, null, attempts);
          }
          const latest = await request(origin, 'eth_getBlockByNumber', ['latest', false], normalizeBlock, deadlineMs);
          heads.push({ chainId, block: latest });
          attempts.push(attempt(origin, 'head', 'complete', null, {}));
        } catch (error) {
          const classified = classifyError(error);
          attempts.push(attempt(origin, 'head', 'unavailable', classified.code, {}));
          return evidence('current', 'unavailable', null, null, attempts);
        }
      }
      const heights = heads.map(({ block }) => BigInt(block.number));
      const gap = heights[0] > heights[1] ? heights[0] - heights[1] : heights[1] - heights[0];
      if (gap > 20n) {
        attempts.push(attempt(DRPC, 'head', 'unavailable', 'head_gap', {}));
        return evidence('current', 'unavailable', null, null, attempts);
      }
      const selectedNumber = heights[0] <= heights[1] ? heads[0].block.number : heads[1].block.number;
      const canonical = [];
      for (const origin of ORIGINS) {
        try {
          const candidate = await request(origin, 'eth_getBlockByNumber', [selectedNumber, false], normalizeBlock, deadlineMs);
          canonical.push(candidate);
          attempts.push(attempt(origin, 'canonical', 'complete', null, {}));
        } catch (error) {
          const classified = classifyError(error);
          attempts.push(attempt(origin, 'canonical', 'unavailable', classified.code, {}));
          return evidence('current', 'unavailable', null, null, attempts);
        }
      }
      if (canonical.some((candidate) => candidate.number !== selectedNumber) || canonical[0].hash !== canonical[1].hash || canonical[0].timestamp !== canonical[1].timestamp) {
        attempts.push(attempt(DRPC, 'canonical', 'mismatch', 'block_disagreement', {}));
        return evidence('current', 'mismatch', null, null, attempts);
      }
      const selectedBlock = canonical[0];
      let now;
      try {
        now = clock();
      } catch {
        attempts.push(attempt(MAINNET, 'canonical', 'unavailable', 'timeout', {}));
        return evidence('current', 'unavailable', selectedBlock, null, attempts);
      }
      if (!Number.isFinite(now) || !Number.isSafeInteger(Math.trunc(now))) {
        attempts.push(attempt(MAINNET, 'canonical', 'unavailable', 'timeout', {}));
        return evidence('current', 'unavailable', selectedBlock, null, attempts);
      }
      const timestampMs = BigInt(selectedBlock.timestamp) * 1000n;
      const nowMs = BigInt(Math.trunc(now));
      if (timestampMs < nowMs - 600_000n || timestampMs > nowMs + 300_000n) {
        attempts.push(attempt(MAINNET, 'canonical', 'unavailable', 'timeout', {}));
        return evidence('current', 'unavailable', selectedBlock, null, attempts);
      }
      return executeBatches('current', manifest, selectedBlock, currentPlan(manifest, selectedBlock.hash), deadlineMs, attempts);
    }

    async function readHistoricalEvidence(manifest, ...rest) {
      assertNoAdditionalArguments(rest);
      assertManifest(manifest);
      const deadlineMs = Date.now() + refreshTimeoutMs;
      const attempts = [];
      const blocks = [];
      const expectedChain = `0x${BigInt(manifest.chainId).toString(16)}`;
      for (const origin of ORIGINS) {
        try {
          const chainId = await request(origin, 'eth_chainId', [], (value) => canonicalQuantity(value, 'chain id'), deadlineMs);
          if (chainId !== expectedChain) {
            attempts.push(attempt(origin, 'head', 'mismatch', 'block_disagreement', {}));
            return evidence('historical', 'mismatch', null, null, attempts);
          }
          const candidate = await request(origin, 'eth_getBlockByNumber', [manifest.activation.blockNumber, false], normalizeBlock, deadlineMs);
          if (candidate.number !== manifest.activation.blockNumber || candidate.hash !== manifest.activation.blockHash) {
            attempts.push(attempt(origin, 'canonical', 'mismatch', 'block_disagreement', {}));
            return evidence('historical', 'mismatch', null, null, attempts);
          }
          blocks.push(candidate);
          attempts.push(attempt(origin, 'canonical', 'complete', null, {}));
        } catch (error) {
          const classified = classifyError(error);
          attempts.push(attempt(origin, 'canonical', 'unavailable', classified.code, {}));
          return evidence('historical', 'unavailable', null, null, attempts);
        }
      }
      const selectedBlock = blocks[0];
      if (blocks.some((candidate) => candidate.number !== manifest.activation.blockNumber || candidate.hash !== manifest.activation.blockHash)
        || blocks[0].hash !== blocks[1].hash || blocks[0].timestamp !== blocks[1].timestamp) {
        attempts.push(attempt(DRPC, 'canonical', 'mismatch', 'block_disagreement', {}));
        return evidence('historical', 'mismatch', null, null, attempts);
      }
      return executeBatches('historical', manifest, selectedBlock, historicalPlan(manifest), deadlineMs, attempts);
    }

    return freeze({ readCurrentEvidence, readHistoricalEvidence });
  }

  Object.defineProperty(ns, 'createBaseRpcClient', {
    value: createBaseRpcClient,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();

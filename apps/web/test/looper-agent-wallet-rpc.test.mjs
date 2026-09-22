import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, sha256 } from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_POLICY_ABI,
  ACCOUNT_SALT,
  CONFIGURED_TOKENS,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  MODULE_REGISTRY_ABI,
  REGISTRY_ABI,
  buildActivationTransaction,
  buildEthSendTransaction,
  buildLooperAccountRuntimeCode,
  deriveLooperAccount,
} from '../src/looper-agent-wallet.js';
import * as walletRpc from '../src/looper-agent-wallet-rpc.js';

const { BASE_RPC_ORIGINS, createLooperWalletRpcClient } = walletRpc;

const IMPLEMENTATION = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const TOKEN_ID = '617';
const MODULE_REGISTRY = '0x6666666666666666666666666666666666666666';
const POLICY_MODULE = '0x7777777777777777777777777777777777777777';
const IMPLEMENTATION_CODE = '0x6001600055';
const REGISTRY_CODE = '0x6002600055';
const MODULE_CODE = '0x6003600055';
const BLOCK_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RELEASE_CONFIG = Object.freeze({
  implementation: IMPLEMENTATION,
  runtimeSha256: sha256(IMPLEMENTATION_CODE),
  moduleRegistry: MODULE_REGISTRY,
  moduleRegistryRuntimeSha256: sha256(REGISTRY_CODE),
  collectionProxyRuntimeSha256: sha256('0x6004'),
  collectionImplementation: IMPLEMENTATION,
  collectionImplementationRuntimeSha256: sha256(IMPLEMENTATION_CODE),
  registryRuntimeSha256: sha256(REGISTRY_CODE),
});

function output(type, value) {
  return encodeAbiParameters([{ type }], [value]);
}

function requester({
  disagreeOwner = false,
  disagreeBlockHash = false,
  disagreeApproval = false,
  disagreeImplementationCode = false,
  disagreeProxyCode = false,
  disagreeRegistryCode = false,
  disagreeRegistryPause = false,
  disagreeModuleCode = false,
  inactiveAccount = false,
  revertPolicy = false,
  malformedPolicyOwner = false,
  calls = [],
} = {}) {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const accountCode = buildLooperAccountRuntimeCode({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const selectors = {
    ownerOf: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'ownerOf', args: [617n] }).slice(0, 10),
    registry: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Registry' }).slice(0, 10),
    implementation: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Implementation' }).slice(0, 10),
    salt: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'erc6551Salt' }).slice(0, 10),
    tokenBound: encodeFunctionData({ abi: LOOPERS_ABI, functionName: 'tokenBoundAccount', args: [617n] }).slice(0, 10),
    registryAccount: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'account',
      args: [IMPLEMENTATION, ACCOUNT_SALT, 8453n, LOOPERS_COLLECTION, 617n],
    }).slice(0, 10),
    state: encodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, functionName: 'state' }).slice(0, 10),
    balanceOf: encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }).slice(0, 10),
    moduleRegistry: encodeFunctionData({ abi: ACCOUNT_POLICY_ABI, functionName: 'moduleRegistry' }).slice(0, 10),
    policyModule: encodeFunctionData({ abi: ACCOUNT_POLICY_ABI, functionName: 'policyModule' }).slice(0, 10),
    policyModuleOwner: encodeFunctionData({ abi: ACCOUNT_POLICY_ABI, functionName: 'policyModuleOwner' }).slice(0, 10),
    policyEpoch: encodeFunctionData({ abi: ACCOUNT_POLICY_ABI, functionName: 'policyEpoch' }).slice(0, 10),
    globallyPaused: encodeFunctionData({ abi: MODULE_REGISTRY_ABI, functionName: 'globallyPaused' }).slice(0, 10),
    approvedModuleCodehash: encodeFunctionData({ abi: MODULE_REGISTRY_ABI, functionName: 'approvedModuleCodehash', args: [POLICY_MODULE] }).slice(0, 10),
  };
  return async ({ origin, method, params }) => {
    calls.push({ origin, method, params: structuredClone(params) });
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getBlockByNumber') {
      const hash = disagreeBlockHash && origin === BASE_RPC_ORIGINS[1]
        ? `0x${'cc'.repeat(32)}`
        : BLOCK_HASH;
      return { number: '0x64', hash };
    }
    if (method === 'eth_getCode') {
      const address = params[0].toLowerCase();
      if (address === OWNER.toLowerCase()) return '0x';
      if (address === IMPLEMENTATION.toLowerCase()) {
        return disagreeImplementationCode && origin === BASE_RPC_ORIGINS[1] ? '0x6000' : IMPLEMENTATION_CODE;
      }
      if (address === MODULE_REGISTRY.toLowerCase()) {
        return disagreeRegistryCode && origin === BASE_RPC_ORIGINS[1] ? '0x6000' : REGISTRY_CODE;
      }
      if (address === POLICY_MODULE.toLowerCase()) {
        return disagreeModuleCode && origin === BASE_RPC_ORIGINS[1] ? '0x6000' : MODULE_CODE;
      }
      if (address === account.toLowerCase()) {
        if (inactiveAccount) return '0x';
        return disagreeProxyCode && origin === BASE_RPC_ORIGINS[1] ? `${accountCode.slice(0, -2)}00` : accountCode;
      }
      throw new Error(`Unexpected code address ${params[0]}`);
    }
    if (method === 'eth_getBalance') return '0x3e8';
    if (method !== 'eth_call') throw new Error(`Unexpected ${method}`);
    const call = params[0];
    const selector = call.data.slice(0, 10);
    if (selector === selectors.ownerOf) {
      const owner = disagreeOwner && origin === BASE_RPC_ORIGINS[1]
        ? '0x3333333333333333333333333333333333333333'
        : OWNER;
      return output('address', owner);
    }
    if (selector === selectors.registry) return output('address', ERC6551_REGISTRY);
    if (selector === selectors.implementation) return output('address', IMPLEMENTATION);
    if (selector === selectors.salt) return output('bytes32', ACCOUNT_SALT);
    if (selector === selectors.tokenBound || selector === selectors.registryAccount) return output('address', account);
    if (selector === selectors.state) return output('uint256', 7n);
    if (selector === selectors.balanceOf) return output('uint256', 25n);
    if (revertPolicy && selector === selectors.policyModule) throw new Error('policy read reverted');
    if (selector === selectors.moduleRegistry) return output('address', MODULE_REGISTRY);
    if (selector === selectors.policyModule) return output('address', POLICY_MODULE);
    if (selector === selectors.policyModuleOwner) {
      const canonical = output('address', OWNER);
      return malformedPolicyOwner ? `${canonical}${'00'.repeat(32)}` : canonical;
    }
    if (selector === selectors.policyEpoch) return output('uint256', 9n);
    if (selector === selectors.globallyPaused) {
      return output('bool', disagreeRegistryPause && origin === BASE_RPC_ORIGINS[1]);
    }
    if (selector === selectors.approvedModuleCodehash) {
      const hash = disagreeApproval && origin === BASE_RPC_ORIGINS[1]
        ? `0x${'aa'.repeat(32)}`
        : keccak256(MODULE_CODE);
      return output('bytes32', hash);
    }
    throw new Error(`Unexpected selector ${selector}`);
  };
}

test('anchored Base reader verifies configuration, ownership, account runtime and balances across origins', async () => {
  const calls = [];
  const reader = createLooperWalletRpcClient({ request: requester({ calls }), releaseConfig: RELEASE_CONFIG });
  const result = await reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  });
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const accountCode = buildLooperAccountRuntimeCode({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  assert.equal(result.chainId, 8453);
  assert.equal(result.blockNumber, '100');
  assert.equal(result.blockHash, BLOCK_HASH);
  assert.equal(result.owner, getAddress(OWNER));
  assert.equal(result.collectionAccount, account);
  assert.equal(result.registryAccount, account);
  assert.equal(result.operatorCode, '0x');
  assert.equal(result.accountCode, accountCode);
  assert.equal(result.accountRuntimeSha256, sha256(accountCode));
  assert.equal(result.accountCodeMatches, true);
  assert.equal(result.implementation, getAddress(IMPLEMENTATION));
  assert.equal(result.implementationRuntimeSha256, sha256(IMPLEMENTATION_CODE));
  assert.equal(result.moduleRegistry, getAddress(MODULE_REGISTRY));
  assert.equal(result.moduleRegistryRuntimeSha256, sha256(REGISTRY_CODE));
  assert.equal(result.policyModule, getAddress(POLICY_MODULE));
  assert.equal(result.policyModuleOwner, getAddress(OWNER));
  assert.equal(result.policyEpoch, '9');
  assert.equal(result.registryPaused, false);
  assert.equal(result.policyModuleRuntimeSha256, sha256(MODULE_CODE));
  assert.equal(result.policyModuleCodehash, keccak256(MODULE_CODE));
  assert.equal(result.approvedModuleCodehash, keccak256(MODULE_CODE));
  assert.notEqual(result.policyModuleRuntimeSha256, result.approvedModuleCodehash);
  assert.equal(result.policyModuleApproved, true);
  assert.equal(result.policyModuleCodehashMatches, true);
  assert.equal(result.state, '7');
  assert.equal(result.nativeWei, '1000');
  assert.deepEqual(result.tokens, [{ ...CONFIGURED_TOKENS[0], balanceBaseUnits: '25' }]);
  const stateReads = calls.filter((call) => ['eth_call', 'eth_getCode', 'eth_getBalance'].includes(call.method));
  assert.ok(stateReads.length > 0);
  assert.equal(stateReads.every((call) => {
    const block = call.params.at(-1);
    return block?.blockHash === BLOCK_HASH && block?.requireCanonical === true;
  }), true);
  assert.equal(stateReads.some((call) => typeof call.params.at(-1) === 'string'), false);
});

test('anchored Base reader rejects uppercase RPC code and ABI data instead of normalizing it', async (t) => {
  await t.test('runtime code', async () => {
    const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID }).toLowerCase();
    const base = requester();
    const request = async (input) => {
      const result = await base(input);
      if (input.method === 'eth_getCode' && input.params[0].toLowerCase() === account) {
        return `0x${result.slice(2).toUpperCase()}`;
      }
      return result;
    };
    const reader = createLooperWalletRpcClient({ request, releaseConfig: RELEASE_CONFIG });
    await assert.rejects(reader.readSnapshot({ selection: { tokenId: TOKEN_ID, owner: OWNER } }), /runtime|malformed/i);
  });

  await t.test('contract call result', async () => {
    const base = requester();
    const request = async (input) => {
      const result = await base(input);
      if (input.method === 'eth_call') return String(result).replace(/[a-f]/g, (value) => value.toUpperCase());
      return result;
    };
    const reader = createLooperWalletRpcClient({ request, releaseConfig: RELEASE_CONFIG });
    await assert.rejects(reader.readSnapshot({ selection: { tokenId: TOKEN_ID, owner: OWNER } }), /result|malformed/i);
  });
});

test('inactive account snapshots prove the reviewed module registry runtime across both origins at the anchor', async () => {
  const calls = [];
  const reader = createLooperWalletRpcClient({
    request: requester({ inactiveAccount: true, calls }),
    releaseConfig: RELEASE_CONFIG,
  });
  const result = await reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  });
  assert.equal(result.accountCode, '0x');
  assert.equal(result.moduleRegistry, getAddress(MODULE_REGISTRY));
  assert.equal(result.moduleRegistryCode, REGISTRY_CODE);
  assert.equal(result.moduleRegistryRuntimeSha256, sha256(REGISTRY_CODE));
  assert.equal(calls.filter((call) => call.method === 'eth_getCode'
    && call.params[0].toLowerCase() === MODULE_REGISTRY.toLowerCase()).length, 2);
  assert.equal(calls.filter((call) => call.method === 'eth_getCode'
    && call.params[0].toLowerCase() === MODULE_REGISTRY.toLowerCase())
    .every((call) => call.params[1]?.blockHash === BLOCK_HASH && call.params[1]?.requireCanonical === true), true);

  const disagreeing = createLooperWalletRpcClient({
    request: requester({ inactiveAccount: true, disagreeRegistryCode: true }),
    releaseConfig: RELEASE_CONFIG,
  });
  await assert.rejects(disagreeing.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /disagree/i);
});

test('receipt revalidation pins every ownership and config read to the receipt block', async () => {
  const calls = [];
  const baseRequest = requester();
  const receiptHash = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  const reader = createLooperWalletRpcClient({
    releaseConfig: RELEASE_CONFIG,
    request: async (input) => {
      calls.push(structuredClone(input));
      if (input.method === 'eth_getBlockByNumber' && input.params[0] === '0x63') {
        return { number: '0x63', hash: receiptHash };
      }
      return baseRequest(input);
    },
  });
  await reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'receipt',
    receipt: { blockNumber: '99', blockHash: receiptHash },
  });
  assert.equal(calls.some((call) => call.method === 'eth_blockNumber'), false);
  assert.equal(calls.filter((call) => call.method === 'eth_getBlockByNumber').every((call) => call.params[0] === '0x63'), true);
  assert.equal(calls.filter((call) => ['eth_call', 'eth_getCode', 'eth_getBalance'].includes(call.method)).every((call) => {
    const block = call.params.at(-1);
    return block?.blockHash === receiptHash && block?.requireCanonical === true;
  }), true);
});

test('anchor hash disagreement fails before any state can be labeled with the old anchor', async () => {
  const calls = [];
  const reader = createLooperWalletRpcClient({
    request: requester({ calls, disagreeBlockHash: true }),
    releaseConfig: RELEASE_CONFIG,
  });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /block hashes disagree/i);
  assert.equal(calls.some((call) => ['eth_call', 'eth_getCode', 'eth_getBalance'].includes(call.method)), false);
});

test('reorg-safe reads fail closed instead of retrying state against a numeric old anchor', async () => {
  const calls = [];
  const baseRequest = requester({ calls });
  const reader = createLooperWalletRpcClient({
    releaseConfig: RELEASE_CONFIG,
    request: async (input) => {
      if (['eth_call', 'eth_getCode', 'eth_getBalance'].includes(input.method)) {
        const block = input.params.at(-1);
        if (typeof block === 'string') throw new Error('numeric old anchor was used');
        if (block?.blockHash === BLOCK_HASH && block?.requireCanonical === true) {
          throw new Error('canonical block is no longer available');
        }
      }
      return baseRequest(input);
    },
  });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /canonical block is no longer available/);
  assert.equal(calls.some((call) => ['eth_call', 'eth_getCode', 'eth_getBalance'].includes(call.method)
    && typeof call.params.at(-1) === 'string'), false);
});

test('receipt evidence rejects malformed quantities, statuses, and transaction hash bindings', async () => {
  const requestedHash = `0x${'cc'.repeat(32)}`;
  const validTransaction = {
    hash: requestedHash,
    chainId: '0x2105',
    from: OWNER,
    to: ERC6551_REGISTRY,
    value: '0x0',
    input: '0x',
  };
  const validReceipt = {
    status: '0x1',
    transactionHash: requestedHash,
    blockNumber: '0x64',
    blockHash: BLOCK_HASH,
    logs: [],
  };
  for (const mutation of [
    { receipt: { ...validReceipt, status: '0x2' }, message: /status/i },
    { receipt: { ...validReceipt, status: '0x01' }, message: /status/i },
    { receipt: { ...validReceipt, blockNumber: '0x064' }, message: /quantity|block/i },
    { transaction: { ...validTransaction, chainId: '0x02105' }, message: /quantity|chain/i },
    { transaction: { ...validTransaction, value: '0x00' }, message: /quantity|value/i },
    { transaction: { ...validTransaction, input: '0xABcd' }, message: /input|malformed/i },
    { transaction: { ...validTransaction, hash: requestedHash.toUpperCase().replace('0X', '0x') }, message: /hash/i },
    { transaction: { ...validTransaction, hash: `0x${'dd'.repeat(32)}` }, message: /hash/i },
    { receipt: { ...validReceipt, transactionHash: `0x${'ee'.repeat(32)}` }, message: /hash/i },
  ]) {
    const transaction = mutation.transaction ?? validTransaction;
    const receipt = mutation.receipt ?? validReceipt;
    const reader = createLooperWalletRpcClient({
      releaseConfig: RELEASE_CONFIG,
      wait: async () => {},
      request: async ({ method }) => method === 'eth_getTransactionReceipt' ? receipt : transaction,
    });
    await assert.rejects(reader.readReceipt({ hash: requestedHash }), mutation.message);
  }
});

test('fixed requester rejects noncanonical JSON-RPC envelopes before consuming results', async () => {
  const malformedBodies = [
    ({ id }) => ({ jsonrpc: '2.0', id: id + 1, result: '0x2105' }),
    ({ id }) => ({ jsonrpc: '1.0', id, result: '0x2105' }),
    ({ id }) => ({ jsonrpc: '2.0', id, result: '0x2105', extra: true }),
    ({ id }) => ({ jsonrpc: '2.0', id, error: { code: -32000, message: 'failed' } }),
    ({ id }) => ({ jsonrpc: '2.0', id }),
  ];
  for (const makeBody of malformedBodies) {
    const reader = createLooperWalletRpcClient({
      releaseConfig: RELEASE_CONFIG,
      fetchImpl: async (_origin, options) => {
        const requestBody = JSON.parse(options.body);
        return { ok: true, json: async () => makeBody(requestBody) };
      },
    });
    await assert.rejects(reader.readSnapshot({
      selection: { tokenId: TOKEN_ID, owner: OWNER },
      phase: 'readiness',
    }), /envelope/i);
  }
});

test('anchored Base reader rejects stale ownership disagreement', async () => {
  const reader = createLooperWalletRpcClient({ request: requester({ disagreeOwner: true }), releaseConfig: RELEASE_CONFIG });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /disagree/i);
});

test('policy evidence fails closed on either-origin disagreement or revert', async () => {
  let reader = createLooperWalletRpcClient({ request: requester({ disagreeApproval: true }), releaseConfig: RELEASE_CONFIG });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /disagree/i);

  reader = createLooperWalletRpcClient({ request: requester({ revertPolicy: true }), releaseConfig: RELEASE_CONFIG });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /revert/i);
});

test('implementation, proxy, registry and selected module evidence must agree across both origins', async () => {
  for (const options of [
    { disagreeImplementationCode: true },
    { disagreeProxyCode: true },
    { disagreeRegistryCode: true },
    { disagreeRegistryPause: true },
    { disagreeModuleCode: true },
  ]) {
    const reader = createLooperWalletRpcClient({ request: requester(options), releaseConfig: RELEASE_CONFIG });
    await assert.rejects(reader.readSnapshot({
      selection: { tokenId: TOKEN_ID, owner: OWNER },
      phase: 'readiness',
    }), /disagree/i);
  }
});

test('unreviewed release constants force baseline-only reads and malformed ABI words fail closed', async () => {
  const calls = [];
  let reader = createLooperWalletRpcClient({ request: requester({ calls }), releaseConfig: {} });
  const result = await reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  });
  assert.equal(result.policyEvidenceRead, false);
  assert.equal(result.moduleRegistry, null);
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID }).toLowerCase();
  const accountCalls = calls.filter((call) => call.method === 'eth_call' && call.params[0].to.toLowerCase() === account);
  assert.equal(accountCalls.length, 0);

  reader = createLooperWalletRpcClient({
    request: requester({ malformedPolicyOwner: true }),
    releaseConfig: RELEASE_CONFIG,
  });
  await assert.rejects(reader.readSnapshot({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    phase: 'readiness',
  }), /canonical|malformed/i);
});

test('transport route matrix is closed and the high-level client exposes no generic request', () => {
  assert.deepEqual(walletRpc.RPC_ROUTES, {
    'https://mainnet.base.org': ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt'],
    'https://base.drpc.org': ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt', 'trace'],
    'https://base-rpc.publicnode.com': ['chainId', 'latestBlock', 'blockByNumber', 'transaction', 'receipt'],
  });
  assert.equal(walletRpc.BLOCKSCOUT_ORIGIN, 'https://base.blockscout.com');
  assert.equal(typeof walletRpc.createLooperAgentWalletRpc, 'function');
  const client = walletRpc.createLooperAgentWalletRpc({ fetchImpl: async () => { throw new Error('unused'); } });
  assert.deepEqual(Object.keys(client), [
    'readAccountPreflight', 'readWalletSnapshot', 'prepareActivation', 'prepareEthSend',
    'prepareErc20Send', 'pollOperation', 'revalidateReceipt',
  ]);
  assert.equal(client.request, undefined);
});

test('Blockscout token route schema rejects pagination unknown keys prototypes and sparse items', () => {
  assert.equal(typeof walletRpc.validateBlockscoutTokenResponse, 'function');
  const valid = {
    items: [{
      token: {
        address_hash: '0x5555555555555555555555555555555555555555',
        circulating_market_cap: null, decimals: '18', exchange_rate: null,
        holders_count: '1', icon_url: 'https://example.com/token.png', name: 'Token',
        symbol: 'TOK', total_supply: '100', type: 'ERC-20', volume_24h: null,
      },
      token_id: null, token_instance: null, value: '25',
    }],
    next_page_params: null,
  };
  const normalized = walletRpc.validateBlockscoutTokenResponse(valid);
  assert.equal(normalized[0].contract, getAddress(valid.items[0].token.address_hash));
  for (const candidate of [
    { ...valid, next_page_params: {} },
    { ...valid, extra: true },
    { ...valid, items: [{ ...valid.items[0], extra: true }] },
    { ...valid, items: Object.assign([valid.items[0]], { extra: true }) },
    Object.assign(Object.create({ inherited: true }), valid),
  ]) assert.throws(() => walletRpc.validateBlockscoutTokenResponse(candidate), /Blockscout|schema|keys|plain|pagination/i);
  const sparse = { ...valid, items: new Array(1), next_page_params: null };
  assert.throws(() => walletRpc.validateBlockscoutTokenResponse(sparse), /sparse|Blockscout/i);
});

test('trace bounds accept exact direct calls and reject every limit plus one', () => {
  assert.equal(typeof walletRpc.validateDirectCallTrace, 'function');
  const leaf = { type: 'CALL', from: OWNER, to: IMPLEMENTATION, input: '0x', output: '0x', value: '0x0', logs: [], calls: [] };
  assert.doesNotThrow(() => walletRpc.validateDirectCallTrace(leaf));
  const tooManyChildren = { ...leaf, calls: Array.from({ length: 257 }, () => leaf) };
  assert.throws(() => walletRpc.validateDirectCallTrace(tooManyChildren), /children|256|trace/i);
  let tooDeep = leaf;
  for (let index = 0; index < 33; index += 1) tooDeep = { ...leaf, calls: [tooDeep] };
  assert.throws(() => walletRpc.validateDirectCallTrace(tooDeep), /depth|32|trace/i);
  assert.throws(() => walletRpc.validateDirectCallTrace({ ...leaf, input: `0x${'00'.repeat(262145)}` }), /bytes|262144|trace/i);
});

function strictFetchFromRequester(handler, calls = []) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    let result;
    if (body.method === 'eth_getCode' && body.params[0].toLowerCase() === LOOPERS_COLLECTION.toLowerCase()) result = '0x6004';
    else if (body.method === 'eth_getCode' && body.params[0].toLowerCase() === ERC6551_REGISTRY.toLowerCase()) result = REGISTRY_CODE;
    else if (body.method === 'eth_getCode' && body.params[0].toLowerCase() === CONFIGURED_TOKENS[0].address.toLowerCase()) result = '0x6005';
    else if (body.method === 'eth_getStorageAt') result = `0x${'00'.repeat(12)}${IMPLEMENTATION.slice(2).toLowerCase()}`;
    else if (body.method === 'eth_estimateGas') result = '0x5208';
    else if (body.method === 'eth_gasPrice') result = '0x2';
    else if (body.method === 'eth_call' && body.params[0].from) result = '0x';
    else if (body.method === 'eth_call' && body.params[0].data === '0x313ce567') result = output('uint256', 18n);
    else result = await handler({ origin: url, method: body.method, params: body.params });
    const text = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    return {
      ok: true, status: 200, redirected: false, url,
      headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(Buffer.byteLength(text)) : null },
      async text() { return text; },
    };
  };
}

test('anchor readiness uses three-origin quorum and returns complete deterministic account pins', async () => {
  const calls = [];
  const client = walletRpc.createLooperAgentWalletRpc({
    fetchImpl: strictFetchFromRequester(requester(), calls),
    releaseConfig: RELEASE_CONFIG,
  });
  const result = await client.readAccountPreflight({ selection: { tokenId: TOKEN_ID, owner: OWNER } });
  assert.deepEqual(result.selection, {
    tokenId: TOKEN_ID,
    owner: getAddress(OWNER),
    account: deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID }),
  });
  assert.equal(result.anchor.number, '0x64');
  assert.equal(result.anchor.hash, BLOCK_HASH);
  assert.equal(result.accountState, 'active');
  assert.equal(result.operatorProfile, 'eoa');
  assert.match(result.pins.proxyCodeHash, /^0x[0-9a-f]{64}$/);
  assert.match(result.pins.proxyImplementationSlot, /^0x[0-9a-f]{64}$/);
  assert.equal(calls.filter(({ body }) => body.method === 'eth_chainId').length, 3);
  assert.equal(calls.some(({ url, body }) => url.includes('publicnode') && ['eth_call', 'eth_getCode', 'eth_getBalance', 'eth_getStorageAt'].includes(body.method)), false);
});

test('pre-signature and receipt-block boundaries always issue fresh complete anchored reads', async () => {
  const calls = [];
  const client = walletRpc.createLooperAgentWalletRpc({
    fetchImpl: strictFetchFromRequester(requester(), calls),
    releaseConfig: RELEASE_CONFIG,
    randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    now: () => 1000,
  });
  await client.readAccountPreflight({ selection: { tokenId: TOKEN_ID, owner: OWNER } });
  const firstReadCount = calls.length;
  await client.readAccountPreflight({ selection: { tokenId: TOKEN_ID, owner: OWNER } });
  assert.equal(calls.length, firstReadCount * 2);
  calls.length = 0;
  await client.readAccountPreflight({
    selection: { tokenId: TOKEN_ID, owner: OWNER },
    receipt: { blockNumber: '0x64', blockHash: BLOCK_HASH },
  });
  assert.equal(calls.some(({ body }) => body.method === 'eth_getBlockByNumber' && body.params[0] === 'latest'), false);
  assert.equal(calls.filter(({ body }) => body.method === 'eth_getBlockByNumber' && body.params[0] === '0x64').length, 3);
});

test('pre-signature preparers independently refresh activation ETH and ERC-20 evidence', async () => {
  let id = 0;
  const activeCalls = [];
  const activeClient = walletRpc.createLooperAgentWalletRpc({
    fetchImpl: strictFetchFromRequester(requester(), activeCalls),
    releaseConfig: RELEASE_CONFIG,
    randomUUID: () => `550e8400-e29b-41d4-a716-${String(++id).padStart(12, '0')}`,
    now: () => 1000,
  });
  const eth = await activeClient.prepareEthSend({ selection: { tokenId: TOKEN_ID, owner: OWNER }, recipient: POLICY_MODULE, amountWei: '7' });
  const afterEth = activeCalls.length;
  const erc20 = await activeClient.prepareErc20Send({
    selection: { tokenId: TOKEN_ID, owner: OWNER }, token: CONFIGURED_TOKENS[0].address,
    recipient: POLICY_MODULE, amountBaseUnits: '7',
  });
  assert.ok(activeCalls.length > afterEth);
  assert.equal(eth.preState, '7');
  assert.equal(eth.innerCall.value, '0x7');
  assert.equal(erc20.preState, '7');
  assert.equal(erc20.innerCall.to, CONFIGURED_TOKENS[0].address);
  assert.equal(Object.isFrozen(erc20), true);

  const activationCalls = [];
  const activationClient = walletRpc.createLooperAgentWalletRpc({
    fetchImpl: strictFetchFromRequester(requester({ inactiveAccount: true }), activationCalls),
    releaseConfig: RELEASE_CONFIG,
    randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    now: () => 1000,
  });
  const activation = await activationClient.prepareActivation({ selection: { tokenId: TOKEN_ID, owner: OWNER } });
  assert.equal(activation.kind, 'activation');
  assert.equal(activation.evidence.accountState, 'undeployed');
  assert.equal(activeCalls.filter(({ body }) => body.method === 'eth_chainId').length, 6);
  assert.equal(activationCalls.filter(({ body }) => body.method === 'eth_chainId').length, 3);
});

test('token discovery uses one exact Blockscout route then proves token reads at the anchor', async () => {
  const calls = [];
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const token = '0x5555555555555555555555555555555555555555';
  const rpcFetch = strictFetchFromRequester(requester(), calls);
  const fetchImpl = async (url, options) => {
    if (url.startsWith(walletRpc.BLOCKSCOUT_ORIGIN)) {
      calls.push({ url, options, body: null });
      const payload = {
        items: [{
          token: { address_hash: token, circulating_market_cap: null, decimals: '18', exchange_rate: null, holders_count: '1', icon_url: 'https://example.com/t.png', name: 'Token', symbol: 'TOK', total_supply: '100', type: 'ERC-20', volume_24h: null },
          token_id: null, token_instance: null, value: '25',
        }],
        next_page_params: null,
      };
      const text = JSON.stringify(payload);
      return { ok: true, status: 200, redirected: false, url, headers: { get: () => String(Buffer.byteLength(text)) }, async text() { return text; } };
    }
    const body = JSON.parse(options.body);
    if (body.method === 'eth_getCode' && body.params[0].toLowerCase() === token.toLowerCase()) {
      const text = JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x6005' });
      return { ok: true, status: 200, redirected: false, url, headers: { get: () => String(Buffer.byteLength(text)) }, async text() { return text; } };
    }
    if (body.method === 'eth_call' && body.params[0].to.toLowerCase() === token.toLowerCase()) {
      const result = body.params[0].data === '0x313ce567' ? output('uint256', 18n) : output('uint256', 25n);
      const text = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
      return { ok: true, status: 200, redirected: false, url, headers: { get: () => String(Buffer.byteLength(text)) }, async text() { return text; } };
    }
    return rpcFetch(url, options);
  };
  const client = walletRpc.createLooperAgentWalletRpc({ fetchImpl, releaseConfig: RELEASE_CONFIG });
  const result = await client.readWalletSnapshot({ selection: { tokenId: TOKEN_ID, owner: OWNER } });
  assert.deepEqual(result.tokens, [{
    contract: getAddress(token), balanceBaseUnits: '25', decimals: 18, name: 'Token', symbol: 'TOK',
    iconUrl: 'https://example.com/t.png', metadataTrusted: false, sendable: true,
  }]);
  const blockscout = calls.find(({ url }) => url.startsWith(walletRpc.BLOCKSCOUT_ORIGIN));
  assert.equal(blockscout.url, `${walletRpc.BLOCKSCOUT_ORIGIN}/api/v2/addresses/${account}/tokens?type=ERC-20`);
  assert.deepEqual({ ...blockscout.options, signal: undefined }, { method: 'GET', redirect: 'error', credentials: 'omit', signal: undefined });
});

test('token read failures stay raw read-only and activity is verified-local-only capped at twenty', async () => {
  const activities = Array.from({ length: 25 }, (_, index) => ({ txHash: `0x${index.toString(16).padStart(64, '0')}`, classification: 'confirmed_attributed' }));
  const rpcFetch = strictFetchFromRequester(requester());
  const fetchImpl = async (url, options) => {
    if (url.startsWith(walletRpc.BLOCKSCOUT_ORIGIN)) {
      const text = JSON.stringify({ items: [], next_page_params: null });
      return { ok: true, status: 200, redirected: false, url, headers: { get: () => String(Buffer.byteLength(text)) }, async text() { return text; } };
    }
    return rpcFetch(url, options);
  };
  const client = walletRpc.createLooperAgentWalletRpc({ fetchImpl, releaseConfig: RELEASE_CONFIG });
  const result = await client.readWalletSnapshot({ selection: { tokenId: TOKEN_ID, owner: OWNER }, activity: activities });
  assert.equal(result.activity.length, 20);
  assert.equal(result.activity.every((entry) => entry.classification === 'confirmed_attributed'), true);
});

test('direct activation receipt classification requires exact EOA envelope event and post-state', () => {
  assert.equal(typeof walletRpc.verifyOperationReceipt, 'function');
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const preparedTransaction = buildActivationTransaction({ owner: OWNER, implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const hash = `0x${'aa'.repeat(32)}`;
  const transaction = {
    hash, chainId: '0x2105', from: OWNER, to: preparedTransaction.to, input: preparedTransaction.data,
    value: '0x0', blockNumber: '0x64', blockHash: BLOCK_HASH, transactionIndex: '0x0',
  };
  const receipt = {
    transactionHash: hash, status: '0x1', blockNumber: '0x64', blockHash: BLOCK_HASH,
    transactionIndex: '0x0', logs: [{ eventName: 'AccountCreated', account }],
  };
  const prepared = { kind: 'activation', selection: { tokenId: TOKEN_ID, owner: OWNER, account }, transaction: preparedTransaction };
  const postState = { anchor: { number: '0x64', hash: BLOCK_HASH }, accountState: 'active', account, operatorCode: '0x' };
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt, prepared, postState }).classification, 'confirmed_attributed');
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction: { ...transaction, from: POLICY_MODULE }, receipt, prepared, postState }).classification, 'observed_unattributed');
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt: { ...receipt, logs: [...receipt.logs, ...receipt.logs] }, prepared, postState }).classification, 'observed_unattributed');
});

test('direct send StateUpdated and trace ancestry are mandatory for receipt classification', () => {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const recipient = POLICY_MODULE;
  const preparedTransaction = buildEthSendTransaction({ owner: OWNER, account, recipient, amountWei: '7' });
  const hash = `0x${'bb'.repeat(32)}`;
  const transaction = {
    hash, chainId: '0x2105', from: OWNER, to: account, input: preparedTransaction.data, value: '0x0',
    blockNumber: '0x64', blockHash: BLOCK_HASH, transactionIndex: '0x0',
  };
  const receipt = {
    transactionHash: hash, status: '0x1', blockNumber: '0x64', blockHash: BLOCK_HASH,
    transactionIndex: '0x0', logs: [{ eventName: 'StateUpdated', address: account, state: '8', receiptArrayIndex: 0 }],
  };
  const prepared = {
    kind: 'eth', selection: { tokenId: TOKEN_ID, owner: OWNER, account }, transaction: preparedTransaction,
    preState: '7', innerCall: { from: account, to: recipient, input: '0x', value: '0x7' },
  };
  const postState = { anchor: { number: '0x64', hash: BLOCK_HASH }, accountState: 'active', account, operatorCode: '0x', state: '8' };
  const trace = { type: 'CALL', from: OWNER, to: account, input: preparedTransaction.data, output: '0x', value: '0x0', logs: [], calls: [{ type: 'CALL', from: account, to: recipient, input: '0x', output: '0x', value: '0x7', logs: [{ index: 0, eventName: 'StateUpdated', address: account, state: '8' }], calls: [] }] };
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt, prepared, postState, trace }).classification, 'confirmed_attributed');
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt: { ...receipt, logs: [] }, prepared, postState, trace }).classification, 'uncertain_hashed');
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt, prepared, postState, trace: { ...trace, calls: [] } }).classification, 'uncertain_hashed');
  const missingFrameLogs = { ...trace, calls: [{ ...trace.calls[0], logs: [] }] };
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction, receipt, prepared, postState, trace: missingFrameLogs }).classification, 'uncertain_hashed');
});

test('receipt classification keeps status-zero evidence uncertain until transaction binding is exact', () => {
  const account = deriveLooperAccount({ implementation: IMPLEMENTATION, tokenId: TOKEN_ID });
  const preparedTransaction = buildEthSendTransaction({ owner: OWNER, account, recipient: POLICY_MODULE, amountWei: '7' });
  const hash = `0x${'cc'.repeat(32)}`;
  const baseTransaction = { hash, chainId: '0x2105', from: OWNER, to: account, input: preparedTransaction.data, value: '0x0', blockNumber: '0x64', blockHash: BLOCK_HASH, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, status: '0x0', blockNumber: '0x64', blockHash: BLOCK_HASH, transactionIndex: '0x0', logs: [] };
  const prepared = { kind: 'eth', selection: { tokenId: TOKEN_ID, owner: OWNER, account }, transaction: preparedTransaction, preState: '7', innerCall: { from: account, to: POLICY_MODULE, input: '0x', value: '0x7' } };
  const revertedState = { anchor: { number: '0x64', hash: BLOCK_HASH }, accountState: 'active', account, state: '7', operatorCode: '0x' };
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction: baseTransaction, receipt, prepared, revertedState }).classification, 'reverted');
  assert.equal(walletRpc.verifyOperationReceipt({ requestedHash: hash, transaction: { ...baseTransaction, input: '0x' }, receipt, prepared, revertedState }).classification, 'uncertain_hashed');
});

test('polling cadence is immediate then two seconds then ten seconds and stops at the fixed deadline', async () => {
  let now = 0;
  const sleeps = [];
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, at: now });
    const text = JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null });
    return { ok: true, status: 200, redirected: false, url, headers: { get: () => String(Buffer.byteLength(text)) }, async text() { return text; } };
  };
  const client = walletRpc.createLooperAgentWalletRpc({
    fetchImpl,
    releaseConfig: RELEASE_CONFIG,
    now: () => now,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); now += milliseconds; },
  });
  const result = await client.pollOperation({ hash: `0x${'dd'.repeat(32)}`, createdAtMs: 0 });
  assert.equal(result.classification, 'uncertain_hashed');
  assert.equal(calls[0].at, 0);
  assert.equal(calls.every(({ at }) => at < 600_000), true);
  assert.equal(sleeps.slice(0, 60).every((value) => value === 2_000), true);
  assert.equal(sleeps.slice(60).every((value) => value === 10_000), true);
  assert.equal(now, 600_000);
  assert.equal(calls.every(({ url }) => !url.includes('publicnode')), true);
});

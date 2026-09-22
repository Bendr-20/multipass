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
  buildLooperAccountRuntimeCode,
  deriveLooperAccount,
} from '../src/looper-agent-wallet.js';
import { BASE_RPC_ORIGINS, createLooperWalletRpcClient } from '../src/looper-agent-wallet-rpc.js';

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

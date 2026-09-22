import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ethers } from 'ethers';
import * as release from '../scripts/deploy-looper-agent-account.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PATH = '/tmp/looper-agent-account-base-preview-2026-09-22T1849Z.json';
const PREVIEW_SHA256 = '85f3fef7a95c2efad44230dfccc073d2bf0e9c795bd97a13a7f51b6dc4623f63';
const REGISTRY = '0x4e4df0DEa80e389802f819D95AAEe4CB004D3E1a';
const ACCOUNT = '0xf192f350427c8F58bC28e78b1e6Af164279F486e';
const REGISTRY_TX = '0x7ca7c491fad55b131a3ce5833d329e57a221d1070323d8a384fa3731a686d42b';
const ACCOUNT_TX = '0x6a61d1869a3ed89913c0ac79bd74f549afd0489a66288c9d0a07d712be37ce5f';
const OLD_IMPLEMENTATION = '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF';
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const CANONICAL_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
const SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';
const OWNER = '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE';

function accountCreatedLog({ tokenId, account, blockNumber = 100, transactionIndex = 1, logIndex = 2 }) {
  const iface = new ethers.Interface([
    'event ERC6551AccountCreated(address account,address indexed implementation,bytes32 salt,uint256 chainId,address indexed tokenContract,uint256 indexed tokenId)',
  ]);
  const encoded = iface.encodeEventLog(iface.getEvent('ERC6551AccountCreated'), [
    account,
    OLD_IMPLEMENTATION,
    SALT,
    8453,
    COLLECTION,
    tokenId,
  ]);
  return {
    address: CANONICAL_REGISTRY,
    blockHash: `0x${'11'.repeat(32)}`,
    blockNumber: ethers.toQuantity(blockNumber),
    blockTimestamp: '0x1',
    transactionHash: `0x${String(tokenId).padStart(64, '0')}`,
    transactionIndex: ethers.toQuantity(transactionIndex),
    logIndex: ethers.toQuantity(logIndex),
    removed: false,
    data: encoded.data,
    topics: encoded.topics,
  };
}

test('release inspection surface is closed and binds the exact schema-v2 preview and deployed pair', async () => {
  assert.deepEqual(release.RELEASE_RPC_ORIGINS, [
    'https://mainnet.base.org',
    'https://base.drpc.org',
    'https://base-rpc.publicnode.com',
  ]);
  assert.equal(release.RELEASE_BLOCKSCOUT_ORIGIN, 'https://base.blockscout.com');
  const bytes = await readFile(PREVIEW_PATH);
  const preview = release.validateBoundReleasePreview(bytes);
  assert.equal(preview.sha256, PREVIEW_SHA256);
  assert.equal(preview.document.schemaVersion, '2.0.0');
  assert.equal(preview.document.registryDeployment.expectedAddress, REGISTRY);
  assert.equal(preview.document.registryDeployment.expectedRuntimeBytes, 1234);
  assert.equal(preview.document.registryDeployment.expectedRuntimeSha256, '0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb');
  assert.equal(preview.document.accountDeployment.expectedAddress, ACCOUNT);
  assert.equal(preview.document.accountDeployment.expectedRuntimeBytes, 6096);
  assert.equal(preview.document.accountDeployment.expectedRuntimeSha256, '0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c');
  assert.throws(() => release.validateBoundReleasePreview(Buffer.from(`${bytes} `)), /preview.*sha-256|bound preview/i);
});

test('raw canonical AccountCreated decoder enumerates exactly the four old accounts without labels', () => {
  const tokenIds = [1n, 645n, 646n, 3802n];
  const logs = tokenIds.map((tokenId, index) => accountCreatedLog({
    tokenId,
    account: ethers.getAddress(`0x${(index + 1).toString(16).padStart(40, '0')}`),
    blockNumber: 100 + index,
    logIndex: index,
  }));
  const decoded = release.decodeCanonicalAccountCreatedLogs(logs, {
    implementation: OLD_IMPLEMENTATION,
    collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY,
    salt: SALT,
    chainId: 8453,
    cap: 100,
  });
  assert.deepEqual(decoded.map((item) => item.tokenId), ['1', '645', '646', '3802']);
  assert.deepEqual(decoded.map((item) => item.account), logs.map((_, index) => ethers.getAddress(`0x${(index + 1).toString(16).padStart(40, '0')}`)));
  assert.throws(() => release.decodeCanonicalAccountCreatedLogs([
    { ...logs[0], eventName: 'AccountCreated' },
  ], {
    implementation: OLD_IMPLEMENTATION,
    collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY,
    salt: SALT,
    chainId: 8453,
    cap: 100,
  }), /unknown|exact|label/i);
  assert.throws(() => release.decodeCanonicalAccountCreatedLogs([...logs, logs[0]], {
    implementation: OLD_IMPLEMENTATION,
    collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY,
    salt: SALT,
    chainId: 8453,
    cap: 100,
  }), /duplicate/i);
});

test('log range planner is deterministic, bounded to 2000 blocks, and capped', () => {
  assert.deepEqual(release.planLogRanges(10, 4010, { rangeSize: 2000, maxRanges: 3 }), [
    { fromBlock: 10, toBlock: 2009 },
    { fromBlock: 2010, toBlock: 4009 },
    { fromBlock: 4010, toBlock: 4010 },
  ]);
  assert.throws(() => release.planLogRanges(0, 6000, { rangeSize: 2000, maxRanges: 3 }), /range cap/i);
  assert.throws(() => release.planLogRanges(0, 1, { rangeSize: 2001, maxRanges: 3 }), /2000/i);
});

test('canonical log quorum fully enumerates bounded primary ranges and matches discovered logs on peer', async () => {
  const filters = [
    { fromBlock: '0x1', toBlock: '0x2' },
    { fromBlock: '0x3', toBlock: '0x4' },
  ];
  const calls = [];
  const log = accountCreatedLog({ tokenId: 1n, account: '0x0000000000000000000000000000000000000001' });
  const transport = {
    async getLogsBatch(origin, batch) {
      calls.push({ origin, method: 'eth_getLogs batch', filters: batch });
      return batch.map((filter) => filter.fromBlock === '0x1' ? [log] : []);
    },
    async rpc(origin, method, [filter]) {
      calls.push({ origin, method, filter });
      return [log];
    },
  };
  const result = await release.collectCanonicalLogsFromTwoOrigins({ transport, filters, cap: 10 });
  assert.deepEqual(result, [log]);
  assert.deepEqual(calls, [
    { origin: release.RELEASE_RPC_ORIGINS[0], method: 'eth_getLogs batch', filters },
    {
      origin: release.RELEASE_RPC_ORIGINS[1],
      method: 'eth_getLogs',
      filter: { ...filters[0], fromBlock: '0x64', toBlock: '0x64' },
    },
  ]);

  const disagreeing = {
    async getLogsBatch(origin, batch) { return batch.map(() => [log]); },
    async rpc() { return []; },
  };
  await assert.rejects(
    release.collectCanonicalLogsFromTwoOrigins({ transport: disagreeing, filters: [filters[0]], cap: 10 }),
    /origins disagree/i,
  );
});

test('Blockscout inventory validator exhausts exact routes and fails closed on malformed pagination and balances', () => {
  for (const type of ['ERC-20', 'ERC-721', 'ERC-1155']) {
    assert.deepEqual(release.validateBlockscoutTokenPage({ items: [], next_page_params: null }, { type }), {
      items: [], nextPageParams: null,
    });
  }
  assert.throws(() => release.validateBlockscoutTokenPage({ items: [], next_page_params: {} }, { type: 'ERC-20' }), /pagination/i);
  assert.throws(() => release.validateBlockscoutTokenPage({ items: [], next_page_params: null, surprise: true }, { type: 'ERC-20' }), /unknown|exact/i);
  assert.throws(() => release.validateBlockscoutTokenPage({ items: [{ value: '1', token: {} }], next_page_params: null }, { type: 'ERC-20' }), /nonzero|token/i);
  const prototypeBearing = Object.create({ polluted: true });
  prototypeBearing.items = [];
  prototypeBearing.next_page_params = null;
  assert.throws(() => release.validateBlockscoutTokenPage(prototypeBearing, { type: 'ERC-20' }), /prototype|plain/i);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => release.validateBlockscoutTokenPage({ items: sparse, next_page_params: null }, { type: 'ERC-721' }), /sparse/i);
});

test('inspection builds only the exact unsigned owner config transaction with fee evidence', () => {
  const transaction = release.buildUnsignedConfigUpdate({
    owner: OWNER,
    ownerNonce: 77n,
    newImplementation: ACCOUNT,
    gas: 90000n,
    maxFeePerGas: 20000000n,
    maxPriorityFeePerGas: 1000000n,
    currentRegistry: CANONICAL_REGISTRY,
    existingSalt: SALT,
  });
  assert.deepEqual(Object.keys(transaction), [
    'type', 'chainId', 'from', 'nonce', 'to', 'value', 'data', 'gas', 'maxFeePerGas', 'maxPriorityFeePerGas',
  ]);
  assert.equal(transaction.type, '0x2');
  assert.equal(transaction.chainId, '0x2105');
  assert.equal(transaction.from, OWNER);
  assert.equal(transaction.nonce, '0x4d');
  assert.equal(transaction.to, COLLECTION);
  assert.equal(transaction.value, '0x0');
  assert.equal(transaction.gas, '0x15f90');
  const iface = new ethers.Interface(['function setERC6551Config(address,address,bytes32)']);
  assert.deepEqual([...iface.decodeFunctionData('setERC6551Config', transaction.data)], [
    CANONICAL_REGISTRY, ACCOUNT, SALT,
  ]);
});

test('final config transaction comparison binds type, chain, gas and fee fields', () => {
  const expected = release.buildUnsignedConfigUpdate({
    owner: OWNER,
    ownerNonce: 77n,
    newImplementation: ACCOUNT,
    gas: 90000n,
    maxFeePerGas: 20000000n,
    maxPriorityFeePerGas: 1000000n,
    currentRegistry: CANONICAL_REGISTRY,
    existingSalt: SALT,
  });
  const observed = {
    type: expected.type,
    chainId: expected.chainId,
    from: expected.from.toLowerCase(),
    nonce: expected.nonce,
    to: expected.to.toLowerCase(),
    value: expected.value,
    input: expected.data,
    gas: expected.gas,
    maxFeePerGas: expected.maxFeePerGas,
    maxPriorityFeePerGas: expected.maxPriorityFeePerGas,
  };
  assert.doesNotThrow(() => release.assertExactConfigTransaction(observed, expected));
  for (const key of ['type', 'chainId', 'gas', 'maxFeePerGas', 'maxPriorityFeePerGas']) {
    const drifted = { ...observed, [key]: '0x0' };
    assert.throws(() => release.assertExactConfigTransaction(drifted, expected), new RegExp(key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`), 'i'));
  }
});

test('release verifier rejects drift and emits the deployment document only after one exact config event', async () => {
  assert.equal(typeof release.inspectLooperAccountMigration, 'function');
  assert.equal(typeof release.verifyLooperAgentAccountRelease, 'function');
  assert.equal(typeof release.validateReleaseInspectionForVerification, 'function');
  await assert.rejects(release.verifyLooperAgentAccountRelease({}), /inspection|config/i);

  const transaction = release.buildUnsignedConfigUpdate({
    owner: OWNER,
    ownerNonce: 77n,
    newImplementation: ACCOUNT,
    gas: 90000n,
    maxFeePerGas: 20000000n,
    maxPriorityFeePerGas: 1000000n,
    currentRegistry: CANONICAL_REGISTRY,
    existingSalt: SALT,
  });
  const inspection = {
    schemaVersion: '2.0.0',
    kind: 'looper-permission-release-pre-config-inspection',
    chainId: 8453,
    preview: { sha256: PREVIEW_SHA256 },
    deployments: {
      registry: { transactionHash: REGISTRY_TX, address: REGISTRY, runtimeBytes: 1234, runtimeSha256: '0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb' },
      account: { transactionHash: ACCOUNT_TX, address: ACCOUNT, runtimeBytes: 6096, runtimeSha256: '0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c' },
    },
    preState: {
      owner: OWNER,
      currentConfig: { registry: CANONICAL_REGISTRY, implementation: OLD_IMPLEMENTATION, salt: SALT },
      actors: { ownerCode: '0x', deployerCode: '0x', deployerNonce: '7613' },
    },
    inventory: {
      tokenIds: ['1', '645', '646', '3802'],
      accounts: ['1', '645', '646', '3802'].map((tokenId, index) => ({
        tokenId,
        account: ethers.getAddress(`0x${(index + 1).toString(16).padStart(40, '0')}`),
        nativeBalanceWei: '0',
        runtimeBytes: 173,
      })),
    },
    configUpdate: {
      ready: true,
      blocker: null,
      expected: { registry: CANONICAL_REGISTRY, implementation: ACCOUNT, salt: SALT },
      ownerNonce: '77', gas: '90000', maxFeePerGas: '20000000', maxPriorityFeePerGas: '1000000',
      estimatedMaximumFeeWei: '1800000000000', transaction,
    },
  };
  assert.equal(release.validateReleaseInspectionForVerification(inspection), inspection);
  const tampered = structuredClone(inspection);
  tampered.configUpdate.transaction.data = `0x${'00'.repeat(100)}`;
  assert.throws(() => release.validateReleaseInspectionForVerification(tampered), /transaction|drift/i);
  const nonceDrift = structuredClone(inspection);
  nonceDrift.preState.actors.deployerNonce = '7614';
  assert.throws(() => release.validateReleaseInspectionForVerification(nonceDrift), /deployer nonce|drift/i);
});

test('CLI and package scripts expose closed inspect/verify modes with no broadcast surface', async () => {
  const source = await readFile(resolve(ROOT, 'scripts/deploy-looper-agent-account.js'), 'utf8');
  const releaseSource = await readFile(resolve(ROOT, 'scripts/looper-agent-account-release.js'), 'utf8');
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['inspect:agent-account'], /--inspect-release$/);
  assert.match(pkg.scripts['verify:agent-account'], /--verify-release$/);
  for (const forbidden of [
    /new\s+ethers\.Wallet/,
    /\.sendTransaction\s*\(/,
    /eth_sendTransaction/,
    /eth_sendRawTransaction/,
    /signTransaction/,
  ]) {
    assert.doesNotMatch(source, forbidden);
    assert.doesNotMatch(releaseSource, forbidden);
  }
  assert.match(source, /--inspect-release/);
  assert.match(source, /--verify-release/);
  assert.match(source, /deployments\/looper-agent-account-base\.json/);
  assert.doesNotMatch(source, /--rpc-url|--blockscout-url|--private-key|--signer|--wallet/);
  assert.equal(release.VERIFIED_RELEASE_OUTPUT_PATH, resolve(ROOT, 'deployments/looper-agent-account-base.json'));
  assert.throws(() => release.assertNoSigningEnvironment({ PRIVATE_KEY: 'forbidden' }), /signing|key/i);
  assert.throws(() => release.assertNoSigningEnvironment({ LOOPERS_DEPLOYER_PRIVATE_KEY: 'forbidden' }), /signing|key/i);
  assert.doesNotThrow(() => release.assertNoSigningEnvironment({ NODE_ENV: 'test' }));
  assert.doesNotThrow(() => release.assertNoSigningEnvironment(process.env));
  assert.doesNotThrow(() => release.assertNoSigningEnvironment(process.env));
  assert.equal(REGISTRY_TX.length, 66);
  assert.equal(ACCOUNT_TX.length, 66);
});

test('two-origin log range comparison rejects omissions and additions before decoding', () => {
  assert.equal(typeof release.requireCanonicalLogRangeAgreement, 'function');
  const one = accountCreatedLog({ tokenId: 1n, account: '0x0000000000000000000000000000000000000001' });
  const two = accountCreatedLog({ tokenId: 645n, account: '0x0000000000000000000000000000000000000002', blockNumber: 101 });
  assert.deepEqual(release.requireCanonicalLogRangeAgreement([[one], [two]], [[one], [two]]), [one, two]);
  assert.throws(() => release.requireCanonicalLogRangeAgreement([[one], []], [[one], [two]]), /origin|range|disagree/i);
  assert.throws(() => release.requireCanonicalLogRangeAgreement([[one], [two]], [[one], []]), /origin|range|disagree/i);
});

test('old-account receipt log revalidation binds every decoded field and coordinate', () => {
  assert.equal(typeof release.validateOldAccountReceiptLog, 'function');
  const log = accountCreatedLog({ tokenId: 3802n, account: '0x0000000000000000000000000000000000000004' });
  const item = {
    tokenId: '3802',
    account: '0x0000000000000000000000000000000000000004',
    transactionHash: log.transactionHash,
    blockHash: log.blockHash,
    transactionIndex: Number(BigInt(log.transactionIndex)),
    logIndex: Number(BigInt(log.logIndex)),
  };
  const options = {
    implementation: OLD_IMPLEMENTATION,
    collection: COLLECTION,
    canonicalRegistry: CANONICAL_REGISTRY,
    salt: SALT,
    chainId: 8453,
  };
  assert.doesNotThrow(() => release.validateOldAccountReceiptLog(log, item, options));
  assert.throws(() => release.validateOldAccountReceiptLog(
    accountCreatedLog({ tokenId: 646n, account: item.account }), item, options,
  ), /token|receipt|log/i);
  assert.throws(() => release.validateOldAccountReceiptLog(
    accountCreatedLog({ tokenId: 3802n, account: '0x0000000000000000000000000000000000000005' }), item, options,
  ), /account|receipt|log/i);
});

test('release snapshot pins unrelated ERC-721T and ERC-8004 getters for all inventoried IDs', async () => {
  const source = await readFile(resolve(ROOT, 'scripts/looper-agent-account-release.js'), 'utf8');
  for (const getter of [
    'EXPECTED_IDENTITY_REGISTRY', 'erc8004AgentBaseURI', 'erc8004BoundByLooper',
    'erc8004AgentIdByLooper', 'erc8004AgentURI', 'metadata', 'paused',
  ]) assert.match(source, new RegExp(`function ${getter.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\(`));
  assert.match(source, /EXPECTED_OLD_TOKEN_IDS\.map/);
});

test('Blockscout validator enforces the fixed one-page 10000-item cap', () => {
  const items = Array.from({ length: 10001 }, () => ({
    token: {
      address_hash: '0x0000000000000000000000000000000000000001',
      circulating_market_cap: null,
      decimals: '18',
      exchange_rate: null,
      holders_count: '0',
      icon_url: null,
      name: 'Token',
      symbol: 'TOK',
      total_supply: '0',
      type: 'ERC-20',
      volume_24h: null,
    },
    token_id: null,
    token_instance: null,
    value: '0',
  }));
  assert.throws(() => release.validateBlockscoutTokenPage({ items, next_page_params: null }, { type: 'ERC-20' }), /10000|cap/i);
});

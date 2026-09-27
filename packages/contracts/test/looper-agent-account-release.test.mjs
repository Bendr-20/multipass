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
const INSPECTION_PATH = resolve(ROOT, 'test/fixtures/looper-agent-account-base-pre-config-inspection.json');

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

function logParity(log) {
  return Object.fromEntries(['address', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'data', 'topics'].map((key) => [key, log[key]]));
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
    async blockscoutLogs(filter) {
      calls.push({ origin: release.RELEASE_BLOCKSCOUT_ORIGIN, method: 'raw logs', filter });
      return [logParity(log)];
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
    { origin: release.RELEASE_BLOCKSCOUT_ORIGIN, method: 'raw logs', filter: { fromBlock: '0x1', toBlock: '0x4' } },
    { origin: release.RELEASE_RPC_ORIGINS[1], method: 'eth_getLogs', filter: { fromBlock: '0x64', toBlock: '0x64' } },
  ]);

  const disagreeing = {
    async getLogsBatch(origin, batch) { return batch.map(() => [log]); },
    async blockscoutLogs() { return []; },
    async rpc() { return []; },
  };
  await assert.rejects(
    release.collectCanonicalLogsFromTwoOrigins({ transport: disagreeing, filters: [filters[0]], cap: 10 }),
    /origins disagree/i,
  );
});

test('canonical peer proof sends the complete historical interval to raw Blockscout logs', async () => {
  const filters = [{ address: CANONICAL_REGISTRY, fromBlock: '0x1', toBlock: '0x64' }, { address: CANONICAL_REGISTRY, fromBlock: '0x65', toBlock: '0xc8' }];
  const peer = [];
  const transport = {
    async getLogsBatch() { return [[], []]; },
    async blockscoutLogs(filter) { peer.push(filter); return []; },
    async rpc() { throw new Error('no event blocks expected'); },
  };
  assert.deepEqual(await release.collectCanonicalLogsFromTwoOrigins({ transport, filters }), []);
  assert.deepEqual(peer, [{ address: CANONICAL_REGISTRY, fromBlock: '0x1', toBlock: '0xc8' }]);
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
  assert.equal(release.validateReleaseInspectionForVerification(inspection, {
    expectedSha256: release.computeInspectionSha256(inspection),
  }), inspection);
  const tampered = structuredClone(inspection);
  tampered.configUpdate.transaction.data = `0x${'00'.repeat(100)}`;
  assert.throws(() => release.validateReleaseInspectionForVerification(tampered, {
    expectedSha256: release.computeInspectionSha256(tampered),
  }), /transaction|drift/i);
  const nonceDrift = structuredClone(inspection);
  nonceDrift.preState.actors.deployerNonce = '7614';
  assert.throws(() => release.validateReleaseInspectionForVerification(nonceDrift, {
    expectedSha256: release.computeInspectionSha256(nonceDrift),
  }), /deployer nonce|drift/i);
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

test('reviewed inspection digest binds all pre-config evidence', async () => {
  const inspection = JSON.parse(await readFile(INSPECTION_PATH, 'utf8'));
  assert.equal(release.computeInspectionSha256(inspection), release.BOUND_INSPECTION_SHA256);
  assert.equal(release.assertBoundReleaseInspection(inspection), inspection);
  for (const mutate of [
    (value) => { value.anchor.hash = `0x${'99'.repeat(32)}`; },
    (value) => { value.preState.unrelated.paused = !value.preState.unrelated.paused; },
    (value) => { value.inventory.accounts[0].runtimeSha256 = `0x${'88'.repeat(32)}`; },
  ]) {
    const changed = structuredClone(inspection);
    mutate(changed);
    assert.throws(() => release.assertBoundReleaseInspection(changed), /inspection.*sha-256|digest/i);
  }
});

test('verified document preserves reviewed and post-config evidence', () => {
  const inspection = { inventory: { accounts: [{ tokenId: '1' }] } };
  const postInventory = { accounts: [{ tokenId: '1' }], rangeCount: 2 };
  const output = release.buildVerifiedReleaseDocument({
    inspection, inspectionSha256: `0x${'11'.repeat(32)}`,
    transactionHash: `0x${'22'.repeat(32)}`, transaction: {}, receipt: {}, event: {},
    anchor: {}, postState: {}, postInventory, invariants: {},
  });
  assert.deepEqual(output.preConfigInspection, inspection);
  assert.deepEqual(output.postConfigInventory, postInventory);
  assert.equal(output.preConfigInspectionSha256, `0x${'11'.repeat(32)}`);
});

test('post-config inventory comparison rejects account receipt and runtime drift', () => {
  const item = {
    tokenId: '1', account: '0x0000000000000000000000000000000000000001',
    transactionHash: `0x${'11'.repeat(32)}`, blockNumber: 1, blockHash: `0x${'22'.repeat(32)}`,
    transactionIndex: 1, logIndex: 2, runtimeBytes: 173, runtimeSha256: `0x${'33'.repeat(32)}`,
    nativeBalanceWei: '0', blockscout: { erc20: 'empty', erc721: 'empty', erc1155: 'empty' },
  };
  const before = { tokenIds: ['1'], accounts: [item] };
  assert.doesNotThrow(() => release.assertRevalidatedOldInventory(before, structuredClone(before)));
  for (const [field, value] of [['transactionHash', `0x${'44'.repeat(32)}`], ['runtimeSha256', `0x${'55'.repeat(32)}`]]) {
    const after = structuredClone(before);
    after.accounts[0][field] = value;
    assert.throws(() => release.assertRevalidatedOldInventory(before, after), /inventory.*drift|receipt|runtime/i);
  }
});

test('config event validator binds emitter and receipt coordinates', () => {
  const iface = new ethers.Interface(['event ERC6551ConfigUpdated(address indexed registry,address indexed implementation,bytes32 salt)']);
  const encoded = iface.encodeEventLog(iface.getEvent('ERC6551ConfigUpdated'), [CANONICAL_REGISTRY, ACCOUNT, SALT]);
  const log = {
    address: COLLECTION, transactionHash: `0x${'11'.repeat(32)}`, blockHash: `0x${'22'.repeat(32)}`,
    blockNumber: '0x64', transactionIndex: '0x3', logIndex: '0x7', removed: false,
    data: encoded.data, topics: encoded.topics,
  };
  const receipt = {
    transactionHash: log.transactionHash, blockHash: log.blockHash, blockNumberHex: log.blockNumber,
    transactionIndex: 3, logs: [log],
  };
  const expected = { registry: CANONICAL_REGISTRY, implementation: ACCOUNT, salt: SALT };
  assert.doesNotThrow(() => release.assertExactConfigEvent(log, receipt, expected));
  for (const [field, value] of [['address', ACCOUNT], ['transactionHash', `0x${'33'.repeat(32)}`], ['removed', true]]) {
    assert.throws(() => release.assertExactConfigEvent({ ...log, [field]: value }, receipt, expected), /config.*event|emitter|coordinate|removed/i);
  }
});

test('frozen-config classification requires exact error data', () => {
  const exact = Object.assign(new Error('execution reverted'), { rpcData: '0xe46274bc' });
  assert.equal(release.isExactRpcRevert(exact, '0xe46274bc'), true);
  assert.equal(release.isExactRpcRevert(new Error('data=0xe46274bc'), '0xe46274bc'), false);
  assert.equal(release.isExactRpcRevert(Object.assign(new Error('reverted'), { rpcData: '0xe46274bc00' }), '0xe46274bc'), false);
});

test('closed RPC transport rejects stale and duplicate response ids', async () => {
  const response = (url, body) => ({
    ok: true, status: 200, url: new URL(url).href, headers: { get: () => null },
    async arrayBuffer() { return Buffer.from(JSON.stringify(body)); },
  });
  const stale = release.createReleaseReadTransport({ fetchImpl: async (url, options) => {
    const request = JSON.parse(options.body);
    return response(url, { jsonrpc: '2.0', id: request.id + 1, result: '0x2105' });
  } });
  await assert.rejects(stale.rpc(release.RELEASE_RPC_ORIGINS[2], 'eth_chainId'), /response id mismatch/i);
  const duplicate = release.createReleaseReadTransport({ fetchImpl: async (url, options) => {
    const requests = JSON.parse(options.body);
    const result = { jsonrpc: '2.0', id: requests[0].id, result: [] };
    return response(url, [result, result]);
  } });
  await assert.rejects(duplicate.getLogsBatch(release.RELEASE_RPC_ORIGINS[0], [
    { fromBlock: '0x1', toBlock: '0x1' }, { fromBlock: '0x2', toBlock: '0x2' },
  ]), /duplicate|response id/i);
});

test('raw RPC asset evidence decodes standard inbound candidates', () => {
  const transfer = new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
  const single = new ethers.Interface(['event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)']);
  const account = '0x0000000000000000000000000000000000000009';
  const a = transfer.encodeEventLog(transfer.getEvent('Transfer'), [OWNER, account, 7n]);
  const b = single.encodeEventLog(single.getEvent('TransferSingle'), [OWNER, OWNER, account, 12n, 1n]);
  const evidence = release.decodeInboundAssetLogs([
    { address: '0x0000000000000000000000000000000000000011', topics: a.topics, data: a.data },
    { address: '0x0000000000000000000000000000000000000012', topics: b.topics, data: b.data },
  ], account, { cap: 10 });
  assert.deepEqual(evidence.erc20Or721Contracts, ['0x0000000000000000000000000000000000000011']);
  assert.deepEqual(evidence.erc1155Items, [{ contract: '0x0000000000000000000000000000000000000012', tokenId: '12' }]);
  assert.throws(() => release.decodeInboundAssetLogs([{ address: OWNER, topics: a.topics, data: '0x00' }], account), /malformed/i);
});

test('primary RPC asset scan exhausts every bounded range before Blockscout comparison', async () => {
  const filters = [{ fromBlock: '0x1', toBlock: '0x2' }, { fromBlock: '0x3', toBlock: '0x4' }];
  const log = accountCreatedLog({ tokenId: 1n, account: '0x0000000000000000000000000000000000000001' });
  const calls = [];
  const transport = { async getLogsBatch(origin, batch) { calls.push({ origin, batch }); return [[log], []]; } };
  assert.deepEqual(await release.collectCanonicalLogsFromPrimary({ transport, filters, cap: 2 }), [log]);
  assert.deepEqual(calls, [{ origin: release.RELEASE_RPC_ORIGINS[0], batch: filters }]);
  await assert.rejects(release.collectCanonicalLogsFromPrimary({ transport, filters, cap: 0 }), /cap/i);
});

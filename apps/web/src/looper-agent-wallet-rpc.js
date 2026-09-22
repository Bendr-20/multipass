import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  keccak256,
  sha256,
} from 'viem';

import {
  ACCOUNT_EXECUTE_ABI,
  ACCOUNT_POLICY_ABI,
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  CONFIGURED_TOKENS,
  ERC20_ABI,
  ERC6551_REGISTRY,
  LOOPERS_ABI,
  LOOPERS_COLLECTION,
  MODULE_REGISTRY_ABI,
  REGISTRY_ABI,
  ZERO_ADDRESS,
  buildLooperAccountRuntimeCode,
} from './looper-agent-wallet.js';

export const BASE_RPC_ORIGINS = Object.freeze([
  'https://mainnet.base.org',
  'https://base.drpc.org',
]);

const ACCOUNT_CREATED_ABI = [{
  type: 'event',
  name: 'AccountCreated',
  inputs: [
    { name: 'account', type: 'address', indexed: false },
    { name: 'implementation', type: 'address', indexed: true },
    { name: 'salt', type: 'bytes32', indexed: false },
    { name: 'chainId', type: 'uint256', indexed: false },
    { name: 'tokenContract', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
  ],
}];
const STATE_UPDATED_ABI = [{
  type: 'event',
  name: 'StateUpdated',
  inputs: [{ name: 'state', type: 'uint256', indexed: true }],
}];
const ZERO_HASH = `0x${'00'.repeat(32)}`;

export function createLooperWalletRpcClient({
  fetchImpl,
  request,
  releaseConfig,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const activeRequest = request ?? createFixedRequester(fetchImpl ?? globalThis.fetch);
  const reviewedRelease = normalizeReleaseConfig(releaseConfig);
  async function readSnapshot({ selection, expectedAccount, phase, receipt, policyModule } = {}) {
    const tokenId = BigInt(String(selection?.tokenId ?? ''));
    const expectedOwner = getAddress(selection?.owner);
    const anchor = phase === 'receipt'
      ? await canonicalReceiptAnchor(activeRequest, receipt)
      : await canonicalAnchor(activeRequest);
    const snapshots = await Promise.all(BASE_RPC_ORIGINS.map((origin) => readOriginSnapshot({
      request: activeRequest,
      origin,
      anchor,
      tokenId,
      expectedOwner,
      phase,
      candidatePolicyModule: policyModule ? getAddress(policyModule) : null,
      reviewedRelease,
    })));
    requireAgreement(snapshots, 'Base wallet snapshots disagree.');
    if (expectedAccount && !sameAddress(snapshots[0].collectionAccount, expectedAccount)) {
      throw new Error('Base wallet snapshot does not match the attempt-bound account.');
    }
    return { ...snapshots[0], refreshedAt: new Date().toISOString() };
  }

  async function readReceipt({ hash }) {
    const requestedHash = canonicalHash(hash, 'requested transaction hash');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const evidence = await Promise.all(BASE_RPC_ORIGINS.map(async (origin) => {
        const [receipt, transaction] = await Promise.all([
          activeRequest({ origin, method: 'eth_getTransactionReceipt', params: [requestedHash] }),
          activeRequest({ origin, method: 'eth_getTransactionByHash', params: [requestedHash] }),
        ]);
        if (!receipt || !transaction) return null;
        return normalizeReceipt(receipt, transaction, requestedHash);
      }));
      if (evidence.every(Boolean)) {
        requireAgreement(evidence, 'Base transaction receipts disagree.');
        return evidence[0];
      }
      await wait(2000);
    }
    throw new Error('Timed out waiting for canonical Base receipt evidence.');
  }

  return { readSnapshot, readReceipt };
}

async function canonicalReceiptAnchor(request, receipt) {
  const numberText = String(receipt?.blockNumber ?? '');
  if (!/^(0|[1-9]\d*)$/.test(numberText)) {
    throw new Error('Canonical receipt block evidence is required.');
  }
  const expectedHash = canonicalHash(receipt?.blockHash, 'receipt block hash');
  const chainIds = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_chainId', params: [] })));
  if (chainIds.some((chainId) => chainId !== '0x2105')) throw new Error('Base RPC chain IDs disagree.');
  const number = BigInt(numberText);
  const tag = `0x${number.toString(16)}`;
  const blocks = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({
    origin,
    method: 'eth_getBlockByNumber',
    params: [tag, false],
  })));
  if (blocks.some((block) => !block
    || BigInt(canonicalHexQuantity(block.number, 'receipt block number')) !== number
    || canonicalHash(block.hash, 'receipt block hash') !== expectedHash)) {
    throw new Error('Base receipt block hashes disagree.');
  }
  return {
    tag,
    number: number.toString(),
    hash: expectedHash,
    blockRef: Object.freeze({ blockHash: expectedHash, requireCanonical: true }),
  };
}

async function canonicalAnchor(request) {
  const chainIds = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_chainId', params: [] })));
  if (chainIds.some((chainId) => chainId !== '0x2105')) throw new Error('Base RPC chain IDs disagree.');
  const heads = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({ origin, method: 'eth_blockNumber', params: [] })));
  const number = heads
    .map((head) => BigInt(canonicalHexQuantity(head, 'head block number')))
    .reduce((lowest, head) => head < lowest ? head : lowest);
  const tag = `0x${number.toString(16)}`;
  const blocks = await Promise.all(BASE_RPC_ORIGINS.map((origin) => request({
    origin,
    method: 'eth_getBlockByNumber',
    params: [tag, false],
  })));
  if (blocks.some((block) => !block
    || BigInt(canonicalHexQuantity(block.number, 'anchor block number')) !== number)) {
    throw new Error('Base RPC anchor is incomplete.');
  }
  const anchors = blocks.map((block) => ({
    number: canonicalHexQuantity(block.number, 'anchor block number'),
    hash: canonicalHash(block.hash, 'anchor block hash'),
  }));
  requireAgreement(anchors, 'Base RPC block hashes disagree.');
  return {
    tag,
    number: number.toString(),
    hash: anchors[0].hash,
    blockRef: Object.freeze({ blockHash: anchors[0].hash, requireCanonical: true }),
  };
}

async function readOriginSnapshot({ request, origin, anchor, tokenId, expectedOwner, candidatePolicyModule, reviewedRelease }) {
  const call = (address, abi, functionName, args = []) => callContract({
    request,
    origin,
    blockRef: anchor.blockRef,
    address,
    abi,
    functionName,
    args,
  });
  const [owner, registry, implementation, salt, collectionAccount, operatorCode] = await Promise.all([
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'ownerOf', [tokenId]),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Registry'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Implementation'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'erc6551Salt'),
    call(LOOPERS_COLLECTION, LOOPERS_ABI, 'tokenBoundAccount', [tokenId]),
    request({ origin, method: 'eth_getCode', params: [expectedOwner, anchor.blockRef] }),
  ]);
  const normalizedImplementation = getAddress(implementation);
  const rawImplementationCode = await request({ origin, method: 'eth_getCode', params: [normalizedImplementation, anchor.blockRef] });
  const implementationCode = canonicalCode(rawImplementationCode, 'implementation runtime');
  const implementationRuntimeSha256 = sha256(implementationCode);
  const registryAccount = await call(ERC6551_REGISTRY, REGISTRY_ABI, 'account', [
    normalizedImplementation,
    ACCOUNT_SALT,
    BigInt(BASE_CHAIN_ID),
    LOOPERS_COLLECTION,
    tokenId,
  ]);
  const normalizedAccount = getAddress(collectionAccount);
  const [rawAccountCode, nativeBalance] = await Promise.all([
    request({ origin, method: 'eth_getCode', params: [normalizedAccount, anchor.blockRef] }),
    request({ origin, method: 'eth_getBalance', params: [normalizedAccount, anchor.blockRef] }),
  ]);
  const accountCode = canonicalCode(rawAccountCode, 'account runtime', { allowEmpty: true });
  const expectedAccountCode = buildLooperAccountRuntimeCode({ implementation: normalizedImplementation, tokenId });
  const accountRuntimeSha256 = accountCode === '0x' ? null : sha256(accountCode);
  const accountCodeMatches = accountCode === '0x' ? null : accountCode === expectedAccountCode;

  let state = 0n;
  let moduleRegistry = null;
  let policyModule = null;
  let policyModuleOwner = null;
  let policyEpoch = null;
  let moduleRegistryCode = null;
  let moduleRegistryRuntimeSha256 = null;
  let registryPaused = null;
  let policyModuleCode = null;
  let policyModuleRuntimeSha256 = null;
  let policyModuleCodehash = null;
  let approvedModuleCodehash = null;
  let policyModuleApproved = null;
  let policyModuleCodehashMatches = null;
  let candidateModule = candidatePolicyModule;
  let candidateModuleCode = null;
  let candidatePolicyModuleRuntimeSha256 = null;
  let candidatePolicyModuleCodehash = null;
  let candidateApprovedCodehash = null;
  let candidatePolicyModuleApproved = null;
  let candidatePolicyModuleCodehashMatches = null;
  let policyEvidenceRead = false;

  const implementationTrusted = reviewedRelease.complete
    && sameAddress(normalizedImplementation, reviewedRelease.implementation)
    && implementationRuntimeSha256 === reviewedRelease.runtimeSha256;
  if (accountCode === '0x' && implementationTrusted) {
    moduleRegistry = reviewedRelease.moduleRegistry;
    const rawRegistryCode = await request({
      origin,
      method: 'eth_getCode',
      params: [moduleRegistry, anchor.blockRef],
    });
    moduleRegistryCode = canonicalCode(rawRegistryCode, 'module registry runtime', { allowEmpty: true });
    moduleRegistryRuntimeSha256 = moduleRegistryCode === '0x' ? null : sha256(moduleRegistryCode);
  }
  if (accountCode !== '0x' && accountCodeMatches && implementationTrusted) {
    [state, moduleRegistry, policyModule, policyModuleOwner, policyEpoch] = await Promise.all([
      call(normalizedAccount, ACCOUNT_EXECUTE_ABI, 'state'),
      call(normalizedAccount, ACCOUNT_POLICY_ABI, 'moduleRegistry'),
      call(normalizedAccount, ACCOUNT_POLICY_ABI, 'policyModule'),
      call(normalizedAccount, ACCOUNT_POLICY_ABI, 'policyModuleOwner'),
      call(normalizedAccount, ACCOUNT_POLICY_ABI, 'policyEpoch'),
    ]);
    moduleRegistry = getAddress(moduleRegistry);
    policyModule = getAddress(policyModule);
    policyModuleOwner = getAddress(policyModuleOwner);
    candidateModule ??= policyModule;
    const rawRegistryCode = await request({ origin, method: 'eth_getCode', params: [moduleRegistry, anchor.blockRef] });
    moduleRegistryCode = canonicalCode(rawRegistryCode, 'module registry runtime', { allowEmpty: true });
    moduleRegistryRuntimeSha256 = moduleRegistryCode === '0x' ? null : sha256(moduleRegistryCode);
    const registryTrusted = sameAddress(moduleRegistry, reviewedRelease.moduleRegistry)
      && moduleRegistryRuntimeSha256 === reviewedRelease.moduleRegistryRuntimeSha256;
    if (registryTrusted) {
      registryPaused = await call(moduleRegistry, MODULE_REGISTRY_ABI, 'globallyPaused');
      if (typeof registryPaused !== 'boolean') throw new Error('Base registry pause evidence is malformed.');
      const modules = [...new Set([policyModule, candidateModule].filter(Boolean).map((value) => getAddress(value)))];
      const moduleEvidence = new Map();
      for (const module of modules) {
        if (sameAddress(module, ZERO_ADDRESS)) {
          moduleEvidence.set(module.toLowerCase(), moduleProof('0x', ZERO_HASH));
          continue;
        }
        const [rawCode, approved] = await Promise.all([
          request({ origin, method: 'eth_getCode', params: [module, anchor.blockRef] }),
          call(moduleRegistry, MODULE_REGISTRY_ABI, 'approvedModuleCodehash', [module]),
        ]);
        moduleEvidence.set(module.toLowerCase(), moduleProof(
          canonicalCode(rawCode, 'policy module runtime', { allowEmpty: true }),
          canonicalHash(approved, 'approved module codehash'),
        ));
      }
      const selected = moduleEvidence.get(policyModule.toLowerCase());
      policyModuleCode = selected.code;
      policyModuleRuntimeSha256 = selected.runtimeSha256;
      policyModuleCodehash = selected.codehash;
      approvedModuleCodehash = selected.approvedCodehash;
      policyModuleApproved = selected.approved;
      policyModuleCodehashMatches = selected.matches;
      const candidate = moduleEvidence.get(getAddress(candidateModule).toLowerCase());
      candidateModuleCode = candidate.code;
      candidatePolicyModuleRuntimeSha256 = candidate.runtimeSha256;
      candidatePolicyModuleCodehash = candidate.codehash;
      candidateApprovedCodehash = candidate.approvedCodehash;
      candidatePolicyModuleApproved = candidate.approved;
      candidatePolicyModuleCodehashMatches = candidate.matches;
      policyEvidenceRead = true;
    }
  }

  const tokens = [];
  for (const token of CONFIGURED_TOKENS) {
    const balance = await call(token.address, ERC20_ABI, 'balanceOf', [normalizedAccount]);
    tokens.push({ ...token, balanceBaseUnits: BigInt(balance).toString() });
  }
  return {
    chainId: BASE_CHAIN_ID,
    blockNumber: anchor.number,
    blockHash: anchor.hash,
    owner: getAddress(owner),
    registry: getAddress(registry),
    implementation: normalizedImplementation,
    implementationCode,
    implementationRuntimeSha256,
    salt,
    collectionAccount: normalizedAccount,
    registryAccount: getAddress(registryAccount),
    operatorCode: canonicalCode(operatorCode, 'operator runtime', { allowEmpty: true }),
    accountCode,
    accountRuntimeSha256,
    accountCodeMatches,
    state: BigInt(state).toString(),
    nativeWei: BigInt(canonicalHexQuantity(nativeBalance, 'native balance')).toString(),
    tokens,
    moduleRegistry,
    moduleRegistryCode,
    moduleRegistryRuntimeSha256,
    registryPaused,
    policyModule,
    policyModuleOwner,
    policyEpoch: policyEpoch === null ? null : BigInt(policyEpoch).toString(),
    policyModuleCode,
    policyModuleRuntimeSha256,
    policyModuleCodehash,
    approvedModuleCodehash,
    policyModuleApproved,
    policyModuleCodehashMatches,
    candidatePolicyModule: candidateModule ? getAddress(candidateModule) : null,
    candidatePolicyModuleCode: candidateModuleCode,
    candidatePolicyModuleRuntimeSha256,
    candidatePolicyModuleCodehash,
    candidateApprovedModuleCodehash: candidateApprovedCodehash,
    candidatePolicyModuleApproved,
    candidatePolicyModuleCodehashMatches,
    policyEvidenceRead,
  };
}

function canonicalCode(value, label, { allowEmpty = false } = {}) {
  const raw = String(value ?? '');
  const code = raw.toLowerCase();
  if (raw !== code || !/^0x(?:[0-9a-f]{2})*$/.test(code) || (!allowEmpty && code === '0x')) {
    throw new Error(`Base ${label} is missing or malformed.`);
  }
  return code;
}

function canonicalHash(value, label) {
  const raw = String(value ?? '');
  const hash = raw.toLowerCase();
  if (raw !== hash || !/^0x[0-9a-f]{64}$/.test(hash)) throw new Error(`Base ${label} is malformed.`);
  return hash;
}

function moduleProof(code, approvedCodehash) {
  const runtimeSha256 = code === '0x' ? null : sha256(code);
  const codehash = code === '0x' ? null : keccak256(code);
  const approved = approvedCodehash !== ZERO_HASH;
  return {
    code,
    runtimeSha256,
    codehash,
    approvedCodehash,
    approved,
    matches: approved && codehash !== null && approvedCodehash === codehash,
  };
}

async function callContract({ request, origin, blockRef, address, abi, functionName, args = [] }) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await request({
    origin,
    method: 'eth_call',
    params: [{ to: address, data }, blockRef],
  });
  const raw = String(result ?? '');
  if (raw !== raw.toLowerCase() || !/^0x(?:[0-9a-f]{2})+$/.test(raw)) {
    throw new Error(`Base ${functionName} result is malformed.`);
  }
  const decoded = decodeFunctionResult({ abi, functionName, data: raw });
  const canonical = encodeFunctionResult({ abi, functionName, result: decoded }).toLowerCase();
  if (raw !== canonical) throw new Error(`Base ${functionName} result is not canonical.`);
  return decoded;
}

function normalizeReceipt(receipt, transaction, requestedHash) {
  const transactionHash = canonicalHash(transaction?.hash, 'transaction hash');
  const receiptTransactionHash = canonicalHash(receipt?.transactionHash, 'receipt transaction hash');
  if (transactionHash !== requestedHash || receiptTransactionHash !== requestedHash) {
    throw new Error('Base transaction hash evidence does not match the requested hash.');
  }
  if (!['0x0', '0x1'].includes(receipt?.status)) {
    throw new Error('Base receipt status is malformed.');
  }
  const normalizedTransaction = {
    chainId: canonicalHexQuantity(transaction.chainId, 'transaction chain ID'),
    from: getAddress(transaction.from),
    to: getAddress(transaction.to),
    value: canonicalHexQuantity(transaction.value, 'transaction value'),
    data: canonicalCode(transaction.input ?? '0x', 'transaction input', { allowEmpty: true }),
  };
  const logs = [];
  for (const log of receipt.logs ?? []) {
    try {
      const decoded = decodeEventLog({ abi: ACCOUNT_CREATED_ABI, topics: log.topics, data: log.data, strict: true });
      logs.push({ eventName: 'AccountCreated', account: getAddress(decoded.args.account) });
      continue;
    } catch {
      // Try the account event below.
    }
    try {
      const decoded = decodeEventLog({ abi: STATE_UPDATED_ABI, topics: log.topics, data: log.data, strict: true });
      logs.push({ eventName: 'StateUpdated', address: getAddress(log.address), state: decoded.args.state.toString() });
    } catch {
      // Unrelated logs are not attribution evidence.
    }
  }
  return {
    status: receipt.status === '0x1' ? 'success' : 'reverted',
    transactionHash: receiptTransactionHash,
    blockNumber: BigInt(canonicalHexQuantity(receipt.blockNumber, 'receipt block number')).toString(),
    blockHash: canonicalHash(receipt.blockHash, 'receipt block hash'),
    transaction: normalizedTransaction,
    logs,
  };
}

function canonicalHexQuantity(value, label) {
  const quantity = String(value ?? '');
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(quantity)) {
    throw new Error(`Base ${label} quantity is malformed.`);
  }
  return quantity;
}

function requireAgreement(values, message) {
  const canonical = stableJson(values[0]);
  if (values.some((value) => stableJson(value) !== canonical)) throw new Error(message);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function normalizeReleaseConfig(releaseConfig = {}) {
  const implementation = safeAddress(releaseConfig.implementation);
  const runtimeSha256 = safeHash(releaseConfig.runtimeSha256);
  const moduleRegistry = safeAddress(releaseConfig.moduleRegistry);
  const moduleRegistryRuntimeSha256 = safeHash(releaseConfig.moduleRegistryRuntimeSha256);
  return {
    implementation,
    runtimeSha256,
    moduleRegistry,
    moduleRegistryRuntimeSha256,
    complete: Boolean(implementation && runtimeSha256 && moduleRegistry && moduleRegistryRuntimeSha256),
  };
}

function safeAddress(value) {
  try {
    return value ? getAddress(value) : null;
  } catch {
    return null;
  }
}

function safeHash(value) {
  const hash = String(value ?? '').toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(hash) ? hash : null;
}

function sameAddress(left, right) {
  const a = safeAddress(left);
  const b = safeAddress(right);
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function createFixedRequester(fetchImpl) {
  let nextId = 1;
  return async ({ origin, method, params }) => {
    if (typeof fetchImpl !== 'function') throw new Error('Base RPC fetch is unavailable.');
    if (!BASE_RPC_ORIGINS.includes(origin)) throw new Error('Unapproved Base RPC origin.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const id = nextId;
      nextId += 1;
      const response = await fetchImpl(origin, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Base RPC failed with ${response.status}.`);
      const body = await response.json();
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
      if (body?.jsonrpc !== '2.0'
        || body?.id !== id
        || keys.join(',') !== 'id,jsonrpc,result') {
        throw new Error('Base RPC returned an invalid envelope.');
      }
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  };
}

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
  buildActivationTransaction,
  buildErc20SendTransaction,
  buildEthSendTransaction,
  buildLooperAccountRuntimeCode,
  deriveLooperAccount,
  normalizeTokenId,
} from './looper-agent-wallet.js';

export const BASE_RPC_ORIGINS = Object.freeze([
  'https://mainnet.base.org',
  'https://base.drpc.org',
]);
export const BLOCKSCOUT_ORIGIN = 'https://base.blockscout.com';
const PUBLICNODE_ORIGIN = 'https://base-rpc.publicnode.com';
const ALL_RPC_ORIGINS = Object.freeze([...BASE_RPC_ORIGINS, PUBLICNODE_ORIGIN]);
export const RPC_ROUTES = deepFreeze({
  [BASE_RPC_ORIGINS[0]]: ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt'],
  [BASE_RPC_ORIGINS[1]]: ['chainId', 'latestBlock', 'blockByNumber', 'code', 'storage', 'balance', 'call', 'estimate', 'gasPrice', 'transaction', 'receipt', 'trace'],
  [PUBLICNODE_ORIGIN]: ['chainId', 'latestBlock', 'blockByNumber', 'transaction', 'receipt'],
});

const TRACE_OPTIONS = deepFreeze({ tracer: 'callTracer', timeout: '20s', tracerConfig: { onlyTopCall: false, withLog: true } });
const TRANSPORT_LIMITS = Object.freeze({
  standardTimeoutMs: 10_000,
  traceTimeoutMs: 25_000,
  standardBytes: 1_048_576,
  traceBytes: 4_194_304,
  blockscoutTimeoutMs: 8_000,
  blockscoutBytes: 524_288,
});
const TRACE_LIMITS = Object.freeze({ depth: 32, frames: 2048, children: 256, logs: 512, bytes: 262_144 });
const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const BLOCKSCOUT_TOKEN_KEYS = Object.freeze([
  'address_hash', 'circulating_market_cap', 'decimals', 'exchange_rate', 'holders_count',
  'icon_url', 'name', 'symbol', 'total_supply', 'type', 'volume_24h',
]);

export function validateBlockscoutTokenResponse(candidate) {
  requirePlainExact(candidate, ['items', 'next_page_params'], 'Blockscout response');
  if (candidate.next_page_params !== null) throw new Error('Blockscout pagination is unavailable in v1.');
  requireDenseArray(candidate.items, 'Blockscout items');
  const normalized = candidate.items.map((item, index) => {
    requirePlainExact(item, ['token', 'token_id', 'token_instance', 'value'], `Blockscout item ${index}`);
    if (item.token_id !== null || item.token_instance !== null || !canonicalDecimalText(item.value)) {
      throw new Error(`Blockscout item ${index} schema is invalid.`);
    }
    requirePlainExact(item.token, BLOCKSCOUT_TOKEN_KEYS, `Blockscout token ${index}`);
    if (item.token.type !== 'ERC-20') throw new Error('Blockscout token type must be ERC-20.');
    const contract = getAddress(item.token.address_hash);
    const name = boundedHint(item.token.name, 80);
    const symbol = boundedHint(item.token.symbol, 24);
    const iconUrl = safeHttpsUrl(item.token.icon_url);
    return deepFreeze({ contract, value: item.value, name, symbol, iconUrl, decimalsHint: boundedHint(item.token.decimals, 3) });
  });
  return deepFreeze(normalized);
}

export function validateDirectCallTrace(trace) {
  let frames = 0;
  let logs = 0;
  const visit = (frame, depth) => {
    if (depth > TRACE_LIMITS.depth) throw new Error('Trace depth exceeds 32.');
    requirePlainObject(frame, 'Trace frame');
    frames += 1;
    if (frames > TRACE_LIMITS.frames) throw new Error('Trace frame count exceeds 2048.');
    for (const key of ['input', 'output']) if (frame[key] !== undefined) requireBoundedHex(frame[key], TRACE_LIMITS.bytes, `Trace ${key}`);
    const children = frame.calls ?? [];
    requireDenseArray(children, 'Trace children');
    if (children.length > TRACE_LIMITS.children) throw new Error('Trace children exceed 256.');
    const frameLogs = frame.logs ?? [];
    requireDenseArray(frameLogs, 'Trace logs');
    logs += frameLogs.length;
    if (logs > TRACE_LIMITS.logs) throw new Error('Trace logs exceed 512.');
    for (const log of frameLogs) {
      requirePlainObject(log, 'Trace log');
      if (log.data !== undefined) requireBoundedHex(log.data, TRACE_LIMITS.bytes, 'Trace log data');
    }
    for (const child of children) visit(child, depth + 1);
  };
  visit(trace, 0);
  return true;
}

export function verifyOperationReceipt({
  requestedHash, transaction, receipt, prepared, postState = null, revertedState = null, trace = null,
} = {}) {
  const evidence = { binding: null, attribution: null };
  try {
    canonicalHash(requestedHash, 'requested transaction hash');
    if (canonicalHash(transaction?.hash, 'transaction hash') !== requestedHash
      || canonicalHash(receipt?.transactionHash, 'receipt transaction hash') !== requestedHash) {
      throw new Error('transaction hash mismatch');
    }
    requireReceiptCoordinates(transaction, receipt);
  } catch (error) {
    return classification('uncertain_hashed', { ...evidence, binding: String(error.message) });
  }
  const bindingError = operationBindingError(transaction, prepared);
  evidence.binding = bindingError ?? 'exact_direct_eoa';
  if (receipt.status === '0x0') {
    if (bindingError || !revertedStateExact(revertedState, receipt, prepared)) {
      return classification('uncertain_hashed', evidence);
    }
    return classification('reverted', evidence);
  }
  if (receipt.status !== '0x1' || bindingError || postState?.operatorCode !== '0x') {
    if (prepared?.kind === 'activation' && postStateExact(postState, receipt, prepared)) return classification('observed_unattributed', evidence);
    return classification('uncertain_hashed', evidence);
  }
  if (!postStateExact(postState, receipt, prepared)) return classification('uncertain_hashed', evidence);
  try {
    if (prepared.kind === 'activation') {
      const matches = (receipt.logs ?? []).filter((log) => log?.eventName === 'AccountCreated'
        && sameAddress(log.account, prepared.selection.account)
        && (log.implementation === undefined || sameAddress(log.implementation, prepared.implementation ?? prepared.evidence?.evidence?.implementation))
        && (log.salt === undefined || log.salt === ACCOUNT_SALT)
        && (log.chainId === undefined || String(log.chainId) === String(BASE_CHAIN_ID))
        && (log.tokenContract === undefined || sameAddress(log.tokenContract, LOOPERS_COLLECTION))
        && (log.tokenId === undefined || String(log.tokenId) === String(prepared.selection.tokenId)));
      if (matches.length !== 1) throw new Error('expected exactly one matching AccountCreated event');
      evidence.attribution = 'direct_activation';
      return classification('confirmed_attributed', evidence);
    }
    const nextState = (BigInt(prepared.preState) + 1n).toString();
    const stateLogs = (receipt.logs ?? []).filter((log) => log?.eventName === 'StateUpdated'
      && sameAddress(log.address, prepared.selection.account) && String(log.state) === nextState);
    if (stateLogs.length !== 1 || String(postState.state) !== nextState) throw new Error('StateUpdated evidence is incomplete');
    validateDirectCallTrace(trace);
    const matches = [];
    const walk = (frame) => {
      if (sameAddress(frame.from, prepared.innerCall.from)
        && sameAddress(frame.to, prepared.innerCall.to)
        && frame.input === prepared.innerCall.input
        && canonicalTraceValue(frame.value) === prepared.innerCall.value
        && !frame.error) matches.push(frame);
      for (const child of frame.calls ?? []) walk(child);
    };
    walk(trace);
    if (matches.length !== 1) throw new Error('exact inner CALL ancestry is missing or duplicated');
    const frameLogs = matches[0].logs;
    if (!Array.isArray(frameLogs)) throw new Error('selected trace frame lacks per-frame logs');
    const linked = frameLogs.filter((log) => Number.isInteger(log?.index)
      && log.index >= 0
      && receipt.logs[log.index]?.eventName === 'StateUpdated'
      && sameAddress(receipt.logs[log.index].address, prepared.selection.account)
      && String(receipt.logs[log.index].state) === nextState
      && (log.eventName === undefined || log.eventName === 'StateUpdated')
      && (log.address === undefined || sameAddress(log.address, prepared.selection.account))
      && (log.state === undefined || String(log.state) === nextState));
    if (linked.length !== 1) throw new Error('trace StateUpdated log ordinal is missing or ambiguous');
    evidence.attribution = prepared.kind === 'erc20' ? 'direct_erc20_send' : 'direct_eth_send';
    evidence.delivery = prepared.kind === 'erc20' ? 'executed_observed' : 'exact';
    return classification('confirmed_attributed', evidence);
  } catch (error) {
    return classification(prepared?.kind === 'activation' ? 'observed_unattributed' : 'uncertain_hashed', {
      ...evidence, attribution: String(error.message).slice(0, 240),
    });
  }
}

export function createLooperAgentWalletRpc(options = {}) {
  const context = createHighLevelContext(options);
  return Object.freeze({
    readAccountPreflight: (input) => readAccountPreflight(context, input),
    readWalletSnapshot: (input) => readWalletSnapshot(context, input),
    prepareActivation: (input) => prepareOperation(context, 'activation', input),
    prepareEthSend: (input) => prepareOperation(context, 'eth', input),
    prepareErc20Send: (input) => prepareOperation(context, 'erc20', input),
    pollOperation: (input) => pollOperation(context, input),
    revalidateReceipt: (input) => revalidateReceipt(context, input),
  });
}

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
  const collectionProxyRuntimeSha256 = safeHash(releaseConfig.collectionProxyRuntimeSha256);
  const collectionImplementation = safeAddress(releaseConfig.collectionImplementation);
  const collectionImplementationRuntimeSha256 = safeHash(releaseConfig.collectionImplementationRuntimeSha256);
  const registryRuntimeSha256 = safeHash(releaseConfig.registryRuntimeSha256);
  return {
    implementation,
    runtimeSha256,
    moduleRegistry,
    moduleRegistryRuntimeSha256,
    collectionProxyRuntimeSha256,
    collectionImplementation,
    collectionImplementationRuntimeSha256,
    registryRuntimeSha256,
    complete: Boolean(implementation && runtimeSha256 && moduleRegistry && moduleRegistryRuntimeSha256),
    canonicalComplete: Boolean(implementation && runtimeSha256 && moduleRegistry && moduleRegistryRuntimeSha256
      && collectionProxyRuntimeSha256 && collectionImplementation && collectionImplementationRuntimeSha256 && registryRuntimeSha256),
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

function createHighLevelContext({
  fetchImpl = globalThis.fetch,
  releaseConfig = {},
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  randomUUID = () => globalThis.crypto?.randomUUID?.(),
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' || typeof sleep !== 'function' || typeof randomUUID !== 'function') {
    throw new TypeError('Looper wallet RPC dependencies are invalid.');
  }
  return Object.freeze({ fetchImpl, release: normalizeReleaseConfig(releaseConfig), now, sleep, randomUUID });
}

async function readCompleteStateBatch(context, anchor, selection, phase, signal) {
  let firstError;
  for (const origin of BASE_RPC_ORIGINS) {
    try {
      return await readCompleteStateAtOrigin(context, origin, anchor, selection, phase, signal);
    } catch (error) {
      if (!firstError) firstError = error;
      if (!error?.transient || origin === BASE_RPC_ORIGINS.at(-1)) throw error;
    }
  }
  throw firstError;
}

async function readCompleteStateAtOrigin(context, origin, anchor, selection, phase, signal) {
  const eipBlockRef = Object.freeze({ blockHash: anchor.hash, requireCanonical: true });
  try {
    return await runCompleteStateAtBlockRef(context, origin, anchor, selection, phase, eipBlockRef, 'eip-1898', signal);
  } catch (error) {
    if (!isEip1898UnsupportedError(error)) throw error;
    const before = await rpcMethod(context, origin, 'eth_getBlockByNumber', [anchor.number, false], signal);
    if (canonicalHash(before?.hash, 'guarded before block hash') !== anchor.hash) throw new Error('Guarded state batch before hash drifted.');
    const complete = await runCompleteStateAtBlockRef(context, origin, anchor, selection, phase, anchor.number, 'number-guarded', signal);
    const after = await rpcMethod(context, origin, 'eth_getBlockByNumber', [anchor.number, false], signal);
    if (canonicalHash(after?.hash, 'guarded after block hash') !== anchor.hash) throw new Error('Guarded state batch after hash drifted.');
    return complete;
  }
}

async function runCompleteStateAtBlockRef(context, origin, anchor, selection, phase, blockRef, mode, signal) {
  const request = ({ method, params }) => rpcMethod(context, origin, method, params, signal);
  const evidence = await readOriginSnapshot({
    request,
    origin,
    anchor: { ...anchor, tag: anchor.number, blockRef },
    tokenId: BigInt(selection.tokenId),
    expectedOwner: selection.owner,
    phase,
    candidatePolicyModule: null,
    reviewedRelease: context.release,
  });
  const proxyCode = canonicalCode(await rpcMethod(context, origin, 'eth_getCode', [LOOPERS_COLLECTION, blockRef], signal), 'Looper proxy runtime');
  const proxySlot = canonicalHash(await rpcMethod(context, origin, 'eth_getStorageAt', [LOOPERS_COLLECTION, EIP1967_IMPLEMENTATION_SLOT, blockRef], signal), 'Looper proxy implementation slot');
  const collectionImplementation = getAddress(`0x${proxySlot.slice(-40)}`);
  const collectionImplementationCode = canonicalCode(await rpcMethod(context, origin, 'eth_getCode', [collectionImplementation, blockRef], signal), 'Looper collection implementation runtime');
  const registryCode = canonicalCode(await rpcMethod(context, origin, 'eth_getCode', [ERC6551_REGISTRY, blockRef], signal), 'ERC-6551 registry runtime');
  return deepFreeze({ origin, mode, blockRef, evidence, proxyCode, proxySlot, collectionImplementationCode, registryCode });
}

function isEip1898UnsupportedError(error) {
  const code = error?.rpcError?.code;
  const message = String(error?.rpcError?.message ?? '');
  if (![ -32602, -32000 ].includes(code) || /unknown|not[ -]?found|non[ -]?canonical|canonicality/i.test(message)) return false;
  return (/blockHash|requireCanonical|EIP[ -]?1898/i.test(message) && /unsupported|not supported|not implemented|unavailable/i.test(message))
    || /invalid argument.*object|cannot unmarshal.*object/i.test(message);
}

async function readAccountPreflight(context, input = {}) {
  requirePlainObject(input, 'Account preflight input');
  if (!context.release.canonicalComplete) throw new Error('Complete reviewed canonical release pins are required.');
  const selection = normalizeHighLevelSelection(input.selection, context.release);
  const anchor = input.receipt ? await canonicalAnchorForReceipt(context, input.receipt, input.signal) : await canonicalHead3(context, input.signal);
  const complete = await readCompleteStateBatch(context, anchor, selection, input.receipt ? 'receipt' : 'readiness', input.signal);
  const { evidence, proxyCode, proxySlot, collectionImplementationCode, registryCode } = complete;
  if (!sameAddress(evidence.collectionAccount, selection.account)
    || !sameAddress(evidence.registryAccount, selection.account)) throw new Error('Deterministic account readiness disagrees.');
  const expectedRuntime = buildLooperAccountRuntimeCode({ implementation: evidence.implementation, tokenId: selection.tokenId });
  const blockRef = complete.blockRef;
  const collectionImplementation = getAddress(`0x${proxySlot.slice(-40)}`);
  if (sha256(proxyCode) !== context.release.collectionProxyRuntimeSha256
    || !sameAddress(collectionImplementation, context.release.collectionImplementation)
    || sha256(collectionImplementationCode) !== context.release.collectionImplementationRuntimeSha256
    || sha256(registryCode) !== context.release.registryRuntimeSha256) {
    throw new Error('Canonical proxy, implementation, or registry pins drifted.');
  }
  const accountState = evidence.accountCode === '0x' ? 'undeployed'
    : evidence.accountCode === expectedRuntime ? 'active' : 'wrong_runtime';
  const transaction = input.transaction ?? (accountState === 'undeployed' && context.release.implementation
    ? buildActivationTransaction({ owner: selection.owner, implementation: context.release.implementation, tokenId: selection.tokenId })
    : null);
  let estimatedGas = '0x0';
  let gasPrice = '0x0';
  if (transaction) {
    const [simulation, estimateResult, gasPriceResult] = await Promise.all([
      rpcMethod(context, complete.origin, 'eth_call', [transaction, blockRef], input.signal),
      rpcMethod(context, complete.origin, 'eth_estimateGas', [transaction, blockRef], input.signal),
      rpcMethod(context, complete.origin, 'eth_gasPrice', [], input.signal),
    ]);
    if (simulation === null) throw new Error('Exact transaction simulation is unavailable.');
    estimatedGas = canonicalHexQuantity(estimateResult, 'estimated gas');
    gasPrice = canonicalHexQuantity(gasPriceResult, 'gas price');
  }
  const result = {
    anchor: { number: anchor.number, hash: anchor.hash },
    selection,
    pins: {
      proxyCodeHash: sha256(proxyCode),
      proxyImplementationSlot: proxySlot,
      implementationCodeHash: sha256(collectionImplementationCode),
      registryCodeHash: sha256(registryCode),
      accountImplementationCodeHash: evidence.implementationRuntimeSha256,
    },
    getters: {
      registry: evidence.registry,
      implementation: evidence.implementation,
      salt: evidence.salt,
      ownerOf: evidence.owner,
      tokenBoundAccount: evidence.collectionAccount,
      registryAccount: evidence.registryAccount,
    },
    operatorProfile: evidence.operatorCode === '0x' ? 'eoa' : 'contract_or_delegated',
    accountState,
    accountCode: evidence.accountCode,
    prefundedWei: evidence.nativeWei,
    estimatedGas,
    gasPrice,
    estimatedFeeWei: (BigInt(estimatedGas) * BigInt(gasPrice)).toString(),
    writeReady: sameAddress(evidence.owner, selection.owner) && evidence.operatorCode === '0x' && accountState !== 'wrong_runtime',
    evidence,
  };
  return deepFreeze(result);
}

async function readWalletSnapshot(context, input = {}) {
  const preflight = await readAccountPreflight(context, input);
  const discovered = await discoverTokens(context, preflight.selection.account, input.signal);
  const tokens = [];
  for (const hint of discovered) tokens.push(await readDiscoveredToken(context, preflight.anchor, preflight.selection.account, hint, input.signal));
  return deepFreeze({ ...preflight, tokens, activity: normalizeActivity(input.activity) });
}

async function prepareOperation(context, kind, input = {}) {
  requirePlainObject(input, `${kind} preparation input`);
  const release = context.release;
  if (!release.complete) throw new Error('Reviewed release pins are required before preparation.');
  const selection = normalizeHighLevelSelection(input.selection, release);
  let transaction;
  if (kind === 'activation') transaction = buildActivationTransaction({ owner: selection.owner, implementation: release.implementation, tokenId: selection.tokenId });
  else if (kind === 'eth') transaction = buildEthSendTransaction({ owner: selection.owner, account: selection.account, recipient: input.recipient, amountWei: input.amountWei });
  else transaction = buildErc20SendTransaction({ owner: selection.owner, account: selection.account, token: input.token, recipient: input.recipient, amountBaseUnits: input.amountBaseUnits });
  const evidence = await readAccountPreflight(context, { selection, transaction, signal: input.signal });
  if (!evidence.writeReady) throw new Error('Fresh pre-signature readiness does not permit an EOA write.');
  if (kind === 'activation' && evidence.accountState !== 'undeployed') throw new Error('Activation requires an undeployed account.');
  if (kind !== 'activation' && evidence.accountState !== 'active') throw new Error('Send requires an active exact account runtime.');
  let innerCall = null;
  if (kind === 'eth') {
    const amount = BigInt(String(input.amountWei));
    if (amount > BigInt(evidence.prefundedWei)) throw new Error('ETH amount exceeds the fresh anchored balance.');
    innerCall = { from: selection.account, to: getAddress(input.recipient), input: '0x', value: `0x${amount.toString(16)}` };
  }
  if (kind === 'erc20') {
    const tokenEvidence = await readDiscoveredToken(context, evidence.anchor, selection.account, {
      contract: getAddress(input.token), value: '0', name: null, symbol: null, iconUrl: null,
    }, input.signal);
    const amount = BigInt(String(input.amountBaseUnits));
    if (!tokenEvidence.sendable || amount > BigInt(tokenEvidence.balanceBaseUnits)) {
      throw new Error('ERC-20 amount exceeds a fresh canonical sendable balance.');
    }
    innerCall = {
      from: selection.account,
      to: getAddress(input.token),
      input: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [getAddress(input.recipient), amount] }),
      value: '0x0',
    };
  }
  const id = context.randomUUID();
  if (typeof id !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(id)) throw new Error('Secure unpredictable preparation ID is unavailable.');
  const createdAtMs = context.now();
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) throw new Error('Preparation clock is invalid.');
  return deepFreeze({
    id,
    kind,
    scope: { chainId: BASE_CHAIN_ID, collection: LOOPERS_COLLECTION, ...selection },
    selection,
    anchor: evidence.anchor,
    transaction,
    evidence,
    implementation: kind === 'activation' ? release.implementation : null,
    preState: kind === 'activation' ? null : String(evidence.evidence.state),
    innerCall,
    estimatedGas: evidence.estimatedGas, gasPrice: evidence.gasPrice, estimatedFeeWei: evidence.estimatedFeeWei,
    createdAtMs, expiresAtMs: createdAtMs + 120_000,
  });
}
async function pollOperation(context, input = {}) {
  requirePlainObject(input, 'Operation poll input');
  const hash = canonicalHash(input.hash, 'operation hash');
  const createdAtMs = input.createdAtMs;
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0 || !Number.isSafeInteger(createdAtMs + 600_000)) {
    throw new Error('Operation poll creation time is invalid.');
  }
  const deadline = createdAtMs + 600_000;
  while (context.now() < deadline) {
    if (input.signal?.aborted) throw input.signal.reason ?? new DOMException('Aborted', 'AbortError');
    const pairs = await Promise.all(BASE_RPC_ORIGINS.map(async (origin) => ({
      transaction: await rpcMethod(context, origin, 'eth_getTransactionByHash', [hash], input.signal),
      receipt: await rpcMethod(context, origin, 'eth_getTransactionReceipt', [hash], input.signal),
    })));
    requireAgreement(pairs, 'Base transaction and receipt polling evidence disagrees.');
    if (pairs[0].transaction && pairs[0].receipt) {
      if (!input.prepared) return classification('uncertain_hashed', { binding: 'prepared operation required for attribution' });
      const result = await revalidateReceipt(context, { hash, prepared: input.prepared, signal: input.signal });
      if (['confirmed_attributed', 'observed_unattributed', 'reverted'].includes(result.classification)) {
        return await waitForConfirmationDepth(context, result, pairs[0].receipt, input.signal);
      }
      return result;
    }
    const current = context.now();
    const interval = current < createdAtMs + 120_000 ? 2_000 : 10_000;
    const waitMs = Math.min(interval, deadline - current);
    if (waitMs <= 0) break;
    await context.sleep(waitMs, input.signal);
  }
  return classification('uncertain_hashed', { binding: 'receipt deadline expired' });
}

async function revalidateReceipt(context, input = {}) {
  requirePlainObject(input, 'Receipt revalidation input');
  const hash = canonicalHash(input.hash, 'operation hash');
  const pairs = await Promise.all(BASE_RPC_ORIGINS.map(async (origin) => ({
    transaction: await rpcMethod(context, origin, 'eth_getTransactionByHash', [hash], input.signal),
    receipt: await rpcMethod(context, origin, 'eth_getTransactionReceipt', [hash], input.signal),
  })));
  requireAgreement(pairs, 'Base transaction and receipt evidence disagrees.');
  const publicReceipt = await rpcMethod(context, PUBLICNODE_ORIGIN, 'eth_getTransactionReceipt', [hash], input.signal);
  if (!pairs[0].transaction || !pairs[0].receipt || stableJson(publicReceipt) !== stableJson(pairs[0].receipt)) {
    return classification('uncertain_hashed', { binding: 'three-origin final receipt quorum is incomplete' });
  }
  const receipt = normalizeHighLevelReceipt(pairs[0].receipt);
  const state = await readAccountPreflight(context, {
    selection: input.prepared.selection,
    receipt: { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash },
    signal: input.signal,
  });
  let trace = null;
  if (input.prepared.kind !== 'activation' && receipt.status === '0x1') {
    trace = await rpcMethod(context, BASE_RPC_ORIGINS[1], 'debug_traceTransaction', [hash, TRACE_OPTIONS], input.signal);
  }
  const stateEvidence = {
    anchor: state.anchor,
    accountState: state.accountState,
    account: state.selection.account,
    operatorCode: state.evidence.operatorCode,
    state: state.evidence.state,
  };
  return verifyOperationReceipt({
    requestedHash: hash,
    transaction: pairs[0].transaction,
    receipt,
    prepared: input.prepared,
    postState: stateEvidence,
    revertedState: stateEvidence,
    trace,
  });
}

async function discoverTokens(context, account, signal) {
  const url = `${BLOCKSCOUT_ORIGIN}/api/v2/addresses/${account}/tokens?type=ERC-20`;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  if (signal?.aborted) abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Blockscout request timed out.')), TRANSPORT_LIMITS.blockscoutTimeoutMs);
  try {
    const response = await context.fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal });
    if (!response.ok || response.redirected || response.url !== url) throw new Error('Blockscout route failed or redirected.');
    return validateBlockscoutTokenResponse(JSON.parse(await boundedResponseText(response, TRANSPORT_LIMITS.blockscoutBytes)));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

async function readDiscoveredToken(context, anchor, account, hint, signal) {
  const blockRef = { blockHash: anchor.hash, requireCanonical: true };
  const balanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [account] });
  const decimalsData = '0x313ce567';
  try {
    const evidence = await Promise.all(BASE_RPC_ORIGINS.map(async (origin) => {
      const [code, balance, decimals] = await Promise.all([
        rpcMethod(context, origin, 'eth_getCode', [hint.contract, blockRef], signal),
        rpcMethod(context, origin, 'eth_call', [{ to: hint.contract, data: balanceData }, blockRef], signal),
        rpcMethod(context, origin, 'eth_call', [{ to: hint.contract, data: decimalsData }, blockRef], signal),
      ]);
      return {
        code: canonicalCode(code, 'token runtime'),
        balance: decodeCanonicalWord(balance, 'token balance').toString(),
        decimals: decodeCanonicalWord(decimals, 'token decimals').toString(),
      };
    }));
    requireAgreement(evidence, 'Canonical token reads disagree.');
    if (evidence[0].code === '0x' || BigInt(evidence[0].decimals) > 36n) throw new Error('Token code or decimals is not sendable.');
    return deepFreeze({
      contract: hint.contract,
      balanceBaseUnits: evidence[0].balance,
      decimals: Number(evidence[0].decimals),
      name: hint.name,
      symbol: hint.symbol,
      iconUrl: hint.iconUrl,
      metadataTrusted: false,
      sendable: true,
    });
  } catch {
    return deepFreeze({
      contract: hint.contract, balanceBaseUnits: hint.value, decimals: null,
      name: hint.name, symbol: hint.symbol, iconUrl: hint.iconUrl, metadataTrusted: false, sendable: false,
    });
  }
}

function decodeCanonicalWord(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be one canonical ABI word.`);
  return BigInt(value);
}

function normalizeHighLevelSelection(selection, release) {
  requirePlainObject(selection, 'Looper selection');
  const tokenId = normalizeTokenId(selection.tokenId).toString();
  const owner = getAddress(selection.owner);
  if (!release.implementation) throw new Error('Reviewed account implementation pin is required.');
  const account = deriveLooperAccount({ implementation: release.implementation, tokenId });
  if (selection.account !== undefined && !sameAddress(selection.account, account)) throw new Error('Selected deterministic account mismatches local derivation.');
  return deepFreeze({ tokenId, owner, account });
}

function classification(value, evidence) {
  return deepFreeze({ classification: value, evidence: deepFreeze({ ...evidence }) });
}

function requireReceiptCoordinates(transaction, receipt) {
  const number = canonicalHexQuantity(receipt?.blockNumber, 'receipt block number');
  const hash = canonicalHash(receipt?.blockHash, 'receipt block hash');
  const index = canonicalHexQuantity(receipt?.transactionIndex, 'receipt transaction index');
  if (transaction?.blockNumber !== number || transaction?.blockHash !== hash || transaction?.transactionIndex !== index) {
    throw new Error('transaction and receipt coordinates mismatch');
  }
  requireDenseArray(receipt.logs, 'Receipt logs');
}

function operationBindingError(transaction, prepared) {
  if (!prepared || !['activation', 'eth', 'erc20'].includes(prepared.kind) || !prepared.transaction || !prepared.selection) return 'prepared operation is malformed';
  const expected = prepared.transaction;
  const mismatches = [];
  if (transaction.chainId !== expected.chainId) mismatches.push('chain');
  if (!sameAddress(transaction.from, expected.from)) mismatches.push('from');
  if (!sameAddress(transaction.to, expected.to)) mismatches.push('to');
  if (transaction.input !== expected.data) mismatches.push('input');
  if (transaction.value !== expected.value) mismatches.push('value');
  if (!sameAddress(expected.from, prepared.selection.owner)) mismatches.push('owner scope');
  if (prepared.kind !== 'activation' && !sameAddress(expected.to, prepared.selection.account)) mismatches.push('account scope');
  if (prepared.kind === 'activation' && !sameAddress(expected.to, ERC6551_REGISTRY)) mismatches.push('registry scope');
  return mismatches.length ? `direct transaction ${mismatches.join(', ')} mismatch` : null;
}

function sameReceiptAnchor(state, receipt) {
  return state?.anchor?.number === receipt.blockNumber && state?.anchor?.hash === receipt.blockHash;
}

function postStateExact(state, receipt, prepared) {
  return Boolean(sameReceiptAnchor(state, receipt)
    && state.accountState === 'active'
    && sameAddress(state.account, prepared.selection.account));
}

function revertedStateExact(state, receipt, prepared) {
  if (!sameReceiptAnchor(state, receipt) || !sameAddress(state.account, prepared.selection.account) || state.operatorCode !== '0x') return false;
  if (prepared.kind === 'activation') return state.accountState === 'undeployed';
  return state.accountState === 'active' && String(state.state) === String(prepared.preState);
}

function canonicalTraceValue(value) {
  try {
    return canonicalHexQuantity(value ?? '0x0', 'trace value');
  } catch {
    return null;
  }
}

function normalizeActivity(activity) {
  if (activity === undefined) return Object.freeze([]);
  requireDenseArray(activity, 'Verified local activity');
  const allowed = new Set(['txHash', 'classification', 'kind', 'direction', 'assetContract', 'amountBaseUnits', 'blockNumber']);
  const verified = [];
  for (const entry of activity) {
    requirePlainObject(entry, 'Verified local activity entry');
    if (Object.keys(entry).some((key) => !allowed.has(key))) throw new Error('Verified local activity has unknown keys.');
    canonicalHash(entry.txHash, 'activity transaction hash');
    if (!['confirmed_attributed', 'reverted', 'observed_unattributed'].includes(entry.classification)) continue;
    verified.push(structuredClone(entry));
    if (verified.length === 20) break;
  }
  return deepFreeze(verified);
}

async function waitForConfirmationDepth(context, result, receipt, signal) {
  const receiptNumber = BigInt(canonicalHexQuantity(receipt.blockNumber, 'receipt block number'));
  const deadline = context.now() + 120_000;
  while (context.now() < deadline) {
    const head = await canonicalHead3(context, signal);
    if (BigInt(head.number) >= receiptNumber + 2n) return result;
    await context.sleep(Math.min(2_000, deadline - context.now()), signal);
  }
  return classification('uncertain_hashed', { binding: 'confirmation depth deadline expired' });
}

function normalizeHighLevelReceipt(receipt) {
  requirePlainObject(receipt, 'Canonical receipt');
  const logs = (receipt.logs ?? []).map((log, index) => {
    if (log?.eventName) return { ...log, receiptArrayIndex: log.receiptArrayIndex ?? index };
    try {
      const decoded = decodeEventLog({ abi: ACCOUNT_CREATED_ABI, topics: log.topics, data: log.data, strict: true });
      return {
        eventName: 'AccountCreated',
        account: getAddress(decoded.args.account),
        implementation: getAddress(decoded.args.implementation),
        salt: decoded.args.salt,
        chainId: decoded.args.chainId.toString(),
        tokenContract: getAddress(decoded.args.tokenContract),
        tokenId: decoded.args.tokenId.toString(),
        receiptArrayIndex: index,
      };
    } catch {
      try {
        const decoded = decodeEventLog({ abi: STATE_UPDATED_ABI, topics: log.topics, data: log.data, strict: true });
        return { eventName: 'StateUpdated', address: getAddress(log.address), state: decoded.args.state.toString(), receiptArrayIndex: index };
      } catch {
        return { eventName: 'Unrelated', receiptArrayIndex: index };
      }
    }
  });
  return {
    transactionHash: canonicalHash(receipt.transactionHash, 'receipt transaction hash'),
    status: receipt.status,
    blockNumber: canonicalHexQuantity(receipt.blockNumber, 'receipt block number'),
    blockHash: canonicalHash(receipt.blockHash, 'receipt block hash'),
    transactionIndex: canonicalHexQuantity(receipt.transactionIndex, 'receipt transaction index'),
    logs,
  };
}

async function canonicalHead3(context, signal) {
  const chainIds = await Promise.all(ALL_RPC_ORIGINS.map((origin) => rpcMethod(context, origin, 'eth_chainId', [], signal)));
  if (chainIds.some((value) => value !== '0x2105')) throw new Error('Three-origin Base chain quorum failed.');
  const heads = await Promise.all(ALL_RPC_ORIGINS.map((origin) => rpcMethod(context, origin, 'eth_getBlockByNumber', ['latest', false], signal)));
  const numbers = heads.map((block) => BigInt(canonicalHexQuantity(block?.number, 'latest block number')));
  const minimum = numbers.reduce((left, right) => left < right ? left : right);
  const number = `0x${minimum.toString(16)}`;
  const blocks = await Promise.all(ALL_RPC_ORIGINS.map((origin) => rpcMethod(context, origin, 'eth_getBlockByNumber', [number, false], signal)));
  const hashes = blocks.map((block) => {
    if (canonicalHexQuantity(block?.number, 'anchor block number') !== number) throw new Error('Canonical anchor number mismatches.');
    return canonicalHash(block.hash, 'anchor block hash');
  });
  if (hashes.some((hash) => hash !== hashes[0])) throw new Error('Canonical anchor hash quorum failed.');
  return Object.freeze({ number, hash: hashes[0] });
}

async function canonicalAnchorForReceipt(context, receipt, signal) {
  const number = canonicalHexQuantity(receipt?.blockNumber, 'receipt block number');
  const hash = canonicalHash(receipt?.blockHash, 'receipt block hash');
  const chainIds = await Promise.all(ALL_RPC_ORIGINS.map((origin) => rpcMethod(context, origin, 'eth_chainId', [], signal)));
  if (chainIds.some((value) => value !== '0x2105')) throw new Error('Three-origin Base chain quorum failed.');
  const blocks = await Promise.all(ALL_RPC_ORIGINS.map((origin) => rpcMethod(context, origin, 'eth_getBlockByNumber', [number, false], signal)));
  if (blocks.some((block) => canonicalHexQuantity(block?.number, 'receipt anchor number') !== number
    || canonicalHash(block?.hash, 'receipt anchor hash') !== hash)) throw new Error('Receipt block canonical quorum failed.');
  return Object.freeze({ number, hash });
}

async function rpcMethod(context, origin, method, params, signal) {
  if (!ALL_RPC_ORIGINS.includes(origin)) throw new Error('Unapproved Base RPC origin.');
  const kind = rpcKind(method, params);
  if (!RPC_ROUTES[origin].includes(kind)) throw new Error(`RPC route ${kind} is unavailable at ${origin}.`);
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  const trace = kind === 'trace';
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  signal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Base RPC request timed out.')), trace ? TRANSPORT_LIMITS.traceTimeoutMs : TRANSPORT_LIMITS.standardTimeoutMs);
  const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  let semanticPhase = false;
  try {
    const response = await context.fetchImpl(origin, {
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: controller.signal,
    });
    if (response.redirected || (response.url !== origin && response.url !== `${origin}/`)) throw new Error('Base RPC redirect or response URL mismatch.');
    if (!response.ok) {
      const error = new Error(`Base RPC failed with ${response.status}.`);
      error.transient = response.status === 429 || response.status >= 500;
      throw error;
    }
    const text = await boundedResponseText(response, trace ? TRANSPORT_LIMITS.traceBytes : TRANSPORT_LIMITS.standardBytes);
    semanticPhase = true;
    const body = JSON.parse(text);
    const envelopeKeys = Object.hasOwn(body ?? {}, 'result') ? ['jsonrpc', 'id', 'result'] : ['jsonrpc', 'id', 'error'];
    requirePlainExact(body, envelopeKeys, 'JSON-RPC envelope');
    if (body.jsonrpc !== '2.0' || body.id !== id) throw new Error('JSON-RPC envelope id mismatch.');
    if (Object.hasOwn(body, 'error')) {
      requirePlainObject(body.error, 'JSON-RPC error');
      if (!Number.isInteger(body.error.code) || typeof body.error.message !== 'string') throw new Error('JSON-RPC error is malformed.');
      const error = new Error(`JSON-RPC error ${body.error.code}: ${body.error.message}`);
      error.rpcError = { code: body.error.code, message: body.error.message };
      error.transient = [-32005, -32016].includes(body.error.code) || /rate|limit|busy|capacity|temporar/i.test(body.error.message);
      throw error;
    }
    return body.result;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (error?.rpcError || error?.transient !== undefined || semanticPhase) throw error;
    if (controller.signal.aborted) throw controller.signal.reason ?? error;
    const wrapped = new Error(`Base RPC network failure: ${error?.message ?? String(error)}`);
    wrapped.transient = true;
    throw wrapped;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

function rpcKind(method, params) {
  if (method === 'eth_chainId') return 'chainId';
  if (method === 'eth_getBlockByNumber') return params?.[0] === 'latest' ? 'latestBlock' : 'blockByNumber';
  return ({
    eth_getCode: 'code', eth_getStorageAt: 'storage', eth_getBalance: 'balance', eth_call: 'call',
    eth_estimateGas: 'estimate', eth_gasPrice: 'gasPrice', eth_getTransactionByHash: 'transaction',
    eth_getTransactionReceipt: 'receipt', debug_traceTransaction: 'trace',
  })[method] ?? 'unknown';
}

async function boundedResponseText(response, maxBytes) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error('Response size exceeds bound.');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Response size exceeds bound.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }
  if (declared === null || declared === undefined) throw new Error('Response body is not safely bounded.');
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error('Response size exceeds bound.');
  return text;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function requirePlainExact(value, keys, label) {
  requirePlainObject(value, label);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string')
    || actual.length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))
    || actual.some((key) => !keys.includes(key))) {
    throw new TypeError(`${label} has unknown or missing keys.`);
  }
}

function requireDenseArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be an array.`);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')
    || own.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) throw new TypeError(`${label} has unknown keys.`);
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) throw new TypeError(`${label} may not be sparse.`);
}

function canonicalDecimalText(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= ((1n << 256n) - 1n);
}

function boundedHint(value, maxLength) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function safeHttpsUrl(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function requireBoundedHex(value, maxBytes, label) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(value) || (value.length - 2) / 2 > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes or is malformed.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
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

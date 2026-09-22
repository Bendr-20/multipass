import { getAddress, keccak256, sha256 } from 'viem';

import {
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  LOOPERS_COLLECTION,
  ZERO_ADDRESS,
  buildActivationTransaction,
  buildErc20SendTransaction,
  buildEthSendTransaction,
  buildLooperAccountRuntimeCode,
  buildPolicyModuleTransaction,
  createOperationScope,
  deriveLooperAccount,
  normalizeTokenId,
} from './looper-agent-wallet.js';

const EMPTY_CODE = '0x';
const TERMINAL_STATES = new Set(['confirmed_attributed', 'reverted', 'invalidated', 'acknowledged_unknown']);

export function createLooperAgentWalletController({
  releaseConfig,
  readSnapshot,
  submitTransaction,
  readReceipt,
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks,
  now = () => Date.now(),
} = {}) {
  if (typeof readSnapshot !== 'function') throw new Error('Looper wallet snapshot reader is required.');
  if (typeof submitTransaction !== 'function') throw new Error('Looper wallet submitter is required.');
  if (typeof readReceipt !== 'function') throw new Error('Looper wallet receipt reader is required.');
  const releasedImplementation = normalizeReleaseAddress(releaseConfig?.implementation);
  const releasedRuntimeHash = normalizeHash(releaseConfig?.runtimeSha256);
  const releasedModuleRegistry = normalizeReleaseAddress(releaseConfig?.moduleRegistry);
  const releasedModuleRegistryRuntimeHash = normalizeHash(releaseConfig?.moduleRegistryRuntimeSha256);
  let selection = null;
  let current = emptySnapshot();
  let attemptCounter = 0;
  const attempts = { activation: null, send: null, policy: null };

  function getSnapshot() {
    return deepFreeze(structuredClone(current));
  }

  async function select(nextSelection) {
    selection = normalizeSelection(nextSelection);
    current = { ...emptySnapshot(), tokenId: selection.tokenId, owner: selection.owner, mode: 'loading', reason: null };
    return refresh('readiness');
  }

  async function refresh(phase = 'readiness') {
    requireSelection();
    try {
      const evidence = await readSnapshot({ selection: { ...selection }, phase });
      current = buildSnapshot(evidence, phase);
      restoreAttempts(current.account ?? current.legacyAccount);
      current = attachAttempts(current);
      return getSnapshot();
    } catch (error) {
      invalidatePreparedAttempts();
      forceReadOnly('rpc_disagreement');
      throw error;
    }
  }

  async function prepareActivation() {
    requireMode('inactive');
    const evidence = await readAndRequireWritable('pre_sign', 'inactive');
    const transaction = buildActivationTransaction({
      owner: selection.owner,
      implementation: releasedImplementation,
      tokenId: selection.tokenId,
    });
    return savePrepared('activation', transaction, evidence);
  }

  async function prepareEthSend({ recipient, amountWei }) {
    requireMode('active');
    const evidence = await readAndRequireWritable('pre_sign', 'active');
    const transaction = buildEthSendTransaction({
      owner: selection.owner,
      account: current.account,
      recipient,
      amountWei,
    });
    return savePrepared('send', transaction, evidence);
  }

  async function prepareErc20Send({ token, recipient, amountBaseUnits }) {
    requireMode('active');
    const evidence = await readAndRequireWritable('pre_sign', 'active');
    const transaction = buildErc20SendTransaction({
      owner: selection.owner,
      account: current.account,
      token,
      recipient,
      amountBaseUnits,
    });
    return savePrepared('send', transaction, evidence);
  }

  async function preparePolicyModule({ module }) {
    requireSelection();
    const normalizedModule = getAddress(module);
    const evidence = await readSnapshot({
      selection: { ...selection },
      phase: 'policy_preview',
      policyModule: normalizedModule,
    });
    const validated = buildSnapshot(evidence, 'policy_preview');
    current = attachAttempts(validated);
    requirePolicyRecoveryEvidence(validated, evidence, normalizedModule);
    const transaction = buildPolicyModuleTransaction({
      owner: selection.owner,
      account: validated.account,
      module: normalizedModule,
    });
    return savePrepared('policy', transaction, evidence, {
      targetPolicyModule: normalizedModule,
      policyBaseline: policyBaseline(evidence),
    });
  }

  async function submitPrepared(preparedId, { confirmed = false } = {}) {
    if (!confirmed) throw new Error('Explicit transaction confirmation is required.');
    const record = Object.values(attempts).find((entry) => entry?.id === preparedId);
    if (!record || record.state !== 'prepared') throw new Error('No matching prepared attempt is available.');
    if (!locks || typeof locks.request !== 'function') {
      current = blocked(current, 'locks_unavailable', 'read_only');
      throw new Error('Web Locks are required before a Looper wallet transaction can be signed.');
    }
    const scope = createOperationScope({
      tokenId: selection.tokenId,
      account: record.account,
      owner: selection.owner,
      kind: record.kind,
    });
    return locks.request(scope.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Another tab is already handling this Looper wallet operation.');
      try {
        const persisted = loadAttempt(scope);
        if (!persisted || persisted.id !== preparedId || persisted.state !== 'prepared') {
          throw new Error('The prepared attempt changed in another tab.');
        }
        if (record.kind === 'policy') {
          const evidence = await readSnapshot({
            selection: { ...selection },
            phase: 'pre_sign',
            policyModule: record.targetPolicyModule,
          });
          const validated = buildSnapshot(evidence, 'pre_sign');
          current = attachAttempts(validated);
          requirePolicyRecoveryEvidence(validated, evidence, record.targetPolicyModule);
          const expectedTransaction = buildPolicyModuleTransaction({
            owner: selection.owner,
            account: validated.account,
            module: record.targetPolicyModule,
          });
          if (stableJson(record.transaction) !== stableJson(expectedTransaction)
            || stableJson(persisted.transaction) !== stableJson(expectedTransaction)
            || !sameAddress(record.account, validated.account)) {
            throw new Error('Prepared permission module transaction is not exact. Preview again.');
          }
          if (stableJson(policyBaseline(evidence)) !== stableJson(record.policyBaseline)) {
            current = attachAttempts(blocked(validated, 'policy_drift', 'read_only'));
            throw new Error('Looper policy evidence drifted after preview. Preview again.');
          }
        } else {
          await readAndRequireWritable('pre_sign', record.kind === 'activation' ? 'inactive' : 'active');
        }
      } catch (error) {
        invalidateAttempt(record);
        forceReadOnly(current.reason ?? 'pre_sign_invalidated');
        throw error;
      }

      let hash;
      try {
        hash = await submitTransaction(record.transaction);
      } catch (error) {
        const nextState = isExplicitWalletRejection(error) ? 'reverted' : 'uncertain_hashless';
        updateAttempt(record.kind, { ...record, state: nextState, history: appendHistory(record, nextState) });
        throw error;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash ?? ''))) {
        updateAttempt(record.kind, { ...record, state: 'uncertain_hashless', history: appendHistory(record, 'uncertain_hashless') });
        throw new Error('Wallet returned no canonical transaction hash. Outcome is unknown.');
      }
      const submitted = { ...record, state: 'submitted', txHash: hash, history: appendHistory(record, 'submitted') };
      updateAttempt(record.kind, submitted);

      const receipt = await readReceipt({ hash, transaction: record.transaction });
      const postEvidence = await readSnapshot({ selection: { ...selection }, phase: 'receipt', transaction: record.transaction, receipt });
      const post = buildSnapshot(postEvidence, 'receipt');
      try {
        attributeReceipt({ record: submitted, receipt, post });
      } catch (error) {
        updateAttempt(record.kind, { ...submitted, state: 'uncertain_hashed', history: appendHistory(submitted, 'uncertain_hashed') });
        current = attachAttempts(blocked(post, 'receipt_attribution_failed'));
        throw error;
      }

      updateAttempt(record.kind, {
        ...submitted,
        state: 'confirmed_attributed',
        attributable: true,
        history: appendHistory(submitted, 'confirmed_attributed'),
      });
      current = attachAttempts(post);
      return getSnapshot();
    });
  }

  function savePrepared(kind, transaction, evidence, extra = {}) {
    const account = kind === 'activation'
      ? deriveLooperAccount({ implementation: releasedImplementation, tokenId: selection.tokenId })
      : evidence.collectionAccount;
    const id = `${kind}:${now()}:${attemptCounter += 1}`;
    const record = {
      version: 1,
      id,
      kind,
      state: 'prepared',
      tokenId: selection.tokenId,
      owner: selection.owner,
      account,
      preState: String(evidence.state ?? '0'),
      transaction,
      attributable: false,
      history: [{ state: 'prepared', at: now() }],
      ...extra,
    };
    updateAttempt(kind, record);
    return deepFreeze({
      id,
      kind,
      account,
      transaction: structuredClone(transaction),
      requiresExplicitConfirmation: true,
    });
  }

  async function readAndRequireWritable(phase, expectedMode) {
    const evidence = await readSnapshot({ selection: { ...selection }, phase });
    const validated = buildSnapshot(evidence, phase);
    if (validated.mode !== expectedMode) {
      current = attachAttempts(validated);
      if (validated.reason === 'unsupported_wallet') throw new Error('Looper wallet writes require an EOA with empty Base code.');
      throw new Error(`Looper wallet is not ${expectedMode}; ${validated.reason ?? validated.mode}.`);
    }
    current = attachAttempts(validated);
    return evidence;
  }

  function requirePolicyRecoveryEvidence(validated, evidence, targetModule) {
    if (!validated.policyRecoveryAllowed || !validated.account) {
      throw new Error(`Looper policy recovery is read-only; ${validated.reason ?? validated.mode}.`);
    }
    if (String(evidence.operatorCode ?? '').toLowerCase() !== EMPTY_CODE) {
      throw new Error('Looper policy recovery requires the connected current EOA owner.');
    }
    if (sameAddress(targetModule, ZERO_ADDRESS)) return;
    if (evidence.registryPaused !== false) throw new Error('Permission module registry is paused.');
    const candidateProof = normalizeModuleProof(evidence, 'candidate');
    if (!sameAddress(evidence.candidatePolicyModule, targetModule)
      || !candidateProof.canonical
      || candidateProof.code === EMPTY_CODE
      || !candidateProof.approved
      || !candidateProof.matches) {
      throw new Error('Permission module is not deployed and exactly approved.');
    }
  }

  function policyBaseline(evidence) {
    return {
      chainId: evidence.chainId,
      owner: safeAddress(evidence.owner),
      registry: safeAddress(evidence.registry),
      salt: String(evidence.salt ?? ''),
      account: safeAddress(evidence.collectionAccount),
      registryAccount: safeAddress(evidence.registryAccount),
      implementation: safeAddress(evidence.implementation),
      implementationCode: canonicalCodeOrNull(evidence.implementationCode),
      implementationRuntimeSha256: normalizeHash(evidence.implementationRuntimeSha256),
      accountCode: canonicalCodeOrNull(evidence.accountCode, { allowEmpty: true }),
      accountRuntimeSha256: normalizeHash(evidence.accountRuntimeSha256),
      accountCodeMatches: evidence.accountCodeMatches,
      moduleRegistry: safeAddress(evidence.moduleRegistry),
      moduleRegistryCode: canonicalCodeOrNull(evidence.moduleRegistryCode, { allowEmpty: true }),
      moduleRegistryRuntimeSha256: normalizeHash(evidence.moduleRegistryRuntimeSha256),
      registryPaused: evidence.registryPaused,
      policyModule: safeAddress(evidence.policyModule),
      policyModuleOwner: safeAddress(evidence.policyModuleOwner),
      policyEpoch: String(evidence.policyEpoch ?? ''),
      policyModuleCode: canonicalCodeOrNull(evidence.policyModuleCode, { allowEmpty: true }),
      policyModuleRuntimeSha256: normalizeHash(evidence.policyModuleRuntimeSha256),
      policyModuleCodehash: normalizeHash(evidence.policyModuleCodehash),
      approvedModuleCodehash: normalizeHash(evidence.approvedModuleCodehash),
      policyModuleApproved: evidence.policyModuleApproved,
      policyModuleCodehashMatches: evidence.policyModuleCodehashMatches,
      candidatePolicyModule: safeAddress(evidence.candidatePolicyModule),
      candidatePolicyModuleCode: canonicalCodeOrNull(evidence.candidatePolicyModuleCode, { allowEmpty: true }),
      candidatePolicyModuleRuntimeSha256: normalizeHash(evidence.candidatePolicyModuleRuntimeSha256),
      candidatePolicyModuleCodehash: normalizeHash(evidence.candidatePolicyModuleCodehash),
      candidateApprovedModuleCodehash: normalizeHash(evidence.candidateApprovedModuleCodehash),
      candidatePolicyModuleApproved: evidence.candidatePolicyModuleApproved,
      candidatePolicyModuleCodehashMatches: evidence.candidatePolicyModuleCodehashMatches,
    };
  }

  function buildSnapshot(evidence, phase) {
    const base = evidenceToSnapshot(evidence);
    if (evidence.chainId !== BASE_CHAIN_ID) return blocked(base, 'wrong_chain');
    if (!sameAddress(evidence.owner, selection.owner)) return blocked(base, 'owner_changed');
    if (!sameAddress(evidence.registry, ERC6551_REGISTRY) || evidence.salt !== ACCOUNT_SALT) {
      return blocked(base, 'config_drift', 'read_only');
    }

    const implementation = safeAddress(evidence.implementation);
    if (!implementation) return blocked(base, 'config_drift', 'read_only');
    const derivedAccount = deriveLooperAccount({ implementation, tokenId: selection.tokenId });
    const accountAgreement = sameAddress(evidence.collectionAccount, derivedAccount)
      && sameAddress(evidence.registryAccount, derivedAccount);
    if (!accountAgreement) return blocked({ ...base, account: derivedAccount }, 'config_drift', 'read_only');

    if (sameAddress(implementation, LEGACY_ACCOUNT_IMPLEMENTATION)) {
      return { ...base, account: null, legacyAccount: derivedAccount, mode: 'legacy_read_only', reason: 'legacy_implementation', canTransact: false };
    }
    if (!releasedImplementation || !releasedRuntimeHash || !releasedModuleRegistry || !releasedModuleRegistryRuntimeHash) {
      return blocked({ ...base, account: derivedAccount }, 'release_unset', 'read_only');
    }
    const implementationCode = canonicalCodeOrNull(evidence.implementationCode);
    const implementationHash = normalizeHash(evidence.implementationRuntimeSha256);
    if (!sameAddress(implementation, releasedImplementation)
      || !implementationCode
      || implementationHash !== releasedRuntimeHash
      || sha256(implementationCode) !== implementationHash) {
      return blocked({ ...base, account: derivedAccount }, 'implementation_mismatch', 'read_only');
    }
    if (String(evidence.operatorCode ?? '').toLowerCase() !== EMPTY_CODE) {
      return blocked({ ...base, account: derivedAccount }, 'unsupported_wallet', 'read_only');
    }
    const accountCode = canonicalCodeOrNull(evidence.accountCode, { allowEmpty: true });
    if (!accountCode) return blocked({ ...base, account: derivedAccount }, 'proxy_mismatch', 'read_only');
    const recoveryBase = { ...base, account: derivedAccount };
    const moduleRegistryCode = canonicalCodeOrNull(evidence.moduleRegistryCode, { allowEmpty: true });
    const moduleRegistryHash = normalizeHash(evidence.moduleRegistryRuntimeSha256);
    if (!sameAddress(evidence.moduleRegistry, releasedModuleRegistry)
      || !moduleRegistryCode
      || moduleRegistryCode === EMPTY_CODE
      || moduleRegistryHash !== releasedModuleRegistryRuntimeHash
      || sha256(moduleRegistryCode) !== moduleRegistryHash) {
      return blocked(recoveryBase, 'registry_mismatch', 'read_only');
    }
    if (accountCode === EMPTY_CODE) {
      return { ...base, account: derivedAccount, mode: 'inactive', reason: null, canTransact: true, policyStatus: 'owner-only' };
    }

    const expectedAccountCode = buildLooperAccountRuntimeCode({ implementation, tokenId: selection.tokenId });
    const accountHash = normalizeHash(evidence.accountRuntimeSha256);
    if (accountCode !== expectedAccountCode
      || accountHash !== sha256(accountCode)
      || evidence.accountCodeMatches !== true) {
      return blocked(recoveryBase, 'proxy_mismatch', 'read_only');
    }

    const module = safeAddress(evidence.policyModule);
    const moduleOwner = safeAddress(evidence.policyModuleOwner);
    if (evidence.policyEvidenceRead !== true
      || !module
      || !moduleOwner
      || !canonicalUint(evidence.policyEpoch)
      || typeof evidence.registryPaused !== 'boolean') {
      return blocked(recoveryBase, 'malformed_policy', 'read_only', 'module-blocked');
    }
    const selectedProof = normalizeModuleProof(evidence, 'selected');
    if (!selectedProof.canonical) return blocked(recoveryBase, 'malformed_policy', 'read_only', 'module-blocked');
    const policyBase = { ...recoveryBase, policyRecoveryAllowed: true };
    if (sameAddress(module, ZERO_ADDRESS)) {
      if (selectedProof.code !== EMPTY_CODE
        || selectedProof.runtimeSha256 !== null
        || selectedProof.approved
        || selectedProof.matches) {
        return blocked(recoveryBase, 'malformed_policy', 'read_only', 'module-blocked');
      }
      if (!sameAddress(moduleOwner, ZERO_ADDRESS)) {
        return blocked(policyBase, 'ownership_mismatch', 'read_only', 'ownership-mismatch');
      }
      return {
        ...policyBase,
        mode: 'active', reason: null, canTransact: true, policyStatus: 'owner-only',
      };
    }
    if (!sameAddress(moduleOwner, selection.owner)) {
      return blocked(policyBase, 'ownership_mismatch', 'read_only', 'ownership-mismatch');
    }
    if (!selectedProof.approved || !selectedProof.matches) {
      return blocked(policyBase, 'module_blocked', 'read_only', 'module-blocked');
    }
    if (evidence.registryPaused === true) {
      return {
        ...policyBase,
        mode: 'active', reason: 'permission_hook_paused', canTransact: true, policyStatus: 'permission-hook-paused',
      };
    }
    return {
      ...policyBase,
      mode: 'active', reason: null, canTransact: true, policyStatus: 'active-policy',
    };
  }

  function blocked(base, reason, mode = 'blocked', policyStatus = 'read-only') {
    return { ...base, mode, reason, canTransact: false, policyStatus };
  }

  function evidenceToSnapshot(evidence = {}) {
    return {
      tokenId: selection.tokenId,
      owner: selection.owner,
      account: safeAddress(evidence.collectionAccount),
      legacyAccount: null,
      mode: 'read_only',
      reason: null,
      blockNumber: String(evidence.blockNumber ?? ''),
      blockHash: String(evidence.blockHash ?? ''),
      accountState: String(evidence.state ?? '0'),
      implementation: safeAddress(evidence.implementation),
      implementationRuntimeSha256: normalizeHash(evidence.implementationRuntimeSha256),
      accountRuntimeSha256: normalizeHash(evidence.accountRuntimeSha256),
      accountCodeMatches: evidence.accountCodeMatches === true,
      moduleRegistry: safeAddress(evidence.moduleRegistry),
      moduleRegistryRuntimeSha256: normalizeHash(evidence.moduleRegistryRuntimeSha256),
      nativeWei: canonicalDecimal(evidence.nativeWei ?? '0'),
      tokens: normalizeTokens(evidence.tokens),
      refreshedAt: String(evidence.refreshedAt ?? new Date(now()).toISOString()),
      canTransact: false,
      policyStatus: 'read-only',
      policyRecoveryAllowed: false,
      policyModule: safeAddress(evidence.policyModule),
      policyModuleOwner: safeAddress(evidence.policyModuleOwner),
      policyModuleOwnerMatches: sameAddress(evidence.policyModuleOwner, selection.owner),
      policyEpoch: canonicalUint(evidence.policyEpoch) ? String(evidence.policyEpoch) : null,
      policyModuleRuntimeSha256: normalizeHash(evidence.policyModuleRuntimeSha256),
      policyModuleCodehash: normalizeHash(evidence.policyModuleCodehash),
      approvedModuleCodehash: normalizeHash(evidence.approvedModuleCodehash),
      policyModuleApproved: evidence.policyModuleApproved === true,
      policyModuleCodehashMatches: evidence.policyModuleCodehashMatches === true,
      policyEvidenceRead: evidence.policyEvidenceRead === true,
      registryPaused: typeof evidence.registryPaused === 'boolean' ? evidence.registryPaused : null,
      activation: current.activation ?? idleAttempt(),
      send: current.send ?? idleAttempt(),
      policy: current.policy ?? idleAttempt(),
    };
  }

  function attachAttempts(snapshot) {
    return {
      ...snapshot,
      activation: publicAttempt(attempts.activation),
      send: publicAttempt(attempts.send),
      policy: publicAttempt(attempts.policy),
    };
  }

  function updateAttempt(kind, record) {
    attempts[kind] = record;
    const scope = createOperationScope({
      tokenId: selection.tokenId,
      account: record.account,
      owner: selection.owner,
      kind,
    });
    storage?.setItem?.(scope.storageKey, JSON.stringify(record));
    current = attachAttempts(current);
  }

  function invalidateAttempt(record) {
    const active = attempts[record.kind];
    if (!active || active.id !== record.id || active.state !== 'prepared') return;
    updateAttempt(record.kind, {
      ...active,
      state: 'invalidated',
      history: appendHistory(active, 'invalidated'),
    });
  }

  function invalidatePreparedAttempts() {
    for (const record of Object.values(attempts)) {
      if (record?.state === 'prepared') invalidateAttempt(record);
    }
  }

  function forceReadOnly(reason) {
    current = attachAttempts({
      ...current,
      mode: 'read_only',
      reason,
      canTransact: false,
      policyStatus: 'read-only',
      policyRecoveryAllowed: false,
    });
  }

  function restoreAttempts(account) {
    if (!account) return;
    for (const kind of ['activation', 'send', 'policy']) {
      const scope = createOperationScope({ tokenId: selection.tokenId, account, owner: selection.owner, kind });
      const restored = loadAttempt(scope);
      if (!restored) continue;
      if (restored.kind !== kind || restored.owner.toLowerCase() !== selection.owner.toLowerCase()
        || restored.tokenId !== selection.tokenId || restored.account.toLowerCase() !== account.toLowerCase()) continue;
      attempts[kind] = restored;
    }
  }

  function loadAttempt(scope) {
    try {
      const raw = storage?.getItem?.(scope.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.version === 1 ? parsed : null;
    } catch {
      current = blocked(current, 'corrupt_store');
      return null;
    }
  }

  function requireMode(mode) {
    requireSelection();
    if (current.mode !== mode) throw new Error(`Looper wallet must be ${mode}; current mode is ${current.mode}.`);
  }

  function requireSelection() {
    if (!selection) throw new Error('Select an owned Looper first.');
  }

  return {
    select,
    refresh: () => refresh('readiness'),
    prepareActivation,
    prepareEthSend,
    prepareErc20Send,
    preparePolicyModule,
    submitPrepared,
    getSnapshot,
  };
}

export function createReadOnlyLooperWalletContext(snapshot = {}) {
  if (!snapshot.account || !snapshot.owner || !snapshot.tokenId) return null;
  return deepFreeze({
    schema_version: '0.1.0',
    kind: 'looper_wallet_read_context',
    scope: {
      chainId: BASE_CHAIN_ID,
      collection: LOOPERS_COLLECTION,
      tokenId: String(snapshot.tokenId),
      account: getAddress(snapshot.account),
      owner: getAddress(snapshot.owner),
    },
    native: { symbol: 'ETH', balanceWei: canonicalDecimal(snapshot.nativeWei ?? '0') },
    tokens: normalizeTokens(snapshot.tokens).map((token) => ({ ...token, metadataTrusted: false })),
    activity: [],
    refreshedAt: String(snapshot.refreshedAt ?? ''),
    health: snapshot.mode === 'active' ? 'verified' : 'degraded',
    capabilities: { read: true, sign: false, submit: false, approve: false },
  });
}

function attributeReceipt({ record, receipt, post }) {
  if (!['success', 1, '0x1'].includes(receipt?.status)) throw new Error('Direct receipt attribution failed: transaction reverted.');
  if (JSON.stringify(receipt.transaction) !== JSON.stringify(record.transaction)) {
    throw new Error('Direct receipt attribution failed: outer transaction mismatch.');
  }
  if (record.kind === 'activation') {
    const event = receipt.logs?.filter((log) => log.eventName === 'AccountCreated' && sameAddress(log.account, record.account)) ?? [];
    if (event.length !== 1 || post.mode !== 'active') throw new Error('Direct receipt attribution failed for activation.');
    return;
  }
  if (record.kind === 'policy') {
    const expectedEpoch = (BigInt(record.policyBaseline.policyEpoch) + 1n).toString();
    if (!sameAddress(post.policyModule, record.targetPolicyModule) || post.policyEpoch !== expectedEpoch) {
      throw new Error('Direct receipt attribution failed for policy recovery.');
    }
    return;
  }
  const expectedState = (BigInt(record.preState) + 1n).toString();
  const event = receipt.logs?.filter((log) => log.eventName === 'StateUpdated'
    && sameAddress(log.address, record.account) && String(log.state) === expectedState) ?? [];
  if (event.length !== 1 || post.mode !== 'active' || post.accountState !== expectedState) {
    throw new Error('Direct receipt attribution failed for send.');
  }
}

function normalizeSelection(selection = {}) {
  return {
    tokenId: normalizeTokenId(selection.tokenId).toString(),
    owner: getAddress(selection.owner),
  };
}

function normalizeReleaseAddress(value) {
  return value ? getAddress(value) : null;
}

function normalizeHash(value) {
  const hash = String(value ?? '').toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(hash) ? hash : null;
}

function canonicalCodeOrNull(value, { allowEmpty = false } = {}) {
  const code = String(value ?? '').toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})*$/.test(code) || (!allowEmpty && code === EMPTY_CODE)) return null;
  return code;
}

function normalizeModuleProof(evidence, kind) {
  const candidate = kind === 'candidate';
  const code = canonicalCodeOrNull(
    candidate ? evidence.candidatePolicyModuleCode : evidence.policyModuleCode,
    { allowEmpty: true },
  );
  const rawRuntimeHash = candidate ? evidence.candidatePolicyModuleRuntimeSha256 : evidence.policyModuleRuntimeSha256;
  const runtimeSha256 = normalizeHash(rawRuntimeHash);
  const rawCodehash = candidate ? evidence.candidatePolicyModuleCodehash : evidence.policyModuleCodehash;
  const codehash = normalizeHash(rawCodehash);
  const approvedCodehash = normalizeHash(
    candidate ? evidence.candidateApprovedModuleCodehash : evidence.approvedModuleCodehash,
  );
  const approvedFlag = candidate ? evidence.candidatePolicyModuleApproved : evidence.policyModuleApproved;
  const matchesFlag = candidate ? evidence.candidatePolicyModuleCodehashMatches : evidence.policyModuleCodehashMatches;
  if (code === null || approvedCodehash === null || typeof approvedFlag !== 'boolean' || typeof matchesFlag !== 'boolean') {
    return { canonical: false };
  }
  const actualRuntimeHash = code === EMPTY_CODE ? null : sha256(code);
  const actualCodehash = code === EMPTY_CODE ? null : keccak256(code);
  if ((actualRuntimeHash === null && rawRuntimeHash !== null)
    || (actualRuntimeHash !== null && runtimeSha256 !== actualRuntimeHash)
    || (actualCodehash === null && rawCodehash !== null)
    || (actualCodehash !== null && codehash !== actualCodehash)) {
    return { canonical: false };
  }
  const approved = approvedCodehash !== `0x${'00'.repeat(32)}`;
  const matches = approved && actualCodehash !== null && approvedCodehash === actualCodehash;
  if (approvedFlag !== approved || matchesFlag !== matches) return { canonical: false };
  return {
    canonical: true,
    code,
    runtimeSha256: actualRuntimeHash,
    codehash: actualCodehash,
    approvedCodehash,
    approved,
    matches,
  };
}

function safeAddress(value) {
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function sameAddress(left, right) {
  const a = safeAddress(left);
  const b = safeAddress(right);
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function canonicalDecimal(value) {
  const text = String(value ?? '');
  if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error('Wallet balance is not canonical.');
  return text;
}

function canonicalUint(value) {
  const text = String(value ?? '');
  return /^(0|[1-9]\d*)$/.test(text) && BigInt(text) <= ((1n << 256n) - 1n);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function normalizeTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  return tokens.map((token) => ({
    contract: getAddress(token.contract),
    balanceBaseUnits: canonicalDecimal(token.balanceBaseUnits),
    decimals: Number(token.decimals),
    symbol: String(token.symbol),
  }));
}

function appendHistory(record, state) {
  return [...(record.history ?? []), { state, at: Date.now() }];
}

function publicAttempt(record) {
  if (!record) return idleAttempt();
  return {
    state: record.state,
    txHash: record.txHash ?? null,
    attributable: Boolean(record.attributable),
    preparedId: record.state === 'prepared' ? record.id : null,
  };
}

function idleAttempt() {
  return { state: 'idle', txHash: null, attributable: false, preparedId: null };
}

function emptySnapshot() {
  return {
    tokenId: null,
    owner: null,
    account: null,
    legacyAccount: null,
    mode: 'read_only',
    reason: 'not_selected',
    blockNumber: null,
    blockHash: null,
    accountState: '0',
    implementation: null,
    implementationRuntimeSha256: null,
    accountRuntimeSha256: null,
    accountCodeMatches: false,
    moduleRegistry: null,
    moduleRegistryRuntimeSha256: null,
    nativeWei: '0',
    tokens: [],
    refreshedAt: null,
    canTransact: false,
    policyStatus: 'read-only',
    policyRecoveryAllowed: false,
    policyModule: null,
    policyModuleOwner: null,
    policyModuleOwnerMatches: false,
    policyEpoch: null,
    policyModuleRuntimeSha256: null,
    policyModuleCodehash: null,
    approvedModuleCodehash: null,
    policyModuleApproved: false,
    policyModuleCodehashMatches: false,
    policyEvidenceRead: false,
    registryPaused: null,
    activation: idleAttempt(),
    send: idleAttempt(),
    policy: idleAttempt(),
  };
}

function isExplicitWalletRejection(error) {
  return error?.code === 4001 || /reject|denied|cancel/i.test(String(error?.message ?? ''));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

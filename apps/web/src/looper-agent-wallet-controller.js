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
const ATTEMPT_STATES = new Set([
  'prepared', 'submitted', 'confirmed_attributed', 'reverted', 'invalidated',
  'acknowledged_unknown', 'uncertain_hashless', 'uncertain_hashed',
]);
const TERMINAL_STATES = new Set(['confirmed_attributed', 'reverted', 'invalidated', 'acknowledged_unknown']);

export function createLooperAgentWalletController({
  releaseConfig,
  readSnapshot,
  submitTransaction,
  getWalletChainId,
  readReceipt,
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks,
  now = () => Date.now(),
  generateAttemptId = defaultAttemptId,
} = {}) {
  if (typeof readSnapshot !== 'function') throw new Error('Looper wallet snapshot reader is required.');
  if (typeof submitTransaction !== 'function') throw new Error('Looper wallet submitter is required.');
  if (typeof getWalletChainId !== 'function') throw new Error('Looper wallet chain reader is required.');
  if (typeof readReceipt !== 'function') throw new Error('Looper wallet receipt reader is required.');
  if (typeof generateAttemptId !== 'function') throw new Error('Looper wallet attempt ID generator is required.');
  const releasedImplementation = normalizeReleaseAddress(releaseConfig?.implementation);
  const releasedRuntimeHash = normalizeHash(releaseConfig?.runtimeSha256);
  const releasedModuleRegistry = normalizeReleaseAddress(releaseConfig?.moduleRegistry);
  const releasedModuleRegistryRuntimeHash = normalizeHash(releaseConfig?.moduleRegistryRuntimeSha256);
  let selection = null;
  let current = emptySnapshot();
  const attempts = { activation: null, send: null, policy: null };
  const acknowledgeReadiness = { activation: null, send: null, policy: null };
  let acknowledgedUnknownSendHistory = [];

  function getSnapshot() {
    return deepFreeze(structuredClone(current));
  }

  async function select(nextSelection) {
    const normalized = normalizeSelection(nextSelection);
    if (selection && !sameSelection(selection, normalized)) {
      const nonterminal = Object.values(attempts).filter((record) => record && !TERMINAL_STATES.has(record.state));
      if (nonterminal.length) {
        invalidatePreparedAttempts();
        throw new Error('A nonterminal Looper wallet operation must settle before agent selection can change.');
      }
      clearAttempts();
    }
    selection = normalized;
    current = { ...emptySnapshot(), tokenId: selection.tokenId, owner: selection.owner, mode: 'loading', reason: null };
    return refresh('readiness');
  }

  async function refresh(phase = 'readiness') {
    requireSelection();
    try {
      const evidence = await readSnapshot({ selection: { ...selection }, phase });
      current = buildSnapshot(evidence, phase);
      await restoreAttempts(current.account ?? current.legacyAccount);
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
    return savePrepared('activation', transaction, evidence, {
      semantic: { implementation: releasedImplementation },
    });
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
    return savePrepared('send', transaction, evidence, {
      semantic: { asset: 'native', recipient: getAddress(recipient), amount: canonicalPositiveUint(amountWei, 'ETH amount') },
    });
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
    return savePrepared('send', transaction, evidence, {
      semantic: {
        asset: 'erc20',
        token: getAddress(token),
        recipient: getAddress(recipient),
        amount: canonicalPositiveUint(amountBaseUnits, 'token amount'),
      },
    });
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
      semantic: { module: normalizedModule },
      targetPolicyModule: normalizedModule,
      policyBaseline: policyBaseline(evidence),
    });
  }

  async function submitPrepared(preparedId, { confirmed = false } = {}) {
    if (!confirmed) throw new Error('Explicit transaction confirmation is required.');
    const record = Object.values(attempts).find((entry) => entry?.id === preparedId);
    if (!record || record.state !== 'prepared') throw new Error('No matching prepared attempt is available.');
    const boundSelection = { tokenId: record.tokenId, owner: record.owner };
    if (!sameSelection(selection, boundSelection)) {
      invalidateAttempt(record);
      throw new Error('Prepared attempt is not bound to the selected Looper agent.');
    }
    if (!locks || typeof locks.request !== 'function') {
      current = blocked(current, 'locks_unavailable', 'read_only');
      throw new Error('Web Locks are required before a Looper wallet transaction can be signed.');
    }
    const scope = createOperationScope({
      tokenId: record.tokenId,
      account: record.account,
      owner: record.owner,
      kind: record.kind,
    });
    return locks.request(scope.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Another tab is already handling this Looper wallet operation.');
      let expectedTransaction;
      try {
        const persisted = loadAttempt(scope, record.kind);
        if (!persisted || persisted.id !== preparedId || persisted.state !== 'prepared'
          || stableJson(persisted) !== stableJson(record)) {
          throw new Error('The persisted prepared attempt is not exact. Preview again.');
        }
        let evidence;
        if (record.kind === 'policy') {
          evidence = await readSnapshot({
            selection: { ...boundSelection },
            expectedAccount: record.account,
            phase: 'pre_sign',
            policyModule: record.targetPolicyModule,
          });
          const validated = buildSnapshot(evidence, 'pre_sign', boundSelection);
          if (sameSelection(selection, boundSelection)) current = attachAttempts(validated);
          requirePolicyRecoveryEvidence(validated, evidence, record.targetPolicyModule);
          if (stableJson(policyBaseline(evidence)) !== stableJson(record.policyBaseline)) {
            if (sameSelection(selection, boundSelection)) current = attachAttempts(blocked(validated, 'policy_drift', 'read_only'));
            throw new Error('Looper policy evidence drifted after preview. Preview again.');
          }
        } else {
          evidence = await readAndRequireWritable(
            'pre_sign',
            record.kind === 'activation' ? 'inactive' : 'active',
            boundSelection,
            record.account,
          );
        }
        expectedTransaction = reconstructAttemptTransaction(record, releasedImplementation, evidence.account);
        if (!sameAddress(record.account, evidence.account)
          || stableJson(record.transaction) !== stableJson(expectedTransaction)
          || stableJson(persisted.transaction) !== stableJson(expectedTransaction)) {
          throw new Error('Prepared Looper wallet transaction is not exact. Preview again.');
        }
        const walletChainId = await getWalletChainId();
        if (walletChainId !== '0x2105') {
          throw new Error('Connected wallet changed away from Base before submission.');
        }
        const finalPersisted = loadAttempt(scope, record.kind);
        if (!finalPersisted || finalPersisted.id !== preparedId || finalPersisted.state !== 'prepared'
          || stableJson(finalPersisted) !== stableJson(record)) {
          throw new Error('The persisted prepared attempt changed before submission. Preview again.');
        }
      } catch (error) {
        invalidateAttempt(record);
        if (sameSelection(selection, boundSelection)) forceReadOnly(current.reason ?? 'pre_sign_invalidated');
        throw error;
      }

      let hash;
      try {
        hash = await submitTransaction(expectedTransaction);
      } catch (error) {
        const nextState = isExplicitWalletRejection(error) ? 'reverted' : 'uncertain_hashless';
        updateAttempt(record.kind, { ...record, transaction: expectedTransaction, state: nextState, history: appendHistory(record, nextState) });
        throw error;
      }
      if (!/^0x[0-9a-f]{64}$/.test(String(hash ?? ''))) {
        updateAttempt(record.kind, { ...record, transaction: expectedTransaction, state: 'uncertain_hashless', history: appendHistory(record, 'uncertain_hashless') });
        throw new Error('Wallet returned no canonical transaction hash. Outcome is unknown.');
      }
      const submitted = {
        ...record,
        transaction: expectedTransaction,
        state: 'submitted',
        txHash: hash,
        history: appendHistory(record, 'submitted'),
      };
      updateAttempt(record.kind, submitted);

      let receipt;
      try {
        receipt = await readReceipt({ hash, transaction: expectedTransaction });
      } catch (error) {
        updateAttempt(record.kind, { ...submitted, state: 'uncertain_hashed', history: appendHistory(submitted, 'uncertain_hashed') });
        throw error;
      }
      const reverted = ['reverted', 0, '0x0'].includes(receipt?.status);
      const bindingMismatch = directTransactionBindingMismatch(receipt?.transaction, expectedTransaction);
      if (bindingMismatch) {
        updateAttempt(record.kind, { ...submitted, state: 'uncertain_hashed', history: appendHistory(submitted, 'uncertain_hashed') });
        const prefix = reverted ? 'Reverted receipt' : 'Receipt';
        throw new Error(`${prefix} transaction binding ${bindingMismatch}. Outcome remains unknown.`);
      }
      if (reverted) {
        updateAttempt(record.kind, { ...submitted, state: 'reverted', history: appendHistory(submitted, 'reverted') });
        throw new Error('Looper wallet transaction reverted on Base.');
      }
      let post;
      try {
        const postEvidence = await readSnapshot({
          selection: { ...boundSelection },
          expectedAccount: record.account,
          phase: 'receipt',
          transaction: expectedTransaction,
          receipt,
        });
        post = buildSnapshot(postEvidence, 'receipt', boundSelection);
        attributeReceipt({ record: submitted, receipt, post });
      } catch (error) {
        updateAttempt(record.kind, { ...submitted, state: 'uncertain_hashed', history: appendHistory(submitted, 'uncertain_hashed') });
        if (post && sameSelection(selection, boundSelection)) {
          acknowledgeReadiness[record.kind] = post;
          current = attachAttempts(blocked(post, 'receipt_attribution_failed'));
        }
        throw error;
      }

      updateAttempt(record.kind, {
        ...submitted,
        state: 'confirmed_attributed',
        attributable: true,
        history: appendHistory(submitted, 'confirmed_attributed'),
      });
      if (sameSelection(selection, boundSelection)) current = attachAttempts(post);
      return getSnapshot();
    });
  }

  function savePrepared(kind, transaction, evidence, extra = {}) {
    const account = kind === 'activation'
      ? deriveLooperAccount({ implementation: releasedImplementation, tokenId: selection.tokenId })
      : evidence.account;
    const id = `${kind}:${normalizeAttemptId(generateAttemptId())}`;
    if (attempts[kind]?.id === id) throw new Error('Looper wallet attempt ID collision.');
    const record = {
      version: 2,
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

  async function readAndRequireWritable(phase, expectedMode, activeSelection = selection, expectedAccount = null) {
    const evidence = await readSnapshot({ selection: { ...activeSelection }, expectedAccount, phase });
    const validated = buildSnapshot(evidence, phase, activeSelection);
    if (validated.mode !== expectedMode) {
      if (sameSelection(selection, activeSelection)) current = attachAttempts(validated);
      if (validated.reason === 'unsupported_wallet') throw new Error('Looper wallet writes require an EOA with empty Base code.');
      throw new Error(`Looper wallet is not ${expectedMode}; ${validated.reason ?? validated.mode}.`);
    }
    if (sameSelection(selection, activeSelection)) current = attachAttempts(validated);
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
      collectionRegistry: safeAddress(evidence.collectionRegistry),
      collectionImplementation: safeAddress(evidence.collectionImplementation),
      collectionSalt: String(evidence.collectionSalt ?? ''),
      legacyAccount: safeAddress(evidence.legacyAccount),
      legacyRegistryAccount: safeAddress(evidence.legacyRegistryAccount),
      registry: safeAddress(evidence.registry),
      salt: String(evidence.salt ?? ''),
      account: safeAddress(evidence.account),
      registryAccount: safeAddress(evidence.registryAccount),
      accountOwner: safeAddress(evidence.accountOwner),
      accountTokenChainId: String(evidence.accountTokenChainId ?? ''),
      accountTokenContract: safeAddress(evidence.accountTokenContract),
      accountTokenId: String(evidence.accountTokenId ?? ''),
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
      candidatePolicyModuleApproved: typeof evidence.candidatePolicyModuleApproved === 'boolean'
        ? evidence.candidatePolicyModuleApproved
        : null,
      candidatePolicyModuleCodehashMatches: typeof evidence.candidatePolicyModuleCodehashMatches === 'boolean'
        ? evidence.candidatePolicyModuleCodehashMatches
        : null,
    };
  }

  function buildSnapshot(evidence, phase, activeSelection = selection) {
    const base = evidenceToSnapshot(evidence, activeSelection);
    if (evidence.chainId !== BASE_CHAIN_ID) return blocked(base, 'wrong_chain');
    if (!sameAddress(evidence.owner, activeSelection.owner)) return blocked(base, 'owner_changed');

    const expectedLegacyAccount = deriveLooperAccount({
      implementation: LEGACY_ACCOUNT_IMPLEMENTATION,
      tokenId: activeSelection.tokenId,
    });
    if (!sameAddress(evidence.collectionRegistry, ERC6551_REGISTRY)
      || !sameAddress(evidence.collectionImplementation, LEGACY_ACCOUNT_IMPLEMENTATION)
      || evidence.collectionSalt !== ACCOUNT_SALT
      || !sameAddress(evidence.legacyAccount, expectedLegacyAccount)
      || !sameAddress(evidence.legacyRegistryAccount, expectedLegacyAccount)) {
      return blocked(base, 'config_drift', 'read_only');
    }
    if (!releasedImplementation || !releasedRuntimeHash || !releasedModuleRegistry || !releasedModuleRegistryRuntimeHash) {
      return blocked(base, 'release_unset', 'read_only');
    }
    const implementation = safeAddress(evidence.implementation);
    const derivedAccount = deriveLooperAccount({ implementation: releasedImplementation, tokenId: activeSelection.tokenId });
    if (!sameAddress(evidence.registry, ERC6551_REGISTRY)
      || evidence.salt !== ACCOUNT_SALT
      || !sameAddress(implementation, releasedImplementation)
      || !sameAddress(evidence.account, derivedAccount)
      || !sameAddress(evidence.registryAccount, derivedAccount)) {
      return blocked({ ...base, account: derivedAccount }, 'config_drift', 'read_only');
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

    const expectedAccountCode = buildLooperAccountRuntimeCode({ implementation, tokenId: activeSelection.tokenId });
    const accountHash = normalizeHash(evidence.accountRuntimeSha256);
    if (accountCode !== expectedAccountCode
      || accountHash !== sha256(accountCode)
      || evidence.accountCodeMatches !== true) {
      return blocked(recoveryBase, 'proxy_mismatch', 'read_only');
    }
    if (!sameAddress(evidence.accountOwner, activeSelection.owner)) {
      return blocked(recoveryBase, 'ownership_mismatch', 'read_only', 'ownership-mismatch');
    }
    if (String(evidence.accountTokenChainId ?? '') !== String(BASE_CHAIN_ID)
      || !sameAddress(evidence.accountTokenContract, LOOPERS_COLLECTION)
      || String(evidence.accountTokenId ?? '') !== activeSelection.tokenId) {
      return blocked(recoveryBase, 'binding_mismatch', 'read_only');
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
    if (!sameAddress(moduleOwner, activeSelection.owner)) {
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

  function evidenceToSnapshot(evidence = {}, activeSelection = selection) {
    return {
      tokenId: activeSelection.tokenId,
      owner: activeSelection.owner,
      account: safeAddress(evidence.account),
      legacyAccount: safeAddress(evidence.legacyAccount),
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
      policyModuleOwnerMatches: sameAddress(evidence.policyModuleOwner, activeSelection.owner),
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
      send: publicAttempt(attempts.send, acknowledgedUnknownSendHistory),
      policy: publicAttempt(attempts.policy),
    };
  }

  function updateAttempt(kind, record) {
    const validated = validateAttemptRecord(record, kind);
    if (!validated) throw new Error('Looper wallet attempt schema is invalid.');
    const scope = createOperationScope({
      tokenId: validated.tokenId,
      account: validated.account,
      owner: validated.owner,
      kind,
    });
    const encoded = JSON.stringify(validated);
    storage?.setItem?.(scope.storageKey, encoded);
    if (storage?.getItem?.(scope.storageKey) !== encoded) {
      throw new Error('Looper wallet attempt failed read-back verification.');
    }
    attempts[kind] = validated;
    if (selection && sameSelection(selection, validated)) current = attachAttempts(current);
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

  function clearAttempts() {
    for (const kind of ['activation', 'send', 'policy']) {
      attempts[kind] = null;
      acknowledgeReadiness[kind] = null;
    }
    acknowledgedUnknownSendHistory = [];
  }

  async function acknowledgeUnknown(kind) {
    if (!['activation', 'send', 'policy'].includes(kind)) throw new Error('Unknown Looper wallet attempt kind.');
    const record = attempts[kind];
    if (!record || !['uncertain_hashless', 'uncertain_hashed'].includes(record.state)) {
      throw new Error('No uncertain Looper wallet outcome is available to acknowledge.');
    }
    if (!locks || typeof locks.request !== 'function') {
      throw new Error('Web Locks are required before an unknown Looper wallet outcome can be acknowledged.');
    }
    const scope = createOperationScope({ tokenId: record.tokenId, account: record.account, owner: record.owner, kind });
    return locks.request(scope.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Another tab is already handling this Looper wallet operation.');
      const latest = loadAttempt(scope, kind);
      if (!latest || latest.id !== record.id || stableJson(latest) !== stableJson(record)) {
        throw new Error('The latest Looper wallet attempt changed before acknowledgment.');
      }
      const acknowledged = {
        ...record,
        state: 'acknowledged_unknown',
        history: appendHistory(record, 'acknowledged_unknown'),
      };
      if (kind === 'send') archiveAcknowledgedUnknownSend(acknowledged);
      updateAttempt(kind, acknowledged);
      const readiness = acknowledgeReadiness[kind];
      acknowledgeReadiness[kind] = null;
      if (readiness && sameSelection(selection, record)) current = attachAttempts(readiness);
      return getSnapshot();
    });
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

  function acknowledgedUnknownSendHistoryKey(account) {
    const scope = createOperationScope({
      tokenId: selection.tokenId,
      account,
      owner: selection.owner,
      kind: 'send',
    });
    return `${scope.storageKey}.acknowledgedUnknownHistory`;
  }

  function archiveAcknowledgedUnknownSend(record) {
    if (!record || record.kind !== 'send' || record.state !== 'acknowledged_unknown') {
      throw new Error('Only permanently acknowledged unknown sends can enter send history.');
    }
    if (acknowledgedUnknownSendHistory.some((entry) => entry.id === record.id)) return;
    const next = [...acknowledgedUnknownSendHistory, record];
    const key = acknowledgedUnknownSendHistoryKey(record.account);
    const encoded = JSON.stringify(next);
    storage?.setItem?.(key, encoded);
    if (storage?.getItem?.(key) !== encoded) {
      throw new Error('Permanent acknowledged-unknown send history failed read-back verification.');
    }
    acknowledgedUnknownSendHistory = next.map((entry) => deepFreeze(structuredClone(entry)));
    current = attachAttempts(current);
  }

  function loadAcknowledgedUnknownSendHistory(account) {
    const key = acknowledgedUnknownSendHistoryKey(account);
    const raw = storage?.getItem?.(key);
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Permanent acknowledged-unknown send history is corrupt.');
    }
    if (!Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Array.prototype) {
      throw new Error('Permanent acknowledged-unknown send history is malformed.');
    }
    const ids = new Set();
    return parsed.map((entry) => {
      const validated = validateAttemptRecord(entry, 'send');
      if (!validated
        || validated.state !== 'acknowledged_unknown'
        || validated.tokenId !== selection.tokenId
        || !sameAddress(validated.owner, selection.owner)
        || !sameAddress(validated.account, account)
        || ids.has(validated.id)) {
        throw new Error('Permanent acknowledged-unknown send history is malformed.');
      }
      ids.add(validated.id);
      return validated;
    });
  }

  async function restoreAttempts(account) {
    clearAttempts();
    if (!account) return;
    acknowledgedUnknownSendHistory = loadAcknowledgedUnknownSendHistory(account);
    for (const kind of ['activation', 'send', 'policy']) {
      const scope = createOperationScope({ tokenId: selection.tokenId, account, owner: selection.owner, kind });
      const restored = loadAttempt(scope, kind);
      if (!restored) continue;
      if (kind === 'send' && restored.state === 'acknowledged_unknown'
        && !acknowledgedUnknownSendHistory.some((entry) => entry.id === restored.id)) {
        archiveAcknowledgedUnknownSend(restored);
      }
      if (restored.state === 'prepared') {
        attempts[kind] = restored;
        invalidateAttempt(restored);
        continue;
      }
      if (restored.state === 'submitted') {
        attempts[kind] = restored;
        updateAttempt(kind, {
          ...restored,
          state: 'uncertain_hashed',
          history: appendHistory(restored, 'uncertain_hashed'),
        });
        continue;
      }
      if (restored.state === 'confirmed_attributed') {
        const verified = await verifyRestoredConfirmation(restored);
        const finalPersisted = loadAttempt(scope, kind);
        if (!verified || !finalPersisted || stableJson(finalPersisted) !== stableJson(restored)) {
          storage?.removeItem?.(scope.storageKey);
          continue;
        }
      }
      attempts[kind] = restored;
    }
  }

  async function verifyRestoredConfirmation(record) {
    try {
      const receipt = await readReceipt({ hash: record.txHash, transaction: record.transaction });
      const boundSelection = { tokenId: record.tokenId, owner: record.owner };
      const postEvidence = await readSnapshot({
        selection: boundSelection,
        expectedAccount: record.account,
        phase: 'receipt',
        transaction: record.transaction,
        receipt,
      });
      const post = buildSnapshot(postEvidence, 'receipt', boundSelection);
      attributeReceipt({ record, receipt, post });
      return true;
    } catch {
      return false;
    }
  }

  function loadAttempt(scope, kind) {
    try {
      const raw = storage?.getItem?.(scope.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const validated = validateAttemptRecord(parsed, kind);
      if (!validated
        || validated.tokenId !== selection.tokenId
        || !sameAddress(validated.owner, selection.owner)
        || !sameAddress(validated.account, scope.key.split(':')[3])) {
        storage?.removeItem?.(scope.storageKey);
        return null;
      }
      return validated;
    } catch {
      storage?.removeItem?.(scope.storageKey);
      return null;
    }
  }

  function validateAttemptRecord(record, expectedKind) {
    if (!isPlainObject(record) || record.version !== 2 || record.kind !== expectedKind) return null;
    if (!['activation', 'send', 'policy'].includes(record.kind)
      || !ATTEMPT_STATES.has(record.state)
      || typeof record.id !== 'string'
      || !new RegExp(`^${record.kind}:[A-Za-z0-9_-]{8,128}$`).test(record.id)
      || !canonicalUint(record.tokenId)
      || canonicalAddress(record.owner) !== record.owner
      || canonicalAddress(record.account) !== record.account
      || !canonicalUint(record.preState)
      || typeof record.attributable !== 'boolean'
      || record.attributable !== (record.state === 'confirmed_attributed')
      || !validateAttemptHistory(record.history)
      || record.history.at(-1).state !== record.state) return null;
    const hashPresent = Object.hasOwn(record, 'txHash');
    const hashRequired = ['submitted', 'confirmed_attributed', 'uncertain_hashed'].includes(record.state);
    const hashOptional = ['reverted', 'acknowledged_unknown'].includes(record.state);
    if ((hashRequired && !hashPresent) || (!hashRequired && !hashOptional && hashPresent)) return null;
    if (hashPresent && normalizeHash(record.txHash) !== record.txHash) return null;
    const expectedKeys = [
      'account', 'attributable', 'history', 'id', 'kind', 'owner', 'preState', 'semantic',
      'state', 'tokenId', 'transaction', 'version',
      ...(record.kind === 'policy' ? ['policyBaseline', 'targetPolicyModule'] : []),
      ...(hashPresent ? ['txHash'] : []),
    ];
    if (!hasExactKeys(record, expectedKeys)) return null;
    if (!validateAttemptSemantic(record)
      || !validateCanonicalTransaction(record.transaction)
      || (record.kind === 'policy' && !validatePolicyBaseline(record.policyBaseline))) return null;
    let expectedTransaction;
    try {
      expectedTransaction = reconstructAttemptTransaction(record, releasedImplementation, record.account);
    } catch {
      return null;
    }
    if (stableJson(record.transaction) !== stableJson(expectedTransaction)) return null;
    return deepFreeze(structuredClone(record));
  }

  function validateAttemptSemantic(record) {
    if (!isPlainObject(record.semantic)) return false;
    if (record.kind === 'activation') {
      return hasExactKeys(record.semantic, ['implementation'])
        && canonicalAddress(record.semantic.implementation) === record.semantic.implementation
        && sameAddress(record.semantic.implementation, releasedImplementation)
        && sameAddress(record.account, deriveLooperAccount({ implementation: record.semantic.implementation, tokenId: record.tokenId }));
    }
    if (record.kind === 'policy') {
      return hasExactKeys(record.semantic, ['module'])
        && canonicalAddress(record.semantic.module) === record.semantic.module
        && canonicalAddress(record.targetPolicyModule) === record.targetPolicyModule
        && sameAddress(record.semantic.module, record.targetPolicyModule);
    }
    if (record.semantic.asset === 'native') {
      return hasExactKeys(record.semantic, ['amount', 'asset', 'recipient'])
        && canonicalAddress(record.semantic.recipient) === record.semantic.recipient
        && canonicalPositiveUintOrNull(record.semantic.amount) !== null;
    }
    return record.semantic.asset === 'erc20'
      && hasExactKeys(record.semantic, ['amount', 'asset', 'recipient', 'token'])
      && canonicalAddress(record.semantic.token) === record.semantic.token
      && canonicalAddress(record.semantic.recipient) === record.semantic.recipient
      && canonicalPositiveUintOrNull(record.semantic.amount) !== null;
  }

  function validatePolicyBaseline(baseline) {
    const keys = [
      'account', 'accountCode', 'accountOwner', 'accountRuntimeSha256', 'accountCodeMatches',
      'accountTokenChainId', 'accountTokenContract', 'accountTokenId', 'approvedModuleCodehash',
      'candidateApprovedModuleCodehash', 'candidatePolicyModule', 'candidatePolicyModuleApproved',
      'candidatePolicyModuleCode', 'candidatePolicyModuleCodehash', 'candidatePolicyModuleCodehashMatches',
      'candidatePolicyModuleRuntimeSha256', 'chainId', 'collectionImplementation', 'collectionRegistry',
      'collectionSalt', 'implementation', 'implementationCode', 'implementationRuntimeSha256', 'legacyAccount',
      'legacyRegistryAccount', 'moduleRegistry', 'moduleRegistryCode', 'moduleRegistryRuntimeSha256',
      'owner', 'policyEpoch', 'policyModule', 'policyModuleApproved', 'policyModuleCode',
      'policyModuleCodehash', 'policyModuleCodehashMatches', 'policyModuleOwner', 'policyModuleRuntimeSha256',
      'registry', 'registryAccount', 'registryPaused', 'salt',
    ];
    if (!isPlainObject(baseline) || !hasExactKeys(baseline, keys) || baseline.chainId !== BASE_CHAIN_ID
      || baseline.salt !== ACCOUNT_SALT || baseline.collectionSalt !== ACCOUNT_SALT
      || !canonicalUint(baseline.policyEpoch) || !canonicalUint(baseline.accountTokenChainId)
      || !canonicalUint(baseline.accountTokenId)) return false;
    for (const key of ['owner', 'collectionRegistry', 'collectionImplementation', 'legacyAccount', 'legacyRegistryAccount',
      'registry', 'account', 'registryAccount', 'accountOwner', 'accountTokenContract', 'implementation',
      'moduleRegistry', 'policyModule', 'policyModuleOwner', 'candidatePolicyModule']) {
      if (baseline[key] !== null && canonicalAddress(baseline[key]) !== baseline[key]) return false;
    }
    for (const key of ['implementationCode', 'accountCode', 'moduleRegistryCode', 'policyModuleCode', 'candidatePolicyModuleCode']) {
      if (baseline[key] !== null && canonicalCodeOrNull(baseline[key], { allowEmpty: true }) !== baseline[key]) return false;
    }
    for (const key of ['implementationRuntimeSha256', 'accountRuntimeSha256', 'moduleRegistryRuntimeSha256', 'policyModuleRuntimeSha256', 'policyModuleCodehash', 'approvedModuleCodehash', 'candidatePolicyModuleRuntimeSha256', 'candidatePolicyModuleCodehash', 'candidateApprovedModuleCodehash']) {
      if (baseline[key] !== null && normalizeHash(baseline[key]) !== baseline[key]) return false;
    }
    if (!['accountCodeMatches', 'registryPaused', 'policyModuleApproved', 'policyModuleCodehashMatches']
      .every((key) => typeof baseline[key] === 'boolean')) return false;
    return ['candidatePolicyModuleApproved', 'candidatePolicyModuleCodehashMatches']
      .every((key) => baseline[key] === null || typeof baseline[key] === 'boolean');
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
    acknowledgeUnknown,
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

function sameSelection(left, right) {
  return Boolean(left && right
    && String(left.tokenId) === String(right.tokenId)
    && sameAddress(left.owner, right.owner));
}

function defaultAttemptId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure randomness is unavailable for Looper wallet attempt IDs.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function normalizeAttemptId(value) {
  const id = String(value ?? '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error('Looper wallet attempt ID is malformed.');
  return id;
}

function reconstructAttemptTransaction(record, releasedImplementation, evidenceAccount) {
  if (record.kind === 'activation') {
    if (!sameAddress(record.semantic?.implementation, releasedImplementation)) {
      throw new Error('Activation implementation drifted.');
    }
    const expectedAccount = deriveLooperAccount({ implementation: releasedImplementation, tokenId: record.tokenId });
    if (!sameAddress(record.account, expectedAccount) || !sameAddress(evidenceAccount, expectedAccount)) {
      throw new Error('Activation account drifted.');
    }
    return buildActivationTransaction({
      owner: record.owner,
      implementation: releasedImplementation,
      tokenId: record.tokenId,
    });
  }
  if (!sameAddress(record.account, evidenceAccount)) throw new Error('Looper account drifted.');
  if (record.kind === 'policy') {
    return buildPolicyModuleTransaction({
      owner: record.owner,
      account: record.account,
      module: record.semantic.module,
    });
  }
  if (record.semantic.asset === 'native') {
    return buildEthSendTransaction({
      owner: record.owner,
      account: record.account,
      recipient: record.semantic.recipient,
      amountWei: record.semantic.amount,
    });
  }
  return buildErc20SendTransaction({
    owner: record.owner,
    account: record.account,
    token: record.semantic.token,
    recipient: record.semantic.recipient,
    amountBaseUnits: record.semantic.amount,
  });
}

function validateCanonicalTransaction(transaction) {
  if (!isPlainObject(transaction)
    || !hasExactKeys(transaction, ['chainId', 'data', 'from', 'to', 'value'])
    || transaction.chainId !== '0x2105'
    || transaction.value !== '0x0'
    || canonicalAddress(transaction.from) !== transaction.from
    || canonicalAddress(transaction.to) !== transaction.to) return false;
  const data = String(transaction.data ?? '');
  return /^0x(?:[0-9a-f]{2})*$/.test(data);
}

function directTransactionBindingMismatch(observed, expected) {
  if (!isPlainObject(observed)) return 'is missing transaction-by-hash evidence';
  if (!hasExactKeys(observed, ['chainId', 'data', 'from', 'to', 'value'])) {
    return 'has a malformed direct envelope mismatch';
  }
  const labels = {
    chainId: 'chain scope',
    from: 'from',
    to: 'to',
    data: 'input',
    value: 'value',
  };
  const mismatches = Object.keys(labels).filter((key) => observed[key] !== expected[key]);
  return mismatches.length ? `has a ${mismatches.map((key) => labels[key]).join(', ')} mismatch` : null;
}

function validateAttemptHistory(history) {
  if (!Array.isArray(history) || history.length === 0 || history[0]?.state !== 'prepared') return false;
  const transitions = {
    prepared: new Set(['submitted', 'reverted', 'invalidated', 'uncertain_hashless']),
    submitted: new Set(['confirmed_attributed', 'reverted', 'uncertain_hashed']),
    uncertain_hashless: new Set(['acknowledged_unknown']),
    uncertain_hashed: new Set(['acknowledged_unknown']),
  };
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    if (!isPlainObject(entry)
      || !hasExactKeys(entry, ['at', 'state'])
      || !ATTEMPT_STATES.has(entry.state)
      || !Number.isSafeInteger(entry.at)
      || entry.at < 0) return false;
    if (index > 0 && !transitions[history[index - 1].state]?.has(entry.state)) return false;
  }
  return true;
}

function canonicalAddress(value) {
  try {
    const address = getAddress(value);
    return address === value ? address : null;
  } catch {
    return null;
  }
}

function canonicalPositiveUint(value, label) {
  const normalized = canonicalPositiveUintOrNull(value);
  if (normalized === null) throw new Error(`${label} must be a canonical positive integer.`);
  return normalized;
}

function canonicalPositiveUintOrNull(value) {
  const text = String(value ?? '');
  return /^[1-9]\d*$/.test(text) && BigInt(text) <= ((1n << 256n) - 1n) ? text : null;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype);
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

function publicAttempt(record, permanentHistory = null) {
  const result = record ? {
    state: record.state,
    txHash: record.txHash ?? null,
    attributable: Boolean(record.attributable),
    preparedId: record.state === 'prepared' ? record.id : null,
  } : idleAttempt();
  if (permanentHistory !== null) {
    result.permanentHistory = permanentHistory.map((entry) => ({
      id: entry.id,
      state: 'acknowledged_unknown',
      txHash: entry.txHash ?? null,
      acknowledgedAt: entry.history.at(-1).at,
      retryEligible: false,
    }));
  }
  return result;
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

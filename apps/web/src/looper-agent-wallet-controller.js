import { getAddress } from 'viem';

import {
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC6551_REGISTRY,
  LEGACY_ACCOUNT_IMPLEMENTATION,
  LOOPERS_COLLECTION,
  buildActivationTransaction,
  buildErc20SendTransaction,
  buildEthSendTransaction,
  createOperationScope,
  deriveLooperAccount,
  normalizeTokenId,
} from './looper-agent-wallet.js';

const EMPTY_CODE = '0x';
const TERMINAL_STATES = new Set(['confirmed_attributed', 'reverted', 'acknowledged_unknown']);

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
  let selection = null;
  let current = emptySnapshot();
  let attemptCounter = 0;
  const attempts = { activation: null, send: null };

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
    const evidence = await readSnapshot({ selection: { ...selection }, phase });
    current = buildSnapshot(evidence, phase);
    restoreAttempts(current.account ?? current.legacyAccount);
    current = attachAttempts(current);
    return getSnapshot();
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

  async function submitPrepared(preparedId, { confirmed = false } = {}) {
    if (!confirmed) throw new Error('Explicit transaction confirmation is required.');
    const record = Object.values(attempts).find((entry) => entry?.id === preparedId);
    if (!record || record.state !== 'prepared') throw new Error('No matching prepared attempt is available.');
    if (!locks || typeof locks.request !== 'function') {
      current = { ...current, mode: 'read_only', reason: 'locks_unavailable' };
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
      const persisted = loadAttempt(scope);
      if (!persisted || persisted.id !== preparedId || persisted.state !== 'prepared') {
        throw new Error('The prepared attempt changed in another tab.');
      }
      await readAndRequireWritable('pre_sign', record.kind === 'activation' ? 'inactive' : 'active');

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
        current = attachAttempts({ ...post, mode: 'blocked', reason: 'receipt_attribution_failed' });
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

  function savePrepared(kind, transaction, evidence) {
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

  function buildSnapshot(evidence, phase) {
    const base = evidenceToSnapshot(evidence);
    if (evidence.chainId !== BASE_CHAIN_ID) return { ...base, mode: 'blocked', reason: 'wrong_chain' };
    if (!sameAddress(evidence.owner, selection.owner)) return { ...base, mode: 'blocked', reason: 'owner_changed' };
    if (!sameAddress(evidence.registry, ERC6551_REGISTRY) || evidence.salt !== ACCOUNT_SALT) {
      return { ...base, mode: 'read_only', reason: 'config_drift' };
    }

    const implementation = safeAddress(evidence.implementation);
    if (!implementation) return { ...base, mode: 'read_only', reason: 'config_drift' };
    const derivedAccount = deriveLooperAccount({ implementation, tokenId: selection.tokenId });
    const accountAgreement = sameAddress(evidence.collectionAccount, derivedAccount)
      && sameAddress(evidence.registryAccount, derivedAccount);
    if (!accountAgreement) return { ...base, account: derivedAccount, mode: 'read_only', reason: 'config_drift' };

    if (sameAddress(implementation, LEGACY_ACCOUNT_IMPLEMENTATION)) {
      return { ...base, account: null, legacyAccount: derivedAccount, mode: 'legacy_read_only', reason: 'legacy_implementation' };
    }
    if (!releasedImplementation || !releasedRuntimeHash || !sameAddress(implementation, releasedImplementation)) {
      return { ...base, account: derivedAccount, mode: 'read_only', reason: 'config_drift' };
    }
    if (String(evidence.operatorCode ?? '').toLowerCase() !== EMPTY_CODE) {
      return { ...base, account: derivedAccount, mode: 'read_only', reason: 'unsupported_wallet' };
    }
    if (String(evidence.accountCode ?? '').toLowerCase() === EMPTY_CODE) {
      return { ...base, account: derivedAccount, mode: 'inactive', reason: null };
    }
    if (String(evidence.accountRuntimeSha256 ?? '').toLowerCase() !== releasedRuntimeHash) {
      return { ...base, account: derivedAccount, mode: 'blocked', reason: 'wrong_runtime' };
    }
    return { ...base, account: derivedAccount, mode: 'active', reason: null };
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
      nativeWei: canonicalDecimal(evidence.nativeWei ?? '0'),
      tokens: normalizeTokens(evidence.tokens),
      refreshedAt: String(evidence.refreshedAt ?? new Date(now()).toISOString()),
      activation: current.activation ?? idleAttempt(),
      send: current.send ?? idleAttempt(),
    };
  }

  function attachAttempts(snapshot) {
    return {
      ...snapshot,
      activation: publicAttempt(attempts.activation),
      send: publicAttempt(attempts.send),
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

  function restoreAttempts(account) {
    if (!account) return;
    for (const kind of ['activation', 'send']) {
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
      current = { ...current, mode: 'blocked', reason: 'corrupt_store' };
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
    nativeWei: '0',
    tokens: [],
    refreshedAt: null,
    activation: idleAttempt(),
    send: idleAttempt(),
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

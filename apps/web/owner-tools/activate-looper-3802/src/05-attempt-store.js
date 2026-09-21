'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const STATES = ns.deepFreeze(['prepared','submitted','uncertain_hashless','uncertain_hashed','confirmed_attributed','observed_unattributed','reverted','superseded','retry_cancelled']);
  const REASONS = ns.deepFreeze(['activate','provider_hash','provider_rejected_retry','provider_ambiguous','reload_prepared','receipt_attributed','state_observed_unattributed','receipt_reverted','receipt_timeout','confirmation_timeout','canonicality_lost','evidence_incomplete','retry_superseded','late_original_observed']);
  const PURPOSES = ns.deepFreeze(['activate','retry','resume','acknowledge']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const ADDRESS = /^0x[0-9a-f]{40}$/u;
  const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const STORE_KEYS = ['schema','version','revision','chainId','tokenId','activeAttemptId','lease','attempts'];
  const ATTEMPT_KEYS = ['id','retryOrdinal','state','createdAtMs','updatedAtMs','waitUntilMs','acknowledgedAtMs','walletGeneration','supersedesId','supersededById','txHash','receipt','observation','pinset','transaction','preflight','history'];
  const LEASE_KEYS = ['lockName','ownerTabId','leaseId','purpose','acquiredAtMs','heartbeatAtMs','expiresAtMs'];
  const PIN_KEYS = ['sponsor','holder','account','loopers','registry','accountImplementation','salt','adapter','identityRegistry','identityId','sponsorDelegate','sponsorImplementation','entryPoint','calldataHash'];
  const TX_KEYS = ['chainId','from','to','data','value'];
  const PREFLIGHT_KEYS = ['blockNumber','blockHash','estimatedGas','gasPrice','accountCode','accountBalance','loopersImplementationSlot','adapterImplementationSlot','identityImplementationSlot','sponsorDesignator','sponsorImplementationSlot','adapterIdentityRegistryResult','adapterBindingResult','adapterControllerResult','identityOwnerResult','identityTokenURIResult','sponsorImplementationResult','sponsorEntryPointResult','simulationResult'];
  const HISTORY_KEYS = ['from','to','atMs','reason'];
  const RECEIPT_KEYS = ['blockNumber','blockHash','discoveredAtMs','confirmationDeadlineMs','registryLog'];
  const LOG_KEYS = ['receiptArrayIndex','logIndex','address','topics','data'];
  const OBS_KEYS = ['blockNumber','blockHash','observedAtMs'];

  function exactKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} has unknown or missing keys.`);
  }
  function integer(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a safe nonnegative integer.`); }
  function uuid(value, label) { if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${label} must be a UUID.`); }
  function nullableUuid(value, label) { if (value !== null) uuid(value, label); }
  function address(value, label) { if (typeof value !== 'string' || !ADDRESS.test(value)) throw new Error(`${label} must be a lowercase address.`); }
  function quantity(value, label) { if (typeof value !== 'string' || !QUANTITY.test(value)) throw new Error(`${label} must be a canonical quantity.`); }
  function bytes(value, label) { if (typeof value !== 'string' || !BYTES.test(value)) throw new Error(`${label} must be lowercase bytes.`); }
  function hash(value, label) { if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`${label} must be lowercase bytes32.`); }
  function nullableHash(value, label) { if (value !== null) hash(value, label); }

  function expectedPinset() {
    const p = ns.PINSET;
    return {
      sponsor: p.identities.sponsor.address.toLowerCase(), holder: p.holder.toLowerCase(), account: p.account.toLowerCase(), loopers: p.identities.loopers.address.toLowerCase(),
      registry: p.identities.registry.address.toLowerCase(), accountImplementation: p.identities.accountImplementation.address.toLowerCase(), salt: p.salt,
      adapter: p.identities.adapter.address.toLowerCase(), identityRegistry: p.identities.identityRegistry.address.toLowerCase(), identityId: p.identityId,
      sponsorDelegate: p.identities.sponsorDelegate.address.toLowerCase(), sponsorImplementation: p.identities.sponsorImplementation.address.toLowerCase(),
      entryPoint: p.identities.entryPoint.address.toLowerCase(), calldataHash: ns.EXACT_CALLDATA_HASH,
    };
  }
  function expectedTransaction() {
    return { chainId: ns.PINSET.chainIdHex, from: ns.EXACT_TRANSACTION.from.toLowerCase(), to: ns.EXACT_TRANSACTION.to.toLowerCase(), data: ns.EXACT_TRANSACTION.data, value: '0x0' };
  }
  function exactFixedObject(value, expected, label) {
    exactKeys(value, Object.keys(expected), label);
    for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) throw new Error(`${label}.${key} mismatch.`);
  }

  function validateLease(value) {
    if (value === null) return;
    exactKeys(value, LEASE_KEYS, 'lease');
    if (value.lockName !== ns.PINSET.lockName || !PURPOSES.includes(value.purpose)) throw new Error('Invalid lease identity or purpose.');
    uuid(value.ownerTabId, 'lease.ownerTabId'); uuid(value.leaseId, 'lease.leaseId');
    integer(value.acquiredAtMs, 'lease.acquiredAtMs'); integer(value.heartbeatAtMs, 'lease.heartbeatAtMs'); integer(value.expiresAtMs, 'lease.expiresAtMs');
    if (value.heartbeatAtMs < value.acquiredAtMs || value.expiresAtMs !== value.heartbeatAtMs + 30000) throw new Error('Invalid lease timing.');
  }
  function validateReceipt(value) {
    if (value === null) return;
    exactKeys(value, RECEIPT_KEYS, 'receipt'); integer(value.blockNumber, 'receipt.blockNumber'); hash(value.blockHash, 'receipt.blockHash'); integer(value.discoveredAtMs, 'receipt.discoveredAtMs'); integer(value.confirmationDeadlineMs, 'receipt.confirmationDeadlineMs');
    if (value.confirmationDeadlineMs !== value.discoveredAtMs + 120000) throw new Error('Invalid confirmation deadline.');
    if (value.registryLog !== null) {
      exactKeys(value.registryLog, LOG_KEYS, 'registryLog'); integer(value.registryLog.receiptArrayIndex, 'registryLog.receiptArrayIndex'); quantity(value.registryLog.logIndex, 'registryLog.logIndex'); address(value.registryLog.address, 'registryLog.address');
      if (value.registryLog.address !== ns.PINSET.identities.registry.address.toLowerCase()) throw new Error('registryLog address mismatch.');
      if (!Array.isArray(value.registryLog.topics) || value.registryLog.topics.length !== 4) throw new Error('registryLog.topics must contain the exact event topics.'); value.registryLog.topics.forEach((topic, index) => hash(topic, `registryLog.topics[${index}]`)); if (value.registryLog.topics[0] !== ns.TOPICS.erc6551AccountCreated) throw new Error('registryLog event topic mismatch.'); bytes(value.registryLog.data, 'registryLog.data'); if (value.registryLog.data.length !== 2 + 96 * 2) throw new Error('registryLog data length mismatch.');
      const dataWord = (index) => `0x${value.registryLog.data.slice(2 + index * 64, 66 + index * 64)}`;
      if (ns.decodeAddress(value.registryLog.topics[1]) !== ns.PINSET.identities.accountImplementation.address.toLowerCase()
        || ns.decodeAddress(value.registryLog.topics[2]) !== ns.PINSET.identities.loopers.address.toLowerCase()
        || ns.decodeUint256(value.registryLog.topics[3]) !== BigInt(ns.PINSET.tokenId)
        || ns.decodeAddress(dataWord(0)) !== ns.PINSET.account.toLowerCase()
        || dataWord(1) !== ns.PINSET.salt
        || ns.decodeUint256(dataWord(2)) !== BigInt(ns.PINSET.chainId)) throw new Error('registryLog pinned event values mismatch.');
    }
  }
  function validateObservation(value) { if (value === null) return; exactKeys(value, OBS_KEYS, 'observation'); integer(value.blockNumber, 'observation.blockNumber'); hash(value.blockHash, 'observation.blockHash'); integer(value.observedAtMs, 'observation.observedAtMs'); }
  function validatePreflight(value) {
    exactKeys(value, PREFLIGHT_KEYS, 'preflight'); integer(value.blockNumber, 'preflight.blockNumber'); hash(value.blockHash, 'preflight.blockHash'); quantity(value.estimatedGas, 'preflight.estimatedGas'); quantity(value.gasPrice, 'preflight.gasPrice');
    bytes(value.accountCode, 'preflight.accountCode'); quantity(value.accountBalance, 'preflight.accountBalance');
    for (const key of PREFLIGHT_KEYS.slice(6)) bytes(value[key], `preflight.${key}`);
    if (value.accountCode !== '0x' || value.accountBalance !== '0x0') throw new Error('Prepared preflight account was not undeployed and zero balance.');
    const expected = {
      loopersImplementationSlot: ns.PINSET.identities.loopers.implementationSlot,
      adapterImplementationSlot: ns.PINSET.identities.adapter.implementationSlot,
      identityImplementationSlot: ns.PINSET.identities.identityRegistry.implementationSlot,
      sponsorDesignator: ns.PINSET.sponsorDesignator,
      sponsorImplementationSlot: ns.PINSET.identities.sponsor.implementationSlot,
      adapterIdentityRegistryResult: ns.CALLS.adapterIdentityRegistry.result,
      adapterBindingResult: ns.CALLS.adapterBinding.result,
      adapterControllerResult: ns.CALLS.adapterController.result,
      identityOwnerResult: ns.CALLS.identityOwner.result,
      identityTokenURIResult: ns.CALLS.identityTokenUri.result,
      sponsorImplementationResult: ns.CALLS.sponsorImplementation.result,
      sponsorEntryPointResult: ns.CALLS.sponsorEntryPoint.result,
      simulationResult: `0x${ns.addressWord(ns.PINSET.account)}`,
    };
    for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) throw new Error(`preflight.${key} mismatch.`);
    if (ns.parseQuantity(value.estimatedGas) > BigInt(ns.PINSET.gasCap)) throw new Error('preflight estimate exceeds gas cap.');
  }
  function legalEdge(from, to, reason, retryOrdinal) {
    if (from === null) return to === 'prepared' && reason === 'activate';
    if (from === 'prepared' && to === 'submitted' && reason === 'provider_hash') return true;
    if (from === 'prepared' && to === 'retry_cancelled' && reason === 'provider_rejected_retry') return retryOrdinal === 1;
    if (from === 'prepared' && to === 'uncertain_hashless' && ['provider_ambiguous','reload_prepared'].includes(reason)) return true;
    if (['submitted','uncertain_hashed'].includes(from) && to === 'confirmed_attributed' && reason === 'receipt_attributed') return true;
    if (['submitted','uncertain_hashed','uncertain_hashless'].includes(from) && to === 'observed_unattributed' && reason === 'state_observed_unattributed') return true;
    if (['submitted','uncertain_hashed'].includes(from) && to === 'reverted' && reason === 'receipt_reverted') return true;
    if (from === 'submitted' && to === 'uncertain_hashed' && ['receipt_timeout','confirmation_timeout','canonicality_lost','evidence_incomplete'].includes(reason)) return true;
    if (from === 'uncertain_hashless' && to === 'superseded' && reason === 'retry_superseded') return retryOrdinal === 0;
    if (['confirmed_attributed','reverted'].includes(from) && to === 'uncertain_hashed' && ['canonicality_lost','evidence_incomplete'].includes(reason)) return true;
    if (from === 'observed_unattributed' && ['uncertain_hashed','uncertain_hashless'].includes(to) && ['canonicality_lost','evidence_incomplete'].includes(reason)) return true;
    if (retryOrdinal === 1 && ['reverted','retry_cancelled'].includes(from) && to === 'observed_unattributed' && reason === 'late_original_observed') return true;
    return false;
  }
  function validateHistory(value, state, retryOrdinal, createdAtMs) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error('history length is invalid.');
    let previous = null; let previousAtMs = null;
    value.forEach((item, index) => {
      exactKeys(item, HISTORY_KEYS, `history[${index}]`);
      if (item.from !== previous || (item.from !== null && !STATES.includes(item.from)) || !STATES.includes(item.to) || !REASONS.includes(item.reason) || !legalEdge(item.from, item.to, item.reason, retryOrdinal)) throw new Error('history is not contiguous or legal.');
      integer(item.atMs, 'history.atMs');
      if ((index === 0 && item.atMs !== createdAtMs) || (previousAtMs !== null && item.atMs < previousAtMs)) throw new Error('history timestamps are invalid.');
      previous = item.to; previousAtMs = item.atMs;
    });
    if (previous !== state) throw new Error('history does not match state.');
    return previousAtMs;
  }
  function validateAttempt(value) {
    exactKeys(value, ATTEMPT_KEYS, 'attempt'); uuid(value.id, 'attempt.id'); if (value.retryOrdinal !== 0 && value.retryOrdinal !== 1) throw new Error('Invalid retry ordinal.'); if (!STATES.includes(value.state)) throw new Error('Invalid state.');
    integer(value.createdAtMs, 'createdAtMs'); integer(value.updatedAtMs, 'updatedAtMs'); integer(value.waitUntilMs, 'waitUntilMs'); integer(value.walletGeneration, 'walletGeneration'); if (value.updatedAtMs < value.createdAtMs || value.waitUntilMs !== value.createdAtMs + 600000) throw new Error('Invalid attempt timing.');
    if (value.acknowledgedAtMs !== null) integer(value.acknowledgedAtMs, 'acknowledgedAtMs'); nullableUuid(value.supersedesId, 'supersedesId'); nullableUuid(value.supersededById, 'supersededById'); nullableHash(value.txHash, 'txHash'); validateReceipt(value.receipt); validateObservation(value.observation);
    exactFixedObject(value.pinset, expectedPinset(), 'pinset'); exactFixedObject(value.transaction, expectedTransaction(), 'transaction'); validatePreflight(value.preflight); const lastTransitionAtMs = validateHistory(value.history, value.state, value.retryOrdinal, value.createdAtMs);
    if (value.updatedAtMs < lastTransitionAtMs || (value.acknowledgedAtMs === null && value.updatedAtMs !== lastTransitionAtMs)) throw new Error('Attempt updatedAtMs does not match durable history.');
    if (['prepared','uncertain_hashless','superseded','retry_cancelled'].includes(value.state) && value.txHash !== null) throw new Error('Hashless state may not retain txHash.');
    if (['submitted','uncertain_hashed','confirmed_attributed','reverted'].includes(value.state) && value.txHash === null) throw new Error('Hashed state requires txHash.');
    if (['prepared','uncertain_hashless','superseded','retry_cancelled'].includes(value.state) && (value.receipt !== null || value.observation !== null)) throw new Error('Hashless state evidence mismatch.');
    if (value.state !== 'observed_unattributed' && value.observation !== null) throw new Error('Only observed_unattributed may retain an observation.');
    if (value.state === 'confirmed_attributed' && (!value.receipt?.registryLog || value.observation !== null)) throw new Error('Attributed state requires registry log only.');
    if (value.state === 'observed_unattributed' && (value.observation === null || value.receipt?.registryLog)) throw new Error('Observed state requires only unattributed observation evidence.');
    if (value.state === 'reverted' && (value.receipt === null || value.receipt.registryLog !== null)) throw new Error('Reverted state requires an unattributed receipt.');
    if (['submitted','uncertain_hashed'].includes(value.state) && value.receipt?.registryLog) throw new Error('Uncertain/submitted state cannot retain attributed registry evidence.');
    if (value.state === 'superseded' && (value.retryOrdinal !== 0 || value.supersededById === null)) throw new Error('Superseded original requires retry link.');
    if (value.state !== 'superseded' && value.supersededById !== null) throw new Error('Only a superseded original may name supersededById.');
    const acknowledgedAllowed = ['confirmed_attributed','observed_unattributed','retry_cancelled'].includes(value.state) || (value.retryOrdinal === 1 && value.state === 'reverted');
    if (value.acknowledgedAtMs !== null && (!acknowledgedAllowed || value.acknowledgedAtMs < lastTransitionAtMs || value.updatedAtMs !== value.acknowledgedAtMs)) throw new Error('Attempt acknowledgement is not eligible or timestamped correctly.');
    return value;
  }
  function validateStore(value) {
    exactKeys(value, STORE_KEYS, 'store');
    if (value.schema !== 'loopers.walletActivation' || value.version !== 1 || value.chainId !== ns.PINSET.chainId || value.tokenId !== ns.PINSET.tokenId) throw new Error('Store identity mismatch.');
    integer(value.revision, 'revision'); if (value.revision < 1) throw new Error('Revision must start at 1.'); nullableUuid(value.activeAttemptId, 'activeAttemptId'); validateLease(value.lease);
    if (!Array.isArray(value.attempts) || value.attempts.length > 2) throw new Error('Invalid attempt count.'); value.attempts.forEach(validateAttempt);
    if (new Set(value.attempts.map((attempt) => attempt.id)).size !== value.attempts.length) throw new Error('Duplicate attempt IDs.');
    if (value.attempts.length === 0) { if (value.activeAttemptId !== null || value.lease?.purpose !== 'activate' || value.revision !== 1) throw new Error('Empty store is valid only for a fresh revision-1 Activate lease.'); }
    else if (value.attempts.filter((attempt) => attempt.id === value.activeAttemptId).length !== 1) throw new Error('activeAttemptId mismatch.');
    if (value.attempts.length === 1) {
      const only = value.attempts[0];
      if (only.retryOrdinal !== 0 || only.supersedesId !== null || only.supersededById !== null || only.state === 'superseded') throw new Error('A lone attempt must be an unsuperseded original.');
    }
    if (value.attempts.length === 2) {
      const original = value.attempts.find((attempt) => attempt.retryOrdinal === 0); const retry = value.attempts.find((attempt) => attempt.retryOrdinal === 1);
      if (!original || !retry || original.state !== 'superseded' || original.supersedesId !== null || original.supersededById !== retry.id || retry.supersedesId !== original.id || retry.supersededById !== null || value.activeAttemptId !== retry.id) throw new Error('Broken supersession links or active attempt.');
    }
    return ns.deepFreeze(value);
  }
  function parseStore(raw) { if (raw === null) return null; let value; try { value = JSON.parse(raw); } catch { throw new Error('Activation attempt storage is corrupt.'); } return validateStore(value); }
  function canonical(value) { return JSON.stringify(value); }

  function createAttemptStore(storage, onInvalidate = () => {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw new TypeError('Storage-like dependency required.');
    function read() { return parseStore(storage.getItem(ns.PINSET.storageKey)); }
    function writeNext(previous, next) {
      if (previous === null) { if (next.revision !== 1) throw new Error('Initial revision must be 1.'); }
      else if (next.revision !== previous.revision + 1) throw new Error('Revision must increment exactly once.');
      const validated = validateStore(next); const serialized = canonical(validated); storage.setItem(ns.PINSET.storageKey, serialized); const readBack = storage.getItem(ns.PINSET.storageKey); if (readBack !== serialized) throw new Error('Activation store read-back mismatch.'); return parseStore(readBack);
    }
    function mutate(mutator) { const previous = read(); const draft = mutator(previous); if (!draft || typeof draft !== 'object') throw new Error('Mutation must return a complete store.'); return writeNext(previous, draft); }
    function removeValidated(predicate, label) { const current = read(); if (!current || !predicate(current)) throw new Error(`${label} precondition failed.`); storage.removeItem(ns.PINSET.storageKey); if (storage.getItem(ns.PINSET.storageKey) !== null) throw new Error('Activation store deletion read-back mismatch.'); return null; }
    function abandonFreshLease(ownerTabId, leaseId) { return removeValidated((store) => store.attempts.length === 0 && store.lease?.ownerTabId === ownerTabId && store.lease?.leaseId === leaseId, 'Fresh lease abandonment'); }
    function rejectOriginalPrepared4001(ownerTabId, leaseId) { return removeValidated((store) => store.attempts.length === 1 && store.attempts[0].retryOrdinal === 0 && store.attempts[0].state === 'prepared' && store.lease?.ownerTabId === ownerTabId && store.lease?.leaseId === leaseId, 'Original rejection'); }
    function acknowledgeIsolatedOriginalRevert() { return removeValidated((store) => store.attempts.length === 1 && store.attempts[0].retryOrdinal === 0 && store.attempts[0].state === 'reverted' && store.attempts[0].supersedesId === null && store.attempts[0].supersededById === null && store.attempts[0].receipt !== null, 'Revert acknowledgement'); }
    function handleStorageEvent(event) { if (event?.key === ns.PINSET.storageKey) onInvalidate(); }
    return ns.deepFreeze({ read, mutate, abandonFreshLease, rejectOriginalPrepared4001, acknowledgeIsolatedOriginalRevert, handleStorageEvent, validateStore });
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ ATTEMPT_STATES: STATES, ATTEMPT_REASONS: REASONS, validateStoreV1: validateStore, createAttemptStore, expectedAttemptPinset: expectedPinset, expectedAttemptTransaction: expectedTransaction }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const lowerTx = () => ({ chainId: ns.EXACT_TRANSACTION.chainId, from: ns.EXACT_TRANSACTION.from.toLowerCase(), to: ns.EXACT_TRANSACTION.to.toLowerCase(), data: ns.EXACT_TRANSACTION.data, value: '0x0' });
  const attemptPinset = () => ns.expectedAttemptPinset();
  const GAS_PRICE_REQUEST = Object.freeze({ kind: 'gasPrice' });

  function makeAttempt({ id, nowMs, walletGeneration, validated, retryOrdinal = 0, supersedesId = null }) {
    return {
      id, retryOrdinal, state: 'prepared', createdAtMs: nowMs, updatedAtMs: nowMs, waitUntilMs: nowMs + 600000, acknowledgedAtMs: null,
      walletGeneration, supersedesId, supersededById: null, txHash: null, receipt: null, observation: null, pinset: attemptPinset(), transaction: lowerTx(), preflight: validated.preflight,
      history: [{ from: null, to: 'prepared', atMs: nowMs, reason: 'activate' }],
    };
  }
  function transitionAttempt(attempt, to, reason, atMs, patch = {}) {
    if (attempt.history.length >= 20) throw new Error('Attempt history limit reached.');
    return { ...attempt, ...patch, state: to, updatedAtMs: atMs, history: [...attempt.history, { from: attempt.state, to, atMs, reason }] };
  }
  function persistPreparedAndInvoke(context, wallet, preparedDraft) {
    const stored = context.mutate((latest) => {
      if (!latest || latest.attempts.length !== 0 || latest.activeAttemptId !== null) throw new Error('Fresh activation precondition changed.');
      return { ...latest, activeAttemptId: preparedDraft.id, attempts: [preparedDraft] };
    });
    const sendPromise = wallet.sendPinnedActivation();
    return Object.freeze({ stored, sendPromise });
  }
  function persistRetryAndInvoke(context, wallet, originalId, retryDraft) {
    const stored = context.mutate((latest) => {
      const original = latest?.attempts.find((attempt) => attempt.id === originalId);
      if (!original || original.state !== 'uncertain_hashless' || original.retryOrdinal !== 0 || original.txHash !== null || retryDraft.createdAtMs < original.waitUntilMs || latest.attempts.length !== 1) throw new Error('Retry is not eligible.');
      const superseded = transitionAttempt(original, 'superseded', 'retry_superseded', retryDraft.createdAtMs, { supersededById: retryDraft.id });
      const retry = { ...retryDraft, supersedesId: original.id };
      return { ...latest, activeAttemptId: retry.id, attempts: [superseded, retry] };
    });
    const sendPromise = wallet.sendPinnedActivation();
    return Object.freeze({ stored, sendPromise });
  }

  function deriveControls({ busy, walletReady, preflight, store, locksAvailable, trustBlocked = false, nowMs = 0 }) {
    const active = store?.attempts.find((attempt) => attempt.id === store.activeAttemptId) || null;
    const terminal = active && active.acknowledgedAtMs === null && ['confirmed_attributed','observed_unattributed','reverted','retry_cancelled'].includes(active.state);
    const resumable = active && ['submitted','uncertain_hashless','uncertain_hashed','superseded','confirmed_attributed','observed_unattributed','reverted','retry_cancelled'].includes(active.state);
    const retryable = active?.state === 'uncertain_hashless' && active.retryOrdinal === 0 && active.txHash === null && nowMs >= active.waitUntilMs && store.attempts.length === 1;
    return ns.deepFreeze({
      connect: { visible: true, disabled: busy },
      activate: { visible: true, disabled: busy || !locksAvailable || trustBlocked || !walletReady || !preflight?.sendReady || Boolean(store) },
      resume: { visible: Boolean(resumable), disabled: busy || !locksAvailable },
      retry: { visible: Boolean(retryable), disabled: busy || !locksAvailable || trustBlocked },
      acknowledge: { visible: Boolean(terminal), disabled: busy || !locksAvailable || trustBlocked },
    });
  }
  function createRenderer(document) {
    const get = (id) => { const node = document.getElementById(id); if (!node) throw new Error(`Missing #${id}.`); return node; };
    const elements = { page: get('page-state'), network: get('network'), wallet: get('connected-wallet'), deployment: get('account-deployment-state'), balance: get('account-balance'), controller: get('identity-controller-status'), gas: get('estimated-gas'), fee: get('estimated-fee'), status: get('status'), transaction: get('transaction'), connect: get('connect'), activate: get('activate'), resume: get('resume'), retry: get('retry'), acknowledge: get('acknowledge') };
    function render(view) {
      elements.page.dataset.busy = String(Boolean(view.busy)); elements.network.textContent = view.wallet?.chainId === ns.PINSET.chainIdHex ? 'Base mainnet (8453)' : (view.wallet?.chainId || 'Wallet unavailable'); elements.wallet.textContent = view.wallet?.account || 'Not connected';
      elements.deployment.textContent = view.preflight?.accountState || 'Not checked'; elements.balance.textContent = view.preflight?.accountBalance || 'Not checked'; elements.controller.textContent = view.preflight ? 'Pinned holder is controller' : 'Not checked'; elements.gas.textContent = view.preflight?.estimatedGas || 'Not checked'; elements.fee.textContent = view.preflight ? `${view.preflight.estimatedFeeWei} wei (nonbinding)` : 'Not checked'; elements.status.textContent = String(view.status || '').slice(0, 600);
      if (view.txHash && HASH.test(view.txHash)) { const link = document.createElement('a'); link.href = `https://basescan.org/tx/${view.txHash}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = view.txHash; elements.transaction.replaceChildren(link); } else elements.transaction.textContent = 'No transaction submitted.';
      for (const id of ['connect','activate','resume','retry','acknowledge']) { const control = view.controls[id]; elements[id].hidden = !control.visible; elements[id].disabled = control.disabled; }
    }
    return ns.deepFreeze({ elements, render });
  }

  function createController({ transport, wallet, store, coordinator, renderer, crypto, now }) {
    let busy = false; let refreshVersion = 0; let walletGeneration = 0; let preflight = null; let walletState = { chainId: null, account: null }; let durable = null; let durableTrustBlocked = false; let status = 'Verifying pinned production state...';
    const terminalStates = new Set(['confirmed_attributed','observed_unattributed','reverted','retry_cancelled']);
    function activeAttempt(value = durable) { return value?.attempts.find((attempt) => attempt.id === value.activeAttemptId) || null; }
    function view(txHash = null) { const walletReady = walletState.chainId === ns.PINSET.chainIdHex && walletState.account?.toLowerCase() === ns.PINSET.identities.sponsor.address.toLowerCase(); return { busy, wallet: walletState, preflight, store: durable, txHash, status, controls: deriveControls({ busy, walletReady, preflight, store: durable, locksAvailable: coordinator.available, trustBlocked: durableTrustBlocked, nowMs: now() }) }; }
    function draw(txHash = null) { renderer.render(view(txHash)); }
    function requests(plan) { return plan.map(({ request }) => request); }
    async function readPreflight() { const anchor = await transport.anchorCanonicalHead(); const [stateEvidence, gasPrice] = await Promise.all([transport.stateBatch(anchor, requests(ns.PREFLIGHT_PLAN)), transport.readNonState(GAS_PRICE_REQUEST)]); const currentWallet = await wallet.readState(); const validated = await ns.validatePreflight({ ...stateEvidence, gasPrice }, currentWallet); return { validated, currentWallet }; }
    async function readValidatedState(anchor, plan, validator) { return validator(await transport.stateBatch(anchor, requests(plan))); }
    function mutateAttempt(context, id, to, reason, patch = {}) {
      const atMs = now();
      return context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === id ? transitionAttempt(attempt, to, reason, atMs, patch) : attempt) }));
    }
    function essentialPair(evidence, hash) {
      const transaction = evidence?.mainnet?.transaction?.result; const receipt = evidence?.mainnet?.receipt?.result;
      const drpcTransaction = evidence?.drpc?.transaction?.result; const drpcReceipt = evidence?.drpc?.receipt?.result;
      if (!transaction || !receipt || !drpcTransaction || !drpcReceipt) return null;
      const same = transaction.hash?.toLowerCase() === hash && drpcTransaction.hash?.toLowerCase() === hash
        && receipt.transactionHash?.toLowerCase() === hash && drpcReceipt.transactionHash?.toLowerCase() === hash
        && transaction.blockNumber === receipt.blockNumber && transaction.blockHash === receipt.blockHash && transaction.transactionIndex === receipt.transactionIndex
        && JSON.stringify(transaction) === JSON.stringify(drpcTransaction) && JSON.stringify(receipt) === JSON.stringify(drpcReceipt);
      return same ? { transaction, receipt } : null;
    }
    function markHashedUncertain(context, attempt, reason) {
      if (attempt.state === 'uncertain_hashed') return;
      if (attempt.state === 'submitted' || ['confirmed_attributed','observed_unattributed','reverted'].includes(attempt.state)) {
        const receipt = attempt.receipt ? { ...attempt.receipt, registryLog: null } : null;
        const transitionReason = attempt.state === 'submitted' ? reason : (reason === 'evidence_incomplete' ? reason : 'canonicality_lost');
        mutateAttempt(context, attempt.id, 'uncertain_hashed', transitionReason, { receipt, observation: null });
      }
    }
    function persistDiscoveredReceipt(context, attemptId, receipt, discoveredAtMs) {
      const persisted = { blockNumber: Number(ns.parseQuantity(receipt.blockNumber)), blockHash: receipt.blockHash, discoveredAtMs, confirmationDeadlineMs: discoveredAtMs + 120000, registryLog: null };
      context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === attemptId ? { ...attempt, receipt: persisted } : attempt) }));
      return persisted;
    }
    function headsConfirmed(evidence, receiptBlockNumber) {
      return Array.isArray(evidence?.heads) && evidence.heads.length === 3 && evidence.heads.every((head) => {
        const result = head?.result;
        return result && ns.parseQuantity(result.number) >= receiptBlockNumber + 2n;
      });
    }
    async function discoverAndConfirm(context, attempt) {
      let persisted = attempt.receipt; let pair = null;
      if (!persisted) {
        for await (const evidence of transport.pollTransactionReceipt({ hash: attempt.txHash, createdAtMs: attempt.createdAtMs })) {
          pair = essentialPair(evidence, attempt.txHash);
          if (pair) { persisted = persistDiscoveredReceipt(context, attempt.id, pair.receipt, now()); break; }
        }
      }
      let finalEvidence;
      try { finalEvidence = await transport.finalReceiptQuorum(attempt.txHash); } catch { finalEvidence = null; }
      const finalPair = essentialPair(finalEvidence, attempt.txHash);
      const publicReceipt = finalEvidence?.publicNodeReceipt?.result;
      if (finalPair && publicReceipt?.transactionHash?.toLowerCase() === attempt.txHash && JSON.stringify(publicReceipt) === JSON.stringify(finalPair.receipt)) pair = finalPair;
      else if (finalEvidence) pair = null;
      if (!pair) { markHashedUncertain(context, attempt, 'receipt_timeout'); return null; }
      if (!persisted) persisted = persistDiscoveredReceipt(context, attempt.id, pair.receipt, now());
      if (persisted.blockNumber !== Number(ns.parseQuantity(pair.receipt.blockNumber)) || persisted.blockHash !== pair.receipt.blockHash) { markHashedUncertain(context, attempt, 'canonicality_lost'); return null; }
      const receiptBlockNumber = ns.parseQuantity(pair.receipt.blockNumber); let confirmed = false;
      for await (const heads of transport.pollHeads({ deadlineMs: persisted.confirmationDeadlineMs })) { if (headsConfirmed(heads, receiptBlockNumber)) { confirmed = true; break; } }
      if (!confirmed) {
        try { const anchor = await transport.anchorCanonicalHead(); confirmed = ns.parseQuantity(anchor.number) >= receiptBlockNumber + 2n; } catch { confirmed = false; }
      }
      if (!confirmed) { markHashedUncertain(context, attempt, 'confirmation_timeout'); return null; }
      return pair;
    }
    async function currentDeployedObservation() {
      const anchor = await transport.anchorCanonicalHead();
      try { return await readValidatedState(anchor, ns.POST_STATE_PLAN, ns.validatePostState); } catch { return null; }
    }
    async function classifyHashed(context, attempt, revalidation = false) {
      const pair = await discoverAndConfirm(context, attempt);
      if (!pair) return { trusted: false, classification: 'uncertain_hashed' };
      const { transaction, receipt } = pair; const anchor = { number: receipt.blockNumber, hash: receipt.blockHash };
      let postState = null; let revertedState = null;
      try { postState = await readValidatedState(anchor, ns.POST_STATE_PLAN, ns.validatePostState); } catch {}
      if (receipt.status === '0x0' && !postState) { try { revertedState = await readValidatedState(anchor, ns.REVERTED_STATE_PLAN, ns.validateRevertedState); } catch {} }
      let trace = null; let onchainUserOpHashResult = null;
      if (receipt.status === '0x1' && transaction.to?.toLowerCase() === ns.PINSET.identities.entryPoint.address.toLowerCase()) {
        try {
          const decoded = ns.decodeHandleOps(transaction.input); const selected = decoded.operations.map((operation, index) => ({ operation, index })).filter(({ operation }) => operation.sender.toLowerCase() === ns.PINSET.identities.sponsor.address.toLowerCase());
          if (selected.length !== 1) throw new Error('Wrapped receipt must contain exactly one sponsor operation.');
          const { operation, index } = selected[0]; const hashCall = ns.encodeGetUserOpHashCall(operation, decoded.signatures[index]);
          const hashEvidence = await transport.stateBatch(anchor, [{ kind: 'call', transaction: { to: ns.PINSET.identities.entryPoint.address, data: hashCall } }]); onchainUserOpHashResult = hashEvidence.items[0].result;
          trace = (await transport.traceTransaction(attempt.txHash)).result;
        } catch {}
      }
      const verified = await ns.verifyReceiptEvidence({ requestedHash: attempt.txHash, transaction, receipt, postState, revertedState, trace, onchainUserOpHashResult });
      const current = context.readLatest().attempts.find((item) => item.id === attempt.id);
      if (verified.classification === 'uncertain_hashed') {
        markHashedUncertain(context, current, 'evidence_incomplete');
        return { trusted: false, classification: 'uncertain_hashed' };
      }
      if (revalidation && current.state !== verified.classification) {
        if (terminalStates.has(current.state)) markHashedUncertain(context, current, 'canonicality_lost');
        return { trusted: false, classification: 'uncertain_hashed' };
      }
      if (current.state === verified.classification) return { trusted: true, classification: verified.classification };
      const atMs = now(); const persistedReceipt = { ...(current.receipt || { blockNumber: Number(ns.parseQuantity(receipt.blockNumber)), blockHash: receipt.blockHash, discoveredAtMs: atMs, confirmationDeadlineMs: atMs + 120000, registryLog: null }), registryLog: verified.registryLog || null };
      const observation = verified.classification === 'observed_unattributed' ? { blockNumber: Number(ns.parseQuantity(receipt.blockNumber)), blockHash: receipt.blockHash, observedAtMs: atMs } : null;
      const reason = verified.classification === 'confirmed_attributed' ? 'receipt_attributed' : verified.classification === 'observed_unattributed' ? 'state_observed_unattributed' : 'receipt_reverted';
      context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((item) => item.id === attempt.id ? transitionAttempt(item, verified.classification, reason, atMs, { receipt: persistedReceipt, observation }) : item) }));
      return { trusted: true, classification: verified.classification };
    }
    async function resumeWithin(context, { revalidation = false } = {}) {
      const latest = context.readLatest(); const attempt = activeAttempt(latest); if (!attempt) throw new Error('No active attempt to resume.');
      if (attempt.state === 'prepared') { mutateAttempt(context, attempt.id, 'uncertain_hashless', 'reload_prepared'); return { trusted: false, classification: 'uncertain_hashless' }; }
      if (attempt.retryOrdinal === 1 && ['reverted','retry_cancelled'].includes(attempt.state)) {
        const late = await currentDeployedObservation();
        if (late) { const atMs = now(); mutateAttempt(context, attempt.id, 'observed_unattributed', 'late_original_observed', { observation: { blockNumber: late.blockNumber, blockHash: late.blockHash, observedAtMs: atMs } }); return { trusted: true, classification: 'observed_unattributed' }; }
        if (attempt.state === 'retry_cancelled') return { trusted: true, classification: attempt.state };
      }
      if (!attempt.txHash) {
        const anchor = attempt.state === 'observed_unattributed' && attempt.observation ? { number: ns.canonicalQuantity(attempt.observation.blockNumber), hash: attempt.observation.blockHash } : await transport.anchorCanonicalHead();
        let postState = null; try { postState = await readValidatedState(anchor, ns.POST_STATE_PLAN, ns.validatePostState); } catch {}
        if (postState) {
          if (attempt.state === 'observed_unattributed') return { trusted: true, classification: attempt.state };
          const atMs = now(); mutateAttempt(context, attempt.id, 'observed_unattributed', 'state_observed_unattributed', { observation: { blockNumber: postState.blockNumber, blockHash: postState.blockHash, observedAtMs: atMs } }); return { trusted: true, classification: 'observed_unattributed' };
        }
        if (attempt.state === 'observed_unattributed') mutateAttempt(context, attempt.id, 'uncertain_hashless', 'canonicality_lost', { observation: null, receipt: null });
        return { trusted: false, classification: 'uncertain_hashless' };
      }
      return classifyHashed(context, attempt, revalidation || terminalStates.has(attempt.state));
    }
    function statusForClassification(classification) {
      return classification === 'confirmed_attributed' ? 'Confirmed and attributed: the pinned account was created by the approved activation call.'
        : classification === 'observed_unattributed' ? 'Pinned account state is canonical, but transaction attribution is incomplete.'
          : classification === 'reverted' ? 'Activation transaction reverted and the pinned account remains undeployed.'
            : classification === 'retry_cancelled' ? 'Retry was cancelled and remains permanently consumed.'
              : 'Canonical evidence remains incomplete; activation stays locked.';
    }
    async function recoverDurableOnLoad() {
      const attempt = activeAttempt(); if (!attempt || (!terminalStates.has(attempt.state) && attempt.state !== 'prepared')) return;
      try { const result = await coordinator.run('resume', (context) => resumeWithin(context, { revalidation: terminalStates.has(attempt.state) })); durable = store.read(); durableTrustBlocked = false; status = statusForClassification(result.classification); }
      catch { durableTrustBlocked = true; status = 'Durable result could not be safely revalidated. Resume verification later; all writes remain disabled.'; }
    }
    async function refresh() {
      const version = ++refreshVersion; busy = true; status = 'Verifying pinned production state...'; draw();
      try {
        durable = store.read(); await recoverDurableOnLoad(); walletState = await wallet.readState();
        if (!wallet.hasProvider) { const anchor = await transport.anchorCanonicalHead(); await Promise.all([transport.stateBatch(anchor, requests(ns.PREFLIGHT_PLAN)), transport.readNonState(GAS_PRICE_REQUEST)]); throw new Error('Injected wallet not found. Read-only checks remain safe; activation is disabled.'); }
        const result = await readPreflight(); if (version !== refreshVersion) return; preflight = result.validated; walletState = result.currentWallet;
        const active = activeAttempt(); status = durableTrustBlocked ? 'Durable result could not be safely revalidated. Resume verification later; all writes remain disabled.' : active && terminalStates.has(active.state) ? statusForClassification(active.state) : preflight.accountState === 'deployed_exact' ? 'Pinned account is deployed; use Resume verification for canonical post-state.' : 'Ready. Every pinned preflight check passed.';
      } catch (error) { if (version !== refreshVersion) return; preflight = null; status = durableTrustBlocked ? 'Durable result could not be safely revalidated. Resume verification later; all writes remain disabled.' : String(error?.message || error).slice(0, 600); }
      finally { if (version === refreshVersion) { busy = false; draw(activeAttempt()?.txHash || null); } }
    }
    async function connect() { if (busy) return; busy = true; draw(); try { await wallet.connectAndSwitch(); } catch (error) { status = error?.code === 4001 ? 'Wallet request rejected. Nothing changed.' : String(error?.message || error); } finally { busy = false; await refresh(); } }
    async function activate() {
      if (busy) return; busy = true; draw(); const capturedGeneration = walletGeneration; let shouldResume = false;
      try {
        await coordinator.run('activate', async (context) => {
          const result = await readPreflight(); if (!result.validated.sendReady || capturedGeneration !== walletGeneration) throw new Error('Wallet or account state changed before submission.');
          const timestamp = now(); const draft = makeAttempt({ id: crypto.randomUUID(), nowMs: timestamp, walletGeneration, validated: result.validated });
          const handoff = persistPreparedAndInvoke(context, wallet, draft); let hash;
          try { hash = await handoff.sendPromise; }
          catch (error) { if (error?.code === 4001) { store.rejectOriginalPrepared4001(context.ownerTabId, context.leaseId); status = 'Wallet rejected the transaction. No transaction was submitted.'; return; } mutateAttempt(context, draft.id, 'uncertain_hashless', 'provider_ambiguous'); status = 'Wallet outcome is ambiguous. Activation remains locked; use Resume verification.'; return; }
          if (!HASH.test(hash)) { mutateAttempt(context, draft.id, 'uncertain_hashless', 'provider_ambiguous'); status = 'Wallet returned no trustworthy hash. Activation remains locked.'; return; }
          mutateAttempt(context, draft.id, 'submitted', 'provider_hash', { txHash: hash }); status = 'Submitted. Canonical receipt verification is starting.'; shouldResume = true;
        });
      } catch (error) { status = String(error?.message || error); }
      finally { busy = false; durable = store.read(); draw(activeAttempt()?.txHash || null); if (shouldResume) void resume(); }
    }
    async function resume() {
      if (busy) return; busy = true; draw();
      try { const result = await coordinator.run('resume', (context) => resumeWithin(context)); durableTrustBlocked = false; status = statusForClassification(result.classification); }
      catch (error) { status = String(error?.message || error); }
      finally { busy = false; durable = store.read(); draw(activeAttempt()?.txHash || null); }
    }
    async function retry() {
      if (busy) return; busy = true; draw(); let shouldResume = false;
      try {
        await coordinator.run('retry', async (context) => {
          const latest = context.readLatest(); const original = activeAttempt(latest); if (!original || original.state !== 'uncertain_hashless' || original.retryOrdinal !== 0 || original.txHash !== null || now() < original.waitUntilMs || latest.attempts.length !== 1) throw new Error('Original hashless attempt is not retry-eligible.');
          const result = await readPreflight(); if (!result.validated.sendReady) throw new Error('Retry requires the pinned account to remain undeployed with zero balance.'); const timestamp = now(); const draft = makeAttempt({ id: crypto.randomUUID(), nowMs: timestamp, walletGeneration, validated: result.validated, retryOrdinal: 1, supersedesId: original.id });
          const handoff = persistRetryAndInvoke(context, wallet, original.id, draft); let hash;
          try { hash = await handoff.sendPromise; }
          catch (error) { const to = error?.code === 4001 ? 'retry_cancelled' : 'uncertain_hashless'; const reason = error?.code === 4001 ? 'provider_rejected_retry' : 'provider_ambiguous'; mutateAttempt(context, draft.id, to, reason); status = error?.code === 4001 ? 'Retry was rejected. The one retry is permanently consumed.' : 'Retry wallet outcome is ambiguous and remains locked.'; return; }
          if (!HASH.test(hash)) { mutateAttempt(context, draft.id, 'uncertain_hashless', 'provider_ambiguous'); status = 'Retry returned no trustworthy hash and remains locked.'; return; }
          mutateAttempt(context, draft.id, 'submitted', 'provider_hash', { txHash: hash }); status = 'Retry submitted. Canonical verification is starting.'; shouldResume = true;
        });
      } catch (error) { status = String(error?.message || error); }
      finally { busy = false; durable = store.read(); draw(activeAttempt()?.txHash || null); if (shouldResume) void resume(); }
    }
    async function acknowledge() {
      if (busy) return; busy = true; draw();
      try {
        await coordinator.run('acknowledge', async (context) => {
          const before = activeAttempt(context.readLatest()); if (!before || !terminalStates.has(before.state)) throw new Error('Only a terminal result can be acknowledged.');
          const result = await resumeWithin(context, { revalidation: true }); const latest = context.readLatest(); const attempt = activeAttempt(latest);
          if (!result.trusted || !attempt || !terminalStates.has(attempt.state)) throw new Error('Terminal evidence could not be safely revalidated.');
          if (attempt.state === 'reverted' && attempt.retryOrdinal === 0 && latest.attempts.length === 1 && attempt.supersedesId === null && attempt.supersededById === null) { store.acknowledgeIsolatedOriginalRevert(); return; }
          const atMs = now(); context.mutate((value) => ({ ...value, attempts: value.attempts.map((item) => item.id === attempt.id ? { ...item, acknowledgedAtMs: atMs, updatedAtMs: atMs } : item) }));
        }); status = 'Result acknowledged. Durable evidence and write lock were retained.';
      } catch (error) { status = String(error?.message || error); }
      finally { busy = false; durable = store.read(); draw(activeAttempt()?.txHash || null); }
    }
    function invalidateWallet() { walletGeneration += 1; refreshVersion += 1; preflight = null; status = 'Wallet state changed. Readiness was invalidated.'; draw(); if (!busy) void refresh(); }
    function invalidateStorage() { refreshVersion += 1; durable = store.read(); preflight = null; status = 'Another tab changed activation state. Readiness was invalidated.'; draw(); }
    return ns.deepFreeze({ refresh, connect, activate, resume, retry, acknowledge, invalidateWallet, invalidateStorage, get walletGeneration() { return walletGeneration; } });
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ makeAttempt, transitionAttempt, persistPreparedAndInvoke, persistRetryAndInvoke, deriveControls, createRenderer, createController }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

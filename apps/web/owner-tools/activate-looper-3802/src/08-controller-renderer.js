'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const lowerTx = () => ({ chainId: ns.EXACT_TRANSACTION.chainId, from: ns.EXACT_TRANSACTION.from.toLowerCase(), to: ns.EXACT_TRANSACTION.to.toLowerCase(), data: ns.EXACT_TRANSACTION.data, value: '0x0' });
  const attemptPinset = () => ns.expectedAttemptPinset();

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

  function deriveControls({ busy, walletReady, preflight, store, locksAvailable }) {
    const active = store?.attempts.find((attempt) => attempt.id === store.activeAttemptId) || null;
    const terminal = active && ['confirmed_attributed','observed_unattributed','reverted','retry_cancelled'].includes(active.state);
    const resumable = active && ['submitted','uncertain_hashless','uncertain_hashed','superseded','confirmed_attributed','observed_unattributed','reverted','retry_cancelled'].includes(active.state);
    const retryable = active?.state === 'uncertain_hashless' && active.retryOrdinal === 0 && active.txHash === null && Date.now() >= active.waitUntilMs && store.attempts.length === 1;
    return ns.deepFreeze({
      connect: { visible: true, disabled: busy },
      activate: { visible: true, disabled: busy || !locksAvailable || !walletReady || !preflight?.sendReady || Boolean(store) },
      resume: { visible: Boolean(resumable), disabled: busy || !locksAvailable },
      retry: { visible: Boolean(retryable), disabled: busy || !locksAvailable },
      acknowledge: { visible: Boolean(terminal), disabled: busy || !locksAvailable },
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
    let busy = false; let refreshVersion = 0; let walletGeneration = 0; let preflight = null; let walletState = { chainId: null, account: null }; let durable = null; let status = 'Verifying pinned production state...';
    function view(txHash = null) { const walletReady = walletState.chainId === ns.PINSET.chainIdHex && walletState.account?.toLowerCase() === ns.PINSET.identities.sponsor.address.toLowerCase(); return { busy, wallet: walletState, preflight, store: durable, txHash, status, controls: deriveControls({ busy, walletReady, preflight, store: durable, locksAvailable: coordinator.available }) }; }
    function draw(txHash = null) { renderer.render(view(txHash)); }
    async function readPreflight() { const anchor = await transport.anchorCanonicalHead(); const evidence = await transport.stateBatch(anchor, ns.PREFLIGHT_PLAN.map(({ request }) => request)); evidence.anchor ||= anchor; const currentWallet = await wallet.readState(); const validated = await ns.validatePreflight(evidence, currentWallet); return { validated, currentWallet }; }
    async function refresh() {
      const version = ++refreshVersion; busy = true; status = 'Verifying pinned production state...'; draw();
      try { durable = store.read(); walletState = await wallet.readState(); if (!wallet.hasProvider) throw new Error('Injected wallet not found. Read-only checks remain safe; activation is disabled.'); const result = await readPreflight(); if (version !== refreshVersion) return; preflight = result.validated; walletState = result.currentWallet; status = preflight.accountState === 'deployed_exact' ? 'Pinned account is deployed; use Resume verification for canonical post-state.' : 'Ready. Every pinned preflight check passed.'; }
      catch (error) { if (version !== refreshVersion) return; preflight = null; status = String(error?.message || error).slice(0, 600); }
      finally { if (version === refreshVersion) { busy = false; draw(durable?.attempts.find((a) => a.id === durable.activeAttemptId)?.txHash || null); } }
    }
    async function connect() { if (busy) return; busy = true; draw(); try { await wallet.connectAndSwitch(); } catch (error) { status = error?.code === 4001 ? 'Wallet request rejected. Nothing changed.' : String(error?.message || error); } finally { busy = false; await refresh(); } }
    async function activate() {
      if (busy) return; busy = true; draw(); const capturedGeneration = walletGeneration;
      try {
        await coordinator.run('activate', async (context) => {
          const result = await readPreflight(); if (!result.validated.sendReady || capturedGeneration !== walletGeneration) throw new Error('Wallet or account state changed before submission.');
          const timestamp = now(); const draft = makeAttempt({ id: crypto.randomUUID(), nowMs: timestamp, walletGeneration, validated: result.validated });
          const handoff = persistPreparedAndInvoke(context, wallet, draft); let hash;
          try { hash = await handoff.sendPromise; }
          catch (error) { if (error?.code === 4001) { store.rejectOriginalPrepared4001(context.ownerTabId, context.leaseId); status = 'Wallet rejected the transaction. No transaction was submitted.'; return; } context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === draft.id ? transitionAttempt(attempt, 'uncertain_hashless', 'provider_ambiguous', now()) : attempt) })); status = 'Wallet outcome is ambiguous. Activation remains locked; use Resume verification.'; return; }
          if (!HASH.test(hash)) { context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === draft.id ? transitionAttempt(attempt, 'uncertain_hashless', 'provider_ambiguous', now()) : attempt) })); status = 'Wallet returned no trustworthy hash. Activation remains locked.'; return; }
          context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === draft.id ? transitionAttempt(attempt, 'submitted', 'provider_hash', now(), { txHash: hash }) : attempt) })); status = 'Submitted. Use Resume verification to prove canonical receipt and account state.';
        });
      } catch (error) { status = String(error?.message || error); }
      finally { busy = false; durable = store.read(); draw(durable?.attempts.find((a) => a.id === durable.activeAttemptId)?.txHash || null); }
    }
    async function resume() { if (busy) return; busy = true; draw(); try { await coordinator.run('resume', async () => { durable = store.read(); status = 'Durable attempt retained. Canonical receipt verification requires complete public evidence; no wallet action was requested.'; }); } catch (error) { status = String(error?.message || error); } finally { busy = false; durable = store.read(); draw(durable?.attempts.find((a) => a.id === durable.activeAttemptId)?.txHash || null); } }
    async function retry() { status = 'Retry requires fresh canonical eligibility proof and remains disabled unless the original hashless attempt is eligible.'; draw(); }
    async function acknowledge() { if (busy) return; try { await coordinator.run('acknowledge', async (context) => { context.mutate((latest) => ({ ...latest, attempts: latest.attempts.map((attempt) => attempt.id === latest.activeAttemptId ? { ...attempt, acknowledgedAtMs: now(), updatedAtMs: now() } : attempt) })); }); status = 'Result acknowledged. Durable evidence and write lock were retained.'; } catch (error) { status = String(error?.message || error); } durable = store.read(); draw(); }
    function invalidateWallet() { walletGeneration += 1; refreshVersion += 1; preflight = null; status = 'Wallet state changed. Readiness was invalidated.'; draw(); if (!busy) void refresh(); }
    function invalidateStorage() { refreshVersion += 1; durable = store.read(); preflight = null; status = 'Another tab changed activation state. Readiness was invalidated.'; draw(); }
    return ns.deepFreeze({ refresh, connect, activate, resume, retry, acknowledge, invalidateWallet, invalidateStorage, get walletGeneration() { return walletGeneration; } });
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ makeAttempt, transitionAttempt, persistPreparedAndInvoke, persistRetryAndInvoke, deriveControls, createRenderer, createController }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

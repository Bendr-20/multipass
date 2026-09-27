'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const LEASE_TTL_MS = 30000;
  const HEARTBEAT_MS = 5000;

  function createCrossTabCoordinator({ locks, store, crypto, now, setInterval, clearInterval }) {
    if (!locks || typeof locks.request !== 'function') return ns.deepFreeze({ available: false, run: async () => { throw new Error('Exclusive Web Locks are unavailable; page is read-only.'); } });
    if (!store || typeof store.read !== 'function' || typeof store.mutate !== 'function' || typeof crypto?.randomUUID !== 'function' || typeof now !== 'function' || typeof setInterval !== 'function' || typeof clearInterval !== 'function') throw new TypeError('Invalid coordinator dependencies.');
    const ownerTabId = crypto.randomUUID();

    function makeLease(purpose, acquiredAtMs) {
      return { lockName: ns.PINSET.lockName, ownerTabId, leaseId: crypto.randomUUID(), purpose, acquiredAtMs, heartbeatAtMs: acquiredAtMs, expiresAtMs: acquiredAtMs + LEASE_TTL_MS };
    }
    function baseStore(lease) {
      return { schema: 'loopers.walletActivation', version: 1, revision: 1, chainId: ns.PINSET.chainId, tokenId: ns.PINSET.tokenId, activeAttemptId: null, lease, attempts: [] };
    }
    function installLease(purpose) {
      const timestamp = now();
      const current = store.read();
      if (!current) {
        if (purpose !== 'activate') throw new Error('No durable attempt exists for this action.');
        const lease = makeLease(purpose, timestamp);
        return store.mutate((latest) => { if (latest !== null) throw new Error('Activation store changed before lease install.'); return baseStore(lease); });
      }
      if (current.lease && current.lease.ownerTabId !== ownerTabId && timestamp < current.lease.expiresAtMs) throw new Error('Another tab owns an unexpired activation lease.');
      const lease = makeLease(purpose, timestamp);
      return store.mutate((latest) => {
        if (!latest || latest.revision !== current.revision) throw new Error('Activation store changed before lease takeover.');
        if (latest.lease && latest.lease.ownerTabId !== ownerTabId && timestamp < latest.lease.expiresAtMs) throw new Error('Another tab owns an unexpired activation lease.');
        return { ...latest, revision: latest.revision + 1, lease };
      });
    }
    function mutateOwned(leaseId, mutator) {
      return store.mutate((latest) => {
        if (!latest || latest.lease?.ownerTabId !== ownerTabId || latest.lease?.leaseId !== leaseId) throw new Error('Activation lease changed or was lost.');
        const next = mutator(latest);
        return { ...next, revision: latest.revision + 1 };
      });
    }
    function heartbeat(leaseId) {
      const timestamp = now();
      return mutateOwned(leaseId, (latest) => ({ ...latest, lease: { ...latest.lease, heartbeatAtMs: timestamp, expiresAtMs: timestamp + LEASE_TTL_MS } }));
    }
    function clearOwnedLease(leaseId) {
      return mutateOwned(leaseId, (latest) => ({ ...latest, lease: null }));
    }

    async function run(purpose, action) {
      if (!['activate','retry','resume','acknowledge'].includes(purpose) || typeof action !== 'function') throw new TypeError('Invalid coordinated action.');
      let granted = false;
      const result = await locks.request(ns.PINSET.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (lock === null) return { granted: false };
        granted = true;
        const leased = installLease(purpose);
        const leaseId = leased.lease.leaseId;
        let heartbeatError = null;
        const timer = setInterval(() => { try { heartbeat(leaseId); } catch (error) { heartbeatError = error; } }, HEARTBEAT_MS);
        let completed = false;
        try {
          const value = await action(ns.deepFreeze({
            ownerTabId, leaseId,
            readLatest() { const latest = store.read(); if (!latest || latest.lease?.ownerTabId !== ownerTabId || latest.lease?.leaseId !== leaseId) throw new Error('Activation lease changed or was lost.'); return latest; },
            mutate(mutator) { if (heartbeatError) throw heartbeatError; return mutateOwned(leaseId, mutator); },
          }));
          if (heartbeatError) throw heartbeatError;
          completed = true;
          const latest = store.read();
          if (latest?.lease?.ownerTabId === ownerTabId && latest.lease?.leaseId === leaseId) clearOwnedLease(leaseId);
          return { granted: true, value };
        } finally {
          clearInterval(timer);
          if (!completed) {
            const latest = store.read();
            if (purpose === 'activate' && latest?.attempts.length === 0 && latest.lease?.ownerTabId === ownerTabId && latest.lease?.leaseId === leaseId) store.abandonFreshLease(ownerTabId, leaseId);
          }
        }
      });
      if (!granted || !result?.granted) throw new Error('Exclusive activation lock is busy; no action was queued.');
      return result.value;
    }

    return ns.deepFreeze({ available: true, ownerTabId, run });
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ LEASE_TTL_MS, HEARTBEAT_MS, createCrossTabCoordinator }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

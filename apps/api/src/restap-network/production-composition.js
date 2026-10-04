import { createHmac } from 'node:crypto';

import { getAddress } from 'viem';

import { createRestapNetworkActivationLeaseService } from './activation-leases.js';
import { createRestapNetworkPolicyStore } from './policy-store.js';
import { normalizeRestapNetworkTokenId } from './schema.js';

const EXACT_PILOT = Object.freeze(['617', '3802']);

/**
 * Production composition for the holder opt-in phase.  Signed discovery and
 * message execution remain deliberately unavailable until their separate
 * rollout gates receive a complete production composition and approval.
 */
export function composeRestapNetworkProductionPolicy({
  config, productionConfig, store, custodyReconciler, accountReader, providers, codexRuntime, now = Date.now,
} = {}) {
  if (!config?.gates?.foundation || !store || !custodyReconciler || !accountReader) {
    throw new Error('RESTAP network production foundation is unavailable.');
  }
  if (!sameTokens(productionConfig?.tokenIds, EXACT_PILOT)) {
    throw new Error('RESTAP network production requires the exact #617 and #3802 pilot roster.');
  }
  if (config.gates.discovery || config.gates.initiation || config.gates.replies) {
    throw new Error('RESTAP network signed traffic production composition is unavailable.');
  }

  const dependencies = {
    databaseFactory: oneDatabaseFactory(store, config.databasePath),
    approvedProviders: providers,
    codexRuntime,
    accountIntegrity: Object.freeze({ configured: true, read: accountReader.read }),
    custodyReconciler: createStartupCustodyAdapter({ accountReader, custodyReconciler }),
  };
  if (!config.gates.policy) return Object.freeze({ dependencies: Object.freeze(dependencies) });

  const digestKey = createHmac('sha256', Buffer.from(config.operationalHashSalt, 'utf8'))
    .update('restap-network-policy-v1')
    .digest();
  const activationLeases = createRestapNetworkActivationLeaseService({
    store,
    now,
    getPolicyGeneration: () => 0,
  });
  const policy = createRestapNetworkPolicyStore({
    store,
    now,
    tokenScopeDigest: (custody) => createHmac('sha256', digestKey)
      .update(['token', custody.chainId, custody.collection.toLowerCase(), custody.tokenId].join('|'))
      .digest('hex'),
  });
  const management = createPolicyManagement({ store, custodyReconciler, accountReader, policy, now });
  Object.assign(dependencies, {
    activationLeases: createStartupLeaseAdapter({ activationLeases, custodyReconciler }),
    policy,
    management,
  });
  return Object.freeze({
    dependencies: Object.freeze(dependencies),
    activationLeaseService: activationLeases,
  });
}

function createPolicyManagement({ store, custodyReconciler, accountReader, policy, now }) {
  async function authority(input, { requireLease }) {
    const tokenId = normalizeRestapNetworkTokenId(String(input?.tokenId ?? ''));
    if (!EXACT_PILOT.includes(tokenId)) throw new Error('RESTAP network token is outside the pilot.');
    const integrity = await accountReader.read({ tokenId });
    if (integrity?.eligible !== true) throw new Error('RESTAP network account integrity is unavailable.');
    const reconciled = await custodyReconciler.reconcileToken({ tokenId });
    if (reconciled?.eligible !== true) throw new Error('RESTAP network custody is unavailable.');
    const custody = custodyReconciler.getEpochSnapshot({ tokenId });
    let owner;
    try { owner = getAddress(input?.identity?.owner); } catch { throw new Error('RESTAP network owner authority is unavailable.'); }
    if (!custody || custody.status !== 'ready' || owner !== custody.owner) {
      throw new Error('RESTAP network owner authority changed.');
    }
    const lease = readActiveLease(store, custody, now());
    if (requireLease && !lease) throw new Error('RESTAP network activation lease is unavailable.');
    return { custody, lease };
  }

  const trafficUnavailable = async () => {
    throw new Error('RESTAP network autonomous traffic is not enabled.');
  };
  return Object.freeze({
    async getPolicy(input) {
      const { custody, lease } = await authority(input, { requireLease: false });
      return Object.freeze({
        policy: policy.get({ custody }),
        leaseStatus: lease ? 'active' : 'inactive',
        eligibilityStatus: lease ? 'eligible' : 'unavailable',
      });
    },
    async putPolicy(input) {
      const { custody } = await authority(input, { requireLease: true });
      const { expected_policy_version: expectedVersion, ...value } = input.input;
      return policy.put({ custody, owner: custody.owner, expectedVersion, policy: value });
    },
    async stop(input) {
      const { custody } = await authority(input, { requireLease: false });
      return policy.stop({ custody, owner: custody.owner, expectedVersion: input.input.expected_policy_version });
    },
    createIntent: trafficUnavailable,
    listIntents: trafficUnavailable,
    deleteIntent: trafficUnavailable,
  });
}

function createStartupCustodyAdapter({ accountReader, custodyReconciler }) {
  return Object.freeze({
    async reconcile({ candidates } = {}) {
      if (!Array.isArray(candidates)) throw new TypeError('RESTAP network custody candidates are invalid.');
      for (const candidate of candidates) {
        const integrity = await accountReader.read({ tokenId: candidate.tokenId });
        if (integrity?.eligible !== true) throw new Error('RESTAP network account integrity is unavailable.');
        const custody = await custodyReconciler.reconcileToken({ tokenId: candidate.tokenId });
        if (custody?.eligible !== true) throw new Error('RESTAP network custody is unavailable.');
      }
    },
  });
}

function createStartupLeaseAdapter({ activationLeases, custodyReconciler }) {
  return Object.freeze({
    loadInactiveCandidates: () => activationLeases.loadCandidates(),
    async reauthorizeCandidates({ candidates }) {
      for (const candidate of candidates) {
        const custody = custodyReconciler.getEpochSnapshot({ tokenId: candidate.tokenId });
        activationLeases.reauthorizeCandidate({
          leaseId: candidate.leaseId,
          custody,
          expectedPolicyGeneration: 0,
        });
      }
    },
  });
}

function oneDatabaseFactory(store, filename) {
  let claimed = false;
  return async ({ filename: actual }) => {
    if (claimed || actual !== filename) throw new Error('RESTAP network database composition mismatch.');
    claimed = true;
    return store;
  };
}

function readActiveLease(store, custody, timestamp) {
  const row = store.readOne(
    "SELECT lease_id FROM restap_network_activation_leases WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND status = 'active' AND expires_at > ? ORDER BY issued_at DESC LIMIT 1",
    [custody.chainId, custody.collection, custody.tokenId, custody.generation, timestamp],
  );
  return row ? Object.freeze({ leaseId: row.lease_id }) : null;
}

function sameTokens(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

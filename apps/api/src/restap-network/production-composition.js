import { createHmac, randomUUID } from 'node:crypto';

import { getAddress } from 'viem';

import { createRestapNetworkActivationLeaseService } from './activation-leases.js';
import { createRestapNetworkProviderBudget } from './bankr-provider.js';
import { createRestapNetworkConversations } from './conversations.js';
import { createRestapNetworkCoordinator } from './coordinator.js';
import { createRestapNetworkEligibilityResolver } from './eligibility.js';
import { createRestapNetworkGrantService } from './grants.js';
import { createRestapNetworkIntentStore } from './intents.js';
import { createRestapNetworkPolicyStore } from './policy-store.js';
import { createRestapNetworkRelay } from './relay.js';
import { createRestapNetworkRuntime } from './runtime.js';
import { normalizeRestapNetworkTokenId } from './schema.js';
import { createRestapNetworkWorker, createSqliteRestapNetworkWorkerCoordinator } from './worker.js';

const EXACT_PILOT = Object.freeze(['617', '3802']);

/**
 * Production composition for the exact signed #617 <-> #3802 private pilot.
 */
export function composeRestapNetworkProductionPolicy({
  config, productionConfig, store, custodyReconciler, accountReader, providers, codexRuntime,
  signer = null, keyRegistry = null, bankrGateway = null, now = Date.now,
} = {}) {
  if (!config?.gates?.foundation || !store || !custodyReconciler || !accountReader) {
    throw new Error('RESTAP network production foundation is unavailable.');
  }
  if (!sameTokens(productionConfig?.tokenIds, EXACT_PILOT)) {
    throw new Error('RESTAP network production requires the exact #617 and #3802 pilot roster.');
  }
  if (config.gates.discovery && (!config.gates.policy || !config.gates.initiation || !config.gates.replies
    || config.gates.transcripts || !config.gates.pilot || config.gates.ga
    || !sameTokens(config.pilotRoster, EXACT_PILOT) || !sameTokens(config.cadences, ['once']))) {
    throw new Error('RESTAP network signed traffic production composition is unavailable outside the exact one-shot pilot gate tuple.');
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
  if (config.gates.discovery) composeSignedPilot({
    config, store, custodyReconciler, accountReader, providers, codexRuntime, signer, keyRegistry,
    bankrGateway, now, policy, dependencies, managementContext: { store, custodyReconciler, accountReader, policy, now },
  });
  return Object.freeze({
    dependencies: Object.freeze(dependencies),
    activationLeaseService: activationLeases,
  });
}

function composeSignedPilot({ config, store, custodyReconciler, accountReader, codexRuntime, signer, keyRegistry, bankrGateway, now, policy, dependencies, managementContext }) {
  if (!config.gates.policy || !config.gates.pilot || config.gates.transcripts || config.gates.ga
    || !sameTokens(config.pilotRoster, EXACT_PILOT) || !sameTokens(config.cadences, ['once'])) {
    throw new Error('RESTAP network signed production traffic requires the exact one-shot private pilot gate tuple.');
  }
  const eligibility = productionEligibility({ config, store, custodyReconciler, accountReader, codexRuntime, policy, now });
  dependencies.eligibility = eligibility;
  if (!config.gates.initiation) return;
  if (!signer || typeof signer.sign !== 'function') throw new Error('RESTAP network protected signer is unavailable.');
  if (!keyRegistry || typeof keyRegistry.get !== 'function') throw new Error('RESTAP network protected key registry is unavailable.');
  if (!bankrGateway || typeof bankrGateway.generatePublicReply !== 'function' || typeof bankrGateway.readUsageTotals !== 'function') throw new Error('RESTAP network Bankr relay provider is unavailable.');

  const pendingOperationIds = [];
  const coordinator = createRestapNetworkCoordinator({
    store, now, globalDailyCostLimit: config.dailyCostLimit,
    createId(kind) {
      if (kind !== 'operation') return opaqueId(kind);
      const operationId = pendingOperationIds.shift();
      if (!operationId) throw new Error('RESTAP network operation ID was not prepared.');
      return operationId;
    },
  });
  const grantService = createRestapNetworkGrantService({ signer, keyRegistry, now: () => Math.floor(now() / 1_000) });
  const fingerprintKey = createHmac('sha256', Buffer.from(config.operationalHashSalt, 'utf8')).update('restap-network-conversation-v1').digest();
  const conversations = createRestapNetworkConversations({ store, fingerprintKey, now });
  fingerprintKey.fill(0);
  const runtime = createRestapNetworkRuntime({
    generatePublicReply: (projection) => bankrGateway.generatePublicReply(projection),
    readPublicCodex: ({ tokenId }) => codexRuntime.getProfileContext(Number(tokenId)),
    readPublicDisplayName: ({ tokenId }) => displayName(codexRuntime.getProfileContext(Number(tokenId)), tokenId),
    timeoutMs: config.providerTimeoutMs,
  });
  const intents = createRestapNetworkIntentStore({ store, now, createId: () => opaqueId('intent'), authenticateConsoleOwner: () => true });
  const acquired = new Map();
  const due = new Map();
  const relay = createRestapNetworkRelay({
    coordinator, grantService, eligibility, conversations, runtime, now,
    readBoundaryState: ({ senderTokenId, recipientTokenId }) => boundaryState(custodyReconciler, senderTokenId, recipientTokenId),
    readDiscovery: ({ tokenId }) => Object.freeze({ tokenId, canonicalName: displayName(codexRuntime.getProfileContext(Number(tokenId)), tokenId), status: 'available' }),
    readDueIntent: ({ intentId, expectedPolicyVersion }) => {
      let value = due.get(intentId);
      if (!value) {
        value = prepareOpening(acquired.get(intentId), intentId, expectedPolicyVersion);
        pendingOperationIds.push(value.canonicalBody.operation_id);
        due.set(intentId, value);
      }
      return value;
    },
  });
  const providerBudget = createRestapNetworkProviderBudget({
    readProviderRequestTotal: async () => (await bankrGateway.readUsageTotals()).totalRequests,
    readDurableChargedUnits: () => Number(store.readOne("SELECT count(*) AS count FROM restap_network_operations WHERE status IN ('provider_dispatched','committed','charged_unknown','cancelled_charged','failed_charged')").count),
  });
  const workerCoordinator = Object.freeze({ ...createSqliteRestapNetworkWorkerCoordinator({ store, now }), ...coordinator });
  const coreWorker = createRestapNetworkWorker({
    coordinator: workerCoordinator,
    holderId: 'restap-production-worker-00000001', now,
    listDueIntents: ({ limit, now: timestamp }) => listDue(store, limit, timestamp),
    acquireIntent: (input) => acquireProductionIntent({ ...input, store, intents, eligibility, acquired }),
    settleIntent: ({ intentId, outcome }) => settleProductionIntent({ store, intents, acquired, intentId, outcome, now: now() }),
    createDueOperation: (input) => relay.createDueOperation(input),
    readIntentState: ({ intentId }) => productionIntentState(store, config, intentId),
    readProviderTotals: () => providerBudget.read(),
    openProviderBreaker: ({ reasonClass }) => openProviderBreaker(store, reasonClass, now()),
  });
  const worker = pilotWorkerLifecycle({ coreWorker, store, relay, intents, acquired, due });
  Object.assign(dependencies, {
    signer, keyRegistry, coordinator, conversations, runtime, relay, providerBudget, worker,
    management: createTrafficManagement({ ...managementContext, intents }),
  });
}

function productionEligibility({ config, store, custodyReconciler, accountReader, codexRuntime, policy, now }) {
  return createRestapNetworkEligibilityResolver({
    now,
    readCodexMembership: async ({ tokenId }) => { const profile = codexRuntime.getProfileContext(Number(tokenId)); return { member: String(profile?.identity?.tokenId) === tokenId, identityId: 'codex:' + tokenId }; },
    deriveCanonicalAccount: ({ tokenId }) => custodyReconciler.getEpochSnapshot({ tokenId })?.canonicalAccount,
    readAccountIntegrity: ({ tokenId }) => accountReader.read({ tokenId }),
    readCustody: ({ tokenId }) => custodyReconciler.getEpochSnapshot({ tokenId }),
    readActivationLease: ({ tokenId }) => {
      const custody = custodyReconciler.getEpochSnapshot({ tokenId });
      const lease = custody && readActiveLease(store, custody, now());
      return lease && { leaseId: lease.leaseId, chainId: custody.chainId, collection: custody.collection, tokenId, custodyGeneration: custody.generation, canonicalAccount: custody.canonicalAccount, owner: custody.owner, controller: custody.controller, issuedAt: lease.issuedAt, lastRenewedAt: lease.lastRenewedAt, expiresAt: lease.expiresAt, status: 'active' };
    },
    readPolicy: ({ tokenId }) => { const custody = custodyReconciler.getEpochSnapshot({ tokenId }); return custody ? policy.get({ custody }) : null; },
    readPilotRoster: async ({ tokenId }) => EXACT_PILOT.includes(tokenId) && config.pilotRoster.includes(tokenId),
    readGates: async () => ({ global: true, phase: config.gates.pilot, collection: true, token: true, emergency: false }),
    readBreakers: async () => {
      const open = Number(store.readOne("SELECT count(*) AS count FROM restap_network_circuit_breakers WHERE state <> 'closed'").count) > 0;
      return Object.fromEntries(['global', 'collection', 'token', 'pair', 'provider'].map((name) => [name, open ? 'open' : 'closed']));
    },
    recordMetric() {},
  });
}

function createTrafficManagement(context) {
  const base = createPolicyManagement(context);
  return Object.freeze({
    ...base,
    async createIntent(input) {
      const { custody, lease } = await productionAuthority(context, input, { requireLease: true });
      const runAt = Date.parse(input.input?.run_at);
      if (input.input?.cadence !== 'once') throw new Error('RESTAP network daily schedules are unavailable for the one-shot pilot.');
      if (!Number.isSafeInteger(runAt) || runAt < context.now() || runAt > context.now() + 1_000) throw new Error('RESTAP network one-shot intents must be immediate; schedules are unavailable.');
      const current = context.policy.get({ custody });
      return context.intents.create({ source: 'console_owner', ownerSession: 'verified-current-owner', authority: { chainId: custody.chainId, collection: custody.collection, tokenId: custody.tokenId, custodyGeneration: custody.generation, activationLeaseId: lease.leaseId, policyVersion: current.policyVersion }, intent: input.input, expiresAt: runAt + 30 * 60_000, attemptLimit: 1 });
    },
    async listIntents(input) {
      const { custody } = await productionAuthority(context, input, { requireLease: false });
      return context.store.readAll('SELECT * FROM restap_network_intents WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? ORDER BY created_at, intent_id', [custody.chainId, custody.collection, custody.tokenId, custody.generation]).map(projectIntent);
    },
    async deleteIntent(input) {
      const { custody } = await productionAuthority(context, input, { requireLease: true });
      if (input.input?.expected_policy_version !== context.policy.get({ custody }).policyVersion) throw new Error('RESTAP network policy version conflict.');
      context.store.transaction('production_intent_cancel', (tx) => {
        const row = tx.get('SELECT status FROM restap_network_intents WHERE intent_id = ? AND chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ?', [input.intentId, custody.chainId, custody.collection, custody.tokenId, custody.generation]);
        if (!row) throw new Error('RESTAP network intent is unavailable.');
        if (['pending', 'leased'].includes(row.status)) tx.run("UPDATE restap_network_intents SET status = 'cancelled', updated_at = ? WHERE intent_id = ?", [context.now(), input.intentId]);
      });
      return projectIntent(context.store.readOne('SELECT * FROM restap_network_intents WHERE intent_id = ?', [input.intentId]));
    },
  });
}

function pilotWorkerLifecycle(context) {
  let timer = null; let current = null; let stopped = false;
  async function pollNow() {
    if (stopped) return Object.freeze({ status: 'stopped' });
    current = Promise.resolve(context.coreWorker.poll()).then(async (value) => { await dispatchClaimed(context); return value; }).finally(() => { current = null; });
    return current;
  }
  return Object.freeze({
    async start() { if (!timer) { stopped = false; timer = setInterval(() => { void pollNow().catch(() => {}); }, 60_000); timer.unref?.(); } },
    pollNow,
    async stopAcquisition() { stopped = true; if (timer) clearInterval(timer); timer = null; },
    async awaitCurrent() { await current; },
  });
}

async function dispatchClaimed(context) {
  const rows = context.store.readAll("SELECT operation_id, intent_id FROM restap_network_operations WHERE status = 'reserved' AND intent_id IS NOT NULL ORDER BY created_at, operation_id");
  for (const row of rows) {
    const prepared = context.due.get(row.intent_id);
    if (!prepared) continue;
    try {
      const grant = await context.relay.mintRelayGrant({ operationId: row.operation_id, canonicalBody: prepared.canonicalBody });
      const delivered = await context.relay.deliverOpening({ operationId: row.operation_id, grant, message: prepared.canonicalBody });
      if (delivered.status !== 'delivered') throw new Error('RESTAP network one-shot delivery was unavailable.');
      const selected = context.acquired.get(row.intent_id);
      context.intents.settle({ intentId: row.intent_id, authority: selected.authority, outcome: 'succeeded' });
    } finally { context.acquired.delete(row.intent_id); context.due.delete(row.intent_id); }
  }
}

function prepareOpening(selected, intentId, expectedPolicyVersion) {
  if (!selected) throw new Error('RESTAP network due intent is unavailable.');
  const operationId = opaqueId('operation'); const conversationId = opaqueId('conversation');
  return Object.freeze({
    intentId, expectedPolicyVersion, operation: 'opening', chainId: selected.authority.chainId, collection: selected.authority.collection,
    senderTokenId: selected.authority.tokenId, recipientTokenId: selected.peerTokenId, topic: selected.topic,
    idempotencyKey: 'operation-' + intentId, correlationId: conversationId, nonce: opaqueId('nonce'), costUnits: 1,
    canonicalBody: Object.freeze({ schema_version: '1', operation_id: operationId, conversation_id: conversationId, sender_token_id: selected.authority.tokenId, recipient_token_id: selected.peerTokenId, topic: selected.topic, turn_index: 0, message: 'Share one public observation about ' + selected.topic + '.' }),
  });
}

async function acquireProductionIntent({ store, intents, eligibility, acquired, intentId, expectedPolicyVersion, custodyGeneration }) {
  const row = store.readOne('SELECT * FROM restap_network_intents WHERE intent_id = ?', [intentId]);
  if (!row || row.source !== 'one_shot' || Number(row.policy_version) !== expectedPolicyVersion || Number(row.custody_generation) !== custodyGeneration) return { status: 'unavailable' };
  const peerTokenId = row.token_id === '617' ? '3802' : '617';
  const authorityValue = { chainId: Number(row.chain_id), collection: row.collection, tokenId: row.token_id, custodyGeneration: Number(row.custody_generation), activationLeaseId: row.activation_lease_id, policyVersion: Number(row.policy_version) };
  const eligible = await eligibility.resolvePeerForRelay({ chainId: Number(row.chain_id), collection: row.collection, senderTokenId: row.token_id, recipientTokenId: peerTokenId, boundary: 'intent_lease' });
  if (eligible.status !== 'eligible') return { status: 'unavailable' };
  const result = intents.acquire({ intentId, authority: authorityValue, peerTokenIds: [peerTokenId], candidates: [{ tokenId: peerTokenId, eligible: true, blocked: false, pairExhausted: false, alreadyActive: false, topics: eligible.topics }] });
  if (result.status === 'acquired') acquired.set(intentId, { ...result, authority: authorityValue });
  return { status: result.status };
}

function settleProductionIntent({ store, intents, acquired, intentId, outcome, now }) {
  const selected = acquired.get(intentId);
  if (selected && ['failed', 'cancelled'].includes(outcome)) return intents.settle({ intentId, authority: selected.authority, outcome });
  const status = outcome === 'expired' ? 'expired' : outcome === 'exhausted' ? 'exhausted' : 'cancelled';
  store.transaction('production_intent_settle', (tx) => tx.run("UPDATE restap_network_intents SET status = ?, updated_at = ? WHERE intent_id = ? AND status IN ('pending','leased')", [status, now, intentId]));
  acquired.delete(intentId); return { status };
}

function listDue(store, limit, timestamp) {
  return store.readAll("SELECT * FROM restap_network_intents WHERE source = 'one_shot' AND status = 'pending' AND next_eligible_at <= ? ORDER BY created_at, intent_id LIMIT ?", [timestamp, limit]).map((row) => Object.freeze({ intentId: row.intent_id, expectedPolicyVersion: Number(row.policy_version), custodyGeneration: Number(row.custody_generation), attemptCount: Number(row.attempt_count), attemptLimit: Number(row.attempt_limit), createdAt: Number(row.created_at), expiresAt: Number(row.expires_at) }));
}

function productionIntentState(store, config, intentId) {
  const row = store.readOne('SELECT token_id, custody_generation FROM restap_network_intents WHERE intent_id = ?', [intentId]);
  const custody = row && store.readOne('SELECT generation FROM restap_network_custody_epochs WHERE token_id = ? ORDER BY generation DESC LIMIT 1', [row.token_id]);
  const policyRow = row && store.readOne('SELECT policy_version, autonomous_enabled FROM restap_network_owner_policies WHERE token_id = ? AND custody_generation = ? ORDER BY policy_version DESC LIMIT 1', [row.token_id, row.custody_generation]);
  const clear = Number(store.readOne("SELECT count(*) AS count FROM restap_network_circuit_breakers WHERE state <> 'closed'").count) === 0;
  return { initiationEnabled: Boolean(config.gates.initiation && policyRow?.autonomous_enabled), globalBreakerClosed: clear, policyVersion: Number(policyRow?.policy_version ?? 0), custodyGeneration: Number(custody?.generation ?? 0) };
}

function openProviderBreaker(store, reasonClass, timestamp) {
  store.transaction('production_provider_breaker', (tx) => tx.run("INSERT INTO restap_network_circuit_breakers (breaker_id, scope_class, scope_digest, state, generation, reason_class, opened_at, updated_at) VALUES ('production-provider', 'global', ?, 'open', 1, ?, ?, ?) ON CONFLICT(scope_class, scope_digest) DO UPDATE SET state = 'open', generation = generation + 1, reason_class = excluded.reason_class, opened_at = excluded.opened_at, updated_at = excluded.updated_at", ['0'.repeat(64), reasonClass, timestamp, timestamp]));
}

function boundaryState(custodyReconciler, senderTokenId, recipientTokenId) {
  const sender = custodyReconciler.getEpochSnapshot({ tokenId: senderTokenId }); const recipient = custodyReconciler.getEpochSnapshot({ tokenId: recipientTokenId });
  if (!sender || !recipient || sender.status !== 'ready' || recipient.status !== 'ready') throw new Error('RESTAP network boundary authority is unavailable.');
  if (sender.safeBlockNumber === recipient.safeBlockNumber && sender.safeBlockHash !== recipient.safeBlockHash) throw new Error('RESTAP network safe block hash disagreement.');
  const safe = sender.safeBlockNumber <= recipient.safeBlockNumber ? sender : recipient;
  return Object.freeze({ gateGeneration: 1, safeBlockNumber: safe.safeBlockNumber, safeBlockHash: safe.safeBlockHash });
}

function displayName(profile, tokenId) { return String(profile?.identity?.canonicalName ?? ('Looper #' + tokenId)); }
function projectIntent(row) { return Object.freeze({ intentId: row.intent_id, source: row.source, topic: row.topic, status: row.status, earliestAt: Number(row.earliest_at), expiresAt: Number(row.expires_at), attemptCount: Number(row.attempt_count), attemptLimit: Number(row.attempt_limit), nextEligibleAt: Number(row.next_eligible_at) }); }
function opaqueId(kind) { return kind + '-' + randomUUID().replaceAll('-', ''); }

async function productionAuthority({ store, custodyReconciler, accountReader, now }, input, { requireLease }) {
  const tokenId = normalizeRestapNetworkTokenId(String(input?.tokenId ?? ''));
  if (!EXACT_PILOT.includes(tokenId)) throw new Error('RESTAP network token is outside the pilot.');
  const integrity = await accountReader.read({ tokenId });
  if (integrity?.eligible !== true) throw new Error('RESTAP network account integrity is unavailable.');
  const reconciled = await custodyReconciler.reconcileToken({ tokenId });
  if (reconciled?.eligible !== true) throw new Error('RESTAP network custody is unavailable.');
  const custody = custodyReconciler.getEpochSnapshot({ tokenId });
  let owner;
  try { owner = getAddress(input?.identity?.owner); } catch { throw new Error('RESTAP network owner authority is unavailable.'); }
  if (!custody || custody.status !== 'ready' || owner !== custody.owner) throw new Error('RESTAP network owner authority changed.');
  const lease = readActiveLease(store, custody, now());
  if (requireLease && !lease) throw new Error('RESTAP network activation lease is unavailable.');
  return { custody, lease };
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
    "SELECT lease_id, issued_at, last_renewed_at, expires_at FROM restap_network_activation_leases WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND status = 'active' AND expires_at > ? ORDER BY issued_at DESC LIMIT 1",
    [custody.chainId, custody.collection, custody.tokenId, custody.generation, timestamp],
  );
  return row ? Object.freeze({ leaseId: row.lease_id, issuedAt: Number(row.issued_at), lastRenewedAt: Number(row.last_renewed_at), expiresAt: Number(row.expires_at) }) : null;
}

function sameTokens(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

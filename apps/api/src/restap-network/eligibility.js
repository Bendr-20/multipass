import { getAddress } from 'viem';

import { RESTAP_NETWORK_LIMITS, RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkTokenId } from './schema.js';

export const RESTAP_NETWORK_ELIGIBILITY_BOUNDARIES = Object.freeze([
  'discovery',
  'intent_lease',
  'reserve',
  'pre_dispatch',
  'pre_commit',
  'policy_mutation',
  'reply',
]);

const BOUNDARIES = new Set(RESTAP_NETWORK_ELIGIBILITY_BOUNDARIES);
const UNAVAILABLE = Object.freeze({ status: 'unavailable' });
const DIAGNOSTICS = new Set(['eligible', 'membership', 'identity', 'integrity', 'authority', 'lease', 'policy', 'roster', 'gates', 'breakers', 'peer_policy', 'topics']);
const BREAKER_SCOPES = Object.freeze(['global', 'collection', 'token', 'pair', 'provider']);
const GATE_KEYS = Object.freeze(['global', 'phase', 'collection', 'token', 'emergency']);

export function createRestapNetworkEligibilityResolver({
  now = Date.now,
  readCodexMembership,
  deriveCanonicalAccount,
  readAccountIntegrity,
  readCustody,
  readActivationLease,
  readPolicy,
  readPilotRoster,
  readGates,
  readBreakers,
  recordMetric,
  maxSafeBlockSkew = 0,
} = {}) {
  const dependencies = [now, readCodexMembership, deriveCanonicalAccount, readAccountIntegrity, readCustody, readActivationLease, readPolicy, readPilotRoster, readGates, readBreakers, recordMetric];
  if (dependencies.some((dependency) => typeof dependency !== 'function')) throw new TypeError('Eligibility resolver dependencies are invalid.');
  if (!Number.isSafeInteger(maxSafeBlockSkew) || maxSafeBlockSkew < 0 || maxSafeBlockSkew > 256) throw new TypeError('Eligibility safe block skew bound is invalid.');

  async function resolvePeerForRelay(input) {
    const request = normalizePeerRequest(input);
    let timestamp;
    try { timestamp = clock(now); } catch { emit(request.boundary, 'unavailable'); return UNAVAILABLE; }
    const sender = await loadToken(request, request.senderTokenId, request.recipientTokenId, timestamp);
    const recipient = await loadToken(request, request.recipientTokenId, request.senderTokenId, timestamp);
    let result = UNAVAILABLE;
    if (sender.ok && recipient.ok) {
      const topics = intersect(sender.policy.topics, recipient.policy.topics);
      if (peerPolicyAllows(sender, recipient, request, timestamp) && topics.length) {
        result = deepFreeze({
          status: 'eligible',
          chainId: request.chainId,
          collection: request.collection,
          senderTokenId: request.senderTokenId,
          recipientTokenId: request.recipientTokenId,
          senderAccount: sender.account,
          recipientAccount: recipient.account,
          senderIdentityId: sender.identityId,
          recipientIdentityId: recipient.identityId,
          senderCustodyGeneration: sender.custody.generation,
          recipientCustodyGeneration: recipient.custody.generation,
          senderActivationLeaseId: sender.lease.leaseId,
          recipientActivationLeaseId: recipient.lease.leaseId,
          senderPolicyVersion: sender.policy.policyVersion,
          recipientPolicyVersion: recipient.policy.policyVersion,
          topics,
        });
      }
    }
    emit(request.boundary, result.status);
    return result;
  }

  async function resolveSelfForConsole(input) {
    const request = normalizeSelfRequest(input);
    let timestamp;
    try { timestamp = clock(now); } catch { emit(request.boundary, 'unavailable'); return UNAVAILABLE; }
    const state = await loadToken(request, request.tokenId, null, timestamp);
    if (!state.ownerVerified || state.custody.owner !== request.owner) {
      emit(request.boundary, 'unavailable');
      return UNAVAILABLE;
    }
    if (!state.ok) {
      const diagnostic = DIAGNOSTICS.has(state.diagnostic) ? state.diagnostic : 'integrity';
      emit(request.boundary, 'unavailable');
      return deepFreeze({ status: 'unavailable', diagnostic, transcriptCapability: 'unavailable' });
    }
    emit(request.boundary, 'eligible');
    return deepFreeze({
      status: 'eligible',
      diagnostic: 'eligible',
      chainId: request.chainId,
      collection: request.collection,
      tokenId: request.tokenId,
      canonicalAccount: state.account,
      identityId: state.identityId,
      custodyGeneration: state.custody.generation,
      policyVersion: state.policy.policyVersion,
      topics: state.policy.topics,
      transcriptCapability: 'unavailable',
    });
  }

  async function loadToken(request, tokenId, peerTokenId, timestamp) {
    const common = deepFreeze({ chainId: request.chainId, collection: request.collection, tokenId });
    const gateRequest = deepFreeze({ ...common, boundary: request.boundary });
    const breakerRequest = deepFreeze({ ...gateRequest, peerTokenId });
    const values = await Promise.all([
      safeRead(() => readCodexMembership(common)),
      safeRead(() => deriveCanonicalAccount(deepFreeze({ tokenId }))),
      safeRead(() => readAccountIntegrity(deepFreeze({ tokenId }))),
      safeRead(() => readCustody(deepFreeze({ tokenId }))),
      safeRead(() => readActivationLease(common)),
      safeRead(() => readPolicy(common)),
      safeRead(() => readPilotRoster(common)),
      safeRead(() => readGates(gateRequest)),
      safeRead(() => readBreakers(breakerRequest)),
    ]);
    const [codexRaw, derivedRaw, integrityRaw, custodyRaw, leaseRaw, policyRaw, rosterRaw, gatesRaw, breakersRaw] = values;

    let codex;
    try { codex = normalizeCodex(codexRaw); } catch { return failed('membership'); }
    if (!codex.member) return failed('membership');

    let account;
    try { account = getAddress(derivedRaw); } catch { return failed('identity'); }

    let integrity;
    try { integrity = normalizeIntegrity(integrityRaw); } catch { return failed('integrity'); }
    if (!integrity.eligible || integrity.status !== 'ready' || !integrity.proof) return failed('integrity');

    let custody;
    try { custody = normalizeCustody(custodyRaw); } catch { return failed('authority'); }
    const proof = integrity.proof;
    const identityMatches = proof.chainId === request.chainId
      && proof.collection === request.collection
      && proof.tokenId === tokenId
      && proof.account === account
      && custody.chainId === request.chainId
      && custody.collection === request.collection
      && custody.tokenId === tokenId
      && custody.canonicalAccount === account;
    if (!identityMatches) return failed('identity', custody);
    const exactSafeBlock = proof.safeBlock.number === custody.safeBlockNumber && proof.safeBlock.hash === custody.safeBlockHash;
    const safeBlockSkew = Math.abs(proof.safeBlock.number - custody.safeBlockNumber);
    const boundedSafeBlockSkew = proof.safeBlock.number !== custody.safeBlockNumber && safeBlockSkew <= maxSafeBlockSkew;
    const authorityMatches = custody.status === 'ready'
      && proof.owner === custody.owner
      && proof.controller === custody.controller
      && proof.latest.owner === custody.owner
      && proof.latest.controller === custody.controller
      && (exactSafeBlock || boundedSafeBlockSkew);
    if (!authorityMatches) return failed('authority', custody);
    const ownerVerified = true;

    let lease;
    try { lease = normalizeLease(leaseRaw); } catch { return failed('lease', custody, ownerVerified); }
    if (lease.status !== 'active'
      || lease.issuedAt > lease.lastRenewedAt
      || lease.lastRenewedAt > timestamp
      || lease.expiresAt <= timestamp
      || lease.expiresAt - lease.lastRenewedAt > RESTAP_NETWORK_LIMITS.activationLeaseTtlMs
      || lease.chainId !== request.chainId
      || lease.collection !== request.collection
      || lease.tokenId !== tokenId
      || lease.custodyGeneration !== custody.generation
      || lease.canonicalAccount !== account
      || lease.owner !== custody.owner
      || lease.controller !== custody.controller) return failed('lease', custody, ownerVerified);

    let policy;
    try { policy = normalizePolicy(policyRaw, custody.generation, tokenId); } catch { return failed('policy', custody, ownerVerified); }
    if (!policy.networkEnabled) return failed('policy', custody, ownerVerified);
    if (rosterRaw !== true) return failed('roster', custody, ownerVerified);

    let gates;
    try { gates = normalizeGates(gatesRaw); } catch { return failed('gates', custody, ownerVerified); }
    if (!gates.global || !gates.phase || !gates.collection || !gates.token || gates.emergency) return failed('gates', custody, ownerVerified);

    let breakers;
    try { breakers = normalizeBreakers(breakersRaw); } catch { return failed('breakers', custody, ownerVerified); }
    if (BREAKER_SCOPES.some((scope) => breakers[scope] !== 'closed')) return failed('breakers', custody, ownerVerified);

    return { ok: true, ownerVerified, account, identityId: codex.identityId, custody, lease, policy };
  }

  function emit(boundary, outcome) {
    try { recordMetric(deepFreeze({ boundary, outcome: outcome === 'eligible' ? 'eligible' : 'unavailable' })); } catch {}
  }

  return Object.freeze({ resolveSelfForConsole, resolvePeerForRelay });
}

function peerPolicyAllows(sender, recipient, request, timestamp) {
  if (!recipient.policy.inboundEnabled) return false;
  if (isMuted(sender.policy, timestamp) || isMuted(recipient.policy, timestamp)) return false;
  if (sender.policy.blockTokenIds.includes(request.recipientTokenId) || recipient.policy.blockTokenIds.includes(request.senderTokenId)) return false;
  if (sender.policy.allowTokenIds.length && !sender.policy.allowTokenIds.includes(request.recipientTokenId)) return false;
  if (recipient.policy.allowTokenIds.length && !recipient.policy.allowTokenIds.includes(request.senderTokenId)) return false;
  return true;
}

function isMuted(policy, timestamp) { return policy.muteUntil !== null && policy.muteUntil > timestamp; }
function intersect(left, right) { const allowed = new Set(right); return Object.freeze(left.filter((topic) => allowed.has(topic)).sort()); }
function failed(diagnostic, custody = null, ownerVerified = false) { return { ok: false, diagnostic, custody, ownerVerified }; }
async function safeRead(read) { try { return await Promise.resolve().then(read); } catch { return null; } }

function normalizePeerRequest(value) {
  exactObject(value, ['chainId', 'collection', 'senderTokenId', 'recipientTokenId', 'boundary'], 'Eligibility peer request');
  const senderTokenId = normalizeRestapNetworkTokenId(value.senderTokenId);
  const recipientTokenId = normalizeRestapNetworkTokenId(value.recipientTokenId);
  if (senderTokenId === recipientTokenId) throw new TypeError('Eligibility relay token IDs must differ.');
  return deepFreeze({ chainId: positiveInteger(value.chainId, 'Eligibility chain ID'), collection: getAddress(value.collection), senderTokenId, recipientTokenId, boundary: boundary(value.boundary) });
}

function normalizeSelfRequest(value) {
  exactObject(value, ['chainId', 'collection', 'tokenId', 'owner', 'boundary'], 'Eligibility self request');
  return deepFreeze({ chainId: positiveInteger(value.chainId, 'Eligibility chain ID'), collection: getAddress(value.collection), tokenId: normalizeRestapNetworkTokenId(value.tokenId), owner: getAddress(value.owner), boundary: boundary(value.boundary) });
}

function normalizeCodex(value) {
  plainObject(value, 'Codex membership');
  const identityId = value.identityId === null ? null : value.identityId;
  if (typeof value.member !== 'boolean' || (identityId !== null && (typeof identityId !== 'string' || !/^[A-Za-z0-9:._-]{1,128}$/u.test(identityId)))) throw new TypeError('Codex membership is invalid.');
  return { member: value.member, identityId };
}

function normalizeIntegrity(value) {
  plainObject(value, 'Account integrity');
  if (typeof value.eligible !== 'boolean' || typeof value.status !== 'string') throw new TypeError('Account integrity result is invalid.');
  if (!value.eligible) return { eligible: false, status: value.status, proof: null };
  plainObject(value.proof, 'Account integrity proof');
  plainObject(value.proof.safeBlock, 'Account integrity safe block');
  plainObject(value.proof.latest, 'Account integrity latest authority');
  return {
    eligible: true,
    status: value.status,
    proof: {
      chainId: positiveInteger(value.proof.chainId, 'Integrity chain ID'),
      collection: getAddress(value.proof.collection),
      tokenId: normalizeRestapNetworkTokenId(value.proof.tokenId),
      account: getAddress(value.proof.account),
      owner: getAddress(value.proof.owner),
      controller: getAddress(value.proof.controller),
      safeBlock: { number: nonNegativeInteger(value.proof.safeBlock.number, 'Integrity safe block'), hash: hash(value.proof.safeBlock.hash) },
      latest: { owner: getAddress(value.proof.latest.owner), controller: getAddress(value.proof.latest.controller) },
    },
  };
}

function normalizeCustody(value) {
  plainObject(value, 'Custody snapshot');
  return {
    chainId: positiveInteger(value.chainId, 'Custody chain ID'),
    collection: getAddress(value.collection),
    tokenId: normalizeRestapNetworkTokenId(value.tokenId),
    generation: positiveInteger(value.generation, 'Custody generation'),
    canonicalAccount: getAddress(value.canonicalAccount),
    owner: getAddress(value.owner),
    controller: getAddress(value.controller),
    safeBlockNumber: nonNegativeInteger(value.safeBlockNumber, 'Custody safe block'),
    safeBlockHash: hash(value.safeBlockHash),
    status: String(value.status ?? ''),
  };
}

function normalizeLease(value) {
  plainObject(value, 'Activation lease');
  const leaseId = String(value.leaseId ?? '');
  if (!/^[0-9a-f]{32}$/u.test(leaseId)) throw new TypeError('Activation lease ID is invalid.');
  return {
    leaseId,
    chainId: positiveInteger(value.chainId, 'Lease chain ID'),
    collection: getAddress(value.collection),
    tokenId: normalizeRestapNetworkTokenId(value.tokenId),
    custodyGeneration: positiveInteger(value.custodyGeneration, 'Lease custody generation'),
    canonicalAccount: getAddress(value.canonicalAccount),
    owner: getAddress(value.owner),
    controller: getAddress(value.controller),
    issuedAt: nonNegativeInteger(value.issuedAt, 'Lease issuance time'),
    lastRenewedAt: nonNegativeInteger(value.lastRenewedAt, 'Lease renewal time'),
    expiresAt: nonNegativeInteger(value.expiresAt, 'Lease expiry'),
    status: String(value.status ?? ''),
  };
}

function normalizePolicy(value, custodyGeneration, selfTokenId) {
  plainObject(value, 'Owner policy');
  const topics = closedStringArray(value.topics, new Set(RESTAP_NETWORK_TOPICS), 'Policy topics');
  const allowTokenIds = tokenArray(value.allowTokenIds, 'Policy allow list');
  const blockTokenIds = tokenArray(value.blockTokenIds, 'Policy block list');
  if (allowTokenIds.includes(selfTokenId) || blockTokenIds.includes(selfTokenId)) throw new TypeError('Policy peer lists include self.');
  if (allowTokenIds.some((tokenId) => blockTokenIds.includes(tokenId))) throw new TypeError('Policy peer lists overlap.');
  const muteUntil = value.muteUntil === null ? null : nonNegativeInteger(value.muteUntil, 'Policy mute time');
  if (typeof value.networkEnabled !== 'boolean' || typeof value.inboundEnabled !== 'boolean') throw new TypeError('Owner policy flags are invalid.');
  if (nonNegativeInteger(value.custodyGeneration, 'Policy custody generation') !== custodyGeneration) throw new TypeError('Owner policy custody generation is stale.');
  return {
    policyVersion: positiveInteger(value.policyVersion, 'Policy version'),
    custodyGeneration,
    networkEnabled: value.networkEnabled,
    inboundEnabled: value.inboundEnabled,
    topics,
    allowTokenIds,
    blockTokenIds,
    muteUntil,
  };
}

function normalizeGates(value) {
  exactObject(value, GATE_KEYS, 'Eligibility gates');
  const result = {};
  for (const key of GATE_KEYS) {
    if (typeof value[key] !== 'boolean') throw new TypeError('Eligibility gate is invalid.');
    result[key] = value[key];
  }
  return result;
}

function normalizeBreakers(value) {
  exactObject(value, BREAKER_SCOPES, 'Eligibility breakers');
  const result = {};
  for (const scope of BREAKER_SCOPES) {
    if (value[scope] !== 'closed' && value[scope] !== 'open') throw new TypeError('Eligibility breaker state is invalid.');
    result[scope] = value[scope];
  }
  return result;
}

function tokenArray(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError(label + ' is invalid.');
  const normalized = value.map(normalizeRestapNetworkTokenId);
  if (new Set(normalized).size !== normalized.length) throw new TypeError(label + ' contains duplicates.');
  return Object.freeze(normalized.sort(compareTokenIds));
}

function closedStringArray(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.size || value.some((item) => typeof item !== 'string' || !allowed.has(item)) || new Set(value).size !== value.length) throw new TypeError(label + ' is invalid.');
  return Object.freeze([...value].sort());
}

function exactObject(value, keys, label) {
  plainObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new TypeError(label + ' contains unknown key "' + key + '".');
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(label + ' is missing required key "' + key + '".');
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be a plain object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(label + ' must be a plain object.');
}
function boundary(value) { if (typeof value !== 'string' || !BOUNDARIES.has(value)) throw new TypeError('Eligibility boundary is invalid.'); return value; }
function hash(value) { const normalized = String(value ?? '').toLowerCase(); if (!/^0x[0-9a-f]{64}$/u.test(normalized)) throw new TypeError('Eligibility hash is invalid.'); return normalized; }
function positiveInteger(value, label) { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' is invalid.'); return value; }
function nonNegativeInteger(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' is invalid.'); return value; }
function clock(now) { return nonNegativeInteger(now(), 'Eligibility clock'); }
function compareTokenIds(left, right) { return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0; }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }

import { createHash } from 'node:crypto';

import { getAddress } from 'viem';

import { RESTAP_NETWORK_INTERNAL_PATHS, RESTAP_NETWORK_LIMITS, RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkReply } from './conversations.js';
import { canonicalizeRestapNetworkJson } from './jcs.js';
import {
  normalizeRestapNetworkMessageEnvelope,
  normalizeRestapNetworkOperationOutcome,
  normalizeRestapNetworkTokenId,
} from './schema.js';

const FACTORY_KEYS = Object.freeze([
  'coordinator', 'grantService', 'eligibility', 'conversations', 'runtime', 'now', 'readBoundaryState',
  'readDiscovery', 'readDueIntent', 'onBoundary',
]);
const CREATE_KEYS = Object.freeze(['expectedPolicyVersion', 'intentId']);
const INTENT_KEYS = Object.freeze([
  'canonicalBody', 'chainId', 'collection', 'correlationId', 'costUnits', 'expectedPolicyVersion',
  'idempotencyKey', 'intentId', 'nonce', 'operation', 'recipientTokenId', 'senderTokenId', 'topic',
]);
const GRANT_KEYS = Object.freeze(['canonicalBody', 'operationId']);
const DELIVERY_KEYS = Object.freeze(['grant', 'message', 'operationId']);
const DISCOVERY_KEYS = Object.freeze(['operationId', 'recipientTokenId']);
const FINALIZE_KEYS = Object.freeze(['operationId', 'outcome']);
const IDENTIFIER = /^[A-Za-z0-9_-]{32,128}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,256}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const PROVIDER_READY = Object.freeze({ relayProviderResult: 'ready' });
const SENSITIVE_TTL_MS = RESTAP_NETWORK_LIMITS.conversationTtlMs;

export function createRestapNetworkRelay(options = {}) {
  exactObject(options, FACTORY_KEYS, 'relay dependencies', { optional: new Set(['onBoundary']) });
  const state = normalizeDependencies(options);
  return Object.freeze({
    createDueOperation: (input) => createDueOperation(state, input),
    mintRelayGrant: (input) => mintRelayGrant(state, input),
    readInternalDiscovery: (input) => readInternalDiscovery(state, input),
    deliverOpening: (input) => deliverOpening(state, input),
    deliverReply: (input) => deliverReply(state, input),
    finalizeOperation: (input) => finalizeOperation(state, input),
  });
}

export async function createDueOperation(state, input) {
  const context = requireState(state);
  prune(context);
  exactObject(input, CREATE_KEYS, 'due operation request');
  const intentId = normalizeOpaque(input.intentId, 'intentId');
  const expectedPolicyVersion = nonNegativeInteger(input.expectedPolicyVersion, 'expectedPolicyVersion');
  const key = intentId + '|' + expectedPolicyVersion;
  const existingFlight = context.createFlights.get(key);
  if (existingFlight) return existingFlight;
  const flight = createDueOperationOnce(context, { intentId, expectedPolicyVersion })
    .finally(() => context.createFlights.delete(key));
  context.createFlights.set(key, flight);
  return flight;
}

async function createDueOperationOnce(context, request) {
  const resolved = normalizeDueIntent(await context.readDueIntent(deepFreeze(request)));
  if (resolved.intentId !== request.intentId || resolved.expectedPolicyVersion !== request.expectedPolicyVersion) throw new Error('RESTAP network due intent authority mismatch.');
  const duplicateKey = resolved.intentId + '|' + resolved.expectedPolicyVersion;
  const knownId = context.dueIndex.get(duplicateKey);
  if (knownId) return projection(context.operations.get(knownId), true);

  const authority = await resolveAuthority(context, resolved, 'reserve');
  if (!authority) throw new Error('RESTAP network relay unavailable.');
  const boundary = await readBoundary(context, resolved, 'reserve');
  const bodyHash = hashCanonicalBody(resolved.canonicalBody);
  const snapshot = createSnapshot(authority, boundary, bodyHash);
  const reserved = context.coordinator.reserve({
    operationKind: resolved.operation,
    snapshot,
    idempotencyKey: resolved.idempotencyKey,
    nonce: resolved.nonce,
    costUnits: resolved.costUnits,
    conversationId: resolved.correlationId,
    topic: resolved.topic,
  });
  if (resolved.canonicalBody.operation_id !== reserved.operationId) {
    if (reserved.status === 'reserved') context.coordinator.release({ operationId: reserved.operationId });
    throw new Error('RESTAP network canonical operation ID mismatch.');
  }
  if (reserved.snapshot.bodyHash !== bodyHash) throw new Error('RESTAP network durable body hash mismatch.');
  const record = {
    operationId: reserved.operationId,
    operation: resolved.operation,
    intentId: resolved.intentId,
    expectedPolicyVersion: resolved.expectedPolicyVersion,
    chainId: resolved.chainId,
    collection: resolved.collection,
    senderTokenId: resolved.senderTokenId,
    recipientTokenId: resolved.recipientTokenId,
    topic: resolved.topic,
    idempotencyKey: resolved.idempotencyKey,
    correlationId: resolved.correlationId,
    costUnits: resolved.costUnits,
    nonce: resolved.nonce,
    bodyHash,
    authority,
    snapshot,
    createdAt: reserved.createdAt,
    expiresAt: reserved.createdAt + SENSITIVE_TTL_MS,
    grant: null,
    grantPayload: null,
    pending: null,
    completedStatus: null,
    completedSequence: null,
  };
  context.operations.set(record.operationId, record);
  context.dueIndex.set(duplicateKey, record.operationId);
  return projection(record, reserved.joined === true);
}

export async function mintRelayGrant(state, input) {
  const context = requireState(state);
  prune(context);
  exactObject(input, GRANT_KEYS, 'relay grant request');
  const operationId = normalizeOpaque(input.operationId, 'operationId');
  const body = normalizeRestapNetworkMessageEnvelope(input.canonicalBody);
  const record = requireRecord(context, operationId);
  assertEnvelope(record, body);
  if (hashCanonicalBody(body) !== record.bodyHash) throw authenticationError();
  if (record.grant) return record.grant;
  const existingFlight = context.grantFlights.get(operationId);
  if (existingFlight) return existingFlight;
  const flight = mintRelayGrantOnce(context, record).finally(() => context.grantFlights.delete(operationId));
  context.grantFlights.set(operationId, flight);
  return flight;
}

async function mintRelayGrantOnce(context, record) {
  const operation = context.coordinator.getOperation(record.operationId);
  assertDurableOperation(record, operation, 'reserved');
  const issuedAt = seconds(context.now());
  const payload = grantPayload(record, issuedAt);
  const grant = await context.grantService.issue(payload);
  record.grantPayload = payload;
  record.grant = grant;
  return grant;
}

export async function readInternalDiscovery(state, input) {
  const context = requireState(state);
  prune(context);
  exactObject(input, DISCOVERY_KEYS, 'internal discovery request');
  const operationId = normalizeOpaque(input.operationId, 'operationId');
  const recipientTokenId = normalizeRestapNetworkTokenId(input.recipientTokenId);
  const record = requireRecord(context, operationId);
  if (recipientTokenId !== record.recipientTokenId || !record.grant || !record.grantPayload) throw authenticationError();
  const verified = await context.grantService.verify({ grant: record.grant, expectedPayload: record.grantPayload });
  if (verified.status !== 'verified') throw authenticationError();
  const operation = context.coordinator.getOperation(operationId);
  assertDurableOperation(record, operation, 'reserved');
  const fresh = await freshAt(context, record, 'before_discovery', 'discovery');
  if (!fresh || !snapshotsEqual(record.snapshot, fresh)) throw new Error('RESTAP network relay unavailable.');
  return deepFreeze({
    status: 'available',
    operationId,
    discovery: await context.readDiscovery(deepFreeze({
      chainId: record.chainId,
      collection: record.collection,
      tokenId: record.recipientTokenId,
    })),
  });
}

export async function deliverOpening(state, input) {
  return deliver(state, input, 'opening');
}

export async function deliverReply(state, input) {
  return deliver(state, input, 'reply');
}

async function deliver(state, input, expectedOperation) {
  const context = requireState(state);
  prune(context);
  exactObject(input, DELIVERY_KEYS, 'relay delivery request');
  const operationId = normalizeOpaque(input.operationId, 'operationId');
  const key = expectedOperation + '|' + operationId;
  const existingFlight = context.deliveryFlights.get(key);
  if (existingFlight) return existingFlight;
  const flight = deliverOnce(context, input, expectedOperation).finally(() => context.deliveryFlights.delete(key));
  context.deliveryFlights.set(key, flight);
  return flight;
}

async function deliverOnce(context, input, expectedOperation) {
  const { record, message } = await authenticate(context, input, expectedOperation);
  if (record.completedStatus) return deepFreeze({ status: record.completedStatus, operationId: record.operationId, deliverySequence: record.completedSequence });
  const current = context.coordinator.getOperation(record.operationId);
  if (current.status === 'committed') return resumeCommittedDelivery(context, record, message);
  if (current.status === 'provider_dispatched') {
    if (!record.pending) return context.coordinator.markChargedUnknown({ operationId: record.operationId });
    return commitAndDeliver(context, record, message);
  }
  assertDurableOperation(record, current, 'reserved');

  const preDispatch = await freshAt(context, record, 'before_dispatch', 'pre_dispatch');
  if (!preDispatch || !snapshotsEqual(record.snapshot, preDispatch)) return releaseReserved(context, record);
  const version = captureConversationVersion(context, record, message);
  let dispatched;
  try {
    dispatched = await context.coordinator.dispatchProvider({
      operationId: record.operationId,
      freshSnapshot: preDispatch,
      callProvider: async () => {
        const request = inferenceRequest(context, record, message, version);
        const pending = Promise.resolve().then(() => context.runtime.generate(request));
        await emitBoundary(context, record, 'during_inference');
        const output = normalizeRestapNetworkReply(await pending);
        record.pending = { output, version, conversationId: null, deliveryId: null, applied: false };
        return PROVIDER_READY;
      },
    });
  } catch (error) {
    terminalizePostDispatch(context, record);
    throw error;
  }
  if (isCoordinatorTerminal(dispatched)) return deepFreeze(dispatched);
  if (dispatched !== PROVIDER_READY && dispatched?.relayProviderResult !== 'ready') {
    terminalizePostDispatch(context, record);
    throw new Error('RESTAP network provider result is invalid.');
  }
  return commitAndDeliver(context, record, message);
}

async function commitAndDeliver(context, record, message) {
  const preCommit = await freshAt(context, record, 'before_commit', 'pre_commit');
  if (!preCommit || !snapshotsEqual(record.snapshot, preCommit)) {
    record.pending = null;
    return cancelDispatched(context, record);
  }
  try {
    const pending = requirePending(record);
    assertConversationVersion(context, record, message, pending.version);
    const committed = context.coordinator.commitAfterRecheck({
      operationId: record.operationId,
      freshSnapshot: preCommit,
      contentHash: saltedContentHash(record.nonce, record.operationId, pending.output),
      speakerClass: pending.version.responseSpeaker,
    });
    if (committed.status !== 'committed') {
      record.pending = null;
      return deepFreeze(committed);
    }
    await emitBoundary(context, record, 'after_commit');
    return resumeCommittedDelivery(context, record, message, committed.deliverySequence);
  } catch (error) {
    terminalizePostDispatch(context, record);
    throw error;
  }
}

async function resumeCommittedDelivery(context, record, message, deliverySequence = null) {
  const pending = requirePending(record);
  try {
    if (!pending.applied) {
      if (record.operation === 'opening') {
        if (!pending.conversationId) {
          const opened = context.conversations.open({
            senderTokenId: record.senderTokenId,
            recipientTokenId: record.recipientTokenId,
            topic: record.topic,
            opening: message.message,
          });
          pending.conversationId = opened.conversationId;
          await emitBoundary(context, record, 'after_conversation_open');
        }
        if (!pending.deliveryId) {
          const delivery = context.conversations.beginDelivery({ conversationId: pending.conversationId, speaker: 'recipient' });
          pending.deliveryId = delivery.deliveryId;
        }
      } else {
        assertConversationVersion(context, record, message, pending.version);
        pending.conversationId = pending.version.conversationId;
        if (!pending.deliveryId) {
          const delivery = context.conversations.beginDelivery({ conversationId: pending.conversationId, speaker: pending.version.responseSpeaker });
          pending.deliveryId = delivery.deliveryId;
        }
      }
      reconcilePendingApplication(context, record, pending);
      if (!pending.applied) {
        context.conversations.commitDelivery({
          conversationId: pending.conversationId,
          deliveryId: pending.deliveryId,
          output: pending.output,
        });
        pending.applied = true;
        pending.output = null;
      }
      await emitBoundary(context, record, 'after_conversation_commit');
    }
    await emitBoundary(context, record, 'before_delivery_marker');
    context.coordinator.markDeliveryDelivered({ operationId: record.operationId });
    record.pending = null;
    record.completedStatus = 'delivered';
    record.completedSequence = deliverySequence;
    return deepFreeze({ status: 'delivered', operationId: record.operationId, deliverySequence });
  } catch (error) {
    // A committed operation remains resumable from its bounded pending stage.
    throw error;
  }
}

function reconcilePendingApplication(context, record, pending) {
  if (pending.applied) return;
  const current = context.conversations.get({ conversationId: pending.conversationId });
  const expectedTurns = record.operation === 'opening' ? 1 : pending.version.turnCount;
  if (current.turnCount === expectedTurns) return;
  const last = current.messages?.at(-1);
  if (current.turnCount === expectedTurns + 1 && last?.speaker === pending.version.responseSpeaker && last?.text === pending.output) {
    pending.applied = true;
    pending.output = null;
    return;
  }
  throw new Error('RESTAP network conversation state changed.');
}

export async function finalizeOperation(state, input) {
  const context = requireState(state);
  prune(context);
  exactObject(input, FINALIZE_KEYS, 'operation finalization');
  const operationId = normalizeOpaque(input.operationId, 'operationId');
  const outcome = normalizeRestapNetworkOperationOutcome(input.outcome);
  const record = requireRecord(context, operationId);
  const current = context.coordinator.getOperation(operationId);
  if (outcome.state === 'committed') {
    if (current.status !== 'committed') throw new Error('RESTAP network operation is not committed.');
    return deepFreeze({ status: 'committed', operationId, reason: outcome.reason });
  }
  const fresh = await freshAt(context, record, 'before_finalize', 'pre_commit');
  const exact = fresh && snapshotsEqual(record.snapshot, fresh);
  if (outcome.state === 'released') {
    if (current.status !== 'reserved') throw new Error('RESTAP network operation cannot be released.');
    return deepFreeze(context.coordinator.release({ operationId }));
  }
  if (current.status !== 'provider_dispatched') throw new Error('RESTAP network charged finalization requires provider dispatch.');
  if (outcome.state === 'charged_unknown') return deepFreeze(context.coordinator.markChargedUnknown({ operationId }));
  if (outcome.state === 'cancelled_charged' || !exact) return deepFreeze(context.coordinator.markCancelledCharged({ operationId }));
  if (outcome.state === 'failed_charged') return deepFreeze(context.coordinator.markFailedCharged({ operationId }));
  throw new Error('RESTAP network finalization is invalid.');
}

async function authenticate(context, input, expectedOperation) {
  exactObject(input, DELIVERY_KEYS, 'relay delivery request');
  const operationId = normalizeOpaque(input.operationId, 'operationId');
  const message = normalizeRestapNetworkMessageEnvelope(input.message);
  const record = requireRecord(context, operationId);
  if (record.operation !== expectedOperation) throw authenticationError();
  assertEnvelope(record, message);
  if (hashCanonicalBody(message) !== record.bodyHash || !record.grantPayload) throw authenticationError();
  const verified = await context.grantService.verify({ grant: input.grant, expectedPayload: record.grantPayload });
  if (verified.status !== 'verified') throw authenticationError();
  const operation = context.coordinator.getOperation(operationId);
  assertDurableOperation(record, operation, operation.status);
  if (!['reserved', 'provider_dispatched', 'committed'].includes(operation.status)) throw authenticationError();
  return { record, message };
}

function assertDurableOperation(record, operation, expectedStatus) {
  if (!operation || operation.operationId !== record.operationId || operation.operationKind !== record.operation
    || operation.status !== expectedStatus || operation.costUnits !== record.costUnits
    || !snapshotsEqual(operation.snapshot, record.snapshot)) throw authenticationError();
  if (record.grantPayload) {
    const payload = record.grantPayload;
    const reservation = reservationFor(record);
    if (payload.operation_id !== operation.operationId || payload.operation !== operation.operationKind
      || payload.path !== RESTAP_NETWORK_INTERNAL_PATHS[record.operation]
      || payload.body_sha256 !== operation.snapshot.bodyHash
      || payload.sender_token_id !== operation.snapshot.senderTokenId
      || payload.recipient_token_id !== operation.snapshot.recipientTokenId
      || payload.sender_custody_epoch !== operation.snapshot.senderCustodyGeneration
      || payload.recipient_custody_epoch !== operation.snapshot.recipientCustodyGeneration
      || payload.sender_activation_lease_id !== operation.snapshot.senderLeaseId
      || payload.recipient_activation_lease_id !== operation.snapshot.recipientLeaseId
      || payload.sender_policy_version !== operation.snapshot.senderPolicyVersion
      || payload.recipient_policy_version !== operation.snapshot.recipientPolicyVersion
      || payload.nonce !== record.nonce || payload.correlation_id !== record.correlationId
      || canonicalizeRestapNetworkJson(payload.reservation) !== canonicalizeRestapNetworkJson(reservation)) throw authenticationError();
  }
}

function assertEnvelope(record, message) {
  const direct = message.sender_token_id === record.senderTokenId && message.recipient_token_id === record.recipientTokenId;
  const reverse = message.sender_token_id === record.recipientTokenId && message.recipient_token_id === record.senderTokenId;
  if (message.operation_id !== record.operationId || (!direct && !(record.operation === 'reply' && reverse))
    || message.topic !== record.topic || message.conversation_id !== record.correlationId) throw authenticationError();
  if (record.operation === 'opening' && message.turn_index !== 0) throw authenticationError();
}

function captureConversationVersion(context, record, message) {
  if (record.operation === 'opening') return deepFreeze({ conversationId: message.conversation_id, turnCount: 0, nextSpeaker: 'sender', responseSpeaker: 'recipient' });
  const conversation = context.conversations.get({ conversationId: message.conversation_id });
  if (!conversation || conversation.status !== 'active' || !Array.isArray(conversation.messages)
    || conversation.turnCount < 1 || message.turn_index !== conversation.turnCount - 1) throw authenticationError();
  const last = conversation.messages.at(-1);
  if (!last || last.turnIndex !== message.turn_index || last.text !== message.message) throw authenticationError();
  const senderSpeaker = message.sender_token_id === record.senderTokenId ? 'sender' : 'recipient';
  if (last.speaker !== senderSpeaker || conversation.nextSpeaker === senderSpeaker) throw authenticationError();
  return deepFreeze({
    conversationId: conversation.conversationId,
    turnCount: conversation.turnCount,
    nextSpeaker: conversation.nextSpeaker,
    responseSpeaker: conversation.nextSpeaker,
  });
}

function assertConversationVersion(context, record, message, version) {
  if (record.operation === 'opening') return;
  const current = context.conversations.get({ conversationId: version.conversationId });
  if (current.status !== 'active' || current.turnCount !== version.turnCount || current.nextSpeaker !== version.nextSpeaker) throw new Error('RESTAP network conversation state changed.');
  const last = current.messages.at(-1);
  if (!last || last.turnIndex !== message.turn_index || last.text !== message.message) throw new Error('RESTAP network conversation state changed.');
}

function inferenceRequest(context, record, message, version) {
  const senderIdentity = identity(record, 'sender');
  const recipientIdentity = identity(record, 'recipient');
  if (record.operation === 'opening') return deepFreeze({
    recipientIdentity,
    senderIdentity,
    topic: record.topic,
    transcript: [deepFreeze({ speaker: 'sender', text: message.message, turnIndex: 0, createdAt: record.createdAt })],
  });
  const conversation = context.conversations.get({ conversationId: version.conversationId });
  const targetIsSender = version.responseSpeaker === 'sender';
  return deepFreeze({
    recipientIdentity: targetIsSender ? senderIdentity : recipientIdentity,
    senderIdentity: targetIsSender ? recipientIdentity : senderIdentity,
    topic: record.topic,
    transcript: conversation.messages.map((entry) => deepFreeze({
      speaker: entry.speaker,
      text: entry.text,
      turnIndex: entry.turnIndex,
      createdAt: entry.createdAt,
    })),
  });
}

async function freshAt(context, record, hookBoundary, eligibilityBoundary) {
  await emitBoundary(context, record, hookBoundary);
  const authority = await resolveAuthority(context, record, eligibilityBoundary);
  if (!authority) return null;
  let boundary;
  try { boundary = await readBoundary(context, record, eligibilityBoundary); } catch { return null; }
  return createSnapshot(authority, boundary, record.bodyHash);
}

async function resolveAuthority(context, request, boundary) {
  let result;
  try {
    result = await context.eligibility.resolvePeerForRelay(deepFreeze({
      chainId: request.chainId,
      collection: request.collection,
      senderTokenId: request.senderTokenId,
      recipientTokenId: request.recipientTokenId,
      boundary,
    }));
  } catch { return null; }
  if (!result || result.status !== 'eligible') return null;
  try {
    if (result.chainId !== request.chainId || getAddress(result.collection) !== request.collection
      || normalizeRestapNetworkTokenId(result.senderTokenId) !== request.senderTokenId
      || normalizeRestapNetworkTokenId(result.recipientTokenId) !== request.recipientTokenId
      || !Array.isArray(result.topics) || !result.topics.includes(request.topic)) return null;
    return deepFreeze({
      senderTokenId: request.senderTokenId,
      recipientTokenId: request.recipientTokenId,
      senderAccount: getAddress(result.senderAccount),
      recipientAccount: getAddress(result.recipientAccount),
      senderIdentityId: normalizeIdentityId(result.senderIdentityId),
      recipientIdentityId: normalizeIdentityId(result.recipientIdentityId),
      senderCustodyGeneration: nonNegativeInteger(result.senderCustodyGeneration, 'sender custody generation'),
      recipientCustodyGeneration: nonNegativeInteger(result.recipientCustodyGeneration, 'recipient custody generation'),
      senderActivationLeaseId: normalizeIdentifier(result.senderActivationLeaseId, 'sender lease'),
      recipientActivationLeaseId: normalizeIdentifier(result.recipientActivationLeaseId, 'recipient lease'),
      senderPolicyVersion: nonNegativeInteger(result.senderPolicyVersion, 'sender policy version'),
      recipientPolicyVersion: nonNegativeInteger(result.recipientPolicyVersion, 'recipient policy version'),
    });
  } catch { return null; }
}

async function readBoundary(context, record, boundary) {
  return normalizeBoundaryState(await context.readBoundaryState(deepFreeze({
    chainId: record.chainId,
    collection: record.collection,
    senderTokenId: record.senderTokenId,
    recipientTokenId: record.recipientTokenId,
    boundary,
  })));
}

function normalizeDueIntent(value) {
  exactObject(value, INTENT_KEYS, 'resolved due intent');
  if (!['opening', 'reply'].includes(value.operation)) throw new TypeError('RESTAP network due operation is invalid.');
  const canonicalBody = normalizeRestapNetworkMessageEnvelope(value.canonicalBody);
  const result = {
    intentId: normalizeOpaque(value.intentId, 'intentId'),
    expectedPolicyVersion: nonNegativeInteger(value.expectedPolicyVersion, 'expectedPolicyVersion'),
    operation: value.operation,
    chainId: positiveInteger(value.chainId, 'chainId'),
    collection: getAddress(value.collection),
    senderTokenId: normalizeRestapNetworkTokenId(value.senderTokenId),
    recipientTokenId: normalizeRestapNetworkTokenId(value.recipientTokenId),
    topic: value.topic,
    idempotencyKey: normalizeOpaque(value.idempotencyKey, 'idempotencyKey'),
    correlationId: normalizeIdentifier(value.correlationId, 'correlationId'),
    nonce: normalizeIdentifier(value.nonce, 'nonce'),
    costUnits: positiveInteger(value.costUnits, 'costUnits'),
    canonicalBody,
  };
  if (result.senderTokenId === result.recipientTokenId || !RESTAP_NETWORK_TOPICS.includes(result.topic)
    || !sameParticipantPair(canonicalBody.sender_token_id, canonicalBody.recipient_token_id, result.senderTokenId, result.recipientTokenId)
    || canonicalBody.topic !== result.topic || canonicalBody.conversation_id !== result.correlationId) throw new TypeError('RESTAP network due intent body mismatch.');
  return deepFreeze(result);
}

function sameParticipantPair(leftSender, leftRecipient, sender, recipient) {
  return (leftSender === sender && leftRecipient === recipient) || (leftSender === recipient && leftRecipient === sender);
}

function normalizeDependencies(options) {
  const methods = {
    coordinator: ['reserve', 'getOperation', 'dispatchProvider', 'release', 'markChargedUnknown', 'markCancelledCharged', 'markFailedCharged', 'commitAfterRecheck', 'markDeliveryDelivered'],
    grantService: ['issue', 'verify'],
    eligibility: ['resolvePeerForRelay'],
    conversations: ['open', 'beginDelivery', 'abortDelivery', 'commitDelivery', 'get'],
    runtime: ['generate'],
  };
  for (const [name, required] of Object.entries(methods)) if (!options[name] || required.some((method) => typeof options[name][method] !== 'function')) throw new TypeError('RESTAP network relay ' + name + ' is invalid.');
  for (const name of ['now', 'readBoundaryState', 'readDiscovery', 'readDueIntent']) if (typeof options[name] !== 'function') throw new TypeError('RESTAP network relay ' + name + ' is invalid.');
  if (options.onBoundary !== undefined && options.onBoundary !== null && typeof options.onBoundary !== 'function') throw new TypeError('RESTAP network relay onBoundary is invalid.');
  return {
    ...options,
    onBoundary: options.onBoundary ?? null,
    operations: new Map(),
    dueIndex: new Map(),
    createFlights: new Map(),
    grantFlights: new Map(),
    deliveryFlights: new Map(),
    relayState: true,
  };
}

function grantPayload(record, issuedAt) {
  return deepFreeze({
    iss: 'helixa-restap-network', aud: 'helixa-restap-network-relay', chain_id: record.chainId,
    collection: record.collection.toLowerCase(), sender_token_id: record.senderTokenId,
    sender_account: record.authority.senderAccount.toLowerCase(), sender_identity_id: record.authority.senderIdentityId,
    sender_custody_epoch: record.snapshot.senderCustodyGeneration, sender_activation_lease_id: record.snapshot.senderLeaseId,
    recipient_token_id: record.recipientTokenId, recipient_custody_epoch: record.snapshot.recipientCustodyGeneration,
    recipient_activation_lease_id: record.snapshot.recipientLeaseId, operation: record.operation,
    path: RESTAP_NETWORK_INTERNAL_PATHS[record.operation], body_sha256: record.bodyHash,
    iat: issuedAt, nbf: issuedAt, exp: issuedAt + Math.floor(RESTAP_NETWORK_LIMITS.grantTtlMs / 1_000),
    nonce: record.nonce, operation_id: normalizeIdentifier(record.operationId, 'operationId'),
    correlation_id: record.correlationId, sender_policy_version: record.snapshot.senderPolicyVersion,
    recipient_policy_version: record.snapshot.recipientPolicyVersion, reservation: reservationFor(record),
  });
}

function reservationFor(record) {
  return deepFreeze({
    conversations: record.operation === 'opening' ? 1 : 0,
    messages: 1,
    concurrency_per_token: RESTAP_NETWORK_LIMITS.concurrentPerToken,
    cost_units: record.costUnits,
  });
}

function createSnapshot(authority, boundary, bodyHash) {
  return deepFreeze({
    senderTokenId: authority.senderTokenId, recipientTokenId: authority.recipientTokenId,
    senderCustodyGeneration: authority.senderCustodyGeneration, recipientCustodyGeneration: authority.recipientCustodyGeneration,
    senderLeaseId: authority.senderActivationLeaseId, recipientLeaseId: authority.recipientActivationLeaseId,
    senderPolicyVersion: authority.senderPolicyVersion, recipientPolicyVersion: authority.recipientPolicyVersion,
    gateGeneration: boundary.gateGeneration, safeBlockNumber: boundary.safeBlockNumber,
    safeBlockHash: boundary.safeBlockHash, bodyHash,
  });
}

function normalizeBoundaryState(value) {
  exactObject(value, ['gateGeneration', 'safeBlockHash', 'safeBlockNumber'], 'relay boundary state');
  const raw = String(value.safeBlockHash ?? '').toLowerCase();
  const safeBlockHash = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!HASH.test(safeBlockHash)) throw new TypeError('RESTAP network safe block hash is invalid.');
  return deepFreeze({
    gateGeneration: nonNegativeInteger(value.gateGeneration, 'gateGeneration'),
    safeBlockNumber: nonNegativeInteger(value.safeBlockNumber, 'safeBlockNumber'),
    safeBlockHash,
  });
}

function identity(record, side) {
  return deepFreeze({
    chainId: record.chainId,
    collection: record.collection,
    tokenId: side === 'sender' ? record.senderTokenId : record.recipientTokenId,
    canonicalAccount: side === 'sender' ? record.authority.senderAccount : record.authority.recipientAccount,
  });
}

function projection(record, joined = false) {
  if (!record) throw new Error('RESTAP network operation unavailable.');
  const value = { operationId: record.operationId, operation: record.operation, path: RESTAP_NETWORK_INTERNAL_PATHS[record.operation], status: 'reserved' };
  if (joined) value.joined = true;
  return deepFreeze(value);
}

function prune(context) {
  const timestamp = nonNegativeInteger(context.now(), 'relay clock');
  for (const [operationId, record] of context.operations) {
    if (timestamp < record.expiresAt) continue;
    try {
      const operation = context.coordinator.getOperation(operationId);
      if (operation.status === 'reserved') context.coordinator.release({ operationId });
      else if (operation.status === 'provider_dispatched') context.coordinator.markChargedUnknown({ operationId });
    } catch {}
    record.pending = null;
    record.grant = null;
    record.grantPayload = null;
    context.operations.delete(operationId);
    context.dueIndex.delete(record.intentId + '|' + record.expectedPolicyVersion);
    context.grantFlights.delete(operationId);
    context.deliveryFlights.delete('opening|' + operationId);
    context.deliveryFlights.delete('reply|' + operationId);
  }
}

function releaseReserved(context, record) {
  const current = context.coordinator.getOperation(record.operationId);
  return current.status === 'reserved' ? deepFreeze(context.coordinator.release({ operationId: record.operationId })) : deepFreeze({ status: current.status, operationId: record.operationId });
}

function cancelDispatched(context, record) {
  const current = context.coordinator.getOperation(record.operationId);
  return current.status === 'provider_dispatched' ? deepFreeze(context.coordinator.markCancelledCharged({ operationId: record.operationId })) : deepFreeze({ status: current.status, operationId: record.operationId });
}

function terminalizePostDispatch(context, record) {
  try {
    const current = context.coordinator.getOperation(record.operationId);
    if (current.status === 'provider_dispatched') context.coordinator.markFailedCharged({ operationId: record.operationId });
  } catch {}
  if (context.coordinator.getOperation(record.operationId).status !== 'committed') record.pending = null;
}

function requirePending(record) {
  if (!record.pending) throw new Error('RESTAP network committed delivery requires reconciliation.');
  return record.pending;
}

function snapshotsEqual(left, right) {
  return left && right && canonicalizeRestapNetworkJson(left) === canonicalizeRestapNetworkJson(right);
}

function isCoordinatorTerminal(value) {
  return value && typeof value === 'object' && typeof value.status === 'string'
    && ['released', 'cancelled_charged', 'charged_unknown', 'failed_charged', 'already_dispatched', 'already_committed'].includes(value.status);
}

function hashCanonicalBody(body) {
  return createHash('sha256').update(canonicalizeRestapNetworkJson(body), 'utf8').digest('hex');
}

function saltedContentHash(nonce, operationId, value) {
  return createHash('sha256').update('restap-network-relay-content-v1|' + nonce + '|' + operationId + '|', 'utf8').update(value, 'utf8').digest('hex');
}

async function emitBoundary(context, record, boundary) {
  if (context.onBoundary) await context.onBoundary(deepFreeze({ boundary, operationId: record.operationId, operation: record.operation }));
}

function requireState(value) {
  if (!value || value.relayState !== true || !(value.operations instanceof Map)) throw new TypeError('RESTAP network relay state is invalid.');
  return value;
}

function requireRecord(context, operationId) {
  const record = context.operations.get(operationId);
  if (!record) throw authenticationError();
  return record;
}

function authenticationError() { return new Error('RESTAP network relay authentication failed.'); }
function normalizeIdentifier(value, label) { if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new TypeError(label + ' is invalid.'); return value; }
function normalizeOpaque(value, label) { if (typeof value !== 'string' || !OPAQUE.test(value)) throw new TypeError(label + ' is invalid.'); return value; }
function normalizeIdentityId(value) { if (value === null) return null; if (typeof value !== 'string' || !/^[A-Za-z0-9:._-]{1,128}$/u.test(value)) throw new TypeError('identity ID is invalid.'); return value; }
function positiveInteger(value, label) { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' is invalid.'); return value; }
function nonNegativeInteger(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' is invalid.'); return value; }
function seconds(value) { return Math.floor(nonNegativeInteger(value, 'relay clock') / 1_000); }

function exactObject(value, keys, label, { optional = new Set() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain exact object.');
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) throw new TypeError(label + ' contains an unknown key.');
  const allowed = new Set(keys);
  for (const key of own) {
    if (!allowed.has(key)) throw new TypeError(label + ' contains unknown key "' + key + '".');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' fields must be enumerable data properties.');
  }
  for (const key of keys) if (!optional.has(key) && !Object.hasOwn(value, key)) throw new TypeError(label + ' is missing a key.');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

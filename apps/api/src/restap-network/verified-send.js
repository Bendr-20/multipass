import { createHash } from 'node:crypto';

import { getAddress } from 'viem';

import { RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkTokenId } from './schema.js';

const MESSAGE_BYTES = 2_000;
const REPLY_BYTES = 4_096;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ACTIVE_STATUSES = Object.freeze([
  'reserved', 'sender_dispatched', 'recipient_dispatched', 'committed', 'charged_unknown', 'cancelled_charged',
]);

export class RestapVerifiedSendError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RestapVerifiedSendError';
    this.code = code;
    this.status = status;
  }
}

export function createRestapVerifiedSendService({
  store,
  custodyReconciler,
  policyReader,
  codexRuntime,
  openingRuntime,
  recipientTransport,
  emergencyStop = () => false,
  now = Date.now,
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function') throw new TypeError('Verified send requires the RESTAP store.');
  if (!custodyReconciler || typeof custodyReconciler.reconcileToken !== 'function' || typeof custodyReconciler.getEpochSnapshot !== 'function') throw new TypeError('Verified send requires custody reconciliation.');
  if (!policyReader || typeof policyReader.get !== 'function') throw new TypeError('Verified send requires a policy reader.');
  if (!codexRuntime?.available || typeof codexRuntime.getProfileContext !== 'function') throw new TypeError('Verified send requires the public Codex runtime.');
  if (!openingRuntime || typeof openingRuntime.generate !== 'function') throw new TypeError('Verified send requires an opening runtime.');
  if (!recipientTransport || typeof recipientTransport.talk !== 'function') throw new TypeError('Verified send requires a RESTAP talk transport.');
  if (typeof emergencyStop !== 'function' || typeof now !== 'function') throw new TypeError('Verified send controls are invalid.');

  const flights = new Map();

  async function send(rawInput = {}) {
    const input = normalizeSendInput(rawInput);
    const flightKey = [input.owner, input.senderTokenId, input.idempotencyKey].join('|');
    const existingFlight = flights.get(flightKey);
    if (existingFlight) return existingFlight;
    const flight = sendOnce(input).finally(() => flights.delete(flightKey));
    flights.set(flightKey, flight);
    return flight;
  }

  async function sendOnce(input) {
    const timestamp = readTime(now);
    if (emergencyStop() === true) throw failure('emergency_stop', 'RESTAP verified send is stopped.', 503);

    const reconciled = await Promise.all([
      custodyReconciler.reconcileToken({ tokenId: input.senderTokenId }),
      custodyReconciler.reconcileToken({ tokenId: input.recipientTokenId }),
    ]);
    if (reconciled.some((value) => value?.eligible !== true || value?.status !== 'ready')) {
      throw failure('custody_unavailable', 'Current Looper custody could not be verified.', 503);
    }
    const senderCustody = normalizeCustody(custodyReconciler.getEpochSnapshot({ tokenId: input.senderTokenId }), input.senderTokenId);
    const recipientCustody = normalizeCustody(custodyReconciler.getEpochSnapshot({ tokenId: input.recipientTokenId }), input.recipientTokenId);
    if (!sameCollection(senderCustody, recipientCustody) || senderCustody.owner !== input.owner) {
      throw failure('custody_unavailable', 'Current Looper custody does not match the owner send request.', 503);
    }

    const idempotencyDigest = digest(input.idempotencyKey);
    const requestDigest = digest(JSON.stringify({
      recipient_token_id: input.recipientTokenId,
      sender_token_id: input.senderTokenId,
      topic: input.topic,
    }));
    const existing = readExisting(store, senderCustody, idempotencyDigest);
    if (existing?.request_digest !== undefined && existing.request_digest !== requestDigest) {
      throw failure('idempotency_conflict', 'RESTAP idempotency key was already used for another request.', 409);
    }
    if (existing && existing.status !== 'reserved') return recoverOrReplay(store, existing, requestDigest, readTime(now));

    const senderPolicy = normalizePolicy(policyReader.get({ custody: senderCustody }), senderCustody);
    const recipientPolicy = normalizePolicy(policyReader.get({ custody: recipientCustody }), recipientCustody);
    assertMutualPolicy({ senderPolicy, recipientPolicy, senderTokenId: input.senderTokenId, recipientTokenId: input.recipientTokenId, topic: input.topic, timestamp });

    let senderCodex;
    let recipientCodex;
    try {
      senderCodex = codexRuntime.getProfileContext(Number(input.senderTokenId));
      recipientCodex = codexRuntime.getProfileContext(Number(input.recipientTokenId));
    } catch {
      throw failure('codex_unavailable', 'Public Looper Codex is unavailable.', 503);
    }

    const operationId = 'vs_' + digest([
      senderCustody.chainId,
      senderCustody.collection,
      senderCustody.tokenId,
      senderCustody.generation,
      idempotencyDigest,
    ].join('|')).slice(0, 48);
    const reservation = reserve({
      store,
      operationId,
      senderCustody,
      recipientCustody,
      senderPolicy,
      recipientPolicy,
      topic: input.topic,
      idempotencyDigest,
      requestDigest,
      timestamp,
    });
    if (reservation.replay && reservation.row.status !== 'reserved') return recoverOrReplay(store, reservation.row, requestDigest, readTime(now));

    transition(store, operationId, 'reserved', 'sender_dispatched', readTime(now));
    let opening;
    try {
      const generated = await openingRuntime.generate(Object.freeze({
        senderTokenId: input.senderTokenId,
        recipientTokenId: input.recipientTokenId,
        topic: input.topic,
        senderCodex,
        recipientCodex,
        maxBytes: MESSAGE_BYTES,
      }));
      opening = normalizeGenerated(generated, 'message', MESSAGE_BYTES);
    } catch {
      markTerminal(store, operationId, 'charged_unknown', 'sender_provider_ambiguous', readTime(now));
      return project(store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [operationId]), { reason: 'sender_provider_ambiguous' });
    }

    markRecipientDispatch(store, operationId, opening, readTime(now));
    let response;
    try {
      response = normalizeGenerated(await recipientTransport.talk(Object.freeze({
        recipientTokenId: input.recipientTokenId,
        senderTokenId: input.senderTokenId,
        topic: input.topic,
        message: opening.text,
      })), 'reply', REPLY_BYTES);
    } catch {
      markTerminal(store, operationId, 'charged_unknown', 'recipient_transport_ambiguous', readTime(now));
      return project(store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [operationId]), { reason: 'recipient_transport_ambiguous' });
    }

    const terminal = settleRecipientDispatch(store, operationId, response, readTime(now), () => finalAuthorityMatches({
      custodyReconciler,
      policyReader,
      emergencyStop,
      senderCustody,
      recipientCustody,
      senderPolicy,
      recipientPolicy,
      senderTokenId: input.senderTokenId,
      recipientTokenId: input.recipientTokenId,
      topic: input.topic,
      timestamp: readTime(now),
    }));
    if (terminal === 'cancelled_charged') {
      return project(store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [operationId]), { reason: 'authority_revoked' });
    }
    const row = store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [operationId]);
    return project(row, { reply: response.text });
  }

  return Object.freeze({ send });
}

export function createSameProcessRestapTalkTransport({ resolveRuntime, resolvePublicProjection } = {}) {
  if (typeof resolveRuntime !== 'function' || typeof resolvePublicProjection !== 'function') throw new TypeError('Same-process RESTAP transport dependencies are invalid.');
  return Object.freeze({
    async talk({ recipientTokenId, message } = {}) {
      const runtime = await resolveRuntime({ tokenId: normalizeRestapNetworkTokenId(String(recipientTokenId ?? '')) });
      if (!runtime || typeof runtime.talk !== 'function') throw new Error('RESTAP recipient runtime is unavailable.');
      const publicProjection = await resolvePublicProjection({ tokenId: String(recipientTokenId) });
      return runtime.talk({ message, publicProjection, stateless: true });
    },
  });
}

function normalizeSendInput(value) {
  exact(value, ['idempotencyKey', 'owner', 'recipientTokenId', 'senderTokenId', 'topic'], 'verified send');
  const senderTokenId = positiveToken(value.senderTokenId);
  const recipientTokenId = positiveToken(value.recipientTokenId);
  if (senderTokenId === recipientTokenId) throw failure('invalid_request', 'Sender and recipient must be different Loopers.', 400);
  if (!RESTAP_NETWORK_TOPICS.includes(value.topic)) throw failure('invalid_request', 'RESTAP topic is not allowlisted.', 400);
  if (typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY.test(value.idempotencyKey)) throw failure('invalid_request', 'RESTAP idempotency key is invalid.', 400);
  let owner;
  try { owner = getAddress(value.owner); } catch { throw failure('invalid_request', 'RESTAP owner is invalid.', 400); }
  return Object.freeze({ senderTokenId, recipientTokenId, topic: value.topic, idempotencyKey: value.idempotencyKey, owner });
}

function normalizeCustody(value, expectedTokenId) {
  if (!plain(value) || value.status !== 'ready' || String(value.tokenId) !== expectedTokenId) throw failure('custody_unavailable', 'Current Looper custody is unavailable.', 503);
  let collection; let owner; let controller;
  try { collection = getAddress(value.collection); owner = getAddress(value.owner); controller = getAddress(value.controller); } catch { throw failure('custody_unavailable', 'Current Looper custody is invalid.', 503); }
  if (!Number.isSafeInteger(value.chainId) || value.chainId < 1 || !Number.isSafeInteger(value.generation) || value.generation < 0) throw failure('custody_unavailable', 'Current Looper custody is invalid.', 503);
  return Object.freeze({ ...value, collection, owner, controller, tokenId: expectedTokenId });
}

function normalizePolicy(value, custody) {
  if (!plain(value) || value.custodyGeneration !== custody.generation || !Number.isSafeInteger(value.policyVersion) || value.policyVersion < 0) throw failure('mutual_policy_denied', 'Mutual RESTAP policy is unavailable.', 403);
  for (const key of ['topics', 'allowTokenIds', 'blockTokenIds']) if (!Array.isArray(value[key])) throw failure('mutual_policy_denied', 'Mutual RESTAP policy is unavailable.', 403);
  for (const key of ['initiatedDailyLimit', 'generatedDailyLimit', 'peerDailyLimit']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw failure('mutual_policy_denied', 'Mutual RESTAP policy is unavailable.', 403);
  return value;
}

function assertMutualPolicy({ senderPolicy, recipientPolicy, senderTokenId, recipientTokenId, topic, timestamp }) {
  const enabled = senderPolicy.networkEnabled === true
    && recipientPolicy.networkEnabled === true
    && recipientPolicy.inboundEnabled === true
    && senderPolicy.topics.includes(topic)
    && recipientPolicy.topics.includes(topic)
    && senderPolicy.allowTokenIds.includes(recipientTokenId)
    && recipientPolicy.allowTokenIds.includes(senderTokenId)
    && !senderPolicy.blockTokenIds.includes(recipientTokenId)
    && !recipientPolicy.blockTokenIds.includes(senderTokenId)
    && (senderPolicy.muteUntil === null || senderPolicy.muteUntil <= timestamp)
    && (recipientPolicy.muteUntil === null || recipientPolicy.muteUntil <= timestamp)
    && senderPolicy.initiatedDailyLimit > 0
    && senderPolicy.generatedDailyLimit > 0
    && recipientPolicy.generatedDailyLimit > 0
    && senderPolicy.peerDailyLimit > 0
    && recipientPolicy.peerDailyLimit > 0;
  if (!enabled) throw failure('mutual_policy_denied', 'Both Loopers must explicitly allow this peer and topic.', 403);
}

function reserve({ store, operationId, senderCustody, recipientCustody, senderPolicy, recipientPolicy, topic, idempotencyDigest, requestDigest, timestamp }) {
  return store.transaction('verified_send_reserve', (tx) => {
    const existing = tx.get(
      'SELECT * FROM restap_network_verified_sends WHERE chain_id = ? AND collection = ? AND sender_token_id = ? AND sender_custody_generation = ? AND idempotency_digest = ?',
      [senderCustody.chainId, senderCustody.collection, senderCustody.tokenId, senderCustody.generation, idempotencyDigest],
    );
    if (existing) return { replay: true, row: existing };
    assertCurrentCustody(tx, senderCustody);
    assertCurrentCustody(tx, recipientCustody);
    const dayStart = Math.floor(timestamp / 86_400_000) * 86_400_000;
    const args = [senderCustody.chainId, senderCustody.collection, dayStart];
    const senderInitiated = count(tx, 'sender_token_id = ? AND sender_custody_generation = ?', args, [senderCustody.tokenId, senderCustody.generation]);
    const generatedPredicate = '((sender_token_id = ? AND sender_custody_generation = ?) OR (recipient_token_id = ? AND recipient_custody_generation = ?))';
    const senderGenerated = count(tx, generatedPredicate, args, [senderCustody.tokenId, senderCustody.generation, senderCustody.tokenId, senderCustody.generation]);
    const recipientGenerated = count(tx, generatedPredicate, args, [recipientCustody.tokenId, recipientCustody.generation, recipientCustody.tokenId, recipientCustody.generation]);
    const orderedPair = count(tx, 'sender_token_id = ? AND sender_custody_generation = ? AND recipient_token_id = ? AND recipient_custody_generation = ?', args, [senderCustody.tokenId, senderCustody.generation, recipientCustody.tokenId, recipientCustody.generation]);
    if (senderInitiated >= senderPolicy.initiatedDailyLimit || senderGenerated >= senderPolicy.generatedDailyLimit
      || recipientGenerated >= recipientPolicy.generatedDailyLimit
      || orderedPair >= Math.min(senderPolicy.peerDailyLimit, recipientPolicy.peerDailyLimit)) {
      throw failure('quota_exhausted', 'RESTAP verified send quota is exhausted.', 429);
    }
    tx.run(
      'INSERT INTO restap_network_verified_sends (operation_id, chain_id, collection, sender_token_id, recipient_token_id, sender_custody_generation, recipient_custody_generation, sender_policy_version, recipient_policy_version, topic, idempotency_digest, request_digest, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [operationId, senderCustody.chainId, senderCustody.collection, senderCustody.tokenId, recipientCustody.tokenId, senderCustody.generation, recipientCustody.generation, senderPolicy.policyVersion, recipientPolicy.policyVersion, topic, idempotencyDigest, requestDigest, 'reserved', timestamp, timestamp],
    );
    return { replay: false };
  });
}

function count(tx, predicate, baseArgs, values) {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const row = tx.get(
    'SELECT count(*) AS count FROM restap_network_verified_sends WHERE chain_id = ? AND collection = ? AND created_at >= ? AND ' + predicate + ' AND status IN (' + placeholders + ')',
    [...baseArgs, ...values, ...ACTIVE_STATUSES],
  );
  return Number(row?.count ?? 0);
}

function assertCurrentCustody(tx, expected) {
  const current = tx.get(
    'SELECT generation, owner_address, controller_address, status FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1',
    [expected.chainId, expected.collection, expected.tokenId],
  );
  if (!current || current.status !== 'ready' || Number(current.generation) !== expected.generation
    || getAddress(current.owner_address) !== expected.owner || getAddress(current.controller_address) !== expected.controller) {
    throw failure('custody_unavailable', 'Current Looper custody changed before reservation.', 503);
  }
}

function transition(store, operationId, from, to, timestamp) {
  store.transaction('verified_send_transition', (tx) => {
    const result = tx.run('UPDATE restap_network_verified_sends SET status = ?, updated_at = ? WHERE operation_id = ? AND status = ?', [to, timestamp, operationId, from]);
    if (Number(result.changes) !== 1) throw new Error('Verified send state changed unexpectedly.');
  });
}

function markRecipientDispatch(store, operationId, opening, timestamp) {
  store.transaction('verified_send_recipient', (tx) => {
    const result = tx.run(
      'UPDATE restap_network_verified_sends SET status = ?, opening_digest = ?, sender_input_tokens = ?, sender_output_tokens = ?, sender_total_tokens = ?, updated_at = ? WHERE operation_id = ? AND status = ?',
      ['recipient_dispatched', digest(opening.text), opening.usage?.inputTokens ?? null, opening.usage?.outputTokens ?? null, opening.usage?.totalTokens ?? null, timestamp, operationId, 'sender_dispatched'],
    );
    if (Number(result.changes) !== 1) throw new Error('Verified send state changed unexpectedly.');
  });
}

function markTerminal(store, operationId, status, reason, timestamp, response = null) {
  store.transaction('verified_send_terminal', (tx) => {
    const row = tx.get('SELECT status FROM restap_network_verified_sends WHERE operation_id = ?', [operationId]);
    if (!row || !['sender_dispatched', 'recipient_dispatched'].includes(row.status)) throw new Error('Verified send cannot become terminal.');
    tx.run(
      'UPDATE restap_network_verified_sends SET status = ?, reason_class = ?, reply_digest = ?, recipient_input_tokens = ?, recipient_output_tokens = ?, recipient_total_tokens = ?, updated_at = ?, terminal_at = ? WHERE operation_id = ?',
      [status, reason, response ? digest(response.text) : null, response?.usage?.inputTokens ?? null, response?.usage?.outputTokens ?? null, response?.usage?.totalTokens ?? null, timestamp, timestamp, operationId],
    );
  });
}

function settleRecipientDispatch(store, operationId, response, timestamp, authorityMatches) {
  return store.transaction('verified_send_settle', (tx) => {
    const authorized = authorityMatches() === true;
    const status = authorized ? 'committed' : 'cancelled_charged';
    const reason = authorized ? null : 'authority_revoked';
    const result = tx.run(
      'UPDATE restap_network_verified_sends SET status = ?, reason_class = ?, reply_digest = ?, recipient_input_tokens = ?, recipient_output_tokens = ?, recipient_total_tokens = ?, updated_at = ?, terminal_at = ? WHERE operation_id = ? AND status = ?',
      [status, reason, digest(response.text), response.usage?.inputTokens ?? null, response.usage?.outputTokens ?? null, response.usage?.totalTokens ?? null, timestamp, timestamp, operationId, 'recipient_dispatched'],
    );
    if (Number(result.changes) !== 1) throw new Error('Verified send state changed unexpectedly.');
    return status;
  });
}

function finalAuthorityMatches(input) {
  try {
    if (input.emergencyStop() === true) return false;
    const currentSender = normalizeCustody(input.custodyReconciler.getEpochSnapshot({ tokenId: input.senderTokenId }), input.senderTokenId);
    const currentRecipient = normalizeCustody(input.custodyReconciler.getEpochSnapshot({ tokenId: input.recipientTokenId }), input.recipientTokenId);
    if (!sameCustody(currentSender, input.senderCustody) || !sameCustody(currentRecipient, input.recipientCustody)) return false;
    const currentSenderPolicy = normalizePolicy(input.policyReader.get({ custody: currentSender }), currentSender);
    const currentRecipientPolicy = normalizePolicy(input.policyReader.get({ custody: currentRecipient }), currentRecipient);
    if (currentSenderPolicy.policyVersion !== input.senderPolicy.policyVersion || currentRecipientPolicy.policyVersion !== input.recipientPolicy.policyVersion) return false;
    assertMutualPolicy({ ...input, senderPolicy: currentSenderPolicy, recipientPolicy: currentRecipientPolicy });
    return true;
  } catch {
    return false;
  }
}

function normalizeGenerated(value, field, maximum) {
  if (!plain(value) || typeof value[field] !== 'string') throw new TypeError('RESTAP provider output is invalid.');
  const text = value[field].trim();
  if (!text || /[\u0000-\u001f\u007f]/u.test(text) || Buffer.byteLength(text, 'utf8') > maximum) throw new TypeError('RESTAP provider output is invalid or unbounded.');
  return Object.freeze({ text, usage: normalizeUsage(value.usage) });
}

function normalizeUsage(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'input_tokens,output_tokens,total_tokens') throw new TypeError('RESTAP provider usage is invalid.');
  const values = [value.input_tokens, value.output_tokens, value.total_tokens];
  if (values.some((item) => !Number.isSafeInteger(item) || item < 0) || value.total_tokens !== value.input_tokens + value.output_tokens) throw new TypeError('RESTAP provider usage is invalid.');
  return Object.freeze({ inputTokens: value.input_tokens, outputTokens: value.output_tokens, totalTokens: value.total_tokens });
}

function project(row, { reply, reason } = {}) {
  if (!row) throw new Error('Verified send row is missing.');
  const result = {
    schemaVersion: '0.1.0',
    operationId: row.operation_id,
    status: row.status,
    senderTokenId: row.sender_token_id,
    recipientTokenId: row.recipient_token_id,
    topic: row.topic,
    openingDigest: row.opening_digest ?? null,
    replyDigest: row.reply_digest ?? null,
    usage: {
      sender: usageFromRow(row, 'sender'),
      recipient: usageFromRow(row, 'recipient'),
    },
    replayed: false,
  };
  if (reply !== undefined) result.reply = reply;
  if (reason ?? row.reason_class) result.reason = reason ?? row.reason_class;
  return deepFreeze(result);
}

function recoverOrReplay(store, row, requestDigest, timestamp) {
  if (row.request_digest !== requestDigest) throw failure('idempotency_conflict', 'RESTAP idempotency key was already used for another request.', 409);
  if (['sender_dispatched', 'recipient_dispatched'].includes(row.status)) {
    markTerminal(store, row.operation_id, 'charged_unknown', 'interrupted_ambiguous', timestamp);
    row = store.readOne('SELECT * FROM restap_network_verified_sends WHERE operation_id = ?', [row.operation_id]);
  }
  return replayOrConflict(row, requestDigest);
}

function replayOrConflict(row, requestDigest) {
  if (row.request_digest !== requestDigest) throw failure('idempotency_conflict', 'RESTAP idempotency key was already used for another request.', 409);
  const value = project(row);
  return deepFreeze({ ...value, replayed: true });
}

function readExisting(store, custody, idempotencyDigest) {
  return store.readOne(
    'SELECT * FROM restap_network_verified_sends WHERE chain_id = ? AND collection = ? AND sender_token_id = ? AND sender_custody_generation = ? AND idempotency_digest = ?',
    [custody.chainId, custody.collection, custody.tokenId, custody.generation, idempotencyDigest],
  );
}

function usageFromRow(row, side) {
  const values = [row[side + '_input_tokens'], row[side + '_output_tokens'], row[side + '_total_tokens']];
  if (values.every((item) => item === null)) return null;
  return Object.freeze({ inputTokens: Number(values[0]), outputTokens: Number(values[1]), totalTokens: Number(values[2]) });
}

function sameCollection(left, right) { return left.chainId === right.chainId && left.collection === right.collection; }
function sameCustody(left, right) { return sameCollection(left, right) && left.tokenId === right.tokenId && left.generation === right.generation && left.owner === right.owner && left.controller === right.controller && left.status === 'ready'; }
function positiveToken(value) { const token = normalizeRestapNetworkTokenId(String(value ?? '')); if (BigInt(token) < 1n) throw failure('invalid_request', 'Looper token ID must be positive.', 400); return token; }
function readTime(now) { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Verified send clock is invalid.'); return value; }
function digest(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function failure(code, message, status) { return new RestapVerifiedSendError(code, message, status); }
function exact(value, keys, label) { if (!plain(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw failure('invalid_request', label + ' contains unknown or missing fields.', 400); }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }

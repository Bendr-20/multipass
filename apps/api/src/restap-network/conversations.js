import { createHmac, randomBytes } from 'node:crypto';

import { RESTAP_NETWORK_LIMITS, RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkTokenId } from './schema.js';

const OPEN_KEYS = Object.freeze(['opening', 'recipientTokenId', 'senderTokenId', 'topic']);
const CONVERSATION_KEYS = Object.freeze(['conversationId']);
const BEGIN_KEYS = Object.freeze(['conversationId', 'speaker']);
const DELIVERY_KEYS = Object.freeze(['conversationId', 'deliveryId']);
const COMMIT_KEYS = Object.freeze(['conversationId', 'deliveryId', 'output']);
const CANCEL_KEYS = Object.freeze(['conversationId', 'reasonClass']);
const PARTICIPANT_CANCEL_KEYS = Object.freeze(['reasonClass', 'tokenId']);
const PAIR_CANCEL_KEYS = Object.freeze(['reasonClass', 'recipientTokenId', 'senderTokenId']);
const SPEAKERS = new Set(['sender', 'recipient']);
const CANCELLATION_REASONS = new Set(['muted', 'blocked', 'opted_out', 'transferred']);
const LOW_INFORMATION = new Set([
  'ack', 'agreed', 'cool', 'got it', 'k', 'nice', 'no', 'okay', 'ok', 'sounds good',
  'sure', 'thanks', 'thank you', 'understood', 'yep', 'yes',
]);
const DEFAULT_PAIR_CHURN_LIMIT = 3;
const LIMITS = Object.freeze({
  replyRounds: RESTAP_NETWORK_LIMITS.replyRounds,
  storedMessages: RESTAP_NETWORK_LIMITS.storedMessages,
  messageBytes: RESTAP_NETWORK_LIMITS.messageBytes,
  ttlMs: RESTAP_NETWORK_LIMITS.conversationTtlMs,
  activeDeliveries: RESTAP_NETWORK_LIMITS.activeDeliveriesPerConversation,
});

export function normalizeRestapNetworkReply(output) {
  if (typeof output !== 'string') throw new TypeError('RESTAP network model output must be a text-only string.');
  if (!output.isWellFormed()) throw new TypeError('RESTAP network message must be well-formed Unicode.');
  const text = output.replace(/\r\n?/gu, '\n').trim();
  if (!text) throw new TypeError('RESTAP network message text must not be empty.');
  if (Buffer.byteLength(text, 'utf8') > RESTAP_NETWORK_LIMITS.messageBytes) throw new TypeError('RESTAP network message exceeds 2,000 UTF-8 bytes.');
  return text;
}

export function createRestapNetworkConversations({
  store,
  fingerprintKey,
  now = Date.now,
  createId = () => randomBytes(16).toString('hex'),
  pairChurnLimit = DEFAULT_PAIR_CHURN_LIMIT,
} = {}) {
  assertStore(store);
  if (!(fingerprintKey instanceof Uint8Array) || fingerprintKey.byteLength < 32) throw new TypeError('fingerprintKey must contain at least 32 bytes of high-entropy key material.');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');
  if (typeof createId !== 'function') throw new TypeError('createId must be a function.');
  if (!Number.isSafeInteger(pairChurnLimit) || pairChurnLimit < 1 || pairChurnLimit > DEFAULT_PAIR_CHURN_LIMIT) throw new TypeError('pairChurnLimit must be an integer from 1 through 3.');

  const key = Buffer.from(fingerprintKey);
  const memory = new Map();
  let closed = false;

  const startupAt = readNow(now);
  store.transaction('conversation_restart', (tx) => {
    tx.run("UPDATE restap_network_conversations SET status = 'terminated_restart', terminal_class = 'restart', updated_at = CASE WHEN created_at > ? THEN created_at ELSE ? END WHERE status = 'active'", [startupAt, startupAt]);
  });

  function assertOpenService() {
    if (closed) throw new Error('RESTAP network conversation service is closed.');
  }

  function keyedDigest(domain, value) {
    return createHmac('sha256', key).update(domain + '|' + value).digest('hex');
  }

  function participantDigest(tokenId) {
    return keyedDigest('participant', tokenId);
  }

  function messageFingerprint(text) {
    return keyedDigest('message', canonicalMessage(text));
  }

  function open(input) {
    assertOpenService();
    assertExactObject(input, OPEN_KEYS, 'conversation opening');
    const senderTokenId = assertTokenId(input.senderTokenId, 'senderTokenId');
    const recipientTokenId = assertTokenId(input.recipientTokenId, 'recipientTokenId');
    if (senderTokenId === recipientTokenId) throw new TypeError('RESTAP network self-conversation is forbidden.');
    if (!RESTAP_NETWORK_TOPICS.includes(input.topic)) throw new TypeError('RESTAP network topic is not allowed.');
    const text = normalizeRestapNetworkReply(input.opening);
    const timestamp = readNow(now);
    const senderDigest = participantDigest(senderTokenId);
    const recipientDigest = participantDigest(recipientTokenId);
    const recentPairCount = Number(store.readOne(
      'SELECT count(*) AS count FROM restap_network_conversations WHERE sender_token_digest = ? AND recipient_token_digest = ? AND created_at > ?',
      [senderDigest, recipientDigest, timestamp - RESTAP_NETWORK_LIMITS.conversationTtlMs],
    ).count);
    if (recentPairCount >= pairChurnLimit) throw new Error('RESTAP network ordered-pair churn limit reached.');

    const conversationId = createOpaqueId(createId, 'conversation');
    const fingerprint = messageFingerprint(text);
    const expiresAt = timestamp + RESTAP_NETWORK_LIMITS.conversationTtlMs;
    const eventId = createOpaqueId(createId, 'conversation-event');
    store.transaction('conversation_open', (tx) => {
      tx.run(
        'INSERT INTO restap_network_conversations (conversation_id, sender_token_digest, recipient_token_digest, topic, turn_count, next_speaker, status, terminal_class, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [conversationId, senderDigest, recipientDigest, input.topic, 1, 'recipient', 'active', null, timestamp, timestamp, expiresAt],
      );
      persistFingerprint(tx, { eventId, fingerprint, topic: input.topic, timestamp, expiresAt });
    });

    const message = frozenMessage({ speaker: 'sender', text, turnIndex: 0, createdAt: timestamp });
    memory.set(conversationId, {
      messages: [message],
      fingerprints: new Set([fingerprint]),
      activeDelivery: null,
    });
    return projectConversation(readConversation(conversationId));
  }

  function beginDelivery(input) {
    assertOpenService();
    assertExactObject(input, BEGIN_KEYS, 'conversation delivery');
    const conversationId = assertOpaque(input.conversationId, 'conversationId');
    if (!SPEAKERS.has(input.speaker)) throw new TypeError('RESTAP network speaker is invalid.');
    const row = requireUsable(conversationId);
    const state = requireMemory(conversationId);
    if (state.activeDelivery) throw new Error('RESTAP network active delivery limit reached.');
    if (row.next_speaker !== input.speaker) throw new Error('RESTAP network strict alternation requires ' + row.next_speaker + '.');
    if (Number(row.turn_count) >= RESTAP_NETWORK_LIMITS.storedMessages) return terminateLoop(conversationId, 'message_limit');
    if (Number(row.turn_count) - 1 >= RESTAP_NETWORK_LIMITS.replyRounds) return terminateLoop(conversationId, 'reply_round_limit');
    const deliveryId = createOpaqueId(createId, 'delivery');
    state.activeDelivery = Object.freeze({ deliveryId, speaker: input.speaker });
    return Object.freeze({ conversationId, deliveryId, speaker: input.speaker });
  }

  function abortDelivery(input) {
    assertOpenService();
    assertExactObject(input, DELIVERY_KEYS, 'conversation delivery abort');
    const conversationId = assertOpaque(input.conversationId, 'conversationId');
    const deliveryId = assertOpaque(input.deliveryId, 'deliveryId');
    const state = requireMemory(conversationId);
    if (!state.activeDelivery || state.activeDelivery.deliveryId !== deliveryId) throw new Error('RESTAP network active delivery not found.');
    state.activeDelivery = null;
    return Object.freeze({ conversationId, status: 'aborted' });
  }

  function commitDelivery(input) {
    assertOpenService();
    assertExactObject(input, COMMIT_KEYS, 'conversation delivery commit');
    const conversationId = assertOpaque(input.conversationId, 'conversationId');
    const deliveryId = assertOpaque(input.deliveryId, 'deliveryId');
    const row = requireUsable(conversationId);
    const state = requireMemory(conversationId);
    if (!state.activeDelivery || state.activeDelivery.deliveryId !== deliveryId) throw new Error('RESTAP network active delivery not found.');
    if (state.activeDelivery.speaker !== row.next_speaker) throw new Error('RESTAP network strict alternation state changed.');
    let text;
    try {
      text = normalizeRestapNetworkReply(input.output);
    } catch (error) {
      state.activeDelivery = null;
      throw error;
    }
    const timestamp = readNow(now);
    if (timestamp >= Number(row.expires_at)) {
      state.activeDelivery = null;
      expireConversation(conversationId, timestamp);
      throw new Error('RESTAP network conversation expired.');
    }
    const fingerprint = messageFingerprint(text);
    if (state.fingerprints.has(fingerprint)) {
      state.activeDelivery = null;
      return terminateLoop(conversationId, 'repeated_message');
    }
    const turnCount = Number(row.turn_count) + 1;
    if (turnCount > RESTAP_NETWORK_LIMITS.storedMessages) {
      state.activeDelivery = null;
      return terminateLoop(conversationId, 'message_limit');
    }
    const speaker = state.activeDelivery.speaker;
    const nextSpeaker = speaker === 'sender' ? 'recipient' : 'sender';
    const lowInformationStop = isLowInformation(text) && isLowInformation(state.messages.at(-1)?.text ?? '');
    const replyLimitStop = turnCount - 1 >= RESTAP_NETWORK_LIMITS.replyRounds;
    const terminalClass = lowInformationStop ? 'low_information_acknowledgments' : replyLimitStop ? 'reply_round_limit' : null;
    const status = terminalClass ? 'completed' : 'active';
    const eventId = createOpaqueId(createId, 'conversation-event');
    store.transaction('conversation_commit', (tx) => {
      const current = tx.get('SELECT turn_count, next_speaker, status, expires_at FROM restap_network_conversations WHERE conversation_id = ?', [conversationId]);
      if (!current || current.status !== 'active') throw new Error('RESTAP network conversation is terminal.');
      if (Number(current.expires_at) <= timestamp) throw new Error('RESTAP network conversation expired.');
      if (Number(current.turn_count) !== Number(row.turn_count) || current.next_speaker !== speaker) throw new Error('RESTAP network conversation state changed.');
      tx.run("UPDATE restap_network_conversations SET turn_count = ?, next_speaker = ?, status = ?, terminal_class = ?, updated_at = ? WHERE conversation_id = ? AND status = 'active'", [turnCount, nextSpeaker, status, terminalClass, timestamp, conversationId]);
      persistFingerprint(tx, { eventId, fingerprint, topic: row.topic, timestamp, expiresAt: Number(row.expires_at) });
    });

    state.messages.push(frozenMessage({ speaker, text, turnIndex: turnCount - 1, createdAt: timestamp }));
    state.fingerprints.add(fingerprint);
    state.activeDelivery = null;
    return projectConversation(readConversation(conversationId));
  }

  function get(input) {
    assertOpenService();
    assertExactObject(input, CONVERSATION_KEYS, 'conversation lookup');
    const conversationId = assertOpaque(input.conversationId, 'conversationId');
    const row = requireConversation(conversationId);
    const timestamp = readNow(now);
    if (timestamp >= Number(row.expires_at)) {
      if (row.status === 'active') expireConversation(conversationId, timestamp);
      else memory.delete(conversationId);
    }
    return projectConversation(requireConversation(conversationId));
  }

  function cancel(input) {
    assertOpenService();
    assertExactObject(input, CANCEL_KEYS, 'conversation cancellation');
    const conversationId = assertOpaque(input.conversationId, 'conversationId');
    if (!CANCELLATION_REASONS.has(input.reasonClass)) throw new TypeError('RESTAP network cancellation reason is invalid.');
    const row = requireConversation(conversationId);
    if (row.status !== 'active') return projectConversation(row);
    const timestamp = readNow(now);
    store.transaction('conversation_cancel', (tx) => {
      tx.run("UPDATE restap_network_conversations SET status = 'cancelled', terminal_class = ?, updated_at = ? WHERE conversation_id = ? AND status = 'active'", [input.reasonClass, timestamp, conversationId]);
    });
    memory.delete(conversationId);
    return projectConversation(requireConversation(conversationId));
  }

  function cancelForParticipant(input) {
    assertOpenService();
    assertExactObject(input, PARTICIPANT_CANCEL_KEYS, 'participant cancellation');
    const tokenId = assertTokenId(input.tokenId, 'tokenId');
    if (!CANCELLATION_REASONS.has(input.reasonClass)) throw new TypeError('RESTAP network cancellation reason is invalid.');
    const digest = participantDigest(tokenId);
    const rows = store.readAll("SELECT conversation_id FROM restap_network_conversations WHERE status = 'active' AND (sender_token_digest = ? OR recipient_token_digest = ?) ORDER BY conversation_id", [digest, digest]);
    for (const row of rows) cancel({ conversationId: row.conversation_id, reasonClass: input.reasonClass });
    return rows.length;
  }

  function cancelPair(input) {
    assertOpenService();
    assertExactObject(input, PAIR_CANCEL_KEYS, 'pair cancellation');
    const senderTokenId = assertTokenId(input.senderTokenId, 'senderTokenId');
    const recipientTokenId = assertTokenId(input.recipientTokenId, 'recipientTokenId');
    if (senderTokenId === recipientTokenId) throw new TypeError('RESTAP network self-conversation is forbidden.');
    if (!CANCELLATION_REASONS.has(input.reasonClass)) throw new TypeError('RESTAP network cancellation reason is invalid.');
    const rows = store.readAll("SELECT conversation_id FROM restap_network_conversations WHERE status = 'active' AND sender_token_digest = ? AND recipient_token_digest = ? ORDER BY conversation_id", [participantDigest(senderTokenId), participantDigest(recipientTokenId)]);
    for (const row of rows) cancel({ conversationId: row.conversation_id, reasonClass: input.reasonClass });
    return rows.length;
  }

  function expire() {
    assertOpenService();
    const timestamp = readNow(now);
    const rows = store.readAll('SELECT conversation_id, status FROM restap_network_conversations WHERE expires_at <= ? ORDER BY conversation_id', [timestamp]);
    for (const row of rows) {
      if (row.status === 'active') expireConversation(row.conversation_id, timestamp);
      else memory.delete(row.conversation_id);
    }
    return rows.length;
  }

  function requireUsable(conversationId) {
    const row = requireConversation(conversationId);
    const timestamp = readNow(now);
    if (row.status === 'active' && timestamp >= Number(row.expires_at)) expireConversation(conversationId, timestamp);
    const current = requireConversation(conversationId);
    if (current.status !== 'active') throw new Error('RESTAP network conversation is terminal: ' + current.status + '.');
    return current;
  }

  function requireConversation(conversationId) {
    const row = readConversation(conversationId);
    if (!row) throw new Error('RESTAP network conversation not found.');
    return row;
  }

  function readConversation(conversationId) {
    return store.readOne('SELECT conversation_id, topic, turn_count, next_speaker, status, terminal_class, created_at, updated_at, expires_at FROM restap_network_conversations WHERE conversation_id = ?', [conversationId]);
  }

  function requireMemory(conversationId) {
    const state = memory.get(conversationId);
    if (!state) throw new Error('RESTAP network transcript is unavailable after restart.');
    return state;
  }

  function expireConversation(conversationId, timestamp) {
    store.transaction('conversation_expire', (tx) => {
      tx.run("UPDATE restap_network_conversations SET status = 'expired', terminal_class = 'ttl_expired', updated_at = ? WHERE conversation_id = ? AND status = 'active'", [timestamp, conversationId]);
    });
    memory.delete(conversationId);
  }

  function terminateLoop(conversationId, terminalClass) {
    const timestamp = readNow(now);
    store.transaction('conversation_terminal', (tx) => {
      tx.run("UPDATE restap_network_conversations SET status = 'completed', terminal_class = ?, updated_at = ? WHERE conversation_id = ? AND status = 'active'", [terminalClass, timestamp, conversationId]);
    });
    const state = memory.get(conversationId);
    if (state) state.activeDelivery = null;
    return projectConversation(requireConversation(conversationId));
  }

  function projectConversation(row) {
    const messages = memory.get(row.conversation_id)?.messages ?? [];
    return Object.freeze({
      conversationId: row.conversation_id,
      topic: row.topic,
      turnCount: Number(row.turn_count),
      nextSpeaker: row.next_speaker,
      status: row.status,
      terminalClass: row.terminal_class ?? null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      expiresAt: Number(row.expires_at),
      messages: Object.freeze([...messages]),
    });
  }

  return Object.freeze({
    limits: LIMITS,
    open,
    beginDelivery,
    abortDelivery,
    commitDelivery,
    get,
    cancel,
    cancelForParticipant,
    cancelPair,
    expire,
    close() {
      if (closed) return;
      memory.clear();
      key.fill(0);
      closed = true;
    },
  });
}

function persistFingerprint(tx, { eventId, fingerprint, topic, timestamp, expiresAt }) {
  tx.run(
    'INSERT INTO restap_network_audit_events (event_id, event_class, status_class, subject_digest, topic_class, occurred_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [eventId, 'conversation_message_fingerprint', 'recorded', fingerprint, topic, timestamp, expiresAt],
  );
}

function frozenMessage({ speaker, text, turnIndex, createdAt }) {
  return Object.freeze({ speaker, text, turnIndex, createdAt });
}

function canonicalMessage(text) {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

function isLowInformation(text) {
  const canonical = canonicalMessage(text).replace(/[.!?,;:]+$/gu, '').trim();
  return LOW_INFORMATION.has(canonical);
}

function assertStore(store) {
  if (!store || typeof store !== 'object' || typeof store.transaction !== 'function' || typeof store.readOne !== 'function' || typeof store.readAll !== 'function') throw new TypeError('RESTAP network store is required.');
}

function assertExactObject(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain object.');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) throw new TypeError(label + ' contains an unknown symbol key.');
  const keys = ownKeys.sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new TypeError(label + ' must contain the exact keys; unknown fields are forbidden.');
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(label + ' fields must be data properties, not accessors.');
  }
}

function assertTokenId(value, label) {
  try {
    return normalizeRestapNetworkTokenId(value);
  } catch {
    throw new TypeError(label + ' must be a canonical uint256 decimal token ID.');
  }
}

function assertOpaque(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new TypeError(label + ' is invalid.');
  return value;
}

function createOpaqueId(createId, kind) {
  return assertOpaque(createId(kind), kind + ' ID');
}

function readNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('RESTAP network clock must return a non-negative integer.');
  return value;
}

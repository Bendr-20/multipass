import { hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ETHEREUM_IDENTIFIER_KIND = 0;

export function createDeferredXmtpAgentClient(options = {}) {
  if (!options.enabled) {
    return options.localFallbackEnabled
      ? createLocalXmtpAgentClient(options)
      : createUnavailableXmtpAgentClient({
        provider: 'xmtp_disabled',
        message: 'XMTP transport is disabled. Enable and configure the XMTP Node SDK or inject the explicit local test adapter.',
      });
  }
  if (!String(options.walletKey ?? '').trim()) {
    return createUnavailableXmtpAgentClient({
      provider: 'xmtp_unconfigured',
      message: 'XMTP is enabled but wallet configuration is unavailable.',
    });
  }
  let clientPromise = null;

  return {
    provider: 'xmtp_node_sdk',
    transport: 'xmtp_group',

    async publishRoomMessages(input = {}) {
      const client = await resolveClient();
      return client.publishRoomMessages(input);
    },

    async getThread(input = {}) {
      const client = await resolveClient();
      return client.getThread(input);
    },
  };

  async function resolveClient() {
    if (!clientPromise) clientPromise = createNodeXmtpAgentClient(options);
    return clientPromise;
  }
}

export function createUnavailableXmtpAgentClient({ provider = 'xmtp_disabled', message = 'XMTP transport is unavailable.' } = {}) {
  async function unavailable() {
    throw new Error(message);
  }
  return {
    provider,
    transport: 'unavailable',
    publishRoomMessages: unavailable,
    getThread: unavailable,
  };
}

export function createLocalXmtpAgentClient({ now = () => new Date().toISOString() } = {}) {
  const rooms = new Map();

  return {
    provider: 'local_xmtp_adapter',
    transport: 'xmtp_local',

    async publishRoomMessages(input = {}) {
      const threadId = requireThreadId(input.threadId);
      const roomName = normalizeRoomName(input.roomName);
      const room = rooms.get(threadId) ?? {
        threadId,
        topicId: String(input.topicId ?? threadId).trim(),
        conversationId: `local:${threadId}`,
        roomName,
        participants: [],
        messages: [],
      };
      room.roomName = roomName;
      room.participants = mergeParticipants(room.participants, input.participants);

      const nextMessages = Array.isArray(input.messages)
        ? input.messages.map((message, index) => normalizeOutboundMessage(message, {
          fallbackId: `xmtp_${room.messages.length + index}`,
          sentAt: now(),
          transport: 'xmtp_local',
          conversationId: room.conversationId,
        })).filter(Boolean)
        : [];

      room.messages.push(...nextMessages);
      rooms.set(threadId, room);

      return {
        threadId,
        topicId: room.topicId,
        conversationId: room.conversationId,
        roomName: room.roomName,
        transport: 'xmtp_local',
        adapter: 'local_xmtp_adapter',
        participants: [...room.participants],
        messages: [...room.messages],
      };
    },

    async getThread(input = {}) {
      const threadId = requireThreadId(input.threadId);
      const room = rooms.get(threadId);
      return {
        threadId,
        topicId: room?.topicId ?? String(input.topicId ?? threadId).trim(),
        conversationId: room?.conversationId ?? null,
        roomName: room?.roomName ?? normalizeRoomName(input.roomName),
        transport: 'xmtp_local',
        adapter: 'local_xmtp_adapter',
        participants: [...(room?.participants ?? input.participants ?? [])],
        messages: [...(room?.messages ?? [])],
      };
    },
  };
}

export async function createNodeXmtpAgentClient({
  client: providedClient,
  walletKey,
  env = 'production',
  dbPath = null,
  dbEncryptionKey = null,
  historySyncUrl = null,
  apiUrl = null,
  gatewayHost = null,
  appVersion = 'multipass-console',
  now = () => new Date().toISOString(),
} = {}) {
  const client = providedClient ?? await createXmtpNodeClient({
    walletKey,
    env,
    dbPath,
    dbEncryptionKey,
    historySyncUrl,
    apiUrl,
    gatewayHost,
    appVersion,
  });
  const rooms = new Map();

  return {
    provider: 'xmtp_node_sdk',
    transport: 'xmtp_group',

    async publishRoomMessages(input = {}) {
      const threadId = requireThreadId(input.threadId);
      const roomName = normalizeRoomName(input.roomName);
      const room = await ensureRoom({
        rooms,
        client,
        threadId,
        conversationId: input.conversationId,
        topicId: input.topicId,
        roomName,
        wallet: input.wallet,
        participants: input.participants,
      });

      const publishedMessages = [];
      for (let index = 0; index < (Array.isArray(input.messages) ? input.messages.length : 0); index += 1) {
        const message = input.messages[index];
        const normalized = normalizeOutboundMessage(message, {
          fallbackId: `xmtp_${room.messages.length + index}`,
          sentAt: now(),
          transport: 'xmtp_group',
          conversationId: room.conversation.id,
        });
        if (!normalized) continue;
        const xmtpMessageId = await room.conversation.sendText(
          buildOutboundText(normalized),
          normalized.id ? { idempotencyKey: normalized.id } : undefined,
        );
        publishedMessages.push({
          ...normalized,
          id: xmtpMessageId || normalized.id,
          xmtpMessageId: xmtpMessageId || normalized.id,
        });
      }

      room.participants = mergeParticipants(room.participants, input.participants);
      room.messages.push(...publishedMessages);

      return {
        threadId,
        topicId: room.topicId,
        conversationId: room.conversation.id,
        roomName: room.roomName,
        transport: 'xmtp_group',
        adapter: 'xmtp_node_sdk',
        participants: [...room.participants],
        messages: [...room.messages],
      };
    },

    async getThread(input = {}) {
      const threadId = requireThreadId(input.threadId);
      let room = rooms.get(threadId);
      if (!room && input.conversationId) {
        room = await openBoundRoom({
          rooms,
          client,
          threadId,
          conversationId: input.conversationId,
          topicId: input.topicId,
          roomName: normalizeRoomName(input.roomName),
          participants: input.participants,
        });
      }
      return {
        threadId,
        topicId: room?.topicId ?? String(input.topicId ?? threadId).trim(),
        conversationId: room?.conversation?.id ?? null,
        roomName: room?.roomName ?? normalizeRoomName(input.roomName),
        transport: 'xmtp_group',
        adapter: 'xmtp_node_sdk',
        participants: [...(room?.participants ?? input.participants ?? [])],
        messages: [...(room?.messages ?? [])],
      };
    },
  };
}

export async function createXmtpNodeClient({
  walletKey,
  env = 'production',
  dbPath = null,
  dbEncryptionKey = null,
  historySyncUrl = null,
  apiUrl = null,
  gatewayHost = null,
  appVersion = 'multipass-console',
} = {}) {
  const { Client } = await import('@xmtp/node-sdk');
  const signer = createEoaSigner(walletKey);
  return Client.create(signer, {
    env,
    dbPath,
    ...(dbEncryptionKey ? { dbEncryptionKey: normalizeDbEncryptionKey(dbEncryptionKey) } : {}),
    ...(historySyncUrl ? { historySyncUrl } : {}),
    ...(apiUrl ? { apiUrl } : {}),
    ...(gatewayHost ? { gatewayHost } : {}),
    appVersion,
    useSingleConnection: true,
  });
}

function createEoaSigner(privateKey) {
  const account = privateKeyToAccount(normalizeHexPrivateKey(privateKey));
  return {
    type: 'EOA',
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: ETHEREUM_IDENTIFIER_KIND,
    }),
    async signMessage(message) {
      const signature = await account.signMessage({ message });
      return hexToBytes(signature);
    },
  };
}

async function ensureRoom({ rooms, client, threadId, conversationId, topicId, roomName, wallet, participants } = {}) {
  const existing = rooms.get(threadId);
  if (existing) {
    existing.roomName = roomName;
    existing.participants = mergeParticipants(existing.participants, participants);
    return existing;
  }

  if (conversationId) {
    return openBoundRoom({ rooms, client, threadId, conversationId, topicId, roomName, participants });
  }

  const identifiers = buildMemberIdentifiers(wallet);
  if (!identifiers.length) throw new TypeError('Authenticated holder wallet is required for a new XMTP group.');
  const metadata = { name: roomName, description: String(topicId ?? threadId) };
  const conversation = await client.conversations.createGroupWithIdentifiers(identifiers, metadata);

  const room = {
    conversation,
    topicId: String(topicId ?? threadId),
    roomName,
    participants: mergeParticipants([], participants),
    messages: [],
  };
  rooms.set(threadId, room);
  return room;
}

async function openBoundRoom({ rooms, client, threadId, conversationId, topicId, roomName, participants } = {}) {
  await client.conversations.sync?.();
  const conversation = await client.conversations.getConversationById(conversationId);
  if (!conversation) throw new Error(`XMTP conversation not found: ${conversationId}`);
  const room = {
    conversation,
    topicId: String(topicId ?? threadId),
    roomName,
    participants: mergeParticipants([], participants),
    messages: [],
  };
  rooms.set(threadId, room);
  return room;
}

function buildMemberIdentifiers(wallet) {
  const normalized = String(wallet ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return [];
  return [{
    identifier: normalized,
    identifierKind: ETHEREUM_IDENTIFIER_KIND,
  }];
}

function buildOutboundText(message = {}) {
  const sender = String(message.senderLabel ?? '').trim();
  if (!sender || message.role === 'human') return message.text;
  return `[${sender}] ${message.text}`;
}

function normalizeOutboundMessage(message = {}, defaults = {}) {
  const text = String(message.text ?? '').trim();
  if (!text) return null;
  return {
    id: String(message.id ?? defaults.fallbackId ?? '').trim() || defaults.fallbackId,
    role: String(message.role ?? 'agent') === 'human' ? 'human' : 'agent',
    text,
    sentAt: String(message.sentAt ?? defaults.sentAt ?? new Date().toISOString()),
    transport: String(message.transport ?? defaults.transport ?? 'xmtp_local'),
    ...(message.senderLabel ? { senderLabel: String(message.senderLabel) } : {}),
    ...(message.participantId ? { participantId: String(message.participantId) } : {}),
    ...(message.inferenceProvider ? { inferenceProvider: String(message.inferenceProvider) } : {}),
    ...(defaults.conversationId ? { conversationId: String(defaults.conversationId) } : {}),
  };
}

function mergeParticipants(existing = [], incoming = []) {
  const byId = new Map();
  for (const participant of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const normalized = normalizeParticipant(participant);
    if (!normalized) continue;
    byId.set(normalized.participantId, normalized);
  }
  return [...byId.values()];
}

function normalizeParticipant(participant = {}) {
  const participantId = String(
    participant.participantId ?? participant.agentId ?? participant.tokenId ?? participant.wallet ?? '',
  ).trim();
  if (!participantId) return null;
  const normalized = {
    participantId,
    displayName: String(participant.displayName ?? participant.agentName ?? `Agent ${participantId}`).trim() || `Agent ${participantId}`,
    role: String(participant.role ?? 'Onchain agent').trim() || 'Onchain agent',
  };
  if (participant.kind) normalized.kind = String(participant.kind);
  if (participant.wallet) normalized.wallet = String(participant.wallet).trim().toLowerCase();
  if (participant.agentId) normalized.agentId = String(participant.agentId).trim();
  if (participant.tokenId) normalized.tokenId = String(participant.tokenId).trim();
  return normalized;
}

function normalizeRoomName(value) {
  return String(value ?? '').trim() || 'Multipass room';
}

function normalizeHexPrivateKey(value) {
  const key = String(value ?? '').trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new TypeError('MULTIPASS_XMTP_WALLET_KEY must be a 32-byte hex private key.');
  }
  return key;
}

export function normalizeDbEncryptionKey(value) {
  if (value == null) return value;
  if (value instanceof Uint8Array) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(text)) {
    const hex = text.startsWith('0x') ? text.slice(2) : text;
    return Buffer.from(hex, 'hex');
  }
  return Buffer.from(text, 'utf8');
}

function requireThreadId(value) {
  const threadId = String(value ?? '').trim();
  if (!threadId) throw new TypeError('XMTP thread id is required.');
  return threadId;
}

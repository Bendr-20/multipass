import { hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ETHEREUM_IDENTIFIER_KIND = 0;

export function createDeferredXmtpAgentClient(options = {}) {
  const fallback = createLocalXmtpAgentClient(options);
  let clientPromise = null;

  return {
    provider: options.enabled ? 'xmtp_deferred' : fallback.provider,
    transport: options.enabled ? 'xmtp_group' : fallback.transport,

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
    if (clientPromise) return clientPromise;
    if (!options.enabled || !String(options.walletKey ?? '').trim()) {
      clientPromise = Promise.resolve(fallback);
      return clientPromise;
    }
    clientPromise = createNodeXmtpAgentClient(options);
    return clientPromise;
  }
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
        conversationId: room?.conversationId ?? null,
        roomName: room?.roomName ?? normalizeRoomName(input.roomName),
        participants: [...(room?.participants ?? [])],
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
      const room = rooms.get(threadId);
      return {
        threadId,
        conversationId: room?.conversation?.id ?? null,
        roomName: room?.roomName ?? normalizeRoomName(input.roomName),
        participants: [...(room?.participants ?? [])],
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

async function ensureRoom({ rooms, client, threadId, conversationId, roomName, wallet, participants } = {}) {
  const existing = rooms.get(threadId);
  if (existing) {
    existing.roomName = roomName;
    existing.participants = mergeParticipants(existing.participants, participants);
    return existing;
  }

  if (conversationId) {
    await client.conversations.sync?.();
    const conversation = await client.conversations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`XMTP conversation not found: ${conversationId}`);
    }
    const room = {
      conversation,
      roomName,
      participants: mergeParticipants([], participants),
      messages: [],
    };
    rooms.set(threadId, room);
    return room;
  }

  const identifiers = buildMemberIdentifiers(wallet);
  let conversation;
  try {
    conversation = identifiers.length
      ? await client.conversations.createGroupWithIdentifiers(identifiers, { name: roomName })
      : client.conversations.createGroupOptimistic({ name: roomName });
  } catch (error) {
    if (!identifiers.length) throw error;
    conversation = client.conversations.createGroupOptimistic({ name: roomName });
  }

  const room = {
    conversation,
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
    participant.participantId ?? participant.agentId ?? participant.tokenId ?? '',
  ).trim();
  if (!participantId) return null;
  return {
    participantId,
    agentId: String(participant.agentId ?? participantId).trim() || participantId,
    tokenId: String(participant.tokenId ?? participantId).trim() || participantId,
    displayName: String(participant.displayName ?? participant.agentName ?? `Agent ${participantId}`).trim() || `Agent ${participantId}`,
    role: String(participant.role ?? 'Onchain agent').trim() || 'Onchain agent',
  };
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

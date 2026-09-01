import {
  buildSibylMemoryNamespace,
  createSibylMemoryStore,
  extractDurableMemoryFromMessage,
} from '../sibyl-memory/index.js';
import { createDeferredXmtpAgentClient } from '../xmtp-agent/index.js';

const DEFAULT_AGENT_ID = 'agent-manager';
const DEFAULT_TOKEN_CONTRACT = '0x2e3B541C59D38b84E3Bc54e977200230A204Fe60';
const MAX_THREAD_HISTORY = 24;

export function createConsoleAgentRuntime({
  memoryClient = createSibylMemoryStore(),
  llmClient = createLocalLlmClient(),
  signalProvider = createLocalSignalProvider(),
  xmtpClient = createDeferredXmtpAgentClient(),
  now = () => new Date().toISOString(),
} = {}) {
  return {
    async handleMessage(input = {}) {
      const wallet = requireWallet(input.wallet);
      const message = String(input.message ?? '').trim();
      if (!message) throw new TypeError('Message is required.');

      const profile = createRuntimeProfile(input);
      const namespace = profile.memoryNamespace;
      const room = createRoomState(input, profile);
      const threadId = room.threadId;
      const priorMessages = await memoryClient.loadThread?.({ namespace, limit: 12 }) ?? [];
      const recentMemory = await memoryClient.recallMemory({ namespace, limit: 5 });
      const matchedMemory = await memoryClient.searchMemory({ namespace, query: message, limit: 5 });
      const recalledMemory = mergeMemoryEntries([...matchedMemory, ...recentMemory]);
      const signals = await signalProvider.getSignals({ profile, room, message, memory: recalledMemory });

      const userMessage = createThreadMessage({
        id: `msg_${hashish(`${threadId}:human:${message}:${now()}`)}`,
        role: 'human',
        text: message,
        sentAt: now(),
        transport: xmtpClient.transport ?? 'xmtp_local',
        senderLabel: 'You',
        participantId: room.operatorId,
      });

      const extractedMemories = extractDurableMemoryFromMessage(message);
      const savedMemory = [];
      for (const memory of extractedMemories) {
        const saved = await memoryClient.saveMemory({ namespace, ...memory, savedAt: now() });
        if (saved) savedMemory.push(saved);
      }

      const agentMessages = [];
      for (const participant of room.participants) {
        const llm = await llmClient.generate({
          profile: createParticipantProfile(profile, participant, room),
          participant,
          room,
          wallet,
          message,
          memory: recalledMemory,
          signals,
          history: priorMessages,
        });
        agentMessages.push(createThreadMessage({
          id: `msg_${hashish(`${threadId}:${participant.participantId}:${llm.text}:${now()}`)}`,
          role: 'agent',
          text: llm.text,
          sentAt: now(),
          transport: xmtpClient.transport ?? 'xmtp_local',
          inferenceProvider: llm.provider,
          senderLabel: participant.displayName,
          participantId: participant.participantId,
        }));
      }

      const publishedRoom = await xmtpClient.publishRoomMessages({
        threadId,
        roomName: room.name,
        wallet,
        participants: room.participants,
        messages: [userMessage, ...agentMessages],
      });
      const publishedMessages = publishedRoom.messages.slice(-(1 + agentMessages.length));

      const threadMessages = await memoryClient.appendThread({
        namespace,
        messages: publishedMessages.slice(-MAX_THREAD_HISTORY),
      });

      return {
        schema_version: '0.1.0',
        mode: 'console_agent_runtime',
        profile,
        room: {
          id: room.id,
          name: room.name,
          primaryParticipantId: room.primaryParticipantId,
          participants: room.participants,
        },
        thread: {
          transport: publishedRoom.transport,
          adapter: publishedRoom.adapter,
          threadId,
          conversationId: publishedRoom.conversationId ?? null,
          roomName: publishedRoom.roomName ?? room.name,
          participants: publishedRoom.participants ?? room.participants,
          messages: threadMessages,
        },
        memory: {
          provider: memoryClient.provider ?? 'sibyl_memory',
          namespace,
          recalled: recalledMemory,
          saved: savedMemory,
        },
        signals,
        missions: deriveMissions(message, savedMemory),
        proposals: deriveProposals({ message, signals, room }),
      };
    },
  };
}

export function createRuntimeProfile(input = {}) {
  const wallet = requireWallet(input.wallet);
  const tokenId = String(input.tokenId ?? input.agentId ?? 'unknown').trim() || 'unknown';
  const agentId = String(input.agentId ?? tokenId ?? DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID;
  const activationId = String(input.activationId ?? `activation_${agentId}`).trim();
  const displayName = String(input.agentName ?? input.displayName ?? (tokenId === 'unknown' ? 'Selected agent' : `Agent #${tokenId}`)).trim();
  return {
    activationId,
    agentId,
    displayName,
    source: 'multipass_console_manager',
    rootIdentity: {
      collection: 'Helixa AgentDNA',
      tokenContract: String(input.tokenContract ?? DEFAULT_TOKEN_CONTRACT).trim(),
      tokenId,
      ownerWallet: wallet,
    },
    chat: {
      threadId: `console:${agentId}`,
      status: 'live',
    },
    inference: {
      provider: 'bankr_llm_gateway',
      status: 'server_side_only',
    },
    memoryNamespace: buildSibylMemoryNamespace({ wallet, agentId, activationId }),
    permissions: {
      trading: 'review_only',
      custody: 'disabled',
      toolAuthority: 'human_review',
    },
  };
}

export function createLocalLlmClient() {
  return {
    provider: 'local_bankr_adapter',
    async generate({ profile, participant, room, memory, signals, history } = {}) {
      const memoryLine = memory?.length
        ? `I found ${memory.length} Sibyl memory item${memory.length === 1 ? '' : 's'} tied to this agent.`
        : 'I do not have Sibyl memory for this agent yet.';
      const signalLine = signals?.length
        ? `Current suite status: ${signals[0].title} is ${String(signals[0].status ?? '').toLowerCase()}.`
        : 'Suite status is still initializing.';
      const historyLine = history?.length
        ? `I also loaded ${history.length} recent chat message${history.length === 1 ? '' : 's'}.`
        : 'This looks like a fresh chat.';
      const participantCountLine = room?.participants?.length > 1
        ? `This room currently has ${room.participants.length} participating agents.`
        : 'I am the only active agent in this room right now.';
      const roleLine = String(participant?.role ?? '').trim()
        ? `${participant.role} perspective.`
        : 'Operator perspective.';
      return {
        provider: 'local_bankr_adapter',
        text: `${profile.displayName} is online. ${roleLine} ${participantCountLine} ${memoryLine} ${historyLine} ${signalLine} I saved durable watchlist, preference, and constraint notes from your message. I can brief and propose, but every action stays review-only.`,
      };
    },
  };
}

function createLocalSignalProvider() {
  return {
    async getSignals({ profile, room, memory } = {}) {
      return [
        {
          title: 'Manager suite',
          status: memory?.length ? 'Recalled' : 'Ready',
          summary: `${profile.displayName} is loaded in ${room?.name ?? 'the room'} with Sibyl-backed recall and human approval.`,
        },
      ];
    },
  };
}

function deriveMissions(message, savedMemory) {
  if (!savedMemory.some((memory) => memory.tags?.includes('watchlist') || memory.tags?.includes('mission'))) return [];
  return [{
    id: 'mission_watchlist',
    title: 'Active watchlist',
    status: 'active',
    summary: message,
  }];
}

function deriveProposals({ message, signals, room }) {
  if (!/\bwatch\b|\btrack\b|\bmonitor\b|\brecommend\b|\breview\b/i.test(message)) return [];
  return [{
    id: 'proposal_review_only_watch',
    title: 'Review live briefing',
    status: 'review_only',
    action: room?.participants?.length > 1
      ? 'Keep monitoring together and wait for human approval before any external action.'
      : 'Keep monitoring and wait for human approval before any external action.',
    rationale: signals?.[0]?.summary ?? 'The suite is loaded and waiting for review.',
    risk: 'No transaction authority is attached to this proposal.',
  }];
}

function createRoomState(input = {}, profile = {}) {
  const participants = normalizeParticipants(input, profile);
  const primaryParticipant = participants.find((participant) => participant.agentId === profile.agentId) ?? participants[0];
  const roomId = `room_${participants.map((participant) => participant.participantId).join('_')}`;
  return {
    id: roomId,
    name: String(input.roomName ?? `${primaryParticipant?.displayName ?? profile.displayName} ops`).trim() || 'Multipass room',
    threadId: `xmtp:${roomId}`,
    operatorId: requireWallet(input.wallet),
    primaryParticipantId: primaryParticipant?.participantId ?? profile.agentId,
    participants,
  };
}

function normalizeParticipants(input = {}, profile = {}) {
  const rawParticipants = Array.isArray(input.participants) && input.participants.length
    ? input.participants
    : [{
      agentId: profile.agentId,
      tokenId: profile.rootIdentity?.tokenId ?? input.tokenId ?? profile.agentId,
      agentName: profile.displayName,
      role: input.agentRole ?? 'Onchain agent',
    }];
  const byId = new Map();
  for (const raw of rawParticipants) {
    const participantId = String(raw?.participantId ?? raw?.agentId ?? raw?.tokenId ?? '').trim();
    if (!participantId) continue;
    byId.set(participantId, {
      participantId,
      agentId: String(raw.agentId ?? participantId).trim() || participantId,
      tokenId: String(raw.tokenId ?? participantId).trim() || participantId,
      displayName: String(raw.displayName ?? raw.agentName ?? `Agent #${participantId}`).trim() || `Agent #${participantId}`,
      role: String(raw.role ?? 'Onchain agent').trim() || 'Onchain agent',
    });
  }
  return [...byId.values()];
}

function createParticipantProfile(profile = {}, participant = {}, room = {}) {
  return {
    ...profile,
    agentId: participant.agentId,
    displayName: participant.displayName,
    role: participant.role,
    chat: {
      ...(profile.chat ?? {}),
      threadId: room.threadId ?? profile.chat?.threadId,
      roomId: room.id ?? null,
    },
  };
}

function requireWallet(value) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError('wallet must be an EVM wallet address.');
  return wallet;
}

function createThreadMessage(message = {}) {
  return {
    id: String(message.id ?? `msg_${hashish(`${message.role}:${message.text}:${message.sentAt}`)}`),
    role: String(message.role ?? 'agent') === 'human' ? 'human' : 'agent',
    text: String(message.text ?? '').trim(),
    sentAt: String(message.sentAt ?? new Date().toISOString()),
    transport: String(message.transport ?? 'xmtp_local'),
    ...(message.senderLabel ? { senderLabel: String(message.senderLabel) } : {}),
    ...(message.participantId ? { participantId: String(message.participantId) } : {}),
    ...(message.conversationId ? { conversationId: String(message.conversationId) } : {}),
    ...(message.xmtpMessageId ? { xmtpMessageId: String(message.xmtpMessageId) } : {}),
    ...(message.inferenceProvider ? { inferenceProvider: String(message.inferenceProvider) } : {}),
  };
}

function mergeMemoryEntries(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const text = String(entry?.text ?? '').trim();
    if (!text) return false;
    const tags = Array.isArray(entry.tags) ? entry.tags.join(',') : '';
    const key = `${text}::${tags}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashish(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

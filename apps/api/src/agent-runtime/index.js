import {
  buildSibylMemoryNamespace,
  createSibylMemoryStore,
  extractDurableMemoryFromMessage,
} from '../sibyl-memory/index.js';
import { getConsoleSkillCatalog } from '../console-skill-catalog.js';
import { projectConsoleLlmDisplayText } from '../console-transfer-candidate.js';
import { resolveConsoleReadSkillIntent } from '../console-read-skills.js';
import { buildCanonicalConsoleRoom } from '../looper-runtime-registry.js';
import { createDeferredXmtpAgentClient } from '../xmtp-agent/index.js';

const DEFAULT_AGENT_ID = 'agent-manager';
const DEFAULT_TOKEN_CONTRACT = '0x2e3B541C59D38b84E3Bc54e977200230A204Fe60';
const MAX_THREAD_HISTORY = 24;
const CONSOLE_EXECUTION_MODE = 'review_only';
const DEFAULT_SKILL_PROVIDER_TIMEOUT_MS = 25_000;
const MAX_SKILL_RESULT_TEXT_BYTES = 2_048;
const MAX_MARKET_RESULT_TEXT_BYTES = 4_096;
const MARKET_RESULT_FOOTER = 'Read-only market research; informational only.';

export function createConsoleAgentRuntime({
  memoryClient = createSibylMemoryStore(),
  llmClient = createLocalLlmClient(),
  signalProvider = createLocalSignalProvider(),
  xmtpClient = createDeferredXmtpAgentClient(),
  now = () => new Date().toISOString(),
  skillProposalsEnabled = false,
  marketReadEnabled = false,
  readSkillExecutor,
  bankrReadEnabled = true,
  skillProviderTimeoutMs = DEFAULT_SKILL_PROVIDER_TIMEOUT_MS,
} = {}) {
  const consoleCatalog = getConsoleSkillCatalog();
  const capabilities = skillProposalsEnabled ? consoleCatalog : null;
  const skillTimeoutMs = normalizeSkillProviderTimeout(skillProviderTimeoutMs);
  const inFlightSkillCalls = new Map();
  return {
    async getThread(input = {}) {
      const wallet = requireWallet(input.wallet);
      const profile = createRuntimeProfile(input);
      const namespace = profile.memoryNamespace;
      const room = createRoomState(input, profile);
      const storedMessages = await memoryClient.loadThread?.({ namespace, limit: MAX_THREAD_HISTORY }) ?? [];
      const messages = sanitizeBankrLlmMessages(storedMessages, consoleCatalog);
      const recalledMemory = await memoryClient.recallMemory({ namespace, limit: 5 });
      const transportThread = xmtpClient.transport === 'unavailable'
        ? {
          threadId: room.threadId,
          topicId: room.topicId,
          conversationId: room.conversationId,
          roomName: room.name,
          transport: 'unavailable',
          adapter: xmtpClient.provider ?? 'xmtp_disabled',
          participants: room.participants,
          messages: [],
        }
        : await xmtpClient.getThread({
          threadId: room.threadId,
          topicId: room.topicId,
          conversationId: room.conversationId,
          roomName: room.name,
          wallet,
          participants: room.participants,
        });
      return {
        schema_version: '0.1.0',
        mode: 'console_agent_runtime',
        executionMode: CONSOLE_EXECUTION_MODE,
        profile,
        room: publicRoom(room),
        thread: {
          transport: transportThread.transport ?? xmtpClient.transport,
          adapter: transportThread.adapter ?? xmtpClient.provider,
          threadId: room.threadId,
          topicId: room.topicId,
          conversationId: transportThread.conversationId ?? room.conversationId ?? null,
          roomName: transportThread.roomName ?? room.name,
          participants: transportThread.participants?.length ? transportThread.participants : room.participants,
          messages: sanitizeBankrLlmMessages(
            mergeRecoveredThreadMessages(messages, transportThread.messages),
            consoleCatalog,
          ),
        },
        memory: {
          provider: memoryClient.provider ?? 'sibyl_memory',
          namespace,
          recalled: recalledMemory,
          saved: [],
        },
        signals: [],
        missions: [],
        proposals: [],
        ...(skillProposalsEnabled ? { capabilities, proposalCandidates: [] } : {}),
      };
    },

    async handleMessage(input = {}) {
      const wallet = requireWallet(input.wallet);
      const message = String(input.message ?? '').trim();
      const attachment = normalizeRuntimeImageAttachment(input.attachment);
      if (!message && !attachment) throw new TypeError('Message or image is required.');
      if (attachment && llmClient?.supportsVision !== true) {
        throw new Error('Image understanding is unavailable because a vision-capable LLM is not configured.');
      }

      const resolvedSkillIntent = attachment ? null : resolveConsoleReadSkillIntent(message);
      const explicitSkillCommand = resolvedSkillIntent?.operation === 'market_research'
        ? marketReadEnabled ? resolvedSkillIntent : null
        : skillProposalsEnabled ? resolvedSkillIntent : null;

      const profile = createRuntimeProfile(input);
      const namespace = profile.memoryNamespace;
      const room = createRoomState(input, profile);
      const threadId = room.threadId;
      const clientMessageId = normalizeClientMessageId(input.clientMessageId ?? input.inboundMessageId);
      if (attachment && !clientMessageId) throw new TypeError('Image turns require a stable client message id.');
      let priorMessages = [];
      let recalledMemory = [];
      let walletContext = null;
      let signals = [];
      const savedMemory = [];
      if (!explicitSkillCommand) {
        const storedPriorMessages = await memoryClient.loadThread?.({ namespace, limit: 12 }) ?? [];
        priorMessages = sanitizeBankrLlmMessages(storedPriorMessages, consoleCatalog)
          .filter(isSafeInferenceHistoryMessage);
        const recentMemory = await memoryClient.recallMemory({ namespace, limit: 5 });
        const matchedMemory = await memoryClient.searchMemory({ namespace, query: message, limit: 5 });
        recalledMemory = mergeMemoryEntries([...matchedMemory, ...recentMemory]);
        walletContext = normalizeWalletContext(input.walletContext);
        signals = await signalProvider.getSignals({ profile, room, message, memory: recalledMemory, walletContext });
        for (const memory of extractDurableMemoryFromMessage(message)) {
          const saved = await memoryClient.saveMemory({ namespace, ...memory, savedAt: now() });
          if (saved) savedMemory.push(saved);
        }
      }

      const userMessage = createThreadMessage({
        id: `msg_${hashish(clientMessageId
          ? `${threadId}:human:${clientMessageId}`
          : `${threadId}:human:${message}:${now()}`)}`,
        role: 'human',
        text: message,
        attachment,
        sentAt: now(),
        transport: xmtpClient.transport ?? 'xmtp_local',
        senderLabel: 'You',
        participantId: room.operatorId,
        conversationId: input.conversationId,
        xmtpMessageId: input.inboundMessageId,
      });

      const agentMessages = [];
      const participantResponses = [];
      if (explicitSkillCommand) {
        if (!readSkillExecutor || typeof readSkillExecutor.execute !== 'function') {
          throw new Error('Console read skill executor is not configured.');
        }
        if (explicitSkillCommand.skill === 'bankr' && !bankrReadEnabled) {
          throw new Error('Bankr Agent read skill is disabled because BANKR_READONLY_API_KEY is not configured.');
        }
        const dedupeKey = `${wallet}:${profile.rootIdentity.tokenId}:${explicitSkillCommand.command}`;
        const skillResult = await executeSkillWithDedupe({
          command: explicitSkillCommand.command,
          expectedSkill: explicitSkillCommand.skill,
          expectedOperation: explicitSkillCommand.operation,
          expectedKind: explicitSkillCommand.kind,
          expectedQuery: explicitSkillCommand.operation === 'market_research'
            ? explicitSkillCommand.command.replace(/^\/bankr research (?:market|news|comparison) /, '')
            : null,
          readSkillExecutor,
          timeoutMs: skillTimeoutMs,
          inFlightSkillCalls,
          dedupeKey,
        });
        const participant = selectSkillParticipant(room);
        const agentMessage = createThreadMessage({
          id: `msg_${hashish(`${userMessage.id}:${participant.participantId}:reply`)}`,
          role: 'agent',
          text: skillResult.text,
          sentAt: now(),
          transport: xmtpClient.transport ?? 'xmtp_local',
          inferenceProvider: skillResult.provider,
          senderLabel: participant.displayName,
          participantId: participant.participantId,
        });
        agentMessages.push(agentMessage);
        participantResponses.push({
          participantId: participant.participantId,
          draftMessage: agentMessage,
          skillRefs: [skillResult.skill],
          transferCandidates: [],
        });
      } else {
        for (const participant of room.participants.filter((entry) => entry.kind !== 'operator')) {
          const llm = await llmClient.generate({
            profile: createParticipantProfile(profile, participant, room),
            participant,
            room,
            wallet,
            message,
            memory: recalledMemory,
            signals,
            history: priorMessages,
            walletContext,
            attachment,
          });
          const displayText = llm.provider === 'bankr_llm_gateway'
            ? projectConsoleLlmDisplayText(llm.text, { catalog: consoleCatalog })
            : llm.text;
          const agentMessage = createThreadMessage({
            id: `msg_${hashish(`${userMessage.id}:${participant.participantId}:reply`)}`,
            role: 'agent',
            text: displayText,
            sentAt: now(),
            transport: xmtpClient.transport ?? 'xmtp_local',
            inferenceProvider: llm.provider,
            senderLabel: participant.displayName,
            participantId: participant.participantId,
          });
          agentMessages.push(agentMessage);
          if (skillProposalsEnabled) {
            participantResponses.push({
              participantId: participant.participantId,
              draftMessage: agentMessage,
              skillRefs: normalizeRuntimeSkillRefs(llm.skillRefs, capabilities),
              transferCandidates: Array.isArray(llm.transferCandidates) ? llm.transferCandidates.slice(0, 1) : [],
            });
          }
        }
      }

      const shouldPublishHumanMessage = input.publishHumanMessage !== false;
      const messagesToPublish = shouldPublishHumanMessage ? [userMessage, ...agentMessages] : agentMessages;
      const publishedRoom = await xmtpClient.publishRoomMessages({
        threadId,
        topicId: room.topicId,
        conversationId: room.conversationId,
        roomName: room.name,
        wallet,
        participants: room.participants,
        messages: messagesToPublish,
      });
      const publishedMessages = publishedRoom.messages.slice(-messagesToPublish.length);
      const threadBatch = shouldPublishHumanMessage
        ? publishedMessages
        : [userMessage, ...publishedMessages];
      const currentPublishedMessages = Array.isArray(publishedRoom.publishedMessages)
        ? publishedRoom.publishedMessages
        : [];
      const proposalCandidates = skillProposalsEnabled
        ? bindProposalCandidates(participantResponses, currentPublishedMessages, capabilities)
        : null;

      const persistedThreadMessages = await memoryClient.appendThread({
        namespace,
        messages: threadBatch.slice(-MAX_THREAD_HISTORY),
      });
      const sanitizedThreadMessages = sanitizeBankrLlmMessages(persistedThreadMessages, consoleCatalog);
      const responseThreadMessages = hydrateCurrentThreadAttachments(sanitizedThreadMessages, threadBatch);

      return {
        schema_version: '0.1.0',
        mode: 'console_agent_runtime',
        executionMode: CONSOLE_EXECUTION_MODE,
        profile,
        room: publicRoom(room),
        thread: {
          transport: publishedRoom.transport,
          adapter: publishedRoom.adapter,
          threadId,
          topicId: publishedRoom.topicId ?? room.topicId,
          conversationId: publishedRoom.conversationId ?? null,
          roomName: publishedRoom.roomName ?? room.name,
          participants: publishedRoom.participants ?? room.participants,
          messages: responseThreadMessages,
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
        ...(skillProposalsEnabled ? { capabilities, proposalCandidates } : {}),
      };
    },
  };
}

function selectSkillParticipant(room) {
  const agents = room.participants.filter((entry) => entry.kind !== 'operator');
  return agents.find((entry) => entry.participantId === room.primaryParticipantId) ?? agents[0];
}

function executeSkillWithDedupe({
  command,
  expectedSkill,
  expectedOperation,
  expectedKind,
  expectedQuery,
  readSkillExecutor,
  timeoutMs,
  inFlightSkillCalls,
  dedupeKey,
}) {
  const existing = inFlightSkillCalls.get(dedupeKey);
  if (existing) return existing;

  const controller = new AbortController();
  let timeout;
  const providerCall = Promise.resolve()
    .then(() => readSkillExecutor.execute(command, { signal: controller.signal }))
    .then((result) => projectDisplayOnlySkillResult(
      result,
      expectedSkill,
      expectedOperation,
      expectedKind,
      expectedQuery,
    ));
  const deadline = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Console skill provider deadline exceeded.'));
    }, timeoutMs);
  });
  const boundedCall = Promise.race([providerCall, deadline]).finally(() => {
    clearTimeout(timeout);
  });
  inFlightSkillCalls.set(dedupeKey, boundedCall);
  providerCall.then(
    () => {
      if (inFlightSkillCalls.get(dedupeKey) === boundedCall) inFlightSkillCalls.delete(dedupeKey);
    },
    () => {
      if (inFlightSkillCalls.get(dedupeKey) === boundedCall) inFlightSkillCalls.delete(dedupeKey);
    },
  );
  return boundedCall;
}

function projectDisplayOnlySkillResult(value, expectedSkill, expectedOperation, expectedKind, expectedQuery) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed Console skill result.');
  }
  if (value.skill !== expectedSkill || typeof value.text !== 'string' || !value.text.trim()) {
    throw new Error('Malformed Console skill result.');
  }
  const expected = expectedSkill === 'bankr'
    ? { operation: expectedOperation, provider: 'bankr_agent_api' }
    : { operation: 'agent_profile_read', provider: 'helixa_public_api' };
  if (value.operation !== expected.operation || value.provider !== expected.provider) {
    throw new Error('Malformed Console skill result.');
  }
  if (expectedOperation === 'market_research') {
    if (!value.data
      || value.data.kind !== expectedKind
      || value.data.query !== expectedQuery
      || !value.text.endsWith('Read-only market research; informational only.')) {
      throw new Error('Malformed Console skill result.');
    }
  }
  const text = expectedOperation === 'market_research'
    ? truncateMarketResearchText(value.text.trim())
    : truncateUtf8(value.text.trim(), MAX_SKILL_RESULT_TEXT_BYTES);
  return Object.freeze({
    skill: expectedSkill,
    operation: expected.operation,
    provider: expected.provider,
    text,
    ...(expectedOperation === 'market_research' ? { kind: expectedKind } : {}),
  });
}

function truncateMarketResearchText(value) {
  if (Buffer.byteLength(value, 'utf8') <= MAX_MARKET_RESULT_TEXT_BYTES) return value;
  const suffix = `\n\n${MARKET_RESULT_FOOTER}`;
  const body = value.slice(0, -MARKET_RESULT_FOOTER.length).trimEnd();
  return `${truncateUtf8(body, MAX_MARKET_RESULT_TEXT_BYTES - Buffer.byteLength(suffix, 'utf8'))}${suffix}`;
}

function normalizeSkillProviderTimeout(value) {
  if (value === undefined || value === null) return DEFAULT_SKILL_PROVIDER_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 10 || value > 30_000) {
    throw new TypeError('skillProviderTimeoutMs must be between 10 and 30000.');
  }
  return value;
}

function truncateUtf8(value, maxBytes) {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let output = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes) break;
    output += character;
    bytes += size;
  }
  return output;
}

function isSafeInferenceHistoryMessage(message) {
  return !['bankr_agent_api', 'helixa_public_api'].includes(String(message?.inferenceProvider ?? ''));
}

function sanitizeBankrLlmMessages(messages, catalog) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    if (
      message?.role !== 'agent'
      || message?.inferenceProvider !== 'bankr_llm_gateway'
    ) return message;
    return {
      ...message,
      text: projectConsoleLlmDisplayText(message.text, { catalog }),
    };
  });
}

function normalizeRuntimeSkillRefs(value, catalog) {
  if (!Array.isArray(value)) return [];
  const knownSkills = new Set(catalog.skills.map((skill) => skill.id));
  const seen = new Set();
  const refs = [];
  for (const ref of value) {
    if (typeof ref !== 'string' || Buffer.byteLength(ref, 'utf8') > 32 || !knownSkills.has(ref) || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    if (refs.length === 4) break;
  }
  return refs;
}

function bindProposalCandidates(participantResponses, publishedMessages, catalog) {
  const enabledBySkill = new Map(catalog.skills.map((skill) => [skill.id, new Set(skill.enabledCapabilities)]));
  const bound = [];
  for (const response of participantResponses) {
    const message = findPublishedParticipantMessage(response, publishedMessages);
    const sourceMessageId = String(message?.id ?? '').trim();
    if (!sourceMessageId) continue;
    for (const [sourceOrdinal, value] of response.transferCandidates.entries()) {
      const candidate = normalizeRuntimeTransferCandidate(value, response.skillRefs, enabledBySkill);
      if (!candidate) continue;
      bound.push({
        ...candidate,
        sourceMessageId,
        participantId: response.participantId,
        sourceOrdinal,
        skillRefs: [...response.skillRefs],
      });
    }
  }
  return bound;
}

function findPublishedParticipantMessage(response, publishedMessages) {
  const draft = response.draftMessage;
  if (!draft?.text || !Array.isArray(publishedMessages)) return null;
  for (let index = publishedMessages.length - 1; index >= 0; index -= 1) {
    const message = publishedMessages[index];
    if (message?.role !== 'agent' || String(message.participantId ?? '') !== response.participantId) continue;
    if (String(message.id ?? '') === draft.id) return message;
    if (
      message.text === draft.text
      && message.sentAt === draft.sentAt
      && message.senderLabel === draft.senderLabel
      && message.inferenceProvider === draft.inferenceProvider
    ) return message;
  }
  return null;
}

function normalizeRuntimeTransferCandidate(value, skillRefs, enabledBySkill) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!skillRefs.includes(value.skill) || !enabledBySkill.get(value.skill)?.has('propose_transfer')) return null;
  if (!['native', 'erc20'].includes(value.assetType)) return null;
  if (value.assetType === 'native' && value.assetContract !== null) return null;
  if (value.assetType === 'erc20' && typeof value.assetContract !== 'string') return null;
  if (typeof value.recipient !== 'string' || typeof value.amountBaseUnits !== 'string' || typeof value.rationale !== 'string') return null;
  if (Buffer.byteLength(value.rationale, 'utf8') > 512) return null;
  return {
    skill: value.skill,
    assetType: value.assetType,
    assetContract: value.assetContract,
    recipient: value.recipient,
    amountBaseUnits: value.amountBaseUnits,
    rationale: value.rationale,
  };
}

export function createRuntimeProfile(input = {}) {
  const wallet = requireWallet(input.wallet);
  const canonicalIdentity = input.canonicalIdentity && typeof input.canonicalIdentity === 'object'
    ? input.canonicalIdentity
    : null;
  const tokenId = String(canonicalIdentity?.tokenId ?? input.tokenId ?? input.agentId ?? 'unknown').trim() || 'unknown';
  const agentId = String(canonicalIdentity?.erc8004AgentId ?? input.agentId ?? tokenId ?? DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID;
  const activationId = String(input.activationId ?? `activation_${agentId}`).trim();
  const displayName = String(input.agentName ?? input.displayName ?? (tokenId === 'unknown' ? 'Selected agent' : `Agent #${tokenId}`)).trim();
  const tokenContract = String(canonicalIdentity?.contract ?? input.tokenContract ?? DEFAULT_TOKEN_CONTRACT).trim();
  const chainId = Number(canonicalIdentity?.chainId ?? 8453);
  const persona = normalizeRuntimePersona(canonicalIdentity?.persona, tokenId);
  return {
    activationId,
    agentId,
    displayName,
    source: 'multipass_console_manager',
    rootIdentity: {
      collection: canonicalIdentity ? 'Loopers' : 'Helixa AgentDNA',
      chainId,
      tokenContract,
      tokenId,
      erc8004AgentId: canonicalIdentity?.erc8004AgentId ?? agentId,
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
    ...(persona ? { persona } : {}),
    memoryNamespace: canonicalIdentity
      ? buildSibylMemoryNamespace({
        chainId,
        tokenContract,
        tokenId,
        identityAgentId: agentId,
        wallet,
      })
      : buildSibylMemoryNamespace({ wallet, agentId, activationId }),
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
    supportsVision: false,
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
    executable: false,
    executionMode: CONSOLE_EXECUTION_MODE,
    action: room?.participants?.length > 1
      ? 'Keep monitoring together and wait for human approval before any external action.'
      : 'Keep monitoring and wait for human approval before any external action.',
    rationale: signals?.[0]?.summary ?? 'The suite is loaded and waiting for review.',
    risk: 'No transaction authority is attached to this proposal.',
  }];
}

function createRoomState(input = {}, profile = {}) {
  if (input.canonicalIdentity) {
    const canonical = buildCanonicalConsoleRoom({
      activation: {
        status: 'active',
        runtimeName: profile.displayName,
        identity: input.canonicalIdentity,
      },
    });
    return {
      ...canonical,
      conversationId: String(input.canonicalConversationId ?? '').trim() || null,
      operatorId: requireWallet(input.wallet),
    };
  }
  const participants = normalizeParticipants(input, profile);
  const primaryParticipant = participants.find((participant) => participant.agentId === profile.agentId) ?? participants[0];
  const roomId = `room_${participants.map((participant) => participant.participantId).join('_')}`;
  const threadId = String(input.threadId ?? '').trim() || `xmtp:${roomId}`;
  const conversationId = String(input.conversationId ?? '').trim() || null;
  return {
    id: roomId,
    name: String(input.roomName ?? `${primaryParticipant?.displayName ?? profile.displayName} ops`).trim() || 'Multipass room',
    threadId,
    topicId: threadId.replace(/^xmtp:/, ''),
    conversationId,
    operatorId: requireWallet(input.wallet),
    primaryParticipantId: primaryParticipant?.participantId ?? profile.agentId,
    participants,
  };
}

function publicRoom(room = {}) {
  return {
    id: room.id,
    name: room.name,
    topicId: room.topicId,
    primaryParticipantId: room.primaryParticipantId,
    participants: room.participants,
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

function normalizeRuntimePersona(value, tokenId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const limits = {
    canonicalName: 120,
    description: 500,
    agentClass: 120,
    secondaryClass: 120,
    specialization: 160,
    riskProfile: 120,
    autonomy: 120,
    voice: 300,
    firstMission: 300,
    codexVersion: 160,
  };
  const persona = { tokenId: String(tokenId ?? '').trim() };
  for (const [field, maxLength] of Object.entries(limits)) {
    const text = String(value[field] ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
    if (text) persona[field] = text;
  }
  return Object.keys(persona).length > 1 ? persona : null;
}

function normalizeWalletContext(value) {
  if (!value) return null;
  if (value.kind !== 'looper_wallet_read_context'
    || value.capabilities?.read !== true
    || value.capabilities?.sign !== false
    || value.capabilities?.submit !== false
    || value.capabilities?.approve !== false) {
    throw new TypeError('walletContext must be read-only.');
  }
  return JSON.parse(JSON.stringify(value));
}

function requireWallet(value) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError('wallet must be an EVM wallet address.');
  return wallet;
}

function normalizeClientMessageId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(normalized)) throw new TypeError('clientMessageId is invalid.');
  return normalized;
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
    ...(message.captionXmtpMessageId ? { captionXmtpMessageId: String(message.captionXmtpMessageId) } : {}),
    ...(message.inferenceProvider ? { inferenceProvider: String(message.inferenceProvider) } : {}),
    ...(message.attachment ? { attachment: message.attachment } : {}),
  };
}

function mergeRecoveredThreadMessages(storedMessages, transportMessages) {
  const stored = Array.isArray(storedMessages) ? storedMessages : [];
  const transport = Array.isArray(transportMessages) ? transportMessages : [];
  if (!stored.length) return transport;
  const keyOf = (message) => String(message?.id ?? message?.xmtpMessageId ?? '');
  const transportById = new Map(transport.map((message) => [keyOf(message), message]));
  const merged = stored.map((message) => {
    const recovered = transportById.get(keyOf(message));
    return recovered?.attachment?.base64 ? { ...message, attachment: recovered.attachment } : message;
  });
  const seen = new Set(merged.flatMap((message) => [
    keyOf(message),
    String(message?.xmtpMessageId ?? ''),
    String(message?.captionXmtpMessageId ?? ''),
  ]).filter(Boolean));
  for (const message of transport) {
    const key = keyOf(message);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged.sort((left, right) => String(left?.sentAt ?? '').localeCompare(String(right?.sentAt ?? '')));
}

function hydrateCurrentThreadAttachments(storedMessages, currentMessages) {
  const attachmentById = new Map(
    (Array.isArray(currentMessages) ? currentMessages : [])
      .filter((message) => message?.attachment?.base64)
      .map((message) => [String(message.id ?? ''), message.attachment]),
  );
  return (Array.isArray(storedMessages) ? storedMessages : []).map((message) => {
    const attachment = attachmentById.get(String(message?.id ?? ''));
    return attachment ? { ...message, attachment } : message;
  });
}

function normalizeRuntimeImageAttachment(value) {
  if (!value) return null;
  if (value.kind !== 'image' || !(value.content instanceof Uint8Array)) {
    throw new TypeError('Runtime image attachment is invalid.');
  }
  return {
    kind: 'image',
    mimeType: String(value.mimeType),
    filename: String(value.filename),
    content: value.content,
    byteLength: Number(value.byteLength),
    width: value.width ?? null,
    height: value.height ?? null,
    sha256: String(value.sha256),
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

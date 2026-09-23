import { createConsoleAgentRuntime } from '../agent-runtime/index.js';
import { createBankrLlmClient } from '../bankr-llm/index.js';
import { createNodeXmtpAgentClient, createXmtpNodeClient } from '../xmtp-agent/index.js';

const ETHEREUM_IDENTIFIER_KIND = 0;

export function createConsoleXmtpMessageHandler({
  runtime,
  runtimeRegistry,
  authorizeLooper,
  ownInboxId,
  getConversation,
  logger = console,
} = {}) {
  if (!runtime?.handleMessage) throw new TypeError('XMTP worker requires a Console runtime.');
  if (!runtimeRegistry?.getByConversationId || !runtimeRegistry?.get) {
    throw new TypeError('XMTP worker requires the canonical active-runtime registry.');
  }
  if (typeof authorizeLooper !== 'function') throw new TypeError('XMTP worker requires fresh Looper authorization.');
  if (typeof getConversation !== 'function') throw new TypeError('XMTP worker requires a conversation resolver.');
  const processedMessageIds = new Set();

  return {
    async handleMessage(message = {}) {
      const text = extractMessageText(message);
      if (!text) return { processed: false, reason: 'non_text_message' };

      const senderInboxId = String(message.senderInboxId ?? '').trim();
      if (ownInboxId && senderInboxId && senderInboxId === ownInboxId) {
        return { processed: false, reason: 'own_message' };
      }

      const conversationId = String(message.conversationId ?? '').trim();
      if (!conversationId) return { processed: false, reason: 'missing_conversation_id' };
      const messageId = String(message.id ?? '').trim();
      if (!messageId) return { processed: false, reason: 'missing_message_id' };
      const binding = runtimeRegistry.getByConversationId(conversationId);
      if (!binding) return { processed: false, reason: 'unbound_conversation' };

      if (processedMessageIds.has(messageId)) return { processed: false, reason: 'duplicate_message' };

      const conversation = await getConversation(conversationId);
      if (!conversation) return { processed: false, reason: 'conversation_not_found' };

      const wallet = await resolveSenderWallet({ conversation, senderInboxId });
      if (!wallet) return { processed: false, reason: 'sender_wallet_unresolved' };
      if (wallet !== binding.identity.owner) return { processed: false, reason: 'unbound_sender' };

      try {
        const identity = await authorizeLooper({ tokenId: binding.identity.tokenId, wallet });
        if (!sameCanonicalIdentity(identity, binding.identity)) {
          return { processed: false, reason: 'canonical_identity_mismatch' };
        }
        const activation = runtimeRegistry.get(identity);
        if (!activation || activation.conversationId !== conversationId) {
          return { processed: false, reason: 'inactive_runtime' };
        }
        if (messageId) processedMessageIds.add(messageId);
        const result = await runtime.handleMessage({
          wallet,
          tokenId: identity.tokenId,
          agentId: identity.erc8004AgentId,
          activationId: activation.key,
          agentName: activation.runtimeName,
          canonicalIdentity: identity,
          canonicalConversationId: conversationId,
          message: text,
          threadId: activation.threadId,
          inboundMessageId: message.id,
          publishHumanMessage: false,
        });
        return {
          processed: true,
          conversationId,
          wallet,
          result,
        };
      } catch (error) {
        if (messageId) processedMessageIds.delete(messageId);
        logger.error?.('Console XMTP message failed', {
          conversationId,
          messageId: message.id,
          error: error.message,
        });
        throw error;
      }
    },
  };
}

export async function startConsoleXmtpWorker(options = {}) {
  const {
    client = null,
    runtime = null,
    xmtpClient = null,
    logger = console,
    defaults = {},
    fetchImpl = fetch,
    bankrLlmKey = null,
    bankrLlmModel = null,
    consoleAgentBankrLlmEnabled = false,
    consoleSkillProposalsEnabled = false,
    retryAttempts = 10,
    retryDelay = 60_000,
  } = options;

  const nodeClient = client ?? await createXmtpNodeClient(options);
  const publishingClient = xmtpClient ?? await createNodeXmtpAgentClient({
    ...options,
    client: nodeClient,
  });
  const consoleRuntime = runtime ?? createConsoleAgentRuntime({
    llmClient: consoleAgentBankrLlmEnabled
      ? createBankrLlmClient({
        apiKey: bankrLlmKey,
        model: bankrLlmModel,
        fetchImpl,
        skillProposalsEnabled: consoleSkillProposalsEnabled,
      }) ?? undefined
      : undefined,
    xmtpClient: publishingClient,
    skillProposalsEnabled: consoleSkillProposalsEnabled,
  });
  const handler = createConsoleXmtpMessageHandler({
    runtime: consoleRuntime,
    runtimeRegistry: options.runtimeRegistry,
    authorizeLooper: options.authorizeLooper,
    ownInboxId: nodeClient.inboxId,
    getConversation: (conversationId) => nodeClient.conversations.getConversationById(conversationId),
    logger,
  });

  await nodeClient.conversations.syncAll?.();
  await nodeClient.conversations.sync?.();
  const stream = await nodeClient.conversations.streamAllMessages({
    retryAttempts,
    retryDelay,
    onError: (error) => logger.warn?.('Console XMTP stream error', error),
    onRetry: (attempt, max) => logger.warn?.(`Console XMTP stream retry ${attempt}/${max}`),
    onRestart: () => logger.info?.('Console XMTP stream restarted'),
    onFail: () => logger.error?.('Console XMTP stream failed'),
  });

  const done = (async () => {
    for await (const message of stream) {
      await handler.handleMessage(message);
    }
  })();

  done.catch((error) => {
    logger.error?.('Console XMTP worker stopped', error);
  });

  let stopPromise = null;

  return {
    client: nodeClient,
    xmtpClient: publishingClient,
    runtime: consoleRuntime,
    stream,
    done,
    handler,
    stop() {
      if (!stopPromise) {
        stopPromise = (async () => {
          if (stream.end) await stream.end();
          else if (stream.return) await stream.return();
          await done;
        })();
      }
      return stopPromise;
    },
  };
}

export function buildConsoleXmtpWorkerOptionsFromEnv(env = process.env) {
  return {
    env: env.MULTIPASS_XMTP_ENV || 'production',
    walletKey: env.MULTIPASS_XMTP_WALLET_KEY || null,
    dbPath: env.MULTIPASS_XMTP_DB_PATH || null,
    dbEncryptionKey: env.MULTIPASS_XMTP_DB_ENCRYPTION_KEY || null,
    historySyncUrl: env.MULTIPASS_XMTP_HISTORY_SYNC_URL || null,
    apiUrl: env.MULTIPASS_XMTP_API_URL || null,
    gatewayHost: env.MULTIPASS_XMTP_GATEWAY_HOST || null,
    appVersion: env.MULTIPASS_XMTP_APP_VERSION || 'multipass-console-worker',
    bankrLlmKey: env.BANKR_LLM_KEY || env.BANKR_API_KEY || null,
    bankrLlmModel: env.MULTIPASS_AGENT_LLM_MODEL || null,
    consoleAgentBankrLlmEnabled: parseBoolean(env.MULTIPASS_AGENT_BANKR_LLM_ENABLED),
    consoleSkillProposalsEnabled: parseStrictOptionalBoolean(
      env.MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED,
      'MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED',
    ) ?? false,
    defaults: {
      agentId: env.MULTIPASS_XMTP_AGENT_ID || 'agent-manager',
      tokenId: env.MULTIPASS_XMTP_TOKEN_ID || env.MULTIPASS_XMTP_AGENT_ID || 'agent-manager',
      agentName: env.MULTIPASS_XMTP_AGENT_NAME || 'Multipass agent',
      activationId: env.MULTIPASS_XMTP_ACTIVATION_ID || undefined,
      roomName: env.MULTIPASS_XMTP_ROOM_NAME || undefined,
      agentRole: env.MULTIPASS_XMTP_AGENT_ROLE || 'Onchain agent',
    },
  };
}

export function extractMessageText(message = {}) {
  if (typeof message.content === 'string') return message.content.trim();
  if (typeof message.content?.content === 'string') return message.content.content.trim();
  if (typeof message.fallback === 'string') return message.fallback.trim();
  return '';
}

export async function resolveSenderWallet({ conversation, senderInboxId } = {}) {
  const inboxId = String(senderInboxId ?? '').trim();
  if (!inboxId || typeof conversation?.members !== 'function') return null;
  const members = await conversation.members();
  const sender = members.find((member) => member?.inboxId === inboxId);
  const identifiers = Array.isArray(sender?.accountIdentifiers) ? sender.accountIdentifiers : [];
  const walletIdentifier = identifiers.find((identifier) => {
    const kind = Number(identifier?.identifierKind ?? -1);
    const value = String(identifier?.identifier ?? '').trim();
    return kind === ETHEREUM_IDENTIFIER_KIND && /^0x[a-f0-9]{40}$/i.test(value);
  });
  return walletIdentifier ? walletIdentifier.identifier.toLowerCase() : null;
}

function sameCanonicalIdentity(left = {}, right = {}) {
  return Number(left.chainId) === 8453
    && Number(right.chainId) === 8453
    && String(left.contract ?? '').toLowerCase() === String(right.contract ?? '').toLowerCase()
    && String(left.tokenId ?? '') === String(right.tokenId ?? '')
    && String(left.erc8004AgentId ?? '') === String(right.erc8004AgentId ?? '')
    && String(left.owner ?? '').toLowerCase() === String(right.owner ?? '').toLowerCase()
    && left.controllerVerified === true;
}

function parseBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseStrictOptionalBoolean(value, source) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  throw new Error(`Invalid boolean for ${source}: ${value}`);
}

import { createConsoleAgentRuntime } from '../agent-runtime/index.js';
import { createBankrLlmClient } from '../bankr-llm/index.js';
import { createNodeXmtpAgentClient, createXmtpNodeClient } from '../xmtp-agent/index.js';

const ETHEREUM_IDENTIFIER_KIND = 0;

export function createConsoleXmtpMessageHandler({
  runtime,
  ownInboxId,
  getConversation,
  defaults = {},
  logger = console,
} = {}) {
  if (!runtime?.handleMessage) throw new TypeError('XMTP worker requires a Console runtime.');
  if (typeof getConversation !== 'function') throw new TypeError('XMTP worker requires a conversation resolver.');

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

      const conversation = await getConversation(conversationId);
      if (!conversation) return { processed: false, reason: 'conversation_not_found' };

      const wallet = await resolveSenderWallet({ conversation, senderInboxId });
      if (!wallet) return { processed: false, reason: 'sender_wallet_unresolved' };

      try {
        const result = await runtime.handleMessage({
          ...defaults,
          wallet,
          message: text,
          conversationId,
          threadId: `xmtp:${conversationId}`,
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
      ? createBankrLlmClient({ apiKey: bankrLlmKey, model: bankrLlmModel, fetchImpl }) ?? undefined
      : undefined,
    xmtpClient: publishingClient,
  });
  const handler = createConsoleXmtpMessageHandler({
    runtime: consoleRuntime,
    ownInboxId: nodeClient.inboxId,
    getConversation: (conversationId) => nodeClient.conversations.getConversationById(conversationId),
    defaults,
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

  return {
    client: nodeClient,
    stream,
    done,
    handler,
    async stop() {
      if (stream.end) return stream.end();
      if (stream.return) return stream.return();
      return undefined;
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

function parseBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

import {
  buildSibylMemoryNamespace,
  createLocalSibylMemoryStore,
  extractDurableMemoryFromMessage,
} from '../sibyl-memory/index.js';
import { createLocalXmtpAgentClient } from '../xmtp-agent/index.js';

const DEFAULT_AGENT_ID = 'looper-demo';

export function createConsoleAgentRuntime({
  memoryClient = createLocalSibylMemoryStore(),
  llmClient = createLocalLlmClient(),
  xmtpClient = createLocalXmtpAgentClient(),
  signalProvider = createLocalSignalProvider(),
  now = () => new Date().toISOString(),
} = {}) {
  return {
    async handleMessage(input = {}) {
      const wallet = requireWallet(input.wallet);
      const message = String(input.message ?? '').trim();
      if (!message) throw new TypeError('Message is required.');

      const profile = createRuntimeProfile(input);
      const namespace = profile.memoryNamespace;
      const threadId = profile.xmtp.inbox;
      const userMessage = await xmtpClient.appendMessage({
        threadId,
        role: 'human',
        text: message,
        transport: 'console',
      });
      const recalledMemory = await memoryClient.recallMemory({ namespace, query: message });
      const signals = await signalProvider.getSignals({ profile, message, memory: recalledMemory });
      const llm = await llmClient.generate({
        profile,
        wallet,
        message,
        memory: recalledMemory,
        signals,
      });
      const extractedMemories = extractDurableMemoryFromMessage(message);
      const savedMemory = [];
      for (const memory of extractedMemories) {
        const saved = await memoryClient.saveMemory({ namespace, ...memory });
        if (saved) savedMemory.push(saved);
      }

      const agentMessage = await xmtpClient.appendMessage({
        threadId,
        role: 'agent',
        text: llm.text,
        transport: 'xmtp_ready',
        inferenceProvider: llm.provider,
      });

      return {
        schema_version: '0.1.0',
        mode: 'console_agent_runtime',
        profile,
        thread: {
          transport: 'xmtp_ready',
          adapter: xmtpClient.provider ?? 'xmtp_ready',
          threadId,
          messages: [userMessage, agentMessage],
        },
        memory: {
          provider: memoryClient.provider ?? 'sibyl_ready',
          namespace,
          recalled: recalledMemory,
          saved: savedMemory,
        },
        signals,
        missions: deriveMissions(message, savedMemory),
        proposals: deriveProposals({ message, signals, memory: savedMemory }),
      };
    },
  };
}

export function createRuntimeProfile(input = {}) {
  const wallet = requireWallet(input.wallet);
  const agentId = String(input.agentId ?? input.activationId ?? DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID;
  const activationId = String(input.activationId ?? `activation_${agentId}`).trim();
  const tokenId = String(input.tokenId ?? '1234').trim();
  const displayName = String(input.agentName ?? input.displayName ?? `Looper #${tokenId}`).trim();
  return {
    activationId,
    agentId,
    displayName,
    source: 'multipass_console',
    rootIdentity: {
      collection: 'Loopers',
      tokenContract: String(input.tokenContract ?? 'demo:loopers').trim(),
      tokenId,
      ownerWallet: wallet,
    },
    xmtp: {
      inbox: `xmtp:${agentId}`,
      status: 'ready_for_adapter',
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
    async generate({ profile, message, memory, signals } = {}) {
      const memoryLine = memory?.length
        ? `I found ${memory.length} remembered item${memory.length === 1 ? '' : 's'} for this Looper.`
        : 'I do not have prior memory for this Looper yet.';
      const signalLine = signals?.length
        ? `Current signal lane: ${signals[0].title} is ${signals[0].status.toLowerCase()}.`
        : 'Signal context is not loaded yet.';
      return {
        provider: 'local_bankr_adapter',
        text: `${profile.displayName} is online. ${memoryLine} ${signalLine} I saved any durable watchlist, preference, or constraint from: "${message}". I can prepare review-only proposals, but I cannot execute trades.`,
      };
    },
  };
}

function createLocalSignalProvider() {
  return {
    async getSignals() {
      return [
        {
          title: 'Agent assets',
          status: 'Watch',
          summary: 'Base agent-token and agent-economy signals are in watch mode for the first runtime slice.',
        },
      ];
    },
  };
}

function deriveMissions(message, savedMemory) {
  if (!savedMemory.some((memory) => memory.tags.includes('watchlist') || memory.tags.includes('mission'))) return [];
  return [{
    id: 'mission_watchlist',
    title: 'Watch remembered signal lanes',
    status: 'active',
    summary: message,
  }];
}

function deriveProposals({ message, signals }) {
  if (!/\bwatch\b|\btrack\b|\bmonitor\b|\brecommend\b/i.test(message)) return [];
  return [{
    id: 'proposal_review_only_watch',
    title: 'Review watchlist briefing',
    status: 'review_only',
    action: 'Keep monitoring before any execution.',
    rationale: signals?.[0]?.summary ?? 'Signal data is still initializing.',
    risk: 'No transaction authority is attached to this proposal.',
  }];
}

function requireWallet(value) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError('wallet must be an EVM wallet address.');
  return wallet;
}

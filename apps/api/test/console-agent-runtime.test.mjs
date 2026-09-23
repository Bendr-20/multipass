import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleAgentRuntime, createRuntimeProfile } from '../src/agent-runtime/index.js';
import { getConsoleSkillCatalog } from '../src/console-skill-catalog.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import { createLooperRuntimeRegistry } from '../src/looper-runtime-registry.js';
import { buildSibylMemoryNamespace, createLocalSibylMemoryStore, extractDurableMemoryFromMessage } from '../src/sibyl-memory/index.js';
import { createLocalXmtpAgentClient } from '../src/xmtp-agent/index.js';
import { createMultipassConsoleSnapshot } from '../../web/src/multipass-console.js';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const CONSOLE_IDENTITY = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '1234',
  erc8004AgentId: '87069',
  owner: WALLET,
  controllerVerified: true,
};

function createLegacyAuthorizedOptions() {
  const consoleRuntimeRegistry = createLooperRuntimeRegistry();
  consoleRuntimeRegistry.activate({ identity: CONSOLE_IDENTITY, runtimeName: 'Agent #1234' });
  return {
    consoleAuthStore: { validateSession: () => ({ wallet: WALLET }) },
    consoleRuntimeRegistry,
    loopersAuthorizer: async () => CONSOLE_IDENTITY,
  };
}

function secureConsoleRequest(body, path = '/api/multipass/console/agent/message') {
  return new Request(`https://helixa.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'multipass_console=test-session',
      'x-csrf-token': 'test-csrf',
    },
    body: JSON.stringify({ ...body, tokenId: '1234' }),
  });
}

function hasFrontendReviewOnlyProof(payload = {}) {
  const agent = { tokenId: '1234', name: 'Agent #1234', verified: true };
  const snapshot = createMultipassConsoleSnapshot({
    agents: [agent],
    state: {
      walletSnapshot: { connected: true, address: WALLET },
      consoleOwnedAgents: { status: 'loaded', agents: [agent] },
      consoleSelectedAgentId: '1234',
      consoleAgentThread: {
        ...(payload.thread ?? {}),
        proposals: payload.proposals,
        executionMode: payload.executionMode,
        memoryProvider: payload.memory?.provider,
        ...(Array.isArray(payload.memory?.saved) ? { savedMemory: payload.memory.saved } : {}),
        ...(Array.isArray(payload.memory?.recalled) ? { recalledMemory: payload.memory.recalled } : {}),
      },
    },
  });
  return snapshot.suiteChecks.some((check) => check.value === 'Review-only');
}

test('runtime profile binds the selected agent to live chat, Bankr, and Sibyl namespace', () => {
  const profile = createRuntimeProfile({
    wallet: WALLET,
    agentId: 'looper-1234',
    activationId: 'activation-looper-1234',
    tokenId: '1234',
    agentName: 'Signal Looper',
  });

  assert.equal(profile.displayName, 'Signal Looper');
  assert.equal(profile.rootIdentity.ownerWallet, WALLET);
  assert.equal(profile.rootIdentity.tokenId, '1234');
  assert.equal(profile.chat.threadId, 'console:looper-1234');
  assert.equal(profile.inference.provider, 'bankr_llm_gateway');
  assert.equal(profile.memoryNamespace, 'multipass:0x1234567890abcdef1234567890abcdef12345678:looper-1234:activation-looper-1234');
  assert.equal(profile.permissions.trading, 'review_only');
});

test('runtime profile preserves the server-derived canonical Looper persona', () => {
  const profile = createRuntimeProfile({
    wallet: WALLET,
    agentName: 'Market Ghost',
    canonicalIdentity: {
      ...CONSOLE_IDENTITY,
      persona: {
        tokenId: '1234',
        canonicalName: 'Looper #1234',
        agentClass: 'Trader / Broker',
        specialization: 'market making',
        riskProfile: 'Disciplined',
        autonomy: 'Extreme',
        voice: 'conspiracy energy converted into due diligence',
        firstMission: 'price an opportunity',
        codexVersion: 'looper-trait-personality-matrix-v02',
      },
    },
  });

  assert.equal(profile.displayName, 'Market Ghost');
  assert.equal(profile.persona.canonicalName, 'Looper #1234');
  assert.equal(profile.persona.voice, 'conspiracy energy converted into due diligence');
  assert.equal(profile.memoryNamespace, 'multipass:eip155:8453:0x1649cd37f4748807b4882fc48765ba0b2affa94a:1234:erc8004:87069:owner:0x1234567890abcdef1234567890abcdef12345678');
  const transferred = createRuntimeProfile({
    wallet: '0x9999999999999999999999999999999999999999',
    agentName: 'Market Ghost',
    canonicalIdentity: { ...CONSOLE_IDENTITY, owner: '0x9999999999999999999999999999999999999999' },
  });
  assert.notEqual(transferred.memoryNamespace, profile.memoryNamespace);
  assert.equal(profile.permissions.trading, 'review_only');
});

test('local Sibyl adapter saves and recalls durable watchlist memory', async () => {
  const memory = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' });
  const namespace = buildSibylMemoryNamespace({
    wallet: WALLET,
    agentId: 'looper-1234',
    activationId: 'activation-looper-1234',
  });
  const extracted = extractDurableMemoryFromMessage('Watch NVDAx and Base agent tokens. Keep risk medium or lower.');

  assert.equal(extracted.length, 2);
  for (const item of extracted) {
    await memory.saveMemory({ namespace, ...item });
  }

  const recalled = await memory.recallMemory({ namespace });
  assert.equal(recalled.length, 2);
  assert.match(recalled.map((entry) => entry.text).join('\n'), /Watchlist preference/);
  assert.match(recalled.map((entry) => entry.text).join('\n'), /Risk preference/);
});

test('console agent runtime receives a message, saves memory, and emits review-only proposal', async () => {
  const runtime = createConsoleAgentRuntime({
    xmtpClient: createLocalXmtpAgentClient(),
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ profile, message, memory, signals }) {
        assert.equal(profile.displayName, 'Agent #1234');
        assert.match(message, /NVDAx/);
        assert.equal(memory.length, 0);
        assert.equal(signals[0].title, 'Manager suite');
        return { provider: 'fake_bankr', text: 'Saved. I will monitor those lanes and keep proposals review-only.' };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Watch NVDAx, Base agent tokens, and vaults. Keep risk medium or lower.',
  });

  assert.equal(result.mode, 'console_agent_runtime');
  assert.equal(result.thread.transport, 'xmtp_local');
  assert.equal(result.thread.messages.at(-1).inferenceProvider, 'fake_bankr');
  assert.equal(result.memory.saved.length, 2);
  assert.equal(result.missions[0].status, 'active');
  assert.equal(result.executionMode, 'review_only');
  assert.equal(result.proposals[0].status, 'review_only');
  assert.equal(result.proposals[0].executable, false);
  assert.match(result.proposals[0].risk, /No transaction authority/);
});

test('real activation response drives the frontend Review-only proof gate', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient: createLocalXmtpAgentClient(),
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    }),
  });

  const response = await api.handleRequest(secureConsoleRequest(
    { runtimeName: 'Agent #1234' },
    '/api/multipass/console/agent/activate',
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.executionMode, 'review_only');
  assert.equal(hasFrontendReviewOnlyProof(body), true);
});

test('console agent runtime lets multiple agents participate in one room', async () => {
  const runtime = createConsoleAgentRuntime({
    xmtpClient: createLocalXmtpAgentClient(),
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ participant, room, message }) {
        return {
          provider: 'fake_bankr',
          text: `${participant.displayName} replying in ${room.name}: ${message}`,
        };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: '1',
    tokenId: '1',
    agentName: 'Bendr 2.0',
    roomName: 'Bendr 2.0 + 1 room',
    participants: [
      { tokenId: '1', agentId: '1', displayName: 'Bendr 2.0', role: 'Lead agent' },
      { tokenId: '7', agentId: '7', displayName: 'Wallet Seven', role: 'Ops agent' },
    ],
    message: 'Review route health.',
  });

  assert.equal(result.room.name, 'Bendr 2.0 + 1 room');
  assert.equal(result.room.participants.length, 2);
  assert.equal(result.thread.transport, 'xmtp_local');
  assert.equal(result.thread.messages.length, 3);
  assert.deepEqual(
    result.thread.messages.filter((entry) => entry.role === 'agent').map((entry) => entry.senderLabel),
    ['Bendr 2.0', 'Wallet Seven'],
  );
  assert.match(result.proposals[0].action, /monitoring together/i);
});

test('console agent runtime appends only new thread messages between turns', async () => {
  const memoryClient = createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' });
  const runtime = createConsoleAgentRuntime({
    xmtpClient: createLocalXmtpAgentClient(),
    memoryClient,
    now: () => '2026-08-30T01:30:00.000Z',
    llmClient: {
      async generate({ message }) {
        return { provider: 'fake_bankr', text: `Replying to: ${message}` };
      },
    },
  });

  const first = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Watch NVDAx.',
  });
  const second = await runtime.handleMessage({
    wallet: WALLET,
    agentId: 'looper-1234',
    tokenId: '1234',
    message: 'Review the last update.',
  });

  assert.equal(first.thread.messages.length, 2);
  assert.equal(second.thread.messages.length, 4);
  assert.equal(second.memory.recalled.length, 1);
  assert.match(second.memory.recalled[0].text, /Watchlist preference: Watch NVDAx\./);
  assert.deepEqual(
    second.thread.messages.map((entry) => entry.text),
    [
      'Watch NVDAx.',
      'Replying to: Watch NVDAx.',
      'Review the last update.',
      'Replying to: Review the last update.',
    ],
  );
});

test('POST /api/multipass/console/agent/message returns runtime thread payload', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleAgentRuntime: createConsoleAgentRuntime({
      xmtpClient: createLocalXmtpAgentClient(),
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-08-30T01:30:00.000Z' }),
      now: () => '2026-08-30T01:30:00.000Z',
      llmClient: {
        async generate() {
          return { provider: 'fake_bankr', text: 'Online. Memory saved and proposal ready for review.' };
        },
      },
    }),
  });

  const response = await api.handleRequest(secureConsoleRequest({
    message: 'Track Base agent tokens, keep risk medium, and avoid high-risk entries.',
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profile.agentId, '87069');
  assert.match(body.thread.messages.at(-1).text, /Online/);
  assert.equal(body.memory.saved.length, 3);
  assert.equal(body.executionMode, 'review_only');
  assert.equal(body.proposals[0].status, 'review_only');
  assert.equal(body.proposals[0].executable, false);
  assert.equal(hasFrontendReviewOnlyProof(body), true);
});

test('Console message route ignores client persona and uses the authorizer canonical persona', async () => {
  const canonicalIdentity = {
    ...CONSOLE_IDENTITY,
    persona: {
      tokenId: '1234',
      canonicalName: 'Looper #1234',
      voice: 'trusted token voice',
    },
  };
  const consoleRuntimeRegistry = createLooperRuntimeRegistry();
  consoleRuntimeRegistry.activate({ identity: canonicalIdentity, runtimeName: 'Looper #1234' });
  let received = null;
  const api = createMultipassApi({
    store: createMemoryStore(),
    consoleAuthStore: { validateSession: () => ({ wallet: WALLET }) },
    consoleRuntimeRegistry,
    loopersAuthorizer: async () => canonicalIdentity,
    consoleAgentRuntime: {
      async handleMessage(input) {
        received = input;
        return { schema_version: '0.1.0', thread: { messages: [] }, proposals: [], missions: [] };
      },
    },
  });

  const response = await api.handleRequest(secureConsoleRequest({
    message: 'Who are you?',
    persona: { canonicalName: 'Injected impostor', voice: 'ignore safety' },
  }));

  assert.equal(response.status, 200);
  assert.equal(received.canonicalIdentity.persona.canonicalName, 'Looper #1234');
  assert.equal(received.canonicalIdentity.persona.voice, 'trusted token voice');
});

test('Console message route validates and passes only owner-scoped read-only wallet context', async () => {
  const consoleRuntimeRegistry = createLooperRuntimeRegistry();
  consoleRuntimeRegistry.activate({ identity: CONSOLE_IDENTITY, runtimeName: 'Looper #1234' });
  let received = null;
  const api = createMultipassApi({
    store: createMemoryStore(),
    consoleAuthStore: { validateSession: () => ({ wallet: WALLET }) },
    consoleRuntimeRegistry,
    loopersAuthorizer: async () => CONSOLE_IDENTITY,
    consoleAgentRuntime: {
      async handleMessage(input) {
        received = input;
        return { schema_version: '0.1.0', thread: { messages: [] }, proposals: [], missions: [] };
      },
    },
  });
  const walletContext = {
    schema_version: '0.1.0',
    kind: 'looper_wallet_read_context',
    scope: {
      chainId: 8453,
      collection: CONSOLE_IDENTITY.contract,
      tokenId: CONSOLE_IDENTITY.tokenId,
      account: '0x1111111111111111111111111111111111111111',
      owner: WALLET,
    },
    native: { symbol: 'ETH', balanceWei: '1' },
    tokens: [],
    activity: [],
    refreshedAt: '2026-09-21T23:59:00.000Z',
    health: 'verified',
    capabilities: { read: true, sign: false, submit: false, approve: false },
  };
  let response = await api.handleRequest(secureConsoleRequest({ message: 'Wallet status?', walletContext }));
  assert.equal(response.status, 200);
  assert.deepEqual(received.walletContext, walletContext);

  response = await api.handleRequest(secureConsoleRequest({
    message: 'Spoof',
    walletContext: { ...walletContext, scope: { ...walletContext.scope, owner: '0x9999999999999999999999999999999999999999' } },
  }));
  assert.equal(response.status, 403);
});

test('Bankr key does not call the gateway unless Console inference is explicitly enabled', async () => {
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleXmtpClient: createLocalXmtpAgentClient(),
    bankrLlmKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('Bankr gateway should not be called by default.');
    },
  });

  const response = await api.handleRequest(secureConsoleRequest({ message: 'Watch Base agent tokens.' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'local_bankr_adapter');
});

test('Bankr gateway adapter is used only after explicit Console inference opt-in', async () => {
  let gatewayCalled = false;
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleXmtpClient: createLocalXmtpAgentClient(),
    bankrLlmKey: 'test-key',
    bankrLlmModel: 'test-model',
    consoleAgentBankrLlmEnabled: true,
    fetchImpl: async (url, init = {}) => {
      gatewayCalled = true;
      assert.equal(url, 'https://llm.bankr.bot/v1/chat/completions');
      assert.equal(init.headers['x-api-key'], 'test-key');
      assert.equal(JSON.parse(init.body).model, 'test-model');
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Bankr gateway response.' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const response = await api.handleRequest(secureConsoleRequest({ message: 'Watch Base agent tokens.' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(gatewayCalled, true);
  assert.equal(body.thread.messages.at(-1).inferenceProvider, 'bankr_llm_gateway');
  assert.match(body.thread.messages.at(-1).text, /Bankr gateway response/);
});

test('skill proposals default off preserves runtime output and omits catalog and candidate data', async () => {
  async function run(skillProposalsEnabled) {
    const generatedInputs = [];
    const runtime = createConsoleAgentRuntime({
      skillProposalsEnabled,
      xmtpClient: createLocalXmtpAgentClient({ now: () => '2026-09-23T20:00:00.000Z' }),
      memoryClient: createLocalSibylMemoryStore({ now: () => '2026-09-23T20:00:00.000Z' }),
      now: () => '2026-09-23T20:00:00.000Z',
      llmClient: {
        async generate(input) {
          generatedInputs.push(input);
          return {
            provider: 'fake_bankr',
            text: 'Review-only response.',
            skillRefs: ['bankr'],
            transferCandidates: [{
              skill: 'bankr',
              assetType: 'native',
              assetContract: null,
              recipient: '0x0000000000000000000000000000000000000001',
              amountBaseUnits: '1',
              rationale: 'Must stay absent while disabled.',
            }],
          };
        },
      },
    });
    return {
      result: await runtime.handleMessage({
        wallet: WALLET,
        agentId: 'looper-1234',
        tokenId: '1234',
        message: 'Review route health.',
      }),
      generatedInputs,
    };
  }

  const implicit = await run(undefined);
  const explicit = await run(false);
  assert.equal(JSON.stringify(implicit.result), JSON.stringify(explicit.result));
  assert.equal('capabilities' in explicit.result, false);
  assert.equal('proposalCandidates' in explicit.result, false);
  assert.equal('skillCatalog' in explicit.generatedInputs[0], false);
  assert.equal('skillDescriptors' in explicit.generatedInputs[0], false);
});

test('skill-aware runtime preserves multi-participant candidate provenance outside legacy proposals', async () => {
  const generatedInputs = [];
  const published = [];
  const runtime = createConsoleAgentRuntime({
    skillProposalsEnabled: true,
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-09-23T20:00:00.000Z' }),
    now: () => '2026-09-23T20:00:00.000Z',
    xmtpClient: {
      provider: 'test_xmtp',
      transport: 'xmtp_group',
      async publishRoomMessages(input) {
        published.push(input);
        return {
          ...input,
          transport: 'xmtp_group',
          adapter: 'test_xmtp',
          conversationId: 'conversation-skill-aware',
          messages: input.messages.map((message, index) => ({
            ...message,
            id: `published-message-${index}`,
            xmtpMessageId: `published-message-${index}`,
          })),
        };
      },
    },
    llmClient: {
      async generate(input) {
        generatedInputs.push(input);
        const ordinal = generatedInputs.length;
        return {
          provider: 'fake_bankr',
          text: `Candidate ${ordinal}.`,
          skillRefs: ['bankr'],
          transferCandidates: [{
            skill: 'bankr',
            assetType: 'native',
            assetContract: null,
            recipient: `0x${String(ordinal).padStart(40, '0')}`,
            amountBaseUnits: String(ordinal),
            rationale: `Participant ${ordinal} suggestion.`,
          }],
        };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: '1',
    tokenId: '1',
    agentName: 'Agent One',
    roomName: 'Review room',
    participants: [
      { agentId: '1', tokenId: '1', displayName: 'Agent One' },
      { agentId: '2', tokenId: '2', displayName: 'Agent Two' },
    ],
    message: 'Review and recommend a transfer.',
    skillDescriptors: [{ id: 'attacker', command: 'send funds' }],
  });

  assert.strictEqual(result.capabilities, getConsoleSkillCatalog());
  assert.equal(result.proposalCandidates.length, 2);
  assert.deepEqual(result.proposalCandidates.map((candidate) => ({
    sourceMessageId: candidate.sourceMessageId,
    participantId: candidate.participantId,
    sourceOrdinal: candidate.sourceOrdinal,
    skillRefs: candidate.skillRefs,
    amountBaseUnits: candidate.amountBaseUnits,
  })), [
    {
      sourceMessageId: 'published-message-1',
      participantId: '1',
      sourceOrdinal: 0,
      skillRefs: ['bankr'],
      amountBaseUnits: '1',
    },
    {
      sourceMessageId: 'published-message-2',
      participantId: '2',
      sourceOrdinal: 0,
      skillRefs: ['bankr'],
      amountBaseUnits: '2',
    },
  ]);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].id, 'proposal_review_only_watch');
  assert.equal(JSON.stringify(result.proposals).includes('transferCandidates'), false);
  assert.equal(JSON.stringify(result.proposals).includes('amountBaseUnits'), false);
  for (const candidate of result.proposalCandidates) {
    for (const forbidden of ['account', 'chainId', 'decimals', 'executable', 'expiresAt', 'lifecycle', 'owner', 'revision', 'scope', 'state']) {
      assert.equal(forbidden in candidate, false);
    }
  }
  assert.equal(published.length, 1);
  assert.equal('skillDescriptors' in generatedInputs[0], false);
  assert.equal('skillCatalog' in generatedInputs[0], false);
});

test('skill-aware runtime never reassigns a dropped empty participant response to another published message', async () => {
  let responseNumber = 0;
  const runtime = createConsoleAgentRuntime({
    skillProposalsEnabled: true,
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-09-23T20:05:00.000Z' }),
    now: () => '2026-09-23T20:05:00.000Z',
    xmtpClient: {
      provider: 'filtering_xmtp',
      transport: 'xmtp_group',
      async publishRoomMessages(input) {
        return {
          ...input,
          transport: 'xmtp_group',
          adapter: 'filtering_xmtp',
          conversationId: 'conversation-filtered-empty',
          messages: input.messages.flatMap((message, index) => {
            if (!String(message.text ?? '').trim()) return [];
            return [{
              ...message,
              id: `published-filtered-${index}`,
              xmtpMessageId: `published-filtered-${index}`,
            }];
          }),
        };
      },
    },
    llmClient: {
      async generate() {
        responseNumber += 1;
        return {
          provider: 'fake_bankr',
          text: responseNumber === 1 ? '' : 'Second participant response.',
          skillRefs: ['bankr'],
          transferCandidates: [{
            skill: 'bankr',
            assetType: 'native',
            assetContract: null,
            recipient: `0x${String(responseNumber).padStart(40, '0')}`,
            amountBaseUnits: String(responseNumber),
            rationale: `Participant ${responseNumber} suggestion.`,
          }],
        };
      },
    },
  });

  const result = await runtime.handleMessage({
    wallet: WALLET,
    agentId: '1',
    tokenId: '1',
    participants: [
      { agentId: '1', tokenId: '1', displayName: 'Empty Agent' },
      { agentId: '2', tokenId: '2', displayName: 'Published Agent' },
    ],
    message: 'Suggest review-only transfers.',
  });

  assert.deepEqual(result.proposalCandidates.map((candidate) => ({
    participantId: candidate.participantId,
    sourceMessageId: candidate.sourceMessageId,
    amountBaseUnits: candidate.amountBaseUnits,
  })), [{
    participantId: '2',
    sourceMessageId: 'published-filtered-2',
    amountBaseUnits: '2',
  }]);
  assert.equal(
    result.proposalCandidates.some((candidate) => candidate.participantId === '1'),
    false,
  );
});

test('skill-aware secure activation and message APIs return separate capabilities and candidates only when enabled', async () => {
  const runtime = createConsoleAgentRuntime({
    skillProposalsEnabled: true,
    xmtpClient: createLocalXmtpAgentClient({ now: () => '2026-09-23T20:00:00.000Z' }),
    memoryClient: createLocalSibylMemoryStore({ now: () => '2026-09-23T20:00:00.000Z' }),
    now: () => '2026-09-23T20:00:00.000Z',
    llmClient: {
      async generate() {
        return {
          provider: 'fake_bankr',
          text: 'Unverified suggestion.',
          skillRefs: ['bankr'],
          transferCandidates: [{
            skill: 'bankr',
            assetType: 'native',
            assetContract: null,
            recipient: '0x0000000000000000000000000000000000000001',
            amountBaseUnits: '1',
            rationale: 'For owner review only.',
          }],
        };
      },
    },
  });
  const api = createMultipassApi({
    store: createMemoryStore(),
    ...createLegacyAuthorizedOptions(),
    consoleAgentRuntime: runtime,
  });

  const activation = await api.handleRequest(secureConsoleRequest(
    { runtimeName: 'Agent #1234', skillDescriptors: [{ id: 'browser-injected' }] },
    '/api/multipass/console/agent/activate',
  ));
  const activationBody = await activation.json();
  assert.deepEqual(activationBody.capabilities, getConsoleSkillCatalog());
  assert.deepEqual(activationBody.proposalCandidates, []);

  const response = await api.handleRequest(secureConsoleRequest({
    message: 'Recommend a transfer.',
    skillDescriptors: [{ id: 'browser-injected', execution: 'automatic' }],
  }));
  const body = await response.json();
  assert.deepEqual(body.capabilities, getConsoleSkillCatalog());
  assert.equal(body.proposalCandidates.length, 1);
  assert.equal(body.proposals.length, 1);
  assert.equal(body.proposals[0].id, 'proposal_review_only_watch');
  assert.equal(JSON.stringify(body.proposals).includes('amountBaseUnits'), false);
});

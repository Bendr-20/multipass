export function createLooperRuntimeRegistry({ now = () => new Date().toISOString() } = {}) {
  const records = new Map();
  const keysByConversationId = new Map();
  return {
    activate({ identity, runtimeName } = {}) {
      const normalized = normalizeIdentity(identity);
      if (!normalized.controllerVerified) throw new Error('ERC-8004 controller authorization is required.');
      const key = createLooperRuntimeKey(normalized);
      const prior = records.get(key);
      const priorForOwner = prior?.identity?.owner === normalized.owner ? prior : null;
      if (prior?.conversationId && !priorForOwner) keysByConversationId.delete(prior.conversationId);
      const name = normalizeRuntimeName(runtimeName ?? priorForOwner?.runtimeName ?? `Looper #${normalized.tokenId}`);
      const record = {
        key,
        status: 'active',
        runtimeName: name,
        identity: normalized,
        activatedAt: priorForOwner?.activatedAt ?? String(now()),
        updatedAt: String(now()),
        ...(priorForOwner?.conversationId ? {
          conversationId: priorForOwner.conversationId,
          threadId: priorForOwner.threadId,
          topicId: priorForOwner.topicId,
          transport: priorForOwner.transport,
          participants: priorForOwner.participants,
        } : {}),
        permissions: {
          execution: 'review_only',
          custody: 'disabled',
          externalActions: 'human_approval_required',
        },
      };
      records.set(key, record);
      return structuredClone(record);
    },
    get(identity) {
      const normalized = normalizeIdentity(identity);
      const record = records.get(createLooperRuntimeKey(normalized));
      if (record?.identity?.owner !== normalized.owner) return null;
      return record ? structuredClone(record) : null;
    },
    bindConversation({ identity, conversationId, threadId, topicId, transport, participants } = {}) {
      const normalized = normalizeIdentity(identity);
      const key = createLooperRuntimeKey(normalized);
      const record = records.get(key);
      if (!record || record.identity.owner !== normalized.owner) {
        throw new Error('An active wallet-bound Looper runtime is required before binding XMTP.');
      }
      const normalizedConversationId = requireText(conversationId, 'XMTP conversation ID');
      const canonicalRoom = buildCanonicalConsoleRoom({ activation: record });
      if (threadId && threadId !== canonicalRoom.threadId) throw new Error('XMTP thread ID does not match the canonical runtime.');
      if (topicId && topicId !== canonicalRoom.topicId) throw new Error('XMTP topic does not match the canonical runtime.');
      if (record.conversationId && record.conversationId !== normalizedConversationId) {
        keysByConversationId.delete(record.conversationId);
      }
      const updated = {
        ...record,
        conversationId: normalizedConversationId,
        threadId: canonicalRoom.threadId,
        topicId: canonicalRoom.topicId,
        transport: String(transport ?? 'xmtp_group'),
        participants: structuredClone(participants?.length ? participants : canonicalRoom.participants),
        updatedAt: String(now()),
      };
      records.set(key, updated);
      keysByConversationId.set(normalizedConversationId, key);
      return structuredClone(updated);
    },
    getByConversationId(conversationId) {
      const normalizedConversationId = String(conversationId ?? '').trim();
      const key = keysByConversationId.get(normalizedConversationId);
      const record = key ? records.get(key) : null;
      if (record?.conversationId !== normalizedConversationId) return null;
      return record ? structuredClone(record) : null;
    },
  };
}

export function buildCanonicalConsoleRoom({ activation } = {}) {
  if (!activation || activation.status !== 'active') throw new TypeError('An active Looper runtime is required.');
  const identity = normalizeIdentity(activation.identity);
  const key = createLooperRuntimeKey(identity);
  const topicId = `${key}:operator:${identity.owner}`;
  const runtimeName = normalizeRuntimeName(activation.runtimeName);
  return {
    id: `room:${topicId}`,
    threadId: `xmtp:${topicId}`,
    topicId,
    name: `${runtimeName} ops`,
    primaryParticipantId: `erc8004:${identity.erc8004AgentId}`,
    participants: [
      {
        kind: 'agent',
        participantId: `erc8004:${identity.erc8004AgentId}`,
        agentId: identity.erc8004AgentId,
        tokenId: identity.tokenId,
        displayName: runtimeName,
        role: 'Looper runtime',
      },
      {
        kind: 'operator',
        participantId: `wallet:${identity.owner}`,
        wallet: identity.owner,
        displayName: 'Authenticated holder',
        role: 'Operator',
      },
    ],
  };
}

export function createLooperRuntimeKey(identity = {}) {
  const normalized = normalizeIdentity(identity);
  return `eip155:${normalized.chainId}:${normalized.contract.toLowerCase()}:${normalized.tokenId}:erc8004:${normalized.erc8004AgentId}`;
}

function normalizeIdentity(identity = {}) {
  const chainId = Number(identity.chainId);
  const contract = String(identity.contract ?? '').trim();
  const tokenId = String(identity.tokenId ?? '').trim();
  const erc8004AgentId = String(identity.erc8004AgentId ?? '').trim();
  const owner = String(identity.owner ?? '').trim().toLowerCase();
  if (chainId !== 8453) throw new TypeError('Looper runtime identity must use Base chain 8453.');
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) throw new TypeError('Looper runtime contract is invalid.');
  if (!/^\d+$/.test(tokenId) || BigInt(tokenId) <= 0n) throw new TypeError('Looper token ID is invalid.');
  if (!/^\d+$/.test(erc8004AgentId) || BigInt(erc8004AgentId) <= 0n) throw new TypeError('ERC-8004 identity is invalid.');
  if (!/^0x[a-f0-9]{40}$/.test(owner)) throw new TypeError('Looper owner wallet is invalid.');
  return {
    chainId,
    contract,
    tokenId,
    erc8004AgentId,
    owner,
    controllerVerified: identity.controllerVerified === true,
  };
}

function normalizeRuntimeName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new TypeError('Runtime name is required.');
  if (name.length > 80) throw new TypeError('Runtime name must be 80 characters or fewer.');
  return name;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

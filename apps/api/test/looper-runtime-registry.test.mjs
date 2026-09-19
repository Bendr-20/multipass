import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalConsoleRoom,
  createLooperRuntimeRegistry,
  createLooperRuntimeKey,
} from '../src/looper-runtime-registry.js';

const identity = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '617',
  erc8004AgentId: '87069',
  owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
  controllerVerified: true,
};

test('runtime activation reuses canonical ERC-8004 identity and persists a holder-selected name', () => {
  const registry = createLooperRuntimeRegistry({ now: () => '2026-09-17T03:40:00.000Z' });
  const activated = registry.activate({ identity, runtimeName: 'Bendr Looper' });

  assert.equal(activated.identity.erc8004AgentId, '87069');
  assert.equal(activated.runtimeName, 'Bendr Looper');
  assert.equal(activated.status, 'active');
  assert.equal(activated.permissions.execution, 'review_only');
  assert.equal(activated.execute, undefined);
  assert.equal(registry.get(identity).runtimeName, 'Bendr Looper');
  assert.equal(createLooperRuntimeKey(identity), 'eip155:8453:0x1649cd37f4748807b4882fc48765ba0b2affa94a:617:erc8004:87069');
});

test('runtime activation requires controller authorization and rejects unsafe names', () => {
  const registry = createLooperRuntimeRegistry();
  assert.throws(() => registry.activate({ identity: { ...identity, controllerVerified: false } }), /controller/i);
  assert.throws(() => registry.activate({ identity, runtimeName: 'x'.repeat(81) }), /80/);
});

test('canonical Console room derives its topic and participants only from the active runtime identity', () => {
  const registry = createLooperRuntimeRegistry();
  const activation = registry.activate({ identity, runtimeName: 'Bendr Looper' });
  const room = buildCanonicalConsoleRoom({ activation });

  assert.equal(room.threadId, `xmtp:${activation.key}:operator:${identity.owner.toLowerCase()}`);
  assert.equal(room.topicId, `${activation.key}:operator:${identity.owner.toLowerCase()}`);
  assert.equal(room.participants.length, 2);
  assert.deepEqual(room.participants.map((participant) => participant.kind), ['agent', 'operator']);
  assert.equal(room.participants[0].agentId, '87069');
  assert.equal(room.participants[1].wallet, identity.owner.toLowerCase());
});

test('runtime registry binds a real XMTP conversation to the canonical runtime and resolves inbound messages', () => {
  const registry = createLooperRuntimeRegistry();
  const activation = registry.activate({ identity, runtimeName: 'Bendr Looper' });
  const room = buildCanonicalConsoleRoom({ activation });
  registry.bindConversation({
    identity,
    conversationId: 'xmtp-conversation-617',
    threadId: room.threadId,
    topicId: room.topicId,
    transport: 'xmtp_group',
    participants: room.participants,
  });

  assert.equal(registry.get(identity).conversationId, 'xmtp-conversation-617');
  assert.equal(registry.getByConversationId('xmtp-conversation-617').identity.tokenId, '617');
  assert.equal(registry.getByConversationId('unknown'), null);
});

test('an activation record is bound to its authenticated operator even when the token keeps the same canonical key', () => {
  const registry = createLooperRuntimeRegistry();
  registry.activate({ identity, runtimeName: 'Bendr Looper' });

  assert.equal(registry.get({ ...identity, owner: '0x1234567890abcdef1234567890abcdef12345678' }), null);
});

test('a freshly authorized owner does not inherit the prior holder XMTP conversation', () => {
  const registry = createLooperRuntimeRegistry();
  const first = registry.activate({ identity, runtimeName: 'First holder Looper' });
  registry.bindConversation({
    identity,
    conversationId: 'first-holder-conversation',
    threadId: buildCanonicalConsoleRoom({ activation: first }).threadId,
    topicId: buildCanonicalConsoleRoom({ activation: first }).topicId,
    transport: 'xmtp_group',
  });
  const transferredIdentity = {
    ...identity,
    owner: '0x1234567890abcdef1234567890abcdef12345678',
  };

  const transferred = registry.activate({ identity: transferredIdentity, runtimeName: 'New holder Looper' });

  assert.equal(transferred.conversationId, undefined);
  assert.equal(registry.getByConversationId('first-holder-conversation'), null);
});

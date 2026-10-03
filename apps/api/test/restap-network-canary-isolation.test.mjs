import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';

import { buildRestap3802Discovery } from '../src/restap-3802-contracts.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';
import * as networkConstants from '../src/restap-network/constants.js';

const NETWORK_SOURCE = new URL('../src/restap-network/', import.meta.url);
const ORDINARY_NOT_FOUND = JSON.stringify({
  schema_version: '0.1.0',
  error: { code: 'not_found', message: 'Route not found.' },
});
const FORBIDDEN_CANARY_IMPORTS = new Set([
  'restap-public-sessions.js',
  'restap-news-store.js',
  'restap-3802-policy.js',
]);

async function networkModuleUrls(directory = NETWORK_SOURCE) {
  const modules = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) modules.push(...await networkModuleUrls(url));
    else if (entry.isFile() && extname(entry.name) === '.js') modules.push(url);
  }
  return modules;
}

function closedApi() {
  return createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.xyz/multipass-api',
    restapDiscoveryEnabled: true,
    restapTalkEnabled: true,
    restapNewsWriteEnabled: true,
    restapNewsReadEnabled: true,
    restap3802Policy: { authorize() { throw new Error('canary policy must not be reached'); } },
    restapTalkRuntime: { talk() { throw new Error('canary runtime must not be reached'); } },
    restapNewsAuthenticator: { authenticate() { throw new Error('canary auth must not be reached'); } },
    restapNewsStore: { accept() { throw new Error('canary store must not be reached'); }, list() { throw new Error('canary store must not be reached'); } },
    consoleAuthStore: { validateSession() { throw new Error('console auth must not be reached'); } },
    logger: { info() {}, warn() {} },
  });
}

function request(route, method) {
  const body = method === 'POST' ? JSON.stringify({ message: 'guess' }) : undefined;
  return new Request('https://helixa.xyz' + route, {
    method,
    ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }),
  });
}

test('all RESTAP network table prefixes stay in the restap_network namespace', () => {
  assert.equal(networkConstants.RESTAP_NETWORK_NAMESPACE, 'restap_network');
  const prefixes = Object.entries(networkConstants)
    .filter(([name]) => name.endsWith('_TABLE_PREFIX'));
  assert.ok(prefixes.length > 0, 'at least one network table prefix must be exported');
  for (const [name, prefix] of prefixes) {
    assert.equal(typeof prefix, 'string', name);
    assert.ok(prefix.startsWith('restap_network_'), name + ' must begin restap_network_');
  }
  assert.deepEqual(networkConstants.RESTAP_NETWORK_INTERNAL_PATHS, {
    discovery: 'restap-network:discovery',
    opening: 'restap-network:opening',
    reply: 'restap-network:reply',
    finalize: 'restap-network:finalize',
  });
  assert.equal(Object.isFrozen(networkConstants.RESTAP_NETWORK_INTERNAL_PATHS), true);
});

test('RESTAP network modules never import canary policy, public sessions, or canary news storage', async () => {
  for (const moduleUrl of await networkModuleUrls()) {
    const source = await readFile(moduleUrl, 'utf8');
    for (const forbiddenModule of FORBIDDEN_CANARY_IMPORTS) {
      assert.equal(
        source.includes(forbiddenModule),
        false,
        moduleUrl.pathname + ' references forbidden canary module ' + forbiddenModule,
      );
    }
  }
});

test('guessed network and non-canary Looper RESTAP routes stay ordinary 404s', async () => {
  const api = closedApi();
  const guesses = [
    ['GET', '/api/restap/network/discovery'],
    ['POST', '/api/restap/network/opening'],
    ['POST', '/api/restap/network/reply'],
    ['POST', '/api/restap/network/finalize'],
    ['GET', '/api/restap/loopers/3801/.well-known/restap.json'],
    ['POST', '/api/restap/loopers/3801/talk'],
    ['GET', '/api/restap/loopers/3801/news'],
    ['POST', '/api/restap/loopers/3801/news'],
  ];

  for (const [method, route] of guesses) {
    const response = await api.handleRequest(request(route, method));
    assert.equal(response.status, 404, method + ' ' + route);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(await response.text(), ORDINARY_NOT_FOUND, method + ' ' + route);
  }
});

test('#3802 discovery talk and news remain byte-stable while cross-namespace substitutions fail in the same process', async () => {
  const discovery = buildRestap3802Discovery({
    publicBaseUrl: 'https://helixa.xyz/multipass-api',
    codexProfile: { schemaVersion: '1.0.0', artifactHash: 'a'.repeat(64), codexVersion: 'v1', identity: { tokenId: 3802, canonicalName: 'Looper #3802', image: { url: 'https://helixa.xyz/3802.png' } } },
    ownerProfile: { displayName: 'Q Looper', publicConversationEnabled: true, biography: 'bio', mission: 'mission', voicePresentation: 'direct' },
    contact: 'https://helixa.xyz',
    availability: { discovery: true, talk: true, newsWrite: true, newsRead: true },
  });
  const api = createMultipassApi({
    store: createMemoryStore(), baseUrl: 'https://helixa.xyz/multipass-api',
    restapDiscoveryEnabled: true, restapTalkEnabled: true, restapNewsWriteEnabled: true, restapNewsReadEnabled: true,
    restap3802Policy: { async authorize() { return { discovery, publicProjection: { canonicalIdentity: { canonicalName: 'Looper #3802', imageUrl: 'https://helixa.xyz/3802.png' }, ownerPublicProfile: { displayName: 'Q Looper', publicConversationEnabled: true, biography: 'bio', mission: 'mission', voicePresentation: 'direct' } } }; } },
    restapTalkRuntime: { async talk(input) { return { reply: 'public reply', session_id: input.sessionId ?? 'S'.repeat(43) }; } },
    restapNewsAuthenticator: { async authenticate(input) { return { senderId: 'agent.one', verifiedSigner: '0x1111111111111111111111111111111111111111', canonicalBody: JSON.stringify(input.body), bodyHash: 'a'.repeat(64), receivedAt: '2026-10-03T21:00:00.000Z', correlationId: null, nonceHash: 'b'.repeat(64), replayExpiresAt: '2026-10-03T21:05:00.000Z' }; } },
    restapNewsStore: { accept(input) { return { itemId: 'one', receivedAt: input.receivedAt }; }, list() { return { items: [{ canonicalBody: { type: 'agent.update', message: 'public news' } }], nextCursor: null }; } },
    consoleAuthStore: { validateSession() { return { wallet: '0x1111111111111111111111111111111111111111' }; } },
    loopersAuthorizer: async ({ wallet }) => ({ chainId: 8453, contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', tokenId: '3802', owner: wallet, erc8004AgentId: '1', controllerVerified: true }),
    logger: { info() {}, warn() {} },
  });
  const discoveryPath = '/api/restap/loopers/3802/.well-known/restap.json';
  const firstDiscovery = await api.handleRequest(request(discoveryPath, 'GET'));
  assert.equal(firstDiscovery.status, 200);
  const goldenDiscovery = await firstDiscovery.text();
  assert.equal(goldenDiscovery, JSON.stringify(discovery));
  const talk = await api.handleRequest(new Request('https://helixa.xyz/api/restap/loopers/3802/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) }));
  assert.equal(talk.status, 200);
  const goldenTalk = await talk.text();
  assert.equal(goldenTalk, JSON.stringify({ reply: 'public reply', session_id: 'S'.repeat(43) }));
  assert.equal((await api.handleRequest(new Request('https://helixa.xyz/api/restap/loopers/3802/news', { method: 'POST', headers: { 'content-type': 'application/json', 'x-restap-nonce': 'canary-nonce' }, body: JSON.stringify({ type: 'agent.update', message: 'public' }) }))).status, 202);
  assert.equal((await api.handleRequest(new Request('https://helixa.xyz/api/restap/loopers/3802/news', { headers: { cookie: 'multipass_console=owner-session' } }))).status, 200);

  for (const [method, route] of [['GET', '/api/restap/network/discovery'], ['POST', '/api/restap/network/opening'], ['POST', '/api/restap/network/reply'], ['POST', '/api/restap/network/finalize']]) {
    const response = await api.handleRequest(new Request('https://helixa.xyz' + route, { method, headers: { 'content-type': 'application/json', cookie: 'multipass_console=owner-session', 'x-restap-nonce': 'canary-nonce', 'x-restap-grant': 'network-grant' }, ...(method === 'POST' ? { body: JSON.stringify({ session_id: 'S'.repeat(43), operation_id: 'network-operation' }) } : {}) }));
    assert.equal(response.status, 404, method + ' ' + route);
    assert.equal(await response.text(), ORDINARY_NOT_FOUND);
  }
  const substitutedTalk = await api.handleRequest(new Request('https://helixa.xyz/api/restap/loopers/3802/talk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-restap-grant': 'network-grant' }, body: JSON.stringify({ message: 'hello', operation_id: 'network-operation' }) }));
  assert.equal(substitutedTalk.status, 400);
  const finalDiscovery = await api.handleRequest(request(discoveryPath, 'GET'));
  assert.equal(await finalDiscovery.text(), goldenDiscovery);
  const finalTalk = await api.handleRequest(new Request('https://helixa.xyz/api/restap/loopers/3802/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) }));
  assert.equal(await finalTalk.text(), goldenTalk);
});

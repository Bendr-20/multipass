import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  RESTAP_BASE_PATH,
  RESTAP_CANARY_TOKEN_ID,
  RESTAP_CONFORMANCE,
  RESTAP_LIMITS,
  RESTAP_UPSTREAM_COMMIT,
  RESTAP_VERSION,
  buildRestap3802Discovery,
  canonicalizeRestapJson,
  canonicalizeRestapJsonText,
  normalizeRestapNewsPost,
  normalizeRestapNewsRead,
  normalizeRestapNewsWriteAcknowledgment,
  normalizeRestapTalkRequest,
  normalizeRestapTalkResponse,
} from '../src/restap-3802-contracts.js';

const FIXTURE_URL = new URL('../fixtures/restap/restap-0.1.4-beta-minimal.json', import.meta.url);
const HASH = '5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24';

const codexProfile = Object.freeze({
  schemaVersion: '1.0.0',
  artifactHash: HASH,
  codexVersion: 'traits-v1',
  identity: Object.freeze({
    tokenId: 3802,
    canonicalName: 'Looper #3802',
    image: Object.freeze({ url: 'https://helixa.xyz/loopers/images/3802.png' }),
  }),
});

const ownerProfile = Object.freeze({
  displayName: 'Quigley Looper',
  publicConversationEnabled: true,
  biography: 'A bounded public biography.',
  mission: 'Explore the Looper Codex.',
  voicePresentation: 'Clear and direct.',
});

function assertRecursivelyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child);
}

function buildDiscovery(overrides = {}) {
  return buildRestap3802Discovery({
    publicBaseUrl: 'https://helixa.xyz/multipass-api',
    codexProfile,
    ownerProfile,
    contact: 'https://helixa.xyz',
    erc8004: {
      chainId: 8453,
      registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      agentId: '87069',
    },
    availability: { discovery: true, talk: true, newsWrite: true, newsRead: false },
    ...overrides,
  });
}

test('pins RESTAP 0.1.4-beta, Looper #3802, its exact route, and public limits', () => {
  assert.equal(RESTAP_VERSION, '0.1.4-beta');
  assert.equal(RESTAP_UPSTREAM_COMMIT, '5d7222692a0d1c53fbb03091b94de6c732cac2bc');
  assert.equal(RESTAP_CANARY_TOKEN_ID, '3802');
  assert.equal(RESTAP_BASE_PATH, '/api/restap/loopers/3802');
  assert.deepEqual(RESTAP_LIMITS, {
    talkBodyBytes: 8 * 1024,
    talkMessageBytes: 2_000,
    talkReplyBytes: 4_096,
    newsBodyBytes: 16 * 1024,
    newsPageDefault: 20,
    newsPageMax: 50,
    signatureSkewSeconds: 300,
  });
  assertRecursivelyFrozen(RESTAP_LIMITS);
});

test('pins checksum-verified upstream provenance and exact minimal fixture bytes', async () => {
  const bytes = await readFile(FIXTURE_URL);
  assert.equal(bytes.byteLength, 1_608);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '5df3a690efd6440ab7716cfe16356a7494a5d3fb1d0db50569f838f1a837953f');
  const fixture = JSON.parse(bytes);
  assert.deepEqual(fixture._provenance, RESTAP_CONFORMANCE.provenance);
  assert.deepEqual(fixture.discovery, RESTAP_CONFORMANCE.shapes.discovery);
  assert.deepEqual(fixture.talk, RESTAP_CONFORMANCE.shapes.talk);
  assert.deepEqual(fixture.news, RESTAP_CONFORMANCE.shapes.news);
  assert.equal(fixture._provenance.licenseDeclared, 'MIT');
  assert.equal(fixture._provenance.licenseEvidence, 'package.json#license');
  assert.equal(fixture._provenance.licenseFileAtCommit, false);
  assert.equal(fixture._provenance.transcription, 'independently-authored minimal conformance fixture; no upstream runtime code');
});

test('builds exact #3802 discovery from public base with Codex-only canonical identity', () => {
  const discovery = buildDiscovery();
  assert.equal(discovery.restap_version, RESTAP_VERSION);
  assert.equal(discovery.agent.name, 'Looper #3802');
  assert.equal(discovery.agent.contact, 'https://helixa.xyz');
  assert.equal(discovery.agent.x_helixa.canonical_image, codexProfile.identity.image.url);
  assert.equal(discovery.agent.x_helixa.display_name, ownerProfile.displayName);
  assert.equal(discovery.agent.x_helixa.biography, ownerProfile.biography);
  assert.equal(discovery.agent.x_helixa.base_url, 'https://helixa.xyz/multipass-api/api/restap/loopers/3802');
  assert.equal(discovery.agent.x_helixa.codex.artifact_hash, HASH);
  assert.deepEqual(discovery.agent.x_helixa.erc8004, {
    chain_id: 8453,
    registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    agent_id: '87069',
  });
  assert.equal(discovery.capabilities.length, 3);
  assert.deepEqual(discovery.capabilities.map(({ id, method, endpoint }) => ({ id, method, endpoint })), [
    { id: 'talk', method: 'POST', endpoint: '/talk' },
    { id: 'news-write', method: 'POST', endpoint: '/news' },
    { id: 'news-read', method: 'GET', endpoint: '/news' },
  ]);
  for (const capability of discovery.capabilities) {
    assert.deepEqual(Object.keys(capability).sort(), ['endpoint', 'id', 'method', 'title', 'x_helixa']);
    assert.equal(Object.hasOwn(capability, 'streaming'), false);
    assert.equal(Object.hasOwn(capability, 'pricing'), false);
  }
  assert.deepEqual(discovery.capabilities.map((item) => item.x_helixa.available), [true, true, false]);
  assertRecursivelyFrozen(discovery);
});

test('discovery rejects alternate tokens, policy identity override, unsafe bases, and unsupported extension fields', () => {
  assert.throws(() => buildDiscovery({ codexProfile: { ...codexProfile, identity: { ...codexProfile.identity, tokenId: 3801 } } }), /3802/i);
  assert.throws(() => buildDiscovery({ ownerProfile: { ...ownerProfile, canonicalName: 'Owner override' } }), /unknown|canonical/i);
  assert.throws(() => buildDiscovery({ ownerProfile: { ...ownerProfile, image: 'https://evil.invalid/a.png' } }), /unknown|image/i);
  assert.throws(() => buildDiscovery({ publicBaseUrl: 'http://helixa.xyz/multipass-api' }), /https/i);
  assert.throws(() => buildDiscovery({ publicBaseUrl: 'https://helixa.xyz/multipass-api?bad=1' }), /base/i);
  assert.throws(() => buildDiscovery({ availability: { discovery: true, talk: true, newsWrite: true, newsRead: false, tools: true } }), /availability|unknown/i);
});

test('normalizes exact bounded talk requests and responses', () => {
  const session = 'A'.repeat(43);
  assert.deepEqual(normalizeRestapTalkRequest({ message: 'Hello, Looper.', session_id: session }), { message: 'Hello, Looper.', session_id: session });
  assert.deepEqual(normalizeRestapTalkResponse({ reply: 'Hello.', session_id: session }), { reply: 'Hello.', session_id: session });
  assertRecursivelyFrozen(normalizeRestapTalkResponse({ reply: 'Hello.', session_id: session }));
  assert.throws(() => normalizeRestapTalkRequest({ message: 'x', extra: true }), /unknown/i);
  assert.throws(() => normalizeRestapTalkRequest({ message: 'x'.repeat(2_001) }), /2000|2,000|byte/i);
  assert.throws(() => normalizeRestapTalkRequest({ message: 'line\nfeed' }), /control/i);
  assert.throws(() => normalizeRestapTalkRequest({ message: 'x', session_id: 'not-minted' }), /session/i);
  assert.throws(() => normalizeRestapTalkResponse({ reply: 'x'.repeat(4_097), session_id: session }), /4096|4,096|byte/i);
  assert.throws(() => normalizeRestapTalkResponse({ reply: 'ok', suggested_actions: [] }), /unknown/i);
});

test('normalizes passive news without executable, prototype, or sensitive fields', () => {
  const value = normalizeRestapNewsPost({
    type: 'agent.update',
    from: 'sender.one',
    in_reply_to: 'item-1',
    message: 'Passive update.',
    data: { result: { status: 'ready' }, tags: ['codex'] },
    session_id: 'B'.repeat(43),
  });
  assert.equal(value.type, 'agent.update');
  assertRecursivelyFrozen(value);
  for (const bad of [
    { type: 'x', callback: 'https://evil.invalid' },
    { type: 'x', data: { url: 'https://evil.invalid' } },
    { type: 'x', data: { command: 'send funds' } },
    JSON.parse('{"type":"x","data":{"__proto__":"bad"}}'),
    { type: 'x', data: { secret: 'nope' } },
  ]) assert.throws(() => normalizeRestapNewsPost(bad), /unknown|forbidden|sensitive|executable/i);
  assert.throws(() => normalizeRestapNewsPost({ type: 'x', message: 'z'.repeat(17_000) }), /16384|16.*kib|byte/i);
});

test('emits upstream cores plus only documented namespaced Helixa response extensions', () => {
  assert.deepEqual(normalizeRestapNewsRead({ items: [{ type: 'update', message: 'hello' }], timestamp: 1_790_000_000, nextCursor: 'cursor-2' }), {
    items: [{ type: 'update', message: 'hello' }],
    timestamp: 1_790_000_000,
    x_helixa_next_cursor: 'cursor-2',
  });
  assert.deepEqual(normalizeRestapNewsWriteAcknowledgment({ itemId: 'item-1', receivedAt: '2026-10-01T19:00:00.000Z' }), {
    x_helixa_accepted: true,
    x_helixa_item_id: 'item-1',
    x_helixa_received_at: '2026-10-01T19:00:00.000Z',
  });
  assert.throws(() => normalizeRestapNewsRead({ items: [], timestamp: 1, next_cursor: 'unnamespaced' }), /unknown/i);
});

test('canonical JSON sorts object keys, preserves array order, and rejects unsafe JSON domains', () => {
  assert.equal(canonicalizeRestapJson({ z: 1, a: { d: 4, c: 3 }, list: [3, 1, 2] }), '{"a":{"c":3,"d":4},"list":[3,1,2],"z":1}');
  assert.equal(canonicalizeRestapJsonText('{"z":1,"list":[3,1,2],"a":{"d":4,"c":3}}'), '{"a":{"c":3,"d":4},"list":[3,1,2],"z":1}');
  assert.throws(() => canonicalizeRestapJsonText('{"a":1,"a":2}'), /duplicate/i);
  assert.throws(() => canonicalizeRestapJson({ value: undefined }), /json/i);
  assert.throws(() => canonicalizeRestapJson({ value: Number.NaN }), /finite|json/i);
  assert.throws(() => canonicalizeRestapJson({ __proto__: { polluted: true } }), /plain|prototype|json/i);
});

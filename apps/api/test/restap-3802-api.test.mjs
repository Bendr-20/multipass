import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRestap3802Discovery } from '../src/restap-3802-contracts.js';
import { createMemoryStore, createMultipassApi } from '../src/index.js';

const SESSION = 'A'.repeat(43);
const PUBLIC = Object.freeze({ canonicalIdentity: Object.freeze({ canonicalName: 'Looper #3802', imageUrl: 'https://helixa.xyz/3802.png' }), ownerPublicProfile: Object.freeze({ displayName: 'Q Looper', publicConversationEnabled: true, biography: 'bio', mission: 'mission', voicePresentation: 'direct' }) });
const DISCOVERY = buildRestap3802Discovery({ publicBaseUrl: 'https://helixa.xyz/multipass-api', codexProfile: { schemaVersion: '1.0.0', artifactHash: '5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24', codexVersion: 'v1', identity: { tokenId: 3802, canonicalName: 'Looper #3802', image: { url: 'https://helixa.xyz/3802.png' } } }, ownerProfile: PUBLIC.ownerPublicProfile, contact: 'https://helixa.xyz', availability: { discovery: true, talk: true, newsWrite: false, newsRead: false } });

function api(overrides = {}) { const calls = []; const policyCalls = []; const instance = createMultipassApi({ store: createMemoryStore(), baseUrl: 'https://helixa.xyz/multipass-api', restapDiscoveryEnabled: false, restapTalkEnabled: false, restap3802Policy: { async authorize(input) { policyCalls.push(input); return { discovery: DISCOVERY, publicProjection: PUBLIC }; } }, restapTalkRuntime: { async talk(input) { calls.push(input); return { reply: 'public reply', session_id: input.sessionId ?? SESSION }; } }, logger: { info() {}, warn() {} }, ...overrides }); return { instance, calls, policyCalls }; }
async function json(response) { return JSON.parse(await response.text()); }
function request(path, { method = 'GET', body, headers = {} } = {}) { return new Request('https://helixa.xyz' + path, { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }); }

test('disabled RESTAP gates are ordinary 404s and remain independent', async () => {
  const off = api();
  assert.equal((await off.instance.handleRequest(request('/api/restap/loopers/3802/.well-known/restap.json'))).status, 404);
  assert.equal((await off.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hi' }, headers: { 'content-type': 'application/json' } }))).status, 404);
  const discoveryOnly = api({ restapDiscoveryEnabled: true });
  assert.equal((await discoveryOnly.instance.handleRequest(request('/api/restap/loopers/3802/.well-known/restap.json'))).status, 200);
  assert.equal((await discoveryOnly.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hi' }, headers: { 'content-type': 'application/json' } }))).status, 404);
  const talkOnly = api({ restapTalkEnabled: true });
  assert.equal((await talkOnly.instance.handleRequest(request('/api/restap/loopers/3802/.well-known/restap.json'))).status, 404);
});

test('discovery uses fresh policy authorization, exact route, and brief public cache', async () => {
  const { instance, policyCalls } = api({ restapDiscoveryEnabled: true });
  const response = await instance.handleRequest(request('/api/restap/loopers/3802/.well-known/restap.json'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'public, max-age=60'); assert.deepEqual(await json(response), DISCOVERY); assert.deepEqual(policyCalls, [{ surface: 'discovery' }]);
  for (const path of ['/api/restap/loopers/3801/.well-known/restap.json', '/api/restap/loopers/3803/.well-known/restap.json', '/api/restap/loopers/3802/.well-known/restap.json?x=1', '/api/restap/loopers/3802/.well-known/restap.json/extra']) assert.equal((await instance.handleRequest(request(path))).status, 404, path);
});

test('talk strictly validates JSON and calls fresh policy then runtime once', async () => {
  const { instance, calls, policyCalls } = api({ restapTalkEnabled: true });
  const response = await instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hello', session_id: SESSION }, headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-multipass-client-ip': '203.0.113.5' } }));
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/json/u); assert.deepEqual(await json(response), { reply: 'public reply', session_id: SESSION });
  assert.deepEqual(policyCalls, [{ surface: 'talk' }]); assert.deepEqual(calls, [{ message: 'hello', sessionId: SESSION, publicProjection: PUBLIC }]);
  for (const [body, type] of [['{"message":"a","message":"b"}', 'application/json'], ['{"message":"x","extra":1}', 'application/json'], ['{"message":"x"}', 'text/plain'], ['{"message":"line\nfeed"}', 'application/json']]) {
    const invalid = await instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body, headers: { 'content-type': type } })); assert.equal(invalid.status, 400);
  }
});

test('talk maps invalid session, provider unavailable, and policy unavailable safely', async () => {
  const invalidSession = api({ restapTalkEnabled: true, restapTalkRuntime: { async talk() { throw new RangeError('invalid_session_id'); } } });
  let response = await invalidSession.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hi' }, headers: { 'content-type': 'application/json' } })); assert.equal(response.status, 400); assert.equal((await json(response)).error.code, 'invalid_session_id');
  const provider = api({ restapTalkEnabled: true, restapTalkRuntime: { async talk() { const error = new Error('private'); error.code = 'provider_unavailable'; error.status = 503; throw error; } } });
  response = await provider.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hi' }, headers: { 'content-type': 'application/json' } })); assert.equal(response.status, 503); assert.equal((await json(response)).error.code, 'provider_unavailable');
  const policy = api({ restapTalkEnabled: true, restap3802Policy: { async authorize() { throw new Error('rpc private'); } } });
  response = await policy.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body: { message: 'hi' }, headers: { 'content-type': 'application/json' } })); assert.equal(response.status, 503); assert.equal((await json(response)).error.code, 'restap_unavailable');
});

test('talk enforces per-IP, per-session, and global daily limits with Retry-After', async () => {
  let now = 1; const limited = api({ restapTalkEnabled: true, restapTalkLimits: { perIpPerMinute: 1, perSessionPerMinute: 1, globalPerDay: 2, concurrency: 1 }, restapRateLimitNow: () => now });
  const send = (body, ip) => limited.instance.handleRequest(request('/api/restap/loopers/3802/talk', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-multipass-client-ip': ip } }));
  assert.equal((await send({ message: 'one' }, '203.0.113.1')).status, 200);
  const ipBlocked = await send({ message: 'two' }, '203.0.113.1'); assert.equal(ipBlocked.status, 429); assert.ok(ipBlocked.headers.get('retry-after'));
  assert.equal((await send({ message: 'two', session_id: SESSION }, '203.0.113.2')).status, 200);
  const daily = await send({ message: 'three' }, '203.0.113.3'); assert.equal(daily.status, 429); assert.equal((await json(daily)).error.code, 'rate_limited');
});

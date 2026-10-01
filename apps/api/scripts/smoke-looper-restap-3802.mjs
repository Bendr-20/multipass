#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, open, rename, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { getAddress, verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const VERSION = '0.1.4-beta';
const SUFFIX = '/api/restap/loopers/3802';
const SIGNED_PATH = '/multipass-api/api/restap/loopers/3802/news';
const PHASES = Object.freeze({
  discovery: ['discovery'],
  talk: ['discovery', 'talk'],
  'news-write': ['discovery', 'talk', 'news-write'],
  'news-read': ['discovery', 'talk', 'news-write', 'news-read'],
});
const SENSITIVE_ENV = ['COOKIE', 'HTTP_COOKIE', 'RESTAP_COOKIE', 'MULTIPASS_CONSOLE_COOKIE'];
const HELP = `Usage: smoke-looper-restap-3802.mjs --mode <local|remote> --phase <discovery|talk|news-write|news-read> --expected-gates <csv>

Remote options:
  --base-url <exact RESTAP #3802 base URL>
  --allow-write --write-proof-state <mode-0600-file>
  --reuse-write-proof <mode-0600-file>
  --owner-auth-state <mode-0600-file>
  --expect-owner-auth-required

Canary owner-auth helpers:
  --mode remote --base-url <loopback-base> --owner-wallet <address> --owner-auth-challenge-out <file>
  --mode remote --base-url <loopback-base> --owner-auth-verify <challenge-file> --owner-signature-file <file> --owner-auth-state <file>
`;

main().catch(() => {
  process.stderr.write('restap-3802 smoke failed (sensitive details redacted)\n');
  process.exitCode = 1;
});

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--') argv.shift();
  if (argv.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  rejectCookieEnvironment();
  const options = parseArgs(argv);
  if (options.mode !== 'local' && options.mode !== 'remote') fail();
  if (options.cookie !== undefined) fail();
  if (options.mode === 'remote') options.baseUrl = normalizeRemoteBase(options.baseUrl);
  else if (options.baseUrl !== undefined) fail();

  if (isChallengeOperation(options) || isVerifyOperation(options)) {
    validateHelperOptions(options);
    if (isChallengeOperation(options)) await createOwnerChallenge(options);
    else await verifyOwnerChallenge(options);
    return;
  }

  validatePhase(options);
  if (options.mode === 'remote') await validateRemotePhaseOptions(options);
  else validateLocalPhaseOptions(options);

  let local;
  try {
    local = options.mode === 'local' ? await startLocalFixture(options.expectedGates) : null;
    const baseUrl = local?.baseUrl ?? options.baseUrl;
    const proof = await runSmoke({ ...options, baseUrl, local });
    process.stdout.write(formatResult(options, proof) + '\n');
  } finally {
    await local?.close();
  }
}

function parseArgs(argv) {
  const boolean = new Set(['--allow-write', '--expect-owner-auth-required']);
  const values = new Set([
    '--mode', '--base-url', '--phase', '--expected-gates', '--write-proof-state', '--reuse-write-proof',
    '--owner-auth-state', '--owner-wallet', '--owner-auth-challenge-out', '--owner-auth-verify',
    '--owner-signature-file', '--cookie',
  ]);
  const result = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag) || (!boolean.has(flag) && !values.has(flag))) fail();
    seen.add(flag);
    const key = flag.slice(2).replaceAll('-', '_');
    if (boolean.has(flag)) result[key] = true;
    else {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) fail();
      result[key] = argv[++index];
    }
  }
  return camel(result);
}

function camel(value) {
  const result = {};
  for (const [key, entry] of Object.entries(value)) result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = entry;
  return result;
}

function rejectCookieEnvironment() {
  if (SENSITIVE_ENV.some((name) => typeof process.env[name] === 'string' && process.env[name].length > 0)) fail();
}

function isChallengeOperation(options) {
  return options.ownerWallet !== undefined || options.ownerAuthChallengeOut !== undefined;
}
function isVerifyOperation(options) {
  return options.ownerAuthVerify !== undefined || options.ownerSignatureFile !== undefined;
}

function validateHelperOptions(options) {
  if (options.mode !== 'remote' || !isLoopback(options.baseUrl)) fail();
  const commonForbidden = ['phase', 'expectedGates', 'allowWrite', 'writeProofState', 'reuseWriteProof', 'expectOwnerAuthRequired'];
  if (commonForbidden.some((key) => options[key] !== undefined)) fail();
  if (isChallengeOperation(options)) {
    if (isVerifyOperation(options) || !options.ownerWallet || !options.ownerAuthChallengeOut || options.ownerAuthState) fail();
    try { options.ownerWallet = getAddress(options.ownerWallet); } catch { fail(); }
  } else {
    if (!options.ownerAuthVerify || !options.ownerSignatureFile || !options.ownerAuthState || options.ownerWallet || options.ownerAuthChallengeOut) fail();
  }
}

function validatePhase(options) {
  const expected = PHASES[options.phase];
  if (!expected || typeof options.expectedGates !== 'string' || options.expectedGates !== expected.join(',')) fail();
  options.expectedGates = expected;
}

async function validateRemotePhaseOptions(options) {
  if (options.phase === 'news-write') {
    if (!options.allowWrite || !options.writeProofState || options.reuseWriteProof || options.ownerAuthState || options.expectOwnerAuthRequired) fail();
    if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.RESTAP_NEWS_SIGNER_KEY ?? '')) fail();
  } else if (options.allowWrite || options.writeProofState) fail();

  if (options.phase === 'news-read') {
    if (!options.reuseWriteProof || process.env.RESTAP_NEWS_SIGNER_KEY) fail();
    if (isLoopback(options.baseUrl)) {
      if (!options.ownerAuthState || options.expectOwnerAuthRequired) fail();
    } else if (options.ownerAuthState || !options.expectOwnerAuthRequired) fail();
  } else if (options.reuseWriteProof || options.ownerAuthState || options.expectOwnerAuthRequired) fail();
}

function validateLocalPhaseOptions(options) {
  for (const key of ['allowWrite', 'writeProofState', 'reuseWriteProof', 'ownerAuthState', 'expectOwnerAuthRequired']) {
    if (options[key] !== undefined) fail();
  }
  if (process.env.RESTAP_NEWS_SIGNER_KEY) fail();
}

function normalizeRemoteBase(value) {
  if (typeof value !== 'string') fail();
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== SUFFIX || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHost(url.hostname)))) fail();
  return url.origin + url.pathname;
}
function isLoopback(value) { return loopbackHost(new URL(value).hostname); }
function loopbackHost(host) { return host === '127.0.0.1' || host === '[::1]' || host === '::1' || host === 'localhost'; }

async function runSmoke(options) {
  const checks = { discovery: 'pass', talk: 'disabled', continuity: 'disabled', 'news-write': 'disabled', 'news-read': 'disabled', negatives: 'pass' };
  const discoveryResponse = await request(options.baseUrl + '/.well-known/restap.json');
  expectStatus(discoveryResponse, 200);
  validateDiscovery(discoveryResponse.body, options.baseUrl, options.expectedGates);

  if (options.expectedGates.includes('talk')) {
    const first = await postJson(options.baseUrl + '/talk', { message: 'RESTAP smoke continuity turn one.' });
    expectStatus(first, 200);
    const session = validTalk(first.body);
    const second = await postJson(options.baseUrl + '/talk', { message: 'RESTAP smoke continuity turn two.', session_id: session });
    expectStatus(second, 200);
    if (validTalk(second.body) !== session) fail();
    checks.talk = 'pass'; checks.continuity = 'pass';
  } else {
    expectStatus(await postJson(options.baseUrl + '/talk', { message: 'RESTAP disabled-surface probe.' }), 404);
  }

  let writeProof;
  if (options.phase === 'news-write') {
    const key = options.local?.signerKey ?? process.env.RESTAP_NEWS_SIGNER_KEY;
    writeProof = await signedWrite(options.baseUrl, key, options.local?.senderId ?? 'restap-smoke');
    const replay = await sendSigned(options.baseUrl, writeProof.request);
    expectStatus(replay, 409);
    expectStatus(await postJson(options.baseUrl + '/news', { type: 'restap.smoke.unsigned' }), 401);
    checks['news-write'] = 'pass';
    if (options.writeProofState) await atomicJson(options.writeProofState, publicWriteProof(options.baseUrl, writeProof));
  } else if (options.expectedGates.includes('news-write')) {
    expectStatus(await postJson(options.baseUrl + '/news', { type: 'restap.smoke.unsigned' }), 401);
    checks['news-write'] = 'pass';
  } else {
    expectStatus(await postJson(options.baseUrl + '/news', { type: 'restap.smoke.disabled' }), 404);
  }

  if (options.phase === 'news-read') {
    const proof = options.local?.fixtureProof ?? await readProof(options.reuseWriteProof, options.baseUrl);
    if (options.local) expectStatus(await sendSigned(options.baseUrl, options.local.replayRequest), 409);
    expectStatus(await request(options.baseUrl + '/news'), 401);
    if (options.expectOwnerAuthRequired) checks['news-read'] = 'auth-required';
    else {
      const cookie = options.local?.ownerCookie ?? (await readOwnerState(options.ownerAuthState, options.baseUrl)).cookie;
      const read = await request(options.baseUrl + '/news', { headers: { cookie } });
      expectStatus(read, 200);
      if (!Array.isArray(read.body?.items) || !read.body.items.some((item) => sha256(canonical(item)) === proof.bodyHash)) fail();
      checks['news-read'] = 'pass';
      if (options.local) {
        const prior = await request(options.baseUrl + '/news', { headers: { cookie: options.local.priorOwnerCookie } });
        expectStatus(prior, 403);
      }
    }
  } else if (options.expectedGates.includes('news-read')) fail();
  else expectStatus(await request(options.baseUrl + '/news'), 404);

  const wrong = options.baseUrl.replace(/3802$/u, '3801');
  expectStatus(await request(wrong + '/.well-known/restap.json'), 404);
  expectStatus(await postJson(wrong + '/talk', { message: 'wrong-token probe' }), 404);
  expectStatus(await postJson(wrong + '/news', { type: 'wrong-token' }), 404);
  expectStatus(await request(wrong + '/news'), 404);
  return checks;
}

function validateDiscovery(value, baseUrl, gates) {
  if (!plain(value) || value.restap_version !== VERSION || !plain(value.agent) || value.agent.name !== 'Looper #3802') fail();
  const extension = value.agent.x_helixa;
  if (!plain(extension) || extension.base_url !== baseUrl || !plain(extension.codex) || extension.codex.schema_version !== '1.0.0' || !/^[0-9a-f]{64}$/u.test(extension.codex.artifact_hash ?? '')) fail();
  if (!Array.isArray(value.capabilities) || value.capabilities.length !== 3) fail();
  const expected = new Map([
    ['talk', ['POST', '/talk', gates.includes('talk')]],
    ['news-write', ['POST', '/news', gates.includes('news-write')]],
    ['news-read', ['GET', '/news', gates.includes('news-read')]],
  ]);
  for (const capability of value.capabilities) {
    const contract = expected.get(capability?.id);
    if (!contract || capability.method !== contract[0] || capability.endpoint !== contract[1] || capability.x_helixa?.available !== contract[2]) fail();
    expected.delete(capability.id);
  }
  if (expected.size !== 0) fail();
}

function validTalk(body) {
  if (!plain(body) || typeof body.reply !== 'string' || body.reply.length === 0 || !/^[A-Za-z0-9_-]{43}$/u.test(body.session_id ?? '')) fail();
  return body.session_id;
}

async function signedWrite(baseUrl, privateKey, senderId) {
  const account = privateKeyToAccount(privateKey);
  const body = { type: 'restap.smoke', message: 'Deterministic RESTAP #3802 HTTP smoke.', data: { purpose: 'conformance' } };
  const canonicalBody = canonical(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(24).toString('base64url');
  const message = ['RESTAP-SIGNATURE-V1', 'POST', SIGNED_PATH, senderId, account.address.toLowerCase(), sha256(canonicalBody), String(timestamp), nonce].join('\n');
  const signature = await account.signMessage({ message });
  const requestData = { body, headers: { 'x-restap-sender': senderId, 'x-restap-signer': account.address, 'x-restap-timestamp': String(timestamp), 'x-restap-nonce': nonce, 'x-restap-signature': signature } };
  const response = await sendSigned(baseUrl, requestData);
  expectStatus(response, 202);
  const itemId = response.body?.x_helixa_item_id;
  const receivedAt = response.body?.x_helixa_received_at;
  if (typeof itemId !== 'string' || !itemId || typeof receivedAt !== 'string' || Number.isNaN(Date.parse(receivedAt))) fail();
  return { itemId, receivedAt, bodyHash: sha256(canonicalBody), request: requestData };
}
async function sendSigned(baseUrl, input) { return postJson(baseUrl + '/news', input.body, input.headers); }
function publicWriteProof(baseUrl, value) { return { schemaVersion: 1, kind: 'restap-3802-news-write-proof', baseUrl, itemId: value.itemId, bodyHash: value.bodyHash, receivedAt: value.receivedAt }; }

async function request(url, init = {}) {
  let response;
  try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }); } catch { fail(); }
  let text;
  try { text = await response.text(); } catch { fail(); }
  if (Buffer.byteLength(text, 'utf8') > 64 * 1024) fail();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { fail(); } }
  return { status: response.status, body, headers: response.headers };
}
function postJson(url, body, headers = {}) { return request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
function expectStatus(response, status) { if (response.status !== status) fail(); }

function formatResult(options, checks) {
  return ['restap-3802-smoke=pass', 'phase=' + options.phase, 'expected-gates=' + options.expectedGates.join(','), 'discovery=' + checks.discovery, 'talk=' + checks.talk, 'continuity=' + checks.continuity, 'news-write=' + checks['news-write'], 'news-read=' + checks['news-read'], 'negatives=' + checks.negatives].join(' ');
}

async function startLocalFixture(gates) {
  const signerKey = generatePrivateKey();
  const signer = privateKeyToAccount(signerKey);
  const senderId = 'restap-smoke';
  const sessions = new Set();
  const nonces = new Set();
  const items = [];
  const ownerCookie = 'multipass_console=' + randomBytes(32).toString('base64url');
  const priorOwnerCookie = 'multipass_console=' + randomBytes(32).toString('base64url');
  const fixtureBody = { type: 'restap.smoke', message: 'Deterministic RESTAP #3802 HTTP smoke.', data: { purpose: 'conformance' } };
  items.push(fixtureBody);
  const replayNonce = randomBytes(24).toString('base64url');
  const replayTimestamp = String(Math.floor(Date.now() / 1000));
  const replayMessage = ['RESTAP-SIGNATURE-V1', 'POST', SIGNED_PATH, senderId, signer.address.toLowerCase(), sha256(canonical(fixtureBody)), replayTimestamp, replayNonce].join('\n');
  const replayRequest = { body: fixtureBody, headers: { 'x-restap-sender': senderId, 'x-restap-signer': signer.address, 'x-restap-timestamp': replayTimestamp, 'x-restap-nonce': replayNonce, 'x-restap-signature': await signer.signMessage({ message: replayMessage }) } };
  nonces.add(replayNonce);
  let baseUrl;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, 'http://' + incoming.headers.host);
      const text = await boundedIncoming(incoming);
      const json = text ? JSON.parse(text) : null;
      if (!url.pathname.startsWith(SUFFIX)) return respond(outgoing, 404, error('not_found'));
      if (url.pathname.replace(SUFFIX, '').includes('3801')) return respond(outgoing, 404, error('not_found'));
      const tail = url.pathname.slice(SUFFIX.length);
      if (tail === '/.well-known/restap.json' && incoming.method === 'GET') return respond(outgoing, 200, localDiscovery(baseUrl, gates));
      if (tail === '/talk' && incoming.method === 'POST') {
        if (!gates.includes('talk')) return respond(outgoing, 404, error('not_found'));
        if (!json || typeof json.message !== 'string') return respond(outgoing, 400, error('invalid_request'));
        const id = json.session_id ?? randomBytes(32).toString('base64url');
        if (json.session_id && !sessions.has(id)) return respond(outgoing, 400, error('invalid_session_id'));
        sessions.add(id); return respond(outgoing, 200, { reply: 'Local RESTAP fixture reply.', session_id: id });
      }
      if (tail === '/news' && incoming.method === 'POST') {
        if (!gates.includes('news-write')) return respond(outgoing, 404, error('not_found'));
        const auth = incoming.headers;
        if (!auth['x-restap-signature']) return respond(outgoing, 401, error('authentication_required'));
        const nonce = auth['x-restap-nonce'];
        if (nonces.has(nonce)) return respond(outgoing, 409, error('replay'));
        const canonicalBody = canonical(json);
        const message = ['RESTAP-SIGNATURE-V1', 'POST', SIGNED_PATH, auth['x-restap-sender'], String(auth['x-restap-signer']).toLowerCase(), sha256(canonicalBody), auth['x-restap-timestamp'], nonce].join('\n');
        const valid = auth['x-restap-sender'] === senderId && getAddress(auth['x-restap-signer']) === signer.address && await verifyMessage({ address: signer.address, message, signature: auth['x-restap-signature'] });
        if (!valid) return respond(outgoing, 403, error('sender_not_authorized'));
        nonces.add(nonce); items.unshift(json);
        return respond(outgoing, 202, { x_helixa_accepted: true, x_helixa_item_id: String(items.length), x_helixa_received_at: new Date().toISOString() });
      }
      if (tail === '/news' && incoming.method === 'GET') {
        if (!gates.includes('news-read')) return respond(outgoing, 404, error('not_found'));
        if (incoming.headers.cookie === priorOwnerCookie) return respond(outgoing, 403, error('forbidden'));
        if (incoming.headers.cookie !== ownerCookie) return respond(outgoing, 401, error('authentication_required'));
        return respond(outgoing, 200, { items, timestamp: Math.floor(Date.now() / 1000) });
      }
      return respond(outgoing, 404, error('not_found'));
    } catch { return respond(outgoing, 400, error('invalid_request')); }
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const address = server.address();
  baseUrl = 'http://127.0.0.1:' + address.port + SUFFIX;
  return {
    baseUrl, signerKey, senderId, ownerCookie, priorOwnerCookie, replayRequest,
    fixtureProof: { bodyHash: sha256(canonical(fixtureBody)) },
    close: () => new Promise((resolve, reject) => server.close((errorValue) => errorValue ? reject(errorValue) : resolve())),
  };
}

function localDiscovery(baseUrl, gates) {
  const enabled = new Set(gates);
  const capability = (id, method, endpoint, authentication, sessions, requestBytes) => ({ id, title: id, method, endpoint, x_helixa: { available: enabled.has(id), authentication, sessions, request_bytes: requestBytes } });
  return {
    restap_version: VERSION,
    agent: { name: 'Looper #3802', contact: 'https://helixa.test', x_helixa: { base_url: baseUrl, canonical_image: 'https://helixa.test/3802.png', display_name: 'Looper 3802', public_conversation_enabled: true, biography: 'Local smoke fixture.', mission: 'HTTP conformance.', voice_presentation: 'Direct.', codex: { schema_version: '1.0.0', artifact_hash: 'a'.repeat(64), version: 'smoke-v1' } } },
    capabilities: [capability('talk', 'POST', '/talk', 'none', true, 8192), capability('news-write', 'POST', '/news', 'restap-signature-v1', false, 16384), capability('news-read', 'GET', '/news', 'console-session-current-owner', false, 0)],
  };
}

async function boundedIncoming(stream) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > 64 * 1024) throw new Error(); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
function respond(response, status, body) { response.statusCode = status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body)); }
function error(code) { return { error: { code } }; }

async function createOwnerChallenge(options) {
  const pid = await readSiblingPid(options.ownerAuthChallengeOut);
  const endpoint = consoleEndpoint(options.baseUrl, 'nonce');
  const response = await postJson(endpoint, { wallet: options.ownerWallet });
  expectStatus(response, 200);
  if (getAddress(response.body?.wallet) !== options.ownerWallet || typeof response.body?.message !== 'string' || typeof response.body?.nonce !== 'string') fail();
  await atomicJson(options.ownerAuthChallengeOut, { schemaVersion: 1, kind: 'restap-3802-canary-console-challenge', baseUrl: options.baseUrl, pid, wallet: options.ownerWallet, message: response.body.message, nonce: response.body.nonce });
  process.stdout.write('restap-3802-owner-auth=challenge-ready\n');
}

async function verifyOwnerChallenge(options) {
  const challenge = await readProtectedJson(options.ownerAuthVerify, 32 * 1024);
  if (!plain(challenge) || challenge.kind !== 'restap-3802-canary-console-challenge' || challenge.schemaVersion !== 1 || challenge.baseUrl !== options.baseUrl || !Number.isSafeInteger(challenge.pid) || !pidAlive(challenge.pid)) fail();
  const siblingPid = await readSiblingPid(options.ownerAuthState);
  if (siblingPid !== challenge.pid) fail();
  const signature = (await readProtectedText(options.ownerSignatureFile, 1024)).trim();
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) fail();
  const response = await postJson(consoleEndpoint(options.baseUrl, 'verify'), { wallet: challenge.wallet, nonce: challenge.nonce, signature });
  expectStatus(response, 200);
  if (getAddress(response.body?.wallet) !== getAddress(challenge.wallet)) fail();
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = /(?:^|,\s*)(multipass_console=[^;,\s]+)/u.exec(setCookie);
  if (!match) fail();
  await atomicJson(options.ownerAuthState, { schemaVersion: 1, kind: 'restap-3802-canary-console-session', baseUrl: options.baseUrl, pid: challenge.pid, wallet: getAddress(challenge.wallet), cookie: match[1] });
  await unlink(options.ownerSignatureFile);
  await unlink(options.ownerAuthVerify);
  process.stdout.write('restap-3802-owner-auth=verified\n');
}

async function readOwnerState(path, baseUrl) {
  const value = await readProtectedJson(path, 16 * 1024);
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'baseUrl,cookie,kind,pid,schemaVersion,wallet' || value.schemaVersion !== 1 || value.kind !== 'restap-3802-canary-console-session' || value.baseUrl !== baseUrl || !Number.isSafeInteger(value.pid) || !pidAlive(value.pid) || !/^multipass_console=[A-Za-z0-9_-]+$/u.test(value.cookie ?? '')) fail();
  const pid = await readSiblingPid(path);
  if (pid !== value.pid) fail();
  return value;
}

async function readProof(path, baseUrl) {
  const value = await readProtectedJson(path, 16 * 1024);
  if (!plain(value) || Object.keys(value).join(',') !== 'schemaVersion,kind,baseUrl,itemId,bodyHash,receivedAt' || value.schemaVersion !== 1 || value.kind !== 'restap-3802-news-write-proof' || value.baseUrl !== baseUrl || typeof value.itemId !== 'string' || !/^[0-9a-f]{64}$/u.test(value.bodyHash ?? '') || Number.isNaN(Date.parse(value.receivedAt))) fail();
  return value;
}

async function readSiblingPid(path) {
  const pidPath = join(dirname(path), 'pid');
  const text = (await readProtectedText(pidPath, 32, { exactMode: false, allowedUids: [process.getuid(), 0] })).trim();
  if (!/^[1-9]\d*$/u.test(text)) fail();
  const pid = Number(text);
  if (!Number.isSafeInteger(pid) || !pidAlive(pid)) fail();
  return pid;
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

function consoleEndpoint(baseUrl, action) { return baseUrl.slice(0, -SUFFIX.length) + '/api/multipass/console/session/' + action; }

async function readProtectedJson(path, maximum) {
  let text;
  try { text = await readProtectedText(path, maximum); } catch { fail(); }
  try { return JSON.parse(text); } catch { fail(); }
}
async function readProtectedText(path, maximum, { exactMode = true, allowedUids = [process.getuid()] } = {}) {
  if (typeof path !== 'string' || !path) fail();
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || !allowedUids.includes(before.uid) || (exactMode ? (before.mode & 0o777) !== 0o600 : (before.mode & 0o022) !== 0) || before.size > maximum) fail();
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const current = await handle.stat();
    if (current.dev !== before.dev || current.ino !== before.ino || !current.isFile() || !allowedUids.includes(current.uid) || (exactMode ? (current.mode & 0o777) !== 0o600 : (current.mode & 0o022) !== 0) || current.size > maximum) fail();
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

async function atomicJson(path, value) {
  if (typeof path !== 'string' || !path) fail();
  try { await lstat(path); fail(); } catch (errorValue) { if (errorValue?.code !== 'ENOENT') throw errorValue; }
  const temporary = path + '.' + process.pid + '.' + randomBytes(8).toString('hex') + '.tmp';
  const content = JSON.stringify(value) + '\n';
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function fail() { throw new Error('redacted'); }

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const RUNBOOK = new URL('../../../docs/loopers/looper-restap-3802-canary.md', import.meta.url);
const README = new URL('../README.md', import.meta.url);

async function text(url) { return readFile(url, 'utf8'); }
function includesAll(source, values) { for (const value of values) assert.ok(source.includes(value), 'missing: ' + value); }

test('runbook pins RESTAP provenance, routes, Codex, authority, and data contracts', async () => {
  const source = await text(RUNBOOK);
  includesAll(source, [
    '0.1.4-beta', '5d7222692a0d1c53fbb03091b94de6c732cac2bc',
    'e94a4ea4b90417760019e314e9b03bf730c1ad519b4b9cbecab77b234f2a3943',
    '8f7ffe519b7a0cefb6265223ecded251ee3b2893051f37c3ebaedcd05ab8ee30',
    'd515f98219ec23bef95eccd507c87e88174201a8d7a4d44b666982f97b62bee6',
    '5df3a690efd6440ab7716cfe16356a7494a5d3fb1d0db50569f838f1a837953f',
    'MIT', 'package.json#license', 'no upstream runtime code',
    'aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073',
    '5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24',
    '/api/restap/loopers/3802/.well-known/restap.json', '/api/restap/loopers/3802/talk', '/api/restap/loopers/3802/news',
    'current owner', 'controller', 'canonical name', 'canonical image', 'publicConversationEnabled', 'transfer',
    'RESTAP-SIGNATURE-V1', 'x-restap-sender', 'x-restap-signer', 'x-restap-timestamp', 'x-restap-nonce', 'x-restap-signature',
    'not authentication', '30 minutes', '12 turns', '30 days', '10,000', 'STRICT',
  ]);
});

test('runbook defines independent gates, safe operations, rollout, rollback, and deferrals', async () => {
  const source = await text(RUNBOOK);
  includesAll(source, [
    'MULTIPASS_RESTAP_DISCOVERY_ENABLED', 'MULTIPASS_RESTAP_TALK_ENABLED', 'MULTIPASS_RESTAP_NEWS_WRITE_ENABLED', 'MULTIPASS_RESTAP_NEWS_READ_ENABLED',
    'discovery → talk → news-write → news-read', 'news-read → news-write → talk → discovery',
    'safe logs', 'redacted', 'SQLite backup API', 'PRAGMA integrity_check', 'retains accepted items', 'replay records',
    'SSE deferred', 'ERC-8004 service publication deferred', 'never copies a production Console cookie',
    '--bankr-env', 'root-owned mode 0600', 'whitelist', 'BANKR_API_KEY', 'BANKR_MODEL',
    'CANARY_DB="$STATE/canary.sqlite"',
    '--replace', '--stop', '--allow-write', '--owner-auth-challenge-out', '--owner-auth-verify', '--owner-auth-state',
  ]);
});

test('runbook contains exact cumulative local, canary, rehearsal, smoke, and rollback commands', async () => {
  const source = await text(RUNBOOK);
  for (const line of [
    '--phase discovery --expected-gates discovery',
    '--phase talk --expected-gates discovery,talk',
    '--phase news-write --expected-gates discovery,talk,news-write --allow-write',
    '--phase news-read --expected-gates discovery,talk,news-write,news-read',
    '--rehearsal --phase discovery', '--rollback --phase discovery',
    'smoke:restap-3802 -- --mode local --phase news-read --expected-gates discovery,talk,news-write,news-read',
    'run-looper-restap-3802-canary.sh --replace', 'run-looper-restap-3802-canary.sh --stop',
  ]) assert.ok(source.includes(line), 'missing command: ' + line);
  assert.match(source, /APPROVAL BOUNDARY 1[\s\S]*APPROVAL BOUNDARY 2[\s\S]*APPROVAL BOUNDARY 3[\s\S]*APPROVAL BOUNDARY 4/u);
});

test('API README links the RESTAP #3802 runbook and keeps gates false by default', async () => {
  const source = await text(README);
  includesAll(source, ['Looper #3802 RESTAP canary', '../../docs/loopers/looper-restap-3802-canary.md', 'default off']);
});

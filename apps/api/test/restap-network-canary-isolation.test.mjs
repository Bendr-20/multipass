import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';

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

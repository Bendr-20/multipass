import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPantheonCredRegistry } from '../src/pantheon-cred-registry.js';

const PAYLOAD = {
  chain: 'base',
  chain_id: 8453,
  vault_address: '0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb',
  count: 0,
  tokens: [],
};

test('loads only the fixed Base Pantheon registry with bounded JSON', async () => {
  const calls = [];
  const result = await loadPantheonCredRegistry({ fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(PAYLOAD), { status: 200, headers: { 'content-type': 'application/json', 'content-length': '140' } });
  } });
  assert.deepEqual(result, PAYLOAD);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://launch.pantheonvaults.com/api/skill/registry?chain=base');
  assert.equal(calls[0][1].redirect, 'error');
  assert.ok(calls[0][1].signal, 'registry fetch must have an enforced deadline signal');
});

test('rejects unavailable non-JSON oversized and malformed registry responses', async () => {
  await assert.rejects(loadPantheonCredRegistry({ fetchImpl: async () => new Response('no', { status: 503 }) }), /unavailable/i);
  await assert.rejects(loadPantheonCredRegistry({ fetchImpl: async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/html' } }) }), /JSON/i);
  await assert.rejects(loadPantheonCredRegistry({ fetchImpl: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '2000000' } }) }), /large/i);
  await assert.rejects(loadPantheonCredRegistry({ fetchImpl: async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }) }), /malformed/i);
});

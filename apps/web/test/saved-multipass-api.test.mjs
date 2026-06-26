import assert from 'node:assert/strict';
import test from 'node:test';

import { saveActivatedMultipass } from '../src/saved-multipass-api.js';

test('saveActivatedMultipass posts agent input and returns saved payload', async () => {
  const calls = [];
  const result = await saveActivatedMultipass({
    agent: '1',
    apiBase: 'https://api.example.test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls[0].url, 'https://api.example.test/api/multipass');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(JSON.parse(calls[0].init.body).agent, '1');
  assert.equal(result.sharePath, '/multipass/bendr-2-1');
});

test('saveActivatedMultipass preserves absolute API base paths', async () => {
  const calls = [];
  await saveActivatedMultipass({
    agent: '1',
    apiBase: 'https://api.example.test/base',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), { status: 201 });
    },
  });
  assert.equal(calls[0].url, 'https://api.example.test/base/api/multipass');
});

test('saveActivatedMultipass supports relative API bases', async () => {
  const calls = [];
  await saveActivatedMultipass({
    agent: '1',
    apiBase: '/multipass-api',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ created: true, sharePath: '/multipass/bendr-2-1', profile: { slug: 'bendr-2-1' } }), { status: 201 });
    },
  });
  assert.equal(calls[0].url, '/multipass-api/api/multipass');
});

test('saveActivatedMultipass rejects empty agents before fetching', async () => {
  await assert.rejects(
    () => saveActivatedMultipass({ agent: ' ', fetchImpl: async () => { throw new Error('should not fetch'); } }),
    /Activate a live record before saving/,
  );
});

test('saveActivatedMultipass throws useful API errors', async () => {
  await assert.rejects(
    () => saveActivatedMultipass({
      agent: '1',
      apiBase: 'https://api.example.test',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Nope.' } }), { status: 400 }),
    }),
    /Nope/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createClaimNonce, createMultipassFragment, importMultipassTool, logoutMultipassSession, revokeMultipassFragment, saveActivatedMultipass, submitManualReviewClaim, updateMultipassFragment, updateMultipassProfile, verifyClaimSignature } from '../src/saved-multipass-api.js';

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

test('claim helpers post nonce verify update and logout with credentials and CSRF', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith('/claim/nonce')) return new Response(JSON.stringify({ nonce: 'nonce-1', message: 'Sign this' }), { status: 200 });
    if (String(url).endsWith('/claim/verify')) return new Response(JSON.stringify({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { display_name: 'Bendr' } }), { status: 200 });
    if (String(url).endsWith('/profile')) return new Response(JSON.stringify({ changedFields: ['display_name'], profile: { display_name: 'Bendr Managed' } }), { status: 200 });
    if (String(url).endsWith('/session/logout')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  };

  assert.deepEqual(await createClaimNonce({ id: 'bendr-2-1', apiBase: '/multipass-api', fetchImpl }), { nonce: 'nonce-1', message: 'Sign this' });
  assert.deepEqual(await verifyClaimSignature({ id: 'bendr-2-1', apiBase: '/multipass-api', wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', nonce: 'nonce-1', signature: '0xsig', fetchImpl }), { claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { display_name: 'Bendr' } });
  assert.deepEqual(await updateMultipassProfile({ id: 'bendr-2-1', apiBase: '/multipass-api', csrfToken: 'csrf-1', patch: { display_name: 'Bendr Managed' }, fetchImpl }), { changedFields: ['display_name'], profile: { display_name: 'Bendr Managed' } });
  assert.deepEqual(await logoutMultipassSession({ id: 'bendr-2-1', apiBase: '/multipass-api', csrfToken: 'csrf-1', fetchImpl }), { ok: true });

  assert.deepEqual(calls.map((call) => [call.url, call.init.method, call.init.credentials]), [
    ['/multipass-api/api/multipass/bendr-2-1/claim/nonce', 'POST', 'include'],
    ['/multipass-api/api/multipass/bendr-2-1/claim/verify', 'POST', 'include'],
    ['/multipass-api/api/multipass/bendr-2-1/profile', 'PATCH', 'include'],
    ['/multipass-api/api/multipass/bendr-2-1/session/logout', 'POST', 'include'],
  ]);
  assert.equal(calls[2].init.headers['x-csrf-token'], 'csrf-1');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    mode: 'wallet_signature',
    wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    nonce: 'nonce-1',
    signature: '0xsig',
  });
});

test('manual review helper submits review claim metadata', async () => {
  const calls = [];
  const result = await submitManualReviewClaim({
    id: 'bendr-2-1',
    apiBase: 'https://api.example.test/base',
    proposedManagerWallet: '0x339559A2d1CD15059365FC7bD36b3047BbA480E0',
    contactRoute: 'agentmail:team@example.test',
    note: 'Please review.',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ claim_status: 'claim_pending' }), { status: 202 });
    },
  });

  assert.deepEqual(result, { claim_status: 'claim_pending' });
  assert.equal(calls[0].url, 'https://api.example.test/base/api/multipass/bendr-2-1/claim/verify');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    mode: 'manual_review',
    proposedManagerWallet: '0x339559A2d1CD15059365FC7bD36b3047BbA480E0',
    contactRoute: 'agentmail:team@example.test',
    note: 'Please review.',
  });
});

test('importMultipassTool posts Bankr service metadata with credentials and CSRF', async () => {
  const calls = [];
  const input = {
    source: 'bankr_x402_cloud',
    serviceName: 'cred-report',
    endpointUrl: 'https://api.bankr.bot/x402/helixa/cred-report',
    network: 'base',
    currency: 'USDC',
    service: { price: '1.00', description: 'Helixa AgentDNA cred report.' },
  };

  const result = await importMultipassTool({
    id: 'bendr-2-1',
    apiBase: '/multipass-api',
    csrfToken: 'csrf-1',
    tool: input,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ tools: { tools: [{ tool_id: 'cred-report' }] } }), { status: 201 });
    },
  });

  assert.deepEqual(result, { tools: { tools: [{ tool_id: 'cred-report' }] } });
  assert.equal(calls[0].url, '/multipass-api/api/multipass/bendr-2-1/tools/import');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.headers['x-csrf-token'], 'csrf-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
});

test('fragment helpers create update and revoke with credentials and CSRF', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST' && String(url).endsWith('/fragments')) return new Response(JSON.stringify({ fragment: { fragment_id: 'frag_1' } }), { status: 201 });
    if (init.method === 'PATCH' && String(url).endsWith('/fragments/frag_1')) return new Response(JSON.stringify({ fragment: { fragment_id: 'frag_1', status: 'stale' } }), { status: 200 });
    if (init.method === 'POST' && String(url).endsWith('/fragments/frag_1/revoke')) return new Response(JSON.stringify({ fragment: { fragment_id: 'frag_1', status: 'revoked' } }), { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  };

  const endpointRef = { endpoint_id: 'profile-json', url: 'https://helixa.xyz/multipass-api/api/multipass/bendr-2-1', protocol: 'api' };
  assert.deepEqual(await createMultipassFragment({ id: 'bendr-2-1', apiBase: '/multipass-api', csrfToken: 'csrf-1', fragment: { fragment_type: 'endpoint', public_value: 'Profile JSON endpoint', endpoint_ref: endpointRef }, fetchImpl }), { fragment: { fragment_id: 'frag_1' } });
  assert.deepEqual(await updateMultipassFragment({ id: 'bendr-2-1', fragmentId: 'frag_1', apiBase: '/multipass-api', csrfToken: 'csrf-1', patch: { status: 'stale', endpoint_ref: { ...endpointRef, protocol: 'mcp' } }, fetchImpl }), { fragment: { fragment_id: 'frag_1', status: 'stale' } });
  assert.deepEqual(await revokeMultipassFragment({ id: 'bendr-2-1', fragmentId: 'frag_1', apiBase: '/multipass-api', csrfToken: 'csrf-1', fetchImpl }), { fragment: { fragment_id: 'frag_1', status: 'revoked' } });

  assert.deepEqual(calls.map((call) => [call.url, call.init.method, call.init.credentials, call.init.headers['x-csrf-token']]), [
    ['/multipass-api/api/multipass/bendr-2-1/fragments', 'POST', 'include', 'csrf-1'],
    ['/multipass-api/api/multipass/bendr-2-1/fragments/frag_1', 'PATCH', 'include', 'csrf-1'],
    ['/multipass-api/api/multipass/bendr-2-1/fragments/frag_1/revoke', 'POST', 'include', 'csrf-1'],
  ]);
  assert.deepEqual(calls.map((call) => JSON.parse(call.init.body)), [
    { fragment_type: 'endpoint', public_value: 'Profile JSON endpoint', endpoint_ref: endpointRef },
    { status: 'stale', endpoint_ref: { ...endpointRef, protocol: 'mcp' } },
    {},
  ]);
});

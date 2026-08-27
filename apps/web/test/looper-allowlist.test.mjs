import assert from 'node:assert/strict';
import test from 'node:test';

import { getLooperAllowlistProof, getLooperAllowlistSourceFromLocation, getLooperAllowlistStatus, isLooperAllowlistEnsName, normalizeLooperAllowlistAddress, normalizeLooperAllowlistEnsNameInput, registerLooperAllowlistAddress, resolveEnsAddressOnBase, resolveLooperAllowlistAddressInput } from '../src/looper-allowlist.js';

const ADDRESS = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

test('normalizeLooperAllowlistAddress returns checksum address', () => {
  assert.equal(normalizeLooperAllowlistAddress(ADDRESS.toLowerCase()), ADDRESS);
});

test('normalizeLooperAllowlistAddress rejects invalid values', () => {
  assert.throws(() => normalizeLooperAllowlistAddress('loopers'), /valid Ethereum address/);
});

test('isLooperAllowlistEnsName accepts ENS-like names only', () => {
  assert.equal(isLooperAllowlistEnsName('jesse.base.eth'), true);
  assert.equal(isLooperAllowlistEnsName('jesse'), true);
  assert.equal(isLooperAllowlistEnsName('jesse.base'), true);
  assert.equal(isLooperAllowlistEnsName('foo.bar.eth'), true);
  assert.equal(isLooperAllowlistEnsName(ADDRESS), false);
  assert.equal(isLooperAllowlistEnsName('-not-a-wallet'), false);
});

test('normalizeLooperAllowlistEnsNameInput expands Base name shorthands', () => {
  assert.equal(normalizeLooperAllowlistEnsNameInput('Jesse'), 'jesse.base.eth');
  assert.equal(normalizeLooperAllowlistEnsNameInput('Jesse.base'), 'jesse.base.eth');
  assert.equal(normalizeLooperAllowlistEnsNameInput('Jesse.base.eth'), 'jesse.base.eth');
  assert.equal(normalizeLooperAllowlistEnsNameInput('foo.bar.eth'), 'foo.bar.eth');
  assert.equal(normalizeLooperAllowlistEnsNameInput(ADDRESS), null);
  assert.equal(normalizeLooperAllowlistEnsNameInput('bad_name'), null);
});

test('resolveLooperAllowlistAddressInput returns checksum addresses and resolved Base names', async () => {
  assert.equal(await resolveLooperAllowlistAddressInput(ADDRESS.toLowerCase()), ADDRESS);
  assert.equal(
    await resolveLooperAllowlistAddressInput('Jesse', { resolveEnsAddress: async (name) => {
      assert.equal(name, 'jesse.base.eth');
      return '0x2211d1d0020daea8039e46cf1367962070d77da9';
    } }),
    '0x2211d1D0020DAEA8039E46Cf1367962070d77DA9',
  );
});

test('resolveLooperAllowlistAddressInput expands partial Base names before registering', async () => {
  const seen = [];
  const resolver = async (name) => {
    seen.push(name);
    return '0x26c88ebb5decfb52aaad77c3984c4eec796e0695';
  };

  assert.equal(await resolveLooperAllowlistAddressInput('pika.base', { resolveEnsAddress: resolver }), '0x26c88EBb5DeCfb52AaAD77C3984C4EeC796e0695');
  assert.deepEqual(seen, ['pika.base.eth']);
});

test('resolveLooperAllowlistAddressInput rejects unresolved Base names', async () => {
  await assert.rejects(
    resolveLooperAllowlistAddressInput('missing.base.eth', { resolveEnsAddress: async () => null }),
    /does not resolve/,
  );
});

test('resolveEnsAddressOnBase resolves the reported pika Basename', async () => {
  assert.equal(await resolveEnsAddressOnBase('pika'), '0x26c88EBb5DeCfb52AaAD77C3984C4EeC796e0695');
});

test('registerLooperAllowlistAddress posts normalized address', async () => {
  const calls = [];
  const result = await registerLooperAllowlistAddress({
    address: ADDRESS.toLowerCase(),
    apiBase: 'https://mint.example/api',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ registered: true, created: true, address: ADDRESS }), { status: 201 });
    },
  });

  assert.equal(result.address, ADDRESS);
  assert.equal(calls[0].url, 'https://mint.example/api/api/loopers/allowlist/register');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: ADDRESS,
    source: 'launch-page',
    looper_allowlist_contact: '',
  });
});

test('registerLooperAllowlistAddress posts bot trap and optional Turnstile token', async () => {
  const calls = [];
  await registerLooperAllowlistAddress({
    address: ADDRESS,
    botTrap: 'filled',
    turnstileToken: 'token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ registered: true, created: true, address: ADDRESS }), { status: 201 });
    },
  });

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: ADDRESS,
    source: 'launch-page',
    looper_allowlist_contact: 'filled',
    turnstileToken: 'token',
  });
});

test('getLooperAllowlistSourceFromLocation derives bounded referral source labels', () => {
  assert.equal(getLooperAllowlistSourceFromLocation('https://helixa.xyz/allowlist'), 'launch-page');
  assert.equal(getLooperAllowlistSourceFromLocation('https://helixa.xyz/allowlist?ref=Base%20Builders'), 'ref:base-builders');
  assert.equal(getLooperAllowlistSourceFromLocation('https://helixa.xyz/allowlist?source=x&utm_campaign=Loopers Drop!'), 'x:loopers-drop');
  assert.equal(getLooperAllowlistSourceFromLocation('not a url'), 'launch-page');
});

test('getLooperAllowlistStatus fetches status for normalized address', async () => {
  const result = await getLooperAllowlistStatus({
    address: ADDRESS.toLowerCase(),
    apiBase: '/multipass-api/',
    fetchImpl: async (url) => {
      assert.equal(url, `/multipass-api/api/loopers/allowlist/status?address=${encodeURIComponent(ADDRESS)}`);
      return new Response(JSON.stringify({ registered: true, address: ADDRESS }), { status: 200 });
    },
  });

  assert.equal(result.registered, true);
});

test('getLooperAllowlistProof fetches a frozen mint proof for normalized address', async () => {
  const result = await getLooperAllowlistProof({
    address: ADDRESS.toLowerCase(),
    apiBase: '/multipass-api/',
    fetchImpl: async (url) => {
      assert.equal(url, `/multipass-api/api/loopers/allowlist/proof?address=${encodeURIComponent(ADDRESS)}`);
      return new Response(JSON.stringify({
        collection: 'loopers',
        address: ADDRESS,
        eligible: true,
        proof: ['0x1234'],
        merkle_root: '0xabcd',
      }), { status: 200 });
    },
  });

  assert.equal(result.collection, 'loopers');
  assert.equal(result.eligible, true);
  assert.deepEqual(result.proof, ['0x1234']);
});

test('registerLooperAllowlistAddress surfaces API errors', async () => {
  await assert.rejects(
    registerLooperAllowlistAddress({
      address: ADDRESS,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Closed.' } }), { status: 403 }),
    }),
    /Closed/,
  );
});

test('getLooperAllowlistProof surfaces API errors', async () => {
  await assert.rejects(
    getLooperAllowlistProof({
      address: ADDRESS,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Proof snapshot not ready.' } }), { status: 503 }),
    }),
    /Proof snapshot not ready/,
  );
});

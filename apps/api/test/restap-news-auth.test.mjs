import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

import { canonicalizeRestapJson, normalizeRestapNewsPost } from '../src/restap-3802-contracts.js';
import { RestapAuthenticationRequiredError, RestapDependencyUnavailableError, RestapSenderNotAuthorizedError, buildRestapNewsSignedMessage, createRestapNewsAuthenticator } from '../src/restap-news-auth.js';

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c');
const body = normalizeRestapNewsPost({ type: 'agent.update', message: 'hello', data: { b: 2, a: 1 }, session_id: 'A'.repeat(43) });
const nowSeconds = 1_790_000_000;
const nonce = 'A'.repeat(22);
const policy = Object.freeze({ newsSenders: Object.freeze([{ id: 'agent.one', kind: 'evm', enabled: true, signer: account.address }]) });

async function signedInput(overrides = {}) {
  const sender = overrides.sender ?? 'agent.one';
  const signer = overrides.signer ?? account.address;
  const timestamp = overrides.timestamp ?? nowSeconds;
  const requestBody = overrides.body ?? body;
  const message = buildRestapNewsSignedMessage({ method: 'POST', path: '/multipass-api/api/restap/loopers/3802/news', senderId: sender, signer, canonicalBody: canonicalizeRestapJson(requestBody), timestamp, nonce });
  const signature = overrides.signature ?? await account.signMessage({ message });
  return { method: overrides.method ?? 'POST', path: overrides.path ?? '/multipass-api/api/restap/loopers/3802/news', body: requestBody, headers: { 'x-restap-sender': sender, 'x-restap-signer': signer, 'x-restap-timestamp': String(timestamp), 'x-restap-nonce': nonce, 'x-restap-signature': signature } };
}

test('verifies a bound EOA sender and returns only replay-safe normalized evidence', async () => {
  const auth = createRestapNewsAuthenticator({ policy, now: () => nowSeconds * 1000 });
  const result = await auth.authenticate(await signedInput());
  assert.equal(result.senderId, 'agent.one');
  assert.equal(result.verifiedSigner, account.address);
  assert.equal(result.canonicalBody, canonicalizeRestapJson(body));
  assert.match(result.bodyHash, /^[a-f0-9]{64}$/u);
  assert.match(result.nonceHash, /^[a-f0-9]{64}$/u);
  assert.equal(result.correlationId, 'A'.repeat(43));
  assert.equal(Object.hasOwn(result, 'signature'), false);
  assert.equal(Object.hasOwn(result, 'nonce'), false);
});

test('canonical body order is stable while body, method, path, sender, signer, timestamp, and nonce are bound', async () => {
  const auth = createRestapNewsAuthenticator({ policy, now: () => nowSeconds * 1000 });
  const reordered = { session_id: 'A'.repeat(43), data: { a: 1, b: 2 }, message: 'hello', type: 'agent.update' };
  assert.equal((await auth.authenticate(await signedInput({ body: reordered }))).senderId, 'agent.one');
  for (const patch of [
    { method: 'PUT' }, { path: '/wrong' }, { sender: 'agent.two' },
    { signer: '0x1111111111111111111111111111111111111111' }, { timestamp: nowSeconds + 301 },
  ]) {
    const candidate = await signedInput(patch);
    await assert.rejects(() => auth.authenticate(candidate), (error) => error instanceof RestapSenderNotAuthorizedError || error instanceof RestapAuthenticationRequiredError);
  }
  const tampered = await signedInput();
  tampered.body = { ...body, message: 'tampered' };
  await assert.rejects(() => auth.authenticate(tampered), RestapSenderNotAuthorizedError);
});

test('sender swap and same-signer cross-ID replay fail because sender ID is signed', async () => {
  const shared = Object.freeze({ newsSenders: Object.freeze([{ id: 'agent.one', kind: 'evm', enabled: true, signer: account.address }, { id: 'agent.two', kind: 'evm', enabled: true, signer: account.address }]) });
  const auth = createRestapNewsAuthenticator({ policy: shared, now: () => nowSeconds * 1000 });
  const original = await signedInput();
  assert.equal((await auth.authenticate(original)).senderId, 'agent.one');
  original.headers['x-restap-sender'] = 'agent.two';
  await assert.rejects(() => auth.authenticate(original), RestapSenderNotAuthorizedError);
});

test('missing or malformed headers are uniform authentication-required failures', async () => {
  const auth = createRestapNewsAuthenticator({ policy, now: () => nowSeconds * 1000 });
  for (const headers of [{}, { 'x-restap-sender': 'agent.one' }, { ...(await signedInput()).headers, 'x-restap-nonce': 'bad' }]) {
    await assert.rejects(() => auth.authenticate({ method: 'POST', path: '/multipass-api/api/restap/loopers/3802/news', body, headers }), RestapAuthenticationRequiredError);
  }
});

test('uses injected EIP-1271 verification and preserves dependency outages', async () => {
  const smart = '0x1111111111111111111111111111111111111111';
  const smartPolicy = { newsSenders: [{ id: 'smart', kind: 'evm', enabled: true, signer: smart }] };
  const input = await signedInput({ sender: 'smart', signer: smart, signature: '0x' + '11'.repeat(65) });
  let calls = 0;
  const auth = createRestapNewsAuthenticator({ policy: smartPolicy, now: () => nowSeconds * 1000, verifyEip1271: async () => { calls += 1; return true; } });
  assert.equal((await auth.authenticate(input)).verifiedSigner.toLowerCase(), smart.toLowerCase());
  assert.equal(calls, 1);
  const unavailable = createRestapNewsAuthenticator({ policy: smartPolicy, now: () => nowSeconds * 1000, verifyEip1271: async () => { throw new Error('rpc secret'); } });
  await assert.rejects(() => unavailable.authenticate(input), RestapDependencyUnavailableError);
});

test('revalidates ERC-8004 sender controller before acceptance', async () => {
  const ercPolicy = { newsSenders: [{ id: 'agent8004', kind: 'erc8004', enabled: true, signer: account.address, erc8004: { chainId: 8453, registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', agentId: '7' } }] };
  const input = await signedInput({ sender: 'agent8004' });
  const good = createRestapNewsAuthenticator({ policy: ercPolicy, now: () => nowSeconds * 1000, resolveErc8004Controller: async () => account.address });
  assert.equal((await good.authenticate(input)).senderId, 'agent8004');
  const stale = createRestapNewsAuthenticator({ policy: ercPolicy, now: () => nowSeconds * 1000, resolveErc8004Controller: async () => '0x1111111111111111111111111111111111111111' });
  await assert.rejects(() => stale.authenticate(input), RestapSenderNotAuthorizedError);
});

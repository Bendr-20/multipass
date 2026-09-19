import assert from 'node:assert/strict';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import { createConsoleAuthStore } from '../src/console-auth.js';
import { createEthereumPersonalSignatureVerifier } from '../src/signature-verifier.js';

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c');
const verifier = createEthereumPersonalSignatureVerifier({ client: null });

test('Console auth exchanges a one-time signed challenge for a wallet-bound session', async () => {
  const auth = createConsoleAuthStore({ now: () => new Date('2026-09-17T03:30:00.000Z') });
  const challenge = auth.createChallenge({ wallet: account.address, domain: 'helixa.test' });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await auth.verifyChallenge({
    wallet: account.address,
    nonce: challenge.nonce,
    signature,
    signatureVerifier: verifier,
  });

  const validated = auth.validateSession({
    sessionId: session.sessionId,
    csrfToken: session.csrfToken,
    requireCsrf: true,
  });
  assert.equal(validated.wallet, account.address.toLowerCase());
  assert.throws(() => auth.validateSession({ sessionId: session.sessionId, csrfToken: 'wrong', requireCsrf: true }), /CSRF/i);
  await assert.rejects(
    auth.verifyChallenge({ wallet: account.address, nonce: challenge.nonce, signature, signatureVerifier: verifier }),
    /already used/i,
  );
});

test('Console auth rejects a signature from another wallet and expired sessions', async () => {
  let now = new Date('2026-09-17T03:30:00.000Z');
  const auth = createConsoleAuthStore({ now: () => now, sessionTtlMs: 1_000 });
  const challenge = auth.createChallenge({ wallet: account.address, domain: 'helixa.test' });
  const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca3a545d53b5575c6f5f9f5b3f91d5b13cfb0bc9cf4f8b');
  const wrongSignature = await other.signMessage({ message: challenge.message });
  await assert.rejects(
    auth.verifyChallenge({ wallet: account.address, nonce: challenge.nonce, signature: wrongSignature, signatureVerifier: verifier }),
    /did not verify/i,
  );

  const fresh = auth.createChallenge({ wallet: account.address, domain: 'helixa.test' });
  const signature = await account.signMessage({ message: fresh.message });
  const session = await auth.verifyChallenge({ wallet: account.address, nonce: fresh.nonce, signature, signatureVerifier: verifier });
  now = new Date('2026-09-17T03:30:02.000Z');
  assert.throws(() => auth.validateSession({ sessionId: session.sessionId }), /expired/i);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import { createEthereumPersonalSignatureVerifier, verifyEthereumPersonalSignature } from '../src/signature-verifier.js';

test('verifyEthereumPersonalSignature verifies an EVM personal_sign message', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c');
  const message = 'Helixa Multipass claim management\n\nMultipass ID: mp_test';
  const signature = await account.signMessage({ message });

  const verifier = createEthereumPersonalSignatureVerifier({ client: null });

  assert.equal(await verifier({ wallet: account.address, message, signature }), true);
  assert.equal(await verifier({ wallet: '0x0000000000000000000000000000000000000001', message, signature }), false);
  assert.equal(await verifier({ wallet: account.address, message: `${message}!`, signature }), false);
  assert.equal(await verifier({ wallet: account.address, message, signature: '0xbad' }), false);
});

test('verifyEthereumPersonalSignature falls back to chain-aware smart wallet verification', async () => {
  const calls = [];
  const verifier = createEthereumPersonalSignatureVerifier({
    client: {
      verifyMessage: async (input) => {
        calls.push(input);
        return true;
      },
    },
  });
  const wallet = '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4';
  const message = 'Helixa Multipass claim management\n\nMultipass ID: mp_helixa_agent_81';
  const signature = `0x${'11'.repeat(65)}`;

  assert.equal(await verifier({ wallet, message, signature }), true);
  assert.deepEqual(calls, [{ address: wallet, message, signature }]);
});

test('default verifier is available for API wiring', () => {
  assert.equal(typeof verifyEthereumPersonalSignature, 'function');
});

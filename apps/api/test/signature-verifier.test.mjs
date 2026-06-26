import assert from 'node:assert/strict';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import { verifyEthereumPersonalSignature } from '../src/signature-verifier.js';

test('verifyEthereumPersonalSignature verifies an EVM personal_sign message', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f094538a7bcd1f0b03f82107863cfb2f99adc62c');
  const message = 'Helixa Multipass claim management\n\nMultipass ID: mp_test';
  const signature = await account.signMessage({ message });

  assert.equal(await verifyEthereumPersonalSignature({ wallet: account.address, message, signature }), true);
  assert.equal(await verifyEthereumPersonalSignature({ wallet: '0x0000000000000000000000000000000000000001', message, signature }), false);
  assert.equal(await verifyEthereumPersonalSignature({ wallet: account.address, message: `${message}!`, signature }), false);
  assert.equal(await verifyEthereumPersonalSignature({ wallet: account.address, message, signature: '0xbad' }), false);
});

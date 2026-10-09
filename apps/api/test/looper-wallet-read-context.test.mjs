import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLooperWalletReadContextLoader,
  deriveCanonicalLooperAccount,
} from '../src/looper-wallet-read-context.js';

const OWNER = '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4';
const IDENTITY = {
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  tokenId: '3802',
  owner: OWNER,
};

test('canonical server derivation matches the activated Looper #3802 account', () => {
  assert.equal(
    deriveCanonicalLooperAccount('3802'),
    '0xb9709b1cd4aDf02bBCA8ba7413d5Dfc8d8f31da4',
  );
});

test('wallet reader returns only owner-scoped read-only Base evidence', async () => {
  const calls = [];
  const client = {
    async getBalance({ address }) { calls.push(['native', address]); return 123n; },
    async getBytecode({ address }) { calls.push(['code', address]); return '0x6000'; },
    async readContract({ address, functionName, args }) {
      calls.push([functionName, address, args[0]]);
      if (functionName === 'stakes') return [4_500_000n, false, 6n, 0n, 0n, 0n, 0n, 681n, false];
      return 456n;
    },
  };
  const load = createLooperWalletReadContextLoader({ publicClients: [client, client], now: () => '2026-09-24T20:30:00.000Z' });
  const context = await load({ identity: IDENTITY, wallet: OWNER });

  assert.equal(context.scope.account, '0xb9709b1cd4aDf02bBCA8ba7413d5Dfc8d8f31da4');
  assert.equal(context.native.balanceWei, '123');
  assert.equal(context.tokens[0].symbol, 'CRED');
  assert.equal(context.tokens[0].balanceBaseUnits, '456');
  assert.deepEqual(context.staking.pantheonCred, {
    vault: '0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb',
    token: '0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3',
    principalBaseUnits: '4500000',
    lockMonths: '6',
    unstakeRequestTime: '0',
    stakeMonthIndex: '681',
  });
  assert.equal(context.health, 'verified');
  assert.deepEqual(context.capabilities, { read: true, sign: false, submit: false, approve: false });
  assert.equal(JSON.stringify(context).includes('calldata'), false);
  assert.ok(calls.length >= 8);
});

test('wallet reader rejects provider disagreement on Pantheon CRED principal', async () => {
  const client = (principal) => ({
    async getBalance() { return 123n; },
    async getBytecode() { return '0x6000'; },
    async readContract({ functionName }) {
      if (functionName === 'stakes') return [principal, false, 6n, 0n, 0n, 0n, 0n, 681n, false];
      return 456n;
    },
  });
  const load = createLooperWalletReadContextLoader({ publicClients: [client(4_500_000n), client(4_500_001n)] });
  await assert.rejects(load({ identity: IDENTITY, wallet: OWNER }), /Pantheon CRED position providers disagreed/i);
});

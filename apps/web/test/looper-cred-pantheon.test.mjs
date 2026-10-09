import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';

import { ACCOUNT_EXECUTE_ABI } from '../src/looper-agent-wallet.js';
import {
  CRED_ADDRESS,
  PANTHEON_STAKING_VAULT,
  buildCredStakeApprovalTransaction,
  buildCredStakeTransaction,
  createCredStakeDates,
  createCredStakeDatesFromMonthIndex,
  validatePantheonCredRegistry,
} from '../src/looper-cred-pantheon.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0x2222222222222222222222222222222222222222';
const AMOUNT = '4573170731707317073170731';

function registry(overrides = {}) {
  return {
    chain: 'base',
    chain_id: 8453,
    vault_address: PANTHEON_STAKING_VAULT,
    count: 1,
    tokens: [{
      token_address: CRED_ADDRESS,
      symbol: 'CRED',
      name: 'Cred Protocol',
      decimals: 18,
      active: true,
      reward_tokens: [{ address: CRED_ADDRESS, symbol: 'CRED', decimals: 18 }],
    }],
    ...overrides,
  };
}

test('validates one exact active CRED entry against pinned Base addresses', () => {
  const result = validatePantheonCredRegistry(registry());
  assert.deepEqual(result, {
    active: true,
    chainId: 8453,
    credAddress: CRED_ADDRESS,
    decimals: 18,
    registryPublished: true,
    rewardTokens: [{ address: CRED_ADDRESS, symbol: 'CRED', decimals: 18 }],
    vaultAddress: PANTHEON_STAKING_VAULT,
  });
});

test('accepts a pinned Base registry while CRED publication lags the active onchain pool', () => {
  const result = validatePantheonCredRegistry(registry({ count: 0, tokens: [] }));
  assert.deepEqual(result, {
    active: false,
    chainId: 8453,
    credAddress: CRED_ADDRESS,
    decimals: 18,
    registryPublished: false,
    rewardTokens: [],
    vaultAddress: PANTHEON_STAKING_VAULT,
  });
});

test('fails closed when CRED is inactive duplicated malformed or the vault drifts', () => {
  assert.throws(() => validatePantheonCredRegistry(registry({ count: 2, tokens: [registry().tokens[0], registry().tokens[0]] })), /exactly one/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ tokens: [{ ...registry().tokens[0], active: false }] })), /not active/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ count: 1, tokens: [null] })), /token 0.*malformed/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ count: 1, tokens: [{ token_address: 'not-an-address' }] })), /token 0.*malformed/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ count: 1, tokens: [] })), /count/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ vault_address: OWNER })), /vault/i);
  assert.throws(() => validatePantheonCredRegistry(registry({ chain_id: 1 })), /Base/i);
});

test('builds a zero-value Looper execute call for exact CRED approval', () => {
  const transaction = buildCredStakeApprovalTransaction({ owner: OWNER, account: ACCOUNT, amountBaseUnits: AMOUNT });
  assert.deepEqual({ chainId: transaction.chainId, from: transaction.from, to: transaction.to, value: transaction.value }, {
    chainId: '0x2105', from: OWNER, to: ACCOUNT, value: '0x0',
  });
  const outer = decodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, data: transaction.data });
  assert.equal(outer.functionName, 'execute');
  assert.equal(outer.args[0], CRED_ADDRESS);
  assert.equal(outer.args[1], 0n);
  assert.equal(outer.args[3], 0);
  assert.equal(outer.args[2].slice(0, 10), '0x095ea7b3');
  assert.equal(outer.args[2].slice(10, 74).toLowerCase(), PANTHEON_STAKING_VAULT.slice(2).toLowerCase().padStart(64, '0'));
  assert.equal(BigInt('0x' + outer.args[2].slice(74)), BigInt(AMOUNT));
});

test('builds a separate zero-value six-month Pantheon stake call', () => {
  const transaction = buildCredStakeTransaction({ owner: OWNER, account: ACCOUNT, amountBaseUnits: AMOUNT });
  const outer = decodeFunctionData({ abi: ACCOUNT_EXECUTE_ABI, data: transaction.data });
  assert.equal(outer.functionName, 'execute');
  assert.equal(outer.args[0], PANTHEON_STAKING_VAULT);
  assert.equal(outer.args[1], 0n);
  assert.equal(outer.args[3], 0);
  assert.equal(outer.args[2].slice(0, 10), '0x946debd5');
  assert.ok(outer.args[2].toLowerCase().includes(CRED_ADDRESS.slice(2).toLowerCase().padStart(64, '0')));
  assert.ok(outer.args[2].toLowerCase().endsWith('0'.repeat(64)));
});

test('derives calendar-month reward and lock dates in UTC', () => {
  const expected = {
    rewardsStart: '2026-11-01T00:00:00.000Z',
    firstClaim: '2026-12-01T00:00:00.000Z',
    lockEnds: '2027-05-01T00:00:00.000Z',
  };
  assert.deepEqual(createCredStakeDates(new Date('2026-10-08T22:57:00Z')), expected);
  assert.deepEqual(createCredStakeDatesFromMonthIndex('681'), expected);
});

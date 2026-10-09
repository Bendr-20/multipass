import { encodeFunctionData, getAddress, isAddress } from 'viem';

import { ACCOUNT_EXECUTE_ABI, BASE_CHAIN_ID } from './looper-agent-wallet.js';

export const CRED_ADDRESS = getAddress('0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3');
export const PANTHEON_STAKING_VAULT = getAddress('0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb');
export const PANTHEON_REGISTRY_URL = 'https://launch.pantheonvaults.com/api/skill/registry?chain=base';
export const PANTHEON_CRED_PAGE = `https://pantheonvaults.com/vaults/` + CRED_ADDRESS;
export const CRED_STAKE_LOCK_MONTHS = 6;

export const ERC20_STAKING_ABI = Object.freeze([
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: 'allowance', type: 'uint256' }],
  },
]);

export const PANTHEON_VIEW_ABI = Object.freeze([
  {
    type: 'function', name: 'pools', stateMutability: 'view',
    inputs: [{ name: 'stakingToken', type: 'address' }],
    outputs: [
      { name: 'active', type: 'bool' }, { name: 'cliffMonths', type: 'uint32' }, { name: 'totalStaked', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'stakes', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'stakingToken', type: 'address' }],
    outputs: [
      { name: 'amount', type: 'uint256' }, { name: 'autoRestake', type: 'bool' },
      { name: 'lockMonths', type: 'uint16' }, { name: 'lockDuration', type: 'uint32' },
      { name: 'stakeTime', type: 'uint32' }, { name: 'unstakeRequestTime', type: 'uint32' },
      { name: 'unstakeTime', type: 'uint32' }, { name: 'stakeMonthIndex', type: 'uint32' },
      { name: 'compounderEnabled', type: 'bool' },
    ],
  },
]);

export const PANTHEON_STAKING_ABI = Object.freeze([
  {
    type: 'function', name: 'stake', stateMutability: 'nonpayable',
    inputs: [
      { name: 'stakingToken', type: 'address' },
      { name: 'lockMonths', type: 'uint16' },
      { name: 'amount', type: 'uint256' },
      { name: 'autoCompound', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'addToStake', stateMutability: 'nonpayable',
    inputs: [
      { name: 'stakingToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
]);

export function validatePantheonCredRegistry(candidate) {
  if (!plainObject(candidate) || candidate.chain !== 'base' || candidate.chain_id !== BASE_CHAIN_ID) {
    throw new Error('Pantheon registry must identify Base chain 8453.');
  }
  if (!sameAddress(candidate.vault_address, PANTHEON_STAKING_VAULT)) {
    throw new Error('Pantheon registry vault does not match the pinned StakingVault.');
  }
  if (!Array.isArray(candidate.tokens) || candidate.tokens.length > 256) {
    throw new Error('Pantheon registry tokens are malformed.');
  }
  if (!Number.isInteger(candidate.count) || candidate.count !== candidate.tokens.length) {
    throw new Error('Pantheon registry token count is malformed.');
  }
  candidate.tokens.forEach((token, index) => {
    if (!plainObject(token) || !isAddress(token.token_address, { strict: false })) {
      throw new Error('Pantheon registry token ' + index + ' is malformed.');
    }
  });
  const matches = candidate.tokens.filter((token) => sameAddress(token.token_address, CRED_ADDRESS));
  if (matches.length > 1) throw new Error('Pantheon registry must contain exactly one CRED entry.');
  if (matches.length === 0) {
    return Object.freeze({
      active: false,
      chainId: BASE_CHAIN_ID,
      credAddress: CRED_ADDRESS,
      decimals: 18,
      registryPublished: false,
      rewardTokens: Object.freeze([]),
      vaultAddress: PANTHEON_STAKING_VAULT,
    });
  }
  const token = matches[0];
  if (token.active !== true) throw new Error('CRED staking is not active in the Pantheon registry.');
  if (token.decimals !== 18) throw new Error('Pantheon CRED decimals do not match the pinned token.');
  if (!Array.isArray(token.reward_tokens) || token.reward_tokens.length > 64) {
    throw new Error('Pantheon CRED reward tokens are malformed.');
  }
  const rewardTokens = token.reward_tokens.map((reward, index) => {
    if (!plainObject(reward) || !isAddress(reward.address, { strict: false })
      || typeof reward.symbol !== 'string' || reward.symbol.length < 1 || reward.symbol.length > 32
      || !Number.isInteger(reward.decimals) || reward.decimals < 0 || reward.decimals > 36) {
      throw new Error(`Pantheon reward token ` + index + ' is malformed.');
    }
    return Object.freeze({ address: getAddress(reward.address), symbol: reward.symbol, decimals: reward.decimals });
  });
  return Object.freeze({
    active: true,
    chainId: BASE_CHAIN_ID,
    credAddress: CRED_ADDRESS,
    decimals: 18,
    registryPublished: true,
    rewardTokens: Object.freeze(rewardTokens),
    vaultAddress: PANTHEON_STAKING_VAULT,
  });
}

export function buildCredStakeApprovalTransaction({ owner, account, amountBaseUnits }) {
  const amount = positiveUint(amountBaseUnits, 'CRED amount');
  return buildLooperExecute({
    owner,
    account,
    target: CRED_ADDRESS,
    data: encodeFunctionData({
      abi: ERC20_STAKING_ABI,
      functionName: 'approve',
      args: [PANTHEON_STAKING_VAULT, amount],
    }),
  });
}

export function buildCredStakeTransaction({ owner, account, amountBaseUnits }) {
  const amount = positiveUint(amountBaseUnits, 'CRED amount');
  return buildLooperExecute({
    owner,
    account,
    target: PANTHEON_STAKING_VAULT,
    data: encodeFunctionData({
      abi: PANTHEON_STAKING_ABI,
      functionName: 'stake',
      args: [CRED_ADDRESS, BigInt(CRED_STAKE_LOCK_MONTHS), amount, false],
    }),
  });
}

export function buildCredAddToStakeTransaction({ owner, account, amountBaseUnits }) {
  const amount = positiveUint(amountBaseUnits, 'CRED amount');
  return buildLooperExecute({
    owner,
    account,
    target: PANTHEON_STAKING_VAULT,
    data: encodeFunctionData({
      abi: PANTHEON_STAKING_ABI,
      functionName: 'addToStake',
      args: [CRED_ADDRESS, amount],
    }),
  });
}

export function isCredTopUpEligible(position = {}) {
  const amount = canonicalUintOrNull(position.stakeAmountBaseUnits);
  const stakeMonth = canonicalUintOrNull(position.stakeMonthIndex);
  const lockMonths = canonicalUintOrNull(position.lockMonths);
  const unstakeRequestTime = canonicalUintOrNull(position.unstakeRequestTime);
  const currentMonth = canonicalUintOrNull(position.currentMonthIndex);
  if (amount === null || amount === 0n || stakeMonth === null || lockMonths === null || lockMonths === 0n
    || unstakeRequestTime !== 0n || currentMonth === null) return false;
  const nextEarningMonth = currentMonth + 1n;
  const finalEarningMonth = stakeMonth + lockMonths;
  return nextEarningMonth <= finalEarningMonth;
}

export function isCredTopUpAttributed({
  stakeBaselineBaseUnits, amountBaseUnits, afterStakeAmountBaseUnits,
  stakeBaselineMonthIndex, afterStakeMonthIndex,
} = {}) {
  const baseline = canonicalUintOrNull(stakeBaselineBaseUnits);
  const added = canonicalUintOrNull(amountBaseUnits);
  const after = canonicalUintOrNull(afterStakeAmountBaseUnits);
  const baselineMonth = canonicalUintOrNull(stakeBaselineMonthIndex);
  const afterMonth = canonicalUintOrNull(afterStakeMonthIndex);
  return baseline !== null && baseline > 0n && added !== null && added > 0n && after !== null
    && baselineMonth !== null && afterMonth !== null
    && after === baseline + added && afterMonth === baselineMonth;
}

export function createCredStakeDates(now = new Date()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Stake date is invalid.');
  const monthIndex = (date.getUTCFullYear() - 1970) * 12 + date.getUTCMonth();
  return createCredStakeDatesFromMonthIndex(monthIndex);
}

export function createCredStakeDatesFromMonthIndex(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error('Stake month index is invalid.');
  const monthIndex = Number(text);
  if (!Number.isSafeInteger(monthIndex) || monthIndex > 120_000) throw new Error('Stake month index is invalid.');
  const month = Date.UTC(1970, monthIndex, 1);
  return Object.freeze({
    rewardsStart: new Date(addUtcMonths(month, 1)).toISOString(),
    firstClaim: new Date(addUtcMonths(month, 2)).toISOString(),
    lockEnds: new Date(addUtcMonths(month, 7)).toISOString(),
  });
}

function buildLooperExecute({ owner, account, target, data }) {
  return Object.freeze({
    chainId: '0x2105',
    from: checkedAddress(owner, 'owner'),
    to: checkedAddress(account, 'account'),
    value: '0x0',
    data: encodeFunctionData({
      abi: ACCOUNT_EXECUTE_ABI,
      functionName: 'execute',
      args: [checkedAddress(target, 'target'), 0n, data, 0],
    }),
  });
}

function positiveUint(value, label) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) throw new Error(label + ' must be a canonical positive integer.');
  const amount = BigInt(text);
  if (amount > ((1n << 256n) - 1n)) throw new Error(label + ' exceeds uint256.');
  return amount;
}

function canonicalUintOrNull(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^(0|[1-9]\d*)$/.test(text)) return null;
  try {
    const parsed = BigInt(text);
    return parsed <= ((1n << 256n) - 1n) ? parsed : null;
  } catch {
    return null;
  }
}

function checkedAddress(value, label) {
  if (!isAddress(value, { strict: false })) throw new Error(label + ' must be a valid address.');
  return getAddress(value);
}

function sameAddress(left, right) {
  return isAddress(left, { strict: false }) && isAddress(right, { strict: false })
    && getAddress(left) === getAddress(right);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function addUtcMonths(firstOfMonthMs, months) {
  const date = new Date(firstOfMonthMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  getCreate2Address,
  keccak256,
} from 'viem';

import {
  LOOPERS_MAINNET_CHAIN_ID,
  LOOPERS_MAINNET_CONTRACT,
} from './loopers-owned-agents.js';

const ERC6551_REGISTRY = getAddress('0x000000006551c19487814612e58FE06813775758');
const ACCOUNT_SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';
const RELEASED_ACCOUNT_IMPLEMENTATION = getAddress('0xf192f350427c8F58bC28e78b1e6Af164279F486e');
const CRED_TOKEN = Object.freeze({
  address: getAddress('0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3'),
  symbol: 'CRED',
  decimals: 18,
});
const PANTHEON_STAKING_VAULT = getAddress('0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb');
const CREATION_PREFIX = '0x3d60ad80600a3d3981f3';
const RUNTIME_PREFIX = '0x363d3d373d3d3d363d73';
const RUNTIME_SUFFIX = '0x5af43d82803e903d91602b57fd5bf3';
const ERC20_BALANCE_ABI = Object.freeze([{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: 'balance', type: 'uint256' }],
}]);
const PANTHEON_STAKE_ABI = Object.freeze([{
  type: 'function',
  name: 'stakes',
  stateMutability: 'view',
  inputs: [{ name: 'user', type: 'address' }, { name: 'stakingToken', type: 'address' }],
  outputs: [
    { name: 'amount', type: 'uint256' }, { name: 'autoRestake', type: 'bool' },
    { name: 'lockMonths', type: 'uint16' }, { name: 'lockDuration', type: 'uint32' },
    { name: 'stakeTime', type: 'uint32' }, { name: 'unstakeRequestTime', type: 'uint32' },
    { name: 'unstakeTime', type: 'uint32' }, { name: 'stakeMonthIndex', type: 'uint32' },
    { name: 'compounderEnabled', type: 'bool' },
  ],
}]);

export function deriveCanonicalLooperAccount(tokenId) {
  const normalizedTokenId = normalizeTokenId(tokenId);
  const footer = encodeAbiParameters(
    [
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    [ACCOUNT_SALT, BigInt(LOOPERS_MAINNET_CHAIN_ID), getAddress(LOOPERS_MAINNET_CONTRACT), normalizedTokenId],
  );
  const creationCode = concatHex([
    CREATION_PREFIX,
    RUNTIME_PREFIX,
    RELEASED_ACCOUNT_IMPLEMENTATION,
    RUNTIME_SUFFIX,
    footer,
  ]);
  return getCreate2Address({
    from: ERC6551_REGISTRY,
    salt: ACCOUNT_SALT,
    bytecodeHash: keccak256(creationCode),
  });
}

export function createLooperWalletReadContextLoader({ publicClients = [], now = () => new Date().toISOString() } = {}) {
  const clients = publicClients.filter(Boolean);
  if (!clients.length) throw new TypeError('Looper wallet reader requires at least one public client.');

  return async function loadLooperWalletReadContext({ identity, wallet }) {
    const tokenId = normalizeTokenId(identity?.tokenId).toString();
    const collection = getAddress(identity?.contract);
    const owner = getAddress(identity?.owner ?? wallet);
    const authenticatedWallet = getAddress(wallet);
    if (collection !== getAddress(LOOPERS_MAINNET_CONTRACT) || owner !== authenticatedWallet) {
      throw new Error('Looper wallet reader requires canonical owner-scoped identity evidence.');
    }
    const account = deriveCanonicalLooperAccount(tokenId);
    const [nativeWei, code, credBalance, credStake] = await Promise.all([
      readAgreed(clients, (client) => client.getBalance({ address: account, blockTag: 'latest' }), 'native balance'),
      readAgreed(clients, (client) => client.getBytecode({ address: account, blockTag: 'latest' }), 'account code'),
      readAgreed(clients, (client) => client.readContract({
        address: CRED_TOKEN.address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [account],
        blockTag: 'latest',
      }), 'CRED balance'),
      readAgreed(clients, (client) => client.readContract({
        address: PANTHEON_STAKING_VAULT,
        abi: PANTHEON_STAKE_ABI,
        functionName: 'stakes',
        args: [account, CRED_TOKEN.address],
        blockTag: 'latest',
      }), 'Pantheon CRED position'),
    ]);
    const tokens = BigInt(credBalance) > 0n
      ? [{
        address: CRED_TOKEN.address,
        symbol: CRED_TOKEN.symbol,
        decimals: CRED_TOKEN.decimals,
        balanceBaseUnits: BigInt(credBalance).toString(),
        metadataTrusted: true,
      }]
      : [];

    return Object.freeze({
      schema_version: '0.1.0',
      kind: 'looper_wallet_read_context',
      scope: {
        chainId: LOOPERS_MAINNET_CHAIN_ID,
        collection,
        tokenId,
        account,
        owner,
      },
      native: { symbol: 'ETH', balanceWei: BigInt(nativeWei).toString() },
      tokens,
      staking: {
        pantheonCred: {
          vault: PANTHEON_STAKING_VAULT,
          token: CRED_TOKEN.address,
          principalBaseUnits: BigInt(credStake[0]).toString(),
          lockMonths: BigInt(credStake[2]).toString(),
          unstakeRequestTime: BigInt(credStake[5]).toString(),
          stakeMonthIndex: BigInt(credStake[7]).toString(),
        },
      },
      activity: [],
      refreshedAt: String(now()),
      health: code && code !== '0x' ? 'verified' : 'degraded',
      capabilities: { read: true, sign: false, submit: false, approve: false },
    });
  };
}

async function readAgreed(clients, read, label) {
  const settled = await Promise.allSettled(clients.map(read));
  const values = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
  if (!values.length) throw new Error(`Looper wallet ${label} failed on every provider.`);
  const canonical = canonicalValue(values[0]);
  if (values.some((value) => canonicalValue(value) !== canonical)) {
    throw new Error(`Looper wallet ${label} providers disagreed.`);
  }
  return values[0];
}

function canonicalValue(value) {
  if (typeof value === 'bigint') return value.toString();
  return String(value ?? '').toLowerCase();
}

function normalizeTokenId(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) throw new Error('Looper token ID must be a canonical positive integer.');
  const tokenId = BigInt(text);
  if (tokenId > ((1n << 256n) - 1n)) throw new Error('Looper token ID exceeds uint256.');
  return tokenId;
}

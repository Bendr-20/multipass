import {
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
} from 'viem';

const BASE_CHAIN_ID = 8453;
const LOOPERS_COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const ERC6551_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
const ACCOUNT_SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';
const RELEASED_ACCOUNT_IMPLEMENTATION = '0xf192f350427c8F58bC28e78b1e6Af164279F486e';
const CREATION_PREFIX = '0x3d60ad80600a3d3981f3';
const RUNTIME_PREFIX = '0x363d3d373d3d3d363d73';
const RUNTIME_SUFFIX = '0x5af43d82803e903d91602b57fd5bf3';

export function deriveReleasedLooperAccount(tokenId) {
  const normalizedTokenId = normalizeTokenId(tokenId);
  const footer = encodeAbiParameters(
    [
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    [ACCOUNT_SALT, BigInt(BASE_CHAIN_ID), LOOPERS_COLLECTION, normalizedTokenId],
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
  }).toLowerCase();
}

function normalizeTokenId(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) throw new TypeError('Looper token ID must be a canonical positive integer.');
  const tokenId = BigInt(text);
  if (tokenId > ((1n << 256n) - 1n)) throw new TypeError('Looper token ID exceeds uint256.');
  return tokenId;
}

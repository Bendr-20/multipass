import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getCreate2Address,
  isAddress,
  keccak256,
} from 'viem';

export const BASE_CHAIN_ID = 8453;
export const LOOPERS_COLLECTION = getAddress('0x1649CD37f4748807b4882FC48765bA0B2aFfa94a');
export const ERC6551_REGISTRY = getAddress('0x000000006551c19487814612e58FE06813775758');
export const ACCOUNT_SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';
export const LEGACY_ACCOUNT_IMPLEMENTATION = getAddress('0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF');
export const RELEASED_ACCOUNT_IMPLEMENTATION = getAddress('0xf192f350427c8F58bC28e78b1e6Af164279F486e');
export const RELEASED_ACCOUNT_RUNTIME_SHA256 = '0x85adc244e07b43ac687b1ac9f4f245089678fa787adb4fdcb95d4402b0d8a43c';
export const REVIEWED_POLICY_ACCOUNT_IMPLEMENTATION = RELEASED_ACCOUNT_IMPLEMENTATION;
export const REVIEWED_POLICY_ACCOUNT_RUNTIME_BYTE_LENGTH = 6096;
export const REVIEWED_POLICY_ACCOUNT_RUNTIME_SHA256 = RELEASED_ACCOUNT_RUNTIME_SHA256;
export const REVIEWED_POLICY_MODULE_REGISTRY = getAddress('0x4e4df0DEa80e389802f819D95AAEe4CB004D3E1a');
export const REVIEWED_POLICY_MODULE_REGISTRY_RUNTIME_SHA256 = '0xc94fcea5df503e97852633cbe76e0ee76260595f3f25c2fdbbf99ef6aec253bb';
export const ZERO_ADDRESS = getAddress('0x0000000000000000000000000000000000000000');
export const BASE_EXPLORER = 'https://basescan.org';
export const CONFIGURED_TOKENS = Object.freeze([
  Object.freeze({
    address: getAddress('0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3'),
    symbol: 'CRED',
    decimals: 18,
  }),
]);

export const REGISTRY_ABI = Object.freeze([
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'implementation', type: 'address' },
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'account',
    stateMutability: 'view',
    inputs: [
      { name: 'implementation', type: 'address' },
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
]);

export const ACCOUNT_EXECUTE_ABI = Object.freeze([
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'state',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'state', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
  },
]);

export const ACCOUNT_POLICY_ABI = Object.freeze([
  ...['moduleRegistry', 'policyModule', 'policyModuleOwner'].map((name) => ({
    type: 'function', name, stateMutability: 'view', inputs: [], outputs: [{ name, type: 'address' }],
  })),
  {
    type: 'function', name: 'policyEpoch', stateMutability: 'view', inputs: [],
    outputs: [{ name: 'policyEpoch', type: 'uint256' }],
  },
  {
    type: 'function', name: 'setPolicyModule', stateMutability: 'nonpayable',
    inputs: [{ name: 'module', type: 'address' }], outputs: [],
  },
]);

export const MODULE_REGISTRY_ABI = Object.freeze([
  {
    type: 'function', name: 'globallyPaused', stateMutability: 'view', inputs: [],
    outputs: [{ name: 'globallyPaused', type: 'bool' }],
  },
  {
    type: 'function', name: 'approvedModuleCodehash', stateMutability: 'view',
    inputs: [{ name: 'module', type: 'address' }], outputs: [{ name: 'codehash', type: 'bytes32' }],
  },
]);

export const ERC20_ABI = Object.freeze([
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
]);

export const LOOPERS_ABI = Object.freeze([
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  ...['erc6551Registry', 'erc6551Implementation', 'erc6551Salt'].map((name) => ({
    type: 'function',
    name,
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: name === 'erc6551Salt' ? 'salt' : name, type: name === 'erc6551Salt' ? 'bytes32' : 'address' }],
  })),
  {
    type: 'function',
    name: 'tokenBoundAccount',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'setERC6551Config',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'implementation', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
]);

const CREATION_PREFIX = '0x3d60ad80600a3d3981f3';
const RUNTIME_PREFIX = '0x363d3d373d3d3d363d73';
const RUNTIME_SUFFIX = '0x5af43d82803e903d91602b57fd5bf3';

export function normalizeTokenId(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) throw new Error('Looper token ID must be a canonical positive integer.');
  const tokenId = BigInt(text);
  if (tokenId > ((1n << 256n) - 1n)) throw new Error('Looper token ID exceeds uint256.');
  return tokenId;
}

export function deriveLooperAccount({ implementation, tokenId }) {
  const normalizedImplementation = normalizeAddress(implementation, 'implementation');
  const normalizedTokenId = normalizeTokenId(tokenId);
  const footer = buildAccountFooter(normalizedTokenId);
  const creationCode = concatHex([
    CREATION_PREFIX,
    RUNTIME_PREFIX,
    normalizedImplementation,
    RUNTIME_SUFFIX,
    footer,
  ]);
  const createSalt = keccak256(encodeAbiParameters(
    [
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    [ACCOUNT_SALT, BigInt(BASE_CHAIN_ID), LOOPERS_COLLECTION, normalizedTokenId],
  ));
  return getCreate2Address({
    from: ERC6551_REGISTRY,
    salt: createSalt,
    bytecodeHash: keccak256(creationCode),
  });
}

export function buildLooperAccountRuntimeCode({ implementation, tokenId }) {
  const normalizedImplementation = normalizeAddress(implementation, 'implementation');
  const normalizedTokenId = normalizeTokenId(tokenId);
  return concatHex([
    RUNTIME_PREFIX,
    normalizedImplementation,
    RUNTIME_SUFFIX,
    buildAccountFooter(normalizedTokenId),
  ]).toLowerCase();
}

export function buildActivationTransaction({ owner, implementation, tokenId }) {
  const normalizedOwner = normalizeAddress(owner, 'owner');
  const normalizedImplementation = normalizeAddress(implementation, 'implementation');
  const normalizedTokenId = normalizeTokenId(tokenId);
  return Object.freeze({
    chainId: '0x2105',
    from: normalizedOwner,
    to: ERC6551_REGISTRY,
    value: '0x0',
    data: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'createAccount',
      args: [normalizedImplementation, ACCOUNT_SALT, BigInt(BASE_CHAIN_ID), LOOPERS_COLLECTION, normalizedTokenId],
    }),
  });
}

export function buildEthSendTransaction({ owner, account, recipient, amountWei }) {
  const normalizedOwner = normalizeAddress(owner, 'owner');
  const normalizedAccount = normalizeAddress(account, 'account');
  const normalizedRecipient = normalizeAddress(recipient, 'recipient');
  if (normalizedRecipient === normalizedAccount) throw new Error('Recipient cannot be the Looper account.');
  const amount = normalizePositiveInteger(amountWei, 'ETH amount');
  return buildExecuteTransaction({
    owner: normalizedOwner,
    account: normalizedAccount,
    to: normalizedRecipient,
    value: amount,
    data: '0x',
  });
}

export function buildErc20SendTransaction({ owner, account, token, recipient, amountBaseUnits }) {
  const normalizedOwner = normalizeAddress(owner, 'owner');
  const normalizedAccount = normalizeAddress(account, 'account');
  const normalizedToken = normalizeAddress(token, 'token');
  const normalizedRecipient = normalizeAddress(recipient, 'recipient');
  if (normalizedRecipient === normalizedAccount) throw new Error('Recipient cannot be the Looper account.');
  const amount = normalizePositiveInteger(amountBaseUnits, 'token amount');
  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [normalizedRecipient, amount],
  });
  return buildExecuteTransaction({
    owner: normalizedOwner,
    account: normalizedAccount,
    to: normalizedToken,
    value: 0n,
    data: transferData,
  });
}

export function buildPolicyModuleTransaction({ owner, account, module }) {
  return Object.freeze({
    chainId: '0x2105',
    from: normalizeAddress(owner, 'owner'),
    to: normalizeAddress(account, 'account'),
    value: '0x0',
    data: encodeFunctionData({
      abi: ACCOUNT_POLICY_ABI,
      functionName: 'setPolicyModule',
      args: [normalizeAddress(module, 'module')],
    }),
  });
}

export function createOperationScope({ tokenId, account, owner, kind }) {
  if (!['activation', 'send', 'policy'].includes(kind)) throw new Error('Unknown operation scope kind.');
  const scope = [
    BASE_CHAIN_ID,
    LOOPERS_COLLECTION.toLowerCase(),
    normalizeTokenId(tokenId).toString(),
    normalizeAddress(account, 'account').toLowerCase(),
    normalizeAddress(owner, 'owner').toLowerCase(),
  ].join(':');
  return Object.freeze({
    key: scope,
    storageKey: `multipass.looperWallet.${kind}.${scope}`,
    lockName: `multipass-looper-wallet-${kind}:${scope}`,
  });
}

function buildExecuteTransaction({ owner, account, to, value, data }) {
  return Object.freeze({
    chainId: '0x2105',
    from: owner,
    to: account,
    value: '0x0',
    data: encodeFunctionData({
      abi: ACCOUNT_EXECUTE_ABI,
      functionName: 'execute',
      args: [to, value, data, 0],
    }),
  });
}

function buildAccountFooter(tokenId) {
  return encodeAbiParameters(
    [
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    [ACCOUNT_SALT, BigInt(BASE_CHAIN_ID), LOOPERS_COLLECTION, tokenId],
  );
}

function normalizePositiveInteger(value, label) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} must be a canonical positive integer.`);
  const amount = BigInt(text);
  if (amount > ((1n << 256n) - 1n)) throw new Error(`${label} exceeds uint256.`);
  return amount;
}

function normalizeAddress(value, label) {
  if (!isAddress(value, { strict: false })) throw new Error(`${label} must be a valid address.`);
  return getAddress(value);
}

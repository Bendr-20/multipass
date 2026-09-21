'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const UINT256_MAX = (1n << 256n) - 1n;

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function hexToBytes(value) {
    if (typeof value !== 'string' || !HEX_BYTES.test(value)) throw new TypeError('Expected lowercase even-length 0x hex bytes.');
    const bytes = new Uint8Array((value.length - 2) / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
    return bytes;
  }

  function bytesToHex(value) {
    if (!(value instanceof Uint8Array)) throw new TypeError('Expected Uint8Array bytes.');
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  function parseQuantity(value) {
    if (typeof value !== 'string' || !QUANTITY.test(value)) throw new TypeError('Expected canonical lowercase hex quantity.');
    return BigInt(value);
  }

  function toUint256(value, label = 'uint256') {
    let integer;
    if (typeof value === 'bigint') integer = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) integer = BigInt(value);
    else if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value)) integer = BigInt(value);
    else throw new TypeError(`${label} must be a nonnegative integer.`);
    if (integer < 0n || integer > UINT256_MAX) throw new RangeError(`${label} is outside uint256.`);
    return integer;
  }

  function canonicalQuantity(value) {
    return `0x${toUint256(value, 'quantity').toString(16)}`;
  }

  function uint256Word(value) {
    return toUint256(value).toString(16).padStart(64, '0');
  }

  function addressWord(value) {
    if (typeof value !== 'string' || !ADDRESS.test(value)) throw new TypeError('Expected a 20-byte address.');
    return value.slice(2).toLowerCase().padStart(64, '0');
  }

  function exactWord(value, label) {
    const bytes = hexToBytes(value);
    if (bytes.length !== 32) throw new TypeError(`${label} must have exact ABI word length.`);
    return value.slice(2);
  }

  function decodeUint256(value) {
    return BigInt(`0x${exactWord(value, 'uint256')}`);
  }

  function decodeAddress(value) {
    const word = exactWord(value, 'address');
    if (!/^0{24}[0-9a-f]{40}$/u.test(word)) throw new TypeError('Address has nonzero high bytes.');
    return `0x${word.slice(24)}`;
  }

  function decodeBool(value) {
    const word = exactWord(value, 'bool');
    if (word === '0'.repeat(64)) return false;
    if (word === `${'0'.repeat(63)}1`) return true;
    throw new TypeError('Malformed ABI bool.');
  }

  function decodeBytes32(value) {
    exactWord(value, 'bytes32');
    return value;
  }

  function decodeString(value) {
    const bytes = hexToBytes(value);
    if (bytes.length < 64 || bytes.length % 32 !== 0) throw new TypeError('ABI string has invalid length or truncation.');
    const offset = decodeUint256(`0x${value.slice(2, 66)}`);
    if (offset !== 32n) throw new TypeError('ABI string has a noncanonical offset.');
    const length = decodeUint256(`0x${value.slice(66, 130)}`);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError('ABI string length is unsafe.');
    const count = Number(length);
    const padded = Math.ceil(count / 32) * 32;
    if (bytes.length !== 64 + padded) throw new TypeError('ABI string has truncation or trailing bytes.');
    for (const byte of bytes.slice(64 + count)) if (byte !== 0) throw new TypeError('ABI string has nonzero padding.');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(64, 64 + count));
    } catch {
      throw new TypeError('ABI string is not valid UTF-8.');
    }
  }

  function decodeBinding(value) {
    const bytes = hexToBytes(value);
    if (bytes.length !== 96) throw new TypeError('Binding result must be exactly three ABI words.');
    const words = [0, 1, 2].map((index) => `0x${value.slice(2 + index * 64, 66 + index * 64)}`);
    const standard = decodeUint256(words[0]);
    if (standard > 255n) throw new TypeError('Binding standard is outside uint8.');
    return deepFreeze({ standard: Number(standard), tokenContract: decodeAddress(words[1]), tokenId: decodeUint256(words[2]).toString(10) });
  }

  async function sha256Hex(value) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', hexToBytes(value));
    return bytesToHex(new Uint8Array(digest));
  }

  const identities = {
    loopers: { address: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', bytes: 177, sha256: '0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662', implementationSlot: '0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908' },
    loopersImplementation: { address: '0x68F22e3563891167D37C86391c4a83449c83e908', bytes: 23210, sha256: '0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec', implementationSlot: null },
    registry: { address: '0x000000006551c19487814612e58FE06813775758', bytes: 571, sha256: '0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56', implementationSlot: null },
    accountImplementation: { address: '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF', bytes: 685, sha256: '0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5', implementationSlot: null },
    adapter: { address: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27', bytes: 163, sha256: '0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017', implementationSlot: '0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9' },
    adapterImplementation: { address: '0x0f81bd4EDD4879734361A1A44460264CBf6F94c9', bytes: 12732, sha256: '0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be', implementationSlot: null },
    identityRegistry: { address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', bytes: 130, sha256: '0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85', implementationSlot: '0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02' },
    identityRegistryImplementation: { address: '0x7274e874CA62410a93Bd8bf61c69d8045E399c02', bytes: 14474, sha256: '0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1', implementationSlot: null },
    sponsor: { address: '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE', bytes: 23, sha256: '0xe2b8058ebac7d6b7f1496596a6508894891adab1c1ef9712a4a5d50ff32e5267', implementationSlot: '0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72' },
    sponsorDelegate: { address: '0x7702cb554e6bFb442cb743A7dF23154544a7176C', bytes: 3318, sha256: '0x97497b31483a21567c1c520851c6e8e65e6ce906dc9236843668a21c3cd691e3', implementationSlot: null },
    sponsorImplementation: { address: '0x000100abaad02f1cfC8Bbe32bD5a564817339E72', bytes: 18002, sha256: '0xa7dba5dc36ffc7d92796b2d17cd61f4e89d7ace44ff953def7e39e444c278bfa', implementationSlot: null },
    entryPoint: { address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', bytes: 23689, sha256: '0x009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c', implementationSlot: null },
  };

  const PINSET = deepFreeze({
    chainId: 8453,
    chainIdHex: '0x2105',
    tokenId: '3802',
    holder: '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4',
    account: '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    salt: '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee',
    identityId: '90994',
    identityIdHex: '0x16372',
    identityUri: 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json',
    sponsorDesignator: '0xef01007702cb554e6bfb442cb743a7df23154544a7176c',
    eip1967Slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    storageKey: 'loopers.walletActivation.8453.3802.v1',
    lockName: 'loopers.walletActivation.8453.3802.submit.v1',
    gasCap: 150000,
    identities,
  });

  const RPC_ORIGINS = deepFreeze(['https://mainnet.base.org', 'https://base.drpc.org', 'https://base-rpc.publicnode.com']);
  const SELECTORS = deepFreeze({
    owner: '0x8da5cb5b', ownerOf: '0x6352211e', erc6551Registry: '0x056d5afe',
    erc6551Implementation: '0xb3dd12a2', erc6551Salt: '0x0df783f8', tokenBoundAccount: '0x0be76ed6',
    registryAccount: '0x246a0021', erc8004BoundByLooper: '0x5adbbdce', erc8004AgentIdByLooper: '0x4c4a2696',
    erc8004AgentURI: '0xf195e791', identityRegistry: '0x134e18f4', bindingOf: '0x4d69ebc2',
    isController: '0x158e711d', tokenURI: '0xc87b56dd', sponsorImplementation: '0x5c60da1b',
    sponsorEntryPoint: '0xb0d691fe', accountToken: '0xfc0c546a', accountOwner: '0x8da5cb5b',
    accountState: '0xc19d93fb', accountIsValidSigner: '0x523e3260', execute: '0xb61d27f6',
    executeBatch: '0x34fcd5be', executeWithoutChainIdValidation: '0x2c2abd1e', handleOps: '0x1fad948c',
    getUserOpHash: '0xa6193531', createAccount: '0x8a54c52f',
  });
  const TOPICS = deepFreeze({
    erc6551AccountCreated: '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722',
    userOperationEvent: '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f',
  });

  const idWord = uint256Word(PINSET.identityId);
  const tokenWord = uint256Word(PINSET.tokenId);
  const EXACT_CALLDATA = `${SELECTORS.createAccount}${addressWord(identities.accountImplementation.address)}${PINSET.salt.slice(2)}${uint256Word(PINSET.chainId)}${addressWord(identities.loopers.address)}${tokenWord}`;
  const EXACT_CALLDATA_HASH = '0xa6b969253d21114fb839051bbdff1b46a66a0427e181eabee4bf0dd1ccf02def';
  const EXPECTED_ACCOUNT_RUNTIME = `0x363d3d373d3d3d363d73${identities.accountImplementation.address.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3${PINSET.salt.slice(2)}${uint256Word(PINSET.chainId)}${addressWord(identities.loopers.address)}${tokenWord}`;
  const EXPECTED_ACCOUNT_RUNTIME_SHA256 = '0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a';
  const EXACT_TRANSACTION = deepFreeze({ chainId: PINSET.chainIdHex, from: identities.sponsor.address, to: identities.registry.address, data: EXACT_CALLDATA, value: '0x0' });

  const uriResult = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004968747470733a2f2f617277656176652e6e65742f7743304c364c525f494773535f53674151467253626e7a736a566741624f6c775a63565f6c6272705f76382f333830322e6a736f6e0000000000000000000000000000000000000000000000';
  const CALLS = deepFreeze({
    loopersOwner: { target: identities.loopers.address, calldata: SELECTORS.owner, result: `0x${addressWord(identities.sponsor.address)}` },
    loopersRegistry: { target: identities.loopers.address, calldata: SELECTORS.erc6551Registry, result: `0x${addressWord(identities.registry.address)}` },
    loopersAccountImplementation: { target: identities.loopers.address, calldata: SELECTORS.erc6551Implementation, result: `0x${addressWord(identities.accountImplementation.address)}` },
    loopersSalt: { target: identities.loopers.address, calldata: SELECTORS.erc6551Salt, result: PINSET.salt },
    loopersOwnerOf: { target: identities.loopers.address, calldata: `${SELECTORS.ownerOf}${tokenWord}`, result: `0x${addressWord(PINSET.holder)}` },
    loopersTokenBoundAccount: { target: identities.loopers.address, calldata: `${SELECTORS.tokenBoundAccount}${tokenWord}`, result: `0x${addressWord(PINSET.account)}` },
    registryAccount: { target: identities.registry.address, calldata: `${SELECTORS.registryAccount}${addressWord(identities.accountImplementation.address)}${PINSET.salt.slice(2)}${uint256Word(PINSET.chainId)}${addressWord(identities.loopers.address)}${tokenWord}`, result: `0x${addressWord(PINSET.account)}` },
    loopersBound: { target: identities.loopers.address, calldata: `${SELECTORS.erc8004BoundByLooper}${tokenWord}`, result: `0x${uint256Word(1)}` },
    loopersIdentityId: { target: identities.loopers.address, calldata: `${SELECTORS.erc8004AgentIdByLooper}${tokenWord}`, result: `0x${idWord}` },
    loopersIdentityUri: { target: identities.loopers.address, calldata: `${SELECTORS.erc8004AgentURI}${tokenWord}`, result: uriResult },
    adapterIdentityRegistry: { target: identities.adapter.address, calldata: SELECTORS.identityRegistry, result: `0x${addressWord(identities.identityRegistry.address)}` },
    adapterBinding: { target: identities.adapter.address, calldata: `${SELECTORS.bindingOf}${idWord}`, result: `0x${uint256Word(0)}${addressWord(identities.loopers.address)}${tokenWord}` },
    adapterController: { target: identities.adapter.address, calldata: `${SELECTORS.isController}${idWord}${addressWord(PINSET.holder)}`, result: `0x${uint256Word(1)}` },
    identityOwner: { target: identities.identityRegistry.address, calldata: `${SELECTORS.ownerOf}${idWord}`, result: `0x${addressWord(identities.adapter.address)}` },
    identityTokenUri: { target: identities.identityRegistry.address, calldata: `${SELECTORS.tokenURI}${idWord}`, result: uriResult },
    sponsorImplementation: { target: identities.sponsor.address, calldata: SELECTORS.sponsorImplementation, result: `0x${addressWord(identities.sponsorImplementation.address)}` },
    sponsorEntryPoint: { target: identities.sponsor.address, calldata: SELECTORS.sponsorEntryPoint, result: `0x${addressWord(identities.entryPoint.address)}` },
  });

  function validateExactTransaction(transaction) {
    if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) throw new TypeError('Activation transaction must be an object.');
    const expectedKeys = Object.keys(EXACT_TRANSACTION);
    const keys = Object.keys(transaction);
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) throw new TypeError('Activation transaction keys are not exact.');
    for (const key of expectedKeys) if (transaction[key] !== EXACT_TRANSACTION[key]) throw new TypeError(`Activation transaction ${key} is not exact.`);
    return true;
  }

  function keccak256Hex() {
    throw new Error('not implemented');
  }

  function hashUserOperationV06() {
    throw new Error('not implemented');
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({
    deepFreeze, hexToBytes, bytesToHex, parseQuantity, canonicalQuantity, uint256Word, addressWord,
    decodeUint256, decodeAddress, decodeBool, decodeBytes32, decodeString, decodeBinding, sha256Hex,
    PINSET, RPC_ORIGINS, SELECTORS, TOPICS, CALLS, EXACT_CALLDATA, EXACT_CALLDATA_HASH,
    EXPECTED_ACCOUNT_RUNTIME, EXPECTED_ACCOUNT_RUNTIME_SHA256, EXACT_TRANSACTION,
    validateExactTransaction, keccak256Hex, hashUserOperationV06,
  }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();

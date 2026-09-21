'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');

  const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/u;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
  const UINT256_MAX = (1n << 256n) - 1n;

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return Object.freeze(value);
  }

  function hexToBytes(value) {
    if (typeof value !== 'string' || !HEX_BYTES.test(value)) throw new TypeError('Expected lowercase even-length 0x hex bytes.');
    const bytes = new Uint8Array((value.length - 2) / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
    }
    return bytes;
  }

  function bytesToHex(value) {
    if (!(value instanceof Uint8Array)) throw new TypeError('Expected Uint8Array bytes.');
    return '0x' + Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function toUint256(value) {
    let integer;
    if (typeof value === 'bigint') integer = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) integer = BigInt(value);
    else if (typeof value === 'string' && DECIMAL.test(value)) integer = BigInt(value);
    else throw new TypeError('uint256 must be a canonical safe nonnegative integer.');
    if (integer < 0n || integer > UINT256_MAX) throw new RangeError('uint256 is outside range.');
    return integer;
  }

  function uint256Word(value) {
    return toUint256(value).toString(16).padStart(64, '0');
  }

  function addressWord(value) {
    if (typeof value !== 'string' || !ADDRESS.test(value)) throw new TypeError('Expected a 20-byte address.');
    return value.slice(2).toLowerCase().padStart(64, '0');
  }

  function decodeAddress(value) {
    const bytes = hexToBytes(value);
    if (bytes.length !== 32) throw new TypeError('Address word must be exactly 32 bytes.');
    const word = value.slice(2);
    if (!/^0{24}[0-9a-f]{40}$/u.test(word)) throw new TypeError('Address word has nonzero high bytes.');
    return '0x' + word.slice(24);
  }

  const SHA256_INITIAL = Object.freeze([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const SHA256_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const rotateRight32 = (value, amount) => (value >>> amount) | (value << (32 - amount));

  async function sha256Hex(value) {
    const input = hexToBytes(value);
    const bitLength = BigInt(input.length) * 8n;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(input);
    padded[input.length] = 0x80;
    for (let index = 0; index < 8; index += 1) padded[padded.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
    const hash = [...SHA256_INITIAL];
    const words = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const at = offset + index * 4;
        words[index] = ((padded[at] << 24) | (padded[at + 1] << 16) | (padded[at + 2] << 8) | padded[at + 3]) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const x = words[index - 15];
        const y = words[index - 2];
        const sigma0 = rotateRight32(x, 7) ^ rotateRight32(x, 18) ^ (x >>> 3);
        const sigma1 = rotateRight32(y, 17) ^ rotateRight32(y, 19) ^ (y >>> 10);
        words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index += 1) {
        const sum1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
        const choice = (e & f) ^ (~e & g);
        const first = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
        const sum0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const second = (sum0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
      }
      hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
      hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
    }
    return '0x' + hash.map((word) => word.toString(16).padStart(8, '0')).join('');
  }

  const EXPECTED = deepFreeze({
  "chainId": 8453,
  "chainLabel": "Base",
  "tokenId": "3802",
  "account": "0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38",
  "holderAtActivation": "0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4",
  "profilePath": "/multipass/loopers/3802",
  "erc6551": {
    "registry": "0x000000006551c19487814612e58FE06813775758",
    "implementation": "0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF",
    "salt": "0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee",
    "runtimeBytes": 173,
    "runtime": "0x363d3d373d3d3d363d731e3787bc9b2e6d7763de1dccf10e9d062f3b43bf5af43d82803e903d91602b57fd5bf3ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda",
    "runtimeSha256": "0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a"
  },
  "contracts": {
    "loopersProxy": {
      "address": "0x1649CD37f4748807b4882FC48765bA0B2aFfa94a",
      "runtimeBytes": 177,
      "runtimeSha256": "0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662",
      "implementationSlot": "0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908"
    },
    "loopersImplementation": {
      "address": "0x68F22e3563891167D37C86391c4a83449c83e908",
      "runtimeBytes": 23210,
      "runtimeSha256": "0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec",
      "implementationSlot": null
    },
    "erc6551Registry": {
      "address": "0x000000006551c19487814612e58FE06813775758",
      "runtimeBytes": 571,
      "runtimeSha256": "0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56",
      "implementationSlot": null
    },
    "erc6551Implementation": {
      "address": "0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF",
      "runtimeBytes": 685,
      "runtimeSha256": "0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5",
      "implementationSlot": null
    },
    "adapter8004Proxy": {
      "address": "0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27",
      "runtimeBytes": 163,
      "runtimeSha256": "0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017",
      "implementationSlot": "0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9"
    },
    "adapter8004Implementation": {
      "address": "0x0f81bd4EDD4879734361A1A44460264CBf6F94c9",
      "runtimeBytes": 12732,
      "runtimeSha256": "0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be",
      "implementationSlot": null
    },
    "identityRegistryProxy": {
      "address": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      "runtimeBytes": 130,
      "runtimeSha256": "0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85",
      "implementationSlot": "0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02"
    },
    "identityRegistryImplementation": {
      "address": "0x7274e874CA62410a93Bd8bf61c69d8045E399c02",
      "runtimeBytes": 14474,
      "runtimeSha256": "0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1",
      "implementationSlot": null
    }
  },
  "erc8004": {
    "identityId": "90994",
    "identityUri": "https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json",
    "adapter": "0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27",
    "identityRegistry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  },
  "activation": {
    "transactionHash": "0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c",
    "blockNumber": "0x3132ee6",
    "blockHash": "0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1",
    "transactionIndex": "0x56",
    "receiptStatus": "0x1",
    "event": {
      "address": "0x000000006551c19487814612e58FE06813775758",
      "logIndex": "0x106",
      "transactionHash": "0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c",
      "blockNumber": "0x3132ee6",
      "blockHash": "0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1",
      "transactionIndex": "0x56",
      "topic0": "0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722",
      "topics": [
        "0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722",
        "0x0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bf",
        "0x0000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a",
        "0x0000000000000000000000000000000000000000000000000000000000000eda"
      ],
      "data": "0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee0000000000000000000000000000000000000000000000000000000000002105",
      "removed": false,
      "decoded": {
        "account": "0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38",
        "implementation": "0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF",
        "salt": "0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee",
        "chainId": 8453,
        "tokenContract": "0x1649CD37f4748807b4882FC48765bA0B2aFfa94a",
        "tokenId": "3802"
      }
    }
  },
  "content": {
    "name": "Looper #3802",
    "collection": "Loopers",
    "tagline": "A Looper with its own onchain account",
    "seoTitle": "Looper #3802 Multipass | Helixa",
    "seoDescription": "Public onchain wallet and identity profile for Looper #3802",
    "artworkUrl": "https://3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq.arweave.net/3ZwkzgHeRr0Chw14FzKmwZf54fyHi6d0KVOZQprgq50",
    "metadataUri": "https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json",
    "agentClass": "Mercenary / Fixer",
    "secondaryClass": "Trader / Broker",
    "specialization": "dealflow operator",
    "voice": "slow verdicts, heavy pauses, no panic"
  },
  "urls": {
    "canonicalProfile": "https://helixa.xyz/multipass/loopers/3802",
    "blockscoutAccount": "https://base.blockscout.com/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38",
    "blockscoutErc20Holdings": "https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-20",
    "blockscoutNftHoldings": "https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-721%2CERC-1155",
    "baseScanAccount": "https://basescan.org/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38",
    "baseScanActivation": "https://basescan.org/tx/0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c",
    "baseScanToken": "https://basescan.org/token/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a?a=3802",
    "openSea": "https://opensea.io/assets/base/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a/3802"
  }
});
  const ADDRESS_PATHS = new Set([
    'account', 'holderAtActivation', 'erc6551.registry', 'erc6551.implementation',
    'contracts.loopersProxy.address', 'contracts.loopersImplementation.address',
    'contracts.erc6551Registry.address', 'contracts.erc6551Implementation.address',
    'contracts.adapter8004Proxy.address', 'contracts.adapter8004Implementation.address',
    'contracts.identityRegistryProxy.address', 'contracts.identityRegistryImplementation.address',
    'erc8004.adapter', 'erc8004.identityRegistry', 'activation.event.address',
    'activation.event.decoded.account', 'activation.event.decoded.implementation',
    'activation.event.decoded.tokenContract',
  ]);
  const QUANTITY_PATHS = new Set([
    'activation.blockNumber', 'activation.transactionIndex',
    'activation.receiptStatus', 'activation.event.logIndex',
    'activation.event.blockNumber', 'activation.event.transactionIndex',
  ]);
  const DECIMAL_PATHS = new Set(['tokenId', 'erc8004.identityId', 'activation.event.decoded.tokenId']);

  function assertCanonicalLeaf(candidate, expectedValue, path) {
    const label = path.join('.');
    if (typeof candidate !== typeof expectedValue) throw new TypeError(label + ' has the wrong type.');
    if (typeof candidate === 'number' && !Number.isSafeInteger(candidate)) throw new TypeError(label + ' must be a safe integer.');
    if (typeof candidate !== 'string') return;
    if (ADDRESS_PATHS.has(label)) {
      if (!ADDRESS.test(candidate)) throw new TypeError(label + ' must be a 20-byte address.');
      return;
    }
    if (QUANTITY_PATHS.has(label)) {
      if (!QUANTITY.test(candidate)) throw new TypeError(label + ' must be a canonical lowercase quantity.');
      return;
    }
    if (DECIMAL_PATHS.has(label)) {
      if (!DECIMAL.test(candidate)) throw new TypeError(label + ' must be a canonical decimal integer.');
      return;
    }
    if (label === 'profilePath') {
      if (!/^\/multipass\/loopers\/[1-9][0-9]*$/u.test(candidate)) throw new TypeError('profilePath must be canonical.');
      return;
    }
    if (expectedValue.startsWith('https://')) {
      if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]*)?\/[^\s\\#]*$/u.test(candidate) || candidate.includes('@')) {
        throw new TypeError(label + ' must be a canonical HTTPS URL.');
      }
      return;
    }
    if (expectedValue.startsWith('0x') && !HEX_BYTES.test(candidate)) {
      throw new TypeError(label + ' must be lowercase even-length bytes.');
    }
  }

  function normalizeExact(candidate, expectedValue, path = [], ancestors = new WeakSet()) {
    if (!expectedValue || typeof expectedValue !== 'object') {
      assertCanonicalLeaf(candidate, expectedValue, path);
      if (candidate !== expectedValue) throw new TypeError(path.join('.') + ' differs from the exact Looper 3802 pin.');
      return candidate;
    }
    if (!candidate || typeof candidate !== 'object') throw new TypeError(path.join('.') + ' must be an object or array.');
    if (ancestors.has(candidate)) throw new TypeError(path.join('.') + ' must not contain cycles.');
    ancestors.add(candidate);
    try {
      if (Array.isArray(expectedValue)) {
        if (!Array.isArray(candidate) || candidate.length !== expectedValue.length) throw new TypeError(path.join('.') + ' array length is not exact.');
        return candidate.map((child, index) => normalizeExact(child, expectedValue[index], [...path, String(index)], ancestors));
      }
      if (Array.isArray(candidate) || Object.prototype.toString.call(candidate) !== '[object Object]') {
        throw new TypeError(path.join('.') + ' must be a plain object.');
      }
      const expectedKeys = Object.keys(expectedValue);
      const candidateKeys = Reflect.ownKeys(candidate);
      if (candidateKeys.length !== expectedKeys.length || candidateKeys.some((key) => typeof key !== 'string' || !Object.hasOwn(expectedValue, key))) {
        throw new TypeError(path.join('.') + ' keys are not exact; unknown or missing fields are forbidden.');
      }
      const normalized = {};
      for (const key of expectedKeys) {
        if (!Object.hasOwn(candidate, key)) throw new TypeError([...path, key].join('.') + ' is missing.');
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError([...path, key].join('.') + ' must be plain data.');
        normalized[key] = normalizeExact(candidate[key], expectedValue[key], [...path, key], ancestors);
      }
      return normalized;
    } finally {
      ancestors.delete(candidate);
    }
  }

  function validateManifest(candidate) {
    return deepFreeze(normalizeExact(candidate, EXPECTED));
  }

  const api = {
    validateManifest,
    deepFreeze,
    hexToBytes,
    bytesToHex,
    addressWord,
    decodeAddress,
    uint256Word,
    sha256Hex,
  };
  for (const key of Object.keys(api)) {
    if (Object.prototype.hasOwnProperty.call(ns, key)) throw new Error(key + ' is already registered.');
  }
  Object.defineProperties(ns, Object.fromEntries(Object.entries(api).map(([key, value]) => [key, {
    value,
    enumerable: true,
    writable: false,
    configurable: false,
  }])));
})();

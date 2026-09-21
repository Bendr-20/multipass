'use strict';

(() => {
  const ns = globalThis.LooperMultipassProfile;
  if (!ns || Object.getPrototypeOf(ns) !== null) throw new Error('LooperMultipassProfile namespace is not registered.');

  const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/u;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
  const HTTPS_URL = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]*)?\/[^\s\\#]*$/u;
  const UINT256_MAX = (1n << 256n) - 1n;

  function sameOwnKeys(left, right) {
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
  }

  function intrinsicConstructorName(prototype, name) {
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') return false;
    const nameDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, 'name');
    return Boolean(nameDescriptor && Object.hasOwn(nameDescriptor, 'value') && nameDescriptor.value === name);
  }

  function isIntrinsicObjectPrototype(prototype) {
    return Boolean(
      prototype
      && Object.getPrototypeOf(prototype) === null
      && sameOwnKeys(prototype, Object.prototype)
      && intrinsicConstructorName(prototype, 'Object')
    );
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && isIntrinsicObjectPrototype(Object.getPrototypeOf(value)));
  }

  function isPlainArray(value) {
    if (!Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return Boolean(
      prototype
      && isIntrinsicObjectPrototype(Object.getPrototypeOf(prototype))
      && sameOwnKeys(prototype, Array.prototype)
      && intrinsicConstructorName(prototype, 'Array')
    );
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    if (!isPlainObject(value) && !isPlainArray(value)) throw new TypeError('Deep-freeze values must use intrinsic prototypes.');
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Deep-freeze values must use own plain data properties.');
      deepFreeze(descriptor.value, seen);
    }
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

  function sha256Bytes(input) {
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

  async function sha256Hex(value) {
    return sha256Bytes(hexToBytes(value));
  }

  const CODE_PIN_SCHEMA = deepFreeze({
    address: 'address',
    runtimeBytes: 'positiveSafeInteger',
    runtimeSha256: 'hash',
    implementationSlot: 'nullableHash',
  });
  const MANIFEST_SCHEMA = deepFreeze({
    chainId: 'positiveSafeInteger',
    chainLabel: 'string',
    tokenId: 'decimal',
    account: 'address',
    holderAtActivation: 'address',
    profilePath: 'profilePath',
    erc6551: {
      registry: 'address',
      implementation: 'address',
      salt: 'hash',
      runtimeBytes: 'positiveSafeInteger',
      runtime: 'bytes',
      runtimeSha256: 'hash',
    },
    contracts: {
      loopersProxy: CODE_PIN_SCHEMA,
      loopersImplementation: CODE_PIN_SCHEMA,
      erc6551Registry: CODE_PIN_SCHEMA,
      erc6551Implementation: CODE_PIN_SCHEMA,
      adapter8004Proxy: CODE_PIN_SCHEMA,
      adapter8004Implementation: CODE_PIN_SCHEMA,
      identityRegistryProxy: CODE_PIN_SCHEMA,
      identityRegistryImplementation: CODE_PIN_SCHEMA,
    },
    erc8004: {
      identityId: 'decimal',
      identityUri: 'httpsUrl',
      adapter: 'address',
      identityRegistry: 'address',
    },
    activation: {
      transactionHash: 'hash',
      blockNumber: 'quantity',
      blockHash: 'hash',
      transactionIndex: 'quantity',
      receiptStatus: 'quantity',
      event: {
        address: 'address',
        logIndex: 'quantity',
        transactionHash: 'hash',
        blockNumber: 'quantity',
        blockHash: 'hash',
        transactionIndex: 'quantity',
        topic0: 'hash',
        topics: ['hash', 'hash', 'hash', 'hash'],
        data: 'bytes',
        removed: 'boolean',
        decoded: {
          account: 'address',
          implementation: 'address',
          salt: 'hash',
          chainId: 'positiveSafeInteger',
          tokenContract: 'address',
          tokenId: 'decimal',
        },
      },
    },
    content: {
      name: 'string',
      collection: 'string',
      tagline: 'string',
      seoTitle: 'string',
      seoDescription: 'string',
      artworkUrl: 'httpsUrl',
      metadataUri: 'httpsUrl',
      agentClass: 'string',
      secondaryClass: 'string',
      specialization: 'string',
      voice: 'string',
    },
    urls: {
      canonicalProfile: 'httpsUrl',
      blockscoutAccount: 'httpsUrl',
      blockscoutErc20Holdings: 'httpsUrl',
      blockscoutNftHoldings: 'httpsUrl',
      baseScanAccount: 'httpsUrl',
      baseScanActivation: 'httpsUrl',
      baseScanToken: 'httpsUrl',
      openSea: 'httpsUrl',
    },
  });

  function validateLeaf(value, type, label) {
    if (type === 'boolean') {
      if (typeof value !== 'boolean') throw new TypeError(label + ' must be a boolean.');
      return;
    }
    if (type === 'positiveSafeInteger') {
      if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(label + ' must be a positive safe integer.');
      return;
    }
    if (type === 'nullableHash' && value === null) return;
    if (typeof value !== 'string') throw new TypeError(label + ' has the wrong type.');
    if (type === 'string' && value.length === 0) throw new TypeError(label + ' must not be empty.');
    else if (type === 'decimal' && !DECIMAL.test(value)) throw new TypeError(label + ' must be a canonical decimal integer.');
    else if (type === 'address' && !ADDRESS.test(value)) throw new TypeError(label + ' must be a 20-byte address.');
    else if ((type === 'hash' || type === 'nullableHash') && !HASH.test(value)) throw new TypeError(label + ' must be a lowercase 32-byte hash.');
    else if (type === 'quantity' && !QUANTITY.test(value)) throw new TypeError(label + ' must be a canonical lowercase quantity.');
    else if (type === 'bytes' && !HEX_BYTES.test(value)) throw new TypeError(label + ' must be lowercase even-length bytes.');
    else if (type === 'profilePath' && !/^\/multipass\/loopers\/[1-9][0-9]*$/u.test(value)) throw new TypeError(label + ' must be a canonical profile path.');
    else if (type === 'httpsUrl' && (!HTTPS_URL.test(value) || value.includes('@'))) throw new TypeError(label + ' must be a canonical HTTPS URL.');
  }

  function normalizeBySchema(candidate, schema, path = [], ancestors = new WeakSet()) {
    const label = path.join('.') || 'manifest';
    if (typeof schema === 'string') {
      validateLeaf(candidate, schema, label);
      return candidate;
    }
    if (!candidate || typeof candidate !== 'object') throw new TypeError(label + ' must be an object or array.');
    if (ancestors.has(candidate)) throw new TypeError(label + ' must not contain cycles.');
    ancestors.add(candidate);
    try {
      if (Array.isArray(schema)) {
        if (!isPlainArray(candidate)) throw new TypeError(label + ' must use the intrinsic array prototype.');
        if (candidate.length !== schema.length) throw new TypeError(label + ' array length is not exact.');
        const schemaKeys = Reflect.ownKeys(schema);
        const candidateKeys = Reflect.ownKeys(candidate);
        if (candidateKeys.length !== schemaKeys.length || candidateKeys.some((key, index) => key !== schemaKeys[index])) {
          throw new TypeError(label + ' array keys are not exact.');
        }
        const normalized = [];
        for (let index = 0; index < schema.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
            throw new TypeError([...path, String(index)].join('.') + ' must be a plain data element.');
          }
          normalized.push(normalizeBySchema(descriptor.value, schema[index], [...path, String(index)], ancestors));
        }
        return normalized;
      }
      if (!isPlainObject(candidate)) throw new TypeError(label + ' must use the intrinsic plain object prototype.');
      const schemaKeys = Reflect.ownKeys(schema);
      const candidateKeys = Reflect.ownKeys(candidate);
      if (candidateKeys.length !== schemaKeys.length || candidateKeys.some((key) => typeof key !== 'string' || !Object.hasOwn(schema, key))) {
        throw new TypeError(label + ' keys are not exact; unknown or missing fields are forbidden.');
      }
      const normalized = {};
      for (const key of schemaKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
          throw new TypeError([...path, key].join('.') + ' must be an own plain data field.');
        }
        normalized[key] = normalizeBySchema(descriptor.value, schema[key], [...path, key], ancestors);
      }
      return normalized;
    } finally {
      ancestors.delete(candidate);
    }
  }

  function assertEqual(actual, expected, label) {
    if (actual !== expected) throw new TypeError(label + ' is internally inconsistent.');
  }

  function validateRelationships(manifest) {
    const { activation, contracts, content, erc6551, erc8004, urls } = manifest;
    const event = activation.event;
    assertEqual(manifest.profilePath, '/multipass/loopers/' + manifest.tokenId, 'profilePath');
    assertEqual(content.name, 'Looper #' + manifest.tokenId, 'content.name');
    assertEqual(erc6551.registry, contracts.erc6551Registry.address, 'erc6551.registry');
    assertEqual(erc6551.implementation, contracts.erc6551Implementation.address, 'erc6551.implementation');
    assertEqual(erc8004.adapter, contracts.adapter8004Proxy.address, 'erc8004.adapter');
    assertEqual(erc8004.identityRegistry, contracts.identityRegistryProxy.address, 'erc8004.identityRegistry');
    assertEqual(content.metadataUri, erc8004.identityUri, 'content.metadataUri');
    assertEqual(event.address, erc6551.registry, 'activation.event.address');
    assertEqual(event.transactionHash, activation.transactionHash, 'activation.event.transactionHash');
    assertEqual(event.blockNumber, activation.blockNumber, 'activation.event.blockNumber');
    assertEqual(event.blockHash, activation.blockHash, 'activation.event.blockHash');
    assertEqual(event.transactionIndex, activation.transactionIndex, 'activation.event.transactionIndex');
    assertEqual(event.topic0, event.topics[0], 'activation.event.topic0');
    assertEqual(event.decoded.account, manifest.account, 'activation.event.decoded.account');
    assertEqual(event.decoded.implementation, erc6551.implementation, 'activation.event.decoded.implementation');
    assertEqual(event.decoded.salt, erc6551.salt, 'activation.event.decoded.salt');
    assertEqual(event.decoded.chainId, manifest.chainId, 'activation.event.decoded.chainId');
    assertEqual(event.decoded.tokenContract, contracts.loopersProxy.address, 'activation.event.decoded.tokenContract');
    assertEqual(event.decoded.tokenId, manifest.tokenId, 'activation.event.decoded.tokenId');

    const runtime = '0x363d3d373d3d3d363d73'
      + erc6551.implementation.slice(2).toLowerCase()
      + '5af43d82803e903d91602b57fd5bf3'
      + erc6551.salt.slice(2)
      + uint256Word(manifest.chainId)
      + addressWord(contracts.loopersProxy.address)
      + uint256Word(manifest.tokenId);
    assertEqual(erc6551.runtime, runtime, 'erc6551.runtime');
    assertEqual(hexToBytes(erc6551.runtime).length, erc6551.runtimeBytes, 'erc6551.runtimeBytes');
    assertEqual(sha256Bytes(hexToBytes(erc6551.runtime)), erc6551.runtimeSha256, 'erc6551.runtimeSha256');

    assertEqual(event.topics[1], '0x' + addressWord(erc6551.implementation), 'activation.event.topics[1]');
    assertEqual(event.topics[2], '0x' + addressWord(contracts.loopersProxy.address), 'activation.event.topics[2]');
    assertEqual(event.topics[3], '0x' + uint256Word(manifest.tokenId), 'activation.event.topics[3]');
    const eventData = '0x' + addressWord(manifest.account) + erc6551.salt.slice(2) + uint256Word(manifest.chainId);
    assertEqual(event.data, eventData, 'activation.event.data');

    assertEqual(urls.canonicalProfile, 'https://helixa.xyz' + manifest.profilePath, 'urls.canonicalProfile');
    assertEqual(urls.blockscoutAccount, 'https://base.blockscout.com/address/' + manifest.account, 'urls.blockscoutAccount');
    assertEqual(urls.blockscoutErc20Holdings, 'https://base.blockscout.com/api/v2/addresses/' + manifest.account + '/tokens?type=ERC-20', 'urls.blockscoutErc20Holdings');
    assertEqual(urls.blockscoutNftHoldings, 'https://base.blockscout.com/api/v2/addresses/' + manifest.account + '/tokens?type=ERC-721%2CERC-1155', 'urls.blockscoutNftHoldings');
    assertEqual(urls.baseScanAccount, 'https://basescan.org/address/' + manifest.account, 'urls.baseScanAccount');
    assertEqual(urls.baseScanActivation, 'https://basescan.org/tx/' + activation.transactionHash, 'urls.baseScanActivation');
    assertEqual(urls.baseScanToken, 'https://basescan.org/token/' + contracts.loopersProxy.address + '?a=' + manifest.tokenId, 'urls.baseScanToken');
    assertEqual(urls.openSea, 'https://opensea.io/assets/base/' + contracts.loopersProxy.address + '/' + manifest.tokenId, 'urls.openSea');
  }

  function validateManifest(candidate, profileLock) {
    if (typeof profileLock !== 'string' || !HASH.test(profileLock)) throw new TypeError('Manifest lock must be a lowercase SHA-256 digest.');
    const normalized = normalizeBySchema(candidate, MANIFEST_SCHEMA);
    validateRelationships(normalized);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(normalized));
    if (sha256Bytes(canonicalBytes) !== profileLock) throw new TypeError('Manifest differs from its exact profile lock digest.');
    return deepFreeze(normalized);
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

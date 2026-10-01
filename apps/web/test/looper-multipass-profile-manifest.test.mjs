import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const manifestPath = path.join(webRoot, 'public-profiles/loopers/manifests/3802.js');
const namespacePath = path.join(webRoot, 'public-profiles/loopers/src/00-namespace.js');
const codecsPath = path.join(webRoot, 'public-profiles/loopers/src/01-manifest-codecs.js');
const profileSourceRoot = path.join(webRoot, 'public-profiles/loopers/src');
const profileTemplatePath = path.join(webRoot, 'public-profiles/loopers/index.template.html');
const profileGeneratedPath = path.join(webRoot, 'public-profiles/loopers/3802/index.html');
const builderPath = path.join(webRoot, 'scripts/build-looper-multipass-profiles.mjs');
const activationSourceRoot = path.join(webRoot, 'owner-tools/activate-looper-3802/src');

const manifestModule = await import(pathToFileURL(manifestPath));
const manifest = manifestModule.default;
const manifestLock = manifestModule.MANIFEST_LOCK;

function sha256Oracle(hex) {
  return `0x${createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex')}`;
}

function utf8Hex(value) {
  return `0x${Buffer.from(value, 'utf8').toString('hex')}`;
}

function patternedHex(length) {
  return `0x${Buffer.from(Array.from({ length }, (_, index) => (index * 131 + 17) & 0xff)).toString('hex')}`;
}

let browserUnitsPromise;
async function loadBrowserUnits() {
  browserUnitsPromise ??= (async () => {
    const [namespaceSource, codecsSource] = await Promise.all([
      readFile(namespacePath, 'utf8'),
      readFile(codecsPath, 'utf8'),
    ]);
    vm.runInThisContext(namespaceSource, { filename: namespacePath });
    vm.runInThisContext(codecsSource, { filename: codecsPath });
    return { context: globalThis, namespaceSource, codecsSource, unit: globalThis.LooperMultipassProfile };
  })();
  return browserUnitsPromise;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRecursivelyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child, seen);
}

function leafPaths(value, prefix = []) {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
}

function mutateLeaf(value) {
  if (typeof value === 'string') return `${value}x`;
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (value === null) return 'not-null';
  throw new TypeError(`No leaf mutation for ${typeof value}`);
}

function valueAt(root, keys) {
  return keys.reduce((value, key) => value[key], root);
}

function setAt(root, keys, value) {
  const parent = keys.slice(0, -1).reduce((current, key) => current[key], root);
  parent[keys.at(-1)] = value;
}

test('exports one recursively frozen plain Looper 3802 manifest and its profile-owned canonical lock', () => {
  assert.deepEqual(Object.keys(manifestModule), ['MANIFEST_LOCK', 'default']);
  assert.equal(Object.getPrototypeOf(manifest), Object.prototype);
  assertRecursivelyFrozen(manifest);
  const canonicalHex = utf8Hex(JSON.stringify(manifest));
  assert.equal(manifestLock, sha256Oracle(canonicalHex));
  assert.match(manifestLock, /^0x[0-9a-f]{64}$/u);
});

test('pins the exact Looper 3802 identity, ERC-6551 runtime, contracts, and ERC-8004 identity', async () => {
  assert.equal(manifest.chainId, 8453);
  assert.equal(manifest.chainLabel, 'Base');
  assert.equal(manifest.tokenId, '3802');
  assert.equal(manifest.account, '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38');
  assert.equal(manifest.holderAtActivation, '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4');
  assert.equal(manifest.profilePath, '/multipass/loopers/3802');

  assert.equal(manifest.erc6551.registry, '0x000000006551c19487814612e58FE06813775758');
  assert.equal(manifest.erc6551.implementation, '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF');
  assert.equal(manifest.erc6551.salt, '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee');
  assert.equal(manifest.erc6551.runtimeBytes, 173);
  assert.equal(manifest.erc6551.runtime, '0x363d3d373d3d3d363d731e3787bc9b2e6d7763de1dccf10e9d062f3b43bf5af43d82803e903d91602b57fd5bf3ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda');
  assert.equal(manifest.erc6551.runtimeSha256, '0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a');

  assert.deepEqual(manifest.contracts, {
    loopersProxy: { address: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', runtimeBytes: 177, runtimeSha256: '0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662', implementationSlot: '0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908' },
    loopersImplementation: { address: '0x68F22e3563891167D37C86391c4a83449c83e908', runtimeBytes: 23210, runtimeSha256: '0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec', implementationSlot: null },
    erc6551Registry: { address: '0x000000006551c19487814612e58FE06813775758', runtimeBytes: 571, runtimeSha256: '0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56', implementationSlot: null },
    erc6551Implementation: { address: '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF', runtimeBytes: 685, runtimeSha256: '0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5', implementationSlot: null },
    adapter8004Proxy: { address: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27', runtimeBytes: 163, runtimeSha256: '0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017', implementationSlot: '0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9' },
    adapter8004Implementation: { address: '0x0f81bd4EDD4879734361A1A44460264CBf6F94c9', runtimeBytes: 12732, runtimeSha256: '0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be', implementationSlot: null },
    identityRegistryProxy: { address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', runtimeBytes: 130, runtimeSha256: '0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85', implementationSlot: '0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02' },
    identityRegistryImplementation: { address: '0x7274e874CA62410a93Bd8bf61c69d8045E399c02', runtimeBytes: 14474, runtimeSha256: '0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1', implementationSlot: null },
  });

  assert.deepEqual(manifest.erc8004, {
    identityId: '90994',
    identityUri: 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json',
    adapter: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  });

  const { unit } = await loadBrowserUnits();
  assert.equal(unit.hexToBytes(manifest.erc6551.runtime).length, 173);
  assert.equal(await unit.sha256Hex(manifest.erc6551.runtime), manifest.erc6551.runtimeSha256);
});

test('pins the exact activation transaction, block, receipt, log, and decoded event', () => {
  assert.deepEqual(manifest.activation, {
    transactionHash: '0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c',
    blockNumber: '0x3132ee6',
    blockHash: '0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1',
    transactionIndex: '0x56',
    receiptStatus: '0x1',
    event: {
      address: '0x000000006551c19487814612e58FE06813775758',
      logIndex: '0x106',
      transactionHash: '0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c',
      blockNumber: '0x3132ee6',
      blockHash: '0xd8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1',
      transactionIndex: '0x56',
      topic0: '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722',
      topics: [
        '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722',
        '0x0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bf',
        '0x0000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a',
        '0x0000000000000000000000000000000000000000000000000000000000000eda',
      ],
      data: '0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee0000000000000000000000000000000000000000000000000000000000002105',
      removed: false,
      decoded: {
        account: '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
        implementation: '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF',
        salt: '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee',
        chainId: 8453,
        tokenContract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
        tokenId: '3802',
      },
    },
  });
});

test('pins the exact public content, final artwork, Blockscout, explorer, and OpenSea URLs', () => {
  assert.deepEqual(manifest.content, {
    name: 'Looper #3802',
    collection: 'Loopers',
    tagline: 'A Looper with its own onchain account',
    seoTitle: 'Looper #3802 Multipass | Helixa',
    seoDescription: 'Public onchain wallet and identity profile for Looper #3802',
    artworkUrl: 'https://3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq.arweave.net/3ZwkzgHeRr0Chw14FzKmwZf54fyHi6d0KVOZQprgq50',
    metadataUri: 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json',
    agentClass: 'Mercenary / Fixer',
    secondaryClass: 'Trader / Broker',
    specialization: 'dealflow operator',
    voice: 'slow verdicts, heavy pauses, no panic',
  });
  assert.equal(/verified|active wallet/iu.test(manifest.content.seoDescription), false);
  assert.deepEqual(manifest.urls, {
    canonicalProfile: 'https://helixa.xyz/multipass/loopers/3802',
    blockscoutAccount: 'https://base.blockscout.com/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    blockscoutErc20Holdings: 'https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-20',
    blockscoutNftHoldings: 'https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-721%2CERC-1155',
    baseScanAccount: 'https://basescan.org/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    baseScanActivation: 'https://basescan.org/tx/0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c',
    baseScanToken: 'https://basescan.org/token/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a?a=3802',
    openSea: 'https://opensea.io/assets/base/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a/3802',
  });
});

test('validates only the exact manifest and returns a recursively frozen normalized clone', async () => {
  const { unit } = await loadBrowserUnits();
  const candidate = clone(manifest);
  assert.throws(() => unit.validateManifest(candidate), /lock/iu);
  const validated = unit.validateManifest(candidate, manifestLock);
  assert.deepEqual(clone(validated), candidate);
  assert.notEqual(validated, candidate);
  assertRecursivelyFrozen(validated);

  const extraTop = clone(manifest);
  extraTop.unexpected = true;
  assert.throws(() => unit.validateManifest(extraTop, manifestLock), /unknown|keys|exact/iu);

  const extraNested = clone(manifest);
  extraNested.activation.event.unexpected = true;
  assert.throws(() => unit.validateManifest(extraNested, manifestLock), /unknown|keys|exact/iu);

  const hiddenExtra = clone(manifest);
  Object.defineProperty(hiddenExtra, 'hidden', { value: true });
  assert.throws(() => unit.validateManifest(hiddenExtra, manifestLock), /unknown|keys|exact/iu);

  const symbolExtra = clone(manifest);
  symbolExtra[Symbol('unexpected')] = true;
  assert.throws(() => unit.validateManifest(symbolExtra, manifestLock), /unknown|keys|exact/iu);

  const missing = clone(manifest);
  delete missing.contracts.adapter8004Proxy.runtimeSha256;
  assert.throws(() => unit.validateManifest(missing, manifestLock), /missing|keys|exact/iu);

  for (const keys of leafPaths(manifest)) {
    const changed = clone(manifest);
    setAt(changed, keys, mutateLeaf(valueAt(changed, keys)));
    assert.throws(
      () => unit.validateManifest(changed, manifestLock),
      undefined,
      `accepted drift at ${keys.join('.')}`,
    );
  }
});

test('keeps exact profile drift rejection in the profile-owned lock instead of codec literals', async () => {
  const { codecsSource, unit } = await loadBrowserUnits();
  const changedProfile = clone(manifest);
  changedProfile.content.voice = 'compact future-profile voice';
  const changedLock = sha256Oracle(utf8Hex(JSON.stringify(changedProfile)));

  assert.throws(() => unit.validateManifest(changedProfile, manifestLock), /lock|digest|exact/iu);
  assert.doesNotThrow(() => unit.validateManifest(changedProfile, changedLock));
  assert.doesNotMatch(codecsSource, /88a30C57|26408e5614af|90994|f711d4661ab1/iu);
});

test('rejects sparse arrays, extra own keys, symbols, and accessor-backed array values', async () => {
  const { unit } = await loadBrowserUnits();
  const malformedTopics = [
    (topics) => { delete topics[1]; },
    (topics) => { topics.extra = true; },
    (topics) => { Object.defineProperty(topics, 'hidden', { value: true }); },
    (topics) => { topics[Symbol('unexpected')] = true; },
    (topics) => {
      const value = topics[1];
      Object.defineProperty(topics, '1', { enumerable: true, configurable: true, get: () => value });
    },
    (topics) => { Object.defineProperty(topics, 'extra', { enumerable: true, get: () => true }); },
  ];

  for (const mutate of malformedTopics) {
    const candidate = clone(manifest);
    mutate(candidate.activation.event.topics);
    assert.throws(() => unit.validateManifest(candidate, manifestLock), /array|keys|plain data|exact/iu);
  }

  assert.doesNotThrow(() => unit.validateManifest(manifest, manifestLock));
});

test('rejects custom prototypes and object accessors without invoking getters', async () => {
  const { codecsSource, unit } = await loadBrowserUnits();
  let getterTrips = 0;

  const accessorField = clone(manifest);
  Object.defineProperty(accessorField, 'chainId', {
    enumerable: true,
    get() { getterTrips += 1; return manifest.chainId; },
  });
  assert.throws(() => unit.validateManifest(accessorField, manifestLock), /plain data|accessor/iu);
  assert.equal(getterTrips, 0);

  const extraAccessor = clone(manifest);
  Object.defineProperty(extraAccessor, 'unexpected', {
    enumerable: true,
    get() { getterTrips += 1; return true; },
  });
  assert.throws(() => unit.validateManifest(extraAccessor, manifestLock), /keys|exact/iu);
  assert.equal(getterTrips, 0);

  const inherited = clone(manifest);
  const inheritedPrototype = {};
  Object.defineProperty(inheritedPrototype, 'unexpected', {
    get() { getterTrips += 1; return true; },
  });
  Object.setPrototypeOf(inherited, inheritedPrototype);
  assert.throws(() => unit.validateManifest(inherited, manifestLock), /prototype|plain object/iu);
  assert.equal(getterTrips, 0);

  const proxiedPrototypeCandidate = clone(manifest);
  let prototypeTrapCalls = 0;
  const proxiedPrototype = new Proxy(Object.prototype, {
    getPrototypeOf(target) { prototypeTrapCalls += 1; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { prototypeTrapCalls += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { prototypeTrapCalls += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  Object.setPrototypeOf(proxiedPrototypeCandidate, proxiedPrototype);
  assert.throws(() => unit.validateManifest(proxiedPrototypeCandidate, manifestLock), /prototype|plain object/iu);
  assert.equal(prototypeTrapCalls, 0);

  const structuralPrototypeCandidate = clone(manifest);
  const structuralPrototype = Object.create(null);
  Object.defineProperties(structuralPrototype, Object.getOwnPropertyDescriptors(Object.prototype));
  Object.setPrototypeOf(structuralPrototypeCandidate, structuralPrototype);
  assert.throws(() => unit.validateManifest(structuralPrototypeCandidate, manifestLock), /prototype|plain object/iu);

  const nullPrototype = clone(manifest);
  Object.setPrototypeOf(nullPrototype, null);
  assert.throws(() => unit.validateManifest(nullPrototype, manifestLock), /prototype|plain object/iu);

  const tagged = clone(manifest);
  Object.defineProperty(tagged, Symbol.toStringTag, {
    get() { getterTrips += 1; return 'Object'; },
  });
  assert.throws(() => unit.validateManifest(tagged, manifestLock), /keys|prototype|plain object/iu);
  assert.equal(getterTrips, 0);

  const customArray = clone(manifest);
  Object.setPrototypeOf(customArray.activation.event.topics, Object.create(Array.prototype));
  assert.throws(() => unit.validateManifest(customArray, manifestLock), /prototype|array/iu);

  const freezeAccessor = {};
  Object.defineProperty(freezeAccessor, 'secret', {
    enumerable: true,
    get() { getterTrips += 1; return 'never'; },
  });
  assert.throws(() => unit.deepFreeze(freezeAccessor), /plain data|accessor/iu);
  assert.equal(getterTrips, 0);

  const manifestSource = await readFile(manifestPath, 'utf8');
  for (const source of [manifestSource, codecsSource]) {
    assert.doesNotMatch(source, /Object\.values/u);
    assert.doesNotMatch(source, /Object\.prototype\.toString\.call/u);
  }
});

test('rejects malformed and noncanonical manifest data before accepting any pin', async () => {
  const { unit } = await loadBrowserUnits();
  const cases = [
    ['unsafe integer', ['chainId'], Number.MAX_SAFE_INTEGER + 1],
    ['unsafe byte length', ['contracts', 'loopersProxy', 'runtimeBytes'], Number.MAX_SAFE_INTEGER + 1],
    ['leading-zero token', ['tokenId'], '03802'],
    ['leading-zero identity', ['erc8004', 'identityId'], '090994'],
    ['noncanonical quantity', ['activation', 'blockNumber'], '0x03132ee6'],
    ['uppercase byte string', ['activation', 'blockHash'], '0xD8f0a523075a77026a68e096354ec3165d8605fc6c62b4b84de84c93c78f43f1'],
    ['odd byte string', ['erc6551', 'runtime'], '0x0'],
    ['malformed address', ['account'], '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a3'],
    ['noncanonical address', ['account'], '0x88a30c57f5780f1a8112e6b486b5bfbe89ac9a38'],
    ['non-HTTPS URL', ['content', 'artworkUrl'], 'http://example.com/art.png'],
    ['URL credentials', ['urls', 'canonicalProfile'], 'https://user@example.com/multipass/loopers/3802'],
    ['route drift', ['profilePath'], '/multipass/loopers/3802/'],
  ];
  for (const [label, keys, value] of cases) {
    const candidate = clone(manifest);
    setAt(candidate, keys, value);
    assert.throws(() => unit.validateManifest(candidate, manifestLock), undefined, label);
  }
});

test('exposes strict pure hex, address, uint256, and SHA-256 helpers', async () => {
  const { unit } = await loadBrowserUnits();
  assert.deepEqual(Array.from(unit.hexToBytes('0x00ff10')), [0, 255, 16]);
  assert.equal(unit.bytesToHex(new Uint8Array([0, 255, 16])), '0x00ff10');
  assert.throws(() => unit.hexToBytes('0x0'), /even|hex/iu);
  assert.throws(() => unit.hexToBytes('0xAA'), /lowercase|hex/iu);
  assert.throws(() => unit.bytesToHex([0]), /Uint8Array/iu);

  assert.equal(unit.addressWord(manifest.account), '00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38');
  assert.equal(unit.decodeAddress('0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38'), manifest.account.toLowerCase());
  assert.throws(() => unit.decodeAddress('0x01000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38'), /high|address/iu);
  assert.equal(unit.uint256Word('3802'), '0000000000000000000000000000000000000000000000000000000000000eda');
  assert.throws(() => unit.uint256Word('03802'), /canonical|integer/iu);
  assert.throws(() => unit.uint256Word(Number.MAX_SAFE_INTEGER + 1), /safe|integer/iu);
  assert.throws(() => unit.uint256Word(-1), /integer|uint256/iu);
  assert.equal(await unit.sha256Hex(manifest.erc6551.runtime), manifest.erc6551.runtimeSha256);
});

test('matches independent Node SHA-256 oracles across NIST and padding-boundary vectors', async () => {
  const { unit } = await loadBrowserUnits();
  const nist = [
    ['0x', '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    [utf8Hex('abc'), '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [utf8Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '0x248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ];
  for (const [hex, expected] of nist) {
    assert.equal(sha256Oracle(hex), expected);
    assert.equal(await unit.sha256Hex(hex), expected);
  }

  for (const length of [55, 56, 63, 64, 65, 130, 163, 173, 177, 571, 685, 12732, 14474, 23210]) {
    const hex = patternedHex(length);
    assert.equal(await unit.sha256Hex(hex), sha256Oracle(hex), `SHA-256 mismatch at ${length} bytes`);
  }
});

test('classic units expose one fail-fast namespace boundary and no browser side effects', async () => {
  const { context, namespaceSource, codecsSource, unit } = await loadBrowserUnits();
  const descriptor = Object.getOwnPropertyDescriptor(context, 'LooperMultipassProfile');
  assert.deepEqual(
    { enumerable: descriptor.enumerable, writable: descriptor.writable, configurable: descriptor.configurable },
    { enumerable: false, writable: false, configurable: false },
  );
  assert.equal(Object.getPrototypeOf(unit), null);

  const duplicateContext = vm.createContext({ TextDecoder, TextEncoder, Uint8Array });
  vm.runInContext(namespaceSource, duplicateContext, { filename: namespacePath });
  assert.throws(() => vm.runInContext(namespaceSource, duplicateContext), /already|namespace|registered/iu);
  vm.runInContext(codecsSource, duplicateContext, { filename: codecsPath });
  assert.throws(() => vm.runInContext(codecsSource, duplicateContext), /already|registered|property/iu);

  for (const source of [namespaceSource, codecsSource]) {
    assert.doesNotMatch(source, /\b(?:import|export)\b/u);
    assert.doesNotMatch(source, /\b(?:document|window|fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|ethereum)\b/u);
  }
});

let builderModulePromise;
function loadBuilder() {
  builderModulePromise ??= import(pathToFileURL(builderPath));
  return builderModulePromise;
}

function extractSingle(html, expression, label) {
  const matches = [...html.matchAll(expression)];
  assert.equal(matches.length, 1, `${label} count`);
  return matches[0][1];
}

function cspHash(body) {
  return `'sha256-${createHash('sha256').update(Buffer.from(body, 'utf8')).digest('base64')}'`;
}

async function withTemporaryWebTree(run) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'looper-profile-builder-'));
  const temporaryWebRoot = path.join(temporaryRoot, 'apps/web');
  try {
    await mkdir(path.join(temporaryWebRoot, 'public-profiles'), { recursive: true });
    await cp(path.join(webRoot, 'public-profiles/loopers'), path.join(temporaryWebRoot, 'public-profiles/loopers'), { recursive: true });
    await mkdir(path.join(temporaryWebRoot, 'owner-tools/activate-looper-3802'), { recursive: true });
    await cp(activationSourceRoot, path.join(temporaryWebRoot, 'owner-tools/activate-looper-3802/src'), { recursive: true });
    await run(temporaryWebRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function writeManifestModule(temporaryWebRoot, candidate) {
  const target = path.join(temporaryWebRoot, 'public-profiles/loopers/manifests/3802.js');
  const original = await readFile(target, 'utf8');
  const prefix = original.slice(0, original.indexOf('const manifest ='));
  const lock = sha256Oracle(utf8Hex(JSON.stringify(candidate)));
  await writeFile(target, `${prefix}const manifest = ${JSON.stringify(candidate, null, 2)};\n\nexport const MANIFEST_LOCK = '${lock}';\n\nexport default deepFreeze(manifest);\n`);
  return lock;
}

async function loadActivationFixture(root = webRoot) {
  const context = vm.createContext({ crypto: globalThis.crypto, TextDecoder, TextEncoder, Uint8Array });
  for (const name of ['00-namespace.js', '01-pinset-encoding.js']) {
    const source = await readFile(path.join(root, 'owner-tools/activate-looper-3802/src', name), 'utf8');
    vm.runInContext(source, context, { filename: name, timeout: 1_000 });
  }
  return JSON.parse(vm.runInContext('JSON.stringify(globalThis.ActivateLooper3802)', context, { timeout: 1_000 }));
}

function assertSafeScriptBoundaries(html) {
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.scripts.length, 2, 'one JSON-LD block and one executable runtime');
  assert.equal(dom.window.document.querySelectorAll('script:not([type])').length, 1, 'one executable script boundary');
  assert.equal(dom.window.document.querySelector('#injected, #source-injected'), null, 'no injected DOM');
}

function runtimeScript(html) {
  return extractSingle(html, /<script>([\s\S]*?)<\/script>/gu, 'executable inline script');
}

function jsonLd(html) {
  const body = extractSingle(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu, 'JSON-LD script');
  return JSON.parse(body);
}

test('generates exact neutral SEO, social, structured-data, and static profile content', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  const html = await buildExpectedHtml({ webRoot });
  assert.equal(html, await readFile(profileGeneratedPath, 'utf8'));
  assert.match(html, /<title>Looper #3802 Multipass \| Helixa<\/title>/u);
  assert.match(html, /<link rel="canonical" href="https:\/\/helixa\.xyz\/multipass\/loopers\/3802">/u);
  assert.match(html, /<meta name="robots" content="index,follow">/u);
  assert.doesNotMatch(html, /noindex/iu);
  assert.match(html, /<meta name="description" content="Public onchain wallet and identity profile for Looper #3802">/u);
  assert.doesNotMatch(extractSingle(html, /<meta name="description" content="([^"]+)">/gu, 'description'), /verified/iu);
  assert.match(html, /<meta property="og:type" content="profile">/u);
  assert.match(html, /<meta property="og:site_name" content="Helixa Multipass">/u);
  assert.match(html, /<meta property="og:title" content="Looper #3802 Multipass \| Helixa">/u);
  assert.match(html, /<meta property="og:description" content="Public onchain wallet and identity profile for Looper #3802">/u);
  assert.match(html, /<meta property="og:url" content="https:\/\/helixa\.xyz\/multipass\/loopers\/3802">/u);
  assert.match(html, /<meta property="og:image" content="https:\/\/3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq\.arweave\.net\/3ZwkzgHeRr0Chw14FzKmwZf54fyHi6d0KVOZQprgq50">/u);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/u);
  assert.match(html, /<meta name="twitter:title" content="Looper #3802 Multipass \| Helixa">/u);
  assert.match(html, /<meta name="twitter:description" content="Public onchain wallet and identity profile for Looper #3802">/u);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq\.arweave\.net\/3ZwkzgHeRr0Chw14FzKmwZf54fyHi6d0KVOZQprgq50">/u);

  assert.deepEqual(jsonLd(html), {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: manifest.content.seoTitle,
    description: manifest.content.seoDescription,
    url: manifest.urls.canonicalProfile,
    primaryImageOfPage: manifest.content.artworkUrl,
    mainEntity: {
      '@type': 'Thing',
      name: manifest.content.name,
      identifier: `${manifest.contracts.loopersProxy.address}:${manifest.tokenId}`,
      url: manifest.urls.openSea,
      sameAs: [manifest.urls.baseScanToken, manifest.urls.baseScanAccount],
    },
  });
  assert.match(html, /Checking onchain proof/u);
  assert.match(html, /Looper #3802/u);
  assert.match(html, /A Looper with its own onchain account/u);
});

test('hashes the exact LF-normalized inline style and executable script with quoted Base64 CSP sources', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  const html = await buildExpectedHtml({ webRoot });
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gu)];
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/gu)];
  assert.equal(styles.length, 1);
  assert.equal(scripts.length, 2, 'one JSON-LD data block and one executable runtime');
  assert.equal([...html.matchAll(/<script>/gu)].length, 1, 'exactly one executable inline script');
  const csp = extractSingle(html, /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/gu, 'CSP meta');
  assert.match(csp, new RegExp(`script-src ${cspHash(runtimeScript(html)).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`));
  assert.match(csp, new RegExp(`style-src ${cspHash(styles[0][1]).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`));
  assert.equal(csp, `default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; script-src ${cspHash(runtimeScript(html))}; script-src-attr 'none'; style-src ${cspHash(styles[0][1])}; style-src-attr 'none'; connect-src https://mainnet.base.org https://base.drpc.org https://base.blockscout.com; img-src 'self' https://3wocjtqb3zdl2auhbv4bomvgygl7typ4q6f2o5bjkomufgxavooq.arweave.net; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; upgrade-insecure-requests`);
  assert.equal(html.includes('\r'), false);
  assert.equal(html.endsWith('\n'), true);
  assert.equal(html.endsWith('\n\n'), false);
});

test('assembles the fixed classic-IIFE allowlist and registers the manifest with its lock between units 01 and 02', async () => {
  const { SOURCE_UNITS, buildExpectedHtml } = await loadBuilder();
  assert.deepEqual(SOURCE_UNITS, [
    '00-namespace.js',
    '01-manifest-codecs.js',
    '02-base-rpc.js',
    '03-proof-verifier.js',
    '04-holdings.js',
    '05-renderer.js',
    '06-bootstrap.js',
  ]);
  const source = runtimeScript(await buildExpectedHtml({ webRoot }));
  const codecAt = source.indexOf('/* profile-unit: 01-manifest-codecs.js */');
  const registrationAt = source.indexOf('/* profile-manifest: 3802 */');
  const rpcAt = source.indexOf('/* profile-unit: 02-base-rpc.js */');
  assert.ok(codecAt >= 0 && codecAt < registrationAt && registrationAt < rpcAt);
  assert.match(source, /const MANIFEST_LOCK = '0x[0-9a-f]{64}';[\s\S]*?ns\.MANIFEST = ns\.validateManifest\([\s\S]+, MANIFEST_LOCK\);/u);
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/mu);

  const context = vm.createContext({ TextDecoder, TextEncoder, Uint8Array });
  vm.runInContext(source, context, { filename: 'generated-profile-runtime.js' });
  const runtimeNamespace = context.LooperMultipassProfile;
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeNamespace.MANIFEST)), clone(manifest));
  assertRecursivelyFrozen(runtimeNamespace.MANIFEST);
  assert.equal(runtimeNamespace.MANIFEST_LOCK, undefined);
  for (const name of ['createBaseRpcClient', 'verifyLooperProfileProof', 'createHoldingsClient', 'createProfileRenderer', 'bootstrapLooperMultipassProfile']) {
    assert.equal(typeof runtimeNamespace[name], 'function');
    assert.throws(() => runtimeNamespace[name](), /Not implemented/u);
  }
});

test('contains no remote executable code, forms, wallet controls, or unsafe inline event attributes', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  const html = await buildExpectedHtml({ webRoot });
  assert.doesNotMatch(html, /<script[^>]+src=/iu);
  assert.doesNotMatch(html, /<(?:form|input|textarea|select)\b/iu);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/iu);
  assert.doesNotMatch(html, /connect wallet|wallet connect/iu);
  assert.doesNotMatch(runtimeScript(html), /\b(?:window\.ethereum|ethereum\.request|eth_sendTransaction|localStorage|sessionStorage|indexedDB|document\.cookie)\b/iu);
});

test('build, check, and source/dist writes are deterministic and hermetic', async () => {
  const { buildExpectedHtml, checkProfileArtifact, writeProfileArtifact } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const first = await buildExpectedHtml({ webRoot: temporaryWebRoot });
    const second = await buildExpectedHtml({ webRoot: temporaryWebRoot });
    assert.equal(first, second);
    assert.equal(await checkProfileArtifact({ webRoot: temporaryWebRoot }), true);

    const committed = path.join(temporaryWebRoot, 'public-profiles/loopers/3802/index.html');
    await writeFile(committed, 'stale\n');
    await assert.rejects(() => checkProfileArtifact({ webRoot: temporaryWebRoot }), /stale/iu);
    await writeProfileArtifact({ webRoot: temporaryWebRoot, mode: 'source' });
    assert.equal(await readFile(committed, 'utf8'), first);

    const distRoot = path.join(temporaryWebRoot, 'dist');
    await mkdir(distRoot, { recursive: true });
    await writeFile(path.join(distRoot, 'keep.txt'), 'preserved\n');
    await writeProfileArtifact({ webRoot: temporaryWebRoot, mode: 'dist' });
    assert.equal(await readFile(path.join(distRoot, 'multipass/loopers/3802/index.html'), 'utf8'), first);
    assert.equal(await readFile(path.join(distRoot, 'keep.txt'), 'utf8'), 'preserved\n');
  });
});

test('evaluates activation pins with Web Crypto but no DOM or network globals', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const activation = path.join(temporaryWebRoot, 'owner-tools/activate-looper-3802/src/01-pinset-encoding.js');
    const source = await readFile(activation, 'utf8');
    const isolationProbe = [
      "if (!globalThis.crypto || globalThis.crypto.subtle?.constructor?.name !== 'SubtleCrypto') throw new Error('Web Crypto unavailable');",
      "if (typeof document !== 'undefined' || typeof window !== 'undefined' || typeof fetch !== 'undefined' || typeof XMLHttpRequest !== 'undefined') throw new Error('DOM or network global leaked');",
    ].join('\n');
    await writeFile(activation, source.replace("'use strict';", `'use strict';\n${isolationProbe}`));
    await assert.doesNotReject(() => buildExpectedHtml({ webRoot: temporaryWebRoot }));
  });
});

test('rejects unknown manifests, source units, flags, template markers, missing dist, and activation divergence', async () => {
  const { buildExpectedHtml, writeProfileArtifact } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const loopersRoot = path.join(temporaryWebRoot, 'public-profiles/loopers');
    const sourceRoot = path.join(loopersRoot, 'src');
    const manifestsRoot = path.join(loopersRoot, 'manifests');
    const template = path.join(loopersRoot, 'index.template.html');
    const activation = path.join(temporaryWebRoot, 'owner-tools/activate-looper-3802/src/01-pinset-encoding.js');

    await writeFile(path.join(manifestsRoot, '9999.js'), 'export default {};\n');
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /manifest|3802|exact/iu);
    await unlink(path.join(manifestsRoot, '9999.js'));

    await writeFile(path.join(sourceRoot, '07-unknown.js'), "'use strict';\n");
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /allowlist|source|exact|unknown/iu);
    await unlink(path.join(sourceRoot, '07-unknown.js'));

    const bootstrap = path.join(sourceRoot, '06-bootstrap.js');
    const bootstrapSource = await readFile(bootstrap, 'utf8');
    await unlink(bootstrap);
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /allowlist|source|missing|exact/iu);
    await writeFile(bootstrap, bootstrapSource);

    const templateSource = await readFile(template, 'utf8');
    await writeFile(template, templateSource.replace('/* __PROFILE_RUNTIME__ */', '/* __PROFILE_RUNTIME__ */\n/* __PROFILE_RUNTIME__ */'));
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /marker|runtime|exactly one/iu);
    await writeFile(template, templateSource);

    const activationSource = await readFile(activation, 'utf8');
    await writeFile(activation, activationSource.replace('0x8da5cb5b', '0x8da5cb5c'));
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /activation|selector|diverge|pin/iu);
    await writeFile(activation, activationSource);

    await assert.rejects(() => writeProfileArtifact({ webRoot: temporaryWebRoot, mode: 'dist' }), /dist.*exist|before.*dist/iu);
  });

  const unknownFlag = spawnSync(process.execPath, [builderPath, '--unknown'], { encoding: 'utf8' });
  assert.notEqual(unknownFlag.status, 0);
  assert.match(`${unknownFlag.stdout}${unknownFlag.stderr}`, /Usage/iu);
  const conflictingFlags = spawnSync(process.execPath, [builderPath, '--check', '--dist'], { encoding: 'utf8' });
  assert.notEqual(conflictingFlags.status, 0);
  assert.match(`${conflictingFlags.stdout}${conflictingFlags.stderr}`, /Usage/iu);
});

test('rejects every approved receipt fixture drift independently', async () => {
  const { assertReceiptFixture } = await loadBuilder();
  assert.doesNotThrow(() => assertReceiptFixture(clone(manifest)));
  for (const keys of leafPaths(manifest.activation)) {
    const changed = clone(manifest);
    const activationKeys = ['activation', ...keys];
    setAt(changed, activationKeys, mutateLeaf(valueAt(changed, activationKeys)));
    assert.throws(() => assertReceiptFixture(changed), undefined, `accepted receipt drift at ${keys.join('.')}`);
  }
});

test('serializes hostile manifest text deterministically without creating a script boundary or injected DOM', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const candidate = clone(manifest);
    candidate.content.tagline = '</ScRiPt><h1 id="injected">& hostile \u2028 \u2029</h1>';
    await writeManifestModule(temporaryWebRoot, candidate);

    const first = await buildExpectedHtml({ webRoot: temporaryWebRoot });
    const second = await buildExpectedHtml({ webRoot: temporaryWebRoot });
    assert.equal(first, second);
    assertSafeScriptBoundaries(first);
    const registration = extractSingle(runtimeScript(first), /(\/\* profile-manifest: 3802 \*\/[\s\S]*?)(?=\/\* profile-unit: 02-base-rpc\.js \*\/)/gu, 'manifest registration');
    assert.doesNotMatch(registration, /<\/script|<h1|& hostile|\u2028|\u2029/iu);
    assert.match(registration, /\\u003c\/ScRiPt\\u003e\\u003ch1 id=\\"injected\\"\\u003e\\u0026 hostile \\u2028 \\u2029\\u003c\/h1\\u003e/u);
  });
});

test('renders mutable manifest presentation fields through context-safe template markers', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const candidate = clone(manifest);
    candidate.chainLabel = 'Manifest <Network> & chain';
    candidate.content.tagline = 'Manifest-owned <tagline> & facts';
    candidate.content.seoTitle = 'Manifest-owned <title> & profile';
    candidate.content.seoDescription = 'Manifest-owned "description" & proof';
    candidate.content.artworkUrl = 'https://example.test/art.png?from="manifest"&mode=proof';
    await writeManifestModule(temporaryWebRoot, candidate);

    const html = await buildExpectedHtml({ webRoot: temporaryWebRoot });
    const dom = new JSDOM(html);
    const { document } = dom.window;
    assert.equal(document.title, candidate.content.seoTitle);
    assert.equal(document.querySelector('meta[name="description"]').content, candidate.content.seoDescription);
    assert.equal(document.querySelector('link[rel="canonical"]').href, candidate.urls.canonicalProfile);
    assert.equal(document.querySelector('#profile-title').textContent, candidate.content.name);
    assert.equal(document.querySelector('.tagline').textContent, candidate.content.tagline);
    assert.equal(document.querySelector('.art').getAttribute('src'), candidate.content.artworkUrl);
    const factValue = (label) => [...document.querySelectorAll('dt')].find((node) => node.textContent === label)?.nextElementSibling?.textContent;
    assert.equal(factValue('Network'), candidate.chainLabel);
    assert.equal(document.querySelectorAll('.proof-chain li')[1].textContent, `ERC-6551 account on ${candidate.chainLabel}`);
    assert.equal(factValue('Sources'), `${candidate.chainLabel} RPC and ${candidate.chainLabel} Blockscout`);
    assert.match(html, /Manifest-owned &lt;tagline&gt; &amp; facts/u);
    assert.match(html, /src="https:\/\/example\.test\/art\.png\?from=&quot;manifest&quot;&amp;mode=proof"/u);
    assert.match(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, /img-src 'self' https:\/\/example\.test/u);
    assertSafeScriptBoundaries(html);
  });
});

test('rejects a literal case-insensitive script terminator in a source unit before template insertion', async () => {
  const { buildExpectedHtml } = await loadBuilder();
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const sourcePath = path.join(temporaryWebRoot, 'public-profiles/loopers/src/02-base-rpc.js');
    const source = await readFile(sourcePath, 'utf8');
    await writeFile(sourcePath, `${source}\n// </ScRiPt><h1 id="source-injected">injected</h1>\n`);
    await assert.rejects(() => buildExpectedHtml({ webRoot: temporaryWebRoot }), /script.*terminator|closing.*script|<\/script/iu);
  });
});

test('bounds every trusted builder VM evaluation and times out an infinite-loop source unit', async () => {
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const sourcePath = path.join(temporaryWebRoot, 'public-profiles/loopers/src/01-manifest-codecs.js');
    const source = await readFile(sourcePath, 'utf8');
    await writeFile(sourcePath, `${source}\nwhile (true) {}\n`);
    const program = `import(${JSON.stringify(pathToFileURL(builderPath).href)}).then(({ buildExpectedHtml }) => buildExpectedHtml({ webRoot: ${JSON.stringify(temporaryWebRoot)} }));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      encoding: 'utf8',
      timeout: 3_000,
    });
    assert.equal(result.error, undefined, `builder process exceeded the external test guard: ${result.error?.message ?? ''}`);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /script execution timed out|timed out/iu);
  });
});

test('keeps queued Promise jobs inside the builder VM timeout boundary', async () => {
  await withTemporaryWebTree(async (temporaryWebRoot) => {
    const sourcePath = path.join(temporaryWebRoot, 'public-profiles/loopers/src/01-manifest-codecs.js');
    const source = await readFile(sourcePath, 'utf8');
    await writeFile(sourcePath, `${source}\nPromise.resolve().then(() => { while (true) {} });\n`);
    const program = [
      `const { buildExpectedHtml } = await import(${JSON.stringify(pathToFileURL(builderPath).href)});`,
      'try {',
      `  await buildExpectedHtml({ webRoot: ${JSON.stringify(temporaryWebRoot)} });`,
      "  process.stderr.write('builder unexpectedly completed');",
      '  process.exitCode = 2;',
      '} catch (error) {',
      "  process.stdout.write(String(error?.code ?? 'NO_ERROR_CODE'));",
      "  if (error?.code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') process.exitCode = 3;",
      '}',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      encoding: 'utf8',
      timeout: 3_000,
    });
    assert.equal(result.error, undefined, `builder failed to enforce its own microtask timeout: ${result.error?.message ?? ''}`);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(result.stdout, 'ERR_SCRIPT_EXECUTION_TIMEOUT');
  });
});

test('rejects activation selector key and value drift against the explicit approved projection', async () => {
  const { assertActivationParity } = await loadBuilder();
  const activation = await loadActivationFixture();
  assert.doesNotThrow(() => assertActivationParity(manifest, activation));

  const keyDrift = clone(activation);
  keyDrift.SELECTORS.unexpectedSelector = keyDrift.SELECTORS.owner;
  assert.throws(() => assertActivationParity(manifest, keyDrift), /selector.*keys|allowlist|projection/iu);

  const valueDrift = clone(activation);
  valueDrift.SELECTORS.owner = '0x00000000';
  assert.throws(() => assertActivationParity(manifest, valueDrift), /owner selector|selector.*value|divergence/iu);
});

test('cleans up the sibling temporary artifact when an atomic write fails after opening it', async () => {
  const { atomicWriteFile } = await loadBuilder();
  const calls = [];
  const outputPath = path.join(os.tmpdir(), 'atomic-profile', 'index.html');
  await assert.rejects(
    () => atomicWriteFile(outputPath, Buffer.from('complete\n'), {
      nonce: () => 'partial',
      write: async (target) => { calls.push(['write', target]); throw Object.assign(new Error('simulated partial write failure'), { code: 'EIO' }); },
      move: async () => calls.push(['unexpected-move']),
      remove: async (target) => calls.push(['remove', target]),
    }),
    /simulated partial write failure/u,
  );
  const temporaryPath = `${outputPath}.partial.tmp`;
  assert.deepEqual(calls, [
    ['write', temporaryPath],
    ['remove', temporaryPath],
  ]);
});

test('cleans up the sibling temporary artifact when atomic rename fails', async () => {
  const { atomicWriteFile } = await loadBuilder();
  const calls = [];
  const outputPath = path.join(os.tmpdir(), 'atomic-profile', 'index.html');
  await assert.rejects(
    () => atomicWriteFile(outputPath, Buffer.from('complete\n'), {
      nonce: () => 'fixed',
      write: async (target, contents, options) => calls.push(['write', target, contents.toString('utf8'), options]),
      move: async (from, to) => { calls.push(['move', from, to]); throw new Error('simulated rename failure'); },
      remove: async (target) => calls.push(['remove', target]),
    }),
    /simulated rename failure/u,
  );
  const temporaryPath = `${outputPath}.fixed.tmp`;
  assert.deepEqual(calls, [
    ['write', temporaryPath, 'complete\n', { flag: 'wx' }],
    ['move', temporaryPath, outputPath],
    ['remove', temporaryPath],
  ]);
});

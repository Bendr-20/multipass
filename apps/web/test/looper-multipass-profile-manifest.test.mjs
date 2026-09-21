import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const manifestPath = path.join(webRoot, 'public-profiles/loopers/manifests/3802.js');
const namespacePath = path.join(webRoot, 'public-profiles/loopers/src/00-namespace.js');
const codecsPath = path.join(webRoot, 'public-profiles/loopers/src/01-manifest-codecs.js');

const manifestModule = await import(pathToFileURL(manifestPath));
const manifest = manifestModule.default;

async function loadBrowserUnits() {
  const context = vm.createContext({ TextDecoder, Uint8Array });
  const [namespaceSource, codecsSource] = await Promise.all([
    readFile(namespacePath, 'utf8'),
    readFile(codecsPath, 'utf8'),
  ]);
  vm.runInContext(namespaceSource, context, { filename: namespacePath });
  vm.runInContext(codecsSource, context, { filename: codecsPath });
  return { context, namespaceSource, codecsSource, unit: context.LooperMultipassProfile };
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

test('exports exactly one recursively frozen plain Looper 3802 manifest', () => {
  assert.deepEqual(Object.keys(manifestModule), ['default']);
  assert.equal(Object.getPrototypeOf(manifest), Object.prototype);
  assertRecursivelyFrozen(manifest);
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
  const validated = unit.validateManifest(candidate);
  assert.deepEqual(clone(validated), candidate);
  assert.notEqual(validated, candidate);
  assertRecursivelyFrozen(validated);

  const extraTop = clone(manifest);
  extraTop.unexpected = true;
  assert.throws(() => unit.validateManifest(extraTop), /unknown|keys|exact/iu);

  const extraNested = clone(manifest);
  extraNested.activation.event.unexpected = true;
  assert.throws(() => unit.validateManifest(extraNested), /unknown|keys|exact/iu);

  const hiddenExtra = clone(manifest);
  Object.defineProperty(hiddenExtra, 'hidden', { value: true });
  assert.throws(() => unit.validateManifest(hiddenExtra), /unknown|keys|exact/iu);

  const symbolExtra = clone(manifest);
  symbolExtra[Symbol('unexpected')] = true;
  assert.throws(() => unit.validateManifest(symbolExtra), /unknown|keys|exact/iu);

  const missing = clone(manifest);
  delete missing.contracts.adapter8004Proxy.runtimeSha256;
  assert.throws(() => unit.validateManifest(missing), /missing|keys|exact/iu);

  for (const keys of leafPaths(manifest)) {
    const changed = clone(manifest);
    setAt(changed, keys, mutateLeaf(valueAt(changed, keys)));
    assert.throws(
      () => unit.validateManifest(changed),
      undefined,
      `accepted drift at ${keys.join('.')}`,
    );
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
    assert.throws(() => unit.validateManifest(candidate), undefined, label);
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

test('classic units expose one fail-fast namespace boundary and no browser side effects', async () => {
  const { context, namespaceSource, codecsSource, unit } = await loadBrowserUnits();
  const descriptor = Object.getOwnPropertyDescriptor(context, 'LooperMultipassProfile');
  assert.deepEqual(
    { enumerable: descriptor.enumerable, writable: descriptor.writable, configurable: descriptor.configurable },
    { enumerable: false, writable: false, configurable: false },
  );
  assert.equal(Object.getPrototypeOf(unit), null);
  assert.throws(() => vm.runInContext(namespaceSource, context), /already|namespace|registered/iu);
  assert.throws(() => vm.runInContext(codecsSource, context), /already|registered|property/iu);

  for (const source of [namespaceSource, codecsSource]) {
    assert.doesNotMatch(source, /\b(?:import|export)\b/u);
    assert.doesNotMatch(source, /\b(?:document|window|fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|ethereum)\b/u);
  }
});

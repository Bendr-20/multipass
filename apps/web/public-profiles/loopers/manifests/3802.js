function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const manifest = {
  chainId: 8453,
  chainLabel: 'Base',
  tokenId: '3802',
  account: '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
  holderAtActivation: '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4',
  profilePath: '/multipass/loopers/3802',
  erc6551: {
    registry: '0x000000006551c19487814612e58FE06813775758',
    implementation: '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF',
    salt: '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee',
    runtimeBytes: 173,
    runtime: '0x363d3d373d3d3d363d731e3787bc9b2e6d7763de1dccf10e9d062f3b43bf5af43d82803e903d91602b57fd5bf3ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda',
    runtimeSha256: '0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a',
  },
  contracts: {
    loopersProxy: {
      address: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
      runtimeBytes: 177,
      runtimeSha256: '0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662',
      implementationSlot: '0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908',
    },
    loopersImplementation: {
      address: '0x68F22e3563891167D37C86391c4a83449c83e908',
      runtimeBytes: 23210,
      runtimeSha256: '0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec',
      implementationSlot: null,
    },
    erc6551Registry: {
      address: '0x000000006551c19487814612e58FE06813775758',
      runtimeBytes: 571,
      runtimeSha256: '0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56',
      implementationSlot: null,
    },
    erc6551Implementation: {
      address: '0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF',
      runtimeBytes: 685,
      runtimeSha256: '0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5',
      implementationSlot: null,
    },
    adapter8004Proxy: {
      address: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27',
      runtimeBytes: 163,
      runtimeSha256: '0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017',
      implementationSlot: '0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9',
    },
    adapter8004Implementation: {
      address: '0x0f81bd4EDD4879734361A1A44460264CBf6F94c9',
      runtimeBytes: 12732,
      runtimeSha256: '0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be',
      implementationSlot: null,
    },
    identityRegistryProxy: {
      address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      runtimeBytes: 130,
      runtimeSha256: '0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85',
      implementationSlot: '0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02',
    },
    identityRegistryImplementation: {
      address: '0x7274e874CA62410a93Bd8bf61c69d8045E399c02',
      runtimeBytes: 14474,
      runtimeSha256: '0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1',
      implementationSlot: null,
    },
  },
  erc8004: {
    identityId: '90994',
    identityUri: 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json',
    adapter: '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  },
  activation: {
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
  },
  content: {
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
  },
  urls: {
    canonicalProfile: 'https://helixa.xyz/multipass/loopers/3802',
    blockscoutAccount: 'https://base.blockscout.com/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    blockscoutErc20Holdings: 'https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-20',
    blockscoutNftHoldings: 'https://base.blockscout.com/api/v2/addresses/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38/tokens?type=ERC-721%2CERC-1155',
    baseScanAccount: 'https://basescan.org/address/0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    baseScanActivation: 'https://basescan.org/tx/0x26408e5614af4d5fa507f29a1c4b7f4cc9fdca46057a37870acf9be06a00587c',
    baseScanToken: 'https://basescan.org/token/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a?a=3802',
    openSea: 'https://opensea.io/assets/base/0x1649CD37f4748807b4882FC48765bA0B2aFfa94a/3802',
  },
};

export default deepFreeze(manifest);

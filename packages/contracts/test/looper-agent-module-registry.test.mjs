import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ethers } from 'ethers';
import ganache from 'ganache';
import solc from 'solc';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = resolve(ROOT, 'src/LooperAgentModuleRegistry.sol');

const FIXTURES = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DynamicOwnerCollection {
    address public owner;

    constructor(address initialOwner) { owner = initialOwner; }

    function transferOwnership(address nextOwner) external {
        require(msg.sender == owner, "NOT_OWNER");
        owner = nextOwner;
    }
}

contract InertModule {}

contract ZeroOwnerCollection {
    function owner() external pure returns (address) { return address(0); }
}

contract RevertingOwnerCollection {
    function owner() external pure returns (address) { revert("OWNER_REVERTED"); }
}

contract ShortOwnerCollection {
    fallback() external {
        assembly {
            mstore(0, caller())
            return(1, 31)
        }
    }
}

contract LongOwnerCollection {
    fallback() external {
        assembly {
            mstore(0, caller())
            mstore(32, 0)
            return(0, 64)
        }
    }
}

contract NonCanonicalOwnerCollection {
    fallback() external {
        assembly {
            mstore(0, or(caller(), shl(160, 1)))
            return(0, 32)
        }
    }
}

contract GasBurningOwnerCollection {
    function owner() external view returns (address) {
        uint256 cursor = 1;
        while (gasleft() > 1_000) {
            cursor = uint256(keccak256(abi.encode(cursor, block.number)));
        }
        return address(uint160(cursor));
    }
}
`;

let compiled;

function compileAll() {
  if (compiled) return compiled;
  const input = {
    language: 'Solidity',
    sources: {
      'src/LooperAgentModuleRegistry.sol': { content: readFileSync(SOURCE_PATH, 'utf8') },
      'test/LooperAgentModuleRegistryFixtures.sol': { content: FIXTURES },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'none', appendCBOR: false },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = output.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  compiled = {
    registry: artifact(output, 'src/LooperAgentModuleRegistry.sol', 'LooperAgentModuleRegistry'),
    collection: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'DynamicOwnerCollection'),
    module: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'InertModule'),
    zeroOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'ZeroOwnerCollection'),
    revertingOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'RevertingOwnerCollection'),
    shortOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'ShortOwnerCollection'),
    longOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'LongOwnerCollection'),
    nonCanonicalOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'NonCanonicalOwnerCollection'),
    gasBurningOwner: artifact(output, 'test/LooperAgentModuleRegistryFixtures.sol', 'GasBurningOwnerCollection'),
  };
  return compiled;
}

function artifact(output, source, name) {
  const contract = output.contracts[source][name];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    runtime: `0x${contract.evm.deployedBytecode.object}`,
  };
}

function resolveImport(importPath) {
  try {
    return { contents: readFileSync(require.resolve(importPath, { paths: [ROOT] }), 'utf8') };
  } catch (error) {
    return { error: `Could not resolve ${importPath}: ${error.message}` };
  }
}

async function deploy(artifactValue, signer, args = []) {
  const contract = await new ethers.ContractFactory(artifactValue.abi, artifactValue.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function fixture() {
  const artifacts = compileAll();
  const ganacheProvider = ganache.provider({
    chain: { hardfork: 'shanghai', chainId: 1337 },
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 1000 },
  });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const signers = await Promise.all([...Array(8).keys()].map((index) => provider.getSigner(index)));
  const collection = await deploy(artifacts.collection, signers[0], [signers[1].address]);
  const registry = await deploy(artifacts.registry, signers[0], [await collection.getAddress()]);
  const module = await deploy(artifacts.module, signers[0]);
  const moduleAddress = await module.getAddress();
  const codehash = ethers.keccak256(await provider.getCode(moduleAddress));
  return { artifacts, ganacheProvider, provider, signers, collection, registry, module, moduleAddress, codehash };
}

async function expectRejected(promise) {
  await assert.rejects(async () => {
    const transaction = await promise;
    await transaction.wait();
  });
}

function parseRegistryLogs(registry, receipt) {
  const address = (registry.target ?? '').toLowerCase();
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === address)
    .map((log) => registry.interface.parseLog(log));
}

test('compiler, constructor, public surface, events, and source authority are exact', async () => {
  const artifacts = compileAll();
  const functions = artifacts.registry.abi
    .filter((entry) => entry.type === 'function')
    .map((entry) => `${entry.name}(${entry.inputs.map((input) => input.type).join(',')})`)
    .sort();
  assert.deepEqual(functions, [
    'approveModule(address,bytes32)',
    'approvedModuleCodehash(address)',
    'collection()',
    'globallyPaused()',
    'removeModule(address)',
    'setGlobalPause(bool)',
  ]);

  const constructor = artifacts.registry.abi.find((entry) => entry.type === 'constructor');
  assert.deepEqual(constructor.inputs.map((input) => input.type), ['address']);
  assert.equal(constructor.stateMutability, 'nonpayable');

  const events = artifacts.registry.abi
    .filter((entry) => entry.type === 'event')
    .map((entry) => ({
      signature: `${entry.name}(${entry.inputs.map((input) => input.type).join(',')})`,
      indexed: entry.inputs.map((input) => input.indexed),
    }));
  assert.deepEqual(events, [
    { signature: 'GlobalPauseChanged(bool)', indexed: [false] },
    { signature: 'ModuleApprovalChanged(address,bytes32)', indexed: [true, false] },
  ]);

  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.match(source, /pragma solidity \^0\.8\.24;/);
  assert.match(source, /address public immutable collection;/);
  assert.match(source, /bool public globallyPaused = true;/);
  assert.match(source, /mapping\(address\s*=>\s*bytes32\) public approvedModuleCodehash;/);
  assert.match(source, /\.staticcall\{gas:\s*30_000\}/);
  assert.doesNotMatch(source, /\b(delegatecall|selfdestruct|create2?|initializer|reinitializer|proxy|beacon|uups|upgrade|grant|execute|spend|transferAdmin|setAdmin|policyModule)\b/i);
  assert.doesNotMatch(source, /\.call\s*[({]/);
});

test('constructor rejects zero and non-contract collection addresses', async () => {
  const artifacts = compileAll();
  const ganacheProvider = ganache.provider({ logging: { quiet: true } });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const deployer = await provider.getSigner(0);
  const eoa = await provider.getSigner(1);
  const factory = new ethers.ContractFactory(artifacts.registry.abi, artifacts.registry.bytecode, deployer);
  await assert.rejects(factory.deploy(ethers.ZeroAddress));
  await assert.rejects(factory.deploy(eoa.address));
});

test('registry starts paused and empty with its immutable collection', async () => {
  const f = await fixture();
  assert.equal(await f.registry.collection(), await f.collection.getAddress());
  assert.equal(await f.registry.globallyPaused(), true);
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), ethers.ZeroHash);
});

test('authorization follows the collection current owner dynamically', async () => {
  const f = await fixture();
  const [, projectOwner, nextOwner, stranger] = f.signers;

  await expectRejected(f.registry.connect(stranger).approveModule(f.moduleAddress, f.codehash));
  await (await f.registry.connect(projectOwner).approveModule(f.moduleAddress, f.codehash)).wait();
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), f.codehash);

  await (await f.collection.connect(projectOwner).transferOwnership(nextOwner.address)).wait();
  await expectRejected(f.registry.connect(projectOwner).removeModule(f.moduleAddress));
  await (await f.registry.connect(nextOwner).removeModule(f.moduleAddress)).wait();
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), ethers.ZeroHash);
});

test('owner evidence fails closed when zero, malformed, reverting, or over the gas cap', async () => {
  const artifacts = compileAll();
  const ganacheProvider = ganache.provider({ logging: { quiet: true } });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const signer = await provider.getSigner(0);
  const module = await deploy(artifacts.module, signer);
  const moduleAddress = await module.getAddress();
  const codehash = ethers.keccak256(await provider.getCode(moduleAddress));

  for (const collectionArtifact of [
    artifacts.zeroOwner,
    artifacts.revertingOwner,
    artifacts.shortOwner,
    artifacts.longOwner,
    artifacts.nonCanonicalOwner,
    artifacts.gasBurningOwner,
  ]) {
    const collection = await deploy(collectionArtifact, signer);
    const registry = await deploy(artifacts.registry, signer, [await collection.getAddress()]);
    await expectRejected(registry.approveModule(moduleAddress, codehash));
    await expectRejected(registry.setGlobalPause(false));
    await expectRejected(registry.removeModule(moduleAddress));
  }
});

test('approval rejects zero and EOA modules, zero hashes, and wrong runtime hashes', async () => {
  const f = await fixture();
  const [, projectOwner, eoa] = f.signers;
  await expectRejected(f.registry.connect(projectOwner).approveModule(ethers.ZeroAddress, f.codehash));
  await expectRejected(f.registry.connect(projectOwner).approveModule(eoa.address, f.codehash));
  await expectRejected(f.registry.connect(projectOwner).approveModule(f.moduleAddress, ethers.ZeroHash));
  await expectRejected(f.registry.connect(projectOwner).approveModule(f.moduleAddress, ethers.id('wrong-runtime')));
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), ethers.ZeroHash);
});

test('approval stores the exact extcodehash and emits the precise event', async () => {
  const f = await fixture();
  const [, projectOwner] = f.signers;
  const receipt = await (await f.registry.connect(projectOwner).approveModule(f.moduleAddress, f.codehash)).wait();
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), f.codehash);
  const logs = parseRegistryLogs(f.registry, receipt);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].name, 'ModuleApprovalChanged');
  assert.equal(logs[0].args.module, f.moduleAddress);
  assert.equal(logs[0].args.codehash, f.codehash);
  assert.equal(receipt.logs[0].topics.length, 2);
});

test('removal stores zero and emits the precise event even for exact revocation', async () => {
  const f = await fixture();
  const [, projectOwner] = f.signers;
  await (await f.registry.connect(projectOwner).approveModule(f.moduleAddress, f.codehash)).wait();
  const receipt = await (await f.registry.connect(projectOwner).removeModule(f.moduleAddress)).wait();
  assert.equal(await f.registry.approvedModuleCodehash(f.moduleAddress), ethers.ZeroHash);
  const logs = parseRegistryLogs(f.registry, receipt);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].name, 'ModuleApprovalChanged');
  assert.equal(logs[0].args.module, f.moduleAddress);
  assert.equal(logs[0].args.codehash, ethers.ZeroHash);
});

test('project owner pauses and resumes with precise events while strangers cannot', async () => {
  const f = await fixture();
  const [, projectOwner, stranger] = f.signers;
  await expectRejected(f.registry.connect(stranger).setGlobalPause(false));

  const resumed = await (await f.registry.connect(projectOwner).setGlobalPause(false)).wait();
  assert.equal(await f.registry.globallyPaused(), false);
  let logs = parseRegistryLogs(f.registry, resumed);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].name, 'GlobalPauseChanged');
  assert.equal(logs[0].args.paused, false);
  assert.equal(resumed.logs[0].topics.length, 1);

  const paused = await (await f.registry.connect(projectOwner).setGlobalPause(true)).wait();
  assert.equal(await f.registry.globallyPaused(), true);
  logs = parseRegistryLogs(f.registry, paused);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].name, 'GlobalPauseChanged');
  assert.equal(logs[0].args.paused, true);
});

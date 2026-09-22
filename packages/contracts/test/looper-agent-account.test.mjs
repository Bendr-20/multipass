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
const SOURCE_PATH = resolve(ROOT, 'src/LooperAgentAccount.sol');
const SALT = ethers.id('looper-agent-account-test');
const ERC1271_MAGIC = '0x1626ba7e';
const ERC6551_SIGNER_MAGIC = ethers.id('isValidSigner(address,bytes)').slice(0, 10);
const INVALID_MAGIC = '0xffffffff';
const PRE_MAGIC = ethers.id('preAuthorizeAndConsume(address,address,uint256,address,uint256,bytes)').slice(0, 10);
const POST_MAGIC = ethers.id('postValidate(address,address,uint256,address,uint256,bytes,bytes)').slice(0, 10);
const POLICY_INTERFACE_ID = selectorXor([
  'preAuthorizeAndConsume(address,address,uint256,address,uint256,bytes)',
  'postValidate(address,address,uint256,address,uint256,bytes,bytes)',
]);

const FIXTURES = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccountState { function state() external view returns (uint256); }
interface IAgentAccount {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation) external returns (bytes memory);
}
interface IAgentPolicyAccount {
    function executeWithPolicy(address to, uint256 value, bytes calldata data) external payable returns (bytes memory);
    function setPolicyModule(address module) external;
}

contract MockModuleRegistry {
    bool public globallyPaused = true;
    mapping(address => bytes32) public approvedModuleCodehash;

    function setGlobalPause(bool paused) external { globallyPaused = paused; }
    function setApproval(address module, bytes32 codehash) external { approvedModuleCodehash[module] = codehash; }
}

contract MockNFT {
    mapping(uint256 => address) private owners;

    function mint(address to, uint256 tokenId) external { owners[tokenId] = to; }
    function ownerOf(uint256 tokenId) external view returns (address) {
        address current = owners[tokenId];
        require(current != address(0), "NOT_MINTED");
        return current;
    }
    function transferFrom(address from, address to, uint256 tokenId) external {
        require(msg.sender == from && owners[tokenId] == from && to != address(0), "NOT_OWNER");
        owners[tokenId] = to;
    }
    function burn(uint256 tokenId) external {
        require(msg.sender == owners[tokenId], "NOT_OWNER");
        delete owners[tokenId];
    }
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockTarget {
    uint256 public observedState;
    uint256 public calls;
    uint256 public lastValue;
    bytes32 public lastPayloadHash;

    function observe(address account) external returns (bytes4) {
        observedState = IAccountState(account).state();
        return 0x11223344;
    }

    function returnExact() external pure {
        assembly { mstore(0, shl(224, 0x11223344)) return(0, 4) }
    }

    function revertExact() external pure {
        assembly { mstore(0, shl(224, 0xdeadbeef)) revert(0, 4) }
    }

    function record(address account, bytes calldata payload) external payable {
        calls += 1;
        observedState = IAccountState(account).state();
        lastValue = msg.value;
        lastPayloadHash = keccak256(payload);
        assembly {
            calldatacopy(0, payload.offset, payload.length)
            return(0, payload.length)
        }
    }

    receive() external payable {}
}

contract Mock1271Owner {
    bytes32 public expectedHash;
    bytes32 public expectedSignatureHash;

    function setExpected(bytes32 hash, bytes calldata signature) external {
        expectedHash = hash;
        expectedSignatureHash = keccak256(signature);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return hash == expectedHash && keccak256(signature) == expectedSignatureHash
            ? bytes4(0x1626ba7e)
            : bytes4(0xffffffff);
    }

    function executeAccount(address account, address to, uint256 value, bytes calldata data, uint8 operation)
        external returns (bytes memory)
    {
        return IAgentAccount(account).execute(to, value, data, operation);
    }

    function reenterAccount(address account, address to) external {
        IAgentAccount(account).execute(to, 0, hex"", 0);
    }

    function setPolicyAccount(address account, address module) external {
        IAgentPolicyAccount(account).setPolicyModule(module);
    }

    receive() external payable {}
}

contract MockPolicy {
    bytes4 private constant PRE_MAGIC = bytes4(keccak256("preAuthorizeAndConsume(address,address,uint256,address,uint256,bytes)"));
    bytes4 private constant POST_MAGIC = bytes4(keccak256("postValidate(address,address,uint256,address,uint256,bytes,bytes)"));

    uint8 public supportMode;
    uint8 public preMode;
    uint8 public postMode;
    uint256 public preCalls;
    address public lastHookCaller;
    bytes32 public lastPreDigest;

    address public expectedAccount;
    address public expectedSessionKey;
    address public expectedOwner;
    uint256 public expectedEpoch;
    address public expectedTo;
    uint256 public expectedValue;
    bytes32 public expectedDataHash;
    bytes32 public expectedResultHash;

    function setModes(uint8 supportMode_, uint8 preMode_, uint8 postMode_) external {
        supportMode = supportMode_;
        preMode = preMode_;
        postMode = postMode_;
    }

    function setExpected(
        address account,
        address sessionKey,
        address owner,
        uint256 epoch,
        address to,
        uint256 value,
        bytes32 dataHash,
        bytes32 resultHash
    ) external {
        expectedAccount = account;
        expectedSessionKey = sessionKey;
        expectedOwner = owner;
        expectedEpoch = epoch;
        expectedTo = to;
        expectedValue = value;
        expectedDataHash = dataHash;
        expectedResultHash = resultHash;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        if (supportMode == 1) return false;
        if (supportMode == 2) {
            assembly { mstore(0, 1) return(0, 1) }
        }
        if (supportMode == 3) {
            assembly { mstore(0, 1) mstore(0x20, 0) return(0, 0x40) }
        }
        if (supportMode == 4) {
            assembly { mstore(0, shl(224, 0x0badcafe)) revert(0, 4) }
        }
        if (supportMode == 5) {
            require(gasleft() > 25_000 && gasleft() <= 30_000, "ERC165_GAS_CAP");
            require(_finiteWork(bytes32(interfaceId), 2) != bytes32(0), "ERC165_WORK");
        }
        if (supportMode == 6) {
            assembly { mstore(0, 2) return(0, 0x20) }
        }
        return interfaceId == (PRE_MAGIC ^ POST_MAGIC);
    }

    function preAuthorizeAndConsume(
        address sessionKey,
        address owner,
        uint256 epoch,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4) {
        if (preMode == 5) {
            require(gasleft() > 110_000 && gasleft() <= 120_000, "PRE_GAS_CAP");
            require(_finiteWork(keccak256(data), 2) != bytes32(0), "PRE_WORK");
        }
        require(msg.sender == expectedAccount, "PRE_ACCOUNT");
        require(sessionKey == expectedSessionKey, "PRE_SESSION");
        require(owner == expectedOwner, "PRE_OWNER");
        require(epoch == expectedEpoch, "PRE_EPOCH");
        require(to == expectedTo, "PRE_TO");
        require(value == expectedValue, "PRE_VALUE");
        require(keccak256(data) == expectedDataHash, "PRE_DATA");
        if (preMode == 6) IAgentPolicyAccount(msg.sender).executeWithPolicy(to, value, data);
        if (preMode == 7) IAgentAccount(msg.sender).execute(to, value, data, 0);
        preCalls += 1;
        lastHookCaller = msg.sender;
        lastPreDigest = keccak256(abi.encode(sessionKey, owner, epoch, to, value, keccak256(data)));
        if (preMode == 1) return bytes4(0x01020304);
        if (preMode == 2) {
            bytes4 magic = PRE_MAGIC;
            assembly { mstore(0, magic) return(0, 4) }
        }
        if (preMode == 3) {
            bytes4 magic = PRE_MAGIC;
            assembly { mstore(0, magic) mstore(0x20, 0) return(0, 0x40) }
        }
        if (preMode == 4) {
            assembly { mstore(0, shl(224, 0xaabbccdd)) revert(0, 4) }
        }
        if (preMode == 8) {
            bytes32 dirty = bytes32(PRE_MAGIC) | bytes32(uint256(1));
            assembly { mstore(0, dirty) return(0, 0x20) }
        }
        return PRE_MAGIC;
    }

    function postValidate(
        address sessionKey,
        address owner,
        uint256 epoch,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata result
    ) external view returns (bytes4) {
        if (postMode == 5) {
            require(gasleft() > 50_000 && gasleft() <= 60_000, "POST_GAS_CAP");
            require(_finiteWork(keccak256(result), 2) != bytes32(0), "POST_WORK");
        }
        require(msg.sender == expectedAccount, "POST_ACCOUNT");
        require(sessionKey == expectedSessionKey, "POST_SESSION");
        require(owner == expectedOwner, "POST_OWNER");
        require(epoch == expectedEpoch, "POST_EPOCH");
        require(to == expectedTo, "POST_TO");
        require(value == expectedValue, "POST_VALUE");
        require(keccak256(data) == expectedDataHash, "POST_DATA");
        require(keccak256(result) == expectedResultHash, "POST_RESULT");
        if (postMode == 1) return bytes4(0x05060708);
        if (postMode == 2) {
            bytes4 magic = POST_MAGIC;
            assembly { mstore(0, magic) return(0, 4) }
        }
        if (postMode == 3) {
            bytes4 magic = POST_MAGIC;
            assembly { mstore(0, magic) mstore(0x20, 0) return(0, 0x40) }
        }
        if (postMode == 4) {
            assembly { mstore(0, shl(224, 0xfaceb00c)) revert(0, 4) }
        }
        if (postMode == 6) {
            bytes32 dirty = bytes32(POST_MAGIC) | bytes32(uint256(1));
            assembly { mstore(0, dirty) return(0, 0x20) }
        }
        return POST_MAGIC;
    }

    function _finiteWork(bytes32 seed, uint256 iterations) private pure returns (bytes32 result) {
        result = seed;
        for (uint256 index; index < iterations; index += 1) {
            result = keccak256(abi.encode(result, index));
        }
    }
}

contract DelegateHarness {
    address public immutable implementation;
    constructor(address implementation_) { implementation = implementation_; }
    fallback() external payable {
        address target = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }
        }
    }
}

contract CanonicalERC6551Registry {
    event AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    function createAccount(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external returns (address created)
    {
        bytes memory code = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        bytes32 createSalt = keccak256(abi.encode(implementation, salt, chainId, tokenContract, tokenId));
        assembly { created := create2(0, add(code, 0x20), mload(code), createSalt) }
        require(created != address(0), "CREATE2_FAILED");
        emit AccountCreated(created, implementation, salt, chainId, tokenContract, tokenId);
    }

    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external view returns (address)
    {
        bytes memory code = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        bytes32 createSalt = keccak256(abi.encode(implementation, salt, chainId, tokenContract, tokenId));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), createSalt, keccak256(code)));
        return address(uint160(uint256(hash)));
    }

    function _creationCode(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        private pure returns (bytes memory)
    {
        return abi.encodePacked(
            hex"3d60ad80600a3d3981f3",
            hex"363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            salt,
            chainId,
            bytes32(uint256(uint160(tokenContract))),
            tokenId
        );
    }
}
`;

let compiled;

function compileAll() {
  if (compiled) return compiled;
  const input = {
    language: 'Solidity',
    sources: {
      'src/LooperAgentAccount.sol': { content: readFileSync(SOURCE_PATH, 'utf8') },
      'test/LooperAgentAccountFixtures.sol': { content: FIXTURES },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'none', appendCBOR: false },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = output.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  compiled = {
    account: artifact(output, 'src/LooperAgentAccount.sol', 'LooperAgentAccount'),
    registry: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'CanonicalERC6551Registry'),
    moduleRegistry: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'MockModuleRegistry'),
    policy: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'MockPolicy'),
    nft: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'MockNFT'),
    erc20: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'MockERC20'),
    target: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'MockTarget'),
    contractOwner: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'Mock1271Owner'),
    harness: artifact(output, 'test/LooperAgentAccountFixtures.sol', 'DelegateHarness'),
  };
  return compiled;
}

function artifact(output, source, name) {
  const contract = output.contracts[source][name];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    runtime: `0x${contract.evm.deployedBytecode.object}`,
    metadata: JSON.parse(contract.metadata),
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

async function fixture({ tokenId = 1n, ownerIndex = 1 } = {}) {
  const artifacts = compileAll();
  const ganacheProvider = ganache.provider({
    chain: { hardfork: 'shanghai', chainId: 1337 },
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 1000 },
  });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const signers = await Promise.all([...Array(8).keys()].map((index) => provider.getSigner(index)));
  const moduleRegistry = await deploy(artifacts.moduleRegistry, signers[0]);
  const implementation = await deploy(artifacts.account, signers[0], [await moduleRegistry.getAddress()]);
  const registry = await deploy(artifacts.registry, signers[0]);
  const nft = await deploy(artifacts.nft, signers[0]);
  const erc20 = await deploy(artifacts.erc20, signers[0]);
  const target = await deploy(artifacts.target, signers[0]);
  const owner = signers[ownerIndex];
  await (await nft.mint(owner.address, tokenId)).wait();
  const chainId = (await provider.getNetwork()).chainId;
  const predicted = await registry.account(await implementation.getAddress(), SALT, chainId, await nft.getAddress(), tokenId);
  await (await registry.createAccount(await implementation.getAddress(), SALT, chainId, await nft.getAddress(), tokenId)).wait();
  const account = new ethers.Contract(predicted, artifacts.account.abi, owner);
  return {
    artifacts,
    ganacheProvider,
    provider,
    signers,
    implementation,
    registry,
    moduleRegistry,
    nft,
    erc20,
    target,
    owner,
    tokenId,
    chainId,
    account,
  };
}

async function approvePolicy(f, policy) {
  const codehash = ethers.keccak256(await f.provider.getCode(await policy.getAddress()));
  await (await f.moduleRegistry.setApproval(await policy.getAddress(), codehash)).wait();
  await (await f.moduleRegistry.setGlobalPause(false)).wait();
  return codehash;
}

async function deployApprovedPolicy(f) {
  const policy = await deploy(f.artifacts.policy, f.signers[0]);
  const codehash = await approvePolicy(f, policy);
  return { policy, codehash };
}

async function configurePolicyCall(f, policy, caller, to, value, data, result) {
  await (await policy.setExpected(
    await f.account.getAddress(),
    caller.address,
    await f.account.owner(),
    await f.account.policyEpoch(),
    to,
    value,
    ethers.keccak256(data),
    ethers.keccak256(result),
  )).wait();
}

function selectorXor(signatures) {
  let value = 0n;
  for (const signature of signatures) value ^= BigInt(ethers.id(signature).slice(0, 10));
  return ethers.toBeHex(value, 4);
}

async function revertData(promise) {
  try {
    const tx = await promise;
    await tx.wait();
    assert.fail('expected transaction to revert');
  } catch (error) {
    return error?.data?.data ?? error?.data ?? error?.info?.error?.data?.result ?? error?.info?.error?.data ?? null;
  }
}

test('account compiler and surface are exact and contain no upgrade or delegatecall authority', () => {
  const artifacts = compileAll();
  const functions = artifacts.account.abi
    .filter((entry) => entry.type === 'function')
    .map((entry) => `${entry.name}(${entry.inputs.map((input) => input.type).join(',')})`)
    .sort();
  assert.deepEqual(functions, [
    'execute(address,uint256,bytes,uint8)',
    'executeWithPolicy(address,uint256,bytes)',
    'isValidSignature(bytes32,bytes)',
    'isValidSigner(address,bytes)',
    'moduleRegistry()',
    'owner()',
    'policyEpoch()',
    'policyModule()',
    'policyModuleOwner()',
    'setPolicyModule(address)',
    'state()',
    'supportsInterface(bytes4)',
    'token()',
  ]);
  const constructor = artifacts.account.abi.find((entry) => entry.type === 'constructor');
  assert.deepEqual(constructor.inputs.map((input) => input.type), ['address']);
  const execute = artifacts.account.abi.find((entry) => entry.type === 'function' && entry.name === 'execute');
  assert.deepEqual(execute.outputs.map((output) => output.type), ['bytes']);
  const executeWithPolicy = artifacts.account.abi.find(
    (entry) => entry.type === 'function' && entry.name === 'executeWithPolicy',
  );
  assert.equal(executeWithPolicy.stateMutability, 'payable');
  assert.deepEqual(executeWithPolicy.outputs.map((output) => output.type), ['bytes']);
  assert.equal(artifacts.account.abi.filter((entry) => entry.type === 'receive').length, 1);
  assert.deepEqual(
    artifacts.account.abi.filter((entry) => entry.type === 'event').map((entry) => entry.name).sort(),
    ['PolicyModuleUpdated', 'StateUpdated'],
  );
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.match(source, /interface ILooperAgentPolicy\s*{/);
  assert.doesNotMatch(source, /\b(initializer|reinitializer|beacon|uups|upgradeTo|entrypoint|useroperation|factory|admin|selfdestruct)\b/i);
  assert.doesNotMatch(source, /\bdelegatecall\b/i);
});

test('constructor pins a deployed module registry and rejects zero or non-contract addresses', async () => {
  const artifacts = compileAll();
  const ganacheProvider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 2 } });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const deployer = await provider.getSigner(0);
  const eoa = await provider.getSigner(1);
  const moduleRegistry = await deploy(artifacts.moduleRegistry, deployer);
  const implementation = await deploy(artifacts.account, deployer, [await moduleRegistry.getAddress()]);
  assert.equal(await implementation.moduleRegistry(), await moduleRegistry.getAddress());
  await assert.rejects(deploy(artifacts.account, deployer, [ethers.ZeroAddress]));
  await assert.rejects(deploy(artifacts.account, deployer, [eoa.address]));
});

test('fresh create is canonical, immediately owned, and exposes token/state/ERC-165', async () => {
  const f = await fixture({ tokenId: 42n });
  const accountCode = await f.provider.getCode(await f.account.getAddress());
  const expectedCode = ethers.concat([
    '0x363d3d373d3d3d363d73',
    await f.implementation.getAddress(),
    '0x5af43d82803e903d91602b57fd5bf3',
    SALT,
    ethers.zeroPadValue(ethers.toBeHex(f.chainId), 32),
    ethers.zeroPadValue(await f.nft.getAddress(), 32),
    ethers.zeroPadValue(ethers.toBeHex(42n), 32),
  ]);
  assert.equal(ethers.dataLength(accountCode), 173);
  assert.equal(ethers.dataLength(expectedCode), 173);
  assert.equal(accountCode, expectedCode.toLowerCase());
  assert.deepEqual([...await f.account.token()], [f.chainId, await f.nft.getAddress(), 42n]);
  assert.equal(await f.account.owner(), f.owner.address);
  assert.equal(await f.account.state(), 0n);
  assert.equal(await f.account.moduleRegistry(), await f.moduleRegistry.getAddress());
  assert.equal(await f.account.policyModule(), ethers.ZeroAddress);
  assert.equal(await f.account.policyModuleOwner(), ethers.ZeroAddress);
  assert.equal(await f.account.policyEpoch(), 0n);
  assert.equal(accountCode.length, 2 + (173 * 2));
  assert.equal(await f.account.supportsInterface('0x01ffc9a7'), true);
  assert.equal(await f.account.supportsInterface('0x1626ba7e'), true);
  assert.equal(await f.account.supportsInterface('0x6faff5f1'), true);
  assert.equal(await f.account.supportsInterface(ethers.id('execute(address,uint256,bytes,uint8)').slice(0, 10)), true);
  const accountInterface = selectorXor([
    'execute(address,uint256,bytes,uint8)',
    'token()',
    'owner()',
    'state()',
    'isValidSigner(address,bytes)',
  ]);
  assert.equal(await f.account.supportsInterface(accountInterface), true);
  assert.equal(await f.account.supportsInterface('0xffffffff'), false);
});

test('only the current NFT owner can set or clear policy and every success advances epoch with exact event data', async () => {
  const f = await fixture();
  const { policy, codehash } = await deployApprovedPolicy(f);
  const policyAddress = await policy.getAddress();
  const accountAddress = await f.account.getAddress();
  const attacker = f.signers[4];

  await assert.rejects(f.account.connect(attacker).setPolicyModule(ethers.ZeroAddress));
  await assert.rejects(f.account.connect(attacker).setPolicyModule(policyAddress));

  const firstReceipt = await (await f.account.setPolicyModule(policyAddress)).wait();
  const event = f.account.interface.getEvent('PolicyModuleUpdated');
  const firstLogs = firstReceipt.logs.filter((log) => log.address === accountAddress && log.topics[0] === event.topicHash);
  assert.equal(firstLogs.length, 1);
  assert.equal(firstLogs[0].topics.length, 4);
  assert.equal(firstLogs[0].data, '0x');
  assert.deepEqual([...f.account.interface.parseLog(firstLogs[0]).args], [policyAddress, f.owner.address, 1n]);
  assert.equal(await f.account.policyModule(), policyAddress);
  assert.equal(await f.account.policyModuleOwner(), f.owner.address);
  assert.equal(await f.account.policyEpoch(), 1n);

  await (await f.account.setPolicyModule(policyAddress)).wait();
  assert.equal(await f.account.policyEpoch(), 2n);
  assert.equal(await f.account.policyModuleOwner(), f.owner.address);

  await (await f.moduleRegistry.setGlobalPause(true)).wait();
  const pausedClear = await (await f.account.setPolicyModule(ethers.ZeroAddress)).wait();
  assert.deepEqual(
    [...f.account.interface.parseLog(pausedClear.logs.find((log) => log.topics[0] === event.topicHash)).args],
    [ethers.ZeroAddress, ethers.ZeroAddress, 3n],
  );

  await (await f.moduleRegistry.setGlobalPause(false)).wait();
  await (await f.moduleRegistry.setApproval(policyAddress, codehash)).wait();
  await (await f.account.setPolicyModule(policyAddress)).wait();
  await (await f.moduleRegistry.setApproval(policyAddress, ethers.ZeroHash)).wait();
  await (await f.account.setPolicyModule(ethers.ZeroAddress)).wait();
  assert.equal(await f.account.policyEpoch(), 5n);

  await (await f.moduleRegistry.setApproval(policyAddress, codehash)).wait();
  await (await f.account.setPolicyModule(policyAddress)).wait();
  await (await f.moduleRegistry.setApproval(policyAddress, ethers.id('changed-code'))).wait();
  await (await f.account.setPolicyModule(ethers.ZeroAddress)).wait();
  assert.equal(await f.account.policyEpoch(), 7n);
  assert.equal(await f.account.policyModule(), ethers.ZeroAddress);
  assert.equal(await f.account.policyModuleOwner(), ethers.ZeroAddress);
});

test('nonzero policy selection fails closed on pause, approval, code, codehash, and strict capped ERC-165', async () => {
  const f = await fixture();
  const policy = await deploy(f.artifacts.policy, f.signers[0]);
  const policyAddress = await policy.getAddress();
  const codehash = ethers.keccak256(await f.provider.getCode(policyAddress));

  await assert.rejects(f.account.setPolicyModule(policyAddress));
  await (await f.moduleRegistry.setGlobalPause(false)).wait();
  await assert.rejects(f.account.setPolicyModule(policyAddress));

  await (await f.moduleRegistry.setApproval(f.signers[6].address, codehash)).wait();
  await assert.rejects(f.account.setPolicyModule(f.signers[6].address));

  await (await f.moduleRegistry.setApproval(policyAddress, ethers.id('wrong-codehash'))).wait();
  await assert.rejects(f.account.setPolicyModule(policyAddress));
  await (await f.moduleRegistry.setApproval(policyAddress, codehash)).wait();

  for (const supportMode of [1, 2, 3, 4, 6]) {
    await (await policy.setModes(supportMode, 0, 0)).wait();
    await assert.rejects(f.account.setPolicyModule(policyAddress));
  }

  await (await policy.setModes(5, 0, 0)).wait();
  await (await f.account.setPolicyModule(policyAddress, { gasLimit: 500_000 })).wait();
  assert.equal(await f.account.policyModule(), policyAddress);
  assert.equal(POLICY_INTERFACE_ID, selectorXor([
    'preAuthorizeAndConsume(address,address,uint256,address,uint256,bytes)',
    'postValidate(address,address,uint256,address,uint256,bytes,bytes)',
  ]));
});

test('policy execution passes exact context/result, caps hooks, increments before target, and returns exact bytes', async () => {
  const f = await fixture();
  const { policy } = await deployApprovedPolicy(f);
  const policyAddress = await policy.getAddress();
  const accountAddress = await f.account.getAddress();
  const sessionKey = f.signers[4];
  const payload = '0x00112233445566778899aabbccddeeff';
  const value = 17n;
  const targetAddress = await f.target.getAddress();
  const callData = f.target.interface.encodeFunctionData('record', [accountAddress, payload]);

  await (await f.account.setPolicyModule(policyAddress)).wait();
  await (await policy.setModes(5, 5, 5)).wait();
  await configurePolicyCall(f, policy, sessionKey, targetAddress, value, callData, payload);

  assert.equal(
    await f.account.connect(sessionKey).executeWithPolicy.staticCall(targetAddress, value, callData, { value: 100n }),
    payload,
  );
  const receipt = await (
    await f.account.connect(sessionKey).executeWithPolicy(targetAddress, value, callData, {
      value: 100n,
      gasLimit: 900_000,
    })
  ).wait();
  const stateLogs = receipt.logs.filter(
    (log) => log.address === accountAddress && log.topics[0] === f.account.interface.getEvent('StateUpdated').topicHash,
  );
  assert.equal(stateLogs.length, 1);
  assert.equal(await f.account.state(), 1n);
  assert.equal(await f.target.calls(), 1n);
  assert.equal(await f.target.observedState(), 1n);
  assert.equal(await f.target.lastValue(), value);
  assert.equal(await f.target.lastPayloadHash(), ethers.keccak256(payload));
  assert.equal(await policy.preCalls(), 1n);
  assert.equal(await policy.lastHookCaller(), accountAddress);
  assert.equal(
    await policy.lastPreDigest(),
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'address', 'uint256', 'bytes32'],
      [sessionKey.address, f.owner.address, 1n, targetAddress, value, ethers.keccak256(callData)],
    )),
  );
  assert.equal(await f.provider.getBalance(accountAddress), 83n);
  assert.equal(PRE_MAGIC, policy.interface.getFunction('preAuthorizeAndConsume').selector);
  assert.equal(POST_MAGIC, policy.interface.getFunction('postValidate').selector);
});

test('transfer, pause, removal, and codehash mismatch block policy before either hook or target', async () => {
  for (const blockedBy of ['transfer', 'pause', 'removal', 'codehash']) {
    const f = await fixture();
    const { policy } = await deployApprovedPolicy(f);
    const policyAddress = await policy.getAddress();
    const targetAddress = await f.target.getAddress();
    const data = f.target.interface.encodeFunctionData('record', [await f.account.getAddress(), '0x12']);
    await (await f.account.setPolicyModule(policyAddress)).wait();
    await configurePolicyCall(f, policy, f.signers[4], targetAddress, 0n, data, '0x12');

    if (blockedBy === 'transfer') {
      await (await f.nft.connect(f.owner).transferFrom(f.owner.address, f.signers[2].address, f.tokenId)).wait();
    } else if (blockedBy === 'pause') {
      await (await f.moduleRegistry.setGlobalPause(true)).wait();
    } else if (blockedBy === 'removal') {
      await (await f.moduleRegistry.setApproval(policyAddress, ethers.ZeroHash)).wait();
    } else {
      await (await f.moduleRegistry.setApproval(policyAddress, ethers.id('mismatch'))).wait();
    }

    await assert.rejects(async () => {
      const transaction = await f.account
        .connect(f.signers[4])
        .executeWithPolicy(targetAddress, 0, data, { gasLimit: 600_000 });
      await transaction.wait();
    });
    assert.equal(await policy.preCalls(), 0n);
    assert.equal(await f.target.calls(), 0n);
    assert.equal(await f.account.state(), 0n);
    if (blockedBy === 'transfer') {
      await (await f.account.connect(f.signers[2]).setPolicyModule(ethers.ZeroAddress)).wait();
      assert.equal(await f.account.policyEpoch(), 2n);
      assert.equal(await f.account.policyModuleOwner(), ethers.ZeroAddress);
    }
  }
});

test('pre hook enforces exact return length/magic, bubbles exact revert bytes, and rolls all state back', async () => {
  const f = await fixture();
  const { policy } = await deployApprovedPolicy(f);
  const policyAddress = await policy.getAddress();
  const sessionKey = f.signers[4];
  const targetAddress = await f.target.getAddress();
  const data = f.target.interface.encodeFunctionData('record', [await f.account.getAddress(), '0x99']);
  await (await f.account.setPolicyModule(policyAddress)).wait();
  await configurePolicyCall(f, policy, sessionKey, targetAddress, 0n, data, '0x99');

  for (const preMode of [1, 2, 3, 8]) {
    await (await policy.setModes(0, preMode, 0)).wait();
    await assert.rejects(async () => {
      const transaction = await f.account
        .connect(sessionKey)
        .executeWithPolicy(targetAddress, 0, data, { gasLimit: 600_000 });
      await transaction.wait();
    });
  }
  await (await policy.setModes(0, 4, 0)).wait();
  assert.equal(
    await revertData(f.account.connect(sessionKey).executeWithPolicy.staticCall(targetAddress, 0, data)),
    '0xaabbccdd',
  );
  assert.equal(await policy.preCalls(), 0n);
  assert.equal(await f.target.calls(), 0n);
  assert.equal(await f.account.state(), 0n);
});

test('target and post failures bubble exact bytes and roll back pre accounting, target effects, and account state', async () => {
  const f = await fixture();
  const { policy } = await deployApprovedPolicy(f);
  const policyAddress = await policy.getAddress();
  const sessionKey = f.signers[4];
  const targetAddress = await f.target.getAddress();
  await (await f.account.setPolicyModule(policyAddress)).wait();

  const targetRevert = f.target.interface.encodeFunctionData('revertExact');
  await configurePolicyCall(f, policy, sessionKey, targetAddress, 0n, targetRevert, '0x');
  assert.equal(
    await revertData(f.account.connect(sessionKey).executeWithPolicy.staticCall(targetAddress, 0, targetRevert)),
    '0xdeadbeef',
  );

  const data = f.target.interface.encodeFunctionData('record', [await f.account.getAddress(), '0x7788']);
  await configurePolicyCall(f, policy, sessionKey, targetAddress, 0n, data, '0x7788');
  for (const postMode of [1, 2, 3, 6]) {
    await (await policy.setModes(0, 0, postMode)).wait();
    await assert.rejects(async () => {
      const transaction = await f.account
        .connect(sessionKey)
        .executeWithPolicy(targetAddress, 0, data, { gasLimit: 700_000 });
      await transaction.wait();
    });
  }
  await (await policy.setModes(0, 0, 4)).wait();
  assert.equal(
    await revertData(f.account.connect(sessionKey).executeWithPolicy.staticCall(targetAddress, 0, data)),
    '0xfaceb00c',
  );
  assert.equal(await policy.preCalls(), 0n);
  assert.equal(await f.target.calls(), 0n);
  assert.equal(await f.account.state(), 0n);
});

test('one shared guard blocks owner-path and both policy-path reentrancy attempts', async () => {
  const f = await fixture();
  const contractOwner = await deploy(f.artifacts.contractOwner, f.signers[0]);
  const accountAddress = await f.account.getAddress();
  const contractOwnerAddress = await contractOwner.getAddress();
  await (await f.nft.connect(f.owner).transferFrom(f.owner.address, contractOwnerAddress, f.tokenId)).wait();
  const ownerReentry = contractOwner.interface.encodeFunctionData('reenterAccount', [accountAddress, f.signers[7].address]);
  await assert.rejects(async () => {
    const transaction = await contractOwner.executeAccount(
      accountAddress,
      contractOwnerAddress,
      0,
      ownerReentry,
      0,
      { gasLimit: 700_000 },
    );
    await transaction.wait();
  });
  assert.equal(await f.account.state(), 0n);

  const { policy } = await deployApprovedPolicy(f);
  const policyAddress = await policy.getAddress();
  await (await contractOwner.setPolicyAccount(accountAddress, policyAddress)).wait();
  const targetAddress = await f.target.getAddress();
  const data = f.target.interface.encodeFunctionData('record', [accountAddress, '0x01']);
  await configurePolicyCall(f, policy, f.signers[4], targetAddress, 0n, data, '0x01');
  for (const preMode of [6, 7]) {
    await (await policy.setModes(0, preMode, 0)).wait();
    await assert.rejects(async () => {
      const transaction = await f.account
        .connect(f.signers[4])
        .executeWithPolicy(targetAddress, 0, data, { gasLimit: 700_000 });
      await transaction.wait();
    });
  }
  assert.equal(await policy.preCalls(), 0n);
  assert.equal(await f.target.calls(), 0n);
  assert.equal(await f.account.state(), 0n);
});

test('fresh create receives ETH and owner executes ETH with exact return data', async () => {
  const f = await fixture();
  const accountAddress = await f.account.getAddress();
  const targetAddress = await f.target.getAddress();
  await (await f.signers[6].sendTransaction({ to: accountAddress, value: ethers.parseEther('2') })).wait();
  assert.equal(await f.provider.getBalance(accountAddress), ethers.parseEther('2'));

  const rawReturn = f.target.interface.encodeFunctionData('returnExact');
  assert.equal(await f.account.execute.staticCall(targetAddress, 0, rawReturn, 0), '0x11223344');
  await (await f.account.execute(targetAddress, ethers.parseEther('0.4'), '0x', 0)).wait();
  assert.equal(await f.provider.getBalance(targetAddress), ethers.parseEther('0.4'));
  assert.equal(await f.account.state(), 1n);
});

test('fresh create executes ERC-20 transfer and rejects non-owner and delegatecall operation', async () => {
  const f = await fixture();
  const [, , recipient, attacker] = f.signers;
  const accountAddress = await f.account.getAddress();
  await (await f.erc20.mint(accountAddress, 500n)).wait();
  const transfer = f.erc20.interface.encodeFunctionData('transfer', [recipient.address, 125n]);

  await (await f.account.execute(await f.erc20.getAddress(), 0, transfer, 0)).wait();
  assert.equal(await f.erc20.balanceOf(recipient.address), 125n);
  assert.equal(await f.erc20.balanceOf(accountAddress), 375n);

  await assert.rejects(f.account.connect(attacker).execute(await f.erc20.getAddress(), 0, transfer, 0));
  await assert.rejects(f.account.execute(await f.erc20.getAddress(), 0, transfer, 1));
  assert.equal(await f.account.state(), 1n);
});

test('StateUpdated increments before CALL and emits exactly once', async () => {
  const f = await fixture();
  const accountAddress = await f.account.getAddress();
  const call = f.target.interface.encodeFunctionData('observe', [accountAddress]);
  const receipt = await (await f.account.execute(await f.target.getAddress(), 0, call, 0)).wait();
  const stateTopic = f.account.interface.getEvent('StateUpdated').topicHash;
  const stateLogs = receipt.logs.filter((log) => log.address === accountAddress && log.topics[0] === stateTopic);
  assert.equal(stateLogs.length, 1);
  assert.equal(f.account.interface.parseLog(stateLogs[0]).args.state, 1n);
  assert.equal(await f.target.observedState(), 1n);
  assert.equal(await f.account.state(), 1n);
});

test('execution bubbles exact revert data and rolls state/event back', async () => {
  const f = await fixture();
  const call = f.target.interface.encodeFunctionData('revertExact');
  const data = await revertData(f.account.execute.staticCall(await f.target.getAddress(), 0, call, 0));
  assert.equal(data, '0xdeadbeef');
  await assert.rejects(async () => {
    const transaction = await f.account.execute(await f.target.getAddress(), 0, call, 0, { gasLimit: 500_000 });
    await transaction.wait();
  });
  assert.equal(await f.account.state(), 0n);
});

test('NFT transfer changes execution, EIP-1271, and signer authority immediately', async () => {
  const f = await fixture();
  const [, firstOwner, nextOwner, recipient] = f.signers;
  const digest = ethers.keccak256(ethers.toUtf8Bytes('transfer-control'));
  const initialAccounts = f.ganacheProvider.getInitialAccounts();
  const firstKey = initialAccounts[firstOwner.address.toLowerCase()].secretKey;
  const nextKey = initialAccounts[nextOwner.address.toLowerCase()].secretKey;
  const firstSignature = ethers.Signature.from(new ethers.SigningKey(firstKey).sign(digest)).serialized;
  const nextSignature = ethers.Signature.from(new ethers.SigningKey(nextKey).sign(digest)).serialized;

  assert.equal(await f.account.isValidSignature(digest, firstSignature), ERC1271_MAGIC);
  assert.equal(await f.account.isValidSignature(digest, nextSignature), INVALID_MAGIC);
  assert.equal(await f.account.isValidSigner(firstOwner.address, '0x'), ERC6551_SIGNER_MAGIC);
  assert.equal(await f.account.isValidSigner(nextOwner.address, '0x'), INVALID_MAGIC);

  await (await f.nft.connect(firstOwner).transferFrom(firstOwner.address, nextOwner.address, f.tokenId)).wait();
  assert.equal(await f.account.owner(), nextOwner.address);
  assert.equal(await f.account.isValidSignature(digest, firstSignature), INVALID_MAGIC);
  assert.equal(await f.account.isValidSignature(digest, nextSignature), ERC1271_MAGIC);
  assert.equal(await f.account.isValidSigner(firstOwner.address, '0x'), INVALID_MAGIC);
  assert.equal(await f.account.isValidSigner(nextOwner.address, '0x1234'), ERC6551_SIGNER_MAGIC);
  await assert.rejects(f.account.connect(firstOwner).execute(recipient.address, 0, '0x', 0));
  await (await f.account.connect(nextOwner).execute(recipient.address, 0, '0x', 0)).wait();
});

test('EIP-1271 contract owner controls signatures and execution', async () => {
  const f = await fixture();
  const contractOwner = await deploy(f.artifacts.contractOwner, f.signers[0]);
  await (await f.nft.connect(f.owner).transferFrom(f.owner.address, await contractOwner.getAddress(), f.tokenId)).wait();
  const digest = ethers.keccak256(ethers.toUtf8Bytes('contract-owner'));
  const signature = '0x123456';
  await (await contractOwner.setExpected(digest, signature)).wait();

  assert.equal(await f.account.owner(), await contractOwner.getAddress());
  assert.equal(await f.account.isValidSignature(digest, signature), ERC1271_MAGIC);
  assert.equal(await f.account.isValidSignature(digest, '0xabcdef'), INVALID_MAGIC);
  assert.equal(await f.account.isValidSigner(await contractOwner.getAddress(), '0x'), ERC6551_SIGNER_MAGIC);
  await (await contractOwner.executeAccount(await f.account.getAddress(), f.signers[5].address, 0, '0x', 0)).wait();
  assert.equal(await f.account.state(), 1n);
});

test('direct implementation and malformed noncanonical delegate context fail closed', async () => {
  const f = await fixture();
  const direct = new ethers.Contract(await f.implementation.getAddress(), f.artifacts.account.abi, f.owner);
  assert.deepEqual([...await direct.token()], [0n, ethers.ZeroAddress, 0n]);
  assert.equal(await direct.owner(), ethers.ZeroAddress);
  assert.equal(await direct.isValidSigner(f.owner.address, '0x'), INVALID_MAGIC);
  await assert.rejects(direct.execute(f.signers[4].address, 0, '0x', 0));

  const harness = await deploy(f.artifacts.harness, f.signers[0], [await f.implementation.getAddress()]);
  const malformed = new ethers.Contract(await harness.getAddress(), f.artifacts.account.abi, f.owner);
  assert.deepEqual([...await malformed.token()], [0n, ethers.ZeroAddress, 0n]);
  assert.equal(await malformed.owner(), ethers.ZeroAddress);
  assert.equal(await malformed.isValidSignature(ethers.ZeroHash, '0x'), INVALID_MAGIC);
  await assert.rejects(malformed.execute(f.signers[4].address, 0, '0x', 0));
});

test('canonical wrong-chain binding exposes token data but has no owner, signer, or execution authority', async () => {
  const f = await fixture({ tokenId: 70n });
  const wrongChainTokenId = 71n;
  const wrongChainId = f.chainId + 1n;
  await (await f.nft.mint(f.owner.address, wrongChainTokenId)).wait();
  const predicted = await f.registry.account(
    await f.implementation.getAddress(),
    SALT,
    wrongChainId,
    await f.nft.getAddress(),
    wrongChainTokenId,
  );
  await (await f.registry.createAccount(
    await f.implementation.getAddress(),
    SALT,
    wrongChainId,
    await f.nft.getAddress(),
    wrongChainTokenId,
  )).wait();
  const account = new ethers.Contract(predicted, f.artifacts.account.abi, f.owner);

  assert.deepEqual([...await account.token()], [wrongChainId, await f.nft.getAddress(), wrongChainTokenId]);
  assert.equal(await account.owner(), ethers.ZeroAddress);
  assert.equal(await account.isValidSigner(f.owner.address, '0x'), INVALID_MAGIC);
  assert.equal(await account.isValidSignature(ethers.ZeroHash, '0x'), INVALID_MAGIC);
  await (await f.signers[6].sendTransaction({ to: predicted, value: 1n })).wait();
  await assert.rejects(account.execute(f.signers[5].address, 0, '0x', 0));
  await assert.rejects(account.setPolicyModule(ethers.ZeroAddress));
  await assert.rejects(account.executeWithPolicy(f.signers[5].address, 0, '0x'));
});

test('burned token fails closed and arbitrary senders may still fund the account', async () => {
  const f = await fixture();
  const accountAddress = await f.account.getAddress();
  await (await f.signers[7].sendTransaction({ to: accountAddress, value: 123n })).wait();
  assert.equal(await f.provider.getBalance(accountAddress), 123n);
  await (await f.nft.connect(f.owner).burn(f.tokenId)).wait();
  assert.equal(await f.account.owner(), ethers.ZeroAddress);
  assert.equal(await f.account.isValidSigner(f.owner.address, '0x'), INVALID_MAGIC);
  await assert.rejects(f.account.execute(f.signers[4].address, 1, '0x', 0));
});

test('generated token bindings preserve tuple decoding and monotonic state', async () => {
  const f = await fixture({ tokenId: 1000n });
  for (let index = 0n; index < 32n; index += 1n) {
    const tokenId = 10_000n + index;
    const owner = f.signers[Number(index % 6n) + 1];
    await (await f.nft.mint(owner.address, tokenId)).wait();
    const predicted = await f.registry.account(
      await f.implementation.getAddress(),
      SALT,
      f.chainId,
      await f.nft.getAddress(),
      tokenId,
    );
    await (await f.registry.createAccount(
      await f.implementation.getAddress(),
      SALT,
      f.chainId,
      await f.nft.getAddress(),
      tokenId,
    )).wait();
    const account = new ethers.Contract(predicted, f.artifacts.account.abi, owner);
    assert.deepEqual([...await account.token()], [f.chainId, await f.nft.getAddress(), tokenId]);
    assert.equal(await account.owner(), owner.address);
    await (await account.execute(f.signers[7].address, 0, '0x', 0)).wait();
    assert.equal(await account.state(), 1n);
  }
});

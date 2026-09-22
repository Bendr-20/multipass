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

const FIXTURES = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccountState { function state() external view returns (uint256); }
interface IAgentAccount {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation) external returns (bytes memory);
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

    receive() external payable {}
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
  const implementation = await deploy(artifacts.account, signers[0]);
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
  return { artifacts, ganacheProvider, provider, signers, implementation, registry, nft, erc20, target, owner, tokenId, chainId, account };
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
    'isValidSignature(bytes32,bytes)',
    'isValidSigner(address,bytes)',
    'owner()',
    'state()',
    'supportsInterface(bytes4)',
    'token()',
  ]);
  const execute = artifacts.account.abi.find((entry) => entry.type === 'function' && entry.name === 'execute');
  assert.deepEqual(execute.outputs.map((output) => output.type), ['bytes']);
  assert.equal(artifacts.account.abi.filter((entry) => entry.type === 'receive').length, 1);
  assert.deepEqual(
    artifacts.account.abi.filter((entry) => entry.type === 'event').map((entry) => entry.name),
    ['StateUpdated'],
  );
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.doesNotMatch(source, /\b(initializer|reinitializer|beacon|uups|upgradeTo|entrypoint|useroperation|factory|module|admin|selfdestruct)\b/i);
  assert.doesNotMatch(source, /\bdelegatecall\b/i);
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

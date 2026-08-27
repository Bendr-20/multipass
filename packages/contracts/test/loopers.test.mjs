import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ethers } from 'ethers';
import ganache from 'ganache';
import solc from 'solc';

import { createAllowlistSnapshot } from '../../../apps/api/src/allowlist-snapshot.js';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALE_START_OFFSET = 3600n;
const ALLOWLIST_DURATION = 24n * 60n * 60n;
const TOTAL_SALE_DURATION = (7n * 24n * 60n * 60n) + (7n * 60n * 60n) + (7n * 60n) + 7n;

test('allowlist and public mint phases enforce price, proofs, and wallet caps', async () => {
  const fixture = await deployFixture();
  const { contract, signers, saleStart, allowlistPrice, publicPrice, merkle } = fixture;
  const [, alice, bob] = signers;

  await contract.setSaleConfig(saleStart, allowlistPrice, publicPrice, merkle.root);
  await fixture.increaseTo(saleStart);

  await assert.rejects(contract.connect(bob).allowlistMint(1, [], { value: allowlistPrice }));
  await contract.connect(alice).allowlistMint(3, merkle.proof(alice.address), { value: allowlistPrice * 3n });
  assert.equal(await contract.allowlistMintedByWallet(alice.address), 3n);
  assert.equal(await contract.mintedByWallet(alice.address), 3n);

  await assert.rejects(contract.connect(alice).allowlistMint(1, merkle.proof(alice.address), { value: allowlistPrice }));

  await fixture.increaseTo(saleStart + ALLOWLIST_DURATION);
  await assert.rejects(contract.connect(alice).publicMint(8, { value: publicPrice * 8n }));
  await contract.connect(bob).publicMint(10, { value: publicPrice * 10n });
  assert.equal(await contract.mintedByWallet(bob.address), 10n);
});

test('reserve mint is capped and public mint cannot consume unminted reserve', async () => {
  const fixture = await deployFixture();
  const { contract, signers, saleStart, allowlistPrice, publicPrice, merkle } = fixture;
  const [, alice] = signers;

  await contract.reserveMint(fixture.owner.address, 337);
  assert.equal(await contract.reserveMinted(), 337n);
  await assert.rejects(contract.reserveMint(fixture.owner.address, 1));

  await contract.setSaleConfig(saleStart, allowlistPrice, publicPrice, merkle.root);
  await fixture.increaseTo(saleStart);
  await contract.connect(alice).allowlistMint(1, merkle.proof(alice.address), { value: allowlistPrice });

  assert.equal(await contract.totalSupply(), 338n);
  assert.equal(await contract.remainingSupply(), 7439n);
});

test('pause stops new mints but not normal transfers', async () => {
  const fixture = await deployFixture();
  const { contract, signers, saleStart, allowlistPrice, publicPrice, merkle } = fixture;
  const [, alice, bob] = signers;

  await contract.setSaleConfig(saleStart, allowlistPrice, publicPrice, merkle.root);
  await fixture.increaseTo(saleStart);
  await contract.connect(alice).allowlistMint(1, merkle.proof(alice.address), { value: allowlistPrice });

  await contract.pause();
  await assert.rejects(contract.connect(alice).allowlistMint(1, merkle.proof(alice.address), { value: allowlistPrice }));

  await contract.connect(alice).transferFrom(alice.address, bob.address, 1);
  assert.equal(await contract.ownerOf(1), bob.address);
});

test('reveal uses placeholder before public phase and shifted final metadata after reveal', async () => {
  const fixture = await deployFixture();
  const { contract, signers, saleStart, allowlistPrice, publicPrice, merkle } = fixture;
  const [, alice] = signers;

  await contract.setSaleConfig(saleStart, allowlistPrice, publicPrice, merkle.root);
  await fixture.increaseTo(saleStart);
  await contract.connect(alice).allowlistMint(1, merkle.proof(alice.address), { value: allowlistPrice });

  assert.equal(await contract.tokenURI(1), 'ar://placeholder.json');
  await assert.rejects(contract.reveal('ar://final/', 5911));

  await fixture.increaseTo(saleStart + ALLOWLIST_DURATION);
  await contract.reveal('ar://final/', 5911, { gasLimit: 500_000 });

  assert.equal(await contract.revealed(), true);
  assert.equal(await contract.tokenURI(1), 'ar://final/5912.json');
});

test('owner-only controls, royalty cap, withdraw, and public close behave as launch gates expect', async () => {
  const fixture = await deployFixture();
  const { contract, signers, saleStart, allowlistPrice, publicPrice, merkle } = fixture;
  const [, alice, bob, treasury] = signers;

  await assert.rejects(contract.connect(alice).setMerkleRoot(ethers.ZeroHash));
  await contract.setSaleConfig(saleStart, allowlistPrice, publicPrice, merkle.root);
  await contract.setPrices(allowlistPrice, publicPrice);

  await fixture.increaseTo(saleStart + ALLOWLIST_DURATION);
  await assert.rejects(sendRevertingTx(contract.setPrices(allowlistPrice, publicPrice, { gasLimit: 500_000 })));
  await contract.connect(alice).publicMint(1, { value: publicPrice });

  const royalty = await contract.royaltyInfo(1, ethers.parseEther('1'));
  assert.equal(royalty[0], treasury.address);
  assert.equal(royalty[1], ethers.parseEther('0.05'));

  const before = await fixture.getBalance(treasury.address);
  await contract.withdraw();
  const after = await fixture.getBalance(treasury.address);
  assert.equal(after - before, publicPrice);

  await assert.rejects(contract.closePublicSupply());
  await fixture.increaseTo(saleStart + TOTAL_SALE_DURATION);
  await contract.closePublicSupply({ gasLimit: 500_000 });
  assert.equal(await contract.saleState(), 3n);
  await assert.rejects(contract.connect(bob).publicMint(1, { value: publicPrice }));
});

async function deployFixture() {
  const compiled = compileContract();
  const ganacheProvider = ganache.provider({
    chain: { hardfork: 'shanghai' },
    logging: { quiet: true },
    wallet: { totalAccounts: 6 },
  });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const signers = await Promise.all([...Array(6).keys()].map((index) => provider.getSigner(index)));
  const [owner,, , treasury] = signers;
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, owner);
  const contract = await factory.deploy(owner.address, treasury.address, 'ar://placeholder.json');
  await contract.waitForDeployment();

  const latest = await provider.getBlock('latest');
  const saleStart = BigInt(latest.timestamp) + SALE_START_OFFSET;
  const allowlistPrice = ethers.parseEther('0.0025');
  const publicPrice = ethers.parseEther('0.005');
  const merkle = buildMerkle([signers[1].address, signers[4].address]);

  return {
    contract,
    owner,
    signers,
    provider,
    saleStart,
    allowlistPrice,
    publicPrice,
    merkle,
    async increaseTo(timestamp) {
      const current = await latestGanacheTimestamp(ganacheProvider);
      if (timestamp > current) {
        await ganacheProvider.request({ method: 'evm_mine', params: [Number(timestamp)] });
        return;
      }
      await ganacheProvider.request({ method: 'evm_mine', params: [] });
    },
    async getBalance(address) {
      const balance = await ganacheProvider.request({ method: 'eth_getBalance', params: [address, 'latest'] });
      return BigInt(balance);
    },
  };
}

async function latestGanacheTimestamp(ganacheProvider) {
  const block = await ganacheProvider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] });
  return BigInt(block.timestamp);
}

async function sendRevertingTx(transactionPromise) {
  const transaction = await transactionPromise;
  await transaction.wait();
}

function compileContract() {
  const sourcePath = resolve(ROOT, 'src/Loopers.sol');
  const input = {
    language: 'Solidity',
    sources: {
      'src/Loopers.sol': { content: readFileSync(sourcePath, 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = output.errors?.filter((error) => error.severity === 'error') ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join('\n'));
  }
  const contract = output.contracts['src/Loopers.sol'].Loopers;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

function resolveImport(importPath) {
  try {
    return { contents: readFileSync(require.resolve(importPath, { paths: [ROOT] }), 'utf8') };
  } catch (error) {
    return { error: `Could not resolve ${importPath}: ${error.message}` };
  }
}

function buildMerkle(addresses) {
  const snapshot = createAllowlistSnapshot({
    entries: addresses.map((address) => ({ address, source: 'contract-test' })),
  }, { generatedAt: '2026-08-27T00:00:00.000Z' });

  return {
    root: snapshot.merkle.root,
    proof(address) {
      const entry = snapshot.entries.find((item) => item.address.toLowerCase() === address.toLowerCase());
      assert.ok(entry, 'address not in merkle tree');
      return entry.proof;
    },
  };
}

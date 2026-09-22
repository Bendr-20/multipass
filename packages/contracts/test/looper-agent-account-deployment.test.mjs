import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ethers } from 'ethers';

import {
  ACCOUNT_SALT,
  BASE_CHAIN_ID,
  ERC6551_REGISTRY,
  LOOPERS_COLLECTION,
  buildDeploymentPreparation,
  compileLooperAgentAccount,
  writeDeploymentPreparation,
} from '../scripts/deploy-looper-agent-account.js';

const DEPLOYER = '0x339559A2d1CD15059365FC7bD36b3047BbA480E0';
const OWNER = '0x1111111111111111111111111111111111111111';

function assertSha256(value) {
  assert.match(value, /^0x[0-9a-f]{64}$/);
}

test('deployment compiler emits deterministic creation bytecode, runtime and hashes', async () => {
  const first = await compileLooperAgentAccount();
  const second = await compileLooperAgentAccount();
  assert.deepEqual(first, second);
  assert.equal(first.contractName, 'LooperAgentAccount');
  assert.match(first.compiler.version, /^0\.8\.24\+/);
  assert.deepEqual(first.compiler.optimizer, { enabled: true, runs: 200 });
  assert.equal(first.compiler.evmVersion, 'paris');
  assert.deepEqual(first.compiler.metadata, { bytecodeHash: 'none', appendCBOR: false });
  assert.match(first.creationBytecode, /^0x[0-9a-f]+$/);
  assert.match(first.runtimeBytecode, /^0x[0-9a-f]+$/);
  assert.equal(first.creationBytes, ethers.dataLength(first.creationBytecode));
  assert.equal(first.runtimeBytes, ethers.dataLength(first.runtimeBytecode));
  assertSha256(first.sourceSha256);
  assertSha256(first.creationSha256);
  assertSha256(first.runtimeSha256);
  assert.ok(first.abi.some((entry) => entry.type === 'function' && entry.name === 'execute'));
});

test('deployment preparation emits exact unsigned deployment and Loopers config transactions', async () => {
  const compiled = await compileLooperAgentAccount();
  const preparation = buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 17 });
  const expectedImplementation = ethers.getCreateAddress({ from: DEPLOYER, nonce: 17 });
  const configInterface = new ethers.Interface([
    'function setERC6551Config(address registry,address implementation,bytes32 salt)',
  ]);

  assert.equal(preparation.schemaVersion, '1.0.0');
  assert.equal(preparation.chainId, BASE_CHAIN_ID);
  assert.equal(preparation.registry, ERC6551_REGISTRY);
  assert.equal(preparation.collection, LOOPERS_COLLECTION);
  assert.equal(preparation.salt, ACCOUNT_SALT);
  assert.equal(preparation.artifact.runtimeSha256, compiled.runtimeSha256);
  assert.equal(preparation.deployment.expectedAddress, expectedImplementation);
  assert.deepEqual(preparation.deployment.transaction, {
    chainId: '0x2105',
    from: DEPLOYER,
    to: null,
    nonce: '0x11',
    value: '0x0',
    data: compiled.creationBytecode,
  });
  assert.deepEqual(preparation.configUpdate.transaction, {
    chainId: '0x2105',
    from: OWNER,
    to: LOOPERS_COLLECTION,
    value: '0x0',
    data: configInterface.encodeFunctionData('setERC6551Config', [
      ERC6551_REGISTRY,
      expectedImplementation,
      ACCOUNT_SALT,
    ]),
  });
  assert.deepEqual(Array.from(configInterface.decodeFunctionData('setERC6551Config', preparation.configUpdate.transaction.data)), [
    ERC6551_REGISTRY,
    expectedImplementation,
    ACCOUNT_SALT,
  ]);
});

test('deployment preparation validates exact inputs and writes stable JSON', async () => {
  const compiled = await compileLooperAgentAccount();
  assert.throws(() => buildDeploymentPreparation({ compiled, deployer: 'bad', owner: OWNER, nonce: 1 }));
  assert.throws(() => buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: 'bad', nonce: 1 }));
  assert.throws(() => buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: -1 }));
  assert.throws(() => buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 1.5 }));

  const directory = await mkdtemp(join(tmpdir(), 'looper-agent-account-'));
  const outputPath = join(directory, 'deployment-preparation.json');
  const preparation = buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 17 });
  await writeDeploymentPreparation(preparation, outputPath);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), preparation);
});

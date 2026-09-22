import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ethers } from 'ethers';
import ganache from 'ganache';

import * as deployment from '../scripts/deploy-looper-agent-account.js';

const require = createRequire(import.meta.url);
const TEST_ROOT = dirname(fileURLToPath(import.meta.url));
const CONTRACT_ROOT = resolve(TEST_ROOT, '..');
const SCRIPT_PATH = resolve(CONTRACT_ROOT, 'scripts/deploy-looper-agent-account.js');
const DEPLOYER = '0x339559A2d1CD15059365FC7bD36b3047BbA480E0';
const OWNER = '0x1111111111111111111111111111111111111111';
const REGISTRY_SOURCE = 'src/LooperAgentModuleRegistry.sol';
const ACCOUNT_SOURCE = 'src/LooperAgentAccount.sol';

function assertSha256(value) {
  assert.match(value, /^0x[0-9a-f]{64}$/);
}

function sha256Hex(value) {
  return `0x${createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex')}`;
}

function sha256Text(value) {
  return `0x${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function extractImports(source) {
  return Array.from(source.matchAll(/\bimport\s+(?:[^'\"]*?\s+from\s+)?['\"]([^'\"]+)['\"]\s*;/g), (match) => match[1]);
}

function resolveSourceUnitName(importer, imported) {
  return imported.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(importer), imported))
    : imported;
}

function readSourceUnit(sourceUnitName) {
  const path = sourceUnitName.startsWith('src/')
    ? resolve(CONTRACT_ROOT, sourceUnitName)
    : require.resolve(sourceUnitName, { paths: [CONTRACT_ROOT] });
  return readFileSync(path, 'utf8');
}

function materializeTestSourceClosure() {
  const sources = new Map();
  const visit = (sourceUnitName) => {
    if (sources.has(sourceUnitName)) return;
    const content = readSourceUnit(sourceUnitName);
    sources.set(sourceUnitName, content);
    for (const imported of extractImports(content)) {
      visit(resolveSourceUnitName(sourceUnitName, imported));
    }
  };
  visit(ACCOUNT_SOURCE);
  visit(REGISTRY_SOURCE);
  return Object.fromEntries([...sources].sort(([left], [right]) => left.localeCompare(right)));
}

function canonicalCompilerInput(sources) {
  return {
    language: 'Solidity',
    sources: Object.fromEntries(Object.entries(sources).map(([sourceName, content]) => [sourceName, { content }])),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'none', appendCBOR: false },
      outputSelection: {
        '*': {
          '': ['ast'],
          '*': [
            'abi',
            'evm.bytecode.object',
            'evm.deployedBytecode.object',
            'evm.deployedBytecode.immutableReferences',
          ],
        },
      },
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

function tamperHex(value) {
  return `${value.slice(0, -2)}${value.endsWith('00') ? '01' : '00'}`;
}

function independentlyPatchRuntime(artifact, immutableDeclarations, immutableValues) {
  let body = artifact.runtimeBytecode.slice(2).toLowerCase();
  for (const [name, declarationId] of Object.entries(immutableDeclarations)) {
    const replacement = ethers.zeroPadValue(immutableValues[name], 32).slice(2).toLowerCase();
    for (const { start, length } of artifact.immutableReferences[String(declarationId)]) {
      assert.equal(length, 32);
      const hexStart = start * 2;
      const hexEnd = hexStart + (length * 2);
      body = `${body.slice(0, hexStart)}${replacement}${body.slice(hexEnd)}`;
    }
  }
  return `0x${body}`;
}

function runCli(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], { cwd: CONTRACT_ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
}

async function compileBundle() {
  assert.equal(typeof deployment.compileLooperReleaseBundle, 'function');
  return deployment.compileLooperReleaseBundle();
}

test('release compiler deterministically compiles both exact production contracts in one pinned input', async () => {
  const first = await compileBundle();
  const second = await compileBundle();

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, '2.0.0');
  assert.equal(first.kind, 'looper-permission-release-compile-bundle');
  assert.match(first.compiler.version, /^0\.8\.24\+/);
  assert.deepEqual(first.compiler.settings, {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    metadata: { bytecodeHash: 'none', appendCBOR: false },
  });
  assertSha256(first.compiler.inputSha256);
  const sourceClosure = materializeTestSourceClosure();
  const sourceNames = Object.keys(sourceClosure);
  assert.ok(sourceNames.length > 2);
  assert.ok(sourceNames.includes('@openzeppelin/contracts/interfaces/IERC1271.sol'));
  assert.deepEqual(Object.keys(first.sources), sourceNames);
  for (const [sourceName, content] of Object.entries(sourceClosure)) {
    assert.deepEqual(first.sources[sourceName], { sha256: sha256Text(content) });
    for (const imported of extractImports(content)) {
      assert.ok(
        sourceNames.includes(resolveSourceUnitName(sourceName, imported)),
        `${sourceName} has unresolved import ${imported}`,
      );
    }
  }
  assert.equal(
    first.compiler.inputSha256,
    sha256Text(JSON.stringify(canonicalCompilerInput(sourceClosure))),
  );
  assert.deepEqual(Object.keys(first.contracts), ['account', 'registry']);

  const expectedContracts = [
    ['account', 'LooperAgentAccount', ACCOUNT_SOURCE, ['_implementation', 'moduleRegistry']],
    ['registry', 'LooperAgentModuleRegistry', REGISTRY_SOURCE, ['collection']],
  ];
  for (const [key, contractName, sourceName, immutableNames] of expectedContracts) {
    const artifact = first.contracts[key];
    assert.equal(artifact.contractName, contractName);
    assert.equal(artifact.sourceName, sourceName);
    assert.match(artifact.creationBytecode, /^0x[0-9a-f]+$/);
    assert.match(artifact.runtimeBytecode, /^0x[0-9a-f]+$/);
    assert.equal(artifact.runtimePatched, false);
    assert.equal(artifact.creationBytes, ethers.dataLength(artifact.creationBytecode));
    assert.equal(artifact.runtimeBytes, ethers.dataLength(artifact.runtimeBytecode));
    assert.equal(artifact.creationSha256, sha256Hex(artifact.creationBytecode));
    assert.equal(artifact.runtimeSha256, sha256Hex(artifact.runtimeBytecode));
    assert.deepEqual(Object.keys(artifact.immutableDeclarations).sort(), immutableNames.sort());
    assert.equal(new Set(Object.values(artifact.immutableDeclarations)).size, immutableNames.length);
    assert.deepEqual(
      Object.keys(artifact.immutableReferences).sort((a, b) => Number(a) - Number(b)),
      Object.values(artifact.immutableDeclarations).map(String).sort((a, b) => Number(a) - Number(b)),
    );
    assert.ok(artifact.abi.length > 0);
  }
  assert.ok(first.contracts.account.abi.some((entry) => entry.type === 'function' && entry.name === 'executeWithPolicy'));
  assert.ok(first.contracts.registry.abi.some((entry) => entry.type === 'function' && entry.name === 'globallyPaused'));

  const compatible = await deployment.compileLooperAgentAccount();
  assert.deepEqual(compatible, first.contracts.account);
});

test('preparation rejects every material mutation of compiler evidence', async () => {
  const compiled = await compileBundle();
  const mutations = [
    ['creation bytecode', (bundle) => { bundle.contracts.account.creationBytecode = tamperHex(bundle.contracts.account.creationBytecode); }],
    ['runtime bytecode', (bundle) => { bundle.contracts.registry.runtimeBytecode = tamperHex(bundle.contracts.registry.runtimeBytecode); }],
    ['ABI', (bundle) => { bundle.contracts.account.abi.push({ type: 'function', name: 'forged', inputs: [], outputs: [] }); }],
    ['artifact hash', (bundle) => { bundle.contracts.account.creationSha256 = `0x${'11'.repeat(32)}`; }],
    ['source evidence', (bundle) => { bundle.sources[ACCOUNT_SOURCE].sha256 = `0x${'22'.repeat(32)}`; }],
    ['compiler settings', (bundle) => { bundle.compiler.settings.optimizer.runs = 201; }],
    ['compiler version', (bundle) => { bundle.compiler.version = '0.8.24+forged'; }],
    ['compiler input hash', (bundle) => { bundle.compiler.inputSha256 = `0x${'33'.repeat(32)}`; }],
    ['immutable references', (bundle) => {
      const id = String(bundle.contracts.account.immutableDeclarations._implementation);
      bundle.contracts.account.immutableReferences[id][0].start += 1;
    }],
    ['immutable mapping', (bundle) => {
      [bundle.contracts.account.immutableDeclarations._implementation, bundle.contracts.account.immutableDeclarations.moduleRegistry]
        = [bundle.contracts.account.immutableDeclarations.moduleRegistry, bundle.contracts.account.immutableDeclarations._implementation];
    }],
    ['contract identity', (bundle) => { bundle.contracts.registry.sourceName = ACCOUNT_SOURCE; }],
  ];

  for (const [label, mutate] of mutations) {
    const tampered = clone(compiled);
    mutate(tampered);
    assert.throws(
      () => deployment.buildDeploymentPreparation({ compiled: tampered, deployer: DEPLOYER, owner: OWNER, nonce: 17 }),
      /fresh canonical compiler evidence/i,
      label,
    );
  }
});

test('legacy flat account artifact remains accepted by the retained preparation builder', async () => {
  const compiled = await compileBundle();
  const flatAccountArtifact = await deployment.compileLooperAgentAccount();
  assert.deepEqual(flatAccountArtifact, compiled.contracts.account);

  const options = { deployer: DEPLOYER, owner: OWNER, nonce: 17 };
  const legacyPreview = deployment.buildDeploymentPreparation(flatAccountArtifact, options);
  const bundlePreview = deployment.buildDeploymentPreparation({ compiled, ...options });
  assert.deepEqual(legacyPreview, bundlePreview);
  assert.equal(legacyPreview.schemaVersion, '2.0.0');
});

test('legacy builder rejects a mismatched flat account artifact', async () => {
  const flatAccountArtifact = await deployment.compileLooperAgentAccount();
  flatAccountArtifact.runtimeSha256 = `0x${'44'.repeat(32)}`;
  assert.throws(
    () => deployment.buildDeploymentPreparation(flatAccountArtifact, {
      deployer: DEPLOYER,
      owner: OWNER,
      nonce: 17,
    }),
    /fresh canonical compiler evidence/i,
  );
});

test('historical single-object call accepts the canonical flat account artifact', async () => {
  const flatAccountArtifact = await deployment.compileLooperAgentAccount();
  const preview = deployment.buildDeploymentPreparation({
    compiled: flatAccountArtifact,
    deployer: DEPLOYER,
    owner: OWNER,
    nonce: 17,
  });

  assert.equal(preview.schemaVersion, '2.0.0');
  assert.equal(preview.compileBundle.kind, 'looper-permission-release-compile-bundle');
  assert.deepEqual(preview.compileBundle.contracts.account, flatAccountArtifact);
  assert.ok(preview.compileBundle.contracts.registry);
});

test('historical single-object call rejects a mismatched flat account artifact', async () => {
  const flatAccountArtifact = await deployment.compileLooperAgentAccount();
  flatAccountArtifact.runtimeSha256 = `0x${'55'.repeat(32)}`;
  assert.throws(
    () => deployment.buildDeploymentPreparation({
      compiled: flatAccountArtifact,
      deployer: DEPLOYER,
      owner: OWNER,
      nonce: 17,
    }),
    /flat account artifact does not match fresh canonical compiler evidence/i,
  );
});

test('preview predicts registry at nonce N and account at N+1 with exact constructor and config calldata', async () => {
  const compiled = await compileBundle();
  const preview = deployment.buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 17 });
  const expectedRegistry = ethers.getCreateAddress({ from: DEPLOYER, nonce: 17 });
  const expectedAccount = ethers.getCreateAddress({ from: DEPLOYER, nonce: 18 });
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const registryCreationData = ethers.concat([
    compiled.contracts.registry.creationBytecode,
    abiCoder.encode(['address'], [deployment.LOOPERS_COLLECTION]),
  ]);
  const accountCreationData = ethers.concat([
    compiled.contracts.account.creationBytecode,
    abiCoder.encode(['address'], [expectedRegistry]),
  ]);
  const configInterface = new ethers.Interface([
    'function setERC6551Config(address registry,address implementation,bytes32 salt)',
  ]);
  const configData = configInterface.encodeFunctionData('setERC6551Config', [
    deployment.ERC6551_REGISTRY,
    expectedAccount,
    deployment.ACCOUNT_SALT,
  ]);

  assert.equal(preview.schemaVersion, '2.0.0');
  assert.equal(preview.chainId, 8453);
  assert.equal(preview.registry, deployment.ERC6551_REGISTRY);
  assert.equal(preview.canonicalRegistry, deployment.ERC6551_REGISTRY);
  assert.equal(preview.collection, deployment.LOOPERS_COLLECTION);
  assert.equal(preview.salt, deployment.ACCOUNT_SALT);
  assert.deepEqual(preview.compileBundle, compiled);
  assert.deepEqual(preview.sourceCompilerEvidence, {
    compiler: compiled.compiler,
    sources: compiled.sources,
  });

  assert.equal(preview.registryDeployment.expectedAddress, expectedRegistry);
  assert.deepEqual(preview.registryDeployment.constructorArgs, { collection: deployment.LOOPERS_COLLECTION });
  assert.equal(preview.registryDeployment.creationData, registryCreationData);
  assert.equal(preview.registryDeployment.expectedRuntimeSha256, sha256Hex(preview.registryDeployment.expectedRuntimeBytecode));
  assert.deepEqual(preview.registryDeployment.transaction, {
    chainId: 8453,
    from: DEPLOYER,
    to: null,
    nonce: '17',
    value: '0x0',
    data: registryCreationData,
  });

  assert.equal(preview.accountDeployment.expectedAddress, expectedAccount);
  assert.deepEqual(preview.accountDeployment.constructorArgs, { moduleRegistry: expectedRegistry });
  assert.equal(preview.accountDeployment.creationData, accountCreationData);
  assert.equal(preview.accountDeployment.expectedRuntimeSha256, sha256Hex(preview.accountDeployment.expectedRuntimeBytecode));
  assert.deepEqual(preview.accountDeployment.transaction, {
    chainId: 8453,
    from: DEPLOYER,
    to: null,
    nonce: '18',
    value: '0x0',
    data: accountCreationData,
  });

  assert.deepEqual(preview.configUpdate.expected, {
    registry: deployment.ERC6551_REGISTRY,
    implementation: expectedAccount,
    salt: deployment.ACCOUNT_SALT,
  });
  assert.deepEqual(preview.configUpdate.transaction, {
    chainId: 8453,
    from: OWNER,
    to: deployment.LOOPERS_COLLECTION,
    value: '0x0',
    data: configData,
  });
  assert.deepEqual(Array.from(configInterface.decodeFunctionData('setERC6551Config', configData)), [
    deployment.ERC6551_REGISTRY,
    expectedAccount,
    deployment.ACCOUNT_SALT,
  ]);
});

test('preview patches registry collection and account implementation/module registry as separate declaration groups', async () => {
  const compiled = await compileBundle();
  const preview = deployment.buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 41 });
  const registry = compiled.contracts.registry;
  const account = compiled.contracts.account;

  const independentRegistry = deployment.patchImmutableRuntime({
    artifact: registry,
    immutableValues: { collection: deployment.LOOPERS_COLLECTION },
  });
  const independentAccount = deployment.patchImmutableRuntime({
    artifact: account,
    immutableValues: {
      _implementation: preview.accountDeployment.expectedAddress,
      moduleRegistry: preview.registryDeployment.expectedAddress,
    },
  });
  assert.equal(preview.registryDeployment.expectedRuntimeBytecode, independentRegistry);
  assert.equal(preview.accountDeployment.expectedRuntimeBytecode, independentAccount);
  assert.notEqual(independentRegistry, registry.runtimeBytecode);
  assert.notEqual(independentAccount, account.runtimeBytecode);

  for (const [name, address] of [
    ['_implementation', preview.accountDeployment.expectedAddress],
    ['moduleRegistry', preview.registryDeployment.expectedAddress],
  ]) {
    const declarationId = account.immutableDeclarations[name];
    for (const reference of account.immutableReferences[String(declarationId)]) {
      const start = 2 + (reference.start * 2);
      const end = start + (reference.length * 2);
      assert.equal(
        independentAccount.slice(start, end),
        ethers.zeroPadValue(address, 32).slice(2).toLowerCase(),
      );
    }
  }
});

test('immutable patcher rejects missing, unknown and reused declaration groups', async () => {
  const compiled = await compileBundle();
  const account = compiled.contracts.account;
  const values = { _implementation: DEPLOYER, moduleRegistry: OWNER };

  const missing = clone(account);
  delete missing.immutableReferences[String(missing.immutableDeclarations.moduleRegistry)];
  assert.throws(() => deployment.patchImmutableRuntime({ artifact: missing, immutableValues: values }), /missing/i);

  const unknown = clone(account);
  unknown.immutableReferences['999999'] = [{ start: 0, length: 32 }];
  assert.throws(() => deployment.patchImmutableRuntime({ artifact: unknown, immutableValues: values }), /unknown/i);

  const reused = clone(account);
  reused.immutableDeclarations.moduleRegistry = reused.immutableDeclarations._implementation;
  assert.throws(() => deployment.patchImmutableRuntime({ artifact: reused, immutableValues: values }), /reused|unique/i);

  assert.throws(
    () => deployment.patchImmutableRuntime({ artifact: account, immutableValues: { _implementation: DEPLOYER } }),
    /missing/i,
  );
  assert.throws(
    () => deployment.patchImmutableRuntime({ artifact: account, immutableValues: { ...values, surprise: OWNER } }),
    /unknown/i,
  );
});

test('immutable patcher rejects malformed, non-address, overlapping and out-of-range references', async () => {
  const compiled = await compileBundle();
  const account = compiled.contracts.account;
  const values = { _implementation: DEPLOYER, moduleRegistry: OWNER };
  const implementationId = String(account.immutableDeclarations._implementation);
  const registryId = String(account.immutableDeclarations.moduleRegistry);

  for (const badReference of [
    { start: -1, length: 32 },
    { start: 0.5, length: 32 },
    { start: 0, length: 0 },
    { start: 0, length: 31 },
  ]) {
    const malformed = clone(account);
    malformed.immutableReferences[implementationId] = [badReference];
    assert.throws(
      () => deployment.patchImmutableRuntime({ artifact: malformed, immutableValues: values }),
      /reference|32-byte/i,
    );
  }

  const overlapping = clone(account);
  const first = overlapping.immutableReferences[implementationId][0];
  overlapping.immutableReferences[registryId] = [{ ...first }];
  assert.throws(() => deployment.patchImmutableRuntime({ artifact: overlapping, immutableValues: values }), /overlap/i);

  const outOfRange = clone(account);
  outOfRange.immutableReferences[implementationId] = [{ start: account.runtimeBytes, length: 32 }];
  assert.throws(() => deployment.patchImmutableRuntime({ artifact: outOfRange, immutableValues: values }), /range/i);

  assert.throws(
    () => deployment.patchImmutableRuntime({ artifact: account, immutableValues: { ...values, moduleRegistry: 'bad' } }),
    /address/i,
  );
});

test('artifact-only CLI emits only the deterministic unpatched two-contract compile bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'looper-release-artifact-'));
  const outputPath = join(directory, 'bundle.json');
  const result = await runCli(['--artifact-only', '--output', outputPath]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  const written = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(JSON.parse(result.stdout), written);
  assert.equal(written.schemaVersion, '2.0.0');
  assert.equal(written.contracts.registry.runtimePatched, false);
  assert.equal(written.contracts.account.runtimePatched, false);
  assert.equal('expectedAddress' in written.contracts.registry, false);
  assert.equal('expectedRuntimeBytecode' in written.contracts.account, false);
  assert.equal(JSON.stringify(written).includes(DEPLOYER), false);
});

test('preview CLI requires exact inputs and safely refuses overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'looper-release-preview-'));
  const outputPath = join(directory, 'preview.json');
  const validArgs = [
    '--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '17', '--output', outputPath,
  ];
  const result = await runCli(validArgs);
  assert.equal(result.code, 0, result.stderr);
  const written = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(JSON.parse(result.stdout), written);
  assert.equal(written.registryDeployment.transaction.nonce, '17');
  assert.equal(written.accountDeployment.transaction.nonce, '18');

  await writeFile(outputPath, 'sentinel', 'utf8');
  const overwrite = await runCli(validArgs);
  assert.notEqual(overwrite.code, 0);
  assert.match(overwrite.stderr, /exists|overwrite/i);
  assert.equal(await readFile(outputPath, 'utf8'), 'sentinel');

  const invalidCases = [
    ['--preview', '--owner', OWNER, '--nonce', '17', '--output', join(directory, 'a.json')],
    ['--preview', '--deployer', DEPLOYER, '--nonce', '17', '--output', join(directory, 'b.json')],
    ['--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '17'],
    ['--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '017', '--output', join(directory, 'c.json')],
    ['--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '1.0', '--output', join(directory, 'd.json')],
    ['--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '9007199254740992', '--output', join(directory, 'e.json')],
    ['--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '17', '--output', join(directory, 'f.json'), '--wat'],
    ['--preview', '--preview', '--deployer', DEPLOYER, '--owner', OWNER, '--nonce', '17', '--output', join(directory, 'g.json')],
  ];
  for (const args of invalidCases) {
    const invalid = await runCli(args);
    assert.notEqual(invalid.code, 0, `unexpected success for ${args.join(' ')}`);
    assert.notEqual(invalid.stderr.trim(), '');
  }
});

test('write helper preserves stable JSON and refuses an unsafe overwrite', async () => {
  const compiled = await compileBundle();
  const directory = await mkdtemp(join(tmpdir(), 'looper-release-write-'));
  const outputPath = join(directory, 'preview.json');
  const preview = deployment.buildDeploymentPreparation({ compiled, deployer: DEPLOYER, owner: OWNER, nonce: 7 });
  await deployment.writeDeploymentPreparation(preview, outputPath);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), preview);
  await assert.rejects(deployment.writeDeploymentPreparation(preview, outputPath), /exists|overwrite/i);
});

test('preview tooling has no signer, private-key, RPC-write, send or broadcast path', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  for (const forbidden of [
    /private.?key/i,
    /new\s+ethers\.Wallet/,
    /sendTransaction\s*\(/,
    /broadcast/i,
    /JsonRpcProvider/,
    /eth_sendRawTransaction/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('fresh Ganache deployment matches independently patched predicted runtimes byte-for-byte', async () => {
  const compiled = await compileBundle();
  const ganacheProvider = ganache.provider({
    chain: { chainId: 8453, hardfork: 'shanghai' },
    logging: { quiet: true },
    wallet: { totalAccounts: 2, defaultBalance: 100 },
  });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const signer = await provider.getSigner(0);
  const deployer = await signer.getAddress();

  await ganacheProvider.request({
    method: 'evm_setAccountCode',
    params: [deployment.LOOPERS_COLLECTION, '0x00'],
  });
  await (await signer.sendTransaction({ to: deployer, value: 0n, nonce: 0 })).wait();
  await (await signer.sendTransaction({ to: deployer, value: 0n, nonce: 1 })).wait();
  const nonce = await provider.getTransactionCount(deployer);
  assert.equal(nonce, 2);

  const preview = deployment.buildDeploymentPreparation({ compiled, deployer, owner: OWNER, nonce });
  const registryReceipt = await (await signer.sendTransaction({
    data: preview.registryDeployment.transaction.data,
    nonce,
    value: 0n,
  })).wait();
  assert.equal(registryReceipt.status, 1);
  assert.equal(registryReceipt.contractAddress, preview.registryDeployment.expectedAddress);
  const accountReceipt = await (await signer.sendTransaction({
    data: preview.accountDeployment.transaction.data,
    nonce: nonce + 1,
    value: 0n,
  })).wait();
  assert.equal(accountReceipt.status, 1);
  assert.equal(accountReceipt.contractAddress, preview.accountDeployment.expectedAddress);

  const independentlyPatchedRegistry = independentlyPatchRuntime(
    compiled.contracts.registry,
    compiled.contracts.registry.immutableDeclarations,
    { collection: deployment.LOOPERS_COLLECTION },
  );
  const independentlyPatchedAccount = independentlyPatchRuntime(
    compiled.contracts.account,
    compiled.contracts.account.immutableDeclarations,
    {
      _implementation: preview.accountDeployment.expectedAddress,
      moduleRegistry: preview.registryDeployment.expectedAddress,
    },
  );
  const actualRegistryCode = await provider.getCode(preview.registryDeployment.expectedAddress);
  const actualAccountCode = await provider.getCode(preview.accountDeployment.expectedAddress);
  assert.equal(actualRegistryCode, independentlyPatchedRegistry);
  assert.equal(actualAccountCode, independentlyPatchedAccount);
  assert.equal(actualRegistryCode, preview.registryDeployment.expectedRuntimeBytecode);
  assert.equal(actualAccountCode, preview.accountDeployment.expectedRuntimeBytecode);

  const wrongMapping = clone(compiled.contracts.account);
  [wrongMapping.immutableDeclarations._implementation, wrongMapping.immutableDeclarations.moduleRegistry] = [
    wrongMapping.immutableDeclarations.moduleRegistry,
    wrongMapping.immutableDeclarations._implementation,
  ];
  const wronglyPatchedAccount = independentlyPatchRuntime(
    wrongMapping,
    wrongMapping.immutableDeclarations,
    {
      _implementation: preview.accountDeployment.expectedAddress,
      moduleRegistry: preview.registryDeployment.expectedAddress,
    },
  );
  assert.notEqual(wronglyPatchedAccount, actualAccountCode);
});

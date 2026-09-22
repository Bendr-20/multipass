import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { ethers } from 'ethers';
import solc from 'solc';

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CONTRACT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const ACCOUNT_SOURCE_NAME = 'src/LooperAgentAccount.sol';
const REGISTRY_SOURCE_NAME = 'src/LooperAgentModuleRegistry.sol';
const ACCOUNT_SOURCE_PATH = resolve(CONTRACT_ROOT, ACCOUNT_SOURCE_NAME);
const REGISTRY_SOURCE_PATH = resolve(CONTRACT_ROOT, REGISTRY_SOURCE_NAME);
const COMPILER_SETTINGS = Object.freeze({
  optimizer: Object.freeze({ enabled: true, runs: 200 }),
  evmVersion: 'paris',
  metadata: Object.freeze({ bytecodeHash: 'none', appendCBOR: false }),
});

export const BASE_CHAIN_ID = 8453;
export const ERC6551_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
export const LOOPERS_COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const ACCOUNT_SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';

const CONFIG_INTERFACE = new ethers.Interface([
  'function setERC6551Config(address registry,address implementation,bytes32 salt)',
]);
const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

export async function compileLooperReleaseBundle() {
  return compileCanonicalReleaseBundle();
}

function compileCanonicalReleaseBundle() {
  const sourceContents = materializeSourceClosure();
  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(
      Object.entries(sourceContents).map(([sourceName, content]) => [sourceName, { content }]),
    ),
    settings: {
      optimizer: { ...COMPILER_SETTINGS.optimizer },
      evmVersion: COMPILER_SETTINGS.evmVersion,
      metadata: { ...COMPILER_SETTINGS.metadata },
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
  const serializedInput = JSON.stringify(input);
  const output = JSON.parse(solc.compile(serializedInput));
  const errors = output.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));

  const inputSourceNames = Object.keys(sourceContents);
  const outputSourceNames = Object.keys(output.sources ?? {}).sort((left, right) => left.localeCompare(right));
  if (!sameStrings(inputSourceNames, outputSourceNames)) {
    throw new Error('compiler output source units do not match the materialized standard-json source closure.');
  }

  const account = buildArtifact({
    output,
    sourceName: ACCOUNT_SOURCE_NAME,
    contractName: 'LooperAgentAccount',
    immutableNames: ['_implementation', 'moduleRegistry'],
  });
  const registry = buildArtifact({
    output,
    sourceName: REGISTRY_SOURCE_NAME,
    contractName: 'LooperAgentModuleRegistry',
    immutableNames: ['collection'],
  });

  return {
    schemaVersion: '2.0.0',
    kind: 'looper-permission-release-compile-bundle',
    compiler: {
      version: solc.version(),
      settings: {
        optimizer: { ...COMPILER_SETTINGS.optimizer },
        evmVersion: COMPILER_SETTINGS.evmVersion,
        metadata: { ...COMPILER_SETTINGS.metadata },
      },
      inputSha256: sha256Text(serializedInput),
    },
    sources: Object.fromEntries(
      Object.entries(sourceContents).map(([sourceName, content]) => [sourceName, { sha256: sha256Text(content) }]),
    ),
    contracts: { account, registry },
  };
}

export async function compileLooperAgentAccount() {
  return (await compileLooperReleaseBundle()).contracts.account;
}

export function patchImmutableRuntime({ artifact, immutableValues }) {
  if (!artifact || typeof artifact !== 'object') throw new Error('compiled contract artifact is required.');
  const runtimeBytecode = artifact.runtimeBytecode;
  if (!ethers.isHexString(runtimeBytecode) || runtimeBytecode === '0x') {
    throw new Error('compiled runtime bytecode is invalid.');
  }
  const runtimeBytes = ethers.dataLength(runtimeBytecode);
  if (artifact.runtimeBytes !== runtimeBytes) throw new Error('compiled runtime byte length is inconsistent.');

  const declarations = artifact.immutableDeclarations;
  const references = artifact.immutableReferences;
  if (!isPlainObject(declarations) || !isPlainObject(references)) {
    throw new Error('compiled immutable declaration groups are invalid.');
  }
  if (!isPlainObject(immutableValues)) throw new Error('immutable values are required.');

  const targetNames = Object.keys(declarations);
  const valueNames = Object.keys(immutableValues);
  for (const name of targetNames) {
    if (!Object.hasOwn(immutableValues, name)) throw new Error(`missing immutable value for ${name}.`);
  }
  for (const name of valueNames) {
    if (!Object.hasOwn(declarations, name)) throw new Error(`unknown immutable value ${name}.`);
  }

  const targetIds = new Map();
  for (const name of targetNames) {
    const declarationId = declarations[name];
    if (!Number.isSafeInteger(declarationId) || declarationId < 0) {
      throw new Error(`immutable declaration ID for ${name} is invalid.`);
    }
    const key = String(declarationId);
    if (targetIds.has(key)) {
      throw new Error(`immutable declaration group ${key} is reused by multiple targets.`);
    }
    targetIds.set(key, name);
  }
  for (const key of Object.keys(references)) {
    if (!targetIds.has(key)) throw new Error(`unknown immutable declaration ID ${key}.`);
  }
  for (const key of targetIds.keys()) {
    if (!Object.hasOwn(references, key)) throw new Error(`missing immutable declaration group ${key}.`);
  }

  const normalizedValues = new Map();
  for (const name of targetNames) {
    normalizedValues.set(name, normalizeAddress(immutableValues[name], `immutable ${name}`));
  }

  const patches = [];
  for (const [declarationId, name] of targetIds) {
    const group = references[declarationId];
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(`immutable declaration group ${declarationId} must exist exactly once and contain references.`);
    }
    for (const reference of group) {
      if (!isPlainObject(reference)
        || !Number.isSafeInteger(reference.start)
        || !Number.isSafeInteger(reference.length)
        || reference.start < 0
        || reference.length <= 0) {
        throw new Error(`immutable reference for ${name} is invalid.`);
      }
      if (reference.length !== 32) throw new Error(`address immutable ${name} must use a 32-byte slot.`);
      const end = reference.start + reference.length;
      if (!Number.isSafeInteger(end) || end > runtimeBytes) {
        throw new Error(`immutable reference for ${name} is out of range.`);
      }
      patches.push({
        start: reference.start,
        end,
        name,
        replacement: ethers.zeroPadValue(normalizedValues.get(name), 32).slice(2).toLowerCase(),
      });
    }
  }

  patches.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index].start < patches[index - 1].end) {
      throw new Error(`immutable references for ${patches[index - 1].name} and ${patches[index].name} overlap.`);
    }
  }

  let body = runtimeBytecode.slice(2).toLowerCase();
  for (const patch of patches) {
    const start = patch.start * 2;
    const end = patch.end * 2;
    body = `${body.slice(0, start)}${patch.replacement}${body.slice(end)}`;
  }
  return `0x${body}`;
}

export function buildDeploymentPreparation(compiledOrRequest, legacyOptions) {
  const canonicalBundle = compileCanonicalReleaseBundle();
  let options;
  if (legacyOptions !== undefined) {
    requireCanonicalEvidence(
      compiledOrRequest,
      canonicalBundle.contracts.account,
      'flat account artifact',
    );
    options = legacyOptions;
  } else {
    if (!isPlainObject(compiledOrRequest)) {
      throw new Error('compiled release bundle and preparation options are required.');
    }
    const { compiled, deployer, owner, nonce } = compiledOrRequest;
    requireCanonicalEvidence(compiled, canonicalBundle, 'release bundle');
    options = { deployer, owner, nonce };
  }

  return buildCanonicalDeploymentPreparation(canonicalBundle, options);
}

function buildCanonicalDeploymentPreparation(compiled, { deployer, owner, nonce }) {
  const normalizedDeployer = normalizeAddress(deployer, 'deployer');
  const normalizedOwner = normalizeAddress(owner, 'owner');
  if (!Number.isSafeInteger(nonce) || nonce < 0 || !Number.isSafeInteger(nonce + 1)) {
    throw new Error('nonce must be a non-negative safe integer with room for two deployments.');
  }

  const registryArtifact = compiled.contracts.registry;
  const accountArtifact = compiled.contracts.account;
  const expectedRegistry = ethers.getCreateAddress({ from: normalizedDeployer, nonce });
  const expectedAccount = ethers.getCreateAddress({ from: normalizedDeployer, nonce: nonce + 1 });
  const registryCreationData = ethers.concat([
    registryArtifact.creationBytecode,
    ABI_CODER.encode(['address'], [LOOPERS_COLLECTION]),
  ]);
  const accountCreationData = ethers.concat([
    accountArtifact.creationBytecode,
    ABI_CODER.encode(['address'], [expectedRegistry]),
  ]);
  const expectedRegistryRuntime = patchImmutableRuntime({
    artifact: registryArtifact,
    immutableValues: { collection: LOOPERS_COLLECTION },
  });
  const expectedAccountRuntime = patchImmutableRuntime({
    artifact: accountArtifact,
    immutableValues: {
      _implementation: expectedAccount,
      moduleRegistry: expectedRegistry,
    },
  });
  const configData = CONFIG_INTERFACE.encodeFunctionData('setERC6551Config', [
    ERC6551_REGISTRY,
    expectedAccount,
    ACCOUNT_SALT,
  ]);

  return {
    schemaVersion: '2.0.0',
    chainId: BASE_CHAIN_ID,
    registry: ERC6551_REGISTRY,
    canonicalRegistry: ERC6551_REGISTRY,
    collection: LOOPERS_COLLECTION,
    salt: ACCOUNT_SALT,
    compileBundle: compiled,
    sourceCompilerEvidence: {
      compiler: compiled.compiler,
      sources: compiled.sources,
    },
    registryDeployment: deploymentSection({
      artifact: registryArtifact,
      expectedAddress: expectedRegistry,
      constructorArgs: { collection: LOOPERS_COLLECTION },
      creationData: registryCreationData,
      expectedRuntimeBytecode: expectedRegistryRuntime,
      from: normalizedDeployer,
      nonce,
    }),
    accountDeployment: deploymentSection({
      artifact: accountArtifact,
      expectedAddress: expectedAccount,
      constructorArgs: { moduleRegistry: expectedRegistry },
      creationData: accountCreationData,
      expectedRuntimeBytecode: expectedAccountRuntime,
      from: normalizedDeployer,
      nonce: nonce + 1,
    }),
    configUpdate: {
      expected: {
        registry: ERC6551_REGISTRY,
        implementation: expectedAccount,
        salt: ACCOUNT_SALT,
      },
      transaction: {
        chainId: BASE_CHAIN_ID,
        from: normalizedOwner,
        to: LOOPERS_COLLECTION,
        value: '0x0',
        data: configData,
      },
    },
  };
}

export async function writeDeploymentPreparation(preparation, outputPath) {
  if (!outputPath || typeof outputPath !== 'string') throw new Error('output path is required.');
  const resolved = resolve(outputPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(preparation, null, 2)}\n`, { flag: 'wx' });
  return resolved;
}

function buildArtifact({ output, sourceName, contractName, immutableNames }) {
  const contract = output.contracts?.[sourceName]?.[contractName];
  const ast = output.sources?.[sourceName]?.ast;
  if (!contract) throw new Error(`${contractName} compiler output is missing.`);
  if (!ast) throw new Error(`${contractName} AST output is missing.`);

  const immutableDeclarations = findImmutableDeclarations(ast, contractName, immutableNames);
  const immutableReferences = normalizeImmutableReferences(
    contract.evm?.deployedBytecode?.immutableReferences,
  );
  const expectedIds = Object.values(immutableDeclarations).map(String).sort(compareNumericStrings);
  const actualIds = Object.keys(immutableReferences).sort(compareNumericStrings);
  if (!sameStrings(expectedIds, actualIds)) {
    const unknown = actualIds.filter((id) => !expectedIds.includes(id));
    const missing = expectedIds.filter((id) => !actualIds.includes(id));
    throw new Error(
      `${contractName} immutable reference IDs do not match AST declarations`
      + ` (unknown: ${unknown.join(',') || 'none'}; missing: ${missing.join(',') || 'none'}).`,
    );
  }

  const creationBytecode = `0x${contract.evm.bytecode.object}`;
  const runtimeBytecode = `0x${contract.evm.deployedBytecode.object}`;
  const artifact = {
    contractName,
    sourceName,
    abi: contract.abi,
    creationBytecode,
    creationBytes: ethers.dataLength(creationBytecode),
    creationSha256: sha256Hex(creationBytecode),
    runtimeBytecode,
    runtimeBytes: ethers.dataLength(runtimeBytecode),
    runtimeSha256: sha256Hex(runtimeBytecode),
    runtimePatched: false,
    immutableDeclarations,
    immutableReferences,
  };
  patchImmutableRuntime({
    artifact,
    immutableValues: Object.fromEntries(immutableNames.map((name) => [name, ethers.ZeroAddress])),
  });
  return artifact;
}

function findImmutableDeclarations(ast, contractName, expectedNames) {
  const contractDefinitions = (ast.nodes ?? []).filter(
    (node) => node.nodeType === 'ContractDefinition' && node.name === contractName,
  );
  if (contractDefinitions.length !== 1) {
    throw new Error(`AST must contain exactly one ${contractName} declaration.`);
  }
  const immutableVariables = (contractDefinitions[0].nodes ?? []).filter(
    (node) => node.nodeType === 'VariableDeclaration'
      && node.stateVariable === true
      && node.mutability === 'immutable',
  );
  const expectedSet = new Set(expectedNames);
  const unknown = immutableVariables.filter((node) => !expectedSet.has(node.name));
  if (unknown.length) {
    throw new Error(`${contractName} contains unknown immutable state variables: ${unknown.map((node) => node.name).join(', ')}.`);
  }

  const declarations = {};
  for (const name of expectedNames) {
    const matches = immutableVariables.filter((node) => node.name === name);
    if (matches.length !== 1) {
      throw new Error(`${contractName}.${name} must have exactly one immutable state-variable declaration.`);
    }
    if (!Number.isSafeInteger(matches[0].id) || matches[0].id < 0) {
      throw new Error(`${contractName}.${name} has an invalid AST declaration ID.`);
    }
    declarations[name] = matches[0].id;
  }
  if (new Set(Object.values(declarations)).size !== expectedNames.length) {
    throw new Error(`${contractName} immutable declaration IDs must be unique.`);
  }
  return declarations;
}

function normalizeImmutableReferences(rawReferences) {
  if (!isPlainObject(rawReferences)) throw new Error('compiler immutable references are missing.');
  const normalized = {};
  for (const declarationId of Object.keys(rawReferences).sort(compareNumericStrings)) {
    const group = rawReferences[declarationId];
    if (!Array.isArray(group)) throw new Error(`immutable declaration group ${declarationId} is invalid.`);
    normalized[declarationId] = group
      .map(({ start, length }) => ({ start, length }))
      .sort((left, right) => left.start - right.start || left.length - right.length);
  }
  return normalized;
}

function deploymentSection({
  artifact,
  expectedAddress,
  constructorArgs,
  creationData,
  expectedRuntimeBytecode,
  from,
  nonce,
}) {
  return {
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    artifact,
    expectedAddress,
    constructorArgs,
    creationData,
    creationBytes: ethers.dataLength(creationData),
    creationSha256: sha256Hex(creationData),
    expectedRuntimeBytecode,
    expectedRuntimeBytes: ethers.dataLength(expectedRuntimeBytecode),
    expectedRuntimeSha256: sha256Hex(expectedRuntimeBytecode),
    transaction: {
      chainId: BASE_CHAIN_ID,
      from,
      to: null,
      nonce: String(nonce),
      value: '0x0',
      data: creationData,
    },
  };
}

function requireCanonicalEvidence(candidate, canonical, label) {
  let candidateDigest;
  let canonicalDigest;
  try {
    candidateDigest = sha256Text(JSON.stringify(candidate));
    canonicalDigest = sha256Text(JSON.stringify(canonical));
  } catch {
    throw new Error(`${label} does not match fresh canonical compiler evidence.`);
  }
  if (candidateDigest !== canonicalDigest || !isDeepStrictEqual(candidate, canonical)) {
    throw new Error(`${label} does not match fresh canonical compiler evidence.`);
  }
}

function normalizeAddress(value, label) {
  try {
    return ethers.getAddress(String(value ?? ''));
  } catch {
    throw new Error(`${label} must be a valid address.`);
  }
}

function sha256Text(value) {
  return `0x${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function sha256Hex(value) {
  return `0x${createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex')}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareNumericStrings(left, right) {
  return Number(left) - Number(right);
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function materializeSourceClosure() {
  const sourceContents = new Map();
  const visit = (sourceUnitName) => {
    if (sourceContents.has(sourceUnitName)) return;
    const content = readSourceUnit(sourceUnitName);
    sourceContents.set(sourceUnitName, content);
    for (const imported of extractImports(content)) {
      visit(resolveSourceUnitName(sourceUnitName, imported));
    }
  };
  visit(ACCOUNT_SOURCE_NAME);
  visit(REGISTRY_SOURCE_NAME);
  return Object.fromEntries(
    [...sourceContents].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function extractImports(source) {
  return Array.from(
    source.matchAll(/\bimport\s+(?:[^'\"]*?\s+from\s+)?['\"]([^'\"]+)['\"]\s*;/g),
    (match) => match[1],
  );
}

function resolveSourceUnitName(importer, imported) {
  return imported.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(importer), imported))
    : imported;
}

function readSourceUnit(sourceUnitName) {
  if (sourceUnitName === ACCOUNT_SOURCE_NAME) return readFileSync(ACCOUNT_SOURCE_PATH, 'utf8');
  if (sourceUnitName === REGISTRY_SOURCE_NAME) return readFileSync(REGISTRY_SOURCE_PATH, 'utf8');
  try {
    return readFileSync(require.resolve(sourceUnitName, { paths: [CONTRACT_ROOT] }), 'utf8');
  } catch (error) {
    throw new Error(`Could not materialize Solidity source ${sourceUnitName}: ${error.message}`);
  }
}

function parseArguments(argv) {
  const values = new Map();
  let mode = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--artifact-only' || argument === '--preview') {
      if (mode) throw new Error('Choose exactly one mode.');
      mode = argument;
      continue;
    }
    if (!['--deployer', '--owner', '--nonce', '--output'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (values.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    values.set(argument, value);
    index += 1;
  }
  if (!mode) throw new Error('Use --artifact-only or --preview.');

  if (mode === '--artifact-only') {
    for (const argument of ['--deployer', '--owner', '--nonce']) {
      if (values.has(argument)) throw new Error(`${argument} is not valid with --artifact-only.`);
    }
    return { mode, values };
  }

  for (const argument of ['--deployer', '--owner', '--nonce', '--output']) {
    if (!values.has(argument)) throw new Error(`${argument} is required with --preview.`);
  }
  const nonceValue = values.get('--nonce');
  if (!/^(0|[1-9]\d*)$/.test(nonceValue)) {
    throw new Error('--nonce must be a canonical decimal integer.');
  }
  const nonce = Number(nonceValue);
  if (!Number.isSafeInteger(nonce) || !Number.isSafeInteger(nonce + 1)) {
    throw new Error('--nonce must be a safe integer with room for two deployments.');
  }
  return { mode, values, nonce };
}

async function main() {
  const { mode, values, nonce } = parseArguments(process.argv.slice(2));
  const compiled = await compileLooperReleaseBundle();
  const outputPath = values.get('--output')
    ?? resolve(CONTRACT_ROOT, 'build/LooperAgentPermissionRelease.json');
  if (mode === '--artifact-only') {
    await writeDeploymentPreparation(compiled, outputPath);
    process.stdout.write(`${JSON.stringify(compiled, null, 2)}\n`);
    return;
  }

  const preparation = buildDeploymentPreparation({
    compiled,
    deployer: values.get('--deployer'),
    owner: values.get('--owner'),
    nonce,
  });
  await writeDeploymentPreparation(preparation, outputPath);
  process.stdout.write(`${JSON.stringify(preparation, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ethers } from 'ethers';
import solc from 'solc';

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CONTRACT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const SOURCE_PATH = resolve(CONTRACT_ROOT, 'src/LooperAgentAccount.sol');

export const BASE_CHAIN_ID = 8453;
export const ERC6551_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
export const LOOPERS_COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
export const ACCOUNT_SALT = '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee';

const CONFIG_INTERFACE = new ethers.Interface([
  'function setERC6551Config(address registry,address implementation,bytes32 salt)',
]);

export async function compileLooperAgentAccount() {
  const source = await readFile(SOURCE_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'src/LooperAgentAccount.sol': { content: source } },
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

  const contract = output.contracts['src/LooperAgentAccount.sol']?.LooperAgentAccount;
  if (!contract) throw new Error('LooperAgentAccount compiler output is missing.');
  const creationBytecode = `0x${contract.evm.bytecode.object}`;
  const runtimeBytecode = `0x${contract.evm.deployedBytecode.object}`;
  return {
    contractName: 'LooperAgentAccount',
    compiler: {
      version: solc.version(),
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'none', appendCBOR: false },
    },
    sourceSha256: sha256Text(source),
    creationBytecode,
    creationBytes: ethers.dataLength(creationBytecode),
    creationSha256: sha256Hex(creationBytecode),
    runtimeBytecode,
    runtimeBytes: ethers.dataLength(runtimeBytecode),
    runtimeSha256: sha256Hex(runtimeBytecode),
    abi: contract.abi,
  };
}

export function buildDeploymentPreparation({ compiled, deployer, owner, nonce }) {
  validateCompiled(compiled);
  const normalizedDeployer = normalizeAddress(deployer, 'deployer');
  const normalizedOwner = normalizeAddress(owner, 'owner');
  if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('nonce must be a non-negative safe integer.');

  const expectedAddress = ethers.getCreateAddress({ from: normalizedDeployer, nonce });
  const configData = CONFIG_INTERFACE.encodeFunctionData('setERC6551Config', [
    ERC6551_REGISTRY,
    expectedAddress,
    ACCOUNT_SALT,
  ]);
  return {
    schemaVersion: '1.0.0',
    chainId: BASE_CHAIN_ID,
    registry: ERC6551_REGISTRY,
    collection: LOOPERS_COLLECTION,
    salt: ACCOUNT_SALT,
    artifact: compiled,
    deployment: {
      expectedAddress,
      transaction: {
        chainId: '0x2105',
        from: normalizedDeployer,
        to: null,
        nonce: ethers.toBeHex(nonce),
        value: '0x0',
        data: compiled.creationBytecode,
      },
    },
    configUpdate: {
      expected: {
        registry: ERC6551_REGISTRY,
        implementation: expectedAddress,
        salt: ACCOUNT_SALT,
      },
      transaction: {
        chainId: '0x2105',
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
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(preparation, null, 2)}\n`);
  return resolve(outputPath);
}

function validateCompiled(compiled) {
  if (!compiled || compiled.contractName !== 'LooperAgentAccount') throw new Error('compiled account artifact is required.');
  if (!ethers.isHexString(compiled.creationBytecode) || compiled.creationBytecode === '0x') {
    throw new Error('compiled creation bytecode is invalid.');
  }
  if (!ethers.isHexString(compiled.runtimeBytecode) || compiled.runtimeBytecode === '0x') {
    throw new Error('compiled runtime bytecode is invalid.');
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

function resolveImport(importPath) {
  try {
    return { contents: readFileSync(require.resolve(importPath, { paths: [CONTRACT_ROOT] }), 'utf8') };
  } catch (error) {
    return { error: `Could not resolve ${importPath}: ${error.message}` };
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
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    values.set(argument, value);
    index += 1;
  }
  if (!mode) throw new Error('Use --artifact-only or --preview.');
  return { mode, values };
}

async function main() {
  const { mode, values } = parseArguments(process.argv.slice(2));
  const compiled = await compileLooperAgentAccount();
  const outputPath = values.get('--output') ?? resolve(CONTRACT_ROOT, 'build/LooperAgentAccount.json');
  if (mode === '--artifact-only') {
    await writeDeploymentPreparation(compiled, outputPath);
    process.stdout.write(`${JSON.stringify(compiled, null, 2)}\n`);
    return;
  }

  const nonceValue = values.get('--nonce');
  if (!nonceValue || !/^\d+$/.test(nonceValue)) throw new Error('--nonce must be a canonical decimal integer.');
  const preparation = buildDeploymentPreparation({
    compiled,
    deployer: values.get('--deployer'),
    owner: values.get('--owner'),
    nonce: Number(nonceValue),
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

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import solc from 'solc';

const require = createRequire(import.meta.url);
export const CONTRACT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function compileLoopers() {
  const sourcePath = resolve(CONTRACT_ROOT, 'src/Loopers.sol');
  const input = {
    language: 'Solidity',
    sources: {
      'src/Loopers.sol': { content: await readFile(sourcePath, 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'metadata'],
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
    contractName: 'Loopers',
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    metadata: JSON.parse(contract.metadata),
  };
}

export async function writeArtifact(artifact, outputPath = resolve(CONTRACT_ROOT, 'build/Loopers.json')) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return outputPath;
}

function resolveImport(importPath) {
  try {
    return { contents: readFileSync(require.resolve(importPath, { paths: [CONTRACT_ROOT] }), 'utf8') };
  } catch (error) {
    return { error: `Could not resolve ${importPath}: ${error.message}` };
  }
}

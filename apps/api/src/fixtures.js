import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MultipassValidationError,
  parseAgentCardJson,
  parseIdentityFragmentJson,
  parseMultipassProfileJson,
  parseReceiptFragmentJson,
  parseStandardsProfileJson,
  parseX402ManifestJson,
} from '@helixa/multipass-sdk';

import { createMemoryStore } from './index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES_ROOT = path.resolve(dirname, '../fixtures');

const FILES = {
  profile: ['profile.json', parseMultipassProfileJson],
  fragments: ['fragments.json', parseIdentityFragmentArrayJson],
  card: ['agent-card.json', parseAgentCardJson],
  standardsProfile: ['standards-profile.json', parseStandardsProfileJson],
  x402Manifest: ['x402-manifest.json', parseX402ManifestJson],
  receipts: ['receipts.json', parseReceiptFragmentArrayJson],
};

export async function loadFixtureStore({ fixture = 'generic', fixturesRoot = DEFAULT_FIXTURES_ROOT } = {}) {
  const fixtureName = normalizeFixtureName(fixture);
  const fixtureDir = path.join(fixturesRoot, fixtureName);

  if (!(await directoryExists(fixtureDir))) {
    throw new Error(`Unknown fixture "${fixtureName}" at ${fixtureDir}`);
  }

  const profile = await loadFixtureFile(fixtureDir, FILES.profile);
  const fragments = await loadFixtureFile(fixtureDir, FILES.fragments);
  const agentCard = await loadFixtureFile(fixtureDir, FILES.card);
  const standardsProfile = await loadFixtureFile(fixtureDir, FILES.standardsProfile);
  const x402Manifest = await loadFixtureFile(fixtureDir, FILES.x402Manifest);
  const receipts = await loadFixtureFile(fixtureDir, FILES.receipts);

  return {
    fixtureName,
    store: createMemoryStore({
      profiles: [profile],
      fragments,
      agentCards: [agentCard],
      standardsProfiles: [standardsProfile],
      x402Manifests: [x402Manifest],
      receiptFragments: receipts,
    }),
  };
}

function normalizeFixtureName(value) {
  const fixtureName = String(value || 'generic').trim() || 'generic';
  if (path.isAbsolute(fixtureName) || fixtureName.includes('..') || fixtureName.includes('/') || fixtureName.includes('\\')) {
    throw new Error(`Invalid fixture name: ${fixtureName}`);
  }
  return fixtureName;
}

async function directoryExists(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function loadFixtureFile(fixtureDir, [fileName, parse]) {
  const filePath = path.join(fixtureDir, fileName);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read fixture file ${filePath}: ${error.message}`, { cause: error });
  }

  try {
    return parse(raw);
  } catch (error) {
    throw enrichFixtureError(filePath, error);
  }
}

function parseIdentityFragmentArrayJson(raw) {
  return parseArrayForSchema(raw, 'identity-fragment', parseIdentityFragmentJson);
}

function parseReceiptFragmentArrayJson(raw) {
  return parseArrayForSchema(raw, 'receipt-fragment', parseReceiptFragmentJson);
}

function parseArrayForSchema(raw, schemaName, parseItem) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new MultipassValidationError(schemaName, [{ path: '$', message: `invalid JSON: ${error.message}` }]);
  }

  if (!Array.isArray(value)) {
    throw new MultipassValidationError(schemaName, [{ path: '$', message: 'expected array' }]);
  }

  return value.map((item, index) => {
    try {
      return parseItem(JSON.stringify(item));
    } catch (error) {
      if (error instanceof MultipassValidationError) {
        throw new MultipassValidationError(
          schemaName,
          error.errors.map((issue) => ({
            ...issue,
            path: issue.path === '$' ? `[${index}]` : `[${index}].${issue.path}`,
          })),
        );
      }
      throw error;
    }
  });
}

function enrichFixtureError(filePath, error) {
  return new Error(`Invalid fixture file ${filePath}: ${error.message}`, { cause: error });
}

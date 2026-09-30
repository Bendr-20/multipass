import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { canonicalJsonStringify } from './canonical-json.js';
import {
  LOOPER_CODEX_LIMITS,
  LOOPER_CODEX_SCHEMA_VERSION,
} from './constants.js';
import {
  inspectNumberedJsonDirectory,
  inspectRegularJsonFile,
  readRegularFile,
  requireLocalFilesystemPath,
  requireRegularDirectory,
} from './safe-files.js';

const SOURCE_COMPONENTS = Object.freeze([
  Object.freeze({
    key: 'traitPersonalityMatrix',
    inputKey: 'traitPersonalityMatrixPath',
    path: 'sources/trait-personality-matrix.json',
  }),
  Object.freeze({
    key: 'agentClassModel',
    inputKey: 'agentClassModelPath',
    path: 'sources/agent-class-model.json',
  }),
  Object.freeze({
    key: 'hashlipsExportManifest',
    inputKey: 'hashlipsExportManifestPath',
    path: 'sources/hashlips-export-manifest.json',
  }),
  Object.freeze({
    key: 'collectionProvenance',
    inputKey: 'collectionProvenancePath',
    path: 'sources/collection-provenance.json',
  }),
]);

const ROOT_ENTRIES = Object.freeze(['codex', 'metadata', 'release-manifest.json', 'sources']);
const SOURCE_ENTRIES = Object.freeze(SOURCE_COMPONENTS.map(({ path }) => basename(path)).sort());
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CONTRACT_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export async function materializeLooperCodexRelease(options) {
  const normalized = validateMaterializerOptions(options);
  const sourceInspection = await inspectInputs(normalized);
  await assertPathDoesNotExist(normalized.outputDir, 'output directory already exists');

  const outputParent = dirname(normalized.outputDir);
  await mkdir(outputParent, { recursive: true });
  const temporaryPrefix = join(outputParent, `.${basename(normalized.outputDir)}.tmp-`);
  const temporaryDirectory = await mkdtemp(temporaryPrefix);

  try {
    await mkdir(join(temporaryDirectory, 'metadata'));
    await mkdir(join(temporaryDirectory, 'codex'));
    await mkdir(join(temporaryDirectory, 'sources'));

    await copyNumberedFiles({
      sourceDirectory: normalized.metadataDir,
      destinationDirectory: join(temporaryDirectory, 'metadata'),
      count: normalized.count,
      maxBytes: LOOPER_CODEX_LIMITS.metadataFileBytes,
    });
    await copyNumberedFiles({
      sourceDirectory: normalized.codexDir,
      destinationDirectory: join(temporaryDirectory, 'codex'),
      count: normalized.count,
      maxBytes: LOOPER_CODEX_LIMITS.codexFileBytes,
    });
    for (const component of SOURCE_COMPONENTS) {
      const bytes = await readVerifiedJsonBytes(
        normalized[component.inputKey],
        LOOPER_CODEX_LIMITS.sourceFileBytes,
        component.path,
      );
      await writeFile(join(temporaryDirectory, component.path), bytes, { flag: 'wx' });
    }

    const manifest = buildReleaseManifest(normalized, sourceInspection);
    await writeFile(
      join(temporaryDirectory, 'release-manifest.json'),
      `${canonicalJsonStringify(manifest)}\n`,
      { flag: 'wx' },
    );
    await verifyLooperCodexRelease({ releaseDir: temporaryDirectory });
    await rename(temporaryDirectory, normalized.outputDir);
    return manifest;
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyLooperCodexRelease({ releaseDir }) {
  requireLocalFilesystemPath(releaseDir, 'releaseDir');
  await requireRegularDirectory(releaseDir, 'release directory');
  await requireExactEntries(releaseDir, ROOT_ENTRIES);
  await requireRegularDirectory(join(releaseDir, 'metadata'), 'metadata directory');
  await requireRegularDirectory(join(releaseDir, 'codex'), 'Codex directory');
  await requireRegularDirectory(join(releaseDir, 'sources'), 'sources directory');
  await requireExactEntries(join(releaseDir, 'sources'), SOURCE_ENTRIES);

  const manifestBytes = await readRegularFile(join(releaseDir, 'release-manifest.json'), {
    maxBytes: LOOPER_CODEX_LIMITS.releaseManifestBytes,
    label: 'release manifest',
  });
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new SyntaxError(`malformed JSON in release-manifest.json: ${error.message}`);
  }
  validateManifestShape(manifest);
  const expectedManifestBytes = `${canonicalJsonStringify(manifest)}\n`;
  if (!manifestBytes.equals(Buffer.from(expectedManifestBytes))) {
    throw new Error('release-manifest.json must use canonical JSON with one trailing newline');
  }

  const metadata = await inspectNumberedJsonDirectory({
    directory: join(releaseDir, manifest.components.metadata.path),
    count: manifest.count,
    perFileBytes: LOOPER_CODEX_LIMITS.metadataFileBytes,
    aggregateBytes: LOOPER_CODEX_LIMITS.metadataAggregateBytes,
    label: 'metadata',
  });
  assertAggregateComponentMatches('metadata', manifest.components.metadata, metadata);

  const codex = await inspectNumberedJsonDirectory({
    directory: join(releaseDir, manifest.components.codex.path),
    count: manifest.count,
    perFileBytes: LOOPER_CODEX_LIMITS.codexFileBytes,
    aggregateBytes: LOOPER_CODEX_LIMITS.codexAggregateBytes,
    label: 'Codex',
  });
  assertAggregateComponentMatches('Codex', manifest.components.codex, codex);

  for (const component of SOURCE_COMPONENTS) {
    const inspected = await inspectRegularJsonFile(join(releaseDir, component.path), {
      maxBytes: LOOPER_CODEX_LIMITS.sourceFileBytes,
      label: component.path,
      displayName: component.path,
    });
    const pinned = manifest.components[component.key];
    if (inspected.byteLength !== pinned.byteLength || inspected.sha256 !== pinned.sha256) {
      throw new Error(`${component.key} component hash mismatch`);
    }
  }

  return manifest;
}

function validateMaterializerOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('materializer options must be an object');
  }
  const normalized = { ...options };
  for (const key of ['metadataDir', 'codexDir', 'outputDir', ...SOURCE_COMPONENTS.map(({ inputKey }) => inputKey)]) {
    requireLocalFilesystemPath(normalized[key], key);
  }
  if (typeof normalized.auditedAt !== 'string' || normalized.auditedAt.length === 0) {
    throw new TypeError('auditedAt is required');
  }
  const parsedAuditTime = new Date(normalized.auditedAt);
  if (!Number.isFinite(parsedAuditTime.getTime()) || parsedAuditTime.toISOString() !== normalized.auditedAt) {
    throw new TypeError('auditedAt must be a canonical ISO-8601 timestamp');
  }
  if (!Number.isSafeInteger(normalized.chainId) || normalized.chainId < 1) {
    throw new TypeError('chainId must be a positive safe integer');
  }
  if (typeof normalized.collection !== 'string' || !CONTRACT_PATTERN.test(normalized.collection)) {
    throw new TypeError('collection must be a 20-byte hexadecimal address');
  }
  if (!Number.isSafeInteger(normalized.count) || normalized.count < 1) {
    throw new TypeError('count must be a positive safe integer');
  }
  if (typeof normalized.compilerVersion !== 'string' || normalized.compilerVersion.length === 0) {
    throw new TypeError('compilerVersion must be a non-empty string');
  }
  return normalized;
}

async function inspectInputs(options) {
  const metadata = await inspectNumberedJsonDirectory({
    directory: options.metadataDir,
    count: options.count,
    perFileBytes: LOOPER_CODEX_LIMITS.metadataFileBytes,
    aggregateBytes: LOOPER_CODEX_LIMITS.metadataAggregateBytes,
    label: 'metadata input',
  });
  const codex = await inspectNumberedJsonDirectory({
    directory: options.codexDir,
    count: options.count,
    perFileBytes: LOOPER_CODEX_LIMITS.codexFileBytes,
    aggregateBytes: LOOPER_CODEX_LIMITS.codexAggregateBytes,
    label: 'Codex input',
  });
  const sources = {};
  for (const component of SOURCE_COMPONENTS) {
    sources[component.key] = await inspectRegularJsonFile(options[component.inputKey], {
      maxBytes: LOOPER_CODEX_LIMITS.sourceFileBytes,
      label: component.inputKey,
      displayName: component.path,
    });
  }
  return { metadata, codex, sources };
}

function buildReleaseManifest(options, inspection) {
  const components = {
    metadata: aggregateManifestComponent('metadata', inspection.metadata),
    codex: aggregateManifestComponent('codex', inspection.codex),
  };
  for (const component of SOURCE_COMPONENTS) {
    components[component.key] = {
      path: component.path,
      byteLength: inspection.sources[component.key].byteLength,
      sha256: inspection.sources[component.key].sha256,
    };
  }
  return {
    schemaVersion: LOOPER_CODEX_SCHEMA_VERSION,
    chainId: options.chainId,
    collection: options.collection,
    count: options.count,
    compilerVersion: options.compilerVersion,
    components,
    auditedAt: options.auditedAt,
  };
}

function aggregateManifestComponent(path, inspection) {
  return {
    path,
    count: inspection.count,
    byteLength: inspection.totalBytes,
    sha256: inspection.sha256,
  };
}

async function copyNumberedFiles({ sourceDirectory, destinationDirectory, count, maxBytes }) {
  for (let id = 1; id <= count; id += 1) {
    const fileName = `${id}.json`;
    const bytes = await readVerifiedJsonBytes(join(sourceDirectory, fileName), maxBytes, fileName);
    await writeFile(join(destinationDirectory, fileName), bytes, { flag: 'wx' });
  }
}

async function readVerifiedJsonBytes(path, maxBytes, displayName) {
  const bytes = await readRegularFile(path, { maxBytes, label: displayName });
  try {
    JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new SyntaxError(`malformed JSON in ${displayName}: ${error.message}`);
  }
  return bytes;
}

function validateManifestShape(manifest) {
  requirePlainObject(manifest, 'release manifest');
  requireExactKeys(manifest, [
    'auditedAt',
    'chainId',
    'collection',
    'compilerVersion',
    'components',
    'count',
    'schemaVersion',
  ], 'release manifest');
  if (manifest.schemaVersion !== LOOPER_CODEX_SCHEMA_VERSION) {
    throw new Error(`unsupported release schema version ${manifest.schemaVersion}`);
  }
  validateMaterializerOptions({
    metadataDir: 'metadata',
    codexDir: 'codex',
    outputDir: 'release',
    traitPersonalityMatrixPath: SOURCE_COMPONENTS[0].path,
    agentClassModelPath: SOURCE_COMPONENTS[1].path,
    hashlipsExportManifestPath: SOURCE_COMPONENTS[2].path,
    collectionProvenancePath: SOURCE_COMPONENTS[3].path,
    auditedAt: manifest.auditedAt,
    chainId: manifest.chainId,
    collection: manifest.collection,
    count: manifest.count,
    compilerVersion: manifest.compilerVersion,
  });
  requirePlainObject(manifest.components, 'components');
  requireExactKeys(manifest.components, [
    'agentClassModel',
    'codex',
    'collectionProvenance',
    'hashlipsExportManifest',
    'metadata',
    'traitPersonalityMatrix',
  ], 'components');
  validateAggregateComponent(manifest.components.metadata, 'metadata', manifest.count);
  validateAggregateComponent(manifest.components.codex, 'codex', manifest.count);
  for (const component of SOURCE_COMPONENTS) {
    validateSourceComponent(manifest.components[component.key], component.path, component.key);
  }
}

function validateAggregateComponent(value, expectedPath, expectedCount) {
  requirePlainObject(value, `${expectedPath} component`);
  requireExactKeys(value, ['byteLength', 'count', 'path', 'sha256'], `${expectedPath} component`);
  if (value.path !== expectedPath || value.count !== expectedCount) {
    throw new Error(`invalid ${expectedPath} component path or count`);
  }
  validateHashAndLength(value, `${expectedPath} component`);
}

function validateSourceComponent(value, expectedPath, label) {
  requirePlainObject(value, `${label} component`);
  requireExactKeys(value, ['byteLength', 'path', 'sha256'], `${label} component`);
  if (value.path !== expectedPath) {
    throw new Error(`invalid ${label} component path`);
  }
  validateHashAndLength(value, `${label} component`);
}

function validateHashAndLength(value, label) {
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 0) {
    throw new Error(`invalid ${label} byteLength`);
  }
  if (typeof value.sha256 !== 'string' || !HASH_PATTERN.test(value.sha256)) {
    throw new Error(`invalid ${label} sha256`);
  }
}

function assertAggregateComponentMatches(label, pinned, inspected) {
  if (
    pinned.count !== inspected.count
    || pinned.byteLength !== inspected.totalBytes
    || pinned.sha256 !== inspected.sha256
  ) {
    throw new Error(`${label} component hash mismatch`);
  }
}

async function requireExactEntries(directory, expectedNames) {
  const entries = await readdir(directory, { withFileTypes: true });
  const actualNames = entries.map(({ name }) => name).sort();
  const sortedExpectedNames = [...expectedNames].sort();
  if (canonicalJsonStringify(actualNames) !== canonicalJsonStringify(sortedExpectedNames)) {
    const unexpected = actualNames.find((name) => !sortedExpectedNames.includes(name));
    if (unexpected) throw new Error(`unexpected entry ${unexpected}`);
    const missing = sortedExpectedNames.find((name) => !actualNames.includes(name));
    throw new Error(`missing entry ${missing}`);
  }
}

async function assertPathDoesNotExist(path, message) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(message);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJsonStringify(actual) !== canonicalJsonStringify(expected)) {
    throw new Error(`${label} has invalid keys`);
  }
}

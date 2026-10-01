export const LOOPER_CODEX_SCHEMA_VERSION = '1.0.0';
export const LOOPER_CODEX_COMPILER_VERSION = '1.0.0';

export const LOOPER_CODEX_COLLECTION = Object.freeze({
  name: 'Loopers',
  chainId: 8453,
  contract: '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a',
  count: 7777,
});

export const LOOPER_CODEX_LIMITS = Object.freeze({
  releaseManifestBytes: 1 * 1024 * 1024,
  metadataFileBytes: 64 * 1024,
  codexFileBytes: 128 * 1024,
  sourceFileBytes: 4 * 1024 * 1024,
  metadataAggregateBytes: 512 * 1024 * 1024,
  codexAggregateBytes: 1024 * 1024 * 1024,
  artifactBytes: 128 * 1024 * 1024,
  traitStringMinLength: 1,
  traitStringMaxLength: 96,
  filterMinItems: 1,
  filterMaxItems: 12,
  searchDefaultLimit: 25,
  searchMaxLimit: 100,
  similarityDefaultLimit: 10,
  similarityMaxLimit: 25,
  cursorMaxLength: 512,
});

export const LOOPER_CODEX_DERIVED_TRAIT_TYPES = Object.freeze([
  'Agent Class',
  'Secondary Class',
  'Specialization',
  'Risk',
  'Autonomy',
]);

export const LOOPER_CODEX_FIXED_POINT_SCALE = 1_000_000;

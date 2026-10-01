export {
  canonicalJsonHash,
  canonicalJsonStringify,
} from './canonical-json.js';

export {
  buildDerivedIndexes,
  compileLooperCodexArtifact,
  serializeLooperCodexArtifact,
  verifyLooperCodexArtifact,
} from './compiler.js';

export {
  LOOPER_CODEX_COLLECTION,
  LOOPER_CODEX_COMPILER_VERSION,
  LOOPER_CODEX_DERIVED_TRAIT_TYPES,
  LOOPER_CODEX_FIXED_POINT_SCALE,
  LOOPER_CODEX_LIMITS,
  LOOPER_CODEX_SCHEMA_VERSION,
} from './constants.js';

export {
  inspectNumberedJsonDirectory,
  inspectRegularJsonFile,
  readRegularFile,
  requireLocalFilesystemPath,
  requireRegularDirectory,
  sha256Bytes,
} from './safe-files.js';

export {
  materializeLooperCodexRelease,
  verifyLooperCodexRelease,
} from './release-manifest.js';

export { loadLooperCodexArtifact } from './loader.js';
export { createCursor, parseCursor } from './cursor.js';
export { createLooperCodexQueryService } from './query-service.js';

export {
  LOOPER_SOURCE_CODEX_SCHEMA_VERSION,
  normalizeImageIdentity,
  normalizeLooperRecord,
} from './normalize.js';

export {
  LOOPER_SKILL_RECOMMENDATION_MAP_VERSION,
  getRecommendedSkills,
} from './skill-recommendations.js';

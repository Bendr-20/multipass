import { verifyLooperCodexArtifact } from './compiler.js';
import { LOOPER_CODEX_COLLECTION, LOOPER_CODEX_LIMITS } from './constants.js';
import { readRegularFile } from './safe-files.js';

export async function loadLooperCodexArtifact({
  path,
  expectedCount = LOOPER_CODEX_COLLECTION.count,
} = {}) {
  const bytes = await readRegularFile(path, {
    maxBytes: LOOPER_CODEX_LIMITS.artifactBytes,
    label: 'Looper Codex artifact',
  });
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new SyntaxError(`malformed Looper Codex artifact JSON: ${error.message}`);
  }
  verifyLooperCodexArtifact(artifact, { expectedCount });
  return deepFreeze(artifact);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

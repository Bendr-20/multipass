import { canonicalJsonHash, canonicalJsonStringify } from './canonical-json.js';
import { LOOPER_CODEX_LIMITS } from './constants.js';

export function createCursor({ artifactHash, filters, afterTokenId }) {
  const payload = {
    v: 1,
    artifactHash,
    filterHash: canonicalJsonHash(filters),
    afterTokenId,
  };
  const encoded = Buffer.from(canonicalJsonStringify(payload), 'utf8').toString('base64url');
  if (encoded.length > LOOPER_CODEX_LIMITS.cursorMaxLength) throw new RangeError('cursor exceeds maximum length');
  return encoded;
}

export function parseCursor(cursor, { artifactHash, filters }) {
  if (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > LOOPER_CODEX_LIMITS.cursorMaxLength) throw new TypeError('cursor is malformed');
  let payload;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    payload = JSON.parse(decoded);
    if (Buffer.from(canonicalJsonStringify(payload), 'utf8').toString('base64url') !== cursor) throw new Error('non-canonical');
  } catch {
    throw new TypeError('cursor is malformed');
  }
  const keys = Object.keys(payload).sort().join(',');
  if (keys !== 'afterTokenId,artifactHash,filterHash,v' || payload.v !== 1) throw new TypeError('cursor has unknown or invalid fields');
  if (payload.artifactHash !== artifactHash || payload.filterHash !== canonicalJsonHash(filters)) throw new Error('cursor does not match artifact or filters');
  if (!Number.isSafeInteger(payload.afterTokenId) || payload.afterTokenId < 1) throw new TypeError('cursor token ID is invalid');
  return payload.afterTokenId;
}

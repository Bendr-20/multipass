import { DatabaseSync } from 'node:sqlite';
import { getAddress } from 'viem';

const TOKEN_ID = 3802;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_ITEMS = 10_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const HASH = /^[a-f0-9]{64}$/u;
const SENDER = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const ACCEPT_KEYS = ['bodyHash', 'canonicalBody', 'correlationId', 'nonceHash', 'receivedAt', 'replayExpiresAt', 'senderId', 'verifiedSigner'];

export class RestapNewsReplayError extends Error {
  constructor() { super('restap_news_replay'); this.name = 'RestapNewsReplayError'; this.code = 'replay'; this.status = 409; }
}
export class RestapNewsStoreUnavailableError extends Error {
  constructor() { super('restap_news_store_unavailable'); this.name = 'RestapNewsStoreUnavailableError'; this.code = 'store_unavailable'; this.status = 503; }
}

export function createRestapNewsStore({ databasePath = ':memory:', now = Date.now, retentionMs = DEFAULT_RETENTION_MS, maxItems = DEFAULT_MAX_ITEMS, afterNonceReserved } = {}) {
  if (typeof databasePath !== 'string' || !databasePath || typeof now !== 'function') throw new TypeError('RESTAP news store configuration is invalid.');
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1 || retentionMs > DEFAULT_RETENTION_MS) throw new RangeError('RESTAP news retention is invalid.');
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > DEFAULT_MAX_ITEMS) throw new RangeError('RESTAP news item cap is invalid.');
  if (afterNonceReserved !== undefined && typeof afterNonceReserved !== 'function') throw new TypeError('RESTAP news reservation hook is invalid.');
  const db = new DatabaseSync(databasePath);
  let closed = false;
  try { initialize(db); validateSchema(db); } catch (error) { db.close(); throw sanitized(error); }

  const insertNonce = db.prepare('INSERT INTO restap_news_nonces (sender_id, nonce_hash, replay_expires_at) VALUES (?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO restap_news_items (token_id, sender_id, verified_signer, canonical_body_json, body_hash, received_at, correlation_id, nonce_hash, replay_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const listFirst = db.prepare('SELECT * FROM restap_news_items WHERE token_id = 3802 ORDER BY item_id DESC LIMIT ?');
  const listAfter = db.prepare('SELECT * FROM restap_news_items WHERE token_id = 3802 AND item_id < ? ORDER BY item_id DESC LIMIT ?');

  function accept(value) {
    assertOpen();
    const item = normalizeItem(value);
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        insertNonce.run(item.senderId, item.nonceHash, item.replayExpiresAt);
        afterNonceReserved?.();
        const result = insertItem.run(TOKEN_ID, item.senderId, item.verifiedSigner, item.canonicalBodyText, item.bodyHash, item.receivedAt, item.correlationId, item.nonceHash, item.replayExpiresAt);
        prune(db, readNow(now), retentionMs, maxItems);
        db.exec('COMMIT');
        return Object.freeze({ itemId: String(result.lastInsertRowid), receivedAt: item.receivedAt });
      } catch (error) {
        db.exec('ROLLBACK');
        if (isReplay(error)) throw new RestapNewsReplayError();
        throw error;
      }
    } catch (error) {
      if (error instanceof RestapNewsReplayError) throw error;
      throw new RestapNewsStoreUnavailableError();
    }
  }

  function list({ cursor, limit = DEFAULT_LIMIT } = {}) {
    assertOpen();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError('RESTAP news limit must be between 1 and 50.');
    let rows;
    try { rows = cursor === undefined ? listFirst.all(limit + 1) : listAfter.all(decodeCursor(cursor), limit + 1); }
    catch (error) { if (error instanceof TypeError || error instanceof RangeError) throw error; throw new RestapNewsStoreUnavailableError(); }
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    return deepFreeze({ items: selected.map(projectRow), nextCursor: hasMore ? encodeCursor(selected.at(-1).item_id) : null });
  }

  function close() { if (closed) return; closed = true; db.close(); }
  function assertOpen() { if (closed) throw new RestapNewsStoreUnavailableError(); }
  return Object.freeze({ accept, list, close });
}

function initialize(db) {
  db.exec([
    'PRAGMA foreign_keys = ON;',
    'PRAGMA busy_timeout = 1000;',
    'CREATE TABLE IF NOT EXISTS restap_news_nonces (sender_id TEXT NOT NULL, nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) = 64), replay_expires_at TEXT NOT NULL, PRIMARY KEY (sender_id, nonce_hash)) STRICT;',
    'CREATE TABLE IF NOT EXISTS restap_news_items (item_id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL CHECK (token_id = 3802), sender_id TEXT NOT NULL, verified_signer TEXT NOT NULL, canonical_body_json TEXT NOT NULL, body_hash TEXT NOT NULL CHECK (length(body_hash) = 64), received_at TEXT NOT NULL, correlation_id TEXT, nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) = 64), replay_expires_at TEXT NOT NULL, UNIQUE (sender_id, nonce_hash)) STRICT;',
    'CREATE INDEX IF NOT EXISTS restap_news_items_owner_page ON restap_news_items (token_id, item_id DESC);',
    'CREATE INDEX IF NOT EXISTS restap_news_items_received ON restap_news_items (received_at, item_id);',
    'CREATE INDEX IF NOT EXISTS restap_news_nonces_expiry ON restap_news_nonces (replay_expires_at);',
  ].join('\n'));
}

function validateSchema(db) {
  const expected = {
    restap_news_nonces: ['sender_id', 'nonce_hash', 'replay_expires_at'],
    restap_news_items: ['item_id', 'token_id', 'sender_id', 'verified_signer', 'canonical_body_json', 'body_hash', 'received_at', 'correlation_id', 'nonce_hash', 'replay_expires_at'],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const actual = db.prepare('PRAGMA table_info(' + table + ')').all().map((row) => row.name);
    if (actual.join(',') !== columns.join(',')) throw new TypeError('RESTAP news schema mismatch.');
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql;
    if (typeof sql !== 'string' || !/\bSTRICT\s*$/iu.test(sql.trim())) throw new TypeError('RESTAP news schema must be STRICT.');
  }
}

function normalizeItem(value) {
  if (!plain(value)) throw new TypeError('RESTAP news item must be plain.');
  if (Object.keys(value).sort().join(',') !== [...ACCEPT_KEYS].sort().join(',')) throw new TypeError('RESTAP news item contains unknown or missing keys; token selection is forbidden.');
  if (typeof value.senderId !== 'string' || !SENDER.test(value.senderId)) throw new TypeError('RESTAP sender ID is invalid.');
  let signer; try { signer = getAddress(value.verifiedSigner); } catch { throw new TypeError('RESTAP verified signer is invalid.'); }
  if (typeof value.canonicalBody !== 'string' || Buffer.byteLength(value.canonicalBody, 'utf8') > 16 * 1024) throw new TypeError('RESTAP canonical body is invalid.');
  let canonicalBody; try { canonicalBody = JSON.parse(value.canonicalBody); } catch { throw new TypeError('RESTAP canonical body is invalid JSON.'); }
  if (!plain(canonicalBody) || typeof canonicalBody.type !== 'string') throw new TypeError('RESTAP canonical body shape is invalid.');
  if (!HASH.test(value.bodyHash) || !HASH.test(value.nonceHash)) throw new TypeError('RESTAP evidence hash is invalid.');
  const receivedAt = iso(value.receivedAt, 'receivedAt');
  const replayExpiresAt = iso(value.replayExpiresAt, 'replayExpiresAt');
  if (Date.parse(replayExpiresAt) < Date.parse(receivedAt)) throw new TypeError('RESTAP replay expiry is invalid.');
  if (value.correlationId !== null && (typeof value.correlationId !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.correlationId))) throw new TypeError('RESTAP correlation ID is invalid.');
  return { senderId: value.senderId, verifiedSigner: signer, canonicalBody, canonicalBodyText: value.canonicalBody, bodyHash: value.bodyHash, receivedAt, correlationId: value.correlationId, nonceHash: value.nonceHash, replayExpiresAt };
}

function projectRow(row) {
  let body; try { body = JSON.parse(row.canonical_body_json); } catch { throw new RestapNewsStoreUnavailableError(); }
  return deepFreeze({ itemId: String(row.item_id), senderId: row.sender_id, verifiedSigner: row.verified_signer, canonicalBody: body, bodyHash: row.body_hash, receivedAt: row.received_at, correlationId: row.correlation_id, nonceHash: row.nonce_hash, replayExpiresAt: row.replay_expires_at });
}

function prune(db, nowMs, retentionMs, maxItems) {
  db.prepare('DELETE FROM restap_news_items WHERE received_at < ?').run(new Date(nowMs - retentionMs).toISOString());
  db.prepare('DELETE FROM restap_news_items WHERE item_id NOT IN (SELECT item_id FROM restap_news_items WHERE token_id = 3802 ORDER BY item_id DESC LIMIT ?)').run(maxItems);
  db.prepare('DELETE FROM restap_news_nonces WHERE replay_expires_at <= ?').run(new Date(nowMs).toISOString());
}
function encodeCursor(id) { return Buffer.from(JSON.stringify({ before: String(id) }), 'utf8').toString('base64url'); }
function decodeCursor(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(value)) throw new TypeError('RESTAP news cursor is invalid.'); try { const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); if (!plain(decoded) || Object.keys(decoded).join(',') !== 'before' || !/^[1-9]\d*$/u.test(decoded.before)) throw new Error(); return BigInt(decoded.before); } catch { throw new TypeError('RESTAP news cursor is invalid.'); } }
function isReplay(error) { return error?.code === 'ERR_SQLITE_CONSTRAINT_PRIMARYKEY' || error?.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: restap_news_(?:nonces|items)\.sender_id/iu.test(String(error?.message)); }
function sanitized(error) { if (error instanceof TypeError || error instanceof RangeError) return error; if (/no such column|has no column|malformed|schema/iu.test(String(error?.message))) return new TypeError('RESTAP news schema mismatch.'); return new RestapNewsStoreUnavailableError(); }
function readNow(now) { const value = now(); const ms = value instanceof Date ? value.getTime() : value; if (!Number.isFinite(ms)) throw new RestapNewsStoreUnavailableError(); return ms; }
function iso(value, label) { if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('RESTAP ' + label + ' is invalid.'); return value; }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const p = Object.getPrototypeOf(value); return p === Object.prototype || p === null; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }

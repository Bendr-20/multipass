import { createHash, createPrivateKey, createPublicKey, sign as ed25519Sign, verify as ed25519Verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { canonicalizeRestapNetworkJson } from './jcs.js';
import { normalizeRestapNetworkGrantHeader, normalizeRestapNetworkGrantPayload } from './schema.js';

const AUTHENTICATION_FAILED = Object.freeze({ status: 'authentication_failed' });
const KEY_ID = /^[A-Za-z0-9_-]{32,128}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const KEY_STATUSES = new Set(['signing', 'overlap', 'retired', 'compromised']);
const MAX_GRANT_JSON_BYTES = 64 * 1024;
const MAX_SIGNING_BYTES = 64 * 1024;

export function createRestapNetworkPublicKeyRegistry({ keys, requireSigningKey = true } = {}) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 2) throw new TypeError('RESTAP network key registry is invalid.');
  if (typeof requireSigningKey !== 'boolean') throw new TypeError('RESTAP network key registry mode is invalid.');
  const normalized = keys.map(normalizeRegistryKey);
  if (new Set(normalized.map((key) => key.keyId)).size !== normalized.length) throw new TypeError('RESTAP network key IDs must be unique.');
  const signingCount = normalized.filter((key) => key.status === 'signing').length;
  if ((requireSigningKey && signingCount !== 1) || (!requireSigningKey && signingCount > 1)) throw new TypeError('RESTAP network registry requires exactly one signing key.');
  if (normalized.filter((key) => key.status === 'overlap').length > 1) throw new TypeError('RESTAP network registry permits at most one overlap key.');
  const byId = new Map(normalized.map((key) => [key.keyId, key]));
  return Object.freeze({ get(keyId) { return byId.get(String(keyId ?? '')) ?? null; } });
}

export function createRestapNetworkGrantService({ signer = null, keyRegistry, now = () => Math.floor(Date.now() / 1_000) } = {}) {
  if (!keyRegistry || typeof keyRegistry.get !== 'function' || typeof now !== 'function') throw new TypeError('RESTAP network grant dependencies are invalid.');
  if (signer !== null && (!isPlainObject(signer) || !KEY_ID.test(signer.keyId) || typeof signer.sign !== 'function')) throw new TypeError('RESTAP network signer is invalid.');

  async function issue(payloadInput) {
    if (!signer) throw new Error('RESTAP network grant signing unavailable.');
    const payload = normalizeRestapNetworkGrantPayload(payloadInput);
    const timestamp = clock(now);
    const key = keyRegistry.get(signer.keyId);
    if (!key || key.status !== 'signing' || !insideWindows({ key, payload, timestamp })) throw new Error('RESTAP network grant signing unavailable.');
    const header = normalizeRestapNetworkGrantHeader({ schema_version: '1', alg: 'Ed25519', kid: signer.keyId, typ: 'looper-communication-grant+jcs' });
    const canonical = canonicalizeRestapNetworkJson({ header, payload });
    let signature;
    try { signature = normalizeSignatureBytes(await signer.sign(Buffer.from(canonical, 'utf8'))); } catch { throw new Error('RESTAP network grant signing unavailable.'); }
    if (!ed25519Verify(null, Buffer.from(canonical, 'utf8'), key.publicKey, signature)) throw new Error('RESTAP network grant signing unavailable.');
    return deepFreeze({ header, payload, signature: signature.toString('base64url') });
  }

  async function verify(input) {
    try {
      exactObject(input, ['grant', 'expectedPayload'], 'RESTAP network grant verification');
      const grant = normalizeGrant(input.grant, { signatureRequired: true });
      const expectedPayload = normalizeRestapNetworkGrantPayload(input.expectedPayload);
      if (canonicalizeRestapNetworkJson(grant.payload) !== canonicalizeRestapNetworkJson(expectedPayload)) return AUTHENTICATION_FAILED;
      const timestamp = clock(now);
      const key = keyRegistry.get(grant.header.kid);
      if (!key || (key.status !== 'signing' && key.status !== 'overlap') || !insideWindows({ key, payload: grant.payload, timestamp })) return AUTHENTICATION_FAILED;
      const bytes = Buffer.from(canonicalizeRestapNetworkJson({ header: grant.header, payload: grant.payload }), 'utf8');
      const valid = ed25519Verify(null, bytes, key.publicKey, grant.signatureBytes);
      return valid ? deepFreeze({ status: 'verified', payload: grant.payload }) : AUTHENTICATION_FAILED;
    } catch {
      return AUTHENTICATION_FAILED;
    }
  }

  return Object.freeze({ issue, verify });
}

export function canonicalizeRestapNetworkGrant(value) {
  const grant = normalizeGrant(value, { signatureRequired: false });
  return canonicalizeRestapNetworkJson({ header: grant.header, payload: grant.payload });
}

export function hashRestapNetworkGrant(value) {
  return createHash('sha256').update(Buffer.from(canonicalizeRestapNetworkGrant(value), 'utf8')).digest('hex');
}

export function parseRestapNetworkGrantJson(text) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_GRANT_JSON_BYTES) throw new TypeError('invalid');
    assertNoDuplicateJsonKeys(text);
    return normalizeGrant(JSON.parse(text), { signatureRequired: true }).projection;
  } catch {
    throw new Error('RESTAP network grant authentication failed.');
  }
}

export async function loadRestapNetworkFileSigner({ filePath, openImpl = open } = {}) {
  let handle;
  try {
    if (typeof filePath !== 'string' || !isAbsolute(filePath) || filePath.length > 4_096 || typeof openImpl !== 'function') throw new TypeError('invalid');
    handle = await openImpl(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.readFile !== 'function' || typeof handle.close !== 'function') throw new TypeError('invalid');
    const stat = await handle.stat();
    if (!stat || stat.uid !== 0 || (stat.mode & 0o7777) !== 0o600 || stat.isFile?.() !== true) throw new TypeError('unsafe');
    const text = await handle.readFile({ encoding: 'utf8' });
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8_192) throw new TypeError('invalid');
    assertNoDuplicateJsonKeys(text);
    const parsed = JSON.parse(text);
    exactObject(parsed, ['key_id', 'pkcs8_der_base64'], 'RESTAP network signer file');
    if (!KEY_ID.test(parsed.key_id) || typeof parsed.pkcs8_der_base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(parsed.pkcs8_der_base64)) throw new TypeError('invalid');
    const der = Buffer.from(parsed.pkcs8_der_base64, 'base64');
    if (der.toString('base64') !== parsed.pkcs8_der_base64 || der.length < 32 || der.length > 256) throw new TypeError('invalid');
    let privateKey;
    try {
      privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
      if (privateKey.asymmetricKeyType !== 'ed25519') throw new TypeError('invalid');
    } finally {
      der.fill(0);
    }
    async function sign(bytes) {
      try {
        if ((!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) || bytes.byteLength === 0 || bytes.byteLength > MAX_SIGNING_BYTES) throw new TypeError('invalid');
        const input = Buffer.from(bytes);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
        assertNoDuplicateJsonKeys(text);
        const envelope = JSON.parse(text);
        exactObject(envelope, ['header', 'payload'], 'RESTAP network signing envelope');
        const header = normalizeRestapNetworkGrantHeader(envelope.header);
        const payload = normalizeRestapNetworkGrantPayload(envelope.payload);
        if (header.kid !== parsed.key_id || !input.equals(Buffer.from(canonicalizeRestapNetworkJson({ header, payload }), 'utf8'))) throw new TypeError('invalid');
        return ed25519Sign(null, input, privateKey);
      } catch {
        throw new Error('RESTAP network signing unavailable.');
      }
    }
    return Object.freeze({ keyId: parsed.key_id, sign });
  } catch {
    throw new Error('RESTAP network signer unavailable.');
  } finally {
    await handle?.close?.().catch(() => {});
  }
}

function normalizeGrant(value, { signatureRequired }) {
  const keys = signatureRequired ? ['header', 'payload', 'signature'] : Object.hasOwn(value ?? {}, 'signature') ? ['header', 'payload', 'signature'] : ['header', 'payload'];
  exactObject(value, keys, 'RESTAP network grant');
  const header = normalizeRestapNetworkGrantHeader(value.header);
  const payload = normalizeRestapNetworkGrantPayload(value.payload);
  if (!signatureRequired && !Object.hasOwn(value, 'signature')) return { header, payload };
  if (typeof value.signature !== 'string' || !SIGNATURE.test(value.signature)) throw new TypeError('RESTAP network grant signature is invalid.');
  const signatureBytes = Buffer.from(value.signature, 'base64url');
  if (signatureBytes.byteLength !== 64 || signatureBytes.toString('base64url') !== value.signature) throw new TypeError('RESTAP network grant signature is invalid.');
  return { header, payload, signatureBytes, projection: deepFreeze({ header, payload, signature: value.signature }) };
}

function normalizeRegistryKey(value) {
  exactObject(value, ['keyId', 'algorithm', 'publicKey', 'activatesAt', 'notBefore', 'notAfter', 'status'], 'RESTAP network public key');
  if (!KEY_ID.test(value.keyId) || value.algorithm !== 'Ed25519' || !KEY_STATUSES.has(value.status)) throw new TypeError('RESTAP network public key metadata is invalid.');
  const activatesAt = nonNegativeInteger(value.activatesAt);
  const notBefore = nonNegativeInteger(value.notBefore);
  const notAfter = nonNegativeInteger(value.notAfter);
  if (notBefore < activatesAt || notAfter <= notBefore) throw new TypeError('RESTAP network public key window is invalid.');
  let publicKey;
  try {
    publicKey = createPublicKey({ key: Buffer.from(value.publicKey), format: 'der', type: 'spki' });
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new TypeError('invalid');
  } catch {
    throw new TypeError('RESTAP network public key is invalid.');
  }
  return Object.freeze({ keyId: value.keyId, algorithm: 'Ed25519', publicKey, activatesAt, notBefore, notAfter, status: value.status });
}

function insideWindows({ key, payload, timestamp }) {
  return key.status !== 'compromised'
    && key.activatesAt <= timestamp
    && key.notBefore <= timestamp
    && timestamp < key.notAfter
    && payload.nbf <= timestamp
    && payload.iat <= timestamp
    && timestamp < payload.exp
    && payload.nbf >= key.notBefore
    && payload.exp <= key.notAfter;
}

function normalizeSignatureBytes(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw new TypeError('invalid');
  const bytes = Buffer.from(value);
  if (bytes.byteLength !== 64) throw new TypeError('invalid');
  return bytes;
}

function assertNoDuplicateJsonKeys(text) {
  let index = 0;
  const whitespace = () => { while (/\s/u.test(text[index] ?? '')) index += 1; };
  function parseString() {
    if (text[index] !== '"') throw new TypeError('invalid');
    const start = index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') return JSON.parse(text.slice(start, index));
      if (char === '\\') {
        const escaped = text[index++];
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index, index + 4))) throw new TypeError('invalid');
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped)) throw new TypeError('invalid');
      } else if (char.charCodeAt(0) < 0x20) throw new TypeError('invalid');
    }
    throw new TypeError('invalid');
  }
  function parseValue() {
    whitespace();
    const char = text[index];
    if (char === '{') return parseObject();
    if (char === '[') return parseArray();
    if (char === '"') { parseString(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(index));
    if (!match) throw new TypeError('invalid');
    JSON.parse(match[0]);
    index += match[0].length;
  }
  function parseObject() {
    index += 1; whitespace();
    const keys = new Set();
    if (text[index] === '}') { index += 1; return; }
    while (true) {
      whitespace(); const key = parseString();
      if (keys.has(key)) throw new TypeError('duplicate');
      keys.add(key); whitespace();
      if (text[index++] !== ':') throw new TypeError('invalid');
      parseValue(); whitespace();
      const next = text[index++];
      if (next === '}') return;
      if (next !== ',') throw new TypeError('invalid');
    }
  }
  function parseArray() {
    index += 1; whitespace();
    if (text[index] === ']') { index += 1; return; }
    while (true) {
      parseValue(); whitespace();
      const next = text[index++];
      if (next === ']') return;
      if (next !== ',') throw new TypeError('invalid');
    }
  }
  parseValue(); whitespace();
  if (index !== text.length) throw new TypeError('invalid');
}

function exactObject(value, keys, label) {
  if (!isPlainObject(value)) throw new TypeError(label + ' must be a plain object.');
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(label + ' contains unknown key.');
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(label + ' is missing a key.');
}
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function nonNegativeInteger(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('invalid integer'); return value; }
function clock(now) { return nonNegativeInteger(now()); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) if (!Buffer.isBuffer(item)) deepFreeze(item); } return value; }

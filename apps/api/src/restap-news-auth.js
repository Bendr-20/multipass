import { createHash } from 'node:crypto';
import { getAddress, verifyMessage } from 'viem';

import { RESTAP_LIMITS, canonicalizeRestapJson, normalizeRestapNewsPost } from './restap-3802-contracts.js';
import { normalizeRestapSenderId } from './restap-3802-policy.js';

const METHOD = 'POST';
const PATH = '/multipass-api/api/restap/loopers/3802/news';
const NONCE = /^[A-Za-z0-9_-]{22,128}$/u;
const SIGNATURE = /^0x[a-fA-F0-9]{2,}$/u;

export class RestapAuthenticationRequiredError extends Error { constructor() { super('authentication_required'); this.name = 'RestapAuthenticationRequiredError'; this.status = 401; this.code = 'authentication_required'; } }
export class RestapSenderNotAuthorizedError extends Error { constructor() { super('sender_not_authorized'); this.name = 'RestapSenderNotAuthorizedError'; this.status = 403; this.code = 'sender_not_authorized'; } }
export class RestapDependencyUnavailableError extends Error { constructor() { super('dependency_unavailable'); this.name = 'RestapDependencyUnavailableError'; this.status = 503; this.code = 'dependency_unavailable'; } }

export function buildRestapNewsSignedMessage({ method, path, senderId, signer, canonicalBody, timestamp, nonce } = {}) {
  if (method !== METHOD || path !== PATH) throw new RestapSenderNotAuthorizedError();
  const sender = normalizeRestapSenderId(senderId);
  let normalizedSigner;
  try { normalizedSigner = getAddress(signer).toLowerCase(); } catch { throw new RestapAuthenticationRequiredError(); }
  if (typeof canonicalBody !== 'string' || !Number.isSafeInteger(timestamp) || timestamp < 0 || typeof nonce !== 'string' || !NONCE.test(nonce)) throw new RestapAuthenticationRequiredError();
  const bodyHash = sha256(canonicalBody);
  return ['RESTAP-SIGNATURE-V1', METHOD, PATH, sender, normalizedSigner, bodyHash, String(timestamp), nonce].join('\n');
}

export function createRestapNewsAuthenticator({ policy, now = Date.now, verifyEip1271, resolveErc8004Controller } = {}) {
  if (!policy || !Array.isArray(policy.newsSenders) || typeof now !== 'function') throw new TypeError('RESTAP news authenticator requires policy and clock.');
  const senders = new Map(policy.newsSenders.map((sender) => [sender.id, sender]));

  async function authenticate({ method, path, headers, body } = {}) {
    if (method !== METHOD || path !== PATH) throw new RestapSenderNotAuthorizedError();
    const read = headerReader(headers);
    const rawSender = read('x-restap-sender');
    const rawSigner = read('x-restap-signer');
    const rawTimestamp = read('x-restap-timestamp');
    const nonce = read('x-restap-nonce');
    const signature = read('x-restap-signature');
    if (![rawSender, rawSigner, rawTimestamp, nonce, signature].every((value) => typeof value === 'string' && value.length > 0)) throw new RestapAuthenticationRequiredError();
    let senderId;
    let signer;
    try { senderId = normalizeRestapSenderId(rawSender); signer = getAddress(rawSigner); } catch { throw new RestapAuthenticationRequiredError(); }
    if (!/^\d{1,12}$/u.test(rawTimestamp) || !NONCE.test(nonce) || !SIGNATURE.test(signature)) throw new RestapAuthenticationRequiredError();
    const timestamp = Number(rawTimestamp);
    const nowMs = readNow(now);
    if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > RESTAP_LIMITS.signatureSkewSeconds) throw new RestapSenderNotAuthorizedError();
    const sender = senders.get(senderId);
    if (!sender?.enabled || !sameAddress(sender.signer, signer)) throw new RestapSenderNotAuthorizedError();

    let normalizedBody;
    try { normalizedBody = normalizeRestapNewsPost(body); } catch { throw new RestapSenderNotAuthorizedError(); }
    const canonicalBody = canonicalizeRestapJson(normalizedBody);
    const message = buildRestapNewsSignedMessage({ method, path, senderId, signer, canonicalBody, timestamp, nonce });
    let valid = false;
    try { valid = await verifyMessage({ address: signer, message, signature }); } catch { valid = false; }
    if (!valid && typeof verifyEip1271 === 'function') {
      try { valid = await verifyEip1271({ address: signer, message, signature }); }
      catch { throw new RestapDependencyUnavailableError(); }
    }
    if (!valid) throw new RestapSenderNotAuthorizedError();

    if (sender.kind === 'erc8004') {
      if (typeof resolveErc8004Controller !== 'function') throw new RestapDependencyUnavailableError();
      let controller;
      try { controller = await resolveErc8004Controller(sender.erc8004); }
      catch { throw new RestapDependencyUnavailableError(); }
      if (!sameAddress(controller, signer)) throw new RestapSenderNotAuthorizedError();
    }

    return Object.freeze({
      senderId,
      verifiedSigner: getAddress(signer),
      canonicalBody,
      bodyHash: sha256(canonicalBody),
      nonceHash: sha256(nonce),
      correlationId: normalizedBody.session_id ?? null,
      receivedAt: new Date(nowMs).toISOString(),
      replayExpiresAt: new Date(nowMs + (RESTAP_LIMITS.signatureSkewSeconds * 1_000)).toISOString(),
    });
  }
  return Object.freeze({ authenticate });
}

function headerReader(headers) {
  if (headers instanceof Headers) return (name) => headers.get(name);
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new RestapAuthenticationRequiredError();
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return (name) => normalized.get(name);
}
function sameAddress(a, b) { try { return getAddress(a) === getAddress(b); } catch { return false; } }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function readNow(now) { const value = now(); const ms = value instanceof Date ? value.getTime() : value; if (!Number.isFinite(ms)) throw new RestapDependencyUnavailableError(); return ms; }

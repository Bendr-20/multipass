import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { getAddress } from 'viem';

import { parseStrictJsonObject } from './strict-json-envelope.js';

const MAX_POLICY_BYTES = 64 * 1024;
const COLLECTION = '0x1649CD37f4748807b4882FC48765bA0B2aFfa94a';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ROOT_KEYS = ['authority', 'newsSenders', 'publicProfile', 'schemaVersion', 'tokenId'];
const AUTHORITY_KEYS = ['chainId', 'collection', 'controller', 'erc8004AgentId', 'erc8004Registry', 'owner'];
const PROFILE_KEYS = ['biography', 'displayName', 'mission', 'publicConversationEnabled', 'voicePresentation'];
const SENDER_KEYS = ['enabled', 'erc8004', 'id', 'kind', 'signer'];
const ERC8004_KEYS = ['agentId', 'chainId', 'registry'];
const SENDER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export class RestapPolicyNotAuthorizedError extends Error {
  constructor() { super('RESTAP policy is not authorized.'); this.name = 'RestapPolicyNotAuthorizedError'; }
}
export class RestapPolicyUnavailableError extends Error {
  constructor() { super('RESTAP policy dependency is unavailable.'); this.name = 'RestapPolicyUnavailableError'; }
}

export async function loadRestap3802Policy({ policyPath } = {}) {
  if (typeof policyPath !== 'string' || !policyPath) throw new TypeError('RESTAP policy path is required.');
  const inspected = await lstat(policyPath);
  if (!inspected.isFile() || inspected.isSymbolicLink()) throw new TypeError('RESTAP policy must be a regular non-symlink file.');
  if ((inspected.mode & 0o022) !== 0) throw new TypeError('RESTAP policy must not be group/world writable.');
  if (inspected.size > MAX_POLICY_BYTES) throw new RangeError('RESTAP policy exceeds 64 KiB.');
  let handle;
  try {
    handle = await open(policyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || (opened.mode & 0o022) !== 0 || opened.size > MAX_POLICY_BYTES) {
      throw new TypeError('RESTAP policy file safety check failed.');
    }
    const text = await handle.readFile('utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_POLICY_BYTES) throw new RangeError('RESTAP policy exceeds 64 KiB.');
    return normalizePolicy(parseStrictJsonObject(text));
  } finally { await handle?.close().catch(() => {}); }
}

export async function authorizeRestap3802Policy({ policy, resolveAuthority, loadCodexProfile } = {}) {
  if (!policy || typeof resolveAuthority !== 'function' || typeof loadCodexProfile !== 'function') {
    throw new RestapPolicyUnavailableError();
  }
  if (policy.publicProfile?.publicConversationEnabled !== true) throw new RestapPolicyNotAuthorizedError();
  let current;
  let profile;
  try {
    current = await resolveAuthority();
    if (!authorityMatches(policy.authority, current)) throw new RestapPolicyNotAuthorizedError();
    profile = await loadCodexProfile('3802');
  } catch (error) {
    if (error instanceof RestapPolicyNotAuthorizedError) throw error;
    throw new RestapPolicyUnavailableError();
  }
  try {
    if (String(profile?.identity?.tokenId) !== '3802') throw new TypeError();
    const canonicalName = bounded(profile.identity.canonicalName, 256);
    const image = new URL(profile.identity.image.url);
    if (image.protocol !== 'https:' || image.username || image.password) throw new TypeError();
    return deepFreeze({
      canonicalIdentity: { canonicalName, imageUrl: image.toString() },
      ownerPublicProfile: { ...policy.publicProfile },
      newsSenders: policy.newsSenders.map((sender) => ({ ...sender, ...(sender.erc8004 ? { erc8004: { ...sender.erc8004 } } : {}) })),
    });
  } catch {
    throw new RestapPolicyUnavailableError();
  }
}

export function normalizeRestapSenderId(value) {
  if (typeof value !== 'string') throw new TypeError('RESTAP sender ID is invalid.');
  const normalized = value.normalize('NFKC').toLowerCase();
  if (!SENDER_ID.test(normalized)) throw new TypeError('RESTAP sender ID is invalid.');
  return normalized;
}

function normalizePolicy(value) {
  exact(value, ROOT_KEYS, ROOT_KEYS, 'policy');
  if (value.schemaVersion !== '1.0.0' || value.tokenId !== '3802') throw new TypeError('RESTAP policy version/token is invalid.');
  const authority = normalizeAuthority(value.authority);
  const publicProfile = normalizeProfile(value.publicProfile);
  if (!Array.isArray(value.newsSenders) || value.newsSenders.length > 256) throw new TypeError('RESTAP newsSenders must be bounded.');
  const seen = new Set();
  const newsSenders = value.newsSenders.map((sender) => {
    exact(sender, SENDER_KEYS, ['enabled', 'id', 'kind', 'signer'], 'sender');
    const id = normalizeRestapSenderId(sender.id);
    if (seen.has(id)) throw new TypeError('RESTAP policy contains duplicate sender ID.');
    seen.add(id);
    if (typeof sender.enabled !== 'boolean' || !['evm', 'erc8004'].includes(sender.kind)) throw new TypeError('RESTAP sender kind/enabled is invalid.');
    const normalized = { id, kind: sender.kind, enabled: sender.enabled, signer: address(sender.signer, 'signer') };
    if (sender.kind === 'erc8004') {
      exact(sender.erc8004, ERC8004_KEYS, ERC8004_KEYS, 'sender erc8004');
      if (sender.erc8004.chainId !== 8453 || !sameAddress(sender.erc8004.registry, REGISTRY) || !positiveDecimal(sender.erc8004.agentId)) throw new TypeError('RESTAP sender ERC-8004 metadata must use Base 8453 and the canonical registry.');
      normalized.erc8004 = { chainId: 8453, registry: getAddress(REGISTRY), agentId: sender.erc8004.agentId };
    } else if (Object.hasOwn(sender, 'erc8004')) throw new TypeError('EVM sender must not include ERC-8004 metadata.');
    return deepFreeze(normalized);
  });
  return deepFreeze({ schemaVersion: '1.0.0', tokenId: '3802', authority, publicProfile, newsSenders });
}

function normalizeAuthority(value) {
  exact(value, AUTHORITY_KEYS, AUTHORITY_KEYS, 'authority');
  if (value.chainId !== 8453 || !sameAddress(value.collection, COLLECTION) || !sameAddress(value.erc8004Registry, REGISTRY) || !positiveDecimal(value.erc8004AgentId)) throw new TypeError('RESTAP authority pin is invalid.');
  return deepFreeze({ chainId: 8453, collection: getAddress(COLLECTION), owner: address(value.owner, 'owner'), erc8004Registry: getAddress(REGISTRY), erc8004AgentId: value.erc8004AgentId, controller: address(value.controller, 'controller') });
}

function normalizeProfile(value) {
  exact(value, PROFILE_KEYS, PROFILE_KEYS, 'public profile');
  if (typeof value.publicConversationEnabled !== 'boolean') throw new TypeError('RESTAP public conversation flag is invalid.');
  return deepFreeze({ displayName: bounded(value.displayName, 256), publicConversationEnabled: value.publicConversationEnabled, biography: bounded(value.biography, 2_048), mission: bounded(value.mission, 2_048), voicePresentation: bounded(value.voicePresentation, 1_024) });
}

function authorityMatches(expected, current) {
  return current && current.chainId === 8453 && String(current.tokenId) === '3802' && current.controllerVerified === true && sameAddress(current.contract, expected.collection) && sameAddress(current.owner, expected.owner) && String(current.erc8004AgentId) === expected.erc8004AgentId && sameAddress(current.controller, expected.controller);
}
function exact(value, allowed, required, label) { if (!plain(value)) throw new TypeError(`RESTAP ${label} must be plain.`); const set = new Set(allowed); for (const key of Object.keys(value)) if (!set.has(key)) throw new TypeError(`RESTAP ${label} contains unknown key.`); for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError(`RESTAP ${label} is missing a key.`); }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const p = Object.getPrototypeOf(value); return p === Object.prototype || p === null; }
function address(value, label) { try { return getAddress(value); } catch { throw new TypeError(`RESTAP ${label} address is invalid.`); } }
function sameAddress(a, b) { try { return getAddress(a) === getAddress(b); } catch { return false; } }
function positiveDecimal(value) { return typeof value === 'string' && /^[1-9]\d*$/u.test(value); }
function bounded(value, max) { if (typeof value !== 'string' || !value || CONTROL.test(value) || Buffer.byteLength(value, 'utf8') > max) throw new TypeError('RESTAP public text is invalid.'); return value; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }

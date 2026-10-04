import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { createLoopersPublicClients } from '../loopers-owned-agents.js';
import { createAccountIntegrityReader } from './account-integrity.js';
import { createRestapNetworkBaseProvider } from './base-provider.js';
import { createCustodyReconciler } from './custody-reconciler.js';
import { createRestapNetworkDatabase } from './database.js';
import { composeRestapNetworkProductionPolicy } from './production-composition.js';

const REVIEWED_BASE_PROVIDERS = Object.freeze({
  blast: 'https://base-mainnet.public.blastapi.io',
  tenderly: 'https://base.gateway.tenderly.co',
});
const REQUIRED_PROVIDER_IDS = Object.freeze(Object.keys(REVIEWED_BASE_PROVIDERS).sort());
const REQUIRED_PILOT_TOKEN_IDS = Object.freeze(['617', '3802']);
const MAX_AUDIT_KEY_FILE_BYTES = 4_096;

export function parseRestapNetworkProductionConfig(env = {}) {
  const providerIds = parseReviewedProviderIds(env.MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS);
  const tokenIds = parseTokenIds(env.MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS);
  const auditKeyFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE, 'MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE');
  const keyRegistryFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE, 'MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE');
  const signerFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_SIGNER_FILE, 'MULTIPASS_RESTAP_NETWORK_SIGNER_FILE');
  if (tokenIds.length && !sameStrings(tokenIds, REQUIRED_PILOT_TOKEN_IDS)) {
    throw new TypeError('MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS must name the exact #617 and #3802 pilot roster.');
  }
  return Object.freeze({ providerIds, tokenIds, auditKeyFile, keyRegistryFile, signerFile });
}

export async function createRestapNetworkProductionFoundation({
  config, productionConfig, codexRuntime, now = Date.now, publicClients = null,
} = {}) {
  if (!config?.gates?.foundation) throw new Error('RESTAP network production foundation is not enabled.');
  if (!productionConfig || !sameStrings(productionConfig.providerIds, REQUIRED_PROVIDER_IDS)) {
    throw new Error('RESTAP network foundation requires the exact reviewed Base providers.');
  }
  if (!Array.isArray(productionConfig.tokenIds) || productionConfig.tokenIds.length === 0) {
    throw new Error('RESTAP network foundation requires authority token IDs.');
  }
  if (!productionConfig.auditKeyFile) throw new Error('RESTAP network foundation requires a protected audit key file.');

  const { auditKey, auditKeyId } = await loadAuditKeyFile({ filePath: productionConfig.auditKeyFile });
  let database;
  try {
    const clients = publicClients ?? createLoopersPublicClients({ rpcUrls: productionConfig.providerIds.map((id) => REVIEWED_BASE_PROVIDERS[id]) });
    if (clients.length !== REQUIRED_PROVIDER_IDS.length) throw new Error('RESTAP network approved providers are unavailable.');
    const providers = Object.freeze(clients.map((publicClient, index) => Object.freeze({
      approved: true,
      id: productionConfig.providerIds[index],
      ...createRestapNetworkBaseProvider({ publicClient, tokenIds: productionConfig.tokenIds }),
    })));
    const policyOnly = config.gates.policy === true
      && config.gates.discovery === false
      && config.gates.initiation === false
      && config.gates.replies === false;
    const accountReader = createAccountIntegrityReader({
      providers,
      timeoutMs: config.providerTimeoutMs,
      allowUndeployedAccount: policyOnly,
      allowSafeBlockSkew: policyOnly,
    });
    database = createRestapNetworkDatabase({ filename: config.databasePath });
    const custody = createCustodyReconciler({
      store: database,
      providers,
      auditKey: Buffer.from(auditKey),
      auditKeyId,
      timeoutMs: config.providerTimeoutMs,
      allowSafeBlockSkew: policyOnly,
    });
    const composition = composeRestapNetworkProductionPolicy({
      config, productionConfig, store: database, custodyReconciler: custody, accountReader, providers, codexRuntime, now,
    });
    return Object.freeze({
      ...composition,
      store: database,
      custodyReconciler: custody,
      closeOnStartupFailure() { database.close(); },
    });
  } catch (error) {
    await Promise.resolve(database?.close?.()).catch(() => {});
    throw error;
  } finally {
    auditKey.fill(0);
  }
}

async function loadAuditKeyFile({ filePath, openImpl = open } = {}) {
  let handle;
  try {
    if (typeof filePath !== 'string' || !isAbsolute(filePath) || filePath.length > 4_096) throw new TypeError('invalid');
    handle = await openImpl(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    const acceptedUid = typeof process.getuid === 'function' ? process.getuid() : stat.uid;
    if (!stat.isFile() || stat.isSymbolicLink() || ![0, acceptedUid].includes(stat.uid)
      || (stat.mode & 0o7777) !== 0o600 || stat.size < 1 || stat.size > MAX_AUDIT_KEY_FILE_BYTES) throw new TypeError('unsafe');
    const bytes = await handle.readFile();
    if (!Buffer.isBuffer(bytes) || bytes.byteLength !== stat.size) throw new TypeError('invalid');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed) || Object.keys(parsed).sort().join(',') !== 'key_base64,key_id,schema_version'
      || parsed.schema_version !== '1' || JSON.stringify(parsed) !== text) throw new TypeError('invalid');
    if (typeof parsed.key_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(parsed.key_id)) throw new TypeError('invalid');
    if (typeof parsed.key_base64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/u.test(parsed.key_base64)) throw new TypeError('invalid');
    const auditKey = Buffer.from(parsed.key_base64, 'base64');
    if (auditKey.byteLength !== 32 || auditKey.toString('base64') !== parsed.key_base64) throw new TypeError('invalid');
    return { auditKey, auditKeyId: parsed.key_id };
  } catch {
    throw new Error('RESTAP network audit key unavailable.');
  } finally {
    await handle?.close?.().catch(() => {});
  }
}

function parseReviewedProviderIds(value) {
  if (value === undefined || value === null || value === '') return Object.freeze([]);
  const ids = String(value).split(',').map((item) => item.trim()).filter(Boolean).sort();
  if (!sameStrings(ids, REQUIRED_PROVIDER_IDS)) throw new TypeError('MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS must name the exact reviewed provider set.');
  return Object.freeze(ids);
}
function parseTokenIds(value) {
  if (value === undefined || value === null || value === '') return Object.freeze([]);
  const ids = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 32 || ids.some((id) => !/^(0|[1-9][0-9]*)$/u.test(id)) || new Set(ids).size !== ids.length) {
    throw new TypeError('MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS is invalid.');
  }
  return Object.freeze(ids.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}
function optionalText(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > 4_096 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError(label + ' is invalid.');
  return normalized;
}
function sameStrings(left, right) { return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }

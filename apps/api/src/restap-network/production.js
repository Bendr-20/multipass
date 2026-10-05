import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { createLoopersPublicClients } from '../loopers-owned-agents.js';
import { createAccountIntegrityReader } from './account-integrity.js';
import { createRestapNetworkBaseProvider } from './base-provider.js';
import { createRestapNetworkBankrGateway, createRestapNetworkVerifiedOpeningRuntime } from './bankr-provider.js';
import { RESTAP_NETWORK_LIMITS } from './constants.js';
import { createCustodyReconciler } from './custody-reconciler.js';
import { createRestapNetworkDatabase } from './database.js';
import { loadRestapNetworkFileSigner, loadRestapNetworkPublicKeyRegistryFile } from './grants.js';
import { composeRestapNetworkProductionPolicy } from './production-composition.js';

const REVIEWED_BASE_PROVIDERS = Object.freeze({
  drpc: 'https://base.drpc.org',
  blast: 'https://base-mainnet.public.blastapi.io',
});
const REQUIRED_PROVIDER_IDS = Object.freeze(Object.keys(REVIEWED_BASE_PROVIDERS).sort());
export const RESTAP_NETWORK_PRODUCTION_CUSTODY_RANGE = 20;
const MAX_AUDIT_KEY_FILE_BYTES = 4_096;

export function parseRestapNetworkProductionConfig(env = {}) {
  const providerIds = parseReviewedProviderIds(env.MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS);
  const tokenIds = parseTokenIds(env.MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS);
  const auditKeyFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE, 'MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE');
  const keyRegistryFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE, 'MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE');
  const signerFile = optionalText(env.MULTIPASS_RESTAP_NETWORK_SIGNER_FILE, 'MULTIPASS_RESTAP_NETWORK_SIGNER_FILE');
  const maxFinalizedHeadSkew = parsePinnedFinalizedHeadSkew(env.MULTIPASS_RESTAP_NETWORK_MAX_FINALIZED_HEAD_SKEW);
  const verifiedSend = Object.freeze({
    enabled: parseExactBoolean(env.MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED, 'MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED') ?? false,
    emergencyStop: parseExactBoolean(env.MULTIPASS_RESTAP_VERIFIED_SEND_EMERGENCY_STOP, 'MULTIPASS_RESTAP_VERIFIED_SEND_EMERGENCY_STOP') ?? true,
    recipientTokenIds: parsePositiveTokenIds(env.MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS, 'MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS'),
  });
  return Object.freeze({ providerIds, tokenIds, auditKeyFile, keyRegistryFile, signerFile, maxFinalizedHeadSkew, verifiedSend });
}

export async function createRestapNetworkProductionFoundation({
  config, productionConfig, codexRuntime, now = Date.now, publicClients = null,
  bankrLlmKey = null, bankrReadonlyApiKey = null, bankrModel = null, fetchImpl = fetch,
  keyRegistryLoader = loadRestapNetworkPublicKeyRegistryFile,
  signerLoader = loadRestapNetworkFileSigner,
} = {}) {
  if (!config?.gates?.foundation) throw new Error('RESTAP network production foundation is not enabled.');
  if (!productionConfig || !sameStrings(productionConfig.providerIds, REQUIRED_PROVIDER_IDS)) {
    throw new Error('RESTAP network foundation requires the exact reviewed Base providers.');
  }
  if (!Array.isArray(productionConfig.tokenIds)) throw new Error('RESTAP network authority token fixtures are invalid.');
  if (productionConfig.maxFinalizedHeadSkew !== RESTAP_NETWORK_LIMITS.finalizedHeadSkewBlocks) throw new Error('RESTAP network production finalized-head skew is not pinned.');
  if (!productionConfig.auditKeyFile) throw new Error('RESTAP network foundation requires a protected audit key file.');
  const trafficEnabled = config.gates.discovery || config.gates.initiation || config.gates.replies || config.gates.pilot;
  const verifiedSendEnabled = productionConfig.verifiedSend?.enabled === true;
  if (verifiedSendEnabled && (!config.gates.policy || trafficEnabled || config.gates.transcripts || config.gates.ga)) {
    throw new Error('RESTAP verified send requires foundation and policy with all legacy traffic gates off.');
  }
  if (verifiedSendEnabled && !sameStrings(productionConfig.verifiedSend.recipientTokenIds, ['3802'])) {
    throw new Error('RESTAP verified send requires the exact reviewed same-process recipient roster.');
  }
  if (trafficEnabled && !productionConfig.keyRegistryFile) throw new Error('RESTAP network traffic requires a protected key registry file.');
  if (trafficEnabled && !productionConfig.signerFile) throw new Error('RESTAP network traffic requires a protected signer file.');
  if (trafficEnabled && !bankrLlmKey) throw new Error('RESTAP network traffic requires a protected Bankr LLM key.');
  if (verifiedSendEnabled && !bankrLlmKey) throw new Error('RESTAP verified send requires a protected Bankr LLM key.');

  const { auditKey, auditKeyId } = await loadAuditKeyFile({ filePath: productionConfig.auditKeyFile });
  let database;
  try {
    const keyRegistry = trafficEnabled ? await keyRegistryLoader({ filePath: productionConfig.keyRegistryFile }) : null;
    const signer = trafficEnabled ? await signerLoader({ filePath: productionConfig.signerFile }) : null;
    if (trafficEnabled && keyRegistry?.get?.(signer?.keyId)?.status !== 'signing') {
      throw new Error('RESTAP network signer has no active signing key in the protected registry.');
    }
    const inferenceGateway = trafficEnabled ? createRestapNetworkBankrGateway({ apiKey: bankrLlmKey, model: bankrModel ?? undefined, fetchImpl }) : null;
    const usageGateway = trafficEnabled ? createRestapNetworkBankrGateway({ apiKey: bankrLlmKey, model: bankrModel ?? undefined, fetchImpl }) : null;
    const bankrGateway = trafficEnabled ? Object.freeze({
      generatePublicReply: (projection) => inferenceGateway.generatePublicReply(projection),
      readUsageTotals: async () => Object.freeze({ totalRequests: inferenceGateway.readDispatchedTotal() }),
    }) : null;
    const verifiedOpeningRuntime = verifiedSendEnabled ? createRestapNetworkVerifiedOpeningRuntime({
      apiKey: bankrLlmKey,
      model: bankrModel ?? undefined,
      timeoutMs: Math.min(config.providerTimeoutMs, 15_000),
      fetchImpl,
    }) : null;
    const clients = publicClients ?? createLoopersPublicClients({
      rpcUrls: productionConfig.providerIds.map((id) => REVIEWED_BASE_PROVIDERS[id]),
      rpcRetryCount: 3,
      rpcRetryDelay: 1_500,
    });
    if (clients.length !== REQUIRED_PROVIDER_IDS.length) throw new Error('RESTAP network approved providers are unavailable.');
    const providers = Object.freeze(clients.map((publicClient, index) => Object.freeze({
      approved: true,
      id: productionConfig.providerIds[index],
      ...createRestapNetworkBaseProvider({ publicClient, allowAnyCollectionToken: true, maxRange: RESTAP_NETWORK_PRODUCTION_CUSTODY_RANGE, rpcMinIntervalMs: 250 }),
    })));
    const offchainOwnerAuthority = config.gates.policy === true;
    const accountReader = createAccountIntegrityReader({
      providers,
      timeoutMs: config.providerTimeoutMs,
      allowUndeployedAccount: offchainOwnerAuthority,
      maxSafeBlockSkew: offchainOwnerAuthority ? productionConfig.maxFinalizedHeadSkew : 0,
      providerStaggerMs: 750,
    });
    database = createRestapNetworkDatabase({ filename: config.databasePath });
    const custody = createCustodyReconciler({
      store: database,
      providers,
      auditKey: Buffer.from(auditKey),
      auditKeyId,
      timeoutMs: config.providerTimeoutMs,
      maxSafeBlockSkew: offchainOwnerAuthority ? productionConfig.maxFinalizedHeadSkew : 0,
      providerStaggerMs: 750,
    });
    const composition = composeRestapNetworkProductionPolicy({
      config, productionConfig, store: database, custodyReconciler: custody, accountReader, providers, codexRuntime,
      signer, keyRegistry, bankrGateway, now,
    });
    return Object.freeze({
      ...composition,
      store: database,
      custodyReconciler: custody,
      verifiedSendDependencies: verifiedSendEnabled ? Object.freeze({
        config: productionConfig.verifiedSend,
        store: database,
        custodyReconciler: custody,
        policyReader: composition.policyReader,
        codexRuntime,
        openingRuntime: verifiedOpeningRuntime,
        now,
      }) : null,
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
function parsePinnedFinalizedHeadSkew(value) {
  if (value === undefined || value === null || value === '') return RESTAP_NETWORK_LIMITS.finalizedHeadSkewBlocks;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed !== RESTAP_NETWORK_LIMITS.finalizedHeadSkewBlocks) {
    throw new TypeError('MULTIPASS_RESTAP_NETWORK_MAX_FINALIZED_HEAD_SKEW must equal ' + RESTAP_NETWORK_LIMITS.finalizedHeadSkewBlocks + '.');
  }
  return parsed;
}
function parseExactBoolean(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  throw new TypeError(label + ' must be an exact boolean.');
}
function parsePositiveTokenIds(value, label) {
  if (value === undefined || value === null || value === '') return Object.freeze([]);
  const ids = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 16 || ids.some((id) => !/^[1-9][0-9]*$/u.test(id)) || new Set(ids).size !== ids.length) {
    throw new TypeError(label + ' is invalid or contains a duplicate.');
  }
  return Object.freeze(ids.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}
function sameStrings(left, right) { return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }

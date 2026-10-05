import { createRestapVerifiedSendService, createSameProcessRestapTalkTransport } from './verified-send.js';

const CONFIG_KEYS = Object.freeze(['emergencyStop', 'enabled', 'recipientTokenIds']);

export function composeRestapVerifiedSendProduction({
  config,
  store,
  custodyReconciler,
  policyReader,
  codexRuntime,
  openingRuntime,
  recipientRuntimes,
  resolvePublicProjection,
  now = Date.now,
} = {}) {
  const normalized = normalizeConfig(config);
  if (!normalized.enabled) return Object.freeze({ service: null, status: normalized });
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function') throw new Error('Verified-send production store is unavailable.');
  if (!custodyReconciler || typeof custodyReconciler.reconcileToken !== 'function' || typeof custodyReconciler.getEpochSnapshot !== 'function') throw new Error('Verified-send production custody reconciler is unavailable.');
  if (!policyReader || typeof policyReader.get !== 'function') throw new Error('Verified-send production policy reader is unavailable.');
  if (!codexRuntime?.available || codexRuntime?.status?.available !== true || !/^[0-9a-f]{64}$/u.test(codexRuntime.status.artifactHash ?? '') || typeof codexRuntime.getProfileContext !== 'function') {
    throw new Error('Verified-send production pinned Codex runtime is unavailable.');
  }
  if (!openingRuntime || typeof openingRuntime.generate !== 'function') throw new Error('Verified-send production opening provider is unavailable.');
  if (!recipientRuntimes || typeof recipientRuntimes !== 'object' || Array.isArray(recipientRuntimes)) throw new Error('Verified-send production recipient runtimes are unavailable.');
  if (typeof resolvePublicProjection !== 'function') throw new Error('Verified-send production recipient projection resolver is unavailable.');
  if (typeof now !== 'function') throw new Error('Verified-send production clock is unavailable.');
  for (const tokenId of normalized.recipientTokenIds) {
    if (!Object.hasOwn(recipientRuntimes, tokenId) || typeof recipientRuntimes[tokenId]?.talk !== 'function') {
      throw new Error('Verified-send production recipient runtime is unavailable for token ' + tokenId + '.');
    }
  }

  const allowed = new Set(normalized.recipientTokenIds);
  const recipientTransport = createSameProcessRestapTalkTransport({
    resolveRuntime: async ({ tokenId }) => allowed.has(tokenId) ? recipientRuntimes[tokenId] : null,
    resolvePublicProjection: async ({ tokenId }) => {
      if (!allowed.has(tokenId)) throw new Error('RESTAP recipient is outside the same-process roster.');
      return resolvePublicProjection({ tokenId });
    },
  });
  const service = createRestapVerifiedSendService({
    store,
    custodyReconciler,
    policyReader,
    codexRuntime,
    openingRuntime,
    recipientTransport,
    emergencyStop: () => normalized.emergencyStop,
    now,
  });
  return Object.freeze({ service, recipientTransport, status: normalized });
}

function normalizeConfig(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !== [...CONFIG_KEYS].sort().join(',')) throw new TypeError('Verified-send production config is invalid.');
  if (typeof value.enabled !== 'boolean' || typeof value.emergencyStop !== 'boolean') throw new TypeError('Verified-send production controls are invalid.');
  if (!Array.isArray(value.recipientTokenIds) || value.recipientTokenIds.length > 16) throw new TypeError('Verified-send production recipient roster is invalid.');
  const recipientTokenIds = value.recipientTokenIds.map((tokenId) => String(tokenId));
  if (recipientTokenIds.some((tokenId) => !/^[1-9][0-9]*$/u.test(tokenId)) || new Set(recipientTokenIds).size !== recipientTokenIds.length) throw new TypeError('Verified-send production recipient roster is invalid.');
  if (value.enabled && recipientTokenIds.length === 0) throw new Error('Verified-send production requires a same-process recipient roster.');
  return deepFreeze({ enabled: value.enabled, emergencyStop: value.emergencyStop, recipientTokenIds: recipientTokenIds.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0) });
}

function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }

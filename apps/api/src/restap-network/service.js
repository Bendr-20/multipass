import { RESTAP_NETWORK_CADENCES, RESTAP_NETWORK_TOPICS } from './constants.js';
import { normalizeRestapNetworkTokenId } from './schema.js';

const GATE_NAMES = Object.freeze(['foundation', 'policy', 'discovery', 'initiation', 'replies', 'transcripts', 'pilot', 'ga']);
const ENV_GATES = Object.freeze({
  foundation: 'MULTIPASS_RESTAP_NETWORK_FOUNDATION_ENABLED',
  policy: 'MULTIPASS_RESTAP_NETWORK_POLICY_ENABLED',
  discovery: 'MULTIPASS_RESTAP_NETWORK_DISCOVERY_ENABLED',
  initiation: 'MULTIPASS_RESTAP_NETWORK_INITIATION_ENABLED',
  replies: 'MULTIPASS_RESTAP_NETWORK_REPLIES_ENABLED',
  transcripts: 'MULTIPASS_RESTAP_NETWORK_TRANSCRIPTS_ENABLED',
  pilot: 'MULTIPASS_RESTAP_NETWORK_PILOT_ENABLED',
  ga: 'MULTIPASS_RESTAP_NETWORK_GA_ENABLED',
});
const START_KEYS = Object.freeze(['config', 'dependencies']);
const CONFIG_KEYS = Object.freeze(['cadences', 'dailyCostLimit', 'databasePath', 'gaApproved', 'gaRosterRemovalApproved', 'gates', 'operationalHashSalt', 'pilotRoster', 'providerTimeoutMs', 'topics']);

export function parseRestapNetworkServiceConfig(env = {}) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new TypeError('RESTAP network environment is invalid.');
  const gates = Object.fromEntries(GATE_NAMES.map((name) => [name, strictBoolean(env[ENV_GATES[name]], ENV_GATES[name]) ?? false]));
  const databasePath = optionalText(env.MULTIPASS_RESTAP_NETWORK_DATABASE_PATH, 'MULTIPASS_RESTAP_NETWORK_DATABASE_PATH', 4_096);
  const operationalHashSalt = optionalText(env.MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT, 'MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT', 512);
  const dailyCostLimit = optionalPositiveInteger(env.MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT, 'MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT', 1_000_000_000);
  const providerTimeoutMs = optionalPositiveInteger(env.MULTIPASS_RESTAP_NETWORK_PROVIDER_TIMEOUT_MS, 'MULTIPASS_RESTAP_NETWORK_PROVIDER_TIMEOUT_MS', 30_000);
  const topics = closedList(env.MULTIPASS_RESTAP_NETWORK_TOPICS, RESTAP_NETWORK_TOPICS, 'MULTIPASS_RESTAP_NETWORK_TOPICS');
  const cadences = closedList(env.MULTIPASS_RESTAP_NETWORK_CADENCES, RESTAP_NETWORK_CADENCES, 'MULTIPASS_RESTAP_NETWORK_CADENCES');
  const pilotRoster = tokenList(env.MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER);
  const gaApproved = strictBoolean(env.MULTIPASS_RESTAP_NETWORK_GA_APPROVED, 'MULTIPASS_RESTAP_NETWORK_GA_APPROVED') ?? false;
  const gaRosterRemovalApproved = strictBoolean(env.MULTIPASS_RESTAP_NETWORK_GA_ROSTER_REMOVAL_APPROVED, 'MULTIPASS_RESTAP_NETWORK_GA_ROSTER_REMOVAL_APPROVED') ?? false;
  return deepFreeze({
    gates: deepFreeze(gates),
    databasePath,
    operationalHashSalt,
    dailyCostLimit,
    providerTimeoutMs: providerTimeoutMs ?? 15_000,
    topics: topics ?? RESTAP_NETWORK_TOPICS,
    cadences: cadences ?? RESTAP_NETWORK_CADENCES,
    pilotRoster,
    gaApproved,
    gaRosterRemovalApproved,
  });
}

export function hasRestapNetworkEnvironment(env = {}) {
  return [...Object.values(ENV_GATES),
    'MULTIPASS_RESTAP_NETWORK_DATABASE_PATH', 'MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT',
    'MULTIPASS_RESTAP_NETWORK_DAILY_COST_LIMIT', 'MULTIPASS_RESTAP_NETWORK_PROVIDER_TIMEOUT_MS',
    'MULTIPASS_RESTAP_NETWORK_TOPICS', 'MULTIPASS_RESTAP_NETWORK_CADENCES',
    'MULTIPASS_RESTAP_NETWORK_PILOT_ROSTER', 'MULTIPASS_RESTAP_NETWORK_GA_APPROVED',
    'MULTIPASS_RESTAP_NETWORK_GA_ROSTER_REMOVAL_APPROVED',
  ].some((key) => Object.hasOwn(env, key));
}

export async function startRestapNetworkService(input = {}) {
  exactObject(input, START_KEYS, 'RESTAP network service start');
  const config = normalizeConfig(input.config);
  assertGateRelationships(config);
  if (!config.gates.foundation) return disabledService(config);
  const dependencies = normalizeDependencies(input.dependencies);
  assertDependencyMatrix(config, dependencies);

  let database = null;
  let workerStarted = false;
  let closed = false;
  let closePromise = null;
  try {
    database = await dependencies.databaseFactory({ filename: config.databasePath });
    assertMethods(database, ['checkpoint', 'close'], 'database');
    const candidates = config.gates.policy ? await dependencies.activationLeases.loadInactiveCandidates() : [];
    await dependencies.custodyReconciler.reconcile({ candidates });
    if (config.gates.policy) await dependencies.activationLeases.reauthorizeCandidates({ candidates });
    if (config.gates.initiation) {
      workerStarted = true;
      await dependencies.worker.start();
    }
  } catch (error) {
    try {
      await closeLifecycle({ database, worker: dependencies.worker, workerStarted, conversations: config.gates.replies ? dependencies.conversations : null });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'RESTAP network service startup and cleanup failed.');
    }
    throw error;
  }

  const service = {
    status: deepFreeze({ enabled: true, gates: config.gates, transcriptCapability: 'unavailable' }),
    close() {
      if (closed) return closePromise ?? Promise.resolve();
      closed = true;
      closePromise = closeLifecycle({ database, worker: dependencies.worker, workerStarted, conversations: config.gates.replies ? dependencies.conversations : null });
      return closePromise;
    },
  };
  if (config.gates.policy) {
    for (const name of ['getPolicy', 'putPolicy', 'createIntent', 'listIntents', 'deleteIntent', 'stop']) {
      service[name] = (value) => dependencies.management[name](value);
    }
  }
  return Object.freeze(service);
}

function disabledService(config) {
  let closePromise = null;
  return Object.freeze({
    status: deepFreeze({ enabled: false, gates: config.gates, transcriptCapability: 'unavailable' }),
    close() { closePromise ??= Promise.resolve(); return closePromise; },
  });
}

async function closeLifecycle({ database, worker, workerStarted, conversations }) {
  const errors = [];
  const steps = [
    async () => { if (workerStarted) await worker.stopAcquisition(); },
    async () => { if (workerStarted) await worker.awaitCurrent(); },
    async () => { if (conversations) await conversations.close(); },
    async () => { if (database) await database.checkpoint(); },
    async () => { if (database) await database.close(); },
  ];
  for (const step of steps) try { await step(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'RESTAP network service shutdown failed.');
}

function assertDependencyMatrix(config, dependencies) {
  if (!config.databasePath) throw new Error('RESTAP network foundation requires a database path.');
  if (!Array.isArray(dependencies.approvedProviders) || dependencies.approvedProviders.length === 0 || dependencies.approvedProviders.some((provider) => provider?.approved !== true)) throw new Error('RESTAP network foundation requires approved providers.');
  if (dependencies.codexRuntime?.available !== true) throw new Error('RESTAP network foundation requires available Codex.');
  if (dependencies.accountIntegrity?.configured !== true) throw new Error('RESTAP network foundation requires account-integrity configuration.');
  if (typeof config.operationalHashSalt !== 'string' || Buffer.byteLength(config.operationalHashSalt, 'utf8') < 32) throw new Error('RESTAP network foundation requires an operational hash salt.');
  assertMethods(dependencies.custodyReconciler, ['reconcile'], 'custody reconciler');
  if (config.gates.policy) {
    assertMethods(dependencies.activationLeases, ['loadInactiveCandidates', 'reauthorizeCandidates'], 'activation leases');
    assertMethods(dependencies.policy, ['get'], 'policy service');
    assertMethods(dependencies.management, ['getPolicy', 'putPolicy', 'createIntent', 'listIntents', 'deleteIntent', 'stop'], 'management adapter');
  }
  if (config.gates.discovery) {
    assertMethods(dependencies.eligibility, ['resolvePeerForRelay'], 'eligibility resolver');
  }
  if (config.gates.initiation) {
    if (config.dailyCostLimit === null) throw new Error('RESTAP network initiation requires a positive daily cost limit.');
    assertMethods(dependencies.signer, ['sign'], 'grant signer');
    assertMethods(dependencies.keyRegistry, ['get'], 'key registry');
    assertMethods(dependencies.coordinator, ['reserve'], 'transaction coordinator');
    assertMethods(dependencies.worker, ['start', 'stopAcquisition', 'awaitCurrent'], 'worker');
    assertMethods(dependencies.providerBudget, ['read'], 'provider budget');
  }
  if (config.gates.replies) {
    assertMethods(dependencies.conversations, ['close'], 'conversations');
    assertMethods(dependencies.runtime, ['generate'], 'runtime');
  }
}

function assertGateRelationships(config) {
  if (config.gates.policy && !config.gates.foundation) throw new Error('RESTAP network policy requires foundation.');
  if (config.gates.discovery && !config.gates.policy) throw new Error('RESTAP network discovery requires policy.');
  if (config.gates.initiation && !config.gates.discovery) throw new Error('RESTAP network initiation requires discovery.');
  if (config.gates.replies && !config.gates.initiation) throw new Error('RESTAP network replies require initiation.');
  if (config.gates.transcripts) throw new Error('RESTAP network transcript persistence is unavailable during the pilot.');
  if (config.gates.pilot && !config.gates.foundation) throw new Error('RESTAP network pilot requires foundation.');
  if (config.gates.pilot && config.pilotRoster.length === 0 && !(config.gates.ga && config.gaRosterRemovalApproved)) throw new Error('RESTAP network pilot requires a protected roster.');
  if (config.gates.ga && (!config.gates.pilot || !config.gaApproved)) throw new Error('RESTAP network GA requires separate explicit approval and pilot gate.');
  if (config.gates.ga && config.pilotRoster.length === 0 && !config.gaRosterRemovalApproved) throw new Error('RESTAP network GA roster removal requires explicit approval.');
}

function normalizeConfig(value) {
  exactObject(value, CONFIG_KEYS, 'RESTAP network service config');
  exactObject(value.gates, GATE_NAMES, 'RESTAP network gates');
  for (const name of GATE_NAMES) if (typeof value.gates[name] !== 'boolean') throw new TypeError('RESTAP network gate must be boolean: ' + name + '.');
  return deepFreeze({
    gates: Object.fromEntries(GATE_NAMES.map((name) => [name, value.gates[name]])),
    databasePath: value.databasePath === null ? null : boundedText(value.databasePath, 'databasePath', 4_096),
    operationalHashSalt: value.operationalHashSalt === null ? null : boundedText(value.operationalHashSalt, 'operationalHashSalt', 512),
    dailyCostLimit: value.dailyCostLimit === null ? null : positiveInteger(value.dailyCostLimit, 'dailyCostLimit', 1_000_000_000),
    providerTimeoutMs: positiveInteger(value.providerTimeoutMs, 'providerTimeoutMs', 30_000),
    topics: exactClosedArray(value.topics, RESTAP_NETWORK_TOPICS, 'topics'),
    cadences: exactClosedArray(value.cadences, RESTAP_NETWORK_CADENCES, 'cadences'),
    pilotRoster: exactTokenArray(value.pilotRoster),
    gaApproved: requiredBoolean(value.gaApproved, 'gaApproved'),
    gaRosterRemovalApproved: requiredBoolean(value.gaRosterRemovalApproved, 'gaRosterRemovalApproved'),
  });
}

function normalizeDependencies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('RESTAP network dependencies must be a plain object.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new TypeError('RESTAP network dependencies contain an unknown symbol.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError('RESTAP network dependencies must use enumerable data properties.');
  }
  return value;
}

function requiredBoolean(value, label) { if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean.'); return value; }
function strictBoolean(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  throw new TypeError(label + ' must be an exact boolean.');
}
function optionalPositiveInteger(value, label, maximum) { if (value === undefined || value === null || value === '') return null; return positiveInteger(Number(value), label, maximum); }
function positiveInteger(value, label, maximum) { if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError(label + ' must be a positive bounded integer.'); return value; }
function optionalText(value, label, maximum) { if (value === undefined || value === null || value === '') return null; return boundedText(value, label, maximum); }
function boundedText(value, label, maximum) { if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(label + ' is invalid.'); return value.trim(); }
function closedList(value, allowed, label) { if (value === undefined || value === null || value === '') return null; return exactClosedArray(String(value).split(',').map((item) => item.trim()).filter(Boolean), allowed, label); }
function exactClosedArray(value, allowed, label) { if (!Array.isArray(value) || value.length === 0 || value.length > allowed.length || new Set(value).size !== value.length || value.some((item) => !allowed.includes(item))) throw new TypeError(label + ' contains an unknown or duplicate value.'); return Object.freeze([...value].sort()); }
function tokenList(value) { if (value === undefined || value === null || value === '') return Object.freeze([]); return exactTokenArray(String(value).split(',').map((item) => item.trim()).filter(Boolean)); }
function exactTokenArray(value) { if (!Array.isArray(value) || value.length > 256) throw new TypeError('Pilot roster is invalid.'); const result = value.map(normalizeRestapNetworkTokenId); if (new Set(result).size !== result.length) throw new TypeError('Pilot roster contains duplicates.'); return Object.freeze(result.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)); }
function assertMethods(value, names, label) { if (!value || names.some((name) => typeof value[name] !== 'function')) throw new Error('RESTAP network ' + label + ' is unavailable.'); }

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(label + ' must be a plain exact object.');
  const actual = Reflect.ownKeys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(label + ' must contain exact fields.');
  for (const key of actual) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) throw new TypeError(label + ' fields must be enumerable data properties.'); }
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }

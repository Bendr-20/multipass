#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const GATES = Object.freeze(['foundation', 'policy', 'discovery', 'initiation', 'replies', 'transcripts', 'pilot', 'ga']);
const PHASES = Object.freeze(['phase0', 'foundation', 'holder-opt-in', 'internal-discovery', 'one-shot', 'daily', 'replies']);
const VALUE_FLAGS = new Map([
  ['--mode', 'mode'], ['--phase', 'phase'], ['--expected-gates', 'expectedGates'], ['--release-sha', 'releaseSha'],
  ['--release', 'release'], ['--artifact', 'artifact'], ['--policy', 'policy'], ['--key-registry', 'keyRegistry'],
  ['--database', 'database'], ['--base-url', 'baseUrl'], ['--fixture-key-ref', 'fixtureKeyRef'],
]);

export function parseRestapNetworkSmokeArgs(argv) {
  if (!Array.isArray(argv)) throw new TypeError('Smoke arguments are required.');
  const values = { fixtureKeyRefs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-provider-call') { values.allowProviderCall = true; continue; }
    if (arg === '--execute') { values.execute = true; continue; }
    if (arg === '--help') { values.help = true; continue; }
    const key = VALUE_FLAGS.get(arg);
    if (!key) throw new TypeError('Unknown RESTAP network smoke argument.');
    const value = argv[++index];
    if (typeof value !== 'string' || !value) throw new TypeError(arg + ' requires a value.');
    if (key === 'fixtureKeyRef') values.fixtureKeyRefs.push(parseFixtureRef(value));
    else if (Object.hasOwn(values, key)) throw new TypeError(arg + ' may be supplied once.');
    else values[key] = value;
  }
  if (values.help) return deepFreeze({ help: true });
  for (const key of ['mode', 'phase', 'expectedGates', 'releaseSha', 'release', 'artifact', 'policy', 'keyRegistry', 'database']) if (!values[key]) throw new TypeError('Required RESTAP network smoke argument is missing: ' + key + '.');
  if (!['local', 'remote'].includes(values.mode)) throw new TypeError('Smoke mode is invalid.');
  if (!PHASES.includes(values.phase)) throw new TypeError('Smoke phase is invalid.');
  if (!/^[0-9a-f]{40}$/u.test(values.releaseSha)) throw new TypeError('Release SHA is invalid.');
  const expectedGates = parseGateTuple(values.expectedGates);
  const requiredTuple = { phase0: '0,0,0,0,0,0,0,0', foundation: '1,0,0,0,0,0,0,0', 'holder-opt-in': '1,1,0,0,0,0,0,0', 'internal-discovery': '1,1,1,0,0,0,1,0', 'one-shot': '1,1,1,1,0,0,1,0', daily: '1,1,1,1,0,0,1,0', replies: '1,1,1,1,1,0,1,0' }[values.phase];
  if (values.expectedGates !== requiredTuple) throw new TypeError('Expected gate tuple does not match the selected phase.');
  if (values.fixtureKeyRefs.length === 0) throw new TypeError('At least one fixture key reference is required.');
  if (values.mode === 'remote' && !values.baseUrl) throw new TypeError('Remote smoke requires --base-url.');
  if (values.baseUrl) {
    let parsed; try { parsed = new URL(values.baseUrl); } catch { throw new TypeError('Smoke base URL must be exact HTTPS origin text.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.pathname.endsWith('/') || parsed.search || parsed.hash || parsed.href !== values.baseUrl) throw new TypeError('Smoke base URL must be exact canonical HTTPS candidate base text ending in slash.');
  }
  if (values.allowProviderCall && !values.execute) throw new TypeError('--allow-provider-call requires --execute.');
  return deepFreeze({
    mode: values.mode, phase: values.phase, expectedGates, releaseSha: values.releaseSha,
    release: values.release, artifact: values.artifact, policy: values.policy, keyRegistry: values.keyRegistry,
    database: values.database, baseUrl: values.baseUrl ?? null, fixtureKeyRefs: values.fixtureKeyRefs,
    allowProviderCall: values.allowProviderCall === true, execute: values.execute === true,
  });
}

export async function runRestapNetworkSmoke(config, dependencies = defaultDependencies()) {
  if (!config || config.help) throw new TypeError('Parsed smoke configuration is required.');
  for (const name of ['inspectRelease', 'inspectArtifact', 'inspectDatabase', 'inspectKeys', 'inspectRoutes', 'callProvider', 'mutate']) if (typeof dependencies?.[name] !== 'function') throw new TypeError('Smoke dependency is unavailable: ' + name + '.');
  const checks = [];
  const add = (name, passed, details = null) => { if (!passed) throw new Error('RESTAP network smoke failed: ' + name + '.'); checks.push(deepFreeze({ name, status: 'passed', details })); };
  const release = await dependencies.inspectRelease(config);
  add('immutable_release', release.immutable === true, { sha: config.releaseSha });
  const artifact = await dependencies.inspectArtifact(config);
  add('artifact', Number.isSafeInteger(artifact.count) && artifact.count >= 0 && /^[0-9a-f]{64}$/u.test(artifact.hash), { count: artifact.count, hash: artifact.hash });
  const database = await dependencies.inspectDatabase(config);
  add('database_integrity', database.integrity === 'ok');
  add('policy_closed_defaults', database.policyDefaults === 'closed');
  add('leases_inactive', database.leases === 'inactive');
  const trafficWorkerExpected = ['one-shot', 'daily', 'replies'].includes(config.phase);
  add(trafficWorkerExpected ? 'worker_singleton' : 'worker_stopped', database.workerHolders === (trafficWorkerExpected ? 1 : 0));
  const keys = await dependencies.inspectKeys(config);
  add('signer_registry', keys.ready === true && /^[0-9a-f]{64}$/u.test(keys.registryHash), { registryHash: keys.registryHash });
  const routes = await dependencies.inspectRoutes(config);
  add('no_public_network_route', routes.publicNetworkRoutes === 0);
  add('transcript_unavailable', config.expectedGates[GATES.indexOf('transcripts')] === false);
  add('restap_3802_golden', routes.restap3802Golden === true);

  let mutated = false;
  if (config.execute && config.phase !== 'phase0') {
    const mutation = await dependencies.mutate(config);
    mutated = mutation?.applied === true;
    add('phase_mutation', mutated, { phase: config.phase });
  }
  let providerCalled = false;
  if (config.execute && config.allowProviderCall) {
    if (!['one-shot', 'daily', 'replies'].includes(config.phase)) throw new Error('Provider calls are forbidden for this phase.');
    const proof = await dependencies.callProvider(config);
    providerCalled = true;
    add('bounded_replies', proof?.boundedReplies === true);
    add('revocation_race', proof?.revocationRace === 'contained');
    add('exact_accounting', proof?.accounting === 'exact');
  }
  return deepFreeze({ mode: config.mode, phase: config.phase, gateTuple: config.expectedGates.map(Number).join(','), providerCalled, mutated, checks });
}

function defaultDependencies() {
  return Object.freeze({
    async inspectRelease(config) {
      const info = await lstat(config.release);
      const resolved = await realpath(config.release);
      return { immutable: info.isDirectory() && !info.isSymbolicLink() && resolved.endsWith('multipass-restap-network-' + config.releaseSha) };
    },
    async inspectArtifact(config) {
      const bytes = await readFile(config.artifact);
      let parsed; try { parsed = JSON.parse(bytes); } catch { parsed = null; }
      const count = Array.isArray(parsed) ? parsed.length : Number(parsed?.count ?? parsed?.records?.length ?? 0);
      return { count, hash: createHash('sha256').update(bytes).digest('hex') };
    },
    async inspectDatabase(config) {
      const db = new DatabaseSync(config.database, { readOnly: true });
      try {
        const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check).join(',');
        const openPolicies = Number(db.prepare('SELECT count(*) AS count FROM restap_network_owner_policies WHERE network_enabled <> 0 OR inbound_enabled <> 0 OR autonomous_enabled <> 0').get().count);
        const activeLeases = Number(db.prepare("SELECT count(*) AS count FROM restap_network_activation_leases WHERE status = 'active'").get().count);
        const workerHolders = Number(db.prepare('SELECT count(*) AS count FROM restap_network_worker_lease').get().count);
        return { integrity, policyDefaults: openPolicies === 0 ? 'closed' : 'open', leases: activeLeases === 0 ? 'inactive' : 'active', workerHolders };
      } finally { db.close(); }
    },
    async inspectKeys(config) {
      const bytes = await readFile(config.keyRegistry);
      const parsed = JSON.parse(bytes);
      return { ready: Array.isArray(parsed?.keys) && parsed.keys.some((key) => ['signing', 'overlap'].includes(key.status)), registryHash: createHash('sha256').update(bytes).digest('hex') };
    },
    async inspectRoutes(config) {
      if (!config.baseUrl) return { publicNetworkRoutes: 0, restap3802Golden: true };
      const guesses = ['/api/restap/network/discovery', '/api/restap/network/opening', '/api/restap/network/reply'];
      const responses = await Promise.all(guesses.map((path) => fetch(new URL(path.slice(1), config.baseUrl))));
      const publicNetworkRoutes = responses.filter((response) => response.status !== 404).length;
      const golden = await fetch(new URL('api/restap/loopers/3802/.well-known/restap.json', config.baseUrl));
      return { publicNetworkRoutes, restap3802Golden: golden.status === 200 };
    },
    async callProvider() { throw new Error('Live provider smoke requires an injected reviewed provider proof adapter.'); },
    async mutate() { throw new Error('Phase mutation requires an injected reviewed mutation adapter.'); },
  });
}

function parseFixtureRef(value) {
  const separator = value.indexOf('=');
  const name = value.slice(0, separator);
  const path = value.slice(separator + 1);
  const allowedPathCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/-';
  if (separator < 2 || !/^[a-z][a-z0-9_-]{1,31}$/u.test(name) || !path.startsWith('/') || path.length > 4096 || path.includes('..') || [...path].some((character) => !allowedPathCharacters.includes(character))) throw new TypeError('Fixture key reference is invalid.');
  return deepFreeze({ name, path });
}
function parseGateTuple(value) {
  const parts = String(value).split(',');
  if (parts.length !== GATES.length || parts.some((part) => part !== '0' && part !== '1')) throw new TypeError('Expected gate tuple must contain eight exact bits.');
  return Object.freeze(parts.map((part) => part === '1'));
}
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }

function help() {
  return 'Usage: smoke-looper-restap-network.mjs --mode local|remote --phase phase0|foundation|holder-opt-in|internal-discovery|one-shot|daily|replies --expected-gates 0,0,0,0,0,0,0,0 --release-sha SHA --release PATH --artifact PATH --policy PATH --key-registry PATH --database PATH --fixture-key-ref name=/path [--base-url https://host] [--execute] [--allow-provider-call]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--help')) { console.log(help()); process.exitCode = 0; }
    else console.log(JSON.stringify(await runRestapNetworkSmoke(parseRestapNetworkSmokeArgs(process.argv.slice(2)))));
  } catch (error) {
    console.error('RESTAP network smoke failed: ' + String(error?.message ?? 'unavailable'));
    process.exitCode = 1;
  }
}

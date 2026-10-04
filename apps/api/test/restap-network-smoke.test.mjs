import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseRestapNetworkSmokeArgs, runRestapNetworkSmoke } from '../scripts/smoke-looper-restap-network.mjs';

const SHA = 'a'.repeat(40);
const BASE_ARGS = ['--mode', 'local', '--phase', 'phase0', '--expected-gates', '0,0,0,0,0,0,0,0', '--release-sha', SHA, '--release', '/releases/multipass-restap-network-' + SHA, '--artifact', '/proof/artifact.json', '--policy', '/run/restap/policy.json', '--key-registry', '/run/restap/keys.json', '--database', '/var/lib/restap/network.sqlite', '--fixture-key-ref', 'signer=/run/restap/signing.key'];

test('smoke parser requires explicit mode phase gate tuple immutable release and fixture references', () => {
  const parsed = parseRestapNetworkSmokeArgs(BASE_ARGS);
  assert.deepEqual(parsed.expectedGates, [false, false, false, false, false, false, false, false]);
  assert.equal(parsed.allowProviderCall, false);
  assert.equal(parsed.execute, false);
  assert.equal(Object.isFrozen(parsed), true);
  for (const bad of [[], [...BASE_ARGS, '--session', 'secret'], BASE_ARGS.filter((_, i) => i < BASE_ARGS.length - 2), [...BASE_ARGS.slice(0, 5), '1,0,0,0,0,0,0,0', ...BASE_ARGS.slice(6)]]) assert.throws(() => parseRestapNetworkSmokeArgs(bad), /required|unknown|gate|fixture/i);
});

test('default smoke performs no mutation or provider call and phase0 runs every closed proof', async () => {
  const calls = [];
  const result = await runRestapNetworkSmoke(parseRestapNetworkSmokeArgs(BASE_ARGS), {
    inspectRelease: async () => { calls.push('release'); return { immutable: true }; },
    inspectArtifact: async () => { calls.push('artifact'); return { count: 7777, hash: 'b'.repeat(64) }; },
    inspectDatabase: async () => { calls.push('database'); return { integrity: 'ok', policyDefaults: 'closed', leases: 'inactive', workerHolders: 0 }; },
    inspectKeys: async () => { calls.push('keys'); return { ready: true, registryHash: 'c'.repeat(64) }; },
    inspectRoutes: async () => { calls.push('routes'); return { publicNetworkRoutes: 0, restap3802Golden: true }; },
    callProvider: async () => { calls.push('provider'); },
    mutate: async () => { calls.push('mutation'); },
  });
  assert.deepEqual(calls, ['release', 'artifact', 'database', 'keys', 'routes']);
  assert.equal(result.providerCalled, false);
  assert.equal(result.mutated, false);
  assert.deepEqual(result.checks.map((entry) => entry.name), ['immutable_release', 'artifact', 'database_integrity', 'policy_closed_defaults', 'leases_inactive', 'worker_stopped', 'signer_registry', 'no_public_network_route', 'transcript_unavailable', 'restap_3802_golden']);
});

test('remote smoke accepts an exact HTTPS candidate prefix and rejects non-canonical URLs', () => {
  const args = [...BASE_ARGS];
  args[3] = 'holder-opt-in';
  args[5] = '1,1,0,0,0,0,0,0';
  const parsed = parseRestapNetworkSmokeArgs([...args, '--base-url', 'https://helixa.xyz/multipass-api/']);
  assert.equal(parsed.baseUrl, 'https://helixa.xyz/multipass-api/');
  assert.throws(() => parseRestapNetworkSmokeArgs([...args, '--base-url', 'https://helixa.xyz/multipass-api']), /base URL/i);
});

test('holder opt-in is a separate foundation-plus-policy phase with all traffic off', () => {
  const args = [...BASE_ARGS];
  args[3] = 'holder-opt-in';
  args[5] = '1,1,0,0,0,0,0,0';
  const parsed = parseRestapNetworkSmokeArgs(args);
  assert.deepEqual(parsed.expectedGates, [true, true, false, false, false, false, false, false]);
  assert.equal(parsed.allowProviderCall, false);
});

test('pilot phases require explicit provider approval and include revocation accounting proof', async () => {
  const pilotArgs = [...BASE_ARGS];
  pilotArgs[3] = 'one-shot';
  pilotArgs[5] = '1,1,1,1,0,0,1,0';
  const args = parseRestapNetworkSmokeArgs([...pilotArgs, '--allow-provider-call', '--execute']);
  let providers = 0;
  const result = await runRestapNetworkSmoke(args, {
    inspectRelease: async () => ({ immutable: true }), inspectArtifact: async () => ({ count: 1, hash: 'b'.repeat(64) }),
    inspectDatabase: async () => ({ integrity: 'ok', policyDefaults: 'closed', leases: 'inactive', workerHolders: 1 }),
    inspectKeys: async () => ({ ready: true, registryHash: 'c'.repeat(64) }), inspectRoutes: async () => ({ publicNetworkRoutes: 0, restap3802Golden: true }),
    callProvider: async () => { providers += 1; return { boundedReplies: true, revocationRace: 'contained', accounting: 'exact' }; }, mutate: async () => ({ applied: true }),
  });
  assert.equal(providers, 1);
  assert.equal(result.providerCalled, true);
  assert.equal(result.checks.some((entry) => entry.name === 'revocation_race'), true);
  assert.equal(result.checks.some((entry) => entry.name === 'exact_accounting'), true);
});

test('package registers offline smoke help', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.scripts['smoke:restap-network'], 'node scripts/smoke-looper-restap-network.mjs');
});

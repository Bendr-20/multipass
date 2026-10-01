import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConsoleCodexBundle, queryConsoleCodex } from '../src/console-codex-api.js';

const HASH = 'a'.repeat(64);
const TOKEN_ID = '617';

function envelope(operation, result = {}, overrides = {}) {
  return { schemaVersion: '1.0.0', artifactHash: HASH, codexVersion: 'traits-v1', operation, subjectIds: [617], evidence: [], result, ...overrides };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

async function withLocation(run) {
  const previousLocation = globalThis.location;
  globalThis.location = new URL('https://helixa.xyz/multipass/console');
  try { return await run(); } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
}

test('queryConsoleCodex sends the exact same-origin credentialed request with CSRF', async () => withLocation(async () => {
  const calls = [];
  const response = await queryConsoleCodex({
    apiBase: 'https://helixa.xyz', selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 }, csrfToken: 'csrf-1',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResponse(envelope('getTokenProfile', { identity: { tokenId: 617 } })); },
  });
  assert.equal(response.operation, 'getTokenProfile');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://helixa.xyz/api/multipass/console/codex/query');
  assert.deepEqual(calls[0].init, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': 'csrf-1' },
    body: JSON.stringify({ selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 } }),
  });
}));

test('queryConsoleCodex rejects cross-origin API targets before fetch', async () => withLocation(async () => {
  await assert.rejects(queryConsoleCodex({
    apiBase: 'https://evil.example', selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 }, csrfToken: 'csrf-1',
    fetchImpl: async () => assert.fail('cross-origin fetch must not run'),
  }), /same-origin/i);
}));

test('queryConsoleCodex validates only the closed outer envelope, operation, and version hashes', async () => withLocation(async () => {
  const base = { apiBase: 'https://helixa.xyz', selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 }, csrfToken: 'csrf-1' };
  const hostileResult = { nested: '<script>', arbitraryFutureField: { accepted: true } };
  const accepted = await queryConsoleCodex({ ...base, fetchImpl: async () => jsonResponse(envelope('getTokenProfile', hostileResult)) });
  assert.equal(accepted.result, hostileResult);
  const forged = Object.assign(Object.create({ polluted: true }), envelope('getTokenProfile'));
  for (const invalid of [
    { ...envelope('getTokenProfile'), extra: true },
    { ...envelope('findSimilar'), operation: 'findSimilar' },
    { ...envelope('getTokenProfile'), artifactHash: 'A'.repeat(64) },
    { ...envelope('getTokenProfile'), codexVersion: '../artifact.json' },
    forged,
  ]) await assert.rejects(queryConsoleCodex({ ...base, fetchImpl: async () => jsonResponse(invalid) }), /Codex response/i);
}));

test('queryConsoleCodex returns bounded server errors without trusting malformed bodies', async () => withLocation(async () => {
  await assert.rejects(queryConsoleCodex({
    apiBase: 'https://helixa.xyz', selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 }, csrfToken: 'csrf-1',
    fetchImpl: async () => jsonResponse({ error: { message: 'Codex is unavailable.' } }, 503),
  }), (error) => error.name === 'SavedMultipassError' && error.details.status === 503 && /unavailable/i.test(error.message));
}));

test('loadConsoleCodexBundle starts all three closed reads concurrently and returns one release bundle', async () => withLocation(async () => {
  const calls = [];
  const resolvers = [];
  const pending = loadConsoleCodexBundle({
    apiBase: 'https://helixa.xyz', selectedTokenId: TOKEN_ID, csrfToken: 'csrf-1',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      return new Promise((resolve) => resolvers.push(() => resolve(jsonResponse(envelope(body.operation, { tokenId: 617 })))))
    },
  });
  await Promise.resolve();
  assert.deepEqual(calls, [
    { selectedTokenId: TOKEN_ID, operation: 'getTokenProfile', input: { tokenId: 617 } },
    { selectedTokenId: TOKEN_ID, operation: 'explainTraits', input: { tokenId: 617 } },
    { selectedTokenId: TOKEN_ID, operation: 'findSimilar', input: { tokenId: 617 } },
  ]);
  resolvers.forEach((resolve) => resolve());
  const bundle = await pending;
  assert.deepEqual(Object.keys(bundle), ['selectedTokenId', 'artifactHash', 'codexVersion', 'profile', 'explanation', 'similarity']);
  assert.equal(bundle.profile.operation, 'getTokenProfile');
  assert.equal(bundle.explanation.operation, 'explainTraits');
  assert.equal(bundle.similarity.operation, 'findSimilar');
}));

test('loadConsoleCodexBundle rejects mixed artifact hashes or Codex versions', async () => withLocation(async () => {
  for (const mismatch of [
    { operation: 'findSimilar', artifactHash: 'b'.repeat(64) },
    { operation: 'explainTraits', codexVersion: 'traits-v2' },
  ]) await assert.rejects(loadConsoleCodexBundle({
    apiBase: 'https://helixa.xyz', selectedTokenId: TOKEN_ID, csrfToken: 'csrf-1',
    fetchImpl: async (_url, init) => {
      const { operation } = JSON.parse(init.body);
      return jsonResponse(envelope(operation, {}, operation === mismatch.operation ? mismatch : {}));
    },
  }), /same artifact/i);
}));

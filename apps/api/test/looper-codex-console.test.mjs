import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';
import {
  LooperCodexInputError,
  LooperCodexUnavailableError,
} from '../src/looper-codex-runtime.js';
import { LOOPERS_MAINNET_CONTRACT } from '../src/loopers-owned-agents.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const ROUTE = 'https://helixa.test/api/multipass/console/codex/query';
const SESSION = 'multipass_console=test-session';
const CSRF = 'test-csrf';

function identity(tokenId, wallet = WALLET) {
  return {
    chainId: 8453,
    contract: LOOPERS_MAINNET_CONTRACT,
    tokenId: String(tokenId),
    owner: wallet,
    erc8004AgentId: String(90_000 + Number(tokenId)),
    controllerVerified: true,
  };
}

function createApi({
  runtime,
  wallet = WALLET,
  authorizer,
  logger,
  consoleCodexWalletRateLimit,
  consoleCodexGlobalRateLimit,
} = {}) {
  return createMultipassApi({
    store: createMemoryStore(),
    baseUrl: 'https://helixa.test',
    allowedOrigins: ['https://helixa.test'],
    consoleAuthStore: {
      validateSession({ sessionId, csrfToken, requireCsrf }) {
        if (sessionId !== 'test-session') throw new Error('Invalid Console session.');
        if (requireCsrf && csrfToken !== CSRF) throw new Error('Invalid Console CSRF token.');
        return { wallet };
      },
    },
    loopersAuthorizer: authorizer ?? (async ({ tokenId, wallet: requestedWallet }) => identity(tokenId, requestedWallet)),
    looperCodexRuntime: runtime ?? availableRuntime(),
    logger: logger ?? {},
    consoleCodexWalletRateLimit,
    consoleCodexGlobalRateLimit,
  });
}

function availableRuntime(query = (operation, input) => ({
  schemaVersion: '1.0.0',
  artifactHash: 'a'.repeat(64),
  codexVersion: 'traits-v1',
  operation,
  result: input,
})) {
  return {
    available: true,
    status: {
      available: true,
      schemaVersion: '1.0.0',
      artifactHash: 'a'.repeat(64),
      codexVersion: 'traits-v1',
      count: 7_777,
    },
    query,
  };
}

function request(body, {
  origin = 'https://helixa.test',
  cookie = SESSION,
  csrf = CSRF,
  headers = {},
} = {}) {
  return new Request(ROUTE, {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'x-csrf-token': csrf,
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

function assertError(response, body, status, code) {
  assert.equal(response.status, status);
  assert.equal(body.schema_version, '0.1.0');
  assert.equal(body.error.code, code);
}

test('POST Codex query returns the exact adapter envelope without runtime activation', async () => {
  const expected = Object.freeze({
    schemaVersion: '1.0.0',
    artifactHash: 'a'.repeat(64),
    codexVersion: 'traits-v1',
    operation: 'getTokenProfile',
    result: Object.freeze({ identity: Object.freeze({ tokenId: 617 }) }),
  });
  let received;
  let authorizerInput;
  const api = createApi({
    runtime: availableRuntime((operation, input) => {
      received = { operation, input };
      return expected;
    }),
    authorizer: async (input) => {
      authorizerInput = input;
      return identity(input.tokenId, input.wallet);
    },
  });

  const response = await api.handleRequest(request({
    input: { tokenId: 617 },
    operation: 'getTokenProfile',
    selectedTokenId: '0617',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), expected);
  assert.deepEqual(received, { operation: 'getTokenProfile', input: { tokenId: 617 } });
  assert.deepEqual(authorizerInput, { tokenId: '617', wallet: WALLET });
});

test('Codex query enforces exact root schema, trusted origin, session, CSRF, body cap, and ownership', async () => {
  let queryCalls = 0;
  const runtime = availableRuntime(() => {
    queryCalls += 1;
    return { ok: true };
  });
  const api = createApi({
    runtime,
    authorizer: async ({ tokenId, wallet }) => {
      if (wallet !== WALLET || tokenId !== '617') {
        const error = new Error('Authenticated wallet does not own this Looper.');
        error.code = 'forbidden';
        throw error;
      }
      return identity(tokenId, wallet);
    },
  });
  const valid = { input: { tokenId: 617 }, operation: 'getTokenProfile', selectedTokenId: '617' };
  const cases = [
    [request({ input: {}, operation: 'getCollectionSummary' }), 400, 'invalid_codex_query'],
    [request({ ...valid, extra: true }), 400, 'invalid_codex_query'],
    [request(valid, { origin: 'https://evil.test' }), 403, 'forbidden'],
    [request(valid, { cookie: '' }), 401, 'unauthorized'],
    [request(valid, { csrf: '' }), 403, 'forbidden'],
    [request({ ...valid, selectedTokenId: '618' }), 403, 'forbidden'],
  ];
  for (const [input, status, code] of cases) {
    const response = await api.handleRequest(input);
    assertError(response, await bodyOf(response), status, code);
  }

  const tooLarge = await api.handleRequest(request(JSON.stringify({
    ...valid,
    input: { prompt: 'x'.repeat(16 * 1024) },
  })));
  assertError(tooLarge, await bodyOf(tooLarge), 413, 'request_too_large');
  assert.equal(queryCalls, 0);
});

test('Codex query maps only typed adapter errors to closed API errors', async () => {
  for (const [error, status, code] of [
    [new LooperCodexUnavailableError('secret loader path /srv/private/codex.json'), 503, 'codex_unavailable'],
    [new LooperCodexInputError('private prompt must not be echoed'), 400, 'invalid_codex_query'],
  ]) {
    const api = createApi({ runtime: availableRuntime(() => { throw error; }) });
    const response = await api.handleRequest(request({
      input: {}, operation: 'getCollectionSummary', selectedTokenId: '617',
    }));
    const body = await bodyOf(response);
    assertError(response, body, status, code);
    assert.equal(JSON.stringify(body).includes(error.message), false);
  }
});

test('Codex query applies exactly 120 wallet/token requests per minute', async () => {
  let queryCalls = 0;
  const api = createApi({ runtime: availableRuntime(() => ({ call: ++queryCalls })) });
  const payload = { input: {}, operation: 'getCollectionSummary', selectedTokenId: '617' };
  for (let index = 0; index < 120; index += 1) {
    const response = await api.handleRequest(request(payload));
    assert.equal(response.status, 200, 'request ' + (index + 1));
  }
  const limited = await api.handleRequest(request(payload));
  const text = await limited.text();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.ok(Buffer.byteLength(text) < 512);
  assert.equal(JSON.parse(text).error.code, 'codex_rate_limited');
  assert.equal(queryCalls, 120);
});

test('Codex query applies exactly 1,200 total requests per minute', async () => {
  let queryCalls = 0;
  const api = createApi({ runtime: availableRuntime(() => ({ call: ++queryCalls })) });
  for (let tokenId = 1; tokenId <= 1_200; tokenId += 1) {
    const response = await api.handleRequest(request({
      input: {}, operation: 'getCollectionSummary', selectedTokenId: String(tokenId),
    }));
    assert.equal(response.status, 200, 'request ' + tokenId);
  }
  const limited = await api.handleRequest(request({
    input: {}, operation: 'getCollectionSummary', selectedTokenId: '1201',
  }));
  const text = await limited.text();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.ok(Buffer.byteLength(text) < 512);
  assert.equal(JSON.parse(text).error.code, 'codex_global_rate_limited');
  assert.equal(queryCalls, 1_200);
});

test('Codex query logs only bounded operational metadata', async () => {
  const entries = [];
  const logger = { info(entry) { entries.push(entry); }, warn(entry) { entries.push(entry); } };
  const api = createApi({ logger });
  const sensitive = {
    lore: 'forbidden lore',
    traits: ['forbidden trait'],
    prompt: 'forbidden prompt',
    cookie: SESSION,
    owner: WALLET,
    artifactPath: '/srv/private/codex.json',
  };
  const response = await api.handleRequest(request({
    input: { tokenId: 617, ...sensitive },
    operation: 'getTokenProfile',
    selectedTokenId: '617',
  }));
  assert.equal(response.status, 200);
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]), [
    'event', 'operation', 'selectedTokenId', 'status', 'durationMs',
    'schemaVersion', 'artifactHashPrefix', 'errorClass',
  ]);
  assert.deepEqual(entries[0], {
    event: 'looper_codex_query',
    operation: 'getTokenProfile',
    selectedTokenId: '617',
    status: 200,
    durationMs: entries[0].durationMs,
    schemaVersion: '1.0.0',
    artifactHashPrefix: 'aaaaaaaaaaaa',
    errorClass: null,
  });
  assert.ok(Number.isSafeInteger(entries[0].durationMs));
  const serialized = JSON.stringify(entries);
  for (const secret of Object.values(sensitive).flat()) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(serialized.includes(OTHER_WALLET), false);
});

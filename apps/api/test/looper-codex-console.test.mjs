import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';
import {
  LooperCodexInputError,
  LooperCodexUnavailableError,
} from '../src/looper-codex-runtime.js';
import { LOOPERS_MAINNET_CONTRACT } from '../src/loopers-owned-agents.js';
import { createLooperRuntimeRegistry } from '../src/looper-runtime-registry.js';

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
  consoleCodexRateLimitNow,
  consoleCodexWalletMaxBuckets,
  consoleRuntimeRegistry,
  consoleAgentRuntime,
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
    consoleCodexRateLimitNow,
    consoleCodexWalletMaxBuckets,
    consoleRuntimeRegistry,
    consoleAgentRuntime,
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

function messageRequest(body) {
  return new Request('https://helixa.test/api/multipass/console/agent/message', {
    method: 'POST',
    headers: {
      origin: 'https://helixa.test',
      cookie: SESSION,
      'x-csrf-token': CSRF,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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

test('Codex profile context is fetched only after owner authorization and runtime activation', async () => {
  const events = [];
  const profileContext = Object.freeze({
    schemaVersion: '1.0.0',
    artifactHash: 'a'.repeat(64),
    codexVersion: 'traits-v1',
    identity: Object.freeze({ tokenId: '617', canonicalName: 'Looper #617' }),
    interpretation: Object.freeze({
      primaryClass: 'Researcher', secondaryClass: '', specialization: '',
      risk: Object.freeze({ value: 'balanced', label: 'Balanced' }),
      autonomy: Object.freeze({ value: 'high', label: 'High' }),
      voice: 'precise', values: Object.freeze([]), communicationStyle: Object.freeze([]),
      humor: Object.freeze([]), origin: '', shortLore: '', missionBias: '', firstMission: '',
      recommendedSkills: Object.freeze([]),
    }),
    traits: Object.freeze([]),
    versions: Object.freeze({ traitCodexVersion: 'traits-v1', classModelVersion: 'classes-v1' }),
    evidence: Object.freeze([]),
  });
  const runtime = {
    ...availableRuntime(),
    getProfileContext(tokenId) {
      events.push('codex:' + typeof tokenId + ':' + tokenId);
      return profileContext;
    },
  };
  const consoleAgentRuntime = {
    async handleMessage(input) {
      events.push('message');
      assert.deepEqual(input.codexContext, profileContext);
      return { schema_version: '0.1.0', thread: { messages: [] }, proposals: [], missions: [] };
    },
  };

  const deniedApi = createApi({
    runtime,
    authorizer: async () => {
      events.push('authorize:denied');
      const error = new Error('not owner');
      error.code = 'forbidden';
      throw error;
    },
    consoleAgentRuntime,
  });
  assert.equal((await deniedApi.handleRequest(messageRequest({ tokenId: '617', message: 'hello' }))).status, 403);
  assert.deepEqual(events, ['authorize:denied']);

  events.length = 0;
  const inactiveApi = createApi({
    runtime,
    authorizer: async ({ tokenId, wallet }) => {
      events.push('authorize:active-owner');
      return identity(tokenId, wallet);
    },
    consoleAgentRuntime,
  });
  assert.equal((await inactiveApi.handleRequest(messageRequest({ tokenId: '617', message: 'hello' }))).status, 403);
  assert.deepEqual(events, ['authorize:active-owner']);

  events.length = 0;
  const registry = createLooperRuntimeRegistry();
  registry.activate({ identity: identity('617'), runtimeName: 'Looper #617' });
  const activeApi = createApi({
    runtime,
    authorizer: async ({ tokenId, wallet }) => {
      events.push('authorize:active-owner');
      return identity(tokenId, wallet);
    },
    consoleRuntimeRegistry: registry,
    consoleAgentRuntime,
  });
  assert.equal((await activeApi.handleRequest(messageRequest({ tokenId: '617', message: 'hello' }))).status, 200);
  assert.deepEqual(events, ['authorize:active-owner', 'codex:number:617', 'message']);
});

test('unavailable Codex degrades activated chat to canonical identity without failing the turn', async () => {
  const canonicalIdentity = {
    ...identity('617'),
    persona: { tokenId: '617', canonicalName: 'Canonical Looper #617', voice: 'canonical voice' },
  };
  const registry = createLooperRuntimeRegistry();
  registry.activate({ identity: canonicalIdentity, runtimeName: 'Canonical Looper #617' });
  let received = null;
  const api = createApi({
    runtime: {
      available: false,
      status: Object.freeze({ available: false, reason: 'not_configured' }),
      query() { throw new LooperCodexUnavailableError(); },
      getProfileContext() { throw new LooperCodexUnavailableError(); },
    },
    authorizer: async () => canonicalIdentity,
    consoleRuntimeRegistry: registry,
    consoleAgentRuntime: {
      async handleMessage(input) {
        received = input;
        return { schema_version: '0.1.0', thread: { messages: [] }, proposals: [], missions: [] };
      },
    },
  });

  const response = await api.handleRequest(messageRequest({ tokenId: '617', message: 'Who are you?' }));

  assert.equal(response.status, 200);
  assert.equal(received.canonicalIdentity.persona.canonicalName, 'Canonical Looper #617');
  assert.equal(received.codexContext, null);
});

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

test('Codex query maps typed input and every runtime failure to closed API errors', async () => {
  for (const [error, status, code] of [
    [new LooperCodexUnavailableError('secret loader path /srv/private/codex.json'), 503, 'codex_unavailable'],
    [new LooperCodexInputError('private prompt must not be echoed'), 400, 'invalid_codex_query'],
    [new Error('unexpected adapter failure at /srv/private/secret-codex.json'), 503, 'codex_unavailable'],
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

test('Codex authorization infrastructure failures are closed before the HTTP fallback', async () => {
  const secret = 'https://rpc.internal.example/private?key=secret at /srv/private/provider.json';
  const entries = [];
  let runtimeCalls = 0;
  const api = createApi({
    logger: { info(event) { entries.push(event); } },
    authorizer: async () => { throw new Error(secret); },
    runtime: availableRuntime(() => { runtimeCalls += 1; return {}; }),
  });
  const response = await api.handleRequest(request({
    input: {}, operation: 'getCollectionSummary', selectedTokenId: '617',
  }));
  const text = await response.text();
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(text).error.code, 'codex_unavailable');
  assert.equal(text.includes(secret), false);
  assert.equal(runtimeCalls, 0);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    event: 'looper_codex_query',
    operation: 'getCollectionSummary',
    selectedTokenId: '617',
    status: 503,
    durationMs: entries[0].durationMs,
    schemaVersion: '1.0.0',
    artifactHashPrefix: 'aaaaaaaaaaaa',
    errorClass: 'Error',
  });
});

test('forbidden ownership errors keep the public 403 shape without leaking infrastructure details', async () => {
  const secret = 'https://rpc.internal.example/private?key=*** at /srv/private/owner.json';
  const error = new Error(secret);
  error.code = 'forbidden';
  const api = createApi({ authorizer: async () => { throw error; } });
  const response = await api.handleRequest(request({
    input: {}, operation: 'getCollectionSummary', selectedTokenId: '617',
  }));
  const text = await response.text();
  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(text), {
    schema_version: '0.1.0',
    error: {
      code: 'forbidden',
      message: 'Authenticated wallet is not authorized for this Looper.',
    },
  });
  assert.equal(text.includes(secret), false);
});

test('failed ownership checks cannot exceed the 120 wallet/token authorizer budget', async () => {
  let authorizerCalls = 0;
  let runtimeCalls = 0;
  const api = createApi({
    authorizer: async () => {
      authorizerCalls += 1;
      const error = new Error('Authenticated wallet does not own this Looper.');
      error.code = 'forbidden';
      throw error;
    },
    runtime: availableRuntime(() => { runtimeCalls += 1; return {}; }),
  });
  const payload = { input: {}, operation: 'getCollectionSummary', selectedTokenId: '617' };
  for (let index = 0; index < 120; index += 1) {
    const response = await api.handleRequest(request(payload));
    assert.equal(response.status, 403, 'request ' + (index + 1));
    assert.equal((await bodyOf(response)).error.code, 'forbidden');
  }
  const limited = await api.handleRequest(request(payload));
  assert.equal(limited.status, 429);
  assert.equal((await bodyOf(limited)).error.code, 'codex_rate_limited');
  assert.equal(authorizerCalls, 120);
  assert.equal(runtimeCalls, 0);
});

test('wallet-throttled requests do not consume global ingress capacity', async () => {
  let authorizerCalls = 0;
  let queryCalls = 0;
  const api = createApi({
    authorizer: async ({ tokenId, wallet }) => {
      authorizerCalls += 1;
      return identity(tokenId, wallet);
    },
    runtime: availableRuntime(() => ({ call: ++queryCalls })),
  });
  const send = (selectedTokenId) => api.handleRequest(request({
    input: {}, operation: 'getCollectionSummary', selectedTokenId,
  }));

  for (let index = 0; index < 120; index += 1) {
    assert.equal((await send('1')).status, 200);
  }
  for (let index = 0; index < 5; index += 1) {
    const limited = await send('1');
    assert.equal(limited.status, 429);
    assert.equal((await bodyOf(limited)).error.code, 'codex_rate_limited');
  }
  for (let tokenId = 2; tokenId <= 1_081; tokenId += 1) {
    assert.equal((await send(String(tokenId))).status, 200, 'token ' + tokenId);
  }
  const globallyLimited = await send('1082');
  assert.equal(globallyLimited.status, 429);
  assert.equal((await bodyOf(globallyLimited)).error.code, 'codex_global_rate_limited');
  assert.equal(authorizerCalls, 1_200);
  assert.equal(queryCalls, 1_200);
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

test('Codex query applies exactly 1,200 total requests per minute before authorization', async () => {
  let queryCalls = 0;
  let authorizerCalls = 0;
  const api = createApi({
    runtime: availableRuntime(() => ({ call: ++queryCalls })),
    authorizer: async ({ tokenId, wallet }) => {
      authorizerCalls += 1;
      return identity(tokenId, wallet);
    },
  });
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
  assert.equal(authorizerCalls, 1_200);
});

test('Codex wallet buckets reset, sweep expired entries, and never evict active quota state', async () => {
  let now = 1_000;
  let authorizerCalls = 0;
  const api = createApi({
    consoleCodexRateLimitNow: () => now,
    consoleCodexWalletMaxBuckets: 2,
    authorizer: async ({ tokenId, wallet }) => {
      authorizerCalls += 1;
      return identity(tokenId, wallet);
    },
  });
  const send = (selectedTokenId) => api.handleRequest(request({
    input: {}, operation: 'getCollectionSummary', selectedTokenId,
  }));

  for (let index = 0; index < 120; index += 1) {
    assert.equal((await send('1')).status, 200);
  }
  assert.equal((await send('2')).status, 200);

  const atCapacity = await send('3');
  assert.equal(atCapacity.status, 429);
  assert.equal((await bodyOf(atCapacity)).error.code, 'codex_rate_limited');
  assert.equal(authorizerCalls, 121);

  const stillLimited = await send('1');
  assert.equal(stillLimited.status, 429);
  assert.equal(authorizerCalls, 121);

  now += 60_000;
  assert.equal((await send('3')).status, 200);
  assert.equal((await send('1')).status, 200);
  assert.equal(authorizerCalls, 123);
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
